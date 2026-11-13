import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import { PageLoader } from '../components/ui/CodelixLoader';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { directoryDB, notificationsDB } from '../lib/db';
import { PARTNERS } from '../data/mockData';
import {
  STATUSES, TYPES, PRIORITIES, workTasks, workSprints, workTime, toTask, taskKey, isOverdue, todayISO, fmtMinutes, findMentions,
} from '../lib/work';
import BoardView from '../components/work/BoardView';
import BacklogView from '../components/work/BacklogView';
import { ListView, CalendarView, TimelineView, WorkloadView } from '../components/work/Views';
import { ReportsView, TimesheetView } from '../components/work/Insights';
import TaskDetail from '../components/work/TaskDetail';
import { FF, PeoplePicker, LabelsInput, samePerson } from '../components/work/ui';
import {
  LayoutGrid, Rows3, List, CalendarDays, GanttChart, Users, BarChart3, Timer, Plus, Search, X, Square, RefreshCw, FolderKanban,
} from 'lucide-react';

const VIEWS = [
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'backlog', label: 'Backlog', icon: Rows3, needsProject: true, needsProjects: true },
  { id: 'list', label: 'List', icon: List },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'timeline', label: 'Timeline', icon: GanttChart },
  { id: 'workload', label: 'Workload', icon: Users, partnerOrLead: true },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'timesheet', label: 'Timesheet', icon: Timer, needsTimesheet: true },
];
const TIMER_KEY = 'codelix.timer.v1';
const readTimer = () => { try { return JSON.parse(localStorage.getItem(TIMER_KEY)) || null; } catch { return null; } };
const writeTimer = v => { try { v ? localStorage.setItem(TIMER_KEY, JSON.stringify(v)) : localStorage.removeItem(TIMER_KEY); } catch { /* storage blocked */ } };

export default function Work() {
  const { isPartner, isEmployee, employeeData, displayName, user, can } = useAuth();
  const me = useMemo(() => isEmployee
    ? { kind: 'employee', id: employeeData?.id, name: employeeData?.name || 'Me' }
    : { kind: 'partner', id: displayName || user?.email, name: displayName || user?.email }, [isEmployee, employeeData, displayName, user]);

  const perms = useMemo(() => ({
    manageAll: isPartner,
    create: isPartner || can('tasks', 'create'),
    edit: isPartner || can('tasks', 'edit'),
    deleteOwn: isPartner || can('tasks', 'delete'),
    projects: isPartner || can('projects', 'view'),
    sprints: isPartner || can('projects', 'edit'),
    timesheetView: isPartner || can('timesheet', 'view'),
    timesheet: isPartner || can('timesheet', 'create'),
  }), [isPartner, can]);

  const [tasks, setTasks] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [projects, setProjects] = useState([]);
  const [team, setTeam] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [scope, setScope] = useState(isPartner ? 'all' : 'mine');       // all | mine | <projectId>
  const [view, setView] = useState('board');
  const [q, setQ] = useState('');
  const [fAssignee, setFAssignee] = useState('');
  const [fType, setFType] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fLabel, setFLabel] = useState('');
  const [fEpic, setFEpic] = useState('');
  const [sprintScope, setSprintScope] = useState('active');               // board inside a project: active | all
  const [hideDone, setHideDone] = useState(false);
  // open issue lives in the URL (?issue=<id>) so links and notifications can open it
  const [params, setParams] = useSearchParams();
  const openId = params.get('issue');
  const setOpenId = useCallback(id => setParams(id ? { issue: id } : {}, { replace: !id }), [setParams]);
  const [createDraft, setCreateDraft] = useState(null);
  const [timer, setTimer] = useState(readTimer);
  const [tick, setTick] = useState(0);
  const searchRef = useRef(null);

  const load = useCallback(async () => {
    setError('');
    const since = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
    const [t, s, p, e, l] = await Promise.allSettled([
      workTasks.list(), workSprints.list(), directoryDB.projects(), directoryDB.team(),
      perms.timesheetView ? workTime.list({ from: since }) : Promise.resolve([]),
    ]);
    if (t.status === 'rejected') setError(t.reason?.message || 'Could not load tasks — has supabase/work.sql been run?');
    setTasks(t.value || []); setSprints(s.value || []); setProjects(p.value || []); setTeam(e.value || []); setLogs(l.value || []);
    setLoading(false);
  }, [perms.timesheetView]);
  useEffect(() => { load(); }, [load]);

  // Live updates from other people (RLS decides which rows we receive)
  useEffect(() => {
    const ch = supabase.channel('work-tasks-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
        if (payload.eventType === 'DELETE') setTasks(ts => ts.filter(t => t.id !== payload.old.id));
        else { const nt = toTask(payload.new); setTasks(ts => ts.some(t => t.id === nt.id) ? ts.map(t => t.id === nt.id ? nt : t) : [...ts, nt]); }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // timer tick (once a minute is plenty for display)
  useEffect(() => { if (!timer) return; const i = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(i); }, [timer]);

  // keyboard: "c" create, "/" search
  useEffect(() => {
    const onKey = e => {
      if (e.target.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'c' && perms.create && !openId && !createDraft) { e.preventDefault(); openCreate(); }
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });


  // ── derived ─────────────────────────────────────────────────────
  const people = useMemo(() => [
    ...PARTNERS.map(p => ({ id: p, name: p, kind: 'partner', role: 'Partner' })),
    ...team.filter(e => e.status === 'Active').map(e => ({ id: e.id, name: e.name, kind: 'employee', role: e.role })),
  ], [team]);
  const byId = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
  const project = projects.find(p => p.id === scope) || null;
  const activeSprint = project ? sprints.find(s => s.projectId === project.id && s.status === 'active') : null;

  const ctx = useMemo(() => ({
    projects, people, tasks, sprints,
    taskById: id => (id ? byId.get(id) : null),
    childrenOf: id => tasks.filter(t => t.parentId === id),
    sprintName: id => sprints.find(s => s.id === id)?.name || '',
    projectName: id => { const p = projects.find(x => x.id === id); return p ? `${p.key ? p.key + ' · ' : ''}${p.projectName}` : ''; },
    loggedFor: id => logs.filter(l => l.taskId === id).reduce((a, l) => a + l.minutes, 0),
    allLabels: [...new Set(tasks.flatMap(t => t.labels || []))].sort(),
    sprintsForBulk: project ? sprints.filter(s => s.projectId === project.id && s.status !== 'completed') : [],
  }), [projects, people, tasks, sprints, byId, logs, project]);

  const isMine = useCallback(t => t.assignees.some(a => samePerson(a, me)) || t.reporter === me.name || (t.watchers || []).some(w => samePerson(w, me)), [me]);

  const scoped = useMemo(() => tasks.filter(t => {
    if (scope === 'mine') return isMine(t);
    if (scope === 'all') return true;
    if (scope === 'none') return !t.projectId;
    return t.projectId === scope;
  }), [tasks, scope, isMine]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return scoped.filter(t => {
      if (s && !(`${taskKey(t, projects)} ${t.title} ${t.description} ${(t.labels || []).join(' ')}`.toLowerCase().includes(s))) return false;
      if (fAssignee === 'me' && !t.assignees.some(a => samePerson(a, me))) return false;
      if (fAssignee === 'none' && t.assignees.length) return false;
      if (fAssignee && !['me', 'none'].includes(fAssignee) && !t.assignees.some(a => `${a.kind}:${a.id}` === fAssignee)) return false;
      if (fType && t.type !== fType) return false;
      if (fPriority && t.priority !== fPriority) return false;
      if (fLabel && !(t.labels || []).includes(fLabel)) return false;
      if (fEpic && t.parentId !== fEpic && t.id !== fEpic) return false;
      if (hideDone && t.status === 'Done') return false;
      return true;
    });
  }, [scoped, q, fAssignee, fType, fPriority, fLabel, fEpic, hideDone, me, projects]);

  // Board inside a project with an active sprint shows that sprint (Jira-style)
  const boardTasks = useMemo(() => {
    const base = filtered.filter(t => t.type !== 'Epic');
    if (project && activeSprint && sprintScope === 'active') return base.filter(t => t.sprintId === activeSprint.id);
    return base;
  }, [filtered, project, activeSprint, sprintScope]);

  const stats = useMemo(() => ({
    open: scoped.filter(t => t.status !== 'Done').length,
    mine: tasks.filter(t => t.status !== 'Done' && t.assignees.some(a => samePerson(a, me))).length,
    overdue: scoped.filter(isOverdue).length,
    dueWeek: scoped.filter(t => t.status !== 'Done' && t.dueDate && t.dueDate >= todayISO() && t.dueDate <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length,
  }), [scoped, tasks, me]);

  // ── notifications ───────────────────────────────────────────────
  const personByName = name => people.find(p => p.name === name) || (name ? people.find(p => p.kind === 'partner' && p.name.split(' ')[0] === name) : null);
  const notify = useCallback(async (t, title, body, extra = []) => {
    try {
      const rep = personByName(t.reporter);
      const list = [...t.assignees, ...(t.watchers || []), ...(rep ? [rep] : []), ...extra];
      const seen = new Set(), rows = [];
      for (const p of list) {
        const k = `${p.kind}:${p.id}`;
        if (seen.has(k) || samePerson(p, me)) continue;
        seen.add(k);
        rows.push({ recipientKind: p.kind, recipientId: p.id, type: 'task', title, body, taskId: t.id });
      }
      if (rows.length) await notificationsDB.createMany(rows);
    } catch (e) { console.error('notify', e); }
  }, [me, people]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMention = (t, text) => {
    const m = findMentions(text, people).filter(p => !samePerson(p, me));
    if (m.length) notificationsDB.createMany(m.map(p => ({ recipientKind: p.kind, recipientId: p.id, type: 'task', title: `${me.name} mentioned you on ${taskKey(t, projects)}`, body: text.slice(0, 140), taskId: t.id }))).catch(console.error);
    notify(t, `New comment on ${taskKey(t, projects)}`, `${me.name}: ${text.slice(0, 120)}`, []);
  };

  // ── actions ─────────────────────────────────────────────────────
  async function createTask(fields) {
    const p = projects.find(x => x.id === fields.projectId);
    const colCount = tasks.filter(t => t.status === (fields.status || 'To Do')).length;
    const created = await workTasks.create({
      type: 'Task', status: 'To Do', priority: 'Medium', assignees: [], labels: [], watchers: [{ id: me.id, name: me.name, kind: me.kind }],
      ...fields, projectName: p?.projectName || '', reporter: me.name, sortOrder: (colCount + 1) * 1000,
    });
    setTasks(ts => ts.some(t => t.id === created.id) ? ts : [...ts, created]);
    if (created.assignees.length) notify(created, `Assigned to you: ${taskKey(created, projects)}`, `${me.name} assigned you “${created.title}”`);
    return created;
  }

  async function patchTask(t, patch) {
    const prev = byId.get(t.id) || t;
    setTasks(ts => ts.map(x => x.id === t.id ? { ...x, ...patch } : x));
    try {
      const updated = await workTasks.update(t.id, patch);
      setTasks(ts => ts.map(x => x.id === t.id ? updated : x));
      const key = taskKey(updated, projects);
      if (patch.status && patch.status !== prev.status) notify(updated, `${key} moved to ${patch.status}`, `${me.name} changed “${updated.title}”`);
      if (patch.assignees) {
        const added = patch.assignees.filter(a => !prev.assignees.some(b => samePerson(a, b)) && !samePerson(a, me));
        if (added.length) notificationsDB.createMany(added.map(a => ({ recipientKind: a.kind, recipientId: a.id, type: 'task', title: `Assigned to you: ${key}`, body: `${me.name} assigned you “${updated.title}”`, taskId: updated.id }))).catch(console.error);
      }
      return updated;
    } catch (e) {
      setTasks(ts => ts.map(x => x.id === t.id ? prev : x));
      alert(e.message?.includes('row-level security') ? 'You do not have permission to change this issue.' : e.message);
      throw e;
    }
  }

  async function deleteTask(t) {
    try {
      await workTasks.remove(t.id);
      setTasks(ts => ts.filter(x => x.id !== t.id && x.parentId !== t.id));
      setOpenId(null);
    } catch (e) { alert(e.message); }
  }

  async function bulk(ids, patch) {
    for (const id of ids) {
      const t = byId.get(id);
      if (!t) continue;
      if (patch.__delete) await deleteTask(t); else await patchTask(t, patch).catch(() => {});
    }
  }

  const sprintApi = {
    create: async s => { const n = await workSprints.create(s); setSprints(x => [...x, n]); return n; },
    update: async (id, s) => { const n = await workSprints.update(id, s); setSprints(x => x.map(y => y.id === id ? n : y)); return n; },
    remove: async id => { await workSprints.remove(id); setSprints(x => x.filter(y => y.id !== id)); setTasks(ts => ts.map(t => t.sprintId === id ? { ...t, sprintId: null } : t)); },
  };

  async function addLog(l) {
    const n = await workTime.create({ ...l, personKind: me.kind, personId: me.id, personName: me.name });
    setLogs(x => [n, ...x]);
    return n;
  }
  async function removeLog(id) { try { await workTime.remove(id); setLogs(x => x.filter(l => l.id !== id)); } catch (e) { alert(e.message); } }

  async function toggleTimer(t) {
    if (timer?.taskId === t.id) {
      const minutes = Math.max(1, Math.round((Date.now() - timer.startedAt) / 60000));
      try { await addLog({ taskId: t.id, projectId: t.projectId, minutes: Math.min(minutes, 24 * 60), logDate: todayISO(), note: 'Timer' }); }
      catch (e) { alert(e.message); return; }
      setTimer(null); writeTimer(null);
    } else {
      if (timer && !window.confirm('Another timer is running. Discard it and start this one?')) return;
      const v = { taskId: t.id, startedAt: Date.now() };
      setTimer(v); writeTimer(v);
    }
  }

  function openCreate(extra = {}) {
    setCreateDraft({ title: '', type: 'Task', status: 'To Do', priority: 'Medium', assignees: [], labels: [], description: '',
      projectId: project?.id || '', sprintId: project && activeSprint ? activeSprint.id : '', parentId: '', storyPoints: '', estimateHours: '', startDate: '', dueDate: '', ...extra });
  }

  const openTask = byId.get(openId) || null;
  const canDelete = t => perms.manageAll || (perms.deleteOwn && t.reporter === me.name);
  const views = VIEWS.filter(v => (!v.needsTimesheet || perms.timesheetView) && (!v.needsProjects || perms.projects) && (!v.partnerOrLead || perms.manageAll || perms.sprints));
  const epicsInScope = scoped.filter(t => t.type === 'Epic');
  const anyFilter = q || fAssignee || fType || fPriority || fLabel || fEpic || hideDone;

  if (loading) return <div><Header title="Work" /><PageLoader /></div>;

  return (
    <div>
      <Header title={isEmployee ? 'My Work' : 'Work'}
        subtitle={`${stats.open} open · ${stats.mine} assigned to you${stats.overdue ? ` · ${stats.overdue} overdue` : ''}${stats.dueWeek ? ` · ${stats.dueWeek} due this week` : ''}`}
        actions={<>
          {timer && (() => { const t = byId.get(timer.taskId); const mins = Math.round((Date.now() - timer.startedAt) / 60000) + tick * 0; return (
            <button onClick={() => t ? toggleTimer(t) : (setTimer(null), writeTimer(null))} className="mac-btn mac-btn-danger" style={{ fontSize: 12.5 }} title="Stop and log time">
              <Square size={12} /> {t ? taskKey(t, projects) : 'Timer'} · {fmtMinutes(mins)}
            </button>); })()}
          <button onClick={load} className="mac-btn mac-btn-secondary" style={{ fontSize: 12.5 }} aria-label="Refresh"><RefreshCw size={13} /></button>
          {perms.create && <button onClick={() => openCreate()} className="mac-btn mac-btn-primary" style={{ fontSize: 13 }} title="Shortcut: C"><Plus size={14} /> Create</button>}
        </>} />

      <div className="page-body" style={{ gap: 12 }}>
        {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,59,48,0.06)', color: '#D70015', fontSize: 12.5 }}>{error}</div>}

        {/* scope: projects */}
        <div className="wk-scope">
          {[['mine', 'My work'], ...(perms.manageAll || perms.projects ? [['all', 'All issues']] : [])].map(([k, l]) => (
            <button key={k} className={`wk-chip ${scope === k ? 'on' : ''}`} onClick={() => { setScope(k); if (view === 'backlog') setView('board'); }}>{l}</button>
          ))}
          {(perms.manageAll || perms.projects) && projects.map(p => {
            const n = tasks.filter(t => t.projectId === p.id && t.status !== 'Done').length;
            return <button key={p.id} className={`wk-chip ${scope === p.id ? 'on' : ''}`} onClick={() => setScope(p.id)} title={p.clientName || ''}><FolderKanban size={12} /> {p.key ? <strong>{p.key}</strong> : null} {p.projectName} <span style={{ opacity: 0.6 }}>{n}</span></button>;
          })}
        </div>

        {/* views */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="tab-bar" style={{ flexWrap: 'wrap' }}>
            {views.map(v => {
              const disabled = v.needsProject && !project;
              return <button key={v.id} disabled={disabled} title={disabled ? 'Pick a project first' : ''} className={`tab-item ${view === v.id ? 'active' : ''}`} onClick={() => setView(v.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, opacity: disabled ? 0.4 : 1 }}><v.icon size={13} />{v.label}</button>;
            })}
          </div>
          {view === 'board' && project && activeSprint && (
            <div className="tab-bar">
              <button className={`tab-item ${sprintScope === 'active' ? 'active' : ''}`} onClick={() => setSprintScope('active')} style={{ fontSize: 12 }}>{activeSprint.name}</button>
              <button className={`tab-item ${sprintScope === 'all' ? 'active' : ''}`} onClick={() => setSprintScope('all')} style={{ fontSize: 12 }}>All issues</button>
            </div>
          )}
        </div>

        {/* filters */}
        {!['timesheet'].includes(view) && (
          <div className="controls-bar">
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: 10, color: '#AEAEB2' }} />
              <input ref={searchRef} className="mac-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search issues  ( / )" style={{ paddingLeft: 28, width: 220, fontSize: 12.5 }} aria-label="Search issues" />
            </div>
            <select className="mac-select" value={fAssignee} onChange={e => setFAssignee(e.target.value)} style={{ width: 'auto', fontSize: 12.5 }} aria-label="Assignee">
              <option value="">Anyone</option><option value="me">Assigned to me</option><option value="none">Unassigned</option>
              {people.map(p => <option key={`${p.kind}:${p.id}`} value={`${p.kind}:${p.id}`}>{p.name}</option>)}
            </select>
            <select className="mac-select" value={fType} onChange={e => setFType(e.target.value)} style={{ width: 'auto', fontSize: 12.5 }} aria-label="Type"><option value="">All types</option>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
            <select className="mac-select" value={fPriority} onChange={e => setFPriority(e.target.value)} style={{ width: 'auto', fontSize: 12.5 }} aria-label="Priority"><option value="">Any priority</option>{PRIORITIES.map(t => <option key={t}>{t}</option>)}</select>
            {ctx.allLabels.length > 0 && <select className="mac-select" value={fLabel} onChange={e => setFLabel(e.target.value)} style={{ width: 'auto', fontSize: 12.5 }} aria-label="Label"><option value="">Any label</option>{ctx.allLabels.map(t => <option key={t}>{t}</option>)}</select>}
            {epicsInScope.length > 0 && <select className="mac-select" value={fEpic} onChange={e => setFEpic(e.target.value)} style={{ width: 'auto', fontSize: 12.5 }} aria-label="Epic"><option value="">Any epic</option>{epicsInScope.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select>}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#6E6E73' }}><input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} /> Hide done</label>
            {anyFilter && <button className="mac-btn mac-btn-ghost" style={{ fontSize: 12 }} onClick={() => { setQ(''); setFAssignee(''); setFType(''); setFPriority(''); setFLabel(''); setFEpic(''); setHideDone(false); }}><X size={12} /> Clear</button>}
          </div>
        )}

        {/* view body */}
        {view === 'board' && <BoardView tasks={boardTasks} ctx={ctx} onOpen={t => setOpenId(t.id)} canEdit={perms.edit} canCreate={perms.create}
          onMove={(t, p) => patchTask(t, p).catch(() => {})}
          onQuickAdd={(title, status) => createTask({ title, status, projectId: project?.id || null, sprintId: project && activeSprint && sprintScope === 'active' ? activeSprint.id : null, assignees: isEmployee ? [{ id: me.id, name: me.name, kind: me.kind }] : [] }).catch(e => alert(e.message))} />}
        {view === 'backlog' && <BacklogView project={project} tasks={filtered.filter(t => t.type !== 'Epic' && t.type !== 'Subtask')} sprints={sprints} ctx={ctx} onOpen={t => setOpenId(t.id)}
          onPatch={(t, p) => patchTask(t, p).catch(() => {})} onQuickAdd={(title, status, sprintId) => createTask({ title, status, projectId: project.id, sprintId }).catch(e => alert(e.message))}
          sprintApi={sprintApi} canCreate={perms.create} canEdit={perms.edit} canManageSprints={perms.sprints} />}
        {view === 'list' && <ListView tasks={filtered} ctx={ctx} onOpen={t => setOpenId(t.id)} onBulk={bulk} canEdit={perms.edit} canDelete={perms.manageAll} />}
        {view === 'calendar' && <CalendarView tasks={filtered} ctx={ctx} onOpen={t => setOpenId(t.id)} />}
        {view === 'timeline' && <TimelineView tasks={filtered} ctx={ctx} onOpen={t => setOpenId(t.id)} />}
        {view === 'workload' && <WorkloadView tasks={filtered} ctx={ctx} logs={logs} />}
        {view === 'reports' && <ReportsView tasks={scoped} sprints={sprints} project={project} ctx={ctx} />}
        {view === 'timesheet' && <TimesheetView logs={logs} tasks={tasks} ctx={ctx} me={me} isPartner={perms.manageAll} canLog={perms.timesheet} onCreate={addLog} onRemove={removeLog} />}
      </div>

      {openTask && (
        <TaskDetail task={openTask} ctx={ctx} me={me} logs={logs} timer={timer}
          perms={{ edit: perms.edit, create: perms.create, delete: canDelete(openTask), manageAll: perms.manageAll, timesheet: perms.timesheet }}
          onPatch={patchTask} onCreate={createTask} onDelete={deleteTask} onOpen={t => setOpenId(t.id)} onClose={() => setOpenId(null)}
          onTimer={toggleTimer} onLog={addLog} onRemoveLog={removeLog} onMention={onMention} />
      )}

      {createDraft && <CreateModal draft={createDraft} setDraft={setCreateDraft} ctx={ctx} perms={perms} isEmployee={isEmployee} me={me}
        onClose={() => setCreateDraft(null)}
        onSave={async (v, again) => { const t = await createTask(v); if (again) setCreateDraft(d => ({ ...d, title: '', description: '' })); else { setCreateDraft(null); setOpenId(t.id); } }} />}

      <style>{WORK_CSS}</style>
    </div>
  );
}

function CreateModal({ draft: v, setDraft, ctx, perms, isEmployee, me, onClose, onSave }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, val) => setDraft(d => ({ ...d, [k]: val }));
  const projectChoices = isEmployee ? ctx.projects.filter(p => p.members?.some(m => m.id === me.id) || perms.projects) : ctx.projects;
  const epics = ctx.tasks.filter(t => t.type === 'Epic' && (!v.projectId || t.projectId === v.projectId));
  const parents = ctx.tasks.filter(t => t.type !== 'Subtask' && t.type !== 'Epic' && (!v.projectId || t.projectId === v.projectId));
  const sprints = ctx.sprints.filter(s => s.projectId === v.projectId && s.status !== 'completed');
  async function save(again) {
    if (!v.title.trim()) return setErr('Give the issue a title');
    if (v.type === 'Subtask' && !v.parentId) return setErr('Pick the parent issue for this subtask');
    setSaving(true); setErr('');
    try {
      await onSave({ ...v, title: v.title.trim(), projectId: v.projectId || null, sprintId: v.sprintId || null, parentId: v.parentId || null,
        storyPoints: v.storyPoints === '' ? null : +v.storyPoints, estimateHours: v.estimateHours === '' ? null : +v.estimateHours }, again);
    } catch (e) { setErr(e.message?.includes('row-level security') ? 'You are not allowed to create issues here.' : e.message); }
    setSaving(false);
  }
  return (
    <Modal isOpen onClose={onClose} title="Create issue" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="rg-3" style={{ gap: 10 }}>
          <FF label="Project"><select className="mac-select" value={v.projectId} onChange={e => setDraft(d => ({ ...d, projectId: e.target.value, sprintId: '', parentId: '' }))}><option value="">— No project —</option>{projectChoices.map(p => <option key={p.id} value={p.id}>{p.key ? `${p.key} · ` : ''}{p.projectName}</option>)}</select></FF>
          <FF label="Type"><select className="mac-select" value={v.type} onChange={e => set('type', e.target.value)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></FF>
          <FF label="Status"><select className="mac-select" value={v.status} onChange={e => set('status', e.target.value)}>{STATUSES.map(t => <option key={t}>{t}</option>)}</select></FF>
        </div>
        <FF label="Summary" required><input autoFocus className="mac-input" value={v.title} onChange={e => set('title', e.target.value)} placeholder="Short, clear title" onKeyDown={e => e.key === 'Enter' && save(false)} /></FF>
        <FF label="Description"><textarea className="mac-input" rows={4} value={v.description} onChange={e => set('description', e.target.value)} placeholder="Details, steps to reproduce, acceptance criteria…" /></FF>
        <div className="rg-2" style={{ gap: 10 }}>
          <FF label="Assignees"><PeoplePicker value={v.assignees} people={ctx.people} onChange={x => set('assignees', x)} /></FF>
          <FF label="Priority"><select className="mac-select" value={v.priority} onChange={e => set('priority', e.target.value)}>{PRIORITIES.map(t => <option key={t}>{t}</option>)}</select></FF>
        </div>
        <div className="rg-3" style={{ gap: 10 }}>
          {v.type === 'Subtask'
            ? <FF label="Parent issue" required><select className="mac-select" value={v.parentId} onChange={e => set('parentId', e.target.value)}><option value="">Choose…</option>{parents.map(t => <option key={t.id} value={t.id}>{taskKey(t, ctx.projects)} {t.title}</option>)}</select></FF>
            : v.type !== 'Epic' && <FF label="Epic"><select className="mac-select" value={v.parentId} onChange={e => set('parentId', e.target.value)}><option value="">— None —</option>{epics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></FF>}
          {v.projectId && <FF label="Sprint"><select className="mac-select" value={v.sprintId} onChange={e => set('sprintId', e.target.value)}><option value="">Backlog</option>{sprints.map(s => <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' (active)' : ''}</option>)}</select></FF>}
          <FF label="Story points"><input type="number" min="0" step="0.5" className="mac-input" value={v.storyPoints} onChange={e => set('storyPoints', e.target.value)} /></FF>
          <FF label="Estimate (hours)"><input type="number" min="0" step="0.5" className="mac-input" value={v.estimateHours} onChange={e => set('estimateHours', e.target.value)} /></FF>
          <FF label="Start date"><input type="date" className="mac-input" value={v.startDate} onChange={e => set('startDate', e.target.value)} /></FF>
          <FF label="Due date"><input type="date" className="mac-input" value={v.dueDate} onChange={e => set('dueDate', e.target.value)} /></FF>
        </div>
        <FF label="Labels"><LabelsInput value={v.labels} onChange={x => set('labels', x)} suggestions={ctx.allLabels} /></FF>
        {err && <div style={{ fontSize: 12.5, color: '#D70015' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="mac-btn mac-btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
          <button onClick={() => save(true)} disabled={saving} className="mac-btn mac-btn-secondary" style={{ fontSize: 13 }}>Create & add another</button>
          <button onClick={() => save(false)} disabled={saving} className="mac-btn mac-btn-primary" style={{ fontSize: 13 }}>Create</button>
        </div>
      </div>
    </Modal>
  );
}

const WORK_CSS = `
.wk-scope { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
.wk-chip { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 100px; border: 1px solid rgba(0,0,0,0.09); background: #fff; font-size: 12.5px; cursor: pointer; white-space: nowrap; font-family: inherit; color: #48484A; }
.wk-chip:hover { border-color: rgba(0,113,227,0.4); }
.wk-chip.on { background: #0071E3; border-color: #0071E3; color: #fff; }
.wk-col { background: rgba(0,0,0,0.035); border-radius: 12px; padding: 8px; display: flex; flex-direction: column; gap: 8px; min-height: 120px; }
.wk-card { background: #fff; border-radius: 10px; padding: 10px 11px; box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04); transition: box-shadow .12s; }
.wk-card:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,113,227,0.25); }
.wk-quick { display: flex; align-items: center; gap: 5px; padding: 7px 8px; border: none; background: transparent; color: #6E6E73; font-size: 12.5px; border-radius: 8px; cursor: pointer; font-family: inherit; }
.wk-quick:hover { background: rgba(0,0,0,0.05); }
.wk-row { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-top: 1px solid rgba(0,0,0,0.045); cursor: pointer; }
.wk-row:hover { background: rgba(0,113,227,0.04); }
.wk-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.wk-table th { text-align: left; font-size: 10.5px; font-weight: 650; color: #8E8E93; text-transform: uppercase; letter-spacing: .4px; padding: 9px 12px; border-bottom: 1px solid rgba(0,0,0,0.07); white-space: nowrap; background: #fff; }
.wk-table td { padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.045); }
.wk-table tbody tr { cursor: pointer; }
.wk-table tbody tr:hover { background: rgba(0,113,227,0.035); }
.wk-cal-item { display: block; width: 100%; text-align: left; font-size: 11px; padding: 2px 5px; margin-bottom: 2px; border: none; border-left: 3px solid; background: #fff; border-radius: 4px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: inherit; }
.wk-detail { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 22px; }
@media (max-width: 860px) { .wk-detail { grid-template-columns: minmax(0, 1fr); } }
.wk-side { display: flex; flex-direction: column; gap: 4px; padding-left: 18px; border-left: 1px solid rgba(0,0,0,0.07); align-self: start; }
@media (max-width: 860px) { .wk-side { border-left: none; padding-left: 0; border-top: 1px solid rgba(0,0,0,0.07); padding-top: 14px; } }
.wk-title { width: 100%; font-size: 20px; font-weight: 680; border: 1px solid transparent; border-radius: 8px; padding: 4px 6px; margin: -4px -6px; resize: none; font-family: inherit; color: #1D1D1F; background: transparent; }
.wk-title:hover { border-color: rgba(0,0,0,0.1); } .wk-title:focus { outline: none; border-color: #0071E3; background: #fff; }
.wk-h { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 650; color: #48484A; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .3px; }
.wk-progress { height: 6px; border-radius: 3px; background: rgba(0,0,0,0.06); overflow: hidden; margin-bottom: 6px; }
.wk-progress > div { height: 100%; background: #34C759; border-radius: 3px; }
.wk-link { border: none; background: none; color: #0071E3; cursor: pointer; font: inherit; padding: 0; }
.wk-att { position: relative; padding: 6px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.07); }
.wk-att-x { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 10px; border: none; background: rgba(0,0,0,0.55); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.wk-pop { position: absolute; z-index: 40; background: #fff; border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.15); border: 1px solid rgba(0,0,0,0.08); padding: 4px; min-width: 200px; }
.wk-pop-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: none; background: none; cursor: pointer; border-radius: 7px; font-size: 12.5px; font-family: inherit; text-align: left; }
.wk-pop-item:hover { background: rgba(0,113,227,0.08); }
.spin { animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
`;
