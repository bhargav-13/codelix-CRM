import { useState, useEffect, useRef } from 'react';
import Modal from '../ui/Modal';
import { STATUSES, TYPES, PRIORITIES, LINK_TYPES, taskKey, workActivity, fmtMinutes, parseDuration, todayISO, uid, isOverdue } from '../../lib/work';
import { uploadProjectFile } from '../../lib/db';
import { TypeGlyph, PriorityGlyph, StatusPill, Avatar, PeoplePicker, LabelsInput, FF, EmptyNote, samePerson } from './ui';
import {
  Trash2, Eye, EyeOff, Plus, Paperclip, Send, Loader2, Play, Square, Link2, X, ListChecks, GitBranch, Clock, History, MessageSquare, FileText, Copy,
} from 'lucide-react';

export default function TaskDetail({ task, ctx, me, perms, onPatch, onCreate, onDelete, onOpen, onClose, timer, onTimer, logs, onLog, onRemoveLog, onMention }) {
  const [tab, setTab] = useState('comments');
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description);
  const [comment, setComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState(null);
  const [newCheck, setNewCheck] = useState('');
  const [linkDraft, setLinkDraft] = useState(null);
  const [timeDraft, setTimeDraft] = useState({ duration: '', date: todayISO(), note: '' });
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { setTitle(task.title); setDesc(task.description); }, [task.id, task.title, task.description]);
  useEffect(() => {
    if (tab !== 'history') return;
    let off = false;
    setHistory(null);
    workActivity.forTask(task.id).then(h => !off && setHistory(h)).catch(() => !off && setHistory([]));
    return () => { off = true; };
  }, [tab, task.id, task.updatedAt]);

  const can = perms.edit;
  const patch = p => onPatch(task, p).catch(e => setErr(e.message));
  const children = ctx.childrenOf(task.id);
  const parent = task.parentId ? ctx.taskById(task.parentId) : null;
  const epics = ctx.tasks.filter(t => t.type === 'Epic' && t.id !== task.id && (!task.projectId || t.projectId === task.projectId));
  const projSprints = ctx.sprints.filter(s => s.projectId === task.projectId && s.status !== 'completed');
  const watching = (task.watchers || []).some(w => samePerson(w, me));
  const taskLogs = logs.filter(l => l.taskId === task.id);
  const logged = taskLogs.reduce((a, l) => a + l.minutes, 0);
  const timerOn = timer?.taskId === task.id;
  const mentionQuery = (comment.match(/@([\w]*)$/) || [])[1];
  const mentionList = mentionQuery != null ? ctx.people.filter(p => p.name.toLowerCase().startsWith(mentionQuery.toLowerCase()) || p.name.toLowerCase().includes(' ' + mentionQuery.toLowerCase())).slice(0, 6) : [];

  async function addComment() {
    const text = comment.trim();
    if (!text) return;
    const c = { id: uid(), author: me.name, authorKind: me.kind, authorId: me.id, text, at: new Date().toISOString() };
    setComment('');
    await patch({ comments: [...(task.comments || []), c] });
    onMention?.(task, text);
  }

  async function upload(files) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added = [];
      for (const f of files) { if (f.size > 20 * 1024 * 1024) { setErr(`${f.name} is over 20 MB`); continue; } added.push(await uploadProjectFile(f)); }
      if (added.length) await patch({ attachments: [...(task.attachments || []), ...added.map(a => ({ ...a, by: me.name, at: new Date().toISOString() }))] });
    } catch (e) { setErr(e.message); }
    setUploading(false);
  }

  async function logTime() {
    const minutes = parseDuration(timeDraft.duration);
    if (!minutes) return setErr('Enter time like 1h 30m, 1.5 or 45m');
    try { await onLog({ taskId: task.id, projectId: task.projectId, minutes, logDate: timeDraft.date, note: timeDraft.note }); setTimeDraft({ duration: '', date: todayISO(), note: '' }); setErr(''); }
    catch (e) { setErr(e.message); }
  }

  const sel = { width: '100%', fontSize: 12.5, padding: '5px 8px' };

  return (
    <Modal isOpen onClose={onClose} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><TypeGlyph type={task.type} />{parent && <><button className="wk-link" onClick={() => onOpen(parent)}>{taskKey(parent, ctx.projects)}</button><span style={{ color: '#C7C7CC' }}>/</span></>}{taskKey(task, ctx.projects)}</span>} size="full">
      <div className="wk-detail">
        {/* ── main ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {can ? (
            <textarea value={title} onChange={e => setTitle(e.target.value)} rows={1} className="wk-title"
              onBlur={() => title.trim() && title !== task.title && patch({ title: title.trim() })}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} aria-label="Title" />
          ) : <h2 style={{ fontSize: 20, fontWeight: 680, margin: 0 }}>{task.title}</h2>}
          {err && <div style={{ fontSize: 12, color: '#D70015' }}>{err} <button className="wk-link" onClick={() => setErr('')}>dismiss</button></div>}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {perms.create && task.type !== 'Subtask' && <button className="mac-btn mac-btn-secondary" style={{ fontSize: 12 }} onClick={() => onCreate({ title: 'New subtask', type: 'Subtask', parentId: task.id, projectId: task.projectId, sprintId: task.sprintId, status: 'To Do' }).then(onOpen)}><GitBranch size={12} /> Add subtask</button>}
            {can && <button className="mac-btn mac-btn-secondary" style={{ fontSize: 12 }} onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 size={12} className="spin" /> : <Paperclip size={12} />} Attach</button>}
            {can && <button className="mac-btn mac-btn-secondary" style={{ fontSize: 12 }} onClick={() => setLinkDraft({ type: 'blocks', taskId: '' })}><Link2 size={12} /> Link issue</button>}
            <button className="mac-btn mac-btn-secondary" style={{ fontSize: 12 }} onClick={() => patch({ watchers: watching ? task.watchers.filter(w => !samePerson(w, me)) : [...(task.watchers || []), { id: me.id, name: me.name, kind: me.kind }] })}>{watching ? <EyeOff size={12} /> : <Eye size={12} />} {watching ? 'Unwatch' : 'Watch'}</button>
            <button className="mac-btn mac-btn-secondary" style={{ fontSize: 12 }} onClick={() => navigator.clipboard?.writeText(`${taskKey(task, ctx.projects)} ${task.title}`)}><Copy size={12} /> Copy key</button>
            {perms.timesheet && <button className={`mac-btn ${timerOn ? 'mac-btn-danger' : 'mac-btn-secondary'}`} style={{ fontSize: 12 }} onClick={() => onTimer(task)}>{timerOn ? <><Square size={12} /> Stop timer</> : <><Play size={12} /> Start timer</>}</button>}
            <input ref={fileRef} type="file" multiple hidden onChange={e => { upload([...e.target.files]); e.target.value = ''; }} />
          </div>

          <section>
            <div className="wk-h"><FileText size={13} /> Description</div>
            {can ? <textarea className="mac-input" rows={5} value={desc} onChange={e => setDesc(e.target.value)} onBlur={() => desc !== task.description && patch({ description: desc })} placeholder="Add details, acceptance criteria, links…" style={{ fontSize: 13, lineHeight: 1.5 }} />
              : <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: task.description ? '#1D1D1F' : '#AEAEB2' }}>{task.description || 'No description'}</div>}
          </section>

          {(children.length > 0 || task.type === 'Epic') && (
            <section>
              <div className="wk-h"><GitBranch size={13} /> {task.type === 'Epic' ? 'Issues in this epic' : 'Subtasks'} <span style={{ color: '#AEAEB2', fontWeight: 400 }}>{children.filter(c => c.status === 'Done').length}/{children.length} done</span></div>
              {children.length > 0 && <div className="wk-progress"><div style={{ width: `${(children.filter(c => c.status === 'Done').length / children.length) * 100}%` }} /></div>}
              {children.map(c => (
                <div key={c.id} className="wk-row" onClick={() => onOpen(c)}>
                  {can && <input type="checkbox" checked={c.status === 'Done'} onClick={e => e.stopPropagation()} onChange={() => onPatch(c, { status: c.status === 'Done' ? 'To Do' : 'Done' })} aria-label="Done" />}
                  <TypeGlyph type={c.type} size={14} /><span style={{ fontSize: 11.5, color: '#8E8E93', minWidth: 54 }}>{taskKey(c, ctx.projects)}</span>
                  <span style={{ flex: 1, fontSize: 13, textDecoration: c.status === 'Done' ? 'line-through' : 'none' }}>{c.title}</span>
                  <StatusPill status={c.status} small /><Avatar p={c.assignees[0] || { name: '?' }} size={18} ring={false} />
                </div>
              ))}
              {children.length === 0 && <div style={{ fontSize: 12, color: '#AEAEB2' }}>Set an issue's Epic field to this epic to group it here.</div>}
            </section>
          )}

          <section>
            <div className="wk-h"><ListChecks size={13} /> Checklist {task.checklist?.length > 0 && <span style={{ color: '#AEAEB2', fontWeight: 400 }}>{task.checklist.filter(c => c.done).length}/{task.checklist.length}</span>}</div>
            {(task.checklist || []).map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                <input type="checkbox" checked={c.done} disabled={!can} onChange={() => patch({ checklist: task.checklist.map(x => x.id === c.id ? { ...x, done: !x.done } : x) })} />
                <span style={{ flex: 1, textDecoration: c.done ? 'line-through' : 'none', color: c.done ? '#8E8E93' : '#1D1D1F' }}>{c.text}</span>
                {can && <X size={12} color="#AEAEB2" style={{ cursor: 'pointer' }} onClick={e => { e.preventDefault(); patch({ checklist: task.checklist.filter(x => x.id !== c.id) }); }} />}
              </label>
            ))}
            {can && <input className="mac-input" value={newCheck} onChange={e => setNewCheck(e.target.value)} placeholder="Add an item and press Enter" style={{ fontSize: 12.5, marginTop: 4 }}
              onKeyDown={e => { if (e.key === 'Enter' && newCheck.trim()) { patch({ checklist: [...(task.checklist || []), { id: uid(), text: newCheck.trim(), done: false }] }); setNewCheck(''); } }} />}
          </section>

          {(task.links?.length > 0 || linkDraft) && (
            <section>
              <div className="wk-h"><Link2 size={13} /> Linked issues</div>
              {(task.links || []).map((l, i) => { const o = ctx.taskById(l.taskId); return (
                <div key={i} className="wk-row" onClick={() => o && onOpen(o)}>
                  <span style={{ fontSize: 11.5, color: '#8E8E93', minWidth: 90 }}>{LINK_TYPES[l.type]}</span>
                  {o ? <><TypeGlyph type={o.type} size={14} /><span style={{ fontSize: 11.5, color: '#8E8E93' }}>{taskKey(o, ctx.projects)}</span><span style={{ flex: 1, fontSize: 13 }}>{o.title}</span><StatusPill status={o.status} small /></> : <span style={{ flex: 1, color: '#AEAEB2', fontSize: 12.5 }}>Issue not visible to you</span>}
                  {can && <X size={12} color="#AEAEB2" onClick={e => { e.stopPropagation(); patch({ links: task.links.filter((_, j) => j !== i) }); }} />}
                </div>
              ); })}
              {linkDraft && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <select className="mac-select" value={linkDraft.type} onChange={e => setLinkDraft({ ...linkDraft, type: e.target.value })} style={{ width: 'auto', fontSize: 12.5 }}>{Object.entries(LINK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <select className="mac-select" value={linkDraft.taskId} onChange={e => setLinkDraft({ ...linkDraft, taskId: e.target.value })} style={{ flex: 1, minWidth: 200, fontSize: 12.5 }}><option value="">Choose issue…</option>{ctx.tasks.filter(t => t.id !== task.id).map(t => <option key={t.id} value={t.id}>{taskKey(t, ctx.projects)} {t.title}</option>)}</select>
                  <button className="mac-btn mac-btn-primary" style={{ fontSize: 12 }} disabled={!linkDraft.taskId} onClick={() => { patch({ links: [...(task.links || []), linkDraft] }); setLinkDraft(null); }}>Link</button>
                  <button className="mac-btn mac-btn-ghost" style={{ fontSize: 12 }} onClick={() => setLinkDraft(null)}>Cancel</button>
                </div>
              )}
            </section>
          )}

          {task.attachments?.length > 0 && (
            <section>
              <div className="wk-h"><Paperclip size={13} /> Attachments</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                {task.attachments.map((a, i) => (
                  <div key={i} className="wk-att">
                    <a href={a.url} target="_blank" rel="noreferrer" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                      {a.type?.startsWith('image/') ? <img src={a.url} alt={a.name} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.03)', borderRadius: 6 }}><FileText size={22} color="#8E8E93" /></div>}
                      <div style={{ fontSize: 11.5, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                    </a>
                    {can && <button className="wk-att-x" aria-label="Remove attachment" onClick={() => window.confirm(`Remove ${a.name}?`) && patch({ attachments: task.attachments.filter((_, j) => j !== i) })}><X size={11} /></button>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="tab-bar" style={{ display: 'inline-flex', marginBottom: 10 }}>
              <button className={`tab-item ${tab === 'comments' ? 'active' : ''}`} onClick={() => setTab('comments')} style={{ fontSize: 12 }}><MessageSquare size={11} /> Comments {task.comments?.length ? `(${task.comments.length})` : ''}</button>
              <button className={`tab-item ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')} style={{ fontSize: 12 }}><History size={11} /> History</button>
              <button className={`tab-item ${tab === 'time' ? 'active' : ''}`} onClick={() => setTab('time')} style={{ fontSize: 12 }}><Clock size={11} /> Time {logged ? `(${fmtMinutes(logged)})` : ''}</button>
            </div>

            {tab === 'comments' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Avatar p={me} size={28} ring={false} />
                    <textarea className="mac-input" rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment… type @ to mention someone" style={{ fontSize: 13 }}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment(); }} />
                    <button onClick={addComment} disabled={!comment.trim()} className="mac-btn mac-btn-primary" style={{ alignSelf: 'flex-end' }} aria-label="Send comment"><Send size={13} /></button>
                  </div>
                  {mentionList.length > 0 && (
                    <div className="wk-pop" style={{ left: 36, top: '100%' }}>
                      {mentionList.map(p => <button key={`${p.kind}:${p.id}`} onClick={() => setComment(comment.replace(/@[\w]*$/, `@${p.name} `))} className="wk-pop-item"><Avatar p={p} size={18} ring={false} />{p.name}</button>)}
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: '#AEAEB2', marginTop: 4, marginLeft: 36 }}>Ctrl + Enter to send · mentioned people get a notification</div>
                </div>
                {[...(task.comments || [])].reverse().map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: 8 }}>
                    <Avatar p={{ name: c.author, kind: c.authorKind, id: c.authorId ?? c.author }} size={28} ring={false} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12 }}><strong>{c.author}</strong> <span style={{ color: '#AEAEB2' }}>{new Date(c.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 2 }}>{renderMentions(c.text)}</div>
                    </div>
                    {(perms.manageAll || c.author === me.name) && <button className="mac-btn mac-btn-ghost" style={{ padding: 4, alignSelf: 'flex-start' }} aria-label="Delete comment" onClick={() => window.confirm('Delete this comment?') && patch({ comments: task.comments.filter(x => x.id !== c.id) })}><Trash2 size={12} color="#AEAEB2" /></button>}
                  </div>
                ))}
                {!task.comments?.length && <div style={{ fontSize: 12.5, color: '#AEAEB2' }}>No comments yet</div>}
              </div>
            )}

            {tab === 'history' && (history == null ? <EmptyNote>Loading…</EmptyNote> : history.length === 0 ? <EmptyNote>No history yet</EmptyNote> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.map(h => (
                  <div key={h.id} style={{ fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ color: '#AEAEB2', minWidth: 120, fontSize: 11.5 }}>{new Date(h.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span><strong>{h.actor}</strong> {h.action === 'created' ? 'created this issue' : h.action === 'commented' ? 'commented' : <>changed <strong>{h.field}</strong> {h.from ? <>from <em>{h.from}</em> </> : null}to <em>{h.to || 'none'}</em></>}</span>
                  </div>
                ))}
              </div>
            ))}

            {tab === 'time' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12.5 }}>
                  <strong>{fmtMinutes(logged)}</strong> logged{task.estimateHours ? <> of <strong>{task.estimateHours}h</strong> estimated</> : null}
                  {task.estimateHours > 0 && <div className="wk-progress" style={{ marginTop: 6 }}><div style={{ width: `${Math.min(100, (logged / 60 / task.estimateHours) * 100)}%`, background: logged / 60 > task.estimateHours ? '#FF3B30' : undefined }} /></div>}
                </div>
                {perms.timesheet && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <input className="mac-input" placeholder="1h 30m" value={timeDraft.duration} onChange={e => setTimeDraft({ ...timeDraft, duration: e.target.value })} style={{ width: 100, fontSize: 12.5 }} onKeyDown={e => e.key === 'Enter' && logTime()} />
                    <input type="date" className="mac-input" value={timeDraft.date} max={todayISO()} onChange={e => setTimeDraft({ ...timeDraft, date: e.target.value })} style={{ width: 150, fontSize: 12.5 }} />
                    <input className="mac-input" placeholder="Note (optional)" value={timeDraft.note} onChange={e => setTimeDraft({ ...timeDraft, note: e.target.value })} style={{ flex: 1, minWidth: 140, fontSize: 12.5 }} onKeyDown={e => e.key === 'Enter' && logTime()} />
                    <button onClick={logTime} className="mac-btn mac-btn-primary" style={{ fontSize: 12 }}><Plus size={12} /> Log time</button>
                  </div>
                )}
                {taskLogs.map(l => (
                  <div key={l.id} style={{ display: 'flex', gap: 8, fontSize: 12.5, alignItems: 'center' }}>
                    <span style={{ color: '#AEAEB2', minWidth: 80 }}>{l.logDate}</span><strong style={{ minWidth: 56 }}>{fmtMinutes(l.minutes)}</strong>
                    <span style={{ flex: 1 }}>{l.personName}{l.note ? <span style={{ color: '#8E8E93' }}> — {l.note}</span> : null}</span>
                    {(perms.manageAll || samePerson({ kind: l.personKind, id: l.personId }, me)) && <button className="mac-btn mac-btn-ghost" style={{ padding: 4 }} aria-label="Delete time entry" onClick={() => onRemoveLog(l.id)}><Trash2 size={12} color="#AEAEB2" /></button>}
                  </div>
                ))}
                {!taskLogs.length && <div style={{ fontSize: 12.5, color: '#AEAEB2' }}>No time logged on this issue (you only see your own entries unless you are a partner)</div>}
              </div>
            )}
          </section>
        </div>

        {/* ── side panel ── */}
        <div className="wk-side">
          <Side label="Status">{can ? <select className="mac-select" value={task.status} onChange={e => patch({ status: e.target.value })} style={sel}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select> : <StatusPill status={task.status} />}</Side>
          <Side label="Assignees">{can ? <PeoplePicker value={task.assignees} people={ctx.people} onChange={v => patch({ assignees: v })} placeholder="Unassigned" /> : <span style={{ fontSize: 12.5 }}>{task.assignees.map(a => a.name).join(', ') || 'Unassigned'}</span>}</Side>
          {can && !task.assignees.some(a => samePerson(a, me)) && <button className="wk-link" style={{ justifySelf: 'start', marginLeft: 104, fontSize: 11.5 }} onClick={() => patch({ assignees: [...task.assignees, { id: me.id, name: me.name, kind: me.kind }] })}>Assign to me</button>}
          <Side label="Type">{can ? <select className="mac-select" value={task.type} onChange={e => patch({ type: e.target.value })} style={sel}>{TYPES.map(s => <option key={s}>{s}</option>)}</select> : task.type}</Side>
          <Side label="Priority">{can ? <select className="mac-select" value={task.priority} onChange={e => patch({ priority: e.target.value })} style={sel}>{PRIORITIES.map(s => <option key={s}>{s}</option>)}</select> : <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><PriorityGlyph priority={task.priority} />{task.priority}</span>}</Side>
          <Side label="Project">{can && perms.manageAll ? <select className="mac-select" value={task.projectId || ''} onChange={e => { const p = ctx.projects.find(x => x.id === e.target.value); patch({ projectId: e.target.value || null, projectName: p?.projectName || '', sprintId: null, parentId: null }); }} style={sel}><option value="">— None —</option>{ctx.projects.map(p => <option key={p.id} value={p.id}>{p.key ? `${p.key} · ` : ''}{p.projectName}</option>)}</select> : <span style={{ fontSize: 12.5 }}>{ctx.projectName(task.projectId) || '—'}</span>}</Side>
          {task.type !== 'Epic' && <Side label={task.type === 'Subtask' ? 'Parent' : 'Epic'}>{can ? <select className="mac-select" value={task.parentId || ''} onChange={e => patch({ parentId: e.target.value || null })} style={sel}><option value="">— None —</option>{(task.type === 'Subtask' ? ctx.tasks.filter(t => t.id !== task.id && t.type !== 'Subtask' && t.projectId === task.projectId) : epics).map(t => <option key={t.id} value={t.id}>{taskKey(t, ctx.projects)} {t.title}</option>)}</select> : <span style={{ fontSize: 12.5 }}>{parent?.title || '—'}</span>}</Side>}
          {task.projectId && <Side label="Sprint">{can ? <select className="mac-select" value={task.sprintId || ''} onChange={e => patch({ sprintId: e.target.value || null })} style={sel}><option value="">Backlog</option>{projSprints.map(s => <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' (active)' : ''}</option>)}{task.sprintId && !projSprints.some(s => s.id === task.sprintId) && <option value={task.sprintId}>{ctx.sprintName(task.sprintId)}</option>}</select> : <span style={{ fontSize: 12.5 }}>{ctx.sprintName(task.sprintId) || 'Backlog'}</span>}</Side>}
          <Side label="Story points">{can ? <input type="number" min="0" step="0.5" className="mac-input" defaultValue={task.storyPoints ?? ''} key={`sp${task.id}${task.storyPoints}`} onBlur={e => { const v = e.target.value === '' ? null : +e.target.value; if (v !== (task.storyPoints ?? null)) patch({ storyPoints: v }); }} style={sel} /> : task.storyPoints ?? '—'}</Side>
          <Side label="Estimate (h)">{can ? <input type="number" min="0" step="0.5" className="mac-input" defaultValue={task.estimateHours ?? ''} key={`eh${task.id}${task.estimateHours}`} onBlur={e => { const v = e.target.value === '' ? null : +e.target.value; if (v !== (task.estimateHours ?? null)) patch({ estimateHours: v }); }} style={sel} /> : task.estimateHours ?? '—'}</Side>
          <Side label="Start">{can ? <input type="date" className="mac-input" value={task.startDate || ''} onChange={e => patch({ startDate: e.target.value })} style={sel} /> : task.startDate || '—'}</Side>
          <Side label="Due">{can ? <input type="date" className="mac-input" value={task.dueDate || ''} onChange={e => patch({ dueDate: e.target.value })} style={{ ...sel, color: isOverdue(task) ? '#D70015' : undefined }} /> : <span style={{ color: isOverdue(task) ? '#D70015' : undefined }}>{task.dueDate || '—'}</span>}</Side>
          <Side label="Labels">{can ? <LabelsInput value={task.labels} onChange={v => patch({ labels: v })} suggestions={ctx.allLabels} /> : task.labels.join(', ') || '—'}</Side>
          <Side label="Reporter"><span style={{ fontSize: 12.5 }}>{task.reporter || '—'}</span></Side>
          <Side label="Watchers"><span style={{ fontSize: 12.5 }}>{task.watchers?.length ? task.watchers.map(w => w.name).join(', ') : '—'}</span></Side>
          <div style={{ fontSize: 11, color: '#AEAEB2', marginTop: 8 }}>Created {task.createdAt ? new Date(task.createdAt).toLocaleString('en-IN') : '—'}<br />Updated {task.updatedAt ? new Date(task.updatedAt).toLocaleString('en-IN') : '—'}</div>
          {perms.delete && <button className="mac-btn mac-btn-danger" style={{ fontSize: 12.5, marginTop: 12 }} onClick={() => window.confirm(`Delete ${taskKey(task, ctx.projects)}${children.length ? ` and its ${children.length} subtask(s)` : ''}? This cannot be undone.`) && onDelete(task)}><Trash2 size={12} /> Delete issue</button>}
        </div>
      </div>
    </Modal>
  );
}

// Top-level (not inside TaskDetail) so its children keep state across renders
function Side({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', alignItems: 'center', gap: 8, minHeight: 34 }}>
      <span style={{ fontSize: 11.5, color: '#8E8E93' }}>{label}</span><div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function renderMentions(text) {
  return text.split(/(@[A-Z][\w]*(?: [A-Z][\w]*)?)/g).map((part, i) => part.startsWith('@') ? <span key={i} style={{ color: '#0071E3', fontWeight: 600 }}>{part}</span> : part);
}
