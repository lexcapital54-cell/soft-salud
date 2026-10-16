import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import {
  CreateHourlyBookingDto,
  CreateHourlyProfessionalDto,
  UpdateHourlyBookingDto,
  UpdateHourlyRentalSettingsDto,
  UpsertClinicRoomDto,
} from './dto/hourly-bookings.dto';
import { HourlyBookingsService } from './hourly-bookings.service';

type AuthedRequest = Request & { user: User };

const SCHEDULERS = [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN] as const;
const ADMINS = [UserRole.ADMIN, UserRole.SUPER_ADMIN] as const;

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class HourlyBookingsController {
  constructor(private readonly service: HourlyBookingsService) {}

  @Get('hourly-rental-settings')
  @Roles(...SCHEDULERS)
  getSettings(@Req() req: AuthedRequest, @Query('clinicId') clinicId?: string) {
    return this.service.getSettings(req.user, clinicId);
  }

  @Put('hourly-rental-settings')
  @Roles(...ADMINS)
  updateSettings(
    @Req() req: AuthedRequest,
    @Body() dto: UpdateHourlyRentalSettingsDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.service.updateSettings(req.user, dto, clinicId);
  }

  @Get('clinic-rooms')
  @Roles(...SCHEDULERS)
  listRooms(@Req() req: AuthedRequest, @Query('clinicId') clinicId?: string) {
    return this.service.listRooms(req.user, clinicId);
  }

  @Post('clinic-rooms')
  @Roles(...ADMINS)
  createRoom(
    @Req() req: AuthedRequest,
    @Body() dto: UpsertClinicRoomDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.service.createRoom(req.user, dto, clinicId);
  }

  @Put('clinic-rooms/:id')
  @Roles(...ADMINS)
  updateRoom(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertClinicRoomDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.service.updateRoom(req.user, id, dto, clinicId);
  }

  @Patch('clinic-rooms/:id/active')
  @Roles(...ADMINS)
  setRoomActive(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { isActive: boolean },
    @Query('clinicId') clinicId?: string,
  ) {
    return this.service.setRoomActive(req.user, id, !!body.isActive, clinicId);
  }

  @Get('hourly-professionals')
  @Roles(...SCHEDULERS)
  listHourlyProfessionals(
    @Req() req: AuthedRequest,
    @Query('clinicId') clinicId?: string,
    @Query('month') month?: string,
  ) {
    return this.service.listHourlyProfessionals(req.user, clinicId, month);
  }

  /** Alta rápida al agendar: profesional con plan de arriendo por horas. */
  @Post('hourly-professionals')
  @Roles(...SCHEDULERS)
  createHourlyProfessional(
    @Req() req: AuthedRequest,
    @Body() dto: CreateHourlyProfessionalDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.service.createHourlyProfessional(req.user, dto, clinicId);
  }

  @Get('hourly-bookings')
  @Roles(...SCHEDULERS)
  listBookings(
    @Req() req: AuthedRequest,
    @Query('clinicId') clinicId?: string,
    @Query('professionalId') professionalId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listBookings(req.user, { clinicId, professionalId, from, to });
  }

  @Post('hourly-bookings')
  @Roles(...SCHEDULERS)
  createBooking(
    @Req() req: AuthedRequest,
    @Body() dto: CreateHourlyBookingDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.service.createBooking(req.user, dto, clinicId);
  }

  @Patch('hourly-bookings/:id')
  @Roles(...SCHEDULERS)
  updateBooking(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHourlyBookingDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.service.updateBooking(req.user, id, dto, clinicId);
  }
}
