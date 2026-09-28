import type { DentistryContent } from './dentistry/dentistry.models';

export type CareModality = 'IN_PERSON' | 'VIRTUAL';
export type DiagnosisType = 'PRINCIPAL' | 'RELATED' | 'IMPRESSION';
export type ClinicalRecordStatus = 'DRAFT' | 'SIGNED' | 'CLOSED';
export type VisitType = 'INITIAL' | 'FOLLOW_UP';
export type ClinicalNoteFormat = 'FULL' | 'SOAP';
export type ClinicalDocumentStatus = 'DRAFT' | 'SIGNED' | 'VOID';
export type AttachmentCategory =
  | 'LAB'
  | 'EXTERNAL_HCE'
  | 'IMAGE'
  | 'PHOTO'
  | 'DRAWING'
  | 'EVOLUTION_MEDIA'
  | 'OTHER';

export interface Patient {
  id: string;
  clinicId: string;
  /** Nulos mientras la ficha sea provisional (alta rápida desde la agenda). */
  documentType: string | null;
  documentNumber: string | null;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  secondLastName?: string | null;
  birthDate: string | null;
  sexAtBirth?: string | null;
  genderIdentity?: string | null;
  sexualOrientation?: string | null;
  maritalStatus?: string | null;
  address?: string | null;
  city?: string | null;
  department?: string | null;
  /** Código DIVIPOLA del municipio de residencia (RIPS). */
  municipalityCode?: string | null;
  phone?: string | null;
  email?: string | null;
  eps?: string | null;
  regime?: string | null;
  /** Profesión (formación / título). */
  profession?: string | null;
  /** Ocupación actual. */
  occupation?: string | null;
  educationLevel?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyRelationship?: string | null;
  /** Acudiente / representante legal (menores). */
  guardianFullName?: string | null;
  guardianDocumentType?: string | null;
  guardianDocumentNumber?: string | null;
  guardianRelationship?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  photoUrl?: string | null;
  createdAt?: string;
  /** Ya tiene historia clínica abierta: la atención se anota como evolución. */
  hasClinicalHistory?: boolean;
  profileComplete?: boolean;
  missingProfileFields?: string[];
  /** El alta exprés encontró una ficha igual y la reutilizó en vez de duplicar. */
  reused?: boolean;
}

/** Departamento del catálogo DIVIPOLA (DANE) con sus municipios. */
export interface DivipolaDepartment {
  code: string;
  name: string;
  municipalities: { code: string; name: string }[];
}

export interface CatalogCode {
  id: string;
  code: string;
  description: string;
  cie11Code?: string;
  category?: string;
  source?: string;
}

export interface DiagnosisRow {
  id?: string;
  cieCode: string;
  description: string;
  type: DiagnosisType;
}

export interface ProcedureRow {
  id?: string;
  cupsCode: string;
  description: string;
}

export interface ConsentRow {
  id?: string;
  consentType: string;
  granted: boolean;
  grantedAt?: string | null;
}

export interface SoapContent {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface PhysiotherapyContent {
  antecedentsDetail: {
    personal: string;
    pathological: string;
    surgical: string;
    allergic: string;
    pharmacological: string;
    family: string;
    obgyn: string;
    traumatic: string;
    occupational: string;
    others: string;
  };
  systemsReviewGrid: Record<string, '' | 'NORMAL' | 'ANORMAL'>;
  physioDiagnosis: string;
  findings: string;
  functionalAssessment: Record<string, string>;
  physioDxCode: string;
  physioDxDescription: string;
  treatmentObjectives: string;
  interventionPlan: string;
  frequency: string;
  estimatedDuration: string;
  sessionCount: string;
  closure: {
    closedAt: string;
    caseStatus: string;
    treatmentResult: string;
  };
}

export interface ClinicalContent {
  profile?: 'FULL' | 'SOAP' | 'PHYSIOTHERAPY' | 'DENTISTRY' | string;
  soap?: SoapContent;
  careMinimum: {
    motive: string;
    presentIllness: string;
    antecedents: string;
    /** Historia psicosocial (antes revisión por sistemas). */
    systemsReview: string;
    /** Antecedentes estructurados Aplica/No aplica. */
    antecedentFlags?: {
      personales: { applies: boolean; detail: string };
      psiquiatricos: { applies: boolean; detail: string };
      familiares: { applies: boolean; detail: string };
      toxicos: { applies: boolean; detail: string };
    };
  };
  mentalExam: {
    appearance: string;
    behavior: string;
    speech: string;
    mood: string;
    affect: string;
    thought: string;
    perception: string;
    judgment: string;
    insight: string;
    /** Texto libre unificado del examen mental. */
    narrative?: string;
  };
  assessment: {
    impressionNarrative: string;
    observations: string;
    managementPlan: string[];
  };
  vitals: { notes: string };
  allergies: string[];
  medications: string[];
  risks: { suicideRisk: string; notes: string };
  /** Bloques específicos de HC-FT-001 (fisioterapia). */
  physiotherapy?: PhysiotherapyContent;
  /** Bloques específicos de HC-ODO-001 (odontología / ortodoncia). */
  dentistry?: DentistryContent;
  rdaMeta: {
    includedEvents: string[];
    deviceId: string;
    physicalLocation: string;
  };
  signature: {
    professionalName: string;
    professionalCard: string;
    signedAt: string | null;
    verificationCode: string;
    signatureBase64?: string | null;
  };
  /** Borrador de firma del paciente en consentimientos (antes del sellado legal). */
  consentDraft?: {
    patientSignatureBase64?: string | null;
    /** true si la HC se selló sin firma del paciente (completar después). */
    patientSignaturePending?: boolean;
  };
  /**
   * Fecha/hora en que se digitó el contenido clínico (inmutable).
   * No es la fecha de “Guardar historia clínica” / sellado.
   */
  documentedAt?: string | null;
  _redacted?: boolean;
}

export interface ClinicalEvolution {
  id: string;
  content: {
    note: string;
    reason?: string;
    currentSituation?: string;
    professionalName?: string;
    professionalCard?: string;
    signatureBase64?: string | null;
    verificationCode?: string;
    _redacted?: boolean;
  };
  contentHash: string;
  signedAt: string;
  /** fecha_atencion_clinica: día real de la sesión. */
  clinicalAttentionDate?: string | null;
  /** fecha_sistema: timestamp de inserción (auditoría). */
  createdAt?: string;
  author?: { id: string; fullName: string; professionalCard?: string | null };
}

export interface ClinicalRecord {
  id: string;
  status: ClinicalRecordStatus;
  noteFormat?: ClinicalNoteFormat;
  content: ClinicalContent;
  createdAt?: string;
  updatedAt: string;
  contentHash?: string | null;
  verificationCode?: string | null;
  signedAt?: string | null;
  lockedAt?: string | null;
  lockReason?: string | null;
  evolutions?: ClinicalEvolution[];
}

export interface ProfessionalSignature {
  signatureBase64: string | null;
  professionalName: string;
  professionalCard: string | null;
}

export interface Incapacity {
  id: string;
  encounterId: string;
  status: ClinicalDocumentStatus;
  startDate: string;
  endDate: string;
  days: number;
  diagnosisCie?: string | null;
  cause?: string | null;
  observations?: string | null;
  signedAt?: string | null;
}

export interface ClinicalAttachment {
  id: string;
  encounterId: string;
  clinicalRecordId?: string | null;
  label: string;
  category: AttachmentCategory;
  caption?: string | null;
  notes?: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Encounter {
  id: string;
  externalCode: string | null;
  status: string;
  modality: CareModality;
  serviceType: string | null;
  location: string | null;
  purpose: string | null;
  externalCause: string | null;
  startedAt: string | null;
  createdAt?: string;
  visitType?: VisitType | null;
  visitTypeReason?: string | null;
  specialtySnapshot?: string | null;
  patient: Patient;
  professional: {
    id: string;
    fullName: string;
    email: string;
    professionalCard: string | null;
  };
  clinicalRecord: ClinicalRecord | null;
  diagnoses: DiagnosisRow[];
  procedures: ProcedureRow[];
  consents: ConsentRow[];
  attachments?: ClinicalAttachment[];
  incapacities?: Incapacity[];
}

export interface EncounterListItem {
  id: string;
  externalCode: string | null;
  status: string;
  startedAt: string | null;
  createdAt: string;
  visitType?: VisitType | null;
  patient: Patient;
  clinicalRecord: {
    id: string;
    status: ClinicalRecordStatus;
    createdAt?: string;
    updatedAt: string;
    noteFormat?: ClinicalNoteFormat;
  } | null;
}

/** HCE abierta (borrador) para alertas del profesional. */
export interface OpenEncounterItem {
  encounterId: string;
  patientId: string;
  patientName: string;
  documentType: string | null;
  documentNumber: string | null;
  professionalName: string;
  encounterStatus: string;
  clinicalRecordStatus: ClinicalRecordStatus;
  createdAt: string;
  clinicalRecordCreatedAt: string;
  updatedAt: string | null;
  daysOpen: number;
}

export interface SivigilaCaseRow {
  encounterId: string;
  encounterCode: string | null;
  encounterStatus: string;
  startedAt: string | null;
  patientId: string;
  patientDocument: string;
  patientName: string;
  diagnosisId: string;
  cieCode: string;
  diagnosisDescription: string;
  diagnosisType: string;
  sivigilaEventCode: string | null;
  professionalName: string;
}

export interface SivigilaSummary {
  totalCases: number;
  byCieCode: { cieCode: string; count: number }[];
}

/** Fila del módulo de descarga masiva de HCE en PDF. */
export interface HceExportItem {
  encounterId: string;
  patientId: string;
  patientName: string;
  documentType: string | null;
  documentNumber: string | null;
  externalCode: string | null;
  status: ClinicalRecordStatus;
  signedAt: string | null;
  createdAt: string;
  noteFormat: ClinicalNoteFormat;
  professionalName: string;
  fileName: string;
}
