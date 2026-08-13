import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Header from '../components/layout/Header';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import SearchBar from '../components/ui/SearchBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { PageLoader } from '../components/ui/CodelixLoader';
import { tasksDB, employeesDB, projectsDB, uploadProjectFile } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { PARTNERS } from '../data/mockData';
import {
  Plus, Filter, X, Trash2, Edit2, MessageSquare, Paperclip,
  ChevronsUp, ChevronUp, ChevronDown, ChevronsDown, Equal, Bug, CheckSquare,
  Bookmark, Zap, Clock, Loader2, Upload, Send, LayoutGrid, List,
  AlignLeft, AlertCircle, Image as ImageIcon, FileText, File as FileIcon,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const TASK_STATUSES   = ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done'];
const TASK_TYPES      = ['Task', 'Bug', 'Story', 'Epic'];
const TASK_PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

const STATUS_META = {
  'Backlog':     { color: 'gray',   dot: '#8E8E93', bg: 'rgba(142,142,147,0.10)' },
  'To Do':       { color: 'blue',   dot: '#0071E3', bg: 'rgba(0,113,227,0.08)'   },
  'In Progress': { color: 'orange', dot: '#FF9500', bg: 'rgba(255,149,0,0.08)'   },
  'In Review':   { color: 'purple', dot: '#AF52DE', bg: 'rgba(175,82,222,0.08)'  },
  'Done':        { color: 'green',  dot: '#34C759', bg: 'rgba(52,199,89,0.08)'   },
};

const TYPE_META = {
  Task:  { icon: CheckSquare, color: '#0071E3', bg: 'rgba(0,113,227,0.12)'  },
  Bug:   { icon: Bug,         color: '#FF3B30', bg: 'rgba(255,59,48,0.12)'  },
  Story: { icon: Bookmark,    color: '#34C759', bg: 'rgba(52,199,89,0.12)'  },
  Epic:  { icon: Zap,         color: '#AF52DE', bg: 'rgba(175,82,222,0.12)' },
};

const PRIORITY_META = {
  Highest: { icon: ChevronsUp,   color: '#FF3B30' },
  High:    { icon: ChevronUp,    color: '#FF9500' },
  Medium:  { icon: Equal,        color: '#FFB100' },
  Low:     { icon: ChevronDown,  color: '#0071E3' },
  Lowest:  { icon: ChevronsDown, color: '#8E8E93' },
};

const PARTNER_COLORS = {
  'Bhargav Thesiya':   '#0071E3',
  'Manas Vadodaria':   '#34C759',
  'Kushal Mungalpara': '#FF9500',
  'Prince Padariya':   '#AF52DE',
};

const LABEL_COLORS = ['#0071E3', '#34C759', '#FF9500', '#AF52DE', '#FF3B30', '#5AC8FA', '#FF2D55'];

const emptyTask = {
  title: '', description: '', type: 'Task', status: 'Backlog',
  priority: 'Medium', assignees: [], dueDate: '', labels: [], projectName: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const initials = (name = '') => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
const taskKey  = t => `CLX-${t.taskNo ?? '?'}`;
const uid      = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
}
function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)      return `${bytes} B`;
  if (bytes < 1048576)   return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}
function labelColor(label) {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = label.charCodeAt(i) + ((h << 5) - h);
  return LABEL_COLORS[Math.abs(h) % LABEL_COLORS.length];
}
function assigneeColor(a) {
  if (a.kind === 'partner') return PARTNER_COLORS[a.name] || '#0071E3';
  return '#34C759';
}
function computeOrder(list, index) {
  const prev = list[index - 1];
  const next = list[index];
  if (!prev && !next) return 1000;
  if (!prev)          return next.sortOrder - 1;
  if (!next)          return prev.sortOrder + 1;
  return (prev.sortOrder + next.sortOrder) / 2;
}

// ─── Small UI pieces ──────────────────────────────────────────────────────────

const FF = ({ label, children, required }) => (
  <div>
    <label style={{ display:'block', fontSize:11.5, fontWeight:550, color:'#6E6E73', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.4px' }}>
      {label}{required && <span style={{ color:'#FF3B30', marginLeft:2 }}>*</span>}
    </label>
    {children}
  </div>
);

function Avatar({ a, size = 22, ring = true }) {
  const c = assigneeColor(a);
  return (
    <div title={`${a.name}${a.kind === 'partner' ? ' · Partner' : ''}`} style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background:`linear-gradient(135deg, ${c}, ${c}CC)`,
      display:'flex', alignItems:'center', justifyContent:'center',
      color:'#fff', fontSize:size*0.36, fontWeight:700,
      border: ring ? '1.5px solid #fff' : 'none',
    }}>{initials(a.name)}</div>
  );
}

function AvatarStack({ assignees, max = 3 }) {
  if (!assignees?.length) return null;
  return (
    <div style={{ display:'flex', alignItems:'center' }}>
      {assignees.slice(0, max).map((a, i) => (
        <div key={a.id + a.kind} style={{ marginLeft: i ? -7 : 0, zIndex: max - i }}><Avatar a={a}/></div>
      ))}
      {assignees.length > max && (
        <div style={{ marginLeft:-7, width:22, height:22, borderRadius:'50%', background:'#E5E5EA', border:'1.5px solid #fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8.5, fontWeight:700, color:'#6E6E73', zIndex:0 }}>
          +{assignees.length - max}
        </div>
      )}
    </div>
  );
}

function TypeGlyph({ type, size = 15 }) {
  const m = TYPE_META[type] || TYPE_META.Task;
  const Icon = m.icon;
  return (
    <div style={{ width:size+7, height:size+7, borderRadius:6, background:m.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <Icon size={size} color={m.color}/>
    </div>
  );
}

function PriorityGlyph({ priority, size = 15 }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.Medium;
  const Icon = m.icon;
  return <Icon size={size} color={m.color} strokeWidth={2.4} style={{ flexShrink:0 }}/>;
}

function LabelPill({ label }) {
  const c = labelColor(label);
  return (
    <span style={{ fontSize:10, fontWeight:600, color:c, background:c + '18', padding:'2px 7px', borderRadius:5, whiteSpace:'nowrap' }}>{label}</span>
  );
}

function AttachGlyph({ type }) {
  if (type?.startsWith('image/')) return <ImageIcon size={13}/>;
  if (type === 'application/pdf')  return <FileText size={13}/>;
  return <FileIcon size={13}/>;
}

// ─── Assignee picker ──────────────────────────────────────────────────────────

function AssigneePicker({ value = [], onChange, people }) {
  function toggle(p) {
    const has = value.some(a => a.id === p.id && a.kind === p.kind);
    if (has) onChange(value.filter(a => !(a.id === p.id && a.kind === p.kind)));
    else     onChange([...value, p]);
  }
  const partners  = people.filter(p => p.kind === 'partner');
  const employees = people.filter(p => p.kind === 'employee');

  const renderGroup = (title, items) => items.length > 0 && (
    <div style={{ marginBottom:8 }}>
      <div style={{ fontSize:10, fontWeight:600, color:'#AEAEB2', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>{title}</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        {items.map(p => {
          const sel = value.some(a => a.id === p.id && a.kind === p.kind);
          const c = assigneeColor(p);
          return (
            <button key={p.kind + p.id} type="button" onClick={() => toggle(p)} style={{
              display:'flex', alignItems:'center', gap:7, padding:'5px 10px 5px 5px', borderRadius:20, cursor:'pointer',
              border:`1.5px solid ${sel ? c : 'rgba(0,0,0,0.1)'}`,
              background: sel ? c + '12' : '#fff', transition:'all 0.13s',
            }}>
              <Avatar a={p} ring={false}/>
              <span style={{ fontSize:12.5, fontWeight:500, color: sel ? c : '#3C3C43' }}>{p.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      {renderGroup('Partners', partners)}
      {renderGroup('Employees', employees)}
      {employees.length === 0 && <div style={{ fontSize:11.5, color:'#AEAEB2' }}>No active employees found</div>}
    </div>
  );
}

// ─── Labels editor ────────────────────────────────────────────────────────────

function LabelsEditor({ value = [], onChange }) {
  const [text, setText] = useState('');
  function add() {
    const t = text.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText('');
  }
  return (
    <div>
      <div style={{ display:'flex', gap:8 }}>
        <input className="mac-input" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Add label & press Enter"/>
        <button type="button" onClick={add} className="mac-btn mac-btn-secondary" style={{ fontSize:13, flexShrink:0 }}>Add</button>
      </div>
      {value.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
          {value.map(l => (
            <span key={l} style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
              <LabelPill label={l}/>
              <button type="button" onClick={() => onChange(value.filter(x => x !== l))} style={{ background:'none', border:'none', cursor:'pointer', color:'#AEAEB2', display:'flex', padding:0 }}><X size={11}/></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Task card (draggable) ────────────────────────────────────────────────────

function TaskCard({ task, onOpen, onDragStart, onDragEnd, dragging, canDrag }) {
  const overdue = task.dueDate && task.dueDate < new Date().toISOString().split('T')[0] && task.status !== 'Done';
  return (
    <div
      draggable={canDrag}
      onDragStart={e => canDrag && onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
      style={{
        background:'#fff', borderRadius:10, border:'1px solid rgba(0,0,0,0.08)',
        padding:'11px 12px', cursor: canDrag ? 'grab' : 'pointer',
        boxShadow:'0 1px 2px rgba(0,0,0,0.05)', opacity: dragging ? 0.4 : 1,
        transition:'box-shadow 0.14s, opacity 0.14s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'}
    >
      {task.labels?.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:7 }}>
          {task.labels.map(l => <LabelPill key={l} label={l}/>)}
        </div>
      )}
      <div style={{ fontSize:13, fontWeight:530, color:'#1D1D1F', lineHeight:1.4, marginBottom:9 }}>{task.title}</div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, minWidth:0 }}>
          <TypeGlyph type={task.type} size={13}/>
          <span style={{ fontSize:11, fontWeight:600, color:'#8E8E93', letterSpacing:'0.2px', whiteSpace:'nowrap' }}>{taskKey(task)}</span>
          <PriorityGlyph priority={task.priority} size={14}/>
          {task.comments?.length > 0 && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:2, fontSize:10.5, color:'#AEAEB2' }}>
              <MessageSquare size={11}/>{task.comments.length}
            </span>
          )}
          {task.attachments?.length > 0 && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:2, fontSize:10.5, color:'#AEAEB2' }}>
              <Paperclip size={11}/>{task.attachments.length}
            </span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          {task.dueDate && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10, fontWeight:500, color: overdue ? '#FF3B30' : '#AEAEB2' }}>
              <Clock size={10}/>{new Date(task.dueDate).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
            </span>
          )}
          <AvatarStack assignees={task.assignees}/>
        </div>
      </div>
    </div>
  );
}

// ─── Board column ─────────────────────────────────────────────────────────────

function Column({ status, tasks, onOpen, dnd, onQuickAdd, canManage, canDrag }) {
  const meta = STATUS_META[status];
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const isOver = dnd.dragOverCol === status;

  function submitAdd() {
    const t = title.trim();
    if (t) onQuickAdd(status, t);
    setTitle(''); setAdding(false);
  }

  return (
    <div
      onDragOver={e => { if (dnd.dragId) { e.preventDefault(); dnd.setDropTarget(status, tasks.length); } }}
      onDrop={e => { e.preventDefault(); dnd.onDrop(status); }}
      style={{
        width:288, minWidth:288, display:'flex', flexDirection:'column',
        background: isOver ? meta.bg : 'rgba(0,0,0,0.025)',
        borderRadius:14, border:`1px solid ${isOver ? meta.dot + '55' : 'rgba(0,0,0,0.05)'}`,
        maxHeight:'100%', transition:'background 0.15s, border-color 0.15s',
      }}
    >
      {/* column header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px 8px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:meta.dot }}/>
          <span style={{ fontSize:12, fontWeight:650, color:'#3C3C43', textTransform:'uppercase', letterSpacing:'0.5px' }}>{status}</span>
          <span style={{ fontSize:11, fontWeight:600, color:'#AEAEB2', background:'rgba(0,0,0,0.05)', borderRadius:20, padding:'1px 7px' }}>{tasks.length}</span>
        </div>
      </div>

      {/* cards */}
      <div style={{ flex:1, overflowY:'auto', padding:'2px 10px 10px', display:'flex', flexDirection:'column', gap:8 }}>
        {tasks.map((t, i) => (
          <div key={t.id}
            onDragOver={e => {
              if (!dnd.dragId) return;
              e.preventDefault(); e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              const after = e.clientY > r.top + r.height / 2;
              dnd.setDropTarget(status, i + (after ? 1 : 0));
            }}
          >
            {dnd.dropTarget?.status === status && dnd.dropTarget?.index === i && dnd.dragId && (
              <div style={{ height:2, background:meta.dot, borderRadius:2, margin:'0 0 8px' }}/>
            )}
            <TaskCard task={t} onOpen={onOpen} dragging={dnd.dragId === t.id} canDrag={canDrag}
              onDragStart={dnd.onDragStart} onDragEnd={dnd.onDragEnd}/>
          </div>
        ))}
        {dnd.dropTarget?.status === status && dnd.dropTarget?.index === tasks.length && dnd.dragId && (
          <div style={{ height:2, background:meta.dot, borderRadius:2 }}/>
        )}
        {tasks.length === 0 && !dnd.dragId && (
          <div style={{ padding:'18px 0', textAlign:'center', fontSize:11.5, color:'#C7C7CC' }}>No tasks</div>
        )}

        {/* quick add */}
        {canManage && (adding ? (
          <div style={{ background:'#fff', borderRadius:10, border:'1px solid rgba(0,113,227,0.3)', padding:'9px 10px' }}>
            <textarea autoFocus value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAdd(); } if (e.key === 'Escape') { setAdding(false); setTitle(''); } }}
              placeholder="What needs to be done?" rows={2}
              style={{ width:'100%', border:'none', outline:'none', resize:'none', fontSize:13, color:'#1D1D1F', fontFamily:'inherit', background:'transparent' }}/>
            <div style={{ display:'flex', gap:6, marginTop:6 }}>
              <button onClick={submitAdd} className="mac-btn mac-btn-primary" style={{ fontSize:12, padding:'5px 12px' }}>Add</button>
              <button onClick={() => { setAdding(false); setTitle(''); }} className="mac-btn mac-btn-secondary" style={{ fontSize:12, padding:'5px 10px' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{ display:'flex', alignItems:'center', gap:6, width:'100%', padding:'8px 10px', borderRadius:9, background:'transparent', border:'none', cursor:'pointer', fontSize:12.5, color:'#8E8E93', fontWeight:500 }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <Plus size={14}/> Add task
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Task form (create / edit) ────────────────────────────────────────────────

function TaskForm({ v, onChange, people, projects }) {
  const s = (k, val) => onChange({ ...v, [k]: val });
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 16px' }}>
        <FF label="Type"><select className="mac-select" value={v.type} onChange={e => s('type', e.target.value)}>{TASK_TYPES.map(t => <option key={t}>{t}</option>)}</select></FF>
        <FF label="Priority"><select className="mac-select" value={v.priority} onChange={e => s('priority', e.target.value)}>{TASK_PRIORITIES.map(t => <option key={t}>{t}</option>)}</select></FF>
      </div>
      <FF label="Title" required><input className="mac-input" value={v.title} onChange={e => s('title', e.target.value)} placeholder="Summarise the task"/></FF>
      <FF label="Description">
        <textarea className="mac-input" value={v.description} onChange={e => s('description', e.target.value)} rows={4} placeholder="Add details, acceptance criteria, notes…" style={{ resize:'vertical', minHeight:88 }}/>
      </FF>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 16px' }}>
        <FF label="Status"><select className="mac-select" value={v.status} onChange={e => s('status', e.target.value)}>{TASK_STATUSES.map(t => <option key={t}>{t}</option>)}</select></FF>
        <FF label="Due Date"><input className="mac-input" type="date" value={v.dueDate} onChange={e => s('dueDate', e.target.value)}/></FF>
      </div>
      <FF label="Project">
        <select className="mac-select" value={v.projectName} onChange={e => s('projectName', e.target.value)}>
          <option value="">— None —</option>
          {projects.map(p => <option key={p.id} value={p.projectName}>{p.projectName}</option>)}
        </select>
      </FF>
      <FF label="Assignees"><AssigneePicker value={v.assignees} onChange={val => s('assignees', val)} people={people}/></FF>
      <FF label="Labels"><LabelsEditor value={v.labels} onChange={val => s('labels', val)}/></FF>
    </div>
  );
}

// ─── Task detail (Jira issue view) ────────────────────────────────────────────

function DetailRow({ label, children }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'92px 1fr', gap:10, alignItems:'center', minHeight:32 }}>
      <span style={{ fontSize:11.5, color:'#8E8E93', fontWeight:500 }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function TaskDetail({ task, people, projects, canManage, currentUser, onEdit, onDelete, onPatch, onStatus, onClose }) {
  const [comment, setComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();
  const meta = STATUS_META[task.status];

  async function addComment() {
    const text = comment.trim();
    if (!text) return;
    const next = [...(task.comments || []), { id: uid(), author: currentUser, text, at: new Date().toISOString() }];
    setComment('');
    onPatch(task.id, { comments: next });
  }
  async function delComment(id) {
    onPatch(task.id, { comments: (task.comments || []).filter(c => c.id !== id) });
  }
  async function handleFiles(files) {
    if (!files.length) return;
    setUploading(true);
    const up = [];
    for (const f of files) {
      try { up.push(await uploadProjectFile(f)); }
      catch (e) { console.error(e); alert(`Upload failed for ${f.name}`); }
    }
    onPatch(task.id, { attachments: [...(task.attachments || []), ...up] });
    setUploading(false);
  }

  const images = (task.attachments || []).filter(a => a.type?.startsWith('image/'));
  const files  = (task.attachments || []).filter(a => !a.type?.startsWith('image/'));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* title bar */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:11 }}>
        <TypeGlyph type={task.type} size={17}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
            <span style={{ fontSize:11.5, fontWeight:700, color:'#8E8E93', letterSpacing:'0.3px' }}>{taskKey(task)}</span>
            <Badge color={meta.color}>{task.status}</Badge>
          </div>
          <h2 style={{ fontSize:17, fontWeight:660, color:'#1D1D1F', letterSpacing:'-0.3px', lineHeight:1.3 }}>{task.title}</h2>
        </div>
      </div>

      <div style={{ display:'flex', gap:18, flexWrap:'wrap' }}>
        {/* main column */}
        <div style={{ flex:'1 1 320px', minWidth:280, display:'flex', flexDirection:'column', gap:16 }}>
          {/* description */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, color:'#3C3C43', marginBottom:7 }}><AlignLeft size={13}/> Description</div>
            <p style={{ fontSize:13.5, color: task.description ? '#3C3C43' : '#AEAEB2', lineHeight:1.6, whiteSpace:'pre-wrap', margin:0 }}>
              {task.description || 'No description provided.'}
            </p>
          </div>

          {/* attachments */}
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, color:'#3C3C43' }}><Paperclip size={13}/> Attachments {task.attachments?.length > 0 && `(${task.attachments.length})`}</div>
              <button onClick={() => !uploading && fileRef.current?.click()} className="mac-btn mac-btn-secondary" style={{ fontSize:11.5, padding:'4px 10px' }}>
                {uploading ? <><Loader2 size={11} style={{ animation:'spin 0.8s linear infinite' }}/> Uploading</> : <><Upload size={11}/> Add</>}
              </button>
              <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" style={{ display:'none' }} onChange={e => handleFiles(Array.from(e.target.files))}/>
            </div>
            {images.length > 0 && (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
                {images.map((img, i) => (
                  <a key={i} href={img.url} target="_blank" rel="noopener noreferrer">
                    <img src={img.url} alt={img.name} style={{ width:74, height:56, objectFit:'cover', borderRadius:8, border:'1px solid rgba(0,0,0,0.1)' }}/>
                  </a>
                ))}
              </div>
            )}
            {files.length > 0 ? (
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {files.map((f, i) => (
                  <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:8, background:'rgba(0,113,227,0.06)', border:'1px solid rgba(0,113,227,0.12)', textDecoration:'none', fontSize:12, color:'#0071E3', fontWeight:500 }}>
                    <AttachGlyph type={f.type}/> {f.name} <span style={{ color:'#AEAEB2', fontWeight:400 }}>{fmtSize(f.size)}</span>
                  </a>
                ))}
              </div>
            ) : images.length === 0 && <div style={{ fontSize:12, color:'#C7C7CC' }}>No attachments</div>}
          </div>

          {/* comments */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, color:'#3C3C43', marginBottom:9 }}><MessageSquare size={13}/> Comments {task.comments?.length > 0 && `(${task.comments.length})`}</div>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#0071E3,#0A84FF)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:10, fontWeight:700 }}>{initials(currentUser)}</div>
              <div style={{ flex:1, display:'flex', gap:6 }}>
                <input className="mac-input" value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addComment(); } }} placeholder="Add a comment…"/>
                <button onClick={addComment} disabled={!comment.trim()} className="mac-btn mac-btn-primary" style={{ fontSize:12, padding:'0 12px', opacity: comment.trim() ? 1 : 0.5 }}><Send size={13}/></button>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {(task.comments || []).slice().reverse().map(c => (
                <div key={c.id} style={{ display:'flex', gap:8 }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, background:'#E5E5EA', display:'flex', alignItems:'center', justifyContent:'center', color:'#6E6E73', fontSize:10, fontWeight:700 }}>{initials(c.author)}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:2 }}>
                      <span style={{ fontSize:12.5, fontWeight:600, color:'#1D1D1F' }}>{c.author}</span>
                      <span style={{ fontSize:10.5, color:'#AEAEB2' }}>{fmtDate(c.at)}</span>
                      {(canManage || c.author === currentUser) && (
                        <button onClick={() => delComment(c.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#C7C7CC', display:'flex', padding:0, marginLeft:'auto' }}><X size={12}/></button>
                      )}
                    </div>
                    <div style={{ fontSize:13, color:'#3C3C43', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{c.text}</div>
                  </div>
                </div>
              ))}
              {(task.comments || []).length === 0 && <div style={{ fontSize:12, color:'#C7C7CC' }}>No comments yet</div>}
            </div>
          </div>
        </div>

        {/* details sidebar */}
        <div style={{ flex:'1 1 220px', minWidth:220, maxWidth:300, alignSelf:'flex-start', padding:'14px 16px', borderRadius:12, background:'rgba(0,0,0,0.02)', border:'1px solid rgba(0,0,0,0.06)', display:'flex', flexDirection:'column', gap:4 }}>
          <DetailRow label="Status">
            <select className="mac-select" style={{ fontSize:12.5, padding:'5px 28px 5px 10px' }} value={task.status} onChange={e => onStatus(task, e.target.value)}>
              {TASK_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </DetailRow>
          <DetailRow label="Assignees">
            {task.assignees?.length > 0
              ? <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>{task.assignees.map(a => (
                  <div key={a.kind + a.id} style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 8px 3px 3px', borderRadius:20, background:'#fff', border:'1px solid rgba(0,0,0,0.08)' }}>
                    <Avatar a={a} size={18} ring={false}/><span style={{ fontSize:11.5, color:'#3C3C43' }}>{a.name.split(' ')[0]}</span>
                  </div>
                ))}</div>
              : <span style={{ fontSize:12.5, color:'#AEAEB2' }}>Unassigned</span>}
          </DetailRow>
          <DetailRow label="Priority">
            <div style={{ display:'flex', alignItems:'center', gap:6 }}><PriorityGlyph priority={task.priority}/><span style={{ fontSize:12.5, color:'#3C3C43' }}>{task.priority}</span></div>
          </DetailRow>
          <DetailRow label="Type">
            <div style={{ display:'flex', alignItems:'center', gap:6 }}><TypeGlyph type={task.type} size={13}/><span style={{ fontSize:12.5, color:'#3C3C43' }}>{task.type}</span></div>
          </DetailRow>
          <DetailRow label="Reporter"><span style={{ fontSize:12.5, color:'#3C3C43' }}>{task.reporter || '—'}</span></DetailRow>
          <DetailRow label="Due date">
            <span style={{ fontSize:12.5, color: task.dueDate ? '#3C3C43' : '#AEAEB2' }}>{task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—'}</span>
          </DetailRow>
          <DetailRow label="Project"><span style={{ fontSize:12.5, color: task.projectName ? '#3C3C43' : '#AEAEB2' }}>{task.projectName || '—'}</span></DetailRow>
          {task.labels?.length > 0 && (
            <DetailRow label="Labels"><div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>{task.labels.map(l => <LabelPill key={l} label={l}/>)}</div></DetailRow>
          )}
          <DetailRow label="Created"><span style={{ fontSize:12, color:'#AEAEB2' }}>{task.createdAt ? new Date(task.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—'}</span></DetailRow>
        </div>
      </div>

      {/* footer */}
      <div style={{ display:'flex', gap:8, paddingTop:14, borderTop:'1px solid rgba(0,0,0,0.07)' }}>
        {canManage && <button onClick={() => onDelete(task.id)} className="mac-btn mac-btn-danger" style={{ fontSize:13 }}><Trash2 size={13}/> Delete</button>}
        <div style={{ flex:1 }}/>
        {canManage && <button onClick={() => onEdit(task)} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}><Edit2 size={13}/> Edit</button>}
        <button onClick={onClose} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>Done</button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Tasks() {
  const { user, employeeData, isEmployee } = useAuth();
  const currentUser = employeeData?.name
    || (user?.email ? user.email.split('@')[0].split('.')[0].replace(/^\w/, c => c.toUpperCase()) : 'Unknown');
  const canManage = !isEmployee;   // partners create/edit/delete; employees view + move + comment

  const [tasks, setTasks]         = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');

  const [view, setView]           = useState('board'); // board | list
  const [search, setSearch]       = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [fType, setFType]         = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fAssignee, setFAssignee] = useState('');

  const [showForm, setShowForm]   = useState(false);
  const [editTask, setEditTask]   = useState(null);
  const [form, setForm]           = useState(emptyTask);
  const [detail, setDetail]       = useState(null);
  const [deleteId, setDeleteId]   = useState(null);

  // drag-and-drop state
  const [dragId, setDragId]           = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [dropTarget, setDropTarget]   = useState(null); // { status, index }

  // people = partners + active employees
  const people = useMemo(() => [
    ...PARTNERS.map(p => ({ id: p, name: p, kind: 'partner' })),
    ...employees.map(e => ({ id: e.id, name: e.name, kind: 'employee' })),
  ], [employees]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [tRes, eRes, pRes] = await Promise.allSettled([tasksDB.getAll(), employeesDB.getAll(), projectsDB.getAll()]);
    if (tRes.status === 'rejected') console.error('tasks fetch:', tRes.reason);
    setTasks(tRes.status === 'fulfilled' ? tRes.value : []);
    setEmployees((eRes.status === 'fulfilled' ? eRes.value : []).filter(e => e.status === 'Active'));
    setProjects(pRes.status === 'fulfilled' ? pRes.value : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // employee sees only tasks assigned to them
  const scoped = useMemo(() => {
    if (!isEmployee || !employeeData?.id) return tasks;
    return tasks.filter(t => (t.assignees || []).some(a => a.kind === 'employee' && a.id === employeeData.id));
  }, [tasks, isEmployee, employeeData?.id]);

  const filtered = useMemo(() => scoped.filter(t => {
    const q = search.toLowerCase();
    const matchQ = !q || t.title.toLowerCase().includes(q) || taskKey(t).toLowerCase().includes(q) || (t.labels || []).some(l => l.toLowerCase().includes(q));
    const matchType = !fType || t.type === fType;
    const matchPri  = !fPriority || t.priority === fPriority;
    const matchAsg  = !fAssignee || (t.assignees || []).some(a => `${a.kind}:${a.id}` === fAssignee);
    return matchQ && matchType && matchPri && matchAsg;
  }), [scoped, search, fType, fPriority, fAssignee]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(TASK_STATUSES.map(s => [s, []]));
    filtered.forEach(t => { (map[t.status] || (map[t.status] = [])).push(t); });
    for (const s of TASK_STATUSES) map[s].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return map;
  }, [filtered]);

  const nextTaskNo = useMemo(() => tasks.reduce((m, t) => Math.max(m, t.taskNo || 0), 0) + 1, [tasks]);

  // ── DnD ──────────────────────────────────────────────────────────────
  const dnd = {
    dragId, dragOverCol, dropTarget,
    onDragStart: (e, t) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; },
    onDragEnd: () => { setDragId(null); setDragOverCol(null); setDropTarget(null); },
    setDropTarget: (status, index) => { setDragOverCol(status); setDropTarget({ status, index }); },
    onDrop: async (status) => {
      const id = dragId;
      const target = dropTarget;
      setDragId(null); setDragOverCol(null); setDropTarget(null);
      if (!id) return;
      const moving = tasks.find(t => t.id === id);
      if (!moving) return;
      const colList = tasks.filter(t => t.status === status && t.id !== id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const index = target && target.status === status ? Math.min(target.index, colList.length) : colList.length;
      const newOrder = computeOrder(colList, index);
      if (moving.status === status && moving.sortOrder === newOrder) return;
      setTasks(ts => ts.map(t => t.id === id ? { ...t, status, sortOrder: newOrder } : t));
      try { await tasksDB.move(id, status, newOrder); }
      catch (e) { console.error(e); fetchAll(); }
    },
  };

  // ── CRUD ─────────────────────────────────────────────────────────────
  async function save() {
    if (!form.title || saving) return;
    setSaving(true); setSaveError('');
    try {
      if (editTask) {
        const updated = await tasksDB.update(editTask.id, form);
        setTasks(ts => ts.map(t => t.id === editTask.id ? updated : t));
        if (detail?.id === editTask.id) setDetail(updated);
      } else {
        const colCount = tasks.filter(t => t.status === form.status).length;
        const created = await tasksDB.create({ ...form, taskNo: nextTaskNo, reporter: currentUser, sortOrder: (colCount + 1) * 1000 });
        setTasks(ts => [...ts, created]);
      }
      setShowForm(false); setEditTask(null); setForm(emptyTask);
    } catch (e) {
      console.error('save task:', e);
      setSaveError(e?.message || 'Failed to save. Make sure the tasks table exists in Supabase (run supabase/tasks.sql).');
    }
    setSaving(false);
  }

  async function quickAdd(status, title) {
    const colCount = tasks.filter(t => t.status === status).length;
    const optimistic = { id: 'tmp-' + uid(), taskNo: nextTaskNo, title, description:'', type:'Task', status, priority:'Medium', assignees:[], reporter:currentUser, dueDate:'', labels:[], projectName:'', comments:[], attachments:[], sortOrder:(colCount + 1) * 1000, createdAt:new Date().toISOString() };
    setTasks(ts => [...ts, optimistic]);
    try {
      const created = await tasksDB.create(optimistic);
      setTasks(ts => ts.map(t => t.id === optimistic.id ? created : t));
    } catch (e) { console.error(e); setTasks(ts => ts.filter(t => t.id !== optimistic.id)); alert('Could not add task — is the tasks table set up?'); }
  }

  async function patchTask(id, patch) {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    setDetail(d => d && d.id === id ? { ...d, ...patch } : d);
    try { await tasksDB.patch(id, patch); }
    catch (e) { console.error(e); fetchAll(); }
  }

  async function changeStatus(t, status) {
    const colCount = tasks.filter(x => x.status === status && x.id !== t.id).length;
    const sortOrder = (colCount + 1) * 1000;
    setTasks(ts => ts.map(x => x.id === t.id ? { ...x, status, sortOrder } : x));
    setDetail(d => d && d.id === t.id ? { ...d, status, sortOrder } : d);
    try { await tasksDB.move(t.id, status, sortOrder); }
    catch (e) { console.error(e); fetchAll(); }
  }

  async function del(id) {
    setTasks(ts => ts.filter(t => t.id !== id));
    if (detail?.id === id) setDetail(null);
    try { await tasksDB.delete(id); } catch (e) { console.error(e); fetchAll(); }
  }

  const openEdit = t => { setEditTask(t); setForm({ title:t.title, description:t.description||'', type:t.type, status:t.status, priority:t.priority, assignees:t.assignees||[], dueDate:t.dueDate||'', labels:t.labels||[], projectName:t.projectName||'' }); setDetail(null); setSaveError(''); setShowForm(true); };
  const openNew  = () => { setEditTask(null); setForm(emptyTask); setSaveError(''); setShowForm(true); };

  const doneCount = scoped.filter(t => t.status === 'Done').length;
  const subtitle = `${scoped.length} task${scoped.length !== 1 ? 's' : ''} · ${doneCount} done`;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <Header
        title={isEmployee ? 'My Tasks' : 'Tasks / Todo'}
        subtitle={subtitle}
        actions={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <div className="tab-bar hide-mobile">
              <button className={`tab-item ${view === 'board' ? 'active' : ''}`} onClick={() => setView('board')} style={{ display:'flex', alignItems:'center', gap:5 }}><LayoutGrid size={13}/> Board</button>
              <button className={`tab-item ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')} style={{ display:'flex', alignItems:'center', gap:5 }}><List size={13}/> List</button>
            </div>
            {canManage && <button onClick={openNew} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}><Plus size={14}/> New Task</button>}
          </div>
        }
      />

      {loading ? <PageLoader /> : (
        <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>
          {/* controls */}
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', padding:'16px 24px 12px' }}>
            <div style={{ flex:1, maxWidth:300 }}><SearchBar value={search} onChange={setSearch} placeholder="Search tasks, keys, labels…"/></div>
            <button onClick={() => setShowFilters(f => !f)} className={`mac-btn ${showFilters || fType || fPriority || fAssignee ? 'mac-btn-primary' : 'mac-btn-secondary'}`} style={{ fontSize:13 }}><Filter size={13}/> Filter</button>
            {/* assignee avatars quick-filter */}
            <div style={{ display:'flex', alignItems:'center', marginLeft:4 }}>
              {people.slice(0, 8).map((p, i) => {
                const key = `${p.kind}:${p.id}`;
                const active = fAssignee === key;
                return (
                  <button key={key} onClick={() => setFAssignee(active ? '' : key)} title={p.name}
                    style={{ marginLeft: i ? -7 : 0, borderRadius:'50%', border:'none', padding:0, cursor:'pointer', outline: active ? '2px solid #0071E3' : 'none', zIndex: active ? 20 : (10 - i), position:'relative' }}>
                    <Avatar a={p} size={26}/>
                  </button>
                );
              })}
            </div>
          </div>

          {showFilters && (
            <div className="mac-card" style={{ margin:'0 24px 12px', padding:'14px 16px', display:'flex', gap:14, flexWrap:'wrap' }}>
              {[['Type', fType, setFType, TASK_TYPES], ['Priority', fPriority, setFPriority, TASK_PRIORITIES]].map(([lbl, val, setVal, opts]) => (
                <div key={lbl} style={{ flex:1, minWidth:130 }}>
                  <label style={{ display:'block', fontSize:10.5, fontWeight:600, color:'#8E8E93', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:5 }}>{lbl}</label>
                  <select className="mac-select" style={{ fontSize:13 }} value={val} onChange={e => setVal(e.target.value)}>
                    <option value="">All</option>{opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              {(fType || fPriority || fAssignee) && (
                <div style={{ display:'flex', alignItems:'flex-end' }}>
                  <button onClick={() => { setFType(''); setFPriority(''); setFAssignee(''); }} className="mac-btn mac-btn-secondary" style={{ fontSize:12 }}>Clear</button>
                </div>
              )}
            </div>
          )}

          {/* board */}
          {view === 'board' ? (
            <div style={{ flex:1, minHeight:0, display:'flex', gap:14, padding:'2px 24px 20px', overflowX:'auto', overflowY:'hidden' }}>
              {TASK_STATUSES.map(status => (
                <Column key={status} status={status} tasks={byStatus[status]} onOpen={setDetail}
                  dnd={dnd} onQuickAdd={quickAdd} canManage={canManage} canDrag />
              ))}
            </div>
          ) : (
            <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'2px 24px 24px' }}>
              <TaskList tasks={filtered} onOpen={setDetail}/>
            </div>
          )}
        </div>
      )}

      {/* create / edit modal */}
      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditTask(null); setForm(emptyTask); }} title={editTask ? `Edit ${taskKey(editTask)}` : 'Create Task'} size="lg">
        <TaskForm v={form} onChange={setForm} people={people} projects={projects}/>
        {saveError && (
          <div style={{ marginTop:12, padding:'10px 14px', borderRadius:10, background:'rgba(255,59,48,0.07)', border:'1px solid rgba(255,59,48,0.2)', fontSize:12.5, color:'#FF3B30', display:'flex', gap:7 }}>
            <AlertCircle size={14} style={{ flexShrink:0, marginTop:1 }}/>{saveError}
          </div>
        )}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:18, paddingTop:16, borderTop:'1px solid rgba(0,0,0,0.07)' }}>
          <button onClick={() => { setShowForm(false); setEditTask(null); }} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>Cancel</button>
          <button onClick={save} disabled={saving || !form.title} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>{saving ? 'Saving…' : editTask ? 'Save Changes' : 'Create Task'}</button>
        </div>
      </Modal>

      {/* detail modal */}
      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title="Task Details" size="xl">
        {detail && <TaskDetail task={detail} people={people} projects={projects} canManage={canManage} currentUser={currentUser}
          onEdit={openEdit} onDelete={id => setDeleteId(id)} onPatch={patchTask} onStatus={changeStatus} onClose={() => setDetail(null)}/>}
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => del(deleteId)} title="Delete Task" message="This will permanently delete this task, its comments and attachments."/>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

function TaskList({ tasks, onOpen }) {
  if (tasks.length === 0) return <div style={{ textAlign:'center', padding:'56px', color:'#AEAEB2', fontSize:13 }}>No tasks found</div>;
  const sorted = [...tasks].sort((a, b) => TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status));
  return (
    <div className="mac-card" style={{ overflow:'hidden' }}>
      {sorted.map(t => {
        const overdue = t.dueDate && t.dueDate < new Date().toISOString().split('T')[0] && t.status !== 'Done';
        return (
          <div key={t.id} className="table-row" onClick={() => onOpen(t)}
            style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', cursor:'pointer' }}>
            <TypeGlyph type={t.type} size={14}/>
            <span style={{ fontSize:11.5, fontWeight:600, color:'#8E8E93', width:64, flexShrink:0 }}>{taskKey(t)}</span>
            <PriorityGlyph priority={t.priority}/>
            <span style={{ flex:1, minWidth:0, fontSize:13, color:'#1D1D1F', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.title}</span>
            {t.labels?.slice(0, 2).map(l => <LabelPill key={l} label={l}/>)}
            <Badge color={STATUS_META[t.status].color}>{t.status}</Badge>
            {t.dueDate && <span style={{ fontSize:11, color: overdue ? '#FF3B30' : '#AEAEB2', width:64, flexShrink:0, textAlign:'right' }}>{new Date(t.dueDate).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</span>}
            <div style={{ width:60, display:'flex', justifyContent:'flex-end', flexShrink:0 }}><AvatarStack assignees={t.assignees}/></div>
          </div>
        );
      })}
    </div>
  );
}
