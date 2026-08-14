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
import {
  SetAllRequirementsEnabledDto,
  SetRequirementEnabledDto,
  SignDocumentDto,
  UpdateDocumentMetaDto,
} from './dto/document.dto';
import { FillSgsstDto } from './dto/fill-sgsst.dto';
import { FillTrainingActaDto } from './dto/fill-training-acta.dto';

type AuthedRequest = Request & { user: User };

function requestContext(req: AuthedRequest) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

/** Lectura: consultorio + superadmin. Escritura: solo superadmin. */
const READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.HEALTH_PROFESSIONAL,
  UserRole.AUDITOR,
] as const;

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('overview')
  @Roles(...READ_ROLES)
  overview(
    @Req() req: AuthedRequest,
    @Query('pillar') pillar?: DocumentPillar,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.overview(req.user, pillar, clinicId);
  }

  @Get('signed-archive')
  @Roles(...READ_ROLES)
  signedArchive(
    @Req() req: AuthedRequest,
    @Query('period') period?: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.signedArchive(req.user, period, clinicId);
  }

  @Post('requirements/enable-all')
  @Roles(UserRole.SUPER_ADMIN)
  enableAll(
    @Req() req: AuthedRequest,
    @Body() dto: SetAllRequirementsEnabledDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.setAllRequirementsEnabled(
      req.user,
      dto.enabled,
      clinicId,
    );
  }

  @Post('requirements/:id/enabled')
  @Roles(UserRole.SUPER_ADMIN)
  setEnabled(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: SetRequirementEnabledDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.setRequirementEnabled(
      req.user,
      id,
      dto.enabled,
      clinicId,
    );
  }

  @Get('requirements/:id/files')
  @Roles(...READ_ROLES)
  listFiles(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.listFiles(req.user, id, clinicId);
  }

  @Post('requirements/:id/files')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
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
    @Query('clinicId') clinicId?: string,
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
      clinicId,
    );
  }

  @Post('requirements/:id/fill-sgsst')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  fillSgsst(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: FillSgsstDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.fillSgsst(
      req.user,
      id,
      dto,
      requestContext(req),
      clinicId,
    );
  }

  @Post('requirements/:id/fill-training-acta')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  fillTrainingActa(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: FillTrainingActaDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.fillTrainingActa(
      req.user,
      id,
      dto,
      requestContext(req),
      clinicId,
    );
  }

  @Get('files/:id')
  @Roles(...READ_ROLES)
  getFile(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.getFile(req.user, id, clinicId);
  }

  @Get('files/:id/view')
  @Roles(...READ_ROLES)
  view(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.view(
      req.user,
      id,
      requestContext(req),
      clinicId,
    );
  }

  @Get('files/:id/preview-html')
  @Roles(...READ_ROLES)
  previewHtml(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.previewHtml(
      req.user,
      id,
      requestContext(req),
      clinicId,
    );
  }

  /** Descarga solo superadmin (evita sacar el archivo del consultorio). */
  @Get('files/:id/download')
  @Roles(UserRole.SUPER_ADMIN)
  download(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.download(
      req.user,
      id,
      requestContext(req),
      clinicId,
    );
  }

  @Post('files/:id/sign')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  sign(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: SignDocumentDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.sign(
      req.user,
      id,
      dto,
      requestContext(req),
      clinicId,
    );
  }

  @Patch('files/:id')
  @Roles(UserRole.SUPER_ADMIN)
  updateMeta(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentMetaDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.updateMeta(
      req.user,
      id,
      dto,
      requestContext(req),
      clinicId,
    );
  }

  @Post('files/:id/update')
  @Roles(UserRole.SUPER_ADMIN)
  updateMetaViaPost(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentMetaDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.updateMeta(
      req.user,
      id,
      dto,
      requestContext(req),
      clinicId,
    );
  }

  @Delete('files/:id')
  @Roles(UserRole.SUPER_ADMIN)
  retire(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.retire(
      req.user,
      id,
      requestContext(req),
      clinicId,
    );
  }

  @Post('files/:id/remove')
  @Roles(UserRole.SUPER_ADMIN)
  retireViaPost(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.retire(
      req.user,
      id,
      requestContext(req),
      clinicId,
    );
  }
}
