import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TrendChart from '../charts/TrendChart';
import {
  resolvePeriod, previousPeriod, samePeriodLastYear, effectiveEnd, summarize, buildColumns, buildStatement,
  computeReceivables, gstClientSet, currentMonth, addMonths, txMonth, rangeLabel,
  fmtINR, fmtCompact, fmtPct, pctChange,
} from '../../lib/finance';
import { TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';
import { usePlOptions } from '../../lib/plOptions';

const INK = { primary: 'var(--ink)', secondary: 'var(--ink-2)', muted: 'var(--ink-3)' };
const GOOD = 'var(--good)', BAD = 'var(--bad)';

const TABS = [
  ['this_month', 'This month'], ['last_month', 'Last month'], ['this_quarter', 'This quarter'],
  ['last_6m', '6 months'], ['this_fy', 'This FY'], ['last_12m', '12 months'],
];
const WINDOWS = ['last_month', 'this_quarter', 'last_quarter', 'last_6m', 'this_fy', 'last_fy'];
const WINDOW_NAMES = { last_month: 'Last month', this_quarter: 'This quarter', last_quarter: 'Last quarter', last_6m: 'Last 6 months', this_fy: 'This FY', last_fy: 'Last FY' };

function Change({ cur, prev, inverse, pp }) {
  if (prev == null) return null;
  const d = pp ? (cur ?? 0) - prev : pctChange(cur, prev);
  if (d == null || !isFinite(d)) return <span style={{ fontSize: 'var(--fs-xs)', color: INK.muted }}>—</span>;
  const up = d > 0.05, down = d < -0.05;
  const color = !up && !down ? INK.secondary : (inverse ? down : up) ? GOOD : BAD;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, color, fontWeight: 550 }}><Icon size={12} />{d > 0 ? '+' : ''}{d.toFixed(1)}{pp ? ' pts' : '%'}</span>;
}

/** Dashboard block: period KPIs with comparisons, profit windows, 12-month trend. */
export default function FinanceOverview({ txs, projects }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('this_month');
  const [opts] = usePlOptions(); // the same shared "what counts" choices as the P&L page
  const now = currentMonth();
  const ctx = useMemo(() => ({ gstClients: gstClientSet(projects) }), [projects]);
  const firstMonth = useMemo(() => txs.reduce((m, t) => { const k = txMonth(t); return k && k < m ? k : m; }, now), [txs, now]);

  const view = useMemo(() => {
    const p = resolvePeriod(tab, { now, firstMonth });
    const end = effectiveEnd(p, now);
    const cur = summarize(txs, p.start, end, opts, ctx);
    const prevP = previousPeriod(p, now), yoyP = samePeriodLastYear(p, now);
    return {
      period: p, cur,
      prev: summarize(txs, prevP.start, prevP.end, opts, ctx),
      yoy: summarize(txs, yoyP.start, yoyP.end, opts, ctx),
      prevLabel: rangeLabel(prevP.start, prevP.end),
    };
  }, [tab, txs, now, firstMonth, opts, ctx]);

  const windows = useMemo(() => WINDOWS.map(id => {
    const p = resolvePeriod(id, { now, firstMonth });
    return { id, ...summarize(txs, p.start, effectiveEnd(p, now), opts, ctx) };
  }), [txs, now, firstMonth, opts, ctx]);

  const trend = useMemo(() => {
    const cols = buildColumns(addMonths(now, -11), now, 'month');
    const s = buildStatement(txs, cols, opts, ctx);
    return cols.map((c, i) => ({ label: c.label, fullLabel: rangeLabel(c.start, c.end), revenue: s.revenue[i], expense: s.expense[i], profit: s.profit[i], margin: s.margin[i] }));
  }, [txs, now, opts, ctx]);

  const receivables = useMemo(() => computeReceivables(projects), [projects]);
  const { cur, prev, yoy } = view;

  const kpis = [
    { label: 'Revenue', v: cur.revenue, p: prev.revenue, y: yoy.revenue },
    { label: 'Expenses', v: cur.expense, p: prev.expense, y: yoy.expense, inverse: true },
    { label: cur.profit >= 0 ? 'Net profit' : 'Net loss', v: cur.profit, p: prev.profit, y: yoy.profit, strong: true },
    { label: 'Margin', v: cur.margin, p: prev.margin, y: yoy.margin, pct: true },
  ];

  return (
    <div className="mac-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-md)', fontWeight: 650, color: INK.primary }}>Profit & Loss</div>
          <div style={{ fontSize: 11.5, color: INK.muted, marginTop: 2 }}>{view.period.label} · vs {view.prevLabel} and last year</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
          <div className="tab-bar fo-tabs">
            {TABS.map(([id, l]) => <button key={id} className={`tab-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} style={{ fontSize: 12, padding: '5px 10px' }}>{l}</button>)}
          </div>
          <button onClick={() => navigate('/reports')} className="mac-btn mac-btn-ghost" style={{ fontSize: 12.5 }}>Full report <ArrowRight size={13} /></button>
        </div>
      </div>

      <div className="rg-4">
        {kpis.map(k => (
          <div key={k.label} style={{ padding: '12px 14px', borderRadius: 'var(--r-sm)', background: k.strong ? 'var(--good-soft)' : 'var(--surface-2)', minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: INK.secondary, fontWeight: 500 }}>{k.label}</div>
            <div style={{ fontSize: 21, fontWeight: 680, color: !k.pct && k.v < 0 ? BAD : INK.primary, letterSpacing: '-0.5px', margin: '4px 0', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {k.pct ? fmtPct(k.v) : fmtINR(k.v)}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 'var(--fs-xs)', color: INK.muted }}>
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Change cur={k.v} prev={k.p} inverse={k.inverse} pp={k.pct} /> prev</span>
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Change cur={k.v} prev={k.y} inverse={k.inverse} pp={k.pct} /> YoY</span>
            </div>
          </div>
        ))}
      </div>

      <div className="fo-windows">
        {windows.map(w => (
          <div key={w.id} title={`Revenue ${fmtINR(w.revenue)} · Expenses ${fmtINR(w.expense)}`}
            style={{ padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', background: 'var(--surface)', minWidth: 0 }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: INK.secondary }}>{WINDOW_NAMES[w.id]}</div>
            <div style={{ fontSize: 15, fontWeight: 680, color: w.profit < 0 ? BAD : INK.primary, fontVariantNumeric: 'tabular-nums' }}>{fmtCompact(w.profit)}</div>
            <div style={{ fontSize: 10.5, color: INK.muted }}>margin {fmtPct(w.margin, 0)}</div>
          </div>
        ))}
        <div style={{ padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--warn-soft)', minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: INK.secondary }}>To collect</div>
          <div style={{ fontSize: 15, fontWeight: 680, color: INK.primary, fontVariantNumeric: 'tabular-nums' }}>{fmtCompact(receivables)}</div>
          <div style={{ fontSize: 10.5, color: INK.muted }}>from projects</div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: INK.secondary, marginBottom: 6 }}>Last 12 months</div>
        <TrendChart points={trend} height={220} />
      </div>

      <style>{`.fo-tabs{max-width:100%;overflow-x:auto;scrollbar-width:none}.fo-tabs::-webkit-scrollbar{display:none}.fo-tabs .tab-item{flex-shrink:0}
.fo-windows{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
@media(max-width:1024px){.fo-windows{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:640px){.fo-windows{grid-template-columns:repeat(2,minmax(0,1fr))}}`}</style>
    </div>
  );
}
