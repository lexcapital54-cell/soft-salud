import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { AestheticTrackingService } from './aesthetic-tracking.service';
import { AestheticPhotoReportService } from './aesthetic-photo-report.service';

export class SaveAestheticTrackingDto {
  @IsObject()
  data!: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class PhotoReportQueryDto {
  @IsOptional()
  @IsIn(['FRONTAL', 'OBLICUA_DER', 'PERFIL_DER', 'OBLICUA_IZQ', 'PERFIL_IZQ', 'DETALLE'])
  angle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  before?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  after?: string;
}

@Controller('patients/:patientId/aesthetic-tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AestheticTrackingController {
  constructor(
    private readonly tracking: AestheticTrackingService,
    private readonly photoReport: AestheticPhotoReportService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUXILIAR)
  get(@Req() req: { user: User }, @Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.tracking.get(req.user, patientId);
  }

  @Put()
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  save(
    @Req() req: { user: User },
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: SaveAestheticTrackingDto,
  ) {
    return this.tracking.save(req.user, patientId, dto);
  }

  /** Informe fotográfico en PDF (todas las fotos o un ángulo, con comparativo opcional). */
  @Get('photo-report')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  async photoReportPdf(
    @Req() req: { user: User },
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: PhotoReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, fileName } = await this.photoReport.build(req.user, patientId, query);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    return new StreamableFile(buffer);
  }
}
