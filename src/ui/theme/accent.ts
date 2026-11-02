import { DEFAULT_ACCENT } from '../../domain/defaults';
import type { AccentId } from '../../domain/types';
import { t } from '../../i18n';
import { wallpaperColors } from '../../platform/native';
import { hueChroma, toneHex } from './palette';

/**
 * The customizable accent. Each choice is only a hue and a chroma; every accent token is a tone
 * of that one palette, so any choice keeps the same contrast as the default. Neutrals, category
 * colors and status colors never change.
 */
export interface Seed { hue: number; chroma: number }

export interface AccentChoice extends Seed { id: Exclude<AccentId, 'wallpaper'> }

/** Classday's indigo, then Tuck's hues around the color wheel. Wallpaper is added when the phone offers it. */
export const PRESETS: readonly AccentChoice[] = [
  { id: 'indigo', hue: 270, chroma: 0.25 },
  { id: 'violet', hue: 292, chroma: 0.18 },
  { id: 'orchid', hue: 335, chroma: 0.18 },
  { id: 'rose', hue: 10, chroma: 0.21 },
  { id: 'coral', hue: 38, chroma: 0.17 },
  { id: 'amber', hue: 72, chroma: 0.16 },
  { id: 'green', hue: 150, chroma: 0.15 },
  { id: 'teal', hue: 195, chroma: 0.12 },
  { id: 'blue', hue: 255, chroma: 0.16 },
];

/**
 * [tone, share of the seed's chroma, most chroma] for each token, on light and on dark screens.
 * Soft tints are capped: greens and cyans have room for far more color near white than blues,
 * and a tint should stay as calm as the default's.
 */
type Role = [tone: number, share: number, max?: number];
const ROLES: Record<string, { light: Role; dark: Role }> = {
  '--accent': { light: [46, 1], dark: [62, 1] },
  '--accent-press': { light: [39, 1], dark: [69, 1] },
  '--accent-ink': { light: [39, 1], dark: [74, 1] },
  '--accent-soft': { light: [94.5, 1, 0.035], dark: [16, 0.4] },
  '--on-accent': { light: [100, 1], dark: [5, 0.4] },
  '--inverse-accent': { light: [74, 1], dark: [39, 1] },
};

export const ACCENT_TOKENS = Object.keys(ROLES);

export function accentTokens(seed: Seed, dark: boolean): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [name, role] of Object.entries(ROLES)) {
    const [tone, share, max = Infinity] = dark ? role.dark : role.light;
    tokens[name] = toneHex(seed.hue, Math.min(seed.chroma * share, max), tone);
  }
  return tokens;
}

/** Light tokens, then dark ones; `html:root` outranks the defaults in tokens.css whatever the load order. */
export function accentCss(seed: Seed): string {
  const block = (dark: boolean) =>
    Object.entries(accentTokens(seed, dark)).map(([name, value]) => `${name}: ${value};`).join(' ');
  return `html:root { ${block(false)} }\nhtml:root[data-theme='dark'] { ${block(true)} }`;
}

/** Two tones for a picker swatch; the same in both themes so a choice always looks like itself. */
export function swatchFill(seed: Seed): string {
  return `linear-gradient(135deg, ${toneHex(seed.hue, seed.chroma, 58)}, ${toneHex(seed.hue, seed.chroma, 42)})`;
}

const preset = (id: AccentId) => PRESETS.find(p => p.id === id) ?? PRESETS.find(p => p.id === DEFAULT_ACCENT)!;

/* The phone's wallpaper colors, read once at startup and again when the app returns. */
let wallpaper: { seed: Seed; colors: string[] } | null = null;

export async function loadWallpaper(): Promise<boolean> {
  const colors = await wallpaperColors();
  const before = wallpaper?.colors.join();
  wallpaper = colors.length ? { seed: hueChroma(colors[0]), colors } : null;
  return before !== wallpaper?.colors.join();
}

export interface PickerChoice { id: AccentId; label: string; fill: string }

export function pickerChoices(): PickerChoice[] {
  const choices: PickerChoice[] = PRESETS.map(p => ({ id: p.id, label: labelFor(p.id), fill: swatchFill(p) }));
  if (wallpaper) {
    const [primary, secondary = primary, tertiary = primary] = wallpaper.colors;
    choices.push({ id: 'wallpaper', label: labelFor('wallpaper'), fill: `conic-gradient(${primary}, ${tertiary}, ${secondary}, ${primary})` });
  }
  return choices;
}

/** What a stored choice looks like on this phone: Wallpaper falls back to the default without Android 12+. */
export function seedFor(id: AccentId): Seed {
  if (id === 'wallpaper') return wallpaper?.seed ?? preset(DEFAULT_ACCENT);
  return preset(id);
}

export function labelFor(id: AccentId): string {
  return t.appearance.accents[id];
}

/** Recolor the whole app. The default needs no override: tokens.css already holds its tokens. */
export function applyAccent(id: AccentId) {
  const seed = seedFor(id);
  const css = seed === preset(DEFAULT_ACCENT) ? '' : accentCss(seed);
  let style = document.getElementById('accent-theme');
  if (!css) { style?.remove(); return; }
  if (!style) {
    style = document.createElement('style');
    style.id = 'accent-theme';
    document.head.append(style);
  }
  if (style.textContent !== css) style.textContent = css;
}
