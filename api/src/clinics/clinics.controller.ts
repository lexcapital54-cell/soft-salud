import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../common/enums';
import { ClinicsService } from './clinics.service';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';

@Controller('clinics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  @Get()
  findAll() {
    return this.clinicsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clinicsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateClinicDto) {
    return this.clinicsService.create(dto);
  }

  @Post(':id/dashboard')
  createDashboard(@Param('id') id: string, @Body() dto: CreateDashboardDto) {
    return this.clinicsService.createDashboard(id, dto);
  }

  @Patch(':id/dashboard')
  updateDashboard(@Param('id') id: string, @Body() dto: CreateDashboardDto) {
    return this.clinicsService.updateDashboard(id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClinicDto) {
    return this.clinicsService.update(id, dto);
  }
}
