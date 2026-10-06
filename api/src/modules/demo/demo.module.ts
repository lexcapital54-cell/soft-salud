import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../users/user.entity';
import { ClinicalModule } from '../clinical/clinical.module';
import { DocumentsModule } from '../documents/documents.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [ClinicalModule, DocumentsModule, TypeOrmModule.forFeature([User])],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
