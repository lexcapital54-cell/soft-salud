import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { AgendaStaffService } from './agenda-staff.service';
import { SaveAgendaStaffDto } from './dto/agenda-staff.dto';

@Controller('agenda-staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgendaStaffController {
  constructor(private readonly staff: AgendaStaffService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUXILIAR, UserRole.RECEPTIONIST)
  list(@Req() req: { user: User }, @Query('all') all?: string) {
    return this.staff.list(req.user, all === '1' || all === 'true');
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Req() req: { user: User }, @Body() dto: SaveAgendaStaffDto) {
    return this.staff.create(req.user, dto);
  }

  @Post('provision-defaults')
  @Roles(UserRole.ADMIN)
  provisionDefaults(@Req() req: { user: User }) {
    return this.staff.provisionDefaults(req.user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Req() req: { user: User }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveAgendaStaffDto) {
    return this.staff.update(req.user, id, dto);
  }

  /** Igual que PATCH, para proxies que descartan PATCH; va después de las rutas POST fijas. */
  @Post(':id')
  @Roles(UserRole.ADMIN)
  updateViaPost(@Req() req: { user: User }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveAgendaStaffDto) {
    return this.staff.update(req.user, id, dto);
  }
}
