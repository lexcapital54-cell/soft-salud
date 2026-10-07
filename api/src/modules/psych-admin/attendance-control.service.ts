import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import {
  AppointmentEventType,
  AppointmentStatus,
  AuditAction,
  CareModality,
  ClinicLogoKind,
  ClinicSpecialty,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { ClinicLogosService } from '../../clinics/clinic-logos.service';
import type { AttendanceControlData, SaveAttendanceControlDto } from './attendance-control.dto';
import { renderAttendanceControlPdf } from './attendance-control-pdf';

type AuditContext = { ipAddress?: string; userAgent?: string };

const ENTITY = 'AttendanceControl';
const TZ = 'America/Bogota';
const MIN_ROWS = 6;
const MAX_PREFILL_ROWS = 12;

const dateKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const timeKey = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

const emptyRow = () => ({ date: '', time: '', modality: '' as const, status: '' as const, nextDate: '' });

/** Campos obligatorios para emitir una constancia (cuando se marca alguna de sus casillas). */
export function certificateErrors(data: AttendanceControlData): Record<string, string> {
  const c = data.certificate;
  if (!c.assigned && !c.attended) return {};
  const need: Array<[string, string, string]> = [
    ['general.userName', data.general.userName, 'Escriba el nombre del usuario.'],
    ['general.identification', data.general.identification, 'Escriba la identificación o el código.'],
    ['general.professional', data.general.professional, 'Escriba el nombre del profesional.'],
    ['general.site', data.general.site, 'Escriba el consultorio o la sede.'],
    ['certificate.date', c.date, 'Indique la fecha de la cita.'],
    ['certificate.time', c.time, 'Indique la hora de la cita.'],
    ['certificate.place', c.place, 'Indique el lugar o el enlace.'],
    ['certificate.issuedAt', c.issuedAt, 'Indique la fecha de emisión.'],
    ['certificate.responsible', c.responsible, 'Escriba el responsable del registro.'],
  ];
  return Object.fromEntries(need.filter(([, v]) => !String(v || '').trim()).map(([k, , msg]) => [k, msg]));
}

@Injectable()
export class AttendanceControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logos: ClinicLogosService,
  ) {}

  /** Solo consultorios de psicología, siempre dentro del consultorio del usuario. */
  private async clinicOf(user: User) {
    if (!user.clinicId) throw new ForbiddenException('Su usuario no tiene consultorio asignado.');
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { id: true, name: true, address: true, specialty: true },
    });
    if (!clinic) throw new NotFoundException('Consultorio no encontrado.');
    if (clinic.specialty !== ClinicSpecialty.PSYCHOLOGY) {
      throw new ForbiddenException('Este formato está disponible solo para consultorios de psicología.');
    }
    return clinic;
  }

  async searchPatients(user: User, q?: string) {
    const clinic = await this.clinicOf(user);
    const term = (q || '').trim();
    if (term.length < 2) return [];
    const words = term.split(/\s+/).slice(0, 4);
    const rows = await this.prisma.patient.findMany({
      where: {
        clinicId: clinic.id,
        AND: words.map((w) => ({
          OR: [
            { firstName: { contains: w, mode: 'insensitive' as const } },
            { middleName: { contains: w, mode: 'insensitive' as const } },
            { lastName: { contains: w, mode: 'insensitive' as const } },
            { secondLastName: { contains: w, mode: 'insensitive' as const } },
            { documentNumber: { contains: w } },
          ],
        })),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 15,
      select: { id: true, firstName: true, middleName: true, lastName: true, secondLastName: true, documentType: true, documentNumber: true },
    });
    return rows.map((p) => ({
      id: p.id,
      fullName: [p.firstName, p.middleName, p.lastName, p.secondLastName].filter(Boolean).join(' '),
      document: [p.documentType, p.documentNumber].filter(Boolean).join(' '),
    }));
  }

  /** Datos reales de la agenda y de la historia para diligenciar el formato (no se guarda nada). */
  async prefill(user: User, patientId: string) {
    const clinic = await this.clinicOf(user);
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, clinicId: clinic.id } });
    if (!patient) throw new NotFoundException('Paciente no encontrado en este consultorio.');

    const [encounter, recent] = await Promise.all([
      this.prisma.encounter.findFirst({
        where: { patientId, clinicId: clinic.id },
        orderBy: { startedAt: 'desc' },
        select: { externalCode: true, professional: { select: { fullName: true } } },
      }),
      this.prisma.appointment.findMany({
        where: { clinicId: clinic.id, patientId, eventType: AppointmentEventType.CITA },
        orderBy: { startsAt: 'desc' },
        take: 40,
        select: {
          startsAt: true,
          status: true,
          modality: true,
          meetingUrl: true,
          professional: { select: { fullName: true } },
        },
      }),
    ]);
    const appts = [...recent].reverse();
    const active = appts.filter((a) => a.status !== AppointmentStatus.CANCELLED);
    const nextAfter = (d: Date) => active.find((a) => a.startsAt > d);

    const statusOf = (a: (typeof appts)[number]) => {
      switch (a.status) {
        case AppointmentStatus.COMPLETED:
          return 'ASISTIO' as const;
        case AppointmentStatus.NO_SHOW:
          return 'NO_ASISTIO' as const;
        case AppointmentStatus.CANCELLED:
          return 'REPROGRAMADA' as const;
        default:
          return 'ASIGNADA' as const;
      }
    };
    // Una cita cancelada solo cuenta como «reprogramada» si después hay otra cita del paciente.
    const scheduleRows: AttendanceControlData['rows'] = appts
      .filter((a) => a.status !== AppointmentStatus.CANCELLED || !!nextAfter(a.startsAt))
      .slice(-MAX_PREFILL_ROWS)
      .map((a) => {
        const next = nextAfter(a.startsAt);
        return {
          date: dateKey(a.startsAt),
          time: timeKey(a.startsAt),
          modality: a.modality === CareModality.VIRTUAL ? ('VIRTUAL' as const) : ('PRESENCIAL' as const),
          status: statusOf(a),
          nextDate: next ? dateKey(next.startsAt) : '',
        };
      });
    while (scheduleRows.length < MIN_ROWS) scheduleRows.push(emptyRow());

    const now = new Date();
    const ref = active.find((a) => a.startsAt >= now) ?? active[active.length - 1] ?? null;
    const place = !ref
      ? ''
      : ref.modality === CareModality.VIRTUAL
        ? ref.meetingUrl || 'Atención virtual'
        : [clinic.name, clinic.address].filter(Boolean).join(' · ');
    const writesClinical = user.role === UserRole.ADMIN || user.role === UserRole.HEALTH_PROFESSIONAL;
    const professional = ref?.professional.fullName ?? encounter?.professional.fullName ?? (writesClinical ? user.fullName : '');
    const doc = [patient.documentType, patient.documentNumber].filter(Boolean).join(' ');

    const data: AttendanceControlData = {
      clinicName: clinic.name,
      registeredAt: dateKey(now),
      general: {
        userName: [patient.firstName, patient.middleName, patient.lastName, patient.secondLastName].filter(Boolean).join(' '),
        identification: [doc, encounter?.externalCode ? `HC ${encounter.externalCode}` : ''].filter(Boolean).join(' · '),
        professional,
        site: [clinic.name, clinic.address].filter(Boolean).join(' · '),
      },
      rows: scheduleRows,
      certificate: {
        assigned: false,
        attended: false,
        date: ref ? dateKey(ref.startsAt) : '',
        time: ref ? timeKey(ref.startsAt) : '',
        place,
        issuedAt: dateKey(now),
        responsible: user.fullName,
      },
      notes: '',
    };
    return { patientId: patient.id, data };
  }

  /** Formato en blanco con los datos del consultorio (sin paciente). */
  async blank(user: User) {
    const clinic = await this.clinicOf(user);
    const today = dateKey(new Date());
    const data: AttendanceControlData = {
      clinicName: clinic.name,
      registeredAt: today,
      general: { userName: '', identification: '', professional: '', site: [clinic.name, clinic.address].filter(Boolean).join(' · ') },
      rows: Array.from({ length: MIN_ROWS }, emptyRow),
      certificate: { assigned: false, attended: false, date: '', time: '', place: '', issuedAt: today, responsible: user.fullName },
      notes: '',
    };
    return { patientId: null, data };
  }

  async list(user: User, patientId?: string) {
    const clinic = await this.clinicOf(user);
    return this.prisma.attendanceControl.findMany({
      where: { clinicId: clinic.id, ...(patientId ? { patientId } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, patientId: true, patientName: true, createdAt: true, updatedAt: true },
    });
  }

  async get(user: User, id: string) {
    const clinic = await this.clinicOf(user);
    const row = await this.prisma.attendanceControl.findFirst({ where: { id, clinicId: clinic.id } });
    if (!row) throw new NotFoundException('Formato no encontrado.');
    return row;
  }

  async create(user: User, dto: SaveAttendanceControlDto, ctx: AuditContext) {
    const clinic = await this.clinicOf(user);
    const patientId = await this.checkPatient(clinic.id, dto.patientId);
    const name = this.requireName(dto.data);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attendanceControl.create({
        data: {
          clinicId: clinic.id,
          patientId,
          patientName: name,
          data: dto.data as unknown as Prisma.InputJsonValue,
          createdById: user.id,
        },
      });
      await tx.auditLog.create({
        data: { clinicId: clinic.id, userId: user.id, action: AuditAction.CREATE, entityType: ENTITY, entityId: created.id, ...ctx, metadata: { patientId } },
      });
      return created;
    });
    return row;
  }

  async update(user: User, id: string, dto: SaveAttendanceControlDto, ctx: AuditContext) {
    const clinic = await this.clinicOf(user);
    const existing = await this.prisma.attendanceControl.findFirst({ where: { id, clinicId: clinic.id }, select: { id: true, patientId: true } });
    if (!existing) throw new NotFoundException('Formato no encontrado.');
    const patientId = dto.patientId === undefined ? existing.patientId : await this.checkPatient(clinic.id, dto.patientId);
    const name = this.requireName(dto.data);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceControl.update({
        where: { id },
        data: { patientId, patientName: name, data: dto.data as unknown as Prisma.InputJsonValue, updatedById: user.id },
      });
      await tx.auditLog.create({
        data: { clinicId: clinic.id, userId: user.id, action: AuditAction.UPDATE, entityType: ENTITY, entityId: id, ...ctx, metadata: { patientId } },
      });
      return updated;
    });
  }

  async pdf(user: User, data: AttendanceControlData, ctx: AuditContext) {
    const clinic = await this.clinicOf(user);
    const errors = certificateErrors(data);
    if (Object.keys(errors).length) {
      throw new BadRequestException({ message: 'Complete los datos de la constancia antes de emitirla.', fields: errors });
    }
    const logoRow = await this.logos.find(clinic.id, ClinicLogoKind.FORMS);
    const logo = logoRow ? `data:${logoRow.mimeType};base64,${Buffer.from(logoRow.data).toString('base64')}` : null;
    const buffer = await renderAttendanceControlPdf(data, logo);
    await this.prisma.auditLog.create({
      data: { clinicId: clinic.id, userId: user.id, action: AuditAction.EXPORT, entityType: ENTITY, ...ctx, metadata: { format: 'pdf' } },
    });
    const safe = (data.general.userName || 'formato').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').slice(0, 60);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="Control_citas_${safe}_${data.registeredAt || dateKey(new Date())}.pdf"`,
    });
  }

  async logoStatus(user: User) {
    const clinic = await this.clinicOf(user);
    const row = await this.logos.find(clinic.id, ClinicLogoKind.FORMS);
    return {
      clinicId: clinic.id,
      updatedAt: row ? `${row.kind}-${row.updatedAt.getTime()}` : null,
      own: row?.kind === ClinicLogoKind.FORMS,
    };
  }

  async saveLogo(user: User, file: Express.Multer.File | undefined, ctx: AuditContext) {
    const clinic = await this.clinicOf(user);
    await this.logos.save(clinic.id, ClinicLogoKind.FORMS, file);
    await this.prisma.auditLog.create({
      data: { clinicId: clinic.id, userId: user.id, action: AuditAction.UPLOAD, entityType: 'ClinicLogo', entityId: 'FORMS', ...ctx },
    });
    return this.logoStatus(user);
  }

  async removeLogo(user: User, ctx: AuditContext) {
    const clinic = await this.clinicOf(user);
    await this.logos.remove(clinic.id, ClinicLogoKind.FORMS);
    await this.prisma.auditLog.create({
      data: { clinicId: clinic.id, userId: user.id, action: AuditAction.UPDATE, entityType: 'ClinicLogo', entityId: 'FORMS', ...ctx, metadata: { removed: true } },
    });
    return this.logoStatus(user);
  }

  private requireName(data: AttendanceControlData) {
    const name = (data.general.userName || '').trim();
    if (!name) throw new BadRequestException({ message: 'Escriba el nombre del usuario antes de guardar.', fields: { 'general.userName': 'Escriba el nombre del usuario.' } });
    return name.slice(0, 160);
  }

  private async checkPatient(clinicId: string, patientId?: string | null) {
    if (!patientId) return null;
    const ok = await this.prisma.patient.count({ where: { id: patientId, clinicId } });
    if (!ok) throw new BadRequestException('El paciente no pertenece a este consultorio.');
    return patientId;
  }
}
