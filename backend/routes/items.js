import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// Get all items
router.get('/', async (req, res) => {
  try {
    const items = await db.all('SELECT * FROM items ORDER BY type, name');
    res.json({ items });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get item by ID
router.get('/:id', async (req, res) => {
  try {
    const item = await db.get('SELECT * FROM items WHERE id = ?', [req.params.id]);
    if (!item) {
      return res.status(404).json({ error: 'Item nicht gefunden' });
    }
    res.json({ item });
  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Create new item (requires manage_items permission)
router.post('/', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { name, display_name, type, description, rarity, image_path } = req.body;

    if (!name || !display_name || !type) {
      return res.status(400).json({ error: 'Name, Display-Name und Typ sind erforderlich' });
    }

    const result = await db.run(
      'INSERT INTO items (name, display_name, type, description, rarity, image_path) VALUES (?, ?, ?, ?, ?, ?)',
      [name, display_name, type, description || null, rarity || 'common', image_path || null]
    );

    const item = await db.get('SELECT * FROM items WHERE id = ?', [result.lastID]);
    res.status(201).json({ message: 'Item erstellt', item });
  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({ error: 'Serverfehler beim Erstellen des Items' });
  }
});

// Update item
router.put('/:id', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name, type, description, rarity, image_path } = req.body;

    await db.run(`
      UPDATE items 
      SET display_name = ?, type = ?, description = ?, rarity = ?, image_path = ?
      WHERE id = ?
    `, [display_name, type, description || null, rarity || 'common', image_path || null, id]);

    const item = await db.get('SELECT * FROM items WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({ error: 'Item nicht gefunden' });
    }

    res.json({ message: 'Item erfolgreich aktualisiert', item });
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ error: 'Serverfehler beim Aktualisieren des Items' });
  }
});

// Update item image
router.put('/:id/image', authenticateToken, requirePermission('manage_items'), async (req, res) => {
  try {
    const { id } = req.params;
    const { image_path } = req.body;

    await db.run('UPDATE items SET image_path = ? WHERE id = ?', [image_path || null, id]);

    const item = await db.get('SELECT * FROM items WHERE id = ?', [id]);
    res.json({ message: 'Bild aktualisiert', item });
  } catch (error) {
    console.error('Update item image error:', error);
    res.status(500).json({ error: 'Serverfehler beim Aktualisieren des Bilds' });
  }
});

export default router;
