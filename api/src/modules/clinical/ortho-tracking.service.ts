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
import { removedLockedRows, stampOrthoRows } from './ortho-integrity';
import { ORTHO_PLAN_AUDIT_ENTITY, diffOrthoPlan } from './ortho-plan-audit';

type Json = Record<string, unknown>;

/** Módulos longitudinales que siguen vivos después de firmar la historia. */
export const ORTHO_TRACKING_KEYS = ['orthoMech', 'orthoFollow', 'orthoBudget'] as const;
const MAX_BYTES = 600_000;

const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});

function pick(data: unknown): Json {
  const src = obj(data);
  const out: Json = {};
  for (const key of ORTHO_TRACKING_KEYS) {
    if (key in src) out[key] = obj(src[key]);
  }
  return out;
}

@Injectable()
export class OrthoTrackingService {
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

  async get(user: User, patientId: string) {
    const clinicId = this.clinicOf(user);
    await this.assertPatient(clinicId, patientId);
    const row = await this.prisma.orthoTracking.findUnique({ where: { patientId } });
    if (!row || row.clinicId !== clinicId) return null;
    return {
      data: pick(row.data),
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
      updatedByName: row.updatedByName,
    };
  }

  async save(user: User, patientId: string, body: { data: unknown; version?: number }) {
    const clinicId = this.clinicOf(user);
    await this.assertPatient(clinicId, patientId);
    if (JSON.stringify(body.data ?? {}).length > MAX_BYTES) {
      throw new BadRequestException('El seguimiento supera el tamaño permitido');
    }

    const existing = await this.prisma.orthoTracking.findUnique({ where: { patientId } });
    if (existing && existing.clinicId !== clinicId) throw new NotFoundException('Paciente no encontrado');
    if (existing && body.version !== undefined && body.version !== existing.version) {
      throw new ConflictException(
        'Otro usuario actualizó el seguimiento. Recargue la historia para ver los cambios antes de guardar.',
      );
    }

    const before = pick(existing?.data);
    let after = pick(body.data);
    // El auxiliar agenda controles y registra retención; aparatología y presupuesto son del profesional.
    if (user.role === UserRole.AUXILIAR) {
      after = { ...before, orthoFollow: after.orthoFollow ?? before.orthoFollow ?? {} };
    }

    const prevWrap = { dentistry: before };
    const nextWrap = { dentistry: after };
    const removed = removedLockedRows(prevWrap, nextWrap);
    if (removed.length) {
      throw new BadRequestException(
        `No se pueden eliminar registros ya realizados: ${removed.join(', ')}. Cambie su estado en lugar de borrarlos.`,
      );
    }
    const userName = user.fullName || user.email;
    stampOrthoRows(prevWrap, nextWrap, userName, new Date());
    const changes = existing ? diffOrthoPlan(prevWrap, nextWrap) : [];
    const data = nextWrap.dentistry as Prisma.InputJsonValue;

    return this.prisma.$transaction(async (tx) => {
      let row;
      if (existing) {
        const updated = await tx.orthoTracking.updateMany({
          where: { id: existing.id, version: existing.version },
          data: { data, version: { increment: 1 }, updatedById: user.id, updatedByName: userName },
        });
        if (!updated.count) {
          throw new ConflictException('Otro usuario actualizó el seguimiento. Recargue la historia.');
        }
        row = await tx.orthoTracking.findUniqueOrThrow({ where: { id: existing.id } });
      } else {
        row = await tx.orthoTracking.create({
          data: { clinicId, patientId, data, createdById: user.id, updatedById: user.id, updatedByName: userName },
        });
      }

      await tx.auditLog.create({
        data: {
          clinicId,
          userId: user.id,
          action: existing ? 'UPDATE' : 'CREATE',
          entityType: 'OrthoTracking',
          entityId: row.id,
          metadata: { patientId, version: row.version },
        },
      });
      if (changes.length) {
        await tx.auditLog.create({
          data: {
            clinicId,
            userId: user.id,
            action: 'UPDATE',
            entityType: ORTHO_PLAN_AUDIT_ENTITY,
            entityId: patientId,
            metadata: { source: 'SEGUIMIENTO', trackingId: row.id, changes } as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return {
        data: pick(row.data),
        version: row.version,
        updatedAt: row.updatedAt.toISOString(),
        updatedByName: row.updatedByName,
      };
    });
  }
}
