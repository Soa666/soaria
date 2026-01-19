import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { trackCrafting, updateStatistic } from '../helpers/statistics.js';

const router = express.Router();

// Quality multipliers for equipment stats
const QUALITY_MULTIPLIERS = {
  poor: 0.7,
  normal: 1.0,
  good: 1.2,
  excellent: 1.5,
  masterwork: 1.8,
  legendary: 2.5
};

const QUALITY_NAMES = {
  poor: 'Minderwertig',
  normal: 'Normal',
  good: 'Gut',
  excellent: 'Ausgezeichnet',
  masterwork: 'Meisterwerk',
  legendary: 'Legendär'
};

const QUALITY_COLORS = {
  poor: '#9d9d9d',
  normal: '#ffffff',
  good: '#1eff00',
  excellent: '#0070dd',
  masterwork: '#a335ee',
  legendary: '#ff8000'
};

// Calculate equipment stats with quality bonus
function calculateEquipmentStats(equipment, quality) {
  const multiplier = QUALITY_MULTIPLIERS[quality] || 1.0;
  return {
    attack: Math.floor(equipment.base_attack * multiplier),
    defense: Math.floor(equipment.base_defense * multiplier),
    health: Math.floor(equipment.base_health * multiplier)
  };
}

// Get all equipment types (for reference)
router.get('/types', authenticateToken, async (req, res) => {
  try {
    const types = await db.all(`
      SELECT et.*, 
        er.id as recipe_id,
        er.profession,
        er.required_profession_level,
        er.experience_reward
      FROM equipment_types et
      LEFT JOIN equipment_recipes er ON et.id = er.equipment_type_id
      ORDER BY et.slot, et.required_level
    `);
    
    res.json({ types });
  } catch (error) {
    console.error('Get equipment types error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get user's equipment inventory
router.get('/inventory', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const equipment = await db.all(`
      SELECT 
        ue.id,
        ue.quality,
        ue.quality_bonus,
        ue.is_equipped,
        ue.created_at,
        et.id as type_id,
        et.name,
        et.display_name,
        et.description,
        et.slot,
        et.image_path,
        et.base_attack,
        et.base_defense,
        et.base_health,
        et.required_level,
        et.rarity
      FROM user_equipment ue
      JOIN equipment_types et ON ue.equipment_type_id = et.id
      WHERE ue.user_id = ?
      ORDER BY ue.is_equipped DESC, et.slot, et.required_level DESC
    `, [userId]);

    // Calculate actual stats for each equipment
    const equipmentWithStats = equipment.map(eq => {
      const stats = calculateEquipmentStats(eq, eq.quality);
      return {
        ...eq,
        actual_attack: stats.attack,
        actual_defense: stats.defense,
        actual_health: stats.health,
        quality_name: QUALITY_NAMES[eq.quality],
        quality_color: QUALITY_COLORS[eq.quality]
      };
    });

    res.json({ equipment: equipmentWithStats });
  } catch (error) {
    console.error('Get equipment inventory error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get currently equipped items
router.get('/equipped', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const equipped = await db.all(`
      SELECT 
        ue.id,
        ue.quality,
        ue.quality_bonus,
        et.id as type_id,
        et.name,
        et.display_name,
        et.description,
        et.slot,
        et.image_path,
        et.base_attack,
        et.base_defense,
        et.base_health,
        et.required_level,
        et.rarity
      FROM user_equipment ue
      JOIN equipment_types et ON ue.equipment_type_id = et.id
      WHERE ue.user_id = ? AND ue.is_equipped = 1
    `, [userId]);

    // Calculate total stats from equipment
    let totalAttack = 0;
    let totalDefense = 0;
    let totalHealth = 0;

    const equippedWithStats = equipped.map(eq => {
      const stats = calculateEquipmentStats(eq, eq.quality);
      totalAttack += stats.attack;
      totalDefense += stats.defense;
      totalHealth += stats.health;
      
      return {
        ...eq,
        actual_attack: stats.attack,
        actual_defense: stats.defense,
        actual_health: stats.health,
        quality_name: QUALITY_NAMES[eq.quality],
        quality_color: QUALITY_COLORS[eq.quality]
      };
    });

    // Create a map by slot for easy frontend access
    const equippedBySlot = {};
    equippedWithStats.forEach(eq => {
      equippedBySlot[eq.slot] = eq;
    });

    res.json({ 
      equipped: equippedWithStats,
      equippedBySlot,
      totalStats: {
        attack: totalAttack,
        defense: totalDefense,
        health: totalHealth
      }
    });
  } catch (error) {
    console.error('Get equipped error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Equip an item
router.post('/equip/:equipmentId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { equipmentId } = req.params;

    // Get the equipment
    const equipment = await db.get(`
      SELECT ue.*, et.slot, et.required_level, et.display_name
      FROM user_equipment ue
      JOIN equipment_types et ON ue.equipment_type_id = et.id
      WHERE ue.id = ? AND ue.user_id = ?
    `, [equipmentId, userId]);

    if (!equipment) {
      return res.status(404).json({ error: 'Ausrüstung nicht gefunden' });
    }

    // Check player level
    const playerStats = await db.get('SELECT level FROM player_stats WHERE user_id = ?', [userId]);
    if (playerStats && playerStats.level < equipment.required_level) {
      return res.status(400).json({ 
        error: `Du musst Level ${equipment.required_level} sein um diese Ausrüstung zu tragen` 
      });
    }

    // Unequip any existing item in the same slot
    await db.run(`
      UPDATE user_equipment 
      SET is_equipped = 0 
      WHERE user_id = ? AND is_equipped = 1 
        AND equipment_type_id IN (SELECT id FROM equipment_types WHERE slot = ?)
    `, [userId, equipment.slot]);

    // Equip the new item
    await db.run('UPDATE user_equipment SET is_equipped = 1 WHERE id = ?', [equipmentId]);

    res.json({ 
      message: `${equipment.display_name} angelegt!`,
      slot: equipment.slot
    });
  } catch (error) {
    console.error('Equip error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Unequip an item
router.post('/unequip/:equipmentId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { equipmentId } = req.params;

    const equipment = await db.get(`
      SELECT ue.*, et.display_name
      FROM user_equipment ue
      JOIN equipment_types et ON ue.equipment_type_id = et.id
      WHERE ue.id = ? AND ue.user_id = ?
    `, [equipmentId, userId]);

    if (!equipment) {
      return res.status(404).json({ error: 'Ausrüstung nicht gefunden' });
    }

    await db.run('UPDATE user_equipment SET is_equipped = 0 WHERE id = ?', [equipmentId]);

    res.json({ message: `${equipment.display_name} abgelegt` });
  } catch (error) {
    console.error('Unequip error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Discard/sell equipment
router.delete('/:equipmentId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { equipmentId } = req.params;
    const { sell } = req.query; // ?sell=true to sell instead of discard

    const equipment = await db.get(`
      SELECT ue.*, et.display_name, et.rarity, et.required_level
      FROM user_equipment ue
      JOIN equipment_types et ON ue.equipment_type_id = et.id
      WHERE ue.id = ? AND ue.user_id = ?
    `, [equipmentId, userId]);

    if (!equipment) {
      return res.status(404).json({ error: 'Ausrüstung nicht gefunden' });
    }

    // Calculate sell price based on quality and rarity
    let goldGained = 0;
    if (sell === 'true') {
      const rarityMultipliers = { common: 1, uncommon: 2, rare: 5, epic: 15, legendary: 50 };
      const basePrice = equipment.required_level * 2 * (rarityMultipliers[equipment.rarity] || 1);
      const qualityMultiplier = QUALITY_MULTIPLIERS[equipment.quality] || 1.0;
      goldGained = Math.floor(basePrice * qualityMultiplier);

      await db.run('UPDATE users SET gold = gold + ? WHERE id = ?', [goldGained, userId]);
    }

    await db.run('DELETE FROM user_equipment WHERE id = ?', [equipmentId]);

    res.json({ 
      message: sell === 'true' 
        ? `${equipment.display_name} für ${goldGained} Gold verkauft!` 
        : `${equipment.display_name} entsorgt`,
      goldGained
    });
  } catch (error) {
    console.error('Delete equipment error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get profession stats
router.get('/professions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const professions = await db.all(`
      SELECT * FROM profession_stats WHERE user_id = ?
    `, [userId]);

    // Calculate exp needed for each level
    const professionData = professions.map(p => {
      const expForNextLevel = p.level * 100; // Simple formula: level * 100
      return {
        ...p,
        exp_for_next_level: expForNextLevel,
        progress_percent: Math.min(100, Math.floor((p.experience / expForNextLevel) * 100))
      };
    });

    // Add missing professions with level 0
    const allProfessions = ['blacksmith', 'leatherworker', 'tailor', 'alchemist'];
    const professionNames = {
      blacksmith: 'Schmied',
      leatherworker: 'Lederarbeiter',
      tailor: 'Schneider',
      alchemist: 'Alchemist'
    };

    const result = allProfessions.map(prof => {
      const existing = professionData.find(p => p.profession === prof);
      if (existing) {
        return { ...existing, display_name: professionNames[prof] };
      }
      return {
        profession: prof,
        display_name: professionNames[prof],
        level: 1,
        experience: 0,
        exp_for_next_level: 100,
        progress_percent: 0
      };
    });

    res.json({ professions: result });
  } catch (error) {
    console.error('Get professions error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get craftable equipment recipes
router.get('/recipes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's profession levels
    const professions = await db.all('SELECT * FROM profession_stats WHERE user_id = ?', [userId]);
    const professionLevels = {};
    professions.forEach(p => { professionLevels[p.profession] = p.level; });

    // Get user's forge level (from buildings)
    const forge = await db.get(`
      SELECT ub.level 
      FROM user_buildings ub
      JOIN buildings b ON ub.building_id = b.id
      WHERE ub.user_id = ? AND b.name = 'schmiede'
    `, [userId]);
    const forgeLevel = forge?.level || 0;

    // Get all recipes with materials
    const recipes = await db.all(`
      SELECT 
        er.*,
        et.id as equipment_id,
        et.name,
        et.display_name,
        et.description,
        et.slot,
        et.image_path,
        et.base_attack,
        et.base_defense,
        et.base_health,
        et.required_level as player_level_required,
        et.rarity
      FROM equipment_recipes er
      JOIN equipment_types et ON er.equipment_type_id = et.id
      ORDER BY er.required_profession_level, et.slot
    `);

    // Get materials for each recipe
    const recipesWithMaterials = await Promise.all(recipes.map(async recipe => {
      const materials = await db.all(`
        SELECT erm.*, i.display_name as item_name, i.image_path as item_image
        FROM equipment_recipe_materials erm
        JOIN items i ON erm.item_id = i.id
        WHERE erm.recipe_id = ?
      `, [recipe.id]);

      const userProfLevel = professionLevels[recipe.profession] || 1;
      const canCraft = userProfLevel >= recipe.required_profession_level;

      return {
        ...recipe,
        materials,
        can_craft: canCraft,
        user_profession_level: userProfLevel,
        forge_level: forgeLevel
      };
    }));

    res.json({ recipes: recipesWithMaterials });
  } catch (error) {
    console.error('Get recipes error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Helper: Check if user is at home
async function isUserAtHome(userId) {
  const user = await db.get('SELECT world_x, world_y, home_x, home_y FROM users WHERE id = ?', [userId]);
  const homeX = user.home_x ?? 0;
  const homeY = user.home_y ?? 0;
  const distance = Math.sqrt(
    Math.pow((user.world_x || 0) - homeX, 2) + 
    Math.pow((user.world_y || 0) - homeY, 2)
  );
  return distance <= 50;
}

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
  
  // Check crafting jobs - only if not yet finished (finish_at in future and not paused)
  const craftingJob = await db.get(
    "SELECT id, finish_at, paused_at FROM crafting_jobs WHERE user_id = ? AND is_completed = 0",
    [userId]
  );
  if (craftingJob) {
    // If paused, it's still "active" (blocking)
    if (craftingJob.paused_at) {
      return { active: true, type: 'Herstellungs-Auftrag (pausiert)' };
    }
    // If not finished yet, it's still "active"
    if (new Date(craftingJob.finish_at) > new Date()) {
      return { active: true, type: 'Herstellungs-Auftrag' };
    }
    // If finished (finish_at <= now), don't count as active - ready to collect!
  }
  
  return { active: false };
}

// Helper: Calculate quality based on profession level and forge level
function calculateQuality(professionLevel, forgeLevel) {
  const skillBonus = professionLevel * 5;
  const forgeBonus = forgeLevel * 10;
  const totalBonus = skillBonus + forgeBonus;
  
  const roll = Math.random() * 100;
  
  if (roll < 2 + totalBonus * 0.02) return 'legendary';
  else if (roll < 8 + totalBonus * 0.1) return 'masterwork';
  else if (roll < 20 + totalBonus * 0.2) return 'excellent';
  else if (roll < 40 + totalBonus * 0.3) return 'good';
  else if (roll < 70) return 'normal';
  else return 'poor';
}

// Get active crafting job
router.get('/crafting', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const job = await db.get(`
      SELECT 
        cj.*,
        er.experience_reward,
        er.profession,
        et.display_name,
        et.image_path,
        et.slot
      FROM crafting_jobs cj
      JOIN equipment_recipes er ON cj.recipe_id = er.id
      JOIN equipment_types et ON er.equipment_type_id = et.id
      WHERE cj.user_id = ? AND cj.is_completed = 0
    `, [userId]);
    
    if (!job) {
      return res.json({ crafting: null });
    }
    
    // Check if user is at home to determine pause state
    const atHome = await isUserAtHome(userId);
    const now = new Date();
    
    if (job.paused_at && atHome) {
      // User returned home - resume crafting
      const remainingMs = job.remaining_seconds * 1000;
      const newFinishAt = new Date(now.getTime() + remainingMs);
      
      await db.run(`
        UPDATE crafting_jobs 
        SET paused_at = NULL, remaining_seconds = NULL, finish_at = ?
        WHERE id = ?
      `, [newFinishAt.toISOString(), job.id]);
      
      job.paused_at = null;
      job.finish_at = newFinishAt.toISOString();
    } else if (!job.paused_at && !atHome) {
      // User left home - pause crafting
      const finishAt = new Date(job.finish_at);
      const remainingMs = Math.max(0, finishAt.getTime() - now.getTime());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      
      await db.run(`
        UPDATE crafting_jobs 
        SET paused_at = ?, remaining_seconds = ?
        WHERE id = ?
      `, [now.toISOString(), remainingSeconds, job.id]);
      
      job.paused_at = now.toISOString();
      job.remaining_seconds = remainingSeconds;
    }
    
    // Calculate remaining time
    let remainingSeconds;
    if (job.paused_at) {
      remainingSeconds = job.remaining_seconds;
    } else {
      const finishAt = new Date(job.finish_at);
      remainingSeconds = Math.max(0, Math.ceil((finishAt.getTime() - now.getTime()) / 1000));
    }
    
    // Check if finished
    if (remainingSeconds <= 0 && !job.paused_at) {
      return res.json({ 
        crafting: { ...job, is_ready: true, remaining_seconds: 0 }
      });
    }
    
    res.json({ 
      crafting: {
        ...job,
        remaining_seconds: remainingSeconds,
        is_paused: !!job.paused_at,
        is_ready: false
      }
    });
  } catch (error) {
    console.error('Get crafting job error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// IMPORTANT: Static routes must come BEFORE parameterized routes!
// /craft/collect and /craft/cancel must be defined before /craft/:recipeId

// Collect finished crafted item
router.post('/craft/collect', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get the active job
    const job = await db.get(`
      SELECT 
        cj.*,
        er.experience_reward,
        er.profession,
        er.equipment_type_id,
        et.display_name
      FROM crafting_jobs cj
      JOIN equipment_recipes er ON cj.recipe_id = er.id
      JOIN equipment_types et ON er.equipment_type_id = et.id
      WHERE cj.user_id = ? AND cj.is_completed = 0
    `, [userId]);

    if (!job) {
      return res.status(404).json({ error: 'Kein aktiver Herstellungsauftrag' });
    }

    // Check if finished (and not paused)
    if (job.paused_at) {
      return res.status(400).json({ 
        error: 'Herstellung ist pausiert. Geh nach Hause um fortzufahren!',
        isPaused: true
      });
    }

    const now = new Date();
    const finishAt = new Date(job.finish_at);
    
    if (now < finishAt) {
      const remainingSeconds = Math.ceil((finishAt.getTime() - now.getTime()) / 1000);
      return res.status(400).json({ 
        error: `Noch nicht fertig! Noch ${remainingSeconds} Sekunden.`,
        notReady: true,
        remaining_seconds: remainingSeconds
      });
    }

    // Create the equipment
    await db.run(`
      INSERT INTO user_equipment (user_id, equipment_type_id, quality, quality_bonus)
      VALUES (?, ?, ?, ?)
    `, [userId, job.equipment_type_id, job.quality, QUALITY_MULTIPLIERS[job.quality]]);

    // Award profession experience
    let professionStats = await db.get(
      'SELECT * FROM profession_stats WHERE user_id = ? AND profession = ?',
      [userId, job.profession]
    );

    let newExp = (professionStats?.experience || 0) + job.experience_reward;
    let newLevel = professionStats?.level || 1;
    let leveledUp = false;
    const expForNextLevel = newLevel * 100;

    if (newExp >= expForNextLevel) {
      newLevel++;
      newExp -= expForNextLevel;
      leveledUp = true;
    }

    await db.run(`
      UPDATE profession_stats SET level = ?, experience = ? WHERE user_id = ? AND profession = ?
    `, [newLevel, newExp, userId, job.profession]);

    // Mark job as completed
    await db.run('UPDATE crafting_jobs SET is_completed = 1 WHERE id = ?', [job.id]);

    // Track statistics
    await trackCrafting(userId, job.equipment_type_id, true);

    res.json({
      message: `${job.display_name} (${QUALITY_NAMES[job.quality]}) hergestellt!`,
      quality: job.quality,
      quality_name: QUALITY_NAMES[job.quality],
      quality_color: QUALITY_COLORS[job.quality],
      experience_gained: job.experience_reward,
      profession_level: newLevel,
      profession_exp: newExp,
      leveled_up: leveledUp
    });
  } catch (error) {
    console.error('Collect craft error:', error);
    res.status(500).json({ error: 'Serverfehler beim Abholen' });
  }
});

// Cancel crafting (lose materials)
router.delete('/craft/cancel', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const job = await db.get(`
      SELECT cj.*, et.display_name
      FROM crafting_jobs cj
      JOIN equipment_recipes er ON cj.recipe_id = er.id
      JOIN equipment_types et ON er.equipment_type_id = et.id
      WHERE cj.user_id = ? AND cj.is_completed = 0
    `, [userId]);

    if (!job) {
      return res.status(404).json({ error: 'Kein aktiver Herstellungsauftrag zum Abbrechen' });
    }

    await db.run('DELETE FROM crafting_jobs WHERE id = ?', [job.id]);

    res.json({
      message: `Herstellung von ${job.display_name} abgebrochen. Materialien verloren.`
    });
  } catch (error) {
    console.error('Cancel craft error:', error);
    res.status(500).json({ error: 'Serverfehler beim Abbrechen' });
  }
});

// Start crafting (creates a timed job) - MUST be after /craft/collect and /craft/cancel
router.post('/craft/:recipeId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { recipeId } = req.params;

    // Check if user has ANY active job
    const jobCheck = await hasActiveJob(userId);
    if (jobCheck.active) {
      return res.status(400).json({ 
        error: `Du hast bereits einen aktiven ${jobCheck.type}. Schließe ihn zuerst ab!`,
        hasActiveJob: true
      });
    }

    // Check if player is at home
    const atHome = await isUserAtHome(userId);
    if (!atHome) {
      return res.status(400).json({ 
        error: 'Du musst zu Hause sein um Ausrüstung zu schmieden!',
        notAtHome: true
      });
    }

    // Get the recipe
    const recipe = await db.get(`
      SELECT er.*, et.display_name, et.id as equipment_type_id
      FROM equipment_recipes er
      JOIN equipment_types et ON er.equipment_type_id = et.id
      WHERE er.id = ?
    `, [recipeId]);

    if (!recipe) {
      return res.status(404).json({ error: 'Rezept nicht gefunden' });
    }

    // Check profession level
    let professionStats = await db.get(
      'SELECT * FROM profession_stats WHERE user_id = ? AND profession = ?',
      [userId, recipe.profession]
    );

    if (!professionStats) {
      await db.run(`
        INSERT INTO profession_stats (user_id, profession, level, experience)
        VALUES (?, ?, 1, 0)
      `, [userId, recipe.profession]);
      professionStats = { level: 1, experience: 0 };
    }

    if (professionStats.level < recipe.required_profession_level) {
      return res.status(400).json({ 
        error: `Du brauchst ${recipe.profession === 'blacksmith' ? 'Schmied' : recipe.profession} Level ${recipe.required_profession_level}` 
      });
    }

    // Check materials
    const materials = await db.all(`
      SELECT erm.*, i.display_name as item_name
      FROM equipment_recipe_materials erm
      JOIN items i ON erm.item_id = i.id
      WHERE erm.recipe_id = ?
    `, [recipeId]);

    for (const mat of materials) {
      const inventory = await db.get(
        'SELECT quantity FROM user_inventory WHERE user_id = ? AND item_id = ?',
        [userId, mat.item_id]
      );
      
      if (!inventory || inventory.quantity < mat.quantity) {
        return res.status(400).json({ 
          error: `Nicht genug ${mat.item_name} (${inventory?.quantity || 0}/${mat.quantity})` 
        });
      }
    }

    // Remove materials from inventory
    for (const mat of materials) {
      await db.run(`
        UPDATE user_inventory SET quantity = quantity - ? WHERE user_id = ? AND item_id = ?
      `, [mat.quantity, userId, mat.item_id]);
    }
    await db.run('DELETE FROM user_inventory WHERE quantity <= 0');

    // Get forge level for quality calculation
    const forge = await db.get(`
      SELECT ub.level 
      FROM user_buildings ub
      JOIN buildings b ON ub.building_id = b.id
      WHERE ub.user_id = ? AND b.name = 'schmiede'
    `, [userId]);
    const forgeLevel = forge?.level || 1;

    // Pre-calculate quality (determined at start)
    const quality = calculateQuality(professionStats.level, forgeLevel);

    // Calculate craft time (base time from recipe, reduced by profession level)
    const baseCraftTime = recipe.craft_time || 60; // seconds
    const timeReduction = Math.min(0.5, professionStats.level * 0.02); // Up to 50% reduction
    const actualCraftTime = Math.ceil(baseCraftTime * (1 - timeReduction));

    const now = new Date();
    const finishAt = new Date(now.getTime() + actualCraftTime * 1000);

    // Create crafting job
    await db.run(`
      INSERT INTO crafting_jobs (user_id, recipe_id, quality, started_at, finish_at)
      VALUES (?, ?, ?, ?, ?)
    `, [userId, recipeId, quality, now.toISOString(), finishAt.toISOString()]);

    res.json({
      message: `Herstellung von ${recipe.display_name} gestartet!`,
      craft_time: actualCraftTime,
      finish_at: finishAt.toISOString(),
      quality_preview: QUALITY_NAMES[quality] // Show quality preview
    });
  } catch (error) {
    console.error('Start craft error:', error);
    res.status(500).json({ error: 'Serverfehler beim Starten der Herstellung' });
  }
});

export default router;
