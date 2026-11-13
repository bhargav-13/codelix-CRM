import { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import SearchBar from '../components/ui/SearchBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import { PageLoader } from '../components/ui/CodelixLoader';
import { employeesDB, auditDB, adminUsersAPI } from '../lib/db';
import { MODULES, TEMPLATES, normalizePerms, togglePerm, samePerms, matchTemplate, permSummary, accessDB } from '../lib/access';
import { useAuth } from '../contexts/AuthContext';
import {
  Power, Trash2, KeyRound, Copy, CheckCheck, ShieldCheck, ShieldOff, Loader2, History,
  Lock, Save, Undo2, Crown, UserRound, AlertTriangle,
} from 'lucide-react';

const INK = { primary: '#1D1D1F', secondary: '#6E6E73', muted: '#AEAEB2' };

// "Users & Access" — only access admins (Bhargav, Manas) can open this page;
// the database refuses changes from anyone else as well.
export default function Access() {
  const { user, displayName } = useAuth();
  const currentUser = displayName || user?.email || 'Unknown';

  const [emps, setEmps] = useState([]);
  const [logins, setLogins] = useState([]);           // app_users rows (partners + employees)
  const [loginsError, setLoginsError] = useState('');
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');        // all | login | nologin | inactive
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState({});
  const [pickedTpl, setPickedTpl] = useState(null);   // remembers which template was chosen when two are identical
  const [busy, setBusy] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [creds, setCreds] = useState(null);           // { name, email, action, password, error }
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(null);       // { kind: 'revoke'|'delete', emp }
  const [showAudit, setShowAudit] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [e, a] = await Promise.all([employeesDB.getAll(), auditDB.getAll()]);
      setEmps(e);
      setAudit(a.filter(x => x.entity === 'access' || x.entity === 'employee'));
    } catch (err) { console.error(err); }
    try { setLogins(await adminUsersAPI.list()); setLoginsError(''); }
    catch (err) { console.error(err); setLoginsError(err.message || 'Could not load logins'); }
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const loginFor = useCallback(emp => logins.find(l => l.employee_id === emp?.id) || null, [logins]);
  const partners = logins.filter(l => l.role === 'partner');
  const sel = emps.find(e => e.id === selId) || null;
  const selLogin = loginFor(sel);
  const savedPerms = useMemo(() => normalizePerms(selLogin?.permissions || {}), [selLogin]);
  const dirty = selLogin && !samePerms(draft, savedPerms);

  useEffect(() => { setDraft(savedPerms); setSaveMsg(''); }, [selId, savedPerms]);

  const list = useMemo(() => emps.filter(e => {
    const q = search.toLowerCase();
    const l = loginFor(e);
    if (q && !(e.name || '').toLowerCase().includes(q) && !(e.email || '').toLowerCase().includes(q) && !(e.role || '').toLowerCase().includes(q)) return false;
    if (filter === 'login') return !!l;
    if (filter === 'nologin') return !l;
    if (filter === 'inactive') return e.status !== 'Active';
    return true;
  }), [emps, search, filter, loginFor]);

  async function log(entityId, action, description, prevData, nextData) {
    try {
      await auditDB.log({ entity: 'access', entityId, action, description, by: currentUser, prevData, nextData });
      setAudit(a => [{ id: Date.now(), entity: 'access', entityId, action, description, by: currentUser, prevData, nextData, createdAt: new Date().toISOString() }, ...a]);
    } catch (e) { console.error(e); }
  }

  function selectEmp(id) {
    if (dirty && !window.confirm('You have unsaved access changes. Discard them?')) return;
    setSelId(id);
    setPickedTpl(null);
  }

  async function savePerms() {
    if (!sel || !dirty) return;
    setBusy('save'); setSaveMsg('');
    try {
      const saved = await accessDB.setPermissions(sel.id, draft);
      setLogins(ls => ls.map(l => l.employee_id === sel.id ? { ...l, permissions: saved } : l));
      await log(sel.id, 'Access changed', `${sel.name}: ${permSummary(savedPerms)} → ${permSummary(saved)}`, savedPerms, saved);
      setSaveMsg('Saved. Takes effect on their next page load.');
    } catch (e) { setSaveMsg(e.message || 'Could not save'); }
    setBusy('');
  }

  async function loginAction(emp) {
    const existing = loginFor(emp);
    setBusy('login');
    try {
      const password = existing ? await adminUsersAPI.reset(emp.id) : await adminUsersAPI.create(emp.id);
      setCreds({ name: emp.name, email: emp.email, action: existing ? 'reset' : 'created', password });
      await log(emp.id, existing ? 'Password reset' : 'Login created', emp.name);
      setLogins(await adminUsersAPI.list());
    } catch (e) {
      setCreds({ name: emp.name, email: emp.email, action: existing ? 'reset' : 'created', error: e.message });
    }
    setBusy('');
  }

  async function toggleActive(emp) {
    const next = emp.status === 'Active' ? 'Inactive' : 'Active';
    setBusy('status');
    try {
      const updated = await employeesDB.update(emp.id, { ...emp, status: next });
      setEmps(es => es.map(x => x.id === emp.id ? updated : x));
      await log(emp.id, next === 'Active' ? 'Activated' : 'Deactivated', `${emp.name}${next === 'Inactive' ? ' — all access paused' : ''}`);
    } catch (e) { alert(e.message); }
    setBusy('');
  }

  async function runConfirm() {
    const { kind, emp } = confirm;
    setBusy(kind);
    try {
      if (loginFor(emp)) await adminUsersAPI.revoke(emp.id);
      setLogins(ls => ls.filter(l => l.employee_id !== emp.id));
      if (kind === 'delete') {
        await employeesDB.delete(emp.id);
        setEmps(es => es.filter(x => x.id !== emp.id));
        setSelId(null);
        await log(emp.id, 'Deleted', `${emp.name} — record and login removed`);
      } else {
        await log(emp.id, 'Login revoked', emp.name);
      }
    } catch (e) { alert(e.message); await fetchAll(); }
    setBusy(''); setConfirm(null);
  }

  async function copyPw() {
    try { await navigator.clipboard.writeText(creds.password); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ }
  }

  if (loading) return <div><Header title="Users & Access" /><PageLoader /></div>;

  const picked = TEMPLATES.find(t => t.id === pickedTpl);
  const tpl = picked && samePerms(picked.perms, draft) ? picked.id : matchTemplate(draft);
  const selHistory = sel ? audit.filter(a => a.entityId === sel.id) : [];

  return (
    <div>
      <Header title="Users & Access" subtitle="Employee logins and what each person can open · only Bhargav and Manas can change this"
        actions={<button onClick={() => setShowAudit(true)} className="mac-btn mac-btn-secondary" style={{ fontSize: 13 }}><History size={13} /> History</button>} />

      <div className="page-body">
        {loginsError && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,149,0,0.08)', fontSize: 12.5, color: '#B25E00' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Login management unavailable: {loginsError}. Check that the <code>admin-users</code> Edge Function is deployed.</span>
          </div>
        )}

        {/* Partners (read-only) */}
        {partners.length > 0 && (
          <div className="mac-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: INK.secondary, marginRight: 4 }}>Partners — full access</span>
            {partners.map(p => (
              <span key={p.user_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 100, background: 'rgba(0,0,0,0.04)', fontSize: 12.5 }}>
                {p.is_access_admin ? <Crown size={12} color="#B07D00" /> : <UserRound size={12} color={INK.secondary} />}
                {p.display_name || p.email}
                {p.is_access_admin && <span style={{ fontSize: 10.5, color: '#B07D00' }}>manages access</span>}
              </span>
            ))}
          </div>
        )}

        <div className="access-grid">
          {/* ── Employee list ── */}
          <div className="mac-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search employees…" />
            <div className="tab-bar" style={{ flexWrap: 'wrap' }}>
              {[['all', 'All'], ['login', 'Has login'], ['nologin', 'No login'], ['inactive', 'Inactive']].map(([k, l]) => (
                <button key={k} className={`tab-item ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)} style={{ fontSize: 12, padding: '4px 10px' }}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
              {list.length === 0 && <div style={{ textAlign: 'center', padding: 24, fontSize: 12.5, color: INK.muted }}>No employees</div>}
              {list.map(e => {
                const l = loginFor(e);
                const active = e.id === selId;
                return (
                  <button key={e.id} onClick={() => selectEmp(e.id)} className="access-row"
                    style={{ background: active ? 'rgba(0,113,227,0.08)' : 'transparent' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: e.status === 'Active' ? 'linear-gradient(135deg,#34C759,#30D158)' : '#C7C7CC', color: '#fff', fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {(e.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: INK.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                      <div style={{ fontSize: 11, color: INK.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.status !== 'Active' ? 'Inactive · ' : ''}{l ? permSummary(l.permissions) : 'No login'}
                      </div>
                    </div>
                    {l ? <ShieldCheck size={14} color="#34C759" /> : <ShieldOff size={14} color="#C7C7CC" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Detail ── */}
          {!sel ? (
            <div className="mac-card" style={{ padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center' }}>
              <Lock size={26} color={INK.muted} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>Select an employee</div>
              <div style={{ fontSize: 12.5, color: INK.secondary, maxWidth: 380 }}>New employees start with <strong>no access</strong>. Create a login, then tick exactly what they may open. Partners always have full access.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              {/* identity + login */}
              <div className="mac-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 16, fontWeight: 680 }}>{sel.name}</span>
                      <Badge color={sel.status === 'Active' ? 'active' : 'inactive'}>{sel.status}</Badge>
                      {selLogin ? <Badge color="green">Login active</Badge> : <Badge color="gray">No login</Badge>}
                      {selLogin?.must_change_password && <Badge color="yellow">Must set password</Badge>}
                    </div>
                    <div style={{ fontSize: 12, color: INK.secondary, marginTop: 3 }}>{sel.role || '—'} · {sel.email || 'no email on file'}{sel.empId ? ` · ${sel.empId}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => toggleActive(sel)} disabled={!!busy} className="mac-btn mac-btn-secondary" style={{ fontSize: 12.5 }}>
                      <Power size={12} color={sel.status === 'Active' ? '#FF9500' : '#34C759'} /> {sel.status === 'Active' ? 'Deactivate' : 'Activate'}
                    </button>
                    {sel.email && !loginsError && (
                      <button onClick={() => loginAction(sel)} disabled={!!busy} className="mac-btn mac-btn-secondary" style={{ fontSize: 12.5 }}>
                        {busy === 'login' ? <Loader2 size={12} className="spin" /> : <KeyRound size={12} />} {selLogin ? 'Reset password' : 'Create login'}
                      </button>
                    )}
                    {selLogin && (
                      <button onClick={() => setConfirm({ kind: 'revoke', emp: sel })} disabled={!!busy} className="mac-btn mac-btn-secondary" style={{ fontSize: 12.5 }}>
                        <ShieldOff size={12} color="#FF9500" /> Revoke login
                      </button>
                    )}
                    <button onClick={() => setConfirm({ kind: 'delete', emp: sel })} disabled={!!busy} className="mac-btn mac-btn-danger" style={{ fontSize: 12.5 }}>
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
                {!sel.email && <div style={{ fontSize: 12, color: '#B25E00' }}>Add an email on the Employees page before creating a login.</div>}
                {sel.status !== 'Active' && <div style={{ fontSize: 12, color: '#B25E00' }}>Inactive employees cannot use the app, whatever is ticked below.</div>}
              </div>

              {/* permissions */}
              <div className="mac-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, opacity: selLogin ? 1 : 0.55 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 650 }}>What {sel.name.split(' ')[0]} can access</div>
                    <div style={{ fontSize: 11.5, color: INK.muted }}>{selLogin ? 'Ticking any action also gives View. Money, clients and credentials are partner-only and never shown here.' : 'Create a login first.'}</div>
                  </div>
                  <select className="mac-select" value={tpl} disabled={!selLogin} onChange={e => { const t = TEMPLATES.find(x => x.id === e.target.value); if (t) { setPickedTpl(t.id); setDraft(normalizePerms(t.perms)); } }} style={{ width: 'auto', fontSize: 12.5 }} aria-label="Role template">
                    {tpl === 'custom' && <option value="custom">Custom</option>}
                    {TEMPLATES.map(t => <option key={t.id} value={t.id}>Template: {t.label}</option>)}
                  </select>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="access-table">
                    <thead><tr><th style={{ textAlign: 'left' }}>Module</th><th colSpan={4} style={{ textAlign: 'left' }}>Allowed actions</th></tr></thead>
                    <tbody>
                      {MODULES.map(m => (
                        <tr key={m.key}>
                          <td style={{ minWidth: 220 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</div>
                            <div style={{ fontSize: 11, color: INK.muted, whiteSpace: 'normal', maxWidth: 300 }}>{m.desc}</div>
                          </td>
                          {m.actions.map(([a, label]) => {
                            const on = (draft[m.key] || []).includes(a);
                            return (
                              <td key={a}>
                                <label className={`perm-chip ${on ? 'on' : ''}`} style={{ cursor: selLogin ? 'pointer' : 'not-allowed' }}>
                                  <input type="checkbox" checked={on} disabled={!selLogin} onChange={() => setDraft(d => togglePerm(d, m.key, a))} />
                                  {label}
                                </label>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={savePerms} disabled={!dirty || !!busy} className="mac-btn mac-btn-primary" style={{ fontSize: 13 }}>
                    {busy === 'save' ? <Loader2 size={13} className="spin" /> : <Save size={13} />} Save access
                  </button>
                  <button onClick={() => setDraft(savedPerms)} disabled={!dirty} className="mac-btn mac-btn-secondary" style={{ fontSize: 13 }}><Undo2 size={13} /> Discard</button>
                  {dirty && <span style={{ fontSize: 12, color: '#B25E00' }}>Unsaved changes</span>}
                  {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('Saved') ? '#248A3D' : '#D70015' }}>{saveMsg}</span>}
                </div>
              </div>

              {/* history for this person */}
              <div className="mac-card" style={{ padding: 18 }}>
                <div style={{ fontSize: 13.5, fontWeight: 650, marginBottom: 10 }}>History for {sel.name.split(' ')[0]}</div>
                {selHistory.length === 0 ? <div style={{ fontSize: 12.5, color: INK.muted }}>No changes recorded yet</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selHistory.slice(0, 12).map(h => <HistoryRow key={h.id} h={h} />)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={runConfirm}
        title={confirm?.kind === 'delete' ? 'Delete employee' : 'Revoke login'}
        message={confirm?.kind === 'delete'
          ? `Permanently delete ${confirm?.emp?.name}'s record, salary history and login? This cannot be undone.`
          : `${confirm?.emp?.name} will be signed out of the app and cannot sign in again until you create a new login.`} />

      <Modal isOpen={!!creds} onClose={() => setCreds(null)} title={creds?.action === 'reset' ? 'Password reset' : 'Login created'} size="sm">
        {creds && (creds.error ? (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,59,48,0.06)', fontSize: 12.5, color: '#D70015' }}><strong>Failed:</strong> {creds.error}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12.5, color: INK.secondary }}>Share these with {creds.name}. The password is shown <strong>only once</strong>; they must change it at first sign-in.{creds.action === 'created' ? ' The login has no access until you tick modules.' : ''}</div>
            <div className="cred-box"><span>Email</span><strong>{creds.email}</strong></div>
            <div className="cred-box"><span>Temporary password</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontFamily: 'monospace', fontSize: 14 }}>{creds.password}</strong>
                <button onClick={copyPw} className="mac-btn mac-btn-secondary" style={{ fontSize: 12, padding: '4px 8px' }}>{copied ? <CheckCheck size={12} color="#34C759" /> : <Copy size={12} />}</button>
              </span>
            </div>
            <button onClick={() => setCreds(null)} className="mac-btn mac-btn-primary" style={{ fontSize: 13 }}>Done</button>
          </div>
        ))}
      </Modal>

      <Modal isOpen={showAudit} onClose={() => setShowAudit(false)} title="Access history" size="md">
        {audit.length === 0 ? <p style={{ textAlign: 'center', color: INK.muted, padding: 24, fontSize: 13 }}>No entries yet</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{audit.slice(0, 100).map(h => <HistoryRow key={h.id} h={h} />)}</div>
        )}
      </Modal>

      <style>{`
        .access-grid { display: grid; grid-template-columns: 300px minmax(0,1fr); gap: 14px; align-items: start; }
        @media (max-width: 860px) { .access-grid { grid-template-columns: minmax(0,1fr); } }
        .access-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; border: none; cursor: pointer; font-family: inherit; width: 100%; }
        .access-row:hover { background: rgba(0,0,0,0.04) !important; }
        .access-table { border-collapse: collapse; width: 100%; }
        .access-table th { font-size: 11px; color: #8E8E93; text-transform: uppercase; letter-spacing: .4px; padding: 6px 8px; border-bottom: 1px solid rgba(0,0,0,0.07); }
        .access-table td { padding: 10px 8px; border-bottom: 1px solid rgba(0,0,0,0.05); vertical-align: middle; white-space: nowrap; }
        .perm-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 100px; border: 1px solid rgba(0,0,0,0.1); font-size: 12px; color: #6E6E73; user-select: none; }
        .perm-chip.on { border-color: rgba(0,113,227,0.35); background: rgba(0,113,227,0.08); color: #0060C0; font-weight: 550; }
        .perm-chip input { margin: 0; accent-color: #0071E3; }
        .cred-box { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: rgba(0,0,0,0.03); font-size: 12.5px; flex-wrap: wrap; }
        .cred-box > span:first-child { color: #8E8E93; }
        .spin { animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function HistoryRow({ h }) {
  const ts = h.createdAt ? new Date(h.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const color = /Deleted|revoked|Deactivated/i.test(h.action) ? 'red' : /created|Activated/i.test(h.action) ? 'green' : 'blue';
  return (
    <div style={{ padding: '8px 10px', borderRadius: 9, background: 'rgba(0,0,0,0.025)', display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><Badge color={color}>{h.action}</Badge><span style={{ fontSize: 12.5 }}>{h.description}</span></div>
        <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 2 }}>by {h.by || '—'}</div>
      </div>
      <span style={{ fontSize: 11, color: '#AEAEB2', whiteSpace: 'nowrap' }}>{ts}</span>
    </div>
  );
}
