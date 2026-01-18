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
      ORDER BY u.username
    `);

    res.json({ players });
  } catch (error) {
    console.error('Get players error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Spieler' });
  }
});

// Get single player profile (public)
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
