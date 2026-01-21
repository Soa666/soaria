import { useState, useEffect } from 'react';
import api from '../../services/api';
import './PlayerInventoryManagement.css';

const QUALITY_OPTIONS = [
  { value: 'poor', label: 'Schlecht', color: '#9d9d9d' },
  { value: 'normal', label: 'Normal', color: '#ffffff' },
  { value: 'good', label: 'Gut', color: '#1eff00' },
  { value: 'excellent', label: 'Exzellent', color: '#0070dd' },
  { value: 'masterwork', label: 'Meisterwerk', color: '#a335ee' },
  { value: 'legendary', label: 'Legendär', color: '#ff8000' }
];

const RARITY_COLORS = {
  common: '#9d9d9d',
  uncommon: '#1eff00',
  rare: '#0070dd',
  epic: '#a335ee',
  legendary: '#ff8000'
};

function PlayerInventoryManagement() {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [allItems, setAllItems] = useState([]);
  const [allEquipmentTypes, setAllEquipmentTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('inventory');
  
  // Add item modal
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [addItemForm, setAddItemForm] = useState({ itemId: '', quantity: 1 });
  
  // Add equipment modal
  const [showAddEquipmentModal, setShowAddEquipmentModal] = useState(false);
  const [addEquipmentForm, setAddEquipmentForm] = useState({ equipmentTypeId: '', quality: 'normal' });

  useEffect(() => {
    fetchUsers();
    fetchItems();
    fetchEquipmentTypes();
  }, []);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/admin/users');
      setUsers(response.data.users || []);
    } catch (error) {
      console.error('Fehler beim Laden der User:', error);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get('/admin/items');
      setAllItems(response.data.items || []);
    } catch (error) {
      console.error('Fehler beim Laden der Items:', error);
    }
  };

  const fetchEquipmentTypes = async () => {
    try {
      const response = await api.get('/admin/equipment-types');
      setAllEquipmentTypes(response.data.equipmentTypes || []);
    } catch (error) {
      console.error('Fehler beim Laden der Equipment-Typen:', error);
    }
  };

  const selectUser = async (user) => {
    setSelectedUser(user);
    setLoading(true);
    try {
      const [invRes, eqRes, statsRes] = await Promise.all([
        api.get(`/admin/users/${user.id}/inventory`),
        api.get(`/admin/users/${user.id}/equipment`),
        api.get(`/admin/users/${user.id}/statistics`)
      ]);
      setInventory(invRes.data.inventory || []);
      setEquipment(eqRes.data.equipment || []);
      setStatistics(statsRes.data.statistics);
      setPlayerStats(statsRes.data.playerStats);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
      showMessage('Fehler beim Laden der Spielerdaten', 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateItemQuantity = async (itemId, newQuantity) => {
    try {
      await api.put(`/admin/users/${selectedUser.id}/inventory/${itemId}`, { quantity: parseInt(newQuantity) });
      showMessage('Menge aktualisiert');
      selectUser(selectedUser);
    } catch (error) {
      showMessage(error.response?.data?.error || 'Fehler beim Aktualisieren', 'error');
    }
  };

  const deleteItem = async (itemId, displayName) => {
    if (!window.confirm(`${displayName} aus dem Inventar entfernen?`)) return;
    try {
      await api.delete(`/admin/users/${selectedUser.id}/inventory/${itemId}`);
      showMessage('Item entfernt');
      selectUser(selectedUser);
    } catch (error) {
      showMessage(error.response?.data?.error || 'Fehler beim Entfernen', 'error');
    }
  };

  const addItem = async () => {
    if (!addItemForm.itemId) {
      showMessage('Bitte ein Item auswählen', 'error');
      return;
    }
    try {
      await api.post(`/admin/users/${selectedUser.id}/inventory`, {
        itemId: parseInt(addItemForm.itemId),
        quantity: parseInt(addItemForm.quantity)
      });
      showMessage('Item hinzugefügt');
      setShowAddItemModal(false);
      setAddItemForm({ itemId: '', quantity: 1 });
      selectUser(selectedUser);
    } catch (error) {
      showMessage(error.response?.data?.error || 'Fehler beim Hinzufügen', 'error');
    }
  };

  const deleteEquipment = async (equipmentId, displayName) => {
    if (!window.confirm(`${displayName} entfernen? Dies kann nicht rückgängig gemacht werden!`)) return;
    try {
      await api.delete(`/admin/users/${selectedUser.id}/equipment/${equipmentId}`);
      showMessage('Ausrüstung entfernt');
      selectUser(selectedUser);
    } catch (error) {
      showMessage(error.response?.data?.error || 'Fehler beim Entfernen', 'error');
    }
  };

  const updateEquipment = async (equipmentId, updates) => {
    try {
      await api.put(`/admin/users/${selectedUser.id}/equipment/${equipmentId}`, updates);
      showMessage('Ausrüstung aktualisiert');
      selectUser(selectedUser);
    } catch (error) {
      showMessage(error.response?.data?.error || 'Fehler beim Aktualisieren', 'error');
    }
  };

  const addEquipment = async () => {
    if (!addEquipmentForm.equipmentTypeId) {
      showMessage('Bitte einen Equipment-Typ auswählen', 'error');
      return;
    }
    try {
      await api.post(`/admin/users/${selectedUser.id}/equipment`, {
        equipmentTypeId: parseInt(addEquipmentForm.equipmentTypeId),
        quality: addEquipmentForm.quality
      });
      showMessage('Ausrüstung hinzugefügt');
      setShowAddEquipmentModal(false);
      setAddEquipmentForm({ equipmentTypeId: '', quality: 'normal' });
      selectUser(selectedUser);
    } catch (error) {
      showMessage(error.response?.data?.error || 'Fehler beim Hinzufügen', 'error');
    }
  };

  const recalculateStats = async () => {
    try {
      const response = await api.post(`/admin/users/${selectedUser.id}/recalculate-stats`);
      showMessage(response.data.message);
      selectUser(selectedUser);
    } catch (error) {
      showMessage(error.response?.data?.error || 'Fehler beim Neuberechnen', 'error');
    }
  };

  const recalculateAllStats = async () => {
    if (!window.confirm('Statistiken für ALLE Benutzer neu berechnen? Das kann einen Moment dauern.')) return;
    try {
      const response = await api.post('/admin/recalculate-all-stats');
      showMessage(response.data.message);
    } catch (error) {
      showMessage(error.response?.data?.error || 'Fehler beim Neuberechnen', 'error');
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group items by category
  const groupedItems = allItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  // Group equipment by slot
  const groupedEquipmentTypes = allEquipmentTypes.reduce((acc, et) => {
    if (!acc[et.slot]) acc[et.slot] = [];
    acc[et.slot].push(et);
    return acc;
  }, {});

  return (
    <div className="player-inventory-management">
      <h2>🎒 Spieler-Inventar & Ausrüstung</h2>

      {message.text && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}

      <div className="management-layout">
        {/* User Selection Panel */}
        <div className="user-selection-panel">
          <h3>Spieler auswählen</h3>
          <input
            type="text"
            placeholder="Suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <div className="user-list">
            {filteredUsers.map(user => (
              <div
                key={user.id}
                className={`user-item ${selectedUser?.id === user.id ? 'selected' : ''}`}
                onClick={() => selectUser(user)}
              >
                <span className="username">{user.username}</span>
                <span className={`role-badge ${user.role}`}>{user.role}</span>
              </div>
            ))}
          </div>
          <button className="btn-recalc-all" onClick={recalculateAllStats}>
            🔄 Alle Stats neu berechnen
          </button>
        </div>

        {/* Main Content */}
        <div className="main-content">
          {!selectedUser ? (
            <div className="no-selection">
              <p>👈 Wähle einen Spieler aus der Liste</p>
            </div>
          ) : loading ? (
            <div className="loading">Lade Daten...</div>
          ) : (
            <>
              <div className="player-header">
                <h3>{selectedUser.username}</h3>
                {playerStats && (
                  <span className="player-level">Level {playerStats.level}</span>
                )}
                <button className="btn-recalc" onClick={recalculateStats}>
                  🔄 Stats neu berechnen
                </button>
              </div>

              {/* Stats Summary */}
              {statistics && (
                <div className="stats-summary">
                  <div className="stat-item legendary">
                    <span className="stat-icon">⭐</span>
                    <span className="stat-value">{statistics.legendary_items_obtained || 0}</span>
                    <span className="stat-label">Legendär</span>
                  </div>
                  <div className="stat-item epic">
                    <span className="stat-icon">💜</span>
                    <span className="stat-value">{statistics.epic_items_obtained || 0}</span>
                    <span className="stat-label">Episch</span>
                  </div>
                  <div className="stat-item rare">
                    <span className="stat-icon">💙</span>
                    <span className="stat-value">{statistics.rare_items_obtained || 0}</span>
                    <span className="stat-label">Selten</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-icon">⚔️</span>
                    <span className="stat-value">{statistics.monsters_killed || 0}</span>
                    <span className="stat-label">Monster getötet</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-icon">🔨</span>
                    <span className="stat-value">{statistics.equipment_crafted || 0}</span>
                    <span className="stat-label">Gecraftet</span>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="tabs">
                <button 
                  className={`tab ${activeTab === 'inventory' ? 'active' : ''}`}
                  onClick={() => setActiveTab('inventory')}
                >
                  🎒 Inventar ({inventory.length})
                </button>
                <button 
                  className={`tab ${activeTab === 'equipment' ? 'active' : ''}`}
                  onClick={() => setActiveTab('equipment')}
                >
                  ⚔️ Ausrüstung ({equipment.length})
                </button>
              </div>

              {/* Inventory Tab */}
              {activeTab === 'inventory' && (
                <div className="inventory-section">
                  <div className="section-header">
                    <h4>Inventar</h4>
                    <button className="btn-add" onClick={() => setShowAddItemModal(true)}>
                      ➕ Item hinzufügen
                    </button>
                  </div>
                  
                  {inventory.length === 0 ? (
                    <p className="empty-message">Inventar ist leer</p>
                  ) : (
                    <table className="inventory-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Kategorie</th>
                          <th>Seltenheit</th>
                          <th>Menge</th>
                          <th>Aktionen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventory.map(item => (
                          <tr key={item.id}>
                            <td>
                              <span className="item-icon">{item.icon || '📦'}</span>
                              <span style={{ color: RARITY_COLORS[item.rarity] || '#fff' }}>
                                {item.display_name}
                              </span>
                            </td>
                            <td>{item.category}</td>
                            <td style={{ color: RARITY_COLORS[item.rarity] }}>{item.rarity}</td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                value={item.quantity}
                                onChange={(e) => updateItemQuantity(item.item_id, e.target.value)}
                                className="quantity-input"
                              />
                            </td>
                            <td>
                              <button 
                                className="btn-delete"
                                onClick={() => deleteItem(item.item_id, item.display_name)}
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Equipment Tab */}
              {activeTab === 'equipment' && (
                <div className="equipment-section">
                  <div className="section-header">
                    <h4>Ausrüstung</h4>
                    <button className="btn-add" onClick={() => setShowAddEquipmentModal(true)}>
                      ➕ Ausrüstung hinzufügen
                    </button>
                  </div>
                  
                  {equipment.length === 0 ? (
                    <p className="empty-message">Keine Ausrüstung vorhanden</p>
                  ) : (
                    <table className="equipment-table">
                      <thead>
                        <tr>
                          <th>Ausrüstung</th>
                          <th>Slot</th>
                          <th>Typ-Seltenheit</th>
                          <th>Qualität</th>
                          <th>Stats</th>
                          <th>Angelegt</th>
                          <th>Aktionen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {equipment.map(eq => (
                          <tr key={eq.id} className={eq.is_equipped ? 'equipped' : ''}>
                            <td>
                              <span style={{ color: RARITY_COLORS[eq.rarity] || '#fff' }}>
                                {eq.display_name}
                              </span>
                            </td>
                            <td>{eq.slot}</td>
                            <td style={{ color: RARITY_COLORS[eq.rarity] }}>{eq.rarity}</td>
                            <td>
                              <select
                                value={eq.quality}
                                onChange={(e) => updateEquipment(eq.id, { quality: e.target.value })}
                                style={{ color: QUALITY_OPTIONS.find(q => q.value === eq.quality)?.color }}
                              >
                                {QUALITY_OPTIONS.map(q => (
                                  <option key={q.value} value={q.value} style={{ color: q.color }}>
                                    {q.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="stats-cell">
                              {eq.base_attack > 0 && <span>⚔️ {eq.base_attack}</span>}
                              {eq.base_defense > 0 && <span>🛡️ {eq.base_defense}</span>}
                              {eq.base_health > 0 && <span>❤️ {eq.base_health}</span>}
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={eq.is_equipped}
                                onChange={(e) => updateEquipment(eq.id, { isEquipped: e.target.checked })}
                              />
                            </td>
                            <td>
                              <button 
                                className="btn-delete"
                                onClick={() => deleteEquipment(eq.id, eq.display_name)}
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Item Modal */}
      {showAddItemModal && (
        <div className="modal-overlay" onClick={() => setShowAddItemModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Item hinzufügen</h3>
            <div className="form-group">
              <label>Item</label>
              <select
                value={addItemForm.itemId}
                onChange={(e) => setAddItemForm({ ...addItemForm, itemId: e.target.value })}
              >
                <option value="">-- Item auswählen --</option>
                {Object.entries(groupedItems).map(([category, items]) => (
                  <optgroup key={category} label={category}>
                    {items.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.icon} {item.display_name} ({item.rarity})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Menge</label>
              <input
                type="number"
                min="1"
                value={addItemForm.quantity}
                onChange={(e) => setAddItemForm({ ...addItemForm, quantity: e.target.value })}
              />
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowAddItemModal(false)}>Abbrechen</button>
              <button className="btn-primary" onClick={addItem}>Hinzufügen</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Equipment Modal */}
      {showAddEquipmentModal && (
        <div className="modal-overlay" onClick={() => setShowAddEquipmentModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Ausrüstung hinzufügen</h3>
            <div className="form-group">
              <label>Equipment-Typ</label>
              <select
                value={addEquipmentForm.equipmentTypeId}
                onChange={(e) => setAddEquipmentForm({ ...addEquipmentForm, equipmentTypeId: e.target.value })}
              >
                <option value="">-- Equipment auswählen --</option>
                {Object.entries(groupedEquipmentTypes).map(([slot, types]) => (
                  <optgroup key={slot} label={slot}>
                    {types.map(et => (
                      <option key={et.id} value={et.id}>
                        {et.display_name} ({et.rarity}) - ⚔️{et.base_attack} 🛡️{et.base_defense} ❤️{et.base_health}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Qualität</label>
              <select
                value={addEquipmentForm.quality}
                onChange={(e) => setAddEquipmentForm({ ...addEquipmentForm, quality: e.target.value })}
              >
                {QUALITY_OPTIONS.map(q => (
                  <option key={q.value} value={q.value}>{q.label}</option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowAddEquipmentModal(false)}>Abbrechen</button>
              <button className="btn-primary" onClick={addEquipment}>Hinzufügen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlayerInventoryManagement;
