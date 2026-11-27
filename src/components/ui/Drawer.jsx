// Drawer: a detail / edit panel sliding in from the right, on Radix Dialog.
// Props: isOpen, onClose, title, subtitle, actions, footer, width.
// The panel takes half the screen (never less than MIN_WIDTH, and the whole screen on a phone).
// With `page` it is not a panel at all but a full page over the content area (PageView), used
// for long lists such as a history; `back` names its button.
import * as Dialog from '@radix-ui/react-dialog';
import { RiCloseLine } from '@remixicon/react';
import { focusOnOpen } from './Modal';
import PageView from './PageView';

const MIN_WIDTH = 720;

export default function Drawer({ isOpen, onClose, title, subtitle, actions, footer, width = 520, initialFocus, page = false, back, narrow, children }) {
  if (page) {
    return <PageView isOpen={!!isOpen} onClose={onClose} title={title} subtitle={subtitle} actions={actions} footer={footer} back={back} narrow={narrow}>{children}</PageView>;
  }
  return (
    <Dialog.Root open={!!isOpen} onOpenChange={open => { if (!open) onClose?.(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay ui-overlay">
          <Dialog.Content
            className="drawer ui-drawer"
            style={{ maxWidth: `max(50vw, ${Math.max(width, MIN_WIDTH)}px)` }}
            onOpenAutoFocus={e => focusOnOpen(e, initialFocus)}
            {...(subtitle ? {} : { 'aria-describedby': undefined })}
          >
            <header className="drawer-head">
              <div style={{ minWidth: 0, flex: 1 }}>
                <Dialog.Title className="drawer-title">{title || 'Details'}</Dialog.Title>
                {subtitle && <Dialog.Description asChild><div className="drawer-sub">{subtitle}</div></Dialog.Description>}
              </div>
              {actions}
              <Dialog.Close className="icon-btn plain" aria-label="Close"><RiCloseLine size={20} /></Dialog.Close>
            </header>
            <div className="drawer-body">{children}</div>
            {footer && <footer className="drawer-foot">{footer}</footer>}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
