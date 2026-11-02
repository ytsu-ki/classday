import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import { Store } from '../src/app/store';
import * as act from '../src/domain/actions';
import { ACCENTS, initialData } from '../src/domain/defaults';
import { normalizeData } from '../src/domain/schema';
import type { AccentId } from '../src/domain/types';
import { accentTokens, applyAccent, loadWallpaper, pickerChoices, PRESETS, seedFor, type Seed } from '../src/ui/theme/accent';
import { contrast, hueChroma, toneHex } from '../src/ui/theme/palette';
import { todo } from './helpers';

const wallpaper = vi.hoisted(() => ({ colors: [] as string[] }));
vi.mock('../src/platform/native', async original => ({
  ...(await original<typeof import('../src/platform/native')>()),
  wallpaperColors: async () => wallpaper.colors,
}));

// Vitest skips CSS processing, so the file is read directly (tests run from the project root).
const tokensCss = readFileSync('src/styles/tokens.css', 'utf8');

/** Custom properties of the light `:root` block in tokens.css, or of the dark one. */
function cssTokens(dark: boolean): Record<string, string> {
  const start = tokensCss.indexOf(dark ? ":root[data-theme='dark']" : ':root {');
  const body = tokensCss.slice(start, tokensCss.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}

const themes = [false, true];

function expectReadable(seed: Seed, where: string) {
  for (const dark of themes) {
    const n = cssTokens(dark);
    const t = accentTokens(seed, dark);
    const pairs: [string, string, string, number][] = [
      ['link text on the page', t['--accent-ink'], n['--bg'], 4.5],
      ['link text on a card', t['--accent-ink'], n['--surface'], 4.5],
      ['link text on a fill', t['--accent-ink'], n['--fill'], 4.5],
      ['text on a soft accent', t['--accent-ink'], t['--accent-soft'], 4.5],
      ['button text', t['--on-accent'], t['--accent'], 4.5],
      ['pressed button text', t['--on-accent'], t['--accent-press'], 4.5],
      ['toast action', t['--inverse-accent'], n['--inverse'], 4.5],
      ['accent shapes on a card', t['--accent'], n['--surface'], 3],
      ['accent shapes on the page', t['--accent'], n['--bg'], 3],
    ];
    for (const [pair, a, b, minimum] of pairs)
      expect(contrast(a, b), `${where} ${dark ? 'dark' : 'light'}: ${pair} (${a} on ${b})`).toBeGreaterThanOrEqual(minimum);
  }
}

beforeEach(() => { wallpaper.colors = []; });
afterEach(async () => {
  cleanup();
  document.getElementById('accent-theme')?.remove();
  wallpaper.colors = [];
  await loadWallpaper();
});

describe('tonal palette', () => {
  it('maps the tone extremes to black and white', () => {
    expect(toneHex(10, 0.2, 0)).toBe('#000000');
    expect(toneHex(10, 0.2, 100)).toBe('#ffffff');
  });

  it('keeps tone a predictor of lightness whatever the hue', () => {
    // Very different hues at the same tone all keep white text readable.
    for (let hue = 0; hue < 360; hue += 15) expect(contrast(toneHex(hue, 0.3, 46), '#ffffff'), `hue ${hue}`).toBeGreaterThan(4.5);
  });

  it('reads hue and chroma back from a color', () => {
    for (const hue of [10, 150, 270]) {
      const read = hueChroma(toneHex(hue, 0.08, 50));
      expect(read.hue).toBeCloseTo(hue, 0);
      expect(read.chroma).toBeCloseTo(0.08, 2);
    }
  });

  it('makes Rose a pinkish red, not an orange', () => {
    const rose = accentTokens(PRESETS.find(p => p.id === 'rose')!, false)['--accent'];
    const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(rose.slice(i, i + 2), 16));
    expect(r > g * 2 && r > b && b > g, rose).toBe(true);
  });
});

describe('accent presets', () => {
  it('offers every stored choice', () => {
    expect([...PRESETS.map(p => p.id), 'wallpaper']).toEqual(ACCENTS);
  });

  it('keeps every text color readable in both themes', () => {
    for (const p of PRESETS) expectReadable(p, p.id);
  });

  it('stays readable for any wallpaper the phone can report', () => {
    for (let hue = 0; hue < 360; hue += 5)
      for (const chroma of [0, 0.04, 0.08, 0.12, 0.2, 0.3]) expectReadable({ hue, chroma }, `hue ${hue} chroma ${chroma}`);
  });

  it('matches the default tokens in tokens.css', () => {
    const indigo = PRESETS.find(p => p.id === 'indigo')!;
    for (const dark of themes) {
      const css = cssTokens(dark);
      for (const [name, value] of Object.entries(accentTokens(indigo, dark))) expect(css[name], `${name} dark=${dark}`).toBe(value);
    }
  });

  it('never recolors categories or status colors', () => {
    const tokens = Object.keys(accentTokens(PRESETS[0], false));
    expect(tokens.every(t => t.startsWith('--accent') || t === '--on-accent' || t === '--inverse-accent')).toBe(true);
  });
});

describe('applying an accent', () => {
  it('adds an override for a non-default accent and removes it for the default', () => {
    applyAccent('rose');
    const style = document.getElementById('accent-theme')!;
    const rose = accentTokens(PRESETS.find(p => p.id === 'rose')!, false);
    expect(style.textContent).toContain(`--accent: ${rose['--accent']};`);
    expect(style.textContent).toContain("html:root[data-theme='dark'] {");
    applyAccent('indigo');
    expect(document.getElementById('accent-theme')).toBeNull();
  });

  it('uses the wallpaper colors on Android 12+ and the default elsewhere', async () => {
    expect(pickerChoices().some(c => c.id === 'wallpaper')).toBe(false);
    applyAccent('wallpaper');
    expect(document.getElementById('accent-theme')).toBeNull();

    wallpaper.colors = ['#386a20', '#55624c', '#19686a'];
    expect(await loadWallpaper()).toBe(true);
    expect(await loadWallpaper()).toBe(false);
    expect(pickerChoices().at(-1)).toMatchObject({ id: 'wallpaper', label: 'Wallpaper' });
    expect(seedFor('wallpaper').hue).toBeCloseTo(hueChroma('#386a20').hue, 5);
    applyAccent('wallpaper');
    expect(document.getElementById('accent-theme')!.textContent).toContain(accentTokens(seedFor('wallpaper'), false)['--accent']);
  });
});

describe('storing the accent', () => {
  it('defaults to Indigo for new and damaged data', () => {
    expect(initialData().appearance.accent).toBe('indigo');
    const { appearance: _, ...withoutAppearance } = initialData();
    expect(normalizeData(withoutAppearance).data.appearance.accent).toBe('indigo');
    expect(normalizeData({ ...initialData(), appearance: { accent: 'neon', token: 'secret' } }).data.appearance).toEqual({ accent: 'indigo', theme: 'system', language: 'system' });
  });

  it('keeps a valid choice through saving and restoring', () => {
    const saved = JSON.parse(JSON.stringify({ ...initialData(), appearance: { accent: 'teal' } }));
    expect(normalizeData(saved).data.appearance.accent).toBe('teal');
  });

  it('rejects unknown accents', () => {
    const store = new Store(initialData(), null);
    store.act(d => act.setAccent(d, 'neon' as AccentId));
    expect(store.get().data.appearance.accent).toBe('indigo');
    expect(store.get().toast?.tone).toBe('error');
  });

  it('is not undone by Undo', () => {
    const store = new Store({ ...initialData(), items: [todo({ id: 'a' })] }, null);
    store.act(d => act.complete(d, 'a'));
    store.act(d => act.setAccent(d, 'green'), { undoable: false });
    store.undo();
    expect(store.get().data.items[0].status).toBe('open');
    expect(store.get().data.appearance.accent).toBe('green');
  });
});

describe('accent picker', () => {
  const clock = () => new Date('2026-10-13T09:00:00');

  function openSettings() {
    const store = new Store(initialData(), null, clock);
    render(<App store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /^Appearance/ }));
    return store;
  }

  it('recolors the app as soon as a swatch is chosen', () => {
    const store = openSettings();
    const group = screen.getByRole('radiogroup', { name: 'Accent color' });
    expect(screen.getByRole('radio', { name: 'Indigo' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Indigo · used across the whole app')).toBeTruthy();
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(PRESETS.length);

    fireEvent.click(screen.getByRole('radio', { name: 'Rose' }));
    expect(store.get().data.appearance.accent).toBe('rose');
    expect(screen.getByRole('radio', { name: 'Rose' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Rose · used across the whole app')).toBeTruthy();
    expect(document.getElementById('accent-theme')).not.toBeNull();
    // A look change is not an edit to undo.
    expect(store.get().canUndo).toBe(false);
  });

  it('moves between swatches with the arrow keys', () => {
    const store = openSettings();
    const group = screen.getByRole('radiogroup', { name: 'Accent color' });
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(store.get().data.appearance.accent).toBe('violet');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Violet' }));
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(store.get().data.appearance.accent).toBe('blue');
  });

  it('explains a Wallpaper choice restored on an older phone', () => {
    const store = new Store({ ...initialData(), appearance: { accent: 'wallpaper', theme: 'system', language: 'system' } }, null, clock);
    render(<App store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /^Appearance/ }));
    expect(screen.getByText('Wallpaper colors need Android 12 or later, so Indigo is used.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Indigo' }).getAttribute('tabindex')).toBe('0');
  });
});
