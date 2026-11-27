// The Scope of Work document as real A4 pages: one cover and as many inner pages as the content needs.
//
// The content is cut into small blocks (a heading, a paragraph, one table row…). Every block is
// measured in a hidden copy, then the blocks are packed into pages, so nothing is ever cut in half
// and a table that runs on to the next page gets its heading row again.
import { useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react';
import codelixLogo from '../../assets/codelix.svg';
import { PAGE_W, PAGE_H, BODY_H, FONTS, themeOf, palette, totals, money, longDate } from '../../lib/sow';
import './SowDocument.css';

const lines = s => String(s || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
const filled = list => (list || []).map(x => String(x || '').trim()).filter(Boolean);
const two = n => String(n).padStart(2, '0');

// → [{ key, node, keep (stay with the next block), head (index of the table heading this row belongs to) }]
function buildBlocks(d) {
  const out = [];
  let section = 0;
  const add = (key, node, opts) => out.push({ key, node, ...opts });
  const h2 = title => {
    section += 1;
    add(`h-${section}`, <h2 className="b-h2"><span className="b-h2-n">{two(section)}</span><span className="b-h2-t">{title}</span></h2>, { keep: true });
  };
  const table = (id, cols, widths, rows) => {
    const tpl = { gridTemplateColumns: widths };
    const head = out.length;
    add(`${id}-th`, <div className="b-th" style={tpl}>{cols.map(c => <span key={c}>{c}</span>)}</div>, { keep: true });
    rows.forEach((cells, i) => add(`${id}-${i}`,
      <div className={`b-tr ${i % 2 ? 'odd' : ''} ${i === rows.length - 1 ? 'last' : ''}`} style={tpl}>{cells.map((c, j) => <span key={j}>{c}</span>)}</div>, { head }));
  };
  const bullets = (id, items) => items.forEach((t, i) => add(`${id}-${i}`, <div className="b-li"><i /><span>{t}</span></div>));

  const p = d.project, t = totals(d.pricing);
  const scope = (d.scope || []).filter(s => (s.title || '').trim() || (s.text || '').trim());
  const deliverables = (d.deliverables || []).filter(x => (x.name || '').trim());
  const timeline = (d.timeline || []).filter(x => (x.phase || '').trim());
  const schedule = (d.pricing.schedule || []).filter(x => (x.label || '').trim());
  const objectives = filled(p.objectives), tech = filled(d.tech), assumptions = filled(d.assumptions), exclusions = filled(d.exclusions);
  const terms = (d.terms || []).filter(x => (x.title || '').trim() || (x.text || '').trim());

  if (d.show.cards) {
    const cards = [
      ['Project value', t.base ? money(t.grand) : '—', t.base ? (t.gst ? `incl. ${d.pricing.gstRate}% GST` : 'GST not applicable') : 'to be confirmed'],
      ['Duration', p.duration || '—', p.startDate ? `from ${longDate(p.startDate)}` : 'from the start date'],
      ['Deliverables', String(deliverables.length), deliverables.length === 1 ? 'item' : 'items'],
      ['Payment stages', String(schedule.length), schedule.length === 1 ? 'stage' : 'stages'],
    ];
    add('cards', <div className="b-cards">{cards.map(([k, v, s]) => <div key={k} className="b-card"><span>{k}</span><b>{v}</b><em>{s}</em></div>)}</div>);
  }

  h2('Project overview');
  lines(p.overview).forEach((x, i) => add(`ov-${i}`, <p className="b-p">{x}</p>));
  if (d.show.objectives && objectives.length) {
    add('obj-h', <h3 className="b-h3">Objectives</h3>, { keep: true });
    bullets('obj', objectives);
  }

  if (scope.length) {
    h2('Scope of work');
    scope.forEach((s, i) => add(`sc-${i}`,
      <div className="b-item"><span className="b-item-n">{i + 1}</span><div><b>{s.title}</b>{lines(s.text).map((x, j) => <p key={j}>{x}</p>)}</div></div>));
  }

  if (deliverables.length) {
    h2('Deliverables');
    table('dl', ['#', 'Deliverable', 'What it includes', 'Accepted when'], '34px 1.1fr 1.3fr 1.1fr',
      deliverables.map((x, i) => [two(i + 1), <b key="b">{x.name}</b>, x.detail, x.acceptance]));
  }

  if (timeline.length) {
    h2('Timeline');
    if (p.duration || p.startDate) {
      add('tl-note', <p className="b-p">{[p.duration && `Total duration: ${p.duration}.`, p.startDate && `Planned start: ${longDate(p.startDate)}.`,
        'Dates move by the same number of days as any delay in approvals, content or payments.'].filter(Boolean).join(' ')}</p>, { keep: true });
    }
    table('tl', ['Phase', 'When', 'Output'], '1.3fr 0.8fr 1.3fr', timeline.map(x => [<b key="b">{x.phase}</b>, x.duration, x.output]));
  }

  if (d.show.tech && tech.length) {
    h2('Technology');
    add('tech', <div className="b-chips">{tech.map(x => <span key={x}>{x}</span>)}</div>);
  }

  h2('Commercials');
  add('total', (
    <div className="b-total">
      <div><span>Project value</span><b>{t.base ? money(t.base) : 'To be confirmed'}</b></div>
      {d.pricing.gst && <div><span>GST ({d.pricing.gstRate}%)</span><b>{t.base ? money(t.gst) : '—'}</b></div>}
      <div className="grand"><span>Total payable</span><b>{t.base ? money(t.grand) : '—'}</b></div>
    </div>
  ));
  if (schedule.length) {
    add('pay-h', <h3 className="b-h3">Payment schedule</h3>, { keep: true });
    table('pay', ['Stage', 'Share', 'Amount', 'Due'], '1.4fr 0.5fr 0.8fr 1fr',
      schedule.map(x => [<b key="b">{x.label}</b>, `${+x.percent || 0}%`, t.base ? money(t.part(x.percent)) : '—', x.when]));
    add('pay-note', <p className="b-note">{d.pricing.gst ? `Amounts are before GST. GST at ${d.pricing.gstRate}% is added to every invoice.` : 'GST is not applicable to these amounts.'}</p>);
  }

  if (d.show.assumptions && assumptions.length) { h2('Assumptions'); bullets('as', assumptions); }
  if (d.show.exclusions && exclusions.length) { h2('Not included'); bullets('ex', exclusions); }

  if (d.show.terms && terms.length) {
    h2('Terms');
    terms.forEach((x, i) => add(`tm-${i}`, <div className="b-term"><b>{x.title}</b>{lines(x.text).map((y, j) => <p key={j}>{y}</p>)}</div>));
  }

  if (d.show.sign) {
    h2('Acceptance');
    add('sign-p', <p className="b-p">By signing below, both parties agree to the scope, timeline and commercials described in this document.</p>, { keep: true });
    add('sign', (
      <div className="b-sign">
        <div><i /><b>{d.client.contact || d.client.name || 'Client'}</b><span>{[d.client.designation, d.client.contact ? d.client.name : ''].filter(Boolean).join(', ') || 'For the client'}</span><em>Date:</em></div>
        <div><i /><b>{d.company.signatory || d.company.name}</b><span>{[d.company.signatoryTitle, d.company.signatory ? d.company.name : ''].filter(Boolean).join(', ') || 'For the company'}</span><em>Date:</em></div>
      </div>
    ));
  }
  return out;
}

// Heights → pages (lists of block indexes). A heading never sits alone at the foot of a page.
function pack(blocks, heights) {
  const pages = [[]];
  let used = 0;
  const fresh = () => { pages.push([]); used = 0; };
  for (let i = 0; i < blocks.length; i++) {
    // a run of "keep" blocks travels with the block that follows it
    let need = heights[i], j = i;
    while (blocks[j].keep && j + 1 < blocks.length) { j += 1; need += heights[j]; }
    if (used > 0 && used + need > BODY_H) fresh();
    const page = pages[pages.length - 1];
    const head = blocks[i].head;
    if (head != null && !page.includes(head)) { page.push(head); used += heights[head]; }   // table carried over: repeat its heading
    page.push(i);
    used += heights[i];
  }
  return pages;
}

function Cover({ d, th }) {
  const c = d.company, cl = d.client;
  const meta = [
    ['Prepared for', cl.name || 'Client name', [cl.contact, cl.designation].filter(Boolean).join(', ')],
    ['Prepared by', c.name, c.website],
    ['Date', longDate(d.doc.date), d.doc.validUntil ? `Valid until ${longDate(d.doc.validUntil)}` : ''],
  ];
  return (
    <div className="sow-page sw-cover" data-cover={th.cover}>
      <div className="cv-art" data-photo={d.coverPhoto ? 'true' : 'false'} style={d.coverPhoto ? { '--photo': `url("${d.coverPhoto}")` } : undefined} />
      <div className="cv-deco d1" /><div className="cv-deco d2" /><div className="cv-deco d3" />
      <div className="cv-top">
        <div className="sw-brand">
          <span className="sw-logo" style={{ backgroundImage: `url("${d.logo || codelixLogo}")` }} />
          <div><b>{c.name}</b>{c.tagline && <span>{c.tagline}</span>}</div>
        </div>
        <span className="cv-tag">{[d.doc.number, d.doc.version && `v${d.doc.version}`].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="cv-main">
        <span className="cv-kicker">Scope of Work</span>
        <h1>{d.project.title || 'Project name'}</h1>
        {d.project.subtitle && <p>{d.project.subtitle}</p>}
        <span className="cv-rule" />
      </div>
      <div className="cv-meta">
        {meta.map(([k, v, s]) => <div key={k}><span>{k}</span><b>{v}</b>{s && <em>{s}</em>}</div>)}
      </div>
    </div>
  );
}

// scale < 1 shrinks the pages to fit the preview; the PDF is always made at scale 1.
export default function SowDocument({ d, scale = 1, docRef, onPageCount }) {
  const th = themeOf(d.theme);
  const font = FONTS[d.font] || FONTS[th.font];
  const vars = useMemo(() => ({ ...palette(d.accent || th.accent), '--hfont': font.head, '--bfont': font.body }), [d.accent, th.accent, font]);
  const blocks = useMemo(() => buildBlocks(d), [d]);
  const measure = useRef(null);
  const sig = useRef('');
  const [pages, setPages] = useState([[]]);
  const [fontTick, setFontTick] = useState(0);

  // Web fonts arriving change every height: measure again when they do.
  useEffect(() => {
    const again = () => setFontTick(n => n + 1);
    document.fonts?.ready.then(again);
    document.fonts?.addEventListener?.('loadingdone', again);
    return () => document.fonts?.removeEventListener?.('loadingdone', again);
  }, []);

  useLayoutEffect(() => {
    const nodes = measure.current?.children;
    if (!nodes || nodes.length !== blocks.length) return;
    const next = pack(blocks, Array.from(nodes, n => n.offsetHeight));
    const s = JSON.stringify(next);
    if (s !== sig.current) { sig.current = s; setPages(next); }
  }, [blocks, th, font, fontTick]);
  useEffect(() => { onPageCount?.(pages.length + 1); }, [pages.length, onPageCount]);

  const total = pages.length + 1;
  const frame = { width: PAGE_W * scale, height: PAGE_H * scale };
  const inner = scale === 1 ? undefined : { transform: `scale(${scale})`, transformOrigin: '0 0', width: PAGE_W, height: PAGE_H };
  const logo = d.logo || codelixLogo;

  return (
    <div className="sow-doc" data-head={th.head} data-table={th.table} data-chrome={th.chrome} style={vars} ref={docRef}>
      <div className="sow-measure" aria-hidden="true">
        <div className="sow-body" ref={measure}>
          {blocks.map(b => <div key={b.key} className="sow-block">{b.node}</div>)}
        </div>
      </div>
      <div className="sow-pages">
        <div className="sow-frame" style={frame}><div style={inner}><Cover d={d} th={th} /></div></div>
        {pages.map((list, n) => (
          <div className="sow-frame" style={frame} key={n}>
            <div style={inner}>
              <div className="sow-page sw-inner">
                <div className="sw-edge" />
                <div className="sw-head">
                  <span className="sw-head-brand"><span className="sw-logo" style={{ backgroundImage: `url("${logo}")` }} /><b>{d.company.name}</b></span>
                  <span>Scope of Work{d.project.title ? ` · ${d.project.title}` : ''}</span>
                </div>
                <div className="sow-body">
                  {list.filter(i => blocks[i]).map((i, k) => <div key={`${blocks[i].key}-${k}`} className="sow-block">{blocks[i].node}</div>)}
                </div>
                <div className="sw-foot">
                  <span>{[d.doc.number, 'Confidential', d.company.website].filter(Boolean).join(' · ')}</span>
                  <span className="sw-foot-n">Page {n + 2} of {total}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
