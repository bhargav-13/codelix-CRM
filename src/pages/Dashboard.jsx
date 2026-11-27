import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RiAlarmWarningLine, RiArrowRightDownLine, RiArrowRightSLine, RiArrowRightUpLine, RiCalendarEventLine,
  RiFolder3Line, RiGroupLine, RiTeamLine, RiTimeLine, RiWalletLine,
} from '@remixicon/react';
import Header from '../components/layout/Header';
import Badge, { getStatusColor } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { PersonChip } from '../components/ui/Person';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorPanel, fmtDate, todayLocal } from '../components/ui/kit';
import { useAuth } from '../contexts/AuthContext';
import { clientsDB, transactionsDB, employeesDB, projectsDB, settingsDB } from '../lib/db';
import { computeBalances } from '../lib/finance';
import FinanceOverview from '../components/dashboard/FinanceOverview';
import { inr } from '../lib/money';
import { IbcsBars } from '../components/charts/ibcs';
import TodayAttendance from '../components/dashboard/TodayAttendance';

const fmt = n => inr(n);
const longDate = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

const PIPELINE = [['Draft', 'brand'], ['Won', 'good'], ['Lost', 'bad']];

// A headline number. The whole tile is a button that opens the page behind it.
function Tile({ label, value, sub, icon: Icon, dark, onClick }) {
  return (
    <button type="button" className={`tile card-link ${dark ? 'dark' : ''}`} onClick={onClick} aria-label={`${label}: ${value}. ${sub || ''}`}>
      <span className="tile-icon"><Icon size={20} aria-hidden="true" /></span>
      <span className="tile-go" aria-hidden="true"><RiArrowRightUpLine size={18} /></span>
      <span style={{ minWidth: 0, maxWidth: '100%' }}>
        <span className="tile-label" style={{ display: 'block' }}>{label}</span>
        <span className="tile-value" style={{ display: 'block' }}>{value}</span>
        {sub && <span className="tile-sub" style={{ display: 'block', marginTop: 2 }}>{sub}</span>}
      </span>
    </button>
  );
}

function CardHead({ title, hint, action, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <h2 className="section-title" style={{ whiteSpace: 'nowrap' }}>{title}</h2>
        {hint && <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{hint}</span>}
      </div>
      {action && (
        <button type="button" className="mac-btn mac-btn-ghost" style={{ minHeight: 28, padding: '2px 4px 2px 8px', fontSize: 13, gap: 2, marginRight: -4 }} onClick={onAction}>
          {action}<RiArrowRightSLine size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

const Empty = ({ children }) => <p className="faint" style={{ fontSize: 13, textAlign: 'center', padding: '24px 0' }}>{children}</p>;

function AlertPill({ tone, icon: Icon, onClick, children }) {
  const c = { bad: ['var(--bad)', 'var(--bad-soft)'], brand: ['var(--brand)', 'var(--brand-soft)'], warn: ['var(--warn)', 'var(--warn-soft)'] }[tone];
  return (
    <button type="button" onClick={onClick} className="chip alert-pill" style={{ '--pill-fg': c[0], '--pill-bg': c[1] }}>
      <Icon size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
      <RiArrowRightSLine size={15} aria-hidden="true" style={{ flexShrink: 0, marginRight: -4 }} />
    </button>
  );
}

// Same boxes as the loaded page, so nothing moves when the numbers arrive.
function DashboardSkeleton() {
  const card = (h, key) => <div key={key} className="mac-card" style={{ padding: 20, minHeight: h, display: 'flex', flexDirection: 'column', gap: 16 }}>
    <Skeleton width={140} height={16} />
    {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} width={`${90 - i * 12}%`} height={12} />)}
  </div>;
  return (
    <div className="page-body" aria-busy="true" aria-label="Loading the dashboard">
      <div className="dash-top">
        <div className="tile-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="tile">
              <Skeleton width={40} height={40} radius={12} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                <Skeleton width={80} height={12} /><Skeleton width={120} height={24} /><Skeleton width={96} height={10} />
              </span>
            </div>
          ))}
        </div>
        {card(520, 'pl')}
      </div>
      <div className="rg-3">{[0, 1, 2].map(i => card(260, i))}</div>
      <div className="rg-3">{[0, 1, 2].map(i => card(300, i))}</div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const { me, displayName } = useAuth();
  const firstName = (me?.fullName || displayName || '').trim().split(/\s+/)[0];
  const subtitle = `${firstName ? `${greeting()}, ${firstName}` : greeting()} · ${longDate()}`;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [clients, txs, employees, projects, obData] = await Promise.all([
        clientsDB.getAll(),
        transactionsDB.getAll(),
        employeesDB.getAll(),
        projectsDB.getAll(),
        settingsDB.get('opening_balances'),
      ]);
      const bal = computeBalances(txs, obData || { cash: 0, bank: 0 });
      setData({ clients, txs, employees, projects, bal });
    } catch (e) { console.error(e); setError(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data) return (
    <div>
      <Header title="Dashboard" subtitle={subtitle} />
      {error
        ? <div className="page-body"><ErrorPanel title="Could not load the dashboard" error={error} onRetry={load} /></div>
        : <DashboardSkeleton />}
    </div>
  );

  return <DashboardView data={data} subtitle={subtitle} />;
}

/** Pure view — also rendered with sample data by the dev-only UI preview. */
export function DashboardView({ data, subtitle }) {
  const navigate = useNavigate();
  const { clients, txs, employees, projects, bal } = data;
  const today = todayLocal();
  const go = to => () => navigate(to);

  // A lost lead can still carry a follow-up (try again later); a won one never does.
  const isActive = c => c.status !== 'Won';
  const overdueFollowups = clients.filter(c => isActive(c) && c.nextFollowup && c.nextFollowup < today);
  const todayFollowups   = clients.filter(c => isActive(c) && c.nextFollowup === today);
  const openLeads        = clients.filter(c => c.status === 'Draft');
  const leads            = clients.filter(c => isActive(c) && c.nextFollowup)
    .sort((a, b) => a.nextFollowup.localeCompare(b.nextFollowup));
  const activeProjects   = projects.filter(p => p.status === 'In Progress');
  const activeEmployees  = employees.filter(e => e.status === 'Active');
  const curMonthLabel    = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const pendingSalaries  = employees.filter(e => {
    if (e.status !== 'Active' || e.salaryType !== 'Monthly') return false;
    if (!e.salaryAmount || +e.salaryAmount === 0) return false;
    const paidThisMonth = (e.salaryHistory || [])
      .filter(h => h.month === curMonthLabel)
      .reduce((s, h) => s + (+h.paid || 0), 0);
    return paidThisMonth < +e.salaryAmount;
  });
  const salaryDue = new Set(pendingSalaries.map(e => e.id));
  const recentTx = [...txs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  return (
    <div>
      <Header title="Dashboard" subtitle={subtitle || longDate()} />
      <div className="page-body">

        {/* Headline tiles + profit & loss */}
        <div className="dash-top">
          <div className="tile-grid">
            <Tile dark label="Total balance" value={fmt(bal.total)} sub={`Cash ${fmt(bal.cash)} · Bank ${fmt(bal.bank)}`} icon={RiWalletLine} onClick={go('/transactions')} />
            <Tile label="Clients" value={clients.length} sub={`${openLeads.length} open lead${openLeads.length === 1 ? '' : 's'}`} icon={RiGroupLine} onClick={go('/crm')} />
            <Tile label="Active projects" value={activeProjects.length} sub={`${projects.filter(p => p.status === 'Completed').length} completed`} icon={RiFolder3Line} onClick={go('/projects')} />
            <Tile label="Team" value={activeEmployees.length} sub={pendingSalaries.length > 0 ? `${pendingSalaries.length} salary pending` : 'All paid this month'} icon={RiTeamLine} onClick={go('/employees')} />
          </div>
          <FinanceOverview txs={txs} projects={projects} />
        </div>

        {/* Things that need attention today */}
        {(overdueFollowups.length > 0 || todayFollowups.length > 0 || pendingSalaries.length > 0) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {overdueFollowups.length > 0 && (
              <AlertPill tone="bad" icon={RiAlarmWarningLine} onClick={go('/crm')}>
                {overdueFollowups.length} overdue follow-up{overdueFollowups.length > 1 ? 's' : ''}
              </AlertPill>
            )}
            {todayFollowups.length > 0 && (
              <AlertPill tone="brand" icon={RiCalendarEventLine} onClick={go('/crm')}>
                {todayFollowups.length} follow-up{todayFollowups.length > 1 ? 's' : ''} today
              </AlertPill>
            )}
            {pendingSalaries.length > 0 && (
              <AlertPill tone="warn" icon={RiTimeLine} onClick={go('/employees')}>
                Salary due: {pendingSalaries.map(e => e.name).join(', ')}
              </AlertPill>
            )}
          </div>
        )}

        {/* Who is in today (hidden when attendance cannot be read) */}
        <TodayAttendance />

        <div className="rg-3">
          {/* Finance summary */}
          <section className="mac-card" style={{ padding: 20 }}>
            <CardHead title="Finance summary" hint="All time" action="Transactions" onAction={go('/transactions')} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['Total credit', bal.totalCredit, RiArrowRightUpLine, 'var(--good)', 'var(--good-soft)'],
                ['Total debit', bal.totalDebit, RiArrowRightDownLine, 'var(--bad)', 'var(--bad-soft)'],
              ].map(([label, value, Icon, fg, bg]) => (
                <button key={label} type="button" onClick={go('/transactions')} className="row-link" style={{ margin: 0, width: '100%', padding: '10px 12px', background: bg, justifyContent: 'space-between' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>
                    <Icon size={16} style={{ color: fg }} aria-hidden="true" />{label}
                  </span>
                  <span className="tabular" style={{ fontSize: 14, fontWeight: 600, color: fg }}>{fmt(value)}</span>
                </button>
              ))}
              <dl style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '6px 0 0', fontSize: 13.5 }}>
                {[['Cash balance', bal.cash], ['Bank balance', bal.bank]].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <dt className="muted">{l}</dt><dd className="tabular" style={{ fontWeight: 500 }}>{fmt(v)}</dd>
                  </div>
                ))}
                {bal.pendingReimburse > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--warn)' }}>
                    <dt>Pending reimbursement</dt><dd className="tabular" style={{ fontWeight: 500 }}>{fmt(bal.pendingReimburse)}</dd>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                  <dt style={{ fontWeight: 600 }}>Total balance</dt>
                  <dd className="tabular" style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.011em' }}>{fmt(bal.total)}</dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Client pipeline */}
          <section className="mac-card" style={{ padding: 20 }}>
            <CardHead title="Leads by status" hint={`${clients.length} total`} action="CRM" onAction={go('/crm')} />
            <IbcsBars share rows={PIPELINE.map(([status, tone]) => ({ name: status, tone, value: clients.filter(c => c.status === status).length }))} empty="No leads yet." />
          </section>

          {/* Active projects */}
          <section className="mac-card" style={{ padding: 20 }}>
            <CardHead title="Active projects" hint={`${activeProjects.length} running`} action="Projects" onAction={go('/projects')} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeProjects.length === 0
                ? <Empty>No active projects</Empty>
                : activeProjects.slice(0, 5).map(p => {
                  const paid = (p.payments || []).reduce((s, x) => s + (+x.amount || 0), 0);
                  const pct  = p.valuation ? Math.min(100, Math.round((paid / +p.valuation) * 100)) : 0;
                  return (
                    <button key={p.id} type="button" className="mac-card card-link" onClick={go('/projects')} style={{ padding: '10px 12px', borderRadius: 'var(--r-md)', boxShadow: 'none' }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.projectName}</span>
                        <span className="tabular muted" style={{ fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{pct}% paid</span>
                      </span>
                      <span style={{ display: 'block', height: 4, borderRadius: 100, background: 'var(--surface-3)', overflow: 'hidden', marginBottom: 8 }}>
                        <span style={{ display: 'block', height: '100%', borderRadius: 100, background: 'var(--accent)', width: `${pct}%`, transition: 'width 500ms var(--ease)' }} />
                      </span>
                      <span className="faint" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.clientName || '—'}</span>
                        {p.dueDate && <span style={{ flexShrink: 0 }}>Due {fmtDate(p.dueDate)}</span>}
                      </span>
                    </button>
                  );
                })}
              {activeProjects.length > 5 && <button type="button" className="link" style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, fontSize: 13 }} onClick={go('/projects')}>+{activeProjects.length - 5} more</button>}
            </div>
          </section>
        </div>

        <div className="rg-3">
          {/* Recent transactions */}
          <section className="mac-card" style={{ padding: 20 }}>
            <CardHead title="Recent transactions" hint="Last 5" action="All" onAction={go('/transactions')} />
            {recentTx.length === 0
              ? <Empty>No transactions yet</Empty>
              : recentTx.map(t => {
                const credit = t.type === 'Credit';
                return (
                  <button key={t.id} type="button" className="row-link" onClick={go('/transactions')}>
                    <span style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: credit ? 'var(--good-soft)' : 'var(--bad-soft)', color: credit ? 'var(--good)' : 'var(--bad)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {credit ? <RiArrowRightUpLine size={16} aria-hidden="true" /> : <RiArrowRightDownLine size={16} aria-hidden="true" />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.remark || t.category || t.source || 'Transaction'}</span>
                      <span className="faint" style={{ display: 'block', fontSize: 12 }}>{fmtDate((t.date || '').split(' ')[0])}{t.accountType ? ` · ${t.accountType}` : ''}</span>
                    </span>
                    <span className={credit ? 'amount-in' : 'amount-out'} style={{ fontSize: 14, flexShrink: 0 }}>{credit ? '+' : '−'}{fmt(t.amount)}</span>
                  </button>
                );
              })}
          </section>

          {/* Hot leads */}
          <section className="mac-card" style={{ padding: 20 }}>
            <CardHead title="Leads to follow up" hint={`${overdueFollowups.length} overdue`} action="CRM" onAction={go('/crm')} />
            {leads.length === 0
              ? <Empty>No follow-ups planned</Empty>
              : leads.slice(0, 6).map(c => {
                const isOverdue = c.nextFollowup && c.nextFollowup < today;
                return (
                  <button key={c.id} type="button" className="row-link" onClick={go('/crm')}>
                    <Avatar name={c.clientName} size={32} title="" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.clientName}</span>
                        <Badge color={getStatusColor(c.interest || c.status)}>{c.interest || c.status}</Badge>
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: isOverdue ? 'var(--bad)' : 'var(--ink-3)', fontWeight: isOverdue ? 500 : 400 }}>
                        {c.nextFollowup ? `${isOverdue ? 'Overdue · ' : 'Follow up '}${fmtDate(c.nextFollowup)}` : 'No follow-up set'}
                      </span>
                    </span>
                    {c.projectType && <span className="faint hide-mobile" style={{ fontSize: 12, flexShrink: 0, maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.projectType}</span>}
                  </button>
                );
              })}
          </section>

          {/* Team */}
          <section className="mac-card" style={{ padding: 20 }}>
            <CardHead title="Team" hint={`${activeEmployees.length} active`} action="Employees" onAction={go('/employees')} />
            {activeEmployees.length === 0
              ? <Empty>No active employees</Empty>
              : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {activeEmployees.slice(0, 6).map(e => (
                    <li key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, minWidth: 0 }}>
                      <PersonChip person={{ kind: 'employee', id: e.id, name: e.name }} size={32} sub={e.role || true} />
                      {salaryDue.has(e.id) && <Badge color="orange">Salary due</Badge>}
                    </li>
                  ))}
                  {activeEmployees.length > 6 && <li><button type="button" className="link" style={{ background: 'none', border: 'none', padding: '6px 0 0', fontSize: 13 }} onClick={go('/employees')}>+{activeEmployees.length - 6} more</button></li>}
                </ul>
              )}
          </section>
        </div>
      </div>
    </div>
  );
}
