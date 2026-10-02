import { PhysiotherapyContent } from '../clinical.models';

/** Valoración interactiva de fisioterapia (formato HC-FT): se guarda en `physiotherapy.intake`. */
export type ReferralSource = '' | 'REDES' | 'RECOMENDACION' | 'CONVENIO_EPS' | 'WEB' | 'OTRO';
export type PostureState = '' | 'NORMAL' | 'ALTERADA';
export type RangeState = '' | 'COMPLETO' | 'LIMITADO';
export type StrengthState = '' | 'CONSERVADA' | 'DISMINUIDA';
export type PainFrequency = '' | 'DIARIO' | 'SEMANAL' | 'INTERMITENTE' | 'MENSUAL';

export interface PhysioIntake {
  referralSource: ReferralSource;
  referralOther: string;
  assessmentDate: string;
  antecedents: {
    pathological: { noRefers: boolean; diabetes: boolean; hypertension: boolean; surgeries: boolean };
    surgical: { noRefers: boolean; date: string };
    traumatic: { noRefers: boolean; fractures: boolean; sprains: boolean };
    allergies: { noRefers: boolean; hasAllergies: boolean };
  };
  /** Zonas marcadas en el mapa corporal: `ant:hombro_der`, `post:lumbar`… */
  zones: string[];
  zonesNotes: string;
  therapies: string[];
  therapiesOther: string;
  posture: PostureState;
  postureNotes: string;
  rangeOfMotion: RangeState;
  rangeNotes: string;
  strength: StrengthState;
  strengthNotes: string;
  painFrequency: PainFrequency;
}

export const REFERRAL_SOURCES: Array<{ key: Exclude<ReferralSource, ''>; label: string }> = [
  { key: 'REDES', label: 'Redes sociales' },
  { key: 'RECOMENDACION', label: 'Recomendación' },
  { key: 'CONVENIO_EPS', label: 'Convenio EPS' },
  { key: 'WEB', label: 'Página web' },
  { key: 'OTRO', label: 'Otro' },
];

export const THERAPIES: Array<{ key: string; label: string; hint?: string }> = [
  { key: 'manualTherapy', label: 'Terapia manual' },
  { key: 'electrotherapy', label: 'Electroterapia', hint: 'TENS / IFC' },
  { key: 'ultrasound', label: 'Ultrasonido' },
  { key: 'therapeuticLaser', label: 'Láser terapéutico' },
  { key: 'magnetotherapy', label: 'Magnetoterapia' },
  { key: 'massageTherapy', label: 'Masoterapia' },
  { key: 'therapeuticExercise', label: 'Ejercicio terapéutico' },
  { key: 'lymphaticDrainage', label: 'Drenaje linfático' },
  { key: 'functionalTaping', label: 'Vendaje funcional' },
  { key: 'dryNeedling', label: 'Punción seca' },
  { key: 'hydrotherapy', label: 'Hidroterapia' },
];

export const POSTURE_OPTIONS = [
  { key: 'NORMAL', label: 'Normal' },
  { key: 'ALTERADA', label: 'Alterada' },
] as const;
export const RANGE_OPTIONS = [
  { key: 'COMPLETO', label: 'Completo' },
  { key: 'LIMITADO', label: 'Limitado' },
] as const;
export const STRENGTH_OPTIONS = [
  { key: 'CONSERVADA', label: 'Conservada' },
  { key: 'DISMINUIDA', label: 'Disminuida' },
] as const;
export const PAIN_FREQUENCIES: Array<{ key: Exclude<PainFrequency, ''>; label: string }> = [
  { key: 'DIARIO', label: 'Diario' },
  { key: 'SEMANAL', label: 'Semanal' },
  { key: 'INTERMITENTE', label: 'Intermitente' },
  { key: 'MENSUAL', label: 'Mensual' },
];

/** Escala EVA 0–10: verde leve, amarillo moderado, rojo severo. */
export function painBand(value: number | null): { level: 'none' | 'mild' | 'moderate' | 'severe'; label: string; face: string } {
  if (value == null) return { level: 'none', label: 'Sin registrar', face: '' };
  if (value === 0) return { level: 'mild', label: 'Sin dolor', face: '😀' };
  if (value <= 3) return { level: 'mild', label: 'Dolor leve', face: '🙂' };
  if (value <= 6) return { level: 'moderate', label: 'Dolor moderado', face: '😐' };
  if (value <= 8) return { level: 'severe', label: 'Dolor severo', face: '😣' };
  return { level: 'severe', label: 'Dolor insoportable', face: '😫' };
}

/** "7", "7/10" o "" → número 0–10 o null. */
export function parsePain(raw: unknown): number | null {
  const m = String(raw ?? '').match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 0 && n <= 10 ? n : null;
}

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const bool = (v: unknown) => v === true;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | '' =>
  allowed.includes(v as T) ? (v as T) : '';
const strList = (v: unknown, allowed?: (s: string) => boolean) =>
  Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string' && (!allowed || allowed(s))))] : [];

/**
 * Normaliza lo guardado (o ausente) sin perder datos válidos: cualquier campo
 * desconocido o con tipo incorrecto vuelve a su valor vacío.
 */
export function normalizeIntake(raw: unknown): PhysioIntake {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const a = (r['antecedents'] ?? {}) as Record<string, any>;
  const pat = a['pathological'] ?? {};
  const sur = a['surgical'] ?? {};
  const tra = a['traumatic'] ?? {};
  const all = a['allergies'] ?? {};
  return {
    referralSource: oneOf(r['referralSource'], REFERRAL_SOURCES.map((s) => s.key)),
    referralOther: str(r['referralOther'], 120),
    assessmentDate: /^\d{4}-\d{2}-\d{2}$/.test(r['assessmentDate'] ?? '') ? r['assessmentDate'] : '',
    antecedents: {
      pathological: { noRefers: bool(pat.noRefers), diabetes: bool(pat.diabetes), hypertension: bool(pat.hypertension), surgeries: bool(pat.surgeries) },
      surgical: { noRefers: bool(sur.noRefers), date: /^\d{4}-\d{2}-\d{2}$/.test(sur.date ?? '') ? sur.date : '' },
      traumatic: { noRefers: bool(tra.noRefers), fractures: bool(tra.fractures), sprains: bool(tra.sprains) },
      allergies: { noRefers: bool(all.noRefers), hasAllergies: bool(all.hasAllergies) },
    },
    zones: strList(r['zones'], (s) => /^(ant|post):[a-z_]+$/.test(s)),
    zonesNotes: str(r['zonesNotes']),
    therapies: strList(r['therapies'], (s) => THERAPIES.some((t) => t.key === s)),
    therapiesOther: str(r['therapiesOther'], 300),
    posture: oneOf(r['posture'], ['NORMAL', 'ALTERADA'] as const),
    postureNotes: str(r['postureNotes']),
    rangeOfMotion: oneOf(r['rangeOfMotion'], ['COMPLETO', 'LIMITADO'] as const),
    rangeNotes: str(r['rangeNotes']),
    strength: oneOf(r['strength'], ['CONSERVADA', 'DISMINUIDA'] as const),
    strengthNotes: str(r['strengthNotes']),
    painFrequency: oneOf(r['painFrequency'], PAIN_FREQUENCIES.map((f) => f.key)),
  };
}

/** Bloque interactivo del FT, creado y normalizado al primer uso. */
export function ensureIntake(ft: PhysiotherapyContent): PhysioIntake {
  if (!ft.intake || (ft.intake as { _ok?: boolean })._ok !== true) {
    const intake = normalizeIntake(ft.intake);
    Object.defineProperty(intake, '_ok', { value: true, enumerable: false });
    ft.intake = intake;
  }
  return ft.intake;
}

export const therapyLabel = (key: string) => {
  const t = THERAPIES.find((x) => x.key === key);
  return t ? (t.hint ? `${t.label} (${t.hint})` : t.label) : key;
};
