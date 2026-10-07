import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { CLINIC_LOGO_MAX_BYTES } from '../../clinics/clinic-logos.service';
import { RenderAttendanceControlDto, SaveAttendanceControlDto } from './attendance-control.dto';
import { AttendanceControlService } from './attendance-control.service';

type AuthedRequest = Request & { user: User };

const ctx = (req: AuthedRequest) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

/** Formato administrativo: lo diligencia también la recepción; el auditor solo consulta. */
const READ_ROLES = [UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST, UserRole.AUDITOR] as const;
const WRITE_ROLES = [UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST] as const;
const LOGO_ROLES = [UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL] as const;

@Controller('psych/attendance-controls')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceControlController {
  constructor(private readonly service: AttendanceControlService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(@Req() req: AuthedRequest, @Query('patientId') patientId?: string) {
    return this.service.list(req.user, patientId || undefined);
  }

  @Get('patients')
  @Roles(...WRITE_ROLES)
  patients(@Req() req: AuthedRequest, @Query('q') q?: string) {
    return this.service.searchPatients(req.user, q);
  }

  @Get('prefill')
  @Roles(...WRITE_ROLES)
  prefill(@Req() req: AuthedRequest, @Query('patientId', new ParseUUIDPipe()) patientId: string) {
    return this.service.prefill(req.user, patientId);
  }

  @Get('blank')
  @Roles(...WRITE_ROLES)
  blank(@Req() req: AuthedRequest) {
    return this.service.blank(req.user);
  }

  @Get('logo')
  @Roles(...READ_ROLES)
  logo(@Req() req: AuthedRequest) {
    return this.service.logoStatus(req.user);
  }

  @Post('logo')
  @Roles(...LOGO_ROLES)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: CLINIC_LOGO_MAX_BYTES } }))
  uploadLogo(@Req() req: AuthedRequest, @UploadedFile() file: Express.Multer.File) {
    return this.service.saveLogo(req.user, file, ctx(req));
  }

  @Delete('logo')
  @Roles(...LOGO_ROLES)
  removeLogo(@Req() req: AuthedRequest) {
    return this.service.removeLogo(req.user, ctx(req));
  }

  @Post('pdf')
  @Roles(...READ_ROLES)
  pdf(@Req() req: AuthedRequest, @Body() dto: RenderAttendanceControlDto) {
    return this.service.pdf(req.user, dto.data, ctx(req));
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  get(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(req.user, id);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Req() req: AuthedRequest, @Body() dto: SaveAttendanceControlDto) {
    return this.service.create(req.user, dto, ctx(req));
  }

  @Post(':id/update')
  @Roles(...WRITE_ROLES)
  update(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SaveAttendanceControlDto) {
    return this.service.update(req.user, id, dto, ctx(req));
  }
}
