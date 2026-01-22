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
  { value: 5, label: '5 Minuten' },
  { value: 10, label: '10 Minuten' },
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
  const [activeTab, setActiveTab] = useState('active'); // 'active', 'types', 'apply', 'events'
  const [buffTypes, setBuffTypes] = useState([]);
  const [activeBuffs, setActiveBuffs] = useState([]);
  const [guilds, setGuilds] = useState([]);
  const [buffEvents, setBuffEvents] = useState([]);
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

  // Event form state
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState({
    name: '',
    description: '',
    buff_type_id: '',
    target_type: 'all',
    target_id: '',
    stacks: 1,
    start_date: '',
    start_time: '00:00',
    end_date: '',
    end_time: '23:59',
    enabled: true
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [typesRes, activeRes, guildsRes, eventsRes] = await Promise.all([
        api.get('/buffs/types'),
        api.get('/buffs/active'),
        api.get('/buffs/guilds'),
        api.get('/buffs/events').catch(() => ({ data: { events: [] } }))
      ]);
      setBuffTypes(typesRes.data.types || []);
      setActiveBuffs(activeRes.data.buffs || []);
      setGuilds(guildsRes.data.guilds || []);
      setBuffEvents(eventsRes.data.events || []);
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
      if (targetType === 'user') {
        setMessage('Bitte wähle einen Spieler aus der Liste');
      } else if (targetType === 'guild') {
        setMessage('Bitte wähle eine Gilde');
      } else {
        setMessage('Bitte gib ein Level ein');
      }
      return;
    }

    try {
      const res = await api.post('/buffs/apply', {
        buff_type_id: parseInt(selectedBuffType),
        target_type: targetType,
        target_id: targetConfig?.needsId ? parseInt(targetId) : null,
        duration_minutes: duration
      });
      console.log('Buff applied:', res.data);
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

  // Event management functions
  const createEvent = async () => {
    if (!eventForm.name || !eventForm.buff_type_id || !eventForm.start_date || !eventForm.end_date) {
      setMessage('Bitte fülle alle Pflichtfelder aus');
      return;
    }
    try {
      await api.post('/buffs/events', {
        ...eventForm,
        start_time: eventForm.start_time + ':00',
        end_time: eventForm.end_time + ':00'
      });
      setMessage('Event erstellt');
      setShowEventForm(false);
      setEventForm({
        name: '',
        description: '',
        buff_type_id: '',
        target_type: 'all',
        target_id: '',
        stacks: 1,
        start_date: '',
        start_time: '00:00',
        end_date: '',
        end_time: '23:59',
        enabled: true
      });
      fetchData();
    } catch (error) {
      setMessage('Fehler: ' + (error.response?.data?.error || error.message));
    }
  };

  const updateEvent = async () => {
    if (!editingEvent) return;
    try {
      await api.put(`/buffs/events/${editingEvent.id}`, {
        ...eventForm,
        start_time: eventForm.start_time + ':00',
        end_time: eventForm.end_time + ':00'
      });
      setMessage('Event aktualisiert');
      setShowEventForm(false);
      setEditingEvent(null);
      setEventForm({
        name: '',
        description: '',
        buff_type_id: '',
        target_type: 'all',
        target_id: '',
        stacks: 1,
        start_date: '',
        start_time: '00:00',
        end_date: '',
        end_time: '23:59',
        enabled: true
      });
      fetchData();
    } catch (error) {
      setMessage('Fehler: ' + (error.response?.data?.error || error.message));
    }
  };

  const deleteEvent = async (eventId) => {
    if (!window.confirm('Event wirklich löschen?')) return;
    try {
      await api.delete(`/buffs/events/${eventId}`);
      setMessage('Event gelöscht');
      fetchData();
    } catch (error) {
      setMessage('Fehler: ' + (error.response?.data?.error || error.message));
    }
  };

  const editEvent = (event) => {
    setEditingEvent(event);
    setEventForm({
      name: event.name,
      description: event.description || '',
      buff_type_id: event.buff_type_id,
      target_type: event.target_type,
      target_id: event.target_id || '',
      stacks: event.stacks || 1,
      start_date: event.start_date,
      start_time: event.start_time ? event.start_time.substring(0, 5) : '00:00',
      end_date: event.end_date,
      end_time: event.end_time ? event.end_time.substring(0, 5) : '23:59',
      enabled: event.enabled === 1
    });
    setShowEventForm(true);
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
        <button 
          className={activeTab === 'events' ? 'active' : ''} 
          onClick={() => setActiveTab('events')}
        >
          📅 Events ({buffEvents.length})
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
              <label>Spieler suchen {targetId && <span className="selected-indicator">✓ Ausgewählt</span>}</label>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => { 
                  setUserSearch(e.target.value); 
                  searchUsers(e.target.value);
                  // Clear targetId when typing new search
                  if (e.target.value !== userSearch) {
                    setTargetId('');
                  }
                }}
                placeholder="Spielername eingeben..."
                className={targetId ? 'has-selection' : ''}
              />
              {userSuggestions.length > 0 && (
                <div className="user-suggestions">
                  {userSuggestions.map(user => (
                    <div 
                      key={user.id} 
                      className={`suggestion ${targetId === String(user.id) ? 'selected' : ''}`}
                      onClick={() => { 
                        setTargetId(String(user.id)); 
                        setUserSearch(user.username); 
                        setUserSuggestions([]); 
                      }}
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

      {/* Events Tab */}
      {activeTab === 'events' && (
        <div className="events-section">
          <div className="section-header">
            <h3>📅 Buff-Events</h3>
            <button className="btn-new" onClick={() => { setShowEventForm(!showEventForm); setEditingEvent(null); setEventForm({
              name: '',
              description: '',
              buff_type_id: '',
              target_type: 'all',
              target_id: '',
              stacks: 1,
              start_date: '',
              start_time: '00:00',
              end_date: '',
              end_time: '23:59',
              enabled: true
            }); }}>
              {showEventForm ? '❌ Abbrechen' : '➕ Neues Event'}
            </button>
          </div>

          {showEventForm && (
            <div className="event-form">
              <h4>{editingEvent ? 'Event bearbeiten' : 'Neues Event erstellen'}</h4>
              <div className="form-group">
                <label>Event-Name *</label>
                <input
                  type="text"
                  value={eventForm.name}
                  onChange={(e) => setEventForm({...eventForm, name: e.target.value})}
                  placeholder="z.B. Weihnachten 2024"
                />
              </div>
              <div className="form-group">
                <label>Beschreibung</label>
                <textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm({...eventForm, description: e.target.value})}
                  placeholder="Optional: Beschreibung des Events"
                />
              </div>
              <div className="form-group">
                <label>Buff-Typ *</label>
                <select
                  value={eventForm.buff_type_id}
                  onChange={(e) => setEventForm({...eventForm, buff_type_id: e.target.value})}
                >
                  <option value="">-- Buff wählen --</option>
                  {buffTypes.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.icon} {type.display_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Ziel *</label>
                <select
                  value={eventForm.target_type}
                  onChange={(e) => { setEventForm({...eventForm, target_type: e.target.value, target_id: ''}); setUserSearch(''); }}
                >
                  {TARGET_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              {eventForm.target_type === 'user' && (
                <div className="form-group">
                  <label>Spieler suchen</label>
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => { 
                      setUserSearch(e.target.value); 
                      searchUsers(e.target.value);
                    }}
                    placeholder="Spielername eingeben..."
                  />
                  {userSuggestions.length > 0 && (
                    <div className="user-suggestions">
                      {userSuggestions.map(user => (
                        <div key={user.id} onClick={() => {
                          setEventForm({...eventForm, target_id: user.id});
                          setUserSearch(user.username);
                          setUserSuggestions([]);
                        }}>
                          {user.username}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {eventForm.target_type === 'guild' && (
                <div className="form-group">
                  <label>Gilde</label>
                  <select
                    value={eventForm.target_id}
                    onChange={(e) => setEventForm({...eventForm, target_id: e.target.value})}
                  >
                    <option value="">-- Gilde wählen --</option>
                    {guilds.map(guild => (
                      <option key={guild.id} value={guild.id}>
                        {guild.name} ({guild.member_count} Mitglieder)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(eventForm.target_type === 'level_min' || eventForm.target_type === 'level_max') && (
                <div className="form-group">
                  <label>{eventForm.target_type === 'level_min' ? 'Mindestlevel' : 'Maximallevel'}</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={eventForm.target_id}
                    onChange={(e) => setEventForm({...eventForm, target_id: e.target.value})}
                  />
                </div>
              )}
              <div className="form-group">
                <label>Stacks</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={eventForm.stacks}
                  onChange={(e) => setEventForm({...eventForm, stacks: parseInt(e.target.value) || 1})}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Start-Datum *</label>
                  <input
                    type="date"
                    value={eventForm.start_date}
                    onChange={(e) => setEventForm({...eventForm, start_date: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Start-Zeit</label>
                  <input
                    type="time"
                    value={eventForm.start_time}
                    onChange={(e) => setEventForm({...eventForm, start_time: e.target.value})}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>End-Datum *</label>
                  <input
                    type="date"
                    value={eventForm.end_date}
                    onChange={(e) => setEventForm({...eventForm, end_date: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>End-Zeit</label>
                  <input
                    type="time"
                    value={eventForm.end_time}
                    onChange={(e) => setEventForm({...eventForm, end_time: e.target.value})}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={eventForm.enabled}
                    onChange={(e) => setEventForm({...eventForm, enabled: e.target.checked})}
                  />
                  Aktiviert
                </label>
              </div>
              <button className="btn-create" onClick={editingEvent ? updateEvent : createEvent}>
                {editingEvent ? '✅ Event aktualisieren' : '✅ Event erstellen'}
              </button>
            </div>
          )}

          <div className="events-list">
            {buffEvents.length === 0 ? (
              <p className="no-events">Keine Events vorhanden.</p>
            ) : (
              buffEvents.map(event => {
                const startDate = new Date(`${event.start_date}T${event.start_time || '00:00:00'}`);
                const endDate = new Date(`${event.end_date}T${event.end_time || '23:59:59'}`);
                const now = new Date();
                const isActive = now >= startDate && now <= endDate;
                
                return (
                  <div key={event.id} className={`event-card ${!event.enabled ? 'disabled' : ''} ${isActive ? 'active' : ''}`}>
                    <div className="event-header">
                      <div>
                        <h4>{event.name}</h4>
                        {event.description && <p className="event-description">{event.description}</p>}
                      </div>
                      <div className="event-actions">
                        <button className="btn-edit" onClick={() => editEvent(event)}>✏️</button>
                        <button className="btn-delete" onClick={() => deleteEvent(event.id)}>🗑️</button>
                      </div>
                    </div>
                    <div className="event-details">
                      <div className="event-buff">
                        <span className="buff-icon">{event.buff_icon}</span>
                        <span>{event.buff_name}</span>
                        {event.stacks > 1 && <span className="stacks">x{event.stacks}</span>}
                      </div>
                      <div className="event-target">
                        {getTargetDescription({target_type: event.target_type, target_name: event.target_name || ''})}
                      </div>
                      <div className="event-dates">
                        <div>
                          <strong>Start:</strong> {new Date(`${event.start_date}T${event.start_time || '00:00:00'}`).toLocaleString('de-DE')}
                        </div>
                        <div>
                          <strong>Ende:</strong> {new Date(`${event.end_date}T${event.end_time || '23:59:59'}`).toLocaleString('de-DE')}
                        </div>
                      </div>
                      <div className="event-status">
                        {!event.enabled && <span className="status-badge disabled">Deaktiviert</span>}
                        {event.enabled && isActive && <span className="status-badge active">Aktiv</span>}
                        {event.enabled && !isActive && now < startDate && <span className="status-badge upcoming">Geplant</span>}
                        {event.enabled && !isActive && now > endDate && <span className="status-badge ended">Beendet</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BuffsManagement;
