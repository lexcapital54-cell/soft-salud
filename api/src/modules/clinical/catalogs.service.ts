import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.module';

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Autocompletado CIE: prioriza DiagnosisCatalog (Psicología/Psiquiatría)
   * y completa con cie_codes generales.
   */
  async searchCie(q?: string, take = 20) {
    const query = q?.trim();
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

  searchCups(q?: string, take = 20) {
    const query = q?.trim();
    return this.prisma.cupsCode.findMany({
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
  }
}
