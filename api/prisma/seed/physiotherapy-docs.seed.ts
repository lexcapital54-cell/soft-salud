import { DocumentPillar, PrismaClient } from '@prisma/client';

/**
 * Fisioterapia no hereda el checklist ni el pack PDF de psicología.
 * El SUPER_ADMIN carga el expediente en un consultorio y lo replica.
 */
export async function clearPhysiotherapyClinicDocuments(
  prisma: PrismaClient,
  clinicId: string,
) {
  const deleted = await prisma.documentRequirement.deleteMany({
    where: { clinicId },
  });
  return { deletedRequirements: deleted.count };
}

/**
 * Aprovisionamiento FT: no siembra nada (expediente vacío a propósito).
 * No borra lo que el SUPER_ADMIN ya haya cargado.
 */
export async function seedPhysiotherapyDocsForClinic(
  _prisma: PrismaClient,
  _clinicId: string,
) {
  return {
    excelUpserted: 0,
    sgsstUpserted: 0,
    extrasUpserted: 0,
    removedPlaceholders: 0,
    clearedRequirements: 0,
    empty: true as const,
  };
}

export const FT_DOC_CATEGORY_HINTS: Array<{
  code: string;
  name: string;
  sortOrder: number;
  pillar: DocumentPillar;
}> = [
  {
    code: 'FT_01_LEGAL',
    name: '01. Legal y administrativo',
    sortOrder: 1,
    pillar: DocumentPillar.TALENTO_HUMANO,
  },
  {
    code: 'FT_02_TALENTO',
    name: '02. Talento humano',
    sortOrder: 2,
    pillar: DocumentPillar.TALENTO_HUMANO,
  },
  {
    code: 'FT_03_INFRA',
    name: '03. Infraestructura',
    sortOrder: 3,
    pillar: DocumentPillar.INFRAESTRUCTURA,
  },
  {
    code: 'FT_04_DOTACION',
    name: '04. Dotación',
    sortOrder: 4,
    pillar: DocumentPillar.DOTACION,
  },
  {
    code: 'FT_06_PROCESOS',
    name: '06. Procesos prioritarios',
    sortOrder: 6,
    pillar: DocumentPillar.PROCESOS_PRIORITARIOS,
  },
  {
    code: 'FT_07_HC',
    name: '07. Historia clínica',
    sortOrder: 7,
    pillar: DocumentPillar.HISTORIA_CLINICA,
  },
  {
    code: 'FT_11_SOGC',
    name: '11. SOGC – Gestión de calidad',
    sortOrder: 11,
    pillar: DocumentPillar.PROCESOS_PRIORITARIOS,
  },
  {
    code: 'FT_12_SGSST',
    name: '12. SG-SST',
    sortOrder: 12,
    pillar: DocumentPillar.SG_SST,
  },
  {
    code: 'FT_13_LIMPIEZA',
    name: '13. Limpieza y desinfección',
    sortOrder: 13,
    pillar: DocumentPillar.INFRAESTRUCTURA,
  },
];
