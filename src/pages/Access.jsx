import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Switch } from '../components/ui/Switch';
import { Avatar, Chips, Drawer, EmptyPanel, ErrorPanel, RowMenu, SkeletonRows, Toolbar, useToast } from '../components/ui/kit';
import { employeesDB, auditDB } from '../lib/db';
import { MODULES, TEMPLATES, normalizePerms, togglePerm, samePerms, matchTemplate, permSummary, accessDB } from '../lib/access';
import { useAuth } from '../contexts/AuthContext';
import './Access.css';
import { Trash2, KeyRound, Copy, CheckCheck, ShieldOff, History, Power, RefreshCw, AlertTriangle, SearchX, Users } from 'lucide-react';

const STATES = {
  active: { label: 'Active', tone: 'good' },
  reset: { label: 'Must change password', tone: 'warn' },
  none: { label: 'No login', tone: '' },
  off: { label: 'Deactivated', tone: 'bad' },
};

// Say what actually went wrong when a login could not be created, reset or removed
function loginServiceError(e, doing) {
  if (e?.status === 0) return `Could not ${doing}: the server cannot be reached. Check your connection and try again.`;
  if (e?.status === 403) return `Could not ${doing}: only people who manage access can do this.`;
  return `Could not ${doing}: ${e?.message || 'something went wrong'}`;
}

const fmtWhen = ts => (ts ? new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

function StateBadge({ state }) {
  const s = STATES[state] || STATES.none;
  return <span className={`badge acc-badge ${s.tone}`}>{s.label}</span>;
}

function HistoryRow({ h }) {
  return (
    <div className="acc-hrow">
      <div><strong>{h.action}</strong>{h.description ? ` — ${h.description}` : ''}<div className="faint">by {h.by || '—'}</div></div>
      <time>{fmtWhen(h.createdAt)}</time>
    </div>
  );
}

// "Users & Access" — only access admins (Bhargav, Manas) can open this page;
// the database refuses changes from anyone else as well.
export default function Access() {
  const { user, me, displayName, refreshMe } = useAuth();
  const toast = useToast();
  const currentUser = displayName || user?.email || 'Unknown';

  const [emps, setEmps] = useState([]);
  const [logins, setLogins] = useState([]);           // login rows from /access/logins (partners + employees)
  const [loginsError, setLoginsError] = useState('');
  const [audit, setAudit] = useState([]);
  const [phase, setPhase] = useState('loading');      // loading | ready | failed
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');        // all | login | nologin | inactive
  const [selKey, setSelKey] = useState(null);         // 'e:<employee id>' | 'p:<user id>'
  const [edit, setEdit] = useState(null);             // unsaved permissions; null = showing what is saved
  const [pickedTpl, setPickedTpl] = useState(null);   // remembers which template was chosen when two are identical
  const [busy, setBusy] = useState('');
  const [secret, setSecret] = useState(null);         // { empId, password, action } — shown once
  const [serviceError, setServiceError] = useState(null); // { empId, text }
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(null);       // { kind, emp } | { kind: 'admin' | 'requirepw', login, name, next }
  const [showAudit, setShowAudit] = useState(false);
  const hasData = useRef(false);
  const guard = useRef({});

  const loadLogins = useCallback(async () => {
    try { setLogins(await accessDB.listLogins()); setLoginsError(''); }
    catch (err) { console.error(err); setLoginsError(err.message || 'Check your connection and try again.'); }
  }, []);

  const fetchAll = useCallback(async () => {
    const [e, a] = await Promise.allSettled([
      employeesDB.getAll(),
      Promise.all([auditDB.getAll('access'), auditDB.getAll('employee')]).then(parts => parts.flat().sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))),
    ]);
    if (e.status === 'fulfilled') { setEmps(e.value); hasData.current = true; setLoadError(null); }
    else if (!hasData.current) { setLoadError(e.reason); setPhase('failed'); return; }
    if (a.status === 'fulfilled') setAudit(a.value);
    else console.error(a.reason);
    await loadLogins();
    setPhase('ready');
  }, [loadLogins]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── derived ─────────────────────────────────────────────────────
  const people = useMemo(() => {
    const byEmp = new Map(logins.filter(l => l.employeeId).map(l => [l.employeeId, l]));
    return [
      ...emps.map(e => {
        const login = byEmp.get(e.id) || null;
        return {
          key: `e:${e.id}`, kind: 'employee', emp: e, login, name: e.name || 'Unnamed', role: e.role || '—', email: e.email || '',
          state: e.status !== 'Active' ? 'off' : !login ? 'none' : login.mustChangePassword ? 'reset' : 'active',
          access: login ? permSummary(login.permissions) : 'No access',
        };
      }),
      ...logins.filter(l => l.role === 'partner').map(p => ({
        key: `p:${p.userId}`, kind: 'partner', login: p, name: p.displayName || p.email, role: p.isAccessAdmin ? 'Partner · manages access' : 'Partner', email: p.email || '',
        state: p.mustChangePassword ? 'reset' : 'active', access: 'Full access',
      })),
    ];
  }, [emps, logins]);

  const counts = useMemo(() => ({
    all: people.length,
    login: people.filter(p => p.login).length,
    nologin: people.filter(p => p.kind === 'employee' && !p.login).length,
    inactive: people.filter(p => p.state === 'off').length,
  }), [people]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter(p => {
      if (q && !`${p.name} ${p.email} ${p.role}`.toLowerCase().includes(q)) return false;
      if (filter === 'login') return !!p.login;
      if (filter === 'nologin') return p.kind === 'employee' && !p.login;
      if (filter === 'inactive') return p.state === 'off';
      return true;
    });
  }, [people, search, filter]);

  const sel = people.find(p => p.key === selKey) || null;
  const myId = me?.id ?? user?.id ?? null;
  const isMe = l => !!l && myId != null && String(l.userId) === String(myId);
  const emp = sel?.emp || null;
  const selLogin = emp ? sel.login : null;
  const savedPerms = useMemo(() => normalizePerms(selLogin?.permissions || {}), [selLogin]);
  const draft = edit ?? savedPerms;
  const dirty = !!selLogin && edit != null && !samePerms(edit, savedPerms);
  const shownSecret = emp && secret?.empId === emp.id ? secret : null;
  const shownError = emp && serviceError?.empId === emp.id ? serviceError.text : '';
  const picked = TEMPLATES.find(t => t.id === pickedTpl);
  const tpl = picked && samePerms(picked.perms, draft) ? picked.id : matchTemplate(draft);
  const selHistory = emp ? audit.filter(a => a.entityId === emp.id) : [];
  const filtering = !!search.trim() || filter !== 'all';

  // Esc and the close button reach this through a handler captured when the Drawer
  // opened, so it reads the latest state from a ref rather than from its closure.
  useEffect(() => { guard.current = { dirty, secret: !!shownSecret, confirm: !!confirm, emp }; });

  // ── actions ─────────────────────────────────────────────────────
  async function log(entityId, action, description, prevData, nextData) {
    try {
      await auditDB.log({ entity: 'access', entityId, action, description, prevData, nextData });   // the server stamps who did it
      setAudit(a => [{ id: Date.now(), entity: 'access', entityId, action, description, by: currentUser, prevData, nextData, createdAt: new Date().toISOString() }, ...a]);
    } catch (e) { console.error(e); }
  }

  function openPerson(key) { setSelKey(key); setEdit(null); setPickedTpl(null); setSecret(null); setServiceError(null); setCopied(false); }
  function closeDrawer() { setSelKey(null); setEdit(null); setPickedTpl(null); setSecret(null); setServiceError(null); setCopied(false); }
  function requestClose() {
    const g = guard.current;
    if (g.confirm) return;                               // the confirmation on top handles this Esc
    if (g.dirty) setConfirm({ kind: 'discard', emp: g.emp });
    else if (g.secret) setConfirm({ kind: 'secret', emp: g.emp });
    else closeDrawer();
  }

  async function savePerms() {
    if (!emp || !dirty) return;
    setBusy('save');
    try {
      const saved = await accessDB.setPermissions(selLogin?.userId, draft);
      setLogins(ls => ls.map(l => (l.employeeId === emp.id ? { ...l, permissions: saved } : l)));
      setEdit(null); setPickedTpl(null);
      toast.success(`Access saved — ${emp.name.split(' ')[0]} sees it on their next page load`);
      await log(emp.id, 'Access changed', `${emp.name}: ${permSummary(savedPerms)} → ${permSummary(saved)}`, savedPerms, saved);
    } catch (e) { toast.error('Could not save access', e); }
    setBusy('');
  }

  async function loginAction(e, existing) {
    const doing = existing ? 'reset the password' : 'create the login';
    setBusy('login'); setServiceError(null); setSecret(null); setCopied(false);
    try {
      const password = existing ? await accessDB.resetLogin(e.id) : await accessDB.createLogin(e.id);
      setSecret({ empId: e.id, password, action: existing ? 'reset' : 'created' });
      await log(e.id, existing ? 'Password reset' : 'Login created', e.name);
      await loadLogins();
    } catch (err) { console.error(err); setServiceError({ empId: e.id, text: loginServiceError(err, doing) }); }
    setBusy('');
  }

  async function revokeLogin(e) {
    setBusy('revoke'); setServiceError(null);
    try {
      await accessDB.revokeLogin(e.id);
      setLogins(ls => ls.filter(l => l.employeeId !== e.id));
      setEdit(null); setSecret(null);
      toast.success(`${e.name}'s login was revoked`);
      await log(e.id, 'Login revoked', e.name);
    } catch (err) { console.error(err); setServiceError({ empId: e.id, text: loginServiceError(err, 'revoke the login') }); await loadLogins(); }
    setBusy('');
  }

  // Only the status is sent: re-sending the whole employee record from this
  // page's copy could overwrite newer salary or bank details saved elsewhere.
  async function setStatus(e, next) {
    setBusy('status');
    try {
      const updated = await employeesDB.setStatus(e.id, next);
      setEmps(es => es.map(x => (x.id === e.id ? { ...x, ...(updated || {}), status: next } : x)));
      toast.success(next === 'Active' ? `${e.name} is active again` : `${e.name} was deactivated`);
      await log(e.id, next === 'Active' ? 'Activated' : 'Deactivated', `${e.name}${next === 'Inactive' ? ' — all access paused' : ''}`);
    } catch (err) { toast.error(`Could not ${next === 'Active' ? 'activate' : 'deactivate'} ${e.name}`, err); }
    setBusy('');
  }

  async function deleteEmployee(e, hadLogin) {
    setBusy('delete'); setServiceError(null);
    try {
      if (hadLogin) {
        try { await accessDB.revokeLogin(e.id); }
        catch (err) { console.error(err); setServiceError({ empId: e.id, text: `${loginServiceError(err, 'remove the login')} Nothing was deleted.` }); setBusy(''); return; }
        setLogins(ls => ls.filter(l => l.employeeId !== e.id));
      }
      await employeesDB.delete(e.id);
      setEmps(es => es.filter(x => x.id !== e.id));
      closeDrawer();
      toast.success(`${e.name} was deleted`);
      await log(e.id, 'Deleted', `${e.name} — record and login removed`);
    } catch (err) { toast.error(`Could not delete ${e.name}`, err); await fetchAll(); }
    setBusy('');
  }

  // Optimistic: the switch and the list badge flip at once, and flip back if the server refuses.
  async function setAccessAdmin(login, next) {
    const prev = !!login.isAccessAdmin;
    const patch = v => setLogins(ls => ls.map(l => (l.userId === login.userId ? { ...l, ...v } : l)));
    const who = login.displayName || login.email;
    setBusy('admin');
    patch({ isAccessAdmin: next });
    try {
      const row = await accessDB.setAccessAdmin(login.userId, next);
      if (row) patch({ ...row, isAccessAdmin: !!row.isAccessAdmin });
      toast.success(next ? `${who} can now manage user access` : `${who} no longer manages user access`);
      if (isMe(login)) refreshMe?.();                    // my own rights changed — re-read them
    } catch (err) {
      patch({ isAccessAdmin: prev });
      toast.error(`Could not change who manages access: ${err?.message || 'something went wrong'}`, err);
    }
    setBusy('');
  }

  async function requirePasswordChange(login, name) {
    setBusy('requirepw');
    try {
      await accessDB.requirePasswordChange(login.userId);
      setLogins(ls => ls.map(l => (l.userId === login.userId ? { ...l, mustChangePassword: true } : l)));
      toast.success(isMe(login) ? 'You must choose a new password — you will be signed out' : `${name} must choose a new password at the next sign-in`);
      if (login.employeeId) await log(login.employeeId, 'Password change required', name);
    } catch (err) { toast.error(`Could not require a new password: ${err?.message || 'something went wrong'}`, err); }
    setBusy('');
  }

  function toggleAccessAdmin(login, next) {
    if (!next || isMe(login)) setConfirm({ kind: 'admin', login, next, name: login.displayName || login.email });
    else setAccessAdmin(login, next);
  }

  async function copyPw() {
    try { await navigator.clipboard.writeText(shownSecret.password); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch (e) { toast.error('Could not copy — select the password and copy it by hand', e); }
  }

  function runConfirm() {
    const { kind, emp: e } = confirm;
    const hadLogin = logins.some(l => l.employeeId === e?.id);
    if (kind === 'admin') setAccessAdmin(confirm.login, confirm.next);
    else if (kind === 'requirepw') requirePasswordChange(confirm.login, confirm.name);
    else if (kind === 'create') loginAction(e, false);
    else if (kind === 'reset') loginAction(e, true);
    else if (kind === 'revoke') revokeLogin(e);
    else if (kind === 'deactivate') setStatus(e, 'Inactive');
    else if (kind === 'delete') deleteEmployee(e, hadLogin);
    else closeDrawer();                                  // discard | secret
  }

  const cName = confirm?.emp?.name || confirm?.name || 'this person';
  const cSelf = isMe(confirm?.login);
  const CONFIRMS = {
    create: { title: 'Create login', label: 'Create login', danger: false, message: `Create a login for ${cName} (${confirm?.emp?.email})? A temporary password is shown once for you to share. The login starts with no access until you tick modules.` },
    reset: { title: 'Reset password', label: 'Reset password', message: `Reset ${cName}'s password? Their current password stops working straight away, and a new temporary password is shown once for you to share.` },
    revoke: { title: 'Revoke login', label: 'Revoke login', message: `${cName} will be signed out of the app and cannot sign in again until you create a new login.` },
    deactivate: { title: 'Deactivate', label: 'Deactivate', message: `Deactivate ${cName}? They cannot use the app until you activate them again. Their record, login and ticked access are kept.` },
    delete: { title: 'Delete employee', label: 'Delete employee', message: `Permanently delete ${cName}'s record, salary history and login? This cannot be undone.` },
    admin: confirm?.next
      ? { title: 'Manage user access', label: 'Turn on', danger: false, message: 'Turn on managing user access for yourself? You will be able to create logins, reset passwords and change what each person can open.' }
      : { title: 'Stop managing user access', label: 'Turn off', message: cSelf
        ? 'Turn this off for yourself? You will no longer be able to open Users & Access, and another partner who manages access will have to turn it back on.'
        : `${cName} will no longer be able to create logins, reset passwords or change what each person can open.` },
    requirepw: { title: 'Require new password', label: 'Require new password', danger: false, message: cSelf
      ? 'Require a new password for yourself? You will be signed out, and must choose a new password when you sign in again.'
      : `${cName} keeps their current password for now, but must choose a new one at the next sign-in.` },
    discard: { title: 'Discard unsaved changes?', label: 'Discard changes', message: `You changed what ${cName} can access but have not saved it.` },
    secret: { title: 'Close without copying?', label: 'Close anyway', message: 'The temporary password will not be shown again. Make sure you have copied it before closing.' },
  };
  const cSpec = CONFIRMS[confirm?.kind] || {};

  const noLogin = counts.nologin;
  const summary = phase !== 'ready' ? (phase === 'loading' ? 'Loading…' : '')
    : `${emps.length} employee${emps.length === 1 ? '' : 's'} · ${noLogin ? `${noLogin} without a login` : 'everyone has a login'}${counts.inactive ? ` · ${counts.inactive} deactivated` : ''}`;
  const first = emp?.name?.split(' ')[0] || '';

  return (
    <div>
      <Header title="Users & Access" subtitle={summary}
        actions={<button onClick={() => setShowAudit(true)} className="mac-btn mac-btn-secondary"><History size={14} /> History</button>} />

      <div className="page-body">
        {phase === 'loading' && <SkeletonRows rows={6} />}
        {phase === 'failed' && <ErrorPanel title="Could not load people" error={loadError} onRetry={() => { setPhase('loading'); fetchAll(); }} />}
        {phase === 'ready' && <>
          {loginsError && (
            <div className="acc-strip" role="alert">
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Could not load logins, so login states below may be wrong. {loginsError}</span>
              <button onClick={loadLogins}>Retry</button>
            </div>
          )}

          <Toolbar search={search} onSearch={setSearch} placeholder="Search people"
            right={filtering ? <><span>{list.length} of {people.length}</span><button className="mac-btn mac-btn-ghost" onClick={() => { setSearch(''); setFilter('all'); }}>Clear</button></> : null}>
            <Chips label="Login state" value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'login', label: 'Has login', count: counts.login },
              { value: 'nologin', label: 'No login', count: counts.nologin },
              { value: 'inactive', label: 'Deactivated', count: counts.inactive },
            ]} />
          </Toolbar>

          {list.length === 0 ? (filtering
            ? <EmptyPanel icon={SearchX} title="No one matches" text="Try a different name, or clear the filters." action={<button className="mac-btn mac-btn-secondary" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</button>} />
            : <EmptyPanel icon={Users} title="No employees yet" text="Add people on the Employees page, then come back here to give them a login." />
          ) : <>
            <div className="mac-card only-desktop">
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Person</th><th>Role</th><th>Login</th><th>Can open</th></tr></thead>
                  <tbody>
                    {list.map(p => (
                      <tr key={p.key} className="clickable" tabIndex={0} onClick={() => openPerson(p.key)} onKeyDown={e => { if (e.key === 'Enter') openPerson(p.key); }}>
                        <td><div className="acc-person"><Avatar name={p.name} /><div><div className="cell-main">{p.name}</div><div className="cell-sub">{p.email || 'No email on file'}</div></div></div></td>
                        <td>{p.role}</td>
                        <td><StateBadge state={p.state} /></td>
                        <td className="cell-sub">{p.access}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="only-mobile">
              <div className="list-cards">
                {list.map(p => (
                  <button key={p.key} className="list-card" onClick={() => openPerson(p.key)}>
                    <span className="acc-card-top">
                      <span className="acc-person"><Avatar name={p.name} /><span style={{ minWidth: 0 }}><span className="cell-main" style={{ display: 'block' }}>{p.name}</span><span className="cell-sub" style={{ display: 'block' }}>{p.role}</span></span></span>
                      <StateBadge state={p.state} />
                    </span>
                    <span className="cell-sub">Can open: {p.access}</span>
                  </button>
                ))}
              </div>
            </div>
          </>}
        </>}
      </div>

      {/* ── one person ── */}
      <Drawer isOpen={!!sel} onClose={requestClose} width={600}
        title={sel?.name} subtitle={sel ? `${sel.role} · ${sel.email || 'no email on file'}${emp?.empId ? ` · ${emp.empId}` : ''}` : ''}
        actions={emp ? <RowMenu label="More actions" items={[{ label: 'Delete employee', icon: Trash2, danger: true, onClick: () => setConfirm({ kind: 'delete', emp }) }]} /> : null}
        footer={dirty ? <>
          <span className="acc-foot-note">Unsaved changes</span>
          <button onClick={() => { setEdit(null); setPickedTpl(null); }} disabled={busy === 'save'} className="mac-btn mac-btn-secondary">Discard</button>
          <button onClick={savePerms} disabled={!!busy} className="mac-btn mac-btn-primary">{busy === 'save' ? 'Saving…' : 'Save access'}</button>
        </> : null}>
        {sel && !emp && <>
          <section className="acc-section">
            <div className="acc-section-head"><h3 className="section-title">Login</h3><StateBadge state={sel.state} /></div>
            <p className="acc-note">Partners always have full access to everything, so there is nothing to tick here.</p>
            <div className="acc-actions">
              <button onClick={() => setConfirm({ kind: 'requirepw', login: sel.login, name: sel.name })} disabled={!!busy || sel.login.mustChangePassword} className="mac-btn mac-btn-secondary">
                <RefreshCw size={14} /> {busy === 'requirepw' ? 'Saving…' : 'Require new password at next sign-in'}
              </button>
            </div>
          </section>
          <section className="acc-section">
            <div className="acc-section-head">
              <h3 className="section-title" id="acc-admin-label">Manages user access</h3>
              <Switch checked={!!sel.login.isAccessAdmin} disabled={busy === 'admin'} aria-labelledby="acc-admin-label" aria-describedby="acc-admin-note"
                onCheckedChange={next => toggleAccessAdmin(sel.login, next)} />
            </div>
            <p className="acc-note" id="acc-admin-note">Can create logins, reset passwords and change what each person can open.</p>
          </section>
        </>}

        {emp && <>
          {shownError && (
            <div className="acc-strip bad" role="alert">
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{shownError}</span>
              <button onClick={() => setServiceError(null)}>Dismiss</button>
            </div>
          )}

          {shownSecret && (
            <div className="acc-secret" role="status">
              <strong>{shownSecret.action === 'reset' ? 'New temporary password' : 'Login created — temporary password'}</strong>
              <div className="acc-secret-row">
                <code>{shownSecret.password}</code>
                <button onClick={copyPw} className="mac-btn mac-btn-secondary">{copied ? <><CheckCheck size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
              </div>
              <div className="acc-secret-warn"><AlertTriangle size={14} /> Shown only once — share it privately</div>
              <div className="acc-note">{first} signs in with {emp.email} and must choose a new password the first time.{shownSecret.action === 'created' ? ' The login has no access until you tick modules below.' : ''}</div>
            </div>
          )}

          <section className="acc-section">
            <div className="acc-section-head"><h3 className="section-title">Login</h3><StateBadge state={sel.state} /></div>
            <p className="acc-note">
              {sel.state === 'off' ? `${first} is deactivated and cannot use the app, whatever is ticked below.`
                : !selLogin ? (emp.email ? `${first} cannot sign in yet.` : 'Add an email on the Employees page before creating a login.')
                : selLogin.mustChangePassword ? `${first} has a temporary password and must set their own at the next sign-in.`
                : `${first} can sign in with ${emp.email || selLogin.email}.`}
            </p>
            <div className="acc-actions">
              {!selLogin && <button onClick={() => setConfirm({ kind: 'create', emp })} disabled={!!busy || !emp.email} className="mac-btn mac-btn-primary"><KeyRound size={14} /> {busy === 'login' ? 'Creating…' : 'Create login'}</button>}
              {selLogin && emp.email && <button onClick={() => setConfirm({ kind: 'reset', emp })} disabled={!!busy} className="mac-btn mac-btn-secondary"><KeyRound size={14} /> {busy === 'login' ? 'Resetting…' : 'Reset password'}</button>}
              {selLogin && <button onClick={() => setConfirm({ kind: 'revoke', emp })} disabled={!!busy} className="mac-btn mac-btn-secondary"><ShieldOff size={14} /> {busy === 'revoke' ? 'Revoking…' : 'Revoke login'}</button>}
              {selLogin && <button onClick={() => setConfirm({ kind: 'requirepw', login: selLogin, name: emp.name })} disabled={!!busy || selLogin.mustChangePassword} className="mac-btn mac-btn-secondary"><RefreshCw size={14} /> {busy === 'requirepw' ? 'Saving…' : 'Require new password at next sign-in'}</button>}
              <button onClick={() => (emp.status === 'Active' ? setConfirm({ kind: 'deactivate', emp }) : setStatus(emp, 'Active'))} disabled={!!busy} className="mac-btn mac-btn-secondary">
                <Power size={14} /> {busy === 'status' ? 'Saving…' : emp.status === 'Active' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </section>

          <section className="acc-section">
            <div className="acc-section-head">
              <h3 className="section-title">What {first} can open</h3>
              {selLogin && (
                <select className="mac-select" value={tpl} aria-label="Start from a template"
                  onChange={e => { const t = TEMPLATES.find(x => x.id === e.target.value); if (t) { setPickedTpl(t.id); setEdit(normalizePerms(t.perms)); } }}>
                  {tpl === 'custom' && <option value="custom">Custom</option>}
                  {TEMPLATES.map(t => <option key={t.id} value={t.id}>Template: {t.label}</option>)}
                </select>
              )}
            </div>
            {!selLogin ? <p className="acc-note">Create a login first. New logins start with no access, then you tick exactly what {first} may open.</p> : <>
              <p className="acc-note">Ticking any action also gives View. Money, clients and credentials are partner-only and never appear here.</p>
              <div>
                {MODULES.map(m => (
                  <div key={m.key} className="acc-module" role="group" aria-label={m.label}>
                    <div><div className="cell-main">{m.label}</div><div className="cell-sub">{m.desc}</div></div>
                    <div className="acc-perms">
                      {m.actions.map(([a, label]) => {
                        const on = (draft[m.key] || []).includes(a);
                        return (
                          <label key={a} className={`acc-perm ${on ? 'on' : ''}`}>
                            <input type="checkbox" checked={on} onChange={() => setEdit(togglePerm(draft, m.key, a))} />{label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>}
          </section>

          <section className="acc-section">
            <h3 className="section-title">History</h3>
            {selHistory.length === 0 ? <p className="acc-note">No changes recorded yet.</p>
              : <div className="acc-history">{selHistory.slice(0, 12).map(h => <HistoryRow key={h.id} h={h} />)}</div>}
          </section>
        </>}
      </Drawer>

      <Modal isOpen={showAudit} onClose={() => setShowAudit(false)} title="Access history" size="md">
        {audit.length === 0 ? <p className="acc-note" style={{ textAlign: 'center', padding: 24 }}>No entries yet</p>
          : <div className="acc-history">{audit.slice(0, 100).map(h => <HistoryRow key={h.id} h={h} />)}</div>}
      </Modal>

      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={runConfirm}
        title={cSpec.title} message={cSpec.message} confirmLabel={cSpec.label} danger={cSpec.danger !== false} />
    </div>
  );
}
