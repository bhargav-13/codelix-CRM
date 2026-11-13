/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { chat, toMessage, sameId, personKey } from '../lib/chat';
import { useAuth } from './AuthContext';

// App-wide chat state: who I am, unread counts, muted channels, who is online,
// and alerts for new messages while I'm elsewhere in the app.
const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { isPartner, isEmployee, employeeData, displayName, can } = useAuth();
  const canChat = isPartner || can('chat');
  const me = useMemo(() => isEmployee
    ? (employeeData?.id ? { kind: 'employee', id: employeeData.id, name: employeeData.name } : null)
    : (displayName ? { kind: 'partner', id: displayName, name: displayName } : null), [isEmployee, employeeData, displayName]);

  const [unread, setUnread] = useState({});        // channelId → { unread, mentions }
  const [muted, setMuted] = useState({});          // channelId → bool
  const [online, setOnline] = useState(new Set()); // personKey
  const activeRef = useRef(null);                  // channel open on screen
  const meRef = useRef(me);
  const mutedRef = useRef(muted);
  useEffect(() => { meRef.current = me; }, [me]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const refreshUnread = useCallback(async () => {
    if (!canChat || !me) return;
    try {
      const [u, reads] = await Promise.all([chat.unreadCounts(), chat.myReads()]);
      setUnread(u);
      const mine = {};
      reads.filter(r => r.member_kind === me.kind && String(r.member_id) === String(me.id)).forEach(r => { mine[r.channel_id] = r.muted; });
      setMuted(mine);
    } catch (e) { console.error('chat unread', e); }
  }, [canChat, me]);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  // new messages anywhere → badges + desktop alert
  useEffect(() => {
    if (!canChat || !me) return;
    const ch = supabase.channel('chat-global-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, ({ new: row }) => {
        const m = toMessage(row);
        const self = meRef.current;
        if (!self || sameId({ kind: m.senderKind, id: m.senderId }, self)) return;
        const visible = activeRef.current === m.channelId && document.visibilityState === 'visible';
        if (visible) { chat.markRead(m.channelId).catch(() => {}); return; }
        const mentioned = m.mentions.some(x => sameId(x, self));
        setUnread(u => ({ ...u, [m.channelId]: { unread: (u[m.channelId]?.unread || 0) + 1, mentions: (u[m.channelId]?.mentions || 0) + (mentioned ? 1 : 0) } }));
        if (!mutedRef.current[m.channelId] || mentioned) notifyDesktop(m, mentioned);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [canChat, me]);

  // who's online (private presence channel; only signed-in app users can join)
  useEffect(() => {
    if (!me) return;
    const ch = supabase.channel('presence:team', { config: { private: true, presence: { key: personKey(me) } } });
    ch.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .subscribe(status => { if (status === 'SUBSCRIBED') ch.track({ name: me.name, at: new Date().toISOString() }); });
    return () => { supabase.removeChannel(ch); };
  }, [me]);

  const totalUnread = Object.entries(unread).reduce((a, [id, v]) => a + (muted[id] ? 0 : v.unread || 0), 0);
  const totalMentions = Object.values(unread).reduce((a, v) => a + (v.mentions || 0), 0);

  // "(3) Codelix" in the browser tab
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = totalUnread ? `(${totalUnread}) ${base}` : base;
  }, [totalUnread]);

  const value = useMemo(() => ({
    me, canChat, unread, muted, online, totalUnread, totalMentions, refreshUnread,
    setActive: id => { activeRef.current = id; },
    markRead: async id => {
      setUnread(u => (u[id]?.unread ? { ...u, [id]: { unread: 0, mentions: 0 } } : u));
      try { await chat.markRead(id); } catch (e) { console.error(e); }
    },
    toggleMute: async id => {
      const next = !muted[id];
      setMuted(m => ({ ...m, [id]: next }));
      try { await chat.setMuted(id, next); } catch (e) { console.error(e); setMuted(m => ({ ...m, [id]: !next })); }
    },
    isOnline: p => online.has(personKey(p)),
  }), [me, canChat, unread, muted, online, totalUnread, totalMentions, refreshUnread]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

function notifyDesktop(m, mentioned) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && window.location.pathname.startsWith('/chat')) return;
    const body = m.deleted ? '' : (m.text || (m.attachments.length ? '📎 Attachment' : '')).slice(0, 140);
    const n = new Notification(mentioned ? `${m.senderName} mentioned you` : m.senderName, { body, tag: m.channelId });
    n.onclick = () => { window.focus(); window.location.href = `/chat?c=${m.channelId}`; };
  } catch { /* notifications unsupported */ }
}

export const useChat = () => useContext(ChatContext) || { me: null, canChat: false, unread: {}, muted: {}, online: new Set(), totalUnread: 0, totalMentions: 0, setActive() {}, markRead() {}, toggleMute() {}, isOnline: () => false, refreshUnread() {} };
