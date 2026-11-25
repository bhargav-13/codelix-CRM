// ================================================================
// Codelix OMS — the one WebSocket to the backend (/ws?ticket=<one-time ticket>).
// The ticket comes from POST /chat/socket-ticket; the access token never goes in the URL.
// Plain JSON frames: { type, channelId, data }.
//   realtime.connect() / disconnect()
//   realtime.on(type, fn)      → unsubscribe      ('*' receives every frame)
//   realtime.onReconnect(fn)   → unsubscribe      (runs after every re-open, not the first open)
//   realtime.onStatus(fn)      → unsubscribe      ('connecting' | 'open' | 'closed')
//   realtime.send(frame)       → true when it went out
// Reconnects by itself with a growing delay; a refused handshake (expired
// token) gets a fresh access token before the next attempt.
// ================================================================
import { API_URL, http, session, refreshSession } from './http';

const WS_URL = `${API_URL.replace(/^http/i, 'ws')}/ws`;
const PING_MS = 25000;
const MAX_DELAY = 30000;

const handlers = new Map();        // type → Set<fn>
const reconnectFns = new Set();
const statusFns = new Set();

let ws = null;
let wanted = false;
let status = 'closed';
let attempt = 0;
let everOpened = false;            // since connect(): decides "first open" vs "reconnect"
let retryTimer = null;
let pingTimer = null;
let opening = false;

function setStatus(s) {
  if (status === s) return;
  status = s;
  statusFns.forEach(fn => { try { fn(s); } catch (e) { console.error(e); } });
}

function dispatch(frame) {
  for (const key of [frame.type, '*']) {
    handlers.get(key)?.forEach(fn => { try { fn(frame); } catch (e) { console.error('realtime handler', e); } });
  }
}

function schedule() {
  clearTimeout(retryTimer);
  if (!wanted) return;
  const delay = Math.min(MAX_DELAY, 1000 * 2 ** Math.min(attempt, 5)) + Math.random() * 400;
  attempt++;
  retryTimer = setTimeout(open, delay);
}

async function open() {
  clearTimeout(retryTimer);
  if (!wanted || opening || (ws && ws.readyState <= 1)) return;
  opening = true;
  setStatus('connecting');
  try {
    // No token yet, or the last handshake was refused → get a fresh one first.
    let token = session.getAccessToken();
    if (!token || attempt > 0) token = (await refreshSession())?.accessToken || session.getAccessToken();
    if (!wanted) return;
    if (!token) { setStatus('closed'); schedule(); return; }
    const { ticket } = await http.post('/chat/socket-ticket', {});
    if (!wanted) return;

    const sock = new WebSocket(`${WS_URL}?ticket=${encodeURIComponent(ticket)}`);
    ws = sock;
    sock.onopen = () => {
      if (ws !== sock) return;
      attempt = 0;
      setStatus('open');
      clearInterval(pingTimer);
      pingTimer = setInterval(() => send({ type: 'ping' }), PING_MS);
      if (everOpened) reconnectFns.forEach(fn => { try { fn(); } catch (e) { console.error('realtime reconnect', e); } });
      everOpened = true;
    };
    sock.onmessage = ev => {
      if (ws !== sock) return;
      let frame;
      try { frame = JSON.parse(ev.data); } catch { return; }
      if (frame && typeof frame.type === 'string') dispatch(frame);
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      clearInterval(pingTimer);
      setStatus('closed');
      schedule();
    };
    sock.onerror = () => { /* onclose follows and handles the retry */ };
  } catch (e) {
    console.error('realtime connect', e);
    setStatus('closed');
    schedule();
  } finally {
    opening = false;
  }
}

function send(frame) {
  if (!ws || ws.readyState !== 1) return false;
  try { ws.send(JSON.stringify(frame)); return true; } catch { return false; }
}

// Back online / back on the tab: do not wait out the backoff delay.
function nudge() {
  if (!wanted || (ws && ws.readyState <= 1)) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  open();
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', nudge);
  document.addEventListener('visibilitychange', nudge);
}

const add = (set, fn) => { set.add(fn); return () => set.delete(fn); };

export const realtime = {
  connect() {
    if (wanted) return;
    wanted = true; attempt = 0; everOpened = false;
    open();
  },
  disconnect() {
    wanted = false;
    clearTimeout(retryTimer); clearInterval(pingTimer);
    const sock = ws; ws = null;
    if (sock) { try { sock.close(); } catch { /* already closed */ } }
    setStatus('closed');
  },
  // Drop the socket and open it again with the current access token (after a new sign-in).
  reauth() {
    if (!wanted) return;
    const sock = ws; ws = null;
    clearInterval(pingTimer);
    if (sock) { try { sock.close(); } catch { /* already closed */ } }
    attempt = 0;
    open();
  },
  on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    return add(handlers.get(type), fn);
  },
  onReconnect: fn => add(reconnectFns, fn),
  onStatus: fn => add(statusFns, fn),
  send,
  status: () => status,
};
