import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { http, session, ApiError, SESSION_FLAG } from '../lib/http';

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext(null);

// Access is decided ONLY by what the server says in GET /auth/me:
//   • role PARTNER            → full app
//   • anyone else             → must be linked to an active employee record, and
//                               sees only the modules in `permissions` (module:ACTION)
// The server enforces the same rules, so hiding UI is not the only guard.

// Set by lib/http.js while signed in. Only a hint: the session itself is an HttpOnly cookie.
const hasStoredSession = () => { try { return !!localStorage.getItem(SESSION_FLAG); } catch { return false; } };
const isGone = e => e instanceof ApiError && [401, 403, 404].includes(e.status);
const OFFLINE = 'Could not reach the server. Check your connection and try again.';

// The password typed at sign-in, kept in memory only until the forced
// "set your own password" step has used it as the current password.
let typedPassword = null;

export function AuthProvider({ children }) {
  const [user, setUser]                 = useState(null);   // { id, email } — null when signed out
  const [loading, setLoading]           = useState(true);
  const [me, setMe]                     = useState(null);   // full /auth/me object
  const [employeeData, setEmployeeData] = useState(null);
  const [authError, setAuthError]       = useState('');
  const seq = useRef(0);

  const clear = useCallback(() => {
    seq.current++;
    typedPassword = null;
    setUser(null); setMe(null); setEmployeeData(null); setAuthError(''); setLoading(false);
  }, []);

  // Reads who I am. `known` is the user object login/refresh already returned
  // (so the app knows someone is signed in even if /auth/me cannot be reached).
  const loadMe = useCallback(async (known, { quiet = false } = {}) => {
    const run = ++seq.current;
    if (!quiet) setLoading(true);
    try {
      const profile = await session.me();
      if (run !== seq.current) return profile;
      const partner = String(profile?.role?.name || '').toUpperCase() === 'PARTNER';
      let emp = null;
      if (!partner && profile?.employeeId) {
        // Own record (name, job title, employee code). Inactive employees get no access.
        const base = { id: profile.employeeId, name: profile.fullName, role: profile.jobTitle || null, empId: null };
        try {
          const own = await http.get('/employees/me');
          emp = own && own.status && own.status !== 'Active' ? null
            : { ...base, name: own?.name || base.name, role: own?.role || base.role, empId: own?.empId || null };
        } catch (e) {
          console.error('employees/me', e);
          emp = base;                 // the record could not be read — /auth/me already vouched for the link
        }
        if (run !== seq.current) return profile;
      }
      setUser({ id: profile.id, email: profile.email });
      setMe(profile);
      setEmployeeData(emp);
      setAuthError('');
      setLoading(false);
      return profile;
    } catch (e) {
      if (run !== seq.current) return null;
      if (isGone(e)) {
        // deactivated or removed → signed out (session.logout notifies onChange → clear)
        await session.logout();
        return null;
      }
      console.error('auth/me', e);
      if (!quiet) {
        // Signed in, but the server cannot be reached: a retry screen, not a blank page.
        setUser(u => u || (known ? { id: known.id, email: known.email } : { id: null, email: null }));
        setAuthError(e?.status === 0 ? OFFLINE : e?.message || OFFLINE);
        setLoading(false);
      }
      return null;
    }
  }, []);

  // Start-up: restore the session from the refresh token, then ask who I am.
  const boot = useCallback(async () => {
    setLoading(true);
    const restored = session.hasToken() ? {} : await session.restore();
    if (restored) { await loadMe(restored.id ? restored : null); return; }
    if (hasStoredSession()) {
      // The refresh token is still there, so it was not rejected — the server did not answer.
      seq.current++;
      setUser({ id: null, email: null }); setMe(null); setEmployeeData(null);
      setAuthError(OFFLINE); setLoading(false);
      return;
    }
    clear();
  }, [loadMe, clear]);

  useEffect(() => {
    // Fired with the user after a sign-in, with null after sign-out or when the
    // refresh token is rejected (deactivated / removed account).
    const off = session.onChange(u => { if (u) loadMe(u); else clear(); });
    boot();
    return off;
  }, [boot, loadMe, clear]);

  const login = useCallback(async (email, password) => {
    try {
      typedPassword = password;
      await session.login(email, password);      // onChange → loadMe
      return { error: null };
    } catch (error) {
      typedPassword = null;
      return { error };
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    await session.logout();                      // onChange(null) → clear
  }, []);

  // Re-read /auth/me (after a profile edit, or to retry after a connection failure).
  const refreshMe = useCallback(async () => {
    if (!me) { await boot(); return null; }
    return loadMe(null, { quiet: true });
  }, [me, boot, loadMe]);

  // Change own password. `currentPassword` may be left out right after signing
  // in with a temporary password — the one just typed is used.
  const changePassword = useCallback(async (newPassword, currentPassword) => {
    const current = currentPassword || typedPassword;
    if (!current) return { error: new Error('For your security, sign out and sign in again with your temporary password, then choose a new one.') };
    try {
      await http.post('/me/password', { currentPassword: current, newPassword });
      typedPassword = null;
      setMe(m => (m ? { ...m, mustChangePassword: false } : m));
      return { error: null };
    } catch (error) { return { error }; }
  }, []);

  const isPartner     = String(me?.role?.name || '').toUpperCase() === 'PARTNER';
  const isEmployee    = !!me && !isPartner;
  const isAccessAdmin = isPartner && !!me?.isAccessAdmin;
  const hasAccess     = !!me && (isPartner || !!employeeData);
  const mustChangePassword = !!me?.mustChangePassword;
  const displayName   = me?.fullName || null;

  // Who I am as a person ref — the shape tasks, chat and notifications use:
  // partner → the user id, employee → the employee id. Never a name.
  const empId = employeeData?.id ?? null, empName = employeeData?.name ?? null, userId = me?.id ?? null;
  const person = useMemo(() => {
    if (!hasAccess) return null;
    return isPartner ? { kind: 'partner', id: userId, name: displayName || '' } : { kind: 'employee', id: empId, name: empName || displayName || '' };
  }, [hasAccess, isPartner, userId, displayName, empId, empName]);

  // can('tasks') / can('tasks', 'edit') — partners can do everything
  const authorities = useMemo(() => new Set((me?.permissions || []).map(p => String(p).toLowerCase())), [me]);
  const can = useCallback((module, action = 'view') => {
    if (isPartner) return true;
    return authorities.has(`${module}:${action}`.toLowerCase());
  }, [isPartner, authorities]);

  const value = useMemo(() => ({
    user, loading, hasAccess, isPartner, isEmployee, isAccessAdmin, mustChangePassword,
    employeeData, displayName, can, me, person, authError,
    login, logout, changePassword, refreshMe,
  }), [user, loading, hasAccess, isPartner, isEmployee, isAccessAdmin, mustChangePassword,
    employeeData, displayName, can, me, person, authError, login, logout, changePassword, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
