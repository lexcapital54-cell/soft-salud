import { Module } from '@nestjs/common';
import { ClinicalModule } from '../clinical/clinical.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { ClinicServicesController } from './clinic-services.controller';
import { ClinicServicesService } from './clinic-services.service';

@Module({
  imports: [ClinicalModule, NotificationsModule],
  controllers: [AppointmentsController, ClinicServicesController],
  providers: [AppointmentsService, ClinicServicesService],
  exports: [AppointmentsService, ClinicServicesService],
})
export class AgendaModule {}
