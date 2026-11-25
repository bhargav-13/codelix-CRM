import { Fragment, useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { employeesDB } from '../lib/db';
import { NumInput } from '../lib/numInput';
import { PAYMENT_METHODS } from '../data/mockData';
import {
  useToast, Field, FormGrid, StatTiles, SkeletonRows, EmptyPanel, ErrorPanel, RowMenu, Avatar, fmtMoney, fmtDate, todayLocal,
} from '../components/ui/kit';
import {
  payrollAPI, advancesAPI, openPayslipPdf, runMeta, RUN_STEPS, runTotals, lineDeductions,
  monthLabel, currentMonth, lastCompletedMonth, fmtNum,
} from '../lib/hr';
import { Notice, TabBar } from '../components/hr/parts';
import {
  ArrowLeft, Banknote, Check, CheckCircle2, ChevronDown, Download, Eye, FileText, HandCoins, Info, Lock, Plus, Receipt,
  RefreshCw, Trash2, Undo2, Wallet,
} from 'lucide-react';
import './HR.css';

// Same account names the Employees and Transactions pages use
const PAID_FROM = ['Company Bank', 'Cash + Savings Account'];
const labelOf = r => r?.monthLabel || monthLabel(r?.month);
const RunBadge = ({ status }) => { const m = runMeta(status); return <Badge color={m.color}>{m.label}</Badge>; };
const slipName = (label, name) => `Payslip ${label}${name ? ` ${name}` : ''}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ');
const money = v => (v === '' || v == null ? 0 : +v || 0);

// ═════════════════════════════════════════════════════════════════
// The payslip, readable on screen. `slip` is the payslip JSON: the line's
// fields (flat, or under `line`) + companyName + policy snapshot.
// ═════════════════════════════════════════════════════════════════
function SlipRows({ rows, total, totalLabel }) {
  return (
    <dl className="hr-slip-rows">
      {rows.filter(([, v], i) => i === 0 || money(v) !== 0).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{fmtMoney(v)}</dd></div>)}
      <div className="sum"><dt>{totalLabel}</dt><dd>{fmtMoney(total)}</dd></div>
    </dl>
  );
}

export function PayslipView({ slip }) {
  const l = slip?.line || slip || {};
  const label = slip?.monthLabel || l.monthLabel || monthLabel(slip?.month || l.month);
  const paidAt = slip?.paidAt || l.paidAt;
  const earnings = [['Monthly salary', l.gross ?? l.monthlySalary], ['Bonus', l.bonus]];
  const deductions = [
    [`Unpaid days (${fmtNum(l.unpaidDays)})`, l.unpaidDeduction], ['Advance recovery', l.advanceRecovery], ['Other deductions', l.otherDeduction],
  ];
  const sum = rows => rows.reduce((s, [, v]) => s + money(v), 0);
  return (
    <div className="hr-slip">
      <div className="hr-slip-head">
        <div>
          <div className="hr-slip-co">{slip?.companyName || 'Codelix'}</div>
          <div className="hr-note">Payslip for {label}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="cell-main">{l.employeeName || '—'}</div>
          <div className="cell-sub">{[l.empId, paidAt ? `Paid ${fmtDate(String(paidAt).slice(0, 10))}` : null].filter(Boolean).join(' · ') || '—'}</div>
        </div>
      </div>
      <div className="hr-slip-cols">
        <section><h3 className="form-section-title" style={{ marginBottom: 10 }}>Earnings</h3><SlipRows rows={earnings} total={sum(earnings)} totalLabel="Total earnings" /></section>
        <section><h3 className="form-section-title" style={{ marginBottom: 10 }}>Deductions</h3><SlipRows rows={deductions} total={sum(deductions)} totalLabel="Total deductions" /></section>
      </div>
      <div className="hr-slip-net"><span>Net pay</span><b>{fmtMoney(l.net)}</b></div>
      <section>
        <h3 className="form-section-title" style={{ marginBottom: 10 }}>Attendance</h3>
        <AttendanceBreakdown line={l} />
      </section>
      {l.note && <p className="hr-note">Note: {l.note}</p>}
    </div>
  );
}

function AttendanceBreakdown({ line: l }) {
  return (
    <dl className="kv">
      <dt>Days in month</dt><dd>{fmtNum(l.daysInMonth)}</dd>
      <dt>Payable days</dt><dd>{fmtNum(l.payableDays)}</dd>
      <dt>Unpaid days</dt><dd>{fmtNum(l.unpaidDays)}</dd>
      <dt>Present</dt><dd>{fmtNum(l.present)}</dd>
      <dt>Half days</dt><dd>{fmtNum(l.halfDays)}</dd>
      <dt>Absent</dt><dd>{fmtNum(l.absent)}</dd>
      <dt>Paid leave</dt><dd>{fmtNum(l.paidLeave)}</dd>
      <dt>Unpaid leave</dt><dd>{fmtNum(l.unpaidLeave)}</dd>
      <dt>Late</dt><dd>{fmtNum(l.lateCount)} time{+l.lateCount === 1 ? '' : 's'}</dd>
      {+l.notTrackedDays > 0 && <><dt>Not tracked (paid)</dt><dd>{fmtNum(l.notTrackedDays)}</dd></>}
    </dl>
  );
}

// ═════════════════════════════════════════════════════════════════
// Employee: my payslips
// ═════════════════════════════════════════════════════════════════
// The employee's own salary advances: what was given, what has been recovered, what is left.
function MyAdvances() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let live = true;
    advancesAPI.mine().then(a => { if (live) setItems(a); }).catch(e => { console.error(e); if (live) setItems([]); });
    return () => { live = false; };
  }, []);
  if (!items || items.length === 0) return null;
  const left = items.reduce((sum, a) => sum + (+a.outstanding || 0), 0);
  return (
    <section className="mac-card hr-card" aria-label="My salary advances">
      <div className="hr-head-row">
        <h2 className="section-title">My salary advances</h2>
        <span className="faint">{left > 0 ? `${fmtMoney(left)} still to be recovered` : 'All recovered'}</span>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Given on</th><th className="num">Amount</th><th className="num">Recovered per month</th><th className="num">Recovered</th><th className="num">Left</th></tr></thead>
          <tbody>
            {items.map(a => (
              <tr key={a.id}>
                <td>{fmtDate(a.date)}</td>
                <td className="num">{fmtMoney(a.amount)}</td>
                <td className="num">{+a.recoverPerMonth > 0 ? fmtMoney(a.recoverPerMonth) : '—'}</td>
                <td className="num">{fmtMoney(a.recovered)}</td>
                <td className="num"><span className="cell-main">{fmtMoney(a.outstanding)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hr-note" style={{ margin: 0 }}>The monthly recovery is taken from your salary in each payroll until nothing is left.</p>
    </section>
  );
}

function MyPayslips() {
  const toast = useToast();
  const { employeeData, me } = useAuth();
  const myId = employeeData?.id ?? me?.employeeId ?? null;
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState(null);       // { item, slip, error }
  const [pdfBusy, setPdfBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try { const data = await payrollAPI.myPayslips(); setSlips([...data].sort((a, b) => String(b.month).localeCompare(String(a.month)))); }
    catch (e) { console.error(e); setLoadError(e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function openView(item) {
    setView({ item, slip: null, error: null });
    try {
      const slip = await payrollAPI.payslip(item.runId, myId);
      setView(v => (v && v.item.runId === item.runId ? { ...v, slip: { ...item, ...slip } } : v));
    } catch (e) { console.error(e); setView(v => (v && v.item.runId === item.runId ? { ...v, error: e } : v)); }
  }
  async function download(item) {
    if (pdfBusy) return;
    setPdfBusy(item.runId);
    try { await openPayslipPdf(item.runId, myId, { filename: slipName(labelOf(item)) }); }
    catch (e) { toast.error('Could not download the payslip', e); }
    setPdfBusy(null);
  }

  const pdfBtn = (item, primary) => (
    <button type="button" className={`mac-btn ${primary ? 'mac-btn-primary' : 'mac-btn-secondary'}`} onClick={e => { e.stopPropagation(); download(item); }} disabled={pdfBusy === item.runId}>
      <Download size={15} /> {pdfBusy === item.runId ? 'Preparing…' : 'Download PDF'}
    </button>
  );
  return (
    <div>
      <Header title="My payslips" subtitle={loading ? 'Loading…' : loadError ? 'Could not load' : `${slips.length} payslip${slips.length === 1 ? '' : 's'}`} />
      <div className="page-body">
        {loading ? <SkeletonRows rows={5} />
          : loadError ? <ErrorPanel title="Could not load your payslips" error={loadError} onRetry={load} />
          : slips.length === 0 ? <EmptyPanel icon={Receipt} title="No payslips yet" text="A payslip appears here each month once your salary has been paid." />
          : (
            <>
              <div className="mac-card table-wrap only-desktop">
                <table className="data-table">
                  <thead><tr><th>Month</th><th>Paid on</th><th className="num">Net pay</th><th aria-label="Actions" /></tr></thead>
                  <tbody>
                    {slips.map(s => (
                      <tr key={s.runId}>
                        <td className="cell-main">{labelOf(s)}</td>
                        <td>{s.paidAt ? fmtDate(String(s.paidAt).slice(0, 10)) : '—'}</td>
                        <td className="num"><span className="cell-main">{fmtMoney(s.net)}</span></td>
                        <td><div className="hr-actions" style={{ justifyContent: 'flex-end' }}>
                          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => openView(s)}><Eye size={15} /> View</button>
                          {pdfBtn(s)}
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="only-mobile">
                <div className="list-cards">
                  {slips.map(s => (
                    <div key={s.runId} className="list-card" style={{ cursor: 'default' }}>
                      <div className="hr-head-row">
                        <div><div className="cell-main">{labelOf(s)}</div><div className="cell-sub">{s.paidAt ? `Paid ${fmtDate(String(s.paidAt).slice(0, 10))}` : 'Not paid yet'}</div></div>
                        <span className="cell-main" style={{ fontSize: 'var(--fs-lg)' }}>{fmtMoney(s.net)}</span>
                      </div>
                      <div className="hr-actions">
                        <button type="button" className="mac-btn mac-btn-secondary" onClick={() => openView(s)}><Eye size={15} /> View</button>
                        {pdfBtn(s)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        <MyAdvances />
      </div>

      <Modal isOpen={!!view} onClose={() => setView(null)} title={view ? `Payslip — ${labelOf(view.item)}` : 'Payslip'} size="lg"
        footer={view && <>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setView(null)}>Close</button>
          {pdfBtn(view.item, true)}
        </>}>
        {view && (view.error ? <ErrorPanel title="Could not open this payslip" error={view.error} onRetry={() => openView(view.item)} />
          : !view.slip ? <SkeletonRows rows={5} />
          : <PayslipView slip={view.slip} />)}
      </Modal>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Partner: one payroll run
// ═════════════════════════════════════════════════════════════════
function Stepper({ status }) {
  const at = RUN_STEPS.indexOf(status);
  return (
    <ol className="hr-steps" aria-label={`Status: ${runMeta(status).label}`}>
      {RUN_STEPS.map((s, i) => {
        const done = i < at || status === 'PAID';
        return (
          <Fragment key={s}>
            {i > 0 && <li className="hr-step-line" aria-hidden="true" />}
            <li className={`hr-step ${done ? 'done' : i === at ? 'now' : ''}`} aria-current={i === at ? 'step' : undefined}>
              <span className="hr-step-n">{done ? <Check size={14} aria-hidden="true" /> : i + 1}</span>{runMeta(s).label}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

const lineDraft = l => ({ bonus: String(+l.bonus || ''), otherDeduction: String(+l.otherDeduction || ''), advanceRecovery: String(+l.advanceRecovery || ''), note: l.note || '' });
const sameDraft = (a, b) => money(a.bonus) === money(b.bonus) && money(a.otherDeduction) === money(b.otherDeduction) && money(a.advanceRecovery) === money(b.advanceRecovery) && (a.note || '') === (b.note || '');

export function RunView({ run, onBack, onChanged, onDeleted }) {
  const toast = useToast();
  const [open, setOpen] = useState(() => new Set());
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null);     // 'approve' | 'reopen' | 'delete'
  const [pay, setPay] = useState(null);             // { date, method, account }
  const [payError, setPayError] = useState('');

  const lines = run.lines || [];
  const totals = useMemo(() => runTotals(run), [run]);
  const label = labelOf(run);
  const draft = run.status === 'DRAFT';
  const toPay = lines.filter(l => +l.payable > 0);
  const canSlip = run.status === 'APPROVED' || run.status === 'PAID';

  function toggle(l) {
    setOpen(s => { const n = new Set(s); if (n.has(l.employeeId)) n.delete(l.employeeId); else n.add(l.employeeId); return n; });
    setDrafts(d => (d[l.employeeId] ? d : { ...d, [l.employeeId]: lineDraft(l) }));
  }
  const setDraft = (id, k, v) => setDrafts(d => ({ ...d, [id]: { ...d[id], [k]: v } }));

  async function act(kind, fn, done, failed) {
    if (busy) return false;
    setBusy(kind);
    let ok = false;
    try { const res = await fn(); await onChanged(res, run.id); toast.success(done); ok = true; }
    catch (e) { toast.error(failed, e); }
    setBusy('');
    return ok;
  }

  async function saveLine(l) {
    const d = drafts[l.employeeId];
    if (!d) return;
    const outstanding = l.advanceOutstanding ?? l.outstandingAdvance;
    if (outstanding != null && money(d.advanceRecovery) > +outstanding) { toast.error(`Advance recovery cannot be more than the ${fmtMoney(outstanding)} still outstanding`); return; }
    const ok = await act(`line:${l.employeeId}`, () => payrollAPI.updateLine(run.id, l.employeeId, { ...d, version: run.version }), `${l.employeeName}’s line updated`, 'Could not save this line');
    if (ok) setDrafts(x => { const n = { ...x }; delete n[l.employeeId]; return n; });
  }

  async function slip(l) {
    if (busy) return;
    setBusy(`pdf:${l.employeeId}`);
    try { await openPayslipPdf(run.id, l.employeeId, { filename: slipName(label, l.employeeName) }); }
    catch (e) { toast.error('Could not get the payslip', e); }
    setBusy('');
  }

  async function runConfirm() {
    const kind = confirm;
    if (kind === 'approve') await act('approve', () => payrollAPI.approve(run.id), `Payroll for ${label} approved`, 'Could not approve the payroll');
    else if (kind === 'reopen') await act('reopen', () => payrollAPI.reopen(run.id), `Payroll for ${label} reopened as a draft`, 'Could not reopen the payroll');
    else if (kind === 'delete') {
      if (busy) return;
      setBusy('delete');
      try { await payrollAPI.remove(run.id); toast.success(`Draft payroll for ${label} deleted`); onDeleted(run.id); }
      catch (e) { toast.error('Could not delete the draft', e); }
      setBusy('');
    }
  }

  async function submitPay() {
    if (!pay.date) { setPayError('Pick the payment date'); return; }
    const ok = await act('pay', () => payrollAPI.pay(run.id, pay), 'Salaries recorded and added to Transactions', 'Could not record the salaries. Nothing was saved');
    if (ok) setPay(null);
  }

  const CONFIRMS = {
    approve: { title: `Approve payroll for ${label}?`, label: 'Approve payroll', danger: false, message: `Approving locks every figure: ${fmtMoney(totals.net)} net for ${lines.length} ${lines.length === 1 ? 'person' : 'people'}. Bonuses, deductions and attendance changes no longer affect this run unless you reopen it. Nothing is paid yet.` },
    reopen: { title: 'Reopen as a draft?', label: 'Reopen', danger: false, message: 'The figures unlock so you can edit and recalculate them. You will need to approve the payroll again before paying.' },
    delete: { title: 'Delete this draft?', label: 'Delete draft', danger: true, message: `The draft payroll for ${label} and any bonuses or deductions typed into it are removed. Attendance and leave are not touched, and you can start it again.` },
  };
  const c = CONFIRMS[confirm] || {};
  const menu = [draft && { label: 'Delete draft', icon: Trash2, danger: true, onClick: () => setConfirm('delete') }].filter(Boolean);

  return (
    <>
      <div className="hr-head-row">
        <button type="button" className="mac-btn mac-btn-ghost" onClick={onBack}><ArrowLeft size={15} /> All payroll runs</button>
        <div className="hr-actions">
          {draft && <button type="button" className="mac-btn mac-btn-secondary" disabled={!!busy} onClick={() => act('recalc', () => payrollAPI.recalculate(run.id), 'Recalculated from attendance, leave and advances', 'Could not recalculate')}>
            <RefreshCw size={15} /> {busy === 'recalc' ? 'Recalculating…' : 'Recalculate'}</button>}
          {draft && <button type="button" className="mac-btn mac-btn-primary" disabled={!!busy || lines.length === 0} onClick={() => setConfirm('approve')}><Lock size={15} /> Approve</button>}
          {run.status === 'APPROVED' && <button type="button" className="mac-btn mac-btn-secondary" disabled={!!busy} onClick={() => setConfirm('reopen')}><Undo2 size={15} /> Reopen</button>}
          {run.status === 'APPROVED' && <button type="button" className="mac-btn mac-btn-primary" disabled={!!busy} onClick={() => { setPay({ date: todayLocal(), method: 'Bank Transfer', account: PAID_FROM[0] }); setPayError(''); }}><Banknote size={15} /> Pay salaries</button>}
          {menu.length > 0 && <RowMenu items={menu} label="More actions" />}
        </div>
      </div>

      <section className="mac-card hr-card">
        <div className="hr-head-row">
          <div>
            <h2 className="section-title">Payroll for {label}</h2>
            <p className="hr-note">
              {draft ? 'Draft — check each line, add bonuses or deductions, then approve.'
                : run.status === 'APPROVED' ? `Approved${run.approvedBy ? ` by ${run.approvedBy}` : ''}${run.approvedAt ? ` on ${fmtDate(String(run.approvedAt).slice(0, 10))}` : ''} — the figures are locked and ready to pay.`
                : `Paid${run.paidAt ? ` on ${fmtDate(String(run.paidAt).slice(0, 10))}` : ''}.`}
            </p>
          </div>
          <Stepper status={run.status} />
        </div>
        {run.partialMonth && <Notice>{label} is not over yet. This run only counts attendance up to today — recalculate after the month ends before approving.</Notice>}
        {run.hasUntrackedDays === true && <Notice tone="info" icon={Info}>Some days in this month are before attendance started and are paid in full.</Notice>}
        {run.status === 'PAID' && <Notice tone="good" icon={CheckCircle2}>Salaries recorded and added to Transactions.</Notice>}
      </section>

      <StatTiles items={[
        { label: 'Gross', value: fmtMoney(totals.gross), sub: `${lines.length} ${lines.length === 1 ? 'person' : 'people'}`, icon: Wallet },
        { label: 'Deductions', value: fmtMoney(totals.unpaidDeduction + totals.otherDeduction), sub: `+ ${fmtMoney(totals.advanceRecovery)} advance recovery`, icon: FileText },
        { label: 'Net pay', value: fmtMoney(totals.net), sub: totals.bonus ? `Includes ${fmtMoney(totals.bonus)} bonus` : 'After deductions', icon: Banknote, tone: 'brand' },
        { label: run.status === 'PAID' ? 'Still payable' : 'Payable now', value: fmtMoney(totals.payable), sub: totals.alreadyPaid ? `${fmtMoney(totals.alreadyPaid)} already paid` : 'Nothing paid yet', icon: HandCoins, tone: totals.payable > 0 ? 'warn' : 'good' },
      ]} />

      {lines.length === 0 ? (
        <EmptyPanel icon={Wallet} title="Nobody is on this payroll" text="Payroll includes active employees on a monthly salary. Set a monthly salary on the Employees page, then recalculate." />
      ) : (
        <div className="mac-card table-wrap" tabIndex={0} role="region" aria-label={`Payroll lines for ${label} — scroll sideways for more columns`}>
          <table className="data-table hr-lines">
            <thead>
              <tr>
                <th className="hr-sticky">Employee</th>
                <th className="num">Payable days</th><th className="num">Unpaid days</th><th className="num">Gross</th><th className="num">Deductions</th>
                <th className="num">Advance recovery</th><th className="num">Bonus</th><th className="num">Net</th><th className="num">Already paid</th><th className="num">Payable</th>
                <th aria-label="Payslip" />
              </tr>
            </thead>
            <tbody>
              {lines.map(l => {
                const isOpen = open.has(l.employeeId);
                const d = drafts[l.employeeId] || lineDraft(l);
                const dirty = !sameDraft(d, lineDraft(l));
                const saving = busy === `line:${l.employeeId}`;
                const detailId = `pay-line-${l.employeeId}`;
                return (
                  <Fragment key={l.employeeId}>
                    <tr>
                      <td className="hr-sticky">
                        <div className="hr-person">
                          <button type="button" className="hr-expand" aria-expanded={isOpen} aria-controls={detailId} aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${l.employeeName}`} onClick={() => toggle(l)}><ChevronDown size={16} /></button>
                          <div><div className="cell-main">{l.employeeName}</div><div className="cell-sub">{l.empId || '—'}{l.note ? ' · has a note' : ''}</div></div>
                        </div>
                      </td>
                      <td className="num">{fmtNum(l.payableDays)} <span className="faint">/ {fmtNum(l.daysInMonth)}</span></td>
                      <td className="num">{+l.unpaidDays > 0 ? <span className="amount-out">{fmtNum(l.unpaidDays)}</span> : '0'}</td>
                      <td className="num">{fmtMoney(l.gross)}</td>
                      <td className="num">{lineDeductions(l) > 0 ? `−${fmtMoney(lineDeductions(l))}` : '—'}</td>
                      <td className="num">{+l.advanceRecovery > 0 ? `−${fmtMoney(l.advanceRecovery)}` : '—'}</td>
                      <td className="num">{+l.bonus > 0 ? `+${fmtMoney(l.bonus)}` : '—'}</td>
                      <td className="num"><span className="cell-main">{fmtMoney(l.net)}</span></td>
                      <td className="num">{+l.alreadyPaid > 0 ? fmtMoney(l.alreadyPaid) : '—'}</td>
                      <td className="num">{+l.payable > 0 ? <span className="cell-main">{fmtMoney(l.payable)}</span> : <span className="amount-in">Paid</span>}</td>
                      <td>
                        <button type="button" className="icon-btn" disabled={!canSlip || busy === `pdf:${l.employeeId}`} onClick={() => slip(l)}
                          aria-label={`Payslip PDF for ${l.employeeName}`} title={canSlip ? 'Download payslip PDF' : 'Payslips are available once the payroll is approved'}><Download size={16} /></button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={11} style={{ padding: 0 }}>
                          <div id={detailId} className={`hr-line-detail ${draft ? '' : 'single'}`}>
                            <div>
                              <h4>Attendance in {label}</h4>
                              <AttendanceBreakdown line={l} />
                              <p className="hr-note" style={{ marginTop: 10 }}>
                                {fmtMoney(l.monthlySalary ?? l.gross)} ÷ {fmtNum(l.daysInMonth)} days × {fmtNum(l.unpaidDays)} unpaid = {fmtMoney(l.unpaidDeduction)} deducted
                              </p>
                              {!draft && l.note && <p className="hr-note">Note: {l.note}</p>}
                            </div>
                            {draft && (
                              <form onSubmit={e => { e.preventDefault(); saveLine(l); }} noValidate>
                                <h4>Adjust this line</h4>
                                <FormGrid cols={3}>
                                  <Field label="Bonus (₹)">
                                    <NumInput className="mac-input" value={d.bonus} onChange={v => setDraft(l.employeeId, 'bonus', v)} placeholder="0" />
                                  </Field>
                                  <Field label="Other deduction (₹)">
                                    <NumInput className="mac-input" value={d.otherDeduction} onChange={v => setDraft(l.employeeId, 'otherDeduction', v)} placeholder="0" />
                                  </Field>
                                  <Field label="Advance recovery (₹)" hint="Cannot be more than the advance still outstanding">
                                    <NumInput className="mac-input" value={d.advanceRecovery} onChange={v => setDraft(l.employeeId, 'advanceRecovery', v)} placeholder="0" />
                                  </Field>
                                  <Field label="Note" span={3}>
                                    <input className="mac-input" value={d.note} onChange={e => setDraft(l.employeeId, 'note', e.target.value)} placeholder="Shown on the payslip, e.g. Diwali bonus" />
                                  </Field>
                                </FormGrid>
                                <div className="hr-actions" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                                  {dirty && <button type="button" className="mac-btn mac-btn-secondary" disabled={saving} onClick={() => setDrafts(x => ({ ...x, [l.employeeId]: lineDraft(l) }))}>Discard</button>}
                                  <button type="submit" className="mac-btn mac-btn-primary" disabled={!dirty || !!busy}>{saving ? 'Saving…' : 'Save line'}</button>
                                </div>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="hr-sticky">Total</td><td /><td />
                <td className="num">{fmtMoney(totals.gross)}</td>
                <td className="num">{fmtMoney(totals.unpaidDeduction + totals.otherDeduction)}</td>
                <td className="num">{fmtMoney(totals.advanceRecovery)}</td>
                <td className="num">{fmtMoney(totals.bonus)}</td>
                <td className="num">{fmtMoney(totals.net)}</td>
                <td className="num">{fmtMoney(totals.alreadyPaid)}</td>
                <td className="num">{fmtMoney(totals.payable)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Modal isOpen={!!pay} onClose={() => { if (busy !== 'pay') setPay(null); }} title={`Pay salaries — ${label}`} size="md"
        footer={pay && <>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setPay(null)} disabled={busy === 'pay'}>Cancel</button>
          <button type="submit" form="payroll-pay-form" className="mac-btn mac-btn-primary" disabled={!!busy}>
            {busy === 'pay' ? 'Recording…' : toPay.length ? `Record ${fmtMoney(totals.payable)} as paid` : 'Mark as paid'}
          </button>
        </>}>
        {pay && (
          <form id="payroll-pay-form" onSubmit={e => { e.preventDefault(); submitPay(); }} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FormGrid cols={3}>
              <Field label="Payment date" required error={payError}>
                <input className="mac-input" type="date" value={pay.date} onChange={e => { setPay(p => ({ ...p, date: e.target.value })); setPayError(''); }} />
              </Field>
              <Field label="Method">
                <select className="mac-select" value={pay.method} onChange={e => setPay(p => ({ ...p, method: e.target.value }))}>{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}</select>
              </Field>
              <Field label="Paid from">
                <select className="mac-select" value={pay.account} onChange={e => setPay(p => ({ ...p, account: e.target.value }))}>{PAID_FROM.map(a => <option key={a}>{a}</option>)}</select>
              </Field>
            </FormGrid>
            <div className="hr-total"><span>Total for {toPay.length} {toPay.length === 1 ? 'person' : 'people'}</span><b>{fmtMoney(totals.payable)}</b></div>
            {toPay.length > 0 ? (
              <div className="hr-pay-list" tabIndex={0} role="region" aria-label="Who gets what">
                {toPay.map(l => <div key={l.employeeId}><span>{l.employeeName}</span><span className="cell-main tabular">{fmtMoney(l.payable)}</span></div>)}
              </div>
            ) : <Notice tone="info" icon={Info}>Everyone was already paid for {label}. This only marks the payroll as paid.</Notice>}
            <p className="hr-note">This records one salary payment per person and adds each as an expense (Employee Salary) to Transactions, takes the advance recoveries off what they owe, and marks the payroll as paid. It does not move any money — make the transfers yourself. A paid payroll cannot be reopened.</p>
          </form>
        )}
      </Modal>

      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={runConfirm}
        title={c.title} message={c.message} confirmLabel={c.label} danger={c.danger !== false} />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════
// Partner: advances
// ═════════════════════════════════════════════════════════════════
const blankAdvance = empId => ({ employeeId: empId ? String(empId) : '', amount: '', date: todayLocal(), method: 'Bank Transfer', account: PAID_FROM[0], recoverPerMonth: '', note: '' });

function AdvancesTab() {
  const toast = useToast();
  const [emps, setEmps] = useState([]);
  const [byEmp, setByEmp] = useState({});       // employeeId → [advance]
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);         // { employeeId, advance }

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setLoadError(null); }
    try {
      const people = (await employeesDB.getAll()).filter(e => e.status === 'Active');
      const settled = await Promise.allSettled(people.map(e => advancesAPI.list(e.id)));
      const failed = settled.find(s => s.status === 'rejected');
      if (people.length && settled.every(s => s.status === 'rejected')) throw failed.reason;
      if (failed) console.error(failed.reason);
      const map = {};
      settled.forEach((s, i) => { map[people[i].id] = s.status === 'fulfilled' ? s.value : []; });
      setEmps(people); setByEmp(map); setLoadError(null);
    } catch (e) { console.error(e); if (!quiet) setLoadError(e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const perEmp = useMemo(() => emps.map(e => {
    const list = byEmp[e.id] || [];
    const sum = k => list.reduce((s, a) => s + (+a[k] || 0), 0);
    return { emp: e, count: list.length, given: sum('amount'), recovered: sum('recovered'), outstanding: sum('outstanding'), perMonth: list.filter(a => +a.outstanding > 0).reduce((s, a) => s + (+a.recoverPerMonth || 0), 0) };
  }).filter(r => r.count > 0), [emps, byEmp]);
  const history = useMemo(() => emps.flatMap(e => (byEmp[e.id] || []).map(a => ({ ...a, employeeId: e.id, employeeName: e.name })))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))), [emps, byEmp]);
  const outstanding = perEmp.reduce((s, r) => s + r.outstanding, 0);

  const openForm = empId => { setForm(blankAdvance(empId)); setErrors({}); };
  const setField = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(er => (er[k] ? { ...er, [k]: undefined } : er)); };

  async function save() {
    if (saving || !form) return;
    const er = {};
    const emp = emps.find(e => String(e.id) === form.employeeId);
    if (!emp) er.employeeId = 'Choose who gets the advance';
    if (!(+form.amount > 0)) er.amount = 'Enter an amount greater than 0';
    if (!form.date) er.date = 'Pick the date';
    if (form.recoverPerMonth !== '' && !(+form.recoverPerMonth >= 0)) er.recoverPerMonth = 'Enter a number';
    else if (+form.recoverPerMonth > +form.amount) er.recoverPerMonth = 'Cannot be more than the advance';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      await advancesAPI.give(emp.id, form);
      toast.success(`Advance of ${fmtMoney(form.amount)} to ${emp.name} recorded and added to Transactions`);
      setForm(null);
      load({ quiet: true });
    } catch (e) { toast.error('Could not record the advance. Nothing was saved', e); }
    setSaving(false);
  }

  async function remove() {
    const { employeeId, advance } = del;
    try {
      await advancesAPI.remove(employeeId, advance.id);
      setByEmp(m => ({ ...m, [employeeId]: (m[employeeId] || []).filter(a => a.id !== advance.id) }));
      toast.success('Advance deleted');
    } catch (e) { toast.error('Could not delete the advance', e); }
  }

  if (loading) return <SkeletonRows rows={5} />;
  if (loadError) return <ErrorPanel title="Could not load advances" error={loadError} onRetry={load} />;
  const giveBtn = <button type="button" className="mac-btn mac-btn-primary" onClick={() => openForm()} disabled={emps.length === 0}><Plus size={15} /> Give advance</button>;
  return (
    <>
      <div className="hr-head-row">
        <p className="hr-note" style={{ flex: 1, minWidth: 200 }}>
          {outstanding > 0 ? `${fmtMoney(outstanding)} is still to be recovered. Each payroll takes the monthly amount off the salary until an advance is cleared.` : 'Money given ahead of salary, recovered a little each month through payroll.'}
        </p>
        {giveBtn}
      </div>

      {history.length === 0 ? <EmptyPanel icon={HandCoins} title="No advances yet" text="Give an advance and choose how much to take back from each month’s salary." action={giveBtn} />
        : (
          <>
            <h2 className="section-title">Outstanding by employee</h2>
            <div className="mac-card table-wrap">
              <table className="data-table">
                <thead><tr><th>Employee</th><th className="num">Given</th><th className="num">Recovered</th><th className="num">Outstanding</th><th className="num">Per month</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {perEmp.map(r => (
                    <tr key={r.emp.id}>
                      <td><div className="hr-person"><Avatar name={r.emp.name} /><div><div className="cell-main">{r.emp.name}</div><div className="cell-sub">{r.count} advance{r.count === 1 ? '' : 's'}</div></div></div></td>
                      <td className="num">{fmtMoney(r.given)}</td>
                      <td className="num">{fmtMoney(r.recovered)}</td>
                      <td className="num">{r.outstanding > 0 ? <span className="amount-out">{fmtMoney(r.outstanding)}</span> : <span className="amount-in">Cleared</span>}</td>
                      <td className="num">{r.perMonth > 0 ? fmtMoney(r.perMonth) : '—'}</td>
                      <td><div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" className="mac-btn mac-btn-secondary" onClick={() => openForm(r.emp.id)}>Give more</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="section-title">History</h2>
            <div className="mac-card table-wrap">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Employee</th><th className="num">Amount</th><th className="num">Per month</th><th className="num">Recovered</th><th className="num">Outstanding</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {history.map(a => (
                    <tr key={`${a.employeeId}-${a.id}`}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.date)}</td>
                      <td><div className="cell-main">{a.employeeName}</div>{a.note && <div className="cell-sub">{a.note}</div>}</td>
                      <td className="num">{fmtMoney(a.amount)}</td>
                      <td className="num">{+a.recoverPerMonth > 0 ? fmtMoney(a.recoverPerMonth) : '—'}</td>
                      <td className="num">{fmtMoney(a.recovered)}</td>
                      <td className="num">{+a.outstanding > 0 ? fmtMoney(a.outstanding) : <span className="amount-in">Cleared</span>}</td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          {!(+a.recovered > 0) && <RowMenu label={`Actions for the advance to ${a.employeeName}`} items={[{ label: 'Delete', icon: Trash2, danger: true, onClick: () => setDel({ employeeId: a.employeeId, advance: a }) }]} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

      <Modal isOpen={!!form} onClose={() => { if (!saving) setForm(null); }} title="Give advance" size="md"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
          <button type="submit" form="advance-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Record advance'}</button>
        </>}>
        {form && (
          <form id="advance-form" onSubmit={e => { e.preventDefault(); save(); }} noValidate>
            <FormGrid>
              <Field label="Employee" required error={errors.employeeId} span={2}>
                <select className="mac-select" value={form.employeeId} onChange={e => setField('employeeId', e.target.value)}>
                  <option value="">Choose…</option>
                  {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </Field>
              <Field label="Amount (₹)" required error={errors.amount}>
                <NumInput className="mac-input" value={form.amount} onChange={v => setField('amount', v)} placeholder="0" />
              </Field>
              <Field label="Recover per month (₹)" error={errors.recoverPerMonth} hint="Taken from each payroll until cleared. Leave empty to decide in each payroll.">
                <NumInput className="mac-input" value={form.recoverPerMonth} onChange={v => setField('recoverPerMonth', v)} placeholder="0" />
              </Field>
              <Field label="Date given" required error={errors.date}>
                <input className="mac-input" type="date" value={form.date} onChange={e => setField('date', e.target.value)} />
              </Field>
              <Field label="Method">
                <select className="mac-select" value={form.method} onChange={e => setField('method', e.target.value)}>{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}</select>
              </Field>
              <Field label="Paid from">
                <select className="mac-select" value={form.account} onChange={e => setField('account', e.target.value)}>{PAID_FROM.map(a => <option key={a}>{a}</option>)}</select>
              </Field>
              <Field label="Note">
                <input className="mac-input" value={form.note} onChange={e => setField('note', e.target.value)} placeholder="Optional" />
              </Field>
            </FormGrid>
            <p className="hr-note" style={{ marginTop: 14 }}>Saving also adds an expense (Salary advance) to Transactions.</p>
          </form>
        )}
      </Modal>

      <ConfirmDialog isOpen={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title="Delete advance" message={del ? `Delete the ${fmtMoney(del.advance.amount)} advance to ${emps.find(e => e.id === del.employeeId)?.name || 'this employee'}? Nothing has been recovered from it yet.` : ''} />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════
// Partner: runs list + routing between list / run / advances
// ═════════════════════════════════════════════════════════════════
function TeamPayroll() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const openId = params.get('run');
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState('runs');
  const [start, setStart] = useState(null);       // { month }
  const [startError, setStartError] = useState('');
  const [saving, setSaving] = useState(false);

  const sortRuns = list => [...list].sort((a, b) => String(b.month).localeCompare(String(a.month)));
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setLoadError(null); }
    try { setRuns(sortRuns(await payrollAPI.runs())); setLoadError(null); }
    catch (e) { console.error(e); if (!quiet) setLoadError(e); else throw e; }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openRun = id => setParams(id ? { run: String(id) } : {});
  // A write answers with the updated run; when it does not, read the list again.
  const applyRun = useCallback(async res => {
    if (res && typeof res === 'object' && res.id != null && Array.isArray(res.lines)) {
      setRuns(rs => sortRuns(rs.some(r => r.id === res.id) ? rs.map(r => (r.id === res.id ? res : r)) : [res, ...rs]));
    } else {
      try { await load({ quiet: true }); } catch (e) { console.error(e); }
    }
  }, [load]);

  const run = openId ? runs.find(r => String(r.id) === openId) : null;
  const nextMonth = lastCompletedMonth();
  const hasNext = runs.some(r => r.month === nextMonth);

  async function startRun() {
    if (saving || !start) return;
    if (!/^\d{4}-\d{2}$/.test(start.month)) { setStartError('Pick a month'); return; }
    if (start.month > currentMonth()) { setStartError('This month has not started yet'); return; }
    const existing = runs.find(r => r.month === start.month);
    if (existing) { setStart(null); openRun(existing.id); toast.info(`Payroll for ${labelOf(existing)} already exists — opened it`); return; }
    setSaving(true);
    try {
      const created = await payrollAPI.start(start.month);
      await applyRun(created);
      toast.success(`Draft payroll for ${monthLabel(start.month)} is ready to check`);
      setStart(null);
      if (created?.id != null) openRun(created.id);
    } catch (e) { toast.error('Could not start the payroll', e); }
    setSaving(false);
  }

  const startBtn = (
    <button type="button" className="mac-btn mac-btn-primary" onClick={() => { setStart({ month: nextMonth }); setStartError(''); }}>
      <Plus size={15} /> {hasNext ? 'Start payroll' : `Start payroll for ${monthLabel(nextMonth)}`}
    </button>
  );
  const subtitle = run ? `${labelOf(run)} · ${runMeta(run.status).label}` : loading ? 'Loading…' : loadError ? 'Could not load' : 'Salaries worked out from attendance, leave and advances';

  return (
    <div>
      <Header title="Payroll" subtitle={subtitle} actions={!run && !openId && tab === 'runs' && !loading && !loadError ? startBtn : null} />
      <div className="page-body">
        {loading ? <SkeletonRows rows={6} />
          : loadError ? <ErrorPanel title="Could not load payroll" error={loadError} onRetry={load} />
          : openId ? (run
            ? <RunView key={run.id} run={run} onBack={() => openRun(null)} onChanged={applyRun} onDeleted={id => { setRuns(rs => rs.filter(r => r.id !== id)); openRun(null); }} />
            : <EmptyPanel icon={FileText} title="This payroll run was not found" text="It may have been deleted." action={<button type="button" className="mac-btn mac-btn-secondary" onClick={() => openRun(null)}>All payroll runs</button>} />)
          : (
            <>
              <TabBar label="Payroll sections" value={tab} onChange={setTab} tabs={[['runs', 'Payroll runs'], ['advances', 'Advances']]} />
              {tab === 'advances' && <AdvancesTab />}
              {tab === 'runs' && (runs.length === 0 ? (
                <EmptyPanel icon={Wallet} title="No payroll yet" text="Start a payroll for a month: it works out each person’s pay from their attendance, leave and advances for you to check." action={startBtn} />
              ) : (
                <>
                  <div className="mac-card table-wrap only-desktop">
                    <table className="data-table">
                      <thead><tr><th>Month</th><th>Status</th><th className="num">People</th><th className="num">Net pay</th><th className="num">Still payable</th></tr></thead>
                      <tbody>
                        {runs.map(r => {
                          const t = runTotals(r);
                          return (
                            <tr key={r.id} className="clickable" tabIndex={0} onClick={() => openRun(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRun(r.id); } }}>
                              <td><div className="cell-main">{labelOf(r)}</div>{r.partialMonth && <div className="cell-sub">Month not over yet</div>}</td>
                              <td><RunBadge status={r.status} /></td>
                              <td className="num">{t.employees}</td>
                              <td className="num"><span className="cell-main">{fmtMoney(t.net)}</span></td>
                              <td className="num">{r.status === 'PAID' && !(t.payable > 0) ? <span className="amount-in">Paid</span> : fmtMoney(t.payable)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="only-mobile">
                    <div className="list-cards">
                      {runs.map(r => {
                        const t = runTotals(r);
                        return (
                          <button key={r.id} type="button" className="list-card" onClick={() => openRun(r.id)}>
                            <span className="hr-head-row"><span className="cell-main">{labelOf(r)}</span><RunBadge status={r.status} /></span>
                            <span className="hr-head-row"><span className="cell-sub">{t.employees} {t.employees === 1 ? 'person' : 'people'}</span><span className="cell-main">{fmtMoney(t.net)} net</span></span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ))}
            </>
          )}
      </div>

      <Modal isOpen={!!start} onClose={() => { if (!saving) setStart(null); }} title="Start payroll" size="sm"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setStart(null)} disabled={saving}>Cancel</button>
          <button type="submit" form="payroll-start-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Working it out…' : 'Create draft'}</button>
        </>}>
        {start && (
          <form id="payroll-start-form" onSubmit={e => { e.preventDefault(); startRun(); }} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Salary month" required error={startError} hint={`${monthLabel(nextMonth)} is the last month that is over`}>
              <input className="mac-input" type="month" value={start.month} max={currentMonth()} onChange={e => { setStart({ month: e.target.value }); setStartError(''); }} />
            </Field>
            {start.month === currentMonth() && <Notice>{monthLabel(start.month)} is not over yet, so the draft only counts attendance up to today.</Notice>}
            <p className="hr-note">This creates a draft for active employees on a monthly salary. Nothing is paid or locked until you approve it.</p>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default function Payroll() {
  const { isPartner } = useAuth();
  return isPartner ? <TeamPayroll /> : <MyPayslips />;
}
