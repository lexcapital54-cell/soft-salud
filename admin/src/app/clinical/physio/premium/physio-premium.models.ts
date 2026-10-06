import { ClinicalContent, ClinicalEvolution, DiagnosisRow, Patient, PhysiotherapyContent } from '../../clinical.models';
import { zoneLabel } from '../physio-body-map.data';
import {
  OTHER_ANTECEDENTS,
  PAIN_FREQUENCIES,
  POSTURE_OPTIONS,
  RANGE_OPTIONS,
  STRENGTH_OPTIONS,
  THERAPIES,
  normalizeIntake,
  painBand,
  parsePain,
} from '../physio-intake.models';
import { PHYSIO_PLAN_STATUSES, ensurePlanRows, planTotals, rowSessions } from '../physio-plan.models';

/**
 * Vista de solo lectura de la historia de fisioterapia: arma lo que muestra el
 * tablero a partir de lo que ya está guardado. Nunca inventa valores: si un dato
 * no está registrado, devuelve null / lista vacía y la interfaz lo dice.
 */

export type Tone = 'ok' | 'mild' | 'warn' | 'danger' | 'neutral';

export interface Chip {
  text: string;
  tone: Tone;
}

export interface FunctionalMetric {
  key: string;
  label: string;
  icon: string;
  value: string | null;
  unit: string;
  detail: string;
  chip: Chip | null;
  /** Sección del formulario donde se edita. */
  go: string;
  /** Texto cuando no hay valor (por defecto «Pendiente de valoración»). */
  pending?: string;
}

export interface LabeledValue {
  label: string;
  value: string;
  tone?: Tone;
}

export const FUNCTION_KEYS: Array<{ key: string; label: string }> = [
  { key: 'sensitivity', label: 'Sensibilidad' },
  { key: 'coordination', label: 'Coordinación' },
  { key: 'balance', label: 'Equilibrio' },
  { key: 'gait', label: 'Marcha' },
  { key: 'cardiorespiratory', label: 'Funciones cardiorrespiratorias' },
  { key: 'otherFunctions', label: 'Otras funciones' },
];

export const SYSTEM_KEYS: Array<{ key: string; label: string }> = [
  { key: 'cardiovascular', label: 'Cardiovascular' },
  { key: 'respiratory', label: 'Respiratorio' },
  { key: 'neurological', label: 'Neurológico' },
  { key: 'musculoskeletal', label: 'Músculo-esquelético' },
  { key: 'skin', label: 'Piel y anexos' },
  { key: 'others', label: 'Otros' },
];

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const labelOf = (list: ReadonlyArray<{ key: string; label: string }>, key: string) => list.find((o) => o.key === key)?.label ?? '';
const join = (parts: Array<string | false | null | undefined>, sep = ' — ') => parts.filter((p): p is string => !!p && !!p.trim()).join(sep);

function functionStatus(raw: string): { text: string; tone: Tone } | null {
  if (raw === 'NORMAL') return { text: 'Normal', tone: 'ok' };
  if (raw === 'ALTERADO') return { text: 'Alterado', tone: 'warn' };
  if (raw === 'NA') return { text: 'No aplica', tone: 'neutral' };
  return raw ? { text: raw, tone: 'neutral' } : null;
}

/** Daniels "4/5" → 4. */
export function parseDaniels(raw: unknown): number | null {
  const m = t(raw).match(/^([0-5])\s*\/\s*5$/);
  return m ? Number(m[1]) : null;
}

function strengthChip(grade: number): Chip {
  if (grade >= 5) return { text: 'Normal', tone: 'ok' };
  if (grade === 4) return { text: 'Leve disminución', tone: 'mild' };
  if (grade === 3) return { text: 'Moderada', tone: 'warn' };
  return { text: 'Severa', tone: 'danger' };
}

function painChip(value: number): Chip {
  const band = painBand(value);
  if (value === 0) return { text: 'Sin dolor', tone: 'ok' };
  if (band.level === 'mild') return { text: 'Leve', tone: 'mild' };
  if (band.level === 'moderate') return { text: 'Moderado', tone: 'warn' };
  return { text: 'Severo', tone: 'danger' };
}

/** Indicadores del estado funcional actual (solo lo registrado en la valoración). */
export function functionalMetrics(ft: PhysiotherapyContent): FunctionalMetric[] {
  const i = normalizeIntake(ft.intake);
  const fa = ft.functionalAssessment ?? {};
  const pain = parsePain(fa['pain']);
  const grade = parseDaniels(fa['muscleStrength']);
  const gait = functionStatus(t(fa['gait']));
  const balance = functionStatus(t(fa['balance']));

  return [
    {
      key: 'pain',
      label: 'Dolor (EVA)',
      icon: 'pain',
      value: pain === null ? null : String(pain),
      unit: '/10',
      detail: i.painFrequency ? `Frecuencia: ${labelOf(PAIN_FREQUENCIES, i.painFrequency).toLowerCase()}` : '',
      chip: pain === null ? null : painChip(pain),
      go: 'ft-valoracion-funcional',
    },
    {
      key: 'mobility',
      label: 'Rango de movimiento',
      icon: 'mobility',
      value: i.rangeOfMotion ? labelOf(RANGE_OPTIONS, i.rangeOfMotion) : null,
      unit: '',
      detail: t(fa['jointMobility']) ? 'Goniometría registrada' : t(i.rangeNotes),
      chip: i.rangeOfMotion ? (i.rangeOfMotion === 'COMPLETO' ? { text: 'Normal', tone: 'ok' } : { text: 'Limitado', tone: 'warn' }) : null,
      go: 'ft-valoracion-funcional',
    },
    {
      key: 'strength',
      label: 'Fuerza muscular',
      icon: 'strength',
      value: grade !== null ? String(grade) : i.strength ? labelOf(STRENGTH_OPTIONS, i.strength) : null,
      unit: grade !== null ? '/5' : '',
      detail: grade !== null ? 'Escala de Daniels' : t(i.strengthNotes),
      chip:
        grade !== null
          ? strengthChip(grade)
          : i.strength
            ? i.strength === 'CONSERVADA'
              ? { text: 'Conservada', tone: 'ok' }
              : { text: 'Disminuida', tone: 'warn' }
            : null,
      go: 'ft-valoracion-funcional',
    },
    {
      key: 'posture',
      label: 'Postura',
      icon: 'posture',
      value: i.posture ? labelOf(POSTURE_OPTIONS, i.posture) : null,
      unit: '',
      detail: t(i.postureNotes),
      chip: i.posture ? (i.posture === 'NORMAL' ? { text: 'Normal', tone: 'ok' } : { text: 'Alterada', tone: 'warn' }) : null,
      go: 'ft-valoracion-funcional',
    },
    {
      key: 'gait',
      label: 'Marcha',
      icon: 'gait',
      value: gait?.text ?? null,
      unit: '',
      detail: '',
      chip: gait && gait.tone !== 'neutral' ? { text: gait.tone === 'ok' ? 'Estable' : 'Alterada', tone: gait.tone } : null,
      go: 'ft-valoracion-funcional',
    },
    {
      key: 'balance',
      label: 'Equilibrio',
      icon: 'balance',
      value: balance?.text ?? null,
      unit: '',
      detail: '',
      chip: balance && balance.tone !== 'neutral' ? { text: balance.tone === 'ok' ? 'Estable' : 'Alterado', tone: balance.tone } : null,
      go: 'ft-valoracion-funcional',
    },
  ];
}

/** Antecedentes clínicos y funcionales: categorías con casillas + texto + ocupación del paciente. */
export function antecedentRows(ft: PhysiotherapyContent, patient: Partial<Patient> | null): LabeledValue[] {
  const a = normalizeIntake(ft.intake).antecedents;
  const d = ft.antecedentsDetail ?? ({} as PhysiotherapyContent['antecedentsDetail']);
  const row = (label: string, noRefers: boolean, marks: Array<string | false>, detail: string): LabeledValue | null => {
    const value = join([...marks, t(detail)], ', ');
    if (value) return { label, value, tone: 'neutral' };
    return noRefers ? { label, value: 'No refiere', tone: 'ok' } : null;
  };
  const rows = [
    row('Patológicos', a.pathological.noRefers, [a.pathological.diabetes && 'Diabetes', a.pathological.hypertension && 'Hipertensión', a.pathological.surgeries && 'Cirugías'], d.pathological),
    row('Quirúrgicos', a.surgical.noRefers, [a.surgical.date && `Fecha ${formatDate(a.surgical.date)}`], d.surgical),
    row('Traumáticos', a.traumatic.noRefers, [a.traumatic.fractures && 'Fracturas', a.traumatic.sprains && 'Esguinces'], d.traumatic),
    row('Alergias', a.allergies.noRefers, [a.allergies.hasAllergies && 'Sí'], d.allergic),
    ...OTHER_ANTECEDENTS.map((o) => row(o.label, a.noRefersOther.includes(o.key), [], d[o.key])),
  ].filter((r): r is LabeledValue => !!r);
  const occupation = t(patient?.occupation);
  if (occupation) rows.push({ label: 'Ocupación', value: occupation, tone: 'neutral' });
  return rows;
}

/** Alertas reales que el profesional debe ver de inmediato (hoy: alergias registradas). */
export function clinicalAlerts(ft: PhysiotherapyContent): string[] {
  const a = normalizeIntake(ft.intake).antecedents.allergies;
  const detail = t(ft.antecedentsDetail?.allergic);
  if (a.hasAllergies || (detail && !/^no\b/i.test(detail))) {
    return [detail ? `Alergias: ${detail}` : 'Paciente con alergias registradas'];
  }
  return [];
}

/** Evaluación fisioterapéutica organizada por apartados (solo los que tienen datos). */
export function evaluationRows(ft: PhysiotherapyContent, content: ClinicalContent): LabeledValue[] {
  const i = normalizeIntake(ft.intake);
  const fa = ft.functionalAssessment ?? {};
  const pain = parsePain(fa['pain']);
  const abnormal = SYSTEM_KEYS.filter((s) => ft.systemsReviewGrid?.[s.key] === 'ANORMAL').map((s) => s.label);
  const normal = SYSTEM_KEYS.filter((s) => ft.systemsReviewGrid?.[s.key] === 'NORMAL').length;
  const rows: Array<LabeledValue | null> = [
    i.posture || t(i.postureNotes) ? { label: 'Postura', value: join([labelOf(POSTURE_OPTIONS, i.posture), t(i.postureNotes)]) } : null,
    pain !== null || i.painFrequency
      ? { label: 'Dolor', value: join([pain !== null && `EVA ${pain}/10 (${painBand(pain).label.toLowerCase()})`, i.painFrequency && `Frecuencia ${labelOf(PAIN_FREQUENCIES, i.painFrequency).toLowerCase()}`]) }
      : null,
    i.rangeOfMotion || t(i.rangeNotes) ? { label: 'Rango de movimiento', value: join([labelOf(RANGE_OPTIONS, i.rangeOfMotion), t(i.rangeNotes)]) } : null,
    t(fa['jointMobility']) ? { label: 'Goniometría', value: t(fa['jointMobility']) } : null,
    t(fa['muscleStrength']) || t(fa['muscleStrengthDetail']) || i.strength || t(i.strengthNotes)
      ? { label: 'Fuerza muscular', value: join([t(fa['muscleStrength']) && `Daniels ${t(fa['muscleStrength'])}`, t(fa['muscleStrengthDetail']), labelOf(STRENGTH_OPTIONS, i.strength), t(i.strengthNotes)]) }
      : null,
    t(fa['muscleTone']) ? { label: 'Tono muscular', value: t(fa['muscleTone']) } : null,
    ...FUNCTION_KEYS.map((f) => {
      const s = functionStatus(t(fa[f.key]));
      return s ? { label: f.label, value: s.text, tone: s.tone } : null;
    }),
    i.zones.length || t(i.zonesNotes) ? { label: 'Zonas a tratar', value: join([i.zones.map(zoneLabel).join(', '), t(i.zonesNotes)]) } : null,
    abnormal.length || normal || t(content.careMinimum?.systemsReview)
      ? {
          label: 'Revisión por sistemas',
          value: join([abnormal.length ? `Anormal: ${abnormal.join(', ')}` : normal ? 'Sin hallazgos anormales' : '', t(content.careMinimum?.systemsReview)]),
          tone: abnormal.length ? ('warn' as Tone) : undefined,
        }
      : null,
    t(ft.findings) ? { label: 'Observaciones clínicas', value: t(ft.findings) } : null,
  ];
  return rows.filter((r): r is LabeledValue => !!r && !!r.value);
}

export interface Impression {
  physioDiagnosis: string;
  code: string;
  codeDescription: string;
  narrative: string;
  cie: Array<{ code: string; description: string; type: string }>;
}

const DX_TYPE: Record<string, string> = { PRINCIPAL: 'Principal', RELATED: 'Relacionado', IMPRESSION: 'Impresión diagnóstica' };

export function impression(ft: PhysiotherapyContent, content: ClinicalContent, diagnoses: DiagnosisRow[]): Impression {
  return {
    physioDiagnosis: t(ft.physioDiagnosis),
    code: t(ft.physioDxCode),
    codeDescription: t(ft.physioDxDescription),
    narrative: t(content.assessment?.impressionNarrative),
    cie: diagnoses
      .filter((d) => t(d.cieCode))
      .map((d) => ({ code: t(d.cieCode), description: t(d.description), type: DX_TYPE[d.type] ?? '' })),
  };
}

export const hasImpression = (i: Impression) => !!(i.physioDiagnosis || i.code || i.codeDescription || i.narrative || i.cie.length);

/** Divide un texto clínico en ítems: por líneas, viñetas o numeración "1." / "1)". */
export function splitItems(text: string): string[] {
  const raw = t(text);
  if (!raw) return [];
  const lines = raw
    .split(/\r?\n|(?:^|\s)(?=\d{1,2}[.)]\s)/)
    .map((l) => l.replace(/^\s*(?:[-•*·]|\d{1,2}[.)])\s*/, '').trim())
    .filter(Boolean);
  return lines.length ? lines : [raw];
}

export interface TherapyItem {
  key: string;
  label: string;
  hint: string;
}

export function therapyItems(ft: PhysiotherapyContent): TherapyItem[] {
  const i = normalizeIntake(ft.intake);
  const items = i.therapies.map((k) => {
    const th = THERAPIES.find((x) => x.key === k);
    return { key: k, label: th?.label ?? k, hint: th?.hint ?? '' };
  });
  if (t(i.therapiesOther)) items.push({ key: 'other', label: t(i.therapiesOther), hint: '' });
  return items;
}

export interface PlanSummary {
  steps: string[];
  therapies: TherapyItem[];
  frequency: string;
  duration: string;
  sessions: string;
}

export function planSummary(ft: PhysiotherapyContent): PlanSummary {
  return {
    steps: splitItems(ft.interventionPlan),
    therapies: therapyItems(ft),
    frequency: t(ft.frequency),
    duration: t(ft.estimatedDuration),
    sessions: t(ft.sessionCount),
  };
}

export interface ObjectiveGroups {
  /** true si el texto distingue corto / mediano / largo plazo. */
  byTerm: boolean;
  groups: Array<{ term: string; items: string[] }>;
}

const TERMS: Array<{ term: string; re: RegExp }> = [
  { term: 'Corto plazo', re: /^\s*(?:objetivos?\s+(?:a|de)\s+)?corto\s+plazo\s*[:.-]?\s*/i },
  { term: 'Mediano plazo', re: /^\s*(?:objetivos?\s+(?:a|de)\s+)?mediano\s+plazo\s*[:.-]?\s*/i },
  { term: 'Largo plazo', re: /^\s*(?:objetivos?\s+(?:a|de)\s+)?largo\s+plazo\s*[:.-]?\s*/i },
];

/** Objetivos terapéuticos; si el profesional escribió "Corto plazo: …", se agrupan por plazo. */
export function objectiveGroups(text: string): ObjectiveGroups {
  const lines = t(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { byTerm: false, groups: [] };
  const groups: Array<{ term: string; items: string[] }> = [];
  let current: { term: string; items: string[] } | null = null;
  let found = false;
  for (const line of lines) {
    const term = TERMS.find((x) => x.re.test(line));
    if (term) {
      found = true;
      current = { term: term.term, items: [] };
      groups.push(current);
      const rest = line.replace(term.re, '').trim();
      if (rest) current.items.push(...splitItems(rest));
      continue;
    }
    if (!current) {
      current = { term: '', items: [] };
      groups.push(current);
    }
    current.items.push(...splitItems(line));
  }
  if (!found) return { byTerm: false, groups: [{ term: '', items: splitItems(text) }] };
  return { byTerm: true, groups: groups.filter((g) => g.items.length) };
}

export interface InterventionRow {
  technique: string;
  code: string;
  sessions: string;
  frequency: string;
  status: Chip | null;
  notes: string;
}

const PLAN_TONE: Record<string, Tone> = { PENDIENTE: 'neutral', EN_TRATAMIENTO: 'mild', TERMINADO: 'ok', CANCELADO: 'danger' };

/** Procedimientos del plan de tratamiento y terapias marcadas, en una sola tabla. */
export function interventionRows(ft: PhysiotherapyContent): InterventionRow[] {
  const rows: InterventionRow[] = ensurePlanRows(ft.treatmentPlan ?? [])
    .filter((r) => t(r.description) || t(r.cupsCode))
    .map((r) => ({
      technique: t(r.description) || t(r.cupsCode),
      code: t(r.description) ? t(r.cupsCode) : '',
      sessions: String(rowSessions(r)),
      frequency: t(ft.frequency),
      status: { text: labelOf(PHYSIO_PLAN_STATUSES, r.status), tone: PLAN_TONE[r.status] ?? 'neutral' },
      notes: t(r.notes),
    }));
  for (const th of therapyItems(ft)) {
    rows.push({
      technique: th.hint ? `${th.label} (${th.hint})` : th.label,
      code: '',
      sessions: t(ft.sessionCount),
      frequency: t(ft.frequency),
      status: null,
      notes: '',
    });
  }
  return rows;
}

export function planProgress(ft: PhysiotherapyContent) {
  return planTotals(ensurePlanRows(ft.treatmentPlan ?? []));
}

export interface EvolutionEntry {
  id: string;
  date: string;
  situation: string;
  note: string;
  professional: string;
  amendLabel: string;
  pain: number | null;
}

const GENERIC_REASONS = ['Nota de evolución', 'Control / nota de evolución', 'Adenda / nota aclaratoria'];
const AMEND_LABEL: Record<string, string> = { CORRECCION: 'Corrección', ACLARATORIA: 'Nota aclaratoria', ANEXO: 'Anexo' };

/** EVA escrita en la nota ("EVA 5", "EVA: 5/10", "dolor 5/10"); null si no aparece. */
export function painFromText(text: string): number | null {
  const m = text.match(/\bEVA\b\D{0,6}(\d{1,2})(?:\s*\/\s*10)?/i) ?? text.match(/\bdolor\b\D{0,12}(\d{1,2})\s*\/\s*10/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 10 ? n : null;
}

export function evolutionEntries(evolutions: ClinicalEvolution[]): EvolutionEntry[] {
  return evolutions
    .filter((ev) => !ev.content?._redacted)
    .map((ev) => {
      const situation = t(ev.content.currentSituation) || (GENERIC_REASONS.includes(t(ev.content.reason)) ? '' : t(ev.content.reason));
      const note = t(ev.content.note);
      return {
        id: ev.id,
        date: ev.clinicalAttentionDate || ev.signedAt,
        situation,
        note,
        professional: t(ev.author?.fullName) || t(ev.content.professionalName),
        amendLabel: ev.content.amends ? AMEND_LABEL[ev.content.amends.kind] ?? 'Nota enlazada' : '',
        pain: painFromText(`${situation}\n${note}`),
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export interface ChartPoint {
  date: string;
  value: number;
}

/** Serie de EVA: valoración inicial + EVA escrita en cada control (solo datos reales). */
export function painSeries(ft: PhysiotherapyContent, startedAt: string | null, entries: EvolutionEntry[]): ChartPoint[] {
  const points: ChartPoint[] = [];
  const initial = parsePain(ft.functionalAssessment?.['pain']);
  const i = normalizeIntake(ft.intake);
  const initialDate = i.assessmentDate || startedAt;
  if (initial !== null && initialDate) points.push({ date: initialDate, value: initial });
  for (const e of entries) if (e.pain !== null) points.push({ date: e.date, value: e.pain });
  return points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function formatDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }): string {
  if (!value) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-CO', opts);
}

export function ageFrom(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

const SEX_LABEL: Record<string, string> = { F: 'Femenino', M: 'Masculino', I: 'Intersexual', FEMALE: 'Femenino', MALE: 'Masculino', INTERSEX: 'Intersexual' };
export const sexLabel = (v: string | null | undefined) => (v ? SEX_LABEL[v.toUpperCase()] ?? v : '');
