export type CareModality = 'IN_PERSON' | 'VIRTUAL';
export type DiagnosisType = 'PRINCIPAL' | 'RELATED' | 'IMPRESSION';
export type ClinicalRecordStatus = 'DRAFT' | 'SIGNED' | 'CLOSED';

export interface Patient {
  id: string;
  clinicId: string;
  documentType: string;
  documentNumber: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  secondLastName?: string | null;
  birthDate: string;
  sexAtBirth?: string | null;
  genderIdentity?: string | null;
  sexualOrientation?: string | null;
  maritalStatus?: string | null;
  address?: string | null;
  city?: string | null;
  department?: string | null;
  phone?: string | null;
  email?: string | null;
  eps?: string | null;
  regime?: string | null;
  affiliationNumber?: string | null;
  occupation?: string | null;
  educationLevel?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyRelationship?: string | null;
}

export interface CatalogCode {
  id: string;
  code: string;
  description: string;
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

export interface ClinicalContent {
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
  };
}

export interface ClinicalRecord {
  id: string;
  status: ClinicalRecordStatus;
  content: ClinicalContent;
  updatedAt: string;
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
}

export interface EncounterListItem {
  id: string;
  externalCode: string | null;
  status: string;
  startedAt: string | null;
  patient: Patient;
  clinicalRecord: { id: string; status: ClinicalRecordStatus; updatedAt: string } | null;
}
