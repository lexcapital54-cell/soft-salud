import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CareModality,
  ClinicalNoteFormat,
  ClinicSpecialty,
  EncounterStatus,
  Prisma,
  VisitType,
} from '@prisma/client';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';
import {
  HCE_PSI_SCHEMA,
  SOAP_CONTENT_DEFAULTS,
} from './form-template.definitions';
import { FormTemplatesService } from './form-templates.service';
import { ListEncountersQueryDto } from './dto/clinical.dto';
import { missingProfileFields } from './patient-profile';
import { ProfessionalSignatureService } from './professional-signature.service';
import {
  CreateEncounterDto,
  CreateEvolutionDto,
  SaveClinicalRecordDto,
  SignClinicalRecordDto,
} from './dto/clinical.dto';

const encounterInclude = {
  patient: true,
  professional: true,
  clinicalRecord: {
    include: {
      evolutions: {
        orderBy: { signedAt: 'asc' as const },
        include: {
          author: {
            select: { id: true, fullName: true, professionalCard: true },
          },
        },
      },
    },
  },
  diagnoses: true,
  procedures: true,
  consents: true,
  attachments: { orderBy: { createdAt: 'desc' as const } },
  incapacities: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.EncounterInclude;

type EncounterWithRelations = Prisma.EncounterGetPayload<{
  include: typeof encounterInclude;
}>;

@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formTemplates: FormTemplatesService,
    private readonly signatures: ProfessionalSignatureService,
  ) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  /**
   * Listado para el calendario de historias por fecha. Sin rango devuelve las
   * últimas atenciones; con rango, todas las del mes consultado.
   */
  async list(user: User, query: ListEncountersQueryDto = {}) {
    const clinicId = this.requireClinicId(user);
    const range =
      query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00`) } : {}),
              ...(query.to ? { lt: this.nextDay(query.to) } : {}),
            },
          }
        : {};

    return this.prisma.encounter.findMany({
      where: {
        clinicId,
        ...(query.patientId ? { patientId: query.patientId } : {}),
        ...range,
      },
      include: {
        patient: true,
        clinicalRecord: {
          select: {
            id: true,
            status: true,
            updatedAt: true,
            noteFormat: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.from || query.to ? 500 : 30,
    });
  }

  private nextDay(date: string) {
    const at = new Date(`${date}T00:00:00`);
    at.setDate(at.getDate() + 1);
    return at;
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
    return this.serializeEncounter(encounter, user);
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

    // Res. 1995: la historia clínica es única por paciente. Si ya existe se
    // abre esa misma; las atenciones siguientes se anotan como evoluciones.
    const existing = await this.forPatient(user, patient.id);
    if (existing) return existing;

    const data = await this.buildDraftData({
      clinicId,
      clinicSpecialty: clinic.specialty as ClinicSpecialty,
      patientId: patient.id,
      professionalId: user.id,
      authorId: user.id,
      modality: dto.modality,
      serviceType: dto.serviceType,
      location: dto.location,
      purpose: dto.purpose,
      externalCause: dto.externalCause,
    });

    const encounter = await this.prisma.encounter.create({
      data,
      include: encounterInclude,
    });

    return this.serializeEncounter(encounter, user);
  }

  /**
   * Atención que sostiene la historia clínica del paciente: el borrador en
   * curso o, si ya se firmó, la historia sellada sobre la que se anotan las
   * evoluciones. Devuelve `null` si el paciente todavía no tiene historia.
   */
  async forPatient(user: User, patientId: string) {
    const clinicId = this.requireClinicId(user);
    const encounter = await this.prisma.encounter.findFirst({
      where: { patientId, clinicId, clinicalRecord: { isNot: null } },
      include: encounterInclude,
      orderBy: { createdAt: 'asc' },
    });
    return encounter ? this.serializeEncounter(encounter, user) : null;
  }

  /**
   * Arma el borrador de HCE (visitType/SOAP, plantilla, código externo) sin persistirlo.
   * Lo comparten la apertura manual de atención y el trigger desde la agenda del día.
   */
  async buildDraftData(params: {
    clinicId: string;
    clinicSpecialty: ClinicSpecialty;
    patientId: string;
    professionalId: string;
    authorId: string;
    modality?: CareModality | null;
    serviceType?: string | null;
    location?: string | null;
    purpose?: string | null;
    externalCause?: string | null;
  }): Promise<Prisma.EncounterUncheckedCreateInput> {
    const { clinicId, clinicSpecialty: specialty, patientId } = params;

    const template = await this.formTemplates.ensureForSpecialty(
      specialty,
      clinicId,
    );

    const priorFinished = await this.prisma.encounter.count({
      where: {
        patientId,
        status: EncounterStatus.FINISHED,
        OR: [
          { specialtySnapshot: specialty },
          { clinicId, specialtySnapshot: null },
        ],
      },
    });

    const visitType =
      priorFinished >= 1 ? VisitType.FOLLOW_UP : VisitType.INITIAL;
    const noteFormat =
      visitType === VisitType.FOLLOW_UP
        ? ClinicalNoteFormat.SOAP
        : ClinicalNoteFormat.FULL;
    const visitTypeReason =
      visitType === VisitType.FOLLOW_UP
        ? 'PRIOR_FINISHED_SAME_SPECIALTY'
        : 'FIRST_FOR_SPECIALTY';

    const year = new Date().getFullYear();
    const count = await this.prisma.encounter.count({ where: { clinicId } });
    const prefix =
      specialty === 'PSYCHOLOGY'
        ? 'HC-PSI'
        : specialty === 'DENTISTRY'
          ? 'HC-ODO'
          : specialty === 'MEDICINE'
            ? 'HC-MED'
            : 'HC-AES';
    const externalCode = `${prefix}-${year}-${String(count + 1).padStart(6, '0')}`;

    // La historia es única por paciente: la atención de control se registra
    // como encuentro (queda su trazabilidad) pero no abre un segundo documento.
    const hasRecord = await this.prisma.clinicalRecord.count({
      where: { encounter: { patientId, clinicId } },
    });

    const defaultContent = structuredClone(
      noteFormat === ClinicalNoteFormat.SOAP
        ? SOAP_CONTENT_DEFAULTS
        : HCE_PSI_SCHEMA.contentDefaults,
    ) as Prisma.InputJsonValue;

    return {
      clinicId,
      patientId,
      professionalId: params.professionalId,
      externalCode,
      status: EncounterStatus.IN_PROGRESS,
      modality: params.modality ?? CareModality.IN_PERSON,
      serviceType: params.serviceType ?? null,
      location: params.location ?? null,
      purpose: params.purpose ?? null,
      externalCause: params.externalCause ?? undefined,
      startedAt: new Date(),
      visitType,
      visitTypeReason,
      specialtySnapshot: specialty,
      ...(hasRecord
        ? {}
        : {
            clinicalRecord: {
              create: {
                templateId: template.id,
                authorId: params.authorId,
                status: 'DRAFT' as const,
                noteFormat,
                content: defaultContent,
              },
            },
          }),
      consents: {
        create: [
          { consentType: 'INFORMED', granted: false },
          { consentType: 'DATA_PROCESSING', granted: false },
        ],
      },
    };
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
    if (encounter.clinicalRecord.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'RECORD_LOCKED',
        message:
          'La historia clínica ya está firmada y sellada. Registre una adenda para corregir o ampliar.',
      });
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
          ...(dto.noteFormat ? { noteFormat: dto.noteFormat } : {}),
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
          const existing = await tx.clinicalConsent.findFirst({
            where: { encounterId, consentType: c.consentType },
          });
          if (existing) {
            await tx.clinicalConsent.update({
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
            await tx.clinicalConsent.create({
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

  /**
   * Firma y sella la HCE: estampa la firma manuscrita, calcula la huella SHA-256
   * del contenido y deja el registro inmutable (Ley 527 de 1999 / Res. 1995 de 1999).
   */
  async sign(user: User, encounterId: string, dto: SignClinicalRecordDto) {
    const clinicId = this.requireClinicId(user);
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId },
      include: {
        clinicalRecord: true,
        diagnoses: true,
        procedures: true,
        patient: true,
      },
    });
    if (!encounter || !encounter.clinicalRecord) {
      throw new NotFoundException('Encuentro o HCE no encontrada');
    }

    // Res. 1995: la historia no puede sellarse sobre una ficha provisional.
    const missing = missingProfileFields(encounter.patient);
    if (missing.length) {
      throw new BadRequestException(
        `Complete la ficha del paciente antes de firmar: ${missing.join(', ')}.`,
      );
    }

    const record = encounter.clinicalRecord;
    if (record.status !== 'DRAFT') {
      throw new ConflictException('La historia clínica ya fue firmada y sellada.');
    }
    if (user.role !== UserRole.ADMIN && encounter.professionalId !== user.id) {
      throw new ForbiddenException(
        'Solo el profesional tratante puede firmar esta historia clínica.',
      );
    }

    const content = { ...((record.content as Record<string, unknown>) ?? {}) };
    this.assertSignable(content, record.noteFormat);

    const signatureBase64 = await this.signatures.resolve(
      user,
      dto.signatureBase64,
    );
    const signedAt = new Date();

    // La huella se calcula sobre el cuerpo clínico, sin la imagen de la firma,
    // para poder reverificarla luego sin depender del trazo.
    const clinicalBody = { ...content };
    delete clinicalBody.signature;
    const contentHash = this.signatures.hash([
      record.id,
      encounter.id,
      encounter.patientId,
      JSON.stringify(clinicalBody),
      encounter.diagnoses.map((d) => `${d.cieCode}:${d.type}`).join(','),
      encounter.procedures.map((p) => p.cupsCode).join(','),
      user.id,
      signedAt.toISOString(),
    ]);
    const verificationCode = this.signatures.verificationCode('HCE', contentHash);

    content.signature = {
      professionalName: user.fullName,
      professionalCard: user.professionalCard || '',
      signatureBase64,
      signedAt: signedAt.toISOString(),
      verificationCode,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalRecord.update({
        where: { id: record.id },
        data: {
          content: content as Prisma.InputJsonValue,
          status: 'SIGNED',
          contentHash,
          verificationCode,
          signedAt,
          lockedAt: signedAt,
          lockReason: 'Firmada por el profesional tratante (Ley 527 de 1999)',
        },
      });

      await tx.encounter.update({
        where: { id: encounter.id },
        data: { status: EncounterStatus.FINISHED, endedAt: signedAt },
      });

      await tx.auditLog.create({
        data: {
          clinicId,
          userId: user.id,
          action: 'SIGN',
          entityType: 'ClinicalRecord',
          entityId: record.id,
          metadata: { encounterId, contentHash, verificationCode },
        },
      });
    });

    return this.getOne(user, encounterId);
  }

  /**
   * Adenda sobre una HCE ya sellada: la nota original nunca se altera,
   * las correcciones se apilan como registros inmutables.
   */
  async addEvolution(
    user: User,
    encounterId: string,
    dto: CreateEvolutionDto,
  ) {
    const clinicId = this.requireClinicId(user);
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId },
      include: { clinicalRecord: true },
    });
    if (!encounter || !encounter.clinicalRecord) {
      throw new NotFoundException('Encuentro o HCE no encontrada');
    }

    const record = encounter.clinicalRecord;
    if (record.status === 'DRAFT') {
      throw new BadRequestException(
        'La historia aún es un borrador: edítela y guárdela en lugar de crear una adenda.',
      );
    }

    const signatureBase64 = await this.signatures.resolve(
      user,
      dto.signatureBase64,
    );
    const signedAt = new Date();
    const note = dto.note.trim();
    const reason = dto.reason?.trim() || 'Adenda / nota aclaratoria';

    const contentHash = this.signatures.hash([
      record.id,
      record.contentHash,
      reason,
      note,
      user.id,
      signedAt.toISOString(),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalEvolution.create({
        data: {
          clinicalRecordId: record.id,
          authorId: user.id,
          content: {
            note,
            reason,
            professionalName: user.fullName,
            professionalCard: user.professionalCard || '',
            signatureBase64,
            verificationCode: this.signatures.verificationCode(
              'ADE',
              contentHash,
            ),
          },
          contentHash,
          signedAt,
        },
      });

      await tx.auditLog.create({
        data: {
          clinicId,
          userId: user.id,
          action: 'SIGN',
          entityType: 'ClinicalEvolution',
          entityId: record.id,
          metadata: { encounterId, contentHash, reason },
        },
      });
    });

    return this.getOne(user, encounterId);
  }

  /** Evita sellar una historia en blanco. */
  private assertSignable(
    content: Record<string, unknown>,
    noteFormat: ClinicalNoteFormat,
  ) {
    const text = (value: unknown) =>
      typeof value === 'string' ? value.trim() : '';

    if (noteFormat === ClinicalNoteFormat.SOAP) {
      const soap = (content.soap ?? {}) as Record<string, unknown>;
      const filled = ['subjective', 'objective', 'assessment', 'plan'].some(
        (key) => text(soap[key]),
      );
      if (!filled) {
        throw new BadRequestException(
          'Diligencie al menos un campo de la nota SOAP antes de firmar.',
        );
      }
      return;
    }

    const care = (content.careMinimum ?? {}) as Record<string, unknown>;
    const assessment = (content.assessment ?? {}) as Record<string, unknown>;
    if (!text(care.motive) && !text(assessment.impressionNarrative)) {
      throw new BadRequestException(
        'Registre al menos el motivo de consulta o la impresión diagnóstica antes de firmar.',
      );
    }
  }

  private serializeEncounter(
    encounter: EncounterWithRelations,
    user?: User,
  ) {
    const base = {
      ...encounter,
      professional: {
        id: encounter.professional.id,
        fullName: encounter.professional.fullName,
        email: encounter.professional.email,
        professionalCard: encounter.professional.professionalCard,
      },
    };

    // Auditor: metadatos sí; cuerpo clínico / SOAP / examen mental no
    if (user?.role === UserRole.AUDITOR && base.clinicalRecord) {
      const content = base.clinicalRecord.content as Record<string, unknown> | null;
      const redacted: Record<string, unknown> = {
        profile: content?.profile ?? null,
        signature: content?.signature ?? {},
        _redacted: true,
      };
      return {
        ...base,
        clinicalRecord: {
          ...base.clinicalRecord,
          content: redacted,
          evolutions: base.clinicalRecord.evolutions.map((evolution) => ({
            ...evolution,
            content: { _redacted: true },
          })),
        },
      };
    }

    return base;
  }
}
