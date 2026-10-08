/**
 * Paquete documental maestro por especialidad (`estructura.json` + carpetas).
 *
 * A diferencia del pack de psicología (que se empareja por nombre de archivo),
 * aquí la estructura viene explícita: tipos documentales, requisitos en orden y
 * los archivos de cada requisito. Se exporta con `scripts/export-specialty-pack.js`.
 *
 * Idempotente: no toca requisitos existentes ni duplica archivos ya cargados
 * (mismo nombre original en el mismo requisito).
 */
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { AuditAction, DocumentPillar, PrismaClient } from '@prisma/client';

export type SpecialtyPackManifest = {
  version: number;
  specialty: string;
  categories: Array<{
    code: string;
    name: string;
    pillar: DocumentPillar;
    sortOrder: number;
  }>;
  requirements: Array<{
    code: string;
    categoryCode: string;
    title: string;
    description: string | null;
    isMandatory: boolean;
    isEnabled: boolean;
    validityDays: number | null;
    requiresClinicSignature: boolean;
    responsibleArea?: string | null;
    files: Array<{
      path: string;
      originalName: string;
      mimeType: string;
      periodLabel: string | null;
    }>;
  }>;
};

export type SpecialtyPackStats = {
  requirementsCreated: number;
  filesImported: number;
  filesSkipped: number;
  missingFiles: string[];
};

/** Carpeta del repo y punto de montaje en Docker de cada especialidad. */
const SPECIALTY_PACKS: Record<string, { folder: string; mount: string }> = {
  PHYSIOTHERAPY: {
    folder: 'DOCUMENTOS PDF FISIOTERAPIA',
    mount: '/app/habilitation-packs/fisioterapia',
  },
};

export function specialtyPackPath(specialty: string | null | undefined): string | null {
  if (!specialty) return null;
  const pack = SPECIALTY_PACKS[specialty];
  if (!pack) return null;
  const fromEnv = process.env[`HABILITATION_PACK_PATH_${specialty}`]?.trim();
  const candidates = [
    fromEnv,
    pack.mount,
    path.resolve(process.cwd(), '..', pack.folder),
    path.resolve(process.cwd(), pack.folder),
  ].filter((c): c is string => !!c);
  return (
    candidates.find((c) => existsSync(path.join(c, 'estructura.json'))) ?? null
  );
}

export function readSpecialtyPack(packRoot: string): SpecialtyPackManifest {
  return JSON.parse(
    readFileSync(path.join(packRoot, 'estructura.json'), 'utf8'),
  ) as SpecialtyPackManifest;
}

export async function importSpecialtyPackForClinic(
  prisma: PrismaClient,
  clinicId: string,
  options: {
    packRoot: string;
    uploadedById: string;
    /** false: solo crea la estructura (requisitos vacíos). */
    withFiles?: boolean;
    writeFile: (
      pillar: DocumentPillar,
      requirementCode: string,
      originalName: string,
      buffer: Buffer,
      mimeType: string,
    ) => Promise<{ storageKey: string; checksum: string }>;
    /** Autodiligencia el PDF con los datos del consultorio destino. */
    transformPdf?: (buffer: Buffer) => Promise<Buffer>;
    log?: (msg: string) => void;
  },
): Promise<SpecialtyPackStats> {
  const log = options.log ?? (() => undefined);
  const manifest = readSpecialtyPack(options.packRoot);
  const stats: SpecialtyPackStats = {
    requirementsCreated: 0,
    filesImported: 0,
    filesSkipped: 0,
    missingFiles: [],
  };

  // Los tipos documentales son globales: se crean si faltan, sin renombrar los existentes.
  const categoryIds = new Map<string, { id: string; pillar: DocumentPillar }>();
  for (const cat of manifest.categories) {
    const row = await prisma.documentCategory.upsert({
      where: { code: cat.code },
      create: {
        code: cat.code,
        name: cat.name,
        pillar: cat.pillar,
        sortOrder: cat.sortOrder,
      },
      update: {},
      select: { id: true, pillar: true },
    });
    categoryIds.set(cat.code, row);
  }

  for (const item of manifest.requirements) {
    const category = categoryIds.get(item.categoryCode);
    if (!category) continue;

    let requirement = await prisma.documentRequirement.findUnique({
      where: { clinicId_code: { clinicId, code: item.code } },
      select: { id: true },
    });
    if (!requirement) {
      requirement = await prisma.documentRequirement.create({
        data: {
          clinicId,
          categoryId: category.id,
          code: item.code,
          title: item.title,
          description: item.description,
          isMandatory: item.isMandatory,
          isEnabled: item.isEnabled,
          validityDays: item.validityDays,
          requiresClinicSignature: item.requiresClinicSignature,
          responsibleArea: item.responsibleArea ?? null,
        },
        select: { id: true },
      });
      stats.requirementsCreated += 1;
    }

    if (options.withFiles === false) continue;
    for (const file of item.files) {
      const already = await prisma.documentFile.findFirst({
        where: { requirementId: requirement.id, originalName: file.originalName },
        select: { id: true },
      });
      if (already) {
        stats.filesSkipped += 1;
        continue;
      }
      const absolute = path.join(options.packRoot, file.path);
      if (!existsSync(absolute)) {
        stats.missingFiles.push(file.path);
        continue;
      }

      let buffer: Buffer = readFileSync(absolute);
      const mimeType = file.mimeType || 'application/octet-stream';
      if (options.transformPdf && mimeType.includes('pdf')) {
        buffer = await options.transformPdf(buffer);
      }
      const written = await options.writeFile(
        category.pillar,
        item.code,
        file.originalName,
        buffer,
        mimeType,
      );
      const last = await prisma.documentFile.findFirst({
        where: { requirementId: requirement.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const created = await prisma.documentFile.create({
        data: {
          requirementId: requirement.id,
          uploadedById: options.uploadedById,
          version: (last?.version ?? 0) + 1,
          periodLabel: file.periodLabel,
          status: 'SIGNED',
          originalName: file.originalName,
          storageKey: written.storageKey,
          mimeType,
          sizeBytes: buffer.length,
          checksum: written.checksum,
          expiresAt: item.validityDays
            ? new Date(Date.now() + item.validityDays * 86_400_000)
            : null,
        },
      });
      await prisma.auditLog.create({
        data: {
          clinicId,
          userId: options.uploadedById,
          action: AuditAction.UPLOAD,
          entityType: 'DocumentFile',
          entityId: created.id,
          metadata: {
            source: 'specialty-pack',
            specialty: manifest.specialty,
            relativePath: file.path,
            requirementCode: item.code,
          },
        },
      });
      stats.filesImported += 1;
    }
  }

  log(
    `Paquete ${manifest.specialty}: +${stats.requirementsCreated} requisitos, ` +
      `+${stats.filesImported} archivos, ${stats.filesSkipped} ya estaban` +
      (stats.missingFiles.length ? `, ${stats.missingFiles.length} faltantes en disco` : ''),
  );
  return stats;
}
