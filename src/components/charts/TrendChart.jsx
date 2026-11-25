import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { fmtCompact, fmtINR, fmtPct } from '../../lib/finance';

import { SERIES } from './palette';
const INK = { primary: 'var(--ink)', secondary: 'var(--ink-2)', muted: 'var(--ink-3)', grid: 'var(--line)', axis: 'var(--line-strong)' };

function niceMax(v) {
  if (v <= 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

// Rounded data-end, square at the baseline
function barPath(x, y0, w, y1, r = 4) {
  const up = y1 < y0;
  const h = Math.abs(y1 - y0);
  const rr = Math.min(r, h, w / 2);
  if (h < 0.5) return '';
  if (up) return `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`;
  return `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 - rr}V${y0}Z`;
}

/**
 * Revenue + expense columns per period with a net-profit line, one ₹ axis.
 * points: [{ label, revenue, expense, profit, margin }]
 */
export default function TrendChart({ points, height = 260, onSelect }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(Math.max(260, el.clientWidth));
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const pad = { l: 52, r: 12, t: 12, b: 28 };
    const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
    const hi = niceMax(Math.max(1, ...points.flatMap(p => [p.revenue, p.expense, p.profit])));
    const lo = -niceMax(Math.max(0, ...points.map(p => -p.profit)));
    const span = hi - lo || 1;
    const y = v => pad.t + (hi - v) / span * ih;
    const band = iw / Math.max(1, points.length);
    const bw = Math.min(24, Math.max(3, (band - 10) / 2 - 1));
    const ticks = [];
    const step = niceMax((hi - lo) / 4) || 1;
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) ticks.push(v);
    return { pad, iw, ih, y, band, bw, ticks, y0: y(0) };
  }, [points, width, height]);

  const { pad, y, band, bw, ticks, y0 } = geo;
  const cx = i => pad.l + band * i + band / 2;
  const labelEvery = Math.ceil(points.length / Math.max(1, Math.floor(geo.iw / 56)));
  const linePath = points.map((p, i) => `${i ? 'L' : 'M'}${cx(i)},${y(p.profit)}`).join('');
  const h = hover != null ? points[hover] : null;

  return (
    // overflow hidden + minWidth 0: the wrapper must take its width from the
    // card, never from the SVG inside it (otherwise it measures itself wider)
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', minWidth: 0, overflow: 'hidden' }}>
      {/* legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, fontSize: 11.5, color: INK.secondary }}>
        {[['Revenue', SERIES.revenue, 'bar'], ['Expenses', SERIES.expense, 'bar'], ['Net profit', SERIES.profit, 'line']].map(([l, c, k]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {k === 'bar'
              ? <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
              : <span style={{ width: 16, height: 2, borderRadius: 1, background: c, position: 'relative' }}><span style={{ position: 'absolute', left: 5, top: -3, width: 6, height: 6, borderRadius: 3, background: c }} /></span>}
            {l}
          </span>
        ))}
      </div>

      {width > 0 && <svg width={width} height={height} role="img" aria-label="Revenue, expenses and net profit by period" style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHover(null)}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? INK.axis : INK.grid} />
            <text x={pad.l - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize="10.5" fill={INK.muted}>{fmtCompact(v)}</text>
          </g>
        ))}

        {points.map((p, i) => {
          const x = cx(i);
          return (
            <g key={p.label + i}>
              {hover === i && <rect x={x - band / 2} y={pad.t} width={band} height={geo.ih} fill="var(--line)" rx="6" />}
              <path d={barPath(x - bw - 1, y0, bw, y(Math.max(0, p.revenue)))} fill={SERIES.revenue} />
              <path d={barPath(x + 1, y0, bw, y(Math.max(0, p.expense)))} fill={SERIES.expense} />
              {i % labelEvery === 0 && (
                <text x={x} y={height - 8} textAnchor="middle" fontSize="10.5" fill={INK.muted}>{p.label}</text>
              )}
            </g>
          );
        })}

        <path d={linePath} fill="none" stroke={SERIES.profit} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={cx(i)} cy={y(p.profit)} r={hover === i ? 5 : 4} fill={SERIES.profit} stroke="var(--surface)" strokeWidth="2" />
        ))}

        {/* hit targets: whole band per period */}
        {points.map((p, i) => (
          <rect key={'hit' + i} x={cx(i) - band / 2} y={pad.t} width={band} height={geo.ih + pad.b} fill="transparent"
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
            onMouseEnter={() => setHover(i)} onClick={() => onSelect?.(i)} />
        ))}
      </svg>}

      {h && (
        <div style={{
          position: 'absolute', top: 30, pointerEvents: 'none',
          left: Math.min(Math.max(0, cx(hover) + 14), width - 200),
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
          boxShadow: 'var(--shadow-pop)', padding: '10px 12px', fontSize: 12, minWidth: 180, zIndex: 2,
        }}>
          <div style={{ fontWeight: 650, color: INK.primary, marginBottom: 6 }}>{h.fullLabel || h.label}</div>
          {[['Revenue', h.revenue, SERIES.revenue], ['Expenses', h.expense, SERIES.expense], ['Net profit', h.profit, SERIES.profit]].map(([l, v, c]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: INK.secondary }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}
              </span>
              <span style={{ color: INK.primary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtINR(v)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4, color: INK.secondary }}>
            <span>Margin</span><span style={{ color: INK.primary, fontWeight: 600 }}>{fmtPct(h.margin)}</span>
          </div>
          {onSelect && <div style={{ fontSize: 10.5, color: INK.muted, marginTop: 4 }}>Click to open this period</div>}
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars, single hue (magnitude). items: [{ label, value, sub? }] */
export function RankedBars({ items, color = SERIES.revenue, total, onSelect, max = 8 }) {
  const shown = items.slice(0, max);
  const rest = items.slice(max);
  const rows = rest.length ? [...shown, { label: `Other (${rest.length})`, value: rest.reduce((s, x) => s + x.value, 0), other: true }] : shown;
  const top = Math.max(1, ...rows.map(r => r.value));
  const sum = total ?? items.reduce((s, x) => s + x.value, 0);
  if (!rows.length) return <div style={{ fontSize: 12.5, color: INK.muted, padding: '18px 0', textAlign: 'center' }}>Nothing in this period</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map(r => (
        <div key={r.label} title={`${r.label}: ${fmtINR(r.value)}`}
          onClick={() => !r.other && onSelect?.(r)}
          style={{ cursor: onSelect && !r.other ? 'pointer' : 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: INK.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
            <span style={{ color: INK.secondary, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {fmtINR(r.value)} <span style={{ color: INK.muted }}>· {sum > 0 ? Math.round(r.value / sum * 100) : 0}%</span>
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)' }}>
            <div style={{ width: `${Math.max(1.5, r.value / top * 100)}%`, height: '100%', borderRadius: 4, background: r.other ? 'var(--ink-3)' : color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
