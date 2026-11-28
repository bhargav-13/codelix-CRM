import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { employeesDB } from '../lib/db';
import {
  useToast, Field, FormGrid, Toolbar, Chips, StatTiles, SkeletonRows, EmptyPanel, ErrorPanel, Avatar, fmtDate,
} from '../components/ui/kit';
import { leaveAPI, wfhAPI, officeWfhAPI, policyAPI, holidaysAPI, leaveMeta, countLeaveDays, fmtDays, fmtNum, todayIST } from '../lib/hr';
import { Notice, TabBar } from '../components/hr/parts';
import { CalendarCheck, CalendarDays, Check, CheckCircle2, Home, Hourglass, Info, Plane, Plus, Trash2, Users, Wallet, X } from 'lucide-react';
import './HR.css';

const fmtRange = r => (r.fromDate === r.toDate ? fmtDate(r.fromDate) : `${fmtDate(r.fromDate)} – ${fmtDate(r.toDate)}`);
const fmtWhen = ts => (ts ? new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const byNewest = (a, b) => String(b.createdAt || b.fromDate || '').localeCompare(String(a.createdAt || a.fromDate || ''));
// Leave and work from home are asked for, approved and listed together. A work-from-home request
// comes from its own API; `kind` says which one a row is, and `key` keeps the two apart in lists.
const WFH = 'wfh';
const isWfh = r => r.kind === WFH;
const asLeave = r => ({ ...r, kind: 'leave', key: `leave-${r.id}` });
const asWfh = r => ({ ...r, kind: WFH, key: `wfh-${r.id}`, halfDay: false });
const KINDS = [['leave', 'Leave', Plane], [WFH, 'Work from home', Home]];
const StatusBadge = ({ status }) => { const m = leaveMeta(status); return <Badge color={m.color}>{m.label}</Badge>; };

// Paid / unpaid split: what the server decided, or — while pending — what it
// would be if approved today (paid up to what is left of the entitlement).
function split(req, balance) {
  const paid = +req.paidDays || 0, unpaid = +req.unpaidDays || 0;
  if (req.status !== 'PENDING' || paid + unpaid > 0) return { paid, unpaid, preview: false, known: true };
  if (!balance) return { paid: 0, unpaid: 0, preview: true, known: false };
  const left = Math.max(0, (+balance.entitled || 0) - (+balance.used || 0));
  const p = Math.min(+req.days || 0, left);
  return { paid: p, unpaid: Math.max(0, (+req.days || 0) - p), preview: true, known: true };
}
function SplitText({ req, balance }) {
  const s = split(req, balance);
  if (!s.known) return null;
  if (req.status === 'REJECTED' || req.status === 'CANCELLED') return null;
  const text = s.unpaid > 0 ? (s.paid > 0 ? `${fmtNum(s.paid)} paid · ${fmtNum(s.unpaid)} unpaid` : 'Unpaid') : 'Paid';
  return <span style={s.unpaid > 0 ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>{s.preview ? `If approved: ${text.toLowerCase()}` : text}</span>;
}

function RequestCard({ req, who, balance, children }) {
  return (
    <div className="hr-req">
      <div className="hr-req-top">
        {who
          ? <div className="hr-person"><Avatar name={req.employeeName} /><div><div className="cell-main">{req.employeeName}</div><div className="cell-sub">{fmtRange(req)}{req.halfDay ? ' · half day' : ''}</div></div></div>
          : <div className="hr-req-dates">{fmtRange(req)}{req.halfDay ? ' · half day' : ''}</div>}
        <span className="hr-req-tags">{isWfh(req) ? <Badge color="purple" icon={Home}>Work from home</Badge> : <Badge color="blue" icon={Plane}>Leave</Badge>}<StatusBadge status={req.status} /></span>
      </div>
      {req.reason && <div className="hr-req-reason">{req.reason}</div>}
      <div className="hr-req-meta">
        <span>{fmtDays(req.days)}</span>
        {isWfh(req) ? (req.status === 'REJECTED' || req.status === 'CANCELLED' ? null : <span>Not taken from the leave balance</span>) : <SplitText req={req} balance={balance} />}
        {req.createdAt && <span className="faint">Asked {fmtWhen(req.createdAt)}</span>}
      </div>
      {(req.decidedBy || req.decisionNote) && req.status !== 'PENDING' && (
        <div className="hr-note">
          {req.status === 'APPROVED' ? 'Approved' : req.status === 'REJECTED' ? 'Rejected' : 'Updated'}{req.decidedBy ? ` by ${req.decidedBy}` : ''}{req.decidedAt ? ` · ${fmtWhen(req.decidedAt)}` : ''}
          {req.decisionNote ? ` — “${req.decisionNote}”` : ''}
        </div>
      )}
      {children && <div className="hr-req-foot">{children}</div>}
    </div>
  );
}

// Days the whole office works from home, set by a partner. Past ones are left out.
function OfficeWfhDays({ days, onRemove }) {
  const today = todayIST();
  const live = days.filter(d => d.toDate >= today).sort((a, b) => String(a.fromDate).localeCompare(String(b.fromDate)));
  if (!live.length) return null;
  return (
    <div className="office-wfh" role="list" aria-label="Work from home for everyone">
      {live.map(d => (
        <div key={d.id} className="office-wfh-row" role="listitem">
          <span className="office-wfh-icon"><Users size={18} aria-hidden="true" /></span>
          <div className="office-wfh-text">
            <strong>Everyone works from home {d.fromDate === d.toDate ? `on ${fmtDate(d.fromDate)}` : `from ${fmtDate(d.fromDate)} to ${fmtDate(d.toDate)}`}{d.fromDate <= today ? ' (now)' : ''}</strong>
            <span>{d.reason}{d.createdBy ? ` · set by ${d.createdBy}` : ''} · punch in from anywhere</span>
          </div>
          {onRemove && <button type="button" className="mac-btn mac-btn-secondary" onClick={() => onRemove(d)}><Trash2 size={15} /> Remove</button>}
        </div>
      ))}
    </div>
  );
}

const balanceTiles = b => [
  { label: 'Entitled', value: fmtNum(b?.entitled), sub: b?.year ? `Leave year ${b.year}` : 'This leave year', icon: CalendarDays },
  { label: 'Used', value: fmtNum(b?.used), sub: 'Approved paid leave', icon: CheckCircle2 },
  { label: 'Pending', value: fmtNum(b?.pending), sub: 'Waiting for approval', icon: Hourglass, tone: +b?.pending > 0 ? 'warn' : undefined },
  { label: 'Remaining', value: fmtNum(b?.remaining), sub: 'Paid days you can still take', icon: Wallet, tone: 'good' },
];

// ═════════════════════════════════════════════════════════════════
// Employee
// ═════════════════════════════════════════════════════════════════
const blankRequest = () => { const t = todayIST(); return { kind: 'leave', fromDate: t, toDate: t, halfDay: false, reason: '' }; };

function RequestForm({ v, set, errors, balance, policy, holidayDates, onSubmit }) {
  const oneDay = !!v.fromDate && v.fromDate === v.toDate;
  const { days, known } = countLeaveDays(v, policy, holidayDates);
  const validRange = !!v.fromDate && !!v.toDate && v.toDate >= v.fromDate;
  const remaining = balance ? Math.max(0, +balance.remaining || 0) : null;
  const unpaid = remaining != null ? Math.max(0, days - remaining) : 0;
  const home = v.kind === WFH;
  const span = validRange ? Math.round((new Date(`${v.toDate}T00:00:00`) - new Date(`${v.fromDate}T00:00:00`)) / 86400000) + 1 : 0;
  return (
    <form id="leave-form" onSubmit={e => { e.preventDefault(); onSubmit(days); }} noValidate>
      <div className="field" style={{ marginBottom: 16 }}>
        <span className="field-label" id="leave-kind-label">What are you asking for?</span>
        <div className="leave-kinds" role="radiogroup" aria-labelledby="leave-kind-label">
          {KINDS.map(([value, label, Icon]) => (
            <button key={value} type="button" role="radio" aria-checked={v.kind === value} className={v.kind === value ? 'active' : ''} onClick={() => set('kind', value)}>
              <Icon size={18} aria-hidden="true" />
              <span><strong>{label}</strong><em>{value === WFH ? 'Work the day from home' : 'Take the day off'}</em></span>
            </button>
          ))}
        </div>
      </div>
      <FormGrid>
        <Field label="From" required error={errors.fromDate}>
          <input className="mac-input" type="date" value={v.fromDate} onChange={e => set('fromDate', e.target.value)} />
        </Field>
        <Field label="To" required error={errors.toDate}>
          <input className="mac-input" type="date" value={v.toDate} min={v.fromDate || undefined} onChange={e => set('toDate', e.target.value)} />
        </Field>
        {oneDay && !home && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="hr-check"><input type="checkbox" checked={v.halfDay} onChange={e => set('halfDay', e.target.checked)} /> Half day only</label>
          </div>
        )}
        <Field label="Reason" required span={2} error={errors.reason}>
          <textarea className="mac-input" rows={3} value={v.reason} onChange={e => set('reason', e.target.value)} placeholder={home ? 'e.g. Plumber is coming in the afternoon' : 'e.g. Family function in Surat'} />
        </Field>
      </FormGrid>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {home && validRange && (
          <div className="hr-count" aria-live="polite">
            <b>{span}</b>
            <span>day{span === 1 ? '' : 's'} working from home · nothing is taken from your leave balance</span>
          </div>
        )}
        {home && <Notice tone="info" icon={Info}>Once a partner approves, you can punch in and out from anywhere on {span > 1 ? 'those days' : 'that day'}, and the day shows a WFH mark in your attendance. The day still counts from your punches.</Notice>}
        {!home && validRange && (
          <div className="hr-count" aria-live="polite">
            <b>{fmtNum(days)}</b>
            <span>{known ? `working day${days === 1 ? '' : 's'} of leave` : `day${days === 1 ? '' : 's'} (weekly offs and holidays could not be checked)`}{remaining != null ? ` · ${fmtNum(remaining)} paid day${remaining === 1 ? '' : 's'} left` : ''}</span>
          </div>
        )}
        {!home && validRange && days === 0 && <Notice tone="info" icon={Info}>These dates are all weekly offs or holidays, so no leave is needed.</Notice>}
        {!home && validRange && unpaid > 0 && (
          <Notice>This is more than your remaining balance: {fmtDays(unpaid)} would be unpaid leave and deducted from your salary.</Notice>
        )}
      </div>
    </form>
  );
}

function MyLeave() {
  const toast = useToast();
  const [officeDays, setOfficeDays] = useState([]);
  useEffect(() => { officeWfhAPI.list().then(setOfficeDays).catch(e => console.error(e)); }, []);
  const [balance, setBalance] = useState(null);
  const [requests, setRequests] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [cancelId, setCancelId] = useState(null);
  const [today] = useState(todayIST);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setLoadError(null); }
    try {
      // Work-from-home requests are extra: the leave page still works if they can not be loaded.
      const [b, r, h] = await Promise.all([leaveAPI.balance(), leaveAPI.mine(), wfhAPI.mine().catch(e => { console.error(e); return []; })]);
      setBalance(b); setRequests([...r.map(asLeave), ...h.map(asWfh)].sort(byNewest)); setLoadError(null);
    } catch (e) { console.error(e); if (!quiet) setLoadError(e); }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
    // Only used to count working days in the request form — the page works without them.
    const y = +todayIST().slice(0, 4);
    policyAPI.get().then(setPolicy).catch(e => console.error(e));
    Promise.all([holidaysAPI.list(y), holidaysAPI.list(y + 1)]).then(parts => setHolidays(parts.flat())).catch(e => console.error(e));
  }, [load]);

  const holidayDates = useMemo(() => new Set(holidays.map(h => h.date)), [holidays]);
  const openForm = () => { setForm(blankRequest()); setErrors({}); };
  const setField = (k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === 'fromDate' && (!next.toDate || next.toDate < v)) next.toDate = v;
      if (next.fromDate !== next.toDate) next.halfDay = false;
      return next;
    });
    setErrors(er => (er[k] ? { ...er, [k]: undefined } : er));
  };

  async function submit(days) {
    if (saving || !form) return;
    const er = {};
    if (!form.fromDate) er.fromDate = 'Pick the first day';
    if (!form.toDate) er.toDate = 'Pick the last day';
    else if (form.fromDate && form.toDate < form.fromDate) er.toDate = 'Must be on or after the first day';
    else if (form.kind !== WFH && days === 0 && policy) er.toDate = 'There are no working days in these dates';
    if (form.kind === WFH && form.fromDate && form.fromDate < today) er.fromDate = 'Pick today or a later day';
    if (!form.reason.trim()) er.reason = form.kind === WFH ? 'Say why you need to work from home' : 'Say why you need the leave';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      if (form.kind === WFH) await wfhAPI.create({ fromDate: form.fromDate, toDate: form.toDate, reason: form.reason.trim() });
      else await leaveAPI.request({ ...form, reason: form.reason.trim() });
      toast.success(form.kind === WFH ? 'Work-from-home request sent for approval' : 'Leave request sent for approval');
      setForm(null);
      load({ quiet: true });
    } catch (e) { toast.error('Could not send the request', e); }
    setSaving(false);
  }

  async function cancel(req) {
    try {
      if (isWfh(req)) await wfhAPI.cancel(req.id); else await leaveAPI.cancel(req.id);
      setRequests(rs => rs.map(r => (r.key === req.key ? { ...r, status: 'CANCELLED' } : r)));
      toast.success(isWfh(req) ? 'Work-from-home request cancelled' : 'Leave request cancelled');
      load({ quiet: true });
    } catch (e) { toast.error('Could not cancel the request', e); }
  }

  const canCancel = r => r.status === 'PENDING' || (r.status === 'APPROVED' && r.fromDate > today);
  const requestBtn = <button type="button" className="mac-btn mac-btn-primary" onClick={openForm}><Plus size={15} /> Request leave or WFH</button>;
  const subtitle = loading ? 'Loading…' : loadError ? 'Could not load' : `${fmtNum(balance?.remaining)} paid day${+balance?.remaining === 1 ? '' : 's'} left${balance?.year ? ` in ${balance.year}` : ''}`;

  return (
    <div>
      <Header title="Leave" subtitle={subtitle} actions={!loading && !loadError ? requestBtn : null} />
      <div className="page-body">
        {loading ? <SkeletonRows rows={5} />
          : loadError ? <ErrorPanel title="Could not load your leave" error={loadError} onRetry={load} />
          : (
            <>
              <StatTiles items={balanceTiles(balance)} />
              <OfficeWfhDays days={officeDays} />
              <h2 className="section-title">My requests</h2>
              {requests.length === 0
                ? <EmptyPanel icon={Plane} title="Nothing requested yet" text="Ask for leave or to work from home here, and a partner will approve or reject it." action={requestBtn} />
                : (
                  <div className="hr-reqs">
                    {requests.map(r => (
                      <RequestCard key={r.key} req={r} balance={balance}>
                        {canCancel(r) && <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setCancelId(r.key)}>Cancel request</button>}
                      </RequestCard>
                    ))}
                  </div>
                )}
            </>
          )}
      </div>

      <Modal isOpen={!!form} onClose={() => { if (!saving) setForm(null); }} title={form?.kind === WFH ? 'Request work from home' : 'Request leave'} size="md"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
          <button type="submit" form="leave-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Sending…' : 'Send request'}</button>
        </>}>
        {form && <RequestForm v={form} set={setField} errors={errors} balance={balance} policy={policy} holidayDates={holidayDates} onSubmit={submit} />}
      </Modal>

      <ConfirmDialog isOpen={!!cancelId} onClose={() => setCancelId(null)} onConfirm={() => { const r = requests.find(x => x.key === cancelId); if (r) cancel(r); }}
        title="Cancel request" confirmLabel="Cancel request"
        message={requests.find(x => x.key === cancelId)?.kind === WFH ? 'The request is withdrawn and those days are normal office days again.' : 'The request is withdrawn and any days it was holding go back to your balance.'} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Partner
// ═════════════════════════════════════════════════════════════════
const HISTORY_FILTERS = [['', 'All'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['CANCELLED', 'Cancelled']];

function TeamLeave() {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [emps, setEmps] = useState([]);
  const [balances, setBalances] = useState({});      // employeeId → balance
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState('history');
  const [status, setStatus] = useState('');
  const [who, setWho] = useState('');
  const [kind, setKind] = useState('');             // '' | 'leave' | 'wfh'
  const [search, setSearch] = useState('');
  const [decide, setDecide] = useState(null);         // { req, kind: 'approve' | 'reject', note }
  const [noteError, setNoteError] = useState('');
  const [saving, setSaving] = useState(false);
  const [officeDays, setOfficeDays] = useState([]);
  const [everyone, setEveryone] = useState(null);     // { fromDate, toDate, reason } while the form is open
  const [everyoneErrors, setEveryoneErrors] = useState({});
  const [removeDay, setRemoveDay] = useState(null);

  const loadOfficeDays = useCallback(() => officeWfhAPI.list().then(setOfficeDays).catch(e => console.error(e)), []);
  useEffect(() => { loadOfficeDays(); }, [loadOfficeDays]);

  async function giveEveryone() {
    if (saving || !everyone) return;
    const er = {};
    const today = todayIST();
    if (!everyone.fromDate) er.fromDate = 'Pick the day';
    else if (everyone.fromDate < today) er.fromDate = 'Pick today or a later day';
    if (everyone.toDate && everyone.fromDate && everyone.toDate < everyone.fromDate) er.toDate = 'Must not be before the first day';
    if (!everyone.reason.trim()) er.reason = 'Say why, so everyone knows';
    setEveryoneErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      await officeWfhAPI.create({ fromDate: everyone.fromDate, toDate: everyone.toDate || everyone.fromDate, reason: everyone.reason.trim() });
      toast.success('Everyone has been told they work from home');
      setEveryone(null);
      loadOfficeDays();
    } catch (e) { toast.error('Could not set work from home for everyone', e); }
    setSaving(false);
  }

  async function takeBack(day) {
    try {
      await officeWfhAPI.remove(day.id);
      toast.success('Removed. Everyone has been told to come to the office');
      loadOfficeDays();
    } catch (e) { toast.error('Could not remove it', e); }
  }

  const loadBalances = useCallback(async list => {
    const settled = await Promise.allSettled(list.map(e => leaveAPI.balanceFor(e.id)));
    const map = {};
    settled.forEach((s, i) => { if (s.status === 'fulfilled' && s.value) map[list[i].id] = s.value; else if (s.status === 'rejected') console.error(s.reason); });
    setBalances(map);
  }, []);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setLoadError(null); }
    try {
      // Requests are the page; names and balances are extra detail.
      const [reqs, people, homes] = await Promise.all([
        leaveAPI.list(),
        employeesDB.getAll().catch(e => { console.error(e); return []; }),
        wfhAPI.list().catch(e => { console.error(e); return []; }),
      ]);
      const active = people.filter(e => e.status === 'Active');
      setRequests([...reqs.map(asLeave), ...homes.map(asWfh)].sort(byNewest)); setEmps(active); setLoadError(null);
      setLoading(false);
      loadBalances(active);
    } catch (e) { console.error(e); if (!quiet) setLoadError(e); setLoading(false); }
  }, [loadBalances]);
  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => requests.filter(r => r.status === 'PENDING').sort((a, b) => String(a.fromDate).localeCompare(String(b.fromDate))), [requests]);
  const history = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter(r => r.status !== 'PENDING'
      && (!status || r.status === status)
      && (!who || String(r.employeeId) === who)
      && (!kind || r.kind === kind)
      && (!q || `${r.employeeName} ${r.reason || ''}`.toLowerCase().includes(q)));
  }, [requests, status, who, kind, search]);
  const past = requests.length - pending.length;
  const filtering = !!(status || who || kind || search.trim());
  const people = useMemo(() => {
    const map = new Map(emps.map(e => [String(e.id), e.name]));
    requests.forEach(r => { if (!map.has(String(r.employeeId))) map.set(String(r.employeeId), r.employeeName); });
    return [...map].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [emps, requests]);

  const openDecide = (req, kind) => { setDecide({ req, kind, note: '' }); setNoteError(''); };
  async function submitDecision() {
    if (saving || !decide) return;
    const { req, kind } = decide;
    const note = decide.note.trim();
    if (kind === 'reject' && !note) { setNoteError('Say why, so the employee knows'); return; }
    setSaving(true);
    try {
      const api = isWfh(req) ? wfhAPI : leaveAPI;
      if (kind === 'approve') await api.approve(req.id, note); else await api.reject(req.id, note);
      setRequests(rs => rs.map(r => (r.key === req.key ? { ...r, status: kind === 'approve' ? 'APPROVED' : 'REJECTED', decisionNote: note } : r)));
      const what = isWfh(req) ? 'Work from home' : 'Leave';
      toast.success(`${what} ${kind === 'approve' ? 'approved' : 'rejected'} for ${req.employeeName}`);
      setDecide(null);
      load({ quiet: true });
    } catch (e) { toast.error(kind === 'approve' ? 'Could not approve the request' : 'Could not reject the request', e); }
    setSaving(false);
  }

  const subtitle = loading ? 'Loading…' : loadError ? 'Could not load' : pending.length ? `${pending.length} leave or work-from-home request${pending.length === 1 ? '' : 's'} waiting for you` : 'Nothing is waiting for approval';
  const dSplit = decide ? split(decide.req, balances[decide.req.employeeId]) : null;

  return (
    <div>
      <Header title="Leave" subtitle={subtitle}
        actions={<button type="button" className="mac-btn mac-btn-primary" onClick={() => { const t = todayIST(); setEveryone({ fromDate: t, toDate: t, reason: '' }); setEveryoneErrors({}); }}><Users size={15} /> WFH for everyone</button>} />
      <div className="page-body">
        {loading ? <SkeletonRows rows={6} />
          : loadError ? <ErrorPanel title="Could not load leave requests" error={loadError} onRetry={load} />
          : (
            <>
              <OfficeWfhDays days={officeDays} onRemove={setRemoveDay} />
              <h2 className="section-title">Waiting for approval{pending.length ? ` (${pending.length})` : ''}</h2>
              {pending.length === 0
                ? <EmptyPanel icon={CalendarCheck} title="All caught up" text="New leave and work-from-home requests appear here for you to approve or reject." />
                : (
                  <div className="hr-reqs">
                    {pending.map(r => (
                      <RequestCard key={r.key} req={r} who balance={balances[r.employeeId]}>
                        <button type="button" className="mac-btn mac-btn-danger" onClick={() => openDecide(r, 'reject')}><X size={15} /> Reject</button>
                        <button type="button" className="mac-btn mac-btn-primary" onClick={() => openDecide(r, 'approve')}><Check size={15} /> Approve</button>
                      </RequestCard>
                    ))}
                  </div>
                )}

              <TabBar label="Leave sections" value={tab} onChange={setTab} tabs={[['history', `History (${past})`], ['balances', 'Balances']]} />

              {tab === 'history' && (
                <>
                  <Toolbar search={search} onSearch={setSearch} placeholder="Search name or reason…"
                    right={filtering && <><span>{history.length} of {past}</span><button type="button" className="mac-btn mac-btn-ghost" onClick={() => { setStatus(''); setWho(''); setKind(''); setSearch(''); }}>Clear</button></>}>
                    <Chips label="Status" value={status} onChange={setStatus} options={HISTORY_FILTERS.map(([value, label]) => ({ value, label }))} />
                    <select className="mac-select" aria-label="Type" value={kind} onChange={e => setKind(e.target.value)}>
                      <option value="">Leave and work from home</option>
                      <option value="leave">Leave only</option>
                      <option value={WFH}>Work from home only</option>
                    </select>
                    <select className="mac-select" aria-label="Employee" value={who} onChange={e => setWho(e.target.value)}>
                      <option value="">Everyone</option>
                      {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  </Toolbar>
                  {history.length === 0
                    ? <EmptyPanel icon={Plane} title={filtering ? 'Nothing matches these filters' : 'No past requests yet'} text={filtering ? 'Try a different filter.' : 'Approved, rejected and cancelled requests are kept here.'} />
                    : <div className="hr-reqs">{history.map(r => <RequestCard key={r.key} req={r} who balance={balances[r.employeeId]} />)}</div>}
                </>
              )}

              {tab === 'balances' && (emps.length === 0
                ? <EmptyPanel icon={Wallet} title="No active employees" text="Leave balances appear here for every active employee." />
                : (
                  <div className="mac-card table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Employee</th><th className="num">Entitled</th><th className="num">Used</th><th className="num">Pending</th><th className="num">Remaining</th></tr></thead>
                      <tbody>
                        {emps.map(e => {
                          const b = balances[e.id];
                          return (
                            <tr key={e.id}>
                              <td><div className="hr-person"><Avatar name={e.name} /><div><div className="cell-main">{e.name}</div><div className="cell-sub">{b?.year ? `Leave year ${b.year}` : e.role || '—'}</div></div></div></td>
                              <td className="num">{b ? fmtNum(b.entitled) : '—'}</td>
                              <td className="num">{b ? fmtNum(b.used) : '—'}</td>
                              <td className="num">{b ? fmtNum(b.pending) : '—'}</td>
                              <td className="num"><span className={b && +b.remaining <= 0 ? 'amount-out' : 'cell-main'}>{b ? fmtNum(b.remaining) : '—'}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
            </>
          )}
      </div>

      <Modal isOpen={!!decide} onClose={() => { if (!saving) setDecide(null); }} size="sm"
        title={decide ? `${decide.kind === 'approve' ? 'Approve' : 'Reject'} ${isWfh(decide.req) ? 'work from home' : 'leave'}` : 'Leave'}
        footer={decide && <>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setDecide(null)} disabled={saving}>Cancel</button>
          <button type="submit" form="leave-decide-form" className={`mac-btn ${decide.kind === 'approve' ? 'mac-btn-primary' : 'mac-btn-danger'}`} disabled={saving}>
            {saving ? 'Saving…' : decide.kind === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </>}>
        {decide && (
          <form id="leave-decide-form" onSubmit={e => { e.preventDefault(); submitDecision(); }} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <dl className="kv">
              <dt>Employee</dt><dd>{decide.req.employeeName}</dd>
              <dt>Dates</dt><dd>{fmtRange(decide.req)}{decide.req.halfDay ? ' · half day' : ''}</dd>
              <dt>Type</dt><dd>{isWfh(decide.req) ? 'Work from home' : 'Leave'}</dd>
              <dt>{isWfh(decide.req) ? 'Days' : 'Working days'}</dt><dd>{fmtDays(decide.req.days)}</dd>
              {decide.req.reason && <><dt>Reason</dt><dd>{decide.req.reason}</dd></>}
            </dl>
            {decide.kind === 'approve' && isWfh(decide.req) && (
              <Notice tone="info" icon={Info}>On {decide.req.days > 1 ? 'these days' : 'this day'} {decide.req.employeeName} can punch in and out from anywhere, and attendance shows a WFH mark. Nothing is taken from the leave balance.</Notice>
            )}
            {decide.kind === 'approve' && !isWfh(decide.req) && dSplit.known && dSplit.unpaid > 0 && (
              <Notice>{dSplit.paid > 0 ? `${fmtDays(dSplit.paid)} will be paid and ${fmtDays(dSplit.unpaid)} unpaid` : `All ${fmtDays(dSplit.unpaid)} will be unpaid`} — {decide.req.employeeName} does not have enough paid leave left. Unpaid days are deducted in payroll.</Notice>
            )}
            <Field label={decide.kind === 'approve' ? 'Note (optional)' : 'Reason for rejecting'} required={decide.kind === 'reject'} error={noteError}>
              <textarea className="mac-input" rows={3} value={decide.note} onChange={e => { setDecide(d => ({ ...d, note: e.target.value })); setNoteError(''); }}
                placeholder={decide.kind === 'approve' ? 'Anything the employee should know' : 'e.g. Release week — please pick other dates'} />
            </Field>
          </form>
        )}
      </Modal>

      <Modal isOpen={!!everyone} onClose={() => { if (!saving) setEveryone(null); }} title="Work from home for everyone" size="md"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setEveryone(null)} disabled={saving}>Cancel</button>
          <button type="submit" form="wfh-everyone-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Give everyone WFH'}</button>
        </>}>
        {everyone && (
          <form id="wfh-everyone-form" onSubmit={e => { e.preventDefault(); giveEveryone(); }} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormGrid>
              <Field label="From" required error={everyoneErrors.fromDate}>
                <input className="mac-input" type="date" min={todayIST()} value={everyone.fromDate} onChange={e => setEveryone(v => ({ ...v, fromDate: e.target.value, toDate: v.toDate && v.toDate < e.target.value ? e.target.value : v.toDate }))} />
              </Field>
              <Field label="To" required error={everyoneErrors.toDate}>
                <input className="mac-input" type="date" min={everyone.fromDate || todayIST()} value={everyone.toDate} onChange={e => setEveryone(v => ({ ...v, toDate: e.target.value }))} />
              </Field>
              <Field label="Reason" required span={2} error={everyoneErrors.reason}>
                <textarea className="mac-input" rows={3} maxLength={500} value={everyone.reason} onChange={e => setEveryone(v => ({ ...v, reason: e.target.value }))} placeholder="e.g. Heavy rain, or office maintenance" />
              </Field>
            </FormGrid>
            <Notice tone="info" icon={Info}>On {everyone.toDate && everyone.toDate !== everyone.fromDate ? 'these days' : 'this day'} every employee can punch in and out from anywhere, and attendance shows a WFH mark. Nobody has to ask, nothing is taken from leave, and everyone is notified. A day with no punch is still absent.</Notice>
          </form>
        )}
      </Modal>

      <ConfirmDialog isOpen={!!removeDay} onClose={() => setRemoveDay(null)} onConfirm={() => { if (removeDay) takeBack(removeDay); }}
        title="Remove work from home for everyone?" confirmLabel="Remove"
        message="These become normal office days again and everyone is told to come to the office. Punches already made stay as they are." />
    </div>
  );
}

export default function Leave() {
  const { isPartner } = useAuth();
  return isPartner ? <TeamLeave /> : <MyLeave />;
}

// Pure views — exported so they can be rendered with sample data
export { RequestCard, RequestForm };
