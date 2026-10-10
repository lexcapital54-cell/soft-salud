import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import { bogotaDay, buildAestheticIndicators } from './aesthetic-indicators';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 3 * 366;

/** Inicio del día en Bogotá (UTC-5) como instante UTC. */
const startOfDay = (day: string) => new Date(`${day}T05:00:00.000Z`);

@Injectable()
export class AestheticIndicatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: User, query: { from?: string; to?: string; professionalId?: string }) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('Usuario sin consultorio asignado');
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId }, select: { specialty: true } });
    if (clinic?.specialty !== 'AESTHETIC') {
      throw new ForbiddenException('Los indicadores estéticos solo están disponibles en consultorios de medicina estética.');
    }

    const today = bogotaDay(new Date());
    const to = query.to || today;
    const from = query.from || `${to.slice(0, 4)}-01-01`;
    if (!DAY.test(from) || !DAY.test(to) || from > to) throw new BadRequestException('Periodo inválido.');
    const start = startOfDay(from);
    const end = new Date(startOfDay(to).getTime() + 86_400_000);
    if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_DAYS) {
      throw new BadRequestException('El periodo no puede superar tres años.');
    }
    const professionalId = query.professionalId || null;
    const byProfessional = professionalId ? Prisma.sql`AND e.professional_id = ${professionalId}::uuid` : Prisma.empty;

    const [patients, encounters, tracking, appointments, consentsSigned, ownEncounters, professionals] = await Promise.all([
      this.prisma.patient.findMany({
        where: { clinicId },
        select: { id: true, birthDate: true, sexAtBirth: true, createdAt: true },
      }),
      this.prisma.$queryRaw<
        Array<{ id: string; patient_id: string; professional_id: string; at: Date; signed: boolean; assessment: unknown }>
      >`
        SELECT e.id, e.patient_id, e.professional_id,
               COALESCE(e.started_at, e.created_at) AS at,
               COALESCE(r.status <> 'DRAFT', false) AS signed,
               r.content->'aesthetic'->'assessment' AS assessment
          FROM encounters e
          LEFT JOIN clinical_records r ON r.encounter_id = e.id
         WHERE e.clinic_id = ${clinicId}::uuid
           AND e.status <> 'CANCELLED'
           AND COALESCE(e.started_at, e.created_at) >= ${start}
           AND COALESCE(e.started_at, e.created_at) < ${end}
           ${byProfessional}`,
      this.prisma.$queryRaw<Array<{ patient_id: string; procedures: unknown }>>`
        SELECT patient_id, data->'procedures' AS procedures
          FROM aesthetic_tracking
         WHERE clinic_id = ${clinicId}::uuid`,
      this.prisma.appointment.findMany({
        where: {
          clinicId,
          eventType: 'CITA',
          startsAt: { gte: start, lt: end },
          ...(professionalId ? { professionalId } : {}),
        },
        select: { status: true, reason: true, service: { select: { name: true } } },
      }),
      this.prisma.patientConsent.count({
        where: {
          clinicId,
          status: 'ACEPTADO',
          signedAt: { gte: start, lt: end },
          ...(professionalId ? { encounter: { professionalId } } : {}),
        },
      }),
      professionalId
        ? this.prisma.encounter.findMany({ where: { clinicId, professionalId }, select: { id: true } })
        : Promise.resolve(null),
      this.prisma.user.findMany({
        where: { clinicId, role: { in: ['ADMIN', 'HEALTH_PROFESSIONAL'] } },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    const result = buildAestheticIndicators({
      from,
      to,
      today,
      patients,
      encounters: encounters.map((e) => ({
        id: e.id,
        patientId: e.patient_id,
        professionalId: e.professional_id,
        at: e.at,
        signed: e.signed,
        aesthetic: { assessment: e.assessment },
      })),
      tracking: tracking.map((t) => ({ patientId: t.patient_id, data: { procedures: t.procedures } })),
      appointments: appointments.map((a) => ({ status: a.status, serviceName: a.service?.name || a.reason || null })),
      consentsSigned,
      encounterFilter: ownEncounters ? new Set(ownEncounters.map((e) => e.id)) : undefined,
    });

    await this.prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: 'VIEW',
        entityType: 'AestheticIndicators',
        entityId: clinicId,
        metadata: { from, to, professionalId },
      },
    });

    return { ...result, professionals: professionals.map((p) => ({ id: p.id, name: p.fullName })) };
  }
}
