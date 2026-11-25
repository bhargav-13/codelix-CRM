/* eslint-disable react-refresh/only-export-components */
// Small building blocks shared by the Work views. Layout lives in work.css.
import { useState, useRef, useEffect } from 'react';
import {
  ChevronsUp, ChevronUp, ChevronDown, ChevronsDown, Equal, Bug, CheckSquare, Bookmark, Zap,
  CornerDownRight, X, Check, Plus, Loader2,
} from 'lucide-react';
import { STATUSES } from '../../lib/work';
import { todayLocal } from '../ui/kit';

// Hues are the --wk-<hue> variables in work.css (text/icon colour, -bg tint, -solid fill),
// which have a .dark override — never a literal colour here.
const hue = h => ({ color: `var(--wk-${h})`, bg: `var(--wk-${h}-bg)`, solid: `var(--wk-${h}-solid)` });
export const STATUS_META = {
  'Backlog':     { dot: 'var(--ink-3)',           bg: 'var(--surface-2)',      text: 'var(--ink-2)' },
  'To Do':       { dot: 'var(--wk-blue)',         bg: 'var(--wk-blue-bg)',     text: 'var(--wk-blue)' },
  'In Progress': { dot: 'var(--wk-orange)',       bg: 'var(--wk-orange-bg)',   text: 'var(--wk-orange)' },
  'In Review':   { dot: 'var(--wk-purple)',       bg: 'var(--wk-purple-bg)',   text: 'var(--wk-purple)' },
  'Done':        { dot: 'var(--wk-green)',        bg: 'var(--wk-green-bg)',    text: 'var(--wk-green)' },
};
export const TYPE_META = {
  Epic:    { icon: Zap,             ...hue('purple') },
  Story:   { icon: Bookmark,        ...hue('green') },
  Task:    { icon: CheckSquare,     ...hue('blue') },
  Bug:     { icon: Bug,             ...hue('red') },
  Subtask: { icon: CornerDownRight, ...hue('sky') },
};
export const PRIORITY_META = {
  Highest: { icon: ChevronsUp,   color: 'var(--wk-red)' },
  High:    { icon: ChevronUp,    color: 'var(--wk-orange)' },
  Medium:  { icon: Equal,        color: 'var(--wk-yellow)' },
  Low:     { icon: ChevronDown,  color: 'var(--wk-blue)' },
  Lowest:  { icon: ChevronsDown, color: 'var(--wk-grey)' },
};
const PERSON_COLORS = ['blue', 'green', 'orange', 'purple', 'pink', 'sky', 'yellow', 'teal'].map(h => hue(h).solid);
const LABEL_COLORS = ['blue', 'green', 'orange', 'purple', 'red', 'teal', 'pink'].map(hue);
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const personColor = p => PERSON_COLORS[hash(`${p?.kind}:${p?.id ?? p?.name ?? ''}`) % PERSON_COLORS.length];
const labelColor = l => LABEL_COLORS[hash(l) % LABEL_COLORS.length];
const initials = (n = '') => n.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

export const samePerson = (a, b) => !!a && !!b && a.kind === b.kind && String(a.id) === String(b.id);
export const personKey = p => `${p.kind}:${p.id}`;
export const asPerson = p => ({ id: p.id, name: p.name, kind: p.kind });

// ── Local calendar dates (YYYY-MM-DD). Never built with toISOString(), which is UTC. ──
const pad = n => String(n).padStart(2, '0');
export const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dayOf = iso => new Date(`${String(iso).slice(0, 10)}T00:00:00`);
export const addDays = (iso, n) => { const d = dayOf(iso); d.setDate(d.getDate() + n); return isoOf(d); };
export const mondayOf = iso => addDays(iso, -((dayOf(iso).getDay() + 6) % 7));
export const shortDate = iso => (iso ? dayOf(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
export const dateTime = ts => (ts ? new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const isLate = t => !!t.dueDate && t.status !== 'Done' && t.dueDate < todayLocal();
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function Avatar({ p, size = 22, ring = true }) {
  return (
    <span className={`wk-avatar ${ring ? 'ring' : ''}`} title={`${p?.name || 'Unassigned'}${p?.kind === 'partner' ? ' · Partner' : ''}`}
      style={{ width: size, height: size, background: personColor(p), fontSize: Math.max(8, size * 0.38) }}>{initials(p?.name)}</span>
  );
}

export function AvatarStack({ people = [], max = 3, size = 22 }) {
  if (!people.length) return <span className="wk-avatar none" title="Unassigned" style={{ width: size, height: size }} />;
  return (
    <span className="wk-stack">
      {people.slice(0, max).map(p => <Avatar key={personKey(p)} p={p} size={size} />)}
      {people.length > max && <span className="wk-avatar ring more" style={{ width: size, height: size, fontSize: 9.5 }}>+{people.length - max}</span>}
    </span>
  );
}

export function TypeGlyph({ type, size = 16 }) {
  const m = TYPE_META[type] || TYPE_META.Task;
  const I = m.icon;
  return <span title={type} style={{ width: size, height: size, borderRadius: 4, background: m.bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I size={size * 0.68} color={m.color} strokeWidth={2.4} /></span>;
}

export function PriorityGlyph({ priority, size = 15 }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.Medium;
  const I = m.icon;
  return <span title={`${priority} priority`} style={{ display: 'inline-flex', flexShrink: 0 }}><I size={size} color={m.color} strokeWidth={2.6} /></span>;
}

export function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.Backlog;
  return <span className="wk-pill" style={{ background: m.bg, color: m.text }}><i style={{ background: m.dot }} />{status}</span>;
}

// Native select dressed as a status pill: one tap opens the system picker,
// which works the same on phones and never gets clipped by a scrolling parent.
export function StatusSelect({ status, onChange, label = 'Status' }) {
  const m = STATUS_META[status] || STATUS_META.Backlog;
  return (
    <select className="wk-status" aria-label={label} value={status} style={{ backgroundColor: m.bg, color: m.text }}
      onClick={e => e.stopPropagation()} onChange={e => onChange(e.target.value)}>
      {STATUSES.map(s => <option key={s}>{s}</option>)}
    </select>
  );
}

export function LabelPill({ label, onRemove }) {
  const c = labelColor(label);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 5, background: c.bg, color: c.color, fontSize: 11, fontWeight: 600 }}>
      {label}
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Remove label ${label}`} style={{ display: 'flex', padding: 2, border: 'none', background: 'none', color: 'inherit', cursor: 'pointer' }}><X size={11} /></button>}
    </span>
  );
}

// Single-line "Add a task…" box. Enter creates; the text stays if creating fails.
export function QuickAdd({ onAdd, placeholder = 'Add a task…', label, className = '' }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    const title = v.trim();
    if (!title || busy) return;
    setBusy(true);
    try { await onAdd(title); setV(''); } catch { /* the caller already showed the error; keep what was typed */ }
    setBusy(false);
  }
  return (
    <div className={`wk-quickadd ${busy ? 'busy' : ''} ${className}`}>
      {busy ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
      <input value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} aria-label={label || placeholder} enterKeyHint="done"
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          if (e.key === 'Escape' && v) { e.stopPropagation(); setV(''); }
        }} />
    </div>
  );
}

// Multi-select people picker (assignees)
export function PeoplePicker({ value = [], onChange, people, placeholder = 'Add people…', disabled, label = 'People' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const has = p => value.some(v => samePerson(v, p));
  const toggle = p => onChange(has(p) ? value.filter(v => !samePerson(v, p)) : [...value, asPerson(p)]);
  const shown = people.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  const flip = () => { if (!disabled) setOpen(o => !o); };
  return (
    <div ref={ref} className="wk-picker">
      <div className={`mac-input wk-picker-box ${disabled ? 'off' : ''}`} role="button" tabIndex={disabled ? -1 : 0} aria-label={label} aria-expanded={open}
        onClick={flip} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
        {value.length === 0 && <span className="wk-placeholder">{placeholder}</span>}
        {value.map(v => (
          <span key={personKey(v)} className="wk-person">
            <Avatar p={v} size={18} ring={false} />{v.name}
            {!disabled && <button type="button" aria-label={`Remove ${v.name}`} onClick={e => { e.stopPropagation(); toggle(v); }}><X size={12} /></button>}
          </span>
        ))}
      </div>
      {open && (
        <div className="wk-pop fill">
          <input autoFocus className="mac-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search people…" aria-label="Search people" style={{ marginBottom: 4 }}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
              if (e.key === 'Enter') { e.preventDefault(); if (shown.length === 1 && !e.nativeEvent.isComposing) { toggle(shown[0]); setQ(''); } }   // never submit the surrounding form
            }} />
          {shown.map(p => (
            <button key={personKey(p)} type="button" onClick={() => toggle(p)} className={`wk-pop-item ${has(p) ? 'on' : ''}`}>
              <Avatar p={p} size={20} ring={false} /><span>{p.name}</span>
              <span className="role">{p.kind === 'partner' ? 'Partner' : p.role || 'Team'}</span>
              {has(p) && <Check size={14} />}
            </button>
          ))}
          {!shown.length && <div className="wk-note" style={{ padding: 10 }}>No match</div>}
        </div>
      )}
    </div>
  );
}

export function LabelsInput({ value = [], onChange, suggestions = [] }) {
  const [t, setT] = useState('');
  const add = v => { const x = v.trim().toLowerCase(); if (x && !value.includes(x)) onChange([...value, x]); setT(''); };
  return (
    <div>
      <div className="mac-input wk-picker-box off">
        {value.map(l => <LabelPill key={l} label={l} onRemove={() => onChange(value.filter(x => x !== l))} />)}
        <input className="wk-labels-input" value={t} onChange={e => setT(e.target.value)} list="label-suggestions" aria-label="Add a label"
          onKeyDown={e => { if ((e.key === 'Enter' || e.key === ',') && !e.nativeEvent.isComposing) { e.preventDefault(); add(t); } if (e.key === 'Backspace' && !t && value.length) onChange(value.slice(0, -1)); }}
          onBlur={() => t && add(t)} placeholder={value.length ? '' : 'Type and press Enter'} />
      </div>
      <datalist id="label-suggestions">{suggestions.filter(s => !value.includes(s)).map(s => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

export function EmptyNote({ children }) {
  return <div className="wk-note">{children}</div>;
}
