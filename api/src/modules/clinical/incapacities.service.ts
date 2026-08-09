import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClinicalDocumentStatus, Prisma } from '@prisma/client';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';
import { ProfessionalSignatureService } from './professional-signature.service';
import {
  CreateIncapacityDto,
  SignIncapacityDto,
  UpdateIncapacityDto,
} from './dto/incapacity.dto';

const incapacityInclude = {
  patient: true,
  author: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.IncapacityInclude;

@Injectable()
export class IncapacitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signatures: ProfessionalSignatureService,
  ) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  async listByEncounter(user: User, encounterId: string) {
    const clinicId = this.requireClinicId(user);
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId },
      select: { id: true },
    });
    if (!encounter) throw new NotFoundException('Encuentro no encontrado');

    return this.prisma.incapacity.findMany({
      where: { encounterId, clinicId },
      include: incapacityInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(user: User, id: string) {
    const clinicId = this.requireClinicId(user);
    const row = await this.prisma.incapacity.findFirst({
      where: { id, clinicId },
      include: incapacityInclude,
    });
    if (!row) throw new NotFoundException('Incapacidad no encontrada');
    return row;
  }

  async create(user: User, dto: CreateIncapacityDto) {
    const clinicId = this.requireClinicId(user);
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: dto.encounterId, clinicId },
    });
    if (!encounter) throw new NotFoundException('Encuentro no encontrado');

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) {
      throw new BadRequestException('La fecha fin no puede ser anterior al inicio');
    }

    return this.prisma.incapacity.create({
      data: {
        clinicId,
        encounterId: encounter.id,
        patientId: encounter.patientId,
        authorId: user.id,
        status: ClinicalDocumentStatus.DRAFT,
        startDate: start,
        endDate: end,
        days: dto.days,
        diagnosisCie: dto.diagnosisCie,
        cause: dto.cause,
        observations: dto.observations,
      },
      include: incapacityInclude,
    });
  }

  async update(user: User, id: string, dto: UpdateIncapacityDto) {
    const clinicId = this.requireClinicId(user);
    const existing = await this.prisma.incapacity.findFirst({
      where: { id, clinicId },
    });
    if (!existing) throw new NotFoundException('Incapacidad no encontrada');
    if (existing.status !== ClinicalDocumentStatus.DRAFT) {
      throw new BadRequestException('Solo se pueden editar borradores');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;
    if (endDate < startDate) {
      throw new BadRequestException('La fecha fin no puede ser anterior al inicio');
    }

    return this.prisma.incapacity.update({
      where: { id },
      data: {
        startDate: dto.startDate ? startDate : undefined,
        endDate: dto.endDate ? endDate : undefined,
        days: dto.days,
        diagnosisCie:
          dto.diagnosisCie === undefined ? undefined : dto.diagnosisCie,
        cause: dto.cause === undefined ? undefined : dto.cause,
        observations:
          dto.observations === undefined ? undefined : dto.observations,
      },
      include: incapacityInclude,
    });
  }

  async sign(user: User, id: string, dto: SignIncapacityDto) {
    const clinicId = this.requireClinicId(user);
    const existing = await this.prisma.incapacity.findFirst({
      where: { id, clinicId },
    });
    if (!existing) throw new NotFoundException('Incapacidad no encontrada');
    if (existing.status !== ClinicalDocumentStatus.DRAFT) {
      throw new BadRequestException('La incapacidad ya no está en borrador');
    }

    const signatureBase64 = await this.signatures.resolve(
      user,
      dto.signatureBase64,
    );
    const signedAt = new Date();
    const contentHash = this.signatures.hash([
      existing.id,
      existing.patientId,
      existing.startDate.toISOString(),
      existing.endDate.toISOString(),
      existing.days,
      existing.diagnosisCie,
      user.id,
      signedAt.toISOString(),
    ]);

    return this.prisma.incapacity.update({
      where: { id },
      data: {
        status: ClinicalDocumentStatus.SIGNED,
        signatureBase64,
        signedAt,
        contentHash,
      },
      include: incapacityInclude,
    });
  }

  async void(user: User, id: string) {
    const clinicId = this.requireClinicId(user);
    const existing = await this.prisma.incapacity.findFirst({
      where: { id, clinicId },
    });
    if (!existing) throw new NotFoundException('Incapacidad no encontrada');

    return this.prisma.incapacity.update({
      where: { id },
      data: { status: ClinicalDocumentStatus.VOID },
      include: incapacityInclude,
    });
  }
}
