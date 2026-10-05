import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../common/enums';
import { CreateClinicAdminDto } from './dto/create-clinic-admin.dto';
import {
  CreateStaffUserDto,
  ResetUserPasswordDto,
  UpdateStaffUserDto,
} from './dto/create-staff-user.dto';
import { UsersService } from './users.service';
import { UpdateRepsSettingsDto } from '../modules/clinical/dto/clinical.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Compatibilidad: solo admins de consultorio. */
  @Get()
  listClinicAdmins() {
    return this.usersService.listClinicAdmins();
  }

  /** Lista staff (admin, profesional, recepción, auditor). */
  @Get('staff')
  listStaff(
    @Query('clinicId') clinicId?: string,
    @Query('role') role?: UserRole,
  ) {
    return this.usersService.listStaffUsers(clinicId, role);
  }

  @Post('clinic-admins')
  createClinicAdmin(@Body() dto: CreateClinicAdminDto) {
    return this.usersService.createClinicAdmin(dto);
  }

  @Post('staff')
  createStaff(@Body() dto: CreateStaffUserDto) {
    return this.usersService.createStaffUser(dto);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetUserPasswordDto) {
    return this.usersService.resetPassword(id, dto.password);
  }

  @Post(':id/reps')
  setReps(@Param('id') id: string, @Body() dto: UpdateRepsSettingsDto) {
    return this.usersService.setRepsExpiration(id, dto.repsExpirationDate);
  }

  @Patch(':id')
  updateStaff(@Param('id') id: string, @Body() dto: UpdateStaffUserDto) {
    return this.usersService.updateStaffUser(id, dto);
  }
}
