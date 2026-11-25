import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import {
  Field, FormGrid, FormSection, Toolbar, SkeletonRows, EmptyPanel, ErrorPanel, RowMenu, Avatar, useToast,
} from '../components/ui/kit';
import { credentialsDB } from '../lib/db';
import { Plus, Edit2, Trash2, Eye, EyeOff, Copy, KeyRound, Lock, ChevronDown, ChevronRight, SearchX } from 'lucide-react';
import './Credentials.css';

const CRED_TYPES = ['Hosting', 'Database', 'App Store', 'Tool', 'FTP', 'Email', 'API Key', 'Other'];
const NO_CLIENT = 'Internal';
const REVEAL_MS = 30_000;
const CLIPBOARD_CLEAR_MS = 60_000;
const MASK = '••••••••••';

const emptyCred = { clientName: '', projectName: '', type: 'Hosting', platform: '', url: '', username: '', password: '', notes: '' };

const withCurrent = (list, v) => (v && !list.includes(v) ? [...list, v] : list);
const webHref = u => (/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`);
const shortUrl = u => u.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');

// Best effort: wipe the clipboard later, but only if it still holds what we put there.
function clearClipboardLater(value) {
  setTimeout(async () => {
    try {
      if ((await navigator.clipboard.readText()) === value) await navigator.clipboard.writeText('');
    } catch { /* clipboard not readable (permission, tab not focused) — nothing more we can do */ }
  }, CLIPBOARD_CLEAR_MS);
}

function validate(v) {
  const errors = {};
  if (!v.platform.trim()) errors.platform = 'Say what this login is for';
  if (!v.username.trim()) errors.username = 'Enter the username or login email';
  return errors;
}

function CredForm({ v, set, errors, editing }) {
  const [showPw, setShowPw] = useState(false);
  return (
    <div className="cred-form">
      <FormSection title="Login">
        <FormGrid>
          <Field label="Platform" required error={errors.platform}>
            <input className="mac-input" autoComplete="off" value={v.platform} onChange={e => set('platform', e.target.value)} placeholder="e.g. cPanel, Play Console" />
          </Field>
          <Field label="Type">
            <select className="mac-select" value={v.type} onChange={e => set('type', e.target.value)}>
              {withCurrent(CRED_TYPES, v.type).map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Username / email" required error={errors.username}>
            <input className="mac-input" autoComplete="off" autoCapitalize="none" spellCheck={false} value={v.username} onChange={e => set('username', e.target.value)} placeholder="Login username" />
          </Field>
          <Field label="Password">
            {id => (
              <div className="cred-pass">
                <input id={id} className="mac-input" type={showPw ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false}
                  value={v.password} onChange={e => set('password', e.target.value)} placeholder={editing ? 'Leave blank to keep the current password' : 'Password or key'} />
                <button type="button" className="icon-btn plain" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            )}
          </Field>
          <Field label="Login URL" span={2}>
            <input className="mac-input" type="url" inputMode="url" autoComplete="off" value={v.url} onChange={e => set('url', e.target.value)} placeholder="https://…" />
          </Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Belongs to (optional)">
        <FormGrid>
          <Field label="Client" hint={`Leave empty to file it under “${NO_CLIENT}”`}>
            <input className="mac-input" autoComplete="off" value={v.clientName} onChange={e => set('clientName', e.target.value)} placeholder="Client name" />
          </Field>
          <Field label="Project">
            <input className="mac-input" autoComplete="off" value={v.projectName} onChange={e => set('projectName', e.target.value)} placeholder="Related project" />
          </Field>
          <Field label="Notes" span={2}>
            <textarea className="mac-input" autoComplete="off" value={v.notes} onChange={e => set('notes', e.target.value)} placeholder="2FA owner, renewal date, anything the next person needs" />
          </Field>
        </FormGrid>
      </FormSection>
    </div>
  );
}

function CredRow({ cred, revealed, password, busy, notesOpen, onReveal, onCopy, onCopyPassword, onToggleNotes, menu }) {
  return (
    <li className="cred-row">
      <div className="cred-what">
        <div className="cred-what-top">
          <span className="cell-main">{cred.platform}</span>
          {cred.type && <Badge color="gray">{cred.type}</Badge>}
        </div>
        <div className="cell-sub">
          {cred.projectName}{cred.projectName && cred.url ? ' · ' : ''}
          {cred.url && <a className="cred-link" href={webHref(cred.url)} target="_blank" rel="noopener noreferrer">{shortUrl(cred.url)}</a>}
          {!cred.projectName && !cred.url && '—'}
        </div>
      </div>

      <div className="cred-secret">
        <span className="cred-secret-text">
          <span className="cred-secret-label">Username</span>
          <span className="cred-secret-value" title={cred.username}>{cred.username || '—'}</span>
        </span>
        {cred.username && <button className="icon-btn plain" onClick={() => onCopy(cred.username, false)} aria-label={`Copy username for ${cred.platform}`}><Copy size={15} /></button>}
      </div>

      <div className="cred-secret">
        <span className="cred-secret-text">
          <span className="cred-secret-label">Password{revealed ? ' · hides in 30s' : ''}</span>
          <span className={`cred-secret-value is-secret ${revealed ? 'is-shown' : ''}`}>{!cred.hasPassword ? '—' : revealed ? password : MASK}</span>
        </span>
        {cred.hasPassword && (
          <>
            <button className="icon-btn plain" onClick={onReveal} disabled={busy} aria-pressed={revealed} aria-label={`${revealed ? 'Hide' : 'Reveal'} password for ${cred.platform}`}>
              {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button className="icon-btn plain" onClick={onCopyPassword} disabled={busy} aria-label={`Copy password for ${cred.platform}`}><Copy size={15} /></button>
          </>
        )}
      </div>

      <div className="cred-end">
        {cred.notes && (
          <button className="cred-notes-toggle" onClick={onToggleNotes} aria-expanded={notesOpen}>
            Notes {notesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        <RowMenu items={menu} label={`Actions for ${cred.platform}`} />
      </div>

      {cred.notes && notesOpen && <div className="cred-notes">{cred.notes}</div>}
    </li>
  );
}

export default function Credentials() {
  const toast = useToast();
  const [creds, setCreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [openNotes, setOpenNotes] = useState(() => new Set());
  // The list never holds passwords: one is fetched when Reveal or Copy is pressed.
  const [revealed, setRevealed] = useState(null);     // { id, password } — the one password on screen
  const [fetchingId, setFetchingId] = useState(null);
  const revealedId = revealed?.id ?? null;
  const setRevealedId = () => setRevealed(null);      // every caller hides

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyCred);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setCreds(await credentialsDB.getAll());
    } catch (err) {
      console.error(err);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A revealed password hides itself after 30 seconds, or as soon as the tab is hidden.
  useEffect(() => {
    if (!revealedId) return undefined;
    const hide = () => setRevealed(null);
    const timer = setTimeout(hide, REVEAL_MS);
    const onVisibility = () => { if (document.hidden) hide(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [revealedId]);

  const typeOptions = useMemo(() => creds.reduce((list, c) => withCurrent(list, c.type), CRED_TYPES), [creds]);

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => creds.filter(c => {
    if (q && ![c.clientName || NO_CLIENT, c.platform, c.username, c.projectName].some(v => v && String(v).toLowerCase().includes(q))) return false;
    if (type && c.type !== type) return false;
    return true;
  }), [creds, q, type]);

  const groups = useMemo(() => {
    const map = new Map();
    visible.forEach(c => {
      const name = c.clientName?.trim() || NO_CLIENT;
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(c);
    });
    return [...map.entries()].sort(([a], [b]) => (a === NO_CLIENT) - (b === NO_CLIENT) || a.localeCompare(b));
  }, [visible]);

  const clientCount = useMemo(() => new Set(creds.map(c => c.clientName?.trim() || NO_CLIENT)).size, [creds]);
  const isFiltered = !!q || !!type;
  const clearFilters = () => { setSearch(''); setType(''); };
  // While searching every matching group is open, so results are never hidden inside a collapsed client.
  const isOpen = name => !!q || !collapsed.has(name);
  const allCollapsed = groups.length > 0 && groups.every(([name]) => collapsed.has(name));

  function toggleGroup(name) {
    setCollapsed(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; });
    setRevealedId(null);
  }
  function toggleAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(groups.map(([name]) => name)));
    setRevealedId(null);
  }
  function toggleNotes(id) {
    setOpenNotes(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function fetchPassword(c) {
    setFetchingId(c.id);
    try { return await credentialsDB.password(c.id); }
    finally { setFetchingId(id => (id === c.id ? null : id)); }
  }
  async function toggleReveal(c) {
    if (revealedId === c.id) { setRevealed(null); return; }
    setRevealed(null);
    try { setRevealed({ id: c.id, password: await fetchPassword(c) }); }
    catch (err) { toast.error(`Could not get the password for ${c.platform}`, err); }
  }
  async function copyPassword(c) {
    let value;
    try { value = revealedId === c.id ? revealed.password : await fetchPassword(c); }
    catch (err) { toast.error(`Could not get the password for ${c.platform}`, err); return; }
    await copyValue(value, true);
  }

  async function copyValue(value, secret) {
    try {
      await navigator.clipboard.writeText(value);
    } catch (err) {
      toast.error(`Could not copy the ${secret ? 'password' : 'username'}`, err);
      return;
    }
    if (secret) {
      clearClipboardLater(value);
      toast.success('Password copied. The clipboard is cleared after 60 seconds where the browser allows it.');
    } else {
      toast.success('Username copied');
    }
  }

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => (e[k] ? { ...e, [k]: undefined } : e)); };
  function openAdd() { setForm(emptyCred); setEditId(null); setErrors({}); setRevealedId(null); setFormOpen(true); }
  function openEdit(c) {
    // the password field starts empty: blank = keep the stored one
    const filled = { ...emptyCred, ...c, password: '' };
    Object.keys(emptyCred).forEach(k => { if (filled[k] == null) filled[k] = emptyCred[k]; });
    setForm(filled); setEditId(c.id); setErrors({}); setRevealedId(null); setFormOpen(true);
  }
  function closeForm() { setFormOpen(false); setEditId(null); setForm(emptyCred); }

  async function save(e) {
    e.preventDefault();
    if (saving) return;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      if (editId) {
        const updated = await credentialsDB.update(editId, form);
        setCreds(cs => cs.map(c => (c.id === editId ? updated : c)));
        toast.success('Credential updated');
      } else {
        const created = await credentialsDB.create(form);
        setCreds(cs => [created, ...cs]);
        toast.success('Credential saved');
      }
      closeForm();
    } catch (err) {
      toast.error('Could not save the credential', err);
    } finally {
      setSaving(false);
    }
  }

  // The entry is only removed once the delete really succeeded.
  async function del(c) {
    try {
      await credentialsDB.delete(c.id);
    } catch (err) {
      toast.error(`Could not delete the ${c.platform} login`, err);
      return;
    }
    setCreds(cs => cs.filter(x => x.id !== c.id));
    toast.success(`${c.platform} login deleted`);
  }

  return (
    <div>
      <Header
        title="Credentials"
        subtitle={loading || loadError ? 'Client logins vault'
          : `${creds.length} login${creds.length === 1 ? '' : 's'} · ${clientCount} client${clientCount === 1 ? '' : 's'}`}
        actions={<button className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> Add credential</button>}
      />

      <div className="page-body">
        {loading ? <SkeletonRows rows={6} /> : loadError ? <ErrorPanel title="Could not load credentials" error={loadError} onRetry={load} /> : creds.length === 0 ? (
          <EmptyPanel icon={KeyRound} title="No credentials saved yet" text="Store client hosting, store and tool logins here. Only partners can see them."
            action={<button className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> Add credential</button>} />
        ) : (
          <>
            <Toolbar search={search} onSearch={setSearch} placeholder="Search client, platform or username"
              right={<>
                <span>{isFiltered ? `${visible.length} of ${creds.length}` : `${creds.length} login${creds.length === 1 ? '' : 's'}`}</span>
                {isFiltered && <button className="mac-btn mac-btn-ghost" onClick={clearFilters}>Clear</button>}
                {!q && groups.length > 1 && <button className="mac-btn mac-btn-secondary" onClick={toggleAll}>{allCollapsed ? 'Expand all' : 'Collapse all'}</button>}
              </>}>
              <select className="mac-select" aria-label="Type" value={type} onChange={e => setType(e.target.value)}>
                <option value="">Any type</option>
                {typeOptions.map(t => <option key={t}>{t}</option>)}
              </select>
            </Toolbar>

            <p className="cred-note"><Lock size={14} aria-hidden="true" /> Only partners can see these entries. Passwords stay hidden until you reveal or copy one.</p>

            {groups.length === 0 ? (
              <EmptyPanel icon={SearchX} title="No credentials match" text="Nothing fits the current search and filter."
                action={<button className="mac-btn mac-btn-secondary" onClick={clearFilters}>Clear filters</button>} />
            ) : (
              <div className="cred-groups">
                {groups.map(([name, items]) => {
                  const open = isOpen(name);
                  return (
                    <section key={name} className="mac-card">
                      <button className="cred-group-head" onClick={() => toggleGroup(name)} aria-expanded={open} disabled={!!q}>
                        {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                        <Avatar name={name} size={28} />
                        <span className="cred-group-name">{name}</span>
                        <span className="cred-group-count">{items.length} login{items.length === 1 ? '' : 's'}</span>
                      </button>
                      {open && (
                        <ul className="cred-list">
                          {items.map(c => (
                            <CredRow key={c.id} cred={c}
                              revealed={revealedId === c.id} password={revealedId === c.id ? revealed.password : ''} busy={fetchingId === c.id}
                              notesOpen={openNotes.has(c.id)}
                              onReveal={() => toggleReveal(c)}
                              onCopy={copyValue} onCopyPassword={() => copyPassword(c)}
                              onToggleNotes={() => toggleNotes(c.id)}
                              menu={[
                                { label: 'Edit', icon: Edit2, onClick: () => openEdit(c) },
                                { label: 'Delete', icon: Trash2, danger: true, onClick: () => setDeleteTarget(c) },
                              ]}
                            />
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <Modal isOpen={formOpen} onClose={closeForm} title={editId ? 'Edit credential' : 'Add credential'} size="lg"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={closeForm}>Cancel</button>
          <button type="submit" form="credential-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Save credential'}</button>
        </>}>
        <form id="credential-form" onSubmit={save} autoComplete="off" noValidate>
          <CredForm v={form} set={set} errors={errors} />
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => del(deleteTarget)}
        title="Delete credential" message={`This permanently deletes the ${deleteTarget?.platform || ''} login${deleteTarget?.clientName ? ` for ${deleteTarget.clientName}` : ''}.`} />
    </div>
  );
}
