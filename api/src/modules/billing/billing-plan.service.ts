import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import {
  BillablePlanItem,
  dentalPlanItems,
  orthoBudgetItems,
  orthoFinancing,
  physioPlanItems,
  psychPlanItems,
} from './treatment-plan-items';

type Json = Record<string, unknown>;
type Tx = Prisma.TransactionClient | PrismaService;

const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});

const RECORD_BY_SPECIALTY: Record<string, { code: string; specialty: string }> = {
  DENTISTRY: { code: 'HC-ODO-001', specialty: 'Odontología' },
  ORTHODONTICS: { code: 'HC-ORT-001', specialty: 'Ortodoncia' },
  PHYSIOTHERAPY: { code: 'HC-FT-001', specialty: 'Fisioterapia' },
  PSYCHOLOGY: { code: 'HC-PSI', specialty: 'Psicología' },
  AESTHETIC: { code: 'HC-AES', specialty: 'Medicina estética' },
};

export interface PlanItemBalance extends BillablePlanItem {
  paid: number;
  balance: number;
}

/**
 * Cruce entre el plan de tratamiento de la historia (odontología, ortodoncia, fisioterapia y psicología) y los recibos
 * de caja: cada línea de recibo puede abonar a un procedimiento o concepto del presupuesto.
 */
@Injectable()
export class BillingPlanService {
  constructor(private readonly prisma: PrismaService) {}

  private clinicOf(user: User) {
    if (!user.clinicId) throw new ForbiddenException('Usuario sin consultorio asignado');
    return user.clinicId;
  }

  async planForPatient(user: User, patientId: string) {
    const clinicId = this.clinicOf(user);
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        secondLastName: true,
        documentType: true,
        documentNumber: true,
        phone: true,
        email: true,
        eps: true,
      },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const items = await this.itemsFor(this.prisma, clinicId, patientId);
    const encounter = items.encounter;
    const withPaid = await this.attachPaid(this.prisma, clinicId, patientId, items.list);

    const sum = (rows: PlanItemBalance[], k: 'net' | 'paid' | 'balance') => rows.reduce((s, r) => s + r[k], 0);
    const plan = withPaid.filter((i) => i.source !== 'ORTHO');
    const ortho = withPaid.filter((i) => i.source === 'ORTHO');
    const record = RECORD_BY_SPECIALTY[encounter?.specialtySnapshot ?? ''] ?? RECORD_BY_SPECIALTY.DENTISTRY;

    return {
      patient: {
        id: patient.id,
        fullName: [patient.firstName, patient.middleName, patient.lastName, patient.secondLastName]
          .filter(Boolean)
          .join(' '),
        document: [patient.documentType, patient.documentNumber].filter(Boolean).join(' '),
        phone: patient.phone,
        email: patient.email,
        eps: patient.eps,
      },
      record: encounter
        ? {
            encounterId: encounter.id,
            code: record.code,
            specialty: record.specialty,
            signed: !!encounter.clinicalRecord?.signedAt,
            includesOrtho: ortho.length > 0,
          }
        : null,
      plan: { items: plan, net: sum(plan, 'net'), paid: sum(plan, 'paid'), balance: sum(plan, 'balance') },
      ortho: {
        items: ortho,
        net: sum(ortho, 'net'),
        paid: sum(ortho, 'paid'),
        balance: sum(ortho, 'balance'),
        financing: orthoFinancing(items.orthoBudget, sum(ortho, 'net')),
      },
      totals: { net: sum(withPaid, 'net'), paid: sum(withPaid, 'paid'), balance: sum(withPaid, 'balance') },
    };
  }

  /** Valida las líneas del recibo que abonan al plan y devuelve el encuentro de la historia. */
  async validateLines(
    tx: Tx,
    clinicId: string,
    patientId: string,
    lines: Array<{ planItemKey?: string; quantity?: number; unitPrice: number }>,
  ) {
    const linked = lines.filter((l) => l.planItemKey);
    if (!linked.length) return null;
    const items = await this.itemsFor(tx, clinicId, patientId);
    const balances = new Map(
      (await this.attachPaid(tx, clinicId, patientId, items.list)).map((i) => [i.key, i]),
    );
    const charged = new Map<string, number>();
    for (const l of linked) {
      const item = balances.get(l.planItemKey!);
      if (!item) {
        throw new BadRequestException(
          'Un procedimiento del recibo ya no está en el plan de tratamiento. Recargue el plan del paciente.',
        );
      }
      const amount = (l.quantity && l.quantity > 0 ? l.quantity : 1) * l.unitPrice;
      const total = (charged.get(item.key) ?? 0) + amount;
      if (total > item.balance + 1) {
        throw new BadRequestException(
          `«${item.label}» tiene un saldo de $${Math.round(item.balance).toLocaleString('es-CO')}; el recibo supera ese valor.`,
        );
      }
      charged.set(item.key, total);
    }
    return { encounterId: items.encounter?.id ?? null, sources: new Map([...balances].map(([k, v]) => [k, v.source])) };
  }

  private async itemsFor(tx: Tx, clinicId: string, patientId: string) {
    const encounter = await tx.encounter.findFirst({
      where: { patientId, clinicId, clinicalRecord: { isNot: null } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        specialtySnapshot: true,
        clinicalRecord: { select: { content: true, signedAt: true } },
      },
    });
    const content = obj(encounter?.clinicalRecord?.content);
    const dentistry = obj(content.dentistry);
    const tracking = await tx.orthoTracking.findUnique({ where: { patientId }, select: { clinicId: true, data: true } });
    const liveBudget = tracking && tracking.clinicId === clinicId ? obj(obj(tracking.data).orthoBudget) : null;
    const orthoBudget = liveBudget && Object.keys(liveBudget).length ? liveBudget : obj(dentistry.orthoBudget);
    return {
      encounter,
      orthoBudget,
      list: [
        ...dentalPlanItems(dentistry),
        ...orthoBudgetItems(orthoBudget),
        ...physioPlanItems(obj(content.physiotherapy)),
        ...psychPlanItems(obj(content.psychology)),
      ],
    };
  }

  private async attachPaid(tx: Tx, clinicId: string, patientId: string, list: BillablePlanItem[]): Promise<PlanItemBalance[]> {
    const paidRows = await tx.invoiceItem.findMany({
      where: {
        planItemKey: { not: null },
        invoice: { clinicId, patientId, status: InvoiceStatus.ISSUED },
      },
      select: { planItemKey: true, quantity: true, unitPrice: true },
    });
    const paid = new Map<string, number>();
    for (const r of paidRows) {
      paid.set(r.planItemKey!, (paid.get(r.planItemKey!) ?? 0) + r.quantity * Number(r.unitPrice));
    }
    return list.map((i) => {
      const p = Math.round(paid.get(i.key) ?? 0);
      return { ...i, paid: p, balance: Math.max(0, i.net - p) };
    });
  }
}
