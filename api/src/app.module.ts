import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { Clinic } from './clinics/clinic.entity';
import { ClinicsModule } from './clinics/clinics.module';
import { SeedService } from './database/seed.service';
import { ClinicalModule } from './modules/clinical/clinical.module';
import { PrismaModule } from './prisma/prisma.module';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
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
        entities: [User, Clinic],
        // Schema clínico/ERP lo gestiona Prisma; TypeORM solo auth/clinics.
        synchronize: false,
      }),
    }),
    UsersModule,
    ClinicsModule,
    AuthModule,
    ClinicalModule,
  ],
  providers: [SeedService],
})
export class AppModule {}
