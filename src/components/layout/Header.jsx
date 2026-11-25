// Top bar of every page: <Header title subtitle actions />
// Left: menu button (phones) + title. Right: the page's own actions, then the
// global "Search or jump to…" (Ctrl/Cmd+K), notifications and the account menu.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Popover from '@radix-ui/react-popover';
import { RiCheckDoubleLine, RiMenuLine, RiNotification3Line, RiSearchLine, RiTaskLine } from '@remixicon/react';
import { useLayout } from '../../contexts/LayoutContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import { Kbd, modKey } from '../ui/Kbd';
import UserMenu from './UserMenu';
import { useMeSummary, useShell } from './shell';

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
  const list = notifications || [];

  function openItem(n) {
    if (!n.read) markRead?.(n.id);
    // open the issue it is about (Work page reads ?issue=)
    if (n.taskId) { setOpen(false); navigate(`/tasks?issue=${n.taskId}`); }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip content="Notifications" disabled={open}>
        <Popover.Trigger asChild>
          <button type="button" className="icon-btn" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
            <RiNotification3Line size={18} />
            {!!unreadCount && <span className="hdr-dot" aria-hidden="true">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} collisionPadding={12}
          className="ui-pop z-[60] flex max-h-[min(460px,70dvh)] w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-16 border border-stroke-soft-200 bg-bg-white-0 shadow-regular-md outline-none"
          style={{ '--ui-origin': 'var(--radix-popover-content-transform-origin)' }}>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stroke-soft-200 px-4 py-3">
            <span className="text-label-sm text-text-strong-950">Notifications</span>
            {!!unreadCount && (
              <button type="button" onClick={markAllRead}
                className="inline-flex items-center gap-1 rounded-md text-label-xs text-primary-text outline-none transition-colors hover:underline focus-visible:shadow-focus-ring">
                <RiCheckDoubleLine size={14} aria-hidden="true" /> Mark all read
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="empty-icon" style={{ margin: 0 }}><RiNotification3Line size={20} /></span>
                <div className="text-label-sm text-text-strong-950">You are all caught up</div>
                <div className="text-paragraph-xs text-text-sub-600">New task assignments and mentions show up here.</div>
              </div>
            ) : list.map(n => {
              const clickable = !n.read || !!n.taskId;
              const Row = clickable ? 'button' : 'div';
              return (
                <Row key={n.id} {...(clickable ? { type: 'button', onClick: () => openItem(n) } : {})}
                  className={`flex w-full gap-3 border-b border-stroke-soft-200 px-4 py-3 text-left outline-none transition-colors duration-150 last:border-b-0 ${clickable ? 'cursor-pointer hover:bg-bg-weak-50 focus-visible:bg-bg-weak-50' : ''} ${n.read ? '' : 'bg-primary-alpha-10'}`}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-alpha-10 text-primary-text"><RiTaskLine size={16} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-label-sm text-text-strong-950">{n.title}</span>
                    {n.body && <span className="mt-0.5 block text-paragraph-xs text-text-sub-600">{n.body}</span>}
                    <span className="mt-1 block text-paragraph-xs text-text-soft-400">{fmtWhen(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary-base" aria-label="Unread" />}
                </Row>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default function Header({ title, subtitle, actions }) {
  const { toggleSidebar } = useLayout();
  const { openPalette } = useShell();
  const meInfo = useMeSummary();

  return (
    <header className="page-header">
      {/* Left: menu (phones) + title */}
      <div className="hdr-main" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <button type="button" className="icon-btn mobile-menu-btn" onClick={toggleSidebar} aria-label="Open menu" aria-controls="app-sidebar">
          <RiMenuLine size={18} />
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>

      {/* Page actions — on phones they move to their own swipeable row */}
      {actions && <div className="hdr-actions">{actions}</div>}

      {/* Right: search, notifications, account */}
      <div className="hdr-user" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button type="button" className="hdr-search" onClick={openPalette} aria-label="Search or jump to" aria-keyshortcuts="Control+K Meta+K">
          <RiSearchLine size={17} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span>Search or jump to…</span>
          <Kbd>{modKey()} K</Kbd>
        </button>
        <NotificationBell />
        <UserMenu side="bottom" align="end">
          <button type="button" className="hdr-avatar" aria-label={`Account menu for ${meInfo.name}`}>
            <Avatar name={meInfo.name} src={meInfo.avatarUrl} size={32} title="" />
          </button>
        </UserMenu>
      </div>
    </header>
  );
}
