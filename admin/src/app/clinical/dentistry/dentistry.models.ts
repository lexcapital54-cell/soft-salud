import * as z from 'zod/mini';

/** Servicio de la atención; «ORTODONCIA» activa el módulo de ortodoncia. «ODONTOLOGIA» es el valor antiguo de general. */
export type DentalService =
  | ''
  | 'GENERAL'
  | 'REHABILITACION'
  | 'ENDODONCIA'
  | 'PERIODONCIA'
  | 'CIRUGIA_ORAL'
  | 'ORTODONCIA'
  | 'ODONTOLOGIA';

export const DENTAL_SERVICES: Array<{ key: Exclude<DentalService, '' | 'ODONTOLOGIA'>; label: string }> = [
  { key: 'GENERAL', label: 'Odontología general' },
  { key: 'REHABILITACION', label: 'Rehabilitación oral' },
  { key: 'ENDODONCIA', label: 'Endodoncia' },
  { key: 'PERIODONCIA', label: 'Periodoncia' },
  { key: 'CIRUGIA_ORAL', label: 'Cirugía oral' },
  { key: 'ORTODONCIA', label: 'Ortodoncia' },
];

export function dentalServiceLabel(service?: string | null) {
  if (service === 'ODONTOLOGIA') return 'Odontología general';
  return DENTAL_SERVICES.find((s) => s.key === service)?.label || '';
}

export type ToothSurface = 'V' | 'L' | 'M' | 'D' | 'O';

/** Hallazgos que se pintan por superficie. */
export type SurfaceState = 'CARIES' | 'RESTAURACION' | 'SELLANTE' | 'FRACTURA';
/** Condiciones del diente completo (pueden combinarse, salvo Ausente). */
export type ToothCondition =
  | 'AUSENTE'
  | 'EXTRACCION_INDICADA'
  | 'ENDODONCIA'
  | 'CORONA'
  | 'PROTESIS'
  | 'IMPLANTE'
  | 'INCLUIDO'
  | 'ERUPCION'
  | 'SUPERNUMERARIO'
  | 'TEMPORAL'
  | 'PROTESIS_REMOVIBLE';
/** Marcas complementarias (periodontales, trauma y aparatología de ortodoncia). */
export type ToothMark =
  | 'MOVILIDAD'
  | 'FISTULA'
  | 'LESION'
  | 'TRAUMA'
  | 'BRACKET'
  | 'BANDA'
  | 'SEPARADOR'
  | 'OTRO'
  | 'LIGADURA_ELASTICA'
  | 'LIGADURA_METALICA'
  | 'GANCHO'
  | 'CADENA'
  | 'RESORTE'
  | 'BOTON'
  | 'TUBO'
  | 'TAD'
  | 'PROTRUSION'
  | 'RETRUSION'
  | 'EXPANSION'
  | 'CONTRACCION'
  | 'ROTACION'
  | 'INTRUSION'
  | 'EXTRUSION'
  | 'MORDIDA_CRUZADA'
  | 'MORDIDA_ABIERTA'
  | 'SOBREMORDIDA'
  | 'LINEA_MEDIA'
  | 'APINAMIENTO'
  | 'DIASTEMA'
  | 'AUSENCIA_ESPACIO'
  | 'ESPACIO';

export type DentalTool = SurfaceState | ToothCondition | ToothMark | 'SANO';

export interface ToothRecord {
  conditions?: ToothCondition[];
  surfaces?: Partial<Record<ToothSurface, SurfaceState>>;
  marks?: ToothMark[];
  note?: string;
  /** Formato v1 (un solo estado del diente); se migra a `conditions` al cargar. */
  status?: string;
}

export type TreatmentStatus = 'PENDIENTE' | 'EN_TRATAMIENTO' | 'TERMINADO' | 'CANCELADO';

export const TREATMENT_STATUSES: Array<{ key: TreatmentStatus; label: string; color: string }> = [
  { key: 'PENDIENTE', label: 'Pendiente', color: '#f5b301' },
  { key: 'EN_TRATAMIENTO', label: 'En tratamiento', color: '#1e63d6' },
  { key: 'TERMINADO', label: 'Terminado', color: '#16a34a' },
  { key: 'CANCELADO', label: 'Cancelado', color: '#dc2626' },
];

export interface DentalDiagnosisRow {
  cieCode: string;
  rdaCode: string;
  description: string;
  tooth: string;
}

export interface TreatmentPlanRow {
  tooth: string;
  diagnosis: string;
  code: string;
  description: string;
  professional: string;
  value: string;
  status: TreatmentStatus;
  /** Campos v1, se conservan para historias antiguas. */
  priority?: string;
  sessions?: string;
}

export interface MedicationRow {
  name: string;
  dose: string;
  frequency: string;
  reason: string;
}

export interface PrescriptionRow {
  medication: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export type OrderType = '' | 'RADIOGRAFIA' | 'LABORATORIO' | 'INTERCONSULTA' | 'REMISION' | 'OTRO';

export const ORDER_TYPES: Array<{ key: Exclude<OrderType, ''>; label: string }> = [
  { key: 'RADIOGRAFIA', label: 'Radiografía / imagen' },
  { key: 'LABORATORIO', label: 'Laboratorio' },
  { key: 'INTERCONSULTA', label: 'Interconsulta' },
  { key: 'REMISION', label: 'Remisión' },
  { key: 'OTRO', label: 'Otro' },
];

export interface OrderRow {
  type: OrderType;
  detail: string;
  code: string;
  notes: string;
}

export interface ImagingRow {
  type: string;
  date: string;
  attachmentId: string;
  fileName: string;
  diagnosis: string;
  findings: string;
}

export const IMAGING_TYPES = [
  'Periapical',
  'Panorámica',
  'Cefálica lateral',
  'Cefálica frontal',
  'Oclusal',
  'Aleta de mordida',
  'CBCT',
  'Fotografías',
  'Otros',
];

export interface CephPoint {
  x: number;
  y: number;
}

/** Trazado cefalométrico sobre una radiografía lateral (coordenadas en píxeles de la imagen original). */
export interface CephTracing {
  attachmentId: string;
  fileName: string;
  points: Partial<Record<string, CephPoint>>;
  tracedAt: string;
}

export function emptyCephTracing(): CephTracing {
  return { attachmentId: '', fileName: '', points: {}, tracedAt: '' };
}

export interface PhotoSlotValue {
  attachmentId: string;
  fileName: string;
  takenAt: string;
}

export const PHOTO_SLOTS: Array<{ key: string; label: string; group: 'Extraoral' | 'Intraoral' }> = [
  { key: 'extraFrontal', label: 'Frontal', group: 'Extraoral' },
  { key: 'extraProfileRight', label: 'Perfil derecho', group: 'Extraoral' },
  { key: 'extraProfileLeft', label: 'Perfil izquierdo', group: 'Extraoral' },
  { key: 'extraSmile', label: 'Sonrisa', group: 'Extraoral' },
  { key: 'intraFrontal', label: 'Frontal', group: 'Intraoral' },
  { key: 'intraRight', label: 'Lateral derecha', group: 'Intraoral' },
  { key: 'intraLeft', label: 'Lateral izquierda', group: 'Intraoral' },
  { key: 'intraOcclusalUpper', label: 'Oclusal superior', group: 'Intraoral' },
  { key: 'intraOcclusalLower', label: 'Oclusal inferior', group: 'Intraoral' },
];

export interface DentistryContent {
  service: DentalService;
  /** Ortodoncia junto con el servicio principal (consulta combinada). */
  includeOrtho: boolean;
  currentIllness: string;
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
  medicalConditions: Record<string, boolean>;
  allergies: Record<string, boolean>;
  medications: {
    none: boolean;
    rows: MedicationRow[];
    groups: Record<string, boolean>;
  };
  dentalHistory: {
    lastVisit: string;
    visitFrequency: string;
    lastCleaning: string;
    lastXray: string;
    treatments: Record<string, boolean>;
    symptoms: Record<string, boolean>;
    anesthesiaReaction: '' | 'SI' | 'NO' | 'NO_SABE';
    anesthesiaReactionDetail: string;
    notes: string;
  };
  habits: Record<string, boolean>;
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
    profile: string;
    facialThirds: string;
    lymphNodes: string;
    tmj: string;
    mouthOpening: string;
    muscularPain: string;
    clicking: string;
    mandibularDeviation: string;
    lips: string;
    breathing: string;
    skin: string;
    notes: string;
  };
  intraoral: {
    hygiene: string;
    lips: string;
    mucosa: string;
    palate: string;
    tongue: string;
    floorOfMouth: string;
    frenula: string;
    tonsils: string;
    otherLesions: string;
    glands: string;
    dentition: string;
    occlusion: string;
    occlusionNotes: string;
  };
  periodontal: {
    gingiva: string;
    bleeding: string;
    recessions: string;
    mobility: string;
    probingDepth: string;
    plaque: string;
    calculus: string;
    furcations: string;
    indices: string;
    notes: string;
  };
  odontogram: Record<string, ToothRecord>;
  orthoArches: { upper: boolean; lower: boolean };
  /** Odontograma de ortodoncia: tipo de brackets, aparatos del caso y fases del plan cumplidas. */
  orthoChart: { bracketType: string; appliances: string[]; planPhases: string[] };
  odontogramNotes: string;
  orthodontics: {
    facial: {
      facialType: string;
      profile: string;
      symmetry: string;
      midline: string;
      lowerThird: string;
      lipCompetence: string;
      smile: string;
      dentalExposure: string;
      buccalCorridor: string;
    };
    intraoral: {
      molarRight: string;
      molarLeft: string;
      canineRight: string;
      canineLeft: string;
      overjet: string;
      overbite: string;
      openBite: string;
      crossBite: string;
      deepBite: string;
      crowding: string;
      diastemas: string;
      dentalMidline: string;
      curveOfSpee: string;
    };
    habits: Record<string, boolean>;
    cephalometry: {
      sna: string;
      snb: string;
      anb: string;
      wits: string;
      fma: string;
      impa: string;
      upperIncisor: string;
      skeletalClass: string;
      growthPattern: string;
    };
    models: {
      upperDiscrepancy: string;
      lowerDiscrepancy: string;
      bolton: string;
      archForm: string;
    };
    cephTracing: CephTracing;
    measurements: string;
    diagnosis: string;
    phase: string;
    objectives: string;
    extractions: string;
    appliance: string;
    estimatedDuration: string;
    retention: string;
    notes: string;
  };
  photos: Record<string, PhotoSlotValue>;
  imaging: ImagingRow[];
  diagnoses: DentalDiagnosisRow[];
  treatmentPlan: TreatmentPlanRow[];
  prescriptions: PrescriptionRow[];
  orders: OrderRow[];
  requiredConsents: string[];
  closure: {
    closedAt: string;
    caseStatus: string;
    treatmentResult: string;
  };
}

export type CheckItem = { key: string; label: string };

export const MEDICAL_CONDITIONS: CheckItem[] = [
  { key: 'hypertension', label: 'Hipertensión' },
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'cardiovascular', label: 'Enfermedades cardiovasculares' },
  { key: 'respiratory', label: 'Enfermedades respiratorias' },
  { key: 'renal', label: 'Enfermedades renales' },
  { key: 'hepatic', label: 'Enfermedades hepáticas' },
  { key: 'infectious', label: 'Enfermedades infecciosas' },
  { key: 'coagulation', label: 'Alteraciones de coagulación' },
  { key: 'epilepsy', label: 'Epilepsia' },
  { key: 'osteoporosis', label: 'Osteoporosis' },
  { key: 'pregnancy', label: 'Embarazo' },
  { key: 'other', label: 'Otras condiciones' },
];

export const ALLERGY_ITEMS: CheckItem[] = [
  { key: 'none', label: 'No refiere alergias' },
  { key: 'medications', label: 'Medicamentos' },
  { key: 'food', label: 'Alimentos' },
  { key: 'latex', label: 'Látex' },
  { key: 'anesthetics', label: 'Anestésicos' },
  { key: 'other', label: 'Otras' },
  { key: 'unknown', label: 'Desconoce' },
];

export const MEDICATION_GROUPS: CheckItem[] = [
  { key: 'anticoagulants', label: 'Anticoagulantes' },
  { key: 'antiplatelets', label: 'Antiagregantes' },
  { key: 'bisphosphonates', label: 'Bisfosfonatos' },
  { key: 'corticosteroids', label: 'Corticoides' },
  { key: 'antibiotics', label: 'Antibióticos' },
  { key: 'other', label: 'Otros' },
];

export const DENTAL_TREATMENTS: CheckItem[] = [
  { key: 'orthodontics', label: 'Ortodoncia previa' },
  { key: 'endodontics', label: 'Endodoncia' },
  { key: 'extractions', label: 'Extracciones' },
  { key: 'implants', label: 'Implantes' },
  { key: 'prosthesis', label: 'Prótesis' },
  { key: 'surgeries', label: 'Cirugías orales' },
  { key: 'trauma', label: 'Traumatismos dentales' },
];

export const DENTAL_SYMPTOMS: CheckItem[] = [
  { key: 'sensitivity', label: 'Sensibilidad dental' },
  { key: 'bleeding', label: 'Sangrado gingival' },
  { key: 'pain', label: 'Dolor dental' },
  { key: 'halitosis', label: 'Halitosis' },
];

export const HABIT_ITEMS: CheckItem[] = [
  { key: 'bruxism', label: 'Bruxismo' },
  { key: 'onychophagia', label: 'Onicofagia' },
  { key: 'mouthBreathing', label: 'Respiración oral' },
  { key: 'thumbSucking', label: 'Succión digital' },
  { key: 'pacifier', label: 'Uso prolongado de chupete' },
  { key: 'tongueThrust', label: 'Interposición lingual' },
  { key: 'atypicalSwallowing', label: 'Deglución atípica' },
  { key: 'lipBiting', label: 'Mordisqueo de labios' },
  { key: 'objectBiting', label: 'Mordisqueo de objetos' },
  { key: 'other', label: 'Otros' },
];

export const ORTHO_HABITS: CheckItem[] = [
  { key: 'mouthBreathing', label: 'Respiración oral' },
  { key: 'atypicalSwallowing', label: 'Deglución atípica' },
  { key: 'tongueThrust', label: 'Interposición lingual' },
  { key: 'thumbSucking', label: 'Succión digital' },
  { key: 'bruxism', label: 'Bruxismo' },
];

/** Consentimientos que se pueden exigir en la atención (código de plantilla → etiqueta). */
export const DENTAL_CONSENT_OPTIONS: CheckItem[] = [
  { key: 'ODO_INFORMED', label: 'Tratamiento odontológico general' },
  { key: 'ODO_EXTRACTION', label: 'Extracción dental' },
  { key: 'ODO_ORAL_SURGERY', label: 'Cirugía oral' },
  { key: 'ODO_ENDODONTICS', label: 'Endodoncia' },
  { key: 'ODO_PERIODONTICS', label: 'Periodoncia' },
  { key: 'ODO_ORTHODONTICS', label: 'Ortodoncia' },
  { key: 'ODO_PHOTOS', label: 'Fotografías clínicas' },
  { key: 'ODO_IMAGE_USE', label: 'Uso de imágenes con autorización' },
  { key: 'ODO_ANESTHESIA', label: 'Anestesia local' },
  { key: 'ODO_AESTHETIC', label: 'Procedimientos estéticos' },
  { key: 'ORT_RETENTION', label: 'Fase de retención ortodóncica' },
  { key: 'ODO_TELEHEALTH', label: 'Atención virtual' },
  { key: 'HABEAS_DATA', label: 'Tratamiento de datos (Habeas Data)' },
];

/** Deben coincidir con las plantillas sembradas para cada especialidad (seedConsents). */
export const ORTHO_CONSENT_KEYS = new Set([
  'ODO_ORTHODONTICS',
  'ORT_RETENTION',
  'ODO_EXTRACTION',
  'ODO_PHOTOS',
  'ODO_IMAGE_USE',
  'ODO_TELEHEALTH',
  'HABEAS_DATA',
]);
export const DENTAL_ONLY_CONSENT_KEYS = new Set(
  DENTAL_CONSENT_OPTIONS.map((c) => c.key).filter((k) => k !== 'ODO_ORTHODONTICS' && k !== 'ORT_RETENTION'),
);

export const CLASS_OPTIONS = ['Clase I', 'Clase II', 'Clase III', 'No evaluable'];

export function emptyDentalDiagnosis(): DentalDiagnosisRow {
  return { cieCode: '', rdaCode: '', description: '', tooth: '' };
}

export function emptyTreatmentRow(): TreatmentPlanRow {
  return {
    tooth: '',
    diagnosis: '',
    code: '',
    description: '',
    professional: '',
    value: '',
    status: 'PENDIENTE',
  };
}

export function emptyMedicationRow(): MedicationRow {
  return { name: '', dose: '', frequency: '', reason: '' };
}

export function emptyPrescriptionRow(): PrescriptionRow {
  return { medication: '', dose: '', route: '', frequency: '', duration: '', instructions: '' };
}

export function emptyOrderRow(): OrderRow {
  return { type: '', detail: '', code: '', notes: '' };
}

export function emptyImagingRow(): ImagingRow {
  return { type: '', date: '', attachmentId: '', fileName: '', diagnosis: '', findings: '' };
}

export function emptyDentistry(): DentistryContent {
  return {
    service: '',
    includeOrtho: false,
    currentIllness: '',
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
    medicalConditions: {},
    allergies: {},
    medications: { none: false, rows: [], groups: {} },
    dentalHistory: {
      lastVisit: '',
      visitFrequency: '',
      lastCleaning: '',
      lastXray: '',
      treatments: {},
      symptoms: {},
      anesthesiaReaction: '',
      anesthesiaReactionDetail: '',
      notes: '',
    },
    habits: {},
    systemsReview: {},
    systemsReviewNotes: '',
    vitals: { bloodPressure: '', heartRate: '', respiratoryRate: '', temperature: '', spo2: '' },
    extraoral: {
      symmetry: '',
      profile: '',
      facialThirds: '',
      lymphNodes: '',
      tmj: '',
      mouthOpening: '',
      muscularPain: '',
      clicking: '',
      mandibularDeviation: '',
      lips: '',
      breathing: '',
      skin: '',
      notes: '',
    },
    intraoral: {
      hygiene: '',
      lips: '',
      mucosa: '',
      palate: '',
      tongue: '',
      floorOfMouth: '',
      frenula: '',
      tonsils: '',
      otherLesions: '',
      glands: '',
      dentition: '',
      occlusion: '',
      occlusionNotes: '',
    },
    periodontal: {
      gingiva: '',
      bleeding: '',
      recessions: '',
      mobility: '',
      probingDepth: '',
      plaque: '',
      calculus: '',
      furcations: '',
      indices: '',
      notes: '',
    },
    odontogram: {},
    orthoArches: { upper: false, lower: false },
    orthoChart: { bracketType: '', appliances: [], planPhases: [] },
    odontogramNotes: '',
    orthodontics: {
      facial: {
        facialType: '',
        profile: '',
        symmetry: '',
        midline: '',
        lowerThird: '',
        lipCompetence: '',
        smile: '',
        dentalExposure: '',
        buccalCorridor: '',
      },
      intraoral: {
        molarRight: '',
        molarLeft: '',
        canineRight: '',
        canineLeft: '',
        overjet: '',
        overbite: '',
        openBite: '',
        crossBite: '',
        deepBite: '',
        crowding: '',
        diastemas: '',
        dentalMidline: '',
        curveOfSpee: '',
      },
      habits: {},
      cephalometry: {
        sna: '',
        snb: '',
        anb: '',
        wits: '',
        fma: '',
        impa: '',
        upperIncisor: '',
        skeletalClass: '',
        growthPattern: '',
      },
      models: { upperDiscrepancy: '', lowerDiscrepancy: '', bolton: '', archForm: '' },
      cephTracing: emptyCephTracing(),
      measurements: '',
      diagnosis: '',
      phase: '',
      objectives: '',
      extractions: '',
      appliance: '',
      estimatedDuration: '',
      retention: '',
      notes: '',
    },
    photos: {},
    imaging: [],
    diagnoses: [emptyDentalDiagnosis()],
    treatmentPlan: [emptyTreatmentRow()],
    prescriptions: [],
    orders: [],
    requiredConsents: [],
    closure: { closedAt: '', caseStatus: '', treatmentResult: '' },
  };
}

const LEGACY_SURFACE: Record<string, SurfaceState> = {
  CARIADO: 'CARIES',
  OBTURADO: 'RESTAURACION',
  CARIES: 'CARIES',
  RESTAURACION: 'RESTAURACION',
  SELLANTE: 'SELLANTE',
  FRACTURA: 'FRACTURA',
};

const CONDITION_KEYS: ToothCondition[] = [
  'AUSENTE',
  'EXTRACCION_INDICADA',
  'ENDODONCIA',
  'CORONA',
  'PROTESIS',
  'IMPLANTE',
  'INCLUIDO',
  'ERUPCION',
  'SUPERNUMERARIO',
  'TEMPORAL',
  'PROTESIS_REMOVIBLE',
];

function normalizeTooth(raw: ToothRecord): ToothRecord {
  const conditions = new Set<ToothCondition>(
    (raw.conditions || []).filter((c) => CONDITION_KEYS.includes(c)),
  );
  if (raw.status && CONDITION_KEYS.includes(raw.status as ToothCondition)) {
    conditions.add(raw.status as ToothCondition);
  }
  const surfaces: Partial<Record<ToothSurface, SurfaceState>> = {};
  for (const [surface, state] of Object.entries(raw.surfaces || {})) {
    const mapped = state ? LEGACY_SURFACE[state] : undefined;
    if (mapped) surfaces[surface as ToothSurface] = mapped;
  }
  const rec: ToothRecord = {};
  if (conditions.size) rec.conditions = [...conditions];
  if (Object.keys(surfaces).length) rec.surfaces = surfaces;
  if (raw.marks?.length) rec.marks = [...raw.marks];
  if ((raw.note || '').trim()) rec.note = raw.note;
  return rec;
}

/** Completa un bloque guardado (posiblemente parcial o de la versión anterior) con los valores por defecto. */
export function normalizeDentistry(raw?: Partial<DentistryContent> | null): DentistryContent {
  const base = emptyDentistry();
  if (!raw) return base;
  const odontogram: Record<string, ToothRecord> = {};
  for (const [tooth, rec] of Object.entries(raw.odontogram || {})) {
    const normalized = normalizeTooth(rec || {});
    if (Object.keys(normalized).length) odontogram[tooth] = normalized;
  }
  const ortho = (raw.orthodontics || {}) as Partial<DentistryContent['orthodontics']>;
  // Los hábitos se registran una sola vez en Antecedentes: se traen los marcados en Ortodoncia y el bruxismo de Síntomas.
  const habits: Record<string, boolean> = { ...(raw.habits || {}), ...(ortho.habits || {}) };
  const symptoms = { ...(raw.dentalHistory?.symptoms || {}) };
  if (symptoms['bruxism']) habits['bruxism'] = true;
  delete symptoms['bruxism'];
  return {
    ...base,
    ...raw,
    service: raw.service === 'ODONTOLOGIA' ? 'GENERAL' : raw.service || '',
    includeOrtho: raw.service !== 'ORTODONCIA' && !!raw.includeOrtho,
    antecedents: { ...base.antecedents, ...(raw.antecedents || {}) },
    medicalConditions: { ...(raw.medicalConditions || {}) },
    allergies: { ...(raw.allergies || {}) },
    medications: {
      none: !!raw.medications?.none,
      rows: (raw.medications?.rows || []).map((r) => ({ ...emptyMedicationRow(), ...r })),
      groups: { ...(raw.medications?.groups || {}) },
    },
    dentalHistory: {
      ...base.dentalHistory,
      ...(raw.dentalHistory || {}),
      treatments: { ...(raw.dentalHistory?.treatments || {}) },
      symptoms,
    },
    habits,
    systemsReview: { ...(raw.systemsReview || {}) },
    vitals: { ...base.vitals, ...(raw.vitals || {}) },
    extraoral: { ...base.extraoral, ...(raw.extraoral || {}) },
    intraoral: { ...base.intraoral, ...(raw.intraoral || {}) },
    periodontal: { ...base.periodontal, ...(raw.periodontal || {}) },
    odontogram,
    orthoArches: { ...base.orthoArches, ...(raw.orthoArches || {}) },
    orthoChart: {
      bracketType: raw.orthoChart?.bracketType || '',
      appliances: [...(raw.orthoChart?.appliances || [])],
      planPhases: [...(raw.orthoChart?.planPhases || [])],
    },
    orthodontics: {
      ...base.orthodontics,
      ...ortho,
      facial: { ...base.orthodontics.facial, ...(ortho.facial || {}) },
      intraoral: { ...base.orthodontics.intraoral, ...(ortho.intraoral || {}) },
      cephalometry: { ...base.orthodontics.cephalometry, ...(ortho.cephalometry || {}) },
      models: { ...base.orthodontics.models, ...(ortho.models || {}) },
      cephTracing: {
        ...emptyCephTracing(),
        ...(ortho.cephTracing || {}),
        points: { ...(ortho.cephTracing?.points || {}) },
      },
      habits: {},
    },
    photos: { ...(raw.photos || {}) },
    imaging: (raw.imaging || []).map((r) => ({ ...emptyImagingRow(), ...r })),
    diagnoses: raw.diagnoses?.length
      ? raw.diagnoses.map((d) => ({ ...emptyDentalDiagnosis(), ...d }))
      : base.diagnoses,
    treatmentPlan: raw.treatmentPlan?.length
      ? raw.treatmentPlan.map((r) => ({
          ...emptyTreatmentRow(),
          ...r,
          status: (r.status as TreatmentStatus) || 'PENDIENTE',
        }))
      : base.treatmentPlan,
    prescriptions: (raw.prescriptions || []).map((r) => ({ ...emptyPrescriptionRow(), ...r })),
    orders: (raw.orders || []).map((r) => ({ ...emptyOrderRow(), ...r })),
    requiredConsents: [...(raw.requiredConsents || [])],
    closure: { ...base.closure, ...(raw.closure || {}) },
  };
}

/** El módulo de ortodoncia se muestra con el servicio Ortodoncia o si ya tiene datos. */
export function hasOrthodonticData(d: DentistryContent) {
  const o = d.orthodontics;
  return (
    Object.values(o.facial).some((v) => v.trim()) ||
    Object.values(o.intraoral).some((v) => v.trim()) ||
    Object.values(o.habits).some(Boolean) ||
    hasOrthoSpecialistData(d) ||
    [o.measurements, o.diagnosis, o.appliance, o.estimatedDuration, o.notes].some((v) => v.trim())
  );
}

/** Cefalometría, análisis de modelos y planificación: bloques propios del consultorio de ortodoncia. */
export function hasOrthoSpecialistData(d: DentistryContent) {
  const o = d.orthodontics;
  return (
    Object.values(o.cephalometry).some((v) => v.trim()) ||
    Object.keys(o.cephTracing.points).length > 0 ||
    Object.values(o.models).some((v) => v.trim()) ||
    [o.phase, o.objectives, o.extractions, o.retention].some((v) => v.trim())
  );
}

/** Numeración FDI, en el orden en que se dibuja cada hemiarcada (de derecha a izquierda del paciente). */
export const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const DECIDUOUS_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
export const DECIDUOUS_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

export interface DentalToolDef {
  key: DentalTool;
  label: string;
  color: string;
  scope: 'surface' | 'condition' | 'mark' | 'clear';
}

export const SURFACE_TOOLS: DentalToolDef[] = [
  { key: 'CARIES', label: 'Caries', color: '#e53935', scope: 'surface' },
  { key: 'RESTAURACION', label: 'Obturación', color: '#1e63d6', scope: 'surface' },
  { key: 'SELLANTE', label: 'Sellante', color: '#14b8a6', scope: 'surface' },
  { key: 'FRACTURA', label: 'Fractura', color: '#f97316', scope: 'surface' },
];

export const CONDITION_TOOLS: DentalToolDef[] = [
  { key: 'ENDODONCIA', label: 'Endodoncia', color: '#f5b301', scope: 'condition' },
  { key: 'CORONA', label: 'Corona', color: '#8e24aa', scope: 'condition' },
  { key: 'PROTESIS', label: 'Prótesis', color: '#16a34a', scope: 'condition' },
  { key: 'IMPLANTE', label: 'Implante', color: '#475569', scope: 'condition' },
  { key: 'AUSENTE', label: 'Diente ausente', color: '#1f2937', scope: 'condition' },
  { key: 'EXTRACCION_INDICADA', label: 'Extracción indicada', color: '#dc2626', scope: 'condition' },
  { key: 'INCLUIDO', label: 'Diente incluido', color: '#64748b', scope: 'condition' },
];

export const MARK_TOOLS: DentalToolDef[] = [
  { key: 'MOVILIDAD', label: 'Movilidad', color: '#0b5563', scope: 'mark' },
  { key: 'FISTULA', label: 'Fístula', color: '#db2777', scope: 'mark' },
  { key: 'LESION', label: 'Lesión periodontal', color: '#e11d48', scope: 'mark' },
  { key: 'TRAUMA', label: 'Trauma', color: '#1e3a8a', scope: 'mark' },
  { key: 'BRACKET', label: 'Brackets', color: '#1d4ed8', scope: 'mark' },
  { key: 'BANDA', label: 'Bandas', color: '#1d4ed8', scope: 'mark' },
  { key: 'SEPARADOR', label: 'Separador', color: '#7c3aed', scope: 'mark' },
  { key: 'OTRO', label: 'Otra observación', color: '#0f172a', scope: 'mark' },
];

/** Piezas dentales propias del odontograma de ortodoncia. */
export const ORTHO_CONDITION_TOOLS: DentalToolDef[] = [
  { key: 'ERUPCION', label: 'Diente en erupción', color: '#1d4ed8', scope: 'condition' },
  { key: 'SUPERNUMERARIO', label: 'Diente supernumerario', color: '#0f766e', scope: 'condition' },
  { key: 'TEMPORAL', label: 'Diente temporal', color: '#64748b', scope: 'condition' },
  { key: 'PROTESIS_REMOVIBLE', label: 'Prótesis removible', color: '#0284c7', scope: 'condition' },
];

export const ORTHO_DEVICE_TOOLS: DentalToolDef[] = [
  { key: 'LIGADURA_ELASTICA', label: 'Ligadura elástica', color: '#ec4899', scope: 'mark' },
  { key: 'LIGADURA_METALICA', label: 'Ligadura metálica', color: '#6b7280', scope: 'mark' },
  { key: 'GANCHO', label: 'Gancho', color: '#0f172a', scope: 'mark' },
  { key: 'CADENA', label: 'Cadena elástica', color: '#7c3aed', scope: 'mark' },
  { key: 'RESORTE', label: 'Resorte', color: '#0891b2', scope: 'mark' },
  { key: 'BOTON', label: 'Botón / Stop', color: '#0f172a', scope: 'mark' },
  { key: 'TUBO', label: 'Tubo molar', color: '#475569', scope: 'mark' },
  { key: 'TAD', label: 'Mini tornillo (TAD)', color: '#0f766e', scope: 'mark' },
];

export const ORTHO_MOVEMENT_TOOLS: DentalToolDef[] = [
  { key: 'PROTRUSION', label: 'Protrusión', color: '#dc2626', scope: 'mark' },
  { key: 'RETRUSION', label: 'Retrusión', color: '#dc2626', scope: 'mark' },
  { key: 'EXPANSION', label: 'Expansión', color: '#2563eb', scope: 'mark' },
  { key: 'CONTRACCION', label: 'Contracción', color: '#2563eb', scope: 'mark' },
  { key: 'ROTACION', label: 'Rotación', color: '#0f172a', scope: 'mark' },
  { key: 'INTRUSION', label: 'Intrusión', color: '#dc2626', scope: 'mark' },
  { key: 'EXTRUSION', label: 'Extrusión', color: '#16a34a', scope: 'mark' },
];

export const ORTHO_OCCLUSION_TOOLS: DentalToolDef[] = [
  { key: 'MORDIDA_CRUZADA', label: 'Mordida cruzada', color: '#b45309', scope: 'mark' },
  { key: 'MORDIDA_ABIERTA', label: 'Mordida abierta', color: '#0369a1', scope: 'mark' },
  { key: 'SOBREMORDIDA', label: 'Sobremordida', color: '#9a3412', scope: 'mark' },
  { key: 'LINEA_MEDIA', label: 'Desviación de línea media', color: '#1e40af', scope: 'mark' },
  { key: 'APINAMIENTO', label: 'Apiñamiento', color: '#9333ea', scope: 'mark' },
  { key: 'DIASTEMA', label: 'Diastema', color: '#0d9488', scope: 'mark' },
  { key: 'AUSENCIA_ESPACIO', label: 'Ausencia de espacio', color: '#be123c', scope: 'mark' },
  { key: 'ESPACIO', label: 'Espacio en tratamiento', color: '#0369a1', scope: 'mark' },
];

export const ORTHO_TOOLS: DentalToolDef[] = [
  ...ORTHO_CONDITION_TOOLS,
  ...ORTHO_DEVICE_TOOLS,
  ...ORTHO_MOVEMENT_TOOLS,
  ...ORTHO_OCCLUSION_TOOLS,
];

export const ALL_TOOLS: DentalToolDef[] = [...SURFACE_TOOLS, ...CONDITION_TOOLS, ...MARK_TOOLS, ...ORTHO_TOOLS];

export const BRACKET_TYPES: Array<{ key: string; label: string }> = [
  { key: 'METALICO', label: 'Brackets metálicos' },
  { key: 'CERAMICO', label: 'Brackets cerámicos' },
  { key: 'AUTOLIGADO', label: 'Brackets autoligables' },
];

export const ORTHO_APPLIANCES: Array<{ key: string; label: string }> = [
  { key: 'ALINEADOR', label: 'Alineador' },
  { key: 'EXPANSOR', label: 'Expansor palatino' },
  { key: 'ARCO_LINGUAL', label: 'Arco lingual' },
  { key: 'RETENEDOR', label: 'Retenedor' },
];

export const ORTHO_PLAN_PHASES: Array<{ key: string; label: string }> = [
  { key: 'F1', label: 'Fase 1: alineación y nivelación' },
  { key: 'F2', label: 'Fase 2: corrección de discrepancias' },
  { key: 'F3', label: 'Fase 3: finalización y detalles' },
  { key: 'F4', label: 'Fase 4: retención' },
];

export const SURFACE_LABELS: Record<ToothSurface, string> = {
  V: 'Vestibular',
  L: 'Lingual / palatino',
  M: 'Mesial',
  D: 'Distal',
  O: 'Oclusal / incisal',
};

export function dentalToolLabel(key?: string | null) {
  return ALL_TOOLS.find((t) => t.key === key)?.label || '';
}

export function dentalToolColor(key?: string | null) {
  return ALL_TOOLS.find((t) => t.key === key)?.color || '#ffffff';
}

export const DENTAL_SYSTEMS: CheckItem[] = [
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

/** Texto de alergias y medicamentos para `content.allergies` / `content.medications` (RDA). */
export function dentalAllergyList(d: DentistryContent): string[] {
  const out = ALLERGY_ITEMS.filter((i) => d.allergies[i.key]).map((i) =>
    i.key === 'none' ? 'No refiere alergias' : i.label,
  );
  if (d.antecedents.allergic.trim()) out.push(d.antecedents.allergic.trim());
  return out;
}

export function dentalMedicationList(d: DentistryContent): string[] {
  if (d.medications.none) return ['No consume medicamentos'];
  const rows = d.medications.rows
    .filter((r) => r.name.trim())
    .map((r) => [r.name, r.dose, r.frequency].map((v) => v.trim()).filter(Boolean).join(' '));
  const groups = MEDICATION_GROUPS.filter((g) => d.medications.groups[g.key]).map((g) => g.label);
  return [...rows, ...groups];
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
    .check(z.refine((v) => v.trim().length >= 3, 'Motivo de consulta: registre el motivo de consulta.')),
  dentistry: z.object({
    service: z.enum(['GENERAL', 'REHABILITACION', 'ENDODONCIA', 'PERIODONCIA', 'CIRUGIA_ORAL', 'ORTODONCIA'], {
      error: 'Datos de la atención: seleccione el tipo de consulta odontológica.',
    }),
    allergies: z.record(z.string(), z.boolean()).check(
      z.refine(
        (map) => Object.values(map).some(Boolean),
        'Antecedentes: registre las alergias (o marque «No refiere alergias» / «Desconoce»).',
      ),
    ),
    dentalHistory: z.object({
      anesthesiaReaction: z.enum(['SI', 'NO', 'NO_SABE'], {
        error: 'Antecedentes odontológicos: indique si ha tenido reacción a la anestesia odontológica.',
      }),
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
          'Diagnóstico: registre el diagnóstico principal con código CIE-10 y descripción.',
        ),
        z.refine(
          (rows) =>
            rows.every((r) => !trimmed(r.cieCode) || /^[A-Z]\d{2}[A-Z0-9.]{0,3}$/i.test(trimmed(r.cieCode))),
          'Diagnóstico: hay un código CIE-10 con formato inválido.',
        ),
      ),
    treatmentPlan: z.array(
      z.object({
        code: z.string(),
        description: z.string(),
        value: z.string(),
      }),
    ).check(
      z.refine(
        (rows) => rows.every((r) => !trimmed(r.code) || trimmed(r.description)),
        'Plan de tratamiento: cada fila con CUPS necesita el procedimiento.',
      ),
      z.refine(
        (rows) => rows.every((r) => !trimmed(r.value) || /^\d[\d.,]*$/.test(trimmed(r.value))),
        'Plan de tratamiento: el valor debe ser un número (sin letras).',
      ),
    ),
    prescriptions: z.array(
      z.object({ medication: z.string(), dose: z.string(), frequency: z.string() }),
    ).check(
      z.refine(
        (rows) => rows.every((r) => !trimmed(r.medication) || (trimmed(r.dose) && trimmed(r.frequency))),
        'Prescripciones: cada medicamento necesita dosis y frecuencia.',
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
