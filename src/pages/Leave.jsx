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
import { leaveAPI, policyAPI, holidaysAPI, leaveMeta, countLeaveDays, fmtDays, fmtNum, todayIST } from '../lib/hr';
import { Notice, TabBar } from '../components/hr/parts';
import { CalendarCheck, CalendarDays, Check, CheckCircle2, Hourglass, Info, Plane, Plus, Wallet, X } from 'lucide-react';
import './HR.css';

const fmtRange = r => (r.fromDate === r.toDate ? fmtDate(r.fromDate) : `${fmtDate(r.fromDate)} – ${fmtDate(r.toDate)}`);
const fmtWhen = ts => (ts ? new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const byNewest = (a, b) => String(b.createdAt || b.fromDate || '').localeCompare(String(a.createdAt || a.fromDate || ''));
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
        <StatusBadge status={req.status} />
      </div>
      {req.reason && <div className="hr-req-reason">{req.reason}</div>}
      <div className="hr-req-meta">
        <span>{fmtDays(req.days)}</span>
        <SplitText req={req} balance={balance} />
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

const balanceTiles = b => [
  { label: 'Entitled', value: fmtNum(b?.entitled), sub: b?.year ? `Leave year ${b.year}` : 'This leave year', icon: CalendarDays },
  { label: 'Used', value: fmtNum(b?.used), sub: 'Approved paid leave', icon: CheckCircle2 },
  { label: 'Pending', value: fmtNum(b?.pending), sub: 'Waiting for approval', icon: Hourglass, tone: +b?.pending > 0 ? 'warn' : undefined },
  { label: 'Remaining', value: fmtNum(b?.remaining), sub: 'Paid days you can still take', icon: Wallet, tone: 'good' },
];

// ═════════════════════════════════════════════════════════════════
// Employee
// ═════════════════════════════════════════════════════════════════
const blankRequest = () => { const t = todayIST(); return { fromDate: t, toDate: t, halfDay: false, reason: '' }; };

function RequestForm({ v, set, errors, balance, policy, holidayDates, onSubmit }) {
  const oneDay = !!v.fromDate && v.fromDate === v.toDate;
  const { days, known } = countLeaveDays(v, policy, holidayDates);
  const validRange = !!v.fromDate && !!v.toDate && v.toDate >= v.fromDate;
  const remaining = balance ? Math.max(0, +balance.remaining || 0) : null;
  const unpaid = remaining != null ? Math.max(0, days - remaining) : 0;
  return (
    <form id="leave-form" onSubmit={e => { e.preventDefault(); onSubmit(days); }} noValidate>
      <FormGrid>
        <Field label="From" required error={errors.fromDate}>
          <input className="mac-input" type="date" value={v.fromDate} onChange={e => set('fromDate', e.target.value)} />
        </Field>
        <Field label="To" required error={errors.toDate}>
          <input className="mac-input" type="date" value={v.toDate} min={v.fromDate || undefined} onChange={e => set('toDate', e.target.value)} />
        </Field>
        {oneDay && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="hr-check"><input type="checkbox" checked={v.halfDay} onChange={e => set('halfDay', e.target.checked)} /> Half day only</label>
          </div>
        )}
        <Field label="Reason" required span={2} error={errors.reason}>
          <textarea className="mac-input" rows={3} value={v.reason} onChange={e => set('reason', e.target.value)} placeholder="e.g. Family function in Surat" />
        </Field>
      </FormGrid>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {validRange && (
          <div className="hr-count" aria-live="polite">
            <b>{fmtNum(days)}</b>
            <span>{known ? `working day${days === 1 ? '' : 's'} of leave` : `day${days === 1 ? '' : 's'} (weekly offs and holidays could not be checked)`}{remaining != null ? ` · ${fmtNum(remaining)} paid day${remaining === 1 ? '' : 's'} left` : ''}</span>
          </div>
        )}
        {validRange && days === 0 && <Notice tone="info" icon={Info}>These dates are all weekly offs or holidays, so no leave is needed.</Notice>}
        {validRange && unpaid > 0 && (
          <Notice>This is more than your remaining balance: {fmtDays(unpaid)} would be unpaid leave and deducted from your salary.</Notice>
        )}
      </div>
    </form>
  );
}

function MyLeave() {
  const toast = useToast();
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
      const [b, r] = await Promise.all([leaveAPI.balance(), leaveAPI.mine()]);
      setBalance(b); setRequests([...r].sort(byNewest)); setLoadError(null);
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
    else if (days === 0 && policy) er.toDate = 'There are no working days in these dates';
    if (!form.reason.trim()) er.reason = 'Say why you need the leave';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      const created = await leaveAPI.request({ ...form, reason: form.reason.trim() });
      if (created?.id != null) setRequests(rs => [created, ...rs.filter(r => r.id !== created.id)]);
      toast.success('Leave request sent for approval');
      setForm(null);
      load({ quiet: true });
    } catch (e) { toast.error('Could not send the request', e); }
    setSaving(false);
  }

  async function cancel(id) {
    try {
      const updated = await leaveAPI.cancel(id);
      setRequests(rs => rs.map(r => (r.id === id ? (updated?.id != null ? updated : { ...r, status: 'CANCELLED' }) : r)));
      toast.success('Leave request cancelled');
      load({ quiet: true });
    } catch (e) { toast.error('Could not cancel the request', e); }
  }

  const canCancel = r => r.status === 'PENDING' || (r.status === 'APPROVED' && r.fromDate > today);
  const requestBtn = <button type="button" className="mac-btn mac-btn-primary" onClick={openForm}><Plus size={15} /> Request leave</button>;
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
              <h2 className="section-title">My requests</h2>
              {requests.length === 0
                ? <EmptyPanel icon={Plane} title="No leave requested yet" text="Ask for leave here and a partner will approve or reject it." action={requestBtn} />
                : (
                  <div className="hr-reqs">
                    {requests.map(r => (
                      <RequestCard key={r.id} req={r} balance={balance}>
                        {canCancel(r) && <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setCancelId(r.id)}>Cancel request</button>}
                      </RequestCard>
                    ))}
                  </div>
                )}
            </>
          )}
      </div>

      <Modal isOpen={!!form} onClose={() => { if (!saving) setForm(null); }} title="Request leave" size="md"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
          <button type="submit" form="leave-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Sending…' : 'Send request'}</button>
        </>}>
        {form && <RequestForm v={form} set={setField} errors={errors} balance={balance} policy={policy} holidayDates={holidayDates} onSubmit={submit} />}
      </Modal>

      <ConfirmDialog isOpen={!!cancelId} onClose={() => setCancelId(null)} onConfirm={() => { cancel(cancelId); }}
        title="Cancel leave request" confirmLabel="Cancel request" message="The request is withdrawn and any days it was holding go back to your balance." />
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
  const [search, setSearch] = useState('');
  const [decide, setDecide] = useState(null);         // { req, kind: 'approve' | 'reject', note }
  const [noteError, setNoteError] = useState('');
  const [saving, setSaving] = useState(false);

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
      const [reqs, people] = await Promise.all([
        leaveAPI.list(),
        employeesDB.getAll().catch(e => { console.error(e); return []; }),
      ]);
      const active = people.filter(e => e.status === 'Active');
      setRequests([...reqs].sort(byNewest)); setEmps(active); setLoadError(null);
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
      && (!q || `${r.employeeName} ${r.reason || ''}`.toLowerCase().includes(q)));
  }, [requests, status, who, search]);
  const past = requests.length - pending.length;
  const filtering = !!(status || who || search.trim());
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
      const updated = kind === 'approve' ? await leaveAPI.approve(req.id, note) : await leaveAPI.reject(req.id, note);
      setRequests(rs => rs.map(r => (r.id === req.id ? (updated?.id != null ? updated : { ...r, status: kind === 'approve' ? 'APPROVED' : 'REJECTED', decisionNote: note }) : r)));
      toast.success(kind === 'approve' ? `Leave approved for ${req.employeeName}` : `Leave rejected for ${req.employeeName}`);
      setDecide(null);
      load({ quiet: true });
    } catch (e) { toast.error(kind === 'approve' ? 'Could not approve the request' : 'Could not reject the request', e); }
    setSaving(false);
  }

  const subtitle = loading ? 'Loading…' : loadError ? 'Could not load' : pending.length ? `${pending.length} request${pending.length === 1 ? '' : 's'} waiting for you` : 'Nothing is waiting for approval';
  const dSplit = decide ? split(decide.req, balances[decide.req.employeeId]) : null;

  return (
    <div>
      <Header title="Leave" subtitle={subtitle} />
      <div className="page-body">
        {loading ? <SkeletonRows rows={6} />
          : loadError ? <ErrorPanel title="Could not load leave requests" error={loadError} onRetry={load} />
          : (
            <>
              <h2 className="section-title">Waiting for approval{pending.length ? ` (${pending.length})` : ''}</h2>
              {pending.length === 0
                ? <EmptyPanel icon={CalendarCheck} title="All caught up" text="New leave requests appear here for you to approve or reject." />
                : (
                  <div className="hr-reqs">
                    {pending.map(r => (
                      <RequestCard key={r.id} req={r} who balance={balances[r.employeeId]}>
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
                    right={filtering && <><span>{history.length} of {past}</span><button type="button" className="mac-btn mac-btn-ghost" onClick={() => { setStatus(''); setWho(''); setSearch(''); }}>Clear</button></>}>
                    <Chips label="Status" value={status} onChange={setStatus} options={HISTORY_FILTERS.map(([value, label]) => ({ value, label }))} />
                    <select className="mac-select" aria-label="Employee" value={who} onChange={e => setWho(e.target.value)}>
                      <option value="">Everyone</option>
                      {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  </Toolbar>
                  {history.length === 0
                    ? <EmptyPanel icon={Plane} title={filtering ? 'Nothing matches these filters' : 'No past requests yet'} text={filtering ? 'Try a different filter.' : 'Approved, rejected and cancelled requests are kept here.'} />
                    : <div className="hr-reqs">{history.map(r => <RequestCard key={r.id} req={r} who balance={balances[r.employeeId]} />)}</div>}
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
        title={decide ? (decide.kind === 'approve' ? 'Approve leave' : 'Reject leave') : 'Leave'}
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
              <dt>Working days</dt><dd>{fmtDays(decide.req.days)}</dd>
              {decide.req.reason && <><dt>Reason</dt><dd>{decide.req.reason}</dd></>}
            </dl>
            {decide.kind === 'approve' && dSplit.known && dSplit.unpaid > 0 && (
              <Notice>{dSplit.paid > 0 ? `${fmtDays(dSplit.paid)} will be paid and ${fmtDays(dSplit.unpaid)} unpaid` : `All ${fmtDays(dSplit.unpaid)} will be unpaid`} — {decide.req.employeeName} does not have enough paid leave left. Unpaid days are deducted in payroll.</Notice>
            )}
            <Field label={decide.kind === 'approve' ? 'Note (optional)' : 'Reason for rejecting'} required={decide.kind === 'reject'} error={noteError}>
              <textarea className="mac-input" rows={3} value={decide.note} onChange={e => { setDecide(d => ({ ...d, note: e.target.value })); setNoteError(''); }}
                placeholder={decide.kind === 'approve' ? 'Anything the employee should know' : 'e.g. Release week — please pick other dates'} />
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default function Leave() {
  const { isPartner } = useAuth();
  return isPartner ? <TeamLeave /> : <MyLeave />;
}

// Pure views — exported so they can be rendered with sample data
export { RequestCard, RequestForm };
