// Proposal builder: every word, number, colour and picture of the Codelix proposal design can be
// changed on the left; the real pages are on the right; then they become a PDF.
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Field, FormGrid, useToast } from '../components/ui/kit';
import { useMeSummary } from '../components/layout/shell';
import ProposalDocument from '../components/proposal/ProposalDocument';
import LeadPicker from '../components/proposal/LeadPicker';
import { Sec, Rows, ImagePick, Toggle, AutoArea } from '../components/templates/FormBits';
import { clientsDB } from '../lib/db';
import { uploadFile } from '../lib/files';
import { documentsDB } from '../lib/documents';
import { pagesToPdf, downloadBlob } from '../lib/pdf';
import { shrinkImage } from '../lib/sow';
import { PAGE_W, PAGE_H, PDF_MM, UNITS, unitOf, fromLead, FONTS, FONT_LINK, STYLE_PRESETS, DEFAULT_STYLE, blankProposal, draft, totals, money, pdfName } from '../lib/proposal';
import { ArrowLeft, ArrowRight, Download, Eye, FolderPlus, X, RotateCcw, AlertTriangle, ZoomIn, ZoomOut } from 'lucide-react';
import './SowBuilder.css';
import './ProposalBuilder.css';

// Sets a value at a dotted path ('payments.support.title') without changing the rest.
const setIn = (obj, path, value) => {
  const [k, ...rest] = path.split('.');
  return { ...obj, [k]: rest.length ? setIn(obj[k] || {}, rest.join('.'), value) : value };
};

// The form, one part at a time. `sec` is the preview page the part edits (for jumping to it),
// `show` the switch that hides that page.
const STEPS = [
  { id: 'design', label: 'Design', sec: 'cover' },
  { id: 'cover', label: 'Cover', sec: 'cover' },
  { id: 'toc', label: 'Contents', sec: 'toc', show: 'toc' },
  { id: 'letter', label: 'Letter', sec: 'letter', show: 'letter' },
  { id: 'scope', label: 'Scope', sec: 'scope', show: 'scope' },
  { id: 'inclusions', label: 'Inclusions', sec: 'inclusions', show: 'inclusions' },
  { id: 'deliverables', label: 'Deliverables', sec: 'deliverables', show: 'deliverables' },
  { id: 'timeline', label: 'Timeline', sec: 'timeline', show: 'timeline' },
  { id: 'fees', label: 'Fees', sec: 'fees', show: 'fees' },
  { id: 'payments', label: 'Payments', sec: 'payments', show: 'payments' },
  { id: 'terms', label: 'Terms', sec: 'terms', show: 'terms' },
  { id: 'acceptance', label: 'Acceptance', sec: 'acceptance', show: 'acceptance' },
  { id: 'company', label: 'Company', sec: 'acceptance' },
];
const STEP_OF_PAGE = { cover: 'cover', toc: 'toc', letter: 'letter', scope: 'scope', inclusions: 'inclusions', deliverables: 'deliverables',
  timeline: 'timeline', fees: 'fees', payments: 'payments', terms: 'terms', acceptance: 'acceptance' };

const Text = ({ label, value, onChange, hint, area, rows = 4, span, ...rest }) => (
  <Field label={label} hint={hint} span={span}>
    {id => area
      ? <AutoArea id={id} rows={Math.min(rows, 3)} value={value ?? ''} onChange={e => onChange(e.target.value)} {...rest} />
      : <input id={id} className="mac-input" value={value ?? ''} onChange={e => onChange(e.target.value)} {...rest} />}
  </Field>
);

const Colour = ({ label, value, onChange }) => (
  <label className="ppf-colour">
    <input type="color" value={value} onChange={e => onChange(e.target.value)} />
    <span><b>{label}</b><em>{value.toUpperCase()}</em></span>
  </label>
);

// Section title, its name in the contents, and the show switch: the same three fields everywhere.
function SectionHead({ d, k, up, label, noToc }) {
  const s = d[k];
  return (
    <>
      <Toggle checked={s.show} onChange={x => up(`${k}.show`, x)}>Show the {label} page{k === 'fees' || k === 'payments' ? '' : 's'}</Toggle>
      {s.show && (
        <FormGrid>
          <Text label="Page heading" value={s.title} onChange={x => up(`${k}.title`, x)} maxLength={80} />
          {!noToc && <Text label="Name in the contents" value={s.toc} onChange={x => up(`${k}.toc`, x)} maxLength={80} />}
        </FormGrid>
      )}
    </>
  );
}

export default function ProposalBuilder() {
  const toast = useToast();
  const me = useMeSummary();
  const [d, setD] = useState(() => draft.load() || blankProposal());
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [step, setStepState] = useState(() => { try { const saved = sessionStorage.getItem('codelix.proposal.step'); return STEPS.some(x => x.id === saved) ? saved : 'cover'; } catch { return 'cover'; } });
  const setStep = s => { setStepState(s); try { sessionStorage.setItem('codelix.proposal.step', s); } catch { /* fine */ } };
  // Preview size: 'page' fits a whole page, 'width' fits the width, a number is a fixed zoom in %.
  const [zoom, setZoomState] = useState(() => { try { const z = localStorage.getItem('codelix.proposal.zoom'); return z === 'width' ? z : +z > 0 ? +z : 'page'; } catch { return 'page'; } });
  const setZoom = z => { setZoomState(z); try { localStorage.setItem('codelix.proposal.zoom', String(z)); } catch { /* fine */ } };
  const [box, setBox] = useState({ w: 600, h: 800 });
  const [info, setInfo] = useState({ pages: 0, overflow: [] });
  const [busy, setBusy] = useState(null);          // 'preview' | 'download' | 'save' while a PDF is being made
  const [progress, setProgress] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetAsk, setResetAsk] = useState(null);   // { keys, name } of a section to put back, or { all: true }
  const [preview, setPreview] = useState(null);
  const stage = useRef(null);
  const form = useRef(null);
  const printRef = useRef(null);
  const warned = useRef(false);

  useEffect(() => {
    if (document.getElementById('proposal-fonts')) return;
    const link = document.createElement('link');
    link.id = 'proposal-fonts'; link.rel = 'stylesheet'; link.href = FONT_LINK;
    document.head.appendChild(link);
  }, []);

  useEffect(() => { clientsDB.getAll().then(setClients).catch(() => {}).finally(() => setClientsLoading(false)); }, []);

  // "Make proposal" in the CRM opens this page with ?lead=<id>: everything the CRM knows about
  // that lead goes into the proposal. The rest of the draft (your wording, design) is kept.
  const [params, setParams] = useSearchParams();
  const leadId = params.get('lead');
  useEffect(() => {
    if (!leadId || !clients.length) return;
    const c = clients.find(x => String(x.id) === String(leadId));
    setParams({}, { replace: true });
    if (!c) { toast.error('That lead was not found', new Error('It may have been deleted. Fill in the client by hand.')); return; }
    setD(prev => fromLead(prev, c));
    toast.success(`Filled from the CRM lead ${c.companyName || c.clientName}`);
  }, [leadId, clients, setParams, toast]);

  // The page header stays on screen; the preview fills the rest of the window below it.
  const root = useRef(null);
  useEffect(() => {
    const el = root.current, head = document.querySelector('.page-header');
    if (!el || !head) return undefined;
    const fit = () => el.style.setProperty('--pp-head', `${Math.round(head.getBoundingClientRect().height)}px`);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(head);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!draft.save(d) && !warned.current) {
        warned.current = true;
        toast.error('This draft is too large to keep in the browser', new Error('Use smaller pictures, or download the PDF before leaving the page.'));
      }
    }, 500);
    return () => clearTimeout(t);
  }, [d, toast]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return undefined;
    const fit = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const up = useCallback((path, value) => setD(prev => setIn(prev, path, value)), []);
  const fitWidth = Math.max(0.12, (box.w - 32) / PAGE_W);
  const fitPage = Math.max(0.12, Math.min(fitWidth, (box.h - 32) / PAGE_H));
  const scale = zoom === 'page' ? fitPage : zoom === 'width' ? Math.min(1, fitWidth) : Math.min(1, Math.max(0.12, zoom / 100));
  const pct = Math.round(scale * 100);
  const ZOOMS = [15, 20, 25, 30, 35, 40, 50, 60, 70, 85, 100];
  const zoomBy = dir => setZoom(dir > 0 ? (ZOOMS.find(x => x > pct) || 100) : ([...ZOOMS].reverse().find(x => x < pct) || 15));

  // Follow the editing: bring the page (or the exact block) that the focused field changes into
  // view in the preview, and flash it once. Nothing moves while it is already on screen.
  const jump = useCallback(el => {
    const st = stage.current;
    const target = el?.closest?.('[data-target]')?.dataset.target;
    if (!st || !target) return;
    const blockName = el.closest('[data-block]')?.dataset.block;
    const block = blockName && st.querySelector(`.pp-pages [data-b="${blockName}"]`);
    const node = block || st.querySelector(`.pp-pages .pp-slot[data-sec="${target}"]`);
    if (!node) return;                                  // that part is hidden
    const sr = st.getBoundingClientRect(), r = node.getBoundingClientRect();
    const seen = block
      ? r.top >= sr.top + 4 && (r.bottom <= sr.bottom - 4 || r.top <= sr.top + sr.height * 0.4)
      : r.top < sr.top + sr.height * 0.5 && r.bottom > sr.top + sr.height * 0.5;
    if (seen) return;
    const top = st.scrollTop + r.top - sr.top - (block ? Math.max(24, sr.height * 0.18) : 12);
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    st.scrollTo({ top: Math.max(0, top), behavior: calm ? 'auto' : 'smooth' });
    const slot = node.closest('.pp-slot');
    if (slot && !calm) {
      slot.classList.remove('pp-flash');
      void slot.offsetWidth;                            // restart the animation
      slot.classList.add('pp-flash');
    }
  }, []);

  // Moving to another part of the form brings its page into view.
  useEffect(() => {
    const t = setTimeout(() => { const el = form.current?.querySelector('.sowf-page'); if (el) jump(el); }, 30);
    return () => clearTimeout(t);
  }, [step, jump]);
  const stepAt = STEPS.findIndex(x => x.id === step);
  const prevStep = STEPS[stepAt - 1], nextStep = STEPS[stepAt + 1];
  const goStep = s => { setStep(s); form.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  // Clicking a page in the preview opens its part of the form.
  const onStageClick = e => {
    const sec = e.target.closest?.('.pp-slot')?.dataset.sec;
    const to = STEP_OF_PAGE[sec];
    if (to && to !== step && !(sec === 'cover' && step === 'design') && !(sec === 'acceptance' && step === 'company')) setStep(to);
  };

  // Opening a form section (the event comes from Sec) also brings its page into view.
  useEffect(() => {
    const f = form.current;
    if (!f) return undefined;
    const onOpen = e => jump(e.target);
    f.addEventListener('sec-open', onOpen);
    return () => f.removeEventListener('sec-open', onOpen);
  }, [jump]);
  // While typing, wait for the pages to re-render (and maybe re-flow) before checking.
  const typing = useRef(0);
  const onType = e => { const el = e.target; clearTimeout(typing.current); typing.current = setTimeout(() => jump(el), 120); };
  const t = totals(d.fees);

  // ── timeline helpers ──
  const TU = unitOf(d.timeline);
  const DAYS = { day: 1, week: 7, month: 30.44 };
  // "10 Weeks" style durations follow the chart; anything else the user typed is left alone.
  const autoDuration = (tl, count, unit) => (/^\s*\d+\s*(days?|weeks?|months?)\s*$/i.test(tl.duration || '') || !tl.duration
    ? `${count} ${count === 1 ? UNITS[unit].name.slice(0, -1) : UNITS[unit].name}` : tl.duration);
  function setCount(v) {
    setD(prev => ({ ...prev, timeline: { ...prev.timeline, count: v, weeks: undefined, duration: +v > 0 ? autoDuration(prev.timeline, Math.round(+v), unitOf(prev.timeline).key) : prev.timeline.duration } }));
  }
  // Switching days / weeks / months converts the chart length and every work stream.
  function setUnit(unit) {
    setD(prev => {
      const old = unitOf(prev.timeline);
      if (old.key === unit) return prev;
      // Each unit remembers the plan it last had, so switching back (weeks → months → weeks)
      // gives the same plan again instead of a rounded one, as long as the streams are the same.
      const names = rows => (rows || []).map(r => r.name).join('\u0001');
      const saved = { ...(prev.timeline.saved || {}), [old.key]: { count: old.count, rows: prev.timeline.rows } };
      const back = saved[unit];
      if (back && names(back.rows) === names(prev.timeline.rows)) {
        return { ...prev, timeline: { ...prev.timeline, unit, count: back.count, weeks: undefined, rows: back.rows, saved, duration: autoDuration(prev.timeline, back.count, unit) } };
      }
      const k = DAYS[old.key] / DAYS[unit], max = UNITS[unit].max;
      const count = Math.min(max, Math.max(1, Math.ceil(old.count * k - 0.01)));
      const rows = (prev.timeline.rows || []).map(r => {
        const from = Math.min(count, Math.max(1, Math.floor(((+r.from || 1) - 1) * k) + 1));
        const to = Math.min(count, Math.max(from, Math.ceil((+r.to || +r.from || 1) * k - 0.01)));
        return { ...r, from, to };
      });
      return { ...prev, timeline: { ...prev.timeline, unit, count, weeks: undefined, rows, saved, duration: autoDuration(prev.timeline, count, unit) } };
    });
  }
  const nextStream = rows => {
    const last = rows[rows.length - 1];
    if (!last) return { name: '', from: 1, to: 2 };
    const from = Math.min(TU.max, (+last.to || +last.from || 0) + 1);
    const len = Math.max(0, (+last.to || 0) - (+last.from || 0));
    return { name: '', from, to: Math.min(TU.max, from + len) };
  };
  // When the end of a stream moves, the stream that started right after it moves with it (and so on).
  function setStreams(next) {
    const prev = d.timeline.rows || [];
    const rows = next.map(r => ({ ...r }));
    if (rows.length === prev.length) {
      for (let i = 0; i < rows.length - 1; i++) {
        const before = prev[i], now = rows[i], after = rows[i + 1], was = prev[i + 1];
        if (!before || !was || +before.to === +now.to || now.to === '') continue;
        if (+was.from === +before.to + 1 && +after.from === +was.from) {
          const len = Math.max(0, (+after.to || 0) - (+after.from || 0));
          after.from = Math.min(TU.max, +now.to + 1);
          after.to = Math.min(TU.max, after.from + len);
        }
      }
    }
    // A stream that runs past the end of the chart makes the chart longer.
    const end = Math.max(0, ...rows.map(r => +r.to || 0));
    setD(prev => {
      const tl = prev.timeline, cur = unitOf(tl).count;
      if (end <= cur) return { ...prev, timeline: { ...tl, rows } };
      const count = Math.min(TU.max, end);
      return { ...prev, timeline: { ...tl, rows, count, weeks: undefined, duration: autoDuration(tl, count, unitOf(tl).key) } };
    });
  }

  // Picking a CRM lead fills the proposal from it; typing only changes the name.
  const pickLead = c => { setD(prev => fromLead(prev, c)); toast.success(`Filled from the CRM lead ${c.companyName || c.clientName}`); };

  async function pickImage(file, key, opts) {
    if (!file) return;
    try { up(key, await shrinkImage(file, opts)); }
    catch (err) { toast.error('Could not use this image', err); }
  }

  const makePdf = useCallback(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    for (let i = 0; i < 4; i++) await frame();
    if (document.fonts?.ready) await document.fonts.ready;
    await frame();
    try {
      const nodes = Array.from(printRef.current?.querySelectorAll('.pp-page') || []);
      if (!nodes.length) throw new Error('There are no pages to export.');
      return await pagesToPdf(nodes, (n, of) => setProgress(`Page ${n} of ${of}`), { size: PDF_MM, scale: 1.5 });
    } finally {
      setProgress('');
    }
  }, []);

  async function run(kind) {
    if (busy) return;
    if (kind === 'save' && !d.client.name.trim()) { toast.error('Enter the client name first', new Error('The PDF is saved under that client in Client documents.')); return; }
    setBusy(kind);
    try {
      const blob = await makePdf();
      const name = pdfName(d);
      if (kind === 'preview') setPreview({ url: URL.createObjectURL(blob), blob, name });
      else if (kind === 'download') { downloadBlob(blob, name); toast.success('PDF downloaded'); }
      else {
        const stored = await uploadFile(new File([blob], name, { type: 'application/pdf' }));
        await documentsDB.add({
          id: stored.id, client: d.client.name.trim(), type: 'proposal', title: `Proposal · ${d.doc.number || d.cover.kicker || 'draft'}`,
          name: stored.name, size: stored.size, contentType: 'application/pdf', uploadedAt: new Date().toISOString(), uploadedBy: me.name,
        });
        toast.success(`Saved under ${d.client.name.trim()} in Client documents`);
      }
    } catch (err) {
      toast.error('Could not make the PDF', err);
    } finally {
      setBusy(null);
    }
  }

  const closePreview = () => { if (preview) URL.revokeObjectURL(preview.url); setPreview(null); };
  useEffect(() => {
    if (!preview) return undefined;
    const onKey = e => { if (e.key === 'Escape') { URL.revokeObjectURL(preview.url); setPreview(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const resetAll = () => { setD(blankProposal({ style: d.style, logo: d.logo, coverPhoto: d.coverPhoto, company: d.company })); toast.success('Started a new proposal with the design text'); };

  // Reset to default: one form section (the parts of the proposal it edits) or everything,
  // including colours, logo, cover photo and company details.
  const DEF = blankProposal();
  const SEC_KEYS = {
    design: ['style', 'logo', 'coverPhoto'], cover: ['client', 'doc', 'cover'], toc: ['toc'], letter: ['letter'], scope: ['scope'],
    inclusions: ['inclusions'], deliverables: ['deliverables'], timeline: ['timeline'], fees: ['fees'], payments: ['payments'],
    terms: ['terms'], acceptance: ['acceptance'], company: ['company'],
  };
  const changed = id => SEC_KEYS[id].some(k => JSON.stringify(d[k]) !== JSON.stringify(DEF[k]));
  const resetProps = (id, name) => ({ changed: changed(id), onReset: () => setResetAsk({ keys: SEC_KEYS[id], name }) });
  function doReset() {
    const fresh = blankProposal();
    if (resetAsk?.all) { setD(fresh); toast.success('Everything is back to the default design'); return; }
    setD(prev => resetAsk.keys.reduce((x, k) => ({ ...x, [k]: fresh[k] }), prev));
    toast.success(`${resetAsk.name} reset to default`);
  }

  const st = { ...DEFAULT_STYLE, ...d.style };
  const P = d.payments;
  const msSum = P.milestones.reduce((s, m) => s + (+m.percent || 0), 0);

  const actions = (
    <>
      <button className="mac-btn mac-btn-secondary" onClick={() => run('preview')} disabled={!!busy}><Eye size={15} /> Preview PDF</button>
      <button className="mac-btn mac-btn-primary" onClick={() => run('download')} disabled={!!busy}><Download size={15} /> Download PDF</button>
    </>
  );

  return (
    <div className="pp-builder" ref={root}>
      <Header title="Proposal" subtitle={`${info.pages || '…'} pages · ${money(t.total)} total · saved in this browser as you type`} actions={actions} />
      <div className="page-body">
        <div className="sow-bar">
          <Link to="/templates" className="mac-btn mac-btn-ghost"><ArrowLeft size={15} /> Templates</Link>
          <span className="sow-bar-gap" />
          <button className="mac-btn mac-btn-secondary" onClick={() => run('save')} disabled={!!busy}><FolderPlus size={15} /> Save to client documents</button>
          <button className="mac-btn mac-btn-ghost" onClick={() => setResetOpen(true)} disabled={!!busy}><RotateCcw size={15} /> New proposal</button>
          <button className="mac-btn mac-btn-ghost" onClick={() => setResetAsk({ all: true })} disabled={!!busy}><RotateCcw size={15} /> Reset everything to default</button>
        </div>

        {info.overflow.length > 0 && (
          <div className="ppf-warn" role="status">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>Page {info.overflow.join(', ')} {info.overflow.length === 1 ? 'has' : 'have'} one block that is taller than a page. Shorten that text or split it into two items.</span>
          </div>
        )}

        <div className="sow-layout">
          <div className="sow-form" ref={form} onFocus={e => jump(e.target)} onInput={onType} onChange={onType}>
            <nav className="ppf-steps" aria-label="Parts of the proposal">
              {STEPS.map((x, i) => {
                const off = x.show && !d[x.show]?.show;
                return (
                  <button key={x.id} type="button" className={`ppf-step ${x.id === step ? 'on' : ''} ${off ? 'off' : ''}`} aria-current={x.id === step ? 'step' : undefined}
                    onClick={() => setStep(x.id)} title={off ? `${x.label} (hidden in the PDF)` : x.label}>
                    <span className="ppf-step-n">{i + 1}</span>{x.label}
                  </button>
                );
              })}
            </nav>
            <Sec step={step} id="design" target="cover" title="Design" {...resetProps('design', 'Design')} open>
              <div>
                <span className="field-label">Colour set</span>
                <div className="ppf-presets">
                  {STYLE_PRESETS.map(p => {
                    const on = ['accent', 'text', 'heading', 'tint'].every(k => String(st[k]).toLowerCase() === p[k].toLowerCase());
                    return (
                      <button key={p.name} type="button" className={`ppf-preset ${on ? 'on' : ''}`} aria-pressed={on}
                        onClick={() => up('style', { ...st, accent: p.accent, text: p.text, heading: p.heading, tint: p.tint })}>
                        <span style={{ background: `linear-gradient(135deg, #fff, ${p.tint})` }}><i style={{ background: p.accent }} /><i style={{ background: p.text }} /><i style={{ background: p.heading }} /></span>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="ppf-colours">
                <Colour label="Accent" value={st.accent} onChange={x => up('style.accent', x)} />
                <Colour label="Text" value={st.text} onChange={x => up('style.text', x)} />
                <Colour label="Headings" value={st.heading} onChange={x => up('style.heading', x)} />
                <Colour label="Background" value={st.tint} onChange={x => up('style.tint', x)} />
              </div>
              <Field label="Font" hint="The design uses SF Pro, which only Apple devices have. Inter looks almost the same on every computer.">
                {id => <select id={id} className="mac-select" value={st.font} onChange={e => up('style.font', e.target.value)}>
                  {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}
                </select>}
              </Field>
              <ImagePick wide label="Cover photo" hint={d.coverPhoto === 'none' ? 'No photo on the cover.' : d.coverPhoto ? 'Your photo, faded on the left so the title stays readable.' : 'The construction photo from the design.'}
                value={d.coverPhoto && d.coverPhoto !== 'none' ? d.coverPhoto : ''} onPick={f => pickImage(f, 'coverPhoto', { max: 1800 })}
                onClear={d.coverPhoto === 'none' ? () => up('coverPhoto', '') : () => up('coverPhoto', d.coverPhoto ? '' : 'none')}
                clearLabel={d.coverPhoto === 'none' ? 'Use the design photo' : d.coverPhoto ? 'Use the design photo' : 'No photo'} />
              {d.coverPhoto && d.coverPhoto !== 'none' && <button type="button" className="mac-btn mac-btn-ghost sowf-add" onClick={() => up('coverPhoto', 'none')}>No photo at all</button>}
              <ImagePick label="Logo" hint="The Codelix logo is used unless you choose another." value={d.logo} onPick={f => pickImage(f, 'logo', { max: 700, png: true })} onClear={d.logo ? () => up('logo', '') : null} />
            </Sec>

            <Sec step={step} id="cover" target="cover" title="Client and cover" {...resetProps('cover', 'Client and cover')} open>
              <Field label="Client (company)" required hint="Shown on the cover, in the subject line and in the signature box.">
                {id => <>
                  <LeadPicker id={id} value={d.client.name} leads={clients} loading={clientsLoading} onType={x => up('client.name', x)} onPick={pickLead} />
                </>}
              </Field>
              <FormGrid>
                <Text label="Contact person" value={d.client.contact} onChange={x => up('client.contact', x)} placeholder="Signs for the client" />
                <Text label="Their designation" value={d.client.designation} onChange={x => up('client.designation', x)} placeholder="e.g. Director" />
                <Text label="Proposal number" value={d.doc.number} onChange={x => up('doc.number', x)} maxLength={30} />
                <Field label="Date">{id => <input id={id} className="mac-input" type="date" value={d.doc.date} onChange={e => up('doc.date', e.target.value)} />}</Field>
                <Field label="Valid till">{id => <input id={id} className="mac-input" type="date" value={d.doc.validUntil} onChange={e => up('doc.validUntil', e.target.value)} />}</Field>
              </FormGrid>
              <FormGrid>
                <Text label="Line above the title" value={d.cover.kicker} onChange={x => up('cover.kicker', x)} maxLength={60} />
                <Text label="Title" value={d.cover.title} onChange={x => up('cover.title', x)} maxLength={20} />
                <Text label="“Prepared for” text" value={d.cover.prepared} onChange={x => up('cover.prepared', x)} maxLength={40} />
                <Text label="“Date” label" value={d.cover.dateLabel} onChange={x => up('cover.dateLabel', x)} maxLength={20} />
                <Text label="“Proposal No.” label" value={d.cover.numberLabel} onChange={x => up('cover.numberLabel', x)} maxLength={20} />
              </FormGrid>
              <Toggle checked={d.cover.showGstin} onChange={x => up('cover.showGstin', x)}>Show our GSTIN at the bottom of the cover</Toggle>
            </Sec>

            <Sec step={step} id="toc" target="toc" title="Contents page" {...resetProps('toc', 'Contents page')}>
              <Toggle checked={d.toc.show} onChange={x => up('toc.show', x)}>Show the contents page</Toggle>
              {d.toc.show && <Text label="Heading" value={d.toc.title} onChange={x => up('toc.title', x)} maxLength={40} hint="Page numbers are filled in by themselves." />}
            </Sec>

            <Sec step={step} id="letter" target="letter" title="Letter of intent" {...resetProps('letter', 'Letter of intent')}>
              <SectionHead d={d} k="letter" up={up} label="letter of intent" />
              {d.letter.show && <>
                <FormGrid>
                  <Text label="“Date:” label" value={d.letter.dateLabel} onChange={x => up('letter.dateLabel', x)} maxLength={20} />
                  <Text label="“Subject:” label" value={d.letter.subjectLabel} onChange={x => up('letter.subjectLabel', x)} maxLength={20} />
                </FormGrid>
                <Text label="Subject" hint="The client's name is added after it in bold." value={d.letter.subject} onChange={x => up('letter.subject', x)} maxLength={120} />
                <Text area rows={10} label="Letter" hint="Leave an empty line between paragraphs." value={d.letter.body} onChange={x => up('letter.body', x)} />
              </>}
            </Sec>

            <Sec step={step} id="scope" target="scope" title="Scope of professional services" {...resetProps('scope', 'Scope')}>
              <SectionHead d={d} k="scope" up={up} label="scope" />
              {d.scope.show && <>
                <Text area rows={3} label="Opening line" value={d.scope.intro} onChange={x => up('scope.intro', x)} />
                <span className="field-label">Groups</span>
                <Rows name="Group" move block={i => `scope-g${i}`} rows={d.scope.groups} onChange={x => up('scope.groups', x)} blank={{ title: '', items: '' }} addLabel="Add group"
                  cols={[{ k: 'title', label: 'Heading, e.g. 2.4 Mobile app' }, { k: 'items', label: 'Points, one per line', area: true, rows: 4 }]} />
              </>}
            </Sec>

            <Sec step={step} id="inclusions" target="inclusions" title="Additional inclusions" {...resetProps('inclusions', 'Additional inclusions')}>
              <SectionHead d={d} k="inclusions" up={up} label="additional inclusions" />
              {d.inclusions.show && <Rows name="Inclusion" move block={i => `inc-${i}`} rows={d.inclusions.items} onChange={x => up('inclusions.items', x)} blank={{ title: '', text: '' }} addLabel="Add inclusion"
                cols={[{ k: 'title', label: 'Title' }, { k: 'text', label: 'Details', area: true }]} />}
            </Sec>

            <Sec step={step} id="deliverables" target="deliverables" title="Deliverables" {...resetProps('deliverables', 'Deliverables')}>
              <SectionHead d={d} k="deliverables" up={up} label="deliverables" />
              {d.deliverables.show && <Rows name="Deliverable" move block={i => `del-${i}`} rows={d.deliverables.items} onChange={x => up('deliverables.items', x)} blank={{ title: '', text: '' }} addLabel="Add deliverable"
                cols={[{ k: 'title', label: 'Title' }, { k: 'text', label: 'Details', area: true, rows: 3 }]} />}
            </Sec>

            <Sec step={step} id="timeline" target="timeline" title="Project timeline" {...resetProps('timeline', 'Project timeline')}>
              <SectionHead d={d} k="timeline" up={up} label="timeline" />
              {d.timeline.show && <>
                <FormGrid>
                  <Text label="Duration label" value={d.timeline.durationLabel} onChange={x => up('timeline.durationLabel', x)} maxLength={40} />
                  <Text label="Duration" value={d.timeline.duration} onChange={x => up('timeline.duration', x)} maxLength={30} />
                </FormGrid>
                <Text area rows={4} label="Text above the chart" value={d.timeline.intro} onChange={x => up('timeline.intro', x)} />
                <FormGrid>
                  <Text label="Chart heading" value={d.timeline.chartTitle} onChange={x => up('timeline.chartTitle', x)} maxLength={60} />
                  <Text label="Legend" value={d.timeline.legend} onChange={x => up('timeline.legend', x)} maxLength={24} />
                  <Text label="First column" value={d.timeline.firstColumn} onChange={x => up('timeline.firstColumn', x)} maxLength={24} />
                  <Field label="Chart shows">
                    {id => <select id={id} className="mac-select" value={TU.key} onChange={e => setUnit(e.target.value)}>
                      {Object.entries(UNITS).map(([k, u]) => <option key={k} value={k}>{u.name}</option>)}
                    </select>}
                  </Field>
                  <Field label={`${TU.name} in the chart`} hint={`1 to ${TU.max}`}>
                    {id => <input id={id} className="mac-input" type="number" min="1" max={TU.max} value={d.timeline.count ?? ''} onChange={e => setCount(e.target.value)} />}
                  </Field>
                </FormGrid>
                {TU.key === 'week' && TU.count > 12 && (
                  <p className="ppf-tip">More than 12 weeks reads better in months. <button type="button" className="mac-btn mac-btn-ghost" onClick={() => setUnit('month')}>Show months</button></p>
                )}
                {TU.key === 'day' && TU.count > 21 && (
                  <p className="ppf-tip">That many days reads better in weeks. <button type="button" className="mac-btn mac-btn-ghost" onClick={() => setUnit('week')}>Show weeks</button></p>
                )}
                <span className="field-label">Work streams</span>
                <span className="field-hint">A new work stream starts right after the one above it, and moving the end of one moves the start of the next.</span>
                <Rows name="Work stream" move block={() => 'tl-chart'} rows={d.timeline.rows} onChange={setStreams} blank={nextStream} addLabel="Add work stream"
                  cols={[{ k: 'name', label: 'Work stream' }, { k: 'from', label: `From ${TU.one}`, num: true, w: 96 }, { k: 'to', label: `To ${TU.one}`, num: true, w: 96 },
                    { k: 'note', label: `Small line under it (optional, e.g. ${TU.p}1-${TU.p}2 (2 ${TU.many}))` }]} />
              </>}
            </Sec>

            <Sec step={step} id="fees" target="fees" title="Commercial terms: fees" {...resetProps('fees', 'Fees')}>
              <SectionHead d={d} k="fees" up={up} label="fees" />
              {d.fees.show && <>
                <Text label="Validity line" hint="The “Valid till” date is added after it." value={d.fees.validText} onChange={x => up('fees.validText', x)} maxLength={80} />
                <FormGrid>
                  <Text label="First column" value={d.fees.colName} onChange={x => up('fees.colName', x)} maxLength={30} />
                  <Text label="Amount column" value={d.fees.colFee} onChange={x => up('fees.colFee', x)} maxLength={20} />
                </FormGrid>
                <Rows name="Fee" move block={() => 'fee-table'} rows={d.fees.rows} onChange={x => up('fees.rows', x)} blank={{ name: '', amount: '' }} addLabel="Add fee"
                  cols={[{ k: 'name', label: 'Service' }, { k: 'amount', label: 'Amount (₹)', num: true, w: 130 }]} />
                <Toggle checked={d.fees.gst} onChange={x => up('fees.gst', x)}>Add GST</Toggle>
                <FormGrid>
                  {d.fees.gst && <Field label="GST %">{id => <input id={id} className="mac-input" type="number" min="0" max="28" value={d.fees.gstRate} onChange={e => up('fees.gstRate', e.target.value)} />}</Field>}
                  <Text label="Sub total label" value={d.fees.subLabel} onChange={x => up('fees.subLabel', x)} maxLength={24} />
                  {d.fees.gst && <Text label="GST label" value={d.fees.gstLabel} onChange={x => up('fees.gstLabel', x)} maxLength={24} />}
                  <Text label="Total label" value={d.fees.totalLabel} onChange={x => up('fees.totalLabel', x)} maxLength={24} />
                </FormGrid>
                <p className="ppf-sum">Sub total {money(t.sub)}{d.fees.gst ? ` · GST ${money(t.gst)}` : ''} · Total <b>{money(t.total)}</b></p>
              </>}
            </Sec>

            <Sec step={step} id="payments" target="payments" title="Commercial terms: payments" {...resetProps('payments', 'Payments')}>
              <SectionHead d={d} k="payments" up={up} label="payment" noToc />
              {P.show && <>
                <FormGrid>
                  <Text label="Heading" value={P.heading} onChange={x => up('payments.heading', x)} maxLength={40} />
                  <Text label="Note on the right" value={P.note} onChange={x => up('payments.note', x)} maxLength={50} />
                </FormGrid>
                <span className="field-label">Milestones (amounts come from the sub total)</span>
                <Rows name="Milestone" move block={() => 'pay-cards'} rows={P.milestones} onChange={x => up('payments.milestones', x)} blank={{ label: '', percent: '', text: '' }} addLabel="Add milestone"
                  cols={[{ k: 'label', label: 'Name under the bar' }, { k: 'percent', label: '%', num: true, w: 70 }, { k: 'text', label: 'When it is paid', area: true }]} />
                {msSum !== 100 && P.milestones.length > 0 && <span className="field-error" role="alert">The milestones add up to {msSum}%, not 100%.</span>}

                <Toggle checked={P.support.show} onChange={x => up('payments.support.show', x)}>Show the support box</Toggle>
                {P.support.show && <FormGrid>
                  <Text label="Support title" value={P.support.title} onChange={x => up('payments.support.title', x)} maxLength={40} />
                  <Text label="Green tag" value={P.support.badge} onChange={x => up('payments.support.badge', x)} maxLength={14} />
                  <Text area rows={2} span={2} label="Support text" value={P.support.text} onChange={x => up('payments.support.text', x)} />
                </FormGrid>}
                <Toggle checked={P.amc.show} onChange={x => up('payments.amc.show', x)}>Show the maintenance (AMC) box</Toggle>
                {P.amc.show && <FormGrid>
                  <Text label="AMC title" value={P.amc.title} onChange={x => up('payments.amc.title', x)} maxLength={40} />
                  <Text label="Price" value={P.amc.price} onChange={x => up('payments.amc.price', x)} maxLength={24} />
                  <Text area rows={2} span={2} label="AMC text" value={P.amc.text} onChange={x => up('payments.amc.text', x)} />
                </FormGrid>}

                <Toggle checked={P.showTerms} onChange={x => up('payments.showTerms', x)}>Show terms and exclusions</Toggle>
                {P.showTerms && <>
                  <Text label="Left heading" value={P.termsTitle} onChange={x => up('payments.termsTitle', x)} maxLength={30} />
                  <Rows name="Term" move block={() => 'pay-terms'} rows={P.terms} onChange={x => up('payments.terms', x)} blank={{ label: '', text: '' }} addLabel="Add term"
                    cols={[{ k: 'label', label: 'Label, e.g. Payment Terms:', w: 170 }, { k: 'text', label: 'Text' }]} />
                  <Text label="Right heading" value={P.exclusionsTitle} onChange={x => up('payments.exclusionsTitle', x)} maxLength={30} />
                  <Rows name="Exclusion" move block={() => 'pay-terms'} rows={P.exclusions} onChange={x => up('payments.exclusions', x)} blank={{ label: '', text: '' }} addLabel="Add exclusion"
                    cols={[{ k: 'label', label: 'Label, e.g. Infrastructure:', w: 170 }, { k: 'text', label: 'Text' }]} />
                </>}
              </>}
            </Sec>

            <Sec step={step} id="terms" target="terms" title="Terms & conditions" {...resetProps('terms', 'Terms & conditions')}>
              <SectionHead d={d} k="terms" up={up} label="terms & conditions" />
              {d.terms.show && <Rows name="Term" move block={i => `tc-${i}`} rows={d.terms.items} onChange={x => up('terms.items', x)} blank={{ title: '', text: '' }} addLabel="Add term"
                cols={[{ k: 'title', label: 'Heading, e.g. 7.4 Confidentiality' }, { k: 'text', label: 'Text', area: true, rows: 4 }]} />}
            </Sec>

            <Sec step={step} id="acceptance" target="acceptance" title="Acceptance and signatures" {...resetProps('acceptance', 'Acceptance')}>
              <SectionHead d={d} k="acceptance" up={up} label="acceptance" />
              {d.acceptance.show && <>
                <Text area rows={3} label="Opening paragraph" value={d.acceptance.intro} onChange={x => up('acceptance.intro', x)} />
                <Text area rows={2} label="Line before the points" value={d.acceptance.confirm} onChange={x => up('acceptance.confirm', x)} />
                <Text area rows={4} label="Points" hint="One per line." value={d.acceptance.points} onChange={x => up('acceptance.points', x)} />
                <FormGrid>
                  <Text label="Client box heading" value={d.acceptance.clientTitle} onChange={x => up('acceptance.clientTitle', x)} maxLength={40} />
                  <Text label="Our box heading" value={d.acceptance.ourTitle} onChange={x => up('acceptance.ourTitle', x)} maxLength={40} />
                  <Text label="Text in the signature space" value={d.acceptance.signHint} onChange={x => up('acceptance.signHint', x)} maxLength={60} />
                  <Field label="Client signing date" hint="Empty prints DD/MM/YYYY.">{id => <input id={id} className="mac-input" type="date" value={d.acceptance.clientDate} onChange={e => up('acceptance.clientDate', e.target.value)} />}</Field>
                  <Text label="Name label" value={d.acceptance.nameLabel} onChange={x => up('acceptance.nameLabel', x)} maxLength={24} />
                  <Text label="Designation label" value={d.acceptance.designationLabel} onChange={x => up('acceptance.designationLabel', x)} maxLength={24} />
                  <Text label="Company label" value={d.acceptance.companyLabel} onChange={x => up('acceptance.companyLabel', x)} maxLength={24} />
                  <Text label="Date label" value={d.acceptance.dateLabel} onChange={x => up('acceptance.dateLabel', x)} maxLength={24} />
                </FormGrid>
              </>}
            </Sec>

            <Sec step={step} id="company" target="acceptance" title="Our company and footer" {...resetProps('company', 'Company and footer')}>
              <FormGrid>
                <Text label="Company name" value={d.company.name} onChange={x => up('company.name', x)} maxLength={80} />
                <Text label="GSTIN" value={d.company.gstin} onChange={x => up('company.gstin', x)} maxLength={20} />
                <Text label="Signed by" value={d.company.signatory} onChange={x => up('company.signatory', x)} maxLength={60} />
                <Text label="Their designation" value={d.company.signatoryTitle} onChange={x => up('company.signatoryTitle', x)} maxLength={60} />
              </FormGrid>
              <Text label="Footer line on every page" value={d.company.footer} onChange={x => up('company.footer', x)} maxLength={70} />
              <ImagePick label="Signature" hint="Optional. A picture of the signature, placed in our signature box." value={d.company.signature}
                onPick={f => pickImage(f, 'company.signature', { max: 600, png: true })} onClear={d.company.signature ? () => up('company.signature', '') : null} />
            </Sec>
            <div className="ppf-stepnav">
              {prevStep ? <button type="button" className="mac-btn mac-btn-secondary" onClick={() => goStep(prevStep.id)}><ArrowLeft size={15} /> {prevStep.label}</button> : <span />}
              {nextStep ? <button type="button" className="mac-btn mac-btn-primary" onClick={() => goStep(nextStep.id)}>{nextStep.label} <ArrowRight size={15} /></button>
                : <button type="button" className="mac-btn mac-btn-primary" onClick={() => run('download')} disabled={!!busy}><Download size={15} /> Download PDF</button>}
            </div>
          </div>

          <div className="sow-stage-wrap" onClick={onStageClick}>
            <div className="ppf-zoom" role="toolbar" aria-label="Preview size">
              <button type="button" className="icon-btn plain" onClick={() => zoomBy(-1)} disabled={pct <= 15} aria-label="Smaller"><ZoomOut size={15} /></button>
              <span className="ppf-zoom-pct" aria-live="polite">{pct}%</span>
              <button type="button" className="icon-btn plain" onClick={() => zoomBy(1)} disabled={pct >= 100} aria-label="Bigger"><ZoomIn size={15} /></button>
              <span className="ppf-zoom-gap" />
              <button type="button" className={`mac-btn mac-btn-ghost ${zoom === 'page' ? 'on' : ''}`} aria-pressed={zoom === 'page'} onClick={() => setZoom('page')}>Whole page</button>
              <button type="button" className={`mac-btn mac-btn-ghost ${zoom === 'width' ? 'on' : ''}`} aria-pressed={zoom === 'width'} onClick={() => setZoom('width')}>Fit width</button>
            </div>
            <div className="sow-stage" ref={stage}>
              <ProposalDocument d={d} scale={scale} onInfo={setInfo} />
            </div>
            {busy && (
              <div className="sow-busy" role="status">
                <span className="sow-busy-box"><span className="sow-spin" aria-hidden="true" /> Making the PDF{progress ? ` · ${progress}` : '…'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {busy && <div className="pp-print" aria-hidden="true"><ProposalDocument d={d} scale={1} docRef={printRef} /></div>}

      {preview && (
        <div className="sow-pdf" role="dialog" aria-modal="true" aria-label="PDF preview">
          <div className="sow-pdf-bar">
            <span className="sow-pdf-name">{preview.name}</span>
            <button className="mac-btn mac-btn-primary" onClick={() => { downloadBlob(preview.blob, preview.name); toast.success('PDF downloaded'); }}><Download size={15} /> Download</button>
            <button className="mac-btn mac-btn-secondary" onClick={closePreview} autoFocus><X size={15} /> Close</button>
          </div>
          <iframe className="sow-pdf-frame" src={preview.url} title="PDF preview" />
        </div>
      )}

      <ConfirmDialog isOpen={!!resetAsk} onClose={() => setResetAsk(null)} onConfirm={doReset}
        title={resetAsk?.all ? 'Reset everything to default?' : `Reset ${resetAsk?.name || ''} to default?`} confirmLabel="Reset"
        message={resetAsk?.all
          ? 'Every page goes back to the Codelix design: all text, the client, colours, font, logo, cover photo and company details. It cannot be undone.'
          : `Only the ${String(resetAsk?.name || '').toLowerCase()} part goes back to the text from the design. Everything else stays as it is. It cannot be undone.`} />

      <ConfirmDialog isOpen={resetOpen} onClose={() => setResetOpen(false)} onConfirm={resetAll} title="Start a new proposal?" confirmLabel="Start new"
        message="This puts back the text from the design and clears the client. Your colours, logo, cover photo and company details are kept. It cannot be undone." />
    </div>
  );
}
