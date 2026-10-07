import { Module } from '@nestjs/common';
import { ClinicLogosService } from '../../clinics/clinic-logos.service';
import { AttendanceControlController } from './attendance-control.controller';
import { AttendanceControlService } from './attendance-control.service';
import { PsychReportController } from './psych-report.controller';
import { PsychReportService } from './psych-report.service';

/** Formatos de los consultorios de psicología (control de citas e informe psicológico). */
@Module({
  controllers: [AttendanceControlController, PsychReportController],
  providers: [AttendanceControlService, PsychReportService, ClinicLogosService],
})
export class PsychAdminModule {}
