import { Module } from '@nestjs/common';
import { ClinicalStorageService } from '../clinical/clinical-storage.service';
import { DocumentProvisionService } from './document-provision.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { SgsstFillPdfService } from './sgsst-fill-pdf.service';

@Module({
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentProvisionService,
    ClinicalStorageService,
    SgsstFillPdfService,
  ],
  exports: [DocumentsService, DocumentProvisionService],
})
export class DocumentsModule {}
