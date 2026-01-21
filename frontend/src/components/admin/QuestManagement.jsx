import { useState, useEffect } from 'react';
import api from '../../services/api';
import './QuestManagement.css';

const OBJECTIVE_TYPES = [
  { value: 'daily_login', label: 'Täglicher Login', icon: '🌅' },
  { value: 'kill_monster', label: 'Monster töten (beliebig)', icon: '⚔️' },
  { value: 'kill_boss', label: 'Boss töten (beliebig)', icon: '👑' },
  { value: 'kill_specific_monster', label: 'Bestimmtes Monster töten', icon: '🎯' },
  { value: 'collect_resource', label: 'Ressourcen sammeln (beliebig)', icon: '🌿' },
  { value: 'collect_specific_item', label: 'Bestimmtes Item sammeln', icon: '📦' },
  { value: 'craft_item', label: 'Items craften (beliebig)', icon: '🔨' },
  { value: 'craft_specific_item', label: 'Bestimmtes Item craften', icon: '🛠️' },
  { value: 'craft_equipment', label: 'Ausrüstung craften', icon: '⚔️' },
  { value: 'build_building', label: 'Gebäude bauen (beliebig)', icon: '🏠' },
  { value: 'build_specific_building', label: 'Bestimmtes Gebäude bauen', icon: '🏗️' },
  { value: 'upgrade_building', label: 'Gebäude aufwerten', icon: '⬆️' },
  { value: 'travel_distance', label: 'Distanz laufen', icon: '👣' },
  { value: 'reach_level', label: 'Level erreichen', icon: '⭐' },
  { value: 'earn_gold', label: 'Gold verdienen', icon: '💰' },
  { value: 'send_message', label: 'Nachrichten senden', icon: '✉️' },
  { value: 'defeat_player', label: 'Spieler besiegen', icon: '🎯' },
  { value: 'obtain_legendary', label: 'Legendären Gegenstand erhalten', icon: '🌟' },
  { value: 'obtain_epic', label: 'Epischen Gegenstand erhalten', icon: '💜' },
  { value: 'obtain_rare', label: 'Seltenen Gegenstand erhalten', icon: '💙' },
  { value: 'complete_trade', label: 'Handel abschließen', icon: '🤝' },
  { value: 'join_guild', label: 'Gilde beitreten', icon: '🏰' },
];

const CATEGORIES = [
  { value: 'main', label: 'Hauptquest' },
  { value: 'side', label: 'Nebenquest' },
  { value: 'daily', label: 'Tägliche Quest' },
  { value: 'weekly', label: 'Wöchentliche Quest' },
  { value: 'achievement', label: 'Erfolg' },
];

function QuestManagement() {
  const [quests, setQuests] = useState([]);
  const [items, setItems] = useState([]);
  const [monsters, setMonsters] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingQuest, setEditingQuest] = useState(null);

  const emptyForm = {
    name: '',
    display_name: '',
    description: '',
    category: 'side',
    is_repeatable: false,
    cooldown_hours: 0,
    min_level: 1,
    prerequisite_quest_id: '',
    reward_gold: 0,
    reward_experience: 0,
    reward_item_id: '',
    reward_item_quantity: 1,
    sort_order: 0,
    is_active: true,
    objectives: [{ objective_type: 'kill_monster', target_id: '', target_name: '', required_amount: 1, description: '' }]
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (message || error) {
      const timer = setTimeout(() => { setMessage(''); setError(''); }, 4000);
      return () => clearTimeout(timer);
    }
  }, [message, error]);

  const fetchData = async () => {
    try {
      const [questsRes, itemsRes, monstersRes, buildingsRes] = await Promise.all([
        api.get('/quests/admin/all'),
        api.get('/items'),
        api.get('/admin/npcs/monsters'),
        api.get('/crafting/buildings')
      ]);
      setQuests(questsRes.data.quests);
      setItems(itemsRes.data.items);
      setMonsters(monstersRes.data.monsters || []);
      setBuildings(buildingsRes.data.buildings || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Fehler beim Laden der Daten');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (quest) => {
    setEditingQuest(quest);
    setForm({
      name: quest.name,
      display_name: quest.display_name,
      description: quest.description || '',
      category: quest.category,
      is_repeatable: quest.is_repeatable,
      cooldown_hours: quest.cooldown_hours || 0,
      min_level: quest.min_level || 1,
      prerequisite_quest_id: quest.prerequisite_quest_id || '',
      reward_gold: quest.reward_gold || 0,
      reward_experience: quest.reward_experience || 0,
      reward_item_id: quest.reward_item_id || '',
      reward_item_quantity: quest.reward_item_quantity || 1,
      sort_order: quest.sort_order || 0,
      is_active: quest.is_active,
      objectives: quest.objectives?.length > 0 ? quest.objectives.map(o => ({
        objective_type: o.objective_type,
        target_id: o.target_id || '',
        target_name: o.target_name || '',
        required_amount: o.required_amount || 1,
        description: o.description || ''
      })) : [{ objective_type: 'kill_monster', target_id: '', target_name: '', required_amount: 1, description: '' }]
    });
    setShowForm(true);
  };

  const handleDelete = async (quest) => {
    if (!confirm(`Quest "${quest.display_name}" wirklich löschen?`)) return;
    try {
      await api.delete(`/quests/admin/${quest.id}`);
      setMessage('Quest gelöscht');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Löschen');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name || !form.display_name) {
      setError('Name und Anzeigename sind erforderlich');
      return;
    }

    try {
      const payload = {
        ...form,
        prerequisite_quest_id: form.prerequisite_quest_id || null,
        reward_item_id: form.reward_item_id || null
      };

      if (editingQuest) {
        await api.put(`/quests/admin/${editingQuest.id}`, payload);
        setMessage('Quest aktualisiert');
      } else {
        await api.post('/quests/admin', payload);
        setMessage('Quest erstellt');
      }

      setShowForm(false);
      setEditingQuest(null);
      setForm(emptyForm);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  const addObjective = () => {
    setForm({
      ...form,
      objectives: [...form.objectives, { objective_type: 'kill_monster', target_id: '', target_name: '', required_amount: 1, description: '' }]
    });
  };

  const removeObjective = (index) => {
    setForm({
      ...form,
      objectives: form.objectives.filter((_, i) => i !== index)
    });
  };

  const updateObjective = (index, field, value) => {
    const newObjectives = [...form.objectives];
    newObjectives[index][field] = value;
    setForm({ ...form, objectives: newObjectives });
  };

  const needsTargetId = (type) => {
    return ['kill_specific_monster', 'collect_specific_item', 'craft_specific_item', 'build_specific_building'].includes(type);
  };

  if (loading) return <div className="loading">Lädt...</div>;

  return (
    <div className="quest-management">
      <div className="qm-header">
        <h2>📜 Quest-Verwaltung</h2>
        <button className="btn-create" onClick={() => { setShowForm(true); setEditingQuest(null); setForm(emptyForm); }}>
          + Neue Quest
        </button>
      </div>

      {message && <div className="success-msg">{message}</div>}
      {error && <div className="error-msg">{error}</div>}

      {/* Quest List */}
      <div className="quest-list">
        {quests.length === 0 ? (
          <p className="no-quests">Noch keine Quests vorhanden.</p>
        ) : (
          <table className="quest-table">
            <thead>
              <tr>
                <th>Quest</th>
                <th>Kategorie</th>
                <th>Level</th>
                <th>Belohnungen</th>
                <th>Aufgaben</th>
                <th>Abschlüsse</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {quests.map(quest => (
                <tr key={quest.id} className={!quest.is_active ? 'inactive' : ''}>
                  <td>
                    <strong>{quest.display_name}</strong>
                    <span className="quest-name">{quest.name}</span>
                  </td>
                  <td>
                    <span className={`category-badge ${quest.category}`}>
                      {CATEGORIES.find(c => c.value === quest.category)?.label || quest.category}
                    </span>
                  </td>
                  <td>{quest.min_level}</td>
                  <td className="rewards-cell">
                    {quest.reward_gold > 0 && <span>💰{quest.reward_gold}</span>}
                    {quest.reward_experience > 0 && <span>⭐{quest.reward_experience}</span>}
                    {quest.reward_item_name && <span>📦{quest.reward_item_name}</span>}
                  </td>
                  <td>{quest.objectives?.length || 0}</td>
                  <td>{quest.completions || 0}</td>
                  <td>
                    <span className={`status-badge ${quest.is_active ? 'active' : 'inactive'}`}>
                      {quest.is_active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button className="btn-icon" onClick={() => handleEdit(quest)} title="Bearbeiten">✏️</button>
                    <button className="btn-icon btn-delete" onClick={() => handleDelete(quest)} title="Löschen">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Quest Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content quest-form-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingQuest ? '✏️ Quest bearbeiten' : '✨ Neue Quest'}</h3>
              <button className="btn-close" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-section">
                <h4>Grunddaten</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Interner Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm({...form, name: e.target.value})}
                      placeholder="z.B. erste_schritte"
                      disabled={!!editingQuest}
                    />
                  </div>
                  <div className="form-group">
                    <label>Anzeigename</label>
                    <input
                      type="text"
                      value={form.display_name}
                      onChange={e => setForm({...form, display_name: e.target.value})}
                      placeholder="z.B. Erste Schritte"
                    />
                  </div>
                  <div className="form-group">
                    <label>Kategorie</label>
                    <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Min. Level</label>
                    <input
                      type="number"
                      min="1"
                      value={form.min_level}
                      onChange={e => setForm({...form, min_level: parseInt(e.target.value) || 1})}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Beschreibung</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm({...form, description: e.target.value})}
                    placeholder="Optionale Beschreibung der Quest..."
                    rows="3"
                  />
                </div>
                <div className="form-row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={e => setForm({...form, is_active: e.target.checked})}
                    />
                    Quest aktiv
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.is_repeatable}
                      onChange={e => setForm({...form, is_repeatable: e.target.checked})}
                    />
                    Wiederholbar
                  </label>
                </div>
              </div>

              <div className="form-section">
                <h4>🎁 Belohnungen</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label>💰 Gold</label>
                    <input
                      type="number"
                      min="0"
                      value={form.reward_gold}
                      onChange={e => setForm({...form, reward_gold: parseInt(e.target.value) || 0})}
                    />
                  </div>
                  <div className="form-group">
                    <label>⭐ Erfahrung</label>
                    <input
                      type="number"
                      min="0"
                      value={form.reward_experience}
                      onChange={e => setForm({...form, reward_experience: parseInt(e.target.value) || 0})}
                    />
                  </div>
                  <div className="form-group">
                    <label>📦 Item-Belohnung</label>
                    <select value={form.reward_item_id} onChange={e => setForm({...form, reward_item_id: e.target.value})}>
                      <option value="">Kein Item</option>
                      {items.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}
                    </select>
                  </div>
                  {form.reward_item_id && (
                    <div className="form-group">
                      <label>Item-Menge</label>
                      <input
                        type="number"
                        min="1"
                        value={form.reward_item_quantity}
                        onChange={e => setForm({...form, reward_item_quantity: parseInt(e.target.value) || 1})}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h4>📋 Aufgaben</h4>
                  <button type="button" className="btn-add" onClick={addObjective}>+ Aufgabe</button>
                </div>
                
                {form.objectives.map((obj, idx) => (
                  <div key={idx} className="objective-row">
                    <div className="obj-main">
                      <select
                        value={obj.objective_type}
                        onChange={e => updateObjective(idx, 'objective_type', e.target.value)}
                        className="obj-type-select"
                      >
                        {OBJECTIVE_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                        ))}
                      </select>

                      {needsTargetId(obj.objective_type) && (
                        <select
                          value={obj.target_id}
                          onChange={e => updateObjective(idx, 'target_id', e.target.value)}
                          className="obj-target-select"
                        >
                          <option value="">Ziel wählen...</option>
                          {obj.objective_type === 'kill_specific_monster' && 
                            monsters.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)
                          }
                          {(obj.objective_type === 'collect_specific_item' || obj.objective_type === 'craft_specific_item') && 
                            items.map(i => <option key={i.id} value={i.id}>{i.display_name}</option>)
                          }
                          {obj.objective_type === 'build_specific_building' && 
                            buildings.map(b => <option key={b.id} value={b.id}>{b.display_name}</option>)
                          }
                        </select>
                      )}

                      <input
                        type="number"
                        min="1"
                        value={obj.required_amount}
                        onChange={e => updateObjective(idx, 'required_amount', parseInt(e.target.value) || 1)}
                        className="obj-amount"
                        placeholder="Anzahl"
                      />

                      {form.objectives.length > 1 && (
                        <button type="button" className="btn-remove" onClick={() => removeObjective(idx)}>✕</button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={obj.description}
                      onChange={e => updateObjective(idx, 'description', e.target.value)}
                      placeholder="Beschreibung (optional)"
                      className="obj-description"
                    />
                  </div>
                ))}
              </div>

              <div className="form-actions">
                <button type="button" onClick={() => setShowForm(false)}>Abbrechen</button>
                <button type="submit" className="btn-primary">
                  {editingQuest ? '💾 Speichern' : '✨ Erstellen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuestManagement;
