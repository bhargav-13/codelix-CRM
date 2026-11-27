// ================================================================
// Codelix OMS — Scope of Work (SOW) letter: designs, starting text and helpers.
//
// A SOW is one plain object (see `blankSow`). The page keeps the one being
// written in this browser (localStorage); the finished PDF can be saved under
// the client in Client documents.
// ================================================================

export const PAGE_W = 794;    // A4 at 96 dpi
export const PAGE_H = 1123;
export const BODY_H = 947;    // room for content between the page header and footer

// Heading + body font pairs (loaded from Google Fonts when the builder opens)
export const FONTS = {
  grotesk:   { name: 'Space Grotesk', head: "'Space Grotesk', 'Inter', sans-serif", body: "'Inter', sans-serif" },
  poppins:   { name: 'Poppins',       head: "'Poppins', 'Inter', sans-serif",       body: "'Inter', sans-serif" },
  serif:     { name: 'Playfair',      head: "'Playfair Display', Georgia, serif",   body: "'Inter', sans-serif" },
  manrope:   { name: 'Manrope',       head: "'Manrope', 'Inter', sans-serif",       body: "'Manrope', 'Inter', sans-serif" },
  outfit:    { name: 'Outfit',        head: "'Outfit', 'Inter', sans-serif",        body: "'Inter', sans-serif" },
  editorial: { name: 'DM Serif',      head: "'DM Serif Display', Georgia, serif",   body: "'Inter', sans-serif" },
};
export const FONT_LINK = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Manrope:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&family=Poppins:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap';

// cover = the cover layout · head = section-heading style · table = table style · chrome = page header/footer style
export const THEMES = [
  { id: 'aurora',    name: 'Aurora',    note: 'Dark gradient',      accent: '#2c67e7', font: 'grotesk',   cover: 'aurora',    head: 'number',    table: 'solid', chrome: 'line' },
  { id: 'atlas',     name: 'Atlas',     note: 'Colour side panel',  accent: '#0f766e', font: 'poppins',   cover: 'split',     head: 'bar',       table: 'soft',  chrome: 'side' },
  { id: 'lumen',     name: 'Lumen',     note: 'Large photo',        accent: '#b45309', font: 'serif',     cover: 'photo',     head: 'underline', table: 'lines', chrome: 'line' },
  { id: 'mono',      name: 'Mono',      note: 'Minimal',            accent: '#111827', font: 'manrope',   cover: 'minimal',   head: 'caps',      table: 'lines', chrome: 'bare' },
  { id: 'prism',     name: 'Prism',     note: 'Geometric shapes',   accent: '#7c3aed', font: 'outfit',    cover: 'geo',       head: 'pill',      table: 'solid', chrome: 'band' },
  { id: 'blueprint', name: 'Blueprint', note: 'Technical grid',     accent: '#0ea5e9', font: 'grotesk',   cover: 'grid',      head: 'number',    table: 'soft',  chrome: 'line' },
  { id: 'editorial', name: 'Editorial', note: 'Magazine',           accent: '#dc2626', font: 'editorial', cover: 'editorial', head: 'underline', table: 'lines', chrome: 'bare' },
  { id: 'tide',      name: 'Tide',      note: 'Soft waves',         accent: '#0891b2', font: 'poppins',   cover: 'wave',      head: 'bar',       table: 'soft',  chrome: 'band' },
];
export const themeOf = id => THEMES.find(t => t.id === id) || THEMES[0];
export const ACCENTS = ['#2c67e7', '#0f766e', '#7c3aed', '#dc2626', '#b45309', '#0891b2', '#be185d', '#15803d', '#111827'];

// ── colours ─────────────────────────────────────────────────────
const rgb = hex => {
  const h = String(hex || '').replace('#', '');
  const f = h.length === 3 ? h.split('').map(x => x + x).join('') : h.padEnd(6, '0').slice(0, 6);
  return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0);
};
const mix = (a, b, t) => {
  const x = rgb(a), y = rgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const alpha = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`;
const svg = s => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;

// Every colour and pattern a design uses, worked out from one accent colour. They are plain values
// (no color-mix, no filters) so the PDF comes out exactly like the screen.
export function palette(accent) {
  const a = /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : '#2c67e7';
  const dark = mix(a, '#000000', 0.3), deep = mix(a, '#05070d', 0.8), light = mix(a, '#ffffff', 0.5);
  const rings = c => svg(`<svg xmlns="http://www.w3.org/2000/svg" width="460" height="460" viewBox="0 0 460 460" fill="none" stroke="${c}" stroke-width="1.5">${[40, 80, 120, 160, 200, 228].map(r => `<circle cx="230" cy="230" r="${r}"/>`).join('')}</svg>`);
  const dots = c => svg(`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="3" cy="3" r="1.6" fill="${c}"/></svg>`);
  const grid = c => svg(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="none" stroke="${c}" stroke-width="1"><path d="M40 0H0V40"/></svg>`);
  const wave = (c, flip) => svg(`<svg xmlns="http://www.w3.org/2000/svg" width="794" height="120" viewBox="0 0 794 120" preserveAspectRatio="none"><path fill="${c}" d="${flip
    ? 'M0 0H794V52C690 96 560 8 420 44S150 110 0 60Z'
    : 'M0 120H794V60C660 10 540 96 400 66S140 14 0 70Z'}"/></svg>`);
  return {
    '--a': a, '--a-dark': dark, '--a-deep': deep, '--a-light': light,
    '--a-soft': mix(a, '#ffffff', 0.92), '--a-soft2': mix(a, '#ffffff', 0.8),
    '--a-0': alpha(a, 0), '--a-light-0': alpha(light, 0),
    '--dark-55': alpha(dark, 0.55), '--deep-92': alpha(deep, 0.92),
    '--p-rings': rings(alpha('#ffffff', 0.28)), '--p-rings-a': rings(alpha(a, 0.35)),
    '--p-dots': dots(alpha('#ffffff', 0.22)), '--p-dots-a': dots(alpha(a, 0.3)),
    '--p-grid': grid(alpha('#ffffff', 0.07)), '--p-grid-a': grid(alpha(a, 0.16)),
    '--p-wave': wave(mix(a, '#ffffff', 0.92)), '--p-wave-foot': wave(mix(a, '#ffffff', 0.8)), '--p-wave-foot2': wave(a),
  };
}

// ── starting content ────────────────────────────────────────────
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const plusDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const blankCompany = () => ({
  name: 'Codelix IT Solutions', tagline: 'Software · Web · Mobile', address: '', email: '', phone: '',
  website: 'codelixitsolutions.com', gstin: '', signatory: '', signatoryTitle: 'Partner',
});

export function blankSow(keep = {}) {
  const date = today();
  return {
    theme: keep.theme || 'aurora', accent: keep.accent || '', font: keep.font || '',
    logo: keep.logo || '', coverPhoto: keep.coverPhoto || '',
    company: keep.company || blankCompany(),
    doc: { number: `SOW-${date.slice(0, 4)}-001`, date, validUntil: plusDays(date, 15), version: '1.0' },
    client: { name: '', contact: '', designation: '', address: '', email: '', phone: '' },
    project: {
      title: 'Project name', subtitle: 'What we will build, when it will be delivered and what it will cost.',
      duration: '10 weeks', startDate: '',
      overview: 'This document describes the work Codelix IT Solutions will carry out for the client. It lists what is included, what will be delivered, the timeline, the cost and how changes are handled, so both sides share one clear picture before work begins.',
      objectives: [
        'Launch a reliable, fast product that the client’s team can run without technical help.',
        'Replace manual steps with simple screens that save time every day.',
        'Deliver in clear stages, with a working demo at the end of each stage.',
      ],
    },
    scope: [
      { title: 'Discovery and planning', text: 'Workshops to understand the business, users and current process. Output: the feature list, user flows and a delivery plan.' },
      { title: 'UI and UX design', text: 'Wireframes and final screen designs for every screen, with one clickable prototype for approval.' },
      { title: 'Development', text: 'Front end, back end and database built to the approved designs, with the admin panel and required integrations.' },
      { title: 'Testing and quality', text: 'Functional, device and browser testing, plus fixing every issue found before go-live.' },
      { title: 'Launch and handover', text: 'Deployment to the live server, a walkthrough for the client’s team and handover of source code and credentials.' },
    ],
    deliverables: [
      { name: 'Requirements document', detail: 'Feature list and user flows', acceptance: 'Approved in writing by the client' },
      { name: 'Design files', detail: 'All screens and a clickable prototype', acceptance: 'Approved in writing by the client' },
      { name: 'Working application', detail: 'All features in this document, on the live server', acceptance: 'Passes the agreed test checklist' },
      { name: 'Source code and access', detail: 'Repository, hosting and admin logins', acceptance: 'Access confirmed by the client' },
    ],
    timeline: [
      { phase: 'Discovery and planning', duration: 'Week 1', output: 'Signed-off requirements' },
      { phase: 'Design', duration: 'Weeks 2–3', output: 'Approved designs' },
      { phase: 'Development', duration: 'Weeks 4–8', output: 'Demo at the end of each fortnight' },
      { phase: 'Testing and fixes', duration: 'Week 9', output: 'Test report' },
      { phase: 'Launch and handover', duration: 'Week 10', output: 'Live application' },
    ],
    tech: ['React', 'Java Spring Boot', 'PostgreSQL', 'Docker'],
    pricing: {
      total: '', gst: true, gstRate: 18,
      schedule: [
        { label: 'Advance, on signing', percent: 30, when: 'Before work starts' },
        { label: 'Design approval', percent: 20, when: 'End of week 3' },
        { label: 'Development complete', percent: 30, when: 'End of week 8' },
        { label: 'Go-live', percent: 20, when: 'On launch' },
      ],
    },
    assumptions: [
      'The client gives content, logins and feedback within 2 working days of each request.',
      'One person on the client’s side has the authority to approve designs and deliveries.',
      'Third-party costs (hosting, domain, SMS, payment gateway, paid plugins) are paid by the client.',
    ],
    exclusions: [
      'Content writing, photography and data entry.',
      'Features not listed in this document.',
      'Marketing, SEO campaigns and paid advertising.',
      'Maintenance after the support period, unless a separate agreement is signed.',
    ],
    terms: [
      { title: 'Change requests', text: 'Any work outside this document is a change request. We will share the extra cost and time in writing, and start it only after the client approves in writing.' },
      { title: 'Revisions', text: 'Two rounds of revisions are included for each design and each delivery. Further rounds are billed as change requests.' },
      { title: 'Acceptance', text: 'The client reviews each delivery within 5 working days. If no feedback is received in that time, the delivery is treated as accepted.' },
      { title: 'Warranty and support', text: 'Bugs reported within 30 days of go-live are fixed at no cost. New features and changes are not part of this warranty.' },
      { title: 'Ownership and confidentiality', text: 'After full payment, the client owns the source code and designs made for this project. Both sides keep each other’s business information confidential.' },
    ],
    show: { cards: true, objectives: true, tech: true, assumptions: true, exclusions: true, terms: true, sign: true },
  };
}

// ── small helpers ───────────────────────────────────────────────
export const money = n => {
  const v = Number(n || 0);
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
};
export const longDate = iso => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};
// Project value, GST and the amount of each payment stage
export function totals(p) {
  const base = Math.max(0, +p.total || 0);
  const gst = p.gst ? Math.round(base * (+p.gstRate || 0)) / 100 : 0;
  return { base, gst, grand: base + gst, part: pct => Math.round(base * (+pct || 0)) / 100 };
}

const DRAFT_KEY = 'codelix.sow.draft';
export const draft = {
  load() {
    try {
      const v = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!v || typeof v !== 'object') return null;
      const base = blankSow();   // fills anything an older saved draft does not have
      return { ...base, ...v, company: { ...base.company, ...v.company }, doc: { ...base.doc, ...v.doc }, client: { ...base.client, ...v.client },
        project: { ...base.project, ...v.project }, pricing: { ...base.pricing, ...v.pricing }, show: { ...base.show, ...v.show } };
    } catch { return null; }
  },
  // false = the browser refused (storage full or blocked); the page says so once
  save(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); return true; } catch { return false; } },
};

// A picked image, made small enough to keep in the draft and the PDF.
// Photos become JPEG; logos stay PNG so a transparent background survives.
export function shrinkImage(file, { max = 1600, png = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('Choose an image file (PNG or JPG).')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be read.')); };
    img.src = url;
  });
}

export const pdfName = d => `SOW - ${[d.client.name, d.project.title].map(s => String(s || '').trim()).filter(Boolean).join(' - ') || 'draft'}`.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 110) + '.pdf';
