// Holidays as a year calendar. Click a day to make it a holiday, click a holiday to rename or
// remove it. Weekly offs (from the rules) are shaded so it is clear which days already are off.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast, SkeletonRows, ErrorPanel, Field, fmtDate } from '../ui/kit';
import { holidaysAPI, policyAPI, MONTH_NAMES, WEEKDAYS, WEEKDAY_LABEL, monthDates, weekdayOf, dayOfMonth, fmtDayLong, todayIST } from '../../lib/hr';
import { CalendarPlus, Trash2, ChevronLeft, ChevronRight, PartyPopper } from 'lucide-react';

const pad = n => String(n).padStart(2, '0');
const IDEAS = ['Republic Day', 'Holi', 'Independence Day', 'Raksha Bandhan', 'Janmashtami', 'Gandhi Jayanti', 'Dussehra', 'Diwali', 'New Year (Gujarati)', 'Bhai Dooj', 'Uttarayan', 'Christmas', 'Office closed'];
const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000);
function whenText(date, today) {
  const n = daysBetween(today, date);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 0 ? `In ${n} days` : n === -1 ? 'Yesterday' : `${-n} days ago`;
}

function Month({ year, index, byDate, offDays, today, selected, onPick }) {
  const month = `${year}-${pad(index + 1)}`;
  const dates = monthDates(month);
  const lead = WEEKDAYS.indexOf(weekdayOf(dates[0]));
  const count = dates.filter(d => byDate.has(d)).length;
  return (
    <section className="hol-month" aria-label={`${MONTH_NAMES[index]} ${year}`}>
      <header><h3>{MONTH_NAMES[index]}</h3>{count > 0 && <span>{count} holiday{count === 1 ? '' : 's'}</span>}</header>
      <div className="hol-grid">
        {WEEKDAYS.map(w => <span key={w} className="hol-dow" aria-hidden="true">{WEEKDAY_LABEL[w].charAt(0)}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} aria-hidden="true" />)}
        {dates.map(date => {
          const h = byDate.get(date);
          const off = offDays.has(weekdayOf(date));
          return (
            <button key={date} type="button" title={h ? h.name : off ? 'Weekly off' : undefined}
              className={`hol-day ${h ? 'is-holiday' : ''} ${off ? 'is-off' : ''} ${date === today ? 'is-today' : ''} ${date === selected ? 'is-selected' : ''}`}
              aria-pressed={date === selected} aria-label={`${fmtDayLong(date)}${h ? `, holiday: ${h.name}` : off ? ', weekly off' : ''}`} onClick={() => onPick(date)}>
              {dayOfMonth(date)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function HolidayCalendar() {
  const toast = useToast();
  const [today] = useState(todayIST);
  const [year, setYear] = useState(() => +todayIST().slice(0, 4));
  const [items, setItems] = useState([]);
  const [workingDays, setWorkingDays] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null);   // a date
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removeId, setRemoveId] = useState(null);
  const yearRef = useRef(year);
  const inputRef = useRef(null);
  useEffect(() => { yearRef.current = year; });

  const load = useCallback(async (y, { quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setLoadError(null); }
    try {
      const data = await holidaysAPI.list(y);
      if (yearRef.current !== y) return;
      setItems([...data].sort((a, b) => String(a.date).localeCompare(String(b.date))));
    } catch (e) { console.error(e); if (yearRef.current === y && !quiet) setLoadError(e); }
    if (yearRef.current === y) setLoading(false);
  }, []);
  useEffect(() => { load(year); }, [year, load]);
  useEffect(() => { policyAPI.get().then(p => setWorkingDays(p?.workingDays || [])).catch(() => setWorkingDays([])); }, []);

  const byDate = useMemo(() => new Map(items.map(h => [h.date, h])), [items]);
  const offDays = useMemo(() => new Set(workingDays ? WEEKDAYS.filter(w => !workingDays.includes(w)) : []), [workingDays]);
  const current = selected ? byDate.get(selected) : null;
  const upcoming = items.filter(h => h.date >= today);
  const onWorkingDay = items.filter(h => !offDays.has(weekdayOf(h.date))).length;

  function pick(date) {
    setSelected(date); setError('');
    setName(byDate.get(date)?.name || '');
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function changeYear(by) { setSelected(null); setName(''); setYear(y => y + by); }

  async function save(e) {
    e?.preventDefault();
    if (saving || !selected) return;
    const text = name.trim();
    if (!text) { setError('Give the holiday a name'); return; }
    setSaving(true);
    try {
      if (current) await holidaysAPI.update(current.id, { date: selected, name: text, version: current.version });
      else await holidaysAPI.create({ date: selected, name: text });
      toast.success(current ? 'Holiday renamed' : `${text} added on ${fmtDate(selected)}`);
      await load(yearRef.current, { quiet: true });
    } catch (err) { toast.error(current ? 'Could not save the holiday' : 'Could not add the holiday', err); }
    setSaving(false);
  }

  async function remove(id) {
    const h = items.find(x => x.id === id);
    try {
      await holidaysAPI.remove(id);
      setItems(xs => xs.filter(x => x.id !== id));
      if (h?.date === selected) setName('');
      toast.success(`${h?.name || 'Holiday'} removed. ${h ? fmtDate(h.date) : 'The day'} is a working day again.`);
    } catch (err) { toast.error('Could not remove the holiday', err); }
  }

  if (loadError) return <ErrorPanel title="Could not load holidays" error={loadError} onRetry={() => load(year)} />;
  return (
    <div className="hol">
      <div className="hol-main">
        <div className="hol-bar">
          <div className="hr-month" role="group" aria-label="Year">
            <button type="button" className="icon-btn" onClick={() => changeYear(-1)} aria-label="Previous year"><ChevronLeft size={16} /></button>
            <span className="hr-month-label" style={{ minWidth: 64 }} aria-live="polite">{year}</span>
            <button type="button" className="icon-btn" onClick={() => changeYear(1)} aria-label="Next year"><ChevronRight size={16} /></button>
          </div>
          <div className="hol-key" aria-label="What the colours mean">
            <span><i className="is-holiday" /> Holiday</span><span><i className="is-off" /> Weekly off</span><span><i className="is-today" /> Today</span>
          </div>
        </div>
        {loading ? <SkeletonRows rows={8} /> : (
          <div className="hol-year">
            {MONTH_NAMES.map((_, i) => <Month key={i} year={year} index={i} byDate={byDate} offDays={offDays} today={today} selected={selected} onPick={pick} />)}
          </div>
        )}
      </div>

      <aside className="hol-side">
        <section className="mac-card hol-card">
          {selected ? (
            <form onSubmit={save} noValidate>
              <div className="hol-sel">
                <span className="hol-sel-day">{dayOfMonth(selected)}</span>
                <div><strong>{fmtDayLong(selected)}</strong><span>{whenText(selected, today)}{offDays.has(weekdayOf(selected)) ? ' · already a weekly off' : ''}</span></div>
              </div>
              <Field label={current ? 'Holiday name' : 'Make this day a holiday'} required error={error}>
                <input ref={inputRef} className="mac-input" value={name} maxLength={80} onChange={e => { setName(e.target.value); setError(''); }} placeholder="e.g. Diwali" />
              </Field>
              {!current && (
                <div className="hol-ideas" role="group" aria-label="Common names">
                  {IDEAS.filter(x => !items.some(h => h.name === x)).slice(0, 8).map(x => <button key={x} type="button" className="chip" onClick={() => { setName(x); setError(''); }}>{x}</button>)}
                </div>
              )}
              <div className="hol-actions">
                {current && <button type="button" className="mac-btn mac-btn-danger" onClick={() => setRemoveId(current.id)} disabled={saving}><Trash2 size={14} /> Remove</button>}
                <button type="submit" className="mac-btn mac-btn-primary" disabled={saving || (current && name.trim() === current.name)}>
                  <CalendarPlus size={15} /> {saving ? 'Saving…' : current ? 'Save name' : 'Add holiday'}
                </button>
              </div>
            </form>
          ) : (
            <div className="hol-empty">
              <span className="empty-icon"><CalendarPlus size={22} /></span>
              <strong>Click any day</strong>
              <span>to make it a holiday. Click a holiday to rename or remove it.</span>
            </div>
          )}
        </section>

        <section className="mac-card hol-card">
          <header className="hol-list-head">
            <h3 className="section-title">Holidays in {year}</h3>
            <span className="muted">{items.length} in all · {onWorkingDay} on a working day{upcoming.length ? ` · ${upcoming.length} to come` : ''}</span>
          </header>
          {items.length === 0 ? (
            <div className="hol-empty"><span className="empty-icon"><PartyPopper size={22} /></span><span>No holidays for {year} yet. Nobody is marked absent on a holiday, and leave does not use it up.</span></div>
          ) : (
            <ul className="hol-list">
              {items.map(h => (
                <li key={h.id}>
                  <button type="button" className={`hol-row ${h.date === selected ? 'is-selected' : ''} ${h.date < today ? 'is-past' : ''}`} onClick={() => pick(h.date)}>
                    <span className="hol-row-date"><b>{dayOfMonth(h.date)}</b>{MONTH_NAMES[+h.date.slice(5, 7) - 1].slice(0, 3)}</span>
                    <span className="hol-row-main"><strong>{h.name}</strong><span>{WEEKDAY_LABEL[weekdayOf(h.date)]} · {whenText(h.date, today)}{offDays.has(weekdayOf(h.date)) ? ' · on a weekly off' : ''}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <ConfirmDialog isOpen={!!removeId} onClose={() => setRemoveId(null)} onConfirm={() => { remove(removeId); }}
        title="Remove holiday" confirmLabel="Remove" message="The day becomes a normal working day again, and attendance for it is worked out afresh." />
    </div>
  );
}
