import { useState, useEffect } from 'react';
import api from '../../services/api';
import './ApiManagement.css';

function ApiManagement() {
  const [activeSection, setActiveSection] = useState('jobs');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  
  // Jobs data
  const [stuckJobs, setStuckJobs] = useState(null);
  
  // Resources data
  const [nodeTypes, setNodeTypes] = useState([]);
  const [selectedNodeType, setSelectedNodeType] = useState(null);
  const [items, setItems] = useState([]);
  const [newDrop, setNewDrop] = useState({
    itemId: '',
    dropChance: 100,
    minQuantity: 1,
    maxQuantity: 1,
    minToolTier: 0,
    isRare: false
  });

  // User lookup
  const [userSearch, setUserSearch] = useState('');
  const [userData, setUserData] = useState(null);
  const [userJobs, setUserJobs] = useState(null);

  // Database query
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryResult, setQueryResult] = useState(null);

  useEffect(() => {
    if (message || error) {
      const timer = setTimeout(() => {
        setMessage('');
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message, error]);

  // ===== JOBS FUNCTIONS =====
  const checkAllJobs = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/debug/all-jobs');
      setStuckJobs(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  };

  const clearUserJobs = async (userId) => {
    setLoading(true);
    try {
      const response = await api.post(`/admin/debug/clear-jobs/${userId}`);
      setMessage(response.data.message);
      checkAllJobs();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Bereinigen');
    } finally {
      setLoading(false);
    }
  };

  const clearAllStuckJobs = async () => {
    if (!confirm('Wirklich ALLE blockierten Jobs löschen?')) return;
    setLoading(true);
    try {
      const response = await api.post('/admin/debug/clear-all-jobs');
      setMessage(response.data.message);
      checkAllJobs();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Bereinigen');
    } finally {
      setLoading(false);
    }
  };

  // ===== RESOURCES FUNCTIONS =====
  const loadNodeTypes = async () => {
    setLoading(true);
    try {
      const [nodeRes, itemRes] = await Promise.all([
        api.get('/resources/admin/node-types'),
        api.get('/resources/admin/items')
      ]);
      setNodeTypes(nodeRes.data.nodeTypes);
      setItems(itemRes.data.items);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  };

  const addDrop = async () => {
    if (!selectedNodeType || !newDrop.itemId) {
      setError('Bitte Ressource und Item auswählen');
      return;
    }
    setLoading(true);
    try {
      const response = await api.post(`/resources/admin/node-types/${selectedNodeType.id}/drops`, newDrop);
      setMessage(response.data.message);
      loadNodeTypes();
      setNewDrop({ itemId: '', dropChance: 100, minQuantity: 1, maxQuantity: 1, minToolTier: 0, isRare: false });
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Hinzufügen');
    } finally {
      setLoading(false);
    }
  };

  const deleteDrop = async (nodeTypeId, itemId) => {
    if (!confirm('Drop wirklich entfernen?')) return;
    setLoading(true);
    try {
      await api.delete(`/resources/admin/node-types/${nodeTypeId}/drops/${itemId}`);
      setMessage('Drop entfernt!');
      loadNodeTypes();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Löschen');
    } finally {
      setLoading(false);
    }
  };

  // ===== USER LOOKUP =====
  const lookupUser = async () => {
    if (!userSearch.trim()) return;
    setLoading(true);
    try {
      const response = await api.get(`/admin/debug/user/${userSearch}`);
      setUserData(response.data.user);
      setUserJobs(response.data.jobs);
    } catch (err) {
      setError(err.response?.data?.error || 'Benutzer nicht gefunden');
      setUserData(null);
      setUserJobs(null);
    } finally {
      setLoading(false);
    }
  };

  // ===== DATABASE QUERY =====
  const executeQuery = async () => {
    if (!sqlQuery.trim()) return;
    if (!confirm('SQL-Query wirklich ausführen? (Nur SELECT erlaubt)')) return;
    setLoading(true);
    try {
      const response = await api.post('/admin/debug/query', { query: sqlQuery });
      setQueryResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Query fehlgeschlagen');
      setQueryResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'resources') {
      loadNodeTypes();
    } else if (activeSection === 'jobs') {
      checkAllJobs();
    }
  }, [activeSection]);

  return (
    <div className="api-management">
      {message && <div className="api-message success">{message}</div>}
      {error && <div className="api-message error">{error}</div>}

      {/* Section Tabs */}
      <div className="api-tabs">
        <button 
          className={activeSection === 'jobs' ? 'active' : ''} 
          onClick={() => setActiveSection('jobs')}
        >
          🔧 Jobs & Aufträge
        </button>
        <button 
          className={activeSection === 'resources' ? 'active' : ''} 
          onClick={() => setActiveSection('resources')}
        >
          ⛏️ Ressourcen & Drops
        </button>
        <button 
          className={activeSection === 'users' ? 'active' : ''} 
          onClick={() => setActiveSection('users')}
        >
          👤 User Lookup
        </button>
        <button 
          className={activeSection === 'database' ? 'active' : ''} 
          onClick={() => setActiveSection('database')}
        >
          🗄️ Datenbank
        </button>
      </div>

      {/* JOBS SECTION */}
      {activeSection === 'jobs' && (
        <div className="api-section">
          <div className="section-header">
            <h3>🔧 Aktive Jobs verwalten</h3>
            <div className="section-actions">
              <button onClick={checkAllJobs} disabled={loading}>🔄 Aktualisieren</button>
              <button onClick={clearAllStuckJobs} disabled={loading} className="danger">
                🗑️ Alle blockierten löschen
              </button>
            </div>
          </div>

          {loading && <div className="loading">Lädt...</div>}

          {stuckJobs && (
            <div className="jobs-overview">
              <div className="stats-cards">
                <div className="stat-card">
                  <span className="stat-value">{stuckJobs.gathering?.length || 0}</span>
                  <span className="stat-label">Gathering Jobs</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{stuckJobs.collection?.length || 0}</span>
                  <span className="stat-label">Collection Jobs</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{stuckJobs.building?.length || 0}</span>
                  <span className="stat-label">Building Jobs</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{stuckJobs.crafting?.length || 0}</span>
                  <span className="stat-label">Crafting Jobs</span>
                </div>
              </div>

              {/* Gathering Jobs */}
              {stuckJobs.gathering?.length > 0 && (
                <div className="jobs-table-container">
                  <h4>⛏️ Gathering Jobs</h4>
                  <table className="jobs-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>User</th>
                        <th>Node</th>
                        <th>Started</th>
                        <th>Finish</th>
                        <th>Status</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stuckJobs.gathering.map(job => (
                        <tr key={job.id}>
                          <td>{job.id}</td>
                          <td>{job.username} (#{job.user_id})</td>
                          <td>{job.node_id}</td>
                          <td>{new Date(job.started_at).toLocaleString('de-DE')}</td>
                          <td>{new Date(job.finish_at).toLocaleString('de-DE')}</td>
                          <td>
                            <span className={`status-badge ${new Date(job.finish_at) < new Date() ? 'ready' : 'active'}`}>
                              {new Date(job.finish_at) < new Date() ? 'Fertig' : 'Läuft'}
                            </span>
                          </td>
                          <td>
                            <button onClick={() => clearUserJobs(job.user_id)} className="small">
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Collection Jobs */}
              {stuckJobs.collection?.length > 0 && (
                <div className="jobs-table-container">
                  <h4>🌾 Collection Jobs</h4>
                  <table className="jobs-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>User</th>
                        <th>Item</th>
                        <th>Completed At</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stuckJobs.collection.map(job => (
                        <tr key={job.id}>
                          <td>{job.id}</td>
                          <td>{job.username} (#{job.user_id})</td>
                          <td>{job.item_name || job.item_id}</td>
                          <td>{new Date(job.completed_at).toLocaleString('de-DE')}</td>
                          <td>
                            <button onClick={() => clearUserJobs(job.user_id)} className="small">
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Building Jobs */}
              {stuckJobs.building?.length > 0 && (
                <div className="jobs-table-container">
                  <h4>🏠 Building Jobs</h4>
                  <table className="jobs-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>User</th>
                        <th>Building</th>
                        <th>Status</th>
                        <th>Completed At</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stuckJobs.building.map(job => (
                        <tr key={job.id}>
                          <td>{job.id}</td>
                          <td>{job.username} (#{job.user_id})</td>
                          <td>{job.display_name || job.building_type_id}</td>
                          <td>{job.status}</td>
                          <td>{new Date(job.completed_at).toLocaleString('de-DE')}</td>
                          <td>
                            <button onClick={() => clearUserJobs(job.user_id)} className="small">
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Crafting Jobs */}
              {stuckJobs.crafting?.length > 0 && (
                <div className="jobs-table-container">
                  <h4>🔨 Crafting Jobs</h4>
                  <table className="jobs-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>User</th>
                        <th>Recipe</th>
                        <th>Started</th>
                        <th>Finish</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stuckJobs.crafting.map(job => (
                        <tr key={job.id}>
                          <td>{job.id}</td>
                          <td>{job.username} (#{job.user_id})</td>
                          <td>{job.recipe_name || job.recipe_id}</td>
                          <td>{new Date(job.started_at).toLocaleString('de-DE')}</td>
                          <td>{new Date(job.finish_at).toLocaleString('de-DE')}</td>
                          <td>
                            <button onClick={() => clearUserJobs(job.user_id)} className="small">
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!stuckJobs.gathering?.length && !stuckJobs.collection?.length && 
               !stuckJobs.building?.length && !stuckJobs.crafting?.length && (
                <div className="no-data">✅ Keine aktiven Jobs gefunden</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* RESOURCES SECTION */}
      {activeSection === 'resources' && (
        <div className="api-section">
          <div className="section-header">
            <h3>⛏️ Ressourcen & Drops verwalten</h3>
            <button onClick={loadNodeTypes} disabled={loading}>🔄 Aktualisieren</button>
          </div>

          {loading && <div className="loading">Lädt...</div>}

          <div className="resources-grid">
            {/* Node Types List */}
            <div className="node-types-list">
              <h4>Ressourcen-Typen</h4>
              {nodeTypes.map(nt => (
                <div 
                  key={nt.id} 
                  className={`node-type-item ${selectedNodeType?.id === nt.id ? 'selected' : ''}`}
                  onClick={() => setSelectedNodeType(nt)}
                >
                  <span className="node-icon">{nt.icon}</span>
                  <div className="node-info">
                    <span className="node-name">{nt.display_name}</span>
                    <span className="node-meta">
                      {nt.category} | {nt.drops?.length || 0} Drops | {nt.spawn_count} Spawns
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Selected Node Details */}
            {selectedNodeType && (
              <div className="node-details">
                <h4>{selectedNodeType.icon} {selectedNodeType.display_name}</h4>
                <p className="node-description">{selectedNodeType.description}</p>
                
                <div className="node-stats">
                  <span>🔧 Tool: {selectedNodeType.required_tool_type}</span>
                  <span>⏱️ Zeit: {selectedNodeType.base_gather_time}s</span>
                  <span>🔄 Respawn: {selectedNodeType.respawn_minutes}min</span>
                  <span>⭐ Min Level: {selectedNodeType.min_level}</span>
                </div>

                <h5>Drops:</h5>
                {selectedNodeType.drops?.length > 0 ? (
                  <table className="drops-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Chance</th>
                        <th>Menge</th>
                        <th>Min Tier</th>
                        <th>Selten</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedNodeType.drops.map(drop => (
                        <tr key={drop.item_id}>
                          <td>{drop.item_name}</td>
                          <td>{drop.drop_chance}%</td>
                          <td>{drop.min_quantity}-{drop.max_quantity}</td>
                          <td>{drop.min_tool_tier || '-'}</td>
                          <td>{drop.is_rare ? '⭐' : '-'}</td>
                          <td>
                            <button 
                              onClick={() => deleteDrop(selectedNodeType.id, drop.item_id)}
                              className="small danger"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="no-data">⚠️ Keine Drops definiert!</div>
                )}

                {/* Add Drop Form */}
                <div className="add-drop-form">
                  <h5>Drop hinzufügen:</h5>
                  <div className="form-row">
                    <select 
                      value={newDrop.itemId} 
                      onChange={e => setNewDrop({...newDrop, itemId: e.target.value})}
                    >
                      <option value="">Item auswählen...</option>
                      {items.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.display_name} ({item.type})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <label>
                      Chance %
                      <input 
                        type="number" 
                        value={newDrop.dropChance} 
                        onChange={e => setNewDrop({...newDrop, dropChance: parseInt(e.target.value)})}
                        min="1" max="100"
                      />
                    </label>
                    <label>
                      Min
                      <input 
                        type="number" 
                        value={newDrop.minQuantity} 
                        onChange={e => setNewDrop({...newDrop, minQuantity: parseInt(e.target.value)})}
                        min="1"
                      />
                    </label>
                    <label>
                      Max
                      <input 
                        type="number" 
                        value={newDrop.maxQuantity} 
                        onChange={e => setNewDrop({...newDrop, maxQuantity: parseInt(e.target.value)})}
                        min="1"
                      />
                    </label>
                  </div>
                  <div className="form-row">
                    <label>
                      Min Tool Tier
                      <input 
                        type="number" 
                        value={newDrop.minToolTier} 
                        onChange={e => setNewDrop({...newDrop, minToolTier: parseInt(e.target.value)})}
                        min="0"
                      />
                    </label>
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={newDrop.isRare} 
                        onChange={e => setNewDrop({...newDrop, isRare: e.target.checked})}
                      />
                      Seltener Drop
                    </label>
                  </div>
                  <button onClick={addDrop} disabled={loading || !newDrop.itemId}>
                    ➕ Drop hinzufügen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* USER LOOKUP SECTION */}
      {activeSection === 'users' && (
        <div className="api-section">
          <div className="section-header">
            <h3>👤 Benutzer nachschlagen</h3>
          </div>

          <div className="user-search">
            <input 
              type="text" 
              placeholder="Username oder ID eingeben..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookupUser()}
            />
            <button onClick={lookupUser} disabled={loading}>🔍 Suchen</button>
          </div>

          {userData && (
            <div className="user-details">
              <h4>👤 {userData.username}</h4>
              <div className="user-info-grid">
                <div className="info-item"><strong>ID:</strong> {userData.id}</div>
                <div className="info-item"><strong>Email:</strong> {userData.email || '-'}</div>
                <div className="info-item"><strong>Rolle:</strong> {userData.role}</div>
                <div className="info-item"><strong>Gold:</strong> {userData.gold}</div>
                <div className="info-item"><strong>Position:</strong> {userData.world_x}, {userData.world_y}</div>
                <div className="info-item"><strong>Home:</strong> {userData.home_x}, {userData.home_y}</div>
                <div className="info-item"><strong>Level:</strong> {userData.level || 1}</div>
                <div className="info-item"><strong>XP:</strong> {userData.experience || 0}</div>
                <div className="info-item"><strong>Aktiviert:</strong> {userData.is_activated ? '✅' : '❌'}</div>
                <div className="info-item"><strong>Erstellt:</strong> {new Date(userData.created_at).toLocaleString('de-DE')}</div>
                <div className="info-item"><strong>Letzter Login:</strong> {userData.last_login ? new Date(userData.last_login).toLocaleString('de-DE') : '-'}</div>
              </div>

              {userJobs && (
                <div className="user-jobs">
                  <h5>Aktive Jobs:</h5>
                  {Object.entries(userJobs).every(([k, v]) => !v || v.length === 0) ? (
                    <div className="no-data">Keine aktiven Jobs</div>
                  ) : (
                    <ul>
                      {userJobs.gathering?.map(j => <li key={`g${j.id}`}>⛏️ Gathering #{j.id}</li>)}
                      {userJobs.collection?.map(j => <li key={`c${j.id}`}>🌾 Collection #{j.id}</li>)}
                      {userJobs.building?.map(j => <li key={`b${j.id}`}>🏠 Building #{j.id}</li>)}
                      {userJobs.crafting?.map(j => <li key={`cr${j.id}`}>🔨 Crafting #{j.id}</li>)}
                    </ul>
                  )}
                  <button onClick={() => clearUserJobs(userData.id)} className="danger">
                    🗑️ Alle Jobs dieses Users löschen
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* DATABASE SECTION */}
      {activeSection === 'database' && (
        <div className="api-section">
          <div className="section-header">
            <h3>🗄️ Datenbank Query (nur SELECT)</h3>
          </div>

          <div className="query-input">
            <textarea 
              placeholder="SELECT * FROM users LIMIT 10"
              value={sqlQuery}
              onChange={e => setSqlQuery(e.target.value)}
              rows={4}
            />
            <button onClick={executeQuery} disabled={loading}>▶️ Ausführen</button>
          </div>

          <div className="quick-queries">
            <span>Schnellabfragen:</span>
            <button onClick={() => setSqlQuery('SELECT * FROM users ORDER BY id DESC LIMIT 20')}>Users</button>
            <button onClick={() => setSqlQuery('SELECT * FROM resource_node_types')}>Node Types</button>
            <button onClick={() => setSqlQuery('SELECT * FROM resource_node_drops')}>Drops</button>
            <button onClick={() => setSqlQuery('SELECT * FROM items WHERE type = "resource"')}>Ressourcen-Items</button>
            <button onClick={() => setSqlQuery('SELECT * FROM gathering_jobs WHERE is_completed = 0')}>Aktive Gathering</button>
            <button onClick={() => setSqlQuery('SELECT * FROM crafting_jobs WHERE is_completed = 0')}>Aktive Crafting</button>
          </div>

          {queryResult && (
            <div className="query-result">
              {queryResult.error ? (
                <div className="error">{queryResult.error}</div>
              ) : (
                <>
                  <div className="result-info">{queryResult.rowCount} Zeilen</div>
                  {queryResult.rows?.length > 0 ? (
                    <div className="result-table-wrapper">
                      <table className="result-table">
                        <thead>
                          <tr>
                            {Object.keys(queryResult.rows[0]).map(key => (
                              <th key={key}>{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.rows.map((row, idx) => (
                            <tr key={idx}>
                              {Object.values(row).map((val, vidx) => (
                                <td key={vidx}>{val === null ? 'NULL' : String(val)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="no-data">Keine Ergebnisse</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ApiManagement;
