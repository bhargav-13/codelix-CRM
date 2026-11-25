// Drawer: a detail / edit panel sliding in from the right, on Radix Dialog.
// Props unchanged: isOpen, onClose, title, subtitle, actions, footer, width.
import * as Dialog from '@radix-ui/react-dialog';
import { RiCloseLine } from '@remixicon/react';
import { focusOnOpen } from './Modal';

export default function Drawer({ isOpen, onClose, title, subtitle, actions, footer, width = 520, initialFocus, children }) {
  return (
    <Dialog.Root open={!!isOpen} onOpenChange={open => { if (!open) onClose?.(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay ui-overlay">
          <Dialog.Content
            className="drawer ui-drawer"
            style={{ maxWidth: width }}
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
