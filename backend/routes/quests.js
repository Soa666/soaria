import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { updateStatistic } from '../helpers/statistics.js';
import { sendDiscordWebhook } from '../utils/discord.js';

const router = express.Router();

// ============== OBJECTIVE TYPES ==============
const OBJECTIVE_TYPES = [
  'kill_monster', 'kill_boss', 'kill_specific_monster',
  'collect_resource', 'collect_specific_item',
  'craft_item', 'craft_specific_item', 'craft_equipment',
  'build_building', 'upgrade_building', 'build_specific_building',
  'travel_distance', 'visit_location',
  'reach_level', 'earn_gold', 'spend_gold',
  'complete_trade', 'send_message',
  'defeat_player', 'daily_login',
  'obtain_legendary', 'obtain_epic', 'obtain_rare', 'join_guild'
];

// Get retroactive progress for an objective based on user's current stats
async function getRetroactiveProgress(userId, objective, userStats) {
  const { objective_type, target_id, required_amount } = objective;
  
  // Map objective types to statistics columns or database queries
  switch (objective_type) {
    // Stats-based objectives (from user_statistics)
    case 'kill_monster':
      return userStats?.monsters_killed || 0;
    case 'kill_boss':
      return userStats?.bosses_killed || 0;
    case 'defeat_player':
      return userStats?.players_killed || 0;
    case 'collect_resource':
      return userStats?.resources_collected || 0;
    case 'craft_item':
      return userStats?.items_crafted || 0;
    case 'craft_equipment':
      return userStats?.equipment_crafted || 0;
    case 'build_building':
      return userStats?.buildings_built || 0;
    case 'upgrade_building':
      return userStats?.buildings_upgraded || 0;
    case 'travel_distance':
      return userStats?.distance_traveled || 0;
    case 'earn_gold':
      return userStats?.gold_earned || 0;
    case 'spend_gold':
      return userStats?.gold_spent || 0;
    case 'complete_trade':
      return userStats?.trades_completed || 0;
    case 'send_message':
      return userStats?.messages_sent || 0;
    case 'obtain_legendary':
      return userStats?.legendary_items_obtained || 0;
    case 'obtain_epic':
      return userStats?.epic_items_obtained || 0;
    case 'obtain_rare':
      return userStats?.rare_items_obtained || 0;
      
    // Level-based (check player_stats)
    case 'reach_level':
      const playerStats = await db.get('SELECT level FROM player_stats WHERE user_id = ?', [userId]);
      return playerStats?.level || 1;
      
    // Guild membership
    case 'join_guild':
      const membership = await db.get('SELECT id FROM guild_members WHERE user_id = ?', [userId]);
      return membership ? 1 : 0;
      
    // Specific monster kills (query combat_log)
    case 'kill_specific_monster':
      if (!target_id) return 0;
      const monsterKills = await db.get(`
        SELECT COUNT(*) as count FROM combat_log cl
        JOIN world_npcs wn ON cl.world_npc_id = wn.id
        WHERE cl.attacker_user_id = ? AND wn.monster_type_id = ? AND cl.winner = 'attacker'
      `, [userId, target_id]);
      return monsterKills?.count || 0;
      
    // Specific item collection (query inventory history or current inventory)
    case 'collect_specific_item':
      if (!target_id) return 0;
      // Check current inventory as a minimum
      const itemInInventory = await db.get(`
        SELECT quantity FROM user_inventory WHERE user_id = ? AND item_id = ?
      `, [userId, target_id]);
      return itemInInventory?.quantity || 0;
      
    // Specific crafting (query user_equipment for equipment, or crafting_jobs)
    case 'craft_specific_item':
      if (!target_id) return 0;
      const craftedEquipment = await db.get(`
        SELECT COUNT(*) as count FROM user_equipment WHERE user_id = ? AND equipment_type_id = ?
      `, [userId, target_id]);
      return craftedEquipment?.count || 0;
      
    // Specific building
    case 'build_specific_building':
      if (!target_id) return 0;
      const building = await db.get(`
        SELECT COUNT(*) as count FROM user_buildings WHERE user_id = ? AND building_id = ?
      `, [userId, target_id]);
      return building?.count || 0;
      
    // Daily login doesn't support retroactive
    case 'daily_login':
      return 0;
      
    default:
      return 0;
  }
}

// Get count of claimable quests - MUST be before /:questId routes!
router.get('/claimable-count', authenticateToken, async (req, res) => {
  try {
    const result = await db.get(`
      SELECT COUNT(*) as count 
      FROM user_quests 
      WHERE user_id = ? AND status = 'completed'
    `, [req.user.id]);
    
    res.json({ count: result?.count || 0 });
  } catch (error) {
    console.error('Get claimable count error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get statistics for a user - MUST be before /:questId routes!
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Make sure statistics exist
    await db.run('INSERT OR IGNORE INTO user_statistics (user_id) VALUES (?)', [userId]);

    const stats = await db.get('SELECT * FROM user_statistics WHERE user_id = ?', [userId]);
    const user = await db.get('SELECT username FROM users WHERE id = ?', [userId]);

    res.json({ 
      statistics: stats,
      username: user?.username
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get all available and active quests for user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's current level
    const userStats = await db.get('SELECT level FROM player_stats WHERE user_id = ?', [userId]);
    const userLevel = userStats?.level || 1;

    // Get all quests the user can see (active or completed quests, plus available ones)
    const quests = await db.all(`
      SELECT 
        q.*,
        uq.status as user_status,
        uq.started_at,
        uq.completed_at,
        uq.claimed_at,
        i.display_name as reward_item_name,
        i.image_path as reward_item_image,
        pq.display_name as prerequisite_name
      FROM quests q
      LEFT JOIN user_quests uq ON q.id = uq.quest_id AND uq.user_id = ?
      LEFT JOIN items i ON q.reward_item_id = i.id
      LEFT JOIN quests pq ON q.prerequisite_quest_id = pq.id
      WHERE q.is_active = 1 AND q.min_level <= ?
      ORDER BY q.sort_order, q.category, q.id
    `, [userId, userLevel]);

    // Get objectives and progress for each quest
    for (const quest of quests) {
      const objectives = await db.all(`
        SELECT 
          qo.*,
          COALESCE(uqp.current_amount, 0) as current_amount,
          COALESCE(uqp.is_completed, 0) as is_completed
        FROM quest_objectives qo
        LEFT JOIN user_quest_progress uqp ON qo.id = uqp.objective_id AND uqp.user_id = ?
        WHERE qo.quest_id = ?
        ORDER BY qo.sort_order
      `, [userId, quest.id]);

      quest.objectives = objectives;
      quest.total_objectives = objectives.length;
      quest.completed_objectives = objectives.filter(o => o.is_completed).length;
    }

    // Check prerequisite completion
    for (const quest of quests) {
      if (quest.prerequisite_quest_id) {
        const prereq = quests.find(q => q.id === quest.prerequisite_quest_id);
        quest.prerequisite_completed = prereq?.user_status === 'claimed';
      } else {
        quest.prerequisite_completed = true;
      }
    }

    res.json({ quests });
  } catch (error) {
    console.error('Get quests error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get single quest details
router.get('/:questId', authenticateToken, async (req, res) => {
  try {
    const { questId } = req.params;
    const userId = req.user.id;

    const quest = await db.get(`
      SELECT 
        q.*,
        uq.status as user_status,
        uq.started_at,
        uq.completed_at,
        i.display_name as reward_item_name,
        i.image_path as reward_item_image
      FROM quests q
      LEFT JOIN user_quests uq ON q.id = uq.quest_id AND uq.user_id = ?
      LEFT JOIN items i ON q.reward_item_id = i.id
      WHERE q.id = ?
    `, [userId, questId]);

    if (!quest) {
      return res.status(404).json({ error: 'Quest nicht gefunden' });
    }

    // Get objectives with progress
    const objectives = await db.all(`
      SELECT 
        qo.*,
        COALESCE(uqp.current_amount, 0) as current_amount,
        COALESCE(uqp.is_completed, 0) as is_completed
      FROM quest_objectives qo
      LEFT JOIN user_quest_progress uqp ON qo.id = uqp.objective_id AND uqp.user_id = ?
      WHERE qo.quest_id = ?
      ORDER BY qo.sort_order
    `, [userId, questId]);

    quest.objectives = objectives;

    res.json({ quest });
  } catch (error) {
    console.error('Get quest error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Accept/start a quest
router.post('/:questId/accept', authenticateToken, async (req, res) => {
  try {
    const { questId } = req.params;
    const userId = req.user.id;

    // Check if quest exists and user meets requirements
    const quest = await db.get('SELECT * FROM quests WHERE id = ? AND is_active = 1', [questId]);
    if (!quest) {
      return res.status(404).json({ error: 'Quest nicht gefunden' });
    }

    // Check level requirement
    const userStats = await db.get('SELECT level FROM player_stats WHERE user_id = ?', [userId]);
    if ((userStats?.level || 1) < quest.min_level) {
      return res.status(400).json({ error: `Du musst mindestens Level ${quest.min_level} sein!` });
    }

    // Check prerequisite
    if (quest.prerequisite_quest_id) {
      const prereq = await db.get(
        "SELECT status FROM user_quests WHERE user_id = ? AND quest_id = ? AND status = 'claimed'",
        [userId, quest.prerequisite_quest_id]
      );
      if (!prereq) {
        return res.status(400).json({ error: 'Du musst zuerst die Vorquest abschließen!' });
      }
    }

    // Check if already accepted
    const existing = await db.get(
      'SELECT status FROM user_quests WHERE user_id = ? AND quest_id = ?',
      [userId, questId]
    );

    if (existing?.status === 'active') {
      return res.status(400).json({ error: 'Quest bereits aktiv!' });
    }

    if (existing?.status === 'completed') {
      return res.status(400).json({ error: 'Quest bereits abgeschlossen! Hol dir die Belohnung ab.' });
    }

    if (existing?.status === 'claimed' && !quest.is_repeatable) {
      return res.status(400).json({ error: 'Quest bereits abgeschlossen!' });
    }

    // Start the quest
    await db.run(`
      INSERT INTO user_quests (user_id, quest_id, status, started_at)
      VALUES (?, ?, 'active', CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, quest_id) DO UPDATE SET 
        status = 'active', 
        started_at = CURRENT_TIMESTAMP,
        completed_at = NULL,
        claimed_at = NULL
    `, [userId, questId]);

    // Initialize progress for all objectives with retroactive check
    const objectives = await db.all('SELECT * FROM quest_objectives WHERE quest_id = ?', [questId]);
    
    // Get user statistics for retroactive progress
    const userStatistics = await db.get('SELECT * FROM user_statistics WHERE user_id = ?', [userId]);
    
    let allCompleted = true;
    let anyProgress = false;

    for (const obj of objectives) {
      // Calculate retroactive progress based on objective type
      let retroactiveProgress = 0;
      
      if (userStatistics) {
        retroactiveProgress = await getRetroactiveProgress(userId, obj, userStatistics);
      }
      
      const isCompleted = retroactiveProgress >= obj.required_amount;
      const currentAmount = Math.min(retroactiveProgress, obj.required_amount);
      
      if (!isCompleted) {
        allCompleted = false;
      }
      if (currentAmount > 0) {
        anyProgress = true;
      }

      await db.run(`
        INSERT INTO user_quest_progress (user_id, quest_id, objective_id, current_amount, is_completed)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, objective_id) DO UPDATE SET 
          current_amount = ?, 
          is_completed = ?
      `, [userId, questId, obj.id, currentAmount, isCompleted ? 1 : 0, currentAmount, isCompleted ? 1 : 0]);
    }

    // If all objectives are already completed (retroactive), mark quest as completed
    if (allCompleted && objectives.length > 0) {
      await db.run(`
        UPDATE user_quests SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND quest_id = ?
      `, [userId, questId]);
      
      return res.json({ 
        message: `Quest "${quest.display_name}" angenommen und sofort abgeschlossen! 🎉 Hole deine Belohnung ab!`,
        alreadyCompleted: true
      });
    }

    const progressMsg = anyProgress ? ' (Fortschritt übernommen!)' : '';
    res.json({ message: `Quest "${quest.display_name}" angenommen!${progressMsg}` });
  } catch (error) {
    console.error('Accept quest error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Claim quest rewards
router.post('/:questId/claim', authenticateToken, async (req, res) => {
  try {
    const { questId } = req.params;
    const userId = req.user.id;

    // Check quest status
    const userQuest = await db.get(
      'SELECT status FROM user_quests WHERE user_id = ? AND quest_id = ?',
      [userId, questId]
    );

    if (!userQuest) {
      return res.status(400).json({ error: 'Quest nicht gestartet!' });
    }

    if (userQuest.status !== 'completed') {
      return res.status(400).json({ error: 'Quest noch nicht abgeschlossen!' });
    }

    // Get quest rewards
    const quest = await db.get('SELECT * FROM quests WHERE id = ?', [questId]);
    
    const rewards = [];

    // Gold reward
    if (quest.reward_gold > 0) {
      await db.run('UPDATE users SET gold = gold + ? WHERE id = ?', [quest.reward_gold, userId]);
      await updateStatistic(userId, 'gold_earned', quest.reward_gold);
      rewards.push({ type: 'gold', amount: quest.reward_gold });
    }

    // Experience reward
    if (quest.reward_experience > 0) {
      const playerStats = await db.get('SELECT * FROM player_stats WHERE user_id = ?', [userId]);
      let newExp = (playerStats?.experience || 0) + quest.reward_experience;
      let newLevel = playerStats?.level || 1;
      const expForNextLevel = newLevel * 100;

      if (newExp >= expForNextLevel) {
        newLevel++;
        newExp -= expForNextLevel;
      }

      await db.run('UPDATE player_stats SET experience = ?, level = ? WHERE user_id = ?', 
        [newExp, newLevel, userId]);
      rewards.push({ type: 'experience', amount: quest.reward_experience });
    }

    // Item reward
    if (quest.reward_item_id) {
      await db.run(`
        INSERT INTO user_inventory (user_id, item_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + ?
      `, [userId, quest.reward_item_id, quest.reward_item_quantity, quest.reward_item_quantity]);
      
      const item = await db.get('SELECT display_name FROM items WHERE id = ?', [quest.reward_item_id]);
      rewards.push({ 
        type: 'item', 
        amount: quest.reward_item_quantity,
        name: item?.display_name || 'Item'
      });
    }

    // Mark as claimed
    await db.run(`
      UPDATE user_quests SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND quest_id = ?
    `, [userId, questId]);

    // Update statistics
    await updateStatistic(userId, 'quests_completed', 1);

    // Send Discord webhook for achievements
    if (quest.category === 'achievement') {
      try {
        const achievementWebhook = await db.get(
          "SELECT webhook_url, message_template FROM discord_webhooks WHERE event_type = 'achievement' AND enabled = 1"
        );

        if (achievementWebhook && achievementWebhook.webhook_url) {
          const user = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
          
          let message = achievementWebhook.message_template || 
            '🎊🎉 **Erfolg freigeschaltet!** 🎉🎊\n\n**{{username}}** hat den Erfolg erhalten:\n🏆 **{{achievement}}**\n\n_{{description}}_';
          
          message = message
            .replace(/\{\{username\}\}/g, user?.username || 'Unbekannt')
            .replace(/\{\{achievement\}\}/g, quest.display_name)
            .replace(/\{\{description\}\}/g, quest.description || '')
            .replace(/\{\{reward_gold\}\}/g, quest.reward_gold || 0)
            .replace(/\{\{reward_exp\}\}/g, quest.reward_experience || 0);

          await sendDiscordWebhook(achievementWebhook.webhook_url, message);
        }
      } catch (webhookError) {
        console.error('Error sending achievement Discord webhook:', webhookError);
      }
    }

    res.json({ 
      message: `Quest "${quest.display_name}" abgeschlossen!`,
      rewards
    });
  } catch (error) {
    console.error('Claim quest error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Abandon quest
router.post('/:questId/abandon', authenticateToken, async (req, res) => {
  try {
    const { questId } = req.params;
    const userId = req.user.id;

    // Check if quest has daily_login objective (can't be abandoned)
    const hasDailyLogin = await db.get(`
      SELECT 1 FROM quest_objectives WHERE quest_id = ? AND objective_type = 'daily_login'
    `, [questId]);

    if (hasDailyLogin) {
      return res.status(400).json({ error: 'Diese Quest kann nicht abgebrochen werden!' });
    }

    // Check quest status
    const userQuest = await db.get(
      'SELECT status FROM user_quests WHERE user_id = ? AND quest_id = ?',
      [userId, questId]
    );

    if (!userQuest || userQuest.status !== 'active') {
      return res.status(400).json({ error: 'Quest nicht aktiv!' });
    }

    // Reset quest progress
    await db.run('DELETE FROM user_quest_progress WHERE user_id = ? AND quest_id = ?', [userId, questId]);
    await db.run('DELETE FROM user_quests WHERE user_id = ? AND quest_id = ?', [userId, questId]);

    res.json({ message: 'Quest abgebrochen' });
  } catch (error) {
    console.error('Abandon quest error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// ============== ADMIN ROUTES ==============

// Get all quests (admin)
router.get('/admin/all', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const quests = await db.all(`
      SELECT q.*, i.display_name as reward_item_name,
        (SELECT COUNT(*) FROM user_quests uq WHERE uq.quest_id = q.id AND uq.status = 'claimed') as completions
      FROM quests q
      LEFT JOIN items i ON q.reward_item_id = i.id
      ORDER BY q.sort_order, q.id
    `);

    for (const quest of quests) {
      quest.objectives = await db.all('SELECT * FROM quest_objectives WHERE quest_id = ? ORDER BY sort_order', [quest.id]);
    }

    res.json({ quests });
  } catch (error) {
    console.error('Admin get quests error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Create quest (admin)
router.post('/admin', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { 
      name, display_name, description, category,
      is_repeatable, cooldown_hours, min_level, prerequisite_quest_id,
      reward_gold, reward_experience, reward_item_id, reward_item_quantity,
      objectives, sort_order
    } = req.body;

    if (!name || !display_name) {
      return res.status(400).json({ error: 'Name und Anzeigename sind erforderlich' });
    }

    const result = await db.run(`
      INSERT INTO quests (
        name, display_name, description, category,
        is_repeatable, cooldown_hours, min_level, prerequisite_quest_id,
        reward_gold, reward_experience, reward_item_id, reward_item_quantity,
        sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, display_name, description || null, category || 'side',
      is_repeatable ? 1 : 0, cooldown_hours || 0, min_level || 1, prerequisite_quest_id || null,
      reward_gold || 0, reward_experience || 0, reward_item_id || null, reward_item_quantity || 1,
      sort_order || 0
    ]);

    const questId = result.lastID;

    // Add objectives
    if (objectives && objectives.length > 0) {
      for (let i = 0; i < objectives.length; i++) {
        const obj = objectives[i];
        await db.run(`
          INSERT INTO quest_objectives (
            quest_id, objective_type, target_id, target_name, required_amount, description, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [questId, obj.objective_type, obj.target_id || null, obj.target_name || null, 
            obj.required_amount || 1, obj.description || null, i]);
      }
    }

    res.status(201).json({ message: 'Quest erstellt', id: questId });
  } catch (error) {
    console.error('Create quest error:', error);
    res.status(500).json({ error: 'Serverfehler beim Erstellen' });
  }
});

// Update quest (admin)
router.put('/admin/:id', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      display_name, description, category, is_active,
      is_repeatable, cooldown_hours, min_level, prerequisite_quest_id,
      reward_gold, reward_experience, reward_item_id, reward_item_quantity,
      objectives, sort_order
    } = req.body;

    await db.run(`
      UPDATE quests SET 
        display_name = ?, description = ?, category = ?, is_active = ?,
        is_repeatable = ?, cooldown_hours = ?, min_level = ?, prerequisite_quest_id = ?,
        reward_gold = ?, reward_experience = ?, reward_item_id = ?, reward_item_quantity = ?,
        sort_order = ?
      WHERE id = ?
    `, [
      display_name, description || null, category || 'side', is_active ? 1 : 0,
      is_repeatable ? 1 : 0, cooldown_hours || 0, min_level || 1, prerequisite_quest_id || null,
      reward_gold || 0, reward_experience || 0, reward_item_id || null, reward_item_quantity || 1,
      sort_order || 0, id
    ]);

    // Update objectives
    if (objectives) {
      await db.run('DELETE FROM quest_objectives WHERE quest_id = ?', [id]);
      for (let i = 0; i < objectives.length; i++) {
        const obj = objectives[i];
        await db.run(`
          INSERT INTO quest_objectives (
            quest_id, objective_type, target_id, target_name, required_amount, description, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, obj.objective_type, obj.target_id || null, obj.target_name || null, 
            obj.required_amount || 1, obj.description || null, i]);
      }
    }

    res.json({ message: 'Quest aktualisiert' });
  } catch (error) {
    console.error('Update quest error:', error);
    res.status(500).json({ error: 'Serverfehler beim Aktualisieren' });
  }
});

// Delete quest (admin)
router.delete('/admin/:id', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;

    // Delete related data first (cascades should handle it, but being explicit)
    await db.run('DELETE FROM user_quest_progress WHERE quest_id = ?', [id]);
    await db.run('DELETE FROM user_quests WHERE quest_id = ?', [id]);
    await db.run('DELETE FROM quest_objectives WHERE quest_id = ?', [id]);
    await db.run('DELETE FROM quests WHERE id = ?', [id]);

    res.json({ message: 'Quest gelöscht' });
  } catch (error) {
    console.error('Delete quest error:', error);
    res.status(500).json({ error: 'Serverfehler beim Löschen' });
  }
});

export default router;
