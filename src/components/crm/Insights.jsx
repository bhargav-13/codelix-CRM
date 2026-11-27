// CRM insights: IBCS layout (values written on the marks, no gridlines or legends, every chart
// titled with who / what / when), in the app's colours: blue, green for wins, red for losses.
import { useMemo, useState } from 'react';
import { Chips, fmtMoney, fmtDate, todayLocal } from '../ui/kit';
import { IbcsCard, IbcsBars, IbcsPin, IbcsCellBar, IbcsTitle } from '../charts/ibcs';
import { insights } from '../../lib/crm';

const one = n => (n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('en-IN'));
const pct = n => (n == null ? '—' : `${Math.round(n * 100)}%`);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const byCount = list => list.map(r => ({ name: r.name, value: r.count }));

const OUTCOME_TONE = { Connected: 'good', 'Meeting done': 'brand', 'Proposal sent': 'brand', 'No response': 'bad', 'Call back later': 'warn' };

const GROUPS = [
  { value: 'bySource', label: 'Lead source' },
  { value: 'byIndustry', label: 'Industry' },
  { value: 'byProjectType', label: 'Project type' },
];

// One table, three ways to cut it: volume as bars, the win rate as pins
function Groups({ s, when }) {
  const [by, setBy] = useState('bySource');
  const rows = s[by];
  const name = GROUPS.find(g => g.value === by).label;
  const max = Math.max(1, ...rows.map(r => r.leads));
  return (
    <IbcsCard wide what={`Leads and win rate by ${name.toLowerCase()}`} unit="# and %" when={when}
      action={<Chips label="Group by" options={GROUPS} value={by} onChange={setBy} />}>
      {rows.length === 0 ? <p className="ib-empty">No leads yet.</p> : (
        <div className="table-wrap">
          <table className="ib-table">
            <colgroup><col style={{ width: '23%' }} /><col style={{ width: '23%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '19%' }} /><col style={{ width: '11%' }} /></colgroup>
            <thead><tr><th>{name}</th><th>Leads</th><th className="num">Open</th><th className="num">Won</th><th className="num">Lost</th><th>Win rate</th><th className="num">Avg discount</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name}>
                  <td title={r.name}>{r.name}</td>
                  <td><IbcsCellBar value={r.leads} max={max} /></td>
                  <td className="num">{r.leads - r.won - r.lost}</td>
                  <td className="num">{r.won}</td>
                  <td className="num">{r.lost}</td>
                  <td><IbcsPin value={r.winRate} text={r.winRate == null ? 'Open' : undefined} /></td>
                  <td className="num">{r.avgDiscountPct == null ? '—' : `${one(r.avgDiscountPct)}%`}</td>
                </tr>
              ))}
              <tr className="ib-total">
                <td>Total</td>
                <td><IbcsCellBar value={s.total} max={s.total} /></td>
                <td className="num">{s.open}</td><td className="num">{s.won}</td><td className="num">{s.lost}</td>
                <td><IbcsPin value={s.winRate} /></td>
                <td className="num">{s.avgDiscountPct == null ? '—' : `${one(s.avgDiscountPct)}%`}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </IbcsCard>
  );
}

// Each won lead: the proposed price in grey behind the agreed price in dark, and what came off in red
function Deals({ s }) {
  const max = Math.max(1, ...s.deals.map(d => Math.max(d.proposed, d.final)));
  return (
    <IbcsCard wide what="Proposed price, final price and discount by won lead" unit="₹ and %" when="Won leads with both prices, largest first">
      {s.deals.length === 0 ? <p className="ib-empty">No won lead has both a proposed and a final price yet.</p> : (
        <div className="table-wrap">
          <table className="ib-table">
            <colgroup><col style={{ width: '22%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '24%' }} /><col style={{ width: '13%' }} /><col style={{ width: '15%' }} /></colgroup>
            <thead><tr><th>Won lead</th><th className="num">Proposed</th><th className="num">Final</th><th>Final against proposed</th><th className="num">Discount</th><th>Discount %</th></tr></thead>
            <tbody>
              {s.deals.map(d => (
                <tr key={d.id}>
                  <td title={d.name}>{d.name}</td>
                  <td className="num">{fmtMoney(d.proposed)}</td>
                  <td className="num"><strong>{fmtMoney(d.final)}</strong></td>
                  <td>
                    <span className="ib-pair" aria-hidden="true">
                      <span className="is-cmp" style={{ width: `${(d.proposed / max) * 100}%` }} />
                      <span style={{ width: `${(d.final / max) * 100}%` }} />
                    </span>
                  </td>
                  <td className={`num ${d.amount > 0 ? 'ib-bad' : ''}`}>{d.amount === 0 ? '—' : `${d.amount > 0 ? '−' : '+'}${fmtMoney(Math.abs(d.amount))}`}</td>
                  <td><IbcsPin tone="bad" value={Math.max(0, d.pct) / 100} text={`${one(d.pct)}%`} /></td>
                </tr>
              ))}
              <tr className="ib-total">
                <td>Total</td>
                <td className="num">{fmtMoney(s.totalProposed)}</td>
                <td className="num">{fmtMoney(s.totalFinal)}</td>
                <td />
                <td className={`num ${s.totalDiscount > 0 ? 'ib-bad' : ''}`}>{s.totalDiscount === 0 ? '—' : `−${fmtMoney(s.totalDiscount)}`}</td>
                <td><IbcsPin tone="bad" value={s.totalProposed ? Math.max(0, s.totalDiscount / s.totalProposed) : 0} text={s.totalProposed ? `${one((s.totalDiscount / s.totalProposed) * 100)}%` : '—'} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </IbcsCard>
  );
}

export default function Insights({ clients }) {
  const s = useMemo(() => insights(clients), [clients]);
  const when = `All leads, as of ${fmtDate(todayLocal())}`;
  const kpis = [
    { label: 'Avg follow-ups to convert', value: one(s.avgToConvert), sub: s.won ? `Across ${plural(s.won, 'won lead')}` : 'No lead won yet' },
    { label: 'Win rate', value: pct(s.winRate), sub: `${s.won} won · ${s.lost} lost` },
    { label: 'Avg days to win', value: one(s.avgDaysToWin), sub: 'From lead date to won' },
    { label: 'Won value', value: fmtMoney(s.wonValue), sub: `Open pipeline ${fmtMoney(s.openValue)}` },
    { label: 'Avg discount', value: s.avgDiscountPct == null ? '—' : `${one(s.avgDiscountPct)}%`, sub: s.deals.length ? `${fmtMoney(Math.round(s.avgDiscount))} per won lead` : 'No priced win yet' },
    { label: 'Discount given', value: fmtMoney(s.totalDiscount), sub: s.deals.length ? `${s.discounted} of ${plural(s.deals.length, 'won lead')} discounted` : 'No priced win yet' },
    { label: 'Avg follow-ups before lost', value: one(s.avgBeforeLost), sub: s.retry ? `${plural(s.retry, 'lost lead')} to try again` : 'None to try again' },
    { label: 'Follow-ups logged', value: s.totalFollowups.toLocaleString('en-IN'), sub: `Across ${plural(s.total, 'lead')}` },
  ];
  return (
    <>
      <IbcsTitle what="Leads and follow-ups" when={when} />

      <div className="ib-kpis" style={{ '--cols': 4 }}>
        {kpis.map(k => (
          <div key={k.label} className="mac-card ib-kpi">
            <span className="ib-kpi-label">{k.label}</span>
            <span className="ib-kpi-value">{k.value}</span>
            <span className="ib-kpi-sub">{k.sub}</span>
          </div>
        ))}
      </div>

      <div className="ib-grid">
        <IbcsCard what="Leads by status" unit="#" when={when}>
          <IbcsBars share rows={[{ name: 'Draft', value: s.open, tone: 'brand' }, { name: 'Won', value: s.won, tone: 'good' }, { name: 'Lost', value: s.lost, tone: 'bad' }]} />
        </IbcsCard>
        <IbcsCard what="Lead value by status" unit="₹" when={when}>
          <IbcsBars format={fmtMoney} rows={[{ name: 'Draft (proposals)', value: s.openValue, tone: 'brand' }, { name: 'Won (final price)', value: s.wonValue, tone: 'good' }, { name: 'Lost (proposals)', value: s.lostValue, tone: 'bad' }]} />
        </IbcsCard>

        <IbcsCard what="Why we win" unit="# of won leads" when="A lead can have several reasons">
          <IbcsBars share tone="good" rows={byCount(s.wonReasons)} empty="No lead has been marked won yet." />
        </IbcsCard>
        <IbcsCard what="Why we lose" unit="# of lost leads" when={when}>
          <IbcsBars share tone="bad" rows={byCount(s.lostReasons)} empty="No lead has been marked lost yet." />
        </IbcsCard>

        <IbcsCard what="How follow-ups went" unit="# of follow-ups" when={when}>
          <IbcsBars share rows={s.outcomes.map(r => ({ name: r.name, value: r.count, tone: OUTCOME_TONE[r.name] }))} empty="No follow-up has been logged yet." />
        </IbcsCard>
        <IbcsCard what="Follow-ups needed to win" unit="# of won leads" when="By number of follow-ups">
          <IbcsBars tone="good" rows={s.toConvert} empty="No lead has been marked won yet." />
        </IbcsCard>

        <Deals s={s} />

        <Groups s={s} when={when} />
      </div>
    </>
  );
}
