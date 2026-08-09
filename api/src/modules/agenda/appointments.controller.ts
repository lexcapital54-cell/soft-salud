import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  RegisterAdmissionDto,
  TodayAppointmentsQueryDto,
  UpdateAppointmentDto,
  UpdateAppointmentStatusDto,
} from './dto/appointment.dto';

type AuthedRequest = Request & { user: User };

function requestContext(req: AuthedRequest) {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get('today')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.RECEPTIONIST,
    UserRole.AUDITOR,
  )
  listToday(
    @Req() req: AuthedRequest,
    @Query() query: TodayAppointmentsQueryDto,
  ) {
    return this.appointmentsService.listToday(req.user, query);
  }

  @Get('professionals')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST)
  listProfessionals(@Req() req: AuthedRequest) {
    return this.appointmentsService.listProfessionals(req.user);
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.RECEPTIONIST,
    UserRole.AUDITOR,
  )
  getOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.appointmentsService.getOne(req.user, id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST)
  create(@Req() req: AuthedRequest, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(req.user, dto, requestContext(req));
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST)
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointmentsService.update(
      req.user,
      id,
      dto,
      requestContext(req),
    );
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST)
  updateStatus(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentsService.updateStatus(
      req.user,
      id,
      dto,
      requestContext(req),
    );
  }

  /**
   * Mismo cambio de estado por POST: hay proxies y antivirus corporativos que
   * descartan el verbo PATCH y el navegador nunca llega a enviar la petición.
   */
  @Post(':id/status')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST)
  updateStatusByPost(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.updateStatus(req, id, dto);
  }

  @Post(':id/admission')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST)
  registerAdmission(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: RegisterAdmissionDto,
  ) {
    return this.appointmentsService.registerAdmission(
      req.user,
      id,
      dto,
      requestContext(req),
    );
  }
}
