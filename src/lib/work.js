// ================================================================
// Codelix OMS — Work module data layer (tasks, sprints, time, activity)
// The server decides what each user gets back and stamps who did what
// (reporter, comment author, time-log owner); this file never filters for
// permissions itself.
// ================================================================
import { http, query } from './http';

// ── Constants shared by the UI ────────────────────────────────────
export const STATUSES   = ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done'];
export const TYPES      = ['Epic', 'Story', 'Task', 'Bug', 'Subtask'];
export const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
export const LINK_TYPES = { blocks: 'blocks', blocked_by: 'is blocked by', relates: 'relates to' };

// Fields a task save may carry (anything else the page holds is server-owned).
const FIELDS = ['title', 'description', 'type', 'status', 'priority', 'assignees', 'dueDate', 'startDate', 'labels',
  'projectId', 'projectName', 'parentId', 'sprintId', 'storyPoints', 'estimateHours', 'watchers', 'checklist', 'links',
  'attachments', 'sortOrder'];
const NULLABLE = new Set(['dueDate', 'startDate', 'projectId', 'projectName', 'parentId', 'sprintId', 'storyPoints', 'estimateHours', 'description']);

export function toBody(patch) {
  const body = {};
  for (const k of FIELDS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    body[k] = NULLABLE.has(k) && (v === '' || v === undefined) ? null : v;
  }
  if (body.storyPoints != null) body.storyPoints = +body.storyPoints;
  if (body.estimateHours != null) body.estimateHours = +body.estimateHours;
  return body;
}

const nameOf = v => (v && typeof v === 'object' ? v.name || '' : v || '');
const refOf = v => (v && typeof v === 'object' && v.id != null ? { kind: v.kind, id: v.id, name: v.name || '' } : null);

// A comment as the UI reads it: author (name), authorKind, authorId, text, at.
const toComment = c => {
  const ref = refOf(c.author);
  return {
    ...c,
    author: ref ? ref.name : c.authorName || nameOf(c.author),
    authorKind: ref ? ref.kind : c.authorKind,
    authorId: ref ? ref.id : c.authorId,
    at: c.at || c.createdAt,
  };
};

// Fills the gaps the UI relies on. `reporter` stays a display name;
// `reporterRef` is the person ref ({ kind, id, name }) used for ownership checks.
export const toTask = r => ({
  ...r,
  description: r.description || '', type: r.type || 'Task', status: r.status || 'Backlog', priority: r.priority || 'Medium',
  assignees: r.assignees || [], dueDate: r.dueDate || '', startDate: r.startDate || '', labels: r.labels || [],
  projectName: r.projectName || '', watchers: r.watchers || [], checklist: r.checklist || [], links: r.links || [],
  comments: (r.comments || []).map(toComment), attachments: r.attachments || [], sortOrder: r.sortOrder ?? 0,
  reporter: nameOf(r.reporter) || r.reporterName || '',
  reporterRef: refOf(r.reporter) || refOf(r.reporterRef)
    || (r.reporterId != null ? { kind: r.reporterKind, id: r.reporterId, name: r.reporterName || nameOf(r.reporter) } : null),
});

const toSprint = r => ({ ...r, goal: r.goal || '', startDate: r.startDate || '', endDate: r.endDate || '' });
const toLog = r => ({ ...r, note: r.note || '' });

// ── Tasks ─────────────────────────────────────────────────────────
// Saves to one task are sent one after another, each with the version the
// previous one returned — quick successive edits (drag, then drag again) would
// otherwise trip the server's "someone else changed this" check on themselves.
const versions = new Map();   // task id → latest version seen
const queues = new Map();     // task id → tail of the save chain
const keep = t => { if (t?.id != null && t.version != null) versions.set(t.id, t.version); return t; };
const inTurn = (id, job) => {
  const run = (queues.get(id) || Promise.resolve()).then(job, job);
  const tail = run.catch(() => {});
  queues.set(id, tail);
  tail.then(() => { if (queues.get(id) === tail) queues.delete(id); });
  return run;
};

export const workTasks = {
  list: async () => ((await http.get('/tasks')) || []).map(r => keep(toTask(r))),
  // taskNo and reporter are assigned by the server
  create: async t => keep(toTask(await http.post('/tasks', toBody(t)))),
  // partial: only the fields present in `patch` change
  update: (id, patch) => inTurn(id, async () => keep(toTask(await http.put(`/tasks/${id}`, { ...toBody(patch), version: versions.get(id) ?? patch.version })))),
  // children go with their parent → { deleted: n }
  remove: async id => { const res = await http.del(`/tasks/${id}`); versions.delete(id); return res; },
  // Comments: the server stamps author and time. Both resolve to
  // { task } when the server answers with the updated task, else { comment } / {}.
  addComment: (id, { text, mentions }) => inTurn(id, async () => {
    const res = await http.post(`/tasks/${id}/comments`, { text, mentions: mentions || [] });
    return Array.isArray(res?.comments) ? { task: keep(toTask(res)) } : { comment: res ? toComment(res) : null };
  }),
  removeComment: (id, commentId) => inTurn(id, async () => {
    const res = await http.del(`/tasks/${id}/comments/${commentId}`);
    return Array.isArray(res?.comments) ? { task: keep(toTask(res)) } : {};
  }),
  // true while a save for this task is still on its way (polling must not overwrite it)
  isSaving: id => queues.has(id),
};

// ── Sprints ───────────────────────────────────────────────────────
export const workSprints = {
  list: async () => ((await http.get('/sprints')) || []).map(toSprint),
  create: async s => toSprint(await http.post('/sprints', {
    projectId: s.projectId, name: s.name, goal: s.goal || null, startDate: s.startDate || null,
    endDate: s.endDate || null, status: s.status || 'planned',
  })),
  // `s` carries the fields that change plus the sprint's `version`
  update: async (id, s) => {
    const body = { version: s.version };
    if ('name' in s) body.name = s.name;
    if ('goal' in s) body.goal = s.goal || null;
    if ('startDate' in s) body.startDate = s.startDate || null;
    if ('endDate' in s) body.endDate = s.endDate || null;
    if ('status' in s) body.status = s.status;
    return toSprint(await http.put(`/sprints/${id}`, body));
  },
  remove: async id => { await http.del(`/sprints/${id}`); },
};

// ── Time logs ─────────────────────────────────────────────────────
export const workTime = {
  list: async ({ from, to } = {}) => ((await http.get(`/time-logs${query({ from, to })}`)) || []).map(toLog),
  // the server records whose time this is
  create: async l => toLog(await http.post('/time-logs', {
    taskId: l.taskId || null, projectId: l.projectId || null, minutes: Math.round(l.minutes), logDate: l.logDate, note: l.note || null,
  })),
  remove: async id => { await http.del(`/time-logs/${id}`); },
};

// ── Activity ──────────────────────────────────────────────────────
export const workActivity = {
  // status changes for many tasks (reports: burndown, cycle time, resolved/week)
  statusEvents: async taskIds => {
    if (!taskIds.length) return [];
    const out = [];
    for (let i = 0; i < taskIds.length; i += 100) {
      const part = (await http.get(`/task-activity/status-events${query({ taskIds: taskIds.slice(i, i + 100) })}`)) || [];
      out.push(...part.map(r => ({ taskId: r.taskId, from: r.from ?? r.fromValue ?? null, to: r.to ?? r.toValue ?? null, at: r.at || r.createdAt })));
    }
    return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  },
  forTask: async taskId => ((await http.get(`/tasks/${taskId}/activity`)) || []).map(r => ({
    id: r.id, actor: nameOf(r.actor) || r.actorName || '', action: r.action, field: r.field,
    from: r.from ?? r.fromValue ?? null, to: r.to ?? r.toValue ?? null, at: r.at || r.createdAt,
  })),
};

// ── Helpers ───────────────────────────────────────────────────────
export const taskKey = (t, projects) => {
  const p = t.projectId && projects?.find(x => x.id === t.projectId);
  return `${p?.key || 'CLX'}-${t.taskNo ?? '?'}`;
};
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const fmtMinutes = m => {
  const h = Math.floor((m || 0) / 60), mm = Math.round((m || 0) % 60);
  return h ? (mm ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`;
};
// "1h 30m", "1.5h", "90m", "2" (hours) → minutes
export function parseDuration(s) {
  const str = String(s || '').trim().toLowerCase();
  if (!str) return 0;
  if (/^\d+(\.\d+)?$/.test(str)) return Math.round(parseFloat(str) * 60);
  let total = 0;
  const h = str.match(/(\d+(?:\.\d+)?)\s*h/); if (h) total += parseFloat(h[1]) * 60;
  const m = str.match(/(\d+)\s*m/); if (m) total += parseInt(m[1], 10);
  return Math.round(total);
}
export const isOverdue = t => t.dueDate && t.status !== 'Done' && t.dueDate < todayISO();
export const sameDayISO = d => d.toISOString().slice(0, 10);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// @mentions: returns people whose full name appears after "@"
export function findMentions(text, people) {
  const t = (text || '').toLowerCase();
  return people.filter(p => t.includes('@' + p.name.toLowerCase()) || t.includes('@' + p.name.split(' ')[0].toLowerCase() + ' ') || t.endsWith('@' + p.name.split(' ')[0].toLowerCase()));
}
