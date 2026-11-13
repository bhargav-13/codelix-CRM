import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import { PageLoader } from '../components/ui/CodelixLoader';
import TrendChart, { RankedBars } from '../components/charts/TrendChart';
import { SERIES } from '../components/charts/palette';
import { transactionsDB, projectsDB, settingsDB } from '../lib/db';
import {
  PERIOD_PRESETS, PL_TOGGLES, resolvePeriod, previousPeriod, samePeriodLastYear, effectiveEnd,
  buildColumns, buildStatement, summarize, computeBalances, computeReceivables, gstClientSet,
  currentMonth, addMonths, monthsBetween, monthLabel, fyStartYear, fyLabel, fyStartMonth, fyEndMonth,
  txMonth, classify, fmtINR, fmtCompact, fmtPct, pctChange, loadPlOptions, savePlOptions,
  statementToCSV, rangeLabel,
} from '../lib/finance';
import {
  Download, Printer, SlidersHorizontal, TrendingUp, TrendingDown, Minus, ArrowUpRight,
  ArrowDownRight, Wallet, Receipt, Percent, CalendarRange, Info, Eye, EyeOff, Flame, Trophy,
} from 'lucide-react';

const INK = { primary: '#1D1D1F', secondary: '#6E6E73', muted: '#AEAEB2' };
const GOOD = '#248A3D', BAD = '#D70015';

// ── Small UI pieces ───────────────────────────────────────────────
function Delta({ cur, prev, inverse = false, pp = false, label }) {
  if (prev == null) return <span style={{ fontSize: 11, color: INK.muted }}>no comparison</span>;
  const d = pp ? (cur ?? 0) - (prev ?? 0) : pctChange(cur, prev);
  if (d == null || !isFinite(d)) return <span style={{ fontSize: 11, color: INK.muted }}>— vs {label}</span>;
  const up = d > 0.05, down = d < -0.05;
  const good = inverse ? down : up;
  const color = !up && !down ? INK.secondary : good ? GOOD : BAD;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color, fontWeight: 550 }}>
      <Icon size={12} />{d > 0 ? '+' : ''}{d.toFixed(1)}{pp ? ' pts' : '%'}
      <span style={{ color: INK.muted, fontWeight: 400 }}>vs {label}</span>
    </span>
  );
}

function Kpi({ icon: Icon, tint, label, value, sub, children }) {
  return (
    <div className="mac-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={14} color={INK.primary} />
        </div>
        <span style={{ fontSize: 12, color: INK.secondary, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 680, color: INK.primary, letterSpacing: '-0.6px', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: INK.muted }}>{sub}</div>}
      {children}
    </div>
  );
}

function Section({ title, right, children, style }) {
  return (
    <div className="mac-card" style={{ padding: 20, minWidth: 0, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 650, color: INK.primary }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ width: 34, height: 20, borderRadius: 10, border: 'none', padding: 2, cursor: 'pointer', flexShrink: 0,
        background: on ? '#34C759' : 'rgba(0,0,0,0.15)', transition: 'background 0.15s' }}>
      <span style={{ display: 'block', width: 16, height: 16, borderRadius: 8, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        transform: `translateX(${on ? 14 : 0}px)`, transition: 'transform 0.15s' }} />
    </button>
  );
}

const money = v => (
  <span style={{ fontVariantNumeric: 'tabular-nums', color: v < 0 ? BAD : undefined }}>{v === 0 ? '—' : fmtINR(v)}</span>
);

// ── Page ──────────────────────────────────────────────────────────
export default function Reports() {
  const [txs, setTxs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [openBal, setOpenBal] = useState({ cash: 0, bank: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [presetId, setPresetId] = useState('this_fy');
  const [custom, setCustom] = useState({ start: addMonths(currentMonth(), -5), end: currentMonth() });
  const [compareMode, setCompareMode] = useState('prev');   // prev | yoy | none
  const [granularity, setGranularity] = useState('month');  // month | quarter | year
  const [opts, setOpts] = useState(loadPlOptions);
  const [showOpts, setShowOpts] = useState(false);
  const [drill, setDrill] = useState(null);                 // { title, txs }

  const load = useCallback(async () => {
    try {
      const [t, p, ob] = await Promise.all([transactionsDB.getAll(), projectsDB.getAll(), settingsDB.get('opening_balances')]);
      setTxs(t); setProjects(p); if (ob) setOpenBal(ob);
    } catch (e) { console.error(e); setLoadError(e.message || 'Could not load data'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const setOpt = (k, v) => setOpts(o => { const n = { ...o, [k]: v }; savePlOptions(n); return n; });

  const now = currentMonth();
  const firstMonth = useMemo(() => txs.reduce((m, t) => { const k = txMonth(t); return k && k < m ? k : m; }, now), [txs, now]);
  const ctx = useMemo(() => ({ gstClients: gstClientSet(projects) }), [projects]);

  const period = useMemo(() => resolvePeriod(presetId, { now, firstMonth, custom }), [presetId, now, firstMonth, custom]);
  const periodEnd = effectiveEnd(period, now);
  const cmpPeriod = useMemo(() => {
    if (compareMode === 'none' || presetId === 'all') return null;
    return compareMode === 'yoy' ? samePeriodLastYear(period, now) : previousPeriod(period, now);
  }, [compareMode, presetId, period, now]);
  const cmpLabel = compareMode === 'yoy' ? 'last year' : 'prev. period';

  const columns = useMemo(() => buildColumns(period.start, periodEnd, granularity), [period.start, periodEnd, granularity]);
  const st = useMemo(() => buildStatement(txs, columns, opts, ctx), [txs, columns, opts, ctx]);
  const cmp = useMemo(() => cmpPeriod ? summarize(txs, cmpPeriod.start, cmpPeriod.end, opts, ctx) : null, [txs, cmpPeriod, opts, ctx]);
  const cmpLines = useMemo(() => {
    if (!cmp) return null;
    const m = new Map();
    [...cmp.statement.income, ...cmp.statement.expenses, ...cmp.statement.excluded].forEach(l => m.set(l.line, l.total));
    return m;
  }, [cmp]);

  const bal = useMemo(() => computeBalances(txs, openBal), [txs, openBal]);
  const receivables = useMemo(() => computeReceivables(projects), [projects]);
  const monthsInPeriod = monthsBetween(period.start, periodEnd).length;

  // Burn = average monthly expenses over the last 3 complete months
  const burn = useMemo(() => summarize(txs, addMonths(now, -3), addMonths(now, -1), opts, ctx).expense / 3, [txs, now, opts, ctx]);
  const runway = burn > 0 ? bal.total / burn : null;

  // Fixed snapshot windows
  const snapshots = useMemo(() => ['this_month', 'last_month', 'this_quarter', 'last_quarter', 'last_3m', 'last_6m', 'last_12m', 'this_fy', 'last_fy', 'all']
    .map(id => {
      const p = resolvePeriod(id, { now, firstMonth });
      const s = summarize(txs, p.start, effectiveEnd(p, now), opts, ctx);
      return { id, name: PERIOD_PRESETS.find(x => x.id === id).label, range: p.label, ...s };
    }), [txs, now, firstMonth, opts, ctx]);

  // Trend: the selected period's columns, or the last 12 months if the period is too short to chart
  const trendCols = useMemo(() => columns.length >= 3 ? columns : buildColumns(addMonths(now, -11), now, 'month'), [columns, now]);
  const trend = useMemo(() => {
    const s = trendCols === columns ? st : buildStatement(txs, trendCols, opts, ctx);
    return trendCols.map((c, i) => ({ label: c.label, fullLabel: rangeLabel(c.start, c.end), revenue: s.revenue[i], expense: s.expense[i], profit: s.profit[i], margin: s.margin[i], col: c }));
  }, [trendCols, columns, st, txs, opts, ctx]);

  // Breakdowns for the selected period
  const periodTxs = useMemo(() => txs.filter(t => { const k = txMonth(t); return k >= period.start && k <= periodEnd; }), [txs, period.start, periodEnd]);
  const expenseItems = useMemo(() => st.expenses.map(l => ({ label: l.label, value: l.total, line: l })).filter(x => x.value > 0), [st]);
  const clientItems = useMemo(() => {
    const m = new Map();
    periodTxs.forEach(t => { const c = classify(t); if (c.revenue) { const k = t.clientName?.trim() || 'Unnamed client'; m.set(k, (m.get(k) || 0) + (+t.amount || 0)); } });
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [periodTxs]);

  // Month insights (always monthly, within selected period)
  const insights = useMemo(() => {
    const cols = buildColumns(period.start, periodEnd, 'month');
    const s = cols === columns ? st : buildStatement(txs, cols, opts, ctx);
    const months = cols.map((c, i) => ({ label: monthLabel(c.start, true), profit: s.profit[i], revenue: s.revenue[i], expense: s.expense[i] }));
    const active = months.filter(m => m.revenue || m.expense);
    if (!active.length) return null;
    const best = active.reduce((a, b) => b.profit > a.profit ? b : a);
    const worst = active.reduce((a, b) => b.profit < a.profit ? b : a);
    const topRev = active.reduce((a, b) => b.revenue > a.revenue ? b : a);
    const profitable = active.filter(m => m.profit > 0).length;
    return { best, worst, topRev, profitable, count: active.length, avgProfit: s.totals.profit / months.length };
  }, [period.start, periodEnd, columns, st, txs, opts, ctx]);

  // FY-by-FY summary
  const fyRows = useMemo(() => {
    const out = [];
    for (let fy = fyStartYear(firstMonth); fy <= fyStartYear(now); fy++) {
      const s = summarize(txs, fyStartMonth(fy), fyEndMonth(fy) > now ? now : fyEndMonth(fy), opts, ctx);
      out.push({ fy, label: fyLabel(fy), partial: fyEndMonth(fy) > now, ...s });
    }
    return out.map((r, i) => ({ ...r, revGrowth: i ? pctChange(r.revenue, out[i - 1].revenue) : null, profitGrowth: i ? pctChange(r.profit, out[i - 1].profit) : null })).reverse();
  }, [txs, firstMonth, now, opts, ctx]);

  function exportCSV() {
    const csv = statementToCSV(st, `Codelix P&L — ${period.label}`);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `codelix-pnl-${period.start}-to-${periodEnd}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const openDrill = (title, list) => setDrill({ title, txs: [...list].sort((a, b) => (b.date || '').localeCompare(a.date || '')) });
  const pickPreset = id => { setPresetId(id); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  if (loading) return (<div><Header title="P&L Reports" subtitle="Financial year starts in April" /><PageLoader /></div>);

  const T = st.totals;
  const togglesOff = PL_TOGGLES.filter(t => opts[t.key] !== t.def).length;

  return (
    <div className="pnl-page">
      <Header
        title="P&L Reports"
        subtitle={`${period.label} · cash basis · FY starts April`}
        actions={<>
          <button onClick={exportCSV} className="mac-btn mac-btn-secondary no-print" style={{ fontSize: 13 }}><Download size={13} /> CSV</button>
          <button onClick={() => window.print()} className="mac-btn mac-btn-secondary no-print" style={{ fontSize: 13 }}><Printer size={13} /> Print / PDF</button>
        </>}
      />

      <div className="page-body">
        {loadError && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,59,48,0.06)', color: BAD, fontSize: 12.5 }}>{loadError}</div>}

        {/* ── Controls ─────────────────────────────────────────── */}
        <div className="controls-bar no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarRange size={14} color={INK.secondary} />
            <select className="mac-select" value={presetId} onChange={e => setPresetId(e.target.value)} style={{ width: 'auto', fontSize: 13 }} aria-label="Period">
              {PERIOD_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          {presetId === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="month" className="mac-input" value={custom.start} max={now} onChange={e => e.target.value && setCustom(c => ({ ...c, start: e.target.value }))} style={{ width: 'auto', fontSize: 13 }} aria-label="From month" />
              <span style={{ fontSize: 12, color: INK.muted }}>to</span>
              <input type="month" className="mac-input" value={custom.end} max={now} onChange={e => e.target.value && setCustom(c => ({ ...c, end: e.target.value }))} style={{ width: 'auto', fontSize: 13 }} aria-label="To month" />
            </div>
          )}
          <select className="mac-select" value={compareMode} onChange={e => setCompareMode(e.target.value)} style={{ width: 'auto', fontSize: 13 }} aria-label="Compare with">
            <option value="prev">Compare: previous period</option>
            <option value="yoy">Compare: same period last year</option>
            <option value="none">No comparison</option>
          </select>
          <div className="tab-bar">
            {[['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly (FY)']].map(([k, l]) => (
              <button key={k} className={`tab-item ${granularity === k ? 'active' : ''}`} onClick={() => setGranularity(k)}>{l}</button>
            ))}
          </div>
          <button onClick={() => setShowOpts(s => !s)} className="mac-btn mac-btn-secondary" style={{ fontSize: 13 }}>
            <SlidersHorizontal size={13} /> What counts in P&L{togglesOff ? ` · ${togglesOff} changed` : ''}
          </button>
        </div>

        {showOpts && (
          <div className="mac-card no-print" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 650 }}>Include in profit calculation</span>
              <button className="mac-btn mac-btn-ghost" style={{ fontSize: 12 }}
                onClick={() => { const d = Object.fromEntries(PL_TOGGLES.map(t => [t.key, t.def])); setOpts(d); savePlOptions(d); }}>Reset to defaults</button>
            </div>
            <div className="rg-2" style={{ gap: 10 }}>
              {PL_TOGGLES.map(t => (
                <label key={t.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.025)', cursor: 'pointer' }}>
                  <Toggle on={!!opts[t.key]} onChange={v => setOpt(t.key, v)} label={t.label} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: INK.primary }}>{t.label}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: INK.secondary, marginTop: 1 }}>{t.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: INK.secondary, marginTop: 12 }}>
              <Info size={12} /> Items you switch off are still listed under “Not counted in profit”, so the full money flow stays visible.
            </div>
          </div>
        )}

        {/* ── KPIs ─────────────────────────────────────────────── */}
        <div className="rg-4">
          <Kpi icon={ArrowUpRight} tint="rgba(42,120,214,0.12)" label="Revenue" value={fmtINR(T.revenue)} sub={opts.excludeGst ? `Excl. GST · ${fmtINR(T.gst)} GST removed` : 'Including GST (if any)'}>
            <Delta cur={T.revenue} prev={cmp?.revenue} label={cmpLabel} />
          </Kpi>
          <Kpi icon={ArrowDownRight} tint="rgba(235,104,52,0.12)" label="Expenses" value={fmtINR(T.expense)} sub={`${st.expenses.length} expense lines`}>
            <Delta cur={T.expense} prev={cmp?.expense} label={cmpLabel} inverse />
          </Kpi>
          <Kpi icon={T.profit >= 0 ? TrendingUp : TrendingDown} tint="rgba(27,175,122,0.13)" label={T.profit >= 0 ? 'Net profit' : 'Net loss'} value={fmtINR(T.profit)} sub={`Avg ${fmtINR(T.profit / Math.max(1, monthsInPeriod))} / month`}>
            <Delta cur={T.profit} prev={cmp?.profit} label={cmpLabel} />
          </Kpi>
          <Kpi icon={Percent} tint="rgba(0,0,0,0.05)" label="Profit margin" value={fmtPct(T.margin)} sub="Net profit ÷ revenue">
            <Delta cur={T.margin} prev={cmp?.margin} label={cmpLabel} pp />
          </Kpi>
          <Kpi icon={Wallet} tint="rgba(0,113,227,0.1)" label="Cash + bank now" value={fmtINR(bal.total)} sub={`Bank ${fmtCompact(bal.bank)} · Cash ${fmtCompact(bal.cash)}`} />
          <Kpi icon={Receipt} tint="rgba(255,149,0,0.12)" label="To collect (projects)" value={fmtINR(receivables)} sub="Project value not yet received" />
          <Kpi icon={Flame} tint="rgba(255,59,48,0.08)" label="Monthly burn" value={fmtINR(burn)} sub={runway != null ? `Runway ≈ ${runway.toFixed(1)} months of expenses` : 'Avg expenses, last 3 full months'} />
          <Kpi icon={Wallet} tint="rgba(175,82,222,0.1)" label="Retained after all items" value={fmtINR(T.retained)} sub="Profit ± items not counted (drawings, splits…)" />
        </div>

        {/* ── Profit snapshot ──────────────────────────────────── */}
        <Section title="Profit at a glance" right={<span style={{ fontSize: 11.5, color: INK.muted }}>Click any window to open it</span>}>
          <div className="pnl-snap">
            {snapshots.map(s => (
              <button key={s.id} onClick={() => pickPreset(s.id)} className="pnl-snap-item"
                style={{ outline: presetId === s.id ? '2px solid #0071E3' : 'none' }}>
                <span style={{ fontSize: 11.5, color: INK.secondary, fontWeight: 550 }}>{s.name}</span>
                <span style={{ fontSize: 17, fontWeight: 680, color: s.profit < 0 ? BAD : INK.primary, fontVariantNumeric: 'tabular-nums' }}>{fmtCompact(s.profit)}</span>
                <span style={{ fontSize: 11, color: INK.muted }}>Rev {fmtCompact(s.revenue)} · {fmtPct(s.margin, 0)}</span>
                <span style={{ fontSize: 10.5, color: INK.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.range}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Trend ────────────────────────────────────────────── */}
        <Section title={trendCols === columns ? `Revenue, expenses & profit — ${period.label}` : 'Revenue, expenses & profit — last 12 months'}
          right={<span style={{ fontSize: 11.5, color: INK.muted }}>{granularity === 'month' || trendCols !== columns ? 'Monthly' : granularity === 'quarter' ? 'Quarterly' : 'By financial year'}</span>}>
          <TrendChart points={trend} onSelect={i => {
            const c = trend[i].col;
            setPresetId('custom'); setCustom({ start: c.start, end: c.end });
          }} />
        </Section>

        {/* ── Statement ────────────────────────────────────────── */}
        <Section title="Profit & Loss statement"
          right={<span style={{ fontSize: 11.5, color: INK.muted }}>Click any amount to see its transactions</span>}>
          <div style={{ overflowX: 'auto', margin: '0 -20px', padding: '0 20px' }}>
            <table className="pnl-table">
              <thead>
                <tr>
                  <th className="pnl-sticky">Line</th>
                  {columns.length > 1 && columns.map(c => <th key={c.key}>{c.label}{c.partial ? '*' : ''}</th>)}
                  <th>Total</th>
                  {cmp && <th>{compareMode === 'yoy' ? 'Last year' : 'Prev. period'}</th>}
                  {cmp && <th>Change</th>}
                </tr>
              </thead>
              <tbody>
                <SectionRow label="Income" cols={columns.length} cmp={!!cmp} />
                {st.income.map(l => <LineRow key={l.line} l={l} columns={columns} cmpVal={cmpLines?.get(l.line) ?? 0} showCmp={!!cmp} onDrill={openDrill} onToggle={setOpt} />)}
                <TotalRow label="Total income" values={st.revenue} total={T.revenue} cmpVal={cmp?.revenue} columns={columns} />
                <SectionRow label="Expenses" cols={columns.length} cmp={!!cmp} />
                {st.expenses.map(l => <LineRow key={l.line} l={l} columns={columns} cmpVal={cmpLines?.get(l.line) ?? 0} showCmp={!!cmp} inverse onDrill={openDrill} onToggle={setOpt} />)}
                <TotalRow label="Total expenses" values={st.expense} total={T.expense} cmpVal={cmp?.expense} columns={columns} inverse />
                <TotalRow label="Net profit" values={st.profit} total={T.profit} cmpVal={cmp?.profit} columns={columns} strong />
                <tr className="pnl-margin">
                  <td className="pnl-sticky">Margin</td>
                  {columns.length > 1 && st.margin.map((m, i) => <td key={i}>{fmtPct(m)}</td>)}
                  <td>{fmtPct(T.margin)}</td>
                  {cmp && <td>{fmtPct(cmp.margin)}</td>}
                  {cmp && <td>{T.margin != null && cmp.margin != null ? `${(T.margin - cmp.margin) > 0 ? '+' : ''}${(T.margin - cmp.margin).toFixed(1)} pts` : '—'}</td>}
                </tr>
                {st.excluded.length > 0 && <>
                  <SectionRow label="Not counted in profit" cols={columns.length} cmp={!!cmp} muted />
                  {st.excluded.map(l => <LineRow key={l.line} l={l} columns={columns} cmpVal={cmpLines?.get(l.line) ?? 0} showCmp={!!cmp} excluded onDrill={openDrill} onToggle={setOpt} />)}
                  <TotalRow label="Retained after all items" values={st.retained} total={T.retained} cmpVal={cmp ? cmp.retained : undefined} columns={columns} />
                </>}
                {opts.excludeGst && T.gst > 0 && (
                  <tr className="pnl-margin">
                    <td className="pnl-sticky">GST in receipts (removed above)</td>
                    {columns.length > 1 && st.gst.map((g, i) => <td key={i}>{money(g)}</td>)}
                    <td>{money(T.gst)}</td>
                    {cmp && <td>{money(cmp.gst)}</td>}
                    {cmp && <td />}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {columns.some(c => c.partial) && <div style={{ fontSize: 11, color: INK.muted, marginTop: 8 }}>* partial period (only months inside the selected range)</div>}
          {st.income.length + st.expenses.length + st.excluded.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12.5, color: INK.muted }}>No transactions in {period.label}</div>
          )}
        </Section>

        {/* ── Breakdowns ───────────────────────────────────────── */}
        <div className="rg-3">
          <Section title="Where the money went">
            <RankedBars items={expenseItems} color={SERIES.expense} onSelect={r => openDrill(r.label, r.line.txs.flat())} />
          </Section>
          <Section title="Revenue by client">
            <RankedBars items={clientItems} color={SERIES.revenue}
              onSelect={r => openDrill(`Revenue — ${r.label}`, periodTxs.filter(t => classify(t).revenue && (t.clientName?.trim() || 'Unnamed client') === r.label))} />
          </Section>
          <Section title="Highlights">
            {insights ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Insight icon={Trophy} label="Best month" value={insights.best.label} detail={fmtINR(insights.best.profit)} />
                <Insight icon={TrendingDown} label="Weakest month" value={insights.worst.label} detail={fmtINR(insights.worst.profit)} bad={insights.worst.profit < 0} />
                <Insight icon={ArrowUpRight} label="Highest revenue" value={insights.topRev.label} detail={fmtINR(insights.topRev.revenue)} />
                <Insight icon={Percent} label="Profitable months" value={`${insights.profitable} of ${insights.count}`} detail={fmtPct(insights.profitable / insights.count * 100, 0)} />
                <Insight icon={Wallet} label="Average profit / month" value={fmtINR(insights.avgProfit)} />
                {bal.pendingReimburse > 0 && <Insight icon={Receipt} label="Owed to partners (reimburse)" value={fmtINR(bal.pendingReimburse)} />}
              </div>
            ) : <div style={{ fontSize: 12.5, color: INK.muted, textAlign: 'center', padding: '18px 0' }}>No activity in this period</div>}
          </Section>
        </div>

        {/* ── FY summary ───────────────────────────────────────── */}
        <Section title="Year by year (April – March)">
          <div style={{ overflowX: 'auto' }}>
            <table className="pnl-table">
              <thead><tr><th className="pnl-sticky">Financial year</th><th>Revenue</th><th>Expenses</th><th>Net profit</th><th>Margin</th><th>Revenue growth</th><th>Profit growth</th><th /></tr></thead>
              <tbody>
                {fyRows.map(r => (
                  <tr key={r.fy}>
                    <td className="pnl-sticky" style={{ fontWeight: 600 }}>{r.label}{r.partial ? ' (to date)' : ''}</td>
                    <td>{money(r.revenue)}</td><td>{money(r.expense)}</td>
                    <td style={{ fontWeight: 650 }}>{money(r.profit)}</td>
                    <td>{fmtPct(r.margin)}</td>
                    <td><GrowthCell v={r.revGrowth} /></td>
                    <td><GrowthCell v={r.profitGrowth} /></td>
                    <td><button className="mac-btn mac-btn-ghost no-print" style={{ fontSize: 12, padding: '4px 8px' }}
                      onClick={() => { setPresetId('custom'); setCustom({ start: fyStartMonth(r.fy), end: fyEndMonth(r.fy) > now ? now : fyEndMonth(r.fy) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* ── Drill-down ─────────────────────────────────────────── */}
      <Modal isOpen={!!drill} onClose={() => setDrill(null)} title={drill?.title || ''} size="lg">
        {drill && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12.5, color: INK.secondary }}>{drill.txs.length} transaction{drill.txs.length === 1 ? '' : 's'} · total <strong style={{ color: INK.primary }}>{fmtINR(drill.txs.reduce((s, t) => s + (+t.amount || 0), 0))}</strong></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="pnl-table pnl-drill">
                <thead><tr><th>Date</th><th>Details</th><th>Account</th><th>Amount</th></tr></thead>
                <tbody>
                  {drill.txs.map(t => (
                    <tr key={t.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{(t.date || '').slice(0, 10)}</td>
                      <td style={{ textAlign: 'left', whiteSpace: 'normal' }}>{t.remark || t.clientName || t.paidTo || t.category || t.source || '—'}{t.person ? <span style={{ color: INK.muted }}> · {t.person}</span> : null}</td>
                      <td style={{ textAlign: 'left' }}>{t.accountType}</td>
                      <td style={{ color: t.type === 'Credit' ? GOOD : INK.primary }}>{t.type === 'Credit' ? '+' : '−'}{fmtINR(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <style>{PNL_CSS}</style>
    </div>
  );
}

function Insight({ icon: Icon, label, value, detail, bad }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(0,0,0,0.025)' }}>
      <Icon size={14} color={INK.secondary} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: INK.muted }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: INK.primary }}>{value}</div>
      </div>
      {detail && <span style={{ fontSize: 12.5, fontWeight: 600, color: bad ? BAD : INK.secondary, fontVariantNumeric: 'tabular-nums' }}>{detail}</span>}
    </div>
  );
}

function GrowthCell({ v }) {
  if (v == null || !isFinite(v)) return <span style={{ color: INK.muted }}>—</span>;
  return <span style={{ color: v >= 0 ? GOOD : BAD, fontWeight: 550 }}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</span>;
}

function SectionRow({ label, cols, cmp, muted }) {
  const span = 2 + (cols > 1 ? cols : 0) + (cmp ? 2 : 0) - 1;
  return (
    <tr className="pnl-section">
      <td className="pnl-sticky" style={{ color: muted ? INK.muted : INK.secondary }}>{label}</td>
      <td colSpan={span} />
    </tr>
  );
}

function LineRow({ l, columns, cmpVal, showCmp, inverse, excluded, onDrill, onToggle }) {
  const d = pctChange(l.total, cmpVal);
  const cell = (v, list, title) => (
    <td>
      {v === 0 ? <span style={{ color: '#D1D1D6' }}>—</span> : (
        <button className="pnl-cell" onClick={() => onDrill(title, list)}>{fmtINR(v)}</button>
      )}
    </td>
  );
  return (
    <tr className={excluded ? 'pnl-excluded' : ''}>
      <td className="pnl-sticky">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ paddingLeft: 10 }}>{l.label}{excluded ? <span style={{ color: INK.muted }}> ({l.section === 'income' ? 'money in' : 'money out'})</span> : null}</span>
          {l.toggle && (
            <button className="pnl-tog no-print" title={excluded ? 'Count this in profit' : 'Exclude this from profit'} onClick={() => onToggle(l.toggle, !!excluded)}>
              {excluded ? <><Eye size={11} /> Include</> : <><EyeOff size={11} /> Exclude</>}
            </button>
          )}
        </span>
      </td>
      {columns.length > 1 && l.values.map((v, i) => <Fragment key={i}>{cell(v, l.txs[i], `${l.label} — ${columns[i].label}`)}</Fragment>)}
      {cell(l.total, l.txs.flat(), `${l.label} — total`)}
      {showCmp && <td style={{ color: INK.secondary }}>{cmpVal ? fmtINR(cmpVal) : '—'}</td>}
      {showCmp && <td><ChangeCell d={d} inverse={inverse} /></td>}
    </tr>
  );
}

function ChangeCell({ d, inverse }) {
  if (d == null || !isFinite(d)) return <span style={{ color: INK.muted }}>—</span>;
  const good = inverse ? d < 0 : d > 0;
  return <span style={{ color: Math.abs(d) < 0.05 ? INK.secondary : good ? GOOD : BAD, fontWeight: 550 }}>{d > 0 ? '+' : ''}{d.toFixed(1)}%</span>;
}

function TotalRow({ label, values, total, cmpVal, columns, strong, inverse }) {
  return (
    <tr className={strong ? 'pnl-net' : 'pnl-total'}>
      <td className="pnl-sticky">{label}</td>
      {columns.length > 1 && values.map((v, i) => <td key={i}>{money(v)}</td>)}
      <td>{money(total)}</td>
      {cmpVal !== undefined && <td style={{ color: INK.secondary }}>{cmpVal == null ? '—' : fmtINR(cmpVal)}</td>}
      {cmpVal !== undefined && <td>{cmpVal == null ? '—' : <ChangeCell d={pctChange(total, cmpVal)} inverse={inverse} />}</td>}
    </tr>
  );
}

const PNL_CSS = `
.pnl-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12.5px; }
.pnl-table th { text-align: right; padding: 8px 12px; font-size: 11px; font-weight: 600; color: #8E8E93; text-transform: uppercase; letter-spacing: .4px; white-space: nowrap; border-bottom: 1px solid rgba(0,0,0,0.08); background: #fff; }
.pnl-table td { text-align: right; padding: 7px 12px; white-space: nowrap; border-bottom: 1px solid rgba(0,0,0,0.045); color: #1D1D1F; font-variant-numeric: tabular-nums; }
.pnl-table .pnl-sticky { position: sticky; left: 0; background: #fff; text-align: left; z-index: 1; min-width: 210px; }
.pnl-table th.pnl-sticky { z-index: 2; }
.pnl-section td { padding-top: 14px; font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .5px; border-bottom: none; }
.pnl-total td { font-weight: 650; background: rgba(0,0,0,0.02); }
.pnl-total td.pnl-sticky { background: #FAFAFA; }
.pnl-net td { font-weight: 700; font-size: 13.5px; border-top: 2px solid rgba(0,0,0,0.12); background: rgba(27,175,122,0.06); }
.pnl-net td.pnl-sticky { background: #F1FAF6; }
.pnl-margin td { color: #6E6E73; font-size: 12px; }
.pnl-excluded td { color: #8E8E93; }
.pnl-excluded .pnl-cell { color: #8E8E93; }
.pnl-cell { background: none; border: none; padding: 2px 4px; margin: -2px -4px; border-radius: 5px; font: inherit; color: inherit; cursor: pointer; font-variant-numeric: tabular-nums; }
.pnl-cell:hover { background: rgba(0,113,227,0.08); color: #0071E3; }
.pnl-tog { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; padding: 2px 7px; border-radius: 100px; border: 1px solid rgba(0,0,0,0.1); background: #fff; color: #6E6E73; cursor: pointer; font-family: inherit; }
.pnl-tog:hover { border-color: #0071E3; color: #0071E3; }
.pnl-drill td, .pnl-drill th { text-align: left; }
.pnl-drill td:last-child, .pnl-drill th:last-child { text-align: right; }
.pnl-snap { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 10px; }
.pnl-snap-item { display: flex; flex-direction: column; gap: 3px; text-align: left; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.07); background: rgba(0,0,0,0.015); cursor: pointer; font-family: inherit; min-width: 0; transition: background .15s; }
.pnl-snap-item:hover { background: rgba(0,113,227,0.05); }
@media (max-width: 1024px) { .pnl-snap { grid-template-columns: repeat(3, minmax(0,1fr)); } }
@media (max-width: 640px) { .pnl-snap { grid-template-columns: repeat(2, minmax(0,1fr)); } .pnl-table .pnl-sticky { min-width: 150px; } }
@media print {
  .no-print, .sidebar-aside, .page-header button { display: none !important; }
  .pnl-page .mac-card { box-shadow: none; break-inside: avoid; }
}
`;
