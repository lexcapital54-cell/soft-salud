import { DiagnosisCatalogCategory, PrismaClient } from '@prisma/client';

/** Catálogo estandarizado Psicología/Psiquiatría (CIE-10 + CIE-11). */
export const DIAGNOSIS_CATALOG_SEED = [
  {
    cie10Code: 'F90.0',
    cie11Code: '6A05.0',
    description: 'Trastorno de la actividad y de la atención (TDAH)',
    category: 'PEDIATRIA' as const,
  },
  {
    cie10Code: 'F84.0',
    cie11Code: '6A02',
    description: 'Trastorno del espectro autista (TEA)',
    category: 'PEDIATRIA' as const,
  },
  {
    cie10Code: 'F91.3',
    cie11Code: '6C90',
    description: 'Trastorno oposicionista desafiante',
    category: 'PEDIATRIA' as const,
  },
  {
    cie10Code: 'F93.0',
    cie11Code: '6B05',
    description: 'Trastorno de ansiedad por separación en la infancia',
    category: 'PEDIATRIA' as const,
  },
  {
    cie10Code: 'F32.9',
    cie11Code: '6A70.Z',
    description: 'Episodio depresivo, no especificado',
    category: 'ADULTOS' as const,
  },
  {
    cie10Code: 'F41.1',
    cie11Code: '6B00',
    description: 'Trastorno de ansiedad generalizada (TAG)',
    category: 'ADULTOS' as const,
  },
  {
    cie10Code: 'F41.0',
    cie11Code: '6B01',
    description: 'Trastorno de pánico',
    category: 'ADULTOS' as const,
  },
  {
    cie10Code: 'F43.1',
    cie11Code: '6B40',
    description: 'Trastorno de estrés postraumático (TEPT)',
    category: 'ADULTOS' as const,
  },
  {
    cie10Code: 'F60.3',
    cie11Code: '6D10.4',
    description:
      'Trastorno de inestabilidad emocional de la personalidad (Borderline)',
    category: 'ADULTOS' as const,
  },
  {
    cie10Code: 'Z63.0',
    cie11Code: 'QE70.0',
    description: 'Problemas en la relación con el cónyuge o pareja',
    category: 'PSICOSOCIAL' as const,
  },
  {
    cie10Code: 'Z63.4',
    cie11Code: 'QE71',
    description: 'Desaparición o muerte de miembro familiar (Duelo)',
    category: 'PSICOSOCIAL' as const,
  },
  {
    cie10Code: 'Z73.3',
    cie11Code: 'QF27.3',
    description: 'Problemas relacionados con el estrés',
    category: 'PSICOSOCIAL' as const,
  },
  {
    cie10Code: 'Z60.4',
    cie11Code: 'QE51.3',
    description: 'Exclusión y rechazo social (Bullying / Acoso escolar)',
    category: 'PSICOSOCIAL' as const,
  },
] as const;

export async function seedDiagnosisCatalog(prisma: PrismaClient) {
  let count = 0;
  for (const item of DIAGNOSIS_CATALOG_SEED) {
    const category = item.category as DiagnosisCatalogCategory;
    await prisma.diagnosisCatalog.upsert({
      where: { cie10Code: item.cie10Code },
      create: {
        cie10Code: item.cie10Code,
        cie11Code: item.cie11Code,
        description: item.description,
        category,
        isActive: true,
      },
      update: {
        cie11Code: item.cie11Code,
        description: item.description,
        category,
        isActive: true,
      },
    });

    // Mantener sincronizado el catálogo CIE usado por el autocompletado HCE
    await prisma.cieCode.upsert({
      where: { code: item.cie10Code },
      create: {
        code: item.cie10Code,
        description: `${item.description} [CIE-11 ${item.cie11Code}]`,
        version: 'CIE-10',
        isActive: true,
      },
      update: {
        description: `${item.description} [CIE-11 ${item.cie11Code}]`,
        isActive: true,
      },
    });
    count += 1;
  }
  return count;
}
