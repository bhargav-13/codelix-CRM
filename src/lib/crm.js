// CRM lead rules shared by the CRM page and its insights: who is due, what a loss means for the
// next follow-up, and the numbers worked out from the whole list.

export const WON = 'Won';
export const LOST = 'Lost';
export const DRAFT = 'Draft';

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Local-calendar date maths (YYYY-MM-DD in, YYYY-MM-DD out)
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
// 31 Jan + 1 month → 28/29 Feb, the way the server counts it
export function addMonths(day, n) {
  const d = new Date(`${day}T00:00:00`);
  const date = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(date, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return ymd(d);
}
export const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000);

// What the server does when a lead is marked lost (ClientService.followupAfterLoss).
// → { date, text }: date is '' when no follow-up is planned
export function lossFollowup(reason, today) {
  if (reason === 'Higher quotation value') return { date: addMonths(today, 3), text: 'We will try again in 3 months' };
  if (reason === 'Ghost') return { date: addMonths(today, 1), text: 'We will try again in 1 month' };
  if (['Trust issues', 'Communication error', 'Unknown'].includes(reason)) return { date: '', text: 'No more follow-ups for this lead' };
  return { date: '', text: 'No follow-up is set. You can add one yourself later.' };
}

export const isOpen = c => c.status !== WON && c.status !== LOST;
// A won lead needs no chasing; a lost one may still have a "try again" date.
export const hasDue = c => c.status !== WON && !!c.nextFollowup;
export const isOverdue = (c, today) => hasDue(c) && c.nextFollowup < today;
export const isDueToday = (c, today) => hasDue(c) && c.nextFollowup === today;
// What was taken off the proposed price: { amount, pct } or null when either price is missing
export function discountOf(c) {
  const proposed = Number(c.proposalValue) || 0;
  const final = Number(c.finalPrice) || 0;
  if (!(proposed > 0) || !(final > 0)) return null;
  const amount = Math.round((proposed - final) * 100) / 100;
  return { amount, pct: (amount / proposed) * 100, proposed, final };
}
export const followupCount = c => (c.followupHistory || []).length;

// Oldest first, each with its number: the first contact is #1.
export function numberedFollowups(c) {
  return [...(c.followupHistory || [])]
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.at || '').localeCompare(String(b.at || '')))
    .map((h, i) => ({ ...h, no: i + 1 }));
}

const avg = list => (list.length ? list.reduce((s, n) => s + n, 0) / list.length : null);
const tally = (map, key) => { if (key) map[key] = (map[key] || 0) + 1; };
const sorted = map => Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

function grouped(clients, key) {
  const map = {};
  clients.forEach(c => {
    const name = c[key] || 'Not set';
    const g = (map[name] ||= { name, leads: 0, won: 0, lost: 0 });
    g.leads += 1;
    if (c.status === WON) {
      g.won += 1;
      const d = discountOf(c);
      if (d) { g.deals = (g.deals || 0) + 1; g.discountPct = (g.discountPct || 0) + d.pct; }
    }
    if (c.status === LOST) g.lost += 1;
  });
  return Object.values(map)
    .map(g => ({ ...g, winRate: g.won + g.lost ? g.won / (g.won + g.lost) : null, avgDiscountPct: g.deals ? g.discountPct / g.deals : null }))
    .sort((a, b) => b.leads - a.leads);
}

export function insights(clients) {
  const won = clients.filter(c => c.status === WON);
  const lost = clients.filter(c => c.status === LOST);
  const open = clients.filter(isOpen);
  const lostReasons = {};
  const wonReasons = {};
  const outcomes = {};
  lost.forEach(c => tally(lostReasons, c.lostReason || 'Unknown'));
  won.forEach(c => (c.wonReasons || []).forEach(r => tally(wonReasons, r)));
  clients.forEach(c => (c.followupHistory || []).forEach(h => tally(outcomes, h.status || 'No status')));
  const money = c => Number(c.finalPrice) || Number(c.proposalValue) || 0;
  // Won leads with both prices, biggest first: what was proposed, what was agreed, what came off
  const deals = won.map(c => ({ c, d: discountOf(c) })).filter(x => x.d)
    .map(({ c, d }) => ({ id: c.id, name: c.companyName || c.clientName, ...d }))
    .sort((a, b) => b.proposed - a.proposed);
  // How many won leads needed 1, 2, 3 … follow-ups (kept in that order, not by size)
  const steps = {};
  won.forEach(c => { const n = followupCount(c); steps[n] = (steps[n] || 0) + 1; });
  const toConvert = Object.keys(steps).map(Number).sort((a, b) => a - b)
    .map(n => ({ name: `${n} follow-up${n === 1 ? '' : 's'}`, value: steps[n] }));
  return {
    total: clients.length,
    open: open.length,
    won: won.length,
    lost: lost.length,
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
    avgToConvert: avg(won.map(followupCount)),
    avgBeforeLost: avg(lost.map(followupCount)),
    avgDaysToWin: avg(won.filter(c => c.createdDate && c.closedDate).map(c => Math.max(0, daysBetween(c.createdDate, c.closedDate)))),
    totalFollowups: clients.reduce((s, c) => s + followupCount(c), 0),
    wonValue: won.reduce((s, c) => s + money(c), 0),
    lostValue: lost.reduce((s, c) => s + (Number(c.proposalValue) || 0), 0),
    openValue: open.reduce((s, c) => s + (Number(c.proposalValue) || 0), 0),
    retry: lost.filter(c => c.nextFollowup).length,
    deals,
    avgDiscount: avg(deals.map(d => d.amount)),
    avgDiscountPct: avg(deals.map(d => d.pct)),
    totalDiscount: deals.reduce((sum, d) => sum + d.amount, 0),
    totalProposed: deals.reduce((sum, d) => sum + d.proposed, 0),
    totalFinal: deals.reduce((sum, d) => sum + d.final, 0),
    discounted: deals.filter(d => d.amount > 0).length,
    toConvert,
    lostReasons: sorted(lostReasons),
    wonReasons: sorted(wonReasons),
    outcomes: sorted(outcomes),
    bySource: grouped(clients, 'source'),
    byIndustry: grouped(clients, 'industry'),
    byProjectType: grouped(clients, 'projectType'),
  };
}
