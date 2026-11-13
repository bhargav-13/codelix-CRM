import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { notificationsDB } from '../lib/db';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user, isEmployee, employeeData, displayName, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Identify "who am I" for notification purposes: employees use their
  // employee id, partners use their display name (matches assignee shape
  // used across Tasks/Chat: { id, kind: 'partner' | 'employee' }).
  const me = isEmployee && employeeData?.id
    ? { kind: 'employee', id: employeeData.id }
    : (displayName ? { kind: 'partner', id: displayName } : null);   // full name, e.g. "Bhargav Thesiya" — same id tasks/chat use

  const refresh = useCallback(async () => {
    if (!me) { setNotifications([]); setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await notificationsDB.getFor(me.kind, me.id);
      setNotifications(rows);
    } catch (e) {
      console.error('notifications fetch:', e);
      setNotifications([]);
    }
    setLoading(false);
  }, [me?.kind, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [authLoading, refresh]);

  useEffect(() => {
    if (!me) return;
    const unsub = notificationsDB.subscribeFor(me.kind, me.id, (n) => {
      setNotifications(list => [n, ...list].slice(0, 50));
    });
    return unsub;
  }, [me?.kind, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadCount = notifications.filter(n => !n.read).length;

  async function markRead(id) {
    setNotifications(list => list.map(n => n.id === id ? { ...n, read: true } : n));
    try { await notificationsDB.markRead(id); } catch (e) { console.error(e); }
  }

  async function markAllRead() {
    if (!me) return;
    setNotifications(list => list.map(n => ({ ...n, read: true })));
    try { await notificationsDB.markAllRead(me.kind, me.id); } catch (e) { console.error(e); }
  }

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loading, markRead, markAllRead, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
