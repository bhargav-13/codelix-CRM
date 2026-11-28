// ================================================================
// Codelix OMS — Proposal letter: the starting text (taken from the Codelix Proposal design in
// Figma), colours and small helpers.
//
// A proposal is one plain object (see `blankProposal`). Every word on every page is a field here,
// so the builder can change all of it. The page being written is kept in this browser.
// ================================================================

export const PAGE_W = 1440;   // the Figma frame size; the PDF page keeps the same shape
export const PAGE_H = 1988;
export const PDF_MM = [210, Math.round((210 * PAGE_H / PAGE_W) * 100) / 100];   // 210 × 289.92 mm

export const FONTS = {
  inter:   { name: 'Inter (closest to SF Pro)', css: "'Inter', 'SF Pro Text', -apple-system, 'Segoe UI', sans-serif" },
  system:  { name: 'SF Pro (Mac only)',         css: "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Inter', sans-serif" },
  dmsans:  { name: 'DM Sans',                   css: "'DM Sans', 'Inter', sans-serif" },
  manrope: { name: 'Manrope',                   css: "'Manrope', 'Inter', sans-serif" },
  poppins: { name: 'Poppins',                   css: "'Poppins', 'Inter', sans-serif" },
};
export const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Manrope:wght@400;500;700&family=Poppins:ital,wght@0,400;0,500;0,600;1,400&family=Sarabun:wght@400&display=swap';

// The four colours of the design. Everything else (bars, soft fills, the hexagons) is worked out
// from them, so changing one keeps the pages in tune.
export const DEFAULT_STYLE = { font: 'inter', accent: '#3E7DFC', text: '#58719A', heading: '#31445E', tint: '#E1EDFE' };
export const STYLE_PRESETS = [
  { name: 'Codelix blue', accent: '#3E7DFC', text: '#58719A', heading: '#31445E', tint: '#E1EDFE' },
  { name: 'Teal',         accent: '#0F9F8F', text: '#4E7470', heading: '#21413D', tint: '#DDF3EF' },
  { name: 'Violet',       accent: '#7C4DFF', text: '#6A6290', heading: '#352C5C', tint: '#ECE6FE' },
  { name: 'Amber',        accent: '#E08A00', text: '#7A6A52', heading: '#46392A', tint: '#FCEFD9' },
  { name: 'Graphite',     accent: '#334155', text: '#5B6472', heading: '#1F2937', tint: '#E9ECF1' },
];

const rgb = hex => {
  const h = String(hex || '').replace('#', '');
  const f = h.length === 3 ? h.split('').map(x => x + x).join('') : h.padEnd(6, '0').slice(0, 6);
  return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0);
};
export const mix = (a, b, t) => {
  const x = rgb(a), y = rgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const okHex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);

// CSS variables for the pages. Plain hex values only, so the PDF matches the screen.
export function vars(style = {}) {
  const s = { ...DEFAULT_STYLE, ...style };
  const a = okHex(s.accent, DEFAULT_STYLE.accent), t = okHex(s.text, DEFAULT_STYLE.text);
  const h = okHex(s.heading, DEFAULT_STYLE.heading), tint = okHex(s.tint, DEFAULT_STYLE.tint);
  return {
    '--p-font': (FONTS[s.font] || FONTS.inter).css,
    // SF Pro is narrower than the other fonts; their text boxes are made this much wider so the
    // lines break where they do in the design.
    '--p-wide': s.font === 'system' ? 1 : 1.12,
    '--p-accent': a,
    '--p-text': t,
    '--p-head': h,
    '--p-tint': tint,
    '--p-row': mix(tint, '#ffffff', 0.12),           // the table-of-contents rows (#E6EEFA in the design)
    '--p-num': mix(a, '#ffffff', 0.92),              // numbers inside the blue boxes
    '--p-hex': mix(t, '#ffffff', 0.4),               // the hexagon outlines
    '--p-bar-from': mix(a, '#ffffff', 0.5),          // timeline bars: light to dark
    '--p-bar-to': mix(a, '#000000', 0.32),
    '--p-chart-head': mix(tint, '#ffffff', 0.05),
    '--p-chart-body': mix(tint, '#ffffff', 0.86),
    '--p-split-1': t,                                // payment bar segments
    '--p-split-2': mix(a, '#ffffff', 0.45),
    '--p-split-3': mix(a, '#ffffff', 0.78),
  };
}
export const splitColour = i => ['var(--p-split-1)', 'var(--p-split-2)', 'var(--p-split-3)'][i % 3];

// ── dates and money ─────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const plusDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const okIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export const slashDate = s => (okIso(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');                // 25/11/2026
export const shortDate = s => (okIso(s) ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');   // 25 Nov 2026
export const ordinalDate = s => {                                                                                       // 1st December 2026
  if (!okIso(s)) return '';
  const d = new Date(s + 'T00:00:00'), n = d.getDate();
  const suf = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n}${suf} ${d.toLocaleDateString('en-GB', { month: 'long' })} ${d.getFullYear()}`;
};
export const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

export const money = n => {
  const v = Number(n || 0);
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
};

// Sub total, GST and total of the fees table; milestones are worked out from the sub total.
export function totals(fees) {
  const sub = (fees.rows || []).reduce((s, r) => s + Math.max(0, +r.amount || 0), 0);
  const gst = fees.gst ? Math.round(sub * (+fees.gstRate || 0)) / 100 : 0;
  return { sub, gst, total: sub + gst, part: pct => Math.round(sub * (+pct || 0)) / 100 };
}

// ── starting content (exactly the Figma design) ─────────────────
export const blankCompany = () => ({
  name: 'Codelix IT Solutions Pvt. Ltd.', short: 'Codelix', legal: 'Codelix IT Solutions Private Limited',
  gstin: '24AAMCC782H1ZG', footer: 'We value your business and trust.',
  signatory: 'Mr. Manas Vadodara', signatoryTitle: 'Co-Founder & CEO', signature: '',
});

export function blankProposal(keep = {}) {
  const date = today();
  return {
    v: 1,
    style: { ...DEFAULT_STYLE, ...(keep.style || {}) },
    logo: keep.logo || '',
    coverPhoto: keep.coverPhoto ?? '',          // '' = the design's photo · 'none' = no photo · data URL = your own
    company: keep.company || blankCompany(),
    doc: { number: `CDL-${date.slice(5, 7)}-0001`, date, validUntil: plusDays(date, 6) },
    client: { name: 'Gypsum Structural India', contact: '', designation: '' },
    cover: {
      kicker: 'Customised ERP solution', title: 'PROPOSAL.', prepared: 'Prepared for',
      dateLabel: 'Date', numberLabel: 'Proposal No.', showGstin: true,
    },
    toc: { show: true, title: 'TABLE OF CONTENT' },
    letter: {
      show: true, title: 'Letter of Intent', toc: 'Letter of Intent',
      dateLabel: 'Date:', subjectLabel: 'Subject:', subject: 'Proposal for ERP solution - ',
      body: [
        'Codelix IT Solutions Private Limited (“Codelix”) is pleased to present this detailed proposal to Jay Enterprise (“Client”) for the design, development and deployment of the Client’s Customised Construction ERP Lite Solution. It will be available on Web and Mobile and carry the Client’s own company branding.',
        'As a young and dynamic technology company, Codelix specialises in building custom ERP solutions that are visually clean, technically robust, and easy to use for both office and on-site teams.',
        'This proposal sets out our understanding of your requirements, the scope of work, deliverables, timelines, commercial terms and other key details, so that everything is fully transparent.',
        'Our objective is to deliver one simple ERP for all your sites. Site staff will record labour and material every day, and every month-end bill will be checked against those daily records before payment. Your management gets real-time visibility of every site’s cost, stock and tasks, and avoids overpaying contractors and vendors.',
      ].join('\n\n'),
    },
    scope: {
      show: true, title: 'Scope of Professional Services', toc: 'Scope of Professional Services',
      intro: 'Codelix will provide end-to-end design, development and deployment services, which will include but are not limited to the following:',
      groups: [
        { title: '2.1 UI/UX Design (Figma)', items: 'Modern and responsive layouts optimised for desktop, tablet and mobile.\nConsistent colour palette, typography and visual hierarchy aligned with the Client’s branding And product image creations.\nInteractive prototype for Client review and approval.' },
        { title: '2.2 Frontend Development (React.js / Next.js)', items: 'Responsive implementation of approved UI/UX designs.\nHigh-performance, SEO-friendly code.\nIntegration of animations, transitions and reusable components for scalability.' },
        { title: '2.3 Deployment & Hosting', items: 'Deployment of both frontend and backend on HTTPS-enabled hosting.\nSecure domain setup support.\nInclusion of the website under up to three domains as per Client requirement.' },
      ],
    },
    inclusions: {
      show: true, title: 'Additional Inclusion', toc: 'Additional Inclusions',
      items: [
        { title: 'Free Maintenance Support', text: '45 days post-launch, including bug fixes, minor issues, browser and device compatibility and support.' },
        { title: 'Free Cloud Hosting', text: 'First year included under the One-Time Lifetime plan; from year two paid directly by the Client.' },
        { title: 'Personal Branding on Web App', text: 'Client’s company name, logo, colours and own domain.' },
        { title: 'Initial Data Setup', text: 'Assistance loading master data, sites/projects, users, materials and opening stock.' },
        { title: 'Training & Knowledge Transfer', text: 'Online training for admin, office and site teams, with basic user and admin documentation.' },
      ],
    },
    deliverables: {
      show: true, title: 'Deliverables', toc: 'Deliverables',
      items: [
        { title: 'Fully Functional, Responsive ERP System', text: 'Codelix will design and develop a complete, fully functional ERP system covering the agreed business modules. The system will be responsive and accessible across desktops, tablets, and supported mobile devices, ensuring a consistent and efficient user experience for' },
        { title: 'Custom Role-Based Controls', text: 'A secure and intuitive admin panel will be provided to manage users, roles, permissions, master data, and system configurations. The admin panel will allow authorised users to control ERP operations without dependency on developers for routine updates' },
        { title: 'Complete Handover of Source Code & System Assets', text: 'Upon project completion, Codelix will provide all source code, system credentials, configuration details, and relevant technical documentation, granting the Client full ownership and control of the ERP solution for future maintenance or enhancements.' },
        { title: 'Deployment on Secure HTTPS-Enabled Infrastructure', text: 'The ERP system will be deployed on secure, HTTPS-enabled hosting infrastructure to ensure data security and encrypted communication. Deployment support will be provided for up to three domains or subdomains, as per Client requirements.' },
        { title: '60 days of post-launch support', text: 'Codelix will provide complimentary support for 45 days post-deployment, covering bug fixes, minor system adjustments, and operational assistance to ensure a smooth transition and stable ERP operations.' },
      ],
    },
    timeline: {
      show: true, title: 'Project Timeline', toc: 'Project Timeline',
      durationLabel: 'Estimated Total Duration:', duration: '10 Weeks',
      intro: 'The project will commence immediately upon the Client’s formal acceptance of this proposal and receipt of the advance payment. We will follow a milestone-based delivery schedule to ensure clarity, accountability and timely completion. A high-level timeline is outlined below',
      chartTitle: 'Visual Execution Schedule (Week-by-Week)', legend: 'Phase Span', firstColumn: 'Workstream',
      unit: 'week', count: 10,
      rows: [
        { name: 'Discovery & UI/UX', from: 1, to: 2 },
        { name: 'Backend & APIs', from: 3, to: 6 },
        { name: 'Frontend & Integration', from: 5, to: 8 },
        { name: 'QA & Go-Live', from: 9, to: 10 },
      ],
    },
    fees: {
      show: true, title: 'Commercial Terms', toc: 'Commercial Terms',
      validText: 'This Proposal is valid till', colName: 'Service Category', colFee: 'Fees (INR)',
      rows: [
        { name: 'Discovery & UI/UX Design', amount: 250000 },
        { name: 'Backend & APIs', amount: 650000 },
        { name: 'Frontend & Integration', amount: 450000 },
        { name: 'QA & Go-Live', amount: 150000 },
      ],
      gst: true, gstRate: 18, subLabel: 'Sub Total', gstLabel: 'GST Amt.', totalLabel: 'Total',
    },
    payments: {
      show: true, title: 'Commercial Terms',
      heading: 'Payment Milestones', note: 'Synced to Subtotal (Excl. GST)',
      milestones: [
        { label: 'Kick-off Amount', percent: 30, text: 'Project Kickoff & Agreement Signing. Advance payment required upon proposal approval and agreement signing to initiate the project and begin the development process.' },
        { label: 'After 1st Phase', percent: 40, text: 'Payment due upon completion of 50% of the agreed project scope, including major design and development milestones.' },
        { label: 'Final Amount', percent: 30, text: 'Remaining payment due after project completion, testing, and final approval, and before deployment to the live production environment.' },
      ],
      support: { show: true, title: 'Complimentary Support', badge: 'Included', text: '30 days of free post-launch bug-fix support & stabilization included after go-live.' },
      amc: { show: true, title: 'Annual Maintenance (AMC)', price: '₹8,300 / month', text: 'Optional post-launch security patches, uptime monitoring & up to 10 hrs/mo minor updates.' },
      showTerms: true,
      termsTitle: 'Terms & Validity',
      terms: [
        { label: 'Proposal Validity:', text: 'Valid for 30 days from the date of issue.' },
        { label: 'Payment Terms:', text: 'Invoices are payable within 7 business days.' },
        { label: 'Change Requests:', text: 'Features outside agreed scope are estimated & billed separately.' },
      ],
      exclusionsTitle: 'Exclusions',
      exclusions: [
        { label: 'Infrastructure:', text: 'Domain, cloud hosting, SSL & server charges.' },
        { label: 'Third-Party Services:', text: 'Paid APIs, SMS/WhatsApp gateways, or stock assets.' },
        { label: 'Statutory Taxes:', text: 'GST applies as per prevailing government rates.' },
      ],
    },
    terms: {
      show: true, title: 'Terms & Condition', toc: 'Terms & Conditions',
      items: [
        { title: '7.1 Design Approval and Change Control', text: 'Once the UI/UX designs prepared in Figma are reviewed and formally approved by the Client, those designs will form the basis for development. Any significant or structural design changes requested after approval may impact the project timeline and cost, and therefore will require a separate change request, estimation, and mutual approval before execution.' },
        { title: '7.2 Post-Completion Development', text: 'Upon completion of the project and final delivery of the website and admin panel, the agreed scope of work will be deemed complete. Any additional development, feature enhancements, or modifications requested thereafter will be scoped and billed separately at the prevailing rates agreed between Codelix and the Client.' },
        { title: '7.3 Hosting and Third-Party Services', text: 'All costs related to hosting, SSL certificates, email services, third-party plugins, APIs, payment gateways, shipping gateways, or any other external services (if used) are to be borne directly by the Client. Codelix will assist with setup and configuration but will not be financially responsible for these fees.' },
      ],
    },
    acceptance: {
      show: true, title: 'Acceptance', toc: 'Acceptance',
      intro: 'By signing below, both parties confirm agreement to the project scope, commercial investment, payment milestones, and terms outlined in this proposal, authorizing Codelix IT Solutions Pvt. Ltd. to commence work.',
      confirm: 'By signing this section or providing written confirmation (by email or letter), the Client confirms that:',
      points: 'They have reviewed and understood the contents of this proposal.\nThey accept the scope of services, deliverables, timelines, commercial terms, and terms & conditions described above.\nThey authorise Codelix to commence work upon receipt of the agreed advance payment.',
      clientTitle: 'ACCEPTED BY CLIENT', ourTitle: 'FOR CODELIX IT SOLUTIONS', signHint: 'Sign here or leave blank for print',
      nameLabel: 'Signature Name :', designationLabel: 'Designation :', companyLabel: 'Company :', dateLabel: 'Date :',
      clientDate: '',
    },
  };
}

// Timeline columns: days, weeks or months. `count` is how many columns the chart shows.
export const UNITS = {
  day:   { name: 'Days',   p: 'D', one: 'day',   many: 'days',   max: 31 },
  week:  { name: 'Weeks',  p: 'W', one: 'wk',    many: 'wks',    max: 24 },
  month: { name: 'Months', p: 'M', one: 'month', many: 'months', max: 24 },
};
export function unitOf(t = {}) {
  const u = UNITS[t.unit] ? t.unit : 'week';
  const raw = t.count ?? t.weeks;                     // `weeks` is what older drafts kept
  return { key: u, ...UNITS[u], count: Math.min(UNITS[u].max, Math.max(1, Math.round(+raw || 1))) };
}

// The sections in page order (the cover and contents come first).
export const SECTIONS = ['letter', 'scope', 'inclusions', 'deliverables', 'timeline', 'fees', 'payments', 'terms', 'acceptance'];

// Fills anything an older saved draft does not have, one level deep per section.
export function upgrade(v) {
  const base = blankProposal();
  if (!v || typeof v !== 'object') return base;
  const out = { ...base, ...v };
  for (const k of ['style', 'company', 'doc', 'client', 'cover', 'toc', ...SECTIONS]) out[k] = { ...base[k], ...(v[k] || {}) };
  out.payments.support = { ...base.payments.support, ...(v.payments?.support || {}) };
  out.payments.amc = { ...base.payments.amc, ...(v.payments?.amc || {}) };
  if (v.timeline && v.timeline.count == null && v.timeline.weeks != null) out.timeline.count = v.timeline.weeks;
  return out;
}

const DRAFT_KEY = 'codelix.proposal.draft';
export const draft = {
  load() {
    try { const v = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return v ? upgrade(v) : null; }
    catch { return null; }
  },
  save(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); return true; } catch { return false; } },
};

// Puts what the CRM knows about a lead into a proposal: the client, contact, project type and
// value. Wording that named the previous client is updated; the rest of the draft stays.
export function fromLead(d, c) {
  const company = String(c.companyName || c.clientName || '').trim();
  const person = c.companyName ? String(c.clientName || '').trim() : '';
  const type = String(c.projectType || '').trim();
  const value = +c.finalPrice || +c.proposalValue || 0;
  const oldNames = [d.client.name, 'Jay Enterprise'].map(x => String(x || '').trim()).filter(x => x && x !== company);
  const swap = text => oldNames.reduce((t, n) => t.split(n).join(company), String(text || ''));
  const date = today();
  return {
    ...d,
    client: { ...d.client, name: company, contact: person, designation: person ? d.client.designation : '' },
    doc: { ...d.doc, date, validUntil: plusDays(date, 6) },
    cover: type ? { ...d.cover, kicker: /solutions?$/i.test(type) ? `Customised ${type}` : `Customised ${type} solution` } : d.cover,
    letter: {
      ...d.letter,
      subject: type ? `Proposal for ${type} - ` : d.letter.subject,
      body: company ? swap(d.letter.body) : d.letter.body,
    },
    fees: value ? { ...d.fees, rows: [{ name: type || 'Project development', amount: value }] } : d.fees,
    acceptance: { ...d.acceptance, intro: company ? swap(d.acceptance.intro) : d.acceptance.intro },
  };
}

export const pdfName = d => `Proposal - ${[d.client.name, d.doc.number].map(s => String(s || '').trim()).filter(Boolean).join(' - ') || 'draft'}`
  .replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 110) + '.pdf';
