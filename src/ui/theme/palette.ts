/**
 * Material-style tonal palettes without a color library (the same method as Tuck's TonalPalette).
 *
 * Colors are made in OKLCH (perceptual hue and chroma), with "tone" mapped to CIE L* the way
 * Material 3 uses it: tone 0 is black, 100 is white, and pairs about 50 tones apart are readable.
 * Chroma is reduced as needed to stay inside sRGB, so every tone exists on every screen.
 */

type Rgb = [number, number, number];

/** Hex color for an OKLCH hue (degrees) and chroma at a tone (0–100). */
export function toneHex(hue: number, chroma: number, tone: number): string {
  if (tone <= 0) return '#000000';
  if (tone >= 100) return '#ffffff';
  const lightness = Math.cbrt(toneToLuminance(tone));
  // Binary search for the most chroma that still fits in sRGB at this lightness.
  let fit = chroma;
  if (!inGamut(oklchToLinear(lightness, hue, fit))) {
    let low = 0;
    let high = chroma;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (inGamut(oklchToLinear(lightness, hue, mid))) low = mid;
      else high = mid;
    }
    fit = low;
  }
  return toHex(oklchToLinear(lightness, hue, fit).map(encode) as Rgb);
}

/** Hue (degrees) and chroma of a hex color, e.g. a wallpaper color reported by Android. */
export function hueChroma(hex: string): { hue: number; chroma: number } {
  const [r, g, b] = parseHex(hex).map(decode);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(bb, a) * 180) / Math.PI;
  return { hue: (hue + 360) % 360, chroma: Math.hypot(a, bb) };
}

/** WCAG contrast ratio between two hex colors (1–21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function toneToLuminance(tone: number): number {
  return tone > 8 ? ((tone + 16) / 116) ** 3 : tone / 903.2962962962963;
}

function inGamut(rgb: Rgb): boolean {
  const eps = 1e-4;
  return rgb.every(c => c >= -eps && c <= 1 + eps);
}

function oklchToLinear(lightness: number, hue: number, chroma: number): Rgb {
  const h = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(h);
  const b = chroma * Math.sin(h);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function encode(linear: number): number {
  const v = Math.min(1, Math.max(0, linear));
  const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(srgb * 255)));
}

function decode(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(decode);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
