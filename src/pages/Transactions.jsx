import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import SearchBar from '../components/ui/SearchBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { transactionsDB, settingsDB, drawingsDB, partnerSalariesDB } from '../lib/db';
import { TRANSACTION_SOURCES, EXPENSE_CATEGORIES, PAYMENT_METHODS, PARTNERS } from '../data/mockData';
import {
  Plus, Filter, ArrowUpRight, ArrowDownRight, Edit2, Trash2,
  Wallet, History, AlertTriangle, DollarSign, HandCoins, RotateCcw,
  Banknote, Settings2, CheckCircle2, Clock,
} from 'lucide-react';

const ACCOUNT_TYPES = ["Founder's Personal", 'Company Bank'];

const fmt = n => '₹' + Number(n).toLocaleString('en-IN');
const nowStr = () => new Date().toISOString().replace('T', ' ').slice(0, 16);
const today = new Date().toISOString().split('T')[0];

const emptyTx = {
  type: 'Credit', accountType: 'Company Bank', amount: '', date: nowStr(),
  source: 'Client Payment', category: 'Misc', clientName: '', paidTo: '',
  paymentMethod: 'Bank Transfer', remark: '',
};
const emptyDrawing   = { partner: 'Bhargav', amountTaken: '', dateTaken: today, purpose: '', notes: '' };
const emptyReturn    = { amount: '', date: today, notes: '' };
const DEFAULT_SALARY = { Bhargav: 0, Prince: 0, Manas: 0, Kushal: 0 };
const emptySalPay    = { partner: 'Bhargav', month: '', amount: '', paidDate: today, paymentMethod: 'Bank Transfer', notes: '' };

const currentMonthLabel = () => {
  const d = new Date();
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
};

const PARTNER_COLORS = {
  Bhargav: { gradient: 'linear-gradient(135deg,#0071E3,#0A84FF)', text: '#0071E3' },
  Prince:  { gradient: 'linear-gradient(135deg,#AF52DE,#BF5AF2)', text: '#AF52DE' },
  Manas:   { gradient: 'linear-gradient(135deg,#34C759,#30D158)', text: '#34C759' },
  Kushal:  { gradient: 'linear-gradient(135deg,#FF9500,#FFB340)', text: '#FF9500' },
};

const getOutstanding   = d => Math.max(0, +d.amountTaken - (d.returns||[]).reduce((s,r)=>s+(+r.amount||0),0));
const getTotalReturned = d => (d.returns||[]).reduce((s,r)=>s+(+r.amount||0),0);
const getDrawingStatus = d => {
  const out = getOutstanding(d);
  if (out <= 0) return 'Settled';
  if (getTotalReturned(d) > 0) return 'Partial';
  return 'Outstanding';
};
const STATUS_COLOR = { Outstanding: 'red', Partial: 'orange', Settled: 'green' };

const FF = ({ label, children, required }) => (
  <div>
    <label style={{ display:'block', fontSize:11.5, fontWeight:550, color:'#6E6E73', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.4px' }}>
      {label}{required && <span style={{ color:'#FF3B30', marginLeft:2 }}>*</span>}
    </label>
    {children}
  </div>
);

function TxForm({ v, onChange }) {
  const s = (k, val) => onChange({ ...v, [k]: val });
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <FF label="Type" required>
          <div className="tab-bar">
            {['Credit','Debit'].map(t => (
              <button key={t} onClick={()=>s('type',t)} className={`tab-item ${v.type===t?'active':''}`} style={{ flex:1 }}>{t}</button>
            ))}
          </div>
        </FF>
        <FF label="Account" required>
          <div className="tab-bar">
            {ACCOUNT_TYPES.map(t => (
              <button key={t} onClick={()=>s('accountType',t)} className={`tab-item ${v.accountType===t?'active':''}`} style={{ flex:1, fontSize:11.5 }}>{t}</button>
            ))}
          </div>
        </FF>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <FF label="Amount (₹)" required><input className="mac-input" type="number" value={v.amount} onChange={e=>s('amount',e.target.value)} placeholder="0"/></FF>
        <FF label="Date & Time" required><input className="mac-input" type="datetime-local" value={v.date} onChange={e=>s('date',e.target.value)}/></FF>
      </div>
      {v.type==='Credit'
        ? <FF label="Source"><select className="mac-select" value={v.source} onChange={e=>s('source',e.target.value)}>{TRANSACTION_SOURCES.map(x=><option key={x}>{x}</option>)}</select></FF>
        : <FF label="Category"><select className="mac-select" value={v.category} onChange={e=>s('category',e.target.value)}>{EXPENSE_CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></FF>
      }
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <FF label="Client Name"><input className="mac-input" value={v.clientName} onChange={e=>s('clientName',e.target.value)} placeholder="Optional"/></FF>
        <FF label="Paid To"><input className="mac-input" value={v.paidTo} onChange={e=>s('paidTo',e.target.value)} placeholder="Person / Vendor"/></FF>
      </div>
      <FF label="Payment Method"><select className="mac-select" value={v.paymentMethod} onChange={e=>s('paymentMethod',e.target.value)}>{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></FF>
      <FF label="Remark"><input className="mac-input" value={v.remark} onChange={e=>s('remark',e.target.value)} placeholder="Optional note"/></FF>
    </div>
  );
}

function DrawingForm({ v, onChange }) {
  const s = (k, val) => onChange({ ...v, [k]: val });
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <FF label="Partner" required>
        <select className="mac-select" value={v.partner} onChange={e=>s('partner',e.target.value)}>
          {PARTNERS.map(p => <option key={p}>{p}</option>)}
        </select>
      </FF>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <FF label="Amount Taken (₹)" required>
          <input className="mac-input" type="number" value={v.amountTaken} onChange={e=>s('amountTaken',e.target.value)} placeholder="0"/>
        </FF>
        <FF label="Date" required>
          <input className="mac-input" type="date" value={v.dateTaken} onChange={e=>s('dateTaken',e.target.value)}/>
        </FF>
      </div>
      <FF label="Purpose">
        <input className="mac-input" value={v.purpose} onChange={e=>s('purpose',e.target.value)} placeholder="e.g. Travel, Emergency, Personal need"/>
      </FF>
      <FF label="Notes">
        <input className="mac-input" value={v.notes} onChange={e=>s('notes',e.target.value)} placeholder="Optional"/>
      </FF>
    </div>
  );
}

function ReturnForm({ v, onChange, drawing }) {
  const s = (k, val) => onChange({ ...v, [k]: val });
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {drawing && (
        <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 14px', borderRadius:11, background:'rgba(255,59,48,0.06)', border:'1px solid rgba(255,59,48,0.12)' }}>
          <span style={{ fontSize:12.5, color:'#FF3B30', fontWeight:550 }}>{drawing.partner} — outstanding</span>
          <span style={{ fontSize:13, fontWeight:700, color:'#FF3B30' }}>{fmt(getOutstanding(drawing))}</span>
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <FF label="Amount Returned (₹)" required>
          <input className="mac-input" type="number" value={v.amount} onChange={e=>s('amount',e.target.value)} placeholder="0"/>
        </FF>
        <FF label="Date" required>
          <input className="mac-input" type="date" value={v.date} onChange={e=>s('date',e.target.value)}/>
        </FF>
      </div>
      <FF label="Notes">
        <input className="mac-input" value={v.notes} onChange={e=>s('notes',e.target.value)} placeholder="Optional"/>
      </FF>
    </div>
  );
}

function SalaryPayForm({ v, onChange, salaryConfig }) {
  const s = (k, val) => onChange({ ...v, [k]: val });
  const suggested = salaryConfig[v.partner] || 0;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <FF label="Partner" required>
        <select className="mac-select" value={v.partner} onChange={e => { s('partner', e.target.value); onChange({ ...v, partner: e.target.value, amount: String(salaryConfig[e.target.value] || '') }); }}>
          {PARTNERS.map(p => <option key={p}>{p}</option>)}
        </select>
      </FF>
      <FF label="Month" required>
        <input className="mac-input" value={v.month} onChange={e=>s('month',e.target.value)} placeholder="e.g. April 2025"/>
      </FF>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <FF label="Amount (₹)" required>
          <input className="mac-input" type="number" value={v.amount} onChange={e=>s('amount',e.target.value)} placeholder={suggested ? String(suggested) : '0'}/>
        </FF>
        <FF label="Payment Date" required>
          <input className="mac-input" type="date" value={v.paidDate} onChange={e=>s('paidDate',e.target.value)}/>
        </FF>
      </div>
      <FF label="Payment Method">
        <select className="mac-select" value={v.paymentMethod} onChange={e=>s('paymentMethod',e.target.value)}>
          {PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}
        </select>
      </FF>
      <FF label="Notes"><input className="mac-input" value={v.notes} onChange={e=>s('notes',e.target.value)} placeholder="Optional"/></FF>
    </div>
  );
}

const TH = ({ c }) => (
  <th style={{ textAlign:'left', padding:'10px 16px', fontSize:11, fontWeight:600, color:'#8E8E93', textTransform:'uppercase', letterSpacing:'0.5px', whiteSpace:'nowrap', borderBottom:'1px solid rgba(0,0,0,0.07)' }}>{c}</th>
);
const TD = ({ children, s = {} }) => (
  <td style={{ padding:'11px 16px', verticalAlign:'middle', ...s }}>{children}</td>
);

export default function Transactions() {
  // ── transactions state ──────────────────────────
  const [txs, setTxs]               = useState([]);
  const [openBal, setOpenBal]       = useState({ cash: 0, bank: 0 });
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');
  const [filters, setFilters]       = useState({ type: '', accountType: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [showAdd, setShowAdd]       = useState(false);
  const [editTx, setEditTx]         = useState(null);
  const [form, setForm]             = useState(emptyTx);
  const [deleteId, setDeleteId]     = useState(null);
  const [showOB, setShowOB]         = useState(false);
  const [obForm, setObForm]         = useState({ cash: 0, bank: 0 });
  const [auditLog, setAuditLog]     = useState([]);
  const [showAudit, setShowAudit]   = useState(false);
  const [tab, setTab]               = useState('all');

  // ── drawings state ──────────────────────────────
  const [drawings, setDrawings]               = useState([]);
  const [loadingDrawings, setLoadingDrawings] = useState(false);
  const [showAddDrawing, setShowAddDrawing]   = useState(false);
  const [drawingForm, setDrawingForm]         = useState(emptyDrawing);
  const [showReturn, setShowReturn]           = useState(false);
  const [returnForm, setReturnForm]           = useState(emptyReturn);
  const [returnId, setReturnId]               = useState(null);
  const [deleteDrawingId, setDeleteDrawingId] = useState(null);

  // ── salary state ────────────────────────────────
  const [salaryRecords, setSalaryRecords]     = useState([]);
  const [loadingSalaries, setLoadingSalaries] = useState(false);
  const [salaryConfig, setSalaryConfig]       = useState(DEFAULT_SALARY);
  const [showSalConfig, setShowSalConfig]     = useState(false);
  const [salConfigForm, setSalConfigForm]     = useState(DEFAULT_SALARY);
  const [showAddSal, setShowAddSal]           = useState(false);
  const [salPayForm, setSalPayForm]           = useState(emptySalPay);
  const [deleteSalId, setDeleteSalId]         = useState(null);

  // ── data fetching ───────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [txData, obData] = await Promise.all([
        transactionsDB.getAll(),
        settingsDB.get('opening_balances'),
      ]);
      setTxs(txData);
      if (obData) { setOpenBal(obData); setObForm(obData); }
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  const fetchDrawings = useCallback(async () => {
    setLoadingDrawings(true);
    try { setDrawings(await drawingsDB.getAll()); } catch(e) { console.error(e); }
    setLoadingDrawings(false);
  }, []);

  const fetchSalaries = useCallback(async () => {
    setLoadingSalaries(true);
    try {
      const [records, config] = await Promise.all([
        partnerSalariesDB.getAll(),
        settingsDB.get('partner_salary_config'),
      ]);
      setSalaryRecords(records);
      if (config) { setSalaryConfig(config); setSalConfigForm(config); }
    } catch(e) { console.error(e); }
    setLoadingSalaries(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (tab === 'drawings') fetchDrawings(); }, [tab, fetchDrawings]);
  useEffect(() => { if (tab === 'salaries') fetchSalaries(); }, [tab, fetchSalaries]);

  // ── balance calc (personal = old "cash", bank = company bank) ──
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

  const filtered = useMemo(() => {
    const base = tab === 'credit' ? txs.filter(t => t.type === 'Credit')
               : tab === 'debit'  ? txs.filter(t => t.type === 'Debit')
               : txs;
    return base.filter(t => {
      const q = search.toLowerCase();
      return (!q || t.remark?.toLowerCase().includes(q) || t.clientName?.toLowerCase().includes(q) || t.paidTo?.toLowerCase().includes(q))
        && (!filters.type       || t.type        === filters.type)
        && (!filters.accountType || t.accountType === filters.accountType);
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [txs, search, filters, tab]);

  // ── partner drawing summaries ───────────────────
  const partnerSummary = useMemo(() => (
    PARTNERS.map(p => {
      const pd = drawings.filter(d => d.partner === p);
      const totalTaken    = pd.reduce((s, d) => s + (+d.amountTaken || 0), 0);
      const totalReturned = pd.reduce((s, d) => s + getTotalReturned(d), 0);
      return { partner: p, totalTaken, totalReturned, outstanding: totalTaken - totalReturned };
    })
  ), [drawings]);

  const totalOutstanding = partnerSummary.reduce((s, p) => s + p.outstanding, 0);

  // ── transaction CRUD ────────────────────────────
  async function save() {
    if (!form.amount || saving) return;
    setSaving(true);
    const now = nowStr();
    try {
      if (editTx) {
        setAuditLog(l => [{ id: Date.now(), action: 'Edited', prev: editTx, next: form, by: 'Bhargav', date: now }, ...l]);
        const updated = await transactionsDB.update(editTx.id, form);
        setTxs(ts => ts.map(t => t.id === editTx.id ? updated : t));
      } else {
        const created = await transactionsDB.create(form);
        setTxs(ts => [created, ...ts]);
      }
    } catch(e) { console.error(e); }
    setSaving(false);
    setShowAdd(false); setEditTx(null); setForm({ ...emptyTx, date: nowStr() });
  }

  async function del(id) {
    const tx = txs.find(t => t.id === id);
    if (tx) setAuditLog(l => [{ id: Date.now(), action: 'Deleted', prev: tx, next: null, by: 'Bhargav', date: nowStr() }, ...l]);
    setTxs(ts => ts.filter(t => t.id !== id));
    try { await transactionsDB.delete(id); } catch(e) { console.error(e); await fetchAll(); }
  }

  async function saveOB() {
    setOpenBal(obForm); setShowOB(false);
    try { await settingsDB.set('opening_balances', obForm); } catch(e) { console.error(e); }
  }

  // ── drawings CRUD ───────────────────────────────
  async function saveDrawing() {
    if (!drawingForm.amountTaken || saving) return;
    setSaving(true);
    try {
      const created = await drawingsDB.create({ ...drawingForm, returns: [] });
      setDrawings(ds => [created, ...ds]);
    } catch(e) { console.error(e); }
    setSaving(false);
    setShowAddDrawing(false); setDrawingForm(emptyDrawing);
  }

  async function addReturn() {
    if (!returnForm.amount || saving) return;
    setSaving(true);
    const drawing = drawings.find(d => d.id === returnId);
    if (!drawing) { setSaving(false); return; }
    const newReturns = [...(drawing.returns || []), { ...returnForm, amount: +returnForm.amount }];
    try {
      const updated = await drawingsDB.addReturn(returnId, newReturns);
      setDrawings(ds => ds.map(d => d.id === returnId ? updated : d));
    } catch(e) { console.error(e); }
    setSaving(false);
    setShowReturn(false); setReturnForm(emptyReturn); setReturnId(null);
  }

  async function deleteDrawing(id) {
    setDrawings(ds => ds.filter(d => d.id !== id));
    try { await drawingsDB.delete(id); } catch(e) { console.error(e); await fetchDrawings(); }
  }

  // ── salary CRUD ─────────────────────────────────
  async function saveSalaryConfig() {
    setSalaryConfig(salConfigForm);
    setShowSalConfig(false);
    try { await settingsDB.set('partner_salary_config', salConfigForm); } catch(e) { console.error(e); }
  }

  async function saveSalaryPayment() {
    if (!salPayForm.month || !salPayForm.amount || saving) return;
    setSaving(true);
    try {
      const created = await partnerSalariesDB.create(salPayForm);
      setSalaryRecords(rs => [created, ...rs]);
    } catch(e) { console.error(e); }
    setSaving(false);
    setShowAddSal(false); setSalPayForm(emptySalPay);
  }

  async function deleteSalary(id) {
    setSalaryRecords(rs => rs.filter(r => r.id !== id));
    try { await partnerSalariesDB.delete(id); } catch(e) { console.error(e); await fetchSalaries(); }
  }

  // per-partner salary summary
  const partnerSalarySummary = useMemo(() => (
    PARTNERS.map(p => {
      const paid = salaryRecords.filter(r => r.partner === p);
      const totalPaid = paid.reduce((s, r) => s + (+r.amount || 0), 0);
      const monthly = salaryConfig[p] || 0;
      const currentMonth = currentMonthLabel();
      const paidThisMonth = paid.some(r => r.month === currentMonth);
      return { partner: p, totalPaid, monthly, paidThisMonth, paidCount: paid.length };
    })
  ), [salaryRecords, salaryConfig]);

  const statCards = [
    { label: 'Total Balance',       value: fmt(bal.total),       gradient: 'linear-gradient(135deg,#0071E3,#0A84FF)', icon: DollarSign },
    { label: 'Total Credit',        value: fmt(bal.totalCredit), gradient: 'linear-gradient(135deg,#34C759,#30D158)', icon: ArrowUpRight },
    { label: 'Total Debit',         value: fmt(bal.totalDebit),  gradient: 'linear-gradient(135deg,#FF3B30,#FF6961)', icon: ArrowDownRight },
    { label: "Founder's Personal",  value: fmt(bal.personal),    gradient: 'linear-gradient(135deg,#FF9500,#FFB340)', icon: Wallet },
  ];

  return (
    <div>
      <Header
        title="Transactions"
        subtitle={
          tab === 'drawings'
            ? `Partner Drawings · ${fmt(totalOutstanding)} outstanding`
            : `Balance: ${fmt(bal.total)} · Personal: ${fmt(bal.personal)} · Bank: ${fmt(bal.bank)}`
        }
        actions={
          <div style={{ display:'flex', gap:8 }}>
            {tab !== 'drawings' && <>
              <button onClick={() => { setObForm(openBal); setShowOB(true); }} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>
                <Wallet size={13}/> Opening Bal.
              </button>
              <button onClick={() => { setForm({ ...emptyTx, date: nowStr() }); setEditTx(null); setShowAdd(true); }} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>
                <Plus size={14}/> Add Transaction
              </button>
            </>}
            {tab === 'drawings' && (
              <button onClick={() => { setDrawingForm(emptyDrawing); setShowAddDrawing(true); }} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>
                <HandCoins size={14}/> Record Drawing
              </button>
            )}
            {tab === 'salaries' && (
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => { setSalConfigForm(salaryConfig); setShowSalConfig(true); }} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>
                  <Settings2 size={13}/> Set Amounts
                </button>
                <button onClick={() => { setSalPayForm({ ...emptySalPay, amount: String(salaryConfig['Bhargav'] || '') }); setShowAddSal(true); }} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>
                  <Banknote size={14}/> Mark as Paid
                </button>
              </div>
            )}
          </div>
        }
      />

      {loading ? <LoadingSpinner rows={7} /> : (
        <div className="page-body">

          {/* Low balance alert */}
          {tab !== 'drawings' && bal.total < 10000 && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderRadius:10, background:'rgba(255,59,48,0.07)', border:'1px solid rgba(255,59,48,0.13)' }}>
              <AlertTriangle size={13} color="#FF3B30"/>
              <span style={{ fontSize:12.5, color:'#FF3B30', fontWeight:500 }}>⚠ Low balance — only {fmt(bal.total)} remaining</span>
            </div>
          )}

          {/* Stat cards (transactions only) */}
          {tab !== 'drawings' && (
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
          )}

          {/* Tab bar */}
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <div className="tab-bar">
              {[['all','All'],['credit','Credit'],['debit','Debit'],['drawings','Drawings 💸'],['salaries','Salaries 💰']].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`tab-item ${tab===k?'active':''}`}>{l}</button>
              ))}
            </div>
            {tab !== 'drawings' && <>
              <div style={{ flex:1, maxWidth:260 }}><SearchBar value={search} onChange={setSearch} placeholder="Search…"/></div>
              <button onClick={() => setShowFilters(f => !f)} className={`mac-btn ${showFilters ? 'mac-btn-primary' : 'mac-btn-secondary'}`} style={{ fontSize:13 }}>
                <Filter size={13}/> Filter
              </button>
              <button onClick={() => setShowAudit(true)} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>
                <History size={13}/> Audit
              </button>
            </>}
          </div>

          {/* Filters panel */}
          {tab !== 'drawings' && showFilters && (
            <div className="mac-card" style={{ padding:'14px 16px', display:'flex', gap:14 }}>
              {[['Type','type',['Credit','Debit']], ['Account','accountType', ACCOUNT_TYPES]].map(([label, key, opts]) => (
                <div key={key} style={{ flex:1 }}>
                  <label style={{ display:'block', fontSize:10.5, fontWeight:600, color:'#8E8E93', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:5 }}>{label}</label>
                  <select className="mac-select" style={{ fontSize:13 }} value={filters[key]} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))}>
                    <option value="">All</option>
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* ─── TRANSACTIONS TABLE ─────────────────── */}
          {tab !== 'drawings' && (
            <div className="mac-card" style={{ overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead style={{ background:'rgba(0,0,0,0.018)' }}>
                    <tr>{['','Date','Description','Account','Method','Amount','Actions'].map(h => <TH key={h} c={h}/>)}</tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0
                      ? <tr><td colSpan={7} style={{ textAlign:'center', padding:'48px 16px', color:'#AEAEB2', fontSize:13 }}>No transactions found</td></tr>
                      : filtered.map(t => (
                        <tr key={t.id} className="table-row">
                          <TD>
                            <div style={{ width:30, height:30, borderRadius:'50%', background: t.type==='Credit'?'rgba(52,199,89,0.1)':'rgba(255,59,48,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              {t.type==='Credit' ? <ArrowUpRight size={13} color="#34C759"/> : <ArrowDownRight size={13} color="#FF3B30"/>}
                            </div>
                          </TD>
                          <TD><span style={{ fontSize:12, color:'#6E6E73', whiteSpace:'nowrap' }}>{t.date}</span></TD>
                          <TD>
                            <div style={{ fontSize:13, fontWeight:500, color:'#1D1D1F' }}>{t.remark || (t.type==='Credit' ? t.source : t.category)}</div>
                            <div style={{ fontSize:11, color:'#AEAEB2', marginTop:1 }}>{t.clientName || t.paidTo || ''}</div>
                          </TD>
                          <TD>
                            <Badge color={t.accountType==="Founder's Personal" ? 'orange' : 'blue'}>{t.accountType}</Badge>
                          </TD>
                          <TD><span style={{ fontSize:12, color:'#6E6E73' }}>{t.paymentMethod}</span></TD>
                          <TD>
                            <span style={{ fontSize:13, fontWeight:650, color: t.type==='Credit'?'#34C759':'#FF3B30', letterSpacing:'-0.2px' }}>
                              {t.type==='Credit'?'+':'-'}{fmt(t.amount)}
                            </span>
                          </TD>
                          <TD>
                            <div style={{ display:'flex', gap:4 }}>
                              {[
                                { icon: Edit2,  color:'#6E6E73', bg:'rgba(0,0,0,0.06)',       fn: () => { setEditTx(t); setForm({...t}); setShowAdd(true); } },
                                { icon: Trash2, color:'#FF3B30', bg:'rgba(255,59,48,0.08)',   fn: () => setDeleteId(t.id) },
                              ].map(({ icon: Icon, color, bg, fn }, i) => (
                                <button key={i} onClick={fn} style={{ width:28, height:28, borderRadius:8, background:bg, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  <Icon size={13} color={color}/>
                                </button>
                              ))}
                            </div>
                          </TD>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── DRAWINGS TAB ───────────────────────── */}
          {tab === 'drawings' && (
            loadingDrawings ? <LoadingSpinner rows={4}/> : (
              <>
                {/* Partner summary cards */}
                <div className="rg-4">
                  {partnerSummary.map(({ partner, totalTaken, totalReturned, outstanding }) => {
                    const col = PARTNER_COLORS[partner] || PARTNER_COLORS.Bhargav;
                    return (
                      <div key={partner} style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.07)', borderRadius:16, padding:'18px 20px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                          <div style={{ width:38, height:38, borderRadius:11, background:col.gradient, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13, fontWeight:700, flexShrink:0 }}>
                            {partner.slice(0,2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize:13.5, fontWeight:640, color:'#1D1D1F' }}>{partner}</div>
                            <div style={{ fontSize:11, color: outstanding > 0 ? '#FF3B30' : '#34C759', fontWeight:500 }}>
                              {outstanding > 0 ? `${fmt(outstanding)} due` : 'All clear ✓'}
                            </div>
                          </div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                          <div style={{ display:'flex', justifyContent:'space-between' }}>
                            <span style={{ fontSize:11, color:'#AEAEB2' }}>Total Taken</span>
                            <span style={{ fontSize:12, fontWeight:550, color:'#1D1D1F' }}>{fmt(totalTaken)}</span>
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between' }}>
                            <span style={{ fontSize:11, color:'#AEAEB2' }}>Returned</span>
                            <span style={{ fontSize:12, fontWeight:550, color:'#34C759' }}>{fmt(totalReturned)}</span>
                          </div>
                          <div style={{ height:1, background:'rgba(0,0,0,0.06)', margin:'3px 0' }}/>
                          <div style={{ display:'flex', justifyContent:'space-between' }}>
                            <span style={{ fontSize:12, fontWeight:600, color:'#1D1D1F' }}>Outstanding</span>
                            <span style={{ fontSize:14, fontWeight:700, color: outstanding > 0 ? '#FF3B30' : '#34C759', letterSpacing:'-0.3px' }}>
                              {fmt(outstanding)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total outstanding banner */}
                {totalOutstanding > 0 && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:11, background:'rgba(255,59,48,0.07)', border:'1px solid rgba(255,59,48,0.13)' }}>
                    <HandCoins size={14} color="#FF3B30"/>
                    <span style={{ fontSize:13, color:'#FF3B30', fontWeight:500 }}>
                      Total outstanding across all partners: <strong>{fmt(totalOutstanding)}</strong>
                    </span>
                  </div>
                )}
                {totalOutstanding === 0 && drawings.length > 0 && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:11, background:'rgba(52,199,89,0.07)', border:'1px solid rgba(52,199,89,0.13)' }}>
                    <span style={{ fontSize:13, color:'#34C759', fontWeight:500 }}>✓ All drawings have been returned — everyone is settled up!</span>
                  </div>
                )}

                {/* Drawings table */}
                <div className="mac-card" style={{ overflow:'hidden' }}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead style={{ background:'rgba(0,0,0,0.018)' }}>
                        <tr>
                          {['Partner','Amount Taken','Date','Purpose','Returned','Outstanding','Status','Actions'].map(h => <TH key={h} c={h}/>)}
                        </tr>
                      </thead>
                      <tbody>
                        {drawings.length === 0
                          ? <tr><td colSpan={8} style={{ textAlign:'center', padding:'48px 16px', color:'#AEAEB2', fontSize:13 }}>No drawings recorded yet — click "Record Drawing" to add one</td></tr>
                          : drawings.map(d => {
                            const status     = getDrawingStatus(d);
                            const returned   = getTotalReturned(d);
                            const outstanding = getOutstanding(d);
                            const col        = PARTNER_COLORS[d.partner] || PARTNER_COLORS.Bhargav;
                            return (
                              <tr key={d.id} className="table-row">
                                <TD>
                                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                    <div style={{ width:28, height:28, borderRadius:8, background:col.gradient, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:10, fontWeight:700, flexShrink:0 }}>
                                      {d.partner.slice(0,2).toUpperCase()}
                                    </div>
                                    <span style={{ fontSize:13, fontWeight:550, color:'#1D1D1F' }}>{d.partner}</span>
                                  </div>
                                </TD>
                                <TD><span style={{ fontSize:13, fontWeight:650, color:'#FF3B30' }}>-{fmt(d.amountTaken)}</span></TD>
                                <TD><span style={{ fontSize:12, color:'#6E6E73' }}>{d.dateTaken}</span></TD>
                                <TD><span style={{ fontSize:12.5, color:'#3C3C43' }}>{d.purpose || '—'}</span></TD>
                                <TD><span style={{ fontSize:13, fontWeight:550, color:'#34C759' }}>{returned > 0 ? '+'+fmt(returned) : '—'}</span></TD>
                                <TD>
                                  <span style={{ fontSize:13, fontWeight:650, color: outstanding > 0 ? '#FF3B30' : '#34C759' }}>
                                    {fmt(outstanding)}
                                  </span>
                                </TD>
                                <TD>
                                  <Badge color={STATUS_COLOR[status] || 'gray'}>{status}</Badge>
                                </TD>
                                <TD style={{ whiteSpace:'nowrap' }}>
                                  <div style={{ display:'flex', gap:4 }}>
                                    {status !== 'Settled' && (
                                      <button
                                        title="Record Return"
                                        onClick={() => { setReturnId(d.id); setReturnForm(emptyReturn); setShowReturn(true); }}
                                        style={{ width:28, height:28, borderRadius:8, background:'rgba(52,199,89,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                                      >
                                        <RotateCcw size={12} color="#34C759"/>
                                      </button>
                                    )}
                                    <button
                                      title="Delete"
                                      onClick={() => setDeleteDrawingId(d.id)}
                                      style={{ width:28, height:28, borderRadius:8, background:'rgba(255,59,48,0.08)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                                    >
                                      <Trash2 size={12} color="#FF3B30"/>
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
              </>
            )
          )}

          {/* ─── SALARIES TAB ──────────────────────────── */}
          {tab === 'salaries' && (
            loadingSalaries ? <LoadingSpinner rows={4}/> : (
              <>
                {/* Partner salary cards */}
                <div className="rg-4">
                  {partnerSalarySummary.map(({ partner, totalPaid, monthly, paidThisMonth, paidCount }) => {
                    const col = PARTNER_COLORS[partner] || PARTNER_COLORS.Bhargav;
                    const curMonth = currentMonthLabel();
                    return (
                      <div key={partner} style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.07)', borderRadius:16, padding:'18px 20px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:38, height:38, borderRadius:11, background:col.gradient, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13, fontWeight:700, flexShrink:0 }}>
                              {partner.slice(0,2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize:13.5, fontWeight:640, color:'#1D1D1F' }}>{partner}</div>
                              <div style={{ fontSize:11, color:'#8E8E93' }}>{monthly > 0 ? fmt(monthly)+'/mo' : 'Not set'}</div>
                            </div>
                          </div>
                          {monthly > 0 && (
                            paidThisMonth
                              ? <div style={{ display:'flex', alignItems:'center', gap:4 }}><CheckCircle2 size={14} color="#34C759"/><span style={{ fontSize:11, color:'#34C759', fontWeight:500 }}>Paid</span></div>
                              : <div style={{ display:'flex', alignItems:'center', gap:4 }}><Clock size={14} color="#FF9500"/><span style={{ fontSize:11, color:'#FF9500', fontWeight:500 }}>Pending</span></div>
                          )}
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                          <div style={{ display:'flex', justifyContent:'space-between' }}>
                            <span style={{ fontSize:11, color:'#AEAEB2' }}>Monthly Salary</span>
                            <span style={{ fontSize:12, fontWeight:600, color:'#1D1D1F' }}>{monthly > 0 ? fmt(monthly) : '—'}</span>
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between' }}>
                            <span style={{ fontSize:11, color:'#AEAEB2' }}>Total Paid</span>
                            <span style={{ fontSize:12, fontWeight:550, color:'#34C759' }}>{fmt(totalPaid)}</span>
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between' }}>
                            <span style={{ fontSize:11, color:'#AEAEB2' }}>{curMonth}</span>
                            <Badge color={paidThisMonth ? 'green' : monthly > 0 ? 'orange' : 'gray'}>
                              {paidThisMonth ? 'Paid' : monthly > 0 ? 'Pending' : 'Not set'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pending alert */}
                {partnerSalarySummary.some(p => p.monthly > 0 && !p.paidThisMonth) && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:11, background:'rgba(255,149,0,0.07)', border:'1px solid rgba(255,149,0,0.15)' }}>
                    <Clock size={14} color="#FF9500"/>
                    <span style={{ fontSize:13, color:'#FF9500', fontWeight:500 }}>
                      {currentMonthLabel()} salary pending for:{' '}
                      <strong>{partnerSalarySummary.filter(p => p.monthly > 0 && !p.paidThisMonth).map(p => p.partner).join(', ')}</strong>
                    </span>
                  </div>
                )}

                {/* Payment history table */}
                <div className="mac-card" style={{ overflow:'hidden' }}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead style={{ background:'rgba(0,0,0,0.018)' }}>
                        <tr>{['Partner','Month','Amount','Date','Method','Notes','Actions'].map(h => <TH key={h} c={h}/>)}</tr>
                      </thead>
                      <tbody>
                        {salaryRecords.length === 0
                          ? <tr><td colSpan={7} style={{ textAlign:'center', padding:'48px 16px', color:'#AEAEB2', fontSize:13 }}>No salary payments recorded — click "Mark as Paid" to add one</td></tr>
                          : salaryRecords.map(r => {
                            const col = PARTNER_COLORS[r.partner] || PARTNER_COLORS.Bhargav;
                            return (
                              <tr key={r.id} className="table-row">
                                <TD>
                                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                    <div style={{ width:28, height:28, borderRadius:8, background:col.gradient, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:10, fontWeight:700, flexShrink:0 }}>
                                      {r.partner.slice(0,2).toUpperCase()}
                                    </div>
                                    <span style={{ fontSize:13, fontWeight:550, color:'#1D1D1F' }}>{r.partner}</span>
                                  </div>
                                </TD>
                                <TD><span style={{ fontSize:13, fontWeight:500, color:'#1D1D1F' }}>{r.month}</span></TD>
                                <TD><span style={{ fontSize:13, fontWeight:650, color:'#34C759' }}>{fmt(r.amount)}</span></TD>
                                <TD><span style={{ fontSize:12, color:'#6E6E73' }}>{r.paidDate || '—'}</span></TD>
                                <TD><span style={{ fontSize:12, color:'#6E6E73' }}>{r.paymentMethod || '—'}</span></TD>
                                <TD><span style={{ fontSize:12, color:'#8E8E93' }}>{r.notes || '—'}</span></TD>
                                <TD>
                                  <button onClick={() => setDeleteSalId(r.id)} style={{ width:28, height:28, borderRadius:8, background:'rgba(255,59,48,0.08)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                    <Trash2 size={12} color="#FF3B30"/>
                                  </button>
                                </TD>
                              </tr>
                            );
                          })
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )
          )}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────── */}

      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditTx(null); setForm({ ...emptyTx, date: nowStr() }); }} title={editTx ? 'Edit Transaction' : 'Add Transaction'} size="md">
        <TxForm v={form} onChange={setForm}/>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20, paddingTop:16, borderTop:'1px solid rgba(0,0,0,0.07)' }}>
          <button onClick={() => { setShowAdd(false); setEditTx(null); }} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>Cancel</button>
          <button onClick={save} disabled={saving} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>{saving ? 'Saving…' : editTx ? 'Save Changes' : 'Add Transaction'}</button>
        </div>
      </Modal>

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

      <Modal isOpen={showAudit} onClose={() => setShowAudit(false)} title="Audit Log" size="lg">
        {auditLog.length === 0
          ? <p style={{ textAlign:'center', color:'#AEAEB2', padding:'32px 0', fontSize:13 }}>No audit entries yet</p>
          : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {auditLog.map(e => (
              <div key={e.id} style={{ padding:'10px 12px', borderRadius:10, background:'rgba(0,0,0,0.025)', border:'1px solid rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <Badge color={e.action==='Deleted'?'red':'blue'}>{e.action}</Badge>
                  <span style={{ fontSize:11, color:'#AEAEB2' }}>{e.date} · {e.by}</span>
                </div>
                {e.prev && <div style={{ fontSize:11, color:'#6E6E73' }}>Before: {fmt(e.prev.amount)} · {e.prev.type} · {e.prev.remark||''}</div>}
                {e.next && <div style={{ fontSize:11, color:'#1D1D1F', marginTop:2 }}>After: {fmt(e.next.amount)} · {e.next.type} · {e.next.remark||''}</div>}
              </div>
            ))}
          </div>
        }
      </Modal>

      <Modal isOpen={showAddDrawing} onClose={() => setShowAddDrawing(false)} title="Record Partner Drawing" size="sm">
        <DrawingForm v={drawingForm} onChange={setDrawingForm}/>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20, paddingTop:16, borderTop:'1px solid rgba(0,0,0,0.07)' }}>
          <button onClick={() => setShowAddDrawing(false)} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>Cancel</button>
          <button onClick={saveDrawing} disabled={saving} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>{saving ? 'Saving…' : 'Record Drawing'}</button>
        </div>
      </Modal>

      <Modal isOpen={showReturn} onClose={() => { setShowReturn(false); setReturnId(null); }} title="Record Return" size="sm">
        <ReturnForm
          v={returnForm}
          onChange={setReturnForm}
          drawing={returnId ? drawings.find(d => d.id === returnId) : null}
        />
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20, paddingTop:16, borderTop:'1px solid rgba(0,0,0,0.07)' }}>
          <button onClick={() => { setShowReturn(false); setReturnId(null); }} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>Cancel</button>
          <button onClick={addReturn} disabled={saving} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>{saving ? 'Saving…' : 'Save Return'}</button>
        </div>
      </Modal>

      {/* Set Salary Amounts Modal */}
      <Modal isOpen={showSalConfig} onClose={() => setShowSalConfig(false)} title="Set Partner Monthly Salaries" size="sm">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {PARTNERS.map(p => {
            const col = PARTNER_COLORS[p] || PARTNER_COLORS.Bhargav;
            return (
              <div key={p} style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:32, height:32, borderRadius:9, background:col.gradient, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:700, flexShrink:0 }}>
                  {p.slice(0,2).toUpperCase()}
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

      {/* Mark Salary Paid Modal */}
      <Modal isOpen={showAddSal} onClose={() => setShowAddSal(false)} title="Mark Salary as Paid" size="sm">
        <SalaryPayForm v={salPayForm} onChange={setSalPayForm} salaryConfig={salaryConfig}/>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20, paddingTop:16, borderTop:'1px solid rgba(0,0,0,0.07)' }}>
          <button onClick={() => setShowAddSal(false)} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>Cancel</button>
          <button onClick={saveSalaryPayment} disabled={saving} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>{saving ? 'Saving…' : 'Save Payment'}</button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => del(deleteId)} title="Delete Transaction" message="This will permanently delete this transaction."/>
      <ConfirmDialog isOpen={!!deleteDrawingId} onClose={() => setDeleteDrawingId(null)} onConfirm={() => deleteDrawing(deleteDrawingId)} title="Delete Drawing" message="This will permanently delete this drawing record and all return history."/>
      <ConfirmDialog isOpen={!!deleteSalId} onClose={() => setDeleteSalId(null)} onConfirm={() => deleteSalary(deleteSalId)} title="Delete Salary Record" message="This will permanently delete this salary payment record."/>
    </div>
  );
}
