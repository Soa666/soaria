import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// Get all groups
router.get('/', authenticateToken, requirePermission('manage_groups'), async (req, res) => {
  try {
    const groups = await db.all(`
      SELECT 
        g.id,
        g.name,
        g.display_name,
        g.description,
        g.created_at
      FROM groups g
      ORDER BY g.name
    `);

    // Get permissions for each group
    for (const group of groups) {
      const permissions = await db.all(`
        SELECT 
          p.id,
          p.name,
          p.display_name,
          p.description
        FROM permissions p
        JOIN group_permissions gp ON p.id = gp.permission_id
        WHERE gp.group_id = ?
      `, [group.id]);
      group.permissions = permissions;
    }

    res.json({ groups });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get all permissions
router.get('/permissions', authenticateToken, requirePermission('manage_groups'), async (req, res) => {
  try {
    const permissions = await db.all(`
      SELECT id, name, display_name, description
      FROM permissions
      ORDER BY name
    `);

    res.json({ permissions });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Create new group
router.post('/', authenticateToken, requirePermission('manage_groups'), async (req, res) => {
  try {
    const { name, display_name, description, permission_ids } = req.body;

    if (!name || !display_name) {
      return res.status(400).json({ error: 'Name und Display-Name sind erforderlich' });
    }

    // Create group
    const result = await db.run(`
      INSERT INTO groups (name, display_name, description)
      VALUES (?, ?, ?)
    `, [name, display_name, description || null]);

    // Add permissions
    if (permission_ids && Array.isArray(permission_ids)) {
      for (const permId of permission_ids) {
        await db.run(`
          INSERT INTO group_permissions (group_id, permission_id)
          VALUES (?, ?)
        `, [result.lastID, permId]);
      }
    }

    const group = await db.get('SELECT * FROM groups WHERE id = ?', [result.lastID]);
    const permissions = await db.all(`
      SELECT p.id, p.name, p.display_name
      FROM permissions p
      JOIN group_permissions gp ON p.id = gp.permission_id
      WHERE gp.group_id = ?
    `, [result.lastID]);
    group.permissions = permissions;

    res.status(201).json({
      message: 'Gruppe erfolgreich erstellt',
      group
    });
  } catch (error) {
    console.error('Create group error:', error);
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Eine Gruppe mit diesem Namen existiert bereits' });
    }
    res.status(500).json({ error: 'Serverfehler beim Erstellen der Gruppe' });
  }
});

// Update group
router.put('/:id', authenticateToken, requirePermission('manage_groups'), async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name, description, permission_ids } = req.body;

    // Update group
    await db.run(`
      UPDATE groups
      SET display_name = ?, description = ?
      WHERE id = ?
    `, [display_name, description || null, id]);

    // Update permissions
    await db.run('DELETE FROM group_permissions WHERE group_id = ?', [id]);
    
    if (permission_ids && Array.isArray(permission_ids)) {
      for (const permId of permission_ids) {
        await db.run(`
          INSERT INTO group_permissions (group_id, permission_id)
          VALUES (?, ?)
        `, [id, permId]);
      }
    }

    const group = await db.get('SELECT * FROM groups WHERE id = ?', [id]);
    const permissions = await db.all(`
      SELECT p.id, p.name, p.display_name
      FROM permissions p
      JOIN group_permissions gp ON p.id = gp.permission_id
      WHERE gp.group_id = ?
    `, [id]);
    group.permissions = permissions;

    res.json({
      message: 'Gruppe erfolgreich aktualisiert',
      group
    });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Serverfehler beim Aktualisieren der Gruppe' });
  }
});

// Delete group
router.delete('/:id', authenticateToken, requirePermission('manage_groups'), async (req, res) => {
  try {
    const { id } = req.params;

    // Don't allow deleting default groups
    const group = await db.get('SELECT name FROM groups WHERE id = ?', [id]);
    if (group && ['admin', 'mod', 'vip', 'user'].includes(group.name)) {
      return res.status(400).json({ error: 'Standard-Gruppen können nicht gelöscht werden' });
    }

    await db.run('DELETE FROM groups WHERE id = ?', [id]);

    res.json({ message: 'Gruppe erfolgreich gelöscht' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Serverfehler beim Löschen der Gruppe' });
  }
});

// Assign group to user
router.post('/:groupId/users/:userId', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    await db.run(`
      INSERT OR IGNORE INTO user_groups (user_id, group_id)
      VALUES (?, ?)
    `, [userId, groupId]);

    res.json({ message: 'Gruppe erfolgreich zugewiesen' });
  } catch (error) {
    console.error('Assign group error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Remove group from user
router.delete('/:groupId/users/:userId', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    await db.run(`
      DELETE FROM user_groups
      WHERE user_id = ? AND group_id = ?
    `, [userId, groupId]);

    res.json({ message: 'Gruppe erfolgreich entfernt' });
  } catch (error) {
    console.error('Remove group error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

export default router;
