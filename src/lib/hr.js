// ================================================================
// Codelix OMS — Attendance, Leave and Payroll client (contract v1).
// Thin wrappers over the Spring Boot API plus the pure helpers the three
// screens share. Timezone is Asia/Kolkata everywhere; "today" and every punch
// time come from the SERVER — the helpers here only format what it sends.
// ================================================================
import { http, query, session, refreshSession, API_URL, ApiError } from './http';

const enc = encodeURIComponent;
const numOrNull = v => (v === '' || v == null || Number.isNaN(+v) ? null : +v);
const list = async p => (await p) || [];

// ─── Policy (one row) ────────────────────────────────────────────
export const policyAPI = {
  get: () => http.get('/hr/policy'),
  // the whole policy goes back, with the `version` the page holds
  save: policy => http.put('/hr/policy', policy),
};

// ─── Holidays ────────────────────────────────────────────────────
export const holidaysAPI = {
  list: year => list(http.get(`/hr/holidays${query({ year })}`)),
  create: ({ date, name }) => http.post('/hr/holidays', { date, name }),
  update: (id, { date, name, version }) => http.put(`/hr/holidays/${enc(id)}`, { date, name, version }),
  remove: id => http.del(`/hr/holidays/${enc(id)}`),
};

// ─── Attendance ──────────────────────────────────────────────────
export const attendanceAPI = {
  today: () => http.get('/attendance/today'),                 // own day record + reason (day off) + serverTime
  mine: month => http.get(`/attendance/me${query({ month })}`), // { month, days, summary }
  team: month => list(http.get(`/attendance${query({ month })}`)), // partner: [{ employeeId, employeeName, days, summary }]
  forEmployee: (employeeId, month) => http.get(`/attendance/${enc(employeeId)}${query({ month })}`),
  // body: { punchIn: "HH:mm"|null, punchOut: "HH:mm"|null, status?: PRESENT|HALF_DAY|ABSENT, note }
  correct: (employeeId, date, { punchIn, punchOut, status, note }) => {
    const body = { punchIn: punchIn || null, punchOut: punchOut || null, note };
    if (status) body.status = status;
    return http.put(`/attendance/${enc(employeeId)}/${enc(date)}`, body);
  },
  removeCorrection: (employeeId, date) => http.del(`/attendance/${enc(employeeId)}/${enc(date)}`),
  // partner: { configured, devices: [{ deviceKey, agentHost, lastSeenAt, lastPunchAt }], unmatched: [{ deviceUserId, scans, firstScanAt, lastScanAt }] }
  deviceSync: () => http.get('/attendance/device-sync'),
  myScans: date => list(http.get(`/attendance/me/scans${query({ date })}`)),                       // [{ time, deviceKey }]
  scansOf: (employeeId, date) => list(http.get(`/attendance/${enc(employeeId)}/${enc(date)}/scans`)), // partner
};

// ─── "The device missed my scan" requests ────────────────────────
// Employee: create / mine / cancel (own only). Partner: list / approve / reject.
export const correctionsAPI = {
  create: ({ date, punchIn, punchOut, reason }) =>
    http.post('/attendance/correction-requests', { date, punchIn: punchIn || null, punchOut: punchOut || null, reason }),
  mine: () => list(http.get('/attendance/correction-requests/mine')),
  cancel: id => http.post(`/attendance/correction-requests/${enc(id)}/cancel`),
  list: status => list(http.get(`/attendance/correction-requests${query({ status })}`)),
  approve: (id, note) => http.post(`/attendance/correction-requests/${enc(id)}/approve`, { note: note || null }),
  reject: (id, note) => http.post(`/attendance/correction-requests/${enc(id)}/reject`, { note }),
};

// ─── Salary bank details / UPI change requests ──────────────────
// The employee asks; the HR record changes only when a partner approves.
export const bankChangesAPI = {
  create: ({ upiId, bankDetails, reason }) => http.post('/bank-change-requests', { upiId: upiId || null, bankDetails: bankDetails || null, reason }),
  mine: () => list(http.get('/bank-change-requests/mine')),
  cancel: id => http.post(`/bank-change-requests/${enc(id)}/cancel`),
  list: status => list(http.get(`/bank-change-requests${query({ status })}`)),
  approve: (id, note) => http.post(`/bank-change-requests/${enc(id)}/approve`, { note: note || null }),
  reject: (id, note) => http.post(`/bank-change-requests/${enc(id)}/reject`, { note }),
};

// ─── Leave ───────────────────────────────────────────────────────
export const leaveAPI = {
  balance: () => http.get('/leave/balance'),
  balanceFor: employeeId => http.get(`/leave/balance/${enc(employeeId)}`),
  mine: () => list(http.get('/leave/requests/mine')),
  request: ({ fromDate, toDate, halfDay, reason }) =>
    http.post('/leave/requests', { fromDate, toDate, halfDay: !!halfDay && fromDate === toDate, reason }),
  cancel: id => http.post(`/leave/requests/${enc(id)}/cancel`),
  list: status => list(http.get(`/leave/requests${query({ status })}`)),   // partner
  approve: (id, note) => http.post(`/leave/requests/${enc(id)}/approve`, { note: note || null }),
  reject: (id, note) => http.post(`/leave/requests/${enc(id)}/reject`, { note }),
};

// ─── Salary advances ───────────────────────────────────
export const advancesAPI = {
  mine: () => list(http.get('/employees/me/advances')),               // employee: own, read-only
  list: employeeId => list(http.get(`/employees/${enc(employeeId)}/advances`)),
  give: (employeeId, { amount, date, method, account, note, recoverPerMonth }) =>
    http.post(`/employees/${enc(employeeId)}/advances`, {
      amount: +amount, date, method, account, note: note || null, recoverPerMonth: numOrNull(recoverPerMonth) ?? 0,
    }),
  remove: (employeeId, advanceId) => http.del(`/employees/${enc(employeeId)}/advances/${enc(advanceId)}`),
};

// ─── Payroll ─────────────────────────────────────────────────────
const pdfPath = (runId, employeeId) => `/payroll/runs/${enc(runId)}/payslips/${enc(employeeId)}/pdf`;

export const payrollAPI = {
  runs: () => list(http.get('/payroll/runs')),
  start: month => http.post('/payroll/runs', { month }),
  recalculate: id => http.post(`/payroll/runs/${enc(id)}/recalculate`),
  updateLine: (id, employeeId, { bonus, otherDeduction, advanceRecovery, note, version }) =>
    http.put(`/payroll/runs/${enc(id)}/lines/${enc(employeeId)}`, {
      bonus: numOrNull(bonus) ?? 0, otherDeduction: numOrNull(otherDeduction) ?? 0,
      advanceRecovery: numOrNull(advanceRecovery) ?? 0, note: note || null, version,
    }),
  approve: id => http.post(`/payroll/runs/${enc(id)}/approve`),
  reopen: id => http.post(`/payroll/runs/${enc(id)}/reopen`),
  pay: (id, { date, method, account }) => http.post(`/payroll/runs/${enc(id)}/pay`, { date, method, account }),
  remove: id => http.del(`/payroll/runs/${enc(id)}`),
  myPayslips: () => list(http.get('/payroll/payslips/mine')),
  payslip: (runId, employeeId) => http.get(`/payroll/runs/${enc(runId)}/payslips/${enc(employeeId)}`),
  // The PDF needs the Authorization header, so it is fetched as a blob — the
  // token never goes in a URL. One refresh + retry on 401, like lib/http.js.
  async payslipPdf(runId, employeeId) {
    const call = () => {
      const token = session.getAccessToken();
      return fetch(`${API_URL}/api/v1${pdfPath(runId, employeeId)}`, {
        headers: { Accept: 'application/pdf', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    };
    let res;
    try {
      res = await call();
      if (res.status === 401) { const auth = await refreshSession(); if (auth) res = await call(); }
    } catch {
      throw new ApiError('Cannot reach the server. Check your connection.', 0, null);
    }
    if (!res.ok) {
      let body = null;
      try { body = JSON.parse(await res.text()); } catch { /* not JSON */ }
      const fromServer = Array.isArray(body?.errors) ? body.errors.map(e => e?.message).filter(Boolean).join('; ') : body?.message;
      const fallback = res.status === 401 ? 'Your session has ended. Please sign in again.'
        : res.status === 403 ? 'You do not have permission to open this payslip.'
        : res.status === 404 ? 'This payslip is not available yet.'
        : 'Could not get the payslip PDF. Please try again.';
      throw new ApiError((res.status !== 401 && fromServer) || fallback, res.status, body);
    }
    return res.blob();
  },
};

// Fetch the payslip PDF and hand it to the browser through an object URL.
// mode 'open' shows it in a new tab (falls back to a download when the browser
// blocks the tab); mode 'download' saves it under `filename`.
export async function openPayslipPdf(runId, employeeId, { filename = 'payslip.pdf', mode = 'download' } = {}) {
  const blob = await payrollAPI.payslipPdf(runId, employeeId);
  const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'application/pdf' }));
  const tab = mode === 'open' ? window.open(url, '_blank', 'noopener') : null;
  if (!tab) {
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ================================================================
// Pure helpers
// ================================================================
const TZ = 'Asia/Kolkata';
const pad = n => String(n).padStart(2, '0');
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export const WEEKDAY_LABEL = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' };
const JS_DAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// status → what to show. `tone` picks the colour class (hr-s-<tone>), `short`
// is the letter in the compact partner grid, `legend` the wording in the legend
// when it differs from the label. NOT_TRACKED is a day before the office
// started recording attendance: paid, never an absence, always neutral grey.
export const ATTENDANCE_STATUS = {
  PRESENT:    { label: 'Present',    short: 'P', tone: 'present' },
  LATE:       { label: 'Late',       short: 'L', tone: 'late' },
  HALF_DAY:   { label: 'Half day',   short: '½', tone: 'half' },
  ABSENT:     { label: 'Absent',     short: 'A', tone: 'absent' },
  ON_LEAVE:   { label: 'On leave',   short: 'LV', tone: 'leave' },
  HOLIDAY:    { label: 'Holiday',    short: 'H', tone: 'holiday' },
  WEEKLY_OFF: { label: 'Weekly off', short: '–', tone: 'off' },
  NOT_MARKED: { label: 'Not marked', short: '·', tone: 'none' },
  NOT_TRACKED: { label: 'Not tracked', short: '∅', tone: 'untracked', legend: 'Before attendance started' },
};
// A status this build does not know (a newer server) still gets a readable
// label and the neutral tone - it can never crash a screen or show as red.
const unknownLabel = s => { const t = String(s).replace(/_/g, ' ').trim().toLowerCase(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'; };
export const statusMeta = s =>
  (typeof s === 'string' && Object.hasOwn(ATTENDANCE_STATUS, s) ? ATTENDANCE_STATUS[s] : null)
  || { label: s == null || s === '' ? '—' : unknownLabel(s), short: '?', tone: 'none' };
export const LEGEND = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'HOLIDAY', 'WEEKLY_OFF', 'NOT_MARKED', 'NOT_TRACKED'];

// Badge colours (see components/ui/Badge.jsx)
export const LEAVE_STATUS = {
  PENDING:   { label: 'Pending',   color: 'orange' },
  APPROVED:  { label: 'Approved',  color: 'green' },
  REJECTED:  { label: 'Rejected',  color: 'red' },
  CANCELLED: { label: 'Cancelled', color: 'gray' },
};
export const leaveMeta = s => LEAVE_STATUS[s] || { label: s || '—', color: 'gray' };
export const RUN_STATUS = {
  DRAFT:    { label: 'Draft',    color: 'orange' },
  APPROVED: { label: 'Approved', color: 'blue' },
  PAID:     { label: 'Paid',     color: 'green' },
};
export const runMeta = s => RUN_STATUS[s] || { label: s || '—', color: 'gray' };
export const RUN_STEPS = ['DRAFT', 'APPROVED', 'PAID'];

// 465 → "7h 45m"
export function fmtMinutes(mins) {
  const m = Math.max(0, Math.round(+mins || 0));
  if (!m) return '0h';
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
}
// 1 → "1 day", 0.5 → "½ day", 2.5 → "2.5 days"
export function fmtDays(n) {
  const v = +n || 0;
  if (v === 0.5) return '½ day';
  return `${Number.isInteger(v) ? v : v.toFixed(1)} day${v === 1 ? '' : 's'}`;
}
export const fmtNum = n => { const v = +n || 0; return Number.isInteger(v) ? String(v) : v.toFixed(1); };

const HM = /^(\d{1,2}):(\d{2})/;
const asDate = v => { const d = v instanceof Date ? v : new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
// ISO timestamp (or "HH:mm") → "10:05 am", always in office time
export function fmtTime(v) {
  if (!v) return '—';
  const m = typeof v === 'string' ? HM.exec(v) : null;
  const d = m ? new Date(2000, 0, 1, +m[1], +m[2]) : asDate(v);
  if (!d) return String(v);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, ...(m ? {} : { timeZone: TZ }) });
}
// ISO timestamp → "HH:mm" in office time, for <input type="time">
export function toHM(v) {
  if (!v) return '';
  const m = typeof v === 'string' ? HM.exec(v) : null;
  if (m) return `${pad(+m[1])}:${m[2]}`;
  const d = asDate(v);
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const get = t => parts.find(p => p.type === t)?.value || '00';
  return `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
}
// A Date → "10:05:09 am" in office time (the live clock)
export const fmtClock = d => d.toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
export const fmtLongDate = d => d.toLocaleDateString('en-IN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// Calendar date in office time as YYYY-MM-DD
export const dateIST = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export const todayIST = () => dateIST(new Date());

// ─── Months ("YYYY-MM") ──────────────────────────────────────────
export const currentMonth = () => todayIST().slice(0, 7);
export function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export const lastCompletedMonth = () => shiftMonth(currentMonth(), -1);
export function monthLabel(month) {
  const [y, m] = String(month || '').split('-').map(Number);
  return y && m ? `${MONTH_NAMES[m - 1]} ${y}` : String(month || '');
}
export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
export const monthDates = month => Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${pad(i + 1)}`);
// "2026-11-19" → "THU"
export function weekdayOf(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  return JS_DAY[new Date(y, m - 1, d).getDay()];
}
export const dayOfMonth = date => +String(date).slice(8, 10);
export const fmtDayLong = date => {
  const [y, m, d] = String(date).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
};
export function addDays(date, n) {
  const [y, m, d] = String(date).split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

// Working days a leave request covers, the way the server counts them:
// policy working days only, holidays left out, 0.5 for a half day.
// → { days, known } — `known` is false when the policy could not be read.
export function countLeaveDays({ fromDate, toDate, halfDay }, policy, holidayDates) {
  if (!fromDate || !toDate || toDate < fromDate) return { days: 0, known: true };
  const working = Array.isArray(policy?.workingDays) ? policy.workingDays : null;
  let days = 0;
  for (let d = fromDate, i = 0; d <= toDate && i < 400; d = addDays(d, 1), i++) {
    if (working && !working.includes(weekdayOf(d))) continue;
    if (holidayDates?.has(d)) continue;
    days++;
  }
  if (halfDay && fromDate === toDate) days = days ? 0.5 : 0;
  return { days, known: !!working };
}

// Who is in / late / not marked / on leave on `date`, from the partner month rows.
export function daySummary(rows, date) {
  const out = { in: [], late: [], notMarked: [], onLeave: [], absent: [], off: false, total: 0 };
  let offCount = 0;
  for (const r of rows || []) {
    const day = (r.days || []).find(d => d.date === date);
    if (!day) continue;
    out.total++;
    const who = { id: r.employeeId, name: r.employeeName, day };
    if (day.status === 'HOLIDAY' || day.status === 'WEEKLY_OFF') { offCount++; continue; }
    if (day.status === 'ON_LEAVE') { out.onLeave.push(who); continue; }
    if (day.punchIn) { out.in.push(who); if (day.status === 'LATE') out.late.push(who); continue; }
    if (day.status === 'ABSENT') out.absent.push(who);
    else out.notMarked.push(who);
  }
  out.off = out.total > 0 && offCount === out.total;
  return out;
}

// Payroll totals: what the server sent, else the sum of the lines.
const TOTAL_KEYS = ['gross', 'unpaidDeduction', 'advanceRecovery', 'bonus', 'otherDeduction', 'net', 'alreadyPaid', 'payable'];
export function runTotals(run) {
  const lines = run?.lines || [];
  const out = {};
  for (const k of TOTAL_KEYS) {
    const sent = run?.totals?.[k];
    out[k] = sent != null && !Number.isNaN(+sent) ? +sent : lines.reduce((s, l) => s + (+l[k] || 0), 0);
  }
  out.employees = lines.length;
  return out;
}
// Everything taken off the gross on one line
export const lineDeductions = l => (+l.unpaidDeduction || 0) + (+l.otherDeduction || 0);
