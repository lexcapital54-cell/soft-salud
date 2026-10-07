import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { RenderPsychReportDto, SavePsychReportDto } from './psych-report.dto';
import { PSYCH_SIGNATURE_MAX_BYTES, PsychReportService } from './psych-report.service';

type AuthedRequest = Request & { user: User };

const ctx = (req: AuthedRequest) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

/** Contenido clínico: solo el profesional y el administrador del consultorio. */
const ROLES = [UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL] as const;

/** Los datos viajan como texto JSON en `payload` y la firma (opcional) como archivo `signature`. */
const withSignature = () =>
  UseInterceptors(FileInterceptor('signature', { storage: memoryStorage(), limits: { fileSize: PSYCH_SIGNATURE_MAX_BYTES, fieldSize: 512 * 1024 } }));

@Controller('psych/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES)
export class PsychReportController {
  constructor(private readonly service: PsychReportService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query('patientId') patientId?: string) {
    return this.service.list(req.user, patientId || undefined);
  }

  @Get('patients')
  patients(@Req() req: AuthedRequest, @Query('q') q?: string) {
    return this.service.searchPatients(req.user, q);
  }

  @Get('prefill')
  prefill(@Req() req: AuthedRequest, @Query('patientId', new ParseUUIDPipe()) patientId: string) {
    return this.service.prefill(req.user, patientId);
  }

  @Get('blank')
  blank(@Req() req: AuthedRequest) {
    return this.service.blank(req.user);
  }

  @Get('my-signature')
  mySignature(@Req() req: AuthedRequest) {
    return this.service.mySignature(req.user);
  }

  @Post('pdf')
  @withSignature()
  async pdf(@Req() req: AuthedRequest, @Body('payload') payload: string, @UploadedFile() file?: Express.Multer.File) {
    const dto = await this.service.parsePayload(RenderPsychReportDto, payload);
    return this.service.pdf(req.user, dto, file, ctx(req));
  }

  @Get(':id')
  get(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(req.user, id);
  }

  @Get(':id/signature')
  signature(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.signature(req.user, id);
  }

  @Post()
  @withSignature()
  async create(@Req() req: AuthedRequest, @Body('payload') payload: string, @UploadedFile() file?: Express.Multer.File) {
    const dto = await this.service.parsePayload(SavePsychReportDto, payload);
    return this.service.create(req.user, dto, file, ctx(req));
  }

  @Post(':id/update')
  @withSignature()
  async update(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('payload') payload: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const dto = await this.service.parsePayload(SavePsychReportDto, payload);
    return this.service.update(req.user, id, dto, file, ctx(req));
  }
}
