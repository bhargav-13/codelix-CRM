import { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import SearchBar from '../components/ui/SearchBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge, { getStatusColor } from '../components/ui/Badge';
import { PageLoader } from '../components/ui/CodelixLoader';
import { employeesDB, auditDB } from '../lib/db';
import { supabaseAdmin, hasServiceRole } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Power, Trash2, KeyRound, Copy, CheckCheck, ShieldCheck, ShieldOff, Loader2, History } from 'lucide-react';

const DEFAULT_PASSWORD = 'Codelix@1234';

export default function Settings() {
  const { user, employeeData } = useAuth();
  const currentUser = employeeData?.name || user?.email || 'Unknown';
  const [emps, setEmps] = useState([]);
  const [authUsers, setAuthUsers] = useState([]); // [{ id, email }]
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [deleteEmp, setDeleteEmp] = useState(null);
  const [credsResult, setCredsResult] = useState(null); // { name, email, action, error }
  const [copied, setCopied] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [showAudit, setShowAudit] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [empData, auditData] = await Promise.all([employeesDB.getAll(), auditDB.getAll('employee')]);
      setEmps(empData);
      setAuditLog(auditData);
      if (hasServiceRole) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers();
        if (!error) setAuthUsers(data.users.map(u => ({ id: u.id, email: u.email })));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const authFor = email => email ? authUsers.find(u => u.email === email) : null;

  async function logAction(entityId, action, description) {
    await auditDB.log({ entity: 'employee', entityId, action, description, by: currentUser });
    setAuditLog(l => [{ id: Date.now(), entity: 'employee', entityId, action, description, by: currentUser, createdAt: new Date().toISOString() }, ...l]);
  }

  async function toggleStatus(emp) {
    const newStatus = emp.status === 'Active' ? 'Inactive' : 'Active';
    setBusyId(emp.id);
    try {
      const updated = await employeesDB.update(emp.id, { ...emp, status: newStatus });
      setEmps(es => es.map(x => x.id === emp.id ? updated : x));
      await logAction(emp.id, newStatus === 'Active' ? 'Activated' : 'Deactivated', emp.name);
    } catch (e) { console.error(e); }
    setBusyId(null);
  }

  async function manageLogin(emp) {
    if (!emp.email || !hasServiceRole) return;
    setBusyId(emp.id);
    const existing = authFor(emp.email);
    try {
      if (existing) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, { password: DEFAULT_PASSWORD });
        setCredsResult({ name: emp.name, email: emp.email, action: 'reset', error: error?.message || null });
        if (!error) await logAction(emp.id, 'Password Reset', emp.name);
      } else {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({ email: emp.email, password: DEFAULT_PASSWORD, email_confirm: true });
        setCredsResult({ name: emp.name, email: emp.email, action: 'created', error: error?.message || null });
        if (!error && data?.user) {
          setAuthUsers(a => [...a, { id: data.user.id, email: emp.email }]);
          await logAction(emp.id, 'Login Created', emp.name);
        }
      }
    } catch (e) { console.error(e); }
    setBusyId(null);
  }

  async function revokeLogin(emp) {
    const existing = authFor(emp.email);
    if (!existing || !hasServiceRole) return;
    setBusyId(emp.id);
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(existing.id);
      if (!error) {
        setAuthUsers(a => a.filter(u => u.id !== existing.id));
        await logAction(emp.id, 'Login Revoked', emp.name);
      }
    } catch (e) { console.error(e); }
    setBusyId(null);
  }

  async function confirmDelete() {
    if (!deleteEmp) return;
    const emp = deleteEmp;
    setEmps(es => es.filter(x => x.id !== emp.id));
    try {
      const existing = authFor(emp.email);
      if (existing && hasServiceRole) await supabaseAdmin.auth.admin.deleteUser(existing.id);
      await employeesDB.delete(emp.id);
      if (existing) setAuthUsers(a => a.filter(u => u.id !== existing.id));
      await logAction(emp.id, 'Deleted', `${emp.name} — record and login access removed`);
    } catch (e) { console.error(e); await fetchAll(); }
  }

  async function copyPassword() {
    try { await navigator.clipboard.writeText(DEFAULT_PASSWORD); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  }

  const filtered = useMemo(() => emps.filter(e => {
    const q = search.toLowerCase();
    return !q || e.name.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q);
  }), [emps, search]);

  return (
    <div>
      <Header title="Settings" subtitle="Employee account access — activate, deactivate, manage logins, or remove"
        actions={<button onClick={() => setShowAudit(true)} className="mac-btn mac-btn-secondary" style={{ fontSize: 13 }}><History size={13} /> Audit</button>}
      />

      {loading ? <PageLoader /> : (
        <div className="page-body">
          {!hasServiceRole && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,149,0,0.07)', border: '1px solid rgba(255,149,0,0.15)', fontSize: 12.5, color: '#FF9500' }}>
              Login management is disabled — add <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>VITE_SUPABASE_SERVICE_ROLE_KEY</code> to your <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>.env</code> to enable Create/Reset/Revoke login.
            </div>
          )}
          <div style={{ maxWidth: 320 }}><SearchBar value={search} onChange={setSearch} placeholder="Search employees…" /></div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.length === 0
              ? <div style={{ textAlign: 'center', padding: '56px', color: '#AEAEB2', fontSize: 13 }}>No employees found</div>
              : filtered.map(e => {
                  const login = authFor(e.email);
                  const busy = busyId === e.id;
                  const initials = e.name.split(' ').map(n => n[0]).join('').slice(0, 2);
                  return (
                    <div key={e.id} className="mac-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg,#0071E3,#0A84FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1D1D1F' }}>{e.name}</span>
                          <Badge color={getStatusColor(e.status)}>{e.status}</Badge>
                          {e.email ? (
                            login
                              ? <Badge color="green"><ShieldCheck size={10} style={{ marginRight: 3, verticalAlign: -1 }} />Login Active</Badge>
                              : <Badge color="gray"><ShieldOff size={10} style={{ marginRight: 3, verticalAlign: -1 }} />No Login</Badge>
                          ) : <Badge color="gray">No Email</Badge>}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#8E8E93', marginTop: 2 }}>{e.role || '—'} · {e.email || 'no email on file'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {e.status !== 'Left' && (
                          <button onClick={() => toggleStatus(e)} disabled={busy} title={e.status === 'Active' ? 'Deactivate' : 'Activate'} className="mac-btn mac-btn-secondary" style={{ fontSize: 12 }}>
                            <Power size={12} color={e.status === 'Active' ? '#FF9500' : '#34C759'} /> {e.status === 'Active' ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                        {e.email && hasServiceRole && (
                          <button onClick={() => manageLogin(e)} disabled={busy} title={login ? 'Reset Password' : 'Create Login'} className="mac-btn mac-btn-secondary" style={{ fontSize: 12 }}>
                            {busy ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <KeyRound size={12} />} {login ? 'Reset Password' : 'Create Login'}
                          </button>
                        )}
                        {login && hasServiceRole && (
                          <button onClick={() => revokeLogin(e)} disabled={busy} title="Revoke login access" style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,149,0,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ShieldOff size={13} color="#FF9500" />
                          </button>
                        )}
                        <button onClick={() => setDeleteEmp(e)} title="Delete employee" style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,59,48,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Trash2 size={13} color="#FF3B30" />
                        </button>
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteEmp}
        onClose={() => setDeleteEmp(null)}
        onConfirm={confirmDelete}
        title="Delete Employee"
        message={`This permanently deletes ${deleteEmp?.name || 'this employee'}'s record and salary history, and revokes their login access so they can no longer sign in.`}
      />

      <Modal isOpen={!!credsResult} onClose={() => setCredsResult(null)} title={credsResult?.action === 'reset' ? 'Password Reset' : 'Login Account Created'} size="sm">
        {credsResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {credsResult.error ? (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.15)', fontSize: 12, color: '#FF3B30', lineHeight: 1.5 }}>
                <strong>Failed:</strong> {credsResult.error}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(52,199,89,0.08)', border: '1px solid rgba(52,199,89,0.18)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#34C759,#30D158)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <KeyRound size={14} color="#fff" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>{credsResult.action === 'reset' ? `Password reset for ${credsResult.name}` : `Account created for ${credsResult.name}`}</div>
                    <div style={{ fontSize: 11.5, color: '#6E6E73', marginTop: 1 }}>Share these credentials with the employee</div>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Email</label>
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)', fontSize: 13.5, color: '#1D1D1F' }}>{credsResult.email}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Password</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)', fontSize: 14, color: '#1D1D1F', fontFamily: 'monospace', letterSpacing: '0.5px' }}>{DEFAULT_PASSWORD}</div>
                    <button onClick={copyPassword} style={{ width: 36, height: 36, borderRadius: 10, background: copied ? 'rgba(52,199,89,0.1)' : 'rgba(0,0,0,0.05)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {copied ? <CheckCheck size={14} color="#34C759" /> : <Copy size={14} color="#6E6E73" />}
                    </button>
                  </div>
                </div>
              </>
            )}
            <button onClick={() => setCredsResult(null)} className="mac-btn mac-btn-primary" style={{ width: '100%', fontSize: 13 }}>Done</button>
          </div>
        )}
      </Modal>

      <Modal isOpen={showAudit} onClose={() => setShowAudit(false)} title="Audit Log" size="md">
        {auditLog.length === 0 ? <p style={{ textAlign: 'center', color: '#AEAEB2', padding: '32px 0', fontSize: 13 }}>No entries yet</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {auditLog.map(e => {
              const badgeColor = e.action === 'Deleted' ? 'red' : e.action === 'Activated' || e.action === 'Login Created' ? 'green' : 'blue';
              const ts = e.createdAt ? new Date(e.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
              return (
                <div key={e.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Badge color={badgeColor}>{e.action}</Badge><span style={{ fontSize: 12.5, color: '#1D1D1F', fontWeight: 500 }}>{e.description}</span></div>
                    <span style={{ fontSize: 11, color: '#AEAEB2', whiteSpace: 'nowrap', marginLeft: 8 }}>{ts}</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#6E6E73' }}>By: <strong>{e.by || '—'}</strong></span>
                </div>
              );
            })}
          </div>
        }
      </Modal>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
