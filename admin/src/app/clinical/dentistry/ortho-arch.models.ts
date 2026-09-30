import type { ArchKey, OrthoArchData } from './ortho-arch.data';

export type { ArchKey, ArchMeasures, OrthoArchData } from './ortho-arch.data';

export const ARCH_FORMS = ['Ovoide', 'Cuadrada', 'Triangular', 'Estrecha', 'Ancha'];
export const ARCH_SYMMETRY = ['Simétrica', 'Asimétrica'];
export const COMPRESSION_LEVELS = ['No', 'Leve', 'Moderada', 'Severa'];
export const SAGITTAL_CLASSES = ['Clase I', 'Clase II división 1', 'Clase II división 2', 'Clase III'];
export const INCISOR_RELATIONS = ['Normal', 'Protrusión', 'Retrusión', 'Biprotrusión', 'Borde a borde', 'Mordida cruzada anterior'];
export const VERTICAL_PATTERNS = ['Normal', 'Mordida abierta', 'Mordida profunda'];

/** Dientes de 6 a 6 en orden de la arcada, de derecha a izquierda del paciente. */
export const ARCH_TEETH: Record<ArchKey, number[]> = {
  upper: [16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26],
  lower: [46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36],
};

/** Anchos promedio orientativos (mm) solo para dibujar cuando no hay medida. */
const MEAN_WIDTH: Record<ArchKey, Record<number, number>> = {
  upper: { 1: 8.5, 2: 6.6, 3: 7.6, 4: 7, 5: 6.6, 6: 10.2 },
  lower: { 1: 5.4, 2: 5.9, 3: 6.9, 4: 7.1, 5: 7.2, 6: 11.1 },
};
const MEAN_DIMS: Record<ArchKey, { ic: number; im: number; depth: number }> = {
  upper: { ic: 34, im: 52, depth: 28 },
  lower: { ic: 26, im: 45, depth: 24 },
};

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function toothWidth(d: OrthoArchData, tooth: number): number | null {
  return num(d.widths[String(tooth)]);
}

/** Suma de anchos de los dientes dados; `null` si falta alguno. */
function sumWidths(d: OrthoArchData, teeth: number[]): number | null {
  let s = 0;
  for (const t of teeth) {
    const w = toothWidth(d, t);
    if (w === null) return null;
    s += w;
  }
  return round1(s);
}

const premolarToPremolar = (arch: ArchKey) => ARCH_TEETH[arch].slice(1, -1);
const canineToCanine = (arch: ArchKey) => ARCH_TEETH[arch].slice(3, 9);

export type CrowdingLevel = 'Sin discrepancia' | 'Leve' | 'Moderado' | 'Severo' | 'Espaciamiento';

export interface SpaceResult {
  available: number | null;
  required: number | null;
  requiredFromTeeth: boolean;
  discrepancy: number | null;
  level: CrowdingLevel | '';
  measuredTeeth: number;
}

/** Discrepancia = disponible − requerido (de mesial de 6 a mesial de 6). Negativa: apiñamiento. */
export function spaceAnalysis(d: OrthoArchData, arch: ArchKey): SpaceResult {
  const a = d[arch];
  const teeth = premolarToPremolar(arch);
  const fromTeeth = sumWidths(d, teeth);
  const required = fromTeeth ?? num(a.requiredManual);
  const available = num(a.perimeter);
  const discrepancy = available !== null && required !== null ? round1(available - required) : null;
  return {
    available,
    required,
    requiredFromTeeth: fromTeeth !== null,
    discrepancy,
    level: discrepancy === null ? '' : crowdingLevel(discrepancy),
    measuredTeeth: teeth.filter((t) => toothWidth(d, t) !== null).length,
  };
}

/** Referencia orientativa: hasta 3 mm leve, 4–6 mm moderado, más de 6 mm severo. */
export function crowdingLevel(discrepancy: number): CrowdingLevel {
  if (discrepancy > 0.5) return 'Espaciamiento';
  const c = -discrepancy;
  if (c <= 0.5) return 'Sin discrepancia';
  if (c <= 3) return 'Leve';
  if (c <= 6) return 'Moderado';
  return 'Severo';
}

export interface BoltonResult {
  kind: 'anterior' | 'total';
  upper: number | null;
  lower: number | null;
  ratio: number | null;
  norm: number;
  sd: number;
  reading: string;
  excess: { arch: ArchKey; mm: number } | null;
}

/** Bolton anterior (3–3, norma 77,2 ± 1,65 %) y total (6–6, norma 91,3 ± 1,91 %). */
export function bolton(d: OrthoArchData, kind: 'anterior' | 'total'): BoltonResult {
  const norm = kind === 'anterior' ? 77.2 : 91.3;
  const sd = kind === 'anterior' ? 1.65 : 1.91;
  const upper = sumWidths(d, kind === 'anterior' ? canineToCanine('upper') : ARCH_TEETH.upper);
  const lower = sumWidths(d, kind === 'anterior' ? canineToCanine('lower') : ARCH_TEETH.lower);
  if (upper === null || lower === null || !upper) {
    return { kind, upper, lower, ratio: null, norm, sd, reading: '', excess: null };
  }
  const ratio = Math.round((lower / upper) * 10000) / 100;
  let reading = 'Dentro de la norma';
  let excess: BoltonResult['excess'] = null;
  if (ratio > norm + sd) {
    const mm = round1(lower - (upper * norm) / 100);
    reading = `Exceso mandibular de ${mm} mm`;
    excess = { arch: 'lower', mm };
  } else if (ratio < norm - sd) {
    const mm = round1(upper - (lower * 100) / norm);
    reading = `Exceso maxilar de ${mm} mm`;
    excess = { arch: 'upper', mm };
  }
  return { kind, upper, lower, ratio, norm, sd, reading, excess };
}

export function boltonText(d: OrthoArchData): string {
  const a = bolton(d, 'anterior');
  const t = bolton(d, 'total');
  const fmt = (n: number) => n.toFixed(1).replace('.', ',');
  const parts = [a.ratio !== null ? `Anterior ${fmt(a.ratio)} %` : '', t.ratio !== null ? `total ${fmt(t.ratio)} %` : ''].filter(Boolean);
  return parts.join(' · ');
}

// ── Dibujo de la arcada ──

export interface ArchPoint {
  x: number;
  y: number;
}

export interface ArchDrawing {
  path: string;
  teeth: Array<{ n: number; x: number; y: number; r: number; measured: boolean }>;
  ic: number;
  im: number;
  depth: number;
  canine: { l: ArchPoint; r: ArchPoint };
  molar: { l: ArchPoint; r: ArchPoint };
  /** Longitud de la curva de mesial de 6 a mesial de 6, útil como perímetro estimado. */
  estimatedPerimeter: number;
  estimated: boolean;
}

/** Proporción de la profundidad a la que queda el canino según la forma. */
const CANINE_DEPTH: Record<string, number> = { Ovoide: 0.3, Cuadrada: 0.2, Triangular: 0.42, Estrecha: 0.34, Ancha: 0.24 };
const FORM_SCALE: Record<string, number> = { Estrecha: 0.88, Ancha: 1.12 };

function catmull(points: ArchPoint[], samples = 16): ArchPoint[] {
  const out: ArchPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function pointAt(poly: ArchPoint[], cum: number[], s: number): ArchPoint {
  const total = cum[cum.length - 1];
  const target = Math.max(0, Math.min(total, s));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (target - cum[i - 1]) / seg;
  return { x: poly[i - 1].x + (poly[i].x - poly[i - 1].x) * t, y: poly[i - 1].y + (poly[i].y - poly[i - 1].y) * t };
}

/** Arcada esquemática en milímetros (origen en el punto incisal, y hacia distal). */
export function archDrawing(d: OrthoArchData, arch: ArchKey): ArchDrawing {
  const a = d[arch];
  const mean = MEAN_DIMS[arch];
  const scale = FORM_SCALE[a.form] ?? 1;
  const icIn = num(a.intercanine);
  const imIn = num(a.intermolar);
  const depthIn = num(a.depth);
  const ic = icIn ?? mean.ic * scale;
  const im = imIn ?? mean.im * scale;
  const depth = depthIn ?? mean.depth;
  const cd = (CANINE_DEPTH[a.form] ?? 0.3) * depth;
  const molarY = depth;
  const tail = 10;
  const ctrl: ArchPoint[] = [
    { x: -im / 2 - 1, y: molarY + tail },
    { x: -im / 2, y: molarY },
    { x: -ic / 2, y: cd },
    { x: 0, y: 0 },
    { x: ic / 2, y: cd },
    { x: im / 2, y: molarY },
    { x: im / 2 + 1, y: molarY + tail },
  ];
  const poly = catmull(ctrl);
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
  const total = cum[cum.length - 1];
  const mid = total / 2;
  const nearest = (q: ArchPoint) => {
    let best = 0;
    for (let i = 1; i < poly.length; i++) {
      if (Math.hypot(poly[i].x - q.x, poly[i].y - q.y) < Math.hypot(poly[best].x - q.x, poly[best].y - q.y)) best = i;
    }
    return cum[best];
  };
  const sMolarR = nearest(ctrl[1]);
  const sMolarL = nearest(ctrl[5]);

  const teethList = ARCH_TEETH[arch];
  const widthOf = (n: number) => toothWidth(d, n) ?? MEAN_WIDTH[arch][n % 10];
  const half = (list: number[]) => list.reduce((s, n) => s + widthOf(n), 0);
  const right = teethList.slice(0, 6).reverse();
  const left = teethList.slice(6);
  const molarHalf = (widthOf(teethList[0]) + widthOf(teethList[11])) / 4;
  const available = (sMolarL - sMolarR) / 2 + molarHalf;
  const k = Math.min(1.15, available / Math.max(half(right), half(left)));
  const place = (list: number[], dir: 1 | -1) => {
    let s = 0;
    return list.map((n) => {
      const w = widthOf(n) * k;
      const p = pointAt(poly, cum, mid + dir * (s + w / 2));
      s += w;
      return { n, x: p.x, y: p.y, r: Math.max(2.2, w / 2 - 0.25), measured: toothWidth(d, n) !== null };
    });
  };
  const teeth = [...place(right, -1).reverse(), ...place(left, 1)];
  const molarR = teeth.find((t) => t.n % 10 === 6 && t.x < 0);
  const molarL = teeth.find((t) => t.n % 10 === 6 && t.x > 0);
  const estimatedPerimeter = round1(sMolarL - sMolarR - 2 * molarHalf);
  const path = poly.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('');
  return {
    path,
    teeth,
    ic: round1(ic),
    im: round1(im),
    depth: round1(depth),
    canine: { l: { x: -ic / 2, y: cd }, r: { x: ic / 2, y: cd } },
    molar: { l: { x: molarR?.x ?? -im / 2, y: molarR?.y ?? molarY }, r: { x: molarL?.x ?? im / 2, y: molarL?.y ?? molarY } },
    estimatedPerimeter,
    estimated: icIn === null || imIn === null || depthIn === null,
  };
}

// ── Planos transversal, sagital y vertical ──

export interface IntraoralLike {
  molarRight: string;
  molarLeft: string;
  canineRight: string;
  canineLeft: string;
  overjet: string;
  overbite: string;
  openBite: string;
  crossBite: string;
  crossBiteSide: string;
  deepBite: string;
  curveOfSpee: string;
}

const hasClass = (v: string, c: string) => new RegExp(`clase\\s*${c}(?![iI])`, 'i').test(v || '');

/** Clasificación sagital sugerida a partir de clases molares y overjet (orientativa). */
export function suggestSagittal(io: IntraoralLike): string {
  const molars = [io.molarRight, io.molarLeft];
  const oj = num(io.overjet);
  const ob = num(io.overbite);
  if (molars.some((m) => hasClass(m, 'III'))) return 'Clase III';
  if (molars.some((m) => hasClass(m, 'II'))) {
    if (oj !== null && oj <= 3 && ob !== null && ob > 3) return 'Clase II división 2';
    return 'Clase II división 1';
  }
  if (molars.every((m) => hasClass(m, 'I'))) return 'Clase I';
  return '';
}

export function suggestVertical(io: IntraoralLike): string {
  const ob = num(io.overbite);
  if ((io.openBite && io.openBite !== 'No') || (ob !== null && ob < 0)) return 'Mordida abierta';
  if (io.deepBite === 'Sí' || (ob !== null && ob > 4)) return 'Mordida profunda';
  if (ob !== null) return 'Normal';
  return '';
}

/** Diferencia intermolar superior − inferior; valores bajos sugieren compresión maxilar (orientativo). */
export function transverseReading(d: OrthoArchData): { diff: number; text: string; tone: 'ok' | 'warn' } | null {
  const up = num(d.upper.intermolar);
  const lo = num(d.lower.intermolar);
  if (up === null || lo === null) return null;
  const diff = round1(up - lo);
  if (diff < 3) return { diff, text: `Diferencia intermolar de ${diff} mm: sugiere compresión maxilar relativa.`, tone: 'warn' };
  return { diff, text: `Diferencia intermolar de ${diff} mm: relación transversal compatible.`, tone: 'ok' };
}
