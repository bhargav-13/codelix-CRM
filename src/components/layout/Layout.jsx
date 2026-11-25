import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LayoutProvider, useLayout } from '../../contexts/LayoutContext';
import '../ui/theme';                         // applies the saved light/dark choice
import ErrorBoundary from '../ui/ErrorBoundary';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import { ChangePasswordDialog } from './PasswordForm';
import { ShellContext } from './shell';

const COLLAPSE_KEY = 'codelix.sidebar';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === 'collapsed'; } catch { return false; } };

function LayoutInner({ children }) {
  const { sidebarOpen, closeSidebar } = useLayout();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const mainRef = useRef(null);

  const toggleCollapsed = useCallback(() => setCollapsed(c => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? 'expanded' : 'collapsed'); } catch { /* storage blocked — lasts for this visit */ }
    return !c;
  }), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openChangePassword = useCallback(() => setPasswordOpen(true), []);
  const shell = useMemo(() => ({ collapsed, toggleCollapsed, openPalette, openChangePassword }),
    [collapsed, toggleCollapsed, openPalette, openChangePassword]);

  // Ctrl/Cmd+K → search · Ctrl/Cmd+B → collapse or expand the sidebar
  useEffect(() => {
    const onKey = e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === 'k') { e.preventDefault(); setPaletteOpen(o => !o); }
      else if (key === 'b' && !e.target?.isContentEditable) { e.preventDefault(); toggleCollapsed(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

  // a new page starts at the top
  useEffect(() => { mainRef.current?.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);

  return (
    <ShellContext.Provider value={shell}>
      <div className="app-shell" data-collapsed={collapsed}>
        {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} aria-hidden="true" />}
        <Sidebar />
        <main ref={mainRef} className="app-main" id="app-main">
          {/* keyed by path: each page fades in */}
          <div key={pathname} className="route-view">
            {/* a page that crashes shows a card here; the menu keeps working */}
            <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ChangePasswordDialog isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </ShellContext.Provider>
  );
}

export default function Layout({ children }) {
  return <ErrorBoundary fullScreen><LayoutProvider><LayoutInner>{children}</LayoutInner></LayoutProvider></ErrorBoundary>;
}
