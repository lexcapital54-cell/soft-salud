import { Module } from '@nestjs/common';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';
import { ConsentPdfService } from './consent-pdf.service';
import { ConsentsController } from './consents.controller';
import { ConsentsService } from './consents.service';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';
import { FormTemplatesService } from './form-templates.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  controllers: [
    CatalogsController,
    PatientsController,
    EncountersController,
    ConsentsController,
  ],
  providers: [
    CatalogsService,
    PatientsService,
    EncountersService,
    FormTemplatesService,
    ConsentsService,
    ConsentPdfService,
  ],
  exports: [FormTemplatesService, ConsentsService, ConsentPdfService],
})
export class ClinicalModule {}
