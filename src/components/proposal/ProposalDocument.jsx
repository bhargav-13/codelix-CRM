// The proposal as real pages, drawn to the measurements of the Codelix Proposal design in Figma
// (1440 × 1988 px frames). The cover and the contents page are fixed; every other section is cut
// into blocks (a paragraph, an item, a card…). The blocks are measured in a hidden copy and packed
// into pages, so a longer text simply continues on a new page with the same heading.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import fullLogo from '../../assets/codelix-logo-full.svg';
import coverDefault from '../../assets/proposal-cover.jpg';
import { PAGE_W, PAGE_H, SECTIONS, unitOf, vars, splitColour, totals, money, slashDate, shortDate, ordinalDate, ordinal } from '../../lib/proposal';
import './ProposalDocument.css';

const paras = s => String(s || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
const lines = s => String(s || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
const two = n => String(n).padStart(2, '0');
const has = s => String(s ?? '').trim() !== '';

// Where the body of a section page may run: below the heading, above the footer line.
const MAIN_TOP = 351, BODY_LIMIT = 1810, HEAD_EXTRA = 45.4 + 5 + 67;
// The design moves two headings: the timeline 50 px up (to fit its chart), the payments page 50 px down.
const SHIFT = { timeline: -50, payments: 50 };

// ── fixed parts of every page ───────────────────────────────────
// The seven hexagons at the top right, exactly as in the design.
const HEX = [
  'M1151.16 184.221H1274.26L1318.44 278.737L1274.26 374.656H1151.16L1111 278.737L1151.16 184.221Z',
  'M1151.16 392.893H1274.26L1318.44 487.409L1274.26 583.328H1151.16L1111 487.409L1151.16 392.893Z',
  'M1151.16 601.565H1274.26L1318.44 696.081L1274.26 792H1151.16L1111 696.081L1151.16 601.565Z',
  'M1330.02 503.016H1453.12L1497.31 597.532L1453.12 693.451H1330.02L1289.86 597.532L1330.02 503.016Z',
  'M1330.02 294.344H1453.12L1497.31 388.86L1453.12 484.779H1330.02L1289.86 388.86L1330.02 294.344Z',
  'M1330.02 85.6719H1453.12L1497.31 180.188L1453.12 276.107H1330.02L1289.86 180.188L1330.02 85.6719Z',
  'M1330.02 -123H1453.12L1497.31 -28.4839L1453.12 67.435H1330.02L1289.86 -28.4839L1330.02 -123Z',
];
const Hexagons = ({ colour }) => (
  <svg className="pp-hex" width="440" height="800" viewBox="1000 0 440 800" aria-hidden="true">
    {HEX.map((d, i) => <path key={i} d={d} fill="none" stroke={colour} strokeWidth="1.4" />)}
  </svg>
);

const Logo = ({ src }) => <img className={`pp-logo ${src ? 'own' : ''}`} src={src || fullLogo} alt="" />;

const Footer = ({ left, page, italic = true }) => (
  <div className="pp-foot">
    <span className={italic ? 'it' : ''}>{left}</span>
    <span>Page {two(page)}</span>
  </div>
);

function Page({ v, logo, footer, page, footItalic, children, bare, className = '' }) {
  return (
    <div className={`pp-page ${className}`} style={v}>
      {!bare && <Hexagons colour={v['--p-hex']} />}
      <Logo src={logo} />
      {children}
      <Footer left={footer} page={page} italic={footItalic} />
    </div>
  );
}

// ── small icons from the design (calendar and document) ─────────
const CalendarIcon = ({ c }) => (
  <svg className="pp-ico" width="26" height="29" viewBox="103 574 26 29" aria-hidden="true">
    <path opacity="0.2" fill={c} d="M104.013 583.213V582.733C104.066 581.392 104.622 580.12 105.571 579.171C106.52 578.222 107.792 577.666 109.133 577.613H122.867C123.572 577.641 124.265 577.808 124.905 578.105C125.545 578.402 126.12 578.823 126.596 579.344C127.072 579.865 127.441 580.475 127.679 581.139C127.918 581.803 128.022 582.508 127.987 583.213V583.333C127.973 583.669 127.834 583.987 127.597 584.224C127.36 584.461 127.042 584.6 126.707 584.613H105.293C104.958 584.6 104.64 584.461 104.403 584.224C104.165 583.987 104.026 583.669 104.013 583.333V583.213Z" />
    <path fill="none" stroke={c} strokeWidth="0.75" strokeLinecap="round" strokeLinejoin="round" d="M114.68 601.587H117.333C122.36 601.587 124.88 601.587 126.44 600.013C128 598.453 128 595.947 128 590.92V588.28C128 583.253 128 580.733 126.44 579.173C124.88 577.613 122.36 577.613 117.333 577.613H114.667C109.64 577.613 107.12 577.613 105.56 579.173C104 580.733 104 583.253 104 588.28V590.92C104 595.947 104 598.453 105.56 600.013C107.12 601.587 109.64 601.587 114.667 601.587M110.253 575.347V579.88M121.827 575.347V579.88M127.427 584.6H105.107" />
    {[[109.5, 590], [109.5, 595.7], [116, 590], [116, 595.7], [122.5, 590], [122.5, 595.7]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="0.75" fill={c} />)}
  </svg>
);
const SubjectIcon = ({ c }) => (
  <svg className="pp-ico" width="24" height="30" viewBox="105 636 24 30" aria-hidden="true">
    <path fill={c} d="M126 665H121V663H126V661H123C121.898 661 121 660.103 121 659V657C121 655.897 121.898 655 123 655H128V657H123V659H126C127.103 659 128 659.898 128 661V663C128 664.103 127.103 665 126 665ZM110 655H116V657H110V655ZM110 651H118V653H110V651Z" />
    <path fill={c} d="M124 651.992H126V645C126 644.9 126 644.7 125.9 644.6C125.8 644.5 125.8 644.4 125.7 644.3L118.7 637.3C118.6 637.2 118.5 637.1 118.4 637.1C118.3 637 118.1 637 118 637H108C107.5 637 107 637.2 106.6 637.6C106.2 638 106 638.5 106 639V663C106 663.5 106.2 664 106.6 664.4C107 664.8 107.5 665 108 665H115.947V663H108V639H116V645C116 645.5 116.2 646 116.6 646.4C117 646.8 117.5 647 118 647H124V651.992ZM118 645V639.4L123.6 645H118Z" />
  </svg>
);

// ── the sections, cut into blocks ───────────────────────────────
// block = { key, gap (space above it, unless it starts a page), lead (space above it when it does start
// a page), keep (stay with the next block), node }
function buildSections(d, v) {
  const out = [];
  const sec = (id, title, toc, blocks) => blocks.length && out.push({ id, title, toc, blocks });
  const b = (key, gap, node, keep, lead = 0) => ({ key, gap, node, keep, lead });
  const t = totals(d.fees);
  const client = String(d.client.name || '').trim();

  // Letter of intent
  if (d.letter.show) {
    const L = d.letter;
    sec('letter', L.title, L.toc, [
      b('letter-meta', 0, (
        <div className="pp-meta">
          <div className="pp-meta-row"><CalendarIcon c={v['--p-accent']} /><span>{L.dateLabel}</span><span>{slashDate(d.doc.date)}</span></div>
          <div className="pp-meta-row"><SubjectIcon c={v['--p-accent']} /><span>{L.subjectLabel}</span><span>{L.subject}{client && <b>{client}</b>}</span></div>
        </div>
      ), false, 4),
      ...paras(L.body).map((p, i) => b(`letter-p${i}`, i ? 24 : 49, <p className="pp-letter-p">{p}</p>)),
    ]);
  }

  // Scope of professional services
  if (d.scope.show) {
    const S = d.scope, blocks = [];
    if (has(S.intro)) blocks.push(b('scope-intro', 0, <p className="pp-scope-intro">{S.intro}</p>, false, 8));
    (S.groups || []).forEach((g, i) => {
      const items = lines(g.items);
      if (!has(g.title) && !items.length) return;
      if (has(g.title)) blocks.push(b(`scope-g${i}`, blocks.length ? (i ? 27 : 24) : 0, <h3 className="pp-scope-h">{g.title}</h3>, !!items.length));
      if (items.length) blocks.push(b(`scope-l${i}`, has(g.title) ? (i ? 49 : 43) : 24, <ul className="pp-bullets">{items.map((x, j) => <li key={j}><i />{x}</li>)}</ul>));
    });
    sec('scope', S.title, S.toc, blocks);
  }

  // Additional inclusions
  if (d.inclusions.show) {
    const items = (d.inclusions.items || []).filter(x => has(x.title) || has(x.text));
    sec('inclusions', d.inclusions.title, d.inclusions.toc, items.map((x, i) => b(`inc-${i}`, 84, (
      <div className="pp-inc">
        <span className="pp-inc-n">{two(i + 1)}</span>
        <span className="pp-inc-line" />
        <div className="pp-inc-body">
          {has(x.title) && <b>{x.title}</b>}
          {has(x.text) && <p>{x.text}</p>}
        </div>
      </div>
    ), false, 4)));
  }

  // Deliverables
  if (d.deliverables.show) {
    const items = (d.deliverables.items || []).filter(x => has(x.title) || has(x.text));
    sec('deliverables', d.deliverables.title, d.deliverables.toc, items.map((x, i) => b(`del-${i}`, 24, (
      <div className="pp-del">
        {has(x.title) && <b>{x.title}</b>}
        {paras(x.text).map((p, j) => <p key={j}>{p}</p>)}
      </div>
    ))));
  }

  // Project timeline
  if (d.timeline.show) {
    const T = d.timeline, U = unitOf(T), weeks = U.count;
    const rows = (T.rows || []).filter(r => has(r.name));
    const blocks = [];
    if (has(T.duration) || has(T.durationLabel)) blocks.push(b('tl-dur', 0, <p className="pp-tl-dur"><span>{T.durationLabel}</span><span>{T.duration}</span></p>));
    if (has(T.intro)) blocks.push(b('tl-intro', blocks.length ? 42 : 0, <p className="pp-tl-intro">{T.intro}</p>));
    if (rows.length) {
      const W = Array.from({ length: weeks }, (_, i) => i + 1);
      const colW = 972.2 / weeks;
      const small = weeks > 20 ? 'tiny' : weeks > 12 ? 'small' : '';
      blocks.push(b('tl-chart', blocks.length ? 64 : 0, (
        <div className="pp-chart">
          <div className="pp-chart-head">
            <span>{T.chartTitle}</span>
            {has(T.legend) && <span className="pp-chart-legend"><i />{T.legend}</span>}
          </div>
          <div className="pp-chart-body">
            <div className="pp-chart-row head">
              <span className="pp-chart-name">{T.firstColumn}</span>
              <span className={`pp-chart-weeks ${small}`}>{W.map(w => <span key={w}>{U.p}{w}</span>)}</span>
            </div>
            <div className="pp-chart-rows">
              {rows.map((r, i) => {
                const from = Math.min(weeks, Math.max(1, Math.round(+r.from || 1)));
                const to = Math.min(weeks, Math.max(from, Math.round(+r.to || from)));
                const span = from === to ? `${U.p}${from}` : `${U.p}${from}-${U.p}${to}`;
                const n = to - from + 1;
                const left = 266.5 + (from - 1) * colW + 10, width = n * colW - 20;
                return (
                  <div key={i} className="pp-chart-row">
                    <span className="pp-chart-name"><span>{r.name}</span><em>{has(r.note) ? r.note : `${span} (${n} ${n === 1 ? U.one : U.many})`}</em></span>
                    <span className={`pp-chart-weeks ${small}`}>{W.map(w => <span key={w} className={w >= from && w <= to ? 'under' : undefined}>{U.p}{w}</span>)}</span>
                    <span className="pp-chart-bar" style={{ left, width }}><span>{span}</span><i /></span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )));
    }
    sec('timeline', T.title, T.toc, blocks);
  }

  // Commercial terms: the fees table
  if (d.fees.show) {
    const F = d.fees, rows = (F.rows || []).filter(r => has(r.name) || +r.amount);
    const blocks = [];
    if (has(F.validText)) blocks.push(b('fee-valid', 0, <p className="pp-fee-valid"><span>{F.validText}</span><span>{ordinalDate(d.doc.validUntil)}.</span></p>));
    if (rows.length) {
      blocks.push(b('fee-table', blocks.length ? 104.7 : 0, (
        <div className="pp-fees">
          <div className="pp-fees-head"><span>{F.colName}</span><span>{F.colFee}</span></div>
          {rows.map((r, i) => <div key={i} className="pp-fees-row"><span>{r.name}</span><span>{money(r.amount)}</span></div>)}
        </div>
      )));
      blocks.push(b('fee-total', 41, (
        <div className="pp-fee-sum">
          <div className="sub"><span>{F.subLabel}</span><span>{money(t.sub)}</span></div>
          {F.gst && <div className="gst"><span>{F.gstLabel}({+F.gstRate || 0}%)</span><span>{money(t.gst)}</span></div>}
          <div className="total"><span>{F.totalLabel}</span><span>{money(t.total)}</span></div>
        </div>
      )));
    }
    sec('fees', F.title, F.toc, blocks);
  }

  // Commercial terms: payment milestones, support and terms
  if (d.payments.show) {
    const P = d.payments, ms = (P.milestones || []).filter(m => has(m.label) || +m.percent);
    const blocks = [];
    if (has(P.heading) || has(P.note)) blocks.push(b('pay-head', 0, <p className="pp-pay-head"><span>{P.heading}</span><span>{P.note}</span></p>));
    if (ms.length) {
      const sum = ms.reduce((s, m) => s + Math.max(0, +m.percent || 0), 0) || 1;
      blocks.push(b('pay-bar', blocks.length ? 50 : 0, (
        <div className="pp-pay-bar">
          <div className="pp-pay-track">{ms.map((m, i) => <span key={i} style={{ flexGrow: Math.max(0, +m.percent || 0) / sum, background: splitColour(i) }} />)}</div>
          <div className="pp-pay-labels">{ms.map((m, i) => (
            <span key={i} style={{ flexGrow: Math.max(0, +m.percent || 0) / sum }} className={i === 0 ? 'first' : i === ms.length - 1 ? 'last' : ''}>{+m.percent || 0}% {m.label}</span>
          ))}</div>
        </div>
      )));
      blocks.push(b('pay-cards', 66.5, (
        <div className="pp-pay-cards" style={{ '--cols': Math.min(4, ms.length) }}>
          {ms.map((m, i) => (
            <div key={i} className="pp-pay-card">
              <span>{ordinal(i + 1)} Milestone ({+m.percent || 0}%)</span>
              <span>{money(t.part(m.percent))}</span>
              {has(m.text) && <p>{m.text}</p>}
            </div>
          ))}
        </div>
      )));
    }
    const sup = P.support.show && (has(P.support.title) || has(P.support.text));
    const amc = P.amc.show && (has(P.amc.title) || has(P.amc.text));
    if (sup || amc) {
      blocks.push(b('pay-support', blocks.length ? 43 : 0, (
        <div className={`pp-box two ${sup && amc ? '' : 'one'}`}>
          {sup && (
            <div className="pp-box-col">
              <div className="pp-box-title"><span>{P.support.title}</span>{has(P.support.badge) && <em className="pp-badge">{P.support.badge}</em>}</div>
              <p className="pp-box-text">{P.support.text}</p>
            </div>
          )}
          {sup && amc && <i className="pp-box-div" />}
          {amc && (
            <div className="pp-box-col">
              <div className="pp-box-title"><span>{P.amc.title}</span>{has(P.amc.price) && <em className="pp-price">{P.amc.price}</em>}</div>
              <p className="pp-box-text">{P.amc.text}</p>
            </div>
          )}
        </div>
      )));
    }
    const terms = (P.terms || []).filter(x => has(x.label) || has(x.text));
    const excl = (P.exclusions || []).filter(x => has(x.label) || has(x.text));
    if (P.showTerms && (terms.length || excl.length)) {
      const col = (title, list) => (
        <div className="pp-box-col">
          <div className="pp-box-title dark"><span>{title}</span></div>
          {list.map((x, i) => <p key={i} className="pp-term"><b>{x.label}</b> {x.text}</p>)}
        </div>
      );
      blocks.push(b('pay-terms', blocks.length ? 43 : 0, (
        <div className={`pp-box two terms ${terms.length && excl.length ? '' : 'one'}`}>
          {!!terms.length && col(P.termsTitle, terms)}
          {!!terms.length && !!excl.length && <i className="pp-box-div" />}
          {!!excl.length && col(P.exclusionsTitle, excl)}
        </div>
      )));
    }
    sec('payments', P.title, d.fees.show ? '' : d.fees.toc, blocks);
  }

  // Terms & conditions
  if (d.terms.show) {
    const items = (d.terms.items || []).filter(x => has(x.title) || has(x.text));
    sec('terms', d.terms.title, d.terms.toc, items.map((x, i) => b(`tc-${i}`, i ? 24 : 0, (
      <div className="pp-tc">
        {has(x.title) && <b>{x.title}</b>}
        {paras(x.text).map((p, j) => <p key={j}>{p}</p>)}
      </div>
    ))));
  }

  // Acceptance and signatures
  if (d.acceptance.show) {
    const A = d.acceptance, co = d.company, blocks = [];
    if (has(A.intro)) blocks.push(b('acc-intro', 0, <p className="pp-acc-intro">{A.intro}</p>));
    if (has(A.confirm)) blocks.push(b('acc-confirm', blocks.length ? 32 : 0, <p className="pp-acc-confirm">{A.confirm}</p>, true));
    const pts = lines(A.points);
    if (pts.length) blocks.push(b('acc-points', blocks.length ? 52 : 0, <ul className="pp-bullets dark">{pts.map((x, j) => <li key={j}><i />{x}</li>)}</ul>));
    const field = (label, value, empty) => <div className="pp-sign-row"><span>{label}</span><span className={has(value) ? '' : 'ph'}>{has(value) ? value : empty}</span></div>;
    blocks.push(b('acc-sign', blocks.length ? 75 : 0, (
      <div className="pp-sign">
        <div className="pp-sign-box">
          <div className="pp-sign-title">{A.clientTitle}</div>
          <div className="pp-sign-pad"><span>{A.signHint}</span><i /></div>
          {field(A.nameLabel, d.client.contact, 'Client Name')}
          {field(A.designationLabel, d.client.designation, 'Designation')}
          {field(A.companyLabel, d.client.name, 'Client Company')}
          {field(A.dateLabel, A.clientDate ? shortDate(A.clientDate) : '', 'DD/MM/YYYY')}
        </div>
        <div className="pp-sign-box">
          <div className="pp-sign-title">{A.ourTitle}</div>
          <div className="pp-sign-pad">{co.signature ? <img src={co.signature} alt="" /> : <span>{A.signHint}</span>}<i /></div>
          {field(A.nameLabel, co.signatory, 'Name')}
          {field(A.designationLabel, co.signatoryTitle, 'Designation')}
          {field(A.companyLabel, co.name, 'Company')}
          {field(A.dateLabel, shortDate(d.doc.date), 'DD/MM/YYYY')}
        </div>
      </div>
    )));
    sec('acceptance', A.title, A.toc, blocks);
  }

  // keep the page order fixed, whatever order the code above added them in
  return SECTIONS.map(id => out.find(s => s.id === id)).filter(Boolean);
}

// Blocks → pages: [{ sec, blocks, first, over }]
function pack(sections, h) {
  const pages = [];
  for (const s of sections) {
    const room = BODY_LIMIT - (MAIN_TOP + (SHIFT[s.id] || 0) + (h[`t:${s.id}`] || 97) + HEAD_EXTRA);
    let cur = [], used = 0;
    const flush = () => { if (cur.length) pages.push({ sec: s, blocks: cur, first: !pages.some(p => p.sec.id === s.id), over: used > room + 1 }); cur = []; used = 0; };
    s.blocks.forEach((bl, i) => {
      const hb = h[bl.key] || 0;
      const next = s.blocks[i + 1];
      const need = (cur.length ? bl.gap : bl.lead) + hb;
      const withNext = bl.keep && next ? need + next.gap + (h[next.key] || 0) : need;
      if (cur.length && used + withNext > room) flush();
      used += (cur.length ? bl.gap : bl.lead) + hb;
      cur.push(bl);
    });
    flush();
  }
  return pages;
}

export default function ProposalDocument({ d, scale = 1, docRef, onInfo }) {
  const v = useMemo(() => vars(d.style), [d.style]);
  const sections = useMemo(() => buildSections(d, v), [d, v]);
  const measure = useRef(null);
  const [h, setH] = useState({});
  const [fontTick, setFontTick] = useState(0);

  // Re-measure once the web fonts arrive (they change the line breaks).
  useEffect(() => {
    const f = document.fonts;
    if (!f) return undefined;
    const bump = () => setFontTick(t => t + 1);
    f.ready.then(bump);
    f.addEventListener?.('loadingdone', bump);
    return () => f.removeEventListener?.('loadingdone', bump);
  }, []);

  useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return;
    const next = {};
    el.querySelectorAll('[data-m]').forEach(n => { next[n.dataset.m] = n.getBoundingClientRect().height; });
    setH(prev => {
      const keys = Object.keys(next);
      return keys.length === Object.keys(prev).length && keys.every(k => Math.abs(prev[k] - next[k]) < 0.5) ? prev : next;
    });
  }, [sections, fontTick]);

  const bodyPages = useMemo(() => pack(sections, h), [sections, h]);

  // Page numbers: cover 1, contents 2 (if shown), then the section pages.
  const start = d.toc.show ? 3 : 2;
  const toc = [];
  bodyPages.forEach((p, i) => { if (p.first && has(p.sec.toc)) toc.push({ label: p.sec.toc, page: start + i }); });
  const total = start - 1 + bodyPages.length;
  const over = bodyPages.map((p, i) => (p.over ? start + i : 0)).filter(Boolean);

  const infoKey = `${total}|${over.join(',')}`;
  const lastInfo = useRef('');
  useEffect(() => {
    if (lastInfo.current === infoKey) return;
    lastInfo.current = infoKey;
    onInfo?.({ pages: total, overflow: over });
  });

  const co = d.company, cv = d.cover;
  const photo = d.coverPhoto === 'none' ? '' : d.coverPhoto || coverDefault;

  const pages = [
    // 1 · cover
    <div key="cover" className="pp-page pp-cover" style={v}>
      {photo && <img className={`pp-cover-photo ${d.coverPhoto ? 'own' : ''}`} src={photo} alt="" />}
      {photo && d.coverPhoto && d.coverPhoto !== 'none' && <span className="pp-cover-fade" />}
      <Logo src={d.logo} />
      <i className="pp-cover-rule r1" /><i className="pp-cover-rule r2" />
      <div className="pp-cover-meta m1"><span>{cv.dateLabel}</span><span>{slashDate(d.doc.date)}</span></div>
      <div className="pp-cover-meta m2"><span>{cv.numberLabel}</span><span>{d.doc.number}</span></div>
      <p className="pp-cover-kicker">{cv.kicker}</p>
      <h1 className="pp-cover-title">{cv.title}</h1>
      <p className="pp-cover-for">{cv.prepared}</p>
      <p className="pp-cover-client">{d.client.name}</p>
      <Footer left={cv.showGstin && has(co.gstin) ? `GSTIN: ${co.gstin}` : ''} page={1} italic={false} />
    </div>,
  ];

  if (d.toc.show) {
    pages.push(
      <Page key="toc" v={v} logo={d.logo} footer={co.footer} page={2} className="pp-toc">
        <h2 className="pp-toc-title">{d.toc.title}</h2>
        <i className="pp-toc-rule" />
        <div className="pp-toc-list">
          {toc.map((x, i) => (
            <div key={x.label + i} className="pp-toc-row">
              <span className="pp-toc-bar"><span>{x.label}</span><span>{two(x.page)}</span></span>
              <span className="pp-toc-n">{two(i + 1)}</span>
            </div>
          ))}
        </div>
      </Page>,
    );
  }

  bodyPages.forEach((p, i) => pages.push(
    <Page key={`${p.sec.id}-${i}`} v={v} logo={d.logo} footer={co.footer} page={start + i}>
      <div className="pp-main" style={SHIFT[p.sec.id] ? { top: MAIN_TOP + SHIFT[p.sec.id] } : undefined}>
        <h2 className="pp-title">{p.sec.title}</h2>
        <i className="pp-rule" />
        <div className="pp-body">
          {p.blocks.map((bl, j) => <div key={bl.key} className="pp-block" data-b={bl.key} style={{ paddingTop: j ? bl.gap : bl.lead }}>{bl.node}</div>)}
        </div>
      </div>
    </Page>,
  ));

  return (
    <>
      {/* hidden copy used only to measure the blocks */}
      <div className="pp-measure" ref={measure} aria-hidden="true" style={v}>
        {sections.map(s => (
          <Fragment key={s.id}>
            <h2 className="pp-title" data-m={`t:${s.id}`}>{s.title}</h2>
            <div className="pp-body">{s.blocks.map(bl => <div key={bl.key} className="pp-block" data-m={bl.key}>{bl.node}</div>)}</div>
          </Fragment>
        ))}
      </div>

      <div className="pp-pages" ref={docRef}>
        {pages.map((pg, i) => (
          // data-sec lets the builder find (and scroll to) the page of the part being edited
          <div key={i} className="pp-slot" data-sec={String(pg.key).replace(/-\d+$/, '')} style={scale === 1 ? undefined : { width: PAGE_W * scale, height: PAGE_H * scale }}>
            <div style={scale === 1 ? undefined : { transform: `scale(${scale})`, transformOrigin: '0 0' }}>{pg}</div>
          </div>
        ))}
      </div>
    </>
  );
}
