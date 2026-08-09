import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';
import { SivigilaQueryDto } from './dto/sivigila.dto';

export type SivigilaCaseRow = {
  encounterId: string;
  encounterCode: string | null;
  encounterStatus: string;
  startedAt: Date | null;
  patientId: string;
  patientDocument: string;
  patientName: string;
  diagnosisId: string;
  cieCode: string;
  diagnosisDescription: string;
  diagnosisType: string;
  sivigilaEventCode: string | null;
  professionalName: string;
};

@Injectable()
export class SivigilaService {
  constructor(private readonly prisma: PrismaService) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  async listCases(user: User, query: SivigilaQueryDto): Promise<{
    total: number;
    items: SivigilaCaseRow[];
  }> {
    const clinicId = this.requireClinicId(user);

    const notifiableCodes = await this.prisma.cieCode.findMany({
      where: { sivigilaNotifiable: true, isActive: true },
      select: { code: true, sivigilaEventCode: true },
    });
    const codeSet = new Set(notifiableCodes.map((c) => c.code.toUpperCase()));
    const eventByCode = new Map(
      notifiableCodes.map((c) => [c.code.toUpperCase(), c.sivigilaEventCode]),
    );

    if (!codeSet.size) {
      return { total: 0, items: [] };
    }

    const startedAt: Prisma.DateTimeFilter = {};
    if (query.from) startedAt.gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
      startedAt.lte = to;
    }

    const filterCode = query.cieCode?.trim().toUpperCase();
    if (filterCode && !codeSet.has(filterCode)) {
      return { total: 0, items: [] };
    }

    const diagnoses = await this.prisma.diagnosis.findMany({
      where: {
        encounter: {
          clinicId,
          ...(Object.keys(startedAt).length ? { startedAt } : {}),
        },
      },
      include: {
        encounter: {
          include: {
            patient: true,
            professional: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    const items: SivigilaCaseRow[] = diagnoses
      .filter((d) => {
        const upper = d.cieCode.toUpperCase();
        if (!codeSet.has(upper)) return false;
        if (filterCode && upper !== filterCode) return false;
        return true;
      })
      .map((d) => {
        const p = d.encounter.patient;
        return {
          encounterId: d.encounterId,
          encounterCode: d.encounter.externalCode,
          encounterStatus: d.encounter.status,
          startedAt: d.encounter.startedAt,
          patientId: p.id,
          patientDocument: `${p.documentType} ${p.documentNumber}`,
          patientName: `${p.firstName} ${p.lastName}`.trim(),
          diagnosisId: d.id,
          cieCode: d.cieCode,
          diagnosisDescription: d.description,
          diagnosisType: d.type,
          sivigilaEventCode: eventByCode.get(d.cieCode.toUpperCase()) ?? null,
          professionalName: d.encounter.professional.fullName,
        };
      });

    return { total: items.length, items };
  }

  async summary(user: User, query: SivigilaQueryDto) {
    const { items } = await this.listCases(user, query);
    const byCode = new Map<string, number>();
    for (const row of items) {
      byCode.set(row.cieCode, (byCode.get(row.cieCode) || 0) + 1);
    }
    return {
      totalCases: items.length,
      byCieCode: [...byCode.entries()]
        .map(([cieCode, count]) => ({ cieCode, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  async exportCsv(user: User, query: SivigilaQueryDto): Promise<Buffer> {
    const { items } = await this.listCases(user, query);
    const header = [
      'encounterCode',
      'startedAt',
      'patientDocument',
      'patientName',
      'cieCode',
      'diagnosisDescription',
      'diagnosisType',
      'sivigilaEventCode',
      'professionalName',
      'encounterStatus',
    ];
    const lines = [
      header.join(','),
      ...items.map((row) =>
        [
          row.encounterCode ?? '',
          row.startedAt?.toISOString() ?? '',
          row.patientDocument,
          row.patientName,
          row.cieCode,
          row.diagnosisDescription,
          row.diagnosisType,
          row.sivigilaEventCode ?? '',
          row.professionalName,
          row.encounterStatus,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ];
    return Buffer.from(lines.join('\n'), 'utf8');
  }

  async exportExcel(user: User, query: SivigilaQueryDto): Promise<Buffer> {
    const { items } = await this.listCases(user, query);
    const sheetData = items.map((row) => ({
      CodigoAtencion: row.encounterCode ?? '',
      Fecha: row.startedAt?.toISOString() ?? '',
      Documento: row.patientDocument,
      Paciente: row.patientName,
      CIE10: row.cieCode,
      Diagnostico: row.diagnosisDescription,
      Tipo: row.diagnosisType,
      EventoSIVIGILA: row.sivigilaEventCode ?? '',
      Profesional: row.professionalName,
      Estado: row.encounterStatus,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, 'SIVIGILA');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** Marca códigos CIE de ejemplo como notificables (idempotente). */
  async ensureSampleNotifiableCodes() {
    const samples: { code: string; event: string }[] = [
      { code: 'A09', event: '300' },
      { code: 'A90', event: '210' },
      { code: 'B50', event: '450' },
      { code: 'J11', event: '348' },
      { code: 'Z20', event: '348' },
    ];
    for (const s of samples) {
      await this.prisma.cieCode.updateMany({
        where: { code: { equals: s.code, mode: 'insensitive' } },
        data: {
          sivigilaNotifiable: true,
          sivigilaEventCode: s.event,
        },
      });
    }
  }
}
