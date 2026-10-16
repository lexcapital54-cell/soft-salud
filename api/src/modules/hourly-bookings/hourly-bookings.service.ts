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
  UpsertClinicRoomDto,
} from './dto/hourly-bookings.dto';

@Injectable()
export class HourlyBookingsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireClinicAdmin(user: User) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Solo el administrador del consultorio puede gestionar reservas por horas');
    }
    if (!user.clinicId && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  private clinicScope(user: User, clinicId?: string) {
    if (user.role === UserRole.SUPER_ADMIN) {
      if (!clinicId) throw new BadRequestException('Indique el consultorio');
      return clinicId;
    }
    const id = this.requireClinicAdmin(user);
    if (!id) throw new ForbiddenException('Usuario sin consultorio asignado');
    if (clinicId && clinicId !== id) {
      throw new ForbiddenException('No puede operar en otro consultorio');
    }
    return id;
  }

  private async requireHourlyModule(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { hourlyRentalEnabled: true },
    });
    if (!clinic?.hourlyRentalEnabled) {
      throw new ForbiddenException(
        'El módulo de arriendo por horas no está activo. Solicite a HabiliSALUD que lo active para este consultorio.',
      );
    }
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
    const id = this.clinicScope(user, clinicId);
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
    const id = this.clinicScope(user, clinicId);
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
    const id = this.clinicScope(user, clinicId);
    await this.requireHourlyModule(id);
    const room = await this.prisma.clinicRoom.findFirst({ where: { id: roomId, clinicId: id } });
    if (!room) throw new NotFoundException('Sala no encontrada');
    return this.prisma.clinicRoom.update({ where: { id: roomId }, data: { isActive } });
  }

  /** Profesionales del consultorio con plan de arriendo por horas. */
  async listHourlyProfessionals(user: User, clinicId?: string) {
    const id = this.clinicScope(user, clinicId);
    await this.requireHourlyModule(id);
    return this.prisma.user.findMany({
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
              startTime: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: {
        professional: { select: { id: true, fullName: true, membershipType: true } },
        room: { select: { id: true, name: true, code: true } },
      },
      orderBy: { startTime: 'asc' },
      take: 500,
    });
  }

  async createBooking(user: User, dto: CreateHourlyBookingDto, clinicId?: string) {
    const id = this.clinicScope(user, clinicId);
    await this.requireHourlyModule(id);
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (!(start < end)) throw new BadRequestException('La hora de fin debe ser posterior al inicio');

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
    await this.requireHourlyModule(id);
    const existing = await this.prisma.hourlyBooking.findFirst({ where: { id: bookingId, clinicId: id } });
    if (!existing) throw new NotFoundException('Reserva no encontrada');

    const start = dto.startTime ? new Date(dto.startTime) : existing.startTime;
    const end = dto.endTime ? new Date(dto.endTime) : existing.endTime;
    if (!(start < end)) throw new BadRequestException('La hora de fin debe ser posterior al inicio');

    const roomId = dto.roomId === undefined ? existing.roomId : dto.roomId;
    if (roomId) {
      const room = await this.prisma.clinicRoom.findFirst({
        where: { id: roomId, clinicId: id, isActive: true },
      });
      if (!room) throw new NotFoundException('Sala no encontrada o inactiva');
      await this.assertNoRoomOverlap(id, roomId, start, end, bookingId);
    }
    await this.assertNoProfessionalOverlap(id, existing.professionalId, start, end, bookingId);

    return this.prisma.hourlyBooking.update({
      where: { id: bookingId },
      data: {
        startTime: start,
        endTime: end,
        roomId,
        status: dto.status ?? existing.status,
        notes: dto.notes === undefined ? existing.notes : dto.notes?.trim() || null,
      },
      include: {
        professional: { select: { id: true, fullName: true, membershipType: true } },
        room: { select: { id: true, name: true, code: true } },
      },
    });
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
        status: { in: [HourlyBookingStatus.CONFIRMED, HourlyBookingStatus.IN_PROGRESS] },
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
        status: { in: [HourlyBookingStatus.CONFIRMED, HourlyBookingStatus.IN_PROGRESS] },
        startTime: { lt: end },
        endTime: { gt: start },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new BadRequestException('El profesional ya tiene una reserva en ese horario');
  }
}
