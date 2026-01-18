import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// Get all buildings with requirements for admin
router.get('/', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const buildings = await db.all(`
      SELECT 
        b.id,
        b.name,
        b.display_name,
        b.description,
        b.image_path,
        b.position_x,
        b.position_y,
        b.size_width,
        b.size_height,
        b.unlock_order,
        b.max_level,
        b.build_duration_minutes,
        b.upgrade_duration_minutes
      FROM buildings b
      ORDER BY b.unlock_order
    `);

    // Get requirements for each building
    for (const building of buildings) {
      const buildRequirements = await db.all(`
        SELECT 
          br.id,
          br.item_id,
          br.quantity,
          br.level,
          br.requirement_type,
          i.name,
          i.display_name,
          i.image_path
        FROM building_requirements br
        JOIN items i ON br.item_id = i.id
        WHERE br.building_id = ? AND br.requirement_type = 'build'
        ORDER BY br.level, i.display_name
      `, [building.id]);

      const upgradeRequirements = await db.all(`
        SELECT 
          br.id,
          br.item_id,
          br.quantity,
          br.level,
          br.requirement_type,
          i.name,
          i.display_name,
          i.image_path
        FROM building_requirements br
        JOIN items i ON br.item_id = i.id
        WHERE br.building_id = ? AND br.requirement_type = 'upgrade'
        ORDER BY br.level, i.display_name
      `, [building.id]);

      building.build_requirements = buildRequirements;
      building.upgrade_requirements = upgradeRequirements;
    }

    res.json({ buildings });
  } catch (error) {
    console.error('Get buildings admin error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Gebäude' });
  }
});

// Add/Update building requirement
router.post('/:buildingId/requirements', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const buildingId = parseInt(req.params.buildingId);
    const { item_id, quantity, level, requirement_type } = req.body;

    if (!item_id || !quantity || requirement_type === undefined) {
      return res.status(400).json({ error: 'item_id, quantity und requirement_type sind erforderlich' });
    }

    await db.run(`
      INSERT INTO building_requirements (building_id, item_id, quantity, level, requirement_type)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(building_id, item_id, level, requirement_type) 
      DO UPDATE SET quantity = excluded.quantity
    `, [buildingId, item_id, quantity, level || 0, requirement_type || 'build']);

    res.json({ message: 'Anforderung erfolgreich hinzugefügt/aktualisiert' });
  } catch (error) {
    console.error('Add requirement error:', error);
    res.status(500).json({ error: 'Serverfehler beim Hinzufügen der Anforderung' });
  }
});

// Update building requirement (MUST be before /:buildingId route to avoid route conflict)
router.put('/requirements/:requirementId', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const requirementId = parseInt(req.params.requirementId);
    const { item_id, quantity, level, requirement_type } = req.body;

    console.log('Update requirement request:', { requirementId, item_id, quantity, level, requirement_type });

    if (!item_id || quantity === undefined || requirement_type === undefined) {
      return res.status(400).json({ error: 'item_id, quantity und requirement_type sind erforderlich' });
    }

    // Get the building_id from the existing requirement
    const existing = await db.get('SELECT building_id, requirement_type FROM building_requirements WHERE id = ?', [requirementId]);
    if (!existing) {
      return res.status(404).json({ error: 'Anforderung nicht gefunden' });
    }

    // Check if the new combination would conflict with another requirement
    const conflict = await db.get(`
      SELECT id FROM building_requirements 
      WHERE building_id = ? AND item_id = ? AND level = ? AND requirement_type = ? AND id != ?
    `, [existing.building_id, item_id, level || 0, requirement_type || 'build', requirementId]);

    if (conflict) {
      return res.status(400).json({ error: 'Eine Anforderung mit diesen Werten existiert bereits' });
    }

    await db.run(`
      UPDATE building_requirements 
      SET item_id = ?, quantity = ?, level = ?, requirement_type = ?
      WHERE id = ?
    `, [item_id, quantity, level || 0, requirement_type || 'build', requirementId]);

    console.log('Requirement updated successfully');
    res.json({ message: 'Anforderung erfolgreich aktualisiert' });
  } catch (error) {
    console.error('Update requirement error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Serverfehler beim Aktualisieren: ' + error.message });
  }
});

// Delete building requirement (MUST be before /:buildingId route to avoid route conflict)
router.delete('/requirements/:requirementId', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const requirementId = parseInt(req.params.requirementId);
    
    await db.run('DELETE FROM building_requirements WHERE id = ?', [requirementId]);

    res.json({ message: 'Anforderung erfolgreich gelöscht' });
  } catch (error) {
    console.error('Delete requirement error:', error);
    res.status(500).json({ error: 'Serverfehler beim Löschen' });
  }
});

// Update building (duration, etc.) - MUST be last to avoid route conflicts
router.put('/:buildingId', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const buildingId = parseInt(req.params.buildingId);
    const { 
      build_duration_minutes, 
      upgrade_duration_minutes, 
      max_level,
      display_name,
      description 
    } = req.body;

    await db.run(`
      UPDATE buildings
      SET 
        build_duration_minutes = COALESCE(?, build_duration_minutes),
        upgrade_duration_minutes = COALESCE(?, upgrade_duration_minutes),
        max_level = COALESCE(?, max_level),
        display_name = COALESCE(?, display_name),
        description = COALESCE(?, description)
      WHERE id = ?
    `, [build_duration_minutes, upgrade_duration_minutes, max_level, display_name, description, buildingId]);

    res.json({ message: 'Gebäude erfolgreich aktualisiert' });
  } catch (error) {
    console.error('Update building error:', error);
    res.status(500).json({ error: 'Serverfehler beim Aktualisieren' });
  }
});

export default router;
