import { useState, useEffect } from 'react';
import api from '../../services/api';
import './ReportsManagement.css';

function ReportsManagement() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [filter, setFilter] = useState('pending');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const response = await api.get('/admin/message-reports');
      setReports(response.data.reports || []);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (reportId, status) => {
    try {
      await api.put(`/admin/message-reports/${reportId}`, {
        status,
        admin_notes: adminNotes
      });
      
      fetchReports();
      setSelectedReport(null);
      setAdminNotes('');
    } catch (error) {
      alert('Fehler beim Aktualisieren');
    }
  };

  const handleDelete = async (reportId) => {
    if (!confirm('Report wirklich löschen?')) return;
    
    try {
      await api.delete(`/admin/message-reports/${reportId}`);
      fetchReports();
      if (selectedReport?.id === reportId) {
        setSelectedReport(null);
      }
    } catch (error) {
      alert('Fehler beim Löschen');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('de-DE');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending': return <span className="status-badge pending">Ausstehend</span>;
      case 'reviewed': return <span className="status-badge reviewed">Überprüft</span>;
      case 'action_taken': return <span className="status-badge action">Maßnahme ergriffen</span>;
      case 'dismissed': return <span className="status-badge dismissed">Abgewiesen</span>;
      default: return null;
    }
  };

  const filteredReports = filter === 'all' 
    ? reports 
    : reports.filter(r => r.status === filter);

  const pendingCount = reports.filter(r => r.status === 'pending').length;

  if (loading) {
    return <div className="loading">Lädt Meldungen...</div>;
  }

  return (
    <div className="reports-management">
      <h2>🚩 Gemeldete Nachrichten</h2>
      
      {pendingCount > 0 && (
        <div className="pending-alert">
          ⚠️ {pendingCount} Meldung(en) warten auf Überprüfung
        </div>
      )}

      <div className="filter-bar">
        <label>Filter:</label>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="pending">Ausstehend ({reports.filter(r => r.status === 'pending').length})</option>
          <option value="reviewed">Überprüft</option>
          <option value="action_taken">Maßnahme ergriffen</option>
          <option value="dismissed">Abgewiesen</option>
          <option value="all">Alle ({reports.length})</option>
        </select>
      </div>

      {filteredReports.length === 0 ? (
        <div className="no-reports">
          {filter === 'pending' ? 'Keine ausstehenden Meldungen 🎉' : 'Keine Meldungen in dieser Kategorie'}
        </div>
      ) : (
        <div className="reports-list">
          {filteredReports.map(report => (
            <div 
              key={report.id} 
              className={`report-card ${selectedReport?.id === report.id ? 'selected' : ''} ${report.status}`}
              onClick={() => {
                setSelectedReport(report);
                setAdminNotes(report.admin_notes || '');
              }}
            >
              <div className="report-header">
                <div className="report-users">
                  <span className="reporter">👤 {report.reporter_name}</span>
                  <span className="arrow">→</span>
                  <span className="reported">🚩 {report.reported_user_name}</span>
                </div>
                {getStatusBadge(report.status)}
              </div>
              <div className="report-reason">
                <strong>Grund:</strong> {report.reason}
              </div>
              <div className="report-date">
                {formatDate(report.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedReport && (
        <div className="report-detail-overlay" onClick={() => setSelectedReport(null)}>
          <div className="report-detail" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <h3>Meldung #{selectedReport.id}</h3>
              <button className="btn-close" onClick={() => setSelectedReport(null)}>×</button>
            </div>
            
            <div className="detail-content">
              <div className="detail-row">
                <strong>Melder:</strong> {selectedReport.reporter_name}
              </div>
              <div className="detail-row">
                <strong>Gemeldeter User:</strong> {selectedReport.reported_user_name}
              </div>
              <div className="detail-row">
                <strong>Grund:</strong> {selectedReport.reason}
              </div>
              <div className="detail-row">
                <strong>Datum:</strong> {formatDate(selectedReport.created_at)}
              </div>
              <div className="detail-row">
                <strong>Status:</strong> {getStatusBadge(selectedReport.status)}
              </div>
              
              <div className="message-preview">
                <h4>Gemeldete Nachricht:</h4>
                <div className="message-box">
                  <div className="message-subject">
                    <strong>Betreff:</strong> {selectedReport.message_subject}
                  </div>
                  <div className="message-content">
                    {selectedReport.message_content}
                  </div>
                </div>
              </div>

              {selectedReport.admin_notes && selectedReport.status !== 'pending' && (
                <div className="admin-notes-display">
                  <strong>Admin-Notizen:</strong>
                  <p>{selectedReport.admin_notes}</p>
                </div>
              )}

              {selectedReport.status === 'pending' && (
                <div className="review-section">
                  <h4>Meldung bearbeiten:</h4>
                  <div className="form-group">
                    <label>Admin-Notizen (optional):</label>
                    <textarea
                      value={adminNotes}
                      onChange={e => setAdminNotes(e.target.value)}
                      placeholder="Interne Notizen zur Bearbeitung..."
                      rows={3}
                    />
                  </div>
                  <div className="review-actions">
                    <button 
                      className="btn btn-action"
                      onClick={() => handleReview(selectedReport.id, 'action_taken')}
                    >
                      ⚠️ Maßnahme ergriffen
                    </button>
                    <button 
                      className="btn btn-reviewed"
                      onClick={() => handleReview(selectedReport.id, 'reviewed')}
                    >
                      ✓ Überprüft (kein Handlungsbedarf)
                    </button>
                    <button 
                      className="btn btn-dismiss"
                      onClick={() => handleReview(selectedReport.id, 'dismissed')}
                    >
                      ✗ Abweisen
                    </button>
                  </div>
                </div>
              )}

              <div className="detail-actions">
                <button 
                  className="btn btn-delete"
                  onClick={() => handleDelete(selectedReport.id)}
                >
                  🗑️ Report löschen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportsManagement;
