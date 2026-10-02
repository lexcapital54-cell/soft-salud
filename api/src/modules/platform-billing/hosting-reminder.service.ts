import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PlatformChargeKind, PlatformReceiptStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import {
  HOSTING_PAYMENT_DAYS,
  billingRange,
  bogotaToday,
  parsePeriodMonth,
} from './billing-period';
import { PlatformBillingService } from './platform-billing.service';

/**
 * Recordatorio de la mensualidad: los primeros días de cada mes se avisa por correo
 * (una vez al día) a los admins de los consultorios que no tienen pago registrado.
 * No suspende a nadie: la suspensión sigue siendo una acción manual del SUPER_ADMIN.
 */
@Injectable()
export class HostingReminderService {
  private readonly logger = new Logger(HostingReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: PlatformBillingService,
  ) {}

  @Cron('0 8 * * *', { name: 'hosting-payment-reminder', timeZone: 'America/Bogota' })
  async dailyReminder() {
    const today = bogotaToday();
    if (today.day > HOSTING_PAYMENT_DAYS) return;
    try {
      const sent = await this.sendReminders(today);
      if (sent) this.logger.log(`Recordatorio de mensualidad enviado a ${sent} consultorio(s).`);
    } catch (err) {
      this.logger.error('No se pudo enviar el recordatorio de mensualidad', err as Error);
    }
  }

  private async sendReminders(today: ReturnType<typeof bogotaToday>) {
    const periodMonth = parsePeriodMonth(today.periodKey);
    const range = billingRange(periodMonth);
    const clinics = await this.billing.unpaidClinics(periodMonth);
    let sent = 0;
    for (const clinic of clinics) {
      if (!clinic.isActive || clinic.hostingSuspendedAt) continue;
      if (clinic.hostingDueNotifiedAt && bogotaToday(clinic.hostingDueNotifiedAt).iso === today.iso) {
        continue;
      }
      const receipt = await this.pendingReceipt(clinic.id, periodMonth);
      const daysLeft = HOSTING_PAYMENT_DAYS - today.day;
      const emails = await this.billing.notifyClinicAdmins(clinic.id, clinic.name, {
        subject: `SUSCRIPCIÓN PRÓXIMA A VENCER — HabiliSALUD ${today.periodKey} — ${clinic.name}`,
        body: [
          `Estimado(a) administrador(a) de ${clinic.name},`,
          '',
          `Le recordamos que la mensualidad del servidor de HabiliSALUD del periodo ${range.label} se paga dentro de los primeros ${HOSTING_PAYMENT_DAYS} días del mes.`,
          receipt
            ? `Cuenta de cobro ${receipt.number} por ${Number(receipt.amount).toLocaleString('es-CO')} COP.`
            : '',
          daysLeft > 0
            ? `Tiene plazo hasta el ${HOSTING_PAYMENT_DAYS} de este mes (quedan ${daysLeft} día(s)).`
            : `Hoy es el último día del plazo.`,
          '',
          'Si ya realizó el pago, envíe el soporte a HabiliSALUD para registrarlo.',
          '',
          'Atentamente,',
          'HabiliSALUD',
        ]
          .filter((line, i, all) => line !== '' || all[i - 1] !== '')
          .join('\n'),
      });
      await this.prisma.clinic.update({
        where: { id: clinic.id },
        data: { hostingPeriodDue: periodMonth, hostingDueNotifiedAt: new Date() },
      });
      if (emails.length) sent += 1;
    }
    return sent;
  }

  /** Estado de la mensualidad del mes en curso para el panel del consultorio. */
  async clinicReminder(clinicId: string) {
    const today = bogotaToday();
    const periodMonth = parsePeriodMonth(today.periodKey);
    const range = billingRange(periodMonth);
    const receipt = await this.prisma.platformReceipt.findFirst({
      where: { clinicId, kind: PlatformChargeKind.MONTHLY_HOSTING, periodMonth },
      select: { number: true, amount: true, status: true },
    });
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { dashboardType: true },
    });
    const paid = receipt?.status === PlatformReceiptStatus.PAID;
    const status = paid ? 'PAID' : today.day <= HOSTING_PAYMENT_DAYS ? 'DUE' : 'OVERDUE';
    return {
      show: !!clinic?.dashboardType && !paid,
      status,
      periodMonth: today.periodKey,
      billingRange: range.label,
      dueDate: range.dueDate,
      paymentDays: HOSTING_PAYMENT_DAYS,
      daysLeft: Math.max(0, HOSTING_PAYMENT_DAYS - today.day),
      receiptNumber: receipt?.number ?? null,
      amount: receipt ? Number(receipt.amount) : null,
    };
  }

  private pendingReceipt(clinicId: string, periodMonth: Date) {
    return this.prisma.platformReceipt.findFirst({
      where: {
        clinicId,
        kind: PlatformChargeKind.MONTHLY_HOSTING,
        periodMonth,
        status: PlatformReceiptStatus.PENDING,
      },
      select: { number: true, amount: true },
    });
  }
}
