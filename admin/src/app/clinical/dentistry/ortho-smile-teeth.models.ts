import {
  CONDITION_TOOLS,
  CephPoint,
  MARK_TOOLS,
  ORTHO_CONDITION_TOOLS,
  ORTHO_DEVICE_TOOLS,
  SURFACE_TOOLS,
  ToothRecord,
} from './dentistry.models';
import { smileScale } from './ortho-smile-photo.models';

type Pts = Partial<Record<string, CephPoint>>;

/** Dientes anterosuperiores delimitados por los contactos marcados en la foto (de derecha a izquierda del paciente). */
export const ANTERIOR_TEETH = [
  { fdi: 13, name: 'Canino superior derecho', from: 'R3', to: 'R2', ref: 12 },
  { fdi: 12, name: 'Incisivo lateral superior derecho', from: 'R2', to: 'R1', ref: 11 },
  { fdi: 11, name: 'Incisivo central superior derecho', from: 'R1', to: 'Md', ref: 21 },
  { fdi: 21, name: 'Incisivo central superior izquierdo', from: 'Md', to: 'L1', ref: 11 },
  { fdi: 22, name: 'Incisivo lateral superior izquierdo', from: 'L1', to: 'L2', ref: 21 },
  { fdi: 23, name: 'Canino superior izquierdo', from: 'L2', to: 'L3', ref: 22 },
] as const;

/** Proporción áurea de referencia para anchos aparentes en vista frontal; orientativa, no diagnóstica. */
export const GOLDEN_RATIO = 0.618;
export const GOLDEN_RANGE: [number, number] = [0.55, 0.7];
export const CENTRAL_ASYMMETRY_TOL_PCT = 10;
/** Altura dibujada de cada corona respecto a su ancho aparente (solo visual). */
const CROWN_HEIGHT_FACTOR = 1.25;

export interface ToothSegment {
  fdi: number;
  name: string;
  a: CephPoint;
  b: CephPoint;
  /** Esquinas de la corona dibujada: borde incisal a-b y su proyección hacia gingival. */
  poly: string;
  center: CephPoint;
  label: CephPoint;
  /** Radio del distintivo «i» y tamaño del número, proporcionales al ancho del diente. */
  badge: number;
  font: number;
  widthPx: number;
  widthText: string;
  /** Relación con el diente de referencia (lateral/central, canino/lateral, central/central contralateral). */
  ratio: { text: string; value: number; tone: 'ok' | 'out'; vs: number } | null;
  findings: string[];
}

export interface TeethAnalysis {
  segments: ToothSegment[];
  arc: string;
  summary: string[];
}

const fmt = (v: number, d = 2) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');

const LABELS = new Map<string, string>(
  [...CONDITION_TOOLS, ...ORTHO_CONDITION_TOOLS, ...MARK_TOOLS, ...ORTHO_DEVICE_TOOLS, ...SURFACE_TOOLS].map((t) => [t.key, t.label]),
);

/** Hallazgos registrados en el odontograma para una pieza (condiciones, superficies, marcas y nota). */
export function toothFindings(rec?: ToothRecord): string[] {
  if (!rec) return [];
  const out = (rec.conditions ?? []).map((c) => LABELS.get(c) ?? c);
  const bySurface = new Map<string, string[]>();
  for (const [surface, state] of Object.entries(rec.surfaces ?? {})) {
    if (state) bySurface.set(state, [...(bySurface.get(state) ?? []), surface]);
  }
  for (const [state, surfaces] of bySurface) out.push(`${LABELS.get(state) ?? state} (${surfaces.join(', ')})`);
  out.push(...(rec.marks ?? []).map((m) => LABELS.get(m) ?? m));
  if (rec.note?.trim()) out.push(rec.note.trim());
  return out;
}

/** Vector unitario hacia gingival, perpendicular a la línea entre comisuras (o vertical si no están marcadas). */
function upVector(p: Pts): CephPoint {
  const { CR, CL } = p;
  if (!CR || !CL) return { x: 0, y: -1 };
  const len = Math.hypot(CL.x - CR.x, CL.y - CR.y) || 1;
  const ux = (CL.x - CR.x) / len;
  const uy = (CL.y - CR.y) / len;
  return { x: uy, y: -ux };
}

export function teethAnalysis(p: Pts, refMm: number | undefined, odontogram: Record<string, ToothRecord>): TeethAnalysis {
  const mmPerPx = smileScale(p, refMm);
  const up = upVector(p);
  const widths = new Map<number, number>();
  const base = ANTERIOR_TEETH.flatMap((t) => {
    const a = p[t.from];
    const b = p[t.to];
    if (!a || !b) return [];
    const w = Math.hypot(b.x - a.x, b.y - a.y);
    widths.set(t.fdi, w);
    return [{ t, a, b, w }];
  });
  const segments = base.map(({ t, a, b, w }): ToothSegment => {
    const h = w * CROWN_HEIGHT_FACTOR;
    const off = (q: CephPoint, k: number) => ({ x: q.x + up.x * k, y: q.y + up.y * k });
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const refW = widths.get(t.ref);
    let ratio: ToothSegment['ratio'] = null;
    if (refW) {
      const value = w / refW;
      const central = t.fdi % 10 === 1;
      const ok = central ? Math.abs(1 - value) * 100 <= CENTRAL_ASYMMETRY_TOL_PCT : value >= GOLDEN_RANGE[0] && value <= GOLDEN_RANGE[1];
      ratio = { value, vs: t.ref, tone: ok ? 'ok' : 'out', text: `${t.fdi}/${t.ref}: ${fmt(value)}` };
    }
    const g1 = off(a, h);
    const g2 = off(b, h);
    return {
      fdi: t.fdi,
      name: t.name,
      a,
      b,
      poly: [a, b, g2, g1].map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(' '),
      center: off(mid, h * 0.5),
      label: off(mid, h + w * 0.3),
      badge: w * 0.26,
      font: w * 0.42,
      widthPx: w,
      widthText: mmPerPx ? `${fmt(w * mmPerPx, 1)} mm` : `${Math.round(w)} px`,
      ratio,
      findings: toothFindings(odontogram[String(t.fdi)]),
    };
  });

  const { R3, L3, Md } = p;
  const arc = R3 && L3 && Md ? `M ${R3.x} ${R3.y} Q ${2 * Md.x - (R3.x + L3.x) / 2} ${2 * Md.y - (R3.y + L3.y) / 2} ${L3.x} ${L3.y}` : '';

  const summary = segments
    .filter((s) => s.ratio && s.fdi % 10 !== 1)
    .map((s) => `proporción ${s.ratio!.text}${s.ratio!.tone === 'out' ? ' (fuera del rango orientativo)' : ''}`);
  return { segments, arc, summary };
}

export interface MuscleGuide {
  name: string;
  from: CephPoint;
  to: CephPoint;
  labelled: boolean;
}

/** Esquema anatómico de referencia de los músculos peribucales, construido a partir de las comisuras. */
export function muscleGuides(p: Pts): MuscleGuide[] {
  const { CR, CL } = p;
  if (!CR || !CL) return [];
  const w = Math.hypot(CL.x - CR.x, CL.y - CR.y);
  const up = upVector(p);
  const u = { x: (CL.x - CR.x) / (w || 1), y: (CL.y - CR.y) / (w || 1) };
  const at = (o: CephPoint, lateral: number, rise: number, side: 1 | -1) => ({
    x: o.x + (u.x * lateral * side + up.x * rise) * w,
    y: o.y + (u.y * lateral * side + up.y * rise) * w,
  });
  const shapes: Array<{ name: string; start: [number, number]; end: [number, number] }> = [
    { name: 'Cigomático mayor', start: [0, 0], end: [0.26, 0.5] },
    { name: 'Cigomático menor', start: [-0.12, 0.05], end: [0.1, 0.46] },
    { name: 'Elevador labio sup.', start: [-0.26, 0.08], end: [-0.12, 0.42] },
    { name: 'Risorio', start: [0, 0], end: [0.3, 0.03] },
    { name: 'Depresor ángulo', start: [0, 0], end: [0.12, -0.3] },
  ];
  return ([[CR, -1, true], [CL, 1, false]] as const).flatMap(([o, side, labelled]) =>
    shapes.map((s) => ({ name: s.name, from: at(o, s.start[0], s.start[1], side), to: at(o, s.end[0], s.end[1], side), labelled })),
  );
}
