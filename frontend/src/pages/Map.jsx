import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Map.css';

// Tileset configuration
const TILE_SIZE = 16; // Original tile size in tileset
const TILESET_COLUMNS = 27;
const TILESET_URL = '/world/punyworld-overworld-tileset.png';

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

// Get tile ID based on terrain type and variation
function getTileForTerrain(terrain, variation) {
  const tiles = {
    grass: [1, 2, 3, 28, 29, 30, 55, 56, 57],
    dirt: [4, 5, 6, 31, 32, 58, 59],
    water: [271, 272, 273, 298, 299, 300],
    deepWater: [287, 288, 289, 314, 315, 316],
    forest: [190, 191, 192, 217, 218, 219, 244, 245, 246],
    trees: [147, 148, 149, 174, 175, 176],
    cliff: [109, 110, 111, 136, 137, 138, 163, 164, 165],
    flowers: [113, 114, 117, 118],
    path: [85, 86, 87, 88],
    sand: [23, 24, 25, 50, 51, 52]
  };
  
  const tileSet = tiles[terrain] || tiles.grass;
  const index = Math.floor(variation * tileSet.length) % tileSet.length;
  return tileSet[index];
}

// Check if terrain is water
function isWaterTerrain(terrain) {
  return terrain === 'water' || terrain === 'deepWater';
}

// Generate terrain type based on noise
function getTerrainAt(worldX, worldY) {
  // Large-scale continent noise (very smooth, large features)
  const continent = fractalNoise(worldX, worldY, 4, 0.5, 0.002, 0);
  
  // Medium-scale elevation
  const elevation = fractalNoise(worldX, worldY, 5, 0.5, 0.006, 10000);
  
  // Moisture for vegetation
  const moisture = fractalNoise(worldX, worldY, 4, 0.5, 0.01, 50000);
  
  // Detail noise
  const detail = fractalNoise(worldX, worldY, 3, 0.5, 0.025, 100000);
  
  // River noise - creates winding rivers (less frequent)
  const riverBase = fractalNoise(worldX, worldY, 3, 0.6, 0.003, 77777);
  const riverWind = Math.sin(worldX * 0.004 + riverBase * 3) * 0.5 + 
                    Math.cos(worldY * 0.004 + riverBase * 3) * 0.5;
  const riverValue = Math.abs(riverWind + fractalNoise(worldX, worldY, 2, 0.5, 0.008, 88888) * 0.2);
  
  // Combined height value - bias towards land
  const height = continent * 0.5 + elevation * 0.5;
  
  // Ocean - only at very low continent values (less ocean)
  if (continent < 0.2) {
    if (continent < 0.12) return 'deepWater';
    return 'water';
  }
  
  // Small lakes - rare
  if (height < 0.28 && continent > 0.25 && continent < 0.35 && elevation < 0.3) {
    return 'water';
  }
  
  // Rivers - thin winding paths (narrower)
  if (riverValue < 0.04 && height > 0.35 && height < 0.7 && continent > 0.3) {
    if (riverValue < 0.02) return 'deepWater';
    return 'water';
  }
  
  // Beach/sand (narrow strip near water)
  if (continent > 0.2 && continent < 0.28) {
    return 'sand';
  }
  
  // Mountains/cliffs (high elevation)
  if (height > 0.78) {
    return 'cliff';
  }
  
  // Forest (high moisture, medium elevation)
  if (moisture > 0.55 && height > 0.4 && height < 0.75) {
    if (moisture > 0.7 && detail > 0.4) return 'forest';
    if (moisture > 0.6) return 'trees';
  }
  
  // Scattered trees
  if (detail > 0.72 && moisture > 0.48 && height > 0.4) {
    return 'trees';
  }
  
  // Paths
  if (detail > 0.47 && detail < 0.53 && height > 0.38 && height < 0.68) {
    return 'path';
  }
  
  // Flowers
  if (detail > 0.85 && moisture > 0.42 && height > 0.4) {
    return 'flowers';
  }
  
  // Dirt patches
  if (moisture < 0.32 && height > 0.45 && height < 0.68 && detail > 0.6) {
    return 'dirt';
  }
  
  return 'grass';
}

function Map() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
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
  const [combatResult, setCombatResult] = useState(null);
  const [travelStatus, setTravelStatus] = useState(null);
  const [animationFrame, setAnimationFrame] = useState(0);
  const [currentUserPosition, setCurrentUserPosition] = useState(null);
  const [npcShopData, setNpcShopData] = useState(null);
  const [tilesetImage, setTilesetImage] = useState(null);
  const [tilesetLoaded, setTilesetLoaded] = useState(false);

  // Load tileset image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setTilesetImage(img);
      setTilesetLoaded(true);
      console.log('Tileset loaded:', img.width, 'x', img.height);
    };
    img.onerror = (e) => {
      console.error('Failed to load tileset:', e);
      setTilesetLoaded(false);
    };
    img.src = TILESET_URL;
  }, []);

  useEffect(() => {
    fetchPlayers();
    fetchNpcs();
    fetchHomes();
    fetchPlayerStats();
    fetchTravelStatus();
    if (user?.world_x !== undefined && user?.world_y !== undefined && (user.world_x !== 0 || user.world_y !== 0)) {
      setViewCenter({ x: user.world_x, y: user.world_y });
    } else {
      // If user has no coordinates, set default center
      setViewCenter({ x: 0, y: 0 });
    }
  }, [user?.world_x, user?.world_y]);

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
  }, [players, npcs, viewCenter, zoom, user, selectedPlayer, selectedNpc, targetCoords, actionMode, playerImages, tilesetLoaded, animationFrame, currentUserPosition, travelStatus]);

  const fetchPlayers = async () => {
    try {
      const response = await api.get('/map/players');
      const playersData = response.data.players || [];
      setPlayers(playersData);
      
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
      setNpcs(response.data.npcs || []);
    } catch (error) {
      console.error('Fehler beim Laden der NPCs:', error);
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

  const fetchTravelStatus = async () => {
    try {
      const response = await api.get('/map/travel/status');
      setTravelStatus(response.data);
      
      // If arrived, refresh user data
      if (response.data.arrived) {
        setMessage('Du bist angekommen!');
        setTimeout(() => setMessage(''), 3000);
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

  // Helper to draw a tile from the tileset
  const drawTile = (ctx, tileId, destX, destY, destSize) => {
    if (!tilesetImage || !tilesetLoaded || tileId < 1) return;
    
    // Tiled uses 1-indexed tile IDs, convert to 0-indexed
    const id = tileId - 1;
    const srcX = (id % TILESET_COLUMNS) * TILE_SIZE;
    const srcY = Math.floor(id / TILESET_COLUMNS) * TILE_SIZE;
    
    ctx.drawImage(
      tilesetImage,
      srcX, srcY, TILE_SIZE, TILE_SIZE,
      destX, destY, destSize, destSize
    );
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

      // Clear canvas with base color
      ctx.fillStyle = '#2d4a2d';
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

      // Enable image smoothing for better tile scaling
      ctx.imageSmoothingEnabled = false; // Pixelated look for retro style

      // Draw terrain tiles
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
            // Draw from tileset
            const tileId = getTileForTerrain(terrain, variation);
            drawTile(ctx, tileId, screenX, screenY, renderTileSize + 0.5); // +0.5 to avoid gaps
          } else {
            // Fallback: colored rectangles
            const colors = {
              grass: '#4a6b3a',
              dirt: '#8b7355',
              water: '#4a90c2',
              deepWater: '#2a5080',
              forest: '#2d4a2d',
              trees: '#3d5c3d',
              cliff: '#6b6b6b',
              flowers: '#4a6b3a',
              path: '#a08060'
            };
            ctx.fillStyle = colors[terrain] || colors.grass;
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
            // Boss - red diamond with skull
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
          } else {
            // Regular monster - red circle
            ctx.beginPath();
            ctx.arc(x, y, markerSize * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#ff6666' : '#e74c3c';
            ctx.shadowBlur = isSelected ? 12 : 6;
            ctx.shadowColor = '#e74c3c';
            ctx.fill();
            ctx.strokeStyle = '#c0392b';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Monster icon
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.max(10, markerSize * 0.6)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 0;
            ctx.fillText('👹', x, y);
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

      if (clickedNpc) {
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
      // Check if it's a boat requirement error
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

  const handleTravelHome = async () => {
    if (travelStatus?.traveling) {
      setMessage('Du bist bereits unterwegs! Warte oder brich die Reise ab.');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

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

  // Travel to a specific target (NPC, player, or coordinates)
  const handleTravelTo = async (targetX, targetY, targetName) => {
    if (travelStatus?.traveling) {
      setMessage('Du bist bereits unterwegs! Warte oder brich die Reise ab.');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

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
        // It's a merchant
        setNpcShopData(response.data);
      } else {
        setNpcShopData(null);
      }
    } catch (error) {
      console.error('Fehler beim Laden der NPC-Details:', error);
      if (error.response?.data?.tooFar) {
        setMessage(error.response.data.error);
        setTimeout(() => setMessage(''), 3000);
        setSelectedNpc(null);
        setNpcShopData(null);
      }
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

  const handleHeal = async () => {
    try {
      const response = await api.post('/combat/heal');
      setMessage(response.data.message);
      fetchPlayerStats();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Heilungsfehler');
      setTimeout(() => setMessage(''), 3000);
    }
  };

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
      if (user?.world_x !== undefined && user?.world_y !== undefined && (user.world_x !== 0 || user.world_y !== 0)) {
        setViewCenter({ x: user.world_x, y: user.world_y });
      } else {
        setViewCenter({ x: 0, y: 0 });
      }
    } catch (error) {
      console.error('Error centering on user:', error);
    }
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

        <div className="map-controls">
          <div className="control-group">
            <button className="btn btn-secondary" onClick={centerOnUser} title="Zentriert die Karte auf deine aktuelle Position">
              🎯 Zu mir
            </button>
            <button 
              className={`btn ${actionMode === 'move' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setActionMode(actionMode === 'move' ? null : 'move');
                setSelectedPlayer(null);
              }}
              disabled={travelStatus?.traveling}
            >
              🚶 Bewegen
            </button>
            <button 
              className="btn btn-secondary"
              onClick={handleTravelHome}
              disabled={travelStatus?.traveling || (user?.world_x === 0 && user?.world_y === 0)}
              title="Reise zurück zu deinem Grundstück (0, 0)"
            >
              🏠 Nach Hause
            </button>
          </div>
          
          <div className="control-group">
            <label>
              Zoom: {zoom.toFixed(1)}x
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="zoom-slider"
              />
            </label>
          </div>

          <div className="map-info">
            <p>Deine Position: ({user?.world_x ?? 0}, {user?.world_y ?? 0})</p>
            <p>Spieler auf Karte: {Array.isArray(players) ? players.length : 0}</p>
          </div>

          {/* Travel Status Panel */}
          {travelStatus?.traveling && (
            <div className="travel-status-panel">
              <h4>🚶 Unterwegs</h4>
              <div className="travel-route">
                <span>Von: ({travelStatus.from?.x}, {travelStatus.from?.y})</span>
                <span>→</span>
                <span>Nach: ({travelStatus.to?.x}, {travelStatus.to?.y})</span>
              </div>
              <div className="travel-progress-container">
                <div 
                  className="travel-progress-bar" 
                  style={{ width: `${travelStatus.progress || 0}%` }}
                />
              </div>
              <p className="travel-time">
                ⏱️ Verbleibend: {travelStatus.remainingTime || 'Berechne...'}
              </p>
              <button 
                className="btn btn-danger btn-small"
                onClick={handleCancelTravel}
              >
                ✗ Reise abbrechen
              </button>
            </div>
          )}
        </div>

        <div className="map-sidebar">
          <div className="terrain-legend">
            <h4>🗺️ Terrain</h4>
            <div className="legend-item">
              <div className="legend-color grass"></div>
              <span>Wiese</span>
            </div>
            <div className="legend-item">
              <div className="legend-color forest"></div>
              <span>Wald</span>
            </div>
            <div className="legend-item">
              <div className="legend-color water"></div>
              <span>Wasser</span>
            </div>
            <div className="legend-item">
              <div className="legend-color cliff"></div>
              <span>Klippen</span>
            </div>
            <div className="legend-item">
              <div className="legend-color path"></div>
              <span>Pfad</span>
            </div>
            {!tilesetLoaded && (
              <p className="tileset-warning">⚠️ Tileset lädt...</p>
            )}
          </div>

          {/* Nearby Players List */}
          <div className="nearby-players">
            <h4>👥 Spieler in der Nähe</h4>
            {nearbyPlayers.length === 0 ? (
              <p className="no-players">Keine Spieler in der Nähe</p>
            ) : (
              <ul className="players-list">
                {nearbyPlayers.map(player => (
                  <li 
                    key={player.id} 
                    className={`player-list-item ${selectedPlayer?.id === player.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedPlayer(player);
                      setActionMode(null);
                    }}
                  >
                    <span className="player-name">{player.username}</span>
                    <span className="player-distance">{Math.round(player.distance)} Einheiten</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

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
              <span className="stat-value">{playerStats.current_health}/{playerStats.max_health}</span>
              {playerStats.current_health < playerStats.max_health && (
                <button className="btn-heal-small" onClick={handleHeal}>💊</button>
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

