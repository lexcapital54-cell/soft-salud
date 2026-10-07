import { Module } from '@nestjs/common';
import { ClinicLogosService } from '../../clinics/clinic-logos.service';
import { AttendanceControlController } from './attendance-control.controller';
import { AttendanceControlService } from './attendance-control.service';

/** Formatos administrativos de los consultorios de psicología. */
@Module({
  controllers: [AttendanceControlController],
  providers: [AttendanceControlService, ClinicLogosService],
})
export class PsychAdminModule {}
