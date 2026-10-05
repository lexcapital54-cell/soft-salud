import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, Repository } from 'typeorm';
import { Clinic } from '../clinics/clinic.entity';
import { UserRole } from '../common/enums';
import { CreateClinicAdminDto } from './dto/create-clinic-admin.dto';
import {
  CreateStaffUserDto,
  STAFF_CREATABLE_ROLES,
  UpdateStaffUserDto,
} from './dto/create-staff-user.dto';
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

  private toStaffUser(u: User) {
    return {
      ...toPublicUser(u),
      professionalCard: u.professionalCard,
      createdAt: u.createdAt,
      /** Contraseña actual (última asignada por admin). Solo en endpoints SUPER_ADMIN. */
      currentPassword: u.passwordReminder ?? null,
    };
  }

  async listClinicAdmins() {
    const users = await this.usersRepository.find({
      where: { role: UserRole.ADMIN },
      relations: { clinic: true },
      order: { createdAt: 'DESC' },
    });
    return users.map(toPublicUser);
  }

  /** Lista usuarios de consultorio (admin, profesional, recepción, auditor). */
  async listStaffUsers(clinicId?: string, role?: UserRole) {
    const where: {
      role?: UserRole | ReturnType<typeof In>;
      clinicId?: string;
    } = {
      role: In([...STAFF_CREATABLE_ROLES]),
    };
    if (clinicId?.trim()) where.clinicId = clinicId.trim();
    if (role && (STAFF_CREATABLE_ROLES as readonly UserRole[]).includes(role)) {
      where.role = role;
    }

    const users = await this.usersRepository.find({
      where,
      relations: { clinic: true },
      order: { createdAt: 'DESC' },
    });
    return users.map((u) => this.toStaffUser(u));
  }

  async createClinicAdmin(dto: CreateClinicAdminDto) {
    return this.createStaffUser({
      clinicId: dto.clinicId,
      fullName: dto.fullName,
      email: dto.email,
      password: dto.password,
      role: UserRole.ADMIN,
    });
  }

  async createStaffUser(dto: CreateStaffUserDto) {
    if (!(STAFF_CREATABLE_ROLES as readonly UserRole[]).includes(dto.role)) {
      throw new BadRequestException(
        'Rol no permitido. Use ADMIN, HEALTH_PROFESSIONAL, RECEPTIONIST, AUXILIAR o AUDITOR.',
      );
    }

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
      fullName: dto.fullName.trim(),
      passwordHash: await bcrypt.hash(dto.password, 10),
      passwordReminder: dto.password,
      role: dto.role,
      clinicId: clinic.id,
      professionalCard: dto.professionalCard?.trim() || null,
      isActive: true,
    });

    const saved = await this.usersRepository.save(user);
    saved.clinic = clinic;
    return this.toStaffUser(saved);
  }

  /** Asistentes administrativos (rol RECEPTIONIST) del consultorio activo de quien consulta. */
  async listAssistants(requester: User) {
    const clinicId = this.requireClinic(requester);
    const users = await this.usersRepository.find({
      where: { role: UserRole.RECEPTIONIST, clinicId },
      order: { createdAt: 'DESC' },
    });
    return users.map((u) => this.toAssistant(u));
  }

  async createAssistant(requester: User, dto: { fullName: string; email: string; password: string }) {
    const clinicId = this.requireClinic(requester);
    const created = await this.createStaffUser({
      clinicId,
      fullName: dto.fullName,
      email: dto.email,
      password: dto.password,
      role: UserRole.RECEPTIONIST,
    });
    return {
      id: created.id,
      fullName: created.fullName,
      email: created.email,
      isActive: created.isActive,
      createdAt: created.createdAt,
    };
  }

  /** Desactivar no borra la cuenta: solo impide el ingreso. */
  async setAssistantActive(requester: User, id: string, isActive: boolean) {
    const clinicId = this.requireClinic(requester);
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user || user.role !== UserRole.RECEPTIONIST || user.clinicId !== clinicId) {
      throw new NotFoundException('Asistente no encontrado en este consultorio');
    }
    user.isActive = isActive;
    return this.toAssistant(await this.usersRepository.save(user));
  }

  async setAssistantPin(requester: User, id: string, pin: string) {
    const clinicId = this.requireClinic(requester);
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user || user.role !== UserRole.RECEPTIONIST || user.clinicId !== clinicId) {
      throw new NotFoundException('Asistente no encontrado en este consultorio');
    }
    user.passwordHash = await bcrypt.hash(pin, 10);
    user.passwordReminder = pin;
    await this.usersRepository.save(user);
    return { ...this.toAssistant(user), password: pin };
  }

  /** Fecha de vencimiento REPS del profesional; solo la cambia HABILISALUD. */
  async setRepsExpiration(userId: string, raw: string | null | undefined) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const value = raw?.trim() || null;
    const parsed = value ? new Date(`${value.slice(0, 10)}T12:00:00.000Z`) : null;
    if (parsed && Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Fecha inválida. Use formato AAAA-MM-DD.');
    }
    user.repsExpirationDate = parsed;
    return this.toStaffUser(await this.usersRepository.save(user));
  }

  private requireClinic(requester: User) {
    if (!requester.clinicId) {
      throw new BadRequestException('Su usuario no tiene consultorio asignado');
    }
    return requester.clinicId;
  }

  private toAssistant(u: User) {
    return {
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      isActive: u.isActive,
      createdAt: u.createdAt,
    };
  }

  async resetPassword(userId: string, password: string) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException(
        'No se puede resetear la contraseña del superadministrador desde este módulo.',
      );
    }
    if (!(STAFF_CREATABLE_ROLES as readonly UserRole[]).includes(user.role)) {
      throw new BadRequestException('Este tipo de usuario no se gestiona aquí.');
    }
    if (user.role === UserRole.RECEPTIONIST ? !/^\d{4}$/.test(password) : password.length < 8) {
      throw new BadRequestException(
        user.role === UserRole.RECEPTIONIST
          ? 'La clave del asistente administrativo debe ser de 4 dígitos.'
          : 'La contraseña debe tener mínimo 8 caracteres.',
      );
    }

    const previousPassword = user.passwordReminder ?? null;
    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordReminder = password;
    await this.usersRepository.save(user);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      previousPassword,
      currentPassword: password,
      message: 'Contraseña actualizada correctamente.',
    };
  }

  async updateStaffUser(userId: string, dto: UpdateStaffUserDto) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('No se puede editar el superadministrador aquí.');
    }
    if (!(STAFF_CREATABLE_ROLES as readonly UserRole[]).includes(user.role)) {
      throw new BadRequestException('Este tipo de usuario no se gestiona aquí.');
    }

    if (dto.fullName !== undefined) user.fullName = dto.fullName.trim();
    if (dto.professionalCard !== undefined) {
      user.professionalCard = dto.professionalCard.trim() || null;
    }
    if (dto.isActive !== undefined) user.isActive = dto.isActive;

    const saved = await this.usersRepository.save(user);
    return this.toStaffUser(saved);
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
