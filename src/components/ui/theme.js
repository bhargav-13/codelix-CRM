// The app has one theme: light. This module only makes sure a `dark` class left behind by an
// older version (or a saved choice) is cleared, so the dark tokens in the stylesheets never apply.
if (typeof document !== 'undefined') {
  const root = document.documentElement;
  root.classList.remove('dark');
  root.dataset.theme = 'light';
  try { localStorage.removeItem('codelix.theme'); } catch { /* storage blocked: nothing to clear */ }
}

export function useTheme() {
  return { theme: 'light', resolved: 'light' };
}
