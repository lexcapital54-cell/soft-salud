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
  | 'L1A'
  | 'OPp'
  | 'OPa'
  | 'R1'
  | 'R2';

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
  { key: 'OPp', short: 'POp', label: 'Plano oclusal posterior', hint: 'Punto de contacto de las cúspides de los primeros molares (plano oclusal funcional).' },
  { key: 'OPa', short: 'POa', label: 'Plano oclusal anterior', hint: 'Punto de contacto de los premolares / entrecruzamiento incisal, delante de los molares.' },
  { key: 'R1', short: 'R1', label: 'Regla: inicio', hint: 'Primera marca de la regla milimetrada de la radiografía (calibración).' },
  { key: 'R2', short: 'R2', label: 'Regla: fin', hint: 'Segunda marca de la regla; indique abajo cuántos milímetros hay entre R1 y R2.' },
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
  { from: 'OPp', to: 'OPa', kind: 'plane' },
  { from: 'R1', to: 'R2', kind: 'axis' },
];

/** Proyección de un punto sobre la recta a→b: distancia firmada desde `a` en la dirección a→b. */
export function projectOn(a: CephPoint, b: CephPoint, p: CephPoint): number | null {
  const len = distance(a, b);
  if (len < 1e-6) return null;
  return ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len;
}

/** Pie de la perpendicular desde `p` sobre la recta a→b (para dibujar AO y BO). */
export function footOn(a: CephPoint, b: CephPoint, p: CephPoint): CephPoint | null {
  const t = projectOn(a, b, p);
  const len = distance(a, b);
  if (t === null) return null;
  return { x: a.x + ((b.x - a.x) * t) / len, y: a.y + ((b.y - a.y) * t) / len };
}

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
  /** Wits en mm: AO − BO sobre el plano oclusal funcional (positivo = A por delante de B). */
  wits: number | null;
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
 * Wits: A y B proyectados sobre el plano oclusal (posterior → anterior); necesita la regla R1-R2 en mm.
 */
export function computeCeph(p: CephPoints, calibrationMm = 10): CephResult {
  const { S, N, A, B, Pog, Me, Go, Gn, Po, Or, U1T, U1A, L1T, L1A, OPp, OPa, R1, R2 } = p;
  const sna = S && N && A ? angleAt(N, S, A) : null;
  const snb = S && N && B ? angleAt(N, S, B) : null;
  const fma = Po && Or && Go && Me ? angleBetweenLines(Po, Or, Go, Me) : null;
  const impa = Go && Me && L1T && L1A ? angleBetween(vec(Me, Go), vec(L1A, L1T)) : null;
  const upperIncisor = S && N && U1T && U1A ? angleBetween(vec(S, N), vec(U1T, U1A)) : null;
  const snGoGn = S && N && Go && Gn ? angleBetweenLines(S, N, Go, Gn) : null;
  const facialAngle = Po && Or && N && Pog ? angleBetween(vec(Or, Po), vec(N, Pog)) : null;
  const anterior = N && Me ? distance(N, Me) : 0;
  const jarabak = S && Go && anterior > 1e-6 ? (distance(S, Go) / anterior) * 100 : null;
  let wits: number | null = null;
  const rulerPx = R1 && R2 ? distance(R1, R2) : 0;
  if (A && B && OPp && OPa && rulerPx > 1e-6 && calibrationMm > 0) {
    const ao = projectOn(OPp, OPa, A);
    const bo = projectOn(OPp, OPa, B);
    if (ao !== null && bo !== null) wits = ((ao - bo) * calibrationMm) / rulerPx;
  }
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
    wits: round1(wits),
  };
}

const signed = (v: number) => `${v > 0 ? '+' : ''}${String(v).replace('.', ',')}`;

/**
 * Diagnóstico descriptivo: clase por ANB, causa por SNA/SNB, contraste con Wits y
 * patrón vertical por FMA (o SN-GoGn). Ej.: «Clase II Esqueletal por retrognatismo mandibular».
 */
export function cephDiagnosisText(r: CephResult): string | null {
  if (r.anb === null) return null;
  const cls = skeletalClassForAnb(r.anb);
  const sna = r.sna;
  const snb = r.snb;
  let cause = '';
  if (cls === 'Clase II') {
    const maxPro = sna !== null && sna > 84;
    const mandRet = snb !== null && snb < 78;
    cause = maxPro && mandRet
      ? 'por prognatismo maxilar y retrognatismo mandibular'
      : mandRet ? 'por retrognatismo mandibular'
      : maxPro ? 'por prognatismo maxilar'
      : 'con bases óseas en norma (discrepancia relativa)';
  } else if (cls === 'Clase III') {
    const mandPro = snb !== null && snb > 82;
    const maxRet = sna !== null && sna < 80;
    cause = mandPro && maxRet
      ? 'por retrognatismo maxilar y prognatismo mandibular'
      : mandPro ? 'por prognatismo mandibular'
      : maxRet ? 'por retrognatismo maxilar'
      : 'con bases óseas en norma (discrepancia relativa)';
  } else if (sna !== null && snb !== null) {
    cause = sna > 84 && snb > 82 ? 'con biprotrusión maxilomandibular' : sna < 80 && snb < 78 ? 'con birretrusión maxilomandibular' : '';
  }
  const parts = [[`${cls} Esqueletal`, cause].filter(Boolean).join(' ')];
  if (r.wits !== null) {
    const witsCls: SkeletalClass = r.wits > 1 ? 'Clase II' : r.wits < -1 ? 'Clase III' : 'Clase I';
    parts.push(
      witsCls === cls
        ? `confirmada por Wits de ${signed(r.wits)} mm`
        : `Wits de ${signed(r.wits)} mm sugiere ${witsCls} (revisar plano oclusal y rotación mandibular)`,
    );
  }
  let text = parts.join(', ');
  if (r.fma !== null) {
    text += `; ${r.fma < 22 ? 'patrón de crecimiento horizontal (braquifacial)' : r.fma > 28 ? 'patrón de crecimiento vertical (dolicofacial)' : 'patrón de crecimiento neutro (mesofacial)'} con FMA de ${String(r.fma).replace('.', ',')}°`;
  } else if (r.snGoGn !== null) {
    text += `; ${r.snGoGn < 27 ? 'hipodivergente' : r.snGoGn > 37 ? 'hiperdivergente' : 'normodivergente'} con SN-GoGn de ${String(r.snGoGn).replace('.', ',')}°`;
  }
  return `${text}.`;
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
