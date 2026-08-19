import { Module } from '@nestjs/common';
import { ClinicalStorageService } from '../clinical/clinical-storage.service';
import { DocumentProvisionService } from './document-provision.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { HabilitationPackImportService } from './habilitation-pack-import.service';
import { PdfBrandService } from './pdf-brand.service';
import { SgsstFillPdfService } from './sgsst-fill-pdf.service';

@Module({
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentProvisionService,
    ClinicalStorageService,
    SgsstFillPdfService,
    HabilitationPackImportService,
    PdfBrandService,
  ],
  exports: [DocumentsService, DocumentProvisionService],
})
export class DocumentsModule {}
