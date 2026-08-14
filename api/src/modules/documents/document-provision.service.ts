import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { seedDocumentRequirementsForClinic } from '../../../prisma/seed/document-requirements.seed';
import { seedSgsstRequirementsForClinic } from '../../../prisma/seed/sgsst-requirements.seed';
import { DashboardType } from '../../common/enums';
import { PrismaService } from '../../prisma/prisma.module';

@Injectable()
export class DocumentProvisionService {
  private readonly logger = new Logger(DocumentProvisionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureForClinic(clinicId: string, dashboardType: string | null) {
    if (dashboardType !== DashboardType.CLINICAL_HISTORY_WITH_DOCS) {
      return { skipped: true as const };
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
    return { skipped: false as const, excel, sgsst };
  }
}
