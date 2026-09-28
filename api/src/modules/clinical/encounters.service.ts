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
  SOAP_CONTENT_DEFAULTS,
  contentDefaultsForSpecialty,
  externalCodePrefixForSpecialty,
} from './form-template.definitions';
import { FormTemplatesService } from './form-templates.service';
import { ListEncountersQueryDto } from './dto/clinical.dto';
import { missingProfileFields } from './patient-profile';
import { ProfessionalSignatureService } from './professional-signature.service';
import { RdaExportService } from './rda-export.service';
import {
  ORTHO_PLAN_AUDIT_ENTITY,
  OrthoHistoryEntry,
  OrthoPlanChange,
  coalesceOrthoHistory,
  diffOrthoPlan,
} from './ortho-plan-audit';
import { OrthoControlCups, orthoControlCupsCodes } from './ortho-control-procedures';
import {
  EVOLUTION_AMEND_LABELS,
  EVOLUTION_CORRECTION_WINDOW_MS,
  EvolutionAmendment,
} from './evolution-amendments';
import { CatalogsService } from './catalogs.service';
import {
  CreateEncounterDto,
  CreateEvolutionDto,
  OrthoControlDto,
  SaveClinicalRecordDto,
  SignClinicalRecordDto,
  UpdateAttendanceMetaDto,
  UpdateDiagnosesDto,
  UpdateProceduresDto,
} from './dto/clinical.dto';

const encounterInclude = {
  patient: true,
  professional: true,
  clinicalRecord: {
    include: {
      evolutions: {
        orderBy: [
          { clinicalAttentionDate: 'asc' as const },
          { signedAt: 'asc' as const },
        ],
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
  patientConsents: {
    orderBy: { signedAt: 'desc' as const },
    take: 1,
    select: { signatureBase64: true, signedAt: true },
  },
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
    private readonly rdaExport: RdaExportService,
    private readonly catalogs: CatalogsService,
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
      take: query.from || query.to ? 500 : 200,
    });
  }

  /**
   * HCE en borrador sin cerrar (alertas al profesional).
   * `Encounter.createdAt` es la fecha de apertura inmutable.
   */
  async listOpen(user: User) {
    const clinicId = this.requireClinicId(user);
    const onlyMine = user.role === UserRole.HEALTH_PROFESSIONAL;

    const rows = await this.prisma.encounter.findMany({
      where: {
        clinicId,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
        ...(onlyMine ? { professionalId: user.id } : {}),
        clinicalRecord: { status: 'DRAFT' },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            secondLastName: true,
            documentType: true,
            documentNumber: true,
          },
        },
        professional: { select: { id: true, fullName: true } },
        clinicalRecord: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const now = Date.now();
    return rows.map((row) => {
      const createdAt = row.createdAt;
      const daysOpen = Math.max(
        0,
        Math.floor((now - createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      );
      const patientName = [
        row.patient.firstName,
        row.patient.lastName,
        row.patient.secondLastName,
      ]
        .filter(Boolean)
        .join(' ');
      return {
        encounterId: row.id,
        patientId: row.patient.id,
        patientName,
        documentType: row.patient.documentType,
        documentNumber: row.patient.documentNumber,
        professionalName: row.professional.fullName,
        encounterStatus: row.status,
        clinicalRecordStatus: row.clinicalRecord?.status ?? 'DRAFT',
        /** Fecha de apertura inmutable (no cambia al firmar días después). */
        createdAt: createdAt.toISOString(),
        clinicalRecordCreatedAt:
          row.clinicalRecord?.createdAt.toISOString() ?? createdAt.toISOString(),
        updatedAt: row.clinicalRecord?.updatedAt.toISOString() ?? null,
        daysOpen,
      };
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
    // Controles de agenda pueden crear un encuentro sin HCE (historia única).
    // Al abrirlo devolvemos la historia clínica real del paciente con todo el
    // contenido ya guardado / sellado, para que no se vea un SOAP vacío.
    if (!encounter.clinicalRecord) {
      const withRecord = await this.prisma.encounter.findFirst({
        where: {
          patientId: encounter.patientId,
          clinicId,
          clinicalRecord: { isNot: null },
        },
        include: encounterInclude,
        orderBy: { createdAt: 'asc' },
      });
      if (withRecord) {
        return this.serializeEncounter(withRecord, user);
      }
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

  /** «Situación actual» de la última evolución del paciente, para pre-llenar la siguiente. */
  async lastCurrentSituation(user: User, patientId: string) {
    const clinicId = this.requireClinicId(user);
    const last = await this.prisma.clinicalEvolution.findFirst({
      where: { clinicalRecord: { encounter: { patientId, clinicId } } },
      orderBy: [{ clinicalAttentionDate: 'desc' }, { signedAt: 'desc' }],
      select: { id: true, content: true, clinicalAttentionDate: true, signedAt: true },
    });
    if (!last) return { currentSituation: '', evolutionId: null, clinicalAttentionDate: null };
    const content = (last.content ?? {}) as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    // Evoluciones anteriores guardaban la situación en «Motivo del control» (reason).
    const legacyReason = text(content.reason);
    const genericReasons = new Set([
      'Control / nota de evolución',
      'Adenda / nota aclaratoria',
      'Nota de evolución',
    ]);
    return {
      currentSituation:
        text(content.currentSituation) ||
        (genericReasons.has(legacyReason) ? '' : legacyReason),
      evolutionId: last.id,
      clinicalAttentionDate: (last.clinicalAttentionDate ?? last.signedAt).toISOString(),
    };
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

    // Consecutivo propio de cada profesional (no se mezcla entre Dras/sedes).
    const externalCode = await this.nextExternalCode({
      specialty,
      professionalId: params.professionalId,
    });

    // La historia es única por paciente: la atención de control se registra
    // como encuentro (queda su trazabilidad) pero no abre un segundo documento.
    const hasRecord = await this.prisma.clinicalRecord.count({
      where: { encounter: { patientId, clinicId } },
    });

    const documentedAt = new Date().toISOString();
    const defaultContent = {
      ...(structuredClone(
        noteFormat === ClinicalNoteFormat.SOAP
          ? SOAP_CONTENT_DEFAULTS
          : contentDefaultsForSpecialty(specialty),
      ) as Record<string, unknown>),
      // Fecha de digitación: se fija al abrir el borrador y no cambia al sellar.
      documentedAt,
    } as Prisma.InputJsonValue;

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

  /**
   * Consecutivo HCE por profesional + año.
   * Formato: HC-PSI-NAU-2026-000001 (cada Dra tiene su propia serie).
   */
  private async nextExternalCode(params: {
    specialty: ClinicSpecialty;
    professionalId: string;
  }) {
    const year = new Date().getFullYear();
    const prefix = externalCodePrefixForSpecialty(params.specialty);

    const professional = await this.prisma.user.findUnique({
      where: { id: params.professionalId },
      select: { fullName: true },
    });
    const initials = this.professionalInitials(professional?.fullName || 'PROF');
    const seriesPrefix = `${prefix}-${initials}-${year}-`;

    const latest = await this.prisma.encounter.findFirst({
      where: {
        professionalId: params.professionalId,
        externalCode: { startsWith: seriesPrefix },
      },
      orderBy: { externalCode: 'desc' },
      select: { externalCode: true },
    });

    let next = 1;
    if (latest?.externalCode) {
      const tail = latest.externalCode.slice(seriesPrefix.length);
      const parsed = Number.parseInt(tail, 10);
      if (Number.isFinite(parsed) && parsed >= 0) next = parsed + 1;
    }

    return `${seriesPrefix}${String(next).padStart(6, '0')}`;
  }

  /** Iniciales estables para el consecutivo (p. ej. "Natalia Angel Usuga" → NAU). */
  private professionalInitials(fullName: string) {
    const parts = fullName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return 'PROF';
    if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase().padEnd(3, 'X');
    return parts
      .slice(0, 3)
      .map((p) => p[0]!.toUpperCase())
      .join('');
  }

  /**
   * Congela la fecha de digitación: si el cliente envía una fecha anterior
   * (p. ej. borrador recuperado), se respeta; si no hay ninguna, se usa la de apertura.
   * Nunca se actualiza al firmar/guardar de nuevo.
   */
  private preserveDocumentedAt(
    existingContent: Record<string, unknown> | null | undefined,
    incomingContent: Record<string, unknown>,
    fallbackIso: string,
  ) {
    const existing = this.parseIsoDate(existingContent?.documentedAt);
    const incoming = this.parseIsoDate(incomingContent.documentedAt);
    const candidates = [existing, incoming].filter((d): d is Date => !!d);
    const chosen =
      candidates.length > 0
        ? new Date(Math.min(...candidates.map((d) => d.getTime())))
        : new Date(fallbackIso);
    return {
      ...incomingContent,
      documentedAt: chosen.toISOString(),
    };
  }

  /**
   * El sellado de un consentimiento escribe la firma del paciente directo en BD;
   * un autoguardado con contenido del navegador sin esa imagen no debe borrarla.
   */
  private preserveSignatures(
    existingContent: Record<string, unknown>,
    incoming: Record<string, unknown>,
  ) {
    const result = { ...incoming };
    const oldDraft = (existingContent.consentDraft ?? {}) as Record<string, unknown>;
    const newDraft = (incoming.consentDraft ?? {}) as Record<string, unknown>;
    if (oldDraft.patientSignatureBase64 && !newDraft.patientSignatureBase64) {
      result.consentDraft = {
        ...newDraft,
        patientSignatureBase64: oldDraft.patientSignatureBase64,
        patientSignaturePending: false,
      };
    }
    const oldSig = (existingContent.signature ?? {}) as Record<string, unknown>;
    const newSig = (incoming.signature ?? {}) as Record<string, unknown>;
    if (oldSig.signatureBase64 && !newSig.signatureBase64) {
      result.signature = { ...newSig, signatureBase64: oldSig.signatureBase64 };
    }
    return result;
  }

  private parseIsoDate(value: unknown): Date | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /**
   * Fecha de digitación y modalidad se pueden corregir aun con la HC sellada:
   * no alteran el texto clínico y cada cambio queda en auditoría.
   */
  async updateAttendanceMeta(
    user: User,
    encounterId: string,
    dto: UpdateAttendanceMetaDto,
  ) {
    const clinicId = this.requireClinicId(user);
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId },
      include: { clinicalRecord: true },
    });
    if (!encounter || !encounter.clinicalRecord) {
      throw new NotFoundException('Encuentro o HCE no encontrada');
    }
    if (user.role !== UserRole.ADMIN && encounter.professionalId !== user.id) {
      throw new ForbiddenException(
        'Solo el profesional tratante puede corregir los datos de la atención.',
      );
    }

    const content = {
      ...((encounter.clinicalRecord.content as Record<string, unknown> | null) ?? {}),
    };
    const previous = {
      modality: encounter.modality,
      documentedAt: (content.documentedAt as string | undefined) ?? null,
    };

    let documentedAt: string | undefined;
    if (dto.documentedAt) {
      const parsed = new Date(dto.documentedAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Fecha de digitación inválida.');
      }
      if (parsed.getTime() > Date.now() + 5 * 60 * 1000) {
        throw new BadRequestException('La fecha de digitación no puede ser futura.');
      }
      documentedAt = parsed.toISOString();
      content.documentedAt = documentedAt;
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.modality && dto.modality !== encounter.modality) {
        await tx.encounter.update({
          where: { id: encounterId },
          data: { modality: dto.modality },
        });
      }
      if (documentedAt) {
        await tx.clinicalRecord.update({
          where: { id: encounter.clinicalRecord!.id },
          data: { content: content as Prisma.InputJsonValue },
        });
      }
      await tx.auditLog.create({
        data: {
          clinicId,
          userId: user.id,
          action: 'UPDATE',
          entityType: 'EncounterAttendanceMeta',
          entityId: encounterId,
          metadata: {
            recordStatus: encounter.clinicalRecord!.status,
            previous,
            next: {
              modality: dto.modality ?? encounter.modality,
              documentedAt: documentedAt ?? previous.documentedAt,
            },
          },
        },
      });
    });

    return this.getOne(user, encounterId);
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

    const existingContent =
      (encounter.clinicalRecord.content as Record<string, unknown> | null) ?? {};
    const incomingContent = (dto.content ?? {}) as Record<string, unknown>;
    const contentToSave = this.preserveSignatures(
      existingContent,
      this.preserveDocumentedAt(
        existingContent,
        incomingContent,
        encounter.createdAt.toISOString(),
      ),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.encounter.update({
        where: { id: encounterId },
        data: {
          // No tocar createdAt / startedAt: la fecha de digitación queda fija.
          modality: dto.modality ?? encounter.modality,
          serviceType: dto.serviceType ?? encounter.serviceType,
          location: dto.location ?? encounter.location,
          purpose: dto.purpose ?? encounter.purpose,
          externalCause:
            dto.externalCause !== undefined
              ? dto.externalCause
              : encounter.externalCause,
          ...(dto.generateRips !== undefined
            ? { generateRips: dto.generateRips }
            : {}),
        },
      });

      await tx.clinicalRecord.update({
        where: { id: encounter.clinicalRecord!.id },
        data: {
          content: contentToSave as Prisma.InputJsonValue,
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
          metadata: { encounterId, autosave: dto.autosave === true },
        },
      });

      const orthoChanges = diffOrthoPlan(existingContent, contentToSave);
      if (orthoChanges.length) {
        await tx.auditLog.create({
          data: {
            clinicId,
            userId: user.id,
            action: 'UPDATE',
            entityType: ORTHO_PLAN_AUDIT_ENTITY,
            entityId: encounter.patientId,
            metadata: {
              encounterId,
              clinicalRecordId: encounter.clinicalRecord!.id,
              changes: orthoChanges,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
    });

    // Bitácora de autoguardado fuera de la TX principal: si falla el log,
    // el borrador clínico ya quedó persistido.
    if (dto.autosave) {
      try {
        const contentHash = this.signatures.hash([JSON.stringify(contentToSave)]);
        await this.prisma.clinicalRecordDraftLog.create({
          data: {
            clinicalRecordId: encounter.clinicalRecord.id,
            savedById: user.id,
            contentHash,
          },
        });
      } catch {
        // No bloquear el guardado clínico por fallos de auditoría.
      }
    }

    return this.getOne(user, encounterId);
  }

  /** CIE-10 editable aunque la HC ya esté sellada (no altera fecha de digitación ni huella). */
  async updateDiagnoses(
    user: User,
    encounterId: string,
    dto: UpdateDiagnosesDto,
  ) {
    const clinicId = this.requireClinicId(user);
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId },
      include: { clinicalRecord: true },
    });
    if (!encounter || !encounter.clinicalRecord) {
      throw new NotFoundException('Encuentro o HCE no encontrada');
    }
    if (user.role !== UserRole.ADMIN && encounter.professionalId !== user.id) {
      throw new ForbiddenException(
        'Solo el profesional tratante puede actualizar los diagnósticos CIE-10.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.diagnosis.deleteMany({ where: { encounterId } });
      if (dto.diagnoses.length) {
        await tx.diagnosis.createMany({
          data: dto.diagnoses.map((d) => ({
            encounterId,
            cieCode: d.cieCode.trim(),
            description: d.description.trim(),
            type: d.type ?? 'IMPRESSION',
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          clinicId,
          userId: user.id,
          action: 'UPDATE',
          entityType: 'ClinicalRecord',
          entityId: encounter.clinicalRecord!.id,
          metadata: {
            kind: 'UPDATE_DIAGNOSES',
            encounterId,
            recordStatus: encounter.clinicalRecord!.status,
            count: dto.diagnoses.length,
          },
        },
      });
    });

    return this.getOne(user, encounterId);
  }

  /** CUPS editable aunque la HC ya esté sellada. */
  async updateProcedures(
    user: User,
    encounterId: string,
    dto: UpdateProceduresDto,
  ) {
    const clinicId = this.requireClinicId(user);
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId },
      include: { clinicalRecord: true },
    });
    if (!encounter || !encounter.clinicalRecord) {
      throw new NotFoundException('Encuentro o HCE no encontrada');
    }
    if (user.role !== UserRole.ADMIN && encounter.professionalId !== user.id) {
      throw new ForbiddenException(
        'Solo el profesional tratante puede actualizar los procedimientos CUPS.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalProcedure.deleteMany({ where: { encounterId } });
      if (dto.procedures.length) {
        await tx.clinicalProcedure.createMany({
          data: dto.procedures.map((p) => ({
            encounterId,
            cupsCode: p.cupsCode.trim(),
            description: p.description.trim(),
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          clinicId,
          userId: user.id,
          action: 'UPDATE',
          entityType: 'ClinicalRecord',
          entityId: encounter.clinicalRecord!.id,
          metadata: {
            kind: 'UPDATE_PROCEDURES',
            encounterId,
            recordStatus: encounter.clinicalRecord!.status,
            count: dto.procedures.length,
          },
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

    // Conserva la fecha de digitación aunque se selle hoy.
    if (!content.documentedAt) {
      content.documentedAt = encounter.createdAt.toISOString();
    }

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

    // RDA siempre (Ley 2015 / Res. 866). RIPS solo si el profesional lo habilitó.
    this.rdaExport.enqueueAfterSign(encounterId);
    void this.rdaExport
      .generateRipsIfEnabled(encounterId, user.ripsEnabled === true)
      .catch(() => undefined);

    return this.getOne(user, encounterId);
  }
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
    const amends = dto.amendsEvolutionId
      ? await this.checkAmendment(user, record.id, dto, signedAt)
      : null;
    const reason = amends
      ? EVOLUTION_AMEND_LABELS[amends.kind]
      : dto.reason?.trim() || 'Nota de evolución';
    const currentSituation = amends ? '' : dto.currentSituation?.trim() || '';
    const attachments = dto.attachmentIds?.length
      ? await this.ownAttachments(clinicId, encounter.patientId, dto.attachmentIds)
      : [];
    if (amends?.kind === 'ANEXO' && !attachments.length) {
      throw new BadRequestException('Adjunte al menos un archivo para registrar el anexo.');
    }

    let clinicalAttentionDate = signedAt;
    if (dto.clinicalAttentionDate) {
      const parsed = new Date(dto.clinicalAttentionDate);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Fecha de atención clínica inválida.');
      }
      if (parsed.getTime() > signedAt.getTime() + 5 * 60 * 1000) {
        throw new BadRequestException('La fecha de atención clínica no puede ser futura.');
      }
      clinicalAttentionDate = parsed;
    }

    if (amends && dto.orthoControl) {
      throw new BadRequestException(
        'Las correcciones, notas aclaratorias y anexos no llevan control de ortodoncia: registre un control nuevo.',
      );
    }
    const orthoControl = dto.orthoControl
      ? await this.checkOrthoControl(
          { clinicId, patientId: encounter.patientId, clinicalRecordId: record.id },
          dto.orthoControl,
          clinicalAttentionDate,
        )
      : null;

    const contentHash = this.signatures.hash([
      record.id,
      record.contentHash,
      reason,
      currentSituation,
      note,
      clinicalAttentionDate.toISOString(),
      user.id,
      signedAt.toISOString(),
      ...(orthoControl ? [JSON.stringify(orthoControl)] : []),
      ...(amends ? [JSON.stringify(amends)] : []),
      ...(attachments.length ? [attachments.map((a) => a.id).join(',')] : []),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalEvolution.create({
        data: {
          clinicalRecordId: record.id,
          authorId: user.id,
          clinicalAttentionDate,
          content: {
            note,
            reason,
            currentSituation,
            ...(orthoControl ? { orthoControl: orthoControl as Prisma.InputJsonObject } : {}),
            ...(amends ? { amends: { ...amends } as Prisma.InputJsonObject } : {}),
            ...(attachments.length ? { attachments } : {}),
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
          metadata: {
            encounterId,
            contentHash,
            reason,
            clinicalAttentionDate: clinicalAttentionDate.toISOString(),
            systemDate: signedAt.toISOString(),
            ...(amends ? { amendsEvolutionId: amends.evolutionId, amendKind: amends.kind } : {}),
          },
        },
      });
    });

    return this.getOne(user, encounterId);
  }

  /**
   * Control de ortodoncia: limpia los campos y valida el orden de los eventos
   * (instalación → retiro → retención) y la próxima cita.
   */
  private async checkOrthoControl(
    ctx: { clinicId: string; patientId: string; clinicalRecordId: string },
    dto: OrthoControlDto,
    attention: Date,
  ): Promise<Record<string, unknown>> {
    const clean: Record<string, string> = { event: dto.event };
    for (const [k, v] of Object.entries(dto)) {
      if (k !== 'event' && typeof v === 'string' && v.trim()) clean[k] = v.trim();
    }
    const procedures = [...new Set(dto.procedures ?? [])];
    if (clean.photoAttachmentId) {
      const [photo] = await this.ownAttachments(ctx.clinicId, ctx.patientId, [clean.photoAttachmentId]);
      if (!photo.mimeType.startsWith('image/')) {
        throw new BadRequestException('La foto del control debe ser una imagen.');
      }
    }
    await this.checkOrthoControlDates(ctx.clinicalRecordId, dto, clean, attention);
    const groups = orthoControlCupsCodes(dto.event, procedures);
    const names = await this.catalogs.resolveCups(groups.map((g) => g.code));
    const cups: OrthoControlCups[] = groups.map((g) => ({
      code: g.code,
      description: names.get(g.code) ?? '',
      procedures: g.procedures,
    }));
    return { ...clean, procedures, cups };
  }

  /**
   * Nota enlazada a una evolución: la corrección solo la registra el autor dentro de las
   * 24 horas siguientes a la firma; la aclaratoria y el anexo se admiten siempre.
   */
  private async checkAmendment(
    user: User,
    clinicalRecordId: string,
    dto: CreateEvolutionDto,
    now: Date,
  ): Promise<EvolutionAmendment> {
    const target = await this.prisma.clinicalEvolution.findFirst({
      where: { id: dto.amendsEvolutionId, clinicalRecordId },
      select: { id: true, authorId: true, signedAt: true, content: true },
    });
    if (!target) throw new NotFoundException('La evolución a la que se refiere la nota no existe en esta historia.');
    const content = (target.content ?? {}) as Record<string, unknown>;
    if (content.amends) {
      throw new BadRequestException('Refiérase a la evolución original, no a otra nota aclaratoria.');
    }
    const kind = dto.amendKind!;
    if (kind === 'CORRECCION') {
      if (target.authorId !== user.id) {
        throw new ForbiddenException('Solo el autor puede registrar una corrección; use una nota aclaratoria.');
      }
      if (now.getTime() - target.signedAt.getTime() > EVOLUTION_CORRECTION_WINDOW_MS) {
        throw new BadRequestException(
          'Registro cerrado por normativa: pasaron más de 24 horas desde la firma. Use una nota aclaratoria o un anexo.',
        );
      }
    }
    return {
      evolutionId: target.id,
      kind,
      signedAt: target.signedAt.toISOString(),
      verificationCode: typeof content.verificationCode === 'string' ? content.verificationCode : '',
    };
  }

  /** Adjuntos del mismo paciente y consultorio; falla si alguno no existe o es de otro paciente. */
  private async ownAttachments(clinicId: string, patientId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    const rows = await this.prisma.clinicalAttachment.findMany({
      where: { id: { in: unique }, encounter: { clinicId, patientId } },
      select: { id: true, label: true, mimeType: true },
    });
    if (rows.length !== unique.length) {
      throw new BadRequestException('Uno de los archivos adjuntos no pertenece a este paciente.');
    }
    return unique.map((id) => rows.find((r) => r.id === id)!);
  }

  /** Próxima cita y orden de eventos (instalación → retiro → retención). */
  private async checkOrthoControlDates(
    clinicalRecordId: string,
    dto: OrthoControlDto,
    clean: Record<string, string>,
    attention: Date,
  ): Promise<void> {
    const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const attentionDay = day(attention);

    if (clean.nextAppointment) {
      const next = new Date(`${clean.nextAppointment}T12:00:00Z`);
      if (Number.isNaN(next.getTime())) {
        throw new BadRequestException('Próxima cita: fecha inválida.');
      }
      if (clean.nextAppointment <= attentionDay) {
        throw new BadRequestException('La próxima cita debe ser posterior a la fecha de atención.');
      }
      if (next.getTime() - attention.getTime() > 400 * 86_400_000) {
        throw new BadRequestException('La próxima cita no puede ser a más de un año.');
      }
    }

    if (dto.event === 'CONTROL') return;
    const previous = await this.prisma.clinicalEvolution.findMany({
      where: { clinicalRecordId },
      select: { content: true, clinicalAttentionDate: true, signedAt: true },
    });
    const events = previous
      .map((ev) => {
        const control = ((ev.content ?? {}) as Record<string, unknown>).orthoControl as
          | Record<string, unknown>
          | undefined;
        return {
          event: typeof control?.event === 'string' ? control.event : '',
          day: day(ev.clinicalAttentionDate ?? ev.signedAt),
        };
      })
      .filter((e) => e.event && e.event !== 'CONTROL')
      .sort((a, b) => a.day.localeCompare(b.day));
    const before = events.filter((e) => e.day <= attentionDay);
    const last = (kind: string) => [...before].reverse().find((e) => e.event === kind);
    const lastInstall = last('INSTALACION');
    const lastDebond = last('RETIRO');
    const active = !!lastInstall && (!lastDebond || lastDebond.day < lastInstall.day);
    const fmt = (d: string) => d.split('-').reverse().join('/');

    if (dto.event === 'INSTALACION') {
      if (active) {
        throw new BadRequestException(
          `Ya hay una instalación de aparatología activa desde el ${fmt(lastInstall!.day)}. Registre primero el retiro.`,
        );
      }
      const later = events.find((e) => e.day > attentionDay);
      if (later) {
        throw new BadRequestException(
          `Hay un evento de ortodoncia posterior (${fmt(later.day)}); la instalación no puede quedar antes de él.`,
        );
      }
    }
    if (dto.event === 'RETIRO' && !active) {
      throw new BadRequestException(
        'No hay una instalación de aparatología registrada antes de esta fecha: no se puede registrar el retiro.',
      );
    }
    if (dto.event === 'RETENCION' && !lastDebond) {
      throw new BadRequestException(
        'La retención empieza después del retiro de la aparatología: registre primero el retiro.',
      );
    }
  }

  /** Quién y cuándo cambió el diagnóstico, el plan y la fase de ortodoncia del paciente. */
  async orthoHistory(user: User, encounterId: string): Promise<OrthoHistoryEntry[]> {
    const clinicId = this.requireClinicId(user);
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId },
      select: {
        patientId: true,
        clinicalRecord: {
          select: {
            content: true,
            evolutions: {
              select: { content: true, clinicalAttentionDate: true, signedAt: true, author: { select: { fullName: true } } },
              orderBy: [{ clinicalAttentionDate: 'asc' }, { signedAt: 'asc' }],
            },
          },
        },
      },
    });
    if (!encounter) throw new NotFoundException('Encuentro no encontrado');

    const logs = await this.prisma.auditLog.findMany({
      where: { clinicId, entityType: ORTHO_PLAN_AUDIT_ENTITY, entityId: encounter.patientId },
      orderBy: { createdAt: 'asc' },
      take: 2000,
      select: { createdAt: true, metadata: true, user: { select: { fullName: true } } },
    });
    const entries: OrthoHistoryEntry[] = logs.map((l) => ({
      at: l.createdAt.toISOString(),
      userName: l.user?.fullName || '—',
      source: 'HISTORIA',
      changes: (((l.metadata ?? {}) as Record<string, unknown>).changes as OrthoPlanChange[]) || [],
    }));

    const eventLabels: Record<string, string> = {
      INSTALACION: 'Instalación de aparatología',
      RETIRO: 'Retiro de aparatología',
      RETENCION: 'Control de retención',
    };
    const content = (encounter.clinicalRecord?.content ?? {}) as Record<string, unknown>;
    const dentistry = (content.dentistry ?? {}) as Record<string, unknown>;
    let phase = String(((dentistry.orthodontics ?? {}) as Record<string, unknown>).phase ?? '').trim();
    for (const ev of encounter.clinicalRecord?.evolutions ?? []) {
      const control = ((ev.content ?? {}) as Record<string, unknown>).orthoControl as
        | Record<string, string>
        | undefined;
      if (!control) continue;
      const changes: OrthoPlanChange[] = [];
      if (eventLabels[control.event]) {
        changes.push({ field: 'event', label: 'Evento', from: '', to: eventLabels[control.event] });
      }
      if (control.phase && control.phase !== phase) {
        changes.push({ field: 'phase', label: 'Fase de tratamiento', from: phase, to: control.phase });
        phase = control.phase;
      }
      if (changes.length) {
        entries.push({
          at: (ev.clinicalAttentionDate ?? ev.signedAt).toISOString(),
          userName: ev.author?.fullName || '—',
          source: 'CONTROL',
          changes,
        });
      }
    }
    return coalesceOrthoHistory(entries);
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
    const physio = (content.physiotherapy ?? {}) as Record<string, unknown>;
    const hasPhysioCore = [
      'physioDiagnosis',
      'physioDxDescription',
      'findings',
      'treatmentObjectives',
      'interventionPlan',
    ].some((key) => text(physio[key]));
    const dental = (content.dentistry ?? {}) as Record<string, unknown>;
    const hasDentalCore =
      (Array.isArray(dental.diagnoses) &&
        dental.diagnoses.some(
          (d) =>
            text((d as Record<string, unknown>)?.cieCode) ||
            text((d as Record<string, unknown>)?.description),
        )) ||
      (Array.isArray(dental.treatmentPlan) &&
        dental.treatmentPlan.some((r) =>
          text((r as Record<string, unknown>)?.description),
        )) ||
      Object.keys((dental.odontogram ?? {}) as object).length > 0 ||
      text(dental.currentIllness);

    if (
      !text(care.motive) &&
      !text(assessment.impressionNarrative) &&
      !hasPhysioCore &&
      !hasDentalCore
    ) {
      throw new BadRequestException(
        'Registre al menos el motivo de consulta, la impresión diagnóstica o el contenido clínico de la atención antes de firmar.',
      );
    }
  }

  private serializeEncounter(
    encounter: EncounterWithRelations,
    user?: User,
  ) {
    const { patientConsents, ...rest } = encounter;
    const base = {
      ...rest,
      clinicalRecord: this.withPatientSignatureFallback(
        rest.clinicalRecord,
        patientConsents[0]?.signatureBase64,
      ),
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

  /** Si la firma no quedó en el contenido, se muestra la del consentimiento sellado. */
  private withPatientSignatureFallback<T extends { content: Prisma.JsonValue } | null>(
    record: T,
    consentSignature: string | null | undefined,
  ): T {
    if (!record || !consentSignature) return record;
    const content = (record.content ?? {}) as Record<string, unknown>;
    const draft = (content.consentDraft ?? {}) as Record<string, unknown>;
    if (draft.patientSignatureBase64) return record;
    return {
      ...record,
      content: {
        ...content,
        consentDraft: {
          ...draft,
          patientSignatureBase64: consentSignature,
          patientSignaturePending: false,
        },
      },
    };
  }
}
