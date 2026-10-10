/**
 * Historia clínica de medicina estética (HC-AES). Todo vive en
 * `content.aesthetic` de la atención; nada se guarda como perfil global.
 */

/** '' = no investigado; distinto de una ausencia confirmada ('NO'). */
export type AesAnswer = '' | 'SI' | 'NO' | 'DESCONOCIDO' | 'NA';

export const ANSWER_LABEL: Record<Exclude<AesAnswer, ''>, string> = {
  SI: 'Sí',
  NO: 'No',
  DESCONOCIDO: 'Desconocido',
  NA: 'No aplica',
};

export interface AesCondition {
  key: string;
  label: string;
  group: string;
  hint?: string;
  /** Embarazo y lactancia admiten "No aplica". */
  allowNa?: boolean;
}

export const AES_CONDITION_GROUPS = [
  'Patológicos',
  'Quirúrgicos y traumáticos',
  'Alérgicos y farmacológicos',
  'Dermatológicos',
  'Familiares',
  'Hábitos',
  'Gineco-obstétricos',
] as const;

export const AES_CONDITIONS: AesCondition[] = [
  { key: 'pathological', label: 'Enfermedades de base', group: 'Patológicos', hint: 'Diabetes, HTA, tiroides, cardiopatía…' },
  { key: 'autoimmune', label: 'Enfermedades autoinmunes', group: 'Patológicos', hint: 'Lupus, artritis reumatoide, esclerodermia…' },
  { key: 'coagulation', label: 'Trastornos de coagulación', group: 'Patológicos', hint: 'Sangrado fácil, hemofilia, trombocitopenia…' },
  { key: 'neuromuscular', label: 'Enfermedad neuromuscular', group: 'Patológicos', hint: 'Miastenia gravis, Eaton-Lambert, ELA…' },
  { key: 'herpes', label: 'Herpes labial recurrente', group: 'Patológicos' },
  { key: 'surgical', label: 'Quirúrgicos', group: 'Quirúrgicos y traumáticos', hint: 'Procedimiento, fecha, complicaciones' },
  { key: 'traumatic', label: 'Traumáticos', group: 'Quirúrgicos y traumáticos' },
  { key: 'allergies', label: 'Alergias', group: 'Alérgicos y farmacológicos', hint: 'Medicamentos, anestésicos locales, látex, alimentos…' },
  { key: 'anticoagulants', label: 'Anticoagulantes / antiagregantes', group: 'Alérgicos y farmacológicos', hint: 'Warfarina, ASA, clopidogrel, omega 3, ginkgo…' },
  { key: 'isotretinoin', label: 'Isotretinoína (últimos 6 meses)', group: 'Alérgicos y farmacológicos' },
  { key: 'dermatological', label: 'Dermatológicos', group: 'Dermatológicos', hint: 'Acné, rosácea, melasma, vitíligo, psoriasis…' },
  { key: 'keloids', label: 'Cicatrices hipertróficas o queloides', group: 'Dermatológicos' },
  { key: 'family', label: 'Familiares', group: 'Familiares' },
  { key: 'smoking', label: 'Tabaquismo', group: 'Hábitos', hint: 'Cantidad y tiempo' },
  { key: 'alcohol', label: 'Consumo de alcohol', group: 'Hábitos', hint: 'Frecuencia' },
  { key: 'sun', label: 'Exposición solar frecuente', group: 'Hábitos', hint: 'Uso de protector solar' },
  { key: 'pregnancy', label: 'Embarazo', group: 'Gineco-obstétricos', allowNa: true },
  { key: 'lactation', label: 'Lactancia', group: 'Gineco-obstétricos', allowNa: true },
];

export const AES_PROCEDURE_TYPES = [
  { key: 'TOXINA', label: 'Toxina botulínica' },
  { key: 'ACIDO_HIALURONICO', label: 'Ácido hialurónico (relleno)' },
  { key: 'RADIESSE', label: 'Radiesse® (hidroxiapatita de calcio)' },
  { key: 'BIOESTIMULADOR', label: 'Bioestimulador de colágeno' },
  { key: 'HILOS', label: 'Hilos tensores' },
  { key: 'SKINBOOSTER', label: 'Skinbooster' },
  { key: 'MESOTERAPIA', label: 'Mesoterapia' },
  { key: 'PEELING', label: 'Peeling químico' },
  { key: 'MICRONEEDLING', label: 'Microneedling' },
  { key: 'LASER', label: 'Láser' },
  { key: 'ENERGIA', label: 'Tecnología basada en energía' },
  { key: 'CIRUGIA', label: 'Cirugía estética' },
  { key: 'COMBINADO', label: 'Procedimiento combinado' },
  { key: 'OTRO', label: 'Otro' },
] as const;
export type AesProcedureType = (typeof AES_PROCEDURE_TYPES)[number]['key'];

export function procedureTypeLabel(key: string) {
  return AES_PROCEDURE_TYPES.find((t) => t.key === key)?.label || key || '—';
}

/** Plantillas de consentimiento de estética (códigos de la API) y tipos que cubren. */
export const AES_CONSENTS = [
  { code: 'AES_TOXINA', label: 'Toxina botulínica (CI-EST-01)', types: ['TOXINA'] },
  { code: 'AES_RADIESSE', label: 'Radiesse® (CI-EST-02)', types: ['RADIESSE', 'BIOESTIMULADOR'] },
  { code: 'AES_ACIDO_HIALURONICO', label: 'Ácido hialurónico reticulado (CI-EST-04)', types: ['ACIDO_HIALURONICO'] },
  { code: 'AES_SKINBOOSTER', label: 'Skinbooster (CI-EST-05)', types: ['SKINBOOSTER', 'ACIDO_HIALURONICO', 'MESOTERAPIA'] },
  { code: 'AES_MESOTERAPIA', label: 'Mesoterapia Mesohyal™ X-DNA (CI-EST-07)', types: ['MESOTERAPIA'] },
  { code: 'AES_PEELING_MELANOSTOP', label: 'Peeling Melanostop Tranex', types: ['PEELING'] },
  { code: 'AES_PEELING_EYECON', label: 'Peeling periocular Global Eyecon®', types: ['PEELING'] },
  { code: 'AES_EXILIS', label: 'Exilis Ultra 360®', types: ['ENERGIA'] },
  { code: 'AES_LASER', label: 'Procedimientos con láser', types: ['LASER'] },
  { code: 'AES_MICRONEEDLING', label: 'Microneedling', types: ['MICRONEEDLING'] },
  { code: 'AES_HILOS', label: 'Hilos tensores', types: ['HILOS'] },
  { code: 'AES_USO_IMAGEN', label: 'Uso de imagen con fines de divulgación', types: [] },
] as const;

export function aesConsentLabel(code: string) {
  return AES_CONSENTS.find((c) => c.code === code)?.label || code;
}

/** Consentimientos que respaldan un tipo de procedimiento (vacío si no hay plantilla). */
export function consentsForProcedureType(type: string) {
  return AES_CONSENTS.filter((c) => (c.types as readonly string[]).includes(type));
}

/** Las claves ya guardadas no cambian; las nuevas amplían el catálogo del mapa facial. */
export const AES_ZONES = [
  { key: 'frente', label: 'Frente' },
  { key: 'glabela', label: 'Glabela (entrecejo)' },
  { key: 'temporal', label: 'Región temporal (sienes)' },
  { key: 'cejas', label: 'Cejas' },
  { key: 'periocular_lateral', label: 'Región periocular lateral' },
  { key: 'parpado_superior', label: 'Párpados superiores' },
  { key: 'parpado_inferior', label: 'Párpados inferiores' },
  { key: 'surco_lagrimal', label: 'Surco lagrimal' },
  { key: 'periorbitaria', label: 'Región periorbitaria' },
  { key: 'mejillas', label: 'Mejillas' },
  { key: 'malar', label: 'Región malar' },
  { key: 'pomulos', label: 'Pómulos' },
  { key: 'nasogeniano', label: 'Surcos nasogenianos' },
  { key: 'nariz', label: 'Nariz' },
  { key: 'perioral', label: 'Zona perioral' },
  { key: 'labios', label: 'Labios' },
  { key: 'marioneta', label: 'Líneas de marioneta' },
  { key: 'menton', label: 'Mentón' },
  { key: 'mandibular', label: 'Línea mandibular' },
  { key: 'maseterina', label: 'Región maseterina' },
  { key: 'submentoniana', label: 'Región submentoniana' },
  { key: 'cuello', label: 'Cuello' },
  { key: 'corporal', label: 'Zona corporal' },
  { key: 'otra', label: 'Otra región' },
] as const;

export function zoneLabel(key: string) {
  return AES_ZONES.find((z) => z.key === key)?.label || key;
}

export const AES_SYSTEMS = [
  { key: 'general', label: 'General' },
  { key: 'skin', label: 'Piel y faneras' },
  { key: 'cardio', label: 'Cardiovascular' },
  { key: 'resp', label: 'Respiratorio' },
  { key: 'digestive', label: 'Digestivo' },
  { key: 'endocrine', label: 'Endocrino' },
  { key: 'hemato', label: 'Hematológico' },
  { key: 'neuro', label: 'Neurológico' },
  { key: 'musculo', label: 'Osteomuscular' },
  { key: 'genito', label: 'Genitourinario' },
  { key: 'mental', label: 'Salud mental y percepción corporal' },
] as const;

/** POS = hallazgo positivo, NEG = negativo, NE = no evaluado. */
export type SystemStatus = '' | 'POS' | 'NEG' | 'NE';
export const SYSTEM_STATUS_LABEL: Record<Exclude<SystemStatus, ''>, string> = {
  POS: 'Positivo',
  NEG: 'Negativo',
  NE: 'No evaluado',
};

/** Fitzpatrick TB. Arch Dermatol. 1988;124(6):869-71. */
export const FITZPATRICK = [
  { key: 'I', label: 'I', hint: 'Siempre se quema, nunca se broncea' },
  { key: 'II', label: 'II', hint: 'Se quema fácilmente, se broncea mínimamente' },
  { key: 'III', label: 'III', hint: 'Se quema moderadamente, se broncea gradualmente' },
  { key: 'IV', label: 'IV', hint: 'Se quema mínimamente, se broncea con facilidad' },
  { key: 'V', label: 'V', hint: 'Rara vez se quema, se broncea intensamente' },
  { key: 'VI', label: 'VI', hint: 'Nunca se quema, piel profundamente pigmentada' },
] as const;

/** Glogau RG. Semin Cutan Med Surg. 1996;15(3):134-8. */
export const GLOGAU = [
  { key: 'I', label: 'I · Sin arrugas', hint: 'Fotoenvejecimiento temprano' },
  { key: 'II', label: 'II · Arrugas en movimiento', hint: 'Fotoenvejecimiento temprano a moderado' },
  { key: 'III', label: 'III · Arrugas en reposo', hint: 'Fotoenvejecimiento avanzado' },
  { key: 'IV', label: 'IV · Solo arrugas', hint: 'Fotoenvejecimiento severo' },
] as const;

export const SKIN_TYPES = [
  { key: 'NORMAL', label: 'Normal' },
  { key: 'SECA', label: 'Seca' },
  { key: 'GRASA', label: 'Grasa' },
  { key: 'MIXTA', label: 'Mixta' },
  { key: 'SENSIBLE', label: 'Sensible' },
] as const;

/** Grado descriptivo del hallazgo (no es una escala validada). */
export const GRADES = [
  { key: '0', label: 'Sin alteración' },
  { key: '1', label: 'Leve' },
  { key: '2', label: 'Moderada' },
  { key: '3', label: 'Severa' },
] as const;

export const SKIN_PARAMS = [
  { key: 'hydration', label: 'Deshidratación' },
  { key: 'elasticity', label: 'Pérdida de elasticidad' },
  { key: 'texture', label: 'Alteración de textura' },
  { key: 'pores', label: 'Poros dilatados' },
  { key: 'pigmentation', label: 'Alteración de pigmentación' },
  { key: 'laxity', label: 'Laxitud' },
  { key: 'wrinkles', label: 'Arrugas' },
  { key: 'tissue', label: 'Pérdida de calidad tisular' },
] as const;

export const EXAM_FIELDS = [
  { key: 'generalState', label: 'Estado general' },
  { key: 'dermatological', label: 'Evaluación dermatológica' },
  { key: 'facial', label: 'Exploración facial' },
  { key: 'symmetry', label: 'Simetría' },
  { key: 'skinQuality', label: 'Calidad cutánea' },
  { key: 'wrinkles', label: 'Arrugas dinámicas y estáticas' },
  { key: 'flaccidity', label: 'Flacidez' },
  { key: 'hyperpigmentation', label: 'Hiperpigmentación' },
  { key: 'scars', label: 'Cicatrices' },
  { key: 'lesions', label: 'Lesiones visibles' },
  { key: 'volume', label: 'Alteraciones de volumen' },
] as const;

/** Hábitos de estilo de vida que influyen en la piel y la recuperación. */
export const AES_HABITS = [
  {
    key: 'water',
    label: 'Consumo de agua',
    options: [
      { key: 'MENOS_1L', label: 'Menos de 1 L/día' },
      { key: '1_2L', label: '1 a 2 L/día' },
      { key: 'MAS_2L', label: 'Más de 2 L/día' },
    ],
  },
  {
    key: 'activity',
    label: 'Actividad física',
    options: [
      { key: 'SEDENTARIO', label: 'Sedentario' },
      { key: 'MODERADO', label: 'Moderada' },
      { key: 'INTENSO', label: 'Intensa' },
    ],
  },
  {
    key: 'sleep',
    label: 'Horas de sueño',
    options: [
      { key: 'MENOS_6H', label: 'Menos de 6 h' },
      { key: '6_8H', label: '6 a 8 h' },
      { key: 'MAS_8H', label: 'Más de 8 h' },
    ],
  },
  {
    key: 'sunscreen',
    label: 'Protección solar',
    options: [
      { key: 'NUNCA', label: 'Nunca' },
      { key: 'OCASIONAL', label: 'Ocasional' },
      { key: 'DIARIO', label: 'Diaria' },
    ],
  },
  {
    key: 'stress',
    label: 'Nivel de estrés',
    options: [
      { key: 'BAJO', label: 'Bajo' },
      { key: 'MODERADO', label: 'Moderado' },
      { key: 'ALTO', label: 'Alto' },
    ],
  },
] as const;

export const CONTRAINDICATION_RESULTS = [
  { key: 'NINGUNA', label: 'Sin contraindicaciones identificadas' },
  { key: 'RELATIVAS', label: 'Contraindicaciones relativas' },
  { key: 'ABSOLUTAS', label: 'Contraindicaciones absolutas' },
] as const;

export interface AesPreviousTreatment {
  id: string;
  type: string;
  date: string;
  zone: string;
  product: string;
  complications: string;
  notes: string;
}

export interface AesMedication {
  id: string;
  name: string;
  concentration: string;
  route: string;
  frequency: string;
  notes: string;
}

export interface AestheticContent {
  version: 1;
  consult: {
    concerns: string;
    zones: string[];
    goals: string;
    expectations: string;
    requestedTreatments: string[];
    evolutionTime: string;
    symptoms: string;
    previousResults: string;
  };
  history: Record<string, { answer: AesAnswer; detail: string }>;
  previousTreatmentsAnswer: AesAnswer;
  previousTreatments: AesPreviousTreatment[];
  medicationsAnswer: AesAnswer;
  medications: AesMedication[];
  /** Clave de AES_HABITS → opción elegida; '' = no preguntado. */
  habits: Record<string, string>;
  habitsNotes: string;
  systems: Record<string, { status: SystemStatus; detail: string }>;
  vitals: {
    bloodPressure: string;
    heartRate: string;
    respiratoryRate: string;
    temperature: string;
    spo2: string;
    weightKg: string;
    heightCm: string;
  };
  exam: Record<string, string>;
  assessment: {
    fitzpatrick: string;
    skinType: string;
    glogau: string;
    params: Record<string, string>;
    proportions: string;
    regions: string;
    notes: string;
  };
  diagnosis: {
    differentials: string;
    findings: string;
    contraindications: string;
    contraindicationsDetail: string;
    justification: string;
  };
  plan: {
    procedures: string;
    objectives: string;
    alternatives: string;
    risks: string;
    recommendations: string;
    followUp: string;
    followUpDate: string;
  };
}

export function emptyAesthetic(): AestheticContent {
  return {
    version: 1,
    consult: {
      concerns: '',
      zones: [],
      goals: '',
      expectations: '',
      requestedTreatments: [],
      evolutionTime: '',
      symptoms: '',
      previousResults: '',
    },
    history: {},
    previousTreatmentsAnswer: '',
    previousTreatments: [],
    medicationsAnswer: '',
    medications: [],
    habits: {},
    habitsNotes: '',
    systems: {},
    vitals: {
      bloodPressure: '',
      heartRate: '',
      respiratoryRate: '',
      temperature: '',
      spo2: '',
      weightKg: '',
      heightCm: '',
    },
    exam: {},
    assessment: {
      fitzpatrick: '',
      skinType: '',
      glogau: '',
      params: {},
      proportions: '',
      regions: '',
      notes: '',
    },
    diagnosis: {
      differentials: '',
      findings: '',
      contraindications: '',
      contraindicationsDetail: '',
      justification: '',
    },
    plan: {
      procedures: '',
      objectives: '',
      alternatives: '',
      risks: '',
      recommendations: '',
      followUp: '',
      followUpDate: '',
    },
  };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Completa con valores por defecto sin perder lo guardado (incluidas claves futuras). */
export function normalizeAesthetic(raw?: Partial<AestheticContent> | null): AestheticContent {
  const base = emptyAesthetic();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    version: 1,
    consult: {
      ...base.consult,
      ...(raw.consult || {}),
      zones: arr<string>(raw.consult?.zones),
      requestedTreatments: arr<string>(raw.consult?.requestedTreatments),
    },
    history: { ...(raw.history || {}) },
    previousTreatmentsAnswer: (raw.previousTreatmentsAnswer || '') as AesAnswer,
    previousTreatments: arr<AesPreviousTreatment>(raw.previousTreatments).map((t) => ({
      id: str(t.id) || newId(),
      type: str(t.type),
      date: str(t.date),
      zone: str(t.zone),
      product: str(t.product),
      complications: str(t.complications),
      notes: str(t.notes),
    })),
    medicationsAnswer: (raw.medicationsAnswer || '') as AesAnswer,
    medications: arr<AesMedication>(raw.medications).map((m) => ({
      id: str(m.id) || newId(),
      name: str(m.name),
      concentration: str(m.concentration),
      route: str(m.route),
      frequency: str(m.frequency),
      notes: str(m.notes),
    })),
    habits: { ...(raw.habits || {}) },
    habitsNotes: str(raw.habitsNotes),
    systems: { ...(raw.systems || {}) },
    vitals: { ...base.vitals, ...(raw.vitals || {}) },
    exam: { ...(raw.exam || {}) },
    assessment: {
      ...base.assessment,
      ...(raw.assessment || {}),
      params: { ...(raw.assessment?.params || {}) },
    },
    diagnosis: { ...base.diagnosis, ...(raw.diagnosis || {}) },
    plan: { ...base.plan, ...(raw.plan || {}) },
  };
}

/** Texto plano de antecedentes para los campos generales (RDA, alertas, resumen). */
export function aestheticAntecedentsText(a: AestheticContent): string {
  const lines: string[] = [];
  for (const c of AES_CONDITIONS) {
    const row = a.history[c.key];
    if (!row?.answer) continue;
    const label = ANSWER_LABEL[row.answer as Exclude<AesAnswer, ''>];
    lines.push(`${c.label}: ${label}${row.detail?.trim() ? ` — ${row.detail.trim()}` : ''}`);
  }
  if (a.previousTreatmentsAnswer === 'NO') lines.push('Tratamientos estéticos previos: No');
  for (const t of a.previousTreatments) {
    const parts = [procedureTypeLabel(t.type), t.zone, t.date, t.product, t.complications && `complicaciones: ${t.complications}`];
    lines.push(`Estético previo: ${parts.filter((p) => p && String(p).trim()).join(' · ')}`);
  }
  const habits = AES_HABITS.map((h) => {
    const opt = h.options.find((o) => o.key === a.habits[h.key]);
    return opt ? `${h.label}: ${opt.label}` : '';
  }).filter(Boolean);
  if (habits.length) lines.push(`Hábitos: ${habits.join(' · ')}`);
  if (a.habitsNotes.trim()) lines.push(`Otros hábitos: ${a.habitsNotes.trim()}`);
  return lines.join('\n');
}

export function aestheticAllergyList(a: AestheticContent): string[] {
  const row = a.history['allergies'];
  if (row?.answer !== 'SI') return [];
  return (row.detail || 'Alergia referida (sin detalle)')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function aestheticMedicationList(a: AestheticContent): string[] {
  return a.medications
    .filter((m) => m.name.trim())
    .map((m) => [m.name, m.concentration, m.route, m.frequency].map((s) => s.trim()).filter(Boolean).join(' '));
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function bmi(v: AestheticContent['vitals']): string {
  const w = parseFloat(String(v.weightKg).replace(',', '.'));
  const h = parseFloat(String(v.heightCm).replace(',', '.')) / 100;
  if (!w || !h) return '';
  return (w / (h * h)).toFixed(1);
}
