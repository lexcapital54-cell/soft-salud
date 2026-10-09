/**
 * Exporta el expediente documental de un consultorio como paquete maestro de
 * su especialidad: carpetas por estándar / tipo documental + `estructura.json`.
 *
 * Uso (dentro del contenedor de la API):
 *   docker exec -i -e SOURCE_CLINIC_ID=<uuid> -e OUT_DIR=/app/storage/_pack \
 *     habilisalud-api node - < api/scripts/export-specialty-pack.js
 *
 * Solo toma requisitos no archivados y, por requisito, la última versión
 * vigente de cada archivo (sin historial ni archivos retirados).
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const PILLAR_FOLDERS = {
  DOCUMENTACION_GENERAL: '0. DOCUMENTACION GENERAL',
  TALENTO_HUMANO: '1. TALENTO HUMANO',
  INFRAESTRUCTURA: '2. INFRAESTRUCTURA',
  DOTACION: '3. DOTACION',
  MEDICAMENTOS_INSUMOS: '4. MEDICAMENTOS',
  PROCESOS_PRIORITARIOS: '5. PROCESOS PRIORITARIOS',
  HISTORIA_CLINICA: '6. HISTORIA CLINICA',
  INTERDEPENDENCIA: '7. INTERDEPENDENCIA',
  DOCUMENTACION_LEGAL: '8. DOCUMENTACION LEGAL',
  SG_SST: '9. SG-SST',
};
const PILLAR_ORDER = Object.keys(PILLAR_FOLDERS);

function safeName(value) {
  return String(value)
    .replace(/[\/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
}

async function readStored(prisma, storageKey) {
  const row = await prisma.storedFile.findUnique({
    where: { storageKey },
    select: { data: true },
  });
  if (row && row.data && row.data.length) return Buffer.from(row.data);
  const root = process.env.STORAGE_ROOT || '/app/storage';
  const abs = path.join(root, storageKey);
  if (fs.existsSync(abs)) return fs.readFileSync(abs);
  throw new Error(`Archivo no encontrado: ${storageKey}`);
}

async function main() {
  const clinicId = process.env.SOURCE_CLINIC_ID;
  const outDir = process.env.OUT_DIR;
  if (!clinicId || !outDir) throw new Error('Defina SOURCE_CLINIC_ID y OUT_DIR');
  const prisma = new PrismaClient();
  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { specialty: true },
    });
    if (!clinic) throw new Error('Consultorio origen no encontrado');

    const reqs = await prisma.documentRequirement.findMany({
      where: { clinicId, archivedAt: null },
      include: {
        category: true,
        files: {
          where: { status: { not: 'RETIRED' } },
          orderBy: { version: 'desc' },
        },
      },
    });
    reqs.sort(
      (a, b) =>
        PILLAR_ORDER.indexOf(a.category.pillar) - PILLAR_ORDER.indexOf(b.category.pillar) ||
        a.category.sortOrder - b.category.sortOrder ||
        a.category.code.localeCompare(b.category.code) ||
        a.code.localeCompare(b.code),
    );

    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });

    const categories = new Map();
    const requirements = [];
    const used = new Set();
    let fileCount = 0;
    let bytes = 0;

    for (const req of reqs) {
      const cat = req.category;
      if (!categories.has(cat.code)) {
        categories.set(cat.code, {
          code: cat.code,
          name: cat.name,
          pillar: cat.pillar,
          sortOrder: cat.sortOrder,
        });
      }
      // Última versión por nombre de archivo: varios documentos distintos
      // pueden compartir requisito; las versiones viejas no se exportan.
      const latest = new Map();
      for (const f of req.files) {
        if (!latest.has(f.originalName)) latest.set(f.originalName, f);
      }
      const files = [];
      const folder = path.join(PILLAR_FOLDERS[cat.pillar] || cat.pillar, safeName(cat.name));
      for (const f of [...latest.values()].reverse()) {
        let rel = path.join(folder, safeName(f.originalName));
        if (used.has(rel.toLowerCase())) {
          rel = path.join(folder, safeName(`${req.code} ${f.originalName}`));
        }
        used.add(rel.toLowerCase());
        const buffer = await readStored(prisma, f.storageKey);
        fs.mkdirSync(path.join(outDir, folder), { recursive: true });
        fs.writeFileSync(path.join(outDir, rel), buffer);
        files.push({
          path: rel.split(path.sep).join('/'),
          originalName: f.originalName,
          mimeType: f.mimeType,
          periodLabel: f.periodLabel || null,
        });
        fileCount += 1;
        bytes += buffer.length;
      }
      requirements.push({
        code: req.code,
        categoryCode: cat.code,
        title: req.title,
        description: req.description,
        isMandatory: req.isMandatory,
        isEnabled: req.isEnabled,
        validityDays: req.validityDays,
        requiresClinicSignature: req.requiresClinicSignature,
        responsibleArea: req.responsibleArea,
        files,
      });
    }

    const manifest = {
      version: 1,
      specialty: clinic.specialty,
      exportedAt: new Date().toISOString(),
      categories: [...categories.values()],
      requirements,
    };
    fs.writeFileSync(
      path.join(outDir, 'estructura.json'),
      JSON.stringify(manifest, null, 2),
    );
    console.log(
      `Exportado ${clinic.specialty}: ${categories.size} tipos documentales, ` +
        `${requirements.length} requisitos, ${fileCount} archivos, ` +
        `${(bytes / 1048576).toFixed(1)} MB → ${outDir}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
