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

// Category definitions
const categories = [
  { id: 'all', label: '📬 Alle', types: null },
  { id: 'personal', label: '✉️ Spieler', types: ['personal'] },
  { id: 'trade', label: '🤝 Handel', types: ['trade_received', 'trade_sent'] },
  { id: 'combat', label: '⚔️ Kampf', types: ['attack_received', 'attack_sent'] },
  { id: 'guild', label: '🏰 Gilde', types: ['guild_application', 'guild_accepted', 'guild_rejected'] },
  { id: 'system', label: '📢 System', types: ['system'] },
];

function Messages() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('inbox');
  const [activeCategory, setActiveCategory] = useState('all');
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
  
  // Autocomplete state
  const [userSuggestions, setUserSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);
  
  // Report state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);

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

  // Search users for autocomplete
  const searchUsers = async (query) => {
    if (!query || query.length < 1) {
      setUserSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    setSearchingUsers(true);
    try {
      const response = await fetch(`/api/messages/search-users?q=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUserSuggestions(data.users || []);
        setShowSuggestions(data.users && data.users.length > 0);
      }
    } catch (err) {
      console.error('Error searching users:', err);
    } finally {
      setSearchingUsers(false);
    }
  };

  // Debounce user search
  useEffect(() => {
    if (replyTo) return; // Don't search when replying
    
    const timer = setTimeout(() => {
      searchUsers(recipient);
    }, 200);
    
    return () => clearTimeout(timer);
  }, [recipient, replyTo]);

  const selectUser = (user) => {
    setRecipient(user.username);
    setShowSuggestions(false);
    setUserSuggestions([]);
  };

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

  // Filter messages by category
  const filteredMessages = activeCategory === 'all' 
    ? messages 
    : messages.filter(m => {
        const category = categories.find(c => c.id === activeCategory);
        return category?.types?.includes(m.message_type);
      });

  // Count messages per category
  const categoryCounts = categories.reduce((acc, cat) => {
    if (cat.id === 'all') {
      acc[cat.id] = messages.filter(m => !m.is_read).length;
    } else {
      acc[cat.id] = messages.filter(m => !m.is_read && cat.types?.includes(m.message_type)).length;
    }
    return acc;
  }, {});

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

  const handleReport = async () => {
    if (!selectedMessage) return;
    
    setReporting(true);
    try {
      const response = await fetch(`/api/messages/${selectedMessage.id}/report`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: reportReason })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Fehler beim Melden');
      }
      
      alert(data.message);
      setShowReportModal(false);
      setReportReason('');
    } catch (err) {
      alert(err.message);
    } finally {
      setReporting(false);
    }
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
      case 'trade_received': return '📦';
      case 'trade_sent': return '📤';
      case 'attack_received': return '⚔️';
      case 'attack_sent': return '🗡️';
      case 'system': return '📢';
      default: return '✉️';
    }
  };

  const getMessageTypeLabel = (type) => {
    switch (type) {
      case 'guild_application': return 'Gildenbewerbung';
      case 'guild_accepted': return 'Gilde';
      case 'guild_rejected': return 'Gilde';
      case 'trade_received': return 'Handel';
      case 'trade_sent': return 'Handel';
      case 'attack_received': return 'Kampf';
      case 'attack_sent': return 'Kampf';
      case 'system': return 'System';
      default: return 'Nachricht';
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
        {/* Main Tabs */}
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

        {/* Category Tabs (only for inbox) */}
        {activeTab === 'inbox' && (
          <div className="category-tabs">
            {categories.map(cat => (
              <button
                key={cat.id}
                className={`category-tab ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.label}
                {categoryCounts[cat.id] > 0 && (
                  <span className="category-badge">{categoryCounts[cat.id]}</span>
                )}
              </button>
            ))}
          </div>
        )}

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
            ) : filteredMessages.length === 0 ? (
              <div className="no-messages">
                {activeTab === 'inbox' 
                  ? (activeCategory === 'all' ? 'Keine Nachrichten' : `Keine ${categories.find(c => c.id === activeCategory)?.label.split(' ')[1]}-Nachrichten`)
                  : 'Keine gesendeten Nachrichten'}
              </div>
            ) : (
              filteredMessages.map(message => (
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
                      {message.message_type !== 'personal' && (
                        <span className={`type-badge type-${message.message_type}`}>
                          {getMessageTypeLabel(message.message_type)}
                        </span>
                      )}
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
                  <div className="detail-title-row">
                    <span className="detail-icon">{getMessageIcon(selectedMessage.message_type)}</span>
                    <h2>{selectedMessage.subject}</h2>
                  </div>
                  <div className="detail-meta">
                    <span>
                      {activeTab === 'inbox' 
                        ? `Von: ${selectedMessage.sender_name}` 
                        : `An: ${selectedMessage.recipient_name}`
                      }
                    </span>
                    <span>{new Date(selectedMessage.created_at).toLocaleString('de-DE')}</span>
                  </div>
                  {selectedMessage.message_type !== 'personal' && (
                    <div className="detail-type">
                      <span className={`type-badge type-${selectedMessage.message_type}`}>
                        {getMessageTypeLabel(selectedMessage.message_type)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="detail-content">
                  {selectedMessage.content.split('\n').map((line, i) => (
                    <p key={i}>{convertEmojis(line) || '\u00A0'}</p>
                  ))}
                </div>
                <div className="detail-actions">
                  {activeTab === 'inbox' && selectedMessage.sender_name !== 'System' && (
                    <>
                      <button className="btn-reply" onClick={handleReply}>
                        ↩️ Antworten
                      </button>
                      {selectedMessage.message_type === 'personal' && !selectedMessage.is_system && (
                        <button className="btn-report" onClick={() => setShowReportModal(true)}>
                          🚩 Melden
                        </button>
                      )}
                    </>
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
              <div className="form-group recipient-field">
                <label>An:</label>
                <div className="recipient-input-wrapper">
                  <input
                    type="text"
                    value={recipient}
                    onChange={e => setRecipient(e.target.value)}
                    onFocus={() => recipient.length >= 1 && userSuggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="Spielername eingeben..."
                    required
                    disabled={!!replyTo}
                    autoComplete="off"
                  />
                  {searchingUsers && <span className="search-indicator">🔍</span>}
                  
                  {showSuggestions && userSuggestions.length > 0 && (
                    <div className="user-suggestions">
                      {userSuggestions.map(user => (
                        <div 
                          key={user.id} 
                          className="suggestion-item"
                          onMouseDown={() => selectUser(user)}
                        >
                          <div className="suggestion-avatar">
                            {user.avatar_path ? (
                              <img src={`/chars/${user.avatar_path}`} alt="" />
                            ) : (
                              <span>👤</span>
                            )}
                          </div>
                          <span className="suggestion-name">{user.username}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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

      {/* Report Modal */}
      {showReportModal && selectedMessage && (
        <div className="compose-overlay" onClick={() => setShowReportModal(false)}>
          <div className="report-modal" onClick={e => e.stopPropagation()}>
            <div className="compose-header">
              <h2>🚩 Nachricht melden</h2>
              <button className="btn-close" onClick={() => setShowReportModal(false)}>×</button>
            </div>
            <div className="report-content">
              <p>Du meldest eine Nachricht von <strong>{selectedMessage.sender_name}</strong>.</p>
              <p className="report-warning">
                Missbrauch der Meldefunktion kann zu Sanktionen führen. 
                Melde nur Nachrichten, die gegen die Regeln verstoßen.
              </p>
              <div className="form-group">
                <label>Grund für die Meldung:</label>
                <select 
                  value={reportReason} 
                  onChange={e => setReportReason(e.target.value)}
                  required
                >
                  <option value="">-- Bitte wählen --</option>
                  <option value="Beleidigung">Beleidigung</option>
                  <option value="Bedrohung">Bedrohung</option>
                  <option value="Spam">Spam</option>
                  <option value="Betrug">Betrug / Scam</option>
                  <option value="Unangemessener Inhalt">Unangemessener Inhalt</option>
                  <option value="Sonstiges">Sonstiges</option>
                </select>
              </div>
              <div className="compose-actions">
                <button type="button" onClick={() => setShowReportModal(false)}>Abbrechen</button>
                <button 
                  className="btn-report-submit" 
                  onClick={handleReport}
                  disabled={!reportReason || reporting}
                >
                  {reporting ? 'Melden...' : '🚩 Melden'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Messages;
