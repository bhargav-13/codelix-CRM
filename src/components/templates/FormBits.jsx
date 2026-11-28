// Small form pieces shared by the letter builders (Scope of work, Proposal).
import { useLayoutEffect, useRef } from 'react';
import { Plus, X, ImagePlus, Trash2, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';

// `target` names the part of the document this section edits; opening the section sends a
// bubbling 'sec-open' event so a builder can bring that part into view. `onReset` adds a
// "Reset to default" button (greyed out while `changed` is false).
// With `step`, the form is shown one part at a time: only the section whose `id` is the current
// step is drawn, always open, with its title as a heading.
export const Sec = ({ title, open, children, extra, target, onReset, changed = true, step, id }) => (step !== undefined ? (
  id === step ? (
    <section className="sowf-sec sowf-page" data-target={target} aria-label={title}>
      <div className="sowf-page-head">
        <h2>{title}</h2>
        {onReset && (
          <button type="button" className="mac-btn mac-btn-ghost sowf-reset" onClick={onReset} disabled={!changed}
            title={changed ? `Put back the default ${title.toLowerCase()}` : 'Already the default'}>
            <RotateCcw size={13} aria-hidden="true" /> {changed ? 'Reset to default' : 'Default'}
          </button>
        )}
      </div>
      <div className="sowf-body">{children}</div>
    </section>
  ) : null
) : (
  <details className="sowf-sec" open={open} data-target={target}
    onToggle={e => { if (e.currentTarget.open) e.currentTarget.dispatchEvent(new CustomEvent('sec-open', { bubbles: true })); }}>
    <summary>{title}{extra}</summary>
    <div className="sowf-body">
      {onReset && (
        <button type="button" className="mac-btn mac-btn-ghost sowf-reset" onClick={onReset} disabled={!changed}
          title={changed ? `Put back the default ${title.toLowerCase()}` : 'Already the default'}>
          <RotateCcw size={13} aria-hidden="true" /> {changed ? 'Reset to default' : 'Default'}
        </button>
      )}
      {children}
    </div>
  </details>
));

// A text box that is always as tall as its text (no inner scroll bar), from `rows` lines up.
export function AutoArea({ value, rows = 2, className = 'mac-input', ...rest }) {
  const ref = useRef(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const b = el.offsetHeight - el.clientHeight;          // borders
    el.style.height = `${el.scrollHeight + b}px`;
  };
  useLayoutEffect(fit, [value]);
  // A narrower or wider box wraps the text differently, so fit again when the width changes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; fit(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <textarea ref={ref} className={`${className} sowf-auto`} rows={rows} value={value} {...rest} />;
}

export function TextList({ label, items, onChange, placeholder, addLabel = 'Add' }) {
  const set = (i, v) => onChange(items.map((x, j) => (j === i ? v : x)));
  return (
    <div className="sowf-list">
      {label && <span className="field-label">{label}</span>}
      {items.map((x, i) => (
        <div key={i} className="sowf-line">
          <input className="mac-input" value={x} onChange={e => set(i, e.target.value)} placeholder={placeholder} aria-label={`${label || 'Item'} ${i + 1}`} />
          <button type="button" className="icon-btn plain" aria-label={`Remove item ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><X size={15} /></button>
        </div>
      ))}
      <button type="button" className="mac-btn mac-btn-ghost sowf-add" onClick={() => onChange([...items, ''])}><Plus size={14} /> {addLabel}</button>
    </div>
  );
}

// cols: [{ k, label, area, num, w, rows }] · `move` adds up/down buttons to change the order ·
// `block(i)` names the document block row i turns into (for scrolling the preview to it)
export function Rows({ rows, onChange, cols, blank, addLabel, name, move = false, block }) {
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const swap = (i, j) => { if (j < 0 || j >= rows.length) return; const n = [...rows]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return (
    <div className="sowf-list">
      {rows.map((r, i) => (
        <div key={i} className="sowf-row" data-block={block ? block(i) : undefined}>
          <div className="sowf-row-fields">
            {cols.map(c => c.area
              ? <AutoArea key={c.k} rows={c.rows || 2} value={r[c.k] ?? ''} onChange={e => set(i, c.k, e.target.value)} placeholder={c.label} aria-label={`${name} ${i + 1}: ${c.label}`} />
              : <input key={c.k} className="mac-input" type={c.num ? 'number' : 'text'} min={c.num ? 0 : undefined} value={r[c.k] ?? ''} onChange={e => set(i, c.k, e.target.value)}
                  placeholder={c.label} aria-label={`${name} ${i + 1}: ${c.label}`} style={c.w ? { flex: `0 0 ${c.w}px` } : undefined} />)}
          </div>
          <span className="sowf-row-tools">
            {move && <button type="button" className="icon-btn plain" aria-label={`Move ${name} ${i + 1} up`} disabled={i === 0} onClick={() => swap(i, i - 1)}><ArrowUp size={14} /></button>}
            {move && <button type="button" className="icon-btn plain" aria-label={`Move ${name} ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown size={14} /></button>}
            <button type="button" className="icon-btn plain" aria-label={`Remove ${name} ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}><X size={15} /></button>
          </span>
        </div>
      ))}
      <button type="button" className="mac-btn mac-btn-ghost sowf-add" onClick={() => onChange([...rows, { ...(typeof blank === 'function' ? blank(rows) : blank) }])}><Plus size={14} /> {addLabel}</button>
    </div>
  );
}

export function ImagePick({ label, hint, value, onPick, onClear, wide, clearLabel = 'Remove' }) {
  const input = useRef(null);
  return (
    <div className="sowf-img">
      <span className={`sowf-img-box ${wide ? 'wide' : ''}`} style={value ? { backgroundImage: `url("${value}")` } : undefined}>{!value && <ImagePlus size={18} aria-hidden="true" />}</span>
      <span className="sowf-img-text">
        <span className="field-label">{label}</span>
        <span className="field-hint">{hint}</span>
        <span className="sowf-img-actions">
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => input.current?.click()}>{value ? 'Change' : 'Choose image'}</button>
          {onClear && <button type="button" className="mac-btn mac-btn-ghost" onClick={onClear}><Trash2 size={14} /> {clearLabel}</button>}
        </span>
      </span>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

export const Toggle = ({ checked, onChange, children }) => (
  <label className="sowf-toggle"><input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} /> <span>{children}</span></label>
);
