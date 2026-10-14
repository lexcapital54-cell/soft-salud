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
 *
 * Opcionales:
 *   ONLY_UPLOADER_ROLE=SUPER_ADMIN  solo archivos cargados por ese rol (plantillas);
 *                                   lo que subió el consultorio no se replica.
 *   EXCLUDE_PILLARS=SG_SST          grupos que no entran al paquete (separados por coma).
 *   STRIP_SOURCE_APPROVER=1         quita de cada PDF el sello «Aprobó» con el nombre del
 *                                   profesional del consultorio origen; al replicar se
 *                                   sella con el del consultorio destino.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Texto legible de un flujo de contenido (literales y cadenas hexadecimales). */
function streamText(raw) {
  return normalize(
    raw.replace(/<([0-9A-Fa-f\s]{2,})>/g, (_, h) => Buffer.from(h.replace(/\s+/g, ''), 'hex').toString('latin1')),
  );
}

/**
 * Quita los flujos pequeños que solo contienen el sello con el nombre del profesional origen.
 * Si el nombre aparece en el contenido propio de la plantilla, el archivo se reporta y se omite.
 */
async function stripApprover(buffer, names) {
  const { PDFDocument, PDFArray, PDFName, PDFRawStream, PDFRef } = require('pdf-lib');
  const pdf = await PDFDocument.load(buffer, { updateMetadata: false });
  const decode = (stream) => {
    const filter = stream.dict.get(PDFName.of('Filter'));
    const bytes = Buffer.from(stream.contents);
    return filter && String(filter) === '/FlateDecode' ? zlib.inflateSync(bytes).toString('latin1') : bytes.toString('latin1');
  };
  let removed = 0;
  for (const page of pdf.getPages()) {
    const contents = pdf.context.lookup(page.node.get(PDFName.of('Contents')));
    const list = contents instanceof PDFArray ? contents : null;
    if (!list) continue;
    for (let i = list.size() - 1; i >= 0; i -= 1) {
      const ref = list.get(i);
      const stream = pdf.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      let text;
      try {
        text = decode(stream);
      } catch {
        continue;
      }
      if (text.length > 2000) continue;
      const readable = streamText(text);
      if (names.some((n) => readable.includes(n))) {
        list.remove(i);
        // pdf-lib guarda también los objetos huérfanos: se borra el flujo, no solo la referencia.
        if (ref instanceof PDFRef) pdf.context.delete(ref);
        removed += 1;
      }
    }
  }
  const out = Buffer.from(await pdf.save({ useObjectStreams: false }));
  // Verificación: el nombre no debe quedar en ningún flujo del archivo resultante.
  const check = await PDFDocument.load(out, { updateMetadata: false });
  for (const [, obj] of check.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    let text;
    try {
      text = streamText(decode(obj));
    } catch {
      continue;
    }
    if (names.some((n) => text.includes(n))) return { buffer: null, removed };
  }
  return { buffer: out, removed };
}

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

    const onlyRole = (process.env.ONLY_UPLOADER_ROLE || '').trim();
    const excludedPillars = (process.env.EXCLUDE_PILLARS || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const reqs = await prisma.documentRequirement.findMany({
      where: {
        clinicId,
        archivedAt: null,
        ...(excludedPillars.length ? { category: { pillar: { notIn: excludedPillars } } } : {}),
      },
      include: {
        category: true,
        files: {
          where: {
            status: { not: 'RETIRED' },
            ...(onlyRole ? { uploadedBy: { role: onlyRole } } : {}),
          },
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

    let approverNames = [];
    if (process.env.STRIP_SOURCE_APPROVER === '1') {
      const staff = await prisma.user.findMany({
        where: { clinicId, role: { not: 'SUPER_ADMIN' } },
        select: { fullName: true },
      });
      approverNames = [
        ...new Set(staff.flatMap((u) => normalize(u.fullName).split(/\s+/))),
      ].filter((w) => w.length >= 5);
    }
    const skipped = [];
    let stripped = 0;

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
        let buffer = await readStored(prisma, f.storageKey);
        if (approverNames.length && (f.mimeType || '').includes('pdf')) {
          const clean = await stripApprover(buffer, approverNames);
          if (!clean.buffer) {
            skipped.push(rel);
            continue;
          }
          buffer = clean.buffer;
          stripped += clean.removed;
        }
        used.add(rel.toLowerCase());
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
    if (approverNames.length) {
      console.log(`Sellos del profesional origen retirados: ${stripped}.`);
    }
    if (skipped.length) {
      console.log(`Omitidos por contener datos del consultorio origen (${skipped.length}):\n  ${skipped.join('\n  ')}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
