import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DashboardType,
  PaymentMethod,
  PlatformChargeKind,
  PlatformPlanVariant,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import {
  CreatePlatformReceiptDto,
  GenerateMonthlyHostingDto,
  HostingPeriodDto,
  UpdatePlatformFeeDto,
} from './dto/platform-billing.dto';
import { PlatformReceiptPdfService } from './platform-receipt-pdf.service';
import { EmailSmtpProvider } from '../notifications/notification-providers';

const KIND_LABEL: Record<PlatformChargeKind, string> = {
  CLINIC_SETUP: 'Alta / creación de consultorio',
  MONTHLY_HOSTING: 'Arrendamiento mensual del servidor',
  OTHER: 'Otro cobro',
};

const PLAN_LABEL: Record<PlatformPlanVariant, string> = {
  WITHOUT_DOCS: 'Sin documentación',
  WITH_DOCS: 'Con documentación',
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  PSE: 'PSE',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  OTHER: 'Otro',
};

function money(n: Prisma.Decimal | number | string) {
  return Number(n);
}

function planFromDashboard(type: DashboardType | null | undefined): PlatformPlanVariant {
  return type === DashboardType.CLINICAL_HISTORY_WITH_DOCS
    ? PlatformPlanVariant.WITH_DOCS
    : PlatformPlanVariant.WITHOUT_DOCS;
}

function parsePeriodMonth(ym: string): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) {
    throw new BadRequestException('periodMonth debe ser YYYY-MM');
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    throw new BadRequestException('Mes inválido');
  }
  return new Date(Date.UTC(year, month - 1, 1));
}

function periodLabel(d: Date | null | undefined) {
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

@Injectable()
export class PlatformBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PlatformReceiptPdfService,
    private readonly email: EmailSmtpProvider,
  ) {}

  private assertSuperAdmin(user: User) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Solo SUPER_ADMIN');
    }
  }

  async listFees(user: User) {
    this.assertSuperAdmin(user);
    await this.ensureDefaultFees();
    const rows = await this.prisma.platformFee.findMany({
      orderBy: [{ kind: 'asc' }, { plan: 'asc' }],
    });
    return rows.map((f) => ({
      id: f.id,
      code: f.code,
      label: f.label,
      kind: f.kind,
      kindLabel: KIND_LABEL[f.kind],
      plan: f.plan,
      planLabel: PLAN_LABEL[f.plan],
      amount: money(f.amount),
      currency: f.currency,
      isActive: f.isActive,
    }));
  }

  async updateFee(user: User, id: string, dto: UpdatePlatformFeeDto) {
    this.assertSuperAdmin(user);
    const fee = await this.prisma.platformFee.findUnique({ where: { id } });
    if (!fee) throw new NotFoundException('Tarifa no encontrada');
    const updated = await this.prisma.platformFee.update({
      where: { id },
      data: {
        amount: new Prisma.Decimal(dto.amount),
        ...(dto.label ? { label: dto.label } : {}),
      },
    });
    return {
      id: updated.id,
      code: updated.code,
      label: updated.label,
      kind: updated.kind,
      plan: updated.plan,
      amount: money(updated.amount),
    };
  }

  async listReceipts(user: User, from?: string, to?: string, clinicId?: string) {
    this.assertSuperAdmin(user);
    const where: Prisma.PlatformReceiptWhereInput = {};
    if (clinicId) where.clinicId = clinicId;
    if (from || to) {
      where.paidAt = {};
      if (from) where.paidAt.gte = new Date(`${from}T00:00:00.000-05:00`);
      if (to) where.paidAt.lte = new Date(`${to}T23:59:59.999-05:00`);
    }
    const rows = await this.prisma.platformReceipt.findMany({
      where,
      include: {
        clinic: { select: { id: true, name: true, specialty: true, dashboardType: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.mapReceipt(r));
  }

  async createReceipt(user: User, dto: CreatePlatformReceiptDto) {
    this.assertSuperAdmin(user);
    const clinic = await this.prisma.clinic.findUnique({ where: { id: dto.clinicId } });
    if (!clinic) throw new NotFoundException('Consultorio no encontrado');

    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('Indique un monto válido');
    }

    let periodMonth: Date | null = null;
    if (dto.kind === PlatformChargeKind.MONTHLY_HOSTING) {
      const ym = dto.periodMonth || new Date().toISOString().slice(0, 7);
      periodMonth = parsePeriodMonth(ym);
      const dup = await this.prisma.platformReceipt.findFirst({
        where: {
          clinicId: dto.clinicId,
          kind: PlatformChargeKind.MONTHLY_HOSTING,
          periodMonth,
        },
      });
      if (dup) {
        throw new BadRequestException(
          `Ya existe cobro de arrendamiento ${periodLabel(periodMonth)} para este consultorio (${dup.number}).`,
        );
      }
    }

    const description =
      dto.description?.trim() ||
      `${KIND_LABEL[dto.kind]} — ${PLAN_LABEL[dto.plan]}${
        periodMonth ? ` (${periodLabel(periodMonth)})` : ''
      }`;

    const number = await this.nextNumber();
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const row = await this.prisma.platformReceipt.create({
      data: {
        number,
        clinicId: dto.clinicId,
        kind: dto.kind,
        plan: dto.plan,
        description,
        amount: new Prisma.Decimal(amount),
        method: dto.method ?? PaymentMethod.TRANSFER,
        paidAt,
        periodMonth,
        notes: dto.notes?.trim() || null,
        createdById: user.id,
      },
      include: {
        clinic: { select: { id: true, name: true, specialty: true, dashboardType: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    if (dto.kind === PlatformChargeKind.MONTHLY_HOSTING) {
      await this.reactivateClinicAfterHostingPayment(
        dto.clinicId,
        periodLabel(periodMonth) || '',
        number,
      );
    }

    return this.mapReceipt(row);
  }

  async hostingStatus(user: User, periodMonthRaw: string) {
    this.assertSuperAdmin(user);
    const periodMonth = parsePeriodMonth(periodMonthRaw);
    const period = periodLabel(periodMonth)!;

    const clinics = await this.prisma.clinic.findMany({
      where: { dashboardType: { not: null } },
      select: {
        id: true,
        name: true,
        isActive: true,
        dashboardType: true,
        hostingPeriodDue: true,
        hostingSuspendedAt: true,
        hostingDueNotifiedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    const paid = await this.prisma.platformReceipt.findMany({
      where: {
        kind: PlatformChargeKind.MONTHLY_HOSTING,
        periodMonth,
      },
      select: { clinicId: true, number: true, amount: true, paidAt: true },
    });
    const paidByClinic = new Map(paid.map((p) => [p.clinicId, p]));

    return clinics.map((c) => {
      const receipt = paidByClinic.get(c.id);
      const status = receipt
        ? 'PAID'
        : c.hostingSuspendedAt
          ? 'SUSPENDED'
          : 'UNPAID';
      return {
        clinicId: c.id,
        clinicName: c.name,
        dashboardType: c.dashboardType,
        plan: planFromDashboard(c.dashboardType),
        periodMonth: period,
        status,
        receiptNumber: receipt?.number ?? null,
        amountPaid: receipt ? money(receipt.amount) : null,
        paidAt: receipt?.paidAt?.toISOString() ?? null,
        hostingSuspendedAt: c.hostingSuspendedAt?.toISOString() ?? null,
        hostingDueNotifiedAt: c.hostingDueNotifiedAt?.toISOString() ?? null,
      };
    });
  }

  async notifyHostingDue(user: User, dto: HostingPeriodDto) {
    this.assertSuperAdmin(user);
    const periodMonth = parsePeriodMonth(dto.periodMonth);
    const period = periodLabel(periodMonth)!;
    const targets = await this.unpaidClinics(periodMonth, dto.clinicId);
    const results: Array<{
      clinicId: string;
      clinicName: string;
      notified: boolean;
      emails: string[];
      detail?: string;
    }> = [];

    for (const clinic of targets) {
      const emails = await this.notifyClinicAdmins(clinic.id, clinic.name, {
        subject: `Arrendamiento pendiente — ${clinic.name}`,
        body: [
          `Estimado(a) administrador(a) de ${clinic.name},`,
          '',
          `Le informamos que el arrendamiento mensual del espacio en el servidor de HabiliSALUD correspondiente al periodo ${period} aún no está registrado.`,
          '',
          'Debe ponerse al día con el pago para evitar la suspensión del acceso de los usuarios del consultorio.',
          '',
          'Si ya realizó el pago, confirme con HabiliSALUD para registrar el recibo.',
          '',
          'Atentamente,',
          'HabiliSALUD',
        ].join('\n'),
      });
      await this.prisma.clinic.update({
        where: { id: clinic.id },
        data: {
          hostingPeriodDue: periodMonth,
          hostingDueNotifiedAt: new Date(),
        },
      });
      results.push({
        clinicId: clinic.id,
        clinicName: clinic.name,
        notified: emails.length > 0,
        emails,
        detail: emails.length ? undefined : 'Sin admin con correo',
      });
    }

    return {
      periodMonth: period,
      count: results.length,
      results,
    };
  }

  async suspendUnpaidHosting(user: User, dto: HostingPeriodDto) {
    this.assertSuperAdmin(user);
    const periodMonth = parsePeriodMonth(dto.periodMonth);
    const period = periodLabel(periodMonth)!;
    const targets = await this.unpaidClinics(periodMonth, dto.clinicId);
    const results: Array<{
      clinicId: string;
      clinicName: string;
      deactivatedUsers: number;
      emails: string[];
    }> = [];

    for (const clinic of targets) {
      if (clinic.hostingSuspendedAt) {
        // Ya suspendido: reenviar aviso
        const emails = await this.notifyClinicAdmins(clinic.id, clinic.name, {
          subject: `Acceso suspendido — póngase al día — ${clinic.name}`,
          body: this.suspendMessage(clinic.name, period),
        });
        results.push({
          clinicId: clinic.id,
          clinicName: clinic.name,
          deactivatedUsers: 0,
          emails,
        });
        continue;
      }

      const deactivated = await this.prisma.user.updateMany({
        where: {
          clinicId: clinic.id,
          role: { not: UserRole.SUPER_ADMIN },
          isActive: true,
        },
        data: { isActive: false },
      });

      await this.prisma.clinic.update({
        where: { id: clinic.id },
        data: {
          hostingPeriodDue: periodMonth,
          hostingSuspendedAt: new Date(),
          hostingDueNotifiedAt: new Date(),
        },
      });

      const emails = await this.notifyClinicAdmins(clinic.id, clinic.name, {
        subject: `Acceso suspendido — póngase al día — ${clinic.name}`,
        body: this.suspendMessage(clinic.name, period),
      });

      results.push({
        clinicId: clinic.id,
        clinicName: clinic.name,
        deactivatedUsers: deactivated.count,
        emails,
      });
    }

    return {
      periodMonth: period,
      suspendedCount: results.length,
      results,
    };
  }

  private suspendMessage(clinicName: string, period: string) {
    return [
      `Estimado(a) administrador(a) de ${clinicName},`,
      '',
      `El acceso de los usuarios de su consultorio fue desactivado porque no figura el pago del arrendamiento mensual del servidor de HabiliSALUD del periodo ${period}.`,
      '',
      'Debe ponerse al día con HabiliSALUD. Cuando el pago quede registrado, reactivaremos automáticamente los usuarios del consultorio.',
      '',
      'Atentamente,',
      'HabiliSALUD',
    ].join('\n');
  }

  private async unpaidClinics(periodMonth: Date, clinicId?: string) {
    const paid = await this.prisma.platformReceipt.findMany({
      where: {
        kind: PlatformChargeKind.MONTHLY_HOSTING,
        periodMonth,
        ...(clinicId ? { clinicId } : {}),
      },
      select: { clinicId: true },
    });
    const paidIds = new Set(paid.map((p) => p.clinicId));

    const clinics = await this.prisma.clinic.findMany({
      where: {
        dashboardType: { not: null },
        ...(clinicId ? { id: clinicId } : {}),
      },
      select: {
        id: true,
        name: true,
        hostingSuspendedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return clinics.filter((c) => !paidIds.has(c.id));
  }

  private async reactivateClinicAfterHostingPayment(
    clinicId: string,
    period: string,
    receiptNumber: string,
  ) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { name: true, hostingSuspendedAt: true },
    });
    if (!clinic) return;

    const wasSuspended = !!clinic.hostingSuspendedAt;

    await this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        hostingSuspendedAt: null,
        hostingPeriodDue: null,
      },
    });

    if (!wasSuspended) return;

    await this.prisma.user.updateMany({
      where: {
        clinicId,
        role: { not: UserRole.SUPER_ADMIN },
        isActive: false,
      },
      data: { isActive: true },
    });

    await this.notifyClinicAdmins(clinicId, clinic.name, {
      subject: `Acceso restablecido — ${clinic.name}`,
      body: [
        `Estimado(a) administrador(a) de ${clinic.name},`,
        '',
        `Confirmamos el registro del pago de arrendamiento (recibo ${receiptNumber}${period ? ` · periodo ${period}` : ''}).`,
        '',
        'Los usuarios del consultorio han sido reactivados y ya pueden ingresar a HabiliSALUD.',
        '',
        'Atentamente,',
        'HabiliSALUD',
      ].join('\n'),
    });
  }

  private async notifyClinicAdmins(
    clinicId: string,
    clinicName: string,
    message: { subject: string; body: string },
  ) {
    const admins = await this.prisma.user.findMany({
      where: {
        clinicId,
        role: UserRole.ADMIN,
      },
      select: { email: true, fullName: true, isActive: true },
    });
    // Incluir admins aunque estén desactivados: deben recibir el aviso de mora/reactivación.
    const emails: string[] = [];
    for (const admin of admins) {
      if (!admin.email) continue;
      try {
        await this.email.send({
          destination: admin.email,
          subject: message.subject,
          body: message.body,
        });
        emails.push(admin.email);
      } catch {
        // Continuar con otros admins
      }
    }
    return emails;
  }

  async generateMonthlyHosting(user: User, dto: GenerateMonthlyHostingDto) {
    this.assertSuperAdmin(user);
    const periodMonth = parsePeriodMonth(dto.periodMonth);
    const method = dto.method ?? PaymentMethod.TRANSFER;
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    const clinics = await this.prisma.clinic.findMany({
      where: {
        isActive: true,
        ...(dto.clinicId ? { id: dto.clinicId } : {}),
        dashboardType: { not: null },
      },
      select: { id: true, name: true, dashboardType: true },
    });

    const created: ReturnType<PlatformBillingService['mapReceipt']>[] = [];
    const skipped: Array<{ clinicId: string; clinicName: string; reason: string }> = [];

    for (const clinic of clinics) {
      const plan = planFromDashboard(clinic.dashboardType);
      const existing = await this.prisma.platformReceipt.findFirst({
        where: {
          clinicId: clinic.id,
          kind: PlatformChargeKind.MONTHLY_HOSTING,
          periodMonth,
        },
      });
      if (existing) {
        skipped.push({
          clinicId: clinic.id,
          clinicName: clinic.name,
          reason: `Ya cobrado (${existing.number})`,
        });
        continue;
      }
      try {
        const receipt = await this.createReceipt(user, {
          clinicId: clinic.id,
          kind: PlatformChargeKind.MONTHLY_HOSTING,
          plan,
          amount: dto.amount,
          method,
          paidAt: paidAt.toISOString(),
          periodMonth: dto.periodMonth,
        });
        created.push(receipt);
      } catch (err) {
        skipped.push({
          clinicId: clinic.id,
          clinicName: clinic.name,
          reason: err instanceof Error ? err.message : 'Error',
        });
      }
    }

    return {
      periodMonth: dto.periodMonth,
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    };
  }

  async monthlyIncome(user: User, year?: number) {
    this.assertSuperAdmin(user);
    const y = year || new Date().getFullYear();
    const from = new Date(Date.UTC(y, 0, 1));
    const to = new Date(Date.UTC(y + 1, 0, 1));
    const rows = await this.prisma.platformReceipt.findMany({
      where: { paidAt: { gte: from, lt: to } },
      select: { paidAt: true, amount: true, kind: true },
    });

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: `${y}-${String(i + 1).padStart(2, '0')}`,
      total: 0,
      setup: 0,
      hosting: 0,
      other: 0,
      count: 0,
    }));

    for (const r of rows) {
      const partsPaid = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
      }).formatToParts(r.paidAt);
      const mNum = Number(partsPaid.find((p) => p.type === 'month')?.value || '1') - 1;
      const bucket = months[mNum];
      const amt = money(r.amount);
      bucket.total += amt;
      bucket.count += 1;
      if (r.kind === PlatformChargeKind.CLINIC_SETUP) bucket.setup += amt;
      else if (r.kind === PlatformChargeKind.MONTHLY_HOSTING) bucket.hosting += amt;
      else bucket.other += amt;
    }

    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(now);
    const yy = parts.find((p) => p.type === 'year')?.value;
    const mm = parts.find((p) => p.type === 'month')?.value;
    const currentMonthKey = `${yy}-${mm}`;
    const current = months.find((m) => m.month === currentMonthKey) || {
      month: currentMonthKey,
      total: 0,
      setup: 0,
      hosting: 0,
      other: 0,
      count: 0,
    };

    return {
      year: y,
      currentMonth: {
        month: currentMonthKey,
        total: current.total,
        setup: current.setup,
        hosting: current.hosting,
        other: current.other,
        count: current.count,
      },
      yearTotal: months.reduce((s, m) => s + m.total, 0),
      months,
    };
  }

  async summary(user: User, from?: string, to?: string) {
    this.assertSuperAdmin(user);
    const where: Prisma.PlatformReceiptWhereInput = {};
    if (from || to) {
      where.paidAt = {};
      if (from) where.paidAt.gte = new Date(`${from}T00:00:00.000-05:00`);
      if (to) where.paidAt.lte = new Date(`${to}T23:59:59.999-05:00`);
    }
    const rows = await this.prisma.platformReceipt.findMany({
      where,
      select: { amount: true, kind: true, method: true },
    });
    const byKind: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      const amt = money(r.amount);
      total += amt;
      byKind[r.kind] = (byKind[r.kind] || 0) + amt;
      byMethod[r.method] = (byMethod[r.method] || 0) + amt;
    }
    return {
      total,
      count: rows.length,
      byKind: Object.entries(byKind).map(([kind, amount]) => ({
        kind,
        kindLabel: KIND_LABEL[kind as PlatformChargeKind] || kind,
        amount,
      })),
      byMethod: Object.entries(byMethod).map(([method, amount]) => ({
        method,
        methodLabel: METHOD_LABEL[method as PaymentMethod] || method,
        amount,
      })),
    };
  }

  async receiptPdf(user: User, id: string) {
    this.assertSuperAdmin(user);
    const row = await this.prisma.platformReceipt.findUnique({
      where: { id },
      include: {
        clinic: { select: { name: true } },
        createdBy: { select: { fullName: true } },
      },
    });
    if (!row) throw new NotFoundException('Recibo no encontrado');
    const buffer = await this.pdfService.build({
      number: row.number,
      paidAt: row.paidAt,
      clinicName: row.clinic.name,
      kindLabel: KIND_LABEL[row.kind],
      planLabel: PLAN_LABEL[row.plan],
      description: row.description,
      amount: money(row.amount),
      method: METHOD_LABEL[row.method],
      periodLabel: periodLabel(row.periodMonth),
      notes: row.notes,
      createdByName: row.createdBy?.fullName,
    });
    return { buffer, filename: `${row.number}.pdf` };
  }

  suggestedPlan(dashboardType: DashboardType | null | undefined): PlatformPlanVariant {
    return planFromDashboard(dashboardType);
  }

  private async resolveFeeAmount(kind: PlatformChargeKind, plan: PlatformPlanVariant) {
    await this.ensureDefaultFees();
    const fee = await this.prisma.platformFee.findFirst({
      where: { kind, plan, isActive: true },
    });
    if (!fee) {
      throw new BadRequestException('No hay tarifa configurada para este concepto/plan');
    }
    return money(fee.amount);
  }

  private async nextNumber() {
    const year = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
    }).format(new Date());
    const prefix = `HS-${year}-`;
    const last = await this.prisma.platformReceipt.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const seq = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  private async ensureDefaultFees() {
    const count = await this.prisma.platformFee.count();
    if (count > 0) return;
    const defaults: Array<{
      code: string;
      label: string;
      kind: PlatformChargeKind;
      plan: PlatformPlanVariant;
      amount: number;
    }> = [
      {
        code: 'SETUP_WITHOUT_DOCS',
        label: 'Alta consultorio sin documentación',
        kind: PlatformChargeKind.CLINIC_SETUP,
        plan: PlatformPlanVariant.WITHOUT_DOCS,
        amount: 500000,
      },
      {
        code: 'SETUP_WITH_DOCS',
        label: 'Alta consultorio con documentación',
        kind: PlatformChargeKind.CLINIC_SETUP,
        plan: PlatformPlanVariant.WITH_DOCS,
        amount: 900000,
      },
      {
        code: 'HOSTING_WITHOUT_DOCS',
        label: 'Arrendamiento mensual servidor (sin docs)',
        kind: PlatformChargeKind.MONTHLY_HOSTING,
        plan: PlatformPlanVariant.WITHOUT_DOCS,
        amount: 180000,
      },
      {
        code: 'HOSTING_WITH_DOCS',
        label: 'Arrendamiento mensual servidor (con docs)',
        kind: PlatformChargeKind.MONTHLY_HOSTING,
        plan: PlatformPlanVariant.WITH_DOCS,
        amount: 280000,
      },
    ];
    await this.prisma.platformFee.createMany({
      data: defaults.map((d) => ({
        ...d,
        amount: new Prisma.Decimal(d.amount),
      })),
      skipDuplicates: true,
    });
  }

  private mapReceipt(r: {
    id: string;
    number: string;
    clinicId: string;
    kind: PlatformChargeKind;
    plan: PlatformPlanVariant;
    description: string;
    amount: Prisma.Decimal;
    currency: string;
    method: PaymentMethod;
    paidAt: Date;
    periodMonth: Date | null;
    notes: string | null;
    createdAt: Date;
    clinic?: {
      id: string;
      name: string;
      specialty: string;
      dashboardType: DashboardType | null;
    };
    createdBy?: { id: string; fullName: string } | null;
  }) {
    return {
      id: r.id,
      number: r.number,
      clinicId: r.clinicId,
      clinic: r.clinic ?? null,
      kind: r.kind,
      kindLabel: KIND_LABEL[r.kind],
      plan: r.plan,
      planLabel: PLAN_LABEL[r.plan],
      description: r.description,
      amount: money(r.amount),
      currency: r.currency,
      method: r.method,
      methodLabel: METHOD_LABEL[r.method],
      paidAt: r.paidAt.toISOString(),
      periodMonth: periodLabel(r.periodMonth),
      notes: r.notes,
      createdBy: r.createdBy ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
