import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import SearchBar from '../components/ui/SearchBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { PageLoader } from '../components/ui/CodelixLoader';
import { transactionsDB, settingsDB, employeesDB } from '../lib/db';
import { TRANSACTION_SOURCES, EXPENSE_CATEGORIES, PAYMENT_METHODS, PARTNERS } from '../data/mockData';
import {
  Plus, Filter, ArrowUpRight, ArrowDownRight, Edit2, Trash2,
  Wallet, History, AlertTriangle, IndianRupee, HandCoins, RotateCcw,
  Banknote, Settings2, CheckCircle2, Clock, Users, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = ['Cash + Savings Account', 'Company Bank'];

const TX_TYPES = [
  { id: 'income',   label: 'Income',          icon: ArrowUpRight,   color: '#34C759', bg: 'rgba(52,199,89,0.09)',   desc: 'Client payment / revenue' },
  { id: 'expense',  label: 'Expense',          icon: ArrowDownRight, color: '#FF3B30', bg: 'rgba(255,59,48,0.09)',  desc: 'Bills, tools, rent' },
  { id: 'drawing',  label: 'Partner Drawing',  icon: HandCoins,      color: '#FF9500', bg: 'rgba(255,149,0,0.09)',  desc: 'Partner takes from company' },
  { id: 'return',   label: 'Drawing Return',   icon: RotateCcw,      color: '#0071E3', bg: 'rgba(0,113,227,0.09)',  desc: 'Partner returns money' },
  { id: 'p_salary', label: 'Partner Salary',   icon: Banknote,       color: '#AF52DE', bg: 'rgba(175,82,222,0.09)', desc: 'Monthly partner payment' },
  { id: 'e_salary', label: 'Employee Salary',  icon: Users,          color: '#636366', bg: 'rgba(99,99,102,0.09)',  desc: 'Staff salary payment' },
];

const SUB_TYPE_META = {
  income:          { label: 'Income',         color: 'green'  },
  expense:         { label: 'Expense',         color: 'red'    },
  drawing:         { label: 'Drawing',         color: 'orange' },
  drawing_return:  { label: 'Return',          color: 'blue'   },
  partner_salary:  { label: 'Partner Salary',  color: 'purple' },
  employee_salary: { label: 'Emp. Salary',     color: 'gray'   },
};

const PARTNER_COLORS = {
  'Bhargav Thesiya':   { gradient: 'linear-gradient(135deg,#0071E3,#0A84FF)', text: '#0071E3' },
  'Manas Vadodaria':   { gradient: 'linear-gradient(135deg,#34C759,#30D158)', text: '#34C759' },
  'Kushal Mungalpara': { gradient: 'linear-gradient(135deg,#FF9500,#FFB340)', text: '#FF9500' },
  'Prince Padariya':   { gradient: 'linear-gradient(135deg,#AF52DE,#BF5AF2)', text: '#AF52DE' },
};

const DEFAULT_SALARY = { 'Bhargav Thesiya': 0, 'Manas Vadodaria': 0, 'Kushal Mungalpara': 0, 'Prince Padariya': 0 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = n => '₹' + Number(n).toLocaleString('en-IN');
const today = () => new Date().toISOString().split('T')[0];
const nowStr = () => new Date().toISOString().replace('T', ' ').slice(0, 16);

const currentMonthLabel = () =>
  new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });

function txDesc(t) {
  if (!t) return '—';
  if (t.subType === 'drawing')         return `${t.person || ''} Drawing`;
  if (t.subType === 'drawing_return')  return `${t.person || ''} Return`;
  if (t.subType === 'partner_salary')  return `${t.person || ''} · ${t.monthLabel || ''}`;
  if (t.subType === 'employee_salary') return `${t.person || ''} · ${t.monthLabel || ''}`;
  return t.remark || (t.type === 'Credit' ? t.source : t.category) || '—';
}

const initForm = (txType = 'income') => ({
  txType,
  accountType: 'Company Bank',
  amount: '',
  date: today(),
  paymentMethod: 'Bank Transfer',
  remark: '',
  source: 'Client Payment',
  clientName: '',
  category: 'Other',
  paidTo: '',
  person: PARTNERS[0],
  monthLabel: currentMonthLabel(),
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
        source: form.source, clientName: form.clientName };
    case 'expense':
      return { ...base, type: 'Debit', accountType: form.accountType, subType: 'expense',
        category: form.category, paidTo: form.paidTo };
    case 'drawing':
      return { ...base, type: 'Debit', accountType: 'Company Bank', subType: 'drawing',
        person: form.person, remark: form.remark || `Drawing — ${form.person}` };
    case 'return':
      return { ...base, type: 'Credit', accountType: 'Company Bank', subType: 'drawing_return',
        person: form.person, remark: form.remark || `Return — ${form.person}` };
    case 'p_salary':
      return { ...base, type: 'Debit', accountType: 'Company Bank', subType: 'partner_salary',
        person: form.person, monthLabel: form.monthLabel,
        remark: form.remark || `${form.person} Salary — ${form.monthLabel}` };
    case 'e_salary':
      return { ...base, type: 'Debit', accountType: 'Company Bank', subType: 'employee_salary',
        person: form.person, monthLabel: form.monthLabel,
        remark: form.remark || `${form.person} Salary — ${form.monthLabel}` };
    default:
      return { ...base, type: 'Credit', accountType: form.accountType, subType: form.txType };
  }
};

const rowToForm = (t) => {
  const txType =
    t.subType === 'income'          ? 'income'
    : t.subType === 'expense'       ? 'expense'
    : t.subType === 'drawing'       ? 'drawing'
    : t.subType === 'drawing_return'? 'return'
    : t.subType === 'partner_salary'? 'p_salary'
    : t.subType === 'employee_salary'? 'e_salary'
    : t.type === 'Credit'           ? 'income'
    : 'expense';
  return {
    txType,
    // Remap old "Founder's Personal" to new name for any legacy records
    accountType:  (t.accountType === "Founder's Personal" ? 'Cash + Savings Account' : t.accountType) || 'Company Bank',
    amount:       String(t.amount || ''),
    date:         (t.date || today()).slice(0, 10),
    paymentMethod: t.paymentMethod || 'Bank Transfer',
    remark:       t.remark       || '',
    source:       t.source       || 'Client Payment',
    clientName:   t.clientName   || '',
    category:     t.category     || 'Other',
    paidTo:       t.paidTo       || '',
    person:       t.person       || PARTNERS[0],
    monthLabel:   t.monthLabel   || currentMonthLabel(),
  };
};

// ─── Small shared components ──────────────────────────────────────────────────

const FF = ({ label, children, required }) => (
  <div>
    <label style={{ display:'block', fontSize:11.5, fontWeight:550, color:'#6E6E73', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.4px' }}>
      {label}{required && <span style={{ color:'#FF3B30', marginLeft:2 }}>*</span>}
    </label>
    {children}
  </div>
);

const TH = ({ c }) => (
  <th style={{ textAlign:'left', padding:'10px 16px', fontSize:11, fontWeight:600, color:'#8E8E93', textTransform:'uppercase', letterSpacing:'0.5px', whiteSpace:'nowrap', borderBottom:'1px solid rgba(0,0,0,0.07)' }}>{c}</th>
);
const TD = ({ children, s = {} }) => (
  <td style={{ padding:'11px 16px', verticalAlign:'middle', ...s }}>{children}</td>
);

// ─── TypeSelector ─────────────────────────────────────────────────────────────

function TypeSelector({ value, onChange }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:11.5, fontWeight:550, color:'#6E6E73', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.4px' }}>
        Transaction Type <span style={{ color:'#FF3B30' }}>*</span>
      </label>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
        {TX_TYPES.map(({ id, label, icon: Icon, color, bg, desc }) => {
          const active = value === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              style={{
                padding:'11px 10px', borderRadius:12, textAlign:'left', cursor:'pointer',
                border:`1.5px solid ${active ? color : 'rgba(0,0,0,0.08)'}`,
                background: active ? bg : 'rgba(0,0,0,0.015)',
                transition:'all 0.14s ease',
              }}
            >
              <div style={{ width:28, height:28, borderRadius:8, background: active ? color : 'rgba(0,0,0,0.07)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:6 }}>
                <Icon size={14} color={active ? '#fff' : '#6E6E73'}/>
              </div>
              <div style={{ fontSize:12, fontWeight:640, color: active ? color : '#1D1D1F', lineHeight:1.2 }}>{label}</div>
              <div style={{ fontSize:10, color:'#AEAEB2', marginTop:2, lineHeight:1.3 }}>{desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── PartnerPicker ────────────────────────────────────────────────────────────

function PartnerPicker({ value, onChange, metaMap = {} }) {
  return (
    <FF label="Partner" required>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
        {PARTNERS.map(p => {
          const col    = PARTNER_COLORS[p];
          const active = value === p;
          const meta   = metaMap[p];
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              style={{ padding:'9px 6px', borderRadius:10, textAlign:'center', cursor:'pointer', transition:'all 0.14s',
                border:`1.5px solid ${active ? col.text : 'rgba(0,0,0,0.08)'}`,
                background: active ? col.text + '18' : '#fff',
              }}
            >
              <div style={{ fontSize:12.5, fontWeight:640, color: active ? col.text : '#3C3C43' }}>{p}</div>
              {meta && <div style={{ fontSize:10, color: meta.color || '#AEAEB2', marginTop:2 }}>{meta.label}</div>}
            </button>
          );
        })}
      </div>
    </FF>
  );
}

// ─── TxFields — contextual fields per type ────────────────────────────────────

function TxFields({ form, onChange, partnerOutstanding, salaryConfig, employees }) {
  const s = (k, v) => onChange({ ...form, [k]: v });

  // Reused sub-blocks (as JSX values, not components, to avoid remount)
  const accountToggle = (
    <FF label="Account" required>
      <div className="tab-bar">
        {ACCOUNT_TYPES.map(t => (
          <button key={t} onClick={() => s('accountType', t)} className={`tab-item ${form.accountType === t ? 'active' : ''}`} style={{ flex:1, fontSize:11.5 }}>{t}</button>
        ))}
      </div>
    </FF>
  );

  const amountDate = (dateLabel = 'Date') => (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
      <FF label="Amount (₹)" required>
        <input className="mac-input" type="number" value={form.amount} onChange={e => s('amount', e.target.value)} placeholder="0"/>
      </FF>
      <FF label={dateLabel} required>
        <input className="mac-input" type="date" value={form.date} onChange={e => s('date', e.target.value)}/>
      </FF>
    </div>
  );

  // ── Income ──────────────────────────────────────────────
  if (form.txType === 'income') return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {accountToggle}
      {amountDate()}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <FF label="Source">
          <select className="mac-select" value={form.source} onChange={e => s('source', e.target.value)}>
            {TRANSACTION_SOURCES.map(x => <option key={x}>{x}</option>)}
          </select>
        </FF>
        <FF label="Payment Method">
          <select className="mac-select" value={form.paymentMethod} onChange={e => s('paymentMethod', e.target.value)}>
            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </FF>
      </div>
      <FF label="Client Name">
        <input className="mac-input" value={form.clientName} onChange={e => s('clientName', e.target.value)} placeholder="Optional"/>
      </FF>
      <FF label="Remark">
        <input className="mac-input" value={form.remark} onChange={e => s('remark', e.target.value)} placeholder="Optional note"/>
      </FF>
    </div>
  );

  // ── Expense ──────────────────────────────────────────────
  if (form.txType === 'expense') return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {accountToggle}
      {amountDate()}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <FF label="Category">
          <select className="mac-select" value={form.category} onChange={e => s('category', e.target.value)}>
            {EXPENSE_CATEGORIES.map(x => <option key={x}>{x}</option>)}
          </select>
        </FF>
        <FF label="Payment Method">
          <select className="mac-select" value={form.paymentMethod} onChange={e => s('paymentMethod', e.target.value)}>
            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </FF>
      </div>
      <FF label="Paid To">
        <input className="mac-input" value={form.paidTo} onChange={e => s('paidTo', e.target.value)} placeholder="Person / Vendor"/>
      </FF>
      <FF label="Remark">
        <input className="mac-input" value={form.remark} onChange={e => s('remark', e.target.value)} placeholder="Optional note"/>
      </FF>
    </div>
  );

  // ── Partner Drawing ──────────────────────────────────────
  if (form.txType === 'drawing') {
    const outstanding = partnerOutstanding[form.person] || 0;
    const meta = Object.fromEntries(PARTNERS.map(p => {
      const out = partnerOutstanding[p] || 0;
      return [p, out > 0 ? { label: fmt(out) + ' due', color: '#FF9500' } : { label: 'Clear ✓', color: '#34C759' }];
    }));
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <PartnerPicker value={form.person} onChange={v => s('person', v)} metaMap={meta}/>
        {outstanding > 0 && (
          <div style={{ padding:'8px 12px', borderRadius:10, background:'rgba(255,149,0,0.06)', border:'1px solid rgba(255,149,0,0.15)', fontSize:12, color:'#FF9500' }}>
            ⚠ {form.person} already has <strong>{fmt(outstanding)}</strong> outstanding
          </div>
        )}
        {amountDate()}
        <FF label="Purpose / Notes">
          <input className="mac-input" value={form.remark} onChange={e => s('remark', e.target.value)} placeholder="e.g. Travel, Emergency, Personal"/>
        </FF>
      </div>
    );
  }

  // ── Drawing Return ───────────────────────────────────────
  if (form.txType === 'return') {
    const outstanding = partnerOutstanding[form.person] || 0;
    const meta = Object.fromEntries(PARTNERS.map(p => {
      const out = partnerOutstanding[p] || 0;
      return [p, out > 0 ? { label: fmt(out) + ' due', color: '#FF3B30' } : { label: 'Settled ✓', color: '#34C759' }];
    }));
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <PartnerPicker value={form.person} onChange={v => s('person', v)} metaMap={meta}/>
        {outstanding > 0 ? (
          <div style={{ padding:'8px 12px', borderRadius:10, background:'rgba(255,59,48,0.06)', border:'1px solid rgba(255,59,48,0.12)', fontSize:12, color:'#FF3B30' }}>
            {form.person} has <strong>{fmt(outstanding)}</strong> outstanding to return
          </div>
        ) : (
          <div style={{ padding:'8px 12px', borderRadius:10, background:'rgba(52,199,89,0.06)', border:'1px solid rgba(52,199,89,0.12)', fontSize:12, color:'#34C759' }}>
            ✓ {form.person} has no outstanding drawings
          </div>
        )}
        {amountDate()}
        <FF label="Notes">
          <input className="mac-input" value={form.remark} onChange={e => s('remark', e.target.value)} placeholder="Optional"/>
        </FF>
      </div>
    );
  }

  // ── Partner Salary ───────────────────────────────────────
  if (form.txType === 'p_salary') {
    const suggested = salaryConfig[form.person] || 0;
    const meta = Object.fromEntries(PARTNERS.map(p => [
      p, { label: salaryConfig[p] > 0 ? fmt(salaryConfig[p]) + '/mo' : 'Not set', color: '#8E8E93' },
    ]));
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <PartnerPicker
          value={form.person}
          onChange={p => onChange({ ...form, person: p, amount: salaryConfig[p] ? String(salaryConfig[p]) : form.amount })}
          metaMap={meta}
        />
        <FF label="Month" required>
          <input className="mac-input" value={form.monthLabel} onChange={e => s('monthLabel', e.target.value)} placeholder={currentMonthLabel()}/>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <FF label="Amount (₹)" required>
            <input className="mac-input" type="number" value={form.amount} onChange={e => s('amount', e.target.value)} placeholder={suggested ? String(suggested) : '0'}/>
          </FF>
          <FF label="Date Paid" required>
            <input className="mac-input" type="date" value={form.date} onChange={e => s('date', e.target.value)}/>
          </FF>
        </div>
        <FF label="Payment Method">
          <select className="mac-select" value={form.paymentMethod} onChange={e => s('paymentMethod', e.target.value)}>
            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </FF>
        <FF label="Notes">
          <input className="mac-input" value={form.remark} onChange={e => s('remark', e.target.value)} placeholder="Optional"/>
        </FF>
      </div>
    );
  }

  // ── Employee Salary — redirect to Employees page ────────────────────────────
  if (form.txType === 'e_salary') {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{
          padding:'20px 18px', borderRadius:14,
          background:'linear-gradient(135deg,rgba(99,99,102,0.07),rgba(99,99,102,0.04))',
          border:'1.5px solid rgba(99,99,102,0.15)',
          display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:12,
        }}>
          <div style={{ width:48, height:48, borderRadius:14, background:'rgba(99,99,102,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Users size={22} color="#636366"/>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:660, color:'#1D1D1F', marginBottom:4 }}>Employee Salary Payments</div>
            <div style={{ fontSize:12.5, color:'#6E6E73', lineHeight:1.6, maxWidth:340 }}>
              Salary payments are managed directly from the <strong>Employees</strong> page.
              When you pay a salary there, it is <strong>automatically recorded</strong> as a transaction here.
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6, width:'100%', marginTop:4 }}>
            <div style={{ padding:'9px 12px', borderRadius:10, background:'rgba(52,199,89,0.07)', border:'1px solid rgba(52,199,89,0.15)', fontSize:12, color:'#34C759', display:'flex', alignItems:'center', gap:8 }}>
              <CheckCircle2 size={13}/>
              Salary budget tracking per employee
            </div>
            <div style={{ padding:'9px 12px', borderRadius:10, background:'rgba(52,199,89,0.07)', border:'1px solid rgba(52,199,89,0.15)', fontSize:12, color:'#34C759', display:'flex', alignItems:'center', gap:8 }}>
              <CheckCircle2 size={13}/>
              Overpayment prevention with remaining balance check
            </div>
            <div style={{ padding:'9px 12px', borderRadius:10, background:'rgba(52,199,89,0.07)', border:'1px solid rgba(52,199,89,0.15)', fontSize:12, color:'#34C759', display:'flex', alignItems:'center', gap:8 }}>
              <CheckCircle2 size={13}/>
              Auto-creates expense transaction on save
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ─── PartnerOverview ──────────────────────────────────────────────────────────

function PartnerOverview({ txs, salaryConfig, onSetSalaries }) {
  const [open, setOpen] = useState(true);

  const curMonth = currentMonthLabel();

  const overview = useMemo(() => PARTNERS.map(p => {
    const taken    = txs.filter(t => t.subType === 'drawing'        && t.person === p).reduce((s, t) => s + (+t.amount || 0), 0);
    const returned = txs.filter(t => t.subType === 'drawing_return' && t.person === p).reduce((s, t) => s + (+t.amount || 0), 0);
    const outstanding = Math.max(0, taken - returned);
    const salaryPaid  = txs.some(t => t.subType === 'partner_salary' && t.person === p && t.monthLabel === curMonth);
    const monthly     = salaryConfig[p] || 0;
    return { partner: p, outstanding, salaryPaid, monthly };
  }), [txs, salaryConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalOutstanding = overview.reduce((s, p) => s + p.outstanding, 0);
  const pendingSalaries  = overview.filter(p => p.monthly > 0 && !p.salaryPaid).map(p => p.partner);
  const curMonthShort    = curMonth.split(' ')[0];

  return (
    <div style={{ background:'#fff', borderRadius:16, border:'1px solid rgba(0,0,0,0.07)', overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
      {/* Header row */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 18px', cursor:'pointer', borderBottom: open ? '1px solid rgba(0,0,0,0.07)' : 'none', userSelect:'none' }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:13, fontWeight:640, color:'#1D1D1F' }}>Partner Overview</span>
          {totalOutstanding > 0 && (
            <span style={{ fontSize:11, fontWeight:500, color:'#FF3B30', background:'rgba(255,59,48,0.08)', padding:'2px 9px', borderRadius:20 }}>
              {fmt(totalOutstanding)} drawing due
            </span>
          )}
          {pendingSalaries.length > 0 && (
            <span style={{ fontSize:11, fontWeight:500, color:'#FF9500', background:'rgba(255,149,0,0.08)', padding:'2px 9px', borderRadius:20 }}>
              {pendingSalaries.length} salary pending
            </span>
          )}
          {totalOutstanding === 0 && pendingSalaries.length === 0 && (
            <span style={{ fontSize:11, fontWeight:500, color:'#34C759', background:'rgba(52,199,89,0.08)', padding:'2px 9px', borderRadius:20 }}>
              All clear ✓
            </span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button
            onClick={e => { e.stopPropagation(); onSetSalaries(); }}
            style={{ padding:'4px 10px', borderRadius:8, background:'rgba(0,0,0,0.05)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontSize:12, color:'#6E6E73', fontWeight:500 }}
          >
            <Settings2 size={11}/> Set Salaries
          </button>
          {open ? <ChevronUp size={14} color="#AEAEB2"/> : <ChevronDown size={14} color="#AEAEB2"/>}
        </div>
      </div>

      {/* Partner cards row */}
      {open && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', overflowX:'auto' }}>
          {overview.map(({ partner, outstanding, salaryPaid, monthly }, i) => {
            const col = PARTNER_COLORS[partner];
            return (
              <div key={partner} style={{ padding:'14px 18px', borderRight: i < 3 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                {/* Avatar + name */}
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <div style={{ width:32, height:32, borderRadius:9, background:col.gradient, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:700, flexShrink:0 }}>
                    {partner.slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:'#1D1D1F' }}>{partner}</span>
                </div>

                {/* Drawing row */}
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:10, color:'#AEAEB2', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:2 }}>Drawing</div>
                  <div style={{ fontSize:13, fontWeight:650, color: outstanding > 0 ? '#FF3B30' : '#34C759' }}>
                    {outstanding > 0 ? fmt(outstanding) + ' due' : 'Settled ✓'}
                  </div>
                </div>

                {/* Salary row */}
                <div>
                  <div style={{ fontSize:10, color:'#AEAEB2', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:2 }}>
                    Salary · {curMonthShort}
                  </div>
                  {monthly > 0 ? (
                    salaryPaid
                      ? <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <CheckCircle2 size={12} color="#34C759"/>
                          <span style={{ fontSize:12, color:'#34C759', fontWeight:500 }}>Paid {fmt(monthly)}</span>
                        </div>
                      : <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <Clock size={12} color="#FF9500"/>
                          <span style={{ fontSize:12, color:'#FF9500', fontWeight:500 }}>Pending {fmt(monthly)}</span>
                        </div>
                  ) : (
                    <span style={{ fontSize:12, color:'#AEAEB2' }}>Not configured</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Transactions() {
  const navigate = useNavigate();
  const [txs, setTxs]               = useState([]);
  const [openBal, setOpenBal]       = useState({ cash: 0, bank: 0 });
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters]       = useState({ type: '', accountType: '', subType: '' });
  const [showAdd, setShowAdd]       = useState(false);
  const [editTx, setEditTx]         = useState(null);
  const [form, setForm]             = useState(initForm());
  const [deleteId, setDeleteId]     = useState(null);
  const [showOB, setShowOB]         = useState(false);
  const [obForm, setObForm]         = useState({ cash: 0, bank: 0 });
  const [auditLog, setAuditLog]     = useState([]);
  const [showAudit, setShowAudit]   = useState(false);
  const [tab, setTab]               = useState('all');
  const [salaryConfig, setSalaryConfig]       = useState(DEFAULT_SALARY);
  const [salConfigForm, setSalConfigForm]     = useState(DEFAULT_SALARY);
  const [showSalConfig, setShowSalConfig]     = useState(false);
  const [employees, setEmployees]   = useState([]);

  // ── Data fetching ──────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [txData, obData, salConf, empData] = await Promise.all([
        transactionsDB.getAll(),
        settingsDB.get('opening_balances'),
        settingsDB.get('partner_salary_config'),
        employeesDB.getAll(),
      ]);
      setTxs(txData);
      if (obData) { setOpenBal(obData); setObForm(obData); }
      if (salConf) { setSalaryConfig(salConf); setSalConfigForm(salConf); }
      setEmployees(empData.filter(e => e.status === 'Active'));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Balances ───────────────────────────────────────────────
  const bal = useMemo(() => {
    let pC=0, pD=0, bC=0, bD=0;
    txs.forEach(t => {
      if (t.accountType === "Founder's Personal") {
        t.type === 'Credit' ? pC += +t.amount : pD += +t.amount;
      } else {
        t.type === 'Credit' ? bC += +t.amount : bD += +t.amount;
      }
    });
    const personal = openBal.cash + pC - pD;
    const bank     = openBal.bank + bC - bD;
    return { personal, bank, total: personal + bank, totalCredit: pC + bC, totalDebit: pD + bD };
  }, [txs, openBal]);

  // ── Partner outstanding (computed from transactions) ───────
  const partnerOutstanding = useMemo(() => {
    const out = {};
    PARTNERS.forEach(p => {
      const taken    = txs.filter(t => t.subType === 'drawing'        && t.person === p).reduce((s, t) => s + (+t.amount || 0), 0);
      const returned = txs.filter(t => t.subType === 'drawing_return' && t.person === p).reduce((s, t) => s + (+t.amount || 0), 0);
      out[p] = Math.max(0, taken - returned);
    });
    return out;
  }, [txs]);

  // ── Filtered list ──────────────────────────────────────────
  const filtered = useMemo(() => {
    const base = tab === 'credit' ? txs.filter(t => t.type === 'Credit')
               : tab === 'debit'  ? txs.filter(t => t.type === 'Debit')
               : txs;
    return base.filter(t => {
      const q = search.toLowerCase();
      const matchQ = !q
        || txDesc(t).toLowerCase().includes(q)
        || (t.remark       || '').toLowerCase().includes(q)
        || (t.clientName   || '').toLowerCase().includes(q)
        || (t.paidTo       || '').toLowerCase().includes(q)
        || (t.person       || '').toLowerCase().includes(q)
        || (t.monthLabel   || '').toLowerCase().includes(q);
      const matchType    = !filters.type       || t.type       === filters.type;
      const matchAccount = !filters.accountType|| t.accountType === filters.accountType;
      const matchSub     = !filters.subType    || t.subType    === filters.subType;
      return matchQ && matchType && matchAccount && matchSub;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [txs, search, filters, tab]);

  // ── CRUD ───────────────────────────────────────────────────
  async function save() {
    if (!form.amount || saving) return;
    setSaving(true);
    const row = formToRow(form);
    try {
      if (editTx) {
        setAuditLog(l => [{ id: Date.now(), action:'Edited', prev:editTx, next:row, by:'You', date:nowStr() }, ...l]);
        const updated = await transactionsDB.update(editTx.id, row);
        setTxs(ts => ts.map(t => t.id === editTx.id ? updated : t));
      } else {
        const created = await transactionsDB.create(row);
        setTxs(ts => [created, ...ts]);
      }
    } catch (e) { console.error(e); }
    setSaving(false);
    setShowAdd(false); setEditTx(null); setForm(initForm());
  }

  async function del(id) {
    const tx = txs.find(t => t.id === id);
    if (tx) setAuditLog(l => [{ id: Date.now(), action:'Deleted', prev:tx, next:null, by:'You', date:nowStr() }, ...l]);
    setTxs(ts => ts.filter(t => t.id !== id));
    try { await transactionsDB.delete(id); } catch (e) { console.error(e); await fetchAll(); }
  }

  async function saveOB() {
    setOpenBal(obForm); setShowOB(false);
    try { await settingsDB.set('opening_balances', obForm); } catch (e) { console.error(e); }
  }

  async function saveSalaryConfig() {
    setSalaryConfig(salConfigForm); setShowSalConfig(false);
    try { await settingsDB.set('partner_salary_config', salConfigForm); } catch (e) { console.error(e); }
  }

  // ── Stat cards ─────────────────────────────────────────────
  const statCards = [
    { label:'Total Balance',      value:fmt(bal.total),       gradient:'linear-gradient(135deg,#0071E3,#0A84FF)', icon:IndianRupee   },
    { label:'Total Credit',       value:fmt(bal.totalCredit), gradient:'linear-gradient(135deg,#34C759,#30D158)', icon:ArrowUpRight  },
    { label:'Total Debit',        value:fmt(bal.totalDebit),  gradient:'linear-gradient(135deg,#FF3B30,#FF6961)', icon:ArrowDownRight },
    { label:"Cash + Savings", value:fmt(bal.personal),    gradient:'linear-gradient(135deg,#FF9500,#FFB340)', icon:Wallet        },
  ];

  // ── Render ─────────────────────────────────────────────────
  return (
    <div>
      <Header
        title="Transactions"
        subtitle={`Balance: ${fmt(bal.total)} · Personal: ${fmt(bal.personal)} · Bank: ${fmt(bal.bank)}`}
        actions={
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { setObForm(openBal); setShowOB(true); }} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>
              <Wallet size={13}/> Opening Bal.
            </button>
            <button onClick={() => { setForm(initForm()); setEditTx(null); setShowAdd(true); }} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>
              <Plus size={14}/> Add Transaction
            </button>
          </div>
        }
      />

      {loading ? <PageLoader /> : (
        <div className="page-body">

          {/* Low balance alert */}
          {bal.total < 10000 && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderRadius:10, background:'rgba(255,59,48,0.07)', border:'1px solid rgba(255,59,48,0.13)' }}>
              <AlertTriangle size={13} color="#FF3B30"/>
              <span style={{ fontSize:12.5, color:'#FF3B30', fontWeight:500 }}>⚠ Low balance — only {fmt(bal.total)} remaining</span>
            </div>
          )}

          {/* Stat cards */}
          <div className="rg-4">
            {statCards.map(c => (
              <div key={c.label} style={{ borderRadius:16, padding:'18px 20px', background:c.gradient, display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ width:34, height:34, borderRadius:10, background:'rgba(255,255,255,0.22)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <c.icon size={16} color="#fff"/>
                </div>
                <div>
                  <div style={{ fontSize:22, fontWeight:700, color:'#fff', letterSpacing:'-0.6px', lineHeight:1.1 }}>{c.value}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.8)', marginTop:2 }}>{c.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Partner Overview */}
          <PartnerOverview
            txs={txs}
            salaryConfig={salaryConfig}
            onSetSalaries={() => { setSalConfigForm(salaryConfig); setShowSalConfig(true); }}
          />

          {/* Tab bar + search + actions */}
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <div className="tab-bar">
              {[['all','All'],['credit','Credit'],['debit','Debit']].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`tab-item ${tab === k ? 'active' : ''}`}>{l}</button>
              ))}
            </div>
            <div style={{ flex:1, maxWidth:260 }}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search transactions…"/>
            </div>
            <button onClick={() => setShowFilters(f => !f)} className={`mac-btn ${showFilters ? 'mac-btn-primary' : 'mac-btn-secondary'}`} style={{ fontSize:13 }}>
              <Filter size={13}/> Filter
            </button>
            <button onClick={() => setShowAudit(true)} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>
              <History size={13}/> Audit
            </button>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="mac-card" style={{ padding:'14px 16px', display:'flex', gap:14, flexWrap:'wrap' }}>
              {[
                ['Type',     'type',        ['Credit','Debit']],
                ['Account',  'accountType', ACCOUNT_TYPES],
              ].map(([lbl, key, opts]) => (
                <div key={key} style={{ flex:1, minWidth:120 }}>
                  <label style={{ display:'block', fontSize:10.5, fontWeight:600, color:'#8E8E93', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:5 }}>{lbl}</label>
                  <select className="mac-select" style={{ fontSize:13 }} value={filters[key]} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))}>
                    <option value="">All</option>
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ flex:1, minWidth:150 }}>
                <label style={{ display:'block', fontSize:10.5, fontWeight:600, color:'#8E8E93', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:5 }}>Category</label>
                <select className="mac-select" style={{ fontSize:13 }} value={filters.subType} onChange={e => setFilters(f => ({ ...f, subType: e.target.value }))}>
                  <option value="">All</option>
                  {Object.entries(SUB_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Transactions table */}
          <div className="mac-card" style={{ overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead style={{ background:'rgba(0,0,0,0.018)' }}>
                  <tr>{['','Date','Description','Category','Account','Amount',''].map((h,i) => <TH key={i} c={h}/>)}</tr>
                </thead>
                <tbody>
                  {filtered.length === 0
                    ? <tr><td colSpan={7} style={{ textAlign:'center', padding:'48px 16px', color:'#AEAEB2', fontSize:13 }}>No transactions found</td></tr>
                    : filtered.map(t => {
                      const meta = SUB_TYPE_META[t.subType] || (t.type === 'Credit' ? SUB_TYPE_META.income : SUB_TYPE_META.expense);
                      return (
                        <tr key={t.id} className="table-row">
                          <TD>
                            <div style={{ width:30, height:30, borderRadius:'50%', background: t.type==='Credit'?'rgba(52,199,89,0.1)':'rgba(255,59,48,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              {t.type==='Credit' ? <ArrowUpRight size={13} color="#34C759"/> : <ArrowDownRight size={13} color="#FF3B30"/>}
                            </div>
                          </TD>
                          <TD><span style={{ fontSize:12, color:'#6E6E73', whiteSpace:'nowrap' }}>{(t.date || '').slice(0, 10)}</span></TD>
                          <TD>
                            <div style={{ fontSize:13, fontWeight:500, color:'#1D1D1F' }}>{txDesc(t)}</div>
                            {t.paymentMethod && <div style={{ fontSize:11, color:'#AEAEB2', marginTop:1 }}>{t.paymentMethod}</div>}
                          </TD>
                          <TD><Badge color={meta.color}>{meta.label}</Badge></TD>
                          <TD><Badge color={t.accountType==="Founder's Personal"?'orange':'blue'}>{t.accountType}</Badge></TD>
                          <TD>
                            <span style={{ fontSize:13, fontWeight:650, color: t.type==='Credit'?'#34C759':'#FF3B30', letterSpacing:'-0.2px' }}>
                              {t.type==='Credit'?'+':'-'}{fmt(t.amount)}
                            </span>
                          </TD>
                          <TD>
                            <div style={{ display:'flex', gap:4 }}>
                              <button onClick={() => { setEditTx(t); setForm(rowToForm(t)); setShowAdd(true); }} style={{ width:28, height:28, borderRadius:8, background:'rgba(0,0,0,0.06)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <Edit2 size={13} color="#6E6E73"/>
                              </button>
                              <button onClick={() => setDeleteId(t.id)} style={{ width:28, height:28, borderRadius:8, background:'rgba(255,59,48,0.08)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <Trash2 size={13} color="#FF3B30"/>
                              </button>
                            </div>
                          </TD>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Transaction Modal ─────────────────────── */}
      <Modal
        isOpen={showAdd}
        onClose={() => { setShowAdd(false); setEditTx(null); setForm(initForm()); }}
        title={editTx ? 'Edit Transaction' : 'New Transaction'}
        size="md"
      >
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Type selector — only shown when adding new */}
          {!editTx && (
            <TypeSelector
              value={form.txType}
              onChange={type => setForm(f => ({
                ...initForm(type),
                date: f.date,
                person: type === 'e_salary' && employees.length > 0 ? employees[0].name : PARTNERS[0],
              }))}
            />
          )}

          {/* When editing, show a type badge */}
          {editTx && (() => {
            const meta = TX_TYPES.find(t => t.id === form.txType);
            return meta ? (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, background: meta.bg }}>
                <div style={{ width:22, height:22, borderRadius:6, background:meta.color, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <meta.icon size={11} color="#fff"/>
                </div>
                <span style={{ fontSize:12.5, fontWeight:600, color:meta.color }}>{meta.label}</span>
              </div>
            ) : null;
          })()}

          <div style={{ height:1, background:'rgba(0,0,0,0.07)' }}/>

          <TxFields
            form={form}
            onChange={setForm}
            partnerOutstanding={partnerOutstanding}
            salaryConfig={salaryConfig}
            employees={employees}
          />
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20, paddingTop:16, borderTop:'1px solid rgba(0,0,0,0.07)' }}>
          <button onClick={() => { setShowAdd(false); setEditTx(null); }} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>Cancel</button>
          {form.txType === 'e_salary' ? (
            <button
              onClick={() => { setShowAdd(false); navigate('/employees'); }}
              className="mac-btn mac-btn-primary"
              style={{ fontSize:13, display:'flex', alignItems:'center', gap:6 }}
            >
              <ExternalLink size={13}/> Go to Employees
            </button>
          ) : (
            <button onClick={save} disabled={saving} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>
              {saving ? 'Saving…' : editTx ? 'Save Changes' : 'Add Transaction'}
            </button>
          )}
        </div>
      </Modal>

      {/* ── Opening Balance Modal ────────────────────────────── */}
      <Modal isOpen={showOB} onClose={() => setShowOB(false)} title="Set Opening Balance" size="sm">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <FF label="Founder's Personal (₹)" required>
            <input className="mac-input" type="number" value={obForm.cash} onChange={e => setObForm(b => ({ ...b, cash: +e.target.value }))}/>
          </FF>
          <FF label="Company Bank (₹)" required>
            <input className="mac-input" type="number" value={obForm.bank} onChange={e => setObForm(b => ({ ...b, bank: +e.target.value }))}/>
          </FF>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20, paddingTop:16, borderTop:'1px solid rgba(0,0,0,0.07)' }}>
          <button onClick={() => setShowOB(false)} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>Cancel</button>
          <button onClick={saveOB} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>Save</button>
        </div>
      </Modal>

      {/* ── Set Partner Salaries Modal ───────────────────────── */}
      <Modal isOpen={showSalConfig} onClose={() => setShowSalConfig(false)} title="Set Partner Monthly Salaries" size="sm">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {PARTNERS.map(p => {
            const col = PARTNER_COLORS[p];
            return (
              <div key={p} style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:32, height:32, borderRadius:9, background:col.gradient, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:700, flexShrink:0 }}>
                  {p.slice(0, 2).toUpperCase()}
                </div>
                <FF label={p} required>
                  <input className="mac-input" type="number" value={salConfigForm[p] || ''} onChange={e => setSalConfigForm(c => ({ ...c, [p]: +e.target.value }))} placeholder="Monthly salary ₹"/>
                </FF>
              </div>
            );
          })}
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20, paddingTop:16, borderTop:'1px solid rgba(0,0,0,0.07)' }}>
          <button onClick={() => setShowSalConfig(false)} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>Cancel</button>
          <button onClick={saveSalaryConfig} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>Save</button>
        </div>
      </Modal>

      {/* ── Audit Log Modal ──────────────────────────────────── */}
      <Modal isOpen={showAudit} onClose={() => setShowAudit(false)} title="Audit Log" size="lg">
        {auditLog.length === 0
          ? <p style={{ textAlign:'center', color:'#AEAEB2', padding:'32px 0', fontSize:13 }}>No audit entries yet</p>
          : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {auditLog.map(e => (
              <div key={e.id} style={{ padding:'10px 12px', borderRadius:10, background:'rgba(0,0,0,0.025)', border:'1px solid rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <Badge color={e.action === 'Deleted' ? 'red' : 'blue'}>{e.action}</Badge>
                  <span style={{ fontSize:11, color:'#AEAEB2' }}>{e.date} · {e.by}</span>
                </div>
                {e.prev && <div style={{ fontSize:11, color:'#6E6E73' }}>Before: {fmt(e.prev.amount)} · {e.prev.type}</div>}
                {e.next && <div style={{ fontSize:11, color:'#1D1D1F', marginTop:2 }}>After: {fmt(e.next.amount)} · {e.next.type}</div>}
              </div>
            ))}
          </div>
        }
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => del(deleteId)}
        title="Delete Transaction"
        message="This will permanently delete this transaction."
      />
    </div>
  );
}
