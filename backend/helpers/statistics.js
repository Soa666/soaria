import db from '../database.js';

/**
 * Updates user statistics and checks quest progress
 * @param {number} userId - The user ID
 * @param {string} statName - The statistic field name
 * @param {number} amount - Amount to add (default 1)
 */
export async function updateStatistic(userId, statName, amount = 1) {
  try {
    // Make sure user has statistics row
    await db.run(`
      INSERT OR IGNORE INTO user_statistics (user_id) VALUES (?)
    `, [userId]);

    // Update the specific statistic
    await db.run(`
      UPDATE user_statistics 
      SET ${statName} = ${statName} + ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `, [amount, userId]);

    // Check and update quest progress
    await checkQuestProgress(userId, statName, amount);
  } catch (error) {
    console.error(`Error updating statistic ${statName}:`, error);
  }
}

/**
 * Update multiple statistics at once
 * @param {number} userId - The user ID
 * @param {Object} stats - Object with stat names as keys and amounts as values
 */
export async function updateMultipleStats(userId, stats) {
  try {
    await db.run(`INSERT OR IGNORE INTO user_statistics (user_id) VALUES (?)`, [userId]);

    const setClauses = Object.keys(stats).map(stat => `${stat} = ${stat} + ?`).join(', ');
    const values = [...Object.values(stats), userId];

    await db.run(`
      UPDATE user_statistics 
      SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `, values);

    // Check quest progress for each stat
    for (const [statName, amount] of Object.entries(stats)) {
      await checkQuestProgress(userId, statName, amount);
    }
  } catch (error) {
    console.error('Error updating multiple statistics:', error);
  }
}

/**
 * Check and update quest progress based on statistic changes
 */
async function checkQuestProgress(userId, statName, amount) {
  try {
    // Map statistic names to quest objective types
    const statToObjectiveMap = {
      'monsters_killed': 'kill_monster',
      'bosses_killed': 'kill_boss',
      'players_killed': 'defeat_player',
      'resources_collected': 'collect_resource',
      'items_crafted': 'craft_item',
      'equipment_crafted': 'craft_equipment',
      'buildings_built': 'build_building',
      'buildings_upgraded': 'upgrade_building',
      'distance_traveled': 'travel_distance',
      'gold_earned': 'earn_gold',
      'gold_spent': 'spend_gold',
      'trades_completed': 'complete_trade',
      'messages_sent': 'send_message'
    };

    const objectiveType = statToObjectiveMap[statName];
    if (!objectiveType) return;

    // Find active quests with matching objectives (where target_id is NULL = any)
    const activeObjectives = await db.all(`
      SELECT qo.id, qo.quest_id, qo.required_amount, uqp.current_amount
      FROM quest_objectives qo
      JOIN user_quests uq ON qo.quest_id = uq.quest_id
      LEFT JOIN user_quest_progress uqp ON qo.id = uqp.objective_id AND uqp.user_id = ?
      WHERE uq.user_id = ? AND uq.status = 'active'
        AND qo.objective_type = ?
        AND qo.target_id IS NULL
        AND (uqp.is_completed IS NULL OR uqp.is_completed = 0)
    `, [userId, userId, objectiveType]);

    for (const objective of activeObjectives) {
      await updateQuestObjectiveProgress(userId, objective.quest_id, objective.id, amount);
    }
  } catch (error) {
    console.error('Error checking quest progress:', error);
  }
}

/**
 * Update progress for a specific quest objective
 */
export async function updateQuestObjectiveProgress(userId, questId, objectiveId, amount = 1) {
  try {
    // Insert or update progress
    await db.run(`
      INSERT INTO user_quest_progress (user_id, quest_id, objective_id, current_amount)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, objective_id) DO UPDATE SET 
        current_amount = current_amount + ?
    `, [userId, questId, objectiveId, amount, amount]);

    // Check if objective is now completed
    const objective = await db.get(`
      SELECT qo.required_amount, uqp.current_amount
      FROM quest_objectives qo
      JOIN user_quest_progress uqp ON qo.id = uqp.objective_id
      WHERE uqp.user_id = ? AND uqp.objective_id = ?
    `, [userId, objectiveId]);

    if (objective && objective.current_amount >= objective.required_amount) {
      await db.run(`
        UPDATE user_quest_progress SET is_completed = 1
        WHERE user_id = ? AND objective_id = ?
      `, [userId, objectiveId]);

      // Check if all objectives for this quest are completed
      await checkQuestCompletion(userId, questId);
    }
  } catch (error) {
    console.error('Error updating quest objective progress:', error);
  }
}

/**
 * Check if all quest objectives are completed
 */
async function checkQuestCompletion(userId, questId) {
  try {
    const incompleteObjectives = await db.get(`
      SELECT COUNT(*) as count
      FROM quest_objectives qo
      LEFT JOIN user_quest_progress uqp ON qo.id = uqp.objective_id AND uqp.user_id = ?
      WHERE qo.quest_id = ? AND (uqp.is_completed IS NULL OR uqp.is_completed = 0)
    `, [userId, questId]);

    if (incompleteObjectives.count === 0) {
      // All objectives completed - mark quest as completed
      await db.run(`
        UPDATE user_quests 
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND quest_id = ?
      `, [userId, questId]);
    }
  } catch (error) {
    console.error('Error checking quest completion:', error);
  }
}

/**
 * Track a specific kill (monster with ID)
 */
export async function trackKill(userId, monsterTypeId, isBoss = false) {
  try {
    // Update general stats
    if (isBoss) {
      await updateStatistic(userId, 'bosses_killed', 1);
    }
    await updateStatistic(userId, 'monsters_killed', 1);

    // Check for specific monster kill quests
    const activeObjectives = await db.all(`
      SELECT qo.id, qo.quest_id
      FROM quest_objectives qo
      JOIN user_quests uq ON qo.quest_id = uq.quest_id
      LEFT JOIN user_quest_progress uqp ON qo.id = uqp.objective_id AND uqp.user_id = ?
      WHERE uq.user_id = ? AND uq.status = 'active'
        AND qo.objective_type = 'kill_specific_monster'
        AND qo.target_id = ?
        AND (uqp.is_completed IS NULL OR uqp.is_completed = 0)
    `, [userId, userId, monsterTypeId]);

    for (const objective of activeObjectives) {
      await updateQuestObjectiveProgress(userId, objective.quest_id, objective.id, 1);
    }
  } catch (error) {
    console.error('Error tracking kill:', error);
  }
}

/**
 * Track item collection
 */
export async function trackItemCollected(userId, itemId, itemName, quantity = 1) {
  try {
    // Update general stat
    await updateStatistic(userId, 'resources_collected', quantity);

    // Update specific resource stats based on item name
    const itemStatMap = {
      'holz': 'wood_collected',
      'wood': 'wood_collected',
      'ast': 'wood_collected',
      'stein': 'stone_collected',
      'stone': 'stone_collected',
      'eisenerz': 'iron_ore_collected',
      'iron_ore': 'iron_ore_collected',
      'kraut': 'herbs_collected',
      'herb': 'herbs_collected',
      'kräuter': 'herbs_collected'
    };

    const itemNameLower = (itemName || '').toLowerCase();
    for (const [key, stat] of Object.entries(itemStatMap)) {
      if (itemNameLower.includes(key)) {
        await updateStatistic(userId, stat, quantity);
        break;
      }
    }

    // Check for specific item collection quests
    const activeObjectives = await db.all(`
      SELECT qo.id, qo.quest_id
      FROM quest_objectives qo
      JOIN user_quests uq ON qo.quest_id = uq.quest_id
      LEFT JOIN user_quest_progress uqp ON qo.id = uqp.objective_id AND uqp.user_id = ?
      WHERE uq.user_id = ? AND uq.status = 'active'
        AND qo.objective_type = 'collect_specific_item'
        AND qo.target_id = ?
        AND (uqp.is_completed IS NULL OR uqp.is_completed = 0)
    `, [userId, userId, itemId]);

    for (const objective of activeObjectives) {
      await updateQuestObjectiveProgress(userId, objective.quest_id, objective.id, quantity);
    }
  } catch (error) {
    console.error('Error tracking item collected:', error);
  }
}

/**
 * Track crafting
 */
export async function trackCrafting(userId, itemId, isEquipment = false) {
  try {
    await updateStatistic(userId, 'items_crafted', 1);
    if (isEquipment) {
      await updateStatistic(userId, 'equipment_crafted', 1);
    }

    // Check for specific crafting quests
    const objectiveType = isEquipment ? 'craft_equipment' : 'craft_specific_item';
    const activeObjectives = await db.all(`
      SELECT qo.id, qo.quest_id
      FROM quest_objectives qo
      JOIN user_quests uq ON qo.quest_id = uq.quest_id
      LEFT JOIN user_quest_progress uqp ON qo.id = uqp.objective_id AND uqp.user_id = ?
      WHERE uq.user_id = ? AND uq.status = 'active'
        AND (qo.objective_type = ? OR (qo.objective_type = 'craft_specific_item' AND qo.target_id = ?))
        AND (uqp.is_completed IS NULL OR uqp.is_completed = 0)
    `, [userId, userId, objectiveType, itemId]);

    for (const objective of activeObjectives) {
      await updateQuestObjectiveProgress(userId, objective.quest_id, objective.id, 1);
    }
  } catch (error) {
    console.error('Error tracking crafting:', error);
  }
}

/**
 * Track building construction/upgrade
 */
export async function trackBuilding(userId, buildingId, isUpgrade = false) {
  try {
    if (isUpgrade) {
      await updateStatistic(userId, 'buildings_upgraded', 1);
    } else {
      await updateStatistic(userId, 'buildings_built', 1);
    }

    // Check for specific building quests
    const activeObjectives = await db.all(`
      SELECT qo.id, qo.quest_id
      FROM quest_objectives qo
      JOIN user_quests uq ON qo.quest_id = uq.quest_id
      LEFT JOIN user_quest_progress uqp ON qo.id = uqp.objective_id AND uqp.user_id = ?
      WHERE uq.user_id = ? AND uq.status = 'active'
        AND qo.objective_type = 'build_specific_building'
        AND qo.target_id = ?
        AND (uqp.is_completed IS NULL OR uqp.is_completed = 0)
    `, [userId, userId, buildingId]);

    for (const objective of activeObjectives) {
      await updateQuestObjectiveProgress(userId, objective.quest_id, objective.id, 1);
    }
  } catch (error) {
    console.error('Error tracking building:', error);
  }
}

/**
 * Track travel distance
 */
export async function trackTravel(userId, distance) {
  try {
    const tiles = Math.round(distance);
    await updateMultipleStats(userId, {
      distance_traveled: tiles,
      tiles_walked: tiles
    });
  } catch (error) {
    console.error('Error tracking travel:', error);
  }
}

/**
 * Get user statistics
 */
export async function getUserStatistics(userId) {
  try {
    // Ensure stats exist
    await db.run(`INSERT OR IGNORE INTO user_statistics (user_id) VALUES (?)`, [userId]);
    
    return await db.get('SELECT * FROM user_statistics WHERE user_id = ?', [userId]);
  } catch (error) {
    console.error('Error getting user statistics:', error);
    return null;
  }
}

export default {
  updateStatistic,
  updateMultipleStats,
  updateQuestObjectiveProgress,
  trackKill,
  trackItemCollected,
  trackCrafting,
  trackBuilding,
  trackTravel,
  getUserStatistics
};
