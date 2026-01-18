import { useState, useEffect } from 'react';
import api from '../../services/api';

function GroupsManagement() {
  const [groups, setGroups] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editingGroup, setEditingGroup] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    description: '',
    permission_ids: []
  });

  useEffect(() => {
    fetchGroups();
    fetchPermissions();
  }, []);

  const fetchGroups = async () => {
    try {
      const response = await api.get('/groups');
      setGroups(response.data.groups || []);
    } catch (error) {
      console.error('Fehler beim Laden der Gruppen:', error);
      setMessage('Fehler beim Laden der Gruppen');
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      const response = await api.get('/groups/permissions');
      setPermissions(response.data.permissions || []);
    } catch (error) {
      console.error('Fehler beim Laden der Berechtigungen:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    try {
      if (editingGroup) {
        await api.put(`/groups/${editingGroup.id}`, formData);
        setMessage('Gruppe erfolgreich aktualisiert!');
      } else {
        await api.post('/groups', formData);
        setMessage('Gruppe erfolgreich erstellt!');
      }
      
      setFormData({
        name: '',
        display_name: '',
        description: '',
        permission_ids: []
      });
      setEditingGroup(null);
      fetchGroups();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  const handleEdit = (group) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      display_name: group.display_name,
      description: group.description || '',
      permission_ids: group.permissions ? group.permissions.map(p => p.id) : []
    });
  };

  const handleCancel = () => {
    setEditingGroup(null);
    setFormData({
      name: '',
      display_name: '',
      description: '',
      permission_ids: []
    });
  };

  const togglePermission = (permId) => {
    const newPerms = formData.permission_ids.includes(permId)
      ? formData.permission_ids.filter(id => id !== permId)
      : [...formData.permission_ids, permId];
    setFormData({ ...formData, permission_ids: newPerms });
  };

  const handleDelete = async (groupId, groupName) => {
    if (!window.confirm(`Möchtest du die Gruppe "${groupName}" wirklich löschen?`)) {
      return;
    }

    try {
      await api.delete(`/groups/${groupId}`);
      setMessage('Gruppe erfolgreich gelöscht');
      fetchGroups();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Löschen');
    }
  };

  if (loading) {
    return <div className="loading">Lädt...</div>;
  }

  return (
    <div className="admin-section">
      <h2>{editingGroup ? 'Gruppe bearbeiten' : 'Neue Gruppe erstellen'}</h2>
      
      {message && (
        <div className={message.includes('Fehler') ? 'error' : 'success'}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="admin-form">
        <div className="form-row">
          <div className="form-group">
            <label>Name (intern, z.B. "editor")</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={!!editingGroup}
              placeholder="editor"
            />
            {editingGroup && <small>Name kann nicht geändert werden</small>}
          </div>
          <div className="form-group">
            <label>Display-Name (angezeigt)</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              required
              placeholder="Editor"
            />
          </div>
        </div>

        <div className="form-row full">
          <div className="form-group">
            <label>Beschreibung</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows="3"
              placeholder="Beschreibung der Gruppe..."
            />
          </div>
        </div>

        <div className="form-row full">
          <div className="form-group">
            <label><strong>Berechtigungen:</strong></label>
            <div className="permissions-grid">
              {permissions.map((perm) => (
                <label key={perm.id} className="permission-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.permission_ids.includes(perm.id)}
                    onChange={() => togglePermission(perm.id)}
                  />
                  <div>
                    <strong>{perm.display_name}</strong>
                    <small>{perm.description}</small>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button type="submit" className="btn btn-primary">
            {editingGroup ? 'Aktualisieren' : 'Gruppe erstellen'}
          </button>
          {editingGroup && (
            <button type="button" onClick={handleCancel} className="btn btn-secondary">
              Abbrechen
            </button>
          )}
        </div>
      </form>

      <h2>Alle Gruppen ({groups.length})</h2>
      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Display-Name</th>
            <th>Berechtigungen</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.id}>
              <td>{group.id}</td>
              <td><code>{group.name}</code></td>
              <td>{group.display_name}</td>
              <td>
                {group.permissions && group.permissions.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                    {group.permissions.map((perm) => (
                      <li key={perm.id}>{perm.display_name}</li>
                    ))}
                  </ul>
                ) : (
                  <span style={{ color: '#999' }}>Keine</span>
                )}
              </td>
              <td>
                <div className="actions">
                  <button
                    onClick={() => handleEdit(group)}
                    className="btn btn-secondary btn-small"
                  >
                    Bearbeiten
                  </button>
                  {!['admin', 'mod', 'vip', 'user'].includes(group.name) && (
                    <button
                      onClick={() => handleDelete(group.id, group.display_name)}
                      className="btn btn-danger btn-small"
                    >
                      Löschen
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default GroupsManagement;
