import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClinicalStorageService } from '../clinical/clinical-storage.service';
import { ClinicReceiptsController } from './clinic-receipts.controller';
import { PlatformReceiptArchiveService } from './platform-receipt-archive.service';
import { HostingReminderController } from './hosting-reminder.controller';
import { HostingReminderService } from './hosting-reminder.service';
import { PlatformBillingController } from './platform-billing.controller';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformReceiptPdfService } from './platform-receipt-pdf.service';

@Module({
  imports: [NotificationsModule],
  controllers: [PlatformBillingController, HostingReminderController, ClinicReceiptsController],
  providers: [
    PlatformBillingService,
    PlatformReceiptPdfService,
    PlatformReceiptArchiveService,
    ClinicalStorageService,
    HostingReminderService,
  ],
  exports: [PlatformBillingService],
})
export class PlatformBillingModule {}
