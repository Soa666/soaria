import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { sendSystemMessage } from './messages.js';

const router = express.Router();

// Get all players with their coordinates (for map view)
router.get('/players', authenticateToken, async (req, res) => {
  try {
    const players = await db.all(`
      SELECT 
        id,
        username,
        world_x,
        world_y,
        home_x,
        home_y,
        avatar_path,
        role,
        created_at
      FROM users
      WHERE username != 'System'
      ORDER BY username
    `);

    res.json({ players });
  } catch (error) {
    console.error('Get players error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Spieler' });
  }
});

// Get all player homes (for map display of houses)
router.get('/homes', authenticateToken, async (req, res) => {
  try {
    const homes = await db.all(`
      SELECT 
        id,
        username,
        home_x,
        home_y
      FROM users
      WHERE home_x IS NOT NULL AND home_y IS NOT NULL
        AND username != 'System'
      ORDER BY username
    `);

    res.json({ homes });
  } catch (error) {
    console.error('Get homes error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Grundstücke' });
  }
});

// Get players in a specific area (for map viewport)
router.get('/players/area', authenticateToken, async (req, res) => {
  try {
    const { minX, maxX, minY, maxY } = req.query;
    
    if (!minX || !maxX || !minY || !maxY) {
      return res.status(400).json({ error: 'Koordinaten-Bereich erforderlich' });
    }

    const players = await db.all(`
      SELECT 
        id,
        username,
        world_x,
        world_y,
        avatar_path,
        role
      FROM users
      WHERE world_x >= ? AND world_x <= ? 
        AND world_y >= ? AND world_y <= ?
        AND (world_x != 0 OR world_y != 0)
      ORDER BY username
    `, [parseInt(minX), parseInt(maxX), parseInt(minY), parseInt(maxY)]);

    res.json({ players });
  } catch (error) {
    console.error('Get players in area error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Spieler' });
  }
});

// Get nearby players (within a certain distance)
router.get('/players/nearby', authenticateToken, async (req, res) => {
  try {
    const { distance = 500 } = req.query;
    const dist = parseInt(distance);

    // Get current user's coordinates
    const user = await db.get(
      'SELECT world_x, world_y FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user || (user.world_x === 0 && user.world_y === 0)) {
      return res.status(400).json({ error: 'Spieler hat keine Koordinaten' });
    }

    const players = await db.all(`
      SELECT 
        id,
        username,
        world_x,
        world_y,
        avatar_path,
        role,
        (
          (world_x - ?) * (world_x - ?) + 
          (world_y - ?) * (world_y - ?)
        ) as distance_squared
      FROM users
      WHERE id != ?
        AND (world_x != 0 OR world_y != 0)
        AND (
          (world_x - ?) * (world_x - ?) + 
          (world_y - ?) * (world_y - ?)
        ) <= ?
      ORDER BY distance_squared
      LIMIT 50
    `, [user.world_x, user.world_x, user.world_y, user.world_y, req.user.id, user.world_x, user.world_x, user.world_y, user.world_y, dist * dist]);

    // Calculate actual distance
    const playersWithDistance = players.map(p => ({
      ...p,
      distance: Math.sqrt(p.distance_squared)
    }));

    res.json({ players: playersWithDistance });
  } catch (error) {
    console.error('Get nearby players error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der nahen Spieler' });
  }
});

// Terrain generation functions (same as frontend for validation)
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function smoothstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function gradientNoise(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  
  const fx = x - x0;
  const fy = y - y0;
  
  const sx = smoothstep(fx);
  const sy = smoothstep(fy);
  
  const n00 = seededRandom(x0 * 374761393 + y0 * 668265263 + seed);
  const n10 = seededRandom(x1 * 374761393 + y0 * 668265263 + seed);
  const n01 = seededRandom(x0 * 374761393 + y1 * 668265263 + seed);
  const n11 = seededRandom(x1 * 374761393 + y1 * 668265263 + seed);
  
  const nx0 = n00 * (1 - sx) + n10 * sx;
  const nx1 = n01 * (1 - sx) + n11 * sx;
  
  return nx0 * (1 - sy) + nx1 * sy;
}

function fractalNoise(x, y, octaves = 4, persistence = 0.5, scale = 0.01, seed = 0) {
  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxValue = 0;
  
  for (let i = 0; i < octaves; i++) {
    value += amplitude * gradientNoise(x * frequency, y * frequency, seed + i * 1000);
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  
  return value / maxValue;
}

function isWaterAt(worldX, worldY) {
  const continent = fractalNoise(worldX, worldY, 4, 0.5, 0.002, 0);
  const elevation = fractalNoise(worldX, worldY, 5, 0.5, 0.006, 10000);
  const height = continent * 0.5 + elevation * 0.5;
  
  // Ocean - only at very low continent values
  if (continent < 0.2) return true;
  
  // Small lakes - rare
  if (height < 0.28 && continent > 0.25 && continent < 0.35 && elevation < 0.3) return true;
  
  // Rivers - thin winding paths
  const riverBase = fractalNoise(worldX, worldY, 3, 0.6, 0.003, 77777);
  const riverWind = Math.sin(worldX * 0.004 + riverBase * 3) * 0.5 + 
                    Math.cos(worldY * 0.004 + riverBase * 3) * 0.5;
  const riverValue = Math.abs(riverWind + fractalNoise(worldX, worldY, 2, 0.5, 0.008, 88888) * 0.2);
  
  if (riverValue < 0.04 && height > 0.35 && height < 0.7 && continent > 0.3) return true;
  
  return false;
}

// Update player coordinates (for future movement system)
// Travel speed: units per minute
const TRAVEL_SPEED_LAND = 50;  // 50 units per minute on land
const TRAVEL_SPEED_WATER = 80; // 80 units per minute with boat (faster)

// Calculate travel time in minutes
function calculateTravelTime(fromX, fromY, toX, toY, hasBoat, targetIsWater) {
  const distance = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
  const speed = targetIsWater && hasBoat ? TRAVEL_SPEED_WATER : TRAVEL_SPEED_LAND;
  return Math.max(1, Math.ceil(distance / speed)); // Minimum 1 minute
}

// Format minutes to readable time
function formatTravelTime(minutes) {
  if (minutes < 60) {
    return `${minutes} Minute${minutes !== 1 ? 'n' : ''}`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours} Stunde${hours !== 1 ? 'n' : ''}`;
  }
  return `${hours} Std. ${mins} Min.`;
}

// Get current travel status
router.get('/travel/status', authenticateToken, async (req, res) => {
  try {
    const user = await db.get(`
      SELECT world_x, world_y, travel_target_x, travel_target_y, travel_start_time, travel_end_time
      FROM users WHERE id = ?
    `, [req.user.id]);

    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    // Check if currently traveling
    if (user.travel_end_time) {
      const now = new Date();
      const endTime = new Date(user.travel_end_time);
      
      if (now >= endTime) {
        // Travel complete - update position
        await db.run(`
          UPDATE users 
          SET world_x = travel_target_x, 
              world_y = travel_target_y,
              travel_target_x = NULL,
              travel_target_y = NULL,
              travel_start_time = NULL,
              travel_end_time = NULL
          WHERE id = ?
        `, [req.user.id]);

        return res.json({
          traveling: false,
          arrived: true,
          world_x: user.travel_target_x,
          world_y: user.travel_target_y,
          message: 'Du bist angekommen!'
        });
      } else {
        // Still traveling
        const remainingMs = endTime - now;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        const totalMs = endTime - new Date(user.travel_start_time);
        const elapsedMs = now - new Date(user.travel_start_time);
        const progress = Math.min(100, Math.floor((elapsedMs / totalMs) * 100));

        return res.json({
          traveling: true,
          from: { x: user.world_x, y: user.world_y },
          to: { x: user.travel_target_x, y: user.travel_target_y },
          startTime: user.travel_start_time,
          endTime: user.travel_end_time,
          remainingMinutes,
          remainingTime: formatTravelTime(remainingMinutes),
          progress
        });
      }
    }

    res.json({
      traveling: false,
      world_x: user.world_x,
      world_y: user.world_y
    });
  } catch (error) {
    console.error('Travel status error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Cancel travel
router.post('/travel/cancel', authenticateToken, async (req, res) => {
  try {
    const user = await db.get(`
      SELECT world_x, world_y, travel_target_x, travel_target_y, travel_start_time, travel_end_time
      FROM users WHERE id = ?
    `, [req.user.id]);

    if (!user || !user.travel_end_time) {
      return res.status(400).json({ error: 'Du bist gerade nicht unterwegs' });
    }

    // Calculate current position based on travel progress
    const now = Date.now();
    const startTime = new Date(user.travel_start_time).getTime();
    const endTime = new Date(user.travel_end_time).getTime();
    const totalDuration = endTime - startTime;
    const elapsed = now - startTime;
    const progress = Math.min(1, Math.max(0, elapsed / totalDuration));

    // Interpolate position
    const startX = user.world_x;
    const startY = user.world_y;
    const targetX = user.travel_target_x;
    const targetY = user.travel_target_y;
    
    const currentX = Math.round(startX + (targetX - startX) * progress);
    const currentY = Math.round(startY + (targetY - startY) * progress);

    // Cancel travel and update position to current progress
    await db.run(`
      UPDATE users 
      SET world_x = ?,
          world_y = ?,
          travel_target_x = NULL,
          travel_target_y = NULL,
          travel_start_time = NULL,
          travel_end_time = NULL
      WHERE id = ?
    `, [currentX, currentY, req.user.id]);

    res.json({ 
      message: 'Reise abgebrochen.',
      new_x: currentX,
      new_y: currentY
    });
  } catch (error) {
    console.error('Cancel travel error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Start traveling to coordinates
router.put('/coordinates', authenticateToken, async (req, res) => {
  try {
    const { world_x, world_y } = req.body;

    if (world_x === undefined || world_y === undefined) {
      return res.status(400).json({ error: 'Koordinaten erforderlich' });
    }

    // Check if coordinates are within bounds
    if (Math.abs(world_x) > 5000 || Math.abs(world_y) > 5000) {
      return res.status(400).json({ error: 'Koordinaten außerhalb des erlaubten Bereichs' });
    }

    const targetX = parseInt(world_x);
    const targetY = parseInt(world_y);

    // Get current user data
    const user = await db.get(`
      SELECT world_x, world_y, travel_end_time
      FROM users WHERE id = ?
    `, [req.user.id]);

    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    // Check if already traveling
    if (user.travel_end_time && new Date(user.travel_end_time) > new Date()) {
      return res.status(400).json({ 
        error: 'Du bist bereits unterwegs! Warte bis du ankommst oder brich die Reise ab.',
        alreadyTraveling: true
      });
    }

    // Check if user has active collection job
    const activeCollectionJob = await db.get(`
      SELECT id FROM collection_jobs 
      WHERE user_id = ? AND status = 'active'
    `, [req.user.id]);

    if (activeCollectionJob) {
      return res.status(400).json({ 
        error: 'Du kannst nicht loslaufen während du sammelst! Hole den Auftrag zuerst ab oder brich ihn ab.',
        isCollecting: true
      });
    }

    // Check if user has active building job
    const activeBuildingJob = await db.get(`
      SELECT id FROM building_jobs 
      WHERE user_id = ? AND status = 'active'
    `, [req.user.id]);

    if (activeBuildingJob) {
      return res.status(400).json({ 
        error: 'Du kannst nicht loslaufen während du baust! Warte bis der Bau fertig ist.',
        isBuilding: true
      });
    }

    // Check if user has active crafting job
    const activeCraftingJob = await db.get(`
      SELECT id FROM crafting_jobs 
      WHERE user_id = ? AND is_completed = 0
    `, [req.user.id]);

    if (activeCraftingJob) {
      return res.status(400).json({ 
        error: 'Du kannst nicht loslaufen während du etwas herstellst! Hole das Item zuerst ab oder brich ab.',
        isCrafting: true
      });
    }

    // Check if already at target
    if (user.world_x === targetX && user.world_y === targetY) {
      return res.status(400).json({ error: 'Du bist bereits an diesem Ort!' });
    }

    // Check if target is water
    const targetIsWater = isWaterAt(targetX, targetY);
    
    // Check if player has a boat
    const hasBoat = await db.get(`
      SELECT ui.quantity FROM user_inventory ui
      JOIN items i ON ui.item_id = i.id
      WHERE ui.user_id = ? AND i.name = 'boot' AND ui.quantity > 0
    `, [req.user.id]);
    
    if (targetIsWater && !hasBoat) {
      return res.status(400).json({ 
        error: 'Du brauchst ein Boot um aufs Wasser zu gehen! Baue oder kaufe ein Boot.',
        needsBoat: true
      });
    }

    // Calculate travel time
    const travelMinutes = calculateTravelTime(
      user.world_x, user.world_y, 
      targetX, targetY, 
      !!hasBoat, targetIsWater
    );

    const now = new Date();
    const endTime = new Date(now.getTime() + travelMinutes * 60000);

    // Set travel destination
    await db.run(`
      UPDATE users 
      SET travel_target_x = ?,
          travel_target_y = ?,
          travel_start_time = ?,
          travel_end_time = ?
      WHERE id = ?
    `, [targetX, targetY, now.toISOString(), endTime.toISOString(), req.user.id]);

    const distance = Math.round(Math.sqrt(
      Math.pow(targetX - user.world_x, 2) + 
      Math.pow(targetY - user.world_y, 2)
    ));

    res.json({ 
      message: `Du machst dich auf den Weg! Reisezeit: ${formatTravelTime(travelMinutes)}`,
      traveling: true,
      from: { x: user.world_x, y: user.world_y },
      to: { x: targetX, y: targetY },
      distance,
      travelMinutes,
      travelTime: formatTravelTime(travelMinutes),
      endTime: endTime.toISOString(),
      onWater: targetIsWater
    });
  } catch (error) {
    console.error('Update coordinates error:', error);
    res.status(500).json({ error: 'Serverfehler beim Starten der Reise' });
  }
});

// Quick travel home (to player's Grundstück)
router.post('/travel/home', authenticateToken, async (req, res) => {
  try {
    const user = await db.get(`
      SELECT world_x, world_y, home_x, home_y, travel_end_time
      FROM users WHERE id = ?
    `, [req.user.id]);

    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    // Get home coordinates (fallback to current position if not set)
    const homeX = user.home_x ?? user.world_x;
    const homeY = user.home_y ?? user.world_y;

    // Check if already traveling
    if (user.travel_end_time && new Date(user.travel_end_time) > new Date()) {
      return res.status(400).json({ 
        error: 'Du bist bereits unterwegs! Warte bis du ankommst oder brich die Reise ab.',
        alreadyTraveling: true
      });
    }

    // Check if already home
    const distanceFromHome = Math.sqrt(Math.pow(user.world_x - homeX, 2) + Math.pow(user.world_y - homeY, 2));
    if (distanceFromHome < 10) {
      return res.status(400).json({ error: 'Du bist bereits zu Hause!' });
    }

    // Calculate travel time to home
    const travelMinutes = calculateTravelTime(user.world_x, user.world_y, homeX, homeY, false, false);

    const now = new Date();
    const endTime = new Date(now.getTime() + travelMinutes * 60000);

    // Set travel destination to home
    await db.run(`
      UPDATE users 
      SET travel_target_x = ?,
          travel_target_y = ?,
          travel_start_time = ?,
          travel_end_time = ?
      WHERE id = ?
    `, [homeX, homeY, now.toISOString(), endTime.toISOString(), req.user.id]);

    const distance = Math.round(distanceFromHome);

    res.json({ 
      message: `Du machst dich auf den Heimweg! Reisezeit: ${formatTravelTime(travelMinutes)}`,
      traveling: true,
      from: { x: user.world_x, y: user.world_y },
      to: { x: homeX, y: homeY },
      distance,
      travelMinutes,
      travelTime: formatTravelTime(travelMinutes),
      endTime: endTime.toISOString()
    });
  } catch (error) {
    console.error('Travel home error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Attack another player
router.post('/attack', authenticateToken, async (req, res) => {
  try {
    const { target_user_id } = req.body;

    if (!target_user_id) {
      return res.status(400).json({ error: 'Ziel-Spieler-ID erforderlich' });
    }

    if (target_user_id === req.user.id) {
      return res.status(400).json({ error: 'Du kannst dich nicht selbst angreifen' });
    }

    // Get attacker and target coordinates
    const attacker = await db.get(
      'SELECT world_x, world_y FROM users WHERE id = ?',
      [req.user.id]
    );

    const target = await db.get(
      'SELECT id, username, world_x, world_y FROM users WHERE id = ?',
      [target_user_id]
    );

    if (!attacker || !target) {
      return res.status(404).json({ error: 'Spieler nicht gefunden' });
    }

    // Check distance (max 100 units)
    const distance = Math.sqrt(
      Math.pow(attacker.world_x - target.world_x, 2) +
      Math.pow(attacker.world_y - target.world_y, 2)
    );

    if (distance > 100) {
      return res.status(400).json({ error: 'Ziel ist zu weit entfernt (Max: 100 Einheiten)' });
    }

    // Check for guild pact (non-aggression pact)
    const attackerGuild = await db.get(
      'SELECT guild_id FROM guild_members WHERE user_id = ?',
      [req.user.id]
    );
    const targetGuild = await db.get(
      'SELECT guild_id FROM guild_members WHERE user_id = ?',
      [target_user_id]
    );

    // If both are in guilds, check for pact
    if (attackerGuild && targetGuild) {
      // Same guild - can't attack
      if (attackerGuild.guild_id === targetGuild.guild_id) {
        return res.status(400).json({ error: 'Du kannst keine Gildenmitglieder angreifen!' });
      }

      // Check for active pact between guilds
      const pact = await db.get(`
        SELECT id FROM guild_pacts 
        WHERE ((guild_1_id = ? AND guild_2_id = ?) OR (guild_1_id = ? AND guild_2_id = ?))
          AND status = 'active'
      `, [attackerGuild.guild_id, targetGuild.guild_id, targetGuild.guild_id, attackerGuild.guild_id]);

      if (pact) {
        return res.status(400).json({ 
          error: 'Ein Nichtangriffspakt verhindert den Angriff! Eure Gilden haben einen aktiven Pakt.' 
        });
      }
    }

    // Simple attack system - steal random items
    const targetInventory = await db.all(`
      SELECT ui.item_id, ui.quantity, i.display_name, i.name
      FROM user_inventory ui
      JOIN items i ON ui.item_id = i.id
      WHERE ui.user_id = ? AND ui.quantity > 0
      ORDER BY RANDOM()
      LIMIT 3
    `, [target_user_id]);

    // Get attacker username for messages
    const attackerUser = await db.get('SELECT username FROM users WHERE id = ?', [req.user.id]);
    const attackTime = new Date().toLocaleString('de-DE');

    if (targetInventory.length === 0) {
      // Send notification to target (even if no items stolen)
      await sendSystemMessage(
        target_user_id,
        `⚔️ Angriffsversuch!`,
        `${attackerUser.username} hat versucht dich anzugreifen!\n\n📅 Zeitpunkt: ${attackTime}\n📍 Position des Angreifers: (${attacker.world_x}, ${attacker.world_y})\n\nDu hattest keine Items, die gestohlen werden konnten.`,
        'attack_received',
        req.user.id
      );

      // Send notification to attacker
      await sendSystemMessage(
        req.user.id,
        `⚔️ Angriff fehlgeschlagen`,
        `Dein Angriff auf ${target.username} war erfolglos!\n\n📅 Zeitpunkt: ${attackTime}\n📍 Position: (${target.world_x}, ${target.world_y})\n\n${target.username} hatte keine Items, die du stehlen konntest.`,
        'attack_sent',
        target_user_id
      );

      return res.json({ 
        message: `Du hast ${target.username} angegriffen, aber er hatte keine Items!`,
        stolen_items: []
      });
    }

    // Steal random items (10-30% of quantity)
    const stolenItems = [];
    for (const item of targetInventory) {
      const stealAmount = Math.max(1, Math.floor(item.quantity * (0.1 + Math.random() * 0.2)));
      const actualSteal = Math.min(stealAmount, item.quantity);

      // Remove from target
      await db.run(
        'UPDATE user_inventory SET quantity = quantity - ? WHERE user_id = ? AND item_id = ?',
        [actualSteal, target_user_id, item.item_id]
      );

      // Add to attacker
      await db.run(`
        INSERT INTO user_inventory (user_id, item_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + ?
      `, [req.user.id, item.item_id, actualSteal, actualSteal]);

      // Remove if quantity is 0
      await db.run(
        'DELETE FROM user_inventory WHERE user_id = ? AND item_id = ? AND quantity <= 0',
        [target_user_id, item.item_id]
      );

      stolenItems.push({
        name: item.display_name,
        quantity: actualSteal
      });
    }

    // Format stolen items list
    const stolenItemsList = stolenItems.map(i => `• ${i.quantity}x ${i.name}`).join('\n');
    
    // Send attack notification to TARGET (victim)
    await sendSystemMessage(
      target_user_id,
      `⚔️ Du wurdest überfallen!`,
      `${attackerUser.username} hat dich angegriffen und beraubt!\n\n📅 Zeitpunkt: ${attackTime}\n📍 Position des Angreifers: (${attacker.world_x}, ${attacker.world_y})\n\n🎒 Gestohlene Items:\n${stolenItemsList}`,
      'attack_received',
      req.user.id
    );

    // Send attack notification to ATTACKER (confirmation)
    await sendSystemMessage(
      req.user.id,
      `⚔️ Überfall erfolgreich!`,
      `Dein Angriff auf ${target.username} war erfolgreich!\n\n📅 Zeitpunkt: ${attackTime}\n📍 Position: (${target.world_x}, ${target.world_y})\n\n🎒 Erbeutete Items:\n${stolenItemsList}`,
      'attack_sent',
      target_user_id
    );

    res.json({
      message: `Du hast ${target.username} erfolgreich angegriffen und Items erbeutet!`,
      stolen_items: stolenItems
    });
  } catch (error) {
    console.error('Attack error:', error);
    res.status(500).json({ error: 'Serverfehler beim Angriff' });
  }
});

// Trade with another player
router.post('/trade/initiate', authenticateToken, async (req, res) => {
  try {
    const { target_user_id } = req.body;

    if (!target_user_id) {
      return res.status(400).json({ error: 'Ziel-Spieler-ID erforderlich' });
    }

    if (target_user_id === req.user.id) {
      return res.status(400).json({ error: 'Du kannst nicht mit dir selbst handeln' });
    }

    // Check distance (max 50 units)
    const attacker = await db.get(
      'SELECT world_x, world_y FROM users WHERE id = ?',
      [req.user.id]
    );

    const target = await db.get(
      'SELECT id, username, world_x, world_y FROM users WHERE id = ?',
      [target_user_id]
    );

    if (!attacker || !target) {
      return res.status(404).json({ error: 'Spieler nicht gefunden' });
    }

    const distance = Math.sqrt(
      Math.pow(attacker.world_x - target.world_x, 2) +
      Math.pow(attacker.world_y - target.world_y, 2)
    );

    if (distance > 50) {
      return res.status(400).json({ error: 'Ziel ist zu weit entfernt (Max: 50 Einheiten)' });
    }

    // Get both inventories
    const myInventory = await db.all(`
      SELECT ui.item_id, ui.quantity, i.display_name, i.name, i.image_path
      FROM user_inventory ui
      JOIN items i ON ui.item_id = i.id
      WHERE ui.user_id = ? AND ui.quantity > 0
      ORDER BY i.display_name
    `, [req.user.id]);

    const targetInventory = await db.all(`
      SELECT ui.item_id, ui.quantity, i.display_name, i.name, i.image_path
      FROM user_inventory ui
      JOIN items i ON ui.item_id = i.id
      WHERE ui.user_id = ? AND ui.quantity > 0
      ORDER BY i.display_name
    `, [target_user_id]);

    res.json({
      message: `Handel mit ${target.username} initiiert`,
      my_inventory: myInventory,
      target_inventory: targetInventory,
      target_username: target.username
    });
  } catch (error) {
    console.error('Trade initiate error:', error);
    res.status(500).json({ error: 'Serverfehler beim Initiieren des Handels' });
  }
});

// Execute trade
router.post('/trade/execute', authenticateToken, async (req, res) => {
  try {
    const { target_user_id, my_items, target_items } = req.body;

    if (!target_user_id) {
      return res.status(400).json({ error: 'Ziel-Spieler-ID erforderlich' });
    }

    if (target_user_id === req.user.id) {
      return res.status(400).json({ error: 'Du kannst nicht mit dir selbst handeln' });
    }

    // Validate items
    if (!Array.isArray(my_items) || !Array.isArray(target_items)) {
      return res.status(400).json({ error: 'Ungültige Handelsdaten' });
    }

    // Check distance
    const attacker = await db.get(
      'SELECT world_x, world_y FROM users WHERE id = ?',
      [req.user.id]
    );

    const target = await db.get(
      'SELECT id, username FROM users WHERE id = ?',
      [target_user_id]
    );

    if (!attacker || !target) {
      return res.status(404).json({ error: 'Spieler nicht gefunden' });
    }

    const distance = Math.sqrt(
      Math.pow(attacker.world_x - target.world_x, 2) +
      Math.pow(attacker.world_y - target.world_y, 2)
    );

    if (distance > 50) {
      return res.status(400).json({ error: 'Ziel ist zu weit entfernt' });
    }

    // Verify items exist and quantities are correct
    for (const item of my_items) {
      const inventory = await db.get(
        'SELECT quantity FROM user_inventory WHERE user_id = ? AND item_id = ?',
        [req.user.id, item.item_id]
      );

      if (!inventory || inventory.quantity < item.quantity) {
        return res.status(400).json({ error: 'Nicht genug Items im Inventar' });
      }
    }

    for (const item of target_items) {
      const inventory = await db.get(
        'SELECT quantity FROM user_inventory WHERE user_id = ? AND item_id = ?',
        [target_user_id, item.item_id]
      );

      if (!inventory || inventory.quantity < item.quantity) {
        return res.status(400).json({ error: 'Ziel hat nicht genug Items' });
      }
    }

    // Execute trade - remove items from both
    for (const item of my_items) {
      await db.run(
        'UPDATE user_inventory SET quantity = quantity - ? WHERE user_id = ? AND item_id = ?',
        [item.quantity, req.user.id, item.item_id]
      );
      await db.run(
        'DELETE FROM user_inventory WHERE user_id = ? AND item_id = ? AND quantity <= 0',
        [req.user.id, item.item_id]
      );
    }

    for (const item of target_items) {
      await db.run(
        'UPDATE user_inventory SET quantity = quantity - ? WHERE user_id = ? AND item_id = ?',
        [item.quantity, target_user_id, item.item_id]
      );
      await db.run(
        'DELETE FROM user_inventory WHERE user_id = ? AND item_id = ? AND quantity <= 0',
        [target_user_id, item.item_id]
      );
    }

    // Add items to both
    for (const item of my_items) {
      await db.run(`
        INSERT INTO user_inventory (user_id, item_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + ?
      `, [target_user_id, item.item_id, item.quantity, item.quantity]);
    }

    for (const item of target_items) {
      await db.run(`
        INSERT INTO user_inventory (user_id, item_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + ?
      `, [req.user.id, item.item_id, item.quantity, item.quantity]);
    }

    // Get item names for messages
    const myItemNames = [];
    for (const item of my_items) {
      const itemData = await db.get('SELECT display_name FROM items WHERE id = ?', [item.item_id]);
      if (itemData) myItemNames.push(`${item.quantity}x ${itemData.display_name}`);
    }
    
    const targetItemNames = [];
    for (const item of target_items) {
      const itemData = await db.get('SELECT display_name FROM items WHERE id = ?', [item.item_id]);
      if (itemData) targetItemNames.push(`${item.quantity}x ${itemData.display_name}`);
    }

    // Get current user's username
    const currentUser = await db.get('SELECT username FROM users WHERE id = ?', [req.user.id]);

    // Send trade notification to target (the other player)
    await sendSystemMessage(
      target_user_id,
      `🤝 Handel abgeschlossen`,
      `Du hast mit ${currentUser.username} gehandelt!\n\n📦 Du hast erhalten:\n${myItemNames.length > 0 ? myItemNames.join('\n') : '- Nichts'}\n\n📤 Du hast gegeben:\n${targetItemNames.length > 0 ? targetItemNames.join('\n') : '- Nichts'}`,
      'trade_received',
      req.user.id
    );

    // Send confirmation to the initiator
    await sendSystemMessage(
      req.user.id,
      `🤝 Handel abgeschlossen`,
      `Du hast mit ${target.username} gehandelt!\n\n📦 Du hast erhalten:\n${targetItemNames.length > 0 ? targetItemNames.join('\n') : '- Nichts'}\n\n📤 Du hast gegeben:\n${myItemNames.length > 0 ? myItemNames.join('\n') : '- Nichts'}`,
      'trade_sent',
      target_user_id
    );

    res.json({
      message: `Handel mit ${target.username} erfolgreich abgeschlossen!`
    });
  } catch (error) {
    console.error('Trade execute error:', error);
    res.status(500).json({ error: 'Serverfehler beim Ausführen des Handels' });
  }
});

export default router;
