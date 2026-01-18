import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// Get all recipes
router.get('/recipes', async (req, res) => {
  try {
    const recipes = await db.all(`
      SELECT 
        cr.id,
        cr.result_item_id,
        cr.result_quantity,
        cr.required_workbench_level,
        i.name as result_name,
        i.display_name as result_display_name,
        i.type as result_type,
        i.rarity as result_rarity,
        i.image_path as result_image_path
      FROM crafting_recipes cr
      JOIN items i ON cr.result_item_id = i.id
      ORDER BY cr.required_workbench_level, i.name
    `);

    // Get ingredients for each recipe
    for (const recipe of recipes) {
      const ingredients = await db.all(`
        SELECT 
          ri.item_id,
          ri.quantity,
          i.name,
          i.display_name,
          i.type,
          i.rarity,
          i.image_path
        FROM recipe_ingredients ri
        JOIN items i ON ri.item_id = i.id
        WHERE ri.recipe_id = ?
      `, [recipe.id]);
      recipe.ingredients = ingredients;
    }

    res.json({ recipes });
  } catch (error) {
    console.error('Get recipes error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Craft item
router.post('/craft', authenticateToken, async (req, res) => {
  try {
    const { recipe_id } = req.body;

    if (!recipe_id) {
      return res.status(400).json({ error: 'Rezept-ID ist erforderlich' });
    }

    // Check if player is at home (0,0) or near home
    const user = await db.get('SELECT world_x, world_y FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    const distanceFromHome = Math.sqrt(Math.pow(user.world_x, 2) + Math.pow(user.world_y, 2));
    if (distanceFromHome > 50) {
      return res.status(400).json({ 
        error: 'Du musst zu Hause sein um zu craften! Reise zuerst zu deinem Grundstück.',
        notAtHome: true
      });
    }

    // Get recipe
    const recipe = await db.get(`
      SELECT * FROM crafting_recipes WHERE id = ?
    `, [recipe_id]);

    if (!recipe) {
      return res.status(404).json({ error: 'Rezept nicht gefunden' });
    }

    // Check workbench level
    const workbench = await db.get(
      'SELECT level FROM user_workbench WHERE user_id = ?',
      [req.user.id]
    );

    if (!workbench || workbench.level < recipe.required_workbench_level) {
      return res.status(400).json({
        error: `Werkbank-Level ${recipe.required_workbench_level} erforderlich (aktuell: ${workbench?.level || 0})`
      });
    }

    // Get ingredients
    const ingredients = await db.all(`
      SELECT item_id, quantity FROM recipe_ingredients WHERE recipe_id = ?
    `, [recipe_id]);

    // Check if user has all ingredients
    for (const ingredient of ingredients) {
      const inventory = await db.get(
        'SELECT quantity FROM user_inventory WHERE user_id = ? AND item_id = ?',
        [req.user.id, ingredient.item_id]
      );

      if (!inventory || inventory.quantity < ingredient.quantity) {
        const item = await db.get('SELECT display_name FROM items WHERE id = ?', [ingredient.item_id]);
        return res.status(400).json({
          error: `Nicht genug ${item.display_name} (benötigt: ${ingredient.quantity}, vorhanden: ${inventory?.quantity || 0})`
        });
      }
    }

    // Remove ingredients from inventory
    for (const ingredient of ingredients) {
      await db.run(`
        UPDATE user_inventory 
        SET quantity = quantity - ? 
        WHERE user_id = ? AND item_id = ?
      `, [ingredient.quantity, req.user.id, ingredient.item_id]);

      // Remove if quantity reaches 0
      await db.run(`
        DELETE FROM user_inventory 
        WHERE user_id = ? AND item_id = ? AND quantity <= 0
      `, [req.user.id, ingredient.item_id]);
    }

    // Add result to inventory
    await db.run(`
      INSERT INTO user_inventory (user_id, item_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + ?
    `, [req.user.id, recipe.result_item_id, recipe.result_quantity, recipe.result_quantity]);

    const resultItem = await db.get('SELECT display_name FROM items WHERE id = ?', [recipe.result_item_id]);

    res.json({
      message: `${recipe.result_quantity}x ${resultItem.display_name} erfolgreich gecraftet`
    });
  } catch (error) {
    console.error('Craft error:', error);
    res.status(500).json({ error: 'Serverfehler beim Craften' });
  }
});

// Create recipe (requires manage_recipes permission)
router.post('/recipes', authenticateToken, requirePermission('manage_recipes'), async (req, res) => {
  try {
    const { result_item_id, result_quantity, required_workbench_level, ingredients } = req.body;

    if (!result_item_id || !ingredients || ingredients.length === 0) {
      return res.status(400).json({ error: 'Result-Item und Zutaten sind erforderlich' });
    }

    const result = await db.run(`
      INSERT INTO crafting_recipes (result_item_id, result_quantity, required_workbench_level)
      VALUES (?, ?, ?)
    `, [result_item_id, result_quantity || 1, required_workbench_level || 0]);

    // Add ingredients
    for (const ing of ingredients) {
      await db.run(`
        INSERT INTO recipe_ingredients (recipe_id, item_id, quantity)
        VALUES (?, ?, ?)
      `, [result.lastID, ing.item_id, ing.quantity]);
    }

    res.status(201).json({ message: 'Rezept erstellt', recipe_id: result.lastID });
  } catch (error) {
    console.error('Create recipe error:', error);
    res.status(500).json({ error: 'Serverfehler beim Erstellen des Rezepts' });
  }
});

export default router;
