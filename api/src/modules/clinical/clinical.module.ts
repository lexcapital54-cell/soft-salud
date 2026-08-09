import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';
import { ClinicalStorageService } from './clinical-storage.service';
import { ConsentPdfService } from './consent-pdf.service';
import { ConsentsController } from './consents.controller';
import { ConsentsService } from './consents.service';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';
import { FormTemplatesService } from './form-templates.service';
import { IncapacitiesController } from './incapacities.controller';
import { IncapacitiesService } from './incapacities.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { ProfessionalSignatureService } from './professional-signature.service';
import { SivigilaController } from './sivigila.controller';
import { SivigilaService } from './sivigila.service';

@Module({
  controllers: [
    CatalogsController,
    PatientsController,
    EncountersController,
    ConsentsController,
    IncapacitiesController,
    AttachmentsController,
    SivigilaController,
  ],
  providers: [
    CatalogsService,
    PatientsService,
    EncountersService,
    FormTemplatesService,
    ConsentsService,
    ConsentPdfService,
    ClinicalStorageService,
    ProfessionalSignatureService,
    IncapacitiesService,
    AttachmentsService,
    SivigilaService,
  ],
  exports: [
    FormTemplatesService,
    ConsentsService,
    ConsentPdfService,
    ClinicalStorageService,
    EncountersService,
    ProfessionalSignatureService,
  ],
})
export class ClinicalModule {}
