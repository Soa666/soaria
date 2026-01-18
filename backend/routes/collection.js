import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Rarity weights for collection (höhere Werte = häufiger)
const RARITY_WEIGHTS = {
  common: 50,
  uncommon: 25,
  rare: 15,
  epic: 7,
  legendary: 3
};

// Start collection job
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { duration_minutes } = req.body;

    if (!duration_minutes || duration_minutes < 5 || duration_minutes > 480) {
      return res.status(400).json({ 
        error: 'Dauer muss zwischen 5 Minuten und 8 Stunden (480 Minuten) liegen' 
      });
    }

    // Check if user has active collection job
    const activeJob = await db.get(`
      SELECT id FROM collection_jobs 
      WHERE user_id = ? AND status = 'active'
    `, [req.user.id]);

    if (activeJob) {
      return res.status(400).json({ 
        error: 'Du hast bereits einen aktiven Sammel-Auftrag. Hole ihn zuerst ab!' 
      });
    }

    // Calculate completion time
    const startedAt = new Date();
    const completedAt = new Date(startedAt.getTime() + duration_minutes * 60 * 1000);

    // Create collection job
    const result = await db.run(`
      INSERT INTO collection_jobs (user_id, duration_minutes, started_at, completed_at, status)
      VALUES (?, ?, ?, ?, 'active')
    `, [req.user.id, duration_minutes, startedAt.toISOString(), completedAt.toISOString()]);

    res.json({
      message: `Sammel-Auftrag gestartet! Fertig in ${duration_minutes} Minuten.`,
      job_id: result.lastID,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_minutes
    });
  } catch (error) {
    console.error('Start collection error:', error);
    res.status(500).json({ error: 'Serverfehler beim Starten des Sammel-Auftrags' });
  }
});

// Get active collection job status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const job = await db.get(`
      SELECT 
        id,
        duration_minutes,
        started_at,
        completed_at,
        status
      FROM collection_jobs
      WHERE user_id = ? AND status = 'active'
      ORDER BY started_at DESC
      LIMIT 1
    `, [req.user.id]);

    if (!job) {
      return res.json({ active: false });
    }

    const now = new Date();
    const completedAt = new Date(job.completed_at);
    const startedAt = new Date(job.started_at);
    
    // Calculate elapsed time (in case server was down)
    const elapsedMinutes = Math.floor((now - startedAt) / 1000 / 60);
    const isCompleted = now >= completedAt;
    const timeRemaining = Math.max(0, Math.floor((completedAt - now) / 1000 / 60));

    // Note: Die Zeit läuft weiter, auch wenn der Server abstürzt,
    // weil completed_at in der Datenbank gespeichert ist

    res.json({
      active: true,
      job_id: job.id,
      duration_minutes: job.duration_minutes,
      started_at: job.started_at,
      completed_at: job.completed_at,
      elapsed_minutes: elapsedMinutes,
      is_completed: isCompleted,
      time_remaining_minutes: timeRemaining,
      server_restart_safe: true // Zeit läuft auch bei Server-Absturz weiter
    });
  } catch (error) {
    console.error('Get collection status error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Claim collection results
router.post('/claim', authenticateToken, async (req, res) => {
  try {
    // Get active job
    const job = await db.get(`
      SELECT id, duration_minutes, completed_at, status
      FROM collection_jobs
      WHERE user_id = ? AND status = 'active'
      ORDER BY started_at DESC
      LIMIT 1
    `, [req.user.id]);

    if (!job) {
      return res.status(400).json({ error: 'Kein aktiver Sammel-Auftrag gefunden' });
    }

    const now = new Date();
    const completedAt = new Date(job.completed_at);

    if (now < completedAt) {
      const timeRemaining = Math.ceil((completedAt - now) / 1000 / 60);
      return res.status(400).json({ 
        error: `Sammel-Auftrag noch nicht fertig. Noch ${timeRemaining} Minuten.` 
      });
    }

    // Check if already claimed
    if (job.status === 'claimed') {
      return res.status(400).json({ error: 'Sammel-Auftrag wurde bereits abgeholt' });
    }

    // Generate collection results
    const durationMinutes = job.duration_minutes || 5; // Fallback if missing
    console.log(`[CLAIM] Starting claim for job ${job.id}, duration: ${durationMinutes} minutes`);
    const results = await generateCollectionResults(job.id, durationMinutes);

    console.log(`[CLAIM] Generated ${results.length} result types for job ${job.id}`);
    console.log(`[CLAIM] Results:`, JSON.stringify(results, null, 2));

    if (results.length === 0) {
      console.error('[CLAIM] No results generated! This should not happen.');
      return res.status(500).json({ error: 'Keine Items generiert. Bitte versuche es erneut.' });
    }

    // Add items to inventory
    for (const result of results) {
      console.log(`[CLAIM] Adding ${result.quantity}x item ${result.item_id} to inventory for user ${req.user.id}`);
      try {
        await db.run(`
          INSERT INTO user_inventory (user_id, item_id, quantity)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + ?
        `, [req.user.id, result.item_id, result.quantity, result.quantity]);

        // Save to job results
        await db.run(`
          INSERT INTO collection_job_results (job_id, item_id, quantity)
          VALUES (?, ?, ?)
        `, [job.id, result.item_id, result.quantity]);
        console.log(`[CLAIM] Successfully added item ${result.item_id} to inventory and job results`);
      } catch (error) {
        console.error(`[CLAIM] Error adding item ${result.item_id}:`, error);
      }
    }

    // Mark job as claimed
    await db.run(`
      UPDATE collection_jobs 
      SET status = 'claimed' 
      WHERE id = ?
    `, [job.id]);

    // Get item names for response
    const itemsWithNames = await Promise.all(
      results.map(async (result) => {
        const item = await db.get('SELECT display_name, rarity, image_path FROM items WHERE id = ?', [result.item_id]);
        console.log(`[CLAIM] Item ${result.item_id} (${item?.display_name}): image_path = ${item?.image_path}`);
        return {
          ...result,
          display_name: item?.display_name || 'Unbekannt',
          rarity: item?.rarity || 'common',
          image_path: item?.image_path || null
        };
      })
    );
    
    console.log(`[CLAIM] Final itemsWithNames:`, JSON.stringify(itemsWithNames, null, 2));

    res.json({
      message: 'Sammel-Auftrag erfolgreich abgeholt!',
      items: itemsWithNames,
      total_items: results.reduce((sum, r) => sum + r.quantity, 0)
    });
  } catch (error) {
    console.error('Claim collection error:', error);
    res.status(500).json({ error: 'Serverfehler beim Abholen' });
  }
});

// Generate collection results based on duration and rarity
async function generateCollectionResults(jobId, durationMinutes) {
  // Ensure durationMinutes is a valid number
  const duration = parseInt(durationMinutes) || 5;
  console.log(`[GENERATE] Function called with durationMinutes: ${durationMinutes}, parsed: ${duration}`);
  
  // Base collection rate: items per hour
  const itemsPerHour = 10; // 10 Items pro Stunde
  // Calculate items, but ensure minimum based on duration
  let totalItems = Math.floor((duration / 60) * itemsPerHour);
  // Minimum items: at least 2 for 5-15 min, 3 for 30+ min, etc.
  if (duration <= 15) {
    totalItems = Math.max(2, totalItems);
  } else if (duration <= 30) {
    totalItems = Math.max(3, totalItems);
  } else {
    totalItems = Math.max(5, totalItems);
  }
  
  console.log(`[GENERATE] Generating ${totalItems} items for ${duration} minutes`);
  
  // Get all resource items
  const resourceItems = await db.all(`
    SELECT id, name, rarity FROM items WHERE type = 'resource'
  `);

  console.log(`Found ${resourceItems.length} resource items`);

  if (resourceItems.length === 0) {
    console.error('No resource items found in database!');
    return [];
  }

  // Calculate total weight
  const totalWeight = resourceItems.reduce((sum, item) => {
    return sum + (RARITY_WEIGHTS[item.rarity] || 10);
  }, 0);

  console.log(`Total weight: ${totalWeight}`);

  // Generate items based on weighted random
  const itemCounts = {};

  console.log(`[GENERATE] Starting to generate ${totalItems} items`);
  console.log(`[GENERATE] Resource items available:`, resourceItems.map(i => `${i.name} (${i.rarity})`).join(', '));

  if (totalItems <= 0 || isNaN(totalItems)) {
    console.error(`[GENERATE] ERROR: Invalid totalItems: ${totalItems}`);
    return [];
  }

  for (let i = 0; i < totalItems; i++) {
    // Weighted random selection
    let random = Math.random() * totalWeight;
    let selectedItem = null;

    for (const item of resourceItems) {
      const weight = RARITY_WEIGHTS[item.rarity] || 10;
      random -= weight;
      if (random <= 0) {
        selectedItem = item;
        break;
      }
    }

    // Fallback: if no item selected (shouldn't happen), select first item
    if (!selectedItem && resourceItems.length > 0) {
      console.log(`[GENERATE] WARNING: No item selected in iteration ${i}, using fallback`);
      selectedItem = resourceItems[0];
    }

    if (selectedItem) {
      if (!itemCounts[selectedItem.id]) {
        itemCounts[selectedItem.id] = 0;
      }
      itemCounts[selectedItem.id]++;
    } else {
      console.error(`[GENERATE] ERROR: No item selected and no fallback available in iteration ${i}`);
      // Force select first item as emergency fallback
      if (resourceItems.length > 0) {
        const emergencyItem = resourceItems[0];
        if (!itemCounts[emergencyItem.id]) {
          itemCounts[emergencyItem.id] = 0;
        }
        itemCounts[emergencyItem.id]++;
      }
    }
  }

  console.log(`[GENERATE] Final itemCounts:`, JSON.stringify(itemCounts, null, 2));

  console.log('Item counts:', itemCounts);

  // Convert to array format
  const results = [];
  for (const [itemId, quantity] of Object.entries(itemCounts)) {
    results.push({
      item_id: parseInt(itemId),
      quantity: quantity
    });
  }

  console.log(`[GENERATE] Generated ${results.length} different item types, total ${totalItems} items`);
  console.log(`[GENERATE] Results array:`, JSON.stringify(results, null, 2));
  
  if (results.length === 0 && totalItems > 0) {
    console.error(`[GENERATE] ERROR: totalItems was ${totalItems} but results array is empty!`);
    console.error(`[GENERATE] itemCounts:`, JSON.stringify(itemCounts, null, 2));
  }
  
  return results;
}

export default router;
