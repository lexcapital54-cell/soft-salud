import { BadRequestException, Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { HostingReminderService } from './hosting-reminder.service';

@Controller('me/hosting-reminder')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class HostingReminderController {
  constructor(private readonly reminders: HostingReminderService) {}

  @Get()
  status(@Req() req: { user: User }) {
    if (!req.user.clinicId) throw new BadRequestException('Su usuario no tiene consultorio asignado.');
    return this.reminders.clinicReminder(req.user.clinicId);
  }
}
