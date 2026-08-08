export interface ConsentTemplate {
  id: string;
  code: string;
  title: string;
  version: number;
  specialty: string;
  bodyHtml: string;
  updatedAt: string;
}

export interface PatientConsentRecord {
  id: string;
  patientId: string;
  encounterId: string | null;
  templateId: string;
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
  template?: {
    id: string;
    code: string;
    title: string;
    version: number;
  };
}
