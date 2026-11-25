import { useState, useMemo } from 'react';
import { STATUSES, PRIORITIES, taskKey } from '../../lib/work';
import { STATUS_META, TypeGlyph, PriorityGlyph, AvatarStack, LabelPill, Avatar, QuickAdd, isLate, shortDate, personKey, asPerson, plural } from './ui';
import { MessageSquare, Paperclip, CalendarClock, ListChecks, GitBranch, Clock, ArrowRightLeft } from 'lucide-react';

const LANES = [['none', 'No swimlanes'], ['assignee', 'By assignee'], ['epic', 'By epic'], ['priority', 'By priority']];
const bySort = (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0);

function TaskCard({ t, ctx, onOpen, canEdit, dragging, onDragStart, onDragEnd, onStatus }) {
  const kids = ctx.childStats.get(t.id);
  const logged = ctx.loggedBy.get(t.id) || 0;
  const checks = t.checklist || [];
  const epic = t.parentId ? ctx.taskById(t.parentId) : null;
  const late = isLate(t);
  return (
    <div className={`wk-card ${dragging ? 'dragging' : ''}`} data-card={t.id} draggable={canEdit}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); onDragStart(t); }}
      onDragEnd={onDragEnd} onClick={() => onOpen(t)}>
      {epic?.type === 'Epic' && <div className="wk-card-epic">{epic.title}</div>}
      <div className="wk-card-top">
        <button type="button" className="wk-card-title">{t.title}</button>
        {canEdit && (
          <label className="wk-move" title="Move to another column" onClick={e => e.stopPropagation()}>
            <ArrowRightLeft size={15} aria-hidden="true" />
            <select aria-label={`Move “${t.title}” to`} value={t.status} onChange={e => onStatus(t, e.target.value)}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
        )}
      </div>
      {t.labels?.length > 0 && <div className="wk-card-labels">{t.labels.slice(0, 3).map(l => <LabelPill key={l} label={l} />)}</div>}
      <div className="wk-meta">
        <TypeGlyph type={t.type} size={15} />
        <span className="wk-key">{taskKey(t, ctx.projects)}</span>
        <PriorityGlyph priority={t.priority} size={14} />
        {t.storyPoints != null && t.storyPoints !== '' && <span title="Story points" className="wk-pointsbadge">{t.storyPoints}</span>}
        {t.dueDate && <span title={late ? 'Overdue' : 'Due date'} className={late ? 'wk-late' : ''}><CalendarClock size={12} />{shortDate(t.dueDate)}</span>}
        {kids && <span title="Subtasks done"><GitBranch size={12} />{kids.done}/{kids.total}</span>}
        {checks.length > 0 && <span title="Checklist"><ListChecks size={12} />{checks.filter(c => c.done).length}/{checks.length}</span>}
        {t.comments?.length > 0 && <span title="Comments"><MessageSquare size={12} />{t.comments.length}</span>}
        {t.attachments?.length > 0 && <span title="Attachments"><Paperclip size={12} />{t.attachments.length}</span>}
        {logged > 0 && <span title="Time logged"><Clock size={12} />{Math.round(logged / 6) / 10}h</span>}
        <span style={{ marginLeft: 'auto' }}><AvatarStack people={t.assignees} size={20} /></span>
      </div>
    </div>
  );
}

export default function BoardView({ tasks, ctx, onOpen, onMove, onQuickAdd, canCreate, canEdit }) {
  const [lane, setLane] = useState('none');
  const [drag, setDrag] = useState(null);   // { id, lane } — card being dragged and the lane it came from
  const [over, setOver] = useState(null);   // { key: `${laneKey}|${status}`, before: cardId | null }

  const lanes = useMemo(() => {
    if (lane === 'none') return [{ key: 'all', label: null, tasks }];
    const groups = new Map();
    const put = (k, label, t, sortKey) => { if (!groups.has(k)) groups.set(k, { key: k, label, tasks: [], sortKey }); groups.get(k).tasks.push(t); };
    for (const t of tasks) {
      if (lane === 'assignee') {
        if (!t.assignees.length) put('none', 'Unassigned', t, 'zzz');
        else t.assignees.forEach(a => put(personKey(a), a.name, t, a.name));
      } else if (lane === 'epic') {
        const e = t.parentId && ctx.taskById(t.parentId);
        if (e && e.type === 'Epic') put(e.id, e.title, t, e.title); else put('none', 'No epic', t, 'zzz');
      } else {
        put(t.priority, t.priority, t, PRIORITIES.indexOf(t.priority));
      }
    }
    return [...groups.values()].sort((a, b) => (a.sortKey > b.sortKey ? 1 : -1));
  }, [lane, tasks, ctx]);

  const heads = useMemo(() => {
    const m = new Map(STATUSES.map(s => [s, { n: 0, pts: 0 }]));
    for (const t of tasks) { const h = m.get(t.status); if (h) { h.n++; h.pts += +t.storyPoints || 0; } }
    return m;
  }, [tasks]);

  const endDrag = () => { setDrag(null); setOver(null); };

  // items = the cards of the cell that received the drop, in display order
  function drop(status, laneKey, items, e) {
    e.preventDefault();
    const id = drag?.id || e.dataTransfer.getData('text/plain');
    const from = drag?.lane;
    const target = over;
    endDrag();
    const t = tasks.find(x => x.id === id);
    if (!t) return;

    const patch = {};
    if (status !== t.status) patch.status = status;

    // Swimlanes. A task with several assignees sits in several lanes, so a drop
    // from one person's lane to another's swaps just that person; everyone else
    // stays. Only the "Unassigned" lane clears the list, because that is what it means.
    if (lane === 'assignee' && laneKey !== 'all' && laneKey !== from) {
      if (laneKey === 'none') {
        if (t.assignees.length) patch.assignees = [];
      } else {
        const person = ctx.people.find(p => personKey(p) === laneKey);
        if (person) {
          const kept = t.assignees.filter(a => personKey(a) !== from && personKey(a) !== laneKey);
          const next = [...kept, asPerson(person)];
          if (next.length !== t.assignees.length || !t.assignees.some(a => personKey(a) === laneKey)) patch.assignees = next;
        }
      }
    }
    if (lane === 'priority' && laneKey !== t.priority) patch.priority = laneKey;

    // Position: place the card between the neighbours of where it was dropped.
    const own = items.findIndex(x => x.id === id);
    let before = target?.key === `${laneKey}|${status}` ? target.before : null;
    if (before === id) before = items[own + 1]?.id ?? null;
    const list = items.filter(x => x.id !== id);
    let idx = before ? list.findIndex(x => x.id === before) : list.length;
    if (idx < 0) idx = list.length;
    const extra = [];
    if (own !== idx) {
      const a = list[idx - 1] ? (list[idx - 1].sortOrder || 0) : null;
      const b = list[idx] ? (list[idx].sortOrder || 0) : null;
      if (a == null && b == null) patch.sortOrder = 1000;
      else if (a == null) patch.sortOrder = b - 1000;
      else if (b == null) patch.sortOrder = a + 1000;
      else if (b - a > 1e-6) patch.sortOrder = (a + b) / 2;
      else {
        // neighbours share the same order value: renumber this cell once
        [...list.slice(0, idx), t, ...list.slice(idx)].forEach((x, n) => {
          const so = (n + 1) * 1000;
          if (x.id === id) patch.sortOrder = so; else if (x.sortOrder !== so) extra.push([x, { sortOrder: so }]);
        });
      }
    }
    if (!Object.keys(patch).length) return;
    onMove(t, patch);
    extra.forEach(([x, p]) => onMove(x, p));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      <div className="toolbar">
        <select className="mac-select" value={lane} onChange={e => setLane(e.target.value)} aria-label="Swimlanes">
          {LANES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="wk-hint">{plural(tasks.length, 'task')}{canEdit ? ' · drag a card to move or reorder it, or use the arrows on the card' : ''}</span>
      </div>
      <div className="wk-board-scroll">
        <div className="wk-board">
          {STATUSES.map(s => {
            const h = heads.get(s);
            return (
              <div key={s} className="wk-col-head">
                <i style={{ background: STATUS_META[s].dot }} />{s}
                <span className="n">{h.n}{h.pts ? ` · ${h.pts} pts` : ''}</span>
              </div>
            );
          })}
          {lanes.map(L => (
            <LaneRow key={L.key} L={L} ctx={ctx} onOpen={onOpen} canEdit={canEdit} canCreate={canCreate && lane === 'none'}
              drag={drag} setDrag={setDrag} over={over} setOver={setOver} endDrag={endDrag} drop={drop}
              onQuickAdd={onQuickAdd} onStatus={(t, status) => { if (status !== t.status) onMove(t, { status }); }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LaneRow({ L, ctx, onOpen, canEdit, canCreate, drag, setDrag, over, setOver, endDrag, drop, onQuickAdd, onStatus }) {
  return (
    <>
      {L.label && (
        <div className="wk-lane-head">
          {L.key.includes(':') && <Avatar p={{ kind: L.key.split(':')[0], id: L.key.split(':')[1], name: L.label }} size={20} ring={false} />}
          {L.label} <span className="n">{L.tasks.length}</span>
        </div>
      )}
      {STATUSES.map(s => {
        const items = L.tasks.filter(t => t.status === s).sort(bySort);
        const k = `${L.key}|${s}`;
        const isOver = over?.key === k;
        return (
          <div key={k} className={`wk-col ${isOver ? 'is-over' : ''}`} aria-label={`${s}${L.label ? ` — ${L.label}` : ''}`}
            onDragOver={e => {
              if (!canEdit || !drag) return;
              e.preventDefault();
              const hit = [...e.currentTarget.querySelectorAll('[data-card]')].find(el => { const r = el.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
              const before = hit ? hit.dataset.card : null;
              if (!isOver || over.before !== before) setOver({ key: k, before });
            }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
            onDrop={e => { if (canEdit) drop(s, L.key, items, e); }}>
            {canCreate && <QuickAdd onAdd={title => onQuickAdd(title, s)} label={`Add a task to ${s}`} />}
            {items.map(t => (
              <LaneCard key={t.id} showLine={isOver && over.before === t.id}>
                <TaskCard t={t} ctx={ctx} onOpen={onOpen} canEdit={canEdit} dragging={drag?.id === t.id}
                  onDragStart={x => setDrag({ id: x.id, lane: L.key })} onDragEnd={endDrag} onStatus={onStatus} />
              </LaneCard>
            ))}
            {isOver && over.before == null && <div className="wk-drop-line" />}
          </div>
        );
      })}
    </>
  );
}

function LaneCard({ showLine, children }) {
  return <>{showLine && <div className="wk-drop-line" />}{children}</>;
}
