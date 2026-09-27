import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformBillingController } from './platform-billing.controller';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformReceiptPdfService } from './platform-receipt-pdf.service';

@Module({
  imports: [NotificationsModule],
  controllers: [PlatformBillingController],
  providers: [PlatformBillingService, PlatformReceiptPdfService],
  exports: [PlatformBillingService],
})
export class PlatformBillingModule {}
