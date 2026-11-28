// The short Codelix letters (Figma file "Letters", 1440 × 1988 px frames): milestones & payment
// schedule, thank you for your payment, thank you for the delivered project, mutual NDA.
// The content is cut into blocks that are measured and packed into pages, so anything longer than
// the design simply continues on the next page with the same header and footer.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import logoNavy from '../../assets/codelix-logo-navy.svg';
import logoBlack from '../../assets/codelix-logo-full.svg';
import { PAGE_W, PAGE_H } from '../../lib/proposal';
import { msAmount, money, longDate, shortDate, fillVars } from '../../lib/letters';
import './LetterDocument.css';

const has = s => String(s ?? '').trim() !== '';
const LIMIT = 1800, NEXT_TOP = 312;
const FIRST_TOP = { milestones: 320, payment: 312, delivery: 296, nda: 304, welcome: 296, sow: 320 };

// "**bold**" → <b>; text in between stays as it is.
function Rich({ text }) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return parts.map((x, i) => (/^\*\*[^*]+\*\*$/.test(x) ? <b key={i}>{x.slice(2, -2)}</b> : <Fragment key={i}>{x}</Fragment>));
}

// Clause text: "- " lines are bullets, "-- " lines are bullets one step in, the rest paragraphs.
function ClauseText({ text, vars }) {
  const lines = fillVars(text, vars).split('\n').map(l => l.trimEnd()).filter(l => l.trim());
  const out = [];
  let list = null;
  lines.forEach((l, i) => {
    const m = /^(-{1,2})\s+(.*)$/.exec(l.trim());
    if (m) {
      if (!list) { list = []; out.push({ list }); }
      list.push({ deep: m[1].length === 2, text: m[2], key: i });
    } else { list = null; out.push({ p: l, key: i }); }
  });
  return out.map((x, i) => (x.list
    ? <ul key={i} className="lt-bul small">{x.list.map(li => <li key={li.key} className={li.deep ? 'deep' : ''}><i /><Rich text={li.text} /></li>)}</ul>
    : <p key={x.key} className="lt-clause-p"><Rich text={x.p} /></p>));
}

const Kv = ({ rows, variant = '' }) => (
  <div className={`lt-kv ${variant}`}>
    {rows.map((r, i) => (
      <div key={i} className="lt-kv-row"><span>{r.label}</span><span>{r.value}</span></div>
    ))}
  </div>
);

const Heading = ({ n, children, semi }) => (
  <h2 className={`lt-h ${semi ? 'semi' : ''}`}><span className="lt-h-n">{n}.</span>{children}</h2>
);

function SignBoxes({ a, co, docDate }) {
  const row = (label, value, empty) => <div className="lt-sign-row"><span>{label}</span><span>{has(value) ? value : empty}</span></div>;
  return (
    <div className="lt-sign">
      <div className="lt-sign-box">
        <div className="lt-sign-title">{a.clientTitle}</div>
        <div className="lt-sign-pad"><span>{a.signHint}</span><i /></div>
        {row(a.nameLabel, a.client.name, 'Client Name')}
        {row(a.designationLabel, a.client.designation, 'Designation')}
        {row(a.companyLabel, a.client.company, 'Client Company')}
        {row(a.dateLabel, a.client.date ? shortDate(a.client.date) : '', 'DD/MM/YYYY')}
      </div>
      <div className="lt-sign-box">
        <div className="lt-sign-title">{a.ourTitle}</div>
        <div className="lt-sign-pad">{co.signature ? <img src={co.signature} alt="" /> : <span>{a.signHint}</span>}<i /></div>
        {row(a.nameLabel, co.signatory, 'Name')}
        {row(a.designationLabel, co.signatoryTitle, 'Designation')}
        {row(a.companyLabel, co.name, 'Company')}
        {row(a.dateLabel, shortDate(docDate), 'DD/MM/YYYY')}
      </div>
    </div>
  );
}

function ToBlock({ to, date, refLabel, refValue }) {
  return (
    <div className="lt-to">
      <div className="lt-to-left">
        <p className="m">To,</p>
        {has(to.name) && <p className="m">{to.name}</p>}
        {has(to.designation) && <p>{to.designation}</p>}
        {has(to.company) && <p>{to.company}</p>}
        {has(to.address) && <p>{to.address}</p>}
      </div>
      <div className="lt-to-right">
        <div><p className="m">Date</p><p className="m">{longDate(date)}</p></div>
        {has(refValue) && <div><p>{refLabel}</p><p>{refValue}</p></div>}
      </div>
    </div>
  );
}

function Signoff({ s, co }) {
  return (
    <div className="lt-signoff">
      <p className="m">{s.regards}</p>
      {has(s.name) && <p className="m">{s.name}</p>}
      {has(s.title) && <p>{s.title}</p>}
      <p className="lt-contact">{[co.phone, co.email].filter(has).join(' | ')}</p>
    </div>
  );
}

// ── blocks for each letter ──────────────────────────────────────
// block = { key, gap (space above, unless it starts a page), keep (stay with the next block), node }
function buildBlocks(kind, d) {
  const out = [];
  const b = (key, gap, node, keep) => out.push({ key, gap, node, keep });
  const co = d.company;

  if (kind === 'milestones') {
    let n = 0;
    b('info', 0, <Kv rows={(d.info || []).filter(r => has(r.label) || has(r.value))} />);
    const ms = (d.milestones || []).filter(m => has(m.label) || +m.percent);
    if (ms.length) {
      b('ms-h', 100, <Heading n={++n}>{d.msHeading}</Heading>, true);
      for (let i = 0; i < ms.length; i += 3) {
        b(`ms-${i}`, i ? 32 : 41, (
          <div className="lt-cards">
            {ms.slice(i, i + 3).map((m, j) => (
              <div key={j} className="lt-card">
                <span className="m">{m.label}{d.showPercent && +m.percent ? ` (${+m.percent}%)` : ''}</span>
                <span>{money(msAmount(d, m))}</span>
                {has(m.text) && <p>{m.text}</p>}
                {has(m.date) && <span className="m lt-card-date">{longDate(m.date)}</span>}
              </div>
            ))}
          </div>
        ));
      }
    }
    const R = d.recurring;
    const rr = (R.rows || []).filter(r => has(r.item) || has(r.amount));
    if (R.show && rr.length) {
      b('rc-h', 72, <Heading n={++n}>{R.heading}</Heading>, true);
      b('rc-t', 47, (
        <div className="lt-grid4">
          <div className="lt-grid4-row">{R.cols.map((c, i) => <span key={i}>{c}</span>)}</div>
          {rr.map((r, i) => <div key={i} className="lt-grid4-row"><span>{r.item}</span><span>{r.amount}</span><span>{r.billing}</span><span>{r.from}</span></div>)}
        </div>
      ));
    }
    const T = d.terms;
    const items = String(T.items || '').split('\n').map(x => x.trim()).filter(Boolean);
    if (T.show && items.length) {
      b('pt-h', 72, <Heading n={++n}>{T.heading}</Heading>, true);
      b('pt-l', 47, <ul className="lt-bul">{items.map((x, i) => <li key={i}><i /><Rich text={x} /></li>)}</ul>);
    }
    const B = d.bank;
    const br = (B.rows || []).filter(r => has(r.label) || has(r.value));
    if (B.show && br.length) {
      b('bk-h', 64, <Heading n={++n}>{B.heading}</Heading>, true);
      b('bk-t', 55, <Kv rows={br} />);
    }
    if (d.accept.show) {
      b('ac-h', 64, <Heading n={++n}>{d.accept.heading}</Heading>, true);
      b('ac-s', 41, <SignBoxes a={d.accept} co={co} docDate={d.docDate} />);
    }
  }

  if (kind === 'payment') {
    b('to', 0, <ToBlock to={d.to} date={d.date} refLabel={d.refLabel} refValue={d.ref} />);
    if (has(d.subject)) b('subject', 56, <p className="lt-subject">{d.subject}</p>);
    b('greet', 56, <div className="lt-greet"><p className="lt-dear">{d.greeting}</p>{has(d.intro) && <p>{d.intro}</p>}</div>, true);
    b('rows', 64, <Kv rows={(d.rows || []).filter(r => has(r.label) || has(r.value))} />);
    if (has(d.closing)) b('closing', 48, <p className="lt-para"><Rich text={d.closing} /></p>);
    b('signoff', 64, <Signoff s={d.signoff} co={co} />);
  }

  if (kind === 'delivery') {
    const vars = { support_end_date: longDate(d.supportEnd), codelix_support_phone: co.phone, codelix_support_email: co.email, codelix_review_link: d.reviewLink };
    b('to', 0, <ToBlock to={d.to} date={d.date} />);
    if (has(d.subject)) b('subject', 56, <p className="lt-subject blue">{d.subject}</p>);
    b('body', 32, <div className="lt-body"><p>{d.greeting}</p><p className="lt-blank">{'​'}</p><p className="lt-body-p"><Rich text={fillVars(d.body, vars)} /></p></div>);
    const rows = (d.rows || []).filter(r => has(r.label) || has(r.value));
    if (rows.length) b('table', 36, <Kv variant="wide" rows={[{ label: d.head[0], value: d.head[1] }, ...rows]} />);
    const paras = String(d.paras || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
    if (paras.length) b('paras', 42, <div className="lt-paras">{paras.map((x, i) => <p key={i}><Rich text={fillVars(x, vars)} /></p>)}</div>);
    b('signoff', 59, <Signoff s={d.signoff} co={co} />);
  }

  if (kind === 'nda') {
    const vars = { date: longDate(d.date), purpose: d.purpose };
    b('intro', 0, <p className="lt-para"><Rich text={fillVars(d.intro, vars)} /></p>);
    b('parties', 46, (
      <div className="lt-party">
        <p><Rich text={fillVars(d.partyA, vars)} /></p>
        <p className="lt-and">{d.andWord}</p>
        <p><Rich text={fillVars(d.partyB, vars)} /></p>
      </div>
    ));
    if (has(d.parties)) b('both', 42, <p className="lt-para"><Rich text={fillVars(d.parties, vars)} /></p>);
    (d.clauses || []).filter(c => has(c.title) || has(c.text)).forEach((c, i) => {
      b(`cl-h${i}`, i ? 32 : 42, <Heading n={i + 1} semi>{c.title}</Heading>, true);
      b(`cl-t${i}`, 24, <div className="lt-clause"><ClauseText text={c.text} vars={vars} /></div>);
    });
    if (d.accept.show) {
      b('ac-h', 64, <Heading n={(d.clauses || []).filter(c => has(c.title) || has(c.text)).length + 1} semi>{d.accept.heading}</Heading>, true);
      b('ac-s', 41, <SignBoxes a={d.accept} co={co} docDate={d.date} />);
    }
  }
  if (kind === 'welcome') {
    b('to', 0, <ToBlock to={d.to} date={d.date} />);
    if (has(d.subject)) b('subject', 41, <div className="lt-callout tall"><p><b>{d.subjectLabel} </b>{d.subject}</p></div>);
    const paras = String(d.body || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
    b('body', 37, (
      <div className="lt-body wide">
        <p>{d.greeting}</p>
        {paras.map((x, i) => <Fragment key={i}><p className="lt-blank">{'\u200b'}</p><p className="lt-body-p42"><Rich text={x} /></p></Fragment>)}
      </div>
    ));
    const team = (d.team || []).filter(r => has(r.role) || has(r.name));
    if (team.length) {
      b('team', 56, (
        <div className="lt-team">
          <div className="lt-team-row head">{d.teamCols.map((c, i) => <span key={i}>{c}</span>)}</div>
          <div className="lt-team-body">
            {team.map((r, i) => <div key={i} className="lt-team-row"><span>{r.role}</span><span>{r.name}</span><span>{r.phone}</span><span>{r.email}</span></div>)}
          </div>
        </div>
      ));
    }
    if (has(d.note)) b('note', 42, <div className="lt-callout"><p>{d.note}</p></div>);
    const steps = String(d.next?.items || '').split('\n').map(x => x.trim()).filter(Boolean);
    if (d.next?.show && steps.length) {
      b('next-h', 64, <Heading n={1}>{d.next.heading}</Heading>, true);
      b('next-l', 41, <ul className="lt-bul mid">{steps.map((x, i) => <li key={i}><i /><Rich text={x} /></li>)}</ul>);
    }
    b('signoff', 64, <Signoff s={d.signoff} co={co} />);
  }

  if (kind === 'sow') {
    let n = 0;
    const list = text => String(text || '').split('\n').map(x => x.trim()).filter(Boolean);
    const bullets = (key, text) => { const it = list(text); if (it.length) b(key, 41, <ul className="lt-bul small">{it.map((x, i) => <li key={i}><i /><Rich text={x} /></li>)}</ul>); };
    const grid = (key, G) => {
      const rows = (G.rows || []).filter(r => has(r.a) || has(r.b) || has(r.c));
      if (!G.show || !rows.length) return;
      b(`${key}-h`, 72, <Heading n={++n}>{G.heading}</Heading>, true);
      b(`${key}-th`, 41, <div className="lt-grid3 head"><div className="lt-grid3-row">{G.cols.map((c, i) => <span key={i}>{c}</span>)}</div></div>, true);
      rows.forEach((r, i) => b(`${key}-${i}`, 0, <div className={`lt-grid3 ${i === rows.length - 1 ? 'last' : ''}`}><div className="lt-grid3-row"><span>{r.a}</span><span>{r.b}</span><span>{r.c}</span></div></div>));
    };
    b('info', 0, <Kv rows={(d.info || []).filter(r => has(r.label) || has(r.value))} />);

    const O = d.overview;
    b('ov-h', 72, <Heading n={++n}>{O.heading}</Heading>, true);
    String(O.text || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean).forEach((x, i) => b(`ov-${i}`, i ? 16 : 41, <p className="lt-clause-p"><Rich text={x} /></p>));
    bullets('ov-obj', O.objectives);

    const items = (d.scope.items || []).filter(x => has(x.title) || has(x.text));
    if (items.length) {
      b('sc-h', 72, <Heading n={++n}>{d.scope.heading}</Heading>, true);
      items.forEach((x, i) => b(`sc-${i}`, i ? 24 : 41, <div className="lt-item"><b>{n}.{i + 1} {x.title}</b>{has(x.text) && <p><Rich text={x.text} /></p>}</div>));
    }
    grid('dl', d.deliverables);
    grid('tl', d.timeline);
    if (d.tech.show && list(d.tech.items).length) {
      b('tech-h', 72, <Heading n={++n}>{d.tech.heading}</Heading>, true);
      b('tech', 41, <div className="lt-chips">{list(d.tech.items).map((x, i) => <span key={i}>{x}</span>)}</div>);
    }
    const ms = (d.milestones || []).filter(m => has(m.label) || +m.percent);
    if (d.cost.show) {
      b('cost-h', 72, <Heading n={++n}>{d.cost.heading}</Heading>, true);
      const rows = (d.cost.rows || []).filter(r => has(r.label) || has(r.value));
      if (rows.length) b('cost-kv', 41, <Kv rows={rows} />);
      for (let i = 0; i < ms.length; i += 3) {
        b(`ms-${i}`, i || rows.length ? 32 : 41, (
          <div className="lt-cards">
            {ms.slice(i, i + 3).map((m, j) => (
              <div key={j} className="lt-card short">
                <span className="m">{m.label}{d.showPercent && +m.percent ? ` (${+m.percent}%)` : ''}</span>
                <span>{money(msAmount(d, m))}</span>
                {has(m.text) && <p>{m.text}</p>}
                {has(m.date) && <span className="m lt-card-date">{longDate(m.date)}</span>}
              </div>
            ))}
          </div>
        ));
      }
    }
    for (const [key, S] of [['as', d.assumptions], ['ex', d.exclusions]]) {
      if (!S.show || !list(S.items).length) continue;
      b(`${key}-h`, 72, <Heading n={++n}>{S.heading}</Heading>, true);
      bullets(key, S.items);
    }
    const terms = (d.termsList.items || []).filter(x => has(x.title) || has(x.text));
    if (d.termsList.show && terms.length) {
      b('tm-h', 72, <Heading n={++n}>{d.termsList.heading}</Heading>, true);
      terms.forEach((x, i) => b(`tm-${i}`, i ? 24 : 41, <div className="lt-item"><b>{n}.{i + 1} {x.title}</b>{has(x.text) && <p><Rich text={x.text} /></p>}</div>));
    }
    if (d.accept.show) {
      b('ac-h', 64, <Heading n={++n}>{d.accept.heading}</Heading>, true);
      b('ac-s', 41, <SignBoxes a={d.accept} co={co} docDate={d.docDate} />);
    }
  }
  return out;
}

function pack(kind, blocks, h) {
  const pages = [];
  let cur = [], used = 0, room = LIMIT - FIRST_TOP[kind];
  const flush = () => { if (cur.length) pages.push({ blocks: cur, top: pages.length ? NEXT_TOP : FIRST_TOP[kind], over: used > room + 1 }); cur = []; used = 0; room = LIMIT - NEXT_TOP; };
  blocks.forEach((bl, i) => {
    const hb = h[bl.key] || 0, next = blocks[i + 1];
    const need = (cur.length ? bl.gap : 0) + hb;
    const withNext = bl.keep && next ? need + next.gap + (h[next.key] || 0) : need;
    if (cur.length && used + withNext > room) flush();
    used += (cur.length ? bl.gap : 0) + hb;
    cur.push(bl);
  });
  flush();
  return pages.length ? pages : [{ blocks: [], top: FIRST_TOP[kind] }];
}

function Chrome({ d, kind, page, children }) {
  return (
    <div className={`lt-page ${d.dark ? 'dark' : ''}`} data-kind={kind}>
      <img className="lt-logo" src={d.logo || (d.dark ? logoBlack : logoNavy)} alt="" />
      {has(d.title) && <div className="lt-title" style={{ width: d.titleWidth || 406 }}>{d.title}</div>}
      <i className="lt-rule" />
      {children}
      <div className="lt-foot"><span><span className="lt-foot-brand">{d.company.footerBrand}</span>{d.company.footerRest}</span>{d.pageNumbers && page > 0 && <span>Page {String(page).padStart(2, '0')}</span>}</div>
    </div>
  );
}

export default function LetterDocument({ kind, d, scale = 1, docRef, onInfo }) {
  const blocks = useMemo(() => buildBlocks(kind, d), [kind, d]);
  const measure = useRef(null);
  const [h, setH] = useState({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const f = document.fonts;
    if (!f) return undefined;
    const bump = () => setTick(t => t + 1);
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
  }, [blocks, tick]);

  const pages = useMemo(() => pack(kind, blocks, h), [kind, blocks, h]);
  const over = pages.map((p, i) => (p.over ? i + 1 : 0)).filter(Boolean);
  const infoKey = `${pages.length}|${over.join(',')}`;
  const last = useRef('');
  useEffect(() => { if (last.current !== infoKey) { last.current = infoKey; onInfo?.({ pages: pages.length, overflow: over }); } });

  return (
    <>
      <div className={`lt-measure ${d.dark ? 'dark' : ''}`} ref={measure} aria-hidden="true">
        {blocks.map(bl => <div key={bl.key} className="lt-block" data-m={bl.key}>{bl.node}</div>)}
      </div>
      <div className="pp-pages" ref={docRef}>
        {pages.map((p, i) => (
          <div key={i} className="pp-slot" style={scale === 1 ? undefined : { width: PAGE_W * scale, height: PAGE_H * scale }}>
            <div style={scale === 1 ? undefined : { transform: `scale(${scale})`, transformOrigin: '0 0' }}>
              <Chrome d={d} kind={kind} page={pages.length > 1 ? i + 1 : 0}>
                <div className="lt-body-area" style={{ top: p.top }}>
                  {p.blocks.map((bl, j) => <div key={bl.key} className="lt-block" data-b={bl.key} style={{ paddingTop: j ? bl.gap : 0 }}>{bl.node}</div>)}
                </div>
              </Chrome>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
