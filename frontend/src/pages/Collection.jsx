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

  useEffect(() => {
    fetchStatus();
    // Poll status every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

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
              
              {status.is_completed ? (
                <div className="completed-banner">
                  <p className="completed-text">✅ Sammel-Auftrag abgeschlossen!</p>
                  <button 
                    className="btn btn-primary btn-large"
                    onClick={claimCollection}
                    disabled={loading}
                  >
                    {loading ? 'Lädt...' : 'Items abholen'}
                  </button>
                </div>
              ) : (
                <div className="time-remaining">
                  <p><strong>Verbleibende Zeit:</strong> {formatTime(status.time_remaining_minutes)}</p>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: `${((status.duration_minutes - status.time_remaining_minutes) / status.duration_minutes) * 100}%` 
                      }}
                    ></div>
                  </div>
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
