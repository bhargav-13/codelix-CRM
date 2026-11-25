import { useRef, useState } from 'react';
import { RiAlertFill, RiEyeLine, RiEyeOffLine, RiFolderChartLine, RiLock2Line, RiMailLine, RiTeamLine, RiWalletLine } from '@remixicon/react';
import { useAuth } from '../contexts/AuthContext';
import '../components/ui/theme';
import codelixLogo from '../assets/codelix.svg';
import { Field } from '../components/ui/kit';
import { TextInput } from '../components/ui/Input';
import { Button, IconButton } from '../components/ui/Button';

const POINTS = [
  { icon: RiWalletLine, title: 'Money in one place', text: 'Cash, bank and every project payment, with profit and loss always up to date.' },
  { icon: RiFolderChartLine, title: 'Clients and projects', text: 'From the first follow-up to the final invoice.' },
  { icon: RiTeamLine, title: 'The whole team', text: 'Tasks, chat, timesheets and salaries together.' },
];

export default function Login() {
  const { login } = useAuth();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // The button is never disabled: browsers autofill these fields without telling
  // React, so the values are read from the form itself when it is submitted.
  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    const data = new FormData(e.currentTarget);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');

    const missing = {};
    if (!email) missing.email = 'Enter your email address.';
    else if (!/^\S+@\S+\.\S+$/.test(email)) missing.email = 'This does not look like an email address.';
    if (!password) missing.password = 'Enter your password.';
    setFieldErrors(missing);
    setError('');
    if (missing.email) { emailRef.current?.focus(); return; }
    if (missing.password) { passwordRef.current?.focus(); return; }

    setLoading(true);
    let failure = null;
    try {
      const result = await login(email, password);
      failure = result?.error || null;
    } catch (err) { failure = err; }
    // on success the app replaces this screen; on failure the form is usable again at once
    setLoading(false);
    if (failure) {
      setError(failure.status === 0 || failure.name === 'TypeError'
        ? 'Cannot reach the server. Check your connection and try again.'
        : failure.message || 'Could not sign you in. Please try again.');
      passwordRef.current?.focus();
      passwordRef.current?.select?.();
    }
  }

  const clearError = key => { if (fieldErrors[key]) setFieldErrors(x => ({ ...x, [key]: undefined })); };

  return (
    <div className="auth-screen">
      <aside className="auth-art" aria-hidden="true">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 44, height: 44, borderRadius: 13, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px -8px #0d1f5299' }}>
            <img src={codelixLogo} alt="" style={{ width: 19, height: 'auto' }} />
          </span>
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em' }}>Codelix</span>
        </div>

        <div style={{ maxWidth: 440 }}>
          <h2 style={{ fontSize: 36, lineHeight: '44px', fontWeight: 600, letterSpacing: '-0.025em', margin: 0 }}>Run the whole office from one place.</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: '32px 0 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: '#ffffff24', boxShadow: 'inset 0 0 0 1px #ffffff29', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} />
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600, lineHeight: '20px' }}>{title}</span>
                  <span style={{ display: 'block', fontSize: 14, lineHeight: '20px', color: '#ffffffd9', marginTop: 2 }}>{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ fontSize: 13, color: '#ffffffc2' }}>Codelix Office Management</div>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <div>
            <span className="auth-logo"><img src={codelixLogo} alt="" /></span>
            <h1 className="auth-title" style={{ marginTop: 20 }}>Welcome back</h1>
            <p className="auth-sub">Sign in to Codelix OMS to continue.</p>
          </div>

          {error && (
            <div className="auth-alert" role="alert">
              <RiAlertFill size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Email" error={fieldErrors.email}>
              {id => (
                <TextInput ref={emailRef} id={id} name="email" type="email" leftIcon={RiMailLine} autoComplete="username" inputMode="email"
                  placeholder="you@codelix.in" hasError={!!fieldErrors.email} autoFocus
                  onChange={() => { clearError('email'); if (error) setError(''); }} />
              )}
            </Field>

            <Field label="Password" error={fieldErrors.password}>
              {id => (
                <TextInput ref={passwordRef} id={id} name="password" type={showPass ? 'text' : 'password'} leftIcon={RiLock2Line} autoComplete="current-password"
                  placeholder="Your password" hasError={!!fieldErrors.password}
                  onChange={() => { clearError('password'); if (error) setError(''); }}
                  right={<IconButton size="small" icon={showPass ? RiEyeOffLine : RiEyeLine} label={showPass ? 'Hide password' : 'Show password'} aria-pressed={showPass} onClick={() => setShowPass(v => !v)} />} />
              )}
            </Field>

            <Button type="submit" fullWidth loading={loading} loadingText="Signing in…" style={{ marginTop: 4 }}>Sign in</Button>
          </form>

          <p style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: '18px', margin: 0 }}>
            Forgot your password? Ask a partner to reset it in Users &amp; Access.
          </p>
        </div>
      </main>
    </div>
  );
}
