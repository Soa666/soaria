import { useState, useEffect } from 'react';
import api from '../services/api';
import './Inventory.css';

function Inventory() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory');
      setInventory(response.data.inventory || []);
    } catch (error) {
      console.error('Fehler beim Laden des Inventars:', error);
    } finally {
      setLoading(false);
    }
  };

  const getImageUrl = (imagePath) => {
    if (!imagePath) {
      return '/placeholder-item.png'; // Fallback-Bild
    }
    // Wenn der Pfad bereits eine URL ist, verwende ihn direkt
    if (imagePath.startsWith('http')) {
      return imagePath;
    }
    // Ansonsten, lade vom Server
    return `/items/${imagePath}`;
  };

  if (loading) {
    return <div className="loading">Lädt...</div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Inventar</h1>
        {inventory.length === 0 ? (
          <div className="inventory-empty">
            <p>Dein Inventar ist leer. Sammle Ressourcen im Dashboard oder starte einen Sammel-Auftrag!</p>
          </div>
        ) : (
          <div className="inventory-grid">
            {inventory.map((item) => (
              <div key={item.item_id} className="inventory-item">
                <div className="item-image-container">
                  <img
                    src={getImageUrl(item.image_path)}
                    alt={item.display_name}
                    className="item-image"
                    onError={(e) => {
                      e.target.src = '/placeholder-item.png';
                    }}
                  />
                  <div className="item-quantity-badge">{item.quantity}</div>
                </div>
                <div className="item-info">
                  <h3 className="item-name">{item.display_name}</h3>
                  <p className={`item-rarity rarity-${item.rarity}`}>{item.rarity}</p>
                  <p className="item-type">{item.type}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Inventory;
