import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Menu, LogOut, CheckSquare } from 'lucide-react';
import { useLayout } from '../../contexts/LayoutContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications() || {};
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(0,0,0,0.055)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.13s', flexShrink: 0, position: 'relative',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.09)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.055)'}
      >
        <Bell size={14} color="#48484A" />
        {!!unreadCount && (
          <span style={{
            position: 'absolute', top: -1, right: -1, minWidth: 15, height: 15, padding: '0 3px',
            borderRadius: 8, background: '#FF3B30', color: '#fff', fontSize: 9.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #F2F2F7',
          }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 40, right: 0, width: 340, maxHeight: 420,
          background: '#fff', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
          display: 'flex', flexDirection: 'column', zIndex: 100, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <span style={{ fontSize: 13.5, fontWeight: 650, color: '#1D1D1F' }}>Notifications</span>
            {!!unreadCount && (
              <button onClick={markAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0071E3', fontSize: 12, fontWeight: 600, padding: 0 }}>
                Mark all read
              </button>
            )}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {(!notifications || notifications.length === 0) ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#AEAEB2', fontSize: 12.5 }}>No notifications yet</div>
            ) : notifications.map(n => (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.read) markRead(n.id);
                  // open the issue it is about (Work page reads ?issue=)
                  if (n.taskId) { setOpen(false); navigate(`/tasks?issue=${n.taskId}`); }
                }}
                style={{
                  display: 'flex', gap: 10, padding: '11px 14px', cursor: n.read && !n.taskId ? 'default' : 'pointer',
                  background: n.read ? '#fff' : 'rgba(0,113,227,0.045)',
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'rgba(0,113,227,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckSquare size={12} color="#0071E3" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', lineHeight: 1.4 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 11.5, color: '#8E8E93', marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>}
                  <div style={{ fontSize: 10.5, color: '#C7C7CC', marginTop: 4 }}>{fmtWhen(n.createdAt)}</div>
                </div>
                {!n.read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0071E3', flexShrink: 0, marginTop: 4 }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Header({ title, subtitle, actions }) {
  const { toggleSidebar } = useLayout();
  const { user, logout } = useAuth();

  return (
    <div
      className="page-header"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px',
        background: 'rgba(242,242,247,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
        position: 'sticky', top: 0, zIndex: 10,
        gap: 12,
      }}
    >
      {/* Left: hamburger (mobile) + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <button
          className="mobile-menu-btn"
          onClick={toggleSidebar}
          style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'rgba(0,0,0,0.06)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Menu size={16} color="#1D1D1F" />
        </button>

        <div style={{ minWidth: 0 }}>
          <h1 style={{
            fontSize: 20, fontWeight: 650, color: '#1D1D1F',
            letterSpacing: '-0.5px', lineHeight: 1.2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              fontSize: 12, color: '#8E8E93', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right: actions + bell + user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {actions}
        <NotificationBell />

        {/* User avatar + logout */}
        {user && (
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div
              title={user.email}
              style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'linear-gradient(135deg,#0071E3,#0A84FF)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0,
                cursor: 'default',
              }}
            >
              {(user.email?.[0] || '?').toUpperCase()}
            </div>
            <button
              onClick={logout}
              title="Sign out"
              style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'rgba(255,59,48,0.07)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.13s', flexShrink: 0,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,59,48,0.14)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,59,48,0.07)'}
            >
              <LogOut size={13} color="#FF3B30"/>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
