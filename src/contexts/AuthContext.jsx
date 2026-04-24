import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);
  const [loading, setLoading]         = useState(true);   // true while resolving session + role
  const [isEmployee, setIsEmployee]   = useState(false);
  const [employeeData, setEmployeeData] = useState(null); // { name, role, empId, id }

  // ── Check whether the signed-in email belongs to an employee record ─
  async function resolveRole(authUser) {
    if (!authUser?.email) {
      setIsEmployee(false);
      setEmployeeData(null);
      return;
    }
    const { data } = await supabase
      .from('employees')
      .select('id, name, role, emp_id')
      .eq('email', authUser.email)
      .maybeSingle();

    if (data) {
      setIsEmployee(true);
      setEmployeeData({ id: data.id, name: data.name, role: data.role, empId: data.emp_id });
    } else {
      setIsEmployee(false);
      setEmployeeData(null);
    }
  }

  // ── Bootstrap: restore session on mount ─────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      await resolveRole(u);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        await resolveRole(u);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────
  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(email, password) {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setIsEmployee(false);
    setEmployeeData(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, isEmployee, employeeData, login, signUp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
