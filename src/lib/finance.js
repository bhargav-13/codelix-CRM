import { rupees } from './money';
// ================================================================
// Codelix OMS — finance engine (pure functions, no React)
//
// • Financial year starts in APRIL (Indian FY): FY 2026-27 = Apr 2026 – Mar 2027
// • P&L is cash-basis, built from the `transactions` table
// • Every non-operating item (partner salary, drawings, splits…) is a line
//   with an include / exclude toggle — nothing is silently hidden
// ================================================================

export const FY_START_MONTH = 3; // 0-based → April
export const GST_RATE = 0.18;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Month keys ('YYYY-MM') ────────────────────────────────────────
export const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
export const parseMonth = k => ({ y: +k.slice(0, 4), m: +k.slice(5, 7) - 1 });
export function addMonths(k, n) {
  const { y, m } = parseMonth(k);
  const t = y * 12 + m + n;
  return monthKey(Math.floor(t / 12), ((t % 12) + 12) % 12);
}
export const monthDiff = (a, b) => { const A = parseMonth(a), B = parseMonth(b); return (B.y - A.y) * 12 + (B.m - A.m); };
export function monthsBetween(start, end) {
  const out = [];
  for (let k = start; k <= end; k = addMonths(k, 1)) out.push(k);
  return out;
}
export const monthLabel = (k, long = false) => {
  const { y, m } = parseMonth(k);
  return long ? `${MONTHS[m]} ${y}` : `${MONTHS[m]} '${String(y).slice(2)}`;
};
export const txMonth = t => (t.date || '').slice(0, 7);
export const currentMonth = (d = new Date()) => monthKey(d.getFullYear(), d.getMonth());

// ── Financial year & quarters ─────────────────────────────────────
export const fyStartYear = k => { const { y, m } = parseMonth(k); return m >= FY_START_MONTH ? y : y - 1; };
export const fyLabel = sy => `FY ${sy}-${String(sy + 1).slice(2)}`;
export const fyStartMonth = sy => monthKey(sy, FY_START_MONTH);
export const fyEndMonth = sy => addMonths(fyStartMonth(sy), 11);
// FY quarter: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar
export const fyQuarter = k => Math.floor(monthDiff(fyStartMonth(fyStartYear(k)), k) / 3) + 1;
export const quarterStart = k => addMonths(fyStartMonth(fyStartYear(k)), (fyQuarter(k) - 1) * 3);
export const quarterLabel = k => `Q${fyQuarter(k)} ${fyLabel(fyStartYear(k)).replace('FY ', '')}`;

// ── Period presets ────────────────────────────────────────────────
export const PERIOD_PRESETS = [
  { id: 'this_month',   label: 'This month' },
  { id: 'last_month',   label: 'Last month' },
  { id: 'this_quarter', label: 'This quarter' },
  { id: 'last_quarter', label: 'Last quarter' },
  { id: 'last_3m',      label: 'Last 3 months' },
  { id: 'last_6m',      label: 'Last 6 months' },
  { id: 'last_12m',     label: 'Last 12 months' },
  { id: 'this_fy',      label: 'This FY (to date)' },
  { id: 'last_fy',      label: 'Last FY' },
  { id: 'all',          label: 'All time' },
  { id: 'custom',       label: 'Custom…' },
];

// "Last N months" = the N most recent COMPLETE months (current month excluded)
export function resolvePeriod(id, { now = currentMonth(), firstMonth, custom } = {}) {
  const fy = fyStartYear(now);
  const qs = quarterStart(now);
  const P = (start, end, label) => ({ id, start, end, label: label || rangeLabel(start, end) });
  switch (id) {
    case 'this_month':   return P(now, now, monthLabel(now, true));
    case 'last_month':   { const k = addMonths(now, -1); return P(k, k, monthLabel(k, true)); }
    case 'this_quarter': return P(qs, addMonths(qs, 2), `${quarterLabel(now)} (to date)`);
    case 'last_quarter': { const s = addMonths(qs, -3); return P(s, addMonths(s, 2), quarterLabel(s)); }
    case 'last_3m':      return P(addMonths(now, -3), addMonths(now, -1));
    case 'last_6m':      return P(addMonths(now, -6), addMonths(now, -1));
    case 'last_12m':     return P(addMonths(now, -12), addMonths(now, -1));
    case 'this_fy':      return P(fyStartMonth(fy), fyEndMonth(fy), `${fyLabel(fy)} (to date)`);
    case 'last_fy':      return P(fyStartMonth(fy - 1), fyEndMonth(fy - 1), fyLabel(fy - 1));
    case 'all':          return P(firstMonth || now, now, 'All time');
    case 'custom': {
      const s = custom?.start || addMonths(now, -5), e = custom?.end || now;
      return s <= e ? P(s, e) : P(e, s);
    }
    default: return P(now, now);
  }
}
export function rangeLabel(s, e) {
  return s === e ? monthLabel(s, true) : `${monthLabel(s, true)} – ${monthLabel(e, true)}`;
}

// Comparison windows. Partial periods (this month / quarter / FY to date)
// compare like-for-like: only the months elapsed so far.
export function effectiveEnd(p, now = currentMonth()) { return p.end > now ? now : p.end; }
export function previousPeriod(p, now) {
  const end = effectiveEnd(p, now);
  const span = monthDiff(p.start, end) + 1;
  return { start: addMonths(p.start, -span), end: addMonths(end, -span), label: 'previous period' };
}
export function samePeriodLastYear(p, now) {
  const end = effectiveEnd(p, now);
  return { start: addMonths(p.start, -12), end: addMonths(end, -12), label: 'same period last year' };
}

// ── Classification ────────────────────────────────────────────────
// Each transaction becomes one P&L line. `toggle` = the option key that
// decides whether the line counts in profit (null = always counts).
export const PL_TOGGLES = [
  { key: 'otherIncome',     label: 'Other income',               hint: 'Other-income entries ticked “Count this as revenue” (interest, misc.). Unticked ones never count', def: true },
  { key: 'partnerSalary',   label: 'Partner salaries',           hint: 'Monthly salary paid to partners', def: true },
  { key: 'partnerPaid',     label: 'Expenses paid by partners',  hint: 'Company bills a partner paid from personal money', def: true },
  { key: 'reimbursements',  label: 'Reimbursements to partners', hint: 'Paying partners back — counting both this and the above double-counts', def: false },
  { key: 'drawings',        label: 'Partner drawings',           hint: 'Money partners took out of the company', def: false },
  { key: 'drawingReturns',  label: 'Drawing returns',            hint: 'Money partners put back', def: false },
  { key: 'partnerSplits',   label: 'Profit splits / dividends',  hint: 'Entries whose remark says partner split / dividend / profit share', def: false },
  { key: 'excludeGst',      label: 'Show revenue without GST',   hint: 'Removes 18% GST from receipts of clients billed "With GST" — that GST belongs to the government. While on, “GST paid” entries are not an expense; while off, they are', def: true, isGst: true },
];
export const DEFAULT_PL_OPTIONS = Object.fromEntries(PL_TOGGLES.map(t => [t.key, t.def]));

const SPLIT_RE = /(partner'?s?\s*(split|divid|share|profit))|(profit\s*(split|share|distribut))|dividend/i;
export const isPartnerSplit = t => SPLIT_RE.test(t.remark || '');

// Balances carried over from the old system (category "Opening balance") are a
// starting position, not this period's income or spending: they stay in the
// ledger and in the bank/partner balances but never enter profit and loss.
export const OPENING_CATEGORY = 'Opening balance';
export const isOpeningEntry = t => t.category === OPENING_CATEGORY;

// Money that moves but is never income or a cost (loans, capital, assets, deposits, transfers,
// salary advances = loans to staff). Always listed under "Not counted in profit"; no switch.
const NEVER_PL = {
  transfer:         'Moves between own accounts',
  loan_received:    'Loans received',
  loan_repaid:      'Loan repayments',
  capital_added:    'Capital put in by partners',
  asset_purchase:   'Equipment / assets bought',
  deposit_paid:     'Deposits paid',
  deposit_returned: 'Deposits returned',
  employee_advance: 'Salary advances (loans to staff)',
  loan_given:       'Money given out, to be returned',
  loan_returned:    'Given money returned',
};
// Follows the "Show revenue without GST" switch instead of having one of its own (see classify)
export const GST_KEPT = 'gstKept';

const NON_CASH_RETURN = 'never:drawing_settled:in';
export function classify(t) {
  const credit = t.type === 'Credit';
  const sub = t.subType;
  if (NEVER_PL[sub]) return { section: credit ? 'income' : 'expense', line: `never:${sub}:${credit ? 'in' : 'out'}`, label: NEVER_PL[sub], toggle: 'never' };
  // Salary settled from an advance: a real salary cost, though no money moved that month.
  if (sub === 'advance_recovery') return { section: 'expense', line: 'employee_salary', label: 'Employee salaries', toggle: null, group: 'Team' };
  // A drawing settled outside the books (account "Partner Personal"): no money came in, so it is
  // listed for the record but changes neither profit nor the money kept.
  if (sub === 'drawing_return' && t.accountType === 'Partner Personal') return { section: 'income', line: NON_CASH_RETURN, label: 'Drawings settled outside (no money moved)', toggle: 'never' };
  if (sub === 'drawing_return') return { section: 'income', line: 'drawing_returns', label: 'Drawing returns', toggle: 'drawingReturns' };
  if (sub === 'drawing')        return { section: 'expense', line: 'drawings', label: 'Partner drawings', toggle: 'drawings' };
  if (sub === 'partner_salary') return { section: 'expense', line: 'partner_salary', label: 'Partner salaries', toggle: 'partnerSalary' };
  if (sub === 'employee_salary')return { section: 'expense', line: 'employee_salary', label: 'Employee salaries', toggle: null, group: 'Team' };
  if (sub === 'personal_exp')   return { section: 'expense', line: 'partner_paid', label: 'Expenses paid by partners', toggle: 'partnerPaid' };
  if (sub === 'reimbursement')  return { section: 'expense', line: 'reimbursements', label: 'Reimbursements to partners', toggle: 'reimbursements' };
  if (!credit && isPartnerSplit(t)) return { section: 'expense', line: 'partner_splits', label: 'Profit splits / dividends', toggle: 'partnerSplits' };
  // GST handed to the government. When revenue is shown without GST the tax was never counted as
  // income, so paying it is not a cost either; when GST is left in revenue, paying it is a cost.
  if (sub === 'gst_paid') return { section: 'expense', line: 'gst_paid', label: 'GST paid to the government', toggle: GST_KEPT };
  // Money received that the entry itself says is not revenue (handed back, refunded…)
  if (credit && t.countInProfit === false) return { section: 'income', line: 'never:not_revenue:in', label: 'Money received, not revenue', toggle: 'never' };
  if (credit) {
    const src = t.source || 'Client Payment';
    if (src === 'Other Income') return { section: 'income', line: 'other_income', label: 'Other income', toggle: 'otherIncome' };
    return { section: 'income', line: `rev:${src}`, label: src === 'Advance' ? 'Client advances' : 'Client payments', toggle: null, revenue: true };
  }
  const cat = t.category || 'Uncategorised';
  return { section: 'expense', line: `cat:${cat}`, label: cat, toggle: null, group: 'Operating' };
}

// Is this line counted in profit under the given options?
export const lineIncluded = (cls, opts) => {
  if (cls.toggle === 'never') return false;
  if (cls.toggle === GST_KEPT) return !opts.excludeGst;
  return !cls.toggle || !!opts[cls.toggle];
};

// Set of lower-cased client names billed "With GST" (from projects)
export function gstClientSet(projects = []) {
  return new Set(projects.filter(p => p.billingType === 'With GST' && p.clientName)
    .map(p => p.clientName.trim().toLowerCase()));
}

// Amount that counts in the P&L for a transaction (GST removed if asked)
function plAmount(t, cls, opts, gstClients) {
  const amt = +t.amount || 0;
  if (cls.revenue && opts.excludeGst && gstClients?.has((t.clientName || '').trim().toLowerCase())) {
    return { amount: amt / (1 + GST_RATE), gst: amt - amt / (1 + GST_RATE) };
  }
  return { amount: amt, gst: 0 };
}

// ── Core aggregation ──────────────────────────────────────────────
// columns: [{ key, label, start, end }] month-key ranges (inclusive)
export function buildStatement(txs, columns, opts = DEFAULT_PL_OPTIONS, { gstClients } = {}) {
  const colOf = new Map();
  columns.forEach((c, i) => monthsBetween(c.start, c.end).forEach(m => colOf.set(m, i)));
  const n = columns.length;
  const zero = () => new Array(n).fill(0);

  const lines = new Map(); // line → { ...cls, values[], txs[][] }
  const gst = zero();
  for (const t of txs) {
    const ci = colOf.get(txMonth(t));
    if (ci === undefined || isOpeningEntry(t)) continue;
    const cls = classify(t);
    if (!lines.has(cls.line)) lines.set(cls.line, { ...cls, values: zero(), txs: columns.map(() => []) });
    const L = lines.get(cls.line);
    const { amount, gst: g } = plAmount(t, cls, opts, gstClients);
    L.values[ci] += amount;
    L.txs[ci].push(t);
    if (lineIncluded(cls, opts)) gst[ci] += g;
  }

  const all = [...lines.values()].map(l => ({ ...l, total: l.values.reduce((a, b) => a + b, 0), included: lineIncluded(l, opts) }));
  const byTotal = (a, b) => b.total - a.total;
  const income   = all.filter(l => l.section === 'income'  && l.included).sort(byTotal);
  const expenses = all.filter(l => l.section === 'expense' && l.included).sort(byTotal);
  const excluded = all.filter(l => !l.included).sort(byTotal);

  const sum = rows => { const v = zero(); rows.forEach(r => r.values.forEach((x, i) => { v[i] += x; })); return v; };
  const revenue  = sum(income);
  const expense  = sum(expenses);
  const profit   = revenue.map((r, i) => r - expense[i]);
  const margin   = revenue.map((r, i) => r > 0 ? profit[i] / r * 100 : null);
  const tot = a => a.reduce((x, y) => x + y, 0);
  const totals = {
    revenue: tot(revenue), expense: tot(expense), profit: tot(profit), gst: tot(gst),
  };
  totals.margin = totals.revenue > 0 ? totals.profit / totals.revenue * 100 : null;

  // Money that left/entered without counting in profit (signed: out = negative)
  // A bill a partner paid from their pocket and its reimbursement are one outflow, not two:
  // the pocket payment moved no company money, and when it is already in profit the
  // reimbursement must not be taken off again.
  const partnerPaidCounted = expenses.some(l => l.line === 'partner_paid');
  const skipInRetained = l => l.line === 'partner_paid' || l.line === NON_CASH_RETURN || (l.line === 'reimbursements' && partnerPaidCounted);
  const excludedNet = zero();
  excluded.filter(l => !skipInRetained(l)).forEach(l => l.values.forEach((x, i) => { excludedNet[i] += l.section === 'income' ? x : -x; }));
  // GST taken out of revenue is still money held until it is paid over (a "GST paid" entry)
  const retained = profit.map((p, i) => p + gst[i] + excludedNet[i]);

  return { columns, income, expenses, excluded, revenue, expense, profit, margin, gst, retained, totals: { ...totals, retained: tot(retained) } };
}

// One-number summary for a month range
export function summarize(txs, start, end, opts, ctx) {
  const s = buildStatement(txs, [{ key: 'x', label: '', start, end }], opts, ctx);
  return {
    revenue: s.totals.revenue, expense: s.totals.expense, profit: s.totals.profit,
    margin: s.totals.margin, gst: s.totals.gst, retained: s.totals.retained,
    months: monthDiff(start, end) + 1, statement: s,
  };
}

// Column sets for the statement table
export function buildColumns(start, end, granularity) {
  if (granularity === 'month') return monthsBetween(start, end).map(k => ({ key: k, label: monthLabel(k), start: k, end: k }));
  const cols = [];
  let k = start;
  while (k <= end) {
    const s = granularity === 'quarter' ? quarterStart(k) : fyStartMonth(fyStartYear(k));
    const e = addMonths(s, granularity === 'quarter' ? 2 : 11);
    const cs = k > s ? k : s, ce = e < end ? e : end;
    cols.push({ key: `${cs}`, label: granularity === 'quarter' ? quarterLabel(cs) : fyLabel(fyStartYear(cs)), start: cs, end: ce, partial: cs !== s || ce !== e });
    k = addMonths(e, 1);
  }
  return cols;
}

// ── Opening position ──────────────────────────────────────────────
// Fixed starting figures carried over from the old system, stored in the `opening_balances`
// setting: { bank, cash, partners: { [name]: { drawing, reimburse } } }. They are not ledger
// entries, so they never show as this month's money in or out and never touch profit.
export const openingPartner = (openBal, name) => ({
  drawing: +openBal?.partners?.[name]?.drawing || 0,       // the partner owes the company
  reimburse: +openBal?.partners?.[name]?.reimburse || 0,   // the company owes the partner
});
export const openingPartnerTotals = openBal => Object.keys(openBal?.partners || {}).reduce((s, name) => {
  const o = openingPartner(openBal, name);
  return { drawing: s.drawing + o.drawing, reimburse: s.reimburse + o.reimburse };
}, { drawing: 0, reimburse: 0 });

// ── Balances (single source of truth for Dashboard + Transactions) ─
export function computeBalances(txs, openBal = { cash: 0, bank: 0 }) {
  let pC = 0, pD = 0, bC = 0, bD = 0;
  txs.forEach(t => {
    if (t.accountType === 'Partner Personal') return; // personal_exp / reimbursement settlements
    if (t.accountType === 'Non-cash') return;         // salary settled from an advance: no money moved
    const isCash = t.accountType === 'Cash + Savings Account' || t.accountType === "Founder's Personal";
    const a = +t.amount || 0;
    if (isCash) { if (t.type === 'Credit') pC += a; else pD += a; }
    else        { if (t.type === 'Credit') bC += a; else bD += a; }
  });
  const cash = (+openBal.cash || 0) + pC - pD;
  const bank = (+openBal.bank || 0) + bC - bD;
  const spent = txs.filter(t => t.subType === 'personal_exp').reduce((s, t) => s + (+t.amount || 0), 0);
  const paid  = txs.filter(t => t.subType === 'reimbursement').reduce((s, t) => s + (+t.amount || 0), 0);
  return {
    cash, personal: cash, bank, total: cash + bank,
    totalCredit: pC + bC, totalDebit: pD + bD,
    pendingReimburse: Math.max(0, openingPartnerTotals(openBal).reimburse + spent - paid),
  };
}

// Standing positions today (all time, not a period): money that is in the bank but not ours to
// spend, and money that is out but coming back.
export function computePositions(txs, gstClients, openBal) {
  let gstCollected = 0, gstPaid = 0, lent = 0, lentBack = 0, drawn = 0, drawnBack = 0;
  for (const t of txs) {
    if (isOpeningEntry(t)) continue;
    const a = +t.amount || 0;
    switch (t.subType) {
      case 'gst_paid':       gstPaid += a; continue;
      case 'loan_given':     lent += a; continue;
      case 'loan_returned':  lentBack += a; continue;
      case 'drawing':        drawn += a; continue;
      case 'drawing_return': drawnBack += a; continue;
      default:
    }
    if (classify(t).revenue && gstClients?.has((t.clientName || '').trim().toLowerCase())) gstCollected += a - a / (1 + GST_RATE);
  }
  return {
    gstCollected, gstPaid, gstHeld: Math.max(0, gstCollected - gstPaid),
    lentOut: Math.max(0, lent - lentBack),
    drawingsOut: Math.max(0, openingPartnerTotals(openBal).drawing + drawn - drawnBack),
  };
}

// Money still to collect on live projects
export function computeReceivables(projects = []) {
  return projects
    .filter(p => p.status !== 'Cancelled')
    .reduce((s, p) => s + Math.max(0, (+p.valuation || 0) - (p.payments || []).reduce((a, x) => a + (+x.amount || 0), 0)), 0);
}

// ── Formatting ────────────────────────────────────────────────────
export const fmtINR = (n, { sign = false } = {}) => {
  const v = Math.round(+n || 0);
  const s = rupees(v, { paise: false });
  if (v < 0) return '−' + s;
  return sign && v > 0 ? '+' + s : s;
};
// Compact: ₹1.2L, ₹3.4 Cr., ₹45K
export const fmtCompact = n => {
  const v = +n || 0, a = Math.abs(v), neg = v < 0 ? '−' : '';
  if (a >= 1e7) return `${neg}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)} Cr.`;
  if (a >= 1e5) return `${neg}₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${neg}₹${(a / 1e3).toFixed(0)}K`;
  return `${neg}₹${Math.round(a)}`;
};
export const pctChange = (cur, prev) => {
  if (prev === 0 || prev == null || !isFinite(prev)) return null;
  return (cur - prev) / Math.abs(prev) * 100;
};
export const fmtPct = (p, digits = 1) => p == null ? '—' : `${p.toFixed(digits)}%`;

// ── Options persistence (per browser; safe if storage is blocked) ─
// v2: the choices now live on the server (lib/plOptions.js); this is only its last-seen copy.
const OPT_KEY = 'codelix.plOptions.v2';
export function loadPlOptions() {
  try { return { ...DEFAULT_PL_OPTIONS, ...(JSON.parse(localStorage.getItem(OPT_KEY)) || {}) }; }
  catch { return { ...DEFAULT_PL_OPTIONS }; }
}
export function savePlOptions(o) { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* storage blocked */ } }

// ── CSV export ────────────────────────────────────────────────────
export function statementToCSV(s, title) {
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  const num = v => Math.round(v);
  const head = ['Line', ...s.columns.map(c => c.label), 'Total'];
  const rows = [[title], [], head];
  const add = (label, values, total) => rows.push([label, ...values.map(num), num(total)]);
  rows.push(['INCOME']);
  s.income.forEach(l => add(`  ${l.label}`, l.values, l.total));
  add('Total income', s.revenue, s.totals.revenue);
  rows.push(['EXPENSES']);
  s.expenses.forEach(l => add(`  ${l.label}`, l.values, l.total));
  add('Total expenses', s.expense, s.totals.expense);
  add('NET PROFIT', s.profit, s.totals.profit);
  rows.push(['Margin %', ...s.margin.map(m => m == null ? '' : m.toFixed(1)), s.totals.margin == null ? '' : s.totals.margin.toFixed(1)]);
  if (s.excluded.length) {
    rows.push([], ['NOT COUNTED IN PROFIT']);
    s.excluded.forEach(l => add(`  ${l.label} (${l.section === 'income' ? 'in' : 'out'})`, l.values, l.total));
    add('Money kept after all items', s.retained, s.totals.retained);
  }
  return rows.map(r => r.map(esc).join(',')).join('\n');
}
