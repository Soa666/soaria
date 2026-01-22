import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './database.js';
import db from './database.js';
import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import inventoryRoutes from './routes/inventory.js';
import craftingRoutes from './routes/crafting.js';
import workbenchRoutes from './routes/workbench.js';
import collectionRoutes from './routes/collection.js';
import adminRoutes from './routes/admin.js';
import groupsRoutes from './routes/groups.js';
import filesRoutes from './routes/files.js';
import buildingsRoutes from './routes/buildings.js';
import buildingsAdminRoutes from './routes/buildingsAdmin.js';
import mapRoutes from './routes/map.js';
import guildsRoutes from './routes/guilds.js';
import playersRoutes from './routes/players.js';
import messagesRoutes from './routes/messages.js';
import npcsRoutes from './routes/npcs.js';
import combatRoutes from './routes/combat.js';
import adminNpcsRoutes from './routes/adminNpcs.js';
import equipmentRoutes from './routes/equipment.js';
import questsRoutes from './routes/quests.js';
import resourcesRoutes from './routes/resources.js';
import feedbackRoutes from './routes/feedback.js';
import buffsRoutes, { expireBuffs } from './routes/buffs.js';
import tilesetRoutes from './routes/tileset.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (for nginx X-Forwarded-For headers)
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (item images and character images)
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/items', express.static(path.join(__dirname, '../items')));
app.use('/chars', express.static(path.join(__dirname, '../chars')));
app.use('/buildings', express.static(path.join(__dirname, '../buildings')));
app.use('/world', express.static(path.join(__dirname, '../world')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/crafting', craftingRoutes);
app.use('/api/workbench', workbenchRoutes);
app.use('/api/collection', collectionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/buildings', buildingsRoutes);
app.use('/api/admin/buildings', buildingsAdminRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/guilds', guildsRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/npcs', npcsRoutes);
app.use('/api/combat', combatRoutes);
app.use('/api/admin/npcs', adminNpcsRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/quests', questsRoutes);
app.use('/api/resources', resourcesRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/buffs', buffsRoutes);
app.use('/api/tileset', tilesetRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server läuft' });
});

// Automatic monster respawn routine
async function respawnMonsters() {
  try {
    // Find all dead monsters that should respawn
    const deadMonsters = await db.all(`
      SELECT 
        wn.id,
        wn.monster_type_id,
        wn.respawn_minutes,
        wn.last_killed_at,
        mt.base_health,
        mt.health_per_level,
        wn.level
      FROM world_npcs wn
      JOIN monster_types mt ON wn.monster_type_id = mt.id
      WHERE wn.is_active = 0 
        AND wn.last_killed_at IS NOT NULL
        AND datetime(wn.last_killed_at, '+' || wn.respawn_minutes || ' minutes') <= datetime('now')
    `);

    for (const monster of deadMonsters) {
      const maxHealth = monster.base_health + (monster.level - 1) * (monster.health_per_level || 0);
      await db.run(`
        UPDATE world_npcs 
        SET is_active = 1, current_health = ?, last_killed_at = NULL 
        WHERE id = ?
      `, [maxHealth, monster.id]);
    }

    if (deadMonsters.length > 0) {
      console.log(`[Respawn] ${deadMonsters.length} Monster respawnt`);
    }
  } catch (error) {
    console.error('[Respawn] Fehler:', error);
  }
}

// Automatic buff expiration routine (uses shared function from buffs.js)

// Initialize database and start server
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server läuft auf Port ${PORT}`);
      
      // Start respawn routine - runs every 60 seconds
      setInterval(respawnMonsters, 60000);
      console.log('[Respawn] Automatische Respawn-Routine gestartet (alle 60 Sekunden)');
      
      // Start buff expiration routine - runs every 30 seconds
      setInterval(expireBuffs, 30000);
      console.log('[Buffs] Automatische Buff-Ablauf-Routine gestartet (alle 30 Sekunden)');
      
      // Run once immediately
      respawnMonsters();
      expireBuffs();
    });
  })
  .catch((error) => {
    console.error('Fehler beim Initialisieren der Datenbank:', error);
    process.exit(1);
  });
