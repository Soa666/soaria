import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './database.js';
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server läuft' });
});

// Initialize database and start server
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server läuft auf Port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Fehler beim Initialisieren der Datenbank:', error);
    process.exit(1);
  });
