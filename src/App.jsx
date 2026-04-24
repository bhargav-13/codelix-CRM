import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import NoAccess from './pages/NoAccess';
import Dashboard from './pages/Dashboard';
import CRM from './pages/CRM';
import Transactions from './pages/Transactions';
import Employees from './pages/Employees';
import Projects from './pages/Projects';
import Credentials from './pages/Credentials';

function AppContent() {
  const { user, loading, isEmployee } = useAuth();

  // ── Resolving session / role ──────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg,#F2F2F7,#E5E5EA)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13,
            background: 'linear-gradient(135deg,#0071E3,#0A84FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 6px 20px rgba(0,113,227,0.3)',
          }}>
            <span style={{ color:'#fff', fontSize:18, fontWeight:800 }}>C</span>
          </div>
          <p style={{ fontSize:13, color:'#8E8E93', margin:0 }}>Loading…</p>
        </div>
      </div>
    );
  }

  // ── Not signed in ─────────────────────────────────────────────────
  if (!user) return <Login />;

  // ── Signed in as employee — no feature access yet ─────────────────
  if (isEmployee) return <NoAccess />;

  // ── Signed in as partner — full app ──────────────────────────────
  return (
    <Layout>
      <Routes>
        <Route path="/"             element={<Dashboard />} />
        <Route path="/crm"          element={<CRM />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/employees"    element={<Employees />} />
        <Route path="/projects"     element={<Projects />} />
        <Route path="/credentials"  element={<Credentials />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
