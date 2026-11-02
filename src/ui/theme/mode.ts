import type { ThemeMode } from '../../domain/types';
import { setSystemTheme } from '../../platform/native';

/**
 * Light, dark, or whatever the phone is set to. The resolved choice is `data-theme` on <html>,
 * which switches the palette in tokens.css; the status and navigation bars follow it too.
 */

/** Read by the script in index.html so the first paint already has the right background. */
export const THEME_HINT_KEY = 'classday.theme';

const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export function isDark(mode: ThemeMode): boolean {
  return mode === 'dark' || (mode === 'system' && Boolean(darkQuery()?.matches));
}

let applied = '';

export function applyTheme(mode: ThemeMode) {
  const dark = isDark(mode);
  if (applied === `${mode}:${dark}`) return;
  applied = `${mode}:${dark}`;
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  // Browsers pick whichever theme-color matches the phone's setting, so both get the app's.
  const background = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (background) for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = background;
  try {
    localStorage.setItem(THEME_HINT_KEY, mode);
  } catch {
    // Without storage the first paint follows the phone; the saved choice still applies right after.
  }
  void setSystemTheme(mode, dark);
}

/** Calls back when the phone switches between light and dark. */
export function watchSystemTheme(onChange: () => void): () => void {
  const query = darkQuery();
  if (!query?.addEventListener) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Forget what was applied, so the next call applies again (for tests). */
export function resetTheme() {
  applied = '';
}
