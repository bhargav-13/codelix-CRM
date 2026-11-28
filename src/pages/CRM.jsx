// CRM leads. A lead is captured first (who, industry, what they want); after the meetings it is
// closed as Won or Lost with the reason. Follow-ups are numbered cards under each lead.
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Badge, { getStatusColor } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  Drawer, Field, FormGrid, FormSection, Toolbar, Chips, SkeletonRows,
  EmptyPanel, ErrorPanel, RowMenu, Avatar, useToast, fmtMoney, fmtDate, todayLocal,
} from '../components/ui/kit';
import Insights from '../components/crm/Insights';
import Kpis from '../components/crm/Kpis';
import { clientsDB, projectsDB, auditDB } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { NumInput } from '../lib/numInput';
import { SERVICE_TYPES, INDUSTRIES, SOURCES, PRIORITIES, LEAD_INTEREST, LOST_REASONS, WON_REASONS, FOLLOWUP_STATUSES } from '../data/mockData';
import { discountOf, WON, LOST, DRAFT, addDays, lossFollowup, isOpen, isOverdue, isDueToday, followupCount, numberedFollowups, insights } from '../lib/crm';
import {
  Plus, Phone, Mail, Globe, Edit2, Trash2, History, AlertCircle, CalendarClock, Repeat, IndianRupee, Users, SearchX,
  Trophy, XCircle, RotateCcw, BarChart3, List, CalendarPlus, FolderKanban, FileText, Flag, ShieldCheck,
} from 'lucide-react';
import './CRM.css';

const STATUS_CHIPS = [
  { value: 'all', label: 'All' },
  { value: DRAFT, label: 'Draft' },
  { value: WON, label: 'Won' },
  { value: LOST, label: 'Lost' },
];
// Colours: the stripe on each lead follows its status, the flag its priority.
const STATUS_TONE = { [DRAFT]: 'draft', [WON]: 'won', [LOST]: 'lost' };
const PRIORITY_TONE = { High: 'high', Medium: 'medium', Low: 'low' };
const toneOf = c => `crm-s-${STATUS_TONE[c.status] || 'draft'} crm-p-${PRIORITY_TONE[c.priority] || 'none'}`;
const PriorityFlag = ({ p }) => (p ? <span className={`crm-flag crm-flag-${PRIORITY_TONE[p] || 'none'}`} title={`${p} priority`}><Flag size={12} aria-hidden="true" />{p}</span> : null);

const NEXT_PRESETS = [['Tomorrow', 1], ['In 3 days', 3], ['In a week', 7]];
const HIDE_CLOSED_AFTER_DAYS = 20;

const emptyLead = {
  clientName: '', companyName: '', email: '', contact: '', address: '', source: 'Cold Mail', createdDate: '',
  industry: '', projectType: '', website: '', status: DRAFT, interest: '', priority: 'Medium',
  proposalValue: '', finalPrice: '', nextFollowup: '', followupHistory: [],
};

const dueState = (c, today) => (isOverdue(c, today) ? 'is-overdue' : isDueToday(c, today) ? 'is-today' : '');
function dueLabel(c, today) {
  if (c.status === WON) return '—';
  if (!c.nextFollowup) return c.status === LOST ? 'None' : 'Not set';
  if (c.nextFollowup === today) return 'Today';
  if (c.nextFollowup < today) return `Overdue · ${fmtDate(c.nextFollowup)}`;
  return fmtDate(c.nextFollowup);
}
// Keep a saved value selectable even if it is no longer in the standard list
const withCurrent = (list, v) => (v && !list.includes(v) ? [v, ...list] : list);
const telHref = n => `tel:${String(n).replace(/[^\d+]/g, '')}`;
const webHref = w => (/^https?:\/\//i.test(w) ? w : `https://${w}`);
const one = n => (n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('en-IN'));

// A new lead needs a company and one way to reach the person; older records are not held to that.
function validateLead(v, isEdit) {
  const errors = {};
  if (!v.clientName.trim()) errors.clientName = 'Enter the client’s name';
  if (v.email && !/^\S+@\S+\.\S+$/.test(v.email.trim())) errors.email = 'This email does not look right';
  if (!isEdit) {
    if (!v.companyName.trim()) errors.companyName = 'Enter the company name';
    if (!v.email.trim() && !v.contact.trim()) errors.contact = 'Enter a phone number or an email';
    if (!v.createdDate) errors.createdDate = 'Choose the date';
    if (!v.industry) errors.industry = 'Choose the industry';
    if (!v.projectType) errors.projectType = 'Choose the project type';
  }
  return errors;
}

function LeadForm({ v, set, errors, isEdit, today }) {
  return (
    <>
      <FormSection title="Who">
        <FormGrid>
          <Field label="Client name" required error={errors.clientName}>
            <input className="mac-input" value={v.clientName} onChange={e => set('clientName', e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Company name" required={!isEdit} error={errors.companyName}>
            <input className="mac-input" value={v.companyName} onChange={e => set('companyName', e.target.value)} placeholder="Company or business" />
          </Field>
          <Field label="Email" error={errors.email}>
            <input className="mac-input" type="email" value={v.email} onChange={e => set('email', e.target.value)} placeholder="name@example.com" />
          </Field>
          <Field label="Phone number" error={errors.contact} hint={errors.contact ? undefined : 'Email or phone: one of the two is enough'}>
            <input className="mac-input" type="tel" inputMode="tel" value={v.contact} onChange={e => set('contact', e.target.value)} placeholder="10-digit number" />
          </Field>
          <Field label="Address (optional)">
            <input className="mac-input" value={v.address} onChange={e => set('address', e.target.value)} placeholder="City, State" />
          </Field>
          <Field label="Website (optional)">
            <input className="mac-input" type="url" inputMode="url" value={v.website} onChange={e => set('website', e.target.value)} placeholder="example.com" />
          </Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Lead">
        <FormGrid>
          <Field label="Lead from">
            <select className="mac-select" value={v.source} onChange={e => set('source', e.target.value)}>
              {withCurrent(SOURCES, v.source).map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Date" required={!isEdit} error={errors.createdDate}>
            <input className="mac-input" type="date" value={v.createdDate} max={today} onChange={e => set('createdDate', e.target.value)} />
          </Field>
          <Field label="Industry type" required={!isEdit} error={errors.industry}>
            <select className="mac-select" value={v.industry} onChange={e => set('industry', e.target.value)}>
              <option value="">Choose…</option>
              {withCurrent(INDUSTRIES, v.industry).map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Project type" required={!isEdit} error={errors.projectType}>
            <select className="mac-select" value={v.projectType} onChange={e => set('projectType', e.target.value)}>
              <option value="">Choose…</option>
              {withCurrent(SERVICE_TYPES, v.projectType).map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </FormGrid>
      </FormSection>
      {isEdit && (
        <FormSection title="After the meeting">
          <FormGrid>
            <Field label="Proposal value (₹)">
              <NumInput className="mac-input" value={v.proposalValue} onChange={val => set('proposalValue', val)} placeholder="0" />
            </Field>
            <Field label="Final price (₹)" hint="Fill in once the deal is agreed">
              <NumInput className="mac-input" value={v.finalPrice} onChange={val => set('finalPrice', val)} placeholder="0" />
            </Field>
            <Field label="Interest">
              <select className="mac-select" value={v.interest} onChange={e => set('interest', e.target.value)}>
                <option value="">Not set</option>
                {withCurrent(LEAD_INTEREST, v.interest).map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select className="mac-select" value={v.priority} onChange={e => set('priority', e.target.value)}>
                {withCurrent(PRIORITIES, v.priority).map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>
          </FormGrid>
        </FormSection>
      )}
    </>
  );
}

// "What happened + when next", opened from the + card
function FollowupForm({ client, today, no, onSave, onCancel }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [status, setStatus] = useState(FOLLOWUP_STATUSES[0]);
  const [date, setDate] = useState(today);
  const [next, setNext] = useState(isOpen(client) ? addDays(today, 3) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    if (!note.trim()) { setError('Write what was discussed'); return; }
    setError('');
    setSaving(true);
    try {
      await onSave({ date: date || today, note: note.trim(), status, nextFollowup: next });
      toast.success(next ? `Follow-up #${no} saved. Next on ${fmtDate(next)}` : `Follow-up #${no} saved`);
    } catch (err) {
      toast.error('Could not save the follow-up', err);
      setSaving(false);
    }
  }

  return (
    <form className="crm-log" onSubmit={submit} noValidate>
      <h3 className="section-title">Follow-up #{no}</h3>
      <Field label="How did it go?">
        {id => (
          <div className="crm-presets" role="group" aria-labelledby={id}>
            {FOLLOWUP_STATUSES.map(s => <button key={s} type="button" className={status === s ? 'active' : ''} aria-pressed={status === s} onClick={() => setStatus(s)}>{s}</button>)}
          </div>
        )}
      </Field>
      <Field label="What was discussed?" required error={error}>
        <textarea className="mac-input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Shared the proposal, wants a call on Friday" />
      </Field>
      <FormGrid>
        <Field label="Contacted on">
          <input className="mac-input" type="date" value={date} max={today} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label="Next follow-up" hint="Leave empty if none is needed">
          <input className="mac-input" type="date" value={next} onChange={e => setNext(e.target.value)} />
        </Field>
      </FormGrid>
      <div className="crm-presets" role="group" aria-label="Next follow-up shortcuts">
        {NEXT_PRESETS.map(([label, days]) => {
          const value = addDays(today, days);
          return <button key={label} type="button" className={next === value ? 'active' : ''} onClick={() => setNext(value)}>{label}</button>;
        })}
        <button type="button" className={!next ? 'active' : ''} onClick={() => setNext('')}>None</button>
      </div>
      <div className="crm-log-foot">
        <button type="button" className="mac-btn mac-btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save follow-up'}</button>
      </div>
    </form>
  );
}

// Cards: + to add, the planned one, then every logged follow-up (newest first). A card opens its details.
function Followups({ client, today, onLog }) {
  const list = useMemo(() => numberedFollowups(client).reverse(), [client]);
  const [open, setOpen] = useState(null);   // null | 'add' | follow-up number
  const shown = typeof open === 'number' ? list.find(h => h.no === open) : null;
  const planned = client.status !== WON && client.nextFollowup;

  async function save(entry) {
    await onLog(client, entry);
    setOpen(list.length + 1);   // show the card that was just added
  }

  return (
    <section className="crm-section">
      <h3 className="section-title">Follow-ups <span className="crm-count">{list.length}</span></h3>
      <div className="crm-fu-grid">
        <button type="button" className={`crm-fu crm-fu-add ${open === 'add' ? 'active' : ''}`} onClick={() => setOpen(o => (o === 'add' ? null : 'add'))} aria-label="Add a follow-up" aria-expanded={open === 'add'}>
          <span className="crm-fu-plus"><Plus size={18} aria-hidden="true" /></span>
          <strong>Add follow-up</strong>
          <span className="crm-fu-tag">#{list.length + 1}</span>
        </button>
        {planned && (
          <button type="button" className={`crm-fu crm-fu-planned ${dueState(client, today)}`} onClick={() => setOpen('add')} title="Log this follow-up">
            <span className="crm-fu-no">Next</span>
            <strong>{fmtDate(client.nextFollowup)}</strong>
            <span className="crm-fu-tag">{isOverdue(client, today) ? 'Overdue' : isDueToday(client, today) ? 'Today' : 'Planned'}</span>
          </button>
        )}
        {list.map(h => (
          <button key={h.no} type="button" className={`crm-fu ${open === h.no ? 'active' : ''}`} onClick={() => setOpen(o => (o === h.no ? null : h.no))} aria-expanded={open === h.no}>
            <span className="crm-fu-no">#{h.no}</span>
            <strong>{fmtDate(h.date)}</strong>
            <span className={`crm-fu-tag is-${getStatusColor(h.status)}`}><i />{h.status || 'Logged'}</span>
          </button>
        ))}
      </div>

      {open === 'add' && <FollowupForm key={list.length} client={client} today={today} no={list.length + 1} onSave={save} onCancel={() => setOpen(null)} />}

      {shown && (
        <div className="crm-fu-detail">
          <div className="crm-fu-detail-head">
            <strong>Follow-up #{shown.no} · {fmtDate(shown.date)}</strong>
            <Badge color={getStatusColor(shown.status)}>{shown.status || 'Logged'}</Badge>
          </div>
          <p className="crm-fu-note">{shown.note || shown.remark || 'No note was written.'}</p>
          <dl className="kv">
            <dt>Logged by</dt><dd>{shown.by || '—'}</dd>
            <dt>Logged on</dt><dd>{shown.at ? `${fmtDate(shown.at)}, ${new Date(shown.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : '—'}</dd>
            <dt>Next follow-up set</dt><dd>{shown.nextFollowup ? fmtDate(shown.nextFollowup) : 'None'}</dd>
          </dl>
        </div>
      )}

      {list.length === 0 && open !== 'add' && <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Nothing logged yet. Press + after the first call or meeting.</p>}
    </section>
  );
}

// Where the lead stands, and the buttons that close or reopen it
function Outcome({ client, today, onClose, onReopen }) {
  if (client.status === WON) {
    return (
      <div className="crm-outcome is-won">
        <div className="crm-outcome-head">
          <span><Trophy size={16} aria-hidden="true" /> Won{client.closedDate ? ` on ${fmtDate(client.closedDate)}` : ''}</span>
          <button className="mac-btn mac-btn-ghost" onClick={() => onReopen(client)}><RotateCcw size={14} /> Reopen</button>
        </div>
        {(client.wonReasons || []).length > 0 && <div className="crm-tags">{client.wonReasons.map(r => <Badge key={r} color="green">{r}</Badge>)}</div>}
        <p>Converted after {followupCount(client)} follow-up{followupCount(client) === 1 ? '' : 's'}</p>
        {(client.proposalValue || client.finalPrice) ? (
          <dl className="crm-deal">
            <div><dt>Proposed</dt><dd>{client.proposalValue ? fmtMoney(client.proposalValue) : '—'}</dd></div>
            <div><dt>Discount</dt><dd>{discountOf(client) == null ? '—' : discountOf(client).amount === 0 ? 'None' : `${fmtMoney(discountOf(client).amount)} (${one(discountOf(client).pct)}%)`}</dd></div>
            <div><dt>Final price</dt><dd>{client.finalPrice ? fmtMoney(client.finalPrice) : '—'}</dd></div>
          </dl>
        ) : null}
        {client.closeNote && <p className="crm-outcome-note">{client.closeNote}</p>}
        {client.projectId && <div><Link className="mac-btn mac-btn-secondary" to={`/projects?project=${client.projectId}`}><FolderKanban size={15} /> Open the project</Link></div>}
      </div>
    );
  }
  if (client.status === LOST) {
    return (
      <div className="crm-outcome is-lost">
        <div className="crm-outcome-head">
          <span><XCircle size={16} aria-hidden="true" /> Lost{client.closedDate ? ` on ${fmtDate(client.closedDate)}` : ''}</span>
          <button className="mac-btn mac-btn-ghost" onClick={() => onReopen(client)}><RotateCcw size={14} /> Reopen</button>
        </div>
        <div className="crm-tags"><Badge color="red">{client.lostReason || 'Unknown'}</Badge></div>
        <p>{client.nextFollowup ? `Try again on ${fmtDate(client.nextFollowup)}` : 'No more follow-ups planned'}</p>
        {client.closeNote && <p className="crm-outcome-note">{client.closeNote}</p>}
      </div>
    );
  }
  return (
    <div className="crm-outcome">
      <div className="crm-outcome-head">
        <span><Badge color={getStatusColor(DRAFT)}>Draft</Badge>{client.interest && <Badge color={getStatusColor(client.interest)}>{client.interest}</Badge>}</span>
        <span className={`crm-due ${dueState(client, today)}`}>Next: {dueLabel(client, today)}</span>
      </div>
      <div className="crm-outcome-actions">
        <button className="mac-btn mac-btn-primary" onClick={() => onClose(client, WON)}><Trophy size={15} /> Mark won</button>
        <button className="mac-btn mac-btn-secondary" onClick={() => onClose(client, LOST)}><XCircle size={15} /> Mark lost</button>
      </div>
    </div>
  );
}

function LeadDetail({ client, today, onClose, onReopen, onLogFollowup }) {
  const hasQuick = client.contact || client.email || client.website;
  return (
    <div className="pv-cols">
      <div className="pv-col">
        <Outcome client={client} today={today} onClose={onClose} onReopen={onReopen} />
        <div className="pv-card"><Followups client={client} today={today} onLog={onLogFollowup} /></div>
      </div>

      <aside className="pv-col">
        {hasQuick && (
          <div className="pv-card">
            <h3 className="section-title">Contact</h3>
            <div className="crm-quick">
              {client.contact && <a className="mac-btn mac-btn-secondary" href={telHref(client.contact)}><Phone size={15} /> Call</a>}
              {client.email && <a className="mac-btn mac-btn-secondary" href={`mailto:${client.email}`}><Mail size={15} /> Email</a>}
              {client.website && <a className="mac-btn mac-btn-secondary" href={webHref(client.website)} target="_blank" rel="noreferrer"><Globe size={15} /> Website</a>}
            </div>
          </div>
        )}
        <div className="pv-card">
          <h3 className="section-title">Details</h3>
          <dl className="kv">
            <dt>Company</dt><dd>{client.companyName || '—'}</dd>
            <dt>Phone</dt><dd>{client.contact ? <a className="crm-link" href={telHref(client.contact)}>{client.contact}</a> : '—'}</dd>
            <dt>Email</dt><dd>{client.email ? <a className="crm-link" href={`mailto:${client.email}`}>{client.email}</a> : '—'}</dd>
            <dt>Website</dt><dd>{client.website ? <a className="crm-link" href={webHref(client.website)} target="_blank" rel="noreferrer">{client.website}</a> : '—'}</dd>
            <dt>Address</dt><dd>{client.address || '—'}</dd>
            <dt>Industry</dt><dd>{client.industry || '—'}</dd>
            <dt>Project type</dt><dd>{client.projectType || '—'}</dd>
            <dt>Lead from</dt><dd>{client.source || '—'}</dd>
            <dt>Lead date</dt><dd>{fmtDate(client.createdDate)}{client.createdBy ? ` · added by ${client.createdBy}` : ''}</dd>
            <dt>Proposal value</dt><dd>{client.proposalValue ? fmtMoney(client.proposalValue) : '—'}</dd>
            <dt>Final price</dt><dd>{client.finalPrice ? fmtMoney(client.finalPrice) : '—'}</dd>
            <dt>Priority</dt><dd>{client.priority ? <Badge color={getStatusColor(client.priority)}>{client.priority}</Badge> : '—'}</dd>
            <dt>Last contacted</dt><dd>{fmtDate(client.lastContacted)}</dd>
          </dl>
        </div>
      </aside>
    </div>
  );
}

// Mark won (several reasons) or lost (one reason, which decides the next follow-up)
function CloseDialog({ target, today, onClose, onSave }) {
  const toast = useToast();
  const kind = target?.kind;
  const client = target?.client;
  const [won, setWon] = useState([]);
  const [lost, setLost] = useState('');
  const [note, setNote] = useState('');
  const [proposed, setProposed] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  const [priceError, setPriceError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!client) return;
    setWon([]); setLost(''); setNote(''); setError(''); setPriceError(''); setSaving(false);
    setProposed(client.proposalValue || client.finalPrice || '');
    setPrice(client.finalPrice || client.proposalValue || '');
  }, [client, kind]);

  // Discount is always proposed minus final: typing it moves the final price, and the other way round.
  const has = v => v !== '' && v != null && !Number.isNaN(+v);
  const discount = has(proposed) && has(price) ? Math.round((+proposed - +price) * 100) / 100 : '';
  const discountPct = has(discount) && +proposed > 0 ? (discount / +proposed) * 100 : null;
  const changeProposed = v => { setPriceError(''); setProposed(v); if (!has(price)) setPrice(v); };
  const changeDiscount = v => { setPriceError(''); if (has(proposed)) setPrice(has(v) ? String(Math.round((+proposed - +v) * 100) / 100) : proposed); };

  const toggle = r => { setError(''); setWon(list => (list.includes(r) ? list.filter(x => x !== r) : [...list, r])); };
  const plan = lost ? lossFollowup(lost, today) : null;
  const needsNote = kind === LOST ? lost === 'Other' : won.includes('Other');

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    if (kind === WON && won.length === 0) { setError('Choose at least one reason'); return; }
    if (kind === LOST && !lost) { setError('Choose the reason'); return; }
    if (needsNote && !note.trim()) { setError('Write the reason in the note'); return; }
    if (kind === WON && !(+price > 0)) { setPriceError('Enter the final price'); return; }
    if (kind === WON && +price < 0) { setPriceError('The discount is more than the proposed price'); return; }
    setSaving(true);
    try {
      await onSave(client, kind, kind === WON ? { wonReasons: won, proposalValue: has(proposed) ? proposed : price, finalPrice: price, closeNote: note.trim() } : { lostReason: lost, closeNote: note.trim() });
      onClose();
    } catch (err) {
      toast.error(`Could not mark ${client.clientName} ${kind === WON ? 'won' : 'lost'}`, err);
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={!!target} onClose={onClose} title={kind === WON ? `Mark won: ${client?.clientName || ''}` : `Mark lost: ${client?.clientName || ''}`} size="md"
      footer={<>
        <button type="button" className="mac-btn mac-btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" form="crm-close-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : kind === WON ? 'Mark won' : 'Mark lost'}</button>
      </>}>
      <form id="crm-close-form" className="crm-close" onSubmit={submit} noValidate>
        {kind === WON ? (
          <>
            <Field label="Why did we win?" hint={error ? undefined : 'Choose every reason that applies'} error={error}>
              {id => (
                <div className="crm-presets" role="group" aria-labelledby={id}>
                  {WON_REASONS.map(r => <button key={r} type="button" className={won.includes(r) ? 'active' : ''} aria-pressed={won.includes(r)} onClick={() => toggle(r)}>{r}</button>)}
                </div>
              )}
            </Field>
            <FormGrid>
              <Field label="Proposed price (₹)">
                <NumInput className="mac-input" value={proposed} onChange={changeProposed} placeholder="0" />
              </Field>
              <Field label="Discount (₹)" hint={discountPct == null ? 'Worked out from the two prices' : discount < 0 ? 'Final price is above the proposed price' : `${one(discountPct)}% of the proposed price`}>
                <NumInput className="mac-input" value={discount === '' ? '' : String(discount)} onChange={changeDiscount} placeholder="0" />
              </Field>
            </FormGrid>
            <Field label="Final price (₹)" required error={priceError}>
              <NumInput className="mac-input" value={price} onChange={v => { setPriceError(''); setPrice(v); }} placeholder="0" />
            </Field>
            <div className="crm-plan">
              <FolderKanban size={16} aria-hidden="true" />
              <span>{client?.projectId ? 'This lead already has a project, so no new one is created.' : 'A project is created in Projects with this final price.'}</span>
            </div>
          </>
        ) : (
          <>
            <Field label="Why did we lose?" error={error}>
              {id => (
                <div className="crm-presets" role="radiogroup" aria-labelledby={id}>
                  {LOST_REASONS.map(r => <button key={r} type="button" role="radio" aria-checked={lost === r} className={lost === r ? 'active' : ''} onClick={() => { setLost(r); setError(''); }}>{r}</button>)}
                </div>
              )}
            </Field>
            {plan && (
              <div className={`crm-plan ${plan.date ? 'has-date' : ''}`}>
                <CalendarPlus size={16} aria-hidden="true" />
                <span>{plan.text}{plan.date ? `: ${fmtDate(plan.date)}` : ''}</span>
              </div>
            )}
          </>
        )}
        <Field label={needsNote ? 'Note' : 'Note (optional)'} required={needsNote}>
          <textarea className="mac-input" value={note} onChange={e => { setNote(e.target.value); setError(''); }} placeholder={kind === WON ? 'Anything worth remembering about this win' : 'What happened'} />
        </Field>
      </form>
    </Modal>
  );
}

function AuditList({ entries, failed }) {
  if (entries.length === 0) {
    return <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>{failed ? 'The change history could not be loaded.' : 'No changes recorded yet.'}</p>;
  }
  return (
    <>
      {failed && <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Earlier history could not be loaded; showing changes from this session only.</p>}
      <ul className="crm-audit">
        {entries.map(e => (
          <li key={e.id}>
            <Badge color={e.action === 'Deleted' ? 'red' : e.action === 'Created' ? 'green' : 'blue'}>{e.action}</Badge>
            <div className="crm-audit-main">
              <div className="cell-main">{e.description || '—'}</div>
              <div className="cell-sub">by {e.by || '—'}</div>
            </div>
            <span className="crm-audit-when">
              {fmtDate(e.createdAt)}{e.createdAt ? `, ${new Date(e.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function CRM() {
  const { user, displayName } = useAuth();
  const currentUser = displayName || user?.email || 'Unknown';
  const toast = useToast();
  const today = todayLocal();
  const navigate = useNavigate();
  const makeProposal = c => navigate(`/templates/proposal?lead=${encodeURIComponent(c.id)}`);
  const makeNda = c => navigate('/templates/nda', { state: { lead: c } });
  const makeLetter = (route, c) => navigate(route, { state: { lead: c } });
  const [ndaOffer, setNdaOffer] = useState(null);   // a lead just marked won: offer the NDA

  const [clients, setClients] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [auditFailed, setAuditFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [view, setView] = useState('leads');     // 'leads' | 'insights'
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [due, setDue] = useState('');            // '' | 'overdue' | 'today' (set from the stat tiles)
  const [industry, setIndustry] = useState('');
  const [source, setSource] = useState('');

  // The open lead lives in the address (?lead=…), so the browser's back button closes it.
  const [params, setParams] = useSearchParams();
  const detailId = params.get('lead');
  const setDetailId = useCallback(id => setParams(id ? { lead: String(id) } : {}), [setParams]);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyLead);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [closeTarget, setCloseTarget] = useState(null);   // null | { client, kind: Won | Lost }
  const [auditFor, setAuditFor] = useState(null); // null | 'all' | client id

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [clientData, auditData] = await Promise.all([
        clientsDB.getAll(),
        auditDB.getAll('client').catch(err => { console.error(err); return null; }),
      ]);
      setClients(clientData);
      setAuditLog(auditData || []);
      setAuditFailed(!auditData);
    } catch (err) {
      console.error(err);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Closed long ago and nothing left to do: kept out of the plain "All" list.
  const isOldClosed = useCallback(c => {
    const ref = c.closedDate || c.lastContacted || c.createdDate;
    return !isOpen(c) && !c.nextFollowup && !!ref && ref < addDays(today, -HIDE_CLOSED_AFTER_DAYS);
  }, [today]);

  const stats = useMemo(() => {
    const open = clients.filter(isOpen);
    const counts = { all: clients.filter(c => !isOldClosed(c)).length };
    clients.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
    const numbers = insights(clients);
    return {
      counts,
      open: open.length,
      overdue: clients.filter(c => isOverdue(c, today)).length,
      dueToday: clients.filter(c => isDueToday(c, today)).length,
      won: numbers.won,
      avgToConvert: numbers.avgToConvert,
      pipeline: numbers.openValue,
      oldClosed: clients.filter(isOldClosed).length,
    };
  }, [clients, today, isOldClosed]);

  const q = search.trim().toLowerCase();
  // Old closed leads stay out of the plain "All" view only; Won/Lost, a search or any tile shows them.
  const hidesOldClosed = status === 'all' && !q && !due;

  const visible = useMemo(() => {
    const rank = c => (isOverdue(c, today) ? 0 : c.status !== WON && c.nextFollowup ? 1 : 2);
    return clients
      .filter(c => {
        if (hidesOldClosed && isOldClosed(c)) return false;
        if (q && ![c.clientName, c.companyName, c.email, c.contact].some(v => v && String(v).toLowerCase().includes(q))) return false;
        if (status !== 'all' && c.status !== status) return false;
        if (due === 'overdue' && !isOverdue(c, today)) return false;
        if (due === 'today' && !isDueToday(c, today)) return false;
        if (industry && c.industry !== industry) return false;
        if (source && c.source !== source) return false;
        return true;
      })
      .sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        if (ra !== rb) return ra - rb;
        if (ra < 2) return a.nextFollowup.localeCompare(b.nextFollowup);
        return String(b.createdDate || '').localeCompare(String(a.createdDate || ''));
      });
  }, [clients, q, status, due, industry, source, today, hidesOldClosed, isOldClosed]);

  const isFiltered = !!q || status !== 'all' || !!due || !!industry || !!source;
  const clearFilters = () => { setSearch(''); setStatus('all'); setDue(''); setIndustry(''); setSource(''); };
  const detail = detailId ? clients.find(c => String(c.id) === detailId) : null;

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    // phone and email answer for each other, so fixing either clears that message
    setErrors(e => ({ ...e, [k]: undefined, ...(k === 'email' || k === 'contact' ? { contact: undefined } : {}) }));
  };
  function openAdd() { setForm({ ...emptyLead, createdDate: today }); setEditId(null); setErrors({}); setFormOpen(true); }
  function openEdit(c) {
    const filled = { ...emptyLead, ...c };
    Object.keys(emptyLead).forEach(k => { if (filled[k] == null) filled[k] = emptyLead[k]; });
    setForm(filled); setEditId(c.id); setErrors({}); setFormOpen(true);
  }
  function closeForm() { setFormOpen(false); setEditId(null); }

  async function recordAudit(entityId, action, description) {
    const entry = { entity: 'client', entityId, action, description };   // the server stamps who did it
    setAuditLog(l => [{ ...entry, by: currentUser, id: `local-${Date.now()}`, createdAt: new Date().toISOString() }, ...l]);
    try { await auditDB.log(entry); } catch (err) { console.error(err); }
  }

  async function saveLead(e) {
    e.preventDefault();
    if (saving) return;
    const found = validateLead(form, !!editId);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      if (editId) {
        const updated = await clientsDB.update(editId, form);
        setClients(cs => cs.map(c => (c.id === editId ? updated : c)));
        recordAudit(editId, 'Edited', form.clientName);
        toast.success('Lead updated');
      } else {
        const created = await clientsDB.create(form);
        setClients(cs => [created, ...cs]);
        recordAudit(created.id, 'Created', created.clientName);
        toast.success('Lead added. Log the first follow-up after you talk to them.');
        setDetailId(created.id);
      }
      closeForm();
    } catch (err) {
      toast.error('Could not save the lead', err);
    } finally {
      setSaving(false);
    }
  }

  // The row is only removed (and the audit entry written) once the delete really succeeded.
  async function deleteClient(c) {
    const wasOpen = detailId === String(c.id);
    if (wasOpen) setDetailId(null);
    try {
      await clientsDB.delete(c.id);
    } catch (err) {
      if (wasOpen) setDetailId(c.id);
      toast.error(`Could not delete ${c.clientName}`, err);
      return;
    }
    setClients(cs => cs.filter(x => x.id !== c.id));
    recordAudit(c.id, 'Deleted', c.clientName);
    toast.success(`${c.clientName} deleted`);
  }

  // Throws on failure: the dialog stays open and shows the toast.
  async function closeLead(c, kind, body) {
    let updated = await clientsDB.updateStatus(c.id, kind, body);
    setClients(cs => cs.map(x => (x.id === c.id ? updated : x)));
    if (kind === WON) {
      recordAudit(c.id, 'Edited', `${c.clientName} marked won (${body.wonReasons.join(', ')})`);
      // A won lead becomes a project, once: the lead remembers it, so winning again after a reopen adds nothing.
      if (updated.projectId) { toast.success(`${c.clientName} marked won`); return; }
      try {
        const project = await projectsDB.create({
          projectName: [c.companyName || c.clientName, c.projectType].filter(Boolean).join(' · '),
          clientName: c.clientName, companyName: c.companyName || '', projectType: c.projectType || '',
          handledBy: currentUser, startDate: today, dueDate: '', status: 'Pending',
          valuation: +body.finalPrice || 0, billingType: 'Without GST',
          milestones: [], nextPaymentDue: '', assignedEmployees: [],
        });
        updated = await clientsDB.updateStatus(c.id, WON, { ...body, projectId: project.id });
        setClients(cs => cs.map(x => (x.id === c.id ? updated : x)));
        auditDB.log({ entity: 'project', entityId: project.id, action: 'Created', description: `${project.projectName} (from a won lead)` }).catch(console.error);
        toast.success(`${c.clientName} marked won. Project “${project.projectName}” created.`);
        setNdaOffer({ ...c, ...updated });
      } catch (err) {
        toast.error(`${c.clientName} is marked won, but the project could not be created. Add it in Projects.`, err);
      }
    } else {
      recordAudit(c.id, 'Edited', `${c.clientName} marked lost (${body.lostReason})`);
      toast.success(updated.nextFollowup ? `${c.clientName} marked lost. Next follow-up on ${fmtDate(updated.nextFollowup)}` : `${c.clientName} marked lost. No more follow-ups.`);
    }
  }

  async function reopenLead(c) {
    try {
      const updated = await clientsDB.updateStatus(c.id, DRAFT);
      setClients(cs => cs.map(x => (x.id === c.id ? updated : x)));
      recordAudit(c.id, 'Edited', `${c.clientName} reopened`);
      toast.success(`${c.clientName} is a draft again`);
    } catch (err) {
      toast.error('Could not reopen the lead', err);
    }
  }

  // Throws on failure so the form keeps the note and shows the toast.
  async function logFollowup(c, entry) {
    // one call: the server adds the entry (stamping who and when) and moves the follow-up dates
    const updated = await clientsDB.addFollowup(c.id, entry);
    setClients(cs => cs.map(x => (x.id === c.id ? updated : x)));
  }

  const toggleDue = v => { setDue(d => (d === v ? '' : v)); setStatus('all'); };
  const tiles = [
    { label: 'Overdue follow-ups', value: stats.overdue, icon: AlertCircle, tone: 'bad', active: due === 'overdue', sub: due === 'overdue' ? 'Showing these' : 'Tap to see who', onClick: () => toggleDue('overdue') },
    { label: 'Due today', value: stats.dueToday, icon: CalendarClock, tone: 'warn', active: due === 'today', sub: due === 'today' ? 'Showing these' : 'Tap to see who', onClick: () => toggleDue('today') },
    { label: 'Avg follow-ups to convert', value: one(stats.avgToConvert), icon: Repeat, tone: 'brand', sub: stats.won ? `From ${stats.won} won lead${stats.won === 1 ? '' : 's'}` : 'No lead won yet', onClick: () => setView('insights') },
    { label: 'Open pipeline', value: fmtMoney(stats.pipeline), icon: IndianRupee, tone: 'good', sub: `${stats.open} open lead${stats.open === 1 ? '' : 's'}` },
  ];

  const rowMenu = c => [
    { label: 'Edit', icon: Edit2, onClick: () => openEdit(c) },
    { label: 'Make an NDA', icon: ShieldCheck, onClick: () => makeNda(c) },
    { label: 'Make a scope of work', icon: FileText, onClick: () => makeLetter('/templates/sow', c) },
    { label: 'Make a welcome letter', icon: Mail, onClick: () => makeLetter('/templates/welcome', c) },
    { label: 'Change history', icon: History, onClick: () => setAuditFor(c.id) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => setDeleteTarget(c) },
  ];
  const auditEntries = auditFor === 'all' ? auditLog : auditLog.filter(e => String(e.entityId) === String(auditFor));
  const auditClient = auditFor && auditFor !== 'all' ? clients.find(c => c.id === auditFor) : null;
  const statusNote = c => (c.status === LOST ? c.lostReason : c.status === WON ? (c.wonReasons || []).join(', ') : c.interest) || '';

  return (
    <div>
      <Header
        title="CRM"
        subtitle={loading || loadError ? 'Leads and follow-ups' : `${stats.open} open · ${stats.overdue} overdue · ${stats.dueToday} due today`}
        actions={
          <>
            {view === 'leads'
              ? <button className="mac-btn mac-btn-secondary" onClick={() => setView('insights')}><BarChart3 size={15} /> Insights</button>
              : <button className="mac-btn mac-btn-secondary" onClick={() => setView('leads')}><List size={15} /> Leads</button>}
            <button className="mac-btn mac-btn-secondary" onClick={() => setAuditFor('all')}><History size={15} /> History</button>
            <button className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> Add lead</button>
          </>
        }
      />

      <div className="page-body">
        {loading ? <SkeletonRows rows={8} /> : loadError ? <ErrorPanel title="Could not load your leads" error={loadError} onRetry={load} /> : clients.length === 0 ? (
          <EmptyPanel icon={Users} title="No leads yet" text="Add your first lead, then log each follow-up until it is won or lost."
            action={<button className="mac-btn mac-btn-primary" onClick={openAdd}><Plus size={15} /> Add lead</button>} />
        ) : view === 'insights' ? (
          <Insights clients={clients} />
        ) : (
          <>
            <Kpis cols={4} items={tiles} />

            <Chips label="Filter by status" value={status} onChange={v => { setStatus(v); setDue(''); }}
              options={STATUS_CHIPS.map(o => ({ ...o, count: stats.counts[o.value] || 0 }))} />

            <Toolbar search={search} onSearch={setSearch} placeholder="Search name, company, phone or email"
              right={<>
                <span>{isFiltered || hidesOldClosed ? `${visible.length} of ${clients.length}` : `${clients.length} leads`}</span>
                {isFiltered && <button className="mac-btn mac-btn-ghost" onClick={clearFilters}>Clear</button>}
              </>}>
              <select className="mac-select" aria-label="Industry" value={industry} onChange={e => setIndustry(e.target.value)}>
                <option value="">Any industry</option>
                {INDUSTRIES.map(p => <option key={p}>{p}</option>)}
              </select>
              <select className="mac-select" aria-label="Lead from" value={source} onChange={e => setSource(e.target.value)}>
                <option value="">Any source</option>
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Toolbar>

            {visible.length === 0 ? (
              <EmptyPanel icon={SearchX} title="No leads match" text="Nothing fits the current search and filters."
                action={<button className="mac-btn mac-btn-secondary" onClick={clearFilters}>Clear filters</button>} />
            ) : (
              <>
                <div className="mac-card only-desktop">
                  <div className="table-wrap">
                    <table className="data-table crm-table">
                      <colgroup><col style={{ width: '21%' }} /><col style={{ width: '19%' }} /><col style={{ width: '17%' }} /><col style={{ width: '8%' }} /><col style={{ width: '11%' }} /><col style={{ width: '14%' }} /><col style={{ width: '10%' }} /></colgroup>
                      <thead>
                        <tr>
                          <th>Client</th><th>Project</th><th>Status</th><th className="crm-center">Follow-ups</th>
                          <th className="num">Value</th><th>Next follow-up</th><th className="crm-center"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map(c => (
                          <tr key={c.id} className={`clickable crm-row ${toneOf(c)}`} tabIndex={0} onClick={() => setDetailId(c.id)}
                            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setDetailId(c.id); } }}>
                            <td>
                              <div className="crm-client">
                                <Avatar name={c.clientName} />
                                <div>
                                  <div className="cell-main crm-ell" title={c.clientName}>{c.clientName}</div>
                                  <div className="cell-sub crm-ell">{c.companyName || c.contact || '—'}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="crm-ell" title={c.projectType || undefined}>{c.projectType || '—'}</div>
                              <div className="cell-sub crm-ell">{[c.industry, c.source].filter(Boolean).join(' · ') || '—'}</div>
                            </td>
                            <td>
                              <span className="crm-badges"><Badge color={getStatusColor(c.status)} dot>{c.status}</Badge><PriorityFlag p={c.priority} /></span>
                              <div className="cell-sub crm-ell" title={statusNote(c) || undefined}>{statusNote(c) || '—'}</div>
                            </td>
                            <td className="crm-center"><span className="crm-pill">{followupCount(c)}</span></td>
                            <td className="num">{(c.status === WON && c.finalPrice) || c.proposalValue ? fmtMoney((c.status === WON && c.finalPrice) || c.proposalValue) : '—'}</td>
                            <td><span className={`crm-due crm-due-chip ${dueState(c, today)}`}>{dueLabel(c, today)}</span></td>
                            <td className="crm-center">
                              <span className="crm-acts" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                                <button type="button" className="icon-btn plain" onClick={() => openEdit(c)} aria-label={`Edit ${c.clientName}`} title="Edit lead"><Edit2 size={16} /></button>
                                <button type="button" className="icon-btn plain" onClick={() => makeProposal(c)} aria-label={`Make a proposal for ${c.clientName}`} title="Make proposal"><FileText size={16} /></button>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="list-cards only-mobile">
                  {visible.map(c => (
                    <div key={c.id} className={`crm-card-row crm-row ${toneOf(c)}`}>
                      <button className="list-card" onClick={() => setDetailId(c.id)}>
                        <span className="crm-card-top">
                          <span className="cell-main">{c.clientName}</span>
                          <span className={`crm-due ${dueState(c, today)}`}>{dueLabel(c, today)}</span>
                        </span>
                        <span className="cell-sub">{[c.companyName, c.projectType].filter(Boolean).join(' · ') || '—'}</span>
                        <span className="crm-card-meta">
                          <Badge color={getStatusColor(c.status)} dot>{c.status}</Badge>
                          <PriorityFlag p={c.priority} />
                          <span className="cell-sub">{followupCount(c)} follow-up{followupCount(c) === 1 ? '' : 's'}</span>
                          {!!c.proposalValue && <span className="cell-main">{fmtMoney(c.proposalValue)}</span>}
                        </span>
                      </button>
                      <span className="crm-card-acts">
                        <button type="button" className="icon-btn" onClick={() => openEdit(c)} aria-label={`Edit ${c.clientName}`}><Edit2 size={16} /></button>
                        <button type="button" className="icon-btn" onClick={() => makeProposal(c)} aria-label={`Make a proposal for ${c.clientName}`}><FileText size={16} /></button>
                        {c.contact && <a className="icon-btn crm-call" href={telHref(c.contact)} aria-label={`Call ${c.clientName}`}><Phone size={17} /></a>}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {hidesOldClosed && stats.oldClosed > 0 && (
              <p className="crm-note">
                {stats.oldClosed} lead{stats.oldClosed === 1 ? '' : 's'} closed more than {HIDE_CLOSED_AFTER_DAYS} days ago {stats.oldClosed === 1 ? 'is' : 'are'} not listed here. See{' '}
                <button onClick={() => setStatus(WON)}>Won</button> or <button onClick={() => setStatus(LOST)}>Lost</button>, or search by name.
              </p>
            )}
          </>
        )}
      </div>

      <Drawer
        isOpen={!!detail && !formOpen && !deleteTarget && !auditFor && !closeTarget}
        onClose={() => setDetailId(null)}
        title={detail?.clientName}
        subtitle={detail && ([detail.companyName, detail.projectType].filter(Boolean).join(' · ') || 'Lead')}
        actions={detail && <>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => makeProposal(detail)}><FileText size={15} /> Make proposal</button>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => openEdit(detail)}><Edit2 size={15} /> Edit</button>
          <RowMenu items={rowMenu(detail).filter(x => x.label !== 'Edit')} label="More lead actions" />
        </>}
      >
        {detail && <LeadDetail key={detail.id} client={detail} today={today} onClose={(client, kind) => setCloseTarget({ client, kind })} onReopen={reopenLead} onLogFollowup={logFollowup} />}
      </Drawer>

      <Modal page back={editId ? 'Lead' : 'Leads'} isOpen={formOpen} onClose={closeForm} title={editId ? 'Edit lead' : 'Add lead'} size="lg"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={closeForm}>Cancel</button>
          <button type="submit" form="crm-client-form" className="mac-btn mac-btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Add lead'}</button>
        </>}>
        <form id="crm-client-form" onSubmit={saveLead} noValidate>
          <LeadForm v={form} set={set} errors={errors} isEdit={!!editId} today={today} />
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!ndaOffer} onClose={() => setNdaOffer(null)} onConfirm={() => makeLetter('/templates/welcome', ndaOffer)} danger={false}
        title="Send a welcome letter?" confirmLabel="Open the letter"
        message={`${ndaOffer?.companyName || ndaOffer?.clientName || 'This client'} is won. Open the welcome letter, filled in with their details? (The NDA and scope of work are in the lead's menu.)`} />

      <CloseDialog target={closeTarget} today={today} onClose={() => setCloseTarget(null)} onSave={closeLead} />

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteClient(deleteTarget)}
        title="Delete lead" message={`This permanently deletes ${deleteTarget?.clientName || 'this lead'} and all their follow-up history.`} />

      <Modal page back={auditClient ? 'Lead' : 'Leads'} isOpen={!!auditFor} onClose={() => setAuditFor(null)} title={auditClient ? `Change history: ${auditClient.clientName}` : 'Change history'} size="md">
        <AuditList entries={auditEntries} failed={auditFailed} />
      </Modal>
    </div>
  );
}
