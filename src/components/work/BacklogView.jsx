import { useState } from 'react';
import { taskKey, todayISO } from '../../lib/work';
import { TypeGlyph, PriorityGlyph, AvatarStack, StatusPill, EmptyNote, FF } from './ui';
import { QuickAdd } from './BoardView';
import Modal from '../ui/Modal';
import { Play, CheckCircle2, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Target } from 'lucide-react';

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default function BacklogView({ project, tasks, sprints, ctx, onOpen, onPatch, onQuickAdd, sprintApi, canCreate, canEdit, canManageSprints }) {
  const [collapsed, setCollapsed] = useState({});
  const [editSprint, setEditSprint] = useState(null);   // sprint object or { new: true }
  const [completing, setCompleting] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overKey, setOverKey] = useState(null);

  if (!project) return <EmptyNote>Pick a project above to plan its backlog and sprints.</EmptyNote>;

  const projSprints = sprints.filter(s => s.projectId === project.id && s.status !== 'completed')
    .sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : (a.startDate || a.createdAt || '').localeCompare(b.startDate || b.createdAt || '')));
  const done = sprints.filter(s => s.projectId === project.id && s.status === 'completed');
  const active = projSprints.find(s => s.status === 'active');
  const backlog = tasks.filter(t => !t.sprintId || !projSprints.some(s => s.id === t.sprintId));

  const moveTo = (t, sprintId) => { if ((t.sprintId || null) !== (sprintId || null)) onPatch(t, { sprintId: sprintId || null }); };

  // plain render helper (not a component) so rows don't remount on every update
  function renderSection({ sKey, title, sub, list, sprint }) {
    const isCol = collapsed[sKey];
    const pts = list.reduce((a, t) => a + (+t.storyPoints || 0), 0);
    const doneN = list.filter(t => t.status === 'Done').length;
    return (
      <div key={sKey} className="mac-card" style={{ padding: 0, overflow: 'hidden', outline: overKey === sKey ? '2px dashed rgba(0,113,227,0.5)' : 'none' }}
        onDragOver={e => { if (!canEdit) return; e.preventDefault(); setOverKey(sKey); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOverKey(null); }}
        onDrop={e => { e.preventDefault(); setOverKey(null); const t = tasks.find(x => x.id === (e.dataTransfer.getData('text/plain') || dragId)); if (t) moveTo(t, sprint?.id || null); }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'rgba(0,0,0,0.02)', flexWrap: 'wrap' }}>
          <button onClick={() => setCollapsed(c => ({ ...c, [sKey]: !c[sKey] }))} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex' }} aria-label="Collapse">
            {isCol ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 650 }}>{title}</span>
              {sprint?.status === 'active' && <span style={{ fontSize: 10.5, fontWeight: 650, color: '#248A3D', background: 'rgba(52,199,89,0.12)', padding: '1px 7px', borderRadius: 100 }}>ACTIVE</span>}
              <span style={{ fontSize: 11.5, color: '#8E8E93' }}>{list.length} issues · {doneN} done{pts ? ` · ${pts} pts` : ''}</span>
            </div>
            {sub && <div style={{ fontSize: 11.5, color: '#8E8E93', marginTop: 2 }}>{sub}</div>}
          </div>
          {sprint && canManageSprints && (
            <div style={{ display: 'flex', gap: 6 }}>
              {sprint.status === 'planned' && <button disabled={!!active} title={active ? 'Finish the active sprint first' : ''} onClick={() => sprintApi.update(sprint.id, { status: 'active', startDate: sprint.startDate || todayISO(), endDate: sprint.endDate || addDays(todayISO(), 14) })} className="mac-btn mac-btn-primary" style={{ fontSize: 12 }}><Play size={12} /> Start sprint</button>}
              {sprint.status === 'active' && <button onClick={() => setCompleting(sprint)} className="mac-btn mac-btn-primary" style={{ fontSize: 12 }}><CheckCircle2 size={12} /> Complete sprint</button>}
              <button onClick={() => setEditSprint(sprint)} className="mac-btn mac-btn-secondary" style={{ fontSize: 12 }} aria-label="Edit sprint"><Pencil size={12} /></button>
              {sprint.status === 'planned' && <button onClick={() => { if (window.confirm(`Delete ${sprint.name}? Its issues go back to the backlog.`)) sprintApi.remove(sprint.id); }} className="mac-btn mac-btn-danger" style={{ fontSize: 12 }} aria-label="Delete sprint"><Trash2 size={12} /></button>}
            </div>
          )}
        </div>
        {!isCol && (
          <div>
            {list.length === 0 && <div style={{ padding: '14px', fontSize: 12, color: '#AEAEB2', textAlign: 'center' }}>{canEdit ? 'Drag issues here' : 'No issues'}</div>}
            {list.map(t => (
              <div key={t.id} draggable={canEdit} onDragStart={e => { e.dataTransfer.setData('text/plain', t.id); setDragId(t.id); }} onDragEnd={() => setDragId(null)}
                onClick={() => onOpen(t)} className="wk-row" style={{ opacity: dragId === t.id ? 0.4 : 1 }}>
                <TypeGlyph type={t.type} />
                <span style={{ fontSize: 11.5, color: '#8E8E93', fontWeight: 600, minWidth: 58 }}>{taskKey(t, ctx.projects)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.status === 'Done' ? 'line-through' : 'none', color: t.status === 'Done' ? '#8E8E93' : '#1D1D1F' }}>{t.title}</span>
                <StatusPill status={t.status} small />
                <PriorityGlyph priority={t.priority} />
                <span style={{ width: 28, textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#6E6E73' }}>{t.storyPoints ?? '–'}</span>
                <AvatarStack people={t.assignees} size={20} max={2} />
                {canEdit && (
                  <select className="mac-select" value={t.sprintId || ''} onClick={e => e.stopPropagation()} onChange={e => moveTo(t, e.target.value)} style={{ width: 120, fontSize: 11.5, padding: '3px 6px' }} aria-label="Move to sprint">
                    <option value="">Backlog</option>
                    {projSprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
            ))}
            {canCreate && <div style={{ padding: 8 }}><QuickAdd onAdd={title => onQuickAdd(title, 'To Do', sprint?.id || null)} /></div>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#8E8E93' }}>Drag issues between sprints and the backlog, or use the dropdown on each row.</span>
        <span style={{ flex: 1 }} />
        {canManageSprints && <button onClick={() => setEditSprint({ new: true })} className="mac-btn mac-btn-secondary" style={{ fontSize: 12.5 }}><Plus size={13} /> Create sprint</button>}
      </div>

      {projSprints.map(s => renderSection({
        sKey: s.id, sprint: s, title: s.name,
        sub: [s.startDate && s.endDate ? `${s.startDate} → ${s.endDate}` : null, s.goal ? `Goal: ${s.goal}` : null].filter(Boolean).join(' · '),
        list: tasks.filter(t => t.sprintId === s.id).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
      }))}
      {renderSection({ sKey: 'backlog', title: 'Backlog', list: [...backlog].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)) })}

      {done.length > 0 && (
        <div className="mac-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 8 }}>Completed sprints</div>
          {done.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')).map(s => {
            const list = tasks.filter(t => t.sprintId === s.id);
            return <div key={s.id} style={{ fontSize: 12, color: '#6E6E73', padding: '4px 0' }}>{s.name} · {list.filter(t => t.status === 'Done').length} done · {list.filter(t => t.status === 'Done').reduce((a, t) => a + (+t.storyPoints || 0), 0)} pts{s.completedAt ? ` · closed ${s.completedAt.slice(0, 10)}` : ''}</div>;
          })}
        </div>
      )}

      <SprintModal sprint={editSprint} project={project} count={sprints.filter(s => s.projectId === project.id).length} onClose={() => setEditSprint(null)}
        onSave={async v => { if (editSprint.new) await sprintApi.create({ ...v, projectId: project.id }); else await sprintApi.update(editSprint.id, v); setEditSprint(null); }} />

      <CompleteModal sprint={completing} tasks={tasks.filter(t => t.sprintId === completing?.id)} nextSprints={projSprints.filter(s => s.status === 'planned')}
        onClose={() => setCompleting(null)}
        onComplete={async target => {
          const open = tasks.filter(t => t.sprintId === completing.id && t.status !== 'Done');
          for (const t of open) await onPatch(t, { sprintId: target || null });
          await sprintApi.update(completing.id, { status: 'completed' });
          setCompleting(null);
        }} />
    </div>
  );
}

function SprintModal({ sprint, project, count, onClose, onSave }) {
  const init = sprint?.new ? { name: `${project.key || 'Sprint'} Sprint ${count + 1}`, goal: '', startDate: todayISO(), endDate: addDays(todayISO(), 14) } : sprint;
  const [v, setV] = useState(init);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState(sprint);
  if (sprint !== key) { setKey(sprint); setV(init); }
  if (!sprint) return null;
  return (
    <Modal isOpen onClose={onClose} title={sprint.new ? 'Create sprint' : 'Edit sprint'} size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FF label="Name" required><input className="mac-input" value={v.name || ''} onChange={e => setV({ ...v, name: e.target.value })} /></FF>
        <FF label="Sprint goal"><textarea className="mac-input" rows={2} value={v.goal || ''} onChange={e => setV({ ...v, goal: e.target.value })} placeholder="What should this sprint achieve?" /></FF>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <FF label="Start"><input type="date" className="mac-input" value={v.startDate || ''} onChange={e => setV({ ...v, startDate: e.target.value })} /></FF>
          <FF label="End"><input type="date" className="mac-input" value={v.endDate || ''} onChange={e => setV({ ...v, endDate: e.target.value })} /></FF>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 14, 21].map(n => <button key={n} type="button" onClick={() => setV({ ...v, endDate: addDays(v.startDate || todayISO(), n) })} className="mac-btn mac-btn-secondary" style={{ fontSize: 11.5 }}>{n / 7} week{n > 7 ? 's' : ''}</button>)}
        </div>
        <button disabled={!v.name?.trim() || saving} onClick={async () => { setSaving(true); try { await onSave({ name: v.name.trim(), goal: v.goal, startDate: v.startDate, endDate: v.endDate }); } catch (e) { alert(e.message); } setSaving(false); }} className="mac-btn mac-btn-primary" style={{ fontSize: 13 }}>
          <Target size={13} /> {sprint.new ? 'Create sprint' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}

function CompleteModal({ sprint, tasks, nextSprints, onClose, onComplete }) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  if (!sprint) return null;
  const open = tasks.filter(t => t.status !== 'Done');
  const doneN = tasks.length - open.length;
  return (
    <Modal isOpen onClose={onClose} title={`Complete ${sprint.name}`} size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
        <div><strong>{doneN}</strong> issue{doneN === 1 ? '' : 's'} done, <strong>{open.length}</strong> still open.</div>
        {open.length > 0 && (
          <FF label="Move open issues to">
            <select className="mac-select" value={target} onChange={e => setTarget(e.target.value)}>
              <option value="">Backlog</option>
              {nextSprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FF>
        )}
        <button disabled={busy} onClick={async () => { setBusy(true); try { await onComplete(target); } catch (e) { alert(e.message); } setBusy(false); }} className="mac-btn mac-btn-primary" style={{ fontSize: 13 }}>
          <CheckCircle2 size={13} /> Complete sprint
        </button>
      </div>
    </Modal>
  );
}
