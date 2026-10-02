import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClinicLogoKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';

export const CLINIC_LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** PNG y JPG: los únicos formatos que admite el generador de PDF de la historia. */
const SIGNATURES: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

export type ClinicLogoSlot = 'home' | 'hc';

export function logoKind(slot: string): ClinicLogoKind {
  if (slot === 'home') return ClinicLogoKind.HOME;
  if (slot === 'hc') return ClinicLogoKind.HC;
  throw new BadRequestException('Tipo de logo inválido: use «home» o «hc».');
}

@Injectable()
export class ClinicLogosService {
  constructor(private readonly prisma: PrismaService) {}

  async status(clinicId: string) {
    const rows = await this.prisma.clinicLogo.findMany({
      where: { clinicId },
      select: { kind: true, updatedAt: true },
    });
    const at = (kind: ClinicLogoKind) =>
      rows.find((r) => r.kind === kind)?.updatedAt.toISOString() ?? null;
    return { home: at(ClinicLogoKind.HOME), hc: at(ClinicLogoKind.HC) };
  }

  async save(clinicId: string, kind: ClinicLogoKind, file?: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Seleccione una imagen PNG o JPG.');
    }
    if (file.buffer.length > CLINIC_LOGO_MAX_BYTES) {
      throw new BadRequestException('El logo no puede pesar más de 2 MB.');
    }
    const mimeType = SIGNATURES.find((s) =>
      s.bytes.every((b, i) => file.buffer[i] === b),
    )?.mime;
    if (!mimeType) {
      throw new BadRequestException('Formato no admitido: use una imagen PNG o JPG.');
    }
    if (!(await this.prisma.clinic.count({ where: { id: clinicId } }))) {
      throw new NotFoundException('Consultorio no encontrado.');
    }
    const data = new Uint8Array(file.buffer);
    await this.prisma.clinicLogo.upsert({
      where: { clinicId_kind: { clinicId, kind } },
      create: { clinicId, kind, mimeType, data },
      update: { mimeType, data },
    });
    return this.status(clinicId);
  }

  async remove(clinicId: string, kind: ClinicLogoKind) {
    await this.prisma.clinicLogo.deleteMany({ where: { clinicId, kind } });
    return this.status(clinicId);
  }

  /** El logo de historia clínica es opcional: si falta se usa el del panel de inicio. */
  async find(clinicId: string, kind: ClinicLogoKind) {
    const order =
      kind === ClinicLogoKind.HC
        ? [ClinicLogoKind.HC, ClinicLogoKind.HOME]
        : [ClinicLogoKind.HOME];
    const rows = await this.prisma.clinicLogo.findMany({
      where: { clinicId, kind: { in: order } },
    });
    for (const k of order) {
      const row = rows.find((r) => r.kind === k);
      if (row) return row;
    }
    return null;
  }
}
