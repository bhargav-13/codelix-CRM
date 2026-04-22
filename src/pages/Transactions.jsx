import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import SearchBar from '../components/ui/SearchBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { transactionsDB, settingsDB } from '../lib/db';
import { TRANSACTION_SOURCES, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../data/mockData';
import {
  Plus, Filter, ArrowUpRight, ArrowDownRight, Edit2, Trash2,
  Wallet, History, AlertTriangle, DollarSign, X,
} from 'lucide-react';

const fmt = n => '₹' + Number(n).toLocaleString('en-IN');
const nowStr = () => new Date().toISOString().replace('T',' ').slice(0,16);

const emptyTx = { type:'Credit', accountType:'Bank', amount:'', date:nowStr(), source:'Client Payment', category:'Misc', clientName:'', paidTo:'', paymentMethod:'Bank Transfer', remark:'' };

const FF = ({label,children,required})=>(
  <div>
    <label style={{display:'block',fontSize:11.5,fontWeight:550,color:'#6E6E73',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.4px'}}>
      {label}{required&&<span style={{color:'#FF3B30',marginLeft:2}}>*</span>}
    </label>
    {children}
  </div>
);

function TxForm({v,onChange}){
  const s=(k,val)=>onChange({...v,[k]:val});
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <FF label="Type" required>
          <div className="tab-bar">
            {['Credit','Debit'].map(t=><button key={t} onClick={()=>s('type',t)} className={`tab-item ${v.type===t?'active':''}`} style={{flex:1}}>{t}</button>)}
          </div>
        </FF>
        <FF label="Account" required>
          <div className="tab-bar">
            {['Cash','Bank'].map(t=><button key={t} onClick={()=>s('accountType',t)} className={`tab-item ${v.accountType===t?'active':''}`} style={{flex:1}}>{t}</button>)}
          </div>
        </FF>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <FF label="Amount (₹)" required><input className="mac-input" type="number" value={v.amount} onChange={e=>s('amount',e.target.value)} placeholder="0"/></FF>
        <FF label="Date & Time" required><input className="mac-input" type="datetime-local" value={v.date} onChange={e=>s('date',e.target.value)}/></FF>
      </div>
      {v.type==='Credit'
        ?<FF label="Source"><select className="mac-select" value={v.source} onChange={e=>s('source',e.target.value)}>{TRANSACTION_SOURCES.map(x=><option key={x}>{x}</option>)}</select></FF>
        :<FF label="Category"><select className="mac-select" value={v.category} onChange={e=>s('category',e.target.value)}>{EXPENSE_CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></FF>
      }
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <FF label="Client Name"><input className="mac-input" value={v.clientName} onChange={e=>s('clientName',e.target.value)} placeholder="Optional"/></FF>
        <FF label="Paid To"><input className="mac-input" value={v.paidTo} onChange={e=>s('paidTo',e.target.value)} placeholder="Person / Vendor"/></FF>
      </div>
      <FF label="Payment Method"><select className="mac-select" value={v.paymentMethod} onChange={e=>s('paymentMethod',e.target.value)}>{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></FF>
      <FF label="Remark"><input className="mac-input" value={v.remark} onChange={e=>s('remark',e.target.value)} placeholder="Optional note"/></FF>
    </div>
  );
}

const TH=({c})=><th style={{textAlign:'left',padding:'10px 16px',fontSize:11,fontWeight:600,color:'#8E8E93',textTransform:'uppercase',letterSpacing:'0.5px',whiteSpace:'nowrap',borderBottom:'1px solid rgba(0,0,0,0.07)'}}>{c}</th>;
const TD=({children,s={}})=><td style={{padding:'11px 16px',verticalAlign:'middle',...s}}>{children}</td>;

export default function Transactions(){
  const [txs,setTxs]           = useState([]);
  const [openBal,setOpenBal]   = useState({ cash:25000, bank:150000 });
  const [loading,setLoading]   = useState(true);
  const [saving,setSaving]     = useState(false);
  const [search,setSearch]     = useState('');
  const [filters,setFilters]   = useState({type:'',accountType:''});
  const [showFilters,setShowFilters] = useState(false);
  const [showAdd,setShowAdd]   = useState(false);
  const [editTx,setEditTx]     = useState(null);
  const [form,setForm]         = useState(emptyTx);
  const [deleteId,setDeleteId] = useState(null);
  const [showOB,setShowOB]     = useState(false);
  const [obForm,setObForm]     = useState({ cash:25000, bank:150000 });
  const [auditLog,setAuditLog] = useState([]);
  const [showAudit,setShowAudit] = useState(false);
  const [tab,setTab]           = useState('all');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [txData, obData] = await Promise.all([
        transactionsDB.getAll(),
        settingsDB.get('opening_balances'),
      ]);
      setTxs(txData);
      if (obData) setOpenBal(obData);
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const bal=useMemo(()=>{
    let cC=0,cD=0,bC=0,bD=0;
    txs.forEach(t=>{
      if(t.accountType==='Cash'){t.type==='Credit'?cC+=+t.amount:cD+=+t.amount;}
      else{t.type==='Credit'?bC+=+t.amount:bD+=+t.amount;}
    });
    return{cashCredit:cC,cashDebit:cD,bankCredit:bC,bankDebit:bD,cash:openBal.cash+cC-cD,bank:openBal.bank+bC-bD,totalCredit:cC+bC,totalDebit:cD+bD,get total(){return this.cash+this.bank;}};
  },[txs,openBal]);

  const filtered=useMemo(()=>{
    const base=tab==='credit'?txs.filter(t=>t.type==='Credit'):tab==='debit'?txs.filter(t=>t.type==='Debit'):txs;
    return base.filter(t=>{
      const q=search.toLowerCase();
      return(!q||t.remark?.toLowerCase().includes(q)||t.clientName?.toLowerCase().includes(q)||t.paidTo?.toLowerCase().includes(q))
        &&(!filters.type||t.type===filters.type)
        &&(!filters.accountType||t.accountType===filters.accountType);
    }).sort((a,b)=>new Date(b.date)-new Date(a.date));
  },[txs,search,filters,tab]);

  async function save(){
    if(!form.amount||saving)return;
    setSaving(true);
    const today=nowStr();
    try{
      if(editTx){
        setAuditLog(l=>[{id:Date.now(),action:'Edited',prev:editTx,next:form,by:'Bhargav Shah',date:today},...l]);
        const updated=await transactionsDB.update(editTx.id,form);
        setTxs(ts=>ts.map(t=>t.id===editTx.id?updated:t));
      } else {
        const created=await transactionsDB.create(form);
        setTxs(ts=>[created,...ts]);
      }
    } catch(e){ console.error(e); }
    setSaving(false);
    setShowAdd(false);setEditTx(null);setForm({...emptyTx,date:nowStr()});
  }

  async function del(id){
    const tx=txs.find(t=>t.id===id);
    if(tx)setAuditLog(l=>[{id:Date.now(),action:'Deleted',prev:tx,next:null,by:'Bhargav Shah',date:nowStr()},...l]);
    setTxs(ts=>ts.filter(t=>t.id!==id));
    try{ await transactionsDB.delete(id); } catch(e){ console.error(e); await fetchAll(); }
  }

  async function saveOB(){
    setOpenBal(obForm);
    setShowOB(false);
    try{ await settingsDB.set('opening_balances',obForm); } catch(e){ console.error(e); }
  }

  const statCards=[
    {label:'Total Balance',value:fmt(bal.total),gradient:'linear-gradient(135deg,#0071E3,#0A84FF)',icon:DollarSign},
    {label:'Total Credit',value:fmt(bal.totalCredit),gradient:'linear-gradient(135deg,#34C759,#30D158)',icon:ArrowUpRight},
    {label:'Total Debit',value:fmt(bal.totalDebit),gradient:'linear-gradient(135deg,#FF3B30,#FF6961)',icon:ArrowDownRight},
    {label:'Cash Balance',value:fmt(bal.cash),gradient:'linear-gradient(135deg,#FF9500,#FFB340)',icon:Wallet},
  ];

  return(
    <div>
      <Header title="Transactions" subtitle={`Balance: ${fmt(bal.total)} · Cash: ${fmt(bal.cash)} · Bank: ${fmt(bal.bank)}`}
        actions={<div style={{display:'flex',gap:8}}>
          <button onClick={()=>{setObForm(openBal);setShowOB(true);}} className="mac-btn mac-btn-secondary" style={{fontSize:13}}><Wallet size={13}/> Opening Bal.</button>
          <button onClick={()=>{setForm({...emptyTx,date:nowStr()});setEditTx(null);setShowAdd(true);}} className="mac-btn mac-btn-primary" style={{fontSize:13}}><Plus size={14}/> Add Transaction</button>
        </div>}
      />

      {loading ? <LoadingSpinner rows={7} /> : (
        <div className="page-body">
          {bal.total<10000&&(
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',borderRadius:10,background:'rgba(255,59,48,0.07)',border:'1px solid rgba(255,59,48,0.13)'}}>
              <AlertTriangle size={13} color="#FF3B30"/><span style={{fontSize:12.5,color:'#FF3B30',fontWeight:500}}>⚠ Low balance alert — only {fmt(bal.total)} remaining</span>
            </div>
          )}
          <div className="rg-4">
            {statCards.map(c=>(
              <div key={c.label} style={{borderRadius:16,padding:'18px 20px',background:c.gradient,display:'flex',flexDirection:'column',gap:10}}>
                <div style={{width:34,height:34,borderRadius:10,background:'rgba(255,255,255,0.22)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <c.icon size={16} color="#fff"/>
                </div>
                <div>
                  <div style={{fontSize:22,fontWeight:700,color:'#fff',letterSpacing:'-0.6px',lineHeight:1.1}}>{c.value}</div>
                  <div style={{fontSize:12,color:'rgba(255,255,255,0.8)',marginTop:2}}>{c.label}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div className="tab-bar">
              {[['all','All'],['credit','Credit'],['debit','Debit']].map(([k,l])=>(
                <button key={k} onClick={()=>setTab(k)} className={`tab-item ${tab===k?'active':''}`}>{l}</button>
              ))}
            </div>
            <div style={{flex:1,maxWidth:260}}><SearchBar value={search} onChange={setSearch} placeholder="Search…"/></div>
            <button onClick={()=>setShowFilters(f=>!f)} className={`mac-btn ${showFilters?'mac-btn-primary':'mac-btn-secondary'}`} style={{fontSize:13}}><Filter size={13}/> Filter</button>
            <button onClick={()=>setShowAudit(true)} className="mac-btn mac-btn-secondary" style={{fontSize:13}}><History size={13}/> Audit</button>
          </div>
          {showFilters&&(
            <div className="mac-card" style={{padding:'14px 16px',display:'flex',gap:14}}>
              {[['Type','type',['Credit','Debit']],['Account','accountType',['Cash','Bank']]].map(([label,key,opts])=>(
                <div key={key} style={{flex:1}}>
                  <label style={{display:'block',fontSize:10.5,fontWeight:600,color:'#8E8E93',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:5}}>{label}</label>
                  <select className="mac-select" style={{fontSize:13}} value={filters[key]} onChange={e=>setFilters(f=>({...f,[key]:e.target.value}))}>
                    <option value="">All</option>{opts.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          <div className="mac-card" style={{overflow:'hidden'}}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead style={{background:'rgba(0,0,0,0.018)'}}>
                  <tr>{['','Date','Description','Account','Method','Amount','Actions'].map(h=><TH key={h} c={h}/>)}</tr>
                </thead>
                <tbody>
                  {filtered.length===0
                    ?<tr><td colSpan={7} style={{textAlign:'center',padding:'48px 16px',color:'#AEAEB2',fontSize:13}}>No transactions found</td></tr>
                    :filtered.map(t=>(
                      <tr key={t.id} className="table-row">
                        <TD><div style={{width:30,height:30,borderRadius:'50%',background:t.type==='Credit'?'rgba(52,199,89,0.1)':'rgba(255,59,48,0.1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          {t.type==='Credit'?<ArrowUpRight size={13} color="#34C759"/>:<ArrowDownRight size={13} color="#FF3B30"/>}
                        </div></TD>
                        <TD><span style={{fontSize:12,color:'#6E6E73',whiteSpace:'nowrap'}}>{t.date}</span></TD>
                        <TD>
                          <div style={{fontSize:13,fontWeight:500,color:'#1D1D1F'}}>{t.remark||(t.type==='Credit'?t.source:t.category)}</div>
                          <div style={{fontSize:11,color:'#AEAEB2',marginTop:1}}>{t.clientName||t.paidTo||''}</div>
                        </TD>
                        <TD><Badge color={t.accountType==='Cash'?'orange':'blue'}>{t.accountType}</Badge></TD>
                        <TD><span style={{fontSize:12,color:'#6E6E73'}}>{t.paymentMethod}</span></TD>
                        <TD><span style={{fontSize:13,fontWeight:650,color:t.type==='Credit'?'#34C759':'#FF3B30',letterSpacing:'-0.2px'}}>{t.type==='Credit'?'+':'-'}{fmt(t.amount)}</span></TD>
                        <TD>
                          <div style={{display:'flex',gap:4}}>
                            {[{icon:Edit2,color:'#6E6E73',bg:'rgba(0,0,0,0.06)',fn:()=>{setEditTx(t);setForm({...t});setShowAdd(true);}},
                              {icon:Trash2,color:'#FF3B30',bg:'rgba(255,59,48,0.08)',fn:()=>setDeleteId(t.id)}
                            ].map(({icon:Icon,color,bg,fn},i)=>(
                              <button key={i} onClick={fn} style={{width:28,height:28,borderRadius:8,background:bg,border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
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
        </div>
      )}

      <Modal isOpen={showAdd} onClose={()=>{setShowAdd(false);setEditTx(null);setForm({...emptyTx,date:nowStr()});}} title={editTx?'Edit Transaction':'Add Transaction'} size="md">
        <TxForm v={form} onChange={setForm}/>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20,paddingTop:16,borderTop:'1px solid rgba(0,0,0,0.07)'}}>
          <button onClick={()=>{setShowAdd(false);setEditTx(null);}} className="mac-btn mac-btn-secondary" style={{fontSize:13}}>Cancel</button>
          <button onClick={save} disabled={saving} className="mac-btn mac-btn-primary" style={{fontSize:13}}>{saving?'Saving…':editTx?'Save Changes':'Add Transaction'}</button>
        </div>
      </Modal>

      <Modal isOpen={showOB} onClose={()=>setShowOB(false)} title="Set Opening Balance" size="sm">
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <FF label="Opening Cash (₹)" required><input className="mac-input" type="number" value={obForm.cash} onChange={e=>setObForm(b=>({...b,cash:+e.target.value}))}/></FF>
          <FF label="Opening Bank (₹)" required><input className="mac-input" type="number" value={obForm.bank} onChange={e=>setObForm(b=>({...b,bank:+e.target.value}))}/></FF>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20,paddingTop:16,borderTop:'1px solid rgba(0,0,0,0.07)'}}>
          <button onClick={()=>setShowOB(false)} className="mac-btn mac-btn-secondary" style={{fontSize:13}}>Cancel</button>
          <button onClick={saveOB} className="mac-btn mac-btn-primary" style={{fontSize:13}}>Save</button>
        </div>
      </Modal>

      <Modal isOpen={showAudit} onClose={()=>setShowAudit(false)} title="Audit Log" size="lg">
        {auditLog.length===0?<p style={{textAlign:'center',color:'#AEAEB2',padding:'32px 0',fontSize:13}}>No audit entries yet</p>
          :<div style={{display:'flex',flexDirection:'column',gap:8}}>
            {auditLog.map(e=>(
              <div key={e.id} style={{padding:'10px 12px',borderRadius:10,background:'rgba(0,0,0,0.025)',border:'1px solid rgba(0,0,0,0.06)'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <Badge color={e.action==='Deleted'?'red':'blue'}>{e.action}</Badge>
                  <span style={{fontSize:11,color:'#AEAEB2'}}>{e.date} · {e.by}</span>
                </div>
                {e.prev&&<div style={{fontSize:11,color:'#6E6E73'}}>Before: {fmt(e.prev.amount)} · {e.prev.type} · {e.prev.remark||''}</div>}
                {e.next&&<div style={{fontSize:11,color:'#1D1D1F',marginTop:2}}>After: {fmt(e.next.amount)} · {e.next.type} · {e.next.remark||''}</div>}
              </div>
            ))}
          </div>
        }
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={()=>del(deleteId)} title="Delete Transaction" message="This will permanently delete this transaction."/>
    </div>
  );
}
