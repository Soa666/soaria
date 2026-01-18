import { useState, useEffect } from 'react';
import api from '../services/api';

function Workbench() {
  const [workbench, setWorkbench] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchWorkbench();
    fetchInventory();
  }, []);

  const fetchWorkbench = async () => {
    try {
      const response = await api.get('/workbench');
      setWorkbench(response.data.workbench);
    } catch (error) {
      console.error('Fehler beim Laden der Werkbank:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory');
      setInventory(response.data.inventory);
    } catch (error) {
      console.error('Fehler beim Laden des Inventars:', error);
    }
  };

  const upgradeWorkbench = async () => {
    // Beispiel: Upgrade mit Steinen (kann später erweitert werden)
    const stoneItem = inventory.find(inv => inv.name === 'stein');
    if (!stoneItem || stoneItem.quantity < 10) {
      setMessage('Du brauchst mindestens 10 Steine zum Upgraden');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    try {
      // Hier müsste ein Upgrade-Item definiert werden, für jetzt verwenden wir Stein ID
      const response = await api.post('/workbench/upgrade', {
        upgrade_item_id: stoneItem.item_id,
        upgrade_item_quantity: 10
      });
      setMessage(response.data.message);
      setTimeout(() => setMessage(''), 3000);
      fetchWorkbench();
      fetchInventory();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Upgraden');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  if (loading) {
    return <div className="loading">Lädt...</div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Werkbank</h1>
        {message && <div className={message.includes('Fehler') ? 'error' : 'success'}>{message}</div>}
        
        {workbench && (
          <>
            <div className="workbench-info">
              <h2>Aktuelles Level: {workbench.level}</h2>
              <p>Höhere Werkbank-Levels ermöglichen das Craften von besseren Items.</p>
            </div>
            
            <div className="upgrade-section">
              <h3>Werkbank upgraden</h3>
              <p>Kosten: 10x Stein</p>
              {inventory.find(inv => inv.name === 'stein')?.quantity >= 10 ? (
                <button className="btn btn-primary" onClick={upgradeWorkbench}>
                  Upgraden
                </button>
              ) : (
                <p className="error">Nicht genug Steine (benötigt: 10)</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Workbench;
