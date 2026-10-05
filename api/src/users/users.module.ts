import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clinic } from '../clinics/clinic.entity';
import { AssistantsController } from './assistants.controller';
import { ClinicAccessController } from './clinic-access.controller';
import { ClinicAccessService } from './clinic-access.service';
import { User } from './user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Clinic]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '8h',
        },
      }),
    }),
  ],
  controllers: [UsersController, ClinicAccessController, AssistantsController],
  providers: [UsersService, ClinicAccessService],
  exports: [UsersService, ClinicAccessService, TypeOrmModule],
})
export class UsersModule {}
