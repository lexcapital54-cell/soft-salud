export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'HEALTH_PROFESSIONAL'
  | 'RECEPTIONIST'
  | 'AUDITOR'
  | 'AUXILIAR';

export type ClinicSpecialty =
  | 'PSYCHOLOGY'
  | 'DENTISTRY'
  | 'MEDICINE'
  | 'AESTHETIC'
  | 'PHYSIOTHERAPY'
  | 'ORTHODONTICS';

export type DashboardType = 'CLINICAL_HISTORY' | 'CLINICAL_HISTORY_WITH_DOCS';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  clinicId: string | null;
  clinicName?: string | null;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  specialty?: ClinicSpecialty | null;
  dashboardType?: DashboardType | null;
  ripsEnabled?: boolean;
  repsExpirationDate?: string | null;
  isActive: boolean;
}

/** Sede a la que el usuario puede cambiar (multi-sede). */
export interface AccessibleClinic {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  specialty: string;
  isCurrent: boolean;
  isDefault: boolean;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Superadmin',
  ADMIN: 'Administrador',
  HEALTH_PROFESSIONAL: 'Profesional de salud',
  RECEPTIONIST: 'Secretaría',
  AUDITOR: 'Auditor',
  AUXILIAR: 'Auxiliar',
};

export interface ClinicAdmin {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  clinicId: string | null;
  clinicName?: string | null;
  specialty?: ClinicSpecialty | null;
  dashboardType?: DashboardType | null;
  isActive: boolean;
}

export interface Clinic {
  id: string;
  name: string;
  specialty: ClinicSpecialty;
  dashboardType: DashboardType | null;
  address: string | null;
  phone: string | null;
  nit?: string | null;
  habilitationCode?: string | null;
  isActive: boolean;
  admins?: ClinicAdmin[];
  /** Tiene pacientes, historias u otros registros: solo se puede desactivar. */
  hasClinicalData?: boolean;
  ripsEnabled?: boolean;
  createdAt: string;
}

export const SPECIALTY_LABELS: Record<ClinicSpecialty, string> = {
  PSYCHOLOGY: 'Psicología',
  DENTISTRY: 'Odontología',
  ORTHODONTICS: 'Ortodoncia',
  MEDICINE: 'Medicina',
  AESTHETIC: 'Medicina estética',
  PHYSIOTHERAPY: 'Fisioterapia',
};

export const DASHBOARD_TYPE_LABELS: Record<DashboardType, string> = {
  CLINICAL_HISTORY: 'Historia clínica',
  CLINICAL_HISTORY_WITH_DOCS: 'Historia clínica con gestión documental',
};
