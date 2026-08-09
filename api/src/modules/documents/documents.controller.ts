import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentPillar } from '@prisma/client';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { DocumentsService } from './documents.service';
import { SignDocumentDto, UpdateDocumentMetaDto } from './dto/document.dto';
import { FillSgsstDto } from './dto/fill-sgsst.dto';
import { FillTrainingActaDto } from './dto/fill-training-acta.dto';

type AuthedRequest = Request & { user: User };

function requestContext(req: AuthedRequest) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('overview')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUDITOR)
  overview(@Req() req: AuthedRequest, @Query('pillar') pillar?: DocumentPillar) {
    return this.documentsService.overview(req.user, pillar);
  }

  /**
   * Histórico mensual de archivos firmados para auditoría
   * (ver / descargar por periodo YYYY-MM).
   */
  @Get('signed-archive')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUDITOR)
  signedArchive(
    @Req() req: AuthedRequest,
    @Query('period') period?: string,
  ) {
    return this.documentsService.signedArchive(req.user, period);
  }

  @Get('requirements/:id/files')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUDITOR)
  listFiles(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.documentsService.listFiles(req.user, id);
  }

  /** CREATE: siempre agrega una versión nueva; nunca sobrescribe. */
  @Post('requirements/:id/files')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  upload(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, string>,
  ) {
    return this.documentsService.upload(
      req.user,
      id,
      file,
      {
        expiresAt: body.expiresAt || undefined,
        periodLabel: body.periodLabel || undefined,
        notes: body.notes || undefined,
      },
      requestContext(req),
    );
  }

  /**
   * Diligencia cualquier documento SG-SST: llena campos y pega firmas imagen
   * bajo "Firma …". Crea una versión PDF nueva sin tocar el histórico.
   */
  @Post('requirements/:id/fill-sgsst')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  fillSgsst(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: FillSgsstDto,
  ) {
    return this.documentsService.fillSgsst(req.user, id, dto, requestContext(req));
  }

  /** Alias de actas de capacitación (Capacitador + Asistente). */
  @Post('requirements/:id/fill-training-acta')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  fillTrainingActa(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: FillTrainingActaDto,
  ) {
    return this.documentsService.fillTrainingActa(
      req.user,
      id,
      dto,
      requestContext(req),
    );
  }

  @Get('files/:id')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUDITOR)
  getFile(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.documentsService.getFile(req.user, id);
  }

  /** Ver en el navegador (inline), no forzar descarga. */
  @Get('files/:id/view')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUDITOR)
  view(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.documentsService.view(req.user, id, requestContext(req));
  }

  @Get('files/:id/preview-html')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUDITOR)
  previewHtml(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.documentsService.previewHtml(req.user, id, requestContext(req));
  }

  @Get('files/:id/download')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUDITOR)
  download(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.documentsService.download(req.user, id, requestContext(req));
  }

  @Post('files/:id/sign')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  sign(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: SignDocumentDto,
  ) {
    return this.documentsService.sign(req.user, id, dto, requestContext(req));
  }

  @Patch('files/:id')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  updateMeta(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentMetaDto,
  ) {
    return this.documentsService.updateMeta(req.user, id, dto, requestContext(req));
  }

  @Post('files/:id/update')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  updateMetaViaPost(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentMetaDto,
  ) {
    return this.documentsService.updateMeta(req.user, id, dto, requestContext(req));
  }

  /** DELETE lógico: marca RETIRED y conserva el archivo + firmas. */
  @Delete('files/:id')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  retire(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.documentsService.retire(req.user, id, requestContext(req));
  }

  @Post('files/:id/remove')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  retireViaPost(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.documentsService.retire(req.user, id, requestContext(req));
  }
}
