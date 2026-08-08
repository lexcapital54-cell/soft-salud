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
import { ConsentsService } from './consents.service';
import { CreatePatientConsentDto } from './dto/consent.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CLINIC_ADMIN)
export class ConsentsController {
  constructor(private readonly consentsService: ConsentsService) {}

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
    const { buffer, filename, contentHash } =
      await this.consentsService.getPdfBuffer(req.user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-Content-Hash': contentHash || '',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(buffer);
  }

  @Post('patient-consents')
  sign(
    @Req() req: Request & { user: User },
    @Body() dto: CreatePatientConsentDto,
  ) {
    const forwarded = req.headers['x-forwarded-for'];
    const ipFromHeader = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(',')[0]?.trim();
    return this.consentsService.sign(req.user, dto, {
      ipAddress: ipFromHeader || req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
  }
}
