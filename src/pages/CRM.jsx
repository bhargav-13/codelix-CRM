import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Badge, { getStatusColor } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  Drawer, Field, FormGrid, FormSection, Toolbar, Chips, StatTiles, SkeletonRows,
  EmptyPanel, ErrorPanel, RowMenu, Avatar, useToast, fmtMoney, fmtDate, todayLocal,
} from '../components/ui/kit';
import { clientsDB, auditDB } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { NumInput } from '../lib/numInput';
import { PROJECT_TYPES, SOURCES, CLIENT_STATUSES, PRIORITIES } from '../data/mockData';
import { usePeople } from '../lib/people';
import {
  Plus, Phone, Mail, Edit2, Trash2, History, AlertCircle, CalendarClock, Flame, IndianRupee, Users, SearchX,
} from 'lucide-react';
import './CRM.css';

const STATUS_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'Hot', label: 'Hot' },
  { value: 'Warm', label: 'Warm' },
  { value: 'Cold', label: 'Cold' },
  { value: 'Closed Won', label: 'Won' },
  { value: 'Closed Lost', label: 'Lost' },
  { value: 'Not Received', label: 'Not received' },
];
const NEXT_PRESETS = [['Tomorrow', 1], ['In 3 days', 3], ['In a week', 7]];
const HIDE_CLOSED_AFTER_DAYS = 20;

const emptyClient = {
  clientName: '', companyName: '', contact: '', email: '', address: '',
  projectType: 'Website Development', source: 'Referral', status: 'Cold', proposalValue: '',
  finalPrice: '', priority: 'Medium', createdBy: '', nextFollowup: '', followupHistory: [],
};

// Local-calendar date maths (YYYY-MM-DD in, YYYY-MM-DD out)
function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const isClosed = c => c.status === 'Closed Won' || c.status === 'Closed Lost';
const isOverdue = (c, today) => !isClosed(c) && !!c.nextFollowup && c.nextFollowup < today;
const isDueToday = (c, today) => !isClosed(c) && c.nextFollowup === today;
const dueState = (c, today) => (isOverdue(c, today) ? 'is-overdue' : isDueToday(c, today) ? 'is-today' : '');
function dueLabel(c, today) {
  if (isClosed(c)) return '—';
  if (!c.nextFollowup) return 'Not set';
  if (c.nextFollowup === today) return 'Today';
  if (c.nextFollowup < today) return `Overdue · ${fmtDate(c.nextFollowup)}`;
  return fmtDate(c.nextFollowup);
}
// Keep a saved value selectable even if it is no longer in the standard list
const withCurrent = (list, v) => (v && !list.includes(v) ? [v, ...list] : list);
const telHref = n => `tel:${String(n).replace(/[^\d+]/g, '')}`;

function validateClient(v) {
  const errors = {};
  if (!v.clientName.trim()) errors.clientName = 'Enter the client’s name';
  if (v.email && !/^\S+@\S+\.\S+$/.test(v.email.trim())) errors.email = 'This email does not look right';
  return errors;
}

function ClientForm({ v, set, errors, isEdit, partners }) {
  return (
    <>
      <FormSection title="Who">
        <FormGrid>
          <Field label="Client name" required error={errors.clientName}>
            <input className="mac-input" value={v.clientName} onChange={e => set('clientName', e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Company">
            <input className="mac-input" value={v.companyName} onChange={e => set('companyName', e.target.value)} placeholder="Company or business" />
          </Field>
          <Field label="Phone">
            <input className="mac-input" type="tel" inputMode="tel" value={v.contact} onChange={e => set('contact', e.target.value)} placeholder="10-digit number" />
          </Field>
          <Field label="Email" error={errors.email}>
            <input className="mac-input" type="email" value={v.email} onChange={e => set('email', e.target.value)} placeholder="name@example.com" />
          </Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Deal">
        <FormGrid>
          <Field label="Status">
            <select className="mac-select" value={v.status} onChange={e => set('status', e.target.value)}>
              {withCurrent(CLIENT_STATUSES, v.status).map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="mac-select" value={v.priority} onChange={e => set('priority', e.target.value)}>
              {withCurrent(PRIORITIES, v.priority).map(p => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Project type">
            <select className="mac-select" value={v.projectType} onChange={e => set('projectType', e.target.value)}>
              {withCurrent(PROJECT_TYPES, v.projectType).map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Source">
            <select className="mac-select" value={v.source} onChange={e => set('source', e.target.value)}>
              {withCurrent(SOURCES, v.source).map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Proposal value (₹)">
            <NumInput className="mac-input" value={v.proposalValue} onChange={val => set('proposalValue', val)} placeholder="0" />
          </Field>
          <Field label="Next follow-up">
            <input className="mac-input" type="date" value={v.nextFollowup} onChange={e => set('nextFollowup', e.target.value)} />
          </Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Optional">
        <FormGrid>
          <Field label="Final price (₹)" hint="Fill in once the deal is agreed">
            <NumInput className="mac-input" value={v.finalPrice} onChange={val => set('finalPrice', val)} placeholder="0" />
          </Field>
          <Field label="Address">
            <input className="mac-input" value={v.address} onChange={e => set('address', e.target.value)} placeholder="City, State" />
          </Field>
          {isEdit && (
            <Field label="Created by">
              <select className="mac-select" value={v.createdBy} onChange={e => set('createdBy', e.target.value)}>
                {!v.createdBy && <option value="">—</option>}
                {withCurrent(partners, v.createdBy).map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>
          )}
        </FormGrid>
      </FormSection>
    </>
  );
}

// Inline "what happened + when next" form at the top of the drawer
function FollowupBox({ client, today, onSave }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today);
  const [next, setNext] = useState(isClosed(client) ? '' : addDays(today, 3));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    if (!note.trim()) { setError('Write what was discussed'); return; }
    setError('');
    setSaving(true);
    try {
      await onSave({ date: date || today, remark: note.trim(), nextFollowup: next });
      toast.success(next ? `Follow-up logged — next on ${fmtDate(next)}` : 'Follow-up logged');
      setNote('');
    } catch (err) {
      toast.error('Could not log the follow-up', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="crm-log" onSubmit={submit} noValidate>
      <h3 className="section-title">Log follow-up</h3>
      <Field label="What was discussed?" required error={error}>
        <textarea className="mac-input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Shared the proposal, wants a call on Friday" />
      </Field>
      <FormGrid>
        <Field label="Contacted on">
          <input className="mac-input" type="date" value={date} max={today} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label="Next follow-up" hint="Leave empty if none is needed">
          <input className="mac-input" type="date" value={next} onChange={e => setNext(e.target.value)} />
        </Field>
      </FormGrid>
      <div className="crm-log-foot">
        <div className="crm-presets" role="group" aria-label="Next follow-up shortcuts">
          {NEXT_PRESETS.map(([label, days]) => {
            const value = addDays(today, days);
            return <button key={label} type="button" className={next === value ? 'active' : ''} onClick={() => setNext(value)}>{label}</button>;
          })}
          <button type="button" className={!next ? 'active' : ''} onClick={() => setNext('')}>None</button>
        </div>
        <button type="submit" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save follow-up'}</button>
      </div>
    </form>
  );
}

function ClientDetail({ client, today, onStatus, onLogFollowup }) {
  const history = [...(client.followupHistory || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return (
    <>
      {(client.contact || client.email) && (
        <div className="crm-quick">
          {client.contact && <a className="mac-btn mac-btn-secondary" href={telHref(client.contact)}><Phone size={15} /> Call {client.contact}</a>}
          {client.email && <a className="mac-btn mac-btn-secondary" href={`mailto:${client.email}`}><Mail size={15} /> Email</a>}
        </div>
      )}

      <div className="crm-status-row">
        <Field label="Status">
          <select className="mac-select" value={client.status || ''} onChange={e => onStatus(client, e.target.value)}>
            {withCurrent(CLIENT_STATUSES, client.status).map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <div className={`crm-next ${dueState(client, today)}`}>
          Next follow-up
          <strong>{dueLabel(client, today)}</strong>
        </div>
      </div>

      <FollowupBox client={client} today={today} onSave={entry => onLogFollowup(client, entry)} />

      <section className="crm-section">
        <h3 className="section-title">Follow-up history</h3>
        {history.length === 0
          ? <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Nothing logged yet. The first follow-up you save will show here.</p>
          : (
            <ol className="crm-timeline">
              {history.map((h, i) => (
                <li key={`${h.date}-${i}`}>
                  <div className="crm-timeline-when">{fmtDate(h.date)}{h.by ? ` · ${h.by}` : ''}</div>
                  <div className="crm-timeline-text">{h.remark || h.note || '—'}</div>
                  {h.nextFollowup && <div className="crm-timeline-next">Next follow-up set for {fmtDate(h.nextFollowup)}</div>}
                </li>
              ))}
            </ol>
          )}
      </section>

      <section className="crm-section">
        <h3 className="section-title">Details</h3>
        <dl className="kv">
          <dt>Phone</dt><dd>{client.contact ? <a className="crm-link" href={telHref(client.contact)}>{client.contact}</a> : '—'}</dd>
          <dt>Email</dt><dd>{client.email ? <a className="crm-link" href={`mailto:${client.email}`}>{client.email}</a> : '—'}</dd>
          <dt>Company</dt><dd>{client.companyName || '—'}</dd>
          <dt>Address</dt><dd>{client.address || '—'}</dd>
          <dt>Project type</dt><dd>{client.projectType || '—'}</dd>
          <dt>Source</dt><dd>{client.source || '—'}</dd>
          <dt>Priority</dt><dd>{client.priority ? <Badge color={getStatusColor(client.priority)}>{client.priority}</Badge> : '—'}</dd>
          <dt>Proposal value</dt><dd>{client.proposalValue ? fmtMoney(client.proposalValue) : '—'}</dd>
          <dt>Final price</dt><dd>{client.finalPrice ? fmtMoney(client.finalPrice) : '—'}</dd>
          <dt>Last contacted</dt><dd>{fmtDate(client.lastContacted)}</dd>
          <dt>Added</dt><dd>{fmtDate(client.createdDate)}{client.createdBy ? ` by ${client.createdBy}` : ''}</dd>
        </dl>
      </section>
    </>
  );
}

function AuditList({ entries, failed }) {
  if (entries.length === 0) {
    return <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>{failed ? 'The change history could not be loaded.' : 'No changes recorded yet.'}</p>;
  }
  return (
    <>
      {failed && <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Earlier history could not be loaded; showing changes from this session only.</p>}
      <ul className="crm-audit">
        {entries.map(e => (
          <li key={e.id}>
            <Badge color={e.action === 'Deleted' ? 'red' : e.action === 'Created' ? 'green' : 'blue'}>{e.action}</Badge>
            <div className="crm-audit-main">
              <div className="cell-main">{e.description || '—'}</div>
              <div className="cell-sub">by {e.by || '—'}</div>
            </div>
            <span className="crm-audit-when">
              {fmtDate(e.createdAt)}{e.createdAt ? `, ${new Date(e.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function CRM() {
  const { user, displayName } = useAuth();
  const currentUser = displayName || user?.email || 'Unknown';
  // `createdBy` is a display name; the choices are the partners in the people directory
  const { people: directory } = usePeople();
  const partners = useMemo(() => directory.filter(p => p.kind === 'partner' && p.active !== false).map(p => p.name), [directory]);
  const toast = useToast();
  const today = todayLocal();

  const [clients, setClients] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [auditFailed, setAuditFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [due, setDue] = useState('');            // '' | 'overdue' | 'today' (set from the stat tiles)
  const [priority, setPriority] = useState('');
  const [source, setSource] = useState('');

  const [detailId, setDetailId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyClient);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [auditFor, setAuditFor] = useState(null); // null | 'all' | client id

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [clientData, auditData] = await Promise.all([
        clientsDB.getAll(),
        auditDB.getAll('client').catch(err => { console.error(err); return null; }),
      ]);
      setClients(clientData);
      setAuditLog(auditData || []);
      setAuditFailed(!auditData);
    } catch (err) {
      console.error(err);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isOldClosed = useCallback(c => {
    const ref = c.lastContacted || c.createdDate;
    return isClosed(c) && !!ref && ref < addDays(today, -HIDE_CLOSED_AFTER_DAYS);
  }, [today]);

  const stats = useMemo(() => {
    const open = clients.filter(c => !isClosed(c));
    const counts = { all: clients.filter(c => !isOldClosed(c)).length };
    clients.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
    return {
      counts,
      open: open.length,
      overdue: open.filter(c => isOverdue(c, today)).length,
      dueToday: open.filter(c => isDueToday(c, today)).length,
      hot: counts.Hot || 0,
      pipeline: open.reduce((sum, c) => sum + (Number(c.proposalValue) || 0), 0),
      oldClosed: clients.filter(isOldClosed).length,
    };
  }, [clients, today, isOldClosed]);

  const q = search.trim().toLowerCase();
  // Old closed deals stay out of the plain "All" view only; Won/Lost, a search or any tile shows them.
  const hidesOldClosed = status === 'all' && !q && !due;

  const visible = useMemo(() => {
    const rank = c => (isOverdue(c, today) ? 0 : !isClosed(c) && c.nextFollowup ? 1 : 2);
    return clients
      .filter(c => {
        if (hidesOldClosed && isOldClosed(c)) return false;
        if (q && ![c.clientName, c.companyName, c.email, c.contact].some(v => v && String(v).toLowerCase().includes(q))) return false;
        if (status !== 'all' && c.status !== status) return false;
        if (due === 'overdue' && !isOverdue(c, today)) return false;
        if (due === 'today' && !isDueToday(c, today)) return false;
        if (priority && c.priority !== priority) return false;
        if (source && c.source !== source) return false;
        return true;
      })
      .sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        if (ra !== rb) return ra - rb;
        if (ra < 2) return a.nextFollowup.localeCompare(b.nextFollowup);
        return String(b.createdDate || '').localeCompare(String(a.createdDate || ''));
      });
  }, [clients, q, status, due, priority, source, today, hidesOldClosed, isOldClosed]);

  const isFiltered = !!q || status !== 'all' || !!due || !!priority || !!source;
  const clearFilters = () => { setSearch(''); setStatus('all'); setDue(''); setPriority(''); setSource(''); };
  const detail = detailId ? clients.find(c => c.id === detailId) : null;

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => (e[k] ? { ...e, [k]: undefined } : e)); };
  function openAdd() { setForm(emptyClient); setEditId(null); setErrors({}); setFormOpen(true); }
  function openEdit(c) {
    const filled = { ...emptyClient, ...c };
    Object.keys(emptyClient).forEach(k => { if (filled[k] == null) filled[k] = emptyClient[k]; });
    setForm(filled); setEditId(c.id); setErrors({}); setFormOpen(true);
  }
  function closeForm() { setFormOpen(false); setEditId(null); }

  async function recordAudit(entityId, action, description) {
    const entry = { entity: 'client', entityId, action, description };   // the server stamps who did it
    setAuditLog(l => [{ ...entry, by: currentUser, id: `local-${Date.now()}`, createdAt: new Date().toISOString() }, ...l]);
    try { await auditDB.log(entry); } catch (err) { console.error(err); }
  }

  async function saveClient(e) {
    e.preventDefault();
    if (saving) return;
    const found = validateClient(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      if (editId) {
        const updated = await clientsDB.update(editId, form);
        setClients(cs => cs.map(c => (c.id === editId ? updated : c)));
        recordAudit(editId, 'Edited', form.clientName);
        toast.success('Client updated');
      } else {
        const created = await clientsDB.create({ ...form, createdBy: currentUser, createdDate: today, lastContacted: today });
        setClients(cs => [created, ...cs]);
        recordAudit(created.id, 'Created', created.clientName);
        toast.success('Client added');
      }
      closeForm();
    } catch (err) {
      toast.error('Could not save the client', err);
    } finally {
      setSaving(false);
    }
  }

  // The row is only removed (and the audit entry written) once the delete really succeeded.
  async function deleteClient(c) {
    const wasOpen = detailId === c.id;
    if (wasOpen) setDetailId(null);
    try {
      await clientsDB.delete(c.id);
    } catch (err) {
      if (wasOpen) setDetailId(c.id);
      toast.error(`Could not delete ${c.clientName}`, err);
      return;
    }
    setClients(cs => cs.filter(x => x.id !== c.id));
    recordAudit(c.id, 'Deleted', c.clientName);
    toast.success(`${c.clientName} deleted`);
  }

  async function updateStatus(c, next) {
    if (next === c.status) return;
    const prev = c.status;
    setClients(cs => cs.map(x => (x.id === c.id ? { ...x, status: next } : x)));
    try {
      const updated = await clientsDB.updateStatus(c.id, next);
      if (updated?.id) setClients(cs => cs.map(x => (x.id === c.id ? updated : x)));
      toast.success(`${c.clientName} marked ${next}`);
    } catch (err) {
      setClients(cs => cs.map(x => (x.id === c.id ? { ...x, status: prev } : x)));
      toast.error('Could not change the status', err);
    }
  }

  // Throws on failure so the inline form keeps the note and shows the toast.
  async function logFollowup(c, entry) {
    // one call: the server adds the entry (stamping who and when) and moves the follow-up dates
    const updated = await clientsDB.addFollowup(c.id, entry);
    setClients(cs => cs.map(x => (x.id === c.id ? updated : x)));
  }

  const toggleDue = v => { setDue(d => (d === v ? '' : v)); setStatus('all'); };
  const tiles = [
    { label: 'Overdue follow-ups', value: stats.overdue, icon: AlertCircle, tone: due === 'overdue' ? 'dark' : 'bad', sub: due === 'overdue' ? 'Showing these' : 'Tap to see who', onClick: () => toggleDue('overdue') },
    { label: 'Due today', value: stats.dueToday, icon: CalendarClock, tone: due === 'today' ? 'dark' : 'warn', sub: due === 'today' ? 'Showing these' : 'Tap to see who', onClick: () => toggleDue('today') },
    { label: 'Hot leads', value: stats.hot, icon: Flame, tone: status === 'Hot' && !due ? 'dark' : 'brand', sub: status === 'Hot' && !due ? 'Showing these' : 'Tap to see who', onClick: () => { setDue(''); setStatus(s => (s === 'Hot' ? 'all' : 'Hot')); } },
    { label: 'Open pipeline', value: fmtMoney(stats.pipeline), icon: IndianRupee, sub: `${stats.open} open client${stats.open === 1 ? '' : 's'}` },
  ];

  const rowMenu = c => [
    { label: 'Edit', icon: Edit2, onClick: () => openEdit(c) },
    { label: 'Change history', icon: History, onClick: () => setAuditFor(c.id) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => setDeleteTarget(c) },
  ];
  const auditEntries = auditFor === 'all' ? auditLog : auditLog.filter(e => String(e.entityId) === String(auditFor));
  const auditClient = auditFor && auditFor !== 'all' ? clients.find(c => c.id === auditFor) : null;

  return (
    <div>
      <Header
        title="CRM"
        subtitle={loading || loadError ? 'Sales pipeline' : `${stats.open} open · ${stats.overdue} overdue · ${stats.dueToday} due today`}
        actions={
          <>
            <button className="mac-btn mac-btn-secondary" onClick={() => setAuditFor('all')}><History size={15} /> History</button>
            <button className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> Add client</button>
          </>
        }
      />

      <div className="page-body">
        {loading ? <SkeletonRows rows={8} /> : loadError ? <ErrorPanel title="Could not load your clients" error={loadError} onRetry={load} /> : clients.length === 0 ? (
          <EmptyPanel icon={Users} title="No clients yet" text="Add your first lead to start tracking follow-ups and proposals."
            action={<button className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> Add client</button>} />
        ) : (
          <>
            <StatTiles items={tiles} />

            <Chips label="Filter by status" value={status} onChange={v => { setStatus(v); setDue(''); }}
              options={STATUS_CHIPS.map(o => ({ ...o, count: stats.counts[o.value] || 0 }))} />

            <Toolbar search={search} onSearch={setSearch} placeholder="Search name, company, phone or email"
              right={<>
                <span>{isFiltered || hidesOldClosed ? `${visible.length} of ${clients.length}` : `${clients.length} clients`}</span>
                {isFiltered && <button className="mac-btn mac-btn-ghost" onClick={clearFilters}>Clear</button>}
              </>}>
              <select className="mac-select" aria-label="Priority" value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="">Any priority</option>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
              <select className="mac-select" aria-label="Source" value={source} onChange={e => setSource(e.target.value)}>
                <option value="">Any source</option>
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Toolbar>

            {visible.length === 0 ? (
              <EmptyPanel icon={SearchX} title="No clients match" text="Nothing fits the current search and filters."
                action={<button className="mac-btn mac-btn-secondary" onClick={clearFilters}>Clear filters</button>} />
            ) : (
              <>
                <div className="mac-card only-desktop">
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Client</th><th>Project</th><th>Status</th><th>Priority</th>
                          <th className="num">Proposal</th><th>Next follow-up</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map(c => (
                          <tr key={c.id} className="clickable" tabIndex={0} onClick={() => setDetailId(c.id)}
                            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setDetailId(c.id); } }}>
                            <td>
                              <div className="crm-client">
                                <Avatar name={c.clientName} />
                                <div>
                                  <div className="cell-main">{c.clientName}</div>
                                  <div className="cell-sub">{c.companyName || c.contact || '—'}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div>{c.projectType || '—'}</div>
                              <div className="cell-sub">{c.source || ''}</div>
                            </td>
                            <td><Badge color={getStatusColor(c.status)}>{c.status}</Badge></td>
                            <td><Badge color={getStatusColor(c.priority)}>{c.priority}</Badge></td>
                            <td className="num">{c.proposalValue ? fmtMoney(c.proposalValue) : '—'}</td>
                            <td><span className={`crm-due ${dueState(c, today)}`}>{dueLabel(c, today)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="list-cards only-mobile">
                  {visible.map(c => (
                    <div key={c.id} className="crm-card-row">
                      <button className="list-card" onClick={() => setDetailId(c.id)}>
                        <span className="crm-card-top">
                          <span className="cell-main">{c.clientName}</span>
                          <span className={`crm-due ${dueState(c, today)}`}>{dueLabel(c, today)}</span>
                        </span>
                        <span className="cell-sub">{[c.companyName, c.projectType].filter(Boolean).join(' · ') || '—'}</span>
                        <span className="crm-card-meta">
                          <Badge color={getStatusColor(c.status)}>{c.status}</Badge>
                          <Badge color={getStatusColor(c.priority)}>{c.priority}</Badge>
                          {!!c.proposalValue && <span className="cell-main">{fmtMoney(c.proposalValue)}</span>}
                        </span>
                      </button>
                      {c.contact && <a className="icon-btn crm-call" href={telHref(c.contact)} aria-label={`Call ${c.clientName}`}><Phone size={17} /></a>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {hidesOldClosed && stats.oldClosed > 0 && (
              <p className="crm-note">
                {stats.oldClosed} deal{stats.oldClosed === 1 ? '' : 's'} closed more than {HIDE_CLOSED_AFTER_DAYS} days ago {stats.oldClosed === 1 ? 'is' : 'are'} not listed here. See{' '}
                <button onClick={() => setStatus('Closed Won')}>Won</button> or <button onClick={() => setStatus('Closed Lost')}>Lost</button>, or search by name.
              </p>
            )}
          </>
        )}
      </div>

      <Drawer
        isOpen={!!detail && !formOpen && !deleteTarget && !auditFor}
        onClose={() => setDetailId(null)}
        title={detail?.clientName}
        subtitle={detail && ([detail.companyName, detail.projectType].filter(Boolean).join(' · ') || 'Client')}
        actions={detail && <RowMenu items={rowMenu(detail)} label="Client actions" />}
      >
        {detail && <ClientDetail key={detail.id} client={detail} today={today} onStatus={updateStatus} onLogFollowup={logFollowup} />}
      </Drawer>

      <Modal isOpen={formOpen} onClose={closeForm} title={editId ? 'Edit client' : 'Add client'} size="lg"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={closeForm}>Cancel</button>
          <button type="submit" form="crm-client-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Add client'}</button>
        </>}>
        <form id="crm-client-form" onSubmit={saveClient} noValidate>
          <ClientForm v={form} set={set} errors={errors} isEdit={!!editId} partners={partners} />
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteClient(deleteTarget)}
        title="Delete client" message={`This permanently deletes ${deleteTarget?.clientName || 'this client'} and all their follow-up history.`} />

      <Modal isOpen={!!auditFor} onClose={() => setAuditFor(null)} title={auditClient ? `Change history — ${auditClient.clientName}` : 'Change history'} size="md">
        <AuditList entries={auditEntries} failed={auditFailed} />
      </Modal>
    </div>
  );
}
