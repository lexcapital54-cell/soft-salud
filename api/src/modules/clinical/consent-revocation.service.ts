import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';
import { ConsentPdfService } from './consent-pdf.service';
import { ConsentsService } from './consents.service';
import { RevokePatientConsentDto } from './dto/consent.dto';

/**
 * Revocatoria voluntaria: deja el consentimiento en REVOCADO y sella un PDF
 * aparte. Nada del registro original (firma, PDF, hash) se borra.
 */
@Injectable()
export class ConsentRevocationService {
  private readonly logger = new Logger(ConsentRevocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentsService,
    private readonly consentPdf: ConsentPdfService,
  ) {}

  async revoke(
    user: User,
    id: string,
    dto: RevokePatientConsentDto,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    if (!dto.signatureBase64.startsWith('data:image/')) {
      throw new BadRequestException(
        'La firma de la revocatoria debe enviarse como imagen (data URL PNG/JPEG).',
      );
    }
    const consent = await this.consents.getPatientConsent(user, id);
    if (consent.status === 'REVOCADO' || consent.revokedAt) {
      throw new BadRequestException('Este consentimiento ya fue revocado.');
    }

    const revokedAt = new Date();
    const patientName = `${consent.patient.firstName} ${consent.patient.lastName}`.trim();
    const signerName = dto.signerName?.trim() || consent.signerName || patientName;
    const reason = dto.reason.trim();

    const sealed = await this.consentPdf.sealRevocation(consent.clinicId, {
      brand: {
        clinicName: consent.clinic.name,
        clinicNit: consent.clinic.nit,
        clinicHabilitationCode: consent.clinic.habilitationCode,
        clinicAddress: consent.clinic.address,
        clinicPhone: consent.clinic.phone,
        documentCode: consent.template.code,
        documentVersion: consent.template.version,
      },
      consentId: consent.id,
      templateTitle: consent.template.title,
      originalSignedAt: consent.signedAt,
      originalHash: consent.contentHash,
      patientName,
      patientDocument: `${consent.patient.documentType ?? ''} ${
        consent.patient.documentNumber ?? ''
      }`.trim(),
      signerName,
      signatureBase64: dto.signatureBase64,
      reason,
      revokedAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      registeredBy: [user.fullName, user.professionalCard ? `TP ${user.professionalCard}` : null]
        .filter(Boolean)
        .join(' · '),
    });

    const updated = await this.prisma.patientConsent.update({
      where: { id: consent.id },
      data: {
        status: 'REVOCADO',
        revokedAt,
        revocationReason: reason,
        revocationSignerName: signerName.slice(0, 160),
        revocationSignatureBase64: dto.signatureBase64,
        revocationIp: meta.ipAddress?.slice(0, 60) ?? null,
        revocationUserAgent: meta.userAgent ?? null,
        revocationHash: sealed.contentHash,
        revocationPdfStorageKey: sealed.pdfStorageKey,
      },
      include: {
        template: { select: { id: true, code: true, title: true, version: true } },
      },
    });

    await this.prisma.auditLog
      .create({
        data: {
          clinicId: consent.clinicId,
          userId: user.id,
          action: 'UPDATE',
          entityType: 'PatientConsent',
          entityId: consent.id,
          ipAddress: meta.ipAddress?.slice(0, 60) ?? null,
          userAgent: meta.userAgent ?? null,
          metadata: {
            event: 'REVOCATION',
            templateCode: consent.template.code,
            revocationHash: sealed.contentHash,
          },
        },
      })
      .catch((error: unknown) =>
        this.logger.warn(`No se registró auditoría de revocatoria: ${String(error)}`),
      );

    return {
      ...updated,
      message: 'Consentimiento revocado. Se generó el PDF sellado de la revocatoria.',
    };
  }

  async getRevocationPdf(user: User, id: string) {
    const consent = await this.consents.getPatientConsent(user, id);
    if (!consent.revocationPdfStorageKey) {
      throw new NotFoundException('Este consentimiento no tiene revocatoria sellada.');
    }
    return {
      buffer: await this.consentPdf.readPdfBuffer(consent.revocationPdfStorageKey),
      filename: `${consent.template.code}-revocatoria-${consent.id.slice(0, 8)}.pdf`,
      contentHash: consent.revocationHash,
    };
  }
}
