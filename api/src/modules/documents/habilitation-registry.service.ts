import { uploaderLabel } from './uploader-label';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { AuditAction, DocumentFileStatus, DocumentPillar, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PrismaService } from '../../prisma/prisma.module';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (fonts: Record<string, unknown>) => {
  createPdfKitDocument: (doc: unknown) => NodeJS.EventEmitter & { end: () => void };
};

type AuditContext = { ipAddress?: string; userAgent?: string };

export type DocState = 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' | 'PENDIENTE' | 'ARCHIVADO';

const DAY = 24 * 60 * 60 * 1000;
const WARNING_WINDOW_DAYS = 30;

/** Orden y textos de los grupos documentales (7 estándares de la Res. 3100 de 2019 + grupos de apoyo). */
const PILLARS: Array<{ key: DocumentPillar; label: string; description: string; isStandard: boolean }> = [
  {
    key: DocumentPillar.TALENTO_HUMANO,
    label: 'Talento humano',
    description: 'Hojas de vida, títulos, tarjetas profesionales, RETHUS, formación, inducción y contratos del personal.',
    isStandard: true,
  },
  {
    key: DocumentPillar.INFRAESTRUCTURA,
    label: 'Infraestructura',
    description: 'Planos, mantenimiento locativo, señalización, rutas de evacuación y certificados técnicos.',
    isStandard: true,
  },
  {
    key: DocumentPillar.DOTACION,
    label: 'Dotación',
    description: 'Inventario, hojas de vida de equipos, fichas técnicas, mantenimientos y calibraciones.',
    isStandard: true,
  },
  {
    key: DocumentPillar.MEDICAMENTOS_INSUMOS,
    label: 'Medicamentos, dispositivos médicos e insumos',
    description: 'Inventarios, almacenamiento, control de fechas, trazabilidad y soportes de proveedores.',
    isStandard: true,
  },
  {
    key: DocumentPillar.PROCESOS_PRIORITARIOS,
    label: 'Procesos prioritarios',
    description: 'Protocolos, guías, manuales, bioseguridad, limpieza y desinfección, seguridad del paciente y residuos.',
    isStandard: true,
  },
  {
    key: DocumentPillar.HISTORIA_CLINICA,
    label: 'Historia clínica y registros',
    description: 'Formatos de historia clínica, consentimientos, custodia, confidencialidad y conservación documental.',
    isStandard: true,
  },
  {
    key: DocumentPillar.INTERDEPENDENCIA,
    label: 'Interdependencia',
    description: 'Contratos, convenios y servicios de apoyo con terceros, y sus soportes de habilitación.',
    isStandard: true,
  },
  {
    key: DocumentPillar.DOCUMENTACION_LEGAL,
    label: 'Documentación legal',
    description: 'Documentos legales e institucionales del prestador.',
    isStandard: false,
  },
  {
    key: DocumentPillar.SG_SST,
    label: 'Seguridad y salud en el trabajo',
    description: 'Documentos del sistema de gestión de seguridad y salud en el trabajo.',
    isStandard: false,
  },
];
const PILLAR_LABEL = new Map(PILLARS.map((p) => [p.key, p.label]));

const STATE_LABEL: Record<DocState, string> = {
  VIGENTE: 'Vigente',
  POR_VENCER: 'Próximo a vencer',
  VENCIDO: 'Vencido',
  PENDIENTE: 'Pendiente de cargar',
  ARCHIVADO: 'Archivado',
};

/** Mismas reglas de escritura que el expediente: el consultorio solo gestiona Legal, Talento y uso de suelo / concepto sanitario. */
function clinicCanWrite(role: string, pillar: DocumentPillar, code: string) {
  if (role === UserRole.SUPER_ADMIN) return true;
  if (role !== UserRole.ADMIN && role !== UserRole.HEALTH_PROFESSIONAL) return false;
  const c = (code || '').toUpperCase();
  if (c.includes('USO_DEL_SUELO') || c.includes('USO_DE_SUELO') || c.includes('CONCEPTO_SANITARIO')) return true;
  return pillar === DocumentPillar.DOCUMENTACION_LEGAL || pillar === DocumentPillar.TALENTO_HUMANO;
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return '';
  return d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });
}

@Injectable()
export class HabilitationRegistryService {
  private readonly printer = new PdfPrinter({
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  });

  constructor(private readonly prisma: PrismaService) {}

  private scope(user: User, clinicId?: string) {
    if (user.role === UserRole.SUPER_ADMIN) {
      const id = clinicId?.trim();
      if (!id) throw new BadRequestException('Indique clinicId del consultorio a administrar');
      return id;
    }
    if (!user.clinicId) throw new ForbiddenException('Usuario sin consultorio asignado');
    return user.clinicId;
  }

  private assertSuperAdmin(user: User) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Solo el superadministrador puede administrar la estructura documental.');
    }
  }

  private audit(
    clinicId: string,
    user: User,
    action: AuditAction,
    entityId: string,
    context: AuditContext,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action,
        entityType: 'DocumentRequirement',
        entityId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  /** Registro documental plano del consultorio: alimenta tablero, estándares, tabla, vencimientos y lista maestra. */
  async registry(user: User, clinicIdParam?: string) {
    const clinicId = this.scope(user, clinicIdParam);
    const isSuper = user.role === UserRole.SUPER_ADMIN;
    const [clinic, requirements, categories] = await Promise.all([
      this.prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } }),
      this.prisma.documentRequirement.findMany({
        where: { clinicId, ...(isSuper ? {} : { isEnabled: true }) },
        include: {
          category: true,
          files: {
            orderBy: { version: 'desc' },
            select: {
              id: true,
              version: true,
              status: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
              expiresAt: true,
              issuedAt: true,
              changeReason: true,
              periodLabel: true,
              notes: true,
              createdAt: true,
              uploadedBy: { select: { fullName: true, role: true } },
            },
          },
        },
        orderBy: [{ category: { sortOrder: 'asc' } }, { code: 'asc' }],
      }),
      this.prisma.documentCategory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, code: true, name: true, pillar: true, sortOrder: true, isActive: true },
      }),
    ]);
    if (!clinic) throw new NotFoundException('Consultorio no encontrado');

    const now = Date.now();
    const documents = requirements.map((r) => {
      const active = r.files.filter((f) => f.status !== DocumentFileStatus.RETIRED);
      const current = active[0] ?? null;
      let expiresAt: Date | null = null;
      if (current) {
        expiresAt = current.expiresAt;
        if (!expiresAt && r.validityDays) expiresAt = new Date(current.createdAt.getTime() + r.validityDays * DAY);
      }
      const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - now) / DAY) : null;
      const window = r.validityDays ? Math.min(WARNING_WINDOW_DAYS, Math.ceil(r.validityDays / 4)) : WARNING_WINDOW_DAYS;
      let state: DocState;
      if (r.archivedAt) state = 'ARCHIVADO';
      else if (!current) state = 'PENDIENTE';
      else if (daysLeft !== null && daysLeft < 0) state = 'VENCIDO';
      else if (daysLeft !== null && daysLeft <= window) state = 'POR_VENCER';
      else state = 'VIGENTE';

      return {
        id: r.id,
        code: r.code,
        title: r.title,
        description: r.description,
        pillar: r.category.pillar,
        pillarLabel: PILLAR_LABEL.get(r.category.pillar) ?? r.category.pillar,
        categoryId: r.category.id,
        categoryName: r.category.name,
        responsibleName: r.responsibleName,
        responsibleArea: r.responsibleArea,
        validityDays: r.validityDays,
        isMandatory: r.isMandatory,
        isEnabled: r.isEnabled,
        archivedAt: r.archivedAt,
        state,
        stateLabel: STATE_LABEL[state],
        expiresAt,
        daysLeft,
        versionCount: r.files.length,
        activeFileCount: active.length,
        canEdit: clinicCanWrite(user.role, r.category.pillar, r.code),
        createdAt: r.createdAt,
        lastUpdate: current?.createdAt ?? null,
        current: current
          ? {
              id: current.id,
              version: current.version,
              originalName: current.originalName,
              mimeType: current.mimeType,
              sizeBytes: current.sizeBytes,
              issuedAt: current.issuedAt,
              changeReason: current.changeReason,
              periodLabel: current.periodLabel,
              notes: current.notes,
              uploadedBy: uploaderLabel(current.uploadedBy),
              createdAt: current.createdAt,
            }
          : null,
      };
    });

    return {
      clinic,
      generatedAt: new Date(),
      canManage: isSuper,
      pillars: PILLARS,
      categories,
      documents,
    };
  }

  /** Actividad documental real (auditoría). Si se indica requirementId, solo la de ese documento. */
  async activity(user: User, clinicIdParam?: string, requirementId?: string, limitParam?: string) {
    const clinicId = this.scope(user, clinicIdParam);
    const limit = Math.min(Math.max(Number(limitParam) || 20, 1), 100);

    let where: Prisma.AuditLogWhereInput = {
      clinicId,
      entityType: { in: ['DocumentFile', 'DocumentRequirement'] },
      action: { not: AuditAction.VIEW },
    };
    if (requirementId) {
      const req = await this.prisma.documentRequirement.findFirst({
        where: { id: requirementId, clinicId },
        select: { id: true, code: true, files: { select: { id: true } } },
      });
      if (!req) throw new NotFoundException('Documento no encontrado');
      where = {
        ...where,
        OR: [
          { entityId: req.id },
          { entityId: { in: req.files.map((f) => f.id) } },
          { metadata: { path: ['requirementCode'], equals: req.code } },
        ],
      };
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        user: { select: { fullName: true, role: true } },
      },
    });

    const codes = new Set<string>();
    for (const r of rows) {
      const code = (r.metadata as Record<string, unknown> | null)?.requirementCode;
      if (typeof code === 'string') codes.add(code);
    }
    const reqs = await this.prisma.documentRequirement.findMany({
      where: { clinicId, OR: [{ code: { in: [...codes] } }, { id: { in: rows.map((r) => r.entityId || '') } }] },
      select: { id: true, code: true, title: true },
    });
    const byCode = new Map(reqs.map((r) => [r.code, r]));
    const byId = new Map(reqs.map((r) => [r.id, r]));

    return rows.map((r) => {
      const m = (r.metadata as Record<string, unknown> | null) ?? {};
      const req =
        (typeof m.requirementCode === 'string' ? byCode.get(m.requirementCode) : undefined) ??
        (r.entityId ? byId.get(r.entityId) : undefined);
      return {
        id: r.id,
        at: r.createdAt,
        user: uploaderLabel(r.user),
        requirementId: req?.id ?? null,
        documentTitle: req?.title ?? (typeof m.title === 'string' ? m.title : null),
        version: typeof m.version === 'number' ? m.version : null,
        description: this.describe(r.action, r.entityType, m),
      };
    });
  }

  private describe(action: AuditAction, entityType: string, m: Record<string, unknown>) {
    if (entityType === 'DocumentRequirement') {
      switch (m.kind) {
        case 'created':
          return 'Se creó el registro documental';
        case 'archived':
          return 'Documento archivado';
        case 'restored':
          return 'Documento restaurado del archivo';
        default:
          return 'Se actualizaron los datos del documento';
      }
    }
    switch (action) {
      case AuditAction.UPLOAD:
        return typeof m.version === 'number' && m.version > 1
          ? `Se cargó la versión ${m.version}`
          : 'Se cargó el documento';
      case AuditAction.DOWNLOAD:
        return 'Se descargó el documento';
      case AuditAction.SIGN:
        return 'Se firmó el documento';
      case AuditAction.CREATE:
        return 'Se diligenció el documento';
      case AuditAction.UPDATE: {
        if (m.archived) return `Versión ${m.version ?? ''} archivada`.replace('  ', ' ');
        if (m.permanent || m.deleted) return 'Versión eliminada definitivamente';
        const meta = (m.meta as Record<string, unknown> | undefined) ?? {};
        if (meta.expiresAt !== undefined) return 'Se actualizó la fecha de vencimiento';
        return 'Se actualizaron los metadatos de la versión';
      }
      default:
        return 'Movimiento documental';
    }
  }

  private async loadRequirement(user: User, clinicId: string, id: string) {
    const req = await this.prisma.documentRequirement.findFirst({
      where: { id, clinicId },
      include: { category: true },
    });
    if (!req) throw new NotFoundException('Documento no encontrado');
    if (!clinicCanWrite(user.role, req.category.pillar, req.code)) {
      throw new ForbiddenException(
        'Solo puede modificar Documentación legal, Talento humano, uso de suelo y concepto sanitario.',
      );
    }
    return req;
  }

  /** Crea un documento (con o sin archivo): sin archivo queda "Pendiente de cargar". */
  async createDocument(
    user: User,
    dto: {
      categoryId: string;
      title: string;
      code?: string;
      description?: string;
      responsibleName?: string;
      responsibleArea?: string;
      validityDays?: number;
      isMandatory?: boolean;
    },
    context: AuditContext,
    clinicIdParam?: string,
  ) {
    this.assertSuperAdmin(user);
    const clinicId = this.scope(user, clinicIdParam);
    const category = await this.prisma.documentCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Tipo documental no encontrado');
    if (!category.isActive) throw new BadRequestException('Este tipo documental está desactivado.');

    let code = (dto.code || '').trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_.-]/g, '');
    if (!code) {
      const prefix = category.code.replace(/^\d+_/, '').slice(0, 12) || 'DOC';
      const count = await this.prisma.documentRequirement.count({ where: { clinicId, categoryId: category.id } });
      let n = count + 1;
      do {
        code = `${prefix}-${String(n).padStart(3, '0')}`;
        n++;
      } while (await this.prisma.documentRequirement.findFirst({ where: { clinicId, code }, select: { id: true } }));
    } else if (await this.prisma.documentRequirement.findFirst({ where: { clinicId, code }, select: { id: true } })) {
      throw new ConflictException(`Ya existe un documento con el código ${code} en este consultorio.`);
    }

    const created = await this.prisma.documentRequirement.create({
      data: {
        clinicId,
        categoryId: category.id,
        code,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        responsibleName: dto.responsibleName?.trim() || null,
        responsibleArea: dto.responsibleArea?.trim() || null,
        validityDays: dto.validityDays && dto.validityDays > 0 ? Math.round(dto.validityDays) : null,
        isMandatory: dto.isMandatory !== false,
        isEnabled: true,
      },
    });
    await this.audit(clinicId, user, AuditAction.CREATE, created.id, context, {
      kind: 'created',
      requirementCode: code,
      title: created.title,
    });
    return { id: created.id, code };
  }

  async updateDocument(
    user: User,
    id: string,
    dto: {
      title?: string;
      code?: string;
      description?: string;
      categoryId?: string;
      responsibleName?: string;
      responsibleArea?: string;
      validityDays?: number | null;
    },
    context: AuditContext,
    clinicIdParam?: string,
  ) {
    const clinicId = this.scope(user, clinicIdParam);
    const req = await this.loadRequirement(user, clinicId, id);
    const isSuper = user.role === UserRole.SUPER_ADMIN;
    const data: Prisma.DocumentRequirementUpdateInput = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const set = <K extends keyof typeof req>(key: K, value: (typeof req)[K]) => {
      if (value === req[key]) return;
      changes[key as string] = { from: req[key], to: value };
      (data as Record<string, unknown>)[key as string] = value;
    };

    if (dto.title !== undefined) {
      const t = dto.title.trim();
      if (t.length < 2) throw new BadRequestException('El nombre del documento es obligatorio.');
      set('title', t);
    }
    if (dto.description !== undefined) set('description', dto.description.trim() || null);
    if (dto.responsibleName !== undefined) set('responsibleName', dto.responsibleName.trim() || null);
    if (dto.responsibleArea !== undefined) set('responsibleArea', dto.responsibleArea.trim() || null);
    if (dto.validityDays !== undefined) {
      set('validityDays', dto.validityDays && dto.validityDays > 0 ? Math.round(dto.validityDays) : null);
    }
    // Código y tipo documental definen la estructura: solo superadmin.
    if (isSuper && dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_.-]/g, '');
      if (code.length < 2) throw new BadRequestException('Código inválido.');
      if (code !== req.code) {
        const clash = await this.prisma.documentRequirement.findFirst({ where: { clinicId, code }, select: { id: true } });
        if (clash) throw new ConflictException(`Ya existe un documento con el código ${code}.`);
        set('code', code);
      }
    }
    if (isSuper && dto.categoryId !== undefined && dto.categoryId !== req.categoryId) {
      const category = await this.prisma.documentCategory.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Tipo documental no encontrado');
      changes.categoryId = { from: req.categoryId, to: category.id };
      data.category = { connect: { id: category.id } };
    }

    if (!Object.keys(changes).length) return { id: req.id, changed: false };
    await this.prisma.documentRequirement.update({ where: { id: req.id }, data });
    await this.audit(clinicId, user, AuditAction.UPDATE, req.id, context, {
      kind: 'meta',
      requirementCode: (changes.code?.to as string) ?? req.code,
      changes,
    });
    return { id: req.id, changed: true };
  }

  async setArchived(user: User, id: string, archived: boolean, context: AuditContext, clinicIdParam?: string) {
    const clinicId = this.scope(user, clinicIdParam);
    const req = await this.loadRequirement(user, clinicId, id);
    if (!!req.archivedAt === archived) return { id: req.id, archivedAt: req.archivedAt };
    const updated = await this.prisma.documentRequirement.update({
      where: { id: req.id },
      data: { archivedAt: archived ? new Date() : null },
    });
    await this.audit(clinicId, user, AuditAction.UPDATE, req.id, context, {
      kind: archived ? 'archived' : 'restored',
      requirementCode: req.code,
    });
    return { id: req.id, archivedAt: updated.archivedAt };
  }

  /** Tipos documentales (catálogo global): solo superadmin. */
  async listCategories(user: User) {
    this.assertSuperAdmin(user);
    const rows = await this.prisma.documentCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        pillar: true,
        sortOrder: true,
        isActive: true,
        _count: { select: { requirements: true } },
      },
    });
    return rows.map(({ _count, ...c }) => ({ ...c, documentCount: _count.requirements }));
  }

  async createCategory(user: User, dto: { name: string; pillar: DocumentPillar; code?: string }) {
    this.assertSuperAdmin(user);
    const name = dto.name.trim();
    if (name.length < 2) throw new BadRequestException('El nombre del tipo documental es obligatorio.');
    const base = (dto.code || name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 34);
    let code = `TD_${base}`.slice(0, 40);
    let n = 2;
    while (await this.prisma.documentCategory.findUnique({ where: { code }, select: { id: true } })) {
      code = `TD_${base}`.slice(0, 36) + `_${n++}`;
    }
    const last = await this.prisma.documentCategory.findFirst({
      where: { pillar: dto.pillar },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.documentCategory.create({
      data: { code, name, pillar: dto.pillar, sortOrder: (last?.sortOrder ?? 0) + 1 },
    });
  }

  async updateCategory(user: User, id: string, dto: { name?: string; pillar?: DocumentPillar; isActive?: boolean }) {
    this.assertSuperAdmin(user);
    const cat = await this.prisma.documentCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Tipo documental no encontrado');
    const name = dto.name?.trim();
    if (name !== undefined && name.length < 2) throw new BadRequestException('El nombre es obligatorio.');
    return this.prisma.documentCategory.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(dto.pillar ? { pillar: dto.pillar } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /** Lista maestra en Excel o PDF (solo metadatos, nunca el contenido de los archivos). */
  async exportMasterList(user: User, format: 'xlsx' | 'pdf', clinicIdParam?: string, includeArchived = false) {
    const data = await this.registry(user, clinicIdParam);
    const docs = data.documents.filter((d) => d.isEnabled && (includeArchived || d.state !== 'ARCHIVADO'));
    const header = [
      'Código',
      'Nombre',
      'Estándar',
      'Categoría',
      'Versión',
      'Fecha de aprobación',
      'Vigencia',
      'Responsable',
      'Área',
      'Estado',
      'Ubicación digital',
      'Observaciones',
    ];
    const rows = docs.map((d) => [
      d.code,
      d.title,
      d.pillarLabel,
      d.categoryName,
      d.current ? `v${d.current.version}` : '',
      fmtDate(d.current?.issuedAt ?? d.current?.createdAt ?? null),
      d.expiresAt ? fmtDate(d.expiresAt) : d.current ? 'Sin vencimiento' : '',
      d.responsibleName ?? '',
      d.responsibleArea ?? '',
      d.stateLabel,
      d.current ? `Habilitación / ${d.pillarLabel} / ${d.categoryName} / ${d.current.originalName}` : 'Sin archivo',
      d.current?.notes ?? '',
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    const safeClinic = data.clinic.name.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40);

    if (format === 'xlsx') {
      const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
      sheet['!cols'] = [14, 42, 26, 30, 8, 14, 14, 24, 20, 18, 60, 40].map((wch) => ({ wch }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Lista maestra');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      return new StreamableFile(buffer, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        disposition: `attachment; filename="Lista_maestra_${safeClinic}_${stamp}.xlsx"`,
      });
    }

    const NAVY = '#183642';
    const MUTED = '#6E7375';
    const pdfHeader = ['Código', 'Nombre', 'Estándar', 'Categoría', 'Versión', 'Aprobación', 'Vigencia', 'Responsable', 'Estado'];
    const body: Content[][] = [
      pdfHeader.map((h) => ({ text: h, bold: true, color: '#FFFFFF', fillColor: NAVY, fontSize: 7.5 })),
      ...rows.map((r) =>
        [r[0], r[1], r[2], r[3], r[4], r[5], r[6], [r[7], r[8]].filter(Boolean).join(' · '), r[9]].map((v, i) => ({
          text: String(v || '—'),
          fontSize: i === 0 ? 6.3 : 7,
        })),
      ),
    ];
    const doc: TDocumentDefinitions = {
      pageSize: 'LETTER',
      pageOrientation: 'landscape',
      pageMargins: [28, 54, 28, 36],
      defaultStyle: { font: 'Helvetica', color: '#20272C' },
      header: {
        margin: [28, 20, 28, 0],
        columns: [
          { text: 'LISTA MAESTRA DOCUMENTAL DE HABILITACIÓN', bold: true, color: NAVY, fontSize: 11 },
          { text: `${data.clinic.name} · ${fmtDate(new Date())}`, alignment: 'right', color: MUTED, fontSize: 8 },
        ],
      },
      footer: (page: number, pages: number) => ({
        margin: [28, 10, 28, 0],
        columns: [
          { text: `${docs.length} documentos`, color: MUTED, fontSize: 7 },
          { text: `Página ${page} de ${pages}`, alignment: 'right', color: MUTED, fontSize: 7 },
        ],
      }),
      content: [
        {
          table: { headerRows: 1, widths: [104, '*', 70, 74, 30, 46, 50, 70, 54], body },
          layout: {
            hLineColor: () => '#E6DFD8',
            vLineColor: () => '#E6DFD8',
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            fillColor: (i: number) => (i > 0 && i % 2 === 0 ? '#F7F6F3' : null),
          },
        },
      ],
    };
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const pdf = this.printer.createPdfKitDocument(doc);
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', (e: Error) => reject(e));
      pdf.end();
    });
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="Lista_maestra_${safeClinic}_${stamp}.pdf"`,
    });
  }
}
