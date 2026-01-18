import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Emoji conversion map
const emojiMap = {
  ':)': '😊',
  ':-)': '😊',
  ':(': '😢',
  ':-(': '😢',
  ':D': '😄',
  ':-D': '😄',
  ';)': '😉',
  ';-)': '😉',
  ':P': '😛',
  ':-P': '😛',
  ':p': '😛',
  ':-p': '😛',
  ':O': '😮',
  ':-O': '😮',
  ':o': '😮',
  ':-o': '😮',
  '<3': '❤️',
  '</3': '💔',
  ':*': '😘',
  ':-*': '😘',
  'XD': '😆',
  'xD': '😆',
  'xd': '😆',
  '^^': '😊',
  '-_-': '😑',
  ':3': '😺',
  ':\'(': '😭',
  'B)': '😎',
  'B-)': '😎',
  ':thinking:': '🤔',
  ':fire:': '🔥',
  ':heart:': '❤️',
  ':star:': '⭐',
  ':sword:': '⚔️',
  ':shield:': '🛡️',
  ':crown:': '👑',
  ':gem:': '💎',
  ':gold:': '🪙',
  ':skull:': '💀',
  ':thumbsup:': '👍',
  ':thumbsdown:': '👎',
  ':wave:': '👋',
  ':clap:': '👏',
  ':muscle:': '💪',
  ':crossed_swords:': '⚔️',
  ':castle:': '🏰',
  ':tree:': '🌲',
  ':mountain:': '⛰️',
  ':water:': '💧',
  ':hammer:': '🔨',
  ':axe:': '🪓',
  ':pickaxe:': '⛏️'
};

// Convert emoticons to emojis
function convertEmojis(text) {
  if (!text) return text;
  
  let result = text;
  
  // Sort by length descending to match longer patterns first
  const sortedKeys = Object.keys(emojiMap).sort((a, b) => b.length - a.length);
  
  for (const emoticon of sortedKeys) {
    // Escape special regex characters
    const escaped = emoticon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    result = result.replace(regex, emojiMap[emoticon]);
  }
  
  return result;
}

// Get all messages for current user (inbox)
router.get('/inbox', authenticateToken, async (req, res) => {
  try {
    const messages = await db.all(`
      SELECT m.*, u.username as sender_name, u.avatar_path as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.recipient_id = ?
      ORDER BY m.created_at DESC
    `, [req.user.id]);
    
    res.json(messages);
  } catch (error) {
    console.error('Error fetching inbox:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Nachrichten' });
  }
});

// Get sent messages
router.get('/sent', authenticateToken, async (req, res) => {
  try {
    const messages = await db.all(`
      SELECT m.*, u.username as recipient_name, u.avatar_path as recipient_avatar
      FROM messages m
      JOIN users u ON m.recipient_id = u.id
      WHERE m.sender_id = ?
      ORDER BY m.created_at DESC
    `, [req.user.id]);
    
    res.json(messages);
  } catch (error) {
    console.error('Error fetching sent messages:', error);
    res.status(500).json({ error: 'Fehler beim Laden der gesendeten Nachrichten' });
  }
});

// Get unread count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const result = await db.get(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE recipient_id = ? AND is_read = 0
    `, [req.user.id]);
    
    res.json({ count: result.count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Anzahl' });
  }
});

// Get single message
router.get('/:messageId', authenticateToken, async (req, res) => {
  try {
    const message = await db.get(`
      SELECT m.*, 
        sender.username as sender_name, sender.avatar_path as sender_avatar,
        recipient.username as recipient_name, recipient.avatar_path as recipient_avatar
      FROM messages m
      JOIN users sender ON m.sender_id = sender.id
      JOIN users recipient ON m.recipient_id = recipient.id
      WHERE m.id = ? AND (m.recipient_id = ? OR m.sender_id = ?)
    `, [req.params.messageId, req.user.id, req.user.id]);
    
    if (!message) {
      return res.status(404).json({ error: 'Nachricht nicht gefunden' });
    }
    
    // Mark as read if recipient is viewing
    if (message.recipient_id === req.user.id && !message.is_read) {
      await db.run(`
        UPDATE messages 
        SET is_read = 1, read_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [req.params.messageId]);
      message.is_read = 1;
    }
    
    res.json(message);
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Nachricht' });
  }
});

// Send a new message
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { recipient_id, recipient_username, subject, content } = req.body;
    
    // Find recipient by ID or username
    let recipient;
    if (recipient_id) {
      recipient = await db.get('SELECT id, username FROM users WHERE id = ?', [recipient_id]);
    } else if (recipient_username) {
      recipient = await db.get('SELECT id, username FROM users WHERE username = ?', [recipient_username]);
    }
    
    if (!recipient) {
      return res.status(404).json({ error: 'Empfänger nicht gefunden' });
    }
    
    if (recipient.id === req.user.id) {
      return res.status(400).json({ error: 'Du kannst dir nicht selbst schreiben' });
    }
    
    // Convert emoticons to emojis in subject and content
    const processedSubject = convertEmojis(subject);
    const processedContent = convertEmojis(content);
    
    const result = await db.run(`
      INSERT INTO messages (sender_id, recipient_id, subject, content, message_type)
      VALUES (?, ?, ?, ?, 'personal')
    `, [req.user.id, recipient.id, processedSubject, processedContent]);
    
    res.status(201).json({ 
      message: 'Nachricht gesendet',
      id: result.lastID
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Fehler beim Senden der Nachricht' });
  }
});

// Mark message as read
router.put('/:messageId/read', authenticateToken, async (req, res) => {
  try {
    const result = await db.run(`
      UPDATE messages 
      SET is_read = 1, read_at = CURRENT_TIMESTAMP
      WHERE id = ? AND recipient_id = ?
    `, [req.params.messageId, req.user.id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Nachricht nicht gefunden' });
    }
    
    res.json({ message: 'Als gelesen markiert' });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren' });
  }
});

// Mark all messages as read
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await db.run(`
      UPDATE messages 
      SET is_read = 1, read_at = CURRENT_TIMESTAMP
      WHERE recipient_id = ? AND is_read = 0
    `, [req.user.id]);
    
    res.json({ message: 'Alle Nachrichten als gelesen markiert' });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren' });
  }
});

// Delete a message
router.delete('/:messageId', authenticateToken, async (req, res) => {
  try {
    // Only allow deleting messages where user is sender or recipient
    const result = await db.run(`
      DELETE FROM messages 
      WHERE id = ? AND (sender_id = ? OR recipient_id = ?)
    `, [req.params.messageId, req.user.id, req.user.id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Nachricht nicht gefunden' });
    }
    
    res.json({ message: 'Nachricht gelöscht' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
});

// Helper function to send system messages (exported for use in other routes)
export async function sendSystemMessage(recipientId, subject, content, messageType = 'system', relatedId = null) {
  try {
    // Get or create system user
    let systemUser = await db.get('SELECT id FROM users WHERE username = ?', ['System']);
    
    if (!systemUser) {
      // Use the recipient as sender for system messages if no system user exists
      // This is a fallback - ideally create a system user in database init
      const result = await db.run(`
        INSERT OR IGNORE INTO users (username, email, password_hash, role, is_activated)
        VALUES ('System', 'system@soaria.local', 'SYSTEM_NO_LOGIN', 'admin', 1)
      `);
      systemUser = { id: result.lastID || (await db.get('SELECT id FROM users WHERE username = ?', ['System'])).id };
    }
    
    // Convert emojis
    const processedSubject = convertEmojis(subject);
    const processedContent = convertEmojis(content);
    
    await db.run(`
      INSERT INTO messages (sender_id, recipient_id, subject, content, is_system, message_type, related_id)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `, [systemUser.id, recipientId, processedSubject, processedContent, messageType, relatedId]);
    
    return true;
  } catch (error) {
    console.error('Error sending system message:', error);
    return false;
  }
}

export default router;
