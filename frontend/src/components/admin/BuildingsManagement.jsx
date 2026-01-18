import { useState, useEffect } from 'react';
import api from '../../services/api';
import './BuildingsManagement.css';

function BuildingsManagement() {
  const [buildings, setBuildings] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [editingBuilding, setEditingBuilding] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchBuildings();
    fetchItems();
  }, []);

  const fetchBuildings = async () => {
    try {
      const response = await api.get('/admin/buildings');
      setBuildings(response.data.buildings);
    } catch (error) {
      console.error('Fehler beim Laden der Gebäude:', error);
      setMessage('Fehler beim Laden der Gebäude');
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      setItems(response.data.items || []);
    } catch (error) {
      console.error('Fehler beim Laden der Items:', error);
    }
  };

  const handleUpdateBuilding = async (buildingId, data) => {
    try {
      await api.put(`/admin/buildings/${buildingId}`, data);
      setMessage('Gebäude erfolgreich aktualisiert');
      setTimeout(() => setMessage(''), 3000);
      fetchBuildings();
      setEditingBuilding(null);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Aktualisieren');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleAddRequirement = async (buildingId, requirementData) => {
    try {
      await api.post(`/admin/buildings/${buildingId}/requirements`, requirementData);
      setMessage('Anforderung erfolgreich hinzugefügt');
      setTimeout(() => setMessage(''), 3000);
      fetchBuildings();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Hinzufügen');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleUpdateRequirement = async (requirementId, requirementData) => {
    try {
      console.log('Updating requirement:', requirementId, requirementData);
      const response = await api.put(`/admin/buildings/requirements/${requirementId}`, requirementData);
      console.log('Update response:', response.data);
      setMessage('Anforderung erfolgreich aktualisiert');
      setTimeout(() => setMessage(''), 3000);
      fetchBuildings();
    } catch (error) {
      console.error('Update requirement error:', error);
      console.error('Error response:', error.response?.data);
      setMessage(error.response?.data?.error || 'Fehler beim Aktualisieren: ' + (error.message || 'Unbekannter Fehler'));
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleDeleteRequirement = async (requirementId) => {
    if (!window.confirm('Anforderung wirklich löschen?')) return;
    
    try {
      await api.delete(`/admin/buildings/requirements/${requirementId}`);
      setMessage('Anforderung erfolgreich gelöscht');
      setTimeout(() => setMessage(''), 3000);
      fetchBuildings();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Löschen');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  if (loading) {
    return <div className="loading">Lädt...</div>;
  }

  return (
    <div className="buildings-management">
      <h2>Gebäude-Verwaltung</h2>
      
      {message && (
        <div className={message.includes('Fehler') ? 'error' : 'success'}>
          {message}
        </div>
      )}

      <div className="buildings-list-admin">
        {buildings.map((building) => (
          <div key={building.id} className="building-card-admin">
            <div className="building-header">
              <h3>{building.display_name}</h3>
              <button
                className="btn btn-small"
                onClick={() => setEditingBuilding(editingBuilding === building.id ? null : building.id)}
              >
                {editingBuilding === building.id ? 'Abbrechen' : 'Bearbeiten'}
              </button>
            </div>

            {editingBuilding === building.id ? (
              <BuildingEditForm
                building={building}
                onSave={(data) => {
                  handleUpdateBuilding(building.id, data);
                }}
                onCancel={() => setEditingBuilding(null)}
              />
            ) : (
              <div className="building-info">
                <p><strong>Max Level:</strong> {building.max_level}</p>
                <p><strong>Bauzeit:</strong> {building.build_duration_minutes} Minuten</p>
                <p><strong>Upgrade-Zeit:</strong> {building.upgrade_duration_minutes} Minuten</p>
              </div>
            )}

            <RequirementsSection
              building={building}
              items={items}
              onAddRequirement={(data) => handleAddRequirement(building.id, data)}
              onUpdateRequirement={handleUpdateRequirement}
              onDeleteRequirement={handleDeleteRequirement}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function BuildingEditForm({ building, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    build_duration_minutes: building.build_duration_minutes || 5,
    upgrade_duration_minutes: building.upgrade_duration_minutes || 3,
    max_level: building.max_level || 3,
    display_name: building.display_name,
    description: building.description
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="building-edit-form">
      <div className="form-row">
        <div className="form-group">
          <label>Bauzeit (Minuten)</label>
          <input
            type="number"
            min="0"
            value={formData.build_duration_minutes}
            onChange={(e) => setFormData({ ...formData, build_duration_minutes: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className="form-group">
          <label>Upgrade-Zeit (Minuten)</label>
          <input
            type="number"
            min="0"
            value={formData.upgrade_duration_minutes}
            onChange={(e) => setFormData({ ...formData, upgrade_duration_minutes: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className="form-group">
          <label>Max Level</label>
          <input
            type="number"
            min="1"
            value={formData.max_level}
            onChange={(e) => setFormData({ ...formData, max_level: parseInt(e.target.value) || 1 })}
          />
        </div>
      </div>
      <div className="form-group">
        <label>Anzeigename</label>
        <input
          type="text"
          value={formData.display_name}
          onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>Beschreibung</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows="3"
        />
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">Speichern</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Abbrechen</button>
      </div>
    </form>
  );
}

function RequirementsSection({ building, items, onAddRequirement, onUpdateRequirement, onDeleteRequirement }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState(null);
  const [requirementType, setRequirementType] = useState('build');
  const [level, setLevel] = useState(0);
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState(1);

  const handleAdd = (e) => {
    e.preventDefault();
    onAddRequirement({
      item_id: parseInt(itemId),
      quantity: parseInt(quantity),
      level: parseInt(level) || 0,
      requirement_type: requirementType
    });
    setShowAddForm(false);
    setItemId('');
    setQuantity(1);
    setLevel(0);
    setRequirementType('build');
  };

  const handleEdit = (requirement) => {
    setEditingRequirement(requirement);
    setItemId(requirement.item_id.toString());
    setQuantity(requirement.quantity);
    setLevel(requirement.level || 0);
    setRequirementType(requirement.requirement_type || 'build');
    setShowAddForm(false);
  };

  const handleUpdate = (e) => {
    e.preventDefault();
    onUpdateRequirement(editingRequirement.id, {
      item_id: parseInt(itemId),
      quantity: parseInt(quantity),
      level: parseInt(level) || 0,
      requirement_type: requirementType
    });
    setEditingRequirement(null);
    setItemId('');
    setQuantity(1);
    setLevel(0);
    setRequirementType('build');
  };

  const handleCancelEdit = () => {
    setEditingRequirement(null);
    setItemId('');
    setQuantity(1);
    setLevel(0);
    setRequirementType('build');
  };

  const allRequirements = [
    ...(building.build_requirements || []).map(r => ({ ...r, requirement_type: 'build' })),
    ...(building.upgrade_requirements || []).map(r => ({ ...r, requirement_type: 'upgrade' }))
  ];

  return (
    <div className="requirements-section">
      <div className="requirements-header">
        <h4>Anforderungen</h4>
        <button
          className="btn btn-small"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Abbrechen' : '+ Hinzufügen'}
        </button>
      </div>

      {(showAddForm || editingRequirement) && (
        <form onSubmit={editingRequirement ? handleUpdate : handleAdd} className="requirement-add-form">
          <h5>{editingRequirement ? 'Anforderung bearbeiten' : 'Neue Anforderung hinzufügen'}</h5>
          <div className="form-row">
            <div className="form-group">
              <label>Typ</label>
              <select
                value={requirementType}
                onChange={(e) => setRequirementType(e.target.value)}
              >
                <option value="build">Bau</option>
                <option value="upgrade">Upgrade</option>
              </select>
            </div>
            {requirementType === 'upgrade' && (
              <div className="form-group">
                <label>Level (0 = alle)</label>
                <input
                  type="number"
                  min="0"
                  value={level}
                  onChange={(e) => setLevel(parseInt(e.target.value) || 0)}
                />
              </div>
            )}
            <div className="form-group">
              <label>Item</label>
              <select
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                required
              >
                <option value="">-- Wählen --</option>
                {items.map(item => (
                  <option key={item.id} value={item.id}>{item.display_name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Menge</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                required
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {editingRequirement ? 'Aktualisieren' : 'Hinzufügen'}
            </button>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={editingRequirement ? handleCancelEdit : () => setShowAddForm(false)}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}

      <div className="requirements-list">
        <div className="requirements-group">
          <h5>Bau-Anforderungen</h5>
          {building.build_requirements && building.build_requirements.length > 0 ? (
            <ul>
              {building.build_requirements.map(req => (
                <li key={req.id}>
                  <span>{req.display_name}: {req.quantity}</span>
                  <div className="requirement-actions">
                    <button
                      className="btn btn-small"
                      onClick={() => handleEdit(req)}
                    >
                      Bearbeiten
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => onDeleteRequirement(req.id)}
                    >
                      Löschen
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-requirements">Keine Bau-Anforderungen</p>
          )}
        </div>

        <div className="requirements-group">
          <h5>Upgrade-Anforderungen</h5>
          {building.upgrade_requirements && building.upgrade_requirements.length > 0 ? (
            <ul>
              {building.upgrade_requirements.map(req => (
                <li key={req.id}>
                  <span>Level {req.level || 'alle'}: {req.display_name} x{req.quantity}</span>
                  <div className="requirement-actions">
                    <button
                      className="btn btn-small"
                      onClick={() => handleEdit(req)}
                    >
                      Bearbeiten
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => onDeleteRequirement(req.id)}
                    >
                      Löschen
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-requirements">Keine Upgrade-Anforderungen</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default BuildingsManagement;
