import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all players (public list)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const players = await db.all(`
      SELECT 
        u.id,
        u.username,
        u.avatar_path,
        u.world_x,
        u.world_y,
        u.created_at,
        g.id as guild_id,
        g.name as guild_name,
        g.tag as guild_tag,
        gm.role as guild_role
      FROM users u
      LEFT JOIN guild_members gm ON u.id = gm.user_id
      LEFT JOIN guilds g ON gm.guild_id = g.id
      WHERE u.is_activated = 1 
        AND u.username != 'System'
        AND u.email NOT LIKE '%@soaria.local'
      ORDER BY u.username
    `);

    res.json({ players });
  } catch (error) {
    console.error('Get players error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Spieler' });
  }
});

// Get player profile by username (public visitenkarte)
router.get('/profile/:username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    console.log('[PLAYERS] Loading profile for username:', username);

    const player = await db.get(`
      SELECT 
        u.id,
        u.username,
        u.avatar_path,
        u.world_x,
        u.world_y,
        u.created_at,
        u.last_login,
        u.gold,
        ps.level,
        ps.experience,
        ps.base_attack,
        ps.base_defense,
        ps.max_health,
        ps.current_health,
        g.id as guild_id,
        g.name as guild_name,
        g.tag as guild_tag,
        gm.role as guild_role
      FROM users u
      LEFT JOIN player_stats ps ON u.id = ps.user_id
      LEFT JOIN guild_members gm ON u.id = gm.user_id
      LEFT JOIN guilds g ON gm.guild_id = g.id
      WHERE LOWER(u.username) = LOWER(?) 
        AND u.is_activated = 1 
        AND u.username != 'System'
    `, [username]);

    if (!player) {
      console.log('[PLAYERS] Player not found:', username);
      return res.status(404).json({ error: 'Spieler nicht gefunden' });
    }

    console.log('[PLAYERS] Found player:', player.id, player.username);

    // Count equipped items (with safe check)
    let equippedCount = { count: 0 };
    try {
      equippedCount = await db.get(`
        SELECT COUNT(*) as count FROM user_equipment WHERE user_id = ? AND is_equipped = 1
      `, [player.id]) || { count: 0 };
    } catch (e) {
      console.log('[PLAYERS] user_equipment table may not exist');
    }

    // Count monsters killed (with safe check)
    let monstersKilled = { count: 0 };
    try {
      monstersKilled = await db.get(`
        SELECT COUNT(*) as count FROM combat_log WHERE attacker_id = ? AND winner = 'attacker'
      `, [player.id]) || { count: 0 };
    } catch (e) {
      console.log('[PLAYERS] combat_log table may not exist');
    }

    // Calculate total stats with equipment (with safe check)
    let equipmentStats = { total_attack: 0, total_defense: 0, total_health: 0 };
    try {
      equipmentStats = await db.get(`
        SELECT 
          COALESCE(SUM(et.base_attack * ue.quality_bonus), 0) as total_attack,
          COALESCE(SUM(et.base_defense * ue.quality_bonus), 0) as total_defense,
          COALESCE(SUM(et.base_health * ue.quality_bonus), 0) as total_health
        FROM user_equipment ue
        JOIN equipment_types et ON ue.equipment_type_id = et.id
        WHERE ue.user_id = ? AND ue.is_equipped = 1
      `, [player.id]) || equipmentStats;
    } catch (e) {
      console.log('[PLAYERS] equipment tables may not exist');
    }

    res.json({ 
      player: {
        ...player,
        equipped_count: equippedCount?.count || 0,
        monsters_killed: monstersKilled?.count || 0,
        total_attack: (player.base_attack || 10) + Math.floor(equipmentStats?.total_attack || 0),
        total_defense: (player.base_defense || 5) + Math.floor(equipmentStats?.total_defense || 0),
        total_health: (player.max_health || 100) + Math.floor(equipmentStats?.total_health || 0)
      }
    });
  } catch (error) {
    console.error('Get player profile error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden des Profils' });
  }
});

// Get single player profile by ID (public)
router.get('/:playerId', authenticateToken, async (req, res) => {
  try {
    const { playerId } = req.params;

    const player = await db.get(`
      SELECT 
        u.id,
        u.username,
        u.avatar_path,
        u.world_x,
        u.world_y,
        u.created_at,
        g.id as guild_id,
        g.name as guild_name,
        g.tag as guild_tag,
        gm.role as guild_role,
        gm.joined_at as guild_joined_at
      FROM users u
      LEFT JOIN guild_members gm ON u.id = gm.user_id
      LEFT JOIN guilds g ON gm.guild_id = g.id
      WHERE u.id = ? AND u.is_activated = 1
    `, [playerId]);

    if (!player) {
      return res.status(404).json({ error: 'Spieler nicht gefunden' });
    }

    // Get player's buildings count
    const buildingsCount = await db.get(`
      SELECT COUNT(*) as count FROM user_buildings WHERE user_id = ?
    `, [playerId]);

    // Get player's total items count
    const itemsCount = await db.get(`
      SELECT SUM(quantity) as count FROM user_inventory WHERE user_id = ?
    `, [playerId]);

    res.json({ 
      player,
      stats: {
        buildings: buildingsCount?.count || 0,
        items: itemsCount?.count || 0
      }
    });
  } catch (error) {
    console.error('Get player error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden des Spielers' });
  }
});

export default router;
