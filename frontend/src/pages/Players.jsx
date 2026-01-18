import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Players.css';

function Players() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchPlayers();
  }, []);

  const fetchPlayers = async () => {
    try {
      const response = await api.get('/players');
      setPlayers(response.data.players || []);
    } catch (error) {
      console.error('Fehler beim Laden der Spieler:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPlayers = players.filter(player =>
    player.username.toLowerCase().includes(search.toLowerCase()) ||
    (player.guild_name && player.guild_name.toLowerCase().includes(search.toLowerCase())) ||
    (player.guild_tag && player.guild_tag.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div className="loading">Lädt Spieler...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h1>👥 Spieler-Übersicht</h1>
        <p className="subtitle">{players.length} Spieler in Soaria</p>

        <div className="search-bar">
          <input
            type="text"
            placeholder="Spieler oder Gilde suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="players-grid">
          {filteredPlayers.map(player => (
            <div 
              key={player.id} 
              className="player-card"
              onClick={() => navigate(`/player/${player.username}`)}
            >
              <div className="player-avatar">
                {player.avatar_path ? (
                  <div 
                    className="avatar-sprite"
                    style={{
                      backgroundImage: `url(/chars/${player.avatar_path})`,
                      backgroundPosition: 'center 0',
                      backgroundSize: '300%',
                    }}
                  />
                ) : (
                  <div className="avatar-placeholder">👤</div>
                )}
              </div>
              <div className="player-info">
                <h3>{player.username}</h3>
                {player.guild_name ? (
                  <div 
                    className="player-guild"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/guilds/${player.guild_id}`);
                    }}
                  >
                    <span className="guild-tag">[{player.guild_tag}]</span>
                    <span className="guild-name">{player.guild_name}</span>
                    {player.guild_role === 'leader' && <span className="role-badge">👑</span>}
                    {player.guild_role === 'officer' && <span className="role-badge">⚔️</span>}
                  </div>
                ) : (
                  <span className="no-guild">Keine Gilde</span>
                )}
                <div className="player-coords">
                  📍 {player.world_x}, {player.world_y}
                </div>
                {player.id !== user?.id && (
                  <button 
                    className="btn-message-small"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/messages?to=${player.username}`);
                    }}
                    title="Nachricht senden"
                  >
                    ✉️
                  </button>
                )}
              </div>
              <div className="player-card-hint">Klicken für Profil</div>
            </div>
          ))}
        </div>

        {filteredPlayers.length === 0 && (
          <div className="no-results">
            Keine Spieler gefunden
          </div>
        )}
      </div>
    </div>
  );
}

export default Players;
