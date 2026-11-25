import { useState, useMemo } from 'react';
import { STATUSES, PRIORITIES, taskKey, fmtMinutes } from '../../lib/work';
import { TypeGlyph, PriorityGlyph, AvatarStack, StatusPill, StatusSelect, LabelPill, Avatar, QuickAdd, samePerson, personKey, asPerson, isLate, shortDate, addDays, mondayOf, dayOf, isoOf, plural } from './ui';
import { EmptyPanel, todayLocal } from '../ui/kit';
import { ChevronLeft, ChevronRight, ChevronDown, ArrowUp, ArrowDown, Trash2, Circle, CheckCircle2, CalendarClock, ListChecks, SearchX, GanttChart, Users } from 'lucide-react';

const PRIO_RANK = Object.fromEntries(PRIORITIES.map((p, i) => [p, i]));
const STATUS_RANK = Object.fromEntries(STATUSES.map((s, i) => [s, i]));
const DAY = 86400000;

// ── MY WORK (what is assigned to me, grouped by when it is due) ───
const GROUPS = [['overdue', 'Overdue'], ['today', 'Today'], ['week', 'This week'], ['later', 'Later'], ['none', 'No date']];

export function MyWorkView({ tasks, doneToday, ctx, onOpen, onStatus, canEdit, canCreate, onQuickAdd, filtering, onClearFilters, onCreate }) {
  const [closed, setClosed] = useState({ done: true });
  const groups = useMemo(() => {
    const today = todayLocal(), weekEnd = addDays(today, 7);
    const g = { overdue: [], today: [], week: [], later: [], none: [] };
    for (const t of tasks) g[!t.dueDate ? 'none' : t.dueDate < today ? 'overdue' : t.dueDate === today ? 'today' : t.dueDate <= weekEnd ? 'week' : 'later'].push(t);
    for (const list of Object.values(g)) list.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || PRIO_RANK[a.priority] - PRIO_RANK[b.priority]);
    return g;
  }, [tasks]);
  const toggle = k => setClosed(c => ({ ...c, [k]: !c[k] }));
  const sections = [...GROUPS.map(([k, label]) => ({ k, label, list: groups[k] })), { k: 'done', label: 'Done today', list: doneToday }].filter(s => s.list.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {canCreate && <QuickAdd className="card" onAdd={onQuickAdd} placeholder="Add a task…" label="Add a task for yourself" />}
      {tasks.length === 0 && (filtering
        ? <EmptyPanel icon={SearchX} title="Nothing matches your filters" text="Try a different search, or clear the filters to see all of your tasks." action={<button className="mac-btn mac-btn-secondary" onClick={onClearFilters}>Clear filters</button>} />
        : <EmptyPanel icon={ListChecks} title="Nothing on your plate" text="No open tasks are assigned to you right now." action={canCreate ? <button className="mac-btn mac-btn-primary" onClick={onCreate}>Create a task</button> : null} />)}
      {sections.map(({ k, label, list }) => (
        <section key={k} className="mac-card wk-group">
          <button className={`wk-group-head ${k === 'overdue' ? 'bad' : ''}`} onClick={() => toggle(k)} aria-expanded={!closed[k]}>
            {closed[k] ? <ChevronRight size={15} /> : <ChevronDown size={15} />}{label} <span className="n">{list.length}</span>
          </button>
          {!closed[k] && list.map(t => <MyRow key={t.id} t={t} ctx={ctx} onOpen={onOpen} onStatus={onStatus} canEdit={canEdit} />)}
        </section>
      ))}
    </div>
  );
}

function MyRow({ t, ctx, onOpen, onStatus, canEdit }) {
  const done = t.status === 'Done';
  const late = isLate(t);
  const project = ctx.projectName(t.projectId);
  return (
    <div className="wk-item">
      {canEdit && (
        <button className={`wk-check ${done ? 'done' : ''}`} onClick={() => onStatus(t, done ? 'To Do' : 'Done')} aria-label={done ? `Reopen “${t.title}”` : `Mark “${t.title}” done`} title={done ? 'Reopen' : 'Mark done'}>
          {done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        </button>
      )}
      <button className="wk-item-main" onClick={() => onOpen(t)} style={canEdit ? undefined : { paddingLeft: 8 }}>
        <span className={`wk-item-title ${done ? 'done' : ''}`}>{t.title}</span>
        <span className="wk-meta">
          <TypeGlyph type={t.type} size={14} />
          <span className="wk-key">{taskKey(t, ctx.projects)}</span>
          {project && <span className="wk-hide-sm">{project}</span>}
          {t.dueDate && <span className={late ? 'wk-late' : ''}><CalendarClock size={12} />{late ? 'Was due ' : 'Due '}{shortDate(t.dueDate)}</span>}
          <PriorityGlyph priority={t.priority} size={13} />
        </span>
      </button>
      {canEdit ? <StatusSelect status={t.status} onChange={s => onStatus(t, s)} label={`Status of “${t.title}”`} /> : <StatusPill status={t.status} />}
    </div>
  );
}

// ── LIST (sortable, bulk edit) ────────────────────────────────────
const COLS = [['key', 'Key'], ['title', 'Task'], ['status', 'Status'], ['priority', 'Priority'], ['assignee', 'Assignee'], ['due', 'Due'], ['points', 'Pts']];

export function ListView({ tasks, ctx, onOpen, onBulk, onBulkDelete, canEdit, canDelete, filtering, onClearFilters }) {
  const [sort, setSort] = useState({ k: 'key', dir: 1 });
  const [sel, setSel] = useState(() => new Set());
  const rows = useMemo(() => {
    const val = t => ({
      key: taskKey(t, ctx.projects), title: t.title.toLowerCase(), status: STATUS_RANK[t.status], priority: PRIO_RANK[t.priority],
      due: t.dueDate || '9999', points: +t.storyPoints || 0, assignee: t.assignees[0]?.name || 'zzz', updated: t.updatedAt || t.createdAt || '',
    })[sort.k];
    return [...tasks].sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
  }, [tasks, sort, ctx.projects]);
  const picked = rows.filter(r => sel.has(r.id)).map(r => r.id);   // ignores selections that are filtered out
  const all = picked.length === rows.length && rows.length > 0;
  const clear = () => setSel(new Set());
  const bulk = async patch => { await onBulk(picked, patch); clear(); };
  const th = (k, l) => (
    <th key={k} aria-sort={sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button className="wk-sort" onClick={() => setSort(s => ({ k, dir: s.k === k ? -s.dir : 1 }))}>{l}{sort.k === k && (sort.dir > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}</button>
    </th>
  );

  if (!tasks.length) {
    return filtering
      ? <EmptyPanel icon={SearchX} title="Nothing matches your filters" text="Try a different search or clear the filters." action={<button className="mac-btn mac-btn-secondary" onClick={onClearFilters}>Clear filters</button>} />
      : <EmptyPanel icon={ListChecks} title="No tasks here yet" text="Tasks you create in this view will show up here." />;
  }
  return (
    <>
      <div className="mac-card only-desktop" style={{ overflow: 'hidden' }}>
        {picked.length > 0 && (canEdit || canDelete) && (
          <div className="wk-bulk">
            <strong>{picked.length} selected</strong>
            {canEdit && <>
              <select className="mac-select" value="" onChange={e => e.target.value && bulk({ status: e.target.value })} aria-label="Set status"><option value="">Set status…</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
              <select className="mac-select" value="" onChange={e => e.target.value && bulk({ priority: e.target.value })} aria-label="Set priority"><option value="">Set priority…</option>{PRIORITIES.map(s => <option key={s}>{s}</option>)}</select>
              <select className="mac-select" value="" aria-label="Assign to" onChange={e => { const p = ctx.people.find(x => personKey(x) === e.target.value); if (p) bulk({ assignees: [asPerson(p)] }); else if (e.target.value === 'none') bulk({ assignees: [] }); }}>
                <option value="">Assign to…</option><option value="none">Unassigned</option>{ctx.people.map(p => <option key={personKey(p)} value={personKey(p)}>{p.name}</option>)}
              </select>
              {ctx.sprintsForBulk.length > 0 && <select className="mac-select" value="" aria-label="Move to sprint" onChange={e => e.target.value && bulk({ sprintId: e.target.value === 'backlog' ? null : e.target.value })}><option value="">Move to sprint…</option><option value="backlog">Backlog</option>{ctx.sprintsForBulk.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
            </>}
            {canDelete && <button onClick={() => onBulkDelete(picked, clear)} className="mac-btn mac-btn-danger"><Trash2 size={13} /> Delete</button>}
            <button onClick={clear} className="mac-btn mac-btn-ghost">Clear selection</button>
          </div>
        )}
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              {(canEdit || canDelete) && <th style={{ width: 36 }}><input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map(r => r.id)))} aria-label="Select all" /></th>}
              {COLS.map(([k, l]) => th(k, l))}<th>Sprint</th><th>Labels</th>{th('updated', 'Updated')}
            </tr></thead>
            <tbody>
              {rows.map(t => {
                const parent = t.parentId ? ctx.taskById(t.parentId) : null;
                return (
                  <tr key={t.id} className={`clickable ${sel.has(t.id) ? 'selected' : ''}`} onClick={() => onOpen(t)}>
                    {(canEdit || canDelete) && <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(t.id)} onChange={() => setSel(s => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })} aria-label={`Select ${t.title}`} /></td>}
                    <td style={{ whiteSpace: 'nowrap' }}><span className="wk-inline"><TypeGlyph type={t.type} /><span className="wk-key">{taskKey(t, ctx.projects)}</span></span></td>
                    <td style={{ maxWidth: 360 }}><button type="button" className="wk-row-title cell-main" style={{ display: 'block', width: '100%' }}>{parent && <span className="faint" style={{ fontWeight: 400 }}>{parent.title} / </span>}{t.title}</button></td>
                    <td><StatusPill status={t.status} /></td>
                    <td><span className="wk-inline"><PriorityGlyph priority={t.priority} /><span className="cell-sub">{t.priority}</span></span></td>
                    <td><AvatarStack people={t.assignees} size={22} /></td>
                    <td className={isLate(t) ? 'wk-late' : ''} style={{ whiteSpace: 'nowrap' }}>{t.dueDate ? shortDate(t.dueDate) : '—'}</td>
                    <td className="num">{t.storyPoints ?? '—'}</td>
                    <td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{ctx.sprintName(t.sprintId) || '—'}</td>
                    <td><span className="wk-inline">{t.labels.slice(0, 2).map(l => <LabelPill key={l} label={l} />)}</span></td>
                    <td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{t.updatedAt || t.createdAt ? shortDate(isoOf(new Date(t.updatedAt || t.createdAt))) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="only-mobile">
        <div className="list-cards">
          {rows.map(t => (
            <button key={t.id} className="list-card" onClick={() => onOpen(t)}>
              <span className="cell-main" style={{ overflowWrap: 'anywhere' }}>{t.title}</span>
              <span className="wk-meta">
                <TypeGlyph type={t.type} size={14} /><span className="wk-key">{taskKey(t, ctx.projects)}</span>
                <StatusPill status={t.status} />
                <PriorityGlyph priority={t.priority} size={13} />
                {t.dueDate && <span className={isLate(t) ? 'wk-late' : ''}><CalendarClock size={12} />{shortDate(t.dueDate)}</span>}
                <span style={{ marginLeft: 'auto' }}><AvatarStack people={t.assignees} size={20} /></span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── CALENDAR (by due date) ────────────────────────────────────────
export function CalendarView({ tasks, ctx, onOpen }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [expanded, setExpanded] = useState(null);
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
  const iso = d => isoOf(new Date(y, m, d));
  const today = todayLocal();
  const noDue = tasks.filter(t => !t.dueDate && t.status !== 'Done').length;
  const go = d => { setExpanded(null); setCursor(d); };
  const item = t => (
    <button key={t.id} onClick={() => onOpen(t)} title={t.title} className={`wk-cal-item ${t.status === 'Done' ? 'done' : isLate(t) ? 'late' : ''}`}>
      {taskKey(t, ctx.projects)} {t.title}
    </button>
  );
  const agenda = cells.filter(d => d && byDay[iso(d)]?.length);
  return (
    <div className="mac-card wk-cardpad">
      <div className="wk-cal-bar">
        <button className="icon-btn" onClick={() => go(new Date(y, m - 1, 1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
        <span className="wk-cal-month">{cursor.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</span>
        <button className="icon-btn" onClick={() => go(new Date(y, m + 1, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
        <button className="mac-btn mac-btn-ghost" onClick={() => { const d = new Date(); go(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
        {noDue > 0 && <span className="wk-hint" style={{ marginLeft: 'auto' }}>{plural(noDue, 'open task')} without a due date</span>}
      </div>

      <div className="wk-cal only-desktop">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="wk-cal-dow">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="wk-cal-cell blank" />;
          const list = byDay[iso(d)] || [];
          const open = expanded === d;
          return (
            <div key={i} className={`wk-cal-cell ${iso(d) === today ? 'today' : ''}`}>
              <div className="wk-cal-day">{d}</div>
              {(open ? list : list.slice(0, 4)).map(item)}
              {list.length > 4 && <button className="wk-cal-more" onClick={() => setExpanded(open ? null : d)}>{open ? 'Show less' : `+${list.length - 4} more`}</button>}
            </div>
          );
        })}
      </div>

      <div className="only-mobile wk-agenda">
        {agenda.length === 0 && <div className="wk-note">Nothing is due this month.</div>}
        {agenda.map(d => (
          <div key={d}>
            <div className={`wk-agenda-day ${iso(d) === today ? 'today' : ''}`}>{dayOf(iso(d)).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}{iso(d) === today ? ' · Today' : ''}</div>
            {byDay[iso(d)].map(item)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TIMELINE (Gantt by start → due) ───────────────────────────────
export function TimelineView({ tasks, ctx, onOpen }) {
  const [weeks, setWeeks] = useState(12);
  const items = tasks.filter(t => t.startDate || t.dueDate).map(t => ({ t, s: t.startDate || t.dueDate, e: t.dueDate || t.startDate }))
    .map(x => (x.s > x.e ? { ...x, s: x.e, e: x.s } : x));
  if (!items.length) return <EmptyPanel icon={GanttChart} title="Nothing to plot yet" text="Give tasks a start date and a due date to see them on the timeline." />;
  const today = todayLocal();
  const start = dayOf(addDays(mondayOf(today), -14));
  const span = weeks * 7;
  const pos = iso => Math.round((dayOf(iso) - start) / DAY);
  // epics first, children grouped under them
  const epics = items.filter(x => x.t.type === 'Epic');
  const rest = items.filter(x => x.t.type !== 'Epic');
  const ordered = [];
  epics.forEach(e => { ordered.push({ ...e, depth: 0 }); rest.filter(x => x.t.parentId === e.t.id).forEach(c => ordered.push({ ...c, depth: 1 })); });
  rest.filter(x => !epics.some(e => e.t.id === x.t.parentId)).forEach(x => ordered.push({ ...x, depth: 0 }));
  const tone = t => (t.type === 'Epic' ? 'epic' : t.status === 'Done' ? 'done' : isLate(t) ? 'late' : '');
  const todayLeft = `${(pos(today) / span) * 100}%`;
  return (
    <div className="mac-card wk-cardpad">
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <span className="wk-hint">Bars run from start date to due date</span>
        <div className="toolbar-right">
          <select className="mac-select" value={weeks} onChange={e => setWeeks(+e.target.value)} aria-label="Range">
            {[6, 12, 26].map(w => <option key={w} value={w}>{w} weeks</option>)}
          </select>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 240 + weeks * 64 }}>
          <div className="wk-tl-head" style={{ gridTemplateColumns: `240px repeat(${weeks}, 1fr)` }}>
            <span />
            {Array.from({ length: weeks }, (_, i) => <span key={i}>{shortDate(isoOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i * 7)))}</span>)}
          </div>
          {ordered.map(({ t, s, e, depth }) => {
            const a = Math.max(0, pos(s)), b = Math.min(span, pos(e) + 1);
            const visible = b > 0 && a < span;
            return (
              <div key={t.id} className="wk-tl-row">
                <button onClick={() => onOpen(t)} className="wk-tl-name" style={{ paddingLeft: depth * 16 }}>
                  <TypeGlyph type={t.type} size={14} /><span className="wk-key">{taskKey(t, ctx.projects)}</span><span className="wk-ellipsis">{t.title}</span>
                </button>
                <div className="wk-tl-track">
                  <div className="wk-tl-today" style={{ left: todayLeft }} />
                  {visible && <button onClick={() => onOpen(t)} aria-label={`${t.title}: ${shortDate(s)} to ${shortDate(e)}`} title={`${shortDate(s)} → ${shortDate(e)}`} className={`wk-tl-bar ${tone(t)}`} style={{ left: `${(a / span) * 100}%`, width: `${Math.max(0.8, ((b - a) / span) * 100)}%` }} />}
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
  const today = todayLocal();
  const weekStart = mondayOf(today);
  const rows = ctx.people.map(p => {
    const mine = tasks.filter(t => t.assignees.some(a => samePerson(a, p)));
    const open = mine.filter(t => t.status !== 'Done');
    return {
      p, open: open.length, inProgress: open.filter(t => t.status === 'In Progress' || t.status === 'In Review').length,
      overdue: open.filter(isLate).length, points: open.reduce((a, t) => a + (+t.storyPoints || 0), 0),
      estimate: open.reduce((a, t) => a + (+t.estimateHours || 0), 0),
      doneWeek: mine.filter(t => t.status === 'Done' && t.updatedAt && isoOf(new Date(t.updatedAt)) >= weekStart).length,
      logged: logs.filter(l => samePerson({ kind: l.personKind, id: l.personId }, p) && l.logDate >= weekStart).reduce((a, l) => a + l.minutes, 0),
    };
  }).filter(r => r.open || r.logged || r.doneWeek).sort((a, b) => b.open - a.open);
  const unassigned = tasks.filter(t => !t.assignees.length && t.status !== 'Done').length;
  const maxOpen = Math.max(1, ...rows.map(r => r.open));
  if (!rows.length) return <EmptyPanel icon={Users} title="No assigned work in this view" text={unassigned ? `${plural(unassigned, 'open task')} ${unassigned === 1 ? 'has' : 'have'} no assignee.` : 'Assign tasks to people to see who is carrying what.'} />;
  return (
    <div className="mac-card" style={{ overflow: 'hidden' }}>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Person</th><th>Open tasks</th><th className="num">In progress</th><th className="num">Overdue</th><th className="num">Open points</th><th className="num">Estimate left</th><th className="num">Done this week</th><th className="num">Logged this week</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={personKey(r.p)}>
                <td style={{ whiteSpace: 'nowrap' }}><span className="wk-inline"><Avatar p={r.p} size={24} ring={false} /><span className="cell-main">{r.p.name}</span></span></td>
                <td style={{ minWidth: 160 }}>
                  <div className="wk-inline" style={{ display: 'flex' }}>
                    <div className="wk-meter"><div style={{ width: `${(r.open / maxOpen) * 100}%` }} /></div>
                    <strong style={{ minWidth: 18 }}>{r.open}</strong>
                  </div>
                </td>
                <td className="num">{r.inProgress}</td>
                <td className={`num ${r.overdue ? 'wk-late' : ''}`}>{r.overdue}</td>
                <td className="num">{r.points || '—'}</td>
                <td className="num">{r.estimate ? `${r.estimate}h` : '—'}</td>
                <td className="num">{r.doneWeek}</td>
                <td className="num">{r.logged ? fmtMinutes(r.logged) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unassigned > 0 && <div className="wk-strip" style={{ borderRadius: 0 }}>{plural(unassigned, 'open task')} {unassigned === 1 ? 'has' : 'have'} no assignee.</div>}
    </div>
  );
}
