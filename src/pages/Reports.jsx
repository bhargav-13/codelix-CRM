import { usePlOptions } from '../lib/plOptions';
import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import Header from '../components/layout/Header';
import TrendChart, { RankedBars } from '../components/charts/TrendChart';
import { SERIES } from '../components/charts/palette';
import { Drawer, StatTiles, SkeletonRows, ErrorPanel, RowMenu, fmtDate, useToast } from '../components/ui/kit';
import { transactionsDB, projectsDB, settingsDB } from '../lib/db';
import {
  PERIOD_PRESETS, PL_TOGGLES, resolvePeriod, previousPeriod, samePeriodLastYear, effectiveEnd,
  buildColumns, buildStatement, summarize, computeBalances, computeReceivables, computePositions, gstClientSet,
  currentMonth, addMonths, monthsBetween, monthLabel, fyStartYear, fyLabel, fyStartMonth, fyEndMonth,
  txMonth, classify, fmtINR, fmtCompact, fmtPct, pctChange, 
  statementToCSV, rangeLabel,
} from '../lib/finance';
import {
  Download, Printer, SlidersHorizontal, TrendingUp, TrendingDown, Minus, ArrowUpRight,
  ArrowDownRight, Wallet, Receipt, Percent, Info, Eye, EyeOff, Flame, Trophy,
} from 'lucide-react';
import './Reports.css';

const GRANULARITIES = [['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly (FY)']];
const SNAPSHOT_IDS = ['this_month', 'last_month', 'this_quarter', 'last_quarter', 'last_3m', 'last_6m', 'last_12m', 'this_fy', 'last_fy', 'all'];

const scrollToTop = () => document.querySelector('.app-main')?.scrollTo({ top: 0, behavior: 'smooth' });

// ── Small UI pieces ───────────────────────────────────────────────
function Delta({ cur, prev, inverse = false, pp = false, label }) {
  if (prev == null) return <span className="faint">no comparison</span>;
  const d = pp ? (cur ?? 0) - (prev ?? 0) : pctChange(cur, prev);
  if (d == null || !isFinite(d)) return <span className="faint">— vs {label}</span>;
  const up = d > 0.05, down = d < -0.05;
  const good = inverse ? down : up;
  const tone = !up && !down ? 'muted' : good ? 'pnl-pos' : 'pnl-neg';
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  return (
    <span className={`pnl-delta ${tone}`}>
      <Icon size={12} />{d > 0 ? '+' : ''}{d.toFixed(1)}{pp ? ' pts' : '%'}
      <span className="faint">vs {label}</span>
    </span>
  );
}

// Two-line sub text for a KPI tile: a note, then the comparison
const kpiSub = (note, delta) => <><span style={{ display: 'block' }}>{note}</span>{delta}</>;

function Section({ title, hint, children }) {
  return (
    <section className="mac-card pnl-section">
      <div className="pnl-section-head">
        <h2 className="section-title">{title}</h2>
        {hint && <span className="pnl-hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="pnl-switch" onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

const money = v => <span className={v < 0 ? 'pnl-neg' : undefined}>{v === 0 ? '—' : fmtINR(v)}</span>;

function Insight({ icon: Icon, label, value, detail, bad }) {
  return (
    <div className="pnl-insight">
      <Icon size={15} />
      <div className="pnl-insight-body">
        <div className="pnl-insight-label">{label}</div>
        <div className="pnl-insight-value">{value}</div>
      </div>
      {detail && <span className={`pnl-insight-detail ${bad ? 'pnl-neg' : ''}`}>{detail}</span>}
    </div>
  );
}

function GrowthCell({ v }) {
  if (v == null || !isFinite(v)) return <span className="faint">—</span>;
  return <span className={v >= 0 ? 'pnl-pos' : 'pnl-neg'} style={{ fontWeight: 600 }}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</span>;
}

function ChangeCell({ d, inverse }) {
  if (d == null || !isFinite(d)) return <span className="faint">—</span>;
  const good = inverse ? d < 0 : d > 0;
  return <span className={Math.abs(d) < 0.05 ? 'muted' : good ? 'pnl-pos' : 'pnl-neg'} style={{ fontWeight: 600 }}>{d > 0 ? '+' : ''}{d.toFixed(1)}%</span>;
}

// ── Statement rows ────────────────────────────────────────────────
function GroupRow({ label, cols, cmp, muted }) {
  const span = 2 + (cols > 1 ? cols : 0) + (cmp ? 2 : 0) - 1;
  return (
    <tr className={`pnl-group ${muted ? 'muted' : ''}`}>
      <td className="pnl-sticky">{label}</td>
      <td colSpan={span} />
    </tr>
  );
}

function LineRow({ l, columns, cmpVal, showCmp, inverse, excluded, onDrill, onToggle }) {
  const d = pctChange(l.total, cmpVal);
  const cell = (v, list, title) => (
    <td>
      {v === 0 ? <span className="faint">—</span> : (
        <button className="pnl-cell" onClick={() => onDrill(title, list)}>{fmtINR(v)}</button>
      )}
    </td>
  );
  return (
    <tr className={excluded ? 'pnl-excluded' : ''}>
      <td className="pnl-sticky">
        <span className="pnl-line">
          <span>{l.label}{excluded ? <span className="faint"> ({l.section === 'income' ? 'money in' : 'money out'})</span> : null}</span>
          {l.toggle && l.toggle !== 'never' && l.toggle !== 'gstKept' && (
            <button className="pnl-tog no-print" title={excluded ? 'Count this in profit' : 'Exclude this from profit'} onClick={() => onToggle(l.toggle, !!excluded)}>
              {excluded ? <><Eye size={11} /> Include</> : <><EyeOff size={11} /> Exclude</>}
            </button>
          )}
        </span>
      </td>
      {columns.length > 1 && l.values.map((v, i) => <Fragment key={i}>{cell(v, l.txs[i], `${l.label} — ${columns[i].label}`)}</Fragment>)}
      {cell(l.total, l.txs.flat(), `${l.label} — total`)}
      {showCmp && <td className="muted">{cmpVal ? fmtINR(cmpVal) : '—'}</td>}
      {showCmp && <td><ChangeCell d={d} inverse={inverse} /></td>}
    </tr>
  );
}

function TotalRow({ label, values, total, cmpVal, columns, strong, inverse }) {
  return (
    <tr className={strong ? 'pnl-net' : 'pnl-total'}>
      <td className="pnl-sticky">{label}</td>
      {columns.length > 1 && values.map((v, i) => <td key={i}>{money(v)}</td>)}
      <td>{money(total)}</td>
      {cmpVal !== undefined && <td className="muted">{cmpVal == null ? '—' : fmtINR(cmpVal)}</td>}
      {cmpVal !== undefined && <td>{cmpVal == null ? '—' : <ChangeCell d={pctChange(total, cmpVal)} inverse={inverse} />}</td>}
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────
export default function Reports() {
  const [txs, setTxs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [openBal, setOpenBal] = useState({ cash: 0, bank: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const toast = useToast();
  const [presetId, setPresetId] = useState('this_fy');
  const [custom, setCustom] = useState({ start: addMonths(currentMonth(), -5), end: currentMonth() });
  const [compareMode, setCompareMode] = useState('prev');   // prev | yoy | none
  const [granularity, setGranularity] = useState('month');  // month | quarter | year
  const [opts, saveOpts] = usePlOptions();
  const [showOpts, setShowOpts] = useState(false);
  const [drill, setDrill] = useState(null);                 // { title, txs }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [t, p, ob] = await Promise.all([transactionsDB.getAll(), projectsDB.getAll(), settingsDB.get('opening_balances')]);
      setTxs(t); setProjects(p); if (ob) setOpenBal(ob);
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
  const pos = useMemo(() => computePositions(txs, ctx.gstClients, openBal), [txs, ctx, openBal]);
  // What is really free to spend: balance minus GST owed to the government and money owed to partners
  const freeCash = bal.total - pos.gstHeld - bal.pendingReimburse;
  const monthsInPeriod = monthsBetween(period.start, periodEnd).length;

  // Burn = average monthly expenses over the last 3 complete months
  const burn = useMemo(() => summarize(txs, addMonths(now, -3), addMonths(now, -1), opts, ctx).expense / 3, [txs, now, opts, ctx]);
  const runway = burn > 0 ? bal.total / burn : null;

  // Fixed snapshot windows
  const snapshots = useMemo(() => SNAPSHOT_IDS.map(id => {
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
  const openRange = (start, end) => { setPresetId('custom'); setCustom({ start, end }); };

  if (loading || loadError) return (
    <div className="pnl-page">
      <Header title="P&L Reports" subtitle={loading ? 'Loading the numbers…' : 'Could not load the report'} />
      <div className="page-body">
        {loading ? <SkeletonRows rows={8} /> : <ErrorPanel title="Could not load the P&L report" error={loadError} onRetry={load} />}
      </div>
    </div>
  );

  const T = st.totals;
  const togglesOff = PL_TOGGLES.filter(t => opts[t.key] !== t.def).length;
  const isEmpty = st.income.length + st.expenses.length + st.excluded.length === 0;

  return (
    <div className="pnl-page">
      <Header
        title="P&L Reports"
        subtitle={`${period.label} · net ${fmtINR(T.profit)} · cash basis, FY starts April`}
        actions={
          <RowMenu label="Export" items={[
            { label: 'Download CSV', icon: Download, onClick: exportCSV },
            { label: 'Print / save as PDF', icon: Printer, onClick: () => window.print() },
          ]} />
        }
      />

      <div className="page-body">
        {/* ── Period + view controls ───────────────────────────── */}
        <div className="tab-bar pnl-periods no-print" role="tablist" aria-label="Period">
          {PERIOD_PRESETS.map(p => (
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
            <option value="prev">Compare: previous period</option>
            <option value="yoy">Compare: same period last year</option>
            <option value="none">No comparison</option>
          </select>
          <div className="tab-bar" role="tablist" aria-label="Columns">
            {GRANULARITIES.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={granularity === k} className={`tab-item ${granularity === k ? 'active' : ''}`} onClick={() => setGranularity(k)}>{l}</button>
            ))}
          </div>
          <div className="toolbar-right">
            <button onClick={() => setShowOpts(true)} className="mac-btn mac-btn-secondary">
              <SlidersHorizontal size={14} /> Options{togglesOff ? ` · ${togglesOff} changed` : ''}
            </button>
          </div>
        </div>

        {/* ── KPIs ─────────────────────────────────────────────── */}
        <StatTiles items={[
          { label: 'Revenue', value: fmtINR(T.revenue), icon: ArrowUpRight, tone: 'brand',
            sub: kpiSub(opts.excludeGst ? `Excl. GST · ${fmtINR(T.gst)} GST removed` : 'Including GST (if any)', <Delta cur={T.revenue} prev={cmp?.revenue} label={cmpLabel} />) },
          { label: 'Expenses', value: fmtINR(T.expense), icon: ArrowDownRight, tone: 'warn',
            sub: kpiSub(`${st.expenses.length} expense lines`, <Delta cur={T.expense} prev={cmp?.expense} label={cmpLabel} inverse />) },
          { label: T.profit >= 0 ? 'Net profit' : 'Net loss', value: fmtINR(T.profit), icon: T.profit >= 0 ? TrendingUp : TrendingDown, tone: T.profit >= 0 ? 'good' : 'bad',
            sub: kpiSub(`Avg ${fmtINR(T.profit / Math.max(1, monthsInPeriod))} / month`, <Delta cur={T.profit} prev={cmp?.profit} label={cmpLabel} />) },
          { label: 'Profit margin', value: fmtPct(T.margin), icon: Percent,
            sub: kpiSub('Net profit ÷ revenue', <Delta cur={T.margin} prev={cmp?.margin} label={cmpLabel} pp />) },
        ]} />

        {/* ── Trend ────────────────────────────────────────────── */}
        <Section title={trendCols === columns ? `Revenue, expenses & profit — ${period.label}` : 'Revenue, expenses & profit — last 12 months'}
          hint={granularity === 'month' || trendCols !== columns ? 'Monthly' : granularity === 'quarter' ? 'Quarterly' : 'By financial year'}>
          <TrendChart points={trend} onSelect={i => openRange(trend[i].col.start, trend[i].col.end)} />
        </Section>

        {/* ── Statement ────────────────────────────────────────── */}
        <Section title="Profit & Loss statement" hint="Click any amount to see its transactions">
          <div className="pnl-scroll">
            <table className="data-table pnl-table">
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
                <GroupRow label="Income" cols={columns.length} cmp={!!cmp} />
                {st.income.map(l => <LineRow key={l.line} l={l} columns={columns} cmpVal={cmpLines?.get(l.line) ?? 0} showCmp={!!cmp} onDrill={openDrill} onToggle={setOpt} />)}
                <TotalRow label="Total income" values={st.revenue} total={T.revenue} cmpVal={cmp?.revenue} columns={columns} />
                <GroupRow label="Expenses" cols={columns.length} cmp={!!cmp} />
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
                {(st.excluded.length > 0 || T.gst > 0) && <>
                  <GroupRow label="Not counted in profit — money that still moved" cols={columns.length} cmp={!!cmp} muted />
                  {opts.excludeGst && T.gst > 0 && (
                    <tr className="pnl-excluded">
                      <td className="pnl-sticky">GST collected in receipts <span className="faint">(money in, held for the government)</span></td>
                      {columns.length > 1 && st.gst.map((g, i) => <td key={i}>{money(g)}</td>)}
                      <td>{money(T.gst)}</td>
                      {cmp && <td className="muted">{cmp.gst ? fmtINR(cmp.gst) : '—'}</td>}
                      {cmp && <td />}
                    </tr>
                  )}
                  {st.excluded.map(l => <LineRow key={l.line} l={l} columns={columns} cmpVal={cmpLines?.get(l.line) ?? 0} showCmp={!!cmp} excluded onDrill={openDrill} onToggle={setOpt} />)}
                  <TotalRow label="Money kept after all items" values={st.retained} total={T.retained} cmpVal={cmp ? cmp.retained : undefined} columns={columns} />
                </>}
              </tbody>
            </table>
          </div>
          {(st.excluded.length > 0 || T.gst > 0) && <div className="pnl-hint" style={{ marginTop: 8 }}>Money kept = net profit + money in − money out from the “not counted” lines. It is how much this period really added to cash and bank.</div>}
          {columns.some(c => c.partial) && <div className="pnl-hint" style={{ marginTop: 8 }}>* partial period (only months inside the selected range)</div>}
          {isEmpty && <div className="faint" style={{ textAlign: 'center', padding: '24px 0', fontSize: 'var(--fs-sm)' }}>No transactions in {period.label}</div>}
        </Section>

        {/* ── Breakdowns ───────────────────────────────────────── */}
        <div className="rg-2">
          <Section title="Where the money went">
            <RankedBars items={expenseItems} color={SERIES.expense} onSelect={r => openDrill(r.label, r.line.txs.flat())} />
          </Section>
          <Section title="Revenue by client">
            <RankedBars items={clientItems} color={SERIES.revenue}
              onSelect={r => openDrill(`Revenue — ${r.label}`, periodTxs.filter(t => classify(t).revenue && (t.clientName?.trim() || 'Unnamed client') === r.label))} />
          </Section>
        </div>

        <div className="rg-2">
          <Section title="Highlights" hint={period.label}>
            {insights ? (
              <div className="pnl-insights">
                <Insight icon={Trophy} label="Best month" value={insights.best.label} detail={fmtINR(insights.best.profit)} />
                <Insight icon={TrendingDown} label="Weakest month" value={insights.worst.label} detail={fmtINR(insights.worst.profit)} bad={insights.worst.profit < 0} />
                <Insight icon={ArrowUpRight} label="Highest revenue" value={insights.topRev.label} detail={fmtINR(insights.topRev.revenue)} />
                <Insight icon={Percent} label="Profitable months" value={`${insights.profitable} of ${insights.count}`} detail={fmtPct(insights.profitable / insights.count * 100, 0)} />
                <Insight icon={Wallet} label="Average profit / month" value={fmtINR(insights.avgProfit)} />
              </div>
            ) : <div className="faint" style={{ fontSize: 'var(--fs-sm)', textAlign: 'center', padding: '18px 0' }}>No activity in this period</div>}
          </Section>
          <Section title="Cash position" hint="As of today">
            <div className="pnl-insights">
              <Insight icon={Wallet} label={`Cash + bank now · Bank ${fmtCompact(bal.bank)} · Cash ${fmtCompact(bal.cash)}`} value={fmtINR(bal.total)} />
              <Insight icon={Receipt} label="To collect — project value not yet received" value={fmtINR(receivables)} />
              <Insight icon={Flame} label={runway != null ? `Monthly burn · runway ≈ ${runway.toFixed(1)} months of expenses` : 'Monthly burn — avg expenses, last 3 full months'} value={fmtINR(burn)} />
              <Insight icon={Wallet} label={`Money kept after all items · ${period.label}`} value={fmtINR(T.retained)} detail="profit ± items not counted" />
              {pos.gstCollected > 0 && <Insight icon={Receipt} label={`GST held for the government · collected ${fmtCompact(pos.gstCollected)}, paid ${fmtCompact(pos.gstPaid)}`} value={fmtINR(pos.gstHeld)} detail={pos.gstHeld > 0 ? 'not yours to spend' : 'all paid'} bad={pos.gstHeld > 0} />}
              {bal.pendingReimburse > 0 && <Insight icon={Receipt} label="Owed to partners (reimburse)" value={fmtINR(bal.pendingReimburse)} />}
              {pos.lentOut > 0 && <Insight icon={ArrowUpRight} label="Given to staff / others, still to come back" value={fmtINR(pos.lentOut)} />}
              {pos.drawingsOut > 0 && <Insight icon={ArrowUpRight} label="Partner drawings not returned" value={fmtINR(pos.drawingsOut)} />}
              {(pos.gstHeld > 0 || bal.pendingReimburse > 0) && <Insight icon={Wallet} label="Free to spend — balance minus GST held and money owed to partners" value={fmtINR(freeCash)} bad={freeCash < 0} detail={freeCash < 0 ? 'short' : undefined} />}
            </div>
          </Section>
        </div>

        {/* ── Profit windows ───────────────────────────────────── */}
        <Section title="Profit at a glance" hint="Click any window to open it">
          <div className="pnl-snap">
            {snapshots.map(s => (
              <button key={s.id} onClick={() => { setPresetId(s.id); scrollToTop(); }} className={`pnl-snap-item ${presetId === s.id ? 'active' : ''}`}>
                <span className="pnl-snap-name">{s.name}</span>
                <span className={`pnl-snap-value ${s.profit < 0 ? 'pnl-neg' : ''}`}>{fmtCompact(s.profit)}</span>
                <span className="pnl-snap-sub">Rev {fmtCompact(s.revenue)} · {fmtPct(s.margin, 0)}</span>
                <span className="pnl-snap-sub">{s.range}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* ── FY summary ───────────────────────────────────────── */}
        <Section title="Year by year (April – March)">
          <div className="pnl-scroll">
            <table className="data-table pnl-table">
              <thead><tr><th className="pnl-sticky">Financial year</th><th>Revenue</th><th>Expenses</th><th>Net profit</th><th>Margin</th><th>Revenue growth</th><th>Profit growth</th><th /></tr></thead>
              <tbody>
                {fyRows.map(r => (
                  <tr key={r.fy}>
                    <td className="pnl-sticky" style={{ fontWeight: 600 }}>{r.label}{r.partial ? ' (to date)' : ''}</td>
                    <td>{money(r.revenue)}</td><td>{money(r.expense)}</td>
                    <td style={{ fontWeight: 700 }}>{money(r.profit)}</td>
                    <td>{fmtPct(r.margin)}</td>
                    <td><GrowthCell v={r.revGrowth} /></td>
                    <td><GrowthCell v={r.profitGrowth} /></td>
                    <td><button className="mac-btn mac-btn-ghost no-print" style={{ padding: '6px 10px' }}
                      onClick={() => { openRange(fyStartMonth(r.fy), fyEndMonth(r.fy) > now ? now : fyEndMonth(r.fy)); scrollToTop(); }}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* ── Options: what counts in profit ─────────────────────── */}
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
          <span>Items you switch off are still listed under “Not counted in profit”, so the full money flow stays visible. Loans, capital, assets, deposits, money given out to be returned, and money received with “Count this as revenue” unticked never count and have no switch.</span>
        </div>
      </Drawer>

      {/* ── Drill-down ─────────────────────────────────────────── */}
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
                    <td className="pnl-wrap">{t.remark || t.clientName || t.paidTo || t.category || t.source || '—'}{t.person ? <span className="faint"> · {t.person}</span> : null}{t.type === 'Credit' && t.countInProfit === false ? <span className="faint"> · not revenue</span> : null}</td>
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
