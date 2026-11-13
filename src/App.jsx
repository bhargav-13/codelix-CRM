import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ChatProvider } from './contexts/ChatContext';
import Layout from './components/layout/Layout';
import CodelixLoader from './components/ui/CodelixLoader';
import Login from './pages/Login';
import NoAccess from './pages/NoAccess';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Reports from './pages/Reports';
import CRM from './pages/CRM';
import Transactions from './pages/Transactions';
import Employees from './pages/Employees';
import Projects from './pages/Projects';
import Credentials from './pages/Credentials';
import Work from './pages/Work';
import ExistingProjects from './pages/ExistingProjects';
import Chat from './pages/Chat';
import Access from './pages/Access';

// Modules an employee can be granted (keys match app_users.permissions)
// The work hub opens if they may see tasks, project boards or their timesheet.
const EMPLOYEE_MODULES = [
  { key: 'work', path: '/tasks', element: <Work />, allowed: can => can('tasks') || can('projects') || can('timesheet') },
  { key: 'chat', path: '/chat',  element: <Chat />, allowed: can => can('chat') },
];

function AppContent() {
  const { user, loading, hasAccess, isEmployee, isAccessAdmin, mustChangePassword, can } = useAuth();

  if (loading) return <CodelixLoader />;
  if (!user) return <Login />;

  // Signed in, but not on the app_users list (or deactivated) → nothing
  if (!hasAccess) return <NoAccess />;

  // Temporary password from an access admin → must be replaced first
  if (mustChangePassword) return <ChangePassword />;

  // ── Employee: only the modules they were granted ──────────────────
  if (isEmployee) {
    const allowed = EMPLOYEE_MODULES.filter(m => m.allowed(can));
    if (allowed.length === 0) return <NoAccess />;
    return (
      <NotificationProvider>
      <ChatProvider>
        <Layout>
          <Routes>
            {allowed.map(m => <Route key={m.key} path={m.path} element={m.element} />)}
            <Route path="*" element={<Navigate to={allowed[0].path} replace />} />
          </Routes>
        </Layout>
      </ChatProvider>
      </NotificationProvider>
    );
  }

  // ── Partner: full app (Settings / user access: access admins only) ─
  return (
    <NotificationProvider>
      <ChatProvider>
      <Layout>
        <Routes>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/reports"      element={<Reports />} />
          <Route path="/crm"          element={<CRM />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/employees"    element={<Employees />} />
          <Route path="/projects"     element={<Projects />} />
          <Route path="/credentials"  element={<Credentials />} />
          <Route path="/tasks"        element={<Work />} />
          <Route path="/existing-projects" element={<ExistingProjects />} />
          <Route path="/chat"         element={<Chat />} />
          {isAccessAdmin && <Route path="/access" element={<Access />} />}
          <Route path="/settings"     element={<Navigate to={isAccessAdmin ? '/access' : '/'} replace />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      </ChatProvider>
    </NotificationProvider>
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
