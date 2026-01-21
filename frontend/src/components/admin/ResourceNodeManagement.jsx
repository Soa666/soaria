import { useState, useEffect } from 'react';
import api from '../../services/api';
import './ResourceNodeManagement.css';

function ResourceNodeManagement() {
  const [nodeTypes, setNodeTypes] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedNodeType, setSelectedNodeType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const [dropForm, setDropForm] = useState({
    item_id: '',
    drop_chance: 100,
    min_quantity: 1,
    max_quantity: 1,
    min_tool_tier: 0,
    is_rare: false
  });

  useEffect(() => {
    fetchNodeTypes();
    fetchItems();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const fetchNodeTypes = async () => {
    try {
      const response = await api.get('/resources/admin/node-types');
      setNodeTypes(response.data.nodeTypes || []);
    } catch (err) {
      setError('Fehler beim Laden der Ressourcen-Typen');
      console.error('Fetch node types error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get('/admin/items');
      setItems(response.data.items || []);
    } catch (err) {
      console.error('Fehler beim Laden der Items:', err);
    }
  };

  const selectNodeType = (nodeType) => {
    if (selectedNodeType?.id === nodeType.id) {
      setSelectedNodeType(null);
      return;
    }
    setSelectedNodeType(nodeType);
    setDropForm({
      item_id: '',
      drop_chance: 100,
      min_quantity: 1,
      max_quantity: 1,
      min_tool_tier: 0,
      is_rare: false
    });
  };

  const handleAddDrop = async (e) => {
    e.preventDefault();
    if (!selectedNodeType) return;

    if (!dropForm.item_id) {
      setError('Bitte wähle ein Item');
      return;
    }

    try {
      await api.post(`/resources/admin/node-types/${selectedNodeType.id}/drops`, {
        itemId: parseInt(dropForm.item_id),
        dropChance: parseInt(dropForm.drop_chance),
        minQuantity: parseInt(dropForm.min_quantity),
        maxQuantity: parseInt(dropForm.max_quantity),
        minToolTier: parseInt(dropForm.min_tool_tier) || 0,
        isRare: dropForm.is_rare
      });
      setMessage('Drop hinzugefügt!');
      fetchNodeTypes();
      setSelectedNodeType(null);
      setDropForm({
        item_id: '',
        drop_chance: 100,
        min_quantity: 1,
        max_quantity: 1,
        min_tool_tier: 0,
        is_rare: false
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Hinzufügen');
    }
  };

  const handleDeleteDrop = async (nodeTypeId, itemId) => {
    if (!confirm('Drop wirklich entfernen?')) return;

    try {
      await api.delete(`/resources/admin/node-types/${nodeTypeId}/drops/${itemId}`);
      setMessage('Drop entfernt!');
      fetchNodeTypes();
      if (selectedNodeType?.id === nodeTypeId) {
        const updated = nodeTypes.find(n => n.id === nodeTypeId);
        if (updated) {
          updated.drops = updated.drops.filter(d => d.item_id !== itemId);
          setSelectedNodeType(updated);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Entfernen');
    }
  };

  const handleUpdateDrop = async (drop) => {
    try {
      await api.post(`/resources/admin/node-types/${drop.node_type_id}/drops`, {
        itemId: drop.item_id,
        dropChance: drop.drop_chance,
        minQuantity: drop.min_quantity,
        maxQuantity: drop.max_quantity,
        minToolTier: drop.min_tool_tier || 0,
        isRare: drop.is_rare === 1
      });
      setMessage('Drop aktualisiert!');
      fetchNodeTypes();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Aktualisieren');
    }
  };

  // Filter node types
  const filteredNodeTypes = nodeTypes.filter(nodeType => {
    const matchesSearch = nodeType.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          nodeType.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || nodeType.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Get unique categories
  const categories = [...new Set(nodeTypes.map(n => n.category))].sort();

  if (loading) return <div className="loading">Lädt Ressourcen-Typen...</div>;

  return (
    <div className="resource-node-management">
      <div className="resource-header">
        <h2>⛏️ Ressourcen & Drops ({nodeTypes.length})</h2>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Ressourcen-Typ suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-buttons">
          <button 
            className={filterCategory === 'all' ? 'active' : ''}
            onClick={() => setFilterCategory('all')}
          >
            Alle ({nodeTypes.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={filterCategory === cat ? 'active' : ''}
              onClick={() => setFilterCategory(cat)}
            >
              {cat === 'mining' ? '⛏️ Mining' : 
               cat === 'woodcutting' ? '🪓 Holzfällen' :
               cat === 'herbalism' ? '🌿 Kräuter' : cat} ({nodeTypes.filter(n => n.category === cat).length})
            </button>
          ))}
        </div>
      </div>

      {/* Node Types Table */}
      <div className="node-types-table-container">
        <table className="node-types-table">
          <thead>
            <tr>
              <th style={{width: '40px'}}>Icon</th>
              <th>Name</th>
              <th>Kategorie</th>
              <th>Tool</th>
              <th>Level</th>
              <th>Zeit</th>
              <th>Respawn</th>
              <th>Drops</th>
              <th>Gespawnt</th>
              <th style={{width: '80px'}}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filteredNodeTypes.map(nodeType => (
              <>
                <tr 
                  key={nodeType.id} 
                  className={`node-type-row ${selectedNodeType?.id === nodeType.id ? 'selected' : ''}`}
                  onClick={() => selectNodeType(nodeType)}
                >
                  <td className="icon-cell">
                    <span className="node-icon">{nodeType.icon || '⛏️'}</span>
                  </td>
                  <td className="name-cell">
                    <span className="node-name">{nodeType.display_name}</span>
                    <span className="node-internal">({nodeType.name})</span>
                  </td>
                  <td>
                    <span className={`category-badge ${nodeType.category}`}>
                      {nodeType.category === 'mining' ? '⛏️ Mining' : 
                       nodeType.category === 'woodcutting' ? '🪓 Holz' :
                       nodeType.category === 'herbalism' ? '🌿 Kräuter' : nodeType.category}
                    </span>
                  </td>
                  <td>{nodeType.required_tool_type || '-'}</td>
                  <td>{nodeType.min_level || 1}+</td>
                  <td>{nodeType.base_gather_time || 0}s</td>
                  <td>{nodeType.respawn_minutes || 0} Min</td>
                  <td>{nodeType.drops?.length || 0} Items</td>
                  <td>{nodeType.spawn_count || 0}x</td>
                  <td className="action-cell">
                    <button 
                      className="btn-icon" 
                      onClick={(e) => {
                        e.stopPropagation();
                        // TODO: Spawn modal
                      }}
                      title="Spawnen"
                    >
                      🌍
                    </button>
                  </td>
                </tr>
                {selectedNodeType?.id === nodeType.id && (
                  <tr className="drops-row">
                    <td colSpan="10">
                      <div className="drops-panel">
                        <div className="drops-header">
                          <h4>📦 Drops für {nodeType.display_name}</h4>
                          {nodeType.description && (
                            <p className="node-description">{nodeType.description}</p>
                          )}
                        </div>

                        <div className="drops-content">
                          <div className="drops-list">
                            {nodeType.drops && nodeType.drops.length > 0 ? (
                              <table className="drops-table">
                                <thead>
                                  <tr>
                                    <th>Item</th>
                                    <th>Menge</th>
                                    <th>Chance</th>
                                    <th>Min. Tool Tier</th>
                                    <th>Selten</th>
                                    <th></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {nodeType.drops.map((drop, idx) => (
                                    <tr key={idx}>
                                      <td className="drop-item-name">{drop.item_name}</td>
                                      <td>{drop.min_quantity}-{drop.max_quantity}</td>
                                      <td>
                                        <span className={`chance-badge ${drop.drop_chance >= 80 ? 'high' : drop.drop_chance >= 50 ? 'medium' : 'low'}`}>
                                          {drop.drop_chance}%
                                        </span>
                                      </td>
                                      <td>{drop.min_tool_tier || 0}</td>
                                      <td>{drop.is_rare === 1 ? '⭐ Ja' : '-'}</td>
                                      <td>
                                        <button 
                                          className="btn-remove-small"
                                          onClick={() => handleDeleteDrop(nodeType.id, drop.item_id)}
                                        >
                                          ✕
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="no-drops">Keine Drops konfiguriert - füge Items hinzu!</p>
                            )}
                          </div>

                          <div className="drops-add-form">
                            <h5>+ Drop hinzufügen</h5>
                            <form onSubmit={handleAddDrop}>
                              <div className="drop-form-grid">
                                <div className="drop-field">
                                  <label>Item</label>
                                  <select
                                    value={dropForm.item_id}
                                    onChange={(e) => setDropForm({...dropForm, item_id: e.target.value})}
                                    required
                                  >
                                    <option value="">Wählen...</option>
                                    {items.map(item => (
                                      <option key={item.id} value={item.id}>{item.display_name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="drop-field small">
                                  <label>Min. Menge</label>
                                  <input
                                    type="number"
                                    value={dropForm.min_quantity}
                                    onChange={(e) => setDropForm({...dropForm, min_quantity: parseInt(e.target.value) || 1})}
                                    min="1"
                                  />
                                </div>
                                <div className="drop-field small">
                                  <label>Max. Menge</label>
                                  <input
                                    type="number"
                                    value={dropForm.max_quantity}
                                    onChange={(e) => setDropForm({...dropForm, max_quantity: parseInt(e.target.value) || 1})}
                                    min="1"
                                  />
                                </div>
                                <div className="drop-field small">
                                  <label>Chance (%)</label>
                                  <input
                                    type="number"
                                    value={dropForm.drop_chance}
                                    onChange={(e) => setDropForm({...dropForm, drop_chance: parseInt(e.target.value) || 100})}
                                    min="0"
                                    max="100"
                                  />
                                </div>
                                <div className="drop-field small">
                                  <label>Min. Tool Tier</label>
                                  <input
                                    type="number"
                                    value={dropForm.min_tool_tier}
                                    onChange={(e) => setDropForm({...dropForm, min_tool_tier: parseInt(e.target.value) || 0})}
                                    min="0"
                                  />
                                </div>
                                <div className="drop-field small">
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={dropForm.is_rare}
                                      onChange={(e) => setDropForm({...dropForm, is_rare: e.target.checked})}
                                    />
                                    <span>Selten ⭐</span>
                                  </label>
                                </div>
                                <button type="submit" className="btn-add-drop">+ Hinzufügen</button>
                              </div>
                            </form>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        
        {filteredNodeTypes.length === 0 && (
          <div className="no-results">
            Keine Ressourcen-Typen gefunden
          </div>
        )}
      </div>
    </div>
  );
}

export default ResourceNodeManagement;
