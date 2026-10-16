import { Global, Module } from '@nestjs/common';
import { ClinicalAccessController } from './clinical-access.controller';
import { ClinicalAccessGuard } from './clinical-access.guard';
import { ClinicalAccessService } from './clinical-access.service';

@Global()
@Module({
  controllers: [ClinicalAccessController],
  providers: [ClinicalAccessService, ClinicalAccessGuard],
  exports: [ClinicalAccessService, ClinicalAccessGuard],
})
export class ClinicalAccessModule {}
