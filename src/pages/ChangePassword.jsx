import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { KeyRound, LogOut, Loader2 } from 'lucide-react';

// Shown after an access admin creates or resets a login: the temporary
// password must be replaced before the app opens.
export default function ChangePassword() {
  const { user, changePassword, logout } = useAuth();
  const [pw, setPw]       = useState('');
  const [pw2, setPw2]     = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const strongEnough = pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!strongEnough) return setError('Use at least 8 characters with letters and numbers.');
    if (pw !== pw2)    return setError('The two passwords do not match.');
    setSaving(true);
    const { error: err } = await changePassword(pw);
    setSaving(false);
    if (err) setError(err.message || 'Could not change password.');
  }

  const inputStyle = {
    width: '100%', padding: '11px 13px', borderRadius: 11, fontSize: 14,
    border: '1px solid rgba(0,0,0,0.1)', background: '#fff', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #F2F2F7 0%, #E5E5EA 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 20, padding: 28, boxShadow: '0 4px 24px rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(0,113,227,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
          <KeyRound size={22} color="#0071E3" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: '#1D1D1F', margin: '0 0 6px' }}>Set your password</h1>
          <p style={{ fontSize: 13, color: '#6E6E73', margin: 0, lineHeight: 1.5 }}>
            You signed in with a temporary password. Choose your own to continue.
          </p>
          <p style={{ fontSize: 12, color: '#AEAEB2', margin: '6px 0 0' }}>{user?.email}</p>
        </div>
        <input type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={e => setPw(e.target.value)} style={inputStyle} />
        <input type="password" autoComplete="new-password" placeholder="Confirm new password" value={pw2} onChange={e => setPw2(e.target.value)} style={inputStyle} />
        {error && <div style={{ fontSize: 12.5, color: '#FF3B30' }}>{error}</div>}
        <button type="submit" disabled={saving} className="mac-btn mac-btn-primary" style={{ width: '100%', fontSize: 14, justifyContent: 'center' }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : null} Save password
        </button>
        <button type="button" onClick={logout} className="mac-btn mac-btn-ghost" style={{ width: '100%', fontSize: 13, justifyContent: 'center' }}>
          <LogOut size={13} /> Sign out
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </form>
    </div>
  );
}
