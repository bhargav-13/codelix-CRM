import { NavLink } from 'react-router-dom';
import { useLayout } from '../../contexts/LayoutContext';
import { useAuth } from '../../contexts/AuthContext';
import codelixLogo from '../../assets/codelix.svg';
import {
  LayoutDashboard, Users, IndianRupee, UserCheck,
  FolderKanban, KeyRound, Newspaper,
} from 'lucide-react';

const partnerNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard',       to: '/' },
  { icon: Users,           label: 'CRM',              to: '/crm' },
  { icon: IndianRupee,     label: 'Transactions',     to: '/transactions' },
  { icon: UserCheck,       label: 'Employees',        to: '/employees' },
  { icon: FolderKanban,    label: 'Projects',         to: '/projects' },
  { icon: KeyRound,        label: 'Credentials',      to: '/credentials' },
  { icon: Newspaper,       label: 'Project Updates',  to: '/updates' },
];

const employeeNavItems = [
  { icon: Newspaper, label: 'Project Updates', to: '/updates' },
];

// Derive a display name from a partner email, e.g. "bhargav.codelix@gmail.com" → "Bhargav"
function nameFromEmail(email = '') {
  const part = email.split('@')[0].split('.')[0];
  return part.charAt(0).toUpperCase() + part.slice(1);
}

export default function Sidebar() {
  const { sidebarOpen, closeSidebar } = useLayout();
  const { user, isEmployee, employeeData } = useAuth();

  const navItems = isEmployee ? employeeNavItems : partnerNavItems;

  // User footer info
  const displayName = isEmployee
    ? (employeeData?.name ?? user?.email ?? '—')
    : nameFromEmail(user?.email);
  const displayRole = isEmployee
    ? (employeeData?.role ?? 'Employee')
    : 'Partner';
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <aside
      className={`sidebar-aside ${sidebarOpen ? 'mobile-open' : ''}`}
      style={{
        width: 216, minWidth: 216, height: '100vh',
        background: '#ECECF0',
        borderRight: '1px solid rgba(0,0,0,0.07)',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Brand */}
      <div style={{ padding: '20px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.1)', flexShrink: 0,
            padding: 5,
          }}>
            <img src={codelixLogo} alt="Codelix" style={{ width: 20, height: 'auto', display: 'block' }} />
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 650, color: '#1D1D1F', letterSpacing: '-0.3px', lineHeight: 1.2 }}>Codelix</div>
            <div style={{ fontSize: 10.5, color: '#8E8E93', lineHeight: 1.2 }}>IT Solutions</div>
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: 'rgba(0,0,0,0.07)', margin: '0 12px 8px' }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {navItems.map(({ icon: Icon, label, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={closeSidebar}
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={15} strokeWidth={1.9} style={{ flexShrink: 0 }} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: isEmployee
              ? 'linear-gradient(135deg,#34C759,#30D158)'
              : 'linear-gradient(135deg,#0071E3,#0A84FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 10, fontWeight: 600, flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 550, color: '#1D1D1F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName}
            </div>
            <div style={{ fontSize: 10.5, color: '#8E8E93' }}>{displayRole}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
