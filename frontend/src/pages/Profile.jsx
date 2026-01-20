import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import NotificationSettings from '../components/NotificationSettings';
import './Profile.css';

const getImageUrl = (imagePath) => {
  if (!imagePath) {
    return '/placeholder-item.png';
  }
  if (imagePath.startsWith('http')) {
    return imagePath;
  }
  // Check if it's a character path (contains character_)
  if (imagePath.includes('character_')) {
    return `/chars/${imagePath}`;
  }
  return `/items/${imagePath}`;
};

function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('info');
  const [availableImages, setAvailableImages] = useState([]);
  const [showImageSelector, setShowImageSelector] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    fetchProfile();
    fetchAvailableImages();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await api.get('/auth/profile');
      setProfile(response.data.user);
    } catch (error) {
      console.error('Fehler beim Laden des Profils:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableImages = async () => {
    try {
      const response = await api.get('/files/chars');
      setAvailableImages(response.data.images || []);
    } catch (error) {
      console.error('Fehler beim Laden der Character-Bilder:', error);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setMessage('');
    
    const formData = new FormData(e.target);
    const current_password = formData.get('current_password');
    const new_password = formData.get('new_password');
    const confirm_password = formData.get('confirm_password');

    if (new_password !== confirm_password) {
      setMessage('Neue Passwörter stimmen nicht überein');
      return;
    }

    try {
      const response = await api.post('/auth/change-password', {
        current_password,
        new_password
      });
      setMessage(response.data.message);
      e.target.reset();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Ändern des Passworts');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleAvatarSelect = async (imagePath) => {
    try {
      const response = await api.put('/auth/avatar', { avatar_path: imagePath });
      setMessage(response.data.message);
      setShowImageSelector(false);
      await fetchProfile();
      // Reload page to update navbar avatar
      window.location.reload();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Aktualisieren des Profilbilds');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  if (loading) {
    return <div className="container"><div className="loading">Lädt...</div></div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h1>👤 Profil</h1>
        
        {message && (
          <div className={message.includes('Fehler') ? 'error' : 'success'}>
            {message}
          </div>
        )}

        <div className="profile-tabs">
          <button
            className={`profile-tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            Informationen
          </button>
          <button
            className={`profile-tab ${activeTab === 'avatar' ? 'active' : ''}`}
            onClick={() => setActiveTab('avatar')}
          >
            Profilbild
          </button>
          <button
            className={`profile-tab ${activeTab === 'password' ? 'active' : ''}`}
            onClick={() => setActiveTab('password')}
          >
            Passwort ändern
          </button>
          <button
            className={`profile-tab ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            🔔 Benachrichtigungen
          </button>
        </div>

        <div className="profile-content">
          {activeTab === 'info' && profile && (
            <div className="profile-info">
              <div className="profile-avatar-large">
                {profile?.avatar_path?.includes('character_') ? (
                  <div className="sprite-avatar-container" style={{ 
                    width: '150px', 
                    height: '150px', 
                    borderRadius: '50%', 
                    border: '3px solid #d4af37',
                    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.5), 0 0 20px rgba(212, 175, 55, 0.3)'
                  }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      overflow: 'hidden',
                      transform: 'scale(4.6875)',
                      transformOrigin: 'center center'
                    }}>
                      <img
                        src={getImageUrl(profile.avatar_path)}
                        alt={profile.username}
                        style={{
                          width: '96px',
                          height: '128px',
                          objectFit: 'none',
                          objectPosition: '-32px 0px',
                          imageRendering: 'pixelated',
                          display: 'block'
                        }}
                        onError={(e) => {
                          e.target.src = '/placeholder-item.png';
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <img
                    src={getImageUrl(profile?.avatar_path)}
                    alt={profile.username}
                    className="avatar-image"
                    onError={(e) => {
                      e.target.src = '/placeholder-item.png';
                    }}
                  />
                )}
              </div>
              <div className="profile-details">
                <p><strong>Benutzername:</strong> {profile.username}</p>
                <p><strong>E-Mail:</strong> {profile.email}</p>
                <p><strong>Rolle:</strong> <span className={`role-badge role-${profile.role}`}>{profile.role}</span></p>
                <p><strong>Registriert am:</strong> {new Date(profile.created_at).toLocaleDateString('de-DE')}</p>
                {profile.last_login && (
                  <p><strong>Letzter Login:</strong> {new Date(profile.last_login).toLocaleString('de-DE')}</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'avatar' && (
            <div className="profile-avatar-section">
              <div className="current-avatar">
                <h3>Aktuelles Profilbild</h3>
                <div className="avatar-preview">
                  {profile?.avatar_path?.includes('character_') ? (
                    <div className="sprite-avatar-container" style={{ 
                      width: '200px', 
                      height: '200px', 
                      borderRadius: '50%', 
                      border: '4px solid #d4af37',
                      boxShadow: '0 6px 12px rgba(0, 0, 0, 0.5), 0 0 25px rgba(212, 175, 55, 0.4)'
                    }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        overflow: 'hidden',
                        transform: 'scale(6.25)',
                        transformOrigin: 'center center'
                      }}>
                        <img
                          src={getImageUrl(profile.avatar_path)}
                          alt="Profilbild"
                          style={{
                            width: '96px',
                            height: '128px',
                            objectFit: 'none',
                            objectPosition: '-32px 0px',
                            imageRendering: 'pixelated',
                            display: 'block'
                          }}
                          onError={(e) => {
                            e.target.src = '/placeholder-item.png';
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <img
                      src={getImageUrl(profile?.avatar_path)}
                      alt="Profilbild"
                      className="avatar-preview-image"
                      onError={(e) => {
                        e.target.src = '/placeholder-item.png';
                      }}
                    />
                  )}
                </div>
              </div>

              <div className="avatar-selector">
                <button
                  className="btn btn-primary"
                  onClick={() => setShowImageSelector(!showImageSelector)}
                >
                  {showImageSelector ? 'Auswahl schließen' : 'Profilbild auswählen'}
                </button>

                {showImageSelector && (
                  <div className="image-selector-container">
                    <h4>Verfügbare Bilder</h4>
                    {availableImages.length > 0 ? (
                      <div className="image-grid">
                        {availableImages.map((img, idx) => (
                          <div
                            key={idx}
                            className={`image-option ${profile?.avatar_path === img.path ? 'selected' : ''}`}
                            onClick={() => handleAvatarSelect(img.path)}
                            title={img.character_name || img.filename}
                          >
                            <div className="sprite-preview-container">
                              <div style={{
                                width: '32px',
                                height: '32px',
                                overflow: 'hidden',
                                transform: 'scale(2.5)',
                                transformOrigin: 'center center',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                <img
                                  src={getImageUrl(img.path)}
                                  alt={img.character_name || img.filename}
                                  style={{
                                    width: '96px',
                                    height: '128px',
                                    objectFit: 'none',
                                    objectPosition: '-32px 0px',
                                    imageRendering: 'pixelated',
                                    display: 'block'
                                  }}
                                  onError={(e) => {
                                    console.error('Bild konnte nicht geladen werden:', img.path);
                                    e.target.src = '/placeholder-item.png';
                                  }}
                                />
                              </div>
                            </div>
                            <span>{img.character_name || img.filename}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="no-images">Keine Character-Bilder gefunden.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'password' && (
            <div className="profile-password-section">
              <h3>Passwort ändern</h3>
              <form onSubmit={handlePasswordChange} className="password-change-form">
                <div className="form-group">
                  <label>Aktuelles Passwort</label>
                  <input
                    type="password"
                    name="current_password"
                    required
                    placeholder="Aktuelles Passwort eingeben"
                  />
                </div>
                <div className="form-group">
                  <label>Neues Passwort</label>
                  <input
                    type="password"
                    name="new_password"
                    required
                    minLength={6}
                    placeholder="Mindestens 6 Zeichen"
                  />
                </div>
                <div className="form-group">
                  <label>Neues Passwort bestätigen</label>
                  <input
                    type="password"
                    name="confirm_password"
                    required
                    minLength={6}
                    placeholder="Passwort wiederholen"
                  />
                </div>
                <button type="submit" className="btn btn-primary">
                  Passwort ändern
                </button>
              </form>
            </div>
          )}

          {activeTab === 'notifications' && (
            <NotificationSettings />
          )}
        </div>

        {/* Quick Links */}
        <div className="profile-links-section">
          <Link to="/statistics" className="btn btn-secondary">
            📊 Statistiken
          </Link>
          {profile?.role === 'admin' && (
            <Link to="/admin" className="btn btn-admin">
              🔧 Admin-Panel
            </Link>
          )}
        </div>

        {/* Logout Button */}
        <div className="logout-section">
          <button onClick={handleLogout} className="btn btn-logout">
            🚪 Abmelden
          </button>
        </div>
      </div>
    </div>
  );
}

export default Profile;
