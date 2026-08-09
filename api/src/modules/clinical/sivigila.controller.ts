import {
  Controller,
  Get,
  Header,
  OnModuleInit,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { SivigilaQueryDto } from './dto/sivigila.dto';
import { SivigilaService } from './sivigila.service';

@Controller('audit/sivigila')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.AUDITOR, UserRole.HEALTH_PROFESSIONAL)
export class SivigilaController implements OnModuleInit {
  constructor(private readonly sivigilaService: SivigilaService) {}

  async onModuleInit() {
    try {
      await this.sivigilaService.ensureSampleNotifiableCodes();
    } catch {
      // DB puede no estar lista en build; se ignora
    }
  }

  @Get('cases')
  listCases(@Req() req: { user: User }, @Query() query: SivigilaQueryDto) {
    return this.sivigilaService.listCases(req.user, query);
  }

  @Get('summary')
  summary(@Req() req: { user: User }, @Query() query: SivigilaQueryDto) {
    return this.sivigilaService.summary(req.user, query);
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Req() req: { user: User },
    @Query() query: SivigilaQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buf = await this.sivigilaService.exportCsv(req.user, query);
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="sivigila-casos.csv"',
    );
    return new StreamableFile(buf);
  }

  @Get('export.xlsx')
  async exportExcel(
    @Req() req: { user: User },
    @Query() query: SivigilaQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buf = await this.sivigilaService.exportExcel(req.user, query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="sivigila-casos.xlsx"',
    );
    return new StreamableFile(buf);
  }
}
