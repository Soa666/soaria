import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// Get all users (requires manage_users permission)
router.get('/users', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const users = await db.all(`
      SELECT 
        id,
        username,
        email,
        role,
        is_activated,
        created_at,
        last_login
      FROM users
      ORDER BY created_at DESC
    `);

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Resend activation email (requires manage_users permission)
router.post('/users/:id/resend-activation', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await db.get('SELECT id, username, email, is_activated FROM users WHERE id = ?', [id]);
    
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }
    
    if (user.is_activated === 1) {
      return res.status(400).json({ error: 'Benutzer ist bereits aktiviert' });
    }
    
    // Generate new activation token
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    
    // Delete old tokens for this user
    await db.run('DELETE FROM activation_tokens WHERE user_id = ?', [user.id]);
    
    // Save new token
    await db.run(
      'INSERT INTO activation_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt]
    );
    
    // Send email
    const { sendActivationEmail } = await import('../utils/email.js');
    const emailSent = await sendActivationEmail(user.email, user.username, token);
    
    if (emailSent) {
      res.json({ message: `Aktivierungsmail an ${user.email} gesendet` });
    } else {
      res.status(500).json({ error: 'Fehler beim Senden der E-Mail. Prüfe die SMTP-Konfiguration.' });
    }
  } catch (error) {
    console.error('Resend activation error:', error);
    res.status(500).json({ error: 'Serverfehler: ' + error.message });
  }
});

// Manually activate user (requires manage_users permission)
router.post('/users/:id/activate', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await db.get('SELECT id, username, is_activated FROM users WHERE id = ?', [id]);
    
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }
    
    if (user.is_activated === 1) {
      return res.status(400).json({ error: 'Benutzer ist bereits aktiviert' });
    }
    
    // Activate user
    await db.run('UPDATE users SET is_activated = 1 WHERE id = ?', [id]);
    
    // Delete any pending tokens
    await db.run('DELETE FROM activation_tokens WHERE user_id = ?', [id]);
    
    res.json({ message: `Benutzer ${user.username} wurde manuell aktiviert` });
  } catch (error) {
    console.error('Manual activate error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Update user role (requires manage_users permission)
router.put('/users/:id/role', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['admin', 'mod', 'vip', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Ungültige Rolle' });
    }

    // Prevent changing own role (optional safety check)
    if (parseInt(id) === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'Du kannst deine eigene Admin-Rolle nicht entfernen' });
    }

    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);

    const updatedUser = await db.get(
      'SELECT id, username, email, role FROM users WHERE id = ?',
      [id]
    );

    res.json({
      message: 'Rolle erfolgreich aktualisiert',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Delete user (requires manage_users permission)
router.delete('/users/:id', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Du kannst dich nicht selbst löschen' });
    }

    const user = await db.get('SELECT username FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    await db.run('DELETE FROM users WHERE id = ?', [id]);

    res.json({ message: `Benutzer ${user.username} wurde gelöscht` });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Email Templates Management
router.get('/email-templates', authenticateToken, requirePermission('manage_settings'), async (req, res) => {
  try {
    const templates = await db.all('SELECT * FROM email_templates ORDER BY name');
    res.json({ templates });
  } catch (error) {
    console.error('Get email templates error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

router.get('/email-templates/:name', authenticateToken, requirePermission('manage_settings'), async (req, res) => {
  try {
    const { name } = req.params;
    const template = await db.get('SELECT * FROM email_templates WHERE name = ?', [name]);
    
    if (!template) {
      return res.status(404).json({ error: 'Template nicht gefunden' });
    }
    
    res.json({ template });
  } catch (error) {
    console.error('Get email template error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

router.put('/email-templates/:name', authenticateToken, requirePermission('manage_settings'), async (req, res) => {
  try {
    const { name } = req.params;
    const { subject, html_content, text_content } = req.body;

    if (!subject || !html_content) {
      return res.status(400).json({ error: 'Subject und HTML-Content sind erforderlich' });
    }

    const existing = await db.get('SELECT id FROM email_templates WHERE name = ?', [name]);
    
    if (existing) {
      await db.run(
        'UPDATE email_templates SET subject = ?, html_content = ?, text_content = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?',
        [subject, html_content, text_content || null, name]
      );
    } else {
      await db.run(
        'INSERT INTO email_templates (name, subject, html_content, text_content) VALUES (?, ?, ?, ?)',
        [name, subject, html_content, text_content || null]
      );
    }

    res.json({ message: 'Template gespeichert' });
  } catch (error) {
    console.error('Update email template error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Discord Webhooks Management
router.get('/discord-webhooks', authenticateToken, requirePermission('manage_settings'), async (req, res) => {
  try {
    const webhooks = await db.all('SELECT * FROM discord_webhooks ORDER BY name');
    res.json({ webhooks });
  } catch (error) {
    console.error('Get discord webhooks error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

router.post('/discord-webhooks', authenticateToken, requirePermission('manage_settings'), async (req, res) => {
  try {
    const { name, webhook_url, event_type, message_template, enabled } = req.body;

    console.log('Creating webhook:', { name, webhook_url, event_type, message_template, enabled });

    if (!name || !webhook_url || !event_type) {
      return res.status(400).json({ error: 'Name, Webhook-URL und Event-Type sind erforderlich' });
    }

    const result = await db.run(
      'INSERT INTO discord_webhooks (name, webhook_url, event_type, message_template, enabled) VALUES (?, ?, ?, ?, ?)',
      [name, webhook_url, event_type, message_template || null, enabled !== undefined ? enabled : 1]
    );

    console.log('Webhook inserted, ID:', result.lastID);

    const webhook = await db.get('SELECT * FROM discord_webhooks WHERE id = ?', [result.lastID]);
    console.log('Webhook retrieved:', webhook);
    res.json({ message: 'Webhook erstellt', webhook });
  } catch (error) {
    console.error('Create discord webhook error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Serverfehler: ' + error.message });
  }
});

router.put('/discord-webhooks/:id', authenticateToken, requirePermission('manage_settings'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, webhook_url, event_type, message_template, enabled } = req.body;

    if (!name || !webhook_url || !event_type) {
      return res.status(400).json({ error: 'Name, Webhook-URL und Event-Type sind erforderlich' });
    }

    await db.run(
      'UPDATE discord_webhooks SET name = ?, webhook_url = ?, event_type = ?, message_template = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, webhook_url, event_type, message_template || null, enabled !== undefined ? enabled : 1, id]
    );

    const webhook = await db.get('SELECT * FROM discord_webhooks WHERE id = ?', [id]);
    res.json({ message: 'Webhook aktualisiert', webhook });
  } catch (error) {
    console.error('Update discord webhook error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

router.delete('/discord-webhooks/:id', authenticateToken, requirePermission('manage_settings'), async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM discord_webhooks WHERE id = ?', [id]);
    res.json({ message: 'Webhook gelöscht' });
  } catch (error) {
    console.error('Delete discord webhook error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

router.post('/discord-webhooks/:id/test', authenticateToken, requirePermission('manage_settings'), async (req, res) => {
  try {
    const { id } = req.params;
    const webhook = await db.get('SELECT * FROM discord_webhooks WHERE id = ?', [id]);
    
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook nicht gefunden' });
    }

    const { sendDiscordWebhook } = await import('../utils/discord.js');
    const testMessage = webhook.message_template 
      ? webhook.message_template.replace(/\{\{username\}\}/g, 'TestUser').replace(/\{\{email\}\}/g, 'test@example.com')
      : '🧪 **Test-Nachricht von Soaria**\n\nDies ist eine Test-Nachricht vom Admin-Panel.';
    
    const success = await sendDiscordWebhook(webhook.webhook_url, testMessage);
    
    if (success) {
      res.json({ message: 'Test-Nachricht erfolgreich gesendet' });
    } else {
      res.status(500).json({ error: 'Fehler beim Senden der Test-Nachricht' });
    }
  } catch (error) {
    console.error('Test discord webhook error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// === MESSAGE REPORTS ===

// Get all message reports
router.get('/message-reports', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const reports = await db.all(`
      SELECT 
        mr.*,
        reporter.username as reporter_name,
        reported.username as reported_user_name
      FROM message_reports mr
      JOIN users reporter ON mr.reporter_id = reporter.id
      JOIN users reported ON mr.reported_user_id = reported.id
      ORDER BY 
        CASE mr.status WHEN 'pending' THEN 1 ELSE 2 END,
        mr.created_at DESC
    `);

    res.json({ reports });
  } catch (error) {
    console.error('Get message reports error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Review a message report
router.put('/message-reports/:id', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    if (!['reviewed', 'action_taken', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Ungültiger Status' });
    }

    await db.run(`
      UPDATE message_reports 
      SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, admin_notes || null, req.user.id, id]);

    res.json({ message: 'Report aktualisiert' });
  } catch (error) {
    console.error('Review message report error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Delete a message report
router.delete('/message-reports/:id', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM message_reports WHERE id = ?', [id]);
    res.json({ message: 'Report gelöscht' });
  } catch (error) {
    console.error('Delete message report error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// =====================
// SMTP Configuration
// =====================

// Get all SMTP configs
router.get('/smtp', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const configs = await db.all(`
      SELECT id, name, host, port, secure, username, from_name, from_email, is_active, created_at
      FROM smtp_config
      ORDER BY is_active DESC, created_at DESC
    `);
    res.json({ configs });
  } catch (error) {
    console.error('Get SMTP configs error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Create new SMTP config
router.post('/smtp', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { name, host, port, secure, username, password, from_name, from_email, is_active } = req.body;
    
    if (!name || !host || !username || !password || !from_email) {
      return res.status(400).json({ error: 'Name, Host, Username, Passwort und Absender-E-Mail sind erforderlich' });
    }
    
    // If this config should be active, deactivate all others
    if (is_active) {
      await db.run('UPDATE smtp_config SET is_active = 0');
    }
    
    const result = await db.run(`
      INSERT INTO smtp_config (name, host, port, secure, username, password, from_name, from_email, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, host, port || 587, secure ? 1 : 0, username, password, from_name || 'Soaria', from_email, is_active ? 1 : 0]);
    
    res.json({ message: 'SMTP-Konfiguration erstellt', id: result.lastID });
  } catch (error) {
    console.error('Create SMTP config error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Update SMTP config
router.put('/smtp/:id', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, host, port, secure, username, password, from_name, from_email, is_active } = req.body;
    
    // If this config should be active, deactivate all others
    if (is_active) {
      await db.run('UPDATE smtp_config SET is_active = 0');
    }
    
    // Build update query - only update password if provided
    if (password) {
      await db.run(`
        UPDATE smtp_config 
        SET name = ?, host = ?, port = ?, secure = ?, username = ?, password = ?, 
            from_name = ?, from_email = ?, is_active = ?
        WHERE id = ?
      `, [name, host, port || 587, secure ? 1 : 0, username, password, from_name, from_email, is_active ? 1 : 0, id]);
    } else {
      await db.run(`
        UPDATE smtp_config 
        SET name = ?, host = ?, port = ?, secure = ?, username = ?, 
            from_name = ?, from_email = ?, is_active = ?
        WHERE id = ?
      `, [name, host, port || 587, secure ? 1 : 0, username, from_name, from_email, is_active ? 1 : 0, id]);
    }
    
    res.json({ message: 'SMTP-Konfiguration aktualisiert' });
  } catch (error) {
    console.error('Update SMTP config error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Delete SMTP config
router.delete('/smtp/:id', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM smtp_config WHERE id = ?', [id]);
    res.json({ message: 'SMTP-Konfiguration gelöscht' });
  } catch (error) {
    console.error('Delete SMTP config error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Set active SMTP config
router.post('/smtp/:id/activate', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Deactivate all configs
    await db.run('UPDATE smtp_config SET is_active = 0');
    
    // Activate selected config
    await db.run('UPDATE smtp_config SET is_active = 1 WHERE id = ?', [id]);
    
    res.json({ message: 'SMTP-Konfiguration aktiviert' });
  } catch (error) {
    console.error('Activate SMTP config error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Test SMTP config
router.post('/smtp/:id/test', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    const { test_email } = req.body;
    
    if (!test_email) {
      return res.status(400).json({ error: 'Test-E-Mail-Adresse erforderlich' });
    }
    
    const config = await db.get('SELECT * FROM smtp_config WHERE id = ?', [id]);
    
    if (!config) {
      return res.status(404).json({ error: 'SMTP-Konfiguration nicht gefunden' });
    }
    
    // Create test transporter
    const nodemailer = await import('nodemailer');
    const testTransporter = nodemailer.default.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure === 1,
      auth: {
        user: config.username,
        pass: config.password,
      },
    });
    
    // Send test email
    await testTransporter.sendMail({
      from: `"${config.from_name}" <${config.from_email}>`,
      to: test_email,
      subject: '🏰 Soaria - SMTP Test',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #1a1025; color: #e8dcc0;">
          <h1 style="color: #d4af37;">✅ SMTP Test erfolgreich!</h1>
          <p>Diese Test-E-Mail wurde von der Soaria SMTP-Konfiguration "${config.name}" gesendet.</p>
          <p><strong>Server:</strong> ${config.host}:${config.port}</p>
          <p><strong>Von:</strong> ${config.from_name} &lt;${config.from_email}&gt;</p>
          <p style="color: #8b7a5a; margin-top: 20px;">Falls du diese E-Mail erhalten hast, funktioniert die Konfiguration korrekt!</p>
        </div>
      `,
      text: `SMTP Test erfolgreich!\n\nDiese Test-E-Mail wurde von der Soaria SMTP-Konfiguration "${config.name}" gesendet.\n\nServer: ${config.host}:${config.port}\nVon: ${config.from_name} <${config.from_email}>`
    });
    
    res.json({ message: `Test-E-Mail an ${test_email} gesendet!` });
  } catch (error) {
    console.error('Test SMTP error:', error);
    res.status(500).json({ error: `SMTP-Fehler: ${error.message}` });
  }
});

export default router;
