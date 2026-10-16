import { HourlyBookingStatus, MembershipType } from '@prisma/client';

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
  status: HourlyBookingStatus;
}

export interface AccessCheckResult {
  hasAccess: boolean;
  reason: AccessReason;
  membershipType: MembershipType;
  gracePeriodMinutes: number;
  activeBooking?: ActiveBookingSummary;
  /** Fin efectivo del acceso (fin de reserva + gracia), si aplica. */
  accessUntil?: string;
  message: string;
}
