import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import SearchBar from '../components/ui/SearchBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { PageLoader } from '../components/ui/CodelixLoader';
import { chatDB, employeesDB, uploadProjectFile } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { PARTNERS } from '../data/mockData';
import {
  Send, Paperclip, Users, X, Trash2, UserPlus, MessageSquare,
  Image as ImageIcon, FileText, Loader2, Check, Hash, Trash,
} from 'lucide-react';

// Resolve a logged-in partner's canonical name from their email, e.g.
// "bhargav.codelix@gmail.com" → "Bhargav Thesiya" (matched against PARTNERS).
function resolvePartnerName(email = '') {
  const local = email.split('@')[0].toLowerCase();
  const localFirst = local.split('.')[0];
  const match = PARTNERS.find(p => localFirst.startsWith(p.split(' ')[0].toLowerCase()));
  if (match) return match;
  return localFirst.charAt(0).toUpperCase() + localFirst.slice(1);
}

const initialsOf = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const AVATAR_COLORS = ['#0071E3', '#34C759', '#FF9500', '#AF52DE', '#FF3B30', '#5AC8FA', '#FF2D55'];
function colorFor(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function fmtDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}
const sameId = (a, b) => a.kind === b.kind && a.id === b.id;

export default function Chat() {
  const { user, isEmployee, employeeData } = useAuth();
  const me = useMemo(() => (
    isEmployee
      ? { id: employeeData?.id, name: employeeData?.name || 'Me', kind: 'employee' }
      : { id: resolvePartnerName(user?.email || ''), name: resolvePartnerName(user?.email || ''), kind: 'partner' }
  ), [isEmployee, employeeData, user]);

  const [people, setPeople] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatMode, setNewChatMode] = useState('dm');
  const [groupName, setGroupName] = useState('');
  const [pickedMembers, setPickedMembers] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [deleteChannelId, setDeleteChannelId] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const fileInputRef = useRef(null);
  const msgEndRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, chans] = await Promise.all([employeesDB.getAll(), chatDB.getChannels()]);
      const allPeople = [
        ...PARTNERS.map(p => ({ id: p, name: p, kind: 'partner' })),
        ...emps.filter(e => e.status === 'Active').map(e => ({ id: e.id, name: e.name, kind: 'employee' })),
      ].filter(p => !sameId(p, me));
      setPeople(allPeople);
      setChannels(chans.filter(c => (c.members || []).some(m => sameId(m, me))));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [me]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!activeId && channels.length) setActiveId(channels[0].id);
  }, [channels, activeId]);

  const activeChannel = channels.find(c => c.id === activeId) || null;

  // Keep refs so the single realtime subscription (set up once) always
  // sees current state without needing to be torn down and rebuilt.
  const channelsRef = useRef(channels);
  useEffect(() => { channelsRef.current = channels; }, [channels]);
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let cancelled = false;
    setLoadingMsgs(true);
    chatDB.getMessages(activeId)
      .then(msgs => { if (!cancelled) setMessages(msgs); })
      .catch(e => console.error(e))
      .finally(() => !cancelled && setLoadingMsgs(false));
    return () => { cancelled = true; };
  }, [activeId]);

  useEffect(() => {
    const unsub = chatDB.subscribeToAll(m => {
      if (!channelsRef.current.some(c => c.id === m.channelId)) return;
      if (m.channelId === activeIdRef.current) {
        setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
      }
      bumpChannel(m.channelId, m.createdAt, previewFor(m));
    });
    return unsub;
  }, []);

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  function previewFor(m) {
    if (m.text?.trim()) return m.text.trim().slice(0, 80);
    if (m.attachments?.length) return `📎 ${m.attachments.length} attachment${m.attachments.length > 1 ? 's' : ''}`;
    return '';
  }
  function bumpChannel(id, at, preview) {
    setChannels(cs => cs.map(c => c.id === id ? { ...c, lastMessageAt: at, lastMessagePreview: preview } : c)
      .sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt)));
  }

  async function send() {
    if ((!text.trim() && pendingFiles.length === 0) || sending || !activeId) return;
    setSending(true);
    try {
      let attachments = [];
      if (pendingFiles.length) {
        setUploading(true);
        attachments = await Promise.all(pendingFiles.map(f => uploadProjectFile(f)));
        setUploading(false);
      }
      const msg = await chatDB.sendMessage({ channelId: activeId, senderId: me.id, senderName: me.name, senderKind: me.kind, text: text.trim(), attachments });
      setMessages(prev => prev.some(x => x.id === msg.id) ? prev : [...prev, msg]);
      bumpChannel(activeId, msg.createdAt, previewFor(msg));
      setText(''); setPendingFiles([]);
    } catch (e) { console.error(e); setUploading(false); }
    setSending(false);
  }

  function onPickFiles(e) {
    const files = Array.from(e.target.files || []);
    setPendingFiles(fs => [...fs, ...files]);
    e.target.value = '';
  }
  const removePendingFile = i => setPendingFiles(fs => fs.filter((_, idx) => idx !== i));

  function openNewDM() { setNewChatMode('dm'); setPickedMembers([]); setGroupName(''); setShowNewChat(true); }
  function openNewGroup() { setNewChatMode('group'); setPickedMembers([]); setGroupName(''); setShowNewChat(true); }

  function togglePick(p) {
    setPickedMembers(ps => ps.some(x => sameId(x, p))
      ? ps.filter(x => !sameId(x, p))
      : (newChatMode === 'dm' ? [p] : [...ps, p]));
  }

  async function createChat() {
    if (newChatMode === 'dm') {
      if (pickedMembers.length !== 1) return;
      const other = pickedMembers[0];
      const existing = channels.find(c => c.type === 'dm' && (c.members || []).length === 2 &&
        (c.members || []).some(m => sameId(m, other)) && (c.members || []).some(m => sameId(m, me)));
      if (existing) { setActiveId(existing.id); setShowNewChat(false); return; }
      try {
        const created = await chatDB.createChannel({ type: 'dm', members: [me, other], createdBy: me.name });
        setChannels(cs => [created, ...cs]);
        setActiveId(created.id);
      } catch (e) { console.error(e); }
    } else {
      if (!groupName.trim() || pickedMembers.length === 0) return;
      try {
        const created = await chatDB.createChannel({ name: groupName.trim(), type: 'group', members: [me, ...pickedMembers], createdBy: me.name });
        setChannels(cs => [created, ...cs]);
        setActiveId(created.id);
      } catch (e) { console.error(e); }
    }
    setShowNewChat(false);
  }

  function channelLabel(c) {
    if (c.type === 'group') return c.name || 'Group';
    const other = (c.members || []).find(m => !sameId(m, me));
    return other?.name || 'Direct Message';
  }
  const channelSubtitle = c => c.type === 'group' ? `${(c.members || []).length} members` : 'Direct message';

  async function addMember(p) {
    if (!activeChannel) return;
    if ((activeChannel.members || []).some(m => sameId(m, p))) return;
    try {
      const updated = await chatDB.updateMembers(activeChannel.id, [...(activeChannel.members || []), p]);
      setChannels(cs => cs.map(x => x.id === activeChannel.id ? updated : x));
    } catch (e) { console.error(e); }
  }
  async function removeMember(p) {
    if (!activeChannel) return;
    const members = (activeChannel.members || []).filter(m => !sameId(m, p));
    try {
      const updated = await chatDB.updateMembers(activeChannel.id, members);
      if (sameId(p, me)) {
        setChannels(cs => cs.filter(x => x.id !== activeChannel.id));
        setActiveId(null);
        setShowMembers(false);
      } else {
        setChannels(cs => cs.map(x => x.id === activeChannel.id ? updated : x));
      }
    } catch (e) { console.error(e); }
  }

  async function deleteMessage(id) {
    setMessages(prev => prev.filter(m => m.id !== id));
    try { await chatDB.deleteMessage(id); } catch (e) { console.error(e); }
  }

  async function deleteChannel() {
    if (!deleteChannelId) return;
    try {
      await chatDB.deleteChannel(deleteChannelId);
      setChannels(cs => cs.filter(c => c.id !== deleteChannelId));
      if (activeId === deleteChannelId) setActiveId(null);
    } catch (e) { console.error(e); }
  }

  const filteredChannels = useMemo(() => {
    const q = search.toLowerCase();
    return channels.filter(c => !q || channelLabel(c).toLowerCase().includes(q));
  }, [channels, search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Header title="Chat" subtitle={`${channels.length} conversation${channels.length !== 1 ? 's' : ''}`}
        actions={<div style={{ display: 'flex', gap: 8 }}>
          <button onClick={openNewDM} className="mac-btn mac-btn-secondary" style={{ fontSize: 13 }}><MessageSquare size={13} /> New DM</button>
          <button onClick={openNewGroup} className="mac-btn mac-btn-primary" style={{ fontSize: 13 }}><Users size={13} /> New Group</button>
        </div>}
      />

      {loading ? <PageLoader /> : (
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* ── Channel list ── */}
          <div style={{ width: 280, minWidth: 280, borderRight: '1px solid rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 12 }}><SearchBar value={search} onChange={setSearch} placeholder="Search chats…" /></div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
              {filteredChannels.length === 0
                ? <div style={{ textAlign: 'center', color: '#AEAEB2', fontSize: 12.5, padding: '32px 12px' }}>No conversations yet — start one above.</div>
                : filteredChannels.map(c => {
                    const active = c.id === activeId;
                    const label = channelLabel(c);
                    return (
                      <div key={c.id} onClick={() => setActiveId(c.id)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 10px', borderRadius: 10, cursor: 'pointer', background: active ? 'rgba(0,113,227,0.09)' : 'transparent', marginBottom: 2 }}>
                        <div style={{ width: 36, height: 36, borderRadius: c.type === 'group' ? 10 : '50%', background: c.type === 'group' ? 'linear-gradient(135deg,#AF52DE,#BF5AF2)' : `linear-gradient(135deg,${colorFor(label)},${colorFor(label)}CC)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                          {c.type === 'group' ? <Hash size={14} /> : initialsOf(label)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: active ? 650 : 550, color: '#1D1D1F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                            {c.lastMessageAt && <span style={{ fontSize: 10, color: '#AEAEB2', flexShrink: 0 }}>{fmtTime(c.lastMessageAt)}</span>}
                          </div>
                          <div style={{ fontSize: 11.5, color: '#8E8E93', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.lastMessagePreview || channelSubtitle(c)}</div>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </div>

          {/* ── Thread ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {!activeChannel ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#AEAEB2', fontSize: 13 }}>Select a conversation or start a new one</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: 650, color: '#1D1D1F' }}>{channelLabel(activeChannel)}</div>
                    <div style={{ fontSize: 11.5, color: '#8E8E93' }}>{channelSubtitle(activeChannel)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {activeChannel.type === 'group' && <button onClick={() => setShowMembers(true)} className="mac-btn mac-btn-secondary" style={{ fontSize: 12 }}><Users size={12} /> Members</button>}
                    <button onClick={() => setDeleteChannelId(activeChannel.id)} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,59,48,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13} color="#FF3B30" /></button>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
                  {loadingMsgs ? <PageLoader /> : messages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#AEAEB2', fontSize: 12.5, marginTop: 40 }}>No messages yet. Say hello 👋</div>
                  ) : messages.map((m, i) => {
                    const mine = sameId({ id: m.senderId, kind: m.senderKind }, me);
                    const prev = messages[i - 1];
                    const showDay = !prev || fmtDay(prev.createdAt) !== fmtDay(m.createdAt);
                    const showName = activeChannel.type === 'group' && !mine && (!prev || prev.senderId !== m.senderId || prev.senderKind !== m.senderKind || showDay);
                    return (
                      <div key={m.id}>
                        {showDay && <div style={{ textAlign: 'center', fontSize: 11, color: '#AEAEB2', margin: '14px 0 8px' }}>{fmtDay(m.createdAt)}</div>}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
                          {showName && <span style={{ fontSize: 11, fontWeight: 600, color: colorFor(m.senderName), marginBottom: 2, marginLeft: 2 }}>{m.senderName}</span>}
                          <div
                            onMouseEnter={() => mine && setHoveredMsgId(m.id)}
                            onMouseLeave={() => setHoveredMsgId(id => id === m.id ? null : id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: mine ? 'row' : 'row-reverse' }}
                          >
                            {mine && (
                              <button
                                onClick={() => deleteMessage(m.id)}
                                title="Delete message"
                                style={{ width: 22, height: 22, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(255,59,48,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: hoveredMsgId === m.id ? 1 : 0, transition: 'opacity 0.12s' }}
                              >
                                <Trash size={11} color="#FF3B30" />
                              </button>
                            )}
                            <div style={{ maxWidth: '62%', padding: '9px 13px', borderRadius: 16, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4, background: mine ? 'linear-gradient(135deg,#0071E3,#0A84FF)' : 'rgba(0,0,0,0.05)', color: mine ? '#fff' : '#1D1D1F' }}>
                              {m.text && <div style={{ fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>}
                              {m.attachments?.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: m.text ? 8 : 0 }}>
                                  {m.attachments.map((a, ai) => a.type?.startsWith('image/') ? (
                                    <a key={ai} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} style={{ maxWidth: 220, borderRadius: 10, display: 'block' }} /></a>
                                  ) : (
                                    <a key={ai} href={a.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 8, background: mine ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)', color: 'inherit', textDecoration: 'none', fontSize: 12 }}>
                                      <FileText size={13} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <span style={{ fontSize: 10, color: '#AEAEB2', marginTop: 2 }}>{fmtTime(m.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={msgEndRef} />
                </div>

                {pendingFiles.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, padding: '8px 20px 0', flexWrap: 'wrap' }}>
                    {pendingFiles.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 8, background: 'rgba(0,113,227,0.08)', fontSize: 11.5, color: '#0071E3' }}>
                        {f.type?.startsWith('image/') ? <ImageIcon size={11} /> : <Paperclip size={11} />} {f.name}
                        <button onClick={() => removePendingFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}><X size={11} color="#0071E3" /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: 16, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                  <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={onPickFiles} />
                  <button onClick={() => fileInputRef.current?.click()} style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,0,0,0.05)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Paperclip size={15} color="#6E6E73" /></button>
                  <textarea
                    className="mac-input"
                    style={{ flex: 1, resize: 'none', height: 40, maxHeight: 120, paddingTop: 10 }}
                    placeholder="Type a message…"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  />
                  <button onClick={send} disabled={sending || uploading || (!text.trim() && pendingFiles.length === 0)} className="mac-btn mac-btn-primary" style={{ fontSize: 13, height: 36, width: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                    {sending || uploading ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={14} />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── New chat modal ── */}
      <Modal isOpen={showNewChat} onClose={() => setShowNewChat(false)} title={newChatMode === 'dm' ? 'New Direct Message' : 'New Group'} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {['dm', 'group'].map(mode => (
              <button key={mode} type="button" onClick={() => { setNewChatMode(mode); setPickedMembers([]); }} style={{ padding: '9px 10px', borderRadius: 10, border: `1.5px solid ${newChatMode === mode ? '#0071E3' : 'rgba(0,0,0,0.1)'}`, background: newChatMode === mode ? 'rgba(0,113,227,0.08)' : 'rgba(0,0,0,0.015)', cursor: 'pointer', fontSize: 12.5, fontWeight: newChatMode === mode ? 600 : 400, color: newChatMode === mode ? '#0071E3' : '#3C3C43' }}>
                {mode === 'dm' ? 'Direct Message' : 'Group'}
              </button>
            ))}
          </div>
          {newChatMode === 'group' && (
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 550, color: '#6E6E73', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Group Name</label>
              <input className="mac-input" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Design Team" />
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 550, color: '#6E6E73', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {newChatMode === 'dm' ? 'Select Person' : 'Add Members'}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
              {people.map(p => {
                const picked = pickedMembers.some(x => sameId(x, p));
                return (
                  <div key={`${p.kind}:${p.id}`} onClick={() => togglePick(p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, cursor: 'pointer', background: picked ? 'rgba(0,113,227,0.08)' : 'transparent' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg,${colorFor(p.name)},${colorFor(p.name)}CC)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}>{initialsOf(p.name)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: '#1D1D1F' }}>{p.name}</div>
                      <div style={{ fontSize: 10.5, color: '#AEAEB2', textTransform: 'capitalize' }}>{p.kind}</div>
                    </div>
                    {picked && <Check size={14} color="#0071E3" />}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
            <button onClick={() => setShowNewChat(false)} className="mac-btn mac-btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
            <button onClick={createChat} disabled={newChatMode === 'dm' ? pickedMembers.length !== 1 : (!groupName.trim() || pickedMembers.length === 0)} className="mac-btn mac-btn-primary" style={{ fontSize: 13 }}>
              {newChatMode === 'dm' ? 'Start Chat' : 'Create Group'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Members modal ── */}
      <Modal isOpen={showMembers} onClose={() => setShowMembers(false)} title="Group Members" size="sm">
        {activeChannel && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(activeChannel.members || []).map(m => (
                <div key={`${m.kind}:${m.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', borderRadius: 9 }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg,${colorFor(m.name)},${colorFor(m.name)}CC)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initialsOf(m.name)}</div>
                  <div style={{ flex: 1, fontSize: 12.5, color: '#1D1D1F' }}>{m.name} {sameId(m, me) && <span style={{ color: '#AEAEB2' }}>(you)</span>}</div>
                  <button onClick={() => removeMember(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}><X size={13} color="#FF3B30" /></button>
                </div>
              ))}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 550, color: '#6E6E73', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Add Someone</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {people.filter(p => !(activeChannel.members || []).some(m => sameId(m, p))).map(p => (
                  <div key={`${p.kind}:${p.id}`} onClick={() => addMember(p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', borderRadius: 9, cursor: 'pointer' }}>
                    <UserPlus size={13} color="#0071E3" />
                    <span style={{ fontSize: 12.5, color: '#1D1D1F' }}>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog isOpen={!!deleteChannelId} onClose={() => setDeleteChannelId(null)} onConfirm={deleteChannel} title="Delete Conversation" message="This will permanently delete this conversation and all its messages for everyone." />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
