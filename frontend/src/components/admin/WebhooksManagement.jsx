import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import './WebhooksManagement.css';

const EVENT_TYPES = [
  { value: 'registration', label: '👤 Registrierung', description: 'Wenn sich ein neuer User registriert', placeholders: ['{{username}}', '{{email}}'] },
  { value: 'feedback', label: '💬 Feedback', description: 'Wenn ein User Feedback/Bug-Report einreicht', placeholders: ['{{icon}}', '{{type}}', '{{username}}', '{{title}}', '{{description}}'] },
  { value: 'achievement', label: '🏆 Erfolge', description: 'Wenn ein Spieler einen Erfolg freischaltet', placeholders: ['{{username}}', '{{achievement}}', '{{description}}', '{{reward_gold}}', '{{reward_exp}}'] },
  { value: 'buff_activated', label: '✨ Buff aktiviert', description: 'Wenn ein Buff aktiviert wird', placeholders: ['{{buff_name}}', '{{buff_icon}}', '{{target}}', '{{duration}}', '{{stacks}}', '{{created_by}}'] },
  { value: 'buff_expired', label: '⏰ Buff abgelaufen', description: 'Wenn ein Buff abgelaufen ist', placeholders: ['{{buff_name}}', '{{buff_icon}}', '{{target}}', '{{stacks}}'] },
];

const DEFAULT_TEMPLATES = {
  registration: '🎮 **Neue Registrierung!**\n\n**Benutzername:** {{username}}\n**E-Mail:** {{email}}',
  feedback: '{{icon}} **Neues Feedback: {{type}}**\n\n**Von:** {{username}}\n**Titel:** {{title}}\n\n**Beschreibung:**\n{{description}}',
  achievement: '🎊🎉 **Erfolg freigeschaltet!** 🎉🎊\n\n**{{username}}** hat den Erfolg erhalten:\n🏆 **{{achievement}}**\n\n_{{description}}_',
  buff_activated: '✨ **{{buff_name}}** ist jetzt aktiv für **{{target}}**!\n\n⏱️ Dauer: {{duration}}\n📊 Stacks: {{stacks}}\n👤 Aktiviert von: {{created_by}}',
  buff_expired: '⏰ **{{buff_name}}** ist vorbei für **{{target}}**!'
};

function WebhooksManagement() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [selectedEventType, setSelectedEventType] = useState('registration');
  const [templateText, setTemplateText] = useState('');
  const templateTextareaRef = useRef(null);

  useEffect(() => {
    fetchWebhooks();
  }, []);

  useEffect(() => {
    if (message || error) {
      const timer = setTimeout(() => {
        setMessage('');
        setError('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message, error]);

  const fetchWebhooks = async () => {
    try {
      const response = await api.get('/admin/discord-webhooks');
      setWebhooks(response.data.webhooks || []);
    } catch (error) {
      console.error('Fehler beim Laden der Webhooks:', error);
      setError('Fehler beim Laden der Webhooks');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWebhook = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const formData = new FormData(e.target);
    const name = formData.get('name');
    const webhook_url = formData.get('webhook_url');
    const event_type = formData.get('event_type');
    const message_template = templateText || formData.get('message_template') || DEFAULT_TEMPLATES[event_type] || '';
    const enabled = formData.get('enabled') === 'on' ? 1 : 0;

    try {
      if (editingWebhook && editingWebhook.id) {
        await api.put(`/admin/discord-webhooks/${editingWebhook.id}`, {
          name, webhook_url, event_type, message_template, enabled
        });
        setMessage('Webhook aktualisiert');
      } else {
        await api.post('/admin/discord-webhooks', {
          name, webhook_url, event_type, message_template, enabled
        });
        setMessage('Webhook erstellt');
      }
      setEditingWebhook(null);
      setTemplateText('');
      await fetchWebhooks();
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  const handleDeleteWebhook = async (id) => {
    if (!window.confirm('Möchtest du diesen Webhook wirklich löschen?')) return;

    try {
      await api.delete(`/admin/discord-webhooks/${id}`);
      setMessage('Webhook gelöscht');
      fetchWebhooks();
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Löschen');
    }
  };

  const handleTestWebhook = async (id) => {
    try {
      await api.post(`/admin/discord-webhooks/${id}/test`);
      setMessage('Test-Nachricht gesendet!');
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Senden der Test-Nachricht');
    }
  };

  const handleNewWebhook = () => {
    setSelectedEventType('registration');
    const defaultTemplate = DEFAULT_TEMPLATES['registration'] || '';
    setTemplateText(defaultTemplate);
    setEditingWebhook({
      event_type: 'registration',
      message_template: defaultTemplate
    });
  };

  const handleEventTypeChange = (e) => {
    const newType = e.target.value;
    setSelectedEventType(newType);
    const newTemplate = DEFAULT_TEMPLATES[newType] || '';
    if (editingWebhook && !editingWebhook.id) {
      setEditingWebhook({
        ...editingWebhook,
        event_type: newType,
        message_template: newTemplate
      });
    }
    setTemplateText(newTemplate);
  };

  const handleInsertPlaceholder = (placeholder) => {
    if (!templateTextareaRef.current) return;
    
    const textarea = templateTextareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = templateText;
    
    // Insert placeholder at cursor position
    const newText = text.substring(0, start) + placeholder + text.substring(end);
    setTemplateText(newText);
    
    // Set cursor position after inserted placeholder
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + placeholder.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const getEventTypeInfo = (type) => EVENT_TYPES.find(t => t.value === type);

  if (loading) {
    return <div className="loading">Lädt...</div>;
  }

  return (
    <div className="webhooks-management">
      <div className="webhooks-header">
        <div>
          <h2>🔔 Discord Webhooks</h2>
          <p className="header-description">
            Erhalte Benachrichtigungen in Discord wenn bestimmte Events im Spiel passieren.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleNewWebhook}>
          + Neuer Webhook
        </button>
      </div>

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}

      {/* Event Types Info */}
      <div className="event-types-info">
        <h3>Verfügbare Events</h3>
        <div className="event-types-grid">
          {EVENT_TYPES.map(type => (
            <div key={type.value} className="event-type-card">
              <div className="event-type-label">{type.label}</div>
              <div className="event-type-desc">{type.description}</div>
              <div className="event-type-placeholders">
                {type.placeholders.map(p => (
                  <code key={p}>{p}</code>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit/Create Form */}
      {editingWebhook && (
        <div className="webhook-form-card">
          <h3>{editingWebhook.id ? '✏️ Webhook bearbeiten' : '➕ Neuer Webhook'}</h3>
          <form onSubmit={handleSaveWebhook}>
            <div className="form-row">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingWebhook.name || ''}
                  required
                  placeholder="z.B. Feedback-Benachrichtigung"
                />
              </div>

              <div className="form-group">
                <label>Event-Type</label>
                <select 
                  name="event_type" 
                  value={editingWebhook.event_type || selectedEventType}
                  onChange={handleEventTypeChange}
                  required
                >
                  {EVENT_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Discord Webhook-URL</label>
              <input
                type="url"
                name="webhook_url"
                defaultValue={editingWebhook.webhook_url || ''}
                required
                placeholder="https://discord.com/api/webhooks/..."
              />
              <small>
                Erstelle einen Webhook in deinem Discord-Server unter: Server-Einstellungen → Integrationen → Webhooks
              </small>
            </div>

            <div className="form-group">
              <label>Nachricht-Template</label>
              <textarea
                ref={templateTextareaRef}
                name="message_template"
                rows="6"
                value={templateText}
                onChange={(e) => setTemplateText(e.target.value)}
                placeholder="Discord-Nachricht mit Platzhaltern"
                className="code-textarea"
              />
              <small>
                Verfügbare Platzhalter für {getEventTypeInfo(editingWebhook.event_type || selectedEventType)?.label}:{' '}
                {getEventTypeInfo(editingWebhook.event_type || selectedEventType)?.placeholders.map((p, idx) => (
                  <code 
                    key={p}
                    className="placeholder-tag"
                    onClick={() => handleInsertPlaceholder(p)}
                    title="Klicken zum Einfügen"
                  >
                    {p}
                  </code>
                )).reduce((acc, el, idx, arr) => {
                  if (idx < arr.length - 1) {
                    return [...acc, el, ', '];
                  }
                  return [...acc, el];
                }, [])}
              </small>
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={editingWebhook.enabled !== 0}
                />
                <span>Webhook aktiviert</span>
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingWebhook.id ? '💾 Speichern' : '✅ Erstellen'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingWebhook(null)}>
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Webhooks List */}
      <div className="webhooks-list">
        <h3>Konfigurierte Webhooks</h3>
        
        {webhooks.length === 0 ? (
          <div className="no-webhooks">
            <p>🔕 Keine Webhooks konfiguriert</p>
            <p>Erstelle einen Webhook um Discord-Benachrichtigungen zu erhalten.</p>
          </div>
        ) : (
          webhooks.map(webhook => (
            <div key={webhook.id} className={`webhook-card ${webhook.enabled ? 'enabled' : 'disabled'}`}>
              <div className="webhook-card-header">
                <div className="webhook-info">
                  <h4>{webhook.name}</h4>
                  <div className="webhook-meta">
                    <span className={`status-badge ${webhook.enabled ? 'active' : 'inactive'}`}>
                      {webhook.enabled ? '✓ Aktiv' : '✗ Inaktiv'}
                    </span>
                    <span className="event-badge">
                      {getEventTypeInfo(webhook.event_type)?.label || webhook.event_type}
                    </span>
                  </div>
                </div>
                <div className="webhook-actions">
                  {webhook.enabled === 1 && (
                    <button className="btn btn-sm btn-secondary" onClick={() => handleTestWebhook(webhook.id)}>
                      🔔 Testen
                    </button>
                  )}
                  <button className="btn btn-sm btn-secondary" onClick={() => {
                    const eventType = webhook.event_type || 'registration';
                    const template = webhook.message_template || DEFAULT_TEMPLATES[eventType] || '';
                    setEditingWebhook(webhook);
                    setSelectedEventType(eventType);
                    setTemplateText(template);
                  }}>
                    ✏️ Bearbeiten
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteWebhook(webhook.id)}>
                    🗑️
                  </button>
                </div>
              </div>
              
              <div className="webhook-details">
                <div className="webhook-url">
                  <strong>URL:</strong>
                  <code>{webhook.webhook_url.substring(0, 60)}...</code>
                </div>
                {webhook.message_template && (
                  <div className="webhook-template">
                    <strong>Template:</strong>
                    <pre>{webhook.message_template}</pre>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default WebhooksManagement;
