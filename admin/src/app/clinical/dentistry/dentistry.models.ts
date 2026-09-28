import * as z from 'zod/mini';

export type DentalService = '' | 'ODONTOLOGIA' | 'ORTODONCIA';
export type ToothSurface = 'V' | 'L' | 'M' | 'D' | 'O';
export type DentalState = 'SANO' | 'CARIADO' | 'OBTURADO' | 'AUSENTE' | 'ENDODONCIA' | 'CORONA';
export type TreatmentPriority = '' | 'ALTA' | 'MEDIA' | 'BAJA';

export interface ToothRecord {
  /** Estado del diente completo (Ausente / Endodoncia / Corona). */
  status?: DentalState | '';
  surfaces?: Partial<Record<ToothSurface, DentalState>>;
  note?: string;
}

export interface DentalDiagnosisRow {
  cieCode: string;
  rdaCode: string;
  description: string;
  tooth: string;
}

export interface TreatmentPlanRow {
  code: string;
  description: string;
  tooth: string;
  priority: TreatmentPriority;
  sessions: string;
}

export interface DentistryContent {
  service: DentalService;
  antecedents: {
    personal: string;
    family: string;
    pathological: string;
    obgyn: string;
    allergic: string;
    pharmacological: string;
    surgical: string;
    smoking: string;
    smokingDetail: string;
    alcohol: string;
    alcoholDetail: string;
    oralHabits: string;
  };
  systemsReview: Record<string, boolean>;
  systemsReviewNotes: string;
  vitals: {
    bloodPressure: string;
    heartRate: string;
    respiratoryRate: string;
    temperature: string;
    spo2: string;
  };
  extraoral: {
    symmetry: string;
    tmj: string;
    lymphNodes: string;
    skin: string;
    lips: string;
  };
  intraoral: {
    hygiene: string;
    mucosa: string;
    tongue: string;
    palate: string;
    floorOfMouth: string;
    glands: string;
    dentition: string;
    occlusion: string;
    occlusionNotes: string;
  };
  odontogram: Record<string, ToothRecord>;
  odontogramNotes: string;
  diagnoses: DentalDiagnosisRow[];
  treatmentPlan: TreatmentPlanRow[];
  closure: {
    closedAt: string;
    caseStatus: string;
    treatmentResult: string;
  };
}

export function emptyDentalDiagnosis(): DentalDiagnosisRow {
  return { cieCode: '', rdaCode: '', description: '', tooth: '' };
}

export function emptyTreatmentRow(): TreatmentPlanRow {
  return { code: '', description: '', tooth: '', priority: '', sessions: '' };
}

export function emptyDentistry(): DentistryContent {
  return {
    service: '',
    antecedents: {
      personal: '',
      family: '',
      pathological: '',
      obgyn: '',
      allergic: '',
      pharmacological: '',
      surgical: '',
      smoking: '',
      smokingDetail: '',
      alcohol: '',
      alcoholDetail: '',
      oralHabits: '',
    },
    systemsReview: {},
    systemsReviewNotes: '',
    vitals: { bloodPressure: '', heartRate: '', respiratoryRate: '', temperature: '', spo2: '' },
    extraoral: { symmetry: '', tmj: '', lymphNodes: '', skin: '', lips: '' },
    intraoral: {
      hygiene: '',
      mucosa: '',
      tongue: '',
      palate: '',
      floorOfMouth: '',
      glands: '',
      dentition: '',
      occlusion: '',
      occlusionNotes: '',
    },
    odontogram: {},
    odontogramNotes: '',
    diagnoses: [emptyDentalDiagnosis()],
    treatmentPlan: [emptyTreatmentRow()],
    closure: { closedAt: '', caseStatus: '', treatmentResult: '' },
  };
}

/** Completa un bloque guardado (posiblemente parcial o antiguo) con los valores por defecto. */
export function normalizeDentistry(raw?: Partial<DentistryContent> | null): DentistryContent {
  const base = emptyDentistry();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    antecedents: { ...base.antecedents, ...(raw.antecedents || {}) },
    systemsReview: { ...(raw.systemsReview || {}) },
    vitals: { ...base.vitals, ...(raw.vitals || {}) },
    extraoral: { ...base.extraoral, ...(raw.extraoral || {}) },
    intraoral: { ...base.intraoral, ...(raw.intraoral || {}) },
    odontogram: { ...(raw.odontogram || {}) },
    diagnoses: raw.diagnoses?.length
      ? raw.diagnoses.map((d) => ({ ...emptyDentalDiagnosis(), ...d }))
      : base.diagnoses,
    treatmentPlan: raw.treatmentPlan?.length
      ? raw.treatmentPlan.map((r) => ({ ...emptyTreatmentRow(), ...r }))
      : base.treatmentPlan,
    closure: { ...base.closure, ...(raw.closure || {}) },
  };
}

/** Numeración FDI, en el orden en que se dibuja cada hemiarcada (de derecha a izquierda del paciente). */
export const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const DECIDUOUS_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
export const DECIDUOUS_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

export const DENTAL_STATES: Array<{ key: DentalState; label: string; color: string; scope: 'surface' | 'tooth' }> = [
  { key: 'SANO', label: 'Sano', color: '#ffffff', scope: 'surface' },
  { key: 'CARIADO', label: 'Cariado', color: '#e53935', scope: 'surface' },
  { key: 'OBTURADO', label: 'Obturado', color: '#1e63d6', scope: 'surface' },
  { key: 'AUSENTE', label: 'Ausente', color: '#6b7280', scope: 'tooth' },
  { key: 'ENDODONCIA', label: 'Endodoncia', color: '#8e24aa', scope: 'tooth' },
  { key: 'CORONA', label: 'Corona', color: '#f59e0b', scope: 'tooth' },
];

export const SURFACE_LABELS: Record<ToothSurface, string> = {
  V: 'Vestibular',
  L: 'Lingual / palatino',
  M: 'Mesial',
  D: 'Distal',
  O: 'Oclusal / incisal',
};

export const DENTAL_SYSTEMS: Array<{ key: string; label: string }> = [
  { key: 'cardiovascular', label: 'Cardiovascular' },
  { key: 'respiratory', label: 'Respiratorio' },
  { key: 'gastrointestinal', label: 'Gastrointestinal' },
  { key: 'genitourinary', label: 'Genitourinario' },
  { key: 'endocrine', label: 'Endocrino' },
  { key: 'neurological', label: 'Neurológico' },
  { key: 'hematologic', label: 'Hematológico' },
  { key: 'musculoskeletal', label: 'Osteomuscular' },
  { key: 'skin', label: 'Piel y anexos' },
  { key: 'psychiatric', label: 'Mental / emocional' },
];

export function dentalStateLabel(state?: string | null) {
  return DENTAL_STATES.find((s) => s.key === state)?.label || '';
}

const optionalNumberIn = (label: string, min: number, max: number) =>
  z.string().check(
    z.refine((v) => {
      const t = v.trim();
      if (!t) return true;
      const n = Number(t.replace(',', '.'));
      return Number.isFinite(n) && n >= min && n <= max;
    }, `${label}: valor fuera de rango (${min}–${max}).`),
  );

const trimmed = (v: unknown) => String(v ?? '').trim();

/** Reglas mínimas antes de sellar la historia odontológica. */
export const dentistrySealSchema = z.object({
  motive: z
    .string()
    .check(z.refine((v) => v.trim().length >= 3, 'Datos de atención: registre el motivo de consulta.')),
  dentistry: z.object({
    service: z.enum(['ODONTOLOGIA', 'ORTODONCIA'], {
      error: 'Datos de atención: seleccione el servicio (Odontología u Ortodoncia).',
    }),
    vitals: z.object({
      bloodPressure: z
        .string()
        .check(
          z.refine(
            (v) => !v.trim() || /^\d{2,3}\s*\/\s*\d{2,3}$/.test(v.trim()),
            'Signos vitales: la PA debe tener el formato 120/80.',
          ),
        ),
      heartRate: optionalNumberIn('Frecuencia cardiaca', 30, 220),
      respiratoryRate: optionalNumberIn('Frecuencia respiratoria', 5, 60),
      temperature: optionalNumberIn('Temperatura', 34, 42),
      spo2: optionalNumberIn('Saturación de oxígeno', 50, 100),
    }),
    diagnoses: z
      .array(
        z.object({
          cieCode: z.string(),
          rdaCode: z.string(),
          description: z.string(),
          tooth: z.string(),
        }),
      )
      .check(
        z.refine(
          (rows) => rows.some((r) => trimmed(r.cieCode) && trimmed(r.description)),
          'Diagnósticos: registre al menos un diagnóstico con código CIE-10 y descripción.',
        ),
        z.refine(
          (rows) =>
            rows.every((r) => !trimmed(r.cieCode) || /^[A-Z]\d{2}[A-Z0-9.]{0,3}$/i.test(trimmed(r.cieCode))),
          'Diagnósticos: hay un código CIE-10 con formato inválido.',
        ),
      ),
    treatmentPlan: z
      .array(
        z.object({
          code: z.string(),
          description: z.string(),
          tooth: z.string(),
          priority: z.string(),
          sessions: z.union([z.string(), z.number()]),
        }),
      )
      .check(
        z.refine(
          (rows) => rows.every((r) => !trimmed(r.code) || trimmed(r.description)),
          'Plan de tratamiento: cada fila con código necesita descripción.',
        ),
        z.refine(
          (rows) =>
            rows.every((r) => {
              const s = trimmed(r.sessions);
              return !s || (/^\d+$/.test(s) && Number(s) >= 1 && Number(s) <= 99);
            }),
          'Plan de tratamiento: el N° de sesiones debe ser un entero entre 1 y 99.',
        ),
      ),
  }),
});

/** Mensajes de validación (vacío = listo para sellar). */
export function validateDentistryForSeal(motive: string, dentistry: DentistryContent): string[] {
  const result = dentistrySealSchema.safeParse({ motive: motive || '', dentistry });
  if (result.success) return [];
  return [...new Set(result.error.issues.map((i) => i.message))];
}
