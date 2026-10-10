import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgendaStaff, AuditAction, ClinicService, ClinicSpecialty, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import { SaveAgendaStaffDto } from './dto/agenda-staff.dto';

/** Asistentes iniciales, como en la agenda original de la Dra. Gladys Quintero. */
const DEFAULT_STAFF = ['Asistente 1', 'Asistente 2', 'Asistente 3'];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Minutos desde medianoche en hora de Colombia (UTC-5, sin horario de verano). */
function bogotaMinutes(at: Date) {
  return (((at.getUTCHours() - 5) * 60 + at.getUTCMinutes()) % 1440 + 1440) % 1440;
}

/** "8:00 a. m. – 6:00 p. m." */
export function shiftLabel(start: string, end: string) {
  const fmt = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    const suffix = h < 12 ? 'a. m.' : 'p. m.';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

/** La cita debe empezar y terminar dentro del turno, el mismo día. */
export function withinShift(staff: Pick<AgendaStaff, 'shiftStart' | 'shiftEnd'>, startsAt: Date, endsAt: Date) {
  const start = bogotaMinutes(startsAt);
  const durationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  return start >= toMinutes(staff.shiftStart) && start + durationMinutes <= toMinutes(staff.shiftEnd);
}

@Injectable()
export class AgendaStaffService {
  constructor(private readonly prisma: PrismaService) {}

  private async aestheticClinicOf(user: User) {
    if (!user.clinicId) throw new ForbiddenException('Usuario sin consultorio asignado');
    const clinic = await this.prisma.clinic.findUnique({ where: { id: user.clinicId }, select: { specialty: true } });
    if (clinic?.specialty !== ClinicSpecialty.AESTHETIC) {
      throw new ForbiddenException('Las asistentes de agenda son exclusivas de medicina estética.');
    }
    return user.clinicId;
  }

  static view(row: AgendaStaff) {
    return {
      id: row.id,
      name: row.name,
      roleLabel: row.roleLabel,
      shiftStart: row.shiftStart,
      shiftEnd: row.shiftEnd,
      shiftLabel: shiftLabel(row.shiftStart, row.shiftEnd),
      active: row.active,
      sortOrder: row.sortOrder,
    };
  }

  async list(user: User, includeInactive: boolean) {
    const rows = await this.prisma.agendaStaff.findMany({
      where: { clinicId: await this.aestheticClinicOf(user), ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(AgendaStaffService.view);
  }

  private data(dto: SaveAgendaStaffDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El nombre es obligatorio.');
    const shiftStart = dto.shiftStart ?? '08:00';
    const shiftEnd = dto.shiftEnd ?? '18:00';
    if (!HHMM.test(shiftStart) || !HHMM.test(shiftEnd)) {
      throw new BadRequestException('El turno debe tener formato HH:MM.');
    }
    if (toMinutes(shiftEnd) <= toMinutes(shiftStart)) {
      throw new BadRequestException('La hora de salida debe ser posterior a la de entrada.');
    }
    return {
      name,
      roleLabel: dto.roleLabel?.trim() || 'Estética corporal',
      shiftStart,
      shiftEnd,
      active: dto.active ?? true,
    };
  }

  private async audit(user: User, action: AuditAction, row: AgendaStaff) {
    await this.prisma.auditLog.create({
      data: {
        clinicId: row.clinicId,
        userId: user.id,
        action,
        entityType: 'AgendaStaff',
        entityId: row.id,
        metadata: { name: row.name, shiftStart: row.shiftStart, shiftEnd: row.shiftEnd, active: row.active },
      },
    });
  }

  private duplicate(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('Ya existe una asistente con ese nombre.');
    }
    throw e;
  }

  async create(user: User, dto: SaveAgendaStaffDto) {
    const clinicId = await this.aestheticClinicOf(user);
    const max = await this.prisma.agendaStaff.aggregate({ where: { clinicId }, _max: { sortOrder: true } });
    try {
      const row = await this.prisma.agendaStaff.create({
        data: { clinicId, ...this.data(dto), sortOrder: (max._max.sortOrder ?? -1) + 1 },
      });
      await this.audit(user, 'CREATE', row);
      return AgendaStaffService.view(row);
    } catch (e) {
      this.duplicate(e);
    }
  }

  async update(user: User, id: string, dto: SaveAgendaStaffDto) {
    const clinicId = await this.aestheticClinicOf(user);
    const existing = await this.prisma.agendaStaff.findFirst({ where: { id, clinicId } });
    if (!existing) throw new NotFoundException('Asistente no encontrada');
    try {
      const row = await this.prisma.agendaStaff.update({ where: { id }, data: this.data(dto) });
      await this.audit(user, 'UPDATE', row);
      return AgendaStaffService.view(row);
    } catch (e) {
      this.duplicate(e);
    }
  }

  /** Crea Asistente 1, 2 y 3 (08:00–18:00) si el consultorio aún no tiene asistentes. */
  async provisionDefaults(user: User) {
    const clinicId = await this.aestheticClinicOf(user);
    const count = await this.prisma.agendaStaff.count({ where: { clinicId } });
    if (count > 0) return { created: 0 };
    await this.prisma.agendaStaff.createMany({
      data: DEFAULT_STAFF.map((name, sortOrder) => ({ clinicId, name, sortOrder })),
      skipDuplicates: true,
    });
    await this.prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: 'CREATE',
        entityType: 'AgendaStaff',
        entityId: clinicId,
        metadata: { provisionedDefaults: DEFAULT_STAFF.length },
      },
    });
    return { created: DEFAULT_STAFF.length };
  }

  /**
   * Valida una cita atendida por una asistente: consultorio estético, asistente
   * activa, servicio de masajes y dentro de su turno.
   */
  async resolveForAppointment(
    clinicId: string,
    staffId: string,
    service: ClinicService | null,
    startsAt: Date,
    endsAt: Date,
  ) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId }, select: { specialty: true } });
    if (clinic?.specialty !== ClinicSpecialty.AESTHETIC) {
      throw new BadRequestException('Las asistentes de agenda son exclusivas de medicina estética.');
    }
    const staff = await this.prisma.agendaStaff.findFirst({ where: { id: staffId, clinicId } });
    if (!staff) throw new BadRequestException('La asistente indicada no pertenece al consultorio.');
    if (!staff.active) throw new BadRequestException(`${staff.name} está inactiva.`);
    if (!service?.assistantService) {
      throw new BadRequestException('Las asistentes solo pueden agendar servicios de masajes.');
    }
    if (!withinShift(staff, startsAt, endsAt)) {
      throw new BadRequestException(
        `${staff.name} solo está disponible de ${shiftLabel(staff.shiftStart, staff.shiftEnd)}.`,
      );
    }
    return staff;
  }
}
