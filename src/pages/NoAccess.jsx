import { useAuth } from '../contexts/AuthContext';
import { Lock, LogOut } from 'lucide-react';

export default function NoAccess() {
  const { user, employeeData, logout } = useAuth();

  const name     = employeeData?.name  || user?.email || 'there';
  const role     = employeeData?.role  || null;
  const empId    = employeeData?.empId || null;
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F2F2F7 0%, #E5E5EA 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: 420, textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
      }}>

        {/* Avatar */}
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'linear-gradient(135deg,#0071E3,#0A84FF)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 24, fontWeight: 700,
          boxShadow: '0 8px 28px rgba(0,113,227,0.3)',
          marginBottom: 20,
        }}>
          {initials}
        </div>

        {/* Welcome */}
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.6px', margin: '0 0 6px' }}>
          Welcome, {name.split(' ')[0]}
        </h1>

        {role && (
          <p style={{ fontSize: 13.5, color: '#8E8E93', margin: '0 0 4px' }}>{role}</p>
        )}
        {empId && (
          <p style={{ fontSize: 12, color: '#AEAEB2', margin: 0 }}>ID: {empId}</p>
        )}

        {/* Card */}
        <div style={{
          marginTop: 28,
          width: '100%',
          background: '#fff',
          borderRadius: 20,
          padding: '28px 28px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)',
          border: '1px solid rgba(0,0,0,0.06)',
        }}>
          {/* Lock icon */}
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'rgba(0,113,227,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Lock size={22} color="#0071E3"/>
          </div>

          <h2 style={{ fontSize: 17, fontWeight: 650, color: '#1D1D1F', letterSpacing: '-0.3px', margin: '0 0 10px' }}>
            Access Not Configured Yet
          </h2>
          <p style={{ fontSize: 13.5, color: '#6E6E73', lineHeight: 1.6, margin: 0 }}>
            Your account has been created. Your manager will assign feature access to your account soon.
          </p>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(0,0,0,0.07)', margin: '20px 0' }}/>

          {/* Signed in as */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 10,
            background: 'rgba(0,0,0,0.025)',
          }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#0071E3,#0A84FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 12.5, fontWeight: 550, color: '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </div>
              <div style={{ fontSize: 11, color: '#AEAEB2', marginTop: 1 }}>Signed in as Employee</div>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          style={{
            marginTop: 18,
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '10px 20px', borderRadius: 11,
            background: 'rgba(255,59,48,0.08)',
            border: '1px solid rgba(255,59,48,0.15)',
            color: '#FF3B30', fontSize: 13.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.14s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,59,48,0.14)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,59,48,0.08)'}
        >
          <LogOut size={14}/> Sign Out
        </button>
      </div>
    </div>
  );
}
