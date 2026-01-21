import express from 'express';
import db from '../database.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// ==================== MONSTER TYPES ====================

// Get all monster types
router.get('/monsters', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const monsters = await db.all(`
      SELECT mt.*, 
        (SELECT COUNT(*) FROM world_npcs wn WHERE wn.monster_type_id = mt.id) as spawn_count
      FROM monster_types mt
      ORDER BY mt.is_boss, mt.min_level
    `);
    res.json({ monsters });
  } catch (error) {
    console.error('Get monsters error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get single monster type with loot
router.get('/monsters/:id', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const monster = await db.get('SELECT * FROM monster_types WHERE id = ?', [id]);
    if (!monster) {
      return res.status(404).json({ error: 'Monster nicht gefunden' });
    }

    const loot = await db.all(`
      SELECT ml.*, i.display_name as item_name, i.name as item_internal_name
      FROM monster_loot ml
      JOIN items i ON ml.item_id = i.id
      WHERE ml.monster_type_id = ?
    `, [id]);

    res.json({ monster, loot });
  } catch (error) {
    console.error('Get monster error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Create monster type
router.post('/monsters', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { 
      name, display_name, description, image_path, is_boss,
      min_level, max_level, base_health, base_attack, base_defense,
      health_per_level, attack_per_level, defense_per_level, spawn_weight, respawn_cooldown
    } = req.body;

    if (!name || !display_name) {
      return res.status(400).json({ error: 'Name und Anzeigename erforderlich' });
    }

    // Default respawn cooldown: 5 min for normal, 60 min for bosses
    const defaultCooldown = is_boss ? 60 : 5;

    const result = await db.run(`
      INSERT INTO monster_types 
      (name, display_name, description, image_path, is_boss, min_level, max_level, 
       base_health, base_attack, base_defense, health_per_level, attack_per_level, defense_per_level, spawn_weight, respawn_cooldown)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, display_name, description || '', image_path || null, is_boss ? 1 : 0,
      min_level || 1, max_level || 5, base_health || 100, base_attack || 10, base_defense || 5,
      health_per_level || 20, attack_per_level || 3, defense_per_level || 2, spawn_weight || 100,
      respawn_cooldown || defaultCooldown
    ]);

    res.json({ message: 'Monster erstellt', id: result.lastID });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Ein Monster mit diesem Namen existiert bereits' });
    }
    console.error('Create monster error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Update monster type
router.put('/monsters/:id', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      display_name, description, image_path, is_boss,
      min_level, max_level, base_health, base_attack, base_defense,
      health_per_level, attack_per_level, defense_per_level, spawn_weight, respawn_cooldown
    } = req.body;

    await db.run(`
      UPDATE monster_types SET
        display_name = ?, description = ?, image_path = ?, is_boss = ?,
        min_level = ?, max_level = ?, base_health = ?, base_attack = ?, base_defense = ?,
        health_per_level = ?, attack_per_level = ?, defense_per_level = ?, spawn_weight = ?,
        respawn_cooldown = ?
      WHERE id = ?
    `, [
      display_name, description, image_path || null, is_boss ? 1 : 0,
      min_level, max_level, base_health, base_attack, base_defense,
      health_per_level, attack_per_level, defense_per_level, spawn_weight,
      respawn_cooldown || (is_boss ? 60 : 5), id
    ]);

    res.json({ message: 'Monster aktualisiert' });
  } catch (error) {
    console.error('Update monster error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Delete monster type
router.delete('/monsters/:id', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete associated world NPCs
    await db.run('DELETE FROM world_npcs WHERE monster_type_id = ?', [id]);
    // Delete loot
    await db.run('DELETE FROM monster_loot WHERE monster_type_id = ?', [id]);
    // Delete monster type
    await db.run('DELETE FROM monster_types WHERE id = ?', [id]);

    res.json({ message: 'Monster gelöscht' });
  } catch (error) {
    console.error('Delete monster error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Add loot to monster
router.post('/monsters/:id/loot', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    const { item_id, min_quantity, max_quantity, drop_chance, gold_min, gold_max } = req.body;

    if (!item_id) {
      return res.status(400).json({ error: 'Item erforderlich' });
    }

    await db.run(`
      INSERT INTO monster_loot (monster_type_id, item_id, min_quantity, max_quantity, drop_chance, gold_min, gold_max)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(monster_type_id, item_id) DO UPDATE SET
        min_quantity = ?, max_quantity = ?, drop_chance = ?, gold_min = ?, gold_max = ?
    `, [id, item_id, min_quantity || 1, max_quantity || 1, drop_chance || 0.5, gold_min || 0, gold_max || 0,
        min_quantity || 1, max_quantity || 1, drop_chance || 0.5, gold_min || 0, gold_max || 0]);

    res.json({ message: 'Loot hinzugefügt' });
  } catch (error) {
    console.error('Add loot error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Remove loot from monster
router.delete('/monsters/:id/loot/:lootId', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { lootId } = req.params;
    await db.run('DELETE FROM monster_loot WHERE id = ?', [lootId]);
    res.json({ message: 'Loot entfernt' });
  } catch (error) {
    console.error('Remove loot error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// ==================== NPC TYPES (Merchants) ====================

// Get all NPC types
router.get('/npcs', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const npcs = await db.all(`
      SELECT nt.*, 
        (SELECT COUNT(*) FROM world_npcs wn WHERE wn.npc_type_id = nt.id) as spawn_count,
        (SELECT COUNT(*) FROM npc_shop_items nsi WHERE nsi.npc_type_id = nt.id) as item_count
      FROM npc_types nt
      ORDER BY nt.display_name
    `);
    res.json({ npcs });
  } catch (error) {
    console.error('Get NPCs error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get single NPC with shop items
router.get('/npcs/:id', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const npc = await db.get('SELECT * FROM npc_types WHERE id = ?', [id]);
    if (!npc) {
      return res.status(404).json({ error: 'NPC nicht gefunden' });
    }

    const shopItems = await db.all(`
      SELECT nsi.*, i.display_name as item_name, i.name as item_internal_name, i.type as item_type
      FROM npc_shop_items nsi
      JOIN items i ON nsi.item_id = i.id
      WHERE nsi.npc_type_id = ?
    `, [id]);

    res.json({ npc, shopItems });
  } catch (error) {
    console.error('Get NPC error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Create NPC type
router.post('/npcs', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { name, display_name, description, npc_type } = req.body;

    if (!name || !display_name) {
      return res.status(400).json({ error: 'Name und Anzeigename erforderlich' });
    }

    const result = await db.run(`
      INSERT INTO npc_types (name, display_name, description, npc_type)
      VALUES (?, ?, ?, ?)
    `, [name, display_name, description || '', npc_type || 'merchant']);

    res.json({ message: 'NPC erstellt', id: result.lastID });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Ein NPC mit diesem Namen existiert bereits' });
    }
    console.error('Create NPC error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Update NPC type
router.put('/npcs/:id', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name, description, npc_type } = req.body;

    await db.run(`
      UPDATE npc_types SET display_name = ?, description = ?, npc_type = ? WHERE id = ?
    `, [display_name, description, npc_type, id]);

    res.json({ message: 'NPC aktualisiert' });
  } catch (error) {
    console.error('Update NPC error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Delete NPC type
router.delete('/npcs/:id', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.run('DELETE FROM world_npcs WHERE npc_type_id = ?', [id]);
    await db.run('DELETE FROM npc_shop_items WHERE npc_type_id = ?', [id]);
    await db.run('DELETE FROM npc_types WHERE id = ?', [id]);

    res.json({ message: 'NPC gelöscht' });
  } catch (error) {
    console.error('Delete NPC error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Add/Update shop item
router.post('/npcs/:id/items', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    const { item_id, buy_price, sell_price, stock } = req.body;

    if (!item_id) {
      return res.status(400).json({ error: 'Item erforderlich' });
    }

    await db.run(`
      INSERT INTO npc_shop_items (npc_type_id, item_id, buy_price, sell_price, stock)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(npc_type_id, item_id) DO UPDATE SET
        buy_price = ?, sell_price = ?, stock = ?
    `, [id, item_id, buy_price || null, sell_price || null, stock ?? -1,
        buy_price || null, sell_price || null, stock ?? -1]);

    res.json({ message: 'Shop-Item hinzugefügt/aktualisiert' });
  } catch (error) {
    console.error('Add shop item error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Remove shop item
router.delete('/npcs/:id/items/:itemId', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id, itemId } = req.params;
    await db.run('DELETE FROM npc_shop_items WHERE npc_type_id = ? AND item_id = ?', [id, itemId]);
    res.json({ message: 'Shop-Item entfernt' });
  } catch (error) {
    console.error('Remove shop item error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// ==================== WORLD NPCs (Spawned instances) ====================

// Get all world NPCs
router.get('/world-npcs', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const worldNpcs = await db.all(`
      SELECT 
        wn.*,
        COALESCE(nt.display_name, mt.display_name) as display_name,
        CASE 
          WHEN wn.npc_type_id IS NOT NULL THEN 'merchant'
          WHEN mt.is_boss = 1 THEN 'boss'
          ELSE 'monster'
        END as entity_type
      FROM world_npcs wn
      LEFT JOIN npc_types nt ON wn.npc_type_id = nt.id
      LEFT JOIN monster_types mt ON wn.monster_type_id = mt.id
      ORDER BY wn.id
    `);
    res.json({ worldNpcs });
  } catch (error) {
    console.error('Get world NPCs error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Spawn new world NPC
router.post('/world-npcs', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { npc_type_id, monster_type_id, world_x, world_y, level, respawn_minutes } = req.body;

    if (!npc_type_id && !monster_type_id) {
      return res.status(400).json({ error: 'NPC-Typ oder Monster-Typ erforderlich' });
    }

    let currentHealth = null;
    if (monster_type_id) {
      const monster = await db.get('SELECT * FROM monster_types WHERE id = ?', [monster_type_id]);
      if (monster) {
        const lvl = level || monster.min_level;
        currentHealth = monster.base_health + (lvl - 1) * monster.health_per_level;
      }
    }

    const result = await db.run(`
      INSERT INTO world_npcs (npc_type_id, monster_type_id, world_x, world_y, level, current_health, respawn_minutes, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `, [npc_type_id || null, monster_type_id || null, world_x || 0, world_y || 0, level || 1, currentHealth, respawn_minutes || 10]);

    res.json({ message: 'World-NPC gespawnt', id: result.lastID });
  } catch (error) {
    console.error('Spawn world NPC error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Update world NPC position
router.put('/world-npcs/:id', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    const { world_x, world_y, level, respawn_minutes, is_active } = req.body;

    await db.run(`
      UPDATE world_npcs SET world_x = ?, world_y = ?, level = ?, respawn_minutes = ?, is_active = ? WHERE id = ?
    `, [world_x, world_y, level, respawn_minutes, is_active ? 1 : 0, id]);

    res.json({ message: 'World-NPC aktualisiert' });
  } catch (error) {
    console.error('Update world NPC error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Delete world NPC
router.delete('/world-npcs/:id', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM world_npcs WHERE id = ?', [id]);
    res.json({ message: 'World-NPC gelöscht' });
  } catch (error) {
    console.error('Delete world NPC error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Spawn multiple monsters of a type at random positions
router.post('/monsters/:monsterId/spawn', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { monsterId } = req.params;
    const { count = 5, minX = -2000, maxX = 2000, minY = -2000, maxY = 2000 } = req.body;

    const monster = await db.get('SELECT * FROM monster_types WHERE id = ?', [monsterId]);
    if (!monster) {
      return res.status(404).json({ error: 'Monster-Typ nicht gefunden' });
    }

    const spawned = [];
    for (let i = 0; i < count; i++) {
      // Random position within bounds
      const worldX = Math.floor(Math.random() * (maxX - minX)) + minX;
      const worldY = Math.floor(Math.random() * (maxY - minY)) + minY;
      
      // Random level within monster's range
      const level = Math.floor(Math.random() * (monster.max_level - monster.min_level + 1)) + monster.min_level;
      
      // Calculate health for this level
      const currentHealth = monster.base_health + (level - 1) * monster.health_per_level;
      
      // Respawn time from monster type or default
      const respawnMinutes = monster.respawn_cooldown || (monster.is_boss ? 60 : 10);

      const result = await db.run(`
        INSERT INTO world_npcs (monster_type_id, world_x, world_y, level, current_health, respawn_minutes, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `, [monsterId, worldX, worldY, level, currentHealth, respawnMinutes]);

      spawned.push({
        id: result.lastID,
        x: worldX,
        y: worldY,
        level
      });
    }

    res.json({ 
      message: `${count}x ${monster.display_name} gespawnt!`,
      spawned
    });
  } catch (error) {
    console.error('Spawn monsters error:', error);
    res.status(500).json({ error: 'Serverfehler beim Spawnen' });
  }
});

// Respawn all dead monsters
router.post('/world-npcs/respawn-all', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    // Get all dead monsters with their types
    const deadMonsters = await db.all(`
      SELECT wn.*, mt.base_health, mt.health_per_level
      FROM world_npcs wn
      JOIN monster_types mt ON wn.monster_type_id = mt.id
      WHERE wn.is_active = 0
    `);

    for (const monster of deadMonsters) {
      const maxHealth = monster.base_health + (monster.level - 1) * monster.health_per_level;
      await db.run('UPDATE world_npcs SET is_active = 1, current_health = ?, last_killed_at = NULL WHERE id = ?', 
        [maxHealth, monster.id]);
    }

    res.json({ message: `${deadMonsters.length} Monster wiederbelebt` });
  } catch (error) {
    console.error('Respawn all error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

export default router;
