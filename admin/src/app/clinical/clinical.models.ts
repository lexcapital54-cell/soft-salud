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
  occupation?: string | null;
  educationLevel?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyRelationship?: string | null;
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

export interface ClinicalContent {
  profile?: 'FULL' | 'SOAP' | string;
  soap?: SoapContent;
  careMinimum: {
    motive: string;
    presentIllness: string;
    antecedents: string;
    systemsReview: string;
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
  _redacted?: boolean;
}

export interface ClinicalEvolution {
  id: string;
  content: {
    note: string;
    reason?: string;
    professionalName?: string;
    professionalCard?: string;
    signatureBase64?: string | null;
    verificationCode?: string;
    _redacted?: boolean;
  };
  contentHash: string;
  signedAt: string;
  author?: { id: string; fullName: string; professionalCard?: string | null };
}

export interface ClinicalRecord {
  id: string;
  status: ClinicalRecordStatus;
  noteFormat?: ClinicalNoteFormat;
  content: ClinicalContent;
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
    updatedAt: string;
    noteFormat?: ClinicalNoteFormat;
  } | null;
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
