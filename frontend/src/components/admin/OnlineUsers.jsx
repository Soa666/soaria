import { useState, useEffect } from 'react';
import api from '../../services/api';
import './OnlineUsers.css';

function OnlineUsers() {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [stats, setStats] = useState({ count: 0, totalUsers: 0, activeToday: 0 });
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [timeRange, setTimeRange] = useState(5); // minutes

  useEffect(() => {
    fetchOnlineUsers();
    
    // Auto-refresh every 30 seconds if enabled
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchOnlineUsers, 30000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, timeRange]);

  const fetchOnlineUsers = async () => {
    try {
      const response = await api.get(`/admin/online-users?minutes=${timeRange}`);
      setOnlineUsers(response.data.online || []);
      setStats({
        count: response.data.count || 0,
        totalUsers: response.data.totalUsers || 0,
        activeToday: response.data.activeToday || 0
      });
    } catch (error) {
      console.error('Fetch online users error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatLastActivity = (dateStr) => {
    if (!dateStr) return 'Unbekannt';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    
    if (diffSec < 60) return `vor ${diffSec}s`;
    if (diffMin < 60) return `vor ${diffMin}m`;
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  const getRoleBadge = (role) => {
    const badges = {
      admin: { label: 'Admin', class: 'role-admin' },
      mod: { label: 'Mod', class: 'role-mod' },
      user: { label: 'User', class: 'role-user' }
    };
    return badges[role] || badges.user;
  };

  return (
    <div className="online-users">
      {/* Header Stats */}
      <div className="online-stats">
        <div className="stat-card primary">
          <div className="stat-icon">🟢</div>
          <div className="stat-info">
            <span className="stat-value">{stats.count}</span>
            <span className="stat-label">Gerade online</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <div className="stat-info">
            <span className="stat-value">{stats.activeToday}</span>
            <span className="stat-label">Heute aktiv</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-info">
            <span className="stat-value">{stats.totalUsers}</span>
            <span className="stat-label">Registriert</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="online-controls">
        <div className="control-group">
          <label>Zeitraum:</label>
          <select value={timeRange} onChange={e => setTimeRange(Number(e.target.value))}>
            <option value={2}>Letzte 2 Minuten</option>
            <option value={5}>Letzte 5 Minuten</option>
            <option value={10}>Letzte 10 Minuten</option>
            <option value={30}>Letzte 30 Minuten</option>
            <option value={60}>Letzte Stunde</option>
          </select>
        </div>
        
        <div className="control-group">
          <label className="checkbox-label">
            <input 
              type="checkbox" 
              checked={autoRefresh} 
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-Refresh (30s)</span>
          </label>
        </div>

        <button className="refresh-btn" onClick={fetchOnlineUsers}>
          🔄 Aktualisieren
        </button>
      </div>

      {/* User List */}
      <div className="online-list">
        <h3>
          {onlineUsers.length > 0 
            ? `${onlineUsers.length} Spieler online` 
            : 'Keine Spieler online'}
        </h3>

        {loading ? (
          <div className="loading">Lädt...</div>
        ) : onlineUsers.length === 0 ? (
          <div className="no-users">
            <span className="no-users-icon">😴</span>
            <p>Momentan sind keine Spieler online.</p>
          </div>
        ) : (
          <div className="users-grid">
            {onlineUsers.map(user => (
              <div key={user.id} className="user-card">
                <div className="user-avatar">
                  {user.avatar_path ? (
                    <img src={`/chars/${user.avatar_path}`} alt={user.username} />
                  ) : (
                    <div className="avatar-placeholder">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="online-indicator"></span>
                </div>
                
                <div className="user-info">
                  <div className="user-name">
                    {user.username}
                    <span className={`role-badge ${getRoleBadge(user.role).class}`}>
                      {getRoleBadge(user.role).label}
                    </span>
                  </div>
                  <div className="user-details">
                    <span className="user-level">Lv. {user.level || 1}</span>
                    <span className="user-position">📍 ({user.world_x}, {user.world_y})</span>
                  </div>
                </div>

                <div className="user-activity">
                  <span className="activity-time">{formatLastActivity(user.last_activity)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default OnlineUsers;
