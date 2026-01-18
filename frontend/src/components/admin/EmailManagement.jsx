import { useState, useEffect } from 'react';
import api from '../../services/api';
import './EmailManagement.css';

function EmailManagement() {
  const [templates, setTemplates] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('templates'); // 'templates' or 'webhooks'
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingWebhook, setEditingWebhook] = useState(null);

  useEffect(() => {
    fetchTemplates();
    fetchWebhooks();
  }, []);

  // Reload webhooks when switching to webhooks section
  useEffect(() => {
    if (activeSection === 'webhooks') {
      fetchWebhooks();
    }
  }, [activeSection]);

  const fetchTemplates = async () => {
    try {
      const response = await api.get('/admin/email-templates');
      setTemplates(response.data.templates || []);
    } catch (error) {
      console.error('Fehler beim Laden der Templates:', error);
      setError('Fehler beim Laden der Templates');
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhooks = async () => {
    try {
      const response = await api.get('/admin/discord-webhooks');
      console.log('Webhooks API Response:', response.data);
      const webhooksList = response.data.webhooks || [];
      console.log('Webhooks geladen:', webhooksList);
      setWebhooks(webhooksList);
    } catch (error) {
      console.error('Fehler beim Laden der Webhooks:', error);
      console.error('Error details:', error.response?.data);
      if (activeSection === 'webhooks') {
        setError('Fehler beim Laden der Webhooks: ' + (error.response?.data?.error || error.message));
      }
    }
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const formData = new FormData(e.target);
    const name = formData.get('name');
    const subject = formData.get('subject');
    const html_content = formData.get('html_content');
    const text_content = formData.get('text_content');

    try {
      await api.put(`/admin/email-templates/${name}`, {
        subject,
        html_content,
        text_content
      });
      setMessage('Template gespeichert');
      setEditingTemplate(null);
      fetchTemplates();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Speichern');
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
    const message_template = formData.get('message_template');
    const enabled = formData.get('enabled') === 'on' ? 1 : 0;

    console.log('Saving webhook:', { name, webhook_url, event_type, message_template, enabled, editingWebhook });

    try {
      if (editingWebhook && editingWebhook.id) {
        const response = await api.put(`/admin/discord-webhooks/${editingWebhook.id}`, {
          name,
          webhook_url,
          event_type,
          message_template,
          enabled
        });
        console.log('Webhook updated:', response.data);
        setMessage('Webhook aktualisiert');
      } else {
        const response = await api.post('/admin/discord-webhooks', {
          name,
          webhook_url,
          event_type,
          message_template,
          enabled
        });
        console.log('Webhook created:', response.data);
        setMessage('Webhook erstellt');
      }
      setEditingWebhook(null);
      await fetchWebhooks();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error saving webhook:', error);
      setError(error.response?.data?.error || 'Fehler beim Speichern: ' + error.message);
    }
  };

  const handleDeleteWebhook = async (id) => {
    if (!window.confirm('Möchtest du diesen Webhook wirklich löschen?')) {
      return;
    }

    try {
      await api.delete(`/admin/discord-webhooks/${id}`);
      setMessage('Webhook gelöscht');
      fetchWebhooks();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Löschen');
    }
  };

  const handleTestWebhook = async (id) => {
    try {
      await api.post(`/admin/discord-webhooks/${id}/test`);
      setMessage('Test-Nachricht gesendet');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Senden der Test-Nachricht');
    }
  };

  if (loading) {
    return <div className="loading">Lädt...</div>;
  }

  return (
    <div className="email-management">
      <div className="email-management-header">
        <button
          className={`section-tab ${activeSection === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveSection('templates')}
        >
          📧 E-Mail-Templates
        </button>
        <button
          className={`section-tab ${activeSection === 'webhooks' ? 'active' : ''}`}
          onClick={() => setActiveSection('webhooks')}
        >
          🔔 Discord-Webhooks
        </button>
      </div>

      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}

      {activeSection === 'templates' && (
        <div className="templates-section">
          <h2>E-Mail-Templates verwalten</h2>
          <p className="section-description">
            Verwalte die E-Mail-Templates für Aktivierungs-E-Mails. Verwende <code>{'{{username}}'}</code> und <code>{'{{activationUrl}}'}</code> als Platzhalter.
          </p>

          {templates.map((template) => (
            <div key={template.id} className="template-card">
              <div className="template-header">
                <h3>{template.name}</h3>
                <button
                  className="btn btn-secondary"
                  onClick={() => setEditingTemplate(editingTemplate === template.name ? null : template.name)}
                >
                  {editingTemplate === template.name ? 'Abbrechen' : 'Bearbeiten'}
                </button>
              </div>

              {editingTemplate === template.name ? (
                <form onSubmit={handleSaveTemplate}>
                  <input type="hidden" name="name" value={template.name} />
                  
                  <div className="form-group">
                    <label>Betreff</label>
                    <input
                      type="text"
                      name="subject"
                      defaultValue={template.subject}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>HTML-Content</label>
                    <textarea
                      name="html_content"
                      rows="15"
                      defaultValue={template.html_content}
                      required
                      className="code-textarea"
                    />
                  </div>

                  <div className="form-group">
                    <label>Text-Content (optional)</label>
                    <textarea
                      name="text_content"
                      rows="10"
                      defaultValue={template.text_content || ''}
                      className="code-textarea"
                    />
                  </div>

                  <button type="submit" className="btn btn-primary">
                    Speichern
                  </button>
                </form>
              ) : (
                <div className="template-preview">
                  <p><strong>Betreff:</strong> {template.subject}</p>
                  <p><strong>Zuletzt aktualisiert:</strong> {new Date(template.updated_at).toLocaleString('de-DE')}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeSection === 'webhooks' && (
        <div className="webhooks-section">
          <div className="webhooks-header">
            <h2>Discord-Webhooks verwalten</h2>
            <button
              className="btn btn-primary"
              onClick={() => setEditingWebhook({})}
            >
              + Neuer Webhook
            </button>
          </div>

          <p className="section-description">
            Konfiguriere Discord-Webhooks für Benachrichtigungen. Verwende <code>{'{{username}}'}</code> und <code>{'{{email}}'}</code> als Platzhalter in der Nachricht.
          </p>

          {editingWebhook && (
            <div className="webhook-form-card">
              <h3>{editingWebhook.id ? 'Webhook bearbeiten' : 'Neuer Webhook'}</h3>
              <form onSubmit={handleSaveWebhook}>
                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingWebhook.name || ''}
                    required
                    placeholder="z.B. Registrierungs-Benachrichtigung"
                  />
                </div>

                <div className="form-group">
                  <label>Webhook-URL</label>
                  <input
                    type="url"
                    name="webhook_url"
                    defaultValue={editingWebhook.webhook_url || ''}
                    required
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                </div>

                <div className="form-group">
                  <label>Event-Type</label>
                  <select name="event_type" defaultValue={editingWebhook.event_type || 'registration'} required>
                    <option value="registration">Registrierung</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Nachricht-Template</label>
                  <textarea
                    name="message_template"
                    rows="5"
                    defaultValue={editingWebhook.message_template || '🎮 **Neue Registrierung!**\n\n**Benutzername:** {{username}}\n**E-Mail:** {{email}}'}
                    placeholder="Discord-Nachricht mit Platzhaltern"
                    className="code-textarea"
                  />
                  <small>Verfügbare Platzhalter: {'{{username}}'}, {'{{email}}'}</small>
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={editingWebhook.enabled !== undefined ? editingWebhook.enabled === 1 : true}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>Aktiviert</span>
                  </label>
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">
                    {editingWebhook.id ? 'Aktualisieren' : 'Erstellen'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditingWebhook(null)}
                  >
                    Abbrechen
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="webhooks-list">
            {webhooks.length === 0 && !editingWebhook ? (
              <div className="no-webhooks">
                <p>Keine Webhooks konfiguriert</p>
                <p className="hint">Klicke auf "+ Neuer Webhook" um einen Webhook zu erstellen</p>
              </div>
            ) : (
              webhooks.map((webhook) => (
                <div key={webhook.id} className="webhook-card">
                  <div className="webhook-header">
                    <div>
                      <h3>{webhook.name}</h3>
                      <p className="webhook-meta">
                        <span className={`status-badge ${webhook.enabled === 1 ? 'enabled' : 'disabled'}`}>
                          {webhook.enabled === 1 ? '✓ Aktiviert' : '✗ Deaktiviert'}
                        </span>
                        <span>Event: {webhook.event_type}</span>
                      </p>
                    </div>
                    <div className="webhook-actions">
                      {webhook.enabled === 1 && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleTestWebhook(webhook.id)}
                        >
                          Testen
                        </button>
                      )}
                      <button
                        className="btn btn-secondary"
                        onClick={() => setEditingWebhook(webhook)}
                      >
                        Bearbeiten
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDeleteWebhook(webhook.id)}
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                  <div className="webhook-details">
                    <p><strong>URL:</strong> <code className="url-code">{webhook.webhook_url}</code></p>
                    {webhook.message_template && (
                      <div className="message-preview">
                        <strong>Nachricht:</strong>
                        <pre>{webhook.message_template}</pre>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailManagement;
