import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
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
import { PlatformReceiptArchiveService } from './platform-receipt-archive.service';

/** Carpeta «Recibos HabiliSALUD» del consultorio (copias de los cobros pagados). */
@Controller('me/platform-receipts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ClinicReceiptsController {
  constructor(private readonly archive: PlatformReceiptArchiveService) {}

  @Get()
  list(@Req() req: { user: User }) {
    return this.archive.listForClinic(this.clinicOf(req.user));
  }

  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async pdf(
    @Req() req: { user: User },
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.archive.readForClinic(this.clinicOf(req.user), id);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  private clinicOf(user: User) {
    if (!user.clinicId) throw new BadRequestException('Su usuario no tiene consultorio asignado.');
    return user.clinicId;
  }
}
