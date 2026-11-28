// Client box of the proposal builder: type a name, or pick one of the CRM leads from the list.
// Picking a lead hands the whole lead to onPick (the builder fills the proposal from it);
// typing just changes the name.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Badge, { getStatusColor } from '../ui/Badge';
import { fmtMoney } from '../ui/kit';
import { ChevronDown, Search, X } from 'lucide-react';
import './LeadPicker.css';

const nameOf = c => String(c.companyName || c.clientName || '').trim();

export default function LeadPicker({ id, value, onType, onPick, leads, loading }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');            // what was typed since the list opened
  const [hi, setHi] = useState(0);
  const box = useRef(null);
  const listId = useId();

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...leads]
      .filter(c => !s || [c.companyName, c.clientName, c.projectType, c.email].some(v => v && String(v).toLowerCase().includes(s)))
      .sort((a, b) => (a.status === 'Lost') - (b.status === 'Lost') || String(b.createdDate || '').localeCompare(String(a.createdDate || '')));
  }, [leads, q]);

  useEffect(() => {
    if (!open) return undefined;
    const off = e => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [open]);

  const pick = c => { onPick(c); setOpen(false); setQ(''); };
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); setHi(h => Math.min(list.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
    else if (e.key === 'Enter' && open && list[hi]) { e.preventDefault(); pick(list[hi]); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); }
  };

  return (
    <div className="lp" ref={box}>
      <div className={`lp-field ${open ? 'open' : ''}`}>
        <Search size={15} aria-hidden="true" className="lp-icon" />
        <input id={id} className="lp-input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && list[hi] ? `${listId}-${hi}` : undefined}
          value={value} placeholder="Search a CRM lead or type a name" autoComplete="off" maxLength={90}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
          onChange={e => { onType(e.target.value); setQ(e.target.value); setHi(0); setOpen(true); }} />
        {value && <button type="button" className="lp-btn" aria-label="Clear the client" onClick={() => { onType(''); setQ(''); setOpen(true); }}><X size={14} /></button>}
        <button type="button" className="lp-btn" aria-label={open ? 'Close the list' : 'Show CRM leads'} onClick={() => { setOpen(o => !o); setQ(''); }}><ChevronDown size={16} /></button>
      </div>

      {open && (
        <div className="lp-pop">
          <div className="lp-head">{loading ? 'Loading CRM leads…' : `${list.length} CRM lead${list.length === 1 ? '' : 's'}${q.trim() ? ' match' : ''} · picking one fills the whole proposal`}</div>
          <ul className="lp-list" id={listId} role="listbox" aria-label="CRM leads">
            {list.map((c, i) => (
              <li key={c.id} id={`${listId}-${i}`} role="option" aria-selected={i === hi}
                className={`lp-opt ${i === hi ? 'hi' : ''}`} onMouseEnter={() => setHi(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(c)}>
                <span className="lp-av" aria-hidden="true">{nameOf(c).slice(0, 1).toUpperCase() || '?'}</span>
                <span className="lp-main">
                  <b>{nameOf(c) || 'Unnamed lead'}</b>
                  <em>{[c.companyName ? c.clientName : '', c.projectType].filter(Boolean).join(' · ') || '—'}</em>
                </span>
                <span className="lp-side">
                  <Badge color={getStatusColor(c.status)} dot>{c.status}</Badge>
                  {(+c.finalPrice || +c.proposalValue) ? <span className="lp-val">{fmtMoney(+c.finalPrice || +c.proposalValue)}</span> : null}
                </span>
              </li>
            ))}
            {!loading && !list.length && <li className="lp-empty">No CRM lead matches. The name you typed is used as it is.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
