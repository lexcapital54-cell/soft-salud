import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlatformReceiptStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { ClinicalStorageService } from '../clinical/clinical-storage.service';
import { KIND_LABEL, METHOD_LABEL, PLAN_LABEL } from './billing-labels';
import { billingRange } from './billing-period';
import { PlatformReceiptPdfService } from './platform-receipt-pdf.service';
import { receiptPayer } from './receipt-payer';

/**
 * PDF del cobro y su copia en la carpeta «Recibos HabiliSALUD» del consultorio.
 * La copia vive en stored_files y se enlaza desde el recibo: no forma parte del expediente
 * documental, así que replicar o vaciar expedientes no la toca.
 */
@Injectable()
export class PlatformReceiptArchiveService {
  private readonly logger = new Logger(PlatformReceiptArchiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PlatformReceiptPdfService,
    private readonly storage: ClinicalStorageService,
  ) {}

  async build(id: string) {
    const row = await this.prisma.platformReceipt.findUnique({
      where: { id },
      include: { clinic: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException('Recibo no encontrado');
    // Recibos anteriores a la captura de datos: se completan con los datos actuales.
    const live = row.payerName ? null : await receiptPayer(this.prisma, row.clinicId);
    const buffer = await this.pdf.build({
      number: row.number,
      issuedAt: row.createdAt,
      paidAt: row.paidAt,
      pending: row.status === PlatformReceiptStatus.PENDING,
      clinicName: row.clinic.name,
      payerName: row.payerName ?? live?.payerName ?? null,
      payerDocument: row.payerDocument ?? live?.payerDocument ?? null,
      payerPhone: row.payerPhone ?? live?.payerPhone ?? null,
      payerEmail: row.payerEmail ?? live?.payerEmail ?? null,
      kindLabel: KIND_LABEL[row.kind],
      planLabel: row.planLabel ?? live?.planLabel ?? PLAN_LABEL[row.plan],
      description: row.description,
      amount: Number(row.amount),
      method: row.method,
      methodLabel: METHOD_LABEL[row.method],
      periodLabel: row.periodMonth ? billingRange(row.periodMonth).label : null,
      notes: row.notes,
    });
    return { buffer, filename: `${row.number}.pdf`, row };
  }

  /** Guarda (o reemplaza) la copia del recibo pagado. Un fallo aquí no revierte el pago. */
  async archive(id: string) {
    try {
      const { buffer, row } = await this.build(id);
      if (row.status !== PlatformReceiptStatus.PAID) return null;
      const storageKey = `platform-receipts/${row.clinicId}/${row.number}.pdf`;
      await this.storage.putBuffer(storageKey, buffer, 'application/pdf');
      if (row.pdfStorageKey !== storageKey) {
        await this.prisma.platformReceipt.update({ where: { id }, data: { pdfStorageKey: storageKey } });
      }
      return storageKey;
    } catch (err) {
      this.logger.error(`No se pudo archivar la copia del recibo ${id}`, err as Error);
      return null;
    }
  }

  /** Carpeta del consultorio: solo cobros pagados. */
  async listForClinic(clinicId: string) {
    const rows = await this.prisma.platformReceipt.findMany({
      where: { clinicId, status: PlatformReceiptStatus.PAID },
      orderBy: { paidAt: 'desc' },
      select: {
        id: true,
        number: true,
        kind: true,
        amount: true,
        paidAt: true,
        periodMonth: true,
        planLabel: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      kindLabel: KIND_LABEL[r.kind],
      amount: Number(r.amount),
      paidAt: r.paidAt?.toISOString() ?? null,
      billingRange: r.periodMonth ? billingRange(r.periodMonth).label : null,
      planLabel: r.planLabel,
    }));
  }

  async readForClinic(clinicId: string, id: string) {
    const row = await this.prisma.platformReceipt.findFirst({
      where: { id, clinicId, status: PlatformReceiptStatus.PAID },
      select: { id: true, number: true, pdfStorageKey: true },
    });
    if (!row) throw new NotFoundException('Recibo no encontrado');
    const key = row.pdfStorageKey ?? (await this.archive(row.id));
    if (key) {
      try {
        return { buffer: await this.storage.readBuffer(key), filename: `${row.number}.pdf` };
      } catch {
        // Si la copia no está disponible se genera de nuevo.
      }
    }
    const { buffer } = await this.build(row.id);
    return { buffer, filename: `${row.number}.pdf` };
  }
}
