import { skeletalClassForAnb } from './ceph-geometry';
import { DentistryContent } from './dentistry.models';

type Ortho = DentistryContent['orthodontics'];

export type OrthoMeasureGroup = 'intraoral' | 'cephalometry' | 'models';
export type OrthoMeasureKey =
  | 'intraoral.overjet'
  | 'intraoral.overbite'
  | 'cephalometry.sna'
  | 'cephalometry.snb'
  | 'cephalometry.anb'
  | 'cephalometry.wits'
  | 'cephalometry.fma'
  | 'cephalometry.impa'
  | 'cephalometry.upperIncisor'
  | 'models.upperDiscrepancy'
  | 'models.lowerDiscrepancy';

export interface OrthoMeasureRule {
  label: string;
  unit: '°' | 'mm';
  /** Rango físicamente posible; fuera de él el valor se considera un error de digitación. */
  min: number;
  max: number;
  /** Rango de normalidad clínica (valor de referencia). */
  norm?: [number, number];
  /** Admite «2 mm / 20 %» (overbite en milímetros y porcentaje). */
  allowPercent?: boolean;
  interpret: (v: number) => string;
}

export interface OrthoMeasureStatus {
  state: 'empty' | 'ok' | 'out' | 'invalid';
  value: number | null;
  message: string;
}

const between = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi;

export const ORTHO_MEASURE_RULES: Record<OrthoMeasureKey, OrthoMeasureRule> = {
  'intraoral.overjet': {
    label: 'Overjet',
    unit: 'mm',
    min: -15,
    max: 20,
    norm: [1, 3],
    interpret: (v) => (v < 0 ? 'Overjet negativo: mordida cruzada anterior' : v === 0 ? 'Borde a borde' : v > 3 ? 'Overjet aumentado' : 'Normal'),
  },
  'intraoral.overbite': {
    label: 'Overbite',
    unit: 'mm',
    min: -15,
    max: 15,
    norm: [1, 3],
    allowPercent: true,
    interpret: (v) => (v < 0 ? 'Overbite negativo: mordida abierta anterior' : v === 0 ? 'Borde a borde vertical' : v > 4 ? 'Mordida profunda' : v > 3 ? 'Overbite aumentado' : 'Normal'),
  },
  'cephalometry.sna': {
    label: 'SNA',
    unit: '°',
    min: 60,
    max: 110,
    norm: [80, 84],
    interpret: (v) => (v < 80 ? 'Maxilar retruido' : v > 84 ? 'Maxilar protruido' : 'Normal'),
  },
  'cephalometry.snb': {
    label: 'SNB',
    unit: '°',
    min: 60,
    max: 110,
    norm: [78, 82],
    interpret: (v) => (v < 78 ? 'Mandíbula retruida' : v > 82 ? 'Mandíbula protruida' : 'Normal'),
  },
  'cephalometry.anb': {
    label: 'ANB',
    unit: '°',
    min: -15,
    max: 15,
    norm: [0, 4],
    interpret: (v) => (v < 0 ? 'Clase III esquelética' : v > 4 ? 'Clase II esquelética' : 'Clase I esquelética'),
  },
  'cephalometry.wits': {
    label: 'Wits',
    unit: 'mm',
    min: -20,
    max: 20,
    norm: [-1, 1],
    interpret: (v) => (v > 1 ? 'Tendencia a Clase II' : v < -1 ? 'Tendencia a Clase III' : 'Normal'),
  },
  'cephalometry.fma': {
    label: 'FMA',
    unit: '°',
    min: 0,
    max: 60,
    norm: [22, 28],
    interpret: (v) => (v < 22 ? 'Patrón horizontal (braquifacial)' : v > 28 ? 'Patrón vertical (dolicofacial)' : 'Patrón neutro (mesofacial)'),
  },
  'cephalometry.impa': {
    label: 'IMPA',
    unit: '°',
    min: 60,
    max: 130,
    norm: [85, 95],
    interpret: (v) => (v < 85 ? 'Incisivo inferior retroinclinado' : v > 95 ? 'Incisivo inferior proinclinado' : 'Normal'),
  },
  'cephalometry.upperIncisor': {
    label: 'U1-SN',
    unit: '°',
    min: 70,
    max: 140,
    norm: [100, 106],
    interpret: (v) => (v < 100 ? 'Incisivo superior retroinclinado' : v > 106 ? 'Incisivo superior proinclinado' : 'Normal'),
  },
  'models.upperDiscrepancy': {
    label: 'Discrepancia superior',
    unit: 'mm',
    min: -30,
    max: 30,
    interpret: (v) => (v < 0 ? `Falta de espacio de ${fmt(-v)} mm` : v > 0 ? `Espacio sobrante de ${fmt(v)} mm` : 'Sin discrepancia'),
  },
  'models.lowerDiscrepancy': {
    label: 'Discrepancia inferior',
    unit: 'mm',
    min: -30,
    max: 30,
    interpret: (v) => (v < 0 ? `Falta de espacio de ${fmt(-v)} mm` : v > 0 ? `Espacio sobrante de ${fmt(v)} mm` : 'Sin discrepancia'),
  },
};

const NUMBER = String.raw`[+\-−]?\d+(?:[.,]\d+)?`;
const PLAIN = new RegExp(String.raw`^\s*(${NUMBER})\s*(?:mm|°|º|grados)?\s*$`, 'i');
const WITH_PERCENT = new RegExp(String.raw`^\s*(${NUMBER})\s*(?:mm)?\s*(?:/\s*\d+(?:[.,]\d+)?\s*%)?\s*$`, 'i');

export function fmt(v: number) {
  return String(Math.round(v * 10) / 10).replace('.', ',');
}

/** Número de la medida; `null` si está vacía y `NaN` si no se entiende. */
export function parseMeasure(raw: string | null | undefined, allowPercent = false): number | null {
  const text = (raw || '').trim();
  if (!text) return null;
  const match = (allowPercent ? WITH_PERCENT : PLAIN).exec(text);
  if (!match) return NaN;
  return Number(match[1].replace('−', '-').replace(',', '.'));
}

export function measureKey(group: OrthoMeasureGroup, field: string): OrthoMeasureKey | null {
  const key = `${group}.${field}`;
  return key in ORTHO_MEASURE_RULES ? (key as OrthoMeasureKey) : null;
}

function rawValue(o: Ortho, key: OrthoMeasureKey) {
  const [group, field] = key.split('.') as [OrthoMeasureGroup, string];
  return (o[group] as Record<string, string>)[field];
}

export function checkMeasure(key: OrthoMeasureKey, raw: string | null | undefined): OrthoMeasureStatus {
  const rule = ORTHO_MEASURE_RULES[key];
  const value = parseMeasure(raw, rule.allowPercent);
  const normText = rule.norm ? ` · norma ${fmt(rule.norm[0])} a ${fmt(rule.norm[1])} ${rule.unit}` : '';
  if (value === null) return { state: 'empty', value: null, message: rule.norm ? `Norma ${fmt(rule.norm[0])} a ${fmt(rule.norm[1])} ${rule.unit}` : '' };
  if (Number.isNaN(value)) {
    return {
      state: 'invalid',
      value: null,
      message: `Escriba solo el número en ${rule.unit}${rule.allowPercent ? ' (opcional: «2 mm / 20 %»)' : ''}`,
    };
  }
  if (value < rule.min || value > rule.max) {
    return { state: 'invalid', value, message: `Valor fuera de lo posible (${fmt(rule.min)} a ${fmt(rule.max)} ${rule.unit})` };
  }
  const inNorm = !rule.norm || between(value, rule.norm);
  return { state: inNorm ? 'ok' : 'out', value, message: `${rule.interpret(value)}${normText}` };
}

/** ANB = SNA − SNB, con coma decimal; `null` si falta alguno o no es válido. */
export function anbFrom(o: Ortho): string | null {
  const sna = checkMeasure('cephalometry.sna', o.cephalometry.sna);
  const snb = checkMeasure('cephalometry.snb', o.cephalometry.snb);
  if (sna.value === null || snb.value === null || sna.state === 'invalid' || snb.state === 'invalid') return null;
  return fmt(sna.value - snb.value);
}

export function skeletalClassFromAnb(o: Ortho): string | null {
  const anb = checkMeasure('cephalometry.anb', anbFrom(o) ?? o.cephalometry.anb);
  if (anb.value === null || anb.state === 'invalid') return null;
  return skeletalClassForAnb(anb.value);
}

export function growthPatternFromFma(o: Ortho): string | null {
  const fma = checkMeasure('cephalometry.fma', o.cephalometry.fma);
  if (fma.value === null || fma.state === 'invalid') return null;
  return fma.value < 22 ? 'Horizontal' : fma.value > 28 ? 'Vertical' : 'Neutro';
}

/** Medidas con valores imposibles o ilegibles: impiden cerrar la historia. */
export function orthoMeasureErrors(o: Ortho): string[] {
  return (Object.keys(ORTHO_MEASURE_RULES) as OrthoMeasureKey[])
    .map((key) => ({ key, status: checkMeasure(key, rawValue(o, key)) }))
    .filter(({ status }) => status.state === 'invalid')
    .map(({ key, status }) => `${ORTHO_MEASURE_RULES[key].label}: ${status.message.toLowerCase()}`);
}

/** Contradicciones entre medidas y hallazgos: se avisan pero no bloquean. */
export function orthoConsistencyWarnings(o: Ortho): string[] {
  const out: string[] = [];
  const overjet = checkMeasure('intraoral.overjet', o.intraoral.overjet);
  const overbite = checkMeasure('intraoral.overbite', o.intraoral.overbite);
  if (overjet.value !== null && overjet.state !== 'invalid' && overjet.value < 0 && ['', 'No'].includes(o.intraoral.crossBite)) {
    out.push('El overjet negativo indica mordida cruzada anterior, pero «Mordida cruzada» no lo registra.');
  }
  if (overbite.value !== null && overbite.state !== 'invalid' && overbite.value < 0 && ['', 'No'].includes(o.intraoral.openBite)) {
    out.push('El overbite negativo indica mordida abierta, pero «Mordida abierta» no lo registra.');
  }
  if (overbite.value !== null && overbite.state !== 'invalid' && overbite.value > 4 && o.intraoral.deepBite === 'No') {
    out.push('El overbite mayor de 4 mm indica mordida profunda, pero «Mordida profunda» está en No.');
  }
  if (overbite.value !== null && overbite.state !== 'invalid' && overbite.value >= 0 && ['Anterior'].includes(o.intraoral.openBite)) {
    out.push('Hay mordida abierta anterior registrada, pero el overbite no es negativo.');
  }
  const anb = anbFrom(o);
  if (anb !== null && o.cephalometry.anb.trim() && checkMeasure('cephalometry.anb', o.cephalometry.anb).value !== parseMeasure(anb)) {
    out.push(`El ANB registrado no coincide con SNA − SNB (${anb}°).`);
  }
  const skeletal = skeletalClassFromAnb(o);
  if (skeletal && o.cephalometry.skeletalClass && o.cephalometry.skeletalClass !== skeletal) {
    out.push(`La clase esquelética registrada (${o.cephalometry.skeletalClass}) no coincide con el ANB (${skeletal}).`);
  }
  const growth = growthPatternFromFma(o);
  if (growth && o.cephalometry.growthPattern && o.cephalometry.growthPattern !== growth) {
    out.push(`El patrón de crecimiento registrado (${o.cephalometry.growthPattern}) no coincide con el FMA (${growth}).`);
  }
  return out;
}
