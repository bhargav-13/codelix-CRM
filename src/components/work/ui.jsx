/* eslint-disable react-refresh/only-export-components */
import { useState, useRef, useEffect } from 'react';
import {
  ChevronsUp, ChevronUp, ChevronDown, ChevronsDown, Equal, Bug, CheckSquare, Bookmark, Zap,
  CornerDownRight, X, Check,
} from 'lucide-react';

export const STATUS_META = {
  'Backlog':     { dot: '#8E8E93', bg: 'rgba(142,142,147,0.12)', text: '#6E6E73' },
  'To Do':       { dot: '#0071E3', bg: 'rgba(0,113,227,0.10)',   text: '#0060C0' },
  'In Progress': { dot: '#FF9500', bg: 'rgba(255,149,0,0.12)',   text: '#B25E00' },
  'In Review':   { dot: '#AF52DE', bg: 'rgba(175,82,222,0.12)',  text: '#8A3DB5' },
  'Done':        { dot: '#34C759', bg: 'rgba(52,199,89,0.12)',   text: '#248A3D' },
};
export const TYPE_META = {
  Epic:    { icon: Zap,             color: '#AF52DE', bg: 'rgba(175,82,222,0.14)' },
  Story:   { icon: Bookmark,        color: '#34C759', bg: 'rgba(52,199,89,0.14)' },
  Task:    { icon: CheckSquare,     color: '#0071E3', bg: 'rgba(0,113,227,0.12)' },
  Bug:     { icon: Bug,             color: '#FF3B30', bg: 'rgba(255,59,48,0.12)' },
  Subtask: { icon: CornerDownRight, color: '#5AC8FA', bg: 'rgba(90,200,250,0.16)' },
};
export const PRIORITY_META = {
  Highest: { icon: ChevronsUp,   color: '#FF3B30' },
  High:    { icon: ChevronUp,    color: '#FF9500' },
  Medium:  { icon: Equal,        color: '#E0A100' },
  Low:     { icon: ChevronDown,  color: '#0071E3' },
  Lowest:  { icon: ChevronsDown, color: '#8E8E93' },
};
const PERSON_COLORS = ['#0071E3', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#5AC8FA', '#E0A100', '#30B0C7'];
const LABEL_COLORS = ['#0071E3', '#34C759', '#FF9500', '#AF52DE', '#FF3B30', '#30B0C7', '#FF2D55'];
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
export const personColor = p => PERSON_COLORS[hash(`${p?.kind}:${p?.id ?? p?.name ?? ''}`) % PERSON_COLORS.length];
export const labelColor = l => LABEL_COLORS[hash(l) % LABEL_COLORS.length];
export const initials = (n = '') => n.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
export const samePerson = (a, b) => a && b && a.kind === b.kind && String(a.id) === String(b.id);

export const FF = ({ label, children, required, hint }) => (
  <div style={{ minWidth: 0 }}>
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6E6E73', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
      {label}{required && <span style={{ color: '#FF3B30', marginLeft: 2 }}>*</span>}
    </label>
    {children}
    {hint && <div style={{ fontSize: 11, color: '#AEAEB2', marginTop: 4 }}>{hint}</div>}
  </div>
);

export function Avatar({ p, size = 22, ring = true }) {
  const c = personColor(p);
  return (
    <span title={`${p?.name || 'Unassigned'}${p?.kind === 'partner' ? ' · Partner' : ''}`} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: c, color: '#fff', fontSize: Math.max(8, size * 0.38), fontWeight: 700, border: ring ? '1.5px solid #fff' : 'none',
    }}>{initials(p?.name)}</span>
  );
}

export function AvatarStack({ people = [], max = 3, size = 22 }) {
  if (!people.length) return <span title="Unassigned" style={{ width: size, height: size, borderRadius: '50%', border: '1.5px dashed #C7C7CC', display: 'inline-block' }} />;
  return (
    <span style={{ display: 'inline-flex' }}>
      {people.slice(0, max).map((p, i) => <span key={`${p.kind}:${p.id}`} style={{ marginLeft: i ? -6 : 0 }}><Avatar p={p} size={size} /></span>)}
      {people.length > max && <span style={{ marginLeft: -6, width: size, height: size, borderRadius: '50%', background: '#E5E5EA', color: '#6E6E73', fontSize: 9.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff' }}>+{people.length - max}</span>}
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

export function StatusPill({ status, small }) {
  const m = STATUS_META[status] || STATUS_META.Backlog;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: small ? '1px 7px' : '3px 9px', borderRadius: 100, background: m.bg, color: m.text, fontSize: small ? 10.5 : 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
    <span style={{ width: 6, height: 6, borderRadius: 3, background: m.dot }} />{status}
  </span>;
}

export function LabelPill({ label, onRemove }) {
  const c = labelColor(label);
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 5, background: `${c}18`, color: c, fontSize: 10.5, fontWeight: 600 }}>
    {label}{onRemove && <X size={10} style={{ cursor: 'pointer' }} onClick={onRemove} />}
  </span>;
}

// Multi-select people picker (assignees, watchers)
export function PeoplePicker({ value = [], onChange, people, placeholder = 'Add people…', disabled }) {
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
  const toggle = p => onChange(has(p) ? value.filter(v => !samePerson(v, p)) : [...value, { id: p.id, name: p.name, kind: p.kind }]);
  const shown = people.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => !disabled && setOpen(o => !o)} className="mac-input" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minHeight: 36, cursor: disabled ? 'default' : 'pointer', padding: '4px 8px' }}>
        {value.length === 0 && <span style={{ color: '#C7C7CC', fontSize: 13 }}>{placeholder}</span>}
        {value.map(v => (
          <span key={`${v.kind}:${v.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px 2px 2px', borderRadius: 100, background: 'rgba(0,0,0,0.05)', fontSize: 12 }}>
            <Avatar p={v} size={18} ring={false} />{v.name}
            {!disabled && <X size={11} onClick={e => { e.stopPropagation(); toggle(v); }} />}
          </span>
        ))}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.08)', zIndex: 30, maxHeight: 240, overflowY: 'auto', padding: 4 }}>
          <input autoFocus className="mac-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ marginBottom: 4, fontSize: 12.5 }} />
          {shown.map(p => (
            <button key={`${p.kind}:${p.id}`} type="button" onClick={() => toggle(p)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', border: 'none', background: has(p) ? 'rgba(0,113,227,0.08)' : 'transparent', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit', textAlign: 'left' }}>
              <Avatar p={p} size={20} ring={false} /><span style={{ flex: 1 }}>{p.name}</span>
              <span style={{ fontSize: 10.5, color: '#AEAEB2' }}>{p.kind === 'partner' ? 'Partner' : p.role || 'Team'}</span>
              {has(p) && <Check size={13} color="#0071E3" />}
            </button>
          ))}
          {!shown.length && <div style={{ padding: 10, fontSize: 12, color: '#AEAEB2' }}>No match</div>}
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
      <div className="mac-input" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minHeight: 36, padding: '4px 8px' }}>
        {value.map(l => <LabelPill key={l} label={l} onRemove={() => onChange(value.filter(x => x !== l))} />)}
        <input value={t} onChange={e => setT(e.target.value)} list="label-suggestions"
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(t); } if (e.key === 'Backspace' && !t && value.length) onChange(value.slice(0, -1)); }}
          onBlur={() => t && add(t)} placeholder={value.length ? '' : 'Type and press Enter'} style={{ border: 'none', outline: 'none', flex: 1, minWidth: 80, fontSize: 13, background: 'transparent', fontFamily: 'inherit' }} />
      </div>
      <datalist id="label-suggestions">{suggestions.filter(s => !value.includes(s)).map(s => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

export const btnIcon = { width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.05)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };

export function EmptyNote({ children }) {
  return <div style={{ padding: '28px 12px', textAlign: 'center', fontSize: 12.5, color: '#AEAEB2' }}>{children}</div>;
}
