import { useState, useEffect, useRef } from 'react';
import { STATUSES, TYPES, PRIORITIES, LINK_TYPES, taskKey, workActivity, fmtMinutes, parseDuration, uid } from '../../lib/work';
import { uploadFile, useFileUrls } from '../../lib/files';
import { Drawer, Field, RowMenu, useToast, todayLocal, fmtDate } from '../ui/kit';
import { TypeGlyph, PriorityGlyph, StatusPill, Avatar, PeoplePicker, LabelsInput, QuickAdd, EmptyNote, samePerson, personKey, asPerson, isLate, shortDate, dateTime } from './ui';
import {
  Trash2, Eye, EyeOff, Plus, Paperclip, Send, Loader2, Play, Square, Link2, X, ListChecks, GitBranch, FileText, Copy, ChevronDown, ChevronUp,
} from 'lucide-react';

const TABS = [['details', 'Details'], ['comments', 'Comments'], ['time', 'Time'], ['history', 'History']];
const numOrNull = v => (v === '' ? null : +v);

// Rendered by Work.jsx with key={task.id}, so every local draft starts fresh per task.
export default function TaskDetail({ task, ctx, me, perms, onPatch, onCreate, onDelete, onOpen, onClose, timer, onTimer, logs, onLog, onRemoveLog, onComment, onRemoveComment, askConfirm }) {
  const toast = useToast();
  const [tab, setTab] = useState('details');
  const [more, setMore] = useState(false);
  const [titleDraft, setTitleDraft] = useState(null);   // null = not being edited, show the saved value
  const [descDraft, setDescDraft] = useState(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState(null);         // null = loading, { rows, failed }
  const [newCheck, setNewCheck] = useState('');
  const [linkDraft, setLinkDraft] = useState(null);
  const [timeDraft, setTimeDraft] = useState(() => ({ duration: '', date: todayLocal(), note: '' }));
  const [timeErr, setTimeErr] = useState('');
  const [logging, setLogging] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (tab !== 'history') return;
    let off = false;
    workActivity.forTask(task.id)
      .then(rows => { if (!off) setHistory({ rows }); })
      .catch(() => { if (!off) setHistory({ rows: [], failed: true }); });
    return () => { off = true; };
  }, [tab, task.id, task.updatedAt]);

  const can = perms.edit;
  const key = taskKey(task, ctx.projects);
  // Work.jsx rolls back and shows a toast when a save fails; resolves to undefined in that case
  const patch = p => onPatch(task, p).catch(() => undefined);
  const children = ctx.childrenOf(task.id);
  const childrenDone = children.filter(c => c.status === 'Done').length;
  const parent = task.parentId ? ctx.taskById(task.parentId) : null;
  const isEpic = task.type === 'Epic';
  const epics = ctx.tasks.filter(t => t.type === 'Epic' && t.id !== task.id && (!task.projectId || t.projectId === task.projectId));
  const parentChoices = task.type === 'Subtask' ? ctx.tasks.filter(t => t.id !== task.id && t.type !== 'Subtask' && t.projectId === task.projectId) : epics;
  const projSprints = ctx.sprints.filter(s => s.projectId === task.projectId && s.status !== 'completed');
  const watching = (task.watchers || []).some(w => samePerson(w, me));
  const assignedToMe = task.assignees.some(a => samePerson(a, me));
  const taskLogs = logs.filter(l => l.taskId === task.id);
  const logged = ctx.loggedBy.get(task.id) || 0;
  const timerOn = timer?.taskId === task.id;
  const checklist = task.checklist || [];
  const comments = task.comments || [];
  const attachments = task.attachments || [];
  const urlOf = useFileUrls(attachments);   // stored links expire; these are fresh ones
  const links = task.links || [];
  const late = isLate(task);
  const mentionQuery = (comment.match(/@([\w]*)$/) || [])[1];
  const mentionList = mentionQuery != null ? ctx.people.filter(p => p.name.toLowerCase().startsWith(mentionQuery.toLowerCase()) || p.name.toLowerCase().includes(' ' + mentionQuery.toLowerCase())).slice(0, 6) : [];

  function commitTitle() {
    const next = (titleDraft ?? '').trim();
    setTitleDraft(null);
    if (next && next !== task.title) patch({ title: next });
  }
  function commitDesc() {
    const next = descDraft;
    setDescDraft(null);
    if (next != null && next !== task.description) patch({ description: next });
  }

  async function addComment() {
    const text = comment.trim();
    if (!text || sending) return;
    setSending(true);
    const saved = await onComment(task, text);   // the server stamps author and time
    setSending(false);
    if (!saved) return;            // failed: keep what was typed
    setComment('');
  }

  async function upload(files) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added = [];
      for (const f of files) {
        if (f.size > 20 * 1024 * 1024) { toast.error(`${f.name} is over 20 MB and was skipped`); continue; }
        added.push(await uploadFile(f, { module: 'tasks', sourceId: task.id, type: 'task' }));
      }
      if (added.length && await patch({ attachments: [...attachments, ...added.map(a => ({ ...a, by: me.name, at: new Date().toISOString() }))] })) {
        toast.success(added.length === 1 ? 'File attached' : `${added.length} files attached`);
      }
    } catch (e) { toast.error('Could not upload the file', e); }
    setUploading(false);
  }

  async function logTime(e) {
    e.preventDefault();
    if (logging) return;
    const minutes = parseDuration(timeDraft.duration);
    if (!minutes) return setTimeErr('Enter time like 1h 30m, 1.5 or 45m');
    setTimeErr(''); setLogging(true);
    try {
      await onLog({ taskId: task.id, projectId: task.projectId, minutes, logDate: timeDraft.date, note: timeDraft.note });
      toast.success(`Logged ${fmtMinutes(minutes)}`);
      setTimeDraft({ duration: '', date: todayLocal(), note: '' });
    } catch (x) { toast.error('Could not log the time', x); }
    setLogging(false);
  }

  function addCheck() {
    const text = newCheck.trim();
    if (!text) return;
    setNewCheck('');
    patch({ checklist: [...checklist, { id: uid(), text, done: false }] }).then(saved => { if (!saved) setNewCheck(text); });
  }

  async function copyKey() {
    try { await navigator.clipboard.writeText(`${key} ${task.title}`); toast.success('Copied'); }
    catch (e) { toast.error('Could not copy to the clipboard', e); }
  }

  const addChild = title => onCreate(isEpic
    ? { title, type: 'Task', parentId: task.id, projectId: task.projectId, status: 'To Do' }
    : { title, type: 'Subtask', parentId: task.id, projectId: task.projectId, sprintId: task.sprintId, status: 'To Do' });

  const title = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <TypeGlyph type={task.type} />
      {parent && <><button className="wk-link" onClick={() => onOpen(parent)}>{taskKey(parent, ctx.projects)}</button><span className="faint">/</span></>}
      {key}
    </span>
  );
  const actions = (
    <>
      {perms.timesheet && (
        <button className={`mac-btn ${timerOn ? 'mac-btn-danger' : 'mac-btn-secondary'}`} onClick={() => onTimer(task)} title={timerOn ? 'Stop and log the time' : 'Start a timer on this task'}>
          {timerOn ? <><Square size={13} /> Stop</> : <><Play size={13} /> Timer</>}
        </button>
      )}
      <RowMenu label="Task actions" items={[
        { label: 'Copy key and title', icon: Copy, onClick: copyKey },
        { label: watching ? 'Stop watching' : 'Watch this task', icon: watching ? EyeOff : Eye, onClick: () => patch({ watchers: watching ? task.watchers.filter(w => !samePerson(w, me)) : [...(task.watchers || []), asPerson(me)] }) },
        perms.delete && { label: 'Delete', icon: Trash2, danger: true, onClick: () => onDelete(task) },
      ]} />
    </>
  );

  return (
    <Drawer isOpen onClose={onClose} title={title} subtitle={ctx.projectName(task.projectId) || 'No project'} actions={actions} width={760}>
      {can ? (
        <textarea value={titleDraft ?? task.title} rows={Math.max(1, Math.min(4, Math.ceil((titleDraft ?? task.title).length / 44)))} className="wk-title" aria-label="Title"
          onChange={e => setTitleDraft(e.target.value)} onBlur={() => titleDraft != null && commitTitle()}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur(); }
            if (e.key === 'Escape' && titleDraft != null) { e.stopPropagation(); setTitleDraft(null); }
          }} />
      ) : <h3 className="wk-title">{task.title}</h3>}

      {/* ── properties ── */}
      <div className="wk-props">
        <Prop label="Status">{can
          ? <select className="mac-select" aria-label="Status" value={task.status} onChange={e => patch({ status: e.target.value })}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
          : <StatusPill status={task.status} />}</Prop>
        <Prop label="Priority">{can
          ? <select className="mac-select" aria-label="Priority" value={task.priority} onChange={e => patch({ priority: e.target.value })}>{PRIORITIES.map(s => <option key={s}>{s}</option>)}</select>
          : <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><PriorityGlyph priority={task.priority} />{task.priority}</span>}</Prop>
        <Prop label="Assignee" wide>{can
          ? <>
              <PeoplePicker value={task.assignees} people={ctx.people} onChange={v => patch({ assignees: v })} placeholder="Unassigned" label="Assignees" />
              {!assignedToMe && <button className="wk-link" style={{ fontSize: 12.5, marginTop: 4 }} onClick={() => patch({ assignees: [...task.assignees, asPerson(me)] })}>Assign to me</button>}
            </>
          : (task.assignees.map(a => a.name).join(', ') || 'Unassigned')}</Prop>
        <Prop label="Due">{can
          ? <input type="date" className="mac-input" aria-label="Due date" value={task.dueDate || ''} onChange={e => patch({ dueDate: e.target.value })} style={late ? { color: 'var(--bad)' } : undefined} />
          : <span className={late ? 'wk-late' : ''}>{task.dueDate ? fmtDate(task.dueDate) : '—'}</span>}</Prop>
        <Prop label="Estimate">{can
          ? <input type="number" min="0" step="0.5" className="mac-input" aria-label="Estimate in hours" placeholder="Hours" defaultValue={task.estimateHours ?? ''} key={`eh${task.estimateHours}`}
              onBlur={e => { const v = numOrNull(e.target.value); if (v !== (task.estimateHours ?? null)) patch({ estimateHours: v }); }} />
          : (task.estimateHours != null ? `${task.estimateHours}h` : '—')}</Prop>
        <Prop label="Project">{can && perms.manageAll
          ? <select className="mac-select" aria-label="Project" value={task.projectId || ''} onChange={e => { const p = ctx.projects.find(x => x.id === e.target.value); patch({ projectId: e.target.value || null, projectName: p?.projectName || '', sprintId: null, parentId: null }); }}><option value="">No project</option>{ctx.projects.map(p => <option key={p.id} value={p.id}>{p.key ? `${p.key} · ` : ''}{p.projectName}</option>)}</select>
          : (ctx.projectName(task.projectId) || '—')}</Prop>
        {task.projectId && <Prop label="Sprint">{can
          ? <select className="mac-select" aria-label="Sprint" value={task.sprintId || ''} onChange={e => patch({ sprintId: e.target.value || null })}><option value="">Backlog</option>{projSprints.map(s => <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' (active)' : ''}</option>)}{task.sprintId && !projSprints.some(s => s.id === task.sprintId) && <option value={task.sprintId}>{ctx.sprintName(task.sprintId)}</option>}</select>
          : (ctx.sprintName(task.sprintId) || 'Backlog')}</Prop>}

        {more && <>
          <Prop label="Type">{can
            ? <select className="mac-select" aria-label="Type" value={task.type} onChange={e => patch({ type: e.target.value })}>{TYPES.map(s => <option key={s}>{s}</option>)}</select>
            : task.type}</Prop>
          {!isEpic && <Prop label={task.type === 'Subtask' ? 'Parent' : 'Epic'}>{can
            ? <select className="mac-select" aria-label={task.type === 'Subtask' ? 'Parent task' : 'Epic'} value={task.parentId || ''} onChange={e => patch({ parentId: e.target.value || null })}><option value="">None</option>{parentChoices.map(t => <option key={t.id} value={t.id}>{taskKey(t, ctx.projects)} {t.title}</option>)}</select>
            : (parent?.title || '—')}</Prop>}
          <Prop label="Start">{can
            ? <input type="date" className="mac-input" aria-label="Start date" value={task.startDate || ''} onChange={e => patch({ startDate: e.target.value })} />
            : (task.startDate ? fmtDate(task.startDate) : '—')}</Prop>
          <Prop label="Points">{can
            ? <input type="number" min="0" step="0.5" className="mac-input" aria-label="Story points" defaultValue={task.storyPoints ?? ''} key={`sp${task.storyPoints}`}
                onBlur={e => { const v = numOrNull(e.target.value); if (v !== (task.storyPoints ?? null)) patch({ storyPoints: v }); }} />
            : (task.storyPoints ?? '—')}</Prop>
          <Prop label="Labels" wide>{can ? <LabelsInput value={task.labels} onChange={v => patch({ labels: v })} suggestions={ctx.allLabels} /> : (task.labels.join(', ') || '—')}</Prop>
          <Prop label="Reporter">{task.reporter || '—'}</Prop>
          <Prop label="Watchers">{task.watchers?.length ? task.watchers.map(w => w.name).join(', ') : '—'}</Prop>
          <Prop label="Created">{dateTime(task.createdAt)}</Prop>
          <Prop label="Updated">{dateTime(task.updatedAt)}</Prop>
        </>}
        <button className="wk-link wk-props-more" onClick={() => setMore(m => !m)} aria-expanded={more}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, minHeight: 32 }}>{more ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{more ? 'Fewer details' : 'More details — type, epic, start, points, labels'}</span>
        </button>
      </div>

      {/* ── tabs ── */}
      <div className="tab-bar wk-tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab-item ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {l}{k === 'comments' && comments.length ? ` ${comments.length}` : ''}{k === 'time' && logged ? ` ${fmtMinutes(logged)}` : ''}
          </button>
        ))}
      </div>

      {tab === 'details' && <>
        <section className="wk-sec">
          <div className="wk-h"><FileText size={14} /> Description</div>
          {can
            ? <textarea className="mac-input" rows={5} aria-label="Description" value={descDraft ?? task.description} onChange={e => setDescDraft(e.target.value)} onBlur={commitDesc} placeholder="Add details, acceptance criteria, links…" style={{ lineHeight: 1.5 }}
                onKeyDown={e => { if (e.key === 'Escape' && descDraft != null) { e.stopPropagation(); e.currentTarget.blur(); } }} />
            : <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }} className={task.description ? '' : 'faint'}>{task.description || 'No description'}</div>}
        </section>

        {(children.length > 0 || isEpic || (perms.create && task.type !== 'Subtask')) && (
          <section className="wk-sec">
            <div className="wk-h"><GitBranch size={14} /> {isEpic ? 'Tasks in this epic' : 'Subtasks'} {children.length > 0 && <span className="n">{childrenDone}/{children.length} done</span>}</div>
            {children.length > 0 && <div className="wk-progress"><div style={{ width: `${(childrenDone / children.length) * 100}%` }} /></div>}
            <div>
              {children.map(c => (
                <div key={c.id} className="wk-row" onClick={() => onOpen(c)}>
                  {can && <input type="checkbox" checked={c.status === 'Done'} onClick={e => e.stopPropagation()} onChange={() => onPatch(c, { status: c.status === 'Done' ? 'To Do' : 'Done' }).catch(() => {})} aria-label={`Mark “${c.title}” done`} />}
                  <TypeGlyph type={c.type} size={14} /><span className="wk-key wk-hide-sm">{taskKey(c, ctx.projects)}</span>
                  <button type="button" className={`wk-row-title ${c.status === 'Done' ? 'done' : ''}`}>{c.title}</button>
                  <StatusPill status={c.status} />
                  {c.assignees[0] && <Avatar p={c.assignees[0]} size={20} ring={false} />}
                </div>
              ))}
            </div>
            {perms.create && task.type !== 'Subtask' && <QuickAdd onAdd={addChild} placeholder={isEpic ? 'Add a task to this epic…' : 'Add a subtask…'} />}
            {isEpic && children.length === 0 && !perms.create && <div className="wk-hint">Set a task’s Epic field to this epic to group it here.</div>}
          </section>
        )}

        <section className="wk-sec">
          <div className="wk-h"><ListChecks size={14} /> Checklist {checklist.length > 0 && <span className="n">{checklist.filter(c => c.done).length}/{checklist.length}</span>}</div>
          {checklist.length > 0 && (
            <div>
              {checklist.map(c => (
                <div key={c.id} className="wk-checkitem">
                  <label>
                    <input type="checkbox" checked={!!c.done} disabled={!can} onChange={() => patch({ checklist: checklist.map(x => (x.id === c.id ? { ...x, done: !x.done } : x)) })} />
                    <span className={c.done ? 'done' : ''}>{c.text}</span>
                  </label>
                  {can && <button className="wk-x" aria-label={`Remove “${c.text}”`} onClick={() => patch({ checklist: checklist.filter(x => x.id !== c.id) })}><X size={14} /></button>}
                </div>
              ))}
            </div>
          )}
          {can && (
            <div className="wk-quickadd">
              <Plus size={14} aria-hidden="true" />
              <input value={newCheck} onChange={e => setNewCheck(e.target.value)} placeholder="Add a checklist item…" aria-label="Add a checklist item" enterKeyHint="done"
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addCheck(); } }} />
            </div>
          )}
          {!can && checklist.length === 0 && <div className="wk-hint">No checklist</div>}
        </section>

        {(can || attachments.length > 0) && (
          <section className="wk-sec">
            <div className="wk-h"><Paperclip size={14} /> Attachments {attachments.length > 0 && <span className="n">{attachments.length}</span>}
              {can && <button className="mac-btn mac-btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <><Loader2 size={13} className="spin" /> Uploading…</> : <><Plus size={13} /> Attach</>}</button>}
            </div>
            <input ref={fileRef} type="file" multiple hidden onChange={e => { upload([...e.target.files]); e.target.value = ''; }} />
            {attachments.length > 0 && (
              <div className="wk-atts">
                {attachments.map((a, i) => (
                  <div key={i} className="wk-att">
                    <a href={urlOf(a)} target="_blank" rel="noreferrer">
                      {a.type?.startsWith('image/') ? <img src={urlOf(a)} alt={a.name} /> : <div className="wk-att-file"><FileText size={22} /></div>}
                      <div className="wk-att-name">{a.name}</div>
                    </a>
                    {can && <button className="wk-att-x" aria-label={`Remove ${a.name}`} onClick={() => askConfirm({ title: 'Remove attachment', message: `Remove ${a.name} from this task?`, confirmLabel: 'Remove', run: () => patch({ attachments: attachments.filter((_, j) => j !== i) }) })}><X size={13} /></button>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {(can || links.length > 0) && (
          <section className="wk-sec">
            <div className="wk-h"><Link2 size={14} /> Linked tasks {links.length > 0 && <span className="n">{links.length}</span>}
              {can && !linkDraft && <button className="mac-btn mac-btn-secondary" onClick={() => setLinkDraft({ type: 'blocks', taskId: '' })}><Plus size={13} /> Link</button>}
            </div>
            {links.length > 0 && (
              <div>
                {links.map((l, i) => {
                  const o = ctx.taskById(l.taskId);
                  return (
                    <div key={i} className="wk-row" onClick={() => o && onOpen(o)}>
                      <span className="wk-hint" style={{ minWidth: 84 }}>{LINK_TYPES[l.type]}</span>
                      {o
                        ? <><TypeGlyph type={o.type} size={14} /><span className="wk-key wk-hide-sm">{taskKey(o, ctx.projects)}</span><button type="button" className="wk-row-title">{o.title}</button><StatusPill status={o.status} /></>
                        : <span className="wk-row-title faint">A task you cannot see</span>}
                      {can && <button className="wk-x" aria-label="Remove link" onClick={e => { e.stopPropagation(); patch({ links: links.filter((_, j) => j !== i) }); }}><X size={14} /></button>}
                    </div>
                  );
                })}
              </div>
            )}
            {linkDraft && (
              <div className="wk-linkform">
                <select className="mac-select" aria-label="Link type" value={linkDraft.type} onChange={e => setLinkDraft({ ...linkDraft, type: e.target.value })}>{Object.entries(LINK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <select className="mac-select" aria-label="Task to link" value={linkDraft.taskId} onChange={e => setLinkDraft({ ...linkDraft, taskId: e.target.value })} style={{ flexGrow: 3 }}><option value="">Choose a task…</option>{ctx.tasks.filter(t => t.id !== task.id).map(t => <option key={t.id} value={t.id}>{taskKey(t, ctx.projects)} {t.title}</option>)}</select>
                <button className="mac-btn mac-btn-primary" disabled={!linkDraft.taskId} onClick={() => { patch({ links: [...links, linkDraft] }); setLinkDraft(null); }}>Link</button>
                <button className="mac-btn mac-btn-secondary" onClick={() => setLinkDraft(null)}>Cancel</button>
              </div>
            )}
          </section>
        )}
      </>}

      {tab === 'comments' && (
        <section className="wk-sec" style={{ gap: 14 }}>
          <div className="wk-comment-box">
            <textarea className="mac-input" rows={3} value={comment} onChange={e => setComment(e.target.value)} aria-label="Write a comment" placeholder="Write a comment… type @ to mention someone"
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); addComment(); } }} />
            {mentionList.length > 0 && (
              <div className="wk-pop">
                {mentionList.map(p => <button key={personKey(p)} onClick={() => setComment(comment.replace(/@[\w]*$/, `@${p.name} `))} className="wk-pop-item"><Avatar p={p} size={20} ring={false} />{p.name}</button>)}
              </div>
            )}
            <div className="wk-comment-actions">
              <span className="wk-hint">Enter adds a new line · Ctrl/⌘ + Enter sends</span>
              <button onClick={addComment} disabled={!comment.trim() || sending} className="mac-btn mac-btn-primary"><Send size={13} /> {sending ? 'Sending…' : 'Send'}</button>
            </div>
          </div>
          {[...comments].reverse().map(c => (
            <div key={c.id} className="wk-comment">
              <Avatar p={{ name: c.author, kind: c.authorKind, id: c.authorId ?? c.author }} size={30} ring={false} />
              <div className="wk-comment-body">
                <div><strong>{c.author}</strong> <span className="faint" style={{ fontSize: 12 }}>{dateTime(c.at)}</span></div>
                <div className="wk-comment-text">{renderMentions(c.text)}</div>
              </div>
              {(perms.manageAll || samePerson({ kind: c.authorKind, id: c.authorId }, me)) && <button className="wk-x" aria-label="Delete comment" onClick={() => askConfirm({ title: 'Delete comment', message: 'Delete this comment? This cannot be undone.', run: () => onRemoveComment(task, c.id) })}><Trash2 size={14} /></button>}
            </div>
          ))}
          {!comments.length && <EmptyNote>No comments yet</EmptyNote>}
        </section>
      )}

      {tab === 'time' && (
        <section className="wk-sec" style={{ gap: 14 }}>
          <div style={{ fontSize: 13.5 }}>
            <strong>{fmtMinutes(logged)}</strong> logged{task.estimateHours ? <> of <strong>{task.estimateHours}h</strong> estimated</> : null}
            {task.estimateHours > 0 && <div className="wk-progress" style={{ marginTop: 8 }}><div className={logged / 60 > task.estimateHours ? 'over' : ''} style={{ width: `${Math.min(100, (logged / 60 / task.estimateHours) * 100)}%` }} /></div>}
          </div>
          {perms.timesheet && (
            <form className="wk-logform" onSubmit={logTime}>
              <Field label="Time" required error={timeErr}><input className="mac-input" placeholder="1h 30m" value={timeDraft.duration} onChange={e => setTimeDraft({ ...timeDraft, duration: e.target.value })} /></Field>
              <Field label="Date"><input type="date" className="mac-input" value={timeDraft.date} max={todayLocal()} onChange={e => setTimeDraft({ ...timeDraft, date: e.target.value })} /></Field>
              <Field label="Note"><input className="mac-input" placeholder="Optional" value={timeDraft.note} onChange={e => setTimeDraft({ ...timeDraft, note: e.target.value })} /></Field>
              <button type="submit" disabled={logging} className="mac-btn mac-btn-primary" style={{ marginTop: 25 }}><Plus size={13} /> {logging ? 'Saving…' : 'Log time'}</button>
            </form>
          )}
          <div>
            {taskLogs.map(l => (
              <div key={l.id} className="wk-entry">
                <span className="when">{shortDate(l.logDate)}</span><strong style={{ minWidth: 56 }}>{fmtMinutes(l.minutes)}</strong>
                <span className="what">{l.personName}{l.note ? <span className="muted"> — {l.note}</span> : null}</span>
                {(perms.manageAll || samePerson({ kind: l.personKind, id: l.personId }, me)) && <button className="wk-x" aria-label="Delete time entry" onClick={() => askConfirm({ title: 'Delete time entry', message: `Delete the ${fmtMinutes(l.minutes)} entry from ${shortDate(l.logDate)}? This cannot be undone.`, run: () => onRemoveLog(l.id) })}><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
          {!taskLogs.length && <EmptyNote>{perms.manageAll ? 'No time logged on this task yet' : 'No time logged here yet. You only see your own entries.'}</EmptyNote>}
        </section>
      )}

      {tab === 'history' && (history == null ? <EmptyNote>Loading history…</EmptyNote>
        : history.failed ? <EmptyNote>Could not load the history. Switch tabs to try again.</EmptyNote>
        : history.rows.length === 0 ? <EmptyNote>No history yet</EmptyNote> : (
          <section className="wk-sec">
            {history.rows.map(h => (
              <div key={h.id} className="wk-hist">
                <time>{dateTime(h.at)}</time>
                <span><strong>{h.actor}</strong> {h.action === 'created' ? 'created this task' : h.action === 'commented' ? 'commented' : <>changed <strong>{h.field}</strong> {h.from ? <>from <em>{h.from}</em> </> : null}to <em>{h.to || 'none'}</em></>}</span>
              </div>
            ))}
          </section>
        ))}
    </Drawer>
  );
}

// Top-level (not inside TaskDetail) so its children keep state across renders
function Prop({ label, wide, children }) {
  return (
    <div className={`wk-prop ${wide ? 'wide' : ''}`}>
      <span>{label}</span><div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function renderMentions(text) {
  return text.split(/(@[A-Z][\w]*(?: [A-Z][\w]*)?)/g).map((part, i) => (part.startsWith('@') ? <span key={i} className="wk-mention">{part}</span> : part));
}
