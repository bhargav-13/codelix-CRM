// ================================================================
// Codelix OMS — Work module data layer (tasks, sprints, time, activity)
// Row Level Security decides what each user gets back; this file never
// filters for permissions itself.
// ================================================================
import { supabase } from './supabase';

// ── Constants shared by the UI ────────────────────────────────────
export const STATUSES   = ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done'];
export const TYPES      = ['Epic', 'Story', 'Task', 'Bug', 'Subtask'];
export const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
export const LINK_TYPES = { blocks: 'blocks', blocked_by: 'is blocked by', relates: 'relates to' };

// camelCase field → column
const COLS = {
  title: 'title', description: 'description', type: 'type', status: 'status', priority: 'priority',
  assignees: 'assignees', reporter: 'reporter', dueDate: 'due_date', startDate: 'start_date',
  labels: 'labels', projectId: 'project_id', projectName: 'project_name', parentId: 'parent_id',
  sprintId: 'sprint_id', storyPoints: 'story_points', estimateHours: 'estimate_hours',
  watchers: 'watchers', checklist: 'checklist', links: 'links', comments: 'comments',
  attachments: 'attachments', sortOrder: 'sort_order',
};
const NULLABLE = new Set(['due_date', 'start_date', 'project_id', 'project_name', 'parent_id', 'sprint_id', 'story_points', 'estimate_hours', 'description']);

export function toRow(patch) {
  const row = {};
  for (const [k, v] of Object.entries(patch)) {
    const c = COLS[k];
    if (!c) continue;
    row[c] = NULLABLE.has(c) && (v === '' || v === undefined) ? null : v;
  }
  if ('story_points' in row && row.story_points != null) row.story_points = +row.story_points;
  if ('estimate_hours' in row && row.estimate_hours != null) row.estimate_hours = +row.estimate_hours;
  return row;
}

export const toTask = r => ({
  id: r.id, taskNo: r.task_no, title: r.title, description: r.description || '',
  type: r.type || 'Task', status: r.status || 'Backlog', priority: r.priority || 'Medium',
  assignees: r.assignees || [], reporter: r.reporter, dueDate: r.due_date || '', startDate: r.start_date || '',
  labels: r.labels || [], projectId: r.project_id, projectName: r.project_name || '',
  parentId: r.parent_id, sprintId: r.sprint_id, storyPoints: r.story_points, estimateHours: r.estimate_hours,
  watchers: r.watchers || [], checklist: r.checklist || [], links: r.links || [],
  comments: r.comments || [], attachments: r.attachments || [], sortOrder: r.sort_order ?? 0,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

const toSprint = r => ({
  id: r.id, projectId: r.project_id, name: r.name, goal: r.goal || '', startDate: r.start_date || '',
  endDate: r.end_date || '', status: r.status, completedAt: r.completed_at, createdAt: r.created_at,
});

const toLog = r => ({
  id: r.id, taskId: r.task_id, projectId: r.project_id, personKind: r.person_kind, personId: r.person_id,
  personName: r.person_name, minutes: r.minutes, logDate: r.log_date, note: r.note || '', createdAt: r.created_at,
});

const must = ({ data, error }) => { if (error) throw error; return data; };

// ── Tasks ─────────────────────────────────────────────────────────
export const workTasks = {
  list: async () => (must(await supabase.from('tasks').select('*')
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true })) || []).map(toTask),
  // task_no is assigned by the database (per-project numbering)
  create: async (t) => toTask(must(await supabase.from('tasks').insert(toRow(t)).select().single())),
  update: async (id, patch) => toTask(must(await supabase.from('tasks').update(toRow(patch)).eq('id', id).select().single())),
  remove: async (id) => { must(await supabase.from('tasks').delete().eq('id', id)); },
};

// ── Sprints ───────────────────────────────────────────────────────
export const workSprints = {
  list: async () => (must(await supabase.from('sprints').select('*').order('created_at')) || []).map(toSprint),
  create: async (s) => toSprint(must(await supabase.from('sprints').insert({
    project_id: s.projectId, name: s.name, goal: s.goal || null, start_date: s.startDate || null,
    end_date: s.endDate || null, status: s.status || 'planned',
  }).select().single())),
  update: async (id, s) => {
    const row = {};
    if ('name' in s) row.name = s.name;
    if ('goal' in s) row.goal = s.goal || null;
    if ('startDate' in s) row.start_date = s.startDate || null;
    if ('endDate' in s) row.end_date = s.endDate || null;
    if ('status' in s) { row.status = s.status; row.completed_at = s.status === 'completed' ? new Date().toISOString() : null; }
    return toSprint(must(await supabase.from('sprints').update(row).eq('id', id).select().single()));
  },
  remove: async (id) => { must(await supabase.from('sprints').delete().eq('id', id)); },
};

// ── Time logs ─────────────────────────────────────────────────────
export const workTime = {
  list: async ({ from, to } = {}) => {
    let q = supabase.from('time_logs').select('*').order('log_date', { ascending: false });
    if (from) q = q.gte('log_date', from);
    if (to) q = q.lte('log_date', to);
    return (must(await q) || []).map(toLog);
  },
  create: async (l) => toLog(must(await supabase.from('time_logs').insert({
    task_id: l.taskId || null, project_id: l.projectId || null, person_kind: l.personKind, person_id: l.personId,
    person_name: l.personName, minutes: Math.round(l.minutes), log_date: l.logDate, note: l.note || null,
  }).select().single())),
  remove: async (id) => { must(await supabase.from('time_logs').delete().eq('id', id)); },
};

// ── Activity ──────────────────────────────────────────────────────
export const workActivity = {
  // status changes for many tasks (reports: burndown, cycle time, resolved/week)
  statusEvents: async (taskIds) => {
    if (!taskIds.length) return [];
    const out = [];
    for (let i = 0; i < taskIds.length; i += 150) {
      const part = must(await supabase.from('task_activity').select('task_id, from_value, to_value, created_at')
        .eq('field', 'status').in('task_id', taskIds.slice(i, i + 150)).order('created_at')) || [];
      out.push(...part.map(r => ({ taskId: r.task_id, from: r.from_value, to: r.to_value, at: r.created_at })));
    }
    return out;
  },
  forTask: async (taskId) => (must(await supabase.from('task_activity').select('*').eq('task_id', taskId)
    .order('created_at', { ascending: false }).limit(100)) || []).map(r => ({
      id: r.id, actor: r.actor, action: r.action, field: r.field, from: r.from_value, to: r.to_value, at: r.created_at,
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
