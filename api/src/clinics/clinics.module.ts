import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClinicalModule } from '../modules/clinical/clinical.module';
import { User } from '../users/user.entity';
import { Clinic } from './clinic.entity';
import { ClinicsController } from './clinics.controller';
import { ClinicsService } from './clinics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Clinic, User]), ClinicalModule],
  controllers: [ClinicsController],
  providers: [ClinicsService],
  exports: [ClinicsService],
})
export class ClinicsModule {}
