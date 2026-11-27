/* eslint-disable react-refresh/only-export-components */
// Shared UX building blocks. Every page uses these instead of hand-rolled
// inline-styled copies, so behaviour (errors, loading, empty, keyboard) is the
// same everywhere. They are thin wrappers over the design-system components in
// this folder (Button, Dropdown, Drawer, Toast, Avatar … built on Radix with the
// AlignUI tokens); the exports and props here are the stable API pages rely on.
// Styles for the layout pieces live in src/index.css under "UX KIT".
import { rupees } from '../../lib/money';
import { useEffect, useId, useRef } from 'react';
import { RiAlertLine, RiCloseLine, RiMoreLine, RiRefreshLine, RiSearchLine } from '@remixicon/react';
import { Dropdown } from './Dropdown';
import { Avatar as BaseAvatar } from './Avatar';
import { PersonAvatar, usePerson } from './Person';

export { ToastProvider, useToast } from './Toast';
export { default as Drawer } from './Drawer';

// ── Overlay behaviour for hand-built pop-ups ──────────────────────
// Modal and Drawer no longer need this (Radix Dialog does it); it stays for any
// page that builds its own overlay. Esc closes, focus moves inside, and a click
// on the backdrop only closes when the press also STARTED on the backdrop.
const overlayStack = [];   // open overlays, topmost last — only the top one reacts to Esc
export function useOverlay(isOpen, onClose) {
  const ref = useRef(null);
  const downOnBackdrop = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.activeElement;
    const token = {};
    overlayStack.push(token);
    const onKey = e => { if (e.key === 'Escape' && overlayStack[overlayStack.length - 1] === token) { e.stopPropagation(); onCloseRef.current?.(); } };
    document.addEventListener('keydown', onKey);
    if (!ref.current?.contains(document.activeElement)) {
      const first = ref.current?.querySelector('input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
      (first || ref.current)?.focus?.();
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      overlayStack.splice(overlayStack.indexOf(token), 1);
      prev?.focus?.();
    };
  }, [isOpen]);
  const backdropProps = {
    onMouseDown: e => { downOnBackdrop.current = e.target === e.currentTarget; },
    onClick: e => { if (e.target === e.currentTarget && downOnBackdrop.current) onClose?.(); },
  };
  return { ref, backdropProps };
}

// ── Form field: label wired to its control, hint and error text ───
// <Field label="Amount" required error={errors.amount}>{id => <input id={id} className="mac-input" …/>}</Field>
// (children may also be a plain element; the label then wraps it.)
export function Field({ label, required, hint, error, children, span }) {
  const id = useId();
  const isFn = typeof children === 'function';
  const body = (
    <>
      <span className="field-label">{label}{required && <span className="field-req" aria-hidden="true"> *</span>}</span>
      {isFn ? children(id) : children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </>
  );
  const style = span ? { gridColumn: `span ${span}` } : undefined;
  return isFn
    ? <div className={`field ${error ? 'has-error' : ''}`} style={style}><label htmlFor={id} style={{ display: 'contents' }}>{body}</label></div>
    : <label className={`field ${error ? 'has-error' : ''}`} style={style}>{body}</label>;
}
export const FormGrid = ({ cols = 2, children }) => <div className={`form-grid form-grid-${cols}`}>{children}</div>;
export const FormSection = ({ title, children }) => (
  <section className="form-section">{title && <h3 className="form-section-title">{title}</h3>}{children}</section>
);

// ── Toolbar: search + filters on one line, with a result count ────
export function Toolbar({ search, onSearch, placeholder = 'Search…', children, right }) {
  return (
    <div className="toolbar">
      {onSearch && (
        <div className="toolbar-search">
          <RiSearchLine size={17} aria-hidden="true" />
          <input value={search} onChange={e => onSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
          {search && <button type="button" onClick={() => onSearch('')} aria-label="Clear search"><RiCloseLine size={16} /></button>}
        </div>
      )}
      {children}
      {right && <div className="toolbar-right">{right}</div>}
    </div>
  );
}
// Single-select filter chips, e.g. status tabs. options: [{ value, label, count }]
export function Chips({ options, value, onChange, label }) {
  return (
    <div className="chips" role="tablist" aria-label={label}>
      {options.map(o => (
        <button key={o.value ?? 'all'} type="button" role="tab" aria-selected={value === o.value}
          className={`chip ${value === o.value ? 'active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}{o.count != null && <span className="chip-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Headline numbers ──────────────────────────────────────────────
export function StatTiles({ items }) {
  return (
    <div className="stat-row">
      {items.map(({ label, value, sub, icon: Icon, tone, onClick }) => {
        const Tag = onClick ? 'button' : 'div';
        return (
          <Tag key={label} type={onClick ? 'button' : undefined} className={`stat ${tone ? `stat-${tone}` : ''} ${onClick ? 'stat-click' : ''}`} onClick={onClick}>
            {Icon && <span className="stat-icon"><Icon size={18} /></span>}
            <span style={{ minWidth: 0 }}>
              <span className="stat-label">{label}</span>
              <span className="stat-value">{value}</span>
              {sub && <span className="stat-sub">{sub}</span>}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

// ── Loading, empty and failed states ──────────────────────────────
export function SkeletonRows({ rows = 6 }) {
  return (
    <div className="mac-card skeleton-card" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton-row"><span /><span /><span /></div>)}
    </div>
  );
}
export function EmptyPanel({ icon: Icon, title, text, action }) {
  return (
    <div className="mac-card empty-panel">
      {Icon && <span className="empty-icon"><Icon size={22} /></span>}
      <div className="empty-title">{title}</div>
      {text && <div className="empty-text">{text}</div>}
      {action}
    </div>
  );
}
export function ErrorPanel({ title = 'Could not load this page', error, onRetry }) {
  return (
    <div className="mac-card empty-panel" role="alert">
      <span className="empty-icon" style={{ color: 'var(--bad)', background: 'var(--bad-soft)', boxShadow: 'none' }}><RiAlertLine size={22} /></span>
      <div className="empty-title">{title}</div>
      <div className="empty-text">{error?.message || 'Check your connection and try again.'}</div>
      {onRetry && <button type="button" className="mac-btn mac-btn-secondary" onClick={onRetry}><RiRefreshLine size={16} /> Try again</button>}
    </div>
  );
}

// ── Row actions menu (⋯) — Radix dropdown: arrow keys, type-ahead, Esc, and it
// is never clipped by the table it sits in. items: [{ label, icon, onClick, danger }]
// The action runs one frame after the menu starts closing, so a dialog it opens
// takes focus cleanly.
export function RowMenu({ items, label = 'Actions' }) {
  const list = (items || []).filter(Boolean);
  return (
    <span className="row-menu" onClick={e => e.stopPropagation()}>
      <Dropdown.Root modal={false}>
        <Dropdown.Trigger asChild>
          <button type="button" className="icon-btn plain" aria-label={label}><RiMoreLine size={20} /></button>
        </Dropdown.Trigger>
        <Dropdown.Content align="end" onClick={e => e.stopPropagation()}>
          {list.map(({ label: l, icon, onClick, danger }) => (
            <Dropdown.Item key={l} icon={icon} danger={danger} onSelect={() => requestAnimationFrame(() => onClick?.())}>{l}</Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Root>
    </span>
  );
}

// ── Avatar ────────────────────────────────────────────────────────
// <Avatar name="Asha Rao" />                         initials (or the photo, when exactly
//                                                    one person in the directory has that name)
// <Avatar person={{ kind, id, name }} />             photo + link to their profile + hover card
// <Avatar name="…" src={url} status="online" />      explicit photo / status dot
function NamedAvatar({ name, src, ...rest }) {
  const match = usePerson(src ? null : name || null);
  return <BaseAvatar name={name} src={src || match?.avatarUrl} {...rest} />;
}
export function Avatar({ person, name = '', size = 32, src, ...rest }) {
  if (person && typeof person === 'object') return <PersonAvatar person={person} size={size} {...rest} />;
  return <NamedAvatar name={name || (typeof person === 'string' ? person : '')} size={size} src={src} {...rest} />;
}

// Money and dates, one format everywhere (India)
// whole rupees stay short; anything with paise shows both decimals
// ₹12,50,000 below one crore, ₹2.36 Cr. from one crore up (see lib/money.js)
export const fmtMoney = n => { const v = Number(n || 0); return (v < 0 ? '-' : '') + rupees(v); };
export const fmtDate = d => {
  if (!d) return '—';
  const x = new Date(String(d).length <= 10 ? `${d}T00:00:00` : d);
  return isNaN(x) ? String(d) : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
// Local (IST) calendar date as YYYY-MM-DD — never use toISOString() for "today"
export const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
