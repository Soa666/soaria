import { useState, useEffect } from 'react';
import api from '../../services/api';
import './BuffsManagement.css';

const EFFECT_TYPES = [
  { value: 'attack_percent', label: '⚔️ Angriff %', description: 'Prozentuale Erhöhung des Angriffs' },
  { value: 'attack_flat', label: '⚔️ Angriff +', description: 'Feste Erhöhung des Angriffs' },
  { value: 'defense_percent', label: '🛡️ Verteidigung %', description: 'Prozentuale Erhöhung der Verteidigung' },
  { value: 'defense_flat', label: '🛡️ Verteidigung +', description: 'Feste Erhöhung der Verteidigung' },
  { value: 'health_percent', label: '❤️ HP %', description: 'Prozentuale Erhöhung der HP' },
  { value: 'health_flat', label: '❤️ HP +', description: 'Feste Erhöhung der HP' },
  { value: 'speed_percent', label: '👟 Geschwindigkeit %', description: 'Schnelleres Reisen' },
  { value: 'exp_percent', label: '⭐ EP %', description: 'Mehr Erfahrungspunkte' },
  { value: 'gold_percent', label: '💰 Gold %', description: 'Mehr Gold bei Drops' },
  { value: 'gather_speed', label: '⛏️ Sammelgeschwindigkeit %', description: 'Schnelleres Sammeln' },
  { value: 'craft_speed', label: '🔨 Craftgeschwindigkeit %', description: 'Schnelleres Craften' },
  { value: 'all_stats', label: '✨ Alle Stats %', description: 'Erhöht alle Stats gleichmäßig' },
];

const TARGET_TYPES = [
  { value: 'all', label: '🌍 Alle Spieler', needsId: false },
  { value: 'user', label: '👤 Einzelner Spieler', needsId: true, idType: 'user' },
  { value: 'guild', label: '🏰 Gilde', needsId: true, idType: 'guild' },
  { value: 'guildless', label: '🚶 Gildenlose Spieler', needsId: false },
  { value: 'level_min', label: '📈 Mindestlevel', needsId: true, idType: 'level' },
  { value: 'level_max', label: '📉 Maximallevel', needsId: true, idType: 'level' },
];

const DURATION_PRESETS = [
  { value: null, label: '♾️ Unbegrenzt' },
  { value: 30, label: '30 Minuten' },
  { value: 60, label: '1 Stunde' },
  { value: 120, label: '2 Stunden' },
  { value: 360, label: '6 Stunden' },
  { value: 720, label: '12 Stunden' },
  { value: 1440, label: '1 Tag' },
  { value: 4320, label: '3 Tage' },
  { value: 10080, label: '1 Woche' },
];

function BuffsManagement() {
  const [activeTab, setActiveTab] = useState('active'); // 'active', 'types', 'apply'
  const [buffTypes, setBuffTypes] = useState([]);
  const [activeBuffs, setActiveBuffs] = useState([]);
  const [guilds, setGuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // Apply buff form state
  const [selectedBuffType, setSelectedBuffType] = useState('');
  const [targetType, setTargetType] = useState('all');
  const [targetId, setTargetId] = useState('');
  const [duration, setDuration] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [userSuggestions, setUserSuggestions] = useState([]);

  // New buff type form state
  const [showNewTypeForm, setShowNewTypeForm] = useState(false);
  const [newType, setNewType] = useState({
    name: '',
    display_name: '',
    description: '',
    icon: '✨',
    effect_type: 'attack_percent',
    effect_value: 10,
    stackable: false,
    max_stacks: 1
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [typesRes, activeRes, guildsRes] = await Promise.all([
        api.get('/buffs/types'),
        api.get('/buffs/active'),
        api.get('/buffs/guilds')
      ]);
      setBuffTypes(typesRes.data.types || []);
      setActiveBuffs(activeRes.data.buffs || []);
      setGuilds(guildsRes.data.guilds || []);
    } catch (error) {
      console.error('Error fetching buff data:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async (query) => {
    if (query.length < 2) {
      setUserSuggestions([]);
      return;
    }
    try {
      const res = await api.get(`/buffs/users/search?q=${encodeURIComponent(query)}`);
      setUserSuggestions(res.data.users || []);
    } catch (error) {
      console.error('Error searching users:', error);
    }
  };

  const applyBuff = async () => {
    if (!selectedBuffType) {
      setMessage('Bitte wähle einen Buff-Typ');
      return;
    }

    const targetConfig = TARGET_TYPES.find(t => t.value === targetType);
    if (targetConfig?.needsId && !targetId) {
      setMessage('Bitte wähle ein Ziel');
      return;
    }

    try {
      const res = await api.post('/buffs/apply', {
        buff_type_id: parseInt(selectedBuffType),
        target_type: targetType,
        target_id: targetConfig?.needsId ? parseInt(targetId) : null,
        duration_minutes: duration
      });
      setMessage(res.data.message);
      fetchData();
      // Reset form
      setSelectedBuffType('');
      setTargetType('all');
      setTargetId('');
      setUserSearch('');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Anwenden');
    }
  };

  const removeBuff = async (buffId) => {
    if (!window.confirm('Buff wirklich entfernen?')) return;
    try {
      await api.delete(`/buffs/active/${buffId}`);
      setMessage('Buff entfernt');
      fetchData();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Entfernen');
    }
  };

  const createBuffType = async () => {
    if (!newType.name || !newType.display_name) {
      setMessage('Name und Anzeigename sind erforderlich');
      return;
    }
    try {
      await api.post('/buffs/types', newType);
      setMessage('Buff-Typ erstellt');
      setShowNewTypeForm(false);
      setNewType({
        name: '',
        display_name: '',
        description: '',
        icon: '✨',
        effect_type: 'attack_percent',
        effect_value: 10,
        stackable: false,
        max_stacks: 1
      });
      fetchData();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Erstellen');
    }
  };

  const deleteBuffType = async (typeId) => {
    if (!window.confirm('Buff-Typ und alle aktiven Buffs dieses Typs wirklich löschen?')) return;
    try {
      await api.delete(`/buffs/types/${typeId}`);
      setMessage('Buff-Typ gelöscht');
      fetchData();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Löschen');
    }
  };

  const formatExpiry = (expiresAt) => {
    if (!expiresAt) return '♾️ Unbegrenzt';
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diff = expiry - now;
    if (diff < 0) return '❌ Abgelaufen';
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const getTargetDescription = (buff) => {
    switch (buff.target_type) {
      case 'all': return '🌍 Alle Spieler';
      case 'user': return `👤 ${buff.target_name || 'Unbekannt'}`;
      case 'guild': return `🏰 ${buff.target_name || 'Unbekannt'}`;
      case 'guildless': return '🚶 Gildenlose';
      case 'level_min': return `📈 Level ${buff.target_id}+`;
      case 'level_max': return `📉 Bis Level ${buff.target_id}`;
      default: return buff.target_type;
    }
  };

  if (loading) {
    return <div className="loading">Lade Buffs...</div>;
  }

  return (
    <div className="buffs-management">
      <h2>✨ Buff-System</h2>
      
      {message && (
        <div className={`message ${message.includes('Fehler') ? 'error' : 'success'}`}>
          {message}
          <button onClick={() => setMessage('')}>×</button>
        </div>
      )}

      <div className="buff-tabs">
        <button 
          className={activeTab === 'apply' ? 'active' : ''} 
          onClick={() => setActiveTab('apply')}
        >
          🎁 Buff anwenden
        </button>
        <button 
          className={activeTab === 'active' ? 'active' : ''} 
          onClick={() => setActiveTab('active')}
        >
          ⚡ Aktive Buffs ({activeBuffs.length})
        </button>
        <button 
          className={activeTab === 'types' ? 'active' : ''} 
          onClick={() => setActiveTab('types')}
        >
          📋 Buff-Typen ({buffTypes.length})
        </button>
      </div>

      {/* Apply Buff Tab */}
      {activeTab === 'apply' && (
        <div className="apply-buff-section">
          <h3>🎁 Buff anwenden</h3>
          
          <div className="form-group">
            <label>Buff-Typ</label>
            <select 
              value={selectedBuffType} 
              onChange={(e) => setSelectedBuffType(e.target.value)}
            >
              <option value="">-- Buff wählen --</option>
              {buffTypes.map(type => (
                <option key={type.id} value={type.id}>
                  {type.icon} {type.display_name} ({type.effect_type}: +{type.effect_value}%)
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Ziel</label>
            <select 
              value={targetType} 
              onChange={(e) => { setTargetType(e.target.value); setTargetId(''); setUserSearch(''); }}
            >
              {TARGET_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* User search */}
          {targetType === 'user' && (
            <div className="form-group">
              <label>Spieler suchen</label>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => { setUserSearch(e.target.value); searchUsers(e.target.value); }}
                placeholder="Spielername eingeben..."
              />
              {userSuggestions.length > 0 && (
                <div className="user-suggestions">
                  {userSuggestions.map(user => (
                    <div 
                      key={user.id} 
                      className={`suggestion ${targetId === String(user.id) ? 'selected' : ''}`}
                      onClick={() => { setTargetId(String(user.id)); setUserSearch(user.username); setUserSuggestions([]); }}
                    >
                      {user.username} <span className="role">({user.role})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Guild select */}
          {targetType === 'guild' && (
            <div className="form-group">
              <label>Gilde</label>
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">-- Gilde wählen --</option>
                {guilds.map(guild => (
                  <option key={guild.id} value={guild.id}>
                    {guild.name} ({guild.member_count} Mitglieder)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Level input */}
          {(targetType === 'level_min' || targetType === 'level_max') && (
            <div className="form-group">
              <label>{targetType === 'level_min' ? 'Mindestlevel' : 'Maximallevel'}</label>
              <input
                type="number"
                min="1"
                max="100"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="Level eingeben..."
              />
            </div>
          )}

          <div className="form-group">
            <label>Dauer</label>
            <select value={duration || ''} onChange={(e) => setDuration(e.target.value ? parseInt(e.target.value) : null)}>
              {DURATION_PRESETS.map(d => (
                <option key={d.value || 'unlimited'} value={d.value || ''}>{d.label}</option>
              ))}
            </select>
          </div>

          <button className="btn-apply" onClick={applyBuff}>
            ✨ Buff anwenden
          </button>
        </div>
      )}

      {/* Active Buffs Tab */}
      {activeTab === 'active' && (
        <div className="active-buffs-section">
          <h3>⚡ Aktive Buffs</h3>
          
          {activeBuffs.length === 0 ? (
            <p className="no-buffs">Keine aktiven Buffs vorhanden.</p>
          ) : (
            <div className="buffs-list">
              {activeBuffs.map(buff => (
                <div key={buff.id} className="buff-card">
                  <div className="buff-icon">{buff.icon}</div>
                  <div className="buff-info">
                    <div className="buff-name">{buff.display_name}</div>
                    <div className="buff-effect">
                      {EFFECT_TYPES.find(e => e.value === buff.effect_type)?.label || buff.effect_type}: +{buff.effect_value * buff.stacks}%
                    </div>
                    <div className="buff-target">{getTargetDescription(buff)}</div>
                    <div className="buff-meta">
                      <span className="buff-expiry">⏱️ {formatExpiry(buff.expires_at)}</span>
                      {buff.stacks > 1 && <span className="buff-stacks">x{buff.stacks}</span>}
                      <span className="buff-creator">von {buff.created_by_name || 'System'}</span>
                    </div>
                  </div>
                  <button className="btn-remove" onClick={() => removeBuff(buff.id)}>
                    ❌
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Buff Types Tab */}
      {activeTab === 'types' && (
        <div className="buff-types-section">
          <div className="types-header">
            <h3>📋 Buff-Typen</h3>
            <button className="btn-new" onClick={() => setShowNewTypeForm(!showNewTypeForm)}>
              {showNewTypeForm ? '❌ Abbrechen' : '➕ Neuer Typ'}
            </button>
          </div>

          {showNewTypeForm && (
            <div className="new-type-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Interner Name</label>
                  <input
                    type="text"
                    value={newType.name}
                    onChange={(e) => setNewType({...newType, name: e.target.value.toLowerCase().replace(/\s/g, '_')})}
                    placeholder="z.B. super_strength"
                  />
                </div>
                <div className="form-group">
                  <label>Anzeigename</label>
                  <input
                    type="text"
                    value={newType.display_name}
                    onChange={(e) => setNewType({...newType, display_name: e.target.value})}
                    placeholder="z.B. Super-Stärke"
                  />
                </div>
                <div className="form-group small">
                  <label>Icon</label>
                  <input
                    type="text"
                    value={newType.icon}
                    onChange={(e) => setNewType({...newType, icon: e.target.value})}
                    maxLength={2}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Beschreibung</label>
                <input
                  type="text"
                  value={newType.description}
                  onChange={(e) => setNewType({...newType, description: e.target.value})}
                  placeholder="Was macht dieser Buff?"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Effekt-Typ</label>
                  <select 
                    value={newType.effect_type} 
                    onChange={(e) => setNewType({...newType, effect_type: e.target.value})}
                  >
                    {EFFECT_TYPES.map(e => (
                      <option key={e.value} value={e.value}>{e.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Wert (%)</label>
                  <input
                    type="number"
                    value={newType.effect_value}
                    onChange={(e) => setNewType({...newType, effect_value: parseFloat(e.target.value)})}
                    min="1"
                    max="1000"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={newType.stackable}
                      onChange={(e) => setNewType({...newType, stackable: e.target.checked})}
                    />
                    Stapelbar
                  </label>
                </div>
                {newType.stackable && (
                  <div className="form-group">
                    <label>Max Stacks</label>
                    <input
                      type="number"
                      value={newType.max_stacks}
                      onChange={(e) => setNewType({...newType, max_stacks: parseInt(e.target.value)})}
                      min="1"
                      max="99"
                    />
                  </div>
                )}
              </div>
              <button className="btn-create" onClick={createBuffType}>
                ✅ Buff-Typ erstellen
              </button>
            </div>
          )}

          <div className="types-list">
            {buffTypes.map(type => (
              <div key={type.id} className="type-card">
                <div className="type-icon">{type.icon}</div>
                <div className="type-info">
                  <div className="type-name">{type.display_name}</div>
                  <div className="type-internal">({type.name})</div>
                  <div className="type-effect">
                    {EFFECT_TYPES.find(e => e.value === type.effect_type)?.label || type.effect_type}: +{type.effect_value}%
                  </div>
                  {type.description && <div className="type-desc">{type.description}</div>}
                  {type.stackable === 1 && <div className="type-stackable">Stapelbar (max {type.max_stacks})</div>}
                </div>
                <button className="btn-delete" onClick={() => deleteBuffType(type.id)}>
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default BuffsManagement;
