// Main navigation.
//  • Desktop: expanded (248px) ↔ icon rail (68px). In the rail, labels become
//    tooltips, section titles become dividers and the chat count becomes a dot.
//    Toggle with the round handle on the edge or Ctrl/Cmd+B; remembered per browser.
//  • Phone: a slide-in drawer (always the full menu) with focus kept inside and
//    Esc to close.
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { RiArrowLeftSLine, RiExpandUpDownLine } from '@remixicon/react';
import { useLayout } from '../../contexts/LayoutContext';
import { useChat } from '../../contexts/ChatContext';
import codelixLogo from '../../assets/codelix.svg';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import { modKey } from '../ui/Kbd';
import UserMenu from './UserMenu';
import { useMeSummary, useMediaQuery, useNavSections, useShell } from './shell';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Sidebar() {
  const { sidebarOpen, closeSidebar } = useLayout();
  const { collapsed, toggleCollapsed } = useShell();
  const { totalUnread } = useChat() || {};
  const sections = useNavSections();
  const meInfo = useMeSummary();
  const isPhone = useMediaQuery('(max-width: 768px)');
  const rail = collapsed && !isPhone;
  const drawerOpen = isPhone && sidebarOpen;
  const asideRef = useRef(null);
  const { pathname } = useLocation();
  const isActive = to => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`));

  // Phone drawer: move focus in, keep Tab inside, Esc closes, give focus back.
  useEffect(() => {
    if (!drawerOpen) return;
    const aside = asideRef.current;
    const opener = document.activeElement;
    const items = () => [...(aside?.querySelectorAll(FOCUSABLE) || [])].filter(el => el.offsetParent !== null);
    (aside?.querySelector('.sidebar-item.active') || items()[0])?.focus();
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); closeSidebar(); return; }
      if (e.key !== 'Tab') return;
      const list = items();
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (!aside.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  }, [drawerOpen, closeSidebar]);

  return (
    <>
      <aside
        ref={asideRef} id="app-sidebar"
        className={`sidebar-aside ${sidebarOpen ? 'mobile-open' : ''}`}
        aria-label="Main navigation"
        {...(drawerOpen ? { role: 'dialog', 'aria-modal': true } : {})}
      >
        {/* Brand — collapses to the mark */}
        <Link to="/" className="sidebar-brand" onClick={closeSidebar} aria-label="Codelix — go to the home page">
          <span className="sidebar-logo"><img src={codelixLogo} alt="" /></span>
          <span className="sidebar-fade">
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--ink)', lineHeight: '20px', letterSpacing: '-0.011em' }}>Codelix</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', lineHeight: '16px' }}>Office management</span>
          </span>
        </Link>

        <nav className="sidebar-nav" aria-label="Pages">
          {sections.map(section => (
            <div key={section.title} className="sidebar-group" role="group" aria-label={section.title}>
              <div className="sidebar-section" aria-hidden="true"><span>{section.title}</span></div>
              {section.items.map(({ icon: Icon, label, to }) => {
                const unread = to === '/chat' && totalUnread > 0 ? totalUnread : 0;
                return (
                  <Tooltip key={to} content={unread ? `${label} · ${unread} unread` : label} side="right" sideOffset={14} disabled={!rail} delay={120}>
                    {/* a plain string className: the tooltip wrapper merges props and cannot take NavLink's function form */}
                    <Link
                      to={to} onClick={closeSidebar}
                      className={`sidebar-item ${isActive(to) ? 'active' : ''}`}
                      aria-current={isActive(to) ? 'page' : undefined}
                      aria-label={unread ? `${label}, ${unread} unread` : rail ? label : undefined}
                    >
                      <Icon size={20} aria-hidden="true" />
                      <span className="sidebar-fade">{label}</span>
                      {unread > 0 && <span className="nav-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
                    </Link>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Account */}
        <div className="sidebar-foot">
          <UserMenu side={rail ? 'right' : 'top'} align={rail ? 'end' : 'start'} sideOffset={rail ? 14 : 8}>
            <button type="button" className="sidebar-user" aria-label={`Account menu for ${meInfo.name}`} title={rail ? meInfo.name : undefined}>
              <Avatar name={meInfo.name} src={meInfo.avatarUrl} size={32} title="" />
              <span className="sidebar-fade" style={{ flex: 1 }}>
                <span className="sidebar-user-name" style={{ display: 'block' }}>{meInfo.name}</span>
                <span className="sidebar-user-role" style={{ display: 'block' }}>{meInfo.role}</span>
              </span>
              <RiExpandUpDownLine size={16} className="sidebar-fade" style={{ color: 'var(--ink-3)', flexShrink: 0 }} aria-hidden="true" />
            </button>
          </UserMenu>
        </div>
      </aside>

      {/* Collapse / expand handle on the sidebar's edge (desktop) */}
      <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} shortcut={`${modKey()} B`} side="right">
        <button type="button" className="sidebar-toggle" onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="app-sidebar">
          <RiArrowLeftSLine size={16} aria-hidden="true" />
        </button>
      </Tooltip>
    </>
  );
}
