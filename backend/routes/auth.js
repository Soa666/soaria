import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { sendActivationEmail } from '../utils/email.js';
import { sendDiscordRegistrationNotification } from '../utils/discord.js';
import { updateStatistic, updateQuestObjectiveProgress } from '../helpers/statistics.js';
import { getClientIP } from '../server.js';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    let { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Benutzername, E-Mail und Passwort sind erforderlich' });
    }

    // Trim whitespace from username and email
    username = username.trim();
    email = email.trim().toLowerCase();

    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: 'Benutzername muss zwischen 2 und 20 Zeichen lang sein' });
    }

    // Check if username exists
    const existingUsername = await db.get(
      'SELECT id FROM users WHERE LOWER(username) = LOWER(?)',
      [username]
    );

    if (existingUsername) {
      return res.status(400).json({ error: 'Dieser Benutzername ist bereits vergeben' });
    }

    // Check if email exists
    const existingEmail = await db.get(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingEmail) {
      return res.status(400).json({ error: 'Diese E-Mail-Adresse ist bereits registriert' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate unique coordinates for new user
    const existingCoords = await db.all('SELECT world_x, world_y FROM users WHERE world_x != 0 OR world_y != 0');
    const minDistance = 50;
    const minX = -2000;
    const maxX = 2000;
    const minY = -2000;
    const maxY = 2000;
    
    let worldX = 0;
    let worldY = 0;
    let foundUnique = false;
    
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
      const y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
      
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
        worldX = x;
        worldY = y;
        foundUnique = true;
        break;
      }
    }
    
    // If no unique spot found, use random coordinates anyway
    if (!foundUnique) {
      worldX = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
      worldY = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
    }

    // Create user (inactive by default)
    // Set home_x and home_y to the spawn position (this is where their Grundstück is)
    const registrationIP = getClientIP(req);
    const result = await db.run(
      'INSERT INTO users (username, email, password_hash, role, world_x, world_y, home_x, home_y, is_activated, registration_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
      [username, email, passwordHash, 'user', worldX, worldY, worldX, worldY, registrationIP]
    );

    // Create initial workbench
    await db.run(
      'INSERT INTO user_workbench (user_id, level) VALUES (?, 1)',
      [result.lastID]
    );

    // Generate activation token
    const activationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Token expires in 24 hours

    // Save activation token
    await db.run(
      'INSERT INTO activation_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [result.lastID, activationToken, expiresAt.toISOString()]
    );

    // Send activation email
    const emailSent = await sendActivationEmail(email, username, activationToken);
    
    if (!emailSent && process.env.SMTP_USER) {
      console.warn('Warnung: Aktivierungs-E-Mail konnte nicht gesendet werden, aber Benutzer wurde erstellt');
    }

    // Send Discord webhook notification
    try {
      const registrationWebhook = await db.get(
        'SELECT webhook_url, message_template FROM discord_webhooks WHERE event_type = ? AND enabled = 1',
        ['registration']
      );
      
      if (registrationWebhook && registrationWebhook.webhook_url) {
        await sendDiscordRegistrationNotification(
          username,
          email,
          registrationWebhook.webhook_url,
          registrationWebhook.message_template
        );
      }
    } catch (error) {
      console.error('Error sending Discord webhook:', error);
      // Don't fail registration if Discord webhook fails
    }

    res.status(201).json({
      message: 'Registrierung erfolgreich! Bitte prüfe deine E-Mails und aktiviere dein Konto.',
      requiresActivation: true,
      emailSent: emailSent || !process.env.SMTP_USER
    });
  } catch (error) {
    console.error('Register error:', error);
    console.error('Error stack:', error.stack);
    console.error('JWT_SECRET gesetzt:', !!process.env.JWT_SECRET);
    res.status(500).json({ error: 'Serverfehler bei der Registrierung', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Benutzername und Passwort sind erforderlich' });
    }

    // Find user
    const user = await db.get(
      'SELECT id, username, email, password_hash, role, world_x, world_y, is_activated FROM users WHERE username = ? OR email = ?',
      [username, username]
    );

    if (!user) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    // Check if account is activated
    if (!user.is_activated) {
      return res.status(403).json({ 
        error: 'Konto nicht aktiviert. Bitte prüfe deine E-Mails und klicke auf den Aktivierungslink.',
        requiresActivation: true
      });
    }

    // Update last login and IP
    const clientIP = getClientIP(req);
    await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP, last_ip = ? WHERE id = ?', [clientIP, user.id]);

    // Track login statistics
    await updateStatistic(user.id, 'logins', 1);

    // Check for daily login quests
    await checkDailyLoginQuest(user.id);

    // Auto-activate achievement quests
    await activateAchievementQuests(user.id);

    // Generate token
    const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      jwtSecret,
      { expiresIn: '7d' }
    );

    // Get avatar path
    const userWithAvatar = await db.get(
      'SELECT avatar_path FROM users WHERE id = ?',
      [user.id]
    );

    res.json({
      message: 'Login erfolgreich',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar_path: userWithAvatar?.avatar_path || null,
        world_x: user.world_x || 0,
        world_y: user.world_y || 0
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Serverfehler beim Login' });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, username, email, role, avatar_path, world_x, world_y, home_x, home_y, is_activated, created_at, last_login FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    // Check daily login quest on every profile fetch (page load)
    await checkDailyLoginQuest(req.user.id);

    res.json({ user });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Change password
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Aktuelles und neues Passwort sind erforderlich' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Neues Passwort muss mindestens 6 Zeichen lang sein' });
    }

    // Get user with password hash
    const user = await db.get(
      'SELECT id, password_hash FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(current_password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(new_password, 10);

    // Update password
    await db.run(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, req.user.id]
    );

    res.json({ message: 'Passwort erfolgreich geändert' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Serverfehler beim Ändern des Passworts' });
  }
});

// Update avatar
router.put('/avatar', authenticateToken, async (req, res) => {
  try {
    const { avatar_path } = req.body;

    if (!avatar_path) {
      return res.status(400).json({ error: 'avatar_path ist erforderlich' });
    }

    await db.run(
      'UPDATE users SET avatar_path = ? WHERE id = ?',
      [avatar_path, req.user.id]
    );

    res.json({ message: 'Profilbild erfolgreich aktualisiert', avatar_path });
  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({ error: 'Serverfehler beim Aktualisieren des Profilbilds' });
  }
});

// Activate account
router.get('/activate/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Aktivierungstoken fehlt' });
    }

    // Find token
    const activationToken = await db.get(
      'SELECT * FROM activation_tokens WHERE token = ? AND used = 0',
      [token]
    );

    if (!activationToken) {
      return res.status(400).json({ error: 'Ungültiger oder bereits verwendeter Aktivierungstoken' });
    }

    // Check if token is expired
    const expiresAt = new Date(activationToken.expires_at);
    if (expiresAt < new Date()) {
      return res.status(400).json({ error: 'Aktivierungstoken ist abgelaufen' });
    }

    // Activate user
    await db.run(
      'UPDATE users SET is_activated = 1 WHERE id = ?',
      [activationToken.user_id]
    );

    // Mark token as used
    await db.run(
      'UPDATE activation_tokens SET used = 1 WHERE id = ?',
      [activationToken.id]
    );

    res.json({ 
      message: 'Konto erfolgreich aktiviert! Du kannst dich jetzt anmelden.',
      success: true
    });
  } catch (error) {
    console.error('Activation error:', error);
    res.status(500).json({ error: 'Serverfehler bei der Aktivierung' });
  }
});

// Resend activation email
router.post('/resend-activation', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'E-Mail-Adresse ist erforderlich' });
    }

    // Find user
    const user = await db.get(
      'SELECT id, username, email, is_activated FROM users WHERE email = ?',
      [email]
    );

    if (!user) {
      // Don't reveal if email exists
      return res.json({ 
        message: 'Falls ein Konto mit dieser E-Mail existiert, wurde eine neue Aktivierungs-E-Mail gesendet.'
      });
    }

    if (user.is_activated) {
      return res.status(400).json({ error: 'Konto ist bereits aktiviert' });
    }

    // Generate new activation token
    const activationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Delete old tokens for this user
    await db.run(
      'DELETE FROM activation_tokens WHERE user_id = ? AND used = 0',
      [user.id]
    );

    // Save new activation token
    await db.run(
      'INSERT INTO activation_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, activationToken, expiresAt.toISOString()]
    );

    // Send activation email
    const emailSent = await sendActivationEmail(user.email, user.username, activationToken);

    res.json({ 
      message: 'Aktivierungs-E-Mail wurde gesendet. Bitte prüfe dein Postfach.',
      emailSent: emailSent || !process.env.SMTP_USER
    });
  } catch (error) {
    console.error('Resend activation error:', error);
    res.status(500).json({ error: 'Serverfehler beim Senden der Aktivierungs-E-Mail' });
  }
});

// Helper: Check if a new day has started (resets at midnight)
function isNewDay(lastDate) {
  if (!lastDate) return true;
  
  const last = new Date(lastDate);
  const now = new Date();
  
  // Compare dates (ignoring time) - reset at midnight
  const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  return today > lastDay;
}

// Helper: Check and complete daily login quest
async function checkDailyLoginQuest(userId) {
  try {
    // Get all daily login quests
    const dailyLoginQuests = await db.all(`
      SELECT q.id, q.cooldown_hours, q.display_name
      FROM quests q
      JOIN quest_objectives qo ON qo.quest_id = q.id
      WHERE q.is_active = 1 AND qo.objective_type = 'daily_login'
    `);

    console.log(`[DAILY] Checking ${dailyLoginQuests.length} daily login quests for user ${userId}`);

    for (const quest of dailyLoginQuests) {
      // Check current user quest status
      const userQuest = await db.get(`
        SELECT status, claimed_at, completed_at FROM user_quests WHERE user_id = ? AND quest_id = ?
      `, [userId, quest.id]);

      console.log(`[DAILY] Quest ${quest.id} status for user ${userId}:`, userQuest);

      // If already completed TODAY (ready to claim), skip
      if (userQuest?.status === 'completed') {
        console.log(`[DAILY] Quest ${quest.id} already completed, waiting for claim`);
        continue;
      }

      // If claimed, check if a new day has started (midnight reset)
      if (userQuest?.status === 'claimed' && userQuest.claimed_at) {
        const claimedAt = new Date(userQuest.claimed_at);
        const now = new Date();
        
        console.log(`[DAILY] Quest ${quest.id} claimed at ${claimedAt.toLocaleString('de-DE')}, checking if new day...`);
        
        // Check if it's still the same day
        if (!isNewDay(userQuest.claimed_at)) {
          // Still the same day, skip this quest
          console.log(`[DAILY] Quest ${quest.id} already claimed today, skipping`);
          continue;
        }
        
        console.log(`[DAILY] New day detected! Quest ${quest.id} can be completed again.`);
      }

      // Quest is either: new (no userQuest), active, or new day has started
      // Complete it immediately!
      console.log(`[DAILY] Completing quest ${quest.id} for user ${userId}`);
      
      await db.run(`
        INSERT INTO user_quests (user_id, quest_id, status, started_at, completed_at)
        VALUES (?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, quest_id) DO UPDATE SET 
          status = 'completed', 
          started_at = CURRENT_TIMESTAMP,
          completed_at = CURRENT_TIMESTAMP,
          claimed_at = NULL
      `, [userId, quest.id]);

      // Mark all objectives as completed
      const objectives = await db.all('SELECT id FROM quest_objectives WHERE quest_id = ?', [quest.id]);
      for (const obj of objectives) {
        await db.run(`
          INSERT INTO user_quest_progress (user_id, quest_id, objective_id, current_amount, is_completed)
          VALUES (?, ?, ?, 1, 1)
          ON CONFLICT(user_id, objective_id) DO UPDATE SET 
            current_amount = 1, is_completed = 1
        `, [userId, quest.id, obj.id]);
      }

      console.log(`[DAILY] Quest "${quest.display_name}" (ID: ${quest.id}) completed for user ${userId}!`);
    }
  } catch (error) {
    console.error('Check daily login quest error:', error);
  }
}

// Helper: Auto-activate all achievement quests for a user
async function activateAchievementQuests(userId) {
  try {
    // Get user's level
    const userStats = await db.get('SELECT level FROM player_stats WHERE user_id = ?', [userId]);
    const userLevel = userStats?.level || 1;

    // Find all achievement quests that the user hasn't started yet and meets level requirement
    const availableAchievements = await db.all(`
      SELECT q.id, q.display_name
      FROM quests q
      WHERE q.category = 'achievement' 
        AND q.is_active = 1
        AND q.min_level <= ?
        AND q.id NOT IN (
          SELECT quest_id FROM user_quests WHERE user_id = ?
        )
    `, [userLevel, userId]);

    if (availableAchievements.length === 0) return;

    console.log(`[ACHIEVEMENTS] Activating ${availableAchievements.length} new achievements for user ${userId}`);

    for (const quest of availableAchievements) {
      // Start the quest (set to active)
      await db.run(`
        INSERT INTO user_quests (user_id, quest_id, status, started_at)
        VALUES (?, ?, 'active', CURRENT_TIMESTAMP)
      `, [userId, quest.id]);

      // Initialize progress for all objectives
      const objectives = await db.all('SELECT id FROM quest_objectives WHERE quest_id = ?', [quest.id]);
      for (const obj of objectives) {
        await db.run(`
          INSERT OR IGNORE INTO user_quest_progress (user_id, quest_id, objective_id, current_amount, is_completed)
          VALUES (?, ?, ?, 0, 0)
        `, [userId, quest.id, obj.id]);
      }
    }
  } catch (error) {
    console.error('Activate achievement quests error:', error);
  }
}

export default router;
