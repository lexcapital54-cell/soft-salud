/**
 * Importa el corpus documental del consultorio al expediente digital.
 *
 * Origen: ../DOCUMENOS PDF PSICOLOGIA (y SSST PSICOLOGIA)
 * Destino: DocumentFile + storage/habilitation-docs/...
 *
 * Uso:
 *   npx ts-node scripts/import-habilitation-docs.ts
 *   npx ts-node scripts/import-habilitation-docs.ts --dry-run
 *
 * Es idempotente: si ya existe un DocumentFile con el mismo checksum para el
 * mismo requisito, lo omite. Cuando hay pareja .docx + .pdf, prioriza el PDF
 * (evidencia sellada) y deja el Word solo si no hay PDF equivalente.
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs';
import * as path from 'path';
import { AuditAction, DocumentPillar, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const DOCS_ROOT = path.resolve(
  process.cwd(),
  '..',
  'DOCUMENOS PDF PSICOLOGIA',
);

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), 'storage');

type ReqRow = {
  id: string;
  code: string;
  title: string;
  pillar: DocumentPillar;
  categoryCode: string;
};

/** Normaliza texto para comparar nombres de archivo con títulos. */
function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: string) {
  return normalize(value)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

const STOP = new Set([
  'del',
  'de',
  'la',
  'las',
  'los',
  'el',
  'en',
  'con',
  'para',
  'por',
  'una',
  'uno',
  'y',
  'o',
  'pdf',
  'docx',
  'doc',
  'formato',
  'manual',
  'programa',
  'procedimiento',
]);

/**
 * Alias explícitos: fragmento del path relativo (normalizado) → código(s) de
 * requisito. El SG-SST va casi todo por aquí porque los nombres del Word no
 * coinciden con los códigos SST_*.
 */
const ALIASES: Array<{ match: string | RegExp; codes: string[] }> = [
  // ── SG-SST ──────────────────────────────────────────────────────────────
  {
    match: /acta de nombramiento del responsable/i,
    codes: ['SST_ACTA_NOMBRAMIENTO_RESPONSABLE'],
  },
  {
    match: /carta de designacion del responsable/i,
    codes: ['SST_ACTA_NOMBRAMIENTO_RESPONSABLE'],
  },
  {
    match: /cronograma anual de capacitacion/i,
    codes: ['SST_CRONOGRAMA_CAPACITACION'],
  },
  { match: /evaluacion inicial|prediagnostico/i, codes: ['SST_EVALUACION_INICIAL'] },
  {
    match: /gestion de accidentes e incidentes|accidentes_e_incidentes/i,
    codes: ['SST_REPORTE_ACCIDENTES'],
  },
  {
    match: /formato de inspeccion|sst-ins-001|programa_de_inspecciones/i,
    codes: ['SST_INSPECCION_EXTINTORES', 'SST_INSPECCION_BOTIQUIN'],
  },
  { match: /auditoria interna del sg/i, codes: ['SST_AUDITORIA_INTERNA'] },
  { match: /manual de indicadores del sg/i, codes: ['SST_INDICADORES'] },
  {
    match: /riesgo psicosocial|gestion del riesgo psicosocial/i,
    codes: ['SST_RIESGO_PSICOSOCIAL'],
  },
  {
    match: /matriz de identificacion de peligros|matriz_de_identificacion/i,
    codes: ['SST_MATRIZ_PELIGROS'],
  },
  {
    match: /matriz de riesgos prioritarios/i,
    codes: ['SST_MATRIZ_PELIGROS'],
  },
  { match: /matriz legal sg|matriz legal/i, codes: ['SST_MATRIZ_LEGAL'] },
  {
    match: /objetivos de seguridad y salud/i,
    codes: ['SST_OBJETIVOS'],
  },
  {
    match: /plan anual de trabajo/i,
    codes: ['SST_PLAN_ANUAL_TRABAJO'],
  },
  {
    match: /plan de emergencias/i,
    codes: ['SST_PLAN_EMERGENCIAS', '10_001_PLAN'],
  },
  {
    match: /plan de mejoramiento del sg/i,
    codes: ['SST_PLAN_MEJORAMIENTO'],
  },
  {
    match: /politica de seguridad y salud en el trabajo/i,
    codes: ['SST_POLITICA_SST'],
  },
  {
    match: /actas_capacitacion|actas de capacitac/i,
    codes: ['SST_ACTAS_CAPACITACION'],
  },
  {
    match: /medicina_preventiva|medicina preventiva/i,
    codes: ['SST_MEDICINA_PREVENTIVA'],
  },
  {
    match: /gestion_del_cambio|gestion del cambio/i,
    codes: ['SST_GESTION_CAMBIO'],
  },
  {
    match: /riesgo_biomecanico|biomecanico|ergonomia/i,
    codes: ['SST_RIESGO_BIOMECANICO'],
  },
  {
    match: /gestion_contratistas|gestion de contratistas/i,
    codes: ['SST_GESTION_CONTRATISTAS'],
  },
  {
    match: /revision_por_la_direccion|revision por la direccion/i,
    codes: ['SST_REVISION_DIRECCION'],
  },
  {
    match: /simulacro/i,
    codes: ['SST_SIMULACRO', '10_002_SIMULACROS'],
  },
  {
    match: /induccion_y_reinduccion|induccion y reinduccion/i,
    codes: ['SST_CRONOGRAMA_CAPACITACION'],
  },

  // ── Dotación / medicamentos / infraestructura ───────────────────────────
  {
    match: /acta_no_aplicabilidad_biomedicos|no aplicabilidad/i,
    codes: ['04_001_INVENTARIO_GENERAL', '05_001_ACTA_DE_NO_APLICABILIDAD'],
  },
  {
    match: /hoja_vida_equipos|hojas de vida/i,
    codes: ['04_005_HOJAS_DE_VIDA_DE_EQUIPOS'],
  },
  {
    match: /inventario_mobiliario|inventario mobiliario/i,
    codes: ['04_001_INVENTARIO_GENERAL'],
  },
  {
    match: /matriz_pruebas_psicologicas|pruebas psicologicas/i,
    codes: ['04_002_PROCEDIMIENTO_DE_ADMINISTRACION_DE_EQUIP'],
  },
  {
    match: /verificacion de plagas|prevencion_plagas|prevencion de plagas/i,
    codes: ['03_008_PLAN_DE_MANTENIMIENTO_LOCATIVO'],
  },
  {
    match: /matriz_integral_riesgos|matriz integral riesgos/i,
    codes: ['06_003_MATRIZ_DE_RIESGOS'],
  },
  {
    match: /matriz_residuos/i,
    codes: ['09_001_PLAN', '03_004_PLANO_DE_RUTA_DE_RESIDUOS'],
  },
  {
    match: /mantenimiento_locativo|mantenimiento locativo/i,
    codes: ['03_008_PLAN_DE_MANTENIMIENTO_LOCATIVO'],
  },
  {
    match: /certificado_retie|retie/i,
    codes: ['03_005_CERTIFICACION_RETIE'],
  },
  {
    match: /tarjeta profesional electric/i,
    codes: ['03_005_CERTIFICACION_RETIE'],
  },
  {
    match: /acta_declaracion_no_uso|declaracion no uso|no uso psicologia/i,
    codes: ['05_001_ACTA_DE_NO_APLICABILIDAD'],
  },

  // ── Procesos prioritarios ───────────────────────────────────────────────
  {
    match: /politica_seguridad_paciente/i,
    codes: ['06_001_POLITICA', '08_001_PROGRAMA'],
  },
  {
    match: /programa_seguridad_paciente/i,
    codes: ['08_001_PROGRAMA', '06_002_PROGRAMA'],
  },
  {
    match: /matriz_riesgos_asistenciales|matriz_riesgos_psicologia_3100|mapa_riesgos/i,
    codes: ['06_003_MATRIZ_DE_RIESGOS'],
  },
  {
    match: /procedimiento_reporte_eventos|formato_reporte_incidentes|formato_eventos_adversos/i,
    codes: ['06_004_REPORTE_DE_INCIDENTES', '08_002_REPORTE_INCIDENTES'],
  },
  {
    match: /acta_seguridad_paciente|acta de seguridad del paciente/i,
    codes: ['08_001_PROGRAMA'],
  },
  {
    match: /manual_mejoramiento_analisis/i,
    codes: ['08_004_ANALISIS_CAUSA', '08_005_PLAN_MEJORA'],
  },
  {
    match: /procedimiento_pqrs|formato_pqrs|indicadores_pqrs|reclamos internos/i,
    codes: ['06_006_PROCEDIMIENTO'],
  },
  {
    match: /politica_humanizacion/i,
    codes: ['06_001_POLITICA'],
  },
  {
    match: /programa_humanizacion/i,
    codes: ['06_002_PROGRAMA'],
  },
  {
    match: /planes_accion_psicologia/i,
    codes: ['11_004_PLANES_MEJORA'],
  },
  {
    match: /indicadores_calidad|indicadores_calidad_psicologia/i,
    codes: ['11_001_INDICADORES'],
  },
  {
    match: /pamec_psicologia/i,
    codes: ['11_001_INDICADORES', '11_002_CRONOGRAMA'],
  },
  {
    match: /programa_auditorias/i,
    codes: ['11_003_AUDITORIAS'],
  },
  {
    match: /procedimiento_recepcion|atencion_recepcion/i,
    codes: ['06_006_PROCEDIMIENTO'],
  },
  {
    match: /procedimiento_valoracion|atencion_valoracion/i,
    codes: ['06_006_PROCEDIMIENTO'],
  },
  {
    match: /procedimiento_seguimiento|atencion_seguimiento/i,
    codes: ['06_006_PROCEDIMIENTO'],
  },
  {
    match: /procedimiento_cierre|atencion_cierre/i,
    codes: ['06_006_PROCEDIMIENTO'],
  },
  {
    match:
      /lim[\s_-]*des[\s_-]*ban|limpieza y desinfeccion|programa limpieza|registro limpieza|limpieza de areas|uso epp limpieza/i,
    codes: ['06_006_PROCEDIMIENTO'],
  },
  {
    match: /procedimiento_apertura_hc/i,
    codes: ['06_007_APERTURA', '07_001_HISTORIA_CLINICA_PSICOLOGICA'],
  },
  {
    match: /procedimiento_custodia_hc/i,
    codes: ['06_008_CUSTODIA', '07_008_CUSTODIA_DOCUMENTAL'],
  },
  {
    match: /procedimiento_archivo_hc|procedimiento_conservacion_hc/i,
    codes: ['07_008_CUSTODIA_DOCUMENTAL'],
  },
  {
    match: /consentimiento_informado|formato_consentimiento/i,
    codes: ['07_002_CONSENTIMIENTO_INFORMADO'],
  },
  {
    match: /compendio_formatos_clinicos|procedimiento_control_formatos/i,
    codes: ['07_002_CONSENTIMIENTO_INFORMADO'],
  },
  {
    match: /procedimiento_gestion_documental|instructivo_codificacion|protocolo_control_documental/i,
    codes: ['07_008_CUSTODIA_DOCUMENTAL'],
  },
  {
    match: /manual_bioseguridad|procedimiento_limpieza|procedimiento_desinfeccion/i,
    codes: ['06_006_PROCEDIMIENTO'],
  },
  {
    match: /plan_pgirasa/i,
    codes: ['09_001_PLAN'],
  },
  {
    match: /registros_pgirasa/i,
    codes: ['09_005_ACTAS'],
  },
  {
    match: /contrato_gestor/i,
    codes: ['09_004_GESTOR'],
  },
  {
    match: /politica ambiental/i,
    codes: ['09_001_PLAN'],
  },
  {
    match: /conformacion_brigadas/i,
    codes: ['10_001_PLAN'],
  },
  {
    match: /carta software|auditoria de historia clinica|tarjeta profesional imgeniero|ingeniero sistemas/i,
    codes: ['07_001_HISTORIA_CLINICA_PSICOLOGICA', '07_009_ENTREGA_DE_COPIAS'],
  },
  {
    match: /procedimiento_referencia/i,
    codes: ['12_007_PROCEDIMIENTO_DE_REFERENCIA'],
  },
  {
    match: /procedimiento_contrarreferencia/i,
    codes: ['12_008_PROCEDIMIENTO_DE_CONTRARREFERENCIA'],
  },
  {
    match: /convenio de colaboracion/i,
    codes: ['12_006_CONVENIOS_FIRMADOS'],
  },
  {
    match: /matriz requisitos legales|matriz_requisitos_legales/i,
    codes: ['01_008_POLITICAS_INSTITUCIONALES', 'SST_MATRIZ_LEGAL'],
  },
  // Meta: listado de faltantes — no es evidencia de cumplimiento.
  { match: /documentos faltantes/i, codes: [] },
  {
    match: /gestion documental sgsst|gestion_documental_sgsst/i,
    codes: ['SST_INDICADORES'],
  },
];

/** Carpeta raíz → pilares candidatos (acota el fuzzy match). */
const FOLDER_PILLARS: Array<{ prefix: string; pillars: DocumentPillar[] }> = [
  {
    prefix: '1. talento humano',
    pillars: [DocumentPillar.TALENTO_HUMANO],
  },
  { prefix: '2. dotacion', pillars: [DocumentPillar.DOTACION] },
  {
    prefix: '3. infraestructura',
    pillars: [DocumentPillar.INFRAESTRUCTURA],
  },
  {
    prefix: '4. medicamentos',
    pillars: [DocumentPillar.MEDICAMENTOS_INSUMOS],
  },
  {
    prefix: '5. procesos prioritarios',
    pillars: [
      DocumentPillar.PROCESOS_PRIORITARIOS,
      DocumentPillar.HISTORIA_CLINICA,
      DocumentPillar.MEDICAMENTOS_INSUMOS,
    ],
  },
  {
    prefix: '6. historia clinica',
    pillars: [DocumentPillar.HISTORIA_CLINICA],
  },
  {
    prefix: '7. interdependencia',
    pillars: [DocumentPillar.INTERDEPENDENCIA],
  },
  {
    prefix: '8. seguridad del paciente',
    pillars: [DocumentPillar.PROCESOS_PRIORITARIOS],
  },
  {
    prefix: 'ssst psicologia',
    pillars: [DocumentPillar.SG_SST],
  },
  {
    prefix: 'formatos',
    pillars: [
      DocumentPillar.PROCESOS_PRIORITARIOS,
      DocumentPillar.DOCUMENTACION_LEGAL,
      DocumentPillar.SG_SST,
    ],
  },
];

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('~$') || entry === '.DS_Store') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkFiles(full));
    else if (/\.(pdf|docx?|xlsx?|jpe?g|png)$/i.test(entry)) out.push(full);
  }
  return out;
}

function mimeOf(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (ext === '.doc') return 'application/msword';
  if (ext === '.xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (ext === '.xls') return 'application/vnd.ms-excel';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

/**
 * Si hay PDF y DOCX con el mismo nombre base, solo importa el PDF.
 * El Word queda en disco del proyecto para edición; el PDF es la evidencia.
 */
function preferPdfSiblings(files: string[]): string[] {
  const byStem = new Map<string, string[]>();
  for (const file of files) {
    const rel = path.relative(DOCS_ROOT, file);
    const stem = normalize(rel.replace(/\.[^.]+$/, ''));
    const list = byStem.get(stem) ?? [];
    list.push(file);
    byStem.set(stem, list);
  }
  const chosen: string[] = [];
  for (const group of byStem.values()) {
    const pdf = group.find((f) => f.toLowerCase().endsWith('.pdf'));
    chosen.push(pdf ?? group[0]);
  }
  return chosen;
}

function resolveByAlias(relPath: string): string[] | null {
  const hay = normalize(relPath);
  for (const alias of ALIASES) {
    const ok =
      typeof alias.match === 'string'
        ? hay.includes(normalize(alias.match))
        : alias.match.test(hay) || alias.match.test(relPath);
    if (ok) return alias.codes;
  }
  return null;
}

function pillarHint(relPath: string): DocumentPillar[] | null {
  const hay = normalize(relPath);
  for (const folder of FOLDER_PILLARS) {
    if (hay.startsWith(normalize(folder.prefix))) return folder.pillars;
  }
  return null;
}

function fuzzyCodes(relPath: string, requirements: ReqRow[]): string[] {
  const fileTokens = tokens(path.basename(relPath));
  if (!fileTokens.length) return [];

  const pillars = pillarHint(relPath);
  const pool = pillars
    ? requirements.filter((r) => pillars.includes(r.pillar))
    : requirements;

  let best: { code: string; score: number } | null = null;
  for (const req of pool) {
    const reqTokens = new Set([...tokens(req.title), ...tokens(req.code)]);
    let hit = 0;
    for (const t of fileTokens) if (reqTokens.has(t)) hit += 1;
    const score = hit / Math.max(fileTokens.length, 1);
    if (score < 0.45) continue;
    if (!best || score > best.score) best = { code: req.code, score };
  }
  return best ? [best.code] : [];
}

function writeToStorage(
  clinicId: string,
  pillar: DocumentPillar,
  requirementCode: string,
  originalName: string,
  buffer: Buffer,
) {
  const safeExt = path.extname(originalName).slice(0, 12);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`;
  const relativeDir = path.join(
    'habilitation-docs',
    clinicId,
    pillar.toLowerCase(),
    requirementCode,
  );
  const storageKey = path.join(relativeDir, fileName).replace(/\\/g, '/');
  const absolutePath = path.join(STORAGE_ROOT, storageKey);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  if (!DRY_RUN) {
    const fs = require('fs') as typeof import('fs');
    fs.writeFileSync(absolutePath, buffer);
  }
  const checksum = createHash('sha256').update(buffer).digest('hex');
  return { storageKey, checksum };
}

async function main() {
  if (!existsSync(DOCS_ROOT)) {
    throw new Error(`No se encontró la carpeta de origen: ${DOCS_ROOT}`);
  }

  const clinic = await prisma.clinic.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  if (!clinic) throw new Error('No hay clínica activa');

  const uploader = await prisma.user.findFirst({
    where: { clinicId: clinic.id, role: { in: ['ADMIN', 'HEALTH_PROFESSIONAL'] } },
    select: { id: true, email: true, fullName: true },
  });
  if (!uploader) throw new Error('No hay usuario ADMIN/profesional en la clínica');

  const requirements = await prisma.documentRequirement.findMany({
    where: { clinicId: clinic.id },
    include: { category: true },
  });
  const byCode = new Map(
    requirements.map((r) => [
      r.code,
      {
        id: r.id,
        code: r.code,
        title: r.title,
        pillar: r.category.pillar,
        categoryCode: r.category.code,
      } satisfies ReqRow,
    ]),
  );
  const reqRows = [...byCode.values()];

  // Algunos códigos del alias pueden no existir (el seed del Excel varía).
  // Intentamos resolver por prefijo / título cercano.
  function resolveCode(code: string): ReqRow | null {
    if (byCode.has(code)) return byCode.get(code)!;
    // Prefijos genéricos del Excel que a veces cambian el slug.
    const soft = reqRows.find(
      (r) =>
        r.code.startsWith(code.split('_').slice(0, 2).join('_')) &&
        normalize(r.title).includes(
          normalize(code.split('_').slice(2).join(' ')).slice(0, 12),
        ),
    );
    return soft ?? null;
  }

  const allFiles = preferPdfSiblings(walkFiles(DOCS_ROOT));
  console.log(`Clínica: ${clinic.name}`);
  console.log(`Usuario carga: ${uploader.fullName} <${uploader.email}>`);
  console.log(`Archivos a procesar: ${allFiles.length}${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log('');

  const stats = {
    imported: 0,
    skippedDup: 0,
    skippedMeta: 0,
    unmapped: [] as string[],
    missingCode: [] as string[],
  };

  for (const absolute of allFiles) {
    const rel = path.relative(DOCS_ROOT, absolute);
    const aliasCodes = resolveByAlias(rel);
    let codes: string[];
    if (aliasCodes === null) {
      codes = fuzzyCodes(rel, reqRows);
    } else if (aliasCodes.length === 0) {
      stats.skippedMeta += 1;
      console.log(`· omitido (meta): ${rel}`);
      continue;
    } else {
      codes = aliasCodes;
    }

    if (!codes.length) {
      stats.unmapped.push(rel);
      console.log(`? sin mapeo: ${rel}`);
      continue;
    }

    const buffer = readFileSync(absolute);
    const originalName = path.basename(absolute);

    for (const code of codes) {
      const req = resolveCode(code);
      if (!req) {
        stats.missingCode.push(`${code} ← ${rel}`);
        console.log(`! código inexistente ${code}: ${rel}`);
        continue;
      }

      const checksum = createHash('sha256').update(buffer).digest('hex');
      const already = await prisma.documentFile.findFirst({
        where: { requirementId: req.id, checksum },
        select: { id: true },
      });
      if (already) {
        stats.skippedDup += 1;
        console.log(`= ya cargado: ${req.code} ← ${rel}`);
        continue;
      }

      const { storageKey } = writeToStorage(
        clinic.id,
        req.pillar,
        req.code,
        originalName,
        buffer,
      );

      if (!DRY_RUN) {
        const last = await prisma.documentFile.findFirst({
          where: { requirementId: req.id },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const version = (last?.version ?? 0) + 1;

        const created = await prisma.documentFile.create({
          data: {
            requirementId: req.id,
            uploadedById: uploader.id,
            version,
            status: 'PENDING_SIGNATURE',
            originalName,
            storageKey,
            mimeType: mimeOf(originalName),
            sizeBytes: buffer.length,
            checksum,
            expiresAt: req.code.startsWith('SST_') && /_ACTAS_|_PAUSAS_|_INSPECCION_/.test(req.code)
              ? (() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 30);
                  return d;
                })()
              : req.code.startsWith('SST_')
                ? (() => {
                    const d = new Date();
                    d.setFullYear(d.getFullYear() + 1);
                    return d;
                  })()
                : null,
          },
        });

        await prisma.storedFile.upsert({
          where: { storageKey },
          create: {
            storageKey,
            mimeType: mimeOf(originalName),
            sizeBytes: buffer.length,
            contentHash: checksum,
            data: buffer,
          },
          update: {
            mimeType: mimeOf(originalName),
            sizeBytes: buffer.length,
            contentHash: checksum,
            data: buffer,
          },
        });

        await prisma.auditLog.create({
          data: {
            clinicId: clinic.id,
            userId: uploader.id,
            action: AuditAction.UPLOAD,
            entityType: 'DocumentFile',
            entityId: created.id,
            metadata: {
              source: 'import-habilitation-docs',
              relativePath: rel,
              requirementCode: req.code,
              checksum,
            },
          },
        });
      }

      stats.imported += 1;
      console.log(`+ ${req.code.padEnd(42)} ← ${rel}`);
    }
  }

  console.log('\n── Resumen ──────────────────────────────');
  console.log(`Importados:          ${stats.imported}`);
  console.log(`Duplicados omitidos: ${stats.skippedDup}`);
  console.log(`Meta omitidos:       ${stats.skippedMeta}`);
  console.log(`Sin mapeo:           ${stats.unmapped.length}`);
  console.log(`Código inexistente:  ${stats.missingCode.length}`);
  if (stats.unmapped.length) {
    console.log('\nArchivos sin mapeo:');
    for (const u of stats.unmapped) console.log('  -', u);
  }
  if (stats.missingCode.length) {
    console.log('\nCódigos no encontrados en BD:');
    for (const u of [...new Set(stats.missingCode)]) console.log('  -', u);
  }

  if (!DRY_RUN) {
    const totalFiles = await prisma.documentFile.count();
    const covered = await prisma.documentRequirement.count({
      where: { clinicId: clinic.id, files: { some: {} } },
    });
    console.log(`\nDocumentFile en BD: ${totalFiles}`);
    console.log(`Requisitos con evidencia: ${covered} / ${requirements.length}`);
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
