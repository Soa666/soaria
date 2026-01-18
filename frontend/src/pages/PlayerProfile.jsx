import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './PlayerProfile.css';

// API-Base URL für öffentliche Anfragen (ohne Auth)
const API_BASE = import.meta.env.VITE_API_URL || '/api';

function PlayerProfile() {
  const { username } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchPlayer();
  }, [username]);

  const fetchPlayer = async () => {
    try {
      // Öffentlicher API-Call ohne Auth-Token
      const response = await fetch(`${API_BASE}/players/profile/${encodeURIComponent(username)}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Spieler nicht gefunden');
      }
      
      setPlayer(data.player);
    } catch (err) {
      setError(err.message || 'Spieler nicht gefunden');
    } finally {
      setLoading(false);
    }
  };

  const copyProfileLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getRankTitle = (level) => {
    if (level >= 50) return 'Legende';
    if (level >= 40) return 'Meister';
    if (level >= 30) return 'Veteran';
    if (level >= 20) return 'Held';
    if (level >= 10) return 'Krieger';
    if (level >= 5) return 'Lehrling';
    return 'Anfänger';
  };

  const getAvatarStyle = (avatarPath) => {
    if (!avatarPath) return {};
    return {
      backgroundImage: `url(/chars/${avatarPath})`,
      backgroundPosition: 'center top',
      backgroundSize: '300% 400%',
      imageRendering: 'pixelated'
    };
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-card loading-card">
          <div className="loading-spinner"></div>
          <p>Lädt Profil...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="profile-page">
        <div className="profile-card error-card">
          <div className="error-icon">❌</div>
          <h2>Spieler nicht gefunden</h2>
          <p>{error}</p>
          <Link to="/players" className="btn btn-back">← Zurück zur Übersicht</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-card">
        {/* Header with banner */}
        <div className="profile-banner">
          <div className="banner-pattern"></div>
        </div>

        {/* Avatar */}
        <div className="profile-avatar-container">
          <div className="profile-avatar">
            {player.avatar_path ? (
              <div className="avatar-sprite" style={getAvatarStyle(player.avatar_path)} />
            ) : (
              <div className="avatar-placeholder">⚔️</div>
            )}
          </div>
          <div className="level-badge">Lv.{player.level || 1}</div>
        </div>

        {/* Name and Title */}
        <div className="profile-header">
          <h1 className="profile-name">{player.username}</h1>
          <div className="profile-title">{getRankTitle(player.level || 1)}</div>
        </div>

        {/* Guild Info */}
        {player.guild_name && (
          <Link to={`/guilds/${player.guild_id}`} className="profile-guild">
            <span className="guild-emblem">⚔️</span>
            <span className="guild-tag">[{player.guild_tag}]</span>
            <span className="guild-name">{player.guild_name}</span>
            {player.guild_role === 'leader' && <span className="role-icon">👑</span>}
            {player.guild_role === 'officer' && <span className="role-icon">⚔️</span>}
          </Link>
        )}

        {/* Stats Grid */}
        <div className="profile-stats">
          <div className="stat-box">
            <div className="stat-icon">⚔️</div>
            <div className="stat-value">{player.total_attack || player.base_attack || 10}</div>
            <div className="stat-label">Angriff</div>
          </div>
          <div className="stat-box">
            <div className="stat-icon">🛡️</div>
            <div className="stat-value">{player.total_defense || player.base_defense || 5}</div>
            <div className="stat-label">Verteidigung</div>
          </div>
          <div className="stat-box">
            <div className="stat-icon">❤️</div>
            <div className="stat-value">{player.max_health || 100}</div>
            <div className="stat-label">Max HP</div>
          </div>
          <div className="stat-box">
            <div className="stat-icon">🏆</div>
            <div className="stat-value">{player.monsters_killed || 0}</div>
            <div className="stat-label">Monster</div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="profile-info">
          <div className="info-row">
            <span className="info-label">📍 Position</span>
            <span className="info-value">{player.world_x}, {player.world_y}</span>
          </div>
          <div className="info-row">
            <span className="info-label">📅 Dabei seit</span>
            <span className="info-value">
              {new Date(player.created_at).toLocaleDateString('de-DE', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}
            </span>
          </div>
          {player.last_login && (
            <div className="info-row">
              <span className="info-label">🟢 Zuletzt aktiv</span>
              <span className="info-value">
                {new Date(player.last_login).toLocaleDateString('de-DE')}
              </span>
            </div>
          )}
        </div>

        {/* Equipment Preview */}
        {player.equipped_count > 0 && (
          <div className="profile-equipment">
            <h4>⚔️ Ausrüstung ({player.equipped_count} Items)</h4>
          </div>
        )}

        {/* Action Buttons */}
        <div className="profile-actions">
          {user && player.id !== user.id && (
            <>
              <button 
                className="btn btn-message"
                onClick={() => navigate(`/messages?to=${player.username}`)}
              >
                ✉️ Nachricht
              </button>
              <button 
                className="btn btn-map"
                onClick={() => navigate('/map')}
              >
                🗺️ Auf Karte zeigen
              </button>
            </>
          )}
          <button 
            className={`btn btn-share ${copied ? 'copied' : ''}`}
            onClick={copyProfileLink}
          >
            {copied ? '✓ Kopiert!' : '🔗 Link kopieren'}
          </button>
        </div>

        {/* Call to Action for non-logged in users */}
        {!user && (
          <div className="profile-cta">
            <p>Erkunde die Welt von Soaria!</p>
            <div className="cta-buttons">
              <button 
                className="btn btn-register"
                onClick={() => navigate('/register')}
              >
                🎮 Jetzt spielen
              </button>
              <button 
                className="btn btn-login"
                onClick={() => navigate('/login')}
              >
                Anmelden
              </button>
            </div>
          </div>
        )}

        {/* Back Link - only for logged in users */}
        {user && (
          <Link to="/players" className="back-link">← Zurück zur Spieler-Übersicht</Link>
        )}
      </div>
    </div>
  );
}

export default PlayerProfile;
