// ================================================================
// Codelix OMS — data layer for the partner-side modules.
// Thin clients over the Spring Boot API (see lib/http.js). The server speaks
// the same camelCase objects the pages use, so nothing is mapped here; this
// file only tidies what forms produce ('' → null, numbers as numbers) and
// carries each record's `version` back on updates.
// ================================================================
import { http, query, ApiError } from './http';

// The last `version` the server gave us for each record. Pages normally hand
// back the object they hold (which carries its version); this covers the forms
// that send only a few fields.
const versions = new Map();
const seen = r => { if (r && typeof r === 'object' && r.id != null && r.version != null) versions.set(r.id, r.version); return r; };
const seenAll = rows => { (rows || []).forEach(seen); return rows || []; };
const versionFor = (id, body) => body?.version ?? versions.get(id);

// '' / undefined → null; listed numeric fields → number (or null when blank)
function tidy(obj, { num = [], drop = [] } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (drop.includes(k)) continue;
    out[k] = v === '' || v === undefined ? null : v;
  }
  for (const k of num) if (k in out) out[k] = out[k] == null || Number.isNaN(+out[k]) ? null : +out[k];
  return out;
}
const SERVER_OWNED = ['id', 'createdAt', 'updatedAt'];

function resource(path, clean = x => x) {
  return {
    getAll: async params => seenAll(await http.get(path + query(params))),
    get: async id => seen(await http.get(`${path}/${id}`)),
    create: async body => seen(await http.post(path, tidy(clean(body), { drop: [...SERVER_OWNED, 'version'] }))),
    update: async (id, body) => seen(await http.put(`${path}/${id}`, { ...tidy(clean(body), { drop: SERVER_OWNED }), version: versionFor(id, body) })),
    delete: async id => { await http.del(`${path}/${id}`); versions.delete(id); },
  };
}

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ─────────────────────────────────────────────
// CLIENTS
// ─────────────────────────────────────────────
const clients = resource('/clients', c => ({
  // closing details are set only through updateStatus; createdBy is stamped by the server
  ...tidy(c, { num: ['proposalValue', 'finalPrice'], drop: ['lostReason', 'wonReasons', 'closeNote', 'closedDate', 'createdBy', 'projectId'] }),
  createdDate: c.createdDate || todayISO(),
  followupHistory: c.followupHistory || [],
}));

export const clientsDB = {
  ...clients,
  // entry: { date, note, status, nextFollowup } — the server stamps who and when, and returns the client
  addFollowup: async (id, { date, note, status, nextFollowup }) =>
    seen(await http.post(`/clients/${id}/followups`, { date, note: note || null, status: status || null, nextFollowup: nextFollowup || null })),
  // Draft | Won ({ wonReasons, finalPrice, closeNote }) | Lost ({ lostReason, closeNote }: the server
  // sets the next follow-up from the reason) → the updated client
  // Won also takes { proposalValue, projectId }: the price that was proposed (the discount is
  // that minus finalPrice) and the project created from the lead.
  updateStatus: async (id, status, { lostReason, wonReasons, closeNote, finalPrice, proposalValue, projectId } = {}) => {
    const money = v => (v === '' || v == null || Number.isNaN(+v) ? null : +v);
    return seen(await http.patch(`/clients/${id}/status`, {
      status, lostReason: lostReason || null, wonReasons: wonReasons || [], closeNote: closeNote || null,
      finalPrice: money(finalPrice), proposalValue: money(proposalValue), projectId: projectId || null,
    }));
  },
};

// ─────────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────────
// Rows written by a salary payment are read-only here (the server answers 409).
const transactionsBase = resource('/transactions', t => tidy(t, { num: ['amount'], drop: ['salaryPaymentId', 'projectPaymentId', 'pairId'] }));
export const transactionsDB = {
  ...transactionsBase,
  // Money moved between own accounts: two rows (out, in) written together. Resolves to both.
  transfer: async ({ from, to, amount, date, paymentMethod, remark }) =>
    http.post('/transactions/transfer', { from, to, amount: +amount, date, paymentMethod: paymentMethod || null, remark: remark || null }),
};

// ─────────────────────────────────────────────
// SETTINGS (opening balances, partner salary config, …) — partners only
// ─────────────────────────────────────────────
export const settingsDB = {
  get: async key => {
    try { return (await http.get(`/settings/${encodeURIComponent(key)}`))?.value ?? null; }
    catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
  },
  set: async (key, value) => { await http.put(`/settings/${encodeURIComponent(key)}`, { value }); },
};

// ─────────────────────────────────────────────
// EMPLOYEES
// `salaryHistory` is worked out by the server from salary payments
// ([{ id, month, paid, date, method, remark, account }], newest first).
// ─────────────────────────────────────────────
const employees = resource('/employees', e => {
  const out = tidy(e, { num: ['salaryAmount'], drop: ['salaryHistory', 'userId'] });
  if (!out.empId) delete out.empId;   // left out → the server assigns the next code (CLX-001 …)
  return out;
});

export const employeesDB = {
  ...employees,
  me: async () => http.get('/employees/me'),
  setStatus: async (id, status) => seen(await http.patch(`/employees/${id}/status`, { status })),
  // One call records the payment AND its ledger entry; resolves to the updated employee.
  paySalary: async (id, { month, amount, date, method, account, remark }) =>
    seen(await http.post(`/employees/${id}/salary-payments`, { month, amount: +amount, date, method, account, remark: remark || null })),
  deleteSalaryPayment: async (id, paymentId) => {
    const res = await http.del(`/employees/${id}/salary-payments/${paymentId}`);
    return res && typeof res === 'object' ? seen(res) : null;
  },
};

// ─────────────────────────────────────────────
// PROJECTS
// Payments have their own endpoints (each returns the updated project), so a
// project save never carries the payments list.
// ─────────────────────────────────────────────
const cleanProject = p => ({
  ...tidy(p, { num: ['valuation'], drop: ['payments', 'key'] }),
  billingType: p.billingType || 'Without GST',
  milestones: p.milestones || [],
  assignedEmployees: p.assignedEmployees || [],
});
const cleanPayment = p => tidy(p, { num: ['amount'], drop: ['id', 'key'] });
const projects = resource('/projects', cleanProject);

export const projectsDB = {
  ...projects,
  addPayment: async (id, payment) => seen(await http.post(`/projects/${id}/payments`, cleanPayment(payment))),
  updatePayment: async (id, paymentId, payment) => seen(await http.put(`/projects/${id}/payments/${paymentId}`, cleanPayment(payment))),
  deletePayment: async (id, paymentId) => seen(await http.del(`/projects/${id}/payments/${paymentId}`)),
};

// ─────────────────────────────────────────────
// CREDENTIALS
// The list never contains passwords (`hasPassword` says whether one is stored).
// ─────────────────────────────────────────────
const cleanCredential = c => {
  const out = tidy(c, { drop: ['hasPassword'] });
  if (!out.password) delete out.password;   // blank on edit = keep the stored password
  return out;
};
const credentials = resource('/credentials', cleanCredential);

export const credentialsDB = {
  ...credentials,
  // Fetched only when someone presses Reveal or Copy; the server records it in the audit trail.
  password: async id => (await http.get(`/credentials/${id}/password`))?.password ?? '',
};

// ─────────────────────────────────────────────
// EXISTING (PAST) PROJECTS
// ─────────────────────────────────────────────
export const existingProjectsDB = resource('/existing-projects', p => ({
  ...tidy(p, { num: ['finalValue'] }),
  billingType: p.billingType || 'Without GST',
  status: p.status || 'Delivered',
}));

// ─────────────────────────────────────────────
// NOTIFICATIONS  (always "mine" — the server knows who is asking)
// ─────────────────────────────────────────────
export const notificationsDB = {
  getFor: async (limit = 30) => (await http.get(`/notifications${query({ limit })}`)) || [],
  // [{ recipient: { kind, id, name }, type, title, body, taskId }] — the server stamps the sender
  createMany: async notifs => {
    const rows = (notifs || []).filter(n => n?.recipient?.id != null).map(n => ({
      recipient: { kind: n.recipient.kind, id: n.recipient.id, name: n.recipient.name || null },
      type: n.type || 'task', title: n.title, body: n.body || null, taskId: n.taskId || null,
    }));
    if (!rows.length) return 0;
    await http.post('/notifications', rows);
    return rows.length;
  },
  markRead: async id => { await http.post(`/notifications/${id}/read`); },
  markAllRead: async () => { await http.post('/notifications/read-all'); },
};

// ─────────────────────────────────────────────
// AUDIT LOG  (the server stamps who did it)
// ─────────────────────────────────────────────
export const auditDB = {
  getAll: async entity => (await http.get(`/audit${query({ entity })}`)) || [],
  // Never throws: a missing history line must not fail the action it describes.
  log: async ({ entity, entityId, action, description, prevData, nextData }) => {
    try {
      return await http.post('/audit', {
        entity, entityId: entityId || null, action, description: description || null,
        prevData: prevData ?? null, nextData: nextData ?? null,
      });
    } catch (e) { console.error('Audit log error:', e); return null; }
  },
};

// ─────────────────────────────────────────────
// DIRECTORY  (no money fields — safe for employees)
// People come from lib/people.js (usePeople).
// ─────────────────────────────────────────────
export const directoryDB = {
  // partners: every project; employees: only the ones they are on
  projects: async () => ((await http.get('/project-directory')) || []).map(p => ({
    ...p, key: p.key || null, status: p.status || null, startDate: p.startDate || '', dueDate: p.dueDate || '', members: p.members || [],
  })),
};

// ─────────────────────────────────────────────
// EMPLOYEE LOGINS  (access admins only)
// ─────────────────────────────────────────────
export const adminUsersAPI = {
  list:   async ()           => (await http.get('/access/logins')) || [],
  create: async (employeeId) => (await http.post(`/employees/${employeeId}/login`)).tempPassword,
  reset:  async (employeeId) => (await http.post(`/employees/${employeeId}/login/reset`)).tempPassword,
  revoke: async (employeeId) => { await http.del(`/employees/${employeeId}/login`); },
};
