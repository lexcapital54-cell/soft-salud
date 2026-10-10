import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { ClinicServicesService } from './clinic-services.service';
import { SaveClinicServiceDto } from './dto/clinic-service.dto';

@Controller('clinic-services')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClinicServicesController {
  constructor(private readonly services: ClinicServicesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUXILIAR, UserRole.RECEPTIONIST)
  list(@Req() req: { user: User }, @Query('all') all?: string) {
    return this.services.list(req.user, all === '1' || all === 'true');
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Req() req: { user: User }, @Body() dto: SaveClinicServiceDto) {
    return this.services.create(req.user, dto);
  }

  @Post('import-aesthetic-base')
  @Roles(UserRole.ADMIN)
  importBase(@Req() req: { user: User }) {
    return this.services.importAestheticBase(req.user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Req() req: { user: User }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveClinicServiceDto) {
    return this.services.update(req.user, id, dto);
  }

  /** Igual que PATCH, para proxies que descartan PATCH; va después de las rutas POST fijas. */
  @Post(':id')
  @Roles(UserRole.ADMIN)
  updateViaPost(@Req() req: { user: User }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveClinicServiceDto) {
    return this.services.update(req.user, id, dto);
  }
}
