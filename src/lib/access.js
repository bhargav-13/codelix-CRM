// ================================================================
// Codelix OMS — employee access model (shared by UI and routing)
// Stored per user as { module: [actions] } (GET/PUT /users/{id}/permissions).
// The server enforces the same keys as `module:ACTION` authorities.
// ================================================================
import { http } from './http';

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

// Access admins only — the server refuses everyone else.
// A login row: { userId, email, role ('partner' | 'employee'), displayName, employeeId,
//                isAccessAdmin, permissions, mustChangePassword, active, createdAt }
const loginRow = l => ({
  ...l, role: String(l.role || '').toUpperCase() === 'PARTNER' ? 'partner' : 'employee', permissions: l.permissions || {},
});

export const accessDB = {
  listLogins: async () => ((await http.get('/access/logins')) || []).map(loginRow),
  // Partners only: whether this partner may manage logins and access. Resolves to the saved login row.
  // The server refuses to remove the last one ("At least one partner must manage access.").
  setAccessAdmin: async (userId, isAccessAdmin) => {
    const row = await http.put(`/users/${userId}/access-admin`, { isAccessAdmin: !!isAccessAdmin });
    return row && typeof row === 'object' ? loginRow(row) : null;
  },
  // The person keeps their password but must choose a new one at their next sign-in.
  requirePasswordChange: async userId => { await http.post(`/users/${userId}/require-password-change`); },
  getPermissions: async userId => normalizePerms(await http.get(`/users/${userId}/permissions`)),
  // Per-user grants, on top of whatever the role gives. Resolves to what was saved.
  setPermissions: async (userId, permissions) => {
    if (!userId) throw new Error('This employee has no login yet — create one first.');
    const body = normalizePerms(permissions);
    const saved = await http.put(`/users/${userId}/permissions`, body);
    return normalizePerms(saved && typeof saved === 'object' ? saved : body);
  },
  // Employee logins: the temporary password is shown once and must be changed at first sign-in.
  createLogin: async employeeId => (await http.post(`/employees/${employeeId}/login`)).tempPassword,
  resetLogin: async employeeId => (await http.post(`/employees/${employeeId}/login/reset`)).tempPassword,
  revokeLogin: async employeeId => { await http.del(`/employees/${employeeId}/login`); },
};
