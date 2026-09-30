import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../auth/jwt.strategy';
import { UserRole } from '../common/enums';
import { PrismaService } from '../prisma/prisma.module';
import { toPublicUser, User } from './user.entity';
import { UsersService } from './users.service';

export type AccessibleClinicDto = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  specialty: string;
  isCurrent: boolean;
  isDefault: boolean;
};

@Injectable()
export class ClinicAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /** Sedes a las que el usuario puede entrar (sede principal + accesos). */
  async listAccessibleClinics(user: User): Promise<AccessibleClinicDto[]> {
    if (user.role === UserRole.SUPER_ADMIN) {
      const all = await this.prisma.clinic.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
      return all.map((c) => ({
        id: c.id,
        name: c.name,
        address: c.address,
        phone: c.phone,
        specialty: c.specialty,
        isCurrent: c.id === user.clinicId,
        isDefault: false,
      }));
    }

    const accessRows = await this.prisma.userClinicAccess.findMany({
      where: { userId: user.id },
      include: { clinic: true },
    });

    const byId = new Map<string, AccessibleClinicDto>();

    if (user.clinicId && user.clinic) {
      byId.set(user.clinicId, {
        id: user.clinic.id,
        name: user.clinic.name,
        address: user.clinic.address,
        phone: user.clinic.phone,
        specialty: user.clinic.specialty,
        isCurrent: true,
        isDefault: true,
      });
    } else if (user.clinicId) {
      const clinic = await this.prisma.clinic.findUnique({
        where: { id: user.clinicId },
      });
      if (clinic?.isActive) {
        byId.set(clinic.id, {
          id: clinic.id,
          name: clinic.name,
          address: clinic.address,
          phone: clinic.phone,
          specialty: clinic.specialty,
          isCurrent: true,
          isDefault: true,
        });
      }
    }

    for (const row of accessRows) {
      if (!row.clinic?.isActive) continue;
      const prev = byId.get(row.clinicId);
      byId.set(row.clinicId, {
        id: row.clinic.id,
        name: row.clinic.name,
        address: row.clinic.address,
        phone: row.clinic.phone,
        specialty: row.clinic.specialty,
        isCurrent: row.clinicId === user.clinicId,
        isDefault: Boolean(prev?.isDefault || row.isDefault),
      });
    }

    return [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'es'),
    );
  }

  async assertCanAccess(user: User, clinicId: string) {
    if (user.role === UserRole.SUPER_ADMIN) {
      const clinic = await this.prisma.clinic.findFirst({
        where: { id: clinicId, isActive: true },
      });
      if (!clinic) throw new NotFoundException('Sede no encontrada');
      return clinic;
    }

    if (user.clinicId === clinicId) {
      const clinic = await this.prisma.clinic.findFirst({
        where: { id: clinicId, isActive: true },
      });
      if (!clinic) throw new NotFoundException('Sede no encontrada');
      return clinic;
    }

    const access = await this.prisma.userClinicAccess.findUnique({
      where: {
        userId_clinicId: { userId: user.id, clinicId },
      },
      include: { clinic: true },
    });
    if (!access?.clinic?.isActive) {
      throw new ForbiddenException('No tiene acceso a esa sede');
    }
    return access.clinic;
  }

  async switchClinic(user: User, clinicId: string) {
    await this.assertCanAccess(user, clinicId);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { clinicId },
    });

    const access = await this.prisma.userClinicAccess.findUnique({
      where: { userId_clinicId: { userId: user.id, clinicId } },
    });
    if (access) {
      await this.prisma.$transaction([
        this.prisma.userClinicAccess.updateMany({
          where: { userId: user.id, isDefault: true },
          data: { isDefault: false },
        }),
        this.prisma.userClinicAccess.update({
          where: { id: access.id },
          data: { isDefault: true },
        }),
      ]);
    }

    const refreshed = await this.usersService.findById(user.id);
    if (!refreshed) throw new NotFoundException('Usuario no encontrado');

    const payload: JwtPayload = {
      sub: refreshed.id,
      email: refreshed.email,
      role: refreshed.role,
      clinicId: refreshed.clinicId,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: toPublicUser(refreshed),
    };
  }

  /** Catálogo completo de sedes activas (para vincular una segunda sede). */
  async listDirectory() {
    return this.prisma.clinic.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        specialty: true,
      },
    });
  }

  /** Sedes que un admin puede asignar a su personal. */
  async listGrantableClinics(actor: User) {
    if (actor.role === UserRole.SUPER_ADMIN) {
      return this.prisma.clinic.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          specialty: true,
        },
      });
    }

    if (actor.role !== UserRole.ADMIN || !actor.clinicId) {
      throw new ForbiddenException(
        'Solo el administrador del consultorio gestiona sedes',
      );
    }

    const accessible = await this.listAccessibleClinics(actor);
    return accessible.map((c) => ({
      id: c.id,
      name: c.name,
      address: c.address,
      phone: c.phone,
      specialty: c.specialty,
    }));
  }

  async listStaff(actor: User) {
    this.requireClinicManager(actor);

    if (actor.role === UserRole.SUPER_ADMIN && !actor.clinicId) {
      // Superadmin ve personal de todas las sedes activas (agrupado por clinicId).
      const users = await this.prisma.user.findMany({
        where: {
          isActive: true,
          clinicId: { not: null },
          role: {
            in: [
              UserRole.RECEPTIONIST, UserRole.AUXILIAR,
              UserRole.HEALTH_PROFESSIONAL,
              UserRole.ADMIN,
              UserRole.AUDITOR,
            ],
          },
        },
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          clinicId: true,
          clinic: { select: { name: true } },
          clinicAccess: {
            select: { clinicId: true, isDefault: true },
          },
        },
      });

      return users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        roleLabel: this.roleLabel(u.role),
        clinicId: u.clinicId,
        clinicName: u.clinic?.name ?? null,
        accessClinicIds: [
          ...new Set(
            [u.clinicId, ...u.clinicAccess.map((a) => a.clinicId)].filter(
              (id): id is string => !!id,
            ),
          ),
        ],
      }));
    }

    const clinicId = actor.clinicId!;

    const users = await this.prisma.user.findMany({
      where: {
        clinicId,
        isActive: true,
        role: {
          in: [
            UserRole.RECEPTIONIST, UserRole.AUXILIAR,
            UserRole.HEALTH_PROFESSIONAL,
            UserRole.ADMIN,
            UserRole.AUDITOR,
          ],
        },
      },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        clinicId: true,
        clinicAccess: {
          select: { clinicId: true, isDefault: true },
        },
      },
    });

    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      roleLabel: this.roleLabel(u.role),
      clinicId: u.clinicId,
      accessClinicIds: [
        ...new Set(
          [u.clinicId, ...u.clinicAccess.map((a) => a.clinicId)].filter(
            (id): id is string => !!id,
          ),
        ),
      ],
    }));
  }

  async getUserAccess(actor: User, targetUserId: string) {
    this.requireClinicManager(actor);
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        clinicAccess: { include: { clinic: true } },
        clinic: true,
      },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    this.assertSameClinicStaff(actor, target);

    const grantable = await this.listGrantableClinics(actor);
    const accessIds = new Set([
      ...(target.clinicId ? [target.clinicId] : []),
      ...target.clinicAccess.map((a) => a.clinicId),
    ]);

    return {
      user: {
        id: target.id,
        fullName: target.fullName,
        email: target.email,
        role: target.role,
        roleLabel: this.roleLabel(target.role),
        clinicId: target.clinicId,
      },
      clinics: grantable.map((c) => ({
        ...c,
        granted: accessIds.has(c.id),
        isHome: c.id === target.clinicId,
      })),
    };
  }

  async setUserAccess(actor: User, targetUserId: string, clinicIds: string[]) {
    this.requireClinicManager(actor);
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    this.assertSameClinicStaff(actor, target);

    const unique = [...new Set(clinicIds.filter(Boolean))];
    if (!unique.length) {
      throw new BadRequestException('Debe dejar al menos una sede asignada');
    }

    const grantable = await this.listGrantableClinics(actor);
    const grantableIds = new Set(grantable.map((c) => c.id));
    for (const id of unique) {
      if (!grantableIds.has(id)) {
        throw new ForbiddenException(
          'No puede asignar una sede fuera de su grupo de consultorios',
        );
      }
    }

    const homeId = target.clinicId;
    if (homeId && !unique.includes(homeId)) {
      unique.push(homeId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userClinicAccess.deleteMany({ where: { userId: target.id } });
      for (const clinicId of unique) {
        await tx.userClinicAccess.create({
          data: {
            userId: target.id,
            clinicId,
            isDefault: clinicId === homeId,
          },
        });
      }
    });

    return this.getUserAccess(actor, targetUserId);
  }

  /**
   * Permite al admin ampliar las sedes a las que él mismo puede asignar personal
   * (p. ej. una segunda sede del mismo prestador). Solo SUPER_ADMIN puede
   * vincular cualquier clínica; el ADMIN solo puede pedirlo si ya tiene ≥1 acceso.
   */
  async grantSelfAccess(actor: User, clinicId: string) {
    if (actor.role === UserRole.SUPER_ADMIN) {
      await this.assertCanAccess(actor, clinicId);
      return { ok: true };
    }
    if (actor.role !== UserRole.ADMIN || !actor.clinicId) {
      throw new ForbiddenException('No autorizado');
    }
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, isActive: true },
    });
    if (!clinic) throw new NotFoundException('Sede no encontrada');

    await this.prisma.userClinicAccess.upsert({
      where: {
        userId_clinicId: { userId: actor.id, clinicId },
      },
      create: {
        userId: actor.id,
        clinicId,
        isDefault: false,
      },
      update: {},
    });

    // También asegura fila para la sede home.
    await this.prisma.userClinicAccess.upsert({
      where: {
        userId_clinicId: { userId: actor.id, clinicId: actor.clinicId },
      },
      create: {
        userId: actor.id,
        clinicId: actor.clinicId,
        isDefault: true,
      },
      update: {},
    });

    return this.listAccessibleClinics(
      (await this.usersService.findById(actor.id))!,
    );
  }

  private requireClinicManager(actor: User) {
    if (actor.role === UserRole.SUPER_ADMIN) return;
    if (actor.role === UserRole.ADMIN && actor.clinicId) return;
    throw new ForbiddenException(
      'No autorizado a gestionar accesos multi-sede',
    );
  }

  private assertSameClinicStaff(
    actor: User,
    target: { clinicId: string | null; id: string },
  ) {
    if (actor.role === UserRole.SUPER_ADMIN) return;
    if (target.clinicId !== actor.clinicId) {
      throw new ForbiddenException(
        'Solo puede gestionar personal de su sede actual',
      );
    }
  }

  roleLabel(role: string) {
    switch (role) {
      case UserRole.RECEPTIONIST:
        return 'Secretaría';
      case UserRole.HEALTH_PROFESSIONAL:
        return 'Profesional de salud';
      case UserRole.ADMIN:
        return 'Administrador';
      case UserRole.AUDITOR:
        return 'Auditor';
      case UserRole.AUXILIAR:
        return 'Auxiliar';
      default:
        return role;
    }
  }
}
