import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ClinicSpecialty } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { DemoService } from './demo.service';

class CreateDemoDto {
  @IsEnum(ClinicSpecialty)
  specialty: ClinicSpecialty;
}

class DemoActiveDto {
  @IsBoolean()
  isActive: boolean;
}

class DemoDocumentsDto {
  /** false = solo la estructura de requisitos, sin archivos. */
  @IsOptional()
  @IsBoolean()
  files?: boolean;
}

/** Consultorios de demostración comercial: HABILISALUD los gestiona; el equipo comercial solo los consulta. */
@Controller('admin/demos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class DemoController {
  constructor(private readonly demos: DemoService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMMERCIAL)
  list(@Req() req: { user: User }) {
    return this.demos.list(req.user.role === UserRole.COMMERCIAL);
  }

  @Post()
  create(@Body() dto: CreateDemoDto) {
    return this.demos.create(dto.specialty);
  }

  @Post(':id/documents')
  loadDocuments(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DemoDocumentsDto) {
    return this.demos.loadDocuments(id, { files: dto.files });
  }

  @Post(':id/active')
  setActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DemoActiveDto) {
    return this.demos.setActive(id, dto.isActive);
  }
}
