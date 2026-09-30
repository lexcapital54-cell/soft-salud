import type { OrthoCephData } from './ortho-ceph.data';

/** Campo existente de `orthodontics.cephalometry` con el que se comparte el valor. */
export type CephLinkedField = 'sna' | 'snb' | 'anb' | 'wits' | 'fma' | 'impa' | 'upperIncisor';

export interface CephMeasureDef {
  key: string;
  label: string;
  unit: '°' | 'mm';
  norm: number;
  sd: number;
  linked?: CephLinkedField;
  high: string;
  low: string;
}

/** Normas de referencia editables por el profesional; la interpretación es orientativa. */
export const CEPH_MEASURES: CephMeasureDef[] = [
  { key: 'sna', label: 'SNA', unit: '°', norm: 82, sd: 2, linked: 'sna', high: 'Maxilar en posición adelantada', low: 'Maxilar en posición retruida' },
  { key: 'snb', label: 'SNB', unit: '°', norm: 80, sd: 2, linked: 'snb', high: 'Mandíbula en posición adelantada', low: 'Mandíbula en posición retruida' },
  { key: 'anb', label: 'ANB', unit: '°', norm: 2, sd: 2, linked: 'anb', high: 'Tendencia a relación esquelética de clase II', low: 'Tendencia a relación esquelética de clase III' },
  { key: 'wits', label: 'Wits', unit: 'mm', norm: 0, sd: 2, linked: 'wits', high: 'Tendencia a clase II', low: 'Tendencia a clase III' },
  { key: 'fma', label: 'FMA', unit: '°', norm: 25, sd: 5, linked: 'fma', high: 'Tendencia vertical (hiperdivergente)', low: 'Tendencia horizontal (hipodivergente)' },
  { key: 'sngogn', label: 'SN-GoGn', unit: '°', norm: 32, sd: 5, high: 'Plano mandibular inclinado (vertical)', low: 'Plano mandibular plano (horizontal)' },
  { key: 'impa', label: 'IMPA', unit: '°', norm: 90, sd: 5, linked: 'impa', high: 'Incisivo inferior proinclinado', low: 'Incisivo inferior retroinclinado' },
  { key: 'u1sn', label: '1-SN', unit: '°', norm: 103, sd: 6, linked: 'upperIncisor', high: 'Incisivo superior proinclinado', low: 'Incisivo superior retroinclinado' },
  { key: 'u1na', label: '1-NA', unit: '°', norm: 22, sd: 2, high: 'Incisivo superior proinclinado respecto a NA', low: 'Incisivo superior retroinclinado respecto a NA' },
  { key: 'l1nb', label: '1-NB', unit: '°', norm: 25, sd: 2, high: 'Incisivo inferior proinclinado respecto a NB', low: 'Incisivo inferior retroinclinado respecto a NB' },
  { key: 'interincisal', label: 'Ángulo interincisal', unit: '°', norm: 131, sd: 6, high: 'Incisivos verticalizados', low: 'Incisivos proinclinados (biprotrusión)' },
  { key: 'facialAxis', label: 'Eje facial', unit: '°', norm: 90, sd: 3.5, high: 'Crecimiento horizontal', low: 'Crecimiento vertical' },
  { key: 'facialDepth', label: 'Profundidad facial', unit: '°', norm: 87, sd: 3, high: 'Mandíbula prognática', low: 'Mandíbula retrognática' },
  { key: 'lowerFaceHeight', label: 'Altura facial inferior', unit: '°', norm: 47, sd: 4, high: 'Altura facial inferior aumentada', low: 'Altura facial inferior disminuida' },
];

export const CEPH_ANALYSES: Array<{ key: string; label: string; keys: string[] }> = [
  { key: 'COMPLETO', label: 'Todas las medidas', keys: CEPH_MEASURES.map((m) => m.key) },
  { key: 'STEINER', label: 'Steiner', keys: ['sna', 'snb', 'anb', 'u1na', 'l1nb', 'interincisal', 'sngogn'] },
  { key: 'RICKETTS', label: 'Ricketts', keys: ['facialAxis', 'facialDepth', 'lowerFaceHeight', 'interincisal'] },
  { key: 'TWEED', label: 'Tweed', keys: ['fma', 'impa'] },
  { key: 'JARABAK', label: 'Esquelético / vertical', keys: ['sna', 'snb', 'anb', 'wits', 'fma', 'sngogn'] },
];

export interface CephCell {
  def: CephMeasureDef;
  value: number | null;
  raw: string;
  norm: number;
  sd: number;
  diff: number | null;
  z: number | null;
  reading: string;
  tone: 'ok' | 'warn' | 'danger' | '';
}

const parse = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

export function cephCell(def: CephMeasureDef, ceph: OrthoCephData, linked: Record<string, string>): CephCell {
  const row = ceph.rows[def.key];
  const raw = def.linked ? linked[def.linked] || '' : row?.value || '';
  const value = parse(raw);
  const norm = parse(row?.norm) ?? def.norm;
  const sd = parse(row?.sd) ?? def.sd;
  if (value === null) return { def, value, raw, norm, sd, diff: null, z: null, reading: '', tone: '' };
  const diff = Math.round((value - norm) * 10) / 10;
  const z = sd ? diff / sd : 0;
  const az = Math.abs(z);
  const reading = az <= 1 ? 'Dentro de la norma' : z > 0 ? def.high : def.low;
  return { def, value, raw, norm, sd, diff, z, reading, tone: az <= 1 ? 'ok' : az <= 2 ? 'warn' : 'danger' };
}
