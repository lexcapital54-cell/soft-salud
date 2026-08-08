import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClinicSpecialty } from '@prisma/client';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';
import { ConsentPdfService } from './consent-pdf.service';
import { CreatePatientConsentDto } from './dto/consent.dto';

@Injectable()
export class ConsentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consentPdf: ConsentPdfService,
  ) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  private async clinicSpecialty(clinicId: string): Promise<ClinicSpecialty> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { specialty: true },
    });
    if (!clinic) {
      throw new NotFoundException('Consultorio no encontrado');
    }
    return clinic.specialty;
  }

  async listTemplates(user: User) {
    const clinicId = this.requireClinicId(user);
    const specialty = await this.clinicSpecialty(clinicId);
    return this.prisma.consentTemplate.findMany({
      where: {
        isActive: true,
        specialty,
        OR: [{ clinicId: null }, { clinicId }],
      },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
      select: {
        id: true,
        code: true,
        title: true,
        version: true,
        specialty: true,
        bodyHtml: true,
        updatedAt: true,
      },
    });
  }

  async getTemplate(user: User, id: string) {
    const clinicId = this.requireClinicId(user);
    const specialty = await this.clinicSpecialty(clinicId);
    const template = await this.prisma.consentTemplate.findFirst({
      where: {
        id,
        isActive: true,
        specialty,
        OR: [{ clinicId: null }, { clinicId }],
      },
    });
    if (!template) {
      throw new NotFoundException('Plantilla de consentimiento no encontrada');
    }
    return template;
  }

  async listPatientConsents(
    user: User,
    opts: { patientId?: string; encounterId?: string },
  ) {
    const clinicId = this.requireClinicId(user);
    return this.prisma.patientConsent.findMany({
      where: {
        clinicId,
        ...(opts.patientId ? { patientId: opts.patientId } : {}),
        ...(opts.encounterId ? { encounterId: opts.encounterId } : {}),
      },
      orderBy: { signedAt: 'desc' },
      include: {
        template: {
          select: { id: true, code: true, title: true, version: true },
        },
      },
    });
  }

  async getPatientConsent(user: User, id: string) {
    const clinicId = this.requireClinicId(user);
    const consent = await this.prisma.patientConsent.findFirst({
      where: { id, clinicId },
      include: {
        template: true,
        patient: true,
        clinic: true,
      },
    });
    if (!consent) {
      throw new NotFoundException('Consentimiento no encontrado');
    }
    return consent;
  }

  async getPdfBuffer(user: User, id: string) {
    const consent = await this.getPatientConsent(user, id);
    if (!consent.pdfStorageKey) {
      throw new NotFoundException('Este consentimiento aún no tiene PDF sellado');
    }
    const buffer = await this.consentPdf.readPdfBuffer(consent.pdfStorageKey);
    return {
      buffer,
      filename: `${consent.template.code}-${consent.id.slice(0, 8)}.pdf`,
      contentHash: consent.contentHash,
    };
  }

  async sign(
    user: User,
    dto: CreatePatientConsentDto,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const clinicId = this.requireClinicId(user);

    if (!dto.signatureBase64.startsWith('data:image/')) {
      throw new BadRequestException(
        'La firma debe enviarse como data URL de imagen (PNG/JPEG base64)',
      );
    }

    const [patient, clinic] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: dto.patientId, clinicId } }),
      this.prisma.clinic.findUnique({ where: { id: clinicId } }),
    ]);
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    if (!clinic) {
      throw new NotFoundException('Consultorio no encontrado');
    }

    const template = await this.getTemplate(user, dto.templateId);

    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: dto.encounterId, clinicId, patientId: dto.patientId },
      });
      if (!encounter) {
        throw new NotFoundException(
          'Atención no encontrada para este paciente',
        );
      }
    }

    const signedAt = new Date();
    const signerName =
      dto.signerName?.trim() ||
      `${patient.firstName} ${patient.lastName}`.trim();
    const docType =
      dto.signerDocumentType?.trim() || patient.documentType || 'CC';
    const docNumber =
      dto.signerDocument?.trim() || patient.documentNumber;
    const signerDocument = `${docType} ${docNumber}`.slice(0, 40);

    const consent = await this.prisma.patientConsent.create({
      data: {
        clinicId,
        patientId: dto.patientId,
        encounterId: dto.encounterId ?? null,
        templateId: template.id,
        signerName,
        signerDocument,
        signatureBase64: dto.signatureBase64,
        signedAt,
        ipAddress: meta.ipAddress?.slice(0, 60) ?? null,
        userAgent: meta.userAgent ?? null,
        pdfStorageKey: null,
        contentHash: null,
        immutableAt: null,
      },
      include: {
        template: {
          select: { id: true, code: true, title: true, version: true },
        },
      },
    });

    const sealed = await this.consentPdf.seal({
      consentId: consent.id,
      clinicId,
      clinicName: clinic.name,
      clinicAddress: clinic.address,
      clinicPhone: clinic.phone,
      templateCode: template.code,
      templateTitle: template.title,
      templateVersion: template.version,
      bodyHtml: template.bodyHtml,
      patientName: `${patient.firstName} ${patient.lastName}`.trim(),
      patientDocument: patient.documentNumber,
      patientDocumentType: patient.documentType,
      signerName,
      signerDocument,
      signatureBase64: dto.signatureBase64,
      signedAt,
      ipAddress: meta.ipAddress,
      encounterId: dto.encounterId ?? null,
    });

    const updated = await this.prisma.patientConsent.update({
      where: { id: consent.id },
      data: {
        pdfStorageKey: sealed.pdfStorageKey,
        contentHash: sealed.contentHash,
        immutableAt: sealed.immutableAt,
      },
      include: {
        template: {
          select: { id: true, code: true, title: true, version: true },
        },
      },
    });

    await this.syncLightConsentFlag(
      clinicId,
      dto.patientId,
      dto.encounterId,
      template.code,
      signedAt,
    );

    return {
      ...updated,
      sealStatus: 'SEALED' as const,
      pdfUrl: `/api/patient-consents/${updated.id}/pdf`,
      message:
        'Documento aceptado, firmado y sellado como PDF inalterable vinculado a la historia clínica.',
    };
  }

  private async syncLightConsentFlag(
    clinicId: string,
    patientId: string,
    encounterId: string | undefined,
    templateCode: string,
    signedAt: Date,
  ) {
    const consentType =
      templateCode === 'HABEAS_DATA' ? 'DATA_PROCESSING' : 'INFORMED';

    if (!encounterId) return;

    const existing = await this.prisma.clinicalConsent.findFirst({
      where: { encounterId, consentType },
    });

    if (existing) {
      await this.prisma.clinicalConsent.update({
        where: { id: existing.id },
        data: {
          granted: true,
          grantedAt: signedAt,
          templateCode,
          patientId,
          clinicId,
        },
      });
      return;
    }

    await this.prisma.clinicalConsent.create({
      data: {
        clinicId,
        patientId,
        encounterId,
        consentType,
        templateCode,
        granted: true,
        grantedAt: signedAt,
      },
    });
  }
}
