// Small pieces the Attendance, Leave and Payroll screens share.
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel, shiftMonth } from '../../lib/hr';

// ‹ November 2026 ›  — `max` (YYYY-MM) stops "next" from going past it.
export function MonthNav({ month, onChange, max, disabled }) {
  const atMax = !!max && month >= max;
  return (
    <div className="hr-month" role="group" aria-label="Month">
      <button type="button" className="icon-btn" onClick={() => onChange(shiftMonth(month, -1))} disabled={disabled} aria-label="Previous month"><ChevronLeft size={16} /></button>
      <span className="hr-month-label" aria-live="polite">{monthLabel(month)}</span>
      <button type="button" className="icon-btn" onClick={() => onChange(shiftMonth(month, 1))} disabled={disabled || atMax} aria-label="Next month"><ChevronRight size={16} /></button>
    </div>
  );
}

// Inline notice. tone: warn (default) | info | bad | good
export function Notice({ tone = 'warn', icon: Icon = AlertTriangle, children, role }) {
  return (
    <div className={`hr-strip ${tone === 'warn' ? '' : tone}`} role={role || (tone === 'bad' ? 'alert' : 'status')}>
      <Icon size={16} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

// The app's segmented tab bar. tabs: [[key, label]]
export function TabBar({ tabs, value, onChange, label }) {
  return (
    <div className="tab-bar" role="tablist" aria-label={label} style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}>
      {tabs.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className={`tab-item ${value === k ? 'active' : ''}`} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}
