import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import './PropertyManagement.css';

function PropertyManagement() {
  const [settings, setSettings] = useState({ image_path: '/buildings/huette1.jpg' });
  const [hotspots, setHotspots] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedHotspot, setSelectedHotspot] = useState(null);
  const [editingHotspot, setEditingHotspot] = useState(null);
  const [buildings, setBuildings] = useState([]);
  
  const imageRef = useRef(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    fetchData();
    fetchBuildings();
    fetchAvailableImages();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const fetchData = async () => {
    try {
      const response = await api.get('/admin/property');
      console.log('[PROPERTY] Fetched data:', response.data);
      setSettings(response.data.settings || { image_path: '/buildings/huette1.jpg' });
      const fetchedHotspots = response.data.hotspots || [];
      console.log('[PROPERTY] Fetched hotspots:', fetchedHotspots.length);
      setHotspots(fetchedHotspots);
    } catch (err) {
      setError('Fehler beim Laden der Grundstück-Einstellungen');
      console.error('Fetch property error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBuildings = async () => {
    try {
      const response = await api.get('/buildings');
      setBuildings(response.data.buildings || []);
    } catch (err) {
      console.error('Fehler beim Laden der Gebäude:', err);
    }
  };

  const fetchAvailableImages = async () => {
    try {
      const response = await api.get('/files/buildings');
      setAvailableImages(response.data.images || []);
    } catch (err) {
      console.error('Fehler beim Laden der Bilder:', err);
    }
  };

  const handleImageLoad = (e) => {
    if (e.target) {
      setImageSize({
        width: e.target.offsetWidth,
        height: e.target.offsetHeight
      });
    }
  };

  const handleImageClick = async (e) => {
    if (!imageRef.current) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    // If editing, update position
    if (editingHotspot) {
      setEditingHotspot({
        ...editingHotspot,
        x,
        y
      });
    } else if (selectedHotspot) {
      // Update selected hotspot position and save immediately
      const updatedHotspot = {
        ...selectedHotspot,
        x,
        y
      };
      setSelectedHotspot(updatedHotspot);
      // Auto-save position change (keep selected)
      try {
        await handleSaveHotspot(updatedHotspot, true);
      } catch (err) {
        console.error('Auto-save position error:', err);
      }
    }
  };

  const handleUpdateImage = async (imagePath) => {
    try {
      await api.put('/admin/property/image', { image_path: imagePath });
      setSettings({ ...settings, image_path: imagePath });
      setMessage('Bild aktualisiert');
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Aktualisieren');
    }
  };

  const handleSaveHotspot = async (hotspot, keepSelected = false) => {
    try {
      console.log('Saving hotspot:', hotspot);
      const response = await api.post('/admin/property/hotspots', hotspot);
      console.log('Save response:', response.data);
      
      // Refresh data to get updated hotspot
      await fetchData();
      
      // If we should keep the hotspot selected (e.g., for position updates)
      if (keepSelected && hotspot.id) {
        // Find the updated hotspot from the refreshed data
        const updatedResponse = await api.get('/admin/property/hotspots');
        const updatedHotspots = updatedResponse.data.hotspots || [];
        const updatedHotspot = updatedHotspots.find(h => h.id === hotspot.id);
        if (updatedHotspot) {
          setSelectedHotspot(updatedHotspot);
          setMessage('Position aktualisiert');
        } else {
          setSelectedHotspot(null);
          setMessage('Hotspot gespeichert');
        }
      } else {
        setEditingHotspot(null);
        setSelectedHotspot(null);
        setMessage('Hotspot gespeichert');
      }
    } catch (err) {
      console.error('Save hotspot error:', err);
      setError(err.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  const handleDeleteHotspot = async (id) => {
    if (!confirm('Hotspot wirklich löschen?')) return;
    
    try {
      await api.delete(`/admin/property/hotspots/${id}`);
      setMessage('Hotspot gelöscht');
      fetchData();
      setSelectedHotspot(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Löschen');
    }
  };

  const handleCreateHotspot = () => {
    const newHotspot = {
      building_name: '',
      x: 50,
      y: 50,
      width: 15,
      height: 15,
      label: '',
      icon: '🏗️',
      description: '',
      sort_order: hotspots.length + 1
    };
    setEditingHotspot(newHotspot);
    setSelectedHotspot(null);
  };

  const handleEditHotspot = (hotspot) => {
    setEditingHotspot({ ...hotspot });
    setSelectedHotspot(hotspot);
  };

  const getBuildingIcon = (name) => {
    const icons = {
      'huette': '🏠',
      'werkbank': '🔨',
      'schmiede': '⚒️',
      'saegewerk': '🪚',
      'brunnen': '💧',
      'lager': '📦'
    };
    return icons[name] || '🏗️';
  };

  if (loading) return <div className="loading">Lädt Grundstück-Verwaltung...</div>;

  return (
    <div className="property-management">
      <div className="property-header">
        <h2>🏡 Grundstück-Verwaltung</h2>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="property-content">
        {/* Left: Image Editor */}
        <div className="property-image-section">
          <div className="image-selector">
            <h3>Grundstück-Bild</h3>
            <div className="image-preview-grid">
              {availableImages.map((img, idx) => (
                <div
                  key={idx}
                  className={`image-preview-item ${settings.image_path === img.path ? 'selected' : ''}`}
                  onClick={() => handleUpdateImage(img.path)}
                >
                  <img src={img.path} alt={img.name} />
                  <span>{img.name}</span>
                </div>
              ))}
            </div>
            {availableImages.length === 0 && (
              <p className="no-images">Keine Bilder gefunden. Lege Bilder in den /buildings Ordner.</p>
            )}
          </div>

          <div className="hotspot-editor">
            <div className="editor-header">
              <h3>Hotspots markieren</h3>
              <button className="btn-create-hotspot" onClick={handleCreateHotspot}>
                + Neuer Hotspot
              </button>
            </div>

            <div className="image-container-wrapper">
              <div 
                className="property-image-container"
                onClick={handleImageClick}
              >
                <img
                  ref={imageRef}
                  src={settings.image_path}
                  alt="Grundstück"
                  onLoad={handleImageLoad}
                  className="property-editor-image"
                />
                {hotspots.map((hotspot) => (
                  <div
                    key={hotspot.id}
                    className={`hotspot-marker ${selectedHotspot?.id === hotspot.id ? 'selected' : ''}`}
                    style={{
                      left: `${hotspot.x}%`,
                      top: `${hotspot.y}%`,
                      width: `${hotspot.width}%`,
                      height: `${hotspot.height}%`
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedHotspot(hotspot);
                      setEditingHotspot(null);
                    }}
                    onDragStart={(e) => {
                      e.preventDefault(); // Prevent drag
                    }}
                    title={hotspot.label}
                  >
                    <span className="hotspot-icon">{hotspot.icon || getBuildingIcon(hotspot.building_name)}</span>
                  </div>
                ))}
                {editingHotspot && (
                  <div
                    className="hotspot-marker editing"
                    style={{
                      left: `${editingHotspot.x}%`,
                      top: `${editingHotspot.y}%`,
                      width: `${editingHotspot.width}%`,
                      height: `${editingHotspot.height}%`
                    }}
                  >
                    <span className="hotspot-icon">{editingHotspot.icon || '🏗️'}</span>
                  </div>
                )}
              </div>
            </div>

            <p className="editor-hint">💡 Klicke auf das Bild, um Hotspot-Positionen zu setzen</p>
          </div>
        </div>

        {/* Right: Hotspot Details */}
        <div className="property-details-section">
          {editingHotspot ? (
            <div className="hotspot-form-panel">
              <h3>{editingHotspot.id ? 'Hotspot bearbeiten' : 'Neuer Hotspot'}</h3>
              <form onSubmit={(e) => {
                e.preventDefault();
                handleSaveHotspot(editingHotspot);
              }}>
                <div className="form-group">
                  <label>Gebäude</label>
                  <select
                    value={editingHotspot.building_name}
                    onChange={(e) => setEditingHotspot({...editingHotspot, building_name: e.target.value})}
                    required
                  >
                    <option value="">Wählen...</option>
                    {buildings.map(b => (
                      <option key={b.id} value={b.name}>{b.display_name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Label</label>
                  <input
                    type="text"
                    value={editingHotspot.label}
                    onChange={(e) => setEditingHotspot({...editingHotspot, label: e.target.value})}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Icon</label>
                  <input
                    type="text"
                    value={editingHotspot.icon || ''}
                    onChange={(e) => setEditingHotspot({...editingHotspot, icon: e.target.value})}
                    placeholder="⚒️"
                  />
                </div>

                <div className="form-group">
                  <label>Beschreibung</label>
                  <textarea
                    value={editingHotspot.description || ''}
                    onChange={(e) => setEditingHotspot({...editingHotspot, description: e.target.value})}
                    rows="3"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>X Position (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editingHotspot.x}
                      onChange={(e) => setEditingHotspot({...editingHotspot, x: parseFloat(e.target.value) || 0})}
                      min="0"
                      max="100"
                    />
                  </div>
                  <div className="form-group">
                    <label>Y Position (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editingHotspot.y}
                      onChange={(e) => setEditingHotspot({...editingHotspot, y: parseFloat(e.target.value) || 0})}
                      min="0"
                      max="100"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Breite (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editingHotspot.width}
                      onChange={(e) => setEditingHotspot({...editingHotspot, width: parseFloat(e.target.value) || 0})}
                      min="1"
                      max="100"
                    />
                  </div>
                  <div className="form-group">
                    <label>Höhe (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editingHotspot.height}
                      onChange={(e) => setEditingHotspot({...editingHotspot, height: parseFloat(e.target.value) || 0})}
                      min="1"
                      max="100"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Sortierung</label>
                  <input
                    type="number"
                    value={editingHotspot.sort_order || 0}
                    onChange={(e) => setEditingHotspot({...editingHotspot, sort_order: parseInt(e.target.value) || 0})}
                  />
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn-save">💾 Speichern</button>
                  <button 
                    type="button" 
                    className="btn-cancel"
                    onClick={() => {
                      setEditingHotspot(null);
                      setSelectedHotspot(null);
                    }}
                  >
                    ✕ Abbrechen
                  </button>
                </div>
              </form>
            </div>
          ) : selectedHotspot ? (
            <div className="hotspot-details-panel">
              <h3>Hotspot Details</h3>
              <div className="hotspot-info">
                <p><strong>Gebäude:</strong> {selectedHotspot.building_name}</p>
                <p><strong>Label:</strong> {selectedHotspot.label}</p>
                <p><strong>Position:</strong> {selectedHotspot.x.toFixed(1)}%, {selectedHotspot.y.toFixed(1)}%</p>
                <p><strong>Größe:</strong> {selectedHotspot.width.toFixed(1)}% × {selectedHotspot.height.toFixed(1)}%</p>
                {selectedHotspot.description && (
                  <p><strong>Beschreibung:</strong> {selectedHotspot.description}</p>
                )}
              </div>
              <div className="hotspot-actions">
                <button 
                  className="btn-edit"
                  onClick={() => handleEditHotspot(selectedHotspot)}
                >
                  ✏️ Bearbeiten
                </button>
                <button 
                  className="btn-delete"
                  onClick={() => handleDeleteHotspot(selectedHotspot.id)}
                >
                  🗑️ Löschen
                </button>
              </div>
            </div>
          ) : (
            <div className="hotspot-list-panel">
              <h3>Hotspots ({hotspots.length})</h3>
              <div className="hotspots-list">
                {hotspots.length === 0 ? (
                  <p className="no-hotspots">Keine Hotspots vorhanden. Erstelle einen neuen!</p>
                ) : (
                  hotspots.map((hotspot) => (
                    <div
                      key={hotspot.id}
                      className={`hotspot-list-item ${selectedHotspot?.id === hotspot.id ? 'selected' : ''}`}
                      onClick={() => setSelectedHotspot(hotspot)}
                    >
                      <span className="hotspot-list-icon">{hotspot.icon || getBuildingIcon(hotspot.building_name)}</span>
                      <div className="hotspot-list-info">
                        <span className="hotspot-list-label">{hotspot.label}</span>
                        <span className="hotspot-list-building">{hotspot.building_name}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PropertyManagement;
