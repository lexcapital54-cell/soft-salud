export type DocState = 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' | 'PENDIENTE' | 'ARCHIVADO';

export type PillarKey =
  | 'DOCUMENTACION_LEGAL'
  | 'TALENTO_HUMANO'
  | 'INFRAESTRUCTURA'
  | 'DOTACION'
  | 'MEDICAMENTOS_INSUMOS'
  | 'PROCESOS_PRIORITARIOS'
  | 'HISTORIA_CLINICA'
  | 'INTERDEPENDENCIA'
  | 'SG_SST';

export interface PillarInfo {
  key: PillarKey;
  label: string;
  description: string;
  isStandard: boolean;
}

export interface DocCategory {
  id: string;
  code: string;
  name: string;
  pillar: PillarKey;
  sortOrder: number;
  isActive: boolean;
  documentCount?: number;
}

export interface RegistryFile {
  id: string;
  version: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  issuedAt: string | null;
  changeReason: string | null;
  periodLabel: string | null;
  notes: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

export interface RegistryDoc {
  id: string;
  code: string;
  title: string;
  description: string | null;
  pillar: PillarKey;
  pillarLabel: string;
  categoryId: string;
  categoryName: string;
  responsibleName: string | null;
  responsibleArea: string | null;
  validityDays: number | null;
  isMandatory: boolean;
  isEnabled: boolean;
  archivedAt: string | null;
  state: DocState;
  stateLabel: string;
  expiresAt: string | null;
  daysLeft: number | null;
  versionCount: number;
  activeFileCount: number;
  canEdit: boolean;
  createdAt: string;
  lastUpdate: string | null;
  current: RegistryFile | null;
}

export interface Registry {
  clinic: { id: string; name: string };
  generatedAt: string;
  canManage: boolean;
  pillars: PillarInfo[];
  categories: DocCategory[];
  documents: RegistryDoc[];
}

export interface ActivityItem {
  id: string;
  at: string;
  user: string | null;
  requirementId: string | null;
  documentTitle: string | null;
  version: number | null;
  description: string;
}

export const STATE_LABELS: Record<DocState, string> = {
  VIGENTE: 'Vigente',
  POR_VENCER: 'Próximo a vencer',
  VENCIDO: 'Vencido',
  PENDIENTE: 'Pendiente de cargar',
  ARCHIVADO: 'Archivado',
};
