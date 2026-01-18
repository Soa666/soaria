import { useState, useEffect } from 'react';
import api from '../services/api';
import './Collection.css';

const getImageUrl = (imagePath) => {
  if (!imagePath) {
    return '/placeholder-item.png';
  }
  if (imagePath.startsWith('http')) {
    return imagePath;
  }
  return `/items/${imagePath}`;
};

function Collection() {
  const [status, setStatus] = useState(null);
  const [duration, setDuration] = useState(60); // Default: 1 Stunde
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [items, setItems] = useState([]);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    fetchStatus();
    // Poll status every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Countdown timer - updates every second
  useEffect(() => {
    if (status?.active && !status?.is_completed && !status?.is_paused) {
      // Calculate remaining seconds from server data
      const completedAt = new Date(status.completed_at);
      const now = new Date();
      const remainingMs = completedAt.getTime() - now.getTime();
      const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));
      setCountdown(remainingSecs);

      // Countdown every second
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            fetchStatus(); // Refresh when done
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    } else if (status?.is_paused && status?.remaining_seconds) {
      setCountdown(status.remaining_seconds);
    }
  }, [status?.active, status?.is_completed, status?.is_paused, status?.completed_at]);

  const fetchStatus = async () => {
    try {
      const response = await api.get('/collection/status');
      setStatus(response.data);
    } catch (error) {
      console.error('Fehler beim Laden des Status:', error);
    }
  };

  const startCollection = async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await api.post('/collection/start', {
        duration_minutes: duration
      });
      setMessage(response.data.message);
      setTimeout(() => setMessage(''), 3000);
      fetchStatus();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Starten');
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const claimCollection = async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await api.post('/collection/claim');
      setMessage(response.data.message);
      setItems(response.data.items || []);
      setTimeout(() => setMessage(''), 5000);
      fetchStatus();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Abholen');
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes) => {
    if (minutes < 60) {
      return `${minutes} Minuten`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
      return `${hours} Stunde${hours > 1 ? 'n' : ''}`;
    }
    return `${hours} Stunde${hours > 1 ? 'n' : ''} ${mins} Minute${mins > 1 ? 'n' : ''}`;
  };

  const formatCountdown = (totalSeconds) => {
    if (totalSeconds <= 0) return '0:00';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container">
      <div className="card">
        <h1>Automatisches Sammeln</h1>
        {message && (
          <div className={message.includes('Fehler') ? 'error' : 'success'}>
            {message}
          </div>
        )}

        {status?.active ? (
          <div className="collection-active">
            <h2>Aktiver Sammel-Auftrag</h2>
            <div className="status-info">
              <p><strong>Dauer:</strong> {formatTime(status.duration_minutes)}</p>
              <p><strong>Gestartet:</strong> {new Date(status.started_at).toLocaleString('de-DE')}</p>
              <p><strong>Fertig um:</strong> {new Date(status.completed_at).toLocaleString('de-DE')}</p>
              
              {status.is_paused ? (
                <div className="paused-banner">
                  <p className="paused-text">⏸️ Sammeln pausiert!</p>
                  <p className="paused-info">Du bist nicht zu Hause. Kehre zurück um fortzufahren.</p>
                  <div className="countdown-display paused">
                    <span className="countdown-icon">⏱️</span>
                    <span className="countdown-time">{formatCountdown(countdown)}</span>
                  </div>
                </div>
              ) : status.is_completed || countdown <= 0 ? (
                <div className="completed-banner">
                  <p className="completed-text">✅ Sammel-Auftrag abgeschlossen!</p>
                  <button 
                    className="btn btn-primary btn-large"
                    onClick={claimCollection}
                    disabled={loading}
                  >
                    {loading ? 'Lädt...' : '✨ Items abholen'}
                  </button>
                </div>
              ) : (
                <div className="time-remaining">
                  <div className="countdown-display">
                    <span className="countdown-icon">⏱️</span>
                    <span className="countdown-time">{formatCountdown(countdown)}</span>
                  </div>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: `${Math.max(0, 100 - (countdown / (status.duration_minutes * 60)) * 100)}%` 
                      }}
                    ></div>
                  </div>
                  <p className="time-info">Fertig um {new Date(status.completed_at).toLocaleTimeString('de-DE')}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="collection-start">
            <h2>Neuen Sammel-Auftrag starten</h2>
            <p>Schicke deinen Charakter auf eine Sammel-Tour. Je länger die Dauer, desto mehr Items bekommst du!</p>
            
            <div className="duration-selector">
              <label>
                <strong>Dauer wählen:</strong>
              </label>
              <div className="duration-buttons">
                <button 
                  className={duration === 5 ? 'btn btn-secondary active' : 'btn btn-secondary'}
                  onClick={() => setDuration(5)}
                >
                  5 Min
                </button>
                <button 
                  className={duration === 15 ? 'btn btn-secondary active' : 'btn btn-secondary'}
                  onClick={() => setDuration(15)}
                >
                  15 Min
                </button>
                <button 
                  className={duration === 30 ? 'btn btn-secondary active' : 'btn btn-secondary'}
                  onClick={() => setDuration(30)}
                >
                  30 Min
                </button>
                <button 
                  className={duration === 60 ? 'btn btn-secondary active' : 'btn btn-secondary'}
                  onClick={() => setDuration(60)}
                >
                  1 Std
                </button>
                <button 
                  className={duration === 120 ? 'btn btn-secondary active' : 'btn btn-secondary'}
                  onClick={() => setDuration(120)}
                >
                  2 Std
                </button>
                <button 
                  className={duration === 240 ? 'btn btn-secondary active' : 'btn btn-secondary'}
                  onClick={() => setDuration(240)}
                >
                  4 Std
                </button>
                <button 
                  className={duration === 480 ? 'btn btn-secondary active' : 'btn btn-secondary'}
                  onClick={() => setDuration(480)}
                >
                  8 Std
                </button>
              </div>
              <p className="duration-info">
                Gewählte Dauer: <strong>{formatTime(duration)}</strong>
              </p>
            </div>

            <button 
              className="btn btn-primary btn-large"
              onClick={startCollection}
              disabled={loading}
            >
              {loading ? 'Startet...' : `Sammeln starten (${formatTime(duration)})`}
            </button>
          </div>
        )}

        {items.length > 0 && (
          <div className="collection-results">
            <h3>Abgeholte Items:</h3>
            <div className="collection-items-grid">
              {items.map((item, idx) => {
                console.log('Rendering item:', item);
                const imageUrl = getImageUrl(item.image_path);
                console.log('Image URL for item:', item.display_name, '=', imageUrl);
                return (
                  <div key={idx} className="collection-item-card">
                    <div className="item-image-container">
                      <img
                        src={imageUrl}
                        alt={item.display_name}
                        className="item-image"
                        onError={(e) => {
                          console.error('Bild konnte nicht geladen werden:', item.image_path, 'Item:', item, 'URL:', imageUrl);
                          e.target.src = '/placeholder-item.png';
                        }}
                        onLoad={() => {
                          console.log('Bild erfolgreich geladen:', imageUrl);
                        }}
                      />
                      <div className="item-quantity-badge">{item.quantity}x</div>
                    </div>
                    <div className="item-info">
                      <h3>{item.display_name}</h3>
                      <p className={`rarity-${item.rarity}`}>{item.rarity}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Collection;
