import './Logo.css';

function Logo({ size = 'medium' }) {
  return (
    <div className={`logo logo-${size}`}>
      <div className="logo-icon">⚔️</div>
      <div className="logo-text">
        <span className="logo-main">Soaria</span>
        <span className="logo-subtitle">Fantasy RPG</span>
      </div>
    </div>
  );
}

export default Logo;
