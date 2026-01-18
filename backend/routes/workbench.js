import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get user workbench
router.get('/', authenticateToken, async (req, res) => {
  try {
    let workbench = await db.get(
      'SELECT * FROM user_workbench WHERE user_id = ?',
      [req.user.id]
    );

    // Create if doesn't exist
    if (!workbench) {
      await db.run(
        'INSERT INTO user_workbench (user_id, level) VALUES (?, 1)',
        [req.user.id]
      );
      workbench = await db.get(
        'SELECT * FROM user_workbench WHERE user_id = ?',
        [req.user.id]
      );
    }

    res.json({ workbench });
  } catch (error) {
    console.error('Get workbench error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Upgrade workbench
router.post('/upgrade', authenticateToken, async (req, res) => {
  try {
    const { upgrade_item_id, upgrade_item_quantity } = req.body;

    if (!upgrade_item_id || !upgrade_item_quantity) {
      return res.status(400).json({ error: 'Upgrade-Item und Menge sind erforderlich' });
    }

    // Get current workbench
    let workbench = await db.get(
      'SELECT * FROM user_workbench WHERE user_id = ?',
      [req.user.id]
    );

    if (!workbench) {
      await db.run(
        'INSERT INTO user_workbench (user_id, level) VALUES (?, 1)',
        [req.user.id]
      );
      workbench = await db.get(
        'SELECT * FROM user_workbench WHERE user_id = ?',
        [req.user.id]
      );
    }

    // Check if user has upgrade items
    const inventory = await db.get(
      'SELECT quantity FROM user_inventory WHERE user_id = ? AND item_id = ?',
      [req.user.id, upgrade_item_id]
    );

    if (!inventory || inventory.quantity < upgrade_item_quantity) {
      return res.status(400).json({ error: 'Nicht genug Upgrade-Items' });
    }

    // Remove upgrade items
    await db.run(`
      UPDATE user_inventory 
      SET quantity = quantity - ? 
      WHERE user_id = ? AND item_id = ?
    `, [upgrade_item_quantity, req.user.id, upgrade_item_id]);

    await db.run(`
      DELETE FROM user_inventory 
      WHERE user_id = ? AND item_id = ? AND quantity <= 0
    `, [req.user.id, upgrade_item_id]);

    // Upgrade workbench
    await db.run(`
      UPDATE user_workbench 
      SET level = level + 1 
      WHERE user_id = ?
    `, [req.user.id]);

    const updated = await db.get(
      'SELECT * FROM user_workbench WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      message: `Werkbank auf Level ${updated.level} upgegradet`,
      workbench: updated
    });
  } catch (error) {
    console.error('Upgrade workbench error:', error);
    res.status(500).json({ error: 'Serverfehler beim Upgraden' });
  }
});

export default router;
