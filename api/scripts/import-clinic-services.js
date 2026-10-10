/**
 * Carga el catálogo de servicios con precios en un consultorio. Solo agrega los que
 * falten por nombre; nunca modifica ni borra los existentes.
 *
 * Uso: node scripts/import-clinic-services.js <clinicId> [archivo.json] [--dry-run]
 */
const { readFileSync } = require('fs');
const { join } = require('path');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
  const dryRun = process.argv.includes('--dry-run');
  const [clinicId, file = join(__dirname, '..', 'prisma', 'data', 'aesthetic-services-gladys.json')] = args;
  if (!clinicId) throw new Error('Indique el id del consultorio');

  const prisma = new PrismaClient();
  try {
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true, specialty: true } });
    if (!clinic) throw new Error('Consultorio no encontrado');
    const items = JSON.parse(readFileSync(file, 'utf8'));
    const existing = new Set(
      (await prisma.clinicService.findMany({ where: { clinicId }, select: { name: true } })).map((s) => s.name.toLowerCase()),
    );
    const rows = items.filter((s) => !existing.has(s.name.toLowerCase()));
    console.log(`${clinic.name} (${clinic.specialty}): ${items.length} en archivo, ${existing.size} existentes, ${rows.length} por agregar`);
    if (dryRun || !rows.length) return;
    const res = await prisma.clinicService.createMany({
      data: rows.map((s) => ({
        clinicId,
        name: s.name,
        category: s.category,
        subcategory: s.subcategory || null,
        durationMinutes: s.durationMinutes,
        durationNote: s.durationNote || null,
        price: s.price ?? null,
        description: s.description || null,
        procedureType: s.procedureType || null,
        consentCode: s.consentCode || null,
        assistantService: !!s.assistantService,
        active: s.active !== false,
        sortOrder: s.sortOrder ?? 0,
      })),
      skipDuplicates: true,
    });
    console.log(`Agregados: ${res.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
