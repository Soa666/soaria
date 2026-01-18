import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

function Dashboard() {
  const { user } = useAuth();
  const [playerStats, setPlayerStats] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [combatHistory, setCombatHistory] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, inventoryRes, combatRes] = await Promise.all([
        api.get('/npcs/player/stats'),
        api.get('/inventory'),
        api.get('/combat/history').catch(() => ({ data: { history: [] } }))
      ]);
      
      setPlayerStats(statsRes.data.stats);
      setInventory(inventoryRes.data.inventory || []);
      setCombatHistory(combatRes.data.history?.slice(0, 5) || []);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleHeal = async () => {
    try {
      const response = await api.post('/combat/heal');
      alert(response.data.message);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Fehler beim Heilen');
    }
  };

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
                  backgroundPosition: '-32px 0',
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
              <button className="heal-btn" onClick={handleHeal}>💊 Heilen</button>
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
            <div className="core-stat-value">{playerStats?.base_attack || 10}</div>
            <div className="core-stat-label">Angriff</div>
          </div>
          <div className="core-stat">
            <div className="core-stat-icon">🛡️</div>
            <div className="core-stat-value">{playerStats?.base_defense || 5}</div>
            <div className="core-stat-label">Verteidigung</div>
          </div>
        </div>

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
        <div className="inventory-header">
          <h2>🎒 Inventar</h2>
          <div className="inventory-summary">
            <span>{inventory.reduce((sum, i) => sum + i.quantity, 0)} Items</span>
            <span>•</span>
            <span>{inventory.length} Verschiedene</span>
          </div>
        </div>

        {/* Inventory Tabs by Type */}
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
                    <div 
                      key={item.item_id} 
                      className={`inventory-slot ${getRarityClass(item.rarity)} ${selectedItem?.item_id === item.item_id ? 'selected' : ''}`}
                      onClick={() => setSelectedItem(selectedItem?.item_id === item.item_id ? null : item)}
                      title={item.display_name}
                    >
                      <img 
                        src={getImageUrl(item.image_path)} 
                        alt={item.display_name}
                        onError={(e) => { e.target.src = '/placeholder-item.png'; }}
                      />
                      <span className="item-quantity">{item.quantity}</span>
                      <div className="rarity-indicator"></div>
                    </div>
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
      </div>
    </div>
  );
}

export default Dashboard;
