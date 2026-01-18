import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  const [showSmithyPanel, setShowSmithyPanel] = useState(false);
  const [craftingMessage, setCraftingMessage] = useState(null);

  useEffect(() => {
    fetchBuildings();
    fetchMyBuildings();
    fetchJobStatus();
    fetchWorkbench();
    fetchInventory();
    fetchPlayerStats();
    fetchEquipmentRecipes();
    fetchProfessions();
    // Poll job status every 5 seconds
    const interval = setInterval(fetchJobStatus, 5000);
    
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

  const craftEquipment = async (recipeId) => {
    try {
      const response = await api.post(`/equipment/craft/${recipeId}`);
      setCraftingMessage({
        type: 'success',
        text: response.data.message,
        quality: response.data.quality,
        quality_color: response.data.quality_color,
        leveled_up: response.data.leveled_up,
        new_level: response.data.profession_level
      });
      fetchInventory();
      fetchEquipmentRecipes();
      fetchProfessions();
      setTimeout(() => setCraftingMessage(null), 5000);
    } catch (error) {
      setCraftingMessage({
        type: 'error',
        text: error.response?.data?.error || 'Fehler beim Herstellen'
      });
      setTimeout(() => setCraftingMessage(null), 4000);
    }
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

  const handleHeal = async () => {
    try {
      const response = await api.post('/combat/heal', { location: 'grundstueck' });
      setMessage(response.data.message);
      fetchPlayerStats();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Heilen');
      setTimeout(() => setMessage(''), 3000);
    }
  };

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

  return (
    <div className="grundstueck-page">
      <div className="card">
        <div className="grundstueck-header">
          <h2>🏡 Mein Grundstück</h2>
          <div className="grundstueck-stats">
            <div className="gs-stat">
              <div className="gs-stat-value">{myBuildings.length}</div>
              <div className="gs-stat-label">Gebäude</div>
            </div>
            <div className="gs-stat">
              <div className="gs-stat-value">{workbench?.level || 1}</div>
              <div className="gs-stat-label">Werkbank Lv.</div>
            </div>
          </div>
        </div>
        
        {message && (
          <div className={message.includes('Fehler') ? 'error' : 'success'}>
            {message}
          </div>
        )}

        {/* Health Recovery Panel */}
        {playerStats && playerStats.current_health < playerStats.max_health && (
          <div className={`health-recovery-panel ${!isAtHome ? 'away-from-home' : ''}`}>
            <div className="health-info">
              <span className="health-icon">❤️</span>
              <div className="health-bar-container">
                <div className="health-bar-bg">
                  <div 
                    className="health-bar-fill" 
                    style={{ width: `${(playerStats.current_health / playerStats.max_health) * 100}%` }}
                  />
                </div>
                <span className="health-text">{playerStats.current_health} / {playerStats.max_health} HP</span>
              </div>
              {isAtHome ? (
                <button className="btn-heal" onClick={handleHeal}>
                  💊 Heilen (+25 HP)
                </button>
              ) : (
                <div className="heal-unavailable">
                  <span>🚶 Du bist unterwegs</span>
                  <Link to="/map" className="btn-return-home">Zur Karte</Link>
                </div>
              )}
            </div>
            {!isAtHome && (
              <p className="away-notice">Du musst zu Hause sein um dich zu heilen. Nutze die Karte um nach Hause zu reisen.</p>
            )}
          </div>
        )}

        {jobStatus && (
          <div className="job-status-banner">
            <div className="job-status-content">
              <h3>
                {jobStatus.job_type === 'build' ? '🏗️ Bau in Arbeit' : '⬆️ Upgrade in Arbeit'}
              </h3>
              <p>{jobStatus.building_name}</p>
              {jobStatus.is_completed ? (
                <div>
                  <p className="job-completed">✅ Fertig!</p>
                  <button className="btn btn-primary" onClick={claimJob}>
                    Abholen
                  </button>
                </div>
              ) : (
                <div>
                  <p>Verbleibende Zeit: {formatTime(jobStatus.time_remaining_seconds || 0)}</p>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: `${Math.max(0, 100 - (jobStatus.time_remaining_seconds / (jobStatus.duration_minutes * 60)) * 100)}%` 
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="plot-container">
          <div 
            className="plot" 
            style={{ 
              width: `${maxX}px`, 
              height: `${maxY}px`,
              minWidth: '400px',
              minHeight: '400px'
            }}
          >
            {buildings.map((building) => {
              const built = builtMap.get(building.id);
              const isBuilt = building.is_built || built;
              
              return (
                <div
                  key={building.id}
                  className={`building ${isBuilt ? 'built' : 'unbuilt'}`}
                  style={{
                    left: `${building.position_x}px`,
                    top: `${building.position_y}px`,
                    width: `${building.size_width}px`,
                    height: `${building.size_height}px`,
                  }}
                  onClick={() => setSelectedBuilding(building)}
                  title={building.display_name}
                >
                  <div className="building-content">
                    {isBuilt ? (
                      <>
                        <div className="building-icon">
                          {building.name === 'werkbank' ? '🔨' : 
                           building.name === 'schmiede' ? '⚒️' :
                           building.name === 'saegewerk' ? '🪚' :
                           building.name === 'brunnen' ? '💧' :
                           building.name === 'lager' ? '📦' : '🏠'}
                        </div>
                        <div className="building-name">{building.display_name}</div>
                        {built && built.level > 1 && (
                          <div className="building-level">Lv.{built.level}</div>
                        )}
                      </>
                    ) : (
                      <div className="building-placeholder">❓</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selectedBuilding && (
          <div className="building-details">
            <h3>{selectedBuilding.display_name}</h3>
            <p>{selectedBuilding.description}</p>
            
            {/* Werkbank-spezifische Funktionalität */}
            {selectedBuilding.name === 'werkbank' && selectedBuilding.is_built && workbench && (
              <div className="workbench-in-building">
                <div className="workbench-info">
                  <h4>🔨 Werkbank Level {workbench.level}</h4>
                  <p>Höhere Werkbank-Levels ermöglichen das Craften von besseren Items.</p>
                </div>
                
                <div className="workbench-actions">
                  <Link to="/crafting" className="btn btn-primary">
                    ⚒️ Crafting öffnen
                  </Link>
                  
                  <div className="upgrade-section">
                    <h5>Werkbank upgraden</h5>
                    <p>Kosten: 10x Stein</p>
                    {inventory.find(inv => inv.name === 'stein')?.quantity >= 10 ? (
                      <button className="btn btn-secondary" onClick={upgradeWorkbench}>
                        ⬆️ Upgraden
                      </button>
                    ) : (
                      <p className="insufficient">Nicht genug Steine (benötigt: 10)</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Schmiede-spezifische Funktionalität */}
            {selectedBuilding.name === 'schmiede' && selectedBuilding.is_built && (
              <div className="smithy-in-building">
                <div className="smithy-info">
                  <h4>⚒️ Schmiede Level {getForgeLevel()}</h4>
                  <p>Stelle Waffen und Rüstungen her. Höheres Level = bessere Qualitätschance!</p>
                  <div className="profession-display">
                    <span>🔨 Schmied Level: {getProfessionLevel('blacksmith')}</span>
                  </div>
                </div>
                
                <button 
                  className="btn btn-primary smithy-open-btn"
                  onClick={() => setShowSmithyPanel(!showSmithyPanel)}
                >
                  {showSmithyPanel ? '✕ Schließen' : '⚔️ Ausrüstung herstellen'}
                </button>

                {showSmithyPanel && (
                  <div className="smithy-panel">
                    {craftingMessage && (
                      <div className={`crafting-message ${craftingMessage.type}`}>
                        <span style={{ color: craftingMessage.quality_color }}>{craftingMessage.text}</span>
                        {craftingMessage.leveled_up && (
                          <div className="level-up-notice">🎉 Schmied Level {craftingMessage.new_level}!</div>
                        )}
                      </div>
                    )}

                    <div className="recipe-list">
                      {equipmentRecipes.filter(r => r.profession === 'blacksmith').map(recipe => {
                        const canCraft = canCraftRecipe(recipe);
                        const hasLevel = recipe.can_craft;
                        
                        return (
                          <div key={recipe.id} className={`recipe-card ${!canCraft ? 'unavailable' : ''}`}>
                            <div className="recipe-header">
                              <span className={`recipe-name rarity-${recipe.rarity}`}>
                                {recipe.display_name}
                              </span>
                              <span className="recipe-slot">{recipe.slot}</span>
                            </div>
                            
                            <div className="recipe-stats">
                              {recipe.base_attack > 0 && <span>⚔️ +{recipe.base_attack}</span>}
                              {recipe.base_defense > 0 && <span>🛡️ +{recipe.base_defense}</span>}
                              {recipe.base_health > 0 && <span>❤️ +{recipe.base_health}</span>}
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
                            
                            <div className="recipe-requirements">
                              <span className={hasLevel ? 'met' : 'unmet'}>
                                🔨 Benötigt: Schmied Lv.{recipe.required_profession_level}
                              </span>
                              <span className="exp-reward">+{recipe.experience_reward} EP</span>
                            </div>
                            
                            <button 
                              className="btn btn-craft"
                              onClick={() => craftEquipment(recipe.id)}
                              disabled={!canCraft || !isAtHome}
                            >
                              {!isAtHome ? '🏠 Nicht zu Hause' : canCraft ? '⚒️ Herstellen' : 'Fehlt Material/Level'}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="quality-info">
                      <h5>📊 Qualitätsstufen</h5>
                      <div className="quality-list">
                        <span style={{ color: '#9d9d9d' }}>Minderwertig (70%)</span>
                        <span style={{ color: '#ffffff' }}>Normal (100%)</span>
                        <span style={{ color: '#1eff00' }}>Gut (120%)</span>
                        <span style={{ color: '#0070dd' }}>Ausgezeichnet (150%)</span>
                        <span style={{ color: '#a335ee' }}>Meisterwerk (180%)</span>
                        <span style={{ color: '#ff8000' }}>Legendär (250%)</span>
                      </div>
                      <p>Höheres Schmied-Level und Schmiede-Level erhöhen die Chance auf bessere Qualität!</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {selectedBuilding.is_built ? (
              <div>
                <p>Status: <strong>Gebaut</strong></p>
                {builtMap.get(selectedBuilding.id) && (
                  <>
                    <p>Level: <strong>{builtMap.get(selectedBuilding.id).level}</strong> / {selectedBuilding.max_level || 5}</p>
                    {selectedBuilding.name !== 'werkbank' && (
                      <>
                        {builtMap.get(selectedBuilding.id).level >= (selectedBuilding.max_level || 5) ? (
                          <p className="error">Maximales Level erreicht!</p>
                        ) : (
                          <button 
                            className="btn btn-secondary"
                            onClick={() => upgradeBuilding(selectedBuilding.id)}
                          >
                            Aufwerten (kostet Ressourcen)
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div>
                <p>Status: <strong>Nicht gebaut</strong></p>
                {selectedBuilding.requirements && selectedBuilding.requirements.length > 0 && (
                  <div className="building-requirements">
                    <h4>Benötigte Ressourcen:</h4>
                    <ul>
                      {selectedBuilding.requirements.map((req, idx) => (
                        <li 
                          key={idx}
                          className={req.user_quantity >= req.quantity ? 'sufficient' : 'insufficient'}
                        >
                          {req.display_name}: {req.user_quantity} / {req.quantity}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  onClick={() => buildBuilding(selectedBuilding.id)}
                  disabled={!canBuild(selectedBuilding)}
                >
                  {canBuild(selectedBuilding) ? 'Bauen' : 'Ressourcen fehlen'}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="available-buildings">
          <h3>Verfügbare Gebäude</h3>
          <div className="buildings-list">
            {buildings.map((building) => (
              <div 
                key={building.id} 
                className={`building-card ${building.is_built ? 'built' : ''}`}
                onClick={() => setSelectedBuilding(building)}
              >
                <div className="building-card-icon">
                  {building.is_built ? '✅' : '🏗️'}
                </div>
                <div className="building-card-info">
                  <h4>{building.display_name}</h4>
                  <p>{building.description}</p>
                  {building.is_built && (
                    <span className="built-badge">Gebaut</span>
                  )}
                </div>
              </div>
            ))}
          </div>
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
