import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import CodelixLoader from './components/ui/CodelixLoader';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CRM from './pages/CRM';
import Transactions from './pages/Transactions';
import Employees from './pages/Employees';
import Projects from './pages/Projects';
import Credentials from './pages/Credentials';
import Tasks from './pages/Tasks';
import ExistingProjects from './pages/ExistingProjects';
import Chat from './pages/Chat';
import Settings from './pages/Settings';

function AppContent() {
  const { user, loading, isEmployee } = useAuth();

  // ── Resolving session / role ──────────────────────────────────────
  if (loading) return <CodelixLoader />;

  // ── Not signed in ─────────────────────────────────────────────────
  if (!user) return <Login />;

  // ── Signed in as employee — only their Tasks ──────────────────────
  if (isEmployee) {
    return (
      <Layout>
        <Routes>
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/chat"  element={<Chat />} />
          {/* Redirect everything else to /tasks */}
          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Routes>
      </Layout>
    );
  }

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
        <Route path="/tasks"        element={<Tasks />} />
        <Route path="/existing-projects" element={<ExistingProjects />} />
        <Route path="/chat"         element={<Chat />} />
        <Route path="/settings"     element={<Settings />} />
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
