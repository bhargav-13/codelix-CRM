import { Fragment, useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { NumInput } from '../lib/numInput';
import { PAYMENT_METHODS } from '../data/mockData';
import {
  useToast, Field, FormGrid, StatTiles, SkeletonRows, EmptyPanel, ErrorPanel, RowMenu, Avatar, fmtMoney, fmtDate, todayLocal,
} from '../components/ui/kit';
import {
  payrollAPI, openPayslipPdf, runMeta, RUN_STEPS, runTotals, lineDeductions,
  monthLabel, currentMonth, lastCompletedMonth, fmtNum,
} from '../lib/hr';
import { Notice, TabBar } from '../components/hr/parts';
import {
  ArrowLeft, Banknote, Check, CheckCircle2, ChevronDown, Download, Eye, FileText, HandCoins, Info, Lock, Plus, Receipt,
  RefreshCw, Trash2, Undo2, Wallet,
} from 'lucide-react';
import Kpis from '../components/crm/Kpis';
import codelixLogo from '../assets/codelix.svg';
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
function SlipRows({ rows, total, totalLabel, tone }) {
  return (
    <dl className={`slip-rows ${tone || ''}`}>
      {rows.filter(([, v], i) => i === 0 || money(v) !== 0).map(([k, v, hint]) => (
        <div key={k}><dt>{k}{hint && <small>{hint}</small>}</dt><dd>{tone === 'is-minus' && money(v) > 0 ? '−' : ''}{fmtMoney(v)}</dd></div>
      ))}
      <div className="sum"><dt>{totalLabel}</dt><dd>{tone === 'is-minus' && total > 0 ? '−' : ''}{fmtMoney(total)}</dd></div>
    </dl>
  );
}

export function PayslipView({ slip }) {
  const l = slip?.line || slip || {};
  const label = slip?.monthLabel || l.monthLabel || monthLabel(slip?.month || l.month);
  const paidAt = slip?.paidAt || l.paidAt;
  const salary = money(l.gross ?? l.monthlySalary);
  const days = +l.daysInMonth || 0;
  const perDay = days ? salary / days : 0;
  const earnings = [['Monthly salary', salary, days ? `${fmtMoney(Math.round(perDay))} a day × ${fmtNum(days)} days` : ''], ['Bonus', l.bonus]];
  const deductions = [
    ['Unpaid days', l.unpaidDeduction, +l.unpaidDays > 0 ? `${fmtNum(l.unpaidDays)} day${+l.unpaidDays === 1 ? '' : 's'} × ${fmtMoney(Math.round(perDay))}` : 'No unpaid day'],
    ['Other deductions', l.otherDeduction],
  ];
  const sum = rows => rows.reduce((t, [, v]) => t + money(v), 0);
  const earned = sum(earnings), cut = sum(deductions);
  const keep = earned > 0 ? Math.max(0, Math.min(100, ((earned - cut) / earned) * 100)) : 100;
  const leave = (+l.paidLeave || 0) + (+l.unpaidLeave || 0);
  const stats = [
    ['Paid days', fmtNum(l.payableDays), `of ${fmtNum(days)}`, 'good'],
    ['Unpaid days', fmtNum(l.unpaidDays), +l.unpaidDays > 0 ? 'not paid' : 'none', +l.unpaidDays > 0 ? 'bad' : ''],
    ['Present', fmtNum(l.present), 'days', ''],
    ['Half days', fmtNum(l.halfDays), 'half paid', ''],
    ['Absent', fmtNum(l.absent), 'days', +l.absent > 0 ? 'bad' : ''],
    ['Leave', fmtNum(leave), +l.unpaidLeave > 0 ? `${fmtNum(l.unpaidLeave)} unpaid` : 'all paid', ''],
    ['Late', fmtNum(l.lateCount), +l.lateCount === 1 ? 'time' : 'times', +l.lateCount > 0 ? 'warn' : ''],
  ];
  if (+l.notTrackedDays > 0) stats.push(['Not tracked', fmtNum(l.notTrackedDays), 'paid', '']);
  return (
    <div className="slip">
      <header className="slip-head">
        <div className="slip-brand">
          <img src={codelixLogo} alt="" width="30" height="42" />
          <div>
            <div className="slip-co">{slip?.companyName || 'Codelix IT Solutions'}</div>
            <div className="slip-kind">codelixitsolutions.com</div>
          </div>
        </div>
        <div className="slip-who">
          <strong className="slip-doc">PAYSLIP</strong>
          <span>{label}</span>
          <span>No. {[l.empId || 'EMP', slip?.month || l.month].filter(Boolean).join('/')}</span>
        </div>
      </header>

      <section className="slip-box">
        <h3>Employee</h3>
        <dl className="slip-facts">
          <div><dt>Name</dt><dd>{l.employeeName || '—'}</dd></div>
          <div><dt>Employee ID</dt><dd>{l.empId || '—'}</dd></div>
          <div><dt>Designation</dt><dd>{slip?.designation || '—'}</dd></div>
          <div><dt>Department</dt><dd>{slip?.department || '—'}</dd></div>
          <div><dt>Date of joining</dt><dd>{slip?.joiningDate ? fmtDate(slip.joiningDate) : '—'}</dd></div>
          <div><dt>Pay period</dt><dd>{label}</dd></div>
          <div><dt>Email</dt><dd>{slip?.employeeEmail || '—'}</dd></div>
          <div><dt>Mobile</dt><dd>{slip?.employeeMobile || '—'}</dd></div>
          <div><dt>Status</dt><dd><Badge color={paidAt ? 'green' : 'orange'}>{paidAt ? 'Paid' : 'Approved, not yet paid'}</Badge></dd></div>
          <div><dt>Paid on</dt><dd>{paidAt ? fmtDate(String(paidAt).slice(0, 10)) : '—'}</dd></div>
          <div className="wide"><dt>Paid to</dt><dd>{slip?.bankDetails || (slip?.upiId ? `UPI ${slip.upiId}` : '—')}</dd></div>
        </dl>
      </section>

      <section className="slip-net">
        <div>
          <span>Net pay</span>
          <b>{fmtMoney(l.net)}</b>
          <em>{fmtMoney(earned)} earned{cut > 0 ? ` − ${fmtMoney(cut)} deducted` : ', nothing deducted'}</em>
          {slip?.netInWords && <em className="slip-words">{slip.netInWords}</em>}
        </div>
        <div className="slip-net-bar" role="img" aria-label={`${Math.round(keep)}% of earnings paid out`}>
          <span style={{ width: `${keep}%` }} />
        </div>
        <div className="slip-net-key"><span><i className="keep" /> Paid out {Math.round(keep)}%</span>{cut > 0 && <span><i className="cut" /> Deducted {Math.round(100 - keep)}%</span>}</div>
      </section>

      <div className="slip-cols">
        <section className="slip-box"><h3>Earnings</h3><SlipRows rows={earnings} total={earned} totalLabel="Total earnings" /></section>
        <section className="slip-box"><h3>Deductions</h3><SlipRows rows={deductions} total={cut} totalLabel="Total deductions" tone="is-minus" /></section>
      </div>

      <section className="slip-box">
        <h3>Attendance this month</h3>
        <div className="slip-stats">
          {stats.map(([name, value, sub, tone]) => <div key={name} className={tone ? `is-${tone}` : ''}><strong>{value}</strong><span>{name}</span><em>{sub}</em></div>)}
        </div>
        {days > 0 && salary > 0 && (
          <p className="slip-math">{fmtMoney(salary)} ÷ {fmtNum(days)} days × {fmtNum(l.payableDays)} paid days = <b>{fmtMoney(salary - money(l.unpaidDeduction))}</b>{money(l.bonus) > 0 ? ` + ${fmtMoney(l.bonus)} bonus` : ''}{money(l.otherDeduction) > 0 ? ` − ${fmtMoney(l.otherDeduction)} other deductions` : ''}</p>
        )}
      </section>
      {l.note && <p className="slip-note"><strong>Note:</strong> {l.note}</p>}
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
              <Kpis cols={3} items={[
                { label: 'Latest payslip', value: fmtMoney(slips[0].net), icon: Banknote, tone: 'primary', sub: labelOf(slips[0]) },
                { label: `Received in ${String(slips[0].month).slice(0, 4)}`, value: fmtMoney(slips.filter(x => String(x.month).slice(0, 4) === String(slips[0].month).slice(0, 4)).reduce((t, x) => t + money(x.net), 0)), icon: Wallet, tone: 'good', sub: 'Net pay, all payslips this year' },
                { label: 'Payslips', value: slips.length, icon: Receipt, sub: slips.length > 1 ? `Since ${labelOf(slips[slips.length - 1])}` : 'Your first one' },
              ]} />
              <div className="slip-grid">
                {slips.map((x, i) => {
                  const prev = slips[i + 1];
                  const diff = prev ? money(x.net) - money(prev.net) : 0;
                  return (
                    <article key={x.runId} className="mac-card slip-card" role="button" tabIndex={0} onClick={() => openView(x)}
                      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openView(x); } }} aria-label={`Open the payslip for ${labelOf(x)}`}>
                      <header>
                        <span className="slip-card-month"><b>{labelOf(x).split(' ')[0].slice(0, 3)}</b>{String(x.month).slice(0, 4)}</span>
                        <div><h3>{labelOf(x)}</h3><p>{x.paidAt ? `Paid on ${fmtDate(String(x.paidAt).slice(0, 10))}` : 'Not paid yet'}</p></div>
                        <Badge color={x.paidAt ? 'green' : 'orange'}>{x.paidAt ? 'Paid' : 'Pending'}</Badge>
                      </header>
                      <div className="slip-card-net">
                        <span>Net pay</span>
                        <b>{fmtMoney(x.net)}</b>
                        {prev && diff !== 0 && <em className={diff > 0 ? 'up' : 'down'}>{diff > 0 ? '+' : '−'}{fmtMoney(Math.abs(diff))} vs {labelOf(prev).split(' ')[0]}</em>}
                        {prev && diff === 0 && <em>Same as {labelOf(prev).split(' ')[0]}</em>}
                      </div>
                      {(x.payableDays != null || x.unpaidDays != null) && (
                        <dl className="slip-card-facts">
                          {x.payableDays != null && <div><dt>Paid days</dt><dd>{fmtNum(x.payableDays)}</dd></div>}
                          {x.unpaidDays != null && <div><dt>Unpaid days</dt><dd>{fmtNum(x.unpaidDays)}</dd></div>}
                          {x.gross != null && <div><dt>Salary</dt><dd>{fmtMoney(x.gross)}</dd></div>}
                        </dl>
                      )}
                      <footer onClick={e => e.stopPropagation()}>
                        <button type="button" className="mac-btn mac-btn-secondary" onClick={() => openView(x)}><Eye size={15} /> View</button>
                        {pdfBtn(x)}
                      </footer>
                    </article>
                  );
                })}
              </div>
            </>
          )}
      </div>

      <Modal page back="My payslips" isOpen={!!view} onClose={() => setView(null)} title={view ? `Payslip for ${labelOf(view.item)}` : 'Payslip'} size="lg"
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
        { label: 'Deductions', value: fmtMoney(totals.unpaidDeduction + totals.otherDeduction), sub: 'Unpaid days and other deductions', icon: FileText },
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
                <th className="num">Bonus</th><th className="num">Net</th><th className="num">Already paid</th><th className="num">Payable</th>
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
            <p className="hr-note">This records one salary payment per person and adds each as an expense (Employee Salary) to Transactions, and marks the payroll as paid. It does not move any money — make the transfers yourself. A paid payroll cannot be reopened.</p>
          </form>
        )}
      </Modal>

      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={runConfirm}
        title={c.title} message={c.message} confirmLabel={c.label} danger={c.danger !== false} />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════
// Partner: runs list + routing between list and run
// ═════════════════════════════════════════════════════════════════
function TeamPayroll() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const openId = params.get('run');
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
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
  const subtitle = run ? `${labelOf(run)} · ${runMeta(run.status).label}` : loading ? 'Loading…' : loadError ? 'Could not load' : 'Salaries worked out from attendance and leave';

  return (
    <div>
      <Header title="Payroll" subtitle={subtitle} actions={!run && !openId && !loading && !loadError ? startBtn : null} />
      <div className="page-body">
        {loading ? <SkeletonRows rows={6} />
          : loadError ? <ErrorPanel title="Could not load payroll" error={loadError} onRetry={load} />
          : openId ? (run
            ? <RunView key={run.id} run={run} onBack={() => openRun(null)} onChanged={applyRun} onDeleted={id => { setRuns(rs => rs.filter(r => r.id !== id)); openRun(null); }} />
            : <EmptyPanel icon={FileText} title="This payroll run was not found" text="It may have been deleted." action={<button type="button" className="mac-btn mac-btn-secondary" onClick={() => openRun(null)}>All payroll runs</button>} />)
          : (
            <>
              {(runs.length === 0 ? (
                <EmptyPanel icon={Wallet} title="No payroll yet" text="Start a payroll for a month: it works out each person’s pay from their attendance and leave for you to check." action={startBtn} />
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
