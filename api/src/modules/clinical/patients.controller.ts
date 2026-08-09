import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import {
  CreatePatientDto,
  QuickPatientDto,
  UpdatePatientDto,
} from './dto/patient.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.RECEPTIONIST,
    UserRole.AUDITOR,
  )
  list(
    @Req() req: { user: User },
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.patientsService.list(req.user, q, { from, to });
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.RECEPTIONIST,
    UserRole.AUDITOR,
  )
  getOne(@Req() req: { user: User }, @Param('id') id: string) {
    return this.patientsService.getForClinic(req.user, id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST)
  create(@Req() req: { user: User }, @Body() dto: CreatePatientDto) {
    return this.patientsService.create(req.user, dto);
  }

  @Post('quick')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST)
  quickCreate(@Req() req: { user: User }, @Body() dto: QuickPatientDto) {
    return this.patientsService.quickCreate(req.user, dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST)
  update(
    @Req() req: { user: User },
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(req.user, id, dto);
  }

  /**
   * Alias en POST. En los equipos del consultorio hay filtros de red que
   * descartan PATCH/PUT y la petición nunca sale del navegador, así que el
   * frontend actualiza por esta ruta.
   */
  @Post(':id/update')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST)
  updateViaPost(
    @Req() req: { user: User },
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(req.user, id, dto);
  }
}
