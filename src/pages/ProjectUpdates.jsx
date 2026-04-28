import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Header from '../components/layout/Header';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import SearchBar from '../components/ui/SearchBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { projectUpdatesDB, uploadProjectFile, projectsDB } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { PARTNERS } from '../data/mockData';
import {
  Plus, Edit2, Trash2, Filter, Paperclip, Image, FileText, File,
  Layers, Flag, AlertCircle, Bell, RefreshCw, ChevronDown, ChevronUp,
  Download, X, Upload, Loader2,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const UPDATE_STATUSES = ['In Progress', 'Completed', 'Blocked', 'Review Needed', 'Info'];
const UPDATE_TYPES    = ['Update', 'Milestone', 'Issue', 'Design', 'Announcement'];

const STATUS_META = {
  'In Progress':   { color: 'blue',   dot: '#0071E3' },
  'Completed':     { color: 'green',  dot: '#34C759' },
  'Blocked':       { color: 'red',    dot: '#FF3B30' },
  'Review Needed': { color: 'orange', dot: '#FF9500' },
  'Info':          { color: 'gray',   dot: '#8E8E93' },
};

const TYPE_META = {
  Update:       { icon: RefreshCw,   color: '#0071E3', bg: 'rgba(0,113,227,0.1)'   },
  Milestone:    { icon: Flag,        color: '#34C759', bg: 'rgba(52,199,89,0.1)'   },
  Issue:        { icon: AlertCircle, color: '#FF3B30', bg: 'rgba(255,59,48,0.1)'   },
  Design:       { icon: Layers,      color: '#AF52DE', bg: 'rgba(175,82,222,0.1)'  },
  Announcement: { icon: Bell,        color: '#FF9500', bg: 'rgba(255,149,0,0.1)'   },
};

const PARTNER_COLORS = {
  'Bhargav Thesiya':   '#0071E3',
  'Manas Vadodaria':   '#34C759',
  'Kushal Mungalpara': '#FF9500',
  'Prince Padariya':   '#AF52DE',
};

const emptyForm = {
  projectName: '', title: '', content: '',
  status: 'In Progress', updateType: 'Update', createdBy: PARTNERS[0],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

function AttachIcon({ type }) {
  if (type?.startsWith('image/')) return <Image size={13} />;
  if (type === 'application/pdf')  return <FileText size={13} />;
  return <File size={13} />;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const FF = ({ label, children, required }) => (
  <div>
    <label style={{ display:'block', fontSize:11.5, fontWeight:550, color:'#6E6E73', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.4px' }}>
      {label}{required && <span style={{ color:'#FF3B30', marginLeft:2 }}>*</span>}
    </label>
    {children}
  </div>
);

function AttachmentChip({ att, onRemove }) {
  const isImage = att.type?.startsWith('image/');
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px', borderRadius:8, background:'rgba(0,0,0,0.04)', border:'1px solid rgba(0,0,0,0.08)', maxWidth:200 }}>
      <AttachIcon type={att.type}/>
      <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:11.5, color:'#1D1D1F', textDecoration:'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
        {att.name}
      </a>
      {att.size > 0 && <span style={{ fontSize:10, color:'#AEAEB2', flexShrink:0 }}>{fmtSize(att.size)}</span>}
      {onRemove && (
        <button onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', color:'#AEAEB2', flexShrink:0 }}>
          <X size={11}/>
        </button>
      )}
    </div>
  );
}

function ImagePreview({ url, name }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img
        src={url} alt={name}
        onClick={() => setOpen(true)}
        style={{ width:80, height:60, objectFit:'cover', borderRadius:8, cursor:'pointer', border:'1px solid rgba(0,0,0,0.1)', flexShrink:0 }}
        onError={e => { e.target.style.display='none'; }}
      />
      {open && (
        <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out', padding:24 }}>
          <img src={url} alt={name} style={{ maxWidth:'90vw', maxHeight:'90vh', borderRadius:12, objectFit:'contain' }}/>
        </div>
      )}
    </>
  );
}

function UpdateCard({ update, onEdit, onDelete, readOnly }) {
  const [expanded, setExpanded] = useState(false);
  const typeMeta    = TYPE_META[update.updateType]  || TYPE_META.Update;
  const statusMeta  = STATUS_META[update.status]    || STATUS_META['In Progress'];
  const TypeIcon    = typeMeta.icon;
  const authorColor = PARTNER_COLORS[update.createdBy] || '#8E8E93';
  const images      = update.attachments.filter(a => a.type?.startsWith('image/'));
  const files       = update.attachments.filter(a => !a.type?.startsWith('image/'));

  return (
    <div style={{ background:'#fff', borderRadius:16, border:'1px solid rgba(0,0,0,0.07)', overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', transition:'box-shadow 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.09)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'}
    >
      {/* Card header */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'16px 18px 12px' }}>

        {/* Type icon */}
        <div style={{ width:36, height:36, borderRadius:10, background:typeMeta.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
          <TypeIcon size={16} color={typeMeta.color}/>
        </div>

        {/* Main content */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
            <Badge color={statusMeta.color}>{update.status}</Badge>
            <span style={{ fontSize:10.5, color:'#AEAEB2' }}>{update.updateType}</span>
            {update.projectName && (
              <>
                <span style={{ fontSize:10.5, color:'#AEAEB2' }}>·</span>
                <span style={{ fontSize:11, fontWeight:500, color:'#6E6E73', background:'rgba(0,0,0,0.04)', padding:'2px 7px', borderRadius:20 }}>
                  {update.projectName}
                </span>
              </>
            )}
          </div>
          <h3 style={{ fontSize:14.5, fontWeight:640, color:'#1D1D1F', letterSpacing:'-0.2px', margin:0, lineHeight:1.3 }}>
            {update.title}
          </h3>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          <span style={{ fontSize:11, color:'#AEAEB2', whiteSpace:'nowrap' }}>{fmtDate(update.createdAt)}</span>
          {!readOnly && (
            <>
              <button onClick={() => onEdit(update)} style={{ width:28, height:28, borderRadius:8, background:'rgba(0,0,0,0.05)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Edit2 size={12} color="#6E6E73"/>
              </button>
              <button onClick={() => onDelete(update.id)} style={{ width:28, height:28, borderRadius:8, background:'rgba(255,59,48,0.07)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Trash2 size={12} color="#FF3B30"/>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {update.content && (
        <div style={{ padding:'0 18px 12px 66px' }}>
          <p style={{ fontSize:13.5, color:'#3C3C43', lineHeight:1.65, margin:0,
            display: expanded ? 'block' : '-webkit-box',
            WebkitLineClamp: expanded ? 'unset' : 3,
            WebkitBoxOrient: 'vertical',
            overflow: expanded ? 'visible' : 'hidden',
          }}>
            {update.content}
          </p>
          {update.content.length > 200 && (
            <button onClick={() => setExpanded(e => !e)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#0071E3', fontWeight:500, padding:'4px 0 0', display:'flex', alignItems:'center', gap:4 }}>
              {expanded ? <><ChevronUp size={12}/> Show less</> : <><ChevronDown size={12}/> Read more</>}
            </button>
          )}
        </div>
      )}

      {/* Image previews */}
      {images.length > 0 && (
        <div style={{ padding:'0 18px 12px 66px', display:'flex', gap:8, flexWrap:'wrap' }}>
          {images.map((img, i) => <ImagePreview key={i} url={img.url} name={img.name}/>)}
        </div>
      )}

      {/* File attachments */}
      {files.length > 0 && (
        <div style={{ padding:'0 18px 12px 66px', display:'flex', gap:6, flexWrap:'wrap' }}>
          {files.map((f, i) => (
            <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, background:'rgba(0,113,227,0.06)', border:'1px solid rgba(0,113,227,0.12)', textDecoration:'none', fontSize:12, color:'#0071E3', fontWeight:500 }}>
              <Download size={11}/> {f.name}
            </a>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 18px 14px 18px', borderTop:'1px solid rgba(0,0,0,0.05)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:22, height:22, borderRadius:'50%', background: authorColor + '22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color: authorColor }}>
            {(update.createdBy || '?').slice(0,2).toUpperCase()}
          </div>
          <span style={{ fontSize:12, color:'#8E8E93' }}>{update.createdBy || 'Unknown'}</span>
        </div>
        {update.attachments.length > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#AEAEB2' }}>
            <Paperclip size={11}/>
            {update.attachments.length} attachment{update.attachments.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Update Form ──────────────────────────────────────────────────────────────

function UpdateForm({ form, onChange, projects, uploading, onFileSelect }) {
  const s = (k, v) => onChange({ ...form, [k]: v });
  const fileRef = useRef();

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Type + Status row */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <FF label="Type" required>
          <select className="mac-select" value={form.updateType} onChange={e => s('updateType', e.target.value)}>
            {UPDATE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </FF>
        <FF label="Status" required>
          <select className="mac-select" value={form.status} onChange={e => s('status', e.target.value)}>
            {UPDATE_STATUSES.map(t => <option key={t}>{t}</option>)}
          </select>
        </FF>
      </div>

      {/* Project + Created by */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <FF label="Project">
          <select className="mac-select" value={form.projectName} onChange={e => s('projectName', e.target.value)}>
            <option value="">— None —</option>
            {projects.map(p => <option key={p.id} value={p.projectName}>{p.projectName}</option>)}
          </select>
        </FF>
        <FF label="Posted By" required>
          <select className="mac-select" value={form.createdBy} onChange={e => s('createdBy', e.target.value)}>
            {PARTNERS.map(p => <option key={p}>{p}</option>)}
          </select>
        </FF>
      </div>

      {/* Title */}
      <FF label="Title" required>
        <input className="mac-input" value={form.title} onChange={e => s('title', e.target.value)} placeholder="What's this update about?"/>
      </FF>

      {/* Content */}
      <FF label="Details">
        <textarea
          className="mac-input"
          value={form.content}
          onChange={e => s('content', e.target.value)}
          placeholder="Add more context, instructions, or notes…"
          rows={4}
          style={{ resize:'vertical', minHeight:88 }}
        />
      </FF>

      {/* Attachments */}
      <FF label="Attachments">
        <div
          onClick={() => !uploading && fileRef.current?.click()}
          style={{
            padding:'14px', borderRadius:11, border:'2px dashed rgba(0,0,0,0.12)',
            background:'rgba(0,0,0,0.015)', cursor: uploading ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            transition:'border-color 0.15s',
          }}
          onMouseEnter={e => !uploading && (e.currentTarget.style.borderColor = '#0071E3')}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'}
        >
          {uploading
            ? <><Loader2 size={15} color="#0071E3" style={{ animation:'spin 0.8s linear infinite' }}/><span style={{ fontSize:13, color:'#0071E3' }}>Uploading…</span></>
            : <><Upload size={15} color="#AEAEB2"/><span style={{ fontSize:13, color:'#8E8E93' }}>Click to add files — images, PDFs, docs</span></>
          }
        </div>
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" style={{ display:'none' }} onChange={e => onFileSelect(Array.from(e.target.files))}/>

        {/* Existing attachments */}
        {form.attachments.length > 0 && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
            {form.attachments.map((att, i) => (
              <AttachmentChip key={i} att={att} onRemove={() => onChange({ ...form, attachments: form.attachments.filter((_, j) => j !== i) })}/>
            ))}
          </div>
        )}
      </FF>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectUpdates({ readOnly = false }) {
  const { user, employeeData } = useAuth();

  const [updates, setUpdates]           = useState([]);
  const [projects, setProjects]         = useState([]);
  const [assignedProjects, setAssigned] = useState(null); // null = loading, [] = none, [...] = list
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterType, setFilterType]     = useState('');
  const [showFilters, setShowFilters]   = useState(false);
  const [showAdd, setShowAdd]           = useState(false);
  const [editUpdate, setEditUpdate]     = useState(null);
  const [form, setForm]                 = useState({ ...emptyForm, attachments: [] });
  const [deleteId, setDeleteId]         = useState(null);
  const [saveError, setSaveError]       = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);

    // Use allSettled so a missing/erroring table never blocks the other fetch
    const [updRes, projRes] = await Promise.allSettled([
      projectUpdatesDB.getAll(),
      projectsDB.getAll(),
    ]);
    if (updRes.status  === 'rejected') console.error('updates fetch:', updRes.reason);
    if (projRes.status === 'rejected') console.error('projects fetch:', projRes.reason);

    const upd  = updRes.status  === 'fulfilled' ? updRes.value  : [];
    const proj = projRes.status === 'fulfilled' ? projRes.value : [];

    // For employees: only keep projects they are assigned to
    if (readOnly && employeeData?.id) {
      const mine = proj.filter(p =>
        (p.assignedEmployees || []).some(e => e.id === employeeData.id)
      );
      setAssigned(mine);
      const names = new Set(mine.map(p => p.projectName));
      setUpdates(upd.filter(u => u.projectName && names.has(u.projectName)));
      setProjects(mine);
    } else {
      setAssigned(null);
      setUpdates(upd);
      setProjects(proj);
    }

    setLoading(false);
  }, [readOnly, employeeData?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── File upload handler ─────────────────────────────────────────────
  async function handleFiles(files) {
    if (!files.length) return;
    setUploading(true);
    const uploaded = [];
    for (const file of files) {
      try {
        const result = await uploadProjectFile(file);
        uploaded.push(result);
      } catch (e) {
        console.error('Upload failed for', file.name, e);
        alert(`Upload failed for ${file.name}: ${e.message}`);
      }
    }
    setForm(f => ({ ...f, attachments: [...(f.attachments || []), ...uploaded] }));
    setUploading(false);
  }

  // ── CRUD ───────────────────────────────────────────────────────────
  async function save() {
    if (!form.title || saving || uploading) return;
    setSaving(true);
    setSaveError('');
    try {
      if (editUpdate) {
        const updated = await projectUpdatesDB.update(editUpdate.id, { ...form, attachments: form.attachments || [] });
        setUpdates(us => us.map(u => u.id === editUpdate.id ? updated : u));
      } else {
        const created = await projectUpdatesDB.create({ ...form, attachments: form.attachments || [] });
        setUpdates(us => [created, ...us]);
      }
      setSaving(false);
      setShowAdd(false); setEditUpdate(null); setForm({ ...emptyForm, attachments: [] });
    } catch (e) {
      console.error('Save error:', e);
      setSaveError(e?.message || 'Failed to save. Make sure the project_updates table exists in Supabase.');
      setSaving(false);
    }
  }

  async function del(id) {
    setUpdates(us => us.filter(u => u.id !== id));
    try { await projectUpdatesDB.delete(id); } catch (e) { console.error(e); await fetchAll(); }
  }

  // ── Filtering ──────────────────────────────────────────────────────
  const filtered = useMemo(() => updates.filter(u => {
    const q = search.toLowerCase();
    const matchQ = !q || u.title.toLowerCase().includes(q) || (u.content||'').toLowerCase().includes(q) || (u.projectName||'').toLowerCase().includes(q);
    const matchStatus  = !filterStatus  || u.status      === filterStatus;
    const matchProject = !filterProject || u.projectName === filterProject;
    const matchType    = !filterType    || u.updateType  === filterType;
    return matchQ && matchStatus && matchProject && matchType;
  }), [updates, search, filterStatus, filterProject, filterType]);

  const projectNames = useMemo(() => [...new Set(updates.map(u => u.projectName).filter(Boolean))], [updates]);

  // ── Counts per status (for header summary) ─────────────────────────
  const counts = useMemo(() => ({
    blocked:  updates.filter(u => u.status === 'Blocked').length,
    review:   updates.filter(u => u.status === 'Review Needed').length,
    progress: updates.filter(u => u.status === 'In Progress').length,
  }), [updates]);

  const subtitle = readOnly
    ? `${updates.length} update${updates.length !== 1 ? 's' : ''}${counts.blocked ? ` · ${counts.blocked} blocked` : ''}${counts.review ? ` · ${counts.review} need review` : ''}`
    : `${updates.length} total · ${counts.progress} in progress${counts.blocked ? ` · ${counts.blocked} blocked` : ''}`;

  return (
    <div>
      <Header
        title="Project Updates"
        subtitle={subtitle}
        actions={
          !readOnly && (
            <button
              onClick={() => { setForm({ ...emptyForm, attachments: [] }); setEditUpdate(null); setSaveError(''); setShowAdd(true); }}
              className="mac-btn mac-btn-primary"
              style={{ fontSize:13 }}
            >
              <Plus size={14}/> Post Update
            </button>
          )
        }
      />

      {loading ? <LoadingSpinner rows={5}/> : (
        <div className="page-body">

          {/* Employee welcome banner */}
          {readOnly && employeeData && (
            <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'14px 16px', borderRadius:14, background:'linear-gradient(135deg,rgba(0,113,227,0.07),rgba(0,113,227,0.03))', border:'1px solid rgba(0,113,227,0.12)' }}>
              <div style={{ width:38, height:38, borderRadius:10, background:'linear-gradient(135deg,#0071E3,#0A84FF)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:12, fontWeight:700, flexShrink:0 }}>
                {employeeData.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13.5, fontWeight:640, color:'#1D1D1F' }}>Welcome back, {employeeData.name.split(' ')[0]} 👋</div>
                {assignedProjects && assignedProjects.length > 0 ? (
                  <div style={{ marginTop:6, display:'flex', flexWrap:'wrap', gap:5 }}>
                    {assignedProjects.map(p => (
                      <span key={p.id} style={{ fontSize:11.5, fontWeight:500, color:'#0071E3', background:'rgba(0,113,227,0.1)', padding:'2px 9px', borderRadius:20, border:'1px solid rgba(0,113,227,0.15)' }}>
                        {p.projectName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize:12, color:'#6E6E73', marginTop:2 }}>You haven't been assigned to any projects yet</div>
                )}
              </div>
            </div>
          )}

          {/* Status chips summary */}
          {updates.length > 0 && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {UPDATE_STATUSES.map(s => {
                const cnt = updates.filter(u => u.status === s).length;
                if (!cnt) return null;
                const m = STATUS_META[s];
                return (
                  <button key={s} onClick={() => setFilterStatus(fs => fs === s ? '' : s)} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:20, border:`1.5px solid ${filterStatus === s ? m.dot : 'rgba(0,0,0,0.08)'}`, background: filterStatus === s ? m.dot + '15' : '#fff', cursor:'pointer', fontSize:12, fontWeight:500, color: filterStatus === s ? m.dot : '#3C3C43', transition:'all 0.14s' }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:m.dot, display:'inline-block', flexShrink:0 }}/>
                    {s} <span style={{ fontSize:11, opacity:0.7 }}>{cnt}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Search + filter row */}
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <div style={{ flex:1, maxWidth:280 }}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search updates…"/>
            </div>
            <button onClick={() => setShowFilters(f => !f)} className={`mac-btn ${showFilters ? 'mac-btn-primary' : 'mac-btn-secondary'}`} style={{ fontSize:13 }}>
              <Filter size={13}/> Filter
            </button>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="mac-card" style={{ padding:'14px 16px', display:'flex', gap:14, flexWrap:'wrap' }}>
              {[
                ['Project', filterProject, setFilterProject, projectNames],
                ['Type',    filterType,    setFilterType,    UPDATE_TYPES],
              ].map(([lbl, val, setVal, opts]) => (
                <div key={lbl} style={{ flex:1, minWidth:130 }}>
                  <label style={{ display:'block', fontSize:10.5, fontWeight:600, color:'#8E8E93', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:5 }}>{lbl}</label>
                  <select className="mac-select" style={{ fontSize:13 }} value={val} onChange={e => setVal(e.target.value)}>
                    <option value="">All</option>
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              {(filterStatus || filterProject || filterType) && (
                <div style={{ display:'flex', alignItems:'flex-end' }}>
                  <button onClick={() => { setFilterStatus(''); setFilterProject(''); setFilterType(''); }} className="mac-btn mac-btn-secondary" style={{ fontSize:12 }}>Clear</button>
                </div>
              )}
            </div>
          )}

          {/* Feed */}
          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 24px' }}>
              <div style={{ width:52, height:52, borderRadius:15, background:'rgba(0,0,0,0.04)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                <RefreshCw size={22} color="#AEAEB2"/>
              </div>
              <p style={{ fontSize:14, color:'#AEAEB2', margin:0 }}>
                {search || filterStatus || filterProject || filterType
                  ? 'No updates match your filters'
                  : readOnly && assignedProjects && assignedProjects.length === 0
                    ? 'You haven\'t been assigned to any projects yet — ask your team lead'
                    : readOnly
                      ? 'No updates for your projects yet — check back soon'
                      : 'No updates yet — post the first one'}
              </p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {filtered.map(u => (
                <UpdateCard
                  key={u.id}
                  update={u}
                  readOnly={readOnly}
                  onEdit={u => { setEditUpdate(u); setForm({ projectName:u.projectName||'', title:u.title, content:u.content||'', status:u.status, updateType:u.updateType, createdBy:u.createdBy||PARTNERS[0], attachments:u.attachments||[] }); setShowAdd(true); }}
                  onDelete={id => setDeleteId(id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add / Edit Modal ──────────────────────────────────── */}
      <Modal
        isOpen={showAdd}
        onClose={() => { setShowAdd(false); setEditUpdate(null); setForm({ ...emptyForm, attachments: [] }); setSaveError(''); }}
        title={editUpdate ? 'Edit Update' : 'Post New Update'}
        size="md"
      >
        <UpdateForm
          form={form}
          onChange={setForm}
          projects={projects}
          uploading={uploading}
          onFileSelect={handleFiles}
        />
        {saveError && (
          <div style={{ marginTop:12, padding:'10px 14px', borderRadius:10, background:'rgba(255,59,48,0.07)', border:'1px solid rgba(255,59,48,0.2)', fontSize:12.5, color:'#FF3B30', display:'flex', alignItems:'flex-start', gap:7 }}>
            <AlertCircle size={14} style={{ flexShrink:0, marginTop:1 }}/>
            {saveError}
          </div>
        )}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16, paddingTop:16, borderTop:'1px solid rgba(0,0,0,0.07)' }}>
          <button onClick={() => { setShowAdd(false); setEditUpdate(null); setSaveError(''); }} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>Cancel</button>
          <button onClick={save} disabled={saving || uploading || !form.title} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>
            {saving ? 'Saving…' : uploading ? 'Uploading…' : editUpdate ? 'Save Changes' : 'Post Update'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { del(deleteId); setDeleteId(null); }} title="Delete Update" message="This will permanently delete this update and its attachments."/>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
