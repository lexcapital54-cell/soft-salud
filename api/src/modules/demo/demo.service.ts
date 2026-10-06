import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AppointmentStatus, CareModality, ClinicSpecialty, DashboardType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import { isCiConsentSpec } from '../clinical/consent-ci/ci-consent.types';
import { ConsentsService } from '../clinical/consents.service';
import { EncountersService } from '../clinical/encounters.service';
import { DemoSpecialtyKit, demoKit } from './demo-content';
import { demoSignatureDataUrl } from './demo-signature';

const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  [UserRole.ADMIN]: 'Profesional (administrador)',
  [UserRole.RECEPTIONIST]: 'Asistente administrativo',
};

/** Hora local de Bogotá (UTC-5, sin horario de verano) del día indicado. */
function bogotaAt(dayOffset: number, hour: number, minute = 0) {
  const now = new Date();
  const bogota = new Date(now.getTime() - 5 * 3600_000);
  return new Date(
    Date.UTC(bogota.getUTCFullYear(), bogota.getUTCMonth(), bogota.getUTCDate() + dayOffset, hour + 5, minute),
  );
}

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encounters: EncountersService,
    private readonly consents: ConsentsService,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
  ) {}

  async list(activeOnly = false) {
    const clinics = await this.prisma.clinic.findMany({
      where: { isDemo: true, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { createdAt: 'asc' },
      include: {
        users: {
          where: { role: { in: [UserRole.ADMIN, UserRole.RECEPTIONIST] } },
          orderBy: { role: 'asc' },
          select: { role: true, fullName: true, email: true, passwordReminder: true },
        },
      },
    });
    return Promise.all(clinics.map((c) => this.summary(c)));
  }

  async create(specialty: ClinicSpecialty) {
    const existing = await this.prisma.clinic.count({ where: { isDemo: true, specialty } });
    const kit = demoKit(specialty, existing + 1);
    const suffix = existing ? ` ${existing + 1}` : '';
    const slug = `${kit.slug}${existing ? existing + 1 : ''}`;

    const clinic = await this.prisma.clinic.create({
      data: {
        name: `Demo ${kit.label}${suffix}`,
        specialty,
        isDemo: true,
        dashboardType: DashboardType.CLINICAL_HISTORY_WITH_DOCS,
        address: 'Cra. 23 # 64-10, Manizales (dirección ficticia)',
        phone: '6068800000',
        nit: '900000000-0',
        habilitationCode: '170010000000',
      },
    });

    const professionalPassword = `Demo-${String(randomInt(1000, 10000))}`;
    const assistantPin = String(randomInt(1000, 10000));
    const professional = await this.prisma.user.create({
      data: {
        email: `demo.${slug}@habilisalud.demo`,
        passwordHash: await bcrypt.hash(professionalPassword, 10),
        passwordReminder: professionalPassword,
        fullName: kit.professional.fullName,
        professionalCard: kit.professional.card,
        professionalSignatureBase64: demoSignatureDataUrl(existing + 1),
        role: UserRole.ADMIN,
        clinicId: clinic.id,
        repsExpirationDate: bogotaAt(365, 0),
      },
    });
    await this.prisma.user.create({
      data: {
        email: `asistente.${slug}@habilisalud.demo`,
        passwordHash: await bcrypt.hash(assistantPin, 10),
        passwordReminder: assistantPin,
        fullName: 'Laura Asistente (demo)',
        role: UserRole.RECEPTIONIST,
        clinicId: clinic.id,
      },
    });

    await this.seedClinicalData(clinic.id, professional.id, kit);
    return (await this.list()).find((d) => d.id === clinic.id)!;
  }

  async setActive(id: string, isActive: boolean) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id, isDemo: true } });
    if (!clinic) throw new NotFoundException('Consultorio demo no encontrado');
    await this.prisma.$transaction([
      this.prisma.clinic.update({ where: { id }, data: { isActive } }),
      this.prisma.user.updateMany({ where: { clinicId: id }, data: { isActive } }),
    ]);
    return { id, isActive };
  }

  private async seedClinicalData(clinicId: string, professionalId: string, kit: DemoSpecialtyKit) {
    const user = await this.usersRepository.findOne({ where: { id: professionalId }, relations: { clinic: true } });
    if (!user) throw new NotFoundException('Profesional demo no encontrado');

    const slots = [
      { day: 0, hour: 8, status: AppointmentStatus.COMPLETED },
      { day: 0, hour: 9, minute: 30, status: AppointmentStatus.COMPLETED },
      { day: 0, hour: 11, status: AppointmentStatus.CONFIRMED },
      { day: 0, hour: 15, status: AppointmentStatus.SCHEDULED },
    ];

    const patientSignature = demoSignatureDataUrl(5);
    for (const [index, sample] of kit.patients.entries()) {
      const patient = await this.prisma.patient.create({
        data: {
          ...sample.patient,
          birthDate: new Date(`${sample.patient.birthDate}T12:00:00.000Z`),
          clinicId,
          notifyByEmail: false,
          notifyByWhatsapp: false,
          extras: (sample.patient.extras ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });

      let encounterId: string | null = null;
      if (sample.record) {
        try {
          const encounter = await this.encounters.create(user, {
            patientId: patient.id,
            modality: CareModality.IN_PERSON,
          } as never);
          encounterId = encounter.id as string;
          const record = {
            ...sample.record,
            content: {
              ...sample.record.content,
              consentDraft: { patientSignatureBase64: patientSignature, patientSignaturePending: false },
            },
          };
          await this.encounters.saveDraft(user, encounterId, record as never);
          await this.signConsent(user, patient, encounterId, patientSignature);
          await this.encounters.sign(user, encounterId, {} as never);
          if (sample.evolution) {
            await this.encounters.addEvolution(user, encounterId, sample.evolution as never);
          }
        } catch (error) {
          this.logger.error(
            `Demo ${kit.label}: no se pudo preparar la historia de ${sample.patient.firstName}`,
            error instanceof Error ? error.stack : String(error),
          );
          throw error;
        }
      }

      const slot = slots[index % slots.length];
      const startsAt = bogotaAt(slot.day, slot.hour, slot.minute ?? 0);
      await this.prisma.appointment.create({
        data: {
          clinicId,
          patientId: patient.id,
          professionalId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 45 * 60_000),
          status: encounterId ? slot.status : AppointmentStatus.CONFIRMED,
          modality: CareModality.IN_PERSON,
          requestDate: bogotaAt(-3, 10),
          reason: sample.reason,
          encounterId: encounterId && slot.status === AppointmentStatus.COMPLETED ? encounterId : null,
        },
      });
      const followUp = bogotaAt(7 + index, 10);
      await this.prisma.appointment.create({
        data: {
          clinicId,
          patientId: patient.id,
          professionalId,
          startsAt: followUp,
          endsAt: new Date(followUp.getTime() + 45 * 60_000),
          status: AppointmentStatus.SCHEDULED,
          modality: index % 2 ? CareModality.VIRTUAL : CareModality.IN_PERSON,
          requestDate: bogotaAt(0, 9),
          reason: 'Control',
        },
      });
    }
  }

  /** Consentimiento firmado de ejemplo; si la especialidad no tiene plantilla se omite. */
  private async signConsent(
    user: User,
    patient: { id: string; firstName: string; lastName: string; documentType: string | null; documentNumber: string | null; guardianFullName: string | null; guardianDocumentType: string | null; guardianDocumentNumber: string | null },
    encounterId: string,
    signature: string,
  ) {
    const templates = (await this.consents.listTemplates(user)).filter((t) => !isCiConsentSpec(t.bodyJson));
    const template =
      templates.find((t) => /INFORMED|PSI_ADULT/.test(t.code)) ?? templates.find((t) => t.code === 'HABEAS_DATA');
    if (!template) return;
    const guardian = patient.documentType === 'TI' && patient.guardianFullName;
    try {
      await this.consents.sign(
        user,
        {
          patientId: patient.id,
          encounterId,
          templateId: template.id,
          signerRole: guardian ? 'LEGAL_GUARDIAN' : 'PATIENT',
          signerName: guardian ? patient.guardianFullName : `${patient.firstName} ${patient.lastName}`,
          signerDocumentType: guardian ? patient.guardianDocumentType : patient.documentType,
          signerDocument: guardian ? patient.guardianDocumentNumber : patient.documentNumber,
          signatureBase64: signature,
        } as never,
        { ipAddress: 'demo', userAgent: 'HabiliSALUD demo' },
      );
    } catch (error) {
      this.logger.warn(`Demo: consentimiento omitido (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  private async summary(
    clinic: Prisma.ClinicGetPayload<{
      include: { users: { select: { role: true; fullName: true; email: true; passwordReminder: true } } };
    }>,
  ) {
    const [patients, signedRecords, appointmentsToday] = await Promise.all([
      this.prisma.patient.count({ where: { clinicId: clinic.id } }),
      this.prisma.clinicalRecord.count({ where: { status: 'SIGNED', encounter: { clinicId: clinic.id } } }),
      this.prisma.appointment.count({
        where: { clinicId: clinic.id, startsAt: { gte: bogotaAt(0, 0), lt: bogotaAt(1, 0) } },
      }),
    ]);
    return {
      id: clinic.id,
      name: clinic.name,
      specialty: clinic.specialty,
      isActive: clinic.isActive,
      createdAt: clinic.createdAt,
      patients,
      signedRecords,
      appointmentsToday,
      users: clinic.users.map((u) => ({
        role: u.role,
        roleLabel: ROLE_LABELS[u.role] ?? u.role,
        fullName: u.fullName,
        email: u.email,
        password: u.passwordReminder,
      })),
    };
  }
}
