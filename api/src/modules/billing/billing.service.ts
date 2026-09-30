import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingMode,
  InvoiceStatus,
  PackageStatus,
  PaymentMethod,
  Prisma,
  TransactionType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import {
  CreateExpenseDto,
  CreatePackageDto,
  CreateReceiptDto,
} from './dto/billing.dto';
import { ReceiptPdfService } from './receipt-pdf.service';
import { BillingPlanService } from './billing-plan.service';

const BILLING_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.RECEPTIONIST,
  UserRole.HEALTH_PROFESSIONAL,
];

function money(n: Prisma.Decimal | number | string) {
  return Number(n);
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: ReceiptPdfService,
    private readonly planService: BillingPlanService,
  ) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  private assertBillingAccess(user: User) {
    if (!BILLING_ROLES.includes(user.role as UserRole)) {
      throw new ForbiddenException('No tiene permiso para el módulo de caja');
    }
  }

  private methodLabel(method: PaymentMethod) {
    const map: Record<PaymentMethod, string> = {
      CASH: 'Efectivo',
      TRANSFER: 'Transferencia',
      CARD: 'Tarjeta',
      PSE: 'PSE',
      NEQUI: 'Nequi',
      DAVIPLATA: 'Daviplata',
      OTHER: 'Otro',
    };
    return map[method] || method;
  }

  private async nextReceiptNumber(clinicId: string, tx: Prisma.TransactionClient) {
    const year = new Date().getFullYear();
    const prefix = `RC-${year}-`;
    const last = await tx.invoice.findFirst({
      where: { clinicId, number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    let seq = 1;
    if (last?.number) {
      const tail = last.number.slice(prefix.length);
      const n = Number.parseInt(tail, 10);
      if (Number.isFinite(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  async listReceipts(user: User, from?: string, to?: string) {
    this.assertBillingAccess(user);
    const clinicId = this.requireClinicId(user);
    const paidFrom = from ? new Date(from) : undefined;
    const paidTo = to ? new Date(to) : undefined;
    if (paidTo) paidTo.setHours(23, 59, 59, 999);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        clinicId,
        status: InvoiceStatus.ISSUED,
        ...(paidFrom || paidTo
          ? {
              issuedAt: {
                ...(paidFrom ? { gte: paidFrom } : {}),
                ...(paidTo ? { lte: paidTo } : {}),
              },
            }
          : {}),
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentType: true,
            documentNumber: true,
          },
        },
        items: true,
        transactions: true,
      },
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });

    return invoices.map((inv) => ({
      id: inv.id,
      number: inv.number,
      issuedAt: inv.issuedAt,
      status: inv.status,
      subtotal: money(inv.subtotal),
      tax: money(inv.tax),
      total: money(inv.total),
      patient: inv.patient,
      appointmentId: inv.appointmentId,
      method: inv.transactions[0]?.method ?? PaymentMethod.CASH,
      items: inv.items.map((it) => ({
        id: it.id,
        description: it.description,
        cupsCode: it.cupsCode,
        quantity: it.quantity,
        unitPrice: money(it.unitPrice),
        packageId: it.packageId,
      })),
    }));
  }

  async createReceipt(user: User, dto: CreateReceiptDto) {
    this.assertBillingAccess(user);
    const clinicId = this.requireClinicId(user);

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    if (dto.appointmentId) {
      const appt = await this.prisma.appointment.findFirst({
        where: { id: dto.appointmentId, clinicId, patientId: dto.patientId },
      });
      if (!appt) throw new BadRequestException('Cita no válida para este paciente');
    }

    let subtotal = 0;
    for (const item of dto.items) {
      const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
      subtotal += qty * item.unitPrice;
    }
    const tax = dto.tax ?? 0;
    const total = subtotal + tax;
    const method = dto.method ?? PaymentMethod.CASH;
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const planLink = await this.planService.validateLines(tx, clinicId, dto.patientId, dto.items);
      for (const item of dto.items) {
        if (!item.packageId) continue;
        const pkg = await tx.sessionPackage.findFirst({
          where: {
            id: item.packageId,
            clinicId,
            patientId: dto.patientId,
            status: PackageStatus.ACTIVE,
          },
        });
        if (!pkg) {
          throw new BadRequestException('Paquete de sesiones no válido o agotado');
        }
        if (pkg.usedSessions >= pkg.totalSessions) {
          throw new BadRequestException(`El paquete «${pkg.name}» ya está agotado`);
        }
        const used = pkg.usedSessions + 1;
        await tx.sessionPackage.update({
          where: { id: pkg.id },
          data: {
            usedSessions: used,
            status:
              used >= pkg.totalSessions
                ? PackageStatus.EXHAUSTED
                : PackageStatus.ACTIVE,
          },
        });
      }

      const number = await this.nextReceiptNumber(clinicId, tx);
      const invoice = await tx.invoice.create({
        data: {
          clinicId,
          patientId: dto.patientId,
          appointmentId: dto.appointmentId ?? null,
          encounterId: dto.encounterId ?? planLink?.encounterId ?? null,
          number,
          issuedAt: paidAt,
          status: InvoiceStatus.ISSUED,
          billingMode: BillingMode.RECEIPT_ONLY,
          subtotal,
          tax,
          total,
          items: {
            create: dto.items.map((item) => ({
              description: item.description.trim(),
              cupsCode: item.cupsCode?.trim() || null,
              quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
              unitPrice: item.unitPrice,
              packageId: item.packageId ?? null,
              appointmentId: item.appointmentId ?? dto.appointmentId ?? null,
              planItemKey: item.planItemKey ?? null,
              planSource: item.planItemKey ? planLink?.sources.get(item.planItemKey) ?? null : null,
            })),
          },
        },
        include: {
          patient: true,
          items: true,
        },
      });

      await tx.transaction.create({
        data: {
          clinicId,
          type: TransactionType.INCOME,
          category: 'RECIBO_CAJA',
          amount: total,
          invoiceId: invoice.id,
          paidAt,
          method,
          notes: dto.notes?.trim() || null,
          createdById: user.id,
        },
      });

      return invoice;
    });

    return this.getReceipt(user, created.id);
  }

  async getReceipt(user: User, id: string) {
    this.assertBillingAccess(user);
    const clinicId = this.requireClinicId(user);
    const inv = await this.prisma.invoice.findFirst({
      where: { id, clinicId },
      include: {
        patient: true,
        items: true,
        transactions: true,
        clinic: { select: { name: true, address: true, phone: true } },
      },
    });
    if (!inv) throw new NotFoundException('Recibo no encontrado');
    return {
      id: inv.id,
      number: inv.number,
      issuedAt: inv.issuedAt,
      status: inv.status,
      subtotal: money(inv.subtotal),
      tax: money(inv.tax),
      total: money(inv.total),
      patient: inv.patient,
      appointmentId: inv.appointmentId,
      method: inv.transactions[0]?.method ?? PaymentMethod.CASH,
      notes: inv.transactions[0]?.notes ?? null,
      items: inv.items.map((it) => ({
        id: it.id,
        description: it.description,
        cupsCode: it.cupsCode,
        quantity: it.quantity,
        unitPrice: money(it.unitPrice),
        packageId: it.packageId,
      })),
      clinic: inv.clinic,
    };
  }

  async receiptPdf(user: User, id: string) {
    const receipt = await this.getReceipt(user, id);
    const patientName = [receipt.patient.firstName, receipt.patient.lastName]
      .filter(Boolean)
      .join(' ');
    const buffer = await this.pdfService.build({
      clinicName: receipt.clinic.name,
      clinicAddress: receipt.clinic.address,
      clinicPhone: receipt.clinic.phone,
      number: receipt.number,
      issuedAt: receipt.issuedAt ? new Date(receipt.issuedAt) : new Date(),
      patientName,
      patientDocument: `${receipt.patient.documentType} ${receipt.patient.documentNumber}`,
      method: this.methodLabel(receipt.method),
      notes: receipt.notes,
      items: receipt.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        lineTotal: it.quantity * it.unitPrice,
      })),
      subtotal: receipt.subtotal,
      tax: receipt.tax,
      total: receipt.total,
      createdByName: user.fullName,
    });
    return { buffer, filename: `${receipt.number}.pdf` };
  }

  async listExpenses(user: User, from?: string, to?: string) {
    this.assertBillingAccess(user);
    const clinicId = this.requireClinicId(user);
    const paidFrom = from ? new Date(from) : undefined;
    const paidTo = to ? new Date(to) : undefined;
    if (paidTo) paidTo.setHours(23, 59, 59, 999);

    const rows = await this.prisma.transaction.findMany({
      where: {
        clinicId,
        type: TransactionType.EXPENSE,
        ...(paidFrom || paidTo
          ? {
              paidAt: {
                ...(paidFrom ? { gte: paidFrom } : {}),
                ...(paidTo ? { lte: paidTo } : {}),
              },
            }
          : {}),
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 200,
    });

    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      amount: money(r.amount),
      method: r.method,
      paidAt: r.paidAt,
      notes: r.notes,
      createdBy: r.createdBy,
    }));
  }

  async createExpense(user: User, dto: CreateExpenseDto) {
    this.assertBillingAccess(user);
    const clinicId = this.requireClinicId(user);
    const row = await this.prisma.transaction.create({
      data: {
        clinicId,
        type: TransactionType.EXPENSE,
        category: dto.category.trim(),
        amount: dto.amount,
        method: dto.method ?? PaymentMethod.CASH,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        notes: dto.notes?.trim() || null,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    return {
      id: row.id,
      category: row.category,
      amount: money(row.amount),
      method: row.method,
      paidAt: row.paidAt,
      notes: row.notes,
      createdBy: row.createdBy,
    };
  }

  async listPackages(user: User, patientId?: string) {
    this.assertBillingAccess(user);
    const clinicId = this.requireClinicId(user);
    const rows = await this.prisma.sessionPackage.findMany({
      where: {
        clinicId,
        ...(patientId ? { patientId } : {}),
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentNumber: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      totalSessions: p.totalSessions,
      usedSessions: p.usedSessions,
      remaining: Math.max(0, p.totalSessions - p.usedSessions),
      unitPrice: money(p.unitPrice),
      cupsCode: p.cupsCode,
      status: p.status,
      patient: p.patient,
      createdAt: p.createdAt,
    }));
  }

  async createPackage(user: User, dto: CreatePackageDto) {
    this.assertBillingAccess(user);
    const clinicId = this.requireClinicId(user);
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const row = await this.prisma.sessionPackage.create({
      data: {
        clinicId,
        patientId: dto.patientId,
        name: dto.name.trim(),
        totalSessions: dto.totalSessions,
        unitPrice: dto.unitPrice,
        cupsCode: dto.cupsCode?.trim() || null,
        status: PackageStatus.ACTIVE,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentNumber: true,
          },
        },
      },
    });

    return {
      id: row.id,
      name: row.name,
      totalSessions: row.totalSessions,
      usedSessions: row.usedSessions,
      remaining: row.totalSessions,
      unitPrice: money(row.unitPrice),
      cupsCode: row.cupsCode,
      status: row.status,
      patient: row.patient,
      createdAt: row.createdAt,
    };
  }

  async dailyClose(user: User, date?: string) {
    this.assertBillingAccess(user);
    const clinicId = this.requireClinicId(user);
    const day = date ? new Date(date) : new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const rows = await this.prisma.transaction.findMany({
      where: {
        clinicId,
        paidAt: { gte: start, lte: end },
      },
      orderBy: { paidAt: 'asc' },
    });

    let income = 0;
    let expense = 0;
    const byMethod: Record<string, { income: number; expense: number }> = {};

    for (const r of rows) {
      const amount = money(r.amount);
      const key = r.method;
      if (!byMethod[key]) byMethod[key] = { income: 0, expense: 0 };
      if (r.type === TransactionType.INCOME) {
        income += amount;
        byMethod[key].income += amount;
      } else {
        expense += amount;
        byMethod[key].expense += amount;
      }
    }

    return {
      date: start.toISOString().slice(0, 10),
      income,
      expense,
      net: income - expense,
      byMethod: Object.entries(byMethod).map(([method, v]) => ({
        method,
        methodLabel: this.methodLabel(method as PaymentMethod),
        ...v,
        net: v.income - v.expense,
      })),
      count: rows.length,
    };
  }

  async summary(user: User, from?: string, to?: string) {
    this.assertBillingAccess(user);
    const clinicId = this.requireClinicId(user);
    const paidFrom = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const paidTo = to ? new Date(to) : new Date();
    paidTo.setHours(23, 59, 59, 999);

    const rows = await this.prisma.transaction.findMany({
      where: {
        clinicId,
        paidAt: { gte: paidFrom, lte: paidTo },
      },
    });

    let income = 0;
    let expense = 0;
    for (const r of rows) {
      const amount = money(r.amount);
      if (r.type === TransactionType.INCOME) income += amount;
      else expense += amount;
    }

    return {
      from: paidFrom.toISOString().slice(0, 10),
      to: paidTo.toISOString().slice(0, 10),
      income,
      expense,
      net: income - expense,
      transactions: rows.length,
    };
  }
}
