import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClinicSpecialty } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { templateDefinitionForSpecialty } from './form-template.definitions';

@Injectable()
export class FormTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(FormTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const clinics = await this.prisma.clinic.findMany({
      where: { dashboardType: { not: null } },
      select: { id: true, specialty: true },
    });
    const specialties = new Set(
      clinics.map((c) => c.specialty as ClinicSpecialty),
    );
    if (specialties.size === 0) {
      specialties.add(ClinicSpecialty.PSYCHOLOGY);
    }
    for (const specialty of specialties) {
      const template = await this.ensureForSpecialty(specialty);
      this.logger.log(`Plantilla HCE lista: ${template.code} (${specialty})`);
    }
  }

  async ensureForSpecialty(specialty: ClinicSpecialty, clinicId?: string | null) {
    const def = templateDefinitionForSpecialty(specialty);
    return this.prisma.formTemplate.upsert({
      where: {
        specialty_code_version: {
          specialty,
          code: def.code,
          version: 1,
        },
      },
      create: {
        specialty,
        code: def.code,
        name: def.name,
        version: 1,
        schemaJson: def.schemaJson,
        clinicId: clinicId ?? null,
        isActive: true,
      },
      update: {
        name: def.name,
        schemaJson: def.schemaJson,
        isActive: true,
      },
    });
  }

  async getActiveForSpecialty(specialty: ClinicSpecialty) {
    return this.prisma.formTemplate.findFirst({
      where: { specialty, isActive: true },
      orderBy: { version: 'desc' },
    });
  }
}
