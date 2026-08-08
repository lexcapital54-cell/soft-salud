import { Module } from '@nestjs/common';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';
import { FormTemplatesService } from './form-templates.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  controllers: [CatalogsController, PatientsController, EncountersController],
  providers: [
    CatalogsService,
    PatientsService,
    EncountersService,
    FormTemplatesService,
  ],
  exports: [FormTemplatesService],
})
export class ClinicalModule {}
