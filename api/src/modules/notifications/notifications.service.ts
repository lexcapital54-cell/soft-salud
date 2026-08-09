import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  AppointmentStatus,
  NotificationChannel,
  NotificationKind,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import { buildMessage } from './message-templates';
import {
  EmailSmtpProvider,
  NotificationProvider,
  WhatsappDevProvider,
} from './notification-providers';

const MINOR_DOCUMENT_TYPES = new Set(['TI', 'RC', 'CN', 'MS']);

/** Solo se recuerdan citas vivas; las atendidas o canceladas no generan avisos. */
const NOTIFIABLE_STATUSES: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED'];

const HOUR = 60 * 60 * 1000;

const appointmentInclude = {
  patient: true,
  clinic: { select: { id: true, name: true } },
  professional: { select: { id: true, fullName: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentForNotice = Prisma.AppointmentGetPayload<{
  include: typeof appointmentInclude;
}>;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly providers: Record<NotificationChannel, NotificationProvider>;
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    whatsapp: WhatsappDevProvider,
    email: EmailSmtpProvider,
  ) {
    this.providers = {
      [NotificationChannel.WHATSAPP]: whatsapp,
      [NotificationChannel.EMAIL]: email,
    };
  }

  /**
   * Barrido cada 10 minutos. En vez de una ventana estrecha alrededor del
   * momento exacto, busca toda cita pendiente dentro del horizonte: si la API
   * estuvo caída, el recordatorio sale igual en la siguiente pasada, y la clave
   * de deduplicación impide repetirlo.
   */
  @Cron('*/10 * * * *', { name: 'appointment-reminders' })
  async sweepReminders() {
    if (this.config.get('NOTIFICATIONS_ENABLED', 'true') === 'false') return;
    if (this.sweeping) {
      this.logger.warn('Barrido anterior aún en curso; se omite esta pasada.');
      return;
    }

    this.sweeping = true;
    try {
      const now = new Date();
      const sent =
        (await this.dispatchWindow(
          NotificationKind.REMINDER_2H,
          now,
          new Date(now.getTime() + 2 * HOUR),
        )) +
        (await this.dispatchWindow(
          NotificationKind.REMINDER_24H,
          new Date(now.getTime() + 2 * HOUR),
          new Date(now.getTime() + 24 * HOUR),
        ));

      if (sent) this.logger.log(`Recordatorios despachados: ${sent}`);
    } catch (error) {
      this.logger.error(
        'Fallo el barrido de recordatorios',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.sweeping = false;
    }
  }

  private async dispatchWindow(kind: NotificationKind, from: Date, to: Date) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        status: { in: NOTIFIABLE_STATUSES },
        startsAt: { gte: from, lte: to },
      },
      include: appointmentInclude,
      take: 200,
    });

    let count = 0;
    for (const appointment of appointments) {
      for (const channel of Object.values(NotificationChannel)) {
        const delivered = await this.deliver(appointment, kind, channel, {
          dedupeKey: `${appointment.id}:${kind}:${channel}`,
        });
        if (delivered) count += 1;
      }
    }
    return count;
  }

  /** Aviso puntual disparado por la máquina de estados de la cita. */
  async notifyStatusChange(appointmentId: string, kind: NotificationKind) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: appointmentInclude,
    });
    if (!appointment) return;

    for (const channel of Object.values(NotificationChannel)) {
      await this.deliver(appointment, kind, channel, {
        dedupeKey: `${appointment.id}:${kind}:${channel}`,
      });
    }
  }

  /** Reenvío manual desde la agenda. Se puede repetir y queda historial completo. */
  async resend(user: User, appointmentId: string, channel: NotificationChannel) {
    const clinicId = this.requireClinicId(user);
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, clinicId },
      include: appointmentInclude,
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada');

    const recipient = this.resolveRecipient(appointment, channel);
    if (!recipient) {
      throw new NotFoundException(
        channel === NotificationChannel.EMAIL
          ? 'El paciente no tiene correo registrado o revocó la autorización de contacto.'
          : 'El paciente no tiene teléfono registrado o revocó la autorización de contacto.',
      );
    }

    await this.deliver(appointment, NotificationKind.MANUAL_RESEND, channel, {
      dedupeKey: null,
      triggeredById: user.id,
    });

    return this.listByAppointment(user, appointmentId);
  }

  async listByAppointment(user: User, appointmentId: string) {
    const clinicId = this.requireClinicId(user);
    return this.prisma.notificationLog.findMany({
      where: { appointmentId, clinicId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  /**
   * Registra el intento y lo envía. Devuelve false cuando no había a quién
   * escribir o cuando otro proceso ya cubrió ese recordatorio.
   */
  private async deliver(
    appointment: AppointmentForNotice,
    kind: NotificationKind,
    channel: NotificationChannel,
    options: { dedupeKey: string | null; triggeredById?: string },
  ) {
    const recipient = this.resolveRecipient(appointment, channel);
    if (!recipient) return false;

    const { subject, body } = buildMessage(kind, {
      patientName: this.patientName(appointment),
      professionalName: appointment.professional.fullName,
      clinicName: appointment.clinic.name,
      startsAt: appointment.startsAt,
      modality: appointment.modality,
      meetingUrl: appointment.meetingUrl,
      location: null,
    });

    let log;
    try {
      log = await this.prisma.notificationLog.create({
        data: {
          clinicId: appointment.clinicId,
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          channel,
          kind,
          status: NotificationStatus.PENDING,
          destination: recipient,
          templateCode: kind,
          payload: { subject, body },
          scheduledFor: appointment.startsAt,
          dedupeKey: options.dedupeKey,
          triggeredById: options.triggeredById ?? null,
        },
      });
    } catch (error) {
      // P2002 = la clave de deduplicación ya existe: el recordatorio ya salió.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }

    try {
      const result = await this.providers[channel].send({
        destination: recipient,
        subject,
        body,
      });
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          attempts: { increment: 1 },
          providerMessageId: result.providerMessageId,
          payload: { subject, body, simulated: result.simulated },
        },
      });
      return true;
    } catch (error) {
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: NotificationStatus.FAILED,
          attempts: { increment: 1 },
          errorMessage:
            error instanceof Error ? error.message.slice(0, 500) : String(error),
        },
      });
      this.logger.error(`Envío ${channel} fallido para cita ${appointment.id}`);
      return false;
    }
  }

  /**
   * Destino del mensaje respetando la autorización por canal (Ley 1581).
   * En menores de edad se escribe al representante legal cuando existe.
   */
  private resolveRecipient(
    appointment: AppointmentForNotice,
    channel: NotificationChannel,
  ) {
    const patient = appointment.patient;
    const minor = this.isMinor(appointment);

    if (channel === NotificationChannel.EMAIL) {
      if (!patient.notifyByEmail) return null;
      const email = minor
        ? patient.guardianEmail || patient.email
        : patient.email;
      return email && email.includes('@') ? email : null;
    }

    if (!patient.notifyByWhatsapp) return null;
    const phone = minor
      ? patient.guardianPhone || patient.phone
      : patient.phone;
    return phone && phone.replace(/\D/g, '').length >= 7 ? phone : null;
  }

  private isMinor(appointment: AppointmentForNotice) {
    const patient = appointment.patient;
    if (patient.isMinorOverride !== null) return patient.isMinorOverride;
    if (MINOR_DOCUMENT_TYPES.has((patient.documentType ?? '').toUpperCase()))
      return true;

    // Ficha provisional sin fecha de nacimiento: se asume adulto y el contacto
    // se corrige al completar la ficha en consulta.
    const birth = patient.birthDate;
    if (!birth) return false;
    const age = (Date.now() - birth.getTime()) / (365.25 * 24 * HOUR);
    return age < 18;
  }

  private patientName(appointment: AppointmentForNotice) {
    const p = appointment.patient;
    return `${p.firstName} ${p.lastName}`.replace(/\s+/g, ' ').trim();
  }

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }
}
