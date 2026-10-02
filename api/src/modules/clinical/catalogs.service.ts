import { Injectable } from '@nestjs/common';
import { ClinicSpecialty, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { PSYCHOLOGY_CUPS_CATALOG } from './psychology-cups.catalog';
import { PHYSIOTHERAPY_CIE_CATALOG } from './physiotherapy-cie.catalog';
import { PHYSIOTHERAPY_CUPS_CATALOG } from './physiotherapy-cups.catalog';
import { DENTISTRY_CIE_CATALOG } from './dentistry-cie.catalog';
import { DENTISTRY_CUPS_CATALOG } from './dentistry-cups.catalog';
import { ORTHO_CONTROL_PROCEDURES, ORTHO_EVENT_CUPS } from './ortho-control-procedures';
import { ORTHO_CIE_CATALOG, orthoCieRows } from './ortho-cie.catalog';
import { ORTHO_CUPS_CATALOG, orthoCupsRows } from './ortho-cups.catalog';

/** Ortodoncia usa los catálogos odontológicos, con su propio catálogo por delante. */
function catalogSpecialty(specialty?: ClinicSpecialty | string | null): string {
  const spec = (specialty || '').toUpperCase();
  return spec === ClinicSpecialty.ORTHODONTICS ? ClinicSpecialty.DENTISTRY : spec;
}

/** Consultorio de ortodoncia, o historia de ortodoncia abierta en un consultorio odontológico. */
function isOrthoScope(specialty?: ClinicSpecialty | string | null, scope?: string | null): boolean {
  const spec = (specialty || '').toUpperCase();
  if (spec === ClinicSpecialty.ORTHODONTICS) return true;
  return spec === ClinicSpecialty.DENTISTRY && (scope || '').toUpperCase() === ClinicSpecialty.ORTHODONTICS;
}

/** Capítulos CIE-10 que completan el catálogo de psicología (salud mental, factores psicosociales, autolesión). */
const PSYCHOLOGY_CIE_PREFIXES = ['F', 'Z', 'R4', 'T74', 'X6', 'X7', 'X80', 'X81', 'X82', 'X83', 'X84', 'Y0'];

/** «f411», «F41.1», «f4» → prefijo de código con el punto en su lugar («F41.1», «F4»); null si no parece un código. */
function cieCodePrefix(query: string): string | null {
  const raw = query.replace(/[\s.]/g, '').toUpperCase();
  if (!/^[A-Z]\d{0,2}([\dX])?$/.test(raw) || (raw.length === 1 && query.trim().length > 1)) return null;
  return raw.length > 3 ? `${raw.slice(0, 3)}.${raw.slice(3)}` : raw;
}

/** Filtro de cie_codes: por inicio de código si escribe un código, o por todas las palabras (parciales) de la descripción. */
function cieCodeWhere(query: string | undefined, prefixes?: string[]): Prisma.CieCodeWhereInput {
  const scope: Prisma.CieCodeWhereInput = prefixes ? { OR: prefixes.map((p) => ({ code: { startsWith: p } })) } : {};
  if (!query) return { isActive: true, ...scope };
  const prefix = cieCodePrefix(query);
  const words = query.split(/\s+/).filter(Boolean);
  const match: Prisma.CieCodeWhereInput = prefix
    ? { OR: [{ code: { startsWith: prefix, mode: 'insensitive' } }, { code: { startsWith: prefix.replace('.', ''), mode: 'insensitive' } }] }
    : { AND: words.map((w) => ({ description: { contains: w, mode: 'insensitive' as const } })) };
  return { isActive: true, AND: [scope, match] };
}

const ORTHO_CIE_CODES = new Set(ORTHO_CIE_CATALOG.flatMap((g) => g.items.map((i) => i.code)));
const ORTHO_CUPS_CODES = new Set(ORTHO_CUPS_CATALOG.flatMap((s) => s.items.map((i) => i.code)));

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
      const fallback =
        orthoCupsRows().find((c) => c.code === code) ?? DENTISTRY_CUPS_CATALOG.find((c) => c.code === code);
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
  async searchCie(q?: string, take = 20, specialty?: ClinicSpecialty | string | null, scope?: string | null) {
    const query = q?.trim();
    const spec = catalogSpecialty(specialty);
    const ortho = isOrthoScope(specialty, scope);

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
      const orthoRows = ortho
        ? this.filterStatic(
            orthoCieRows().map((row) => ({
              id: `cie-orto-${row.key}`,
              code: row.code,
              description: row.description,
              cie11Code: '',
              category: row.category,
              source: 'CIE' as const,
            })),
            query,
            take,
            true,
          )
        : [];
      const fromStatic = [
        ...orthoRows,
        ...this.filterStatic(
          DENTISTRY_CIE_CATALOG.filter((row) => !ortho || !ORTHO_CIE_CODES.has(row.code)).map((row) => ({
            id: `cie-odo-${row.code}`,
            code: row.code,
            description: row.description,
            cie11Code: '',
            category: row.category || 'ODONTOLOGÍA',
            source: 'CIE' as const,
          })),
          query,
          take,
        ),
      ].slice(0, take);
      if (fromStatic.length >= take || !query) return fromStatic;
      const used = new Set(fromStatic.map((m) => m.code.toUpperCase()));
      const fromCie = await this.prisma.cieCode.findMany({
        where: cieCodeWhere(query),
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

    const prefix = query ? cieCodePrefix(query) : null;
    const catalogWhere: Prisma.DiagnosisCatalogWhereInput = {
      isActive: true,
      ...(query
        ? {
            OR: [
              ...(prefix ? [{ cie10Code: { startsWith: prefix, mode: 'insensitive' as const } }] : []),
              { cie10Code: { contains: query, mode: 'insensitive' as const } },
              { cie11Code: { contains: query, mode: 'insensitive' as const } },
              { AND: query.split(/\s+/).map((w) => ({ description: { contains: w, mode: 'insensitive' as const } })) },
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

    // Psicología: sin consulta solo su catálogo; al buscar, el resto del CIE-10 de salud mental (no la matriz de fisioterapia).
    const isPsych = spec === ClinicSpecialty.PSYCHOLOGY || spec === 'PSYCHOLOGY';
    if (isPsych && !query) {
      return mapped;
    }

    const remaining = take - mapped.length;
    const usedCodes = new Set(mapped.map((m) => m.code.toUpperCase()));
    const fromCie = await this.prisma.cieCode.findMany({
      where: cieCodeWhere(query, isPsych ? PSYCHOLOGY_CIE_PREFIXES : undefined),
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
        category: isPsych ? 'CIE-10' : 'ADULTOS',
        source: 'CIE' as const,
      });
      if (mapped.length >= take) break;
    }

    return mapped;
  }

  async searchCups(q?: string, take = 20, specialty?: ClinicSpecialty | string | null, scope?: string | null) {
    const query = q?.trim().toLowerCase();
    const spec = catalogSpecialty(specialty);
    const ortho = isOrthoScope(specialty, scope);

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

    const orthoRows = ortho
      ? this.filterStatic(orthoCupsRows(), query, take, true).map((row) => ({
          id: `cups-orto-${row.code}`,
          code: row.code,
          description: row.description,
          category: row.category,
        }))
      : [];
    const fromStatic: Array<{ id: string; code: string; description: string; category?: string }> = [
      ...orthoRows,
      ...this.filterStatic(
        staticSource.filter((row) => !ortho || !ORTHO_CUPS_CODES.has(row.code)),
        query,
        take,
      ).map((row) => ({
        id: `cups-static-${row.code}`,
        code: row.code,
        description: row.description,
      })),
    ].slice(0, take);

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
    keepOrder = false,
  ): T[] {
    const q = query ? this.fold(query) : '';
    const qCode = q.replace(/[\s.]/g, '');
    const words = q.split(/\s+/).filter(Boolean);
    const matches = rows.filter((row) => {
      if (!q) return true;
      const desc = this.fold(row.description);
      return this.fold(row.code).replace(/\./g, '').includes(qCode) || words.every((w) => desc.includes(w));
    });
    return (keepOrder ? matches : matches.sort((a, b) => a.code.localeCompare(b.code))).slice(0, take);
  }

  /** Minúsculas y sin tildes, para buscar «obturacion» igual que «obturación». */
  private fold(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
}
