import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClinicSpecialty as PrismaClinicSpecialty } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { seedConsents } from '../../prisma/seed/seedConsents';
import { UserRole } from '../common/enums';
import { FormTemplatesService } from '../modules/clinical/form-templates.service';
import { DocumentProvisionService } from '../modules/documents/document-provision.service';
import { PrismaService } from '../prisma/prisma.module';
import { toPublicUser, User } from '../users/user.entity';
import { Clinic } from './clinic.entity';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';

@Injectable()
export class ClinicsService {
  private readonly logger = new Logger(ClinicsService.name);

  constructor(
    @InjectRepository(Clinic)
    private readonly clinicsRepository: Repository<Clinic>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly formTemplates: FormTemplatesService,
    private readonly documentProvision: DocumentProvisionService,
    private readonly prisma: PrismaService,
  ) {}

  async findAll() {
    const clinics = await this.clinicsRepository.find({
      relations: { admins: true },
      order: { createdAt: 'DESC' },
    });
    const withData = await this.clinicIdsWithClinicalData();
    return clinics.map((clinic) => ({
      ...this.toPublicClinic(clinic),
      hasClinicalData: withData.has(clinic.id),
    }));
  }

  /** Sedes con datos que obligan a conservarlas (solo se pueden desactivar). */
  private async clinicIdsWithClinicalData() {
    const by = { by: ['clinicId'] as ['clinicId'] };
    const groups = await Promise.all([
      this.prisma.patient.groupBy(by),
      this.prisma.encounter.groupBy(by),
      this.prisma.patientConsent.groupBy(by),
      this.prisma.incapacity.groupBy(by),
      this.prisma.invoice.groupBy(by),
      this.prisma.platformReceipt.groupBy(by),
    ]);
    return new Set(groups.flat().map((g) => g.clinicId));
  }

  async findOne(id: string) {
    const clinic = await this.clinicsRepository.findOne({
      where: { id },
      relations: { admins: true },
    });
    if (!clinic) {
      throw new NotFoundException('El consultorio no existe');
    }
    return this.toPublicClinic(clinic);
  }

  async create(dto: CreateClinicDto) {
    if (dto.admin) {
      const email = dto.admin.email.toLowerCase();
      const existing = await this.usersRepository.findOne({ where: { email } });
      if (existing) {
        throw new ConflictException('Ya existe un usuario con ese correo');
      }
    }

    const clinic = this.clinicsRepository.create({
      name: dto.name,
      specialty: dto.specialty,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      dashboardType: null,
      isActive: true,
    });
    const saved = await this.clinicsRepository.save(clinic);

    if (dto.admin) {
      const admin = this.usersRepository.create({
        email: dto.admin.email.toLowerCase(),
        fullName: dto.admin.fullName,
        passwordHash: await bcrypt.hash(dto.admin.password, 10),
        passwordReminder: dto.admin.password,
        role: UserRole.ADMIN,
        clinicId: saved.id,
        professionalCard: dto.admin.professionalCard?.trim() || null,
        isActive: true,
      });
      await this.usersRepository.save(admin);
    }

    return this.findOne(saved.id);
  }

  async createDashboard(id: string, dto: CreateDashboardDto) {
    return this.assignDashboard(id, dto);
  }

  async updateDashboard(id: string, dto: CreateDashboardDto) {
    return this.assignDashboard(id, dto);
  }

  private async assignDashboard(id: string, dto: CreateDashboardDto) {
    const clinic = await this.clinicsRepository.findOne({ where: { id } });
    if (!clinic) {
      throw new NotFoundException('El consultorio no existe');
    }

    clinic.dashboardType = dto.dashboardType;
    await this.clinicsRepository.save(clinic);

    try {
      await this.formTemplates.ensureForSpecialty(
        clinic.specialty as unknown as PrismaClinicSpecialty,
        clinic.id,
      );
    } catch (error) {
      // El dashboard ya quedó asignado; la plantilla se puede reintentar al abrir HCE.
      console.error('No se pudo aprovisionar FormTemplate', error);
    }

    try {
      await seedConsents(this.prisma);
    } catch (error) {
      console.error('No se pudo aprovisionar plantillas de consentimiento', error);
    }

    try {
      await this.documentProvision.ensureForClinic(
        clinic.id,
        clinic.dashboardType,
      );
    } catch (error) {
      console.error('No se pudo aprovisionar gestión documental', error);
    }

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateClinicDto) {
    const clinic = await this.clinicsRepository.findOne({ where: { id } });
    if (!clinic) {
      throw new NotFoundException('El consultorio no existe');
    }
    Object.assign(clinic, {
      name: dto.name ?? clinic.name,
      specialty: dto.specialty ?? clinic.specialty,
      address: dto.address ?? clinic.address,
      phone: dto.phone ?? clinic.phone,
      isActive: dto.isActive ?? clinic.isActive,
    });
    await this.clinicsRepository.save(clinic);
    return this.findOne(id);
  }

  /**
   * Datos que impiden borrar un consultorio: el borrado es en cascada y la historia
   * clínica tiene deber legal de custodia, así que solo se eliminan sedes vacías.
   */
  async deletionCheck(id: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!clinic) {
      throw new NotFoundException('El consultorio no existe');
    }
    const [patients, encounters, patientConsents, incapacities, invoices, receipts] =
      await Promise.all([
        this.prisma.patient.count({ where: { clinicId: id } }),
        this.prisma.encounter.count({ where: { clinicId: id } }),
        this.prisma.patientConsent.count({ where: { clinicId: id } }),
        this.prisma.incapacity.count({ where: { clinicId: id } }),
        this.prisma.invoice.count({ where: { clinicId: id } }),
        this.prisma.platformReceipt.count({ where: { clinicId: id } }),
      ]);
    const users = await this.prisma.user.count({ where: { clinicId: id } });
    const blockers = [
      patients && `${patients} paciente(s)`,
      encounters && `${encounters} atención(es) / historia(s) clínica(s)`,
      patientConsents && `${patientConsents} consentimiento(s) firmado(s)`,
      incapacities && `${incapacities} incapacidad(es)`,
      invoices && `${invoices} factura(s)`,
      receipts && `${receipts} recibo(s) de arrendamiento`,
    ].filter(Boolean) as string[];
    return {
      id: clinic.id,
      name: clinic.name,
      canDelete: blockers.length === 0,
      blockers,
      users,
    };
  }

  async remove(
    id: string,
    confirmName: string | undefined,
    confirmPin: string | undefined,
    actor?: { id?: string; email?: string },
  ) {
    const expectedPin = process.env.CLINIC_DELETE_PIN || '0000';
    if ((confirmPin || '') !== expectedPin) {
      throw new ForbiddenException('Clave de confirmación incorrecta. No se eliminó el consultorio.');
    }
    const check = await this.deletionCheck(id);
    if (!check.canDelete) {
      throw new ConflictException(
        `No se puede eliminar «${check.name}»: tiene ${check.blockers.join(', ')}. ` +
          'La historia clínica debe conservarse; desactive el consultorio en su lugar.',
      );
    }
    if ((confirmName || '').trim() !== check.name.trim()) {
      throw new BadRequestException(
        'Para confirmar, escriba exactamente el nombre del consultorio.',
      );
    }

    const users = await this.prisma.user.findMany({
      where: { clinicId: id, role: { not: 'SUPER_ADMIN' } },
      select: {
        id: true,
        email: true,
        clinicAccess: {
          where: { clinicId: { not: id } },
          select: { clinicId: true, isDefault: true },
        },
      },
    });

    // Usuarios con acceso a otras sedes se mueven a una de ellas antes del borrado.
    const orphans: Array<{ id: string; email: string }> = [];
    for (const user of users) {
      const next = user.clinicAccess.find((a) => a.isDefault) || user.clinicAccess[0];
      if (next) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { clinicId: next.clinicId },
        });
      } else {
        orphans.push({ id: user.id, email: user.email });
      }
    }

    await this.prisma.clinic.delete({ where: { id } });

    const deactivated: string[] = [];
    for (const user of orphans) {
      try {
        await this.prisma.user.delete({ where: { id: user.id } });
      } catch {
        // Tiene registros asociados en otras tablas: se conserva inactivo.
        await this.prisma.user.update({
          where: { id: user.id },
          data: { isActive: false, clinicId: null },
        });
        deactivated.push(user.email);
      }
    }

    this.logger.warn(
      `Consultorio eliminado: «${check.name}» (${id}) por ${actor?.email || actor?.id || 'SUPER_ADMIN'}; ` +
        `usuarios eliminados: ${orphans.length - deactivated.length}, desactivados: ${deactivated.length}.`,
    );
    return {
      deleted: true,
      name: check.name,
      usersDeleted: orphans.length - deactivated.length,
      usersDeactivated: deactivated,
    };
  }

  private toPublicClinic(clinic: Clinic) {
    return {
      id: clinic.id,
      name: clinic.name,
      specialty: clinic.specialty,
      dashboardType: clinic.dashboardType,
      address: clinic.address,
      phone: clinic.phone,
      isActive: clinic.isActive,
      createdAt: clinic.createdAt,
      updatedAt: clinic.updatedAt,
      admins: (clinic.admins || []).map(toPublicUser),
    };
  }
}
