import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { PageLoader } from '../components/ui/CodelixLoader';
import { supabase } from '../lib/supabase';
import { directoryDB, notificationsDB, uploadProjectFile } from '../lib/db';
import {
  chat, toMessage, toChannel, toReaction, sameId, personKey, initialsOf, colorFor, fmtTime, fmtDay, fmtListTime,
  extractMentions, formatSegments, QUICK_REACTIONS, EMOJIS, PAGE,
} from '../lib/chat';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { PARTNERS } from '../data/mockData';
import {
  Send, Paperclip, Users, X, Trash2, UserPlus, MessageSquare, FileText, Loader2, Check, CheckCheck, Hash, Search,
  Smile, Reply, Pencil, Pin, PinOff, Copy, BellOff, Bell, Info, ArrowLeft, ArrowDown, LogOut, RotateCcw, Plus, AlertCircle,
} from 'lucide-react';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const MAX_FILE = 20 * 1024 * 1024;

export default function Chat() {
  const { isPartner, can } = useAuth();
  const ctx = useChat();
  const me = ctx.me;
  const canStart = isPartner || can('chat', 'create');
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');
  const setActiveId = useCallback(id => setParams(id ? { c: id } : {}, { replace: false }), [setParams]);

  const [people, setPeople] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msgs, setMsgs] = useState({});              // channelId → { list, hasMore }
  const [reactions, setReactions] = useState([]);    // active channel
  const [reads, setReads] = useState([]);            // active channel: others' read markers
  const [typing, setTyping] = useState({});          // personKey → { name, until }
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [files, setFiles] = useState([]);            // { file, url }
  const [dragOver, setDragOver] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reactFor, setReactFor] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const [firstUnreadId, setFirstUnreadId] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [tapped, setTapped] = useState(null);       // touch screens: message whose actions are open
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const typingSent = useRef(0);
  const typingChan = useRef(null);
  const channelsRef = useRef([]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  const atBottomRef = useRef(true);
  useEffect(() => { atBottomRef.current = atBottom; }, [atBottom]);

  const isMember = useCallback(c => me && (c.members || []).some(m => sameId(m, me)), [me]);
  const active = channels.find(c => c.id === activeId) || null;
  const list = useMemo(() => msgs[activeId]?.list || [], [msgs, activeId]);
  const byId = useMemo(() => new Map(list.map(m => [m.id, m])), [list]);

  // ── load ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!me) return;
    (async () => {
      try {
        const [team, chans] = await Promise.all([directoryDB.team(), chat.channels()]);
        setPeople([
          ...PARTNERS.map(p => ({ id: p, name: p, kind: 'partner', role: 'Partner' })),
          ...team.filter(e => e.status === 'Active').map(e => ({ id: e.id, name: e.name, kind: 'employee', role: e.role || 'Team' })),
        ]);
        setChannels(chans.filter(isMember));
      } catch (e) { setError(e.message); }
      setLoading(false);
    })();
  }, [me, isMember]);

  // tell the app-wide context which conversation is on screen
  useEffect(() => { ctx.setActive(activeId); return () => ctx.setActive(null); }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // open a conversation: messages, reactions, read markers, "new messages" line
  useEffect(() => {
    if (!activeId || !me) return;
    let off = false;
    const unreadNow = ctx.unread[activeId]?.unread || 0;
    setReplyTo(null); setEditing(null); setText(''); setFiles([]); setNewBelow(0); setFirstUnreadId(null);
    (async () => {
      if (!msgs[activeId]) setLoadingMsgs(true);
      try {
        const [m, r, rd] = await Promise.all([chat.messages(activeId), chat.reactions(activeId), chat.reads(activeId)]);
        if (off) return;
        setMsgs(x => ({ ...x, [activeId]: { list: m, hasMore: m.length === PAGE } }));
        setReactions(r); setReads(rd);
        if (unreadNow) {
          const others = m.filter(x => !sameId({ kind: x.senderKind, id: x.senderId }, me) && !x.deleted);
          setFirstUnreadId(others[Math.max(0, others.length - unreadNow)]?.id || null);
        }
        const missing = [...new Set(m.map(x => x.replyTo).filter(id => id && !m.some(y => y.id === id)))];
        if (missing.length) chat.messagesById(missing).then(extra => !off && setMsgs(x => ({ ...x, [`ref:${activeId}`]: { list: extra } }))).catch(() => {});
      } catch (e) { setError(e.message); }
      setLoadingMsgs(false);
      ctx.markRead(activeId);
      requestAnimationFrame(() => scrollToBottom(false));
    })();
    return () => { off = true; };
  }, [activeId, me]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── realtime: messages, channels, reactions, read markers ────────
  useEffect(() => {
    if (!me) return;
    const ch = supabase.channel('chat-page-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, ({ eventType, new: row }) => {
        if (eventType === 'DELETE' || !row?.id) return;
        const m = toMessage(row);
        setMsgs(x => {
          const cur = x[m.channelId];
          if (!cur) return x;
          const i = cur.list.findIndex(y => y.id === m.id || (m.clientId && y.clientId === m.clientId));
          const next = i >= 0 ? cur.list.map((y, k) => k === i ? m : y) : [...cur.list, m];
          return { ...x, [m.channelId]: { ...cur, list: next } };
        });
        if (eventType === 'INSERT' && m.channelId === activeIdRef.current && !sameId({ kind: m.senderKind, id: m.senderId }, me)) {
          setTyping(t => { const n = { ...t }; delete n[`${m.senderKind}:${m.senderId}`]; return n; });
          if (!atBottomRef.current) setNewBelow(n => n + 1); else requestAnimationFrame(() => scrollToBottom(true));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_channels' }, ({ eventType, new: row, old }) => {
        if (eventType === 'DELETE') { setChannels(cs => cs.filter(c => c.id !== old.id)); return; }
        const c = toChannel(row);
        setChannels(cs => {
          const without = cs.filter(x => x.id !== c.id);
          return isMember(c) ? sortChannels([c, ...without]) : without;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reactions' }, ({ eventType, new: row, old }) => {
        if (eventType === 'DELETE') { setReactions(rs => rs.filter(r => r.id !== old.id)); return; }
        if (row.channel_id !== activeIdRef.current) return;
        const r = toReaction(row);
        setReactions(rs => rs.some(x => x.id === r.id) ? rs : [...rs, r]);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' }, ({ new: row }) => {
        if (!row || row.channel_id !== activeIdRef.current) return;
        setReads(rs => [...rs.filter(r => !(r.kind === row.member_kind && String(r.id) === String(row.member_id))), { kind: row.member_kind, id: row.member_id, lastReadAt: row.last_read_at, muted: row.muted }]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, isMember]); // eslint-disable-line react-hooks/exhaustive-deps

  // typing indicator (private broadcast channel, members only)
  useEffect(() => {
    if (!activeId || !me) return;
    const ch = supabase.channel(`chat:${activeId}`, { config: { private: true, broadcast: { self: false } } });
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload?.key || payload.key === personKey(me)) return;
      setTyping(t => ({ ...t, [payload.key]: { name: payload.name, until: Date.now() + 4000 } }));
    }).subscribe();
    typingChan.current = ch;
    setTyping({});
    return () => { supabase.removeChannel(ch); typingChan.current = null; };
  }, [activeId, me]);
  useEffect(() => {
    const i = setInterval(() => setTyping(t => { const now = Date.now(); const n = Object.fromEntries(Object.entries(t).filter(([, v]) => v.until > now)); return Object.keys(n).length === Object.keys(t).length ? t : n; }), 1500);
    return () => clearInterval(i);
  }, []);
  function signalTyping() {
    if (!typingChan.current || Date.now() - typingSent.current < 2500) return;
    typingSent.current = Date.now();
    typingChan.current.send({ type: 'broadcast', event: 'typing', payload: { key: personKey(me), name: me.name } });
  }

  // mark read when returning to the tab
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && activeIdRef.current) ctx.markRead(activeIdRef.current); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [ctx]);

  // message search (server side, only my conversations)
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => chat.search(q.trim()).then(r => setFound(r.filter(x => channelsRef.current.some(c => c.id === x.channel_id)))).catch(() => setFound([])), 300);
    return () => clearTimeout(t);
  }, [q]);

  // ── scrolling ────────────────────────────────────────────────────
  function scrollToBottom(smooth) {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewBelow(0);
  }
  function onScroll(e) {
    const el = e.currentTarget;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (bottom && newBelow) { setNewBelow(0); ctx.markRead(activeId); }
    if (el.scrollTop < 60 && msgs[activeId]?.hasMore && !loadingOlder) loadOlder();
  }
  async function loadOlder() {
    const cur = msgs[activeId];
    if (!cur?.list.length) return;
    setLoadingOlder(true);
    const el = scrollRef.current, prevH = el?.scrollHeight || 0;
    try {
      const older = await chat.messages(activeId, cur.list[0].createdAt);
      setMsgs(x => ({ ...x, [activeId]: { list: [...older, ...x[activeId].list], hasMore: older.length === PAGE } }));
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevH; });
    } catch (e) { setError(e.message); }
    setLoadingOlder(false);
  }
  function jumpTo(id) {
    const node = document.getElementById(`msg-${id}`);
    if (node) { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); setHighlight(id); setTimeout(() => setHighlight(null), 1600); }
  }

  // ── sending ──────────────────────────────────────────────────────
  function addFiles(list) {
    const ok = [], bad = [];
    for (const f of list) (f.size > MAX_FILE ? bad : ok).push(f);
    if (bad.length) setError(`${bad.map(f => f.name).join(', ')} ${bad.length > 1 ? 'are' : 'is'} over 20 MB`);
    setFiles(fs => [...fs, ...ok.map(f => ({ file: f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }))]);
  }

  async function send(retry) {
    if (!active || !me) return;
    if (editing && !retry) return saveEdit();
    const body = retry ? retry.text : text.trim();
    const pending = retry ? [] : files;
    if (!body && !pending.length && !retry) return;
    const clientId = retry?.clientId || uid();
    const mentions = extractMentions(body, people).filter(p => !sameId(p, me));
    const reply = retry ? retry.replyTo : replyTo?.id || null;
    const optimistic = { id: `tmp-${clientId}`, clientId, channelId: active.id, senderId: me.id, senderName: me.name, senderKind: me.kind, text: body, attachments: retry?.attachments || pending.map(f => ({ name: f.file.name, type: f.file.type, url: f.url, uploading: true })), replyTo: reply, mentions, createdAt: new Date().toISOString(), status: 'sending' };
    setMsgs(x => ({ ...x, [active.id]: { ...(x[active.id] || { hasMore: false }), list: [...(x[active.id]?.list || []).filter(m => m.clientId !== clientId), optimistic] } }));
    if (!retry) { setText(''); setFiles([]); setReplyTo(null); setEmojiOpen(false); }
    requestAnimationFrame(() => scrollToBottom(true));
    try {
      const attachments = retry ? retry.attachments : await Promise.all(pending.map(f => uploadProjectFile(f.file)));
      const saved = await chat.send({ channelId: active.id, me, text: body, attachments, replyTo: reply, mentions, clientId });
      setMsgs(x => ({ ...x, [active.id]: { ...x[active.id], list: x[active.id].list.map(m => m.clientId === clientId ? saved : m) } }));
      if (mentions.length) notificationsDB.createMany(mentions.map(p => ({ recipientKind: p.kind, recipientId: p.id, type: 'chat', title: `${me.name} mentioned you in ${channelLabel(active)}`, body: body.slice(0, 140) }))).catch(() => {});
      ctx.markRead(active.id);
    } catch (e) {
      setMsgs(x => ({ ...x, [active.id]: { ...x[active.id], list: x[active.id].list.map(m => m.clientId === clientId ? { ...m, status: 'failed', error: e.message } : m) } }));
    }
  }

  async function saveEdit() {
    const body = text.trim();
    if (!body) return;
    const m = editing;
    setEditing(null); setText('');
    setMsgs(x => ({ ...x, [m.channelId]: { ...x[m.channelId], list: x[m.channelId].list.map(y => y.id === m.id ? { ...y, text: body, editedAt: new Date().toISOString() } : y) } }));
    try { await chat.edit(m.id, body); } catch (e) { setError(e.message); }
  }

  async function removeMsg(m) {
    setMsgs(x => ({ ...x, [m.channelId]: { ...x[m.channelId], list: x[m.channelId].list.map(y => y.id === m.id ? { ...y, deleted: true, text: '', attachments: [] } : y) } }));
    try { await chat.remove(m.id); } catch (e) { setError(e.message); }
  }

  async function togglePin(m) {
    setMsgs(x => ({ ...x, [m.channelId]: { ...x[m.channelId], list: x[m.channelId].list.map(y => y.id === m.id ? { ...y, pinned: !m.pinned } : y) } }));
    try { await chat.setPinned(m.id, !m.pinned); } catch (e) { setError(e.message); }
  }

  async function toggleReaction(m, emoji) {
    setReactFor(null);
    const mine = reactions.find(r => r.messageId === m.id && r.emoji === emoji && sameId({ kind: r.personKind, id: r.personId }, me));
    try {
      if (mine) { setReactions(rs => rs.filter(r => r.id !== mine.id)); await chat.unreact(mine.id); }
      else { const r = await chat.react({ message: m, emoji, me }); setReactions(rs => rs.some(x => x.id === r.id) ? rs : [...rs, r]); }
    } catch (e) { setError(e.message); }
  }

  // ── conversations ───────────────────────────────────────────────
  function channelLabel(c) {
    if (!c) return '';
    if (c.type === 'group') return c.name || 'Group';
    return (c.members || []).find(m => !sameId(m, me))?.name || 'Direct message';
  }
  const dmOther = c => c?.type === 'dm' ? (c.members || []).find(m => !sameId(m, me)) : null;
  const isAdmin = c => isPartner || (c?.createdBy === me?.name) || (c?.admins || []).some(a => sameId(a, me));

  async function startChat({ mode, picked, name, description }) {
    if (mode === 'dm') {
      const other = picked[0];
      const existing = channels.find(c => c.type === 'dm' && c.members.length === 2 && c.members.some(m => sameId(m, other)));
      if (existing) { setActiveId(existing.id); return; }
      const c = await chat.createChannel({ type: 'dm', members: [me, other], createdBy: me.name });
      setChannels(cs => sortChannels([c, ...cs.filter(x => x.id !== c.id)])); setActiveId(c.id);
    } else {
      const c = await chat.createChannel({ type: 'group', name, description, members: [me, ...picked], createdBy: me.name, admins: [{ kind: me.kind, id: me.id }] });
      setChannels(cs => sortChannels([c, ...cs.filter(x => x.id !== c.id)])); setActiveId(c.id);
    }
  }

  async function updateActive(patch) {
    try { const c = await chat.updateChannel(active.id, patch); setChannels(cs => cs.map(x => x.id === c.id ? c : x)); return c; }
    catch (e) { setError(e.message); }
  }

  // ── derived ──────────────────────────────────────────────────────
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return channels.filter(c => {
      if (tab === 'unread' && !(ctx.unread[c.id]?.unread > 0)) return false;
      if (tab === 'groups' && c.type !== 'group') return false;
      if (tab === 'dms' && c.type !== 'dm') return false;
      return !s || channelLabel(c).toLowerCase().includes(s) || (c.members || []).some(m => m.name?.toLowerCase().includes(s));
    });
  }, [channels, tab, q, ctx.unread]); // eslint-disable-line react-hooks/exhaustive-deps

  const reactionsByMsg = useMemo(() => {
    const m = new Map();
    reactions.forEach(r => { if (!m.has(r.messageId)) m.set(r.messageId, new Map()); const g = m.get(r.messageId); if (!g.has(r.emoji)) g.set(r.emoji, []); g.get(r.emoji).push(r); });
    return m;
  }, [reactions]);

  const othersReads = reads.filter(r => !sameId(r, me));
  const seenBy = m => othersReads.filter(r => r.lastReadAt >= m.createdAt);
  const lastMine = [...list].reverse().find(m => sameId({ kind: m.senderKind, id: m.senderId }, me) && !m.deleted && !m.status);
  const typingNames = Object.values(typing).map(t => t.name);
  const refMsg = id => byId.get(id) || (msgs[`ref:${activeId}`]?.list || []).find(m => m.id === id);
  const pinnedList = list.filter(m => m.pinned && !m.deleted);
  const sharedFiles = list.filter(m => !m.deleted).flatMap(m => m.attachments.map(a => ({ ...a, at: m.createdAt, by: m.senderName })));

  if (!me || loading) return <div style={{ height: '100%' }}><Header title="Chat" /><PageLoader /></div>;

  return (
    <div className="chat-root">
      <Header title="Chat" subtitle={`${channels.length} conversation${channels.length === 1 ? '' : 's'}${ctx.totalUnread ? ` · ${ctx.totalUnread} unread` : ''}`}
        actions={<>
          {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
            <button onClick={() => Notification.requestPermission().then(() => setError(''))} className="mac-btn mac-btn-secondary" style={{ fontSize: 12.5 }}><Bell size={13} /> <span className="chat-btn-label">Desktop alerts</span></button>
          )}
          {canStart && <button onClick={() => setShowNew('dm')} className="mac-btn mac-btn-secondary" style={{ fontSize: 13 }}><MessageSquare size={13} /> <span className="chat-btn-label">New chat</span></button>}
          {canStart && <button onClick={() => setShowNew('group')} className="mac-btn mac-btn-primary" style={{ fontSize: 13 }}><Users size={13} /> <span className="chat-btn-label">New group</span></button>}
        </>} />

      {error && <div className="chat-error"><AlertCircle size={13} /> {error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={12} /></button></div>}

      <div className={`chat-shell ${activeId ? 'has-active' : ''}`}>
        {/* ── conversation list ── */}
        <aside className="chat-list">
          <div style={{ padding: '12px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: 11, color: '#AEAEB2' }} />
              <input className="mac-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search chats & messages" style={{ paddingLeft: 30, fontSize: 13 }} aria-label="Search chats and messages" />
            </div>
            <div className="tab-bar">
              {[['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups'], ['dms', 'Direct']].map(([k, l]) => (
                <button key={k} className={`tab-item ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)} style={{ flex: 1, fontSize: 12, padding: '4px 6px' }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
            {shown.length === 0 && <div className="chat-empty">{channels.length ? 'Nothing here' : canStart ? 'No conversations yet — start one above.' : 'No conversations yet. Someone will add you soon.'}</div>}
            {shown.map(c => {
              const u = ctx.unread[c.id] || {};
              const other = dmOther(c);
              const label = channelLabel(c);
              const muted = ctx.muted[c.id];
              return (
                <button key={c.id} onClick={() => setActiveId(c.id)} className={`chat-row ${c.id === activeId ? 'on' : ''}`}>
                  <span style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar name={label} group={c.type === 'group'} size={40} />
                    {other && ctx.isOnline(other) && <span className="chat-dot" title="Online" />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span className="chat-row-name" style={{ fontWeight: u.unread ? 700 : 560 }}>{label}</span>
                      <span style={{ fontSize: 10.5, color: u.unread && !muted ? '#0071E3' : '#AEAEB2', flexShrink: 0 }}>{fmtListTime(c.lastMessageAt)}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="chat-row-prev" style={{ color: u.unread ? '#3C3C43' : '#8E8E93' }}>{c.lastMessagePreview || (c.type === 'group' ? `${c.members.length} members` : 'Say hello 👋')}</span>
                      {muted && <BellOff size={11} color="#AEAEB2" />}
                      {u.mentions > 0 && <span className="chat-badge at">@</span>}
                      {u.unread > 0 && <span className={`chat-badge ${muted ? 'muted' : ''}`}>{u.unread > 99 ? '99+' : u.unread}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
            {found.length > 0 && (
              <>
                <div className="chat-sec">Messages</div>
                {found.map(f => {
                  const c = channels.find(x => x.id === f.channel_id);
                  return (
                    <button key={f.id} className="chat-row" onClick={() => { setActiveId(f.channel_id); setTimeout(() => jumpTo(f.id), 700); }}>
                      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#8E8E93' }}><span>{channelLabel(c)} · {f.sender_name}</span><span>{fmtListTime(f.created_at)}</span></span>
                        <span className="chat-row-prev" style={{ color: '#1D1D1F' }}>{f.text}</span>
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </aside>

        {/* ── conversation ── */}
        <section className="chat-thread" onDragOver={e => { if (active) { e.preventDefault(); setDragOver(true); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (active && e.dataTransfer.files?.length) addFiles([...e.dataTransfer.files]); }}>
          {!active ? (
            <div className="chat-placeholder"><MessageSquare size={34} color="#C7C7CC" /><div>Select a conversation{canStart ? ' or start a new one' : ''}</div></div>
          ) : (
            <>
              <div className="chat-head">
                <button className="chat-back" onClick={() => setActiveId(null)} aria-label="Back to conversations"><ArrowLeft size={16} /></button>
                <span style={{ position: 'relative' }}><Avatar name={channelLabel(active)} group={active.type === 'group'} size={36} />{dmOther(active) && ctx.isOnline(dmOther(active)) && <span className="chat-dot" />}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channelLabel(active)}</div>
                  <div style={{ fontSize: 11.5, color: typingNames.length ? '#0071E3' : '#8E8E93', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {typingNames.length ? `${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…`
                      : active.type === 'dm' ? (ctx.isOnline(dmOther(active)) ? 'Online' : 'Offline')
                        : `${active.members.filter(m => ctx.isOnline(m)).length} online · ${active.members.map(m => sameId(m, me) ? 'You' : m.name.split(' ')[0]).join(', ')}`}
                  </div>
                </div>
                {pinnedList.length > 0 && <button className="mac-btn mac-btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowInfo('pins')}><Pin size={12} /> {pinnedList.length}</button>}
                <button className="chat-icon" onClick={() => ctx.toggleMute(active.id)} title={ctx.muted[active.id] ? 'Unmute' : 'Mute'} aria-label="Mute">{ctx.muted[active.id] ? <BellOff size={15} /> : <Bell size={15} />}</button>
                <button className="chat-icon" onClick={() => setShowInfo(s => s ? false : 'info')} title="Details" aria-label="Conversation details"><Info size={15} /></button>
              </div>

              <div className="chat-body">
                <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
                  {loadingOlder && <div className="chat-sys"><Loader2 size={13} className="spin" /> Loading earlier messages…</div>}
                  {!msgs[activeId]?.hasMore && list.length > 0 && <div className="chat-sys">This is the start of your conversation with {channelLabel(active)}</div>}
                  {loadingMsgs && !list.length ? <PageLoader /> : list.length === 0 ? <div className="chat-placeholder" style={{ flex: 1 }}><span style={{ fontSize: 30 }}>👋</span><div>No messages yet. Say hello!</div></div> : list.map((m, i) => {
                    const prev = list[i - 1];
                    const mine = sameId({ kind: m.senderKind, id: m.senderId }, me);
                    const newDay = !prev || fmtDay(prev.createdAt) !== fmtDay(m.createdAt);
                    const grouped = prev && !newDay && prev.senderId === m.senderId && prev.senderKind === m.senderKind && (new Date(m.createdAt) - new Date(prev.createdAt)) < 5 * 60000 && !prev.deleted;
                    const rx = reactionsByMsg.get(m.id);
                    const quoted = m.replyTo ? refMsg(m.replyTo) : null;
                    const seen = mine && m === lastMine ? seenBy(m) : null;
                    return (
                      <Fragment key={m.clientId || m.id}>
                        {newDay && <div className="chat-day"><span>{fmtDay(m.createdAt)}</span></div>}
                        {m.id === firstUnreadId && <div className="chat-new"><span>New messages</span></div>}
                        <div id={`msg-${m.id}`} className={`chat-msg ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''} ${highlight === m.id ? 'flash' : ''}`}>
                          {!mine && <span className="chat-msg-av">{!grouped && <Avatar name={m.senderName} size={30} />}</span>}
                          <div className="chat-msg-col">
                            {!mine && !grouped && active.type === 'group' && <span className="chat-sender" style={{ color: colorFor(m.senderName) }}>{m.senderName}</span>}
                            <div className={`chat-bubble-wrap ${tapped === m.id ? 'tapped' : ''}`} onClick={e => { if (!e.target.closest('a, .chat-actions, .chat-quote')) setTapped(t => t === m.id ? null : m.id); }}>
                              <div className={`chat-bubble ${m.deleted ? 'deleted' : ''} ${m.pinned ? 'pinned' : ''}`}>
                                {m.pinned && !m.deleted && <span className="chat-pin"><Pin size={10} /> Pinned</span>}
                                {quoted && !m.deleted && (
                                  <button className="chat-quote" onClick={() => jumpTo(quoted.id)}>
                                    <strong>{sameId({ kind: quoted.senderKind, id: quoted.senderId }, me) ? 'You' : quoted.senderName}</strong>
                                    <span>{quoted.deleted ? 'This message was deleted' : quoted.text || (quoted.attachments.length ? '📎 Attachment' : '')}</span>
                                  </button>
                                )}
                                {m.deleted ? <em>🚫 This message was deleted</em> : <>
                                  {m.text && <div className="chat-text"><Rich text={m.text} mine={mine} /></div>}
                                  {m.attachments.length > 0 && <Attachments items={m.attachments} mine={mine} hasText={!!m.text} />}
                                </>}
                                <span className="chat-meta">
                                  {m.editedAt && !m.deleted && <span>edited</span>}
                                  {fmtTime(m.createdAt)}
                                  {mine && !m.deleted && (m.status === 'sending' ? <Loader2 size={11} className="spin" /> : m.status === 'failed' ? <AlertCircle size={11} color="#FF3B30" />
                                    : (active.type === 'dm' && seenBy(m).length) ? <CheckCheck size={13} color={mine ? '#BFE0FF' : '#0071E3'} aria-label="Seen" /> : <Check size={12} aria-label="Sent" />)}
                                </span>
                              </div>
                              {!m.deleted && !m.status && (
                                <div className="chat-actions">
                                  <button onClick={() => setReactFor(reactFor === m.id ? null : m.id)} title="React" aria-label="React"><Smile size={14} /></button>
                                  <button onClick={() => { setReplyTo(m); setEditing(null); inputRef.current?.focus(); }} title="Reply" aria-label="Reply"><Reply size={14} /></button>
                                  {m.text && <button onClick={() => navigator.clipboard?.writeText(m.text)} title="Copy" aria-label="Copy"><Copy size={13} /></button>}
                                  <button onClick={() => togglePin(m)} title={m.pinned ? 'Unpin' : 'Pin'} aria-label="Pin">{m.pinned ? <PinOff size={13} /> : <Pin size={13} />}</button>
                                  {mine && m.text && <button onClick={() => { setEditing(m); setReplyTo(null); setText(m.text); inputRef.current?.focus(); }} title="Edit" aria-label="Edit"><Pencil size={13} /></button>}
                                  {mine && <button onClick={() => setConfirm({ kind: 'msg', m })} title="Delete" aria-label="Delete"><Trash2 size={13} /></button>}
                                  {reactFor === m.id && (
                                    <div className="chat-react-pop">{QUICK_REACTIONS.map(e => <button key={e} onClick={() => toggleReaction(m, e)}>{e}</button>)}</div>
                                  )}
                                </div>
                              )}
                            </div>
                            {m.status === 'failed' && <button className="chat-retry" onClick={() => send(m)}><RotateCcw size={11} /> Not sent — tap to retry</button>}
                            {rx && (
                              <div className="chat-rx">
                                {[...rx.entries()].map(([emoji, rs]) => {
                                  const minePick = rs.some(r => sameId({ kind: r.personKind, id: r.personId }, me));
                                  return <button key={emoji} className={minePick ? 'on' : ''} title={rs.map(r => r.personName).join(', ')} onClick={() => toggleReaction(m, emoji)}>{emoji} {rs.length}</button>;
                                })}
                              </div>
                            )}
                            {seen && active.type === 'group' && seen.length > 0 && <span className="chat-seen">Seen by {seen.map(r => active.members.find(x => sameId(x, r))?.name?.split(' ')[0] || '').filter(Boolean).join(', ')}</span>}
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}
                  {typingNames.length > 0 && <div className="chat-typing"><span /><span /><span /> <em>{typingNames.join(', ')} typing</em></div>}
                </div>
                {!atBottom && <button className="chat-jump" onClick={() => { scrollToBottom(true); ctx.markRead(activeId); }} aria-label="Scroll to latest">{newBelow > 0 && <span>{newBelow}</span>}<ArrowDown size={16} /></button>}
                {dragOver && <div className="chat-drop">Drop files to send</div>}
              </div>

              {/* composer */}
              <div className="chat-compose">
                {(replyTo || editing) && (
                  <div className="chat-compose-bar">
                    {editing ? <Pencil size={13} color="#0071E3" /> : <Reply size={13} color="#0071E3" />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 650, color: '#0071E3' }}>{editing ? 'Editing message' : `Replying to ${sameId({ kind: replyTo.senderKind, id: replyTo.senderId }, me) ? 'yourself' : replyTo.senderName}`}</div>
                      <div style={{ fontSize: 12, color: '#6E6E73', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(editing || replyTo).text || '📎 Attachment'}</div>
                    </div>
                    <button className="chat-icon" onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setText(''); } }} aria-label="Cancel"><X size={14} /></button>
                  </div>
                )}
                {files.length > 0 && (
                  <div className="chat-files">
                    {files.map((f, i) => (
                      <div key={i} className="chat-file">
                        {f.url ? <img src={f.url} alt={f.file.name} /> : <FileText size={20} color="#8E8E93" />}
                        <span>{f.file.name}</span>
                        <button onClick={() => setFiles(fs => fs.filter((_, k) => k !== i))} aria-label={`Remove ${f.file.name}`}><X size={11} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="chat-compose-row">
                  <input ref={fileRef} type="file" multiple hidden onChange={e => { addFiles([...(e.target.files || [])]); e.target.value = ''; }} />
                  <button className="chat-icon" onClick={() => fileRef.current?.click()} title="Attach files" aria-label="Attach files"><Paperclip size={17} /></button>
                  <div style={{ position: 'relative' }}>
                    <button className="chat-icon" onClick={() => setEmojiOpen(o => !o)} title="Emoji" aria-label="Emoji"><Smile size={17} /></button>
                    {emojiOpen && <div className="chat-emoji">{EMOJIS.map(e => <button key={e} onClick={() => { setText(t => t + e); inputRef.current?.focus(); }}>{e}</button>)}</div>}
                  </div>
                  <Composer inputRef={inputRef} text={text} setText={setText} people={active.members.filter(p => !sameId(p, me))}
                    onEnter={() => send()} onTyping={signalTyping} onPasteFiles={addFiles}
                    onEscape={() => { if (editing) { setEditing(null); setText(''); } setReplyTo(null); setEmojiOpen(false); }}
                    onArrowUpEmpty={() => { if (lastMine?.text) { setEditing(lastMine); setText(lastMine.text); } }} />
                  <button onClick={() => send()} disabled={!text.trim() && !files.length} className="chat-send" aria-label={editing ? 'Save edit' : 'Send'}>{editing ? <Check size={17} /> : <Send size={16} />}</button>
                </div>
                <div className="chat-hint">Enter to send · Shift+Enter new line · ↑ edit last · *bold* _italic_ `code` · @ to mention · paste or drop files</div>
              </div>
            </>
          )}
        </section>

        {/* ── details panel ── */}
        {active && showInfo && (
          <InfoPanel tab={showInfo} setTab={setShowInfo} channel={active} me={me} label={channelLabel(active)} people={people} isAdmin={isAdmin(active)} isPartner={isPartner}
            online={ctx.isOnline} muted={ctx.muted[active.id]} onMute={() => ctx.toggleMute(active.id)} pinned={pinnedList} files={sharedFiles}
            onJump={id => jumpTo(id)} onUpdate={updateActive}
            onLeave={() => setConfirm({ kind: 'leave' })} onDelete={() => setConfirm({ kind: 'delete' })} onClose={() => setShowInfo(false)} />
        )}
      </div>

      {showNew && <NewChatModal mode={showNew} people={people.filter(p => !sameId(p, me))} online={ctx.isOnline} onClose={() => setShowNew(false)}
        onCreate={async v => { try { await startChat(v); setShowNew(false); } catch (e) { setError(e.message); } }} />}

      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)}
        title={confirm?.kind === 'msg' ? 'Delete message' : confirm?.kind === 'leave' ? 'Leave group' : 'Delete conversation'}
        message={confirm?.kind === 'msg' ? 'Delete this message for everyone? Others will see “This message was deleted”.'
          : confirm?.kind === 'leave' ? `You will stop receiving messages from ${channelLabel(active)}.` : 'Permanently delete this conversation and all its messages for everyone?'}
        onConfirm={async () => {
          const c = confirm; setConfirm(null);
          try {
            if (c.kind === 'msg') await removeMsg(c.m);
            if (c.kind === 'leave') { await chat.updateChannel(active.id, { members: active.members.filter(m => !sameId(m, me)) }); setChannels(cs => cs.filter(x => x.id !== active.id)); setActiveId(null); setShowInfo(false); }
            if (c.kind === 'delete') { await chat.deleteChannel(active.id); setChannels(cs => cs.filter(x => x.id !== active.id)); setActiveId(null); setShowInfo(false); }
          } catch (e) { setError(e.message); }
        }} />

      <style>{CHAT_CSS}</style>
    </div>
  );
}

const sortChannels = cs => [...cs].sort((a, b) => new Date(b.lastMessageAt || b.createdAt || 0) - new Date(a.lastMessageAt || a.createdAt || 0));

function Avatar({ name, group, size = 36 }) {
  const c = colorFor(name || '');
  return <span className="chat-av" style={{ width: size, height: size, borderRadius: group ? size * 0.3 : '50%', background: group ? 'linear-gradient(135deg,#AF52DE,#5856D6)' : c, fontSize: size * 0.36 }}>
    {group ? <Hash size={size * 0.42} /> : initialsOf(name)}
  </span>;
}

function Rich({ text, mine }) {
  return formatSegments(text).map((s, i) => {
    if (s.t === 'link') return <a key={i} href={s.v} target="_blank" rel="noreferrer" style={{ color: mine ? '#fff' : '#0071E3', textDecoration: 'underline' }}>{s.v}</a>;
    if (s.t === 'code') return <code key={i} className="chat-code">{s.v}</code>;
    if (s.t === 'bold') return <strong key={i}>{s.v}</strong>;
    if (s.t === 'italic') return <em key={i}>{s.v}</em>;
    if (s.t === 'mention') return <span key={i} style={{ fontWeight: 650, color: mine ? '#fff' : '#0071E3', background: mine ? 'rgba(255,255,255,0.18)' : 'rgba(0,113,227,0.08)', borderRadius: 4, padding: '0 3px' }}>{s.v}</span>;
    return <Fragment key={i}>{s.v}</Fragment>;
  });
}

function Attachments({ items, mine, hasText }) {
  const imgs = items.filter(a => a.type?.startsWith('image/'));
  const docs = items.filter(a => !a.type?.startsWith('image/'));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: hasText ? 6 : 0 }}>
      {imgs.length > 0 && <div className={`chat-imgs n${Math.min(imgs.length, 4)}`}>{imgs.slice(0, 4).map((a, i) => (
        <a key={i} href={a.uploading ? undefined : a.url} target="_blank" rel="noreferrer" style={{ position: 'relative' }}>
          <img src={a.url} alt={a.name} style={{ opacity: a.uploading ? 0.5 : 1 }} />
          {i === 3 && imgs.length > 4 && <span className="chat-more">+{imgs.length - 4}</span>}
        </a>
      ))}</div>}
      {docs.map((a, i) => (
        <a key={i} href={a.uploading ? undefined : a.url} target="_blank" rel="noreferrer" className="chat-doc" style={{ background: mine ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.05)' }}>
          {a.uploading ? <Loader2 size={15} className="spin" /> : <FileText size={15} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
          {a.size ? <span style={{ opacity: 0.7, fontSize: 10.5, flexShrink: 0 }}>{a.size < 1048576 ? `${Math.round(a.size / 1024)} KB` : `${(a.size / 1048576).toFixed(1)} MB`}</span> : null}
        </a>
      ))}
    </div>
  );
}

// Auto-growing input with @mention suggestions
function Composer({ inputRef, text, setText, people, onEnter, onTyping, onPasteFiles, onEscape, onArrowUpEmpty }) {
  const [sel, setSel] = useState(0);
  const query = (text.match(/(?:^|\s)@([\w]*)$/) || [])[1];
  const opts = query != null ? people.filter(p => p.name.toLowerCase().split(' ').some(w => w.startsWith(query.toLowerCase()))).slice(0, 6) : [];
  useEffect(() => {
    const el = inputRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }
  }, [text, inputRef]);
  const pick = p => { setText(text.replace(/@[\w]*$/, `@${p.name} `)); setSel(0); inputRef.current?.focus(); };
  return (
    <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
      {opts.length > 0 && (
        <div className="chat-mention">
          {opts.map((p, i) => <button key={personKey(p)} className={i === sel ? 'on' : ''} onMouseDown={e => { e.preventDefault(); pick(p); }}><Avatar name={p.name} size={22} /> {p.name}</button>)}
        </div>
      )}
      <textarea ref={inputRef} rows={1} className="chat-input" value={text} placeholder="Type a message" aria-label="Message"
        onChange={e => { setText(e.target.value); onTyping(); }}
        onPaste={e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); onPasteFiles(fs); } }}
        onKeyDown={e => {
          if (opts.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => (s + 1) % opts.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => (s - 1 + opts.length) % opts.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(opts[sel] || opts[0]); return; }
          }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnter(); }
          if (e.key === 'Escape') onEscape();
          if (e.key === 'ArrowUp' && !text) { e.preventDefault(); onArrowUpEmpty(); }
        }} />
    </div>
  );
}

function NewChatModal({ mode: initial, people, online, onClose, onCreate }) {
  const [mode, setMode] = useState(initial);
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = p => setPicked(ps => ps.some(x => sameId(x, p)) ? ps.filter(x => !sameId(x, p)) : mode === 'dm' ? [p] : [...ps, p]);
  const shown = people.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  const ok = mode === 'dm' ? picked.length === 1 : name.trim() && picked.length > 0;
  return (
    <Modal isOpen onClose={onClose} title={mode === 'dm' ? 'New chat' : 'New group'} size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="tab-bar">{[['dm', 'Direct message'], ['group', 'Group']].map(([k, l]) => <button key={k} className={`tab-item ${mode === k ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => { setMode(k); setPicked([]); }}>{l}</button>)}</div>
        {mode === 'group' && <>
          <input className="mac-input" value={name} onChange={e => setName(e.target.value)} placeholder="Group name, e.g. Vedora team" autoFocus aria-label="Group name" />
          <input className="mac-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this group for? (optional)" aria-label="Group description" />
        </>}
        <input className="mac-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" />
        <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {shown.map(p => {
            const on = picked.some(x => sameId(x, p));
            return (
              <button key={personKey(p)} className={`chat-row ${on ? 'on' : ''}`} onClick={() => toggle(p)} onDoubleClick={() => mode === 'dm' && onCreate({ mode, picked: [p] })}>
                <span style={{ position: 'relative' }}><Avatar name={p.name} size={32} />{online(p) && <span className="chat-dot" />}</span>
                <span style={{ flex: 1, textAlign: 'left' }}><span style={{ display: 'block', fontSize: 13, fontWeight: 560 }}>{p.name}</span><span style={{ fontSize: 11, color: '#8E8E93' }}>{p.role}{online(p) ? ' · online' : ''}</span></span>
                {on && <Check size={15} color="#0071E3" />}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="mac-btn mac-btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
          <button disabled={!ok || busy} onClick={async () => { setBusy(true); await onCreate({ mode, picked, name: name.trim(), description: desc.trim() }); setBusy(false); }} className="mac-btn mac-btn-primary" style={{ fontSize: 13 }}>
            {mode === 'dm' ? 'Start chat' : `Create group${picked.length ? ` (${picked.length + 1})` : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function InfoPanel({ tab, setTab, channel, me, label, people, isAdmin, isPartner, online, muted, onMute, pinned, files, onJump, onUpdate, onLeave, onDelete, onClose }) {
  const [name, setName] = useState(channel.name || '');
  const [desc, setDesc] = useState(channel.description || '');
  const [adding, setAdding] = useState(false);
  useEffect(() => { setName(channel.name || ''); setDesc(channel.description || ''); }, [channel.id, channel.name, channel.description]);
  const group = channel.type === 'group';
  const notIn = people.filter(p => !channel.members.some(m => sameId(m, p)));
  return (
    <aside className="chat-info">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
        <div className="tab-bar" style={{ flex: 1 }}>
          {[['info', 'About'], ['pins', `Pinned${pinned.length ? ` ${pinned.length}` : ''}`], ['files', 'Files']].map(([k, l]) => <button key={k} className={`tab-item ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)} style={{ flex: 1, fontSize: 12 }}>{l}</button>)}
        </div>
        <button className="chat-icon" onClick={onClose} aria-label="Close details"><X size={15} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tab === 'info' && <>
          <div style={{ textAlign: 'center' }}><Avatar name={label} group={group} size={64} /><div style={{ fontSize: 15, fontWeight: 680, marginTop: 8 }}>{label}</div>
            <div style={{ fontSize: 12, color: '#8E8E93' }}>{group ? `Group · ${channel.members.length} members` : online(channel.members.find(m => !sameId(m, me))) ? 'Online' : 'Offline'}</div></div>
          {group && isAdmin && <>
            <input className="mac-input" value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== channel.name && onUpdate({ name: name.trim() })} aria-label="Group name" />
            <textarea className="mac-input" rows={2} value={desc} onChange={e => setDesc(e.target.value)} onBlur={() => desc !== (channel.description || '') && onUpdate({ description: desc })} placeholder="Add a description" aria-label="Description" />
          </>}
          {group && !isAdmin && channel.description && <div style={{ fontSize: 12.5, color: '#3C3C43' }}>{channel.description}</div>}
          <button className="mac-btn mac-btn-secondary" style={{ fontSize: 12.5 }} onClick={onMute}>{muted ? <><Bell size={13} /> Unmute notifications</> : <><BellOff size={13} /> Mute notifications</>}</button>
          {group && (
            <div>
              <div className="chat-sec" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Members {isAdmin && <button className="mac-btn mac-btn-ghost" style={{ fontSize: 11.5, padding: '2px 6px' }} onClick={() => setAdding(a => !a)}><UserPlus size={12} /> Add</button>}</div>
              {adding && notIn.map(p => <button key={personKey(p)} className="chat-row" onClick={() => onUpdate({ members: [...channel.members, { id: p.id, name: p.name, kind: p.kind }] })}><Plus size={13} color="#0071E3" /> <span style={{ fontSize: 12.5 }}>{p.name}</span></button>)}
              {channel.members.map(m => {
                const admin = channel.createdBy === m.name || (channel.admins || []).some(a => sameId(a, m));
                return (
                  <div key={personKey(m)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}>
                    <span style={{ position: 'relative' }}><Avatar name={m.name} size={28} />{online(m) && <span className="chat-dot" />}</span>
                    <span style={{ flex: 1, fontSize: 12.5 }}>{m.name}{sameId(m, me) && <span style={{ color: '#AEAEB2' }}> (you)</span>}</span>
                    {admin && <span style={{ fontSize: 10, color: '#8E8E93', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 4, padding: '0 4px' }}>admin</span>}
                    {isAdmin && !sameId(m, me) && <button className="chat-icon" style={{ width: 24, height: 24 }} onClick={() => onUpdate({ members: channel.members.filter(x => !sameId(x, m)) })} aria-label={`Remove ${m.name}`}><X size={12} color="#FF3B30" /></button>}
                  </div>
                );
              })}
            </div>
          )}
          {group && <button className="mac-btn mac-btn-secondary" style={{ fontSize: 12.5, color: '#FF3B30' }} onClick={onLeave}><LogOut size={13} /> Leave group</button>}
          {isPartner && <button className="mac-btn mac-btn-danger" style={{ fontSize: 12.5 }} onClick={onDelete}><Trash2 size={13} /> Delete conversation</button>}
        </>}
        {tab === 'pins' && (pinned.length ? pinned.map(m => (
          <button key={m.id} className="chat-row" onClick={() => onJump(m.id)} style={{ alignItems: 'flex-start' }}>
            <Pin size={13} color="#E0A100" style={{ marginTop: 3 }} />
            <span style={{ flex: 1, textAlign: 'left' }}><span style={{ display: 'block', fontSize: 11, color: '#8E8E93' }}>{m.senderName} · {fmtDay(m.createdAt)}</span><span style={{ fontSize: 12.5 }}>{m.text || '📎 Attachment'}</span></span>
          </button>
        )) : <div className="chat-empty">No pinned messages. Hover a message and tap the pin.</div>)}
        {tab === 'files' && (files.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {files.map((f, i) => f.type?.startsWith('image/')
              ? <a key={i} href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8 }} /></a>
              : <a key={i} href={f.url} target="_blank" rel="noreferrer" title={f.name} style={{ gridColumn: 'span 3', display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, padding: 8, borderRadius: 8, background: 'rgba(0,0,0,0.03)', color: '#1D1D1F', textDecoration: 'none' }}><FileText size={14} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span></a>)}
          </div>
        ) : <div className="chat-empty">No files shared in the loaded messages yet.</div>)}
      </div>
    </aside>
  );
}

const CHAT_CSS = `
.chat-root { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.chat-shell { flex: 1; min-height: 0; display: flex; background: #fff; }
.chat-error { display: flex; align-items: center; gap: 6px; margin: 8px 16px 0; padding: 8px 12px; border-radius: 10px; background: rgba(255,59,48,0.07); color: #D70015; font-size: 12.5px; }
.chat-error button { margin-left: auto; border: none; background: none; cursor: pointer; color: inherit; }
.chat-list { width: 320px; min-width: 280px; border-right: 1px solid rgba(0,0,0,0.07); display: flex; flex-direction: column; background: #FBFBFD; }
.chat-row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: none; background: transparent; border-radius: 12px; cursor: pointer; font-family: inherit; margin-bottom: 2px; color: inherit; }
.chat-row:hover { background: rgba(0,0,0,0.04); }
.chat-row.on { background: rgba(0,113,227,0.1); }
.chat-row-name { font-size: 13.5px; color: #1D1D1F; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-row-prev { flex: 1; min-width: 0; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
.chat-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #0071E3; color: #fff; font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.chat-badge.muted { background: #C7C7CC; } .chat-badge.at { background: #FF9500; }
.chat-dot { position: absolute; right: -1px; bottom: -1px; width: 11px; height: 11px; border-radius: 50%; background: #34C759; border: 2px solid #fff; }
.chat-av { display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; flex-shrink: 0; }
.chat-sec { font-size: 11px; font-weight: 650; color: #8E8E93; text-transform: uppercase; letter-spacing: .4px; padding: 10px 6px 6px; }
.chat-empty { text-align: center; color: #AEAEB2; font-size: 12.5px; padding: 28px 12px; }
.chat-thread { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; }
.chat-placeholder { flex: 1; display: flex; flex-direction: column; gap: 10px; align-items: center; justify-content: center; color: #AEAEB2; font-size: 13px; }
.chat-head { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid rgba(0,0,0,0.07); background: #fff; }
.chat-back { display: none; border: none; background: none; cursor: pointer; padding: 4px; }
.chat-icon { width: 32px; height: 32px; border-radius: 9px; border: none; background: transparent; color: #6E6E73; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.chat-icon:hover { background: rgba(0,0,0,0.05); color: #1D1D1F; }
.chat-body { flex: 1; min-height: 0; position: relative; background: #F4F5F7; }
.chat-scroll { position: absolute; inset: 0; overflow-y: auto; padding: 12px 16px 8px; display: flex; flex-direction: column; }
.chat-sys { text-align: center; font-size: 11.5px; color: #8E8E93; margin: 6px 0 10px; display: flex; gap: 6px; justify-content: center; align-items: center; }
.chat-day, .chat-new { display: flex; align-items: center; justify-content: center; margin: 12px 0 8px; position: sticky; top: 0; z-index: 1; }
.chat-day span { font-size: 11px; font-weight: 600; color: #6E6E73; background: rgba(255,255,255,0.92); padding: 3px 10px; border-radius: 100px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.chat-new { position: static; } .chat-new span { font-size: 11px; font-weight: 650; color: #FF3B30; } .chat-new::before, .chat-new::after { content: ''; flex: 1; height: 1px; background: rgba(255,59,48,0.35); margin: 0 8px; }
.chat-msg { display: flex; gap: 8px; margin-top: 8px; max-width: 100%; }
.chat-msg.grouped { margin-top: 2px; }
.chat-msg.mine { justify-content: flex-end; }
.chat-msg.flash .chat-bubble { box-shadow: 0 0 0 3px rgba(255,204,0,0.7); }
.chat-msg-av { width: 30px; flex-shrink: 0; }
.chat-msg-col { display: flex; flex-direction: column; max-width: min(72%, 560px); min-width: 0; }
.chat-msg.mine .chat-msg-col { align-items: flex-end; }
.chat-sender { font-size: 11.5px; font-weight: 650; margin: 0 0 2px 10px; }
.chat-bubble-wrap { position: relative; display: flex; align-items: center; gap: 4px; max-width: 100%; }
.chat-msg.mine .chat-bubble-wrap { flex-direction: row-reverse; }
.chat-bubble { position: relative; padding: 7px 10px 6px; border-radius: 16px; background: #fff; color: #1D1D1F; box-shadow: 0 1px 1px rgba(0,0,0,0.06); min-width: 70px; max-width: 100%; }
.chat-msg:not(.grouped):not(.mine) .chat-bubble { border-top-left-radius: 5px; }
.chat-msg.mine .chat-bubble { background: #0071E3; color: #fff; }
.chat-msg.mine:not(.grouped) .chat-bubble { border-top-right-radius: 5px; }
.chat-bubble.deleted { background: transparent !important; color: #8E8E93 !important; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1); font-size: 12.5px; }
.chat-bubble.pinned { box-shadow: 0 0 0 1.5px #E0A100; }
.chat-pin { display: flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 650; opacity: 0.75; margin-bottom: 2px; }
.chat-text { font-size: 13.8px; line-height: 1.42; white-space: pre-wrap; word-break: break-word; }
.chat-code { font-family: ui-monospace, Menlo, monospace; font-size: 12px; background: rgba(0,0,0,0.08); padding: 1px 4px; border-radius: 4px; }
.chat-msg.mine .chat-code { background: rgba(255,255,255,0.2); }
.chat-meta { display: flex; align-items: center; justify-content: flex-end; gap: 4px; font-size: 10.5px; opacity: 0.7; margin-top: 2px; white-space: nowrap; }
.chat-quote { display: flex; flex-direction: column; text-align: left; gap: 1px; width: 100%; border: none; cursor: pointer; font-family: inherit; padding: 5px 8px; margin-bottom: 4px; border-radius: 8px; border-left: 3px solid #0071E3; background: rgba(0,0,0,0.05); color: inherit; font-size: 12px; }
.chat-msg.mine .chat-quote { background: rgba(255,255,255,0.16); border-left-color: #fff; }
.chat-quote span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.85; max-width: 320px; }
.chat-actions { display: flex; gap: 1px; opacity: 0; transition: opacity .12s; background: #fff; border-radius: 9px; box-shadow: 0 1px 4px rgba(0,0,0,0.12); padding: 2px; position: relative; }
.chat-actions button { width: 26px; height: 26px; border: none; background: none; border-radius: 6px; cursor: pointer; color: #6E6E73; display: inline-flex; align-items: center; justify-content: center; }
.chat-actions button:hover { background: rgba(0,0,0,0.06); color: #1D1D1F; }
.chat-bubble-wrap:hover .chat-actions, .chat-actions:focus-within { opacity: 1; }
@media (hover: none) {
  .chat-actions { display: none; }
  .chat-bubble-wrap.tapped .chat-actions { display: flex; opacity: 1; position: absolute; bottom: calc(100% + 4px); z-index: 4; }
  .chat-msg.mine .chat-bubble-wrap.tapped .chat-actions { right: 0; }
  .chat-msg:not(.mine) .chat-bubble-wrap.tapped .chat-actions { left: 0; }
  .chat-actions button { width: 34px; height: 34px; }
}
.chat-react-pop { position: absolute; bottom: 110%; right: 0; display: flex; gap: 2px; background: #fff; border-radius: 100px; padding: 4px 6px; box-shadow: 0 6px 24px rgba(0,0,0,0.18); z-index: 5; }
.chat-msg:not(.mine) .chat-react-pop { right: auto; left: 0; }
.chat-react-pop button { width: 32px !important; height: 32px !important; font-size: 19px; border-radius: 50% !important; }
.chat-react-pop button:hover { transform: scale(1.2); background: rgba(0,0,0,0.04) !important; }
.chat-rx { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.chat-rx button { border: 1px solid rgba(0,0,0,0.08); background: #fff; border-radius: 100px; padding: 1px 7px; font-size: 12px; cursor: pointer; font-family: inherit; }
.chat-rx button.on { border-color: #0071E3; background: rgba(0,113,227,0.08); color: #0060C0; font-weight: 600; }
.chat-seen { font-size: 10.5px; color: #8E8E93; margin-top: 2px; }
.chat-retry { border: none; background: none; color: #FF3B30; font-size: 11px; cursor: pointer; display: inline-flex; gap: 4px; align-items: center; margin-top: 2px; font-family: inherit; }
.chat-imgs { display: grid; gap: 3px; border-radius: 12px; overflow: hidden; max-width: 300px; }
.chat-imgs.n1 { grid-template-columns: 1fr; } .chat-imgs.n2, .chat-imgs.n3, .chat-imgs.n4 { grid-template-columns: 1fr 1fr; }
.chat-imgs img { width: 100%; height: 100%; max-height: 260px; object-fit: cover; display: block; }
.chat-imgs.n2 img, .chat-imgs.n3 img, .chat-imgs.n4 img { aspect-ratio: 1; }
.chat-more { position: absolute; inset: 0; background: rgba(0,0,0,0.45); color: #fff; font-size: 20px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.chat-doc { display: flex; align-items: center; gap: 7px; padding: 8px 10px; border-radius: 10px; color: inherit; text-decoration: none; font-size: 12.5px; max-width: 280px; }
.chat-typing { display: flex; align-items: center; gap: 3px; margin: 8px 0 4px 38px; color: #8E8E93; font-size: 11.5px; }
.chat-typing span { width: 6px; height: 6px; border-radius: 3px; background: #AEAEB2; animation: chatdot 1.2s infinite; }
.chat-typing span:nth-child(2) { animation-delay: .2s; } .chat-typing span:nth-child(3) { animation-delay: .4s; }
@keyframes chatdot { 0%, 60%, 100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
.chat-jump { position: absolute; right: 18px; bottom: 14px; width: 40px; height: 40px; border-radius: 50%; border: none; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.18); cursor: pointer; display: flex; align-items: center; justify-content: center; color: #48484A; }
.chat-jump span { position: absolute; top: -6px; right: -4px; background: #0071E3; color: #fff; font-size: 10px; font-weight: 700; border-radius: 9px; padding: 1px 5px; }
.chat-drop { position: absolute; inset: 8px; border: 2px dashed #0071E3; border-radius: 14px; background: rgba(0,113,227,0.06); display: flex; align-items: center; justify-content: center; color: #0071E3; font-weight: 650; pointer-events: none; }
.chat-compose { border-top: 1px solid rgba(0,0,0,0.07); padding: 8px 12px 6px; background: #fff; }
.chat-compose-bar { display: flex; align-items: center; gap: 8px; padding: 6px 8px; margin-bottom: 6px; border-radius: 10px; background: rgba(0,113,227,0.06); border-left: 3px solid #0071E3; }
.chat-files { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.chat-file { position: relative; display: flex; align-items: center; gap: 6px; padding: 4px 24px 4px 4px; border-radius: 10px; background: rgba(0,0,0,0.04); font-size: 11.5px; max-width: 220px; }
.chat-file img { width: 40px; height: 40px; object-fit: cover; border-radius: 7px; }
.chat-file span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-file button { position: absolute; top: 4px; right: 4px; border: none; background: rgba(0,0,0,0.5); color: #fff; width: 16px; height: 16px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.chat-compose-row { display: flex; align-items: flex-end; gap: 4px; }
.chat-input { width: 100%; resize: none; border: 1px solid rgba(0,0,0,0.1); border-radius: 20px; padding: 9px 14px; font-size: 14px; font-family: inherit; line-height: 1.4; outline: none; max-height: 160px; background: #F6F6F8; }
.chat-input:focus { border-color: #0071E3; background: #fff; }
.chat-send { width: 38px; height: 38px; border-radius: 50%; border: none; background: #0071E3; color: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.chat-send:disabled { background: #C7C7CC; cursor: default; }
.chat-hint { font-size: 10.5px; color: #AEAEB2; padding: 4px 6px 0; }
.chat-emoji { position: absolute; bottom: 42px; left: 0; width: 280px; display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; padding: 8px; background: #fff; border-radius: 14px; box-shadow: 0 8px 30px rgba(0,0,0,0.18); z-index: 10; }
.chat-emoji button { border: none; background: none; font-size: 20px; cursor: pointer; border-radius: 8px; padding: 3px; }
.chat-emoji button:hover { background: rgba(0,0,0,0.06); }
.chat-mention { position: absolute; bottom: 110%; left: 0; min-width: 220px; background: #fff; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.18); padding: 4px; z-index: 10; }
.chat-mention button { display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: none; padding: 6px 8px; border-radius: 8px; cursor: pointer; font-size: 13px; font-family: inherit; text-align: left; }
.chat-mention button.on, .chat-mention button:hover { background: rgba(0,113,227,0.08); }
.chat-info { width: 300px; min-width: 260px; border-left: 1px solid rgba(0,0,0,0.07); display: flex; flex-direction: column; background: #fff; }
.spin { animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) {
  .chat-info { position: absolute; right: 0; top: 0; bottom: 0; z-index: 20; box-shadow: -8px 0 30px rgba(0,0,0,0.15); }
  .chat-shell { position: relative; }
}
@media (max-width: 768px) {
  .chat-list { width: 100%; min-width: 0; border-right: none; }
  .chat-shell.has-active .chat-list { display: none; }
  .chat-shell:not(.has-active) .chat-thread { display: none; }
  .chat-back { display: inline-flex; }
  .chat-msg-col { max-width: 84%; }
  .chat-hint { display: none; }
  .chat-info { width: 100%; }
}
@media (max-width: 640px) { .chat-btn-label { display: none; } }
`;
