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

export default router;
