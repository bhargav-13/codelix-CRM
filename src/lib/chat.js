// ================================================================
// Codelix OMS — Chat data layer (v2)
// What each person can read is decided by RLS in supabase/chat_v2.sql.
// ================================================================
import { supabase } from './supabase';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '✅', '🔥'];
export const EMOJIS = ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅', '😇', '🙂', '😉', '😴', '😢', '😭', '😡', '😮', '🥳', '🤝', '👍', '👎', '👏', '🙌', '🙏', '💪', '👀', '🎉', '🔥', '✅', '❌', '⚠️', '❤️', '💯', '🚀', '⭐', '📌', '📎', '💡', '☕'];
export const PAGE = 50;

const must = ({ data, error }) => { if (error) throw error; return data; };

export const toChannel = r => ({
  id: r.id, name: r.name, type: r.type || 'group', members: r.members || [], admins: r.admins || [],
  description: r.description || '', createdBy: r.created_by, lastMessageAt: r.last_message_at,
  lastMessagePreview: r.last_message_preview, createdAt: r.created_at,
});
export const toMessage = r => ({
  id: r.id, channelId: r.channel_id, senderId: r.sender_id, senderName: r.sender_name, senderKind: r.sender_kind,
  text: r.text || '', attachments: r.attachments || [], replyTo: r.reply_to, editedAt: r.edited_at,
  deleted: !!r.deleted, pinned: !!r.pinned, mentions: r.mentions || [], clientId: r.client_id, createdAt: r.created_at,
});
export const toReaction = r => ({
  id: r.id, messageId: r.message_id, channelId: r.channel_id, emoji: r.emoji, personKind: r.person_kind, personId: r.person_id, personName: r.person_name,
});

export const chat = {
  channels: async () => (must(await supabase.from('chat_channels').select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })) || []).map(toChannel),

  createChannel: async ({ name, type, members, createdBy, description, admins }) => toChannel(must(await supabase.from('chat_channels')
    .insert({ name: name || null, type, members, created_by: createdBy || null, description: description || null, admins: admins || [] }).select().single())),
  updateChannel: async (id, patch) => {
    const row = {};
    if ('name' in patch) row.name = patch.name;
    if ('description' in patch) row.description = patch.description || null;
    if ('members' in patch) row.members = patch.members;
    if ('admins' in patch) row.admins = patch.admins;
    return toChannel(must(await supabase.from('chat_channels').update(row).eq('id', id).select().single()));
  },
  deleteChannel: async id => { must(await supabase.from('chat_channels').delete().eq('id', id)); },

  // newest PAGE messages before `before` (ISO) — returned oldest → newest
  messages: async (channelId, before) => {
    let q = supabase.from('chat_messages').select('*').eq('channel_id', channelId).order('created_at', { ascending: false }).limit(PAGE);
    if (before) q = q.lt('created_at', before);
    return (must(await q) || []).map(toMessage).reverse();
  },
  messagesById: async ids => ids.length ? (must(await supabase.from('chat_messages').select('*').in('id', ids)) || []).map(toMessage) : [],
  pinned: async channelId => (must(await supabase.from('chat_messages').select('*').eq('channel_id', channelId).eq('pinned', true).eq('deleted', false)
    .order('created_at', { ascending: false })) || []).map(toMessage),

  send: async ({ channelId, me, text, attachments, replyTo, mentions, clientId }) => toMessage(must(await supabase.from('chat_messages').insert({
    channel_id: channelId, sender_id: me.id, sender_name: me.name, sender_kind: me.kind, text: text || null,
    attachments: attachments || [], reply_to: replyTo || null, mentions: mentions || [], client_id: clientId,
  }).select().single())),
  edit: async (id, text) => toMessage(must(await supabase.from('chat_messages').update({ text }).eq('id', id).select().single())),
  remove: async id => toMessage(must(await supabase.from('chat_messages').update({ deleted: true }).eq('id', id).select().single())),
  setPinned: async (id, pinned) => toMessage(must(await supabase.from('chat_messages').update({ pinned }).eq('id', id).select().single())),

  reactions: async channelId => (must(await supabase.from('chat_reactions').select('*').eq('channel_id', channelId)) || []).map(toReaction),
  react: async ({ message, emoji, me }) => toReaction(must(await supabase.from('chat_reactions').insert({
    message_id: message.id, channel_id: message.channelId, emoji, person_kind: me.kind, person_id: me.id, person_name: me.name,
  }).select().single())),
  unreact: async id => { must(await supabase.from('chat_reactions').delete().eq('id', id)); },

  unreadCounts: async () => (must(await supabase.rpc('chat_unread_counts')) || [])
    .reduce((m, r) => { m[r.channel_id] = { unread: r.unread, mentions: r.mentions }; return m; }, {}),
  markRead: async channelId => { must(await supabase.rpc('chat_mark_read', { cid: channelId })); },
  setMuted: async (channelId, muted) => { must(await supabase.rpc('chat_set_muted', { cid: channelId, m: muted })); },
  reads: async channelId => (must(await supabase.from('chat_reads').select('*').eq('channel_id', channelId)) || [])
    .map(r => ({ kind: r.member_kind, id: r.member_id, lastReadAt: r.last_read_at, muted: r.muted })),
  myReads: async () => (must(await supabase.from('chat_reads').select('channel_id, member_kind, member_id, muted')) || []),
  search: async q => (must(await supabase.rpc('chat_search', { q })) || []),
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
