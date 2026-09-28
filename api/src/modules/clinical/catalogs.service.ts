import { Injectable } from '@nestjs/common';
import { ClinicSpecialty } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { PSYCHOLOGY_CUPS_CATALOG } from './psychology-cups.catalog';
import { PHYSIOTHERAPY_CIE_CATALOG } from './physiotherapy-cie.catalog';
import { PHYSIOTHERAPY_CUPS_CATALOG } from './physiotherapy-cups.catalog';
import { DENTISTRY_CIE_CATALOG } from './dentistry-cie.catalog';
import { DENTISTRY_CUPS_CATALOG } from './dentistry-cups.catalog';
import { ORTHO_CONTROL_PROCEDURES, ORTHO_EVENT_CUPS } from './ortho-control-procedures';

/** Ortodoncia usa los mismos catálogos CIE-10 y CUPS odontológicos. */
function catalogSpecialty(specialty?: ClinicSpecialty | string | null): string {
  const spec = (specialty || '').toUpperCase();
  return spec === ClinicSpecialty.ORTHODONTICS ? ClinicSpecialty.DENTISTRY : spec;
}

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Descripción vigente de cada CUPS: primero la tabla CUPS activa, luego el catálogo odontológico. */
  async resolveCups(codes: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(codes)];
    const out = new Map<string, string>();
    if (!unique.length) return out;
    const rows = await this.prisma.cupsCode.findMany({
      where: { code: { in: unique }, isActive: true },
      select: { code: true, description: true },
    });
    for (const r of rows) out.set(r.code, r.description);
    for (const code of unique) {
      if (out.has(code)) continue;
      const fallback = DENTISTRY_CUPS_CATALOG.find((c) => c.code === code);
      out.set(code, fallback?.description ?? 'Procedimiento de ortodoncia');
    }
    return out;
  }

  /** Botones de procedimiento del control de ortodoncia con su CUPS (para no quemarlos en el cliente). */
  async orthoControlProcedures() {
    const codes = [...ORTHO_CONTROL_PROCEDURES.map((p) => p.cupsCode), ...Object.values(ORTHO_EVENT_CUPS)];
    const names = await this.resolveCups(codes);
    return {
      procedures: ORTHO_CONTROL_PROCEDURES.map((p) => ({
        key: p.key,
        label: p.label,
        cupsCode: p.cupsCode,
        cupsDescription: names.get(p.cupsCode) ?? '',
      })),
      eventCups: Object.fromEntries(
        Object.entries(ORTHO_EVENT_CUPS).map(([event, code]) => [event, { code, description: names.get(code) ?? '' }]),
      ),
    };
  }

  /**
   * Autocompletado CIE filtrado por especialidad del consultorio.
   * Fisioterapia: solo matriz FT. Psicología: DiagnosisCatalog + CIE psic.
   */
  async searchCie(q?: string, take = 20, specialty?: ClinicSpecialty | string | null) {
    const query = q?.trim();
    const spec = catalogSpecialty(specialty);

    if (spec === ClinicSpecialty.PHYSIOTHERAPY || spec === 'PHYSIOTHERAPY') {
      return this.filterStatic(
        PHYSIOTHERAPY_CIE_CATALOG.map((row) => ({
          id: `cie-ft-${row.code}`,
          code: row.code,
          description: row.description,
          cie11Code: '',
          category: row.category || 'FISIOTERAPIA',
          source: 'CIE' as const,
        })),
        query,
        take,
      );
    }

    if (spec === ClinicSpecialty.DENTISTRY) {
      const fromStatic = this.filterStatic(
        DENTISTRY_CIE_CATALOG.map((row) => ({
          id: `cie-odo-${row.code}`,
          code: row.code,
          description: row.description,
          cie11Code: '',
          category: row.category || 'ODONTOLOGÍA',
          source: 'CIE' as const,
        })),
        query,
        take,
      );
      if (fromStatic.length >= take || !query) return fromStatic;
      const used = new Set(fromStatic.map((m) => m.code.toUpperCase()));
      const fromCie = await this.prisma.cieCode.findMany({
        where: {
          isActive: true,
          OR: [
            { code: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: take + used.size,
        orderBy: { code: 'asc' },
      });
      for (const row of fromCie) {
        if (used.has(row.code.toUpperCase())) continue;
        fromStatic.push({
          id: row.id,
          code: row.code,
          description: row.description,
          cie11Code: '',
          category: 'CIE-10',
          source: 'CIE' as const,
        });
        if (fromStatic.length >= take) break;
      }
      return fromStatic;
    }

    const catalogWhere = {
      isActive: true,
      ...(query
        ? {
            OR: [
              { cie10Code: { contains: query, mode: 'insensitive' as const } },
              { cie11Code: { contains: query, mode: 'insensitive' as const } },
              { description: { contains: query, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const fromCatalog = await this.prisma.diagnosisCatalog.findMany({
      where: catalogWhere,
      take,
      orderBy: [{ category: 'asc' }, { cie10Code: 'asc' }],
    });

    const mapped: Array<{
      id: string;
      code: string;
      description: string;
      cie11Code: string;
      category: string;
      source: 'DIAGNOSIS_CATALOG' | 'CIE';
    }> = fromCatalog.map((row) => ({
      id: row.id,
      code: row.cie10Code,
      description: row.description,
      cie11Code: row.cie11Code,
      category: row.category,
      source: 'DIAGNOSIS_CATALOG' as const,
    }));

    if (mapped.length >= take) {
      return mapped;
    }

    // Psicología: no mezclar CIE generales (p. ej. matriz de fisioterapia).
    if (spec === ClinicSpecialty.PSYCHOLOGY || spec === 'PSYCHOLOGY') {
      return mapped;
    }

    const remaining = take - mapped.length;
    const usedCodes = new Set(mapped.map((m) => m.code.toUpperCase()));
    const fromCie = await this.prisma.cieCode.findMany({
      where: {
        isActive: true,
        ...(query
          ? {
              OR: [
                { code: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take: remaining + usedCodes.size,
      orderBy: { code: 'asc' },
    });

    for (const row of fromCie) {
      if (usedCodes.has(row.code.toUpperCase())) continue;
      mapped.push({
        id: row.id,
        code: row.code,
        description: row.description,
        cie11Code: '',
        category: 'ADULTOS',
        source: 'CIE' as const,
      });
      if (mapped.length >= take) break;
    }

    return mapped;
  }

  async searchCups(q?: string, take = 20, specialty?: ClinicSpecialty | string | null) {
    const query = q?.trim().toLowerCase();
    const spec = catalogSpecialty(specialty);

    if (spec === ClinicSpecialty.PHYSIOTHERAPY || spec === 'PHYSIOTHERAPY') {
      return this.filterStatic(
        PHYSIOTHERAPY_CUPS_CATALOG.map((row) => ({
          id: `cups-ft-${row.code}`,
          code: row.code,
          description: row.description,
        })),
        query,
        take,
      );
    }

    const staticSource =
      spec === ClinicSpecialty.PSYCHOLOGY || spec === 'PSYCHOLOGY' || !spec
        ? PSYCHOLOGY_CUPS_CATALOG
        : spec === ClinicSpecialty.DENTISTRY
          ? DENTISTRY_CUPS_CATALOG
          : [];

    const fromStatic = this.filterStatic(staticSource, query, take)
      .map((row) => ({
        id: `cups-static-${row.code}`,
        code: row.code,
        description: row.description,
      }));

    if (fromStatic.length >= take) {
      return fromStatic;
    }

    // Fisioterapia ya retornó arriba; otras especialidades no psic no mezclan CUPS de psicología.
    if (
      spec &&
      spec !== ClinicSpecialty.PSYCHOLOGY &&
      spec !== 'PSYCHOLOGY' &&
      spec !== ClinicSpecialty.DENTISTRY
    ) {
      const fromDbOnly = await this.prisma.cupsCode.findMany({
        where: {
          isActive: true,
          ...(query
            ? {
                OR: [
                  { code: { contains: query, mode: 'insensitive' } },
                  { description: { contains: query, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        take,
        orderBy: { code: 'asc' },
      });
      return fromDbOnly.map((row) => ({
        id: row.id,
        code: row.code,
        description: row.description,
      }));
    }

    const usedCodes = new Set(fromStatic.map((m) => m.code.toUpperCase()));
    const fromDb = await this.prisma.cupsCode.findMany({
      where: {
        isActive: true,
        ...(query
          ? {
              OR: [
                { code: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take: take + usedCodes.size,
      orderBy: { code: 'asc' },
    });

    const merged = [...fromStatic];
    for (const row of fromDb) {
      if (usedCodes.has(row.code.toUpperCase())) continue;
      merged.push({
        id: row.id,
        code: row.code,
        description: row.description,
      });
      if (merged.length >= take) break;
    }
    return merged;
  }

  private filterStatic<T extends { code: string; description: string }>(
    rows: T[],
    query: string | undefined,
    take: number,
  ): T[] {
    const q = query ? this.fold(query) : '';
    const qCode = q.replace(/\./g, '');
    return rows
      .filter((row) => {
        if (!q) return true;
        return this.fold(row.code).includes(qCode) || this.fold(row.description).includes(q);
      })
      .sort((a, b) => a.code.localeCompare(b.code))
      .slice(0, take);
  }

  /** Minúsculas y sin tildes, para buscar «obturacion» igual que «obturación». */
  private fold(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
}
