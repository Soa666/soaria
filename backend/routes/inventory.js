import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get user inventory
router.get('/', authenticateToken, async (req, res) => {
  try {
    const inventory = await db.all(`
      SELECT 
        ui.item_id,
        ui.quantity,
        i.name,
        i.display_name,
        i.type,
        i.rarity,
        i.description,
        i.image_path
      FROM user_inventory ui
      JOIN items i ON ui.item_id = i.id
      WHERE ui.user_id = ? AND ui.quantity > 0
      ORDER BY i.type, i.name
    `, [req.user.id]);

    res.json({ inventory });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Add items to inventory (for resource collection)
router.post('/add', authenticateToken, async (req, res) => {
  try {
    const { item_id, quantity } = req.body;

    if (!item_id || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Item-ID und Menge sind erforderlich' });
    }

    // Check if item exists
    const item = await db.get('SELECT id FROM items WHERE id = ?', [item_id]);
    if (!item) {
      return res.status(404).json({ error: 'Item nicht gefunden' });
    }

    // Add or update inventory
    await db.run(`
      INSERT INTO user_inventory (user_id, item_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + ?
    `, [req.user.id, item_id, quantity, quantity]);

    const updated = await db.get(
      'SELECT quantity FROM user_inventory WHERE user_id = ? AND item_id = ?',
      [req.user.id, item_id]
    );

    res.json({ message: 'Items hinzugefügt', quantity: updated.quantity });
  } catch (error) {
    console.error('Add inventory error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Collect resource (simplified endpoint)
router.post('/collect', authenticateToken, async (req, res) => {
  try {
    const { item_name, quantity = 1 } = req.body;

    if (!item_name) {
      return res.status(400).json({ error: 'Item-Name ist erforderlich' });
    }

    // Get item by name
    const item = await db.get('SELECT id, type FROM items WHERE name = ?', [item_name]);
    if (!item) {
      return res.status(404).json({ error: 'Item nicht gefunden' });
    }

    if (item.type !== 'resource') {
      return res.status(400).json({ error: 'Nur Ressourcen können gesammelt werden' });
    }

    // Add to inventory
    await db.run(`
      INSERT INTO user_inventory (user_id, item_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + ?
    `, [req.user.id, item.id, quantity, quantity]);

    const updated = await db.get(`
      SELECT ui.quantity, i.display_name
      FROM user_inventory ui
      JOIN items i ON ui.item_id = i.id
      WHERE ui.user_id = ? AND ui.item_id = ?
    `, [req.user.id, item.id]);

    res.json({
      message: `${quantity}x ${updated.display_name} gesammelt`,
      quantity: updated.quantity
    });
  } catch (error) {
    console.error('Collect resource error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

export default router;
