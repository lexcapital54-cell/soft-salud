import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const email = this.configService.get<string>(
      'SUPERADMIN_EMAIL',
      'dankojimenez@habilisalud.com',
    );
    const password = this.configService.get<string>(
      'SUPERADMIN_PASSWORD',
      'HabiliSalud2026!',
    );
    const fullName = this.configService.get<string>(
      'SUPERADMIN_NAME',
      'Danko Jimenez Londoño',
    );

    await this.usersService.ensureSuperAdmin({ email, password, fullName });
    this.logger.log(`Superadmin listo: ${email}`);
  }
}
