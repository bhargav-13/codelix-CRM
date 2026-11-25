import { useState } from 'react';
import { RiLock2Line, RiLogoutBoxRLine, RiRefreshLine } from '@remixicon/react';
import { useAuth } from '../contexts/AuthContext';
import '../components/ui/theme';
import { Button } from '../components/ui/Button';

// Shown when the signed-in account has no access row, or no modules assigned yet.
export default function NoAccess() {
  const { user, employeeData, logout } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const firstName = employeeData?.name?.split(' ')[0];

  return (
    <div className="auth-screen single">
      <main className="auth-panel">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <span className="empty-icon" style={{ margin: '0 auto', width: 56, height: 56, borderRadius: 16, background: 'var(--brand-soft)', color: 'var(--brand)', boxShadow: 'inset 0 0 0 1px var(--color-primary-alpha-16)' }}>
            <RiLock2Line size={26} />
          </span>
          <div>
            <h1 className="auth-title" style={{ fontSize: 20, lineHeight: '28px' }}>
              {firstName ? `${firstName}, you don't have access yet` : "You don't have access yet"}
            </h1>
            <p className="auth-sub" style={{ marginTop: 8 }}>
              You are signed in, but no part of Codelix OMS has been switched on for this account.
            </p>
          </div>

          <div style={{ textAlign: 'left', background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: 14, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>What to do</div>
            <ol style={{ margin: 0, paddingLeft: 18, listStyle: 'decimal' }}>
              <li>Ask a partner to give this account access in <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>Users &amp; Access</strong>.</li>
              <li>Once they confirm, choose <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>Try again</strong>.</li>
            </ol>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', overflowWrap: 'anywhere' }}>
              Signed in as <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{user?.email || 'unknown account'}</strong>
              {employeeData?.empId ? ` · ID ${employeeData.empId}` : ''}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button fullWidth leftIcon={RiRefreshLine} loading={checking} loadingText="Checking…" onClick={() => { setChecking(true); window.location.reload(); }}>Try again</Button>
            <Button fullWidth variant="neutral" mode="stroke" leftIcon={RiLogoutBoxRLine} loading={leaving} loadingText="Signing out…"
              onClick={() => { setLeaving(true); logout(); }}>Sign out</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
