import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClinicalModule } from '../modules/clinical/clinical.module';
import { DocumentsModule } from '../modules/documents/documents.module';
import { PrismaModule } from '../prisma/prisma.module';
import { User } from '../users/user.entity';
import { Clinic } from './clinic.entity';
import { ClinicLogosController } from './clinic-logos.controller';
import { ClinicLogosService } from './clinic-logos.service';
import { ClinicsController } from './clinics.controller';
import { ClinicsService } from './clinics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Clinic, User]),
    ClinicalModule,
    DocumentsModule,
    PrismaModule,
  ],
  controllers: [ClinicsController, ClinicLogosController],
  providers: [ClinicsService, ClinicLogosService],
  exports: [ClinicsService],
})
export class ClinicsModule {}
