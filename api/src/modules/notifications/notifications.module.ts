import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailSmtpProvider, WhatsappDevProvider } from './notification-providers';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, WhatsappDevProvider, EmailSmtpProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
