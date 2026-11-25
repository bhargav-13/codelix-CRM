// ================================================================
// Codelix OMS — Chat data layer (v2)
// Membership, authorship and what each person can read are decided by the
// server; the sender of a message / reaction is always stamped from the login.
// Live updates arrive over the WebSocket in lib/realtime.js.
// ================================================================
import { http, query } from './http';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '✅', '🔥'];
export const EMOJIS = ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅', '😇', '🙂', '😉', '😴', '😢', '😭', '😡', '😮', '🥳', '🤝', '👍', '👎', '👏', '🙌', '🙏', '💪', '👀', '🎉', '🔥', '✅', '❌', '⚠️', '❤️', '💯', '🚀', '⭐', '📌', '📎', '💡', '☕'];
export const PAGE = 50;

// Fill the gaps the UI relies on (the server already sends these camelCase objects).
export const toChannel = r => ({ ...r, type: r.type || 'group', members: r.members || [], admins: r.admins || [], description: r.description || '' });
export const toMessage = r => ({
  ...r, text: r.text || '', attachments: r.attachments || [], mentions: r.mentions || [], deleted: !!r.deleted, pinned: !!r.pinned,
});
export const toReaction = r => r;
// read marker of one member: { kind, id, lastReadAt, muted }
export const toRead = r => ({ kind: r.kind ?? r.memberKind, id: r.id ?? r.memberId, lastReadAt: r.lastReadAt, muted: !!r.muted });

const list = async (path, map) => ((await http.get(path)) || []).map(map);

export const chat = {
  // my conversations, most recent first
  channels: () => list('/chat/channels', toChannel),
  // The creator is added and made admin by the server. A direct message
  // between the same two people returns the conversation that already exists.
  createChannel: async ({ name, type, members, description }) => toChannel(await http.post('/chat/channels', {
    name: name || null, type, description: description || null,
    members: (members || []).map(m => ({ kind: m.kind, id: m.id, name: m.name })),
  })),
  // patch: any of name, description, members, admins — plus the channel's `version`
  updateChannel: async (id, patch) => {
    const body = { version: patch.version };
    if ('name' in patch) body.name = patch.name;
    if ('description' in patch) body.description = patch.description || null;
    if ('members' in patch) body.members = patch.members;
    if ('admins' in patch) body.admins = patch.admins;
    return toChannel(await http.put(`/chat/channels/${id}`, body));
  },
  deleteChannel: async id => { await http.del(`/chat/channels/${id}`); },
  leaveChannel: async id => { await http.post(`/chat/channels/${id}/leave`); },

  // newest PAGE messages before `before` (ISO) — returned oldest → newest
  messages: (channelId, before) => list(`/chat/channels/${channelId}/messages${query({ before, limit: PAGE })}`, toMessage),
  messagesById: ids => (ids.length ? list(`/chat/messages${query({ ids })}`, toMessage) : Promise.resolve([])),
  pinned: async channelId => (await list(`/chat/channels/${channelId}/pinned`, toMessage)).filter(m => !m.deleted),

  send: async ({ channelId, text, attachments, replyTo, mentions, clientId }) => toMessage(await http.post(`/chat/channels/${channelId}/messages`, {
    text: text || null, attachments: attachments || [], replyTo: replyTo || null, mentions: mentions || [], clientId,
  })),
  edit: async (id, text) => toMessage(await http.put(`/chat/messages/${id}`, { text })),
  remove: async id => { await http.del(`/chat/messages/${id}`); },
  setPinned: async (id, pinned) => { await http.post(`/chat/messages/${id}/pin`, { pinned }); },

  reactions: channelId => list(`/chat/channels/${channelId}/reactions`, toReaction),
  react: async ({ message, emoji }) => toReaction(await http.post(`/chat/messages/${message.id}/reactions`, { emoji })),
  unreact: async id => { await http.del(`/chat/reactions/${id}`); },

  // → { channelId: { unread, mentions } }
  unreadCounts: async () => ((await http.get('/chat/unread')) || [])
    .reduce((m, r) => { m[r.channelId] = { unread: r.unread || 0, mentions: r.mentions || 0 }; return m; }, {}),
  markRead: async channelId => { await http.post(`/chat/channels/${channelId}/read`); },
  setMuted: async (channelId, muted) => { await http.post(`/chat/channels/${channelId}/mute`, { muted }); },
  reads: channelId => list(`/chat/channels/${channelId}/reads`, toRead),
  // my own markers: [{ channelId, muted, lastReadAt }]
  myReads: async () => (await http.get('/chat/reads/mine')) || [],
  // → message-shaped rows ({ id, channelId, senderName, text, createdAt, … })
  search: q => list(`/chat/search${query({ q })}`, toMessage),
};

// ── helpers ───────────────────────────────────────────────────────
export const sameId = (a, b) => !!a && !!b && a.kind === b.kind && String(a.id) === String(b.id);
export const personKey = p => `${p.kind}:${p.id}`;
export const initialsOf = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const COLORS = ['#0071E3', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#30B0C7', '#E0A100', '#5856D6'];
export function colorFor(seed = '') { let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; }

export function fmtTime(iso) { return iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''; }
export function fmtDay(iso) {
  if (!iso) return '';
  const d = new Date(iso), today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const y = new Date(today); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}
export function fmtListTime(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtTime(iso);
  if ((now - d) < 6 * 86400000) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// @mentions present in a text (full names)
export function extractMentions(text, people) {
  const t = (text || '').toLowerCase();
  return people.filter(p => t.includes('@' + p.name.toLowerCase())).map(p => ({ kind: p.kind, id: p.id, name: p.name }));
}

// *bold*  _italic_  `code`  links  @mentions — returns React-safe segments
export function formatSegments(text) {
  const out = [];
  const re = /(https?:\/\/[^\s<]+)|(`[^`\n]+`)|(\*[^*\n]+\*)|(_[^_\n]+_)|(@[A-Z][\w]*(?: [A-Z][\w]*)?)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    if (m[1]) out.push({ t: 'link', v: m[1] });
    else if (m[2]) out.push({ t: 'code', v: m[2].slice(1, -1) });
    else if (m[3]) out.push({ t: 'bold', v: m[3].slice(1, -1) });
    else if (m[4]) out.push({ t: 'italic', v: m[4].slice(1, -1) });
    else if (m[5]) out.push({ t: 'mention', v: m[5] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}
