import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Grundstueck.css';

const getImageUrl = (imagePath) => {
  if (!imagePath) {
    return '/placeholder-item.png';
  }
  if (imagePath.startsWith('http')) {
    return imagePath;
  }
  if (imagePath.includes('character_')) {
    return `/chars/${imagePath}`;
  }
  return `/items/${imagePath}`;
};

function Grundstueck() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [buildings, setBuildings] = useState([]);
  const [myBuildings, setMyBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [workbench, setWorkbench] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [playerStats, setPlayerStats] = useState(null);
  const [isAtHome, setIsAtHome] = useState(false);
  const [equipmentRecipes, setEquipmentRecipes] = useState([]);
  const [professions, setProfessions] = useState([]);
  const [showSmithyView, setShowSmithyView] = useState(false);
  const [smithyTab, setSmithyTab] = useState('weapon');
  const [craftingMessage, setCraftingMessage] = useState(null);
  const [craftingJob, setCraftingJob] = useState(null);
  const [craftingTimeLeft, setCraftingTimeLeft] = useState(0);
  const [viewMode, setViewMode] = useState('graphic'); // 'graphic' or 'list'
  const [hoveredHotspot, setHoveredHotspot] = useState(null);
  const [propertySettings, setPropertySettings] = useState({ image_path: '/buildings/huette1.jpg' });
  const [propertyHotspots, setPropertyHotspots] = useState([]);

  // Check URL params for direct navigation
  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'smithy') {
      setShowSmithyView(true);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchBuildings();
    fetchMyBuildings();
    fetchJobStatus();
    fetchWorkbench();
    fetchInventory();
    fetchPlayerStats();
    fetchEquipmentRecipes();
    fetchProfessions();
    fetchCraftingJob();
    fetchProperty();
    // Poll job status every 5 seconds
    const interval = setInterval(() => {
      fetchJobStatus();
      fetchCraftingJob();
    }, 5000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);
  

  const fetchBuildings = async () => {
    try {
      const response = await api.get('/buildings');
      setBuildings(response.data.buildings);
    } catch (error) {
      console.error('Fehler beim Laden der Gebäude:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyBuildings = async () => {
    try {
      const response = await api.get('/buildings/my-buildings');
      setMyBuildings(response.data.buildings);
    } catch (error) {
      console.error('Fehler beim Laden deiner Gebäude:', error);
    }
  };

  const fetchJobStatus = async () => {
    try {
      const response = await api.get('/buildings/job/status');
      setJobStatus(response.data.job);
    } catch (error) {
      console.error('Fehler beim Laden des Job-Status:', error);
    }
  };

  const fetchWorkbench = async () => {
    try {
      const response = await api.get('/workbench');
      setWorkbench(response.data.workbench);
    } catch (error) {
      console.error('Fehler beim Laden der Werkbank:', error);
    }
  };

  const fetchPlayerStats = async () => {
    try {
      const response = await api.get('/npcs/player/stats');
      setPlayerStats(response.data.stats);
    } catch (error) {
      console.error('Fehler beim Laden der Spielerstatistiken:', error);
    }
  };

  const fetchEquipmentRecipes = async () => {
    try {
      const response = await api.get('/equipment/recipes');
      setEquipmentRecipes(response.data.recipes || []);
    } catch (error) {
      console.error('Fehler beim Laden der Ausrüstungsrezepte:', error);
    }
  };

  const fetchProfessions = async () => {
    try {
      const response = await api.get('/equipment/professions');
      setProfessions(response.data.professions || []);
    } catch (error) {
      console.error('Fehler beim Laden der Berufe:', error);
    }
  };

  const fetchCraftingJob = async () => {
    try {
      const response = await api.get('/equipment/crafting');
      setCraftingJob(response.data.crafting);
      if (response.data.crafting) {
        setCraftingTimeLeft(response.data.crafting.remaining_seconds || 0);
      }
    } catch (error) {
      console.error('Fehler beim Laden des Crafting-Status:', error);
    }
  };

  const fetchProperty = async () => {
    try {
      const response = await api.get('/buildings/property');
      setPropertySettings(response.data.settings || { image_path: '/buildings/huette1.jpg' });
      setPropertyHotspots(response.data.hotspots || []);
    } catch (error) {
      console.error('Fehler beim Laden der Grundstück-Einstellungen:', error);
      // Fallback to default hotspots
      setPropertyHotspots([
        { buildingName: 'schmiede', x: 65, y: 25, width: 12, height: 12, label: 'Schmiede', icon: '⚒️', description: 'Amboss - Hier schmiedest du Waffen und Rüstung' },
        { buildingName: 'saegewerk', x: 18, y: 55, width: 15, height: 15, label: 'Sägewerk', icon: '🪚', description: 'Tischkreissäge - Verarbeite Holz zu Brettern' },
        { buildingName: 'werkbank', x: 75, y: 20, width: 15, height: 15, label: 'Werkbank', icon: '🔨', description: 'Werkbank - Crafting und Upgrades' },
        { buildingName: 'brunnen', x: 60, y: 50, width: 10, height: 10, label: 'Brunnen', icon: '💧', description: 'Brunnen - Versorgt dich mit Wasser' },
        { buildingName: 'lager', x: 40, y: 40, width: 12, height: 12, label: 'Lager', icon: '📦', description: 'Lager - Erweitert dein Inventar' }
      ]);
    }
  };

  // Countdown timer for crafting
  useEffect(() => {
    if (craftingJob && !craftingJob.is_paused && !craftingJob.is_ready && craftingTimeLeft > 0) {
      const timer = setInterval(() => {
        setCraftingTimeLeft(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [craftingJob, craftingTimeLeft]);

  const startCrafting = async (recipeId) => {
    try {
      const response = await api.post(`/equipment/craft/${recipeId}`);
      setCraftingMessage({
        type: 'success',
        text: response.data.message
      });
      fetchCraftingJob();
      fetchInventory();
      fetchEquipmentRecipes();
      setTimeout(() => setCraftingMessage(null), 3000);
    } catch (error) {
      setCraftingMessage({
        type: 'error',
        text: error.response?.data?.error || 'Fehler beim Starten'
      });
      setTimeout(() => setCraftingMessage(null), 4000);
    }
  };

  const collectCrafting = async () => {
    try {
      const response = await api.post('/equipment/craft/collect');
      setCraftingMessage({
        type: 'success',
        text: response.data.message,
        quality: response.data.quality,
        quality_color: response.data.quality_color,
        leveled_up: response.data.leveled_up,
        new_level: response.data.profession_level
      });
      setCraftingJob(null);
      fetchCraftingJob();
      fetchInventory();
      fetchEquipmentRecipes();
      fetchProfessions();
      setTimeout(() => setCraftingMessage(null), 5000);
    } catch (error) {
      setCraftingMessage({
        type: 'error',
        text: error.response?.data?.error || 'Fehler beim Abholen'
      });
      setTimeout(() => setCraftingMessage(null), 4000);
    }
  };

  const cancelCrafting = async () => {
    if (!window.confirm('Herstellung wirklich abbrechen? Die Materialien gehen verloren!')) return;
    try {
      await api.delete('/equipment/craft/cancel');
      setCraftingJob(null);
      setCraftingMessage({
        type: 'info',
        text: 'Herstellung abgebrochen'
      });
      setTimeout(() => setCraftingMessage(null), 3000);
    } catch (error) {
      setCraftingMessage({
        type: 'error',
        text: error.response?.data?.error || 'Fehler beim Abbrechen'
      });
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const canCraftRecipe = (recipe) => {
    if (!recipe.can_craft) return false;
    for (const mat of recipe.materials) {
      const invItem = inventory.find(i => i.item_id === mat.item_id);
      if (!invItem || invItem.quantity < mat.quantity) return false;
    }
    return true;
  };

  const getForgeLevel = () => {
    const forge = myBuildings.find(b => b.name === 'schmiede');
    return forge?.level || 0;
  };

  const getProfessionLevel = (profession) => {
    const prof = professions.find(p => p.profession === profession);
    return prof?.level || 1;
  };

  // Check if player is at home (coordinates 0,0 means at home/grundstück)
  useEffect(() => {
    if (user) {
      // Player is "at home" when near their home coordinates (not 0,0!)
      const homeX = user.home_x ?? 0;
      const homeY = user.home_y ?? 0;
      const distance = Math.sqrt(
        Math.pow((user.world_x || 0) - homeX, 2) + 
        Math.pow((user.world_y || 0) - homeY, 2)
      );
      const atHome = distance < 50;
      setIsAtHome(atHome);
    }
  }, [user?.world_x, user?.world_y, user?.home_x, user?.home_y]);


  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory');
      setInventory(response.data.inventory);
    } catch (error) {
      console.error('Fehler beim Laden des Inventars:', error);
    }
  };

  const upgradeWorkbench = async () => {
    const stoneItem = inventory.find(inv => inv.name === 'stein');
    if (!stoneItem || stoneItem.quantity < 10) {
      setMessage('Du brauchst mindestens 10 Steine zum Upgraden');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    try {
      const response = await api.post('/workbench/upgrade', {
        upgrade_item_id: stoneItem.item_id,
        upgrade_item_quantity: 10
      });
      setMessage(response.data.message);
      setTimeout(() => setMessage(''), 3000);
      fetchWorkbench();
      fetchInventory();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Upgraden');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const claimJob = async () => {
    try {
      const response = await api.post('/buildings/job/claim');
      setMessage(response.data.message);
      setTimeout(() => setMessage(''), 3000);
      fetchBuildings();
      fetchMyBuildings();
      fetchJobStatus();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Abholen');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const buildBuilding = async (buildingId) => {
    try {
      const response = await api.post(`/buildings/build/${buildingId}`);
      setMessage(response.data.message);
      setTimeout(() => setMessage(''), 3000);
      fetchBuildings();
      fetchMyBuildings();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Bauen');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const upgradeBuilding = async (buildingId) => {
    try {
      const response = await api.post(`/buildings/upgrade/${buildingId}`);
      setMessage(response.data.message);
      setTimeout(() => setMessage(''), 3000);
      fetchMyBuildings();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Aufwerten');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const canBuild = (building) => {
    if (building.is_built) return false;
    if (!building.requirements || building.requirements.length === 0) return true;
    return building.requirements.every(req => req.user_quantity >= req.quantity);
  };

  if (loading) {
    return <div className="container"><div className="loading">Lädt...</div></div>;
  }

  // Create a map of built buildings for quick lookup
  const builtMap = new Map();
  myBuildings.forEach(b => builtMap.set(b.building_id, b));

  // Calculate plot size based on buildings
  const maxX = Math.max(...buildings.map(b => b.position_x + b.size_width), 400);
  const maxY = Math.max(...buildings.map(b => b.position_y + b.size_height), 400);

  // Slot names and icons for tabs
  const slotConfig = {
    weapon: { name: 'Waffen', icon: '⚔️' },
    shield: { name: 'Schilde', icon: '🛡️' },
    head: { name: 'Helme', icon: '🪖' },
    chest: { name: 'Rüstungen', icon: '👕' },
    legs: { name: 'Beine', icon: '👖' },
    feet: { name: 'Schuhe', icon: '👢' },
    hands: { name: 'Handschuhe', icon: '🧤' },
    accessory: { name: 'Accessoires', icon: '💍' }
  };

  // Smithy Full View
  if (showSmithyView) {
    const filteredRecipes = equipmentRecipes.filter(r => r.slot === smithyTab);
    
    return (
      <div className="grundstueck-page">
        <div className="card smithy-fullview">
          <div className="smithy-header">
            <button className="btn btn-back" onClick={() => setShowSmithyView(false)}>
              ← Zurück zum Grundstück
            </button>
            <h2>⚒️ Schmiede</h2>
            <div className="smithy-stats">
              <div className="smithy-stat">
                <span className="stat-icon">🏭</span>
                <span>Schmiede Lv. {getForgeLevel()}</span>
              </div>
              <div className="smithy-stat">
                <span className="stat-icon">🔨</span>
                <span>Schmied Lv. {getProfessionLevel('blacksmith')}</span>
              </div>
            </div>
          </div>

          {craftingMessage && (
            <div className={`crafting-message ${craftingMessage.type}`}>
              <span style={{ color: craftingMessage.quality_color }}>{craftingMessage.text}</span>
              {craftingMessage.leveled_up && (
                <div className="level-up-notice">🎉 Schmied Level {craftingMessage.new_level}!</div>
              )}
            </div>
          )}

          {/* Active Crafting Job */}
          {craftingJob && (
            <div className={`crafting-job-status ${craftingJob.is_paused ? 'paused' : craftingJob.is_ready || craftingTimeLeft <= 0 ? 'ready' : 'active'}`}>
              <div className="crafting-job-header">
                <span className="crafting-icon">{craftingJob.is_paused ? '⏸️' : craftingJob.is_ready || craftingTimeLeft <= 0 ? '✅' : '⚒️'}</span>
                <span className="crafting-item-name">{craftingJob.display_name}</span>
              </div>
              
              {craftingJob.is_paused ? (
                <div className="crafting-paused">
                  <p>⚠️ Herstellung pausiert! Geh nach Hause um fortzufahren.</p>
                  <p className="paused-time">Verbleibend: {formatTime(craftingJob.remaining_seconds)}</p>
                </div>
              ) : craftingJob.is_ready || craftingTimeLeft <= 0 ? (
                <div className="crafting-ready">
                  <p>🎉 Fertig! Klicke um abzuholen.</p>
                  <button className="btn btn-collect" onClick={collectCrafting}>
                    ✨ Abholen
                  </button>
                </div>
              ) : (
                <div className="crafting-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: `${Math.max(0, 100 - (craftingTimeLeft / ((new Date(craftingJob.finish_at) - new Date(craftingJob.started_at)) / 1000)) * 100)}%` 
                      }}
                    />
                  </div>
                  <span className="time-left">⏱️ {formatTime(craftingTimeLeft)}</span>
                </div>
              )}
              
              <button className="btn btn-cancel-craft" onClick={cancelCrafting}>
                ✖️ Abbrechen
              </button>
            </div>
          )}

          {!isAtHome && !craftingJob && (
            <div className="smithy-warning">
              ⚠️ Du musst zu Hause sein um zu schmieden! <Link to="/map">Zur Karte</Link>
            </div>
          )}

          <div className="smithy-tabs">
            {Object.entries(slotConfig).map(([slot, config]) => {
              const recipeCount = equipmentRecipes.filter(r => r.slot === slot).length;
              return (
                <button
                  key={slot}
                  className={`smithy-tab ${smithyTab === slot ? 'active' : ''}`}
                  onClick={() => setSmithyTab(slot)}
                >
                  <span className="tab-icon">{config.icon}</span>
                  <span className="tab-name">{config.name}</span>
                  {recipeCount > 0 && <span className="tab-count">({recipeCount})</span>}
                </button>
              );
            })}
          </div>

          <div className="smithy-content">
            <div className="recipes-grid">
              {filteredRecipes.length === 0 ? (
                <div className="no-recipes">
                  <p>Keine Rezepte für {slotConfig[smithyTab]?.name || smithyTab} verfügbar</p>
                </div>
              ) : (
                filteredRecipes.map(recipe => {
                  const canCraft = canCraftRecipe(recipe);
                  const hasLevel = recipe.can_craft;
                  
                  return (
                    <div key={recipe.id} className={`recipe-card ${!canCraft ? 'unavailable' : ''}`}>
                      <div className="recipe-icon">
                        {slotConfig[recipe.slot]?.icon || '❓'}
                      </div>
                      <div className="recipe-main">
                        <div className="recipe-header">
                          <span className={`recipe-name rarity-${recipe.rarity}`}>
                            {recipe.display_name}
                          </span>
                          <span className={`recipe-level-req ${hasLevel ? 'met' : 'unmet'}`}>
                            Lv.{recipe.required_profession_level}
                          </span>
                        </div>
                        
                        {recipe.description && (
                          <p className="recipe-desc">{recipe.description}</p>
                        )}
                        
                        <div className="recipe-stats">
                          {recipe.base_attack > 0 && <span className="stat-atk">⚔️ +{recipe.base_attack}</span>}
                          {recipe.base_defense > 0 && <span className="stat-def">🛡️ +{recipe.base_defense}</span>}
                          {recipe.base_health > 0 && <span className="stat-hp">❤️ +{recipe.base_health}</span>}
                          <span className="stat-exp">+{recipe.experience_reward} EP</span>
                        </div>
                        
                        <div className="recipe-materials">
                          {recipe.materials.map((mat, idx) => {
                            const invItem = inventory.find(i => i.item_id === mat.item_id);
                            const hasEnough = invItem && invItem.quantity >= mat.quantity;
                            return (
                              <span key={idx} className={`material ${hasEnough ? 'has' : 'missing'}`}>
                                {mat.item_name}: {invItem?.quantity || 0}/{mat.quantity}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      
                      <div className="recipe-craft-area">
                        {recipe.craft_time && (
                          <span className="craft-time">⏱️ {formatTime(recipe.craft_time || 60)}</span>
                        )}
                        <button 
                          className="btn btn-craft"
                          onClick={() => startCrafting(recipe.id)}
                          disabled={!canCraft || !isAtHome || !!craftingJob}
                        >
                          {craftingJob ? '⏳' : !isAtHome ? '🏠' : canCraft ? '⚒️ Herstellen' : '❌'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="smithy-sidebar">
              <div className="quality-info">
                <h4>📊 Qualitätsstufen</h4>
                <div className="quality-list">
                  <div className="quality-item"><span style={{ color: '#9d9d9d' }}>●</span> Minderwertig (70%)</div>
                  <div className="quality-item"><span style={{ color: '#ffffff' }}>●</span> Normal (100%)</div>
                  <div className="quality-item"><span style={{ color: '#1eff00' }}>●</span> Gut (120%)</div>
                  <div className="quality-item"><span style={{ color: '#0070dd' }}>●</span> Ausgezeichnet (150%)</div>
                  <div className="quality-item"><span style={{ color: '#a335ee' }}>●</span> Meisterwerk (180%)</div>
                  <div className="quality-item"><span style={{ color: '#ff8000' }}>●</span> Legendär (250%)</div>
                </div>
              </div>

              <div className="smithy-tip">
                <h4>💡 Tipps</h4>
                <ul>
                  <li>Höheres <strong>Schmied-Level</strong> = bessere Qualitätschance</li>
                  <li>Höhere <strong>Schmiede-Stufe</strong> = noch bessere Chance</li>
                  <li>Qualität multipliziert die Basis-Stats</li>
                </ul>
              </div>

              <div className="inventory-preview">
                <h4>🎒 Materialien</h4>
                <div className="materials-list">
                  {inventory.filter(i => i.type === 'resource' || i.type === 'material').slice(0, 10).map(item => (
                    <div key={item.item_id} className="material-item">
                      <span>{item.display_name}</span>
                      <span className="material-qty">x{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getBuildingIcon = (name) => {
    const icons = {
      'huette': '🏠',
      'werkbank': '🔨',
      'schmiede': '⚒️',
      'saegewerk': '🪚',
      'brunnen': '💧',
      'lager': '📦'
    };
    return icons[name] || '🏗️';
  };

  // Use hotspots from database (propertyHotspots), fallback to empty array
  const hotspots = propertyHotspots;

  const handleHotspotClick = (hotspot) => {
    const building = buildings.find(b => b.name === hotspot.buildingName);
    if (building) {
      setSelectedBuilding(building);
      
      // Special handling for smithy - open smithy view directly
      if (building.name === 'schmiede' && building.is_built) {
        setShowSmithyView(true);
        setSelectedBuilding(null);
      }
      // Special handling for werkbank - could open crafting
      else if (building.name === 'werkbank' && building.is_built) {
        // Could navigate to crafting or show workbench options
      }
    }
  };

  const getHotspotBuilding = (buildingName) => {
    return myBuildings.find(b => b.name === buildingName);
  };

  return (
    <div className="grundstueck-page">
      {/* Header */}
      <div className="grundstueck-header">
        <h2>🏡 Mein Grundstück</h2>
        <div className="grundstueck-stats">
          <div className="gs-stat">
            <div className="gs-stat-value">{myBuildings.length}</div>
            <div className="gs-stat-label">Gebäude</div>
          </div>
          <div className="gs-stat">
            <div className="gs-stat-value">{workbench?.level || 1}</div>
            <div className="gs-stat-label">Werkbank</div>
          </div>
          <div className="gs-stat">
            <div className="gs-stat-value">{getForgeLevel()}</div>
            <div className="gs-stat-label">Schmiede</div>
          </div>
        </div>
      </div>

      {/* Message Toast */}
      {message && (
        <div className={`message-toast ${message.includes('Fehler') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <div className="grundstueck-content">
        {/* Left Side - Buildings View (Graphic or List) */}
        <div className="buildings-section">
          <div className="buildings-section-header">
            <h3>🏗️ Gebäude</h3>
            <div className="view-mode-toggle">
              <button 
                className={`view-btn ${viewMode === 'graphic' ? 'active' : ''}`}
                onClick={() => setViewMode('graphic')}
                title="Grafische Ansicht"
              >
                🖼️
              </button>
              <button 
                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="Listen-Ansicht"
              >
                📋
              </button>
            </div>
          </div>

          {viewMode === 'graphic' ? (
            <div className="property-image-container">
              <img 
                src={propertySettings.image_path || '/buildings/huette1.jpg'} 
                alt="Grundstück" 
                className="property-image"
                onError={(e) => {
                  // Fallback to second image if first doesn't exist
                  if (e.target.src.includes('huette1.jpg')) {
                    e.target.src = '/buildings/huette.jpeg';
                  }
                }}
              />
              {hotspots.map((hotspot, idx) => {
                const hotspotBuilding = getHotspotBuilding(hotspot.buildingName);
                const isBuilt = hotspotBuilding;
                const isHovered = hoveredHotspot === idx;
                
                return (
                  <div
                    key={idx}
                    className={`property-hotspot ${isBuilt ? 'built' : 'unbuilt'} ${isHovered ? 'hovered' : ''}`}
                    style={{
                      left: `${hotspot.x}%`,
                      top: `${hotspot.y}%`,
                      width: `${hotspot.width}%`,
                      height: `${hotspot.height}%`
                    }}
                    onClick={() => handleHotspotClick(hotspot)}
                    onMouseEnter={() => setHoveredHotspot(idx)}
                    onMouseLeave={() => setHoveredHotspot(null)}
                    title={hotspot.description}
                  >
                    <div className="hotspot-icon">{hotspot.icon}</div>
                    {isHovered && (
                      <div className="hotspot-tooltip">
                        <div className="tooltip-label">{hotspot.label}</div>
                        {isBuilt ? (
                          <div className="tooltip-level">Lv. {hotspotBuilding.level}</div>
                        ) : (
                          <div className="tooltip-status">Nicht gebaut</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="buildings-grid">
              {buildings.map((building) => {
                const built = builtMap.get(building.id);
                const isBuilt = building.is_built || built;
                const isSelected = selectedBuilding?.id === building.id;
                
                return (
                  <div
                    key={building.id}
                    className={`building-card ${isBuilt ? 'built' : 'unbuilt'} ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedBuilding(building)}
                  >
                    <div className="building-icon">
                      {getBuildingIcon(building.name)}
                    </div>
                    <div className="building-name">{building.display_name}</div>
                    {isBuilt && built?.level > 0 && (
                      <div className="building-level-badge">Lv. {built.level}</div>
                    )}
                    {!isBuilt && (
                      <div className="building-status">Nicht gebaut</div>
                    )}
                    {isBuilt && (
                      <div className="building-status built-status">✓ Gebaut</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side - Info Panels */}
        <div className="info-section">
          {/* Job Status Panel */}
          {jobStatus && (
            <div className={`info-panel job-panel ${jobStatus.is_paused ? 'paused' : ''} ${jobStatus.is_completed ? 'ready' : ''}`}>
              <h4>
                {jobStatus.is_paused ? '⏸️' : jobStatus.is_completed ? '✅' : '🏗️'} 
                {' '}{jobStatus.job_type === 'build' ? 'Bau' : 'Upgrade'}
              </h4>
              <div className="job-info">
                <span className="job-icon">
                  {getBuildingIcon(jobStatus.building_name?.toLowerCase())}
                </span>
                <div className="job-details">
                  <h5>{jobStatus.building_name}</h5>
                  <p>{jobStatus.job_type === 'build' ? 'Wird gebaut...' : `Upgrade auf Lv. ${jobStatus.target_level}`}</p>
                </div>
              </div>
              
              {jobStatus.is_paused ? (
                <div className="job-paused-notice">
                  ⚠️ Pausiert - Geh nach Hause!
                  <div className="job-time">{formatTime(jobStatus.remaining_seconds || 0)}</div>
                </div>
              ) : jobStatus.is_completed ? (
                <button className="btn-claim" onClick={claimJob}>
                  ✨ Fertig! Abholen
                </button>
              ) : (
                <div className="job-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: `${Math.max(0, 100 - (jobStatus.time_remaining_seconds / (jobStatus.duration_minutes * 60)) * 100)}%` 
                      }}
                    />
                  </div>
                  <div className="job-time">⏱️ {formatTime(jobStatus.time_remaining_seconds || 0)}</div>
                </div>
              )}
            </div>
          )}

          {/* Building Details Panel */}
          {selectedBuilding && (
            <div className="info-panel details-panel">
              <h4>{getBuildingIcon(selectedBuilding.name)} {selectedBuilding.display_name}</h4>
              <p className="details-description">{selectedBuilding.description}</p>
              
              <div className="details-status">
                <span className="status-icon">{selectedBuilding.is_built ? '✅' : '🔒'}</span>
                <span className={`status-text ${selectedBuilding.is_built ? 'built' : ''}`}>
                  {selectedBuilding.is_built 
                    ? `Gebaut (Lv. ${builtMap.get(selectedBuilding.id)?.level || 1} / ${selectedBuilding.max_level || 5})`
                    : 'Nicht gebaut'
                  }
                </span>
              </div>

              {/* Requirements for unbuilt */}
              {!selectedBuilding.is_built && selectedBuilding.requirements?.length > 0 && (
                <div className="requirements-list">
                  <h5>📦 Benötigte Ressourcen:</h5>
                  {selectedBuilding.requirements.map((req, idx) => (
                    <div 
                      key={idx}
                      className={`requirement-row ${req.user_quantity >= req.quantity ? 'has' : 'missing'}`}
                    >
                      <span className="req-name">{req.display_name}</span>
                      <span className={`req-amount ${req.user_quantity >= req.quantity ? 'has' : 'missing'}`}>
                        {req.user_quantity} / {req.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="details-actions">
                {/* Build Button */}
                {!selectedBuilding.is_built && (
                  <button
                    className="btn-build-main"
                    onClick={() => buildBuilding(selectedBuilding.id)}
                    disabled={!canBuild(selectedBuilding) || !isAtHome || jobStatus}
                  >
                    {!isAtHome ? '🏠 Nicht zu Hause' : 
                     jobStatus ? '⏳ Anderer Job aktiv' :
                     canBuild(selectedBuilding) ? '🔨 Bauen' : '❌ Ressourcen fehlen'}
                  </button>
                )}

                {/* Upgrade Button */}
                {selectedBuilding.is_built && selectedBuilding.name !== 'werkbank' && (
                  builtMap.get(selectedBuilding.id)?.level >= (selectedBuilding.max_level || 5) ? (
                    <div className="max-level-notice">🏆 Max Level erreicht!</div>
                  ) : (
                    <button 
                      className="btn-upgrade-main"
                      onClick={() => upgradeBuilding(selectedBuilding.id)}
                      disabled={!isAtHome || jobStatus}
                    >
                      {!isAtHome ? '🏠 Nicht zu Hause' :
                       jobStatus ? '⏳ Anderer Job aktiv' :
                       `⬆️ Auf Lv. ${(builtMap.get(selectedBuilding.id)?.level || 1) + 1} upgraden`}
                    </button>
                  )
                )}

                {/* Werkbank Specific */}
                {selectedBuilding.name === 'werkbank' && selectedBuilding.is_built && (
                  <>
                    <Link to="/crafting" className="btn-open-crafting">
                      🔧 Crafting öffnen
                    </Link>
                    {inventory.find(inv => inv.name === 'stein')?.quantity >= 10 && (
                      <button className="btn-upgrade-main" onClick={upgradeWorkbench}>
                        ⬆️ Upgraden (10 Steine)
                      </button>
                    )}
                  </>
                )}

                {/* Schmiede Specific */}
                {selectedBuilding.name === 'schmiede' && selectedBuilding.is_built && (
                  <button 
                    className="btn-open-smithy"
                    onClick={() => { setShowSmithyView(true); setSelectedBuilding(null); }}
                  >
                    ⚔️ Schmiede öffnen
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Quick Actions when no building selected */}
          {!selectedBuilding && (
            <div className="info-panel quick-actions-panel">
              <h4>💡 Schnellzugriff</h4>
              <p className="quick-actions-hint">Klicke auf ein Gebäude links um Details zu sehen</p>
              <div className="quick-actions-grid">
                {myBuildings.find(b => b.name === 'schmiede') && (
                  <button 
                    className="quick-action-btn smithy"
                    onClick={() => setShowSmithyView(true)}
                  >
                    <span className="quick-action-icon">⚒️</span>
                    <span className="quick-action-text">Schmiede</span>
                  </button>
                )}
                {myBuildings.find(b => b.name === 'werkbank') && (
                  <Link to="/crafting" className="quick-action-btn crafting">
                    <span className="quick-action-icon">🔧</span>
                    <span className="quick-action-text">Crafting</span>
                  </Link>
                )}
                <Link to="/collection" className="quick-action-btn collection">
                  <span className="quick-action-icon">🌿</span>
                  <span className="quick-action-text">Sammeln</span>
                </Link>
                <Link to="/map" className="quick-action-btn map">
                  <span className="quick-action-icon">🗺️</span>
                  <span className="quick-action-text">Karte</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  if (seconds <= 0) return '0 Sekunden';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export default Grundstueck;
