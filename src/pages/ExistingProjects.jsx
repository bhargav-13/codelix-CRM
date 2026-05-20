import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import SearchBar from '../components/ui/SearchBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import { PageLoader } from '../components/ui/CodelixLoader';
import { existingProjectsDB } from '../lib/db';
import {
  Plus, Edit2, Trash2, Globe, Phone, Mail, MessageCircle,
  MapPin, FolderOpen, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';

const PROJECT_TYPES = [
  'Website Development', 'Mobile App', 'ERP/CRM',
  'UI/UX Design', 'Branding & Design', 'Digital Marketing', 'Other',
];
const STATUSES = ['Delivered', 'Maintenance', 'Abandoned'];
const BILLING_TYPES = ['Without GST', 'With GST'];

const STATUS_COLOR = {
  Delivered:   'green',
  Maintenance: 'blue',
  Abandoned:   'red',
};

const emptyForm = {
  projectName: '', clientName: '', companyName: '', projectType: '',
  finalValue: '', billingType: 'Without GST', description: '',
  techStack: '', projectUrl: '', status: 'Delivered', notes: '',
  contactPerson: '', phone: '', email: '', whatsapp: '', city: '',
};

const FF = ({ label, children, required, span }) => (
  <div style={span ? { gridColumn: 'span 2' } : {}}>
    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 550, color: '#6E6E73', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
      {label}{required && <span style={{ color: '#FF3B30', marginLeft: 2 }}>*</span>}
    </label>
    {children}
  </div>
);

function ProjectForm({ v, onChange }) {
  const s = (k, val) => onChange({ ...v, [k]: val });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Project details */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Project Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
          <FF label="Project Name" required span>
            <input className="mac-input" value={v.projectName} onChange={e => s('projectName', e.target.value)} placeholder="e.g. Codelix CRM" />
          </FF>
          <FF label="Client Name">
            <input className="mac-input" value={v.clientName} onChange={e => s('clientName', e.target.value)} placeholder="Client full name" />
          </FF>
          <FF label="Company Name">
            <input className="mac-input" value={v.companyName} onChange={e => s('companyName', e.target.value)} placeholder="Company or business" />
          </FF>
          <FF label="Project Type">
            <select className="mac-select" value={v.projectType} onChange={e => s('projectType', e.target.value)}>
              <option value="">Select type</option>
              {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </FF>
          <FF label="Status">
            <select className="mac-select" value={v.status} onChange={e => s('status', e.target.value)}>
              {STATUSES.map(t => <option key={t}>{t}</option>)}
            </select>
          </FF>
          <FF label="Final Value (₹)">
            <input className="mac-input" type="number" value={v.finalValue} onChange={e => s('finalValue', e.target.value)} placeholder="0" />
          </FF>
          <FF label="Billing Type">
            <select className="mac-select" value={v.billingType} onChange={e => s('billingType', e.target.value)}>
              {BILLING_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </FF>
          <FF label="Project URL / Live Link" span>
            <input className="mac-input" value={v.projectUrl} onChange={e => s('projectUrl', e.target.value)} placeholder="https://…" />
          </FF>
          <FF label="Tech Stack / Tools Used" span>
            <input className="mac-input" value={v.techStack} onChange={e => s('techStack', e.target.value)} placeholder="e.g. React, Node.js, Supabase" />
          </FF>
          <FF label="Description" span>
            <textarea className="mac-input" style={{ resize: 'none', height: 72 }} value={v.description} onChange={e => s('description', e.target.value)} placeholder="Brief about what was built…" />
          </FF>
          <FF label="Notes" span>
            <textarea className="mac-input" style={{ resize: 'none', height: 60 }} value={v.notes} onChange={e => s('notes', e.target.value)} placeholder="Any additional remarks…" />
          </FF>
        </div>
      </div>

      {/* Contact details */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Contact Details (for future)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
          <FF label="Contact Person">
            <input className="mac-input" value={v.contactPerson} onChange={e => s('contactPerson', e.target.value)} placeholder="Decision maker name" />
          </FF>
          <FF label="City / Location">
            <input className="mac-input" value={v.city} onChange={e => s('city', e.target.value)} placeholder="e.g. Surat" />
          </FF>
          <FF label="Phone">
            <input className="mac-input" value={v.phone} onChange={e => s('phone', e.target.value)} placeholder="+91 XXXXX XXXXX" />
          </FF>
          <FF label="WhatsApp">
            <input className="mac-input" value={v.whatsapp} onChange={e => s('whatsapp', e.target.value)} placeholder="+91 XXXXX XXXXX" />
          </FF>
          <FF label="Email" span>
            <input className="mac-input" type="email" value={v.email} onChange={e => s('email', e.target.value)} placeholder="client@example.com" />
          </FF>
        </div>
      </div>
    </div>
  );
}

function ContactRow({ icon: Icon, label, value, href }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <Icon size={12} color="#8E8E93" style={{ flexShrink: 0 }} />
      {href
        ? <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#0071E3', textDecoration: 'none' }}>{value}</a>
        : <span style={{ fontSize: 12, color: '#3C3C43' }}>{value}</span>
      }
    </div>
  );
}

function ProjectCard({ proj, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const gst = proj.billingType === 'With GST';
  const taxable = proj.finalValue ? (gst ? +(proj.finalValue / 1.18).toFixed(0) : proj.finalValue) : null;
  const gstAmt  = proj.finalValue && gst ? proj.finalValue - taxable : null;

  return (
    <div className="mac-card" style={{ padding: 18, transition: 'box-shadow 0.15s', position: 'relative' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
    >
      {/* Actions */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.15s' }} className="card-actions">
        <button onClick={onEdit} style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(0,0,0,0.07)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit2 size={12} color="#6E6E73" /></button>
        <button onClick={onDelete} style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(255,59,48,0.09)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={12} color="#FF3B30" /></button>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,#0071E3,#0A84FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(0,113,227,0.25)' }}>
          <FolderOpen size={18} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: 60 }}>
          <div style={{ fontSize: 14, fontWeight: 650, color: '#1D1D1F', letterSpacing: '-0.2px', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.projectName}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge color={STATUS_COLOR[proj.status] || 'gray'}>{proj.status}</Badge>
            {proj.projectType && <Badge color="gray">{proj.projectType}</Badge>}
          </div>
        </div>
      </div>

      {/* Client + Value */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {(proj.clientName || proj.companyName) && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#AEAEB2' }}>Client</span>
            <span style={{ fontSize: 12, color: '#3C3C43', fontWeight: 500 }}>{proj.clientName || proj.companyName}{proj.clientName && proj.companyName ? ` · ${proj.companyName}` : ''}</span>
          </div>
        )}
        {proj.finalValue != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#AEAEB2' }}>Value</span>
            <span style={{ fontSize: 12, color: '#1D1D1F', fontWeight: 600 }}>
              ₹{proj.finalValue.toLocaleString('en-IN')}
              {gst && <span style={{ fontSize: 10, color: '#8E8E93', marginLeft: 4 }}>(incl. GST)</span>}
            </span>
          </div>
        )}
        {gst && taxable && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#AEAEB2' }}>GST (18%)</span>
            <span style={{ fontSize: 12, color: '#FF9500' }}>₹{gstAmt.toLocaleString('en-IN')}</span>
          </div>
        )}
        {proj.techStack && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 11, color: '#AEAEB2', flexShrink: 0 }}>Stack</span>
            <span style={{ fontSize: 11.5, color: '#6E6E73', textAlign: 'right' }}>{proj.techStack}</span>
          </div>
        )}
        {proj.projectUrl && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#AEAEB2' }}>Live Link</span>
            <a href={proj.projectUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: '#0071E3', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
              Visit <ExternalLink size={10} />
            </a>
          </div>
        )}
      </div>

      {/* Description */}
      {proj.description && (
        <div style={{ fontSize: 12, color: '#6E6E73', lineHeight: 1.5, marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.05)' }}>
          {proj.description}
        </div>
      )}

      {/* Contact expand toggle */}
      {(proj.contactPerson || proj.phone || proj.email || proj.whatsapp || proj.city) && (
        <div>
          <button onClick={() => setExpanded(e => !e)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0 0', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <span style={{ fontSize: 11.5, fontWeight: 550, color: '#8E8E93' }}>Contact Details</span>
            {expanded ? <ChevronUp size={13} color="#8E8E93" /> : <ChevronDown size={13} color="#8E8E93" />}
          </button>
          {expanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {proj.contactPerson && <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F' }}>{proj.contactPerson}</div>}
              <ContactRow icon={MapPin} label="City" value={proj.city} />
              <ContactRow icon={Phone} label="Phone" value={proj.phone} href={proj.phone ? `tel:${proj.phone}` : null} />
              <ContactRow icon={MessageCircle} label="WhatsApp" value={proj.whatsapp} href={proj.whatsapp ? `https://wa.me/${proj.whatsapp.replace(/\D/g, '')}` : null} />
              <ContactRow icon={Mail} label="Email" value={proj.email} href={proj.email ? `mailto:${proj.email}` : null} />
            </div>
          )}
        </div>
      )}

      <style>{`.mac-card:hover .card-actions{opacity:1!important}`}</style>
    </div>
  );
}

export default function ExistingProjects() {
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');
  const [typeFilter, setType]     = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editProj, setEditProj]   = useState(null);
  const [form, setForm]           = useState(emptyForm);
  const [deleteId, setDeleteId]   = useState(null);
  const [saveError, setSaveError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try { setProjects(await existingProjectsDB.getAll()); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => projects.filter(p => {
    const q = search.toLowerCase();
    const matchQ = !q || p.projectName.toLowerCase().includes(q)
      || p.clientName?.toLowerCase().includes(q)
      || p.companyName?.toLowerCase().includes(q)
      || p.techStack?.toLowerCase().includes(q);
    const matchS = !statusFilter || p.status === statusFilter;
    const matchT = !typeFilter   || p.projectType === typeFilter;
    return matchQ && matchS && matchT;
  }), [projects, search, statusFilter, typeFilter]);

  function openAdd() { setForm(emptyForm); setEditProj(null); setSaveError(''); setShowForm(true); }
  function openEdit(p) { setEditProj(p); setForm({ ...emptyForm, ...p, finalValue: p.finalValue ?? '' }); setSaveError(''); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditProj(null); setSaveError(''); }

  async function save() {
    if (!form.projectName || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      if (editProj) {
        const updated = await existingProjectsDB.update(editProj.id, form);
        setProjects(ps => ps.map(p => p.id === editProj.id ? updated : p));
        closeForm();
      } else {
        const created = await existingProjectsDB.create(form);
        setProjects(ps => [created, ...ps]);
        closeForm();
      }
    } catch (e) {
      console.error(e);
      setSaveError(e?.message || 'Failed to save. Check if the table exists in Supabase.');
    }
    setSaving(false);
  }

  async function del(id) {
    setProjects(ps => ps.filter(p => p.id !== id));
    try { await existingProjectsDB.delete(id); } catch (e) { console.error(e); await fetchAll(); }
    setDeleteId(null);
  }

  return (
    <div>
      <Header
        title="Existing Projects"
        subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''} · pre-CRM portfolio`}
        actions={
          <button onClick={openAdd} className="mac-btn mac-btn-primary" style={{ fontSize: 13 }}>
            <Plus size={14} /> Add Project
          </button>
        }
      />

      {loading ? <PageLoader /> : (
        <div className="page-body">
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, maxWidth: 320 }}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search projects, clients, stack…" />
            </div>
            <select className="mac-select" style={{ fontSize: 13, width: 'auto', minWidth: 130 }} value={statusFilter} onChange={e => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <select className="mac-select" style={{ fontSize: 13, width: 'auto', minWidth: 160 }} value={typeFilter} onChange={e => setType(e.target.value)}>
              <option value="">All Types</option>
              {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <span style={{ fontSize: 12, color: '#8E8E93', marginLeft: 'auto' }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Status summary pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATUSES.map(s => {
              const count = projects.filter(p => p.status === s).length;
              if (!count) return null;
              return (
                <button key={s} onClick={() => setStatus(statusFilter === s ? '' : s)}
                  style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${statusFilter === s ? '#0071E3' : 'rgba(0,0,0,0.1)'}`, background: statusFilter === s ? 'rgba(0,113,227,0.08)' : 'rgba(0,0,0,0.03)', cursor: 'pointer', fontSize: 12, color: statusFilter === s ? '#0071E3' : '#6E6E73', fontWeight: statusFilter === s ? 600 : 450 }}>
                  {s} <span style={{ fontWeight: 600 }}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Cards grid */}
          {filtered.length === 0
            ? <div style={{ textAlign: 'center', padding: '56px', color: '#AEAEB2', fontSize: 13 }}>No projects found</div>
            : <div className="rg-3">
                {filtered.map(p => (
                  <ProjectCard key={p.id} proj={p}
                    onEdit={() => openEdit(p)}
                    onDelete={() => setDeleteId(p.id)}
                  />
                ))}
              </div>
          }
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal isOpen={showForm} onClose={closeForm} title={editProj ? 'Edit Project' : 'Add Existing Project'} size="lg">
        <ProjectForm v={form} onChange={setForm} />
        {saveError && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)', fontSize: 12, color: '#FF3B30' }}>
            {saveError}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
          <button onClick={closeForm} className="mac-btn mac-btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
          <button onClick={save} disabled={saving || !form.projectName} className="mac-btn mac-btn-primary" style={{ fontSize: 13 }}>
            {saving ? 'Saving…' : editProj ? 'Save Changes' : 'Add Project'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => del(deleteId)}
        title="Delete Project"
        message="This will permanently remove this existing project record."
      />
    </div>
  );
}
