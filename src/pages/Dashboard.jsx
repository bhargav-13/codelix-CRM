import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Badge, { getStatusColor } from '../components/ui/Badge';
import { PageLoader } from '../components/ui/CodelixLoader';
import { clientsDB, transactionsDB, employeesDB, projectsDB, settingsDB } from '../lib/db';
import {
  Users, FolderKanban, UserCheck,
  ArrowUpRight, ArrowDownRight, AlertCircle, CalendarClock, Clock,
  IndianRupee,
} from 'lucide-react';

const today = new Date().toISOString().split('T')[0];
const fmt = n => '₹' + Number(n).toLocaleString('en-IN');

function StatCard({ label, value, sub, gradient, icon: Icon, iconColor }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid rgba(0,0,0,0.07)',
      borderRadius: 16, padding: '18px 20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
      display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
    }}>
      <div style={{ width:38, height:38, borderRadius:11, background:gradient, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Icon size={17} color={iconColor} />
      </div>
      <div>
        <div style={{ fontSize:24, fontWeight:680, color:'#1D1D1F', letterSpacing:'-0.8px', lineHeight:1.1 }}>{value}</div>
        <div style={{ fontSize:12.5, color:'#6E6E73', marginTop:2, fontWeight:450 }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:'#AEAEB2', marginTop:3 }}>{sub}</div>}
      </div>
    </div>
  );
}

function SectionLabel({ title, right }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
      <span style={{ fontSize:13, fontWeight:600, color:'#1D1D1F', letterSpacing:'-0.2px' }}>{title}</span>
      {right && <span style={{ fontSize:11, color:'#8E8E93' }}>{right}</span>}
    </div>
  );
}


export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [clients, txs, employees, projects, obData] = await Promise.all([
          clientsDB.getAll(),
          transactionsDB.getAll(),
          employeesDB.getAll(),
          projectsDB.getAll(),
          settingsDB.get('opening_balances'),
        ]);
        const openBal = obData || { cash: 25000, bank: 150000 };
        let pC=0,pD=0,bC=0,bD=0;
        txs.forEach(t => {
          // Support both old name "Founder's Personal" and new "Cash + Savings Account"
          const isCash = t.accountType === 'Cash + Savings Account' || t.accountType === "Founder's Personal";
          if (isCash) { t.type==='Credit' ? pC+=+t.amount : pD+=+t.amount; }
          else        { t.type==='Credit' ? bC+=+t.amount : bD+=+t.amount; }
        });
        const bal = {
          cash: openBal.cash+pC-pD,
          bank: openBal.bank+bC-bD,
          total: openBal.cash+pC-pD+openBal.bank+bC-bD,
          totalCredit: pC+bC,
          totalDebit: pD+bD,
        };
        setData({ clients, txs, employees, projects, bal });
      } catch(e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  if (loading || !data) return (
    <div>
      <Header title="Dashboard" subtitle={new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} />
      <PageLoader />
    </div>
  );

  const { clients, txs, employees, projects, bal } = data;

  const overdueFollowups = clients.filter(c => c.nextFollowup && c.nextFollowup < today);
  const todayFollowups   = clients.filter(c => c.nextFollowup === today);
  const hotClients       = clients.filter(c => c.status === 'Hot');
  const activeProjects   = projects.filter(p => p.status === 'In Progress');
  const activeEmployees  = employees.filter(e => e.status === 'Active');
  const pendingSalaries  = employees.filter(e => e.status==='Active' && e.salaryType==='Monthly' && e.salaryHistory?.[0]?.paid===0);
  const recentTx = [...txs].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,5);
  const pipelineStatuses = ['Hot','Warm','Cold','Closed Won','Closed Lost'];
  const pipelineColors   = { Hot:'#FF3B30', Warm:'#FF9500', Cold:'#0071E3', 'Closed Won':'#34C759', 'Closed Lost':'#AEAEB2' };

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle={new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
      />
      <div style={{ padding:'24px 32px', display:'flex', flexDirection:'column', gap:20 }}>

        {/* Stat Cards */}
        <div className="rg-4">
          <StatCard label="Total Balance" value={fmt(bal.total)} sub={`Cash ${fmt(bal.cash)}`}
            gradient="linear-gradient(135deg,#E3F0FF,#CCE4FF)" icon={IndianRupee} iconColor="#0071E3" />
          <StatCard label="Total Clients" value={clients.length} sub={`${hotClients.length} hot leads`}
            gradient="linear-gradient(135deg,#FFF0E0,#FFE0C0)" icon={Users} iconColor="#FF9500" />
          <StatCard label="Active Projects" value={activeProjects.length} sub={`${projects.filter(p=>p.status==='Completed').length} completed`}
            gradient="linear-gradient(135deg,#F0E8FF,#E0D0FF)" icon={FolderKanban} iconColor="#9B51E0" />
          <StatCard label="Team Members" value={activeEmployees.length} sub={pendingSalaries.length>0?`${pendingSalaries.length} salary pending`:'All paid'}
            gradient="linear-gradient(135deg,#E0FFF0,#C0FFE0)" icon={UserCheck} iconColor="#34C759" />
        </div>

        {/* Alert Pills */}
        {(overdueFollowups.length>0 || todayFollowups.length>0 || pendingSalaries.length>0) && (
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {overdueFollowups.length>0 && (
              <button onClick={()=>navigate('/crm')} style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 14px', borderRadius:100, background:'rgba(255,59,48,0.08)', border:'1px solid rgba(255,59,48,0.15)', cursor:'pointer', transition:'background 0.15s' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,59,48,0.14)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,59,48,0.08)'}
              >
                <AlertCircle size={13} color="#FF3B30" />
                <span style={{ fontSize:12.5, color:'#FF3B30', fontWeight:500 }}>{overdueFollowups.length} overdue follow-up{overdueFollowups.length>1?'s':''}</span>
              </button>
            )}
            {todayFollowups.length>0 && (
              <button onClick={()=>navigate('/crm')} style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 14px', borderRadius:100, background:'rgba(0,113,227,0.08)', border:'1px solid rgba(0,113,227,0.15)', cursor:'pointer', transition:'background 0.15s' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(0,113,227,0.14)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(0,113,227,0.08)'}
              >
                <CalendarClock size={13} color="#0071E3" />
                <span style={{ fontSize:12.5, color:'#0071E3', fontWeight:500 }}>{todayFollowups.length} follow-up{todayFollowups.length>1?'s':''} today</span>
              </button>
            )}
            {pendingSalaries.length>0 && (
              <button onClick={()=>navigate('/employees')} style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 14px', borderRadius:100, background:'rgba(255,149,0,0.08)', border:'1px solid rgba(255,149,0,0.18)', cursor:'pointer', transition:'background 0.15s' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,149,0,0.14)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,149,0,0.08)'}
              >
                <Clock size={13} color="#FF9500" />
                <span style={{ fontSize:12.5, color:'#FF9500', fontWeight:500 }}>{pendingSalaries.map(e=>e.name).join(', ')} — salary due</span>
              </button>
            )}
          </div>
        )}

        {/* Middle Row */}
        <div className="rg-3">

          {/* Finance Summary */}
          <div className="mac-card" style={{ padding:20 }}>
            <SectionLabel title="Finance Summary" right="All time" />
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderRadius:10, background:'rgba(52,199,89,0.08)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <ArrowUpRight size={14} color="#34C759" />
                  <span style={{ fontSize:12.5, color:'#1D1D1F', fontWeight:500 }}>Total Credit</span>
                </div>
                <span style={{ fontSize:13, fontWeight:650, color:'#34C759' }}>{fmt(bal.totalCredit)}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderRadius:10, background:'rgba(255,59,48,0.07)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <ArrowDownRight size={14} color="#FF3B30" />
                  <span style={{ fontSize:12.5, color:'#1D1D1F', fontWeight:500 }}>Total Debit</span>
                </div>
                <span style={{ fontSize:13, fontWeight:650, color:'#FF3B30' }}>{fmt(bal.totalDebit)}</span>
              </div>
              <div style={{ height:1, background:'rgba(0,0,0,0.05)', margin:'4px 0' }} />
              {[['Cash Balance', fmt(bal.cash)],['Bank Balance', fmt(bal.bank)]].map(([l,v])=>(
                <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'2px 0' }}>
                  <span style={{ fontSize:12, color:'#6E6E73' }}>{l}</span>
                  <span style={{ fontSize:12.5, fontWeight:550, color:'#1D1D1F' }}>{v}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0 0', borderTop:'1px solid rgba(0,0,0,0.05)', marginTop:2 }}>
                <span style={{ fontSize:12.5, fontWeight:550, color:'#1D1D1F' }}>Total Balance</span>
                <span style={{ fontSize:14, fontWeight:700, color:'#1D1D1F', letterSpacing:'-0.3px' }}>{fmt(bal.total)}</span>
              </div>
            </div>
          </div>

          {/* Client Pipeline */}
          <div className="mac-card" style={{ padding:20 }}>
            <SectionLabel title="Client Pipeline" right={`${clients.length} total`} />
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {pipelineStatuses.map(status => {
                const count = clients.filter(c=>c.status===status).length;
                const pct = clients.length ? Math.round((count/clients.length)*100) : 0;
                return (
                  <div key={status}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:12, color:'#3C3C43' }}>{status}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:'#1D1D1F' }}>{count}</span>
                    </div>
                    <div style={{ height:5, borderRadius:100, background:'rgba(0,0,0,0.07)', overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:100, background:pipelineColors[status], width:`${pct}%`, transition:'width 0.4s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Projects */}
          <div className="mac-card" style={{ padding:20 }}>
            <SectionLabel title="Active Projects" right={`${activeProjects.length} running`} />
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {activeProjects.length===0
                ? <p style={{ fontSize:12, color:'#AEAEB2', textAlign:'center', padding:'16px 0' }}>No active projects</p>
                : activeProjects.map(p => {
                  const paid = (p.payments||[]).reduce((s,x)=>s+(+x.amount||0),0);
                  const pct  = p.valuation ? Math.round((paid/+p.valuation)*100) : 0;
                  return (
                    <div key={p.id} style={{ padding:'10px 12px', borderRadius:10, background:'rgba(0,0,0,0.025)', border:'1px solid rgba(0,0,0,0.05)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <span style={{ fontSize:12, fontWeight:550, color:'#1D1D1F', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:8 }}>{p.projectName}</span>
                        <span style={{ fontSize:11, color:'#6E6E73', flexShrink:0, fontWeight:600 }}>{pct}%</span>
                      </div>
                      <div style={{ height:4, borderRadius:100, background:'rgba(0,0,0,0.07)', overflow:'hidden', marginBottom:6 }}>
                        <div style={{ height:'100%', borderRadius:100, background:'#0071E3', width:`${pct}%` }} />
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <span style={{ fontSize:10.5, color:'#AEAEB2' }}>{p.clientName}</span>
                        <span style={{ fontSize:10.5, color:'#8E8E93' }}>Due {p.dueDate}</span>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="rg-2">

          {/* Recent Transactions */}
          <div className="mac-card" style={{ padding:20 }}>
            <SectionLabel title="Recent Transactions" right="Last 5" />
            {recentTx.length===0
              ? <p style={{ fontSize:12, color:'#AEAEB2', textAlign:'center', padding:'16px 0' }}>No transactions yet</p>
              : recentTx.map((t,i) => (
                <div key={t.id} style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 0',
                  borderBottom: i<recentTx.length-1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, background:t.type==='Credit'?'rgba(52,199,89,0.1)':'rgba(255,59,48,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {t.type==='Credit' ? <ArrowUpRight size={13} color="#34C759"/> : <ArrowDownRight size={13} color="#FF3B30"/>}
                    </div>
                    <div>
                      <div style={{ fontSize:12.5, fontWeight:500, color:'#1D1D1F' }}>{t.remark||t.category||t.source}</div>
                      <div style={{ fontSize:11, color:'#AEAEB2', marginTop:1 }}>{(t.date||'').split(' ')[0]} · {t.accountType}</div>
                    </div>
                  </div>
                  <span style={{ fontSize:13, fontWeight:650, color:t.type==='Credit'?'#34C759':'#FF3B30', letterSpacing:'-0.2px' }}>
                    {t.type==='Credit'?'+':'-'}{fmt(t.amount)}
                  </span>
                </div>
              ))
            }
          </div>

          {/* Hot Leads */}
          <div className="mac-card" style={{ padding:20 }}>
            <SectionLabel title="Hot Leads & Follow-ups" right={`${hotClients.length} hot`} />
            {clients.filter(c=>['Hot','Warm'].includes(c.status)).length===0
              ? <p style={{ fontSize:12, color:'#AEAEB2', textAlign:'center', padding:'16px 0' }}>No hot or warm leads</p>
              : clients.filter(c=>['Hot','Warm'].includes(c.status))
                .sort((a,b)=>({Hot:0,Warm:1}[a.status]||9)-({Hot:0,Warm:1}[b.status]||9))
                .map((c,i,arr) => {
                  const isOverdue = c.nextFollowup && c.nextFollowup < today;
                  return (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:i<arr.length-1?'1px solid rgba(0,0,0,0.05)':'none' }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0, background:'rgba(0,113,227,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#0071E3' }}>
                        {c.clientName.split(' ').map(n=>n[0]).join('').slice(0,2)}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontSize:12.5, fontWeight:550, color:'#1D1D1F', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.clientName}</span>
                          <Badge color={getStatusColor(c.status)}>{c.status}</Badge>
                        </div>
                        <div style={{ fontSize:11, color:isOverdue?'#FF3B30':'#AEAEB2', marginTop:1 }}>
                          {c.nextFollowup ? (isOverdue?'⚠ Overdue · ':'')+c.nextFollowup : 'No follow-up set'}
                        </div>
                      </div>
                      <span style={{ fontSize:11, color:'#8E8E93', flexShrink:0 }}>{c.projectType}</span>
                    </div>
                  );
                })
            }
          </div>
        </div>
      </div>
    </div>
  );
}
