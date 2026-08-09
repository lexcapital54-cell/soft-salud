import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CatalogsService } from './catalogs.service';
import { DIVIPOLA } from './divipola.catalog';

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
  searchCie(@Query('q') q?: string) {
    return this.catalogsService.searchCie(q);
  }

  @Get('cups')
  searchCups(@Query('q') q?: string) {
    return this.catalogsService.searchCups(q);
  }
}
