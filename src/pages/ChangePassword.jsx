import { useState } from 'react';
import { RiKey2Line, RiLogoutBoxRLine } from '@remixicon/react';
import { useAuth } from '../contexts/AuthContext';
import '../components/ui/theme';
import { Button } from '../components/ui/Button';
import { PasswordForm } from '../components/layout/PasswordForm';

// Shown after an access admin creates or resets a login: the temporary
// password must be replaced before the app opens. (Changing it later, by
// choice, is the dialog in the account menu — the same form.)
export default function ChangePassword() {
  const { user, logout } = useAuth();
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="auth-screen single">
      <main className="auth-panel">
        <div className="auth-card">
          <div style={{ textAlign: 'center' }}>
            <span className="empty-icon" style={{ margin: '0 auto 14px', width: 56, height: 56, borderRadius: 16, background: 'var(--brand-soft)', color: 'var(--brand)', boxShadow: 'inset 0 0 0 1px var(--color-primary-alpha-16)' }}>
              <RiKey2Line size={26} />
            </span>
            <h1 className="auth-title" style={{ fontSize: 20, lineHeight: '28px' }}>Set your password</h1>
            <p className="auth-sub">You signed in with a temporary password. Choose your own to continue.</p>
            {user?.email && <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '4px 0 0', overflowWrap: 'anywhere' }}>{user.email}</p>}
          </div>

          {/* The temporary password just typed at sign-in is reused; the form asks for it only if it is no longer known. */}
          <PasswordForm id="set-password-form" currentLabel="Temporary password" onBusy={setSaving} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button type="submit" form="set-password-form" fullWidth loading={saving} loadingText="Saving…">Save password and continue</Button>
            <Button fullWidth variant="neutral" mode="stroke" leftIcon={RiLogoutBoxRLine} disabled={saving} loading={leaving} loadingText="Signing out…"
              onClick={() => { setLeaving(true); logout(); }}>Sign out</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
