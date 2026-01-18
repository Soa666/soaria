import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Messages.css';

// Emoji conversion for display (frontend side)
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

function convertEmojis(text) {
  if (!text) return text;
  let result = text;
  const sortedKeys = Object.keys(emojiMap).sort((a, b) => b.length - a.length);
  for (const emoticon of sortedKeys) {
    const escaped = emoticon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    result = result.replace(regex, emojiMap[emoticon]);
  }
  return result;
}

function Messages() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('inbox');
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Compose state
  const [showCompose, setShowCompose] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null);

  // Check for ?to= parameter
  useEffect(() => {
    const toParam = searchParams.get('to');
    if (toParam) {
      setRecipient(toParam);
      setShowCompose(true);
      // Clear the search param
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    fetchMessages();
  }, [activeTab]);

  const fetchMessages = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = activeTab === 'inbox' ? '/api/messages/inbox' : '/api/messages/sent';
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error('Fehler beim Laden');
      
      const data = await response.json();
      setMessages(data);
    } catch (err) {
      setError('Nachrichten konnten nicht geladen werden');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openMessage = async (message) => {
    try {
      const response = await fetch(`/api/messages/${message.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error('Fehler');
      
      const data = await response.json();
      setSelectedMessage(data);
      
      // Update local state to mark as read
      if (activeTab === 'inbox' && !message.is_read) {
        setMessages(prev => prev.map(m => 
          m.id === message.id ? { ...m, is_read: 1 } : m
        ));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const deleteMessage = async (messageId, e) => {
    e?.stopPropagation();
    if (!confirm('Nachricht wirklich löschen?')) return;
    
    try {
      const response = await fetch(`/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error('Fehler');
      
      setMessages(prev => prev.filter(m => m.id !== messageId));
      if (selectedMessage?.id === messageId) {
        setSelectedMessage(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch('/api/messages/read-all', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      setMessages(prev => prev.map(m => ({ ...m, is_read: 1 })));
    } catch (err) {
      console.error(err);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!recipient.trim() || !subject.trim() || !content.trim()) {
      alert('Bitte alle Felder ausfüllen');
      return;
    }
    
    setSending(true);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recipient_username: recipient,
          subject,
          content
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Fehler beim Senden');
      }
      
      // Reset form and show sent tab
      setShowCompose(false);
      setRecipient('');
      setSubject('');
      setContent('');
      setReplyTo(null);
      setActiveTab('sent');
      fetchMessages();
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleReply = () => {
    if (!selectedMessage) return;
    setReplyTo(selectedMessage);
    setRecipient(selectedMessage.sender_name);
    setSubject(`Re: ${selectedMessage.subject.startsWith('Re:') ? selectedMessage.subject.slice(4).trim() : selectedMessage.subject}`);
    setContent(`\n\n---\n${selectedMessage.sender_name} schrieb:\n> ${selectedMessage.content.split('\n').join('\n> ')}`);
    setShowCompose(true);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    // Less than 24 hours ago
    if (diff < 86400000) {
      return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    // Less than 7 days ago
    if (diff < 604800000) {
      return date.toLocaleDateString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    }
    // Older
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getMessageIcon = (type) => {
    switch (type) {
      case 'guild_application': return '📜';
      case 'guild_accepted': return '🎉';
      case 'guild_rejected': return '❌';
      case 'trade_request': return '🤝';
      case 'attack_report': return '⚔️';
      case 'system': return '📢';
      default: return '✉️';
    }
  };

  const unreadCount = messages.filter(m => !m.is_read).length;

  return (
    <div className="messages-page">
      <div className="messages-header">
        <h1>📬 Nachrichten</h1>
        <button className="btn-compose" onClick={() => {
          setShowCompose(true);
          setReplyTo(null);
          setRecipient('');
          setSubject('');
          setContent('');
        }}>
          ✍️ Neue Nachricht
        </button>
      </div>

      <div className="messages-container">
        {/* Tabs */}
        <div className="messages-tabs">
          <button 
            className={`tab ${activeTab === 'inbox' ? 'active' : ''}`}
            onClick={() => { setActiveTab('inbox'); setSelectedMessage(null); }}
          >
            📥 Posteingang {unreadCount > 0 && activeTab === 'inbox' && <span className="badge">{unreadCount}</span>}
          </button>
          <button 
            className={`tab ${activeTab === 'sent' ? 'active' : ''}`}
            onClick={() => { setActiveTab('sent'); setSelectedMessage(null); }}
          >
            📤 Gesendet
          </button>
        </div>

        <div className="messages-content">
          {/* Message List */}
          <div className="messages-list">
            {activeTab === 'inbox' && unreadCount > 0 && (
              <button className="btn-mark-all-read" onClick={markAllAsRead}>
                ✓ Alle als gelesen markieren
              </button>
            )}
            
            {loading ? (
              <div className="loading">Laden...</div>
            ) : error ? (
              <div className="error">{error}</div>
            ) : messages.length === 0 ? (
              <div className="no-messages">
                {activeTab === 'inbox' ? 'Keine Nachrichten' : 'Keine gesendeten Nachrichten'}
              </div>
            ) : (
              messages.map(message => (
                <div 
                  key={message.id}
                  className={`message-item ${!message.is_read && activeTab === 'inbox' ? 'unread' : ''} ${selectedMessage?.id === message.id ? 'selected' : ''}`}
                  onClick={() => openMessage(message)}
                >
                  <div className="message-icon">{getMessageIcon(message.message_type)}</div>
                  <div className="message-info">
                    <div className="message-from">
                      {activeTab === 'inbox' ? message.sender_name : `An: ${message.recipient_name}`}
                      {message.is_system === 1 && <span className="system-badge">System</span>}
                    </div>
                    <div className="message-subject">{message.subject}</div>
                  </div>
                  <div className="message-meta">
                    <span className="message-date">{formatDate(message.created_at)}</span>
                    <button 
                      className="btn-delete-small"
                      onClick={(e) => deleteMessage(message.id, e)}
                      title="Löschen"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Message Detail */}
          <div className="message-detail">
            {selectedMessage ? (
              <>
                <div className="detail-header">
                  <h2>{selectedMessage.subject}</h2>
                  <div className="detail-meta">
                    <span>
                      {activeTab === 'inbox' 
                        ? `Von: ${selectedMessage.sender_name}` 
                        : `An: ${selectedMessage.recipient_name}`
                      }
                    </span>
                    <span>{new Date(selectedMessage.created_at).toLocaleString('de-DE')}</span>
                  </div>
                </div>
                <div className="detail-content">
                  {selectedMessage.content.split('\n').map((line, i) => (
                    <p key={i}>{convertEmojis(line) || '\u00A0'}</p>
                  ))}
                </div>
                <div className="detail-actions">
                  {activeTab === 'inbox' && selectedMessage.sender_name !== 'System' && (
                    <button className="btn-reply" onClick={handleReply}>
                      ↩️ Antworten
                    </button>
                  )}
                  <button className="btn-delete" onClick={(e) => deleteMessage(selectedMessage.id, e)}>
                    🗑️ Löschen
                  </button>
                </div>
              </>
            ) : (
              <div className="no-selection">
                Wähle eine Nachricht aus, um sie zu lesen
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="compose-overlay" onClick={() => setShowCompose(false)}>
          <div className="compose-modal" onClick={e => e.stopPropagation()}>
            <div className="compose-header">
              <h2>{replyTo ? '↩️ Antworten' : '✍️ Neue Nachricht'}</h2>
              <button className="btn-close" onClick={() => setShowCompose(false)}>×</button>
            </div>
            <form onSubmit={sendMessage}>
              <div className="form-group">
                <label>An:</label>
                <input
                  type="text"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  placeholder="Spielername"
                  required
                  disabled={!!replyTo}
                />
              </div>
              <div className="form-group">
                <label>Betreff:</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Betreff"
                  required
                />
              </div>
              <div className="form-group">
                <label>Nachricht:</label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Deine Nachricht... (Emoticons wie :D ;) :P werden zu Emojis)"
                  rows={8}
                  required
                />
              </div>
              <div className="emoji-hint">
                Tipp: :D → 😄, ;) → 😉, :heart: → ❤️, :sword: → ⚔️, :crown: → 👑
              </div>
              <div className="compose-actions">
                <button type="button" onClick={() => setShowCompose(false)}>Abbrechen</button>
                <button type="submit" className="btn-send" disabled={sending}>
                  {sending ? 'Senden...' : '📨 Senden'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Messages;
