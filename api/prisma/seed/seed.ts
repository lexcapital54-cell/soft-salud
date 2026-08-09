import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { seedDocumentRequirements } from './document-requirements.seed';
import { seedSgsstRequirements } from './sgsst-requirements.seed';
import { seedConsents } from './seedConsents';
import { seedDiagnosisCatalog } from './seedDiagnosisCatalog';

const prisma = new PrismaClient();

type CatalogItem = {
  code: string;
  description: string;
  version?: string;
};

async function seedCie(catalogPath: string) {
  const items = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as CatalogItem[];
  let count = 0;
  for (const item of items) {
    await prisma.cieCode.upsert({
      where: { code: item.code },
      create: {
        code: item.code,
        description: item.description,
        version: item.version ?? 'CIE-10',
        isActive: true,
      },
      update: {
        description: item.description,
        version: item.version ?? 'CIE-10',
        isActive: true,
      },
    });
    count += 1;
  }
  return count;
}

async function seedCups(catalogPath: string) {
  const items = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as CatalogItem[];
  let count = 0;
  for (const item of items) {
    await prisma.cupsCode.upsert({
      where: { code: item.code },
      create: {
        code: item.code,
        description: item.description,
        isActive: true,
      },
      update: {
        description: item.description,
        isActive: true,
      },
    });
    count += 1;
  }
  return count;
}

async function main() {
  const catalogsDir = path.join(__dirname, 'catalogs');
  const excelPath =
    process.env.HABILITATION_EXCEL_PATH ||
    path.join(
      catalogsDir,
      'Checklist_Habilitacion_Consultorio_Psicologico_Base2.xlsx',
    );

  console.log('→ Sembrando CIE (MVP psicología)...');
  const cieCount = await seedCie(path.join(catalogsDir, 'cie-psychology.json'));
  console.log(`  CIE: ${cieCount}`);

  console.log('→ Sembrando DiagnosisCatalog (Psicología/Psiquiatría CIE-10/11)...');
  const diagnosisCatalogCount = await seedDiagnosisCatalog(prisma);
  console.log(`  DiagnosisCatalog: ${diagnosisCatalogCount}`);

  console.log('→ Sembrando CUPS (MVP psicología)...');
  const cupsCount = await seedCups(
    path.join(catalogsDir, 'cups-psychology.json'),
  );
  console.log(`  CUPS: ${cupsCount}`);

  console.log('→ Sembrando categorías/requisitos desde Excel...');
  console.log(`  Excel: ${excelPath}`);
  const docs = await seedDocumentRequirements(prisma, excelPath);
  console.log(
    `  Categorías: ${docs.categories} | Requisitos plantilla: ${docs.requirements} | Clínicas: ${docs.clinics} | Upserts: ${docs.upserted}`,
  );

  console.log('→ Sembrando requisitos SG-SST (Dec. 1072 / Res. 0312)...');
  const sgsst = await seedSgsstRequirements(prisma);
  console.log(
    `  Categorías: ${sgsst.categories} | Requisitos: ${sgsst.requirements} | Upserts: ${sgsst.upserted}`,
  );

  console.log('→ Sembrando plantillas de consentimiento (Psicología v1)...');
  const consents = await seedConsents(prisma);
  console.log(
    `  Plantillas: ${consents.templates} (${consents.specialty} v${consents.version})`,
  );

  console.log('Seed completado.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
