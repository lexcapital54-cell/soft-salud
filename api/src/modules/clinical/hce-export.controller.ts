import {
  Controller,
  Get,
  Param,
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
import { SearchHceExportQueryDto } from './dto/hce-export.dto';
import { HceExportService } from './hce-export.service';

@Controller('clinical-exports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HceExportController {
  constructor(private readonly exports: HceExportService) {}

  /** Buscar historias por nombre o documento (sin límite de mes). */
  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.RECEPTIONIST,
  )
  search(
    @Req() req: { user: User },
    @Query() query: SearchHceExportQueryDto,
  ) {
    return this.exports.search(req.user, query);
  }

  /** ZIP con todas las historias que coincidan (o todas del consultorio). */
  @Get('bulk/zip')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  async downloadBulkZip(
    @Req() req: { user: User },
    @Query() query: SearchHceExportQueryDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="historias-clinicas.zip"',
    );
    const stream = await this.exports.bulkZipStream(req.user, query);
    stream.pipe(res);
  }

  /** PDF individual con membrete del consultorio. */
  @Get(':encounterId/pdf')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  async downloadPdf(
    @Req() req: { user: User },
    @Param('encounterId') encounterId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, fileName } = await this.exports.pdfBuffer(req.user, encounterId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/"/g, '')}"`,
    );
    return new StreamableFile(buffer);
  }
}
