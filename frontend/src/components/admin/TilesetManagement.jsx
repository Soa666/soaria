import { useState, useEffect } from 'react';
import api from '../../services/api';
import './TilesetManagement.css';

const TILE_SIZE = 16;
const TILESET_COLUMNS = 27;
const TILESET_URL = '/world/punyworld-overworld-tileset.png';

const TERRAIN_TYPES = [
  { value: 'grass', label: 'Gras', color: '#4a7c3f' },
  { value: 'water', label: 'Wasser', color: '#3a8bbd' },
  { value: 'forest', label: 'Wald', color: '#2d5a2d' },
  { value: 'path', label: 'Pfad', color: '#a08060' },
  { value: 'sand', label: 'Sand', color: '#d4b896' },
  { value: 'dirt', label: 'Dreck', color: '#8b7355' },
  { value: 'cliff', label: 'Klippe', color: '#6b6b6b' },
  { value: 'other', label: 'Sonstiges', color: '#888888' }
];

function TilesetManagement() {
  const [tilesetImage, setTilesetImage] = useState(null);
  const [tileMappings, setTileMappings] = useState({});
  const [selectedTile, setSelectedTile] = useState(null);
  const [selectedTerrain, setSelectedTerrain] = useState('grass');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [filterTerrain, setFilterTerrain] = useState('all');
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    loadTileset();
    loadMappings();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const loadTileset = () => {
    const img = new Image();
    img.onload = () => {
      setTilesetImage(img);
      setImageSize({ width: img.width, height: img.height });
      setLoading(false);
    };
    img.onerror = () => {
      setError('Tileset konnte nicht geladen werden');
      setLoading(false);
    };
    img.src = TILESET_URL;
  };

  const loadMappings = async () => {
    try {
      const response = await api.get('/admin/tileset/mappings');
      setTileMappings(response.data.mappings || {});
    } catch (err) {
      console.error('Fehler beim Laden der Tile-Mappings:', err);
      setTileMappings({});
    }
  };

  const handleTileClick = (tileId) => {
    setSelectedTile(tileId);
    if (tileMappings[tileId]) {
      setSelectedTerrain(tileMappings[tileId].terrain);
    } else {
      setSelectedTerrain('grass');
    }
  };

  const handleSaveMapping = async () => {
    if (!selectedTile) return;

    try {
      await api.post('/admin/tileset/mappings', {
        tileId: selectedTile,
        terrain: selectedTerrain
      });
      
      setTileMappings({
        ...tileMappings,
        [selectedTile]: { terrain: selectedTerrain }
      });
      
      setMessage(`Tile ${selectedTile} als ${TERRAIN_TYPES.find(t => t.value === selectedTerrain)?.label} gespeichert!`);
      setSelectedTile(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  const handleDeleteMapping = async (tileId) => {
    try {
      await api.delete(`/admin/tileset/mappings/${tileId}`);
      const newMappings = { ...tileMappings };
      delete newMappings[tileId];
      setTileMappings(newMappings);
      setMessage(`Mapping für Tile ${tileId} gelöscht`);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Löschen');
    }
  };

  const handleImportSuggestions = async () => {
    if (!confirm('Möchtest du die Vorschläge aus der Wang-Tile-Datei importieren? Nur noch nicht gemappte Tiles werden hinzugefügt.')) {
      return;
    }

    try {
      const response = await api.post('/tileset/apply-suggestions');
      setMessage(`${response.data.applied} Mappings importiert (von ${response.data.total} Vorschlägen)`);
      await loadMappings(); // Reload mappings
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Importieren');
    }
  };

  const getTileTerrain = (tileId) => {
    return tileMappings[tileId]?.terrain || null;
  };

  const getTerrainColor = (terrain) => {
    const type = TERRAIN_TYPES.find(t => t.value === terrain);
    return type ? type.color : 'transparent';
  };

  // Calculate total tiles
  const totalTiles = imageSize.width > 0 && imageSize.height > 0 
    ? Math.floor((imageSize.width / TILE_SIZE) * (imageSize.height / TILE_SIZE))
    : 0;
  const tilesPerRow = imageSize.width > 0 ? Math.floor(imageSize.width / TILE_SIZE) : TILESET_COLUMNS;

  // Filter tiles
  const allTiles = Array.from({ length: totalTiles }, (_, i) => i);
  const filteredTiles = filterTerrain === 'all' 
    ? allTiles
    : filterTerrain === 'unmapped'
    ? allTiles.filter(tileId => !tileMappings[tileId])
    : allTiles.filter(tileId => tileMappings[tileId]?.terrain === filterTerrain);

  if (loading) {
    return <div className="loading">Lädt Tileset...</div>;
  }

  return (
    <div className="tileset-management">
      <div className="tileset-header">
        <h2>🎨 Tileset-Verwaltung</h2>
        <div className="tileset-stats">
          <span>Gesamt: {totalTiles} Tiles</span>
          <span>Gemappt: {Object.keys(tileMappings).length}</span>
          <span>Offen: {totalTiles - Object.keys(tileMappings).length}</span>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      {/* Filter */}
      <div className="tileset-filters">
        <button 
          className={filterTerrain === 'all' ? 'active' : ''}
          onClick={() => setFilterTerrain('all')}
        >
          Alle ({totalTiles})
        </button>
        <button 
          className={filterTerrain === 'unmapped' ? 'active' : ''}
          onClick={() => setFilterTerrain('unmapped')}
        >
          Nicht gemappt ({totalTiles - Object.keys(tileMappings).length})
        </button>
        {TERRAIN_TYPES.map(type => (
          <button
            key={type.value}
            className={filterTerrain === type.value ? 'active' : ''}
            onClick={() => setFilterTerrain(type.value)}
            style={{ borderLeft: `3px solid ${type.color}` }}
          >
            {type.label} ({Object.values(tileMappings).filter(m => m.terrain === type.value).length})
          </button>
        ))}
      </div>

      {/* Tileset Grid */}
      <div className="tileset-container">
        <div className="tileset-grid">
          {filteredTiles.map(tileId => {
            const terrain = getTileTerrain(tileId);
            const col = tileId % TILESET_COLUMNS;
            const row = Math.floor(tileId / TILESET_COLUMNS);
            const isSelected = selectedTile === tileId;

            return (
              <div
                key={tileId}
                className={`tile-item ${isSelected ? 'selected' : ''} ${terrain ? 'mapped' : 'unmapped'}`}
                style={{
                  backgroundImage: `url(${TILESET_URL})`,
                  backgroundPosition: `-${col * TILE_SIZE}px -${row * TILE_SIZE}px`,
                  backgroundSize: `${imageSize.width}px ${imageSize.height}px`,
                  backgroundRepeat: 'no-repeat',
                  width: `${TILE_SIZE * 3}px`,
                  height: `${TILE_SIZE * 3}px`,
                  border: terrain ? `2px solid ${getTerrainColor(terrain)}` : '2px solid #444',
                  boxShadow: isSelected ? `0 0 10px ${getTerrainColor(terrain) || '#d4af37'}` : 'none'
                }}
                onClick={() => handleTileClick(tileId)}
                title={`Tile ${tileId}${terrain ? ` - ${TERRAIN_TYPES.find(t => t.value === terrain)?.label}` : ' - Nicht gemappt'}`}
              >
                <div className="tile-id">{tileId}</div>
                {terrain && (
                  <div 
                    className="tile-badge"
                    style={{ backgroundColor: getTerrainColor(terrain) }}
                  >
                    {TERRAIN_TYPES.find(t => t.value === terrain)?.label.charAt(0)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Modal */}
      {selectedTile !== null && (
        <div className="modal-overlay" onClick={() => setSelectedTile(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Tile {selectedTile} bearbeiten</h3>
              <button className="modal-close" onClick={() => setSelectedTile(null)}>✕</button>
            </div>

            <div className="tile-preview-large">
              <div
                className="tile-preview-image"
                style={{
                  backgroundImage: `url(${TILESET_URL})`,
                  backgroundPosition: `-${(selectedTile % TILESET_COLUMNS) * TILE_SIZE}px -${Math.floor(selectedTile / TILESET_COLUMNS) * TILE_SIZE}px`,
                  backgroundSize: `${imageSize.width}px ${imageSize.height}px`,
                  backgroundRepeat: 'no-repeat',
                  width: `${TILE_SIZE * 4}px`,
                  height: `${TILE_SIZE * 4}px`
                }}
              />
            </div>

            <div className="terrain-selector">
              <label>Terrain-Typ:</label>
              <div className="terrain-options">
                {TERRAIN_TYPES.map(type => (
                  <button
                    key={type.value}
                    className={`terrain-option ${selectedTerrain === type.value ? 'active' : ''}`}
                    onClick={() => setSelectedTerrain(type.value)}
                    style={{ 
                      borderLeft: `4px solid ${type.color}`,
                      backgroundColor: selectedTerrain === type.value ? `${type.color}20` : 'transparent'
                    }}
                  >
                    <span className="terrain-color" style={{ backgroundColor: type.color }}></span>
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-save" onClick={handleSaveMapping}>
                💾 Speichern
              </button>
              {tileMappings[selectedTile] && (
                <button 
                  className="btn-delete"
                  onClick={() => {
                    handleDeleteMapping(selectedTile);
                    setSelectedTile(null);
                  }}
                >
                  🗑️ Löschen
                </button>
              )}
              <button className="btn-cancel" onClick={() => setSelectedTile(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TilesetManagement;
