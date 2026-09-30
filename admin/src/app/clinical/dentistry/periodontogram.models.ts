/** Tres sitios por cara, siempre en orden [mesial, central, distal]. */
export type PerioTriple<T> = [T, T, T];

export interface PerioFaces<T> {
  /** Vestibular. */
  b: PerioTriple<T>;
  /** Lingual / palatina. */
  l: PerioTriple<T>;
}

export interface PerioTooth {
  /** Profundidad de sondaje (mm). */
  pd: PerioFaces<number | null>;
  /** Margen gingival respecto a la LAC (mm): positivo = recesión, negativo = agrandamiento. */
  rec: PerioFaces<number | null>;
  bop: PerioFaces<boolean>;
  sup: PerioFaces<boolean>;
  plq: PerioFaces<boolean>;
  mobility: number | null;
  furcation: number | null;
}

export interface Periodontogram {
  teeth: Record<string, PerioTooth>;
  updatedAt: string;
}

export type PerioFace = keyof PerioFaces<unknown>;
export type PerioNumField = 'pd' | 'rec';
export type PerioFlagField = 'bop' | 'sup' | 'plq';

export const PERIO_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const PERIO_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

export const PERIO_SITE_LABELS = ['Mesial', 'Central', 'Distal'];

export function emptyPeriodontogram(): Periodontogram {
  return { teeth: {}, updatedAt: '' };
}

const nullTriple = (): PerioTriple<number | null> => [null, null, null];
const falseTriple = (): PerioTriple<boolean> => [false, false, false];

export function emptyPerioTooth(): PerioTooth {
  return {
    pd: { b: nullTriple(), l: nullTriple() },
    rec: { b: nullTriple(), l: nullTriple() },
    bop: { b: falseTriple(), l: falseTriple() },
    sup: { b: falseTriple(), l: falseTriple() },
    plq: { b: falseTriple(), l: falseTriple() },
    mobility: null,
    furcation: null,
  };
}

function numTriple(v: unknown): PerioTriple<number | null> {
  const a = Array.isArray(v) ? v : [];
  return [0, 1, 2].map((i) => (typeof a[i] === 'number' && Number.isFinite(a[i]) ? a[i] : null)) as PerioTriple<number | null>;
}

function boolTriple(v: unknown): PerioTriple<boolean> {
  const a = Array.isArray(v) ? v : [];
  return [0, 1, 2].map((i) => a[i] === true) as PerioTriple<boolean>;
}

export function normalizePeriodontogram(raw: Partial<Periodontogram> | undefined | null): Periodontogram {
  const teeth: Record<string, PerioTooth> = {};
  for (const [tooth, t] of Object.entries(raw?.teeth || {})) {
    const r = (t || {}) as Partial<PerioTooth>;
    teeth[tooth] = {
      pd: { b: numTriple(r.pd?.b), l: numTriple(r.pd?.l) },
      rec: { b: numTriple(r.rec?.b), l: numTriple(r.rec?.l) },
      bop: { b: boolTriple(r.bop?.b), l: boolTriple(r.bop?.l) },
      sup: { b: boolTriple(r.sup?.b), l: boolTriple(r.sup?.l) },
      plq: { b: boolTriple(r.plq?.b), l: boolTriple(r.plq?.l) },
      mobility: typeof r.mobility === 'number' ? r.mobility : null,
      furcation: typeof r.furcation === 'number' ? r.furcation : null,
    };
  }
  return { teeth, updatedAt: raw?.updatedAt || '' };
}

/** Molares y primeros premolares superiores (furca evaluable). */
export function hasFurcation(tooth: number) {
  const unit = tooth % 10;
  return unit >= 6 || tooth === 14 || tooth === 24;
}

/** Cuadrantes 1 y 4 se dibujan a la izquierda: el mesial queda hacia el centro (derecha). */
export function siteDisplayOrder(tooth: number): number[] {
  const q = Math.floor(tooth / 10);
  return q === 1 || q === 4 ? [2, 1, 0] : [0, 1, 2];
}

export function hasPerioData(p: Periodontogram | undefined | null) {
  return Object.values(p?.teeth || {}).some(
    (t) =>
      t.mobility !== null ||
      t.furcation !== null ||
      (['pd', 'rec'] as const).some((f) => [...t[f].b, ...t[f].l].some((v) => v !== null)) ||
      (['bop', 'sup', 'plq'] as const).some((f) => [...t[f].b, ...t[f].l].some(Boolean)),
  );
}

export interface PerioStats {
  teethCount: number;
  sitesMeasured: number;
  bopPct: number | null;
  plaquePct: number | null;
  meanPd: number | null;
  meanCal: number | null;
  sites4: number;
  sites6: number;
  maxCal: number | null;
  teethPd4: string[];
  recessions: Array<{ tooth: string; mm: number }>;
  mobility: Array<{ tooth: string; grade: number }>;
  furcations: Array<{ tooth: string; grade: number }>;
  suppuration: string[];
}

const ROMAN = ['0', 'I', 'II', 'III'];

export function furcationLabel(grade: number) {
  return ROMAN[grade] ?? String(grade);
}

/** Índices del periodontograma sobre los dientes presentes (se excluyen los ausentes del odontograma). */
export function perioStats(p: Periodontogram, absent: Set<string>): PerioStats {
  const present = [...PERIO_UPPER, ...PERIO_LOWER].map(String).filter((t) => !absent.has(t));
  let measured = 0;
  let pdSum = 0;
  let calSum = 0;
  let sites4 = 0;
  let sites6 = 0;
  let maxCal: number | null = null;
  let bop = 0;
  let plq = 0;
  const teethPd4: string[] = [];
  const recessions: PerioStats['recessions'] = [];
  const mobility: PerioStats['mobility'] = [];
  const furcations: PerioStats['furcations'] = [];
  const suppuration: string[] = [];
  let teethWithData = 0;

  for (const tooth of present) {
    const t = p.teeth[tooth];
    if (!t) continue;
    let toothHasData = false;
    let deep = false;
    let maxRec = 0;
    for (const face of ['b', 'l'] as const) {
      for (let i = 0; i < 3; i++) {
        const pd = t.pd[face][i];
        const rec = t.rec[face][i];
        if (t.bop[face][i]) bop++;
        if (t.plq[face][i]) plq++;
        if (pd !== null) {
          toothHasData = true;
          measured++;
          pdSum += pd;
          const cal = pd + (rec ?? 0);
          calSum += cal;
          maxCal = maxCal === null ? cal : Math.max(maxCal, cal);
          if (pd >= 4) {
            sites4++;
            deep = true;
          }
          if (pd >= 6) sites6++;
        }
        if (rec !== null && rec > maxRec) maxRec = rec;
        if (rec !== null) toothHasData = true;
      }
    }
    if (toothHasData) teethWithData++;
    if (deep) teethPd4.push(tooth);
    if (maxRec > 0) recessions.push({ tooth, mm: maxRec });
    if (t.mobility) mobility.push({ tooth, grade: t.mobility });
    if (t.furcation) furcations.push({ tooth, grade: t.furcation });
    if ([...t.sup.b, ...t.sup.l].some(Boolean)) suppuration.push(tooth);
  }
  const totalSites = present.length * 6;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const anyFlags = bop + plq > 0 || measured > 0;
  return {
    teethCount: teethWithData,
    sitesMeasured: measured,
    bopPct: anyFlags && totalSites ? Math.round((bop / totalSites) * 100) : null,
    plaquePct: anyFlags && totalSites ? Math.round((plq / totalSites) * 100) : null,
    meanPd: measured ? round1(pdSum / measured) : null,
    meanCal: measured ? round1(calSum / measured) : null,
    sites4,
    sites6,
    maxCal,
    teethPd4,
    recessions,
    mobility,
    furcations,
    suppuration,
  };
}
