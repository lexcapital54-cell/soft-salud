import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';
import { ClinicalStorageService } from './clinical-storage.service';
import { ConsentPdfService } from './consent-pdf.service';
import { ConsentRevocationService } from './consent-revocation.service';
import { ConsentsController } from './consents.controller';
import { ConsentsService } from './consents.service';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';
import { HceExportController } from './hce-export.controller';
import { HceExportService } from './hce-export.service';
import { HcePdfService } from './hce-pdf.service';
import { OrthoEpicrisisPdfService } from './ortho-epicrisis-pdf.service';
import { FormTemplatesService } from './form-templates.service';
import { IncapacitiesController } from './incapacities.controller';
import { IncapacitiesService } from './incapacities.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { ProfessionalSignatureService } from './professional-signature.service';
import { RdaExportService } from './rda-export.service';
import { SivigilaController } from './sivigila.controller';
import { SivigilaService } from './sivigila.service';
import { RemoteConsentController } from './remote-consent.controller';
import { RemoteConsentService } from './remote-consent.service';
import { OrthoTrackingController } from './ortho-tracking.controller';
import { OrthoTrackingService } from './ortho-tracking.service';
import { AestheticTrackingController } from './aesthetic-tracking.controller';
import { AestheticIndicatorsController } from './aesthetic-indicators.controller';
import { AestheticIndicatorsService } from './aesthetic-indicators.service';
import { AestheticTrackingService } from './aesthetic-tracking.service';

@Module({
  imports: [NotificationsModule],
  controllers: [
    CatalogsController,
    PatientsController,
    EncountersController,
    ConsentsController,
    RemoteConsentController,
    IncapacitiesController,
    AttachmentsController,
    SivigilaController,
    HceExportController,
    OrthoTrackingController,
    AestheticTrackingController,
    AestheticIndicatorsController,
  ],
  providers: [
    CatalogsService,
    PatientsService,
    EncountersService,
    FormTemplatesService,
    ConsentsService,
    ConsentPdfService,
    ConsentRevocationService,
    ClinicalStorageService,
    ProfessionalSignatureService,
    RdaExportService,
    IncapacitiesService,
    AttachmentsService,
    SivigilaService,
    HcePdfService,
    OrthoEpicrisisPdfService,
    HceExportService,
    RemoteConsentService,
    OrthoTrackingService,
    AestheticTrackingService,
    AestheticIndicatorsService,
  ],
  exports: [
    FormTemplatesService,
    ConsentsService,
    ConsentPdfService,
    ClinicalStorageService,
    EncountersService,
    ProfessionalSignatureService,
    RdaExportService,
    RemoteConsentService,
  ],
})
export class ClinicalModule {}
