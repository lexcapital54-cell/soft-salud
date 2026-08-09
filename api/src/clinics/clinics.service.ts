import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClinicSpecialty as PrismaClinicSpecialty } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { UserRole } from '../common/enums';
import { FormTemplatesService } from '../modules/clinical/form-templates.service';
import { toPublicUser, User } from '../users/user.entity';
import { Clinic } from './clinic.entity';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';

@Injectable()
export class ClinicsService {
  constructor(
    @InjectRepository(Clinic)
    private readonly clinicsRepository: Repository<Clinic>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly formTemplates: FormTemplatesService,
  ) {}

  async findAll() {
    const clinics = await this.clinicsRepository.find({
      relations: { admins: true },
      order: { createdAt: 'DESC' },
    });
    return clinics.map((clinic) => this.toPublicClinic(clinic));
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
        role: UserRole.ADMIN,
        clinicId: saved.id,
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
