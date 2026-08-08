import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../common/enums';
import { CreateClinicAdminDto } from './dto/create-clinic-admin.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listClinicAdmins() {
    return this.usersService.listClinicAdmins();
  }

  @Post('clinic-admins')
  createClinicAdmin(@Body() dto: CreateClinicAdminDto) {
    return this.usersService.createClinicAdmin(dto);
  }
}
