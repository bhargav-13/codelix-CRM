// Builder for the short letters (milestones & payment schedule, payment thank-you, delivery
// thank-you, mutual NDA). Every field of the letter is on the left, one part at a time; the pages
// are on the right. A project, payment or CRM lead can fill it in, and the Projects and CRM pages
// open it already filled when a milestone, payment, delivery or won lead is saved.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Field, FormGrid, useToast, fmtMoney, fmtDate } from '../components/ui/kit';
import { useMeSummary } from '../components/layout/shell';
import LetterDocument from '../components/letters/LetterDocument';
import SendEmail from '../components/templates/SendEmail';
import { Sec, Rows, ImagePick, Toggle, AutoArea } from '../components/templates/FormBits';
import { clientsDB, projectsDB } from '../lib/db';
import { uploadFile } from '../lib/files';
import { documentsDB } from '../lib/documents';
import { pagesToPdf, downloadBlob } from '../lib/pdf';
import { shrinkImage } from '../lib/sow';
import { PAGE_W, PAGE_H } from '../lib/proposal';
import {
  LETTER_FONT_LINK, PDF_MM, letterOf, letterDraft, msAmount, money,
  fillMilestones, fillPayment, fillDelivery, fillNda, fillWelcome, fillSow, letterPdfName,
} from '../lib/letters';
import { ArrowLeft, ArrowRight, Download, Eye, FolderPlus, X, RotateCcw, AlertTriangle, ZoomIn, ZoomOut, Wand2, Send } from 'lucide-react';
import './SowBuilder.css';
import './ProposalBuilder.css';

// ── reading and writing a value at a dotted path ('to.name', 'head.0') ──
const getIn = (o, path) => (path ? path.split('.').reduce((x, k) => (x == null ? x : x[k]), o) : undefined);
const setIn = (o, path, value) => {
  const [k, ...rest] = path.split('.');
  const copy = Array.isArray(o) ? [...o] : { ...(o || {}) };
  copy[k] = rest.length ? setIn(o?.[k], rest.join('.'), value) : value;
  return copy;
};

// ── the form for each letter: steps of fields ──
// field: { t: text|area|date|num|toggle|rows|grid|note, p: path, label, hint, ... }
const SIGN_FIELDS = [
  { t: 'grid', items: [
    { t: 'text', p: 'accept.clientTitle', label: 'Client box heading' },
    { t: 'text', p: 'accept.ourTitle', label: 'Our box heading' },
    { t: 'text', p: 'accept.client.name', label: 'Client signs as' },
    { t: 'text', p: 'accept.client.designation', label: 'Their designation' },
    { t: 'text', p: 'accept.client.company', label: 'Client company' },
    { t: 'date', p: 'accept.client.date', label: 'Client signing date', hint: 'Empty prints DD/MM/YYYY.' },
    { t: 'text', p: 'accept.signHint', label: 'Text in the signature space' },
  ] },
];
const COMPANY_FIELDS = [
  { t: 'grid', items: [
    { t: 'text', p: 'company.signatory', label: 'Signed by' },
    { t: 'text', p: 'company.signatoryTitle', label: 'Their designation' },
    { t: 'text', p: 'company.name', label: 'Company name' },
    { t: 'text', p: 'company.phone', label: 'Phone' },
    { t: 'text', p: 'company.email', label: 'Email' },
    { t: 'text', p: 'company.footerBrand', label: 'Footer: name' },
  ] },
  { t: 'text', p: 'company.footerRest', label: 'Footer: the rest of the line' },
  { t: 'image', p: 'company.signature', label: 'Signature', hint: 'Optional. Placed in our signature box.' },
];
const TO_FIELDS = [
  { t: 'grid', items: [
    { t: 'text', p: 'to.name', label: 'To (name)' },
    { t: 'text', p: 'to.designation', label: 'Designation' },
    { t: 'text', p: 'to.company', label: 'Company' },
    { t: 'text', p: 'to.address', label: 'City / address' },
    { t: 'date', p: 'date', label: 'Date' },
  ] },
];
const BOLD_HINT = 'Put **two stars** around words to make them bold.';

const FORMS = {
  milestones: [
    { id: 'details', label: 'Details', block: 'info', fields: [
      { t: 'text', p: 'title', label: 'Title at the top right' },
      { t: 'date', p: 'docDate', label: 'Document date', hint: 'Also the date in our signature box.' },
      { t: 'rows', p: 'info', label: 'Project details', name: 'Row', blank: { label: '', value: '' }, add: 'Add row', cols: [{ k: 'label', label: 'Label', w: 170 }, { k: 'value', label: 'Value' }] },
    ] },
    { id: 'milestones', label: 'Milestones', block: 'ms-h', fields: [
      { t: 'grid', items: [
        { t: 'text', p: 'msHeading', label: 'Heading' },
        { t: 'num', p: 'base', label: 'Value the % applies to (₹)', hint: 'Before GST.' },
      ] },
      { t: 'toggle', p: 'showPercent', label: 'Show the % next to each name' },
      { t: 'rows', p: 'milestones', label: 'Milestones (amount: leave empty to use its %)', name: 'Milestone', blank: { label: '', percent: '', amount: '', text: '', date: '' }, add: 'Add milestone',
        cols: [{ k: 'label', label: 'Name' }, { k: 'percent', label: '%', num: true, w: 64 }, { k: 'amount', label: 'Amount (auto)', num: true, w: 120 }, { k: 'date', label: 'Date', date: true, w: 150 }, { k: 'text', label: 'What is delivered', area: true }] },
    ] },
    { id: 'recurring', label: 'Recurring', block: 'rc-h', show: 'recurring.show', fields: [
      { t: 'toggle', p: 'recurring.show', label: 'Show recurring charges' },
      { t: 'text', p: 'recurring.heading', label: 'Heading', when: 'recurring.show' },
      { t: 'rows', p: 'recurring.rows', when: 'recurring.show', label: 'Charges', name: 'Charge', blank: { item: '', amount: '', billing: 'Monthly', from: '' }, add: 'Add charge',
        cols: [{ k: 'item', label: 'Item' }, { k: 'amount', label: 'Amount', w: 110 }, { k: 'billing', label: 'Billing', w: 100 }, { k: 'from', label: 'Starts from', w: 120 }] },
    ] },
    { id: 'terms', label: 'Terms', block: 'pt-h', show: 'terms.show', fields: [
      { t: 'toggle', p: 'terms.show', label: 'Show payment terms' },
      { t: 'text', p: 'terms.heading', label: 'Heading', when: 'terms.show' },
      { t: 'area', p: 'terms.items', label: 'Terms', hint: `One per line. ${BOLD_HINT}`, when: 'terms.show' },
    ] },
    { id: 'bank', label: 'Bank', block: 'bk-h', show: 'bank.show', fields: [
      { t: 'toggle', p: 'bank.show', label: 'Show bank details' },
      { t: 'text', p: 'bank.heading', label: 'Heading', when: 'bank.show' },
      { t: 'rows', p: 'bank.rows', when: 'bank.show', label: 'Details', name: 'Row', blank: { label: '', value: '' }, add: 'Add row', cols: [{ k: 'label', label: 'Label', w: 170 }, { k: 'value', label: 'Value' }] },
    ] },
    { id: 'accept', label: 'Acceptance', block: 'ac-h', show: 'accept.show', fields: [
      { t: 'toggle', p: 'accept.show', label: 'Show the signature boxes' },
      { t: 'text', p: 'accept.heading', label: 'Heading', when: 'accept.show' },
      ...SIGN_FIELDS.map(f => ({ ...f, when: 'accept.show' })),
    ] },
    { id: 'company', label: 'Company', block: 'ac-s', fields: COMPANY_FIELDS },
  ],
  payment: [
    { id: 'letter', label: 'Letter', block: 'to', fields: [
      { t: 'text', p: 'title', label: 'Title at the top right', hint: 'Leave empty for none.' },
      ...TO_FIELDS,
      { t: 'grid', items: [{ t: 'text', p: 'refLabel', label: 'Reference label' }, { t: 'text', p: 'ref', label: 'Receipt reference' }] },
      { t: 'text', p: 'subject', label: 'Subject' },
      { t: 'text', p: 'greeting', label: 'Greeting' },
      { t: 'text', p: 'intro', label: 'Line before the table' },
    ] },
    { id: 'payment', label: 'Payment', block: 'rows', fields: [
      { t: 'rows', p: 'rows', label: 'Payment details', name: 'Row', blank: { label: '', value: '' }, add: 'Add row', cols: [{ k: 'label', label: 'Label', w: 170 }, { k: 'value', label: 'Value' }] },
      { t: 'area', p: 'closing', label: 'Closing paragraph', hint: BOLD_HINT },
    ] },
    { id: 'signoff', label: 'Sign-off', block: 'signoff', fields: [
      { t: 'grid', items: [
        { t: 'text', p: 'signoff.regards', label: 'Closing word' },
        { t: 'text', p: 'signoff.name', label: 'Name' },
        { t: 'text', p: 'signoff.title', label: 'Title / company' },
      ] },
      ...COMPANY_FIELDS,
    ] },
  ],
  delivery: [
    { id: 'letter', label: 'Letter', block: 'to', fields: [
      { t: 'text', p: 'title', label: 'Title at the top right', hint: 'Leave empty for none, as in the design.' },
      ...TO_FIELDS,
      { t: 'area', p: 'subject', label: 'Subject' },
      { t: 'text', p: 'greeting', label: 'Greeting' },
      { t: 'area', p: 'body', label: 'First paragraph', hint: BOLD_HINT },
    ] },
    { id: 'details', label: 'Details', block: 'table', fields: [
      { t: 'grid', items: [{ t: 'text', p: 'head.0', label: 'Table: first heading' }, { t: 'text', p: 'head.1', label: 'Table: second heading' }] },
      { t: 'rows', p: 'rows', label: 'What was delivered', name: 'Row', blank: { label: '', value: '' }, add: 'Add row', cols: [{ k: 'label', label: 'Label', w: 170 }, { k: 'value', label: 'Details' }] },
      { t: 'grid', items: [{ t: 'date', p: 'supportEnd', label: 'Free support until' }, { t: 'text', p: 'reviewLink', label: 'Google review link' }] },
      { t: 'area', p: 'paras', label: 'Closing paragraphs', hint: `An empty line starts a new paragraph. {{support_end_date}}, {{codelix_support_phone}}, {{codelix_support_email}} and {{codelix_review_link}} are filled in. ${BOLD_HINT}` },
    ] },
    { id: 'signoff', label: 'Sign-off', block: 'signoff', fields: [
      { t: 'grid', items: [
        { t: 'text', p: 'signoff.regards', label: 'Closing word' },
        { t: 'text', p: 'signoff.name', label: 'Name' },
        { t: 'text', p: 'signoff.title', label: 'Title / company' },
      ] },
      ...COMPANY_FIELDS,
    ] },
  ],
  welcome: [
    { id: 'letter', label: 'Letter', block: 'to', fields: [
      { t: 'text', p: 'title', label: 'Title at the top right', hint: 'Leave empty for none.' },
      ...TO_FIELDS,
      { t: 'grid', items: [{ t: 'text', p: 'subjectLabel', label: 'Subject label' }, { t: 'text', p: 'subject', label: 'Subject' }] },
      { t: 'text', p: 'greeting', label: 'Greeting' },
      { t: 'area', p: 'body', label: 'Letter', hint: `An empty line starts a new paragraph. ${BOLD_HINT}` },
    ] },
    { id: 'team', label: 'Team', block: 'team', fields: [
      { t: 'grid', items: [0, 1, 2, 3].map(i => ({ t: 'text', p: `teamCols.${i}`, label: `Column ${i + 1}` })) },
      { t: 'rows', p: 'team', label: 'The people the client will work with', name: 'Person', blank: { role: '', name: '', phone: '', email: '' }, add: 'Add person',
        cols: [{ k: 'role', label: 'Role' }, { k: 'name', label: 'Name' }, { k: 'phone', label: 'Phone', w: 150 }, { k: 'email', label: 'Email' }] },
      { t: 'area', p: 'note', label: 'Note under the table' },
    ] },
    { id: 'next', label: 'Next steps', block: 'next-h', show: 'next.show', fields: [
      { t: 'toggle', p: 'next.show', label: 'Show what happens next' },
      { t: 'text', p: 'next.heading', label: 'Heading', when: 'next.show' },
      { t: 'area', p: 'next.items', label: 'Steps', hint: 'One per line.', when: 'next.show' },
    ] },
    { id: 'signoff', label: 'Sign-off', block: 'signoff', fields: [
      { t: 'grid', items: [
        { t: 'text', p: 'signoff.regards', label: 'Closing word' },
        { t: 'text', p: 'signoff.name', label: 'Name' },
        { t: 'text', p: 'signoff.title', label: 'Title / company' },
      ] },
      ...COMPANY_FIELDS,
    ] },
  ],
  sow: [
    { id: 'details', label: 'Details', block: 'info', fields: [
      { t: 'text', p: 'title', label: 'Title at the top right' },
      { t: 'date', p: 'docDate', label: 'Document date', hint: 'Also the date in our signature box.' },
      { t: 'rows', p: 'info', label: 'Project details', name: 'Row', blank: { label: '', value: '' }, add: 'Add row', cols: [{ k: 'label', label: 'Label', w: 170 }, { k: 'value', label: 'Value' }] },
    ] },
    { id: 'overview', label: 'Overview', block: 'ov-h', fields: [
      { t: 'text', p: 'overview.heading', label: 'Heading' },
      { t: 'area', p: 'overview.text', label: 'Overview', hint: `An empty line starts a new paragraph. ${BOLD_HINT}` },
      { t: 'area', p: 'overview.objectives', label: 'Objectives', hint: 'One per line. Leave empty for none.' },
    ] },
    { id: 'scope', label: 'Scope', block: 'sc-h', fields: [
      { t: 'text', p: 'scope.heading', label: 'Heading' },
      { t: 'rows', p: 'scope.items', label: 'What is included', name: 'Scope item', blank: { title: '', text: '' }, add: 'Add scope item', cols: [{ k: 'title', label: 'Title' }, { k: 'text', label: 'What is included', area: true }] },
    ] },
    { id: 'deliverables', label: 'Deliverables', block: 'dl-h', show: 'deliverables.show', fields: [
      { t: 'toggle', p: 'deliverables.show', label: 'Show deliverables' },
      { t: 'text', p: 'deliverables.heading', label: 'Heading', when: 'deliverables.show' },
      { t: 'grid', when: 'deliverables.show', items: [0, 1, 2].map(i => ({ t: 'text', p: `deliverables.cols.${i}`, label: `Column ${i + 1}` })) },
      { t: 'rows', p: 'deliverables.rows', when: 'deliverables.show', label: 'Deliverables', name: 'Deliverable', blank: { a: '', b: '', c: '' }, add: 'Add deliverable', cols: [{ k: 'a', label: 'Deliverable' }, { k: 'b', label: 'What it includes' }, { k: 'c', label: 'Accepted when' }] },
    ] },
    { id: 'timeline', label: 'Timeline', block: 'tl-h', show: 'timeline.show', fields: [
      { t: 'toggle', p: 'timeline.show', label: 'Show the timeline' },
      { t: 'text', p: 'timeline.heading', label: 'Heading', when: 'timeline.show' },
      { t: 'grid', when: 'timeline.show', items: [0, 1, 2].map(i => ({ t: 'text', p: `timeline.cols.${i}`, label: `Column ${i + 1}` })) },
      { t: 'rows', p: 'timeline.rows', when: 'timeline.show', label: 'Phases', name: 'Phase', blank: { a: '', b: '', c: '' }, add: 'Add phase', cols: [{ k: 'a', label: 'Phase' }, { k: 'b', label: 'When', w: 130 }, { k: 'c', label: 'Output' }] },
      { t: 'toggle', p: 'tech.show', label: 'Show the technology section' },
      { t: 'text', p: 'tech.heading', label: 'Technology heading', when: 'tech.show' },
      { t: 'area', p: 'tech.items', label: 'Technology', hint: 'One per line.', when: 'tech.show' },
    ] },
    { id: 'cost', label: 'Cost', block: 'cost-h', show: 'cost.show', fields: [
      { t: 'toggle', p: 'cost.show', label: 'Show cost and payments' },
      { t: 'text', p: 'cost.heading', label: 'Heading', when: 'cost.show' },
      { t: 'rows', p: 'cost.rows', when: 'cost.show', label: 'Cost', name: 'Row', blank: { label: '', value: '' }, add: 'Add row', cols: [{ k: 'label', label: 'Label', w: 170 }, { k: 'value', label: 'Value' }] },
      { t: 'num', p: 'base', label: 'Value the % applies to (₹)', hint: 'Before GST.', when: 'cost.show' },
      { t: 'toggle', p: 'showPercent', label: 'Show the % next to each stage', when: 'cost.show' },
      { t: 'rows', p: 'milestones', when: 'cost.show', label: 'Payment stages (amount: leave empty to use its %)', name: 'Stage', blank: { label: '', percent: '', amount: '', text: '', date: '' }, add: 'Add payment stage',
        cols: [{ k: 'label', label: 'Stage' }, { k: 'percent', label: '%', num: true, w: 64 }, { k: 'amount', label: 'Amount (auto)', num: true, w: 120 }, { k: 'date', label: 'Date', date: true, w: 150 }, { k: 'text', label: 'When it is due' }] },
    ] },
    { id: 'limits', label: 'Assumptions', block: 'as-h', fields: [
      { t: 'toggle', p: 'assumptions.show', label: 'Show assumptions' },
      { t: 'text', p: 'assumptions.heading', label: 'Heading', when: 'assumptions.show' },
      { t: 'area', p: 'assumptions.items', label: 'Assumptions', hint: 'One per line.', when: 'assumptions.show' },
      { t: 'toggle', p: 'exclusions.show', label: 'Show what is not included' },
      { t: 'text', p: 'exclusions.heading', label: 'Heading', when: 'exclusions.show' },
      { t: 'area', p: 'exclusions.items', label: 'Not included', hint: 'One per line.', when: 'exclusions.show' },
    ] },
    { id: 'terms', label: 'Terms', block: 'tm-h', show: 'termsList.show', fields: [
      { t: 'toggle', p: 'termsList.show', label: 'Show terms' },
      { t: 'text', p: 'termsList.heading', label: 'Heading', when: 'termsList.show' },
      { t: 'rows', p: 'termsList.items', when: 'termsList.show', label: 'Terms', name: 'Term', blank: { title: '', text: '' }, add: 'Add term', cols: [{ k: 'title', label: 'Title' }, { k: 'text', label: 'Text', area: true }] },
    ] },
    { id: 'accept', label: 'Acceptance', block: 'ac-h', show: 'accept.show', fields: [
      { t: 'toggle', p: 'accept.show', label: 'Show the signature boxes' },
      { t: 'text', p: 'accept.heading', label: 'Heading', when: 'accept.show' },
      ...SIGN_FIELDS.map(f => ({ ...f, when: 'accept.show' })),
      ...COMPANY_FIELDS,
    ] },
  ],
  nda: [
    { id: 'parties', label: 'Parties', block: 'intro', fields: [
      { t: 'grid', items: [{ t: 'text', p: 'title', label: 'Title at the top right' }, { t: 'date', p: 'date', label: 'Effective date' }] },
      { t: 'text', p: 'purpose', label: 'Purpose (project)', hint: 'Fills {{purpose}} in the clauses.' },
      { t: 'area', p: 'intro', label: 'Opening line', hint: `{{date}} is the effective date. ${BOLD_HINT}` },
      { t: 'area', p: 'partyA', label: 'Codelix', hint: BOLD_HINT },
      { t: 'text', p: 'andWord', label: 'Word between the parties' },
      { t: 'area', p: 'partyB', label: 'The other party', hint: BOLD_HINT },
      { t: 'area', p: 'parties', label: 'Line after the box' },
    ] },
    { id: 'clauses', label: 'Clauses', block: 'cl-h0', fields: [
      { t: 'note', text: 'Lines starting with "- " are bullets, "-- " are bullets one step in. These clauses are a plain starting point; have a lawyer review the agreement before you rely on it.' },
      { t: 'rows', p: 'clauses', label: 'Clauses', name: 'Clause', blank: { title: '', text: '- ' }, add: 'Add clause', cols: [{ k: 'title', label: 'Heading' }, { k: 'text', label: 'Text', area: true, rows: 4 }] },
    ] },
    { id: 'sign', label: 'Signatures', block: 'ac-h', fields: [
      { t: 'toggle', p: 'accept.show', label: 'Show the signature boxes' },
      { t: 'text', p: 'accept.heading', label: 'Heading', when: 'accept.show' },
      ...SIGN_FIELDS.map(f => ({ ...f, when: 'accept.show' })),
      ...COMPANY_FIELDS,
    ] },
  ],
};

export default function LetterBuilder({ kind }) {
  const def = letterOf(kind);
  const steps = FORMS[kind];
  const toast = useToast();
  const me = useMeSummary();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [d, setD] = useState(() => letterDraft.load(kind) || def.blank());
  const [step, setStep] = useState(steps[0].id);
  const [projects, setProjects] = useState([]);
  const [leads, setLeads] = useState([]);
  const [pick, setPick] = useState({ project: '', payment: '', lead: '' });
  const [info, setInfo] = useState({ pages: 0, overflow: [] });
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState('');
  const [preview, setPreview] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [zoom, setZoom] = useState('page');
  const [box, setBox] = useState({ w: 600, h: 800 });
  const stage = useRef(null);
  const root = useRef(null);
  const printRef = useRef(null);
  const applied = useRef(false);

  useEffect(() => {
    if (document.getElementById('letter-fonts')) return;
    const link = document.createElement('link');
    link.id = 'letter-fonts'; link.rel = 'stylesheet'; link.href = LETTER_FONT_LINK;
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    projectsDB.getAll().then(setProjects).catch(() => {});
    clientsDB.getAll().then(setLeads).catch(() => {});
  }, []);

  useEffect(() => { const t = setTimeout(() => letterDraft.save(kind, d), 400); return () => clearTimeout(t); }, [kind, d]);

  // The preview takes the rest of the window under the sticky page header.
  useEffect(() => {
    const el = root.current, head = document.querySelector('.page-header');
    if (!el || !head) return undefined;
    const fit = () => el.style.setProperty('--pp-head', `${Math.round(head.getBoundingClientRect().height)}px`);
    fit();
    const ro = new ResizeObserver(fit); ro.observe(head);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = stage.current;
    if (!el) return undefined;
    const fit = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fitWidth = Math.max(0.12, (box.w - 32) / PAGE_W);
  const fitPage = Math.max(0.12, Math.min(fitWidth, (box.h - 32) / PAGE_H));
  const scale = zoom === 'page' ? fitPage : zoom === 'width' ? Math.min(1, fitWidth) : Math.min(1, zoom / 100);
  const pct = Math.round(scale * 100);
  const ZOOMS = [15, 20, 25, 30, 35, 40, 50, 60, 70, 85, 100];
  const zoomBy = dir => setZoom(dir > 0 ? (ZOOMS.find(x => x > pct) || 100) : ([...ZOOMS].reverse().find(x => x < pct) || 15));

  const up = useCallback((path, value) => setD(prev => setIn(prev, path, value)), []);

  // ── filling from a project, payment or lead ──
  const leadFor = useCallback(p => leads.find(l => (l.id && p?.leadId && l.id === p.leadId)
    || [l.companyName, l.clientName].some(n => n && [p?.companyName, p?.clientName].some(m => m && String(m).trim().toLowerCase() === String(n).trim().toLowerCase()))), [leads]);

  const fillFrom = useCallback(({ project, paymentId, lead }, quiet) => {
    const base = def.blank();
    setD(prev => {
      const keep = { ...base, company: prev.company, logo: prev.logo };
      if (kind === 'milestones' && project) return fillMilestones({ ...keep, terms: prev.terms, bank: prev.bank, recurring: prev.recurring }, project, leadFor(project));
      if (kind === 'payment' && project) {
        const pay = (project.payments || []).find(x => String(x.id) === String(paymentId)) || (project.payments || []).slice(-1)[0];
        return pay ? fillPayment({ ...keep, signoff: prev.signoff }, project, pay, leadFor(project)) : prev;
      }
      if (kind === 'delivery' && project) return fillDelivery({ ...keep, signoff: prev.signoff, reviewLink: prev.reviewLink }, project, leadFor(project));
      if (kind === 'nda' && (project || lead)) return fillNda({ ...keep, clauses: prev.clauses }, { p: project, lead: lead || leadFor(project) });
      if (kind === 'welcome' && (project || lead)) return fillWelcome({ ...keep, team: prev.team, note: prev.note, next: prev.next, signoff: prev.signoff }, { p: project, lead: lead || leadFor(project) });
      if (kind === 'sow' && (project || lead)) return fillSow({ ...prev }, { p: project, lead: lead || leadFor(project) });
      return prev;
    });
    if (!quiet) toast.success(`Filled from ${project ? (project.projectName || 'the project') : (lead?.companyName || lead?.clientName || 'the lead')}`);
  }, [def, kind, leadFor, toast]);

  // Opened from Projects or the CRM (router state), or with ?project= / ?lead= in the address.
  useEffect(() => {
    if (applied.current) return;
    const st = location.state || {};
    const pid = params.get('project'), lid = params.get('lead');
    if (st.project || st.lead) {
      applied.current = true;
      fillFrom({ project: st.project, paymentId: st.paymentId, lead: st.lead });
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if ((pid && projects.length) || (lid && leads.length)) {
      applied.current = true;
      const project = pid ? projects.find(p => String(p.id) === pid) : null;
      const lead = lid ? leads.find(l => String(l.id) === lid) : null;
      if (project || lead) fillFrom({ project, paymentId: params.get('payment'), lead });
      navigate(location.pathname, { replace: true });
    }
  }, [location, params, projects, leads, fillFrom, navigate]);

  const pickedProject = projects.find(p => String(p.id) === pick.project);
  const payments = useMemo(() => [...(pickedProject?.payments || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))), [pickedProject]);

  // ── preview follows the form ──
  const jumpTo = useCallback(name => {
    const st = stage.current;
    const node = name && st?.querySelector(`.pp-pages [data-b="${name}"]`);
    if (!node) return;
    const sr = st.getBoundingClientRect(), r = node.getBoundingClientRect();
    if (r.top >= sr.top && r.bottom <= sr.bottom) return;
    st.scrollTo({ top: Math.max(0, st.scrollTop + r.top - sr.top - 24), behavior: 'smooth' });
  }, []);
  useEffect(() => { const s = steps.find(x => x.id === step); const t = setTimeout(() => jumpTo(s?.block), 60); return () => clearTimeout(t); }, [step, steps, jumpTo]);

  async function pickImage(file, path) {
    if (!file) return;
    try { up(path, await shrinkImage(file, { max: 600, png: true })); } catch (err) { toast.error('Could not use this image', err); }
  }

  // ── PDF ──
  const makePdf = useCallback(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    for (let i = 0; i < 4; i++) await frame();
    if (document.fonts?.ready) await document.fonts.ready;
    await frame();
    try {
      const nodes = Array.from(printRef.current?.querySelectorAll('.lt-page') || []);
      if (!nodes.length) throw new Error('There are no pages to export.');
      return await pagesToPdf(nodes, (n, of) => setProgress(`Page ${n} of ${of}`), { size: PDF_MM, scale: 1.5 });
    } finally { setProgress(''); }
  }, []);
  const clientName = (d.to?.company || d.accept?.client?.company || d.info?.find(r => r.label === 'Client')?.value || '').trim();
  async function run(kindOfRun) {
    if (busy) return;
    if (kindOfRun === 'save' && !clientName) { toast.error('Enter the client company first', new Error('The PDF is saved under that client in Client documents.')); return; }
    setBusy(kindOfRun);
    try {
      const blob = await makePdf();
      const name = letterPdfName(kind, d);
      if (kindOfRun === 'preview') setPreview({ url: URL.createObjectURL(blob), blob, name });
      else if (kindOfRun === 'download') { downloadBlob(blob, name); toast.success('PDF downloaded'); }
      else await saveCopy(blob);
    } catch (err) { toast.error('Could not make the PDF', err); } finally { setBusy(null); }
  }
  async function saveCopy(blob) {
    const stored = await uploadFile(new File([blob], letterPdfName(kind, d), { type: 'application/pdf' }));
    await documentsDB.add({ id: stored.id, client: clientName, type: def.docType, title: def.name, name: stored.name, size: stored.size, contentType: 'application/pdf', uploadedAt: new Date().toISOString(), uploadedBy: me.name });
    toast.success(`Saved under ${clientName} in Client documents`);
  }

  // ── Send by email ──
  const [mailOpen, setMailOpen] = useState(false);
  const pdfForMail = useCallback(async () => {
    setBusy('mail');
    try { return await makePdf(); } finally { setBusy(null); }
  }, [makePdf]);
  const mailDefaults = useMemo(() => {
    const company = clientName.toLowerCase();
    const person = (d.to?.name || d.accept?.client?.name || '').trim();
    const lead = leads.find(l => [l.companyName, l.clientName].some(n => n && [company, person.toLowerCase()].includes(String(n).trim().toLowerCase())));
    const dear = `Dear ${person || lead?.clientName || 'Sir/Madam'},`;
    const sign = `Warm regards,\n${d.signoff?.name || d.company.signatory || ''}\n${d.company.short || 'Codelix IT Solutions'}`;
    const project = d.info?.find(r => r.label === 'Project')?.value || d.purpose || '';
    const subj = String(d.subject || '').replace(/^\s*subject\s*:\s*/i, '').trim();
    const by = {
      milestones: { subject: `Project milestones & payment schedule${project ? ` — ${project}` : ''}`, body: `Please find attached the milestone and payment schedule${project ? ` for ${project}` : ''}: each milestone, its amount and its date, with our payment terms and bank details.` },
      payment: { subject: subj || 'Payment received — thank you', body: 'Thank you for your payment. Please find attached our acknowledgement with the details of the amount received and the balance.' },
      delivery: { subject: subj || 'Thank you — project delivered', body: 'Thank you for choosing Codelix. Please find attached our letter confirming the delivery of your project, with your free support details.' },
      welcome: { subject: subj || 'Welcome to Codelix', body: 'Welcome aboard! Please find attached our welcome letter. It introduces the team you will work with, how we will communicate and what happens next.' },
      sow: { subject: `Scope of work${project ? ` — ${project}` : ''}`, body: `Please find attached the scope of work${project ? ` for ${project}` : ''}: what is included, the deliverables, timeline, cost and terms. Kindly review it and send us a signed copy, or let us know any changes.` },
      nda: { subject: `Mutual Non-Disclosure Agreement — Codelix IT Solutions & ${clientName || 'you'}`, body: 'Please find attached the mutual non-disclosure agreement. Kindly review it, sign it and send a copy back to us. Do let us know if you would like any changes.' },
    }[kind];
    return { to: lead?.email || '', subject: by.subject, message: `${dear}\n\n${by.body}\n\n${sign}` };
  }, [d, kind, leads, clientName]);
  const closePreview = () => { if (preview) URL.revokeObjectURL(preview.url); setPreview(null); };

  // ── one field ──
  function renderField(f, i) {
    if (f.when && !getIn(d, f.when)) return null;
    const v = getIn(d, f.p);
    if (f.t === 'grid') return <FormGrid key={i}>{f.items.map(renderField)}</FormGrid>;
    if (f.t === 'note') return <p key={i} className="ppf-sum">{f.text}</p>;
    if (f.t === 'toggle') return <Toggle key={i} checked={!!v} onChange={x => up(f.p, x)}>{f.label}</Toggle>;
    if (f.t === 'image') return <ImagePick key={i} label={f.label} hint={f.hint} value={v} onPick={file => pickImage(file, f.p)} onClear={v ? () => up(f.p, '') : null} />;
    if (f.t === 'rows') {
      const rows = (v || []).map(r => (kind === 'milestones' && f.p === 'milestones' ? { ...r, amount: r.amount } : r));
      return (
        <div key={i} className="ltf-rows">
          <span className="field-label">{f.label}</span>
          <Rows name={f.name} move rows={rows} onChange={x => up(f.p, x)} blank={f.blank} addLabel={f.add} cols={f.cols} />
          {f.p === 'milestones' && (() => {
            const sum = (v || []).reduce((s, m) => s + (+m.percent || 0), 0);
            const total = (v || []).reduce((s, m) => s + msAmount(d, m), 0);
            return <span className={sum === 100 ? 'field-hint' : 'field-error'}>{sum}% · {money(total)} in all{sum !== 100 ? ' (not 100%)' : ''}</span>;
          })()}
        </div>
      );
    }
    return (
      <Field key={i} label={f.label} hint={f.hint}>
        {id => (f.t === 'area'
          ? <AutoArea id={id} rows={2} value={v ?? ''} onChange={e => up(f.p, e.target.value)} />
          : <input id={id} className="mac-input" type={f.t === 'date' ? 'date' : f.t === 'num' ? 'number' : 'text'} value={v ?? ''} onChange={e => up(f.p, f.t === 'num' ? e.target.value : e.target.value)} />)}
      </Field>
    );
  }

  const at = steps.findIndex(x => x.id === step);
  const prevStep = steps[at - 1], nextStep = steps[at + 1];
  const leadToo = ['nda', 'welcome', 'sow'].includes(kind);
  const needsProject = !leadToo;

  return (
    <div className="pp-builder" ref={root}>
      <Header title={def.name} subtitle={`${info.pages || '…'} page${info.pages === 1 ? '' : 's'} · saved in this browser as you type`}
        actions={<>
          <button className="mac-btn mac-btn-secondary" onClick={() => setMailOpen(true)} disabled={!!busy}><Send size={15} /> Send by email</button>
          <button className="mac-btn mac-btn-secondary" onClick={() => run('preview')} disabled={!!busy}><Eye size={15} /> Preview PDF</button>
          <button className="mac-btn mac-btn-primary" onClick={() => run('download')} disabled={!!busy}><Download size={15} /> Download PDF</button>
        </>} />
      <div className="page-body">
        <div className="sow-bar">
          <Link to="/templates" className="mac-btn mac-btn-ghost"><ArrowLeft size={15} /> Templates</Link>
          <span className="sow-bar-gap" />
          <button className="mac-btn mac-btn-secondary" onClick={() => run('save')} disabled={!!busy}><FolderPlus size={15} /> Save to client documents</button>
          <button className="mac-btn mac-btn-ghost" onClick={() => setResetOpen(true)} disabled={!!busy}><RotateCcw size={15} /> Reset to the design</button>
        </div>

        {info.overflow.length > 0 && (
          <div className="ppf-warn" role="status"><AlertTriangle size={15} aria-hidden="true" /><span>Page {info.overflow.join(', ')} has a block taller than a page. Shorten that text.</span></div>
        )}

        <div className="sow-layout">
          <div className="sow-form">
            <section className="sowf-sec sowf-page ltf-fill">
              <div className="sowf-page-head"><h2><Wand2 size={15} aria-hidden="true" /> Fill from {needsProject ? 'a project' : 'a CRM lead or project'}</h2></div>
              <div className="sowf-body">
                <FormGrid>
                  {(needsProject || leadToo) && (
                    <Field label="Project">
                      {id => <select id={id} className="mac-select" value={pick.project} onChange={e => setPick(x => ({ ...x, project: e.target.value, payment: '' }))}>
                        <option value="">Choose a project</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.projectName}{p.companyName ? ` · ${p.companyName}` : ''}</option>)}
                      </select>}
                    </Field>
                  )}
                  {kind === 'payment' && (
                    <Field label="Payment">
                      {id => <select id={id} className="mac-select" value={pick.payment} onChange={e => setPick(x => ({ ...x, payment: e.target.value }))} disabled={!pickedProject}>
                        <option value="">{pickedProject ? (payments.length ? 'The latest payment' : 'No payments yet') : 'Choose a project first'}</option>
                        {payments.map(x => <option key={x.id} value={x.id}>{fmtMoney(x.amount)} · {fmtDate(x.date)}</option>)}
                      </select>}
                    </Field>
                  )}
                  {leadToo && (
                    <Field label="Or a CRM lead">
                      {id => <select id={id} className="mac-select" value={pick.lead} onChange={e => setPick(x => ({ ...x, lead: e.target.value }))}>
                        <option value="">Choose a lead</option>
                        {leads.map(l => <option key={l.id} value={l.id}>{l.companyName || l.clientName}{l.companyName && l.clientName ? ` · ${l.clientName}` : ''}</option>)}
                      </select>}
                    </Field>
                  )}
                </FormGrid>
                <button type="button" className="mac-btn mac-btn-secondary sowf-add" disabled={!pickedProject && !pick.lead || (kind === 'payment' && !payments.length)}
                  onClick={() => fillFrom({ project: pickedProject, paymentId: pick.payment, lead: leads.find(l => String(l.id) === pick.lead) })}>
                  <Wand2 size={14} /> Fill the letter
                </button>
              </div>
            </section>

            <nav className="ppf-steps" aria-label="Parts of the letter">
              {steps.map((x, i) => {
                const off = x.show && !getIn(d, x.show);
                return (
                  <button key={x.id} type="button" className={`ppf-step ${x.id === step ? 'on' : ''} ${off ? 'off' : ''}`} aria-current={x.id === step ? 'step' : undefined} onClick={() => setStep(x.id)}>
                    <span className="ppf-step-n">{i + 1}</span>{x.label}
                  </button>
                );
              })}
            </nav>

            {steps.map(s => (
              <Sec key={s.id} step={step} id={s.id} target={kind} title={s.label}
                changed={JSON.stringify(s.fields.flatMap(f => (f.items || [f])).map(f => getIn(d, f.p || ''))) !== JSON.stringify(s.fields.flatMap(f => (f.items || [f])).map(f => getIn(def.blank(), f.p || '')))}
                onReset={() => { const fresh = def.blank(); setD(prev => s.fields.flatMap(f => (f.items || [f])).filter(f => f.p).reduce((x, f) => setIn(x, f.p, getIn(fresh, f.p)), prev)); toast.success(`${s.label} reset to the design`); }}>
                {s.fields.map(renderField)}
              </Sec>
            ))}

            <div className="ppf-stepnav">
              {prevStep ? <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setStep(prevStep.id)}><ArrowLeft size={15} /> {prevStep.label}</button> : <span />}
              {nextStep ? <button type="button" className="mac-btn mac-btn-primary" onClick={() => setStep(nextStep.id)}>{nextStep.label} <ArrowRight size={15} /></button>
                : <button type="button" className="mac-btn mac-btn-primary" onClick={() => run('download')} disabled={!!busy}><Download size={15} /> Download PDF</button>}
            </div>
          </div>

          <div className="sow-stage-wrap">
            <div className="ppf-zoom" role="toolbar" aria-label="Preview size">
              <button type="button" className="icon-btn plain" onClick={() => zoomBy(-1)} disabled={pct <= 15} aria-label="Smaller"><ZoomOut size={15} /></button>
              <span className="ppf-zoom-pct" aria-live="polite">{pct}%</span>
              <button type="button" className="icon-btn plain" onClick={() => zoomBy(1)} disabled={pct >= 100} aria-label="Bigger"><ZoomIn size={15} /></button>
              <span className="ppf-zoom-gap" />
              <button type="button" className={`mac-btn mac-btn-ghost ${zoom === 'page' ? 'on' : ''}`} aria-pressed={zoom === 'page'} onClick={() => setZoom('page')}>Whole page</button>
              <button type="button" className={`mac-btn mac-btn-ghost ${zoom === 'width' ? 'on' : ''}`} aria-pressed={zoom === 'width'} onClick={() => setZoom('width')}>Fit width</button>
            </div>
            <div className="sow-stage" ref={stage}>
              <LetterDocument kind={kind} d={d} scale={scale} onInfo={setInfo} />
            </div>
            {busy && <div className="sow-busy" role="status"><span className="sow-busy-box"><span className="sow-spin" aria-hidden="true" /> Making the PDF{progress ? ` · ${progress}` : '…'}</span></div>}
          </div>
        </div>
      </div>

      {busy && <div className="pp-print" aria-hidden="true"><LetterDocument kind={kind} d={d} scale={1} docRef={printRef} /></div>}

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

      <SendEmail isOpen={mailOpen} onClose={() => setMailOpen(false)} kind={kind} defaults={mailDefaults} fileName={letterPdfName(kind, d)}
        makePdf={pdfForMail} onSaveCopy={clientName ? saveCopy : null} />

      <ConfirmDialog isOpen={resetOpen} onClose={() => setResetOpen(false)} onConfirm={() => { setD(def.blank()); toast.success('Back to the design'); }}
        title="Reset to the design?" confirmLabel="Reset" message="Every field goes back to the text from the Figma design. It cannot be undone." />
    </div>
  );
}

