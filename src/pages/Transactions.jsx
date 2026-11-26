import { useState, useMemo, useEffect, useCallback, useSyncExternalStore, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  useToast, Drawer, Field, FormGrid, FormSection, Toolbar, Chips, StatTiles, SkeletonRows,
  EmptyPanel, ErrorPanel, RowMenu, Avatar, fmtMoney, fmtDate, todayLocal,
} from '../components/ui/kit';
import { transactionsDB, settingsDB, auditDB } from '../lib/db';
import { Checkbox } from '../components/ui/Checkbox';
import { useAuth } from '../contexts/AuthContext';
import { fmtInput, NumInput } from '../lib/numInput';
import { computeBalances, currentMonth, monthLabel, txMonth, isOpeningEntry, openingPartner } from '../lib/finance';
import { TRANSACTION_SOURCES, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../data/mockData';
import { usePeople } from '../lib/people';
import {
  Plus, Wallet, Landmark, Banknote, TrendingUp, TrendingDown, History, Settings2, Download,
  Pencil, Trash2, ArrowDownLeft, ArrowUpRight, HandCoins, RotateCcw, CreditCard, ArrowRightLeft,
  AlertTriangle, Info, ExternalLink, Receipt, List, Repeat, Building2, X,
} from 'lucide-react';
import './Transactions.css';

// ─── Constants ───────────────────────────────────────────────────────────────

const BANK = 'Company Bank';
const CASH = 'Cash + Savings Account';
const POCKET = 'Partner Personal';
const ACCOUNT_TYPES = [CASH, BANK];
const ACCOUNT_LABEL = { [BANK]: 'Bank', [CASH]: 'Cash + Savings', [POCKET]: 'Partner’s pocket' };
const accountLabel = a => ACCOUNT_LABEL[a] || a || '—';
const ZERO_BAL = { cash: 0, bank: 0 };

// What happened, in plain words → the form's txType (maps to sub_type in formToRow)
const KINDS = [
  { id: 'income',       label: 'Money received',           hint: 'Client payment, other income', icon: ArrowDownLeft },
  { id: 'expense',      label: 'Expense',                  hint: 'Bills, tools, rent',           icon: ArrowUpRight },
  { id: 'drawing',      label: 'Partner took money',       hint: 'Drawing from the company',     icon: HandCoins },
  { id: 'return',       label: 'Partner returned money',   hint: 'Pays a drawing back',          icon: RotateCcw },
  { id: 'p_salary',     label: 'Partner salary',           hint: 'Monthly partner payment',      icon: Banknote },
  { id: 'personal_exp', label: 'Partner paid from pocket', hint: 'Company owes them',            icon: CreditCard },
  { id: 'reimburse',    label: 'Reimburse partner',        hint: 'Pay a partner back',           icon: ArrowRightLeft },
  { id: 'transfer',     label: 'Move between accounts',    hint: 'Bank ↔ Cash — not income or cost', icon: Repeat },
  { id: 'other_money',  label: 'Loan, capital, asset, deposit', hint: 'Kept out of profit',      icon: Building2 },
];

// Money that moves but is neither income nor a cost: never counted in profit and loss
const OTHER_KINDS = [
  { value: 'loan_received',    label: 'Loan received',             type: 'Credit' },
  { value: 'loan_repaid',      label: 'Loan repayment',            type: 'Debit' },
  { value: 'capital_added',    label: 'Capital put in by a partner', type: 'Credit' },
  { value: 'asset_purchase',   label: 'Equipment / asset bought (laptop, furniture…)', type: 'Debit' },
  { value: 'deposit_paid',     label: 'Deposit paid (rent, security)', type: 'Debit' },
  { value: 'deposit_returned', label: 'Deposit returned to us',    type: 'Credit' },
  { value: 'loan_given',       label: 'Money given to staff / others, to be returned', type: 'Debit' },
  { value: 'loan_returned',    label: 'Given money returned to us', type: 'Credit' },
  { value: 'gst_paid',         label: 'GST paid to the government', type: 'Debit' },
];
// Other income is rarely real revenue (money handed back, refunds), so it starts unticked
const CATEGORY_KEY = 'expense_categories';   // settings key: the categories partners added
function mergeCategories(...lists) {
  const seen = new Map();
  lists.flat().forEach(c => { const n = String(c || '').trim(); if (n && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n); });
  // 'Opening balance' is reserved for starting figures and is refused on ordinary entries
  const all = [...seen.values()].filter(c => c !== 'Other' && c.toLowerCase() !== 'opening balance');
  return [...all, 'Other'];
}
const revenueByDefault = source => source !== 'Other Income';
const OTHER_KIND = Object.fromEntries(OTHER_KINDS.map(k => [k.value, k]));

const SUB_TYPE_LABEL = {
  income:          'Income',
  expense:         'Expense',
  drawing:         'Partner drawing',
  drawing_return:  'Drawing return',
  partner_salary:  'Partner salary',
  employee_salary: 'Employee salary',
  personal_exp:    'Paid by partner',
  reimbursement:   'Reimbursement',
  employee_advance: 'Salary advance',
  advance_recovery: 'Salary settled from advance',
  transfer:        'Transfer',
  ...Object.fromEntries(OTHER_KINDS.map(k => [k.value, k.label.replace(/ \(.*\)$/, '')])),
};
// Entries written by another screen: changed only there, so the two never disagree
const managedBy = t => (t?.projectPaymentId ? 'project'
  : t && (t.employeeId || ['employee_salary', 'employee_advance', 'advance_recovery'].includes(t.subType)) ? 'employee'
  : null);
const typeLabel = t => SUB_TYPE_LABEL[t.subType] || (t.type === 'Credit' ? 'Income' : 'Expense');

const DEFAULT_SALARY = {};   // { [partner name]: monthly salary } — partners come from the people directory

const DIRECTION_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'in',  label: 'Money in' },
  { value: 'out', label: 'Money out' },
];
const NO_FILTERS = { search: '', dir: 'all', account: '', subType: '', month: '' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const signed = n => (n < 0 ? '−' : n > 0 ? '+' : '') + fmtMoney(Math.abs(n));
const plain  = n => (n < 0 ? '−' : '') + fmtMoney(Math.abs(n));
const sumAmt = rows => rows.reduce((s, t) => s + (+t.amount || 0), 0);

// Salary month label, e.g. "November 2026". Partner-salary entries are matched
// on this exact string, so every label on this page comes from this one function.
const salaryMonthLabel = d => d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
const currentMonthLabel = () => salaryMonthLabel(new Date());
// Next month, this month, then the 11 before it (+ the entry's own label when older)
function salaryMonthOptions(extra) {
  const now = new Date();
  const out = [];
  for (let i = 1; i >= -11; i--) {
    const value = salaryMonthLabel(new Date(now.getFullYear(), now.getMonth() + i, 1));
    out.push({ value, label: i === 1 ? `${value} (next month)` : i === 0 ? `${value} (this month)` : value });
  }
  if (extra && !out.some(o => o.value === extra)) out.push({ value: extra, label: extra });
  return out;
}

// Must parse to a finite number above zero: rejects "", ".", "1.2.3" and 0
const parseAmount = v => {
  const s = String(v ?? '').trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// One-line name of an entry — used for search, audit-log text and titles
function txDesc(t) {
  if (!t) return '—';
  if (t.subType === 'drawing')         return `${t.person || ''} Drawing`;
  if (t.subType === 'drawing_return')  return `${t.person || ''} Return`;
  if (t.subType === 'partner_salary')  return `${t.person || ''} · ${t.monthLabel || ''}`;
  if (t.subType === 'employee_salary') return `${t.person || ''} · ${t.monthLabel || ''}`;
  if (t.subType === 'personal_exp')    return `${t.person || ''} Personal Expense`;
  if (t.subType === 'reimbursement')   return `${t.person || ''} Reimbursed`;
  return t.remark || (t.type === 'Credit' ? t.source : t.category) || '—';
}

const txMain  = t => t.remark || (t.type === 'Credit' ? t.source : t.category) || txDesc(t);
const txParty = t => t.clientName || t.paidTo || t.person || '';
const txSub   = t => [
  typeLabel(t),
  t.type === 'Credit' && t.countInProfit === false ? 'Not revenue' : null,
  t.remark ? (t.type === 'Credit' ? t.source : t.category) : null,
  t.monthLabel,
  t.paymentMethod,
].filter(Boolean).join(' · ');

const accountMatches = (t, a) => !a || t.accountType === a || (a === CASH && t.accountType === "Founder's Personal");

const initForm = (txType = 'income') => ({
  txType,
  accountType: BANK,
  amount: '',
  autoAmount: '',          // last amount the form filled in by itself (partner salary)
  date: todayLocal(),
  paymentMethod: 'Bank Transfer',
  remark: '',
  source: 'Client Payment',
  countInProfit: true,     // money received: does it count as revenue?
  clientName: '',
  category: 'Other',
  paidTo: '',
  person: '',              // a partner's name; the form fills in the first partner
  monthLabel: currentMonthLabel(),
  reimburseFrom: 'none',
  transferTo: CASH,
  otherKind: 'loan_received',
});

const formToRow = (form) => {
  const base = {
    amount:        +form.amount,
    date:          form.date,
    paymentMethod: form.paymentMethod || null,
    remark:        form.remark        || null,
    subType:       null,
    person:        null,
    monthLabel:    null,
    source:        null,
    category:      null,
    clientName:    null,
    paidTo:        null,
  };
  switch (form.txType) {
    case 'income':
      return { ...base, type: 'Credit', accountType: form.accountType, subType: 'income',
        source: form.source, clientName: form.clientName, countInProfit: form.countInProfit !== false };
    case 'expense':
      return { ...base, type: 'Debit', accountType: form.accountType, subType: 'expense',
        category: form.category, paidTo: form.paidTo };
    case 'drawing':
      return { ...base, type: 'Debit', accountType: form.accountType, subType: 'drawing',
        person: form.person, remark: form.remark || `Drawing — ${form.person}` };
    case 'return':
      return { ...base, type: 'Credit', accountType: form.accountType, subType: 'drawing_return',
        person: form.person, remark: form.remark || `Return — ${form.person}` };
    case 'p_salary':
      return { ...base, type: 'Debit', accountType: form.accountType, subType: 'partner_salary',
        person: form.person, monthLabel: form.monthLabel,
        remark: form.remark || `${form.person} Salary — ${form.monthLabel}` };
    case 'personal_exp':
      return { ...base, type: 'Debit', accountType: POCKET, subType: 'personal_exp',
        person: form.person, category: form.category, paidTo: form.paidTo,
        remark: form.remark || `${form.person} Personal Expense` };
    case 'reimburse':
      return { ...base, type: 'Debit',
        accountType: form.reimburseFrom === 'none' ? POCKET : form.reimburseFrom,
        subType: 'reimbursement',
        person: form.person, remark: form.remark || `Reimbursement — ${form.person}` };
    case 'other_money': {
      const k = OTHER_KIND[form.otherKind] || OTHER_KINDS[0];
      return { ...base, type: k.type, accountType: form.accountType, subType: k.value, category: k.label,
        paidTo: form.paidTo || null, remark: form.remark || k.label };
    }
    default:
      return { ...base, type: 'Credit', accountType: form.accountType, subType: form.txType };
  }
};

// Employee-salary rows never reach this: they are managed from the Employees page
const rowToForm = (t) => {
  const txType =
    t.subType === 'income'           ? 'income'
    : t.subType === 'expense'        ? 'expense'
    : t.subType === 'drawing'        ? 'drawing'
    : t.subType === 'drawing_return' ? 'return'
    : t.subType === 'partner_salary' ? 'p_salary'
    : t.subType === 'personal_exp'   ? 'personal_exp'
    : t.subType === 'reimbursement'  ? 'reimburse'
    : OTHER_KIND[t.subType]          ? 'other_money'
    : t.type === 'Credit'            ? 'income'
    : 'expense';
  return {
    txType,
    // Remap old "Founder's Personal" to new name for any legacy records
    accountType:  (t.accountType === "Founder's Personal" ? CASH : t.accountType) || BANK,
    amount:       String(t.amount || ''),
    date:         (t.date || todayLocal()).slice(0, 10),
    paymentMethod: t.paymentMethod || 'Bank Transfer',
    remark:       t.remark       || '',
    source:       t.source       || 'Client Payment',
    countInProfit: t.countInProfit !== false,
    clientName:   t.clientName   || '',
    category:     t.category     || 'Other',
    paidTo:       t.paidTo       || '',
    person:       t.person       || '',
    monthLabel:   t.monthLabel   || currentMonthLabel(),
    otherKind:    OTHER_KIND[t.subType] ? t.subType : 'loan_received',
    transferTo:   CASH,
    reimburseFrom: t.subType === 'reimbursement'
      ? (t.accountType === POCKET ? 'none' : (t.accountType || 'none'))
      : 'none',
  };
};

function validate(form) {
  const errors = {};
  if (parseAmount(form.amount) == null) errors.amount = 'Enter an amount greater than 0';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date || '')) errors.date = 'Choose a date';
  else if (form.date > todayLocal()) errors.date = 'The date cannot be in the future';
  else if (form.date < '2000-01-01') errors.date = 'Check the year';
  return errors;
}

// Render only the phone list or only the desktop table, never both
const PHONE_MQ = '(max-width: 768px)';
const subscribePhone = cb => {
  const m = window.matchMedia(PHONE_MQ);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
const useIsPhone = () => useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_MQ).matches, () => false);

// ─── Form building blocks ────────────────────────────────────────────────────

// A labelled group of buttons (Field wraps its control in a <label>, which must hold one control only)
function Group({ label, required, hint, children }) {
  return (
    <div className="field" role="radiogroup" aria-label={label}>
      <span className="field-label">{label}{required && <span className="field-req" aria-hidden="true"> *</span>}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="tab-bar tx-seg">
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          className={`tab-item ${value === o.value ? 'active' : ''}`} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

// meta: { [partner]: { label, tone } }
// The ledger stores the partner's name; a name no longer in the directory stays selectable.
function PartnerPicker({ value, onChange, meta, partners }) {
  const names = value && !partners.includes(value) ? [value, ...partners] : partners;
  return (
    <Group label="Partner" required>
      <div className="tx-picks">
        {names.map(p => (
          <button key={p} type="button" role="radio" aria-checked={value === p} className="tx-pick" onClick={() => onChange(p)}>
            <span className="tx-pick-name">{p}</span>
            {meta?.[p] && <span className={`tx-pick-meta ${meta[p].tone ? `tx-${meta[p].tone}` : ''}`}>{meta[p].label}</span>}
          </button>
        ))}
      </div>
    </Group>
  );
}

const Options = ({ list }) => list.map(x => <option key={x}>{x}</option>);

const ACCOUNT_OPTIONS = ACCOUNT_TYPES.map(a => ({ value: a, label: a }));
const REIMBURSE_OPTIONS = [...ACCOUNT_OPTIONS, { value: 'none', label: 'None' }];
// A drawing settled outside the books: stored on the partner's-pocket account, which no balance counts
const RETURN_OPTIONS = [...ACCOUNT_OPTIONS, { value: POCKET, label: 'None' }];

// ─── Add / edit form ─────────────────────────────────────────────────────────

function TxForm({ form, setForm, errors, editing, stats, onSubmit, onEmployees }) {
  const { partners, partnerOutstanding, partnerReimburseOwed, salaryConfig, salaryPaidFor, categories, addCategory } = stats;
  const [newCat, setNewCat] = useState(null);           // null = closed, string = the name being typed
  const [addingCat, setAddingCat] = useState(false);
  const saveCat = async () => {
    if (!newCat?.trim() || addingCat) return;
    setAddingCat(true);
    const name = await addCategory(newCat);
    setAddingCat(false);
    if (name) { setForm(f => ({ ...f, category: name })); setNewCat(null); }
  };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const kind = form.txType;

  const salaryLeft = (person, label) => Math.max(0, (salaryConfig[person] || 0) - salaryPaidFor(person, label));
  // Suggest the unpaid salary, but never overwrite an amount the user typed
  const withSalarySuggestion = (prev, next) => {
    if (prev.amount !== '' && prev.amount !== prev.autoAmount) return next;
    const left = salaryLeft(next.person, next.monthLabel);
    const auto = left ? String(left) : '';
    return { ...next, amount: auto, autoAmount: auto };
  };
  const setSalary = patch => setForm(f => withSalarySuggestion(f, { ...f, ...patch }));
  const chooseKind = id => setForm(f => {
    const typed = f.amount === f.autoAmount ? '' : f.amount;
    const next = { ...initForm(id), person: f.person || partners[0] || '', date: f.date, amount: typed };
    return id === 'p_salary' ? withSalarySuggestion({ amount: typed, autoAmount: '' }, next) : next;
  });

  const account = (
    <Group label="Account" required>
      <Segmented options={ACCOUNT_OPTIONS} value={form.accountType} onChange={v => set('accountType', v)} />
    </Group>
  );
  const method = (
    <Field label="Payment method">
      {id => <select id={id} className="mac-select" value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}><Options list={PAYMENT_METHODS} /></select>}
    </Field>
  );
  const categoryList = form.category && !categories.includes(form.category) ? [form.category, ...categories] : categories;
  const category = (
    <div className="field">
      <label className="field-label" htmlFor="tx-category">Category</label>
      {newCat === null ? (
        <div className="tx-cat">
          <select id="tx-category" className="mac-select" value={form.category} onChange={e => set('category', e.target.value)}><Options list={categoryList} /></select>
          <button type="button" className="mac-btn mac-btn-secondary tx-cat-add" onClick={() => setNewCat('')} aria-label="Add a new category" title="Add a new category"><Plus size={15} /></button>
        </div>
      ) : (
        <div className="tx-cat">
          <input id="tx-category" className="mac-input" autoFocus value={newCat} maxLength={40} placeholder="New category name"
            onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveCat(); } else if (e.key === 'Escape') { e.stopPropagation(); setNewCat(null); } }} />
          <button type="button" className="mac-btn mac-btn-primary" onClick={saveCat} disabled={!newCat.trim() || addingCat} style={{ paddingInline: 12 }}>Add</button>
          <button type="button" className="mac-btn mac-btn-secondary tx-cat-add" onClick={() => setNewCat(null)} aria-label="Cancel" title="Cancel"><X size={15} /></button>
        </div>
      )}
      {newCat !== null && <span className="field-hint">Saved for all partners.</span>}
    </div>
  );
  const text = (label, key, placeholder) => (
    <Field label={label}>
      {id => <input id={id} className="mac-input" value={form[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder} />}
    </Field>
  );

  // Partner salary: progress for the month chosen in the form
  const monthly   = salaryConfig[form.person] || 0;
  const paidSoFar = kind === 'p_salary' ? salaryPaidFor(form.person, form.monthLabel) : 0;
  const remaining = Math.max(0, monthly - paidSoFar);
  const overpay   = kind === 'p_salary' && monthly > 0 && (parseAmount(form.amount) || 0) > remaining;

  const dueMeta = (map, word, toneDue, clear) => Object.fromEntries(partners.map(p => {
    const v = map[p] || 0;
    return [p, v > 0 ? { label: `${fmtMoney(v)} ${word}`, tone: toneDue } : { label: clear, tone: 'good' }];
  }));

  let details = null;
  if (kind === 'transfer') details = (
    <>
      <Group label="From" required>
        <Segmented options={ACCOUNT_OPTIONS} value={form.accountType}
          onChange={v => setForm(f => ({ ...f, accountType: v, transferTo: v === BANK ? CASH : BANK }))} />
      </Group>
      <div className="tx-note"><Info size={14} /><span>Moves to <strong>{accountLabel(form.accountType === BANK ? CASH : BANK)}</strong>. Balances change on both sides; profit does not.</span></div>
      <FormSection title="Details">
        {method}
        {text('Remark', 'remark', 'e.g. Cash withdrawn for office expenses')}
      </FormSection>
    </>
  );
  else if (kind === 'other_money') details = (
    <>
      <Field label="What is it?" required hint="Money that comes or goes without being income or a cost. It changes your balances but never your profit.">
        {id => <select id={id} className="mac-select" value={form.otherKind} onChange={e => set('otherKind', e.target.value)}>
          {OTHER_KINDS.map(k => <option key={k.value} value={k.value}>{k.label} — money {k.type === 'Credit' ? 'in' : 'out'}</option>)}
        </select>}
      </Field>
      {account}
      <FormSection title="Details">
        <FormGrid>{method}{text(OTHER_KIND[form.otherKind]?.type === 'Credit' ? 'From' : 'Paid to', 'paidTo', 'Bank, lender, landlord, vendor…')}</FormGrid>
        {text('Remark', 'remark', 'Optional note')}
      </FormSection>
    </>
  );
  else if (kind === 'income') details = (
    <>
      {account}
      <div className="tx-note"><Info size={14} /><span>A client paying for a project? Record it on the project (Projects → Add payment) — it appears here as income automatically, so it is never counted twice.</span></div>
      <FormSection title="Details">
        <FormGrid>
          <Field label="Source">
            {id => <select id={id} className="mac-select" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value, countInProfit: revenueByDefault(e.target.value) }))}><Options list={TRANSACTION_SOURCES} /></select>}
          </Field>
          {method}
        </FormGrid>
        {text('Client name', 'clientName', 'Optional')}
        {text('Remark', 'remark', 'Optional note')}
        <label className="tx-check">
          <Checkbox checked={form.countInProfit !== false} onCheckedChange={v => set('countInProfit', v === true)} />
          <span>
            <strong>Count this as revenue</strong>
            <span className="tx-check-hint">
              {form.countInProfit !== false
                ? 'It adds to revenue and profit.'
                : 'It raises the balance only. Use this for money handed back to you or a refund of your own money.'}
            </span>
          </span>
        </label>
      </FormSection>
    </>
  );
  else if (kind === 'expense') details = (
    <>
      {account}
      <FormSection title="Details">
        <FormGrid>{category}{method}</FormGrid>
        {text('Paid to', 'paidTo', 'Person / vendor')}
        {text('Remark', 'remark', 'Optional note')}
      </FormSection>
    </>
  );
  else if (kind === 'drawing') {
    const due = partnerOutstanding[form.person] || 0;
    details = (
      <>
        <PartnerPicker partners={partners} value={form.person} onChange={v => set('person', v)} meta={dueMeta(partnerOutstanding, 'due', 'warn', 'Clear')} />
        {due > 0 && <div className="tx-note warn"><AlertTriangle size={14} /><span>{form.person} already has <strong>{fmtMoney(due)}</strong> outstanding.</span></div>}
        {account}
        {text('Purpose / notes', 'remark', 'e.g. Travel, emergency, personal')}
      </>
    );
  }
  else if (kind === 'return') {
    const due = partnerOutstanding[form.person] || 0;
    details = (
      <>
        <PartnerPicker partners={partners} value={form.person} onChange={v => set('person', v)} meta={dueMeta(partnerOutstanding, 'due', 'bad', 'Settled')} />
        {due > 0
          ? <div className="tx-note warn"><Info size={14} /><span>{form.person} has <strong>{fmtMoney(due)}</strong> outstanding to return.</span></div>
          : <div className="tx-note good"><Info size={14} /><span>{form.person} has no outstanding drawings.</span></div>}
        <Group label="Received in" required
          hint={form.accountType === POCKET
            ? 'No account balance changes — this only lowers what the partner owes.'
            : `This raises the ${accountLabel(form.accountType)} balance by the amount returned.`}>
          <Segmented options={RETURN_OPTIONS} value={form.accountType} onChange={v => set('accountType', v)} />
        </Group>
        {text('Notes', 'remark', 'Optional')}
      </>
    );
  }
  else if (kind === 'p_salary') {
    const meta = Object.fromEntries(partners.map(p => {
      const mo = salaryConfig[p] || 0;
      const paid = salaryPaidFor(p, form.monthLabel);
      const left = Math.max(0, mo - paid);
      if (!mo)        return [p, { label: 'Salary not set' }];
      if (left === 0) return [p, { label: 'Fully paid', tone: 'good' }];
      if (paid > 0)   return [p, { label: `${fmtMoney(left)} left`, tone: 'warn' }];
      return [p, { label: `${fmtMoney(mo)} pending`, tone: 'bad' }];
    }));
    details = (
      <>
        <PartnerPicker partners={partners} value={form.person} onChange={p => setSalary({ person: p })} meta={meta} />
        <Field label="Salary month" required>
          {id => (
            <select id={id} className="mac-select" value={form.monthLabel} onChange={e => setSalary({ monthLabel: e.target.value })}>
              {salaryMonthOptions(form.monthLabel).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </Field>
        {monthly > 0 ? (
          <div className={`tx-note ${remaining === 0 ? 'good' : 'warn'}`} style={{ flexDirection: 'column', gap: 6 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, width: '100%' }}>
              <span>Paid for {form.monthLabel}</span>
              <strong>{fmtMoney(paidSoFar)} / {fmtMoney(monthly)}</strong>
            </span>
            <span className={`tx-progress ${remaining === 0 ? 'done' : ''}`} style={{ width: '100%' }}>
              <span style={{ width: `${Math.min(100, (paidSoFar / monthly) * 100)}%` }} />
            </span>
            <span>{remaining > 0 ? `${fmtMoney(remaining)} still to pay for ${form.monthLabel}` : `Fully paid for ${form.monthLabel}`}</span>
          </div>
        ) : (
          <div className="tx-note"><Info size={14} /><span>No monthly salary is set for {form.person}. Set it under More → Partner salary settings to track what is left to pay.</span></div>
        )}
        {account}
        <FormSection title="Details">
          {method}
          {text('Notes', 'remark', 'Optional')}
        </FormSection>
      </>
    );
  }
  else if (kind === 'personal_exp') details = (
    <>
      <div className="tx-note brand"><Info size={14} /><span>Use this when a partner paid a company expense from their <strong>own money</strong>. It does not change bank or cash; the company will owe them a reimbursement.</span></div>
      <PartnerPicker partners={partners} value={form.person} onChange={v => set('person', v)} meta={dueMeta(partnerReimburseOwed, 'pending', 'warn', 'Clear')} />
      <FormSection title="Details">
        <FormGrid>{category}{method}</FormGrid>
        {text('Paid to (vendor / purpose)', 'paidTo', 'e.g. Electrician, Amazon, emergency repair')}
        {text('Remark', 'remark', 'Optional note')}
      </FormSection>
    </>
  );
  else if (kind === 'reimburse') {
    const owed = partnerReimburseOwed[form.person] || 0;
    details = (
      <>
        <PartnerPicker partners={partners} value={form.person} onChange={v => set('person', v)} meta={dueMeta(partnerReimburseOwed, 'owed', 'warn', 'All clear')} />
        {owed > 0
          ? <div className="tx-note warn"><Info size={14} /><span>The company owes {form.person} <strong>{fmtMoney(owed)}</strong> in pending reimbursements.</span></div>
          : <div className="tx-note good"><Info size={14} /><span>No pending reimbursements for {form.person}.</span></div>}
        <Group label="Paid from" required
          hint={form.reimburseFrom === 'none'
            ? 'No account balance changes — this only clears the amount owed.'
            : `This lowers the ${form.reimburseFrom} balance by the amount paid.`}>
          <Segmented options={REIMBURSE_OPTIONS} value={form.reimburseFrom} onChange={v => set('reimburseFrom', v)} />
        </Group>
        <FormSection title="Details">
          {method}
          {text('Notes', 'remark', 'Optional')}
        </FormSection>
      </>
    );
  }

  const kindMeta = KINDS.find(k => k.id === kind);

  return (
    <form id="tx-form" onSubmit={onSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {editing ? (
        <div className="tx-note"><Info size={14} /><span>Editing a <strong>{kindMeta?.label || 'transaction'}</strong> entry. To change what kind of entry this is, delete it and add a new one.</span></div>
      ) : (
        <div className="field">
          <span className="field-label">What happened?<span className="field-req" aria-hidden="true"> *</span></span>
          <div className="tx-kinds" role="radiogroup" aria-label="What happened?">
            {KINDS.map(({ id, label, hint, icon: Icon }) => (
              <button key={id} type="button" role="radio" aria-checked={kind === id} className="tx-kind" onClick={() => chooseKind(id)}>
                <Icon size={17} />
                <span style={{ minWidth: 0 }}>
                  <span className="tx-kind-label">{label}</span>
                  <span className="tx-kind-hint">{hint}</span>
                </span>
              </button>
            ))}
          </div>
          <span className="field-hint">
            Paying staff? Employee salaries are recorded from{' '}
            <button type="button" className="tx-link" onClick={onEmployees}>Employees</button> and appear here automatically.
          </span>
        </div>
      )}

      <FormGrid>
        <Field label="Amount (₹)" required error={errors.amount}
          hint={overpay ? <span className="tx-warn">More than the {fmtMoney(remaining)} left for {form.monthLabel}</span> : null}>
          <NumInput className="mac-input" value={form.amount} onChange={v => set('amount', v)}
            placeholder={kind === 'p_salary' && remaining ? fmtInput(remaining) : '0'} />
        </Field>
        <Field label={kind === 'transfer' ? 'Date moved' : kind === 'income' || kind === 'return' || (kind === 'other_money' && OTHER_KIND[form.otherKind]?.type === 'Credit') ? 'Date received' : 'Date paid'} required error={errors.date}>
          {id => <input id={id} className="mac-input" type="date" max={todayLocal()} value={form.date} onChange={e => set('date', e.target.value)} />}
        </Field>
      </FormGrid>

      {details}
    </form>
  );
}

// ─── Partners view ───────────────────────────────────────────────────────────

function PartnersPanel({ rows, monthName, onRecord, onShowEntries, onSalarySettings }) {
  const totalDue  = rows.reduce((s, r) => s + r.outstanding, 0);
  const totalOwed = rows.reduce((s, r) => s + r.reimburseOwed, 0);
  const pending   = rows.filter(r => r.monthly > 0 && r.salaryRemaining > 0).length;
  // Drawing due minus reimbursement owed: above zero the partner owes, below zero the company owes
  const net = r => Math.round((r.outstanding - r.reimburseOwed) * 100) / 100;
  const totalNet = Math.round((totalDue - totalOwed) * 100) / 100;
  const summary = [
    (totalDue > 0 || totalOwed > 0) && (totalNet > 0 ? `Partners owe ${fmtMoney(totalNet)} net`
      : totalNet < 0 ? `Company owes partners ${fmtMoney(-totalNet)} net` : 'Drawings and reimbursements cancel out'),
    totalDue > 0 && `${fmtMoney(totalDue)} drawings due`,
    totalOwed > 0 && `${fmtMoney(totalOwed)} to reimburse`,
    pending > 0 && `${pending} ${pending === 1 ? 'salary' : 'salaries'} pending for ${monthName}`,
  ].filter(Boolean);

  return (
    <>
      <div className="tx-partners-bar">
        <span>{summary.length ? summary.join(' · ') : 'All clear — nothing due, owed or pending.'}</span>
        <button className="mac-btn mac-btn-secondary" onClick={onSalarySettings}><Settings2 size={14} /> Salary settings</button>
      </div>
      <div className="tx-partners">
        {rows.map(r => (
          <div key={r.partner} className="mac-card tx-partner">
            <div className="tx-partner-head">
              <Avatar name={r.partner} size={36} />
              <span className="cell-main">{r.partner}</span>
              <RowMenu label={`Record for ${r.partner}`} items={[
                { label: 'Took money',        icon: HandCoins,      onClick: () => onRecord('drawing', r.partner) },
                { label: 'Returned money',    icon: RotateCcw,      onClick: () => onRecord('return', r.partner) },
                { label: 'Pay salary',        icon: Banknote,       onClick: () => onRecord('p_salary', r.partner) },
                { label: 'Paid from pocket',  icon: CreditCard,     onClick: () => onRecord('personal_exp', r.partner) },
                { label: 'Reimburse',         icon: ArrowRightLeft, onClick: () => onRecord('reimburse', r.partner) },
                { label: 'Show in ledger',    icon: List,           onClick: () => onShowEntries(r.partner) },
              ]} />
            </div>
            {/* Net position: what the partner took, minus what the company owes them back */}
            <div className="tx-net">
              <span className="tx-net-label">{net(r) > 0 ? 'Partner owes the company' : net(r) < 0 ? 'Company owes the partner' : 'Drawings and reimbursement'}</span>
              <span className={`tx-net-value ${net(r) > 0 ? 'tx-bad' : net(r) < 0 ? 'tx-warn' : 'tx-good'}`}>{net(r) === 0 ? 'Settled' : fmtMoney(Math.abs(net(r)))}</span>
              <span className="tx-net-parts">
                <span>Drawing {fmtMoney(r.outstanding)}</span>
                <span aria-hidden="true">−</span>
                <span>Reimburse {fmtMoney(r.reimburseOwed)}</span>
              </span>
            </div>
            <dl className="kv">
              <dt>Salary · {monthName.split(' ')[0]}</dt>
              <dd className={!r.monthly ? 'faint' : r.salaryRemaining === 0 ? 'tx-good' : r.salaryPaid > 0 ? 'tx-warn' : 'tx-bad'}>
                {!r.monthly ? 'Not set'
                  : r.salaryRemaining === 0 ? `Paid ${fmtMoney(r.monthly)}`
                  : r.salaryPaid > 0 ? `${fmtMoney(r.salaryPaid)} / ${fmtMoney(r.monthly)}`
                  : `${fmtMoney(r.monthly)} pending`}
              </dd>
            </dl>
            {r.monthly > 0 && (
              <span className={`tx-progress ${r.salaryRemaining === 0 ? 'done' : ''}`}>
                <span style={{ width: `${Math.min(100, (r.salaryPaid / r.monthly) * 100)}%` }} />
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── History (audit) entry ───────────────────────────────────────────────────

function AuditItem({ e }) {
  const tone = e.action === 'Deleted' ? 'bad' : e.action === 'Created' ? 'good' : 'brand';
  const when = e.createdAt
    ? new Date(e.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <div className="tx-hist-item">
      <div className="tx-hist-top">
        <span className={`badge tx-badge ${tone}`}>{e.action}</span>
        {e.description && <span className="cell-main">{e.description}</span>}
      </div>
      <span>{when}{when ? ' · ' : ''}by {e.by || '—'}</span>
      {e.prevData && e.nextData && (
        <span>
          {fmtMoney(e.prevData.amount)} · {accountLabel(e.prevData.accountType)} → <strong>{fmtMoney(e.nextData.amount)} · {accountLabel(e.nextData.accountType)}</strong>
        </span>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Transactions() {
  const navigate = useNavigate();
  const toast = useToast();
  const isPhone = useIsPhone();
  const { user, displayName } = useAuth();
  const currentUser = displayName || user?.email || 'Unknown';
  // Partner names for the ledger's free-text `person` field
  const { people: directory } = usePeople();
  const partners = useMemo(() => directory.filter(p => p.kind === 'partner' && p.active !== false).map(p => p.name), [directory]);

  const [txs, setTxs]             = useState([]);
  const [openBal, setOpenBal]     = useState(ZERO_BAL);
  const [salaryConfig, setSalaryConfig] = useState(DEFAULT_SALARY);
  const [auditLog, setAuditLog]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [savedCats, setSavedCats] = useState([]);       // expense categories the partners added

  const [view, setView]       = useState('ledger');   // ledger | partners
  const [filters, setFilters] = useState(NO_FILTERS);
  const [detailId, setDetailId] = useState(null);
  const [deleteTx, setDeleteTx] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editTx, setEditTx]     = useState(null);
  const [form, setForm]         = useState(initForm);
  const [errors, setErrors]     = useState({});
  const [saving, setSaving]     = useState(false);
  const [warn, setWarn]         = useState(null);      // things worth a second look before saving: [message]

  const [showOB, setShowOB]   = useState(false);
  const [obForm, setObForm]   = useState(ZERO_BAL);
  const [showSalConfig, setShowSalConfig] = useState(false);
  const [salConfigForm, setSalConfigForm] = useState(DEFAULT_SALARY);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  // ── Data ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [txData, obData, salConf, auditData, cats] = await Promise.all([
        transactionsDB.getAll(),
        settingsDB.get('opening_balances'),
        settingsDB.get('partner_salary_config'),
        auditDB.getAll('transaction'),
        settingsDB.get(CATEGORY_KEY),
      ]);
      if (Array.isArray(cats)) setSavedCats(cats);
      setTxs(txData);
      if (obData) setOpenBal(obData);
      if (salConf) setSalaryConfig(salConf);
      setAuditLog(auditData);
    } catch (e) {
      console.error(e);
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Balances — shared with the Dashboard and P&L page (src/lib/finance.js) ──
  const bal = useMemo(() => computeBalances(txs, openBal), [txs, openBal]);

  const thisMonth = currentMonth();
  const monthFlow = useMemo(
    () => computeBalances(txs.filter(t => txMonth(t) === thisMonth && !isOpeningEntry(t)), ZERO_BAL),   // opening balances are not this month's movement
    [txs, thisMonth],
  );
  const monthNet = monthFlow.totalCredit - monthFlow.totalDebit;

  // ── Partner positions: the fixed opening figure, then this ledger's entries ──
  const round2 = n => Math.round(n * 100) / 100;
  const partnerOutstanding = useMemo(() => Object.fromEntries(partners.map(p => {
    const taken    = sumAmt(txs.filter(t => t.subType === 'drawing'        && t.person === p));
    const returned = sumAmt(txs.filter(t => t.subType === 'drawing_return' && t.person === p));
    return [p, Math.max(0, round2(openingPartner(openBal, p).drawing + taken - returned))];
  })), [txs, partners, openBal]);

  const partnerReimburseOwed = useMemo(() => Object.fromEntries(partners.map(p => {
    const spent = sumAmt(txs.filter(t => t.subType === 'personal_exp'  && t.person === p));
    const paid  = sumAmt(txs.filter(t => t.subType === 'reimbursement' && t.person === p));
    return [p, Math.max(0, round2(openingPartner(openBal, p).reimburse + spent - paid))];
  })), [txs, partners, openBal]);

  // Partner salary already paid for a month label; `exceptId` skips the entry being edited
  const salaryPaidFor = useCallback((person, label, exceptId) => sumAmt(txs.filter(t =>
    t.subType === 'partner_salary' && t.person === person && t.monthLabel === label && t.id !== exceptId)), [txs]);

  const monthName = currentMonthLabel();
  const partnerRows = useMemo(() => partners.map(p => {
    const monthly    = salaryConfig[p] || 0;
    const salaryPaid = salaryPaidFor(p, monthName);
    return {
      partner: p, monthly, salaryPaid,
      salaryRemaining: Math.max(0, monthly - salaryPaid),
      outstanding: partnerOutstanding[p], reimburseOwed: partnerReimburseOwed[p],
    };
  }), [partners, salaryConfig, salaryPaidFor, monthName, partnerOutstanding, partnerReimburseOwed]);

  // Built-in categories + the ones partners added + any already used in the ledger. "Other" stays last.
  const categories = useMemo(() => {
    const used = txs.filter(t => (t.subType === 'expense' || t.subType === 'personal_exp') && !isOpeningEntry(t)).map(t => t.category);
    return mergeCategories(EXPENSE_CATEGORIES, savedCats, used);
  }, [txs, savedCats]);
  // Saved for every partner. Resolves to the name as stored (an existing one when only the case differs).
  const addCategory = useCallback(async raw => {
    const name = String(raw || '').split(' ').filter(Boolean).join(' ');
    if (!name) return null;
    const existing = categories.find(c => c.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const next = [...savedCats, name];
    setSavedCats(next);
    try { await settingsDB.set(CATEGORY_KEY, next); }
    catch (e) { setSavedCats(savedCats); toast.error('Could not save the new category', e); return null; }
    return name;
  }, [categories, savedCats, toast]);

  const editId = editTx?.id;
  const formStats = useMemo(() => ({
    categories, addCategory,
    partners, partnerOutstanding, partnerReimburseOwed, salaryConfig,
    salaryPaidFor: (person, label) => salaryPaidFor(person, label, editId),
  }), [categories, addCategory, partners, partnerOutstanding, partnerReimburseOwed, salaryConfig, salaryPaidFor, editId]);

  // ── Filtered ledger ────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return txs.filter(t => {
      if (filters.dir === 'in'  && t.type !== 'Credit') return false;
      if (filters.dir === 'out' && t.type !== 'Debit')  return false;
      if (!accountMatches(t, filters.account)) return false;
      if (filters.subType && t.subType !== filters.subType) return false;
      if (filters.month && txMonth(t) !== filters.month) return false;
      return !q
        || txDesc(t).toLowerCase().includes(q)
        || (t.remark     || '').toLowerCase().includes(q)
        || (t.clientName || '').toLowerCase().includes(q)
        || (t.paidTo     || '').toLowerCase().includes(q)
        || (t.person     || '').toLowerCase().includes(q)
        || (t.monthLabel || '').toLowerCase().includes(q);
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [txs, filters]);

  // In / out totals follow the balance rules: entries paid from a partner's own pocket are not company money
  const filteredFlow = useMemo(() => computeBalances(filtered, ZERO_BAL), [filtered]);
  const pocketCount  = useMemo(() => filtered.filter(t => t.accountType === POCKET).length, [filtered]);

  const groups = useMemo(() => {
    const out = [];
    filtered.forEach(t => {
      const key = txMonth(t);
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(t);
      else out.push({ key, rows: [t] });
    });
    return out.map(g => {
      const flow = computeBalances(g.rows, ZERO_BAL);
      return { ...g, label: g.key ? monthLabel(g.key, true) : 'No date', net: flow.totalCredit - flow.totalDebit };
    });
  }, [filtered]);

  const isFiltered = Object.keys(NO_FILTERS).some(k => filters[k] !== NO_FILTERS[k]);
  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const showLedger = patch => { setFilters({ ...NO_FILTERS, ...patch }); setView('ledger'); };

  // ── Add / edit ─────────────────────────────────────────────
  const updateForm = updater => { setForm(updater); setErrors({}); };

  function openAdd(kind = 'income', person) {
    const next = initForm(kind);
    next.person = person || partners[0] || '';
    if (kind === 'p_salary') {
      const left = Math.max(0, (salaryConfig[next.person] || 0) - salaryPaidFor(next.person, next.monthLabel));
      next.amount = next.autoAmount = left ? String(left) : '';
    }
    setEditTx(null); setForm(next); setErrors({}); setShowForm(true);
  }
  function openEdit(t) {
    setDetailId(null);
    setEditTx(t); setForm(rowToForm(t)); setErrors({}); setShowForm(true);
  }
  function closeForm() {
    if (saving) return;
    setShowForm(false); setEditTx(null);
  }

  // Same audit entry in the database and in the open History list
  function recordAudit(entry) {
    auditDB.log(entry).catch(console.error);
    setAuditLog(l => [{ id: Date.now(), createdAt: new Date().toISOString(), ...entry }, ...l]);
  }

  // Allowed, but unusual enough to ask first. Editing: the entry's own amount is already inside
  // the totals, so it is added back before comparing.
  function softWarnings() {
    const out = [];
    const amt = +form.amount || 0;
    const kind = form.txType;
    const was = editTx ? +editTx.amount || 0 : 0;
    if (kind === 'return') {
      const due = (partnerOutstanding[form.person] || 0) + was;
      if (amt > due + 0.005) out.push(`${form.person} owes ${fmtMoney(due)}, but this records ${fmtMoney(amt)} returned. The extra ${fmtMoney(amt - due)} will not show anywhere.`);
    }
    if (kind === 'reimburse') {
      const owed = (partnerReimburseOwed[form.person] || 0) + was;
      if (amt > owed + 0.005) out.push(`The company owes ${form.person} ${fmtMoney(owed)}, but this pays ${fmtMoney(amt)}.`);
    }
    if (kind === 'p_salary') {
      const monthly = salaryConfig[form.person] || 0;
      const left = Math.max(0, monthly - salaryPaidFor(form.person, form.monthLabel, editTx?.id));
      if (monthly > 0 && amt > left + 0.005) out.push(`${form.person}'s salary for ${form.monthLabel} has ${fmtMoney(left)} left to pay, but this pays ${fmtMoney(amt)}.`);
    }
    // money leaving a company account
    const row = formToRow(form);
    const acct = kind === 'transfer' ? form.accountType : row.accountType;
    if ((kind === 'transfer' || row.type === 'Debit') && (acct === BANK || acct === CASH)) {
      const have = (acct === BANK ? bal.bank : bal.cash) + (editTx && editTx.type === 'Debit' && accountMatches(editTx, acct) ? was : 0);
      if (amt > have + 0.005) out.push(`${accountLabel(acct)} has ${fmtMoney(have)}. This takes it ${fmtMoney(amt - have)} below zero.`);
    }
    return out;
  }

  // `force` = the warnings were shown and the user chose to save anyway
  async function save(e, force = false) {
    e?.preventDefault();
    if (saving) return;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (!force) {
      const warnings = softWarnings();
      if (warnings.length) { setWarn(warnings); return; }
    }
    setSaving(true);
    const row = formToRow(form);
    // An opening-balance entry stays one when it is edited (most forms carry no category),
    // otherwise it would start counting as this period's money in profit and loss.
    if (editTx && isOpeningEntry(editTx)) row.category = editTx.category;
    try {
      if (!editTx && form.txType === 'transfer') {
        const from = form.accountType, to = from === BANK ? CASH : BANK;
        const rows = await transactionsDB.transfer({ from, to, amount: form.amount, date: form.date, paymentMethod: form.paymentMethod, remark: form.remark });
        setTxs(ts => [...rows, ...ts]);
        recordAudit({ entity: 'transaction', entityId: rows[0]?.id, action: 'Created', description: `Moved ${fmtMoney(+form.amount)} from ${accountLabel(from)} to ${accountLabel(to)}`, by: currentUser, nextData: rows });
        toast.success('Transfer recorded');
      } else if (editTx) {
        const updated = await transactionsDB.update(editTx.id, row);
        setTxs(ts => ts.map(t => t.id === editTx.id ? updated : t));
        recordAudit({ entity: 'transaction', entityId: editTx.id, action: 'Edited', description: `${txDesc(updated)} — ${fmtMoney(updated.amount)}`, by: currentUser, prevData: editTx, nextData: updated });
        toast.success('Transaction updated');
      } else {
        const created = await transactionsDB.create(row);
        setTxs(ts => [created, ...ts]);
        recordAudit({ entity: 'transaction', entityId: created.id, action: 'Created', description: `${txDesc(created)} — ${fmtMoney(created.amount)}`, by: currentUser, nextData: created });
        toast.success('Transaction added');
      }
      setShowForm(false); setEditTx(null);
    } catch (err) {
      // Keep the form open with everything the user typed
      toast.error(editTx ? 'Could not save changes' : 'Could not add transaction', err);
    } finally {
      setSaving(false);
    }
  }

  async function del(tx) {
    // Both halves of a transfer go together
    setTxs(ts => ts.filter(t => t.id !== tx.id && !(tx.pairId && t.pairId === tx.pairId)));
    try {
      await transactionsDB.delete(tx.id);
      recordAudit({ entity: 'transaction', entityId: tx.id, action: 'Deleted', description: `${txDesc(tx)} — ${fmtMoney(tx.amount)}`, by: currentUser, prevData: tx });
      toast.success('Transaction deleted');
    } catch (err) {
      setTxs(ts => ts.some(t => t.id === tx.id) ? ts : [tx, ...ts]);
      toast.error('Could not delete transaction', err);
    }
  }

  // ── Settings: saved first, applied only when the save succeeded ──
  async function saveOB(e) {
    e.preventDefault();
    if (settingsSaving) return;
    setSettingsSaving(true);
    try {
      await settingsDB.set('opening_balances', obForm);
      setOpenBal(obForm);
      setShowOB(false);
      toast.success('Opening balance saved');
    } catch (err) {
      toast.error('Could not save opening balance', err);
    } finally {
      setSettingsSaving(false);
    }
  }

  async function saveSalaryConfig(e) {
    e.preventDefault();
    if (settingsSaving) return;
    setSettingsSaving(true);
    try {
      await settingsDB.set('partner_salary_config', salConfigForm);
      setSalaryConfig(salConfigForm);
      setShowSalConfig(false);
      toast.success('Partner salaries saved');
    } catch (err) {
      toast.error('Could not save partner salaries', err);
    } finally {
      setSettingsSaving(false);
    }
  }

  const openOB = () => { setObForm(openBal); setShowOB(true); };
  const openSalConfig = () => { setSalConfigForm(salaryConfig); setShowSalConfig(true); };

  function exportCsv() {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Date', 'Type', 'Description', 'Party', 'Account', 'Payment method', 'Category / source', 'Salary month', 'Money in', 'Money out'];
    const lines = filtered.map(t => [
      (t.date || '').slice(0, 10), typeLabel(t), txMain(t), txParty(t), t.accountType || '', t.paymentMethod || '',
      (t.type === 'Credit' ? t.source : t.category) || '', t.monthLabel || '',
      t.type === 'Credit' ? +t.amount || 0 : '', t.type === 'Credit' ? '' : +t.amount || 0,
    ]);
    const csv = [head, ...lines].map(r => r.map(esc).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `codelix-transactions-${todayLocal()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast.success(`Exported ${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`);
  }

  // ── Render ─────────────────────────────────────────────────
  const ready = !loading && !loadError;
  const detail = detailId != null ? txs.find(t => t.id === detailId) : null;
  const detailHistory = detail ? auditLog.filter(e => e.entityId === detail.id) : [];
  const detailOwner = managedBy(detail);              // 'project' | 'employee' | null
  const detailManaged = detailOwner === 'employee';
  const detailIsTransfer = !!detail?.pairId;

  const amountOf = t => (
    <span className={`tx-amt ${t.type === 'Credit' ? 'amount-in' : 'amount-out'}`}>
      {t.type === 'Credit' ? '+' : '−'}{fmtMoney(t.amount)}
    </span>
  );
  const rowKey = (e, t) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailId(t.id); } };

  return (
    <div className="tx-page">
      <Header
        title="Transactions"
        subtitle={loading ? 'Loading the ledger…' : loadError ? 'Could not load the ledger'
          : `Balance ${plain(bal.total)} · Bank ${plain(bal.bank)} · Cash ${plain(bal.personal)}`}
        actions={ready && (
          <>
            <RowMenu label="More" items={[
              { label: 'Opening balance',         icon: Wallet,    onClick: openOB },
              { label: 'Partner salary settings', icon: Settings2, onClick: openSalConfig },
              { label: 'History',                 icon: History,   onClick: () => setShowAudit(true) },
              { label: 'Export CSV',              icon: Download,  onClick: exportCsv },
            ]} />
            <button onClick={() => openAdd()} className="mac-btn mac-btn-primary"><Plus size={15} /> Add transaction</button>
          </>
        )}
      />

      <div className="page-body">
        {loading && <SkeletonRows rows={8} />}
        {!loading && loadError && <ErrorPanel title="Could not load transactions" error={loadError} onRetry={load} />}

        {ready && (
          <>
            {bal.total < 10000 && (
              <div className="tx-note bad" role="status">
                <AlertTriangle size={14} />
                <span>Low balance — only <strong>{plain(bal.total)}</strong> left across bank and cash.</span>
              </div>
            )}

            <StatTiles items={[
              { label: 'Total balance', value: plain(bal.total), icon: Wallet, tone: 'dark',
                sub: `In ${fmtMoney(bal.totalCredit)} · Out ${fmtMoney(bal.totalDebit)} all time`,
                onClick: () => showLedger() },
              { label: 'Bank', value: plain(bal.bank), icon: Landmark, onClick: () => showLedger({ account: BANK }) },
              { label: 'Cash', value: plain(bal.personal), icon: Banknote, onClick: () => showLedger({ account: CASH }) },
              { label: 'This month’s net', value: signed(monthNet), icon: monthNet < 0 ? TrendingDown : TrendingUp,
                tone: monthNet < 0 ? 'bad' : 'good',
                sub: `In ${fmtMoney(monthFlow.totalCredit)} · Out ${fmtMoney(monthFlow.totalDebit)}`,
                onClick: () => showLedger({ month: thisMonth }) },
            ]} />

            <div className="tab-bar tx-tabs" role="tablist" aria-label="View">
              {[['ledger', 'Ledger'], ['partners', 'Partners']].map(([k, l]) => (
                <button key={k} role="tab" aria-selected={view === k} className={`tab-item ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>{l}</button>
              ))}
            </div>

            {view === 'partners' && (
              <PartnersPanel
                rows={partnerRows}
                monthName={monthName}
                onRecord={openAdd}
                onShowEntries={p => showLedger({ search: p })}
                onSalarySettings={openSalConfig}
              />
            )}

            {view === 'ledger' && (
              <>
                <Toolbar search={filters.search} onSearch={v => setFilter('search', v)} placeholder="Search transactions…"
                  right={<>
                    <span className="tx-count">
                      {filtered.length} of {txs.length} · in {fmtMoney(filteredFlow.totalCredit)} · out {fmtMoney(filteredFlow.totalDebit)}
                      {pocketCount > 0 && ` · ${pocketCount} paid from a partner’s pocket not counted`}
                    </span>
                    {isFiltered && <button className="mac-btn mac-btn-ghost" onClick={() => setFilters(NO_FILTERS)}>Clear</button>}
                  </>}>
                  <Chips label="Direction" options={DIRECTION_CHIPS} value={filters.dir} onChange={v => setFilter('dir', v)} />
                  <select className="mac-select" aria-label="Account" value={filters.account} onChange={e => setFilter('account', e.target.value)}>
                    <option value="">All accounts</option>
                    {[BANK, CASH, POCKET].map(a => <option key={a} value={a}>{accountLabel(a)}</option>)}
                  </select>
                  <select className="mac-select" aria-label="Category" value={filters.subType} onChange={e => setFilter('subType', e.target.value)}>
                    <option value="">All categories</option>
                    {Object.entries(SUB_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <input type="month" className="mac-input" aria-label="Month" value={filters.month} onChange={e => setFilter('month', e.target.value)} />
                </Toolbar>

                {txs.length === 0 ? (
                  <EmptyPanel icon={Receipt} title="No transactions yet"
                    text="Record money received, expenses and partner entries here. Balances update as you add them."
                    action={<button className="mac-btn mac-btn-primary" onClick={() => openAdd()}><Plus size={15} /> Add transaction</button>} />
                ) : filtered.length === 0 ? (
                  <EmptyPanel icon={Receipt} title="Nothing matches your filters"
                    text="Try a different search, month or account."
                    action={<button className="mac-btn mac-btn-secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>} />
                ) : isPhone ? (
                  <div className="list-cards">
                    {groups.map((g, i) => (
                      <Fragment key={`${g.key}-${i}`}>
                        <div className="tx-month-head"><span>{g.label}</span><span>{g.rows.length} · net {signed(g.net)}</span></div>
                        {g.rows.map(t => (
                          <button key={t.id} className="list-card" onClick={() => setDetailId(t.id)}>
                            <span className="tx-card-top"><span className="cell-main">{txMain(t)}</span>{amountOf(t)}</span>
                            <span className="tx-card-meta">{[fmtDate(t.date), txParty(t), accountLabel(t.accountType)].filter(Boolean).join(' · ')}</span>
                          </button>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <div className="mac-card">
                    <div className="table-wrap">
                      <table className="data-table tx-table">
                        <thead>
                          <tr><th>Date</th><th>Description</th><th>Party</th><th>Account</th><th className="num">Amount</th></tr>
                        </thead>
                        <tbody>
                          {groups.map((g, i) => (
                            <Fragment key={`${g.key}-${i}`}>
                              <tr className="tx-month">
                                <td colSpan={5}><div className="tx-month-in"><span>{g.label}</span><span>{g.rows.length} {g.rows.length === 1 ? 'entry' : 'entries'} · net {signed(g.net)}</span></div></td>
                              </tr>
                              {g.rows.map(t => (
                                <tr key={t.id} className="clickable" tabIndex={0} onClick={() => setDetailId(t.id)} onKeyDown={e => rowKey(e, t)}>
                                  <td className="tx-date">{fmtDate(t.date)}</td>
                                  <td>
                                    <div className="cell-main">{txMain(t)}</div>
                                    <div className="cell-sub">{txSub(t)}</div>
                                  </td>
                                  <td>{txParty(t) || <span className="faint">—</span>}</td>
                                  <td className="muted">{accountLabel(t.accountType)}</td>
                                  <td className="num">{amountOf(t)}</td>
                                </tr>
                              ))}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Entry detail ─────────────────────────────────────── */}
      <Drawer
        isOpen={!!detail}
        onClose={() => setDetailId(null)}
        title={detail ? txMain(detail) : ''}
        subtitle={detail ? `${typeLabel(detail)} · ${fmtDate(detail.date)}` : ''}
        footer={detail && (
          <>
            {!detailOwner && <button className="mac-btn mac-btn-danger" onClick={() => { setDeleteTx(detail); setDetailId(null); }}><Trash2 size={14} /> {detailIsTransfer ? 'Delete transfer' : 'Delete'}</button>}
            {detailOwner === 'employee'
              ? <button className="mac-btn mac-btn-primary" onClick={() => navigate('/employees')}><ExternalLink size={14} /> Open Employees</button>
              : detailOwner === 'project'
                ? <button className="mac-btn mac-btn-primary" onClick={() => navigate('/projects')}><ExternalLink size={14} /> Open Projects</button>
                : !detailIsTransfer && <button className="mac-btn mac-btn-primary" onClick={() => openEdit(detail)}><Pencil size={14} /> Edit</button>}
          </>
        )}
      >
        {detail && (
          <>
            <div>
              <div className={`tx-detail-amount ${detail.type === 'Credit' ? 'amount-in' : 'amount-out'}`}>
                {detail.type === 'Credit' ? '+' : '−'}{fmtMoney(detail.amount)}
              </div>
              <div className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 4 }}>
                {detail.accountType === POCKET
                  ? 'Paid from a partner’s own pocket — bank and cash balances are not affected.'
                  : detail.accountType === 'Non-cash'
                  ? 'No money moved — this part of the salary was already paid as an advance. It counts as salary cost.'
                  : `${detail.type === 'Credit' ? 'Added to' : 'Taken from'} ${accountLabel(detail.accountType)}.`}
              </div>
            </div>

            {detailOwner === 'project' && (
              <div className="tx-note brand">
                <Info size={14} />
                <span><strong>Recorded from a project payment.</strong> Change or remove it on the project, which keeps the two in step.</span>
              </div>
            )}
            {detailIsTransfer && (
              <div className="tx-note">
                <Info size={14} />
                <span>One half of a move between your own accounts. Deleting it deletes both halves. It does not count in profit.</span>
              </div>
            )}
            {detailManaged && (
              <div className="tx-note brand">
                <Info size={14} />
                <span>
                  <strong>Managed from Employees.</strong> Salary payments are recorded and edited on the employee’s page, which keeps their salary history in step.{' '}
                  <button type="button" className="tx-link" onClick={() => navigate('/employees')}>Open Employees</button>
                </span>
              </div>
            )}

            <dl className="kv">
              <dt>Type</dt><dd>{typeLabel(detail)}</dd>
              <dt>Date</dt><dd>{fmtDate(detail.date)}</dd>
              <dt>Account</dt><dd>{detail.accountType || '—'}</dd>
              <dt>Payment method</dt><dd>{detail.paymentMethod || '—'}</dd>
              {detail.source && <><dt>Source</dt><dd>{detail.source}</dd></>}
              {detail.clientName && <><dt>Client</dt><dd>{detail.clientName}</dd></>}
              {detail.category && <><dt>Category</dt><dd>{detail.category}</dd></>}
              {detail.paidTo && <><dt>Paid to</dt><dd>{detail.paidTo}</dd></>}
              {detail.person && <><dt>{detailManaged ? 'Employee' : 'Partner'}</dt><dd>{detail.person}</dd></>}
              {detail.monthLabel && <><dt>Salary month</dt><dd>{detail.monthLabel}</dd></>}
              <dt>Remark</dt><dd>{detail.remark || '—'}</dd>
            </dl>

            {detailHistory.length > 0 && (
              <section className="tx-hist">
                <h3 className="section-title">History</h3>
                {detailHistory.map(e => <AuditItem key={e.id} e={e} />)}
              </section>
            )}
          </>
        )}
      </Drawer>

      {/* ── Add / edit ───────────────────────────────────────── */}
      <Modal
        isOpen={showForm}
        onClose={closeForm}
        title={editTx ? 'Edit transaction' : 'Add transaction'}
        size="md"
        footer={
          <>
            <button type="button" onClick={closeForm} disabled={saving} className="mac-btn mac-btn-secondary">Cancel</button>
            <button type="submit" form="tx-form" disabled={saving} className="mac-btn mac-btn-primary">
              {saving ? 'Saving…' : editTx ? 'Save changes' : 'Add transaction'}
            </button>
          </>
        }
      >
        <TxForm
          form={form}
          setForm={updateForm}
          errors={errors}
          editing={!!editTx}
          stats={formStats}
          onSubmit={save}
          onEmployees={() => { setShowForm(false); navigate('/employees'); }}
        />
      </Modal>

      {/* ── Opening balance ──────────────────────────────────── */}
      <Modal isOpen={showOB} onClose={() => !settingsSaving && setShowOB(false)} title="Opening balance"
        footer={
          <>
            <button type="button" onClick={() => setShowOB(false)} disabled={settingsSaving} className="mac-btn mac-btn-secondary">Cancel</button>
            <button type="submit" form="tx-ob-form" disabled={settingsSaving} className="mac-btn mac-btn-primary">{settingsSaving ? 'Saving…' : 'Save'}</button>
          </>
        }>
        <form id="tx-ob-form" onSubmit={saveOB} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="tx-note"><Info size={14} /><span>Fixed starting figures from before the first entry in this ledger. Every balance starts from these. They are not transactions: they never show as this month’s money in or out and never count in profit.</span></div>
          <FormGrid>
            <Field label="Cash + Savings (₹)">
              <NumInput className="mac-input" value={obForm.cash || ''} onChange={v => setObForm(b => ({ ...b, cash: +v || 0 }))} placeholder="0" />
            </Field>
            <Field label="Company Bank (₹)">
              <NumInput className="mac-input" value={obForm.bank || ''} onChange={v => setObForm(b => ({ ...b, bank: +v || 0 }))} placeholder="0" />
            </Field>
          </FormGrid>
          <FormSection title="Partners — carried over">
            <div className="tx-ob-partners">
              <span className="tx-ob-head">Partner</span>
              <span className="tx-ob-head">Owes the company (₹)</span>
              <span className="tx-ob-head">Company owes them (₹)</span>
              {partners.map(p => (
                <Fragment key={p}>
                  <span className="tx-ob-name">{p}</span>
                  <NumInput className="mac-input" aria-label={`${p} owes the company`} value={obForm.partners?.[p]?.drawing || ''} placeholder="0"
                    onChange={v => setObForm(b => ({ ...b, partners: { ...b.partners, [p]: { ...b.partners?.[p], drawing: +v || 0 } } }))} />
                  <NumInput className="mac-input" aria-label={`Company owes ${p}`} value={obForm.partners?.[p]?.reimburse || ''} placeholder="0"
                    onChange={v => setObForm(b => ({ ...b, partners: { ...b.partners, [p]: { ...b.partners?.[p], reimburse: +v || 0 } } }))} />
                </Fragment>
              ))}
            </div>
          </FormSection>
        </form>
      </Modal>

      {/* ── Partner salary settings ──────────────────────────── */}
      <Modal isOpen={showSalConfig} onClose={() => !settingsSaving && setShowSalConfig(false)} title="Partner salary settings" size="sm"
        footer={
          <>
            <button type="button" onClick={() => setShowSalConfig(false)} disabled={settingsSaving} className="mac-btn mac-btn-secondary">Cancel</button>
            <button type="submit" form="tx-salary-form" disabled={settingsSaving} className="mac-btn mac-btn-primary">{settingsSaving ? 'Saving…' : 'Save'}</button>
          </>
        }>
        <form id="tx-salary-form" onSubmit={saveSalaryConfig} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {partners.map(p => (
            <div key={p} className="tx-config-row">
              <Avatar name={p} size={36} />
              <Field label={`${p} — monthly salary (₹)`}>
                <NumInput className="mac-input" value={salConfigForm[p] || ''} onChange={v => setSalConfigForm(c => ({ ...c, [p]: +v || 0 }))} placeholder="0" />
              </Field>
            </div>
          ))}
        </form>
      </Modal>

      {/* ── History (audit log) ──────────────────────────────── */}
      <Drawer isOpen={showAudit} onClose={() => setShowAudit(false)} title="History"
        subtitle={`${auditLog.length} ${auditLog.length === 1 ? 'change' : 'changes'} to the ledger, newest first`}>
        {auditLog.length === 0
          ? <div className="empty-panel"><span className="empty-icon"><History size={22} /></span><div className="empty-title">No changes recorded yet</div><div className="empty-text">Every entry added, edited or deleted is listed here with who did it.</div></div>
          : <div className="tx-hist">{auditLog.map(e => <AuditItem key={e.id} e={e} />)}</div>}
      </Drawer>

      <ConfirmDialog isOpen={!!warn} onClose={() => setWarn(null)} onConfirm={() => save(null, true)}
        title="Save anyway?" confirmLabel="Save anyway" danger={false}
        message={(warn || []).map((w, i) => <span key={i} style={{ display: 'block', marginBottom: 6 }}>{w}</span>)} />

      <ConfirmDialog
        isOpen={!!deleteTx}
        onClose={() => setDeleteTx(null)}
        onConfirm={() => del(deleteTx)}
        title="Delete transaction"
        message={deleteTx ? `Delete “${txMain(deleteTx)}” (${fmtMoney(deleteTx.amount)})? Balances will change and this cannot be undone.${deleteTx.subType === 'employee_salary' ? ' The employee’s salary record on the Employees page is not changed.' : ''}` : ''}
      />
    </div>
  );
}
