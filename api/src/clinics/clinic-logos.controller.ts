import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../common/enums';
import { User } from '../users/user.entity';
import { CLINIC_LOGO_MAX_BYTES, ClinicLogosService, logoKind } from './clinic-logos.service';

@Controller()
export class ClinicLogosController {
  constructor(private readonly logos: ClinicLogosService) {}

  /** Público: las etiquetas <img> no envían el token. Un logo no contiene datos clínicos. */
  @Get('public/clinic-logo/:clinicId/:slot')
  async image(
    @Param('clinicId', new ParseUUIDPipe()) clinicId: string,
    @Param('slot') slot: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const row = await this.logos.find(clinicId, logoKind(slot));
    if (!row) throw new NotFoundException('El consultorio no tiene logo.');
    const etag = `"${row.kind}-${row.updatedAt.getTime()}"`;
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', row.mimeType);
    res.end(Buffer.from(row.data));
  }

  @Get('me/clinic-logos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  status(@Req() req: { user: User }) {
    return this.logos.status(this.clinicOf(req.user));
  }

  @Post('me/clinic-logos/:slot')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: CLINIC_LOGO_MAX_BYTES },
    }),
  )
  upload(
    @Req() req: { user: User },
    @Param('slot') slot: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.logos.save(this.clinicOf(req.user), logoKind(slot), file);
  }

  @Delete('me/clinic-logos/:slot')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Req() req: { user: User }, @Param('slot') slot: string) {
    return this.logos.remove(this.clinicOf(req.user), logoKind(slot));
  }

  @Get('clinics/:clinicId/logos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  statusFor(@Param('clinicId', new ParseUUIDPipe()) clinicId: string) {
    return this.logos.status(clinicId);
  }

  @Post('clinics/:clinicId/logos/:slot')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: CLINIC_LOGO_MAX_BYTES },
    }),
  )
  uploadFor(
    @Param('clinicId', new ParseUUIDPipe()) clinicId: string,
    @Param('slot') slot: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.logos.save(clinicId, logoKind(slot), file);
  }

  @Delete('clinics/:clinicId/logos/:slot')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  removeFor(
    @Param('clinicId', new ParseUUIDPipe()) clinicId: string,
    @Param('slot') slot: string,
  ) {
    return this.logos.remove(clinicId, logoKind(slot));
  }

  private clinicOf(user: User) {
    if (!user.clinicId) throw new BadRequestException('Su usuario no tiene consultorio asignado.');
    return user.clinicId;
  }
}
