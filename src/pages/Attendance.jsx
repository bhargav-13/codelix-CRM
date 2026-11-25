import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Tooltip } from '../components/ui/Tooltip';
import { useAuth } from '../contexts/AuthContext';
import {
  useToast, Drawer, Field, FormGrid, FormSection, SkeletonRows, EmptyPanel, ErrorPanel, RowMenu, Avatar, fmtDate,
} from '../components/ui/kit';
import {
  attendanceAPI, holidaysAPI, policyAPI, correctionsAPI, leaveMeta,
  statusMeta, LEGEND, WEEKDAYS, WEEKDAY_LABEL, MONTH_NAMES,
  fmtMinutes, fmtNum, fmtTime, toHM, fmtClock, fmtLongDate, fmtDayLong, dateIST, todayIST, addDays,
  currentMonth, monthLabel, monthDates, weekdayOf, dayOfMonth, daySummary,
} from '../lib/hr';
import { MonthNav, Notice, TabBar } from '../components/hr/parts';
import { AlertTriangle, CalendarOff, CheckCircle2, Edit2, Info, Plus, RefreshCw, ScanFace, Trash2, Users } from 'lucide-react';
import './HR.css';

const STATUS_BADGE = { present: 'green', late: 'orange', half: 'purple', absent: 'red', leave: 'blue', holiday: 'gray', off: 'gray', none: 'gray', untracked: 'gray' };
const StatusBadge = ({ status }) => { const m = statusMeta(status); return <Badge color={STATUS_BADGE[m.tone] || 'gray'}>{m.label}</Badge>; };

function Legend() {
  return (
    <div className="hr-legend" aria-label="What the colours mean">
      {LEGEND.map(s => { const m = statusMeta(s); return <span key={s}><span className={`hr-swatch hr-s-${m.tone}`} aria-hidden="true">{m.short}</span>{m.legend || m.label}</span>; })}
    </div>
  );
}

// The raw scans the office device recorded on one day, oldest first.
function DayScans({ load, date }) {
  const [state, setState] = useState({ date: null, scans: null, error: false });
  useEffect(() => {
    let live = true;
    load(date).then(scans => { if (live) setState({ date, scans, error: false }); })
      .catch(e => { console.error(e); if (live) setState({ date, scans: null, error: true }); });
    return () => { live = false; };
  }, [load, date]);
  if (state.date !== date) return <p className="hr-note">Loading scans…</p>;
  if (state.error) return <p className="hr-note">The device scans could not be loaded.</p>;
  if (!state.scans.length) return <p className="hr-note">The device recorded no scans this day.</p>;
  return (
    <p className="hr-note" style={{ margin: 0 }}>
      <strong>Device scans:</strong> {state.scans.map(x => fmtTime(x.time)).join(' · ')}
    </p>
  );
}

const ReqBadge = ({ status }) => { const m = leaveMeta(status); return <Badge color={m.color}>{m.label}</Badge>; };
const reqTimes = r => `In ${r.punchIn || 'as recorded'} · Out ${r.punchOut || 'as recorded'}`;

// Everything known about one day, as a definition list (calendar panel + correction drawer)
function DayFacts({ day, holidayName }) {
  if (!day) return <p className="hr-note">Nothing is recorded for this day.</p>;
  return (
    <>
      <dl className="kv">
        <dt>Status</dt><dd><StatusBadge status={day.status} /></dd>
        {holidayName && <><dt>Holiday</dt><dd>{holidayName}</dd></>}
        <dt>Punch in</dt><dd>{fmtTime(day.punchIn)}</dd>
        <dt>Punch out</dt><dd>{fmtTime(day.punchOut)}</dd>
        <dt>Worked</dt><dd>{day.punchIn ? fmtMinutes(day.workedMinutes) : '—'}</dd>
      </dl>
      {day.status === 'NOT_TRACKED' && <Notice tone="info" icon={Info}>This day is before attendance started here, so it is paid in full and never counts as an absence.</Notice>}
      {day.missingPunchOut && <Notice>No punch out was recorded, so this day counts as a half day. Ask a partner to correct it if you worked the full day.</Notice>}
      {day.corrected && <Notice tone="info" icon={Edit2}>Corrected{day.correctedBy ? ` by ${day.correctedBy}` : ''}{day.correctionNote ? ` — “${day.correctionNote}”` : ''}</Notice>}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════
// Employee: today + my month
// ═════════════════════════════════════════════════════════════════
const OFF_REASON = {
  HOLIDAY: 'Today is a holiday.',
  WEEKLY_OFF: 'Today is a weekly off.',
  ON_LEAVE: 'You are on approved leave today.',
};

function TodayCard({ today, now, policy, holidayName }) {
  const clock = new Date(now);
  const live = today.punchIn && !today.punchOut ? Math.max(+today.workedMinutes || 0, Math.floor((now - new Date(today.punchIn).getTime()) / 60000)) : +today.workedMinutes || 0;
  const halfBelow = (+policy?.halfDayBelowHours || 0) * 60;
  const reason = today.reason
    || (today.status === 'HOLIDAY' && holidayName ? `Today is a holiday (${holidayName}).` : OFF_REASON[today.status]) || '';
  const kind = today.punchIn && today.punchOut ? 'done' : today.punchIn ? 'in' : reason ? 'off' : 'waiting';
  return (
    <section className="mac-card hr-today" aria-label="Today">
      <div>
        <div className="hr-clock" aria-label="Office time">{fmtClock(clock)}</div>
        <div className="hr-clock-date">{fmtLongDate(clock)}{policy?.officeStart ? ` · Office hours ${fmtTime(policy.officeStart)} – ${fmtTime(policy.officeEnd)}` : ''}</div>
        <div className="hr-today-facts">
          <div className="hr-fact"><span>Status</span><span><StatusBadge status={today.status} /></span></div>
          <div className="hr-fact"><span>In</span><span>{fmtTime(today.punchIn)}</span></div>
          <div className="hr-fact"><span>Out</span><span>{fmtTime(today.punchOut)}</span></div>
          <div className="hr-fact"><span>{today.punchOut || !today.punchIn ? 'Worked' : 'Worked so far'}</span><span>{today.punchIn ? fmtMinutes(live) : '—'}</span></div>
        </div>
      </div>
      <div className="hr-today-side">
        <div className={`hr-device-state hr-device-${kind}`} role="status">
          {kind === 'done' ? <CheckCircle2 size={26} aria-hidden="true" /> : <ScanFace size={26} aria-hidden="true" />}
          <strong>
            {kind === 'done' ? 'Done for the day'
              : kind === 'in' ? `In since ${fmtTime(today.punchIn)}`
              : kind === 'off' ? 'No work today'
              : 'Not scanned in yet'}
          </strong>
        </div>
        <p className="hr-note" style={{ textAlign: 'center' }}>
          {kind === 'done' ? `${fmtTime(today.punchIn)} – ${fmtTime(today.punchOut)} · ${fmtMinutes(today.workedMinutes)}`
            : kind === 'in' ? 'Scan on the office device again when you leave — your last scan of the day is your out time.'
            : kind === 'off' ? 'Nothing to scan today.'
            : 'Scan your face on the office device when you arrive. It shows up here within a minute or two.'}
        </p>
      </div>
      {(reason || today.status === 'LATE' || today.status === 'HALF_DAY' || (kind === 'in' && halfBelow > 0 && live < halfBelow)) && (
        <div className="hr-today-notes">
          {reason && <Notice tone="info" icon={Info}>{reason}</Notice>}
          {today.status === 'LATE' && <Notice>You are marked late today{policy?.officeStart ? ` — office starts at ${fmtTime(policy.officeStart)} and anything more than ${policy.lateAfterMinutes} minutes after that counts as late` : ''}.</Notice>}
          {today.status === 'HALF_DAY' && <Notice>Today counts as a half day{halfBelow > 0 && today.punchOut ? ` — fewer than ${fmtNum(policy.halfDayBelowHours)} hours were worked` : ''}.</Notice>}
          {kind === 'in' && today.status !== 'HALF_DAY' && halfBelow > 0 && live < halfBelow && (
            <Notice tone="info" icon={Info}>You have worked {fmtMinutes(live)} so far. Leaving before {fmtNum(policy.halfDayBelowHours)} hours counts as a half day.</Notice>
          )}
        </div>
      )}
    </section>
  );
}

function MonthCalendar({ month, days, today, holidayNames, selected, onSelect }) {
  const dates = monthDates(month);
  const byDate = useMemo(() => new Map((days || []).map(d => [d.date, d])), [days]);
  const lead = WEEKDAYS.indexOf(weekdayOf(dates[0]));
  return (
    <div className="hr-cal" role="group" aria-label={`Attendance for ${monthLabel(month)}`}>
      {WEEKDAYS.map(w => <div key={w} className="hr-cal-dow" aria-hidden="true">{WEEKDAY_LABEL[w]}</div>)}
      {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} aria-hidden="true" />)}
      {dates.map(date => {
        const day = byDate.get(date);
        const m = statusMeta(day?.status || 'NOT_MARKED');
        const tag = day?.punchIn ? fmtTime(day.punchIn) : day?.status === 'HOLIDAY' ? (holidayNames.get(date) || m.label) : day?.status === 'NOT_MARKED' || !day ? '' : m.label;
        return (
          <button key={date} type="button" className={`hr-cal-day hr-s-${m.tone} ${date === today ? 'is-today' : ''}`}
            aria-pressed={selected === date} onClick={() => onSelect(date)}
            aria-label={`${fmtDayLong(date)}: ${m.label}${day?.punchIn ? `, in ${fmtTime(day.punchIn)}` : ''}${day?.punchOut ? `, out ${fmtTime(day.punchOut)}` : ''}`}>
            <span className="hr-cal-num">{dayOfMonth(date)}</span>
            {tag && <span className="hr-cal-tag">{tag}</span>}
            {(day?.corrected || day?.missingPunchOut) && <span className="hr-cal-flag" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

function MonthSummary({ summary }) {
  const s = summary || {};
  const items = [
    ['Present', fmtNum(s.present)], ['Late', fmtNum(s.late)], ['Half days', fmtNum(s.halfDays)], ['Absent', fmtNum(s.absent)],
    ['Leave', fmtNum((+s.paidLeave || 0) + (+s.unpaidLeave || 0))], ['Worked', fmtMinutes(s.workedMinutes)],
  ];
  if (+s.notTracked > 0) items.push(['Not tracked', fmtNum(s.notTracked)]);
  return <div className="hr-sum">{items.map(([l, v]) => <div key={l}><span className="hr-sum-v">{v}</span><span className="hr-sum-l">{l}</span></div>)}</div>;
}

function MyAttendance() {
  const [today, setToday] = useState(null);
  const [todayError, setTodayError] = useState(null);
  const [clock, setClock] = useState({ offset: 0, now: 0 });   // server time = device time + offset
  const [policy, setPolicy] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState(null);
  const [monthLoading, setMonthLoading] = useState(true);
  const [monthError, setMonthError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [requests, setRequests] = useState([]);
  const [ask, setAsk] = useState(null);            // { date, punchIn, punchOut, reason }
  const [askErrors, setAskErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [cancelId, setCancelId] = useState(null);
  const toast = useToast();
  const monthRef = useRef(month);
  useEffect(() => { monthRef.current = month; });

  const loadToday = useCallback(async () => {
    try {
      const t = await attendanceAPI.today();
      const server = t?.serverTime ? new Date(t.serverTime).getTime() : NaN;
      const offset = Number.isNaN(server) ? 0 : server - Date.now();
      setToday(t); setTodayError(null);
      setClock({ offset, now: Date.now() + offset });
    } catch (e) { console.error(e); setTodayError(e); }
  }, []);

  const loadMonth = useCallback(async (m, { quiet = false } = {}) => {
    if (!quiet) { setMonthLoading(true); setMonthError(null); }
    try {
      const res = await attendanceAPI.mine(m);
      if (monthRef.current !== m) return;
      setData(res); setMonthError(null);
    } catch (e) { console.error(e); if (monthRef.current === m && !quiet) setMonthError(e); }
    if (monthRef.current === m) setMonthLoading(false);
  }, []);

  useEffect(() => {
    loadToday();
    // Office hours and holiday names only add detail — the page works without them.
    policyAPI.get().then(setPolicy).catch(e => console.error(e));
  }, [loadToday]);
  useEffect(() => { loadMonth(month); }, [month, loadMonth]);
  useEffect(() => {
    let live = true;
    holidaysAPI.list(month.slice(0, 4)).then(h => { if (live) setHolidays(h); }).catch(e => console.error(e));
    return () => { live = false; };
  }, [month]);

  // The clock ticks from the server's time, not the device's.
  const offset = clock.offset;
  useEffect(() => {
    const id = setInterval(() => setClock(c => ({ ...c, now: Date.now() + offset })), 1000);
    return () => clearInterval(id);
  }, [offset]);
  // Scans arrive from the office device in the background: look again every minute.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') loadToday(); }, 60000);
    return () => clearInterval(id);
  }, [loadToday]);
  // Coming back to the tab (or past midnight) re-reads today from the server.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') loadToday(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [loadToday]);

  const loadRequests = useCallback(() => correctionsAPI.mine().then(setRequests).catch(e => console.error(e)), []);
  useEffect(() => { loadRequests(); }, [loadRequests]);
  const myScans = useCallback(date => attendanceAPI.myScans(date), []);

  const holidayNames = useMemo(() => new Map(holidays.map(h => [h.date, h.name])), [holidays]);
  const todayDate = today?.date || (clock.now ? dateIST(new Date(clock.now)) : null);
  const selDay = selected ? (data?.days || []).find(d => d.date === selected) : null;
  const openFor = date => requests.find(r => r.date === date && r.status === 'PENDING');
  const canAsk = date => !!todayDate && date <= todayDate && date >= addDays(todayDate, -45) && !selDay?.beforeJoining;

  function startAsk(day) {
    setAskErrors({});
    setAsk({ date: day.date, punchIn: toHM(day.punchIn) || '', punchOut: toHM(day.punchOut) || '', reason: '' });
  }

  async function sendAsk() {
    if (sending || !ask) return;
    const er = {};
    if (!ask.punchIn && !ask.punchOut) er.punchIn = 'Give the time you came in, the time you left, or both';
    if (ask.punchIn && ask.punchOut && ask.punchOut <= ask.punchIn) er.punchOut = 'Must be after the time you came in';
    if (!ask.reason.trim()) er.reason = 'Say what happened';
    setAskErrors(er);
    if (Object.keys(er).length) return;
    setSending(true);
    try {
      await correctionsAPI.create({ ...ask, reason: ask.reason.trim() });
      toast.success('Sent to the partners — you will get a notification when it is decided');
      setAsk(null);
      loadRequests();
    } catch (e) { toast.error('Could not send the request', e); }
    setSending(false);
  }

  async function cancelAsk(id) {
    try { await correctionsAPI.cancel(id); toast.success('Request withdrawn'); loadRequests(); }
    catch (e) { toast.error('Could not withdraw the request', e); }
    setCancelId(null);
  }

  return (
    <div>
      <Header title="Attendance" subtitle="Your scans from the office device, and your month" />
      <div className="page-body">
        {todayError && !today ? <ErrorPanel title="Could not load today’s attendance" error={todayError} onRetry={loadToday} />
          : !today ? <SkeletonRows rows={3} />
          : <TodayCard today={today} now={clock.now} policy={policy} holidayName={holidayNames.get(todayDate)} />}

        <section className="mac-card hr-card" aria-label="My month">
          <div className="hr-head-row">
            <h2 className="section-title">My month</h2>
            <MonthNav month={month} onChange={m => { setSelected(null); setMonth(m); }} max={currentMonth()} />
          </div>
          {monthLoading ? <SkeletonRows rows={5} />
            : monthError ? <ErrorPanel title="Could not load this month" error={monthError} onRetry={() => loadMonth(month)} />
            : (
              <>
                <MonthSummary summary={data?.summary} />
                <div className="hr-cal-wrap">
                  <MonthCalendar month={month} days={data?.days} today={todayDate} holidayNames={holidayNames} selected={selected} onSelect={setSelected} />
                  <div className="hr-day-panel" aria-live="polite">
                    {selected ? (
                      <>
                        <h3 className="section-title">{fmtDayLong(selected)}</h3>
                        <DayFacts day={selDay} holidayName={holidayNames.get(selected)} />
                        {selected <= (todayDate || '') && <DayScans load={myScans} date={selected} />}
                        {openFor(selected)
                          ? <Notice tone="info" icon={Info}>You asked for a correction on this day ({reqTimes(openFor(selected))}). It is waiting for a partner.</Notice>
                          : selDay && canAsk(selected) && (
                            <button type="button" className="mac-btn mac-btn-secondary" onClick={() => startAsk(selDay)}>
                              <Edit2 size={14} aria-hidden="true" /> Request correction
                            </button>
                          )}
                      </>
                    ) : <p className="hr-note">Pick a day to see its punch times and status.</p>}
                  </div>
                </div>
                <Legend />
              </>
            )}
        </section>

        {requests.length > 0 && (
          <section className="mac-card hr-card" aria-label="My correction requests">
            <h2 className="section-title">My correction requests</h2>
            <ul className="home-list">
              {requests.slice(0, 20).map(r => (
                <li key={r.id} className="att-req">
                  <div className="att-req-main">
                    <strong>{fmtDayLong(r.date)}</strong>
                    <span className="faint">{reqTimes(r)} — {r.reason}</span>
                    {r.decisionNote && <span className="faint">{r.status === 'REJECTED' ? 'Reason: ' : 'Note: '}{r.decisionNote}{r.decidedBy ? ` (${r.decidedBy})` : ''}</span>}
                  </div>
                  <div className="home-row-side">
                    <ReqBadge status={r.status} />
                    {r.status === 'PENDING' && <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setCancelId(r.id)}>Withdraw</button>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <Modal isOpen={!!ask} onClose={() => !sending && setAsk(null)} title="Request a correction"
        description={ask ? fmtDayLong(ask.date) : ''}
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setAsk(null)} disabled={sending}>Cancel</button>
          <button type="submit" form="att-ask-form" className="mac-btn mac-btn-primary" disabled={sending}>{sending ? 'Sending…' : 'Send to partners'}</button>
        </>}>
        {ask && (
          <form id="att-ask-form" onSubmit={e => { e.preventDefault(); sendAsk(); }} noValidate>
            <p className="hr-note" style={{ marginTop: 0 }}>Enter the times you actually came in and left. Leave a time empty to keep what the device recorded. A partner checks it before anything changes.</p>
            <FormGrid>
              <Field label="Came in" error={askErrors.punchIn}>
                <input className="mac-input" type="time" value={ask.punchIn} onChange={e => setAsk(a => ({ ...a, punchIn: e.target.value }))} />
              </Field>
              <Field label="Left" error={askErrors.punchOut}>
                <input className="mac-input" type="time" value={ask.punchOut} onChange={e => setAsk(a => ({ ...a, punchOut: e.target.value }))} />
              </Field>
              <Field label="What happened" required error={askErrors.reason} span={2}>
                <textarea className="mac-input" rows={3} maxLength={500} value={ask.reason} onChange={e => setAsk(a => ({ ...a, reason: e.target.value }))}
                  placeholder="e.g. The device did not read my face when I left at 7 pm" />
              </Field>
            </FormGrid>
          </form>
        )}
      </Modal>

      <ConfirmDialog isOpen={!!cancelId} onClose={() => setCancelId(null)} onConfirm={() => cancelAsk(cancelId)}
        title="Withdraw this request?" confirmLabel="Withdraw" message="The partners will no longer see it. You can send a new one afterwards." />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Partner: team month grid
// ═════════════════════════════════════════════════════════════════
const isOffStatus = s => s === 'HOLIDAY' || s === 'WEEKLY_OFF';
const OVERRIDES = [['', 'Work it out from the times'], ['PRESENT', 'Present'], ['HALF_DAY', 'Half day'], ['ABSENT', 'Absent']];

function TodayStrip({ rows, date }) {
  const s = daySummary(rows, date);
  const names = list => list.map(p => p.name).join(', ');
  const boxes = [
    ['good', 'In', s.in, s.off ? 'Office is closed today' : 'Nobody has scanned in yet'],
    ['warn', 'Late', s.late, 'Nobody is late'],
    ['mute', 'Not marked', s.notMarked, s.off ? 'Office is closed today' : 'Everyone is accounted for'],
    ['brand', 'On leave', s.onLeave, 'Nobody is on leave'],
  ];
  return (
    <div className="hr-now" role="group" aria-label={`Today, ${fmtDayLong(date)}`}>
      {boxes.map(([tone, label, list, empty]) => (
        <div key={label} className="hr-now-box">
          <div className="hr-now-top"><span className={`hr-dot ${tone}`} aria-hidden="true" /><span className="hr-now-n">{list.length}</span><span className="hr-now-l">{label}</span></div>
          <div className="hr-now-names" title={names(list) || undefined}>{names(list) || empty}</div>
        </div>
      ))}
    </div>
  );
}

function cellTip(row, day, holidayName) {
  const m = statusMeta(day.status);
  const bits = [m.label + (day.status === 'HOLIDAY' && holidayName ? ` (${holidayName})` : '')];
  if (day.punchIn) bits.push(`${fmtTime(day.punchIn)} – ${day.punchOut ? fmtTime(day.punchOut) : 'no punch out'}`);
  if (day.punchIn && day.workedMinutes) bits.push(fmtMinutes(day.workedMinutes));
  if (day.corrected) bits.push('corrected');
  return `${row.employeeName} · ${fmtDayLong(day.date)} · ${bits.join(' · ')}`;
}

function TeamGrid({ month, rows, today, holidayNames, focusId, onPick }) {
  const dates = useMemo(() => monthDates(month), [month]);
  const focusRef = useRef(null);
  const offDates = useMemo(() => {
    const out = new Set();
    for (const date of dates) {
      const marks = rows.map(r => (r.days || []).find(d => d.date === date)?.status).filter(Boolean);
      if (marks.length && marks.every(isOffStatus)) out.add(date);
    }
    return out;
  }, [rows, dates]);
  useEffect(() => { focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [focusId, month]);
  const colClass = date => `${offDates.has(date) ? 'is-off' : ''} ${date === today ? 'is-today' : ''}`;
  return (
    <div className="mac-card hr-grid-wrap" tabIndex={0} role="region" aria-label={`Team attendance for ${monthLabel(month)} — scroll sideways for more days`}>
      <table className="hr-grid">
        <thead>
          <tr>
            <th scope="col" className="hr-grid-name">Employee</th>
            {dates.map(date => (
              <th key={date} scope="col" className={colClass(date)} title={holidayNames.get(date) || undefined}>
                {WEEKDAY_LABEL[weekdayOf(date)].charAt(0)}<b>{dayOfMonth(date)}</b>
              </th>
            ))}
            {['Present', 'Late', 'Half', 'Absent', 'Leave', 'Hours', 'Payable'].map((h, i) => <th key={h} scope="col" className={`hr-grid-sum ${i === 0 ? 'first' : ''}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const byDate = new Map((row.days || []).map(d => [d.date, d]));
            const s = row.summary || {};
            const focused = focusId != null && String(row.employeeId) === String(focusId);
            return (
              <tr key={row.employeeId} ref={focused ? focusRef : undefined} className={focused ? 'is-focus' : ''}>
                <th scope="row" className="hr-grid-name">
                  <div className="hr-person"><span className="hr-avatar"><Avatar name={row.employeeName} size={28} /></span><div><div className="cell-main">{row.employeeName}</div>{+s.notTracked > 0 && <div className="cell-sub" title="Days before attendance started — paid, never absent">{fmtNum(s.notTracked)} not tracked</div>}</div></div>
                </th>
                {dates.map(date => {
                  const day = byDate.get(date);
                  if (!day) return <td key={date} className={colClass(date)} />;
                  const m = statusMeta(day.status);
                  const tip = cellTip(row, day, holidayNames.get(date));
                  return (
                    <td key={date} className={colClass(date)}>
                      <Tooltip content={tip} delay={150}>
                        <button type="button" className={`hr-cell hr-s-${m.tone} ${day.corrected ? 'is-corrected' : ''}`} aria-label={tip} onClick={() => onPick(row, day)}>{m.short}</button>
                      </Tooltip>
                    </td>
                  );
                })}
                <td className="hr-grid-sum first">{fmtNum(s.present)}</td>
                <td className="hr-grid-sum">{fmtNum(s.late)}</td>
                <td className="hr-grid-sum">{fmtNum(s.halfDays)}</td>
                <td className="hr-grid-sum">{fmtNum(s.absent)}</td>
                <td className="hr-grid-sum">{fmtNum((+s.paidLeave || 0) + (+s.unpaidLeave || 0))}</td>
                <td className="hr-grid-sum">{fmtMinutes(s.workedMinutes)}</td>
                <td className="hr-grid-sum">{s.payableDays != null ? fmtNum(s.payableDays) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeamTab({ focusId }) {
  const toast = useToast();
  const [today] = useState(todayIST);
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState([]);
  const [todayRows, setTodayRows] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [edit, setEdit] = useState(null);       // { row, day, punchIn, punchOut, status, note }
  const editEmployeeId = edit?.row.employeeId;
  const partnerScans = useCallback(date => attendanceAPI.scansOf(editEmployeeId, date), [editEmployeeId]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const monthRef = useRef(month);
  useEffect(() => { monthRef.current = month; });

  const load = useCallback(async (m, { quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setLoadError(null); }
    try {
      const data = await attendanceAPI.team(m);
      if (m === today.slice(0, 7)) setTodayRows(data);
      if (monthRef.current !== m) return;
      setRows(data); setLoadError(null);
    } catch (e) { console.error(e); if (monthRef.current === m && !quiet) setLoadError(e); }
    if (monthRef.current === m) setLoading(false);
  }, [today]);
  useEffect(() => { load(month); }, [month, load]);
  useEffect(() => {
    let live = true;
    holidaysAPI.list(month.slice(0, 4)).then(h => { if (live) setHolidays(h); }).catch(e => console.error(e));
    return () => { live = false; };
  }, [month]);
  // Looking at another month: the "Today" strip still needs this month's rows.
  useEffect(() => {
    if (todayRows || month === today.slice(0, 7)) return;
    attendanceAPI.team(today.slice(0, 7)).then(setTodayRows).catch(e => console.error(e));
  }, [month, today, todayRows]);

  const holidayNames = useMemo(() => new Map(holidays.map(h => [h.date, h.name])), [holidays]);

  function openDay(row, day) {
    setEdit({ row, day, punchIn: toHM(day.punchIn), punchOut: toHM(day.punchOut), status: '', note: '' });
    setErrors({});
  }
  const setField = (k, v) => { setEdit(e => ({ ...e, [k]: v })); setErrors(er => (er[k] ? { ...er, [k]: undefined } : er)); };
  const closeEdit = () => { if (!saving) setEdit(null); };

  async function saveCorrection() {
    if (saving || !edit) return;
    const er = {};
    if (!edit.note.trim()) er.note = 'Say why this day is being corrected';
    if (edit.punchOut && !edit.punchIn) er.punchIn = 'Enter the punch in time too';
    if (edit.punchIn && edit.punchOut && edit.punchOut <= edit.punchIn) er.punchOut = 'Punch out must be after punch in';
    if (!edit.punchIn && !edit.punchOut && !edit.status) er.status = 'Enter the times, or choose what the day should count as';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      await attendanceAPI.correct(edit.row.employeeId, edit.day.date, { punchIn: edit.punchIn, punchOut: edit.punchOut, status: edit.status, note: edit.note.trim() });
      toast.success(`${edit.row.employeeName}’s ${fmtDate(edit.day.date)} was corrected`);
      setEdit(null);
      load(monthRef.current, { quiet: true });
    } catch (e) { toast.error('Could not save the correction', e); }
    setSaving(false);
  }

  async function removeCorrection() {
    if (!edit) return;
    setSaving(true);
    try {
      await attendanceAPI.removeCorrection(edit.row.employeeId, edit.day.date);
      toast.success('Correction removed — the day is back to what was punched');
      setEdit(null);
      load(monthRef.current, { quiet: true });
    } catch (e) { toast.error('Could not remove the correction', e); }
    setSaving(false);
  }

  const future = !!edit && edit.day.date > today;
  return (
    <>
      {todayRows && todayRows.length > 0 && <TodayStrip rows={todayRows} date={today} />}

      <div className="hr-head-row">
        <MonthNav month={month} onChange={setMonth} max={today.slice(0, 7)} />
        <Legend />
      </div>

      {loading ? <SkeletonRows rows={6} />
        : loadError ? <ErrorPanel title="Could not load attendance" error={loadError} onRetry={() => load(month)} />
        : rows.length === 0 ? <EmptyPanel icon={Users} title="No active employees" text="Attendance appears here once there are active employees." />
        : <TeamGrid month={month} rows={rows} today={today} holidayNames={holidayNames} focusId={focusId} onPick={openDay} />}

      <Drawer isOpen={!!edit} onClose={() => { if (!confirmRemove) closeEdit(); }} width={480}
        title={edit ? `${edit.row.employeeName}` : ''} subtitle={edit ? fmtDayLong(edit.day.date) : ''}
        footer={edit && !future && <>
          {edit.day.corrected && <button type="button" className="mac-btn mac-btn-danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmRemove(true)} disabled={saving}>Remove correction</button>}
          <button type="button" className="mac-btn mac-btn-secondary" onClick={closeEdit} disabled={saving}>Cancel</button>
          <button type="submit" form="att-fix-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save correction'}</button>
        </>}>
        {edit && (
          <>
            <section className="form-section">
              <h3 className="section-title">Recorded</h3>
              <DayFacts day={edit.day} holidayName={holidayNames.get(edit.day.date)} />
              {!future && <DayScans load={partnerScans} date={edit.day.date} />}
            </section>
            {future ? <Notice tone="info" icon={Info}>This day has not happened yet, so there is nothing to correct.</Notice> : (
              <form id="att-fix-form" onSubmit={e => { e.preventDefault(); saveCorrection(); }} noValidate>
                <FormSection title="Correct this day">
                  <FormGrid>
                    <Field label="Punch in" error={errors.punchIn}>
                      <input className="mac-input" type="time" value={edit.punchIn} onChange={e => setField('punchIn', e.target.value)} />
                    </Field>
                    <Field label="Punch out" error={errors.punchOut}>
                      <input className="mac-input" type="time" value={edit.punchOut} onChange={e => setField('punchOut', e.target.value)} />
                    </Field>
                    <Field label="Count the day as" span={2} error={errors.status} hint="Leave on the first option unless the times alone give the wrong result.">
                      <select className="mac-select" value={edit.status} onChange={e => setField('status', e.target.value)}>
                        {OVERRIDES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label="Reason for the correction" required span={2} error={errors.note}>
                      <textarea className="mac-input" rows={3} value={edit.note} onChange={e => setField('note', e.target.value)} placeholder="e.g. Forgot to punch out — left at 7 pm" />
                    </Field>
                  </FormGrid>
                  <p className="hr-note">Times are office time. The correction is saved with your name and can be removed later.</p>
                </FormSection>
              </form>
            )}
          </>
        )}
      </Drawer>

      <ConfirmDialog isOpen={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={() => { removeCorrection(); }}
        title="Remove correction" confirmLabel="Remove correction"
        message="The day goes back to what was actually punched, and its status is worked out again." />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════
// Partner: holidays
// ═════════════════════════════════════════════════════════════════
function HolidaysTab() {
  const toast = useToast();
  const [year, setYear] = useState(() => +todayIST().slice(0, 4));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(null);     // { id, date, name, version }
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const yearRef = useRef(year);
  useEffect(() => { yearRef.current = year; });

  const load = useCallback(async y => {
    setLoading(true); setLoadError(null);
    try {
      const data = await holidaysAPI.list(y);
      if (yearRef.current !== y) return;
      setItems([...data].sort((a, b) => String(a.date).localeCompare(String(b.date))));
    } catch (e) { console.error(e); if (yearRef.current === y) setLoadError(e); }
    if (yearRef.current === y) setLoading(false);
  }, []);
  useEffect(() => { load(year); }, [year, load]);

  const openAdd = () => { setForm({ id: null, date: `${year}-01-01`, name: '' }); setErrors({}); };
  const openEdit = h => { setForm({ id: h.id, date: h.date, name: h.name || '', version: h.version }); setErrors({}); };
  const setField = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(er => (er[k] ? { ...er, [k]: undefined } : er)); };

  async function save() {
    if (saving || !form) return;
    const er = {};
    if (!form.date) er.date = 'Pick the date';
    else if (items.some(h => h.date === form.date && h.id !== form.id)) er.date = 'There is already a holiday on this date';
    if (!form.name.trim()) er.name = 'Give the holiday a name';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      if (form.id) await holidaysAPI.update(form.id, { date: form.date, name: form.name.trim(), version: form.version });
      else await holidaysAPI.create({ date: form.date, name: form.name.trim() });
      toast.success(form.id ? 'Holiday updated' : `${form.name.trim()} added`);
      setForm(null);
      const y = +form.date.slice(0, 4);
      if (y !== yearRef.current) setYear(y); else load(y);
    } catch (e) { toast.error(form.id ? 'Could not save the holiday' : 'Could not add the holiday', e); }
    setSaving(false);
  }

  async function remove(id) {
    const h = items.find(x => x.id === id);
    try {
      await holidaysAPI.remove(id);
      setItems(xs => xs.filter(x => x.id !== id));
      toast.success(`${h?.name || 'Holiday'} deleted`);
    } catch (e) { toast.error('Could not delete the holiday', e); }
  }

  const menu = h => [
    { label: 'Edit', icon: Edit2, onClick: () => openEdit(h) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => setDeleteId(h.id) },
  ];
  return (
    <>
      <div className="hr-head-row">
        <div className="hr-month" role="group" aria-label="Year">
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setYear(y => y - 1)}>{year - 1}</button>
          <span className="hr-month-label" style={{ minWidth: 64 }} aria-live="polite">{year}</span>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setYear(y => y + 1)}>{year + 1}</button>
        </div>
        <button type="button" className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> Add holiday</button>
      </div>

      {loading ? <SkeletonRows rows={5} />
        : loadError ? <ErrorPanel title="Could not load holidays" error={loadError} onRetry={() => load(year)} />
        : items.length === 0 ? (
          <EmptyPanel icon={CalendarOff} title={`No holidays for ${year} yet`} text="Holidays are not counted as working days: nobody is marked absent and leave does not use them up."
            action={<button type="button" className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> Add holiday</button>} />
        ) : (
          <div className="mac-card table-wrap">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Day</th><th>Holiday</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {items.map(h => (
                  <tr key={h.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(h.date)}</td>
                    <td className="cell-sub">{WEEKDAY_LABEL[weekdayOf(h.date)]}</td>
                    <td className="cell-main">{h.name}</td>
                    <td><div style={{ display: 'flex', justifyContent: 'flex-end' }}><RowMenu items={menu(h)} label={`Actions for ${h.name}`} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <Modal isOpen={!!form} onClose={() => { if (!saving) setForm(null); }} title={form?.id ? 'Edit holiday' : 'Add holiday'} size="sm"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
          <button type="submit" form="holiday-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : form?.id ? 'Save changes' : 'Add holiday'}</button>
        </>}>
        {form && (
          <form id="holiday-form" onSubmit={e => { e.preventDefault(); save(); }} noValidate>
            <FormGrid cols={1}>
              <Field label="Date" required error={errors.date}>
                <input className="mac-input" type="date" value={form.date} onChange={e => setField('date', e.target.value)} />
              </Field>
              <Field label="Name" required error={errors.name}>
                <input className="mac-input" value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Diwali" />
              </Field>
            </FormGrid>
          </form>
        )}
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { remove(deleteId); }}
        title="Delete holiday" message="The day becomes a normal working day again, and attendance for it is worked out afresh." />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════
// Partner: rules (the one policy everyone follows)
// ═════════════════════════════════════════════════════════════════
const toDraft = p => ({
  workingDays: [...(p?.workingDays || [])],
  officeStart: toHM(p?.officeStart), officeEnd: toHM(p?.officeEnd),
  lateAfterMinutes: String(p?.lateAfterMinutes ?? ''), halfDayBelowHours: String(p?.halfDayBelowHours ?? ''), fullDayHours: String(p?.fullDayHours ?? ''),
  paidLeavePerYear: String(p?.paidLeavePerYear ?? ''), leaveYearStartMonth: String(p?.leaveYearStartMonth ?? 4),
  attendanceStartDate: String(p?.attendanceStartDate ?? '').slice(0, 10),
});

function RulesTab() {
  const toast = useToast();
  const [policy, setPolicy] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try { const p = await policyAPI.get(); setPolicy(p); setDraft(toDraft(p)); }
    catch (e) { console.error(e); setLoadError(e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = !!policy && !!draft && JSON.stringify(draft) !== JSON.stringify(toDraft(policy));
  const set = (k, v) => { setDraft(d => ({ ...d, [k]: v })); setErrors(er => (er[k] ? { ...er, [k]: undefined } : er)); };
  const toggleDay = d => set('workingDays', WEEKDAYS.filter(w => (w === d ? !draft.workingDays.includes(w) : draft.workingDays.includes(w))));

  async function save() {
    if (saving || !dirty) return;
    const er = {};
    const n = k => +draft[k];
    if (!draft.workingDays.length) er.workingDays = 'Pick at least one working day';
    if (!draft.officeStart) er.officeStart = 'Set when the office starts';
    if (!draft.officeEnd) er.officeEnd = 'Set when the office ends';
    else if (draft.officeStart && draft.officeEnd <= draft.officeStart) er.officeEnd = 'Must be after the start time';
    if (draft.lateAfterMinutes === '' || !(n('lateAfterMinutes') >= 0)) er.lateAfterMinutes = 'Enter 0 or more minutes';
    if (!(n('fullDayHours') > 0) || n('fullDayHours') > 24) er.fullDayHours = 'Enter hours between 1 and 24';
    if (!(n('halfDayBelowHours') >= 0)) er.halfDayBelowHours = 'Enter 0 or more hours';
    else if (!er.fullDayHours && n('halfDayBelowHours') > n('fullDayHours')) er.halfDayBelowHours = 'Cannot be more than a full day';
    if (draft.paidLeavePerYear === '' || !(n('paidLeavePerYear') >= 0)) er.paidLeavePerYear = 'Enter 0 or more days';
    if (draft.attendanceStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.attendanceStartDate)) er.attendanceStartDate = 'Pick a date';
    else if (!draft.attendanceStartDate && policy.attendanceStartDate) er.attendanceStartDate = 'Pick the day your team started using the device';
    setErrors(er);
    if (Object.keys(er).length) { toast.error('Some rules need fixing before they can be saved'); return; }
    setSaving(true);
    try {
      const saved = await policyAPI.save({
        ...policy,
        workingDays: draft.workingDays, officeStart: draft.officeStart, officeEnd: draft.officeEnd,
        lateAfterMinutes: n('lateAfterMinutes'), halfDayBelowHours: n('halfDayBelowHours'), fullDayHours: n('fullDayHours'),
        paidLeavePerYear: n('paidLeavePerYear'), leaveYearStartMonth: n('leaveYearStartMonth'),
        attendanceStartDate: draft.attendanceStartDate || null,
        version: policy.version,
      });
      const next = saved && typeof saved === 'object' ? saved : await policyAPI.get();
      setPolicy(next); setDraft(toDraft(next));
      toast.success('Rules saved — they apply to everyone from now on');
    } catch (e) { toast.error('Could not save the rules', e); }
    setSaving(false);
  }

  if (loading) return <SkeletonRows rows={6} />;
  if (loadError || !draft) return <ErrorPanel title="Could not load the rules" error={loadError} onRetry={load} />;
  return (
    <form className="hr-rules" onSubmit={e => { e.preventDefault(); save(); }} noValidate>
      <section className="mac-card hr-card">
        <div>
          <h2 className="section-title">Working week and office hours</h2>
          <p className="hr-note">One set of rules for everyone. Days that are not ticked are weekly offs.</p>
        </div>
        <div className="field">
          <span className="field-label" id="hr-days-label">Working days</span>
          <div className="hr-days" role="group" aria-labelledby="hr-days-label">
            {WEEKDAYS.map(d => {
              const on = draft.workingDays.includes(d);
              return <button key={d} type="button" className={`chip ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => toggleDay(d)}>{WEEKDAY_LABEL[d]}</button>;
            })}
          </div>
          {errors.workingDays && <span className="field-error" role="alert">{errors.workingDays}</span>}
        </div>
        <FormGrid cols={3}>
          <Field label="Office starts" required error={errors.officeStart}>
            <input className="mac-input" type="time" value={draft.officeStart} onChange={e => set('officeStart', e.target.value)} />
          </Field>
          <Field label="Office ends" required error={errors.officeEnd}>
            <input className="mac-input" type="time" value={draft.officeEnd} onChange={e => set('officeEnd', e.target.value)} />
          </Field>
          <Field label="Late after (minutes)" error={errors.lateAfterMinutes} hint="Grace time after the office starts">
            <input className="mac-input" type="number" min="0" step="1" inputMode="numeric" value={draft.lateAfterMinutes} onChange={e => set('lateAfterMinutes', e.target.value)} />
          </Field>
          <Field label="Full day (hours)" error={errors.fullDayHours}>
            <input className="mac-input" type="number" min="1" max="24" step="0.5" inputMode="decimal" value={draft.fullDayHours} onChange={e => set('fullDayHours', e.target.value)} />
          </Field>
          <Field label="Half day below (hours)" error={errors.halfDayBelowHours} hint="Fewer hours than this counts as a half day">
            <input className="mac-input" type="number" min="0" max="24" step="0.5" inputMode="decimal" value={draft.halfDayBelowHours} onChange={e => set('halfDayBelowHours', e.target.value)} />
          </Field>
          <Field label="Attendance counted from" error={errors.attendanceStartDate}>
            <input className="mac-input" type="date" value={draft.attendanceStartDate} onChange={e => set('attendanceStartDate', e.target.value)} />
          </Field>
        </FormGrid>
        <p className="hr-note">Days before this date are treated as paid and never marked absent — use the day your team started scanning on the office device.</p>
      </section>

      <section className="mac-card hr-card">
        <h2 className="section-title">Leave</h2>
        <FormGrid>
          <Field label="Paid leave per year (days)" error={errors.paidLeavePerYear} hint="Someone who joins part-way through the year gets a proportionate share">
            <input className="mac-input" type="number" min="0" step="0.5" inputMode="decimal" value={draft.paidLeavePerYear} onChange={e => set('paidLeavePerYear', e.target.value)} />
          </Field>
          <Field label="Leave year starts in" hint="Balances start afresh on the 1st of this month">
            <select className="mac-select" value={draft.leaveYearStartMonth} onChange={e => set('leaveYearStartMonth', e.target.value)}>
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
        </FormGrid>
      </section>

      {dirty && (
        <div className="save-bar" role="region" aria-label="Unsaved changes">
          <span className="save-bar-text"><span className="save-bar-dot" aria-hidden="true" /><span>Unsaved changes</span></span>
          <Button type="button" variant="neutral" mode="ghost" size="xsmall" onClick={() => { setDraft(toDraft(policy)); setErrors({}); }} disabled={saving}
            className="text-static-white/80 hover:bg-white-alpha-16 hover:text-static-white disabled:bg-transparent disabled:text-white-alpha-24">Discard</Button>
          <Button type="submit" size="xsmall" loading={saving} loadingText="Saving…">Save rules</Button>
        </div>
      )}
    </form>
  );
}

// ═════════════════════════════════════════════════════════════════
// Partner: the office Biomax device and its agent
// ═════════════════════════════════════════════════════════════════
const STALE_MINUTES = 10;
const fmtWhen = v => (v ? `${fmtDate(String(v).slice(0, 10))}, ${fmtTime(v)}` : '—');
const minutesAgo = (v, now) => (v ? Math.floor((now - new Date(v).getTime()) / 60000) : null);
const ago = m => (m == null ? 'never' : m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} days ago`);

function DeviceTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await attendanceAPI.deviceSync()); setNow(Date.now()); } catch (e) { console.error(e); setError(e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <SkeletonRows rows={4} />;
  if (error && !data) return <ErrorPanel title="Could not load the device status" error={error} onRetry={load} />;
  const devices = data?.devices || [];
  const unmatched = [...(data?.unmatched || [])].sort((a, b) => String(a.deviceUserId).localeCompare(String(b.deviceUserId), undefined, { numeric: true }));
  return (
    <>
      <section className="mac-card hr-card">
        <div className="hr-head-row">
          <div>
            <h2 className="section-title">Office device</h2>
            <p className="hr-note">Attendance comes from the Biomax device. A small program on the office PC sends new scans here every minute while that PC is on the office Wi-Fi.</p>
          </div>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={load} disabled={loading}><RefreshCw size={15} aria-hidden="true" /> Refresh</button>
        </div>
        {!data?.configured && <Notice tone="bad" icon={AlertTriangle}>Device sync is switched off on the server. Set DEVICE_SYNC_KEY on the server and the same key in the office agent’s config.json.</Notice>}
        {devices.length === 0
          ? <EmptyPanel icon={ScanFace} title="The office agent has not checked in yet" text="Install it on the office PC — see office-agent/README.md in the backend." />
          : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Device</th><th>Office PC</th><th>Last check-in</th><th>Newest scan</th></tr></thead>
                <tbody>
                  {devices.map(d => {
                    const m = minutesAgo(d.lastSeenAt, now);
                    const stale = m == null || m > STALE_MINUTES;
                    return (
                      <tr key={d.deviceKey}>
                        <td className="hr-mono">{d.deviceKey}</td>
                        <td>{d.agentHost || '—'}</td>
                        <td><Badge color={stale ? 'orange' : 'green'}>{ago(m)}</Badge></td>
                        <td>{fmtWhen(d.lastPunchAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        {devices.some(d => (minutesAgo(d.lastSeenAt, now) ?? Infinity) > STALE_MINUTES) && (
          <Notice>The office PC has not checked in for a while. That is normal outside office hours or when it is away from the office Wi-Fi; scans made meanwhile are kept on the device and sent when it is back.</Notice>
        )}
      </section>

      <section className="mac-card hr-card">
        <div>
          <h2 className="section-title">Scans not linked to anyone</h2>
          <p className="hr-note">These people are enrolled on the device but no employee has their number. Open Employees, edit the person and enter it as <strong>Device user ID</strong> — their past scans are counted straight away.</p>
        </div>
        {unmatched.length === 0
          ? <p className="hr-note"><CheckCircle2 size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Every scan belongs to an employee.</p>
          : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Device user ID</th><th>Scans</th><th>First scan</th><th>Last scan</th></tr></thead>
                <tbody>
                  {unmatched.map(u => (
                    <tr key={u.deviceUserId}>
                      <td className="hr-mono">{u.deviceUserId}</td>
                      <td>{u.scans}</td>
                      <td>{fmtWhen(u.firstScanAt)}</td>
                      <td>{fmtWhen(u.lastScanAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════
// Partner: correction requests from employees
// ═════════════════════════════════════════════════════════════════
function RequestsTab({ onCount }) {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [decide, setDecide] = useState(null);       // { req, kind: 'approve' | 'reject', note }
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    try { const list = await correctionsAPI.list(); setItems(list); onCount?.(list.filter(r => r.status === 'PENDING').length); }
    catch (e) { console.error(e); setError(e); }
  }, [onCount]);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!decide || busy) return;
    if (decide.kind === 'reject' && !decide.note.trim()) { toast.error('Say why it is rejected'); return; }
    setBusy(true);
    try {
      if (decide.kind === 'approve') await correctionsAPI.approve(decide.req.id, decide.note.trim());
      else await correctionsAPI.reject(decide.req.id, decide.note.trim());
      toast.success(decide.kind === 'approve' ? 'Approved — the day is corrected' : 'Rejected — they have been told why');
      setDecide(null);
      load();
    } catch (e) { toast.error('Could not save the decision', e); }
    setBusy(false);
  }

  if (error && !items) return <ErrorPanel title="Could not load the requests" error={error} onRetry={load} />;
  if (!items) return <SkeletonRows rows={4} />;
  const open = items.filter(r => r.status === 'PENDING');
  const shown = showAll ? items : open;
  return (
    <>
      <div className="hr-head-row">
        <p className="hr-note" style={{ margin: 0 }}>Employees ask here when the device missed a scan. Approving writes a correction for that day; the device's own scans stay underneath.</p>
        <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show open only' : 'Show history'}</button>
      </div>
      {shown.length === 0
        ? <EmptyPanel icon={CheckCircle2} title={showAll ? 'No requests yet' : 'Nothing waiting'} text="Correction requests from employees appear here." />
        : (
          <div className="att-req-list">
            {shown.map(r => (
              <section key={r.id} className="mac-card hr-card att-req-card">
                <div className="hr-head-row">
                  <div>
                    <h3 className="section-title" style={{ margin: 0 }}>{r.employeeName}</h3>
                    <span className="faint">{fmtDayLong(r.date)}</span>
                  </div>
                  <ReqBadge status={r.status} />
                </div>
                <dl className="kv">
                  <dt>Recorded now</dt><dd>{r.recordedIn ? `${fmtTime(r.recordedIn)} – ${fmtTime(r.recordedOut)}` : 'Nothing recorded'}</dd>
                  <dt>Asked for</dt><dd>{reqTimes(r)}</dd>
                  <dt>Reason</dt><dd>{r.reason}</dd>
                  {r.decisionNote && <><dt>Decision</dt><dd>{r.decisionNote}{r.decidedBy ? ` — ${r.decidedBy}` : ''}</dd></>}
                </dl>
                {r.status === 'PENDING' && (
                  <div className="att-req-actions">
                    <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setDecide({ req: r, kind: 'reject', note: '' })}>Reject</button>
                    <button type="button" className="mac-btn mac-btn-primary" onClick={() => setDecide({ req: r, kind: 'approve', note: '' })}>Approve</button>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

      <Modal isOpen={!!decide} onClose={() => !busy && setDecide(null)}
        title={decide?.kind === 'approve' ? 'Approve correction' : 'Reject correction'}
        description={decide ? `${decide.req.employeeName} · ${fmtDayLong(decide.req.date)}` : ''}
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setDecide(null)} disabled={busy}>Cancel</button>
          <button type="button" className={`mac-btn ${decide?.kind === 'reject' ? 'mac-btn-danger' : 'mac-btn-primary'}`} onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : decide?.kind === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </>}>
        {decide && (
          <Field label={decide.kind === 'reject' ? 'Why (they will see this)' : 'Note (optional)'} required={decide.kind === 'reject'}>
            <textarea className="mac-input" rows={3} value={decide.note} onChange={e => setDecide(d => ({ ...d, note: e.target.value }))} autoFocus />
          </Field>
        )}
      </Modal>
    </>
  );
}

function TeamAttendance() {
  const [params] = useSearchParams();
  const focusId = params.get('employee');
  const [tab, setTab] = useState('team');
  const [pending, setPending] = useState(0);
  useEffect(() => {
    correctionsAPI.list('PENDING').then(l => setPending(l.length)).catch(e => console.error(e));
  }, []);
  return (
    <div>
      <Header title="Attendance" subtitle="Who is in, the month at a glance, holidays, rules and the office device" />
      <div className="page-body">
        <TabBar label="Attendance sections" value={tab} onChange={setTab} tabs={[['team', 'Team'], ['requests', pending ? `Requests (${pending})` : 'Requests'], ['holidays', 'Holidays'], ['rules', 'Rules'], ['device', 'Device']]} />
        {tab === 'team' && <TeamTab focusId={focusId} />}
        {tab === 'holidays' && <HolidaysTab />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'device' && <DeviceTab />}
        {tab === 'requests' && <RequestsTab onCount={setPending} />}
      </div>
    </div>
  );
}

export default function Attendance() {
  const { isPartner } = useAuth();
  return isPartner ? <TeamAttendance /> : <MyAttendance />;
}

// Pure views — exported so they can be rendered with sample data
export { TodayCard, MonthCalendar, MonthSummary, TeamGrid, TodayStrip, DayFacts };
