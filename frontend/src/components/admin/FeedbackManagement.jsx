import { useState, useEffect } from 'react';
import api from '../../services/api';
import './FeedbackManagement.css';

const STATUS_LABELS = {
  new: { label: 'Neu', color: '#3b82f6', icon: '🆕' },
  in_progress: { label: 'In Bearbeitung', color: '#f59e0b', icon: '🔧' },
  resolved: { label: 'Erledigt', color: '#22c55e', icon: '✅' },
  wont_fix: { label: 'Wird nicht behoben', color: '#6b7280', icon: '🚫' },
  duplicate: { label: 'Duplikat', color: '#8b5cf6', icon: '📋' }
};

const PRIORITY_LABELS = {
  low: { label: 'Niedrig', color: '#6b7280' },
  normal: { label: 'Normal', color: '#3b82f6' },
  high: { label: 'Hoch', color: '#f59e0b' },
  critical: { label: 'Kritisch', color: '#ef4444' }
};

const TYPE_LABELS = {
  bug: { label: 'Bug', icon: '🐛' },
  suggestion: { label: 'Vorschlag', icon: '💡' },
  other: { label: 'Sonstiges', icon: '📋' }
};

function FeedbackManagement() {
  const [feedback, setFeedback] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchFeedback();
  }, [filterStatus, filterType]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      const response = await api.get('/feedback/admin', {
        params: { status: filterStatus, type: filterType }
      });
      setFeedback(response.data.feedback);
      setCounts(response.data.counts);
    } catch (error) {
      console.error('Fetch feedback error:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateFeedback = async (id, updates) => {
    try {
      await api.put(`/feedback/admin/${id}`, updates);
      setMessage('Feedback aktualisiert');
      fetchFeedback();
      if (selectedFeedback?.id === id) {
        setSelectedFeedback({ ...selectedFeedback, ...updates });
      }
    } catch (error) {
      console.error('Update feedback error:', error);
    }
  };

  const deleteFeedback = async (id) => {
    if (!confirm('Feedback wirklich löschen?')) return;
    try {
      await api.delete(`/feedback/admin/${id}`);
      setMessage('Feedback gelöscht');
      fetchFeedback();
      if (selectedFeedback?.id === id) {
        setSelectedFeedback(null);
      }
    } catch (error) {
      console.error('Delete feedback error:', error);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="feedback-management">
      {message && <div className="feedback-message">{message}</div>}

      {/* Stats */}
      <div className="feedback-stats">
        <div className="stat-card">
          <span className="stat-value">{counts.total || 0}</span>
          <span className="stat-label">Gesamt</span>
        </div>
        <div className="stat-card new">
          <span className="stat-value">{counts.new || 0}</span>
          <span className="stat-label">Neu</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{counts.in_progress || 0}</span>
          <span className="stat-label">In Bearbeitung</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{counts.bugs || 0}</span>
          <span className="stat-label">🐛 Bugs</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{counts.suggestions || 0}</span>
          <span className="stat-label">💡 Vorschläge</span>
        </div>
      </div>

      {/* Filters */}
      <div className="feedback-filters">
        <div className="filter-group">
          <label>Status:</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">Alle</option>
            <option value="new">Neu</option>
            <option value="in_progress">In Bearbeitung</option>
            <option value="resolved">Erledigt</option>
            <option value="wont_fix">Wird nicht behoben</option>
            <option value="duplicate">Duplikat</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Typ:</label>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">Alle</option>
            <option value="bug">🐛 Bugs</option>
            <option value="suggestion">💡 Vorschläge</option>
            <option value="other">📋 Sonstiges</option>
          </select>
        </div>
        <button className="refresh-btn" onClick={fetchFeedback}>🔄 Aktualisieren</button>
      </div>

      <div className="feedback-content">
        {/* List */}
        <div className="feedback-list">
          {loading ? (
            <div className="loading">Lädt...</div>
          ) : feedback.length === 0 ? (
            <div className="no-feedback">Kein Feedback gefunden</div>
          ) : (
            feedback.map(item => (
              <div 
                key={item.id}
                className={`feedback-item ${selectedFeedback?.id === item.id ? 'selected' : ''} ${item.status}`}
                onClick={() => setSelectedFeedback(item)}
              >
                <div className="feedback-item-header">
                  <span className="feedback-type">{TYPE_LABELS[item.type]?.icon}</span>
                  <span className="feedback-title">{item.title}</span>
                  <span 
                    className="feedback-status-badge"
                    style={{ backgroundColor: STATUS_LABELS[item.status]?.color }}
                  >
                    {STATUS_LABELS[item.status]?.label}
                  </span>
                </div>
                <div className="feedback-item-meta">
                  <span>von {item.submitter_name || 'Anonym'}</span>
                  <span>{formatDate(item.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail View */}
        {selectedFeedback && (
          <div className="feedback-detail">
            <div className="detail-header">
              <span className="detail-type">
                {TYPE_LABELS[selectedFeedback.type]?.icon} {TYPE_LABELS[selectedFeedback.type]?.label}
              </span>
              <h3>{selectedFeedback.title}</h3>
            </div>

            <div className="detail-meta">
              <div className="meta-item">
                <strong>Von:</strong> {selectedFeedback.submitter_name || 'Anonym'}
                {selectedFeedback.submitter_email && ` (${selectedFeedback.submitter_email})`}
              </div>
              <div className="meta-item">
                <strong>Erstellt:</strong> {formatDate(selectedFeedback.created_at)}
              </div>
              {selectedFeedback.page_url && (
                <div className="meta-item">
                  <strong>Seite:</strong> {selectedFeedback.page_url}
                </div>
              )}
            </div>

            <div className="detail-description">
              <strong>Beschreibung:</strong>
              <p>{selectedFeedback.description}</p>
            </div>

            {selectedFeedback.browser_info && (
              <div className="detail-browser">
                <strong>Browser:</strong>
                <code>{selectedFeedback.browser_info}</code>
              </div>
            )}

            {/* Actions */}
            <div className="detail-actions">
              <div className="action-group">
                <label>Status:</label>
                <select 
                  value={selectedFeedback.status}
                  onChange={e => updateFeedback(selectedFeedback.id, { status: e.target.value })}
                >
                  {Object.entries(STATUS_LABELS).map(([key, val]) => (
                    <option key={key} value={key}>{val.icon} {val.label}</option>
                  ))}
                </select>
              </div>

              <div className="action-group">
                <label>Priorität:</label>
                <select 
                  value={selectedFeedback.priority}
                  onChange={e => updateFeedback(selectedFeedback.id, { priority: e.target.value })}
                >
                  {Object.entries(PRIORITY_LABELS).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Admin Notes */}
            <div className="detail-notes">
              <label>Admin-Notizen:</label>
              <textarea
                value={selectedFeedback.admin_notes || ''}
                onChange={e => setSelectedFeedback({ ...selectedFeedback, admin_notes: e.target.value })}
                placeholder="Interne Notizen..."
                rows={3}
              />
              <button 
                onClick={() => updateFeedback(selectedFeedback.id, { admin_notes: selectedFeedback.admin_notes })}
              >
                💾 Notizen speichern
              </button>
            </div>

            {selectedFeedback.reviewed_by && (
              <div className="detail-reviewed">
                Zuletzt bearbeitet von {selectedFeedback.reviewer_name} am {formatDate(selectedFeedback.reviewed_at)}
              </div>
            )}

            <button className="delete-btn" onClick={() => deleteFeedback(selectedFeedback.id)}>
              🗑️ Feedback löschen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default FeedbackManagement;
