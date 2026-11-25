import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PageLoader } from './components/ui/CodelixLoader';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ChatProvider } from './contexts/ChatContext';
import Layout from './components/layout/Layout';
import CodelixLoader from './components/ui/CodelixLoader';
import { ToastProvider } from './components/ui/kit';
import Login from './pages/Login';
import NoAccess from './pages/NoAccess';
import ChangePassword from './pages/ChangePassword';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Reports = lazy(() => import('./pages/Reports'));
const CRM = lazy(() => import('./pages/CRM'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Employees = lazy(() => import('./pages/Employees'));
const Projects = lazy(() => import('./pages/Projects'));
const Credentials = lazy(() => import('./pages/Credentials'));
const Work = lazy(() => import('./pages/Work'));
const ExistingProjects = lazy(() => import('./pages/ExistingProjects'));
const Chat = lazy(() => import('./pages/Chat'));
const Access = lazy(() => import('./pages/Access'));
const Profile = lazy(() => import('./pages/Profile'));
const PersonProfile = lazy(() => import('./pages/PersonProfile'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Leave = lazy(() => import('./pages/Leave'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Home = lazy(() => import('./pages/Home'));
const Documents = lazy(() => import('./pages/Documents'));
const Templates = lazy(() => import('./pages/Templates'));

// Modules an employee can be granted (keys match the server's module codes)
// The work hub opens if they may see tasks, project boards or their timesheet.
// Their own attendance, leave and payslips need no grant: every employee with a
// login gets them. Home comes first and is everyone's landing page.
const EMPLOYEE_MODULES = [
  { key: 'home', path: '/', element: <Home />, allowed: () => true },
  { key: 'work', path: '/tasks', element: <Work />, allowed: can => can('tasks') || can('projects') || can('timesheet') },
  { key: 'chat', path: '/chat',  element: <Chat />, allowed: can => can('chat') },
  { key: 'attendance', path: '/attendance', element: <Attendance />, allowed: () => true },
  { key: 'leave',      path: '/leave',      element: <Leave />,      allowed: () => true },
  { key: 'payroll',    path: '/payroll',    element: <Payroll />,    allowed: () => true },
];

function AppContent() {
  const { user, loading, hasAccess, isEmployee, isAccessAdmin, mustChangePassword, can } = useAuth();

  if (loading) return <CodelixLoader />;
  if (!user) return <Login />;

  // Signed in, but no access (not linked to an active employee) — or the
  // server could not be reached (NoAccess shows `authError` with a retry)
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
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {allowed.map(m => <Route key={m.key} path={m.path} element={m.element} />)}
            <Route path="/profile" element={<Profile />} />
            <Route path="/people/:kind/:id" element={<PersonProfile />} />
            <Route path="*" element={<Navigate to={allowed[0].path} replace />} />
          </Routes>
          </Suspense>
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
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/reports"      element={<Reports />} />
          <Route path="/crm"          element={<CRM />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/employees"    element={<Employees />} />
          <Route path="/attendance"   element={<Attendance />} />
          <Route path="/leave"        element={<Leave />} />
          <Route path="/payroll"      element={<Payroll />} />
          <Route path="/projects"     element={<Projects />} />
          <Route path="/credentials"  element={<Credentials />} />
          <Route path="/tasks"        element={<Work />} />
          <Route path="/existing-projects" element={<ExistingProjects />} />
          <Route path="/chat"         element={<Chat />} />
          <Route path="/documents"    element={<Documents />} />
          <Route path="/templates"    element={<Templates />} />
          <Route path="/profile"      element={<Profile />} />
          <Route path="/people/:kind/:id" element={<PersonProfile />} />
          {isAccessAdmin && <Route path="/access" element={<Access />} />}
          <Route path="/settings"     element={<Navigate to={isAccessAdmin ? '/access' : '/'} replace />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </Layout>
      </ChatProvider>
    </NotificationProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
