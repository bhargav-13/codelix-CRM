import { useState, useMemo } from 'react';
import { STATUSES, PRIORITIES, taskKey, isOverdue, todayISO, fmtMinutes } from '../../lib/work';
import { TypeGlyph, PriorityGlyph, AvatarStack, StatusPill, LabelPill, Avatar, EmptyNote, samePerson } from './ui';
import { ChevronLeft, ChevronRight, ArrowUpDown, Trash2 } from 'lucide-react';

const PRIO_RANK = Object.fromEntries(PRIORITIES.map((p, i) => [p, i]));
const STATUS_RANK = Object.fromEntries(STATUSES.map((s, i) => [s, i]));

// ── LIST (sortable, bulk edit) ────────────────────────────────────
export function ListView({ tasks, ctx, onOpen, onBulk, canEdit, canDelete }) {
  const [sort, setSort] = useState({ k: 'key', dir: 1 });
  const [sel, setSel] = useState(new Set());
  const rows = useMemo(() => {
    const val = t => ({
      key: (taskKey(t, ctx.projects)), title: t.title.toLowerCase(), status: STATUS_RANK[t.status], priority: PRIO_RANK[t.priority],
      due: t.dueDate || '9999', points: +t.storyPoints || 0, assignee: t.assignees[0]?.name || 'zzz', updated: t.updatedAt || t.createdAt || '',
    })[sort.k];
    return [...tasks].sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
  }, [tasks, sort, ctx.projects]);
  const th = (k, l) => <th onClick={() => setSort(s => ({ k, dir: s.k === k ? -s.dir : 1 }))} style={{ cursor: 'pointer' }}>{l} {sort.k === k && <ArrowUpDown size={10} />}</th>;
  const all = sel.size === rows.length && rows.length > 0;
  const bulk = async patch => { await onBulk([...sel], patch); setSel(new Set()); };

  if (!tasks.length) return <EmptyNote>No issues match these filters.</EmptyNote>;
  return (
    <div className="mac-card" style={{ padding: 0, overflow: 'hidden' }}>
      {sel.size > 0 && (canEdit || canDelete) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(0,113,227,0.06)', flexWrap: 'wrap', fontSize: 12.5 }}>
          <strong>{sel.size} selected</strong>
          {canEdit && <>
            <select className="mac-select" defaultValue="" onChange={e => e.target.value && bulk({ status: e.target.value })} style={{ width: 'auto', fontSize: 12 }}><option value="">Set status…</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
            <select className="mac-select" defaultValue="" onChange={e => e.target.value && bulk({ priority: e.target.value })} style={{ width: 'auto', fontSize: 12 }}><option value="">Set priority…</option>{PRIORITIES.map(s => <option key={s}>{s}</option>)}</select>
            <select className="mac-select" defaultValue="" onChange={e => { const p = ctx.people.find(x => `${x.kind}:${x.id}` === e.target.value); if (p) bulk({ assignees: [{ id: p.id, name: p.name, kind: p.kind }] }); else if (e.target.value === 'none') bulk({ assignees: [] }); }} style={{ width: 'auto', fontSize: 12 }}>
              <option value="">Assign to…</option><option value="none">Unassigned</option>{ctx.people.map(p => <option key={`${p.kind}:${p.id}`} value={`${p.kind}:${p.id}`}>{p.name}</option>)}
            </select>
            {ctx.sprintsForBulk.length > 0 && <select className="mac-select" defaultValue="" onChange={e => e.target.value && bulk({ sprintId: e.target.value === 'backlog' ? null : e.target.value })} style={{ width: 'auto', fontSize: 12 }}><option value="">Move to sprint…</option><option value="backlog">Backlog</option>{ctx.sprintsForBulk.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
          </>}
          {canDelete && <button onClick={() => { if (window.confirm(`Delete ${sel.size} issue(s)? This cannot be undone.`)) bulk({ __delete: true }); }} className="mac-btn mac-btn-danger" style={{ fontSize: 12 }}><Trash2 size={12} /> Delete</button>}
          <button onClick={() => setSel(new Set())} className="mac-btn mac-btn-ghost" style={{ fontSize: 12 }}>Clear</button>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="wk-table">
          <thead><tr>
            <th style={{ width: 30 }}><input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map(r => r.id)))} aria-label="Select all" /></th>
            {th('key', 'Key')}{th('title', 'Summary')}{th('status', 'Status')}{th('priority', 'P')}{th('assignee', 'Assignee')}{th('due', 'Due')}{th('points', 'Pts')}<th>Sprint</th><th>Labels</th>{th('updated', 'Updated')}
          </tr></thead>
          <tbody>
            {rows.map(t => (
              <tr key={t.id} onClick={() => onOpen(t)} style={{ background: sel.has(t.id) ? 'rgba(0,113,227,0.05)' : undefined }}>
                <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(t.id)} onChange={() => setSel(s => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })} aria-label={`Select ${t.title}`} /></td>
                <td style={{ whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><TypeGlyph type={t.type} />{taskKey(t, ctx.projects)}</span></td>
                <td style={{ maxWidth: 360 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.parentId && ctx.taskById(t.parentId) ? <span style={{ color: '#AEAEB2' }}>{ctx.taskById(t.parentId).title} / </span> : null}{t.title}</div></td>
                <td><StatusPill status={t.status} small /></td>
                <td><PriorityGlyph priority={t.priority} /></td>
                <td><AvatarStack people={t.assignees} size={20} /></td>
                <td style={{ color: isOverdue(t) ? '#D70015' : undefined, whiteSpace: 'nowrap' }}>{t.dueDate || '—'}</td>
                <td>{t.storyPoints ?? '—'}</td>
                <td style={{ whiteSpace: 'nowrap', color: '#6E6E73' }}>{ctx.sprintName(t.sprintId) || '—'}</td>
                <td><span style={{ display: 'inline-flex', gap: 3 }}>{t.labels.slice(0, 2).map(l => <LabelPill key={l} label={l} />)}</span></td>
                <td style={{ color: '#AEAEB2', whiteSpace: 'nowrap' }}>{(t.updatedAt || t.createdAt || '').slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CALENDAR (by due date) ────────────────────────────────────────
export function CalendarView({ tasks, ctx, onOpen }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(startDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const byDay = useMemo(() => {
    const map = {};
    tasks.forEach(t => { if (t.dueDate) (map[t.dueDate] ||= []).push(t); });
    return map;
  }, [tasks]);
  const iso = d => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const noDue = tasks.filter(t => !t.dueDate && t.status !== 'Done').length;
  return (
    <div className="mac-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <button className="mac-btn mac-btn-secondary" onClick={() => setCursor(new Date(y, m - 1, 1))} aria-label="Previous month"><ChevronLeft size={14} /></button>
        <span style={{ fontWeight: 650, fontSize: 14, minWidth: 140, textAlign: 'center' }}>{cursor.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</span>
        <button className="mac-btn mac-btn-secondary" onClick={() => setCursor(new Date(y, m + 1, 1))} aria-label="Next month"><ChevronRight size={14} /></button>
        <button className="mac-btn mac-btn-ghost" style={{ fontSize: 12 }} onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#AEAEB2' }}>{noDue} open issue{noDue === 1 ? '' : 's'} without a due date</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', gap: 4, minWidth: 780 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} style={{ fontSize: 11, fontWeight: 600, color: '#8E8E93', padding: '2px 6px' }}>{d}</div>)}
          {cells.map((d, i) => {
            const list = d ? byDay[iso(d)] || [] : [];
            const today = d && iso(d) === todayISO();
            return (
              <div key={i} style={{ minHeight: 92, borderRadius: 8, padding: 5, background: d ? (today ? 'rgba(0,113,227,0.06)' : 'rgba(0,0,0,0.02)') : 'transparent', border: today ? '1px solid rgba(0,113,227,0.3)' : '1px solid transparent' }}>
                {d && <div style={{ fontSize: 11, fontWeight: today ? 700 : 500, color: today ? '#0071E3' : '#8E8E93', marginBottom: 3 }}>{d}</div>}
                {list.slice(0, 4).map(t => (
                  <button key={t.id} onClick={() => onOpen(t)} title={t.title} className="wk-cal-item" style={{ textDecoration: t.status === 'Done' ? 'line-through' : 'none', borderLeftColor: t.status === 'Done' ? '#34C759' : isOverdue(t) ? '#FF3B30' : '#0071E3' }}>
                    {taskKey(t, ctx.projects)} {t.title}
                  </button>
                ))}
                {list.length > 4 && <div style={{ fontSize: 10.5, color: '#8E8E93' }}>+{list.length - 4} more</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── TIMELINE (Gantt by start → due) ───────────────────────────────
export function TimelineView({ tasks, ctx, onOpen }) {
  const items = tasks.filter(t => t.startDate || t.dueDate).map(t => ({ t, s: t.startDate || t.dueDate, e: t.dueDate || t.startDate }))
    .map(x => (x.s > x.e ? { ...x, s: x.e, e: x.s } : x));
  const [weeks, setWeeks] = useState(12);
  if (!items.length) return <EmptyNote>Add start and due dates to issues to see them on the timeline.</EmptyNote>;
  const DAY = 86400000;
  const today = new Date(todayISO() + 'T00:00:00');
  const start = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY - 14 * DAY);
  const span = weeks * 7;
  const pos = iso => (new Date(iso + 'T00:00:00') - start) / DAY;
  // epics first, children grouped under them
  const epics = items.filter(x => x.t.type === 'Epic');
  const rest = items.filter(x => x.t.type !== 'Epic');
  const ordered = [];
  epics.forEach(e => { ordered.push({ ...e, depth: 0 }); rest.filter(x => x.t.parentId === e.t.id).forEach(c => ordered.push({ ...c, depth: 1 })); });
  rest.filter(x => !epics.some(e => e.t.id === x.t.parentId)).forEach(x => ordered.push({ ...x, depth: 0 }));
  const color = t => t.type === 'Epic' ? '#AF52DE' : t.status === 'Done' ? '#34C759' : isOverdue(t) ? '#FF3B30' : '#0071E3';
  return (
    <div className="mac-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#8E8E93' }}>Bars run from start date to due date</span>
        <select className="mac-select" value={weeks} onChange={e => setWeeks(+e.target.value)} style={{ width: 'auto', fontSize: 12, marginLeft: 'auto' }} aria-label="Range">
          {[6, 12, 26].map(w => <option key={w} value={w}>{w} weeks</option>)}
        </select>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 260 + weeks * 70, position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `260px repeat(${weeks}, 1fr)`, fontSize: 10.5, color: '#8E8E93', borderBottom: '1px solid rgba(0,0,0,0.07)', paddingBottom: 4 }}>
            <span />
            {Array.from({ length: weeks }, (_, i) => { const d = new Date(start.getTime() + i * 7 * DAY); return <span key={i}>{d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>; })}
          </div>
          {ordered.map(({ t, s, e, depth }) => {
            const a = Math.max(0, pos(s)), b = Math.min(span, pos(e) + 1);
            const visible = b > 0 && a < span;
            return (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '260px 1fr', alignItems: 'center', height: 30, borderBottom: '1px solid rgba(0,0,0,0.035)' }}>
                <button onClick={() => onOpen(t)} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: depth * 16, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, textAlign: 'left', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <TypeGlyph type={t.type} size={14} /><span style={{ color: '#8E8E93' }}>{taskKey(t, ctx.projects)}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                </button>
                <div style={{ position: 'relative', height: '100%' }}>
                  <div style={{ position: 'absolute', left: `${(pos(todayISO()) / span) * 100}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,59,48,0.5)' }} />
                  {visible && <div onClick={() => onOpen(t)} title={`${s} → ${e}`} style={{ position: 'absolute', left: `${(a / span) * 100}%`, width: `${Math.max(0.8, ((b - a) / span) * 100)}%`, top: 8, height: 14, borderRadius: 4, background: color(t), opacity: t.status === 'Done' ? 0.55 : 0.9, cursor: 'pointer' }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── WORKLOAD (capacity per person) ────────────────────────────────
export function WorkloadView({ tasks, ctx, logs }) {
  const weekStart = (() => { const d = new Date(todayISO() + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const rows = ctx.people.map(p => {
    const mine = tasks.filter(t => t.assignees.some(a => samePerson(a, p)));
    const open = mine.filter(t => t.status !== 'Done');
    return {
      p, open: open.length, inProgress: open.filter(t => t.status === 'In Progress' || t.status === 'In Review').length,
      overdue: open.filter(isOverdue).length, points: open.reduce((a, t) => a + (+t.storyPoints || 0), 0),
      estimate: open.reduce((a, t) => a + (+t.estimateHours || 0), 0),
      doneWeek: mine.filter(t => t.status === 'Done' && (t.updatedAt || '').slice(0, 10) >= weekStart).length,
      logged: logs.filter(l => samePerson({ kind: l.personKind, id: l.personId }, p) && l.logDate >= weekStart).reduce((a, l) => a + l.minutes, 0),
    };
  }).filter(r => r.open || r.logged || r.doneWeek).sort((a, b) => b.open - a.open);
  const unassigned = tasks.filter(t => !t.assignees.length && t.status !== 'Done').length;
  const maxOpen = Math.max(1, ...rows.map(r => r.open));
  if (!rows.length) return <EmptyNote>No assigned work in this view.</EmptyNote>;
  return (
    <div className="mac-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="wk-table">
          <thead><tr><th>Person</th><th>Open issues</th><th>In progress</th><th>Overdue</th><th>Open points</th><th>Estimate left</th><th>Done this week</th><th>Logged this week</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.p.kind}:${r.p.id}`} style={{ cursor: 'default' }}>
                <td style={{ whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar p={r.p} size={22} ring={false} />{r.p.name}</span></td>
                <td style={{ minWidth: 160 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.05)' }}><div style={{ width: `${(r.open / maxOpen) * 100}%`, height: '100%', borderRadius: 4, background: '#2a78d6' }} /></div>
                    <span style={{ fontWeight: 600, minWidth: 18 }}>{r.open}</span>
                  </div>
                </td>
                <td>{r.inProgress}</td>
                <td style={{ color: r.overdue ? '#D70015' : undefined, fontWeight: r.overdue ? 650 : 400 }}>{r.overdue}</td>
                <td>{r.points || '—'}</td>
                <td>{r.estimate ? `${r.estimate}h` : '—'}</td>
                <td>{r.doneWeek}</td>
                <td>{r.logged ? fmtMinutes(r.logged) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unassigned > 0 && <div style={{ padding: '10px 14px', fontSize: 12, color: '#B25E00', borderTop: '1px solid rgba(0,0,0,0.05)' }}>{unassigned} open issue{unassigned === 1 ? ' has' : 's have'} no assignee.</div>}
    </div>
  );
}
