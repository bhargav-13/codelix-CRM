import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Badge, { getStatusColor } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { employeesDB, auditDB } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { NumInput } from '../lib/numInput';
import { DEPARTMENTS, EMPLOYMENT_TYPES, SALARY_TYPES, PAYMENT_METHODS } from '../data/mockData';
import {
  useToast, Drawer, Field, FormGrid, FormSection, Toolbar, StatTiles, SkeletonRows, EmptyPanel, ErrorPanel,
  RowMenu, Avatar, fmtMoney, fmtDate, todayLocal,
} from '../components/ui/kit';
import { Link } from 'react-router-dom';
import { Plus, Edit2, Trash2, History, AlertTriangle, Banknote, Users, Wallet, CheckCircle2, Clock, Power, Eye, EyeOff, CalendarCheck } from 'lucide-react';
import BankChangeRequests from '../components/hr/BankChangeRequests';
import './HR.css';
import './Employees.css';

// Salary months are stored as "November 2026" (same label the Dashboard and
// Transactions use), so every per-month sum matches on that exact string.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabelOf = d => `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
// Current month first, then the six before it
const payMonthOptions = () => {
  const d = new Date();
  return Array.from({ length: 7 }, (_, i) => monthLabelOf(new Date(d.getFullYear(), d.getMonth() - i, 1)));
};
const PAID_FROM = ['Company Bank', 'Cash + Savings Account'];
const STATUSES = ['Active', 'Inactive', 'Left'];

const paidFor = (emp, month) => (emp.salaryHistory || [])
  .filter(h => h.month === month)
  .reduce((s, h) => s + (+h.paid || 0), 0);

// Per-month salary position. `applies` is false for people without a fixed
// monthly salary (per project, hourly, free) — they have nothing "due".
function salaryState(emp, month) {
  const salary = +emp.salaryAmount || 0;
  const paid = paidFor(emp, month);
  const applies = emp.salaryType === 'Monthly' && salary > 0;
  return { applies, salary, paid, due: applies ? Math.max(0, salary - paid) : 0 };
}
// Same rule as the Dashboard's "pending salaries"
const isPending = (emp, month) => emp.status === 'Active' && salaryState(emp, month).due > 0;

const blankEmp = () => ({
  name: '', mobile: '', email: '', address: '', role: '', department: 'Tech', joiningDate: todayLocal(),
  employmentType: 'Full-time', status: 'Active', salaryType: 'Monthly', salaryAmount: '', paymentCycle: 'Monthly',
  bankDetails: '', upiId: '', deviceUserId: '',
});

const onKeyActivate = fn => e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); fn(); }
};

function SalaryCell({ st }) {
  if (!st.applies) return <span className="faint">—</span>;
  if (st.due <= 0) return <span className="amount-in">Paid {fmtMoney(st.paid)}</span>;
  if (st.paid > 0) return <span className="emp-part">{fmtMoney(st.paid)} of {fmtMoney(st.salary)}</span>;
  return <span className="emp-due">Due {fmtMoney(st.salary)}</span>;
}

function EmployeeForm({ v, set, errors, onSubmit }) {
  return (
    <form id="emp-form" onSubmit={e => { e.preventDefault(); onSubmit(); }} noValidate>
      <FormSection title="Person">
        <FormGrid>
          <Field label="Full name" required error={errors.name}>
            <input className="mac-input" value={v.name} onChange={e => set('name', e.target.value)} placeholder="Employee name" autoFocus />
          </Field>
          <Field label="Role / designation">
            <input className="mac-input" value={v.role || ''} onChange={e => set('role', e.target.value)} placeholder="e.g. Full Stack Developer" />
          </Field>
          <Field label="Department">
            <select className="mac-select" value={v.department} onChange={e => set('department', e.target.value)}>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select>
          </Field>
          <Field label="Employment type">
            <select className="mac-select" value={v.employmentType} onChange={e => set('employmentType', e.target.value)}>{EMPLOYMENT_TYPES.map(t => <option key={t}>{t}</option>)}</select>
          </Field>
          <Field label="Joining date">
            <input className="mac-input" type="date" value={v.joiningDate || ''} onChange={e => set('joiningDate', e.target.value)} />
          </Field>
          <Field label="Status">
            <select className="mac-select" value={v.status} onChange={e => set('status', e.target.value)}>{STATUSES.map(x => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field label="Device user ID" error={errors.deviceUserId} hint="The number this person is enrolled under on the office Biomax device. Attendance comes from their scans.">
            <input className="mac-input" value={v.deviceUserId || ''} onChange={e => set('deviceUserId', e.target.value)} placeholder="e.g. 12" inputMode="numeric" autoComplete="off" />
          </Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Salary">
        <FormGrid cols={3}>
          <Field label="Salary type">
            <select className="mac-select" value={v.salaryType} onChange={e => set('salaryType', e.target.value)}>{SALARY_TYPES.map(x => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field label="Amount (₹)" error={errors.salaryAmount} hint={v.salaryType === 'Monthly' ? 'Per month — used to work out what is due' : undefined}>
            <NumInput className="mac-input" value={v.salaryAmount ?? ''} onChange={val => set('salaryAmount', val)} placeholder="0" />
          </Field>
          <Field label="Payment cycle">
            <select className="mac-select" value={v.paymentCycle || 'Monthly'} onChange={e => set('paymentCycle', e.target.value)}>{['Monthly', 'Weekly', 'Custom'].map(x => <option key={x}>{x}</option>)}</select>
          </Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Contact and bank (optional)">
        <FormGrid>
          <Field label="Mobile">
            <input className="mac-input" type="tel" value={v.mobile || ''} onChange={e => set('mobile', e.target.value)} placeholder="10-digit number" />
          </Field>
          <Field label="Email" error={errors.email}>
            <input className="mac-input" type="email" value={v.email || ''} onChange={e => set('email', e.target.value)} placeholder="email@codelix.in" />
          </Field>
          <Field label="Address" span={2}>
            <input className="mac-input" value={v.address || ''} onChange={e => set('address', e.target.value)} placeholder="City, State" />
          </Field>
          <Field label="UPI ID">
            <input className="mac-input" value={v.upiId || ''} onChange={e => set('upiId', e.target.value)} placeholder="name@upi" />
          </Field>
          <Field label="Bank details">
            <input className="mac-input" value={v.bankDetails || ''} onChange={e => set('bankDetails', e.target.value)} placeholder="Account / IFSC" />
          </Field>
        </FormGrid>
      </FormSection>
    </form>
  );
}

function PayForm({ emp, v, set, errors, overpayAsk, onSubmit }) {
  const st = salaryState(emp, v.month);
  const months = payMonthOptions();
  const amt = +v.paid || 0;
  return (
    <form id="pay-form" onSubmit={e => { e.preventDefault(); onSubmit(); }} noValidate>
      <FormSection>
        <FormGrid>
          <Field label="Salary month" required>
            <select className="mac-select" value={v.month} onChange={e => set('month', e.target.value)}>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Amount (₹)" required error={errors.paid}
            hint={st.applies
              ? (st.due > 0
                ? `${fmtMoney(st.paid)} of ${fmtMoney(st.salary)} paid for ${v.month} · ${fmtMoney(st.due)} still due`
                : `${v.month} is already paid in full (${fmtMoney(st.paid)})`)
              : 'No fixed monthly salary — enter the amount being paid'}>
            <NumInput className="mac-input" value={v.paid} onChange={val => set('paid', val)} placeholder="0" />
          </Field>
          <Field label="Payment date" required error={errors.date}>
            <input className="mac-input" type="date" value={v.date} onChange={e => set('date', e.target.value)} />
          </Field>
          <Field label="Method">
            <select className="mac-select" value={v.method} onChange={e => set('method', e.target.value)}>{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}</select>
          </Field>
          <Field label="Paid from">
            <select className="mac-select" value={v.account} onChange={e => set('account', e.target.value)}>{PAID_FROM.map(a => <option key={a}>{a}</option>)}</select>
          </Field>
          <Field label="Remark">
            <input className="mac-input" value={v.remark} onChange={e => set('remark', e.target.value)} placeholder="Optional" />
          </Field>
        </FormGrid>
        {overpayAsk && (
          <div className="emp-notice" role="alert">
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {fmtMoney(amt)} is {fmtMoney(amt - st.due)} more than what is still due for {v.month}
              {' '}({fmtMoney(st.paid)} of {fmtMoney(st.salary)} already paid). Press “Record anyway” to confirm, or change the amount.
            </span>
          </div>
        )}
        <p className="emp-note">Saving also adds an expense (Employee Salary) to Transactions.</p>
      </FormSection>
    </form>
  );
}

function EmployeeDetail({ emp, curMonth }) {
  const [tab, setTab] = useState('profile');
  const [reveal, setReveal] = useState(false);
  const st = salaryState(emp, curMonth);
  const history = useMemo(
    () => [...(emp.salaryHistory || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    [emp.salaryHistory],
  );
  const totalPaid = history.reduce((s, h) => s + (+h.paid || 0), 0);
  const hasSecrets = !!(emp.upiId || emp.bankDetails);
  const secret = val => !val ? '—' : reveal ? val : '••••••••';
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={emp.name} size={48} />
        <div className="emp-card-meta">
          <Badge color={getStatusColor(emp.status)}>{emp.status}</Badge>
          <Badge color={getStatusColor(emp.employmentType)}>{emp.employmentType}</Badge>
          <Badge>{emp.department}</Badge>
        </div>
      </div>

      <div className="tab-bar" role="tablist" style={{ alignSelf: 'flex-start' }}>
        {[['profile', 'Profile'], ['salary', `Salary (${history.length})`]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab-item ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'profile' && (
        <>
          <section className="form-section">
            <h3 className="section-title">Contact</h3>
            <dl className="kv">
              <dt>Employee ID</dt><dd>{emp.empId || '—'}</dd>
              <dt>Mobile</dt><dd>{emp.mobile ? <a href={`tel:${emp.mobile}`}>{emp.mobile}</a> : '—'}</dd>
              <dt>Email</dt><dd>{emp.email ? <a href={`mailto:${emp.email}`}>{emp.email}</a> : '—'}</dd>
              <dt>Address</dt><dd>{emp.address || '—'}</dd>
              <dt>Joined</dt><dd>{fmtDate(emp.joiningDate)}</dd>
              <dt>Device user ID</dt><dd>{emp.deviceUserId || <span className="faint">Not linked — attendance will not be counted</span>}</dd>
            </dl>
          </section>
          <section className="form-section">
            <div className="emp-secret">
              <h3 className="section-title">Bank and UPI</h3>
              {hasSecrets && (
                <button className="mac-btn mac-btn-secondary" onClick={() => setReveal(r => !r)} aria-pressed={reveal}>
                  {reveal ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Show</>}
                </button>
              )}
            </div>
            <dl className="kv">
              <dt>UPI ID</dt><dd>{secret(emp.upiId)}</dd>
              <dt>Bank details</dt><dd>{secret(emp.bankDetails)}</dd>
            </dl>
          </section>
        </>
      )}

      {tab === 'salary' && (
        <>
          <div className="emp-figures">
            <div>
              <span className="stat-label">Salary</span>
              <span className="emp-fig">{+emp.salaryAmount > 0 ? fmtMoney(emp.salaryAmount) : '—'}</span>
              <span className="stat-sub">{emp.salaryType}{emp.paymentCycle ? ` · paid ${emp.paymentCycle.toLowerCase()}` : ''}</span>
            </div>
            <div>
              <span className="stat-label">{curMonth}</span>
              <span className="emp-fig"><SalaryCell st={st} /></span>
              <span className="stat-sub">{st.applies && st.due > 0 && st.paid > 0 ? `${fmtMoney(st.due)} still due` : 'This month'}</span>
            </div>
            <div>
              <span className="stat-label">Paid so far</span>
              <span className="emp-fig">{fmtMoney(totalPaid)}</span>
              <span className="stat-sub">{history.length} payment{history.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <section className="form-section">
            <h3 className="section-title">Payment history</h3>
            {history.length === 0
              ? <p className="emp-note">No salary has been recorded for {emp.name} yet.</p>
              : (
                <div className="table-wrap" style={{ border: '1px solid var(--line)' }}>
                  <table className="data-table">
                    <thead><tr><th>Month</th><th>Paid on</th><th>Method</th><th className="num">Amount</th></tr></thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={`${h.month}-${h.date}-${i}`}>
                          <td><div className="cell-main">{h.month || '—'}</div>{h.remark && <div className="cell-sub">{h.remark}</div>}</td>
                          <td>{fmtDate(h.date)}</td>
                          <td>{h.method || '—'}</td>
                          <td className="num">{fmtMoney(h.paid)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </section>
        </>
      )}
    </>
  );
}

export default function Employees() {
  const { user, displayName } = useAuth();
  const toast = useToast();
  const currentUser = displayName || user?.email || 'Unknown';
  const curMonth = monthLabelOf(new Date());

  const [emps, setEmps] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', department: '', employmentType: '' });
  const [pendingOnly, setPendingOnly] = useState(false);

  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState(null);          // { id: null | employee id, values }
  const [formErrors, setFormErrors] = useState({});
  const [pay, setPay] = useState(null);            // { empId, month, paid, date, method, account, remark }
  const [payErrors, setPayErrors] = useState({});
  const [overpayAsk, setOverpayAsk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [showAudit, setShowAudit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      // The history list is secondary: if it fails the page still works.
      const [empData, auditData] = await Promise.all([
        employeesDB.getAll(),
        auditDB.getAll('employee').catch(e => { console.error(e); return []; }),
      ]);
      setEmps(empData); setAuditLog(auditData);
    } catch (e) { console.error(e); setLoadError(e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function logAudit(entityId, action, description) {
    try {
      await auditDB.log({ entity: 'employee', entityId, action, description });   // the server stamps who did it
      setAuditLog(l => [{ id: Date.now(), entity: 'employee', entityId, action, description, by: currentUser, createdAt: new Date().toISOString() }, ...l]);
    } catch (e) { console.error(e); }
  }

  // ── Derived numbers ─────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = emps.filter(e => e.status === 'Active');
    const pending = active.filter(e => isPending(e, curMonth));
    return {
      active: active.length,
      payroll: active.reduce((s, e) => s + (salaryState(e, curMonth).applies ? +e.salaryAmount : 0), 0),
      paid: emps.reduce((s, e) => s + paidFor(e, curMonth), 0),
      pendingCount: pending.length,
      pendingAmount: pending.reduce((s, e) => s + salaryState(e, curMonth).due, 0),
    };
  }, [emps, curMonth]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return emps.filter(e =>
      (!q || e.name?.toLowerCase().includes(q) || e.role?.toLowerCase().includes(q) || e.empId?.toLowerCase().includes(q))
      && (!filters.status || e.status === filters.status)
      && (!filters.department || e.department === filters.department)
      && (!filters.employmentType || e.employmentType === filters.employmentType)
      && (!pendingOnly || isPending(e, curMonth)));
  }, [emps, search, filters, pendingOnly, curMonth]);

  const isFiltered = !!(search || filters.status || filters.department || filters.employmentType || pendingOnly);
  const clearFilters = () => { setSearch(''); setFilters({ status: '', department: '', employmentType: '' }); setPendingOnly(false); };
  const detail = emps.find(e => e.id === detailId) || null;
  const payEmp = pay ? emps.find(e => e.id === pay.empId) : null;
  const overlayOnTop = !!(form || pay || deleteId);

  // ── Add / edit ──────────────────────────────────────────────────
  const openAdd = () => { setForm({ id: null, values: blankEmp() }); setFormErrors({}); };
  const openEdit = emp => { setForm({ id: emp.id, values: { ...emp } }); setFormErrors({}); };
  const setField = (k, v) => {
    setForm(f => ({ ...f, values: { ...f.values, [k]: v } }));
    setFormErrors(er => (er[k] ? { ...er, [k]: undefined } : er));
  };

  async function saveEmployee() {
    if (saving || !form) return;
    const v = form.values;
    const errors = {};
    if (!v.name?.trim()) errors.name = 'Enter the employee’s name';
    if (v.email && !/^\S+@\S+\.\S+$/.test(v.email.trim())) errors.email = 'This does not look like an email address';
    if (v.salaryAmount && !(+v.salaryAmount >= 0)) errors.salaryAmount = 'Enter a number';
    if (v.deviceUserId && !/^[A-Za-z0-9]{1,20}$/.test(v.deviceUserId.trim())) errors.deviceUserId = 'Letters and digits only, as shown on the device';
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      if (form.id) {
        // Salary history is worked out by the server from salary payments, so it
        // is not part of this save. The version is the one the page holds NOW.
        const current = emps.find(e => e.id === form.id);
        const updated = await employeesDB.update(form.id, { ...v, name: v.name.trim(), version: current?.version ?? v.version });
        setEmps(es => es.map(e => (e.id === form.id ? updated : e)));
        await logAudit(form.id, 'Edited', updated.name);
        toast.success('Employee updated');
      } else {
        // Logins are created by an access admin in Settings — a new employee
        // has no app access until then.
        // the employee code (CLX-001 …) is assigned by the server
        const created = await employeesDB.create({ ...v, name: v.name.trim() });
        setEmps(es => [created, ...es]);
        await logAudit(created.id, 'Created', created.name);
        toast.success(`${created.name} added`);
      }
      setForm(null);
    } catch (e) {
      toast.error(form.id ? 'Could not save changes' : 'Could not add employee', e);
    }
    setSaving(false);
  }

  async function toggleStatus(id) {
    const before = emps.find(x => x.id === id);
    if (!before) return;
    const status = before.status === 'Active' ? 'Inactive' : 'Active';
    setEmps(es => es.map(x => (x.id === id ? { ...x, status } : x)));
    try {
      const updated = await employeesDB.setStatus(id, status);
      setEmps(es => es.map(x => (x.id === id ? updated : x)));
      await logAudit(id, status === 'Active' ? 'Activated' : 'Deactivated', before.name);
      toast.success(`${before.name} is now ${status.toLowerCase()}`);
    } catch (e) {
      setEmps(es => es.map(x => (x.id === id ? { ...x, status: before.status } : x)));
      toast.error('Could not change status', e);
    }
  }

  async function deleteEmployee(id) {
    const emp = emps.find(x => x.id === id);
    if (!emp) return;
    try {
      // Deleting the employee also removes their login on the server, so they
      // lose all access immediately.
      await employeesDB.delete(id);
      setEmps(es => es.filter(x => x.id !== id));
      setDetailId(d => (d === id ? null : d));
      await logAudit(id, 'Deleted', emp.name);
      toast.success(`${emp.name} deleted`);
    } catch (e) { toast.error('Could not delete employee', e); }
  }

  // ── Pay salary ──────────────────────────────────────────────────
  function openPay(emp, month = curMonth) {
    const st = salaryState(emp, month);
    setPay({ empId: emp.id, month, paid: st.due > 0 ? String(st.due) : '', date: todayLocal(), method: 'Bank Transfer', account: PAID_FROM[0], remark: '' });
    setPayErrors({}); setOverpayAsk(false);
  }
  function setPayField(k, v) {
    setPay(p => {
      const next = { ...p, [k]: v };
      // Changing the month re-fills the amount with what is still due for it
      if (k === 'month' && payEmp) { const st = salaryState(payEmp, v); next.paid = st.due > 0 ? String(st.due) : ''; }
      return next;
    });
    if (k === 'paid' || k === 'month') { setOverpayAsk(false); setPayErrors(er => ({ ...er, paid: undefined })); }
    if (k === 'date') setPayErrors(er => ({ ...er, date: undefined }));
  }
  const closePay = () => { if (!saving) { setPay(null); setOverpayAsk(false); } };

  async function paySalary() {
    if (saving || !pay) return;
    const emp = emps.find(e => e.id === pay.empId);
    if (!emp) { toast.error('This employee is no longer in the list'); return; }
    const amount = +pay.paid;
    const errors = {};
    if (!(amount > 0)) errors.paid = 'Enter an amount greater than 0';
    if (!pay.date) errors.date = 'Pick the payment date';
    setPayErrors(errors);
    if (Object.keys(errors).length) return;

    // "Remaining" is per month: salary − what was already paid FOR THAT MONTH.
    const st = salaryState(emp, pay.month);
    if (st.applies && amount > st.due && !overpayAsk) { setOverpayAsk(true); return; }

    setSaving(true);
    try {
      // One request: the server records the payment and the matching ledger
      // expense together (or neither), and returns the employee with the new history.
      const updated = await employeesDB.paySalary(emp.id, {
        month: pay.month, amount, date: pay.date, method: pay.method, account: pay.account,
        remark: pay.remark || `${emp.name} Salary — ${pay.month}`,
      });
      setEmps(es => es.map(x => (x.id === emp.id ? updated : x)));
      toast.success('Salary recorded and added to Transactions');
      setPay(null); setOverpayAsk(false);
    } catch (e) {
      toast.error('Could not record the salary. Nothing was saved', e);
    }
    setSaving(false);
  }

  // ── Render ──────────────────────────────────────────────────────
  const rowMenu = emp => [
    { label: 'Pay salary', icon: Banknote, onClick: () => openPay(emp) },
    { label: 'Edit', icon: Edit2, onClick: () => openEdit(emp) },
    emp.status !== 'Left' && { label: emp.status === 'Active' ? 'Deactivate' : 'Activate', icon: Power, onClick: () => toggleStatus(emp.id) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => setDeleteId(emp.id) },
  ];
  const canPayNow = emp => isPending(emp, curMonth);
  const subtitle = loading ? 'Loading…' : loadError ? 'Could not load'
    : `${stats.active} active · ${stats.pendingCount ? `${stats.pendingCount} to pay for ${curMonth}` : `all salaries paid for ${curMonth}`}`;

  return (
    <div>
      <Header title="Employees" subtitle={subtitle}
        actions={<div style={{ display: 'flex', gap: 8 }}>
          <button className="icon-btn" onClick={() => setShowAudit(true)} aria-label="History" title="History"><History size={16} /></button>
          <button className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> Add employee</button>
        </div>}
      />

      <div className="page-body">
        <BankChangeRequests onDecided={load} />
        {loading ? <SkeletonRows rows={6} />
          : loadError ? <ErrorPanel title="Could not load employees" error={loadError} onRetry={load} />
          : emps.length === 0 ? (
            <EmptyPanel icon={Users} title="No employees yet" text="Add your team to track salaries and assign people to projects."
              action={<button className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> Add employee</button>} />
          ) : (
            <>
              <StatTiles items={[
                { label: 'Active people', value: stats.active, sub: `${emps.length} in total`, icon: Users },
                { label: 'Monthly payroll', value: fmtMoney(stats.payroll), sub: 'Active, on monthly salary', icon: Wallet },
                { label: 'Paid this month', value: fmtMoney(stats.paid), sub: curMonth, icon: CheckCircle2, tone: 'good' },
                { label: 'Pending this month', value: fmtMoney(stats.pendingAmount), icon: Clock, tone: stats.pendingCount ? 'warn' : undefined,
                  sub: pendingOnly ? 'Showing these — tap to show all' : stats.pendingCount ? `${stats.pendingCount} ${stats.pendingCount === 1 ? 'person' : 'people'} — tap to see` : 'Nobody is waiting',
                  onClick: () => setPendingOnly(p => !p) },
              ]} />

              <Toolbar search={search} onSearch={setSearch} placeholder="Search name, role or ID…"
                right={isFiltered && <><span>{filtered.length} of {emps.length}</span><button className="mac-btn mac-btn-ghost" onClick={clearFilters}>Clear</button></>}>
                <select className="mac-select" aria-label="Department" value={filters.department} onChange={e => setFilters(f => ({ ...f, department: e.target.value }))}>
                  <option value="">All departments</option>{DEPARTMENTS.map(o => <option key={o}>{o}</option>)}
                </select>
                <select className="mac-select" aria-label="Status" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
                  <option value="">Any status</option>{STATUSES.map(o => <option key={o}>{o}</option>)}
                </select>
                <select className="mac-select" aria-label="Employment type" value={filters.employmentType} onChange={e => setFilters(f => ({ ...f, employmentType: e.target.value }))}>
                  <option value="">All types</option>{EMPLOYMENT_TYPES.map(o => <option key={o}>{o}</option>)}
                </select>
                {pendingOnly && <button className="chip active" onClick={() => setPendingOnly(false)} aria-label="Remove pending salary filter">Salary pending ×</button>}
              </Toolbar>

              {filtered.length === 0 ? (
                <EmptyPanel icon={Users} title="No one matches these filters" text="Try a different search or clear the filters."
                  action={<button className="mac-btn mac-btn-secondary" onClick={clearFilters}>Clear filters</button>} />
              ) : (
                <>
                  <div className="mac-card table-wrap only-desktop">
                    <table className="data-table">
                      <thead>
                        <tr><th>Person</th><th>Department</th><th>Type</th><th>Status</th><th>Salary · {curMonth}</th><th aria-label="Actions" /></tr>
                      </thead>
                      <tbody>
                        {filtered.map(emp => (
                          <tr key={emp.id} className="clickable" tabIndex={0} onClick={() => setDetailId(emp.id)} onKeyDown={onKeyActivate(() => setDetailId(emp.id))}>
                            <td>
                              <div className="emp-person">
                                <Avatar name={emp.name} />
                                <div><div className="cell-main">{emp.name}</div><div className="cell-sub">{emp.role || '—'}</div></div>
                              </div>
                            </td>
                            <td>{emp.department || '—'}</td>
                            <td>{emp.employmentType || '—'}</td>
                            <td><Badge color={getStatusColor(emp.status)}>{emp.status}</Badge></td>
                            <td><SalaryCell st={salaryState(emp, curMonth)} /></td>
                            <td>
                              <div className="emp-row-actions" onClick={e => e.stopPropagation()}>
                                {canPayNow(emp) && <button className="mac-btn mac-btn-secondary" onClick={() => openPay(emp)}>Pay</button>}
                                <RowMenu items={rowMenu(emp)} label={`Actions for ${emp.name}`} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="list-cards only-mobile">
                    {filtered.map(emp => (
                      <div key={emp.id} className="list-card" role="button" tabIndex={0} onClick={() => setDetailId(emp.id)} onKeyDown={onKeyActivate(() => setDetailId(emp.id))}>
                        <div className="emp-card-top">
                          <div className="emp-person">
                            <Avatar name={emp.name} />
                            <div><div className="cell-main">{emp.name}</div><div className="cell-sub">{emp.role || '—'}</div></div>
                          </div>
                          <RowMenu items={rowMenu(emp)} label={`Actions for ${emp.name}`} />
                        </div>
                        <div className="emp-card-meta">
                          <Badge color={getStatusColor(emp.status)}>{emp.status}</Badge>
                          <span className="cell-sub">{[emp.department, emp.employmentType].filter(Boolean).join(' · ')}</span>
                        </div>
                        <div className="emp-card-foot">
                          <SalaryCell st={salaryState(emp, curMonth)} />
                          {canPayNow(emp) && <button className="mac-btn mac-btn-secondary" onClick={e => { e.stopPropagation(); openPay(emp); }}>Pay</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
      </div>

      <Drawer isOpen={!!detail} onClose={() => { if (!overlayOnTop) setDetailId(null); }}
        title={detail?.name} subtitle={detail && [detail.role, detail.empId].filter(Boolean).join(' · ')}
        actions={detail && <RowMenu items={rowMenu(detail).slice(1)} label="Employee actions" />}
        footer={detail && <>
          <Link className="mac-btn mac-btn-secondary" style={{ marginRight: 'auto' }} to={`/attendance?employee=${encodeURIComponent(detail.id)}`}><CalendarCheck size={15} /> View attendance</Link>
          <button className="mac-btn mac-btn-primary" onClick={() => openPay(detail)}><Banknote size={15} /> Pay salary</button>
        </>}>
        {detail && <EmployeeDetail key={detail.id} emp={detail} curMonth={curMonth} />}
      </Drawer>

      <Modal isOpen={!!form} onClose={() => { if (!saving) setForm(null); }} title={form?.id ? 'Edit employee' : 'Add employee'} size="lg"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
          <button type="submit" form="emp-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : form?.id ? 'Save changes' : 'Add employee'}</button>
        </>}>
        {form && <EmployeeForm v={form.values} set={setField} errors={formErrors} onSubmit={saveEmployee} />}
      </Modal>

      <Modal isOpen={!!payEmp} onClose={closePay} title={payEmp ? `Pay salary — ${payEmp.name}` : 'Pay salary'} size="md"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={closePay} disabled={saving}>Cancel</button>
          <button type="submit" form="pay-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : overpayAsk ? 'Record anyway' : 'Record payment'}</button>
        </>}>
        {payEmp && <PayForm emp={payEmp} v={pay} set={setPayField} errors={payErrors} overpayAsk={overpayAsk} onSubmit={paySalary} />}
      </Modal>

      <Modal isOpen={showAudit} onClose={() => setShowAudit(false)} title="Employee history" size="md">
        {auditLog.length === 0
          ? <p className="emp-note" style={{ textAlign: 'center', padding: '24px 0' }}>No changes recorded yet.</p>
          : auditLog.map(a => (
            <div key={a.id} className="emp-audit">
              <div className="emp-audit-top">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Badge color={a.action === 'Deleted' ? 'red' : a.action === 'Created' ? 'green' : 'blue'}>{a.action}</Badge>
                  <span className="cell-main">{a.description || a.name}</span>
                </span>
                <span className="faint" style={{ fontSize: 'var(--fs-xs)' }}>
                  {a.createdAt ? new Date(a.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <span className="cell-sub">By {a.by || '—'}</span>
            </div>
          ))}
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => deleteEmployee(deleteId)}
        title="Delete employee" message="This permanently deletes the employee, their salary history and their app login. Transactions already recorded are kept." />
    </div>
  );
}
