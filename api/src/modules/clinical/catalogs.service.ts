import { Injectable } from '@nestjs/common';
import { ClinicSpecialty } from '@prisma/client';
import { IndexedCie, indexCie, rankCie } from './cie-search';
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

const ORTHO_CIE_CODES = new Set(ORTHO_CIE_CATALOG.flatMap((g) => g.items.map((i) => i.code)));
const ORTHO_CUPS_CODES = new Set(ORTHO_CUPS_CATALOG.flatMap((s) => s.items.map((i) => i.code)));

const CATALOG_TTL_MS = 10 * 60_000;

export interface CieRow {
  id: string;
  code: string;
  description: string;
  cie11Code: string;
  category: string;
  source: 'DIAGNOSIS_CATALOG' | 'CIE';
}

const PHYSIO_CIE_INDEX = indexCie(
  PHYSIOTHERAPY_CIE_CATALOG.map((row) => ({
    id: `cie-ft-${row.code}`,
    code: row.code,
    description: row.description,
    cie11Code: '',
    category: row.category || 'FISIOTERAPIA',
    source: 'CIE' as const,
  })),
);
const ORTHO_CIE_INDEX = indexCie(
  orthoCieRows().map((row) => ({
    id: `cie-orto-${row.key}`,
    code: row.code,
    description: row.description,
    cie11Code: '',
    category: row.category,
    source: 'CIE' as const,
  })),
);
const dentalCieRow = (row: { code: string; description: string; category?: string }) => ({
  id: `cie-odo-${row.code}`,
  code: row.code,
  description: row.description,
  cie11Code: '',
  category: row.category || 'ODONTOLOGÍA',
  source: 'CIE' as const,
});
const DENTAL_CIE_INDEX = indexCie(DENTISTRY_CIE_CATALOG.map(dentalCieRow));
const DENTAL_CIE_INDEX_NO_ORTHO = indexCie(DENTISTRY_CIE_CATALOG.filter((row) => !ORTHO_CIE_CODES.has(row.code)).map(dentalCieRow));

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
      return rankCie(PHYSIO_CIE_INDEX, query, take);
    }

    if (spec === ClinicSpecialty.DENTISTRY) {
      const orthoRows = ortho ? rankCie(ORTHO_CIE_INDEX, query, take) : [];
      const fromStatic = [
        ...orthoRows,
        ...rankCie(ortho ? DENTAL_CIE_INDEX_NO_ORTHO : DENTAL_CIE_INDEX, query, take),
      ].slice(0, take);
      if (fromStatic.length >= take || !query) return fromStatic;
      return this.fillFromCie(fromStatic, query, take, 'CIE-10');
    }

    const isPsych = spec === ClinicSpecialty.PSYCHOLOGY || spec === 'PSYCHOLOGY';
    const catalog = rankCie(await this.diagnosisCatalogIndex(), query, take);
    // Psicología: sin consulta solo su catálogo; al buscar, el resto del CIE-10 de salud mental (no la matriz de fisioterapia).
    if (catalog.length >= take || (isPsych && !query)) return catalog;
    return this.fillFromCie(catalog, query, take, isPsych ? 'CIE-10' : 'ADULTOS', isPsych ? PSYCHOLOGY_CIE_PREFIXES : undefined);
  }

  private cieCache: { at: number; rows: IndexedCie<CieRow>[] } | null = null;
  private catalogCache: { at: number; rows: IndexedCie<CieRow>[] } | null = null;

  /** Tabla CIE-10 completa en memoria (≈12 mil filas) para buscar sin tildes y por relevancia. */
  private async cieIndex() {
    if (this.cieCache && Date.now() - this.cieCache.at < CATALOG_TTL_MS) return this.cieCache.rows;
    const rows = await this.prisma.cieCode.findMany({ where: { isActive: true }, select: { id: true, code: true, description: true } });
    this.cieCache = {
      at: Date.now(),
      rows: indexCie(rows.map((r) => ({ id: r.id, code: r.code, description: r.description, cie11Code: '', category: 'CIE-10', source: 'CIE' as const }))),
    };
    return this.cieCache.rows;
  }

  private async diagnosisCatalogIndex() {
    if (this.catalogCache && Date.now() - this.catalogCache.at < CATALOG_TTL_MS) return this.catalogCache.rows;
    const rows = await this.prisma.diagnosisCatalog.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { cie10Code: 'asc' }],
    });
    this.catalogCache = {
      at: Date.now(),
      rows: indexCie(
        rows.map((r) => ({ id: r.id, code: r.cie10Code, description: r.description, cie11Code: r.cie11Code, category: r.category, source: 'DIAGNOSIS_CATALOG' as const })),
      ).map((r) => ({ ...r, _desc: `${r._desc} ${(r.cie11Code || '').toLowerCase()}` })),
    };
    return this.catalogCache.rows;
  }

  /** Completa los resultados con el CIE-10 general (opcionalmente solo ciertos capítulos), sin repetir códigos. */
  private async fillFromCie(base: CieRow[], query: string | undefined, take: number, category: string, prefixes?: string[]) {
    const used = new Set(base.map((m) => m.code.toUpperCase()));
    const pool = (await this.cieIndex()).filter(
      (r) => !used.has(r.code.toUpperCase()) && (!prefixes || prefixes.some((p) => r.code.startsWith(p))),
    );
    return [...base, ...rankCie(pool, query, take - base.length).map((r) => ({ ...r, category }))];
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
