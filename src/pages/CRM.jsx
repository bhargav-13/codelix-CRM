import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Badge, { getStatusColor } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import SearchBar from '../components/ui/SearchBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { PageLoader } from '../components/ui/CodelixLoader';
import { clientsDB } from '../lib/db';
import {
  PROJECT_TYPES, SOURCES, CLIENT_STATUSES, PRIORITIES, PARTNERS,
} from '../data/mockData';
import {
  Plus, Filter, Phone, Mail, MapPin, Calendar, Building2, User, Clock,
  Edit2, Trash2, MessageSquarePlus, History, AlertCircle,
  ArrowRight, X,
} from 'lucide-react';

const today = new Date().toISOString().split('T')[0];
const fmt = n => n ? '₹' + Number(n).toLocaleString('en-IN') : '—';

const emptyClient = {
  clientName:'', companyName:'', contact:'', email:'', address:'',
  projectType:'Website Development', source:'Referral', status:'Cold', proposalValue:'',
  finalPrice:'', priority:'Medium', createdBy:'Bhargav Thesiya', nextFollowup:'', followupHistory:[],
};

function FF({ label, children, required }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:11.5, fontWeight:550, color:'#6E6E73', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.4px' }}>
        {label}{required && <span style={{ color:'#FF3B30', marginLeft:2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function ClientForm({ v, set }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 16px' }}>
      <FF label="Client Name" required><input className="mac-input" value={v.clientName} onChange={e=>set('clientName',e.target.value)} placeholder="Full name" /></FF>
      <FF label="Company Name"><input className="mac-input" value={v.companyName} onChange={e=>set('companyName',e.target.value)} placeholder="Company" /></FF>
      <FF label="Contact Number"><input className="mac-input" value={v.contact} onChange={e=>set('contact',e.target.value)} placeholder="10-digit number" /></FF>
      <FF label="Email"><input className="mac-input" type="email" value={v.email} onChange={e=>set('email',e.target.value)} placeholder="email@example.com" /></FF>
      <FF label="Address"><input className="mac-input" value={v.address} onChange={e=>set('address',e.target.value)} placeholder="City, State" /></FF>
      <FF label="Project Type"><select className="mac-select" value={v.projectType} onChange={e=>set('projectType',e.target.value)}>{PROJECT_TYPES.map(t=><option key={t}>{t}</option>)}</select></FF>
      <FF label="Source"><select className="mac-select" value={v.source} onChange={e=>set('source',e.target.value)}>{SOURCES.map(s=><option key={s}>{s}</option>)}</select></FF>
      <FF label="Status"><select className="mac-select" value={v.status} onChange={e=>set('status',e.target.value)}>{CLIENT_STATUSES.map(s=><option key={s}>{s}</option>)}</select></FF>
      <FF label="Priority"><select className="mac-select" value={v.priority} onChange={e=>set('priority',e.target.value)}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></FF>
      <FF label="Proposal Value (₹)"><input className="mac-input" type="number" value={v.proposalValue} onChange={e=>set('proposalValue',e.target.value)} placeholder="0" /></FF>
      <FF label="Final Price (₹)"><input className="mac-input" type="number" value={v.finalPrice} onChange={e=>set('finalPrice',e.target.value)} placeholder="0" /></FF>
      <FF label="Next Follow-up"><input className="mac-input" type="date" value={v.nextFollowup} onChange={e=>set('nextFollowup',e.target.value)} /></FF>
      <FF label="Created By"><select className="mac-select" value={v.createdBy} onChange={e=>set('createdBy',e.target.value)}>{PARTNERS.map(p=><option key={p}>{p}</option>)}</select></FF>
    </div>
  );
}

function FollowupForm({ v, onChange }) {
  const set = (k,val) => onChange({...v,[k]:val});
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <FF label="Date" required><input className="mac-input" type="date" value={v.date} onChange={e=>set('date',e.target.value)} /></FF>
      <FF label="Remark" required><textarea className="mac-input" style={{ resize:'none', height:88 }} value={v.remark} onChange={e=>set('remark',e.target.value)} placeholder="What was discussed?" /></FF>
      <FF label="Next Follow-up Date"><input className="mac-input" type="date" value={v.nextFollowup} onChange={e=>set('nextFollowup',e.target.value)} /></FF>
    </div>
  );
}

function ClientDetail({ client, onClose, onEdit, onAddFollowup }) {
  const isOverdue = client.nextFollowup && client.nextFollowup < today;
  const initials = client.clientName.split(' ').map(n=>n[0]).join('').slice(0,2);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
        <div style={{ width:52, height:52, borderRadius:14, background:'linear-gradient(135deg,#0071E3,#0A84FF)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:17, fontWeight:700, flexShrink:0 }}>{initials}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:16, fontWeight:660, color:'#1D1D1F', letterSpacing:'-0.3px' }}>{client.clientName}</span>
            <Badge color={getStatusColor(client.status)}>{client.status}</Badge>
            <Badge color={getStatusColor(client.priority)}>{client.priority}</Badge>
          </div>
          <div style={{ fontSize:13, color:'#6E6E73', marginTop:3 }}>{client.companyName||'—'}</div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {[
          [Phone,'Contact',client.contact],[Mail,'Email',client.email],
          [MapPin,'Address',client.address],[Building2,'Project Type',client.projectType],
          [User,'Source',client.source],[Calendar,'Created',client.createdDate],
          [Clock,'Last Contacted',client.lastContacted||'—'],[User,'Created By',client.createdBy],
        ].map(([Icon,label,value])=>(
          <div key={label} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
            <Icon size={12} color="#AEAEB2" style={{ marginTop:2, flexShrink:0 }} />
            <div>
              <div style={{ fontSize:10, color:'#AEAEB2', textTransform:'uppercase', letterSpacing:'0.4px', fontWeight:500 }}>{label}</div>
              <div style={{ fontSize:12.5, color:'#1D1D1F', marginTop:1 }}>{value||'—'}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div style={{ padding:'12px 14px', borderRadius:12, background:'rgba(0,0,0,0.025)', border:'1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:10, color:'#AEAEB2', textTransform:'uppercase', letterSpacing:'0.4px', fontWeight:500, marginBottom:4 }}>Proposal Value</div>
          <div style={{ fontSize:16, fontWeight:680, color:'#1D1D1F', letterSpacing:'-0.3px' }}>{fmt(client.proposalValue)}</div>
        </div>
        <div style={{ padding:'12px 14px', borderRadius:12, background:'rgba(52,199,89,0.07)', border:'1px solid rgba(52,199,89,0.15)' }}>
          <div style={{ fontSize:10, color:'#AEAEB2', textTransform:'uppercase', letterSpacing:'0.4px', fontWeight:500, marginBottom:4 }}>Final Price</div>
          <div style={{ fontSize:16, fontWeight:680, color:'#34C759', letterSpacing:'-0.3px' }}>{fmt(client.finalPrice)}</div>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:12, background: isOverdue?'rgba(255,59,48,0.07)':'rgba(0,113,227,0.07)', border:`1px solid ${isOverdue?'rgba(255,59,48,0.15)':'rgba(0,113,227,0.15)'}` }}>
        <AlertCircle size={14} color={isOverdue?'#FF3B30':'#0071E3'} />
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:550, color: isOverdue?'#FF3B30':'#0071E3' }}>{isOverdue?'Overdue Follow-up':'Next Follow-up'}</div>
          <div style={{ fontSize:13, fontWeight:650, color: isOverdue?'#FF3B30':'#0071E3', marginTop:1 }}>{client.nextFollowup||'Not set'}</div>
        </div>
        <button onClick={onAddFollowup} className="mac-btn mac-btn-ghost" style={{ fontSize:12, padding:'6px 12px' }}>
          <MessageSquarePlus size={13} /> Add Entry
        </button>
      </div>
      {client.followupHistory?.length>0 && (
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:'#3C3C43', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
            <History size={13} color="#6E6E73" /> Follow-up History
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {client.followupHistory.map((h,i)=>(
              <div key={i} style={{ display:'flex', gap:12, paddingBottom:12 }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:'#0071E3', border:'2px solid rgba(0,113,227,0.2)', flexShrink:0 }} />
                  {i<client.followupHistory.length-1 && <div style={{ width:1, flex:1, background:'rgba(0,0,0,0.08)', marginTop:2 }} />}
                </div>
                <div style={{ flex:1, minWidth:0, paddingBottom:4 }}>
                  <div style={{ fontSize:10.5, color:'#AEAEB2', marginBottom:2 }}>{h.date}</div>
                  <div style={{ fontSize:12.5, color:'#1D1D1F' }}>{h.remark}</div>
                  {h.nextFollowup && <div style={{ fontSize:11, color:'#6E6E73', marginTop:3, display:'flex', alignItems:'center', gap:4 }}><ArrowRight size={10} /> Next: {h.nextFollowup}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display:'flex', gap:8, paddingTop:4, borderTop:'1px solid rgba(0,0,0,0.06)' }}>
        <button onClick={onEdit} className="mac-btn mac-btn-secondary" style={{ flex:1 }}><Edit2 size={13} /> Edit Client</button>
        <button onClick={onClose} className="mac-btn mac-btn-primary" style={{ flex:1 }}>Done</button>
      </div>
    </div>
  );
}

function StatusCell({ c, onUpdate }) {
  const [editing, setEditing] = useState(false);
  if (editing) return (
    <select className="mac-select" style={{ fontSize:12, padding:'4px 28px 4px 8px', borderRadius:7 }}
      value={c.status} onClick={e=>e.stopPropagation()}
      onChange={e=>{ onUpdate(e.target.value); setEditing(false); }}
      onBlur={()=>setEditing(false)} autoFocus>
      {CLIENT_STATUSES.map(s=><option key={s}>{s}</option>)}
    </select>
  );
  return (
    <div onClick={e=>{e.stopPropagation();setEditing(true);}} style={{ cursor:'pointer' }} title="Click to change status">
      <Badge color={getStatusColor(c.status)}>{c.status}</Badge>
    </div>
  );
}

export default function CRM() {
  const [clients, setClients]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [filters, setFilters]     = useState({ status:'', priority:'', source:'' });
  const [showFilters, setShowFilters] = useState(false);
  const [detailClient, setDetailClient] = useState(null);
  const [editClient, setEditClient]     = useState(null);
  const [showAdd, setShowAdd]           = useState(false);
  const [formData, setFormData]         = useState(emptyClient);
  const [deleteId, setDeleteId]         = useState(null);
  const [showFollowup, setShowFollowup] = useState(false);
  const [followupData, setFollowupData] = useState({ date:today, remark:'', nextFollowup:'' });
  const [followupCId, setFollowupCId]   = useState(null);

  const set = (k,v) => setFormData(f=>({...f,[k]:v}));

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try { setClients(await clientsDB.getAll()); } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const filtered = useMemo(()=> clients.filter(c=>{
    const q = search.toLowerCase();
    return (!q||c.clientName.toLowerCase().includes(q)||c.companyName?.toLowerCase().includes(q)||c.email?.toLowerCase().includes(q))
      && (!filters.status||c.status===filters.status)
      && (!filters.priority||c.priority===filters.priority)
      && (!filters.source||c.source===filters.source);
  }), [clients,search,filters]);

  async function saveClient() {
    if (!formData.clientName || saving) return;
    setSaving(true);
    try {
      if (editClient) {
        await clientsDB.update(editClient.id, formData);
      } else {
        await clientsDB.create({ ...formData, createdDate: today, lastContacted: today });
      }
      await fetchClients();
    } catch(e) { console.error(e); }
    setSaving(false);
    setShowAdd(false); setEditClient(null); setFormData(emptyClient);
  }

  async function deleteClient(id) {
    try { await clientsDB.delete(id); } catch(e) { console.error(e); }
    setClients(cs=>cs.filter(c=>c.id!==id));
    if (detailClient?.id===id) setDetailClient(null);
  }

  async function updateStatus(clientId, status) {
    setClients(cs=>cs.map(c=>c.id===clientId?{...c,status}:c));
    try { await clientsDB.updateStatus(clientId, status); } catch(e) { console.error(e); await fetchClients(); }
  }

  async function addFollowup() {
    if (!followupData.remark || saving) return;
    setSaving(true);
    const client = clients.find(c=>c.id===followupCId);
    if (!client) { setSaving(false); return; }
    const newHistory = [{ ...followupData }, ...(client.followupHistory||[])];
    const nextFU = followupData.nextFollowup || client.nextFollowup;
    try {
      const updated = await clientsDB.updateFollowup(followupCId, newHistory, followupData.date, nextFU);
      setClients(cs=>cs.map(c=>c.id===followupCId ? updated : c));
      if (detailClient?.id===followupCId) setDetailClient(updated);
    } catch(e) { console.error(e); }
    setSaving(false);
    setShowFollowup(false); setFollowupData({date:today,remark:'',nextFollowup:''});
  }

  const overdueCount = clients.filter(c=>c.nextFollowup&&c.nextFollowup<today).length;

  const TH = ({children}) => (
    <th style={{ textAlign:'left', padding:'10px 16px', fontSize:11, fontWeight:600, color:'#8E8E93', textTransform:'uppercase', letterSpacing:'0.5px', whiteSpace:'nowrap', borderBottom:'1px solid rgba(0,0,0,0.07)' }}>
      {children}
    </th>
  );
  const TD = ({children, style={}}) => (
    <td style={{ padding:'11px 16px', verticalAlign:'middle', ...style }}>{children}</td>
  );

  return (
    <div>
      <Header
        title="CRM"
        subtitle={`${clients.length} clients${overdueCount>0?` · ${overdueCount} overdue`:''}`}
        actions={
          <button onClick={()=>{setFormData(emptyClient);setEditClient(null);setShowAdd(true);}} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>
            <Plus size={14}/> Add Client
          </button>
        }
      />

      {loading ? <PageLoader /> : (
        <div className="page-body">
          {overdueCount>0 && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderRadius:10, background:'rgba(255,59,48,0.07)', border:'1px solid rgba(255,59,48,0.13)' }}>
              <AlertCircle size={13} color="#FF3B30" />
              <span style={{ fontSize:12.5, color:'#FF3B30', fontWeight:500 }}>{overdueCount} overdue follow-up{overdueCount>1?'s':''} — click a row to add entry</span>
            </div>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ flex:1, maxWidth:280 }}><SearchBar value={search} onChange={setSearch} placeholder="Search clients…" /></div>
            <button onClick={()=>setShowFilters(f=>!f)} className={`mac-btn ${showFilters||Object.values(filters).some(Boolean)?'mac-btn-primary':'mac-btn-secondary'}`} style={{ fontSize:13 }}>
              <Filter size={13}/> Filter {Object.values(filters).filter(Boolean).length>0?`(${Object.values(filters).filter(Boolean).length})`:''}
            </button>
            {Object.values(filters).some(Boolean) && (
              <button onClick={()=>setFilters({status:'',priority:'',source:''})} className="mac-btn mac-btn-ghost" style={{ fontSize:12, padding:'6px 10px' }}><X size={12}/> Clear</button>
            )}
            <span style={{ fontSize:12, color:'#8E8E93', marginLeft:'auto' }}>{filtered.length} result{filtered.length!==1?'s':''}</span>
          </div>
          {showFilters && (
            <div className="mac-card" style={{ padding:'14px 16px', display:'flex', gap:14 }}>
              {[['Status','status',CLIENT_STATUSES],['Priority','priority',PRIORITIES],['Source','source',SOURCES]].map(([label,key,opts])=>(
                <div key={key} style={{ flex:1 }}>
                  <label style={{ display:'block', fontSize:10.5, fontWeight:600, color:'#8E8E93', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:5 }}>{label}</label>
                  <select className="mac-select" style={{ fontSize:13 }} value={filters[key]} onChange={e=>setFilters(f=>({...f,[key]:e.target.value}))}>
                    <option value="">All</option>
                    {opts.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          <div className="mac-card" style={{ overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead style={{ background:'rgba(0,0,0,0.018)' }}>
                  <tr>
                    <TH>Client</TH><TH>Company</TH><TH>Type</TH><TH>Source</TH>
                    <TH>Status</TH><TH>Priority</TH><TH>Proposal</TH><TH>Follow-up</TH><TH>Actions</TH>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length===0
                    ? <tr><td colSpan={9} style={{ textAlign:'center', padding:'48px 16px', color:'#AEAEB2', fontSize:13 }}>No clients found</td></tr>
                    : filtered.map(c=>{
                      const isOverdue = c.nextFollowup && c.nextFollowup<today;
                      return (
                        <tr key={c.id} className="table-row" style={{ cursor:'pointer' }} onClick={()=>setDetailClient(c)}>
                          <TD>
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <div style={{ width:32,height:32,borderRadius:10,background:'linear-gradient(135deg,rgba(0,113,227,0.12),rgba(10,132,255,0.08))',display:'flex',alignItems:'center',justifyContent:'center',color:'#0071E3',fontSize:10.5,fontWeight:700,flexShrink:0 }}>
                                {c.clientName.split(' ').map(n=>n[0]).join('').slice(0,2)}
                              </div>
                              <div>
                                <div style={{ fontSize:13, fontWeight:550, color:'#1D1D1F' }}>{c.clientName}</div>
                                <div style={{ fontSize:11, color:'#AEAEB2', marginTop:1 }}>{c.contact}</div>
                              </div>
                            </div>
                          </TD>
                          <TD><span style={{ fontSize:12.5, color:'#3C3C43' }}>{c.companyName||'—'}</span></TD>
                          <TD><Badge color="blue">{c.projectType}</Badge></TD>
                          <TD><span style={{ fontSize:12, color:'#6E6E73' }}>{c.source}</span></TD>
                          <TD onClick={e=>e.stopPropagation()}>
                            <StatusCell c={c} onUpdate={v=>updateStatus(c.id,v)} />
                          </TD>
                          <TD><Badge color={getStatusColor(c.priority)}>{c.priority}</Badge></TD>
                          <TD><span style={{ fontSize:13, fontWeight:550, color:'#1D1D1F' }}>{fmt(c.proposalValue)}</span></TD>
                          <TD>
                            <span style={{ fontSize:12, fontWeight:500, color:isOverdue?'#FF3B30':'#6E6E73' }}>
                              {c.nextFollowup ? (isOverdue?'⚠ ':'')+c.nextFollowup : '—'}
                            </span>
                          </TD>
                          <TD style={{ whiteSpace:'nowrap' }} onClick={e=>e.stopPropagation()}>
                            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                              {[
                                { icon: MessageSquarePlus, color:'#0071E3', bg:'rgba(0,113,227,0.09)', title:'Add follow-up', onClick:()=>{setFollowupCId(c.id);setShowFollowup(true);} },
                                { icon: Edit2, color:'#6E6E73', bg:'rgba(0,0,0,0.06)', title:'Edit', onClick:()=>{setEditClient(c);setFormData(c);setShowAdd(true);} },
                                { icon: Trash2, color:'#FF3B30', bg:'rgba(255,59,48,0.08)', title:'Delete', onClick:()=>setDeleteId(c.id) },
                              ].map(({icon:Icon,color,bg,title,onClick})=>(
                                <button key={title} title={title} onClick={onClick} style={{ width:28,height:28,borderRadius:8,background:bg,border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}
                                  onMouseEnter={e=>e.currentTarget.style.opacity='0.75'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                                  <Icon size={13} color={color} />
                                </button>
                              ))}
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

      <Modal isOpen={showAdd} onClose={()=>{setShowAdd(false);setEditClient(null);setFormData(emptyClient);}} title={editClient?'Edit Client':'Add New Client'} size="xl">
        <ClientForm v={formData} set={set} />
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20, paddingTop:16, borderTop:'1px solid rgba(0,0,0,0.07)' }}>
          <button onClick={()=>{setShowAdd(false);setEditClient(null);}} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>Cancel</button>
          <button onClick={saveClient} disabled={saving} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>{saving?'Saving…':editClient?'Save Changes':'Add Client'}</button>
        </div>
      </Modal>

      <Modal isOpen={!!detailClient} onClose={()=>setDetailClient(null)} title="Client Details" size="lg">
        {detailClient&&<ClientDetail client={detailClient} onClose={()=>setDetailClient(null)} onEdit={()=>{setEditClient(detailClient);setFormData(detailClient);setDetailClient(null);setShowAdd(true);}} onAddFollowup={()=>{setFollowupCId(detailClient.id);setDetailClient(null);setShowFollowup(true);}} />}
      </Modal>

      <Modal isOpen={showFollowup} onClose={()=>setShowFollowup(false)} title="Add Follow-up Entry" size="sm">
        <FollowupForm v={followupData} onChange={setFollowupData} />
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20, paddingTop:16, borderTop:'1px solid rgba(0,0,0,0.07)' }}>
          <button onClick={()=>setShowFollowup(false)} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>Cancel</button>
          <button onClick={addFollowup} disabled={saving} className="mac-btn mac-btn-primary" style={{ fontSize:13 }}>{saving?'Saving…':'Save Entry'}</button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={()=>deleteClient(deleteId)} title="Delete Client" message="This will permanently delete the client and all their follow-up history." />
    </div>
  );
}
