import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Badge, { getStatusColor } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { projectsDB, existingProjectsDB, employeesDB, auditDB } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { NumInput } from '../lib/numInput';
import { PROJECT_TYPES, PROJECT_STATUSES, PAYMENT_METHODS } from '../data/mockData';
import { usePeople } from '../lib/people';
import {
  useToast, Drawer, Field, FormGrid, FormSection, Toolbar, Chips, StatTiles, SkeletonRows, EmptyPanel, ErrorPanel,
  RowMenu, Avatar, fmtMoney, fmtDate, todayLocal,
} from '../components/ui/kit';
import { Plus, Edit2, Trash2, History, IndianRupee, FolderKanban, Briefcase, Wallet, Clock, Archive, X } from 'lucide-react';
import './Projects.css';

const GST_RATE = 0.18;
// Contract value of a "With GST" project is GST-inclusive; split it back out.
const gstBreakdown = val => {
  const v = +val || 0;
  const taxable = Math.round(v / (1 + GST_RATE));
  return { taxable, gst: v - taxable };
};

const paidOf = p => (p.payments || []).reduce((s, x) => s + (+x.amount || 0), 0);
const moneyOf = p => {
  const value = +p.valuation || 0;
  const paid = paidOf(p);
  return { value, paid, balance: Math.max(0, value - paid), pct: value ? Math.round((paid / value) * 100) : 0, fullyPaid: value > 0 && paid >= value };
};
const isOverdue = p => !!p.dueDate && p.dueDate < todayLocal() && p.status !== 'Completed' && p.status !== 'Cancelled';

// Payments live in a JSON list on the project. New ones get a stable `key`;
// entries saved before that existed are addressed by their position.
// every payment has a server id
const payIdOf = (p, i) => p.id || p.key || `idx:${i}`;

const blankProject = () => ({
  projectName: '', clientName: '', companyName: '', projectType: PROJECT_TYPES[0], handledBy: '', startDate: todayLocal(), dueDate: '',
  status: 'Pending', valuation: '', billingType: 'Without GST', milestones: [], payments: [], nextPaymentDue: '', assignedEmployees: [],
});
const blankPayment = () => ({ id: null, amount: '', date: `${todayLocal()}T10:00`, method: 'Bank Transfer', account: 'Company Bank', remark: '' });

const onKeyActivate = fn => e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); fn(); }
};

function PayProgress({ m }) {
  return (
    <div className="proj-pay">
      <div className={`proj-bar ${m.fullyPaid ? 'full' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(m.pct, 100)} aria-label="Payment received">
        <span style={{ width: `${Math.min(m.pct, 100)}%` }} />
      </div>
      <div className="proj-pay-text"><strong>{fmtMoney(m.paid)}</strong> of {fmtMoney(m.value)}</div>
    </div>
  );
}

function StatusBadges({ p, m }) {
  return (
    <div className="proj-badges">
      <Badge color={getStatusColor(p.status)}>{p.status}</Badge>
      {m.fullyPaid && <Badge color="green">Fully paid</Badge>}
      {isOverdue(p) && <Badge color="red">Overdue</Badge>}
    </div>
  );
}

function Team({ people = [], max = 3 }) {
  if (!people.length) return <span className="faint">—</span>;
  return (
    <div className="proj-team">
      {people.slice(0, max).map(e => <Avatar key={e.id} name={e.name} size={26} />)}
      {people.length > max && <span className="proj-team-more">+{people.length - max}</span>}
    </div>
  );
}

function ProjectForm({ v, set, errors, employees, partners, onSubmit }) {
  const [ms, setMs] = useState({ label: '', percent: '' });
  const team = v.assignedEmployees || [];
  const milestones = v.milestones || [];
  const withGst = v.billingType === 'With GST';
  const gst = gstBreakdown(v.valuation);

  function addMilestone() {
    if (!ms.label.trim() || !(+ms.percent > 0)) return;
    set('milestones', [...milestones, { label: ms.label.trim(), percent: +ms.percent }]);
    setMs({ label: '', percent: '' });
  }
  function toggleEmployee(emp) {
    set('assignedEmployees', team.some(e => e.id === emp.id) ? team.filter(e => e.id !== emp.id) : [...team, { id: emp.id, name: emp.name }]);
  }

  return (
    <form id="proj-form" onSubmit={e => { e.preventDefault(); onSubmit(); }} noValidate>
      <FormSection title="Project">
        <FormGrid>
          <Field label="Project name" required error={errors.projectName}>
            <input className="mac-input" value={v.projectName} onChange={e => set('projectName', e.target.value)} placeholder="Project title" autoFocus />
          </Field>
          <Field label="Client name">
            <input className="mac-input" value={v.clientName || ''} onChange={e => set('clientName', e.target.value)} placeholder="Client name" />
          </Field>
          <Field label="Company">
            <input className="mac-input" value={v.companyName || ''} onChange={e => set('companyName', e.target.value)} placeholder="Company" />
          </Field>
          <Field label="Project type">
            <select className="mac-select" value={v.projectType} onChange={e => set('projectType', e.target.value)}>{PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}</select>
          </Field>
          <Field label="Status">
            <select className="mac-select" value={v.status} onChange={e => set('status', e.target.value)}>{PROJECT_STATUSES.map(x => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field label="Handled by">
            <select className="mac-select" value={v.handledBy || ''} onChange={e => set('handledBy', e.target.value)}>
              <option value="">Select partner</option>{(v.handledBy && !partners.includes(v.handledBy) ? [v.handledBy, ...partners] : partners).map(p => <option key={p}>{p}</option>)}
            </select>
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Money and dates">
        <FormGrid>
          <Field label="Billing type">
            <select className="mac-select" value={v.billingType} onChange={e => set('billingType', e.target.value)}>
              <option value="Without GST">Without GST</option>
              <option value="With GST">With GST (18%)</option>
            </select>
          </Field>
          <Field label={withGst ? 'Contract value (₹, including GST)' : 'Contract value (₹)'} error={errors.valuation}
            hint={withGst && +v.valuation > 0 ? `${fmtMoney(gst.taxable)} before GST + ${fmtMoney(gst.gst)} GST` : undefined}>
            <NumInput className="mac-input" value={v.valuation ?? ''} onChange={val => set('valuation', val)} placeholder="0" />
          </Field>
          <Field label="Start date">
            <input className="mac-input" type="date" value={v.startDate || ''} onChange={e => set('startDate', e.target.value)} />
          </Field>
          <Field label="Due date" error={errors.dueDate}>
            <input className="mac-input" type="date" value={v.dueDate || ''} onChange={e => set('dueDate', e.target.value)} />
          </Field>
          <Field label="Next payment due">
            <input className="mac-input" type="date" value={v.nextPaymentDue || ''} onChange={e => set('nextPaymentDue', e.target.value)} />
          </Field>
        </FormGrid>
      </FormSection>

      {employees.length > 0 && (
        <FormSection title={`Team${team.length ? ` (${team.length} selected)` : ' (optional)'}`}>
          <div className="proj-team-pick">
            {employees.map(emp => {
              const on = team.some(e => e.id === emp.id);
              return (
                <button key={emp.id} type="button" className={`chip ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => toggleEmployee(emp)}>
                  {emp.name}{emp.role ? ` · ${emp.role}` : ''}
                </button>
              );
            })}
          </div>
        </FormSection>
      )}

      <FormSection title="Payment milestones (optional)">
        {/* Enter here adds the milestone instead of submitting the whole form */}
        <div className="proj-ms-add" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMilestone(); } }}>
          <input className="mac-input" aria-label="Milestone name" value={ms.label} onChange={e => setMs(m => ({ ...m, label: e.target.value }))} placeholder="e.g. 30% advance" />
          <NumInput className="mac-input" value={ms.percent} onChange={val => setMs(m => ({ ...m, percent: val }))} placeholder="%" />
          <button type="button" className="mac-btn mac-btn-secondary" onClick={addMilestone}>Add</button>
        </div>
        {milestones.length > 0 && (
          <div className="proj-list">
            {milestones.map((m, i) => (
              <div key={`${m.label}-${i}`} className="proj-ms-row">
                <span>{m.label} <span className="muted">· {m.percent}%{+v.valuation > 0 ? ` · ${fmtMoney(Math.round((m.percent / 100) * +v.valuation))}` : ''}</span></span>
                <button type="button" className="icon-btn plain" aria-label={`Remove milestone ${m.label}`} onClick={() => set('milestones', milestones.filter((_, idx) => idx !== i))}><X size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </form>
  );
}

function PaymentInlineForm({ v, set, error, saving, onSubmit, onCancel }) {
  return (
    <form className="proj-inline-form" onSubmit={e => { e.preventDefault(); onSubmit(); }} noValidate>
      <FormGrid>
        <Field label="Amount (₹)" required error={error}>
          <NumInput className="mac-input" value={v.amount} onChange={val => set('amount', val)} placeholder="0" />
        </Field>
        <Field label="Date and time">
          <input className="mac-input" type="datetime-local" value={v.date || ''} onChange={e => set('date', e.target.value)} />
        </Field>
        <Field label="Method">
          <select className="mac-select" value={v.method} onChange={e => set('method', e.target.value)}>{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}</select>
        </Field>
        <Field label="Money arrived in" hint="Also records this as client income in Transactions">
          <select className="mac-select" value={v.account || 'Company Bank'} onChange={e => set('account', e.target.value)}>
            <option value="Company Bank">Company Bank</option>
            <option value="Cash + Savings Account">Cash + Savings</option>
          </select>
        </Field>
        <Field label="Remark">
          <input className="mac-input" value={v.remark} onChange={e => set('remark', e.target.value)} placeholder="Optional" />
        </Field>
      </FormGrid>
      <div className="proj-inline-actions">
        <button type="button" className="mac-btn mac-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : v.id == null ? 'Add payment' : 'Save payment'}</button>
      </div>
    </form>
  );
}

function ProjectDetail({ proj, startAddPayment, moving, onSavePayment, onAskDeletePayment, onToggleMilestone, onAskMove }) {
  const [pf, setPf] = useState(startAddPayment ? blankPayment() : null); // payment form (new or edit)
  const [pfError, setPfError] = useState('');
  const [pfSaving, setPfSaving] = useState(false);
  const [pfOver, setPfOver] = useState(false);          // the over-the-project-value warning was shown
  const m = moneyOf(proj);
  const withGst = proj.billingType === 'With GST';
  const gst = gstBreakdown(proj.valuation);
  const team = proj.assignedEmployees || [];
  const milestones = proj.milestones || [];
  // Newest first for reading; each row keeps the id of its stored position
  const payments = useMemo(
    () => (proj.payments || []).map((p, i) => ({ p, id: payIdOf(p, i) }))
      .sort((a, b) => String(b.p.date || '').localeCompare(String(a.p.date || ''))),
    [proj.payments],
  );

  const setPfField = (k, val) => { setPf(f => ({ ...f, [k]: val })); if (k === 'amount') { setPfError(''); setPfOver(false); } };
  const closePf = () => { setPf(null); setPfError(''); setPfOver(false); };
  async function submitPayment() {
    if (pfSaving) return;
    if (!(+pf.amount > 0)) { setPfError('Enter an amount greater than 0'); return; }
    // More than the project is worth is allowed (extra work, a rounded-up payment), but asked about once.
    const value = +proj.valuation || 0;
    const total = (proj.payments || []).reduce((s, x, i) => s + (payIdOf(x, i) === pf.id ? 0 : +x.amount || 0), 0) + +pf.amount;
    if (value > 0 && total > value + 0.005 && !pfOver) {
      setPfOver(true);
      setPfError(`This takes the total received to ${fmtMoney(total)}, which is ${fmtMoney(total - value)} more than the project value (${fmtMoney(value)}). Press save again to record it anyway.`);
      return;
    }
    setPfSaving(true);
    const ok = await onSavePayment(proj.id, pf.id, { amount: +pf.amount, date: pf.date, method: pf.method, account: pf.account || 'Company Bank', remark: pf.remark });
    setPfSaving(false);
    if (ok) closePf();
  }

  return (
    <>
      <StatusBadges p={proj} m={m} />

      {m.fullyPaid && (
        <div className="proj-notice">
          <span>This project is fully paid. When the work is done you can move it to Past Projects.</span>
          <button className="mac-btn mac-btn-secondary" onClick={() => onAskMove(proj.id)} disabled={moving}><Archive size={14} /> {moving ? 'Moving…' : 'Move to Past Projects'}</button>
        </div>
      )}

      <section className="form-section">
        <h3 className="section-title">Money</h3>
        <PayProgress m={m} />
        <dl className="kv">
          <dt>Contract value{withGst ? ' (incl. GST)' : ''}</dt><dd>{fmtMoney(m.value)}</dd>
          {withGst && m.value > 0 && <><dt>Value before GST</dt><dd>{fmtMoney(gst.taxable)}</dd><dt>GST amount (18%)</dt><dd>{fmtMoney(gst.gst)}</dd></>}
          <dt>Received</dt><dd className="amount-in">{fmtMoney(m.paid)}{m.value > 0 ? ` (${m.pct}%)` : ''}</dd>
          <dt>Balance to collect</dt><dd>{fmtMoney(m.balance)}</dd>
        </dl>
      </section>

      <section className="form-section">
        <h3 className="section-title">Overview</h3>
        <dl className="kv">
          <dt>Client</dt><dd>{proj.clientName || '—'}</dd>
          <dt>Company</dt><dd>{proj.companyName || '—'}</dd>
          <dt>Project type</dt><dd>{proj.projectType || '—'}</dd>
          <dt>Handled by</dt><dd>{proj.handledBy || '—'}</dd>
          <dt>Billing type</dt><dd>{proj.billingType}</dd>
          <dt>Start date</dt><dd>{fmtDate(proj.startDate)}</dd>
          <dt>Due date</dt><dd className={isOverdue(proj) ? 'proj-overdue' : undefined}>{fmtDate(proj.dueDate)}{isOverdue(proj) ? ' · overdue' : ''}</dd>
          <dt>Next payment due</dt><dd>{fmtDate(proj.nextPaymentDue)}</dd>
          <dt>Team</dt>
          <dd>
            {team.length === 0 ? '—' : (
              <span className="proj-team-list">{team.map(e => <span key={e.id}><Avatar name={e.name} size={22} />{e.name}</span>)}</span>
            )}
          </dd>
        </dl>
      </section>

      <section className="form-section">
        <div className="proj-section-head">
          <h3 className="section-title">Payments ({payments.length})</h3>
          {!pf && <button className="mac-btn mac-btn-secondary" onClick={() => setPf(blankPayment())}><Plus size={14} /> Add payment</button>}
        </div>
        {pf && pf.id == null && <PaymentInlineForm v={pf} set={setPfField} error={pfError} saving={pfSaving} onSubmit={submitPayment} onCancel={closePf} />}
        {payments.length === 0 && !pf && <p className="proj-note">No payments recorded yet.</p>}
        {payments.length > 0 && (
          <div className="proj-list">
            {payments.map(({ p, id }) => (pf && pf.id === id
              ? <PaymentInlineForm key={id} v={pf} set={setPfField} error={pfError} saving={pfSaving} onSubmit={submitPayment} onCancel={closePf} />
              : (
                <div key={id} className="proj-pay-row">
                  <div>
                    <div className="cell-main">{p.remark || p.note || 'Payment'}</div>
                    <div className="cell-sub">{fmtDate(p.date)}{p.method ? ` · ${p.method}` : ''}</div>
                  </div>
                  <span className="amount-in">+{fmtMoney(p.amount)}</span>
                  <RowMenu label="Payment actions" items={[
                    { label: 'Edit', icon: Edit2, onClick: () => { setPf({ id, amount: String(p.amount ?? ''), date: p.date || '', method: p.method || 'Bank Transfer', account: p.account || 'Company Bank', remark: p.remark ?? p.note ?? '' }); setPfError(''); } },
                    { label: 'Delete', icon: Trash2, danger: true, onClick: () => onAskDeletePayment(proj.id, id, p) },
                  ]} />
                </div>
              )))}
          </div>
        )}
      </section>

      {milestones.length > 0 && (
        <section className="form-section">
          <h3 className="section-title">Milestones ({milestones.filter(x => x.done).length} of {milestones.length} done)</h3>
          <div className="proj-list">
            {milestones.map((ms, i) => (
              <label key={`${ms.label}-${i}`} className={`proj-ms ${ms.done ? 'done' : ''}`}>
                <input type="checkbox" checked={!!ms.done} onChange={() => onToggleMilestone(proj.id, i)} />
                <span>{ms.label}</span>
                <span className="muted">{ms.percent}% · {fmtMoney(Math.round((ms.percent / 100) * m.value))}</span>
              </label>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export default function Projects() {
  const { user, displayName } = useAuth();
  const toast = useToast();
  const currentUser = displayName || user?.email || 'Unknown';
  // "Handled by" is a display name; the choices are the partners in the people directory
  const { people: directory } = usePeople();
  const partners = useMemo(() => directory.filter(p => p.kind === 'partner' && p.active !== false).map(p => p.name), [directory]);

  const [projs, setProjs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [dueOnly, setDueOnly] = useState(false);

  const [detail, setDetail] = useState(null);     // { id, addPayment }
  const [form, setForm] = useState(null);         // { id: null | project id, values }
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);   // { title, message, confirmLabel, danger, run }
  const [movingId, setMovingId] = useState(null);
  const [showAudit, setShowAudit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      // Team list and history are secondary: the page still works without them.
      const [ps, emps, auditData] = await Promise.all([
        projectsDB.getAll(),
        employeesDB.getAll().catch(e => { console.error(e); return []; }),
        auditDB.getAll('project').catch(e => { console.error(e); return []; }),
      ]);
      setProjs(ps);
      setEmployees(emps.filter(e => e.status === 'Active'));
      setAuditLog(auditData);
    } catch (e) { console.error(e); setLoadError(e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function logAudit(entityId, action, description) {
    try {
      await auditDB.log({ entity: 'project', entityId, action, description });   // the server stamps who did it
      setAuditLog(l => [{ id: Date.now(), entity: 'project', entityId, action, description, by: currentUser, createdAt: new Date().toISOString() }, ...l]);
    } catch (e) { console.error(e); }
  }

  // ── Derived numbers (same fields and formulas as before) ────────
  const stats = useMemo(() => {
    const totalVal = projs.reduce((s, p) => s + (+p.valuation || 0), 0);
    const totalRec = projs.reduce((s, p) => s + paidOf(p), 0);
    const gstOnPending = projs.filter(p => p.billingType === 'With GST')
      .reduce((s, p) => s + Math.round(Math.max(0, +p.valuation - paidOf(p)) * 18 / 118), 0);
    const toCollect = totalVal - totalRec;
    return {
      active: projs.filter(p => p.status === 'In Progress').length,
      totalVal, totalRec, toCollect, gstOnPending,
      netOfGst: Math.max(0, toCollect - gstOnPending),
      owing: projs.filter(p => moneyOf(p).balance > 0).length,
    };
  }, [projs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = projs.filter(p =>
      (!q || p.projectName?.toLowerCase().includes(q) || p.clientName?.toLowerCase().includes(q) || p.companyName?.toLowerCase().includes(q))
      && (!status || p.status === status)
      && (!type || p.projectType === type)
      && (!dueOnly || moneyOf(p).balance > 0));
    return dueOnly ? [...list].sort((a, b) => moneyOf(b).balance - moneyOf(a).balance) : list;
  }, [projs, search, status, type, dueOnly]);

  const statusChips = useMemo(() => [
    { value: '', label: 'All', count: projs.length },
    ...PROJECT_STATUSES.map(s => ({ value: s, label: s, count: projs.filter(p => p.status === s).length })),
  ], [projs]);

  const isFiltered = !!(search || status || type || dueOnly);
  const clearFilters = () => { setSearch(''); setStatus(''); setType(''); setDueOnly(false); };
  const detailProj = detail ? projs.find(p => p.id === detail.id) || null : null;
  const overlayOnTop = !!(form || confirm);

  // ── Create / edit ───────────────────────────────────────────────
  const openAdd = () => { setForm({ id: null, values: blankProject() }); setFormErrors({}); };
  const openEdit = p => { setForm({ id: p.id, values: { ...p } }); setFormErrors({}); };
  const setField = (k, v) => {
    setForm(f => ({ ...f, values: { ...f.values, [k]: v } }));
    setFormErrors(er => (er[k] ? { ...er, [k]: undefined } : er));
  };

  async function saveProject() {
    if (saving || !form) return;
    const v = form.values;
    const errors = {};
    if (!v.projectName?.trim()) errors.projectName = 'Enter a project name';
    if (v.valuation !== '' && v.valuation != null && !(+v.valuation >= 0)) errors.valuation = 'Enter a number';
    if (v.startDate && v.dueDate && v.dueDate < v.startDate) errors.dueDate = 'Due date is before the start date';
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      const base = { ...v, projectName: v.projectName.trim(), valuation: +v.valuation };
      if (form.id) {
        // Payments are not part of a project save (they have their own endpoints).
        // The version is the one the page holds now, so a payment recorded while
        // the form was open does not make this save look out of date.
        const current = projs.find(p => p.id === form.id);
        const updated = await projectsDB.update(form.id, { ...base, version: current?.version ?? base.version });
        setProjs(ps => ps.map(p => (p.id === form.id ? updated : p)));
        await logAudit(form.id, 'Edited', updated.projectName);
        toast.success('Project updated');
      } else {
        const created = await projectsDB.create({ ...base, milestones: v.milestones || [] });
        setProjs(ps => [created, ...ps]);
        await logAudit(created.id, 'Created', created.projectName);
        toast.success('Project created');
      }
      setForm(null);
    } catch (e) {
      toast.error(form.id ? 'Could not save changes' : 'Could not create project', e);
    }
    setSaving(false);
  }

  async function deleteProject(id) {
    const p = projs.find(x => x.id === id);
    if (!p) return;
    try {
      await projectsDB.delete(id);
      setProjs(ps => ps.filter(x => x.id !== id));
      setDetail(d => (d?.id === id ? null : d));
      await logAudit(id, 'Deleted', p.projectName);
      toast.success(`“${p.projectName}” deleted`);
    } catch (e) { toast.error('Could not delete project', e); }
  }

  // ── Payments ────────────────────────────────────────────────────
  // id === null adds a payment; otherwise it is the payment's key (or "idx:N"
  // for entries saved before keys existed). Returns true when saved.
  async function savePayment(projId, id, data) {
    const proj = projs.find(p => p.id === projId);
    if (!proj) { toast.error('This project is no longer in the list'); return false; }
    try {
      const updated = id == null ? await projectsDB.addPayment(projId, data) : await projectsDB.updatePayment(projId, id, data);
      setProjs(ps => ps.map(p => (p.id === projId ? updated : p)));
      const nowFull = moneyOf(updated).fullyPaid && !moneyOf(proj).fullyPaid;
      toast.success(nowFull ? 'Payment saved — this project is now fully paid' : id == null ? 'Payment added' : 'Payment updated');
      return true;
    } catch (e) { toast.error('Could not save the payment', e); return false; }
  }

  async function deletePayment(projId, id) {
    const proj = projs.find(p => p.id === projId);
    if (!proj) return;
    try {
      const updated = await projectsDB.deletePayment(projId, id);
      setProjs(ps => ps.map(p => (p.id === projId ? updated : p)));
      toast.success('Payment deleted');
    } catch (e) { toast.error('Could not delete the payment', e); }
  }

  async function toggleMilestone(projId, idx) {
    const proj = projs.find(p => p.id === projId);
    if (!proj) return;
    const milestones = (proj.milestones || []).map((m, i) => (i === idx ? { ...m, done: !m.done } : m));
    setProjs(ps => ps.map(p => (p.id === projId ? { ...p, milestones } : p)));
    try {
      const updated = await projectsDB.update(projId, { ...proj, milestones });
      setProjs(ps => ps.map(p => (p.id === projId ? updated : p)));
    } catch (e) {
      setProjs(ps => ps.map(p => (p.id === projId ? { ...p, milestones: proj.milestones } : p)));
      toast.error('Could not update the milestone', e);
    }
  }

  // ── Move a fully-paid project to Past Projects (only when asked) ─
  async function moveToPast(id) {
    const proj = projs.find(p => p.id === id);
    if (!proj || movingId) return;
    const m = moneyOf(proj);
    if (!m.fullyPaid) { toast.error('Only a fully paid project can be moved to Past Projects'); return; }
    const count = (proj.payments || []).length;
    setMovingId(id);
    try {
      await existingProjectsDB.create({
        projectName: proj.projectName,
        clientName: proj.clientName,
        companyName: proj.companyName,
        projectType: proj.projectType,
        finalValue: proj.valuation,
        billingType: proj.billingType,
        status: 'Delivered',
        notes: `Moved from Projects on ${fmtDate(todayLocal())} after full payment (${fmtMoney(m.paid)} of ${fmtMoney(m.value)} received across ${count} payment${count === 1 ? '' : 's'}). Handled by: ${proj.handledBy || '—'}.`,
      });
    } catch (e) {
      toast.error('Could not move to Past Projects. Nothing was changed', e);
      setMovingId(null);
      return;
    }
    try {
      await projectsDB.delete(id);
    } catch (e) {
      toast.error(`“${proj.projectName}” was copied to Past Projects, but could not be removed from Projects. It now exists in both — delete it here, and do not move it again`, e);
      setMovingId(null);
      return;
    }
    setProjs(ps => ps.filter(p => p.id !== id));
    setDetail(d => (d?.id === id ? null : d));
    await logAudit(id, 'Completed', `${proj.projectName} — fully paid, moved to Past Projects`);
    toast.success(`“${proj.projectName}” moved to Past Projects`);
    setMovingId(null);
  }

  // ── Confirmations ───────────────────────────────────────────────
  const askDelete = p => setConfirm({
    title: 'Delete project', confirmLabel: 'Delete', danger: true,
    message: `This permanently deletes “${p.projectName}” with its payments and milestones.`,
    run: () => deleteProject(p.id),
  });
  const askDeletePayment = (projId, id, pay) => setConfirm({
    title: 'Delete payment', confirmLabel: 'Delete', danger: true,
    message: `Delete the ${fmtMoney(pay.amount)} payment dated ${fmtDate(pay.date)}? This cannot be undone.`,
    run: () => deletePayment(projId, id),
  });
  const askMove = id => {
    const p = projs.find(x => x.id === id);
    if (!p) return;
    setConfirm({
      title: 'Move to Past Projects', confirmLabel: 'Move project', danger: false,
      message: `“${p.projectName}” will be added to Past Projects and removed from this list. Only the project details and final value are copied — its individual payments and milestones are NOT carried over and will be deleted. A one-line summary of the payments is saved in the notes.`,
      run: () => moveToPast(id),
    });
  };

  // ── Render ──────────────────────────────────────────────────────
  const rowMenu = p => [
    { label: 'Add payment', icon: IndianRupee, onClick: () => setDetail({ id: p.id, addPayment: true }) },
    { label: 'Edit', icon: Edit2, onClick: () => openEdit(p) },
    moneyOf(p).fullyPaid && { label: 'Move to Past Projects', icon: Archive, onClick: () => askMove(p.id) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => askDelete(p) },
  ];
  const open = p => setDetail({ id: p.id, addPayment: false });
  const subtitle = loading ? 'Loading…' : loadError ? 'Could not load'
    : `${projs.length} project${projs.length === 1 ? '' : 's'} · ${stats.active} in progress · ${fmtMoney(stats.toCollect)} to collect`;

  return (
    <div>
      <Header title="Projects" subtitle={subtitle}
        actions={<div style={{ display: 'flex', gap: 8 }}>
          <button className="icon-btn" onClick={() => setShowAudit(true)} aria-label="History" title="History"><History size={16} /></button>
          <button className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> New project</button>
        </div>}
      />

      <div className="page-body">
        {loading ? <SkeletonRows rows={6} />
          : loadError ? <ErrorPanel title="Could not load projects" error={loadError} onRetry={load} />
          : projs.length === 0 ? (
            <EmptyPanel icon={FolderKanban} title="No projects yet" text="Create a project to track its team, due date and payments."
              action={<button className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> New project</button>} />
          ) : (
            <>
              <StatTiles items={[
                { label: 'Active projects', value: stats.active, sub: `${projs.length} in total`, icon: Briefcase },
                { label: 'Total contract value', value: fmtMoney(stats.totalVal), sub: 'All projects in this list', icon: Wallet },
                { label: 'Received', value: fmtMoney(stats.totalRec), icon: IndianRupee, tone: 'good',
                  sub: stats.totalVal > 0 ? `${Math.round((stats.totalRec / stats.totalVal) * 100)}% of contract value` : undefined },
                { label: 'To collect', value: fmtMoney(stats.toCollect), icon: Clock, tone: stats.toCollect > 0 ? 'warn' : undefined,
                  sub: dueOnly ? 'Showing these — tap to show all'
                    : stats.gstOnPending > 0 ? `Includes ${fmtMoney(stats.gstOnPending)} GST · ${fmtMoney(stats.netOfGst)} after GST`
                    : `${stats.owing} project${stats.owing === 1 ? '' : 's'} — tap to see`,
                  onClick: () => setDueOnly(d => !d) },
              ]} />

              <Toolbar search={search} onSearch={setSearch} placeholder="Search project or client…"
                right={isFiltered && <><span>{filtered.length} of {projs.length}</span><button className="mac-btn mac-btn-ghost" onClick={clearFilters}>Clear</button></>}>
                <select className="mac-select" aria-label="Project type" value={type} onChange={e => setType(e.target.value)}>
                  <option value="">All types</option>{PROJECT_TYPES.map(o => <option key={o}>{o}</option>)}
                </select>
                {dueOnly && <button className="chip active" onClick={() => setDueOnly(false)} aria-label="Remove outstanding filter">Outstanding, highest first ×</button>}
              </Toolbar>
              <Chips label="Status" options={statusChips} value={status} onChange={setStatus} />

              {filtered.length === 0 ? (
                <EmptyPanel icon={FolderKanban} title="No projects match these filters" text="Try a different search or clear the filters."
                  action={<button className="mac-btn mac-btn-secondary" onClick={clearFilters}>Clear filters</button>} />
              ) : (
                <>
                  <div className="mac-card table-wrap only-desktop">
                    <table className="data-table">
                      <thead><tr><th>Project</th><th>Status</th><th>Team</th><th>Due</th><th>Payment</th><th aria-label="Actions" /></tr></thead>
                      <tbody>
                        {filtered.map(p => {
                          const m = moneyOf(p);
                          return (
                            <tr key={p.id} className="clickable" tabIndex={0} onClick={() => open(p)} onKeyDown={onKeyActivate(() => open(p))}>
                              <td>
                                <div className="cell-main">{p.projectName}</div>
                                <div className="cell-sub">{[p.clientName, p.projectType].filter(Boolean).join(' · ') || '—'}</div>
                              </td>
                              <td><StatusBadges p={p} m={m} /></td>
                              <td><Team people={p.assignedEmployees} /></td>
                              <td className={isOverdue(p) ? 'proj-overdue' : undefined} style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.dueDate)}</td>
                              <td><PayProgress m={m} /></td>
                              <td><div className="proj-row-actions"><RowMenu items={rowMenu(p)} label={`Actions for ${p.projectName}`} /></div></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="list-cards only-mobile">
                    {filtered.map(p => {
                      const m = moneyOf(p);
                      return (
                        <div key={p.id} className="list-card" role="button" tabIndex={0} onClick={() => open(p)} onKeyDown={onKeyActivate(() => open(p))}>
                          <div className="proj-card-top">
                            <div>
                              <div className="cell-main">{p.projectName}</div>
                              <div className="cell-sub">{[p.clientName, p.projectType].filter(Boolean).join(' · ') || '—'}</div>
                            </div>
                            <RowMenu items={rowMenu(p)} label={`Actions for ${p.projectName}`} />
                          </div>
                          <StatusBadges p={p} m={m} />
                          <PayProgress m={m} />
                          <div className="proj-card-foot">
                            <span className={isOverdue(p) ? 'proj-overdue' : undefined}>Due {fmtDate(p.dueDate)}</span>
                            <Team people={p.assignedEmployees} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
      </div>

      <Drawer isOpen={!!detailProj} onClose={() => { if (!overlayOnTop) setDetail(null); }}
        title={detailProj?.projectName} subtitle={detailProj && ([detailProj.clientName, detailProj.companyName].filter(Boolean).join(' · ') || 'No client set')}
        actions={detailProj && <RowMenu items={rowMenu(detailProj).slice(1)} label="Project actions" />}>
        {detailProj && (
          <ProjectDetail key={detailProj.id} proj={detailProj} startAddPayment={detail.addPayment} moving={movingId === detailProj.id}
            onSavePayment={savePayment} onAskDeletePayment={askDeletePayment} onToggleMilestone={toggleMilestone} onAskMove={askMove} />
        )}
      </Drawer>

      <Modal isOpen={!!form} onClose={() => { if (!saving) setForm(null); }} title={form?.id ? 'Edit project' : 'New project'} size="lg"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
          <button type="submit" form="proj-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : form?.id ? 'Save changes' : 'Create project'}</button>
        </>}>
        {form && <ProjectForm v={form.values} set={setField} errors={formErrors} employees={employees} partners={partners} onSubmit={saveProject} />}
      </Modal>

      <Modal isOpen={showAudit} onClose={() => setShowAudit(false)} title="Project history" size="md">
        {auditLog.length === 0
          ? <p className="proj-note" style={{ textAlign: 'center', padding: '24px 0' }}>No changes recorded yet.</p>
          : auditLog.map(a => (
            <div key={a.id} className="proj-audit">
              <div className="proj-audit-top">
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

      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm?.run()}
        title={confirm?.title} message={confirm?.message} confirmLabel={confirm?.confirmLabel} danger={confirm?.danger} />
    </div>
  );
}
