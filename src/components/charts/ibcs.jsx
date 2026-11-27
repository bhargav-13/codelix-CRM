// IBCS-style chart pieces shared by the dashboards.
// The notation, in short:
//   · marks are coloured: blue by default, green for wins and money in, red for losses,
//     orange for caution; a comparison (previous period) is light grey behind the actual
//   · values are written on the marks, so there are no gridlines, value axes or legends
//   · time runs left to right in columns; a breakdown is horizontal bars, largest first
//   · every chart says what it shows in three lines: who, what (and unit), when
import './ibcs.css';

const num = n => (Number(n) || 0).toLocaleString('en-IN');

// "Codelix / Leads in # / Last 6 months, AC"
export function IbcsTitle({ who = 'Codelix', what, unit, when }) {
  return (
    <div className="ib-title">
      <span>{who}</span>
      <strong>{what}{unit ? <em> in {unit}</em> : null}</strong>
      {when && <span>{when}</span>}
    </div>
  );
}

export function IbcsCard({ who, what, unit, when, action, wide, children }) {
  return (
    <section className={`mac-card ib-card ${wide ? 'ib-wide' : ''}`}>
      <header className="ib-head"><IbcsTitle who={who} what={what} unit={unit} when={when} />{action}</header>
      {children}
    </section>
  );
}

// A breakdown. rows: [{ name, value, tone? }] in the order given (sort before passing).
// share: also write each row's share of the total.
// tone: brand | good | bad | warn for the whole chart; a row's own `tone` wins.
export function IbcsBars({ rows, format = num, share = false, tone = 'brand', empty = 'Nothing to show yet.' }) {
  if (!rows.length) return <p className="ib-empty">{empty}</p>;
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value)));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ul className="ib-bars">
      {rows.map(r => (
        <li key={r.name}>
          <span className="ib-name" title={r.name}>{r.name}</span>
          <span className="ib-track">
            <span className={`ib-bar is-${r.tone || tone}`} style={{ width: `calc((100% - 88px) * ${Math.abs(r.value) / max})` }} />
            <span className="ib-val">{format(r.value)}{share && total > 0 && <em>{Math.round((r.value / total) * 100)}%</em>}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Values over time. points: [{ label, value, cmp? }]; cmp draws the comparison column behind.
// max: pass the same number to several charts so they share one scale (small multiples).
// negBad: a value below zero is drawn red (a loss).
export function IbcsColumns({ points, format = num, height = 150, max, negBad = false, tone = 'brand', label }) {
  const all = points.flatMap(p => [p.value, p.cmp ?? 0]);
  const hi = Math.max(max ?? 0, 0, ...all) || 1;
  const lo = Math.min(0, ...all);
  const span = hi - lo || 1;
  const zero = ((0 - lo) / span) * 100;          // % from the bottom
  const every = Math.ceil(points.length / 12);
  const place = v => (v >= 0
    ? { bottom: `${zero}%`, height: `${(v / span) * 100}%` }
    : { top: `${100 - zero}%`, height: `${(-v / span) * 100}%` });
  return (
    <figure className="ib-fig">
      {label && <figcaption>{label}</figcaption>}
      <div className="ib-cols" style={{ height }} role="img" aria-label={`${label || 'Values'}: ${points.map(p => `${p.label} ${format(p.value)}`).join(', ')}`}>
        {points.map((p, i) => (
          <div key={`${p.label}-${i}`} className="ib-col" title={`${p.label}: ${format(p.value)}`}>
            <span className="ib-zero" style={{ bottom: `${zero}%` }} />
            {p.cmp != null && <span className="ib-colbar is-cmp" style={place(p.cmp)} />}
            <span className={`ib-colbar is-${negBad && p.value < 0 ? 'bad' : tone}`} style={place(p.value)} />
            {p.value !== 0 && (
              <span className="ib-colval" style={p.value >= 0 ? { bottom: `calc(${zero + (p.value / span) * 100}% + 3px)` } : { top: `calc(${100 - zero + (-p.value / span) * 100}% + 3px)` }}>{format(p.value)}</span>
            )}
          </div>
        ))}
      </div>
      <div className="ib-collabels" aria-hidden="true">
        {points.map((p, i) => <span key={`${p.label}-${i}`}>{i % every === 0 ? p.label : ''}</span>)}
      </div>
    </figure>
  );
}

// A relative figure (a rate, a percentage) is a pin: a thin line with a head, not a bar.
export function IbcsPin({ value, text, tone }) {
  if (value == null) return <span className="ib-pin is-none"><span className="ib-pin-text">{text ?? '—'}</span></span>;
  return (
    <span className={`ib-pin ${tone ? `is-${tone}` : ''}`}>
      <span className="ib-pin-track"><span className="ib-pin-line" style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} /></span>
      <span className="ib-pin-text">{text ?? `${Math.round(value * 100)}%`}</span>
    </span>
  );
}

// A number with a small solid bar in the same cell (tables)
export function IbcsCellBar({ value, max, format = num }) {
  return (
    <span className="ib-cellbar">
      <span className="ib-cellbar-track"><span style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></span>
      <span className="ib-cellbar-val">{format(value)}</span>
    </span>
  );
}
