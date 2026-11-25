// Light / dark / system theme. No provider needed: one small store that puts
// the `dark` class on <html> (the AlignUI tokens switch on that class).
//   const { theme, resolved, setTheme, toggle } = useTheme();
// `theme` is what the person chose ('system' by default), `resolved` is what is
// showing right now ('light' | 'dark'). index.html applies the same choice
// before first paint, so there is no flash on load.
import { useSyncExternalStore } from 'react';

const KEY = 'codelix.theme';
const CHOICES = ['light', 'dark', 'system'];
const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';
const media = hasDom && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function readChoice() {
  try { const v = localStorage.getItem(KEY); return CHOICES.includes(v) ? v : 'system'; } catch { return 'system'; }
}
const resolve = choice => (choice === 'system' ? (media?.matches ? 'dark' : 'light') : choice);

let state = { theme: hasDom ? readChoice() : 'system', resolved: 'light' };
state.resolved = hasDom ? resolve(state.theme) : 'light';
const listeners = new Set();

function apply() {
  if (!hasDom) return;
  const root = document.documentElement;
  // no transitions while every colour on the page changes at once
  root.classList.add('theme-switching');
  root.classList.toggle('dark', state.resolved === 'dark');
  root.dataset.theme = state.resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.resolved === 'dark' ? '#0e121b' : '#f2f5f8');
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
}

function set(next) {
  state = next;
  apply();
  listeners.forEach(fn => fn());
}

export function setTheme(theme) {
  if (!CHOICES.includes(theme)) return;
  try { localStorage.setItem(KEY, theme); } catch { /* storage blocked — the choice lasts for this visit */ }
  set({ theme, resolved: resolve(theme) });
}

if (hasDom) {
  apply();
  // follow the system while the choice is "system"
  media?.addEventListener?.('change', () => { if (state.theme === 'system') set({ theme: 'system', resolved: resolve('system') }); });
  // another tab changed it
  window.addEventListener('storage', e => { if (e.key === KEY) { const theme = readChoice(); set({ theme, resolved: resolve(theme) }); } });
}

const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => state;

export function useTheme() {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { theme: s.theme, resolved: s.resolved, setTheme, toggle: () => setTheme(s.resolved === 'dark' ? 'light' : 'dark') };
}

export const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];
