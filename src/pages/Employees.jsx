import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Badge, { getStatusColor } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import SearchBar from '../components/ui/SearchBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { CardGridSkeleton } from '../components/ui/LoadingSpinner';
import { employeesDB } from '../lib/db';
import { supabaseAuth } from '../lib/supabase';
import { DEPARTMENTS, EMPLOYMENT_TYPES, SALARY_TYPES, PAYMENT_METHODS } from '../data/mockData';
import { Plus, Edit2, Trash2, Filter, History, AlertCircle, Banknote, ChevronDown, ChevronRight, Phone, Mail, MapPin, Calendar, Clock, X, KeyRound, Copy, CheckCheck } from 'lucide-react';

const DEFAULT_PASSWORD = 'Codelix@1234';
const today = new Date().toISOString().split('T')[0];
const fmt = n => n ? '₹' + Number(n).toLocaleString('en-IN') : '₹0';

const emptyEmp = { name:'',mobile:'',email:'',address:'',role:'',department:'Tech',joiningDate:today,employmentType:'Full-time',status:'Active',salaryType:'Monthly',salaryAmount:'',paymentCycle:'Monthly',bankDetails:'',upiId:'',salaryHistory:[] };
const emptySal = { month:'',paid:'',date:today,method:'Bank Transfer',remark:'' };

const FF=({label,children,required})=>(
  <div>
    <label style={{display:'block',fontSize:11.5,fontWeight:550,color:'#6E6E73',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.4px'}}>
      {label}{required&&<span style={{color:'#FF3B30',marginLeft:2}}>*</span>}
    </label>
    {children}
  </div>
);

function EmpForm({v,s}){
  return(
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px 16px'}}>
      <FF label="Full Name" required><input className="mac-input" value={v.name} onChange={e=>s('name',e.target.value)} placeholder="Employee name"/></FF>
      <FF label="Mobile"><input className="mac-input" value={v.mobile} onChange={e=>s('mobile',e.target.value)} placeholder="10-digit number"/></FF>
      <FF label="Email"><input className="mac-input" type="email" value={v.email} onChange={e=>s('email',e.target.value)} placeholder="email@codelix.in"/></FF>
      <FF label="Address"><input className="mac-input" value={v.address} onChange={e=>s('address',e.target.value)} placeholder="City, State"/></FF>
      <FF label="Role / Designation" required><input className="mac-input" value={v.role} onChange={e=>s('role',e.target.value)} placeholder="e.g. Full Stack Developer"/></FF>
      <FF label="Department"><select className="mac-select" value={v.department} onChange={e=>s('department',e.target.value)}>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></FF>
      <FF label="Joining Date"><input className="mac-input" type="date" value={v.joiningDate} onChange={e=>s('joiningDate',e.target.value)}/></FF>
      <FF label="Employment Type"><select className="mac-select" value={v.employmentType} onChange={e=>s('employmentType',e.target.value)}>{EMPLOYMENT_TYPES.map(t=><option key={t}>{t}</option>)}</select></FF>
      <FF label="Status"><select className="mac-select" value={v.status} onChange={e=>s('status',e.target.value)}>{['Active','Inactive','Left'].map(x=><option key={x}>{x}</option>)}</select></FF>
      <FF label="Salary Type"><select className="mac-select" value={v.salaryType} onChange={e=>s('salaryType',e.target.value)}>{SALARY_TYPES.map(x=><option key={x}>{x}</option>)}</select></FF>
      <FF label="Salary Amount (₹)"><input className="mac-input" type="number" value={v.salaryAmount} onChange={e=>s('salaryAmount',e.target.value)} placeholder="0"/></FF>
      <FF label="Payment Cycle"><select className="mac-select" value={v.paymentCycle} onChange={e=>s('paymentCycle',e.target.value)}>{['Monthly','Weekly','Custom'].map(x=><option key={x}>{x}</option>)}</select></FF>
      <FF label="UPI ID"><input className="mac-input" value={v.upiId} onChange={e=>s('upiId',e.target.value)} placeholder="name@upi"/></FF>
      <FF label="Bank Details"><input className="mac-input" value={v.bankDetails} onChange={e=>s('bankDetails',e.target.value)} placeholder="Account / IFSC (optional)"/></FF>
    </div>
  );
}

function SalaryForm({v,onChange}){
  const s=(k,val)=>onChange({...v,[k]:val});
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <FF label="Month" required><input className="mac-input" value={v.month} onChange={e=>s('month',e.target.value)} placeholder="e.g. April 2025"/></FF>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <FF label="Amount Paid (₹)" required><input className="mac-input" type="number" value={v.paid} onChange={e=>s('paid',e.target.value)} placeholder="0"/></FF>
        <FF label="Payment Date"><input className="mac-input" type="date" value={v.date} onChange={e=>s('date',e.target.value)}/></FF>
      </div>
      <FF label="Payment Method"><select className="mac-select" value={v.method} onChange={e=>s('method',e.target.value)}>{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></FF>
      <FF label="Remark"><input className="mac-input" value={v.remark} onChange={e=>s('remark',e.target.value)} placeholder="Optional"/></FF>
    </div>
  );
}

function EmpDetail({emp,onEdit,onAddSalary,onClose}){
  const [showHist,setShowHist]=useState(false);
  const totalPaid=(emp.salaryHistory||[]).reduce((s,h)=>s+(+h.paid||0),0);
  const isPending=emp.salaryHistory?.[0]?.paid===0;
  const initials=emp.name.split(' ').map(n=>n[0]).join('').slice(0,2);
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:14}}>
        <div style={{width:52,height:52,borderRadius:14,background:'linear-gradient(135deg,#0071E3,#0A84FF)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:17,fontWeight:700,flexShrink:0}}>{initials}</div>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontSize:16,fontWeight:660,color:'#1D1D1F',letterSpacing:'-0.3px'}}>{emp.name}</span>
            <Badge color={getStatusColor(emp.status)}>{emp.status}</Badge>
            <Badge color={getStatusColor(emp.employmentType)}>{emp.employmentType}</Badge>
          </div>
          <div style={{fontSize:13,color:'#6E6E73',marginTop:2}}>{emp.role} · {emp.department}</div>
          <div style={{fontSize:11,color:'#AEAEB2',marginTop:1}}>ID: {emp.empId}</div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {[[Phone,'Mobile',emp.mobile],[Mail,'Email',emp.email],[MapPin,'Address',emp.address],[Calendar,'Joined',emp.joiningDate],[Banknote,'Salary',`${fmt(emp.salaryAmount)} / ${emp.salaryType}`],[Clock,'Pay Cycle',emp.paymentCycle]].map(([Icon,label,value])=>(
          <div key={label} style={{display:'flex',gap:8,alignItems:'flex-start'}}>
            <Icon size={12} color="#AEAEB2" style={{marginTop:2,flexShrink:0}}/>
            <div><div style={{fontSize:10,color:'#AEAEB2',textTransform:'uppercase',letterSpacing:'0.4px',fontWeight:500}}>{label}</div><div style={{fontSize:12.5,color:'#1D1D1F',marginTop:1}}>{value||'—'}</div></div>
          </div>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr'+(isPending?' 1fr':''),gap:10}}>
        <div style={{padding:'12px 14px',borderRadius:12,background:'rgba(0,113,227,0.07)',border:'1px solid rgba(0,113,227,0.13)'}}>
          <div style={{fontSize:10,color:'#AEAEB2',textTransform:'uppercase',letterSpacing:'0.4px',fontWeight:500,marginBottom:4}}>Monthly Salary</div>
          <div style={{fontSize:16,fontWeight:680,color:'#0071E3',letterSpacing:'-0.3px'}}>{fmt(emp.salaryAmount)}</div>
        </div>
        <div style={{padding:'12px 14px',borderRadius:12,background:'rgba(52,199,89,0.07)',border:'1px solid rgba(52,199,89,0.13)'}}>
          <div style={{fontSize:10,color:'#AEAEB2',textTransform:'uppercase',letterSpacing:'0.4px',fontWeight:500,marginBottom:4}}>Total Paid</div>
          <div style={{fontSize:16,fontWeight:680,color:'#34C759',letterSpacing:'-0.3px'}}>{fmt(totalPaid)}</div>
        </div>
        {isPending&&<div style={{padding:'12px 14px',borderRadius:12,background:'rgba(255,149,0,0.07)',border:'1px solid rgba(255,149,0,0.15)'}}>
          <div style={{fontSize:10,color:'#FF9500',textTransform:'uppercase',letterSpacing:'0.4px',fontWeight:500,marginBottom:4}}>Status</div>
          <div style={{fontSize:13,fontWeight:650,color:'#FF9500'}}>Pending</div>
        </div>}
      </div>
      <div>
        <button onClick={()=>setShowHist(h=>!h)} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',cursor:'pointer',fontSize:12.5,fontWeight:600,color:'#3C3C43',marginBottom:8}}>
          {showHist?<ChevronDown size={13}/>:<ChevronRight size={13}/>} Salary History ({(emp.salaryHistory||[]).length})
        </button>
        {showHist&&(
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {(emp.salaryHistory||[]).length===0?<p style={{fontSize:12,color:'#AEAEB2',textAlign:'center',padding:'12px 0'}}>No records</p>
              :(emp.salaryHistory||[]).map((h,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',borderRadius:10,background:'rgba(0,0,0,0.025)',border:'1px solid rgba(0,0,0,0.05)'}}>
                  <div><div style={{fontSize:12.5,fontWeight:500,color:'#1D1D1F'}}>{h.month}</div><div style={{fontSize:10.5,color:'#AEAEB2',marginTop:1}}>{h.date} · {h.method}</div></div>
                  {+h.paid>0?<span style={{fontSize:13,fontWeight:650,color:'#34C759'}}>{fmt(h.paid)}</span>:<Badge color="orange">Pending</Badge>}
                </div>
              ))
            }
          </div>
        )}
      </div>
      <div style={{display:'flex',gap:8,paddingTop:4,borderTop:'1px solid rgba(0,0,0,0.06)'}}>
        <button onClick={onAddSalary} className="mac-btn mac-btn-secondary" style={{flex:1,fontSize:13}}><Banknote size={13}/> Add Salary</button>
        <button onClick={onEdit} className="mac-btn mac-btn-secondary" style={{flex:1,fontSize:13}}><Edit2 size={13}/> Edit</button>
        <button onClick={onClose} className="mac-btn mac-btn-primary" style={{flex:1,fontSize:13}}>Done</button>
      </div>
    </div>
  );
}

export default function Employees(){
  const [emps,setEmps]         = useState([]);
  const [loading,setLoading]   = useState(true);
  const [saving,setSaving]     = useState(false);
  const [search,setSearch]     = useState('');
  const [filters,setFilters]   = useState({status:'',department:'',employmentType:''});
  const [showFilters,setShowFilters] = useState(false);
  const [showAdd,setShowAdd]   = useState(false);
  const [editEmp,setEditEmp]   = useState(null);
  const [form,setForm]         = useState(emptyEmp);
  const [deleteId,setDeleteId] = useState(null);
  const [detail,setDetail]     = useState(null);
  const [showSal,setShowSal]   = useState(false);
  const [salEmpId,setSalEmpId] = useState(null);
  const [salForm,setSalForm]   = useState(emptySal);
  const [auditLog,setAuditLog] = useState([]);
  const [showAudit,setShowAudit] = useState(false);
  const [createdCreds,setCreatedCreds] = useState(null); // { name, email } — shown after employee creation
  const [copied,setCopied]     = useState(false);

  const s=(k,v)=>setForm(f=>({...f,[k]:v}));

  const fetchEmps = useCallback(async () => {
    setLoading(true);
    try { setEmps(await employeesDB.getAll()); } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEmps(); }, [fetchEmps]);

  const filtered=useMemo(()=>emps.filter(e=>{
    const q=search.toLowerCase();
    return(!q||e.name.toLowerCase().includes(q)||e.role?.toLowerCase().includes(q))
      &&(!filters.status||e.status===filters.status)
      &&(!filters.department||e.department===filters.department)
      &&(!filters.employmentType||e.employmentType===filters.employmentType);
  }),[emps,search,filters]);

  async function save(){
    if(!form.name||saving)return;
    setSaving(true);
    try{
      if(editEmp){
        setAuditLog(l=>[{id:Date.now(),action:'Edited',name:editEmp.name,by:'Bhargav Shah',date:today},...l]);
        const updated=await employeesDB.update(editEmp.id,form);
        setEmps(es=>es.map(e=>e.id===editEmp.id?updated:e));
      } else {
        const count=await employeesDB.count();
        const empId=`CLX${String(count+1).padStart(3,'0')}`;
        const created=await employeesDB.create({...form,empId,salaryHistory:[]});
        setEmps(es=>[...es,created]);

        // ── Create login account if email provided ──────────────────
        // Uses a separate client (persistSession:false) so the current
        // partner session is never touched by this signUp call.
        if(form.email){
          const { error: authErr } = await supabaseAuth.auth.signUp({
            email: form.email,
            password: DEFAULT_PASSWORD,
          });
          if(authErr){
            console.warn('Could not create auth account:', authErr.message);
            // Still show the modal — employee DB record was created
            setCreatedCreds({ name: form.name, email: form.email, authError: authErr.message });
          } else {
            setCreatedCreds({ name: form.name, email: form.email, authError: null });
          }
        }
      }
    } catch(e){ console.error(e); }
    setSaving(false);
    setShowAdd(false);setEditEmp(null);setForm(emptyEmp);
  }

  async function copyPassword(){
    try{ await navigator.clipboard.writeText(DEFAULT_PASSWORD); setCopied(true); setTimeout(()=>setCopied(false),2000); } catch{}
  }

  async function del(id){
    const e=emps.find(x=>x.id===id);
    if(e)setAuditLog(l=>[{id:Date.now(),action:'Deleted',name:e.name,by:'Bhargav Shah',date:today},...l]);
    setEmps(es=>es.filter(x=>x.id!==id));
    if(detail?.id===id)setDetail(null);
    try{ await employeesDB.delete(id); } catch(err){ console.error(err); await fetchEmps(); }
  }

  async function addSalary(){
    if(!salForm.month||saving)return;
    setSaving(true);
    const emp=emps.find(e=>e.id===salEmpId);
    if(!emp){ setSaving(false); return; }
    const newHistory=[{...salForm,paid:+salForm.paid},...(emp.salaryHistory||[])];
    try{
      const updated=await employeesDB.addSalary(salEmpId,newHistory);
      setEmps(es=>es.map(e=>e.id===salEmpId?updated:e));
    } catch(e){ console.error(e); }
    setSaving(false);
    setShowSal(false);setSalForm(emptySal);
  }

  const pending=emps.filter(e=>e.status==='Active'&&e.salaryType==='Monthly'&&e.salaryHistory?.[0]?.paid===0);
  const deptColors={Tech:'rgba(0,113,227,0.09)',Design:'rgba(175,82,222,0.09)',Sales:'rgba(255,149,0,0.09)',Ops:'rgba(52,199,89,0.09)'};
  const deptText={Tech:'#0071E3',Design:'#AF52DE',Sales:'#FF9500',Ops:'#34C759'};

  return(
    <div>
      <Header title="Employees" subtitle={`${emps.filter(e=>e.status==='Active').length} active · ${pending.length>0?`${pending.length} salary pending`:'All salaries paid'}`}
        actions={<div style={{display:'flex',gap:8}}>
          <button onClick={()=>setShowAudit(true)} className="mac-btn mac-btn-secondary" style={{fontSize:13}}><History size={13}/> Audit</button>
          <button onClick={()=>{setForm(emptyEmp);setEditEmp(null);setShowAdd(true);}} className="mac-btn mac-btn-primary" style={{fontSize:13}}><Plus size={14}/> Add Employee</button>
        </div>}
      />

      {loading ? <CardGridSkeleton cols={3} count={6} /> : (
        <div className="page-body">
          {pending.length>0&&(
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',borderRadius:10,background:'rgba(255,149,0,0.07)',border:'1px solid rgba(255,149,0,0.15)'}}>
              <AlertCircle size={13} color="#FF9500"/><span style={{fontSize:12.5,color:'#FF9500',fontWeight:500}}>{pending.length} employee{pending.length>1?'s':''} have pending salary — {pending.map(e=>e.name).join(', ')}</span>
            </div>
          )}
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{flex:1,maxWidth:280}}><SearchBar value={search} onChange={setSearch} placeholder="Search employees…"/></div>
            <button onClick={()=>setShowFilters(f=>!f)} className={`mac-btn ${showFilters?'mac-btn-primary':'mac-btn-secondary'}`} style={{fontSize:13}}><Filter size={13}/> Filter</button>
          </div>
          {showFilters&&(
            <div className="mac-card" style={{padding:'14px 16px',display:'flex',gap:14}}>
              {[['Status','status',['Active','Inactive','Left']],['Dept','department',DEPARTMENTS],['Type','employmentType',EMPLOYMENT_TYPES]].map(([label,key,opts])=>(
                <div key={key} style={{flex:1}}>
                  <label style={{display:'block',fontSize:10.5,fontWeight:600,color:'#8E8E93',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:5}}>{label}</label>
                  <select className="mac-select" style={{fontSize:13}} value={filters[key]} onChange={e=>setFilters(f=>({...f,[key]:e.target.value}))}>
                    <option value="">All</option>{opts.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          <div className="rg-3">
            {filtered.length===0
              ?<div style={{gridColumn:'span 3',textAlign:'center',padding:'56px',color:'#AEAEB2',fontSize:13}}>No employees found</div>
              :filtered.map(e=>{
                const isPend=e.status==='Active'&&e.salaryType==='Monthly'&&e.salaryHistory?.[0]?.paid===0;
                const initials=e.name.split(' ').map(n=>n[0]).join('').slice(0,2);
                return(
                  <div key={e.id} className="mac-card" style={{padding:18,cursor:'pointer',transition:'box-shadow 0.15s'}}
                    onClick={()=>setDetail(e)}
                    onMouseEnter={ev=>ev.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.1)'}
                    onMouseLeave={ev=>ev.currentTarget.style.boxShadow=''}
                  >
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#0071E3,#0A84FF)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13,fontWeight:700,flexShrink:0}}>{initials}</div>
                        <div>
                          <div style={{fontSize:13.5,fontWeight:600,color:'#1D1D1F',letterSpacing:'-0.2px'}}>{e.name}</div>
                          <div style={{fontSize:11.5,color:'#6E6E73',marginTop:1}}>{e.role}</div>
                        </div>
                      </div>
                      <div onClick={ev=>ev.stopPropagation()} style={{display:'flex',gap:3}}>
                        <button onClick={()=>{setEditEmp(e);setForm(e);setShowAdd(true);}} style={{width:26,height:26,borderRadius:7,background:'rgba(0,0,0,0.06)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Edit2 size={12} color="#6E6E73"/></button>
                        <button onClick={()=>setDeleteId(e.id)} style={{width:26,height:26,borderRadius:7,background:'rgba(255,59,48,0.08)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Trash2 size={12} color="#FF3B30"/></button>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}>
                      <Badge color={getStatusColor(e.status)}>{e.status}</Badge>
                      <span style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:100,fontSize:11,fontWeight:500,background:deptColors[e.department]||'rgba(0,0,0,0.05)',color:deptText[e.department]||'#6E6E73'}}>{e.department}</span>
                      <Badge color={getStatusColor(e.employmentType)}>{e.employmentType}</Badge>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid rgba(0,0,0,0.05)'}}>
                      <span style={{fontSize:11,color:'#8E8E93'}}>{e.empId}</span>
                      <span style={{fontSize:12,fontWeight:600,color:'#1D1D1F'}}>{fmt(e.salaryAmount)}<span style={{fontSize:10.5,color:'#8E8E93',fontWeight:400}}>/{e.salaryType==='Monthly'?'mo':e.salaryType}</span></span>
                    </div>
                    {isPend&&<div style={{display:'flex',alignItems:'center',gap:5,padding:'6px 9px',borderRadius:8,background:'rgba(255,149,0,0.08)',marginTop:6}}>
                      <AlertCircle size={11} color="#FF9500"/><span style={{fontSize:11,color:'#FF9500',fontWeight:500}}>Salary Pending</span>
                    </div>}
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      <Modal isOpen={showAdd} onClose={()=>{setShowAdd(false);setEditEmp(null);setForm(emptyEmp);}} title={editEmp?'Edit Employee':'Add Employee'} size="xl">
        <EmpForm v={form} s={s}/>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20,paddingTop:16,borderTop:'1px solid rgba(0,0,0,0.07)'}}>
          <button onClick={()=>{setShowAdd(false);setEditEmp(null);}} className="mac-btn mac-btn-secondary" style={{fontSize:13}}>Cancel</button>
          <button onClick={save} disabled={saving} className="mac-btn mac-btn-primary" style={{fontSize:13}}>{saving?'Saving…':editEmp?'Save Changes':'Add Employee'}</button>
        </div>
      </Modal>

      <Modal isOpen={!!detail} onClose={()=>setDetail(null)} title="Employee Details" size="lg">
        {detail&&<EmpDetail emp={detail} onClose={()=>setDetail(null)} onEdit={()=>{setEditEmp(detail);setForm(detail);setDetail(null);setShowAdd(true);}} onAddSalary={()=>{setSalEmpId(detail.id);setDetail(null);setShowSal(true);}}/>}
      </Modal>

      <Modal isOpen={showSal} onClose={()=>setShowSal(false)} title="Add Salary Record" size="sm">
        <SalaryForm v={salForm} onChange={setSalForm}/>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20,paddingTop:16,borderTop:'1px solid rgba(0,0,0,0.07)'}}>
          <button onClick={()=>setShowSal(false)} className="mac-btn mac-btn-secondary" style={{fontSize:13}}>Cancel</button>
          <button onClick={addSalary} disabled={saving} className="mac-btn mac-btn-primary" style={{fontSize:13}}>{saving?'Saving…':'Save Record'}</button>
        </div>
      </Modal>

      <Modal isOpen={showAudit} onClose={()=>setShowAudit(false)} title="Audit Log" size="md">
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

      <ConfirmDialog isOpen={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={()=>del(deleteId)} title="Delete Employee" message="This will permanently delete the employee and all salary records."/>

      {/* ── Login Credentials Created ──────────────────────────────── */}
      <Modal isOpen={!!createdCreds} onClose={()=>setCreatedCreds(null)} title="Login Account Created" size="sm">
        {createdCreds && (
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {/* Success banner */}
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:12,background:'rgba(52,199,89,0.08)',border:'1px solid rgba(52,199,89,0.18)'}}>
              <div style={{width:32,height:32,borderRadius:9,background:'linear-gradient(135deg,#34C759,#30D158)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <KeyRound size={14} color="#fff"/>
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:'#1D1D1F'}}>Account created for {createdCreds.name}</div>
                <div style={{fontSize:11.5,color:'#6E6E73',marginTop:1}}>Share these credentials with the employee</div>
              </div>
            </div>

            {/* Email */}
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:600,color:'#8E8E93',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:5}}>Email</label>
              <div style={{padding:'10px 12px',borderRadius:10,background:'rgba(0,0,0,0.03)',border:'1px solid rgba(0,0,0,0.07)',fontSize:13.5,color:'#1D1D1F',fontWeight:450}}>
                {createdCreds.email}
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:600,color:'#8E8E93',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:5}}>Default Password</label>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{flex:1,padding:'10px 12px',borderRadius:10,background:'rgba(0,0,0,0.03)',border:'1px solid rgba(0,0,0,0.07)',fontSize:14,color:'#1D1D1F',fontFamily:'monospace',letterSpacing:'0.5px'}}>
                  {DEFAULT_PASSWORD}
                </div>
                <button onClick={copyPassword} style={{width:36,height:36,borderRadius:10,background: copied?'rgba(52,199,89,0.1)':'rgba(0,0,0,0.05)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s'}}>
                  {copied ? <CheckCheck size={14} color="#34C759"/> : <Copy size={14} color="#6E6E73"/>}
                </button>
              </div>
            </div>

            {/* Auth error or success note */}
            {createdCreds?.authError ? (
              <div style={{padding:'10px 12px',borderRadius:10,background:'rgba(255,59,48,0.06)',border:'1px solid rgba(255,59,48,0.15)',fontSize:12,color:'#FF3B30',lineHeight:1.5}}>
                ⚠ Employee record saved, but login account failed: {createdCreds.authError}. You can try again or ask them to sign up themselves.
              </div>
            ) : (
              <div style={{padding:'10px 12px',borderRadius:10,background:'rgba(255,149,0,0.06)',border:'1px solid rgba(255,149,0,0.15)',fontSize:12,color:'#FF9500',lineHeight:1.5}}>
                ⚠ Ask the employee to change their password after first login. They will see a "No Access" screen until you grant them features.
              </div>
            )}

            <div style={{paddingTop:4}}>
              <button onClick={()=>setCreatedCreds(null)} className="mac-btn mac-btn-primary" style={{width:'100%',fontSize:13}}>Done</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
