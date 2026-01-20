import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

// Inventory Item Slot with Tooltip
function InventoryItemSlot({ item, isSelected, onClick, getImageUrl, getRarityClass }) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  return (
    <div 
      className={`inventory-slot ${getRarityClass(item.rarity)} ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <img 
        src={getImageUrl(item.image_path)} 
        alt={item.display_name}
        onError={(e) => { e.target.src = '/placeholder-item.png'; }}
      />
      <span className="item-quantity">{item.quantity}</span>
      <div className="rarity-indicator"></div>
      
      {/* Tooltip */}
      {showTooltip && (
        <div className={`item-tooltip ${getRarityClass(item.rarity)}`}>
          <div className="tooltip-name">{item.display_name}</div>
          {item.rarity && item.rarity !== 'common' && (
            <div className="tooltip-rarity">{item.rarity}</div>
          )}
          {item.description && (
            <div className="tooltip-desc">{item.description}</div>
          )}
          <div className="tooltip-qty">Anzahl: {item.quantity}</div>
        </div>
      )}
    </div>
  );
}

// Equipment Slot Component with Tooltip
function EquipmentSlotBox({ slot, equipped, getSlotIcon, getSlotName, onSelect }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const item = equipped[slot];
  
  return (
    <div 
      className={`equipment-slot-box ${item ? 'has-item' : 'empty'}`}
      style={item ? { borderColor: item.quality_color, boxShadow: `0 0 10px ${item.quality_color}40` } : {}}
      onClick={() => item && onSelect(item)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {item ? (
        <span className="slot-item-icon">{getSlotIcon(slot)}</span>
      ) : (
        <span className="slot-empty-icon">{getSlotIcon(slot)}</span>
      )}
      <span className="slot-label">{getSlotName(slot)}</span>
      
      {/* Tooltip */}
      {showTooltip && item && (
        <div className="equipment-tooltip" style={{ borderColor: item.quality_color }}>
          <div className="tooltip-header" style={{ color: item.quality_color }}>
            {item.display_name}
          </div>
          <div className="tooltip-quality" style={{ color: item.quality_color }}>
            {item.quality_name}
          </div>
          <div className="tooltip-stats">
            {item.actual_attack > 0 && <span>⚔️ +{item.actual_attack}</span>}
            {item.actual_defense > 0 && <span>🛡️ +{item.actual_defense}</span>}
            {item.actual_health > 0 && <span>❤️ +{item.actual_health}</span>}
          </div>
          <div className="tooltip-hint">Klicken für Details</div>
        </div>
      )}
      
      {/* Empty slot tooltip */}
      {showTooltip && !item && (
        <div className="equipment-tooltip empty-tooltip">
          <div className="tooltip-header">{getSlotName(slot)}</div>
          <div className="tooltip-hint">Kein Item ausgerüstet</div>
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const [playerStats, setPlayerStats] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [combatHistory, setCombatHistory] = useState([]);
  const [equipped, setEquipped] = useState({});
  const [equipmentInventory, setEquipmentInventory] = useState([]);
  const [equipmentTotalStats, setEquipmentTotalStats] = useState({ attack: 0, defense: 0, health: 0 });
  const [professions, setProfessions] = useState([]);
  const [activeBuffs, setActiveBuffs] = useState([]);
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory', 'equipment', 'professions'
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, inventoryRes, combatRes, equippedRes, equipInvRes, profRes, buffsRes] = await Promise.all([
        api.get('/npcs/player/stats'),
        api.get('/inventory'),
        api.get('/combat/history').catch(() => ({ data: { history: [] } })),
        api.get('/equipment/equipped').catch(() => ({ data: { equippedBySlot: {}, totalStats: {} } })),
        api.get('/equipment/inventory').catch(() => ({ data: { equipment: [] } })),
        api.get('/equipment/professions').catch(() => ({ data: { professions: [] } })),
        api.get('/buffs/my').catch(() => ({ data: { buffs: [] } }))
      ]);
      
      setPlayerStats(statsRes.data.stats);
      setInventory(inventoryRes.data.inventory || []);
      setCombatHistory(combatRes.data.history?.slice(0, 5) || []);
      setEquipped(equippedRes.data.equippedBySlot || {});
      setEquipmentTotalStats(equippedRes.data.totalStats || { attack: 0, defense: 0, health: 0 });
      setEquipmentInventory(equipInvRes.data.equipment || []);
      setProfessions(profRes.data.professions || []);
      setActiveBuffs(buffsRes.data.buffs || []);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEquip = async (equipmentId) => {
    try {
      const response = await api.post(`/equipment/equip/${equipmentId}`);
      setMessage(response.data.message);
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Anlegen');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleUnequip = async (equipmentId) => {
    try {
      const response = await api.post(`/equipment/unequip/${equipmentId}`);
      setMessage(response.data.message);
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Ablegen');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleSellEquipment = async (equipmentId) => {
    if (!window.confirm('Ausrüstung wirklich verkaufen?')) return;
    try {
      const response = await api.delete(`/equipment/${equipmentId}?sell=true`);
      setMessage(response.data.message);
      setSelectedEquipment(null);
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Verkaufen');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // Healing is only available on Grundstück page, not here

  const getExpForLevel = (level) => {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  };

  const getImageUrl = (imagePath) => {
    if (!imagePath) return '/placeholder-item.png';
    if (imagePath.startsWith('http')) return imagePath;
    return `/items/${imagePath}`;
  };

  const getRarityClass = (rarity) => {
    return `rarity-${rarity || 'common'}`;
  };

  const getTypeIcon = (type) => {
    const icons = {
      resource: '🪨',
      tool: '🔧',
      material: '📦',
      weapon: '⚔️',
      armor: '🛡️',
      consumable: '🧪',
      other: '❓'
    };
    return icons[type] || icons.other;
  };

  const getSlotIcon = (slot) => {
    const icons = {
      weapon: '⚔️',
      shield: '🛡️',
      head: '🪖',
      chest: '👕',
      legs: '👖',
      feet: '👢',
      hands: '🧤',
      accessory: '💍'
    };
    return icons[slot] || '❓';
  };

  const getSlotName = (slot) => {
    const names = {
      weapon: 'Waffe',
      shield: 'Schild',
      head: 'Kopf',
      chest: 'Brust',
      legs: 'Beine',
      feet: 'Füße',
      hands: 'Hände',
      accessory: 'Accessoire'
    };
    return names[slot] || slot;
  };

  const getProfessionIcon = (profession) => {
    const icons = {
      blacksmith: '⚒️',
      leatherworker: '🧵',
      tailor: '✂️',
      alchemist: '⚗️'
    };
    return icons[profession] || '🔨';
  };

  if (loading) {
    return <div className="container"><div className="loading">Lädt Charakter...</div></div>;
  }

  const expNeeded = playerStats ? getExpForLevel(playerStats.level + 1) : 100;
  const expPercent = playerStats ? (playerStats.experience / expNeeded) * 100 : 0;
  const hpPercent = playerStats ? (playerStats.current_health / playerStats.max_health) * 100 : 100;

  // Group inventory by type
  const inventoryByType = inventory.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {});

  return (
    <div className="dashboard-container">
      {/* Character Panel - Left Side */}
      <div className="character-panel">
        <div className="character-header">
          <div className="character-avatar">
            {user?.avatar_path ? (
              <div 
                className="avatar-sprite"
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  backgroundImage: `url(/chars/${user.avatar_path})`,
                  backgroundPosition: 'center top',
                  backgroundSize: '300% 400%',
                  imageRendering: 'pixelated'
                }}
              />
            ) : (
              <div className="avatar-placeholder">⚔️</div>
            )}
          </div>
          <div className="character-info">
            <h1 className="character-name">{user?.username}</h1>
            <div className="character-title">Abenteurer</div>
            <div className="character-level">Level {playerStats?.level || 1}</div>
          </div>
        </div>

        {/* Stats Bars */}
        <div className="stats-bars">
          <div className="stat-bar-container">
            <div className="stat-bar-label">
              <span>❤️ HP</span>
              <span>{playerStats?.current_health || 0} / {playerStats?.max_health || 100}</span>
            </div>
            <div className="stat-bar health-bar">
              <div 
                className="stat-bar-fill health-fill" 
                style={{ width: `${hpPercent}%` }}
              />
            </div>
            {hpPercent < 100 && (
              <span className="heal-hint">🏠 Geh nach Hause zum Heilen</span>
            )}
          </div>

          <div className="stat-bar-container">
            <div className="stat-bar-label">
              <span>✨ EP</span>
              <span>{playerStats?.experience || 0} / {expNeeded}</span>
            </div>
            <div className="stat-bar exp-bar">
              <div 
                className="stat-bar-fill exp-fill" 
                style={{ width: `${expPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Core Stats */}
        <div className="core-stats">
          <div className="core-stat">
            <div className="core-stat-icon">💰</div>
            <div className="core-stat-value">{playerStats?.gold || 0}</div>
            <div className="core-stat-label">Gold</div>
          </div>
          <div className="core-stat">
            <div className="core-stat-icon">⚔️</div>
            <div className="core-stat-value">
              {playerStats?.base_attack || 10}
              {equipmentTotalStats.attack > 0 && (
                <span className="equip-bonus">+{equipmentTotalStats.attack}</span>
              )}
            </div>
            <div className="core-stat-label">Angriff</div>
          </div>
          <div className="core-stat">
            <div className="core-stat-icon">🛡️</div>
            <div className="core-stat-value">
              {playerStats?.base_defense || 5}
              {equipmentTotalStats.defense > 0 && (
                <span className="equip-bonus">+{equipmentTotalStats.defense}</span>
              )}
            </div>
            <div className="core-stat-label">Verteidigung</div>
          </div>
          <div className="core-stat">
            <div className="core-stat-icon">❤️</div>
            <div className="core-stat-value">
              {playerStats?.max_health || 100}
              {equipmentTotalStats.health > 0 && (
                <span className="equip-bonus">+{equipmentTotalStats.health}</span>
              )}
            </div>
            <div className="core-stat-label">Max HP</div>
          </div>
        </div>

        {/* Equipment Slots Visual */}
        <div className="equipment-slots">
          <h3>⚔️ Ausrüstung</h3>
          <div className="equipment-visual">
            {/* Character silhouette with slots */}
            <div className="equipment-body">
              {/* Top row: Head */}
              <div className="equipment-row top-row">
                <EquipmentSlotBox 
                  slot="head" 
                  equipped={equipped} 
                  getSlotIcon={getSlotIcon} 
                  getSlotName={getSlotName}
                  onSelect={setSelectedEquipment}
                />
              </div>
              
              {/* Middle row: Weapon, Chest, Shield */}
              <div className="equipment-row middle-row">
                <EquipmentSlotBox 
                  slot="weapon" 
                  equipped={equipped} 
                  getSlotIcon={getSlotIcon} 
                  getSlotName={getSlotName}
                  onSelect={setSelectedEquipment}
                />
                <EquipmentSlotBox 
                  slot="chest" 
                  equipped={equipped} 
                  getSlotIcon={getSlotIcon} 
                  getSlotName={getSlotName}
                  onSelect={setSelectedEquipment}
                />
                <EquipmentSlotBox 
                  slot="shield" 
                  equipped={equipped} 
                  getSlotIcon={getSlotIcon} 
                  getSlotName={getSlotName}
                  onSelect={setSelectedEquipment}
                />
              </div>
              
              {/* Hands row */}
              <div className="equipment-row hands-row">
                <EquipmentSlotBox 
                  slot="hands" 
                  equipped={equipped} 
                  getSlotIcon={getSlotIcon} 
                  getSlotName={getSlotName}
                  onSelect={setSelectedEquipment}
                />
                <EquipmentSlotBox 
                  slot="legs" 
                  equipped={equipped} 
                  getSlotIcon={getSlotIcon} 
                  getSlotName={getSlotName}
                  onSelect={setSelectedEquipment}
                />
                <EquipmentSlotBox 
                  slot="accessory" 
                  equipped={equipped} 
                  getSlotIcon={getSlotIcon} 
                  getSlotName={getSlotName}
                  onSelect={setSelectedEquipment}
                />
              </div>
              
              {/* Bottom row: Feet */}
              <div className="equipment-row bottom-row">
                <EquipmentSlotBox 
                  slot="feet" 
                  equipped={equipped} 
                  getSlotIcon={getSlotIcon} 
                  getSlotName={getSlotName}
                  onSelect={setSelectedEquipment}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Active Buffs */}
        {activeBuffs.length > 0 && (
          <div className="active-buffs">
            <h3>✨ Aktive Buffs</h3>
            <div className="buffs-list">
              {activeBuffs.map((buff, idx) => (
                <div key={idx} className="buff-item" title={buff.description}>
                  <span className="buff-icon">{buff.icon}</span>
                  <span className="buff-name">{buff.display_name}</span>
                  <span className="buff-value">+{buff.effect_value * buff.stacks}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Combat History */}
        <div className="combat-history">
          <h3>⚔️ Letzte Kämpfe</h3>
          {combatHistory.length === 0 ? (
            <p className="no-history">Noch keine Kämpfe</p>
          ) : (
            <div className="history-list">
              {combatHistory.map((fight, idx) => (
                <div key={idx} className={`history-item ${fight.winner === 'attacker' ? 'win' : 'loss'}`}>
                  <span className="history-result">{fight.winner === 'attacker' ? '🏆' : '💀'}</span>
                  <span className="history-monster">{fight.monster_name || 'Unbekannt'}</span>
                  <span className="history-gold">+{fight.gold_gained || 0} 💰</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="quick-links">
          <a href="/map" className="quick-link">🗺️ Weltkarte</a>
          <a href="/grundstueck" className="quick-link">🏡 Grundstück</a>
          <a href="/guilds" className="quick-link">⚔️ Gilden</a>
        </div>
      </div>

      {/* Inventory Panel - Right Side */}
      <div className="inventory-panel">
        {message && (
          <div className={`message ${message.includes('Fehler') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}
        
        <div className="inventory-tabs">
          <button 
            className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('inventory')}
          >
            🎒 Inventar
          </button>
          <button 
            className={`tab-btn ${activeTab === 'equipment' ? 'active' : ''}`}
            onClick={() => setActiveTab('equipment')}
          >
            ⚔️ Ausrüstung ({equipmentInventory.length})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'professions' ? 'active' : ''}`}
            onClick={() => setActiveTab('professions')}
          >
            🔨 Berufe
          </button>
        </div>

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <>
            <div className="inventory-header">
              <h2>🎒 Inventar</h2>
              <div className="inventory-summary">
                <span>{inventory.reduce((sum, i) => sum + i.quantity, 0)} Items</span>
                <span>•</span>
                <span>{inventory.length} Verschiedene</span>
              </div>
            </div>
            <div className="inventory-content">
              {Object.entries(inventoryByType).length === 0 ? (
                <div className="empty-inventory">
                  <div className="empty-icon">📦</div>
                  <p>Dein Inventar ist leer</p>
                  <a href="/collection" className="btn-collect">⛏️ Ressourcen sammeln</a>
                </div>
              ) : (
                Object.entries(inventoryByType).map(([type, items]) => (
                  <div key={type} className="inventory-section">
                    <h3 className="section-title">
                      {getTypeIcon(type)} {type.charAt(0).toUpperCase() + type.slice(1)}
                      <span className="section-count">({items.length})</span>
                    </h3>
                    <div className="inventory-grid">
                      {items.map((item) => (
                        <InventoryItemSlot
                          key={item.item_id}
                          item={item}
                          isSelected={selectedItem?.item_id === item.item_id}
                          onClick={() => setSelectedItem(selectedItem?.item_id === item.item_id ? null : item)}
                          getImageUrl={getImageUrl}
                          getRarityClass={getRarityClass}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Item Details Tooltip */}
            {selectedItem && (
              <div className="item-details">
                <div className={`item-details-header ${getRarityClass(selectedItem.rarity)}`}>
                  <img 
                    src={getImageUrl(selectedItem.image_path)} 
                    alt={selectedItem.display_name}
                    className="item-details-image"
                  />
                  <div className="item-details-info">
                    <h4>{selectedItem.display_name}</h4>
                    <span className={`item-rarity ${getRarityClass(selectedItem.rarity)}`}>
                      {selectedItem.rarity || 'common'}
                    </span>
                  </div>
                </div>
                <div className="item-details-body">
                  <p className="item-type">{getTypeIcon(selectedItem.type)} {selectedItem.type}</p>
                  {selectedItem.description && (
                    <p className="item-description">{selectedItem.description}</p>
                  )}
                  <p className="item-owned">Im Besitz: <strong>{selectedItem.quantity}</strong></p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Equipment Tab */}
        {activeTab === 'equipment' && (
          <div className="equipment-tab">
            <div className="inventory-header">
              <h2>⚔️ Ausrüstung</h2>
              <a href="/grundstueck?view=smithy" className="btn-craft-link">🔨 Schmiede</a>
            </div>
            
            {equipmentInventory.length === 0 ? (
              <div className="empty-inventory">
                <div className="empty-icon">⚔️</div>
                <p>Du hast keine Ausrüstung</p>
                <a href="/grundstueck?view=smithy" className="btn-collect">🔨 Zur Schmiede</a>
              </div>
            ) : (
              <div className="equipment-list">
                {equipmentInventory.map(eq => (
                  <div 
                    key={eq.id} 
                    className={`equipment-item ${eq.is_equipped ? 'equipped' : ''}`}
                    onClick={() => setSelectedEquipment(selectedEquipment?.id === eq.id ? null : eq)}
                  >
                    <div className="equip-icon" style={{ borderColor: eq.quality_color }}>
                      {getSlotIcon(eq.slot)}
                    </div>
                    <div className="equip-info">
                      <span className="equip-name" style={{ color: eq.quality_color }}>
                        {eq.display_name}
                      </span>
                      <span className="equip-quality">{eq.quality_name}</span>
                      <div className="equip-stats">
                        {eq.actual_attack > 0 && <span>⚔️ +{eq.actual_attack}</span>}
                        {eq.actual_defense > 0 && <span>🛡️ +{eq.actual_defense}</span>}
                        {eq.actual_health > 0 && <span>❤️ +{eq.actual_health}</span>}
                      </div>
                    </div>
                    <div className="equip-actions">
                      {eq.is_equipped ? (
                        <button className="btn-unequip" onClick={(e) => { e.stopPropagation(); handleUnequip(eq.id); }}>
                          Ablegen
                        </button>
                      ) : (
                        <button className="btn-equip" onClick={(e) => { e.stopPropagation(); handleEquip(eq.id); }}>
                          Anlegen
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Equipment Details */}
            {selectedEquipment && (
              <div className="equipment-details">
                <h4 style={{ color: selectedEquipment.quality_color }}>
                  {selectedEquipment.display_name}
                </h4>
                <p className="equip-detail-quality">{selectedEquipment.quality_name} Qualität</p>
                <p className="equip-detail-slot">{getSlotIcon(selectedEquipment.slot)} {getSlotName(selectedEquipment.slot)}</p>
                {selectedEquipment.description && (
                  <p className="equip-detail-desc">{selectedEquipment.description}</p>
                )}
                <div className="equip-detail-stats">
                  {selectedEquipment.actual_attack > 0 && (
                    <div className="stat-row">⚔️ Angriff: <span className="stat-bonus">+{selectedEquipment.actual_attack}</span></div>
                  )}
                  {selectedEquipment.actual_defense > 0 && (
                    <div className="stat-row">🛡️ Verteidigung: <span className="stat-bonus">+{selectedEquipment.actual_defense}</span></div>
                  )}
                  {selectedEquipment.actual_health > 0 && (
                    <div className="stat-row">❤️ Max HP: <span className="stat-bonus">+{selectedEquipment.actual_health}</span></div>
                  )}
                </div>
                <div className="equip-detail-actions">
                  <button 
                    className="btn-sell" 
                    onClick={() => handleSellEquipment(selectedEquipment.id)}
                  >
                    💰 Verkaufen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Professions Tab */}
        {activeTab === 'professions' && (
          <div className="professions-tab">
            <div className="inventory-header">
              <h2>🔨 Berufe</h2>
            </div>
            
            <div className="professions-list">
              {professions.map(prof => (
                <div key={prof.profession} className="profession-item">
                  <div className="profession-icon">{getProfessionIcon(prof.profession)}</div>
                  <div className="profession-info">
                    <span className="profession-name">{prof.display_name}</span>
                    <span className="profession-level">Level {prof.level}</span>
                    <div className="profession-exp-bar">
                      <div 
                        className="profession-exp-fill" 
                        style={{ width: `${prof.progress_percent}%` }}
                      />
                    </div>
                    <span className="profession-exp-text">
                      {prof.experience} / {prof.exp_for_next_level} EP
                    </span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="profession-info-box">
              <h4>💡 Berufe leveln</h4>
              <p>Stelle Ausrüstung in der Schmiede her um Erfahrung zu sammeln.</p>
              <p>Höheres Berufslevel = bessere Qualitätschance!</p>
              <a href="/grundstueck?view=smithy" className="btn-craft-link">🔨 Zur Schmiede</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
