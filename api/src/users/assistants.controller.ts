import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../common/enums';
import { User } from './user.entity';
import { UsersService } from './users.service';

class CreateAssistantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @IsEmail()
  email!: string;

  @Matches(/^\d{4}$/, { message: 'La clave del asistente debe ser de 4 dígitos.' })
  password!: string;
}

class AssistantPinDto {
  @Matches(/^\d{4}$/, { message: 'La clave del asistente debe ser de 4 dígitos.' })
  password!: string;
}

class AssistantActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

/** Asistente administrativo: lo crean el administrador y los profesionales de su consultorio. */
@Controller('me/assistants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
export class AssistantsController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Req() req: { user: User }) {
    return this.users.listAssistants(req.user);
  }

  @Post()
  create(@Req() req: { user: User }, @Body() dto: CreateAssistantDto) {
    return this.users.createAssistant(req.user, dto);
  }

  @Post(':id/active')
  setActive(
    @Req() req: { user: User },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssistantActiveDto,
  ) {
    return this.users.setAssistantActive(req.user, id, dto.isActive);
  }

  /** Solo el administrador del consultorio cambia o restablece la clave (p. ej. por pérdida). */
  @Post(':id/password')
  @Roles(UserRole.ADMIN)
  setPin(
    @Req() req: { user: User },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssistantPinDto,
  ) {
    return this.users.setAssistantPin(req.user, id, dto.password);
  }
}
