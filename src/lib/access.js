// ================================================================
// Codelix OMS — employee access model (shared by UI and routing)
// Stored per employee in app_users.permissions as { module: [actions] }.
// The database (supabase/security.sql + work.sql) enforces the same keys.
// ================================================================
import { supabase } from './supabase';

export const MODULES = [
  { key: 'tasks', label: 'Tasks', desc: 'Tasks assigned to them, tasks they created, and tasks in projects they can open',
    actions: [['view', 'View'], ['create', 'Create'], ['edit', 'Edit & move'], ['delete', 'Delete own']] },
  { key: 'projects', label: 'Project boards', desc: 'Boards, backlog and sprints of projects they are on (no money details)',
    actions: [['view', 'View'], ['edit', 'Manage sprints']] },
  { key: 'timesheet', label: 'Timesheet', desc: 'Log and see their own working hours',
    actions: [['view', 'View'], ['create', 'Log time']] },
  { key: 'chat', label: 'Chat', desc: 'Direct messages and groups they are a member of',
    actions: [['view', 'View & reply'], ['create', 'Start chats']] },
];

export const TEMPLATES = [
  { id: 'none', label: 'No access', perms: {} },
  { id: 'intern', label: 'Intern', perms: { tasks: ['view', 'edit'], timesheet: ['view', 'create'], chat: ['view'] } },
  { id: 'developer', label: 'Developer', perms: { tasks: ['view', 'create', 'edit'], projects: ['view'], timesheet: ['view', 'create'], chat: ['view', 'create'] } },
  { id: 'designer', label: 'Designer', perms: { tasks: ['view', 'create', 'edit'], projects: ['view'], timesheet: ['view', 'create'], chat: ['view', 'create'] } },
  { id: 'lead', label: 'Team lead', perms: { tasks: ['view', 'create', 'edit', 'delete'], projects: ['view', 'edit'], timesheet: ['view', 'create'], chat: ['view', 'create'] } },
];

// Keep the shape valid: any action implies 'view'; no view → module removed.
export function normalizePerms(perms = {}) {
  const out = {};
  for (const m of MODULES) {
    const allowed = new Set(m.actions.map(a => a[0]));
    const acts = [...new Set((perms[m.key] || []).filter(a => allowed.has(a)))];
    if (acts.length && !acts.includes('view')) acts.unshift('view');
    if (acts.length) out[m.key] = m.actions.map(a => a[0]).filter(a => acts.includes(a));
  }
  return out;
}

export function togglePerm(perms, module, action) {
  const cur = new Set(perms[module] || []);
  if (cur.has(action)) {
    if (action === 'view') cur.clear(); else cur.delete(action);
  } else cur.add(action);
  return normalizePerms({ ...perms, [module]: [...cur] });
}

export const samePerms = (a, b) => JSON.stringify(normalizePerms(a)) === JSON.stringify(normalizePerms(b));

export function matchTemplate(perms) {
  return TEMPLATES.find(t => samePerms(t.perms, perms))?.id || 'custom';
}

export function permSummary(perms) {
  const p = normalizePerms(perms);
  const names = MODULES.filter(m => p[m.key]).map(m => m.label);
  return names.length ? names.join(', ') : 'No access';
}

// Only access admins pass the database rule on app_users.
export const accessDB = {
  setPermissions: async (employeeId, permissions) => {
    const { data, error } = await supabase.from('app_users')
      .update({ permissions: normalizePerms(permissions) })
      .eq('employee_id', employeeId).select('permissions');
    if (error) throw error;
    if (!data?.length) throw new Error('This employee has no login yet — create one first.');
    return data[0].permissions;
  },
};
