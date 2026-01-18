import { useState, useEffect } from 'react';
import api from '../../services/api';

function UsersManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/admin/users');
      setUsers(response.data.users || []);
      setMessage('');
    } catch (error) {
      console.error('Fehler beim Laden der User:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Fehler beim Laden der User';
      setMessage(`Fehler: ${errorMsg}`);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId, newRole) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      setMessage(`Rolle erfolgreich auf ${newRole} geändert`);
      fetchUsers();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Ändern der Rolle');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const deleteUser = async (userId, username) => {
    if (!window.confirm(`Möchtest du den Benutzer "${username}" wirklich löschen?`)) {
      return;
    }

    try {
      await api.delete(`/admin/users/${userId}`);
      setMessage(`Benutzer ${username} wurde gelöscht`);
      fetchUsers();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Löschen');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  if (loading) {
    return <div className="loading">Lädt...</div>;
  }

  return (
    <div className="admin-section">
      <h2>User-Verwaltung ({users.length} Benutzer)</h2>
      
      {message && (
        <div className={message.includes('Fehler') || message.includes('403') || message.includes('401') ? 'error' : 'success'}>
          {message}
          {message.includes('403') && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              <strong>Hinweis:</strong> Bitte logge dich einmal aus und wieder ein, damit deine Admin-Rolle aktiv wird.
            </p>
          )}
        </div>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Benutzername</th>
            <th>E-Mail</th>
            <th>Rolle</th>
            <th>Registriert</th>
            <th>Letzter Login</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.id}</td>
              <td>{user.username}</td>
              <td>{user.email}</td>
              <td>
                <select
                  value={user.role}
                  onChange={(e) => updateUserRole(user.id, e.target.value)}
                  className={`role-select role-${user.role}`}
                >
                  <option value="user">User</option>
                  <option value="vip">VIP</option>
                  <option value="mod">Mod</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td>{new Date(user.created_at).toLocaleDateString('de-DE')}</td>
              <td>{user.last_login ? new Date(user.last_login).toLocaleString('de-DE') : 'Nie'}</td>
              <td>
                <div className="actions">
                  <button
                    onClick={() => deleteUser(user.id, user.username)}
                    className="btn btn-danger btn-small"
                    disabled={user.role === 'admin'}
                  >
                    Löschen
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default UsersManagement;
