export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'HEALTH_PROFESSIONAL'
  | 'RECEPTIONIST'
  | 'AUDITOR';

export type ClinicSpecialty = 'PSYCHOLOGY' | 'DENTISTRY' | 'MEDICINE' | 'AESTHETIC';

export type DashboardType = 'CLINICAL_HISTORY' | 'CLINICAL_HISTORY_WITH_DOCS';

export interface AuthUser {
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
  isActive: boolean;
  admins?: ClinicAdmin[];
  createdAt: string;
}

export const SPECIALTY_LABELS: Record<ClinicSpecialty, string> = {
  PSYCHOLOGY: 'Psicología',
  DENTISTRY: 'Odontología',
  MEDICINE: 'Medicina',
  AESTHETIC: 'Medicina estética',
};

export const DASHBOARD_TYPE_LABELS: Record<DashboardType, string> = {
  CLINICAL_HISTORY: 'Historia clínica',
  CLINICAL_HISTORY_WITH_DOCS: 'Historia clínica con gestión documental',
};
