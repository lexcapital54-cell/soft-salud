import { MembershipType } from '../models';

export type AccessReason =
  | 'MONTHLY_UNRESTRICTED'
  | 'ROLE_EXEMPT'
  | 'ACTIVE_BOOKING_FOUND'
  | 'NO_ACTIVE_BOOKING'
  | 'OUTSIDE_GRACE_PERIOD'
  | 'UNAUTHORIZED_ROLE';

export interface ActiveBookingSummary {
  id: string;
  professionalId: string;
  roomId: string | null;
  roomName: string | null;
  startTime: string;
  endTime: string;
  status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}

export interface AccessCheckResult {
  hasAccess: boolean;
  reason: AccessReason;
  membershipType: MembershipType;
  gracePeriodMinutes: number;
  activeBooking?: ActiveBookingSummary;
  accessUntil?: string;
  message: string;
}

export const ACCESS_REASON_LABELS: Record<AccessReason, string> = {
  MONTHLY_UNRESTRICTED: 'Acceso continuo por mensualidad fija',
  ROLE_EXEMPT: 'Acceso según rol del consultorio',
  ACTIVE_BOOKING_FOUND: 'Reserva activa (incluye margen de gracia)',
  NO_ACTIVE_BOOKING: 'Sin reserva confirmada en este momento',
  OUTSIDE_GRACE_PERIOD: 'Fuera del margen de gracia de la reserva',
  UNAUTHORIZED_ROLE: 'Sin permiso para el módulo clínico',
};
