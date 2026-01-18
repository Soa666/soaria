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
  const [searchTerm, setSearchTerm] = useState('');
  
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
    if (selectedNpc?.id === npc.id) {
      setSelectedNpc(null);
      setShopItems([]);
      return;
    }
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

  const handleEdit = (npc, e) => {
    e?.stopPropagation();
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

  const handleDelete = async (npc, e) => {
    e?.stopPropagation();
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

  const getNpcTypeName = (type) => {
    switch (type) {
      case 'merchant': return 'Händler';
      case 'quest_giver': return 'Questgeber';
      case 'trainer': return 'Ausbilder';
      default: return type;
    }
  };

  const filteredNpcs = npcs.filter(npc => 
    npc.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    npc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

      {/* Search Bar */}
      <div className="filter-bar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="NPC suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="npc-count">
          {filteredNpcs.length} NPC{filteredNpcs.length !== 1 ? 's' : ''} gefunden
        </div>
      </div>

      {/* NPC Table */}
      <div className="npc-table-container">
        <table className="npc-table">
          <thead>
            <tr>
              <th style={{width: '30px'}}></th>
              <th>Name</th>
              <th>Typ</th>
              <th>Items im Shop</th>
              <th>Auf Karte</th>
              <th style={{width: '100px'}}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filteredNpcs.map(npc => (
              <>
                <tr 
                  key={npc.id} 
                  className={`npc-row ${selectedNpc?.id === npc.id ? 'selected' : ''}`}
                  onClick={() => selectNpc(npc)}
                >
                  <td className="type-icon">{getNpcTypeIcon(npc.npc_type)}</td>
                  <td className="name-cell">
                    <span className="npc-name">{npc.display_name}</span>
                    <span className="npc-internal">{npc.name}</span>
                  </td>
                  <td>
                    <span className={`type-badge ${npc.npc_type}`}>
                      {getNpcTypeName(npc.npc_type)}
                    </span>
                  </td>
                  <td>
                    <span className="item-count">{npc.item_count || 0} Items</span>
                  </td>
                  <td>
                    <span className="spawn-count">{npc.spawn_count || 0}x</span>
                  </td>
                  <td className="action-cell">
                    <button 
                      className="btn-icon btn-edit" 
                      onClick={(e) => handleEdit(npc, e)}
                      title="Bearbeiten"
                    >
                      ✏️
                    </button>
                    <button 
                      className="btn-icon btn-delete" 
                      onClick={(e) => handleDelete(npc, e)}
                      title="Löschen"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
                {selectedNpc?.id === npc.id && (
                  <tr className="shop-row">
                    <td colSpan="6">
                      <div className="shop-panel">
                        <div className="shop-header">
                          <h4>💰 Handelswaren von {npc.display_name}</h4>
                        </div>
                        
                        {npc.description && (
                          <p className="npc-description">{npc.description}</p>
                        )}

                        <div className="shop-content">
                          <div className="shop-list">
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
                                      <td className="item-name">{item.item_name}</td>
                                      <td className="item-type">{item.item_type}</td>
                                      <td className="price buy">
                                        {item.buy_price ? `${item.buy_price} 💰` : <span className="no-price">—</span>}
                                      </td>
                                      <td className="price sell">
                                        {item.sell_price ? `${item.sell_price} 💰` : <span className="no-price">—</span>}
                                      </td>
                                      <td className="stock">
                                        {item.stock === -1 ? <span className="infinite">∞</span> : item.stock}
                                      </td>
                                      <td>
                                        <button 
                                          className="btn-remove-small"
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
                          </div>

                          <div className="item-add-form">
                            <h5>+ Handelsware hinzufügen</h5>
                            <form onSubmit={handleAddItem}>
                              <div className="item-form-grid">
                                <div className="item-field full">
                                  <label>Item</label>
                                  <select
                                    value={itemForm.item_id}
                                    onChange={(e) => setItemForm({...itemForm, item_id: e.target.value})}
                                    required
                                  >
                                    <option value="">Wählen...</option>
                                    {items.map(item => (
                                      <option key={item.id} value={item.id}>
                                        {item.display_name} ({item.type})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="item-field">
                                  <label>Kaufpreis 💰</label>
                                  <input
                                    type="number"
                                    placeholder="z.B. 50"
                                    value={itemForm.buy_price}
                                    onChange={(e) => setItemForm({...itemForm, buy_price: e.target.value})}
                                    min="0"
                                  />
                                </div>
                                <div className="item-field">
                                  <label>Verkaufspreis 💰</label>
                                  <input
                                    type="number"
                                    placeholder="z.B. 15"
                                    value={itemForm.sell_price}
                                    onChange={(e) => setItemForm({...itemForm, sell_price: e.target.value})}
                                    min="0"
                                  />
                                </div>
                                <div className="item-field">
                                  <label>Vorrat</label>
                                  <input
                                    type="number"
                                    placeholder="-1 = ∞"
                                    value={itemForm.stock}
                                    onChange={(e) => setItemForm({...itemForm, stock: parseInt(e.target.value)})}
                                    min="-1"
                                  />
                                </div>
                                <button type="submit" className="btn-add-item">+ Hinzufügen</button>
                              </div>
                            </form>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        
        {filteredNpcs.length === 0 && (
          <div className="no-results">
            Keine NPCs gefunden
          </div>
        )}
      </div>

      {/* Modal for creating/editing NPC */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editMode ? '✏️ NPC bearbeiten' : '➕ Neuer NPC'}</h3>
              <button className="btn-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
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
                  {editMode ? '💾 Speichern' : '✨ Erstellen'}
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
