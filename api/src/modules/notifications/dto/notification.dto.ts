import { NotificationChannel } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class ResendNotificationDto {
  @IsUUID()
  appointmentId: string;

  @IsEnum(NotificationChannel)
  channel: NotificationChannel;
}
