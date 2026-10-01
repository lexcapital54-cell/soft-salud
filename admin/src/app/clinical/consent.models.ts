export type ConsentSignerRole = 'PATIENT' | 'LEGAL_GUARDIAN' | 'ASSENT';
export type PatientConsentStatus = 'ACEPTADO' | 'REVOCADO' | 'PENDIENTE_FIRMA';
export type CiConsentCode = 'CI-OD-001' | 'CI-ORT-002' | 'CI-CIR-003';

export interface CiChoice {
  value: string;
  label: string;
}

export interface CiOptionGroup {
  key: string;
  label: string;
  multiple: boolean;
  required: boolean;
  hint?: string;
  choices: CiChoice[];
}

export interface CiCheckItem {
  key: string;
  label: string;
  detail: string;
}

/** Especificación del CI estructurado (llega en `bodyJson` de la plantilla). */
export interface CiConsentSpec {
  kind: 'CI';
  code: CiConsentCode;
  professionalRole: string;
  teeth: 'required' | 'optional';
  teethLabel: string;
  options: CiOptionGroup[];
  risks: CiCheckItem[];
  declarations: CiCheckItem[];
}

export interface CiConsentDetails {
  code: CiConsentCode;
  teeth: number[];
  options: Record<string, string[]>;
  risksAccepted: string[];
  declarationsAccepted: string[];
  notes: string;
  filledAt?: string;
}

export interface ConsentTemplate {
  id: string;
  code: string;
  title: string;
  version: number;
  specialty: string;
  bodyHtml: string;
  bodyJson?: unknown;
  updatedAt: string;
}

export interface PatientConsentRecord {
  id: string;
  patientId: string;
  encounterId: string | null;
  templateId: string;
  signerRole?: ConsentSignerRole;
  signerName: string | null;
  signerDocument: string | null;
  signedAt: string;
  ipAddress: string | null;
  pdfStorageKey: string | null;
  contentHash?: string | null;
  immutableAt?: string | null;
  sealStatus?: 'PENDING_PDF' | 'SEALED';
  pdfUrl?: string;
  message?: string;
  /** Firma biométrica del paciente/acudiente (data URL o base64). */
  signatureBase64?: string | null;
  status?: PatientConsentStatus;
  procedureDetails?: CiConsentDetails | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
  revocationPdfStorageKey?: string | null;
  template?: {
    id: string;
    code: string;
    title: string;
    version: number;
  };
}
