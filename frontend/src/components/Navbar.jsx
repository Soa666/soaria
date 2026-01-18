import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import './Navbar.css';

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

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

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/dashboard" className="navbar-brand">
          <Logo size="small" />
        </Link>
        <div className="navbar-links">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/map">Karte</Link>
          <Link to="/grundstueck">Grundstück</Link>
          <Link to="/collection">Sammeln</Link>
          <Link to="/inventory">Inventar</Link>
          <Link to="/players">Spieler</Link>
          <Link to="/guilds">Gilden</Link>
          <Link to="/messages" className="navbar-messages">
            📬
            {unreadCount > 0 && (
              <span className="message-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </Link>
          <div className="navbar-user">
            <Link to="/profile" className="navbar-username">
              {user?.username}
            </Link>
            <span className={`role-badge role-${user?.role}`}>{user?.role}</span>
            <button onClick={handleLogout} className="btn-logout">
              Abmelden
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
