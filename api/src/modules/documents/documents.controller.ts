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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
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
  SetRequirementClinicSignatureDto,
  SetRequirementEnabledDto,
  SignDocumentDto,
  UpdateDocumentMetaDto,
  UploadDocumentMetaDto,
  CreateDocumentRequirementDto,
  ReplicateDocumentsDto,
  AssignDocumentRequirementsDto,
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

  /** Perfil de aprobación del consultorio (Aprobó = profesional de ese consultorio). */
  @Get('brand')
  @Roles(...READ_ROLES)
  brand(@Req() req: AuthedRequest, @Query('clinicId') clinicId?: string) {
    return this.documentsService.getClinicBrand(req.user, clinicId);
  }

  /** Re-sella PDFs del consultorio con el profesional correcto (sin mezclar). */
  @Post('rebrand')
  @Roles(UserRole.SUPER_ADMIN)
  rebrand(@Req() req: AuthedRequest, @Query('clinicId') clinicId?: string) {
    return this.documentsService.rebrandClinicPdfs(req.user, clinicId);
  }

  @Get('categories')
  @Roles(UserRole.SUPER_ADMIN)
  listCategories(@Req() req: AuthedRequest) {
    return this.documentsService.listCategories(req.user);
  }

  /** Catálogo de documentos disponibles para asignar a un consultorio. */
  @Get('catalog')
  @Roles(UserRole.SUPER_ADMIN)
  catalog(
    @Req() req: AuthedRequest,
    @Query('clinicId') clinicId?: string,
    @Query('sourceClinicId') sourceClinicId?: string,
  ) {
    return this.documentsService.getAssignmentCatalog(
      req.user,
      clinicId,
      sourceClinicId,
    );
  }

  @Post('requirements')
  @Roles(UserRole.SUPER_ADMIN)
  createRequirement(
    @Req() req: AuthedRequest,
    @Body() dto: CreateDocumentRequirementDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.createRequirement(req.user, dto, clinicId);
  }

  /** Asigna (crea/habilita) los documentos seleccionados al consultorio. */
  @Post('requirements/assign')
  @Roles(UserRole.SUPER_ADMIN)
  assignRequirements(
    @Req() req: AuthedRequest,
    @Body() dto: AssignDocumentRequirementsDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.assignRequirements(req.user, dto, clinicId);
  }

  @Post('clear')
  @Roles(UserRole.SUPER_ADMIN)
  clearClinic(
    @Req() req: AuthedRequest,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.clearClinicDocuments(req.user, clinicId);
  }

  @Post('replicate')
  @Roles(UserRole.SUPER_ADMIN)
  replicate(@Req() req: AuthedRequest, @Body() dto: ReplicateDocumentsDto) {
    return this.documentsService.replicateDocuments(req.user, dto);
  }

  /**
   * Sube carpeta maestra (subcarpetas + archivos) o un ZIP al expediente.
   * Independiente de «Replicar a misma especialidad».
   */
  @Post('import-master-pack')
  @Roles(UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'files', maxCount: 500 },
        { name: 'zip', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 200 * 1024 * 1024, files: 500 },
      },
    ),
  )
  importMasterPack(
    @Req() req: AuthedRequest,
    @UploadedFiles()
    uploaded: {
      files?: Express.Multer.File[];
      zip?: Express.Multer.File[];
    },
    @Body()
    body: {
      relativePaths?: string | string[];
      ensureStructure?: string | boolean;
    },
    @Query('clinicId') clinicId?: string,
  ) {
    let relativePaths: string[] = [];
    const raw = body?.relativePaths;
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          relativePaths = parsed.map((p) => String(p));
        } else {
          relativePaths = [raw];
        }
      } catch {
        relativePaths = raw.split('\n').map((p) => p.trim()).filter(Boolean);
      }
    } else if (Array.isArray(raw)) {
      relativePaths = raw.map((p) => String(p));
    }

    const ensureStructure =
      body?.ensureStructure === undefined ||
      body?.ensureStructure === true ||
      body?.ensureStructure === 'true' ||
      body?.ensureStructure === '1';

    return this.documentsService.importMasterPack(req.user, clinicId, {
      files: uploaded?.files ?? [],
      relativePaths,
      zip: uploaded?.zip?.[0] ?? null,
      ensureStructure,
    });
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

  @Post('requirements/:id/clinic-signature')
  @Roles(UserRole.SUPER_ADMIN)
  setClinicSignature(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: SetRequirementClinicSignatureDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.setRequirementClinicSignature(
      req.user,
      id,
      dto.requiresClinicSignature,
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
  /** Multipart: no usar forbidNonWhitelisted (rompe el campo file / metadatos). */
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  upload(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadDocumentMetaDto,
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
        issuedAt: body.issuedAt || undefined,
        changeReason: body.changeReason || undefined,
      },
      requestContext(req),
      clinicId,
    );
  }

  @Post('requirements/:id/fill-sgsst')
  @Roles(UserRole.SUPER_ADMIN)
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
  @Roles(UserRole.SUPER_ADMIN)
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

  /** Superadmin: original. Consultorio: PDF con marca de agua de quien descarga. */
  @Get('files/:id/download')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
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

  /** Eliminación definitiva del archivo (y firmas). */
  @Delete('files/:id/permanent')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  deletePermanent(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.deleteFilePermanent(
      req.user,
      id,
      requestContext(req),
      clinicId,
    );
  }

  @Post('files/:id/delete-permanent')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  deletePermanentViaPost(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.documentsService.deleteFilePermanent(
      req.user,
      id,
      requestContext(req),
      clinicId,
    );
  }
}
