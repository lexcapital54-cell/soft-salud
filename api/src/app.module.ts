import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { Clinic } from './clinics/clinic.entity';
import { ClinicsModule } from './clinics/clinics.module';
import { SeedService } from './database/seed.service';
import { AgendaModule } from './modules/agenda/agenda.module';
import { BillingModule } from './modules/billing/billing.module';
import { PlatformBillingModule } from './modules/platform-billing/platform-billing.module';
import { ClinicalModule } from './modules/clinical/clinical.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { UserClinicAccess } from './users/user-clinic-access.entity';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: Number(config.get('DB_PORT', 5432)),
        username: config.get('DB_USERNAME', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_NAME', 'habilisalud'),
        entities: [User, Clinic, UserClinicAccess],
        // Schema clínico/ERP lo gestiona Prisma; TypeORM solo auth/clinics.
        synchronize: false,
      }),
    }),
    UsersModule,
    ClinicsModule,
    AuthModule,
    ClinicalModule,
    NotificationsModule,
    AgendaModule,
    DocumentsModule,
    BillingModule,
    PlatformBillingModule,
  ],
  providers: [SeedService],
})
export class AppModule {}
