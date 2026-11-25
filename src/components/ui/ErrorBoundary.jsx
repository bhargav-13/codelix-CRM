// Catches a crash while rendering and shows a readable card instead of an
// empty screen. `resetKey` (e.g. the current path) clears the error when it
// changes, so moving to another page recovers without a reload.
//   <ErrorBoundary resetKey={pathname}>…</ErrorBoundary>
//   <ErrorBoundary fullScreen>…</ErrorBoundary>
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error) { return { error }; }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error, info) { console.error('Render error:', error, info?.componentStack); }

  render() {
    if (!this.state.error) return this.props.children;
    const card = (
      <div className="mac-card empty-panel" role="alert" style={{ maxWidth: 460, width: '100%', margin: '0 auto' }}>
        <span className="empty-icon" style={{ color: 'var(--bad)', background: 'var(--bad-soft)', boxShadow: 'none', fontSize: 22, fontWeight: 600 }} aria-hidden="true">!</span>
        <div className="empty-title">Something went wrong</div>
        <div className="empty-text">This screen could not be shown. Reloading usually fixes it — your saved data is not affected.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="mac-btn mac-btn-primary" onClick={() => window.location.reload()}>Reload</button>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
        {import.meta.env?.DEV && <pre style={{ marginTop: 8, maxWidth: '100%', overflow: 'auto', fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'left', whiteSpace: 'pre-wrap' }}>{String(this.state.error?.message || this.state.error)}</pre>}
      </div>
    );
    return this.props.fullScreen
      ? <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', padding: 24, background: 'var(--canvas)' }}>{card}</div>
      : <div className="page-body" style={{ paddingTop: 48 }}>{card}</div>;
  }
}
