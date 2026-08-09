import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { ResendNotificationDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('appointment/:appointmentId')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.RECEPTIONIST,
    UserRole.AUDITOR,
  )
  listByAppointment(
    @Req() req: { user: User },
    @Param('appointmentId') appointmentId: string,
  ) {
    return this.notifications.listByAppointment(req.user, appointmentId);
  }

  @Post('resend')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST)
  resend(@Req() req: { user: User }, @Body() dto: ResendNotificationDto) {
    return this.notifications.resend(req.user, dto.appointmentId, dto.channel);
  }
}
