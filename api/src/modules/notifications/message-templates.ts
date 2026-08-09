import { CareModality, NotificationKind } from '@prisma/client';

export interface MessageContext {
  patientName: string;
  professionalName: string;
  clinicName: string;
  startsAt: Date;
  modality: CareModality;
  meetingUrl?: string | null;
  location?: string | null;
}

const TIME_ZONE = 'America/Bogota';

function formatWhen(date: Date) {
  return date.toLocaleString('es-CO', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Etiqueta corta del canal de atención, con el enlace si es telemedicina. */
function whereLine(ctx: MessageContext) {
  if (ctx.modality === CareModality.VIRTUAL) {
    return ctx.meetingUrl
      ? `Modalidad: Telemedicina.\nEnlace para conectarse: ${ctx.meetingUrl}`
      : 'Modalidad: Telemedicina. Le enviaremos el enlace antes de la cita.';
  }
  return ctx.location
    ? `Modalidad: Presencial en ${ctx.location}.`
    : 'Modalidad: Presencial.';
}

const HEADLINES: Record<NotificationKind, string> = {
  REMINDER_24H: 'Recordatorio de su cita de mañana',
  REMINDER_2H: 'Su cita es en aproximadamente 2 horas',
  CONFIRMATION: 'Su cita quedó confirmada',
  CANCELLATION: 'Su cita fue cancelada',
  MANUAL_RESEND: 'Recordatorio de su cita',
};

export function buildMessage(kind: NotificationKind, ctx: MessageContext) {
  const headline = HEADLINES[kind];
  const subject = `${headline} — ${ctx.clinicName}`;

  if (kind === NotificationKind.CANCELLATION) {
    const body = [
      `Hola ${ctx.patientName},`,
      '',
      `Su cita del ${formatWhen(ctx.startsAt)} con ${ctx.professionalName} fue cancelada.`,
      'Si desea reprogramarla, responda a este mensaje o comuníquese con el consultorio.',
      '',
      ctx.clinicName,
    ].join('\n');
    return { subject, body };
  }

  const body = [
    `Hola ${ctx.patientName},`,
    '',
    `${headline}:`,
    `Fecha y hora: ${formatWhen(ctx.startsAt)}`,
    `Profesional: ${ctx.professionalName}`,
    whereLine(ctx),
    '',
    'Si no puede asistir, avísenos con anticipación para reasignar el espacio.',
    '',
    ctx.clinicName,
  ].join('\n');

  return { subject, body };
}
