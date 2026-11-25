import { useState, useEffect, useMemo } from 'react';
import { workActivity, fmtMinutes, parseDuration, taskKey } from '../../lib/work';
import { Avatar, EmptyNote, samePerson, personKey, addDays, mondayOf, dayOf, isoOf, shortDate, isLate } from './ui';
import { Field, StatTiles, SkeletonRows, useToast, todayLocal, fmtDate } from '../ui/kit';
import { ChevronLeft, ChevronRight, Trash2, Download, Plus, CircleDot, AlarmClock, Timer, CalendarCheck } from 'lucide-react';

const C = { blue: 'var(--brand)', orange: 'var(--warn)', aqua: 'var(--good)', grey: 'var(--ink-3)', grid: 'var(--line)', muted: 'var(--ink-3)', ink: 'var(--ink)', surface: 'var(--surface)' };
const DAY = 86400000;
const localDay = ts => isoOf(new Date(ts));

function Card({ title, sub, children }) {
  return (
    <div className="mac-card wk-cardpad">
      <div className="wk-card-h">{title}</div>
      {sub && <div className="wk-card-sub">{sub}</div>}
      {children}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="wk-legend">
      {items.map(([l, c, dash]) => <span key={l}><i style={{ width: 14, height: dash ? 0 : 8, borderTop: dash ? `2px dashed ${c}` : 'none', background: dash ? 'none' : c, borderRadius: 2 }} />{l}</span>)}
    </div>
  );
}

// Simple line chart (one numeric axis), hover shows values
function LineChart({ xs, series, height = 200 }) {
  const [hi, setHi] = useState(null);
  const W = 640, H = height, pl = 34, pr = 8, pt = 8, pb = 22;
  const max = Math.max(1, ...series.flatMap(s => s.values.filter(v => v != null)));
  const x = i => pl + (i / Math.max(1, xs.length - 1)) * (W - pl - pr);
  const y = v => pt + (1 - v / max) * (H - pt - pb);
  const every = Math.ceil(xs.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Line chart" onMouseLeave={() => setHi(null)}>
      {[0, 0.5, 1].map(f => <g key={f}><line x1={pl} x2={W - pr} y1={y(max * f)} y2={y(max * f)} stroke={C.grid} /><text x={pl - 6} y={y(max * f)} dy="0.32em" textAnchor="end" fontSize="10" fill={C.muted}>{Math.round(max * f)}</text></g>)}
      {xs.map((l, i) => i % every === 0 && <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={C.muted}>{l}</text>)}
      {series.map(s => {
        const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
        return <path key={s.name} d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('')} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />;
      })}
      {series.filter(s => !s.dash).map(s => s.values.map((v, i) => (v == null ? null : <circle key={s.name + i} cx={x(i)} cy={y(v)} r="3" fill={s.color} stroke={C.surface} strokeWidth="1.5" />)))}
      {xs.map((_, i) => <rect key={i} x={x(i) - (W / xs.length) / 2} y={0} width={W / xs.length} height={H} fill="transparent" onMouseEnter={() => setHi(i)} />)}
      {hi != null && <g>
        <line x1={x(hi)} x2={x(hi)} y1={pt} y2={H - pb} stroke={C.muted} />
        {series.map(s => s.values[hi] != null && <circle key={s.name} cx={x(hi)} cy={y(s.values[hi])} r="4" fill={s.color} stroke={C.surface} strokeWidth="2" />)}
        <g transform={`translate(${Math.min(x(hi) + 8, W - 150)}, ${pt + 4})`}>
          <rect width="142" height={18 + series.length * 15} rx="6" fill={C.surface} stroke={C.muted} />
          <text x="8" y="14" fontSize="10.5" fontWeight="600" fill={C.ink}>{xs[hi]}</text>
          {series.map((s, k) => <text key={s.name} x="8" y={29 + k * 15} fontSize="10.5" fill={C.ink}>{s.name}: {s.values[hi] ?? '—'}</text>)}
        </g>
      </g>}
    </svg>
  );
}

function Bars({ xs, series, height = 180 }) {
  const [hi, setHi] = useState(null);
  const W = 640, H = height, pl = 30, pb = 22, pt = 8;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const band = (W - pl) / Math.max(1, xs.length);
  const bw = Math.min(22, (band - 8) / series.length - 2);
  const y = v => pt + (1 - v / max) * (H - pt - pb);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Bar chart" onMouseLeave={() => setHi(null)}>
      {[0, 0.5, 1].map(f => <g key={f}><line x1={pl} x2={W} y1={y(max * f)} y2={y(max * f)} stroke={C.grid} /><text x={pl - 6} y={y(max * f)} dy="0.32em" textAnchor="end" fontSize="10" fill={C.muted}>{Math.round(max * f)}</text></g>)}
      {xs.map((l, i) => {
        const cx = pl + band * i + band / 2;
        return <g key={i} onMouseEnter={() => setHi(i)}>
          <rect x={cx - band / 2} y={0} width={band} height={H} fill={hi === i ? C.grid : 'transparent'} />
          {series.map((s, k) => {
            const v = s.values[i]; const x0 = cx - (series.length * (bw + 2)) / 2 + k * (bw + 2);
            const h = Math.max(0, (H - pb) - y(v));
            return h > 0 ? <rect key={s.name} x={x0} y={y(v)} width={bw} height={h} rx="3" fill={s.color}><title>{`${l} · ${s.name}: ${v}`}</title></rect> : null;
          })}
          <text x={cx} y={H - 6} textAnchor="middle" fontSize="10" fill={C.muted}>{l}</text>
        </g>;
      })}
    </svg>
  );
}

// ── REPORTS ───────────────────────────────────────────────────────
export function ReportsView({ tasks, sprints, project, ctx }) {
  const [events, setEvents] = useState(null);
  const ids = useMemo(() => tasks.map(t => t.id).sort().join(','), [tasks]);
  useEffect(() => {
    let off = false;
    workActivity.statusEvents(ids ? ids.split(',') : []).then(e => { if (!off) setEvents(e); }).catch(() => { if (!off) setEvents([]); });
    return () => { off = true; };
  }, [ids]);

  const projSprints = sprints.filter(s => !project || s.projectId === project.id);
  const [sprintId, setSprintId] = useState('');
  const sprint = projSprints.find(s => s.id === sprintId) || projSprints.find(s => s.status === 'active') || projSprints.filter(s => s.status === 'completed').slice(-1)[0];

  const doneAt = useMemo(() => {
    const m = new Map();
    (events || []).forEach(e => { if (e.to === 'Done') m.set(e.taskId, e.at); else if (e.from === 'Done') m.delete(e.taskId); });
    return m;
  }, [events]);
  const startedAt = useMemo(() => {
    const m = new Map();
    (events || []).forEach(e => { if (e.to === 'In Progress' && !m.has(e.taskId)) m.set(e.taskId, e.at); });
    return m;
  }, [events]);

  if (events == null) return <SkeletonRows rows={5} />;
  const today = todayLocal();

  // burndown
  let burn = null;
  if (sprint?.startDate && sprint?.endDate) {
    const st = tasks.filter(t => t.sprintId === sprint.id);
    const usePts = st.some(t => +t.storyPoints > 0);
    const w = t => (usePts ? (+t.storyPoints || 0) : 1);
    const total = st.reduce((a, t) => a + w(t), 0);
    const days = Math.max(1, Math.round((dayOf(sprint.endDate) - dayOf(sprint.startDate)) / DAY));
    const xs = [], ideal = [], actual = [];
    for (let i = 0; i <= days; i++) {
      const day = addDays(sprint.startDate, i);
      xs.push(shortDate(day));
      ideal.push(Math.round((total - (total * i) / days) * 10) / 10);
      if (day > today) { actual.push(null); continue; }
      const doneBy = st.filter(t => { const d = doneAt.get(t.id); return (d && localDay(d) <= day) || (!d && t.status === 'Done' && t.updatedAt && localDay(t.updatedAt) <= day); });
      actual.push(total - doneBy.reduce((a, t) => a + w(t), 0));
    }
    burn = { xs, ideal, actual, unit: usePts ? 'points' : 'tasks', total };
  }

  // velocity
  const completed = projSprints.filter(s => s.status === 'completed').slice(-6);
  const vel = completed.map(s => {
    const st = tasks.filter(t => t.sprintId === s.id);
    return { name: s.name.replace(/^.*Sprint\s*/i, 'S'), done: st.filter(t => t.status === 'Done').reduce((a, t) => a + (+t.storyPoints || 1), 0), total: st.reduce((a, t) => a + (+t.storyPoints || 1), 0) };
  });

  // created vs resolved, last 8 weeks
  const wk0 = addDays(mondayOf(today), -7 * 7);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(wk0, i * 7));
  const bucket = ts => weeks.indexOf(mondayOf(localDay(ts)));
  const created = weeks.map(() => 0), resolved = weeks.map(() => 0);
  tasks.forEach(t => { const i = t.createdAt ? bucket(t.createdAt) : -1; if (i >= 0) created[i]++; });
  doneAt.forEach(at => { const i = bucket(at); if (i >= 0) resolved[i]++; });

  // cycle time & on-time
  const cycles = [...doneAt.entries()].map(([id, d]) => { const s = startedAt.get(id); return s ? (new Date(d) - new Date(s)) / DAY : null; }).filter(v => v != null && v >= 0);
  const avgCycle = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null;
  const dueDone = tasks.filter(t => t.status === 'Done' && t.dueDate);
  const onTime = dueDone.filter(t => { const d = doneAt.get(t.id) || t.updatedAt; return d && localDay(d) <= t.dueDate; }).length;
  const open = tasks.filter(t => t.status !== 'Done');
  const late = open.filter(isLate);
  const overdueBy = ctx.people.map(p => ({ p, n: late.filter(t => t.assignees.some(a => samePerson(a, p))).length })).filter(x => x.n).sort((a, b) => b.n - a.n);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <StatTiles items={[
        { label: 'Open tasks', value: open.length, icon: CircleDot },
        { label: 'Overdue', value: late.length, icon: AlarmClock, tone: late.length ? 'bad' : undefined },
        { label: 'Avg. cycle time', value: avgCycle == null ? '—' : `${avgCycle.toFixed(1)} days`, sub: 'In progress → done', icon: Timer },
        { label: 'Done on time', value: dueDone.length ? `${Math.round((onTime / dueDone.length) * 100)}%` : '—', sub: dueDone.length ? `${onTime} of ${dueDone.length} with a due date` : 'No finished tasks with a due date', icon: CalendarCheck, tone: 'good' },
      ]} />

      <div className="rg-2">
        <Card title="Sprint burndown" sub={sprint ? `${sprint.name}${burn ? ` · ${burn.total} ${burn.unit}` : ''}` : 'No sprint yet — create one in a project’s Backlog'}>
          {projSprints.length > 1 && <select className="mac-select" value={sprint?.id || ''} onChange={e => setSprintId(e.target.value)} style={{ width: 'auto', marginBottom: 8 }} aria-label="Sprint">{projSprints.map(s => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}</select>}
          {burn ? <><Legend items={[['Remaining', C.blue], ['Ideal', C.grey, true]]} /><LineChart xs={burn.xs} series={[{ name: 'Remaining', values: burn.actual, color: C.blue }, { name: 'Ideal', values: burn.ideal, color: C.grey, dash: true }]} /></> : <EmptyNote>Give the sprint start and end dates to see its burndown.</EmptyNote>}
        </Card>
        <Card title="Velocity" sub="Points (or tasks) finished per completed sprint">
          {vel.length ? <><Legend items={[['Done', C.aqua], ['In sprint', C.grey]]} /><Bars xs={vel.map(v => v.name)} series={[{ name: 'Done', values: vel.map(v => v.done), color: C.aqua }, { name: 'In sprint', values: vel.map(v => v.total), color: C.grey }]} /></> : <EmptyNote>Complete a sprint to start measuring velocity.</EmptyNote>}
        </Card>
        <Card title="Created vs resolved" sub="Tasks per week, last 8 weeks">
          <Legend items={[['Created', C.blue], ['Resolved', C.orange]]} />
          <Bars xs={weeks.map(shortDate)} series={[{ name: 'Created', values: created, color: C.blue }, { name: 'Resolved', values: resolved, color: C.orange }]} />
        </Card>
        <Card title="Overdue by person" sub="Open tasks past their due date">
          {overdueBy.length ? overdueBy.map(({ p, n }) => (
            <div key={personKey(p)} className="wk-entry">
              <Avatar p={p} size={24} ring={false} /><span className="what">{p.name}</span><strong className="wk-late">{n}</strong>
            </div>
          )) : <EmptyNote>Nothing is overdue.</EmptyNote>}
        </Card>
      </div>
    </div>
  );
}

// ── TIMESHEET ─────────────────────────────────────────────────────
export function TimesheetView({ logs, tasks, ctx, me, isPartner, canLog, onCreate, onRemove, askConfirm }) {
  const toast = useToast();
  const [week, setWeek] = useState(() => mondayOf(todayLocal()));
  const [who, setWho] = useState(personKey(me));
  const [form, setForm] = useState(() => ({ taskId: '', logDate: todayLocal(), duration: '', note: '' }));
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const people = isPartner ? ctx.people : ctx.people.filter(p => samePerson(p, me));
  const person = people.find(p => personKey(p) === who) || me;
  const isMe = samePerson(person, me);
  const inWeek = logs.filter(l => l.logDate >= days[0] && l.logDate <= days[6]);
  const mine = inWeek.filter(l => samePerson({ kind: l.personKind, id: l.personId }, person));
  const rows = [...new Set(mine.map(l => l.taskId || 'none'))].map(id => ({ id, task: ctx.taskById(id) }));
  const cell = (tid, d) => mine.filter(l => (l.taskId || 'none') === tid && l.logDate === d).reduce((a, l) => a + l.minutes, 0);
  const dayTotal = d => mine.filter(l => l.logDate === d).reduce((a, l) => a + l.minutes, 0);
  const weekTotal = mine.reduce((a, l) => a + l.minutes, 0);
  const byProject = {};
  inWeek.forEach(l => { const k = ctx.projectName(l.projectId) || 'No project'; byProject[k] = (byProject[k] || 0) + l.minutes; });
  const entries = [...mine].sort((a, b) => b.logDate.localeCompare(a.logDate));
  const label = t => `${taskKey(t, ctx.projects)} ${t.title}`;

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    const minutes = parseDuration(form.duration);
    if (!minutes) return setErr('Enter time like 1h 30m, 1.5 or 45m');
    if (minutes > 24 * 60) return setErr('24 hours is the most one entry can hold');
    setErr(''); setSaving(true);
    const t = ctx.taskById(form.taskId);
    try {
      await onCreate({ taskId: form.taskId || null, projectId: t?.projectId || null, logDate: form.logDate, minutes, note: form.note });
      toast.success(`Logged ${fmtMinutes(minutes)}`);
      setForm(f => ({ ...f, duration: '', note: '' }));
    } catch (x) { toast.error('Could not log the time', x); }
    setSaving(false);
  }

  function exportCSV() {
    const lines = [['Date', 'Person', 'Issue', 'Project', 'Hours', 'Note']];
    inWeek.forEach(l => {
      const t = ctx.taskById(l.taskId);
      lines.push([l.logDate, l.personName, t ? label(t) : '', ctx.projectName(l.projectId) || '', (l.minutes / 60).toFixed(2), l.note]);
    });
    const csv = lines.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `timesheet-${days[0]}.csv`; a.click();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="toolbar">
        <button className="icon-btn" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><ChevronLeft size={16} /></button>
        <strong>Week of {fmtDate(week)}</strong>
        <button className="icon-btn" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><ChevronRight size={16} /></button>
        <button className="mac-btn mac-btn-ghost" onClick={() => setWeek(mondayOf(todayLocal()))}>This week</button>
        {isPartner && <select className="mac-select" value={personKey(person)} onChange={e => setWho(e.target.value)} aria-label="Person">{people.map(p => <option key={personKey(p)} value={personKey(p)}>{p.name}</option>)}</select>}
        <div className="toolbar-right">
          <span>{fmtMinutes(weekTotal)} this week</span>
          {isPartner && <button onClick={exportCSV} className="mac-btn mac-btn-secondary"><Download size={14} /> Week CSV (everyone)</button>}
        </div>
      </div>

      {canLog && isMe && (
        <form className="mac-card wk-tsform" onSubmit={submit}>
          <Field label="Task"><select className="mac-select" value={form.taskId} onChange={e => setForm({ ...form, taskId: e.target.value })}><option value="">General — no task</option>{tasks.filter(t => t.status !== 'Done' || t.id === form.taskId).map(t => <option key={t.id} value={t.id}>{label(t)}</option>)}</select></Field>
          <Field label="Date"><input type="date" className="mac-input" value={form.logDate} max={todayLocal()} onChange={e => setForm({ ...form, logDate: e.target.value })} /></Field>
          <Field label="Time" required error={err}><input className="mac-input" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="1h 30m" inputMode="text" /></Field>
          <Field label="Note"><input className="mac-input" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="What did you work on?" /></Field>
          <button type="submit" disabled={saving} className="mac-btn mac-btn-primary"><Plus size={14} /> {saving ? 'Saving…' : 'Log time'}</button>
        </form>
      )}

      <div className="mac-card" style={{ overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Task</th>{days.map(d => <th key={d} className="num">{dayOf(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })}</th>)}<th className="num">Total</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="faint" style={{ textAlign: 'center', padding: 24 }}>No time logged this week</td></tr>}
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="wk-ellipsis" style={{ maxWidth: 300 }}>{r.task ? label(r.task) : 'General'}</td>
                  {days.map(d => { const v = cell(r.id, d); return <td key={d} className={`num ${v ? '' : 'faint'}`}>{v ? fmtMinutes(v) : '·'}</td>; })}
                  <td className="num"><strong>{fmtMinutes(days.reduce((a, d) => a + cell(r.id, d), 0))}</strong></td>
                </tr>
              ))}
              {rows.length > 0 && <tr><td><strong>Total</strong></td>{days.map(d => <td key={d} className="num"><strong>{dayTotal(d) ? fmtMinutes(dayTotal(d)) : ''}</strong></td>)}<td className="num"><strong>{fmtMinutes(weekTotal)}</strong></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rg-2">
        <Card title="Entries" sub={`${person.name} · this week`}>
          {entries.length === 0 ? <EmptyNote>Nothing logged yet</EmptyNote> : entries.map(l => {
            const t = ctx.taskById(l.taskId);
            return (
              <div key={l.id} className="wk-entry">
                <span className="when">{shortDate(l.logDate)}</span>
                <strong style={{ minWidth: 54 }}>{fmtMinutes(l.minutes)}</strong>
                <span className="what">{t ? label(t) : 'General'}{l.note ? <span className="muted"> — {l.note}</span> : null}</span>
                {(isMe || isPartner) && <button className="wk-x" aria-label="Delete entry" onClick={() => askConfirm({ title: 'Delete time entry', message: `Delete the ${fmtMinutes(l.minutes)} entry from ${shortDate(l.logDate)}? This cannot be undone.`, run: () => onRemove(l.id) })}><Trash2 size={14} /></button>}
              </div>
            );
          })}
        </Card>
        {isPartner && (
          <Card title="Hours by project" sub="Everyone, this week — use with salaries to see project cost">
            {Object.keys(byProject).length === 0 ? <EmptyNote>No hours logged</EmptyNote> : Object.entries(byProject).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k} className="wk-entry"><span className="what">{k}</span><strong>{fmtMinutes(v)}</strong></div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
