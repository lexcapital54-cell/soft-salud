import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CatalogsService } from './catalogs.service';

@Controller('catalogs')
@UseGuards(JwtAuthGuard)
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  @Get('cie')
  searchCie(@Query('q') q?: string) {
    return this.catalogsService.searchCie(q);
  }

  @Get('cups')
  searchCups(@Query('q') q?: string) {
    return this.catalogsService.searchCups(q);
  }
}
