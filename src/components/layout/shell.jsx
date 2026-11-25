// Shell state shared by the sidebar, the top bar and pages:
//   const { collapsed, toggleCollapsed, openPalette, openChangePassword } = useShell();
// (The phone slide-in drawer state stays in contexts/LayoutContext.)
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  RiArchiveLine, RiCalendarCheckLine, RiChat3Line, RiFlightTakeoffLine, RiFolder3Line, RiGroupLine, RiHandCoinLine,
  RiKanbanView, RiKey2Line, RiLayoutGridLine, RiLineChartLine, RiMoneyRupeeCircleLine, RiShieldCheckLine, RiTeamLine,
} from '@remixicon/react';
import { useAuth } from '../../contexts/AuthContext';

const noop = () => {};
export const ShellContext = createContext({ collapsed: false, toggleCollapsed: noop, openPalette: noop, openChangePassword: noop });
export const useShell = () => useContext(ShellContext);

// ── Navigation, grouped the way people look for things ────────────
const PARTNER_NAV = [
  { title: 'Overview', items: [
    { icon: RiLayoutGridLine, label: 'Dashboard', to: '/', keywords: 'home overview' },
    { icon: RiLineChartLine, label: 'P&L Reports', to: '/reports', keywords: 'profit loss finance report' },
  ] },
  { title: 'Business', items: [
    { icon: RiGroupLine, label: 'CRM', to: '/crm', keywords: 'clients leads customers follow-up' },
    { icon: RiFolder3Line, label: 'Projects', to: '/projects', keywords: 'work payments' },
    { icon: RiArchiveLine, label: 'Past Projects', to: '/existing-projects', keywords: 'archive existing old' },
    { icon: RiMoneyRupeeCircleLine, label: 'Transactions', to: '/transactions', keywords: 'money cash bank credit debit expenses' },
  ] },
  { title: 'Team', items: [
    { icon: RiKanbanView, label: 'Work', to: '/tasks', keywords: 'tasks board backlog sprint issues timesheet' },
    { icon: RiChat3Line, label: 'Chat', to: '/chat', keywords: 'messages dm groups' },
    { icon: RiTeamLine, label: 'Employees', to: '/employees', keywords: 'staff salary people hr' },
  ] },
  { title: 'People', items: [
    { icon: RiCalendarCheckLine, label: 'Attendance', to: '/attendance', keywords: 'punch present absent late holidays rules office hours' },
    { icon: RiFlightTakeoffLine, label: 'Leave', to: '/leave', keywords: 'time off holiday vacation approve balance' },
    { icon: RiHandCoinLine, label: 'Payroll', to: '/payroll', keywords: 'salary payslip advance pay run' },
  ] },
  { title: 'Admin', items: [
    { icon: RiKey2Line, label: 'Credentials', to: '/credentials', keywords: 'passwords logins vault' },
    { icon: RiShieldCheckLine, label: 'Users & Access', to: '/access', adminOnly: true, keywords: 'permissions roles logins' },
  ] },
];
const EMPLOYEE_NAV = [
  { title: 'Workspace', items: [
    { icon: RiLayoutGridLine, label: 'Home', to: '/', always: true, keywords: 'today overview dashboard' },
    { icon: RiKanbanView, label: 'My Work', to: '/tasks', modules: ['tasks', 'projects', 'timesheet'], keywords: 'tasks board timesheet' },
    { icon: RiChat3Line, label: 'Chat', to: '/chat', modules: ['chat'], keywords: 'messages dm groups' },
  ] },
  // Their own attendance, leave and payslips: every employee with a login, no grant needed
  { title: 'People', items: [
    { icon: RiCalendarCheckLine, label: 'Attendance', to: '/attendance', always: true, keywords: 'punch in out present late' },
    { icon: RiFlightTakeoffLine, label: 'Leave', to: '/leave', always: true, keywords: 'time off holiday vacation balance request' },
    { icon: RiHandCoinLine, label: 'My payslips', to: '/payroll', always: true, keywords: 'salary payroll pay slip' },
  ] },
];

// The sections this person may see.
export function useNavSections() {
  const { isEmployee, isAccessAdmin, can } = useAuth();
  return useMemo(() => (isEmployee ? EMPLOYEE_NAV : PARTNER_NAV)
    .map(s => ({ ...s, items: s.items.filter(i => (isEmployee ? i.always || i.modules.some(m => can(m)) : !i.adminOnly || isAccessAdmin)) }))
    .filter(s => s.items.length > 0), [isEmployee, isAccessAdmin, can]);
}

// "bhargav.codelix@gmail.com" → "Bhargav"
function nameFromEmail(email = '') {
  const part = String(email).split('@')[0].split(/[._]/)[0];
  return part ? part.charAt(0).toUpperCase() + part.slice(1) : '';
}

// Who is signed in, ready to show: { name, role, email, avatarUrl }
export function useMeSummary() {
  const { user, me, isEmployee, employeeData, displayName } = useAuth();
  const name = me?.fullName || (isEmployee ? employeeData?.name : displayName) || displayName || nameFromEmail(user?.email) || 'Account';
  const role = isEmployee ? (me?.jobTitle || employeeData?.role || 'Employee') : (me?.jobTitle || 'Partner');
  return { name, role, email: me?.email || user?.email || '', avatarUrl: me?.avatarUrl || null };
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}
