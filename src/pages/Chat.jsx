import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast, Drawer, Field, Chips, SkeletonRows, EmptyPanel, ErrorPanel, Avatar } from '../components/ui/kit';
import { realtime } from '../lib/realtime';
import { notificationsDB } from '../lib/db';
import { uploadFile, useFileUrls } from '../lib/files';
import { usePeople, roleLabel } from '../lib/people';
import {
  chat, toMessage, toChannel, toReaction, toRead, sameId, personKey, colorFor, fmtTime, fmtDay, fmtListTime,
  extractMentions, formatSegments, QUICK_REACTIONS, EMOJIS, PAGE,
} from '../lib/chat';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import {
  Send, Paperclip, Users, X, Trash2, UserPlus, MessageSquare, FileText, Loader2, Check, CheckCheck, Search,
  Smile, Reply, Pencil, Pin, PinOff, Copy, BellOff, Bell, Info, ArrowLeft, ArrowDown, LogOut, Plus, AlertCircle,
  MoreHorizontal, UserX,
} from 'lucide-react';
import './Chat.css';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const MAX_FILE = 20 * 1024 * 1024;

const senderOf = m => ({ kind: m.senderKind, id: m.senderId });
const isCoarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
const sortChannels = cs => [...cs].sort((a, b) => new Date(b.lastMessageAt || b.createdAt || 0) - new Date(a.lastMessageAt || a.createdAt || 0));
const previewOf = m => m.deleted ? 'This message was deleted' : m.text || (m.attachments.length ? '📎 Attachment' : '');

// One message = one key, whether it is still the local optimistic copy or the saved row.
const msgKey = m => (m.clientId ? `c:${m.clientId}` : `i:${m.id}`);
// Add / replace rows by key, oldest → newest. Used for every merge, so a page
// that arrives twice (or a row that arrives by fetch and by realtime) never duplicates.
function mergeMessages(list, incoming) {
  const map = new Map(list.map(m => [msgKey(m), m]));
  for (const m of incoming) map.set(msgKey(m), m);
  // unsent local messages stay at the end whatever this device's clock says
  return [...map.values()].sort((a, b) => (a.status ? 1 : 0) - (b.status ? 1 : 0) || new Date(a.createdAt) - new Date(b.createdAt));
}
// Fold a freshly fetched "latest page" into what is already on screen.
function withLatest(cur, latest) {
  const full = latest.length === PAGE;
  if (!cur?.list.length) return { list: latest, hasMore: full };
  const known = new Set(cur.list.map(msgKey));
  if (!latest.length || latest.some(m => known.has(msgKey(m)))) return { list: mergeMessages(cur.list, latest), hasMore: cur.hasMore };
  // More than a page was missed: the old history no longer joins up, so start
  // again from the latest page (keeping anything of mine that is still unsent).
  return { list: mergeMessages(cur.list.filter(m => m.status), latest), hasMore: full };
}

// Unsent drafts per conversation, kept for the life of the tab.
const DRAFTS = new Map();       // `${meKey}|${channelId}` → { text, files, replyTo }
// Files already uploaded for a message that then failed to send — Retry reuses these.
const UPLOADED = new WeakMap(); // File → { id, name, url, type, size }

// On phones the on-screen keyboard covers the bottom of the layout viewport.
// Shrink the chat to the visible part so the composer stays above the keyboard.
function useKeyboardFit(onChange) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !isCoarse()) return;
    const apply = () => {
      const el = document.querySelector('.chat-root');
      if (!el) return;
      const open = window.innerHeight - vv.height > 120;
      el.style.height = open ? `${Math.round(vv.height - Math.max(0, el.getBoundingClientRect().top))}px` : '';
      if (open) window.scrollTo(0, 0);
      onChange();
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      const el = document.querySelector('.chat-root');
      if (el) el.style.height = '';
    };
  }, [onChange]);
}

export default function Chat() {
  const { isPartner, can } = useAuth();
  const toast = useToast();
  const { me, unread, muted, totalUnread, markRead, refreshUnread, setActive, toggleMute, isOnline } = useChat();
  const meKey = me ? personKey(me) : null;
  const canStart = isPartner || can('chat', 'create');
  const coarse = useMemo(isCoarse, []);

  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const activeId = params.get('c');

  // everyone I can chat with: partners + active employees, from the shared directory
  const { people: directory } = usePeople();
  const people = useMemo(() => directory.filter(p => p.active !== false).map(p => ({ id: p.id, name: p.name, kind: p.kind, role: roleLabel(p) })), [directory]);
  const [channels, setChannels] = useState([]);
  const [load, setLoad] = useState({ status: 'loading', error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [msgs, setMsgs] = useState({});              // channelId → { list, hasMore }
  const [quotedExtra, setQuotedExtra] = useState([]); // replied-to messages outside the loaded pages
  const [reactions, setReactions] = useState([]);    // active channel
  const [reads, setReads] = useState([]);            // active channel: read markers
  const [pins, setPins] = useState([]);              // active channel: every pinned message
  const [typing, setTyping] = useState({});          // personKey → { name, until }
  const [thread, setThread] = useState({ loading: false, error: null });
  const [openTick, setOpenTick] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [files, setFiles] = useState([]);            // { file, url }
  const [composeKey, setComposeKey] = useState(null); // which conversation the composer's content belongs to
  const [preEdit, setPreEdit] = useState('');        // what was typed before "Edit" replaced it
  const [dragOver, setDragOver] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menu, setMenu] = useState(null);            // { id, rect } — message whose action menu is open
  const [showNew, setShowNew] = useState(false);
  const [info, setInfo] = useState(null);            // null | 'about' | 'pins' | 'files'
  const [confirm, setConfirm] = useState(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const [firstUnreadId, setFirstUnreadId] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [notifPerm, setNotifPerm] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const emojiRef = useRef(null);
  const typingSent = useRef(0);
  const atBottomRef = useRef(true);
  const wantBottom = useRef(false);   // scroll to the end after the next list render
  const keepFrom = useRef(null);      // { h, top } — hold position after older messages are prepended
  const pendingJump = useRef(null);   // message id to scroll to once its conversation has loaded
  const shownId = useRef(null);       // conversation the scroller is currently showing
  const olderBusy = useRef(false);
  const resyncBusy = useRef(false);
  const closing = useRef(null);

  // Latest values for callbacks that must not be re-created (realtime handlers).
  const meRef = useRef(me);
  const activeIdRef = useRef(activeId);
  const channelsRef = useRef(channels);
  const msgsRef = useRef(msgs);
  const unreadRef = useRef(unread);
  const composeRef = useRef({ text: '', editing: null });
  const pushedRef = useRef(false);
  useEffect(() => {
    meRef.current = me; activeIdRef.current = activeId; channelsRef.current = channels; msgsRef.current = msgs; unreadRef.current = unread;
    composeRef.current = { text, editing };
    pushedRef.current = !!location.state?.chatPushed;
  });

  const isMine = useCallback(c => (c.members || []).some(m => sameId(m, meRef.current)), []);
  const active = channels.find(c => c.id === activeId) || null;
  const list = useMemo(() => msgs[activeId]?.list || [], [msgs, activeId]);
  const hasMore = !!msgs[activeId]?.hasMore;

  // ── navigation: opening from the list adds ONE history entry; switching
  //    between conversations replaces it, so Back always returns to the list.
  const openChat = useCallback(id => {
    if (!id || id === activeIdRef.current) return;
    const switching = !!activeIdRef.current;
    setParams({ c: id }, { replace: switching, state: { chatPushed: switching ? pushedRef.current : true } });
  }, [setParams]);
  const closeChat = useCallback(() => {
    const id = activeIdRef.current;
    if (!id || closing.current === id) return;
    closing.current = id;
    if (pushedRef.current) navigate(-1); else setParams({}, { replace: true });
  }, [navigate, setParams]);
  useEffect(() => { closing.current = null; }, [activeId]);

  // ── load people + my conversations ──────────────────────────────
  useEffect(() => {
    if (!meKey) return;
    let off = false;
    (async () => {
      try {
        const chans = await chat.channels();
        if (off) return;
        setChannels(sortChannels(chans.filter(isMine)));
        setLoad({ status: 'ready', error: null });
      } catch (e) { if (!off) setLoad({ status: 'error', error: e }); }
    })();
    return () => { off = true; };
  }, [meKey, reloadKey, isMine]);

  // tell the app-wide context which conversation is on screen
  useEffect(() => { setActive(activeId); return () => setActive(null); }, [activeId, setActive]);

  // a conversation I was removed from (or a stale link) → back to the list
  useEffect(() => {
    if (load.status !== 'ready' || !activeId || active || closing.current === activeId) return;
    toast.info('That conversation is no longer available');
    closeChat();
  }, [load.status, activeId, active, closeChat, toast]);

  // ── drafts: restored on entering a conversation, remembered as you type ─
  // Keyed on the conversation id and on WHO I am (a string) — never on the `me`
  // object, whose identity can change without anything really changing.
  const draftKey = activeId && meKey ? `${meKey}|${activeId}` : null;
  if (draftKey && composeKey !== draftKey) {
    // a different conversation is now open: swap the composer over to its draft (during render, so there is no flash of the old text)
    const d = DRAFTS.get(draftKey);
    setComposeKey(draftKey);
    setText(d?.text || ''); setFiles(d?.files || []); setReplyTo(d?.replyTo || null);
    setEditing(null); setPreEdit(''); setEmojiOpen(false);
  }
  useEffect(() => {
    if (!draftKey || composeKey !== draftKey) return;
    const body = editing ? preEdit : text;
    if (body.trim() || files.length || replyTo) DRAFTS.set(draftKey, { text: body, files, replyTo });
    else DRAFTS.delete(draftKey);
  }, [composeKey, draftKey, text, files, replyTo, editing, preEdit]);

  // ── open a conversation: messages, reactions, read markers, pins ─
  useEffect(() => {
    if (!activeId || !meKey) return;
    let off = false;
    const unreadNow = unreadRef.current[activeId]?.unread || 0;
    const cached = !!msgsRef.current[activeId];
    setNewBelow(0); setFirstUnreadId(null); setMenu(null); setReactions([]); setReads([]); setPins([]); setQuotedExtra([]);
    setThread({ loading: !cached, error: null });
    atBottomRef.current = true; setAtBottom(true);
    (async () => {
      try {
        const [m, r, rd] = await Promise.all([chat.messages(activeId), chat.reactions(activeId), chat.reads(activeId)]);
        if (off) return;
        const self = meRef.current;
        const jump = pendingJump.current; pendingJump.current = null;
        if (!jump) wantBottom.current = true;
        setMsgs(x => ({ ...x, [activeId]: withLatest(x[activeId], m) }));
        setReactions(r); setReads(rd);
        if (unreadNow) {
          const others = m.filter(x => !sameId(senderOf(x), self) && !x.deleted);
          setFirstUnreadId(others[Math.max(0, others.length - unreadNow)]?.id || null);
        }
        setThread({ loading: false, error: null });
        if (jump) requestAnimationFrame(() => jumpTo(jump));
        const missing = [...new Set(m.map(x => x.replyTo).filter(id => id && !m.some(y => y.id === id)))];
        if (missing.length) chat.messagesById(missing).then(extra => { if (!off) setQuotedExtra(extra); }).catch(() => {});
        chat.pinned(activeId).then(p => { if (!off) setPins(p); }).catch(() => {});
        markRead(activeId);   // only once the messages are actually on screen
      } catch (e) {
        if (off) return;
        setThread({ loading: false, error: e });
        if (cached) toast.error('Could not refresh this conversation', e);
      }
    })();
    return () => { off = true; };
  }, [activeId, meKey, openTick, markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── catch up after a gap (socket reconnect, or the tab was hidden) ─
  // Order matters: fetch the list, the counts and the open conversation's
  // latest page first, and mark it read only after those are on screen.
  const resync = useCallback(async () => {
    if (!meRef.current || resyncBusy.current) return;
    resyncBusy.current = true;
    const id = activeIdRef.current;
    const withThread = !!id && !!msgsRef.current[id];
    try {
      const [chans, latest, rx, rd] = await Promise.all([
        chat.channels(),
        withThread ? chat.messages(id) : null,
        withThread ? chat.reactions(id) : null,
        withThread ? chat.reads(id) : null,
        refreshUnread(),
      ]);
      setChannels(sortChannels(chans.filter(isMine)));
      if (withThread && activeIdRef.current === id) {
        const self = meRef.current;
        const known = new Set((msgsRef.current[id]?.list || []).map(msgKey));
        const fresh = latest.filter(m => !known.has(msgKey(m)) && !sameId(senderOf(m), self) && !m.deleted);
        const stay = atBottomRef.current && document.visibilityState === 'visible';
        if (stay) wantBottom.current = true;
        setMsgs(x => ({ ...x, [id]: withLatest(x[id], latest) }));
        setReactions(rx); setReads(rd);
        if (fresh.length) {
          setFirstUnreadId(cur => cur || fresh[0].id);
          if (!stay) setNewBelow(n => n + fresh.length);
        }
        if (stay) markRead(id);
      }
    } catch (e) { console.error('chat catch-up', e); /* still offline — the next reconnect tries again */ }
    finally { resyncBusy.current = false; }
  }, [refreshUnread, markRead, isMine]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') resync(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', resync);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', resync); };
  }, [resync]);

  // ── realtime: messages, channels, reactions, read markers ────────
  // Frames come from the app-wide socket (opened by ChatContext). Depends on the
  // string meKey only, so the handlers are registered once per signed-in person
  // and always removed on cleanup.
  useEffect(() => {
    if (!meKey) return;
    const onMessage = isNew => frame => {
      if (!frame.data?.id) return;
      const m = toMessage(frame.data);
      // keep the conversation list's preview and order in step with the newest message
      if (isNew) {
        const preview = (m.text || '').trim().slice(0, 80) || (m.attachments?.length ? '📎 Attachment' : '');
        setChannels(cs => (cs.some(c => c.id === m.channelId)
          ? sortChannels(cs.map(c => (c.id === m.channelId ? { ...c, lastMessageAt: m.createdAt, lastMessagePreview: preview || c.lastMessagePreview } : c)))
          : cs));
      }
      setMsgs(x => {
        const cur = x[m.channelId];
        if (!cur) return x;
        const key = msgKey(m);
        if (!isNew && cur.hasMore && cur.list.length && !cur.list.some(y => msgKey(y) === key)
          && new Date(m.createdAt) < new Date(cur.list[0].createdAt)) return x;   // change to a message older than what is loaded
        return { ...x, [m.channelId]: { ...cur, list: mergeMessages(cur.list, [m]) } };
      });
      if (m.channelId !== activeIdRef.current) return;
      setPins(ps => { const rest = ps.filter(p => p.id !== m.id); return m.pinned && !m.deleted ? [m, ...rest] : rest; });
      if (isNew && !sameId(senderOf(m), meRef.current)) {
        setTyping(t => { const n = { ...t }; delete n[`${m.senderKind}:${m.senderId}`]; return n; });
        if (atBottomRef.current && document.visibilityState === 'visible') wantBottom.current = true;
        else { setNewBelow(n => n + 1); setFirstUnreadId(cur => cur || m.id); }
      }
    };
    // a deleted message arrives either as the whole (now empty) message or as just its id
    const onDeleted = frame => {
      const id = frame.data?.id;
      if (!id) return;
      if (frame.data.senderId != null) { onMessage(false)({ ...frame, data: { ...frame.data, deleted: true, text: '', attachments: [] } }); return; }
      const gone = y => (y.id === id ? { ...y, deleted: true, text: '', attachments: [], pinned: false } : y);
      setMsgs(x => (frame.channelId && x[frame.channelId] ? { ...x, [frame.channelId]: { ...x[frame.channelId], list: x[frame.channelId].list.map(gone) } } : x));
      setPins(ps => ps.filter(p => p.id !== id));
    };
    const offs = [
      realtime.on('message.new', onMessage(true)),
      realtime.on('message.updated', onMessage(false)),
      realtime.on('message.deleted', onDeleted),
      realtime.on('channel.updated', frame => {
        if (!frame.data?.id) return;
        const c = toChannel(frame.data);
        setChannels(cs => {
          const without = cs.filter(x => x.id !== c.id);
          return isMine(c) ? sortChannels([c, ...without]) : without;
        });
      }),
      realtime.on('channel.deleted', frame => {
        const id = frame.data?.id || frame.channelId;
        if (id) setChannels(cs => cs.filter(c => c.id !== id));
      }),
      realtime.on('reaction.added', frame => {
        const r = frame.data;
        if (!r?.id || (r.channelId || frame.channelId) !== activeIdRef.current) return;
        setReactions(rs => (rs.some(x => x.id === r.id) ? rs : [...rs, toReaction(r)]));
      }),
      realtime.on('reaction.removed', frame => {
        const id = frame.data?.id;
        if (id) setReactions(rs => rs.filter(r => r.id !== id));
      }),
      realtime.on('read.updated', frame => {
        if (!frame.data || frame.channelId !== activeIdRef.current) return;
        const r = toRead(frame.data);
        if (r.id == null) return;
        setReads(rs => [...rs.filter(x => !sameId(x, r)), r]);
      }),
      realtime.on('typing', frame => {
        const p = frame.data;
        if (!p?.id || frame.channelId !== activeIdRef.current || sameId(p, meRef.current)) return;
        setTyping(t => ({ ...t, [`${p.kind}:${p.id}`]: { name: p.name || 'Someone', until: Date.now() + 4000 } }));
      }),
      // the socket came back after a gap: frames were missed, so catch up from the server
      realtime.onReconnect(() => resync()),
    ];
    return () => offs.forEach(off => off());
  }, [meKey, isMine, resync]);

  // typing indicator: cleared when the conversation changes; sent at most every 2.5 s
  useEffect(() => () => setTyping({}), [activeId, meKey]);
  useEffect(() => {
    const i = setInterval(() => setTyping(t => { const now = Date.now(); const n = Object.fromEntries(Object.entries(t).filter(([, v]) => v.until > now)); return Object.keys(n).length === Object.keys(t).length ? t : n; }), 1500);
    return () => clearInterval(i);
  }, []);
  function signalTyping() {
    if (!activeId || !me || Date.now() - typingSent.current < 2500) return;
    if (realtime.send({ type: 'typing', channelId: activeId })) typingSent.current = Date.now();
  }

  // message search (server side, only my conversations)
  useEffect(() => {
    const term = q.trim();
    const t = setTimeout(() => {
      if (term.length < 2) { setFound([]); return; }
      chat.search(term).then(r => setFound(r.filter(x => channelsRef.current.some(c => c.id === x.channelId)))).catch(() => setFound([]));
    }, term.length < 2 ? 0 : 300);
    return () => clearTimeout(t);
  }, [q]);

  // close the emoji picker on an outside press
  useEffect(() => {
    if (!emojiOpen) return;
    const close = e => { if (!emojiRef.current?.contains(e.target)) setEmojiOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [emojiOpen]);

  // ── scrolling ────────────────────────────────────────────────────
  const stickToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, []);
  useKeyboardFit(stickToBottom);

  // After a render that changed the list: land at the end (open / send / new
  // message while at the end) or hold position (older page prepended).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (shownId.current !== activeId) { shownId.current = activeId; keepFrom.current = null; if (!pendingJump.current) wantBottom.current = true; }
    if (keepFrom.current) { el.scrollTop = el.scrollHeight - keepFrom.current.h + keepFrom.current.top; keepFrom.current = null; }
    if (wantBottom.current) { wantBottom.current = false; atBottomRef.current = true; el.scrollTop = el.scrollHeight; }
  }, [list, thread.loading, load.status, activeId]);

  function scrollToBottom(smooth) {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewBelow(0);
  }
  function onScroll(e) {
    const el = e.currentTarget;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = bottom;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (bottom && (newBelow || unread[activeId]?.unread)) { setNewBelow(0); markRead(activeId); }
    if (el.scrollTop < 80) loadOlder();
  }
  // The ref guard makes a second call (scroll events arrive in bursts) a no-op,
  // and the merge is by message id, so a page can never be added twice.
  async function loadOlder() {
    const id = activeIdRef.current;
    const cur = msgsRef.current[id];
    const first = cur?.list.find(m => !m.status);
    if (olderBusy.current || !cur?.hasMore || !first) return;
    olderBusy.current = true; setLoadingOlder(true);
    try {
      const older = await chat.messages(id, first.createdAt);
      const el = scrollRef.current;
      if (el && activeIdRef.current === id) keepFrom.current = { h: el.scrollHeight, top: el.scrollTop };
      setMsgs(x => (x[id] ? { ...x, [id]: { list: mergeMessages(x[id].list, older), hasMore: older.length === PAGE } } : x));
    } catch (e) { toast.error('Could not load earlier messages', e); }
    finally { olderBusy.current = false; setLoadingOlder(false); }
  }
  function jumpTo(id) {
    const node = document.getElementById(`msg-${id}`);
    if (!node) { toast.info('That message is further back — scroll up to load earlier messages.'); return; }
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight(id); setTimeout(() => setHighlight(h => (h === id ? null : h)), 1600);
  }
  function openFound(f) {
    if (f.channelId === activeId) { jumpTo(f.id); return; }
    pendingJump.current = f.id;
    openChat(f.channelId);
  }

  // ── local message state helpers ─────────────────────────────────
  const patchMsg = (channelId, match, patch) => setMsgs(x => (x[channelId]
    ? { ...x, [channelId]: { ...x[channelId], list: x[channelId].list.map(y => (match(y) ? (typeof patch === 'function' ? patch(y) : { ...y, ...patch }) : y)) } } : x));
  const byMsgId = id => y => y.id === id;
  const byClientId = id => y => y.clientId === id;

  // ── composing ────────────────────────────────────────────────────
  function addFiles(picked) {
    const ok = [], bad = [];
    for (const f of picked) (f.size > MAX_FILE ? bad : ok).push(f);
    if (bad.length) toast.error(`${bad.map(f => f.name).join(', ')} ${bad.length > 1 ? 'are' : 'is'} over 20 MB and ${bad.length > 1 ? 'were' : 'was'} not attached`);
    if (ok.length) setFiles(fs => [...fs, ...ok.map(f => ({ file: f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }))]);
  }
  function removeFile(i) {
    setFiles(fs => { if (fs[i]?.url) URL.revokeObjectURL(fs[i].url); return fs.filter((_, k) => k !== i); });
  }
  function startEdit(m) {
    if (!editing) setPreEdit(text);
    setEditing(m); setReplyTo(null); setText(m.text);
    inputRef.current?.focus();
  }
  function cancelEdit() {
    setEditing(null); setText(preEdit); setPreEdit('');
  }
  function startReply(m) {
    if (editing) cancelEdit();
    setReplyTo(m);
    inputRef.current?.focus();
  }

  function submit() {
    if (!active || !me) return;
    if (editing) { saveEdit(); return; }
    const body = text.trim();
    if (!body && !files.length) return;
    const clientId = uid();
    const draft = {
      id: `tmp-${clientId}`, clientId, channelId: active.id, senderId: me.id, senderName: me.name, senderKind: me.kind, text: body,
      // local previews only — `localFiles` holds the real File objects that get uploaded
      attachments: files.map(f => ({ name: f.file.name, type: f.file.type, size: f.file.size, url: f.url, uploading: true })),
      localFiles: files, replyTo: replyTo?.id || null,
      // only people in THIS conversation can be mentioned / notified
      mentions: extractMentions(body, (active.members || []).filter(p => !sameId(p, me))),
      mentionTitle: `${me.name} mentioned you in ${channelLabel(active)}`,
      editedAt: null, deleted: false, pinned: false, createdAt: new Date().toISOString(), status: 'sending',
    };
    wantBottom.current = true;
    setMsgs(x => ({ ...x, [active.id]: { hasMore: false, ...x[active.id], list: mergeMessages(x[active.id]?.list || [], [draft]) } }));
    setText(''); setFiles([]); setReplyTo(null); setEmojiOpen(false); setFirstUnreadId(null); setNewBelow(0);
    inputRef.current?.focus();
    deliver(draft);
  }

  // Upload (once per file) and insert. Used for the first attempt and for Retry,
  // so a retry always sends real uploaded attachments, never blob: previews.
  async function deliver(draft) {
    try {
      const attachments = await Promise.all(draft.localFiles.map(async f => {
        if (!UPLOADED.has(f.file)) UPLOADED.set(f.file, await uploadFile(f.file, { module: 'chat', sourceId: draft.channelId, type: 'message' }));
        return UPLOADED.get(f.file);
      }));
      const saved = await chat.send({ channelId: draft.channelId, text: draft.text, attachments, replyTo: draft.replyTo, mentions: draft.mentions, clientId: draft.clientId });
      patchMsg(draft.channelId, byClientId(draft.clientId), () => saved);
      draft.localFiles.forEach(f => f.url && URL.revokeObjectURL(f.url));
      if (draft.mentions.length) notificationsDB.createMany(draft.mentions.map(p => ({ recipient: p, type: 'chat', title: draft.mentionTitle, body: draft.text.slice(0, 140) }))).catch(() => {});
      if (activeIdRef.current === draft.channelId) markRead(draft.channelId);
    } catch (e) {
      console.error('chat send', e);
      patchMsg(draft.channelId, y => y.clientId === draft.clientId && !!y.status, { status: 'failed', error: e?.message || 'Network error' });
    }
  }
  function retrySend(m) {
    patchMsg(m.channelId, byClientId(m.clientId), { status: 'sending', error: null });
    deliver(m);
  }
  function discardFailed(m) {
    m.localFiles?.forEach(f => f.url && URL.revokeObjectURL(f.url));
    setMsgs(x => (x[m.channelId] ? { ...x, [m.channelId]: { ...x[m.channelId], list: x[m.channelId].list.filter(y => y.clientId !== m.clientId) } } : x));
  }

  async function saveEdit() {
    const body = text.trim();
    const m = editing;
    if (!body || !m) return;
    const restore = preEdit;
    setEditing(null); setText(restore); setPreEdit('');
    if (body === m.text) return;
    patchMsg(m.channelId, byMsgId(m.id), { text: body, editedAt: new Date().toISOString() });
    try { await chat.edit(m.id, body); }
    catch (e) {
      patchMsg(m.channelId, byMsgId(m.id), { text: m.text, editedAt: m.editedAt });
      toast.error('Could not save your edit', e);
      // hand the edit back so nothing typed is lost
      const c = composeRef.current;
      if (activeIdRef.current === m.channelId && !c.editing && c.text === restore) { setPreEdit(restore); setEditing(m); setText(body); }
    }
  }

  async function removeMsg(m) {
    patchMsg(m.channelId, byMsgId(m.id), { deleted: true, text: '', attachments: [] });
    setPins(ps => ps.filter(p => p.id !== m.id));
    try { await chat.remove(m.id); }
    catch (e) {
      patchMsg(m.channelId, byMsgId(m.id), { deleted: m.deleted, text: m.text, attachments: m.attachments });
      if (m.pinned) setPins(ps => (ps.some(p => p.id === m.id) ? ps : [m, ...ps]));
      toast.error('Could not delete the message', e);
    }
  }

  async function togglePin(m) {
    const next = !m.pinned;
    patchMsg(m.channelId, byMsgId(m.id), { pinned: next });
    setPins(ps => { const rest = ps.filter(p => p.id !== m.id); return next ? [{ ...m, pinned: true }, ...rest] : rest; });
    try { await chat.setPinned(m.id, next); }
    catch (e) {
      patchMsg(m.channelId, byMsgId(m.id), { pinned: m.pinned });
      setPins(ps => { const rest = ps.filter(p => p.id !== m.id); return m.pinned ? [m, ...rest] : rest; });
      toast.error(next ? 'Could not pin the message' : 'Could not unpin the message', e);
    }
  }

  async function toggleReaction(m, emoji) {
    const mine = reactions.find(r => r.messageId === m.id && r.emoji === emoji && sameId({ kind: r.personKind, id: r.personId }, me));
    if (mine) {
      setReactions(rs => rs.filter(r => r.id !== mine.id));
      try { await chat.unreact(mine.id); }
      catch (e) { setReactions(rs => (rs.some(r => r.id === mine.id) ? rs : [...rs, mine])); toast.error('Could not remove the reaction', e); }
    } else {
      try { const r = await chat.react({ message: m, emoji }); setReactions(rs => (rs.some(x => x.id === r.id) ? rs : [...rs, r])); }
      catch (e) { toast.error('Could not add the reaction', e); }
    }
  }

  async function copyText(m) {
    try { await navigator.clipboard.writeText(m.text); toast.success('Copied'); }
    catch (e) { toast.error('Could not copy the message', e); }
  }

  // ── conversations ───────────────────────────────────────────────
  function channelLabel(c) {
    if (!c) return '';
    if (c.type === 'group') return c.name || 'Group';
    return (c.members || []).find(m => !sameId(m, me))?.name || 'Direct message';
  }
  const dmOther = c => (c?.type === 'dm' ? (c.members || []).find(m => !sameId(m, me)) : null);
  const isAdmin = c => isPartner || (c?.admins || []).some(a => sameId(a, me));

  // One person → direct message (re-using the existing one), several → group.
  async function startChat({ picked, name, description }) {
    let c;
    if (picked.length === 1) {
      const other = picked[0];
      const isDmWith = x => x.type === 'dm' && x.members.length === 2 && x.members.some(m => sameId(m, other)) && x.members.some(m => sameId(m, me));
      let existing = channelsRef.current.find(isDmWith);
      if (!existing) {
        // the local list can be stale — ask the server before creating a second one
        const all = (await chat.channels()).filter(isMine);
        existing = all.find(isDmWith);
        if (existing) setChannels(sortChannels(all));
      }
      if (existing) { openChat(existing.id); return; }
      c = await chat.createChannel({ type: 'dm', members: [me, other] });
    } else {
      c = await chat.createChannel({ type: 'group', name, description, members: [me, ...picked] });
    }
    setChannels(cs => sortChannels([c, ...cs.filter(x => x.id !== c.id)]));
    openChat(c.id);
  }

  async function updateActive(patch) {
    const c = await chat.updateChannel(active.id, { ...patch, version: active.version });
    setChannels(cs => cs.map(x => (x.id === c.id ? c : x)));
    return c;
  }

  async function runConfirm() {
    const c = confirm;
    if (!c) return;
    if (c.kind === 'msg') { removeMsg(c.m); return; }   // optimistic; rolls back with a toast
    const id = c.channel.id;
    if (c.kind === 'member') {
      await updateActive({ members: c.channel.members.filter(x => !sameId(x, c.member)) });
      toast.success(`${c.member.name} removed`);
      return;
    }
    if (c.kind === 'leave') {
      try { await chat.leaveChannel(id); }
      catch (e) {
        // the request may have gone through even though the answer was lost — check before calling it a failure
        const still = await chat.channels().then(all => all.some(x => x.id === id && isMine(x))).catch(() => true);
        if (still) throw e;
      }
      toast.success(`You left ${channelLabel(c.channel)}`);
    } else {
      await chat.deleteChannel(id);
      toast.success('Conversation deleted');
    }
    setInfo(null);
    closeChat();
    setChannels(cs => cs.filter(x => x.id !== id));
  }

  // ── derived ──────────────────────────────────────────────────────
  const unreadChats = useMemo(() => channels.filter(c => unread[c.id]?.unread > 0).length, [channels, unread]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return channels.filter(c => {
      if (filter === 'unread' && !(unread[c.id]?.unread > 0)) return false;
      if (filter === 'groups' && c.type !== 'group') return false;
      if (filter === 'dms' && c.type !== 'dm') return false;
      return !s || channelLabel(c).toLowerCase().includes(s) || (c.members || []).some(m => m.name?.toLowerCase().includes(s));
    });
  }, [channels, filter, q, unread, meKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const reactionsByMsg = useMemo(() => {
    const map = new Map();
    reactions.forEach(r => { if (!map.has(r.messageId)) map.set(r.messageId, new Map()); const g = map.get(r.messageId); if (!g.has(r.emoji)) g.set(r.emoji, []); g.get(r.emoji).push(r); });
    return map;
  }, [reactions]);
  const byId = useMemo(() => new Map(list.map(m => [m.id, m])), [list]);

  // ── states before the two-pane app ──────────────────────────────
  if (!me) {
    return (
      <div className="chat-root">
        <Header title="Chat" />
        <div className="page-body">
          <EmptyPanel icon={UserX} title="Your profile has no display name — ask an admin"
            text="Chat needs a name to show next to your messages. An admin can set it in Users & Access; then reload this page." />
        </div>
      </div>
    );
  }
  if (load.status !== 'ready') {
    return (
      <div className="chat-root">
        <Header title="Chat" subtitle={load.status === 'loading' ? 'Loading conversations…' : undefined} />
        <div className="page-body">
          {load.status === 'loading' ? <SkeletonRows rows={7} />
            : <ErrorPanel title="Could not load your conversations" error={load.error} onRetry={() => { setLoad({ status: 'loading', error: null }); setReloadKey(k => k + 1); }} />}
        </div>
      </div>
    );
  }

  const filtered = filter !== 'all' || q.trim().length > 0;
  const clearFilters = () => { setFilter('all'); setQ(''); };
  const othersReads = reads.filter(r => !sameId(r, me));
  const seenBy = m => othersReads.filter(r => r.lastReadAt >= m.createdAt);
  const lastMine = [...list].reverse().find(m => sameId(senderOf(m), me) && !m.deleted && !m.status);
  const typingNames = Object.values(typing).map(t => t.name);
  const refMsg = id => byId.get(id) || quotedExtra.find(m => m.id === id);
  const pinnedList = [...new Map([...pins, ...list.filter(m => m.pinned)].map(m => [m.id, byId.get(m.id) || m])).values()]
    .filter(m => m.pinned && !m.deleted).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const sharedFiles = list.filter(m => !m.deleted && !m.status).flatMap(m => m.attachments.map(a => ({ ...a, at: m.createdAt, by: m.senderName })));
  const other = dmOther(active);
  const label = channelLabel(active);
  const isMuted = active ? !!muted[active.id] : false;
  const menuMsg = menu ? byId.get(menu.id) : null;
  const subtitle = `${channels.length} conversation${channels.length === 1 ? '' : 's'}${totalUnread ? ` · ${totalUnread} unread` : ''}`;

  return (
    <div className={`chat-root ${active ? 'has-active' : ''}`}>
      <Header title="Chat" subtitle={subtitle}
        actions={<>
          {notifPerm === 'default' && (
            <button className="mac-btn mac-btn-secondary" onClick={() => Notification.requestPermission().then(setNotifPerm).catch(() => {})}><Bell size={14} /> Turn on alerts</button>
          )}
          {canStart && <button className="mac-btn mac-btn-primary" onClick={() => setShowNew(true)}><Plus size={15} /> New chat</button>}
        </>} />

      <div className="chat-shell">
        {/* ── conversation list ── */}
        <aside className="chat-list" aria-label="Conversations">
          <div className="chat-list-top">
            <div className="toolbar-search">
              <Search size={15} aria-hidden="true" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search chats and messages" aria-label="Search chats and messages" />
              {q && <button onClick={() => setQ('')} aria-label="Clear search"><X size={14} /></button>}
            </div>
            <Chips label="Filter conversations" value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: 'Unread', count: unreadChats || undefined },
              { value: 'groups', label: 'Groups' },
              { value: 'dms', label: 'Direct' },
            ]} />
            {filtered && (
              <div className="chat-list-count">
                <span>{shown.length} of {channels.length}</span>
                <button className="chat-link-btn" onClick={clearFilters}>Clear</button>
              </div>
            )}
          </div>
          <div className="chat-list-scroll">
            {shown.length === 0 && found.length === 0 && (
              channels.length === 0 ? (
                <div className="chat-empty">
                  <MessageSquare size={26} aria-hidden="true" />
                  <strong>No conversations yet</strong>
                  {canStart ? <button className="mac-btn mac-btn-primary" onClick={() => setShowNew(true)}><Plus size={15} /> New chat</button>
                    : <span>You will see a conversation here as soon as someone adds you to one.</span>}
                </div>
              ) : (
                <div className="chat-empty">
                  <strong>Nothing matches</strong>
                  <span>{filter === 'unread' && !q.trim() ? 'You are all caught up.' : 'Try a different search or filter.'}</span>
                  <button className="mac-btn mac-btn-secondary" onClick={clearFilters}>Show all conversations</button>
                </div>
              )
            )}
            {shown.map(c => {
              const u = unread[c.id] || {};
              const name = channelLabel(c);
              const quiet = !!muted[c.id];
              return (
                <button key={c.id} onClick={() => openChat(c.id)} className={`chat-row ${c.id === activeId ? 'on' : ''} ${u.unread ? 'unread' : ''}`} aria-current={c.id === activeId ? 'true' : undefined}>
                  <ChatAvatar name={name} group={c.type === 'group'} size={42} online={isOnline(dmOther(c))} />
                  <span className="chat-row-main">
                    <span className="chat-row-line">
                      <span className="chat-row-name">{name}</span>
                      <span className="chat-row-time">{fmtListTime(c.lastMessageAt)}</span>
                    </span>
                    <span className="chat-row-line">
                      <span className="chat-row-prev">{c.lastMessagePreview || (c.type === 'group' ? `${c.members.length} members` : 'Say hello 👋')}</span>
                      <span className="chat-row-flags">
                        {quiet && <BellOff size={13} aria-label="Muted" />}
                        {u.mentions > 0 && <span className="chat-badge at" aria-label="You were mentioned">@</span>}
                        {u.unread > 0 && <span className={`chat-badge ${quiet ? 'muted' : ''}`} aria-label={`${u.unread} unread`}>{u.unread > 99 ? '99+' : u.unread}</span>}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
            {found.length > 0 && (
              <>
                <div className="chat-sec">Messages</div>
                {found.map(f => (
                  <button key={f.id} className="chat-row" onClick={() => openFound(f)}>
                    <span className="chat-row-main">
                      <span className="chat-row-line">
                        <span className="chat-row-prev">{channelLabel(channels.find(x => x.id === f.channelId))} · {f.senderName}</span>
                        <span className="chat-row-time">{fmtListTime(f.createdAt)}</span>
                      </span>
                      <span className="chat-row-name" style={{ fontWeight: 500 }}>{f.text}</span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </aside>

        {/* ── conversation ── */}
        <section className="chat-thread" aria-label={active ? `Conversation with ${label}` : 'Conversation'}
          onDragOver={e => { if (active) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (active && e.dataTransfer.files?.length) addFiles([...e.dataTransfer.files]); }}>
          {!active ? (
            <div className="chat-placeholder">
              <MessageSquare size={32} aria-hidden="true" />
              <div>Pick a conversation{canStart ? ' or start a new one' : ''}</div>
            </div>
          ) : (
            <>
              <div className="chat-head">
                <button className="icon-btn plain chat-back" onClick={closeChat} aria-label="Back to conversations"><ArrowLeft size={18} /></button>
                <ChatAvatar name={label} group={active.type === 'group'} size={38} online={isOnline(other)} />
                <button className="chat-head-text" onClick={() => setInfo('about')} aria-label={`${label} — open details`}>
                  <div className="chat-head-name">{label}</div>
                  <div className={`chat-head-sub ${typingNames.length ? 'typing' : ''}`}>
                    {typingNames.length ? `${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…`
                      : active.type === 'dm' ? (isOnline(other) ? 'Online' : 'Offline')
                        : `${active.members.filter(m => isOnline(m)).length} online · ${active.members.map(m => (sameId(m, me) ? 'You' : (m.name || '').split(' ')[0])).join(', ')}`}
                  </div>
                </button>
                {pinnedList.length > 0 && <button className="mac-btn mac-btn-secondary" style={{ padding: '8px 10px' }} onClick={() => setInfo('pins')} aria-label={`${pinnedList.length} pinned messages`}><Pin size={14} /> {pinnedList.length}</button>}
                <button className="icon-btn plain" onClick={() => toggleMute(active.id)} aria-label={isMuted ? 'Unmute notifications' : 'Mute notifications'} aria-pressed={isMuted} title={isMuted ? 'Unmute' : 'Mute'}>{isMuted ? <BellOff size={17} /> : <Bell size={17} />}</button>
                <button className="icon-btn plain" onClick={() => setInfo('about')} aria-label="Conversation details" title="Details"><Info size={17} /></button>
              </div>

              <div className="chat-body">
                <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
                  {thread.loading && !list.length ? (
                    <div className="chat-skel" aria-busy="true" aria-label="Loading messages"><span /><span /><span /><span /><span /></div>
                  ) : thread.error && !list.length ? (
                    <div style={{ margin: 'auto', width: '100%', maxWidth: 420 }}>
                      <ErrorPanel title="Could not load this conversation" error={thread.error} onRetry={() => setOpenTick(t => t + 1)} />
                    </div>
                  ) : list.length === 0 ? (
                    <div className="chat-placeholder"><span style={{ fontSize: 30 }} aria-hidden="true">👋</span><div>No messages yet. Say hello!</div></div>
                  ) : (
                    <>
                      {hasMore ? (!loadingOlder && <button className="chat-link-btn chat-sys" onClick={loadOlder}>Load earlier messages</button>)
                        : <div className="chat-sys">This is the start of your conversation with {label}</div>}
                      {list.map((m, i) => {
                        const prev = list[i - 1];
                        const mine = sameId(senderOf(m), me);
                        const newDay = !prev || fmtDay(prev.createdAt) !== fmtDay(m.createdAt);
                        const isNew = m.id === firstUnreadId;
                        const grouped = !!prev && !newDay && !isNew && !prev.deleted && prev.senderId === m.senderId && prev.senderKind === m.senderKind
                          && (new Date(m.createdAt) - new Date(prev.createdAt)) < 5 * 60000;
                        const seen = mine && !m.status && !m.deleted ? seenBy(m) : [];
                        return (
                          <Fragment key={m.clientId || m.id}>
                            {newDay && <div className="chat-day"><span>{fmtDay(m.createdAt)}</span></div>}
                            {isNew && <div className="chat-new" role="separator">New messages</div>}
                            <MessageRow m={m} mine={mine} grouped={grouped} me={me} isGroup={active.type === 'group'}
                              reactions={reactionsByMsg.get(m.id)} quoted={m.replyTo ? refMsg(m.replyTo) : null}
                              seenTick={active.type === 'dm' && seen.length > 0}
                              seenNames={active.type === 'group' && m === lastMine ? seen.map(r => active.members.find(x => sameId(x, r))?.name?.split(' ')[0]).filter(Boolean) : null}
                              highlight={highlight === m.id} menuOpen={menu?.id === m.id}
                              onMenu={rect => setMenu({ id: m.id, rect })} onJump={jumpTo} onReact={toggleReaction}
                              onRetry={retrySend} onDiscard={discardFailed} onMediaLoad={stickToBottom} />
                          </Fragment>
                        );
                      })}
                    </>
                  )}
                  {typingNames.length > 0 && <div className="chat-typing" aria-live="polite"><span /><span /><span /> {typingNames.join(', ')} typing</div>}
                </div>
                {loadingOlder && <div className="chat-older"><Loader2 size={13} className="chat-spin" /> Loading earlier messages…</div>}
                {!atBottom && (
                  <button className={`chat-jump ${newBelow ? 'has-new' : ''}`} onClick={() => { scrollToBottom(true); markRead(activeId); }} aria-label={newBelow ? `${newBelow} new messages — go to latest` : 'Go to latest message'}>
                    <ArrowDown size={16} />{newBelow > 0 && <span>{newBelow === 1 ? 'New message' : `${newBelow} new messages`}</span>}
                  </button>
                )}
                {dragOver && <div className="chat-drop">Drop files to attach</div>}
              </div>

              {/* composer */}
              <div className="chat-compose">
                {(replyTo || editing) && (
                  <div className="chat-compose-bar">
                    {editing ? <Pencil size={15} aria-hidden="true" /> : <Reply size={15} aria-hidden="true" />}
                    <div className="chat-compose-bar-text">
                      <div className="chat-compose-bar-title">{editing ? 'Editing message' : `Replying to ${sameId(senderOf(replyTo), me) ? 'yourself' : replyTo.senderName}`}</div>
                      <div className="chat-compose-bar-prev">{previewOf(editing || replyTo)}</div>
                    </div>
                    <button className="icon-btn plain" onClick={() => (editing ? cancelEdit() : setReplyTo(null))} aria-label={editing ? 'Cancel edit' : 'Cancel reply'}><X size={16} /></button>
                  </div>
                )}
                {files.length > 0 && (
                  <div className="chat-files">
                    {files.map((f, i) => (
                      <div key={`${f.file.name}-${f.file.lastModified}-${i}`} className="chat-file">
                        {f.url ? <img src={f.url} alt="" /> : <FileText size={20} aria-hidden="true" />}
                        <span>{f.file.name}</span>
                        <button className="icon-btn plain" onClick={() => removeFile(i)} aria-label={`Remove ${f.file.name}`}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="chat-compose-row">
                  <input ref={fileRef} type="file" multiple hidden onChange={e => { addFiles([...(e.target.files || [])]); e.target.value = ''; }} />
                  <button className="icon-btn plain" onClick={() => fileRef.current?.click()} disabled={!!editing} title="Attach files" aria-label="Attach files"><Paperclip size={18} /></button>
                  <div className="chat-pop-wrap" ref={emojiRef}>
                    <button className="icon-btn plain" onClick={() => setEmojiOpen(o => !o)} title="Emoji" aria-label="Emoji" aria-expanded={emojiOpen}><Smile size={18} /></button>
                    {emojiOpen && (
                      <div className="chat-emoji" role="listbox" aria-label="Emoji">
                        {EMOJIS.map(e => <button key={e} onClick={() => { setText(t => t + e); if (!coarse) inputRef.current?.focus(); }}>{e}</button>)}
                      </div>
                    )}
                  </div>
                  <Composer inputRef={inputRef} text={text} setText={setText} coarse={coarse}
                    people={(active.members || []).filter(p => !sameId(p, me))}
                    onSend={submit} onTyping={signalTyping} onPasteFiles={addFiles}
                    onEscape={() => { if (emojiOpen) setEmojiOpen(false); else if (editing) cancelEdit(); else setReplyTo(null); }}
                    onArrowUpEmpty={() => { if (lastMine?.text) startEdit(lastMine); }} />
                  <button className="chat-send" onMouseDown={e => e.preventDefault()} onClick={submit} disabled={!text.trim() && !files.length} aria-label={editing ? 'Save edit' : 'Send message'}>
                    {editing ? <Check size={18} /> : <Send size={17} />}
                  </button>
                </div>
                <div className="chat-hint">Enter to send · Shift+Enter for a new line · ↑ edits your last message · *bold* _italic_ `code` · @ to mention</div>
              </div>
            </>
          )}
        </section>
      </div>

      {menuMsg && !menuMsg.deleted && !menuMsg.status && (
        <MessageMenu m={menuMsg} rect={menu.rect} mine={sameId(senderOf(menuMsg), me)} onClose={() => setMenu(null)}
          myEmojis={reactions.filter(r => r.messageId === menuMsg.id && sameId({ kind: r.personKind, id: r.personId }, me)).map(r => r.emoji)}
          onReact={e => toggleReaction(menuMsg, e)} onReply={() => startReply(menuMsg)} onCopy={() => copyText(menuMsg)}
          onPin={() => togglePin(menuMsg)} onEdit={() => startEdit(menuMsg)} onDelete={() => setConfirm({ kind: 'msg', m: menuMsg })} />
      )}

      {active && (
        <InfoDrawer tab={info} setTab={setInfo} channel={active} me={me} label={label} people={people} isAdmin={isAdmin(active)} isPartner={isPartner}
          online={isOnline} muted={isMuted} onMute={() => toggleMute(active.id)} pinned={pinnedList} files={sharedFiles}
          onJump={id => { setInfo(null); requestAnimationFrame(() => jumpTo(id)); }} onUpdate={updateActive}
          onRemoveMember={member => setConfirm({ kind: 'member', channel: active, member })}
          onLeave={() => setConfirm({ kind: 'leave', channel: active })} onDelete={() => setConfirm({ kind: 'delete', channel: active })} />
      )}

      {showNew && <NewChatModal people={people.filter(p => !sameId(p, me))} online={isOnline} onClose={() => setShowNew(false)} onCreate={startChat} />}

      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={runConfirm}
        title={confirm?.kind === 'msg' ? 'Delete message' : confirm?.kind === 'leave' ? 'Leave group' : confirm?.kind === 'member' ? 'Remove member' : 'Delete conversation'}
        confirmLabel={confirm?.kind === 'leave' ? 'Leave' : confirm?.kind === 'member' ? 'Remove' : 'Delete'}
        message={confirm?.kind === 'msg' ? 'Delete this message for everyone? Others will see “This message was deleted”.'
          : confirm?.kind === 'leave' ? `You will stop receiving messages from ${channelLabel(confirm.channel)}. Someone in the group will have to add you back.`
            : confirm?.kind === 'member' ? `Remove ${confirm.member.name} from ${channelLabel(confirm.channel)}? They will no longer see this conversation.`
              : 'Permanently delete this conversation and all its messages for everyone? This cannot be undone.'} />
    </div>
  );
}

function ChatAvatar({ name, group, size = 36, online }) {
  return (
    <span className="chat-av-wrap">
      {group
        ? <span className="avatar chat-av-group" style={{ width: size, height: size }} title={name}><Users size={Math.round(size * 0.46)} /></span>
        : <Avatar name={name || ''} size={size} />}
      {online && <span className="chat-dot" title="Online" />}
    </span>
  );
}

function Rich({ text }) {
  return formatSegments(text).map((s, i) => {
    if (s.t === 'link') return <a key={i} href={s.v} target="_blank" rel="noreferrer">{s.v}</a>;
    if (s.t === 'code') return <code key={i} className="chat-code">{s.v}</code>;
    if (s.t === 'bold') return <strong key={i}>{s.v}</strong>;
    if (s.t === 'italic') return <em key={i}>{s.v}</em>;
    if (s.t === 'mention') return <span key={i} className="chat-at">{s.v}</span>;
    return <Fragment key={i}>{s.v}</Fragment>;
  });
}

const fmtSize = n => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

function Attachments({ items, below, onMediaLoad }) {
  const imgs = items.filter(a => a.type?.startsWith('image/'));
  const docs = items.filter(a => !a.type?.startsWith('image/'));
  const urlOf = useFileUrls(items);   // stored links expire; these are fresh ones
  return (
    <div className={`chat-att ${below ? 'below' : ''}`}>
      {imgs.length > 0 && (
        <div className={`chat-imgs n${Math.min(imgs.length, 4)}`}>
          {imgs.slice(0, 4).map((a, i) => (
            <a key={i} href={a.uploading ? undefined : urlOf(a)} target="_blank" rel="noreferrer">
              <img src={a.uploading ? a.url : urlOf(a)} alt={a.name} className={a.uploading ? 'uploading' : ''} onLoad={onMediaLoad} />
              {i === 3 && imgs.length > 4 && <span className="chat-imgs-more">+{imgs.length - 4}</span>}
            </a>
          ))}
        </div>
      )}
      {docs.map((a, i) => (
        <a key={i} href={a.uploading ? undefined : urlOf(a)} target="_blank" rel="noreferrer" className="chat-doc">
          {a.uploading ? <Loader2 size={15} className="chat-spin" /> : <FileText size={15} />}
          <span>{a.name}</span>
          {a.size ? <span className="chat-doc-size">{fmtSize(a.size)}</span> : null}
        </a>
      ))}
    </div>
  );
}

function MessageRow({ m, mine, grouped, me, isGroup, reactions, quoted, seenTick, seenNames, highlight, menuOpen, onMenu, onJump, onReact, onRetry, onDiscard, onMediaLoad }) {
  const press = useRef(null);
  const canAct = !m.deleted && !m.status;
  const rectOf = wrap => (wrap.querySelector('.chat-bubble') || wrap).getBoundingClientRect();
  const stopPress = () => clearTimeout(press.current);
  useEffect(() => () => clearTimeout(press.current), []);
  // long-press (touch) and right-click both open the one action menu
  const touch = canAct ? {
    onTouchStart: e => { const wrap = e.currentTarget; stopPress(); press.current = setTimeout(() => onMenu(rectOf(wrap)), 450); },
    onTouchEnd: stopPress, onTouchMove: stopPress, onTouchCancel: stopPress,
    onContextMenu: e => { if (e.target.closest('a')) return; e.preventDefault(); stopPress(); onMenu(rectOf(e.currentTarget)); },
  } : {};
  return (
    <div id={`msg-${m.id}`} className={`chat-msg ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''} ${highlight ? 'flash' : ''}`}>
      {!mine && <span className="chat-msg-av">{!grouped && <Avatar name={m.senderName || ''} size={30} />}</span>}
      <div className="chat-msg-col">
        {!mine && !grouped && isGroup && <span className="chat-sender" style={{ color: colorFor(m.senderName) }}>{m.senderName}</span>}
        <div className={`chat-bubble-wrap ${menuOpen ? 'menu-open' : ''}`} {...touch}>
          <div className={`chat-bubble ${m.deleted ? 'deleted' : ''} ${m.status === 'failed' ? 'failed' : ''}`}>
            {m.pinned && !m.deleted && <span className="chat-pin"><Pin size={11} /> Pinned</span>}
            {quoted && !m.deleted && (
              <button className="chat-quote" onClick={() => onJump(quoted.id)}>
                <strong>{sameId(senderOf(quoted), me) ? 'You' : quoted.senderName}</strong>
                <span>{previewOf(quoted)}</span>
              </button>
            )}
            {m.deleted ? <span>This message was deleted</span> : (
              <>
                {m.text && <div className="chat-text"><Rich text={m.text} /></div>}
                {m.attachments.length > 0 && <Attachments items={m.attachments} below={!!m.text} onMediaLoad={onMediaLoad} />}
              </>
            )}
            <span className="chat-meta">
              {m.editedAt && !m.deleted && <span>edited ·</span>}
              {fmtTime(m.createdAt)}
              {mine && !m.deleted && (m.status === 'sending' ? <Loader2 size={12} className="chat-spin" aria-label="Sending" />
                : m.status === 'failed' ? <AlertCircle size={12} aria-label="Not sent" />
                  : seenTick ? <CheckCheck size={14} className="seen" aria-label="Seen" /> : <Check size={13} aria-label="Sent" />)}
            </span>
          </div>
          {canAct && (
            <button className="chat-more-btn" aria-label="Message actions" aria-haspopup="menu" aria-expanded={menuOpen}
              onClick={e => onMenu(rectOf(e.currentTarget.parentElement))}><MoreHorizontal size={16} /></button>
          )}
        </div>
        {m.status === 'failed' && (
          <div className="chat-failed" role="alert">
            <AlertCircle size={13} aria-hidden="true" /> Failed —
            <button onClick={() => onRetry(m)}>Retry</button>
            <button className="quiet" onClick={() => onDiscard(m)}>Discard</button>
          </div>
        )}
        {reactions && (
          <div className="chat-rx">
            {[...reactions.entries()].map(([emoji, rs]) => (
              <button key={emoji} className={rs.some(r => sameId({ kind: r.personKind, id: r.personId }, me)) ? 'on' : ''}
                title={rs.map(r => r.personName).join(', ')} onClick={() => onReact(m, emoji)}>{emoji} {rs.length}</button>
            ))}
          </div>
        )}
        {seenNames?.length > 0 && <span className="chat-seen">Seen by {seenNames.join(', ')}</span>}
      </div>
    </div>
  );
}

// One small menu for every message action. Anchored to the bubble on desktop,
// a bottom sheet on phones (see Chat.css).
function MessageMenu({ m, rect, mine, myEmojis, onClose, onReact, onReply, onCopy, onPin, onEdit, onDelete }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pad = 8, w = el.offsetWidth, h = el.offsetHeight;
    const left = Math.min(Math.max(pad, mine ? rect.right - w : rect.left), window.innerWidth - w - pad);
    const below = rect.bottom + 6;
    const top = below + h > window.innerHeight - pad ? Math.max(pad, rect.top - h - 6) : below;
    el.style.left = `${left}px`; el.style.top = `${top}px`; el.style.visibility = 'visible';
    el.querySelector('.menu-item')?.focus();
  }, [rect, mine]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const run = fn => () => { onClose(); fn(); };
  return (
    <div className="chat-menu-layer" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }}>
      <div ref={ref} className="chat-menu" role="menu" aria-label="Message actions" style={{ visibility: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div className="chat-menu-rx">
          {QUICK_REACTIONS.map(e => <button key={e} className={myEmojis.includes(e) ? 'on' : ''} onClick={run(() => onReact(e))} aria-label={`React ${e}`}>{e}</button>)}
        </div>
        <button className="menu-item" role="menuitem" onClick={run(onReply)}><Reply size={15} /> Reply</button>
        {m.text && <button className="menu-item" role="menuitem" onClick={run(onCopy)}><Copy size={15} /> Copy text</button>}
        <button className="menu-item" role="menuitem" onClick={run(onPin)}>{m.pinned ? <><PinOff size={15} /> Unpin</> : <><Pin size={15} /> Pin</>}</button>
        {mine && m.text && <button className="menu-item" role="menuitem" onClick={run(onEdit)}><Pencil size={15} /> Edit</button>}
        {mine && <button className="menu-item danger" role="menuitem" onClick={run(onDelete)}><Trash2 size={15} /> Delete</button>}
      </div>
    </div>
  );
}

// Auto-growing input with @mention suggestions (members of this conversation only).
function Composer({ inputRef, text, setText, people, coarse, onSend, onTyping, onPasteFiles, onEscape, onArrowUpEmpty }) {
  const [sel, setSel] = useState(0);
  const query = (text.match(/(?:^|\s)@([\w]*)$/) || [])[1];
  const opts = query != null ? people.filter(p => (p.name || '').toLowerCase().split(' ').some(w => w.startsWith(query.toLowerCase()))).slice(0, 6) : [];
  useEffect(() => {
    const el = inputRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }
  }, [text, inputRef]);
  const pick = p => { setText(text.replace(/@[\w]*$/, `@${p.name} `)); setSel(0); inputRef.current?.focus(); };
  return (
    <div className="chat-compose-field">
      {opts.length > 0 && (
        <div className="chat-mention" role="listbox" aria-label="Mention someone">
          {opts.map((p, i) => (
            <button key={personKey(p)} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onMouseDown={e => { e.preventDefault(); pick(p); }}>
              <Avatar name={p.name} size={24} /> {p.name}
            </button>
          ))}
        </div>
      )}
      <textarea ref={inputRef} rows={1} className="chat-input" value={text} placeholder="Message" aria-label="Message"
        enterKeyHint={coarse ? 'enter' : 'send'}
        onChange={e => { setText(e.target.value); onTyping(); }}
        onPaste={e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); onPasteFiles(fs); } }}
        onKeyDown={e => {
          // never act on keys that belong to an IME composition (Gujarati / Hindi keyboards etc.)
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (opts.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => (s + 1) % opts.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => (s - 1 + opts.length) % opts.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(opts[sel] || opts[0]); return; }
          }
          // desktop: Enter sends, Shift+Enter is a new line. Touch keyboards: Enter is a new line, the Send button sends.
          if (e.key === 'Enter' && !e.shiftKey && !coarse) { e.preventDefault(); onSend(); return; }
          if (e.key === 'Escape') { onEscape(); return; }
          if (e.key === 'ArrowUp' && !text) { e.preventDefault(); onArrowUpEmpty(); }
        }} />
    </div>
  );
}

// One picker for both kinds: one person = direct message, several + a name = group.
function NewChatModal({ people, online, onClose, onCreate }) {
  const toast = useToast();
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const group = picked.length > 1;
  const toggle = p => { setErrors({}); setPicked(ps => (ps.some(x => sameId(x, p)) ? ps.filter(x => !sameId(x, p)) : [...ps, p])); };
  const shown = people.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  // start in the search box on desktop; on phones leave the keyboard down so the list is visible
  const searchRef = useRef(null);
  useEffect(() => { if (!isCoarse()) searchRef.current?.focus(); }, []);

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;
    const next = {};
    if (!picked.length) next.people = 'Pick at least one person.';
    if (group && !name.trim()) next.name = 'Give the group a name.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await onCreate({ picked, name: name.trim(), description: desc.trim() });
      onClose();
    } catch (err) {
      toast.error(group ? 'Could not create the group' : 'Could not start the chat', err);
      setBusy(false);
    }
  }

  return (
    <Modal isOpen onClose={busy ? undefined : onClose} title="New chat" size="sm"
      footer={<>
        <button type="button" className="mac-btn mac-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" form="new-chat-form" className="mac-btn mac-btn-primary" disabled={busy}>
          {busy ? (group ? 'Creating…' : 'Opening…') : group ? `Create group (${picked.length + 1})` : picked.length === 1 ? `Message ${picked[0].name.split(' ')[0]}` : 'Start chat'}
        </button>
      </>}>
      <form id="new-chat-form" className="chat-stack" onSubmit={submit} noValidate>
        <Field label="People" required error={errors.people} hint="Pick one person for a direct message, or several to make a group.">
          {id => (
            <div className="toolbar-search" style={{ maxWidth: 'none', flex: 'none' }}>
              <Search size={15} aria-hidden="true" />
              <input id={id} ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search people" />
              {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search"><X size={14} /></button>}
            </div>
          )}
        </Field>
        {picked.length > 0 && (
          <div className="chat-picked" aria-label="Selected people">
            {picked.map(p => <button type="button" key={personKey(p)} onClick={() => toggle(p)} aria-label={`Remove ${p.name}`}>{p.name} <X size={13} /></button>)}
          </div>
        )}
        <div className="chat-people" role="listbox" aria-multiselectable="true" aria-label="People">
          {shown.length === 0 && <div className="chat-empty">{people.length ? 'No one matches that search.' : 'There is no one else to chat with yet.'}</div>}
          {shown.map(p => {
            const on = picked.some(x => sameId(x, p));
            return (
              <button type="button" key={personKey(p)} role="option" aria-selected={on} className={`chat-row chat-person ${on ? 'on' : ''}`} onClick={() => toggle(p)}>
                <ChatAvatar name={p.name} size={34} online={online(p)} />
                <span className="chat-row-main">
                  <span className="chat-row-name">{p.name}</span>
                  <span className="chat-row-prev">{p.role}{online(p) ? ' · online' : ''}</span>
                </span>
                <span className="chat-person-check" aria-hidden="true">{on && <Check size={14} />}</span>
              </button>
            );
          })}
        </div>
        {group && (
          <>
            <Field label="Group name" required error={errors.name}>
              {id => <input id={id} className="mac-input" value={name} onChange={e => { setName(e.target.value); setErrors(x => ({ ...x, name: undefined })); }} placeholder="e.g. Vedora team" maxLength={60} />}
            </Field>
            <Field label="What is it for?" hint="Optional">
              {id => <input id={id} className="mac-input" value={desc} onChange={e => setDesc(e.target.value)} maxLength={140} />}
            </Field>
          </>
        )}
      </form>
    </Modal>
  );
}

function InfoDrawer({ tab, setTab, channel, me, label, people, isAdmin, isPartner, online, muted, onMute, pinned, files, onJump, onUpdate, onRemoveMember, onLeave, onDelete }) {
  const toast = useToast();
  const urlOf = useFileUrls(files);
  const [name, setName] = useState(channel.name || '');
  const [desc, setDesc] = useState(channel.description || '');
  const [nameError, setNameError] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  // reset the form when another conversation is shown, or someone else edits this one
  const [seen, setSeen] = useState({ id: channel.id, name: channel.name, description: channel.description });
  if (seen.id !== channel.id || seen.name !== channel.name || seen.description !== channel.description) {
    setSeen({ id: channel.id, name: channel.name, description: channel.description });
    setName(channel.name || ''); setDesc(channel.description || ''); setNameError('');
    if (seen.id !== channel.id) setAdding(false);
  }
  const group = channel.type === 'group';
  const other = group ? null : channel.members.find(m => !sameId(m, me));
  const notIn = people.filter(p => !channel.members.some(m => sameId(m, p)));
  const dirty = name.trim() !== (channel.name || '') || desc.trim() !== (channel.description || '');

  async function saveAbout(e) {
    e.preventDefault();
    if (busy || !dirty) return;
    if (!name.trim()) { setNameError('A group needs a name.'); return; }
    setBusy(true);
    try { await onUpdate({ name: name.trim(), description: desc.trim() }); toast.success('Group details saved'); }
    catch (err) { toast.error('Could not save the group details', err); }
    setBusy(false);
  }
  async function addMember(p) {
    if (busy) return;
    setBusy(true);
    try { await onUpdate({ members: [...channel.members, { id: p.id, name: p.name, kind: p.kind }] }); toast.success(`${p.name} added`); }
    catch (err) { toast.error(`Could not add ${p.name}`, err); }
    setBusy(false);
  }

  return (
    <Drawer isOpen={!!tab} onClose={() => setTab(null)} width={420} title={label}
      subtitle={group ? `Group · ${channel.members.length} members` : online(other) ? 'Online' : 'Offline'}>
      <Chips label="Details" value={tab} onChange={setTab} options={[
        { value: 'about', label: 'About' },
        { value: 'pins', label: 'Pinned', count: pinned.length || undefined },
        { value: 'files', label: 'Files', count: files.length || undefined },
      ]} />

      {tab === 'about' && (
        <div className="chat-stack">
          {group && isAdmin && (
            <form className="chat-stack" onSubmit={saveAbout} noValidate>
              <Field label="Group name" required error={nameError}>
                {id => <input id={id} className="mac-input" value={name} onChange={e => { setName(e.target.value); setNameError(''); }} maxLength={60} />}
              </Field>
              <Field label="Description">
                {id => <textarea id={id} className="mac-input" rows={2} value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this group for?" maxLength={140} />}
              </Field>
              {dirty && <button type="submit" className="mac-btn mac-btn-primary" disabled={busy} style={{ alignSelf: 'flex-end' }}>{busy ? 'Saving…' : 'Save changes'}</button>}
            </form>
          )}
          {group && !isAdmin && channel.description && <p className="muted" style={{ fontSize: 'var(--fs-md)' }}>{channel.description}</p>}

          <button className="mac-btn mac-btn-secondary" onClick={onMute} aria-pressed={!!muted}>
            {muted ? <><Bell size={15} /> Unmute notifications</> : <><BellOff size={15} /> Mute notifications</>}
          </button>

          {group && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                <h3 className="section-title">Members · {channel.members.length}</h3>
                {isAdmin && <button className="mac-btn mac-btn-ghost" onClick={() => setAdding(a => !a)} aria-expanded={adding}><UserPlus size={15} /> {adding ? 'Done' : 'Add people'}</button>}
              </div>
              {adding && (notIn.length === 0 ? <p className="faint" style={{ fontSize: 'var(--fs-sm)', padding: '6px 0' }}>Everyone is already in this group.</p> : notIn.map(p => (
                <button key={personKey(p)} className="chat-row" disabled={busy} onClick={() => addMember(p)}>
                  <ChatAvatar name={p.name} size={30} online={online(p)} />
                  <span className="chat-row-main"><span className="chat-row-name">{p.name}</span><span className="chat-row-prev">{p.role}</span></span>
                  <Plus size={16} aria-hidden="true" />
                </button>
              )))}
              {channel.members.map(m => {
                const admin = (channel.admins || []).some(a => sameId(a, m));
                return (
                  <div key={personKey(m)} className="chat-member">
                    <ChatAvatar name={m.name} size={30} online={online(m)} />
                    <span className="chat-member-name">{m.name}{sameId(m, me) && <span className="faint"> (you)</span>}</span>
                    {admin && <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>Admin</span>}
                    {isAdmin && !sameId(m, me) && <button className="icon-btn plain" onClick={() => onRemoveMember(m)} aria-label={`Remove ${m.name}`}><X size={16} /></button>}
                  </div>
                );
              })}
            </section>
          )}

          {group && <button className="mac-btn mac-btn-secondary" onClick={onLeave}><LogOut size={15} /> Leave group</button>}
          {isPartner && <button className="mac-btn mac-btn-danger" onClick={onDelete}><Trash2 size={15} /> Delete conversation</button>}
        </div>
      )}

      {tab === 'pins' && (pinned.length ? (
        <div>
          {pinned.map(m => (
            <button key={m.id} className="chat-row" onClick={() => onJump(m.id)}>
              <Pin size={15} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--warn)' }} />
              <span className="chat-row-main">
                <span className="chat-row-prev">{m.senderName} · {fmtDay(m.createdAt)}</span>
                <span className="chat-row-name" style={{ fontWeight: 500 }}>{previewOf(m)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : <div className="chat-empty">Nothing pinned yet. Open a message’s menu and choose Pin to keep it here.</div>)}

      {tab === 'files' && (files.length ? (
        <div className="chat-file-grid">
          {files.map((f, i) => (f.type?.startsWith('image/')
            ? <a key={i} href={urlOf(f)} target="_blank" rel="noreferrer"><img src={urlOf(f)} alt={f.name} loading="lazy" /></a>
            : <a key={i} href={urlOf(f)} target="_blank" rel="noreferrer" className="chat-doc" title={`${f.name} — ${f.by}`}><FileText size={15} /><span>{f.name}</span></a>))}
        </div>
      ) : <div className="chat-empty">No files in the messages loaded so far. Scroll up in the conversation to load older ones.</div>)}
    </Drawer>
  );
}
