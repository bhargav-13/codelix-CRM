import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// Access is decided ONLY by the `app_users` row (see supabase/security.sql):
//   • no row            → no access at all (NoAccess screen)
//   • role 'partner'    → full app
//   • role 'employee'   → only the modules listed in `permissions`
// The database enforces the same rules, so hiding UI is not the only guard.
export function AuthProvider({ children }) {
  const [user, setUser]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [access, setAccess]             = useState(null);   // app_users row, or null
  const [employeeData, setEmployeeData] = useState(null);

  async function resolveRole(authUser) {
    if (!authUser) {
      setAccess(null);
      setEmployeeData(null);
      setLoading(false);
      return;
    }

    const { data: row, error } = await supabase
      .from('app_users')
      .select('role, display_name, employee_id, is_access_admin, permissions, must_change_password')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (error) console.error('app_users lookup:', error);

    let emp = null;
    if (row?.role === 'employee' && row.employee_id) {
      const { data } = await supabase
        .from('employees').select('id, name, role, emp_id, status').eq('id', row.employee_id).maybeSingle();
      // Inactive employees get no access, same as the database rule
      emp = data && data.status === 'Active' ? data : null;
    }

    setAccess(row && (row.role === 'partner' || emp) ? row : null);
    setEmployeeData(emp ? { id: emp.id, name: emp.name, role: emp.role, empId: emp.emp_id } : null);
    setLoading(false);
  }

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on mount — this is the only
    // thing needed to restore a persisted session after a page refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        // Token refreshes don't change who you are — skip the extra lookups.
        if (event === 'TOKEN_REFRESHED') return;
        // Move the DB query out of the auth callback with setTimeout(0):
        // calling supabase.from() inside onAuthStateChange can deadlock.
        setTimeout(() => { resolveRole(u); }, 0);
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function logout() {
    setLoading(true);
    await supabase.auth.signOut();
  }

  // Change own password, then clear the "must change" flag.
  async function changePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error };
    await supabase.rpc('clear_must_change_password');
    setAccess(a => a ? { ...a, must_change_password: false } : a);
    return { error: null };
  }

  const isPartner     = access?.role === 'partner';
  const isEmployee    = access?.role === 'employee';
  const isAccessAdmin = isPartner && !!access?.is_access_admin;
  const hasAccess     = !!access;
  const mustChangePassword = !!access?.must_change_password;

  // can('tasks') / can('tasks', 'edit') — partners can do everything
  function can(module, action = 'view') {
    if (isPartner) return true;
    return (access?.permissions?.[module] || []).includes(action);
  }

  return (
    <AuthContext.Provider value={{
      user, loading, hasAccess, isPartner, isEmployee, isAccessAdmin, mustChangePassword,
      employeeData, displayName: access?.display_name || null, can,
      login, logout, changePassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
