import { useState, useEffect } from 'react';
import api from '../../services/api';
import './SmtpManagement.css';

function SmtpManagement() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);
  
  const [form, setForm] = useState({
    name: '',
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    from_name: 'Soaria',
    from_email: '',
    is_active: false
  });

  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const response = await api.get('/admin/smtp');
      setConfigs(response.data.configs || []);
    } catch (err) {
      setError('Fehler beim Laden der SMTP-Konfigurationen');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      if (editMode && selectedConfig) {
        await api.put(`/admin/smtp/${selectedConfig.id}`, form);
        setMessage('SMTP-Konfiguration aktualisiert');
      } else {
        await api.post('/admin/smtp', form);
        setMessage('SMTP-Konfiguration erstellt');
      }
      fetchConfigs();
      setShowForm(false);
      resetForm();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  const handleEdit = (config) => {
    setForm({
      name: config.name,
      host: config.host,
      port: config.port,
      secure: config.secure === 1,
      username: config.username,
      password: '', // Don't show password
      from_name: config.from_name || 'Soaria',
      from_email: config.from_email,
      is_active: config.is_active === 1
    });
    setSelectedConfig(config);
    setEditMode(true);
    setShowForm(true);
  };

  const handleDelete = async (config) => {
    if (!window.confirm(`SMTP-Konfiguration "${config.name}" wirklich löschen?`)) return;
    
    try {
      await api.delete(`/admin/smtp/${config.id}`);
      setMessage('SMTP-Konfiguration gelöscht');
      fetchConfigs();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Löschen');
    }
  };

  const handleActivate = async (config) => {
    try {
      await api.post(`/admin/smtp/${config.id}/activate`);
      setMessage(`"${config.name}" ist jetzt aktiv`);
      fetchConfigs();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Aktivieren');
    }
  };

  const handleTest = async (config) => {
    if (!testEmail) {
      setError('Bitte Test-E-Mail-Adresse eingeben');
      return;
    }
    
    setTesting(true);
    setError('');
    setMessage('');
    
    try {
      const response = await api.post(`/admin/smtp/${config.id}/test`, { test_email: testEmail });
      setMessage(response.data.message);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Senden der Test-E-Mail');
    } finally {
      setTesting(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      host: '',
      port: 587,
      secure: false,
      username: '',
      password: '',
      from_name: 'Soaria',
      from_email: '',
      is_active: false
    });
    setEditMode(false);
    setSelectedConfig(null);
  };

  // Preset configurations for common providers
  const presets = [
    { name: 'Gmail', host: 'smtp.gmail.com', port: 587, secure: false },
    { name: 'Outlook', host: 'smtp-mail.outlook.com', port: 587, secure: false },
    { name: 'Yahoo', host: 'smtp.mail.yahoo.com', port: 587, secure: false },
    { name: 'Mailgun', host: 'smtp.mailgun.org', port: 587, secure: false },
    { name: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, secure: false },
  ];

  const applyPreset = (preset) => {
    setForm(prev => ({
      ...prev,
      name: preset.name,
      host: preset.host,
      port: preset.port,
      secure: preset.secure
    }));
  };

  if (loading) return <div className="loading">Lade SMTP-Konfigurationen...</div>;

  return (
    <div className="smtp-management">
      <div className="smtp-header">
        <h2>📧 E-Mail (SMTP) Verwaltung</h2>
        <button 
          className="btn-create"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          + Neue Konfiguration
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="smtp-info">
        <p>💡 Hier kannst du SMTP-Server konfigurieren um E-Mails zu versenden (z.B. Aktivierungsmails).</p>
        <p>Es kann nur eine Konfiguration gleichzeitig aktiv sein.</p>
      </div>

      <div className="smtp-list">
        {configs.length === 0 ? (
          <div className="no-configs">
            <p>Keine SMTP-Konfigurationen vorhanden.</p>
            <p>Erstelle eine neue Konfiguration um E-Mails versenden zu können.</p>
          </div>
        ) : (
          configs.map(config => (
            <div key={config.id} className={`smtp-card ${config.is_active ? 'active' : ''}`}>
              <div className="smtp-card-header">
                <h3>
                  {config.is_active && <span className="active-badge">✓ AKTIV</span>}
                  {config.name}
                </h3>
                <div className="smtp-actions">
                  {!config.is_active && (
                    <button 
                      className="btn-activate"
                      onClick={() => handleActivate(config)}
                      title="Als aktiv setzen"
                    >
                      ✓
                    </button>
                  )}
                  <button onClick={() => handleEdit(config)} title="Bearbeiten">✏️</button>
                  <button onClick={() => handleDelete(config)} title="Löschen">🗑️</button>
                </div>
              </div>
              <div className="smtp-card-body">
                <div className="smtp-detail">
                  <span className="label">Server:</span>
                  <span>{config.host}:{config.port} {config.secure ? '(SSL)' : '(TLS)'}</span>
                </div>
                <div className="smtp-detail">
                  <span className="label">Benutzer:</span>
                  <span>{config.username}</span>
                </div>
                <div className="smtp-detail">
                  <span className="label">Absender:</span>
                  <span>{config.from_name} &lt;{config.from_email}&gt;</span>
                </div>
                
                <div className="smtp-test-section">
                  <div className="test-input-row">
                    <input
                      type="email"
                      placeholder="Test-E-Mail-Adresse eingeben..."
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                    />
                    <button 
                      className="btn-send-test"
                      onClick={() => handleTest(config)}
                      disabled={testing || !testEmail}
                    >
                      {testing ? 'Sende...' : '📧 Test senden'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editMode ? 'SMTP bearbeiten' : 'Neue SMTP-Konfiguration'}</h3>
            
            {!editMode && (
              <div className="presets">
                <span>Schnellauswahl:</span>
                {presets.map(preset => (
                  <button 
                    key={preset.name}
                    type="button"
                    className="btn-preset"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({...form, name: e.target.value})}
                    required
                    placeholder="z.B. Gmail, Firmenserver"
                  />
                </div>
                
                <div className="form-group">
                  <label>SMTP Host *</label>
                  <input
                    type="text"
                    value={form.host}
                    onChange={(e) => setForm({...form, host: e.target.value})}
                    required
                    placeholder="smtp.example.com"
                  />
                </div>

                <div className="form-group">
                  <label>Port</label>
                  <input
                    type="number"
                    value={form.port}
                    onChange={(e) => setForm({...form, port: parseInt(e.target.value)})}
                    placeholder="587"
                  />
                </div>

                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.secure}
                      onChange={(e) => setForm({...form, secure: e.target.checked})}
                    />
                    SSL/TLS (Port 465)
                  </label>
                </div>

                <div className="form-group">
                  <label>Benutzername *</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({...form, username: e.target.value})}
                    required
                    placeholder="user@example.com"
                  />
                </div>

                <div className="form-group">
                  <label>Passwort {editMode ? '(leer = unverändert)' : '*'}</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({...form, password: e.target.value})}
                    required={!editMode}
                    placeholder="••••••••"
                  />
                </div>

                <div className="form-group">
                  <label>Absender-Name</label>
                  <input
                    type="text"
                    value={form.from_name}
                    onChange={(e) => setForm({...form, from_name: e.target.value})}
                    placeholder="Soaria"
                  />
                </div>

                <div className="form-group">
                  <label>Absender-E-Mail *</label>
                  <input
                    type="email"
                    value={form.from_email}
                    onChange={(e) => setForm({...form, from_email: e.target.value})}
                    required
                    placeholder="noreply@example.com"
                  />
                </div>

                <div className="form-group full-width">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({...form, is_active: e.target.checked})}
                    />
                    Als aktive Konfiguration setzen
                  </label>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" onClick={() => setShowForm(false)}>Abbrechen</button>
                <button type="submit" className="btn-primary">
                  {editMode ? 'Speichern' : 'Erstellen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SmtpManagement;
