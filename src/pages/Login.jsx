import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

export default function Login() {
  const { login, signUp } = useAuth();
  const [mode, setMode]       = useState('signin');   // 'signin' | 'signup'
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password || loading) return;
    setError('');
    setLoading(true);

    const { error: err } = mode === 'signin'
      ? await login(email.trim(), password)
      : await signUp(email.trim(), password);

    if (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
    }}>

      {/* Background blobs */}
      <div style={{ position:'fixed', inset:0, overflow:'hidden', pointerEvents:'none' }}>
        <div style={{ position:'absolute', top:'-10%', right:'-5%', width:500, height:500, borderRadius:'50%', background:'rgba(0,113,227,0.12)', filter:'blur(80px)' }}/>
        <div style={{ position:'absolute', bottom:'-10%', left:'-5%', width:400, height:400, borderRadius:'50%', background:'rgba(175,82,222,0.1)', filter:'blur(80px)' }}/>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'rgba(255,255,255,0.97)',
        borderRadius: 24,
        padding: '40px 36px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)',
        position: 'relative',
        zIndex: 1,
      }}>

        {/* Brand */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg,#0071E3,#0A84FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 8px 24px rgba(0,113,227,0.35)',
          }}>
            <span style={{ color:'#fff', fontSize:22, fontWeight:800, letterSpacing:'-1px' }}>C</span>
          </div>
          <h1 style={{ fontSize:24, fontWeight:700, color:'#1D1D1F', letterSpacing:'-0.6px', margin:0 }}>
            Codelix CRM
          </h1>
          <p style={{ fontSize:13.5, color:'#8E8E93', marginTop:6 }}>
            {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            display:'flex', alignItems:'flex-start', gap:8,
            padding:'10px 12px', borderRadius:10, marginBottom:18,
            background:'rgba(255,59,48,0.07)', border:'1px solid rgba(255,59,48,0.2)',
          }}>
            <AlertCircle size={14} color="#FF3B30" style={{ flexShrink:0, marginTop:1 }}/>
            <span style={{ fontSize:12.5, color:'#FF3B30', lineHeight:1.5 }}>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Email */}
          <div>
            <label style={{ display:'block', fontSize:11.5, fontWeight:550, color:'#6E6E73', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.4px' }}>
              Email
            </label>
            <div style={{ position:'relative' }}>
              <Mail size={15} color="#AEAEB2" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}/>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="you@codelix.in"
                required
                style={{
                  width:'100%', boxSizing:'border-box',
                  padding:'10px 12px 10px 36px',
                  borderRadius:10, border:'1.5px solid rgba(0,0,0,0.12)',
                  background:'#fff', fontSize:14, color:'#1D1D1F',
                  outline:'none', transition:'border-color 0.15s',
                  fontFamily:'inherit',
                }}
                onFocus={e => e.target.style.borderColor = '#0071E3'}
                onBlur={e  => e.target.style.borderColor = 'rgba(0,0,0,0.12)'}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display:'block', fontSize:11.5, fontWeight:550, color:'#6E6E73', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.4px' }}>
              Password
            </label>
            <div style={{ position:'relative' }}>
              <Lock size={15} color="#AEAEB2" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}/>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder={mode === 'signin' ? '••••••••' : 'Min. 6 characters'}
                required
                style={{
                  width:'100%', boxSizing:'border-box',
                  padding:'10px 40px 10px 36px',
                  borderRadius:10, border:'1.5px solid rgba(0,0,0,0.12)',
                  background:'#fff', fontSize:14, color:'#1D1D1F',
                  outline:'none', transition:'border-color 0.15s',
                  fontFamily:'inherit',
                }}
                onFocus={e => e.target.style.borderColor = '#0071E3'}
                onBlur={e  => e.target.style.borderColor = 'rgba(0,0,0,0.12)'}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', padding:4, color:'#AEAEB2' }}
              >
                {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              marginTop:4,
              padding:'12px',
              borderRadius:11,
              border:'none',
              background: loading || !email || !password
                ? 'rgba(0,113,227,0.4)'
                : 'linear-gradient(135deg,#0071E3,#0A84FF)',
              color:'#fff',
              fontSize:14.5,
              fontWeight:600,
              cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              transition:'opacity 0.15s',
              fontFamily:'inherit',
            }}
          >
            {loading
              ? <><Loader2 size={16} style={{ animation:'spin 0.8s linear infinite' }}/> {mode === 'signin' ? 'Signing in…' : 'Creating account…'}</>
              : mode === 'signin' ? 'Sign In' : 'Create Account'
            }
          </button>
        </form>

        {/* Mode toggle */}
        <div style={{ textAlign:'center', marginTop:22, paddingTop:18, borderTop:'1px solid rgba(0,0,0,0.07)' }}>
          {mode === 'signin' ? (
            <p style={{ fontSize:13, color:'#8E8E93', margin:0 }}>
              First time partner?{' '}
              <button onClick={() => { setMode('signup'); setError(''); }} style={{ background:'none', border:'none', cursor:'pointer', color:'#0071E3', fontWeight:600, fontSize:13, padding:0, fontFamily:'inherit' }}>
                Create account
              </button>
            </p>
          ) : (
            <p style={{ fontSize:13, color:'#8E8E93', margin:0 }}>
              Already have an account?{' '}
              <button onClick={() => { setMode('signin'); setError(''); }} style={{ background:'none', border:'none', cursor:'pointer', color:'#0071E3', fontWeight:600, fontSize:13, padding:0, fontFamily:'inherit' }}>
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
