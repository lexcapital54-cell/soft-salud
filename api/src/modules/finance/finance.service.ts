import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PayrollNoveltyType,
  PayrollRunStatus,
  Prisma,
  SupplyCategory,
  SupplyMovementType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import {
  CreatePayrollNoveltyDto,
  CreateSupplyMovementDto,
  UpdatePayrollRunStatusDto,
  UpdatePayrollSettingsDto,
  UpsertPayrollRunDto,
  UpsertSupplyItemDto,
} from './dto/finance.dto';

const DEFAULT_SMMLV = 1_750_905;
const DEFAULT_TRANSPORT = 249_095;

function money(n: Prisma.Decimal | number | string | null | undefined) {
  return Number(n ?? 0);
}

function periodOk(period: string) {
  return /^\d{4}-\d{2}$/.test(period);
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Solo el administrador del consultorio con el módulo Finanzas activo. */
  private async requireFinanceClinic(user: User) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo el administrador del consultorio puede usar Operación y Finanzas');
    }
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { id: true, financeEnabled: true, name: true },
    });
    if (!clinic) throw new NotFoundException('Consultorio no encontrado');
    if (!clinic.financeEnabled) {
      throw new ForbiddenException('El módulo Operación y Finanzas no está activo en este consultorio');
    }
    return clinic.id;
  }

  private mapRun(r: {
    id: string;
    period: string;
    employeeName: string;
    idNumber: string;
    role: string | null;
    department: string | null;
    payDate: Date | null;
    status: PayrollRunStatus;
    input: Prisma.JsonValue;
    result: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: r.id,
      period: r.period,
      name: r.employeeName,
      idNumber: r.idNumber,
      role: r.role || '',
      department: r.department || '',
      payDate: r.payDate ? r.payDate.toISOString().slice(0, 10) : null,
      status: r.status,
      input: r.input,
      result: r.result,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private mapItem(i: {
    id: string;
    name: string;
    sku: string | null;
    unit: string;
    lotNumber: string | null;
    expiresAt: Date | null;
    quantity: number;
    unitCost: Prisma.Decimal;
    minStock: number;
    notes: string | null;
    category: SupplyCategory;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const unitCost = money(i.unitCost);
    return {
      id: i.id,
      name: i.name,
      sku: i.sku,
      unit: i.unit,
      lotNumber: i.lotNumber,
      expiresAt: i.expiresAt,
      quantity: i.quantity,
      unitCost,
      minStock: i.minStock,
      notes: i.notes,
      category: i.category,
      stockValue: Math.round(i.quantity * unitCost),
      lowStock: i.minStock > 0 && i.quantity <= i.minStock,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  }

  // ─── Parámetros de nómina ─────────────────────────────────────────────────

  async getPayrollSettings(user: User) {
    const clinicId = await this.requireFinanceClinic(user);
    const row = await this.prisma.payrollSettings.findUnique({ where: { clinicId } });
    if (!row) {
      return { smmlv: DEFAULT_SMMLV, transportAid: DEFAULT_TRANSPORT, exempt114: true, persisted: false };
    }
    return {
      smmlv: money(row.smmlv),
      transportAid: money(row.transportAid),
      exempt114: row.exempt114,
      persisted: true,
    };
  }

  async savePayrollSettings(user: User, dto: UpdatePayrollSettingsDto) {
    const clinicId = await this.requireFinanceClinic(user);
    const row = await this.prisma.payrollSettings.upsert({
      where: { clinicId },
      create: {
        clinicId,
        smmlv: dto.smmlv,
        transportAid: dto.transportAid,
        exempt114: dto.exempt114,
      },
      update: {
        smmlv: dto.smmlv,
        transportAid: dto.transportAid,
        exempt114: dto.exempt114,
      },
    });
    return {
      smmlv: money(row.smmlv),
      transportAid: money(row.transportAid),
      exempt114: row.exempt114,
      persisted: true,
    };
  }

  // ─── Liquidaciones ────────────────────────────────────────────────────────

  async listPayrollRuns(user: User, period?: string) {
    const clinicId = await this.requireFinanceClinic(user);
    if (period && !periodOk(period)) throw new BadRequestException('Periodo inválido (use YYYY-MM)');
    const rows = await this.prisma.payrollRun.findMany({
      where: { clinicId, ...(period ? { period } : {}) },
      orderBy: [{ period: 'desc' }, { employeeName: 'asc' }],
    });
    return rows.map((r) => this.mapRun(r));
  }

  async upsertPayrollRun(user: User, dto: UpsertPayrollRunDto) {
    const clinicId = await this.requireFinanceClinic(user);
    if (!periodOk(dto.period)) throw new BadRequestException('Periodo inválido (use YYYY-MM)');
    const employeeName = dto.employeeName.trim();
    const idNumber = dto.idNumber.trim();
    if (!employeeName || !idNumber) throw new BadRequestException('Nombre e identificación son obligatorios');

    const data = {
      employeeName,
      idNumber,
      role: dto.role?.trim() || null,
      department: dto.department?.trim() || null,
      payDate: dto.payDate ? new Date(dto.payDate) : null,
      status: dto.status ?? PayrollRunStatus.LIQUIDADO,
      input: dto.input as Prisma.InputJsonValue,
      result: dto.result as Prisma.InputJsonValue,
      createdById: user.id,
    };

    const row = await this.prisma.payrollRun.upsert({
      where: {
        clinicId_idNumber_period: { clinicId, idNumber, period: dto.period },
      },
      create: { clinicId, period: dto.period, ...data },
      update: {
        employeeName: data.employeeName,
        role: data.role,
        department: data.department,
        payDate: data.payDate,
        status: data.status,
        input: data.input,
        result: data.result,
      },
    });
    return this.mapRun(row);
  }

  async updatePayrollRunStatus(user: User, id: string, dto: UpdatePayrollRunStatusDto) {
    const clinicId = await this.requireFinanceClinic(user);
    const existing = await this.prisma.payrollRun.findFirst({ where: { id, clinicId } });
    if (!existing) throw new NotFoundException('Liquidación no encontrada');
    const row = await this.prisma.payrollRun.update({
      where: { id },
      data: { status: dto.status },
    });
    return this.mapRun(row);
  }

  async deletePayrollRun(user: User, id: string) {
    const clinicId = await this.requireFinanceClinic(user);
    const existing = await this.prisma.payrollRun.findFirst({ where: { id, clinicId } });
    if (!existing) throw new NotFoundException('Liquidación no encontrada');
    await this.prisma.payrollRun.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Novedades ────────────────────────────────────────────────────────────

  async listNovelties(user: User) {
    const clinicId = await this.requireFinanceClinic(user);
    const rows = await this.prisma.payrollNovelty.findMany({
      where: { clinicId },
      orderBy: { fromDate: 'desc' },
      take: 200,
    });
    return rows.map((n) => ({
      id: n.id,
      employee: n.employeeName,
      type: n.type,
      from: n.fromDate.toISOString().slice(0, 10),
      to: n.toDate.toISOString().slice(0, 10),
      notes: n.notes || '',
      createdAt: n.createdAt,
    }));
  }

  async createNovelty(user: User, dto: CreatePayrollNoveltyDto) {
    const clinicId = await this.requireFinanceClinic(user);
    const employeeName = dto.employeeName.trim();
    if (!employeeName) throw new BadRequestException('Escriba el empleado de la novedad');
    const fromDate = new Date(dto.from);
    const toDate = new Date(dto.to);
    if (toDate < fromDate) throw new BadRequestException('La fecha final no puede ser anterior a la inicial');
    if (!Object.values(PayrollNoveltyType).includes(dto.type)) {
      throw new BadRequestException('Tipo de novedad no válido');
    }
    const row = await this.prisma.payrollNovelty.create({
      data: {
        clinicId,
        employeeName,
        type: dto.type,
        fromDate,
        toDate,
        notes: dto.notes?.trim() || null,
        createdById: user.id,
      },
    });
    return {
      id: row.id,
      employee: row.employeeName,
      type: row.type,
      from: row.fromDate.toISOString().slice(0, 10),
      to: row.toDate.toISOString().slice(0, 10),
      notes: row.notes || '',
      createdAt: row.createdAt,
    };
  }

  async deleteNovelty(user: User, id: string) {
    const clinicId = await this.requireFinanceClinic(user);
    const existing = await this.prisma.payrollNovelty.findFirst({ where: { id, clinicId } });
    if (!existing) throw new NotFoundException('Novedad no encontrada');
    await this.prisma.payrollNovelty.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Inventario ───────────────────────────────────────────────────────────

  async listSupplyItems(user: User) {
    const clinicId = await this.requireFinanceClinic(user);
    const rows = await this.prisma.supplyItem.findMany({
      where: { clinicId },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.mapItem(r));
  }

  async inventorySummary(user: User, from?: string, to?: string) {
    const clinicId = await this.requireFinanceClinic(user);
    const now = new Date();
    const start = from
      ? new Date(from)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = to ? new Date(to) : now;
    if (to) end.setHours(23, 59, 59, 999);

    const [items, movements] = await Promise.all([
      this.prisma.supplyItem.findMany({ where: { clinicId } }),
      this.prisma.supplyMovement.findMany({
        where: { clinicId, movedAt: { gte: start, lte: end } },
      }),
    ]);

    let entriesQty = 0;
    let exitsQty = 0;
    let entriesCost = 0;
    let exitsCost = 0;
    for (const m of movements) {
      const cost = money(m.unitCost) * m.quantity;
      if (m.type === SupplyMovementType.IN) {
        entriesQty += m.quantity;
        entriesCost += cost;
      } else if (m.type === SupplyMovementType.OUT) {
        exitsQty += m.quantity;
        exitsCost += cost;
      }
    }

    const stockValue = items.reduce((s, i) => s + i.quantity * money(i.unitCost), 0);
    const lowStock = items.filter((i) => i.minStock > 0 && i.quantity <= i.minStock).length;

    return {
      from: start.toISOString(),
      to: end.toISOString(),
      itemCount: items.length,
      stockValue: Math.round(stockValue),
      lowStock,
      monthEntries: { quantity: entriesQty, cost: Math.round(entriesCost) },
      monthExits: { quantity: exitsQty, cost: Math.round(exitsCost) },
    };
  }

  async createSupplyItem(user: User, dto: UpsertSupplyItemDto) {
    const clinicId = await this.requireFinanceClinic(user);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Escriba el nombre del insumo');
    const initial = dto.initialQuantity ?? 0;
    const unitCost = dto.unitCost ?? 0;

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.supplyItem.create({
        data: {
          clinicId,
          name,
          sku: dto.sku?.trim() || null,
          unit: dto.unit?.trim() || 'und',
          lotNumber: dto.lotNumber?.trim() || null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          category: dto.category ?? SupplyCategory.CONSUMABLE,
          unitCost,
          minStock: dto.minStock ?? 0,
          notes: dto.notes?.trim() || null,
          quantity: initial,
        },
      });
      if (initial > 0) {
        await tx.supplyMovement.create({
          data: {
            clinicId,
            supplyItemId: item.id,
            type: SupplyMovementType.IN,
            quantity: initial,
            unitCost,
            notes: 'Stock inicial',
            movedAt: new Date(),
            createdById: user.id,
          },
        });
      }
      return this.mapItem(item);
    });
  }

  async updateSupplyItem(user: User, id: string, dto: UpsertSupplyItemDto) {
    const clinicId = await this.requireFinanceClinic(user);
    const existing = await this.prisma.supplyItem.findFirst({ where: { id, clinicId } });
    if (!existing) throw new NotFoundException('Insumo no encontrado');
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Escriba el nombre del insumo');
    const item = await this.prisma.supplyItem.update({
      where: { id },
      data: {
        name,
        sku: dto.sku?.trim() || null,
        unit: dto.unit?.trim() || existing.unit,
        lotNumber: dto.lotNumber?.trim() || null,
        expiresAt: dto.expiresAt === null ? null : dto.expiresAt ? new Date(dto.expiresAt) : existing.expiresAt,
        category: dto.category ?? existing.category,
        unitCost: dto.unitCost ?? existing.unitCost,
        minStock: dto.minStock ?? existing.minStock,
        notes: dto.notes === undefined ? existing.notes : dto.notes?.trim() || null,
      },
    });
    return this.mapItem(item);
  }

  async deleteSupplyItem(user: User, id: string) {
    const clinicId = await this.requireFinanceClinic(user);
    const existing = await this.prisma.supplyItem.findFirst({ where: { id, clinicId } });
    if (!existing) throw new NotFoundException('Insumo no encontrado');
    await this.prisma.supplyItem.delete({ where: { id } });
    return { ok: true };
  }

  async createSupplyMovement(user: User, itemId: string, dto: CreateSupplyMovementDto) {
    const clinicId = await this.requireFinanceClinic(user);
    if (dto.type !== SupplyMovementType.ADJUST && dto.quantity < 1) {
      throw new BadRequestException('La cantidad debe ser al menos 1');
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.supplyItem.findFirst({ where: { id: itemId, clinicId } });
      if (!item) throw new NotFoundException('Insumo no encontrado');

      let nextQty = item.quantity;
      if (dto.type === SupplyMovementType.IN) {
        nextQty += dto.quantity;
      } else if (dto.type === SupplyMovementType.OUT) {
        if (dto.quantity > item.quantity) {
          throw new BadRequestException(`Stock insuficiente (${item.quantity} ${item.unit} disponibles)`);
        }
        nextQty -= dto.quantity;
      } else {
        // ADJUST: la cantidad es el nuevo stock absoluto
        nextQty = dto.quantity;
      }

      const unitCost = dto.unitCost ?? money(item.unitCost);
      const movedAt = dto.movedAt ? new Date(dto.movedAt) : new Date();
      const movementQty =
        dto.type === SupplyMovementType.ADJUST ? Math.abs(nextQty - item.quantity) || dto.quantity : dto.quantity;

      const [movement] = await Promise.all([
        tx.supplyMovement.create({
          data: {
            clinicId,
            supplyItemId: item.id,
            type: dto.type,
            quantity: movementQty,
            unitCost,
            notes: dto.notes?.trim() || null,
            movedAt,
            createdById: user.id,
          },
        }),
        tx.supplyItem.update({
          where: { id: item.id },
          data: {
            quantity: nextQty,
            ...(dto.unitCost !== undefined ? { unitCost: dto.unitCost } : {}),
          },
        }),
      ]);

      const updated = await tx.supplyItem.findUniqueOrThrow({ where: { id: item.id } });
      return {
        movement: {
          id: movement.id,
          type: movement.type,
          quantity: movement.quantity,
          unitCost: money(movement.unitCost),
          notes: movement.notes,
          movedAt: movement.movedAt,
        },
        item: this.mapItem(updated),
      };
    });
  }
}
