// PageView: a full page laid over the content area (the sidebar stays). Used for records with a
// lot to show (a lead, a project, a ledger entry) and for their add / edit forms, in place of a
// side panel or a popup. Same props as Drawer: isOpen, onClose, title, subtitle, actions, footer.
//   narrow   keeps the content to form width
//   back     label of the back button ("Leads", "Projects" …)
// Esc and the back button close the page on top; a dialog or menu opened from it gets Esc first.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RiArrowLeftLine } from '@remixicon/react';
import './PageView.css';

const open = [];   // the pages showing now, the last one on top
const busy = () => !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]');

export default function PageView({ isOpen, onClose, title, subtitle, actions, footer, back = 'Back', narrow = false, children }) {
  const [box, setBox] = useState(null);
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  // Cover exactly the content area, wherever the sidebar currently ends.
  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    const main = document.getElementById('app-main');
    const measure = () => {
      const r = main ? main.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    measure();
    const watch = main && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    watch?.observe(main);
    window.addEventListener('resize', measure);
    return () => { watch?.disconnect(); window.removeEventListener('resize', measure); };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const me = {};
    open.push(me);
    const onKey = e => {
      if (e.key !== 'Escape' || e.defaultPrevented || open[open.length - 1] !== me || busy()) return;
      closeRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus({ preventScroll: true });
    return () => { document.removeEventListener('keydown', onKey); open.splice(open.indexOf(me), 1); };
  }, [isOpen]);

  if (!isOpen || !box) return null;
  return createPortal(
    <section ref={ref} tabIndex={-1} className={`pv ${narrow ? 'pv-narrow' : ''}`} aria-label={typeof title === 'string' ? title : 'Details'}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
      <header className="pv-head">
        <button type="button" className="mac-btn mac-btn-ghost pv-back" onClick={() => onClose?.()}><RiArrowLeftLine size={18} aria-hidden="true" /> {back}</button>
        <div className="pv-titles">
          <h1 className="pv-title">{title || 'Details'}</h1>
          {subtitle && <div className="pv-sub">{subtitle}</div>}
        </div>
        {actions && <div className="pv-actions">{actions}</div>}
      </header>
      <div className="pv-body"><div className="pv-in">{children}</div></div>
      {footer && <footer className="pv-foot"><div className="pv-in pv-foot-in">{footer}</div></footer>}
    </section>,
    document.body,
  );
}
