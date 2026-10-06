import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { ClinicSpecialty } from '@prisma/client';
import { seedDocumentRequirementsForClinic } from '../../../prisma/seed/document-requirements.seed';
import { seedPhysiotherapyDocsForClinic } from '../../../prisma/seed/physiotherapy-docs.seed';
import { seedSgsstRequirementsForClinic } from '../../../prisma/seed/sgsst-requirements.seed';
import { DashboardType } from '../../common/enums';
import { PrismaService } from '../../prisma/prisma.module';
import { HabilitationPackImportService } from './habilitation-pack-import.service';

@Injectable()
export class DocumentProvisionService {
  private readonly logger = new Logger(DocumentProvisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly packImport: HabilitationPackImportService,
  ) {}

  async ensureForClinic(
    clinicId: string,
    dashboardType: string | null,
    options: { importPack?: boolean } = {},
  ) {
    if (dashboardType !== DashboardType.CLINICAL_HISTORY_WITH_DOCS) {
      return { skipped: true as const };
    }

    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { specialty: true, name: true },
    });

    if (clinic?.specialty === ClinicSpecialty.PHYSIOTHERAPY) {
      // Sin checklist ni pack de psicología: el SUPER_ADMIN carga y replica.
      await seedPhysiotherapyDocsForClinic(this.prisma, clinicId);
      this.logger.log(
        `Gestión documental fisioterapia: sin auto-carga de psicología para ${clinic.name}.`,
      );
      return { skipped: false as const, physiotherapy: { empty: true } };
    }

    if (
      clinic?.specialty === ClinicSpecialty.DENTISTRY ||
      clinic?.specialty === ClinicSpecialty.ORTHODONTICS
    ) {
      // El checklist de psicología no aplica: el SUPER_ADMIN carga la documentación odontológica.
      this.logger.log(
        `Gestión documental odontología / ortodoncia: sin auto-carga de psicología para ${clinic.name}.`,
      );
      return { skipped: false as const, dentistry: { empty: true } };
    }

    const excelPath =
      process.env.HABILITATION_EXCEL_PATH ||
      path.join(
        process.cwd(),
        'prisma/seed/catalogs/Checklist_Habilitacion_Consultorio_Psicologico_Base2.xlsx',
      );

    const excel = await seedDocumentRequirementsForClinic(
      this.prisma,
      clinicId,
      excelPath,
    );
    const sgsst = await seedSgsstRequirementsForClinic(this.prisma, clinicId);
    this.logger.log(
      `Gestión documental lista para ${clinicId}: ${excel.upserted} requisitos de habilitación + ${sgsst.upserted} SG-SST`,
    );

    if (options.importPack === false) {
      return { skipped: false as const, excel, sgsst };
    }

    try {
      await this.packImport.importForClinic(clinicId);
    } catch (error) {
      this.logger.warn(
        `No se importó el paquete PDF de psicología para ${clinicId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return { skipped: false as const, excel, sgsst };
  }
}
