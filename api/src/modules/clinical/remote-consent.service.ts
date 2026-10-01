import { createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CareModality, Prisma } from '@prisma/client';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';
import { EmailSmtpProvider } from '../notifications/notification-providers';
import { CiConsentDetails, isCiConsentSpec } from './consent-ci/ci-consent.types';
import { ciDetailsSummary } from './consent-ci/ci-consent.validation';
import { ConsentsService } from './consents.service';
import { CreatePatientConsentDto } from './dto/consent.dto';

const EXPIRY_DAYS = 7;
const MINOR_DOCUMENT_TYPES = new Set(['TI', 'RC', 'CN', 'MS']);

@Injectable()
export class RemoteConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentsService,
    private readonly email: EmailSmtpProvider,
    private readonly config: ConfigService,
  ) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private publicAppUrl() {
    return (
      this.config.get<string>('PUBLIC_APP_URL') ||
      this.config.get<string>('APP_PUBLIC_URL') ||
      'https://app.habilisalud.com'
    ).replace(/\/$/, '');
  }

  private isMinorPatient(patient: {
    isMinorOverride: boolean | null;
    documentType: string | null;
    birthDate: Date | null;
  }) {
    if (patient.isMinorOverride !== null) return patient.isMinorOverride;
    if (MINOR_DOCUMENT_TYPES.has((patient.documentType ?? '').toUpperCase())) {
      return true;
    }
    if (!patient.birthDate) return false;
    const ageYears =
      (Date.now() - patient.birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return ageYears < 18;
  }

  /** Normaliza a dígitos internacionales (Colombia 57…) para wa.me. */
  private toWhatsAppDigits(raw: string): string | null {
    let digits = raw.replace(/\D/g, '');
    if (!digits || digits.length < 7) return null;
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('57') && digits.length >= 12) return digits;
    // Celular CO: 3xx xxx xxxx (10 dígitos)
    if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
    if (digits.length === 10) return `57${digits}`;
    if (digits.length === 12 && digits.startsWith('57')) return digits;
    return digits;
  }

  private resolvePhone(
    patient: {
      phone: string | null;
      guardianPhone: string | null;
      emergencyContactPhone: string | null;
      isMinorOverride: boolean | null;
      documentType: string | null;
      birthDate: Date | null;
    },
    override?: string,
  ) {
    const candidates = [
      (override || '').trim(),
      this.isMinorPatient(patient)
        ? patient.guardianPhone?.trim() || ''
        : '',
      patient.phone?.trim() || '',
      patient.guardianPhone?.trim() || '',
      patient.emergencyContactPhone?.trim() || '',
    ].filter(Boolean);

    for (const candidate of candidates) {
      const wa = this.toWhatsAppDigits(candidate);
      if (wa) return { display: candidate, waDigits: wa };
    }
    return null;
  }

  private resolveEmail(
    patient: {
      email: string | null;
      guardianEmail: string | null;
      isMinorOverride: boolean | null;
      documentType: string | null;
      birthDate: Date | null;
    },
    override?: string,
  ) {
    const candidates = [
      (override || '').trim(),
      this.isMinorPatient(patient)
        ? patient.guardianEmail?.trim() || ''
        : '',
      patient.email?.trim() || '',
      patient.guardianEmail?.trim() || '',
    ].filter(Boolean);
    return candidates.find((e) => e.includes('@')) || null;
  }

  private buildInviteMessage(opts: {
    patientName: string;
    clinicName: string;
    templateTitle: string;
    link: string;
    expiryLabel: string;
  }) {
    return [
      `Hola ${opts.patientName},`,
      '',
      `Desde ${opts.clinicName} le solicitamos firmar digitalmente:`,
      `«${opts.templateTitle}»`,
      '',
      'Atención virtual: puede firmar desde el celular sin desplazarse.',
      '',
      `Enlace (válido ${EXPIRY_DAYS} días, hasta ${opts.expiryLabel}):`,
      opts.link,
      '',
      'El enlace es personal. No lo comparta.',
      '',
      'HABILISALUD',
    ].join('\n');
  }

  /**
   * Genera enlace de firma remota (WhatsApp / copia).
   * Disponible en cualquier modalidad (presencial o virtual): el paciente
   * firma desde el celular sin tener que dibujar en el pad del consultorio.
   * Caduca en 7 días.
   */
  async sendInvite(
    user: User,
    dto: {
      patientId: string;
      templateId: string;
      encounterId?: string;
      emailOverride?: string;
      phoneOverride?: string;
      procedureDetails?: Record<string, unknown>;
    },
  ) {
    const clinicId = this.requireClinicId(user);

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId },
      include: { clinic: { select: { name: true } } },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const template = await this.consents.getTemplate(user, dto.templateId);
    const ciDetails = this.consents.resolveCiDetails(template, dto.procedureDetails);

    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: {
          id: dto.encounterId,
          clinicId,
          patientId: dto.patientId,
        },
        select: { id: true, modality: true },
      });
      if (!encounter) {
        throw new NotFoundException('Atención no encontrada para este paciente');
      }
      // Si aún no estaba marcada como virtual, la alineamos al canal de firma remota.
      if (encounter.modality !== CareModality.VIRTUAL) {
        await this.prisma.encounter.update({
          where: { id: encounter.id },
          data: { modality: CareModality.VIRTUAL },
        });
      }
    } else {
      throw new BadRequestException(
        'Indique la atención (encounterId) para generar el enlace de firma.',
      );
    }

    const phone = this.resolvePhone(patient, dto.phoneOverride);
    if (!phone) {
      throw new BadRequestException(
        'El paciente (o acudiente) no tiene teléfono. Agréguelo en la ficha para enviar por WhatsApp.',
      );
    }

    const email = this.resolveEmail(patient, dto.emailOverride);

    // Invalida invitaciones pendientes previas del mismo paciente/plantilla.
    await this.prisma.remoteConsentInvite.updateMany({
      where: {
        clinicId,
        patientId: dto.patientId,
        templateId: dto.templateId,
        status: 'PENDING',
      },
      data: { status: 'CANCELLED' },
    });

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.remoteConsentInvite.create({
      data: {
        clinicId,
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        templateId: dto.templateId,
        invitedById: user.id,
        tokenHash,
        sentToEmail: email,
        sentToPhone: phone.display,
        status: 'PENDING',
        expiresAt,
        procedureDetails: ciDetails
          ? (ciDetails as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });

    const link = `${this.publicAppUrl()}/firmar-consentimiento.html?token=${token}`;
    const patientName =
      `${patient.firstName || ''} ${patient.lastName || ''}`.replace(/\s+/g, ' ').trim() ||
      'paciente';
    const clinicName = patient.clinic?.name || 'el consultorio';
    const expiryLabel = expiresAt.toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'long',
      timeStyle: 'short',
    });

    const body = this.buildInviteMessage({
      patientName,
      clinicName,
      templateTitle: template.title,
      link,
      expiryLabel,
    });

    const whatsappUrl = `https://wa.me/${phone.waDigits}?text=${encodeURIComponent(body)}`;

    let emailSimulated: boolean | null = null;
    if (email) {
      const patientSend = await this.email.send({
        destination: email,
        subject: `Firma digital · ${template.title} · ${clinicName}`,
        body,
      });
      emailSimulated = patientSend.simulated;

      if (user.email?.includes('@')) {
        await this.email
          .send({
            destination: user.email,
            subject: `[Copia] Enlace de firma · ${patientName}`,
            body: [
              `Se generó un enlace de firma remota (WhatsApp).`,
              '',
              `Paciente: ${patientName}`,
              `Documento: ${template.title}`,
              `Teléfono WhatsApp: ${phone.display}`,
              `Correo (si aplica): ${email}`,
              `Caduca: ${expiryLabel}`,
              `SMTP simulado: ${patientSend.simulated ? 'sí' : 'no'}`,
              '',
              link,
            ].join('\n'),
          })
          .catch(() => undefined);
      }
    }

    await this.prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: 'CREATE',
        entityType: 'RemoteConsentInvite',
        entityId: invite.id,
        metadata: {
          patientId: dto.patientId,
          encounterId: dto.encounterId,
          templateId: dto.templateId,
          sentToPhone: phone.display,
          sentToEmail: email,
          expiresAt: expiresAt.toISOString(),
          channel: 'WHATSAPP',
          emailSimulated,
          modality: CareModality.VIRTUAL,
        },
      },
    });

    return {
      id: invite.id,
      link,
      whatsappUrl,
      sentToPhone: phone.display,
      sentToEmail: email,
      expiresAt: expiresAt.toISOString(),
      emailSimulated,
      message: `Enlace listo para firma virtual por WhatsApp (${phone.display}). Caduca en ${EXPIRY_DAYS} días.`,
    };
  }

  /** Estado de una invitación (polling desde la HC). */
  async getInviteStatus(user: User, inviteId: string) {
    const clinicId = this.requireClinicId(user);
    const invite = await this.prisma.remoteConsentInvite.findFirst({
      where: { id: inviteId, clinicId },
    });
    if (!invite) throw new NotFoundException('Invitación no encontrada');

    let signatureBase64: string | null = null;
    let signedAt: string | null = null;
    if (invite.patientConsentId) {
      const consent = await this.prisma.patientConsent.findUnique({
        where: { id: invite.patientConsentId },
        select: { signatureBase64: true, signedAt: true },
      });
      signatureBase64 = consent?.signatureBase64 ?? null;
      signedAt = consent?.signedAt?.toISOString() ?? null;
    }

    return {
      id: invite.id,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      usedAt: invite.usedAt?.toISOString() ?? null,
      sentToPhone: invite.sentToPhone,
      patientConsentId: invite.patientConsentId,
      signatureBase64,
      signedAt,
    };
  }

  /** Vista pública del documento a firmar (sin login). */
  async getPublicInvite(token: string) {
    const invite = await this.findValidInvite(token);
    const [patient, template, clinic] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: invite.patientId } }),
      this.prisma.consentTemplate.findUnique({
        where: { id: invite.templateId },
        select: {
          id: true,
          code: true,
          title: true,
          bodyHtml: true,
          bodyJson: true,
          version: true,
        },
      }),
      this.prisma.clinic.findUnique({
        where: { id: invite.clinicId },
        select: { name: true },
      }),
    ]);
    if (!patient || !template) {
      throw new NotFoundException('Invitación no válida');
    }

    const patientName = `${patient.firstName} ${patient.lastName}`.trim();
    return {
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      template: {
        id: template.id,
        code: template.code,
        title: template.title,
        bodyHtml: template.bodyHtml,
        version: template.version,
      },
      procedureSummary:
        isCiConsentSpec(template.bodyJson) && invite.procedureDetails
          ? ciDetailsSummary(
              template.bodyJson,
              invite.procedureDetails as unknown as CiConsentDetails,
            )
          : [],
      patientName,
      clinicName: clinic?.name || 'Consultorio',
      sentToEmail: invite.sentToEmail,
      sentToPhone: invite.sentToPhone,
    };
  }

  /** Firma pública: sella PatientConsent con el profesional que invitó. */
  async signPublic(
    token: string,
    dto: { signatureBase64: string },
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const invite = await this.findValidInvite(token);
    if (!dto.signatureBase64?.startsWith('data:image/')) {
      throw new BadRequestException(
        'La firma debe enviarse como imagen (data URL PNG/JPEG).',
      );
    }

    const inviter = await this.prisma.user.findUnique({
      where: { id: invite.invitedById },
    });
    if (!inviter || !inviter.isActive) {
      throw new BadRequestException(
        'La profesional que envió el enlace ya no está activa. Solicite un nuevo enlace.',
      );
    }

    const professionalUser = {
      id: inviter.id,
      email: inviter.email,
      fullName: inviter.fullName,
      role: inviter.role as UserRole,
      clinicId: inviter.clinicId,
      professionalCard: inviter.professionalCard,
      professionalSignatureBase64: inviter.professionalSignatureBase64,
      ripsEnabled: inviter.ripsEnabled,
      isActive: inviter.isActive,
    } as User;

    const signDto: CreatePatientConsentDto = {
      patientId: invite.patientId,
      templateId: invite.templateId,
      encounterId: invite.encounterId || undefined,
      signatureBase64: dto.signatureBase64,
      professionalSignatureBase64:
        inviter.professionalSignatureBase64 || undefined,
      procedureDetails:
        (invite.procedureDetails as Record<string, unknown> | null) ?? undefined,
    };

    const sealed = await this.consents.sign(professionalUser, signDto, meta);

    await this.prisma.remoteConsentInvite.update({
      where: { id: invite.id },
      data: {
        status: 'SIGNED',
        usedAt: new Date(),
        patientConsentId: sealed.id,
      },
    });

    // Aviso a la Dra (solo si hay SMTP real; si no, queda en log simulado).
    if (inviter.email?.includes('@')) {
      const templateTitle =
        (await this.prisma.consentTemplate.findUnique({
          where: { id: invite.templateId },
          select: { title: true },
        }))?.title || 'Consentimiento';
      await this.email
        .send({
          destination: inviter.email,
          subject: `Firma remota recibida · ${templateTitle}`,
          body: [
            `El paciente firmó digitalmente el documento remoto.`,
            '',
            `WhatsApp / teléfono: ${invite.sentToPhone || '—'}`,
            `Correo: ${invite.sentToEmail || '—'}`,
            `Consentimiento ID: ${sealed.id}`,
            `Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
            '',
            'Ya puede verlo en la historia clínica del paciente.',
          ].join('\n'),
        })
        .catch(() => undefined);
    }

    return {
      ok: true,
      consentId: sealed.id,
      message: 'Firma registrada y consentimiento sellado correctamente.',
    };
  }

  private async findValidInvite(token: string) {
    if (!token || token.length < 20) {
      throw new BadRequestException('Token inválido');
    }
    const tokenHash = this.hashToken(token);
    const invite = await this.prisma.remoteConsentInvite.findUnique({
      where: { tokenHash },
    });
    if (!invite) {
      throw new NotFoundException('Enlace no encontrado o ya no es válido');
    }
    if (invite.status === 'SIGNED') {
      throw new BadRequestException('Este enlace ya fue utilizado.');
    }
    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Este enlace ya no está activo.');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.prisma.remoteConsentInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException(
        'El enlace caducó (vigencia 7 días). Solicite uno nuevo a su profesional.',
      );
    }
    return invite;
  }
}
