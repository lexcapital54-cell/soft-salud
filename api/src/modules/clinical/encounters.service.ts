import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CareModality,
  ClinicSpecialty,
  EncounterStatus,
  Prisma,
} from '@prisma/client';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';
import { HCE_PSI_SCHEMA } from './form-template.definitions';
import { FormTemplatesService } from './form-templates.service';
import {
  CreateEncounterDto,
  SaveClinicalRecordDto,
} from './dto/clinical.dto';

const encounterInclude = {
  patient: true,
  professional: true,
  clinicalRecord: true,
  diagnoses: true,
  procedures: true,
  consents: true,
} satisfies Prisma.EncounterInclude;

type EncounterWithRelations = Prisma.EncounterGetPayload<{
  include: typeof encounterInclude;
}>;

@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formTemplates: FormTemplatesService,
  ) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  async list(user: User) {
    const clinicId = this.requireClinicId(user);
    return this.prisma.encounter.findMany({
      where: { clinicId },
      include: {
        patient: true,
        clinicalRecord: { select: { id: true, status: true, updatedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  async getOne(user: User, id: string) {
    const clinicId = this.requireClinicId(user);
    const encounter = await this.prisma.encounter.findFirst({
      where: { id, clinicId },
      include: encounterInclude,
    });
    if (!encounter) {
      throw new NotFoundException('Encuentro no encontrado');
    }
    return this.serializeEncounter(encounter);
  }

  async create(user: User, dto: CreateEncounterDto) {
    const clinicId = this.requireClinicId(user);
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) {
      throw new NotFoundException('Consultorio no encontrado');
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const template = await this.formTemplates.ensureForSpecialty(
      clinic.specialty as ClinicSpecialty,
      clinicId,
    );

    const year = new Date().getFullYear();
    const count = await this.prisma.encounter.count({ where: { clinicId } });
    const prefix =
      clinic.specialty === 'PSYCHOLOGY'
        ? 'HC-PSI'
        : clinic.specialty === 'DENTISTRY'
          ? 'HC-ODO'
          : clinic.specialty === 'MEDICINE'
            ? 'HC-MED'
            : 'HC-AES';
    const externalCode = `${prefix}-${year}-${String(count + 1).padStart(6, '0')}`;

    const defaultContent = structuredClone(
      HCE_PSI_SCHEMA.contentDefaults,
    ) as Prisma.InputJsonValue;

    const encounter = await this.prisma.encounter.create({
      data: {
        clinicId,
        patientId: patient.id,
        professionalId: user.id,
        externalCode,
        status: EncounterStatus.IN_PROGRESS,
        modality: dto.modality ?? CareModality.IN_PERSON,
        serviceType: dto.serviceType ?? 'Consulta externa',
        location: dto.location ?? 'Consultorio 1',
        purpose: dto.purpose ?? 'Evaluación',
        externalCause: dto.externalCause,
        startedAt: new Date(),
        clinicalRecord: {
          create: {
            templateId: template.id,
            authorId: user.id,
            status: 'DRAFT',
            content: defaultContent,
          },
        },
        consents: {
          create: [
            { consentType: 'INFORMED', granted: false },
            { consentType: 'DATA_PROCESSING', granted: false },
          ],
        },
      },
      include: encounterInclude,
    });

    return this.serializeEncounter(encounter);
  }

  async saveDraft(user: User, encounterId: string, dto: SaveClinicalRecordDto) {
    const clinicId = this.requireClinicId(user);
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId },
      include: { clinicalRecord: true },
    });
    if (!encounter || !encounter.clinicalRecord) {
      throw new NotFoundException('Encuentro o HCE no encontrada');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.encounter.update({
        where: { id: encounterId },
        data: {
          modality: dto.modality ?? encounter.modality,
          serviceType: dto.serviceType ?? encounter.serviceType,
          location: dto.location ?? encounter.location,
          purpose: dto.purpose ?? encounter.purpose,
          externalCause:
            dto.externalCause !== undefined
              ? dto.externalCause
              : encounter.externalCause,
        },
      });

      await tx.clinicalRecord.update({
        where: { id: encounter.clinicalRecord!.id },
        data: {
          content: dto.content as Prisma.InputJsonValue,
          status: 'DRAFT',
        },
      });

      if (dto.diagnoses) {
        await tx.diagnosis.deleteMany({ where: { encounterId } });
        if (dto.diagnoses.length) {
          await tx.diagnosis.createMany({
            data: dto.diagnoses.map((d) => ({
              encounterId,
              cieCode: d.cieCode,
              description: d.description,
              type: d.type ?? 'IMPRESSION',
            })),
          });
        }
      }

      if (dto.procedures) {
        await tx.clinicalProcedure.deleteMany({ where: { encounterId } });
        if (dto.procedures.length) {
          await tx.clinicalProcedure.createMany({
            data: dto.procedures.map((p) => ({
              encounterId,
              cupsCode: p.cupsCode,
              description: p.description,
            })),
          });
        }
      }

      if (dto.consents) {
        for (const c of dto.consents) {
          const existing = await tx.consent.findFirst({
            where: { encounterId, consentType: c.consentType },
          });
          if (existing) {
            await tx.consent.update({
              where: { id: existing.id },
              data: {
                granted: c.granted,
                grantedAt: c.granted
                  ? c.grantedAt
                    ? new Date(c.grantedAt)
                    : new Date()
                  : null,
              },
            });
          } else {
            await tx.consent.create({
              data: {
                encounterId,
                consentType: c.consentType,
                granted: c.granted,
                grantedAt: c.granted
                  ? c.grantedAt
                    ? new Date(c.grantedAt)
                    : new Date()
                  : null,
              },
            });
          }
        }
      }

      await tx.auditLog.create({
        data: {
          clinicId,
          userId: user.id,
          action: 'UPDATE',
          entityType: 'ClinicalRecord',
          entityId: encounter.clinicalRecord!.id,
          metadata: { encounterId },
        },
      });
    });

    return this.getOne(user, encounterId);
  }

  private serializeEncounter(encounter: EncounterWithRelations) {
    return {
      ...encounter,
      professional: {
        id: encounter.professional.id,
        fullName: encounter.professional.fullName,
        email: encounter.professional.email,
        professionalCard: encounter.professional.professionalCard,
      },
    };
  }
}
