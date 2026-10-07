import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { HabilitationRegistryService } from './habilitation-registry.service';
import {
  CreateDocumentCategoryDto,
  CreateHabilitationDocumentDto,
  SetArchivedDto,
  UpdateDocumentCategoryDto,
  UpdateHabilitationDocumentDto,
} from './dto/habilitation.dto';

type AuthedRequest = Request & { user: User };

function ctx(req: AuthedRequest) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

/** Mismos roles de lectura que el expediente documental. */
const READ_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUDITOR] as const;
/** El servicio limita además a los pilares que el consultorio puede gestionar. */
const WRITE_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL] as const;

@Controller('documents/registry')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HabilitationRegistryController {
  constructor(private readonly registry: HabilitationRegistryService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(@Req() req: AuthedRequest, @Query('clinicId') clinicId?: string) {
    return this.registry.registry(req.user, clinicId);
  }

  @Get('activity')
  @Roles(...READ_ROLES)
  activity(
    @Req() req: AuthedRequest,
    @Query('clinicId') clinicId?: string,
    @Query('requirementId') requirementId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.registry.activity(req.user, clinicId, requirementId, limit);
  }

  @Get('master-list.xlsx')
  @Roles(...READ_ROLES)
  masterXlsx(@Req() req: AuthedRequest, @Query('clinicId') clinicId?: string, @Query('archived') archived?: string) {
    return this.registry.exportMasterList(req.user, 'xlsx', clinicId, archived === 'true');
  }

  @Get('master-list.pdf')
  @Roles(...READ_ROLES)
  masterPdf(@Req() req: AuthedRequest, @Query('clinicId') clinicId?: string, @Query('archived') archived?: string) {
    return this.registry.exportMasterList(req.user, 'pdf', clinicId, archived === 'true');
  }

  @Post('documents')
  @Roles(UserRole.SUPER_ADMIN)
  create(@Req() req: AuthedRequest, @Body() dto: CreateHabilitationDocumentDto, @Query('clinicId') clinicId?: string) {
    return this.registry.createDocument(req.user, dto, ctx(req), clinicId);
  }

  @Post('documents/:id/update')
  @Roles(...WRITE_ROLES)
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateHabilitationDocumentDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.registry.updateDocument(req.user, id, dto, ctx(req), clinicId);
  }

  @Post('documents/:id/archive')
  @Roles(...WRITE_ROLES)
  archive(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: SetArchivedDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.registry.setArchived(req.user, id, dto.archived, ctx(req), clinicId);
  }

  @Get('categories')
  @Roles(UserRole.SUPER_ADMIN)
  categories(@Req() req: AuthedRequest) {
    return this.registry.listCategories(req.user);
  }

  @Post('categories')
  @Roles(UserRole.SUPER_ADMIN)
  createCategory(@Req() req: AuthedRequest, @Body() dto: CreateDocumentCategoryDto) {
    return this.registry.createCategory(req.user, dto);
  }

  @Post('categories/:id/update')
  @Roles(UserRole.SUPER_ADMIN)
  updateCategory(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: UpdateDocumentCategoryDto) {
    return this.registry.updateCategory(req.user, id, dto);
  }
}
