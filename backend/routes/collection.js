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

// Helper: Check if user has any active job that is NOT ready to collect
async function hasActiveJob(userId) {
  const now = new Date().toISOString();
  
  // Check collection jobs - only if not yet completed
  const collectionJob = await db.get(
    "SELECT id FROM collection_jobs WHERE user_id = ? AND status IN ('active', 'paused') AND completed_at > ?",
    [userId, now]
  );
  if (collectionJob) return { active: true, type: 'Sammel-Auftrag' };
  
  // Check building jobs - only if not yet completed
  const buildingJob = await db.get(
    "SELECT id FROM building_jobs WHERE user_id = ? AND status IN ('active', 'paused') AND completed_at > ?",
    [userId, now]
  );
  if (buildingJob) return { active: true, type: 'Bau-/Upgrade-Auftrag' };
  
  // Check crafting jobs - only if not yet finished
  const craftingJob = await db.get(
    "SELECT id, finish_at, paused_at FROM crafting_jobs WHERE user_id = ? AND is_completed = 0",
    [userId]
  );
  if (craftingJob) {
    if (craftingJob.paused_at) {
      return { active: true, type: 'Herstellungs-Auftrag (pausiert)' };
    }
    if (new Date(craftingJob.finish_at) > new Date()) {
      return { active: true, type: 'Herstellungs-Auftrag' };
    }
  }
  
  return { active: false };
}

// Start collection job
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { duration_minutes } = req.body;

    if (!duration_minutes || duration_minutes < 5 || duration_minutes > 480) {
      return res.status(400).json({ 
        error: 'Dauer muss zwischen 5 Minuten und 8 Stunden (480 Minuten) liegen' 
      });
    }

    // Check if user has ANY active job
    const jobCheck = await hasActiveJob(req.user.id);
    if (jobCheck.active) {
      return res.status(400).json({ 
        error: `Du hast bereits einen aktiven ${jobCheck.type}. Schließe ihn zuerst ab!`,
        hasActiveJob: true
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

// Helper: Check if user is at home
async function isUserAtHome(userId) {
  const user = await db.get('SELECT world_x, world_y, home_x, home_y FROM users WHERE id = ?', [userId]);
  if (!user) return false;
  const homeX = user.home_x ?? 0;
  const homeY = user.home_y ?? 0;
  const distance = Math.sqrt(
    Math.pow((user.world_x || 0) - homeX, 2) + 
    Math.pow((user.world_y || 0) - homeY, 2)
  );
  return distance <= 50;
}

// Get active collection job status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    // Check for active OR paused job
    let job = await db.get(`
      SELECT 
        id,
        duration_minutes,
        started_at,
        completed_at,
        status,
        paused_at,
        remaining_seconds
      FROM collection_jobs
      WHERE user_id = ? AND status IN ('active', 'paused')
      ORDER BY started_at DESC
      LIMIT 1
    `, [req.user.id]);

    if (!job) {
      return res.json({ active: false });
    }

    const now = new Date();
    const atHome = await isUserAtHome(req.user.id);

    // Resume paused job if user is at home
    if (job.status === 'paused' && atHome && job.remaining_seconds) {
      const newCompletedAt = new Date(now.getTime() + job.remaining_seconds * 1000);
      await db.run(`
        UPDATE collection_jobs 
        SET status = 'active', paused_at = NULL, remaining_seconds = NULL, completed_at = ?
        WHERE id = ?
      `, [newCompletedAt.toISOString(), job.id]);
      job.status = 'active';
      job.completed_at = newCompletedAt.toISOString();
      job.paused_at = null;
    }

    // Pause active job if user left home
    if (job.status === 'active' && !atHome) {
      const completedAt = new Date(job.completed_at);
      const remainingMs = Math.max(0, completedAt.getTime() - now.getTime());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      await db.run(`
        UPDATE collection_jobs 
        SET status = 'paused', paused_at = ?, remaining_seconds = ?
        WHERE id = ?
      `, [now.toISOString(), remainingSeconds, job.id]);
      job.status = 'paused';
      job.paused_at = now.toISOString();
      job.remaining_seconds = remainingSeconds;
    }

    const completedAt = new Date(job.completed_at);
    const startedAt = new Date(job.started_at);
    
    let isCompleted = false;
    let timeRemaining = 0;

    if (job.status === 'paused') {
      timeRemaining = Math.ceil(job.remaining_seconds / 60);
    } else {
      isCompleted = now >= completedAt;
      timeRemaining = Math.max(0, Math.floor((completedAt - now) / 1000 / 60));
    }

    const elapsedMinutes = Math.floor((now - startedAt) / 1000 / 60);

    res.json({
      active: true,
      job_id: job.id,
      duration_minutes: job.duration_minutes,
      started_at: job.started_at,
      completed_at: job.completed_at,
      elapsed_minutes: elapsedMinutes,
      is_completed: isCompleted,
      time_remaining_minutes: timeRemaining,
      is_paused: job.status === 'paused',
      remaining_seconds: job.remaining_seconds,
      server_restart_safe: true
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
