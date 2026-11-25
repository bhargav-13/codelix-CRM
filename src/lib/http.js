// ================================================================
// Codelix OMS — HTTP client for the Spring Boot backend.
// One place for: base URL, the access token, 401 → refresh → retry, and
// turning error responses into Error objects with a readable message.
// The refresh token is an HttpOnly cookie (oms_rt) that only the server can
// read — page code never sees it. All this file remembers in storage is a
// harmless "a session may exist" flag, so a fresh visit doesn't try to refresh.
// ================================================================
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8081').replace(/\/$/, '');
const BASE = `${API_URL}/api/v1`;
export const SESSION_FLAG = 'codelix.session';
const OLD_RT_KEY = 'codelix.refreshToken';           // where older builds kept the token itself

let accessToken = null;
let refreshing = null;                 // single-flight refresh promise
const listeners = new Set();           // called with the user object, or null when signed out

const writeFlag = on => { try { on ? localStorage.setItem(SESSION_FLAG, '1') : localStorage.removeItem(SESSION_FLAG); } catch { /* storage blocked */ } };
try { localStorage.removeItem(OLD_RT_KEY); } catch { /* storage blocked */ }

function setSession(auth) {
  accessToken = auth?.accessToken || null;
  writeFlag(!!accessToken);
}

export class ApiError extends Error {
  constructor(message, status, body) { super(message); this.name = 'ApiError'; this.status = status; this.body = body; }
}

async function parse(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

// The backend answers errors as { statusCode, errors: [{ status, message }] }.
function messageFrom(status, body, path = '') {
  if (status === 0) return 'Cannot reach the server. Check your connection.';
  const list = body && typeof body === 'object' ? (body.errors || body.details) : null;
  const fromServer = Array.isArray(list) && list.length
    ? list.map(e => (typeof e === 'string' ? e : e?.message)).filter(Boolean).join('; ')
    : (body && typeof body === 'object' ? body.message || body.error : null);
  if (status === 401 && path.startsWith('/auth/login')) return 'Incorrect email or password.';
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (fromServer) return fromServer;
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'That item no longer exists.';
  if (status === 409) return 'Someone else changed this just now. Reload and try again.';
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (status >= 500) return 'The server had a problem. Please try again.';
  return typeof body === 'string' && body ? body : `Request failed (${status})`;
}

async function raw(method, path, body, { auth = true, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  // The sign-in cookie only exists for /auth/* (its path), so only those calls carry it.
  const credentials = path.startsWith('/auth/') ? 'include' : 'same-origin';
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, signal, credentials, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(messageFrom(0), 0, null);
  }
  return res;
}

// Exchange the refresh cookie for a new session. Resolves to the auth
// payload, or null when there is no valid session.
export function refreshSession() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await raw('POST', '/auth/refresh', {}, { auth: false });
      if (!res.ok) {
        // 400/401 = token rejected → signed out. Anything else (server down) keeps the token for a later retry.
        if (res.status === 400 || res.status === 401) { setSession(null); listeners.forEach(fn => fn(null)); }
        return null;
      }
      const auth = await parse(res);
      setSession(auth);
      return auth;
    } catch { return null; } finally { refreshing = null; }
  })();
  return refreshing;
}

async function request(method, path, body, opts = {}) {
  let res = await raw(method, path, body, opts);
  if (res.status === 401 && opts.auth !== false) {
    const auth = await refreshSession();
    if (auth) res = await raw(method, path, body, opts);
  }
  const data = await parse(res);
  if (!res.ok) throw new ApiError(messageFrom(res.status, data, path), res.status, data);
  return data;
}

// query({ a: 1, b: undefined, c: [1,2] }) → "?a=1&c=1,2"
export function query(params = {}) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : v)}`);
  return q.length ? `?${q.join('&')}` : '';
}

export const http = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body = {}, opts) => request('POST', path, body, opts),
  put: (path, body = {}, opts) => request('PUT', path, body, opts),
  patch: (path, body = {}, opts) => request('PATCH', path, body, opts),
  del: (path, opts) => request('DELETE', path, undefined, opts),
};

export const session = {
  // → { user } on success; throws ApiError with a readable message otherwise
  async login(email, password) {
    const auth = await request('POST', '/auth/login', { email, password }, { auth: false });
    setSession(auth);
    listeners.forEach(fn => fn(auth.user));
    return auth;
  },
  async logout() {
    try { await raw('POST', '/auth/logout', {}); } catch { /* signing out anyway */ }
    setSession(null);
    listeners.forEach(fn => fn(null));
  },
  // Called once on app start: restores the session from the refresh cookie.
  async restore() {
    const auth = await refreshSession();
    return auth ? auth.user : null;
  },
  me: () => http.get('/auth/me'),
  hasToken: () => !!accessToken,
  getAccessToken: () => accessToken,
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
