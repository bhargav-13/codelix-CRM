/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { realtime } from '../lib/realtime';
import { chat, toMessage, sameId, personKey } from '../lib/chat';
import { useAuth } from './AuthContext';
import { useToast } from '../components/ui/kit';

// App-wide chat state: who I am, unread counts, muted channels, who is online,
// and alerts for new messages while I'm elsewhere in the app.
const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { isPartner, person, can } = useAuth();
  const toast = useToast();
  const canChat = isPartner || can('chat');

  // `me` is rebuilt only when one of these primitives changes — auth refreshes
  // hand out new objects with the same content, and effects below (and the
  // chat page) must not restart because of that.
  const myKind = person?.kind ?? null, myId = person?.id ?? null, myName = person?.name ?? null;
  const me = useMemo(() => (myKind && myId != null ? { kind: myKind, id: myId, name: myName || '' } : null), [myKind, myId, myName]);
  const meKey = me ? personKey(me) : null;

  const [unread, setUnread] = useState({});        // channelId → { unread, mentions }
  const [muted, setMuted] = useState({});          // channelId → bool
  const [online, setOnline] = useState(() => new Set()); // personKey
  const activeRef = useRef(null);                  // channel open on screen
  const meRef = useRef(me);
  const mutedRef = useRef(muted);
  useEffect(() => { meRef.current = me; }, [me]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // Latest request wins, so a slow response can never overwrite a newer one.
  const unreadSeq = useRef(0);
  const refreshUnread = useCallback(async () => {
    const self = meRef.current;
    if (!canChat || !self) return;
    const seq = ++unreadSeq.current;
    try {
      const [u, reads] = await Promise.all([chat.unreadCounts(), chat.myReads()]);
      if (seq !== unreadSeq.current) return;
      setUnread(u);
      const mine = {};
      reads.forEach(r => { mine[r.channelId] = !!r.muted; });
      setMuted(mine);
    } catch (e) { console.error('chat unread', e); }
  }, [canChat]);

  useEffect(() => { if (meKey) refreshUnread(); }, [meKey, refreshUnread]);

  // The one live connection: open while a person who may chat is signed in.
  useEffect(() => {
    if (!canChat || !meKey) return;
    realtime.connect();
    return () => { realtime.disconnect(); setOnline(new Set()); };
  }, [canChat, meKey]);

  // new messages anywhere → badges + desktop alert
  useEffect(() => {
    if (!canChat || !meKey) return;
    const offMessage = realtime.on('message.new', frame => {
      if (!frame.data) return;
      const m = toMessage(frame.data);
      const self = meRef.current;
      if (!self || sameId({ kind: m.senderKind, id: m.senderId }, self)) return;
      const visible = activeRef.current === m.channelId && document.visibilityState === 'visible';
      if (visible) { chat.markRead(m.channelId).catch(() => {}); return; }
      const mentioned = m.mentions.some(x => sameId(x, self));
      setUnread(u => ({ ...u, [m.channelId]: { unread: (u[m.channelId]?.unread || 0) + 1, mentions: (u[m.channelId]?.mentions || 0) + (mentioned ? 1 : 0) } }));
      if (!mutedRef.current[m.channelId] || mentioned) notifyDesktop(m, mentioned);
    });
    // Messages may have been missed while the socket was down, so the counts are
    // re-read from the server. (When the chat page is open it runs its own, fuller catch-up.)
    const offReconnect = realtime.onReconnect(() => { if (!activeRef.current) refreshUnread(); });
    return () => { offMessage(); offReconnect(); };
  }, [canChat, meKey, refreshUnread]);

  // Back on the tab after it was hidden (phones suspend the socket) → re-read counts.
  useEffect(() => {
    if (!canChat || !meKey) return;
    const onVisible = () => { if (document.visibilityState === 'visible' && !activeRef.current) refreshUnread(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [canChat, meKey, refreshUnread]);

  // who's online: the server sends the whole list ("partner:<id>", "employee:<id>") whenever it changes
  useEffect(() => {
    if (!meKey) return;
    const offPresence = realtime.on('presence', frame => setOnline(new Set(frame.data?.online || [])));
    // a closed socket knows nothing about who is online
    const offStatus = realtime.onStatus(s => { if (s === 'closed') setOnline(new Set()); });
    return () => { offPresence(); offStatus(); };
  }, [meKey]);

  const totalUnread = Object.entries(unread).reduce((a, [id, v]) => a + (muted[id] ? 0 : v.unread || 0), 0);
  const totalMentions = Object.values(unread).reduce((a, v) => a + (v.mentions || 0), 0);

  // "(3) Codelix" in the browser tab
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = totalUnread ? `(${totalUnread}) ${base}` : base;
  }, [totalUnread]);

  // Stable callbacks: the chat page keeps them in effect dependency lists.
  const setActive = useCallback(id => { activeRef.current = id; }, []);
  const markRead = useCallback(async id => {
    if (!id) return;
    setUnread(u => (u[id]?.unread || u[id]?.mentions ? { ...u, [id]: { unread: 0, mentions: 0 } } : u));
    try { await chat.markRead(id); } catch (e) { console.error('chat mark read', e); }
  }, []);
  const toggleMute = useCallback(async id => {
    const next = !mutedRef.current[id];
    setMuted(m => ({ ...m, [id]: next }));
    try { await chat.setMuted(id, next); }
    catch (e) { setMuted(m => ({ ...m, [id]: !next })); toast.error(next ? 'Could not mute this conversation' : 'Could not unmute this conversation', e); }
  }, [toast]);
  const isOnline = useCallback(p => !!p && online.has(personKey(p)), [online]);

  const value = useMemo(() => ({
    me, canChat, unread, muted, online, totalUnread, totalMentions, refreshUnread, setActive, markRead, toggleMute, isOnline,
  }), [me, canChat, unread, muted, online, totalUnread, totalMentions, refreshUnread, setActive, markRead, toggleMute, isOnline]);

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

const FALLBACK = { me: null, canChat: false, unread: {}, muted: {}, online: new Set(), totalUnread: 0, totalMentions: 0, setActive() {}, markRead: async () => {}, toggleMute: async () => {}, isOnline: () => false, refreshUnread: async () => {} };
export const useChat = () => useContext(ChatContext) || FALLBACK;
