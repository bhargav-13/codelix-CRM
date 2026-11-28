// Website analytics: how codelixitsolutions.com does in Google Search, read from Search Console
// by the server (partners only). Totals against the period before, the trend, top searches and
// pages, ideas for what to improve, countries, devices, sitemaps and a page check.
import { useState, useEffect, useMemo, useCallback } from 'react';
import Header from '../components/layout/Header';
import Kpis from '../components/crm/Kpis';
import { IbcsCard, IbcsBars } from '../components/charts/ibcs';
import { TabBar } from '../components/hr/parts';
import { Toolbar, SkeletonRows, EmptyPanel, ErrorPanel, useToast } from '../components/ui/kit';
import Badge from '../components/ui/Badge';
import { http, query } from '../lib/http';
import { MousePointerClick, Eye, Percent, ListOrdered, RefreshCw, Globe, Search, ExternalLink, SearchX, TrendingUp, TrendingDown } from 'lucide-react';
import './Website.css';

const PERIODS = [[7, '7 days'], [28, '28 days'], [90, '3 months'], [180, '6 months'], [365, '12 months'], [480, '16 months']];
const METRICS = {
  clicks: { label: 'Clicks', fmt: n => num(n), better: 'up' },
  impressions: { label: 'Impressions', fmt: n => num(n), better: 'up' },
  ctr: { label: 'CTR', fmt: n => `${(+n || 0).toFixed(2)}%`, better: 'up' },
  position: { label: 'Average position', fmt: n => (+n || 0).toFixed(1), better: 'down' },
};
const num = n => Math.round(+n || 0).toLocaleString('en-IN');
const day = iso => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const dayYear = iso => (iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const pathOf = url => { try { const u = new URL(url); return (u.pathname + u.search) || '/'; } catch { return url; } };

// "+12% vs before" in the right colour: for position, lower is better.
function delta(now, before, metric) {
  const a = +now || 0, b = +before || 0;
  if (!b) return { text: a ? 'New this period' : 'No data before', tone: '' };
  const pct = ((a - b) / b) * 100;
  const good = METRICS[metric].better === 'up' ? pct > 0 : pct < 0;
  const flat = Math.abs(pct) < 0.5;
  const diff = metric === 'position' ? `${a - b > 0 ? '+' : ''}${(a - b).toFixed(1)}` : `${pct > 0 ? '+' : ''}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`;
  return { text: `${diff} vs the ${'period'} before (${METRICS[metric].fmt(b)})`, tone: flat ? '' : good ? 'good' : 'bad' };
}

// ── the trend: this period as a line, the period before as a thin dashed line ──
function Trend({ rows, before, metric }) {
  const [hover, setHover] = useState(null);
  const W = 1000, H = 240, L = 46, R = 12, T = 12, B = 26;
  const vals = rows.map(r => +r[metric] || 0), prev = before.map(r => +r[metric] || 0);
  const flip = metric === 'position';                       // position 1 is the top
  const hi = Math.max(1, ...vals, ...prev), lo = flip ? Math.max(0, Math.min(...vals.filter(Boolean), ...prev.filter(Boolean), hi) - 2) : 0;
  const x = i => L + (rows.length > 1 ? (i / (rows.length - 1)) * (W - L - R) : (W - L - R) / 2);
  const y = v => { const t = (v - lo) / Math.max(1e-9, hi - lo); return flip ? T + t * (H - T - B) : H - B - t * (H - T - B); };
  const line = list => list.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, 0.5, 1].map(t => lo + t * (hi - lo));
  const step = Math.max(1, Math.ceil(rows.length / 8));
  if (!rows.length) return <p className="ib-empty">Google has no data for this period yet.</p>;
  return (
    <div className="web-trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${METRICS[metric].label} by day`} onMouseLeave={() => setHover(null)}
        onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(rows.length - 1, Math.round(((px - L) / (W - L - R)) * (rows.length - 1))))); }}>
        {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="web-grid" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="web-axis">{metric === 'ctr' ? `${t.toFixed(1)}%` : metric === 'position' ? t.toFixed(0) : num(t)}</text></g>)}
        {rows.map((r, i) => (i % step === 0 ? <text key={r.key} x={x(i)} y={H - 6} textAnchor="middle" className="web-axis">{day(r.key)}</text> : null))}
        {prev.length > 1 && <path d={line(prev.slice(0, rows.length))} className="web-line prev" />}
        <path d={line(vals)} className="web-line" />
        {hover != null && <g><line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="web-cursor" /><circle cx={x(hover)} cy={y(vals[hover])} r="5" className="web-dot" /></g>}
      </svg>
      <div className="web-trend-foot">
        <span><i className="now" /> This period</span><span><i className="prev" /> The period before</span>
        {hover != null && <strong>{day(rows[hover].key)}: {METRICS[metric].fmt(vals[hover])}{before[hover] ? ` (before: ${METRICS[metric].fmt(prev[hover])})` : ''}</strong>}
      </div>
    </div>
  );
}

// ── a sortable table of searches or pages ──
function Table({ rows, first, link, change }) {
  const [sort, setSort] = useState({ k: 'clicks', dir: -1 });
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(25);
  const list = useMemo(() => rows.filter(r => !q || String(r.key).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort.k === 'key' ? String(a.key).localeCompare(String(b.key)) : (+a[sort.k] || 0) - (+b[sort.k] || 0)) * sort.dir), [rows, q, sort]);
  const th = (k, label, cls = 'num') => (
    <th className={cls} aria-sort={sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="web-th" onClick={() => setSort(s => ({ k, dir: s.k === k ? -s.dir : k === 'key' || k === 'position' ? 1 : -1 }))}>{label}{sort.k === k ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</button>
    </th>
  );
  return (
    <>
      <Toolbar search={q} onSearch={setQ} placeholder={`Filter ${first.toLowerCase()}`} right={<span>{list.length} of {rows.length}</span>} />
      {list.length === 0 ? <EmptyPanel icon={SearchX} title="Nothing matches" text="Clear the filter to see everything." /> : (
        <div className="mac-card"><div className="table-wrap">
          <table className="data-table web-table">
            <thead><tr>{th('key', first, '')}{th('clicks', 'Clicks')}{change && <th className="num">Change</th>}{th('impressions', 'Impressions')}{th('ctr', 'CTR')}{th('position', 'Position')}</tr></thead>
            <tbody>
              {list.slice(0, limit).map(r => (
                <tr key={r.key}>
                  <td className="web-key">{link ? <a href={r.key} target="_blank" rel="noreferrer" title={r.key}>{pathOf(r.key)} <ExternalLink size={12} aria-hidden="true" /></a> : <span title={r.key}>{r.key}</span>}</td>
                  <td className="num"><strong>{num(r.clicks)}</strong></td>
                  {change && <td className="num">{r.was == null ? <Badge color="blue">New</Badge> : r.clicks === r.was ? '—' : <span className={r.clicks > r.was ? 'amount-in' : 'amount-out'}>{r.clicks > r.was ? '+' : ''}{r.clicks - r.was}</span>}</td>}
                  <td className="num">{num(r.impressions)}</td>
                  <td className="num">{(+r.ctr).toFixed(2)}%</td>
                  <td className="num">{(+r.position).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
      {list.length > limit && <button type="button" className="mac-btn mac-btn-ghost" onClick={() => setLimit(l => l + 50)}>Show more</button>}
    </>
  );
}

function Ideas({ title, text, rows, value, empty }) {
  return (
    <section className="mac-card web-idea">
      <h3 className="section-title">{title} <span className="crm-count">{rows.length}</span></h3>
      <p className="web-note">{text}</p>
      {rows.length === 0 ? <p className="ib-empty">{empty}</p> : (
        <ul className="web-idea-list">
          {rows.slice(0, 8).map(r => <li key={r.key}><span title={r.key}>{r.key}</span><em>{value(r)}</em></li>)}
        </ul>
      )}
    </section>
  );
}

function PageCheck() {
  const toast = useToast();
  const [url, setUrl] = useState('https://www.codelixitsolutions.com/');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  async function check(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setRes(null);
    try { setRes(await http.get(`/website/inspect${query({ url: url.trim() })}`)); }
    catch (err) { toast.error('Could not check this page', err); }
    setBusy(false);
  }
  const ix = res?.result?.indexStatusResult || {}, mob = res?.result?.mobileUsabilityResult, rich = res?.result?.richResultsResult;
  const ok = ix.verdict === 'PASS';
  return (
    <section className="mac-card web-check">
      <h3 className="section-title">Check a page</h3>
      <p className="web-note">Ask Google how it sees one page of the website: whether it is in the index, when it was last read, and which address Google treats as the main one.</p>
      <form onSubmit={check} className="web-check-form">
        <input className="mac-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.codelixitsolutions.com/…" aria-label="Page address" />
        <button className="mac-btn mac-btn-primary" disabled={busy || !url.trim()}><Search size={15} /> {busy ? 'Checking…' : 'Check'}</button>
      </form>
      {res && (
        <dl className="kv web-check-result">
          <dt>In Google</dt><dd><Badge color={ok ? 'green' : ix.verdict === 'NEUTRAL' ? 'orange' : 'red'}>{ok ? 'Yes, indexed' : ix.verdict === 'NEUTRAL' ? 'Not indexed' : ix.verdict ? 'Problem' : 'Unknown'}</Badge></dd>
          <dt>Status</dt><dd>{ix.coverageState || '—'}</dd>
          <dt>Last read by Google</dt><dd>{ix.lastCrawlTime ? new Date(ix.lastCrawlTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never'}</dd>
          <dt>Read as</dt><dd>{ix.crawledAs === 'MOBILE' ? 'Mobile phone' : ix.crawledAs === 'DESKTOP' ? 'Desktop' : '—'}</dd>
          <dt>Fetch</dt><dd>{ix.pageFetchState === 'SUCCESSFUL' ? 'Successful' : ix.pageFetchState || '—'}</dd>
          <dt>Allowed by robots.txt</dt><dd>{ix.robotsTxtState === 'ALLOWED' ? 'Yes' : ix.robotsTxtState === 'DISALLOWED' ? 'No, blocked' : '—'}</dd>
          <dt>Main address (Google)</dt><dd className="web-break">{ix.googleCanonical || '—'}</dd>
          <dt>Main address (ours)</dt><dd className="web-break">{ix.userCanonical || '—'}</dd>
          <dt>Found in sitemaps</dt><dd>{(ix.sitemap || []).length ? ix.sitemap.map(pathOf).join(', ') : 'None'}</dd>
          {mob && <><dt>Mobile friendly</dt><dd>{mob.verdict === 'PASS' ? 'Yes' : mob.verdict === 'VERDICT_UNSPECIFIED' ? '—' : 'Has issues'}</dd></>}
          {rich && <><dt>Rich results</dt><dd>{(rich.detectedItems || []).map(i => i.richResultType).join(', ') || (rich.verdict === 'PASS' ? 'Valid' : '—')}</dd></>}
          {res.result?.inspectionResultLink && <><dt>Full report</dt><dd><a className="crm-link" href={res.result.inspectionResultLink} target="_blank" rel="noreferrer">Open in Search Console <ExternalLink size={12} /></a></dd></>}
        </dl>
      )}
    </section>
  );
}

export default function Website() {
  const [days, setDays] = useState(28);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metric, setMetric] = useState('clicks');
  const [tab, setTab] = useState('searches');

  const load = useCallback(async fresh => {
    setLoading(true); setError(null);
    try { setData(await http.get(`/website/analytics${query({ days, fresh: fresh || undefined })}`)); }
    catch (e) { console.error(e); setError(e); }
    setLoading(false);
  }, [days]);
  useEffect(() => { load(false); }, [load]);

  const d = data?.configured ? data : null;
  const queries = useMemo(() => {
    const before = new Map((d?.previousQueries || []).map(r => [r.key, r.clicks]));
    return (d?.queries || []).map(r => ({ ...r, was: before.has(r.key) ? before.get(r.key) : null }));
  }, [d]);
  const ideas = useMemo(() => {
    const q = queries;
    const brand = q.filter(r => /codelix/i.test(r.key));
    const brandClicks = brand.reduce((s, r) => s + r.clicks, 0), all = q.reduce((s, r) => s + r.clicks, 0);
    return {
      almost: q.filter(r => r.position > 10 && r.position <= 20 && r.impressions >= 10).sort((a, b) => b.impressions - a.impressions),
      lowCtr: q.filter(r => r.position <= 10 && r.impressions >= 20 && r.ctr < 3).sort((a, b) => b.impressions - a.impressions),
      rising: q.filter(r => r.was != null && r.clicks > r.was).sort((a, b) => (b.clicks - b.was) - (a.clicks - a.was)),
      falling: [...(d?.previousQueries || [])].map(p => ({ ...p, now: q.find(r => r.key === p.key)?.clicks || 0 })).filter(p => p.clicks > p.now).sort((a, b) => (b.clicks - b.now) - (a.clicks - a.now)),
      pagesLowCtr: (d?.pages || []).filter(r => r.impressions >= 100 && r.ctr < 1).sort((a, b) => b.impressions - a.impressions),
      brandClicks, otherClicks: Math.max(0, all - brandClicks),
    };
  }, [queries, d]);

  const when = d ? `${dayYear(d.from)} – ${dayYear(d.to)}` : '';
  const kpi = (m, icon) => { const x = delta(d.totals[m], d.previous[m], m); return { label: METRICS[m].label, value: METRICS[m].fmt(d.totals[m]), icon, sub: x.text, tone: m === metric ? 'brand' : undefined, valueTone: x.tone === 'good' ? 'in' : x.tone === 'bad' ? 'out' : undefined, active: m === metric, onClick: () => setMetric(m) }; };

  return (
    <div>
      <Header title="Website" subtitle={d ? `${String(d.site).replace('sc-domain:', '')} in Google Search · ${when}` : 'How the website does in Google Search'}
        actions={<>
          <select className="mac-select" aria-label="Period" value={days} onChange={e => setDays(+e.target.value)}>{PERIODS.map(([v, l]) => <option key={v} value={v}>Last {l}</option>)}</select>
          <button className="mac-btn mac-btn-secondary" onClick={() => load(true)} disabled={loading}><RefreshCw size={15} /> Refresh</button>
        </>} />
      <div className="page-body">
        {loading && !data ? <SkeletonRows rows={8} /> : error ? <ErrorPanel title="Could not load the website numbers" error={error} onRetry={() => load(false)} /> : !d ? (
          <EmptyPanel icon={Globe} title="Website analytics is not set up yet"
            text="The server needs the Google Search Console service-account key (GSC_KEY_B64) in its settings. Once it is added and the server is redeployed, this page fills in by itself." />
        ) : (
          <>
            <Kpis cols={4} items={[kpi('clicks', MousePointerClick), kpi('impressions', Eye), kpi('ctr', Percent), kpi('position', ListOrdered)]} />

            <IbcsCard wide who={String(d.site).replace('sc-domain:', '')} what={`${METRICS[metric].label} by day`} when={when}
              action={<div className="web-metrics" role="group" aria-label="What to chart">{Object.entries(METRICS).map(([k, m]) => <button key={k} type="button" className={k === metric ? 'on' : ''} aria-pressed={k === metric} onClick={() => setMetric(k)}>{m.label}</button>)}</div>}>
              <Trend rows={d.byDate || []} before={d.previousByDate || []} metric={metric} />
            </IbcsCard>

            <TabBar label="Website sections" value={tab} onChange={setTab} tabs={[['searches', `Searches (${queries.length})`], ['pages', `Pages (${(d.pages || []).length})`], ['ideas', 'What to improve'], ['where', 'Countries and devices'], ['sitemaps', 'Sitemaps'], ['check', 'Check a page']]} />

            {tab === 'searches' && <Table rows={queries} first="Search" change />}
            {tab === 'pages' && <Table rows={d.pages || []} first="Page" link />}

            {tab === 'ideas' && (
              <div className="web-grid2">
                <Ideas title="Almost on page one" text="Searches where the site sits at position 11 to 20. A better title, more content or a few links can move these onto the first page." rows={ideas.almost}
                  value={r => `position ${r.position.toFixed(1)} · ${num(r.impressions)} views`} empty="No search is waiting just off page one." />
                <Ideas title="Seen but not clicked" text="On page one, shown often, yet under 3% click. The title and description shown in Google are worth rewriting." rows={ideas.lowCtr}
                  value={r => `${r.ctr.toFixed(1)}% of ${num(r.impressions)} views`} empty="Every page-one search is getting its clicks." />
                <Ideas title="Pages shown a lot, clicked little" text="Pages with 100+ views and under 1% click. Check that the page answers what people searched for." rows={ideas.pagesLowCtr.map(r => ({ ...r, key: pathOf(r.key) }))}
                  value={r => `${r.ctr.toFixed(2)}% of ${num(r.impressions)} views`} empty="No page stands out." />
                <section className="mac-card web-idea">
                  <h3 className="section-title"><TrendingUp size={15} /> Rising and <TrendingDown size={15} /> falling</h3>
                  <p className="web-note">Clicks compared with the period before.</p>
                  <ul className="web-idea-list">
                    {ideas.rising.slice(0, 4).map(r => <li key={`u${r.key}`}><span title={r.key}>{r.key}</span><em className="amount-in">+{r.clicks - r.was} clicks</em></li>)}
                    {ideas.falling.slice(0, 4).map(r => <li key={`d${r.key}`}><span title={r.key}>{r.key}</span><em className="amount-out">−{r.clicks - r.now} clicks</em></li>)}
                    {!ideas.rising.length && !ideas.falling.length && <li><span>No search moved.</span></li>}
                  </ul>
                </section>
                <IbcsCard who="Top 100 searches" what="Clicks by kind of search" when={when}>
                  <IbcsBars share rows={[{ name: 'Searches for “Codelix” (people who know us)', value: ideas.brandClicks, tone: 'brand' }, { name: 'Other searches (new people)', value: ideas.otherClicks, tone: 'good' }]} />
                </IbcsCard>
              </div>
            )}

            {tab === 'where' && (
              <div className="web-grid2">
                <IbcsCard who="Google Search" what="Clicks by country" when={when}><IbcsBars rows={(d.countries || []).filter(c => c.clicks > 0).slice(0, 10).map(c => ({ name: c.name, value: c.clicks }))} empty="No clicks yet." /></IbcsCard>
                <IbcsCard who="Google Search" what="Views by country" when={when}><IbcsBars tone="warn" rows={(d.countries || []).slice(0, 10).map(c => ({ name: c.name, value: c.impressions }))} /></IbcsCard>
                <IbcsCard who="Google Search" what="Clicks by device" when={when}><IbcsBars share rows={(d.devices || []).map(c => ({ name: c.key[0] + c.key.slice(1).toLowerCase(), value: c.clicks }))} /></IbcsCard>
                <IbcsCard who="Google Search" what="Average position by device" when={when}><IbcsBars tone="warn" format={v => v.toFixed(1)} rows={(d.devices || []).map(c => ({ name: c.key[0] + c.key.slice(1).toLowerCase(), value: c.position }))} /></IbcsCard>
                {(d.appearance || []).length > 0 && <IbcsCard who="Google Search" what="Clicks by search feature" when={when}><IbcsBars rows={d.appearance.map(c => ({ name: c.key.replace(/_/g, ' ').toLowerCase(), value: c.clicks }))} /></IbcsCard>}
              </div>
            )}

            {tab === 'sitemaps' && ((d.sitemaps || []).length === 0 ? <EmptyPanel icon={Globe} title="No sitemap submitted" text="Submit the sitemap in Google Search Console so Google finds every page." /> : (
              <div className="mac-card"><div className="table-wrap">
                <table className="data-table web-table">
                  <thead><tr><th>Sitemap</th><th className="num">Pages listed</th><th>Status</th><th>Submitted</th><th>Last read by Google</th></tr></thead>
                  <tbody>{d.sitemaps.map(s => (
                    <tr key={s.path}>
                      <td className="web-key"><a href={s.path} target="_blank" rel="noreferrer">{pathOf(s.path)} <ExternalLink size={12} aria-hidden="true" /></a></td>
                      <td className="num">{num(s.submitted)}</td>
                      <td><Badge color={s.errors ? 'red' : s.warnings ? 'orange' : s.pending ? 'gray' : 'green'}>{s.errors ? `${s.errors} error${s.errors === 1 ? '' : 's'}` : s.warnings ? `${s.warnings} warning${s.warnings === 1 ? '' : 's'}` : s.pending ? 'Waiting' : 'OK'}</Badge></td>
                      <td>{dayYear(s.lastSubmitted)}</td><td>{dayYear(s.lastDownloaded)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div></div>
            ))}

            {tab === 'check' && <PageCheck />}

            <p className="web-note">From Google Search Console. Google's numbers run about two days behind, so the period ends on {dayYear(d.to)}. Refreshed {new Date(d.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}; kept for 15 minutes.</p>
          </>
        )}
      </div>
    </div>
  );
}
