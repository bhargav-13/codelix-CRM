import { LayoutProvider, useLayout } from '../../contexts/LayoutContext';
import Sidebar from './Sidebar';

function LayoutInner({ children }) {
  const { sidebarOpen, closeSidebar } = useLayout();
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F2F2F7' }}>
      {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}

export default function Layout({ children }) {
  return <LayoutProvider><LayoutInner>{children}</LayoutInner></LayoutProvider>;
}
