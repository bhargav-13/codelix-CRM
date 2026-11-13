import { useState, useEffect, useMemo } from 'react';
import { workActivity, todayISO, fmtMinutes, parseDuration, taskKey, isOverdue } from '../../lib/work';
import { Avatar, EmptyNote, FF, samePerson } from './ui';
import { ChevronLeft, ChevronRight, Trash2, Download, Plus } from 'lucide-react';

const C = { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a', grid: 'rgba(0,0,0,0.06)', muted: '#AEAEB2' };
const DAY = 86400000;
const d0 = iso => new Date(iso.slice(0, 10) + 'T00:00:00');
const isoOf = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const mondayOf = iso => { const d = d0(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoOf(d); };
const addDays = (iso, n) => isoOf(new Date(d0(iso).getTime() + n * DAY));

function Card({ title, sub, children }) {
  return (
    <div className="mac-card" style={{ padding: 16, minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 650 }}>{title}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 10 }}>{sub}</div>}
      {children}
    </div>
  );
}

function Legend({ items }) {
  return <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: '#6E6E73', marginBottom: 6, flexWrap: 'wrap' }}>
    {items.map(([l, c, dash]) => <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: dash ? 0 : 8, borderTop: dash ? `2px dashed ${c}` : 'none', background: dash ? 'none' : c, borderRadius: 2 }} />{l}</span>)}
  </div>;
}

// Simple line chart (one ₹-free numeric axis), hover shows values
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
        const pts = s.values.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean);
        return <path key={s.name} d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('')} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />;
      })}
      {series.filter(s => !s.dash).map(s => s.values.map((v, i) => v == null ? null : <circle key={s.name + i} cx={x(i)} cy={y(v)} r="3" fill={s.color} stroke="#fff" strokeWidth="1.5" />))}
      {xs.map((_, i) => <rect key={i} x={x(i) - (W / xs.length) / 2} y={0} width={W / xs.length} height={H} fill="transparent" onMouseEnter={() => setHi(i)} />)}
      {hi != null && <g>
        <line x1={x(hi)} x2={x(hi)} y1={pt} y2={H - pb} stroke="rgba(0,0,0,0.2)" />
        {series.map(s => s.values[hi] != null && <circle key={s.name} cx={x(hi)} cy={y(s.values[hi])} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />)}
        <g transform={`translate(${Math.min(x(hi) + 8, W - 150)}, ${pt + 4})`}>
          <rect width="142" height={18 + series.length * 15} rx="6" fill="#fff" stroke="rgba(0,0,0,0.1)" />
          <text x="8" y="14" fontSize="10.5" fontWeight="600" fill="#1D1D1F">{xs[hi]}</text>
          {series.map((s, k) => <text key={s.name} x="8" y={29 + k * 15} fontSize="10.5" fill="#48484A">{s.name}: {s.values[hi] ?? '—'}</text>)}
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
          <rect x={cx - band / 2} y={0} width={band} height={H} fill={hi === i ? 'rgba(0,0,0,0.03)' : 'transparent'} />
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
    workActivity.statusEvents(ids ? ids.split(',') : []).then(e => { if (!off) setEvents(e); }).catch(() => !off && setEvents([]));
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

  if (events == null) return <EmptyNote>Loading reports…</EmptyNote>;

  // burndown
  let burn = null;
  if (sprint?.startDate && sprint?.endDate) {
    const st = tasks.filter(t => t.sprintId === sprint.id);
    const usePts = st.some(t => +t.storyPoints > 0);
    const w = t => usePts ? (+t.storyPoints || 0) : 1;
    const total = st.reduce((a, t) => a + w(t), 0);
    const days = Math.max(1, Math.round((d0(sprint.endDate) - d0(sprint.startDate)) / DAY));
    const xs = [], ideal = [], actual = [];
    for (let i = 0; i <= days; i++) {
      const day = addDays(sprint.startDate, i);
      xs.push(day.slice(5));
      ideal.push(Math.round((total - (total * i) / days) * 10) / 10);
      if (day > todayISO()) { actual.push(null); continue; }
      const doneBy = st.filter(t => { const d = doneAt.get(t.id); return (d && d.slice(0, 10) <= day) || (!d && t.status === 'Done' && (t.updatedAt || '').slice(0, 10) <= day); });
      actual.push(total - doneBy.reduce((a, t) => a + w(t), 0));
    }
    burn = { xs, ideal, actual, unit: usePts ? 'points' : 'issues', total };
  }

  // velocity
  const completed = projSprints.filter(s => s.status === 'completed').slice(-6);
  const vel = completed.map(s => {
    const st = tasks.filter(t => t.sprintId === s.id);
    return { name: s.name.replace(/^.*Sprint\s*/i, 'S'), done: st.filter(t => t.status === 'Done').reduce((a, t) => a + (+t.storyPoints || 1), 0), total: st.reduce((a, t) => a + (+t.storyPoints || 1), 0) };
  });

  // created vs resolved, last 8 weeks
  const wk0 = addDays(mondayOf(todayISO()), -7 * 7);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(wk0, i * 7));
  const bucket = iso => { const m = mondayOf(iso); const i = weeks.indexOf(m); return i; };
  const created = weeks.map(() => 0), resolved = weeks.map(() => 0);
  tasks.forEach(t => { const i = t.createdAt ? bucket(t.createdAt.slice(0, 10)) : -1; if (i >= 0) created[i]++; });
  doneAt.forEach(at => { const i = bucket(at.slice(0, 10)); if (i >= 0) resolved[i]++; });

  // cycle time & on-time
  const cycles = [...doneAt.entries()].map(([id, d]) => { const s = startedAt.get(id); return s ? (new Date(d) - new Date(s)) / DAY : null; }).filter(v => v != null && v >= 0);
  const avgCycle = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null;
  const dueDone = tasks.filter(t => t.status === 'Done' && t.dueDate);
  const onTime = dueDone.filter(t => { const d = doneAt.get(t.id) || t.updatedAt; return d && d.slice(0, 10) <= t.dueDate; }).length;
  const open = tasks.filter(t => t.status !== 'Done');
  const overdueBy = ctx.people.map(p => ({ p, n: open.filter(t => isOverdue(t) && t.assignees.some(a => samePerson(a, p))).length })).filter(x => x.n).sort((a, b) => b.n - a.n);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="rg-4">
        {[
          ['Open issues', open.length],
          ['Overdue', open.filter(isOverdue).length],
          ['Avg. cycle time', avgCycle == null ? '—' : `${avgCycle.toFixed(1)} days`],
          ['Done on time', dueDone.length ? `${Math.round((onTime / dueDone.length) * 100)}%` : '—'],
        ].map(([l, v]) => <div key={l} className="mac-card" style={{ padding: '14px 16px' }}><div style={{ fontSize: 11.5, color: '#6E6E73' }}>{l}</div><div style={{ fontSize: 22, fontWeight: 680, marginTop: 4 }}>{v}</div></div>)}
      </div>

      <div className="rg-2">
        <Card title="Sprint burndown" sub={sprint ? `${sprint.name}${burn ? ` · ${burn.total} ${burn.unit}` : ''}` : 'No sprint yet — create one in Backlog'}>
          {projSprints.length > 1 && <select className="mac-select" value={sprint?.id || ''} onChange={e => setSprintId(e.target.value)} style={{ width: 'auto', fontSize: 12, marginBottom: 8 }} aria-label="Sprint">{projSprints.map(s => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}</select>}
          {burn ? <><Legend items={[['Remaining', C.blue], ['Ideal', '#8E8E93', true]]} /><LineChart xs={burn.xs} series={[{ name: 'Remaining', values: burn.actual, color: C.blue }, { name: 'Ideal', values: burn.ideal, color: '#8E8E93', dash: true }]} /></> : <EmptyNote>Give the sprint start and end dates to see its burndown.</EmptyNote>}
        </Card>
        <Card title="Velocity" sub="Points (or issues) finished per completed sprint">
          {vel.length ? <><Legend items={[['Done', C.aqua], ['In sprint', '#C7C7CC']]} /><Bars xs={vel.map(v => v.name)} series={[{ name: 'Done', values: vel.map(v => v.done), color: C.aqua }, { name: 'In sprint', values: vel.map(v => v.total), color: '#C7C7CC' }]} /></> : <EmptyNote>Complete a sprint to start measuring velocity.</EmptyNote>}
        </Card>
        <Card title="Created vs resolved" sub="Issues per week, last 8 weeks">
          <Legend items={[['Created', C.blue], ['Resolved', C.orange]]} />
          <Bars xs={weeks.map(w => w.slice(5))} series={[{ name: 'Created', values: created, color: C.blue }, { name: 'Resolved', values: resolved, color: C.orange }]} />
        </Card>
        <Card title="Overdue by person" sub="Open issues past their due date">
          {overdueBy.length ? overdueBy.map(({ p, n }) => (
            <div key={`${p.kind}:${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
              <Avatar p={p} size={22} ring={false} /><span style={{ flex: 1, fontSize: 13 }}>{p.name}</span><strong style={{ color: '#D70015' }}>{n}</strong>
            </div>
          )) : <EmptyNote>Nothing overdue 🎉</EmptyNote>}
        </Card>
      </div>
    </div>
  );
}

// ── TIMESHEET ─────────────────────────────────────────────────────
export function TimesheetView({ logs, tasks, ctx, me, isPartner, canLog, onCreate, onRemove }) {
  const [week, setWeek] = useState(mondayOf(todayISO()));
  const [who, setWho] = useState(`${me.kind}:${me.id}`);
  const [form, setForm] = useState({ taskId: '', logDate: todayISO(), duration: '', note: '' });
  const [err, setErr] = useState('');
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const people = isPartner ? ctx.people : ctx.people.filter(p => samePerson(p, me));
  const person = people.find(p => `${p.kind}:${p.id}` === who) || me;
  const isMe = samePerson(person, me);
  const mine = logs.filter(l => samePerson({ kind: l.personKind, id: l.personId }, person) && l.logDate >= days[0] && l.logDate <= days[6]);
  const rows = [...new Set(mine.map(l => l.taskId || 'none'))].map(id => ({ id, task: tasks.find(t => t.id === id) || ctx.taskById(id) }));
  const cell = (tid, d) => mine.filter(l => (l.taskId || 'none') === tid && l.logDate === d).reduce((a, l) => a + l.minutes, 0);
  const dayTotal = d => mine.filter(l => l.logDate === d).reduce((a, l) => a + l.minutes, 0);
  const weekTotal = mine.reduce((a, l) => a + l.minutes, 0);
  const byProject = {};
  logs.filter(l => l.logDate >= days[0] && l.logDate <= days[6]).forEach(l => { const k = ctx.projectName(l.projectId) || 'No project'; byProject[k] = (byProject[k] || 0) + l.minutes; });

  async function submit() {
    setErr('');
    const minutes = parseDuration(form.duration);
    if (!minutes) return setErr('Enter time like 1h 30m, 1.5 or 45m');
    if (minutes > 24 * 60) return setErr('Max 24h per entry');
    const t = tasks.find(x => x.id === form.taskId);
    try {
      await onCreate({ taskId: form.taskId || null, projectId: t?.projectId || null, logDate: form.logDate, minutes, note: form.note });
      setForm(f => ({ ...f, duration: '', note: '' }));
    } catch (e) { setErr(e.message); }
  }

  function exportCSV() {
    const lines = [['Date', 'Person', 'Issue', 'Project', 'Hours', 'Note']];
    logs.filter(l => l.logDate >= days[0] && l.logDate <= days[6]).forEach(l => {
      const t = ctx.taskById(l.taskId);
      lines.push([l.logDate, l.personName, t ? `${taskKey(t, ctx.projects)} ${t.title}` : '', ctx.projectName(l.projectId) || '', (l.minutes / 60).toFixed(2), l.note]);
    });
    const csv = lines.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `timesheet-${days[0]}.csv`; a.click();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="mac-btn mac-btn-secondary" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><ChevronLeft size={14} /></button>
        <span style={{ fontWeight: 650, fontSize: 13.5 }}>Week of {d0(week).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <button className="mac-btn mac-btn-secondary" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><ChevronRight size={14} /></button>
        <button className="mac-btn mac-btn-ghost" style={{ fontSize: 12 }} onClick={() => setWeek(mondayOf(todayISO()))}>This week</button>
        {isPartner && <select className="mac-select" value={who} onChange={e => setWho(e.target.value)} style={{ width: 'auto', fontSize: 12.5 }} aria-label="Person">{people.map(p => <option key={`${p.kind}:${p.id}`} value={`${p.kind}:${p.id}`}>{p.name}</option>)}</select>}
        <span style={{ marginLeft: 'auto' }} />
        {isPartner && <button onClick={exportCSV} className="mac-btn mac-btn-secondary" style={{ fontSize: 12.5 }}><Download size={13} /> Week CSV (everyone)</button>}
      </div>

      {canLog && isMe && (
        <div className="mac-card" style={{ padding: 14, display: 'grid', gridTemplateColumns: 'minmax(200px,2fr) 140px 120px minmax(140px,2fr) auto', gap: 8, alignItems: 'end' }}>
          <FF label="Issue"><select className="mac-select" value={form.taskId} onChange={e => setForm({ ...form, taskId: e.target.value })}><option value="">— General / no issue —</option>{tasks.filter(t => t.status !== 'Done' || t.id === form.taskId).map(t => <option key={t.id} value={t.id}>{taskKey(t, ctx.projects)} {t.title}</option>)}</select></FF>
          <FF label="Date"><input type="date" className="mac-input" value={form.logDate} max={todayISO()} onChange={e => setForm({ ...form, logDate: e.target.value })} /></FF>
          <FF label="Time"><input className="mac-input" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="1h 30m" onKeyDown={e => e.key === 'Enter' && submit()} /></FF>
          <FF label="Note"><input className="mac-input" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="What did you work on?" onKeyDown={e => e.key === 'Enter' && submit()} /></FF>
          <button onClick={submit} className="mac-btn mac-btn-primary" style={{ fontSize: 13, height: 36 }}><Plus size={13} /> Log</button>
          {err && <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#D70015' }}>{err}</div>}
        </div>
      )}

      <div className="mac-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="wk-table">
            <thead><tr><th>Issue</th>{days.map(d => <th key={d} style={{ textAlign: 'right' }}>{d0(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })}</th>)}<th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: C.muted, padding: 20 }}>No time logged this week</td></tr>}
              {rows.map(r => (
                <tr key={r.id} style={{ cursor: 'default' }}>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.task ? `${taskKey(r.task, ctx.projects)} ${r.task.title}` : 'General'}</td>
                  {days.map(d => <td key={d} style={{ textAlign: 'right', color: cell(r.id, d) ? '#1D1D1F' : '#D1D1D6' }}>{cell(r.id, d) ? fmtMinutes(cell(r.id, d)) : '·'}</td>)}
                  <td style={{ textAlign: 'right', fontWeight: 650 }}>{fmtMinutes(days.reduce((a, d) => a + cell(r.id, d), 0))}</td>
                </tr>
              ))}
              {rows.length > 0 && <tr style={{ background: 'rgba(0,0,0,0.025)', cursor: 'default' }}><td style={{ fontWeight: 650 }}>Total</td>{days.map(d => <td key={d} style={{ textAlign: 'right', fontWeight: 600 }}>{dayTotal(d) ? fmtMinutes(dayTotal(d)) : ''}</td>)}<td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMinutes(weekTotal)}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rg-2">
        <Card title="Entries" sub={`${person.name} · this week`}>
          {mine.length === 0 ? <EmptyNote>Nothing yet</EmptyNote> : mine.sort((a, b) => b.logDate.localeCompare(a.logDate)).map(l => {
            const t = ctx.taskById(l.taskId);
            return (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', fontSize: 12.5 }}>
                <span style={{ color: C.muted, minWidth: 74 }}>{l.logDate}</span>
                <strong style={{ minWidth: 54 }}>{fmtMinutes(l.minutes)}</strong>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t ? `${taskKey(t, ctx.projects)} ${t.title}` : 'General'}{l.note ? <span style={{ color: '#8E8E93' }}> — {l.note}</span> : null}</span>
                {(isMe || isPartner) && <button onClick={() => { if (window.confirm('Delete this time entry?')) onRemove(l.id); }} className="mac-btn mac-btn-ghost" style={{ padding: 4 }} aria-label="Delete entry"><Trash2 size={12} color="#FF3B30" /></button>}
              </div>
            );
          })}
        </Card>
        {isPartner && (
          <Card title="Hours by project" sub="Everyone, this week — use with salaries to see project cost">
            {Object.keys(byProject).length === 0 ? <EmptyNote>No hours logged</EmptyNote> : Object.entries(byProject).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', fontSize: 12.5 }}><span>{k}</span><strong>{fmtMinutes(v)}</strong></div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
