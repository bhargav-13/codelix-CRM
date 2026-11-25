// ================================================================
// Codelix OMS — the employee's home screen: today at a glance.
// Everything here is the person's own (attendance, leave, payslips,
// requests) plus their open tasks when they have Tasks access. Each
// card loads on its own, so one slow or failed call never blanks the page.
// ================================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Badge from '../components/ui/Badge';
import { useAuth } from '../contexts/AuthContext';
import { StatTiles, fmtMoney, fmtDate } from '../components/ui/kit';
import { Notice } from '../components/hr/parts';
import {
  attendanceAPI, leaveAPI, payrollAPI, holidaysAPI, correctionsAPI, bankChangesAPI,
  statusMeta, fmtTime, fmtMinutes, fmtNum, todayIST, fmtDayLong,
} from '../lib/hr';
import { workTasks, isOverdue } from '../lib/work';
import { CalendarCheck, CalendarDays, CheckCircle2, ClipboardList, Hourglass, Plane, ScanFace, Wallet } from 'lucide-react';
import './HR.css';

const STATUS_BADGE = { present: 'green', late: 'orange', half: 'purple', absent: 'red', leave: 'blue', holiday: 'gray', off: 'gray', none: 'gray', untracked: 'gray' };

// One call per card; a failure leaves that card empty instead of breaking the page.
function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true });
  useEffect(() => {
    let live = true;
    Promise.resolve().then(fn)
      .then(data => { if (live) setState({ data, loading: false }); })
      .catch(e => { console.error(e); if (live) setState({ data: null, loading: false }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

const greeting = () => {
  const h = +new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date());
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function Home() {
  const navigate = useNavigate();
  const { me, employeeData, can } = useAuth();
  const name = (me?.fullName || employeeData?.name || '').split(' ')[0];
  const year = todayIST().slice(0, 4);
  const showTasks = can('tasks');

  const today = useLoad(() => attendanceAPI.today(), []);
  const balance = useLoad(() => leaveAPI.balance(), []);
  const payslips = useLoad(() => payrollAPI.myPayslips(), []);
  const holidays = useLoad(() => holidaysAPI.list(year), [year]);
  const leaves = useLoad(() => leaveAPI.mine(), []);
  const corrections = useLoad(() => correctionsAPI.mine(), []);
  const bank = useLoad(() => bankChangesAPI.mine(), []);
  const tasks = useLoad(() => (showTasks ? workTasks.list() : []), [showTasks]);

  const myTasks = useMemo(() => {
    const id = employeeData?.id;
    return (tasks.data || [])
      .filter(t => t.status !== 'Done' && (t.assignees || []).some(a => String(a.id) === String(id)))
      .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
  }, [tasks.data, employeeData?.id]);

  const nextHoliday = useMemo(() => {
    const t = todayIST();
    return (holidays.data || []).filter(h => h.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }, [holidays.data]);

  const waiting = [
    ...(leaves.data || []).filter(r => r.status === 'PENDING').map(r => ({ key: `l${r.id}`, what: 'Leave', detail: r.fromDate === r.toDate ? fmtDate(r.fromDate) : `${fmtDate(r.fromDate)} – ${fmtDate(r.toDate)}`, to: '/leave' })),
    ...(corrections.data || []).filter(r => r.status === 'PENDING').map(r => ({ key: `c${r.id}`, what: 'Attendance correction', detail: fmtDate(r.date), to: '/attendance' })),
    ...(bank.data || []).filter(r => r.status === 'PENDING').map(r => ({ key: `b${r.id}`, what: 'New bank details', detail: 'Waiting for a partner', to: '/profile' })),
  ];

  const latest = (payslips.data || [])[0];
  const t = today.data;
  const m = t ? statusMeta(t.status) : null;

  const tiles = [
    { label: 'Leave left this year', value: balance.data ? `${fmtNum(balance.data.remaining)} days` : '—', sub: balance.data && +balance.data.pending > 0 ? `${fmtNum(balance.data.pending)} waiting for approval` : undefined, icon: Plane, onClick: () => navigate('/leave') },
    { label: 'Latest payslip', value: latest ? fmtMoney(latest.net) : '—', sub: latest ? latest.monthLabel : 'None yet', icon: Wallet, onClick: () => navigate('/payroll') },
    ...(showTasks ? [{ label: 'My open tasks', value: tasks.loading ? '—' : String(myTasks.length), sub: myTasks.filter(isOverdue).length ? `${myTasks.filter(isOverdue).length} overdue` : undefined, tone: myTasks.some(isOverdue) ? 'warn' : undefined, icon: ClipboardList, onClick: () => navigate('/tasks') }] : []),
    { label: 'Waiting on a partner', value: String(waiting.length), sub: waiting.length ? 'Requests you sent' : 'Nothing pending', icon: Hourglass },
  ];

  return (
    <div>
      <Header title={`${greeting()}${name ? `, ${name}` : ''}`} subtitle={fmtDayLong(todayIST())} />
      <div className="page-body">
        <section className="mac-card hr-card home-today" aria-label="Today">
          <div className="hr-head-row">
            <h2 className="section-title"><ScanFace size={18} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />Today</h2>
            <button type="button" className="mac-btn mac-btn-secondary" onClick={() => navigate('/attendance')}>My attendance</button>
          </div>
          {today.loading ? <p className="hr-note">Loading…</p>
            : !t ? <p className="hr-note">Today’s attendance could not be loaded.</p>
            : (
              <div className="hr-today-facts">
                <div className="hr-fact"><span>Status</span><span><Badge color={STATUS_BADGE[m.tone] || 'gray'}>{m.label}</Badge></span></div>
                <div className="hr-fact"><span>In</span><span>{fmtTime(t.punchIn)}</span></div>
                <div className="hr-fact"><span>Out</span><span>{fmtTime(t.punchOut)}</span></div>
                <div className="hr-fact"><span>Worked</span><span>{t.punchIn ? fmtMinutes(t.workedMinutes) : '—'}</span></div>
              </div>
            )}
          {t && !t.punchIn && !t.reason && <Notice tone="info" icon={ScanFace}>Not scanned in yet — scan your face on the office device when you arrive.</Notice>}
          {t?.reason && <Notice tone="info" icon={CalendarCheck}>{t.reason}.</Notice>}
        </section>

        <StatTiles items={tiles} />

        <div className="home-grid">
          {showTasks && (
            <section className="mac-card hr-card" aria-label="My open tasks">
              <div className="hr-head-row">
                <h2 className="section-title">My open tasks</h2>
                <button type="button" className="mac-btn mac-btn-secondary" onClick={() => navigate('/tasks')}>Open board</button>
              </div>
              {tasks.loading ? <p className="hr-note">Loading…</p>
                : myTasks.length === 0 ? <p className="hr-note"><CheckCircle2 size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Nothing assigned to you is open.</p>
                : (
                  <ul className="home-list">
                    {myTasks.slice(0, 6).map(task => (
                      <li key={task.id}>
                        <button type="button" className="home-row" onClick={() => navigate(`/tasks?issue=${encodeURIComponent(task.id)}`)}>
                          <span className="home-row-main">{task.title}</span>
                          <span className="home-row-side">
                            {task.dueDate && <span className={isOverdue(task) ? 'emp-due' : 'faint'}>{isOverdue(task) ? 'Overdue · ' : 'Due '}{fmtDate(task.dueDate)}</span>}
                            <Badge color="gray">{task.status}</Badge>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          )}

          <section className="mac-card hr-card" aria-label="Waiting on a partner">
            <h2 className="section-title">Waiting on a partner</h2>
            {waiting.length === 0 ? <p className="hr-note">No requests waiting. Leave, attendance corrections and bank detail changes you send show up here until they are decided.</p>
              : (
                <ul className="home-list">
                  {waiting.map(w => (
                    <li key={w.key}>
                      <button type="button" className="home-row home-row-wrap" onClick={() => navigate(w.to)}>
                        <span className="home-row-main">{w.what}</span>
                        <span className="home-row-side"><span className="faint">{w.detail}</span><Badge color="orange">Pending</Badge></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </section>

          <section className="mac-card hr-card" aria-label="Coming up">
            <h2 className="section-title"><CalendarDays size={18} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />Next holiday</h2>
            {holidays.loading ? <p className="hr-note">Loading…</p>
              : nextHoliday ? <p className="home-holiday"><strong>{nextHoliday.name}</strong><span className="faint">{fmtDayLong(nextHoliday.date)}</span></p>
              : <p className="hr-note">No more holidays listed for {year}.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
