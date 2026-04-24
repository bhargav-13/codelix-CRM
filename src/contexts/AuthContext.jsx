import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [isEmployee, setIsEmployee]     = useState(false);
  const [employeeData, setEmployeeData] = useState(null);

  // Check whether the signed-in email belongs to an employee record.
  // Called with setTimeout(0) to avoid Supabase auth deadlock.
  async function resolveRole(authUser) {
    if (!authUser?.email) {
      setIsEmployee(false);
      setEmployeeData(null);
      setLoading(false);
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
    setLoading(false);
  }

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on mount — this is the only
    // thing needed to restore a persisted session after a page refresh.
    // We intentionally do NOT call getSession() separately to avoid
    // running resolveRole twice and triggering a DB deadlock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);

        // Move the DB query out of the auth callback with setTimeout(0).
        // Calling supabase.from() directly inside onAuthStateChange can
        // deadlock the Supabase client on the same connection.
        setTimeout(() => {
          resolveRole(u);
        }, 0);
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(email, password) {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  }

  async function logout() {
    setLoading(true);
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, loading, isEmployee, employeeData, login, signUp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
