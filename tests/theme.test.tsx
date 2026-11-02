import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import { Store } from '../src/app/store';
import * as act from '../src/domain/actions';
import { initialData } from '../src/domain/defaults';
import { normalizeData } from '../src/domain/schema';
import type { ThemeMode } from '../src/domain/types';
import { applyTheme, isDark, resetTheme, THEME_HINT_KEY } from '../src/ui/theme/mode';
import { todo } from './helpers';

const native = vi.hoisted(() => ({ calls: [] as [string, boolean][] }));
vi.mock('../src/platform/native', async original => ({
  ...(await original<typeof import('../src/platform/native')>()),
  setSystemTheme: async (mode: string, dark: boolean) => { native.calls.push([mode, dark]); },
}));

/** A phone whose light/dark setting the test can flip. */
const phone = { dark: false, listeners: new Set<() => void>() };
const originalMatchMedia = window.matchMedia;

function flipPhone(dark: boolean) {
  phone.dark = dark;
  for (const listener of phone.listeners) listener();
}

beforeEach(() => {
  phone.dark = false;
  phone.listeners.clear();
  window.matchMedia = ((query: string) => ({
    get matches() { return query.includes('dark') && phone.dark; },
    media: query,
    addEventListener: (_: string, fn: () => void) => phone.listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => phone.listeners.delete(fn),
  })) as unknown as typeof window.matchMedia;
  native.calls = [];
  resetTheme();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
});

const theme = () => document.documentElement.dataset.theme;

describe('storing the theme', () => {
  it('follows the phone unless the student chose otherwise', () => {
    expect(initialData().appearance.theme).toBe('system');
    const { appearance: _, ...older } = initialData();
    expect(normalizeData(older).data.appearance.theme).toBe('system');
    expect(normalizeData({ ...initialData(), appearance: { accent: 'rose', theme: 'sepia' } }).data.appearance)
      .toEqual({ accent: 'rose', theme: 'system', language: 'system' });
    expect(normalizeData({ ...initialData(), appearance: { accent: 'rose', theme: 'dark' } }).data.appearance.theme).toBe('dark');
  });

  it('rejects unknown themes', () => {
    const store = new Store(initialData(), null);
    store.act(d => act.setTheme(d, 'sepia' as ThemeMode));
    expect(store.get().data.appearance.theme).toBe('system');
    expect(store.get().toast?.tone).toBe('error');
  });

  it('is not undone by Undo', () => {
    const store = new Store({ ...initialData(), items: [todo({ id: 'a' })] }, null);
    store.act(d => act.complete(d, 'a'));
    store.act(d => act.setTheme(d, 'dark'), { undoable: false });
    store.undo();
    expect(store.get().data.items[0].status).toBe('open');
    expect(store.get().data.appearance.theme).toBe('dark');
  });
});

describe('applying the theme', () => {
  it('resolves System from the phone and keeps Light and Dark fixed', () => {
    expect(isDark('system')).toBe(false);
    expect(isDark('dark')).toBe(true);
    phone.dark = true;
    expect(isDark('system')).toBe(true);
    expect(isDark('light')).toBe(false);
  });

  it('switches the palette, remembers the choice for the next start, and tells Android', () => {
    applyTheme('dark');
    expect(theme()).toBe('dark');
    expect(localStorage.getItem(THEME_HINT_KEY)).toBe('dark');
    applyTheme('dark');
    expect(native.calls).toEqual([['dark', true]]);
    applyTheme('light');
    expect(theme()).toBe('light');
    expect(native.calls.at(-1)).toEqual(['light', false]);
  });

  it('keys the dark palette to the theme choice, not to the phone setting', () => {
    const css = readFileSync('src/styles/tokens.css', 'utf8');
    expect(css).not.toContain('prefers-color-scheme');
    expect(css).toContain(":root[data-theme='dark'] {");
  });
});

describe('first paint', () => {
  // The script in index.html runs before any app code, from the copy that applyTheme saves.
  const html = readFileSync('index.html', 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const boot = () => new Function(script)();

  it.each([
    [null, false, 'light'],
    [null, true, 'dark'],
    ['system', true, 'dark'],
    ['dark', false, 'dark'],
    ['light', true, 'light'],
  ] as const)('with %s saved and a %s phone, starts %s', (saved, phoneDark, expected) => {
    if (saved) localStorage.setItem(THEME_HINT_KEY, saved);
    phone.dark = phoneDark;
    boot();
    expect(theme()).toBe(expected);
  });
});

describe('theme picker', () => {
  const clock = () => new Date('2026-10-13T09:00:00');

  function openSettings(mode: ThemeMode = 'system') {
    const store = new Store({ ...initialData(), appearance: { accent: 'indigo', theme: mode, language: 'system' } }, null, clock);
    render(<App store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /^Appearance/ }));
    return store;
  }

  it('switches the whole app at once', () => {
    const store = openSettings();
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(screen.getByRole('radiogroup', { name: 'Theme' })).getByRole('radio', { name: 'System' }).getAttribute('aria-checked')).toBe('true');
    expect(theme()).toBe('light');

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(store.get().data.appearance.theme).toBe('dark');
    expect(theme()).toBe('dark');
    expect(store.get().canUndo).toBe(false);

    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(store.get().data.appearance.theme).toBe('light');
    expect(theme()).toBe('light');
  });

  it('follows the phone live only on System', () => {
    const store = openSettings();
    flipPhone(true);
    expect(theme()).toBe('dark');
    flipPhone(false);
    expect(theme()).toBe('light');

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    flipPhone(true);
    expect(theme()).toBe('light');
    expect(store.get().data.appearance.theme).toBe('light');
  });

  it('starts in the saved theme', () => {
    phone.dark = true;
    openSettings('light');
    expect(theme()).toBe('light');
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
  });
});
