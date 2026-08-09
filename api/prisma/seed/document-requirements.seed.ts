import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

export const SHEET_CATEGORIES: Record<
  string,
  { code: string; name: string; sortOrder: number }
> = {
  '1. Documentación Legal': {
    code: '01_DOCUMENTACION_LEGAL',
    name: 'Documentación Legal',
    sortOrder: 1,
  },
  '2. Talento Humano': {
    code: '02_TALENTO_HUMANO',
    name: 'Talento Humano',
    sortOrder: 2,
  },
  '3. Infraestructura': {
    code: '03_INFRAESTRUCTURA',
    name: 'Infraestructura',
    sortOrder: 3,
  },
  '4. Dotación': {
    code: '04_DOTACION',
    name: 'Dotación',
    sortOrder: 4,
  },
  '5. Medicamentos y Dispositivos': {
    code: '05_MEDICAMENTOS_DISPOSITIVOS',
    name: 'Medicamentos y Dispositivos',
    sortOrder: 5,
  },
  '6. Procesos Prioritarios': {
    code: '06_PROCESOS_PRIORITARIOS',
    name: 'Procesos Prioritarios',
    sortOrder: 6,
  },
  '7. Historia Clínica': {
    code: '07_HISTORIA_CLINICA',
    name: 'Historia Clínica',
    sortOrder: 7,
  },
  '8. Seguridad Paciente': {
    code: '08_SEGURIDAD_PACIENTE',
    name: 'Seguridad del Paciente',
    sortOrder: 8,
  },
  '9. PGIRASA': {
    code: '09_PGIRASA',
    name: 'PGIRASA',
    sortOrder: 9,
  },
  '10. Emergencias': {
    code: '10_EMERGENCIAS',
    name: 'Emergencias',
    sortOrder: 10,
  },
  '11. Indicadores y PAMEC': {
    code: '11_INDICADORES_PAMEC',
    name: 'Indicadores y PAMEC',
    sortOrder: 11,
  },
  '12. Interdependencia': {
    code: '12_INTERDEPENDENCIA',
    name: 'Interdependencia',
    sortOrder: 12,
  },
};

const SECTION_HEADERS = new Set([
  'Documentos',
  'Insumos',
  'Inventario',
  'Convenios',
  'Seguridad del Paciente',
  'Historia Clínica',
  '1. Identificación del profesional',
]);

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

export type ParsedRequirement = {
  categoryCode: string;
  code: string;
  title: string;
  description: string | null;
  isMandatory: boolean;
};

export function parseChecklistExcel(excelPath: string): {
  categories: Array<{ code: string; name: string; sortOrder: number }>;
  requirements: ParsedRequirement[];
} {
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel no encontrado: ${excelPath}`);
  }

  const workbook = XLSX.readFile(excelPath);
  const categories = Object.values(SHEET_CATEGORIES).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const requirements: ParsedRequirement[] = [];
  const usedCodes = new Set<string>();

  for (const [sheetName, meta] of Object.entries(SHEET_CATEGORIES)) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
    });

    let section: string | null = null;
    let seq = 0;

    for (const row of rows) {
      const colA = row[0];
      const colB = row[1];
      const obs = row[5];

      if (
        colB == null &&
        typeof colA === 'string' &&
        colA.trim() &&
        !/^N[°º]?$/i.test(colA.trim())
      ) {
        section = colA.trim();
        continue;
      }

      if (colA === 'N°' || colB === 'Requisito / Documento') continue;

      let title: string | null = null;
      if (typeof colB === 'string' && colB.trim()) {
        title = colB.trim();
      } else if (
        typeof colA === 'string' &&
        colA.trim() &&
        !/^\d+$/.test(colA.trim())
      ) {
        title = colA.trim();
      }

      if (!title || title.length < 2) continue;
      if (SECTION_HEADERS.has(title)) {
        section = title;
        continue;
      }

      seq += 1;
      const baseCode = `${meta.code.slice(0, 2)}_${String(seq).padStart(3, '0')}_${slugify(title)}`;
      let code = baseCode.slice(0, 60);
      let suffix = 1;
      while (usedCodes.has(code)) {
        code = `${baseCode.slice(0, 55)}_${suffix}`.slice(0, 60);
        suffix += 1;
      }
      usedCodes.add(code);

      const descriptionParts = [
        section ? `Sección: ${section}` : null,
        typeof obs === 'string' && obs.trim() ? obs.trim() : null,
      ].filter(Boolean);

      requirements.push({
        categoryCode: meta.code,
        code,
        title: title.replace(/\.$/, ''),
        description: descriptionParts.length
          ? descriptionParts.join(' | ')
          : null,
        isMandatory: true,
      });
    }
  }

  return { categories, requirements };
}

export async function seedDocumentRequirements(
  prisma: PrismaClient,
  excelPath: string,
) {
  const { categories, requirements } = parseChecklistExcel(excelPath);

  for (const category of categories) {
    await prisma.documentCategory.upsert({
      where: { code: category.code },
      create: category,
      update: {
        name: category.name,
        sortOrder: category.sortOrder,
      },
    });
  }

  const categoryRows = await prisma.documentCategory.findMany();
  const categoryIdByCode = new Map(categoryRows.map((c) => [c.code, c.id]));

  const clinics = await prisma.clinic.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  if (clinics.length === 0) {
    console.warn(
      'No hay clínicas activas: se sembraron categorías, pero no requisitos por clínica.',
    );
    return { categories: categories.length, requirements: 0, clinics: 0 };
  }

  let upserted = 0;
  for (const clinic of clinics) {
    for (const req of requirements) {
      const categoryId = categoryIdByCode.get(req.categoryCode);
      if (!categoryId) continue;

      await prisma.documentRequirement.upsert({
        where: {
          clinicId_code: {
            clinicId: clinic.id,
            code: req.code,
          },
        },
        create: {
          clinicId: clinic.id,
          categoryId,
          code: req.code,
          title: req.title,
          description: req.description,
          isMandatory: req.isMandatory,
        },
        update: {
          categoryId,
          title: req.title,
          description: req.description,
          isMandatory: req.isMandatory,
        },
      });
      upserted += 1;
    }
  }

  return {
    categories: categories.length,
    requirements: requirements.length,
    clinics: clinics.length,
    upserted,
  };
}
