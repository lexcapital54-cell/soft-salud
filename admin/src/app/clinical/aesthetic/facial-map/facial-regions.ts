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

/**
 * Geometría calibrada sobre los rostros de referencia (fotos ficticias en public/facial-map).
 * Frontal: las bilaterales se repiten reflejadas sobre x = 100.
 */
const FRONTAL: Array<RegionShape & { both?: boolean }> = [
  { key: 'cuello', cx: 100, cy: 246, rx: 40, ry: 13 },
  { key: 'frente', cx: 100, cy: 54, rx: 46, ry: 20 },
  { key: 'perioral', cx: 100, cy: 176, rx: 31, ry: 20 },
  { key: 'temporal', cx: 35, cy: 80, rx: 6, ry: 14, both: true },
  { key: 'maseterina', cx: 45, cy: 156, rx: 8, ry: 13, both: true },
  { key: 'mejillas', cx: 58, cy: 153, rx: 13, ry: 12, both: true },
  { key: 'pomulos', cx: 46, cy: 122, rx: 9, ry: 9, both: true },
  { key: 'malar', cx: 63, cy: 128, rx: 10, ry: 7, both: true },
  { key: 'mandibular', cx: 55, cy: 182, rx: 13, ry: 8, both: true },
  { key: 'menton', cx: 100, cy: 205, rx: 18, ry: 10 },
  { key: 'submentoniana', cx: 100, cy: 224, rx: 16, ry: 5 },
  { key: 'cejas', cx: 61.5, cy: 83, rx: 23, ry: 4, both: true },
  { key: 'parpado_superior', cx: 65.5, cy: 97, rx: 14, ry: 3.5, both: true },
  { key: 'parpado_inferior', cx: 65.5, cy: 110.5, rx: 14, ry: 3, both: true },
  { key: 'surco_lagrimal', cx: 75, cy: 116, rx: 9, ry: 3, both: true },
  { key: 'periocular_lateral', cx: 44, cy: 104, rx: 4.5, ry: 7, both: true },
  { key: 'nariz', cx: 100, cy: 127, rx: 8, ry: 25 },
  { key: 'nasogeniano', cx: 78.7, cy: 161, rx: 4.5, ry: 13, both: true },
  { key: 'marioneta', cx: 73.5, cy: 191, rx: 4.5, ry: 9, both: true },
  { key: 'labios', cx: 100, cy: 175, rx: 26, ry: 13 },
  { key: 'glabela', cx: 100, cy: 88.5, rx: 7, ry: 7 },
];

/** Perfil derecho (nariz hacia la derecha del lector); el izquierdo se refleja. */
const PROFILE: RegionShape[] = [
  { key: 'cuello', cx: 100, cy: 236, rx: 40, ry: 20 },
  { key: 'frente', cx: 128, cy: 53, rx: 20, ry: 21 },
  { key: 'temporal', cx: 104, cy: 83, rx: 10, ry: 13 },
  { key: 'maseterina', cx: 91, cy: 161, rx: 10, ry: 14 },
  { key: 'mandibular', cx: 115, cy: 192, rx: 24, ry: 8 },
  { key: 'mejillas', cx: 122, cy: 151, rx: 13, ry: 12 },
  { key: 'pomulos', cx: 104, cy: 117, rx: 11, ry: 9 },
  { key: 'malar', cx: 125, cy: 122, rx: 10, ry: 7 },
  { key: 'perioral', cx: 151, cy: 167, rx: 13, ry: 17 },
  { key: 'submentoniana', cx: 130, cy: 213, rx: 15, ry: 6 },
  { key: 'menton', cx: 150, cy: 198, rx: 10, ry: 10 },
  { key: 'cejas', cx: 140.6, cy: 75.5, rx: 11, ry: 3.5 },
  { key: 'parpado_superior', cx: 134, cy: 92.4, rx: 7, ry: 3 },
  { key: 'parpado_inferior', cx: 133, cy: 105.5, rx: 7, ry: 2.5 },
  { key: 'surco_lagrimal', cx: 135.4, cy: 112, rx: 6, ry: 3 },
  { key: 'periocular_lateral', cx: 118.5, cy: 99, rx: 5, ry: 7 },
  { key: 'nasogeniano', cx: 147, cy: 151, rx: 4, ry: 10 },
  { key: 'marioneta', cx: 147, cy: 182, rx: 4, ry: 7 },
  { key: 'labios', cx: 157.5, cy: 164, rx: 7, ry: 10 },
  { key: 'nariz', cx: 161, cy: 118, rx: 11, ry: 20 },
  { key: 'glabela', cx: 152, cy: 86, rx: 4, ry: 5 },
];

/** 45° derecho (nariz hacia la derecha del lector); el izquierdo se refleja. */
const OBLIQUE: RegionShape[] = [
  { key: 'cuello', cx: 99, cy: 245, rx: 40, ry: 14 },
  { key: 'frente', cx: 116, cy: 52, rx: 48, ry: 19 },
  { key: 'perioral', cx: 130, cy: 174, rx: 30, ry: 20 },
  { key: 'temporal', cx: 58.6, cy: 78, rx: 9, ry: 14 },
  { key: 'maseterina', cx: 60, cy: 159, rx: 9, ry: 13 },
  { key: 'mejillas', cx: 83, cy: 154, rx: 14, ry: 12 },
  { key: 'pomulos', cx: 68, cy: 122, rx: 11, ry: 9 },
  { key: 'malar', cx: 94, cy: 128, rx: 11, ry: 7 },
  { key: 'mandibular', cx: 78, cy: 182, rx: 18, ry: 9 },
  { key: 'submentoniana', cx: 122, cy: 221, rx: 15, ry: 5 },
  { key: 'menton', cx: 135, cy: 206, rx: 17, ry: 10 },
  { key: 'cejas', cx: 95, cy: 82, rx: 27, ry: 4 },
  { key: 'cejas', cx: 163, cy: 79, rx: 17, ry: 4 },
  { key: 'parpado_superior', cx: 99, cy: 97, rx: 15, ry: 3 },
  { key: 'parpado_superior', cx: 160, cy: 97, rx: 12, ry: 3 },
  { key: 'parpado_inferior', cx: 99, cy: 109.4, rx: 15, ry: 3 },
  { key: 'parpado_inferior', cx: 160, cy: 109, rx: 11, ry: 3 },
  { key: 'surco_lagrimal', cx: 107, cy: 116, rx: 9, ry: 3 },
  { key: 'periocular_lateral', cx: 77, cy: 104, rx: 5, ry: 7 },
  { key: 'nasogeniano', cx: 116, cy: 156, rx: 4.5, ry: 12 },
  { key: 'marioneta', cx: 111, cy: 187.5, rx: 4.5, ry: 9 },
  { key: 'labios', cx: 130, cy: 171, rx: 24, ry: 12 },
  { key: 'nariz', cx: 133, cy: 125, rx: 12, ry: 23 },
  { key: 'glabela', cx: 135.4, cy: 86, rx: 6, ry: 6 },
];

/** En 45° el ojo y la ceja del fondo pertenecen al otro lado del paciente. */
const OBLIQUE_FAR_X = 148;

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
  if (view === 'OBLICUA_DER') return x > OBLIQUE_FAR_X ? 'IZQUIERDA' : 'DERECHA';
  if (view === 'OBLICUA_IZQ') return x < 200 - OBLIQUE_FAR_X ? 'DERECHA' : 'IZQUIERDA';
  if (view === 'DERECHO') return 'DERECHA';
  return 'IZQUIERDA';
}
