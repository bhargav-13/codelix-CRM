// Scope of Work builder: fill the form on the left, see the real pages on the right, then turn them into a PDF.
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Field, FormGrid, useToast } from '../components/ui/kit';
import { useMeSummary } from '../components/layout/shell';
import SowDocument from '../components/sow/SowDocument';
import { clientsDB, projectsDB } from '../lib/db';
import { uploadFile } from '../lib/files';
import { documentsDB } from '../lib/documents';
import { pagesToPdf, downloadBlob } from '../lib/pdf';
import { THEMES, ACCENTS, FONTS, FONT_LINK, PAGE_W, themeOf, palette, blankSow, draft, shrinkImage, pdfName } from '../lib/sow';
import { ArrowLeft, Download, Eye, FolderPlus, Plus, X, ImagePlus, Trash2, RotateCcw, Check } from 'lucide-react';
import './SowBuilder.css';

// ── small form pieces ───────────────────────────────────────────
const Sec = ({ title, open, children }) => (
  <details className="sowf-sec" open={open}>
    <summary>{title}</summary>
    <div className="sowf-body">{children}</div>
  </details>
);

function TextList({ label, items, onChange, placeholder, addLabel = 'Add' }) {
  const set = (i, v) => onChange(items.map((x, j) => (j === i ? v : x)));
  return (
    <div className="sowf-list">
      {label && <span className="field-label">{label}</span>}
      {items.map((x, i) => (
        <div key={i} className="sowf-line">
          <input className="mac-input" value={x} onChange={e => set(i, e.target.value)} placeholder={placeholder} aria-label={`${label || 'Item'} ${i + 1}`} />
          <button type="button" className="icon-btn plain" aria-label={`Remove item ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><X size={15} /></button>
        </div>
      ))}
      <button type="button" className="mac-btn mac-btn-ghost sowf-add" onClick={() => onChange([...items, ''])}><Plus size={14} /> {addLabel}</button>
    </div>
  );
}

// cols: [{ k, label, area, num }]
function Rows({ rows, onChange, cols, blank, addLabel, name }) {
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="sowf-list">
      {rows.map((r, i) => (
        <div key={i} className="sowf-row">
          <div className="sowf-row-fields">
            {cols.map(c => c.area
              ? <textarea key={c.k} className="mac-input" rows={2} value={r[c.k] ?? ''} onChange={e => set(i, c.k, e.target.value)} placeholder={c.label} aria-label={`${name} ${i + 1}: ${c.label}`} />
              : <input key={c.k} className="mac-input" type={c.num ? 'number' : 'text'} min={c.num ? 0 : undefined} value={r[c.k] ?? ''} onChange={e => set(i, c.k, e.target.value)}
                  placeholder={c.label} aria-label={`${name} ${i + 1}: ${c.label}`} style={c.w ? { flex: `0 0 ${c.w}px` } : undefined} />)}
          </div>
          <button type="button" className="icon-btn plain" aria-label={`Remove ${name} ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}><X size={15} /></button>
        </div>
      ))}
      <button type="button" className="mac-btn mac-btn-ghost sowf-add" onClick={() => onChange([...rows, { ...blank }])}><Plus size={14} /> {addLabel}</button>
    </div>
  );
}

function ImagePick({ label, hint, value, onPick, onClear, wide }) {
  const input = useRef(null);
  return (
    <div className="sowf-img">
      <span className={`sowf-img-box ${wide ? 'wide' : ''}`} style={value ? { backgroundImage: `url("${value}")` } : undefined}>{!value && <ImagePlus size={18} aria-hidden="true" />}</span>
      <span className="sowf-img-text">
        <span className="field-label">{label}</span>
        <span className="field-hint">{hint}</span>
        <span className="sowf-img-actions">
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => input.current?.click()}>{value ? 'Change' : 'Choose image'}</button>
          {value && <button type="button" className="mac-btn mac-btn-ghost" onClick={onClear}><Trash2 size={14} /> Remove</button>}
        </span>
      </span>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

const Toggle = ({ checked, onChange, children }) => (
  <label className="sowf-toggle"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /> <span>{children}</span></label>
);

// A tiny picture of each design for the picker
function ThemeTile({ t, active, onPick }) {
  const v = palette(t.accent);
  const dark = ['aurora', 'grid'].includes(t.cover);
  const bg = t.cover === 'aurora' ? `linear-gradient(140deg, ${v['--a-deep']}, ${v['--a-dark']})`
    : t.cover === 'grid' ? v['--a-deep'] : t.cover === 'editorial' ? '#faf7f2' : t.cover === 'wave' ? v['--a-soft'] : '#fff';
  return (
    <button type="button" className={`sowf-theme ${active ? 'on' : ''}`} onClick={() => onPick(t)} aria-pressed={active} title={`${t.name}: ${t.note}`}>
      <span className="sowf-theme-art" data-cover={t.cover} style={{ background: bg, '--a': t.accent, '--a-dark': v['--a-dark'], '--a-soft2': v['--a-soft2'] }}>
        <i className="s1" /><i className="s2" />
        <b style={{ background: dark ? '#fff' : '#0f172a' }} /><b className="short" style={{ background: dark ? 'rgba(255,255,255,.6)' : t.accent }} />
        {active && <span className="sowf-theme-check"><Check size={11} /></span>}
      </span>
      <span className="sowf-theme-name">{t.name}</span>
      <span className="sowf-theme-note">{t.note}</span>
    </button>
  );
}

export default function SowBuilder() {
  const toast = useToast();
  const me = useMeSummary();
  const [d, setD] = useState(() => draft.load() || blankSow());
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [scale, setScale] = useState(0.6);
  const [pageCount, setPageCount] = useState(1);
  const [busy, setBusy] = useState(null);          // 'preview' | 'download' | 'save' while a PDF is being made
  const [progress, setProgress] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [preview, setPreview] = useState(null);    // { url, blob, name } of the PDF being shown
  const stage = useRef(null);
  const printRef = useRef(null);                   // the full-size copy the PDF is made from
  const warned = useRef(false);

  // The extra fonts the designs use are only needed on this page.
  useEffect(() => {
    if (document.getElementById('sow-fonts')) return;
    const link = document.createElement('link');
    link.id = 'sow-fonts'; link.rel = 'stylesheet'; link.href = FONT_LINK;
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    projectsDB.getAll().then(setProjects).catch(() => {});
    clientsDB.getAll().then(setClients).catch(() => {});
  }, []);

  // Keep what is being written, so closing the tab does not lose it.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!draft.save(d) && !warned.current) {
        warned.current = true;
        toast.error('This draft is too large to keep in the browser', new Error('Use a smaller cover photo, or download the PDF before leaving the page.'));
      }
    }, 500);
    return () => clearTimeout(t);
  }, [d, toast]);

  // Fit the pages to the width of the preview column.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => setScale(Math.max(0.3, Math.min(1, (el.clientWidth - 32) / PAGE_W)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const up = (path, value) => setD(prev => {
    const [a, b] = path.split('.');
    return b ? { ...prev, [a]: { ...prev[a], [b]: value } } : { ...prev, [a]: value };
  });
  const th = themeOf(d.theme);
  const accent = d.accent || th.accent;

  function fillFromProject(id) {
    const p = projects.find(x => String(x.id) === String(id));
    if (!p) return;
    const c = clients.find(x => [x.clientName, x.companyName].some(n => n && String(n).trim().toLowerCase() === String(p.clientName || '').trim().toLowerCase()));
    setD(prev => ({
      ...prev,
      client: { ...prev.client, name: c?.companyName || p.clientName || prev.client.name, contact: c?.clientName && c.companyName ? c.clientName : prev.client.contact,
        email: c?.email || prev.client.email, phone: c?.contact || prev.client.phone, address: c?.address || prev.client.address },
      project: { ...prev.project, title: p.name || p.projectName || prev.project.title },
      pricing: { ...prev.pricing, total: p.valuation ? String(p.valuation) : prev.pricing.total, gst: p.billingType ? p.billingType !== 'Without GST' : prev.pricing.gst,
        schedule: (p.milestones || []).length ? p.milestones.map(m => ({ label: m.label, percent: m.percent, when: '' })) : prev.pricing.schedule },
    }));
    toast.success('Filled from the project');
  }

  async function pickImage(file, key, opts) {
    if (!file) return;
    try { up(key, await shrinkImage(file, opts)); }
    catch (err) { toast.error('Could not use this image', err); }
  }

  // The PDF is made from a second, full-size copy of the pages kept off screen while `busy` is set
  // (the preview is shrunk to fit, and a shrunk page does not convert cleanly).
  const makePdf = useCallback(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    for (let i = 0; i < 4; i++) await frame();          // the copy mounts, measures itself and settles into pages
    if (document.fonts?.ready) await document.fonts.ready;
    await frame();
    try {
      const nodes = Array.from(printRef.current?.querySelectorAll('.sow-pages .sow-page') || []);
      if (!nodes.length) throw new Error('There are no pages to export.');
      return await pagesToPdf(nodes, (n, of) => setProgress(`Page ${n} of ${of}`));
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
      if (kind === 'preview') {
        setPreview({ url: URL.createObjectURL(blob), blob, name });
      } else if (kind === 'download') {
        downloadBlob(blob, name);
        toast.success('PDF downloaded');
      } else {
        const stored = await uploadFile(new File([blob], name, { type: 'application/pdf' }));
        await documentsDB.add({
          id: stored.id, client: d.client.name.trim(), type: 'sow', title: `SOW · ${d.project.title || 'Project'}${d.doc.version ? ` · v${d.doc.version}` : ''}`,
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
    if (!preview) return;
    const onKey = e => { if (e.key === 'Escape') { URL.revokeObjectURL(preview.url); setPreview(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const resetAll = () => { setD(blankSow({ theme: d.theme, accent: d.accent, font: d.font, logo: d.logo, company: d.company })); toast.success('Started a new SOW'); };

  const actions = (
    <>
      <button className="mac-btn mac-btn-secondary" onClick={() => run('preview')} disabled={!!busy}><Eye size={15} /> Preview PDF</button>
      <button className="mac-btn mac-btn-primary" onClick={() => run('download')} disabled={!!busy}><Download size={15} /> Download PDF</button>
    </>
  );

  return (
    <div>
      <Header title="Scope of work" subtitle={`${th.name} design · ${pageCount} page${pageCount === 1 ? '' : 's'} · saved in this browser as you type`} actions={actions} />
      <div className="page-body">
        <div className="sow-bar">
          <Link to="/templates" className="mac-btn mac-btn-ghost"><ArrowLeft size={15} /> Templates</Link>
          <span className="sow-bar-gap" />
          <button className="mac-btn mac-btn-secondary" onClick={() => run('save')} disabled={!!busy}><FolderPlus size={15} /> Save to client documents</button>
          <button className="mac-btn mac-btn-ghost" onClick={() => setResetOpen(true)} disabled={!!busy}><RotateCcw size={15} /> New SOW</button>
        </div>

        <div className="sow-layout">
          <div className="sow-form">
            <Sec title="Design" open>
              <div className="sowf-themes">
                {THEMES.map(t => <ThemeTile key={t.id} t={t} active={t.id === d.theme} onPick={x => setD(p => ({ ...p, theme: x.id, accent: '', font: '' }))} />)}
              </div>
              <div>
                <span className="field-label">Colour</span>
                <div className="sowf-swatches">
                  {ACCENTS.map(c => (
                    <button key={c} type="button" className={`sowf-swatch ${accent.toLowerCase() === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={accent.toLowerCase() === c} onClick={() => up('accent', c)} />
                  ))}
                  <label className="sowf-swatch custom" title="Any colour"><input type="color" value={accent} onChange={e => up('accent', e.target.value)} aria-label="Any colour" /></label>
                </div>
              </div>
              <Field label="Heading font">
                {id => <select id={id} className="mac-select" value={d.font || th.font} onChange={e => up('font', e.target.value)}>
                  {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}
                </select>}
              </Field>
              <ImagePick wide label="Cover photo" hint="Optional. Every design has a place for it; without one the design draws its own artwork."
                value={d.coverPhoto} onPick={f => pickImage(f, 'coverPhoto', { max: 1600 })} onClear={() => up('coverPhoto', '')} />
              <ImagePick label="Logo" hint="The Codelix logo is used unless you choose another." value={d.logo} onPick={f => pickImage(f, 'logo', { max: 500, png: true })} onClear={() => up('logo', '')} />
            </Sec>

            <Sec title="Client and project" open>
              {projects.length > 0 && (
                <Field label="Fill from a project" hint="Copies the client, project name, value and payment milestones.">
                  {id => <select id={id} className="mac-select" value="" onChange={e => fillFromProject(e.target.value)}>
                    <option value="">Choose a project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{[p.name || p.projectName, p.clientName].filter(Boolean).join(' · ')}</option>)}
                  </select>}
                </Field>
              )}
              <FormGrid>
                <Field label="Client (company)" required>{id => <input id={id} className="mac-input" value={d.client.name} onChange={e => up('client.name', e.target.value)} placeholder="Client or company name" />}</Field>
                <Field label="Contact person">{id => <input id={id} className="mac-input" value={d.client.contact} onChange={e => up('client.contact', e.target.value)} placeholder="Full name" />}</Field>
                <Field label="Designation">{id => <input id={id} className="mac-input" value={d.client.designation} onChange={e => up('client.designation', e.target.value)} placeholder="e.g. Director" />}</Field>
                <Field label="Project duration">{id => <input id={id} className="mac-input" value={d.project.duration} onChange={e => up('project.duration', e.target.value)} placeholder="e.g. 10 weeks" />}</Field>
              </FormGrid>
              <Field label="Project name" required>{id => <input id={id} className="mac-input" value={d.project.title} onChange={e => up('project.title', e.target.value)} maxLength={90} />}</Field>
              <Field label="Line under the title">{id => <input id={id} className="mac-input" value={d.project.subtitle} onChange={e => up('project.subtitle', e.target.value)} maxLength={160} />}</Field>
              <FormGrid>
                <Field label="SOW number">{id => <input id={id} className="mac-input" value={d.doc.number} onChange={e => up('doc.number', e.target.value)} />}</Field>
                <Field label="Version">{id => <input id={id} className="mac-input" value={d.doc.version} onChange={e => up('doc.version', e.target.value)} />}</Field>
                <Field label="Date">{id => <input id={id} className="mac-input" type="date" value={d.doc.date} onChange={e => up('doc.date', e.target.value)} />}</Field>
                <Field label="Valid until">{id => <input id={id} className="mac-input" type="date" value={d.doc.validUntil} onChange={e => up('doc.validUntil', e.target.value)} />}</Field>
                <Field label="Planned start">{id => <input id={id} className="mac-input" type="date" value={d.project.startDate} onChange={e => up('project.startDate', e.target.value)} />}</Field>
              </FormGrid>
              <Toggle checked={d.show.cards} onChange={v => up('show.cards', v)}>Show the four summary boxes at the top</Toggle>
            </Sec>

            <Sec title="Overview and objectives">
              <Field label="Project overview" hint="A new line starts a new paragraph.">{id => <textarea id={id} className="mac-input" rows={5} value={d.project.overview} onChange={e => up('project.overview', e.target.value)} />}</Field>
              <Toggle checked={d.show.objectives} onChange={v => up('show.objectives', v)}>Show objectives</Toggle>
              {d.show.objectives && <TextList label="Objectives" items={d.project.objectives} onChange={v => up('project.objectives', v)} placeholder="One objective" addLabel="Add objective" />}
            </Sec>

            <Sec title="Scope of work">
              <Rows name="Scope item" rows={d.scope} onChange={v => up('scope', v)} blank={{ title: '', text: '' }} addLabel="Add scope item"
                cols={[{ k: 'title', label: 'Title' }, { k: 'text', label: 'What is included', area: true }]} />
            </Sec>

            <Sec title="Deliverables">
              <Rows name="Deliverable" rows={d.deliverables} onChange={v => up('deliverables', v)} blank={{ name: '', detail: '', acceptance: '' }} addLabel="Add deliverable"
                cols={[{ k: 'name', label: 'Deliverable' }, { k: 'detail', label: 'What it includes' }, { k: 'acceptance', label: 'Accepted when' }]} />
            </Sec>

            <Sec title="Timeline">
              <Rows name="Phase" rows={d.timeline} onChange={v => up('timeline', v)} blank={{ phase: '', duration: '', output: '' }} addLabel="Add phase"
                cols={[{ k: 'phase', label: 'Phase' }, { k: 'duration', label: 'When (e.g. Weeks 2–3)' }, { k: 'output', label: 'Output' }]} />
            </Sec>

            <Sec title="Technology">
              <Toggle checked={d.show.tech} onChange={v => up('show.tech', v)}>Show the technology section</Toggle>
              {d.show.tech && <TextList items={d.tech} onChange={v => up('tech', v)} placeholder="e.g. React" addLabel="Add technology" />}
            </Sec>

            <Sec title="Cost and payments">
              <FormGrid>
                <Field label="Project value (₹)" hint="Before GST">{id => <input id={id} className="mac-input" type="number" min="0" value={d.pricing.total} onChange={e => up('pricing.total', e.target.value)} placeholder="0" />}</Field>
                <Field label="GST %">{id => <input id={id} className="mac-input" type="number" min="0" max="28" value={d.pricing.gstRate} disabled={!d.pricing.gst} onChange={e => up('pricing.gstRate', e.target.value)} />}</Field>
              </FormGrid>
              <Toggle checked={d.pricing.gst} onChange={v => up('pricing.gst', v)}>Add GST on top</Toggle>
              <span className="field-label">Payment schedule</span>
              <Rows name="Payment stage" rows={d.pricing.schedule} onChange={v => up('pricing.schedule', v)} blank={{ label: '', percent: '', when: '' }} addLabel="Add payment stage"
                cols={[{ k: 'label', label: 'Stage' }, { k: 'percent', label: '%', num: true, w: 70 }, { k: 'when', label: 'Due' }]} />
              {(() => {
                const sum = d.pricing.schedule.reduce((s, x) => s + (+x.percent || 0), 0);
                return sum !== 100 && d.pricing.schedule.length > 0 ? <span className="field-error" role="alert">The stages add up to {sum}%, not 100%.</span> : null;
              })()}
            </Sec>

            <Sec title="Assumptions and what is not included">
              <Toggle checked={d.show.assumptions} onChange={v => up('show.assumptions', v)}>Show assumptions</Toggle>
              {d.show.assumptions && <TextList items={d.assumptions} onChange={v => up('assumptions', v)} placeholder="One assumption" addLabel="Add assumption" />}
              <Toggle checked={d.show.exclusions} onChange={v => up('show.exclusions', v)}>Show what is not included</Toggle>
              {d.show.exclusions && <TextList items={d.exclusions} onChange={v => up('exclusions', v)} placeholder="One thing that is not included" addLabel="Add item" />}
            </Sec>

            <Sec title="Terms and signatures">
              <Toggle checked={d.show.terms} onChange={v => up('show.terms', v)}>Show terms</Toggle>
              {d.show.terms && <Rows name="Term" rows={d.terms} onChange={v => up('terms', v)} blank={{ title: '', text: '' }} addLabel="Add term"
                cols={[{ k: 'title', label: 'Title' }, { k: 'text', label: 'Text', area: true }]} />}
              <Toggle checked={d.show.sign} onChange={v => up('show.sign', v)}>Show the signature boxes</Toggle>
            </Sec>

            <Sec title="Our company">
              <FormGrid>
                <Field label="Company name">{id => <input id={id} className="mac-input" value={d.company.name} onChange={e => up('company.name', e.target.value)} />}</Field>
                <Field label="Line under the name">{id => <input id={id} className="mac-input" value={d.company.tagline} onChange={e => up('company.tagline', e.target.value)} />}</Field>
                <Field label="Website">{id => <input id={id} className="mac-input" value={d.company.website} onChange={e => up('company.website', e.target.value)} />}</Field>
                <Field label="Signed by">{id => <input id={id} className="mac-input" value={d.company.signatory} onChange={e => up('company.signatory', e.target.value)} placeholder="Partner's name" />}</Field>
                <Field label="Their title">{id => <input id={id} className="mac-input" value={d.company.signatoryTitle} onChange={e => up('company.signatoryTitle', e.target.value)} />}</Field>
              </FormGrid>
            </Sec>
          </div>

          <div className="sow-stage-wrap">
            <div className="sow-stage" ref={stage}>
              <SowDocument d={d} scale={scale} onPageCount={setPageCount} />
            </div>
            {busy && (
              <div className="sow-busy" role="status">
                <span className="sow-busy-box"><span className="sow-spin" aria-hidden="true" /> Making the PDF{progress ? ` · ${progress}` : '…'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {busy && <div className="sow-print" aria-hidden="true"><SowDocument d={d} scale={1} docRef={printRef} /></div>}

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

      <ConfirmDialog isOpen={resetOpen} onClose={() => setResetOpen(false)} onConfirm={resetAll} title="Start a new SOW?" confirmLabel="Start new"
        message="This clears the client, project and all the text you changed. The design, logo and company details are kept. It cannot be undone." />
    </div>
  );
}
