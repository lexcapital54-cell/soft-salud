import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  AuditAction,
  CareModality,
  ClinicSpecialty,
  NotificationKind,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import { EncountersService } from '../clinical/encounters.service';
import { missingProfileFields } from '../clinical/patient-profile';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateAppointmentDto,
  RegisterAdmissionDto,
  TodayAppointmentsQueryDto,
  UpdateAppointmentDto,
  UpdateAppointmentStatusDto,
} from './dto/appointment.dto';

/** Transiciones permitidas de la máquina de estados de la cita. */
const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['IN_WAITING', 'CANCELLED', 'NO_SHOW'],
  IN_WAITING: ['COMPLETED', 'NO_SHOW', 'CANCELLED'],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

/** Estados que además avisan al paciente por WhatsApp / correo. */
const STATUS_NOTIFICATIONS: Partial<Record<AppointmentStatus, NotificationKind>> = {
  CONFIRMED: NotificationKind.CONFIRMATION,
  CANCELLED: NotificationKind.CANCELLATION,
};

const MINOR_DOCUMENT_TYPES = new Set(['TI', 'RC', 'CN', 'MS']);

const DEFAULT_DURATION_MINUTES = 40;

/** Ventana para reagendar el hueco que deja una cancelación. */
export const CANCELLATION_REOPEN_MINUTES = 15;

/** Estados en los que la cita todavía admite cambios de fecha, profesional o modalidad. */
const EDITABLE_STATUSES: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED'];

const appointmentInclude = {
  patient: true,
  admission: true,
  professional: {
    select: { id: true, fullName: true, professionalCard: true },
  },
} satisfies Prisma.AppointmentInclude;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof appointmentInclude;
}>;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encounters: EncountersService,
    private readonly notifications: NotificationsService,
  ) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  private dayRange(date?: string) {
    const base = date ? new Date(`${date}T00:00:00`) : new Date();
    if (Number.isNaN(base.getTime())) {
      throw new BadRequestException('Fecha inválida (use YYYY-MM-DD)');
    }
    const start = new Date(base);
    start.setHours(0, 0, 0, 0);
    const end = new Date(base);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  /** Rango cerrado de días para la vista semanal de la agenda. */
  private spanRange(from: string, to?: string) {
    const start = this.dayRange(from).start;
    const end = this.dayRange(to || from).end;
    if (end < start) {
      throw new BadRequestException('El rango de fechas está invertido');
    }
    return { start, end };
  }

  async listToday(user: User, query: TodayAppointmentsQueryDto) {
    const clinicId = this.requireClinicId(user);
    const { start, end } = query.from
      ? this.spanRange(query.from, query.to)
      : this.dayRange(query.date);
    const q = query.q?.trim();

    const rows = await this.prisma.appointment.findMany({
      where: {
        clinicId,
        startsAt: { gte: start, lte: end },
        ...(query.status ? { status: query.status } : {}),
        ...(q
          ? {
              patient: {
                OR: [
                  { firstName: { contains: q, mode: 'insensitive' } },
                  { lastName: { contains: q, mode: 'insensitive' } },
                  { secondLastName: { contains: q, mode: 'insensitive' } },
                  { documentNumber: { contains: q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: appointmentInclude,
      orderBy: { startsAt: 'asc' },
    });

    const habeasByPatient = await this.habeasDataByPatient(
      clinicId,
      rows.map((r) => r.patientId),
    );

    return rows.map((row) => this.serialize(row, habeasByPatient));
  }

  async getOne(user: User, id: string) {
    const clinicId = this.requireClinicId(user);
    const row = await this.prisma.appointment.findFirst({
      where: { id, clinicId },
      include: appointmentInclude,
    });
    if (!row) throw new NotFoundException('Cita no encontrada');
    const habeas = await this.habeasDataByPatient(clinicId, [row.patientId]);
    return this.serialize(row, habeas);
  }

  /** Profesionales del consultorio disponibles para agendar. */
  async listProfessionals(user: User) {
    const clinicId = this.requireClinicId(user);
    return this.prisma.user.findMany({
      where: {
        clinicId,
        isActive: true,
        role: { in: ['ADMIN', 'HEALTH_PROFESSIONAL'] },
      },
      select: { id: true, fullName: true, professionalCard: true, role: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async create(
    user: User,
    dto: CreateAppointmentDto,
    context: { ipAddress?: string; userAgent?: string } = {},
  ) {
    const clinicId = this.requireClinicId(user);

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const professionalId = await this.resolveProfessionalId(
      clinicId,
      dto.professionalId ?? user.id,
    );

    const { startsAt, endsAt } = this.resolveSlot({
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      durationMinutes: dto.durationMinutes,
    });

    const requestDate = dto.requestDate ? new Date(dto.requestDate) : new Date();
    if (requestDate > startsAt) {
      throw new BadRequestException(
        'La fecha de solicitud no puede ser posterior a la fecha de la cita',
      );
    }

    await this.assertNoOverlap({ professionalId, startsAt, endsAt });

    const modality = dto.modality ?? CareModality.IN_PERSON;
    const created = await this.prisma.appointment.create({
      data: {
        clinicId,
        patientId: patient.id,
        professionalId,
        startsAt,
        endsAt,
        requestDate,
        status: AppointmentStatus.SCHEDULED,
        modality,
        meetingUrl: modality === CareModality.VIRTUAL ? dto.meetingUrl : null,
        reason: dto.reason,
        notes: dto.notes,
      },
      include: appointmentInclude,
    });

    await this.prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: AuditAction.CREATE,
        entityType: 'Appointment',
        entityId: created.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { patientId: patient.id, professionalId, modality },
      },
    });

    const habeas = await this.habeasDataByPatient(clinicId, [patient.id]);
    return this.serialize(created, habeas);
  }

  async update(
    user: User,
    id: string,
    dto: UpdateAppointmentDto,
    context: { ipAddress?: string; userAgent?: string } = {},
  ) {
    const clinicId = this.requireClinicId(user);
    const existing = await this.prisma.appointment.findFirst({
      where: { id, clinicId },
    });
    if (!existing) throw new NotFoundException('Cita no encontrada');
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(
        `Una cita en estado ${existing.status} ya no se puede modificar`,
      );
    }

    const professionalId = dto.professionalId
      ? await this.resolveProfessionalId(clinicId, dto.professionalId)
      : existing.professionalId;

    const reschedule =
      dto.startsAt !== undefined ||
      dto.endsAt !== undefined ||
      dto.durationMinutes !== undefined;

    const { startsAt, endsAt } = reschedule
      ? this.resolveSlot({
          startsAt: dto.startsAt ?? existing.startsAt.toISOString(),
          endsAt: dto.endsAt,
          durationMinutes: dto.durationMinutes,
        })
      : { startsAt: existing.startsAt, endsAt: existing.endsAt };

    if (reschedule || professionalId !== existing.professionalId) {
      await this.assertNoOverlap({
        professionalId,
        startsAt,
        endsAt,
        excludeId: existing.id,
      });
    }

    const modality = dto.modality ?? existing.modality;
    const updated = await this.prisma.appointment.update({
      where: { id: existing.id },
      data: {
        professionalId,
        startsAt,
        endsAt,
        modality,
        meetingUrl:
          modality === CareModality.VIRTUAL
            ? (dto.meetingUrl ?? existing.meetingUrl)
            : null,
        reason: dto.reason ?? existing.reason,
        notes: dto.notes ?? existing.notes,
      },
      include: appointmentInclude,
    });

    await this.prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityType: 'Appointment',
        entityId: existing.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { rescheduled: reschedule, professionalId, modality },
      },
    });

    const habeas = await this.habeasDataByPatient(clinicId, [
      updated.patientId,
    ]);
    return this.serialize(updated, habeas);
  }

  private async resolveProfessionalId(clinicId: string, professionalId: string) {
    const professional = await this.prisma.user.findFirst({
      where: {
        id: professionalId,
        clinicId,
        isActive: true,
        role: { in: ['ADMIN', 'HEALTH_PROFESSIONAL'] },
      },
      select: { id: true },
    });
    if (!professional) {
      throw new BadRequestException(
        'El profesional indicado no pertenece al consultorio o no está activo',
      );
    }
    return professional.id;
  }

  private resolveSlot(input: {
    startsAt: string | Date;
    endsAt?: string | Date;
    durationMinutes?: number;
  }) {
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Fecha de inicio inválida');
    }

    const endsAt = input.endsAt
      ? new Date(input.endsAt)
      : new Date(
          startsAt.getTime() +
            (input.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000,
        );
    if (Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Fecha de fin inválida');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'La hora de fin debe ser posterior a la de inicio',
      );
    }
    return { startsAt, endsAt };
  }

  /** Cancelaciones anteriores a este instante ya cerraron su franja. */
  private reopenDeadline() {
    return new Date(Date.now() - CANCELLATION_REOPEN_MINUTES * 60_000);
  }

  /** Evita doble reserva del mismo profesional en franjas superpuestas. */
  private async assertNoOverlap(params: {
    professionalId: string;
    startsAt: Date;
    endsAt: Date;
    excludeId?: string;
  }) {
    const overlaps = {
      professionalId: params.professionalId,
      startsAt: { lt: params.endsAt },
      endsAt: { gt: params.startsAt },
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
    };

    const clash = await this.prisma.appointment.findFirst({
      where: { ...overlaps, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
      select: { id: true },
    });

    if (clash) {
      throw new ConflictException({
        code: 'SLOT_TAKEN',
        message:
          'El profesional ya tiene una cita que se cruza con ese horario.',
        conflictingAppointmentId: clash.id,
      });
    }

    // Una cancelación libera la franja solo durante la ventana de recuperación.
    // Vencida esa ventana el hueco se cierra y ya no se puede reagendar.
    const expired = await this.prisma.appointment.findFirst({
      where: {
        ...overlaps,
        status: 'CANCELLED',
        cancelledAt: { lt: this.reopenDeadline() },
      },
      select: { id: true },
    });

    if (expired) {
      throw new ConflictException({
        code: 'SLOT_CLOSED',
        message: `La franja se liberó por una cancelación y ya pasaron más de ${CANCELLATION_REOPEN_MINUTES} minutos, así que quedó cerrada.`,
        conflictingAppointmentId: expired.id,
      });
    }
  }

  async updateStatus(
    user: User,
    id: string,
    dto: UpdateAppointmentStatusDto,
    context: { ipAddress?: string; userAgent?: string } = {},
  ) {
    const clinicId = this.requireClinicId(user);
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, clinicId },
      include: appointmentInclude,
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada');

    const target = dto.status;
    if (appointment.status === target) {
      const habeas = await this.habeasDataByPatient(clinicId, [
        appointment.patientId,
      ]);
      return this.serialize(appointment, habeas);
    }

    const allowed = ALLOWED_TRANSITIONS[appointment.status] ?? [];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `Transición no permitida: ${appointment.status} → ${target}`,
      );
    }

    // Ley 1581: sin Habeas Data firmado no se admite al paciente en sala de espera
    if (target === AppointmentStatus.IN_WAITING) {
      const signed = await this.hasHabeasData(clinicId, appointment.patientId);
      if (!signed) {
        throw new ConflictException({
          code: 'HABEAS_DATA_REQUIRED',
          message:
            'El paciente no tiene la autorización de tratamiento de datos (Ley 1581) firmada. Complete la admisión antes de pasarlo a sala de espera.',
          appointmentId: appointment.id,
          patientId: appointment.patientId,
        });
      }
    }

    const shouldCreateEncounter =
      target === AppointmentStatus.IN_WAITING && !appointment.encounterId;

    let draftData: Prisma.EncounterUncheckedCreateInput | null = null;
    if (shouldCreateEncounter) {
      const clinic = await this.prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { specialty: true },
      });
      if (!clinic) throw new NotFoundException('Consultorio no encontrado');

      draftData = await this.encounters.buildDraftData({
        clinicId,
        clinicSpecialty: clinic.specialty as ClinicSpecialty,
        patientId: appointment.patientId,
        professionalId: appointment.professionalId,
        authorId: appointment.professionalId,
        modality: appointment.modality,
        purpose: appointment.reason,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let encounterId = appointment.encounterId;

      if (draftData) {
        const encounter = await tx.encounter.create({
          data: draftData,
          select: { id: true },
        });
        encounterId = encounter.id;
      }

      const row = await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: target,
          encounterId,
          // Reabrir una cita cancelada borra la marca para que la franja deje
          // de estar en cuenta atrás.
          cancelledAt:
            target === AppointmentStatus.CANCELLED ? new Date() : null,
          notes: dto.reason
            ? [appointment.notes, dto.reason].filter(Boolean).join(' | ')
            : appointment.notes,
        },
        include: appointmentInclude,
      });

      await tx.auditLog.create({
        data: {
          clinicId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityType: 'Appointment',
          entityId: appointment.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: {
            from: appointment.status,
            to: target,
            encounterCreated: !!draftData,
            encounterId,
          },
        },
      });

      return row;
    });

    // Avisos al paciente. No deben tumbar el cambio de estado si el proveedor falla.
    const noticeKind = STATUS_NOTIFICATIONS[target];
    if (noticeKind) {
      void this.notifications
        .notifyStatusChange(appointment.id, noticeKind)
        .catch(() => undefined);
    }

    const habeas = await this.habeasDataByPatient(clinicId, [
      updated.patientId,
    ]);
    return this.serialize(updated, habeas);
  }

  /** Admisión de front-desk: deja constancia del Habeas Data firmado en papel o en sitio. */
  async registerAdmission(
    user: User,
    id: string,
    dto: RegisterAdmissionDto,
    context: { ipAddress?: string; userAgent?: string } = {},
  ) {
    const clinicId = this.requireClinicId(user);
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, clinicId },
      include: { patient: true },
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada');

    const signedAt = dto.habeasDataSigned ? new Date() : null;
    const data = {
      habeasDataSigned: dto.habeasDataSigned,
      habeasDataSignedAt: signedAt,
      signedByName:
        dto.signedByName ||
        `${appointment.patient.firstName} ${appointment.patient.lastName}`.trim(),
      documentNumber: dto.documentNumber || appointment.patient.documentNumber,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    };

    const admission = await this.prisma.appointmentAdmission.upsert({
      where: { appointmentId: appointment.id },
      create: { appointmentId: appointment.id, ...data },
      update: data,
    });

    await this.prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: AuditAction.SIGN,
        entityType: 'AppointmentAdmission',
        entityId: admission.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { appointmentId: appointment.id, habeasDataSigned: dto.habeasDataSigned },
      },
    });

    return admission;
  }

  /**
   * Habeas Data válido = consentimiento HABEAS_DATA sellado con PDF
   * o admisión de front-desk marcada como firmada.
   */
  private async hasHabeasData(clinicId: string, patientId: string) {
    const map = await this.habeasDataByPatient(clinicId, [patientId]);
    return map.get(patientId) ?? false;
  }

  private async habeasDataByPatient(clinicId: string, patientIds: string[]) {
    const result = new Map<string, boolean>();
    const ids = [...new Set(patientIds)];
    if (!ids.length) return result;

    const consents = await this.prisma.patientConsent.findMany({
      where: {
        clinicId,
        patientId: { in: ids },
        template: { code: 'HABEAS_DATA' },
      },
      select: { patientId: true },
    });
    for (const c of consents) result.set(c.patientId, true);

    const pending = ids.filter((id) => !result.get(id));
    if (pending.length) {
      const admissions = await this.prisma.appointmentAdmission.findMany({
        where: {
          habeasDataSigned: true,
          appointment: { clinicId, patientId: { in: pending } },
        },
        select: { appointment: { select: { patientId: true } } },
      });
      for (const a of admissions) result.set(a.appointment.patientId, true);
    }

    for (const id of ids) if (!result.has(id)) result.set(id, false);
    return result;
  }

  private serialize(
    row: AppointmentWithRelations,
    habeasByPatient: Map<string, boolean>,
  ) {
    const isMinor =
      row.patient.isMinorOverride ??
      MINOR_DOCUMENT_TYPES.has((row.patient.documentType ?? '').toUpperCase());

    // Indicador PAMEC de oportunidad: días entre solicitud y cita
    const opportunityDays = row.requestDate
      ? Math.max(
          0,
          Math.round(
            (row.startsAt.getTime() - row.requestDate.getTime()) / 86_400_000,
          ),
        )
      : null;

    return {
      id: row.id,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
      modality: row.modality,
      isTelemedicine: row.modality === CareModality.VIRTUAL,
      meetingUrl: row.modality === CareModality.VIRTUAL ? row.meetingUrl : null,
      requestDate: row.requestDate,
      opportunityDays,
      reason: row.reason,
      notes: row.notes,
      cancelledAt: row.cancelledAt,
      // Hasta cuándo se puede volver a ocupar la franja liberada.
      slotReopenUntil:
        row.status === AppointmentStatus.CANCELLED && row.cancelledAt
          ? new Date(
              row.cancelledAt.getTime() + CANCELLATION_REOPEN_MINUTES * 60_000,
            )
          : null,
      encounterId: row.encounterId,
      professional: row.professional,
      patient: {
        id: row.patient.id,
        firstName: row.patient.firstName,
        lastName: row.patient.lastName,
        fullName: `${row.patient.firstName} ${row.patient.lastName}`.trim(),
        documentType: row.patient.documentType,
        documentNumber: row.patient.documentNumber,
        birthDate: row.patient.birthDate,
        phone: row.patient.phone,
        isMinor,
        populationGroup: isMinor ? 'MINOR' : 'ADULT',
        profileComplete: missingProfileFields(row.patient).length === 0,
      },
      habeasDataSigned: habeasByPatient.get(row.patientId) ?? false,
      admission: row.admission,
      allowedTransitions: ALLOWED_TRANSITIONS[row.status] ?? [],
    };
  }
}
