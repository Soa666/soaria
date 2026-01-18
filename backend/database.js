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
      last_login DATETIME
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
      FOREIGN KEY (result_item_id) REFERENCES items(id) ON DELETE CASCADE
    )
  `);

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
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'claimed')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

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
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'claimed')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
    )
  `);

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
    { name: 'eisenbarren', display_name: 'Eisenbarren', type: 'material', rarity: 'uncommon' },
    
    // Tools
    { name: 'spitzhacke_basic', display_name: 'Spitzhacke (Basis)', type: 'tool', rarity: 'common' },
    { name: 'spitzhacke_iron', display_name: 'Spitzhacke (Eisen)', type: 'tool', rarity: 'uncommon' },
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

export default db;
