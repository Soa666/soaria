import { useState, useEffect } from 'react';
import api from '../../services/api';
import './MonsterManagement.css';

function MonsterManagement() {
  const [monsters, setMonsters] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedMonster, setSelectedMonster] = useState(null);
  const [monsterLoot, setMonsterLoot] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    name: '',
    display_name: '',
    description: '',
    is_boss: false,
    min_level: 1,
    max_level: 5,
    base_health: 100,
    base_attack: 10,
    base_defense: 5,
    health_per_level: 20,
    attack_per_level: 3,
    defense_per_level: 2,
    spawn_weight: 100,
    respawn_cooldown: 5
  });

  const [lootForm, setLootForm] = useState({
    item_id: '',
    min_quantity: 1,
    max_quantity: 1,
    drop_chance: 0.5,
    gold_min: 0,
    gold_max: 0
  });

  useEffect(() => {
    fetchMonsters();
    fetchItems();
  }, []);

  const fetchMonsters = async () => {
    try {
      const response = await api.get('/admin/npcs/monsters');
      setMonsters(response.data.monsters || []);
    } catch (err) {
      setError('Fehler beim Laden der Monster');
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

  const selectMonster = async (monster) => {
    setSelectedMonster(monster);
    try {
      const response = await api.get(`/admin/npcs/monsters/${monster.id}`);
      setMonsterLoot(response.data.loot || []);
    } catch (err) {
      console.error('Fehler beim Laden des Loots');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      if (editMode && selectedMonster) {
        await api.put(`/admin/npcs/monsters/${selectedMonster.id}`, form);
        setMessage('Monster aktualisiert');
      } else {
        await api.post('/admin/npcs/monsters', form);
        setMessage('Monster erstellt');
      }
      fetchMonsters();
      setShowForm(false);
      resetForm();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  const handleEdit = (monster) => {
    setForm({
      name: monster.name,
      display_name: monster.display_name,
      description: monster.description || '',
      is_boss: monster.is_boss === 1,
      min_level: monster.min_level,
      max_level: monster.max_level,
      base_health: monster.base_health,
      base_attack: monster.base_attack,
      base_defense: monster.base_defense,
      health_per_level: monster.health_per_level,
      attack_per_level: monster.attack_per_level,
      defense_per_level: monster.defense_per_level,
      spawn_weight: monster.spawn_weight,
      respawn_cooldown: monster.respawn_cooldown || (monster.is_boss ? 60 : 5)
    });
    setSelectedMonster(monster);
    setEditMode(true);
    setShowForm(true);
  };

  const handleDelete = async (monster) => {
    if (!window.confirm(`Monster "${monster.display_name}" wirklich löschen?`)) return;
    
    try {
      await api.delete(`/admin/npcs/monsters/${monster.id}`);
      setMessage('Monster gelöscht');
      fetchMonsters();
      if (selectedMonster?.id === monster.id) {
        setSelectedMonster(null);
        setMonsterLoot([]);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Löschen');
    }
  };

  const handleAddLoot = async (e) => {
    e.preventDefault();
    if (!selectedMonster) return;

    try {
      await api.post(`/admin/npcs/monsters/${selectedMonster.id}/loot`, lootForm);
      setMessage('Loot hinzugefügt');
      selectMonster(selectedMonster);
      setLootForm({
        item_id: '',
        min_quantity: 1,
        max_quantity: 1,
        drop_chance: 0.5,
        gold_min: 0,
        gold_max: 0
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Hinzufügen');
    }
  };

  const handleRemoveLoot = async (lootId) => {
    if (!selectedMonster) return;

    try {
      await api.delete(`/admin/npcs/monsters/${selectedMonster.id}/loot/${lootId}`);
      setMessage('Loot entfernt');
      selectMonster(selectedMonster);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Entfernen');
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      display_name: '',
      description: '',
      is_boss: false,
      min_level: 1,
      max_level: 5,
      base_health: 100,
      base_attack: 10,
      base_defense: 5,
      health_per_level: 20,
      attack_per_level: 3,
      defense_per_level: 2,
      spawn_weight: 100,
      respawn_cooldown: 5
    });
    setEditMode(false);
    setSelectedMonster(null);
  };

  if (loading) return <div className="loading">Lade Monster...</div>;

  return (
    <div className="monster-management">
      <div className="monster-header">
        <h2>👹 Monster-Verwaltung</h2>
        <button 
          className="btn-create"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          + Neues Monster
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      <div className="monster-content">
        <div className="monster-list">
          <h3>Monster ({monsters.length})</h3>
          <div className="monster-items">
            {monsters.map(monster => (
              <div 
                key={monster.id} 
                className={`monster-item ${selectedMonster?.id === monster.id ? 'selected' : ''} ${monster.is_boss ? 'boss' : ''}`}
                onClick={() => selectMonster(monster)}
              >
                <div className="monster-info">
                  <span className="monster-name">
                    {monster.is_boss ? '👑 ' : ''}
                    {monster.display_name}
                  </span>
                  <span className="monster-level">Lv. {monster.min_level}-{monster.max_level}</span>
                </div>
                <div className="monster-stats-mini">
                  <span>❤️ {monster.base_health}</span>
                  <span>⚔️ {monster.base_attack}</span>
                  <span>🛡️ {monster.base_defense}</span>
                </div>
                <div className="monster-actions">
                  <button onClick={(e) => { e.stopPropagation(); handleEdit(monster); }}>✏️</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(monster); }}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedMonster && (
          <div className="monster-details">
            <h3>{selectedMonster.is_boss ? '👑 ' : ''}{selectedMonster.display_name}</h3>
            <p className="description">{selectedMonster.description}</p>
            
            <div className="stats-grid">
              <div className="stat">
                <label>Level</label>
                <span>{selectedMonster.min_level} - {selectedMonster.max_level}</span>
              </div>
              <div className="stat">
                <label>Basis-HP</label>
                <span>{selectedMonster.base_health} (+{selectedMonster.health_per_level}/Lv)</span>
              </div>
              <div className="stat">
                <label>Angriff</label>
                <span>{selectedMonster.base_attack} (+{selectedMonster.attack_per_level}/Lv)</span>
              </div>
              <div className="stat">
                <label>Verteidigung</label>
                <span>{selectedMonster.base_defense} (+{selectedMonster.defense_per_level}/Lv)</span>
              </div>
              <div className="stat">
                <label>Spawn-Gewicht</label>
                <span>{selectedMonster.spawn_weight}</span>
              </div>
              <div className="stat">
                <label>Respawn-Zeit</label>
                <span>{selectedMonster.respawn_cooldown || 5} Min.</span>
              </div>
              <div className="stat">
                <label>Gespawnt</label>
                <span>{selectedMonster.spawn_count}x</span>
              </div>
            </div>

            <div className="loot-section">
              <h4>🎁 Loot-Tabelle</h4>
              
              {monsterLoot.length > 0 ? (
                <table className="loot-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Menge</th>
                      <th>Chance</th>
                      <th>Gold</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {monsterLoot.map(loot => (
                      <tr key={loot.id}>
                        <td>{loot.item_name}</td>
                        <td>{loot.min_quantity}-{loot.max_quantity}</td>
                        <td>{Math.round(loot.drop_chance * 100)}%</td>
                        <td>{loot.gold_min}-{loot.gold_max} 💰</td>
                        <td>
                          <button 
                            className="btn-remove"
                            onClick={() => handleRemoveLoot(loot.id)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="no-loot">Kein Loot konfiguriert</p>
              )}

              <form className="loot-form" onSubmit={handleAddLoot}>
                <h5>Loot hinzufügen</h5>
                <div className="form-row">
                  <select
                    value={lootForm.item_id}
                    onChange={(e) => setLootForm({...lootForm, item_id: e.target.value})}
                    required
                  >
                    <option value="">Item wählen...</option>
                    {items.map(item => (
                      <option key={item.id} value={item.id}>{item.display_name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <input
                    type="number"
                    placeholder="Min"
                    value={lootForm.min_quantity}
                    onChange={(e) => setLootForm({...lootForm, min_quantity: parseInt(e.target.value)})}
                    min="1"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={lootForm.max_quantity}
                    onChange={(e) => setLootForm({...lootForm, max_quantity: parseInt(e.target.value)})}
                    min="1"
                  />
                  <input
                    type="number"
                    placeholder="Chance"
                    value={lootForm.drop_chance}
                    onChange={(e) => setLootForm({...lootForm, drop_chance: parseFloat(e.target.value)})}
                    min="0"
                    max="1"
                    step="0.1"
                  />
                </div>
                <div className="form-row">
                  <input
                    type="number"
                    placeholder="Gold Min"
                    value={lootForm.gold_min}
                    onChange={(e) => setLootForm({...lootForm, gold_min: parseInt(e.target.value)})}
                    min="0"
                  />
                  <input
                    type="number"
                    placeholder="Gold Max"
                    value={lootForm.gold_max}
                    onChange={(e) => setLootForm({...lootForm, gold_max: parseInt(e.target.value)})}
                    min="0"
                  />
                  <button type="submit" className="btn-add">+</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editMode ? 'Monster bearbeiten' : 'Neues Monster'}</h3>
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
                    placeholder="z.B. wolf"
                  />
                </div>
                <div className="form-group">
                  <label>Anzeigename*</label>
                  <input
                    type="text"
                    value={form.display_name}
                    onChange={(e) => setForm({...form, display_name: e.target.value})}
                    required
                    placeholder="z.B. Wilder Wolf"
                  />
                </div>
                <div className="form-group full-width">
                  <label>Beschreibung</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({...form, description: e.target.value})}
                    placeholder="Beschreibung des Monsters..."
                  />
                </div>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.is_boss}
                      onChange={(e) => setForm({...form, is_boss: e.target.checked})}
                    />
                    Boss-Monster 👑
                  </label>
                </div>
                <div className="form-group">
                  <label>Spawn-Gewicht</label>
                  <input
                    type="number"
                    value={form.spawn_weight}
                    onChange={(e) => setForm({...form, spawn_weight: parseInt(e.target.value)})}
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label>Respawn-Zeit (Min.)</label>
                  <input
                    type="number"
                    value={form.respawn_cooldown}
                    onChange={(e) => setForm({...form, respawn_cooldown: parseInt(e.target.value)})}
                    min="1"
                    placeholder={form.is_boss ? "60" : "5"}
                  />
                </div>
                <div className="form-group">
                  <label>Min. Level</label>
                  <input
                    type="number"
                    value={form.min_level}
                    onChange={(e) => setForm({...form, min_level: parseInt(e.target.value)})}
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label>Max. Level</label>
                  <input
                    type="number"
                    value={form.max_level}
                    onChange={(e) => setForm({...form, max_level: parseInt(e.target.value)})}
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label>Basis-HP</label>
                  <input
                    type="number"
                    value={form.base_health}
                    onChange={(e) => setForm({...form, base_health: parseInt(e.target.value)})}
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label>HP pro Level</label>
                  <input
                    type="number"
                    value={form.health_per_level}
                    onChange={(e) => setForm({...form, health_per_level: parseInt(e.target.value)})}
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label>Basis-Angriff</label>
                  <input
                    type="number"
                    value={form.base_attack}
                    onChange={(e) => setForm({...form, base_attack: parseInt(e.target.value)})}
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label>Angriff pro Level</label>
                  <input
                    type="number"
                    value={form.attack_per_level}
                    onChange={(e) => setForm({...form, attack_per_level: parseInt(e.target.value)})}
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label>Basis-Verteidigung</label>
                  <input
                    type="number"
                    value={form.base_defense}
                    onChange={(e) => setForm({...form, base_defense: parseInt(e.target.value)})}
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label>Verteidigung pro Level</label>
                  <input
                    type="number"
                    value={form.defense_per_level}
                    onChange={(e) => setForm({...form, defense_per_level: parseInt(e.target.value)})}
                    min="0"
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

export default MonsterManagement;
