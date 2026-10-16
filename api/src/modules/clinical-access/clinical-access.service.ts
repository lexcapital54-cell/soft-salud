import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HourlyBookingStatus, MembershipType, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import { AccessCheckResult, ActiveBookingSummary } from './clinical-access.types';

@Injectable()
export class ClinicalAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Minutos de gracia tras el fin de la reserva (por defecto 45). */
  gracePeriodMinutes(): number {
    const raw = Number(this.config.get('CLINICAL_ACCESS_GRACE_MINUTES', 45));
    if (!Number.isFinite(raw) || raw < 0) return 45;
    return Math.min(Math.round(raw), 24 * 60);
  }

  async checkAccess(user: User, at: Date = new Date()): Promise<AccessCheckResult> {
    const grace = this.gracePeriodMinutes();
    const membershipType = (user.membershipType as MembershipType) || MembershipType.MONTHLY_FIXED;

    // Roles que pueden escribir HCE: el plan de arriendo solo aplica a ellos.
    const clinicalWriter =
      user.role === UserRole.HEALTH_PROFESSIONAL || user.role === UserRole.ADMIN;
    if (!clinicalWriter) {
      return {
        hasAccess: true,
        reason: 'ROLE_EXEMPT',
        membershipType,
        gracePeriodMinutes: grace,
        message: 'Su rol puede acceder al módulo clínico según los permisos del consultorio.',
      };
    }

    if (membershipType !== MembershipType.HOURLY_RENTAL) {
      return {
        hasAccess: true,
        reason: 'MONTHLY_UNRESTRICTED',
        membershipType,
        gracePeriodMinutes: grace,
        message: 'Acceso continuo por plan de mensualidad fija.',
      };
    }

    if (!user.clinicId) {
      return {
        hasAccess: false,
        reason: 'UNAUTHORIZED_ROLE',
        membershipType,
        gracePeriodMinutes: grace,
        message: 'Usuario sin consultorio asignado.',
      };
    }

    // Si HabiliSALUD no activó el módulo en la sede, no se restringe el acceso.
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { hourlyRentalEnabled: true },
    });
    if (!clinic?.hourlyRentalEnabled) {
      return {
        hasAccess: true,
        reason: 'MONTHLY_UNRESTRICTED',
        membershipType,
        gracePeriodMinutes: grace,
        message: 'El módulo de arriendo por horas no está activo en este consultorio.',
      };
    }

    const booking = await this.findActiveBooking(user.id, user.clinicId, at, grace);
    if (!booking) {
      // ¿Hay alguna reserva hoy que ya pasó la gracia?
      const recent = await this.findMostRecentBooking(user.id, user.clinicId, at);
      if (recent) {
        const until = new Date(recent.endTime.getTime() + grace * 60_000);
        if (at > until) {
          return {
            hasAccess: false,
            reason: 'OUTSIDE_GRACE_PERIOD',
            membershipType,
            gracePeriodMinutes: grace,
            activeBooking: this.mapBooking(recent),
            accessUntil: until.toISOString(),
            message: `Su reserva terminó y ya pasó el margen de gracia de ${grace} minutos. Debe tener una nueva reserva confirmada para usar la historia clínica.`,
          };
        }
      }
      return {
        hasAccess: false,
        reason: 'NO_ACTIVE_BOOKING',
        membershipType,
        gracePeriodMinutes: grace,
        message:
          'No tiene una reserva por horas activa en este momento. Solicite o confirme un bloque de horas para acceder a la historia clínica.',
      };
    }

    const accessUntil = new Date(booking.endTime.getTime() + grace * 60_000);
    return {
      hasAccess: true,
      reason: 'ACTIVE_BOOKING_FOUND',
      membershipType,
      gracePeriodMinutes: grace,
      activeBooking: this.mapBooking(booking),
      accessUntil: accessUntil.toISOString(),
      message: 'Acceso autorizado por reserva activa (incluye margen de gracia).',
    };
  }

  private mapBooking(b: {
    id: string;
    professionalId: string;
    roomId: string | null;
    startTime: Date;
    endTime: Date;
    status: HourlyBookingStatus;
    room?: { name: string } | null;
  }): ActiveBookingSummary {
    return {
      id: b.id,
      professionalId: b.professionalId,
      roomId: b.roomId,
      roomName: b.room?.name ?? null,
      startTime: b.startTime.toISOString(),
      endTime: b.endTime.toISOString(),
      status: b.status,
    };
  }

  /** Reserva vigente: inicio ≤ ahora ≤ fin + gracia, no cancelada. */
  private findActiveBooking(professionalId: string, clinicId: string, at: Date, graceMinutes: number) {
    const graceStartFloor = new Date(at.getTime() - graceMinutes * 60_000);
    return this.prisma.hourlyBooking.findFirst({
      where: {
        clinicId,
        professionalId,
        status: {
          in: [
            HourlyBookingStatus.CONFIRMED,
            HourlyBookingStatus.IN_PROGRESS,
            HourlyBookingStatus.COMPLETED,
          ],
        },
        startTime: { lte: at },
        endTime: { gte: graceStartFloor },
      },
      include: { room: { select: { name: true } } },
      orderBy: { endTime: 'desc' },
    });
  }

  private findMostRecentBooking(professionalId: string, clinicId: string, at: Date) {
    return this.prisma.hourlyBooking.findFirst({
      where: {
        clinicId,
        professionalId,
        status: {
          in: [
            HourlyBookingStatus.CONFIRMED,
            HourlyBookingStatus.IN_PROGRESS,
            HourlyBookingStatus.COMPLETED,
          ],
        },
        startTime: { lte: at },
      },
      include: { room: { select: { name: true } } },
      orderBy: { endTime: 'desc' },
    });
  }
}
