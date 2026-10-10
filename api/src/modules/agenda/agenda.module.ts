import { Module } from '@nestjs/common';
import { ClinicalModule } from '../clinical/clinical.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgendaStaffController } from './agenda-staff.controller';
import { AgendaStaffService } from './agenda-staff.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { ClinicServicesController } from './clinic-services.controller';
import { ClinicServicesService } from './clinic-services.service';

@Module({
  imports: [ClinicalModule, NotificationsModule],
  controllers: [AppointmentsController, ClinicServicesController, AgendaStaffController],
  providers: [AppointmentsService, ClinicServicesService, AgendaStaffService],
  exports: [AppointmentsService, ClinicServicesService, AgendaStaffService],
})
export class AgendaModule {}
