export type ComplianceStatus = 'GREEN' | 'YELLOW' | 'RED' | 'OPTIONAL';

export type DocumentFileStatus =
  | 'PENDING_SIGNATURE'
  | 'PARTIALLY_SIGNED'
  | 'SIGNED'
  | 'RETIRED';

export type DocumentSignerRole =
  | 'ELABORO'
  | 'REVISO'
  | 'APROBO'
  | 'CAPACITADOR'
  | 'ASISTENTE';

export type DocumentPillar =
  | 'DOCUMENTACION_LEGAL'
  | 'TALENTO_HUMANO'
  | 'INFRAESTRUCTURA'
  | 'DOTACION'
  | 'MEDICAMENTOS_INSUMOS'
  | 'PROCESOS_PRIORITARIOS'
  | 'HISTORIA_CLINICA'
  | 'INTERDEPENDENCIA'
  | 'SG_SST';

export interface ComplianceSummary {
  green: number;
  yellow: number;
  red: number;
  optional: number;
  total: number;
  compliance: number;
  status: ComplianceStatus;
}

export interface DocumentSignatureRow {
  id: string;
  role: DocumentSignerRole;
  signerName: string;
  signedAt: string;
  signatureBase64: string;
}

export interface DocumentFileRow {
  id: string;
  version: number;
  periodLabel: string | null;
  status: DocumentFileStatus;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  expiresAt: string | null;
  notes: string | null;
  formData?: Record<string, unknown> | null;
  retiredAt: string | null;
  createdAt: string;
  uploadedBy: string | null;
  requiredRoles?: DocumentSignerRole[];
  fillable?: boolean;
  fillableTraining?: boolean;
  canPreview: boolean;
  signatures: DocumentSignatureRow[];
  missingRoles: DocumentSignerRole[];
}

export interface RequirementRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  isMandatory: boolean;
  validityDays: number | null;
  status: ComplianceStatus;
  expiresAt: string | null;
  daysToExpiry: number | null;
  fileCount: number;
  latestFile: DocumentFileRow | null;
  fillable?: boolean;
  fillableTraining?: boolean;
  requiredRoles?: DocumentSignerRole[];
}

export interface CategoryNode {
  id: string;
  code: string;
  name: string;
  requirements: RequirementRow[];
  summary: ComplianceSummary;
}

export interface PillarNode {
  pillar: DocumentPillar;
  label: string;
  categories: CategoryNode[];
  summary: ComplianceSummary;
}

export interface DocumentsOverview {
  generatedAt: string;
  pillars: PillarNode[];
  summary: ComplianceSummary;
}

export interface RequirementDetail {
  requirement: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    isMandatory: boolean;
    validityDays: number | null;
    category: string;
    pillar: DocumentPillar;
  };
  status: ComplianceStatus;
  expiresAt: string | null;
  daysToExpiry: number | null;
  fillable?: boolean;
  fillableTraining?: boolean;
  requiredRoles?: DocumentSignerRole[];
  files: DocumentFileRow[];
}

export interface FillTrainingActaPayload {
  tema: string;
  fecha: string;
  capacitadorNombre: string;
  asistenteNombre: string;
  objetivo?: string;
  periodLabel?: string;
  capacitadorSignatureBase64: string;
  asistenteSignatureBase64: string;
}

export interface FillSgsstPayload {
  fecha: string;
  periodLabel?: string;
  contenido?: string;
  tema?: string;
  objetivo?: string;
  signatures: Array<{
    role: DocumentSignerRole;
    signerName: string;
    signatureBase64: string;
  }>;
}

export interface DocumentFileDetail {
  requirement: {
    id: string;
    code: string;
    title: string;
    pillar: DocumentPillar;
    category: string;
  };
  file: DocumentFileRow;
}

export interface SignedArchiveMonth {
  period: string;
  label: string;
  count: number;
}

export interface SignedArchiveFile extends DocumentFileRow {
  requirementId: string;
  requirementCode: string;
  requirementTitle: string;
  category: string;
  pillar: DocumentPillar;
  pillarLabel: string;
}

export interface SignedArchive {
  generatedAt: string;
  months: SignedArchiveMonth[];
  selectedPeriod: string;
  selectedLabel: string;
  totalSigned: number;
  files: SignedArchiveFile[];
}
