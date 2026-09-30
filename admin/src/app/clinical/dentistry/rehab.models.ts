export interface ImplantRow {
  tooth: string;
  brand: string;
  platform: string;
  diameter: string;
  length: string;
  placedAt: string;
  torque: string;
  isq: string;
  graft: string;
  loading: string;
  restoration: string;
  status: string;
  notes: string;
}

export interface ProsthesisRow {
  type: string;
  teeth: string;
  material: string;
  status: string;
  lab: string;
  installedAt: string;
  notes: string;
}

export interface KennedySnapshot {
  upper: string;
  lower: string;
  at: string;
}

export interface RehabData {
  implants: ImplantRow[];
  prostheses: ProsthesisRow[];
  kennedy: KennedySnapshot;
  verticalDimension: string;
  occlusalScheme: string;
  notes: string;
}

export const IMPLANT_LOADING = ['Inmediata', 'Temprana', 'Convencional (diferida)'];
export const IMPLANT_RESTORATIONS = ['Corona atornillada', 'Corona cementada', 'Puente sobre implantes', 'Sobredentadura', 'Híbrida', 'Sin rehabilitar'];
export const IMPLANT_STATUSES = ['Planeado', 'Osteointegración', 'Cargado', 'Periimplantitis', 'Mucositis', 'Falla / retirado'];
export const PROSTHESIS_TYPES = [
  'Corona',
  'Puente fijo',
  'Prótesis parcial removible',
  'Prótesis total',
  'Sobredentadura',
  'Carilla',
  'Incrustación',
  'Provisional',
];
export const PROSTHESIS_MATERIALS = ['Metal-cerámica', 'Zirconio', 'Disilicato de litio', 'Resina', 'Acrílico', 'Cromo-cobalto', 'Flexible (nylon)', 'PMMA'];
export const PROSTHESIS_STATUSES = ['Planeada', 'Preparación', 'En laboratorio', 'Prueba', 'Instalada', 'Reparación', 'Reemplazo indicado'];
export const OCCLUSAL_SCHEMES = ['Guía canina', 'Función de grupo', 'Oclusión balanceada bilateral', 'Oclusión mutuamente protegida', 'Lingualizada'];

export function emptyImplantRow(tooth = ''): ImplantRow {
  return {
    tooth,
    brand: '',
    platform: '',
    diameter: '',
    length: '',
    placedAt: '',
    torque: '',
    isq: '',
    graft: '',
    loading: '',
    restoration: '',
    status: '',
    notes: '',
  };
}

export function emptyProsthesisRow(): ProsthesisRow {
  return { type: '', teeth: '', material: '', status: '', lab: '', installedAt: '', notes: '' };
}

export function emptyRehab(): RehabData {
  return {
    implants: [],
    prostheses: [],
    kennedy: { upper: '', lower: '', at: '' },
    verticalDimension: '',
    occlusalScheme: '',
    notes: '',
  };
}

export function normalizeRehab(raw: Partial<RehabData> | undefined): RehabData {
  const r = raw || {};
  return {
    ...emptyRehab(),
    ...r,
    implants: (r.implants || []).map((x) => ({ ...emptyImplantRow(), ...x })),
    prostheses: (r.prostheses || []).map((x) => ({ ...emptyProsthesisRow(), ...x })),
    kennedy: { upper: '', lower: '', at: '', ...(r.kennedy || {}) },
  };
}

export function hasRehabData(r: RehabData) {
  return !!(r.implants.length || r.prostheses.length || r.kennedy.at || r.verticalDimension || r.occlusalScheme || r.notes.trim());
}

// ── Clasificación de Kennedy (con reglas de Applegate) ──

export interface KennedyResult {
  label: string;
  cls: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  modifications: number;
  missing: number[];
  spaces: number[][];
}

const SIDE = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * `missing` = piezas permanentes sin diente ni implante (ausentes o reemplazadas por prótesis removible).
 * Los terceros molares ausentes no cuentan (Applegate); si están presentes sirven de pilar.
 */
export function kennedyForArch(arch: 'upper' | 'lower', missing: Set<number>, present: Set<number>): KennedyResult {
  const [right, left] = arch === 'upper' ? [1, 2] : [4, 3];
  const sideSeq = (q: number) => SIDE.filter((n) => n < 8 || present.has(q * 10 + 8)).map((n) => q * 10 + n);
  const rightSeq = sideSeq(right);
  const leftSeq = sideSeq(left);
  const seq = [...rightSeq.slice().reverse(), ...leftSeq];
  const miss = seq.filter((t) => missing.has(t));
  const empty: KennedyResult = { label: '', cls: 0, modifications: 0, missing: miss, spaces: [] };
  if (!miss.length) return { ...empty, label: 'Arcada completa (sin espacios edéntulos)' };
  if (miss.length === seq.length) return { ...empty, cls: 5, label: 'Desdentado total' };

  const spaces: number[][] = [];
  let cur: number[] = [];
  for (const t of seq) {
    if (missing.has(t)) cur.push(t);
    else if (cur.length) {
      spaces.push(cur);
      cur = [];
    }
  }
  if (cur.length) spaces.push(cur);

  const rightDistal = rightSeq[rightSeq.length - 1];
  const leftDistal = leftSeq[leftSeq.length - 1];
  const freeRight = missing.has(rightDistal);
  const freeLeft = missing.has(leftDistal);
  const base = { missing: miss, spaces };
  const mod = (n: number) => (n > 0 ? `, modificación ${n}` : '');

  if (freeRight && freeLeft) {
    const m = spaces.length - (spaces.length === 1 ? 1 : 2);
    return { ...base, cls: 1, modifications: m, label: `Clase I de Kennedy (extremo libre bilateral)${mod(m)}` };
  }
  if (freeRight || freeLeft) {
    const m = spaces.length - 1;
    return { ...base, cls: 2, modifications: m, label: `Clase II de Kennedy (extremo libre ${freeRight ? 'derecho' : 'izquierdo'})${mod(m)}` };
  }
  const c1 = right * 10 + 1;
  const c2 = left * 10 + 1;
  if (spaces.length === 1 && spaces[0].includes(c1) && spaces[0].includes(c2)) {
    return { ...base, cls: 4, modifications: 0, label: 'Clase IV de Kennedy (espacio anterior que cruza la línea media)' };
  }
  const m = spaces.length - 1;
  return { ...base, cls: 3, modifications: m, label: `Clase III de Kennedy (espacio limitado por dientes)${mod(m)}` };
}

export function spaceText(spaces: number[][]) {
  return spaces.map((s) => (s.length === 1 ? `${s[0]}` : `${s[0]}–${s[s.length - 1]}`)).join(', ');
}
