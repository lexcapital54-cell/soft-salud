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
  UpdateHourlyBookingDto,
  UpsertClinicRoomDto,
} from './dto/hourly-bookings.dto';
import { HourlyBookingsService } from './hourly-bookings.service';

type AuthedRequest = Request & { user: User };

const ADMINS = [UserRole.ADMIN, UserRole.SUPER_ADMIN] as const;

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMINS)
export class HourlyBookingsController {
  constructor(private readonly service: HourlyBookingsService) {}

  @Get('clinic-rooms')
  listRooms(@Req() req: AuthedRequest, @Query('clinicId') clinicId?: string) {
    return this.service.listRooms(req.user, clinicId);
  }

  @Post('clinic-rooms')
  createRoom(
    @Req() req: AuthedRequest,
    @Body() dto: UpsertClinicRoomDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.service.createRoom(req.user, dto, clinicId);
  }

  @Put('clinic-rooms/:id')
  updateRoom(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertClinicRoomDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.service.updateRoom(req.user, id, dto, clinicId);
  }

  @Patch('clinic-rooms/:id/active')
  setRoomActive(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { isActive: boolean },
    @Query('clinicId') clinicId?: string,
  ) {
    return this.service.setRoomActive(req.user, id, !!body.isActive, clinicId);
  }

  @Get('hourly-professionals')
  listHourlyProfessionals(@Req() req: AuthedRequest, @Query('clinicId') clinicId?: string) {
    return this.service.listHourlyProfessionals(req.user, clinicId);
  }

  @Get('hourly-bookings')
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
  createBooking(
    @Req() req: AuthedRequest,
    @Body() dto: CreateHourlyBookingDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.service.createBooking(req.user, dto, clinicId);
  }

  @Patch('hourly-bookings/:id')
  updateBooking(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHourlyBookingDto,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.service.updateBooking(req.user, id, dto, clinicId);
  }
}
