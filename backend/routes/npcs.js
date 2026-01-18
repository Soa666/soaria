import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Maximum interaction distance
const MAX_INTERACTION_DISTANCE = 100;

// Helper to calculate distance between two points
function getDistance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// Helper to check if player is near an NPC
async function checkPlayerNearNpc(userId, npcId) {
  const user = await db.get('SELECT world_x, world_y FROM users WHERE id = ?', [userId]);
  const npc = await db.get('SELECT world_x, world_y FROM world_npcs WHERE id = ?', [npcId]);
  
  if (!user || !npc) {
    return { isNear: false, error: 'Spieler oder NPC nicht gefunden' };
  }
  
  const distance = getDistance(user.world_x, user.world_y, npc.world_x, npc.world_y);
  
  if (distance > MAX_INTERACTION_DISTANCE) {
    return { 
      isNear: false, 
      error: `Du bist zu weit entfernt! (Entfernung: ${Math.round(distance)}, Maximum: ${MAX_INTERACTION_DISTANCE})`,
      distance 
    };
  }
  
  return { isNear: true, distance };
}

// Get all world NPCs (for map display)
router.get('/world', authenticateToken, async (req, res) => {
  try {
    const npcs = await db.all(`
      SELECT 
        wn.id,
        wn.world_x,
        wn.world_y,
        wn.level,
        wn.current_health,
        wn.is_active,
        wn.last_killed_at,
        wn.respawn_minutes,
        CASE 
          WHEN wn.npc_type_id IS NOT NULL THEN 'merchant'
          WHEN mt.is_boss = 1 THEN 'boss'
          ELSE 'monster'
        END as entity_type,
        COALESCE(nt.display_name, mt.display_name) as display_name,
        COALESCE(nt.description, mt.description) as description,
        COALESCE(nt.image_path, mt.image_path) as image_path,
        mt.base_health,
        mt.health_per_level,
        mt.base_attack,
        mt.attack_per_level,
        mt.base_defense,
        mt.defense_per_level,
        mt.is_boss
      FROM world_npcs wn
      LEFT JOIN npc_types nt ON wn.npc_type_id = nt.id
      LEFT JOIN monster_types mt ON wn.monster_type_id = mt.id
      WHERE wn.is_active = 1 
         OR (wn.last_killed_at IS NOT NULL 
             AND datetime(wn.last_killed_at, '+' || wn.respawn_minutes || ' minutes') <= datetime('now'))
    `);

    // Calculate actual stats for monsters
    const processedNpcs = npcs.map(npc => {
      if (npc.entity_type === 'monster' || npc.entity_type === 'boss') {
        const level = npc.level || 1;
        return {
          ...npc,
          max_health: npc.base_health + (level - 1) * (npc.health_per_level || 0),
          attack: npc.base_attack + (level - 1) * (npc.attack_per_level || 0),
          defense: npc.base_defense + (level - 1) * (npc.defense_per_level || 0),
        };
      }
      return npc;
    });

    res.json({ npcs: processedNpcs });
  } catch (error) {
    console.error('Get world NPCs error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der NPCs' });
  }
});

// Get single NPC details
router.get('/:npcId', authenticateToken, async (req, res) => {
  try {
    const { npcId } = req.params;

    const npc = await db.get(`
      SELECT 
        wn.*,
        CASE 
          WHEN wn.npc_type_id IS NOT NULL THEN 'merchant'
          WHEN mt.is_boss = 1 THEN 'boss'
          ELSE 'monster'
        END as entity_type,
        COALESCE(nt.display_name, mt.display_name) as display_name,
        COALESCE(nt.description, mt.description) as description,
        nt.npc_type,
        mt.base_health,
        mt.health_per_level,
        mt.base_attack,
        mt.attack_per_level,
        mt.base_defense,
        mt.defense_per_level,
        mt.is_boss
      FROM world_npcs wn
      LEFT JOIN npc_types nt ON wn.npc_type_id = nt.id
      LEFT JOIN monster_types mt ON wn.monster_type_id = mt.id
      WHERE wn.id = ?
    `, [npcId]);

    if (!npc) {
      return res.status(404).json({ error: 'NPC nicht gefunden' });
    }

    // Check distance to NPC
    const proximityCheck = await checkPlayerNearNpc(req.user.id, npcId);
    if (!proximityCheck.isNear) {
      return res.status(400).json({ error: proximityCheck.error, tooFar: true });
    }

    // If it's a merchant, get shop items
    let shopItems = [];
    if (npc.npc_type_id) {
      shopItems = await db.all(`
        SELECT 
          nsi.*,
          i.name as item_name,
          i.display_name as item_display_name,
          i.type as item_type,
          i.rarity as item_rarity,
          i.image_path as item_image
        FROM npc_shop_items nsi
        JOIN items i ON nsi.item_id = i.id
        WHERE nsi.npc_type_id = ?
      `, [npc.npc_type_id]);
    }

    // If it's a monster, get loot table
    let lootTable = [];
    if (npc.monster_type_id) {
      lootTable = await db.all(`
        SELECT 
          ml.*,
          i.name as item_name,
          i.display_name as item_display_name,
          i.type as item_type,
          i.rarity as item_rarity,
          i.image_path as item_image
        FROM monster_loot ml
        JOIN items i ON ml.item_id = i.id
        WHERE ml.monster_type_id = ?
      `, [npc.monster_type_id]);
    }

    // Calculate stats for monsters
    if (npc.entity_type === 'monster' || npc.entity_type === 'boss') {
      const level = npc.level || 1;
      npc.max_health = npc.base_health + (level - 1) * (npc.health_per_level || 0);
      npc.attack = npc.base_attack + (level - 1) * (npc.attack_per_level || 0);
      npc.defense = npc.base_defense + (level - 1) * (npc.defense_per_level || 0);
    }

    res.json({ npc, shopItems, lootTable });
  } catch (error) {
    console.error('Get NPC error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Buy from merchant
router.post('/:npcId/buy', authenticateToken, async (req, res) => {
  try {
    const { npcId } = req.params;
    const { itemId, quantity } = req.body;
    const userId = req.user.id;

    if (!itemId || !quantity || quantity < 1) {
      return res.status(400).json({ error: 'Ungültige Anfrage' });
    }

    // Check distance to NPC first
    const proximityCheck = await checkPlayerNearNpc(userId, npcId);
    if (!proximityCheck.isNear) {
      return res.status(400).json({ error: proximityCheck.error, tooFar: true });
    }

    // Get NPC and check if it's a merchant
    const npc = await db.get(`
      SELECT wn.*, nt.npc_type
      FROM world_npcs wn
      JOIN npc_types nt ON wn.npc_type_id = nt.id
      WHERE wn.id = ? AND nt.npc_type = 'merchant'
    `, [npcId]);

    if (!npc) {
      return res.status(404).json({ error: 'Händler nicht gefunden' });
    }

    // Get shop item
    const shopItem = await db.get(`
      SELECT nsi.*, i.display_name as item_display_name
      FROM npc_shop_items nsi
      JOIN items i ON nsi.item_id = i.id
      WHERE nsi.npc_type_id = ? AND nsi.item_id = ? AND nsi.buy_price IS NOT NULL
    `, [npc.npc_type_id, itemId]);

    if (!shopItem) {
      return res.status(404).json({ error: 'Dieses Item wird hier nicht verkauft' });
    }

    // Check stock
    if (shopItem.stock !== -1 && shopItem.stock < quantity) {
      return res.status(400).json({ error: 'Nicht genug Vorrat' });
    }

    const totalCost = shopItem.buy_price * quantity;

    // Check player gold
    const user = await db.get('SELECT gold FROM users WHERE id = ?', [userId]);
    if (user.gold < totalCost) {
      return res.status(400).json({ error: `Nicht genug Gold (benötigt: ${totalCost}, vorhanden: ${user.gold})` });
    }

    // Deduct gold
    await db.run('UPDATE users SET gold = gold - ? WHERE id = ?', [totalCost, userId]);

    // Add item to inventory
    await db.run(`
      INSERT INTO user_inventory (user_id, item_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + ?
    `, [userId, itemId, quantity, quantity]);

    // Update stock if limited
    if (shopItem.stock !== -1) {
      await db.run(`
        UPDATE npc_shop_items SET stock = stock - ? WHERE id = ?
      `, [quantity, shopItem.id]);
    }

    res.json({ 
      message: `${quantity}x ${shopItem.item_display_name} für ${totalCost} Gold gekauft!`,
      newGold: user.gold - totalCost
    });
  } catch (error) {
    console.error('Buy error:', error);
    res.status(500).json({ error: 'Serverfehler beim Kaufen' });
  }
});

// Sell to merchant
router.post('/:npcId/sell', authenticateToken, async (req, res) => {
  try {
    const { npcId } = req.params;
    const { itemId, quantity } = req.body;
    const userId = req.user.id;

    if (!itemId || !quantity || quantity < 1) {
      return res.status(400).json({ error: 'Ungültige Anfrage' });
    }

    // Check distance to NPC first
    const proximityCheck = await checkPlayerNearNpc(userId, npcId);
    if (!proximityCheck.isNear) {
      return res.status(400).json({ error: proximityCheck.error, tooFar: true });
    }

    // Get NPC and check if it's a merchant
    const npc = await db.get(`
      SELECT wn.*, nt.npc_type
      FROM world_npcs wn
      JOIN npc_types nt ON wn.npc_type_id = nt.id
      WHERE wn.id = ? AND nt.npc_type = 'merchant'
    `, [npcId]);

    if (!npc) {
      return res.status(404).json({ error: 'Händler nicht gefunden' });
    }

    // Get shop item (merchant must buy this item)
    const shopItem = await db.get(`
      SELECT nsi.*, i.display_name as item_display_name
      FROM npc_shop_items nsi
      JOIN items i ON nsi.item_id = i.id
      WHERE nsi.npc_type_id = ? AND nsi.item_id = ? AND nsi.sell_price IS NOT NULL
    `, [npc.npc_type_id, itemId]);

    if (!shopItem) {
      return res.status(404).json({ error: 'Dieser Händler kauft dieses Item nicht' });
    }

    // Check player inventory
    const inventory = await db.get(
      'SELECT quantity FROM user_inventory WHERE user_id = ? AND item_id = ?',
      [userId, itemId]
    );

    if (!inventory || inventory.quantity < quantity) {
      return res.status(400).json({ error: 'Nicht genug Items im Inventar' });
    }

    const totalGold = shopItem.sell_price * quantity;

    // Add gold
    await db.run('UPDATE users SET gold = gold + ? WHERE id = ?', [totalGold, userId]);

    // Remove items from inventory
    await db.run(`
      UPDATE user_inventory SET quantity = quantity - ? WHERE user_id = ? AND item_id = ?
    `, [quantity, userId, itemId]);

    // Clean up zero quantity items
    await db.run('DELETE FROM user_inventory WHERE quantity <= 0');

    const user = await db.get('SELECT gold FROM users WHERE id = ?', [userId]);

    res.json({ 
      message: `${quantity}x ${shopItem.item_display_name} für ${totalGold} Gold verkauft!`,
      newGold: user.gold
    });
  } catch (error) {
    console.error('Sell error:', error);
    res.status(500).json({ error: 'Serverfehler beim Verkaufen' });
  }
});

// Get player stats
router.get('/player/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    let stats = await db.get('SELECT * FROM player_stats WHERE user_id = ?', [userId]);
    
    if (!stats) {
      // Create default stats
      await db.run(`
        INSERT INTO player_stats (user_id, level, experience, max_health, current_health, base_attack, base_defense)
        VALUES (?, 1, 0, 100, 100, 10, 5)
      `, [userId]);
      stats = await db.get('SELECT * FROM player_stats WHERE user_id = ?', [userId]);
    }

    const user = await db.get('SELECT gold, world_x, world_y, home_x, home_y FROM users WHERE id = ?', [userId]);

    // Auto-heal to 100% if player is at home
    if (stats.current_health < stats.max_health) {
      const homeX = user.home_x ?? 0;
      const homeY = user.home_y ?? 0;
      const distance = Math.sqrt(
        Math.pow((user.world_x || 0) - homeX, 2) + 
        Math.pow((user.world_y || 0) - homeY, 2)
      );
      
      if (distance <= 50) {
        // Player is at home - heal to full
        await db.run('UPDATE player_stats SET current_health = max_health WHERE user_id = ?', [userId]);
        stats.current_health = stats.max_health;
      }
    }

    res.json({ stats: { ...stats, gold: user.gold } });
  } catch (error) {
    console.error('Get player stats error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

export default router;
