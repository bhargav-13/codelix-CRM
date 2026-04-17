import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, DollarSign, UserCheck,
  FolderKanban, KeyRound,
} from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',   to: '/' },
  { icon: Users,           label: 'CRM',          to: '/crm' },
  { icon: DollarSign,      label: 'Transactions', to: '/transactions' },
  { icon: UserCheck,       label: 'Employees',    to: '/employees' },
  { icon: FolderKanban,    label: 'Projects',     to: '/projects' },
  { icon: KeyRound,        label: 'Credentials',  to: '/credentials' },
];

export default function Sidebar() {
  return (
    <aside style={{
      width: 216, minWidth: 216, height: '100vh',
      background: '#ECECF0',
      borderRight: '1px solid rgba(0,0,0,0.07)',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, overflow: 'hidden',
    }}>

      {/* Brand */}
      <div style={{ padding: '22px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, #0071E3 0%, #0A84FF 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,113,227,0.35)', flexShrink: 0,
          }}>
            <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '-0.5px' }}>CX</span>
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
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={15} strokeWidth={1.9} style={{ flexShrink: 0 }} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div style={{
        padding: '12px 14px',
        borderTop: '1px solid rgba(0,0,0,0.07)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'linear-gradient(135deg,#0071E3,#0A84FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 10, fontWeight: 600, flexShrink: 0,
          }}>BS</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 550, color: '#1D1D1F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Bhargav Shah
            </div>
            <div style={{ fontSize: 10.5, color: '#8E8E93' }}>Admin</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
