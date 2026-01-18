import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import './Navbar.css';

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
          <Link to="/crafting">Crafting</Link>
          {user?.role === 'admin' && (
            <Link to="/admin">Admin</Link>
          )}
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
