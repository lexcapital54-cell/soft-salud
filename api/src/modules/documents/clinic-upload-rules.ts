import { DocumentPillar } from '@prisma/client';

type FileLike = {
  status: string;
  uploadedBy?: { role: string } | null;
};

/**
 * Infraestructura: el profesional del consultorio carga lo que está pendiente
 * (sin archivo vigente) y puede reemplazar lo que él mismo cargó. Las
 * plantillas de HABILISALUD (cargadas por superadmin) no las reemplaza.
 */
export function clinicMayUploadInfra(
  pillar: DocumentPillar | string | null | undefined,
  filesNewestFirst: FileLike[],
): boolean {
  if (pillar !== DocumentPillar.INFRAESTRUCTURA) return false;
  const latest = filesNewestFirst.find((f) => f.status !== 'RETIRED');
  return !latest || clinicOwnsInfraFile(pillar, latest);
}

/** Archivo de Infraestructura cargado por el propio consultorio (editable / retirable por él). */
export function clinicOwnsInfraFile(
  pillar: DocumentPillar | string | null | undefined,
  file: FileLike,
): boolean {
  return (
    pillar === DocumentPillar.INFRAESTRUCTURA &&
    !!file.uploadedBy &&
    file.uploadedBy.role !== 'SUPER_ADMIN'
  );
}
