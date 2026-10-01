export type FunctionState = '' | 'NORMAL' | 'ALTERADA';

export interface OrthoFunction {
  state: FunctionState;
  description: string;
  referral: string;
}

export interface SideFlags {
  right: boolean;
  left: boolean;
}

export interface OrthoExamData {
  smile: {
    smileLine: string;
    restExposure: string;
    smileExposure: string;
    gingivalExposure: string;
    smileArc: string;
    symmetry: string;
    occlusalCant: string;
    notes: string;
  };
  proportions: {
    upperThird: string;
    middleThird: string;
    lowerThird: string;
    facialHeight: string;
    facialWidth: string;
  };
  functional: {
    tmjPain: SideFlags;
    click: SideFlags;
    crepitus: SideFlags;
    deviation: string;
    maxOpening: string;
    lateralRight: string;
    lateralLeft: string;
    protrusion: string;
    temporal: SideFlags;
    masseter: SideFlags;
    pterygoid: SideFlags;
    breathing: OrthoFunction;
    swallowing: OrthoFunction;
    phonation: OrthoFunction;
    chewing: OrthoFunction;
    notes: string;
  };
}

export const SMILE_LINES = ['Baja', 'Media', 'Alta'];
export const SMILE_ARCS = ['Consonante', 'Plano', 'Invertido'];
export const SMILE_SYMMETRY = ['Simétrica', 'Asimétrica'];
export const OCCLUSAL_CANT = ['Sin inclinación', 'Inclinado a la derecha', 'Inclinado a la izquierda'];
export const MANDIBULAR_PATHS = ['Recta', 'Desviación derecha', 'Desviación izquierda', 'Deflexión derecha', 'Deflexión izquierda'];
export const FUNCTION_REFERRALS = [
  'Otorrinolaringología',
  'Fonoaudiología',
  'Fisioterapia',
  'Cirugía maxilofacial',
  'Alergología / neumología',
  'Psicología',
  'Otro',
];
export const ORTHO_FUNCTIONS: Array<{ key: 'breathing' | 'swallowing' | 'phonation' | 'chewing'; label: string; hint: string }> = [
  { key: 'breathing', label: 'Respiración', hint: 'Oral, mixta, obstrucción nasal, ronquido…' },
  { key: 'swallowing', label: 'Deglución', hint: 'Atípica, interposición lingual, contracción del mentón…' },
  { key: 'phonation', label: 'Fonación', hint: 'Sigmatismo, interdentalización de fonemas…' },
  { key: 'chewing', label: 'Masticación', hint: 'Unilateral, dolor, dificultad…' },
];

const sides = (): SideFlags => ({ right: false, left: false });
const fn = (): OrthoFunction => ({ state: '', description: '', referral: '' });

export function emptyOrthoExam(): OrthoExamData {
  return {
    smile: { smileLine: '', restExposure: '', smileExposure: '', gingivalExposure: '', smileArc: '', symmetry: '', occlusalCant: '', notes: '' },
    proportions: { upperThird: '', middleThird: '', lowerThird: '', facialHeight: '', facialWidth: '' },
    functional: {
      tmjPain: sides(),
      click: sides(),
      crepitus: sides(),
      deviation: '',
      maxOpening: '',
      lateralRight: '',
      lateralLeft: '',
      protrusion: '',
      temporal: sides(),
      masseter: sides(),
      pterygoid: sides(),
      breathing: fn(),
      swallowing: fn(),
      phonation: fn(),
      chewing: fn(),
      notes: '',
    },
  };
}

export function normalizeOrthoExam(raw: Partial<OrthoExamData> | undefined): OrthoExamData {
  const base = emptyOrthoExam();
  const r = raw || {};
  const f = (r.functional || {}) as Partial<OrthoExamData['functional']>;
  const bf = base.functional;
  return {
    smile: { ...base.smile, ...(r.smile || {}) },
    proportions: { ...base.proportions, ...(r.proportions || {}) },
    functional: {
      ...bf,
      ...f,
      tmjPain: { ...bf.tmjPain, ...(f.tmjPain || {}) },
      click: { ...bf.click, ...(f.click || {}) },
      crepitus: { ...bf.crepitus, ...(f.crepitus || {}) },
      temporal: { ...bf.temporal, ...(f.temporal || {}) },
      masseter: { ...bf.masseter, ...(f.masseter || {}) },
      pterygoid: { ...bf.pterygoid, ...(f.pterygoid || {}) },
      breathing: { ...bf.breathing, ...(f.breathing || {}) },
      swallowing: { ...bf.swallowing, ...(f.swallowing || {}) },
      phonation: { ...bf.phonation, ...(f.phonation || {}) },
      chewing: { ...bf.chewing, ...(f.chewing || {}) },
    },
  };
}

// ── Cálculos (orientativos; el profesional confirma) ──

/** Rangos de referencia orientativos usados por los cálculos y las escalas visuales. */
export const REST_EXPOSURE_REF: [number, number] = [2, 4];
export const GINGIVAL_SMILE_LIMIT = 3;
export const THIRD_PCT_REF: [number, number] = [30, 37];
export const FACIAL_INDEX_LIMITS: [number, number] = [85, 90];

export const num = (v: string) => {
  const s = String(v ?? '').trim();
  const n = Number(s.replace(',', '.'));
  return s && Number.isFinite(n) ? n : null;
};

export interface Hint {
  text: string;
  tone: 'ok' | 'warn' | 'danger';
}

/** Tercios en mm → porcentaje de cada uno y lectura del tercio inferior frente al medio. */
export function thirdsAnalysis(p: OrthoExamData['proportions']) {
  const u = num(p.upperThird);
  const m = num(p.middleThird);
  const l = num(p.lowerThird);
  const parts = [u, m, l].filter((x): x is number => x !== null && x > 0);
  const total = parts.reduce((s, x) => s + x, 0);
  const pct = (x: number | null) => (x !== null && total && parts.length === 3 ? Math.round((x / total) * 100) : null);
  let lowerReading: '' | 'Normal' | 'Aumentado' | 'Disminuido' = '';
  if (m && l) {
    const ratio = l / m;
    lowerReading = ratio > 1.1 ? 'Aumentado' : ratio < 0.9 ? 'Disminuido' : 'Normal';
  }
  return { upper: pct(u), middle: pct(m), lower: pct(l), lowerReading };
}

/** Índice facial morfológico de Martin (N–Me / ancho bicigomático × 100) y su correlación con el tipo facial. */
export function facialIndex(p: OrthoExamData['proportions']) {
  const h = num(p.facialHeight);
  const w = num(p.facialWidth);
  if (!h || !w) return null;
  const idx = Math.round((h / w) * 1000) / 10;
  if (idx < FACIAL_INDEX_LIMITS[0]) return { idx, name: 'Euriprosopo (cara ancha)', facialType: 'Braquifacial' };
  if (idx < FACIAL_INDEX_LIMITS[1]) return { idx, name: 'Mesoprosopo (cara media)', facialType: 'Mesofacial' };
  return { idx, name: 'Leptoprosopo (cara larga)', facialType: 'Dolicofacial' };
}

export function smileHints(s: OrthoExamData['smile']): Hint[] {
  const out: Hint[] = [];
  const rest = num(s.restExposure);
  if (rest !== null) {
    const [lo, hi] = REST_EXPOSURE_REF;
    if (rest < lo - 1) out.push({ text: `Exposición incisiva en reposo ${rest} mm: disminuida (referencia ${lo}–${hi} mm, se reduce con la edad).`, tone: 'warn' });
    else if (rest > hi) out.push({ text: `Exposición incisiva en reposo ${rest} mm: aumentada (referencia ${lo}–${hi} mm).`, tone: 'warn' });
    else out.push({ text: `Exposición incisiva en reposo ${rest} mm: dentro de la referencia.`, tone: 'ok' });
  }
  const g = num(s.gingivalExposure);
  if (g !== null && g > GINGIVAL_SMILE_LIMIT) out.push({ text: `Exposición gingival de ${g} mm al sonreír: sonrisa gingival (más de ${GINGIVAL_SMILE_LIMIT} mm).`, tone: 'warn' });
  return out;
}

/** Línea de sonrisa sugerida a partir de la exposición gingival. */
export function suggestSmileLine(s: OrthoExamData['smile']): string {
  const g = num(s.gingivalExposure);
  if (g === null) return '';
  return g > 0 ? 'Alta' : 'Media';
}

export function functionalHints(f: OrthoExamData['functional']): Hint[] {
  const out: Hint[] = [];
  const open = num(f.maxOpening);
  if (open !== null) {
    if (open < 40) out.push({ text: `Apertura máxima ${open} mm: limitada (referencia 40–55 mm).`, tone: 'danger' });
    else if (open > 55) out.push({ text: `Apertura máxima ${open} mm: aumentada, valore hipermovilidad.`, tone: 'warn' });
    else out.push({ text: `Apertura máxima ${open} mm: normal.`, tone: 'ok' });
  }
  for (const [label, v] of [
    ['Lateralidad derecha', f.lateralRight],
    ['Lateralidad izquierda', f.lateralLeft],
    ['Protrusión', f.protrusion],
  ] as const) {
    const n = num(v);
    if (n !== null && n < 7) out.push({ text: `${label} ${n} mm: reducida (referencia ≥ 7 mm).`, tone: 'warn' });
  }
  const r = num(f.lateralRight);
  const l = num(f.lateralLeft);
  if (r !== null && l !== null && Math.abs(r - l) >= 3) out.push({ text: `Lateralidades asimétricas (${r} / ${l} mm).`, tone: 'warn' });
  const sided = (s: SideFlags) => s.right || s.left;
  if (sided(f.tmjPain) || sided(f.crepitus)) out.push({ text: 'Signos articulares: considere valoración de trastorno temporomandibular antes de iniciar.', tone: 'danger' });
  return out;
}

export function sidesText(s: SideFlags) {
  return s.right && s.left ? 'bilateral' : s.right ? 'derecha' : s.left ? 'izquierda' : '';
}
