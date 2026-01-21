import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'spiel.db');
const db = new sqlite3.Database(dbPath);

// Helper function to generate unique coordinates
function generateUniqueCoordinates(existingCoords, minDistance = 50, maxAttempts = 100) {
  const minX = -2000;
  const maxX = 2000;
  const minY = -2000;
  const maxY = 2000;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
    const y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
    
    // Check if coordinates are far enough from existing ones
    let tooClose = false;
    for (const coord of existingCoords) {
      const distance = Math.sqrt(
        Math.pow(x - coord.world_x, 2) + Math.pow(y - coord.world_y, 2)
      );
      if (distance < minDistance) {
        tooClose = true;
        break;
      }
    }
    
    if (!tooClose) {
      return { x, y };
    }
  }
  
  // If we couldn't find a unique spot, just return random coordinates
  return {
    x: Math.floor(Math.random() * (maxX - minX + 1)) + minX,
    y: Math.floor(Math.random() * (maxY - minY + 1)) + minY
  };
}

// Store original run method
const originalRun = db.run.bind(db);

// Promisify database methods
db.get = promisify(db.get.bind(db));
db.all = promisify(db.all.bind(db));

// Custom run method that returns lastID
db.run = function(sql, params = []) {
  return new Promise((resolve, reject) => {
    originalRun(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

// Initialize database schema
export async function initDatabase() {
  // Users table
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'mod', 'vip', 'user')),
      avatar_path TEXT,
      world_x INTEGER DEFAULT 0,
      world_y INTEGER DEFAULT 0,
      is_activated INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      last_ip TEXT,
      registration_ip TEXT
    )
  `);

  // Add is_activated column to existing users
  try {
    await db.run(`
      ALTER TABLE users ADD COLUMN is_activated INTEGER DEFAULT 1
    `);
    // Set all existing users as activated
    await db.run(`UPDATE users SET is_activated = 1 WHERE is_activated IS NULL`);
  } catch (e) {
    // Column might already exist
  }

  // Add IP columns to existing users table
  try {
    await db.run(`ALTER TABLE users ADD COLUMN last_ip TEXT`);
  } catch (e) { /* Column might already exist */ }
  try {
    await db.run(`ALTER TABLE users ADD COLUMN registration_ip TEXT`);
  } catch (e) { /* Column might already exist */ }

  // Activation tokens table
  await db.run(`
    CREATE TABLE IF NOT EXISTS activation_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Add coordinates to existing users if they don't have them
  try {
    await db.run(`
      ALTER TABLE users ADD COLUMN world_x INTEGER DEFAULT 0
    `);
  } catch (e) {
    // Column might already exist
  }

  try {
    await db.run(`
      ALTER TABLE users ADD COLUMN world_y INTEGER DEFAULT 0
    `);
  } catch (e) {
    // Column might already exist
  }

  // Assign random coordinates to users without coordinates
  const usersWithoutCoords = await db.all(`
    SELECT id FROM users WHERE world_x = 0 AND world_y = 0
  `);
  
  if (usersWithoutCoords.length > 0) {
    const existingCoords = await db.all('SELECT world_x, world_y FROM users WHERE world_x != 0 OR world_y != 0');
    
    for (const user of usersWithoutCoords) {
      const coords = generateUniqueCoordinates(existingCoords);
      await db.run(
        'UPDATE users SET world_x = ?, world_y = ? WHERE id = ?',
        [coords.x, coords.y, user.id]
      );
      existingCoords.push({ world_x: coords.x, world_y: coords.y });
    }
  }

  // Items table (erweiterbares System)
  await db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('resource', 'tool', 'material', 'upgrade', 'other')),
      description TEXT,
      rarity TEXT DEFAULT 'common' CHECK(rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
      image_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User inventory
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      UNIQUE(user_id, item_id)
    )
  `);

  // Crafting recipes
  await db.run(`
    CREATE TABLE IF NOT EXISTS crafting_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      result_item_id INTEGER NOT NULL,
      result_quantity INTEGER DEFAULT 1,
      required_workbench_level INTEGER DEFAULT 0,
      required_building_id INTEGER,
      required_building_level INTEGER DEFAULT 1,
      FOREIGN KEY (result_item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (required_building_id) REFERENCES buildings(id) ON DELETE SET NULL
    )
  `);

  // Migration: Add building requirement columns to crafting_recipes
  try {
    await db.run('ALTER TABLE crafting_recipes ADD COLUMN required_building_id INTEGER');
  } catch (e) { /* Column exists */ }
  try {
    await db.run('ALTER TABLE crafting_recipes ADD COLUMN required_building_level INTEGER DEFAULT 1');
  } catch (e) { /* Column exists */ }

  // Recipe ingredients
  await db.run(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES crafting_recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      UNIQUE(recipe_id, item_id)
    )
  `);

  // User workbench (upgradable)
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_workbench (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      level INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Collection jobs (automatisches Sammeln)
  await db.run(`
    CREATE TABLE IF NOT EXISTS collection_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      started_at DATETIME NOT NULL,
      completed_at DATETIME NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'claimed', 'paused')),
      paused_at DATETIME,
      remaining_seconds INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Add pause columns to collection_jobs if not exist
  try {
    await db.run('ALTER TABLE collection_jobs ADD COLUMN paused_at DATETIME');
  } catch (e) { /* Column exists */ }
  try {
    await db.run('ALTER TABLE collection_jobs ADD COLUMN remaining_seconds INTEGER');
  } catch (e) { /* Column exists */ }

  // Collection job results
  await db.run(`
    CREATE TABLE IF NOT EXISTS collection_job_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (job_id) REFERENCES collection_jobs(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )
  `);

  // Groups (Rollen mit Berechtigungen)
  await db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Permissions (Berechtigungen)
  await db.run(`
    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT
    )
  `);

  // Group permissions (Welche Berechtigungen hat welche Gruppe)
  await db.run(`
    CREATE TABLE IF NOT EXISTS group_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
      UNIQUE(group_id, permission_id)
    )
  `);

  // User groups (Welche Gruppen hat ein User)
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      UNIQUE(user_id, group_id)
    )
  `);

  // Buildings table
  await db.run(`
    CREATE TABLE IF NOT EXISTS buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      image_path TEXT,
      position_x INTEGER DEFAULT 0,
      position_y INTEGER DEFAULT 0,
      size_width INTEGER DEFAULT 100,
      size_height INTEGER DEFAULT 100,
      unlock_order INTEGER DEFAULT 0,
      max_level INTEGER DEFAULT 3,
      build_duration_minutes INTEGER DEFAULT 5,
      upgrade_duration_minutes INTEGER DEFAULT 3,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Building requirements (Ressourcen zum Bauen)
  await db.run(`
    CREATE TABLE IF NOT EXISTS building_requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      building_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      level INTEGER DEFAULT 0,
      requirement_type TEXT DEFAULT 'build' CHECK(requirement_type IN ('build', 'upgrade')),
      FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      UNIQUE(building_id, item_id, level, requirement_type)
    )
  `);

  // Building jobs (Bau- und Upgrade-Jobs mit Zeit)
  await db.run(`
    CREATE TABLE IF NOT EXISTS building_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      building_id INTEGER NOT NULL,
      job_type TEXT NOT NULL CHECK(job_type IN ('build', 'upgrade')),
      target_level INTEGER DEFAULT 1,
      duration_minutes INTEGER NOT NULL,
      started_at DATETIME NOT NULL,
      completed_at DATETIME NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'claimed', 'paused')),
      paused_at DATETIME,
      remaining_seconds INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
    )
  `);

  // Add pause columns to building_jobs if not exist
  try {
    await db.run('ALTER TABLE building_jobs ADD COLUMN paused_at DATETIME');
  } catch (e) { /* Column exists */ }
  try {
    await db.run('ALTER TABLE building_jobs ADD COLUMN remaining_seconds INTEGER');
  } catch (e) { /* Column exists */ }

  // User buildings (gebaute Gebäude)
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      building_id INTEGER NOT NULL,
      level INTEGER DEFAULT 1,
      built_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
      UNIQUE(user_id, building_id)
    )
  `);

  // Property settings (Grundstück-Einstellungen)
  await db.run(`
    CREATE TABLE IF NOT EXISTS property_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_path TEXT DEFAULT '/buildings/huette1.jpg',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Property hotspots (klickbare Bereiche auf dem Grundstück)
  await db.run(`
    CREATE TABLE IF NOT EXISTS property_hotspots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      building_name TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      label TEXT NOT NULL,
      icon TEXT,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(building_name)
    )
  `);

  // Insert default property settings if not exists
  const existingSettings = await db.get('SELECT id FROM property_settings LIMIT 1');
  if (!existingSettings) {
    await db.run('INSERT INTO property_settings (image_path) VALUES (?)', ['/buildings/huette1.jpg']);
  }

  // Insert default hotspots if not exists
  const existingHotspots = await db.get('SELECT id FROM property_hotspots LIMIT 1');
  if (!existingHotspots) {
    const defaultHotspots = [
      { buildingName: 'schmiede', x: 65, y: 25, width: 12, height: 12, label: 'Schmiede', icon: '⚒️', description: 'Amboss - Hier schmiedest du Waffen und Rüstung', sortOrder: 1 },
      { buildingName: 'saegewerk', x: 18, y: 55, width: 15, height: 15, label: 'Sägewerk', icon: '🪚', description: 'Tischkreissäge - Verarbeite Holz zu Brettern', sortOrder: 2 },
      { buildingName: 'werkbank', x: 75, y: 20, width: 15, height: 15, label: 'Werkbank', icon: '🔨', description: 'Werkbank - Crafting und Upgrades', sortOrder: 3 },
      { buildingName: 'brunnen', x: 60, y: 50, width: 10, height: 10, label: 'Brunnen', icon: '💧', description: 'Brunnen - Versorgt dich mit Wasser', sortOrder: 4 },
      { buildingName: 'lager', x: 40, y: 40, width: 12, height: 12, label: 'Lager', icon: '📦', description: 'Lager - Erweitert dein Inventar', sortOrder: 5 }
    ];

    for (const hotspot of defaultHotspots) {
      await db.run(`
        INSERT INTO property_hotspots (building_name, x, y, width, height, label, icon, description, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        hotspot.buildingName,
        hotspot.x,
        hotspot.y,
        hotspot.width,
        hotspot.height,
        hotspot.label,
        hotspot.icon,
        hotspot.description,
        hotspot.sortOrder
      ]);
    }
  }

  // Insert default permissions
  await insertDefaultPermissions();
  
  // Insert default groups
  await insertDefaultGroups();

  // Insert default items
  await insertDefaultItems();
  
  // Insert default recipes
  await insertDefaultRecipes();
  
  // Insert default buildings
  await insertDefaultBuildings();

  // Guilds table (Gilden)
  await db.run(`
    CREATE TABLE IF NOT EXISTS guilds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      tag TEXT UNIQUE NOT NULL,
      description TEXT,
      leader_id INTEGER NOT NULL,
      icon_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Guild members (Gildenmitglieder)
  await db.run(`
    CREATE TABLE IF NOT EXISTS guild_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member' CHECK(role IN ('leader', 'officer', 'member')),
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id)
    )
  `);

  // Guild applications (Gildenbewerbungen)
  await db.run(`
    CREATE TABLE IF NOT EXISTS guild_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      message TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
      reviewed_by INTEGER,
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE(guild_id, user_id)
    )
  `);

  // Guild pacts (Nichtangriffspakte zwischen Gilden)
  await db.run(`
    CREATE TABLE IF NOT EXISTS guild_pacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_1_id INTEGER NOT NULL,
      guild_2_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'rejected', 'cancelled')),
      requested_by INTEGER NOT NULL,
      responded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      responded_at DATETIME,
      FOREIGN KEY (guild_1_id) REFERENCES guilds(id) ON DELETE CASCADE,
      FOREIGN KEY (guild_2_id) REFERENCES guilds(id) ON DELETE CASCADE,
      FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (responded_by) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE(guild_1_id, guild_2_id)
    )
  `);

  // Email templates table
  await db.run(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      subject TEXT NOT NULL,
      html_content TEXT NOT NULL,
      text_content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // SMTP configuration table (multiple configs possible, one active)
  await db.run(`
    CREATE TABLE IF NOT EXISTS smtp_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER DEFAULT 587,
      secure INTEGER DEFAULT 0,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      from_name TEXT DEFAULT 'Soaria',
      from_email TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Discord webhooks table
  await db.run(`
    CREATE TABLE IF NOT EXISTS discord_webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      webhook_url TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      event_type TEXT NOT NULL,
      message_template TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Messages table (Nachrichten-System)
  // Check if messages table exists and needs migration
  const messagesTableInfo = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='messages'");
  
  if (messagesTableInfo && !messagesTableInfo.sql.includes('attack_received')) {
    // Old table exists without new message types - migrate it
    console.log('[DB] Migrating messages table to support new message types...');
    
    // Create new table with updated CHECK constraint
    await db.run(`
      CREATE TABLE IF NOT EXISTS messages_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        recipient_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        is_system INTEGER DEFAULT 0,
        message_type TEXT DEFAULT 'personal',
        related_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        read_at DATETIME,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Copy data from old table
    await db.run(`
      INSERT INTO messages_new (id, sender_id, recipient_id, subject, content, is_read, is_system, message_type, related_id, created_at, read_at)
      SELECT id, sender_id, recipient_id, subject, content, is_read, is_system, message_type, related_id, created_at, read_at
      FROM messages
    `);
    
    // Drop old table and rename new one
    await db.run('DROP TABLE messages');
    await db.run('ALTER TABLE messages_new RENAME TO messages');
    
    console.log('[DB] Messages table migration completed');
  } else if (!messagesTableInfo) {
    // Table doesn't exist, create it fresh
    await db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        recipient_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        is_system INTEGER DEFAULT 0,
        message_type TEXT DEFAULT 'personal',
        related_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        read_at DATETIME,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }

  // Message reports table (Gemeldete Nachrichten)
  await db.run(`
    CREATE TABLE IF NOT EXISTS message_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      reporter_id INTEGER NOT NULL,
      reported_user_id INTEGER NOT NULL,
      reason TEXT,
      message_content TEXT NOT NULL,
      message_subject TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'action_taken', 'dismissed')),
      reviewed_by INTEGER,
      reviewed_at DATETIME,
      admin_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL,
      FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Create index for faster unread message queries
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread 
    ON messages(recipient_id, is_read)
  `);

  // Feedback/Bug Reports table
  await db.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('bug', 'suggestion', 'other')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      page_url TEXT,
      browser_info TEXT,
      status TEXT DEFAULT 'new' CHECK(status IN ('new', 'in_progress', 'resolved', 'wont_fix', 'duplicate')),
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'critical')),
      admin_notes TEXT,
      reviewed_by INTEGER,
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Add gold column to users (Currency system)
  try {
    await db.run(`ALTER TABLE users ADD COLUMN gold INTEGER DEFAULT 100`);
  } catch (e) {
    // Column might already exist
  }

  // Add travel destination columns to users (Reisesystem)
  try {
    await db.run(`ALTER TABLE users ADD COLUMN travel_target_x INTEGER`);
    await db.run(`ALTER TABLE users ADD COLUMN travel_target_y INTEGER`);
    await db.run(`ALTER TABLE users ADD COLUMN travel_start_time DATETIME`);
    await db.run(`ALTER TABLE users ADD COLUMN travel_end_time DATETIME`);
  } catch (e) {
    // Columns might already exist
  }

  // Add home coordinates to users (Grundstück-Position)
  try {
    await db.run(`ALTER TABLE users ADD COLUMN home_x INTEGER`);
    await db.run(`ALTER TABLE users ADD COLUMN home_y INTEGER`);
    // Set home position to current world position for existing users who don't have home set
    await db.run(`UPDATE users SET home_x = world_x, home_y = world_y WHERE home_x IS NULL`);
  } catch (e) {
    // Columns might already exist
  }

  // Add last_activity column for online tracking
  try {
    await db.run(`ALTER TABLE users ADD COLUMN last_activity DATETIME`);
  } catch (e) {
    // Column might already exist
  }

  // Monster types table (Monster-Typen für Admin-Verwaltung)
  await db.run(`
    CREATE TABLE IF NOT EXISTS monster_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      image_path TEXT,
      is_boss INTEGER DEFAULT 0,
      min_level INTEGER DEFAULT 1,
      max_level INTEGER DEFAULT 5,
      base_health INTEGER DEFAULT 100,
      base_attack INTEGER DEFAULT 10,
      base_defense INTEGER DEFAULT 5,
      health_per_level INTEGER DEFAULT 20,
      attack_per_level INTEGER DEFAULT 3,
      defense_per_level INTEGER DEFAULT 2,
      spawn_weight INTEGER DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add respawn_cooldown column to monster_types
  try {
    await db.run(`ALTER TABLE monster_types ADD COLUMN respawn_cooldown INTEGER DEFAULT 10`);
    // Set default cooldowns: normal monsters 5-10 min, bosses 60 min
    await db.run(`UPDATE monster_types SET respawn_cooldown = 5 WHERE is_boss = 0 AND respawn_cooldown IS NULL`);
    await db.run(`UPDATE monster_types SET respawn_cooldown = 60 WHERE is_boss = 1 AND respawn_cooldown IS NULL`);
  } catch (e) {
    // Column might already exist
  }

  // Monster loot table (Was Monster droppen können)
  await db.run(`
    CREATE TABLE IF NOT EXISTS monster_loot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monster_type_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      min_quantity INTEGER DEFAULT 1,
      max_quantity INTEGER DEFAULT 1,
      drop_chance REAL DEFAULT 0.5,
      gold_min INTEGER DEFAULT 0,
      gold_max INTEGER DEFAULT 0,
      FOREIGN KEY (monster_type_id) REFERENCES monster_types(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      UNIQUE(monster_type_id, item_id)
    )
  `);

  // NPC types table (Händler)
  await db.run(`
    CREATE TABLE IF NOT EXISTS npc_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      image_path TEXT,
      npc_type TEXT DEFAULT 'merchant' CHECK(npc_type IN ('merchant', 'quest_giver', 'trainer')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // NPC shop items (Was Händler verkaufen/kaufen)
  await db.run(`
    CREATE TABLE IF NOT EXISTS npc_shop_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      npc_type_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      buy_price INTEGER,
      sell_price INTEGER,
      stock INTEGER DEFAULT -1,
      FOREIGN KEY (npc_type_id) REFERENCES npc_types(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      UNIQUE(npc_type_id, item_id)
    )
  `);

  // World NPCs (Spawned NPCs auf der Karte)
  await db.run(`
    CREATE TABLE IF NOT EXISTS world_npcs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      npc_type_id INTEGER,
      monster_type_id INTEGER,
      world_x INTEGER NOT NULL,
      world_y INTEGER NOT NULL,
      level INTEGER DEFAULT 1,
      current_health INTEGER,
      respawn_minutes INTEGER DEFAULT 10,
      last_killed_at DATETIME,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (npc_type_id) REFERENCES npc_types(id) ON DELETE CASCADE,
      FOREIGN KEY (monster_type_id) REFERENCES monster_types(id) ON DELETE CASCADE
    )
  `);

  // Player stats (Level, XP, Kampfwerte)
  await db.run(`
    CREATE TABLE IF NOT EXISTS player_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      level INTEGER DEFAULT 1,
      experience INTEGER DEFAULT 0,
      max_health INTEGER DEFAULT 100,
      current_health INTEGER DEFAULT 100,
      base_attack INTEGER DEFAULT 10,
      base_defense INTEGER DEFAULT 5,
      last_healed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Add last_healed_at column if it doesn't exist
  try {
    await db.run(`ALTER TABLE player_stats ADD COLUMN last_healed_at DATETIME`);
  } catch (e) {
    // Column might already exist
  }

  // Equipment types (Ausrüstungstypen)
  await db.run(`
    CREATE TABLE IF NOT EXISTS equipment_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      slot TEXT NOT NULL CHECK(slot IN ('weapon', 'head', 'chest', 'legs', 'feet', 'hands', 'shield', 'accessory')),
      image_path TEXT,
      base_attack INTEGER DEFAULT 0,
      base_defense INTEGER DEFAULT 0,
      base_health INTEGER DEFAULT 0,
      required_level INTEGER DEFAULT 1,
      rarity TEXT DEFAULT 'common' CHECK(rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
      craftable INTEGER DEFAULT 1,
      craft_recipe_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User equipment (besitzte Ausrüstung mit Qualität)
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      equipment_type_id INTEGER NOT NULL,
      quality TEXT DEFAULT 'normal' CHECK(quality IN ('poor', 'normal', 'good', 'excellent', 'masterwork', 'legendary')),
      quality_bonus REAL DEFAULT 1.0,
      is_equipped INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (equipment_type_id) REFERENCES equipment_types(id) ON DELETE CASCADE
    )
  `);

  // Profession stats (Berufe wie Schmieden)
  await db.run(`
    CREATE TABLE IF NOT EXISTS profession_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      profession TEXT NOT NULL CHECK(profession IN ('blacksmith', 'leatherworker', 'tailor', 'alchemist')),
      level INTEGER DEFAULT 1,
      experience INTEGER DEFAULT 0,
      UNIQUE(user_id, profession),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Equipment crafting recipes
  await db.run(`
    CREATE TABLE IF NOT EXISTS equipment_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_type_id INTEGER NOT NULL,
      profession TEXT NOT NULL,
      required_profession_level INTEGER DEFAULT 1,
      experience_reward INTEGER DEFAULT 10,
      craft_time INTEGER DEFAULT 60,
      FOREIGN KEY (equipment_type_id) REFERENCES equipment_types(id) ON DELETE CASCADE
    )
  `);

  // Add craft_time column if not exists
  try {
    await db.run('ALTER TABLE equipment_recipes ADD COLUMN craft_time INTEGER DEFAULT 60');
  } catch (e) {
    // Column already exists
  }

  // Active crafting jobs
  await db.run(`
    CREATE TABLE IF NOT EXISTS crafting_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      recipe_id INTEGER NOT NULL,
      quality TEXT DEFAULT 'normal',
      started_at DATETIME NOT NULL,
      finish_at DATETIME NOT NULL,
      paused_at DATETIME,
      remaining_seconds INTEGER,
      is_completed INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipe_id) REFERENCES equipment_recipes(id) ON DELETE CASCADE
    )
  `);

  // Equipment recipe materials
  await db.run(`
    CREATE TABLE IF NOT EXISTS equipment_recipe_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY (recipe_id) REFERENCES equipment_recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )
  `);

  // Combat log (Kampfprotokoll)
  await db.run(`
    CREATE TABLE IF NOT EXISTS combat_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attacker_user_id INTEGER,
      defender_user_id INTEGER,
      world_npc_id INTEGER,
      winner TEXT CHECK(winner IN ('attacker', 'defender', 'draw')),
      attacker_damage_dealt INTEGER DEFAULT 0,
      defender_damage_dealt INTEGER DEFAULT 0,
      gold_gained INTEGER DEFAULT 0,
      experience_gained INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (attacker_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (defender_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (world_npc_id) REFERENCES world_npcs(id) ON DELETE SET NULL
    )
  `);

  // User Statistics - tracking all player actions
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_statistics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      -- Combat stats
      monsters_killed INTEGER DEFAULT 0,
      bosses_killed INTEGER DEFAULT 0,
      players_killed INTEGER DEFAULT 0,
      deaths INTEGER DEFAULT 0,
      total_damage_dealt INTEGER DEFAULT 0,
      total_damage_received INTEGER DEFAULT 0,
      -- Collection stats
      resources_collected INTEGER DEFAULT 0,
      wood_collected INTEGER DEFAULT 0,
      stone_collected INTEGER DEFAULT 0,
      iron_ore_collected INTEGER DEFAULT 0,
      herbs_collected INTEGER DEFAULT 0,
      -- Crafting stats
      items_crafted INTEGER DEFAULT 0,
      equipment_crafted INTEGER DEFAULT 0,
      -- Building stats
      buildings_built INTEGER DEFAULT 0,
      buildings_upgraded INTEGER DEFAULT 0,
      -- Travel stats
      distance_traveled INTEGER DEFAULT 0,
      tiles_walked INTEGER DEFAULT 0,
      -- Economy stats
      gold_earned INTEGER DEFAULT 0,
      gold_spent INTEGER DEFAULT 0,
      items_sold INTEGER DEFAULT 0,
      items_bought INTEGER DEFAULT 0,
      -- Social stats
      messages_sent INTEGER DEFAULT 0,
      trades_completed INTEGER DEFAULT 0,
      -- Time stats
      collection_time_minutes INTEGER DEFAULT 0,
      crafting_time_minutes INTEGER DEFAULT 0,
      -- Misc
      quests_completed INTEGER DEFAULT 0,
      achievements_earned INTEGER DEFAULT 0,
      logins INTEGER DEFAULT 0,
      -- Rarity items obtained
      legendary_items_obtained INTEGER DEFAULT 0,
      epic_items_obtained INTEGER DEFAULT 0,
      rare_items_obtained INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Add rarity columns if they don't exist (migration)
  try {
    await db.run('ALTER TABLE user_statistics ADD COLUMN legendary_items_obtained INTEGER DEFAULT 0');
  } catch (e) { /* Column might already exist */ }
  try {
    await db.run('ALTER TABLE user_statistics ADD COLUMN epic_items_obtained INTEGER DEFAULT 0');
  } catch (e) { /* Column might already exist */ }
  try {
    await db.run('ALTER TABLE user_statistics ADD COLUMN rare_items_obtained INTEGER DEFAULT 0');
  } catch (e) { /* Column might already exist */ }

  // Quests table - defines available quests
  await db.run(`
    CREATE TABLE IF NOT EXISTS quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'main' CHECK(category IN ('main', 'side', 'daily', 'weekly', 'achievement')),
      is_repeatable INTEGER DEFAULT 0,
      cooldown_hours INTEGER DEFAULT 0,
      min_level INTEGER DEFAULT 1,
      prerequisite_quest_id INTEGER,
      reward_gold INTEGER DEFAULT 0,
      reward_experience INTEGER DEFAULT 0,
      reward_item_id INTEGER,
      reward_item_quantity INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prerequisite_quest_id) REFERENCES quests(id) ON DELETE SET NULL,
      FOREIGN KEY (reward_item_id) REFERENCES items(id) ON DELETE SET NULL
    )
  `);

  // Quest objectives - each quest can have multiple objectives
  await db.run(`
    CREATE TABLE IF NOT EXISTS quest_objectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id INTEGER NOT NULL,
      objective_type TEXT NOT NULL,
      target_id INTEGER,
      target_name TEXT,
      required_amount INTEGER DEFAULT 1,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE
    )
  `);

  // User quests - tracks player progress on quests
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      quest_id INTEGER NOT NULL,
      status TEXT DEFAULT 'available' CHECK(status IN ('available', 'active', 'completed', 'claimed')),
      started_at DATETIME,
      completed_at DATETIME,
      claimed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE,
      UNIQUE(user_id, quest_id)
    )
  `);

  // User quest progress - tracks progress on each objective
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_quest_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      quest_id INTEGER NOT NULL,
      objective_id INTEGER NOT NULL,
      current_amount INTEGER DEFAULT 0,
      is_completed INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE,
      FOREIGN KEY (objective_id) REFERENCES quest_objectives(id) ON DELETE CASCADE,
      UNIQUE(user_id, objective_id)
    )
  `);

  // Initialize player stats for existing users
  const usersWithoutStats = await db.all(`
    SELECT u.id FROM users u 
    LEFT JOIN player_stats ps ON u.id = ps.user_id 
    WHERE ps.id IS NULL
  `);
  
  for (const user of usersWithoutStats) {
    await db.run(`
      INSERT INTO player_stats (user_id, level, experience, max_health, current_health, base_attack, base_defense)
      VALUES (?, 1, 0, 100, 100, 10, 5)
    `, [user.id]);
  }

  // Initialize statistics for existing users
  const usersWithoutStatistics = await db.all(`
    SELECT u.id FROM users u 
    LEFT JOIN user_statistics us ON u.id = us.user_id 
    WHERE us.id IS NULL
  `);
  
  for (const user of usersWithoutStatistics) {
    await db.run('INSERT INTO user_statistics (user_id) VALUES (?)', [user.id]);
  }

  // Resource Node Types (Stone deposits, Trees, etc.)
  await db.run(`
    CREATE TABLE IF NOT EXISTS resource_node_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL CHECK(category IN ('mining', 'woodcutting', 'herbalism')),
      icon TEXT DEFAULT '🪨',
      required_tool_type TEXT,
      base_gather_time INTEGER DEFAULT 30,
      respawn_minutes INTEGER DEFAULT 30,
      min_level INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Resource Node Drops (what items drop from each node type)
  await db.run(`
    CREATE TABLE IF NOT EXISTS resource_node_drops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_type_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      drop_chance REAL DEFAULT 100,
      min_quantity INTEGER DEFAULT 1,
      max_quantity INTEGER DEFAULT 1,
      min_tool_tier INTEGER DEFAULT 0,
      is_rare INTEGER DEFAULT 0,
      FOREIGN KEY (node_type_id) REFERENCES resource_node_types(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    )
  `);

  // World Resource Nodes (actual nodes placed on the map)
  await db.run(`
    CREATE TABLE IF NOT EXISTS world_resource_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_type_id INTEGER NOT NULL,
      world_x INTEGER NOT NULL,
      world_y INTEGER NOT NULL,
      current_amount INTEGER DEFAULT 3,
      max_amount INTEGER DEFAULT 3,
      last_gathered_at DATETIME,
      depleted_at DATETIME,
      is_depleted INTEGER DEFAULT 0,
      FOREIGN KEY (node_type_id) REFERENCES resource_node_types(id) ON DELETE CASCADE
    )
  `);

  // Tool Types (Pickaxes, Axes, etc.)
  await db.run(`
    CREATE TABLE IF NOT EXISTS tool_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL CHECK(category IN ('pickaxe', 'axe', 'sickle')),
      tier INTEGER DEFAULT 1,
      speed_bonus REAL DEFAULT 1.0,
      rare_drop_bonus REAL DEFAULT 0,
      efficiency_bonus REAL DEFAULT 0,
      durability INTEGER DEFAULT 100,
      required_level INTEGER DEFAULT 1,
      icon TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User Tools (which tools players own)
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tool_type_id INTEGER NOT NULL,
      current_durability INTEGER DEFAULT 100,
      is_equipped INTEGER DEFAULT 0,
      acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (tool_type_id) REFERENCES tool_types(id) ON DELETE CASCADE
    )
  `);

  // Active Gathering Jobs
  await db.run(`
    CREATE TABLE IF NOT EXISTS gathering_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      node_id INTEGER NOT NULL,
      tool_id INTEGER,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finish_at DATETIME NOT NULL,
      is_completed INTEGER DEFAULT 0,
      is_cancelled INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (node_id) REFERENCES world_resource_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (tool_id) REFERENCES user_tools(id) ON DELETE SET NULL
    )
  `);

  // Insert default resource node types
  await insertDefaultResourceNodes();

  // Insert default tools
  await insertDefaultTools();

  // Spawn resource nodes on map
  await spawnResourceNodes();

  // Insert default daily login quest
  await insertDefaultQuests();

  // Insert default monsters
  await insertDefaultMonsters();
  
  // Insert default NPCs
  await insertDefaultNPCs();
  
  // Insert default equipment
  await insertDefaultEquipment();
  
  // Spawn world NPCs if none exist
  await spawnWorldNPCs();

  // Insert default activation email template
  try {
    const existingTemplate = await db.get('SELECT id FROM email_templates WHERE name = ?', ['activation']);
    if (!existingTemplate) {
      await db.run(`
        INSERT INTO email_templates (name, subject, html_content, text_content)
        VALUES (?, ?, ?, ?)
      `, [
        'activation',
        'Aktiviere dein Soaria-Konto',
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, rgba(20, 15, 30, 0.95) 0%, rgba(40, 25, 50, 0.95) 100%); }
    .container { background: linear-gradient(145deg, rgba(30, 20, 40, 0.98), rgba(20, 15, 30, 0.98)); border: 3px solid #8b6914; border-radius: 12px; padding: 30px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6); }
    h1 { color: #d4af37; text-align: center; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8); }
    p { color: #e8dcc0; margin: 15px 0; }
    .button { display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #4a2c1a 0%, #6b4423 50%, #4a2c1a 100%); color: #d4af37; text-decoration: none; border-radius: 8px; font-weight: bold; text-align: center; margin: 20px 0; border: 2px solid #8b6914; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4); }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 2px solid rgba(212, 175, 55, 0.3); text-align: center; color: #8b7a5a; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🏰 Willkommen bei Soaria!</h1>
    <p>Hallo {{username}},</p>
    <p>vielen Dank für deine Registrierung bei Soaria! Um dein Konto zu aktivieren, klicke bitte auf den folgenden Button:</p>
    <div style="text-align: center;">
      <a href="{{activationUrl}}" class="button">Konto aktivieren</a>
    </div>
    <p>Oder kopiere diesen Link in deinen Browser:</p>
    <p style="word-break: break-all; color: #d4af37;">{{activationUrl}}</p>
    <p>Dieser Link ist 24 Stunden gültig.</p>
    <p>Falls du dich nicht registriert hast, kannst du diese E-Mail ignorieren.</p>
    <div class="footer">
      <p>Soaria - Fantasy RPG</p>
      <p>Dies ist eine automatische E-Mail. Bitte antworte nicht darauf.</p>
    </div>
  </div>
</body>
</html>`,
        `Willkommen bei Soaria!

Hallo {{username}},

vielen Dank für deine Registrierung bei Soaria! Um dein Konto zu aktivieren, klicke bitte auf den folgenden Link:

{{activationUrl}}

Dieser Link ist 24 Stunden gültig.

Falls du dich nicht registriert hast, kannst du diese E-Mail ignorieren.

Soaria - Fantasy RPG`
      ]);
    }
  } catch (error) {
    console.error('Error inserting default email template:', error);
  }

  // ============ BUFF SYSTEM ============
  // Buff types table - defines all possible buffs
  // effect_type: attack_percent, attack_flat, defense_percent, defense_flat, 
  //              health_percent, health_flat, speed_percent, exp_percent, 
  //              gold_percent, gather_speed, craft_speed, damage_reduction
  await db.run(`
    CREATE TABLE IF NOT EXISTS buff_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      icon TEXT DEFAULT '✨',
      effect_type TEXT NOT NULL,
      effect_value REAL NOT NULL,
      stackable INTEGER DEFAULT 0,
      max_stacks INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // target_type: 'all', 'user', 'guild', 'guildless', 'level_min', 'level_max', 'level_range'
  // target_id: user_id for 'user', guild_id for 'guild', level for level-based, NULL for 'all'/'guildless'
  await db.run(`
    CREATE TABLE IF NOT EXISTS active_buffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buff_type_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER,
      duration_minutes INTEGER,
      stacks INTEGER DEFAULT 1,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (buff_type_id) REFERENCES buff_types(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Insert default buff types
  await insertDefaultBuffTypes();

  console.log('Database initialized successfully');
}

async function insertDefaultItems() {
  const defaultItems = [
    // Resources
    { name: 'holz', display_name: 'Holz', type: 'resource', rarity: 'common' },
    { name: 'lehm', display_name: 'Lehm', type: 'resource', rarity: 'common' },
    { name: 'stein', display_name: 'Stein', type: 'resource', rarity: 'common' },
    { name: 'wasser', display_name: 'Wasser', type: 'resource', rarity: 'common' },
    { name: 'feuerstein', display_name: 'Feuerstein', type: 'resource', rarity: 'uncommon' },
    { name: 'ast', display_name: 'Ast', type: 'resource', rarity: 'common' },
    // { name: 'eisenbarren', display_name: 'Eisenbarren', type: 'material', rarity: 'uncommon' }, // Removed - user doesn't want auto-creation
    { name: 'seil', display_name: 'Seil', type: 'material', rarity: 'common', description: 'Ein robustes Seil aus Pflanzenfasern' },
    { name: 'stoff', display_name: 'Stoff', type: 'material', rarity: 'common', description: 'Gewebter Stoff' },
    { name: 'kohle', display_name: 'Kohle', type: 'material', rarity: 'uncommon', description: 'Brennbare Kohle zum Schmieden von Stahl' },
    { name: 'kupfererz', display_name: 'Kupfererz', type: 'resource', rarity: 'common', description: 'Rohes Kupfererz' },
    { name: 'silbererz', display_name: 'Silbererz', type: 'resource', rarity: 'uncommon', description: 'Glänzendes Silbererz' },
    { name: 'golderz', display_name: 'Golderz', type: 'resource', rarity: 'rare', description: 'Kostbares Golderz' },
    
    // Tools
    { name: 'spitzhacke_basic', display_name: 'Spitzhacke (Basis)', type: 'tool', rarity: 'common' },
    { name: 'spitzhacke_iron', display_name: 'Spitzhacke (Eisen)', type: 'tool', rarity: 'uncommon' },
    
    // Vehicles
    { name: 'boot', display_name: 'Boot', type: 'tool', rarity: 'uncommon', description: 'Ein einfaches Holzboot. Ermöglicht die Reise über Wasser.' },
  ];

  for (const item of defaultItems) {
    try {
      await db.run(`
        INSERT OR IGNORE INTO items (name, display_name, type, rarity)
        VALUES (?, ?, ?, ?)
      `, [item.name, item.display_name, item.type, item.rarity]);
    } catch (err) {
      // Item already exists, skip
    }
  }
}

async function insertDefaultRecipes() {
  // Get item IDs
  const ast = await db.get('SELECT id FROM items WHERE name = ?', ['ast']);
  const stein = await db.get('SELECT id FROM items WHERE name = ?', ['stein']);
  const eisenbarren = await db.get('SELECT id FROM items WHERE name = ?', ['eisenbarren']);
  const spitzhacke_basic = await db.get('SELECT id FROM items WHERE name = ?', ['spitzhacke_basic']);
  const spitzhacke_iron = await db.get('SELECT id FROM items WHERE name = ?', ['spitzhacke_iron']);

  // Basic Spitzhacke: 2 Äste + 3 Steine
  if (ast && stein && spitzhacke_basic) {
    let existingRecipe = await db.get('SELECT id FROM crafting_recipes WHERE result_item_id = ?', [spitzhacke_basic.id]);
    
    if (!existingRecipe) {
      const recipe = await db.run(`
        INSERT INTO crafting_recipes (result_item_id, result_quantity, required_workbench_level)
        VALUES (?, 1, 0)
      `, [spitzhacke_basic.id]);
      existingRecipe = { id: recipe.lastID };
    }
    
    // Delete existing ingredients for this recipe first to avoid duplicates
    await db.run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [existingRecipe.id]);
    await db.run('INSERT INTO recipe_ingredients (recipe_id, item_id, quantity) VALUES (?, ?, ?)', 
      [existingRecipe.id, ast.id, 2]);
    await db.run('INSERT INTO recipe_ingredients (recipe_id, item_id, quantity) VALUES (?, ?, ?)', 
      [existingRecipe.id, stein.id, 3]);
  }

  // Iron Spitzhacke: 2 Äste + 3 Eisenbarren
  if (ast && eisenbarren && spitzhacke_iron) {
    let existingRecipe = await db.get('SELECT id FROM crafting_recipes WHERE result_item_id = ?', [spitzhacke_iron.id]);
    
    if (!existingRecipe) {
      const recipe = await db.run(`
        INSERT INTO crafting_recipes (result_item_id, result_quantity, required_workbench_level)
        VALUES (?, 1, 1)
      `, [spitzhacke_iron.id]);
      existingRecipe = { id: recipe.lastID };
    }
    
    // Delete existing ingredients for this recipe first to avoid duplicates
    await db.run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [existingRecipe.id]);
    await db.run('INSERT INTO recipe_ingredients (recipe_id, item_id, quantity) VALUES (?, ?, ?)', 
      [existingRecipe.id, ast.id, 2]);
    await db.run('INSERT INTO recipe_ingredients (recipe_id, item_id, quantity) VALUES (?, ?, ?)', 
      [existingRecipe.id, eisenbarren.id, 3]);
  }
}

async function insertDefaultPermissions() {
  const permissions = [
    { name: 'manage_items', display_name: 'Items verwalten', description: 'Items erstellen, bearbeiten und löschen' },
    { name: 'manage_recipes', display_name: 'Rezepte verwalten', description: 'Crafting-Rezepte erstellen, bearbeiten und löschen' },
    { name: 'manage_users', display_name: 'User verwalten', description: 'User-Rollen ändern und User löschen' },
    { name: 'manage_settings', display_name: 'Einstellungen verwalten', description: 'E-Mail-Templates und Discord-Webhooks verwalten' },
    { name: 'manage_groups', display_name: 'Gruppen verwalten', description: 'Gruppen erstellen, bearbeiten und Berechtigungen verwalten' },
    { name: 'view_admin', display_name: 'Admin-Panel ansehen', description: 'Zugriff auf das Admin-Panel' },
  ];

  for (const perm of permissions) {
    try {
      await db.run(`
        INSERT OR IGNORE INTO permissions (name, display_name, description)
        VALUES (?, ?, ?)
      `, [perm.name, perm.display_name, perm.description]);
    } catch (err) {
      // Permission already exists
    }
  }
}

async function insertDefaultGroups() {
  // Get permission IDs
  const manageItems = await db.get('SELECT id FROM permissions WHERE name = ?', ['manage_items']);
  const manageRecipes = await db.get('SELECT id FROM permissions WHERE name = ?', ['manage_recipes']);
  const manageUsers = await db.get('SELECT id FROM permissions WHERE name = ?', ['manage_users']);
  const manageGroups = await db.get('SELECT id FROM permissions WHERE name = ?', ['manage_groups']);
  const viewAdmin = await db.get('SELECT id FROM permissions WHERE name = ?', ['view_admin']);
  const manageSettings = await db.get('SELECT id FROM permissions WHERE name = ?', ['manage_settings']);

  // Admin group - alle Berechtigungen
  const adminGroup = await db.run(`
    INSERT OR IGNORE INTO groups (name, display_name, description)
    VALUES ('admin', 'Administrator', 'Vollzugriff auf alle Funktionen')
  `);
  let adminGroupId = adminGroup.lastID;
  if (!adminGroupId) {
    const existing = await db.get('SELECT id FROM groups WHERE name = ?', ['admin']);
    adminGroupId = existing.id;
  }
  
  if (adminGroupId && manageItems && manageRecipes && manageUsers && manageGroups && viewAdmin && manageSettings) {
    await db.run('INSERT OR IGNORE INTO group_permissions (group_id, permission_id) VALUES (?, ?)', [adminGroupId, manageItems.id]);
    await db.run('INSERT OR IGNORE INTO group_permissions (group_id, permission_id) VALUES (?, ?)', [adminGroupId, manageRecipes.id]);
    await db.run('INSERT OR IGNORE INTO group_permissions (group_id, permission_id) VALUES (?, ?)', [adminGroupId, manageUsers.id]);
    await db.run('INSERT OR IGNORE INTO group_permissions (group_id, permission_id) VALUES (?, ?)', [adminGroupId, manageGroups.id]);
    await db.run('INSERT OR IGNORE INTO group_permissions (group_id, permission_id) VALUES (?, ?)', [adminGroupId, viewAdmin.id]);
    await db.run('INSERT OR IGNORE INTO group_permissions (group_id, permission_id) VALUES (?, ?)', [adminGroupId, manageSettings.id]);
  }

  // Mod group - Items, Rezepte, User verwalten
  const modGroup = await db.run(`
    INSERT OR IGNORE INTO groups (name, display_name, description)
    VALUES ('mod', 'Moderator', 'Kann Items, Rezepte und User verwalten')
  `);
  let modGroupId = modGroup.lastID;
  if (!modGroupId) {
    const existing = await db.get('SELECT id FROM groups WHERE name = ?', ['mod']);
    modGroupId = existing.id;
  }
  
  if (modGroupId && manageItems && manageRecipes && manageUsers && viewAdmin) {
    await db.run('INSERT OR IGNORE INTO group_permissions (group_id, permission_id) VALUES (?, ?)', [modGroupId, manageItems.id]);
    await db.run('INSERT OR IGNORE INTO group_permissions (group_id, permission_id) VALUES (?, ?)', [modGroupId, manageRecipes.id]);
    await db.run('INSERT OR IGNORE INTO group_permissions (group_id, permission_id) VALUES (?, ?)', [modGroupId, manageUsers.id]);
    await db.run('INSERT OR IGNORE INTO group_permissions (group_id, permission_id) VALUES (?, ?)', [modGroupId, viewAdmin.id]);
  }

  // VIP group - nur Admin-Panel ansehen (später mehr)
  const vipGroup = await db.run(`
    INSERT OR IGNORE INTO groups (name, display_name, description)
    VALUES ('vip', 'VIP', 'Premium-Benutzer mit besonderen Vorteilen')
  `);
  let vipGroupId = vipGroup.lastID;
  if (!vipGroupId) {
    const existing = await db.get('SELECT id FROM groups WHERE name = ?', ['vip']);
    vipGroupId = existing.id;
  }
  
  if (vipGroupId && viewAdmin) {
    await db.run('INSERT OR IGNORE INTO group_permissions (group_id, permission_id) VALUES (?, ?)', [vipGroupId, viewAdmin.id]);
  }

  // User group - keine speziellen Berechtigungen
  const userGroup = await db.run(`
    INSERT OR IGNORE INTO groups (name, display_name, description)
    VALUES ('user', 'Benutzer', 'Standard-Benutzer ohne spezielle Berechtigungen')
  `);
}

async function insertDefaultEquipment() {
  // Quality multipliers:
  // poor: 0.7, normal: 1.0, good: 1.2, excellent: 1.5, masterwork: 1.8, legendary: 2.5

  const equipment = [
    // === WEAPONS (Waffen) ===
    // Anfänger-Waffen
    { name: 'wooden_sword', display_name: 'Holzschwert', slot: 'weapon', base_attack: 3, base_defense: 0, base_health: 0, required_level: 1, rarity: 'common', description: 'Ein einfaches Schwert aus Holz. Gut für Anfänger.' },
    { name: 'wooden_club', display_name: 'Holzkeule', slot: 'weapon', base_attack: 4, base_defense: 0, base_health: 0, required_level: 1, rarity: 'common', description: 'Eine grobe Keule aus einem Ast.' },
    { name: 'stone_dagger', display_name: 'Steindolch', slot: 'weapon', base_attack: 5, base_defense: 0, base_health: 0, required_level: 2, rarity: 'common', description: 'Ein primitiver Dolch aus geschliffenem Stein.' },
    
    // Normale Waffen
    { name: 'iron_sword', display_name: 'Eisenschwert', slot: 'weapon', base_attack: 8, base_defense: 1, base_health: 0, required_level: 5, rarity: 'uncommon', description: 'Ein solides Schwert aus Eisen.' },
    { name: 'iron_axe', display_name: 'Eisenaxt', slot: 'weapon', base_attack: 10, base_defense: 0, base_health: 0, required_level: 5, rarity: 'uncommon', description: 'Eine schwere Axt aus Eisen.' },
    { name: 'iron_mace', display_name: 'Eisenstreitkolben', slot: 'weapon', base_attack: 9, base_defense: 2, base_health: 0, required_level: 6, rarity: 'uncommon', description: 'Ein Streitkolben der sowohl Angriff als auch Verteidigung bietet.' },
    
    // Fortgeschrittene Waffen
    { name: 'steel_sword', display_name: 'Stahlschwert', slot: 'weapon', base_attack: 15, base_defense: 2, base_health: 0, required_level: 10, rarity: 'rare', description: 'Ein meisterhaft geschmiedetes Stahlschwert.' },
    { name: 'battle_axe', display_name: 'Streitaxt', slot: 'weapon', base_attack: 18, base_defense: 0, base_health: 0, required_level: 12, rarity: 'rare', description: 'Eine mächtige Zweihandaxt.' },
    { name: 'war_hammer', display_name: 'Kriegshammer', slot: 'weapon', base_attack: 20, base_defense: 3, base_health: 10, required_level: 15, rarity: 'epic', description: 'Ein gewaltiger Hammer der Feinde zermalmt.' },
    
    // === SHIELDS (Schilde) ===
    { name: 'wooden_shield', display_name: 'Holzschild', slot: 'shield', base_attack: 0, base_defense: 3, base_health: 5, required_level: 1, rarity: 'common', description: 'Ein einfacher Schild aus Holz.' },
    { name: 'iron_shield', display_name: 'Eisenschild', slot: 'shield', base_attack: 0, base_defense: 6, base_health: 10, required_level: 5, rarity: 'uncommon', description: 'Ein robuster Schild aus Eisen.' },
    { name: 'steel_shield', display_name: 'Stahlschild', slot: 'shield', base_attack: 0, base_defense: 10, base_health: 20, required_level: 10, rarity: 'rare', description: 'Ein verstärkter Schild aus gehärtetem Stahl.' },
    { name: 'tower_shield', display_name: 'Turmschild', slot: 'shield', base_attack: 0, base_defense: 15, base_health: 35, required_level: 15, rarity: 'epic', description: 'Ein massiver Schild der fast den ganzen Körper bedeckt.' },
    
    // === HEAD (Helme) ===
    { name: 'leather_cap', display_name: 'Lederkappe', slot: 'head', base_attack: 0, base_defense: 1, base_health: 5, required_level: 1, rarity: 'common', description: 'Eine einfache Kappe aus Leder.' },
    { name: 'iron_helmet', display_name: 'Eisenhelm', slot: 'head', base_attack: 0, base_defense: 3, base_health: 10, required_level: 5, rarity: 'uncommon', description: 'Ein solider Helm aus Eisen.' },
    { name: 'steel_helmet', display_name: 'Stahlhelm', slot: 'head', base_attack: 0, base_defense: 5, base_health: 15, required_level: 10, rarity: 'rare', description: 'Ein geschmiedeter Helm aus Stahl.' },
    { name: 'knights_helmet', display_name: 'Ritterhelm', slot: 'head', base_attack: 1, base_defense: 8, base_health: 25, required_level: 15, rarity: 'epic', description: 'Der Helm eines wahren Ritters.' },
    
    // === CHEST (Brustpanzer) ===
    { name: 'cloth_shirt', display_name: 'Stoffhemd', slot: 'chest', base_attack: 0, base_defense: 1, base_health: 5, required_level: 1, rarity: 'common', description: 'Ein einfaches Hemd aus Stoff.' },
    { name: 'leather_armor', display_name: 'Lederrüstung', slot: 'chest', base_attack: 0, base_defense: 3, base_health: 10, required_level: 3, rarity: 'common', description: 'Eine leichte Rüstung aus Leder.' },
    { name: 'chainmail', display_name: 'Kettenhemd', slot: 'chest', base_attack: 0, base_defense: 6, base_health: 20, required_level: 8, rarity: 'uncommon', description: 'Ein Hemd aus ineinander verflochtenen Metallringen.' },
    { name: 'iron_chestplate', display_name: 'Eisenbrustpanzer', slot: 'chest', base_attack: 0, base_defense: 10, base_health: 30, required_level: 12, rarity: 'rare', description: 'Ein massiver Brustpanzer aus Eisen.' },
    { name: 'steel_plate_armor', display_name: 'Stahlplattenrüstung', slot: 'chest', base_attack: 2, base_defense: 15, base_health: 50, required_level: 18, rarity: 'epic', description: 'Eine vollständige Plattenrüstung aus gehärtetem Stahl.' },
    
    // === LEGS (Beinschutz) ===
    { name: 'cloth_pants', display_name: 'Stoffhose', slot: 'legs', base_attack: 0, base_defense: 1, base_health: 3, required_level: 1, rarity: 'common', description: 'Eine einfache Hose aus Stoff.' },
    { name: 'leather_pants', display_name: 'Lederhose', slot: 'legs', base_attack: 0, base_defense: 2, base_health: 8, required_level: 3, rarity: 'common', description: 'Eine robuste Hose aus Leder.' },
    { name: 'chainmail_leggings', display_name: 'Kettenbeinlinge', slot: 'legs', base_attack: 0, base_defense: 4, base_health: 15, required_level: 8, rarity: 'uncommon', description: 'Beinschutz aus Kettengeflecht.' },
    { name: 'iron_greaves', display_name: 'Eisenbeinschienen', slot: 'legs', base_attack: 0, base_defense: 7, base_health: 20, required_level: 12, rarity: 'rare', description: 'Schwere Beinschienen aus Eisen.' },
    
    // === FEET (Schuhe) ===
    { name: 'cloth_shoes', display_name: 'Stoffschuhe', slot: 'feet', base_attack: 0, base_defense: 0, base_health: 2, required_level: 1, rarity: 'common', description: 'Einfache Schuhe aus Stoff.' },
    { name: 'leather_boots', display_name: 'Lederstiefel', slot: 'feet', base_attack: 0, base_defense: 1, base_health: 5, required_level: 3, rarity: 'common', description: 'Robuste Stiefel aus Leder.' },
    { name: 'iron_boots', display_name: 'Eisenstiefel', slot: 'feet', base_attack: 0, base_defense: 3, base_health: 10, required_level: 8, rarity: 'uncommon', description: 'Schwere Stiefel aus Eisen.' },
    { name: 'steel_sabatons', display_name: 'Stahlsabatons', slot: 'feet', base_attack: 1, base_defense: 5, base_health: 15, required_level: 12, rarity: 'rare', description: 'Gepanzerte Stiefel aus Stahl.' },
    
    // === HANDS (Handschuhe) ===
    { name: 'cloth_gloves', display_name: 'Stoffhandschuhe', slot: 'hands', base_attack: 0, base_defense: 0, base_health: 2, required_level: 1, rarity: 'common', description: 'Einfache Handschuhe aus Stoff.' },
    { name: 'leather_gloves', display_name: 'Lederhandschuhe', slot: 'hands', base_attack: 1, base_defense: 1, base_health: 3, required_level: 3, rarity: 'common', description: 'Handschuhe aus robustem Leder.' },
    { name: 'iron_gauntlets', display_name: 'Eisenpanzerhandschuhe', slot: 'hands', base_attack: 2, base_defense: 3, base_health: 8, required_level: 8, rarity: 'uncommon', description: 'Gepanzerte Handschuhe aus Eisen.' },
    { name: 'steel_gauntlets', display_name: 'Stahlpanzerhandschuhe', slot: 'hands', base_attack: 3, base_defense: 5, base_health: 12, required_level: 12, rarity: 'rare', description: 'Meisterlich gefertigte Panzerhandschuhe.' },
    
    // === ACCESSORIES (Accessoires) ===
    { name: 'wooden_amulet', display_name: 'Holzamulett', slot: 'accessory', base_attack: 1, base_defense: 1, base_health: 5, required_level: 1, rarity: 'common', description: 'Ein einfaches Amulett aus geschnitztem Holz.' },
    { name: 'copper_ring', display_name: 'Kupferring', slot: 'accessory', base_attack: 2, base_defense: 0, base_health: 0, required_level: 3, rarity: 'common', description: 'Ein schlichter Ring aus Kupfer.' },
    { name: 'silver_ring', display_name: 'Silberring', slot: 'accessory', base_attack: 3, base_defense: 2, base_health: 10, required_level: 8, rarity: 'uncommon', description: 'Ein eleganter Ring aus Silber.' },
    { name: 'gold_amulet', display_name: 'Goldamulett', slot: 'accessory', base_attack: 5, base_defense: 5, base_health: 20, required_level: 15, rarity: 'rare', description: 'Ein wertvolles Amulett aus purem Gold.' },
  ];

  for (const eq of equipment) {
    await db.run(`
      INSERT OR IGNORE INTO equipment_types (name, display_name, description, slot, base_attack, base_defense, base_health, required_level, rarity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [eq.name, eq.display_name, eq.description, eq.slot, eq.base_attack, eq.base_defense, eq.base_health, eq.required_level, eq.rarity]);
  }

  // Create crafting recipes for equipment
  const recipes = [
    // Anfänger (Blacksmith Level 1)
    { equipment: 'wooden_sword', profession: 'blacksmith', level: 1, exp: 5, materials: [{ item: 'holz', qty: 5 }, { item: 'ast', qty: 3 }] },
    { equipment: 'wooden_club', profession: 'blacksmith', level: 1, exp: 5, materials: [{ item: 'holz', qty: 3 }, { item: 'ast', qty: 5 }] },
    { equipment: 'wooden_shield', profession: 'blacksmith', level: 1, exp: 8, materials: [{ item: 'holz', qty: 8 }, { item: 'ast', qty: 2 }] },
    { equipment: 'stone_dagger', profession: 'blacksmith', level: 2, exp: 10, materials: [{ item: 'stein', qty: 5 }, { item: 'holz', qty: 2 }] },
    
    // Eisen-Ausrüstung (Blacksmith Level 3-5)
    { equipment: 'iron_sword', profession: 'blacksmith', level: 3, exp: 25, materials: [{ item: 'eisenbarren', qty: 3 }, { item: 'holz', qty: 2 }] },
    { equipment: 'iron_axe', profession: 'blacksmith', level: 3, exp: 30, materials: [{ item: 'eisenbarren', qty: 4 }, { item: 'holz', qty: 3 }] },
    { equipment: 'iron_mace', profession: 'blacksmith', level: 4, exp: 35, materials: [{ item: 'eisenbarren', qty: 5 }, { item: 'holz', qty: 2 }] },
    { equipment: 'iron_shield', profession: 'blacksmith', level: 4, exp: 40, materials: [{ item: 'eisenbarren', qty: 6 }, { item: 'holz', qty: 4 }] },
    { equipment: 'iron_helmet', profession: 'blacksmith', level: 3, exp: 30, materials: [{ item: 'eisenbarren', qty: 4 }] },
    { equipment: 'iron_boots', profession: 'blacksmith', level: 3, exp: 25, materials: [{ item: 'eisenbarren', qty: 3 }] },
    { equipment: 'iron_gauntlets', profession: 'blacksmith', level: 4, exp: 30, materials: [{ item: 'eisenbarren', qty: 3 }] },
    { equipment: 'iron_greaves', profession: 'blacksmith', level: 5, exp: 40, materials: [{ item: 'eisenbarren', qty: 5 }] },
    
    // Stahl-Ausrüstung (Blacksmith Level 6-10)
    { equipment: 'steel_sword', profession: 'blacksmith', level: 6, exp: 50, materials: [{ item: 'eisenbarren', qty: 8 }, { item: 'kohle', qty: 5 }] },
    { equipment: 'steel_shield', profession: 'blacksmith', level: 7, exp: 60, materials: [{ item: 'eisenbarren', qty: 10 }, { item: 'kohle', qty: 6 }] },
    { equipment: 'steel_helmet', profession: 'blacksmith', level: 6, exp: 55, materials: [{ item: 'eisenbarren', qty: 7 }, { item: 'kohle', qty: 4 }] },
    { equipment: 'steel_sabatons', profession: 'blacksmith', level: 7, exp: 50, materials: [{ item: 'eisenbarren', qty: 6 }, { item: 'kohle', qty: 3 }] },
    { equipment: 'steel_gauntlets', profession: 'blacksmith', level: 7, exp: 50, materials: [{ item: 'eisenbarren', qty: 5 }, { item: 'kohle', qty: 3 }] },
    
    // Leder-Ausrüstung (Leatherworker)
    { equipment: 'leather_cap', profession: 'leatherworker', level: 1, exp: 10, materials: [{ item: 'stoff', qty: 3 }] },
    { equipment: 'leather_armor', profession: 'leatherworker', level: 2, exp: 20, materials: [{ item: 'stoff', qty: 8 }] },
    { equipment: 'leather_pants', profession: 'leatherworker', level: 2, exp: 15, materials: [{ item: 'stoff', qty: 6 }] },
    { equipment: 'leather_boots', profession: 'leatherworker', level: 1, exp: 10, materials: [{ item: 'stoff', qty: 4 }] },
    { equipment: 'leather_gloves', profession: 'leatherworker', level: 1, exp: 8, materials: [{ item: 'stoff', qty: 3 }] },
    
    // Stoff-Ausrüstung (Tailor)
    { equipment: 'cloth_shirt', profession: 'tailor', level: 1, exp: 5, materials: [{ item: 'stoff', qty: 5 }] },
    { equipment: 'cloth_pants', profession: 'tailor', level: 1, exp: 5, materials: [{ item: 'stoff', qty: 4 }] },
    { equipment: 'cloth_shoes', profession: 'tailor', level: 1, exp: 3, materials: [{ item: 'stoff', qty: 2 }] },
    { equipment: 'cloth_gloves', profession: 'tailor', level: 1, exp: 3, materials: [{ item: 'stoff', qty: 2 }] },
  ];

  for (const recipe of recipes) {
    const equipment = await db.get('SELECT id FROM equipment_types WHERE name = ?', [recipe.equipment]);
    if (!equipment) continue;

    // Check if recipe already exists
    const existingRecipe = await db.get('SELECT id FROM equipment_recipes WHERE equipment_type_id = ?', [equipment.id]);
    if (existingRecipe) continue;

    // Craft time based on item rarity/level (in seconds)
    const craftTime = Math.max(30, recipe.level * 15 + (recipe.exp / 2));
    
    const recipeResult = await db.run(`
      INSERT INTO equipment_recipes (equipment_type_id, profession, required_profession_level, experience_reward, craft_time)
      VALUES (?, ?, ?, ?, ?)
    `, [equipment.id, recipe.profession, recipe.level, recipe.exp, craftTime]);

    // Add materials
    for (const mat of recipe.materials) {
      const item = await db.get('SELECT id FROM items WHERE name = ?', [mat.item]);
      if (item) {
        await db.run(`
          INSERT INTO equipment_recipe_materials (recipe_id, item_id, quantity)
          VALUES (?, ?, ?)
        `, [recipeResult.lastID, item.id, mat.qty]);
      }
    }
  }
}

async function insertDefaultMonsters() {
  const monsters = [
    // === ANFÄNGER-MONSTER (Level 1-3) - Sehr leicht ===
    { 
      name: 'slime', display_name: 'Schleim', description: 'Ein kleiner grüner Schleim. Perfekt für Anfänger!',
      is_boss: 0, min_level: 1, max_level: 2,
      base_health: 30, base_attack: 5, base_defense: 1,
      health_per_level: 8, attack_per_level: 2, defense_per_level: 1,
      spawn_weight: 200
    },
    { 
      name: 'rat', display_name: 'Ratte', description: 'Eine aggressive Riesenratte',
      is_boss: 0, min_level: 1, max_level: 2,
      base_health: 25, base_attack: 6, base_defense: 1,
      health_per_level: 6, attack_per_level: 2, defense_per_level: 0,
      spawn_weight: 180
    },
    { 
      name: 'bee', display_name: 'Riesenbiene', description: 'Eine übergroße, wütende Biene',
      is_boss: 0, min_level: 1, max_level: 3,
      base_health: 20, base_attack: 8, base_defense: 0,
      health_per_level: 5, attack_per_level: 2, defense_per_level: 0,
      spawn_weight: 160
    },
    { 
      name: 'bat', display_name: 'Fledermaus', description: 'Eine bissige Höhlenfledermaus',
      is_boss: 0, min_level: 1, max_level: 3,
      base_health: 22, base_attack: 7, base_defense: 1,
      health_per_level: 5, attack_per_level: 2, defense_per_level: 0,
      spawn_weight: 150
    },
    { 
      name: 'spider', display_name: 'Spinne', description: 'Eine giftige Waldspinne',
      is_boss: 0, min_level: 1, max_level: 4,
      base_health: 35, base_attack: 9, base_defense: 2,
      health_per_level: 8, attack_per_level: 2, defense_per_level: 1,
      spawn_weight: 140
    },
    { 
      name: 'snake', display_name: 'Schlange', description: 'Eine giftige Natter',
      is_boss: 0, min_level: 2, max_level: 4,
      base_health: 28, base_attack: 10, base_defense: 1,
      health_per_level: 6, attack_per_level: 3, defense_per_level: 0,
      spawn_weight: 130
    },
    { 
      name: 'mushroom', display_name: 'Giftpilz', description: 'Ein wandelnder giftiger Pilz',
      is_boss: 0, min_level: 2, max_level: 4,
      base_health: 40, base_attack: 7, base_defense: 3,
      health_per_level: 10, attack_per_level: 2, defense_per_level: 1,
      spawn_weight: 120
    },
    
    // === NORMALE MONSTER (Level 3-8) ===
    { 
      name: 'wolf', display_name: 'Wolf', description: 'Ein hungriger Wolf',
      is_boss: 0, min_level: 3, max_level: 6,
      base_health: 80, base_attack: 12, base_defense: 4,
      health_per_level: 15, attack_per_level: 3, defense_per_level: 1,
      spawn_weight: 100
    },
    { 
      name: 'goblin', display_name: 'Goblin', description: 'Ein hinterlistiger Goblin',
      is_boss: 0, min_level: 4, max_level: 8,
      base_health: 60, base_attack: 15, base_defense: 3,
      health_per_level: 12, attack_per_level: 4, defense_per_level: 1,
      spawn_weight: 80
    },
    { 
      name: 'boar', display_name: 'Wildschwein', description: 'Ein aggressives Wildschwein',
      is_boss: 0, min_level: 3, max_level: 7,
      base_health: 90, base_attack: 14, base_defense: 5,
      health_per_level: 18, attack_per_level: 3, defense_per_level: 2,
      spawn_weight: 90
    },
    { 
      name: 'bandit', display_name: 'Bandit', description: 'Ein Straßenräuber',
      is_boss: 0, min_level: 4, max_level: 9,
      base_health: 70, base_attack: 16, base_defense: 4,
      health_per_level: 14, attack_per_level: 4, defense_per_level: 1,
      spawn_weight: 70
    },
    
    // === MITTELSTARKE MONSTER (Level 5-12) ===
    { 
      name: 'skeleton', display_name: 'Skelett', description: 'Ein untotes Skelett',
      is_boss: 0, min_level: 5, max_level: 10,
      base_health: 70, base_attack: 18, base_defense: 6,
      health_per_level: 14, attack_per_level: 4, defense_per_level: 2,
      spawn_weight: 60
    },
    { 
      name: 'zombie', display_name: 'Zombie', description: 'Ein langsamer, aber zäher Untoter',
      is_boss: 0, min_level: 5, max_level: 11,
      base_health: 100, base_attack: 14, base_defense: 4,
      health_per_level: 20, attack_per_level: 3, defense_per_level: 2,
      spawn_weight: 55
    },
    { 
      name: 'orc', display_name: 'Ork', description: 'Ein brutaler Ork-Krieger',
      is_boss: 0, min_level: 6, max_level: 15,
      base_health: 120, base_attack: 22, base_defense: 8,
      health_per_level: 20, attack_per_level: 5, defense_per_level: 3,
      spawn_weight: 40
    },
    { 
      name: 'harpy', display_name: 'Harpyie', description: 'Eine fliegende Kreatur mit scharfen Klauen',
      is_boss: 0, min_level: 6, max_level: 12,
      base_health: 85, base_attack: 24, base_defense: 5,
      health_per_level: 15, attack_per_level: 5, defense_per_level: 2,
      spawn_weight: 45
    },
    
    // === STARKE MONSTER (Level 8-20) ===
    { 
      name: 'troll', display_name: 'Troll', description: 'Ein gewaltiger Höhlentroll',
      is_boss: 0, min_level: 8, max_level: 20,
      base_health: 200, base_attack: 30, base_defense: 15,
      health_per_level: 30, attack_per_level: 6, defense_per_level: 4,
      spawn_weight: 20
    },
    { 
      name: 'ogre', display_name: 'Oger', description: 'Ein massiver, dummer Riese',
      is_boss: 0, min_level: 10, max_level: 18,
      base_health: 250, base_attack: 35, base_defense: 12,
      health_per_level: 35, attack_per_level: 7, defense_per_level: 3,
      spawn_weight: 15
    },
    { 
      name: 'werewolf', display_name: 'Werwolf', description: 'Ein verfluchter Gestaltwandler',
      is_boss: 0, min_level: 10, max_level: 18,
      base_health: 180, base_attack: 40, base_defense: 10,
      health_per_level: 25, attack_per_level: 8, defense_per_level: 3,
      spawn_weight: 12
    },
    // Boss monsters
    { 
      name: 'dragon_hatchling', display_name: 'Drachenjunges', description: 'Ein junger, aber gefährlicher Drache',
      is_boss: 1, min_level: 10, max_level: 10,
      base_health: 500, base_attack: 50, base_defense: 25,
      health_per_level: 0, attack_per_level: 0, defense_per_level: 0,
      spawn_weight: 5
    },
    { 
      name: 'lich_king', display_name: 'Lichkönig', description: 'Ein mächtiger untoter Zauberer',
      is_boss: 1, min_level: 15, max_level: 15,
      base_health: 800, base_attack: 70, base_defense: 30,
      health_per_level: 0, attack_per_level: 0, defense_per_level: 0,
      spawn_weight: 2
    },
    { 
      name: 'ancient_dragon', display_name: 'Uralter Drache', description: 'Der mächtigste aller Drachen',
      is_boss: 1, min_level: 25, max_level: 25,
      base_health: 2000, base_attack: 150, base_defense: 80,
      health_per_level: 0, attack_per_level: 0, defense_per_level: 0,
      spawn_weight: 1
    },
  ];

  for (const monster of monsters) {
    try {
      const result = await db.run(`
        INSERT OR IGNORE INTO monster_types 
        (name, display_name, description, is_boss, min_level, max_level, 
         base_health, base_attack, base_defense, health_per_level, attack_per_level, defense_per_level, spawn_weight)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        monster.name, monster.display_name, monster.description, monster.is_boss,
        monster.min_level, monster.max_level, monster.base_health, monster.base_attack,
        monster.base_defense, monster.health_per_level, monster.attack_per_level,
        monster.defense_per_level, monster.spawn_weight
      ]);
      
      // Add loot for this monster
      if (result.changes > 0) {
        const monsterId = result.lastID;
        
        // Get items for loot
        const holz = await db.get('SELECT id FROM items WHERE name = ?', ['holz']);
        const stein = await db.get('SELECT id FROM items WHERE name = ?', ['stein']);
        const lehm = await db.get('SELECT id FROM items WHERE name = ?', ['lehm']);
        const ast = await db.get('SELECT id FROM items WHERE name = ?', ['ast']);
        const eisenbarren = await db.get('SELECT id FROM items WHERE name = ?', ['eisenbarren']);
        
        // Loot based on monster type
        const lootConfig = {
          // Anfänger-Monster: wenig Gold, einfache Drops
          'slime': { itemId: lehm?.id, min: 1, max: 2, chance: 0.9, goldMin: 1, goldMax: 5 },
          'rat': { itemId: ast?.id, min: 1, max: 2, chance: 0.8, goldMin: 1, goldMax: 4 },
          'bee': { itemId: holz?.id, min: 1, max: 1, chance: 0.7, goldMin: 2, goldMax: 5 },
          'bat': { itemId: ast?.id, min: 1, max: 2, chance: 0.75, goldMin: 2, goldMax: 6 },
          'spider': { itemId: ast?.id, min: 1, max: 3, chance: 0.8, goldMin: 3, goldMax: 8 },
          'snake': { itemId: lehm?.id, min: 1, max: 2, chance: 0.7, goldMin: 3, goldMax: 7 },
          'mushroom': { itemId: holz?.id, min: 1, max: 2, chance: 0.85, goldMin: 2, goldMax: 6 },
          
          // Normale Monster: mehr Gold, bessere Drops
          'wolf': { itemId: holz?.id, min: 1, max: 3, chance: 0.8, goldMin: 5, goldMax: 15 },
          'goblin': { itemId: stein?.id, min: 2, max: 5, chance: 0.7, goldMin: 10, goldMax: 30 },
          'boar': { itemId: holz?.id, min: 2, max: 4, chance: 0.75, goldMin: 8, goldMax: 20 },
          'bandit': { itemId: stein?.id, min: 1, max: 3, chance: 0.6, goldMin: 15, goldMax: 40 },
          
          // Mittelstarke Monster
          'skeleton': { itemId: stein?.id, min: 2, max: 4, chance: 0.65, goldMin: 15, goldMax: 35 },
          'zombie': { itemId: lehm?.id, min: 2, max: 5, chance: 0.7, goldMin: 12, goldMax: 30 },
          'orc': { itemId: eisenbarren?.id, min: 1, max: 2, chance: 0.5, goldMin: 20, goldMax: 50 },
          'harpy': { itemId: stein?.id, min: 2, max: 4, chance: 0.6, goldMin: 25, goldMax: 55 },
          
          // Starke Monster
          'troll': { itemId: eisenbarren?.id, min: 2, max: 4, chance: 0.6, goldMin: 40, goldMax: 80 },
          'ogre': { itemId: eisenbarren?.id, min: 3, max: 5, chance: 0.55, goldMin: 50, goldMax: 100 },
          'werewolf': { itemId: eisenbarren?.id, min: 2, max: 4, chance: 0.65, goldMin: 45, goldMax: 90 },
        };
        
        const loot = lootConfig[monster.name];
        if (loot && loot.itemId) {
          await db.run(`INSERT OR IGNORE INTO monster_loot (monster_type_id, item_id, min_quantity, max_quantity, drop_chance, gold_min, gold_max) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`, [monsterId, loot.itemId, loot.min, loot.max, loot.chance, loot.goldMin, loot.goldMax]);
        }
        
        // Bosses drop more gold and guaranteed items
        if (monster.is_boss && eisenbarren) {
          await db.run(`INSERT OR IGNORE INTO monster_loot (monster_type_id, item_id, min_quantity, max_quantity, drop_chance, gold_min, gold_max) 
            VALUES (?, ?, 5, 15, 1.0, 100, 500)`, [monsterId, eisenbarren.id]);
        }
      }
    } catch (err) {
      // Monster already exists
    }
  }
}

async function insertDefaultNPCs() {
  const npcs = [
    { 
      name: 'blacksmith', display_name: 'Schmied Thorin', 
      description: 'Ein erfahrener Schmied, der Werkzeuge und Waffen verkauft',
      npc_type: 'merchant'
    },
    { 
      name: 'herbalist', display_name: 'Kräuterfrau Elara', 
      description: 'Handelt mit seltenen Kräutern und Materialien',
      npc_type: 'merchant'
    },
    { 
      name: 'general_merchant', display_name: 'Händler Markus', 
      description: 'Ein Allgemeinhändler mit verschiedenen Waren',
      npc_type: 'merchant'
    },
  ];

  for (const npc of npcs) {
    try {
      const result = await db.run(`
        INSERT OR IGNORE INTO npc_types (name, display_name, description, npc_type)
        VALUES (?, ?, ?, ?)
      `, [npc.name, npc.display_name, npc.description, npc.npc_type]);
      
      // Add shop items
      if (result.changes > 0) {
        const npcId = result.lastID;
        
        const holz = await db.get('SELECT id FROM items WHERE name = ?', ['holz']);
        const stein = await db.get('SELECT id FROM items WHERE name = ?', ['stein']);
        const eisenbarren = await db.get('SELECT id FROM items WHERE name = ?', ['eisenbarren']);
        const spitzhacke_basic = await db.get('SELECT id FROM items WHERE name = ?', ['spitzhacke_basic']);
        const spitzhacke_iron = await db.get('SELECT id FROM items WHERE name = ?', ['spitzhacke_iron']);
        
        if (npc.name === 'blacksmith') {
          // Sells tools, buys resources
          if (spitzhacke_basic) {
            await db.run(`INSERT OR IGNORE INTO npc_shop_items (npc_type_id, item_id, buy_price, sell_price, stock) 
              VALUES (?, ?, 50, 15, -1)`, [npcId, spitzhacke_basic.id]);
          }
          if (spitzhacke_iron) {
            await db.run(`INSERT OR IGNORE INTO npc_shop_items (npc_type_id, item_id, buy_price, sell_price, stock) 
              VALUES (?, ?, 150, 45, -1)`, [npcId, spitzhacke_iron.id]);
          }
          if (eisenbarren) {
            await db.run(`INSERT OR IGNORE INTO npc_shop_items (npc_type_id, item_id, buy_price, sell_price, stock) 
              VALUES (?, ?, 30, 10, -1)`, [npcId, eisenbarren.id]);
          }
        } else if (npc.name === 'general_merchant') {
          // Buys/sells basic resources
          if (holz) {
            await db.run(`INSERT OR IGNORE INTO npc_shop_items (npc_type_id, item_id, buy_price, sell_price, stock) 
              VALUES (?, ?, 5, 2, -1)`, [npcId, holz.id]);
          }
          if (stein) {
            await db.run(`INSERT OR IGNORE INTO npc_shop_items (npc_type_id, item_id, buy_price, sell_price, stock) 
              VALUES (?, ?, 8, 3, -1)`, [npcId, stein.id]);
          }
        }
      }
    } catch (err) {
      // NPC already exists
    }
  }
}

async function spawnWorldNPCs() {
  // Check if we already have world NPCs
  const existingNPCs = await db.get('SELECT COUNT(*) as count FROM world_npcs');
  if (existingNPCs.count > 0) return;
  
  // Get all existing player coordinates to avoid spawning too close
  const existingCoords = await db.all('SELECT world_x, world_y FROM users WHERE world_x != 0 OR world_y != 0');
  
  // Spawn merchants (3-5)
  const merchants = await db.all('SELECT id FROM npc_types');
  for (const merchant of merchants) {
    const coords = generateUniqueCoordinates(existingCoords, 100);
    await db.run(`
      INSERT INTO world_npcs (npc_type_id, world_x, world_y, is_active)
      VALUES (?, ?, ?, 1)
    `, [merchant.id, coords.x, coords.y]);
    existingCoords.push({ world_x: coords.x, world_y: coords.y });
  }
  
  // Spawn normal monsters - MANY more now! (50-60 monsters)
  const normalMonsters = await db.all('SELECT * FROM monster_types WHERE is_boss = 0');
  const monsterCount = 50; // Much more monsters
  
  for (let i = 0; i < monsterCount; i++) {
    // Pick a random monster type weighted by spawn_weight
    const totalWeight = normalMonsters.reduce((sum, m) => sum + m.spawn_weight, 0);
    let randomWeight = Math.random() * totalWeight;
    let selectedMonster = normalMonsters[0];
    
    for (const monster of normalMonsters) {
      randomWeight -= monster.spawn_weight;
      if (randomWeight <= 0) {
        selectedMonster = monster;
        break;
      }
    }
    
    // Random level within monster's range
    const level = Math.floor(Math.random() * (selectedMonster.max_level - selectedMonster.min_level + 1)) + selectedMonster.min_level;
    const health = selectedMonster.base_health + (level - 1) * selectedMonster.health_per_level;
    
    // Spread monsters further apart
    const coords = generateUniqueCoordinates(existingCoords, 50);
    
    // Use monster type's respawn_cooldown or default based on level
    const respawnMinutes = selectedMonster.respawn_cooldown || (level <= 3 ? 5 : level <= 6 ? 10 : level <= 10 ? 15 : 20);
    
    await db.run(`
      INSERT INTO world_npcs (monster_type_id, world_x, world_y, level, current_health, respawn_minutes, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `, [selectedMonster.id, coords.x, coords.y, level, health, respawnMinutes]);
    existingCoords.push({ world_x: coords.x, world_y: coords.y });
  }
  
  // Spawn bosses (3-4)
  const bossMonsters = await db.all('SELECT * FROM monster_types WHERE is_boss = 1');
  for (let i = 0; i < Math.min(4, bossMonsters.length); i++) {
    const boss = bossMonsters[i % bossMonsters.length];
    const coords = generateUniqueCoordinates(existingCoords, 200); // Bosses need more space
    
    await db.run(`
      INSERT INTO world_npcs (monster_type_id, world_x, world_y, level, current_health, respawn_minutes, is_active)
      VALUES (?, ?, ?, ?, ?, 60, 1)
    `, [boss.id, coords.x, coords.y, boss.min_level, boss.base_health]);
    existingCoords.push({ world_x: coords.x, world_y: coords.y });
  }
  
  console.log('[DB] World NPCs spawned successfully - ' + monsterCount + ' monsters + ' + Math.min(4, bossMonsters.length) + ' bosses');
}

async function insertDefaultBuildings() {
  const defaultBuildings = [
    { 
      name: 'hutte', 
      display_name: 'Hütte', 
      description: 'Deine erste bescheidene Hütte',
      position_x: 50,
      position_y: 50,
      size_width: 150,
      size_height: 150,
      unlock_order: 0,
      max_level: 3,
      build_duration_minutes: 0,
      upgrade_duration_minutes: 2
    },
    { 
      name: 'schmiede', 
      display_name: 'Schmiede', 
      description: 'Hier kannst du Metalle verarbeiten',
      position_x: 250,
      position_y: 50,
      size_width: 120,
      size_height: 120,
      unlock_order: 1,
      max_level: 5
    },
    { 
      name: 'saegewerk', 
      display_name: 'Sägewerk', 
      description: 'Verarbeite Holz zu Brettern',
      position_x: 50,
      position_y: 250,
      size_width: 120,
      size_height: 120,
      unlock_order: 2,
      max_level: 5
    },
    { 
      name: 'brunnen', 
      display_name: 'Brunnen', 
      description: 'Versorgt dich mit Wasser',
      position_x: 250,
      position_y: 250,
      size_width: 100,
      size_height: 100,
      unlock_order: 3,
      max_level: 5
    },
    { 
      name: 'lager', 
      display_name: 'Lager', 
      description: 'Erweitert dein Inventar',
      position_x: 150,
      position_y: 150,
      size_width: 100,
      size_height: 100,
      unlock_order: 4,
      max_level: 5
    },
    { 
      name: 'werkbank', 
      display_name: 'Werkbank', 
      description: 'Hier kannst du Items craften und die Werkbank upgraden',
      position_x: 400,
      position_y: 50,
      size_width: 120,
      size_height: 120,
      unlock_order: 0,
      max_level: 10,
      build_duration_minutes: 0,
      upgrade_duration_minutes: 0
    },
  ];

  for (const building of defaultBuildings) {
    try {
      const result = await db.run(`
        INSERT OR IGNORE INTO buildings (name, display_name, description, position_x, position_y, size_width, size_height, unlock_order, max_level, build_duration_minutes, upgrade_duration_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        building.name, 
        building.display_name, 
        building.description, 
        building.position_x, 
        building.position_y, 
        building.size_width, 
        building.size_height, 
        building.unlock_order, 
        building.max_level || 3,
        building.build_duration_minutes || 5,
        building.upgrade_duration_minutes || 3
      ]);
      
      // Set default requirements for each building
      if (result.changes > 0) {
        const buildingId = result.lastID;
        const holz = await db.get('SELECT id FROM items WHERE name = ?', ['holz']);
        const stein = await db.get('SELECT id FROM items WHERE name = ?', ['stein']);
        const lehm = await db.get('SELECT id FROM items WHERE name = ?', ['lehm']);
        
        // Hütte: kostenlos (Startgebäude)
        if (building.name === 'hutte') {
          // Keine Anforderungen
        }
        // Schmiede: 20 Holz + 15 Stein
        else if (building.name === 'schmiede' && holz && stein) {
          await db.run('INSERT INTO building_requirements (building_id, item_id, quantity) VALUES (?, ?, ?)', 
            [buildingId, holz.id, 20]);
          await db.run('INSERT INTO building_requirements (building_id, item_id, quantity) VALUES (?, ?, ?)', 
            [buildingId, stein.id, 15]);
        }
        // Sägewerk: 30 Holz + 10 Stein
        else if (building.name === 'saegewerk' && holz && stein) {
          await db.run('INSERT INTO building_requirements (building_id, item_id, quantity) VALUES (?, ?, ?)', 
            [buildingId, holz.id, 30]);
          await db.run('INSERT INTO building_requirements (building_id, item_id, quantity) VALUES (?, ?, ?)', 
            [buildingId, stein.id, 10]);
        }
        // Brunnen: 15 Stein + 10 Lehm
        else if (building.name === 'brunnen' && stein && lehm) {
          await db.run('INSERT INTO building_requirements (building_id, item_id, quantity) VALUES (?, ?, ?)', 
            [buildingId, stein.id, 15]);
          await db.run('INSERT INTO building_requirements (building_id, item_id, quantity) VALUES (?, ?, ?)', 
            [buildingId, lehm.id, 10]);
        }
        // Lager: 25 Holz + 15 Stein
        else if (building.name === 'lager' && holz && stein) {
          await db.run('INSERT INTO building_requirements (building_id, item_id, quantity) VALUES (?, ?, ?)', 
            [buildingId, holz.id, 25]);
          await db.run('INSERT INTO building_requirements (building_id, item_id, quantity) VALUES (?, ?, ?)', 
            [buildingId, stein.id, 15]);
        }
        // Werkbank: kostenlos (Startgebäude)
        else if (building.name === 'werkbank') {
          // Keine Anforderungen - Startgebäude
        }
      }
    } catch (err) {
      console.error(`Error inserting building ${building.name}:`, err);
    }
  }
  
  // Give every user the starting hut and workbench
  const users = await db.all('SELECT id FROM users');
  const hut = await db.get('SELECT id FROM buildings WHERE name = ?', ['hutte']);
  const werkbank = await db.get('SELECT id FROM buildings WHERE name = ?', ['werkbank']);
  
  if (hut) {
    for (const user of users) {
      try {
        await db.run(`
          INSERT OR IGNORE INTO user_buildings (user_id, building_id, level)
          VALUES (?, ?, 1)
        `, [user.id, hut.id]);
      } catch (err) {
        // Already has hut
      }
    }
  }
  
  if (werkbank) {
    for (const user of users) {
      try {
        await db.run(`
          INSERT OR IGNORE INTO user_buildings (user_id, building_id, level)
          VALUES (?, ?, 1)
        `, [user.id, werkbank.id]);
      } catch (err) {
        // Already has werkbank
      }
    }
  }
}

// Insert default quests
async function insertDefaultQuests() {
  // Check if daily login quest already exists
  const existingQuest = await db.get("SELECT id FROM quests WHERE name = 'daily_login'");
  if (existingQuest) return;

  try {
    // Create daily login quest
    const result = await db.run(`
      INSERT INTO quests (
        name, display_name, description, category,
        is_repeatable, cooldown_hours, min_level,
        reward_gold, reward_experience, sort_order, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'daily_login',
      'Täglicher Login',
      'Logge dich heute ein und erhalte deine tägliche Belohnung!',
      'daily',
      1,  // is_repeatable
      24, // cooldown_hours (24 hours)
      1,  // min_level
      10, // reward_gold
      20, // reward_experience
      0,  // sort_order (first)
      1   // is_active
    ]);

    // Add the login objective
    await db.run(`
      INSERT INTO quest_objectives (quest_id, objective_type, required_amount, description, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `, [result.lastID, 'daily_login', 1, 'Einmal einloggen', 0]);

    console.log('[DB] Default daily login quest created');
  } catch (error) {
    console.error('Error creating default quest:', error);
  }

  // Create achievement quests (auto-active achievements)
  await insertAchievementQuests();
}

// Insert achievement quests that are auto-active
async function insertAchievementQuests() {
  // Get monster types for specific kill achievements
  const wolf = await db.get("SELECT id FROM monster_types WHERE name = 'wolf'");
  const goblin = await db.get("SELECT id FROM monster_types WHERE name = 'goblin'");
  const skeleton = await db.get("SELECT id FROM monster_types WHERE name = 'skeleton'");
  const orc = await db.get("SELECT id FROM monster_types WHERE name = 'orc'");
  const troll = await db.get("SELECT id FROM monster_types WHERE name = 'troll'");
  const dragonHatchling = await db.get("SELECT id FROM monster_types WHERE name = 'dragon_hatchling'");
  const lichKing = await db.get("SELECT id FROM monster_types WHERE name = 'lich_king'");
  const ancientDragon = await db.get("SELECT id FROM monster_types WHERE name = 'ancient_dragon'");

  const achievements = [
    // ===== Monster Kill Achievements (general) =====
    {
      name: 'achievement_first_blood',
      display_name: 'Erstes Blut',
      description: 'Besiege dein erstes Monster!',
      category: 'achievement',
      min_level: 1,
      reward_gold: 25,
      reward_experience: 50,
      sort_order: 100,
      objectives: [
        { type: 'kill_monster', amount: 1, description: 'Besiege 1 Monster' }
      ]
    },
    {
      name: 'achievement_monster_slayer_10',
      display_name: 'Monsterjäger',
      description: 'Besiege 10 Monster in der Wildnis.',
      category: 'achievement',
      min_level: 1,
      reward_gold: 50,
      reward_experience: 100,
      sort_order: 101,
      objectives: [
        { type: 'kill_monster', amount: 10, description: 'Besiege 10 Monster' }
      ]
    },
    {
      name: 'achievement_monster_slayer_50',
      display_name: 'Erfahrener Jäger',
      description: 'Besiege 50 Monster.',
      category: 'achievement',
      min_level: 1,
      reward_gold: 150,
      reward_experience: 300,
      sort_order: 102,
      objectives: [
        { type: 'kill_monster', amount: 50, description: 'Besiege 50 Monster' }
      ]
    },
    {
      name: 'achievement_monster_slayer_100',
      display_name: 'Legendärer Jäger',
      description: 'Besiege 100 Monster - eine beeindruckende Leistung!',
      category: 'achievement',
      min_level: 1,
      reward_gold: 300,
      reward_experience: 500,
      sort_order: 103,
      objectives: [
        { type: 'kill_monster', amount: 100, description: 'Besiege 100 Monster' }
      ]
    },
    {
      name: 'achievement_monster_slayer_500',
      display_name: 'Monster-Vernichter',
      description: 'Besiege 500 Monster!',
      category: 'achievement',
      min_level: 1,
      reward_gold: 1000,
      reward_experience: 1500,
      sort_order: 104,
      objectives: [
        { type: 'kill_monster', amount: 500, description: 'Besiege 500 Monster' }
      ]
    },

    // ===== Wolf Achievements =====
    {
      name: 'achievement_wolf_hunter_5',
      display_name: 'Wolfsjäger',
      description: 'Die Wölfe fürchten dich!',
      category: 'achievement',
      min_level: 1,
      reward_gold: 30,
      reward_experience: 60,
      sort_order: 110,
      objectives: [
        { type: 'kill_specific_monster', target_id: wolf?.id, amount: 5, description: 'Besiege 5 Wölfe' }
      ]
    },
    {
      name: 'achievement_wolf_hunter_25',
      display_name: 'Wolfsschreck',
      description: 'Die Wölfe erzählen Geschichten über dich.',
      category: 'achievement',
      min_level: 1,
      reward_gold: 100,
      reward_experience: 200,
      sort_order: 111,
      objectives: [
        { type: 'kill_specific_monster', target_id: wolf?.id, amount: 25, description: 'Besiege 25 Wölfe' }
      ]
    },

    // ===== Goblin Achievements =====
    {
      name: 'achievement_goblin_slayer_5',
      display_name: 'Goblin-Bekämpfer',
      description: 'Die Goblins wissen, wer du bist.',
      category: 'achievement',
      min_level: 1,
      reward_gold: 40,
      reward_experience: 80,
      sort_order: 120,
      objectives: [
        { type: 'kill_specific_monster', target_id: goblin?.id, amount: 5, description: 'Besiege 5 Goblins' }
      ]
    },
    {
      name: 'achievement_goblin_slayer_25',
      display_name: 'Goblin-Jäger',
      description: 'Goblins fliehen bei deinem Anblick!',
      category: 'achievement',
      min_level: 1,
      reward_gold: 120,
      reward_experience: 250,
      sort_order: 121,
      objectives: [
        { type: 'kill_specific_monster', target_id: goblin?.id, amount: 25, description: 'Besiege 25 Goblins' }
      ]
    },

    // ===== Skeleton Achievements =====
    {
      name: 'achievement_skeleton_crusher_10',
      display_name: 'Knochenbrecher',
      description: 'Du weißt, wie man Skelette zerlegt.',
      category: 'achievement',
      min_level: 3,
      reward_gold: 60,
      reward_experience: 120,
      sort_order: 130,
      objectives: [
        { type: 'kill_specific_monster', target_id: skeleton?.id, amount: 10, description: 'Besiege 10 Skelette' }
      ]
    },

    // ===== Orc Achievements =====
    {
      name: 'achievement_orc_slayer_10',
      display_name: 'Ork-Bezwinger',
      description: 'Die Orks respektieren deine Stärke.',
      category: 'achievement',
      min_level: 5,
      reward_gold: 100,
      reward_experience: 200,
      sort_order: 140,
      objectives: [
        { type: 'kill_specific_monster', target_id: orc?.id, amount: 10, description: 'Besiege 10 Orks' }
      ]
    },

    // ===== Troll Achievement =====
    {
      name: 'achievement_troll_slayer_5',
      display_name: 'Trollbezwinger',
      description: 'Selbst Trolle sind vor dir nicht sicher!',
      category: 'achievement',
      min_level: 8,
      reward_gold: 150,
      reward_experience: 300,
      sort_order: 150,
      objectives: [
        { type: 'kill_specific_monster', target_id: troll?.id, amount: 5, description: 'Besiege 5 Trolle' }
      ]
    },

    // ===== Boss Achievements =====
    {
      name: 'achievement_boss_slayer_1',
      display_name: 'Boss-Bezwinger',
      description: 'Besiege deinen ersten Boss!',
      category: 'achievement',
      min_level: 5,
      reward_gold: 200,
      reward_experience: 400,
      sort_order: 200,
      objectives: [
        { type: 'kill_boss', amount: 1, description: 'Besiege 1 Boss' }
      ]
    },
    {
      name: 'achievement_boss_slayer_5',
      display_name: 'Boss-Jäger',
      description: 'Besiege 5 Bosse!',
      category: 'achievement',
      min_level: 5,
      reward_gold: 500,
      reward_experience: 800,
      sort_order: 201,
      objectives: [
        { type: 'kill_boss', amount: 5, description: 'Besiege 5 Bosse' }
      ]
    },
    {
      name: 'achievement_boss_slayer_10',
      display_name: 'Boss-Vernichter',
      description: 'Die mächtigsten Kreaturen fallen vor dir!',
      category: 'achievement',
      min_level: 5,
      reward_gold: 1000,
      reward_experience: 1500,
      sort_order: 202,
      objectives: [
        { type: 'kill_boss', amount: 10, description: 'Besiege 10 Bosse' }
      ]
    },

    // ===== Specific Boss Achievements =====
    {
      name: 'achievement_dragon_hatchling',
      display_name: 'Drachentöter-Lehrling',
      description: 'Du hast ein Drachenjunges besiegt!',
      category: 'achievement',
      min_level: 10,
      reward_gold: 300,
      reward_experience: 500,
      sort_order: 210,
      objectives: [
        { type: 'kill_specific_monster', target_id: dragonHatchling?.id, amount: 1, description: 'Besiege das Drachenjunge' }
      ]
    },
    {
      name: 'achievement_lich_king',
      display_name: 'Lichkönig-Bezwinger',
      description: 'Du hast den Lichkönig in die ewige Ruhe geschickt!',
      category: 'achievement',
      min_level: 15,
      reward_gold: 500,
      reward_experience: 800,
      sort_order: 211,
      objectives: [
        { type: 'kill_specific_monster', target_id: lichKing?.id, amount: 1, description: 'Besiege den Lichkönig' }
      ]
    },
    {
      name: 'achievement_ancient_dragon',
      display_name: 'Drachentöter',
      description: 'Du hast den uralten Drachen besiegt - eine legendäre Tat!',
      category: 'achievement',
      min_level: 25,
      reward_gold: 2000,
      reward_experience: 3000,
      sort_order: 212,
      objectives: [
        { type: 'kill_specific_monster', target_id: ancientDragon?.id, amount: 1, description: 'Besiege den uralten Drachen' }
      ]
    },

    // ===== Resource Collection Achievements =====
    {
      name: 'achievement_gatherer_10',
      display_name: 'Sammler',
      description: 'Sammle deine ersten Ressourcen!',
      category: 'achievement',
      min_level: 1,
      reward_gold: 20,
      reward_experience: 40,
      sort_order: 300,
      objectives: [
        { type: 'collect_resource', amount: 10, description: 'Sammle 10 Ressourcen' }
      ]
    },
    {
      name: 'achievement_gatherer_100',
      display_name: 'Fleißiger Sammler',
      description: 'Du bist ein erfahrener Sammler geworden.',
      category: 'achievement',
      min_level: 1,
      reward_gold: 100,
      reward_experience: 200,
      sort_order: 301,
      objectives: [
        { type: 'collect_resource', amount: 100, description: 'Sammle 100 Ressourcen' }
      ]
    },

    // ===== Crafting Achievements =====
    {
      name: 'achievement_crafter_5',
      display_name: 'Handwerker-Lehrling',
      description: 'Stelle deine ersten Items her!',
      category: 'achievement',
      min_level: 1,
      reward_gold: 30,
      reward_experience: 60,
      sort_order: 310,
      objectives: [
        { type: 'craft_item', amount: 5, description: 'Stelle 5 Items her' }
      ]
    },
    {
      name: 'achievement_crafter_25',
      display_name: 'Meisterhandwerker',
      description: 'Du hast das Handwerk gemeistert!',
      category: 'achievement',
      min_level: 1,
      reward_gold: 150,
      reward_experience: 300,
      sort_order: 311,
      objectives: [
        { type: 'craft_item', amount: 25, description: 'Stelle 25 Items her' }
      ]
    },

    // ===== Building Achievements =====
    {
      name: 'achievement_builder_1',
      display_name: 'Baumeister',
      description: 'Errichte dein erstes Gebäude!',
      category: 'achievement',
      min_level: 1,
      reward_gold: 50,
      reward_experience: 100,
      sort_order: 320,
      objectives: [
        { type: 'build_building', amount: 1, description: 'Baue 1 Gebäude' }
      ]
    },
    {
      name: 'achievement_builder_5',
      display_name: 'Siedler',
      description: 'Dein Grundstück nimmt Form an!',
      category: 'achievement',
      min_level: 1,
      reward_gold: 200,
      reward_experience: 400,
      sort_order: 321,
      objectives: [
        { type: 'build_building', amount: 5, description: 'Baue 5 Gebäude' }
      ]
    },

    // ===== Gold Achievements =====
    {
      name: 'achievement_rich_100',
      display_name: 'Sparschwein',
      description: 'Verdiene insgesamt 100 Gold.',
      category: 'achievement',
      min_level: 1,
      reward_gold: 25,
      reward_experience: 50,
      sort_order: 330,
      objectives: [
        { type: 'earn_gold', amount: 100, description: 'Verdiene 100 Gold' }
      ]
    },
    {
      name: 'achievement_rich_1000',
      display_name: 'Wohlhabend',
      description: 'Verdiene insgesamt 1000 Gold!',
      category: 'achievement',
      min_level: 1,
      reward_gold: 100,
      reward_experience: 200,
      sort_order: 331,
      objectives: [
        { type: 'earn_gold', amount: 1000, description: 'Verdiene 1000 Gold' }
      ]
    },
    {
      name: 'achievement_rich_10000',
      display_name: 'Reichtum',
      description: 'Du hast ein kleines Vermögen angehäuft!',
      category: 'achievement',
      min_level: 1,
      reward_gold: 500,
      reward_experience: 1000,
      sort_order: 332,
      objectives: [
        { type: 'earn_gold', amount: 10000, description: 'Verdiene 10000 Gold' }
      ]
    },

    // ===== Travel Achievements =====
    {
      name: 'achievement_traveler_1000',
      display_name: 'Wanderer',
      description: 'Lege 1000 Felder zurück.',
      category: 'achievement',
      min_level: 1,
      reward_gold: 30,
      reward_experience: 60,
      sort_order: 340,
      objectives: [
        { type: 'travel_distance', amount: 1000, description: 'Laufe 1000 Felder' }
      ]
    },
    {
      name: 'achievement_traveler_10000',
      display_name: 'Entdecker',
      description: 'Lege 10000 Felder zurück!',
      category: 'achievement',
      min_level: 1,
      reward_gold: 150,
      reward_experience: 300,
      sort_order: 341,
      objectives: [
        { type: 'travel_distance', amount: 10000, description: 'Laufe 10000 Felder' }
      ]
    },
  ];

  for (const achievement of achievements) {
    // Skip if no valid target_id for specific monster kills
    if (achievement.objectives[0].type === 'kill_specific_monster' && !achievement.objectives[0].target_id) {
      continue;
    }

    // Check if achievement already exists
    const existing = await db.get('SELECT id FROM quests WHERE name = ?', [achievement.name]);
    if (existing) continue;

    try {
      const result = await db.run(`
        INSERT INTO quests (
          name, display_name, description, category,
          is_repeatable, min_level, reward_gold, reward_experience, sort_order, is_active
        ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 1)
      `, [
        achievement.name, achievement.display_name, achievement.description, achievement.category,
        achievement.min_level, achievement.reward_gold, achievement.reward_experience, achievement.sort_order
      ]);

      // Add objectives
      for (let i = 0; i < achievement.objectives.length; i++) {
        const obj = achievement.objectives[i];
        await db.run(`
          INSERT INTO quest_objectives (quest_id, objective_type, target_id, required_amount, description, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [result.lastID, obj.type, obj.target_id || null, obj.amount, obj.description, i]);
      }

      console.log(`[DB] Achievement created: ${achievement.display_name}`);
    } catch (error) {
      console.error(`Error creating achievement ${achievement.name}:`, error);
    }
  }
}

// Insert default resource node types
async function insertDefaultResourceNodes() {
  const existingNodes = await db.get('SELECT COUNT(*) as count FROM resource_node_types');
  if (existingNodes.count > 0) return;

  console.log('[DB] Creating default resource node types...');

  const nodeTypes = [
    // Mining nodes
    {
      name: 'stone_deposit',
      display_name: 'Steinvorkommen',
      description: 'Ein Felsvorsprung mit abbaubarem Gestein',
      category: 'mining',
      icon: '🪨',
      required_tool_type: 'pickaxe',
      base_gather_time: 20,
      respawn_minutes: 15,
      min_level: 1
    },
    {
      name: 'iron_vein',
      display_name: 'Eisenader',
      description: 'Eine Ader mit wertvollem Eisenerz',
      category: 'mining',
      icon: '�ite',
      required_tool_type: 'pickaxe',
      base_gather_time: 30,
      respawn_minutes: 30,
      min_level: 5
    },
    {
      name: 'copper_vein',
      display_name: 'Kupferader',
      description: 'Kupfererz schimmert im Gestein',
      category: 'mining',
      icon: '🟤',
      required_tool_type: 'pickaxe',
      base_gather_time: 25,
      respawn_minutes: 20,
      min_level: 3
    },
    {
      name: 'gold_vein',
      display_name: 'Goldader',
      description: 'Seltenes Goldvorkommen!',
      category: 'mining',
      icon: '✨',
      required_tool_type: 'pickaxe',
      base_gather_time: 45,
      respawn_minutes: 60,
      min_level: 10
    },
    // Woodcutting nodes
    {
      name: 'oak_tree',
      display_name: 'Eiche',
      description: 'Ein stattlicher Eichenbaum',
      category: 'woodcutting',
      icon: '🌳',
      required_tool_type: 'axe',
      base_gather_time: 20,
      respawn_minutes: 20,
      min_level: 1
    },
    {
      name: 'pine_tree',
      display_name: 'Kiefer',
      description: 'Eine große Kiefer mit hartem Holz',
      category: 'woodcutting',
      icon: '🌲',
      required_tool_type: 'axe',
      base_gather_time: 25,
      respawn_minutes: 25,
      min_level: 3
    },
    {
      name: 'birch_tree',
      display_name: 'Birke',
      description: 'Eine elegante Birke',
      category: 'woodcutting',
      icon: '🌳',
      required_tool_type: 'axe',
      base_gather_time: 15,
      respawn_minutes: 15,
      min_level: 1
    },
    {
      name: 'magic_tree',
      display_name: 'Magischer Baum',
      description: 'Ein uralter, mystischer Baum',
      category: 'woodcutting',
      icon: '🎄',
      required_tool_type: 'axe',
      base_gather_time: 60,
      respawn_minutes: 90,
      min_level: 15
    },
    // Herbalism nodes
    {
      name: 'herb_patch',
      display_name: 'Kräuterfeld',
      description: 'Verschiedene Heilkräuter wachsen hier',
      category: 'herbalism',
      icon: '🌿',
      required_tool_type: 'sickle',
      base_gather_time: 10,
      respawn_minutes: 10,
      min_level: 1
    },
    {
      name: 'rare_herbs',
      display_name: 'Seltene Kräuter',
      description: 'Seltene, magische Pflanzen',
      category: 'herbalism',
      icon: '🌺',
      required_tool_type: 'sickle',
      base_gather_time: 20,
      respawn_minutes: 45,
      min_level: 8
    }
  ];

  for (const node of nodeTypes) {
    try {
      await db.run(`
        INSERT INTO resource_node_types (name, display_name, description, category, icon, required_tool_type, base_gather_time, respawn_minutes, min_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [node.name, node.display_name, node.description, node.category, node.icon, node.required_tool_type, node.base_gather_time, node.respawn_minutes, node.min_level]);
    } catch (err) {
      // Already exists
    }
  }

  // Now add drops for each node type
  const stoneNode = await db.get("SELECT id FROM resource_node_types WHERE name = 'stone_deposit'");
  const ironNode = await db.get("SELECT id FROM resource_node_types WHERE name = 'iron_vein'");
  const copperNode = await db.get("SELECT id FROM resource_node_types WHERE name = 'copper_vein'");
  const goldNode = await db.get("SELECT id FROM resource_node_types WHERE name = 'gold_vein'");
  const oakNode = await db.get("SELECT id FROM resource_node_types WHERE name = 'oak_tree'");
  const pineNode = await db.get("SELECT id FROM resource_node_types WHERE name = 'pine_tree'");
  const birchNode = await db.get("SELECT id FROM resource_node_types WHERE name = 'birch_tree'");
  const herbNode = await db.get("SELECT id FROM resource_node_types WHERE name = 'herb_patch'");

  // Get or create items
  const stoneItem = await db.get("SELECT id FROM items WHERE name = 'stein'");
  const holzItem = await db.get("SELECT id FROM items WHERE name = 'holz'");
  const eisenerzItem = await db.get("SELECT id FROM items WHERE name = 'eisenerz'");
  
  // Create missing items
  let kupfererzId, golderzId, eichenholzId, kiefernholzId, birkenholzId, krautId;
  
  const kupfererz = await db.get("SELECT id FROM items WHERE name = 'kupfererz'");
  if (!kupfererz) {
    const result = await db.run(`
      INSERT INTO items (name, display_name, description, type, rarity, stackable) 
      VALUES ('kupfererz', 'Kupfererz', 'Rohes Kupfererz aus dem Berg', 'resource', 'uncommon', 1)
    `);
    kupfererzId = result.lastID;
  } else {
    kupfererzId = kupfererz.id;
  }

  const golderz = await db.get("SELECT id FROM items WHERE name = 'golderz'");
  if (!golderz) {
    const result = await db.run(`
      INSERT INTO items (name, display_name, description, type, rarity, stackable) 
      VALUES ('golderz', 'Golderz', 'Funkelndes Golderz', 'resource', 'rare', 1)
    `);
    golderzId = result.lastID;
  } else {
    golderzId = golderz.id;
  }

  const eichenholz = await db.get("SELECT id FROM items WHERE name = 'eichenholz'");
  if (!eichenholz) {
    const result = await db.run(`
      INSERT INTO items (name, display_name, description, type, rarity, stackable) 
      VALUES ('eichenholz', 'Eichenholz', 'Robustes Eichenholz', 'resource', 'common', 1)
    `);
    eichenholzId = result.lastID;
  } else {
    eichenholzId = eichenholz.id;
  }

  const kiefernholz = await db.get("SELECT id FROM items WHERE name = 'kiefernholz'");
  if (!kiefernholz) {
    const result = await db.run(`
      INSERT INTO items (name, display_name, description, type, rarity, stackable) 
      VALUES ('kiefernholz', 'Kiefernholz', 'Hartes Kiefernholz', 'resource', 'uncommon', 1)
    `);
    kiefernholzId = result.lastID;
  } else {
    kiefernholzId = kiefernholz.id;
  }

  const birkenholz = await db.get("SELECT id FROM items WHERE name = 'birkenholz'");
  if (!birkenholz) {
    const result = await db.run(`
      INSERT INTO items (name, display_name, description, type, rarity, stackable) 
      VALUES ('birkenholz', 'Birkenholz', 'Helles Birkenholz', 'resource', 'common', 1)
    `);
    birkenholzId = result.lastID;
  } else {
    birkenholzId = birkenholz.id;
  }

  const kraut = await db.get("SELECT id FROM items WHERE name = 'kraut'");
  if (!kraut) {
    const result = await db.run(`
      INSERT INTO items (name, display_name, description, type, rarity, stackable) 
      VALUES ('kraut', 'Heilkraut', 'Nützliches Heilkraut', 'resource', 'common', 1)
    `);
    krautId = result.lastID;
  } else {
    krautId = kraut.id;
  }

  // Add drops
  if (stoneNode && stoneItem) {
    await db.run('INSERT OR IGNORE INTO resource_node_drops (node_type_id, item_id, drop_chance, min_quantity, max_quantity) VALUES (?, ?, 100, 1, 3)', [stoneNode.id, stoneItem.id]);
    if (eisenerzItem) {
      await db.run('INSERT OR IGNORE INTO resource_node_drops (node_type_id, item_id, drop_chance, min_quantity, max_quantity, min_tool_tier, is_rare) VALUES (?, ?, 15, 1, 1, 2, 1)', [stoneNode.id, eisenerzItem.id]);
    }
  }

  if (ironNode && eisenerzItem) {
    await db.run('INSERT OR IGNORE INTO resource_node_drops (node_type_id, item_id, drop_chance, min_quantity, max_quantity) VALUES (?, ?, 100, 1, 2)', [ironNode.id, eisenerzItem.id]);
    if (stoneItem) {
      await db.run('INSERT OR IGNORE INTO resource_node_drops (node_type_id, item_id, drop_chance, min_quantity, max_quantity) VALUES (?, ?, 50, 1, 2)', [ironNode.id, stoneItem.id]);
    }
  }

  if (copperNode && kupfererzId) {
    await db.run('INSERT OR IGNORE INTO resource_node_drops (node_type_id, item_id, drop_chance, min_quantity, max_quantity) VALUES (?, ?, 100, 1, 2)', [copperNode.id, kupfererzId]);
  }

  if (goldNode && golderzId) {
    await db.run('INSERT OR IGNORE INTO resource_node_drops (node_type_id, item_id, drop_chance, min_quantity, max_quantity) VALUES (?, ?, 100, 1, 1)', [goldNode.id, golderzId]);
  }

  if (oakNode && eichenholzId) {
    await db.run('INSERT OR IGNORE INTO resource_node_drops (node_type_id, item_id, drop_chance, min_quantity, max_quantity) VALUES (?, ?, 100, 2, 4)', [oakNode.id, eichenholzId]);
    if (holzItem) {
      await db.run('INSERT OR IGNORE INTO resource_node_drops (node_type_id, item_id, drop_chance, min_quantity, max_quantity) VALUES (?, ?, 80, 1, 2)', [oakNode.id, holzItem.id]);
    }
  }

  if (pineNode && kiefernholzId) {
    await db.run('INSERT OR IGNORE INTO resource_node_drops (node_type_id, item_id, drop_chance, min_quantity, max_quantity) VALUES (?, ?, 100, 2, 3)', [pineNode.id, kiefernholzId]);
  }

  if (birchNode && birkenholzId) {
    await db.run('INSERT OR IGNORE INTO resource_node_drops (node_type_id, item_id, drop_chance, min_quantity, max_quantity) VALUES (?, ?, 100, 2, 4)', [birchNode.id, birkenholzId]);
    if (holzItem) {
      await db.run('INSERT OR IGNORE INTO resource_node_drops (node_type_id, item_id, drop_chance, min_quantity, max_quantity) VALUES (?, ?, 100, 1, 2)', [birchNode.id, holzItem.id]);
    }
  }

  if (herbNode && krautId) {
    await db.run('INSERT OR IGNORE INTO resource_node_drops (node_type_id, item_id, drop_chance, min_quantity, max_quantity) VALUES (?, ?, 100, 1, 3)', [herbNode.id, krautId]);
  }

  console.log('[DB] Resource node types created');
}

// Insert default tools
async function insertDefaultTools() {
  const existingTools = await db.get('SELECT COUNT(*) as count FROM tool_types');
  if (existingTools.count > 0) return;

  console.log('[DB] Creating default tools...');

  const tools = [
    // Pickaxes
    { name: 'wooden_pickaxe', display_name: 'Holzspitzhacke', description: 'Eine einfache Spitzhacke aus Holz', category: 'pickaxe', tier: 1, speed_bonus: 1.0, rare_drop_bonus: 0, efficiency_bonus: 0, durability: 50, required_level: 1, icon: '⛏️' },
    { name: 'stone_pickaxe', display_name: 'Steinspitzhacke', description: 'Eine robuste Spitzhacke aus Stein', category: 'pickaxe', tier: 2, speed_bonus: 1.2, rare_drop_bonus: 0.05, efficiency_bonus: 0.1, durability: 100, required_level: 5, icon: '⛏️' },
    { name: 'iron_pickaxe', display_name: 'Eisenspitzhacke', description: 'Eine starke Spitzhacke aus Eisen', category: 'pickaxe', tier: 3, speed_bonus: 1.5, rare_drop_bonus: 0.10, efficiency_bonus: 0.2, durability: 200, required_level: 10, icon: '⛏️' },
    { name: 'steel_pickaxe', display_name: 'Stahlspitzhacke', description: 'Eine mächtige Spitzhacke aus Stahl', category: 'pickaxe', tier: 4, speed_bonus: 1.8, rare_drop_bonus: 0.20, efficiency_bonus: 0.3, durability: 400, required_level: 15, icon: '⛏️' },
    { name: 'mithril_pickaxe', display_name: 'Mithrilspitzhacke', description: 'Eine legendäre Spitzhacke', category: 'pickaxe', tier: 5, speed_bonus: 2.2, rare_drop_bonus: 0.35, efficiency_bonus: 0.5, durability: 800, required_level: 25, icon: '⛏️' },
    
    // Axes
    { name: 'wooden_axe', display_name: 'Holzaxt', description: 'Eine einfache Axt aus Holz', category: 'axe', tier: 1, speed_bonus: 1.0, rare_drop_bonus: 0, efficiency_bonus: 0, durability: 50, required_level: 1, icon: '🪓' },
    { name: 'stone_axe', display_name: 'Steinaxt', description: 'Eine robuste Axt aus Stein', category: 'axe', tier: 2, speed_bonus: 1.2, rare_drop_bonus: 0.05, efficiency_bonus: 0.1, durability: 100, required_level: 5, icon: '🪓' },
    { name: 'iron_axe', display_name: 'Eisenaxt', description: 'Eine starke Axt aus Eisen', category: 'axe', tier: 3, speed_bonus: 1.5, rare_drop_bonus: 0.10, efficiency_bonus: 0.2, durability: 200, required_level: 10, icon: '🪓' },
    { name: 'steel_axe', display_name: 'Stahlaxt', description: 'Eine mächtige Axt aus Stahl', category: 'axe', tier: 4, speed_bonus: 1.8, rare_drop_bonus: 0.20, efficiency_bonus: 0.3, durability: 400, required_level: 15, icon: '🪓' },
    { name: 'mithril_axe', display_name: 'Mithrilaxt', description: 'Eine legendäre Axt', category: 'axe', tier: 5, speed_bonus: 2.2, rare_drop_bonus: 0.35, efficiency_bonus: 0.5, durability: 800, required_level: 25, icon: '🪓' },
    
    // Sickles
    { name: 'wooden_sickle', display_name: 'Holzsichel', description: 'Eine einfache Sichel', category: 'sickle', tier: 1, speed_bonus: 1.0, rare_drop_bonus: 0, efficiency_bonus: 0, durability: 50, required_level: 1, icon: '🌾' },
    { name: 'iron_sickle', display_name: 'Eisensichel', description: 'Eine scharfe Eisensichel', category: 'sickle', tier: 3, speed_bonus: 1.5, rare_drop_bonus: 0.15, efficiency_bonus: 0.2, durability: 200, required_level: 8, icon: '🌾' },
    { name: 'steel_sickle', display_name: 'Stahlsichel', description: 'Eine perfekte Stahlsichel', category: 'sickle', tier: 4, speed_bonus: 2.0, rare_drop_bonus: 0.25, efficiency_bonus: 0.4, durability: 400, required_level: 15, icon: '🌾' },
  ];

  for (const tool of tools) {
    try {
      await db.run(`
        INSERT INTO tool_types (name, display_name, description, category, tier, speed_bonus, rare_drop_bonus, efficiency_bonus, durability, required_level, icon)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [tool.name, tool.display_name, tool.description, tool.category, tool.tier, tool.speed_bonus, tool.rare_drop_bonus, tool.efficiency_bonus, tool.durability, tool.required_level, tool.icon]);
    } catch (err) {
      // Already exists
    }
  }

  console.log('[DB] Tools created');
}

// Spawn resource nodes on the map
async function spawnResourceNodes() {
  const existingNodes = await db.get('SELECT COUNT(*) as count FROM world_resource_nodes');
  if (existingNodes.count > 0) return;

  console.log('[DB] Spawning resource nodes on map...');

  const nodeTypes = await db.all('SELECT * FROM resource_node_types WHERE is_active = 1');
  
  // Define spawn counts per type
  const spawnCounts = {
    'stone_deposit': 50,
    'iron_vein': 20,
    'copper_vein': 25,
    'gold_vein': 5,
    'oak_tree': 60,
    'pine_tree': 40,
    'birch_tree': 50,
    'magic_tree': 3,
    'herb_patch': 40,
    'rare_herbs': 10
  };

  for (const nodeType of nodeTypes) {
    const count = spawnCounts[nodeType.name] || 20;
    
    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * 4000) - 2000;
      const y = Math.floor(Math.random() * 4000) - 2000;
      
      // Don't spawn too close to origin (player starting area has home-based collection)
      const distFromCenter = Math.sqrt(x * x + y * y);
      if (distFromCenter < 100) continue;

      try {
        await db.run(`
          INSERT INTO world_resource_nodes (node_type_id, world_x, world_y, current_amount, max_amount)
          VALUES (?, ?, ?, 3, 3)
        `, [nodeType.id, x, y]);
      } catch (err) {
        // Skip duplicates
      }
    }
  }

  console.log('[DB] Resource nodes spawned');
}

// Insert default buff types
async function insertDefaultBuffTypes() {
  const existingBuffs = await db.get('SELECT COUNT(*) as count FROM buff_types');
  if (existingBuffs.count > 0) return;

  const buffTypes = [
    // Combat buffs
    { name: 'strength_boost', display_name: 'Stärkeboost', description: 'Erhöht den Angriff', icon: '💪', effect_type: 'attack_percent', effect_value: 20 },
    { name: 'iron_skin', display_name: 'Eisenhaut', description: 'Erhöht die Verteidigung', icon: '🛡️', effect_type: 'defense_percent', effect_value: 20 },
    { name: 'vitality', display_name: 'Vitalität', description: 'Erhöht maximale HP', icon: '❤️', effect_type: 'health_percent', effect_value: 25 },
    { name: 'berserker', display_name: 'Berserker', description: 'Großer Angriffsboost', icon: '🔥', effect_type: 'attack_percent', effect_value: 50 },
    { name: 'fortress', display_name: 'Festung', description: 'Großer Verteidigungsboost', icon: '🏰', effect_type: 'defense_percent', effect_value: 50 },
    
    // Movement buffs
    { name: 'swift_feet', display_name: 'Schnelle Füße', description: 'Reisen geht schneller', icon: '👟', effect_type: 'speed_percent', effect_value: 25 },
    { name: 'wind_walker', display_name: 'Windläufer', description: 'Reisen geht viel schneller', icon: '🌪️', effect_type: 'speed_percent', effect_value: 50 },
    
    // Economy buffs
    { name: 'wisdom', display_name: 'Weisheit', description: 'Mehr Erfahrungspunkte', icon: '📚', effect_type: 'exp_percent', effect_value: 25 },
    { name: 'fortune', display_name: 'Glückspilz', description: 'Mehr Gold bei Drops', icon: '💰', effect_type: 'gold_percent', effect_value: 25 },
    { name: 'double_exp', display_name: 'Doppelte EP', description: 'Doppelte Erfahrungspunkte', icon: '⭐', effect_type: 'exp_percent', effect_value: 100 },
    { name: 'gold_rush', display_name: 'Goldrausch', description: 'Doppeltes Gold', icon: '🤑', effect_type: 'gold_percent', effect_value: 100 },
    
    // Gathering/Crafting buffs
    { name: 'efficient_gatherer', display_name: 'Effizienter Sammler', description: 'Schnelleres Sammeln', icon: '⛏️', effect_type: 'gather_speed', effect_value: 25 },
    { name: 'master_crafter', display_name: 'Meisterhandwerker', description: 'Schnelleres Craften', icon: '🔨', effect_type: 'craft_speed', effect_value: 25 },
    
    // Special event buffs
    { name: 'event_blessing', display_name: 'Segen des Events', description: 'Alle Stats +10%', icon: '🎉', effect_type: 'all_stats', effect_value: 10 },
    { name: 'vip_bonus', display_name: 'VIP Bonus', description: 'Bonus für VIPs', icon: '👑', effect_type: 'all_stats', effect_value: 15 },
  ];

  for (const buff of buffTypes) {
    await db.run(`
      INSERT OR IGNORE INTO buff_types (name, display_name, description, icon, effect_type, effect_value)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [buff.name, buff.display_name, buff.description, buff.icon, buff.effect_type, buff.effect_value]);
  }

  console.log('[DB] Default buff types inserted');
}

export default db;
