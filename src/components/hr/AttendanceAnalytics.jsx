// Attendance analytics: how each person's days went over a period — present, late, left early,
// leave, work from home they asked for, hours. Everything is worked out here from what the
// attendance, leave and work-from-home screens already load, so the numbers always agree with them.
//   <AttendanceAnalytics />      partner: the whole team, click a person for their detail
//   <AttendanceAnalytics own />  employee: their own figures only
import { useCallback, useEffect, useMemo, useState } from 'react';
import Kpis from '../crm/Kpis';
import Drawer from '../ui/Drawer';
import { IbcsCard, IbcsBars } from '../charts/ibcs';
import { Avatar, Chips, SkeletonRows, ErrorPanel, EmptyPanel } from '../ui/kit';
import {
  attendanceAPI, leaveAPI, wfhAPI, officeWfhAPI, policyAPI,
  currentMonth, shiftMonth, monthLabel, todayIST, fmtMinutes, fmtNum, weekdayOf, WEEKDAYS, WEEKDAY_LABEL, daysInMonth,
} from '../../lib/hr';
import { BarChart3, CalendarX, Clock, Home, LogOut, Plane, Timer, UserCheck } from 'lucide-react';

const PERIODS = [['1', 'This month'], ['3', 'Last 3 months'], ['6', 'Last 6 months'], ['12', 'Last 12 months']];
const SORTS = [
  ['name', 'Name'], ['attendance', 'Lowest attendance'], ['late', 'Most late arrivals'], ['early', 'Most early exits'],
  ['leave', 'Most leave days'], ['wfh', 'Most work from home'], ['absent', 'Most absences'],
];

const minutesOf = v => { const m = /T(\d{2}):(\d{2})/.exec(String(v || '')); return m ? +m[1] * 60 + +m[2] : null; };
const hm = v => { const m = /^(\d{1,2}):(\d{2})/.exec(String(v || '')); return m ? +m[1] * 60 + +m[2] : null; };
const clock = mins => {
  if (mins == null || Number.isNaN(mins)) return '—';
  const t = Math.round(mins), h = Math.floor(t / 60), m = t % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
const pct = v => (v == null ? '—' : `${Math.round(v * 100)}%`);
const plural = (n, one, many = `${one}s`) => `${fmtNum(n)} ${+n === 1 ? one : many}`;

// One person's days → the figures. `days` may span any number of months.
function analyse(days, { today, startMin, graceMin, fullMin, officeDates }) {
  const a = {
    present: 0, half: 0, absent: 0, leave: 0, unpaidLeave: 0, late: 0, afterStart: 0, early: 0, missingOut: 0,
    wfhSelf: 0, wfhOffice: 0, worked: 0, workedDays: 0, inSum: 0, inN: 0, outSum: 0, outN: 0,
    lateBy: {}, earlyBy: {},
  };
  for (const d of days) {
    if (d.date > today || d.beforeJoining) continue;
    const s = d.status;
    if (s === 'ABSENT') { a.absent += 1; continue; }
    if (s === 'ON_LEAVE') { a.leave += 1; a.unpaidLeave += Math.min(1, Math.max(0, +d.unpaid || 0)); continue; }
    if (s !== 'PRESENT' && s !== 'LATE' && s !== 'HALF_DAY') continue;
    if (s === 'HALF_DAY') a.half += 1; else a.present += 1;
    const wd = weekdayOf(d.date);
    const inMin = minutesOf(d.punchIn), outMin = minutesOf(d.punchOut);
    if (inMin != null) {
      a.inSum += inMin; a.inN += 1;
      if (inMin > startMin) a.afterStart += 1;
      if (inMin > startMin + graceMin) { a.late += 1; a.lateBy[wd] = (a.lateBy[wd] || 0) + 1; }
    }
    if (d.missingPunchOut) a.missingOut += 1;
    // A finished day (not today, which may still be running) that ended short of a full day.
    if (outMin != null && d.date !== today) {
      a.outSum += outMin; a.outN += 1;
      if ((+d.workedMinutes || 0) < fullMin) { a.early += 1; a.earlyBy[wd] = (a.earlyBy[wd] || 0) + 1; }
    }
    if (+d.workedMinutes > 0) { a.worked += +d.workedMinutes; a.workedDays += 1; }
    if (d.workFromHome) { if (officeDates.has(d.date)) a.wfhOffice += 1; else a.wfhSelf += 1; }
  }
  a.attended = a.present + a.half;
  a.expected = a.attended + a.absent;
  a.attendance = a.expected ? (a.present + a.half * 0.5) / a.expected : null;
  a.onTime = a.inN ? (a.inN - a.late) / a.inN : null;
  a.avgIn = a.inN ? a.inSum / a.inN : null;
  a.avgOut = a.outN ? a.outSum / a.outN : null;
  a.avgWorked = a.workedDays ? a.worked / a.workedDays : null;
  a.wfh = a.wfhSelf + a.wfhOffice;
  return a;
}

// What they asked for in the period: requests are counted by their first day.
function requestsOf(list, employeeId, from, to) {
  const mine = list.filter(r => (employeeId == null || String(r.employeeId) === String(employeeId)) && r.fromDate >= from && r.fromDate <= to);
  const by = st => mine.filter(r => r.status === st);
  return {
    asked: mine.length, approved: by('APPROVED').length, rejected: by('REJECTED').length, pending: by('PENDING').length,
    cancelled: by('CANCELLED').length, approvedDays: by('APPROVED').reduce((s, r) => s + (+r.days || 0), 0),
  };
}

const reqLine = r => (r.asked === 0 ? 'None asked'
  : [`${r.asked} asked`, r.approved && `${r.approved} approved`, r.rejected && `${r.rejected} rejected`, r.pending && `${r.pending} waiting`, r.cancelled && `${r.cancelled} cancelled`].filter(Boolean).join(' · '));

// ─── One person in detail ────────────────────────────────────────
function PersonAnalytics({ person }) {
  const { total: t, months, leaveReq, wfhReq } = person;
  const tiles = [
    { label: 'Attendance', value: pct(t.attendance), icon: UserCheck, tone: t.attendance != null && t.attendance < 0.9 ? 'warn' : 'good', sub: `${fmtNum(t.attended)} of ${fmtNum(t.expected)} working days` },
    { label: 'Late arrivals', value: fmtNum(t.late), icon: Clock, tone: t.late > 0 ? 'warn' : 'good', sub: t.inN ? `On time ${pct(t.onTime)} · usually in at ${clock(t.avgIn)}` : 'No punches yet' },
    { label: 'Left early', value: fmtNum(t.early), icon: LogOut, tone: t.early > 0 ? 'warn' : 'good', sub: t.outN ? `Usually out at ${clock(t.avgOut)}` : 'No finished days yet' },
    { label: 'Hours a day', value: t.avgWorked == null ? '—' : fmtMinutes(Math.round(t.avgWorked)), icon: Timer, tone: 'brand', sub: `${fmtMinutes(t.worked)} in all` },
    { label: 'Leave days', value: fmtNum(t.leave), icon: Plane, sub: t.unpaidLeave > 0 ? `${fmtNum(t.unpaidLeave)} unpaid` : reqLine(leaveReq) },
    { label: 'Work from home', value: fmtNum(t.wfhSelf), icon: Home, sub: t.wfhOffice ? `Asked by them · plus ${plural(t.wfhOffice, 'office-wide day')}` : 'Days they asked for' },
    { label: 'Absent', value: fmtNum(t.absent), icon: CalendarX, tone: t.absent > 0 ? 'bad' : 'good', sub: t.half ? `${plural(t.half, 'half day')} as well` : 'No half days' },
    { label: 'Missing punch-out', value: fmtNum(t.missingOut), icon: BarChart3, tone: t.missingOut > 0 ? 'warn' : undefined, sub: 'Days with no punch-out' },
  ];
  const weekdays = WEEKDAYS.filter(w => w !== 'SUN' || t.lateBy.SUN || t.earlyBy.SUN);
  return (
    <div className="ana-person">
      <Kpis cols={4} items={tiles} />
      <div className="ana-two">
        <IbcsCard who={person.name} what="Late arrivals by weekday" unit="days">
          <IbcsBars tone="warn" rows={weekdays.map(w => ({ name: WEEKDAY_LABEL[w], value: t.lateBy[w] || 0 }))} format={fmtNum} />
        </IbcsCard>
        <IbcsCard who={person.name} what="Early exits by weekday" unit="days">
          <IbcsBars tone="warn" rows={weekdays.map(w => ({ name: WEEKDAY_LABEL[w], value: t.earlyBy[w] || 0 }))} format={fmtNum} />
        </IbcsCard>
      </div>
      <section className="mac-card hr-card">
        <h2 className="section-title">What they asked for</h2>
        <dl className="kv">
          <dt>Leave requests</dt><dd>{reqLine(leaveReq)}{leaveReq.approvedDays ? ` · ${plural(leaveReq.approvedDays, 'day')} approved` : ''}</dd>
          <dt>Work-from-home requests</dt><dd>{reqLine(wfhReq)}{wfhReq.approvedDays ? ` · ${plural(wfhReq.approvedDays, 'day')} approved` : ''}</dd>
        </dl>
      </section>
      {months.length > 1 && (
        <section className="mac-card hr-card">
          <h2 className="section-title">Month by month</h2>
          <div className="table-wrap">
            <table className="data-table ana-table">
              <thead><tr><th>Month</th><th className="num">Attendance</th><th className="num">Present</th><th className="num">Late</th><th className="num">Left early</th><th className="num">Half</th><th className="num">Absent</th><th className="num">Leave</th><th className="num">WFH</th><th className="num">Usually in</th><th className="num">Usually out</th><th className="num">Hours a day</th></tr></thead>
              <tbody>
                {[...months].reverse().map(({ month, a }) => (
                  <tr key={month}>
                    <td className="cell-main">{monthLabel(month)}</td>
                    <td className="num">{pct(a.attendance)}</td>
                    <td className="num">{fmtNum(a.present)}</td>
                    <td className="num">{a.late ? <span className="ana-warn">{fmtNum(a.late)}</span> : '0'}</td>
                    <td className="num">{a.early ? <span className="ana-warn">{fmtNum(a.early)}</span> : '0'}</td>
                    <td className="num">{fmtNum(a.half)}</td>
                    <td className="num">{a.absent ? <span className="amount-out">{fmtNum(a.absent)}</span> : '0'}</td>
                    <td className="num">{fmtNum(a.leave)}</td>
                    <td className="num">{fmtNum(a.wfh)}</td>
                    <td className="num">{clock(a.avgIn)}</td>
                    <td className="num">{clock(a.avgOut)}</td>
                    <td className="num">{a.avgWorked == null ? '—' : fmtMinutes(Math.round(a.avgWorked))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default function AttendanceAnalytics({ own = false }) {
  const [period, setPeriod] = useState('3');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [sort, setSort] = useState('name');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const n = +period;
      const months = Array.from({ length: n }, (_, i) => shiftMonth(currentMonth(), -(n - 1 - i)));
      const soft = p => p.catch(e => { console.error(e); return []; });
      const [att, leaves, homes, office, policy] = await Promise.all([
        Promise.all(months.map(m => (own ? attendanceAPI.mine(m).then(x => (x ? [x] : [])) : attendanceAPI.team(m)))),
        soft(own ? leaveAPI.mine() : leaveAPI.list()),
        soft(own ? wfhAPI.mine() : wfhAPI.list()),
        soft(officeWfhAPI.list()),
        policyAPI.get().catch(e => { console.error(e); return null; }),
      ]);
      setData({ months, att, leaves, homes, office, policy });
    } catch (e) { console.error(e); setLoadError(e); }
    setLoading(false);
  }, [period, own]);
  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => {
    if (!data) return null;
    const { months, att, leaves, homes, office, policy } = data;
    const today = todayIST();
    const officeDates = new Set();
    for (const o of office) {
      for (let d = new Date(`${o.fromDate}T00:00:00Z`); d <= new Date(`${o.toDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) officeDates.add(d.toISOString().slice(0, 10));
    }
    const rules = {
      today, officeDates,
      startMin: hm(policy?.officeStart) ?? 600,
      graceMin: +policy?.lateAfterMinutes || 0,
      fullMin: (+policy?.fullDayHours || 8) * 60,
    };
    const from = `${months[0]}-01`, last = months[months.length - 1], to = `${last}-${String(daysInMonth(last)).padStart(2, '0')}`;
    const people = new Map();
    att.forEach((rows, i) => rows.forEach(r => {
      const key = String(r.employeeId ?? 'me');
      if (!people.has(key)) people.set(key, { id: r.employeeId, name: r.employeeName || 'You', months: [], days: [] });
      const p = people.get(key);
      p.months.push({ month: months[i], a: analyse(r.days || [], rules) });
      p.days.push(...(r.days || []));
    }));
    const list = [...people.values()].map(p => ({
      ...p, total: analyse(p.days, rules),
      leaveReq: requestsOf(leaves, own ? null : p.id, from, to),
      wfhReq: requestsOf(homes, own ? null : p.id, from, to),
    }));
    const sum = k => list.reduce((s, p) => s + (p.total[k] || 0), 0);
    const expected = sum('expected');
    const team = {
      attendance: expected ? (sum('present') + sum('half') * 0.5) / expected : null,
      late: sum('late'), early: sum('early'), leave: sum('leave'), wfhSelf: sum('wfhSelf'), absent: sum('absent'), inN: sum('inN'),
      avgWorked: sum('workedDays') ? sum('worked') / sum('workedDays') : null,
      leaveAsked: list.reduce((s, p) => s + p.leaveReq.asked, 0), wfhAsked: list.reduce((s, p) => s + p.wfhReq.asked, 0),
      officeDays: [...officeDates].filter(d => d >= from && d <= to && d <= today).length,
    };
    return { list, team, rules, range: months.length === 1 ? monthLabel(months[0]) : `${monthLabel(months[0])} – ${monthLabel(last)}` };
  }, [data, own]);

  const sorted = useMemo(() => {
    if (!view) return [];
    const by = {
      name: (a, b) => String(a.name).localeCompare(String(b.name)),
      attendance: (a, b) => (a.total.attendance ?? 2) - (b.total.attendance ?? 2),
      late: (a, b) => b.total.late - a.total.late,
      early: (a, b) => b.total.early - a.total.early,
      leave: (a, b) => b.total.leave - a.total.leave,
      wfh: (a, b) => b.total.wfhSelf - a.total.wfhSelf,
      absent: (a, b) => b.total.absent - a.total.absent,
    }[sort];
    return [...view.list].sort(by);
  }, [view, sort]);

  const periodBar = <Chips label="Period" value={period} onChange={setPeriod} options={PERIODS.map(([value, label]) => ({ value, label }))} />;
  const rulesNote = view && (
    <p className="hr-note">
      Late means in after {clock(view.rules.startMin + view.rules.graceMin)}. Left early means the day ended with less than {fmtMinutes(view.rules.fullMin)} worked.
      Attendance counts a half day as half. Days off, holidays and approved leave are not counted against anyone.
    </p>
  );

  if (loading) return <div className="ana">{periodBar}<SkeletonRows rows={6} /></div>;
  if (loadError || !view) return <div className="ana">{periodBar}<ErrorPanel title="Could not load the analytics" error={loadError} onRetry={load} /></div>;

  if (own) {
    const me = view.list[0];
    return (
      <section className="ana" aria-label="My analytics">
        <div className="hr-head-row">
          <div><h2 className="section-title">My analytics</h2><p className="hr-note" style={{ margin: '2px 0 0' }}>{view.range}</p></div>
          {periodBar}
        </div>
        {me ? <PersonAnalytics person={me} /> : <EmptyPanel icon={BarChart3} title="Nothing to show yet" text="Your figures appear here once attendance is recorded." />}
        {rulesNote}
      </section>
    );
  }

  const { team } = view;
  const open = openId != null ? view.list.find(p => String(p.id) === String(openId)) : null;
  const tiles = [
    { label: 'Team attendance', value: pct(team.attendance), icon: UserCheck, tone: 'primary', sub: view.range },
    { label: 'Late arrivals', value: fmtNum(team.late), icon: Clock, tone: team.late > 0 ? 'warn' : 'good', sub: team.inN ? `${pct(team.late / team.inN)} of the days people came in` : 'No punches yet' },
    { label: 'Left early', value: fmtNum(team.early), icon: LogOut, tone: team.early > 0 ? 'warn' : 'good', sub: `Under ${fmtMinutes(view.rules.fullMin)} worked` },
    { label: 'Leave days', value: fmtNum(team.leave), icon: Plane, sub: `${plural(team.leaveAsked, 'request')} asked` },
    { label: 'Work from home asked', value: fmtNum(team.wfhSelf), icon: Home, sub: `${plural(team.wfhAsked, 'request')}${team.officeDays ? ` · ${plural(team.officeDays, 'office-wide day')}` : ''}` },
    { label: 'Hours a day', value: team.avgWorked == null ? '—' : fmtMinutes(Math.round(team.avgWorked)), icon: Timer, tone: 'brand', sub: `${plural(team.absent, 'absence')} in the period` },
  ];
  const top = (k, pick = p => p.total[k]) => [...view.list].map(p => ({ name: p.name, value: pick(p) })).filter(r => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);

  return (
    <div className="ana">
      <div className="hr-head-row">
        {periodBar}
        <label className="ana-sort"><span>Sort by</span>
          <select className="mac-select" value={sort} onChange={e => setSort(e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
      </div>
      {view.list.length === 0 ? <EmptyPanel icon={BarChart3} title="No active employees" text="Analytics appear here once employees have attendance." /> : (
        <>
          <Kpis cols={6} items={tiles} />
          <div className="ana-two">
            <IbcsCard what="Late arrivals by employee" unit="days" when={view.range}>
              <IbcsBars tone="warn" rows={top('late')} format={fmtNum} empty="Nobody came in late in this period." />
            </IbcsCard>
            <IbcsCard what="Early exits by employee" unit="days" when={view.range}>
              <IbcsBars tone="warn" rows={top('early')} format={fmtNum} empty="Nobody left early in this period." />
            </IbcsCard>
            <IbcsCard what="Leave days by employee" unit="days" when={view.range}>
              <IbcsBars rows={top('leave')} format={fmtNum} empty="No leave taken in this period." />
            </IbcsCard>
            <IbcsCard what="Work from home they asked for" unit="days" when={view.range}>
              <IbcsBars rows={top('wfhSelf')} format={fmtNum} empty="Nobody worked from home on their own request." />
            </IbcsCard>
          </div>
          <section className="mac-card hr-card">
            <div><h2 className="section-title">By employee</h2><p className="hr-note" style={{ margin: '2px 0 0' }}>Click a person for their month-by-month detail.</p></div>
            <div className="table-wrap">
              <table className="data-table ana-table">
                <thead><tr><th>Employee</th><th className="num">Attendance</th><th className="num">Present</th><th className="num">Late</th><th className="num">Left early</th><th className="num">Half</th><th className="num">Absent</th><th className="num">Leave days</th><th className="num">WFH asked</th><th className="num">Usually in</th><th className="num">Usually out</th><th className="num">Hours a day</th></tr></thead>
                <tbody>
                  {sorted.map(p => {
                    const a = p.total;
                    return (
                      <tr key={p.id} className="is-click" tabIndex={0} onClick={() => setOpenId(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(p.id); } }}>
                        <td><div className="hr-person"><Avatar name={p.name} /><div><div className="cell-main">{p.name}</div><div className="cell-sub">{p.leaveReq.asked + p.wfhReq.asked ? `${plural(p.leaveReq.asked, 'leave request')} · ${p.wfhReq.asked} WFH` : 'No requests'}</div></div></div></td>
                        <td className="num"><span className={a.attendance != null && a.attendance < 0.9 ? 'ana-warn' : 'cell-main'}>{pct(a.attendance)}</span></td>
                        <td className="num">{fmtNum(a.present)}</td>
                        <td className="num">{a.late ? <span className="ana-warn">{fmtNum(a.late)}</span> : '0'}</td>
                        <td className="num">{a.early ? <span className="ana-warn">{fmtNum(a.early)}</span> : '0'}</td>
                        <td className="num">{fmtNum(a.half)}</td>
                        <td className="num">{a.absent ? <span className="amount-out">{fmtNum(a.absent)}</span> : '0'}</td>
                        <td className="num">{fmtNum(a.leave)}</td>
                        <td className="num">{fmtNum(a.wfhSelf)}</td>
                        <td className="num">{clock(a.avgIn)}</td>
                        <td className="num">{clock(a.avgOut)}</td>
                        <td className="num">{a.avgWorked == null ? '—' : fmtMinutes(Math.round(a.avgWorked))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          {rulesNote}
        </>
      )}
      <Drawer isOpen={!!open} onClose={() => setOpenId(null)} title={open?.name || 'Employee'} subtitle={`Attendance analytics · ${view.range}`} width={860}>
        {open && <PersonAnalytics person={open} />}
      </Drawer>
    </div>
  );
}
