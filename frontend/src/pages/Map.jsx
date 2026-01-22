import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotificationContext } from '../context/NotificationContext';
import './Map.css';

// Tileset configuration - Punyworld Overworld Tileset
// 432x1040 pixels = 27 columns x ~38 rows of 16x16 tiles (1755 tiles total)
const TILE_SIZE = 16;
const TILESET_COLUMNS = 27;
const TILESET_URL = '/world/punyworld-overworld-tileset.png';

// Autotile system for smooth terrain transitions
// The tileset uses a 3x4 autotile layout for each terrain type
// We use a simplified 4-bit neighbor system (N, E, S, W)

// ============================================================
// TILE DEFINITIONS based on grass_biome.tsx and map1.tmx
// ============================================================

// ============================================================
// PUNYWORLD OVERWORLD TILESET MAPPING
// Based on wang-tiles from punyworld-overworld-tiles.tsx
// ============================================================

// Grass tiles - wangid="0,1,0,1,0,1,0,1" (all grass corners)
const GRASS_TILES = [0, 1, 2, 27, 28, 29, 54, 55, 56];  // Pure grass tiles

// Grass with flowers/details (for decoration, used sparingly)
const GRASS_FLOWER_TILES = [10, 11, 12, 13, 14, 22, 23, 24, 25, 26];

// Water autotile - based on wang-tiles with water (0,6 and 0,12)
// Wang-tiles show water transitions
const WATER_AUTOTILE = {
  solid: 195,        // "0,6,0,6,0,6,0,6" - all water (deep)
  // Outer edges (grass on one side)
  top: 189,          // "0,5,0,6,0,5,0,5" - grass above
  bottom: 216,       // "0,6,0,6,0,5,0,5" - grass below
  left: 191,         // "0,5,0,5,0,6,0,5" - grass left
  right: 194,        // "0,5,0,6,0,5,0,5" - grass right
  // Outer corners (grass on two adjacent sides)
  topLeft: 189,      // "0,5,0,6,0,5,0,5" - grass top-left corner
  topRight: 190,     // "0,5,0,6,0,6,0,5" - grass top-right corner
  bottomLeft: 192,   // "0,5,0,5,0,6,0,5" - grass bottom-left corner
  bottomRight: 193,  // "0,5,0,6,0,6,0,5" - grass bottom-right corner
  // Inner corners (water with one grass corner poking in)
  innerTopLeft: 191,     // Water with grass corner
  innerTopRight: 194,    // Water with grass corner
  innerBottomLeft: 192,  // Water with grass corner
  innerBottomRight: 193, // Water with grass corner
  // Alternative water tiles (lighter water)
  light: 204,        // "0,5,0,12,0,12,0,12" - light water
  medium: 226,       // "0,12,0,12,0,12,0,12" - medium water
};

// Forest/Trees autotile - based on wang-tiles with trees (0,5 and 0,11)
const FOREST_AUTOTILE = {
  solid: 147,        // "0,11,0,11,0,11,0,11" - all trees
  // Outer edges
  top: 146,          // "0,11,0,11,0,5,0,5" - grass above
  bottom: 135,       // "0,4,0,4,0,1,0,1" - grass below (using available tile)
  left: 148,         // "0,5,0,5,0,11,0,11" - grass left
  right: 149,        // "0,11,0,11,0,5,0,11" - grass right
  // Outer corners
  topLeft: 146,      // "0,11,0,11,0,5,0,5" - grass top-left
  topRight: 150,     // "0,11,0,5,0,11,0,11" - grass top-right
  bottomLeft: 148,   // "0,5,0,5,0,11,0,11" - grass bottom-left
  bottomRight: 149,  // "0,11,0,11,0,5,0,11" - grass bottom-right
  // Inner corners
  innerTopLeft: 173,    // "0,11,0,5,0,5,0,5" - grass only at top-left
  innerTopRight: 174,   // "0,11,0,5,0,5,0,11" - grass only at top-right
  innerBottomLeft: 176, // "0,5,0,11,0,5,0,11" - grass only at bottom-left
  innerBottomRight: 177, // "0,11,0,5,0,11,0,5" - grass only at bottom-right
};

// Path/road tiles - dirt paths (from pathways wangset)
// Based on wang-tiles with dirt-paths
const PATH_TILES = {
  // Straight paths
  horizontal: 4,     // Horizontal path
  vertical: 5,       // Vertical path
  
  // 4-way crossing
  cross: 6,          // 4-way cross
  
  // Corners (L-shapes)
  cornerSE: 31,      // └ - corner
  cornerSW: 32,      // ┘ - corner
  cornerNE: 33,      // ┌ - corner
  cornerNW: 4,       // ┐ - corner (using available)
  
  // T-junctions
  tUp: 4,            // ┴ - T with opening up
  tDown: 5,          // ┬ - T with opening down
  tLeft: 5,          // ┤ - T with opening left
  tRight: 4,         // ├ - T with opening right
};

// Get the correct autotile based on neighbors
// Now includes diagonal neighbors for inner corners!
// neighbors object has: north, east, south, west, ne, nw, se, sw
function getWaterAutotileWithDiagonals(neighbors, category) {
  const W = WATER_AUTOTILE;
  
  const hasN = getTerrainCategory(neighbors.north) === category;
  const hasE = getTerrainCategory(neighbors.east) === category;
  const hasS = getTerrainCategory(neighbors.south) === category;
  const hasW = getTerrainCategory(neighbors.west) === category;
  const hasNE = getTerrainCategory(neighbors.ne) === category;
  const hasNW = getTerrainCategory(neighbors.nw) === category;
  const hasSE = getTerrainCategory(neighbors.se) === category;
  const hasSW = getTerrainCategory(neighbors.sw) === category;
  
  // All 4 cardinal neighbors are water - check diagonals for inner corners
  if (hasN && hasE && hasS && hasW) {
    // Inner corners - all cardinal same, but one diagonal different
    if (!hasNW && hasNE && hasSE && hasSW) return W.innerTopLeft;
    if (hasNW && !hasNE && hasSE && hasSW) return W.innerTopRight;
    if (hasNW && hasNE && !hasSE && hasSW) return W.innerBottomRight;
    if (hasNW && hasNE && hasSE && !hasSW) return W.innerBottomLeft;
    return W.solid;
  }
  
  // Outer edges (one cardinal side is grass)
  if (!hasN && hasE && hasS && hasW) return W.top;
  if (hasN && !hasE && hasS && hasW) return W.right;
  if (hasN && hasE && !hasS && hasW) return W.bottom;
  if (hasN && hasE && hasS && !hasW) return W.left;
  
  // Outer corners (two adjacent cardinal sides are grass)
  if (!hasN && !hasW) return W.topLeft;
  if (!hasN && !hasE) return W.topRight;
  if (!hasS && !hasW) return W.bottomLeft;
  if (!hasS && !hasE) return W.bottomRight;
  
  return W.solid;
}

function getForestAutotileWithDiagonals(neighbors, category) {
  const F = FOREST_AUTOTILE;
  
  const hasN = getTerrainCategory(neighbors.north) === category;
  const hasE = getTerrainCategory(neighbors.east) === category;
  const hasS = getTerrainCategory(neighbors.south) === category;
  const hasW = getTerrainCategory(neighbors.west) === category;
  const hasNE = getTerrainCategory(neighbors.ne) === category;
  const hasNW = getTerrainCategory(neighbors.nw) === category;
  const hasSE = getTerrainCategory(neighbors.se) === category;
  const hasSW = getTerrainCategory(neighbors.sw) === category;
  
  // All 4 cardinal neighbors are forest - check diagonals for inner corners
  if (hasN && hasE && hasS && hasW) {
    if (!hasNW && hasNE && hasSE && hasSW) return F.innerTopLeft;
    if (hasNW && !hasNE && hasSE && hasSW) return F.innerTopRight;
    if (hasNW && hasNE && !hasSE && hasSW) return F.innerBottomRight;
    if (hasNW && hasNE && hasSE && !hasSW) return F.innerBottomLeft;
    return F.solid;
  }
  
  // Outer edges
  if (!hasN && hasE && hasS && hasW) return F.top;
  if (hasN && !hasE && hasS && hasW) return F.right;
  if (hasN && hasE && !hasS && hasW) return F.bottom;
  if (hasN && hasE && hasS && !hasW) return F.left;
  
  // Outer corners
  if (!hasN && !hasW) return F.topLeft;
  if (!hasN && !hasE) return F.topRight;
  if (!hasS && !hasW) return F.bottomLeft;
  if (!hasS && !hasE) return F.bottomRight;
  
  return F.solid;
}

// Simple terrain categories for autotiling
function getTerrainCategory(terrain) {
  if (terrain === 'water' || terrain === 'deepWater') return 'water';
  if (terrain === 'forest' || terrain === 'trees') return 'forest';
  if (terrain === 'path') return 'path';
  return 'grass';
}

// Seeded random number generator for consistent terrain
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Smooth interpolation (quintic for smoother results)
function smoothstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// 2D gradient noise with smooth interpolation
function gradientNoise(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  
  const fx = x - x0;
  const fy = y - y0;
  
  const sx = smoothstep(fx);
  const sy = smoothstep(fy);
  
  const n00 = seededRandom(x0 * 374761393 + y0 * 668265263 + seed);
  const n10 = seededRandom(x1 * 374761393 + y0 * 668265263 + seed);
  const n01 = seededRandom(x0 * 374761393 + y1 * 668265263 + seed);
  const n11 = seededRandom(x1 * 374761393 + y1 * 668265263 + seed);
  
  const nx0 = n00 * (1 - sx) + n10 * sx;
  const nx1 = n01 * (1 - sx) + n11 * sx;
  
  return nx0 * (1 - sy) + nx1 * sy;
}

// Multi-octave fractal noise
function fractalNoise(x, y, octaves = 4, persistence = 0.5, scale = 0.01, seed = 0) {
  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxValue = 0;
  
  for (let i = 0; i < octaves; i++) {
    value += amplitude * gradientNoise(x * frequency, y * frequency, seed + i * 1000);
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  
  return value / maxValue;
}

// Get tile ID for terrain with autotiling support
function getTileForTerrainWithNeighbors(terrain, variation, neighbors) {
  const category = getTerrainCategory(terrain);
  
  // For grass, use grass tiles
  if (category === 'grass') {
    const index = Math.floor(variation * GRASS_TILES.length) % GRASS_TILES.length;
    return GRASS_TILES[index];
  }
  
  // For paths, use the correct directional tile
  if (category === 'path') {
    const nPath = getTerrainCategory(neighbors.north) === 'path';
    const sPath = getTerrainCategory(neighbors.south) === 'path';
    const ePath = getTerrainCategory(neighbors.east) === 'path';
    const wPath = getTerrainCategory(neighbors.west) === 'path';
    
    // Count connections
    const connections = (nPath ? 1 : 0) + (sPath ? 1 : 0) + (ePath ? 1 : 0) + (wPath ? 1 : 0);
    
    // 4-way crossroad
    if (connections === 4) return PATH_TILES.cross;
    
    // 3-way T-junctions
    if (connections === 3) {
      if (!nPath) return PATH_TILES.tDown;  // T pointing down
      if (!sPath) return PATH_TILES.tUp;    // T pointing up
      if (!ePath) return PATH_TILES.tLeft;  // T pointing left
      if (!wPath) return PATH_TILES.tRight; // T pointing right
    }
    
    // Straight paths (2 opposite connections)
    if (nPath && sPath && !ePath && !wPath) return PATH_TILES.vertical;
    if (ePath && wPath && !nPath && !sPath) return PATH_TILES.horizontal;
    
    // Corners (2 adjacent connections)
    if (sPath && ePath && !nPath && !wPath) return PATH_TILES.cornerNW;  // └ shape
    if (sPath && wPath && !nPath && !ePath) return PATH_TILES.cornerNE;  // ┘ shape
    if (nPath && ePath && !sPath && !wPath) return PATH_TILES.cornerSW;  // ┌ shape
    if (nPath && wPath && !sPath && !ePath) return PATH_TILES.cornerSE;  // ┐ shape
    
    // Single connection (end pieces) - use straight tile in that direction
    if (nPath || sPath) return PATH_TILES.vertical;
    if (ePath || wPath) return PATH_TILES.horizontal;
    
    // Isolated path tile
    return PATH_TILES.horizontal;
  }
  
  // Calculate neighbor mask for autotiling
  // Bits: N=8, E=4, S=2, W=1
  let mask = 0;
  if (getTerrainCategory(neighbors.north) === category) mask |= 8;
  if (getTerrainCategory(neighbors.east) === category) mask |= 4;
  if (getTerrainCategory(neighbors.south) === category) mask |= 2;
  if (getTerrainCategory(neighbors.west) === category) mask |= 1;
  
  // Get autotile based on terrain type (now with diagonal support)
  if (category === 'water') {
    return getWaterAutotileWithDiagonals(neighbors, category);
  }
  if (category === 'forest') {
    return getForestAutotileWithDiagonals(neighbors, category);
  }
  
  return GRASS_TILES[0];
}

// Fallback colors for when tileset fails to load
function getTerrainColor(terrain) {
  const colors = {
    grass: '#4a7c3f',
    forest: '#2d5a2d',
    trees: '#3d6b3d',
    water: '#3a8bbd',
    deepWater: '#1a5a8a',
    sand: '#d4b896',
    dirt: '#8b7355',
    cliff: '#6b6b6b',
    flowers: '#5a8c5a',
    path: '#a08060',
  };
  return colors[terrain] || colors.grass;
}

// Check if terrain is water
function isWaterTerrain(terrain) {
  return terrain === 'water' || terrain === 'deepWater';
}

// Path system - creates a network of dirt roads (1 tile wide!)
function getPathInfo(worldX, worldY) {
  const roadSpacing = 200;
  
  // Check if on vertical road (x is multiple of roadSpacing)
  const onVertical = Math.abs(worldX % roadSpacing) === 0;
  
  // Check if on horizontal road (y is multiple of roadSpacing)  
  const onHorizontal = Math.abs(worldY % roadSpacing) === 0;
  
  if (onVertical && onHorizontal) {
    return 'cross';      // Intersection
  } else if (onVertical) {
    return 'vertical';   // Vertical road
  } else if (onHorizontal) {
    return 'horizontal'; // Horizontal road
  }
  return null;
}

function isOnPath(worldX, worldY) {
  return getPathInfo(worldX, worldY) !== null;
}

// ============================================================
// VERBESSERTE TERRAIN GENERATION
// Neue, verbesserte Terrain-Generierung für natürlichere Landschaften
// ============================================================
function getTerrainAt(worldX, worldY) {
  // Hauptkontinente - sehr große Landmassen (weniger Oktaven für glattere Formen)
  const continentNoise = fractalNoise(worldX, worldY, 3, 0.5, 0.0008, 12345);
  
  // Regionale Variation - mittlere Details
  const regionNoise = fractalNoise(worldX, worldY, 4, 0.5, 0.003, 54321);
  
  // Lokale Details - feine Strukturen
  const detailNoise = fractalNoise(worldX, worldY, 3, 0.4, 0.01, 99999);
  
  // Kombiniere für finale Höhenkarte
  const height = continentNoise * 0.6 + regionNoise * 0.25 + detailNoise * 0.15;
  
  // Forest-spezifisches Noise (unabhängig von Höhe)
  const forestCluster = fractalNoise(worldX, worldY, 3, 0.5, 0.005, 77777);
  const forestDetail = fractalNoise(worldX, worldY, 2, 0.3, 0.015, 88888);
  const forestValue = forestCluster * 0.7 + forestDetail * 0.3;
  
  // See/Teich Noise (für Binnengewässer)
  const lakeNoise = fractalNoise(worldX, worldY, 3, 0.5, 0.004, 66666);
  
  // ============================================================
  // TERRAIN ENTSCHEIDUNGEN (von unten nach oben)
  // ============================================================
  
  // 1. TIEFES WASSER / OZEAN (~20% der Karte)
  if (height < 0.30) {
    return 'water';
  }
  
  // 2. FLACHES WASSER / KÜSTE (~5% der Karte)
  if (height < 0.38) {
    // Küstenbereich - teilweise Wasser, teilweise Sand
    if (detailNoise > 0.5) {
      return 'water';
    }
    return 'grass'; // Strandbereich
  }
  
  // 3. SEEN UND TEICHE (~5% der Landmasse)
  // Nur auf mittlerer Höhe, nicht zu hoch in den Bergen
  if (height > 0.4 && height < 0.65 && lakeNoise > 0.72) {
    return 'water';
  }
  
  // 4. PFADE (Straßennetz auf Land)
  // Prüfe ob wir auf einem Pfad sind (100 Einheiten Raster)
  if (isOnPath(worldX, worldY) && height > 0.35) {
    return 'path';
  }
  
  // 5. WÄLDER (~25-30% der Landmasse)
  // Wälder wachsen bevorzugt in mittleren Höhenlagen
  if (height > 0.42 && height < 0.75) {
    // Dichte Waldcluster
    if (forestValue > 0.58) {
      return 'forest';
    }
    // Einzelne Baumgruppen (für Variation)
    if (forestValue > 0.54 && detailNoise > 0.6) {
      return 'forest';
    }
  }
  
  // 6. GRASLAND (Standard - ~45% der Karte)
  return 'grass';
}

// Legacy path check for backwards compatibility
function legacyPathCheck(detail, height) {
  if (detail > 0.48 && detail < 0.52 && height > 0.4 && height < 0.6) {
    return 'path';
  }
  
  // Default: Grassland
  return 'grass';
}

function Map() {
  const { user, setUser } = useAuth();
  const { notify } = useNotificationContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [players, setPlayers] = useState([]);
  const [npcs, setNpcs] = useState([]);
  const [homes, setHomes] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedNpc, setSelectedNpc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewCenter, setViewCenter] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [actionMode, setActionMode] = useState(null); // 'move', 'attack', 'trade'
  const [targetCoords, setTargetCoords] = useState(null);
  const [message, setMessage] = useState('');
  const canvasRef = useRef(null);
  const [nearbyPlayers, setNearbyPlayers] = useState([]);
  const [tradeData, setTradeData] = useState(null);
  const [myTradeItems, setMyTradeItems] = useState([]);
  const [targetTradeItems, setTargetTradeItems] = useState([]);
  const [playerImages, setPlayerImages] = useState({});
  const [playerStats, setPlayerStats] = useState(null);
  const [equipmentTotalStats, setEquipmentTotalStats] = useState({ attack: 0, defense: 0, health: 0 });
  const [combatResult, setCombatResult] = useState(null);
  const [travelStatus, setTravelStatus] = useState(null);
  const [animationFrame, setAnimationFrame] = useState(0);
  const [showTravelWarning, setShowTravelWarning] = useState(false);
  const [activeJobs, setActiveJobs] = useState([]);
  const [pendingTravel, setPendingTravel] = useState(null);
  const [currentUserPosition, setCurrentUserPosition] = useState(null);
  const [npcShopData, setNpcShopData] = useState(null);
  const [highlightedPlayer, setHighlightedPlayer] = useState(null);
  // Check if we have URL target params on initial load
  const [hasInitialTarget, setHasInitialTarget] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('x') && params.has('y');
  });
  const [resourceNodes, setResourceNodes] = useState([]);
  const [selectedResource, setSelectedResource] = useState(null);
  const [gatheringJob, setGatheringJob] = useState(null);
  const [userTools, setUserTools] = useState([]);
  const [tilesetImage, setTilesetImage] = useState(null);
  const [tilesetLoaded, setTilesetLoaded] = useState(false);
  const [monsterImages, setMonsterImages] = useState({});
  const [tileMappings, setTileMappings] = useState({});

  // Load monster images when NPCs change
  useEffect(() => {
    if (!npcs || npcs.length === 0) return;
    
    // Find unique image_paths from monsters
    const imagePaths = [...new Set(npcs
      .filter(npc => npc.image_path && npc.entity_type !== 'merchant')
      .map(npc => npc.image_path)
    )];
    
    // Load images that aren't already loaded
    imagePaths.forEach(imagePath => {
      if (monsterImages[imagePath]) return; // Already loaded
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setMonsterImages(prev => ({ ...prev, [imagePath]: img }));
      };
      img.onerror = () => {
        console.error('Failed to load monster image:', imagePath);
      };
      img.src = `/monsters/${imagePath}`;
    });
  }, [npcs]);

  // Load tileset image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setTilesetImage(img);
      setTilesetLoaded(true);
      console.log('Tileset loaded successfully:', img.width, 'x', img.height);
    };
    img.onerror = (e) => {
      console.error('Failed to load tileset, using color fallback:', e);
      setTilesetLoaded(false);
    };
    img.src = TILESET_URL;
  }, []);

  // Load tile mappings (public endpoint)
  useEffect(() => {
    const loadMappings = async () => {
      try {
        const response = await api.get('/map/tileset/mappings');
        setTileMappings(response.data.mappings || {});
        console.log('Tile mappings loaded:', Object.keys(response.data.mappings || {}).length);
      } catch (err) {
        console.error('Fehler beim Laden der Tile-Mappings:', err);
        setTileMappings({});
      }
    };
    loadMappings();
  }, []);

  // Handle URL parameters (e.g., from player profile "Show on map")
  useEffect(() => {
    const targetX = searchParams.get('x');
    const targetY = searchParams.get('y');
    const targetPlayer = searchParams.get('player');
    
    if (targetX && targetY) {
      const x = parseInt(targetX);
      const y = parseInt(targetY);
      
      // Mark that we have a target from URL - prevents auto-centering on user
      setHasInitialTarget(true);
      
      // Center view on target coordinates
      setViewCenter({ x, y });
      
      // Set message to show who we're looking at
      if (targetPlayer) {
        setMessage(`📍 Zeige Position von ${targetPlayer}`);
        setHighlightedPlayer(targetPlayer);
        setTimeout(() => setMessage(''), 5000);
      }
      
      // Clear the URL parameters after processing
      setSearchParams({});
    }
  }, [searchParams]);

  // Initial data load - only once on mount
  useEffect(() => {
    fetchPlayers();
    fetchNpcs();
    fetchHomes();
    fetchPlayerStats();
    fetchTravelStatus();
    fetchResourceNodes();
    fetchGatheringStatus();
    fetchUserTools();
    
    // Periodic refresh every 30 seconds (without clearing selection)
    const refreshInterval = setInterval(() => {
      fetchPlayers();
      fetchNpcs();
      fetchPlayerStats();
      fetchResourceNodes();
      fetchGatheringStatus();
    }, 30000);
    
    return () => clearInterval(refreshInterval);
  }, []);

  // Center view when user coordinates are available (only if no URL target)
  useEffect(() => {
    // Skip if we have a target from URL parameters
    if (hasInitialTarget) return;
    
    if (user?.world_x !== undefined && user?.world_y !== undefined && (user.world_x !== 0 || user.world_y !== 0)) {
      setViewCenter({ x: user.world_x, y: user.world_y });
    } else {
      setViewCenter({ x: 0, y: 0 });
    }
  }, [user?.id, hasInitialTarget]); // Only re-center when user changes, not on every coordinate update

  // Poll travel status every 10 seconds while traveling
  useEffect(() => {
    if (travelStatus?.traveling) {
      const interval = setInterval(() => {
        fetchTravelStatus();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [travelStatus?.traveling]);

  // Animation frame for walking character
  useEffect(() => {
    const animInterval = setInterval(() => {
      setAnimationFrame(prev => (prev + 1) % 4);
    }, 200); // 200ms per frame = 5 fps walking animation
    return () => clearInterval(animInterval);
  }, []);

  // Calculate interpolated position while traveling
  useEffect(() => {
    if (travelStatus?.traveling && travelStatus.from && travelStatus.to && travelStatus.endTime) {
      const updatePosition = () => {
        const now = new Date();
        const startTime = new Date(travelStatus.startTime || now);
        const endTime = new Date(travelStatus.endTime);
        const totalDuration = endTime - startTime;
        const elapsed = now - startTime;
        const progress = Math.min(1, Math.max(0, elapsed / totalDuration));

        const currentX = travelStatus.from.x + (travelStatus.to.x - travelStatus.from.x) * progress;
        const currentY = travelStatus.from.y + (travelStatus.to.y - travelStatus.from.y) * progress;

        setCurrentUserPosition({ x: currentX, y: currentY });
      };

      updatePosition();
      const posInterval = setInterval(updatePosition, 500); // Update position every 500ms
      return () => clearInterval(posInterval);
    } else {
      setCurrentUserPosition(null);
    }
  }, [travelStatus]);

  useEffect(() => {
    if (user?.world_x !== undefined && user?.world_y !== undefined && (user.world_x !== 0 || user.world_y !== 0)) {
      fetchNearbyPlayers();
    }
  }, [user?.world_x, user?.world_y]);

  useEffect(() => {
    // Delay drawing to ensure canvas is mounted
    const timer = setTimeout(() => {
      try {
        if (canvasRef.current) {
          drawMap();
        }
      } catch (error) {
        console.error('Error in drawMap useEffect:', error);
      }
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, npcs, viewCenter, zoom, user, selectedPlayer, selectedNpc, selectedResource, targetCoords, actionMode, playerImages, animationFrame, currentUserPosition, travelStatus, resourceNodes, tilesetLoaded, monsterImages, tileMappings]);

  const fetchPlayers = async () => {
    try {
      const response = await api.get('/map/players');
      const playersData = response.data.players || [];
      setPlayers(playersData);
      
      // Update selectedPlayer with fresh data if still exists
      setSelectedPlayer(prev => {
        if (!prev) return null;
        const updated = playersData.find(p => p.id === prev.id);
        return updated || null; // Keep selection if player still exists
      });
      
      // Load player avatar images
      playersData.forEach(player => {
        if (player.avatar_path && !playerImages[player.id]) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = `/chars/${player.avatar_path}`;
          img.onload = () => {
            setPlayerImages(prev => ({ ...prev, [player.id]: img }));
          };
        }
      });
    } catch (error) {
      console.error('Fehler beim Laden der Spieler:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHomes = async () => {
    try {
      const response = await api.get('/map/homes');
      setHomes(response.data.homes || []);
    } catch (error) {
      console.error('Fehler beim Laden der Grundstücke:', error);
    }
  };

  const fetchNearbyPlayers = async () => {
    try {
      const response = await api.get('/map/players/nearby?distance=1000');
      setNearbyPlayers(response.data.players || []);
    } catch (error) {
      console.error('Fehler beim Laden der nahen Spieler:', error);
    }
  };

  const fetchNpcs = async () => {
    try {
      const response = await api.get('/npcs/world');
      const npcsData = response.data.npcs || [];
      setNpcs(npcsData);
      
      // Update selectedNpc with fresh data if still exists
      setSelectedNpc(prev => {
        if (!prev) return null;
        const updated = npcsData.find(n => n.id === prev.id);
        return updated || null; // Keep selection if NPC still exists
      });
    } catch (error) {
      console.error('Fehler beim Laden der NPCs:', error);
    }
  };

  const fetchPlayerStats = async () => {
    try {
      const [statsRes, equippedRes] = await Promise.all([
        api.get('/npcs/player/stats'),
        api.get('/equipment/equipped').catch(() => ({ data: { totalStats: { attack: 0, defense: 0, health: 0 } } }))
      ]);
      setPlayerStats(statsRes.data.stats);
      setEquipmentTotalStats(equippedRes.data.totalStats || { attack: 0, defense: 0, health: 0 });
    } catch (error) {
      console.error('Fehler beim Laden der Spielerstatistiken:', error);
    }
  };

  const fetchTravelStatus = async () => {
    try {
      const response = await api.get('/map/travel/status');
      setTravelStatus(response.data);
      
      // If arrived, refresh user data
      if (response.data.arrived) {
        setMessage('Du bist angekommen!');
        setTimeout(() => setMessage(''), 3000);
        // Send notification
        notify.travel();
        // Refresh user profile to get updated coordinates
        try {
          const profileResponse = await api.get('/auth/profile');
          if (profileResponse.data.user) {
            setUser(profileResponse.data.user);
          }
        } catch (e) {
          console.error('Error refreshing profile:', e);
        }
        fetchPlayers();
      }
    } catch (error) {
      console.error('Fehler beim Laden des Reisestatus:', error);
    }
  };

  const fetchResourceNodes = async () => {
    try {
      const response = await api.get('/resources/nodes');
      setResourceNodes(response.data.nodes || []);
    } catch (error) {
      console.error('Fehler beim Laden der Ressourcen:', error);
    }
  };

  const fetchGatheringStatus = async () => {
    try {
      const response = await api.get('/resources/gather/status');
      setGatheringJob(response.data.job);
    } catch (error) {
      console.error('Fehler beim Laden des Sammelstatus:', error);
    }
  };

  const fetchUserTools = async () => {
    try {
      const response = await api.get('/resources/tools');
      setUserTools(response.data.tools || []);
    } catch (error) {
      console.error('Fehler beim Laden der Werkzeuge:', error);
    }
  };

  const handleResourceClick = async (node) => {
    try {
      const response = await api.get(`/resources/nodes/${node.id}`);
      setSelectedResource(response.data);
      setSelectedPlayer(null);
      setSelectedNpc(null);
    } catch (error) {
      console.error('Fehler beim Laden der Ressourcendetails:', error);
    }
  };

  const startGathering = async (nodeId, toolId = null) => {
    try {
      const response = await api.post(`/resources/gather/${nodeId}`, { toolId });
      setMessage(response.data.message);
      setGatheringJob({ ...response.data, node_id: nodeId });
      setSelectedResource(null);
      setTimeout(() => setMessage(''), 3000);
      
      // Start polling for gathering completion
      const pollInterval = setInterval(async () => {
        const statusRes = await api.get('/resources/gather/status');
        if (statusRes.data.job?.is_ready) {
          clearInterval(pollInterval);
          setGatheringJob(statusRes.data.job);
          // Send notification when gathering is complete
          notify.gathering(statusRes.data.job.display_name || 'Ressourcen', 1);
        } else if (!statusRes.data.job) {
          clearInterval(pollInterval);
          setGatheringJob(null);
        } else {
          setGatheringJob(statusRes.data.job);
        }
      }, 1000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Sammeln');
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const collectGathering = async () => {
    try {
      const response = await api.post('/resources/gather/collect');
      setMessage(response.data.message);
      setGatheringJob(null);
      fetchResourceNodes();
      setTimeout(() => setMessage(''), 4000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Abholen');
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const cancelGathering = async () => {
    try {
      await api.post('/resources/gather/cancel');
      setGatheringJob(null);
      setMessage('Sammeln abgebrochen');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler');
    }
  };

  const getStarterTool = async (category) => {
    try {
      const response = await api.post('/resources/tools/starter', { category });
      setMessage(response.data.message);
      fetchUserTools();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler');
      setTimeout(() => setMessage(''), 4000);
    }
  };

  // Helper function to get tile ID using mappings or fallback
  const getTileIdWithMappings = (terrain, variation, neighbors) => {
    const category = getTerrainCategory(terrain);
    
    // Try to find a mapped tile for this terrain type
    // First, get all tiles mapped to this terrain
    const mappedTiles = Object.keys(tileMappings)
      .map(id => parseInt(id))
      .filter(id => tileMappings[id]?.terrain === category);
    
    if (mappedTiles.length > 0) {
      // Use mapped tiles with variation
      const index = Math.floor(variation * mappedTiles.length) % mappedTiles.length;
      return mappedTiles[index];
    }
    
    // Fallback to hardcoded logic if no mappings
    return getTileForTerrainWithNeighbors(terrain, variation, neighbors);
  };

  const drawMap = () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width || 1000;
      const height = canvas.height || 700;

      // Calculate scale - each world unit = 1 pixel at zoom 1
      const scale = Math.max(0.1, Math.min(3, zoom));
      const centerX = width / 2;
      const centerY = height / 2;

      // Clear canvas with ocean color
      ctx.fillStyle = '#1a5a8a';
      ctx.fillRect(0, 0, width, height);

      // Tile size in world units (each tile covers 16x16 world units)
      const worldTileSize = TILE_SIZE;
      // Rendered tile size on screen
      const renderTileSize = worldTileSize * scale;
      
      // Calculate visible area in world coordinates
      const startWorldX = viewCenter.x - (centerX / scale);
      const startWorldY = viewCenter.y - (centerY / scale);
      const endWorldX = viewCenter.x + (centerX / scale);
      const endWorldY = viewCenter.y + (centerY / scale);
      
      // Calculate tile range
      const startTileX = Math.floor(startWorldX / worldTileSize) - 1;
      const startTileY = Math.floor(startWorldY / worldTileSize) - 1;
      const endTileX = Math.ceil(endWorldX / worldTileSize) + 1;
      const endTileY = Math.ceil(endWorldY / worldTileSize) + 1;

      // Enable pixelated rendering for crisp tiles
      ctx.imageSmoothingEnabled = false;

      // Draw terrain tiles with autotiling
      for (let tileX = startTileX; tileX <= endTileX; tileX++) {
        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
          const terrain = getTerrainAt(tileX, tileY);
          const variation = seededRandom(tileX * 7919 + tileY * 7927);
          
          // Calculate screen position
          const screenX = centerX + (tileX * worldTileSize - viewCenter.x) * scale;
          const screenY = centerY + (tileY * worldTileSize - viewCenter.y) * scale;
          
          // Skip tiles outside visible area
          if (screenX + renderTileSize < 0 || screenX > width ||
              screenY + renderTileSize < 0 || screenY > height) {
            continue;
          }

          if (tilesetImage && tilesetLoaded) {
            // Get neighbor terrains for autotiling (including diagonals for inner corners)
            const neighbors = {
              north: getTerrainAt(tileX, tileY - 1),
              east: getTerrainAt(tileX + 1, tileY),
              south: getTerrainAt(tileX, tileY + 1),
              west: getTerrainAt(tileX - 1, tileY),
              ne: getTerrainAt(tileX + 1, tileY - 1),
              nw: getTerrainAt(tileX - 1, tileY - 1),
              se: getTerrainAt(tileX + 1, tileY + 1),
              sw: getTerrainAt(tileX - 1, tileY + 1),
            };
            
            // Get tile ID using mappings or fallback
            const tileId = getTileIdWithMappings(terrain, variation, neighbors);
            const srcCol = tileId % TILESET_COLUMNS;
            const srcRow = Math.floor(tileId / TILESET_COLUMNS);
            ctx.drawImage(
              tilesetImage,
              srcCol * TILE_SIZE, srcRow * TILE_SIZE, TILE_SIZE, TILE_SIZE,
              screenX, screenY, renderTileSize + 0.5, renderTileSize + 0.5
            );
          } else {
            // Fallback: colored rectangles
            ctx.fillStyle = getTerrainColor(terrain);
            ctx.fillRect(screenX, screenY, renderTileSize + 1, renderTileSize + 1);
          }
        }
      }

      // Draw coordinate grid for larger areas
      if (zoom < 0.5) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        const majorGridSize = 100 * scale;
        
        const gridStartX = Math.floor(startWorldX / 100) * 100;
        const gridStartY = Math.floor(startWorldY / 100) * 100;
        
        for (let gx = gridStartX; gx <= endWorldX; gx += 100) {
          const sx = centerX + (gx - viewCenter.x) * scale;
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, height);
          ctx.stroke();
        }
        for (let gy = gridStartY; gy <= endWorldY; gy += 100) {
          const sy = centerY + (gy - viewCenter.y) * scale;
          ctx.beginPath();
          ctx.moveTo(0, sy);
          ctx.lineTo(width, sy);
          ctx.stroke();
        }
      }

      // Draw player homes (houses)
      if (homes && Array.isArray(homes) && homes.length > 0) {
        homes.forEach((home) => {
          if (!home || home.home_x === null || home.home_y === null) return;
          
          const homeX = home.home_x;
          const homeY = home.home_y;
          const x = centerX + (homeX - viewCenter.x) * scale;
          const y = centerY + (homeY - viewCenter.y) * scale;

          if (x < -50 || x > width + 50 || y < -50 || y > height + 50) return;

          const isCurrentUserHome = user && home.id === user.id;
          const houseSize = (isCurrentUserHome ? 24 : 18) * Math.min(scale, 1.5);

          // Draw house shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.beginPath();
          ctx.ellipse(x, y + houseSize * 0.4, houseSize * 0.7, houseSize * 0.25, 0, 0, Math.PI * 2);
          ctx.fill();

          // Draw house base
          ctx.fillStyle = isCurrentUserHome ? '#8B4513' : '#A0522D';
          ctx.fillRect(x - houseSize * 0.5, y - houseSize * 0.3, houseSize, houseSize * 0.6);

          // Draw roof
          ctx.fillStyle = isCurrentUserHome ? '#B22222' : '#8B0000';
          ctx.beginPath();
          ctx.moveTo(x - houseSize * 0.65, y - houseSize * 0.3);
          ctx.lineTo(x, y - houseSize * 0.8);
          ctx.lineTo(x + houseSize * 0.65, y - houseSize * 0.3);
          ctx.closePath();
          ctx.fill();

          // Draw door
          ctx.fillStyle = '#4A3728';
          ctx.fillRect(x - houseSize * 0.12, y - houseSize * 0.1, houseSize * 0.24, houseSize * 0.4);

          // Draw window
          ctx.fillStyle = '#87CEEB';
          ctx.fillRect(x + houseSize * 0.15, y - houseSize * 0.2, houseSize * 0.2, houseSize * 0.2);

          // Glow for current user's home
          if (isCurrentUserHome) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#d4af37';
            ctx.strokeStyle = '#d4af37';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - houseSize * 0.55, y - houseSize * 0.35, houseSize * 1.1, houseSize * 0.7);
            ctx.shadowBlur = 0;
          }

          // Draw owner name
          ctx.font = `${Math.max(10, 11 * Math.min(scale, 1.2))}px Arial`;
          ctx.textAlign = 'center';
          ctx.fillStyle = isCurrentUserHome ? '#d4af37' : '#a89070';
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.lineWidth = 3;
          ctx.strokeText(home.username, x, y + houseSize * 0.7);
          ctx.fillText(home.username, x, y + houseSize * 0.7);
        });
      }

      // Draw players
      if (players && Array.isArray(players) && players.length > 0) {
        players.forEach((player) => {
          if (!player || (player.world_x === undefined && player.world_y === undefined)) return;
          if (player.world_x === 0 && player.world_y === 0) return;
          
          const isCurrentUser = user && player.id === user.id;
          
          // Use interpolated position for current user if traveling
          let playerX, playerY;
          let isWalking = false;
          let walkDirection = 0; // 0=down, 1=left, 2=right, 3=up (sprite row)
          
          if (isCurrentUser && currentUserPosition && travelStatus?.traveling) {
            playerX = currentUserPosition.x;
            playerY = currentUserPosition.y;
            isWalking = true;
            
            // Determine direction based on travel destination
            const dx = travelStatus.to.x - travelStatus.from.x;
            const dy = travelStatus.to.y - travelStatus.from.y;
            
            // Determine primary direction
            if (Math.abs(dx) > Math.abs(dy)) {
              walkDirection = dx > 0 ? 2 : 1; // right : left
            } else {
              walkDirection = dy > 0 ? 0 : 3; // down : up
            }
          } else {
            playerX = player.world_x || 0;
            playerY = player.world_y || 0;
          }
          
          const x = centerX + (playerX - viewCenter.x) * scale;
          const y = centerY + (playerY - viewCenter.y) * scale;

          if (x < -30 || x > width + 30 || y < -30 || y > height + 30) return;

          const isSelected = selectedPlayer && selectedPlayer.id === player.id;
          const markerSize = (isCurrentUser ? 20 : 16) * Math.min(scale, 1.5);

          // Draw player avatar or marker
          const playerImg = playerImages[player.id];
          
          if (playerImg && playerImg.complete) {
            // Draw avatar from sprite sheet
            // Sprite sheet layout: 3 columns (left, center, right poses), 4 rows (down, left, right, up)
            ctx.save();
            
            // Draw circular clip
            ctx.beginPath();
            ctx.arc(x, y, markerSize, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            
            // Calculate sprite position
            // Walking animation: cycle through columns 0, 1, 2, 1 (left, center, right, center)
            const walkCycle = [0, 1, 2, 1];
            const spriteCol = isWalking ? walkCycle[animationFrame] : 1; // Use center if not walking
            const spriteRow = walkDirection;
            
            const spriteX = spriteCol * 32;
            const spriteY = spriteRow * 32;
            
            ctx.drawImage(
              playerImg,
              spriteX, spriteY, 32, 32,  // Source
              x - markerSize, y - markerSize, markerSize * 2, markerSize * 2  // Destination
            );
            
            ctx.restore();
            
            // Draw border
            ctx.beginPath();
            ctx.arc(x, y, markerSize, 0, Math.PI * 2);
            ctx.strokeStyle = isCurrentUser ? '#d4af37' : isSelected ? '#f4d03f' : '#2c3e50';
            ctx.lineWidth = isCurrentUser ? 3 : 2;
            ctx.stroke();
            
            // Glow effect for current user
            if (isCurrentUser) {
              ctx.shadowBlur = 15;
              ctx.shadowColor = '#d4af37';
              ctx.strokeStyle = '#d4af37';
              ctx.stroke();
              ctx.shadowBlur = 0;
            }
            
            // Walking indicator
            if (isWalking && isCurrentUser) {
              ctx.font = '12px Arial';
              ctx.textAlign = 'center';
              ctx.fillStyle = '#2ecc71';
              ctx.fillText('🚶', x, y - markerSize - 5);
            }
          } else {
            // Fallback: colored circle
            ctx.beginPath();
            ctx.arc(x, y, markerSize * 0.6, 0, Math.PI * 2);
            
            if (isCurrentUser) {
              ctx.fillStyle = '#d4af37';
              ctx.shadowBlur = 10;
              ctx.shadowColor = '#d4af37';
            } else if (isSelected) {
              ctx.fillStyle = '#f4d03f';
              ctx.shadowBlur = 8;
              ctx.shadowColor = '#f4d03f';
            } else {
              ctx.fillStyle = '#4a90e2';
              ctx.shadowBlur = 5;
              ctx.shadowColor = '#4a90e2';
            }
            
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = isCurrentUser ? '#f4d03f' : '#2c3e50';
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Draw username
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 3;
          ctx.font = `bold ${Math.max(10, 12 * Math.min(scale, 1.2))}px Arial`;
          ctx.textAlign = 'center';
          if (player.username) {
            ctx.strokeText(player.username, x, y - markerSize - 5);
            ctx.fillText(player.username, x, y - markerSize - 5);
          }
        });
      }

      // Draw NPCs (monsters, merchants, bosses)
      if (npcs && Array.isArray(npcs) && npcs.length > 0) {
        npcs.forEach((npc) => {
          if (!npc || npc.world_x === undefined || npc.world_y === undefined) return;
          
          const npcX = npc.world_x || 0;
          const npcY = npc.world_y || 0;
          const x = centerX + (npcX - viewCenter.x) * scale;
          const y = centerY + (npcY - viewCenter.y) * scale;

          if (x < -30 || x > width + 30 || y < -30 || y > height + 30) return;

          const isSelected = selectedNpc && selectedNpc.id === npc.id;
          const markerSize = (npc.entity_type === 'boss' ? 22 : npc.entity_type === 'merchant' ? 18 : 16) * Math.min(scale, 1.5);

          // Different colors/shapes for different NPC types
          ctx.save();
          
          if (npc.entity_type === 'merchant') {
            // Merchant - golden square
            ctx.fillStyle = isSelected ? '#f4d03f' : '#d4af37';
            ctx.shadowBlur = isSelected ? 15 : 8;
            ctx.shadowColor = '#d4af37';
            ctx.fillRect(x - markerSize * 0.7, y - markerSize * 0.7, markerSize * 1.4, markerSize * 1.4);
            ctx.strokeStyle = '#8b6914';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - markerSize * 0.7, y - markerSize * 0.7, markerSize * 1.4, markerSize * 1.4);
            
            // Shop icon
            ctx.fillStyle = '#4a2c1a';
            ctx.font = `bold ${Math.max(12, markerSize * 0.8)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🏪', x, y);
          } else if (npc.entity_type === 'boss') {
            // Boss monster
            const bossImg = npc.image_path ? monsterImages[npc.image_path] : null;
            
            if (bossImg) {
              // Draw boss with image
              const imgSize = markerSize * 2.5; // Bigger for boss
              
              // Boss glow
              ctx.shadowBlur = isSelected ? 25 : 15;
              ctx.shadowColor = '#ff0000';
              
              // Diamond background
              ctx.beginPath();
              ctx.moveTo(x, y - markerSize * 1.2);
              ctx.lineTo(x + markerSize * 1.2, y);
              ctx.lineTo(x, y + markerSize * 1.2);
              ctx.lineTo(x - markerSize * 1.2, y);
              ctx.closePath();
              ctx.fillStyle = isSelected ? 'rgba(255, 0, 0, 0.5)' : 'rgba(150, 0, 0, 0.4)';
              ctx.fill();
              ctx.strokeStyle = '#ff0000';
              ctx.lineWidth = 2;
              ctx.stroke();
              ctx.shadowBlur = 0;
              
              // Draw boss sprite
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(bossImg, x - imgSize / 2, y - imgSize / 2, imgSize, imgSize);
              ctx.imageSmoothingEnabled = true;
              
              // Crown above boss
              ctx.fillStyle = '#d4af37';
              ctx.font = `bold ${Math.max(12, markerSize * 0.5)}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('👑', x, y - markerSize * 1.3);
            } else {
              // Fallback - red diamond with crown
              ctx.fillStyle = isSelected ? '#ff4444' : '#cc0000';
              ctx.shadowBlur = isSelected ? 20 : 12;
              ctx.shadowColor = '#ff0000';
              ctx.beginPath();
              ctx.moveTo(x, y - markerSize);
              ctx.lineTo(x + markerSize, y);
              ctx.lineTo(x, y + markerSize);
              ctx.lineTo(x - markerSize, y);
              ctx.closePath();
              ctx.fill();
              ctx.strokeStyle = '#800000';
              ctx.lineWidth = 3;
              ctx.stroke();
              
              // Crown icon for boss
              ctx.fillStyle = '#d4af37';
              ctx.font = `bold ${Math.max(14, markerSize * 0.7)}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.shadowBlur = 0;
              ctx.fillText('👑', x, y - 2);
            }
          } else {
            // Regular monster
            const monsterImg = npc.image_path ? monsterImages[npc.image_path] : null;
            
            if (monsterImg) {
              // Draw monster image
              const imgSize = markerSize * 2;
              
              // Selection glow
              if (isSelected) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#e74c3c';
              }
              
              // Background circle for visibility
              ctx.beginPath();
              ctx.arc(x, y, markerSize * 0.8, 0, Math.PI * 2);
              ctx.fillStyle = isSelected ? 'rgba(231, 76, 60, 0.4)' : 'rgba(0, 0, 0, 0.3)';
              ctx.fill();
              ctx.shadowBlur = 0;
              
              // Draw monster sprite
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(monsterImg, x - imgSize / 2, y - imgSize / 2, imgSize, imgSize);
              ctx.imageSmoothingEnabled = true;
              
              // Selection border
              if (isSelected) {
                ctx.strokeStyle = '#ff4444';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, markerSize * 0.9, 0, Math.PI * 2);
                ctx.stroke();
              }
            } else {
              // Fallback - red circle with emoji
              ctx.beginPath();
              ctx.arc(x, y, markerSize * 0.7, 0, Math.PI * 2);
              ctx.fillStyle = isSelected ? '#ff6666' : '#e74c3c';
              ctx.shadowBlur = isSelected ? 12 : 6;
              ctx.shadowColor = '#e74c3c';
              ctx.fill();
              ctx.strokeStyle = '#c0392b';
              ctx.lineWidth = 2;
              ctx.stroke();
              
              // Monster emoji fallback
              ctx.fillStyle = '#fff';
              ctx.font = `bold ${Math.max(10, markerSize * 0.6)}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.shadowBlur = 0;
              ctx.fillText('👹', x, y);
            }
          }
          
          ctx.restore();

          // Draw NPC name and level
          ctx.fillStyle = npc.entity_type === 'boss' ? '#ff4444' : npc.entity_type === 'merchant' ? '#d4af37' : '#ff9999';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 3;
          ctx.font = `bold ${Math.max(9, 11 * Math.min(scale, 1.2))}px Arial`;
          ctx.textAlign = 'center';
          
          const label = npc.entity_type === 'merchant' 
            ? npc.display_name 
            : `${npc.display_name} (Lv.${npc.level || 1})`;
          ctx.strokeText(label, x, y - markerSize - 5);
          ctx.fillText(label, x, y - markerSize - 5);

          // Health bar for monsters (if damaged)
          if (npc.entity_type !== 'merchant' && npc.current_health !== undefined && npc.max_health) {
            const healthPercent = npc.current_health / npc.max_health;
            if (healthPercent < 1) {
              const barWidth = markerSize * 2;
              const barHeight = 4;
              const barY = y + markerSize + 3;
              
              ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
              ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);
              
              ctx.fillStyle = healthPercent > 0.5 ? '#27ae60' : healthPercent > 0.25 ? '#f39c12' : '#e74c3c';
              ctx.fillRect(x - barWidth / 2, barY, barWidth * healthPercent, barHeight);
            }
          }
        });
      }

      // Draw Resource Nodes (trees, rocks, herbs)
      if (resourceNodes && Array.isArray(resourceNodes) && resourceNodes.length > 0) {
        resourceNodes.forEach((node) => {
          if (!node || node.world_x === undefined || node.world_y === undefined) return;
          if (node.is_depleted) return; // Don't draw depleted nodes
          
          const nodeX = node.world_x || 0;
          const nodeY = node.world_y || 0;
          const x = centerX + (nodeX - viewCenter.x) * scale;
          const y = centerY + (nodeY - viewCenter.y) * scale;

          if (x < -30 || x > width + 30 || y < -30 || y > height + 30) return;

          const isSelected = selectedResource?.node?.id === node.id;
          const markerSize = 14 * Math.min(scale, 1.5);

          ctx.save();
          
          // Background based on category
          let bgColor, borderColor;
          if (node.category === 'mining') {
            bgColor = isSelected ? '#95a5a6' : '#7f8c8d';
            borderColor = '#5d6d7e';
          } else if (node.category === 'woodcutting') {
            bgColor = isSelected ? '#27ae60' : '#1e8449';
            borderColor = '#145a32';
          } else if (node.category === 'herbalism') {
            bgColor = isSelected ? '#9b59b6' : '#8e44ad';
            borderColor = '#6c3483';
          } else {
            bgColor = '#95a5a6';
            borderColor = '#5d6d7e';
          }

          // Draw circle marker
          ctx.beginPath();
          ctx.arc(x, y, markerSize * 0.8, 0, Math.PI * 2);
          ctx.fillStyle = bgColor;
          ctx.shadowBlur = isSelected ? 12 : 5;
          ctx.shadowColor = bgColor;
          ctx.fill();
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // Draw icon
          ctx.shadowBlur = 0;
          ctx.font = `${Math.max(10, markerSize * 0.9)}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(node.icon || '❓', x, y);
          
          ctx.restore();

          // Draw remaining amount indicator
          if (node.current_amount < node.max_amount) {
            const dots = node.current_amount;
            const dotSize = 3;
            const startX = x - (dots - 1) * dotSize;
            ctx.fillStyle = '#2ecc71';
            for (let i = 0; i < dots; i++) {
              ctx.beginPath();
              ctx.arc(startX + i * dotSize * 2, y + markerSize + 5, dotSize, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        });
      }

      // Draw travel route if traveling
      if (travelStatus?.traveling && travelStatus.from && travelStatus.to && currentUserPosition) {
        const fromX = centerX + (travelStatus.from.x - viewCenter.x) * scale;
        const fromY = centerY + (travelStatus.from.y - viewCenter.y) * scale;
        const toX = centerX + (travelStatus.to.x - viewCenter.x) * scale;
        const toY = centerY + (travelStatus.to.y - viewCenter.y) * scale;
        const currentX = centerX + (currentUserPosition.x - viewCenter.x) * scale;
        const currentY = centerY + (currentUserPosition.y - viewCenter.y) * scale;

        // Draw route line (traveled portion)
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(currentX, currentY);
        ctx.strokeStyle = 'rgba(46, 204, 113, 0.6)';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.stroke();

        // Draw route line (remaining portion)
        ctx.beginPath();
        ctx.moveTo(currentX, currentY);
        ctx.lineTo(toX, toY);
        ctx.strokeStyle = 'rgba(46, 204, 113, 0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw destination marker
        ctx.beginPath();
        ctx.arc(toX, toY, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(46, 204, 113, 0.3)';
        ctx.fill();
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Flag at destination
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#2ecc71';
        ctx.fillText('🏁', toX, toY - 15);
      }

      // Draw target marker if in move mode
      if (actionMode === 'move' && targetCoords) {
        const x = centerX + (targetCoords.x - viewCenter.x) * scale;
        const y = centerY + (targetCoords.y - viewCenter.y) * scale;

        if (x >= -50 && x <= width + 50 && y >= -50 && y <= height + 50) {
          // Check if target is water
          const targetTerrain = getTerrainAt(Math.floor(targetCoords.x / 16), Math.floor(targetCoords.y / 16));
          const onWater = isWaterTerrain(targetTerrain);
          
          // Target marker - blue for water, green for land
          ctx.strokeStyle = onWater ? '#3498db' : '#27ae60';
          ctx.fillStyle = onWater ? 'rgba(52, 152, 219, 0.3)' : 'rgba(39, 174, 96, 0.3)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          // Boat icon for water targets
          if (onWater) {
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText('🚣', x, y);
          }
          
          // Crosshair
          ctx.beginPath();
          ctx.moveTo(x - 20, y);
          ctx.lineTo(x + 20, y);
          ctx.moveTo(x, y - 20);
          ctx.lineTo(x, y + 20);
          ctx.stroke();

          // Draw line from user to target
          if (user?.world_x !== undefined && user?.world_y !== undefined && (user.world_x !== 0 || user.world_y !== 0)) {
            const userX = centerX + ((user.world_x || 0) - viewCenter.x) * scale;
            const userY = centerY + ((user.world_y || 0) - viewCenter.y) * scale;
            ctx.strokeStyle = '#27ae60';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.beginPath();
            ctx.moveTo(userX, userY);
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
    } catch (error) {
      console.error('Error drawing map:', error);
    }
  };

  const handleCanvasClick = (e) => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      
      // Scale click coordinates to canvas size (CSS may scale the canvas)
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const scale = Math.max(0.1, Math.min(3, zoom));

      const worldX = viewCenter.x + (x - centerX) / scale;
      const worldY = viewCenter.y + (y - centerY) / scale;

      // Check if clicked on a player (larger click area)
      let clickedPlayer = null;
      const clickRadius = 30; // Fixed pixel radius for click detection
      if (players && Array.isArray(players)) {
        for (const player of players) {
          if (!player || player.world_x === undefined || player.world_y === undefined) continue;
          if (player.world_x === 0 && player.world_y === 0) continue;
          
          const px = centerX + (player.world_x - viewCenter.x) * scale;
          const py = centerY + (player.world_y - viewCenter.y) * scale;
          const distance = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));
        
          if (distance < clickRadius) {
            clickedPlayer = player;
            break;
          }
        }
      }

      // Check if clicked on an NPC
      let clickedNpc = null;
      if (npcs && Array.isArray(npcs)) {
        for (const npc of npcs) {
          if (!npc || npc.world_x === undefined || npc.world_y === undefined) continue;
          
          const nx = centerX + (npc.world_x - viewCenter.x) * scale;
          const ny = centerY + (npc.world_y - viewCenter.y) * scale;
          const distance = Math.sqrt(Math.pow(x - nx, 2) + Math.pow(y - ny, 2));
        
          if (distance < clickRadius) {
            clickedNpc = npc;
            break;
          }
        }
      }

      // Check if clicked on a resource node
      let clickedResource = null;
      if (resourceNodes && Array.isArray(resourceNodes)) {
        for (const node of resourceNodes) {
          if (!node || node.world_x === undefined || node.world_y === undefined) continue;
          if (node.is_depleted) continue;
          
          const rx = centerX + (node.world_x - viewCenter.x) * scale;
          const ry = centerY + (node.world_y - viewCenter.y) * scale;
          const distance = Math.sqrt(Math.pow(x - rx, 2) + Math.pow(y - ry, 2));
        
          if (distance < clickRadius) {
            clickedResource = node;
            break;
          }
        }
      }

      if (clickedResource) {
        // Clicked on resource node
        handleResourceClick(clickedResource);
        setSelectedPlayer(null);
        setSelectedNpc(null);
        setActionMode(null);
        setTargetCoords(null);
      } else if (clickedNpc) {
        // Clicked on NPC
        setSelectedNpc(clickedNpc);
        setSelectedPlayer(null);
        setActionMode(null);
        setTargetCoords(null);
        
        // Fetch NPC details
        fetchNpcDetails(clickedNpc.id);
      } else if (clickedPlayer) {
        if (clickedPlayer.id === user?.id) {
          // Clicked on yourself - deselect
          setSelectedPlayer(null);
          setSelectedNpc(null);
          setActionMode(null);
        } else {
          // Clicked on another player - select them
          setSelectedPlayer(clickedPlayer);
          setSelectedNpc(null);
          setActionMode(null);
          setTargetCoords(null);
        }
      } else if (actionMode === 'move') {
        // In move mode - set target
        setTargetCoords({ x: Math.round(worldX), y: Math.round(worldY) });
      } else {
        // Clicked on empty space - deselect
        setSelectedPlayer(null);
        setSelectedNpc(null);
      }
    } catch (error) {
      console.error('Error in handleCanvasClick:', error);
    }
  };

  // Check if target coordinates are on water
  const isTargetOnWater = (x, y) => {
    const terrain = getTerrainAt(Math.floor(x / 16), Math.floor(y / 16));
    return isWaterTerrain(terrain);
  };

  // Check for active jobs before traveling
  const checkActiveJobsAndTravel = async (travelFn, travelData = null) => {
    try {
      const response = await api.get('/map/active-jobs');
      if (response.data.hasActiveJobs) {
        setActiveJobs(response.data.activeJobs);
        setPendingTravel({ fn: travelFn, data: travelData });
        setShowTravelWarning(true);
      } else {
        // No active jobs, proceed with travel
        travelFn(travelData);
      }
    } catch (error) {
      console.error('Error checking active jobs:', error);
      // On error, proceed anyway
      travelFn(travelData);
    }
  };

  // Confirm travel and cancel active jobs
  const confirmTravel = async () => {
    setShowTravelWarning(false);
    
    // Cancel gathering job if active
    const hasGathering = activeJobs.some(j => j.type === 'gathering');
    if (hasGathering) {
      try {
        await api.post('/resources/gather/cancel');
        setGatheringJob(null);
      } catch (err) {
        console.error('Error canceling gathering:', err);
      }
    }
    
    setActiveJobs([]);
    
    if (pendingTravel) {
      pendingTravel.fn(pendingTravel.data);
      setPendingTravel(null);
    }
  };

  // Cancel travel warning
  const cancelTravelWarning = () => {
    setShowTravelWarning(false);
    setPendingTravel(null);
    setActiveJobs([]);
  };

  // Actual move function
  const executeMove = async () => {
    try {
      const response = await api.put('/map/coordinates', {
        world_x: targetCoords.x,
        world_y: targetCoords.y
      });
      
      setMessage(response.data.message);
      setTimeout(() => setMessage(''), 5000);
      
      // Update travel status
      setTravelStatus({
        traveling: true,
        from: response.data.from,
        to: response.data.to,
        endTime: response.data.endTime,
        travelTime: response.data.travelTime
      });
      
      setActionMode(null);
      setTargetCoords(null);
    } catch (error) {
      if (error.response?.data?.needsBoat) {
        setMessage('🚣 Du brauchst ein Boot um aufs Wasser zu gehen!');
      } else if (error.response?.data?.alreadyTraveling) {
        setMessage('Du bist bereits unterwegs!');
        fetchTravelStatus();
      } else {
        setMessage(error.response?.data?.error || 'Fehler beim Starten der Reise');
      }
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleMove = async () => {
    if (!targetCoords) {
      setMessage('Bitte wähle ein Ziel auf der Karte');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // Check if already traveling
    if (travelStatus?.traveling) {
      setMessage('Du bist bereits unterwegs! Warte oder brich die Reise ab.');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // Check for active jobs first
    await checkActiveJobsAndTravel(executeMove);
  };

  // Actual travel home function
  const executeTravelHome = async () => {
    try {
      const response = await api.post('/map/travel/home');
      setMessage(response.data.message);
      setTimeout(() => setMessage(''), 5000);
      
      setTravelStatus({
        traveling: true,
        from: response.data.from,
        to: response.data.to,
        endTime: response.data.endTime,
        travelTime: response.data.travelTime
      });
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Starten der Heimreise');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleTravelHome = async () => {
    if (travelStatus?.traveling) {
      setMessage('Du bist bereits unterwegs! Warte oder brich die Reise ab.');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // Check for active jobs first
    await checkActiveJobsAndTravel(executeTravelHome);
  };

  const handleCancelTravel = async () => {
    try {
      const response = await api.post('/map/travel/cancel');
      setMessage(response.data.message);
      setTimeout(() => setMessage(''), 3000);
      setTravelStatus({ traveling: false });
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Abbrechen der Reise');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // Actual travel to target function
  const executeTravelTo = async (data) => {
    const { targetX, targetY, targetName } = data;
    try {
      const response = await api.put('/map/coordinates', {
        world_x: targetX,
        world_y: targetY
      });
      
      setMessage(`Du machst dich auf den Weg zu ${targetName}! ${response.data.travelTime}`);
      setTimeout(() => setMessage(''), 5000);
      
      setTravelStatus({
        traveling: true,
        from: response.data.from,
        to: response.data.to,
        startTime: new Date().toISOString(),
        endTime: response.data.endTime,
        travelTime: response.data.travelTime
      });
      
      // Close panels
      setSelectedNpc(null);
      setSelectedPlayer(null);
      setNpcShopData(null);
    } catch (error) {
      if (error.response?.data?.needsBoat) {
        setMessage('🚣 Du brauchst ein Boot um aufs Wasser zu gehen!');
      } else if (error.response?.data?.alreadyTraveling) {
        setMessage('Du bist bereits unterwegs!');
        fetchTravelStatus();
      } else {
        setMessage(error.response?.data?.error || 'Fehler beim Starten der Reise');
      }
      setTimeout(() => setMessage(''), 5000);
    }
  };

  // Travel to a specific target (NPC, player, or coordinates)
  const handleTravelTo = async (targetX, targetY, targetName) => {
    if (travelStatus?.traveling) {
      setMessage('Du bist bereits unterwegs! Warte oder brich die Reise ab.');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // Check for active jobs first
    await checkActiveJobsAndTravel(executeTravelTo, { targetX, targetY, targetName });
  };

  // Calculate distance to a target
  const getDistanceTo = (targetX, targetY) => {
    if (user?.world_x === undefined || user?.world_y === undefined) return null;
    return Math.round(Math.sqrt(
      Math.pow((user.world_x || 0) - targetX, 2) +
      Math.pow((user.world_y || 0) - targetY, 2)
    ));
  };

  const fetchNpcDetails = async (npcId) => {
    try {
      const response = await api.get(`/npcs/${npcId}`);
      if (response.data.npc?.npc_type_id) {
        // It's a merchant - store shop data
        setNpcShopData(response.data);
      } else {
        setNpcShopData(null);
      }
    } catch (error) {
      console.error('Fehler beim Laden der NPC-Details:', error);
      setNpcShopData(null);
    }
  };

  const handleAttackMonster = async () => {
    if (!selectedNpc || selectedNpc.entity_type === 'merchant') {
      setMessage('Wähle ein Monster zum Angreifen');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    try {
      const response = await api.post(`/combat/monster/${selectedNpc.id}`);
      setCombatResult(response.data);
      fetchPlayerStats();
      fetchNpcs();
      
      if (response.data.result === 'attacker') {
        setMessage(`Sieg! +${response.data.goldGained} Gold, +${response.data.expGained} EP`);
      } else {
        setMessage(`Niederlage! Du wurdest besiegt.`);
      }
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Kampffehler');
      if (error.response?.data?.tooFar) {
        setSelectedNpc(null);
      }
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleBuyItem = async (itemId, quantity = 1) => {
    if (!selectedNpc) return;

    try {
      const response = await api.post(`/npcs/${selectedNpc.id}/buy`, { itemId, quantity });
      setMessage(response.data.message);
      fetchPlayerStats();
      fetchNpcDetails(selectedNpc.id);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Kauffehler');
      if (error.response?.data?.tooFar) {
        setSelectedNpc(null);
        setNpcShopData(null);
      }
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleSellItem = async (itemId, quantity = 1) => {
    if (!selectedNpc) return;

    try {
      const response = await api.post(`/npcs/${selectedNpc.id}/sell`, { itemId, quantity });
      setMessage(response.data.message);
      fetchPlayerStats();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Verkaufsfehler');
      if (error.response?.data?.tooFar) {
        setSelectedNpc(null);
        setNpcShopData(null);
      }
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // Healing is now automatic when at home (checked server-side)

  const handleAttack = async () => {
    if (!selectedPlayer) {
      setMessage('Bitte wähle einen Spieler zum Angreifen');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    if (selectedPlayer.id === user?.id) {
      setMessage('Du kannst dich nicht selbst angreifen!');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // Check distance
    if (user?.world_x !== undefined && user?.world_y !== undefined && 
        selectedPlayer.world_x !== undefined && selectedPlayer.world_y !== undefined) {
      const distance = Math.sqrt(
        Math.pow((user.world_x || 0) - (selectedPlayer.world_x || 0), 2) +
        Math.pow((user.world_y || 0) - (selectedPlayer.world_y || 0), 2)
      );

      if (distance > 100) {
        setMessage('Spieler ist zu weit entfernt! (Max: 100 Einheiten)');
        setTimeout(() => setMessage(''), 3000);
        return;
      }
    }

    try {
      const response = await api.post('/map/attack', {
        target_user_id: selectedPlayer.id
      });
      
      setMessage(response.data.message);
      setTimeout(() => setMessage(''), 5000);
      setSelectedPlayer(null);
      fetchPlayers();
      fetchNearbyPlayers();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Angriff');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleTrade = async () => {
    if (!selectedPlayer) {
      setMessage('Bitte wähle einen Spieler zum Handeln');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    if (selectedPlayer.id === user?.id) {
      setMessage('Du kannst nicht mit dir selbst handeln!');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // Check distance
    if (user?.world_x !== undefined && user?.world_y !== undefined && 
        selectedPlayer.world_x !== undefined && selectedPlayer.world_y !== undefined) {
      const distance = Math.sqrt(
        Math.pow((user.world_x || 0) - (selectedPlayer.world_x || 0), 2) +
        Math.pow((user.world_y || 0) - (selectedPlayer.world_y || 0), 2)
      );

      if (distance > 50) {
        setMessage('Spieler ist zu weit entfernt! (Max: 50 Einheiten)');
        setTimeout(() => setMessage(''), 3000);
        return;
      }
    }

    try {
      const response = await api.post('/map/trade/initiate', {
        target_user_id: selectedPlayer.id
      });
      
      setTradeData(response.data);
      setMyTradeItems([]);
      setTargetTradeItems([]);
      setActionMode('trade');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Initiieren des Handels');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleExecuteTrade = async () => {
    if (!selectedPlayer || !tradeData) return;

    if (myTradeItems.length === 0 && targetTradeItems.length === 0) {
      setMessage('Bitte wähle Items zum Tauschen');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    try {
      const response = await api.post('/map/trade/execute', {
        target_user_id: selectedPlayer.id,
        my_items: myTradeItems,
        target_items: targetTradeItems
      });
      
      setMessage(response.data.message);
      setTimeout(() => setMessage(''), 5000);
      setTradeData(null);
      setMyTradeItems([]);
      setTargetTradeItems([]);
      setActionMode(null);
      setSelectedPlayer(null);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Handeln');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const toggleTradeItem = (item, isMyItem) => {
    if (isMyItem) {
      const existing = myTradeItems.find(i => i.item_id === item.item_id);
      if (existing) {
        setMyTradeItems(myTradeItems.filter(i => i.item_id !== item.item_id));
      } else {
        setMyTradeItems([...myTradeItems, { item_id: item.item_id, quantity: 1, ...item }]);
      }
    } else {
      const existing = targetTradeItems.find(i => i.item_id === item.item_id);
      if (existing) {
        setTargetTradeItems(targetTradeItems.filter(i => i.item_id !== item.item_id));
      } else {
        setTargetTradeItems([...targetTradeItems, { item_id: item.item_id, quantity: 1, ...item }]);
      }
    }
  };

  const updateTradeQuantity = (itemId, quantity, isMyItem) => {
    if (isMyItem) {
      setMyTradeItems(myTradeItems.map(item => 
        item.item_id === itemId ? { ...item, quantity: Math.max(1, quantity) } : item
      ));
    } else {
      setTargetTradeItems(targetTradeItems.map(item => 
        item.item_id === itemId ? { ...item, quantity: Math.max(1, quantity) } : item
      ));
    }
  };

  const centerOnUser = () => {
    try {
      // Use currentUserPosition during travel, otherwise use user's stored position
      if (travelStatus?.traveling && currentUserPosition) {
        setViewCenter({ x: currentUserPosition.x, y: currentUserPosition.y });
      } else if (user?.world_x !== undefined && user?.world_y !== undefined && (user.world_x !== 0 || user.world_y !== 0)) {
        setViewCenter({ x: user.world_x, y: user.world_y });
      } else {
        setViewCenter({ x: 0, y: 0 });
      }
    } catch (error) {
      console.error('Error centering on user:', error);
    }
  };

  // Pan the map in a direction
  const panMap = (direction) => {
    const panAmount = 100 / zoom; // Adjust pan amount based on zoom level
    setViewCenter(prev => {
      switch (direction) {
        case 'up': return { ...prev, y: prev.y - panAmount };
        case 'down': return { ...prev, y: prev.y + panAmount };
        case 'left': return { ...prev, x: prev.x - panAmount };
        case 'right': return { ...prev, x: prev.x + panAmount };
        default: return prev;
      }
    });
  };

  if (loading) {
    return <div className="container"><div className="loading">Lädt Karte...</div></div>;
  }

  // Fallback if user has no coordinates - but still show map
  // if (!user?.world_x && !user?.world_y) {
  //   return (
  //     <div className="container">
  //       <div className="card">
  //         <h1>🗺️ Weltkarte</h1>
  //         <div className="error">
  //           Du hast noch keine Koordinaten. Bitte melde dich ab und erneut an, um Koordinaten zu erhalten.
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="container">
      <div className="card">
        <h1>🗺️ Weltkarte</h1>
        
        {message && (
          <div className={message.includes('Fehler') ? 'error' : 'success'}>
            {message}
          </div>
        )}

        {/* Travel Warning Dialog */}
        {showTravelWarning && (
          <div className="travel-warning-overlay">
            <div className="travel-warning-dialog">
              <h3>⚠️ Achtung!</h3>
              <p>Du hast noch laufende Aktivitäten:</p>
              <ul className="active-jobs-list">
                {activeJobs.map((job, idx) => (
                  <li key={idx}>
                    {job.type === 'collection' && '🪓'}
                    {job.type === 'building' && '🏗️'}
                    {job.type === 'crafting' && '⚒️'}
                    {' '}{job.name}
                  </li>
                ))}
              </ul>
              <p className="warning-text">
                Diese werden <strong>pausiert</strong> wenn du losläufst und erst fortgesetzt wenn du zurück nach Hause kommst!
              </p>
              <div className="warning-buttons">
                <button className="btn btn-secondary" onClick={cancelTravelWarning}>
                  Abbrechen
                </button>
                <button className="btn btn-primary" onClick={confirmTravel}>
                  Trotzdem loslaufen
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="map-wrapper">
          <div className="map-container">
          <canvas
            ref={canvasRef}
            width={1000}
            height={700}
            onClick={handleCanvasClick}
            className="map-canvas"
            style={{ display: 'block' }}
          />
          {players.length === 0 && !loading && (
            <div className="map-empty">
              <p>Keine Spieler gefunden</p>
            </div>
          )}
          </div>

          {/* Map Overlay Controls */}
          {/* Top Left: Position Info */}
          <div className="map-overlay top-left">
            <div className="overlay-panel position-info">
              <span className="coord-label">📍</span>
              <span className="coord-value">{user?.world_x ?? 0}, {user?.world_y ?? 0}</span>
            </div>
          </div>

          {/* Top Right: Action Buttons */}
          <div className="map-overlay top-right">
            <div className="overlay-panel action-buttons">
              <button 
                className="overlay-btn" 
                onClick={centerOnUser} 
                title="Zu meiner Position"
              >
                🎯
              </button>
              <button 
                className={`overlay-btn ${actionMode === 'move' ? 'active' : ''}`}
                onClick={() => {
                  setActionMode(actionMode === 'move' ? null : 'move');
                  setSelectedPlayer(null);
                }}
                disabled={travelStatus?.traveling}
                title="Bewegungsmodus"
              >
                🚶
              </button>
              <button 
                className="overlay-btn"
                onClick={handleTravelHome}
                disabled={travelStatus?.traveling}
                title="Nach Hause"
              >
                🏠
              </button>
            </div>
          </div>

          {/* Bottom Left: Zoom Controls */}
          <div className="map-overlay bottom-left">
            <div className="overlay-panel zoom-controls">
              <button className="overlay-btn zoom-btn" onClick={() => setZoom(z => Math.min(3, z + 0.2))}>+</button>
              <span className="zoom-value">{zoom.toFixed(1)}x</span>
              <button className="overlay-btn zoom-btn" onClick={() => setZoom(z => Math.max(0.2, z - 0.2))}>−</button>
            </div>
          </div>

          {/* Bottom Right: Pan Controls */}
          <div className="map-overlay bottom-right">
            <div className="overlay-panel pan-controls">
              <button className="overlay-btn pan-btn" onClick={() => panMap('up')}>↑</button>
              <div className="pan-row">
                <button className="overlay-btn pan-btn" onClick={() => panMap('left')}>←</button>
                <button className="overlay-btn pan-btn" onClick={() => panMap('right')}>→</button>
              </div>
              <button className="overlay-btn pan-btn" onClick={() => panMap('down')}>↓</button>
            </div>
          </div>

          {/* Travel Status Overlay */}
          {travelStatus?.traveling && (
            <div className="map-overlay bottom-center">
              <div className="overlay-panel travel-panel">
                <div className="travel-header">
                  <span className="travel-icon">🚶</span>
                  <span className="travel-label">Unterwegs</span>
                </div>
                <div className="travel-progress-container">
                  <div 
                    className="travel-progress-bar" 
                    style={{ width: `${travelStatus.progress || 0}%` }}
                  />
                </div>
                <div className="travel-info">
                  <span className="travel-time">⏱️ {travelStatus.remainingTime || '...'}</span>
                  <button 
                    className="overlay-btn cancel-btn"
                    onClick={handleCancelTravel}
                    title="Reise abbrechen"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Nearby Players - Collapsible Panel */}
          <div className="map-overlay right-center">
            <div className="overlay-panel players-panel">
              <div className="panel-header">👥 {nearbyPlayers.length}</div>
              {nearbyPlayers.length > 0 && (
                <ul className="players-mini-list">
                  {nearbyPlayers.slice(0, 5).map(player => (
                    <li 
                      key={player.id}
                      className={selectedPlayer?.id === player.id ? 'selected' : ''}
                      onClick={() => {
                        setSelectedPlayer(player);
                        setActionMode(null);
                      }}
                    >
                      {player.username}
                    </li>
                  ))}
                  {nearbyPlayers.length > 5 && (
                    <li className="more">+{nearbyPlayers.length - 5} mehr</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Player Stats Bar */}
        {playerStats && (
          <div className="player-stats-bar">
            <div className="stat-item">
              <span className="stat-label">💰 Gold:</span>
              <span className="stat-value">{playerStats.gold || 0}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">⭐ Level:</span>
              <span className="stat-value">{playerStats.level}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">❤️ HP:</span>
              <span className="stat-value">{playerStats.current_health}/{playerStats.max_health + equipmentTotalStats.health}</span>
              {playerStats.current_health < (playerStats.max_health + equipmentTotalStats.health) && (
                <span className="heal-hint" title="Geh nach Hause um zu heilen">🏠</span>
              )}
            </div>
            <div className="stat-item">
              <span className="stat-label">⚔️ ATK:</span>
              <span className="stat-value">{playerStats.base_attack}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">🛡️ DEF:</span>
              <span className="stat-value">{playerStats.base_defense}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">✨ EP:</span>
              <span className="stat-value">{playerStats.experience}</span>
            </div>
          </div>
        )}

        {/* NPC Panel */}
        {selectedNpc && (
          <div className={`npc-panel ${selectedNpc.entity_type}`}>
            <h3>
              {selectedNpc.entity_type === 'merchant' ? '🏪' : selectedNpc.entity_type === 'boss' ? '👑' : '👹'} 
              {selectedNpc.display_name}
              {selectedNpc.entity_type !== 'merchant' && ` (Lv.${selectedNpc.level || 1})`}
            </h3>
            <p className="npc-description">{selectedNpc.description}</p>
            
            <p>Position: ({selectedNpc.world_x}, {selectedNpc.world_y})</p>
            {user?.world_x !== undefined && user?.world_y !== undefined && (
              <p>Entfernung: <strong>{Math.round(Math.sqrt(
                Math.pow((user.world_x || 0) - (selectedNpc.world_x || 0), 2) +
                Math.pow((user.world_y || 0) - (selectedNpc.world_y || 0), 2)
              ))} Einheiten</strong></p>
            )}

            {/* Monster Stats */}
            {selectedNpc.entity_type !== 'merchant' && (
              <div className="monster-stats">
                <div className="stat-row">
                  <span>❤️ HP: {selectedNpc.current_health}/{selectedNpc.max_health}</span>
                </div>
                <div className="stat-row">
                  <span>⚔️ ATK: {selectedNpc.attack}</span>
                  <span>🛡️ DEF: {selectedNpc.defense}</span>
                </div>
              </div>
            )}

            {/* Merchant Shop */}
            {selectedNpc.entity_type === 'merchant' && npcShopData && (
              <div className="npc-shop">
                <h4>🛒 Waren</h4>
                {npcShopData.shopItems?.length > 0 ? (
                  <div className="shop-items">
                    {npcShopData.shopItems.map(item => (
                      <div key={item.id} className="shop-item">
                        <span className="item-name">{item.item_display_name}</span>
                        <div className="item-prices">
                          {item.buy_price && (
                            <button 
                              className="btn-buy"
                              onClick={() => handleBuyItem(item.item_id)}
                              disabled={!playerStats || playerStats.gold < item.buy_price}
                            >
                              Kaufen: {item.buy_price} 💰
                            </button>
                          )}
                          {item.sell_price && (
                            <button 
                              className="btn-sell"
                              onClick={() => handleSellItem(item.item_id)}
                            >
                              Verkaufen: {item.sell_price} 💰
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-items">Keine Waren verfügbar</p>
                )}
              </div>
            )}

            <div className="action-buttons">
              {selectedNpc.entity_type !== 'merchant' && (
                <button 
                  className="btn btn-danger" 
                  onClick={handleAttackMonster}
                  disabled={!selectedNpc.is_active || getDistanceTo(selectedNpc.world_x, selectedNpc.world_y) > 100}
                >
                  ⚔️ Angreifen
                </button>
              )}
              {getDistanceTo(selectedNpc.world_x, selectedNpc.world_y) > 50 && (
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleTravelTo(selectedNpc.world_x, selectedNpc.world_y, selectedNpc.display_name)}
                  disabled={travelStatus?.traveling}
                >
                  🚶 Dahin bewegen
                </button>
              )}
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setSelectedNpc(null);
                  setNpcShopData(null);
                }}
              >
                ✗ Schließen
              </button>
            </div>

            {!selectedNpc.is_active && selectedNpc.entity_type !== 'merchant' && (
              <p className="dead-notice">⚰️ Dieses Monster ist tot und respawnt bald.</p>
            )}
          </div>
        )}

        {/* Resource Node Panel */}
        {selectedResource && (
          <div className={`resource-panel ${selectedResource.node?.category}`}>
            <h3>
              {selectedResource.node?.icon || '❓'} {selectedResource.node?.display_name}
            </h3>
            <p className="resource-description">{selectedResource.node?.description}</p>
            
            <p>Position: ({selectedResource.node?.world_x}, {selectedResource.node?.world_y})</p>
            <p>Entfernung: <strong>{selectedResource.distance} Einheiten</strong></p>
            <p>Verbleibend: <strong>{selectedResource.node?.current_amount}/{selectedResource.node?.max_amount}</strong></p>
            
            {selectedResource.node?.min_level > 1 && (
              <p className="level-req">Benötigt Level: {selectedResource.node?.min_level}</p>
            )}

            <div className="resource-drops">
              <h4>📦 Mögliche Drops:</h4>
              {selectedResource.drops?.map((drop, idx) => (
                <div key={idx} className={`drop-item ${drop.is_rare ? 'rare' : ''}`}>
                  <span className={`drop-name rarity-${drop.rarity}`}>{drop.item_name}</span>
                  <span className="drop-chance">
                    {drop.is_rare ? '⭐' : ''} {drop.drop_chance}% ({drop.min_quantity}-{drop.max_quantity})
                  </span>
                </div>
              ))}
            </div>

            {selectedResource.node?.required_tool_type && (
              <div className="tool-section">
                <h4>🔧 Werkzeug: {selectedResource.node?.required_tool_type === 'pickaxe' ? 'Spitzhacke' : selectedResource.node?.required_tool_type === 'axe' ? 'Axt' : 'Sichel'}</h4>
                {selectedResource.userTools?.length > 0 ? (
                  <div className="user-tools">
                    {selectedResource.userTools.map(tool => (
                      <div key={tool.id} className="tool-item">
                        <span>{tool.icon} {tool.display_name}</span>
                        <span className="tool-durability">🔋 {tool.current_durability}/{tool.durability}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-tools">
                    <p>❌ Kein passendes Werkzeug!</p>
                    <button 
                      className="btn btn-small"
                      onClick={() => getStarterTool(selectedResource.node?.required_tool_type)}
                    >
                      🆓 Gratis Starter-Werkzeug holen
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="action-buttons">
              {selectedResource.canGather ? (
                <button 
                  className="btn btn-success" 
                  onClick={() => startGathering(selectedResource.node?.id, selectedResource.userTools?.[0]?.id)}
                  disabled={gatheringJob || !selectedResource.userTools?.length}
                >
                  {!selectedResource.userTools?.length ? '❌ Werkzeug fehlt' : '⛏️ Sammeln starten'}
                </button>
              ) : selectedResource.distance > 5 ? (
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleTravelTo(selectedResource.node?.world_x, selectedResource.node?.world_y, selectedResource.node?.display_name)}
                  disabled={travelStatus?.traveling}
                >
                  🚶 Dahin bewegen ({selectedResource.distance} Einheiten)
                </button>
              ) : (
                <p className="cannot-gather">⚠️ Nicht sammelbar</p>
              )}
              <button 
                className="btn btn-secondary" 
                onClick={() => setSelectedResource(null)}
              >
                ✗ Schließen
              </button>
            </div>
          </div>
        )}

        {/* Gathering Job Panel */}
        {gatheringJob && (
          <div className="gathering-panel">
            <h4>{gatheringJob.icon || '⛏️'} {gatheringJob.display_name}</h4>
            {gatheringJob.is_ready ? (
              <>
                <p className="ready-text">✅ Fertig!</p>
                <button className="btn btn-success" onClick={collectGathering}>
                  🎁 Abholen
                </button>
              </>
            ) : (
              <>
                <div className="gathering-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${Math.max(0, 100 - (gatheringJob.remaining_seconds / 60 * 100))}%` }}
                    />
                  </div>
                  <span className="time-left">⏱️ {gatheringJob.remaining_seconds}s</span>
                </div>
              </>
            )}
            <button className="btn btn-danger btn-small" onClick={cancelGathering}>
              ✗ Abbrechen
            </button>
          </div>
        )}

        {/* Combat Result Modal */}
        {combatResult && (
          <div className="combat-result-modal">
            <div className="combat-result-content">
              <h3>{combatResult.result === 'attacker' ? '🏆 Sieg!' : '💀 Niederlage'}</h3>
              <p>Kampf gegen <strong>{combatResult.monsterName}</strong> (Lv.{combatResult.monsterLevel})</p>
              <div className="combat-stats">
                <p>Runden: {combatResult.rounds}</p>
                <p>Schaden verursacht: {combatResult.damageDealt}</p>
                <p>Schaden erhalten: {combatResult.damageTaken}</p>
                <p>Deine HP: {combatResult.playerHealth}/{combatResult.playerMaxHealth}</p>
              </div>
              {combatResult.result === 'attacker' && (
                <div className="combat-loot">
                  <p>💰 Gold: +{combatResult.goldGained}</p>
                  <p>✨ EP: +{combatResult.expGained}</p>
                  {combatResult.lootItems?.length > 0 && (
                    <div className="loot-list">
                      <p>🎁 Beute:</p>
                      {combatResult.lootItems.map((item, idx) => (
                        <span key={idx}>{item.quantity}x {item.name}</span>
                      ))}
                    </div>
                  )}
                  {combatResult.levelUp && (
                    <div className="level-up">
                      <p>🎉 LEVEL UP! Du bist jetzt Level {combatResult.levelUp.newLevel}!</p>
                    </div>
                  )}
                </div>
              )}
              <button className="btn btn-primary" onClick={() => setCombatResult(null)}>
                OK
              </button>
            </div>
          </div>
        )}

        {selectedPlayer && selectedPlayer.id !== user?.id && (
          <div className="player-actions">
            <h3>👤 {selectedPlayer.username || 'Unbekannt'}</h3>
            <p>Position: ({selectedPlayer.world_x ?? 0}, {selectedPlayer.world_y ?? 0})</p>
            
            {user?.world_x !== undefined && user?.world_y !== undefined && 
             selectedPlayer.world_x !== undefined && selectedPlayer.world_y !== undefined && (
              <p>
                Entfernung: <strong>{Math.round(Math.sqrt(
                  Math.pow((user.world_x || 0) - (selectedPlayer.world_x || 0), 2) +
                  Math.pow((user.world_y || 0) - (selectedPlayer.world_y || 0), 2)
                ))} Einheiten</strong>
              </p>
            )}

            <div className="action-buttons">
              <button 
                className="btn btn-danger" 
                onClick={handleAttack}
                disabled={getDistanceTo(selectedPlayer.world_x, selectedPlayer.world_y) > 100}
              >
                ⚔️ Angreifen
              </button>
              <button 
                className="btn btn-success" 
                onClick={handleTrade}
                disabled={getDistanceTo(selectedPlayer.world_x, selectedPlayer.world_y) > 50}
              >
                🤝 Handeln
              </button>
              {getDistanceTo(selectedPlayer.world_x, selectedPlayer.world_y) > 50 && (
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleTravelTo(selectedPlayer.world_x, selectedPlayer.world_y, selectedPlayer.username)}
                  disabled={travelStatus?.traveling}
                >
                  🚶 Dahin bewegen
                </button>
              )}
              <button 
                className="btn btn-info" 
                onClick={() => navigate(`/messages?to=${selectedPlayer.username}`)}
              >
                ✉️ Nachricht
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => setSelectedPlayer(null)}
              >
                ✗ Schließen
              </button>
            </div>
          </div>
        )}

        {actionMode === 'move' && (
          <div className="move-panel">
            <h3>🚶 Bewegen</h3>
            {!targetCoords ? (
              <p>Klicke auf die Karte, um ein Ziel zu wählen</p>
            ) : (
              <>
                <p>Ziel: ({targetCoords.x}, {targetCoords.y})</p>
                {user?.world_x !== undefined && user?.world_y !== undefined && (
                  <p>Entfernung: {Math.round(Math.sqrt(
                    Math.pow(targetCoords.x - (user.world_x || 0), 2) +
                    Math.pow(targetCoords.y - (user.world_y || 0), 2)
                  ))} Einheiten</p>
                )}
                {isTargetOnWater(targetCoords.x, targetCoords.y) && (
                  <p className="water-warning">🌊 Ziel ist auf Wasser - Du brauchst ein Boot!</p>
                )}
                <div className="move-actions">
                  <button className="btn btn-primary" onClick={handleMove}>
                    {isTargetOnWater(targetCoords.x, targetCoords.y) ? '🚣 Segeln' : '✓ Hierhin bewegen'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => {
                    setTargetCoords(null);
                    setActionMode(null);
                  }}>
                    ✗ Abbrechen
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {actionMode === 'trade' && tradeData && (
          <div className="trade-modal">
            <h3>🤝 Handel mit {tradeData.target_username}</h3>
            
            <div className="trade-container">
              <div className="trade-column">
                <h4>Deine Items</h4>
                <div className="trade-items">
                  {tradeData.my_inventory.map((item) => {
                    const tradeItem = myTradeItems.find(i => i.item_id === item.item_id);
                    const isSelected = !!tradeItem;
                    return (
                      <div 
                        key={item.item_id} 
                        className={`trade-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleTradeItem(item, true)}
                      >
                        <img 
                          src={item.image_path ? `/items/${item.image_path}` : '/placeholder-item.png'} 
                          alt={item.display_name}
                          className="trade-item-image"
                        />
                        <div className="trade-item-info">
                          <span>{item.display_name}</span>
                          <span className="trade-item-quantity">x{item.quantity}</span>
                        </div>
                        {isSelected && (
                          <input
                            type="number"
                            min="1"
                            max={item.quantity}
                            value={tradeItem.quantity}
                            onChange={(e) => updateTradeQuantity(item.item_id, parseInt(e.target.value), true)}
                            onClick={(e) => e.stopPropagation()}
                            className="trade-quantity-input"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="trade-arrow">⇄</div>

              <div className="trade-column">
                <h4>{tradeData.target_username}'s Items</h4>
                <div className="trade-items">
                  {tradeData.target_inventory.map((item) => {
                    const tradeItem = targetTradeItems.find(i => i.item_id === item.item_id);
                    const isSelected = !!tradeItem;
                    return (
                      <div 
                        key={item.item_id} 
                        className={`trade-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleTradeItem(item, false)}
                      >
                        <img 
                          src={item.image_path ? `/items/${item.image_path}` : '/placeholder-item.png'} 
                          alt={item.display_name}
                          className="trade-item-image"
                        />
                        <div className="trade-item-info">
                          <span>{item.display_name}</span>
                          <span className="trade-item-quantity">x{item.quantity}</span>
                        </div>
                        {isSelected && (
                          <input
                            type="number"
                            min="1"
                            max={item.quantity}
                            value={tradeItem.quantity}
                            onChange={(e) => updateTradeQuantity(item.item_id, parseInt(e.target.value), false)}
                            onClick={(e) => e.stopPropagation()}
                            className="trade-quantity-input"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="trade-actions">
              <button className="btn btn-success" onClick={handleExecuteTrade}>
                ✅ Handel abschließen
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setTradeData(null);
                  setMyTradeItems([]);
                  setTargetTradeItems([]);
                  setActionMode(null);
                }}
              >
                ❌ Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Map;

