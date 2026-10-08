import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'fs';
import { DashboardType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { ClinicalStorageService } from '../clinical/clinical-storage.service';
import {
  defaultHabilitationPackPath,
  importHabilitationPackForClinic,
  type PackImportStats,
} from './habilitation-pack.import';
import { PdfBrandService } from './pdf-brand.service';
import {
  importSpecialtyPackForClinic,
  specialtyPackPath,
  type SpecialtyPackStats,
} from './specialty-pack.import';

@Injectable()
export class HabilitationPackImportService implements OnModuleInit {
  private readonly logger = new Logger(HabilitationPackImportService.name);
  private readonly inflight = new Map<string, Promise<PackImportStats | null>>();
  private readonly done = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ClinicalStorageService,
    private readonly pdfBrand: PdfBrandService,
  ) {}

  hasSpecialtyPack(specialty: string | null | undefined) {
    return !!specialtyPackPath(specialty);
  }

  /**
   * Carga el paquete maestro de la especialidad (estructura + archivos
   * autodiligenciados con el titular del consultorio). Solo en expedientes
   * sin archivos: nunca mezcla con documentación ya cargada.
   */
  async importSpecialtyPack(
    clinicId: string,
    options: { withFiles?: boolean } = {},
  ): Promise<SpecialtyPackStats | null> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true, specialty: true },
    });
    const packRoot = specialtyPackPath(clinic?.specialty);
    if (!clinic || !packRoot) return null;

    const alreadyLoaded = await this.prisma.documentFile.count({
      where: { requirement: { clinicId } },
    });
    if (alreadyLoaded > 0) {
      this.logger.log(
        `«${clinic.name}» ya tiene documentación: no se aplica el paquete ${clinic.specialty}.`,
      );
      return null;
    }

    const uploader = await this.prisma.user.findFirst({
      where: {
        clinicId,
        isActive: true,
        role: { in: ['ADMIN', 'HEALTH_PROFESSIONAL'] },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const withFiles = options.withFiles !== false && !!uploader;
    const brand = withFiles
      ? await this.pdfBrand.resolveBrand(
          { role: UserRole.SUPER_ADMIN } as User,
          clinicId,
        )
      : null;

    return importSpecialtyPackForClinic(this.prisma, clinicId, {
      packRoot,
      uploadedById: uploader?.id ?? '',
      withFiles,
      log: (msg) => this.logger.log(`[${clinic.name}] ${msg}`),
      transformPdf: brand
        ? (buffer) => this.pdfBrand.brandPdf(buffer, brand, { force: true })
        : undefined,
      writeFile: async (pillar, requirementCode, originalName, buffer, mimeType) => {
        const ext = originalName.includes('.')
          ? originalName.slice(originalName.lastIndexOf('.'))
          : '';
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext.slice(0, 12)}`;
        const written = await this.storage.writeBuffer(
          `habilitation-docs/${clinicId}/${pillar.toLowerCase()}/${requirementCode}`,
          fileName,
          buffer,
          mimeType,
        );
        return { storageKey: written.storageKey, checksum: written.contentHash };
      },
    });
  }

  onModuleInit() {
    void this.importAllWithDocs().catch((error) => {
      this.logger.warn(
        `No se pudo importar el paquete documental al arrancar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  async importAllWithDocs() {
    const packRoot = defaultHabilitationPackPath();
    if (!existsSync(packRoot)) {
      this.logger.warn(
        `Paquete DOCUMENTOS PDF PSICOLOGÍA no encontrado en ${packRoot}`,
      );
      return;
    }

    const clinics = await this.prisma.clinic.findMany({
      where: {
        isActive: true,
        isDemo: false,
        dashboardType: DashboardType.CLINICAL_HISTORY_WITH_DOCS,
        // El pack de psicología no aplica a fisioterapia, odontología ni ortodoncia.
        specialty: { notIn: ['PHYSIOTHERAPY', 'DENTISTRY', 'ORTHODONTICS'] },
      },
      select: { id: true, name: true },
    });

    for (const clinic of clinics) {
      await this.importForClinic(clinic.id);
    }
  }

  async importForClinic(clinicId: string): Promise<PackImportStats | null> {
    if (this.done.has(clinicId)) return null;
    const running = this.inflight.get(clinicId);
    if (running) return running;

    const task = this.runImport(clinicId).finally(() => {
      this.inflight.delete(clinicId);
    });
    this.inflight.set(clinicId, task);
    return task;
  }

  async importFromDirectory(
    clinicId: string,
    packRoot: string,
    uploadedById: string,
  ): Promise<PackImportStats> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true, dashboardType: true },
    });
    if (!clinic) {
      throw new Error('Consultorio no encontrado');
    }

    const stats = await importHabilitationPackForClinic(this.prisma, clinicId, {
      packRoot,
      uploadedById,
      log: (msg) => this.logger.log(`[${clinic.name}] ${msg}`),
      writeFile: async (
        id,
        pillar,
        requirementCode,
        originalName,
        buffer,
        mimeType,
      ) => {
        const ext = originalName.includes('.')
          ? originalName.slice(originalName.lastIndexOf('.'))
          : '';
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext.slice(0, 12)}`;
        const written = await this.storage.writeBuffer(
          `habilitation-docs/${id}/${pillar.toLowerCase()}/${requirementCode}`,
          fileName,
          buffer,
          mimeType,
        );
        return { storageKey: written.storageKey, checksum: written.contentHash };
      },
    });

    this.logger.log(
      `Carpeta maestra en ${clinic.name}: ${stats.imported} nuevos, ` +
        `${stats.skippedDup} ya estaban, ${stats.covered}/${stats.totalRequirements} requisitos con archivo.`,
    );
    if (stats.totalRequirements > 0) {
      this.done.add(clinicId);
    }
    return stats;
  }

  private async runImport(clinicId: string): Promise<PackImportStats | null> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true, dashboardType: true, specialty: true },
    });
    if (
      !clinic ||
      clinic.dashboardType !== DashboardType.CLINICAL_HISTORY_WITH_DOCS
    ) {
      return null;
    }
    if (
      clinic.specialty === 'PHYSIOTHERAPY' ||
      clinic.specialty === 'DENTISTRY' ||
      clinic.specialty === 'ORTHODONTICS'
    ) {
      this.logger.log(
        `Omitiendo pack de psicología para «${clinic.name}» (${clinic.specialty}).`,
      );
      this.done.add(clinicId);
      return null;
    }

    const alreadyLoaded = await this.prisma.documentFile.count({
      where: { requirement: { clinicId } },
    });
    if (alreadyLoaded >= 40) {
      this.done.add(clinicId);
      return null;
    }

    const packRoot = defaultHabilitationPackPath();
    if (!existsSync(packRoot)) {
      this.logger.warn(
        `Paquete documental ausente (${packRoot}); ${clinic.name} queda sin archivos de plantilla.`,
      );
      return null;
    }

    const uploader = await this.prisma.user.findFirst({
      where: {
        clinicId,
        isActive: true,
        role: { in: ['ADMIN', 'HEALTH_PROFESSIONAL'] },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, fullName: true },
    });
    if (!uploader) {
      this.logger.warn(
        `No hay profesional/admin en ${clinic.name} para atribuir la carga del paquete.`,
      );
      return null;
    }

    const stats = await importHabilitationPackForClinic(this.prisma, clinicId, {
      packRoot,
      uploadedById: uploader.id,
      log: (msg) => this.logger.log(`[${clinic.name}] ${msg}`),
      writeFile: async (
        id,
        pillar,
        requirementCode,
        originalName,
        buffer,
        mimeType,
      ) => {
        const ext = originalName.includes('.')
          ? originalName.slice(originalName.lastIndexOf('.'))
          : '';
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext.slice(0, 12)}`;
        const written = await this.storage.writeBuffer(
          `habilitation-docs/${id}/${pillar.toLowerCase()}/${requirementCode}`,
          fileName,
          buffer,
          mimeType,
        );
        return { storageKey: written.storageKey, checksum: written.contentHash };
      },
    });

    this.logger.log(
      `Paquete documental en ${clinic.name}: ${stats.imported} nuevos, ` +
        `${stats.skippedDup} ya estaban, ${stats.covered}/${stats.totalRequirements} requisitos con archivo.`,
    );
    if (stats.totalRequirements > 0) {
      this.done.add(clinicId);
    }
    return stats;
  }
}
