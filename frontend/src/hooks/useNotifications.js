import { useState, useEffect, useCallback } from 'react';

// Notification settings key in localStorage
const SETTINGS_KEY = 'notification_settings';

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  gathering: true,    // Sammeln fertig
  crafting: true,     // Craften fertig
  building: true,     // Bauen fertig
  messages: true,     // Neue Nachrichten
  quests: true,       // Quest abgeschlossen
  combat: true,       // Kampf-Ergebnisse
  travel: true,       // Reise beendet
};

export function useNotifications() {
  const [permission, setPermission] = useState('default');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [supported, setSupported] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    // Check if notifications are supported
    const isSupported = 'Notification' in window;
    setSupported(isSupported);

    if (isSupported) {
      setPermission(Notification.permission);
    }

    // Load saved settings
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch (e) {
        console.error('Error loading notification settings:', e);
      }
    }
  }, []);

  // Save settings to localStorage
  const updateSettings = useCallback((newSettings) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  }, [settings]);

  // Request permission
  const requestPermission = useCallback(async () => {
    if (!supported) {
      return 'unsupported';
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return 'denied';
    }
  }, [supported]);

  // Send a notification
  const sendNotification = useCallback((type, title, options = {}) => {
    // Check if supported and permission granted
    if (!supported || permission !== 'granted') {
      return false;
    }

    // Check if this type of notification is enabled
    if (!settings.enabled || !settings[type]) {
      return false;
    }

    // Don't send if tab is focused (user is already looking)
    if (document.hasFocus() && !options.force) {
      return false;
    }

    try {
      const notification = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: options.tag || type, // Prevents duplicate notifications
        renotify: options.renotify || false,
        silent: options.silent || false,
        ...options,
      });

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), options.duration || 5000);

      // Focus window on click
      notification.onclick = () => {
        window.focus();
        notification.close();
        if (options.onClick) {
          options.onClick();
        }
      };

      return true;
    } catch (error) {
      console.error('Error sending notification:', error);
      return false;
    }
  }, [supported, permission, settings]);

  // Convenience methods for specific notification types
  const notify = {
    gathering: (itemName, quantity) => sendNotification(
      'gathering',
      '⛏️ Sammeln abgeschlossen!',
      { body: `Du hast ${quantity}x ${itemName} gesammelt.`, tag: 'gathering' }
    ),
    
    crafting: (itemName, quantity = 1) => sendNotification(
      'crafting',
      '🔨 Herstellung abgeschlossen!',
      { body: `${quantity}x ${itemName} wurde hergestellt.`, tag: 'crafting' }
    ),
    
    building: (buildingName) => sendNotification(
      'building',
      '🏗️ Bau abgeschlossen!',
      { body: `${buildingName} wurde fertiggestellt.`, tag: 'building' }
    ),
    
    message: (senderName, subject) => sendNotification(
      'messages',
      '📬 Neue Nachricht!',
      { body: `${senderName}: ${subject}`, tag: `message-${Date.now()}`, renotify: true }
    ),
    
    quest: (questName) => sendNotification(
      'quests',
      '🎯 Quest abgeschlossen!',
      { body: `"${questName}" kann jetzt abgeholt werden!`, tag: 'quest' }
    ),
    
    combat: (result, monsterName) => sendNotification(
      'combat',
      result === 'win' ? '⚔️ Sieg!' : '💀 Niederlage',
      { body: result === 'win' ? `Du hast ${monsterName} besiegt!` : `${monsterName} hat dich besiegt.`, tag: 'combat' }
    ),
    
    travel: (destination) => sendNotification(
      'travel',
      '🚶 Angekommen!',
      { body: destination ? `Du bist bei ${destination} angekommen.` : 'Du hast dein Ziel erreicht.', tag: 'travel' }
    ),

    achievement: (achievementName) => sendNotification(
      'quests',
      '🏆 Erfolg freigeschaltet!',
      { body: achievementName, tag: 'achievement', renotify: true }
    ),

    // Generic notification
    custom: (title, body, type = 'quests') => sendNotification(
      type,
      title,
      { body, tag: `custom-${Date.now()}`, renotify: true }
    ),
  };

  return {
    supported,
    permission,
    settings,
    updateSettings,
    requestPermission,
    sendNotification,
    notify,
  };
}

export default useNotifications;
