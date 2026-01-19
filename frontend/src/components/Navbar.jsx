import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import './Navbar.css';

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  // Fetch unread message count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const response = await fetch('/api/messages/unread-count', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setUnreadCount(data.count);
        }
      } catch (err) {
        console.error('Error fetching unread count:', err);
      }
    };

    if (user) {
      fetchUnreadCount();
      // Poll every 30 seconds for new messages
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/dashboard" className="navbar-brand">
          <Logo size="small" />
        </Link>
        <Link to="/messages" className="navbar-messages mobile-messages">
          📬
          {unreadCount > 0 && (
            <span className="message-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </Link>
        <button className="navbar-toggle" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? '✕' : '☰'}
        </button>
        <div className={`navbar-links ${menuOpen ? 'open' : ''}`}>
          <Link to="/dashboard" onClick={closeMenu}>Charakter</Link>
          <Link to="/map" onClick={closeMenu}>Karte</Link>
          <Link to="/grundstueck" onClick={closeMenu}>Grundstück</Link>
          <Link to="/collection" onClick={closeMenu}>Sammeln</Link>
          <Link to="/quests" onClick={closeMenu}>Quests</Link>
          <Link to="/statistics" onClick={closeMenu}>Statistik</Link>
          <Link to="/players" onClick={closeMenu}>Spieler</Link>
          <Link to="/guilds" onClick={closeMenu}>Gilden</Link>
          <Link to="/messages" className="navbar-messages desktop-messages" onClick={closeMenu}>
            📬
            {unreadCount > 0 && (
              <span className="message-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </Link>
          <div className="navbar-user">
            <Link to="/profile" className="navbar-username" onClick={closeMenu}>
              {user?.username}
            </Link>
            <span className={`role-badge role-${user?.role}`}>{user?.role}</span>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
