import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Clinic } from '../clinics/clinic.entity';
import { UserRole } from '../common/enums';
import { CreateClinicAdminDto } from './dto/create-clinic-admin.dto';
import { toPublicUser, User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Clinic)
    private readonly clinicsRepository: Repository<Clinic>,
  ) {}

  findByEmail(email: string) {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
      relations: { clinic: true },
    });
  }

  findById(id: string) {
    return this.usersRepository.findOne({
      where: { id },
      relations: { clinic: true },
    });
  }

  async listClinicAdmins() {
    const users = await this.usersRepository.find({
      where: { role: UserRole.CLINIC_ADMIN },
      relations: { clinic: true },
      order: { createdAt: 'DESC' },
    });
    return users.map(toPublicUser);
  }

  async createClinicAdmin(dto: CreateClinicAdminDto) {
    const clinic = await this.clinicsRepository.findOne({
      where: { id: dto.clinicId },
    });
    if (!clinic) {
      throw new NotFoundException('El consultorio no existe');
    }
    if (!clinic.isActive) {
      throw new BadRequestException('El consultorio está inactivo');
    }

    const email = dto.email.toLowerCase();
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese correo');
    }

    const user = this.usersRepository.create({
      email,
      fullName: dto.fullName,
      passwordHash: await bcrypt.hash(dto.password, 10),
      role: UserRole.CLINIC_ADMIN,
      clinicId: clinic.id,
      isActive: true,
    });

    const saved = await this.usersRepository.save(user);
    saved.clinic = clinic;
    return toPublicUser(saved);
  }

  async ensureSuperAdmin(params: {
    email: string;
    password: string;
    fullName: string;
  }) {
    const email = params.email.toLowerCase();
    const existing = await this.findByEmail(email);
    const passwordHash = await bcrypt.hash(params.password, 10);

    if (existing) {
      existing.fullName = params.fullName;
      existing.passwordHash = passwordHash;
      existing.role = UserRole.SUPER_ADMIN;
      existing.clinicId = null;
      existing.isActive = true;
      return this.usersRepository.save(existing);
    }

    const superAdmin = this.usersRepository.create({
      email,
      fullName: params.fullName,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      clinicId: null,
      isActive: true,
    });

    return this.usersRepository.save(superAdmin);
  }
}
