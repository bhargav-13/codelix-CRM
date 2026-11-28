// An employee's month, day by day: what was recorded and how much of each day is paid.
// The figures follow the payroll rule exactly: pay = monthly salary / days in the month x paid days,
// where an absence is not paid, a half day is half paid, and weekly offs, holidays and paid leave are.
import { useMemo, useState } from 'react';
import Badge from '../ui/Badge';
import Kpis from '../crm/Kpis';
import { fmtMoney } from '../ui/kit';
import { isWeeklyOff, statusMeta, fmtMinutes, fmtNum, fmtTime, WEEKDAY_LABEL, weekdayOf, dayOfMonth, monthLabel } from '../../lib/hr';
import { CalendarCheck, CalendarX, IndianRupee, TrendingUp } from 'lucide-react';

const TONE = { present: 'green', late: 'orange', half: 'purple', absent: 'red', leave: 'blue', holiday: 'gray', off: 'gray', none: 'gray', untracked: 'gray' };

// Why the day is paid the way it is, in a few words
function reason(d, unpaid, isToday, future) {
  if (future) return 'Not yet';
  if (d.beforeJoining) return 'Before your joining date';
  switch (d.status) {
    case 'PRESENT': return isToday && !d.punchOut ? 'Present so far' : 'Full day';
    case 'LATE': return 'Full day, marked late';
    case 'HALF_DAY': return unpaid > 0 ? 'Half day: half is paid' : 'Half day';
    case 'ABSENT': return 'Absent: not paid';
    case 'ON_LEAVE': return unpaid >= 1 ? 'Unpaid leave' : unpaid > 0 ? 'Leave, partly unpaid' : 'Paid leave';
    case 'HOLIDAY': return d.holidayName ? `Holiday: ${d.holidayName}` : 'Paid holiday';
    case 'WEEKLY_OFF': return 'Paid weekly off';
    case 'NOT_TRACKED': return 'Before attendance started: paid';
    default: return isToday ? 'Counts when you punch in' : 'Nothing recorded';
  }
}

export default function PayableDays({ month, days, summary, today, salary }) {
  const [showAll, setShowAll] = useState(false);
  const calc = useMemo(() => {
    const list = [...(days || [])].sort((a, b) => a.date.localeCompare(b.date));
    const perDay = salary > 0 && list.length ? salary / list.length : 0;
    const rows = [];
    let running = 0, unpaidSoFar = 0, elapsed = 0;
    for (const d of list) {
      const future = !!today && d.date > today;
      const unpaid = future ? 0 : Math.min(1, Math.max(0, +d.unpaid || 0));
      const paid = future ? null : 1 - unpaid;
      if (!future) { running += paid; unpaidSoFar += unpaid; elapsed += 1; }
      rows.push({ d, future, unpaid, paid, running: future ? null : running });
    }
    return { rows, perDay, paidSoFar: running, unpaidSoFar, elapsed, total: list.length };
  }, [days, salary, today]);

  const s = summary || {};
  const { rows, perDay, paidSoFar, unpaidSoFar, elapsed, total } = calc;
  const shown = showAll ? rows : rows.filter(r => !r.future);
  const hidden = rows.length - shown.length;
  const money = n => fmtMoney(Math.round(n));
  const tiles = [
    { label: 'Paid days so far', value: fmtNum(paidSoFar), icon: CalendarCheck, tone: 'good', sub: `Out of ${elapsed} day${elapsed === 1 ? '' : 's'} gone by` },
    { label: 'Unpaid days so far', value: fmtNum(unpaidSoFar), icon: CalendarX, tone: unpaidSoFar > 0 ? 'bad' : 'good', sub: unpaidSoFar > 0 ? (perDay ? `${money(perDay * unpaidSoFar)} less this month` : 'Absences and half days') : 'Nothing lost this month' },
    { label: 'Month, if nothing more is lost', value: s.payableDays != null ? fmtNum(s.payableDays) : '—', icon: TrendingUp, tone: 'brand', sub: `Paid days out of ${total}` },
    perDay
      ? { label: 'Earned so far', value: money(perDay * paidSoFar), icon: IndianRupee, tone: 'primary', sub: `${money(perDay)} a day · ${fmtMoney(salary)} a month` }
      : { label: 'Hours worked', value: fmtMinutes(s.workedMinutes), icon: IndianRupee, sub: 'This month' },
  ];

  return (
    <section className="mac-card hr-card pay-days" aria-label="Paid days, day by day">
      <div className="hr-head-row">
        <div>
          <h2 className="section-title">Paid days, day by day</h2>
          <p className="hr-note" style={{ margin: '2px 0 0' }}>{monthLabel(month)}. A day off, a holiday and paid leave are paid; an absence is not; a half day is half paid.</p>
        </div>
      </div>
      <Kpis cols={4} items={tiles} />
      <div className="table-wrap">
        <table className="data-table pay-table">
          <thead>
            <tr><th>Date</th><th>Status</th><th>In</th><th>Out</th><th className="num">Worked</th><th>Why</th><th className="num">Paid</th><th className="num">Paid so far</th>{perDay > 0 && <th className="num">Amount</th>}</tr>
          </thead>
          <tbody>
            {shown.map(({ d, future, unpaid, paid, running }) => {
              const m = statusMeta(future ? 'NOT_MARKED' : d.status);
              const isToday = d.date === today;
              return (
                <tr key={d.date} className={`${isToday ? 'is-today' : ''} ${future ? 'is-future' : ''} ${unpaid >= 1 ? 'is-unpaid' : unpaid > 0 ? 'is-part' : ''}`}>
                  <td><span className={`pay-date ${isWeeklyOff(d.date) ? 'is-off' : ''}`}><b>{dayOfMonth(d.date)}</b>{WEEKDAY_LABEL[weekdayOf(d.date)]}{isToday && <em>Today</em>}</span></td>
                  <td>{future ? <span className="faint">—</span> : <Badge color={TONE[m.tone] || 'gray'}>{m.label}</Badge>}</td>
                  <td>{d.punchIn ? fmtTime(d.punchIn) : <span className="faint">—</span>}</td>
                  <td>{d.punchOut ? fmtTime(d.punchOut) : d.punchIn && !future ? <span className="pay-miss">{isToday ? 'Not yet' : 'Missing'}</span> : <span className="faint">—</span>}</td>
                  <td className="num">{d.workedMinutes ? fmtMinutes(d.workedMinutes) : <span className="faint">—</span>}</td>
                  <td className="pay-why">{reason(d, unpaid, isToday, future)}{d.workFromHome ? ' · from home' : ''}{d.corrected ? ' · corrected' : ''}</td>
                  <td className="num">{future ? <span className="faint">—</span> : <span className={`pay-chip ${paid >= 1 ? 'full' : paid > 0 ? 'half' : 'none'}`}>{paid >= 1 ? '1' : paid > 0 ? fmtNum(paid) : '0'}</span>}</td>
                  <td className="num">{running == null ? <span className="faint">—</span> : fmtNum(running)}</td>
                  {perDay > 0 && <td className="num">{future ? <span className="faint">—</span> : money(perDay * paid)}</td>}
                </tr>
              );
            })}
          </tbody>
          {elapsed > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6}>So far this month ({elapsed} day{elapsed === 1 ? '' : 's'})</td>
                <td className="num">{fmtNum(paidSoFar)}</td>
                <td className="num">{fmtNum(paidSoFar)}</td>
                {perDay > 0 && <td className="num">{money(perDay * paidSoFar)}</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {(hidden > 0 || showAll) && rows.some(r => r.future) && (
        <button type="button" className="mac-btn mac-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Hide the days still to come' : `Show the ${hidden} day${hidden === 1 ? '' : 's'} still to come`}
        </button>
      )}
      <p className="hr-note">These are the days payroll will pay for. The final salary can also include a bonus or a deduction a partner adds when the month is closed.</p>
    </section>
  );
}
