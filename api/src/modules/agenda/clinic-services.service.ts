import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, ClinicService, ClinicSpecialty, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import { SaveClinicServiceDto } from './dto/clinic-service.dto';

export const SERVICE_CATEGORIES = ['FACIAL', 'CORPORAL', 'OTRO'] as const;

interface BaseService {
  name: string;
  category: string;
  subcategory: string;
  durationMinutes: number;
  durationNote: string;
  price: number | null;
  description: string;
  procedureType: string;
  consentCode: string;
  assistantService: boolean;
  active: boolean;
  sortOrder: number;
}

/** Catálogo base de medicina estética (servicios de la Dra. Gladys Quintero). */
export function loadAestheticBase(): BaseService[] {
  const file = join(process.cwd(), 'prisma', 'data', 'aesthetic-services-gladys.json');
  return JSON.parse(readFileSync(file, 'utf8')) as BaseService[];
}

@Injectable()
export class ClinicServicesService {
  constructor(private readonly prisma: PrismaService) {}

  private clinicOf(user: User) {
    if (!user.clinicId) throw new ForbiddenException('Usuario sin consultorio asignado');
    return user.clinicId;
  }

  /** El catálogo de servicios solo existe en consultorios de medicina estética. */
  private async aestheticClinicOf(user: User) {
    const clinicId = this.clinicOf(user);
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId }, select: { specialty: true } });
    if (clinic?.specialty !== ClinicSpecialty.AESTHETIC) {
      throw new ForbiddenException('El catálogo de servicios es exclusivo de medicina estética.');
    }
    return clinicId;
  }

  static view(row: ClinicService) {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      subcategory: row.subcategory,
      durationMinutes: row.durationMinutes,
      durationNote: row.durationNote,
      price: row.price === null ? null : Number(row.price),
      description: row.description,
      procedureType: row.procedureType,
      consentCode: row.consentCode,
      assistantService: row.assistantService,
      active: row.active,
      sortOrder: row.sortOrder,
    };
  }

  async list(user: User, includeInactive: boolean) {
    const rows = await this.prisma.clinicService.findMany({
      where: { clinicId: await this.aestheticClinicOf(user), ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(ClinicServicesService.view);
  }

  private data(dto: SaveClinicServiceDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El nombre del servicio es obligatorio.');
    return {
      name,
      category: dto.category,
      subcategory: dto.subcategory?.trim() || null,
      durationMinutes: dto.durationMinutes,
      durationNote: dto.durationNote?.trim() || null,
      price: dto.price === null || dto.price === undefined ? null : new Prisma.Decimal(dto.price),
      description: dto.description?.trim() || null,
      procedureType: dto.procedureType?.trim() || null,
      consentCode: dto.consentCode?.trim() || null,
      assistantService: !!dto.assistantService,
      active: dto.active ?? true,
    };
  }

  private async audit(user: User, action: AuditAction, row: ClinicService) {
    await this.prisma.auditLog.create({
      data: {
        clinicId: row.clinicId,
        userId: user.id,
        action,
        entityType: 'ClinicService',
        entityId: row.id,
        metadata: { name: row.name, price: row.price === null ? null : Number(row.price), active: row.active },
      },
    });
  }

  async create(user: User, dto: SaveClinicServiceDto) {
    const clinicId = await this.aestheticClinicOf(user);
    const max = await this.prisma.clinicService.aggregate({ where: { clinicId }, _max: { sortOrder: true } });
    try {
      const row = await this.prisma.clinicService.create({
        data: { clinicId, ...this.data(dto), sortOrder: (max._max.sortOrder ?? -1) + 1 },
      });
      await this.audit(user, 'CREATE', row);
      return ClinicServicesService.view(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un servicio con ese nombre.');
      }
      throw e;
    }
  }

  async update(user: User, id: string, dto: SaveClinicServiceDto) {
    const clinicId = await this.aestheticClinicOf(user);
    const existing = await this.prisma.clinicService.findFirst({ where: { id, clinicId } });
    if (!existing) throw new NotFoundException('Servicio no encontrado');
    try {
      const row = await this.prisma.clinicService.update({ where: { id }, data: this.data(dto) });
      await this.audit(user, 'UPDATE', row);
      return ClinicServicesService.view(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un servicio con ese nombre.');
      }
      throw e;
    }
  }

  /** Agrega los servicios base de estética que falten (sin precios: cada consultorio fija los suyos). */
  async importAestheticBase(user: User) {
    const clinicId = await this.aestheticClinicOf(user);
    const existing = new Set(
      (await this.prisma.clinicService.findMany({ where: { clinicId }, select: { name: true } })).map((s) =>
        s.name.toLowerCase(),
      ),
    );
    const rows = loadAestheticBase().filter((s) => s.active && !existing.has(s.name.toLowerCase()));
    if (rows.length) {
      await this.prisma.clinicService.createMany({
        data: rows.map((s) => ({
          clinicId,
          name: s.name,
          category: s.category,
          subcategory: s.subcategory || null,
          durationMinutes: s.durationMinutes,
          durationNote: s.durationNote || null,
          price: null,
          description: s.description || null,
          procedureType: s.procedureType || null,
          consentCode: s.consentCode || null,
          assistantService: s.assistantService,
          sortOrder: s.sortOrder,
        })),
        skipDuplicates: true,
      });
      await this.prisma.auditLog.create({
        data: {
          clinicId,
          userId: user.id,
          action: 'CREATE',
          entityType: 'ClinicService',
          entityId: clinicId,
          metadata: { importedBase: rows.length },
        },
      });
    }
    return { imported: rows.length };
  }

  /** Servicio activo del consultorio para la cita, o error claro. */
  async resolveForAppointment(clinicId: string, serviceId: string) {
    const row = await this.prisma.clinicService.findFirst({ where: { id: serviceId, clinicId } });
    if (!row) throw new BadRequestException('El servicio seleccionado no existe en este consultorio.');
    if (!row.active) throw new BadRequestException('El servicio seleccionado está inactivo.');
    return row;
  }
}
