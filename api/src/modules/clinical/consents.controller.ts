import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { ConsentRevocationService } from './consent-revocation.service';
import { ConsentsService } from './consents.service';
import { CreatePatientConsentDto, RevokePatientConsentDto } from './dto/consent.dto';

function requestMeta(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  const ipFromHeader = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(',')[0]?.trim();
  return {
    ipAddress: ipFromHeader || req.ip || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
}

function sendPdf(
  res: Response,
  file: { buffer: Buffer; filename: string; contentHash: string | null },
) {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${file.filename}"`,
    'X-Content-Hash': file.contentHash || '',
    'Cache-Control': 'private, no-store',
  });
  return new StreamableFile(file.buffer);
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
export class ConsentsController {
  constructor(
    private readonly consentsService: ConsentsService,
    private readonly revocations: ConsentRevocationService,
  ) {}

  @Get('consent-templates')
  listTemplates(@Req() req: { user: User }) {
    return this.consentsService.listTemplates(req.user);
  }

  @Get('consent-templates/:id')
  getTemplate(@Req() req: { user: User }, @Param('id') id: string) {
    return this.consentsService.getTemplate(req.user, id);
  }

  @Get('patient-consents')
  listPatientConsents(
    @Req() req: { user: User },
    @Query('patientId') patientId?: string,
    @Query('encounterId') encounterId?: string,
  ) {
    return this.consentsService.listPatientConsents(req.user, {
      patientId,
      encounterId,
    });
  }

  @Get('patient-consents/:id/pdf')
  async downloadPdf(
    @Req() req: { user: User },
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sendPdf(res, await this.consentsService.getPdfBuffer(req.user, id));
  }

  @Get('patient-consents/:id/revocation-pdf')
  async downloadRevocationPdf(
    @Req() req: { user: User },
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sendPdf(res, await this.revocations.getRevocationPdf(req.user, id));
  }

  @Post('patient-consents')
  sign(
    @Req() req: Request & { user: User },
    @Body() dto: CreatePatientConsentDto,
  ) {
    return this.consentsService.sign(req.user, dto, requestMeta(req));
  }

  @Post('patient-consents/:id/revoke')
  revoke(
    @Req() req: Request & { user: User },
    @Param('id') id: string,
    @Body() dto: RevokePatientConsentDto,
  ) {
    return this.revocations.revoke(req.user, id, dto, requestMeta(req));
  }
}
