import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { trackItemCollected, updateStatistic } from '../helpers/statistics.js';

const router = express.Router();

// ============== PUBLIC ROUTES ==============

// Get all resource nodes visible on map (within range)
router.get('/nodes', authenticateToken, async (req, res) => {
  try {
    const { minX, maxX, minY, maxY } = req.query;
    
    // Default to large range if not specified
    const rangeMinX = parseInt(minX) || -3000;
    const rangeMaxX = parseInt(maxX) || 3000;
    const rangeMinY = parseInt(minY) || -3000;
    const rangeMaxY = parseInt(maxY) || 3000;

    const nodes = await db.all(`
      SELECT 
        wrn.id,
        wrn.world_x,
        wrn.world_y,
        wrn.current_amount,
        wrn.max_amount,
        wrn.is_depleted,
        wrn.depleted_at,
        rnt.id as type_id,
        rnt.name as type_name,
        rnt.display_name,
        rnt.description,
        rnt.category,
        rnt.icon,
        rnt.image_path,
        rnt.required_tool_type,
        rnt.base_gather_time,
        rnt.respawn_minutes,
        rnt.min_level
      FROM world_resource_nodes wrn
      JOIN resource_node_types rnt ON wrn.node_type_id = rnt.id
      WHERE wrn.world_x BETWEEN ? AND ?
        AND wrn.world_y BETWEEN ? AND ?
        AND rnt.is_active = 1
    `, [rangeMinX, rangeMaxX, rangeMinY, rangeMaxY]);

    // Check respawn for depleted nodes
    const now = new Date();
    for (const node of nodes) {
      if (node.is_depleted && node.depleted_at) {
        const depletedAt = new Date(node.depleted_at);
        // Ensure we have valid dates
        if (isNaN(depletedAt.getTime())) {
          console.error(`[Resources] Invalid depleted_at for node ${node.id}: ${node.depleted_at}`);
          continue;
        }
        
        const respawnTime = new Date(depletedAt.getTime() + (node.respawn_minutes || 30) * 60 * 1000);
        
        // Only respawn if enough time has passed
        if (now >= respawnTime) {
          // Respawn the node
          await db.run(`
            UPDATE world_resource_nodes 
            SET is_depleted = 0, current_amount = max_amount, depleted_at = NULL, last_gathered_at = NULL
            WHERE id = ?
          `, [node.id]);
          node.is_depleted = 0;
          node.current_amount = node.max_amount;
          node.depleted_at = null;
        } else {
          node.respawn_in_seconds = Math.floor((respawnTime - now) / 1000);
        }
      }
    }

    res.json({ nodes });
  } catch (error) {
    console.error('Get resource nodes error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get single node details
router.get('/nodes/:nodeId', authenticateToken, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const userId = req.user.id;

    const node = await db.get(`
      SELECT 
        wrn.*,
        rnt.name as type_name,
        rnt.display_name,
        rnt.description,
        rnt.category,
        rnt.icon,
        rnt.image_path,
        rnt.required_tool_type,
        rnt.base_gather_time,
        rnt.respawn_minutes,
        rnt.min_level
      FROM world_resource_nodes wrn
      JOIN resource_node_types rnt ON wrn.node_type_id = rnt.id
      WHERE wrn.id = ?
    `, [nodeId]);

    if (!node) {
      return res.status(404).json({ error: 'Ressource nicht gefunden' });
    }

    // Get possible drops
    const drops = await db.all(`
      SELECT 
        rnd.*,
        i.display_name as item_name,
        i.rarity,
        i.image_path
      FROM resource_node_drops rnd
      JOIN items i ON rnd.item_id = i.id
      WHERE rnd.node_type_id = ?
      ORDER BY rnd.is_rare, rnd.drop_chance DESC
    `, [node.node_type_id]);

    // Get user's tools for this category
    const toolCategory = node.required_tool_type;
    const userTools = await db.all(`
      SELECT 
        ut.*,
        tt.name,
        tt.display_name,
        tt.tier,
        tt.speed_bonus,
        tt.rare_drop_bonus,
        tt.efficiency_bonus,
        tt.icon
      FROM user_tools ut
      JOIN tool_types tt ON ut.tool_type_id = tt.id
      WHERE ut.user_id = ? AND tt.category = ? AND ut.current_durability > 0
      ORDER BY tt.tier DESC
    `, [userId, toolCategory]);

    // Get user position for distance calc
    const user = await db.get('SELECT world_x, world_y FROM users WHERE id = ?', [userId]);
    const distance = Math.sqrt(
      Math.pow(node.world_x - user.world_x, 2) + 
      Math.pow(node.world_y - user.world_y, 2)
    );

    // Check if user has active gathering job
    const activeJob = await db.get(`
      SELECT * FROM gathering_jobs 
      WHERE user_id = ? AND is_completed = 0 AND is_cancelled = 0
    `, [userId]);

    res.json({ 
      node,
      drops,
      userTools,
      distance: Math.round(distance),
      canGather: distance <= 5 && !node.is_depleted && node.current_amount > 0,
      hasActiveJob: !!activeJob
    });
  } catch (error) {
    console.error('Get node details error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get user's tools
router.get('/tools', authenticateToken, async (req, res) => {
  try {
    const tools = await db.all(`
      SELECT 
        ut.*,
        tt.name,
        tt.display_name,
        tt.description,
        tt.category,
        tt.tier,
        tt.speed_bonus,
        tt.rare_drop_bonus,
        tt.efficiency_bonus,
        tt.durability as max_durability,
        tt.required_level,
        tt.icon
      FROM user_tools ut
      JOIN tool_types tt ON ut.tool_type_id = tt.id
      WHERE ut.user_id = ?
      ORDER BY tt.category, tt.tier DESC
    `, [req.user.id]);

    res.json({ tools });
  } catch (error) {
    console.error('Get user tools error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get all tool types (for crafting reference)
router.get('/tool-types', authenticateToken, async (req, res) => {
  try {
    const toolTypes = await db.all(`
      SELECT * FROM tool_types WHERE is_active = 1 ORDER BY category, tier
    `);
    res.json({ toolTypes });
  } catch (error) {
    console.error('Get tool types error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// ============== GATHERING ==============

// WICHTIG: Spezifische Routen MÜSSEN vor der :nodeId Route kommen!

// Get gathering status
router.get('/gather/status', authenticateToken, async (req, res) => {
  try {
    const job = await db.get(`
      SELECT 
        gj.*,
        wrn.world_x, wrn.world_y,
        rnt.display_name, rnt.icon, rnt.category
      FROM gathering_jobs gj
      JOIN world_resource_nodes wrn ON gj.node_id = wrn.id
      JOIN resource_node_types rnt ON wrn.node_type_id = rnt.id
      WHERE gj.user_id = ? AND gj.is_completed = 0 AND gj.is_cancelled = 0
    `, [req.user.id]);

    if (!job) {
      return res.json({ job: null });
    }

    const now = new Date();
    const finishAt = new Date(job.finish_at);
    const remainingSeconds = Math.max(0, Math.floor((finishAt - now) / 1000));
    const isReady = now >= finishAt;

    res.json({
      job: {
        ...job,
        remaining_seconds: remainingSeconds,
        is_ready: isReady
      }
    });
  } catch (error) {
    console.error('Get gathering status error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Collect gathered resources
router.post('/gather/collect', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const job = await db.get(`
      SELECT gj.*, wrn.node_type_id, rnt.display_name
      FROM gathering_jobs gj
      JOIN world_resource_nodes wrn ON gj.node_id = wrn.id
      JOIN resource_node_types rnt ON wrn.node_type_id = rnt.id
      WHERE gj.user_id = ? AND gj.is_completed = 0 AND gj.is_cancelled = 0
    `, [userId]);

    if (!job) {
      return res.status(400).json({ error: 'Kein aktiver Sammelauftrag' });
    }

    const now = new Date();
    const finishAt = new Date(job.finish_at);

    if (now < finishAt) {
      const remaining = Math.ceil((finishAt - now) / 1000);
      return res.status(400).json({ error: `Noch ${remaining} Sekunden!`, notReady: true });
    }

    // Get tool for bonuses
    let tool = null;
    if (job.tool_id) {
      tool = await db.get(`
        SELECT ut.*, tt.*
        FROM user_tools ut
        JOIN tool_types tt ON ut.tool_type_id = tt.id
        WHERE ut.id = ?
      `, [job.tool_id]);
    }

    // Get possible drops
    const drops = await db.all(`
      SELECT rnd.*, i.name as item_name, i.display_name as item_display_name
      FROM resource_node_drops rnd
      JOIN items i ON rnd.item_id = i.id
      WHERE rnd.node_type_id = ?
    `, [job.node_type_id]);

    // Calculate drops
    const collectedItems = [];
    const rareDropBonus = tool?.rare_drop_bonus || 0;
    const efficiencyBonus = tool?.efficiency_bonus || 0;

    for (const drop of drops) {
      let dropChance = drop.drop_chance;
      
      // Apply rare drop bonus for rare items
      if (drop.is_rare) {
        dropChance += rareDropBonus * 100;
      }

      // Check tool tier requirement
      if (drop.min_tool_tier > 0 && (!tool || tool.tier < drop.min_tool_tier)) {
        continue;
      }

      if (Math.random() * 100 <= dropChance) {
        // Calculate quantity with efficiency bonus
        let baseQuantity = Math.floor(Math.random() * (drop.max_quantity - drop.min_quantity + 1)) + drop.min_quantity;
        let bonusQuantity = Math.floor(baseQuantity * efficiencyBonus);
        let totalQuantity = baseQuantity + bonusQuantity;

        // Add to inventory
        await db.run(`
          INSERT INTO user_inventory (user_id, item_id, quantity)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + ?
        `, [userId, drop.item_id, totalQuantity, totalQuantity]);

        collectedItems.push({
          item_id: drop.item_id,
          name: drop.item_display_name,
          quantity: totalQuantity,
          is_rare: drop.is_rare
        });

        // Track statistics
        await trackItemCollected(userId, drop.item_id, drop.item_name, totalQuantity);
      }
    }

    // Mark job as completed
    await db.run('UPDATE gathering_jobs SET is_completed = 1 WHERE id = ?', [job.id]);

    // Get current node state first
    const currentNode = await db.get('SELECT current_amount, max_amount FROM world_resource_nodes WHERE id = ?', [job.node_id]);
    
    if (!currentNode) {
      return res.status(400).json({ error: 'Ressourcen-Node nicht gefunden' });
    }

    const newAmount = currentNode.current_amount - 1;
    const willBeDepleted = newAmount <= 0;

    // Reduce node amount and set depleted status
    await db.run(`
      UPDATE world_resource_nodes 
      SET current_amount = ?,
          last_gathered_at = datetime('now'),
          is_depleted = ?,
          depleted_at = CASE WHEN ? THEN datetime('now') ELSE depleted_at END
      WHERE id = ?
    `, [newAmount, willBeDepleted ? 1 : 0, willBeDepleted, job.node_id]);

    // Reduce tool durability
    if (tool) {
      await db.run(`
        UPDATE user_tools SET current_durability = current_durability - 1 WHERE id = ?
      `, [tool.id]);
    }

    res.json({
      message: `${job.display_name} gesammelt!`,
      items: collectedItems,
      toolDurability: tool ? Math.max(0, tool.current_durability - 1) : null
    });
  } catch (error) {
    console.error('Collect gathering error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Cancel gathering
router.post('/gather/cancel', authenticateToken, async (req, res) => {
  try {
    const result = await db.run(`
      UPDATE gathering_jobs SET is_cancelled = 1 
      WHERE user_id = ? AND is_completed = 0 AND is_cancelled = 0
    `, [req.user.id]);

    if (result.changes === 0) {
      return res.status(400).json({ error: 'Kein aktiver Sammelauftrag' });
    }

    res.json({ message: 'Sammeln abgebrochen' });
  } catch (error) {
    console.error('Cancel gathering error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Start gathering from a node (MUSS nach den spezifischen Routen kommen!)
router.post('/gather/:nodeId', authenticateToken, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { toolId } = req.body;
    const userId = req.user.id;

    // Check if user has active job
    const activeJob = await db.get(`
      SELECT * FROM gathering_jobs 
      WHERE user_id = ? AND is_completed = 0 AND is_cancelled = 0
    `, [userId]);

    if (activeJob) {
      return res.status(400).json({ error: 'Du sammelst bereits!', hasActiveJob: true });
    }

    // Check for other active jobs (collection, building, crafting)
    const otherJobs = await db.get(`
      SELECT 'collection' as type FROM collection_jobs WHERE user_id = ? AND completed_at > datetime('now')
      UNION ALL
      SELECT 'building' as type FROM building_jobs WHERE user_id = ? AND status = 'in_progress' AND completed_at > datetime('now')
      UNION ALL
      SELECT 'crafting' as type FROM crafting_jobs WHERE user_id = ? AND is_completed = 0
    `, [userId, userId, userId]);

    if (otherJobs) {
      return res.status(400).json({ error: 'Du hast bereits einen aktiven Auftrag!', hasActiveJob: true });
    }

    // Get node
    const node = await db.get(`
      SELECT wrn.*, rnt.*
      FROM world_resource_nodes wrn
      JOIN resource_node_types rnt ON wrn.node_type_id = rnt.id
      WHERE wrn.id = ?
    `, [nodeId]);

    if (!node) {
      return res.status(404).json({ error: 'Ressource nicht gefunden' });
    }

    if (node.is_depleted || node.current_amount <= 0) {
      return res.status(400).json({ error: 'Diese Ressource ist erschöpft!' });
    }

    // Check user position
    const user = await db.get('SELECT world_x, world_y FROM users WHERE id = ?', [userId]);
    const distance = Math.sqrt(
      Math.pow(node.world_x - user.world_x, 2) + 
      Math.pow(node.world_y - user.world_y, 2)
    );

    if (distance > 5) {
      return res.status(400).json({ error: 'Du bist zu weit weg!', tooFar: true, distance: Math.round(distance) });
    }

    // Check player level
    const playerStats = await db.get('SELECT level FROM player_stats WHERE user_id = ?', [userId]);
    if ((playerStats?.level || 1) < node.min_level) {
      return res.status(400).json({ error: `Du brauchst mindestens Level ${node.min_level}!` });
    }

    // Get tool if specified
    let tool = null;
    let speedBonus = 1.0;
    
    if (toolId) {
      tool = await db.get(`
        SELECT ut.*, tt.*
        FROM user_tools ut
        JOIN tool_types tt ON ut.tool_type_id = tt.id
        WHERE ut.id = ? AND ut.user_id = ?
      `, [toolId, userId]);

      if (!tool) {
        return res.status(400).json({ error: 'Werkzeug nicht gefunden' });
      }

      if (tool.category !== node.required_tool_type) {
        return res.status(400).json({ error: `Du brauchst eine ${getToolTypeName(node.required_tool_type)}!` });
      }

      if (tool.current_durability <= 0) {
        return res.status(400).json({ error: 'Dieses Werkzeug ist kaputt!' });
      }

      speedBonus = tool.speed_bonus || 1.0;
    } else if (node.required_tool_type) {
      // Check if user has any tool of required type
      const anyTool = await db.get(`
        SELECT ut.*, tt.*
        FROM user_tools ut
        JOIN tool_types tt ON ut.tool_type_id = tt.id
        WHERE ut.user_id = ? AND tt.category = ? AND ut.current_durability > 0
        ORDER BY tt.tier DESC
        LIMIT 1
      `, [userId, node.required_tool_type]);

      if (!anyTool) {
        return res.status(400).json({ 
          error: `Du brauchst eine ${getToolTypeName(node.required_tool_type)}!`,
          needsTool: true,
          toolType: node.required_tool_type
        });
      }

      tool = anyTool;
      speedBonus = tool.speed_bonus || 1.0;
    }

    // Calculate gather time
    const baseTime = node.base_gather_time;
    const gatherTime = Math.max(5, Math.floor(baseTime / speedBonus));
    
    const now = new Date();
    const finishAt = new Date(now.getTime() + gatherTime * 1000);

    // Create gathering job
    const result = await db.run(`
      INSERT INTO gathering_jobs (user_id, node_id, tool_id, started_at, finish_at)
      VALUES (?, ?, ?, ?, ?)
    `, [userId, nodeId, tool?.id || null, now.toISOString(), finishAt.toISOString()]);

    res.json({
      message: `Du sammelst ${node.display_name}...`,
      jobId: result.lastID,
      gatherTime,
      finishAt: finishAt.toISOString()
    });
  } catch (error) {
    console.error('Start gathering error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Clear all stuck/old jobs for user (emergency cleanup)
router.post('/clear-stuck-jobs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const results = {
      gathering: 0,
      collection: 0,
      building: 0,
      crafting: 0
    };

    // Clear stuck gathering jobs
    const gatheringResult = await db.run(`
      UPDATE gathering_jobs SET is_cancelled = 1 
      WHERE user_id = ? AND is_completed = 0 AND is_cancelled = 0
    `, [userId]);
    results.gathering = gatheringResult.changes || 0;

    // Clear stuck collection jobs (mark as collected)
    const collectionResult = await db.run(`
      DELETE FROM collection_jobs 
      WHERE user_id = ? AND completed_at <= datetime('now')
    `, [userId]);
    results.collection = collectionResult.changes || 0;

    // Clear stuck building jobs
    const buildingResult = await db.run(`
      UPDATE building_jobs SET status = 'cancelled' 
      WHERE user_id = ? AND status = 'in_progress' AND completed_at <= datetime('now')
    `, [userId]);
    results.building = buildingResult.changes || 0;

    // Clear stuck crafting jobs
    const craftingResult = await db.run(`
      UPDATE crafting_jobs SET is_completed = 1, is_cancelled = 1 
      WHERE user_id = ? AND is_completed = 0
    `, [userId]);
    results.crafting = craftingResult.changes || 0;

    const total = results.gathering + results.collection + results.building + results.crafting;

    res.json({ 
      message: total > 0 
        ? `${total} blockierte Aufträge wurden bereinigt!` 
        : 'Keine blockierten Aufträge gefunden.',
      cleared: results
    });
  } catch (error) {
    console.error('Clear stuck jobs error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// ============== TOOL CRAFTING ==============

// Give starter tool (first tool is free)
router.post('/tools/starter', authenticateToken, async (req, res) => {
  try {
    const { category } = req.body;
    const userId = req.user.id;

    if (!['pickaxe', 'axe', 'sickle'].includes(category)) {
      return res.status(400).json({ error: 'Ungültige Werkzeugkategorie' });
    }

    // Check if user already has a tool of this category
    const existingTool = await db.get(`
      SELECT ut.id FROM user_tools ut
      JOIN tool_types tt ON ut.tool_type_id = tt.id
      WHERE ut.user_id = ? AND tt.category = ?
    `, [userId, category]);

    if (existingTool) {
      return res.status(400).json({ error: 'Du hast bereits ein Werkzeug dieser Art!' });
    }

    // Get the tier 1 tool of this category
    const toolType = await db.get(`
      SELECT * FROM tool_types WHERE category = ? AND tier = 1
    `, [category]);

    if (!toolType) {
      return res.status(500).json({ error: 'Werkzeugtyp nicht gefunden' });
    }

    // Give tool to user
    await db.run(`
      INSERT INTO user_tools (user_id, tool_type_id, current_durability)
      VALUES (?, ?, ?)
    `, [userId, toolType.id, toolType.durability]);

    res.json({
      message: `${toolType.display_name} erhalten!`,
      tool: toolType
    });
  } catch (error) {
    console.error('Get starter tool error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// ============== ADMIN ROUTES ==============

// Get all node types (admin)
router.get('/admin/node-types', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const nodeTypes = await db.all('SELECT * FROM resource_node_types ORDER BY category, min_level');
    
    for (const nodeType of nodeTypes) {
      nodeType.drops = await db.all(`
        SELECT rnd.*, i.display_name as item_name, i.rarity
        FROM resource_node_drops rnd
        JOIN items i ON rnd.item_id = i.id
        WHERE rnd.node_type_id = ?
      `, [nodeType.id]);
      
      nodeType.spawn_count = (await db.get(
        'SELECT COUNT(*) as count FROM world_resource_nodes WHERE node_type_id = ?', 
        [nodeType.id]
      ))?.count || 0;
    }

    res.json({ nodeTypes });
  } catch (error) {
    console.error('Admin get node types error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Update node type (admin)
router.put('/admin/node-types/:id', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name, description, icon, image_path, category, required_tool_type, base_gather_time, respawn_minutes, min_level, is_active } = req.body;

    const nodeType = await db.get('SELECT * FROM resource_node_types WHERE id = ?', [id]);
    if (!nodeType) {
      return res.status(404).json({ error: 'Node-Typ nicht gefunden' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (display_name !== undefined) {
      updates.push('display_name = ?');
      values.push(display_name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (icon !== undefined) {
      updates.push('icon = ?');
      values.push(icon);
    }
    if (image_path !== undefined) {
      updates.push('image_path = ?');
      values.push(image_path);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (required_tool_type !== undefined) {
      updates.push('required_tool_type = ?');
      values.push(required_tool_type);
    }
    if (base_gather_time !== undefined) {
      updates.push('base_gather_time = ?');
      values.push(base_gather_time);
    }
    if (respawn_minutes !== undefined) {
      updates.push('respawn_minutes = ?');
      values.push(respawn_minutes);
    }
    if (min_level !== undefined) {
      updates.push('min_level = ?');
      values.push(min_level);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Keine Felder zum Aktualisieren' });
    }

    values.push(id);
    await db.run(`
      UPDATE resource_node_types 
      SET ${updates.join(', ')}
      WHERE id = ?
    `, values);

    res.json({ message: 'Node-Typ aktualisiert' });
  } catch (error) {
    console.error('Update node type error:', error);
    res.status(500).json({ error: 'Serverfehler: ' + error.message });
  }
});

// Spawn nodes (admin)
router.post('/admin/spawn-nodes', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { nodeTypeId, count = 10, minX = -2000, maxX = 2000, minY = -2000, maxY = 2000 } = req.body;

    const nodeType = await db.get('SELECT * FROM resource_node_types WHERE id = ?', [nodeTypeId]);
    if (!nodeType) {
      return res.status(404).json({ error: 'Node-Typ nicht gefunden' });
    }

    let spawned = 0;
    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * (maxX - minX)) + minX;
      const y = Math.floor(Math.random() * (maxY - minY)) + minY;

      try {
        await db.run(`
          INSERT INTO world_resource_nodes (node_type_id, world_x, world_y, current_amount, max_amount)
          VALUES (?, ?, ?, 3, 3)
        `, [nodeTypeId, x, y]);
        spawned++;
      } catch (err) {
        // Skip
      }
    }

    res.json({ message: `${spawned}x ${nodeType.display_name} gespawnt!` });
  } catch (error) {
    console.error('Spawn nodes error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Delete a specific node (admin)
router.delete('/admin/nodes/:nodeId', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { nodeId } = req.params;

    const node = await db.get(`
      SELECT wrn.*, rnt.display_name 
      FROM world_resource_nodes wrn
      JOIN resource_node_types rnt ON wrn.node_type_id = rnt.id
      WHERE wrn.id = ?
    `, [nodeId]);

    if (!node) {
      return res.status(404).json({ error: 'Node nicht gefunden' });
    }

    await db.run('DELETE FROM world_resource_nodes WHERE id = ?', [nodeId]);

    res.json({ message: `${node.display_name} bei (${node.world_x}, ${node.world_y}) gelöscht!` });
  } catch (error) {
    console.error('Delete node error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Move a node to new position (admin)
router.put('/admin/nodes/:nodeId/move', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { x, y } = req.body;

    if (x === undefined || y === undefined) {
      return res.status(400).json({ error: 'x und y Koordinaten erforderlich' });
    }

    const node = await db.get(`
      SELECT wrn.*, rnt.display_name 
      FROM world_resource_nodes wrn
      JOIN resource_node_types rnt ON wrn.node_type_id = rnt.id
      WHERE wrn.id = ?
    `, [nodeId]);

    if (!node) {
      return res.status(404).json({ error: 'Node nicht gefunden' });
    }

    await db.run('UPDATE world_resource_nodes SET world_x = ?, world_y = ? WHERE id = ?', [x, y, nodeId]);

    res.json({ message: `${node.display_name} von (${node.world_x}, ${node.world_y}) nach (${x}, ${y}) verschoben!` });
  } catch (error) {
    console.error('Move node error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Add drop to node type (admin)
router.post('/admin/node-types/:nodeTypeId/drops', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { nodeTypeId } = req.params;
    const { itemId, dropChance = 100, minQuantity = 1, maxQuantity = 1, minToolTier = 0, isRare = false } = req.body;

    // Verify node type exists
    const nodeType = await db.get('SELECT * FROM resource_node_types WHERE id = ?', [nodeTypeId]);
    if (!nodeType) {
      return res.status(404).json({ error: 'Ressourcen-Typ nicht gefunden' });
    }

    // Verify item exists
    const item = await db.get('SELECT * FROM items WHERE id = ?', [itemId]);
    if (!item) {
      return res.status(404).json({ error: 'Item nicht gefunden' });
    }

    // Check if drop already exists
    const existingDrop = await db.get(
      'SELECT * FROM resource_node_drops WHERE node_type_id = ? AND item_id = ?',
      [nodeTypeId, itemId]
    );

    if (existingDrop) {
      // Update existing
      await db.run(`
        UPDATE resource_node_drops 
        SET drop_chance = ?, min_quantity = ?, max_quantity = ?, min_tool_tier = ?, is_rare = ?
        WHERE node_type_id = ? AND item_id = ?
      `, [dropChance, minQuantity, maxQuantity, minToolTier, isRare ? 1 : 0, nodeTypeId, itemId]);
      
      res.json({ message: `Drop für ${item.display_name} aktualisiert!` });
    } else {
      // Insert new
      await db.run(`
        INSERT INTO resource_node_drops (node_type_id, item_id, drop_chance, min_quantity, max_quantity, min_tool_tier, is_rare)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [nodeTypeId, itemId, dropChance, minQuantity, maxQuantity, minToolTier, isRare ? 1 : 0]);

      res.json({ message: `Drop ${item.display_name} zu ${nodeType.display_name} hinzugefügt!` });
    }
  } catch (error) {
    console.error('Add drop error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Delete drop from node type (admin)
router.delete('/admin/node-types/:nodeTypeId/drops/:itemId', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { nodeTypeId, itemId } = req.params;

    const result = await db.run(
      'DELETE FROM resource_node_drops WHERE node_type_id = ? AND item_id = ?',
      [nodeTypeId, itemId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Drop nicht gefunden' });
    }

    res.json({ message: 'Drop entfernt!' });
  } catch (error) {
    console.error('Delete drop error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get all items (for dropdown in admin)
router.get('/admin/items', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const items = await db.all(`
      SELECT id, name, display_name, type, rarity, image_path 
      FROM items 
      ORDER BY type, display_name
    `);
    res.json({ items });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Helper function
function getToolTypeName(category) {
  const names = {
    'pickaxe': 'Spitzhacke',
    'axe': 'Axt',
    'sickle': 'Sichel'
  };
  return names[category] || 'Werkzeug';
}

export default router;
