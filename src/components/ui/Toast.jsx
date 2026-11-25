/* eslint-disable react-refresh/only-export-components */
// Toasts on Radix Toast: animated in and out, pause on hover, swipe to dismiss,
// announced to screen readers.
//   const toast = useToast();  toast.success('Saved');  toast.error('Could not save', err);  toast.info('…');
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { RiAlertFill, RiCheckboxCircleFill, RiCloseLine, RiInformationFill } from '@remixicon/react';

const ToastContext = createContext(null);
const ICONS = { error: RiAlertFill, success: RiCheckboxCircleFill, info: RiInformationFill };
const EXIT_MS = 220;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const close = useCallback(id => {
    setItems(xs => xs.map(x => (x.id === id ? { ...x, open: false } : x)));
    setTimeout(() => setItems(xs => xs.filter(x => x.id !== id)), EXIT_MS);   // after the exit animation
  }, []);

  const push = useCallback((kind, message, detail) => {
    const id = Date.now() + Math.random();
    const text = detail ? `${message} — ${detail?.message || detail}` : message;
    setItems(xs => [...xs.slice(-3), { id, kind, text, open: true }]);
  }, []);

  const api = useMemo(() => ({
    success: m => push('success', m),
    error: (m, e) => { if (e) console.error(e); push('error', m, e); },
    info: m => push('info', m),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider swipeDirection="right" label="Notification">
        {children}
        {items.map(t => {
          const Icon = ICONS[t.kind] || RiInformationFill;
          return (
            <ToastPrimitive.Root
              key={t.id} open={t.open} onOpenChange={open => { if (!open) close(t.id); }}
              duration={t.kind === 'error' ? 7000 : 3500} type={t.kind === 'error' ? 'foreground' : 'background'}
              className={`toast ui-toast toast-${t.kind}`}
            >
              <Icon size={18} aria-hidden="true" />
              <ToastPrimitive.Description asChild><span>{t.text}</span></ToastPrimitive.Description>
              <ToastPrimitive.Close className="toast-x" aria-label="Dismiss"><RiCloseLine size={16} /></ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="toast-stack" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

const noopToast = { success() {}, error(m, e) { console.error(m, e); }, info() {} };
export const useToast = () => useContext(ToastContext) || noopToast;
