import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { HostingReminderController } from './hosting-reminder.controller';
import { HostingReminderService } from './hosting-reminder.service';
import { PlatformBillingController } from './platform-billing.controller';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformReceiptPdfService } from './platform-receipt-pdf.service';

@Module({
  imports: [NotificationsModule],
  controllers: [PlatformBillingController, HostingReminderController],
  providers: [PlatformBillingService, PlatformReceiptPdfService, HostingReminderService],
  exports: [PlatformBillingService],
})
export class PlatformBillingModule {}
