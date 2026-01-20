import { createContext, useContext } from 'react';
import useNotifications from '../hooks/useNotifications';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const notifications = useNotifications();

  return (
    <NotificationContext.Provider value={notifications}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within NotificationProvider');
  }
  return context;
}

export default NotificationContext;
