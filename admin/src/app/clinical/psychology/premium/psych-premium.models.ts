import { ClinicalContent, DiagnosisRow, Patient, PsychologyContent } from '../../clinical.models';
import { NO_OTHER_SPECIALTY } from '../../patient-extras';
import { PHYSIO_PLAN_STATUSES, ensurePlanRows, planTotals, rowSessions } from '../../physio/physio-plan.models';
import type { InterventionRow, LabeledValue, Tone } from '../../physio/premium/physio-premium.models';

/**
 * Vista de solo lectura de la historia de psicología para el tablero. Solo usa
 * lo que el formulario ya guarda: si un dato no está, devuelve vacío y la
 * interfaz lo dice.
 */

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const ANTECEDENT_LABELS: Array<{ key: 'personales' | 'psiquiatricos' | 'familiares' | 'toxicos'; label: string }> = [
  { key: 'personales', label: 'Personales' },
  { key: 'psiquiatricos', label: 'Psiquiátricos' },
  { key: 'familiares', label: 'Familiares' },
  { key: 'toxicos', label: 'Tóxicos' },
];

/** Antecedentes marcados con «Aplica», texto libre y lo registrado en la ficha de ingreso. */
export function psychAntecedentRows(content: ClinicalContent, patient: Partial<Patient> | null): LabeledValue[] {
  const flags = content.careMinimum?.antecedentFlags;
  const rows: LabeledValue[] = [];
  for (const a of ANTECEDENT_LABELS) {
    const f = flags?.[a.key];
    if (f?.applies) rows.push({ label: a.label, value: t(f.detail) || 'Aplica', tone: 'neutral' });
  }
  const free = t(content.careMinimum?.antecedents);
  if (free) rows.push({ label: 'Otros antecedentes', value: free });
  const e = patient?.extras;
  const care = (e?.otherSpecialtyCare ?? []).filter(Boolean);
  if (care.length) {
    const none = care.includes(NO_OTHER_SPECIALTY);
    const detail = none ? '' : t(e?.otherSpecialtyDetail);
    rows.push({
      label: 'Otra especialidad',
      value: [care.join(', '), detail].filter(Boolean).join(' — '),
      tone: none ? 'ok' : 'neutral',
    });
  }
  const meds = t(e?.currentMedications);
  if (meds) rows.push({ label: 'Medicamentos actuales', value: meds });
  return rows;
}

const MENTAL_FIELDS: Array<{ key: keyof ClinicalContent['mentalExam']; label: string }> = [
  { key: 'appearance', label: 'Apariencia' },
  { key: 'behavior', label: 'Conducta' },
  { key: 'speech', label: 'Lenguaje' },
  { key: 'mood', label: 'Ánimo' },
  { key: 'affect', label: 'Afecto' },
  { key: 'thought', label: 'Pensamiento' },
  { key: 'perception', label: 'Percepción' },
  { key: 'judgment', label: 'Juicio' },
  { key: 'insight', label: 'Introspección' },
];

/** Examen mental: texto libre actual + campos por ítem de historias anteriores, si existen. */
export function mentalExam(content: ClinicalContent): { narrative: string; rows: LabeledValue[] } {
  const m = content.mentalExam;
  return {
    narrative: t(m?.narrative),
    rows: MENTAL_FIELDS.map((f) => ({ label: f.label, value: t(m?.[f.key]) })).filter((r) => r.value),
  };
}

/**
 * Alerta de riesgo registrada en historias anteriores (el bloque separado ya no
 * existe en el formulario). Se muestra tal cual; no se interpreta el texto.
 */
export function riskAlert(content: ClinicalContent): string {
  const r = content.risks;
  const risk = t(r?.suicideRisk);
  if (!risk || /^(no|ninguno|sin riesgo|n\/a)\.?$/i.test(risk)) return '';
  return [`Riesgo registrado: ${risk}`, t(r?.notes)].filter(Boolean).join(' — ');
}

export function soapRows(content: ClinicalContent): LabeledValue[] {
  const s = content.soap;
  return [
    { label: 'Subjetivo', value: t(s?.subjective) },
    { label: 'Objetivo', value: t(s?.objective) },
    { label: 'Análisis', value: t(s?.assessment) },
    { label: 'Plan', value: t(s?.plan) },
  ].filter((r) => r.value);
}

export interface PsychPlanSummary {
  objectives: string;
  facts: LabeledValue[];
}

/** Datos del plan terapéutico guardados en el bloque de psicología (pueden venir vacíos). */
export function psychPlanSummary(ps: PsychologyContent | undefined): PsychPlanSummary {
  const facts = [
    { label: 'Enfoque', value: t(ps?.approach) },
    { label: 'Modalidad', value: t(ps?.modality) },
    { label: 'Frecuencia', value: t(ps?.frequency) },
    { label: 'Duración', value: t(ps?.estimatedDuration) },
    { label: 'Sesiones', value: t(ps?.sessionCount) },
  ].filter((f) => f.value);
  return { objectives: t(ps?.therapeuticObjectives), facts };
}

const DX_TYPE: Record<string, string> = { PRINCIPAL: 'Principal', RELATED: 'Relacionado', IMPRESSION: 'Impresión diagnóstica' };

export function cieRows(diagnoses: DiagnosisRow[]): Array<{ code: string; description: string; type: string }> {
  return diagnoses
    .filter((d) => t(d.cieCode))
    .map((d) => ({ code: t(d.cieCode), description: t(d.description), type: DX_TYPE[d.type] ?? '' }));
}

const PLAN_TONE: Record<string, Tone> = { PENDIENTE: 'neutral', EN_TRATAMIENTO: 'mild', TERMINADO: 'ok', CANCELADO: 'danger' };

/** Procedimientos del plan de tratamiento (misma tabla que alimenta Caja). */
export function psychPlanRows(ps: PsychologyContent | undefined): InterventionRow[] {
  return ensurePlanRows(ps?.treatmentPlan ?? [])
    .filter((r) => t(r.description) || t(r.cupsCode))
    .map((r) => ({
      technique: t(r.description) || t(r.cupsCode),
      code: t(r.description) ? t(r.cupsCode) : '',
      sessions: String(rowSessions(r)),
      frequency: t(ps?.frequency),
      status: { text: PHYSIO_PLAN_STATUSES.find((s) => s.key === r.status)?.label ?? r.status, tone: PLAN_TONE[r.status] ?? 'neutral' },
      notes: t(r.notes),
    }));
}

export function psychPlanProgress(ps: PsychologyContent | undefined) {
  return planTotals(ensurePlanRows(ps?.treatmentPlan ?? []));
}
