import { useState, useId } from 'react';
import { taskKey } from '../../lib/work';
import { TypeGlyph, PriorityGlyph, AvatarStack, StatusPill, QuickAdd, addDays, shortDate, plural } from './ui';
import Modal from '../ui/Modal';
import { Field, FormGrid, RowMenu, useToast, todayLocal, fmtDate } from '../ui/kit';
import { Play, CheckCircle2, Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

const bySort = (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0);
const points = list => list.reduce((a, t) => a + (+t.storyPoints || 0), 0);

export default function BacklogView({ project, tasks, sprints, ctx, onOpen, onPatch, onQuickAdd, sprintApi, canCreate, canEdit, canManageSprints, askConfirm }) {
  const toast = useToast();
  const [collapsed, setCollapsed] = useState({});
  const [editSprint, setEditSprint] = useState(null);   // sprint object or { new: true }
  const [completing, setCompleting] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const [starting, setStarting] = useState('');

  if (!project) return null;

  const all = sprints.filter(s => s.projectId === project.id);
  const projSprints = all.filter(s => s.status !== 'completed')
    .sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : (a.startDate || a.createdAt || '').localeCompare(b.startDate || b.createdAt || '')));
  const done = all.filter(s => s.status === 'completed').sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  const active = projSprints.find(s => s.status === 'active');
  const backlog = tasks.filter(t => !t.sprintId || !projSprints.some(s => s.id === t.sprintId));

  const moveTo = (t, sprintId) => { if ((t.sprintId || null) !== (sprintId || null)) onPatch(t, { sprintId: sprintId || null }).catch(() => {}); };

  async function startSprint(s) {
    setStarting(s.id);
    try {
      await sprintApi.update(s.id, { status: 'active', startDate: s.startDate || todayLocal(), endDate: s.endDate || addDays(todayLocal(), 14) });
      toast.success(`${s.name} started`);
    } catch (e) { toast.error('Could not start the sprint', e); }
    setStarting('');
  }
  const removeSprint = s => askConfirm({
    title: 'Delete sprint', message: `Delete ${s.name}? Its tasks go back to the backlog; nothing else is deleted.`, confirmLabel: 'Delete sprint',
    run: async () => { try { await sprintApi.remove(s.id); toast.success(`${s.name} deleted`); } catch (e) { toast.error('Could not delete the sprint', e); } },
  });

  // plain render helper (not a component) so rows don't remount on every update
  function renderSection({ sKey, title, sub, list, sprint }) {
    const isCol = collapsed[sKey];
    const pts = points(list);
    const doneN = list.filter(t => t.status === 'Done').length;
    return (
      <div key={sKey} className={`mac-card wk-section ${overKey === sKey ? 'is-over' : ''}`} style={{ padding: 0, overflow: 'hidden' }}
        onDragOver={e => { if (!canEdit || !dragId) return; e.preventDefault(); if (overKey !== sKey) setOverKey(sKey); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOverKey(null); }}
        onDrop={e => { e.preventDefault(); setOverKey(null); const t = tasks.find(x => x.id === (dragId || e.dataTransfer.getData('text/plain'))); setDragId(null); if (t && canEdit) moveTo(t, sprint?.id || null); }}>
        <div className="wk-section-head">
          <button className="icon-btn plain" onClick={() => setCollapsed(c => ({ ...c, [sKey]: !c[sKey] }))} aria-expanded={!isCol} aria-label={`${isCol ? 'Expand' : 'Collapse'} ${title}`}>
            {isCol ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="wk-section-title">{title}</span>
              {sprint?.status === 'active' && <span className="wk-tag">Active</span>}
              <span className="wk-hint">{plural(list.length, 'task')} · {doneN} done{pts ? ` · ${pts} pts` : ''}</span>
            </div>
            {sub && <div className="wk-hint" style={{ marginTop: 2 }}>{sub}</div>}
          </div>
          {sprint && canManageSprints && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {sprint.status === 'planned' && <button disabled={!!active || starting === sprint.id} title={active ? 'Finish the active sprint first' : ''} onClick={() => startSprint(sprint)} className="mac-btn mac-btn-secondary"><Play size={13} /> {starting === sprint.id ? 'Starting…' : 'Start sprint'}</button>}
              {sprint.status === 'active' && <button onClick={() => setCompleting(sprint)} className="mac-btn mac-btn-secondary"><CheckCircle2 size={13} /> Complete sprint</button>}
              <RowMenu label={`Actions for ${sprint.name}`} items={[
                { label: 'Edit sprint', icon: Pencil, onClick: () => setEditSprint(sprint) },
                sprint.status === 'planned' && { label: 'Delete sprint', icon: Trash2, danger: true, onClick: () => removeSprint(sprint) },
              ]} />
            </div>
          )}
        </div>
        {!isCol && (
          <div>
            {canCreate && <div style={{ padding: '0 12px 10px' }}><QuickAdd onAdd={t => onQuickAdd(t, 'To Do', sprint?.id || null)} label={`Add a task to ${title}`} /></div>}
            {list.length === 0 && <div className="wk-note" style={{ padding: 14 }}>{canEdit ? 'Nothing here yet — drag tasks in, or use “Move to” on a task.' : 'No tasks'}</div>}
            {list.map(t => (
              <div key={t.id} draggable={canEdit} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); setDragId(t.id); }} onDragEnd={() => { setDragId(null); setOverKey(null); }}
                onClick={() => onOpen(t)} className={`wk-row ${dragId === t.id ? 'dragging' : ''}`}>
                <TypeGlyph type={t.type} />
                <span className="wk-key" style={{ minWidth: 58 }}>{taskKey(t, ctx.projects)}</span>
                <button type="button" className={`wk-row-title ${t.status === 'Done' ? 'done' : ''}`}>{t.title}</button>
                <StatusPill status={t.status} />
                <PriorityGlyph priority={t.priority} />
                <span className="wk-pts wk-hide-sm" title="Story points">{t.storyPoints ?? '–'}</span>
                <AvatarStack people={t.assignees} size={20} max={2} />
                {canEdit && (
                  <select className="mac-select" value={projSprints.some(s => s.id === t.sprintId) ? t.sprintId : ''} onClick={e => e.stopPropagation()} onChange={e => moveTo(t, e.target.value)} aria-label={`Move “${t.title}” to`}>
                    <option value="">Backlog</option>
                    {projSprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="toolbar">
        <span className="wk-hint">Plan sprints: drag tasks between sections, or use “Move to” on each row.</span>
        {canManageSprints && <div className="toolbar-right"><button onClick={() => setEditSprint({ new: true })} className="mac-btn mac-btn-secondary"><Plus size={14} /> New sprint</button></div>}
      </div>

      {projSprints.map(s => renderSection({
        sKey: s.id, sprint: s, title: s.name,
        sub: [s.startDate && s.endDate ? `${shortDate(s.startDate)} → ${shortDate(s.endDate)}` : null, s.goal ? `Goal: ${s.goal}` : null].filter(Boolean).join(' · '),
        list: tasks.filter(t => t.sprintId === s.id).sort(bySort),
      }))}
      {renderSection({ sKey: 'backlog', title: 'Backlog', list: [...backlog].sort(bySort) })}

      {done.length > 0 && (
        <div className="mac-card wk-cardpad">
          <div className="wk-card-h" style={{ marginBottom: 8 }}>Completed sprints</div>
          {done.map(s => {
            const finished = tasks.filter(t => t.sprintId === s.id && t.status === 'Done');
            return <div key={s.id} className="wk-entry"><span className="what">{s.name}</span><span className="muted">{finished.length} done · {points(finished)} pts{s.completedAt ? ` · closed ${fmtDate(s.completedAt)}` : ''}</span></div>;
          })}
        </div>
      )}

      {editSprint && (
        <SprintModal sprint={editSprint} project={project} count={all.length} onClose={() => setEditSprint(null)}
          onSave={async v => {
            if (editSprint.new) await sprintApi.create({ ...v, projectId: project.id }); else await sprintApi.update(editSprint.id, v);
            toast.success(editSprint.new ? 'Sprint created' : 'Sprint saved');
            setEditSprint(null);
          }} />
      )}

      {completing && (
        <CompleteModal sprint={completing} tasks={tasks.filter(t => t.sprintId === completing.id)} nextSprints={projSprints.filter(s => s.status === 'planned')}
          onClose={() => setCompleting(null)}
          onComplete={async target => {
            // stops at the first task that fails to move, so the sprint is never closed with tasks stranded in it
            for (const t of tasks.filter(x => x.sprintId === completing.id && x.status !== 'Done')) await onPatch(t, { sprintId: target || null });
            await sprintApi.update(completing.id, { status: 'completed' });
            toast.success(`${completing.name} completed`);
            setCompleting(null);
          }} />
      )}
    </div>
  );
}

function SprintModal({ sprint, project, count, onClose, onSave }) {
  const toast = useToast();
  const formId = useId();
  const [v, setV] = useState(() => (sprint.new
    ? { name: `${project.key || 'Sprint'} Sprint ${count + 1}`, goal: '', startDate: todayLocal(), endDate: addDays(todayLocal(), 14) }
    : { name: sprint.name || '', goal: sprint.goal || '', startDate: sprint.startDate || '', endDate: sprint.endDate || '' }));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k, val) => setV(x => ({ ...x, [k]: val }));

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!v.name.trim()) errs.name = 'Give the sprint a name';
    if (v.startDate && v.endDate && v.endDate < v.startDate) errs.endDate = 'The end date is before the start date';
    setErrors(errs);
    if (Object.keys(errs).length || saving) return;
    setSaving(true);
    try { await onSave({ name: v.name.trim(), goal: v.goal, startDate: v.startDate, endDate: v.endDate }); }
    catch (err) { toast.error('Could not save the sprint', err); setSaving(false); }
  }

  return (
    <Modal isOpen onClose={onClose} title={sprint.new ? 'New sprint' : 'Edit sprint'} size="sm"
      footer={<>
        <button type="button" onClick={onClose} className="mac-btn mac-btn-secondary">Cancel</button>
        <button type="submit" form={formId} disabled={saving} className="mac-btn mac-btn-primary">{saving ? 'Saving…' : sprint.new ? 'Create sprint' : 'Save'}</button>
      </>}>
      <form id={formId} onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Name" required error={errors.name}><input className="mac-input" value={v.name} onChange={e => set('name', e.target.value)} /></Field>
        <FormGrid>
          <Field label="Start"><input type="date" className="mac-input" value={v.startDate} onChange={e => set('startDate', e.target.value)} /></Field>
          <Field label="End" error={errors.endDate}><input type="date" className="mac-input" value={v.endDate} onChange={e => set('endDate', e.target.value)} /></Field>
        </FormGrid>
        <div className="chips" aria-label="Sprint length">
          {[7, 14, 21].map(n => <button key={n} type="button" onClick={() => set('endDate', addDays(v.startDate || todayLocal(), n))} className="chip">{plural(n / 7, 'week')}</button>)}
        </div>
        <Field label="Sprint goal" hint="Optional"><textarea className="mac-input" rows={2} value={v.goal} onChange={e => set('goal', e.target.value)} placeholder="What should this sprint achieve?" /></Field>
      </form>
    </Modal>
  );
}

function CompleteModal({ sprint, tasks, nextSprints, onClose, onComplete }) {
  const toast = useToast();
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const open = tasks.filter(t => t.status !== 'Done');
  const doneN = tasks.length - open.length;
  async function run() {
    setBusy(true);
    try { await onComplete(target); }
    catch (e) { if (!e?.shown) toast.error('Could not complete the sprint', e); setBusy(false); }
  }
  return (
    <Modal isOpen onClose={onClose} title={`Complete ${sprint.name}`} size="sm"
      footer={<>
        <button onClick={onClose} className="mac-btn mac-btn-secondary">Cancel</button>
        <button disabled={busy} onClick={run} className="mac-btn mac-btn-primary">{busy ? 'Completing…' : 'Complete sprint'}</button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13.5 }}>
        <div><strong>{doneN}</strong> {doneN === 1 ? 'task is' : 'tasks are'} done, <strong>{open.length}</strong> still open.</div>
        {open.length > 0 && (
          <Field label="Move open tasks to">
            <select className="mac-select" value={target} onChange={e => setTarget(e.target.value)}>
              <option value="">Backlog</option>
              {nextSprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}
