import { useState, useEffect } from 'react';
import api from '../services/api';
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
  const [buildings, setBuildings] = useState([]);
  const [myBuildings, setMyBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [workbench, setWorkbench] = useState(null);
  const [inventory, setInventory] = useState([]);

  useEffect(() => {
    fetchBuildings();
    fetchMyBuildings();
    fetchJobStatus();
    fetchWorkbench();
    fetchInventory();
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
    <div className="container">
      <div className="card">
        <h2>🏡 Mein Grundstück</h2>
        
        {message && (
          <div className={message.includes('Fehler') ? 'error' : 'success'}>
            {message}
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
                  <h4>Aktuelles Level: {workbench.level}</h4>
                  <p>Höhere Werkbank-Levels ermöglichen das Craften von besseren Items.</p>
                </div>
                
                <div className="upgrade-section">
                  <h4>Werkbank upgraden</h4>
                  <p>Kosten: 10x Stein</p>
                  {inventory.find(inv => inv.name === 'stein')?.quantity >= 10 ? (
                    <button className="btn btn-primary" onClick={upgradeWorkbench}>
                      Upgraden
                    </button>
                  ) : (
                    <p className="error">Nicht genug Steine (benötigt: 10)</p>
                  )}
                </div>
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
