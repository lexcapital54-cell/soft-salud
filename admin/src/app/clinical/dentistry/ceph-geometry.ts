import { CephPoint } from './dentistry.models';

export type CephLandmarkKey =
  | 'S'
  | 'N'
  | 'A'
  | 'B'
  | 'Pog'
  | 'Me'
  | 'Go'
  | 'Gn'
  | 'Po'
  | 'Or'
  | 'U1T'
  | 'U1A'
  | 'L1T'
  | 'L1A';

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
  { key: 'Pog', short: 'Pog', label: 'Pogonion', hint: 'Punto más anterior del mentón óseo.' },
  { key: 'Me', short: 'Me', label: 'Mentoniano', hint: 'Punto más inferior de la sínfisis mandibular.' },
  { key: 'Go', short: 'Go', label: 'Gonion', hint: 'Punto más posterior e inferior del ángulo mandibular.' },
  { key: 'Gn', short: 'Gn', label: 'Gnathion', hint: 'Punto más anterior e inferior de la sínfisis, entre Pogonion y Mentoniano.' },
  { key: 'Po', short: 'Po', label: 'Porion', hint: 'Punto más superior del conducto auditivo externo.' },
  { key: 'Or', short: 'Or', label: 'Orbitario', hint: 'Punto más inferior del reborde de la órbita.' },
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
  { from: 'N', to: 'Pog', kind: 'ray' },
  { from: 'Po', to: 'Or', kind: 'plane' },
  { from: 'Go', to: 'Me', kind: 'plane' },
  { from: 'Go', to: 'Gn', kind: 'plane' },
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
  snGoGn: number | null;
  facialAngle: number | null;
  jarabak: number | null;
}

type Vec = { x: number; y: number };

export function vec(a: CephPoint, b: CephPoint): Vec {
  return { x: b.x - a.x, y: b.y - a.y };
}

/** Distancia euclidiana entre dos puntos, en las unidades de la imagen (píxeles). */
export function distance(a: CephPoint, b: CephPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Ángulo entre dos vectores, en grados (0–180). */
export function angleBetween(u: Vec, v: Vec): number | null {
  const nu = Math.hypot(u.x, u.y);
  const nv = Math.hypot(v.x, v.y);
  if (nu < 1e-6 || nv < 1e-6) return null;
  const cos = Math.min(1, Math.max(-1, (u.x * v.x + u.y * v.y) / (nu * nv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Ángulo con vértice en `vertex` formado por los rayos hacia `a` y `b`, en grados. */
export function angleAt(vertex: CephPoint, a: CephPoint, b: CephPoint): number | null {
  return angleBetween(vec(vertex, a), vec(vertex, b));
}

/** Ángulo agudo entre dos rectas (sin sentido), en grados (0–90). */
export function angleBetweenLines(a1: CephPoint, a2: CephPoint, b1: CephPoint, b2: CephPoint): number | null {
  const raw = angleBetween(vec(a1, a2), vec(b1, b2));
  return raw === null ? null : raw > 90 ? 180 - raw : raw;
}

const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

/**
 * SNA / SNB: ángulo en N entre S y A / B.
 * ANB = SNA − SNB (negativo si B está por delante de A).
 * FMA: plano de Frankfort (Po-Or) con el plano mandibular (Go-Me).
 * IMPA: plano mandibular (hacia Go) con el eje del incisivo inferior (ápice → borde).
 * U1-SN: línea S→N con el eje del incisivo superior (borde → ápice).
 * SN-GoGn: línea S-N con el plano Go-Gn (Steiner).
 * Ángulo facial: Frankfort hacia atrás (Or→Po) con el plano facial N→Pog (Downs).
 * Jarabak: altura facial posterior (S-Go) / anterior (N-Me) × 100; no depende de la escala.
 */
export function computeCeph(p: CephPoints): CephResult {
  const { S, N, A, B, Pog, Me, Go, Gn, Po, Or, U1T, U1A, L1T, L1A } = p;
  const sna = S && N && A ? angleAt(N, S, A) : null;
  const snb = S && N && B ? angleAt(N, S, B) : null;
  const fma = Po && Or && Go && Me ? angleBetweenLines(Po, Or, Go, Me) : null;
  const impa = Go && Me && L1T && L1A ? angleBetween(vec(Me, Go), vec(L1A, L1T)) : null;
  const upperIncisor = S && N && U1T && U1A ? angleBetween(vec(S, N), vec(U1T, U1A)) : null;
  const snGoGn = S && N && Go && Gn ? angleBetweenLines(S, N, Go, Gn) : null;
  const facialAngle = Po && Or && N && Pog ? angleBetween(vec(Or, Po), vec(N, Pog)) : null;
  const anterior = N && Me ? distance(N, Me) : 0;
  const jarabak = S && Go && anterior > 1e-6 ? (distance(S, Go) / anterior) * 100 : null;
  const snaR = round1(sna);
  const snbR = round1(snb);
  return {
    sna: snaR,
    snb: snbR,
    anb: snaR !== null && snbR !== null ? round1(snaR - snbR) : null,
    fma: round1(fma),
    impa: round1(impa),
    upperIncisor: round1(upperIncisor),
    snGoGn: round1(snGoGn),
    facialAngle: round1(facialAngle),
    jarabak: round1(jarabak),
  };
}

export type SkeletalClass = 'Clase I' | 'Clase II' | 'Clase III';

/** Regla clínica: ANB > 4° es Clase II, ANB < 0° es Clase III y de 0° a 4° es Clase I. */
export function skeletalClassForAnb(anb: number): SkeletalClass {
  return anb > 4 ? 'Clase II' : anb < 0 ? 'Clase III' : 'Clase I';
}

export function skeletalPatternText(cls: SkeletalClass): string {
  return `Patrón Esqueletal ${cls}`;
}

/** Texto con coma decimal para los campos del análisis cefalométrico. */
export function cephValueText(v: number | null): string {
  return v === null ? '' : String(v).replace('.', ',');
}
