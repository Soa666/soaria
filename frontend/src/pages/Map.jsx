import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Map.css';

// Seeded random number generator for consistent terrain
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Generate terrain features based on coordinates
function getTerrainAt(worldX, worldY) {
  const seed = worldX * 10000 + worldY;
  const rand = seededRandom(seed);
  
  // Water (rivers/lakes) - about 5%
  if (rand < 0.05) return 'water';
  // Mountains - about 8%
  if (rand < 0.13) return 'mountain';
  // Forest - about 25%
  if (rand < 0.38) return 'forest';
  // Plains - rest
  return 'plains';
}

function Map() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [npcs, setNpcs] = useState([]);
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
  const [npcShopData, setNpcShopData] = useState(null);

  useEffect(() => {
    fetchPlayers();
    fetchNpcs();
    fetchPlayerStats();
    if (user?.world_x !== undefined && user?.world_y !== undefined && (user.world_x !== 0 || user.world_y !== 0)) {
      setViewCenter({ x: user.world_x, y: user.world_y });
    } else {
      // If user has no coordinates, set default center
      setViewCenter({ x: 0, y: 0 });
    }
  }, [user?.world_x, user?.world_y]);

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
  }, [players, npcs, viewCenter, zoom, user, selectedPlayer, selectedNpc, targetCoords, actionMode, playerImages]);

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

  const drawMap = () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width || 1000;
      const height = canvas.height || 700;

      // Calculate scale
      const scale = Math.max(0.1, Math.min(3, zoom));
      const centerX = width / 2;
      const centerY = height / 2;

      // Clear canvas with base grass color
      ctx.fillStyle = '#3d5c3d';
      ctx.fillRect(0, 0, width, height);

      // Draw terrain tiles
      const tileSize = 40 * scale;
      const startWorldX = viewCenter.x - (centerX / scale);
      const startWorldY = viewCenter.y - (centerY / scale);
      const tilesX = Math.ceil(width / tileSize) + 2;
      const tilesY = Math.ceil(height / tileSize) + 2;

      for (let tx = -1; tx < tilesX; tx++) {
        for (let ty = -1; ty < tilesY; ty++) {
          const worldTileX = Math.floor(startWorldX / 40) + tx;
          const worldTileY = Math.floor(startWorldY / 40) + ty;
          const terrain = getTerrainAt(worldTileX, worldTileY);
          
          const screenX = (worldTileX * 40 - viewCenter.x) * scale + centerX;
          const screenY = (worldTileY * 40 - viewCenter.y) * scale + centerY;

          // Draw terrain
          switch (terrain) {
            case 'water':
              ctx.fillStyle = '#4a90c2';
              ctx.fillRect(screenX, screenY, tileSize + 1, tileSize + 1);
              // Water sparkle
              ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
              ctx.beginPath();
              ctx.arc(screenX + tileSize * 0.3, screenY + tileSize * 0.3, tileSize * 0.1, 0, Math.PI * 2);
              ctx.fill();
              break;
            case 'mountain':
              ctx.fillStyle = '#6b6b6b';
              ctx.fillRect(screenX, screenY, tileSize + 1, tileSize + 1);
              // Mountain peak
              ctx.fillStyle = '#888';
              ctx.beginPath();
              ctx.moveTo(screenX + tileSize * 0.5, screenY + tileSize * 0.2);
              ctx.lineTo(screenX + tileSize * 0.2, screenY + tileSize * 0.8);
              ctx.lineTo(screenX + tileSize * 0.8, screenY + tileSize * 0.8);
              ctx.closePath();
              ctx.fill();
              // Snow cap
              ctx.fillStyle = '#fff';
              ctx.beginPath();
              ctx.moveTo(screenX + tileSize * 0.5, screenY + tileSize * 0.2);
              ctx.lineTo(screenX + tileSize * 0.35, screenY + tileSize * 0.4);
              ctx.lineTo(screenX + tileSize * 0.65, screenY + tileSize * 0.4);
              ctx.closePath();
              ctx.fill();
              break;
            case 'forest':
              ctx.fillStyle = '#2d4a2d';
              ctx.fillRect(screenX, screenY, tileSize + 1, tileSize + 1);
              // Tree
              ctx.fillStyle = '#1a3a1a';
              ctx.beginPath();
              ctx.moveTo(screenX + tileSize * 0.5, screenY + tileSize * 0.15);
              ctx.lineTo(screenX + tileSize * 0.2, screenY + tileSize * 0.7);
              ctx.lineTo(screenX + tileSize * 0.8, screenY + tileSize * 0.7);
              ctx.closePath();
              ctx.fill();
              // Tree trunk
              ctx.fillStyle = '#5d4037';
              ctx.fillRect(screenX + tileSize * 0.4, screenY + tileSize * 0.7, tileSize * 0.2, tileSize * 0.25);
              break;
            default: // plains
              ctx.fillStyle = '#4a6b3a';
              ctx.fillRect(screenX, screenY, tileSize + 1, tileSize + 1);
              // Grass detail
              if (seededRandom(worldTileX * 1000 + worldTileY + 1) > 0.7) {
                ctx.fillStyle = '#5a7b4a';
                ctx.fillRect(screenX + tileSize * 0.3, screenY + tileSize * 0.3, tileSize * 0.1, tileSize * 0.2);
                ctx.fillRect(screenX + tileSize * 0.6, screenY + tileSize * 0.5, tileSize * 0.1, tileSize * 0.15);
              }
              break;
          }
        }
      }

      // Draw subtle grid
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.lineWidth = 1;
      const gridSize = 40 * scale;
      const offsetX = ((viewCenter.x % 40) || 0) * scale;
      const offsetY = ((viewCenter.y % 40) || 0) * scale;

      for (let x = -offsetX; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = -offsetY; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw players
      if (players && Array.isArray(players) && players.length > 0) {
        players.forEach((player) => {
          if (!player || (player.world_x === undefined && player.world_y === undefined)) return;
          if (player.world_x === 0 && player.world_y === 0) return;
          
          const playerX = player.world_x || 0;
          const playerY = player.world_y || 0;
          const x = centerX + (playerX - viewCenter.x) * scale;
          const y = centerY + (playerY - viewCenter.y) * scale;

          if (x < -30 || x > width + 30 || y < -30 || y > height + 30) return;

          const isCurrentUser = user && player.id === user.id;
          const isSelected = selectedPlayer && selectedPlayer.id === player.id;
          const markerSize = (isCurrentUser ? 20 : 16) * Math.min(scale, 1.5);

          // Draw player avatar or marker
          const playerImg = playerImages[player.id];
          
          if (playerImg && playerImg.complete) {
            // Draw avatar from sprite sheet (front-facing, middle column)
            ctx.save();
            
            // Draw circular clip
            ctx.beginPath();
            ctx.arc(x, y, markerSize, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            
            // Draw avatar (front-facing sprite: column 1, row 0)
            // Sprite sheet is 96x128, each sprite is 32x32
            const spriteX = 32; // Middle column (front-facing)
            const spriteY = 0;  // First row
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

      // Draw target marker if in move mode
      if (actionMode === 'move' && targetCoords) {
        const x = centerX + (targetCoords.x - viewCenter.x) * scale;
        const y = centerY + (targetCoords.y - viewCenter.y) * scale;

        if (x >= -50 && x <= width + 50 && y >= -50 && y <= height + 50) {
          // Target marker
          ctx.strokeStyle = '#27ae60';
          ctx.fillStyle = 'rgba(39, 174, 96, 0.3)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
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

  const handleMove = async () => {
    if (!targetCoords) {
      setMessage('Bitte wähle ein Ziel auf der Karte');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    try {
      const response = await api.put('/map/coordinates', {
        world_x: targetCoords.x,
        world_y: targetCoords.y
      });
      
      setMessage(response.data.message);
      setTimeout(() => setMessage(''), 3000);
      
      // Update user coordinates in context
      if (user) {
        const updatedUser = { ...user, world_x: targetCoords.x, world_y: targetCoords.y };
        // Update via context
        setUser(updatedUser);
      }
      
      setViewCenter({ x: targetCoords.x, y: targetCoords.y });
      setActionMode(null);
      setTargetCoords(null);
      
      // Refresh user data
      try {
        const profileResponse = await api.get('/auth/profile');
        if (profileResponse.data.user) {
          setUser(profileResponse.data.user);
        }
      } catch (error) {
        console.error('Error refreshing user profile:', error);
        // Don't fail the whole operation if profile refresh fails
      }
      fetchPlayers();
      fetchNearbyPlayers();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Bewegen');
      setTimeout(() => setMessage(''), 5000);
    }
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
    }
  };

  const handleAttackMonster = async () => {
    if (!selectedNpc || selectedNpc.entity_type === 'merchant') {
      setMessage('Wähle ein Monster zum Angreifen');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // Check distance
    if (user?.world_x !== undefined && user?.world_y !== undefined) {
      const distance = Math.sqrt(
        Math.pow((user.world_x || 0) - (selectedNpc.world_x || 0), 2) +
        Math.pow((user.world_y || 0) - (selectedNpc.world_y || 0), 2)
      );
      
      if (distance > 100) {
        setMessage(`Zu weit entfernt! Distanz: ${Math.round(distance)} (max: 100)`);
        setTimeout(() => setMessage(''), 3000);
        return;
      }
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
            <button className="btn btn-secondary" onClick={centerOnUser}>
              🎯 Zu mir
            </button>
            <button 
              className={`btn ${actionMode === 'move' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setActionMode(actionMode === 'move' ? null : 'move');
                setSelectedPlayer(null);
              }}
            >
              🚶 Bewegen
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
        </div>

        <div className="map-sidebar">
          <div className="terrain-legend">
            <div className="legend-item">
              <div className="legend-color plains"></div>
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
              <div className="legend-color mountain"></div>
              <span>Berg</span>
            </div>
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
                  disabled={!selectedNpc.is_active}
                >
                  ⚔️ Angreifen
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
              >
                ⚔️ Angreifen
              </button>
              <button 
                className="btn btn-success" 
                onClick={handleTrade}
              >
                🤝 Handeln
              </button>
              <button 
                className="btn btn-primary" 
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
                <div className="move-actions">
                  <button className="btn btn-primary" onClick={handleMove}>
                    ✓ Hierhin bewegen
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

