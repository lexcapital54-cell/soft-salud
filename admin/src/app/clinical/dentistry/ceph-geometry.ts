import { CephPoint } from './dentistry.models';

export type CephLandmarkKey = 'S' | 'N' | 'A' | 'B' | 'Po' | 'Or' | 'Go' | 'Me' | 'U1T' | 'U1A' | 'L1T' | 'L1A';

export interface CephLandmark {
  key: CephLandmarkKey;
  short: string;
  label: string;
  hint: string;
}

export const CEPH_LANDMARKS: CephLandmark[] = [
  { key: 'S', short: 'S', label: 'Silla', hint: 'Centro geométrico de la silla turca.' },
  { key: 'N', short: 'N', label: 'Nasion', hint: 'Punto más anterior de la sutura frontonasal.' },
  { key: 'A', short: 'A', label: 'Punto A', hint: 'Punto más profundo de la concavidad anterior del maxilar.' },
  { key: 'B', short: 'B', label: 'Punto B', hint: 'Punto más profundo de la concavidad anterior de la mandíbula.' },
  { key: 'Po', short: 'Po', label: 'Porion', hint: 'Punto más superior del conducto auditivo externo.' },
  { key: 'Or', short: 'Or', label: 'Orbitario', hint: 'Punto más inferior del reborde de la órbita.' },
  { key: 'Go', short: 'Go', label: 'Gonion', hint: 'Punto más posterior e inferior del ángulo mandibular.' },
  { key: 'Me', short: 'Me', label: 'Mentoniano', hint: 'Punto más inferior de la sínfisis mandibular.' },
  { key: 'U1T', short: 'Is', label: 'Borde incisal superior', hint: 'Borde incisal del incisivo central superior.' },
  { key: 'U1A', short: 'Ais', label: 'Ápice incisivo superior', hint: 'Ápice de la raíz del incisivo central superior.' },
  { key: 'L1T', short: 'Ii', label: 'Borde incisal inferior', hint: 'Borde incisal del incisivo central inferior.' },
  { key: 'L1A', short: 'Aii', label: 'Ápice incisivo inferior', hint: 'Ápice de la raíz del incisivo central inferior.' },
];

/** Planos y ejes que se dibujan sobre la radiografía. */
export const CEPH_LINES: Array<{ from: CephLandmarkKey; to: CephLandmarkKey; kind: 'plane' | 'axis' | 'ray' }> = [
  { from: 'S', to: 'N', kind: 'plane' },
  { from: 'N', to: 'A', kind: 'ray' },
  { from: 'N', to: 'B', kind: 'ray' },
  { from: 'Po', to: 'Or', kind: 'plane' },
  { from: 'Go', to: 'Me', kind: 'plane' },
  { from: 'U1A', to: 'U1T', kind: 'axis' },
  { from: 'L1A', to: 'L1T', kind: 'axis' },
];

export type CephPoints = Partial<Record<string, CephPoint>>;

export interface CephResult {
  sna: number | null;
  snb: number | null;
  anb: number | null;
  fma: number | null;
  impa: number | null;
  upperIncisor: number | null;
}

type Vec = { x: number; y: number };

function vec(a: CephPoint, b: CephPoint): Vec {
  return { x: b.x - a.x, y: b.y - a.y };
}

/** Ángulo entre dos vectores, en grados (0–180). */
function angleBetween(u: Vec, v: Vec): number | null {
  const nu = Math.hypot(u.x, u.y);
  const nv = Math.hypot(v.x, v.y);
  if (nu < 1e-6 || nv < 1e-6) return null;
  const cos = Math.min(1, Math.max(-1, (u.x * v.x + u.y * v.y) / (nu * nv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

/**
 * SNA / SNB: ángulo en N entre S y A / B.
 * ANB = SNA − SNB (negativo si B está por delante de A).
 * FMA: plano de Frankfort (Po-Or) con el plano mandibular (Go-Me).
 * IMPA: plano mandibular (hacia Go) con el eje del incisivo inferior (ápice → borde).
 * U1-SN: línea S→N con el eje del incisivo superior (borde → ápice).
 */
export function computeCeph(p: CephPoints): CephResult {
  const { S, N, A, B, Po, Or, Go, Me, U1T, U1A, L1T, L1A } = p;
  const sna = S && N && A ? angleBetween(vec(N, S), vec(N, A)) : null;
  const snb = S && N && B ? angleBetween(vec(N, S), vec(N, B)) : null;
  let fma: number | null = null;
  if (Po && Or && Go && Me) {
    const raw = angleBetween(vec(Po, Or), vec(Go, Me));
    fma = raw === null ? null : raw > 90 ? 180 - raw : raw;
  }
  const impa = Go && Me && L1T && L1A ? angleBetween(vec(Me, Go), vec(L1A, L1T)) : null;
  const upperIncisor = S && N && U1T && U1A ? angleBetween(vec(S, N), vec(U1T, U1A)) : null;
  const snaR = round1(sna);
  const snbR = round1(snb);
  return {
    sna: snaR,
    snb: snbR,
    anb: snaR !== null && snbR !== null ? round1(snaR - snbR) : null,
    fma: round1(fma),
    impa: round1(impa),
    upperIncisor: round1(upperIncisor),
  };
}

/** Texto con coma decimal para los campos del análisis cefalométrico. */
export function cephValueText(v: number | null): string {
  return v === null ? '' : String(v).replace('.', ',');
}
