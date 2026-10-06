import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { extname } from 'path';
import {
  AppointmentStatus,
  CareModality,
  ClinicSpecialty,
  DashboardType,
  DocumentFileStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { UserRole as AppRole } from '../../common/enums';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import { isCiConsentSpec } from '../clinical/consent-ci/ci-consent.types';
import { ConsentsService } from '../clinical/consents.service';
import { ClinicalStorageService } from '../clinical/clinical-storage.service';
import { EncountersService } from '../clinical/encounters.service';
import { DocumentProvisionService } from '../documents/document-provision.service';
import { PdfBrandService } from '../documents/pdf-brand.service';
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
    private readonly provision: DocumentProvisionService,
    private readonly pdfBrand: PdfBrandService,
    private readonly storage: ClinicalStorageService,
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
    try {
      await this.loadDocuments(clinic.id);
    } catch (error) {
      this.logger.warn(
        `Demo ${kit.label}: documentación pendiente (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    return (await this.list()).find((d) => d.id === clinic.id)!;
  }

  /**
   * Estructura documental completa: aprovisionamiento estándar + requisitos del
   * consultorio real más completo de la especialidad. Solo se copian las
   * plantillas que cargó HABILISALUD (autodiligenciadas con el profesional demo);
   * los soportes propios del cliente real nunca salen de su consultorio.
   */
  async loadDocuments(id: string) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id, isDemo: true } });
    if (!clinic) throw new NotFoundException('Consultorio demo no encontrado');
    if (clinic.dashboardType !== DashboardType.CLINICAL_HISTORY_WITH_DOCS) {
      await this.prisma.clinic.update({
        where: { id },
        data: { dashboardType: DashboardType.CLINICAL_HISTORY_WITH_DOCS },
      });
    }
    await this.provision.ensureForClinic(id, DashboardType.CLINICAL_HISTORY_WITH_DOCS);

    const peers = await this.prisma.clinic.findMany({
      where: { isDemo: false, specialty: clinic.specialty, dashboardType: DashboardType.CLINICAL_HISTORY_WITH_DOCS },
      select: { id: true, name: true, _count: { select: { documentRequirements: true } } },
    });
    peers.sort((a, b) => b._count.documentRequirements - a._count.documentRequirements);
    const source = peers.find((p) => p._count.documentRequirements > 0) ?? null;

    let requirementsCreated = 0;
    let filesCopied = 0;
    if (source) {
      const professional = await this.usersRepository.findOne({
        where: { clinicId: id, role: AppRole.ADMIN },
        relations: { clinic: true },
      });
      const brand = professional ? await this.pdfBrand.resolveBrand(professional, id) : null;
      const sourceReqs = await this.prisma.documentRequirement.findMany({
        where: { clinicId: source.id },
        include: {
          category: true,
          files: {
            where: { status: { not: DocumentFileStatus.RETIRED }, uploadedBy: { role: UserRole.SUPER_ADMIN } },
            orderBy: { version: 'asc' },
          },
        },
      });

      for (const req of sourceReqs) {
        let target = await this.prisma.documentRequirement.findFirst({ where: { clinicId: id, code: req.code } });
        if (!target) {
          target = await this.prisma.documentRequirement.create({
            data: {
              clinicId: id,
              categoryId: req.categoryId,
              code: req.code,
              title: req.title,
              description: req.description,
              isMandatory: req.isMandatory,
              isEnabled: req.isEnabled,
              validityDays: req.validityDays,
              requiresClinicSignature: req.requiresClinicSignature,
            },
          });
          requirementsCreated += 1;
        }
        if (!professional || !req.files.length) continue;
        const hasFiles = await this.prisma.documentFile.count({ where: { requirementId: target.id } });
        if (hasFiles) continue;

        for (const [index, file] of req.files.entries()) {
          try {
            let buffer = await this.storage.readBuffer(file.storageKey);
            const mime = file.mimeType || 'application/octet-stream';
            if (brand && (mime.includes('pdf') || file.originalName.toLowerCase().endsWith('.pdf'))) {
              buffer = await this.pdfBrand.brandPdf(buffer, brand, { force: true });
            }
            const version = index + 1;
            const { storageKey, contentHash } = await this.storage.writeBuffer(
              `habilitation-docs/${id}/${req.category.pillar.toLowerCase()}/${req.code}`,
              `v${version}-demo-${Date.now()}${(extname(file.originalName) || '').slice(0, 12)}`,
              buffer,
              mime,
            );
            await this.prisma.documentFile.create({
              data: {
                requirementId: target.id,
                uploadedById: professional.id,
                version,
                periodLabel: file.periodLabel,
                status: DocumentFileStatus.SIGNED,
                originalName: file.originalName,
                storageKey,
                mimeType: mime,
                sizeBytes: buffer.length,
                checksum: contentHash,
                expiresAt: file.expiresAt,
                notes: 'Plantilla HABILISALUD para consultorio demo.',
              },
            });
            filesCopied += 1;
          } catch (error) {
            this.logger.warn(
              `Demo: no se copió ${file.originalName} (${error instanceof Error ? error.message : String(error)})`,
            );
          }
        }
      }
    }

    const [requirements, withFiles] = await Promise.all([
      this.prisma.documentRequirement.count({ where: { clinicId: id } }),
      this.prisma.documentRequirement.count({ where: { clinicId: id, files: { some: {} } } }),
    ]);
    return { id, source: source?.name ?? null, requirementsCreated, filesCopied, requirements, withFiles };
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
    const [patients, signedRecords, appointmentsToday, documents, documentsWithFiles] = await Promise.all([
      this.prisma.patient.count({ where: { clinicId: clinic.id } }),
      this.prisma.clinicalRecord.count({ where: { status: 'SIGNED', encounter: { clinicId: clinic.id } } }),
      this.prisma.appointment.count({
        where: { clinicId: clinic.id, startsAt: { gte: bogotaAt(0, 0), lt: bogotaAt(1, 0) } },
      }),
      this.prisma.documentRequirement.count({ where: { clinicId: clinic.id, isEnabled: true } }),
      this.prisma.documentRequirement.count({ where: { clinicId: clinic.id, isEnabled: true, files: { some: {} } } }),
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
      documents,
      documentsWithFiles,
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
