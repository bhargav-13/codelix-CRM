import { Bell, Menu } from 'lucide-react';
import { useLayout } from '../../contexts/LayoutContext';

export default function Header({ title, subtitle, actions }) {
  const { toggleSidebar } = useLayout();

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

      {/* Right: actions + bell */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {actions}
        <button
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(0,0,0,0.055)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.13s', flexShrink: 0,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.09)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.055)'}
        >
          <Bell size={14} color="#48484A" />
        </button>
      </div>
    </div>
  );
}
