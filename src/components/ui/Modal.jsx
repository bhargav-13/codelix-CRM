/* eslint-disable react-refresh/only-export-components */
// Modal on Radix Dialog. Same props as before (isOpen, onClose, title, size,
// footer) — plus optional `description` and `initialFocus` (a ref).
//  • Esc closes; a press that STARTS on the backdrop closes (selecting text and
//    releasing outside does not).
//  • Focus is trapped inside and returns to the opener on close.
//  • Opens and closes with an animation; a bottom sheet on phones.
// Pass `footer` for the action row so it stays visible while the body scrolls.
import * as Dialog from '@radix-ui/react-dialog';
import { RiCloseLine } from '@remixicon/react';
import PageView from './PageView';

const SIZES = { sm: '440px', md: '560px', lg: '680px', xl: '860px', full: '1060px' };

// Keep a control the page focused itself (autoFocus); otherwise the first form
// field; otherwise the panel, so screen readers start at the title.
export function focusOnOpen(event, initialFocus) {
  const panel = event.currentTarget;
  event.preventDefault();
  if (initialFocus?.current) { initialFocus.current.focus(); return; }
  if (panel.contains(document.activeElement) && document.activeElement !== panel) return;
  const first = panel.querySelector('input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
  (first || panel).focus({ preventScroll: true });
}

// `page`: no popup. The same content opens as a full page over the content area (`back` names its button).
export default function Modal({ isOpen, onClose, title, description, children, size = 'md', footer, initialFocus, className = '', page = false, back }) {
  if (page) {
    return <PageView isOpen={!!isOpen} onClose={onClose} title={title} subtitle={description} footer={footer} back={back} narrow>{children}</PageView>;
  }
  return (
    <Dialog.Root open={!!isOpen} onOpenChange={open => { if (!open) onClose?.(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay ui-overlay">
          <Dialog.Content
            className={`modal-content ui-dialog ${className}`}
            style={{ maxWidth: SIZES[size] || SIZES.md }}
            onOpenAutoFocus={e => focusOnOpen(e, initialFocus)}
            {...(description ? {} : { 'aria-describedby': undefined })}
          >
            <div className="modal-head">
              <div style={{ minWidth: 0 }}>
                <Dialog.Title className="modal-title">{title || 'Dialog'}</Dialog.Title>
                {description && <Dialog.Description className="drawer-sub">{description}</Dialog.Description>}
              </div>
              <Dialog.Close className="icon-btn plain" aria-label="Close"><RiCloseLine size={20} /></Dialog.Close>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
