// ================================================================
// Codelix OMS — the short letters (Figma file "Letters"): Project milestones & payment schedule,
// Thank you for your payment, Thank you for the delivered project, and the Mutual NDA.
//
// Each letter is one plain object; every word on the page is a field. `fill*` helpers put a
// project, a payment or a CRM lead into a letter, so the app can offer a ready letter the moment
// a milestone, a payment, a completed project or a won lead is saved.
// ================================================================
import { PDF_MM } from './proposal';

export { PDF_MM };
export const LETTER_FONT_LINK = 'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Sora:wght@200&display=swap';

// ── dates and money ─────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const addDays = (s, n) => { const d = new Date((s || today()) + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const okIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export const longDate = s => (okIso(s) ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '');   // 07 December 2026
export const shortDate = s => (okIso(s) ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');  // 25 Nov 2026
export const money = n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
export const fy = s => { const d = okIso(s) ? new Date(s + 'T00:00:00') : new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String(y + 1).slice(2)}`; };
const GST_RATE = 0.18;
export const beforeGst = p => { const v = +p?.valuation || 0; return p?.billingType === 'With GST' ? Math.round(v / (1 + GST_RATE)) : v; };

// ── shared parts ────────────────────────────────────────────────
export const blankCompany = () => ({
  name: 'Codelix IT Solutions Pvt.Ltd.', legal: 'Codelix IT Solutions Private Limited', short: 'Codelix IT Solutions',
  footerBrand: 'Codelix IT Solutions', footerRest: ' | Ahmedabad | codelixitsolutions.com',
  phone: '+91 98250 41289', email: 'info@codelixitsolutions.com',
  address: '404, Titanium City Centre, Prahlad Nagar, Ahmedabad, Gujarat 380015',
  signatory: 'Mr. Manas Vadodara', signatoryTitle: 'Co-Founder & CEO', signature: '',
});
const blankTo = () => ({ name: 'Rajesh Patel', designation: 'Operations Director', company: 'Kaveri Retail Venture Pvt. Ltd.', address: 'Mumbai , Maharashtra' });
const blankAccept = (n = 'Acceptance') => ({
  show: true, heading: n, clientTitle: 'Accepted by client', ourTitle: 'FOr codelix it solutions', signHint: 'Sign here or leave blank for print',
  nameLabel: 'Signature Name :', designationLabel: 'Designation :', companyLabel: 'Company :', dateLabel: 'Date :',
  client: { name: '', designation: '', company: '', date: '' },
});

// ── the four letters ────────────────────────────────────────────
export const LETTERS = {
  milestones: {
    id: 'milestones', docType: 'milestones', route: '/templates/milestones', name: 'Project milestones & payment schedule',
    blank: () => ({
      title: 'Project milestone & Payment schedule', titleWidth: 406, dark: false,
      docDate: today(),
      info: [
        { label: 'Client', value: 'kaveri Ratial Ventures Pvt. Ltd.' },
        { label: 'Project', value: 'Customized ERP Solutions' },
        { label: 'Reference', value: 'Google' },
        { label: 'Total Project Value', value: '₹15,00,000/-  +  GST' },
        { label: 'Project Start Date', value: '07 December 2026' },
        { label: 'Document Date', value: longDate(today()) },
      ],
      msHeading: 'Milestone and Payments', base: 600000, showPercent: true,
      milestones: [
        { label: 'Kickoff & Discovery', percent: 20, amount: '', text: 'Approved SRS document, system architecture, and clickable UI/UX wireframes', date: '2026-12-18' },
        { label: 'UI Design & Core Setup', percent: 20, amount: '', text: 'Approved SRS document, system architecture, and clickable UI/UX wireframes', date: '2027-01-18' },
        { label: 'Order & Inventory Module', percent: 25, amount: '', text: 'Product catalogue, distributor ordering workflow, and real-time stock sync', date: '2027-02-07' },
        { label: 'Billing , Report  & UAT', percent: 20, amount: '', text: 'Approved SRS document, system architecture, and clickable UI/UX wireframes', date: '2026-12-18' },
        { label: 'Go-live and handover', percent: 15, amount: '', text: 'Approved SRS document, system architecture, and clickable UI/UX wireframes', date: '2027-01-18' },
      ],
      recurring: {
        show: true, heading: 'Recurring Charges (after go-live)', cols: ['Item', 'Amount', 'Billing', 'Starts From'],
        rows: [
          { item: 'Cloud hosting / server', amount: '₹ 8500/-', billing: 'Monthly', from: '17 Feb 2027' },
          { item: 'Annual Maintenance (AMC) / support', amount: '₹ 7,500/-', billing: 'Yearly', from: '18 Feb 2027' },
        ],
      },
      terms: {
        show: true, heading: 'Payment terms',
        items: [
          'All amounts are exclusive of GST, which will be charged as applicable.',
          'An invoice will be raised when each milestone is completed; payment is due within 7 days of the invoice date.',
          'Work on the next milestone starts after payment for the current milestone is received.',
          'If payment is delayed beyond 15 days, Codelix may pause work, and the timeline will extend by the same period.',
          'Delays caused by pending client inputs or approvals will not shift the payment due for work already delivered.',
          'Change Requests are billed separately as per the approved estimate.',
          'Final handover is done after full and final payment.',
        ].join('\n'),
      },
      bank: {
        show: true, heading: 'Bank details',
        rows: [
          { label: 'Account Name', value: 'Codelix IT Solutions Private Limited' },
          { label: 'Bank', value: 'HDFC Bank' },
          { label: 'Account Number', value: '50100469121007' },
          { label: 'IFSC', value: 'HDFC0005911' },
          { label: 'Branch', value: 'Ranjit sagar' },
          { label: 'GSTIN', value: '24AAMCC7842H1ZG' },
        ],
      },
      accept: blankAccept(),
      company: blankCompany(),
    }),
  },

  payment: {
    id: 'payment', docType: 'payment_ack', route: '/templates/payment-thanks', name: 'Thank you for your payment',
    blank: () => ({
      title: 'Payment acknowledgement', titleWidth: 406, dark: false,
      to: blankTo(), date: today(), refLabel: 'Receipt Ref.', ref: 'CLX/RCPT/2026-27/01114',
      subject: 'Subject : Payment received — Customized ERP Solutions',
      greeting: 'Dear Rajesh Patel,', intro: 'Thank you for your payment. We confirm receipt of the following:',
      rows: [
        { label: 'Invoice No.', value: 'CLX/RCPT/2026-27/01114' },
        { label: 'Amount Received', value: '₹1,20,000/-' },
        { label: 'Payment Date', value: '19 November 2026' },
        { label: 'Payment Mode', value: 'NEFT / bank Transfer' },
        { label: 'Against  Milestone', value: 'Milestone 1 / Kick off & Duscovery' },
        { label: 'Balance Pending', value: '₹4,80,000' },
      ],
      closing: 'We appreciate your timely payment. It helps us keep the project moving smoothly. The next milestone, **UI Design & Core Setup**, is planned for **08 January 2027.**',
      signoff: { regards: 'Warm regards,', name: 'Codelix Account Team', title: 'Codelix IT Solutions Private Limited' },
      company: blankCompany(),
    }),
  },

  delivery: {
    id: 'delivery', docType: 'thank_you', route: '/templates/delivery-thanks', name: 'Thank you — project delivered',
    blank: () => ({
      title: '', titleWidth: 406, dark: true,
      to: blankTo(), date: today(),
      subject: 'Subject : Thank you — Successful delivery of B2B Distributor Order & Inventory Management Portal',
      greeting: 'Dear Rajesh patel,',
      body: 'On behalf of the entire Codelix team, thank you for choosing us for **B2B Distributor Order & Inventory Management Portal**. We are happy to confirm that the project was successfully delivered and went live on **12 March 2027.**',
      head: ['Deliverable Area', 'Details'],
      rows: [
        { label: 'Module Delivered', value: 'Custom ERP Solution' },
        { label: 'User trained', value: '18 Staff members' },
        { label: 'Free Support', value: '11 April 2027' },
      ],
      paras: [
        'Your free support period runs until {{support_end_date}}. For any help, contact Codelix Support at {{codelix_support_phone}} / {{codelix_support_email}}. After this period, we would be glad to continue supporting you through our Annual Maintenance Contract (AMC).',
        'If you are happy with our work, we would be grateful for a short testimonial or a Google review. It helps us a lot as a growing company: {{codelix_review_link}}',
      ].join('\n\n'),
      supportEnd: '2027-04-11', reviewLink: '',
      signoff: { regards: 'Warm regards,', name: 'Manas Vadodaria', title: 'CEO, Codelix IT Solutions' },
      company: blankCompany(),
    }),
  },

  nda: {
    id: 'nda', docType: 'nda', route: '/templates/nda', name: 'Mutual Non-Disclosure Agreement',
    blank: () => ({
      title: 'Mutual Non-Disclosure Agreement', titleWidth: 466, dark: true,
      date: today(),
      intro: 'This Mutual Non-Disclosure Agreement (**"Agreement"**) is made on **{{date}} ("Effective Date")** between:',
      partyA: '**Codelix IT Solutions**, having its office at 404, Titanium City Centre, Prahlad Nagar, Ahmedabad, Gujarat 380015, represented by **Manas Vadodariya, CEO ("Codelix");**',
      andWord: 'and',
      partyB: '**Kaveri Retail Ventures Pvt. Ltd.**, having its office at 202, Alkapuri Arcade, R.C. Dutt Road, Vadodara, Gujarat 390007, represented by **Rajesh Patel, Operations Director** ("the Other Party").',
      parties: 'Codelix and the Other Party are each a **"Party"** and together the **"Parties".**',
      purpose: 'B2B Distributor Order & Inventory Management Portal',
      clauses: [
        { title: 'Purpose', text: '- The Parties wish to discuss and/or work together on **{{purpose}} ("Purpose")**. During this, each Party may share confidential information with the other. This Agreement protects that information.' },
        { title: 'Confidential Information', text: '- "Confidential Information" means any business, technical, financial or personal information shared by one Party (the Disclosing Party) with the other (the Receiving Party) for the **Purpose**, in any form, including source code, designs, data, prices, client lists and plans.' },
        { title: 'Exclusion', text: 'Confidential Information does not include information that:\n-- is or becomes public without any fault of the Receiving Party;\n-- was already known to the Receiving Party before disclosure, as shown by written records;\n-- is received from a third party who is legally free to share it; or\n-- is independently developed by the Receiving Party without using the Confidential Information.' },
        { title: 'Obligations of the Receiving Party', text: '- Use the Confidential Information only for the Purpose\n- Not share it with any third party without prior written consent of the Disclosing Party\n- Share it only with its employees or consultants who need to know it for the Purpose and who are bound by similar confidentiality obligations' },
        { title: 'Term', text: '- This Agreement starts on the Effective Date and stays in force for two (2) years. The duty to keep information confidential continues for three (3) years after it ends.' },
        { title: 'Return of Information', text: '- When asked, or when the Purpose ends, the Receiving Party will return or delete the Confidential Information and keep no copies, except where the law requires it.' },
        { title: 'Governing Law', text: '- This Agreement is governed by the laws of India. The courts at Ahmedabad, Gujarat will have exclusive jurisdiction.' },
      ],
      accept: { ...blankAccept('Signatures'), clientTitle: 'For the other party' },
      company: blankCompany(),
    }),
  },

  welcome: {
    id: 'welcome', docType: 'welcome', route: '/templates/welcome', name: 'Welcome letter',
    blank: () => ({
      title: 'Welcome letter', titleWidth: 466, dark: true,
      to: blankTo(), date: today(),
      subjectLabel: 'Subject:', subject: 'Welcome to Codelix — B2B Distributor Order & Inventory Management Portal',
      greeting: 'Dear Rajesh patel,',
      body: 'Thank you for choosing Codelix IT Solutions as your technology partner. We are excited to begin working with **Kaveri Retail Ventures Pvt. Ltd.** on **B2B Distributor Order & Inventory Management Portal**, and we truly value the trust you have placed in our team.\n\nThis letter introduces the people you will work with, how we will communicate, and what happens next.',
      teamCols: ['Role', 'Name', 'Phone', 'Email'],
      team: [
        { role: 'Project owner / CEO', name: 'Manas Vadodaria', phone: '+91 74909 09686', email: 'manasvadodaria@gmail.com' },
        { role: 'Project Manager', name: 'Bhargav Thesiya', phone: '+91 97250 60441', email: 'manasvadodaria@gmail.com' },
        { role: 'Technical Lead', name: 'Vachika Bhanderi', phone: '+91 97273 44569', email: 'manasvadodaria@gmail.com' },
        { role: 'Support Desk', name: 'Codelix Support', phone: '+91 94292 69295', email: 'manasvadodaria@gmail.com' },
      ],
      note: 'For day-to-day questions, please contact your Project Manager first. For anything urgent or unresolved, you can reach the Project Owner directly.',
      next: {
        show: true, heading: 'What happens next',
        items: [
          'Kick-off call within 3 working days, to confirm the scope, the plan and your point of contact.',
          'You share the logins, content and brand files we need to begin.',
          'A weekly update every Friday, with a demo at the end of each milestone.',
          'All project communication stays on one shared email thread and group.',
        ].join('\n'),
      },
      signoff: { regards: 'Warm regards,', name: 'Manas Vadodaria', title: 'CEO, Codelix IT Solutions' },
      company: blankCompany(),
    }),
  },

  sow: {
    id: 'sow', docType: 'sow', route: '/templates/sow', name: 'Scope of work',
    blank: () => ({
      title: 'Scope of work', titleWidth: 406, dark: false,
      docDate: today(),
      info: [
        { label: 'Client', value: 'Kaveri Retail Ventures Pvt. Ltd.' },
        { label: 'Project', value: 'B2B Distributor Order & Inventory Management Portal' },
        { label: 'SOW No.', value: `CLX/SOW/${fy(today())}/001` },
        { label: 'Version', value: '1.0' },
        { label: 'Duration', value: '10 weeks' },
        { label: 'Document Date', value: longDate(today()) },
      ],
      overview: {
        heading: 'Project overview',
        text: 'This document describes the work Codelix IT Solutions will carry out for the Client. It lists what is included, what will be delivered, the timeline, the cost and how changes are handled, so both sides share one clear picture before work begins.',
        objectives: [
          'Launch a reliable, fast product that the Client’s team can run without technical help.',
          'Replace manual steps with simple screens that save time every day.',
          'Deliver in clear stages, with a working demo at the end of each stage.',
        ].join('\n'),
      },
      scope: {
        heading: 'Scope of work',
        items: [
          { title: 'Discovery and planning', text: 'Workshops to understand the business, users and current process. Output: the feature list, user flows and a delivery plan.' },
          { title: 'UI and UX design', text: 'Wireframes and final screen designs for every screen, with one clickable prototype for approval.' },
          { title: 'Development', text: 'Front end, back end and database built to the approved designs, with the admin panel and required integrations.' },
          { title: 'Testing and quality', text: 'Functional, device and browser testing, plus fixing every issue found before go-live.' },
          { title: 'Launch and handover', text: 'Deployment to the live server, a walkthrough for the Client’s team and handover of source code and credentials.' },
        ],
      },
      deliverables: {
        show: true, heading: 'Deliverables', cols: ['Deliverable', 'What it includes', 'Accepted when'],
        rows: [
          { a: 'Requirements document', b: 'Feature list and user flows', c: 'Approved in writing by the Client' },
          { a: 'Design files', b: 'All screens and a clickable prototype', c: 'Approved in writing by the Client' },
          { a: 'Working application', b: 'All features in this document, on the live server', c: 'Passes the agreed test checklist' },
          { a: 'Source code and access', b: 'Repository, hosting and admin logins', c: 'Access confirmed by the Client' },
        ],
      },
      timeline: {
        show: true, heading: 'Timeline', cols: ['Phase', 'When', 'Output'],
        rows: [
          { a: 'Discovery and planning', b: 'Week 1', c: 'Signed-off requirements' },
          { a: 'Design', b: 'Weeks 2–3', c: 'Approved designs' },
          { a: 'Development', b: 'Weeks 4–8', c: 'Demo at the end of each fortnight' },
          { a: 'Testing and fixes', b: 'Week 9', c: 'Test report' },
          { a: 'Launch and handover', b: 'Week 10', c: 'Live application' },
        ],
      },
      tech: { show: true, heading: 'Technology', items: 'React\nJava Spring Boot\nPostgreSQL\nDocker' },
      cost: {
        show: true, heading: 'Cost and payments',
        rows: [
          { label: 'Project value', value: '₹6,00,000/-  +  GST' },
          { label: 'GST', value: '18%, charged as applicable' },
        ],
      },
      base: 600000, showPercent: true,
      milestones: [
        { label: 'Advance, on signing', percent: 30, amount: '', text: 'Before work starts', date: '' },
        { label: 'Design approval', percent: 20, amount: '', text: 'End of week 3', date: '' },
        { label: 'Development complete', percent: 30, amount: '', text: 'End of week 8', date: '' },
        { label: 'Go-live', percent: 20, amount: '', text: 'On launch', date: '' },
      ],
      assumptions: {
        show: true, heading: 'Assumptions',
        items: [
          'The Client gives content, logins and feedback within 2 working days of each request.',
          'One person on the Client’s side has the authority to approve designs and deliveries.',
          'Third-party costs (hosting, domain, SMS, payment gateway, paid plugins) are paid by the Client.',
        ].join('\n'),
      },
      exclusions: {
        show: true, heading: 'Not included',
        items: [
          'Content writing, photography and data entry.',
          'Features not listed in this document.',
          'Marketing, SEO campaigns and paid advertising.',
          'Maintenance after the support period, unless a separate agreement is signed.',
        ].join('\n'),
      },
      termsList: {
        show: true, heading: 'Terms',
        items: [
          { title: 'Change requests', text: 'Any work outside this document is a change request. We will share the extra cost and time in writing, and start it only after the Client approves in writing.' },
          { title: 'Revisions', text: 'Two rounds of revisions are included for each design and each delivery. Further rounds are billed as change requests.' },
          { title: 'Acceptance', text: 'The Client reviews each delivery within 5 working days. If no feedback is received in that time, the delivery is treated as accepted.' },
          { title: 'Warranty and support', text: 'Bugs reported within 30 days of go-live are fixed at no cost. New features and changes are not part of this warranty.' },
          { title: 'Ownership and confidentiality', text: 'After full payment, the Client owns the source code and designs made for this project. Both sides keep each other’s business information confidential.' },
        ],
      },
      accept: blankAccept(),
      company: blankCompany(),
    }),
  },
};

export const letterOf = id => LETTERS[id] || LETTERS.milestones;

// Fills anything an older saved draft does not have.
export function upgradeLetter(id, v) {
  const base = letterOf(id).blank();
  if (!v || typeof v !== 'object') return base;
  const out = { ...base, ...v, company: { ...base.company, ...(v.company || {}) } };
  for (const k of ['to', 'signoff', 'recurring', 'terms', 'bank', 'accept', 'next', 'overview', 'scope', 'deliverables', 'timeline', 'tech', 'cost', 'assumptions', 'exclusions', 'termsList']) if (base[k]) out[k] = { ...base[k], ...(v[k] || {}) };
  if (base.accept) out.accept.client = { ...base.accept.client, ...(v.accept?.client || {}) };
  return out;
}
const key = id => `codelix.letter.${id}`;
export const letterDraft = {
  load(id) { try { const v = JSON.parse(localStorage.getItem(key(id)) || 'null'); return v ? upgradeLetter(id, v) : null; } catch { return null; } },
  save(id, d) { try { localStorage.setItem(key(id), JSON.stringify(d)); return true; } catch { return false; } },
};

// Milestone amount: the amount typed, or its share of the value before GST.
export const msAmount = (d, m) => (m.amount !== '' && m.amount != null && !Number.isNaN(+m.amount) ? +m.amount : Math.round((+d.base || 0) * (+m.percent || 0) / 100));

// "**bold**" in any text field becomes bold on the page; {{placeholders}} are filled from `vars`.
export function fillVars(text, vars) {
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (all, k) => (vars[k] != null && vars[k] !== '' ? vars[k] : all));
}

// ── filling a letter from the app's records ─────────────────────
const toOf = (p, lead) => ({
  name: (lead?.clientName || p?.clientName || '').trim(),
  designation: lead?.designation || '',
  company: (lead?.companyName || p?.companyName || '').trim(),
  address: lead?.address || '',
});
const projectName = p => String(p?.projectName || p?.name || '').trim();

// Milestone dates: spread over the project from its start to its due date by their share.
function spreadDates(p, list) {
  if (!okIso(p.startDate) || !okIso(p.dueDate)) return list.map(() => '');
  const a = new Date(p.startDate + 'T00:00:00'), b = new Date(p.dueDate + 'T00:00:00');
  const span = (b - a) / 86400000;
  let cum = 0;
  return list.map(m => { cum += +m.percent || 0; return addDays(p.startDate, Math.round(span * Math.min(100, cum) / 100)); });
}

export function fillMilestones(d, p, lead) {
  const base = beforeGst(p);
  const ms = p.milestones || [];
  const dates = spreadDates(p, ms);
  const old = d.milestones || [];
  return {
    ...d,
    docDate: today(),
    base,
    info: [
      { label: 'Client', value: (lead?.companyName || p.companyName || p.clientName || '').trim() },
      { label: 'Project', value: projectName(p) },
      { label: 'Reference', value: lead?.source || '' },
      { label: 'Total Project Value', value: `${money(base)}/-${p.billingType === 'With GST' ? '  +  GST' : ''}` },
      { label: 'Project Start Date', value: longDate(p.startDate) },
      { label: 'Document Date', value: longDate(today()) },
    ],
    milestones: ms.length
      ? ms.map((m, i) => ({ label: m.label || `Milestone ${i + 1}`, percent: +m.percent || 0, amount: '', text: old.find(o => o.label === m.label)?.text || '', date: m.dueDate || dates[i] || '' }))
      : old,
    accept: { ...d.accept, client: { ...d.accept.client, name: (lead?.clientName || p.clientName || '').trim(), company: (lead?.companyName || p.companyName || '').trim() } },
  };
}

// Which milestone a payment belongs to: the one its running total falls in.
export function milestoneFor(p, payment) {
  const ms = p.milestones || [];
  const value = +p.valuation || 0;
  if (!ms.length || !value) return { index: -1 };
  const list = [...(p.payments || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let before = 0;
  for (const x of list) { if (x === payment || (x.id && x.id === payment.id)) break; before += +x.amount || 0; }
  const mid = before + (+payment.amount || 0) / 2;
  let cum = 0;
  for (let i = 0; i < ms.length; i++) {
    cum += value * (+ms[i].percent || 0) / 100;
    if (mid <= cum + 0.5) return { index: i, paidTo: before + (+payment.amount || 0) };
  }
  return { index: ms.length - 1, paidTo: before + (+payment.amount || 0) };
}

export function fillPayment(d, p, payment, lead) {
  const to = toOf(p, lead);
  const ms = p.milestones || [];
  const { index } = milestoneFor(p, payment);
  const list = [...(p.payments || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const n = Math.max(1, list.findIndex(x => x === payment || (x.id && x.id === payment.id)) + 1);
  const ref = `CLX/RCPT/${fy(payment.date)}/${(p.key || 'PRJ').toUpperCase()}-${pad(n)}`;
  const paid = list.slice(0, n).reduce((s, x) => s + (+x.amount || 0), 0);
  const balance = Math.max(0, (+p.valuation || 0) - paid);
  const next = index >= 0 ? ms[index + 1] : null;
  const mode = [payment.method, payment.account].filter(Boolean).join(' / ') || 'Bank Transfer';
  return {
    ...d,
    to: { ...d.to, ...to },
    date: today(), ref,
    subject: `Subject : Payment received — ${projectName(p)}`,
    greeting: `Dear ${to.name || 'Sir/Madam'},`,
    rows: [
      { label: 'Invoice No.', value: ref },
      { label: 'Amount Received', value: `${money(payment.amount)}/-` },
      { label: 'Payment Date', value: longDate(payment.date) },
      { label: 'Payment Mode', value: mode },
      { label: 'Against  Milestone', value: index >= 0 ? `Milestone ${index + 1} / ${ms[index].label}` : 'Project payment' },
      { label: 'Balance Pending', value: balance ? money(balance) : 'Nil — fully paid' },
    ],
    closing: next
      ? `We appreciate your timely payment. It helps us keep the project moving smoothly. The next milestone, **${next.label}**${p.nextPaymentDue ? `, is planned for **${longDate(p.nextPaymentDue)}.**` : ', is now under way.'}`
      : balance ? 'We appreciate your timely payment. It helps us keep the project moving smoothly.'
        : 'We appreciate your timely payment. With this, the project is fully paid. Thank you for your trust in Codelix.',
  };
}

export function fillDelivery(d, p, lead, supportDays = 30) {
  const to = toOf(p, lead);
  const live = okIso(p.dueDate) && p.dueDate <= today() ? p.dueDate : today();
  const supportEnd = addDays(live, supportDays);
  const name = projectName(p);
  return {
    ...d,
    to: { ...d.to, ...to }, date: today(), supportEnd,
    subject: `Subject : Thank you — Successful delivery of ${name}`,
    greeting: `Dear ${to.name || 'Sir/Madam'},`,
    body: `On behalf of the entire Codelix team, thank you for choosing us for **${name}**. We are happy to confirm that the project was successfully delivered and went live on **${longDate(live)}.**`,
    rows: [
      { label: 'Module Delivered', value: p.projectType || name },
      { label: 'User trained', value: '' },
      { label: 'Free Support', value: longDate(supportEnd) },
    ],
  };
}

export function fillNda(d, { p, lead } = {}) {
  const company = (lead?.companyName || p?.companyName || lead?.clientName || p?.clientName || '').trim();
  const person = (lead?.clientName || p?.clientName || '').trim();
  const address = lead?.address ? `, having its office at ${lead.address}` : '';
  const rep = person ? `, represented by **${person}${lead?.designation ? `, ${lead.designation}` : ''}**` : '';
  return {
    ...d,
    date: today(),
    partyB: `**${company || 'Client company'}**${address}${rep} ("the Other Party").`,
    purpose: projectName(p) || lead?.projectType || d.purpose,
    accept: { ...d.accept, client: { ...d.accept.client, name: person, company } },
  };
}

export function fillWelcome(d, { p, lead } = {}) {
  const to = toOf(p, lead);
  const name = projectName(p) || lead?.projectType || 'your project';
  const company = to.company || to.name || 'your team';
  const team = (d.team || []).map(r => (/manager/i.test(r.role) && p?.handledBy ? { ...r, name: p.handledBy } : r));
  return {
    ...d,
    to: { ...d.to, ...to }, date: today(), team,
    subject: `Welcome to Codelix — ${name}`,
    greeting: `Dear ${to.name || 'Sir/Madam'},`,
    body: `Thank you for choosing Codelix IT Solutions as your technology partner. We are excited to begin working with **${company}** on **${name}**, and we truly value the trust you have placed in our team.\n\nThis letter introduces the people you will work with, how we will communicate, and what happens next.`,
  };
}

export function fillSow(d, { p, lead } = {}) {
  const company = (lead?.companyName || p?.companyName || lead?.clientName || p?.clientName || '').trim();
  const person = (lead?.clientName || p?.clientName || '').trim();
  const base = p ? beforeGst(p) : (+lead?.finalPrice || +lead?.proposalValue || 0);
  const gst = p?.billingType === 'With GST';
  const ms = p?.milestones || [];
  const dates = p ? spreadDates(p, ms) : [];
  const info = (d.info || []).map(r => {
    if (r.label === 'Client') return { ...r, value: company };
    if (r.label === 'Project') return { ...r, value: projectName(p) || lead?.projectType || r.value };
    if (r.label === 'SOW No.') return { ...r, value: `CLX/SOW/${fy(today())}/${(p?.key || '001').toUpperCase()}` };
    if (r.label === 'Document Date') return { ...r, value: longDate(today()) };
    return r;
  });
  return {
    ...d,
    docDate: today(), info,
    base: base || d.base,
    cost: { ...d.cost, rows: base ? [{ label: 'Project value', value: `${money(base)}/-${gst ? '  +  GST' : ''}` }, ...(gst ? [{ label: 'GST', value: '18%, charged as applicable' }] : [])] : d.cost.rows },
    milestones: ms.length ? ms.map((m, i) => ({ label: m.label || `Milestone ${i + 1}`, percent: +m.percent || 0, amount: '', text: '', date: dates[i] || '' })) : d.milestones,
    accept: { ...d.accept, client: { ...d.accept.client, name: person, company } },
  };
}

export const letterPdfName = (id, d) => {
  const who = d.to?.company || d.accept?.client?.company || d.info?.[0]?.value || '';
  return `${letterOf(id).name} - ${who || 'draft'}`.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 110).replace(/[.\s]+$/, '') + '.pdf';
};
