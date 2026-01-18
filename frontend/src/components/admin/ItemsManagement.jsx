import { useState, useEffect } from 'react';
import api from '../../services/api';

function ItemsManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    type: 'resource',
    description: '',
    rarity: 'common',
    image_path: ''
  });
  const [editingItem, setEditingItem] = useState(null);
  const [availableImages, setAvailableImages] = useState([]);
  const [showImageSelector, setShowImageSelector] = useState(false);

  useEffect(() => {
    fetchItems();
    fetchAvailableImages();
  }, []);

  const fetchAvailableImages = async () => {
    try {
      const response = await api.get('/files/items');
      setAvailableImages(response.data.images || []);
    } catch (error) {
      console.error('Fehler beim Laden der Bilder:', error);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      setItems(response.data.items);
    } catch (error) {
      console.error('Fehler beim Laden der Items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    try {
      if (editingItem) {
        await api.put(`/items/${editingItem.id}`, formData);
        setMessage('Item erfolgreich aktualisiert!');
      } else {
        await api.post('/items', formData);
        setMessage('Item erfolgreich erstellt!');
      }
      
      setFormData({
        name: '',
        display_name: '',
        type: 'resource',
        description: '',
        rarity: 'common',
        image_path: ''
      });
      setEditingItem(null);
      fetchItems();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Speichern des Items');
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      display_name: item.display_name,
      type: item.type,
      description: item.description || '',
      rarity: item.rarity || 'common',
      image_path: item.image_path || ''
    });
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      display_name: '',
      type: 'resource',
      description: '',
      rarity: 'common',
      image_path: ''
    });
  };

  const handleDelete = async (item) => {
    if (!confirm(`Item "${item.display_name}" wirklich löschen?\n\nAchtung: Das Item wird auch aus allen Spieler-Inventaren entfernt!`)) {
      return;
    }

    try {
      const response = await api.delete(`/items/${item.id}`);
      setMessage(response.data.message);
      fetchItems();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Löschen des Items');
    }
  };

  if (loading) {
    return <div className="loading">Lädt...</div>;
  }

  return (
    <div className="admin-section">
      <h2>{editingItem ? 'Item bearbeiten' : 'Neues Item erstellen'}</h2>
      
      {message && (
        <div className={message.includes('Fehler') ? 'error' : 'success'}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="admin-form">
        <div className="form-row">
          <div className="form-group">
            <label>Name (intern, z.B. "holz")</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={!!editingItem}
              placeholder="holz"
            />
            {editingItem && <small>Name kann nicht geändert werden</small>}
          </div>
          <div className="form-group">
            <label>Display-Name (angezeigt)</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              required
              placeholder="Holz"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Typ</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
            >
              <option value="resource">Ressource</option>
              <option value="tool">Werkzeug</option>
              <option value="material">Material</option>
              <option value="upgrade">Upgrade</option>
              <option value="other">Sonstiges</option>
            </select>
          </div>
          <div className="form-group">
            <label>Seltenheit</label>
            <select
              value={formData.rarity}
              onChange={(e) => setFormData({ ...formData, rarity: e.target.value })}
              required
            >
              <option value="common">Common</option>
              <option value="uncommon">Uncommon</option>
              <option value="rare">Rare</option>
              <option value="epic">Epic</option>
              <option value="legendary">Legendary</option>
            </select>
          </div>
        </div>

        <div className="form-row full">
          <div className="form-group">
            <label>Beschreibung (optional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows="3"
              placeholder="Beschreibung des Items..."
            />
          </div>
        </div>

        <div className="form-row full">
          <div className="form-group">
            <label>
              Bild-Pfad
              <button 
                type="button" 
                onClick={() => setShowImageSelector(!showImageSelector)}
                className="btn btn-secondary btn-small"
                style={{ marginLeft: '1rem' }}
              >
                {showImageSelector ? 'Auswahl schließen' : 'Bild auswählen'}
              </button>
            </label>
            <input
              type="text"
              value={formData.image_path}
              onChange={(e) => setFormData({ ...formData, image_path: e.target.value })}
              placeholder="holz.png"
            />
            {formData.image_path && (
              <div style={{ marginTop: '0.5rem' }}>
                <img 
                  src={`/items/${formData.image_path}`} 
                  alt="Vorschau"
                  style={{ 
                    maxWidth: '100px', 
                    maxHeight: '100px', 
                    border: '2px solid #e0e0e0',
                    borderRadius: '4px',
                    padding: '4px'
                  }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            )}
            {showImageSelector && (
              <div className="image-selector">
                <h4>Verfügbare Bilder:</h4>
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
                        src={`/items/${img.filename}`} 
                        alt={img.filename}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <span>{img.filename}</span>
                    </div>
                  ))}
                </div>
                {availableImages.length === 0 && (
                  <p style={{ color: '#999', fontStyle: 'italic' }}>
                    Keine Bilder gefunden. Bitte lege Bilder in den /items Ordner.
                  </p>
                )}
              </div>
            )}
            <small>Bild muss im /items Ordner im Projektverzeichnis liegen</small>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button type="submit" className="btn btn-primary">
            {editingItem ? 'Aktualisieren' : 'Item erstellen'}
          </button>
          {editingItem && (
            <button type="button" onClick={handleCancel} className="btn btn-secondary">
              Abbrechen
            </button>
          )}
        </div>
      </form>

      <h2>Alle Items ({items.length})</h2>
      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Display-Name</th>
            <th>Typ</th>
            <th>Seltenheit</th>
            <th>Bild</th>
            <th>Beschreibung</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td><code>{item.name}</code></td>
              <td>{item.display_name}</td>
              <td>{item.type}</td>
              <td><span className={`rarity-${item.rarity}`}>{item.rarity}</span></td>
              <td>
                {item.image_path ? (
                  <img 
                    src={`/items/${item.image_path}`} 
                    alt={item.display_name}
                    style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <span style={{ color: '#999' }}>Kein Bild</span>
                )}
              </td>
              <td>{item.description || '-'}</td>
              <td>
                <button
                  onClick={() => handleEdit(item)}
                  className="btn btn-secondary btn-small"
                  style={{ marginRight: '0.5rem' }}
                >
                  Bearbeiten
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  className="btn btn-danger btn-small"
                >
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ItemsManagement;
