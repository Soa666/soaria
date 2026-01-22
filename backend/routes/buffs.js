import express from 'express';
import db from '../database.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { sendDiscordWebhook } from '../utils/discord.js';

const router = express.Router();

// ============ SHARED FUNCTION FOR BUFF EXPIRATION ============

// Function to expire buffs and send Discord notifications
export async function expireBuffs() {
  try {
    // Find all expired buffs - use multiple conditions to catch all expired buffs
    const expiredBuffs = await db.all(`
      SELECT 
        ab.id,
        ab.buff_type_id,
        ab.expires_at,
        bt.display_name,
        bt.icon,
        ab.target_type,
        ab.target_id,
        ab.stacks,
        ab.is_active
      FROM active_buffs ab
      JOIN buff_types bt ON ab.buff_type_id = bt.id
      WHERE ab.expires_at IS NOT NULL 
        AND datetime(ab.expires_at) <= datetime('now')
        AND (ab.is_active = 1 OR ab.is_active IS NULL)
    `);

    // Additional JavaScript check for any edge cases
    const now = new Date();
    const reallyExpired = expiredBuffs.filter(buff => {
      if (!buff.expires_at) return false;
      const expiry = new Date(buff.expires_at);
      return expiry <= now;
    });

    if (reallyExpired.length > 0) {
      console.log(`[Buffs] Gefunden: ${expiredBuffs.length} abgelaufene Buffs, ${reallyExpired.length} wirklich abgelaufen`);
      // Get webhook for buff expiration
      const buffExpiredWebhook = await db.get(`
        SELECT webhook_url, message_template 
        FROM discord_webhooks 
        WHERE event_type = 'buff_expired' AND enabled = 1
        LIMIT 1
      `);

      // Deactivate expired buffs and send webhooks
      for (const buff of reallyExpired) {
        // Build target description first
        let targetDesc = '';
        switch (buff.target_type) {
          case 'all': targetDesc = 'alle Spieler'; break;
          case 'user': 
            const user = await db.get('SELECT username FROM users WHERE id = ?', [buff.target_id]);
            targetDesc = user?.username || 'Unbekannt';
            break;
          case 'guild':
            const guild = await db.get('SELECT name FROM guilds WHERE id = ?', [buff.target_id]);
            targetDesc = `Gilde: ${guild?.name || 'Unbekannt'}`;
            break;
          case 'guildless': targetDesc = 'gildenlose Spieler'; break;
          case 'level_min': targetDesc = `Level ${buff.target_id}+`; break;
          case 'level_max': targetDesc = `bis Level ${buff.target_id}`; break;
        }

        // Only process if buff is still marked as active
        if (buff.is_active === 1) {
          console.log(`[Buffs] Deaktiviere abgelaufenen Buff: ${buff.display_name} (ID: ${buff.id}) für ${targetDesc}`);
          
          await db.run(`
            UPDATE active_buffs 
            SET is_active = 0 
            WHERE id = ?
          `, [buff.id]);

          // Send webhook if configured
          if (buffExpiredWebhook && buffExpiredWebhook.webhook_url) {
            let message = buffExpiredWebhook.message_template || 
              `⏰ **${buff.display_name}** ist vorbei für **${targetDesc}**!`;
            
            // Replace template variables
            message = message.replace(/\{\{buff_name\}\}/g, buff.display_name);
            message = message.replace(/\{\{buff_icon\}\}/g, buff.icon || '✨');
            message = message.replace(/\{\{target\}\}/g, targetDesc);
            message = message.replace(/\{\{stacks\}\}/g, (buff.stacks || 1).toString());

            try {
              await sendDiscordWebhook(buffExpiredWebhook.webhook_url, message);
              console.log(`[Buffs] ✅ Discord-Nachricht gesendet für abgelaufenen Buff: ${buff.display_name}`);
            } catch (webhookError) {
              console.error('[Buffs] ❌ Fehler beim Senden des Ablauf-Webhooks:', webhookError);
            }
          } else {
            console.log(`[Buffs] ⚠️ Kein Webhook konfiguriert für buff_expired Event (Buff: ${buff.display_name})`);
          }
        } else {
          console.log(`[Buffs] Buff ${buff.display_name} (ID: ${buff.id}) ist bereits deaktiviert, überspringe`);
        }
      }

      const deactivated = reallyExpired.filter(b => b.is_active === 1).length;
      console.log(`[Buffs] ${reallyExpired.length} abgelaufene Buffs gefunden, ${deactivated} wurden deaktiviert`);
    } else {
      console.log(`[Buffs] Keine abgelaufenen Buffs gefunden`);
    }
  } catch (error) {
    console.error('[Buffs] Fehler beim Ablaufen:', error);
  }
}

// Debug route to manually check and expire buffs
router.post('/debug/expire', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Find all expired buffs
    const expiredBuffs = await db.all(`
      SELECT 
        ab.id,
        ab.buff_type_id,
        ab.is_active,
        ab.expires_at,
        bt.display_name,
        bt.icon,
        ab.target_type,
        ab.target_id,
        ab.stacks
      FROM active_buffs ab
      JOIN buff_types bt ON ab.buff_type_id = bt.id
      WHERE ab.expires_at IS NOT NULL 
        AND ab.expires_at <= datetime('now')
    `);

    const result = {
      found: expiredBuffs.length,
      active: expiredBuffs.filter(b => b.is_active === 1).length,
      inactive: expiredBuffs.filter(b => b.is_active !== 1).length,
      buffs: expiredBuffs
    };

    // Manually expire active ones
    if (expiredBuffs.filter(b => b.is_active === 1).length > 0) {
      await expireBuffs();
    }

    res.json(result);
  } catch (error) {
    console.error('Debug expire error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// ============ PUBLIC ROUTES ============

// Get all active buffs for current user
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // First, deactivate expired buffs (cleanup with Discord notifications)
    await expireBuffs();
    
    // Get user info for targeting
    const user = await db.get(`
      SELECT u.id, u.username, ps.level, gm.guild_id
      FROM users u
      LEFT JOIN player_stats ps ON u.id = ps.user_id
      LEFT JOIN guild_members gm ON u.id = gm.user_id
      WHERE u.id = ?
    `, [userId]);

    if (!user) {
      return res.json({ buffs: [] });
    }

    const level = user.level || 1;
    const guildId = user.guild_id;

    // Get all active buffs that apply to this user
    const buffs = await db.all(`
      SELECT 
        ab.id,
        ab.target_type,
        ab.target_id,
        ab.stacks,
        ab.expires_at,
        ab.created_at,
        bt.name,
        bt.display_name,
        bt.description,
        bt.icon,
        bt.effect_type,
        bt.effect_value,
        bt.stackable,
        u.username as created_by_name
      FROM active_buffs ab
      JOIN buff_types bt ON ab.buff_type_id = bt.id
      LEFT JOIN users u ON ab.created_by = u.id
      WHERE ab.is_active = 1
        AND (ab.expires_at IS NULL OR ab.expires_at > datetime('now'))
        AND (
          ab.target_type = 'all'
          OR (ab.target_type = 'user' AND ab.target_id = ?)
          OR (ab.target_type = 'guild' AND ab.target_id = ?)
          OR (ab.target_type = 'guildless' AND ? IS NULL)
          OR (ab.target_type = 'level_min' AND ? >= ab.target_id)
          OR (ab.target_type = 'level_max' AND ? <= ab.target_id)
        )
      ORDER BY bt.display_name
    `, [userId, guildId, guildId, level, level]);

    // Calculate total effect values
    const effectTotals = {};
    for (const buff of buffs) {
      const effectKey = buff.effect_type;
      const effectAmount = buff.effect_value * buff.stacks;
      effectTotals[effectKey] = (effectTotals[effectKey] || 0) + effectAmount;
    }

    res.json({ 
      buffs,
      effectTotals,
      level,
      guildId
    });
  } catch (error) {
    console.error('Get my buffs error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// ============ ADMIN ROUTES ============

// Get all buff types
router.get('/types', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const types = await db.all('SELECT * FROM buff_types ORDER BY display_name');
    res.json({ types });
  } catch (error) {
    console.error('Get buff types error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Create new buff type
router.post('/types', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, display_name, description, icon, effect_type, effect_value, stackable, max_stacks } = req.body;

    if (!name || !display_name || !effect_type || effect_value === undefined) {
      return res.status(400).json({ error: 'Name, Anzeigename, Effekt-Typ und Wert sind erforderlich' });
    }

    const result = await db.run(`
      INSERT INTO buff_types (name, display_name, description, icon, effect_type, effect_value, stackable, max_stacks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, display_name, description || '', icon || '✨', effect_type, effect_value, stackable ? 1 : 0, max_stacks || 1]);

    res.json({ 
      message: 'Buff-Typ erstellt',
      id: result.lastID
    });
  } catch (error) {
    console.error('Create buff type error:', error);
    if (error.message?.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Ein Buff mit diesem Namen existiert bereits' });
    }
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Update buff type
router.put('/types/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name, description, icon, effect_type, effect_value, stackable, max_stacks } = req.body;

    await db.run(`
      UPDATE buff_types 
      SET display_name = ?, description = ?, icon = ?, effect_type = ?, effect_value = ?, stackable = ?, max_stacks = ?
      WHERE id = ?
    `, [display_name, description, icon, effect_type, effect_value, stackable ? 1 : 0, max_stacks || 1, id]);

    res.json({ message: 'Buff-Typ aktualisiert' });
  } catch (error) {
    console.error('Update buff type error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Delete buff type
router.delete('/types/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Also delete all active buffs of this type
    await db.run('DELETE FROM active_buffs WHERE buff_type_id = ?', [id]);
    await db.run('DELETE FROM buff_types WHERE id = ?', [id]);

    res.json({ message: 'Buff-Typ gelöscht' });
  } catch (error) {
    console.error('Delete buff type error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get all active buffs (admin view)
router.get('/active', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // First, deactivate expired buffs (cleanup with Discord notifications)
    await expireBuffs();

    // Get all buffs that are marked as active AND not expired
    const buffs = await db.all(`
      SELECT 
        ab.*,
        bt.name as buff_name,
        bt.display_name,
        bt.icon,
        bt.effect_type,
        bt.effect_value,
        u.username as created_by_name,
        CASE 
          WHEN ab.target_type = 'user' THEN (SELECT username FROM users WHERE id = ab.target_id)
          WHEN ab.target_type = 'guild' THEN (SELECT name FROM guilds WHERE id = ab.target_id)
          ELSE NULL
        END as target_name
      FROM active_buffs ab
      JOIN buff_types bt ON ab.buff_type_id = bt.id
      LEFT JOIN users u ON ab.created_by = u.id
      WHERE ab.is_active = 1
        AND (ab.expires_at IS NULL OR datetime(ab.expires_at) > datetime('now'))
      ORDER BY ab.created_at DESC
    `);

    // Additional JavaScript filter to be absolutely sure
    const now = new Date();
    const validBuffs = buffs.filter(buff => {
      if (!buff.expires_at) return true; // Permanent
      const expiry = new Date(buff.expires_at);
      return expiry > now;
    });

    res.json({ buffs: validBuffs });
  } catch (error) {
    console.error('Get active buffs error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Apply a buff
router.post('/apply', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { buff_type_id, target_type, target_id, duration_minutes, stacks } = req.body;

    if (!buff_type_id || !target_type) {
      return res.status(400).json({ error: 'Buff-Typ und Zieltyp sind erforderlich' });
    }

    // Validate target type
    const validTargetTypes = ['all', 'user', 'guild', 'guildless', 'level_min', 'level_max'];
    if (!validTargetTypes.includes(target_type)) {
      return res.status(400).json({ error: 'Ungültiger Zieltyp' });
    }

    // Validate target_id for specific target types
    if (['user', 'guild', 'level_min', 'level_max'].includes(target_type) && !target_id) {
      return res.status(400).json({ error: 'Ziel-ID ist für diesen Typ erforderlich' });
    }

    // Get buff type info
    const buffType = await db.get('SELECT * FROM buff_types WHERE id = ?', [buff_type_id]);
    if (!buffType) {
      return res.status(404).json({ error: 'Buff-Typ nicht gefunden' });
    }

    // Calculate expiry
    let expiresAt = null;
    if (duration_minutes && duration_minutes > 0) {
      expiresAt = new Date(Date.now() + duration_minutes * 60000).toISOString();
    }

    // Check if similar buff already exists
    const existingBuff = await db.get(`
      SELECT * FROM active_buffs 
      WHERE buff_type_id = ? AND target_type = ? AND (target_id = ? OR (target_id IS NULL AND ? IS NULL))
        AND is_active = 1
    `, [buff_type_id, target_type, target_id, target_id]);

    if (existingBuff) {
      if (buffType.stackable) {
        // Add stacks
        const newStacks = Math.min(existingBuff.stacks + (stacks || 1), buffType.max_stacks);
        await db.run(`
          UPDATE active_buffs SET stacks = ?, expires_at = ? WHERE id = ?
        `, [newStacks, expiresAt, existingBuff.id]);
        
        return res.json({ 
          message: `Buff gestackt (${newStacks}/${buffType.max_stacks})`,
          stacks: newStacks
        });
      } else {
        // Refresh duration
        await db.run(`
          UPDATE active_buffs SET expires_at = ?, created_at = datetime('now') WHERE id = ?
        `, [expiresAt, existingBuff.id]);
        
        return res.json({ message: 'Buff-Dauer erneuert' });
      }
    }

    // Create new buff
    const result = await db.run(`
      INSERT INTO active_buffs (buff_type_id, target_type, target_id, duration_minutes, stacks, created_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [buff_type_id, target_type, target_id || null, duration_minutes || null, stacks || 1, req.user.id, expiresAt]);

    // Build target description for response
    let targetDesc = '';
    switch (target_type) {
      case 'all': targetDesc = 'alle Spieler'; break;
      case 'user': 
        const user = await db.get('SELECT username FROM users WHERE id = ?', [target_id]);
        targetDesc = user?.username || 'Unbekannt';
        break;
      case 'guild':
        const guild = await db.get('SELECT name FROM guilds WHERE id = ?', [target_id]);
        targetDesc = `Gilde: ${guild?.name || 'Unbekannt'}`;
        break;
      case 'guildless': targetDesc = 'gildenlose Spieler'; break;
      case 'level_min': targetDesc = `Level ${target_id}+`; break;
      case 'level_max': targetDesc = `bis Level ${target_id}`; break;
    }

    // Send Discord webhook notification
    try {
      const buffWebhook = await db.get(`
        SELECT webhook_url, message_template 
        FROM discord_webhooks 
        WHERE event_type = 'buff_activated' AND enabled = 1
        LIMIT 1
      `);

      if (buffWebhook && buffWebhook.webhook_url) {
        // Format duration
        let durationText = 'permanent';
        if (duration_minutes && duration_minutes > 0) {
          const hours = Math.floor(duration_minutes / 60);
          const minutes = duration_minutes % 60;
          if (hours > 0 && minutes > 0) {
            durationText = `${hours}h ${minutes}m`;
          } else if (hours > 0) {
            durationText = `${hours}h`;
          } else {
            durationText = `${minutes}m`;
          }
        }
        
        let message = buffWebhook.message_template || 
          `✨ **${buffType.display_name}** ist jetzt aktiv für **${targetDesc}**!\n\n⏱️ Dauer: ${durationText}`;
        
        // Replace template variables
        message = message.replace(/\{\{buff_name\}\}/g, buffType.display_name);
        message = message.replace(/\{\{buff_icon\}\}/g, buffType.icon || '✨');
        message = message.replace(/\{\{target\}\}/g, targetDesc);
        message = message.replace(/\{\{duration\}\}/g, durationText);
        message = message.replace(/\{\{stacks\}\}/g, (stacks || 1).toString());
        message = message.replace(/\{\{created_by\}\}/g, req.user.username || 'Admin');

        await sendDiscordWebhook(buffWebhook.webhook_url, message);
      }
    } catch (webhookError) {
      console.error('Error sending buff Discord webhook:', webhookError);
      // Don't fail the request if webhook fails
    }

    res.json({ 
      message: `${buffType.icon} ${buffType.display_name} auf ${targetDesc} angewendet!`,
      id: result.lastID
    });
  } catch (error) {
    console.error('Apply buff error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Remove a buff
router.delete('/active/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.run('UPDATE active_buffs SET is_active = 0 WHERE id = ?', [id]);

    res.json({ message: 'Buff entfernt' });
  } catch (error) {
    console.error('Remove buff error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Remove all buffs of a type
router.delete('/active/type/:buffTypeId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { buffTypeId } = req.params;
    
    const result = await db.run('UPDATE active_buffs SET is_active = 0 WHERE buff_type_id = ? AND is_active = 1', [buffTypeId]);

    res.json({ message: `${result.changes} Buff(s) entfernt` });
  } catch (error) {
    console.error('Remove buffs by type error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get users for targeting (search)
router.get('/users/search', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ users: [] });
    }

    const users = await db.all(`
      SELECT id, username, role
      FROM users
      WHERE username LIKE ?
      ORDER BY username
      LIMIT 20
    `, [`%${q}%`]);

    res.json({ users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get guilds for targeting
router.get('/guilds', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const guilds = await db.all(`
      SELECT g.id, g.name, COUNT(gm.user_id) as member_count
      FROM guilds g
      LEFT JOIN guild_members gm ON g.id = gm.guild_id
      GROUP BY g.id
      ORDER BY g.name
    `);

    res.json({ guilds });
  } catch (error) {
    console.error('Get guilds error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// ============ HELPER FUNCTION FOR OTHER ROUTES ============

// Get buff multipliers for a user (used by combat, travel, etc.)
export async function getBuffMultipliers(userId) {
  try {
    // Get user info
    const user = await db.get(`
      SELECT u.id, ps.level, gm.guild_id
      FROM users u
      LEFT JOIN player_stats ps ON u.id = ps.user_id
      LEFT JOIN guild_members gm ON u.id = gm.user_id
      WHERE u.id = ?
    `, [userId]);

    if (!user) {
      return getDefaultMultipliers();
    }

    const level = user.level || 1;
    const guildId = user.guild_id;

    // Get all active buffs for this user
    // IMPORTANT: Filter by both is_active AND expires_at to ensure expired buffs are not counted
    const buffs = await db.all(`
      SELECT bt.effect_type, bt.effect_value, ab.stacks, ab.expires_at, ab.is_active
      FROM active_buffs ab
      JOIN buff_types bt ON ab.buff_type_id = bt.id
      WHERE ab.is_active = 1
        AND (ab.expires_at IS NULL OR datetime(ab.expires_at) > datetime('now'))
        AND (
          ab.target_type = 'all'
          OR (ab.target_type = 'user' AND ab.target_id = ?)
          OR (ab.target_type = 'guild' AND ab.target_id = ?)
          OR (ab.target_type = 'guildless' AND ? IS NULL)
          OR (ab.target_type = 'level_min' AND ? >= ab.target_id)
          OR (ab.target_type = 'level_max' AND ? <= ab.target_id)
        )
    `, [userId, guildId, guildId, level, level]);

    // Double-check: Filter out any buffs that might have expired between query and now
    const now = new Date();
    const validBuffs = buffs.filter(buff => {
      if (!buff.expires_at) return true; // Permanent buff
      const expiry = new Date(buff.expires_at);
      return expiry > now;
    });

    // Calculate multipliers
    const multipliers = getDefaultMultipliers();

    for (const buff of validBuffs) {
      const effectAmount = buff.effect_value * buff.stacks;
      
      switch (buff.effect_type) {
        case 'attack_percent':
          multipliers.attack += effectAmount / 100;
          break;
        case 'attack_flat':
          multipliers.attackFlat += effectAmount;
          break;
        case 'defense_percent':
          multipliers.defense += effectAmount / 100;
          break;
        case 'defense_flat':
          multipliers.defenseFlat += effectAmount;
          break;
        case 'health_percent':
          multipliers.health += effectAmount / 100;
          break;
        case 'health_flat':
          multipliers.healthFlat += effectAmount;
          break;
        case 'speed_percent':
          multipliers.speed += effectAmount / 100;
          break;
        case 'exp_percent':
          multipliers.exp += effectAmount / 100;
          break;
        case 'gold_percent':
          multipliers.gold += effectAmount / 100;
          break;
        case 'gather_speed':
          multipliers.gatherSpeed += effectAmount / 100;
          break;
        case 'craft_speed':
          multipliers.craftSpeed += effectAmount / 100;
          break;
        case 'all_stats':
          const allBonus = effectAmount / 100;
          multipliers.attack += allBonus;
          multipliers.defense += allBonus;
          multipliers.health += allBonus;
          multipliers.speed += allBonus;
          multipliers.exp += allBonus;
          multipliers.gold += allBonus;
          break;
      }
    }

    return multipliers;
  } catch (error) {
    console.error('Get buff multipliers error:', error);
    return getDefaultMultipliers();
  }
}

function getDefaultMultipliers() {
  return {
    attack: 1.0,
    attackFlat: 0,
    defense: 1.0,
    defenseFlat: 0,
    health: 1.0,
    healthFlat: 0,
    speed: 1.0,
    exp: 1.0,
    gold: 1.0,
    gatherSpeed: 1.0,
    craftSpeed: 1.0
  };
}

// ============ BUFF EVENTS ROUTES ============

// Get all buff events
router.get('/events', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const events = await db.all(`
      SELECT 
        be.*,
        bt.display_name as buff_name,
        bt.icon as buff_icon,
        u.username as created_by_name
      FROM buff_events be
      JOIN buff_types bt ON be.buff_type_id = bt.id
      LEFT JOIN users u ON be.created_by = u.id
      ORDER BY be.start_date, be.start_time
    `);
    res.json({ events });
  } catch (error) {
    console.error('Get buff events error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Create buff event
router.post('/events', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, buff_type_id, target_type, target_id, stacks, start_date, start_time, end_date, end_time, enabled } = req.body;

    if (!name || !buff_type_id || !target_type || !start_date || !end_date) {
      return res.status(400).json({ error: 'Name, Buff-Typ, Zieltyp, Start- und Enddatum sind erforderlich' });
    }

    // Validate target type
    const validTargetTypes = ['all', 'user', 'guild', 'guildless', 'level_min', 'level_max'];
    if (!validTargetTypes.includes(target_type)) {
      return res.status(400).json({ error: 'Ungültiger Zieltyp' });
    }

    // Validate target_id for specific target types
    if (['user', 'guild', 'level_min', 'level_max'].includes(target_type) && !target_id) {
      return res.status(400).json({ error: 'Ziel-ID ist für diesen Typ erforderlich' });
    }

    const result = await db.run(`
      INSERT INTO buff_events (name, description, buff_type_id, target_type, target_id, stacks, start_date, start_time, end_date, end_time, enabled, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, description || '', buff_type_id, target_type, target_id || null, stacks || 1, start_date, start_time || '00:00:00', end_date, end_time || '23:59:59', enabled !== undefined ? (enabled ? 1 : 0) : 1, req.user.id]);

    res.json({ 
      message: 'Event erstellt',
      id: result.lastID
    });
  } catch (error) {
    console.error('Create buff event error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Update buff event
router.put('/events/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, buff_type_id, target_type, target_id, stacks, start_date, start_time, end_date, end_time, enabled } = req.body;

    await db.run(`
      UPDATE buff_events 
      SET name = ?, description = ?, buff_type_id = ?, target_type = ?, target_id = ?, stacks = ?, 
          start_date = ?, start_time = ?, end_date = ?, end_time = ?, enabled = ?
      WHERE id = ?
    `, [name, description || '', buff_type_id, target_type, target_id || null, stacks || 1, start_date, start_time || '00:00:00', end_date, end_time || '23:59:59', enabled !== undefined ? (enabled ? 1 : 0) : 1, id]);

    res.json({ message: 'Event aktualisiert' });
  } catch (error) {
    console.error('Update buff event error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Delete buff event
router.delete('/events/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM buff_events WHERE id = ?', [id]);
    res.json({ message: 'Event gelöscht' });
  } catch (error) {
    console.error('Delete buff event error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Function to check and trigger buff events (called by server.js)
export async function checkBuffEvents() {
  try {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS

    // Find events that should be active now
    const activeEvents = await db.all(`
      SELECT * FROM buff_events
      WHERE enabled = 1
        AND (
          (start_date < ? OR (start_date = ? AND start_time <= ?))
          AND (end_date > ? OR (end_date = ? AND end_time >= ?))
        )
        AND (last_triggered IS NULL OR last_triggered < datetime('now', '-1 minute'))
    `, [currentDate, currentDate, currentTime, currentDate, currentDate, currentTime]);

    for (const event of activeEvents) {
      // Check if buff already exists for this event today
      const existingBuff = await db.get(`
        SELECT * FROM active_buffs ab
        JOIN buff_events be ON ab.buff_type_id = be.buff_type_id 
          AND ab.target_type = be.target_type 
          AND (ab.target_id = be.target_id OR (ab.target_id IS NULL AND be.target_id IS NULL))
        WHERE be.id = ? 
          AND ab.is_active = 1
          AND date(ab.created_at) = ?
      `, [event.id, currentDate]);

      if (!existingBuff) {
        // Calculate duration until end of event
        const startDateTime = new Date(`${event.start_date}T${event.start_time}`);
        const endDateTime = new Date(`${event.end_date}T${event.end_time}`);
        const durationMinutes = Math.ceil((endDateTime - now) / 60000);

        if (durationMinutes > 0) {
          const expiresAt = endDateTime.toISOString();

          // Create buff
          await db.run(`
            INSERT INTO active_buffs (buff_type_id, target_type, target_id, duration_minutes, stacks, created_by, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [event.buff_type_id, event.target_type, event.target_id, durationMinutes, event.stacks, event.created_by, expiresAt]);

          // Update last_triggered
          await db.run(`
            UPDATE buff_events 
            SET last_triggered = datetime('now')
            WHERE id = ?
          `, [event.id]);

          console.log(`[Buff Events] Event "${event.name}" aktiviert - Buff erstellt für ${durationMinutes} Minuten`);
        }
      }
    }

    // Deactivate buffs for events that have ended
    const endedEvents = await db.all(`
      SELECT * FROM buff_events
      WHERE enabled = 1
        AND (end_date < ? OR (end_date = ? AND end_time < ?))
    `, [currentDate, currentDate, currentTime]);

    for (const event of endedEvents) {
      await db.run(`
        UPDATE active_buffs 
        SET is_active = 0
        WHERE buff_type_id = ?
          AND target_type = ?
          AND (target_id = ? OR (target_id IS NULL AND ? IS NULL))
          AND is_active = 1
      `, [event.buff_type_id, event.target_type, event.target_id, event.target_id]);
    }
  } catch (error) {
    console.error('[Buff Events] Fehler beim Prüfen der Events:', error);
  }
}

export default router;
