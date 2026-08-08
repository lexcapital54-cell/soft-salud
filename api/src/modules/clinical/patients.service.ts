import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  async list(user: User, q?: string) {
    const clinicId = this.requireClinicId(user);
    const query = q?.trim();
    return this.prisma.patient.findMany({
      where: {
        clinicId,
        ...(query
          ? {
              OR: [
                { firstName: { contains: query, mode: 'insensitive' } },
                { lastName: { contains: query, mode: 'insensitive' } },
                { documentNumber: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 50,
    });
  }

  async create(user: User, dto: CreatePatientDto) {
    const clinicId = this.requireClinicId(user);
    try {
      return await this.prisma.patient.create({
        data: {
          clinicId,
          documentType: dto.documentType,
          documentNumber: dto.documentNumber,
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          secondLastName: dto.secondLastName,
          birthDate: new Date(dto.birthDate),
          sexAtBirth: dto.sexAtBirth,
          genderIdentity: dto.genderIdentity,
          sexualOrientation: dto.sexualOrientation,
          maritalStatus: dto.maritalStatus,
          address: dto.address,
          city: dto.city,
          department: dto.department,
          phone: dto.phone,
          email: dto.email,
          eps: dto.eps,
          regime: dto.regime,
          affiliationNumber: dto.affiliationNumber,
          occupation: dto.occupation,
          educationLevel: dto.educationLevel,
          emergencyContactName: dto.emergencyContactName,
          emergencyContactPhone: dto.emergencyContactPhone,
          emergencyRelationship: dto.emergencyRelationship,
        },
      });
    } catch {
      throw new BadRequestException(
        'No se pudo crear el paciente. Verifique documento duplicado u otros datos.',
      );
    }
  }

  async update(user: User, id: string, dto: UpdatePatientDto) {
    const clinicId = this.requireClinicId(user);
    const existing = await this.prisma.patient.findFirst({ where: { id, clinicId } });
    if (!existing) {
      throw new NotFoundException('Paciente no encontrado');
    }

    return this.prisma.patient.update({
      where: { id },
      data: {
        ...(dto.documentType !== undefined ? { documentType: dto.documentType } : {}),
        ...(dto.documentNumber !== undefined
          ? { documentNumber: dto.documentNumber }
          : {}),
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.middleName !== undefined ? { middleName: dto.middleName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.secondLastName !== undefined
          ? { secondLastName: dto.secondLastName }
          : {}),
        ...(dto.birthDate !== undefined ? { birthDate: new Date(dto.birthDate) } : {}),
        ...(dto.sexAtBirth !== undefined ? { sexAtBirth: dto.sexAtBirth } : {}),
        ...(dto.genderIdentity !== undefined
          ? { genderIdentity: dto.genderIdentity }
          : {}),
        ...(dto.sexualOrientation !== undefined
          ? { sexualOrientation: dto.sexualOrientation }
          : {}),
        ...(dto.maritalStatus !== undefined ? { maritalStatus: dto.maritalStatus } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.department !== undefined ? { department: dto.department } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.eps !== undefined ? { eps: dto.eps } : {}),
        ...(dto.regime !== undefined ? { regime: dto.regime } : {}),
        ...(dto.affiliationNumber !== undefined
          ? { affiliationNumber: dto.affiliationNumber }
          : {}),
        ...(dto.occupation !== undefined ? { occupation: dto.occupation } : {}),
        ...(dto.educationLevel !== undefined
          ? { educationLevel: dto.educationLevel }
          : {}),
        ...(dto.emergencyContactName !== undefined
          ? { emergencyContactName: dto.emergencyContactName }
          : {}),
        ...(dto.emergencyContactPhone !== undefined
          ? { emergencyContactPhone: dto.emergencyContactPhone }
          : {}),
        ...(dto.emergencyRelationship !== undefined
          ? { emergencyRelationship: dto.emergencyRelationship }
          : {}),
      },
    });
  }

  async getForClinic(user: User, id: string) {
    const clinicId = this.requireClinicId(user);
    const patient = await this.prisma.patient.findFirst({ where: { id, clinicId } });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    return patient;
  }
}
