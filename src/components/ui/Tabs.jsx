// Segmented control and tab list with ONE indicator that slides between options.
//   <SegmentedControl value={v} onChange={setV} options={[{ value, label, icon }]} />
//   <TabList value={tab} onChange={setTab} options={[{ value, label, count }]} />   ← underline style
// Arrow keys move between options (roving tabindex), Home/End jump to the ends.
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { cn } from './cn';

// Measures the active button and returns the style for the sliding indicator.
function useIndicator(value) {
  const listRef = useRef(null);
  const [box, setBox] = useState(null);
  const measure = useCallback(() => {
    const list = listRef.current;
    const el = list?.querySelector('[data-active="true"]');
    if (!list || !el) { setBox(null); return; }
    setBox({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
  }, []);
  useLayoutEffect(() => {
    measure();
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    list.querySelectorAll('[role="tab"], [role="radio"]').forEach(n => ro.observe(n));
    return () => ro.disconnect();
  }, [value, measure]);
  return { listRef, box };
}

function onArrowKeys(e, options, value, onChange) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  const enabled = options.filter(o => !o.disabled);
  let next;
  if (e.key in keys) {
    const i = enabled.findIndex(o => o.value === value);
    next = enabled[(i + keys[e.key] + enabled.length) % enabled.length];
  } else if (e.key === 'Home') next = enabled[0];
  else if (e.key === 'End') next = enabled[enabled.length - 1];
  if (!next) return;
  e.preventDefault();
  onChange?.(next.value);
  const list = e.currentTarget;
  requestAnimationFrame(() => list.querySelector('[data-active="true"]')?.focus());
}

export function SegmentedControl({ options, value, onChange, size = 'medium', fullWidth, label, className }) {
  const { listRef, box } = useIndicator(value);
  return (
    <div
      ref={listRef} role="radiogroup" aria-label={label}
      onKeyDown={e => onArrowKeys(e, options, value, onChange)}
      className={cn('relative inline-flex gap-0.5 rounded-10 bg-bg-weak-50 p-1 ring-1 ring-inset ring-stroke-soft-200', fullWidth && 'flex w-full', className)}
    >
      <span
        aria-hidden="true"
        className={cn('pointer-events-none absolute rounded-md bg-bg-white-0 shadow-regular-sm ring-1 ring-stroke-soft-200 dark:bg-bg-soft-200',
          'transition-[left,top,width,height,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]', !box && 'opacity-0')}
        style={box || undefined}
      />
      {options.map(({ value: v, label: l, icon: Icon, disabled }) => {
        const active = v === value;
        return (
          <button
            key={String(v)} type="button" role="radio" aria-checked={active} data-active={active} disabled={disabled}
            tabIndex={active ? 0 : -1} onClick={() => onChange?.(v)}
            className={cn(
              'relative z-[1] inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-label-sm outline-none',
              'transition-colors duration-150 focus-visible:shadow-focus-ring disabled:pointer-events-none disabled:text-text-disabled-300',
              size === 'small' ? 'h-7 px-2.5 text-label-xs' : 'h-8',
              fullWidth && 'flex-1',
              active ? 'text-primary-text' : 'text-text-sub-600 hover:text-text-strong-950',
            )}
          >
            {Icon && <Icon size={16} aria-hidden="true" />}{l}
          </button>
        );
      })}
    </div>
  );
}

export function TabList({ options, value, onChange, label, className }) {
  const { listRef, box } = useIndicator(value);
  return (
    <div
      ref={listRef} role="tablist" aria-label={label}
      onKeyDown={e => onArrowKeys(e, options, value, onChange)}
      className={cn('relative flex gap-5 overflow-x-auto border-b border-stroke-soft-200 [scrollbar-width:none]', className)}
    >
      {options.map(({ value: v, label: l, icon: Icon, count, disabled }) => {
        const active = v === value;
        return (
          <button
            key={String(v)} type="button" role="tab" aria-selected={active} data-active={active} disabled={disabled}
            tabIndex={active ? 0 : -1} onClick={() => onChange?.(v)}
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md text-label-sm outline-none transition-colors duration-150',
              'focus-visible:shadow-focus-ring disabled:pointer-events-none disabled:text-text-disabled-300',
              active ? 'text-text-strong-950' : 'text-text-sub-600 hover:text-text-strong-950',
            )}
          >
            {Icon && <Icon size={18} aria-hidden="true" className={active ? 'text-primary-text' : 'text-text-soft-400'} />}
            {l}
            {count != null && <span className="rounded-full bg-bg-weak-50 px-1.5 text-label-xs tabular-nums text-text-sub-600">{count}</span>}
          </button>
        );
      })}
      <span
        aria-hidden="true"
        className={cn('pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-primary-base transition-[left,width,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]', !box && 'opacity-0')}
        style={box ? { left: box.left, width: box.width } : undefined}
      />
    </div>
  );
}

export default SegmentedControl;
