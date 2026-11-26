// P&L — one focused dashboard: revenue, net profit or loss, and margin.
//
// Laid out the IBCS way (International Business Communication Standards), so every chart
// reads the same:
//   • AC (actual) is always the solid dark shape; the comparison (PY = previous year,
//     PP = previous period) is always the lighter shape behind it.
//   • A variance is green when it is good for the business and red when it is bad — so more
//     revenue is green, and more expenses is red.
//   • Titles say what, in which unit, for which period; there is no decoration.
import { usePlOptions } from '../lib/plOptions';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Header from '../components/layout/Header';
import { Drawer, SkeletonRows, ErrorPanel, RowMenu, fmtDate, useToast } from '../components/ui/kit';
import { transactionsDB, projectsDB } from '../lib/db';
import {
  PERIOD_PRESETS, PL_TOGGLES, resolvePeriod, previousPeriod, samePeriodLastYear, effectiveEnd,
  buildColumns, buildStatement, summarize, gstClientSet, currentMonth, addMonths, monthsBetween, monthLabel,
  txMonth, fmtINR, fmtCompact, fmtPct, pctChange, statementToCSV, rangeLabel,
} from '../lib/finance';
import { Download, Printer, SlidersHorizontal, Info } from 'lucide-react';
import './Reports.css';

const PRESET_IDS = ['this_month', 'last_month', 'this_quarter', 'this_fy', 'last_fy', 'last_12m', 'custom'];
const PRESETS = PRESET_IDS.map(id => PERIOD_PRESETS.find(p => p.id === id));
const plain = n => fmtCompact(n).replace('₹', '');   // charts carry the unit in their title

// ── Variance helpers ──────────────────────────────────────────────
// `inverse` = a rise is bad (expenses)
const tone = (d, inverse) => (Math.abs(d) < 0.005 ? 'flat' : (d > 0) !== !!inverse ? 'good' : 'bad');
const signed = (n, fmt = fmtINR) => (Math.abs(n) < 0.5 ? fmt(0) : `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`);
const signedPct = p => (p == null || !isFinite(p) ? '—' : `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(1)}%`);
const signedPts = d => (d == null ? '—' : `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)} pts`);

// Charts are drawn at the real pixel width of their box, so labels keep their size on any screen.
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// ── KPI tile ──────────────────────────────────────────────────────
function Kpi({ label, value, cmpValue, delta, deltaText, pctText, cmpTag, inverse, bad }) {
  const t = delta == null ? 'flat' : tone(delta, inverse);
  return (
    <div className="mac-card ibcs-kpi">
      <span className="ibcs-kpi-label">{label}</span>
      <span className={`ibcs-kpi-value ${bad ? 'ibcs-bad' : ''}`}>{value}</span>
      {cmpTag ? (
        <span className="ibcs-kpi-cmp">
          <span>{cmpTag} {cmpValue}</span>
          <span className={`ibcs-${t}`}>Δ{cmpTag} {deltaText}{pctText ? ` (${pctText})` : ''}</span>
        </span>
      ) : <span className="ibcs-kpi-cmp"><span>No comparison</span></span>}
    </div>
  );
}

// ── Column chart: AC solid, comparison lighter and behind ─────────
// points: [{ label, ac, cmp }] — cmp may be null. Negative values hang below the zero line.
function ColumnChart({ title, points, cmpTag, onSelect }) {
  const n = points.length;
  const [boxRef, boxW] = useWidth();
  const vals = points.flatMap(p => [p.ac, cmpTag ? p.cmp ?? 0 : 0]);
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  // a loss hangs below the zero line: leave room for its label above the month names
  const W = Math.max(boxW, n * 40), H = min < 0 ? 190 : 170, top = 22, bottom = min < 0 ? 42 : 26;
  const span = max - min || 1;
  const y = v => top + (max - v) / span * (H - top - bottom);
  const zero = y(0), w = W / n, bw = Math.min(w * 0.46, 34);
  const bar = (v, x, cls, key) => {
    const y1 = v >= 0 ? y(v) : zero, h = Math.abs(y(v) - zero);
    return <rect key={key} className={cls} x={x} y={y1} width={bw} height={Math.max(h, v ? 1 : 0)} rx="1.5" />;
  };
  return (
    <figure className="ibcs-chart">
      <figcaption className="ibcs-chart-title">{title}</figcaption>
      <div className="ibcs-chart-scroll" ref={boxRef}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {points.map((p, i) => {
            const cx = i * w + w / 2;
            return (
              <g key={`${p.label}-${i}`} className={onSelect ? 'ibcs-col' : undefined} onClick={onSelect ? () => onSelect(i) : undefined}>
                <title>{`${p.fullLabel || p.label}: AC ${fmtINR(p.ac)}${cmpTag && p.cmp != null ? ` · ${cmpTag} ${fmtINR(p.cmp)}` : ''}`}</title>
                <rect x={i * w} y="0" width={w} height={H} fill="transparent" />
                {cmpTag && p.cmp != null && bar(p.cmp, cx - bw * 0.78, 'ibcs-cmp-fill', 'c')}
                {bar(p.ac, cx - bw * 0.32, p.ac < 0 ? 'ibcs-ac-fill ibcs-ac-neg' : 'ibcs-ac-fill', 'a')}
                {p.ac !== 0 && <text className="ibcs-val" x={cx + bw * 0.18} y={p.ac >= 0 ? y(p.ac) - 5 : y(p.ac) + 12} textAnchor="middle">{plain(p.ac)}</text>}
                <text className="ibcs-axis" x={cx} y={H - 8} textAnchor="middle">{p.label}</text>
              </g>
            );
          })}
          <line className="ibcs-zero" x1="0" x2={W} y1={zero} y2={zero} />
        </svg>
      </div>
    </figure>
  );
}

// ── Margin: a line of points, AC dark and comparison light ────────
function MarginChart({ title, points, cmpTag }) {
  const n = points.length;
  const [boxRef, boxW] = useWidth();
  const W = Math.max(boxW, n * 40), H = 130, top = 24, bottom = 26;
  const vals = points.flatMap(p => [p.ac, cmpTag ? p.cmp : null]).filter(v => v != null && isFinite(v));
  const max = Math.max(0, ...vals, 10), min = Math.min(0, ...vals);
  const span = max - min || 1;
  const w = W / n, x = i => i * w + w / 2, y = v => top + (max - v) / span * (H - top - bottom);
  // a line only between months that both have a margin (a month with no revenue has none)
  const path = key => points.map((p, i) => (p[key] == null ? null : { x: x(i), y: y(p[key]) }))
    .reduce((d, pt, i, a) => (pt ? d + `${a[i - 1] ? 'L' : 'M'}${pt.x},${pt.y}` : d), '');
  return (
    <figure className="ibcs-chart">
      <figcaption className="ibcs-chart-title">{title}</figcaption>
      <div className="ibcs-chart-scroll" ref={boxRef}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          <line className="ibcs-zero" x1="0" x2={W} y1={y(0)} y2={y(0)} />
          {cmpTag && <path className="ibcs-cmp-line" d={path('cmp')} />}
          <path className="ibcs-ac-line" d={path('ac')} />
          {points.map((p, i) => (
            <g key={`${p.label}-${i}`}>
              {cmpTag && p.cmp != null && <circle className="ibcs-cmp-dot" cx={x(i)} cy={y(p.cmp)} r="3" />}
              {p.ac != null && <>
                <circle className={p.ac < 0 ? 'ibcs-ac-dot ibcs-ac-neg' : 'ibcs-ac-dot'} cx={x(i)} cy={y(p.ac)} r="3.5" />
                <text className="ibcs-val" x={x(i)} y={y(p.ac) - 8} textAnchor="middle">{p.ac.toFixed(0)}%</text>
              </>}
              <text className="ibcs-axis" x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </figure>
  );
}

// ── Statement table: AC, comparison, and the variance drawn as a bar ──
function VarBar({ d, scale, inverse }) {
  if (!scale || Math.abs(d) < 0.5) return <span className="ibcs-varbar" />;
  const pct = Math.min(50, Math.abs(d) / scale * 50);
  return (
    <span className="ibcs-varbar" aria-hidden="true">
      <span className={`ibcs-varbar-fill ibcs-bg-${tone(d, inverse)}`} style={d > 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }} />
    </span>
  );
}

function Row({ label, ac, cmp, hasCmp, scale, inverse, kind = 'line', onDrill }) {
  const d = ac - (cmp || 0);
  return (
    <tr className={`ibcs-row ibcs-row-${kind}`}>
      <td>{label}</td>
      <td className="num">
        {onDrill && ac !== 0 ? <button className="pnl-cell" onClick={onDrill}>{fmtINR(ac)}</button> : <span className={ac < 0 ? 'ibcs-bad' : undefined}>{ac === 0 ? '—' : fmtINR(ac)}</span>}
      </td>
      {hasCmp && <td className="num muted">{cmp ? fmtINR(cmp) : '—'}</td>}
      {hasCmp && <td className={`num ibcs-${tone(d, inverse)}`}>{Math.abs(d) < 0.5 ? '—' : signed(d)}</td>}
      {hasCmp && <td className="ibcs-var-cell"><VarBar d={d} scale={scale} inverse={inverse} /></td>}
      {hasCmp && <td className={`num ibcs-${tone(d, inverse)}`}>{signedPct(pctChange(ac, cmp))}</td>}
    </tr>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="pnl-switch" onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────
export default function Reports() {
  const [txs, setTxs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const toast = useToast();
  const [presetId, setPresetId] = useState('this_fy');
  const [custom, setCustom] = useState({ start: addMonths(currentMonth(), -5), end: currentMonth() });
  const [compareMode, setCompareMode] = useState('yoy');   // yoy (PY) | prev (PP) | none
  const [opts, saveOpts] = usePlOptions();
  const [showOpts, setShowOpts] = useState(false);
  const [drill, setDrill] = useState(null);                // { title, txs }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [t, p] = await Promise.all([transactionsDB.getAll(), projectsDB.getAll()]);
      setTxs(t); setProjects(p);
    } catch (e) {
      console.error(e);
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Shared by all partners: saving changes everyone's P&L and dashboard
  const persist = next => saveOpts(next).catch(e => toast.error('Could not save the choice for everyone', e));
  const setOpt = (k, v) => persist({ ...opts, [k]: v });
  const resetOpts = () => persist(Object.fromEntries(PL_TOGGLES.map(t => [t.key, t.def])));

  const now = currentMonth();
  const firstMonth = useMemo(() => txs.reduce((m, t) => { const k = txMonth(t); return k && k < m ? k : m; }, now), [txs, now]);
  const ctx = useMemo(() => ({ gstClients: gstClientSet(projects) }), [projects]);

  const period = useMemo(() => resolvePeriod(presetId, { now, firstMonth, custom }), [presetId, now, firstMonth, custom]);
  const periodEnd = effectiveEnd(period, now);
  const cmpPeriod = useMemo(() => (compareMode === 'none' ? null
    : compareMode === 'yoy' ? samePeriodLastYear(period, now) : previousPeriod(period, now)), [compareMode, period, now]);
  const cmpTag = compareMode === 'none' ? null : compareMode === 'yoy' ? 'PY' : 'PP';
  const monthsInPeriod = monthsBetween(period.start, periodEnd).length;
  const shift = compareMode === 'yoy' ? -12 : -monthsInPeriod;   // how far back each month's comparison sits

  // The selected period as one column, and its comparison
  const st = useMemo(() => buildStatement(txs, [{ key: 'p', label: '', start: period.start, end: periodEnd }], opts, ctx), [txs, period.start, periodEnd, opts, ctx]);
  const cmp = useMemo(() => (cmpPeriod ? summarize(txs, cmpPeriod.start, cmpPeriod.end, opts, ctx) : null), [txs, cmpPeriod, opts, ctx]);
  const cmpLines = useMemo(() => {
    const m = new Map();
    if (cmp) [...cmp.statement.income, ...cmp.statement.expenses, ...cmp.statement.excluded].forEach(l => m.set(l.line, l.total));
    return m;
  }, [cmp]);

  // Month by month: the selected period, or the last 12 months when the period is too short to chart
  const chartIsPeriod = monthsInPeriod >= 3;
  const chartCols = useMemo(() => (chartIsPeriod ? buildColumns(period.start, periodEnd, 'month') : buildColumns(addMonths(periodEnd, -11), periodEnd, 'month')), [chartIsPeriod, period.start, periodEnd]);
  const months = useMemo(() => {
    const ac = buildStatement(txs, chartCols, opts, ctx);
    const back = cmpTag ? buildStatement(txs, chartCols.map(c => ({ ...c, start: addMonths(c.start, shift), end: addMonths(c.end, shift) })), opts, ctx) : null;
    return chartCols.map((c, i) => ({
      label: monthLabel(c.start).split(' ')[0], fullLabel: monthLabel(c.start, true), col: c,
      revenue: ac.revenue[i], profit: ac.profit[i], margin: ac.margin[i],
      cmpRevenue: back ? back.revenue[i] : null, cmpProfit: back ? back.profit[i] : null, cmpMargin: back ? back.margin[i] : null,
    }));
  }, [txs, chartCols, opts, ctx, cmpTag, shift]);

  function exportCSV() {
    const cols = buildColumns(period.start, periodEnd, 'month');
    const csv = statementToCSV(buildStatement(txs, cols, opts, ctx), `Codelix P&L — ${period.label}`);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `codelix-pnl-${period.start}-to-${periodEnd}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const openDrill = (title, list) => setDrill({ title, txs: [...list].sort((a, b) => (b.date || '').localeCompare(a.date || '')) });
  const openMonth = i => { setPresetId('custom'); setCustom({ start: months[i].col.start, end: months[i].col.end }); };

  if (loading || loadError) return (
    <div className="pnl-page">
      <Header title="P&L" subtitle={loading ? 'Loading the numbers…' : 'Could not load the report'} />
      <div className="page-body">
        {loading ? <SkeletonRows rows={8} /> : <ErrorPanel title="Could not load the P&L" error={loadError} onRetry={load} />}
      </div>
    </div>
  );

  const T = st.totals;
  const hasCmp = !!cmp;
  const loss = T.profit < 0;
  const togglesOff = PL_TOGGLES.filter(t => opts[t.key] !== t.def).length;
  const isEmpty = st.income.length + st.expenses.length + st.excluded.length === 0;
  const rowScale = hasCmp ? Math.max(1, ...[...st.income, ...st.expenses].map(l => Math.abs(l.total - (cmpLines.get(l.line) || 0))),
    Math.abs(T.revenue - cmp.revenue), Math.abs(T.expense - cmp.expense), Math.abs(T.profit - cmp.profit)) : 0;
  const marginDelta = hasCmp && T.margin != null && cmp.margin != null ? T.margin - cmp.margin : null;
  const scenario = cmpTag ? `AC vs ${cmpTag}` : 'AC';
  const chartRange = chartIsPeriod ? period.label : `${rangeLabel(chartCols[0].start, chartCols[chartCols.length - 1].end)} (last 12 months)`;

  return (
    <div className="pnl-page">
      <Header
        title="P&L"
        subtitle={`${period.label} · ${loss ? 'net loss' : 'net profit'} ${fmtINR(Math.abs(T.profit))}`}
        actions={
          <RowMenu label="Export" items={[
            { label: 'Download CSV (month by month)', icon: Download, onClick: exportCSV },
            { label: 'Print / save as PDF', icon: Printer, onClick: () => window.print() },
          ]} />
        }
      />

      <div className="page-body">
        {/* ── Period and comparison ────────────────────────────── */}
        <div className="tab-bar pnl-periods no-print" role="tablist" aria-label="Period">
          {PRESETS.map(p => (
            <button key={p.id} role="tab" aria-selected={presetId === p.id} className={`tab-item ${presetId === p.id ? 'active' : ''}`} onClick={() => setPresetId(p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="toolbar pnl-controls no-print">
          {presetId === 'custom' && (
            <div className="pnl-custom">
              <input type="month" className="mac-input" value={custom.start} max={now} onChange={e => e.target.value && setCustom(c => ({ ...c, start: e.target.value }))} aria-label="From month" />
              <span className="faint">to</span>
              <input type="month" className="mac-input" value={custom.end} max={now} onChange={e => e.target.value && setCustom(c => ({ ...c, end: e.target.value }))} aria-label="To month" />
            </div>
          )}
          <select className="mac-select" value={compareMode} onChange={e => setCompareMode(e.target.value)} aria-label="Compare with">
            <option value="yoy">Compare with previous year (PY)</option>
            <option value="prev">Compare with previous period (PP)</option>
            <option value="none">No comparison</option>
          </select>
          <div className="toolbar-right">
            <button onClick={() => setShowOpts(true)} className="mac-btn mac-btn-secondary">
              <SlidersHorizontal size={14} /> What counts{togglesOff ? ` · ${togglesOff} changed` : ''}
            </button>
          </div>
        </div>

        {/* ── IBCS title: who, what in which unit, when and which scenario ── */}
        <div className="ibcs-title">
          <span>Codelix</span>
          <strong>Profit and loss in ₹</strong>
          <span>{period.label} · {scenario}{cmpPeriod ? ` (${cmpTag} = ${rangeLabel(cmpPeriod.start, cmpPeriod.end)})` : ''} · cash basis{opts.excludeGst ? ', revenue without GST' : ''}</span>
        </div>

        {/* ── The three numbers ────────────────────────────────── */}
        <div className="ibcs-kpis">
          <Kpi label="Revenue" value={fmtINR(T.revenue)} cmpTag={hasCmp ? cmpTag : null} cmpValue={hasCmp ? fmtINR(cmp.revenue) : ''}
            delta={hasCmp ? T.revenue - cmp.revenue : null} deltaText={hasCmp ? signed(T.revenue - cmp.revenue) : ''} pctText={hasCmp ? signedPct(pctChange(T.revenue, cmp.revenue)) : ''} />
          <Kpi label={loss ? 'Net loss' : 'Net profit'} value={fmtINR(T.profit)} bad={loss} cmpTag={hasCmp ? cmpTag : null} cmpValue={hasCmp ? fmtINR(cmp.profit) : ''}
            delta={hasCmp ? T.profit - cmp.profit : null} deltaText={hasCmp ? signed(T.profit - cmp.profit) : ''} pctText={hasCmp ? signedPct(pctChange(T.profit, cmp.profit)) : ''} />
          <Kpi label="Margin (net profit ÷ revenue)" value={fmtPct(T.margin)} bad={T.margin != null && T.margin < 0} cmpTag={hasCmp ? cmpTag : null} cmpValue={hasCmp ? fmtPct(cmp.margin) : ''}
            delta={marginDelta} deltaText={signedPts(marginDelta)} />
        </div>

        {isEmpty ? (
          <div className="mac-card ibcs-empty">No transactions in {period.label}. Pick another period, or record income and expenses in Transactions.</div>
        ) : (
          <>
            {/* ── Month by month ───────────────────────────────── */}
            <section className="mac-card ibcs-section">
              <div className="ibcs-legend">
                <span><i className="ibcs-key ibcs-key-ac" /> AC (actual)</span>
                {cmpTag && <span><i className="ibcs-key ibcs-key-cmp" /> {cmpTag} ({cmpTag === 'PY' ? 'same month last year' : 'earlier period'})</span>}
                <span className="faint no-print">Click a month to open it</span>
              </div>
              <ColumnChart title={`Revenue in ₹ · ${chartRange}`} cmpTag={cmpTag} onSelect={openMonth}
                points={months.map(m => ({ label: m.label, fullLabel: m.fullLabel, ac: m.revenue, cmp: m.cmpRevenue }))} />
              <ColumnChart title={`Net profit / loss in ₹ · ${chartRange}`} cmpTag={cmpTag} onSelect={openMonth}
                points={months.map(m => ({ label: m.label, fullLabel: m.fullLabel, ac: m.profit, cmp: m.cmpProfit }))} />
              <MarginChart title={`Margin in % · ${chartRange}`} cmpTag={cmpTag}
                points={months.map(m => ({ label: m.label, ac: m.margin, cmp: m.cmpMargin }))} />
            </section>

            {/* ── Statement ────────────────────────────────────── */}
            <section className="mac-card ibcs-section">
              <div className="ibcs-chart-title">Statement in ₹ · {period.label} · {scenario}</div>
              <div className="pnl-scroll">
                <table className="data-table ibcs-table">
                  <thead>
                    <tr>
                      <th />
                      <th className="num">AC</th>
                      {hasCmp && <th className="num">{cmpTag}</th>}
                      {hasCmp && <th className="num">Δ{cmpTag}</th>}
                      {hasCmp && <th />}
                      {hasCmp && <th className="num">Δ{cmpTag} %</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {st.income.map(l => <Row key={l.line} label={l.label} ac={l.total} cmp={cmpLines.get(l.line) || 0} hasCmp={hasCmp} scale={rowScale} onDrill={() => openDrill(l.label, l.txs.flat())} />)}
                    <Row kind="sum" label="Revenue" ac={T.revenue} cmp={cmp?.revenue} hasCmp={hasCmp} scale={rowScale} />
                    {st.expenses.map(l => <Row key={l.line} label={l.label} ac={l.total} cmp={cmpLines.get(l.line) || 0} hasCmp={hasCmp} scale={rowScale} inverse onDrill={() => openDrill(l.label, l.txs.flat())} />)}
                    <Row kind="sum" label="Expenses" ac={T.expense} cmp={cmp?.expense} hasCmp={hasCmp} scale={rowScale} inverse />
                    <Row kind="net" label={loss ? 'Net loss' : 'Net profit'} ac={T.profit} cmp={cmp?.profit} hasCmp={hasCmp} scale={rowScale} />
                    <tr className="ibcs-row ibcs-row-margin">
                      <td>Margin</td>
                      <td className="num">{fmtPct(T.margin)}</td>
                      {hasCmp && <td className="num muted">{fmtPct(cmp.margin)}</td>}
                      {hasCmp && <td className={`num ibcs-${marginDelta == null ? 'flat' : tone(marginDelta)}`}>{signedPts(marginDelta)}</td>}
                      {hasCmp && <td />}
                      {hasCmp && <td />}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="pnl-hint no-print" style={{ marginTop: 8 }}>Click an amount to see the entries behind it.</div>

              {/* Everything that moved money without being income or a cost — closed unless wanted */}
              {(st.excluded.length > 0 || T.gst > 0) && (
                <details className="ibcs-more">
                  <summary>Not counted in profit ({st.excluded.length + (opts.excludeGst && T.gst > 0 ? 1 : 0)} lines)</summary>
                  <table className="data-table ibcs-table">
                    <tbody>
                      {opts.excludeGst && T.gst > 0 && <tr className="ibcs-row"><td>GST collected in receipts <span className="faint">(money in, held for the government)</span></td><td className="num">{fmtINR(T.gst)}</td></tr>}
                      {st.excluded.map(l => (
                        <tr key={l.line} className="ibcs-row">
                          <td>{l.label} <span className="faint">({l.section === 'income' ? 'money in' : 'money out'})</span></td>
                          <td className="num"><button className="pnl-cell" onClick={() => openDrill(l.label, l.txs.flat())}>{fmtINR(l.total)}</button></td>
                        </tr>
                      ))}
                      <tr className="ibcs-row ibcs-row-sum"><td>Money kept after all items</td><td className="num">{fmtINR(T.retained)}</td></tr>
                    </tbody>
                  </table>
                  <div className="pnl-hint" style={{ marginTop: 8 }}>Loans, capital, assets, deposits, drawings, transfers and GST. They change the bank balance but are not income or a cost.</div>
                </details>
              )}
            </section>
          </>
        )}
      </div>

      {/* ── What counts in profit ──────────────────────────────── */}
      <Drawer isOpen={showOpts} onClose={() => setShowOpts(false)} title="What counts in profit"
        subtitle="Shared by all partners — a change here changes everyone’s P&L and dashboard."
        footer={<>
          <button className="mac-btn mac-btn-secondary" onClick={resetOpts} disabled={!togglesOff}>Reset to defaults</button>
          <button className="mac-btn mac-btn-primary" onClick={() => setShowOpts(false)}>Done</button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PL_TOGGLES.map(t => (
            <label key={t.key} className="pnl-opt">
              <Toggle on={!!opts[t.key]} onChange={v => setOpt(t.key, v)} label={t.label} />
              <span style={{ minWidth: 0 }}>
                <span className="pnl-opt-label">{t.label}</span>
                <span className="pnl-opt-hint">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="pnl-hint" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Loans, capital, assets, deposits, money given out to be returned, and money received with “Count this as revenue” unticked never count and have no switch.</span>
        </div>
      </Drawer>

      {/* ── Entries behind a number ────────────────────────────── */}
      <Drawer isOpen={!!drill} onClose={() => setDrill(null)} title={drill?.title || ''} width={640}
        subtitle={drill ? `${drill.txs.length} transaction${drill.txs.length === 1 ? '' : 's'} · total ${fmtINR(drill.txs.reduce((s, t) => s + (+t.amount || 0), 0))}` : ''}>
        {drill && (
          <div className="table-wrap">
            <table className="data-table pnl-table pnl-drill">
              <thead><tr><th>Date</th><th>Details</th><th>Account</th><th>Amount</th></tr></thead>
              <tbody>
                {drill.txs.map(t => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.date)}</td>
                    <td className="pnl-wrap">{t.remark || t.clientName || t.paidTo || t.category || t.source || '—'}{t.person ? <span className="faint"> · {t.person}</span> : null}</td>
                    <td>{t.accountType}</td>
                    <td className={t.type === 'Credit' ? 'pnl-pos' : undefined}>{t.type === 'Credit' ? '+' : '−'}{fmtINR(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Drawer>
    </div>
  );
}
