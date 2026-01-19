import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { trackCrafting } from '../helpers/statistics.js';

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
        cr.required_building_id,
        cr.required_building_level,
        i.name as result_name,
        i.display_name as result_display_name,
        i.type as result_type,
        i.rarity as result_rarity,
        i.image_path as result_image_path,
        b.display_name as building_display_name,
        b.name as building_name
      FROM crafting_recipes cr
      JOIN items i ON cr.result_item_id = i.id
      LEFT JOIN buildings b ON cr.required_building_id = b.id
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

    // Check if player is at home (their Grundstück)
    const user = await db.get('SELECT world_x, world_y, home_x, home_y FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    const homeX = user.home_x ?? user.world_x;
    const homeY = user.home_y ?? user.world_y;
    const distanceFromHome = Math.sqrt(Math.pow(user.world_x - homeX, 2) + Math.pow(user.world_y - homeY, 2));
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

    // Check workbench level (if required)
    if (recipe.required_workbench_level > 0) {
      const workbench = await db.get(
        'SELECT level FROM user_workbench WHERE user_id = ?',
        [req.user.id]
      );

      if (!workbench || workbench.level < recipe.required_workbench_level) {
        return res.status(400).json({
          error: `Werkbank-Level ${recipe.required_workbench_level} erforderlich (aktuell: ${workbench?.level || 0})`
        });
      }
    }

    // Check building requirement (e.g., Schmiede for metal items)
    if (recipe.required_building_id) {
      const building = await db.get(`
        SELECT ub.level, b.display_name 
        FROM user_buildings ub
        JOIN buildings b ON ub.building_id = b.id
        WHERE ub.user_id = ? AND ub.building_id = ?
      `, [req.user.id, recipe.required_building_id]);

      const requiredLevel = recipe.required_building_level || 1;
      const buildingInfo = await db.get('SELECT display_name FROM buildings WHERE id = ?', [recipe.required_building_id]);

      if (!building) {
        return res.status(400).json({
          error: `Du benötigst eine ${buildingInfo?.display_name || 'Gebäude'} um dieses Rezept zu craften!`
        });
      }

      if (building.level < requiredLevel) {
        return res.status(400).json({
          error: `${building.display_name} Level ${requiredLevel} erforderlich (aktuell: Level ${building.level})`
        });
      }
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

    // Track crafting statistics
    await trackCrafting(req.user.id, recipe.result_item_id, false);

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
    const { result_item_id, result_quantity, required_workbench_level, required_building_id, required_building_level, ingredients } = req.body;

    if (!result_item_id || !ingredients || ingredients.length === 0) {
      return res.status(400).json({ error: 'Result-Item und Zutaten sind erforderlich' });
    }

    const result = await db.run(`
      INSERT INTO crafting_recipes (result_item_id, result_quantity, required_workbench_level, required_building_id, required_building_level)
      VALUES (?, ?, ?, ?, ?)
    `, [
      result_item_id, 
      result_quantity || 1, 
      required_workbench_level || 0,
      required_building_id || null,
      required_building_level || 1
    ]);

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

// Update recipe
router.put('/recipes/:id', authenticateToken, requirePermission('manage_recipes'), async (req, res) => {
  try {
    const { id } = req.params;
    const { result_item_id, result_quantity, required_workbench_level, required_building_id, required_building_level, ingredients } = req.body;

    // Update recipe
    await db.run(`
      UPDATE crafting_recipes SET 
        result_item_id = ?,
        result_quantity = ?,
        required_workbench_level = ?,
        required_building_id = ?,
        required_building_level = ?
      WHERE id = ?
    `, [
      result_item_id,
      result_quantity || 1,
      required_workbench_level || 0,
      required_building_id || null,
      required_building_level || 1,
      id
    ]);

    // Update ingredients - delete old and insert new
    if (ingredients && ingredients.length > 0) {
      await db.run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]);
      for (const ing of ingredients) {
        await db.run(`
          INSERT INTO recipe_ingredients (recipe_id, item_id, quantity)
          VALUES (?, ?, ?)
        `, [id, ing.item_id, ing.quantity]);
      }
    }

    res.json({ message: 'Rezept aktualisiert' });
  } catch (error) {
    console.error('Update recipe error:', error);
    res.status(500).json({ error: 'Serverfehler beim Aktualisieren' });
  }
});

// Delete recipe
router.delete('/recipes/:id', authenticateToken, requirePermission('manage_recipes'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete recipe (ingredients will cascade delete)
    const result = await db.run('DELETE FROM crafting_recipes WHERE id = ?', [id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Rezept nicht gefunden' });
    }

    res.json({ message: 'Rezept gelöscht' });
  } catch (error) {
    console.error('Delete recipe error:', error);
    res.status(500).json({ error: 'Serverfehler beim Löschen' });
  }
});

// Get all buildings (for recipe form dropdown)
router.get('/buildings', async (req, res) => {
  try {
    const buildings = await db.all('SELECT id, name, display_name, max_level FROM buildings ORDER BY display_name');
    res.json({ buildings });
  } catch (error) {
    console.error('Get buildings error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

export default router;
