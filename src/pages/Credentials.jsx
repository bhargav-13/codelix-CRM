import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import SearchBar from '../components/ui/SearchBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import { CardGridSkeleton } from '../components/ui/LoadingSpinner';
import { credentialsDB } from '../lib/db';
import { Plus, Edit2, Trash2, Eye, EyeOff, Copy, Check, KeyRound, Globe, Database, Smartphone, Wrench, Lock, StickyNote, User } from 'lucide-react';

const CRED_TYPES = ['Hosting','Database','App Store','Tool','FTP','Email','API Key','Other'];
const TYPE_CONFIG = {
  Hosting:     { icon: Globe,       gradient:'linear-gradient(135deg,#0071E3,#0A84FF)', light:'rgba(0,113,227,0.1)',  text:'#0071E3' },
  Database:    { icon: Database,    gradient:'linear-gradient(135deg,#34C759,#30D158)', light:'rgba(52,199,89,0.1)',  text:'#34C759' },
  'App Store': { icon: Smartphone,  gradient:'linear-gradient(135deg,#AF52DE,#BF5AF2)', light:'rgba(175,82,222,0.1)', text:'#AF52DE' },
  Tool:        { icon: Wrench,      gradient:'linear-gradient(135deg,#FF9500,#FFB340)', light:'rgba(255,149,0,0.1)', text:'#FF9500' },
  Default:     { icon: KeyRound,    gradient:'linear-gradient(135deg,#6E6E73,#8E8E93)', light:'rgba(110,110,115,0.1)',text:'#6E6E73' },
};

const emptyCred = { clientName:'',projectName:'',type:'Hosting',platform:'',url:'',username:'',password:'',notes:'' };

const FF=({label,children,required})=>(
  <div>
    <label style={{display:'block',fontSize:11.5,fontWeight:550,color:'#6E6E73',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.4px'}}>
      {label}{required&&<span style={{color:'#FF3B30',marginLeft:2}}>*</span>}
    </label>
    {children}
  </div>
);

function CredForm({v,onChange}){
  const s=(k,val)=>onChange({...v,[k]:val});
  const [showPw,setShowPw]=useState(false);
  return(
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px 16px'}}>
      <FF label="Client Name"><input className="mac-input" value={v.clientName} onChange={e=>s('clientName',e.target.value)} placeholder="Client or Internal"/></FF>
      <FF label="Project Name"><input className="mac-input" value={v.projectName} onChange={e=>s('projectName',e.target.value)} placeholder="Related project"/></FF>
      <FF label="Type" required><select className="mac-select" value={v.type} onChange={e=>s('type',e.target.value)}>{CRED_TYPES.map(t=><option key={t}>{t}</option>)}</select></FF>
      <FF label="Platform" required><input className="mac-input" value={v.platform} onChange={e=>s('platform',e.target.value)} placeholder="e.g. cPanel, Figma"/></FF>
      <FF label="URL"><input className="mac-input" value={v.url} onChange={e=>s('url',e.target.value)} placeholder="https://..."/></FF>
      <FF label="Username / Email" required><input className="mac-input" value={v.username} onChange={e=>s('username',e.target.value)} placeholder="Login username"/></FF>
      <div style={{gridColumn:'span 2'}}>
        <FF label="Password" required>
          <div style={{position:'relative'}}>
            <input className="mac-input" style={{paddingRight:40}} type={showPw?'text':'password'} value={v.password} onChange={e=>s('password',e.target.value)} placeholder="Actual password"/>
            <button type="button" onClick={()=>setShowPw(p=>!p)} style={{position:'absolute',right:11,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',padding:0,color:'#AEAEB2'}}>
              {showPw?<EyeOff size={15}/>:<Eye size={15}/>}
            </button>
          </div>
        </FF>
      </div>
      <div style={{gridColumn:'span 2'}}>
        <FF label="Notes"><textarea className="mac-input" style={{resize:'none',height:70}} value={v.notes} onChange={e=>s('notes',e.target.value)} placeholder="Any additional notes…"/></FF>
      </div>
    </div>
  );
}

function CopyBtn({text}){
  const [copied,setCopied]=useState(false);
  function copy(){navigator.clipboard.writeText(text).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1400);});}
  return(
    <button onClick={copy} style={{width:22,height:22,borderRadius:6,background:'rgba(0,0,0,0.06)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.12s'}}
      onMouseEnter={e=>e.currentTarget.style.background='rgba(0,0,0,0.1)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(0,0,0,0.06)'}>
      {copied?<Check size={11} color="#34C759"/>:<Copy size={11} color="#6E6E73"/>}
    </button>
  );
}

function CredCard({cred,onEdit,onDelete}){
  const [revealed,setRevealed]=useState(false);
  const cfg=TYPE_CONFIG[cred.type]||TYPE_CONFIG.Default;
  const Icon=cfg.icon;
  return(
    <div className="mac-card" style={{padding:18,transition:'box-shadow 0.15s',position:'relative'}}
      onMouseEnter={ev=>ev.currentTarget.style.boxShadow='0 6px 24px rgba(0,0,0,0.1)'}
      onMouseLeave={ev=>ev.currentTarget.style.boxShadow=''}
    >
      <div style={{position:'absolute',top:12,right:12,display:'flex',gap:4,opacity:0,transition:'opacity 0.15s'}}
        className="card-actions">
        <button onClick={onEdit} style={{width:26,height:26,borderRadius:8,background:'rgba(0,0,0,0.07)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Edit2 size={12} color="#6E6E73"/></button>
        <button onClick={onDelete} style={{width:26,height:26,borderRadius:8,background:'rgba(255,59,48,0.09)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Trash2 size={12} color="#FF3B30"/></button>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
        <div style={{width:42,height:42,borderRadius:12,background:cfg.gradient,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 4px 12px ${cfg.light.replace('0.1)','0.3)')}`}}>
          <Icon size={18} color="#fff"/>
        </div>
        <div>
          <div style={{fontSize:14,fontWeight:650,color:'#1D1D1F',letterSpacing:'-0.2px'}}>{cred.platform}</div>
          <Badge color="gray">{cred.type}</Badge>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:7}}>
        {cred.clientName&&(
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:11,color:'#AEAEB2'}}>Client</span>
            <span style={{fontSize:12,color:'#3C3C43',fontWeight:450}}>{cred.clientName}</span>
          </div>
        )}
        {cred.url&&(
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:11,color:'#AEAEB2'}}>URL</span>
            <a href={cred.url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:11,color:'#0071E3',textDecoration:'none',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {cred.url.replace('https://','').slice(0,28)}
            </a>
          </div>
        )}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:11,color:'#AEAEB2'}}>Username</span>
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            <span style={{fontSize:12,color:'#1D1D1F',fontWeight:500,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cred.username}</span>
            <CopyBtn text={cred.username}/>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:11,color:'#AEAEB2'}}>Password</span>
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            <span style={{fontSize:12,color:'#1D1D1F',fontFamily:'monospace',letterSpacing:revealed?0:'2px'}}>{revealed?cred.password:'••••••••••'}</span>
            <button onClick={()=>setRevealed(r=>!r)} style={{width:22,height:22,borderRadius:6,background:'rgba(0,0,0,0.06)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              {revealed?<EyeOff size={11} color="#6E6E73"/>:<Eye size={11} color="#6E6E73"/>}
            </button>
            {revealed&&<CopyBtn text={cred.password}/>}
          </div>
        </div>
      </div>
      {cred.notes&&(
        <div style={{marginTop:12,padding:'8px 10px',borderRadius:9,background:'rgba(0,0,0,0.025)',border:'1px solid rgba(0,0,0,0.05)'}}>
          <div style={{display:'flex',gap:6,alignItems:'flex-start'}}>
            <StickyNote size={11} color="#AEAEB2" style={{marginTop:1,flexShrink:0}}/>
            <p style={{fontSize:11.5,color:'#6E6E73',lineHeight:1.4}}>{cred.notes}</p>
          </div>
        </div>
      )}
      <style>{`.mac-card:hover .card-actions{opacity:1!important}`}</style>
    </div>
  );
}

export default function Credentials(){
  const [creds,setCreds]       = useState([]);
  const [loading,setLoading]   = useState(true);
  const [saving,setSaving]     = useState(false);
  const [search,setSearch]     = useState('');
  const [typeFilter,setTypeFilter] = useState('');
  const [showAdd,setShowAdd]   = useState(false);
  const [editCred,setEditCred] = useState(null);
  const [form,setForm]         = useState(emptyCred);
  const [deleteId,setDeleteId] = useState(null);

  const fetchCreds = useCallback(async () => {
    setLoading(true);
    try { setCreds(await credentialsDB.getAll()); } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCreds(); }, [fetchCreds]);

  const filtered=useMemo(()=>creds.filter(c=>{
    const q=search.toLowerCase();
    return(!q||c.platform.toLowerCase().includes(q)||c.clientName?.toLowerCase().includes(q)||c.username?.toLowerCase().includes(q))
      &&(!typeFilter||c.type===typeFilter);
  }),[creds,search,typeFilter]);

  const grouped=useMemo(()=>{
    const g={};
    filtered.forEach(c=>{const k=c.clientName||'Internal';if(!g[k])g[k]=[];g[k].push(c);});
    return g;
  },[filtered]);

  async function save(){
    if(!form.platform||!form.username||saving)return;
    setSaving(true);
    try{
      if(editCred){
        const updated=await credentialsDB.update(editCred.id,form);
        setCreds(cs=>cs.map(c=>c.id===editCred.id?updated:c));
      } else {
        const created=await credentialsDB.create(form);
        setCreds(cs=>[created,...cs]);
      }
    } catch(e){ console.error(e); }
    setSaving(false);
    setShowAdd(false);setEditCred(null);setForm(emptyCred);
  }

  async function del(id){
    setCreds(cs=>cs.filter(c=>c.id!==id));
    try{ await credentialsDB.delete(id); } catch(e){ console.error(e); await fetchCreds(); }
  }

  return(
    <div>
      <Header title="Credentials" subtitle={`${creds.length} saved · grouped by client`}
        actions={<button onClick={()=>{setForm(emptyCred);setEditCred(null);setShowAdd(true);}} className="mac-btn mac-btn-primary" style={{fontSize:13}}><Plus size={14}/> Add Credential</button>}
      />

      {loading ? <CardGridSkeleton cols={3} count={6} /> : (
        <div style={{padding:'24px 32px',display:'flex',flexDirection:'column',gap:20}}>
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:11,background:'rgba(255,204,0,0.08)',border:'1px solid rgba(255,204,0,0.2)'}}>
            <Lock size={14} color="#B8860B" style={{flexShrink:0}}/>
            <span style={{fontSize:12,color:'#8B6914',lineHeight:1.4}}>Credentials stored in Supabase with row-level security. Add Supabase Auth for user-login protection.</span>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div style={{flex:1,maxWidth:280}}><SearchBar value={search} onChange={setSearch} placeholder="Search credentials…"/></div>
            <select className="mac-select" style={{fontSize:13,width:'auto',minWidth:140}} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              {CRED_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
            <span style={{fontSize:12,color:'#8E8E93',marginLeft:'auto'}}>{filtered.length} result{filtered.length!==1?'s':''}</span>
          </div>
          {Object.entries(grouped).length===0
            ?<div style={{textAlign:'center',padding:'56px',color:'#AEAEB2',fontSize:13}}>No credentials found</div>
            :Object.entries(grouped).map(([clientName,items])=>(
              <div key={clientName}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                  <div style={{width:22,height:22,borderRadius:'50%',background:'rgba(0,113,227,0.1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <User size={11} color="#0071E3"/>
                  </div>
                  <span style={{fontSize:13,fontWeight:620,color:'#3C3C43',letterSpacing:'-0.1px'}}>{clientName}</span>
                  <span style={{fontSize:11,color:'#AEAEB2'}}>({items.length})</span>
                  <div style={{flex:1,height:1,background:'rgba(0,0,0,0.07)',marginLeft:4}}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:14}}>
                  {items.map(c=>(
                    <CredCard key={c.id} cred={c}
                      onEdit={()=>{setEditCred(c);setForm(c);setShowAdd(true);}}
                      onDelete={()=>setDeleteId(c.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          }
        </div>
      )}

      <Modal isOpen={showAdd} onClose={()=>{setShowAdd(false);setEditCred(null);setForm(emptyCred);}} title={editCred?'Edit Credential':'Add Credential'} size="lg">
        <CredForm v={form} onChange={setForm}/>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20,paddingTop:16,borderTop:'1px solid rgba(0,0,0,0.07)'}}>
          <button onClick={()=>{setShowAdd(false);setEditCred(null);}} className="mac-btn mac-btn-secondary" style={{fontSize:13}}>Cancel</button>
          <button onClick={save} disabled={saving} className="mac-btn mac-btn-primary" style={{fontSize:13}}>{saving?'Saving…':editCred?'Save Changes':'Add Credential'}</button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={()=>del(deleteId)} title="Delete Credential" message="This will permanently delete this credential entry."/>
    </div>
  );
}
