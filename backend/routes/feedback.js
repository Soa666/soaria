import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { sendDiscordWebhook } from '../utils/discord.js';

const router = express.Router();

// ============== USER ROUTES ==============

// Submit feedback (bug report or suggestion)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { type, title, description, pageUrl, browserInfo } = req.body;
    const userId = req.user?.id || null;

    if (!type || !['bug', 'suggestion', 'other'].includes(type)) {
      return res.status(400).json({ error: 'Typ muss "bug", "suggestion" oder "other" sein' });
    }

    if (!title || title.trim().length < 3) {
      return res.status(400).json({ error: 'Titel muss mindestens 3 Zeichen haben' });
    }

    if (!description || description.trim().length < 10) {
      return res.status(400).json({ error: 'Beschreibung muss mindestens 10 Zeichen haben' });
    }

    const result = await db.run(`
      INSERT INTO feedback (user_id, type, title, description, page_url, browser_info)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [userId, type, title.trim(), description.trim(), pageUrl || null, browserInfo || null]);

    // Send Discord webhook notification
    try {
      const feedbackWebhook = await db.get(
        "SELECT webhook_url, message_template FROM discord_webhooks WHERE event_type = 'feedback' AND enabled = 1"
      );

      if (feedbackWebhook && feedbackWebhook.webhook_url) {
        // Get username
        const user = userId ? await db.get('SELECT username FROM users WHERE id = ?', [userId]) : null;
        const username = user?.username || 'Anonym';

        // Type icons
        const typeIcons = {
          bug: '🐛',
          suggestion: '💡',
          other: '📋'
        };
        const typeNames = {
          bug: 'Bug-Report',
          suggestion: 'Vorschlag',
          other: 'Sonstiges'
        };

        // Build message
        let message = feedbackWebhook.message_template || 
          '{{icon}} **Neues Feedback: {{type}}**\n\n**Von:** {{username}}\n**Titel:** {{title}}\n\n**Beschreibung:**\n{{description}}';
        
        message = message
          .replace(/\{\{icon\}\}/g, typeIcons[type] || '📝')
          .replace(/\{\{type\}\}/g, typeNames[type] || type)
          .replace(/\{\{username\}\}/g, username)
          .replace(/\{\{title\}\}/g, title.trim())
          .replace(/\{\{description\}\}/g, description.trim().substring(0, 500));

        await sendDiscordWebhook(feedbackWebhook.webhook_url, message);
      }
    } catch (webhookError) {
      console.error('Error sending feedback Discord webhook:', webhookError);
      // Don't fail the feedback submission if webhook fails
    }

    res.status(201).json({ 
      message: type === 'bug' 
        ? 'Bug-Report eingereicht! Danke für deine Hilfe.' 
        : 'Vorschlag eingereicht! Danke für dein Feedback.',
      id: result.lastID
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Serverfehler beim Einreichen' });
  }
});

// Get user's own feedback history
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const feedback = await db.all(`
      SELECT id, type, title, status, priority, created_at
      FROM feedback
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `, [req.user.id]);

    res.json({ feedback });
  } catch (error) {
    console.error('Get my feedback error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// ============== ADMIN ROUTES ==============

// Get all feedback (admin)
router.get('/admin', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { status, type } = req.query;
    
    let query = `
      SELECT 
        f.*,
        u.username as submitter_name,
        r.username as reviewer_name
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN users r ON f.reviewed_by = r.id
    `;
    
    const conditions = [];
    const params = [];
    
    if (status && status !== 'all') {
      conditions.push('f.status = ?');
      params.push(status);
    }
    
    if (type && type !== 'all') {
      conditions.push('f.type = ?');
      params.push(type);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY CASE f.status WHEN "new" THEN 1 WHEN "in_progress" THEN 2 ELSE 3 END, f.created_at DESC';

    const feedback = await db.all(query, params);
    
    // Get counts
    const counts = await db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN type = 'bug' THEN 1 ELSE 0 END) as bugs,
        SUM(CASE WHEN type = 'suggestion' THEN 1 ELSE 0 END) as suggestions
      FROM feedback
    `);

    res.json({ feedback, counts });
  } catch (error) {
    console.error('Admin get feedback error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get single feedback (admin)
router.get('/admin/:id', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const feedback = await db.get(`
      SELECT 
        f.*,
        u.username as submitter_name,
        u.email as submitter_email,
        r.username as reviewer_name
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN users r ON f.reviewed_by = r.id
      WHERE f.id = ?
    `, [id]);

    if (!feedback) {
      return res.status(404).json({ error: 'Feedback nicht gefunden' });
    }

    res.json({ feedback });
  } catch (error) {
    console.error('Admin get single feedback error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Update feedback status (admin)
router.put('/admin/:id', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, admin_notes } = req.body;

    const validStatuses = ['new', 'in_progress', 'resolved', 'wont_fix', 'duplicate'];
    const validPriorities = ['low', 'normal', 'high', 'critical'];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Ungültiger Status' });
    }

    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({ error: 'Ungültige Priorität' });
    }

    await db.run(`
      UPDATE feedback 
      SET status = COALESCE(?, status),
          priority = COALESCE(?, priority),
          admin_notes = COALESCE(?, admin_notes),
          reviewed_by = ?,
          reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, priority, admin_notes, req.user.id, id]);

    res.json({ message: 'Feedback aktualisiert' });
  } catch (error) {
    console.error('Admin update feedback error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Delete feedback (admin)
router.delete('/admin/:id', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.run('DELETE FROM feedback WHERE id = ?', [id]);
    
    res.json({ message: 'Feedback gelöscht' });
  } catch (error) {
    console.error('Admin delete feedback error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Get feedback counts for badge (admin)
router.get('/admin/counts', authenticateToken, requirePermission('manage_users'), async (req, res) => {
  try {
    const counts = await db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new
      FROM feedback
    `);
    
    res.json(counts);
  } catch (error) {
    console.error('Get feedback counts error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

export default router;
