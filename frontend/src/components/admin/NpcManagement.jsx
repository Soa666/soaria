import { useState, useEffect } from 'react';
import api from '../../services/api';
import './NpcManagement.css';

function NpcManagement() {
  const [npcs, setNpcs] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedNpc, setSelectedNpc] = useState(null);
  const [shopItems, setShopItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    name: '',
    display_name: '',
    description: '',
    npc_type: 'merchant'
  });

  const [itemForm, setItemForm] = useState({
    item_id: '',
    buy_price: '',
    sell_price: '',
    stock: -1
  });

  useEffect(() => {
    fetchNpcs();
    fetchItems();
  }, []);

  const fetchNpcs = async () => {
    try {
      const response = await api.get('/admin/npcs/npcs');
      setNpcs(response.data.npcs || []);
    } catch (err) {
      setError('Fehler beim Laden der NPCs');
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      setItems(response.data.items || []);
    } catch (err) {
      console.error('Fehler beim Laden der Items');
    }
  };

  const selectNpc = async (npc) => {
    setSelectedNpc(npc);
    try {
      const response = await api.get(`/admin/npcs/npcs/${npc.id}`);
      setShopItems(response.data.shopItems || []);
    } catch (err) {
      console.error('Fehler beim Laden der Shop-Items');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      if (editMode && selectedNpc) {
        await api.put(`/admin/npcs/npcs/${selectedNpc.id}`, form);
        setMessage('NPC aktualisiert');
      } else {
        await api.post('/admin/npcs/npcs', form);
        setMessage('NPC erstellt');
      }
      fetchNpcs();
      setShowForm(false);
      resetForm();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  const handleEdit = (npc) => {
    setForm({
      name: npc.name,
      display_name: npc.display_name,
      description: npc.description || '',
      npc_type: npc.npc_type
    });
    setSelectedNpc(npc);
    setEditMode(true);
    setShowForm(true);
  };

  const handleDelete = async (npc) => {
    if (!window.confirm(`NPC "${npc.display_name}" wirklich löschen?`)) return;
    
    try {
      await api.delete(`/admin/npcs/npcs/${npc.id}`);
      setMessage('NPC gelöscht');
      fetchNpcs();
      if (selectedNpc?.id === npc.id) {
        setSelectedNpc(null);
        setShopItems([]);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Löschen');
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!selectedNpc) return;

    try {
      await api.post(`/admin/npcs/npcs/${selectedNpc.id}/items`, {
        ...itemForm,
        buy_price: itemForm.buy_price ? parseInt(itemForm.buy_price) : null,
        sell_price: itemForm.sell_price ? parseInt(itemForm.sell_price) : null
      });
      setMessage('Shop-Item hinzugefügt');
      selectNpc(selectedNpc);
      setItemForm({
        item_id: '',
        buy_price: '',
        sell_price: '',
        stock: -1
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Hinzufügen');
    }
  };

  const handleRemoveItem = async (itemId) => {
    if (!selectedNpc) return;

    try {
      await api.delete(`/admin/npcs/npcs/${selectedNpc.id}/items/${itemId}`);
      setMessage('Shop-Item entfernt');
      selectNpc(selectedNpc);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Entfernen');
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      display_name: '',
      description: '',
      npc_type: 'merchant'
    });
    setEditMode(false);
    setSelectedNpc(null);
  };

  const getNpcTypeIcon = (type) => {
    switch (type) {
      case 'merchant': return '🏪';
      case 'quest_giver': return '❗';
      case 'trainer': return '📚';
      default: return '👤';
    }
  };

  if (loading) return <div className="loading">Lade NPCs...</div>;

  return (
    <div className="npc-management">
      <div className="npc-header">
        <h2>🏪 Händler-Verwaltung</h2>
        <button 
          className="btn-create"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          + Neuer NPC
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="npc-content">
        <div className="npc-list">
          <h3>NPCs ({npcs.length})</h3>
          <div className="npc-items">
            {npcs.map(npc => (
              <div 
                key={npc.id} 
                className={`npc-item ${selectedNpc?.id === npc.id ? 'selected' : ''}`}
                onClick={() => selectNpc(npc)}
              >
                <div className="npc-info">
                  <span className="npc-name">
                    {getNpcTypeIcon(npc.npc_type)} {npc.display_name}
                  </span>
                  <span className="npc-type">{npc.npc_type}</span>
                </div>
                <div className="npc-stats-mini">
                  <span>📦 {npc.item_count} Items</span>
                  <span>🗺️ {npc.spawn_count}x gespawnt</span>
                </div>
                <div className="npc-actions">
                  <button onClick={(e) => { e.stopPropagation(); handleEdit(npc); }}>✏️</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(npc); }}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedNpc && (
          <div className="npc-details">
            <h3>{getNpcTypeIcon(selectedNpc.npc_type)} {selectedNpc.display_name}</h3>
            <p className="description">{selectedNpc.description}</p>
            
            <div className="shop-section">
              <h4>💰 Handelswaren</h4>
              
              {shopItems.length > 0 ? (
                <table className="shop-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Typ</th>
                      <th>Kaufpreis</th>
                      <th>Verkaufspreis</th>
                      <th>Vorrat</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shopItems.map(item => (
                      <tr key={item.id}>
                        <td>{item.item_name}</td>
                        <td className="item-type">{item.item_type}</td>
                        <td className="price buy">{item.buy_price ? `${item.buy_price} 💰` : '-'}</td>
                        <td className="price sell">{item.sell_price ? `${item.sell_price} 💰` : '-'}</td>
                        <td>{item.stock === -1 ? '∞' : item.stock}</td>
                        <td>
                          <button 
                            className="btn-remove"
                            onClick={() => handleRemoveItem(item.item_id)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="no-items">Keine Handelswaren konfiguriert</p>
              )}

              <form className="item-form" onSubmit={handleAddItem}>
                <h5>Handelsware hinzufügen</h5>
                <div className="form-row">
                  <select
                    value={itemForm.item_id}
                    onChange={(e) => setItemForm({...itemForm, item_id: e.target.value})}
                    required
                  >
                    <option value="">Item wählen...</option>
                    {items.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.display_name} ({item.type})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="input-group">
                    <label>Kaufpreis (Spieler kauft)</label>
                    <input
                      type="number"
                      placeholder="z.B. 50"
                      value={itemForm.buy_price}
                      onChange={(e) => setItemForm({...itemForm, buy_price: e.target.value})}
                      min="0"
                    />
                  </div>
                  <div className="input-group">
                    <label>Verkaufspreis (Spieler verkauft)</label>
                    <input
                      type="number"
                      placeholder="z.B. 15"
                      value={itemForm.sell_price}
                      onChange={(e) => setItemForm({...itemForm, sell_price: e.target.value})}
                      min="0"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="input-group">
                    <label>Vorrat (-1 = unendlich)</label>
                    <input
                      type="number"
                      placeholder="-1"
                      value={itemForm.stock}
                      onChange={(e) => setItemForm({...itemForm, stock: parseInt(e.target.value)})}
                      min="-1"
                    />
                  </div>
                  <button type="submit" className="btn-add">+ Hinzufügen</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editMode ? 'NPC bearbeiten' : 'Neuer NPC'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Interner Name*</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({...form, name: e.target.value})}
                    required
                    disabled={editMode}
                    placeholder="z.B. blacksmith"
                  />
                </div>
                <div className="form-group">
                  <label>Anzeigename*</label>
                  <input
                    type="text"
                    value={form.display_name}
                    onChange={(e) => setForm({...form, display_name: e.target.value})}
                    required
                    placeholder="z.B. Schmied Thorin"
                  />
                </div>
                <div className="form-group">
                  <label>NPC-Typ</label>
                  <select
                    value={form.npc_type}
                    onChange={(e) => setForm({...form, npc_type: e.target.value})}
                  >
                    <option value="merchant">🏪 Händler</option>
                    <option value="quest_giver">❗ Questgeber</option>
                    <option value="trainer">📚 Ausbilder</option>
                  </select>
                </div>
                <div className="form-group full-width">
                  <label>Beschreibung</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({...form, description: e.target.value})}
                    placeholder="Beschreibung des NPCs..."
                  />
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

export default NpcManagement;
