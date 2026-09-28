import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { User } from '../../users/user.entity';
import { CatalogsService } from './catalogs.service';
import { DIVIPOLA } from './divipola.catalog';

type AuthedRequest = Request & { user: User };

@Controller('catalogs')
@UseGuards(JwtAuthGuard)
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  /** Departamentos y municipios de Colombia (DANE) para los selectores. */
  @Get('divipola')
  divipola() {
    return DIVIPOLA;
  }

  @Get('cie')
  searchCie(@Req() req: AuthedRequest, @Query('q') q?: string, @Query('scope') scope?: string) {
    const specialty =
      req.user?.clinic?.specialty ||
      (req.user as User & { specialty?: string })?.specialty ||
      null;
    return this.catalogsService.searchCie(q, 300, specialty, scope);
  }

  @Get('ortho-control-procedures')
  orthoControlProcedures() {
    return this.catalogsService.orthoControlProcedures();
  }

  @Get('cups')
  searchCups(@Req() req: AuthedRequest, @Query('q') q?: string, @Query('scope') scope?: string) {
    const specialty =
      req.user?.clinic?.specialty ||
      (req.user as User & { specialty?: string })?.specialty ||
      null;
    return this.catalogsService.searchCups(q, 300, specialty, scope);
  }
}
