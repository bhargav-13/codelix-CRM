import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Badge, { getStatusColor } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import SearchBar from '../components/ui/SearchBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { CardGridSkeleton } from '../components/ui/LoadingSpinner';
import { projectsDB, employeesDB } from '../lib/db';
import { PROJECT_TYPES, PROJECT_STATUSES, PAYMENT_METHODS, PARTNERS } from '../data/mockData';
import { Plus, Edit2, Trash2, Filter, History, IndianRupee, ChevronDown, ChevronRight, User, Calendar } from 'lucide-react';

const today = new Date().toISOString().split('T')[0];
const fmt = n => n != null ? '₹' + Number(n).toLocaleString('en-IN') : '—';

const emptyProj = { projectName:'',clientName:'',companyName:'',projectType:'Website Development',handledBy:'',startDate:today,dueDate:'',status:'Pending',valuation:'',milestones:[],payments:[],nextPaymentDue:'',assignedEmployees:[] };
const emptyPay  = { amount:'',date:today+'T10:00',method:'Bank Transfer',remark:'' };
const emptyMs   = { label:'',percent:'' };

const FF=({label,children,required})=>(
  <div>
    <label style={{display:'block',fontSize:11.5,fontWeight:550,color:'#6E6E73',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.4px'}}>
      {label}{required&&<span style={{color:'#FF3B30',marginLeft:2}}>*</span>}
    </label>
    {children}
  </div>
);

function ProjectForm({v,onChange,employees=[]}){
  const s=(k,val)=>onChange({...v,[k]:val});
  const [ms,setMs]=useState(emptyMs);
  function addMs(){if(!ms.label||!ms.percent)return;onChange({...v,milestones:[...(v.milestones||[]),{...ms,percent:+ms.percent}]});setMs(emptyMs);}
  function delMs(i){onChange({...v,milestones:v.milestones.filter((_,idx)=>idx!==i)});}

  function toggleEmployee(emp){
    const already=(v.assignedEmployees||[]).some(e=>e.id===emp.id);
    if(already) onChange({...v,assignedEmployees:(v.assignedEmployees||[]).filter(e=>e.id!==emp.id)});
    else         onChange({...v,assignedEmployees:[...(v.assignedEmployees||[]),{id:emp.id,name:emp.name}]});
  }

  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px 16px'}}>
        <FF label="Project Name" required><input className="mac-input" value={v.projectName} onChange={e=>s('projectName',e.target.value)} placeholder="Project title"/></FF>
        <FF label="Project Type"><select className="mac-select" value={v.projectType} onChange={e=>s('projectType',e.target.value)}>{PROJECT_TYPES.map(t=><option key={t}>{t}</option>)}</select></FF>
        <FF label="Client Name"><input className="mac-input" value={v.clientName} onChange={e=>s('clientName',e.target.value)} placeholder="Client name"/></FF>
        <FF label="Company Name"><input className="mac-input" value={v.companyName} onChange={e=>s('companyName',e.target.value)} placeholder="Company"/></FF>
        <FF label="Handled By"><select className="mac-select" value={v.handledBy} onChange={e=>s('handledBy',e.target.value)}><option value="">— Select Partner —</option>{PARTNERS.map(p=><option key={p}>{p}</option>)}</select></FF>
        <FF label="Status"><select className="mac-select" value={v.status} onChange={e=>s('status',e.target.value)}>{PROJECT_STATUSES.map(x=><option key={x}>{x}</option>)}</select></FF>
        <FF label="Start Date"><input className="mac-input" type="date" value={v.startDate} onChange={e=>s('startDate',e.target.value)}/></FF>
        <FF label="Due Date"><input className="mac-input" type="date" value={v.dueDate} onChange={e=>s('dueDate',e.target.value)}/></FF>
        <FF label="Project Valuation (₹)" required><input className="mac-input" type="number" value={v.valuation} onChange={e=>s('valuation',e.target.value)} placeholder="0"/></FF>
        <FF label="Next Payment Due"><input className="mac-input" type="date" value={v.nextPaymentDue} onChange={e=>s('nextPaymentDue',e.target.value)}/></FF>
      </div>

      {/* Assigned Employees */}
      {employees.length > 0 && (
        <div>
          <label style={{display:'block',fontSize:11.5,fontWeight:550,color:'#6E6E73',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.4px'}}>
            Assign Employees
            {(v.assignedEmployees||[]).length > 0 && (
              <span style={{marginLeft:6,fontSize:10.5,fontWeight:600,color:'#0071E3',background:'rgba(0,113,227,0.1)',padding:'1px 6px',borderRadius:10,textTransform:'none',letterSpacing:0}}>
                {(v.assignedEmployees||[]).length} selected
              </span>
            )}
          </label>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {employees.map(emp=>{
              const selected=(v.assignedEmployees||[]).some(e=>e.id===emp.id);
              return(
                <button
                  key={emp.id}
                  type="button"
                  onClick={()=>toggleEmployee(emp)}
                  style={{
                    display:'flex',alignItems:'center',gap:7,padding:'6px 11px',borderRadius:20,cursor:'pointer',
                    border:`1.5px solid ${selected?'#0071E3':'rgba(0,0,0,0.1)'}`,
                    background:selected?'rgba(0,113,227,0.08)':'#fff',
                    transition:'all 0.13s',
                  }}
                >
                  <div style={{width:18,height:18,borderRadius:'50%',background:selected?'#0071E3':'rgba(0,0,0,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:selected?'#fff':'#6E6E73',flexShrink:0}}>
                    {emp.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <span style={{fontSize:12.5,fontWeight:500,color:selected?'#0071E3':'#3C3C43'}}>{emp.name}</span>
                  {emp.role&&<span style={{fontSize:10.5,color:selected?'#5BA3F5':'#AEAEB2'}}>· {emp.role}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment Milestones */}
      <div>
        <label style={{display:'block',fontSize:11.5,fontWeight:550,color:'#6E6E73',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.4px'}}>Payment Milestones</label>
        <div style={{display:'flex',gap:8,marginBottom:8}}>
          <input className="mac-input" style={{flex:1}} value={ms.label} onChange={e=>setMs(m=>({...m,label:e.target.value}))} placeholder="Label (e.g. 30% Advance)"/>
          <input className="mac-input" style={{width:80}} type="number" value={ms.percent} onChange={e=>setMs(m=>({...m,percent:e.target.value}))} placeholder="%"/>
          <button onClick={addMs} className="mac-btn mac-btn-secondary" style={{fontSize:13,flexShrink:0}}>Add</button>
        </div>
        {(v.milestones||[]).map((m,i)=>(
          <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',borderRadius:8,background:'rgba(0,0,0,0.025)',border:'1px solid rgba(0,0,0,0.05)',marginBottom:5}}>
            <span style={{fontSize:12.5,color:'#1D1D1F'}}>{m.label}</span>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <Badge color="blue">{m.percent}%</Badge>
              <button onClick={()=>delMs(i)} style={{background:'none',border:'none',cursor:'pointer',color:'#FF3B30',fontSize:16,lineHeight:1}}>×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentForm({v,onChange}){
  const s=(k,val)=>onChange({...v,[k]:val});
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <FF label="Amount (₹)" required><input className="mac-input" type="number" value={v.amount} onChange={e=>s('amount',e.target.value)} placeholder="0"/></FF>
      <FF label="Date & Time"><input className="mac-input" type="datetime-local" value={v.date} onChange={e=>s('date',e.target.value)}/></FF>
      <FF label="Payment Method"><select className="mac-select" value={v.method} onChange={e=>s('method',e.target.value)}>{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></FF>
      <FF label="Remark"><input className="mac-input" value={v.remark} onChange={e=>s('remark',e.target.value)} placeholder="Optional note"/></FF>
    </div>
  );
}

function ProjectDetail({proj,onEdit,onAddPayment,onClose}){
  const [showPay,setShowPay]=useState(true);
  const paid=(proj.payments||[]).reduce((s,p)=>s+(+p.amount||0),0);
  const pct=proj.valuation?Math.round((paid/+proj.valuation)*100):0;
  const rem=Math.max(0,+proj.valuation-paid);
  const payStatus=pct>=100?'Completed':pct>0?'Partial':'Pending';
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:14}}>
        <div style={{width:48,height:48,borderRadius:14,background:'linear-gradient(135deg,rgba(175,82,222,0.15),rgba(175,82,222,0.08))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:700,color:'#AF52DE',flexShrink:0}}>
          {proj.projectName.charAt(0)}
        </div>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontSize:15.5,fontWeight:660,color:'#1D1D1F',letterSpacing:'-0.3px'}}>{proj.projectName}</span>
            <Badge color={getStatusColor(proj.status)}>{proj.status}</Badge>
          </div>
          <div style={{fontSize:12.5,color:'#6E6E73',marginTop:2}}>{proj.clientName} · {proj.companyName}</div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {[[User,'Handled By',proj.handledBy],[Calendar,'Start Date',proj.startDate],[Calendar,'Due Date',proj.dueDate],[Calendar,'Next Payment',proj.nextPaymentDue||'—']].map(([Icon,l,v])=>(
          <div key={l} style={{display:'flex',gap:8,alignItems:'flex-start'}}>
            <Icon size={12} color="#AEAEB2" style={{marginTop:2,flexShrink:0}}/>
            <div><div style={{fontSize:10,color:'#AEAEB2',textTransform:'uppercase',letterSpacing:'0.4px',fontWeight:500}}>{l}</div><div style={{fontSize:12.5,color:'#1D1D1F',marginTop:1}}>{v||'—'}</div></div>
          </div>
        ))}
      </div>
      {(proj.assignedEmployees||[]).length > 0 && (
        <div>
          <div style={{fontSize:12,fontWeight:600,color:'#3C3C43',marginBottom:8}}>Team</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {proj.assignedEmployees.map(e=>(
              <div key={e.id} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:20,background:'rgba(52,199,89,0.07)',border:'1px solid rgba(52,199,89,0.15)'}}>
                <div style={{width:18,height:18,borderRadius:'50%',background:'linear-gradient(135deg,#34C759,#30D158)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:7,fontWeight:700,color:'#fff',flexShrink:0}}>
                  {e.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <span style={{fontSize:12,fontWeight:500,color:'#1D1D1F'}}>{e.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{padding:'14px 16px',borderRadius:14,background:'rgba(0,0,0,0.025)',border:'1px solid rgba(0,0,0,0.06)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <span style={{fontSize:12.5,fontWeight:600,color:'#3C3C43'}}>Payment Progress</span>
          <div style={{display:'flex',alignItems:'center',gap:8}}><Badge color={getStatusColor(payStatus)}>{payStatus}</Badge><span style={{fontSize:14,fontWeight:700,color:'#1D1D1F'}}>{pct}%</span></div>
        </div>
        <div style={{height:6,borderRadius:100,background:'rgba(0,0,0,0.08)',overflow:'hidden',marginBottom:12}}>
          <div style={{height:'100%',borderRadius:100,background:'linear-gradient(90deg,#0071E3,#0A84FF)',width:`${Math.min(pct,100)}%`,transition:'width 0.4s ease'}}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
          {[['Total Value',fmt(proj.valuation),'#1D1D1F','rgba(0,0,0,0.025)'],['Total Paid',fmt(paid),'#34C759','rgba(52,199,89,0.07)'],['Remaining',fmt(rem),'#FF9500','rgba(255,149,0,0.07)']].map(([l,v,c,bg])=>(
            <div key={l} style={{textAlign:'center',padding:'8px',borderRadius:10,background:bg}}>
              <div style={{fontSize:10.5,color:'#AEAEB2',marginBottom:3}}>{l}</div>
              <div style={{fontSize:13,fontWeight:680,color:c,letterSpacing:'-0.3px'}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      {(proj.milestones||[]).length>0&&(
        <div>
          <div style={{fontSize:12,fontWeight:600,color:'#3C3C43',marginBottom:8}}>Payment Milestones</div>
          {proj.milestones.map((m,i)=>{
            const mAmt=Math.round((m.percent/100)*+proj.valuation);
            return(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',borderRadius:9,background:'rgba(0,0,0,0.025)',marginBottom:5}}>
                <span style={{fontSize:12.5,color:'#3C3C43'}}>{m.label}</span>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:11.5,color:'#6E6E73'}}>{fmt(mAmt)}</span>
                  <Badge color="blue">{m.percent}%</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div>
        <button onClick={()=>setShowPay(h=>!h)} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',cursor:'pointer',fontSize:12.5,fontWeight:600,color:'#3C3C43',marginBottom:8}}>
          {showPay?<ChevronDown size={13}/>:<ChevronRight size={13}/>} Payment History ({(proj.payments||[]).length})
        </button>
        {showPay&&(
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {(proj.payments||[]).length===0?<p style={{fontSize:12,color:'#AEAEB2',textAlign:'center',padding:'12px 0'}}>No payments recorded</p>
              :(proj.payments||[]).map((p,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',borderRadius:10,background:'rgba(52,199,89,0.06)',border:'1px solid rgba(52,199,89,0.12)'}}>
                  <div><div style={{fontSize:12.5,fontWeight:500,color:'#1D1D1F'}}>{p.remark||'Payment'}</div><div style={{fontSize:10.5,color:'#AEAEB2',marginTop:1}}>{p.date} · {p.method}</div></div>
                  <span style={{fontSize:13,fontWeight:680,color:'#34C759'}}>+{fmt(p.amount)}</span>
                </div>
              ))
            }
          </div>
        )}
      </div>
      <div style={{display:'flex',gap:8,paddingTop:4,borderTop:'1px solid rgba(0,0,0,0.06)'}}>
        <button onClick={onAddPayment} className="mac-btn mac-btn-secondary" style={{flex:1,fontSize:13}}><IndianRupee size={13}/> Add Payment</button>
        <button onClick={onEdit} className="mac-btn mac-btn-secondary" style={{flex:1,fontSize:13}}><Edit2 size={13}/> Edit</button>
        <button onClick={onClose} className="mac-btn mac-btn-primary" style={{flex:1,fontSize:13}}>Done</button>
      </div>
    </div>
  );
}

const statusGradients={
  'In Progress':'linear-gradient(135deg,rgba(0,113,227,0.08),rgba(10,132,255,0.05))',
  'Completed':'linear-gradient(135deg,rgba(52,199,89,0.08),rgba(48,209,88,0.05))',
  'Pending':'linear-gradient(135deg,rgba(255,204,0,0.08),rgba(255,204,0,0.04))',
  'On Hold':'linear-gradient(135deg,rgba(255,149,0,0.08),rgba(255,179,64,0.05))',
  'Cancelled':'rgba(0,0,0,0.025)',
};

export default function Projects(){
  const [projs,setProjs]       = useState([]);
  const [loading,setLoading]   = useState(true);
  const [saving,setSaving]     = useState(false);
  const [search,setSearch]     = useState('');
  const [filters,setFilters]   = useState({status:'',projectType:''});
  const [showFilters,setShowFilters] = useState(false);
  const [showAdd,setShowAdd]   = useState(false);
  const [editProj,setEditProj] = useState(null);
  const [form,setForm]         = useState(emptyProj);
  const [deleteId,setDeleteId] = useState(null);
  const [detail,setDetail]     = useState(null);
  const [showPay,setShowPay]   = useState(false);
  const [payProjId,setPayProjId] = useState(null);
  const [payForm,setPayForm]   = useState(emptyPay);
  const [auditLog,setAuditLog]   = useState([]);
  const [showAudit,setShowAudit] = useState(false);
  const [employees,setEmployees] = useState([]);

  const fetchProjs = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, emps] = await Promise.all([projectsDB.getAll(), employeesDB.getAll()]);
      setProjs(ps);
      setEmployees(emps.filter(e => e.status === 'Active'));
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjs(); }, [fetchProjs]);

  const filtered=useMemo(()=>projs.filter(p=>{
    const q=search.toLowerCase();
    return(!q||p.projectName.toLowerCase().includes(q)||p.clientName?.toLowerCase().includes(q))
      &&(!filters.status||p.status===filters.status)
      &&(!filters.projectType||p.projectType===filters.projectType);
  }),[projs,search,filters]);

  async function save(){
    if(!form.projectName||saving)return;
    setSaving(true);
    try{
      if(editProj){
        setAuditLog(l=>[{id:Date.now(),action:'Edited',name:editProj.projectName,by:'Bhargav Shah',date:today},...l]);
        const updated=await projectsDB.update(editProj.id,{...form,valuation:+form.valuation});
        setProjs(ps=>ps.map(p=>p.id===editProj.id?updated:p));
      } else {
        const created=await projectsDB.create({...form,valuation:+form.valuation,payments:[],milestones:form.milestones||[]});
        setProjs(ps=>[...ps,created]);
      }
    } catch(e){ console.error(e); }
    setSaving(false);
    setShowAdd(false);setEditProj(null);setForm(emptyProj);
  }

  async function del(id){
    const p=projs.find(x=>x.id===id);
    if(p)setAuditLog(l=>[{id:Date.now(),action:'Deleted',name:p.projectName,by:'Bhargav Shah',date:today},...l]);
    setProjs(ps=>ps.filter(x=>x.id!==id));
    if(detail?.id===id)setDetail(null);
    try{ await projectsDB.delete(id); } catch(e){ console.error(e); await fetchProjs(); }
  }

  async function addPayment(){
    if(!payForm.amount||saving)return;
    setSaving(true);
    const proj=projs.find(p=>p.id===payProjId);
    if(!proj){ setSaving(false); return; }
    const newPayments=[...(proj.payments||[]),{...payForm,amount:+payForm.amount}];
    try{
      const updated=await projectsDB.addPayment(payProjId,newPayments);
      setProjs(ps=>ps.map(p=>p.id===payProjId?updated:p));
    } catch(e){ console.error(e); }
    setSaving(false);
    setShowPay(false);setPayForm(emptyPay);
  }

  const totalVal=projs.reduce((s,p)=>s+(+p.valuation||0),0);
  const totalRec=projs.reduce((s,p)=>s+(p.payments||[]).reduce((a,py)=>a+(+py.amount||0),0),0);

  return(
    <div>
      <Header title="Projects" subtitle={`${projs.length} projects · ${projs.filter(p=>p.status==='In Progress').length} in progress`}
        actions={<div style={{display:'flex',gap:8}}>
          <button onClick={()=>setShowAudit(true)} className="mac-btn mac-btn-secondary" style={{fontSize:13}}><History size={13}/> Audit</button>
          <button onClick={()=>{setForm(emptyProj);setEditProj(null);setShowAdd(true);}} className="mac-btn mac-btn-primary" style={{fontSize:13}}><Plus size={14}/> New Project</button>
        </div>}
      />

      {loading ? <CardGridSkeleton cols={2} count={4} /> : (
        <div className="page-body">
          <div className="rg-4">
            {[
              {label:'Total Projects',value:projs.length,bg:'rgba(0,113,227,0.08)',c:'#0071E3'},
              {label:'Total Value',value:fmt(totalVal),bg:'rgba(175,82,222,0.08)',c:'#AF52DE'},
              {label:'Received',value:fmt(totalRec),bg:'rgba(52,199,89,0.08)',c:'#34C759'},
              {label:'Pending',value:fmt(totalVal-totalRec),bg:'rgba(255,149,0,0.08)',c:'#FF9500'},
            ].map(s=>(
              <div key={s.label} className="mac-card" style={{padding:'16px 18px',background:s.bg,borderColor:'rgba(0,0,0,0.06)'}}>
                <div style={{fontSize:22,fontWeight:700,color:s.c,letterSpacing:'-0.6px'}}>{s.value}</div>
                <div style={{fontSize:12,color:'#6E6E73',marginTop:3,fontWeight:500}}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div style={{flex:1,maxWidth:280}}><SearchBar value={search} onChange={setSearch} placeholder="Search projects…"/></div>
            <button onClick={()=>setShowFilters(f=>!f)} className={`mac-btn ${showFilters?'mac-btn-primary':'mac-btn-secondary'}`} style={{fontSize:13}}><Filter size={13}/> Filter</button>
          </div>
          {showFilters&&(
            <div className="mac-card" style={{padding:'14px 16px',display:'flex',gap:14}}>
              {[['Status','status',PROJECT_STATUSES],['Type','projectType',PROJECT_TYPES]].map(([label,key,opts])=>(
                <div key={key} style={{flex:1}}>
                  <label style={{display:'block',fontSize:10.5,fontWeight:600,color:'#8E8E93',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:5}}>{label}</label>
                  <select className="mac-select" style={{fontSize:13}} value={filters[key]} onChange={e=>setFilters(f=>({...f,[key]:e.target.value}))}>
                    <option value="">All</option>{opts.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          <div className="rg-2">
            {filtered.length===0?<div style={{gridColumn:'span 2',textAlign:'center',padding:'56px',color:'#AEAEB2',fontSize:13}}>No projects found</div>
              :filtered.map(p=>{
                const paid=(p.payments||[]).reduce((s,py)=>s+(+py.amount||0),0);
                const pct=p.valuation?Math.round((paid/+p.valuation)*100):0;
                const rem=Math.max(0,+p.valuation-paid);
                const isOverdue=p.dueDate&&p.dueDate<today&&p.status!=='Completed'&&p.status!=='Cancelled';
                return(
                  <div key={p.id} style={{background:statusGradients[p.status]||'#fff',border:'1px solid rgba(0,0,0,0.07)',borderRadius:16,padding:20,cursor:'pointer',transition:'box-shadow 0.15s',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}
                    onClick={()=>setDetail(p)}
                    onMouseEnter={ev=>ev.currentTarget.style.boxShadow='0 6px 24px rgba(0,0,0,0.1)'}
                    onMouseLeave={ev=>ev.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'}
                  >
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                      <div style={{flex:1,minWidth:0,paddingRight:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap',marginBottom:3}}>
                          <span style={{fontSize:13.5,fontWeight:620,color:'#1D1D1F',letterSpacing:'-0.2px'}}>{p.projectName}</span>
                          <Badge color={getStatusColor(p.status)}>{p.status}</Badge>
                          {isOverdue&&<Badge color="red">Overdue</Badge>}
                        </div>
                        <div style={{fontSize:12,color:'#6E6E73'}}>{p.clientName} · {p.projectType}</div>
                      </div>
                      <div onClick={ev=>ev.stopPropagation()} style={{display:'flex',gap:4,flexShrink:0}}>
                        <button onClick={()=>{setPayProjId(p.id);setShowPay(true);}} style={{width:28,height:28,borderRadius:8,background:'rgba(52,199,89,0.1)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><IndianRupee size={13} color="#34C759"/></button>
                        <button onClick={()=>{setEditProj(p);setForm(p);setShowAdd(true);}} style={{width:28,height:28,borderRadius:8,background:'rgba(0,0,0,0.06)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Edit2 size={13} color="#6E6E73"/></button>
                        <button onClick={()=>setDeleteId(p.id)} style={{width:28,height:28,borderRadius:8,background:'rgba(255,59,48,0.08)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Trash2 size={13} color="#FF3B30"/></button>
                      </div>
                    </div>
                    <div style={{marginBottom:12}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                        <span style={{fontSize:11.5,color:'#6E6E73'}}>Payment progress</span>
                        <span style={{fontSize:12,fontWeight:600,color:'#1D1D1F'}}>{pct}%</span>
                      </div>
                      <div style={{height:5,borderRadius:100,background:'rgba(0,0,0,0.08)',overflow:'hidden'}}>
                        <div style={{height:'100%',borderRadius:100,background:'linear-gradient(90deg,#0071E3,#0A84FF)',width:`${Math.min(pct,100)}%`,transition:'width 0.4s ease'}}/>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                      {[['Value',fmt(p.valuation),'#1D1D1F'],['Paid',fmt(paid),'#34C759'],['Due',fmt(rem),'#FF9500']].map(([l,v,c])=>(
                        <div key={l} style={{textAlign:'center',padding:'7px 0'}}>
                          <div style={{fontSize:10.5,color:'#AEAEB2',marginBottom:2}}>{l}</div>
                          <div style={{fontSize:12.5,fontWeight:680,color:c,letterSpacing:'-0.2px'}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:10,borderTop:'1px solid rgba(0,0,0,0.06)',marginTop:6}}>
                      <span style={{fontSize:11,color:'#8E8E93'}}>Due: {p.dueDate||'—'}</span>
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        {(p.assignedEmployees||[]).slice(0,3).map((e,i)=>(
                          <div key={e.id} title={e.name} style={{width:20,height:20,borderRadius:'50%',background:'linear-gradient(135deg,#34C759,#30D158)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:7,fontWeight:700,color:'#fff',border:'1.5px solid #fff',marginLeft:i?-6:0,zIndex:i}}>
                            {e.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                          </div>
                        ))}
                        {(p.assignedEmployees||[]).length > 3 && (
                          <span style={{fontSize:10,color:'#AEAEB2',marginLeft:2}}>+{(p.assignedEmployees||[]).length-3}</span>
                        )}
                        {!(p.assignedEmployees||[]).length && <span style={{fontSize:11,color:'#8E8E93'}}>By: {p.handledBy}</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      <Modal isOpen={showAdd} onClose={()=>{setShowAdd(false);setEditProj(null);setForm(emptyProj);}} title={editProj?'Edit Project':'New Project'} size="xl">
        <ProjectForm v={form} onChange={setForm} employees={employees}/>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20,paddingTop:16,borderTop:'1px solid rgba(0,0,0,0.07)'}}>
          <button onClick={()=>{setShowAdd(false);setEditProj(null);}} className="mac-btn mac-btn-secondary" style={{fontSize:13}}>Cancel</button>
          <button onClick={save} disabled={saving} className="mac-btn mac-btn-primary" style={{fontSize:13}}>{saving?'Saving…':editProj?'Save Changes':'Create Project'}</button>
        </div>
      </Modal>

      <Modal isOpen={!!detail} onClose={()=>setDetail(null)} title="Project Details" size="lg">
        {detail&&<ProjectDetail proj={detail} onClose={()=>setDetail(null)} onEdit={()=>{setEditProj(detail);setForm(detail);setDetail(null);setShowAdd(true);}} onAddPayment={()=>{setPayProjId(detail.id);setDetail(null);setShowPay(true);}}/>}
      </Modal>

      <Modal isOpen={showPay} onClose={()=>setShowPay(false)} title="Add Payment Entry" size="sm">
        <PaymentForm v={payForm} onChange={setPayForm}/>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20,paddingTop:16,borderTop:'1px solid rgba(0,0,0,0.07)'}}>
          <button onClick={()=>setShowPay(false)} className="mac-btn mac-btn-secondary" style={{fontSize:13}}>Cancel</button>
          <button onClick={addPayment} disabled={saving} className="mac-btn mac-btn-primary" style={{fontSize:13}}>{saving?'Saving…':'Save Payment'}</button>
        </div>
      </Modal>

      <Modal isOpen={showAudit} onClose={()=>setShowAudit(false)} title="Project Audit Log" size="md">
        {auditLog.length===0?<p style={{textAlign:'center',color:'#AEAEB2',padding:'32px 0',fontSize:13}}>No entries yet</p>
          :<div style={{display:'flex',flexDirection:'column',gap:6}}>
            {auditLog.map(e=>(
              <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',borderRadius:10,background:'rgba(0,0,0,0.025)'}}>
                <div style={{display:'flex',gap:8,alignItems:'center'}}><Badge color={e.action==='Deleted'?'red':'blue'}>{e.action}</Badge><span style={{fontSize:12.5,color:'#1D1D1F'}}>{e.name}</span></div>
                <span style={{fontSize:11,color:'#AEAEB2'}}>{e.date} · {e.by}</span>
              </div>
            ))}
          </div>
        }
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={()=>del(deleteId)} title="Delete Project" message="This will permanently delete the project and all payment records."/>
    </div>
  );
}
