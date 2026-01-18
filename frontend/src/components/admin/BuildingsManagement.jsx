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
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [availableImages, setAvailableImages] = useState([]);

  useEffect(() => {
    fetchBuildings();
    fetchItems();
    fetchAvailableImages();
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

  const fetchAvailableImages = async () => {
    try {
      const response = await api.get('/files/buildings');
      setAvailableImages(response.data.images || []);
    } catch (error) {
      console.error('Fehler beim Laden der Bilder:', error);
    }
  };

  const handleCreateBuilding = async (data) => {
    try {
      await api.post('/admin/buildings', data);
      setMessage('Gebäude erfolgreich erstellt');
      setTimeout(() => setMessage(''), 3000);
      fetchBuildings();
      setShowCreateForm(false);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Erstellen');
      setTimeout(() => setMessage(''), 5000);
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

  const handleDeleteBuilding = async (buildingId) => {
    if (!window.confirm('Gebäude wirklich löschen? Alle Anforderungen werden ebenfalls gelöscht.')) return;
    
    try {
      await api.delete(`/admin/buildings/${buildingId}`);
      setMessage('Gebäude erfolgreich gelöscht');
      setTimeout(() => setMessage(''), 3000);
      fetchBuildings();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Löschen');
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
      await api.put(`/admin/buildings/requirements/${requirementId}`, requirementData);
      setMessage('Anforderung erfolgreich aktualisiert');
      setTimeout(() => setMessage(''), 3000);
      fetchBuildings();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Aktualisieren');
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
      {message && (
        <div className={`message ${message.includes('Fehler') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <div className="buildings-header">
        <h2>🏠 Gebäude ({buildings.length})</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? 'Abbrechen' : '+ Neues Gebäude'}
        </button>
      </div>

      {showCreateForm && (
        <BuildingForm
          availableImages={availableImages}
          onSave={handleCreateBuilding}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      <div className="buildings-grid">
        {buildings.map((building) => (
          <div key={building.id} className="building-card-admin">
            <div className="building-preview">
              {building.image_path ? (
                <img 
                  src={`/buildings/${building.image_path}`} 
                  alt={building.display_name}
                  onError={(e) => { e.target.src = '/items/placeholder-item.png'; }}
                />
              ) : (
                <div className="no-image">🏠</div>
              )}
            </div>
            
            <div className="building-info-admin">
              <h3>{building.display_name}</h3>
              <p className="building-name">({building.name})</p>
              
              <div className="building-stats">
                <span>📊 Max Level: {building.max_level}</span>
                <span>⏱️ Bauzeit: {building.build_duration_minutes} Min</span>
                <span>⬆️ Upgrade: {building.upgrade_duration_minutes} Min</span>
                <span>🔢 Reihenfolge: {building.unlock_order}</span>
              </div>

              {building.description && (
                <p className="building-description">{building.description}</p>
              )}
            </div>

            <div className="building-actions">
              <button
                className="btn btn-small"
                onClick={() => setEditingBuilding(editingBuilding === building.id ? null : building.id)}
              >
                {editingBuilding === building.id ? 'Schließen' : '✏️ Bearbeiten'}
              </button>
              <button
                className="btn btn-small"
                onClick={() => setSelectedBuilding(selectedBuilding === building.id ? null : building.id)}
              >
                {selectedBuilding === building.id ? 'Ausblenden' : '📦 Anforderungen'}
              </button>
              <button
                className="btn btn-small btn-danger"
                onClick={() => handleDeleteBuilding(building.id)}
              >
                🗑️
              </button>
            </div>

            {editingBuilding === building.id && (
              <BuildingForm
                building={building}
                availableImages={availableImages}
                onSave={(data) => handleUpdateBuilding(building.id, data)}
                onCancel={() => setEditingBuilding(null)}
              />
            )}

            {selectedBuilding === building.id && (
              <RequirementsSection
                building={building}
                items={items}
                onAddRequirement={(data) => handleAddRequirement(building.id, data)}
                onUpdateRequirement={handleUpdateRequirement}
                onDeleteRequirement={handleDeleteRequirement}
              />
            )}
          </div>
        ))}
      </div>

      {availableImages.length === 0 && (
        <div className="info-box">
          <p>💡 <strong>Tipp:</strong> Lege Gebäudebilder in den <code>/buildings</code> Ordner, um sie hier auswählen zu können.</p>
        </div>
      )}
    </div>
  );
}

function BuildingForm({ building, availableImages, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    name: building?.name || '',
    display_name: building?.display_name || '',
    description: building?.description || '',
    image_path: building?.image_path || '',
    max_level: building?.max_level || 3,
    build_duration_minutes: building?.build_duration_minutes || 5,
    upgrade_duration_minutes: building?.upgrade_duration_minutes || 3,
    unlock_order: building?.unlock_order || 99
  });
  const [showImageSelector, setShowImageSelector] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="building-form">
      <h4>{building ? 'Gebäude bearbeiten' : 'Neues Gebäude erstellen'}</h4>
      
      <div className="form-row">
        <div className="form-group">
          <label>Interner Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="z.B. farm"
            required
            disabled={!!building}
          />
          {building && <small>Name kann nicht geändert werden</small>}
        </div>
        <div className="form-group">
          <label>Anzeigename</label>
          <input
            type="text"
            value={formData.display_name}
            onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
            placeholder="z.B. Bauernhof"
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Max Level</label>
          <input
            type="number"
            min="1"
            value={formData.max_level}
            onChange={(e) => setFormData({ ...formData, max_level: parseInt(e.target.value) || 1 })}
          />
        </div>
        <div className="form-group">
          <label>Bauzeit (Min)</label>
          <input
            type="number"
            min="0"
            value={formData.build_duration_minutes}
            onChange={(e) => setFormData({ ...formData, build_duration_minutes: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className="form-group">
          <label>Upgrade-Zeit (Min)</label>
          <input
            type="number"
            min="0"
            value={formData.upgrade_duration_minutes}
            onChange={(e) => setFormData({ ...formData, upgrade_duration_minutes: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className="form-group">
          <label>Reihenfolge</label>
          <input
            type="number"
            min="0"
            value={formData.unlock_order}
            onChange={(e) => setFormData({ ...formData, unlock_order: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Beschreibung</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows="2"
          placeholder="Beschreibung des Gebäudes..."
        />
      </div>

      <div className="form-group">
        <label>
          Bild
          <button 
            type="button" 
            onClick={() => setShowImageSelector(!showImageSelector)}
            className="btn btn-secondary btn-small"
            style={{ marginLeft: '1rem' }}
          >
            {showImageSelector ? 'Schließen' : 'Bild auswählen'}
          </button>
        </label>
        <input
          type="text"
          value={formData.image_path}
          onChange={(e) => setFormData({ ...formData, image_path: e.target.value })}
          placeholder="dateiname.png"
        />
        
        {formData.image_path && (
          <div className="image-preview">
            <img 
              src={`/buildings/${formData.image_path}`} 
              alt="Vorschau"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        )}

        {showImageSelector && (
          <div className="image-selector">
            <h5>Verfügbare Bilder:</h5>
            {availableImages.length > 0 ? (
              <div className="image-grid">
                {availableImages.map((img) => (
                  <div
                    key={img.filename}
                    className={`image-option ${formData.image_path === img.filename ? 'selected' : ''}`}
                    onClick={() => {
                      setFormData({ ...formData, image_path: img.filename });
                      setShowImageSelector(false);
                    }}
                  >
                    <img 
                      src={`/buildings/${img.filename}`} 
                      alt={img.filename}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <span>{img.filename}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-images">
                Keine Bilder gefunden. Bitte lege Bilder in den <code>/buildings</code> Ordner.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {building ? 'Speichern' : 'Erstellen'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Abbrechen
        </button>
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
    resetForm();
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
    resetForm();
  };

  const resetForm = () => {
    setItemId('');
    setQuantity(1);
    setLevel(0);
    setRequirementType('build');
  };

  const handleCancelEdit = () => {
    setEditingRequirement(null);
    resetForm();
  };

  return (
    <div className="requirements-section">
      <div className="requirements-header">
        <h4>📦 Anforderungen</h4>
        <button
          className="btn btn-small"
          onClick={() => { setShowAddForm(!showAddForm); setEditingRequirement(null); }}
        >
          {showAddForm ? 'Abbrechen' : '+ Hinzufügen'}
        </button>
      </div>

      {(showAddForm || editingRequirement) && (
        <form onSubmit={editingRequirement ? handleUpdate : handleAdd} className="requirement-form">
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
            <button type="submit" className="btn btn-primary btn-small">
              {editingRequirement ? 'Aktualisieren' : 'Hinzufügen'}
            </button>
            <button 
              type="button" 
              className="btn btn-secondary btn-small" 
              onClick={editingRequirement ? handleCancelEdit : () => setShowAddForm(false)}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}

      <div className="requirements-lists">
        <div className="requirements-group">
          <h5>🔨 Bau-Anforderungen</h5>
          {building.build_requirements && building.build_requirements.length > 0 ? (
            <ul>
              {building.build_requirements.map(req => (
                <li key={req.id}>
                  <div className="req-item">
                    {req.image_path && (
                      <img src={`/items/${req.image_path}`} alt={req.display_name} />
                    )}
                    <span>{req.display_name}: {req.quantity}</span>
                  </div>
                  <div className="req-actions">
                    <button className="btn btn-small" onClick={() => handleEdit(req)}>✏️</button>
                    <button className="btn btn-small btn-danger" onClick={() => onDeleteRequirement(req.id)}>🗑️</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-requirements">Keine Bau-Anforderungen</p>
          )}
        </div>

        <div className="requirements-group">
          <h5>⬆️ Upgrade-Anforderungen</h5>
          {building.upgrade_requirements && building.upgrade_requirements.length > 0 ? (
            <ul>
              {building.upgrade_requirements.map(req => (
                <li key={req.id}>
                  <div className="req-item">
                    {req.image_path && (
                      <img src={`/items/${req.image_path}`} alt={req.display_name} />
                    )}
                    <span>Level {req.level || 'alle'}: {req.display_name} x{req.quantity}</span>
                  </div>
                  <div className="req-actions">
                    <button className="btn btn-small" onClick={() => handleEdit(req)}>✏️</button>
                    <button className="btn btn-small btn-danger" onClick={() => onDeleteRequirement(req.id)}>🗑️</button>
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
