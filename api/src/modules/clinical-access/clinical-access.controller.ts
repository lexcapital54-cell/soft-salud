import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { ClinicalAccessService } from './clinical-access.service';

type AuthedRequest = Request & { user: User };

@Controller('clinical-access')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.ADMIN,
  UserRole.HEALTH_PROFESSIONAL,
  UserRole.RECEPTIONIST,
  UserRole.AUDITOR,
  UserRole.AUXILIAR,
)
export class ClinicalAccessController {
  constructor(private readonly access: ClinicalAccessService) {}

  /** Estado de acceso a HCE según tipo de plan y reserva activa. */
  @Get('check')
  check(@Req() req: AuthedRequest) {
    return this.access.checkAccess(req.user);
  }
}
