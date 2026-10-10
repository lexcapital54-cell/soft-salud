import { AesLaterality, AesView } from '../aesthetic-tracking.models';

/**
 * Regiones del mapa facial en el viewBox 200×260 de cada vista. Sirven para ubicar y
 * registrar lo que el profesional documenta; no indican puntos seguros de aplicación.
 * Se dibujan de mayor a menor para que las pequeñas queden encima.
 */
export interface RegionShape {
  key: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** Equivalencia con los códigos en inglés del catálogo anatómico (interoperabilidad futura). */
export const REGION_CODES: Record<string, string> = {
  frente: 'FOREHEAD',
  glabela: 'GLABELLA',
  temporal: 'TEMPLES',
  cejas: 'BROWS',
  periocular_lateral: 'CROWS_FEET',
  parpado_superior: 'UPPER_EYELIDS',
  parpado_inferior: 'LOWER_EYELIDS',
  surco_lagrimal: 'TEAR_TROUGH',
  periorbitaria: 'PERIORBITAL',
  mejillas: 'CHEEKS',
  malar: 'MALAR',
  pomulos: 'ZYGOMATIC',
  nasogeniano: 'NASOLABIAL',
  nariz: 'NOSE',
  perioral: 'PERIORAL',
  labios: 'LIPS',
  marioneta: 'MARIONETTE',
  menton: 'CHIN',
  mandibular: 'JAWLINE',
  maseterina: 'MASSETER',
  submentoniana: 'SUBMENTAL',
  cuello: 'NECK',
  corporal: 'BODY',
  otra: 'OTHER',
};

/** Regiones de la línea media: no tienen lado. */
export const MIDLINE_REGIONS = new Set(['glabela', 'nariz', 'labios', 'menton', 'submentoniana', 'perioral', 'cuello']);

/** Frontal: las bilaterales se repiten reflejadas sobre x = 100. */
const FRONTAL: Array<RegionShape & { both?: boolean }> = [
  { key: 'cuello', cx: 100, cy: 238, rx: 24, ry: 15 },
  { key: 'frente', cx: 100, cy: 50, rx: 42, ry: 19 },
  { key: 'perioral', cx: 100, cy: 156, rx: 25, ry: 15 },
  { key: 'temporal', cx: 52, cy: 80, rx: 9, ry: 15, both: true },
  { key: 'maseterina', cx: 53, cy: 156, rx: 8, ry: 12, both: true },
  { key: 'mejillas', cx: 67, cy: 140, rx: 11, ry: 10, both: true },
  { key: 'pomulos', cx: 61, cy: 114, rx: 10, ry: 8, both: true },
  { key: 'malar', cx: 76, cy: 125, rx: 9, ry: 6, both: true },
  { key: 'mandibular', cx: 65, cy: 176, rx: 13, ry: 7, both: true },
  { key: 'menton', cx: 100, cy: 193, rx: 14, ry: 9 },
  { key: 'submentoniana', cx: 100, cy: 215, rx: 17, ry: 6 },
  { key: 'cejas', cx: 77, cy: 80, rx: 13, ry: 4, both: true },
  { key: 'parpado_superior', cx: 77, cy: 89, rx: 10, ry: 3, both: true },
  { key: 'parpado_inferior', cx: 77, cy: 99.5, rx: 10, ry: 3, both: true },
  { key: 'surco_lagrimal', cx: 83, cy: 106, rx: 8, ry: 3, both: true },
  { key: 'periocular_lateral', cx: 59, cy: 95, rx: 5, ry: 7, both: true },
  { key: 'nariz', cx: 100, cy: 112, rx: 7, ry: 17 },
  { key: 'nasogeniano', cx: 86, cy: 141, rx: 4, ry: 10, both: true },
  { key: 'marioneta', cx: 82, cy: 170, rx: 4, ry: 8, both: true },
  { key: 'labios', cx: 100, cy: 156, rx: 16, ry: 7 },
  { key: 'glabela', cx: 100, cy: 82, rx: 7, ry: 6 },
];

/** Perfil derecho (nariz hacia la derecha del lector); el izquierdo se refleja. */
const PROFILE: RegionShape[] = [
  { key: 'cuello', cx: 88, cy: 232, rx: 26, ry: 16 },
  { key: 'frente', cx: 138, cy: 50, rx: 18, ry: 20 },
  { key: 'temporal', cx: 110, cy: 80, rx: 13, ry: 13 },
  { key: 'maseterina', cx: 104, cy: 152, rx: 9, ry: 13 },
  { key: 'mandibular', cx: 116, cy: 176, rx: 18, ry: 7 },
  { key: 'mejillas', cx: 130, cy: 146, rx: 10, ry: 9 },
  { key: 'pomulos', cx: 126, cy: 114, rx: 11, ry: 8 },
  { key: 'malar', cx: 138, cy: 127, rx: 9, ry: 6 },
  { key: 'perioral', cx: 156, cy: 154, rx: 9, ry: 11 },
  { key: 'submentoniana', cx: 130, cy: 203, rx: 12, ry: 6 },
  { key: 'menton', cx: 153, cy: 180, rx: 8, ry: 9 },
  { key: 'cejas', cx: 146, cy: 85, rx: 8, ry: 3 },
  { key: 'parpado_superior', cx: 147, cy: 92, rx: 5, ry: 2.5 },
  { key: 'parpado_inferior', cx: 147, cy: 102, rx: 5, ry: 2.5 },
  { key: 'surco_lagrimal', cx: 148, cy: 108, rx: 5, ry: 3 },
  { key: 'periocular_lateral', cx: 133, cy: 98, rx: 5, ry: 6 },
  { key: 'nasogeniano', cx: 152, cy: 140, rx: 4, ry: 8 },
  { key: 'marioneta', cx: 149, cy: 168, rx: 3.5, ry: 6 },
  { key: 'labios', cx: 161, cy: 152, rx: 5, ry: 7 },
  { key: 'nariz', cx: 163, cy: 114, rx: 7, ry: 11 },
  { key: 'glabela', cx: 155, cy: 84, rx: 4, ry: 4 },
];

/** 45° derecho (nariz hacia la derecha del lector); el izquierdo se refleja. */
const OBLIQUE: RegionShape[] = [
  { key: 'cuello', cx: 100, cy: 232, rx: 28, ry: 16 },
  { key: 'frente', cx: 108, cy: 50, rx: 36, ry: 18 },
  { key: 'perioral', cx: 130, cy: 154, rx: 17, ry: 12 },
  { key: 'temporal', cx: 64, cy: 82, rx: 10, ry: 14 },
  { key: 'maseterina', cx: 64, cy: 152, rx: 8, ry: 12 },
  { key: 'mejillas', cx: 86, cy: 146, rx: 11, ry: 9 },
  { key: 'pomulos', cx: 76, cy: 114, rx: 11, ry: 8 },
  { key: 'malar', cx: 94, cy: 126, rx: 10, ry: 6 },
  { key: 'mandibular', cx: 82, cy: 176, rx: 16, ry: 7 },
  { key: 'submentoniana', cx: 118, cy: 203, rx: 14, ry: 6 },
  { key: 'menton', cx: 134, cy: 183, rx: 11, ry: 8 },
  { key: 'cejas', cx: 85, cy: 84, rx: 11, ry: 3 },
  { key: 'cejas', cx: 124, cy: 85, rx: 7, ry: 3 },
  { key: 'parpado_superior', cx: 85, cy: 91, rx: 9, ry: 2.5 },
  { key: 'parpado_superior', cx: 124, cy: 92, rx: 6, ry: 2.5 },
  { key: 'parpado_inferior', cx: 85, cy: 101, rx: 9, ry: 2.5 },
  { key: 'parpado_inferior', cx: 124, cy: 100, rx: 6, ry: 2.5 },
  { key: 'surco_lagrimal', cx: 91, cy: 107, rx: 7, ry: 3 },
  { key: 'periocular_lateral', cx: 68, cy: 97, rx: 5, ry: 6 },
  { key: 'nasogeniano', cx: 116, cy: 140, rx: 4, ry: 10 },
  { key: 'marioneta', cx: 118, cy: 168, rx: 4, ry: 7 },
  { key: 'labios', cx: 132, cy: 153, rx: 13, ry: 6 },
  { key: 'nariz', cx: 138, cy: 112, rx: 7, ry: 15 },
  { key: 'glabela', cx: 112, cy: 82, rx: 6, ry: 5 },
];

const mirror = (z: RegionShape): RegionShape => ({ ...z, cx: 200 - z.cx });

export function regionsFor(view: AesView): RegionShape[] {
  if (view === 'FRONTAL') return FRONTAL.flatMap((z) => (z.both ? [z, mirror(z)] : [z]));
  if (view === 'OBLICUA_DER') return OBLIQUE;
  if (view === 'OBLICUA_IZQ') return OBLIQUE.map(mirror);
  if (view === 'DERECHO') return PROFILE;
  return PROFILE.map(mirror);
}

/** Región más pequeña que contiene el punto (la más específica), o '' si ninguna. */
export function regionAt(view: AesView, x: number, y: number): string {
  let best = '';
  let bestArea = Infinity;
  for (const z of regionsFor(view)) {
    const dx = (x - z.cx) / z.rx;
    const dy = (y - z.cy) / z.ry;
    if (dx * dx + dy * dy > 1) continue;
    const area = z.rx * z.ry;
    if (area < bestArea) {
      best = z.key;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Lado del paciente según la vista: en la frontal, la mitad izquierda del dibujo es el lado
 * derecho del paciente. Es una propuesta editable, no una conclusión clínica.
 */
export function lateralityAt(view: AesView, x: number, region: string): AesLaterality | '' {
  if (region && MIDLINE_REGIONS.has(region)) return 'CENTRAL';
  if (view === 'FRONTAL') {
    if (Math.abs(x - 100) <= 4) return 'CENTRAL';
    return x < 100 ? 'DERECHA' : 'IZQUIERDA';
  }
  if (view === 'DERECHO' || view === 'OBLICUA_DER') return 'DERECHA';
  return 'IZQUIERDA';
}
