import { Module } from '@nestjs/common';
import { HourlyBookingsController } from './hourly-bookings.controller';
import { HourlyBookingsService } from './hourly-bookings.service';

@Module({
  controllers: [HourlyBookingsController],
  providers: [HourlyBookingsService],
  exports: [HourlyBookingsService],
})
export class HourlyBookingsModule {}
