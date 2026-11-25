import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import {
  Drawer, Field, FormGrid, FormSection, Toolbar, Chips, SkeletonRows,
  EmptyPanel, ErrorPanel, RowMenu, useToast, fmtMoney,
} from '../components/ui/kit';
import { existingProjectsDB } from '../lib/db';
import { NumInput } from '../lib/numInput';
import { PROJECT_TYPES } from '../data/mockData';
import { Plus, Edit2, Trash2, Phone, Mail, MessageCircle, ExternalLink, Archive, SearchX } from 'lucide-react';
import './ExistingProjects.css';

const STATUSES = ['Delivered', 'Maintenance', 'Abandoned'];
const BILLING_TYPES = ['Without GST', 'With GST'];
const STATUS_COLOR = { Delivered: 'green', Maintenance: 'blue', Abandoned: 'red' };
// Older rows were saved with this page's own spelling; show and re-save them the app-wide way.
const LEGACY_TYPES = { 'ERP/CRM': 'ERP / CRM' };
const normType = t => LEGACY_TYPES[t] || t || '';

const emptyForm = {
  projectName: '', clientName: '', companyName: '', projectType: '',
  finalValue: '', billingType: 'Without GST', description: '',
  techStack: '', projectUrl: '', status: 'Delivered', notes: '',
  contactPerson: '', phone: '', email: '', whatsapp: '', city: '',
};

const withCurrent = (list, v) => (v && !list.includes(v) ? [...list, v] : list);
const webHref = u => (/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`);
const telHref = n => `tel:${String(n).replace(/[^\d+]/g, '')}`;
const waHref = n => `https://wa.me/${String(n).replace(/\D/g, '')}`;
const clientLine = p => [p.clientName, p.companyName && p.companyName !== p.clientName ? p.companyName : null].filter(Boolean).join(' · ');
function gstSplit(p) {
  if (!p.finalValue || p.billingType !== 'With GST') return null;
  const taxable = Math.round(p.finalValue / 1.18);
  return { taxable, gst: p.finalValue - taxable };
}

function validate(v) {
  const errors = {};
  if (!v.projectName.trim()) errors.projectName = 'Give the project a name';
  if (v.email && !/^\S+@\S+\.\S+$/.test(v.email.trim())) errors.email = 'This email does not look right';
  return errors;
}

function ProjectForm({ v, set, errors }) {
  return (
    <div className="pp-form">
      <FormSection title="Project">
        <FormGrid>
          <Field label="Project name" required error={errors.projectName} span={2}>
            <input className="mac-input" value={v.projectName} onChange={e => set('projectName', e.target.value)} placeholder="e.g. Bakery website" />
          </Field>
          <Field label="Client name">
            <input className="mac-input" value={v.clientName} onChange={e => set('clientName', e.target.value)} placeholder="Client full name" />
          </Field>
          <Field label="Company">
            <input className="mac-input" value={v.companyName} onChange={e => set('companyName', e.target.value)} placeholder="Company or business" />
          </Field>
          <Field label="Project type">
            <select className="mac-select" value={v.projectType} onChange={e => set('projectType', e.target.value)}>
              <option value="">Select type</option>
              {withCurrent(PROJECT_TYPES, v.projectType).map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="mac-select" value={v.status} onChange={e => set('status', e.target.value)}>
              {withCurrent(STATUSES, v.status).map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Final value (₹)">
            <NumInput className="mac-input" value={v.finalValue} onChange={val => set('finalValue', val)} placeholder="0" />
          </Field>
          <Field label="Billing">
            <select className="mac-select" value={v.billingType} onChange={e => set('billingType', e.target.value)}>
              {BILLING_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Live link" span={2}>
            <input className="mac-input" type="url" inputMode="url" value={v.projectUrl} onChange={e => set('projectUrl', e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Tech stack / tools" span={2}>
            <input className="mac-input" value={v.techStack} onChange={e => set('techStack', e.target.value)} placeholder="e.g. React, Node.js, Supabase" />
          </Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Contact (optional)">
        <FormGrid>
          <Field label="Contact person">
            <input className="mac-input" value={v.contactPerson} onChange={e => set('contactPerson', e.target.value)} placeholder="Decision maker" />
          </Field>
          <Field label="City">
            <input className="mac-input" value={v.city} onChange={e => set('city', e.target.value)} placeholder="e.g. Surat" />
          </Field>
          <Field label="Phone">
            <input className="mac-input" type="tel" inputMode="tel" value={v.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 XXXXX XXXXX" />
          </Field>
          <Field label="WhatsApp" hint="With country code, e.g. +91…">
            <input className="mac-input" type="tel" inputMode="tel" value={v.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="+91 XXXXX XXXXX" />
          </Field>
          <Field label="Email" error={errors.email} span={2}>
            <input className="mac-input" type="email" value={v.email} onChange={e => set('email', e.target.value)} placeholder="client@example.com" />
          </Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Notes (optional)">
        <Field label="What was built">
          <textarea className="mac-input" value={v.description} onChange={e => set('description', e.target.value)} placeholder="Brief description of the work" />
        </Field>
        <Field label="Notes">
          <textarea className="mac-input" value={v.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything worth remembering" />
        </Field>
      </FormSection>
    </div>
  );
}

function ProjectDetail({ p }) {
  const split = gstSplit(p);
  const hasLinks = p.projectUrl || p.phone || p.whatsapp || p.email;
  return (
    <>
      {hasLinks && (
        <div className="pp-quick">
          {p.projectUrl && <a className="mac-btn mac-btn-primary" href={webHref(p.projectUrl)} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Open site</a>}
          {p.phone && <a className="mac-btn mac-btn-secondary" href={telHref(p.phone)}><Phone size={15} /> Call</a>}
          {p.whatsapp && <a className="mac-btn mac-btn-secondary" href={waHref(p.whatsapp)} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /> WhatsApp</a>}
          {p.email && <a className="mac-btn mac-btn-secondary" href={`mailto:${p.email}`}><Mail size={15} /> Email</a>}
        </div>
      )}

      <section className="pp-section">
        <h3 className="section-title">Project</h3>
        <dl className="kv">
          <dt>Status</dt><dd><Badge color={STATUS_COLOR[p.status] || 'gray'}>{p.status || '—'}</Badge></dd>
          <dt>Type</dt><dd>{normType(p.projectType) || '—'}</dd>
          <dt>Client</dt><dd>{clientLine(p) || '—'}</dd>
          <dt>Final value</dt><dd>{p.finalValue ? `${fmtMoney(p.finalValue)}${split ? ' (incl. GST)' : ''}` : '—'}</dd>
          {split && <><dt>Taxable value</dt><dd>{fmtMoney(split.taxable)}</dd><dt>GST (18%)</dt><dd>{fmtMoney(split.gst)}</dd></>}
          <dt>Billing</dt><dd>{p.billingType || '—'}</dd>
          <dt>Tech stack</dt><dd>{p.techStack || '—'}</dd>
          <dt>Live link</dt><dd>{p.projectUrl ? <a className="pp-link" href={webHref(p.projectUrl)} target="_blank" rel="noopener noreferrer">{p.projectUrl}</a> : '—'}</dd>
        </dl>
      </section>

      {p.description && (
        <section className="pp-section">
          <h3 className="section-title">What was built</h3>
          <p className="pp-text">{p.description}</p>
        </section>
      )}

      <section className="pp-section">
        <h3 className="section-title">Contact</h3>
        <dl className="kv">
          <dt>Contact person</dt><dd>{p.contactPerson || '—'}</dd>
          <dt>City</dt><dd>{p.city || '—'}</dd>
          <dt>Phone</dt><dd>{p.phone ? <a className="pp-link" href={telHref(p.phone)}>{p.phone}</a> : '—'}</dd>
          <dt>WhatsApp</dt><dd>{p.whatsapp ? <a className="pp-link" href={waHref(p.whatsapp)} target="_blank" rel="noopener noreferrer">{p.whatsapp}</a> : '—'}</dd>
          <dt>Email</dt><dd>{p.email ? <a className="pp-link" href={`mailto:${p.email}`}>{p.email}</a> : '—'}</dd>
        </dl>
      </section>

      {p.notes && (
        <section className="pp-section">
          <h3 className="section-title">Notes</h3>
          <p className="pp-text">{p.notes}</p>
        </section>
      )}
    </>
  );
}

export default function ExistingProjects() {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('');

  const [detailId, setDetailId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setProjects(await existingProjectsDB.getAll());
    } catch (err) {
      console.error(err);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { counts, typeOptions, totalValue } = useMemo(() => {
    const c = { all: projects.length };
    let types = PROJECT_TYPES;
    let total = 0;
    projects.forEach(p => {
      c[p.status] = (c[p.status] || 0) + 1;
      types = withCurrent(types, normType(p.projectType));
      total += Number(p.finalValue) || 0;
    });
    return { counts: c, typeOptions: types, totalValue: total };
  }, [projects]);

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => projects.filter(p => {
    if (q && ![p.projectName, p.clientName, p.companyName, p.techStack, p.city].some(v => v && String(v).toLowerCase().includes(q))) return false;
    if (status !== 'all' && p.status !== status) return false;
    if (type && normType(p.projectType) !== type) return false;
    return true;
  }), [projects, q, status, type]);

  const isFiltered = !!q || status !== 'all' || !!type;
  const clearFilters = () => { setSearch(''); setStatus('all'); setType(''); };
  const detail = detailId ? projects.find(p => p.id === detailId) : null;

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => (e[k] ? { ...e, [k]: undefined } : e)); };
  function openAdd() { setForm(emptyForm); setEditId(null); setErrors({}); setFormOpen(true); }
  function openEdit(p) {
    const filled = { ...emptyForm, ...p, projectType: normType(p.projectType) };
    Object.keys(emptyForm).forEach(k => { if (filled[k] == null) filled[k] = emptyForm[k]; });
    setForm(filled); setEditId(p.id); setErrors({}); setFormOpen(true);
  }
  function closeForm() { setFormOpen(false); setEditId(null); }

  async function save(e) {
    e.preventDefault();
    if (saving) return;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      if (editId) {
        const updated = await existingProjectsDB.update(editId, form);
        setProjects(ps => ps.map(p => (p.id === editId ? updated : p)));
        toast.success('Project updated');
      } else {
        const created = await existingProjectsDB.create(form);
        setProjects(ps => [created, ...ps]);
        toast.success('Project added');
      }
      closeForm();
    } catch (err) {
      toast.error('Could not save the project', err);
    } finally {
      setSaving(false);
    }
  }

  // The row is only removed once the delete really succeeded.
  async function del(p) {
    const wasOpen = detailId === p.id;
    if (wasOpen) setDetailId(null);
    try {
      await existingProjectsDB.delete(p.id);
    } catch (err) {
      if (wasOpen) setDetailId(p.id);
      toast.error(`Could not delete ${p.projectName}`, err);
      return;
    }
    setProjects(ps => ps.filter(x => x.id !== p.id));
    toast.success(`${p.projectName} deleted`);
  }

  const rowMenu = p => [
    { label: 'Edit', icon: Edit2, onClick: () => openEdit(p) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => setDeleteTarget(p) },
  ];
  const chipOptions = [
    { value: 'all', label: 'All', count: counts.all },
    ...STATUSES.map(s => ({ value: s, label: s, count: counts[s] || 0 })),
  ];

  return (
    <div>
      <Header
        title="Past Projects"
        subtitle={loading || loadError ? 'Portfolio and reference list'
          : `${projects.length} project${projects.length === 1 ? '' : 's'} · ${fmtMoney(totalValue)} total value`}
        actions={<button className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> Add project</button>}
      />

      <div className="page-body">
        {loading ? <SkeletonRows rows={6} /> : loadError ? <ErrorPanel title="Could not load past projects" error={loadError} onRetry={load} /> : projects.length === 0 ? (
          <EmptyPanel icon={Archive} title="No past projects yet" text="Keep earlier work here so the team can find links, stacks and client contacts later."
            action={<button className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> Add project</button>} />
        ) : (
          <>
            <Chips label="Filter by status" value={status} onChange={setStatus} options={chipOptions} />

            <Toolbar search={search} onSearch={setSearch} placeholder="Search project, client, stack or city"
              right={<>
                <span>{isFiltered ? `${visible.length} of ${projects.length}` : `${projects.length} project${projects.length === 1 ? '' : 's'}`}</span>
                {isFiltered && <button className="mac-btn mac-btn-ghost" onClick={clearFilters}>Clear</button>}
              </>}>
              <select className="mac-select" aria-label="Project type" value={type} onChange={e => setType(e.target.value)}>
                <option value="">Any type</option>
                {typeOptions.map(t => <option key={t}>{t}</option>)}
              </select>
            </Toolbar>

            {visible.length === 0 ? (
              <EmptyPanel icon={SearchX} title="No projects match" text="Nothing fits the current search and filters."
                action={<button className="mac-btn mac-btn-secondary" onClick={clearFilters}>Clear filters</button>} />
            ) : (
              <>
                <div className="mac-card only-desktop">
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr><th>Project</th><th>Type</th><th>Status</th><th>Tech stack</th><th className="num">Value</th></tr>
                      </thead>
                      <tbody>
                        {visible.map(p => (
                          <tr key={p.id} className="clickable" tabIndex={0} onClick={() => setDetailId(p.id)}
                            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setDetailId(p.id); } }}>
                            <td>
                              <div className="cell-main">{p.projectName}</div>
                              <div className="cell-sub">{[clientLine(p), p.city].filter(Boolean).join(' · ') || '—'}</div>
                            </td>
                            <td>{normType(p.projectType) || '—'}</td>
                            <td><Badge color={STATUS_COLOR[p.status] || 'gray'}>{p.status || '—'}</Badge></td>
                            <td className="cell-sub">{p.techStack || '—'}</td>
                            <td className="num">
                              {p.finalValue ? fmtMoney(p.finalValue) : '—'}
                              {p.finalValue && p.billingType === 'With GST' ? <div className="cell-sub">incl. GST</div> : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="list-cards only-mobile">
                  {visible.map(p => (
                    <button key={p.id} className="list-card" onClick={() => setDetailId(p.id)}>
                      <span className="pp-card-top">
                        <span className="cell-main">{p.projectName}</span>
                        <Badge color={STATUS_COLOR[p.status] || 'gray'}>{p.status || '—'}</Badge>
                      </span>
                      <span className="cell-sub">{[clientLine(p), normType(p.projectType)].filter(Boolean).join(' · ') || '—'}</span>
                      <span className="pp-card-meta">
                        <span className="cell-sub">{p.techStack || p.city || ''}</span>
                        {!!p.finalValue && <span className="cell-main">{fmtMoney(p.finalValue)}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <Drawer
        isOpen={!!detail && !formOpen && !deleteTarget}
        onClose={() => setDetailId(null)}
        title={detail?.projectName}
        subtitle={detail && (clientLine(detail) || 'Past project')}
        actions={detail && <RowMenu items={rowMenu(detail)} label="Project actions" />}
      >
        {detail && <ProjectDetail p={detail} />}
      </Drawer>

      <Modal isOpen={formOpen} onClose={closeForm} title={editId ? 'Edit project' : 'Add past project'} size="lg"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={closeForm}>Cancel</button>
          <button type="submit" form="past-project-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Add project'}</button>
        </>}>
        <form id="past-project-form" onSubmit={save} noValidate>
          <ProjectForm v={form} set={set} errors={errors} />
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => del(deleteTarget)}
        title="Delete project" message={`This permanently removes ${deleteTarget?.projectName || 'this project'} from past projects.`} />
    </div>
  );
}
