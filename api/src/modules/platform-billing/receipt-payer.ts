import { ClinicSpecialty, DashboardType, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';

const DASHBOARD_LABEL: Record<DashboardType, string> = {
  CLINICAL_HISTORY: 'Historia clínica',
  CLINICAL_HISTORY_WITH_DOCS: 'Historia clínica con gestión documental',
};

const SPECIALTY_LABEL: Record<ClinicSpecialty, string> = {
  PSYCHOLOGY: 'Psicología',
  PHYSIOTHERAPY: 'Fisioterapia',
  DENTISTRY: 'Odontología',
  ORTHODONTICS: 'Ortodoncia',
  MEDICINE: 'Medicina',
  AESTHETIC: 'Medicina estética',
};

export type ReceiptPayer = {
  payerName: string | null;
  payerDocument: string | null;
  payerPhone: string | null;
  payerEmail: string | null;
  planLabel: string | null;
  dashboardType: DashboardType | null;
};

/**
 * Datos con los que se llena el recibo: el admin del consultorio (el más antiguo activo)
 * y el plan vigente hoy. Los usuarios no guardan documento ni teléfono, así que se usan
 * el NIT y el teléfono registrados del consultorio.
 */
export async function receiptPayer(prisma: PrismaService, clinicId: string): Promise<ReceiptPayer> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { name: true, nit: true, phone: true, specialty: true, dashboardType: true },
  });
  if (!clinic) {
    return { payerName: null, payerDocument: null, payerPhone: null, payerEmail: null, planLabel: null, dashboardType: null };
  }
  const admin = await prisma.user.findFirst({
    where: { clinicId, role: UserRole.ADMIN },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    select: { fullName: true, email: true },
  });
  const plan = clinic.dashboardType ? DASHBOARD_LABEL[clinic.dashboardType] : 'Sin plan activo';
  return {
    payerName: admin?.fullName?.trim() || clinic.name,
    payerDocument: clinic.nit?.trim() || null,
    payerPhone: clinic.phone?.trim() || null,
    payerEmail: admin?.email ?? null,
    planLabel: `${plan} · ${SPECIALTY_LABEL[clinic.specialty]}`,
    dashboardType: clinic.dashboardType,
  };
}
