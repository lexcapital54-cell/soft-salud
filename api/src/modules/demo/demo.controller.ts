import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ClinicSpecialty } from '@prisma/client';
import { IsBoolean, IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { DemoService } from './demo.service';

class CreateDemoDto {
  @IsEnum(ClinicSpecialty)
  specialty: ClinicSpecialty;
}

class DemoActiveDto {
  @IsBoolean()
  isActive: boolean;
}

/** Consultorios de demostración comercial; solo HABILISALUD. */
@Controller('admin/demos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class DemoController {
  constructor(private readonly demos: DemoService) {}

  @Get()
  list() {
    return this.demos.list();
  }

  @Post()
  create(@Body() dto: CreateDemoDto) {
    return this.demos.create(dto.specialty);
  }

  @Post(':id/active')
  setActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DemoActiveDto) {
    return this.demos.setActive(id, dto.isActive);
  }
}
