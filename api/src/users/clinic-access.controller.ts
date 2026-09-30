import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../common/enums';
import { User } from './user.entity';
import { ClinicAccessService } from './clinic-access.service';
import {
  GrantSelfClinicDto,
  SetUserClinicAccessDto,
  SwitchClinicDto,
} from './dto/clinic-access.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClinicAccessController {
  constructor(private readonly clinicAccess: ClinicAccessService) {}

  /** Sedes disponibles para el usuario autenticado. */
  @Get('auth/clinics')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.RECEPTIONIST, UserRole.AUXILIAR,
    UserRole.AUDITOR,
    UserRole.SUPER_ADMIN,
  )
  listMine(@Req() req: { user: User }) {
    return this.clinicAccess.listAccessibleClinics(req.user);
  }

  /** Cambia la sede activa (actualiza clinicId + JWT). */
  @Post('auth/switch-clinic')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.RECEPTIONIST, UserRole.AUXILIAR,
    UserRole.AUDITOR,
    UserRole.SUPER_ADMIN,
  )
  switchClinic(@Req() req: { user: User }, @Body() dto: SwitchClinicDto) {
    return this.clinicAccess.switchClinic(req.user, dto.clinicId);
  }

  /** Catálogo de sedes activas para vincular (admin / superadmin). */
  @Get('clinic-access/directory')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  directory() {
    return this.clinicAccess.listDirectory();
  }

  /** Sedes que el admin puede asignar a su personal. */
  @Get('clinic-access/grantable')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  grantable(@Req() req: { user: User }) {
    return this.clinicAccess.listGrantableClinics(req.user);
  }

  /** Personal de la sede actual. */
  @Get('clinic-access/staff')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  staff(@Req() req: { user: User }) {
    return this.clinicAccess.listStaff(req.user);
  }

  @Get('clinic-access/users/:userId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  userAccess(
    @Req() req: { user: User },
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.clinicAccess.getUserAccess(req.user, userId);
  }

  @Put('clinic-access/users/:userId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  setUserAccess(
    @Req() req: { user: User },
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SetUserClinicAccessDto,
  ) {
    return this.clinicAccess.setUserAccess(req.user, userId, dto.clinicIds);
  }

  /**
   * Vincula otra sede al admin actual para poder asignarla a asistentes.
   * (p. ej. segunda ubicación del mismo prestador)
   */
  @Post('clinic-access/self')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  grantSelf(@Req() req: { user: User }, @Body() dto: GrantSelfClinicDto) {
    return this.clinicAccess.grantSelfAccess(req.user, dto.clinicId);
  }
}
