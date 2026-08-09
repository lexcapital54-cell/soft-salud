import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';
import {
  CreatePatientDto,
  QuickPatientDto,
  UpdatePatientDto,
} from './dto/patient.dto';
import { withProfileStatus } from './patient-profile';

/** Basta con saber si existe una atención con historia abierta. */
const historyProbe = {
  encounters: {
    where: { clinicalRecord: { isNot: null } },
    select: { id: true },
    take: 1,
  },
} as const;

/**
 * Marca si el paciente ya tiene historia clínica: la recepción necesita saber,
 * al agendar, que la atención se registrará como nota de evolución.
 */
function withHistoryFlag<T extends { encounters: { id: string }[] }>(row: T) {
  const { encounters, ...patient } = row;
  return { ...patient, hasClinicalHistory: encounters.length > 0 };
}

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  async list(user: User, q?: string, range: { from?: string; to?: string } = {}) {
    const clinicId = this.requireClinicId(user);
    const query = q?.trim();
    const createdAt = this.createdRange(range);
    const rows = await this.prisma.patient.findMany({
      where: {
        clinicId,
        ...(createdAt ? { createdAt } : {}),
        ...(query
          ? {
              OR: [
                { firstName: { contains: query, mode: 'insensitive' } },
                { lastName: { contains: query, mode: 'insensitive' } },
                { documentNumber: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: historyProbe,
      orderBy: createdAt
        ? [{ createdAt: 'desc' }]
        : [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: createdAt ? 500 : 50,
    });
    return rows.map((row) => withHistoryFlag(withProfileStatus(row)));
  }

  /** Rango YYYY-MM-DD sobre la fecha de registro, para el calendario. */
  private createdRange({ from, to }: { from?: string; to?: string }) {
    if (!from && !to) return null;
    const end = to ? new Date(`${to}T00:00:00`) : null;
    if (end) end.setDate(end.getDate() + 1);
    return {
      ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
      ...(end ? { lt: end } : {}),
    };
  }

  /**
   * Alta exprés desde la agenda: se abre la ficha con lo indispensable para
   * agendar y contactar. El resto se completa cuando el paciente asiste.
   *
   * Sin documento no hay clave natural, así que la ficha provisional se
   * identifica por nombre + teléfono: si ya existe se reutiliza en vez de
   * duplicar al paciente y partir su historia clínica en dos.
   */
  async quickCreate(user: User, dto: QuickPatientDto) {
    const clinicId = this.requireClinicId(user);
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    const phone = dto.phone.trim();

    const document = dto.documentNumber?.trim();
    const existing = await this.findByIdentity(
      clinicId,
      firstName,
      lastName,
      document,
    );
    if (existing) {
      return { ...withProfileStatus(withHistoryFlag(existing)), reused: true };
    }

    try {
      const patient = await this.prisma.patient.create({
        data: {
          clinicId,
          firstName,
          lastName,
          phone,
          email: dto.email?.trim() || null,
          documentType: document ? dto.documentType?.trim() || 'CC' : null,
          documentNumber: document || null,
        },
      });
      return {
        ...withProfileStatus(patient),
        hasClinicalHistory: false,
        reused: false,
      };
    } catch {
      // El índice único atrapó una doble pulsación o dos recepcionistas
      // registrando a la vez: devolvemos la ficha ganadora.
      const winner = await this.findByIdentity(
        clinicId,
        firstName,
        lastName,
        document,
      );
      if (winner) {
        return { ...withProfileStatus(withHistoryFlag(winner)), reused: true };
      }
      throw new BadRequestException('No se pudo registrar el paciente.');
    }
  }

  /**
   * Un paciente por persona: manda la cédula si viene, y si no el nombre
   * completo. Así una segunda cita nunca abre una ficha paralela ni parte la
   * historia clínica en dos.
   */
  private async findByIdentity(
    clinicId: string,
    firstName: string,
    lastName: string,
    documentNumber?: string,
  ) {
    const document = documentNumber?.replace(/\s/g, '');
    if (document) {
      const byDocument = await this.prisma.patient.findFirst({
        where: {
          clinicId,
          documentNumber: { equals: document, mode: 'insensitive' },
        },
        include: historyProbe,
      });
      if (byDocument) return byDocument;
    }

    return this.prisma.patient.findFirst({
      where: {
        clinicId,
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
      },
      include: historyProbe,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(user: User, dto: CreatePatientDto) {
    const clinicId = this.requireClinicId(user);
    try {
      const patient = await this.prisma.patient.create({
        data: {
          clinicId,
          documentType: dto.documentType,
          documentNumber: dto.documentNumber,
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          secondLastName: dto.secondLastName,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
          sexAtBirth: dto.sexAtBirth,
          genderIdentity: dto.genderIdentity,
          sexualOrientation: dto.sexualOrientation,
          maritalStatus: dto.maritalStatus,
          address: dto.address,
          city: dto.city,
          department: dto.department,
          municipalityCode: dto.municipalityCode,
          phone: dto.phone,
          email: dto.email,
          eps: dto.eps,
          regime: dto.regime,
          occupation: dto.occupation,
          educationLevel: dto.educationLevel,
          emergencyContactName: dto.emergencyContactName,
          emergencyContactPhone: dto.emergencyContactPhone,
          emergencyRelationship: dto.emergencyRelationship,
        },
      });
      return withProfileStatus(patient);
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

    const updated = await this.prisma.patient.update({
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
        ...(dto.municipalityCode !== undefined
          ? { municipalityCode: dto.municipalityCode }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.eps !== undefined ? { eps: dto.eps } : {}),
        ...(dto.regime !== undefined ? { regime: dto.regime } : {}),
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
    return withProfileStatus(updated);
  }

  async getForClinic(user: User, id: string) {
    const clinicId = this.requireClinicId(user);
    const patient = await this.prisma.patient.findFirst({
      where: { id, clinicId },
      include: historyProbe,
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    return withProfileStatus(withHistoryFlag(patient));
  }
}
