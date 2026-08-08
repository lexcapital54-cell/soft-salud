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
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CLINIC_ADMIN)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  list(@Req() req: { user: User }, @Query('q') q?: string) {
    return this.patientsService.list(req.user, q);
  }

  @Get(':id')
  getOne(@Req() req: { user: User }, @Param('id') id: string) {
    return this.patientsService.getForClinic(req.user, id);
  }

  @Post()
  create(@Req() req: { user: User }, @Body() dto: CreatePatientDto) {
    return this.patientsService.create(req.user, dto);
  }

  @Patch(':id')
  update(
    @Req() req: { user: User },
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(req.user, id, dto);
  }
}
