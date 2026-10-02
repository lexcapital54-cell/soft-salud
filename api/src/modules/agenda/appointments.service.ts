import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentEventType,
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

/** Sesión de una cita pasada o de hoy: qué falta documentar (null = documentada) y si ya venció el día. */
interface ClinicalSessionState {
  pending: string | null;
  overdue: boolean;
}

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

  /**
   * Día calendario en America/Bogota (sin DST). El contenedor Docker suele ir
   * en UTC: si se usa medianoche local del server, las citas de la tarde en
   * Colombia caen en el “día UTC siguiente” y desaparecen de la agenda.
   */
  private dayRange(date?: string) {
    const key = date?.trim() || this.bogotaDateKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      throw new BadRequestException('Fecha inválida (use YYYY-MM-DD)');
    }
    const start = new Date(`${key}T00:00:00.000-05:00`);
    const end = new Date(`${key}T23:59:59.999-05:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Fecha inválida (use YYYY-MM-DD)');
    }
    return { start, end };
  }

  private bogotaDateKey(at = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
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
              OR: [
                {
                  eventType: AppointmentEventType.BLOQUEO,
                  blockReason: { contains: q, mode: 'insensitive' },
                },
                {
                  eventType: AppointmentEventType.CITA,
                  patient: {
                    OR: [
                      { firstName: { contains: q, mode: 'insensitive' } },
                      { lastName: { contains: q, mode: 'insensitive' } },
                      { secondLastName: { contains: q, mode: 'insensitive' } },
                      { documentNumber: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      include: appointmentInclude,
      orderBy: { startsAt: 'asc' },
    });

    const habeasByPatient = await this.habeasDataByPatient(
      clinicId,
      rows.map((r) => r.patientId).filter((id): id is string => id != null),
    );
    const pending = await this.clinicalPendingByAppointment(clinicId, rows);

    return rows.map((row) => this.serialize(row, habeasByPatient, pending));
  }

  /**
   * Citas de hoy o anteriores y si su sesión ya quedó documentada (todas las especialidades).
   * La primera sesión queda cubierta al cerrar la HC; las siguientes, con una nota de
   * evolución cuya fecha de atención caiga el mismo día de la cita. Las de días
   * anteriores sin documentar quedan vencidas (rojo en la agenda).
   */
  private async clinicalPendingByAppointment(
    clinicId: string,
    rows: { id: string; eventType: AppointmentEventType; status: AppointmentStatus; startsAt: Date; patientId: string | null }[],
  ): Promise<Map<string, ClinicalSessionState>> {
    const out = new Map<string, ClinicalSessionState>();
    const today = this.bogotaDateKey();
    const candidates = rows.filter(
      (r) =>
        r.eventType !== AppointmentEventType.BLOQUEO &&
        r.patientId &&
        r.status !== AppointmentStatus.CANCELLED &&
        r.status !== AppointmentStatus.NO_SHOW &&
        this.bogotaDateKey(r.startsAt) <= today,
    );
    if (!candidates.length) return out;

    const encounters = await this.prisma.encounter.findMany({
      where: {
        clinicId,
        patientId: { in: [...new Set(candidates.map((r) => r.patientId as string))] },
        clinicalRecord: { isNot: null },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        patientId: true,
        createdAt: true,
        clinicalRecord: {
          select: {
            status: true,
            evolutions: { select: { clinicalAttentionDate: true, signedAt: true } },
          },
        },
      },
    });
    const historyByPatient = new Map<string, (typeof encounters)[number]>();
    /** Días con sesión documentada por paciente: apertura de cada HC y fecha de atención de cada evolución. */
    const sessionDays = new Map<string, Set<string>>();
    for (const enc of encounters) {
      if (!historyByPatient.has(enc.patientId)) historyByPatient.set(enc.patientId, enc);
      const days = sessionDays.get(enc.patientId) ?? new Set<string>();
      if (enc.clinicalRecord?.status !== 'DRAFT') days.add(this.bogotaDateKey(enc.createdAt));
      for (const ev of enc.clinicalRecord?.evolutions ?? []) {
        days.add(this.bogotaDateKey(ev.clinicalAttentionDate ?? ev.signedAt));
      }
      sessionDays.set(enc.patientId, days);
    }

    for (const appt of candidates) {
      const day = this.bogotaDateKey(appt.startsAt);
      const overdue = day < today;
      const history = historyByPatient.get(appt.patientId as string);
      const record = history?.clinicalRecord;
      if (!history || !record) {
        out.set(appt.id, { pending: 'Historia clínica sin diligenciar', overdue });
        continue;
      }
      if (record.status === 'DRAFT') {
        out.set(appt.id, { pending: 'Historia clínica abierta sin cerrar', overdue });
        continue;
      }
      if (day < this.bogotaDateKey(history.createdAt) || sessionDays.get(appt.patientId as string)?.has(day)) {
        out.set(appt.id, { pending: null, overdue: false });
        continue;
      }
      out.set(appt.id, { pending: 'Falta nota de evolución de la sesión', overdue });
    }
    return out;
  }

  async getOne(user: User, id: string) {
    const clinicId = this.requireClinicId(user);
    const row = await this.prisma.appointment.findFirst({
      where: { id, clinicId },
      include: appointmentInclude,
    });
    if (!row) throw new NotFoundException('Cita no encontrada');
    if (row.eventType === AppointmentEventType.CITA && (!row.patientId || !row.patient)) {
      throw new NotFoundException('Cita sin paciente');
    }
    const habeas = await this.habeasDataByPatient(
      clinicId,
      row.patientId ? [row.patientId] : [],
    );
    return this.serialize(row, habeas, await this.clinicalPendingByAppointment(clinicId, [row]));
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
    const eventType = dto.eventType ?? AppointmentEventType.CITA;
    const isBlock = eventType === AppointmentEventType.BLOQUEO;

    let patientId: string | null = null;
    if (isBlock) {
      if (!dto.blockReason?.trim()) {
        throw new BadRequestException(
          'Indique el motivo del bloqueo (vacaciones, capacitación, etc.).',
        );
      }
    } else {
      if (!dto.patientId) {
        throw new BadRequestException('Seleccione un paciente para la cita.');
      }
      const patient = await this.prisma.patient.findFirst({
        where: { id: dto.patientId, clinicId },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Paciente no encontrado');
      patientId = patient.id;
    }

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
    if (!isBlock && requestDate > startsAt) {
      throw new BadRequestException(
        'La fecha de solicitud no puede ser posterior a la fecha de la cita',
      );
    }

    await this.assertNoOverlap({ professionalId, startsAt, endsAt });

    const modality = isBlock
      ? CareModality.IN_PERSON
      : (dto.modality ?? CareModality.IN_PERSON);
    const created = await this.prisma.appointment.create({
      data: {
        clinicId,
        patientId,
        professionalId,
        startsAt,
        endsAt,
        requestDate: isBlock ? startsAt : requestDate,
        status: AppointmentStatus.SCHEDULED,
        eventType,
        blockReason: isBlock ? dto.blockReason!.trim() : null,
        modality,
        meetingUrl:
          !isBlock && modality === CareModality.VIRTUAL ? dto.meetingUrl : null,
        reason: isBlock ? null : dto.reason,
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
        metadata: {
          patientId,
          professionalId,
          modality,
          eventType,
          blockReason: created.blockReason,
        },
      },
    });

    const habeas = await this.habeasDataByPatient(
      clinicId,
      patientId ? [patientId] : [],
    );
    const serialized = this.serialize(
      created,
      habeas,
      await this.clinicalPendingByAppointment(clinicId, [created]),
    );

    if (!isBlock && patientId) {
      void this.notifications
        .notifyBooking(created.id)
        .catch(() => undefined);
    }

    return serialized;
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

    const habeas = await this.habeasDataByPatient(
      clinicId,
      updated.patientId ? [updated.patientId] : [],
    );
    const serialized = this.serialize(
      updated,
      habeas,
      await this.clinicalPendingByAppointment(clinicId, [updated]),
    );

    const timeChanged =
      existing.startsAt.getTime() !== updated.startsAt.getTime() ||
      existing.endsAt.getTime() !== updated.endsAt.getTime();
    if (timeChanged && existing.eventType === AppointmentEventType.CITA) {
      void this.notifications
        .notifyReschedule(updated.id)
        .catch(() => undefined);
    }

    return serialized;
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
      select: { id: true, eventType: true, blockReason: true },
    });

    if (clash) {
      const isBlock = clash.eventType === AppointmentEventType.BLOQUEO;
      throw new ConflictException({
        code: 'SLOT_TAKEN',
        message: isBlock
          ? `El profesional tiene un bloqueo en ese horario${
              clash.blockReason ? ` (${clash.blockReason})` : ''
            }.`
          : 'El profesional ya tiene una cita que se cruza con ese horario.',
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

    // Bloqueo de agenda: solo se puede cancelar (liberar la franja).
    if (appointment.eventType === AppointmentEventType.BLOQUEO) {
      return this.cancelBlock(user, appointment, dto, context);
    }

    if (!appointment.patientId || !appointment.patient) {
      throw new BadRequestException('La franja no tiene paciente asociado.');
    }
    const patientId = appointment.patientId;

    const target = dto.status;
    if (appointment.status === target) {
      const habeas = await this.habeasDataByPatient(clinicId, [patientId]);
      return this.serialize(
        appointment,
        habeas,
        await this.clinicalPendingByAppointment(clinicId, [appointment]),
      );
    }

    const allowed = ALLOWED_TRANSITIONS[appointment.status] ?? [];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `Transición no permitida: ${appointment.status} → ${target}`,
      );
    }

    // Ley 1581: sin Habeas Data firmado no se admite al paciente en sala de espera
    if (target === AppointmentStatus.IN_WAITING) {
      const signed = await this.hasHabeasData(clinicId, patientId);
      if (!signed) {
        throw new ConflictException({
          code: 'HABEAS_DATA_REQUIRED',
          message:
            'El paciente no tiene la autorización de tratamiento de datos (Ley 1581) firmada. Complete la admisión antes de pasarlo a sala de espera.',
          appointmentId: appointment.id,
          patientId,
        });
      }
    }

    const shouldCreateEncounter =
      target === AppointmentStatus.IN_WAITING && !appointment.encounterId;

    let draftData: Prisma.EncounterUncheckedCreateInput | null = null;
    let existingHcEncounterId: string | null = null;
    if (shouldCreateEncounter) {
      // Historia única: si el paciente ya tiene HCE, vincular la cita a esa
      // atención (no crear un encuentro huérfano sin clinical_record).
      const existingHc = await this.prisma.encounter.findFirst({
        where: { patientId, clinicId, clinicalRecord: { isNot: null } },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (existingHc) {
        existingHcEncounterId = existingHc.id;
      } else {
        const clinic = await this.prisma.clinic.findUnique({
          where: { id: clinicId },
          select: { specialty: true },
        });
        if (!clinic) throw new NotFoundException('Consultorio no encontrado');

        draftData = await this.encounters.buildDraftData({
          clinicId,
          clinicSpecialty: clinic.specialty as ClinicSpecialty,
          patientId,
          professionalId: appointment.professionalId,
          authorId: appointment.professionalId,
          modality: appointment.modality,
          purpose: appointment.reason,
        });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let encounterId = appointment.encounterId;

      if (existingHcEncounterId) {
        encounterId = existingHcEncounterId;
      } else if (draftData) {
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

    const habeas = await this.habeasDataByPatient(clinicId, [patientId]);
    return this.serialize(
      updated,
      habeas,
      await this.clinicalPendingByAppointment(clinicId, [updated]),
    );
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
    if (!appointment.patient) {
      throw new BadRequestException('La franja no tiene paciente asociado.');
    }

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
        status: { not: 'REVOCADO' },
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
      for (const a of admissions) {
        const pid = a.appointment.patientId;
        if (pid) result.set(pid, true);
      }
    }

    for (const id of ids) if (!result.has(id)) result.set(id, false);
    return result;
  }

  /** Libera un bloqueo de agenda (vacaciones, etc.) sin notificar paciente. */
  private async cancelBlock(
    user: User,
    appointment: AppointmentWithRelations,
    dto: UpdateAppointmentStatusDto,
    context: { ipAddress?: string; userAgent?: string },
  ) {
    const clinicId = this.requireClinicId(user);
    if (dto.status !== AppointmentStatus.CANCELLED) {
      throw new BadRequestException(
        'Un bloqueo de agenda solo se puede cancelar (liberar la franja).',
      );
    }
    if (appointment.status === AppointmentStatus.CANCELLED) {
      return this.serialize(appointment, new Map());
    }
    if (appointment.status !== AppointmentStatus.SCHEDULED) {
      throw new BadRequestException(
        `No se puede liberar un bloqueo en estado ${appointment.status}`,
      );
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelledAt: new Date(),
        notes: dto.reason
          ? [appointment.notes, dto.reason].filter(Boolean).join(' · ')
          : appointment.notes,
      },
      include: appointmentInclude,
    });

    await this.prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityType: 'Appointment',
        entityId: appointment.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          eventType: 'BLOQUEO',
          from: appointment.status,
          to: AppointmentStatus.CANCELLED,
          reason: dto.reason ?? null,
        },
      },
    });

    return this.serialize(updated, new Map());
  }

  private serialize(
    row: AppointmentWithRelations,
    habeasByPatient: Map<string, boolean>,
    clinicalPending: Map<string, ClinicalSessionState> = new Map(),
  ) {
    if (row.eventType === AppointmentEventType.BLOQUEO) {
      return {
        id: row.id,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        status: row.status,
        eventType: row.eventType,
        blockReason: row.blockReason,
        modality: row.modality,
        isTelemedicine: false,
        meetingUrl: null,
        requestDate: row.requestDate,
        opportunityDays: null,
        reason: row.reason,
        notes: row.notes,
        cancelledAt: row.cancelledAt,
        slotReopenUntil:
          row.status === AppointmentStatus.CANCELLED && row.cancelledAt
            ? new Date(
                row.cancelledAt.getTime() + CANCELLATION_REOPEN_MINUTES * 60_000,
              )
            : null,
        encounterId: null,
        professional: row.professional,
        patient: null,
        habeasDataSigned: false,
        clinicalPending: null,
        clinicalOverdue: false,
        clinicalDocumented: false,
        admission: null,
        allowedTransitions:
          row.status === AppointmentStatus.SCHEDULED
            ? [AppointmentStatus.CANCELLED]
            : [],
      };
    }

    if (!row.patient || !row.patientId) {
      throw new BadRequestException('Cita sin datos de paciente');
    }
    const patient = row.patient;
    const isMinor =
      patient.isMinorOverride ??
      MINOR_DOCUMENT_TYPES.has((patient.documentType ?? '').toUpperCase());

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
      eventType: row.eventType ?? AppointmentEventType.CITA,
      blockReason: row.blockReason,
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
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        fullName: `${patient.firstName} ${patient.lastName}`.trim(),
        documentType: patient.documentType,
        documentNumber: patient.documentNumber,
        birthDate: patient.birthDate,
        phone: patient.phone,
        isMinor,
        populationGroup: isMinor ? 'MINOR' : 'ADULT',
        profileComplete: missingProfileFields(patient).length === 0,
      },
      habeasDataSigned: habeasByPatient.get(row.patientId) ?? false,
      clinicalPending: clinicalPending.get(row.id)?.pending ?? null,
      clinicalOverdue: !!clinicalPending.get(row.id)?.pending && !!clinicalPending.get(row.id)?.overdue,
      clinicalDocumented: clinicalPending.has(row.id) && !clinicalPending.get(row.id)?.pending,
      admission: row.admission,
      allowedTransitions: ALLOWED_TRANSITIONS[row.status] ?? [],
    };
  }
}
