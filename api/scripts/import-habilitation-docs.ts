/**
 * CLI: importa DOCUMENOS PDF PSICOLOGIA a todos los consultorios
 * con historia clínica + gestión documental.
 *
 *   npx ts-node scripts/import-habilitation-docs.ts
 *   npx ts-node scripts/import-habilitation-docs.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';
import {
  defaultHabilitationPackPath,
  importHabilitationPackForClinic,
} from '../src/modules/documents/habilitation-pack.import';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const packRoot = defaultHabilitationPackPath();
  const clinics = await prisma.clinic.findMany({
    where: {
      isActive: true,
      dashboardType: 'CLINICAL_HISTORY_WITH_DOCS',
    },
    select: { id: true, name: true },
  });

  if (!clinics.length) {
    const fallback = await prisma.clinic.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    if (!fallback) throw new Error('No hay clínica activa');
    clinics.push(fallback);
  }

  for (const clinic of clinics) {
    const uploader = await prisma.user.findFirst({
      where: {
        clinicId: clinic.id,
        role: { in: ['ADMIN', 'HEALTH_PROFESSIONAL'] },
      },
      select: { id: true, email: true, fullName: true },
    });
    if (!uploader) {
      console.warn(`Sin profesional/admin en ${clinic.name}; se omite.`);
      continue;
    }

    console.log(`\n── ${clinic.name} (${uploader.fullName}) ──`);
    const stats = await importHabilitationPackForClinic(prisma, clinic.id, {
      packRoot,
      uploadedById: uploader.id,
      dryRun: DRY_RUN,
    });
    if (stats.unmapped.length) {
      console.log('Sin mapeo:');
      for (const item of stats.unmapped) console.log('  -', item);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
