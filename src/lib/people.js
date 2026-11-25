// ================================================================
// Codelix OMS — people directory (partners + active employees) and my profile.
// A person ref everywhere in the app is { kind: 'partner' | 'employee', id, name }:
//   partner  → id is the user id      employee → id is the employee id
// ================================================================
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { http, session } from './http';

export const peopleAPI = {
  // [ { kind, id, name, userId, employeeId, email, phone, jobTitle, avatarUrl, role, active } ]
  list: async () => (await http.get('/people')) || [],
  get: (kind, id) => http.get(`/people/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`),
};

export const profileAPI = {
  get: () => http.get('/me/profile'),
  update: patch => http.put('/me/profile', patch),
};

export const personKeyOf = p => `${p.kind}:${p.id}`;
// Label shown under a name in pickers
export const roleLabel = p => (p.kind === 'partner' ? 'Partner' : p.jobTitle || 'Team');

// ── one shared, cached copy of the directory ──────────────────────
let state = { people: [], loading: true, error: null, loaded: false };
let inflight = null;
const subscribers = new Set();
const setState = patch => { state = { ...state, ...patch }; subscribers.forEach(fn => fn()); };
const subscribe = fn => { subscribers.add(fn); return () => subscribers.delete(fn); };
const snapshot = () => state;

let generation = 0;

export function refreshPeople() {
  if (inflight) return inflight;
  if (!state.loaded) setState({ loading: true });
  const gen = generation;
  const run = peopleAPI.list()
    .then(people => { if (gen === generation) setState({ people, loading: false, error: null, loaded: true }); return people; })
    .catch(error => { console.error('people directory', error); if (gen === generation) setState({ loading: false, error }); return []; })
    .finally(() => { if (inflight === run) inflight = null; });
  inflight = run;
  return run;
}

// a different person signed in (or nobody) → the cached list is no longer theirs
session.onChange(() => { generation++; inflight = null; setState({ people: [], loading: true, error: null, loaded: false }); });

// usePeople() → { people, loading, byKey, error, refresh }
// byKey is a Map keyed "<kind>:<id>". Every caller shares one fetch.
export function usePeople() {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { if (!s.loaded && !inflight && !s.error) refreshPeople(); }, [s.loaded, s.error]);
  const byKey = useMemo(() => new Map(s.people.map(p => [personKeyOf(p), p])), [s.people]);
  return useMemo(() => ({ people: s.people, loading: s.loading, error: s.error, byKey, refresh: refreshPeople }), [s, byKey]);
}
