import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { notificationsDB } from '../lib/db';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);
const POLL_MS = 30000;

export function NotificationProvider({ children }) {
  const { me, hasAccess, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  // The server works out "who am I" from the login; this only tells us when that changed.
  const meId = hasAccess ? me?.id ?? null : null;
  const seq = useRef(0);

  // quiet = background poll: no spinner, and a failure keeps what is on screen
  const refresh = useCallback(async ({ quiet = false } = {}) => {
    const run = ++seq.current;
    if (!meId) { setNotifications([]); setLoading(false); return; }
    if (!quiet) setLoading(true);
    try {
      const rows = await notificationsDB.getFor(30);
      if (run === seq.current) setNotifications(rows);
    } catch (e) {
      console.error('notifications fetch:', e);
      if (!quiet && run === seq.current) setNotifications([]);
    }
    if (run === seq.current) setLoading(false);
  }, [meId]);

  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [authLoading, refresh]);

  // New notifications: checked every 30 s while the tab is visible, and when it comes back.
  useEffect(() => {
    if (!meId) return;
    const tick = () => { if (document.visibilityState === 'visible') refresh({ quiet: true }); };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); };
  }, [meId, refresh]);

  const unreadCount = notifications.filter(n => !n.read).length;

  async function markRead(id) {
    seq.current++;   // a poll already on its way must not bring the unread state back
    setNotifications(list => list.map(n => n.id === id ? { ...n, read: true } : n));
    try { await notificationsDB.markRead(id); } catch (e) { console.error(e); }
  }

  async function markAllRead() {
    if (!meId) return;
    seq.current++;
    setNotifications(list => list.map(n => ({ ...n, read: true })));
    try { await notificationsDB.markAllRead(); } catch (e) { console.error(e); }
  }

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loading, markRead, markAllRead, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
