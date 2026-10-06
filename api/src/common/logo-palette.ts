import * as jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

export type DocumentPalette = {
  /** Color principal: franjas, encabezados de tabla. Siempre legible con texto blanco. */
  primary: string;
  /** Color de acento (segundo color del logo o variante del principal). */
  accent: string;
  /** Bordes y líneas. */
  line: string;
  /** Relleno suave de filas. */
  soft: string;
  /** Texto. */
  ink: string;
  muted: string;
  /** Círculo decorativo. */
  decor: string;
};

type Rgb = [number, number, number];

const DEFAULT_PRIMARY: Rgb = [11, 79, 138];
const DEFAULT_ACCENT: Rgb = [13, 124, 140];
const MAX_SAMPLES = 40000;

const hex = ([r, g, b]: Rgb) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function luminance([r, g, b]: Rgb) {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Oscurece hasta que el texto blanco tenga contraste suficiente (≥ 4.5:1). */
function readableOnWhiteText(c: Rgb): Rgb {
  let out = c;
  for (let i = 0; i < 20 && 1.05 / (luminance(out) + 0.05) < 4.5; i += 1) {
    out = mix(out, [0, 0, 0], 0.1);
  }
  return out;
}

function decode(data: Buffer, mimeType: string): { width: number; height: number; data: Uint8Array } | null {
  try {
    if (mimeType.includes('png')) return PNG.sync.read(data);
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      return jpeg.decode(data, { useTArray: true, maxMemoryUsageInMB: 256 });
    }
  } catch {
    return null;
  }
  return null;
}

/** Colores dominantes del logo (ignorando fondo blanco, transparencias y grises). */
function dominantColors(image: { width: number; height: number; data: Uint8Array }): { colors: Rgb[]; dark: Rgb | null } {
  const total = image.width * image.height;
  const step = Math.max(1, Math.floor(total / MAX_SAMPLES));
  const buckets = new Map<number, { n: number; sum: Rgb; sat: number }>();
  const dark = { n: 0, sum: [0, 0, 0] as Rgb };

  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    const rgb: Rgb = [image.data[i], image.data[i + 1], image.data[i + 2]];
    if (image.data[i + 3] < 128) continue;
    const [h, s, l] = toHsl(rgb);
    if (l > 0.92) continue;
    if (s < 0.22 || l < 0.08) {
      if (l < 0.45) {
        dark.n += 1;
        dark.sum = [dark.sum[0] + rgb[0], dark.sum[1] + rgb[1], dark.sum[2] + rgb[2]];
      }
      continue;
    }
    const key = Math.floor(h / 20);
    const b = buckets.get(key) ?? { n: 0, sum: [0, 0, 0] as Rgb, sat: 0 };
    b.n += 1;
    b.sum = [b.sum[0] + rgb[0], b.sum[1] + rgb[1], b.sum[2] + rgb[2]];
    b.sat += s;
    buckets.set(key, b);
  }

  const ranked = [...buckets.entries()]
    .filter(([, b]) => b.n >= 20)
    .sort((a, b) => b[1].n - a[1].n);
  const colors: Rgb[] = [];
  const used: number[] = [];
  for (const [key, b] of ranked) {
    if (used.some((k) => Math.min(Math.abs(k - key), 18 - Math.abs(k - key)) < 2)) continue;
    colors.push([b.sum[0] / b.n, b.sum[1] / b.n, b.sum[2] / b.n]);
    used.push(key);
    if (colors.length === 2) break;
  }
  const darkColor: Rgb | null = dark.n >= 20 ? [dark.sum[0] / dark.n, dark.sum[1] / dark.n, dark.sum[2] / dark.n] : null;
  return { colors, dark: darkColor };
}

function buildPalette(primaryRaw: Rgb, accentRaw: Rgb): DocumentPalette {
  const primary = readableOnWhiteText(primaryRaw);
  const accent = readableOnWhiteText(accentRaw);
  const ink = mix(primary, [20, 30, 40], 0.55);
  return {
    primary: hex(primary),
    accent: hex(accent),
    line: hex(mix(primary, [255, 255, 255], 0.65)),
    soft: hex(mix(primary, [255, 255, 255], 0.92)),
    ink: hex(ink),
    muted: hex(mix(ink, [255, 255, 255], 0.35)),
    decor: hex(mix(primary, [255, 255, 255], 0.88)),
  };
}

export const DEFAULT_PALETTE = buildPalette(DEFAULT_PRIMARY, DEFAULT_ACCENT);

/** Paleta del documento a partir del logo del consultorio; si no hay logo legible, la paleta por defecto. */
export function paletteFromLogo(data: Buffer | null | undefined, mimeType: string | null | undefined): DocumentPalette {
  if (!data?.length || !mimeType) return DEFAULT_PALETTE;
  const image = decode(data, mimeType);
  if (!image) return DEFAULT_PALETTE;
  const { colors, dark } = dominantColors(image);
  if (colors.length >= 2) return buildPalette(colors[0], colors[1]);
  if (colors.length === 1) {
    const l = toHsl(colors[0])[2];
    const accent = dark ?? mix(colors[0], l > 0.5 ? [0, 0, 0] : [255, 255, 255], 0.3);
    return buildPalette(colors[0], accent);
  }
  if (dark) return buildPalette(dark, mix(dark, [255, 255, 255], 0.3));
  return DEFAULT_PALETTE;
}
