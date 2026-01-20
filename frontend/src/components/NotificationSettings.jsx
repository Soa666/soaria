import { useNotificationContext } from '../context/NotificationContext';
import './NotificationSettings.css';

function NotificationSettings() {
  const { supported, permission, settings, updateSettings, requestPermission } = useNotificationContext();

  const handleToggle = (key) => {
    updateSettings({ [key]: !settings[key] });
  };

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (result === 'denied') {
      alert('Benachrichtigungen wurden blockiert. Bitte erlaube sie in den Browser-Einstellungen.');
    }
  };

  if (!supported) {
    return (
      <div className="notification-settings">
        <h3>🔔 Benachrichtigungen</h3>
        <p className="not-supported">
          ⚠️ Dein Browser unterstützt keine Desktop-Benachrichtigungen.
        </p>
      </div>
    );
  }

  return (
    <div className="notification-settings">
      <h3>🔔 Benachrichtigungen</h3>
      
      {permission !== 'granted' ? (
        <div className="permission-request">
          <p>Erhalte Desktop-Benachrichtigungen wenn im Spiel etwas passiert!</p>
          {permission === 'denied' ? (
            <p className="permission-denied">
              ❌ Benachrichtigungen wurden blockiert. Bitte erlaube sie in den Browser-Einstellungen.
            </p>
          ) : (
            <button className="btn-enable" onClick={handleRequestPermission}>
              🔔 Benachrichtigungen aktivieren
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="setting-item main-toggle">
            <label>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={() => handleToggle('enabled')}
              />
              <span className="toggle-label">
                <strong>Benachrichtigungen aktiviert</strong>
                <small>Globaler Schalter für alle Benachrichtigungen</small>
              </span>
            </label>
          </div>

          <div className={`settings-list ${!settings.enabled ? 'disabled' : ''}`}>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={settings.gathering}
                  onChange={() => handleToggle('gathering')}
                  disabled={!settings.enabled}
                />
                <span className="toggle-label">
                  <span>⛏️ Sammeln abgeschlossen</span>
                </span>
              </label>
            </div>

            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={settings.crafting}
                  onChange={() => handleToggle('crafting')}
                  disabled={!settings.enabled}
                />
                <span className="toggle-label">
                  <span>🔨 Herstellung abgeschlossen</span>
                </span>
              </label>
            </div>

            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={settings.building}
                  onChange={() => handleToggle('building')}
                  disabled={!settings.enabled}
                />
                <span className="toggle-label">
                  <span>🏗️ Bau abgeschlossen</span>
                </span>
              </label>
            </div>

            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={settings.messages}
                  onChange={() => handleToggle('messages')}
                  disabled={!settings.enabled}
                />
                <span className="toggle-label">
                  <span>📬 Neue Nachrichten</span>
                </span>
              </label>
            </div>

            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={settings.quests}
                  onChange={() => handleToggle('quests')}
                  disabled={!settings.enabled}
                />
                <span className="toggle-label">
                  <span>🎯 Quest abgeschlossen</span>
                </span>
              </label>
            </div>

            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={settings.travel}
                  onChange={() => handleToggle('travel')}
                  disabled={!settings.enabled}
                />
                <span className="toggle-label">
                  <span>🚶 Reise beendet</span>
                </span>
              </label>
            </div>
          </div>

          <p className="info-text">
            💡 Benachrichtigungen erscheinen nur wenn das Spiel nicht im Fokus ist.
          </p>
        </>
      )}
    </div>
  );
}

export default NotificationSettings;
