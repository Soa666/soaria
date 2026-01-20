import { useState, useEffect } from 'react';
import api from '../../services/api';
import './EmailManagement.css';

function EmailManagement() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingTemplate, setEditingTemplate] = useState(null);

  useEffect(() => {
    fetchTemplates();
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
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  if (loading) {
    return <div className="loading">Lädt...</div>;
  }

  return (
    <div className="email-management">
      <div className="email-management-header">
        <h2>📧 E-Mail-Templates</h2>
        <p className="header-description">
          Verwalte die E-Mail-Templates für Aktivierungs-E-Mails und andere Benachrichtigungen.
        </p>
      </div>

      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}

      <div className="templates-section">
        <p className="section-description">
          Verwende <code>{'{{username}}'}</code> und <code>{'{{activationUrl}}'}</code> als Platzhalter in den Templates.
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
    </div>
  );
}

export default EmailManagement;
