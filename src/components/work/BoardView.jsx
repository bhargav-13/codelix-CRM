import { useState, useMemo } from 'react';
import { STATUSES, taskKey, isOverdue } from '../../lib/work';
import { STATUS_META, TypeGlyph, PriorityGlyph, AvatarStack, LabelPill, Avatar } from './ui';
import { Plus, MessageSquare, Paperclip, CalendarClock, ListChecks, GitBranch, Clock } from 'lucide-react';

export function TaskCard({ t, ctx, onOpen, draggable, onDragStart, onDragEnd, dragging }) {
  const subs = ctx.childrenOf(t.id);
  const doneSubs = subs.filter(s => s.status === 'Done').length;
  const checks = t.checklist || [];
  const epic = t.parentId ? ctx.taskById(t.parentId) : null;
  const logged = ctx.loggedFor(t.id);
  return (
    <div draggable={draggable} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); onDragStart?.(t); }}
      onDragEnd={onDragEnd} onClick={() => onOpen(t)} className="wk-card" style={{ opacity: dragging ? 0.4 : 1, cursor: draggable ? 'grab' : 'pointer' }}>
      {epic && epic.type === 'Epic' && <div style={{ fontSize: 10.5, color: '#8A3DB5', fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>⚡ {epic.title}</div>}
      <div style={{ fontSize: 13, fontWeight: 520, color: '#1D1D1F', lineHeight: 1.35, marginBottom: 8, wordBreak: 'break-word' }}>{t.title}</div>
      {t.labels?.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>{t.labels.slice(0, 3).map(l => <LabelPill key={l} label={l} />)}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#8E8E93', flexWrap: 'wrap' }}>
        <TypeGlyph type={t.type} size={15} />
        <span style={{ fontWeight: 600, color: '#6E6E73' }}>{taskKey(t, ctx.projects)}</span>
        <PriorityGlyph priority={t.priority} size={14} />
        {t.storyPoints != null && t.storyPoints !== '' && <span title="Story points" style={{ padding: '0 6px', borderRadius: 100, background: 'rgba(0,0,0,0.06)', fontWeight: 600, color: '#48484A' }}>{t.storyPoints}</span>}
        {t.dueDate && <span title="Due date" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: isOverdue(t) ? '#D70015' : '#8E8E93', fontWeight: isOverdue(t) ? 600 : 400 }}><CalendarClock size={11} />{t.dueDate.slice(5)}</span>}
        {subs.length > 0 && <span title="Subtasks done" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><GitBranch size={11} />{doneSubs}/{subs.length}</span>}
        {checks.length > 0 && <span title="Checklist" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><ListChecks size={11} />{checks.filter(c => c.done).length}/{checks.length}</span>}
        {t.comments?.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MessageSquare size={11} />{t.comments.length}</span>}
        {t.attachments?.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Paperclip size={11} />{t.attachments.length}</span>}
        {logged > 0 && <span title="Time logged" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={11} />{Math.round(logged / 6) / 10}h</span>}
        <span style={{ marginLeft: 'auto' }}><AvatarStack people={t.assignees} size={20} /></span>
      </div>
    </div>
  );
}

const LANES = [['none', 'No swimlanes'], ['assignee', 'By assignee'], ['epic', 'By epic'], ['priority', 'By priority']];

export default function BoardView({ tasks, ctx, onOpen, onMove, onQuickAdd, canCreate, canEdit }) {
  const [lane, setLane] = useState('none');
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null); // `${laneKey}|${status}`

  const lanes = useMemo(() => {
    if (lane === 'none') return [{ key: 'all', label: null, tasks }];
    const groups = new Map();
    const put = (k, label, t, sortKey) => { if (!groups.has(k)) groups.set(k, { key: k, label, tasks: [], sortKey }); groups.get(k).tasks.push(t); };
    for (const t of tasks) {
      if (lane === 'assignee') {
        if (!t.assignees.length) put('none', 'Unassigned', t, 'zzz');
        else t.assignees.forEach(a => put(`${a.kind}:${a.id}`, a.name, t, a.name));
      } else if (lane === 'epic') {
        const e = t.parentId && ctx.taskById(t.parentId);
        if (e && e.type === 'Epic') put(e.id, `⚡ ${e.title}`, t, e.title); else put('none', 'No epic', t, 'zzz');
      } else {
        put(t.priority, t.priority, t, ['Highest', 'High', 'Medium', 'Low', 'Lowest'].indexOf(t.priority));
      }
    }
    return [...groups.values()].sort((a, b) => (a.sortKey > b.sortKey ? 1 : -1));
  }, [lane, tasks, ctx]);

  function drop(status, laneKey, e) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setOver(null); setDragId(null);
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const patch = { status };
    if (lane === 'assignee' && laneKey !== 'all') {
      const target = laneKey === 'none' ? [] : null;
      if (target) patch.assignees = target;
      else if (!t.assignees.some(a => `${a.kind}:${a.id}` === laneKey)) {
        const person = ctx.people.find(p => `${p.kind}:${p.id}` === laneKey);
        if (person) patch.assignees = [{ id: person.id, name: person.name, kind: person.kind }];
      }
    }
    if (lane === 'priority' && laneKey !== t.priority) patch.priority = laneKey;
    const col = tasks.filter(x => x.status === status && x.id !== id);
    patch.sortOrder = (col.reduce((m, x) => Math.max(m, x.sortOrder || 0), 0)) + 1000;
    if (status === t.status && !patch.assignees && !patch.priority) return;
    onMove(t, patch);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="mac-select" value={lane} onChange={e => setLane(e.target.value)} style={{ width: 'auto', fontSize: 12.5 }} aria-label="Swimlanes">
          {LANES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span style={{ fontSize: 11.5, color: '#AEAEB2' }}>{tasks.length} issue{tasks.length === 1 ? '' : 's'}{canEdit ? ' · drag cards to change status' : ''}</span>
      </div>
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STATUSES.length}, minmax(240px, 1fr))`, gap: 12, minWidth: STATUSES.length * 252 }}>
          {STATUSES.map(s => {
            const n = tasks.filter(t => t.status === s);
            const pts = n.reduce((a, t) => a + (+t.storyPoints || 0), 0);
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 6px', fontSize: 11.5, fontWeight: 650, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS_META[s].dot }} />{s}
                <span style={{ fontWeight: 500, color: '#AEAEB2' }}>{n.length}{pts ? ` · ${pts} pts` : ''}</span>
              </div>
            );
          })}
          {lanes.map(L => (
            <LaneRow key={L.key} L={L} ctx={ctx} onOpen={onOpen} canEdit={canEdit} canCreate={canCreate && lane === 'none'}
              dragId={dragId} setDragId={setDragId} over={over} setOver={setOver} drop={drop} onQuickAdd={onQuickAdd} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LaneRow({ L, ctx, onOpen, canEdit, canCreate, dragId, setDragId, over, setOver, drop, onQuickAdd }) {
  return (
    <>
      {L.label && (
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px 0', fontSize: 12.5, fontWeight: 650, color: '#1D1D1F', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          {L.key.includes(':') && <Avatar p={{ kind: L.key.split(':')[0], id: L.key.split(':')[1], name: L.label }} size={18} ring={false} />}
          {L.label} <span style={{ fontWeight: 400, color: '#AEAEB2' }}>{L.tasks.length}</span>
        </div>
      )}
      {STATUSES.map(s => {
        const items = L.tasks.filter(t => t.status === s).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const k = `${L.key}|${s}`;
        return (
          <div key={k} className="wk-col" style={{ outline: over === k ? '2px dashed rgba(0,113,227,0.5)' : 'none' }}
            onDragOver={e => { if (!canEdit) return; e.preventDefault(); if (over !== k) setOver(k); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
            onDrop={e => canEdit && drop(s, L.key, e)}>
            {items.map(t => (
              <TaskCard key={t.id} t={t} ctx={ctx} onOpen={onOpen} draggable={canEdit} dragging={dragId === t.id}
                onDragStart={x => setDragId(x.id)} onDragEnd={() => { setDragId(null); setOver(null); }} />
            ))}
            {canCreate && <QuickAdd onAdd={title => onQuickAdd(title, s)} />}
          </div>
        );
      })}
    </>
  );
}

export function QuickAdd({ onAdd, placeholder = 'What needs to be done?' }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  if (!open) return <button onClick={() => setOpen(true)} className="wk-quick"><Plus size={13} /> Create issue</button>;
  return (
    <input autoFocus className="mac-input" value={v} placeholder={placeholder} style={{ fontSize: 13 }}
      onChange={e => setV(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } if (e.key === 'Escape') { setOpen(false); setV(''); } }}
      onBlur={() => { if (v.trim()) onAdd(v.trim()); setOpen(false); setV(''); }} />
  );
}
