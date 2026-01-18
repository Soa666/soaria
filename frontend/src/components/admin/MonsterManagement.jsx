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
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBoss, setFilterBoss] = useState('all'); // all, boss, normal
  
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

  const [showSpawnModal, setShowSpawnModal] = useState(false);
  const [spawnMonster, setSpawnMonster] = useState(null);
  const [spawnForm, setSpawnForm] = useState({
    count: 5,
    minX: -2000,
    maxX: 2000,
    minY: -2000,
    maxY: 2000
  });

  useEffect(() => {
    fetchMonsters();
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
    if (selectedMonster?.id === monster.id) {
      // Toggle off
      setSelectedMonster(null);
      setMonsterLoot([]);
      return;
    }
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

  const handleEdit = (monster, e) => {
    e?.stopPropagation();
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

  const handleDelete = async (monster, e) => {
    e?.stopPropagation();
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

  const openSpawnModal = (monster, e) => {
    e?.stopPropagation();
    setSpawnMonster(monster);
    setSpawnForm({
      count: monster.is_boss ? 1 : 5,
      minX: -2000,
      maxX: 2000,
      minY: -2000,
      maxY: 2000
    });
    setShowSpawnModal(true);
  };

  const handleSpawn = async (e) => {
    e.preventDefault();
    if (!spawnMonster) return;

    try {
      const response = await api.post(`/admin/npcs/monsters/${spawnMonster.id}/spawn`, spawnForm);
      setMessage(response.data.message);
      setShowSpawnModal(false);
      setSpawnMonster(null);
      fetchMonsters(); // Refresh to update spawn count
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Spawnen');
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

  // Filter monsters
  const filteredMonsters = monsters.filter(monster => {
    const matchesSearch = monster.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          monster.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBoss = filterBoss === 'all' || 
                        (filterBoss === 'boss' && monster.is_boss) || 
                        (filterBoss === 'normal' && !monster.is_boss);
    return matchesSearch && matchesBoss;
  });

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

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Monster suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-buttons">
          <button 
            className={filterBoss === 'all' ? 'active' : ''}
            onClick={() => setFilterBoss('all')}
          >
            Alle ({monsters.length})
          </button>
          <button 
            className={filterBoss === 'normal' ? 'active' : ''}
            onClick={() => setFilterBoss('normal')}
          >
            👹 Normal ({monsters.filter(m => !m.is_boss).length})
          </button>
          <button 
            className={filterBoss === 'boss' ? 'active' : ''}
            onClick={() => setFilterBoss('boss')}
          >
            👑 Bosse ({monsters.filter(m => m.is_boss).length})
          </button>
        </div>
      </div>

      {/* Monster Table */}
      <div className="monster-table-container">
        <table className="monster-table">
          <thead>
            <tr>
              <th style={{width: '30px'}}></th>
              <th>Name</th>
              <th>Level</th>
              <th>❤️ HP</th>
              <th>⚔️ ATK</th>
              <th>🛡️ DEF</th>
              <th>Spawn</th>
              <th>Respawn</th>
              <th>Auf Karte</th>
              <th style={{width: '100px'}}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filteredMonsters.map(monster => (
              <>
                <tr 
                  key={monster.id} 
                  className={`monster-row ${selectedMonster?.id === monster.id ? 'selected' : ''} ${monster.is_boss ? 'boss' : ''}`}
                  onClick={() => selectMonster(monster)}
                >
                  <td className="type-icon">{monster.is_boss ? '👑' : '👹'}</td>
                  <td className="name-cell">
                    <span className="monster-name">{monster.display_name}</span>
                    <span className="monster-internal">{monster.name}</span>
                  </td>
                  <td className="level-cell">{monster.min_level} - {monster.max_level}</td>
                  <td>
                    <span className="stat-value">{monster.base_health}</span>
                    <span className="stat-growth">+{monster.health_per_level}/Lv</span>
                  </td>
                  <td>
                    <span className="stat-value">{monster.base_attack}</span>
                    <span className="stat-growth">+{monster.attack_per_level}/Lv</span>
                  </td>
                  <td>
                    <span className="stat-value">{monster.base_defense}</span>
                    <span className="stat-growth">+{monster.defense_per_level}/Lv</span>
                  </td>
                  <td className="spawn-cell">{monster.spawn_weight}</td>
                  <td className="respawn-cell">{monster.respawn_cooldown || 5} Min.</td>
                  <td className="count-cell">
                    <span className="spawn-count">{monster.spawn_count || 0}x</span>
                  </td>
                  <td className="action-cell">
                    <button 
                      className="btn-icon btn-spawn" 
                      onClick={(e) => openSpawnModal(monster, e)}
                      title="Auf Karte spawnen"
                    >
                      🌍
                    </button>
                    <button 
                      className="btn-icon btn-edit" 
                      onClick={(e) => handleEdit(monster, e)}
                      title="Bearbeiten"
                    >
                      ✏️
                    </button>
                    <button 
                      className="btn-icon btn-delete" 
                      onClick={(e) => handleDelete(monster, e)}
                      title="Löschen"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
                {selectedMonster?.id === monster.id && (
                  <tr className="loot-row">
                    <td colSpan="10">
                      <div className="loot-panel">
                        <div className="loot-header">
                          <h4>🎁 Loot-Tabelle für {monster.display_name}</h4>
                        </div>
                        
                        {monster.description && (
                          <p className="monster-description">{monster.description}</p>
                        )}

                        <div className="loot-content">
                          <div className="loot-list">
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
                                      <td className="loot-item-name">{loot.item_name}</td>
                                      <td>{loot.min_quantity}-{loot.max_quantity}</td>
                                      <td>
                                        <span className={`chance-badge ${loot.drop_chance >= 0.5 ? 'high' : loot.drop_chance >= 0.2 ? 'medium' : 'low'}`}>
                                          {Math.round(loot.drop_chance * 100)}%
                                        </span>
                                      </td>
                                      <td>{loot.gold_min}-{loot.gold_max} 💰</td>
                                      <td>
                                        <button 
                                          className="btn-remove-small"
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
                              <p className="no-loot">Kein Loot konfiguriert - füge Items hinzu!</p>
                            )}
                          </div>

                          <div className="loot-add-form">
                            <h5>+ Loot hinzufügen</h5>
                            <form onSubmit={handleAddLoot}>
                              <div className="loot-form-grid">
                                <div className="loot-field">
                                  <label>Item</label>
                                  <select
                                    value={lootForm.item_id}
                                    onChange={(e) => setLootForm({...lootForm, item_id: e.target.value})}
                                    required
                                  >
                                    <option value="">Wählen...</option>
                                    {items.map(item => (
                                      <option key={item.id} value={item.id}>{item.display_name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="loot-field small">
                                  <label>Min</label>
                                  <input
                                    type="number"
                                    value={lootForm.min_quantity}
                                    onChange={(e) => setLootForm({...lootForm, min_quantity: parseInt(e.target.value)})}
                                    min="1"
                                  />
                                </div>
                                <div className="loot-field small">
                                  <label>Max</label>
                                  <input
                                    type="number"
                                    value={lootForm.max_quantity}
                                    onChange={(e) => setLootForm({...lootForm, max_quantity: parseInt(e.target.value)})}
                                    min="1"
                                  />
                                </div>
                                <div className="loot-field small">
                                  <label>Chance</label>
                                  <input
                                    type="number"
                                    value={lootForm.drop_chance}
                                    onChange={(e) => setLootForm({...lootForm, drop_chance: parseFloat(e.target.value)})}
                                    min="0"
                                    max="1"
                                    step="0.05"
                                  />
                                </div>
                                <div className="loot-field small">
                                  <label>💰 Min</label>
                                  <input
                                    type="number"
                                    value={lootForm.gold_min}
                                    onChange={(e) => setLootForm({...lootForm, gold_min: parseInt(e.target.value)})}
                                    min="0"
                                  />
                                </div>
                                <div className="loot-field small">
                                  <label>💰 Max</label>
                                  <input
                                    type="number"
                                    value={lootForm.gold_max}
                                    onChange={(e) => setLootForm({...lootForm, gold_max: parseInt(e.target.value)})}
                                    min="0"
                                  />
                                </div>
                                <button type="submit" className="btn-add-loot">+ Hinzufügen</button>
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
        
        {filteredMonsters.length === 0 && (
          <div className="no-results">
            Keine Monster gefunden
          </div>
        )}
      </div>

      {/* Modal for creating/editing monster */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editMode ? '✏️ Monster bearbeiten' : '➕ Neues Monster'}</h3>
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
                
                <div className="form-section">
                  <h4>Typ & Spawn</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={form.is_boss}
                          onChange={(e) => setForm({...form, is_boss: e.target.checked})}
                        />
                        <span className="checkbox-text">👑 Boss-Monster</span>
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
                      <label>Respawn (Min.)</label>
                      <input
                        type="number"
                        value={form.respawn_cooldown}
                        onChange={(e) => setForm({...form, respawn_cooldown: parseInt(e.target.value)})}
                        min="1"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4>Level-Bereich</h4>
                  <div className="form-row">
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
                  </div>
                </div>

                <div className="form-section">
                  <h4>❤️ Lebenspunkte</h4>
                  <div className="form-row">
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
                  </div>
                </div>

                <div className="form-section">
                  <h4>⚔️ Angriff</h4>
                  <div className="form-row">
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
                      <label>ATK pro Level</label>
                      <input
                        type="number"
                        value={form.attack_per_level}
                        onChange={(e) => setForm({...form, attack_per_level: parseInt(e.target.value)})}
                        min="0"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4>🛡️ Verteidigung</h4>
                  <div className="form-row">
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
                      <label>DEF pro Level</label>
                      <input
                        type="number"
                        value={form.defense_per_level}
                        onChange={(e) => setForm({...form, defense_per_level: parseInt(e.target.value)})}
                        min="0"
                      />
                    </div>
                  </div>
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

      {/* Spawn Modal */}
      {showSpawnModal && spawnMonster && (
        <div className="modal-overlay" onClick={() => setShowSpawnModal(false)}>
          <div className="modal-content spawn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🌍 {spawnMonster.display_name} spawnen</h3>
              <button className="btn-close" onClick={() => setShowSpawnModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSpawn}>
              <div className="spawn-info">
                <p>Spawne <strong>{spawnMonster.display_name}</strong> an zufälligen Positionen auf der Karte.</p>
                <p className="spawn-note">
                  {spawnMonster.is_boss 
                    ? '👑 Boss-Monster sollten einzeln gespawnt werden!' 
                    : '💡 Tipp: 5-10 Monster pro Typ sind ein guter Start.'}
                </p>
              </div>
              
              <div className="spawn-form-grid">
                <div className="form-group">
                  <label>Anzahl</label>
                  <input
                    type="number"
                    value={spawnForm.count}
                    onChange={(e) => setSpawnForm({...spawnForm, count: parseInt(e.target.value)})}
                    min="1"
                    max={spawnMonster.is_boss ? 3 : 50}
                  />
                </div>
                
                <div className="form-group span-2">
                  <label>X-Bereich (West → Ost)</label>
                  <div className="range-inputs">
                    <input
                      type="number"
                      value={spawnForm.minX}
                      onChange={(e) => setSpawnForm({...spawnForm, minX: parseInt(e.target.value)})}
                      placeholder="Min X"
                    />
                    <span>bis</span>
                    <input
                      type="number"
                      value={spawnForm.maxX}
                      onChange={(e) => setSpawnForm({...spawnForm, maxX: parseInt(e.target.value)})}
                      placeholder="Max X"
                    />
                  </div>
                </div>
                
                <div className="form-group span-2">
                  <label>Y-Bereich (Nord → Süd)</label>
                  <div className="range-inputs">
                    <input
                      type="number"
                      value={spawnForm.minY}
                      onChange={(e) => setSpawnForm({...spawnForm, minY: parseInt(e.target.value)})}
                      placeholder="Min Y"
                    />
                    <span>bis</span>
                    <input
                      type="number"
                      value={spawnForm.maxY}
                      onChange={(e) => setSpawnForm({...spawnForm, maxY: parseInt(e.target.value)})}
                      placeholder="Max Y"
                    />
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" onClick={() => setShowSpawnModal(false)}>Abbrechen</button>
                <button type="submit" className="btn-primary btn-spawn-confirm">
                  🌍 {spawnForm.count}x Spawnen
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
