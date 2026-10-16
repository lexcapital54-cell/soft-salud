import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HourlyBookingStatus,
  MembershipType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import {
  CreateHourlyBookingDto,
  UpdateHourlyBookingDto,
  UpdateHourlyRentalSettingsDto,
  UpsertClinicRoomDto,
} from './dto/hourly-bookings.dto';

const ACTIVE_STATUSES: HourlyBookingStatus[] = [
  HourlyBookingStatus.CONFIRMED,
  HourlyBookingStatus.IN_PROGRESS,
];

@Injectable()
export class HourlyBookingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Admin o asistente del consultorio pueden programar reservas. */
  private requireScheduler(user: User) {
    const ok =
      user.role === UserRole.ADMIN ||
      user.role === UserRole.RECEPTIONIST ||
      user.role === UserRole.SUPER_ADMIN;
    if (!ok) {
      throw new ForbiddenException(
        'Solo el administrador o la asistente administrativa pueden gestionar reservas por horas',
      );
    }
    if (!user.clinicId && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  /** Solo el administrador configura salas y cupos. */
  private requireClinicAdmin(user: User) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Solo el administrador del consultorio puede configurar salas y límites de arriendo',
      );
    }
    if (!user.clinicId && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  private clinicScope(user: User, clinicId?: string, adminOnly = false) {
    if (user.role === UserRole.SUPER_ADMIN) {
      if (!clinicId) throw new BadRequestException('Indique el consultorio');
      return clinicId;
    }
    const id = adminOnly ? this.requireClinicAdmin(user) : this.requireScheduler(user);
    if (!id) throw new ForbiddenException('Usuario sin consultorio asignado');
    if (clinicId && clinicId !== id) {
      throw new ForbiddenException('No puede operar en otro consultorio');
    }
    return id;
  }

  private async requireHourlyModule(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        hourlyRentalEnabled: true,
        hourlyMaxConcurrentRooms: true,
        hourlyMaxHoursPerMonth: true,
      },
    });
    if (!clinic?.hourlyRentalEnabled) {
      throw new ForbiddenException(
        'El módulo de arriendo por horas no está activo. Solicite a HabiliSALUD que lo active para este consultorio.',
      );
    }
    return clinic;
  }

  // ─── Configuración ────────────────────────────────────────────────────────

  async getSettings(user: User, clinicId?: string) {
    const id = this.clinicScope(user, clinicId);
    const clinic = await this.requireHourlyModule(id);
    const activeRooms = await this.prisma.clinicRoom.count({
      where: { clinicId: id, isActive: true },
    });
    return {
      clinicId: id,
      hourlyMaxConcurrentRooms: clinic.hourlyMaxConcurrentRooms,
      hourlyMaxHoursPerMonth: clinic.hourlyMaxHoursPerMonth,
      activeRooms,
    };
  }

  async updateSettings(user: User, dto: UpdateHourlyRentalSettingsDto, clinicId?: string) {
    const id = this.clinicScope(user, clinicId, true);
    await this.requireHourlyModule(id);
    const data: {
      hourlyMaxConcurrentRooms?: number;
      hourlyMaxHoursPerMonth?: number;
    } = {};
    if (dto.hourlyMaxConcurrentRooms !== undefined) {
      data.hourlyMaxConcurrentRooms = dto.hourlyMaxConcurrentRooms;
    }
    if (dto.hourlyMaxHoursPerMonth !== undefined) {
      data.hourlyMaxHoursPerMonth = dto.hourlyMaxHoursPerMonth;
    }
    if (!Object.keys(data).length) {
      throw new BadRequestException('Indique al menos un valor a actualizar');
    }
    const clinic = await this.prisma.clinic.update({
      where: { id },
      data,
      select: {
        id: true,
        hourlyMaxConcurrentRooms: true,
        hourlyMaxHoursPerMonth: true,
      },
    });
    const activeRooms = await this.prisma.clinicRoom.count({
      where: { clinicId: id, isActive: true },
    });
    return {
      clinicId: clinic.id,
      hourlyMaxConcurrentRooms: clinic.hourlyMaxConcurrentRooms,
      hourlyMaxHoursPerMonth: clinic.hourlyMaxHoursPerMonth,
      activeRooms,
    };
  }

  // ─── Salas ────────────────────────────────────────────────────────────────

  async listRooms(user: User, clinicId?: string) {
    const id = this.clinicScope(user, clinicId);
    await this.requireHourlyModule(id);
    return this.prisma.clinicRoom.findMany({
      where: { clinicId: id },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async createRoom(user: User, dto: UpsertClinicRoomDto, clinicId?: string) {
    const id = this.clinicScope(user, clinicId, true);
    await this.requireHourlyModule(id);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Escriba el nombre de la sala');
    return this.prisma.clinicRoom.create({
      data: {
        clinicId: id,
        name,
        code: dto.code?.trim() || null,
        capacity: dto.capacity ?? 1,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async updateRoom(user: User, roomId: string, dto: UpsertClinicRoomDto, clinicId?: string) {
    const id = this.clinicScope(user, clinicId, true);
    await this.requireHourlyModule(id);
    const room = await this.prisma.clinicRoom.findFirst({ where: { id: roomId, clinicId: id } });
    if (!room) throw new NotFoundException('Sala no encontrada');
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Escriba el nombre de la sala');
    return this.prisma.clinicRoom.update({
      where: { id: roomId },
      data: {
        name,
        code: dto.code?.trim() || null,
        capacity: dto.capacity ?? room.capacity,
        notes: dto.notes === undefined ? room.notes : dto.notes?.trim() || null,
      },
    });
  }

  async setRoomActive(user: User, roomId: string, isActive: boolean, clinicId?: string) {
    const id = this.clinicScope(user, clinicId, true);
    await this.requireHourlyModule(id);
    const room = await this.prisma.clinicRoom.findFirst({ where: { id: roomId, clinicId: id } });
    if (!room) throw new NotFoundException('Sala no encontrada');
    return this.prisma.clinicRoom.update({ where: { id: roomId }, data: { isActive } });
  }

  /** Profesionales con plan de arriendo + horas usadas en el mes. */
  async listHourlyProfessionals(user: User, clinicId?: string, month?: string) {
    const id = this.clinicScope(user, clinicId);
    const clinic = await this.requireHourlyModule(id);
    const { monthStart, monthEnd } = this.monthBounds(month);

    const professionals = await this.prisma.user.findMany({
      where: {
        clinicId: id,
        isActive: true,
        membershipType: MembershipType.HOURLY_RENTAL,
        role: { in: [UserRole.HEALTH_PROFESSIONAL, UserRole.ADMIN] },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        membershipType: true,
      },
      orderBy: { fullName: 'asc' },
    });

    const bookings = await this.prisma.hourlyBooking.findMany({
      where: {
        clinicId: id,
        status: { in: [...ACTIVE_STATUSES, HourlyBookingStatus.COMPLETED] },
        startTime: { lt: monthEnd },
        endTime: { gt: monthStart },
      },
      select: { professionalId: true, startTime: true, endTime: true },
    });

    const usedByPro = new Map<string, number>();
    for (const b of bookings) {
      const hours = this.overlapHours(b.startTime, b.endTime, monthStart, monthEnd);
      usedByPro.set(b.professionalId, (usedByPro.get(b.professionalId) || 0) + hours);
    }

    return professionals.map((p) => {
      const hoursUsed = Math.round((usedByPro.get(p.id) || 0) * 100) / 100;
      return {
        ...p,
        hoursUsedThisMonth: hoursUsed,
        hoursRemainingThisMonth: Math.max(
          0,
          Math.round((clinic.hourlyMaxHoursPerMonth - hoursUsed) * 100) / 100,
        ),
        hoursLimitThisMonth: clinic.hourlyMaxHoursPerMonth,
      };
    });
  }

  // ─── Reservas ─────────────────────────────────────────────────────────────

  async listBookings(
    user: User,
    opts: { clinicId?: string; professionalId?: string; from?: string; to?: string },
  ) {
    const clinicId = this.clinicScope(user, opts.clinicId);
    await this.requireHourlyModule(clinicId);
    const from = opts.from ? new Date(opts.from) : undefined;
    const to = opts.to ? new Date(opts.to) : undefined;
    return this.prisma.hourlyBooking.findMany({
      where: {
        clinicId,
        ...(opts.professionalId ? { professionalId: opts.professionalId } : {}),
        ...(from || to
          ? {
              AND: [
                ...(from ? [{ endTime: { gt: from } }] : []),
                ...(to ? [{ startTime: { lt: to } }] : []),
              ],
            }
          : {}),
      },
      include: {
        professional: { select: { id: true, fullName: true, membershipType: true } },
        room: { select: { id: true, name: true, code: true } },
      },
      orderBy: { startTime: 'asc' },
      take: 800,
    });
  }

  async createBooking(user: User, dto: CreateHourlyBookingDto, clinicId?: string) {
    const id = this.clinicScope(user, clinicId);
    const clinic = await this.requireHourlyModule(id);
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (!(start < end)) throw new BadRequestException('La hora de fin debe ser posterior al inicio');
    if (end.getTime() - start.getTime() < 15 * 60_000) {
      throw new BadRequestException('La reserva debe durar al menos 15 minutos');
    }

    const professional = await this.prisma.user.findFirst({
      where: {
        id: dto.professionalId,
        clinicId: id,
        isActive: true,
        role: { in: [UserRole.HEALTH_PROFESSIONAL, UserRole.ADMIN] },
      },
    });
    if (!professional) throw new NotFoundException('Profesional no encontrado en este consultorio');
    if (professional.membershipType !== MembershipType.HOURLY_RENTAL) {
      throw new BadRequestException(
        'Este usuario tiene plan de mensualidad fija; no requiere reserva por horas.',
      );
    }

    if (dto.roomId) {
      const room = await this.prisma.clinicRoom.findFirst({
        where: { id: dto.roomId, clinicId: id, isActive: true },
      });
      if (!room) throw new NotFoundException('Sala no encontrada o inactiva');
      await this.assertNoRoomOverlap(id, dto.roomId, start, end);
    }

    await this.assertNoProfessionalOverlap(id, dto.professionalId, start, end);
    await this.assertMonthlyHours(id, dto.professionalId, start, end, clinic.hourlyMaxHoursPerMonth);
    await this.assertConcurrentCapacity(id, start, end, clinic.hourlyMaxConcurrentRooms);

    return this.prisma.hourlyBooking.create({
      data: {
        clinicId: id,
        professionalId: dto.professionalId,
        roomId: dto.roomId || null,
        startTime: start,
        endTime: end,
        notes: dto.notes?.trim() || null,
        createdById: user.id,
        status: HourlyBookingStatus.CONFIRMED,
      },
      include: {
        professional: { select: { id: true, fullName: true, membershipType: true } },
        room: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async updateBooking(user: User, bookingId: string, dto: UpdateHourlyBookingDto, clinicId?: string) {
    const id = this.clinicScope(user, clinicId);
    const clinic = await this.requireHourlyModule(id);
    const existing = await this.prisma.hourlyBooking.findFirst({
      where: { id: bookingId, clinicId: id },
    });
    if (!existing) throw new NotFoundException('Reserva no encontrada');

    const start = dto.startTime ? new Date(dto.startTime) : existing.startTime;
    const end = dto.endTime ? new Date(dto.endTime) : existing.endTime;
    if (!(start < end)) throw new BadRequestException('La hora de fin debe ser posterior al inicio');

    const roomId = dto.roomId === undefined ? existing.roomId : dto.roomId;
    const nextStatus = dto.status ?? existing.status;
    const willBeActive = ACTIVE_STATUSES.includes(nextStatus);

    if (willBeActive) {
      if (roomId) {
        const room = await this.prisma.clinicRoom.findFirst({
          where: { id: roomId, clinicId: id, isActive: true },
        });
        if (!room) throw new NotFoundException('Sala no encontrada o inactiva');
        await this.assertNoRoomOverlap(id, roomId, start, end, bookingId);
      }
      await this.assertNoProfessionalOverlap(id, existing.professionalId, start, end, bookingId);
      await this.assertMonthlyHours(
        id,
        existing.professionalId,
        start,
        end,
        clinic.hourlyMaxHoursPerMonth,
        bookingId,
      );
      await this.assertConcurrentCapacity(id, start, end, clinic.hourlyMaxConcurrentRooms, bookingId);
    }

    return this.prisma.hourlyBooking.update({
      where: { id: bookingId },
      data: {
        startTime: start,
        endTime: end,
        roomId,
        status: nextStatus,
        notes: dto.notes === undefined ? existing.notes : dto.notes?.trim() || null,
      },
      include: {
        professional: { select: { id: true, fullName: true, membershipType: true } },
        room: { select: { id: true, name: true, code: true } },
      },
    });
  }

  // ─── Validaciones ─────────────────────────────────────────────────────────

  private monthBounds(month?: string) {
    const now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth();
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [yy, mm] = month.split('-').map(Number);
      y = yy;
      m = mm - 1;
    }
    const monthStart = new Date(y, m, 1, 0, 0, 0, 0);
    const monthEnd = new Date(y, m + 1, 1, 0, 0, 0, 0);
    return { monthStart, monthEnd, label: `${y}-${String(m + 1).padStart(2, '0')}` };
  }

  private overlapHours(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    const start = Math.max(aStart.getTime(), bStart.getTime());
    const end = Math.min(aEnd.getTime(), bEnd.getTime());
    if (end <= start) return 0;
    return (end - start) / 3_600_000;
  }

  private async assertMonthlyHours(
    clinicId: string,
    professionalId: string,
    start: Date,
    end: Date,
    limit: number,
    excludeId?: string,
  ) {
    // Una reserva puede cruzar meses: validar cada mes tocado.
    const months = this.monthsTouched(start, end);
    for (const { monthStart, monthEnd, label } of months) {
      const existing = await this.prisma.hourlyBooking.findMany({
        where: {
          clinicId,
          professionalId,
          status: { in: [...ACTIVE_STATUSES, HourlyBookingStatus.COMPLETED] },
          startTime: { lt: monthEnd },
          endTime: { gt: monthStart },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { startTime: true, endTime: true },
      });
      let used = 0;
      for (const b of existing) {
        used += this.overlapHours(b.startTime, b.endTime, monthStart, monthEnd);
      }
      const add = this.overlapHours(start, end, monthStart, monthEnd);
      if (used + add > limit + 0.001) {
        const remaining = Math.max(0, Math.round((limit - used) * 100) / 100);
        throw new BadRequestException(
          `El profesional supera el tope de ${limit} horas en ${label}. Le quedan ${remaining} h disponibles este mes.`,
        );
      }
    }
  }

  private monthsTouched(start: Date, end: Date) {
    const out: Array<{ monthStart: Date; monthEnd: Date; label: string }> = [];
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= last) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      out.push({
        monthStart: new Date(y, m, 1, 0, 0, 0, 0),
        monthEnd: new Date(y, m + 1, 1, 0, 0, 0, 0),
        label: `${y}-${String(m + 1).padStart(2, '0')}`,
      });
      cursor = new Date(y, m + 1, 1);
    }
    return out;
  }

  /**
   * Cupo de consultorios simultáneos: cuenta reservas activas que se solapan
   * en el intervalo (cada una ocupa un espacio, con o sin sala asignada).
   */
  private async assertConcurrentCapacity(
    clinicId: string,
    start: Date,
    end: Date,
    maxConcurrent: number,
    excludeId?: string,
  ) {
    const overlapping = await this.prisma.hourlyBooking.findMany({
      where: {
        clinicId,
        status: { in: ACTIVE_STATUSES },
        startTime: { lt: end },
        endTime: { gt: start },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, startTime: true, endTime: true },
    });

    // Máximo de reservas concurrentes en cualquier instante del intervalo.
    const events: Array<{ t: number; d: number }> = [];
    for (const b of overlapping) {
      events.push({ t: b.startTime.getTime(), d: 1 });
      events.push({ t: b.endTime.getTime(), d: -1 });
    }
    // La nueva reserva también cuenta.
    events.push({ t: start.getTime(), d: 1 });
    events.push({ t: end.getTime(), d: -1 });
    events.sort((a, b) => (a.t === b.t ? a.d - b.d : a.t - b.t));

    let cur = 0;
    let peak = 0;
    for (const e of events) {
      cur += e.d;
      if (cur > peak) peak = cur;
    }
    if (peak > maxConcurrent) {
      throw new BadRequestException(
        `Ya hay ${maxConcurrent} consultorio(s) ocupado(s) en ese horario. Ajuste el cupo o elija otra franja.`,
      );
    }
  }

  private async assertNoRoomOverlap(
    clinicId: string,
    roomId: string,
    start: Date,
    end: Date,
    excludeId?: string,
  ) {
    const clash = await this.prisma.hourlyBooking.findFirst({
      where: {
        clinicId,
        roomId,
        status: { in: ACTIVE_STATUSES },
        startTime: { lt: end },
        endTime: { gt: start },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new BadRequestException('La sala ya tiene una reserva en ese horario');
  }

  private async assertNoProfessionalOverlap(
    clinicId: string,
    professionalId: string,
    start: Date,
    end: Date,
    excludeId?: string,
  ) {
    const clash = await this.prisma.hourlyBooking.findFirst({
      where: {
        clinicId,
        professionalId,
        status: { in: ACTIVE_STATUSES },
        startTime: { lt: end },
        endTime: { gt: start },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new BadRequestException('El profesional ya tiene una reserva en ese horario');
  }
}
