import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotificationContext } from '../context/NotificationContext';
import Logo from './Logo';
import './Navbar.css';

function Navbar() {
  const { user, logout } = useAuth();
  const { notify } = useNotificationContext();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [questCount, setQuestCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const prevUnreadCount = useRef(null); // null = not yet initialized
  const prevQuestCount = useRef(null);

  // Fetch unread message count and claimable quests
  useEffect(() => {
    const fetchCounts = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      try {
        // Fetch messages and quests in parallel
        const [messagesRes, questsRes] = await Promise.all([
          fetch('/api/messages/unread-count', {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch('/api/quests/claimable-count', {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        if (messagesRes.ok) {
          const data = await messagesRes.json();
          // Notify if new messages arrived (skip first load when prevUnreadCount is null)
          if (prevUnreadCount.current !== null && data.count > prevUnreadCount.current) {
            notify.message('Jemand', 'Du hast neue Nachrichten!');
          }
          prevUnreadCount.current = data.count;
          setUnreadCount(data.count);
        }
        if (questsRes.ok) {
          const data = await questsRes.json();
          // Notify if new quest is ready to claim (skip first load)
          if (prevQuestCount.current !== null && data.count > prevQuestCount.current) {
            notify.quest('Eine Quest ist abgeschlossen!');
          }
          prevQuestCount.current = data.count;
          setQuestCount(data.count);
        }
      } catch (err) {
        console.error('Error fetching counts:', err);
      }
    };

    if (user) {
      fetchCounts();
      // Poll every 30 seconds
      const interval = setInterval(fetchCounts, 30000);
      return () => clearInterval(interval);
    }
  }, [user, notify]);

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
          <Link to="/quests" className="navbar-quests" onClick={closeMenu}>
            Quests
            {questCount > 0 && (
              <span className="quest-badge">{questCount > 99 ? '99+' : questCount}</span>
            )}
          </Link>
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
