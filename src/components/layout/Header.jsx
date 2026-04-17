import { Bell } from 'lucide-react';

export default function Header({ title, subtitle, actions }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 32px',
      background: 'rgba(242,242,247,0.92)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(0,0,0,0.07)',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 650, color: '#1D1D1F', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 12, color: '#8E8E93', marginTop: 2 }}>{subtitle}</p>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {actions}
        <button style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(0,0,0,0.055)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.13s',
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
