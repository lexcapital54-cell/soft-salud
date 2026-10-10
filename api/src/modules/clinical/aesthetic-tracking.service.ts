import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import {
  AestheticIntegrityError,
  applyAestheticIntegrity,
  pickAesthetic,
} from './aesthetic-tracking.integrity';

const MAX_BYTES = 600_000;

/**
 * Mapa facial y procedimientos estéticos por paciente. Vive fuera de la historia:
 * la historia firmada queda como fotografía y esto sigue creciendo por sesiones.
 */
@Injectable()
export class AestheticTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  private clinicOf(user: User) {
    if (!user.clinicId) throw new ForbiddenException('Usuario sin consultorio asignado');
    return user.clinicId;
  }

  private async assertPatient(clinicId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
  }

  private view(row: { data: unknown; version: number; updatedAt: Date; updatedByName: string | null }) {
    return {
      data: pickAesthetic(row.data),
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
      updatedByName: row.updatedByName,
    };
  }

  async get(user: User, patientId: string) {
    const clinicId = this.clinicOf(user);
    await this.assertPatient(clinicId, patientId);
    const row = await this.prisma.aestheticTracking.findUnique({ where: { patientId } });
    if (!row || row.clinicId !== clinicId) return null;
    await this.prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: 'VIEW',
        entityType: 'AestheticTracking',
        entityId: row.id,
        metadata: { patientId },
      },
    });
    return this.view(row);
  }

  async save(user: User, patientId: string, body: { data: unknown; version?: number }) {
    const clinicId = this.clinicOf(user);
    await this.assertPatient(clinicId, patientId);
    if (JSON.stringify(body.data ?? {}).length > MAX_BYTES) {
      throw new BadRequestException('El seguimiento estético supera el tamaño permitido');
    }

    const existing = await this.prisma.aestheticTracking.findUnique({ where: { patientId } });
    if (existing && existing.clinicId !== clinicId) throw new NotFoundException('Paciente no encontrado');
    if (existing && body.version !== undefined && body.version !== existing.version) {
      throw new ConflictException(
        'Otro usuario actualizó el seguimiento estético. Recargue la historia para ver los cambios antes de guardar.',
      );
    }

    const before = pickAesthetic(existing?.data);
    const after = pickAesthetic(body.data);
    const userName = user.fullName || user.email;
    let change;
    try {
      change = applyAestheticIntegrity(
        before,
        after,
        {
          id: user.id,
          name: userName,
          canSign: user.role === UserRole.HEALTH_PROFESSIONAL || user.role === UserRole.ADMIN,
        },
        new Date(),
      );
    } catch (error) {
      if (error instanceof AestheticIntegrityError) throw new BadRequestException(error.message);
      throw error;
    }
    const data = after as unknown as Prisma.InputJsonValue;

    return this.prisma.$transaction(async (tx) => {
      let row;
      if (existing) {
        const updated = await tx.aestheticTracking.updateMany({
          where: { id: existing.id, version: existing.version },
          data: { data, version: { increment: 1 }, updatedById: user.id, updatedByName: userName },
        });
        if (!updated.count) {
          throw new ConflictException('Otro usuario actualizó el seguimiento estético. Recargue la historia.');
        }
        row = await tx.aestheticTracking.findUniqueOrThrow({ where: { id: existing.id } });
      } else {
        row = await tx.aestheticTracking.create({
          data: { clinicId, patientId, data, createdById: user.id, updatedById: user.id, updatedByName: userName },
        });
      }

      await tx.auditLog.create({
        data: {
          clinicId,
          userId: user.id,
          action: existing ? 'UPDATE' : 'CREATE',
          entityType: 'AestheticTracking',
          entityId: row.id,
          metadata: {
            patientId,
            version: row.version,
            procedures: after.procedures.length,
            annotations: after.annotations.length,
            addenda: change.addenda,
          },
        },
      });
      if (change.signedProcedures.length || change.lockedAnnotations) {
        await tx.auditLog.create({
          data: {
            clinicId,
            userId: user.id,
            action: 'SIGN',
            entityType: 'AestheticTracking',
            entityId: row.id,
            metadata: {
              patientId,
              signedProcedures: change.signedProcedures,
              lockedAnnotations: change.lockedAnnotations,
            },
          },
        });
      }

      return this.view(row);
    });
  }
}
