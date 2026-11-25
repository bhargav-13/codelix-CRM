// Client documents — every letter and agreement, kept under the client it belongs to.
import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import { Field, FormGrid, Toolbar, SkeletonRows, EmptyPanel, ErrorPanel, RowMenu, useToast, fmtDate } from '../components/ui/kit';
import { clientsDB, projectsDB } from '../lib/db';
import { uploadFile, fileUrl, MAX_FILE_BYTES } from '../lib/files';
import { documentsDB, DOC_TYPES, OTHER_TYPE, docTypeLabel, fmtFileSize } from '../lib/documents';
import { useMeSummary } from '../components/layout/shell';
import { Plus, FileText, FolderOpen, SearchX, ExternalLink, Download, Trash2, Info } from 'lucide-react';
import './Documents.css';

const TYPE_OPTIONS = [...DOC_TYPES, OTHER_TYPE];
const emptyForm = { client: '', type: DOC_TYPES[0].id, title: '', file: null };
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const docTitle = d => d.title || d.name || 'Document';

export default function Documents() {
  const toast = useToast();
  const me = useMeSummary();
  const [docs, setDocs] = useState([]);
  const [knownClients, setKnownClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState('');
  const [client, setClient] = useState('');
  const [type, setType] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // The client lists only feed the name suggestions: the page still works without them.
      const [list, crm, projects] = await Promise.all([
        documentsDB.list(),
        clientsDB.getAll().catch(() => []),
        projectsDB.getAll().catch(() => []),
      ]);
      setDocs(list);
      setKnownClients([...crm.map(c => c.clientName || c.name || c.companyName), ...projects.map(p => p.clientName)]);
    } catch (err) {
      console.error(err);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Every client name we know, once each (the first spelling wins), A to Z
  const clientNames = useMemo(() => {
    const seen = new Map();
    [...docs.map(d => d.client), ...knownClients].forEach(n => {
      const name = String(n || '').trim();
      if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
    });
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [docs, knownClients]);

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => docs.filter(d => {
    if (client && !sameName(d.client, client)) return false;
    if (type && (d.type || OTHER_TYPE.id) !== type) return false;
    if (q && ![d.client, d.title, d.name, docTypeLabel(d.type)].some(v => v && String(v).toLowerCase().includes(q))) return false;
    return true;
  }), [docs, client, type, q]);

  // One group per client, newest document first
  const groups = useMemo(() => {
    const by = new Map();
    visible.forEach(d => {
      const key = String(d.client || '').trim().toLowerCase();
      if (!by.has(key)) by.set(key, { client: d.client, items: [] });
      by.get(key).items.push(d);
    });
    return [...by.values()]
      .map(g => ({ ...g, items: [...g.items].sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''))) }))
      .sort((a, b) => String(a.client).localeCompare(String(b.client)));
  }, [visible]);

  const isFiltered = !!q || !!client || !!type;
  const clearFilters = () => { setSearch(''); setClient(''); setType(''); };
  const clientCount = new Set(docs.map(d => String(d.client || '').trim().toLowerCase())).size;

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => (e[k] ? { ...e, [k]: undefined } : e)); };
  const openAdd = (forClient = '') => { setForm({ ...emptyForm, client: forClient || client }); setErrors({}); setFormOpen(true); };
  const closeForm = () => { if (!saving) setFormOpen(false); };

  async function save(e) {
    e.preventDefault();
    if (saving) return;
    const found = {};
    const name = form.client.trim();
    if (!name) found.client = 'Choose or type the client';
    if (!form.file) found.file = 'Choose the file to upload';
    else if (form.file.size > MAX_FILE_BYTES) found.file = 'This file is over 20 MB';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const stored = await uploadFile(form.file);
      const doc = {
        id: stored.id,
        client: clientNames.find(n => sameName(n, name)) || name,   // keep one spelling per client
        type: form.type,
        title: form.title.trim() || null,
        name: stored.name, size: stored.size, contentType: stored.type,
        uploadedAt: new Date().toISOString(), uploadedBy: me.name,
      };
      setDocs(await documentsDB.add(doc));
      setFormOpen(false);
      toast.success('Document saved');
    } catch (err) {
      toast.error('Could not save the document', err);
    } finally {
      setSaving(false);
    }
  }

  // The tab is opened first (inside the click) so the browser does not block it, then pointed at the file.
  async function open(d, inline) {
    const tab = inline ? window.open('', '_blank') : null;
    try {
      const url = await fileUrl(d.id, { inline });
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      tab?.close();
      toast.error(`Could not open ${docTitle(d)}`, err);
    }
  }

  async function del(d) {
    try {
      setDocs(await documentsDB.remove(d.id));
      toast.success(`${docTitle(d)} deleted`);
    } catch (err) {
      toast.error(`Could not delete ${docTitle(d)}`, err);
    }
  }

  const rowMenu = d => [
    { label: 'Open', icon: ExternalLink, onClick: () => open(d, true) },
    { label: 'Download', icon: Download, onClick: () => open(d, false) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => setDeleteTarget(d) },
  ];
  const addButton = <button className="mac-btn mac-btn-primary" onClick={() => openAdd()}><Plus size={15} /> Upload document</button>;

  return (
    <div>
      <Header
        title="Client documents"
        subtitle={loading || loadError ? 'Letters and agreements, by client'
          : `${docs.length} document${docs.length === 1 ? '' : 's'} · ${clientCount} client${clientCount === 1 ? '' : 's'}`}
        actions={addButton}
      />

      <div className="page-body">
        {loading ? <SkeletonRows rows={6} /> : loadError ? <ErrorPanel title="Could not load client documents" error={loadError} onRetry={load} /> : docs.length === 0 ? (
          <EmptyPanel icon={FolderOpen} title="No documents yet"
            text="Upload each client's proposal, SOW, NDA and other letters here, so everything for a client is in one place."
            action={addButton} />
        ) : (
          <>
            <Toolbar search={search} onSearch={setSearch} placeholder="Search client, document or file name"
              right={<>
                <span>{isFiltered ? `${visible.length} of ${docs.length}` : `${docs.length} document${docs.length === 1 ? '' : 's'}`}</span>
                {isFiltered && <button className="mac-btn mac-btn-ghost" onClick={clearFilters}>Clear</button>}
              </>}>
              <select className="mac-select" aria-label="Client" value={client} onChange={e => setClient(e.target.value)}>
                <option value="">All clients</option>
                {clientNames.filter(n => docs.some(d => sameName(d.client, n))).map(n => <option key={n}>{n}</option>)}
              </select>
              <select className="mac-select" aria-label="Document type" value={type} onChange={e => setType(e.target.value)}>
                <option value="">Any type</option>
                {TYPE_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Toolbar>

            {groups.length === 0 ? (
              <EmptyPanel icon={SearchX} title="No documents match" text="Nothing fits the current search and filters."
                action={<button className="mac-btn mac-btn-secondary" onClick={clearFilters}>Clear filters</button>} />
            ) : (
              <div className="doc-clients">
                {groups.map(g => (
                  <section key={g.client} className="mac-card" aria-label={`Documents for ${g.client}`}>
                    <div className="doc-client-head">
                      <span className="doc-client-name">{g.client}</span>
                      <span className="doc-client-count">{g.items.length} document{g.items.length === 1 ? '' : 's'}</span>
                      <button className="mac-btn mac-btn-secondary" onClick={() => openAdd(g.client)}><Plus size={14} /> Add</button>
                    </div>
                    {g.items.map(d => (
                      <div key={d.id} className="doc-row">
                        <span className="doc-row-icon"><FileText size={18} aria-hidden="true" /></span>
                        <span className="doc-row-main">
                          <button type="button" className="doc-row-title" onClick={() => open(d, true)} title="Open">{docTitle(d)}</button>
                          <span className="doc-row-sub">
                            {[d.title ? d.name : null, fmtFileSize(d.size), d.uploadedAt ? fmtDate(d.uploadedAt.slice(0, 10)) : null, d.uploadedBy].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="doc-row-type"><Badge color={d.type && d.type !== OTHER_TYPE.id ? 'blue' : 'gray'}>{docTypeLabel(d.type)}</Badge></span>
                        <RowMenu items={rowMenu(d)} label={`Actions for ${docTitle(d)}`} />
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Modal isOpen={formOpen} onClose={closeForm} title="Upload document"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={closeForm} disabled={saving}>Cancel</button>
          <button type="submit" form="client-doc-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Uploading…' : 'Upload'}</button>
        </>}>
        <form id="client-doc-form" onSubmit={save} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormGrid>
            <Field label="Client" required error={errors.client} hint="Pick a client or type a new name">
              {id => <>
                <input id={id} className="mac-input" list="client-doc-names" value={form.client} onChange={e => set('client', e.target.value)} placeholder="Client name" autoComplete="off" />
                <datalist id="client-doc-names">{clientNames.map(n => <option key={n} value={n} />)}</datalist>
              </>}
            </Field>
            <Field label="Document type">
              {id => <select id={id} className="mac-select" value={form.type} onChange={e => set('type', e.target.value)}>
                {TYPE_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>}
            </Field>
          </FormGrid>
          <Field label="Title" hint="Optional. Left empty, the file name is shown.">
            {id => <input id={id} className="mac-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Proposal v2, signed" maxLength={120} />}
          </Field>
          <Field label="File" required error={errors.file} hint="PDF, Word or an image, up to 20 MB">
            {id => <span className="doc-file">
              <input id={id} type="file" onChange={e => set('file', e.target.files?.[0] || null)} />
              {form.file && <span className="field-hint">{form.file.name} · {fmtFileSize(form.file.size)}</span>}
            </span>}
          </Field>
          <div className="doc-note"><Info size={14} aria-hidden="true" /><span>Only partners can see, open or delete client documents.</span></div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => del(deleteTarget)}
        title="Delete document" message={`This permanently deletes ${deleteTarget ? docTitle(deleteTarget) : 'this document'} for ${deleteTarget?.client || 'this client'}. It cannot be undone.`} />
    </div>
  );
}
