import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { sendSystemMessage } from './messages.js';

const router = express.Router();

// Get all guilds (public)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const guilds = await db.all(`
      SELECT 
        g.id,
        g.name,
        g.tag,
        g.description,
        g.icon_path,
        g.created_at,
        u.username as leader_name,
        u.id as leader_id,
        (SELECT COUNT(*) FROM guild_members WHERE guild_id = g.id) as member_count
      FROM guilds g
      JOIN users u ON g.leader_id = u.id
      ORDER BY member_count DESC, g.name
    `);

    res.json({ guilds });
  } catch (error) {
    console.error('Get guilds error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Gilden' });
  }
});

// Get single guild details
router.get('/:guildId', authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params;

    const guild = await db.get(`
      SELECT 
        g.*,
        u.username as leader_name
      FROM guilds g
      JOIN users u ON g.leader_id = u.id
      WHERE g.id = ?
    `, [guildId]);

    if (!guild) {
      return res.status(404).json({ error: 'Gilde nicht gefunden' });
    }

    // Get members
    const members = await db.all(`
      SELECT 
        gm.id as membership_id,
        gm.role,
        gm.joined_at,
        u.id,
        u.username,
        u.avatar_path,
        u.world_x,
        u.world_y
      FROM guild_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.guild_id = ?
      ORDER BY 
        CASE gm.role 
          WHEN 'leader' THEN 1 
          WHEN 'officer' THEN 2 
          ELSE 3 
        END,
        gm.joined_at
    `, [guildId]);

    // Check if current user is member/officer/leader
    const userMembership = await db.get(`
      SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, req.user.id]);

    // Get active pacts
    const pacts = await db.all(`
      SELECT 
        gp.*,
        g1.name as guild_1_name,
        g1.tag as guild_1_tag,
        g2.name as guild_2_name,
        g2.tag as guild_2_tag
      FROM guild_pacts gp
      JOIN guilds g1 ON gp.guild_1_id = g1.id
      JOIN guilds g2 ON gp.guild_2_id = g2.id
      WHERE (gp.guild_1_id = ? OR gp.guild_2_id = ?) AND gp.status = 'active'
    `, [guildId, guildId]);

    res.json({ 
      guild, 
      members, 
      pacts,
      userRole: userMembership?.role || null,
      isMember: !!userMembership
    });
  } catch (error) {
    console.error('Get guild error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Gilde' });
  }
});

// Guild creation requirements (can be modified)
const GUILD_CREATION_REQUIREMENTS = {
  resources: [
    { itemName: 'holz', quantity: 100 },
    { itemName: 'stein', quantity: 50 },
  ],
  minBuildings: 2,  // At least 2 buildings built
  minAccountAgeDays: 1, // Account must be at least 1 day old
};

// Get guild creation requirements (public)
router.get('/requirements/create', authenticateToken, async (req, res) => {
  try {
    // Get item display names
    const requirements = [];
    for (const req_item of GUILD_CREATION_REQUIREMENTS.resources) {
      const item = await db.get('SELECT id, display_name FROM items WHERE name = ?', [req_item.itemName]);
      if (item) {
        requirements.push({
          item_id: item.id,
          item_name: item.display_name,
          quantity: req_item.quantity
        });
      }
    }

    // Check user's current status
    const userId = req.user.id;
    
    // Check resources
    const userResources = [];
    for (const req_item of GUILD_CREATION_REQUIREMENTS.resources) {
      const item = await db.get('SELECT id, display_name FROM items WHERE name = ?', [req_item.itemName]);
      if (item) {
        const inventory = await db.get(
          'SELECT quantity FROM user_inventory WHERE user_id = ? AND item_id = ?',
          [userId, item.id]
        );
        userResources.push({
          item_name: item.display_name,
          required: req_item.quantity,
          current: inventory?.quantity || 0,
          fulfilled: (inventory?.quantity || 0) >= req_item.quantity
        });
      }
    }

    // Check buildings
    const buildingsCount = await db.get(
      'SELECT COUNT(*) as count FROM user_buildings WHERE user_id = ?',
      [userId]
    );

    // Check account age
    const user = await db.get('SELECT created_at FROM users WHERE id = ?', [userId]);
    const accountAgeDays = user ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;

    res.json({
      requirements: {
        resources: userResources,
        minBuildings: {
          required: GUILD_CREATION_REQUIREMENTS.minBuildings,
          current: buildingsCount?.count || 0,
          fulfilled: (buildingsCount?.count || 0) >= GUILD_CREATION_REQUIREMENTS.minBuildings
        },
        minAccountAge: {
          required: GUILD_CREATION_REQUIREMENTS.minAccountAgeDays,
          current: accountAgeDays,
          fulfilled: accountAgeDays >= GUILD_CREATION_REQUIREMENTS.minAccountAgeDays
        }
      },
      canCreate: userResources.every(r => r.fulfilled) && 
                 (buildingsCount?.count || 0) >= GUILD_CREATION_REQUIREMENTS.minBuildings &&
                 accountAgeDays >= GUILD_CREATION_REQUIREMENTS.minAccountAgeDays
    });
  } catch (error) {
    console.error('Get guild requirements error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Create a new guild
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, tag, description } = req.body;

    if (!name || !tag) {
      return res.status(400).json({ error: 'Name und Tag sind erforderlich' });
    }

    if (tag.length > 5) {
      return res.status(400).json({ error: 'Tag darf maximal 5 Zeichen haben' });
    }

    if (name.length < 3 || name.length > 30) {
      return res.status(400).json({ error: 'Gildenname muss zwischen 3 und 30 Zeichen lang sein' });
    }

    // Check if user is already in a guild
    const existingMembership = await db.get(
      'SELECT id FROM guild_members WHERE user_id = ?',
      [req.user.id]
    );

    if (existingMembership) {
      return res.status(400).json({ error: 'Du bist bereits in einer Gilde' });
    }

    // Check if name or tag already exists
    const existingGuild = await db.get(
      'SELECT id FROM guilds WHERE name = ? OR tag = ?',
      [name, tag.toUpperCase()]
    );

    if (existingGuild) {
      return res.status(400).json({ error: 'Name oder Tag bereits vergeben' });
    }

    // === CHECK REQUIREMENTS ===
    
    // Check account age
    const user = await db.get('SELECT created_at FROM users WHERE id = ?', [req.user.id]);
    const accountAgeDays = user ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    if (accountAgeDays < GUILD_CREATION_REQUIREMENTS.minAccountAgeDays) {
      return res.status(400).json({ 
        error: `Dein Account muss mindestens ${GUILD_CREATION_REQUIREMENTS.minAccountAgeDays} Tag(e) alt sein` 
      });
    }

    // Check buildings
    const buildingsCount = await db.get(
      'SELECT COUNT(*) as count FROM user_buildings WHERE user_id = ?',
      [req.user.id]
    );
    if ((buildingsCount?.count || 0) < GUILD_CREATION_REQUIREMENTS.minBuildings) {
      return res.status(400).json({ 
        error: `Du brauchst mindestens ${GUILD_CREATION_REQUIREMENTS.minBuildings} Gebäude` 
      });
    }

    // Check and deduct resources
    for (const reqItem of GUILD_CREATION_REQUIREMENTS.resources) {
      const item = await db.get('SELECT id, display_name FROM items WHERE name = ?', [reqItem.itemName]);
      if (!item) continue;

      const inventory = await db.get(
        'SELECT quantity FROM user_inventory WHERE user_id = ? AND item_id = ?',
        [req.user.id, item.id]
      );

      if (!inventory || inventory.quantity < reqItem.quantity) {
        return res.status(400).json({ 
          error: `Du brauchst mindestens ${reqItem.quantity}x ${item.display_name}` 
        });
      }
    }

    // Deduct resources
    for (const reqItem of GUILD_CREATION_REQUIREMENTS.resources) {
      const item = await db.get('SELECT id FROM items WHERE name = ?', [reqItem.itemName]);
      if (!item) continue;

      await db.run(
        'UPDATE user_inventory SET quantity = quantity - ? WHERE user_id = ? AND item_id = ?',
        [reqItem.quantity, req.user.id, item.id]
      );

      // Remove if quantity is 0
      await db.run(
        'DELETE FROM user_inventory WHERE user_id = ? AND item_id = ? AND quantity <= 0',
        [req.user.id, item.id]
      );
    }

    // Create guild
    const result = await db.run(`
      INSERT INTO guilds (name, tag, description, leader_id)
      VALUES (?, ?, ?, ?)
    `, [name, tag.toUpperCase(), description || null, req.user.id]);

    // Add leader as member
    await db.run(`
      INSERT INTO guild_members (guild_id, user_id, role)
      VALUES (?, ?, 'leader')
    `, [result.lastID, req.user.id]);

    res.json({ 
      message: 'Gilde erfolgreich erstellt',
      guild: {
        id: result.lastID,
        name,
        tag: tag.toUpperCase()
      }
    });
  } catch (error) {
    console.error('Create guild error:', error);
    res.status(500).json({ error: 'Serverfehler beim Erstellen der Gilde' });
  }
});

// Update guild (leader only)
router.put('/:guildId', authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { description } = req.body;

    // Check if user is leader
    const membership = await db.get(`
      SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, req.user.id]);

    if (!membership || membership.role !== 'leader') {
      return res.status(403).json({ error: 'Nur der Gildenleiter kann die Gilde bearbeiten' });
    }

    await db.run(`
      UPDATE guilds SET description = ? WHERE id = ?
    `, [description, guildId]);

    res.json({ message: 'Gilde aktualisiert' });
  } catch (error) {
    console.error('Update guild error:', error);
    res.status(500).json({ error: 'Serverfehler beim Aktualisieren der Gilde' });
  }
});

// Delete guild (leader only)
router.delete('/:guildId', authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params;

    // Check if user is leader
    const guild = await db.get(`
      SELECT leader_id FROM guilds WHERE id = ?
    `, [guildId]);

    if (!guild) {
      return res.status(404).json({ error: 'Gilde nicht gefunden' });
    }

    if (guild.leader_id !== req.user.id) {
      return res.status(403).json({ error: 'Nur der Gildenleiter kann die Gilde auflösen' });
    }

    await db.run('DELETE FROM guilds WHERE id = ?', [guildId]);

    res.json({ message: 'Gilde aufgelöst' });
  } catch (error) {
    console.error('Delete guild error:', error);
    res.status(500).json({ error: 'Serverfehler beim Löschen der Gilde' });
  }
});

// Apply to guild
router.post('/:guildId/apply', authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { message } = req.body;

    // Check if guild exists
    const guild = await db.get('SELECT id, name FROM guilds WHERE id = ?', [guildId]);
    if (!guild) {
      return res.status(404).json({ error: 'Gilde nicht gefunden' });
    }

    // Check if user is already in a guild
    const existingMembership = await db.get(
      'SELECT id FROM guild_members WHERE user_id = ?',
      [req.user.id]
    );

    if (existingMembership) {
      return res.status(400).json({ error: 'Du bist bereits in einer Gilde' });
    }

    // Check for existing pending application
    const existingApplication = await db.get(`
      SELECT id, status FROM guild_applications 
      WHERE guild_id = ? AND user_id = ? AND status = 'pending'
    `, [guildId, req.user.id]);

    if (existingApplication) {
      return res.status(400).json({ error: 'Du hast bereits eine ausstehende Bewerbung' });
    }

    // Create application
    const result = await db.run(`
      INSERT INTO guild_applications (guild_id, user_id, message)
      VALUES (?, ?, ?)
    `, [guildId, req.user.id, message || null]);

    // Notify guild leader and officers about new application
    const applicantUser = await db.get('SELECT username FROM users WHERE id = ?', [req.user.id]);
    const guildLeadersAndOfficers = await db.all(`
      SELECT user_id FROM guild_members 
      WHERE guild_id = ? AND role IN ('leader', 'officer')
    `, [guildId]);

    for (const member of guildLeadersAndOfficers) {
      await sendSystemMessage(
        member.user_id,
        `📜 Neue Gildenbewerbung`,
        `${applicantUser.username} hat sich bei der Gilde "${guild.name}" beworben!\n\n${message ? `Nachricht: "${message}"` : 'Keine Nachricht hinterlassen.'}\n\nGehe zu den Gildenbewerbungen, um sie zu prüfen.`,
        'guild_application',
        result.lastID
      );
    }

    res.json({ message: `Bewerbung an ${guild.name} gesendet` });
  } catch (error) {
    console.error('Apply to guild error:', error);
    res.status(500).json({ error: 'Serverfehler bei der Bewerbung' });
  }
});

// Get guild applications (leader/officer only)
router.get('/:guildId/applications', authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params;

    // Check if user is leader or officer
    const membership = await db.get(`
      SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, req.user.id]);

    if (!membership || membership.role === 'member') {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }

    const applications = await db.all(`
      SELECT 
        ga.*,
        u.username,
        u.avatar_path,
        u.world_x,
        u.world_y,
        u.created_at as user_created_at,
        reviewer.username as reviewed_by_name
      FROM guild_applications ga
      JOIN users u ON ga.user_id = u.id
      LEFT JOIN users reviewer ON ga.reviewed_by = reviewer.id
      WHERE ga.guild_id = ?
      ORDER BY 
        CASE ga.status WHEN 'pending' THEN 1 ELSE 2 END,
        ga.created_at DESC
    `, [guildId]);

    res.json({ applications });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Bewerbungen' });
  }
});

// Review application (leader/officer only)
router.put('/:guildId/applications/:applicationId', authenticateToken, async (req, res) => {
  try {
    const { guildId, applicationId } = req.params;
    const { status } = req.body;

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Ungültiger Status' });
    }

    // Check if user is leader or officer
    const membership = await db.get(`
      SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, req.user.id]);

    if (!membership || membership.role === 'member') {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }

    // Get application
    const application = await db.get(`
      SELECT * FROM guild_applications WHERE id = ? AND guild_id = ? AND status = 'pending'
    `, [applicationId, guildId]);

    if (!application) {
      return res.status(404).json({ error: 'Bewerbung nicht gefunden oder bereits bearbeitet' });
    }

    // Update application
    await db.run(`
      UPDATE guild_applications 
      SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, req.user.id, applicationId]);

    // Get guild info for message
    const guild = await db.get('SELECT name FROM guilds WHERE id = ?', [guildId]);

    // If accepted, add user to guild
    if (status === 'accepted') {
      // Check if user is still not in a guild
      const existingMembership = await db.get(
        'SELECT id FROM guild_members WHERE user_id = ?',
        [application.user_id]
      );

      if (existingMembership) {
        return res.status(400).json({ error: 'Benutzer ist bereits in einer Gilde' });
      }

      await db.run(`
        INSERT INTO guild_members (guild_id, user_id, role)
        VALUES (?, ?, 'member')
      `, [guildId, application.user_id]);

      // Notify applicant about acceptance
      await sendSystemMessage(
        application.user_id,
        `🎉 Gildenbewerbung angenommen!`,
        `Herzlichen Glückwunsch! Deine Bewerbung bei der Gilde "${guild.name}" wurde angenommen!\n\nDu bist jetzt offiziell ein Mitglied der Gilde. Willkommen! 🏰`,
        'guild_accepted',
        guildId
      );
    } else {
      // Notify applicant about rejection
      await sendSystemMessage(
        application.user_id,
        `❌ Gildenbewerbung abgelehnt`,
        `Leider wurde deine Bewerbung bei der Gilde "${guild.name}" abgelehnt.\n\nDu kannst dich gerne bei anderen Gilden bewerben oder später erneut versuchen.`,
        'guild_rejected',
        guildId
      );
    }

    res.json({ 
      message: status === 'accepted' ? 'Bewerbung angenommen' : 'Bewerbung abgelehnt'
    });
  } catch (error) {
    console.error('Review application error:', error);
    res.status(500).json({ error: 'Serverfehler beim Bearbeiten der Bewerbung' });
  }
});

// Promote/demote member (leader only)
router.put('/:guildId/members/:userId/role', authenticateToken, async (req, res) => {
  try {
    const { guildId, userId } = req.params;
    const { role } = req.body;

    if (!['officer', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Ungültige Rolle' });
    }

    // Check if user is leader
    const membership = await db.get(`
      SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, req.user.id]);

    if (!membership || membership.role !== 'leader') {
      return res.status(403).json({ error: 'Nur der Gildenleiter kann Rollen ändern' });
    }

    // Can't change own role
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ error: 'Du kannst deine eigene Rolle nicht ändern' });
    }

    await db.run(`
      UPDATE guild_members SET role = ? WHERE guild_id = ? AND user_id = ?
    `, [role, guildId, userId]);

    res.json({ message: 'Rolle aktualisiert' });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ error: 'Serverfehler beim Ändern der Rolle' });
  }
});

// Kick member (leader/officer only, officers can't kick officers)
router.delete('/:guildId/members/:userId', authenticateToken, async (req, res) => {
  try {
    const { guildId, userId } = req.params;

    // Check if user is leader or officer
    const membership = await db.get(`
      SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, req.user.id]);

    if (!membership || membership.role === 'member') {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }

    // Get target's role
    const target = await db.get(`
      SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, userId]);

    if (!target) {
      return res.status(404).json({ error: 'Mitglied nicht gefunden' });
    }

    // Can't kick yourself
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ error: 'Du kannst dich nicht selbst kicken. Nutze "Gilde verlassen"' });
    }

    // Can't kick leader
    if (target.role === 'leader') {
      return res.status(403).json({ error: 'Der Gildenleiter kann nicht gekickt werden' });
    }

    // Officers can't kick officers
    if (membership.role === 'officer' && target.role === 'officer') {
      return res.status(403).json({ error: 'Offiziere können andere Offiziere nicht kicken' });
    }

    await db.run(`
      DELETE FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, userId]);

    res.json({ message: 'Mitglied entfernt' });
  } catch (error) {
    console.error('Kick member error:', error);
    res.status(500).json({ error: 'Serverfehler beim Entfernen des Mitglieds' });
  }
});

// Leave guild
router.post('/:guildId/leave', authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params;

    const membership = await db.get(`
      SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, req.user.id]);

    if (!membership) {
      return res.status(400).json({ error: 'Du bist nicht in dieser Gilde' });
    }

    if (membership.role === 'leader') {
      return res.status(400).json({ 
        error: 'Als Gildenleiter musst du erst einen Nachfolger ernennen oder die Gilde auflösen' 
      });
    }

    await db.run(`
      DELETE FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, req.user.id]);

    res.json({ message: 'Du hast die Gilde verlassen' });
  } catch (error) {
    console.error('Leave guild error:', error);
    res.status(500).json({ error: 'Serverfehler beim Verlassen der Gilde' });
  }
});

// Transfer leadership (leader only)
router.post('/:guildId/transfer-leadership', authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { newLeaderId } = req.body;

    // Check if user is leader
    const guild = await db.get(`
      SELECT leader_id FROM guilds WHERE id = ?
    `, [guildId]);

    if (!guild || guild.leader_id !== req.user.id) {
      return res.status(403).json({ error: 'Nur der Gildenleiter kann die Führung übertragen' });
    }

    // Check if new leader is member
    const newLeaderMembership = await db.get(`
      SELECT id FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, newLeaderId]);

    if (!newLeaderMembership) {
      return res.status(400).json({ error: 'Der neue Leiter muss Mitglied der Gilde sein' });
    }

    // Transfer leadership
    await db.run('UPDATE guilds SET leader_id = ? WHERE id = ?', [newLeaderId, guildId]);
    await db.run('UPDATE guild_members SET role = ? WHERE guild_id = ? AND user_id = ?', ['leader', guildId, newLeaderId]);
    await db.run('UPDATE guild_members SET role = ? WHERE guild_id = ? AND user_id = ?', ['officer', guildId, req.user.id]);

    res.json({ message: 'Gildenführung übertragen' });
  } catch (error) {
    console.error('Transfer leadership error:', error);
    res.status(500).json({ error: 'Serverfehler beim Übertragen der Führung' });
  }
});

// === PACT ROUTES ===

// Request pact with another guild (leader only)
router.post('/:guildId/pacts', authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { targetGuildId } = req.body;

    // Check if user is leader
    const membership = await db.get(`
      SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, req.user.id]);

    if (!membership || membership.role !== 'leader') {
      return res.status(403).json({ error: 'Nur der Gildenleiter kann Pakte schließen' });
    }

    // Check if target guild exists
    const targetGuild = await db.get('SELECT id, name FROM guilds WHERE id = ?', [targetGuildId]);
    if (!targetGuild) {
      return res.status(404).json({ error: 'Zielgilde nicht gefunden' });
    }

    // Can't pact with yourself
    if (parseInt(guildId) === parseInt(targetGuildId)) {
      return res.status(400).json({ error: 'Du kannst keinen Pakt mit deiner eigenen Gilde schließen' });
    }

    // Check for existing pact
    const existingPact = await db.get(`
      SELECT id, status FROM guild_pacts 
      WHERE (guild_1_id = ? AND guild_2_id = ?) OR (guild_1_id = ? AND guild_2_id = ?)
    `, [guildId, targetGuildId, targetGuildId, guildId]);

    if (existingPact) {
      if (existingPact.status === 'active') {
        return res.status(400).json({ error: 'Ein Pakt besteht bereits' });
      }
      if (existingPact.status === 'pending') {
        return res.status(400).json({ error: 'Eine Paktanfrage ist bereits ausstehend' });
      }
    }

    // Create pact request
    await db.run(`
      INSERT INTO guild_pacts (guild_1_id, guild_2_id, requested_by)
      VALUES (?, ?, ?)
    `, [guildId, targetGuildId, req.user.id]);

    res.json({ message: `Paktanfrage an ${targetGuild.name} gesendet` });
  } catch (error) {
    console.error('Request pact error:', error);
    res.status(500).json({ error: 'Serverfehler bei der Paktanfrage' });
  }
});

// Get incoming pact requests
router.get('/:guildId/pacts/incoming', authenticateToken, async (req, res) => {
  try {
    const { guildId } = req.params;

    // Check if user is leader
    const membership = await db.get(`
      SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, req.user.id]);

    if (!membership || membership.role !== 'leader') {
      return res.status(403).json({ error: 'Nur der Gildenleiter kann Paktanfragen sehen' });
    }

    const pacts = await db.all(`
      SELECT 
        gp.*,
        g.name as requesting_guild_name,
        g.tag as requesting_guild_tag,
        u.username as requested_by_name
      FROM guild_pacts gp
      JOIN guilds g ON gp.guild_1_id = g.id
      JOIN users u ON gp.requested_by = u.id
      WHERE gp.guild_2_id = ? AND gp.status = 'pending'
      ORDER BY gp.created_at DESC
    `, [guildId]);

    res.json({ pacts });
  } catch (error) {
    console.error('Get incoming pacts error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Paktanfragen' });
  }
});

// Respond to pact request (leader only)
router.put('/:guildId/pacts/:pactId', authenticateToken, async (req, res) => {
  try {
    const { guildId, pactId } = req.params;
    const { status } = req.body;

    if (!['active', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Ungültiger Status' });
    }

    // Check if user is leader
    const membership = await db.get(`
      SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, req.user.id]);

    if (!membership || membership.role !== 'leader') {
      return res.status(403).json({ error: 'Nur der Gildenleiter kann Paktanfragen beantworten' });
    }

    // Get pact and verify it's for this guild
    const pact = await db.get(`
      SELECT * FROM guild_pacts WHERE id = ? AND guild_2_id = ? AND status = 'pending'
    `, [pactId, guildId]);

    if (!pact) {
      return res.status(404).json({ error: 'Paktanfrage nicht gefunden' });
    }

    await db.run(`
      UPDATE guild_pacts 
      SET status = ?, responded_by = ?, responded_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, req.user.id, pactId]);

    res.json({ 
      message: status === 'active' ? 'Pakt geschlossen!' : 'Paktanfrage abgelehnt'
    });
  } catch (error) {
    console.error('Respond to pact error:', error);
    res.status(500).json({ error: 'Serverfehler beim Beantworten der Paktanfrage' });
  }
});

// Cancel pact (leader only)
router.delete('/:guildId/pacts/:pactId', authenticateToken, async (req, res) => {
  try {
    const { guildId, pactId } = req.params;

    // Check if user is leader
    const membership = await db.get(`
      SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?
    `, [guildId, req.user.id]);

    if (!membership || membership.role !== 'leader') {
      return res.status(403).json({ error: 'Nur der Gildenleiter kann Pakte beenden' });
    }

    // Get pact and verify guild is part of it
    const pact = await db.get(`
      SELECT * FROM guild_pacts 
      WHERE id = ? AND (guild_1_id = ? OR guild_2_id = ?) AND status = 'active'
    `, [pactId, guildId, guildId]);

    if (!pact) {
      return res.status(404).json({ error: 'Pakt nicht gefunden' });
    }

    await db.run(`
      UPDATE guild_pacts SET status = 'cancelled' WHERE id = ?
    `, [pactId]);

    res.json({ message: 'Pakt beendet' });
  } catch (error) {
    console.error('Cancel pact error:', error);
    res.status(500).json({ error: 'Serverfehler beim Beenden des Pakts' });
  }
});

// Get user's guild
router.get('/my/guild', authenticateToken, async (req, res) => {
  try {
    const membership = await db.get(`
      SELECT 
        gm.guild_id,
        gm.role,
        gm.joined_at,
        g.name,
        g.tag,
        g.description,
        g.leader_id
      FROM guild_members gm
      JOIN guilds g ON gm.guild_id = g.id
      WHERE gm.user_id = ?
    `, [req.user.id]);

    if (!membership) {
      return res.json({ guild: null });
    }

    res.json({ guild: membership });
  } catch (error) {
    console.error('Get my guild error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden deiner Gilde' });
  }
});

// Get user's pending applications
router.get('/my/applications', authenticateToken, async (req, res) => {
  try {
    const applications = await db.all(`
      SELECT 
        ga.*,
        g.name as guild_name,
        g.tag as guild_tag
      FROM guild_applications ga
      JOIN guilds g ON ga.guild_id = g.id
      WHERE ga.user_id = ?
      ORDER BY ga.created_at DESC
    `, [req.user.id]);

    res.json({ applications });
  } catch (error) {
    console.error('Get my applications error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden deiner Bewerbungen' });
  }
});

// Cancel application
router.delete('/my/applications/:applicationId', authenticateToken, async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await db.get(`
      SELECT id FROM guild_applications 
      WHERE id = ? AND user_id = ? AND status = 'pending'
    `, [applicationId, req.user.id]);

    if (!application) {
      return res.status(404).json({ error: 'Bewerbung nicht gefunden' });
    }

    await db.run('DELETE FROM guild_applications WHERE id = ?', [applicationId]);

    res.json({ message: 'Bewerbung zurückgezogen' });
  } catch (error) {
    console.error('Cancel application error:', error);
    res.status(500).json({ error: 'Serverfehler beim Zurückziehen der Bewerbung' });
  }
});

export default router;
