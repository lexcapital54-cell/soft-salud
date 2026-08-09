import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import { createTransport, Transporter } from 'nodemailer';

export interface OutboundMessage {
  destination: string;
  subject: string;
  body: string;
}

export interface DeliveryResult {
  providerMessageId?: string;
  /** true cuando el mensaje no salió de verdad (modo desarrollo sin credenciales). */
  simulated: boolean;
}

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  send(message: OutboundMessage): Promise<DeliveryResult>;
}

/**
 * WhatsApp Business exige cuenta verificada y plantillas aprobadas por Meta.
 * Mientras no haya credenciales, este driver deja constancia en el log y en la
 * bitácora; enchufar el proveedor real solo implica sustituir esta clase.
 */
@Injectable()
export class WhatsappDevProvider implements NotificationProvider {
  readonly channel = NotificationChannel.WHATSAPP;
  private readonly logger = new Logger(WhatsappDevProvider.name);

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    this.logger.log(
      `[SIMULADO] WhatsApp a ${message.destination}: ${message.body.replace(/\s+/g, ' ').slice(0, 160)}`,
    );
    return {
      providerMessageId: `dev-wa-${Date.now()}`,
      simulated: true,
    };
  }
}

/**
 * Correo por SMTP. Si no hay SMTP_HOST configurado cae en modo simulado para
 * que el orquestador se pueda probar de punta a punta sin servidor de correo.
 */
@Injectable()
export class EmailSmtpProvider implements NotificationProvider {
  readonly channel = NotificationChannel.EMAIL;
  private readonly logger = new Logger(EmailSmtpProvider.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private get from() {
    return this.config.get<string>('SMTP_FROM', 'HABILISALUD <no-reply@habilisalud.co>');
  }

  private resolveTransport() {
    if (this.transporter) return this.transporter;

    const host = this.config.get<string>('SMTP_HOST');
    if (!host) return null;

    this.transporter = createTransport({
      host,
      port: Number(this.config.get('SMTP_PORT', 587)),
      secure: this.config.get('SMTP_SECURE', 'false') === 'true',
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER'),
            pass: this.config.get<string>('SMTP_PASSWORD'),
          }
        : undefined,
    });
    return this.transporter;
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    const transport = this.resolveTransport();

    if (!transport) {
      this.logger.log(
        `[SIMULADO] Email a ${message.destination} — "${message.subject}" (defina SMTP_HOST para envíos reales)`,
      );
      return { providerMessageId: `dev-mail-${Date.now()}`, simulated: true };
    }

    const info = await transport.sendMail({
      from: this.from,
      to: message.destination,
      subject: message.subject,
      text: message.body,
    });

    return { providerMessageId: info.messageId, simulated: false };
  }
}
