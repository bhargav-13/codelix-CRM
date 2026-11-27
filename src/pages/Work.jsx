import { useState, useEffect, useMemo, useCallback, useRef, useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Chips, ErrorPanel, Field, FormGrid, FormSection, SkeletonRows, Toolbar, useToast, todayLocal } from '../components/ui/kit';
import { useAuth } from '../contexts/AuthContext';
import { directoryDB, notificationsDB } from '../lib/db';
import { usePeople, roleLabel } from '../lib/people';
import { STATUSES, TYPES, PRIORITIES, workTasks, workSprints, workTime, taskKey, fmtMinutes, findMentions } from '../lib/work';
import BoardView from '../components/work/BoardView';
import BacklogView from '../components/work/BacklogView';
import { MyWorkView, ListView, CalendarView, TimelineView, WorkloadView } from '../components/work/Views';
import { ReportsView, TimesheetView } from '../components/work/Insights';
import TaskDetail from '../components/work/TaskDetail';
import { PeoplePicker, LabelsInput, samePerson, personKey, asPerson, addDays, isoOf, isLate, plural } from '../components/work/ui';
import '../components/work/work.css';
import { CircleCheck, LayoutGrid, Rows3, List, CalendarDays, GanttChart, Users, BarChart3, Timer, Plus, X, Square, RefreshCw } from 'lucide-react';

// kind = 'mine' | 'all' | 'project' — a view only appears where it has something to show
const VIEWS = [
  { id: 'focus', label: 'My tasks', icon: CircleCheck, show: kind => kind === 'mine' },
  { id: 'board', label: 'Board', icon: LayoutGrid, show: () => true },
  { id: 'backlog', label: 'Backlog', icon: Rows3, show: (kind, p) => kind === 'project' && p.projects },
  { id: 'list', label: 'List', icon: List, show: () => true },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, show: () => true },
  { id: 'timeline', label: 'Timeline', icon: GanttChart, show: () => true },
  { id: 'workload', label: 'Workload', icon: Users, show: (kind, p) => kind !== 'mine' && (p.manageAll || p.sprints) },
  { id: 'reports', label: 'Reports', icon: BarChart3, show: () => true },
  { id: 'timesheet', label: 'Timesheet', icon: Timer, show: (kind, p) => kind !== 'project' && p.timesheetView },
];
const NO_FILTER_VIEWS = ['reports', 'timesheet'];

const TIMER_KEY = 'codelix.timer.v1';
const NAV_KEY = 'codelix.work.nav.v1';
const readJSON = key => { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } };
const writeJSON = (key, v) => { try { if (v) localStorage.setItem(key, JSON.stringify(v)); else localStorage.removeItem(key); } catch { /* storage blocked */ } };
const isDenied = e => e?.status === 403;
const POLL_MS = 20000;

export default function Work() {
  const { isPartner, isEmployee, person, can } = useAuth();
  const toast = useToast();
  // my person ref: partner → user id, employee → employee id (see AuthContext)
  const myKind = person?.kind || (isEmployee ? 'employee' : 'partner'), myId = person?.id ?? null, myName = person?.name || 'Me';
  const me = useMemo(() => ({ kind: myKind, id: myId, name: myName }), [myKind, myId, myName]);
  const { people: directory } = usePeople();

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
  const [logs, setLogs] = useState([]);
  const [phase, setPhase] = useState('loading');           // loading | ready | failed
  const [loadError, setLoadError] = useState(null);
  const [stale, setStale] = useState('');                  // shown when a refresh failed but older data is on screen
  const [refreshing, setRefreshing] = useState(false);
  const hasData = useRef(false);
  const mutations = useRef(0);                             // bumped by every local change, so a poll that started earlier is not applied over it

  // where the user is: scope (mine | all | <projectId>) then view — remembered per browser
  const [nav, setNav] = useState(() => { const n = readJSON(NAV_KEY) || {}; return { scope: n.scope || 'mine', view: n.view || 'focus' }; });
  const go = change => { const next = { ...nav, ...change }; setNav(next); writeJSON(NAV_KEY, next); };

  const [q, setQ] = useState('');
  const [fAssignee, setFAssignee] = useState('');          // '' | 'none' | 'kind:id'
  const [onlyMine, setOnlyMine] = useState(false);
  const [fType, setFType] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fLabel, setFLabel] = useState('');
  const [fEpic, setFEpic] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [sprintScope, setSprintScope] = useState('active'); // board inside a project: active | all
  // open task lives in the URL (?issue=<id>) so links and notifications can open it
  const [params, setParams] = useSearchParams();
  const openId = params.get('issue');
  const setOpenId = useCallback(id => setParams(id ? { issue: id } : {}, { replace: !id }), [setParams]);
  const [createDraft, setCreateDraft] = useState(null);
  const [confirm, setConfirm] = useState(null);            // { title, message, confirmLabel, danger, run }
  const confirmOpen = useRef(false);
  const [timer, setTimer] = useState(() => readJSON(TIMER_KEY));
  const [now, setNow] = useState(() => Date.now());
  const toolbarRef = useRef(null);

  const load = useCallback(async () => {
    const [t, s, p, l] = await Promise.allSettled([
      workTasks.list(), workSprints.list(), directoryDB.projects(),
      perms.timesheetView ? workTime.list({ from: addDays(todayLocal(), -180) }) : Promise.resolve([]),
    ]);
    // A failed request never replaces what is already on screen
    if (t.status === 'fulfilled') { setTasks(t.value || []); hasData.current = true; setPhase('ready'); setLoadError(null); }
    else if (!hasData.current) { setLoadError(t.reason); setPhase('failed'); }
    if (s.status === 'fulfilled') setSprints(s.value || []);
    if (p.status === 'fulfilled') setProjects(p.value || []);
    if (l.status === 'fulfilled') setLogs(l.value || []);
    const failed = [t, s, p, l].filter(r => r.status === 'rejected');
    failed.forEach(r => console.error('work load', r.reason));
    setStale(!failed.length || !hasData.current ? '' : t.status === 'rejected' ? 'Could not refresh — showing what was loaded earlier.' : 'Could not refresh everything — some projects, sprints, people or hours may be out of date.');
    setRefreshing(false);
  }, [perms.timesheetView]);
  useEffect(() => { load(); }, [load]);
  const refresh = () => { setRefreshing(true); load(); };
  const retry = () => { setPhase('loading'); load(); };

  // Other people's changes: the task list is re-read every 20 s while the tab is
  // visible, and when the window gets focus again. (The server decides which tasks we get.)
  useEffect(() => {
    let busy = false, last = Date.now();
    const poll = async () => {
      if (busy || !hasData.current || document.visibilityState !== 'visible') return;
      busy = true; last = Date.now();
      const seen = mutations.current;
      try {
        const [fresh, freshSprints] = await Promise.all([workTasks.list(), workSprints.list().catch(() => null)]);
        // a change made here while the request was on its way wins; the next poll catches up
        if (seen === mutations.current && !fresh.some(t => workTasks.isSaving(t.id))) {
          setTasks(fresh);
          if (freshSprints) setSprints(freshSprints);
          setStale('');
        }
      } catch (e) { console.error('work poll', e); }
      busy = false;
    };
    const onFocus = () => { if (Date.now() - last > 3000) poll(); };
    const timer = setInterval(poll, POLL_MS);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, []);

  // running timer: refresh the elapsed time twice a minute
  useEffect(() => { if (!timer) return; const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i); }, [timer]);
  useEffect(() => { confirmOpen.current = !!confirm; }, [confirm]);

  // keyboard: "c" create, "/" search
  useEffect(() => {
    const onKey = e => {
      if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'c' && perms.create && !openId && !createDraft && !confirm) { e.preventDefault(); openCreate(); }
      if (e.key === '/') { const box = toolbarRef.current?.querySelector('.toolbar-search input'); if (box) { e.preventDefault(); box.focus(); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── derived ─────────────────────────────────────────────────────
  const people = useMemo(() => directory.filter(p => p.active !== false).map(p => ({ id: p.id, name: p.name, kind: p.kind, role: roleLabel(p) })), [directory]);
  const byId = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
  // per-task lookups built once per data change, so cards never scan the whole list
  const childrenBy = useMemo(() => {
    const m = new Map();
    for (const t of tasks) if (t.parentId) { const a = m.get(t.parentId); if (a) a.push(t); else m.set(t.parentId, [t]); }
    return m;
  }, [tasks]);
  const childStats = useMemo(() => new Map([...childrenBy].map(([id, kids]) => [id, { total: kids.length, done: kids.filter(k => k.status === 'Done').length }])), [childrenBy]);
  const loggedBy = useMemo(() => {
    const m = new Map();
    for (const l of logs) if (l.taskId) m.set(l.taskId, (m.get(l.taskId) || 0) + l.minutes);
    return m;
  }, [logs]);
  const openByProject = useMemo(() => {
    const m = new Map();
    for (const t of tasks) if (t.projectId && t.status !== 'Done') m.set(t.projectId, (m.get(t.projectId) || 0) + 1);
    return m;
  }, [tasks]);

  const canBrowse = perms.manageAll || perms.projects;
  const project = (canBrowse && projects.find(p => p.id === nav.scope)) || null;
  const scope = project ? project.id : canBrowse && nav.scope === 'all' ? 'all' : 'mine';
  const kind = project ? 'project' : scope;
  const views = VIEWS.filter(v => v.show(kind, perms));
  const view = views.some(v => v.id === nav.view) ? nav.view : views[0].id;
  const activeSprint = project ? sprints.find(s => s.projectId === project.id && s.status === 'active') : null;

  const ctx = useMemo(() => {
    const sprintNames = new Map(sprints.map(s => [s.id, s.name]));
    const projectNames = new Map(projects.map(p => [p.id, `${p.key ? p.key + ' · ' : ''}${p.projectName}`]));
    const none = [];
    return {
      projects, people, tasks, sprints, childStats, loggedBy,
      taskById: id => (id ? byId.get(id) : null) || null,
      childrenOf: id => childrenBy.get(id) || none,
      sprintName: id => sprintNames.get(id) || '',
      projectName: id => projectNames.get(id) || '',
      allLabels: [...new Set(tasks.flatMap(t => t.labels || []))].sort(),
      sprintsForBulk: project ? sprints.filter(s => s.projectId === project.id && s.status !== 'completed') : [],
    };
  }, [projects, people, tasks, sprints, byId, childrenBy, childStats, loggedBy, project]);

  const assignedToMe = useCallback(t => t.assignees.some(a => samePerson(a, me)), [me]);

  // "My work" is only what is assigned to me. Tasks I raised or watch for someone else are theirs:
  // they show under All work and under the project.
  const scoped = useMemo(() => tasks.filter(t => (scope === 'mine' ? assignedToMe(t) : scope === 'all' ? true : t.projectId === scope)), [tasks, scope, assignedToMe]);

  const focus = view === 'focus';
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return scoped.filter(t => {
      if (s && !(`${taskKey(t, projects)} ${t.title} ${t.description} ${(t.labels || []).join(' ')}`.toLowerCase().includes(s))) return false;
      if (fType && t.type !== fType) return false;
      if (fPriority && t.priority !== fPriority) return false;
      if (fLabel && !(t.labels || []).includes(fLabel)) return false;
      if (fEpic && t.parentId !== fEpic && t.id !== fEpic) return false;
      if (focus) return true;                        // "My tasks" is already only mine and only open
      if (onlyMine && !assignedToMe(t)) return false;
      if (fAssignee === 'none' && t.assignees.length) return false;
      if (fAssignee && fAssignee !== 'none' && !t.assignees.some(a => personKey(a) === fAssignee)) return false;
      if (hideDone && t.status === 'Done') return false;
      return true;
    });
  }, [scoped, q, fAssignee, onlyMine, fType, fPriority, fLabel, fEpic, hideDone, focus, assignedToMe, projects]);

  const focusTasks = useMemo(() => filtered.filter(t => assignedToMe(t) && t.status !== 'Done'), [filtered, assignedToMe]);
  const doneToday = useMemo(() => {
    const today = todayLocal();
    return filtered.filter(t => assignedToMe(t) && t.status === 'Done' && t.updatedAt && isoOf(new Date(t.updatedAt)) === today);
  }, [filtered, assignedToMe]);

  // Board inside a project with an active sprint shows that sprint (Jira-style)
  const boardTasks = useMemo(() => {
    const base = filtered.filter(t => t.type !== 'Epic');
    if (project && activeSprint && sprintScope === 'active') return base.filter(t => t.sprintId === activeSprint.id);
    return base;
  }, [filtered, project, activeSprint, sprintScope]);

  const stats = useMemo(() => {
    const today = todayLocal(), weekEnd = addDays(today, 7);
    const open = scoped.filter(t => t.status !== 'Done' && (kind !== 'mine' || assignedToMe(t)));
    return {
      open: open.length, overdue: open.filter(isLate).length,
      dueWeek: open.filter(t => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd).length,
      mine: kind === 'mine' ? 0 : open.filter(assignedToMe).length,
      total: kind === 'mine' ? open.length : scoped.length,
    };
  }, [scoped, kind, assignedToMe]);
  const myOpen = useMemo(() => tasks.filter(t => t.status !== 'Done' && assignedToMe(t)).length, [tasks, assignedToMe]);

  // ── notifications ───────────────────────────────────────────────
  // the server stamps the sender; recipients are person refs
  const notify = async (t, title, body, extra = []) => {
    try {
      const rep = t.reporterRef;
      const list = [...t.assignees, ...(t.watchers || []), ...(rep ? [rep] : []), ...extra];
      const seen = new Set(), rows = [];
      for (const p of list) {
        const k = personKey(p);
        if (seen.has(k) || samePerson(p, me)) continue;
        seen.add(k);
        rows.push({ recipient: asPerson(p), type: 'task', title, body, taskId: t.id });
      }
      if (rows.length) await notificationsDB.createMany(rows);
    } catch (e) { console.error('notify', e); }
  };

  const onMention = (t, text) => {
    const m = findMentions(text, people).filter(p => !samePerson(p, me));
    if (m.length) notificationsDB.createMany(m.map(p => ({ recipient: asPerson(p), type: 'task', title: `${me.name} mentioned you on ${taskKey(t, projects)}`, body: text.slice(0, 140), taskId: t.id }))).catch(console.error);
    notify(t, `New comment on ${taskKey(t, projects)}`, `${me.name}: ${text.slice(0, 120)}`, []);
  };

  // ── actions ─────────────────────────────────────────────────────
  const askConfirm = c => setConfirm(c);
  const putTask = t => setTasks(ts => ts.map(x => (x.id === t.id ? t : x)));

  // Comments have their own endpoints; the server stamps author and time.
  // Both resolve to true when saved, and say why (toast) when not.
  async function addComment(t, text) {
    mutations.current++;
    try {
      const mentions = findMentions(text, people).map(asPerson);
      const res = await workTasks.addComment(t.id, { text, mentions });
      mutations.current++;
      if (res.task) putTask(res.task);
      else if (res.comment) setTasks(ts => ts.map(x => (x.id === t.id ? { ...x, comments: [...(x.comments || []), res.comment] } : x)));
      onMention(res.task || t, text);
      return true;
    } catch (e) {
      toast.error(isDenied(e) ? 'You do not have permission to comment on this task' : 'Could not add your comment', isDenied(e) ? undefined : e);
      return false;
    }
  }
  async function removeComment(t, commentId) {
    mutations.current++;
    try {
      const res = await workTasks.removeComment(t.id, commentId);
      mutations.current++;
      if (res.task) putTask(res.task);
      else setTasks(ts => ts.map(x => (x.id === t.id ? { ...x, comments: (x.comments || []).filter(c => c.id !== commentId) } : x)));
      return true;
    } catch (e) {
      toast.error(isDenied(e) ? 'You can only delete your own comments' : 'Could not delete the comment', isDenied(e) ? undefined : e);
      return false;
    }
  }

  async function createTask(fields) {
    const p = projects.find(x => x.id === fields.projectId);
    const colCount = tasks.filter(t => t.status === (fields.status || 'To Do')).length;
    mutations.current++;
    // the reporter is stamped by the server from the login
    const created = await workTasks.create({
      type: 'Task', status: 'To Do', priority: 'Medium', assignees: [], labels: [], watchers: [asPerson(me)],
      ...fields, projectName: p?.projectName || '', sortOrder: (colCount + 1) * 1000,
    });
    mutations.current++;
    setTasks(ts => (ts.some(t => t.id === created.id) ? ts : [...ts, created]));
    if (created.assignees.length) notify(created, `Assigned to you: ${taskKey(created, projects)}`, `${me.name} assigned you “${created.title}”`);
    return created;
  }
  // one-line "Add a task…" boxes: say what went wrong, then let the box keep its text
  async function quickCreate(fields) {
    try { return await createTask(fields); }
    catch (e) { toast.error(isDenied(e) ? 'You are not allowed to create tasks here' : 'Could not create the task', isDenied(e) ? undefined : e); throw e; }
  }

  // Optimistic: the change shows at once and is undone (with a message) if the save fails.
  async function patchTask(t, patch) {
    const prev = byId.get(t.id) || t;
    mutations.current++;
    setTasks(ts => ts.map(x => (x.id === t.id ? { ...x, ...patch } : x)));
    try {
      const updated = await workTasks.update(t.id, { ...patch, version: prev.version });
      mutations.current++;
      setTasks(ts => ts.map(x => (x.id === t.id ? updated : x)));
      const key = taskKey(updated, projects);
      if (patch.status && patch.status !== prev.status) notify(updated, `${key} moved to ${patch.status}`, `${me.name} changed “${updated.title}”`);
      if (patch.assignees) {
        const added = patch.assignees.filter(a => !prev.assignees.some(b => samePerson(a, b)) && !samePerson(a, me));
        if (added.length) notificationsDB.createMany(added.map(a => ({ recipient: asPerson(a), type: 'task', title: `Assigned to you: ${key}`, body: `${me.name} assigned you “${updated.title}”`, taskId: updated.id }))).catch(console.error);
      }
      return updated;
    } catch (e) {
      setTasks(ts => ts.map(x => (x.id === t.id ? prev : x)));
      if (isDenied(e)) toast.error('You do not have permission to change this task — your change was undone');
      else toast.error('Could not save — your change was undone', e);
      if (e && typeof e === 'object') e.shown = true;
      throw e;
    }
  }
  const patchQuiet = (t, patch) => patchTask(t, patch).catch(() => {});

  // The database deletes every child along with its parent, however deep.
  function descendantsOf(id) {
    const out = [];
    const walk = pid => (childrenBy.get(pid) || []).forEach(c => { out.push(c); walk(c.id); });
    walk(id);
    return out;
  }
  const nameList = list => `${list.slice(0, 3).map(k => `${taskKey(k, projects)} “${k.title}”`).join(', ')}${list.length > 3 ? ` and ${list.length - 3} more` : ''}`;

  async function removeTasks(roots) {
    const gone = new Set();
    let failed = null;
    for (const t of roots) {
      if (gone.has(t.id)) continue;                  // already removed with its parent
      try { mutations.current++; await workTasks.remove(t.id); mutations.current++; gone.add(t.id); descendantsOf(t.id).forEach(k => gone.add(k.id)); }
      catch (e) { failed = e; }
    }
    if (gone.size) {
      setTasks(ts => ts.filter(x => !gone.has(x.id)));
      if (gone.has(openId)) setOpenId(null);
    }
    if (failed) toast.error(isDenied(failed) ? 'You do not have permission to delete this' : roots.length > 1 ? 'Some tasks could not be deleted' : 'Could not delete the task', isDenied(failed) ? undefined : failed);
    else toast.success(gone.size === 1 ? 'Task deleted' : `${gone.size} tasks deleted`);
    return !failed;
  }

  function requestDelete(t) {
    const kids = descendantsOf(t.id);
    const what = `${taskKey(t, projects)} “${t.title}”`;
    askConfirm({
      title: `Delete ${t.type.toLowerCase()}`,
      message: kids.length
        ? `Delete ${what}? Its ${plural(kids.length, 'child issue')} will also be deleted: ${nameList(kids)}. This cannot be undone.`
        : `Delete ${what}? This cannot be undone.`,
      confirmLabel: kids.length ? `Delete all ${kids.length + 1}` : 'Delete',
      run: () => removeTasks([t]),
    });
  }

  function requestBulkDelete(ids, done) {
    const roots = ids.map(id => byId.get(id)).filter(Boolean);
    if (!roots.length) return;
    const picked = new Set(roots.map(t => t.id));
    const extra = new Map();
    roots.forEach(t => descendantsOf(t.id).forEach(k => { if (!picked.has(k.id)) extra.set(k.id, k); }));
    const kids = [...extra.values()];
    askConfirm({
      title: 'Delete selected tasks',
      message: `Delete ${plural(roots.length, 'selected task')}?${kids.length ? ` ${plural(kids.length, 'child issue')} that ${kids.length === 1 ? 'was' : 'were'} not selected will also be deleted: ${nameList(kids)}.` : ''} This cannot be undone.`,
      confirmLabel: `Delete ${roots.length + kids.length}`,
      run: async () => { if (await removeTasks(roots)) done?.(); },
    });
  }

  async function bulk(ids, patch) {
    let failed = 0;
    for (const id of ids) {
      const t = byId.get(id);
      if (t) await patchTask(t, patch).catch(() => { failed++; });
    }
    if (!failed) toast.success(`${plural(ids.length, 'task')} updated`);
  }

  const sprintApi = {
    create: async s => { const n = await workSprints.create(s); setSprints(x => [...x, n]); return n; },
    update: async (id, s) => { const n = await workSprints.update(id, { ...s, version: sprints.find(y => y.id === id)?.version }); setSprints(x => x.map(y => (y.id === id ? n : y))); return n; },
    remove: async id => { await workSprints.remove(id); setSprints(x => x.filter(y => y.id !== id)); setTasks(ts => ts.map(t => (t.sprintId === id ? { ...t, sprintId: null } : t))); },
  };

  async function addLog(l) {
    const n = await workTime.create(l);   // the server records whose time this is
    setLogs(x => [n, ...x]);
    return n;
  }
  async function removeLog(id) {
    try { await workTime.remove(id); setLogs(x => x.filter(l => l.id !== id)); toast.success('Time entry deleted'); }
    catch (e) { toast.error('Could not delete the time entry', e); }
  }

  const setRunning = v => { setTimer(v); writeJSON(TIMER_KEY, v); setNow(Date.now()); };
  async function toggleTimer(t) {
    if (timer?.taskId === t.id) {
      const minutes = Math.max(1, Math.round((Date.now() - timer.startedAt) / 60000));
      try {
        await addLog({ taskId: t.id, projectId: t.projectId, minutes: Math.min(minutes, 24 * 60), logDate: todayLocal(), note: 'Timer' });
        setRunning(null);
        toast.success(`Logged ${fmtMinutes(Math.min(minutes, 24 * 60))} on ${taskKey(t, projects)}`);
      } catch (e) { toast.error('Could not log the time — the timer is still running', e); }
      return;
    }
    const start = () => setRunning({ taskId: t.id, startedAt: Date.now() });
    if (timer) askConfirm({ title: 'Replace the running timer?', message: 'Another timer is running. Its time will be discarded if you start this one.', confirmLabel: 'Discard and start', run: start });
    else start();
  }

  function openCreate(extra = {}) {
    setCreateDraft({
      title: '', type: 'Task', status: 'To Do', priority: 'Medium', assignees: kind === 'mine' ? [asPerson(me)] : [], labels: [], description: '',
      projectId: project?.id || '', sprintId: project && activeSprint ? activeSprint.id : '', parentId: '', storyPoints: '', estimateHours: '', startDate: '', dueDate: '', ...extra,
    });
  }

  const clearFilters = () => { setQ(''); setFAssignee(''); setOnlyMine(false); setFType(''); setFPriority(''); setFLabel(''); setFEpic(''); setHideDone(false); };
  // Esc reaches every open layer; while a confirmation is up, only that one should close
  const closeDetail = () => { if (!confirmOpen.current) setOpenId(null); };

  const openTask = byId.get(openId) || null;
  const canDelete = t => perms.manageAll || (perms.deleteOwn && samePerson(t.reporterRef, me));
  const epicsInScope = scoped.filter(t => t.type === 'Epic');
  const anyFilter = !!(q || fType || fPriority || fLabel || fEpic || (!focus && (fAssignee || onlyMine || hideDone)));
  const shown = focus ? focusTasks.length : view === 'board' ? boardTasks.length : filtered.length;
  const onOpen = t => setOpenId(t.id);
  const selfIfMine = isEmployee || kind === 'mine' ? [asPerson(me)] : [];

  const title = kind === 'mine' ? 'My work' : kind === 'all' ? 'All work' : project.projectName;
  const summary = phase !== 'ready' ? (phase === 'loading' ? 'Loading…' : '')
    : stats.open === 0 ? (kind === 'mine' ? 'Nothing open — you are all caught up' : 'No open tasks')
    : [`${stats.open} open`, stats.overdue && `${stats.overdue} overdue`, stats.dueWeek && `${stats.dueWeek} due this week`, stats.mine && `${stats.mine} assigned to you`].filter(Boolean).join(' · ');
  const timerTask = timer ? byId.get(timer.taskId) : null;
  const timerMins = timer ? Math.max(0, Math.round((now - timer.startedAt) / 60000)) : 0;

  return (
    <div>
      <Header title={title} subtitle={summary}
        actions={<>
          {timer && (
            <button onClick={() => (timerTask ? toggleTimer(timerTask) : setRunning(null))} className="mac-btn mac-btn-danger" title={timerTask ? 'Stop and log the time' : 'The task is gone — discard this timer'}>
              <Square size={13} /> {timerTask ? taskKey(timerTask, projects) : 'Timer'} · {fmtMinutes(timerMins)}
            </button>
          )}
          <button onClick={refresh} disabled={refreshing || phase === 'loading'} className="icon-btn" aria-label="Refresh" title="Refresh"><RefreshCw size={15} className={refreshing ? 'spin' : ''} /></button>
          {perms.create && <button onClick={() => openCreate()} className="mac-btn mac-btn-primary" title="Shortcut: C"><Plus size={15} /> Create</button>}
        </>} />

      <div className="page-body">
        {phase === 'loading' && <SkeletonRows rows={7} />}
        {phase === 'failed' && <ErrorPanel title="Could not load your work" error={loadError} onRetry={retry} />}
        {phase === 'ready' && <>
          {stale && (
            <div className="wk-strip" role="status">
              <span>{stale}</span>
              <button onClick={refresh} disabled={refreshing}>{refreshing ? 'Retrying…' : 'Retry'}</button>
            </div>
          )}

          {/* level 1 — whose work */}
          {canBrowse && (
            <div className="wk-scope">
              <Chips label="Whose work" value={scope} onChange={v => go({ scope: v })}
                options={[{ value: 'mine', label: 'My work', count: myOpen }, { value: 'all', label: 'All work' }]} />
              {projects.length > 0 && (
                <select className={`mac-select ${project ? 'on' : ''}`} aria-label="Project" value={project?.id || ''} onChange={e => go({ scope: e.target.value || 'mine' })}>
                  <option value="">Pick a project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.key ? `${p.key} · ` : ''}{p.projectName}{openByProject.get(p.id) ? ` (${openByProject.get(p.id)})` : ''}</option>)}
                </select>
              )}
            </div>
          )}

          {/* level 2 — how to look at it */}
          <div className="tab-bar wk-tabs" role="tablist" aria-label="View">
            {views.map(v => (
              <button key={v.id} role="tab" aria-selected={view === v.id} className={`tab-item ${view === v.id ? 'active' : ''}`} onClick={() => go({ view: v.id })}><v.icon size={14} />{v.label}</button>
            ))}
          </div>

          {!NO_FILTER_VIEWS.includes(view) && (
            <div ref={toolbarRef}>
              <Toolbar search={q} onSearch={setQ} placeholder="Search tasks"
                right={anyFilter ? <>
                  <span>{shown} of {stats.total}</span>
                  <button className="mac-btn mac-btn-ghost" onClick={clearFilters}><X size={13} /> Clear filters</button>
                </> : null}>
                {!focus && (
                  <select className="mac-select" value={fAssignee} onChange={e => setFAssignee(e.target.value)} aria-label="Assignee">
                    <option value="">Anyone</option><option value="none">Unassigned</option>
                    {people.map(p => <option key={personKey(p)} value={personKey(p)}>{p.name}</option>)}
                  </select>
                )}
                <select className="mac-select" value={fType} onChange={e => setFType(e.target.value)} aria-label="Type"><option value="">All types</option>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
                <select className="mac-select" value={fPriority} onChange={e => setFPriority(e.target.value)} aria-label="Priority"><option value="">Any priority</option>{PRIORITIES.map(t => <option key={t}>{t}</option>)}</select>
                {ctx.allLabels.length > 0 && <select className="mac-select" value={fLabel} onChange={e => setFLabel(e.target.value)} aria-label="Label"><option value="">Any label</option>{ctx.allLabels.map(t => <option key={t}>{t}</option>)}</select>}
                {epicsInScope.length > 0 && <select className="mac-select" value={fEpic} onChange={e => setFEpic(e.target.value)} aria-label="Epic"><option value="">Any epic</option>{epicsInScope.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select>}
                {view === 'board' && project && activeSprint && (
                  <select className="mac-select" value={sprintScope} onChange={e => setSprintScope(e.target.value)} aria-label="Which tasks the board shows">
                    <option value="active">{activeSprint.name} only</option><option value="all">Whole project</option>
                  </select>
                )}
                {!focus && <label className="wk-toggle"><input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} /> Only mine</label>}
                {!focus && <label className="wk-toggle"><input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} /> Hide done</label>}
              </Toolbar>
            </div>
          )}

          {view === 'focus' && <MyWorkView tasks={focusTasks} doneToday={doneToday} ctx={ctx} onOpen={onOpen} canEdit={perms.edit} canCreate={perms.create}
            onStatus={(t, status) => { if (status !== t.status) patchQuiet(t, { status }); }}
            onQuickAdd={t => quickCreate({ title: t, assignees: [asPerson(me)] })}
            filtering={anyFilter} onClearFilters={clearFilters} onCreate={() => openCreate()} />}
          {view === 'board' && <BoardView tasks={boardTasks} ctx={ctx} onOpen={onOpen} canEdit={perms.edit} canCreate={perms.create} onMove={patchQuiet}
            onQuickAdd={(t, status) => quickCreate({ title: t, status, projectId: project?.id || null, sprintId: project && activeSprint && sprintScope === 'active' ? activeSprint.id : null, assignees: selfIfMine })} />}
          {view === 'backlog' && <BacklogView project={project} tasks={filtered.filter(t => t.type !== 'Epic' && t.type !== 'Subtask')} sprints={sprints} ctx={ctx} onOpen={onOpen}
            onPatch={patchTask} onQuickAdd={(t, status, sprintId) => quickCreate({ title: t, status, projectId: project.id, sprintId })}
            sprintApi={sprintApi} canCreate={perms.create} canEdit={perms.edit} canManageSprints={perms.sprints} askConfirm={askConfirm} />}
          {view === 'list' && <ListView tasks={filtered} ctx={ctx} onOpen={onOpen} onBulk={bulk} onBulkDelete={requestBulkDelete} canEdit={perms.edit} canDelete={perms.manageAll} filtering={anyFilter} onClearFilters={clearFilters} />}
          {view === 'calendar' && <CalendarView tasks={filtered} ctx={ctx} onOpen={onOpen} />}
          {view === 'timeline' && <TimelineView tasks={filtered} ctx={ctx} onOpen={onOpen} />}
          {view === 'workload' && <WorkloadView tasks={filtered} ctx={ctx} logs={logs} />}
          {view === 'reports' && <ReportsView tasks={scoped} sprints={sprints} project={project} ctx={ctx} />}
          {view === 'timesheet' && <TimesheetView logs={logs} tasks={tasks} ctx={ctx} me={me} isPartner={perms.manageAll} canLog={perms.timesheet} onCreate={addLog} onRemove={removeLog} askConfirm={askConfirm} />}
        </>}
      </div>

      {openTask && (
        <TaskDetail key={openTask.id} task={openTask} ctx={ctx} me={me} logs={logs} timer={timer}
          perms={{ edit: perms.edit, create: perms.create, delete: canDelete(openTask), manageAll: perms.manageAll, timesheet: perms.timesheet }}
          onPatch={patchTask} onCreate={quickCreate} onDelete={requestDelete} onOpen={onOpen} onClose={closeDetail}
          onTimer={toggleTimer} onLog={addLog} onRemoveLog={removeLog} onComment={addComment} onRemoveComment={removeComment} askConfirm={askConfirm} />
      )}

      {createDraft && <CreateModal draft={createDraft} setDraft={setCreateDraft} ctx={ctx} perms={perms} isEmployee={isEmployee} me={me}
        onClose={() => setCreateDraft(null)}
        onSave={async (v, again) => {
          const t = await createTask(v);
          toast.success(`Created ${taskKey(t, projects)}`);
          if (again) setCreateDraft(d => ({ ...d, title: '', description: '' })); else setCreateDraft(null);
        }} />}

      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm?.run()}
        title={confirm?.title} message={confirm?.message} confirmLabel={confirm?.confirmLabel || 'Delete'} danger={confirm?.danger !== false} />
    </div>
  );
}

function CreateModal({ draft: v, setDraft, ctx, perms, isEmployee, me, onClose, onSave }) {
  const toast = useToast();
  const formId = useId();
  const titleRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k, val) => setDraft(d => ({ ...d, [k]: val }));
  const projectChoices = isEmployee ? ctx.projects.filter(p => p.members?.some(m => String(m?.id ?? m) === String(me.id)) || perms.projects) : ctx.projects;
  const epics = ctx.tasks.filter(t => t.type === 'Epic' && (!v.projectId || t.projectId === v.projectId));
  const parents = ctx.tasks.filter(t => t.type !== 'Subtask' && t.type !== 'Epic' && (!v.projectId || t.projectId === v.projectId));
  const sprints = ctx.sprints.filter(s => s.projectId === v.projectId && s.status !== 'completed');

  // the overlay focuses its close button on open; a new task starts with the title
  useEffect(() => { titleRef.current?.focus(); }, []);

  async function save(again) {
    const errs = {};
    if (!v.title.trim()) errs.title = 'Give the task a title';
    if (v.type === 'Subtask' && !v.parentId) errs.parentId = 'Pick the task this subtask belongs to';
    if (v.startDate && v.dueDate && v.dueDate < v.startDate) errs.dueDate = 'The due date is before the start date';
    setErrors(errs);
    if (errs.title) titleRef.current?.focus();
    if (Object.keys(errs).length || saving) return;
    setSaving(true);
    try {
      await onSave({
        ...v, title: v.title.trim(), projectId: v.projectId || null, sprintId: v.sprintId || null, parentId: v.parentId || null,
        storyPoints: v.storyPoints === '' ? null : +v.storyPoints, estimateHours: v.estimateHours === '' ? null : +v.estimateHours,
      }, again);
      if (again) titleRef.current?.focus();
    } catch (e) {
      if (isDenied(e)) toast.error('You are not allowed to create tasks here'); else toast.error('Could not create the task', e);
    }
    setSaving(false);
  }

  return (
    <Modal isOpen onClose={onClose} title="Create task" size="lg"
      footer={<>
        <button type="button" onClick={onClose} className="mac-btn mac-btn-secondary">Cancel</button>
        <button type="button" onClick={() => save(true)} disabled={saving} className="mac-btn mac-btn-secondary">Create &amp; add another</button>
        <button type="submit" form={formId} disabled={saving} className="mac-btn mac-btn-primary">{saving ? 'Saving…' : 'Create'}</button>
      </>}>
      <form id={formId} onSubmit={e => { e.preventDefault(); save(false); }}>
        <FormSection>
          <Field label="Title" required error={errors.title}>
            {id => <input id={id} ref={titleRef} className="mac-input" value={v.title} onChange={e => set('title', e.target.value)} placeholder="What needs to be done?" />}
          </Field>
          <Field label="Description"><textarea className="mac-input" rows={3} value={v.description} onChange={e => set('description', e.target.value)} placeholder="Details, steps to reproduce, acceptance criteria…" /></Field>
          <FormGrid>
            <Field label="Assignees">{() => <PeoplePicker value={v.assignees} people={ctx.people} onChange={x => set('assignees', x)} placeholder="Unassigned" label="Assignees" />}</Field>
            <Field label="Project"><select className="mac-select" value={v.projectId} onChange={e => setDraft(d => ({ ...d, projectId: e.target.value, sprintId: '', parentId: '' }))}><option value="">No project</option>{projectChoices.map(p => <option key={p.id} value={p.id}>{p.key ? `${p.key} · ` : ''}{p.projectName}</option>)}</select></Field>
            <Field label="Due date" error={errors.dueDate}><input type="date" className="mac-input" value={v.dueDate} onChange={e => set('dueDate', e.target.value)} /></Field>
            <Field label="Priority"><select className="mac-select" value={v.priority} onChange={e => set('priority', e.target.value)}>{PRIORITIES.map(t => <option key={t}>{t}</option>)}</select></Field>
          </FormGrid>
        </FormSection>
        <FormSection title="More options">
          <FormGrid cols={3}>
            <Field label="Type"><select className="mac-select" value={v.type} onChange={e => set('type', e.target.value)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Status"><select className="mac-select" value={v.status} onChange={e => set('status', e.target.value)}>{STATUSES.map(t => <option key={t}>{t}</option>)}</select></Field>
            {v.type === 'Subtask'
              ? <Field label="Parent task" required error={errors.parentId}><select className="mac-select" value={v.parentId} onChange={e => set('parentId', e.target.value)}><option value="">Choose…</option>{parents.map(t => <option key={t.id} value={t.id}>{taskKey(t, ctx.projects)} {t.title}</option>)}</select></Field>
              : v.type !== 'Epic' && <Field label="Epic"><select className="mac-select" value={v.parentId} onChange={e => set('parentId', e.target.value)}><option value="">None</option>{epics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>}
            {v.projectId && <Field label="Sprint"><select className="mac-select" value={v.sprintId} onChange={e => set('sprintId', e.target.value)}><option value="">Backlog</option>{sprints.map(s => <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' (active)' : ''}</option>)}</select></Field>}
            <Field label="Start date"><input type="date" className="mac-input" value={v.startDate} onChange={e => set('startDate', e.target.value)} /></Field>
            <Field label="Story points"><input type="number" min="0" step="0.5" className="mac-input" value={v.storyPoints} onChange={e => set('storyPoints', e.target.value)} /></Field>
            <Field label="Estimate (hours)"><input type="number" min="0" step="0.5" className="mac-input" value={v.estimateHours} onChange={e => set('estimateHours', e.target.value)} /></Field>
          </FormGrid>
          <Field label="Labels">{() => <LabelsInput value={v.labels} onChange={x => set('labels', x)} suggestions={ctx.allLabels} />}</Field>
        </FormSection>
      </form>
    </Modal>
  );
}
