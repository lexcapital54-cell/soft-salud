import { PaymentMethod, PlatformChargeKind, PlatformPlanVariant, PlatformReceiptStatus } from '@prisma/client';

export const KIND_LABEL: Record<PlatformChargeKind, string> = {
  CLINIC_SETUP: 'Alta / creación de consultorio',
  MONTHLY_HOSTING: 'Arrendamiento mensual del servidor',
  OTHER: 'Otro cobro',
};

export const PLAN_LABEL: Record<PlatformPlanVariant, string> = {
  WITHOUT_DOCS: 'Sin documentación',
  WITH_DOCS: 'Con documentación',
};

export const STATUS_LABEL: Record<PlatformReceiptStatus, string> = {
  PAID: 'Pagado',
  PENDING: 'Pendiente',
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  PSE: 'PSE',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  OTHER: 'Otro',
};
