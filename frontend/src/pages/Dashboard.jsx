import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalItems: 0,
    uniqueItems: 0,
    totalBuildings: 0,
    buildingsBuilt: 0,
    topResources: [],
    inventoryByType: {}
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Fetch inventory
      const inventoryResponse = await api.get('/inventory');
      const inventory = inventoryResponse.data.inventory || [];
      
      // Fetch buildings
      const buildingsResponse = await api.get('/buildings/my-buildings');
      const myBuildings = buildingsResponse.data.buildings || [];
      
      // Calculate statistics
      const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
      const uniqueItems = inventory.length;
      
      // Group by type
      const inventoryByType = {};
      inventory.forEach(item => {
        if (!inventoryByType[item.type]) {
          inventoryByType[item.type] = { count: 0, items: [] };
        }
        inventoryByType[item.type].count += item.quantity;
        inventoryByType[item.type].items.push(item);
      });
      
      // Get top resources (by quantity)
      const resources = inventory
        .filter(item => item.type === 'resource')
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);
      
      // Building stats
      const totalBuildings = myBuildings.length;
      const buildingsBuilt = myBuildings.filter(b => b.level > 0).length;
      
      setStats({
        totalItems,
        uniqueItems,
        totalBuildings,
        buildingsBuilt,
        topResources: resources,
        inventoryByType
      });
    } catch (error) {
      console.error('Fehler beim Laden der Statistiken:', error);
    } finally {
      setLoading(false);
    }
  };

  const getImageUrl = (imagePath) => {
    if (!imagePath) {
      return '/placeholder-item.png';
    }
    if (imagePath.startsWith('http')) {
      return imagePath;
    }
    return `/items/${imagePath}`;
  };

  const getRarityColor = (rarity) => {
    const colors = {
      common: '#9e9e9e',
      uncommon: '#4caf50',
      rare: '#2196f3',
      epic: '#9c27b0',
      legendary: '#ff9800'
    };
    return colors[rarity] || colors.common;
  };

  if (loading) {
    return <div className="container"><div className="loading">Lädt...</div></div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h1>📊 Dashboard</h1>
        <p className="dashboard-subtitle">Willkommen zurück, {user?.username}!</p>
        
        {/* Overview Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📦</div>
            <div className="stat-content">
              <h3>{stats.totalItems}</h3>
              <p>Items gesamt</p>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">🎯</div>
            <div className="stat-content">
              <h3>{stats.uniqueItems}</h3>
              <p>Verschiedene Items</p>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">🏠</div>
            <div className="stat-content">
              <h3>{stats.buildingsBuilt}</h3>
              <p>Gebäude gebaut</p>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">⚡</div>
            <div className="stat-content">
              <h3>{Object.keys(stats.inventoryByType).length}</h3>
              <p>Item-Kategorien</p>
            </div>
          </div>
        </div>

        {/* Top Resources */}
        {stats.topResources.length > 0 && (
          <div className="dashboard-section">
            <h2>🌟 Top Ressourcen</h2>
            <div className="top-resources-grid">
              {stats.topResources.map((resource, index) => (
                <div key={resource.item_id} className="top-resource-card">
                  <div className="resource-rank">#{index + 1}</div>
                  <div className="resource-image-container">
                    <img
                      src={getImageUrl(resource.image_path)}
                      alt={resource.display_name}
                      className="resource-image"
                      onError={(e) => {
                        e.target.src = '/placeholder-item.png';
                      }}
                    />
                  </div>
                  <div className="resource-details">
                    <h4>{resource.display_name}</h4>
                    <p className="resource-quantity">{resource.quantity}x</p>
                    <span 
                      className="resource-rarity"
                      style={{ color: getRarityColor(resource.rarity) }}
                    >
                      {resource.rarity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inventory by Type */}
        {Object.keys(stats.inventoryByType).length > 0 && (
          <div className="dashboard-section">
            <h2>📋 Inventar nach Kategorie</h2>
            <div className="inventory-types-grid">
              {Object.entries(stats.inventoryByType).map(([type, data]) => (
                <div key={type} className="type-card">
                  <h3 className="type-name">{type.charAt(0).toUpperCase() + type.slice(1)}</h3>
                  <div className="type-stats">
                    <div className="type-stat">
                      <span className="type-stat-value">{data.count}</span>
                      <span className="type-stat-label">Items</span>
                    </div>
                    <div className="type-stat">
                      <span className="type-stat-value">{data.items.length}</span>
                      <span className="type-stat-label">Verschiedene</span>
                    </div>
                  </div>
                  <div className="type-items-preview">
                    {data.items.slice(0, 3).map((item) => (
                      <div key={item.item_id} className="type-item-preview">
                        <img
                          src={getImageUrl(item.image_path)}
                          alt={item.display_name}
                          className="preview-image"
                          onError={(e) => {
                            e.target.src = '/placeholder-item.png';
                          }}
                        />
                        <span className="preview-quantity">{item.quantity}</span>
                      </div>
                    ))}
                    {data.items.length > 3 && (
                      <div className="type-item-more">+{data.items.length - 3}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="dashboard-section">
          <h2>⚡ Schnellzugriff</h2>
          <div className="quick-actions">
            <a href="/inventory" className="quick-action-card">
              <div className="quick-action-icon">🎒</div>
              <h4>Inventar</h4>
              <p>Deine Items ansehen</p>
            </a>
            <a href="/grundstueck" className="quick-action-card">
              <div className="quick-action-icon">🏡</div>
              <h4>Grundstück</h4>
              <p>Gebäude verwalten</p>
            </a>
            <a href="/crafting" className="quick-action-card">
              <div className="quick-action-icon">🔨</div>
              <h4>Crafting</h4>
              <p>Items herstellen</p>
            </a>
            <a href="/collection" className="quick-action-card">
              <div className="quick-action-icon">⛏️</div>
              <h4>Sammeln</h4>
              <p>Ressourcen sammeln</p>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
