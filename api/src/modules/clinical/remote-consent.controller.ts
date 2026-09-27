import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import {
  PublicRemoteSignDto,
  SendRemoteConsentInviteDto,
} from './dto/consent.dto';
import { RemoteConsentService } from './remote-consent.service';

@Controller()
export class RemoteConsentController {
  constructor(private readonly remoteConsent: RemoteConsentService) {}

  /** Profesional: genera enlace de firma remota (WhatsApp / copia). */
  @Post('patient-consents/remote-invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  sendInvite(
    @Req() req: { user: User },
    @Body() dto: SendRemoteConsentInviteDto,
  ) {
    return this.remoteConsent.sendInvite(req.user, dto);
  }

  /** Profesional: estado de una invitación (para reflejar firma en la HC). */
  @Get('patient-consents/remote-invite/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  getInviteStatus(
    @Req() req: { user: User },
    @Param('id') id: string,
  ) {
    return this.remoteConsent.getInviteStatus(req.user, id);
  }

  /** Público: datos del consentimiento a firmar. */
  @Get('public/remote-consent/:token')
  getPublic(@Param('token') token: string) {
    return this.remoteConsent.getPublicInvite(token);
  }

  /** Público: registrar firma y sellar PDF. */
  @Post('public/remote-consent/:token/sign')
  signPublic(
    @Param('token') token: string,
    @Body() dto: PublicRemoteSignDto,
    @Req() req: Request,
  ) {
    const forwarded = req.headers['x-forwarded-for'];
    const ipFromHeader = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(',')[0]?.trim();
    return this.remoteConsent.signPublic(token, dto, {
      ipAddress: ipFromHeader || req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
  }
}
