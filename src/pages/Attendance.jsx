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
  attendanceAPI, holidaysAPI, policyAPI, correctionsAPI, leaveMeta, dayTone, isWeeklyOff, loadWeeklyOffs,
  statusMeta, LEGEND, WEEKDAYS, WEEKDAY_LABEL, MONTH_NAMES,
  fmtMinutes, fmtNum, fmtTime, toHM, fmtClock, fmtLongDate, fmtDayLong, dateIST, todayIST, addDays,
  currentMonth, monthLabel, monthDates, weekdayOf, dayOfMonth, daySummary,
} from '../lib/hr';
import { MonthNav, Notice, TabBar } from '../components/hr/parts';
import AttendanceAnalytics from '../components/hr/AttendanceAnalytics';
import HolidayCalendar from '../components/hr/HolidayCalendar';
import CorrectionRequests from '../components/hr/CorrectionRequests';
import PayableDays from '../components/hr/PayableDays';
import { employeesDB, settingsDB } from '../lib/db';
import { Home, Wifi, WifiOff, AlertTriangle, CheckCircle2, Edit2, Info, LayoutGrid, LogIn, LogOut, ScanFace, Table2, Timer, Users } from 'lucide-react';
import { mailAPI } from '../lib/mail';
import './HR.css';

const STATUS_BADGE = { present: 'green', late: 'orange', half: 'purple', absent: 'red', leave: 'blue', holiday: 'gray', off: 'gray', none: 'gray', untracked: 'gray' };
const StatusBadge = ({ status }) => { const m = statusMeta(status); return <Badge color={STATUS_BADGE[m.tone] || 'gray'}>{m.label}</Badge>; };

function Legend() {
  return (
    <div className="hr-legend" aria-label="What the colours mean">
      {LEGEND.map(s => { const m = statusMeta(s); return <span key={s}><span className={`hr-swatch hr-s-${m.tone}`} aria-hidden="true">{m.short}</span>{m.legend || m.label}</span>; })}
      <span><span className="hr-cal-wfh" aria-hidden="true"><Home size={11} />WFH</span>Work from home (approved)</span>
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

function TodayCard({ today, now, policy, holidayName, net, punching, onPunch }) {
  const clock = new Date(now);
  const live = today.punchIn && !today.punchOut ? Math.max(+today.workedMinutes || 0, Math.floor((now - new Date(today.punchIn).getTime()) / 60000)) : +today.workedMinutes || 0;
  const halfBelow = (+policy?.halfDayBelowHours || 0) * 60;
  const reason = today.reason
    || (today.status === 'HOLIDAY' && holidayName ? `Today is a holiday (${holidayName}).` : OFF_REASON[today.status]) || '';
  const kind = today.punchIn && today.punchOut ? 'done' : today.punchIn ? 'in' : reason ? 'off' : 'waiting';
  // Punching from the app: on when a partner has entered the office network, usable only on it.
  // Flexible start: whoever comes in within the buffer is on time, and their day ends that much
  // later. In at 10:30 with an 8-hour day means out at 6:30.
  const fullMinutes = Math.round((+policy?.fullDayHours || 0) * 60);
  const dayEnds = today.punchIn && fullMinutes > 0 ? new Date(new Date(today.punchIn).getTime() + fullMinutes * 60000) : null;
  const leftEarly = kind === 'done' && fullMinutes > 0 && (+today.workedMinutes || 0) < fullMinutes;
  const byApp = !!net?.enabled;
  // An approved work-from-home day: the punch may come from anywhere.
  const atHome = !!(today.workFromHome || net?.workFromHome);
  const canPunchHere = !!net?.onOfficeNetwork || atHome;
  const sinceIn = today.punchIn ? Math.floor((now - new Date(today.punchIn).getTime()) / 60000) : 0;
  const tooSoon = kind === 'in' && sinceIn >= 0 && sinceIn < 30;
  // The server is on this same computer (a local test): it always sees "this computer", whatever WiFi it is on.
  const localTest = /^(127\.|::1$|0:0:0:0:0:0:0:1$)/.test(net?.address || '');
  return (
    <section className="mac-card hr-today" aria-label="Today">
      <div>
        <div className="hr-clock" aria-label="Office time">{fmtClock(clock)}</div>
        <div className="hr-clock-date">{fmtLongDate(clock)}{policy?.officeStart ? ` · Office hours ${fmtTime(policy.officeStart)} – ${fmtTime(policy.officeEnd)}${+policy.lateAfterMinutes > 0 ? `, come in up to ${policy.lateAfterMinutes} min later and leave that much later` : ''}` : ''}</div>
        <div className="hr-today-facts">
          <div className="hr-fact"><span>Status</span><span><StatusBadge status={today.status} />{atHome && <Badge color="purple" icon={Home}>WFH</Badge>}</span></div>
          <div className="hr-fact"><span>In</span><span>{fmtTime(today.punchIn)}</span></div>
          <div className="hr-fact"><span>Out</span><span>{fmtTime(today.punchOut)}</span></div>
          {dayEnds && <div className="hr-fact"><span>{today.punchOut ? 'Full day was until' : 'Your day ends at'}</span><span>{fmtTime(dayEnds)}</span></div>}
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
              : byApp ? 'Not punched in yet' : 'Not scanned in yet'}
          </strong>
        </div>
        {byApp && (
          <>
            <button type="button" className={`mac-btn ${kind === 'waiting' || kind === 'off' ? 'mac-btn-primary' : 'mac-btn-secondary'} hr-punch`} disabled={punching || !canPunchHere || tooSoon} onClick={onPunch}>
              {atHome ? <Home size={16} aria-hidden="true" /> : net.onOfficeNetwork ? <Wifi size={16} aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}
              {punching ? 'Saving…' : kind === 'done' ? 'Punch out again' : kind === 'in' ? 'Punch out' : 'Punch in'}
            </button>
            <p className={`hr-net ${canPunchHere ? 'is-on' : 'is-off'}`} role="status">
              {atHome ? 'Approved work-from-home day: you can punch from anywhere.'
                : localTest ? 'Local test site: the server runs on this computer, so the WiFi check cannot be tested here. It works on the live site.'
                : net.onOfficeNetwork ? 'You are on the office network.'
                : `You are not on the office network${net.address ? ` (your address is ${net.address})` : ''}. Connect to the office WiFi to punch.`}
            </p>
          </>
        )}
        <p className="hr-note" style={{ textAlign: 'center' }}>
          {kind === 'done' ? `${fmtTime(today.punchIn)} – ${fmtTime(today.punchOut)} · ${fmtMinutes(today.workedMinutes)}`
            : kind === 'in' ? (byApp ? (tooSoon ? `Punch out opens 30 minutes after punch in (${30 - sinceIn} min to go).` : 'Press Punch out when you leave. Your last punch of the day is your out time.')
              : 'Scan on the office device again when you leave — your last scan of the day is your out time.')
            : kind === 'off' ? (byApp ? 'No work is expected today.' : 'Nothing to scan today.')
            : byApp && atHome ? 'Press Punch in when you start work, and Punch out when you finish.'
            : byApp ? 'Press Punch in when you reach the office. It works only on the office WiFi.'
            : 'Scan your face on the office device when you arrive. It shows up here within a minute or two.'}
        </p>
      </div>
      {(reason || (kind === 'in' && dayEnds) || leftEarly || today.status === 'LATE' || today.status === 'HALF_DAY' || (kind === 'in' && halfBelow > 0 && live < halfBelow)) && (
        <div className="hr-today-notes">
          {reason && <Notice tone="info" icon={Info}>{reason}</Notice>}
          {kind === 'in' && dayEnds && <Notice tone="info" icon={Info}>You came in at {fmtTime(today.punchIn)}, so a full day of {fmtNum(policy.fullDayHours)} hours ends at {fmtTime(dayEnds)}.</Notice>}
          {leftEarly && today.status !== 'HALF_DAY' && <Notice>You worked {fmtMinutes(today.workedMinutes)}, which is {fmtMinutes(fullMinutes - today.workedMinutes)} short of a full day of {fmtNum(policy.fullDayHours)} hours.</Notice>}
          {today.status === 'LATE' && <Notice>You are marked late today{policy?.officeStart ? `: office starts at ${fmtTime(policy.officeStart)}, you may come in up to ${policy.lateAfterMinutes} minutes after that, and later than that counts as late` : ''}.</Notice>}
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
          <button key={date} type="button" className={`hr-cal-day hr-s-${dayTone(day?.status, date)} ${date === today ? 'is-today' : ''}`}
            aria-pressed={selected === date} onClick={() => onSelect(date)}
            aria-label={`${fmtDayLong(date)}: ${m.label}${day?.workFromHome ? ', work from home' : ''}${day?.punchIn ? `, in ${fmtTime(day.punchIn)}` : ''}${day?.punchOut ? `, out ${fmtTime(day.punchOut)}` : ''}`}>
            <span className="hr-cal-num">{dayOfMonth(date)}</span>
            {tag && <span className="hr-cal-tag">{tag}</span>}
            {(day?.corrected || day?.missingPunchOut) && <span className="hr-cal-flag" aria-hidden="true" />}
            {day?.workFromHome && <span className="hr-cal-wfh" title="Work from home"><Home size={11} aria-hidden="true" />WFH</span>}
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

  // Is punching from the app on, and am I at the office? Asked again whenever today is refreshed,
  // because walking in or out of WiFi range changes the answer.
  const [net, setNet] = useState(null);
  const [punching, setPunching] = useState(false);
  // my own monthly salary, only to show what the paid days are worth; the page works without it
  const [salary, setSalary] = useState(0);
  useEffect(() => { employeesDB.me().then(e => setSalary(e?.salaryType === 'Monthly' ? +e.salaryAmount || 0 : 0)).catch(() => {}); }, []);
  const loadToday = useCallback(async () => {
    attendanceAPI.network().then(setNet).catch(() => {});
    try {
      const t = await attendanceAPI.today();
      const server = t?.serverTime ? new Date(t.serverTime).getTime() : NaN;
      const offset = Number.isNaN(server) ? 0 : server - Date.now();
      setToday(t); setTodayError(null);
      setClock({ offset, now: Date.now() + offset });
    } catch (e) { console.error(e); setTodayError(e); }
  }, []);
  async function punch() {
    if (punching) return;
    setPunching(true);
    try {
      const t = await attendanceAPI.punch();
      setToday(t);
      toast.success(t?.punchOut ? `Punched out at ${fmtTime(t.punchOut)}` : `Punched in at ${fmtTime(t?.punchIn)}`);
      loadToday();
    } catch (e) {
      toast.error('Could not punch', e);
      attendanceAPI.network().then(setNet).catch(() => {});
    }
    setPunching(false);
  }

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
      <Header title="Attendance" subtitle="Your punches, your month and what you are paid for" />
      <div className="page-body">
        {todayError && !today ? <ErrorPanel title="Could not load today’s attendance" error={todayError} onRetry={loadToday} />
          : !today ? <SkeletonRows rows={3} />
          : <TodayCard today={today} now={clock.now} policy={policy} holidayName={holidayNames.get(todayDate)} net={net} punching={punching} onPunch={punch} />}

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

        {!monthLoading && !monthError && data?.days?.length > 0 && (
          <PayableDays month={month} days={data.days} summary={data.summary} today={todayDate} salary={salary} />
        )}

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
        <AttendanceAnalytics own />
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
  if (day.workFromHome) bits.push('work from home');
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
  const colClass = date => `${offDates.has(date) || isWeeklyOff(date) ? 'is-off' : ''} ${date === today ? 'is-today' : ''}`;
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
                        <button type="button" className={`hr-cell hr-s-${dayTone(day.status, date)} ${day.corrected ? 'is-corrected' : ''} ${day.workFromHome ? 'is-wfh' : ''}`} aria-label={tip} onClick={() => onPick(row, day)}>{dayTone(day.status, date) === 'off' ? '–' : m.short}</button>
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

// One card per person: the day in focus (today, or the last day of an earlier month), the month's
// totals and every day of the month as a small square. A square opens that day for correction.
function TeamCards({ month, rows, today, holidayNames, focusId, onPick }) {
  const dates = useMemo(() => monthDates(month), [month]);
  const focusDate = month === today.slice(0, 7) ? today : dates[dates.length - 1];
  const focusRef = useRef(null);
  useEffect(() => { focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [focusId, month]);
  return (
    <div className="att-cards">
      {rows.map(row => {
        const byDate = new Map((row.days || []).map(d => [d.date, d]));
        const sum = row.summary || {};
        const day = byDate.get(focusDate);
        const leave = (+sum.paidLeave || 0) + (+sum.unpaidLeave || 0);
        const worked = +sum.present || 0;   // already counts late days in full and half days as half
        const counted = worked + (+sum.absent || 0);
        const rate = counted > 0 ? Math.round((worked / counted) * 100) : null;
        const focused = focusId != null && String(row.employeeId) === String(focusId);
        const stats = [['Present', sum.present, 'present'], ['Late', sum.late, 'late'], ['Half day', sum.halfDays, 'half'], ['Absent', sum.absent, 'absent'], ['Leave', leave, 'leave']];
        return (
          <article key={row.employeeId} ref={focused ? focusRef : undefined} className={`mac-card att-card ${focused ? 'is-focus' : ''}`}>
            <header className="att-card-head">
              <Avatar name={row.employeeName} size={40} />
              <div className="att-card-title">
                <h3>{row.employeeName}</h3>
                <p>{focusDate === today ? 'Today' : fmtDate(focusDate)}{+sum.notTracked > 0 ? ` · ${fmtNum(sum.notTracked)} days not tracked` : ''}</p>
              </div>
              <span className="att-card-tags">{day?.workFromHome && <Badge color="purple" icon={Home}>WFH</Badge>}{day ? <StatusBadge status={day.status} /> : <Badge color="gray">No record</Badge>}</span>
            </header>

            <dl className="att-card-day">
              <div><dt><LogIn size={13} aria-hidden="true" /> In</dt><dd>{day?.punchIn ? fmtTime(day.punchIn) : '—'}</dd></div>
              <div><dt><LogOut size={13} aria-hidden="true" /> Out</dt><dd>{day?.punchOut ? fmtTime(day.punchOut) : day?.punchIn ? 'Not yet' : '—'}</dd></div>
              <div><dt><Timer size={13} aria-hidden="true" /> Worked</dt><dd>{day?.workedMinutes ? fmtMinutes(day.workedMinutes) : '—'}</dd></div>
            </dl>

            <div className="att-card-stats">
              {stats.map(([label, value, tone]) => (
                <div key={label}><span className={`hr-dot ${tone}`} aria-hidden="true" /><strong>{fmtNum(value)}</strong><span>{label}</span></div>
              ))}
            </div>

            <div className="att-card-rate">
              <div className="att-card-rate-top">
                <span>{monthLabel(month)}: {rate == null ? 'no working day counted yet' : `at work ${rate}% of counted days`}</span>
                <strong>{fmtMinutes(sum.workedMinutes)}</strong>
              </div>
              <div className="att-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rate ?? 0} aria-label="Share of counted days at work"><span style={{ width: `${rate ?? 0}%` }} /></div>
              <div className="att-card-rate-foot"><span>Payable days</span><strong>{sum.payableDays != null ? fmtNum(sum.payableDays) : '—'}</strong></div>
            </div>

            <div className="att-strip" role="group" aria-label={`${row.employeeName}, each day of ${monthLabel(month)}`}>
              {dates.map(date => {
                const d = byDate.get(date);
                if (!d) return <span key={date} className="att-strip-gap" />;
                const tip = cellTip(row, d, holidayNames.get(date));
                return (
                  <Tooltip key={date} content={tip} delay={150}>
                    <button type="button" className={`hr-cell att-strip-cell hr-s-${dayTone(d.status, date)} ${d.corrected ? 'is-corrected' : ''} ${d.workFromHome ? 'is-wfh' : ''} ${date === today ? 'is-today' : ''}`} aria-label={tip} onClick={() => onPick(row, d)}>{dayOfMonth(date)}</button>
                  </Tooltip>
                );
              })}
            </div>
          </article>
        );
      })}
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
  const [layout, setLayout] = useState('cards');   // 'cards' | 'grid'
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
        <div className="att-layout" role="group" aria-label="How to show the team">
          <button type="button" className={layout === 'cards' ? 'active' : ''} aria-pressed={layout === 'cards'} onClick={() => setLayout('cards')}><LayoutGrid size={15} /> Cards</button>
          <button type="button" className={layout === 'grid' ? 'active' : ''} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Table2 size={15} /> Month table</button>
        </div>
        <Legend />
      </div>

      {loading ? <SkeletonRows rows={6} />
        : loadError ? <ErrorPanel title="Could not load attendance" error={loadError} onRetry={() => load(month)} />
        : rows.length === 0 ? <EmptyPanel icon={Users} title="No active employees" text="Attendance appears here once there are active employees." />
        : layout === 'cards' ? <TeamCards month={month} rows={rows} today={today} holidayNames={holidayNames} focusId={focusId} onPick={openDay} />
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
// Partner: rules (the one policy everyone follows)
// ═════════════════════════════════════════════════════════════════
const toDraft = p => ({
  workingDays: [...(p?.workingDays || [])],
  officeStart: toHM(p?.officeStart), officeEnd: toHM(p?.officeEnd),
  lateAfterMinutes: String(p?.lateAfterMinutes ?? ''), halfDayBelowHours: String(p?.halfDayBelowHours ?? ''), fullDayHours: String(p?.fullDayHours ?? ''),
  paidLeavePerYear: String(p?.paidLeavePerYear ?? ''), leaveYearStartMonth: String(p?.leaveYearStartMonth ?? 4),
  attendanceStartDate: String(p?.attendanceStartDate ?? '').slice(0, 10),
  officeNetworks: (p?.officeNetworks || []).join('\n'),
});

// one address or block per line (commas and spaces work too)
const networkList = text => String(text || '').split(/[\s,]+/).filter(Boolean);
const NETWORK_ENTRY = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-fA-F:.]*:[0-9a-fA-F:.]*)(\/\d{1,3})?$/;

// Notifications by email: one switch for the whole office, saved the moment it is flipped.
function EmailRule() {
  const toast = useToast();
  const [value, setValue] = useState(null);   // the saved setting: { enabled, from }; null while loading
  const [senders, setSenders] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    settingsDB.get('email_notifications').then(v => setValue(v || {})).catch(e => { console.error(e); setValue({}); });
    mailAPI.senders().then(c => setSenders(c.senders || [])).catch(() => {});
  }, []);
  const on = value?.enabled !== false;
  const fromKey = value?.from && senders.some(x => x.key === value.from) ? value.from : (senders.find(x => x.key === 'no-reply') || senders[0])?.key || '';
  const fromAddress = senders.find(x => x.key === fromKey)?.address || 'no-reply@codelixitsolutions.com';
  async function save(next, message) {
    if (busy) return;
    setBusy(true);
    try { await settingsDB.set('email_notifications', next); setValue(next); toast.success(message); }
    catch (e) { toast.error('Could not save the email setting', e); }
    setBusy(false);
  }
  return (
    <section className="mac-card hr-card">
      <div>
        <h2 className="section-title">Notifications by email</h2>
        <p className="hr-note">Leave, work from home, attendance corrections, bank-detail changes, payslips and task notifications are also sent to each person's email address, from {fromAddress}. Chat messages are never emailed.</p>
      </div>
      <label className="hr-check"><input type="checkbox" checked={on} disabled={value == null || busy} onChange={e => save({ ...value, enabled: e.target.checked }, e.target.checked ? 'Notifications are sent by email too' : 'Email notifications are switched off')} /> Send notifications by email</label>
      {senders.length > 0 && (
        <Field label="Send them from" hint="Proposals and letters let you choose the address each time you send.">
          {id => <select id={id} className="mac-select" value={fromKey} disabled={value == null || busy || !on}
            onChange={e => save({ ...value, enabled: on, from: e.target.value }, `Notifications now come from ${senders.find(x => x.key === e.target.value)?.address}`)}>
            {senders.map(x => <option key={x.key} value={x.key}>{x.name} · {x.address}</option>)}
          </select>}
        </Field>
      )}
      <p className="hr-note">A person is mailed at the email on their employee record (partners at their sign-in email). Someone with no email there gets the notification in the app only.</p>
    </section>
  );
}

function RulesTab() {
  const toast = useToast();
  const [here, setHere] = useState(null);   // { enabled, onOfficeNetwork, address } for this computer
  useEffect(() => { attendanceAPI.network().then(setHere).catch(() => {}); }, []);
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
    const bad = networkList(draft.officeNetworks).find(x => !NETWORK_ENTRY.test(x));
    if (bad) er.officeNetworks = `“${bad}” is not an internet address. It looks like 203.0.113.25`;
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
        officeNetworks: networkList(draft.officeNetworks),
        version: policy.version,
      });
      const next = saved && typeof saved === 'object' ? saved : await policyAPI.get();
      setPolicy(next); setDraft(toDraft(next));
      toast.success('Rules saved — they apply to everyone from now on');
    } catch (e) { toast.error('Could not save the rules', e); }
    setSaving(false);
  }

  // in the saved list (the server compares addresses properly) or just typed into the box
  const hereListed = !!here?.address && (networkList(draft?.officeNetworks).includes(here.address)
    || (here.onOfficeNetwork && draft?.officeNetworks === toDraft(policy).officeNetworks));
  if (loading) return <SkeletonRows rows={6} />;
  if (loadError || !draft) return <ErrorPanel title="Could not load the rules" error={loadError} onRetry={load} />;
  return (
    <form className="hr-rules" onSubmit={e => { e.preventDefault(); save(); }} noValidate>
      <div className="rule-now" aria-label="The rules in force now">
        {[
          ['Working days', WEEKDAYS.filter(d => policy.workingDays?.includes(d)).map(d => WEEKDAY_LABEL[d]).join(' ') || 'None', `${7 - (policy.workingDays?.length || 0)} weekly off${7 - (policy.workingDays?.length || 0) === 1 ? '' : 's'}`],
          ['Office hours', `${fmtTime(policy.officeStart)} – ${fmtTime(policy.officeEnd)}`, +policy.lateAfterMinutes > 0 ? `Flexible start: up to ${policy.lateAfterMinutes} min later` : 'No flexible start'],
          ['Full day', `${fmtNum(policy.fullDayHours)} hours`, `Half day below ${fmtNum(policy.halfDayBelowHours)} hours`],
          ['Paid leave', `${fmtNum(policy.paidLeavePerYear)} days a year`, `Year starts in ${MONTH_NAMES[(+policy.leaveYearStartMonth || 4) - 1]}`],
          ['Punching from the app', (policy.officeNetworks || []).length ? 'On' : 'Off', (policy.officeNetworks || []).length ? `${policy.officeNetworks.length} office address${policy.officeNetworks.length === 1 ? '' : 'es'}` : 'No office address entered'],
        ].map(([label, value, sub]) => (
          <div key={label} className="mac-card rule-now-card"><span>{label}</span><strong>{value}</strong><em>{sub}</em></div>
        ))}
      </div>
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
        <div>
          <h2 className="section-title">Punching from the office WiFi</h2>
          <p className="hr-note">Employees punch in and out from this app, and it works only from your office internet connection. Enter the office's public internet address below (the static IP from your internet provider), one per line. Leave it empty to switch this off.</p>
        </div>
        <Field label="Office internet address" error={errors.officeNetworks} hint="A single address like 203.0.113.25, or a block like 203.0.113.0/24.">
          <textarea className="mac-input" rows={3} value={draft.officeNetworks} onChange={e => set('officeNetworks', e.target.value)} placeholder="203.0.113.25" spellCheck={false} style={{ fontFamily: 'ui-monospace, Consolas, monospace' }} />
        </Field>
        {here?.address && (
          <div className="hr-here">
            <span>This computer reaches the server from <strong>{here.address}</strong>. {/^(127\.|::1$|0:0:0:0:0:0:0:1$)/.test(here.address) ? 'That is this computer itself (a local test site), so it says nothing about the office WiFi. On the live site this shows your real internet address.' : hereListed ? 'It is in the list.' : 'If you are at the office now, this is the address to add.'}</span>
            {!hereListed && (
              <button type="button" className="mac-btn mac-btn-secondary" onClick={() => set('officeNetworks', [...networkList(draft.officeNetworks), here.address].join('\n'))}>Add this address</button>
            )}
          </div>
        )}
        <p className="hr-note">The device and partner corrections keep working alongside this. A punch out counts once it is at least 30 minutes after the punch in, and the time is always the server's, not the phone's.</p>
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

      <EmailRule />

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
      <Header title="Attendance" subtitle="Who is in, the month at a glance, analytics, requests, holidays and rules" />
      <div className="page-body">
        <TabBar label="Attendance sections" value={tab} onChange={setTab} tabs={[['team', 'Team'], ['analytics', 'Analytics'], ['requests', pending ? `Requests (${pending})` : 'Requests'], ['holidays', 'Holidays'], ['rules', 'Rules']]} />
        {tab === 'team' && <TeamTab focusId={focusId} />}
        {tab === 'analytics' && <AttendanceAnalytics />}
        {tab === 'holidays' && <HolidayCalendar />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'requests' && <CorrectionRequests onCount={setPending} />}
      </div>
    </div>
  );
}

export default function Attendance() {
  // Weekly offs come from the policy; read once so every calendar on the page can colour them.
  const [, setOffsReady] = useState(false);
  useEffect(() => { loadWeeklyOffs().then(() => setOffsReady(true)); }, []);
  const { isPartner } = useAuth();
  return isPartner ? <TeamAttendance /> : <MyAttendance />;
}

// Pure views — exported so they can be rendered with sample data
export { TodayCard, MonthCalendar, MonthSummary, TeamGrid, TodayStrip, DayFacts };
