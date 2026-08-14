import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import {
  AuditAction,
  DocumentFileStatus,
  DocumentPillar,
  DocumentSignerRole,
  Prisma,
} from '@prisma/client';
import { extname } from 'path';
import { UserRole } from '../../common/enums';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import { ClinicalStorageService } from '../clinical/clinical-storage.service';
import { SignDocumentDto, UpdateDocumentMetaDto } from './dto/document.dto';
import { FillSgsstDto } from './dto/fill-sgsst.dto';
import { FillTrainingActaDto } from './dto/fill-training-acta.dto';
import { SgsstFillPdfService } from './sgsst-fill-pdf.service';

export type ComplianceStatus = 'GREEN' | 'YELLOW' | 'RED' | 'OPTIONAL';

const WARNING_WINDOW_DAYS = 30;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const GENERAL_SIGNER_ROLES: DocumentSignerRole[] = [
  DocumentSignerRole.ELABORO,
  DocumentSignerRole.REVISO,
  DocumentSignerRole.APROBO,
];

const TRAINING_SIGNER_ROLES: DocumentSignerRole[] = [
  DocumentSignerRole.CAPACITADOR,
  DocumentSignerRole.ASISTENTE,
];

/** Doble sello obligatorio: primero HABILISALUD, luego admin del consultorio. */
const APPROVAL_ROLES: DocumentSignerRole[] = [
  DocumentSignerRole.HABILISALUD,
  DocumentSignerRole.CLINIC_ADMIN,
];

/** Firmas de contenido del PDF (SG-SST / actas). */
function contentRoles(requirementCode: string): DocumentSignerRole[] {
  if (
    requirementCode === 'SST_ACTAS_CAPACITACION' ||
    requirementCode === 'SST_PAUSAS_ACTIVAS'
  ) {
    return TRAINING_SIGNER_ROLES;
  }
  return GENERAL_SIGNER_ROLES;
}

/** @deprecated alias — prefer contentRoles / APPROVAL_ROLES */
function requiredRoles(requirementCode: string): DocumentSignerRole[] {
  return contentRoles(requirementCode);
}

function hasRole(
  signatures: { role: DocumentSignerRole }[],
  role: DocumentSignerRole,
) {
  return signatures.some((s) => s.role === role);
}

function approvalStatus(
  signatures: { role: DocumentSignerRole }[],
): DocumentFileStatus {
  const hasH = hasRole(signatures, DocumentSignerRole.HABILISALUD);
  const hasC = hasRole(signatures, DocumentSignerRole.CLINIC_ADMIN);
  if (hasH && hasC) return DocumentFileStatus.SIGNED;
  if (hasH || hasC || signatures.length > 0) {
    return DocumentFileStatus.PARTIALLY_SIGNED;
  }
  return DocumentFileStatus.PENDING_SIGNATURE;
}

/** Todo el pilar SG-SST se puede diligenciar y firmar con imagen. */
function isSgsstFillable(requirementCode: string, pillar: DocumentPillar) {
  return pillar === DocumentPillar.SG_SST || requirementCode.startsWith('SST_');
}

function isTrainingDoc(requirementCode: string) {
  return (
    requirementCode === 'SST_ACTAS_CAPACITACION' ||
    requirementCode === 'SST_PAUSAS_ACTIVAS'
  );
}

function warningWindow(validityDays: number | null) {
  if (!validityDays) return WARNING_WINDOW_DAYS;
  return Math.min(WARNING_WINDOW_DAYS, Math.ceil(validityDays / 4));
}

const PILLAR_LABELS: Record<DocumentPillar, string> = {
  DOCUMENTACION_LEGAL: 'Documentación legal',
  TALENTO_HUMANO: 'Talento humano',
  INFRAESTRUCTURA: 'Infraestructura',
  DOTACION: 'Dotación',
  MEDICAMENTOS_INSUMOS: 'Medicamentos e insumos',
  PROCESOS_PRIORITARIOS: 'Procesos prioritarios',
  HISTORIA_CLINICA: 'Historia clínica',
  INTERDEPENDENCIA: 'Interdependencia',
  SG_SST: 'Seguridad y salud en el trabajo',
};

const PILLAR_ORDER: DocumentPillar[] = [
  DocumentPillar.DOCUMENTACION_LEGAL,
  DocumentPillar.TALENTO_HUMANO,
  DocumentPillar.INFRAESTRUCTURA,
  DocumentPillar.DOTACION,
  DocumentPillar.MEDICAMENTOS_INSUMOS,
  DocumentPillar.PROCESOS_PRIORITARIOS,
  DocumentPillar.HISTORIA_CLINICA,
  DocumentPillar.INTERDEPENDENCIA,
  DocumentPillar.SG_SST,
];

type AuditContext = { ipAddress?: string; userAgent?: string };

const fileInclude = {
  uploadedBy: { select: { id: true, fullName: true } },
  signatures: {
    orderBy: { signedAt: 'asc' as const },
    include: { signerUser: { select: { id: true, fullName: true } } },
  },
};

type FileRow = Prisma.DocumentFileGetPayload<{ include: typeof fileInclude }>;

type RequirementWithFiles = Prisma.DocumentRequirementGetPayload<{
  include: {
    category: true;
    files: { include: typeof fileInclude };
  };
}>;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ClinicalStorageService,
    private readonly sgsstFillPdf: SgsstFillPdfService,
  ) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  /**
   * Superadmin opera sobre un consultorio vía ?clinicId=…
   * Admin/profesional del consultorio usan su clinicId del JWT.
   */
  private clinicScope(user: User, clinicId?: string) {
    if (user.role === UserRole.SUPER_ADMIN) {
      const id = clinicId?.trim();
      if (!id) {
        throw new BadRequestException(
          'Indique clinicId del consultorio a administrar',
        );
      }
      return id;
    }
    return this.requireClinicId(user);
  }

  /** Solo HABILISALUD (superadmin) habilita, retira o descarga. */
  private assertDocumentWriter(user: User) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Solo el superadministrador puede habilitar, retirar o descargar estos documentos.',
      );
    }
  }

  /** Cargar archivos: superadmin o admin del consultorio (sin descarga). */
  private assertDocumentUploader(user: User) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Solo el superadministrador o el administrador del consultorio pueden cargar documentos.',
      );
    }
  }

  /** Diligenciar SG-SST: superadmin o admin del consultorio. */
  private assertDocumentFiller(user: User) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Solo el superadministrador o el administrador del consultorio pueden diligenciar.',
      );
    }
  }

  private assertClinicCountersigner(user: User) {
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.HEALTH_PROFESSIONAL
    ) {
      throw new ForbiddenException(
        'Solo el administrador o profesional del consultorio puede firmar la contraparte.',
      );
    }
  }

  private expiryOf(
    file: { expiresAt: Date | null; createdAt: Date },
    validityDays: number | null,
  ): Date | null {
    if (file.expiresAt) return file.expiresAt;
    if (!validityDays) return null;
    const derived = new Date(file.createdAt);
    derived.setDate(derived.getDate() + validityDays);
    return derived;
  }

  /** Solo versiones activas (el histórico retirado no cuenta para el semáforo). */
  private activeFiles(files: FileRow[]) {
    return files
      .filter((f) => f.status !== DocumentFileStatus.RETIRED)
      .sort((a, b) => b.version - a.version);
  }

  private serializeFile(
    file: FileRow,
    validityDays: number | null,
    requirementCode: string,
    pillar: DocumentPillar,
  ) {
    const signedRoles = new Set(file.signatures.map((s) => s.role));
    const content = contentRoles(requirementCode);
    const hasHabilisalud = signedRoles.has(DocumentSignerRole.HABILISALUD);
    const hasClinicAdmin = signedRoles.has(DocumentSignerRole.CLINIC_ADMIN);
    return {
      id: file.id,
      version: file.version,
      periodLabel: file.periodLabel,
      status: file.status,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      checksum: file.checksum,
      expiresAt: this.expiryOf(file, validityDays),
      notes: file.notes,
      formData: file.formData,
      retiredAt: file.retiredAt,
      createdAt: file.createdAt,
      uploadedBy: file.uploadedBy?.fullName ?? null,
      /** Roles del sello dual (UI de firma). */
      requiredRoles: APPROVAL_ROLES,
      contentRoles: content,
      fillable: isSgsstFillable(requirementCode, pillar),
      fillableTraining: isTrainingDoc(requirementCode),
      hasHabilisaludSignature: hasHabilisalud,
      hasClinicAdminSignature: hasClinicAdmin,
      /** El consultorio solo puede firmar tras el sello de HABILISALUD. */
      canClinicSign:
        hasHabilisalud &&
        !hasClinicAdmin &&
        file.status !== DocumentFileStatus.RETIRED,
      awaitingClinicSignature:
        hasHabilisalud &&
        !hasClinicAdmin &&
        file.status !== DocumentFileStatus.RETIRED,
      canPreview:
        file.mimeType.startsWith('image/') ||
        file.mimeType === 'application/pdf' ||
        file.mimeType.includes('word') ||
        file.originalName.toLowerCase().endsWith('.docx') ||
        file.originalName.toLowerCase().endsWith('.doc'),
      signatures: file.signatures.map((s) => ({
        id: s.id,
        role: s.role,
        signerName: s.signerName,
        signedAt: s.signedAt,
        signatureBase64: s.signatureBase64,
      })),
      missingRoles: APPROVAL_ROLES.filter((role) => !signedRoles.has(role)),
    };
  }

  /**
   * Semáforo:
   * - Sin evidencia → RED / OPTIONAL
   * - Con evidencia sin firmar o parcialmente firmada → YELLOW
   * - Firmada y vigente → GREEN
   * - Firmada y vencida → RED
   */
  private statusOf(requirement: RequirementWithFiles, now: Date) {
    const latest = this.activeFiles(requirement.files)[0] ?? null;

    if (!latest) {
      return {
        status: (requirement.isMandatory ? 'RED' : 'OPTIONAL') as ComplianceStatus,
        expiresAt: null,
        daysToExpiry: null,
      };
    }

    const expiresAt = this.expiryOf(latest, requirement.validityDays);
    const daysToExpiry = expiresAt
      ? Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : null;

    if (latest.status !== DocumentFileStatus.SIGNED) {
      return {
        status: 'YELLOW' as ComplianceStatus,
        expiresAt,
        daysToExpiry,
      };
    }

    if (daysToExpiry !== null && daysToExpiry < 0) {
      return { status: 'RED' as ComplianceStatus, expiresAt, daysToExpiry };
    }
    if (
      daysToExpiry !== null &&
      daysToExpiry <= warningWindow(requirement.validityDays)
    ) {
      return { status: 'YELLOW' as ComplianceStatus, expiresAt, daysToExpiry };
    }
    return { status: 'GREEN' as ComplianceStatus, expiresAt, daysToExpiry };
  }

  /**
   * Periodo YYYY-MM: usa periodLabel si es válido; si no, mes de la última firma
   * o de la creación (para auditoría mensual).
   */
  private archivePeriodKey(file: {
    periodLabel: string | null;
    createdAt: Date;
    signatures: { signedAt: Date }[];
  }) {
    const label = file.periodLabel?.trim() ?? '';
    const match = label.match(/^(\d{4}-\d{2})/);
    if (match) return match[1];
    const ref =
      file.signatures.length > 0
        ? file.signatures[file.signatures.length - 1].signedAt
        : file.createdAt;
    const y = ref.getFullYear();
    const m = String(ref.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  private periodDisplayLabel(period: string) {
    const [ys, ms] = period.split('-');
    const y = Number(ys);
    const m = Number(ms);
    if (!y || !m || m < 1 || m > 12) return period;
    const names = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ];
    return `${names[m - 1]} ${y}`;
  }

  /**
   * Histórico mensual de documentos firmados (auditoría).
   * Incluye SIGNED y RETIRED con firmas (el retiro no borra evidencia).
   */
  async signedArchive(user: User, period?: string, clinicIdParam?: string) {
    const clinicId = this.clinicScope(user, clinicIdParam);
    const selected =
      period && /^\d{4}-\d{2}$/.test(period.trim()) ? period.trim() : null;

    const files = await this.prisma.documentFile.findMany({
      where: {
        requirement: { clinicId },
        OR: [
          { status: DocumentFileStatus.SIGNED },
          {
            status: DocumentFileStatus.RETIRED,
            signatures: { some: {} },
          },
        ],
      },
      include: {
        ...fileInclude,
        requirement: {
          include: {
            category: { select: { name: true, pillar: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const monthCounts = new Map<string, number>();
    const byPeriod: typeof files = [];

    for (const file of files) {
      const key = this.archivePeriodKey(file);
      monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
      if (selected && key === selected) byPeriod.push(file);
    }

    const months = [...monthCounts.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([p, count]) => ({
        period: p,
        label: this.periodDisplayLabel(p),
        count,
      }));

    const activePeriod =
      selected ?? months[0]?.period ?? new Date().toISOString().slice(0, 7);

    const periodFiles =
      selected || !months.length
        ? byPeriod
        : files.filter((f) => this.archivePeriodKey(f) === activePeriod);

    return {
      generatedAt: new Date().toISOString(),
      months,
      selectedPeriod: activePeriod,
      selectedLabel: this.periodDisplayLabel(activePeriod),
      totalSigned: files.length,
      files: periodFiles.map((file) => {
        const pillar = file.requirement.category.pillar;
        const serialized = this.serializeFile(
          file,
          file.requirement.validityDays,
          file.requirement.code,
          pillar,
        );
        return {
          ...serialized,
          requirementId: file.requirement.id,
          requirementCode: file.requirement.code,
          requirementTitle: file.requirement.title,
          category: file.requirement.category.name,
          pillar,
          pillarLabel: PILLAR_LABELS[pillar],
        };
      }),
    };
  }

  async overview(user: User, pillar?: DocumentPillar, clinicIdParam?: string) {
    const clinicId = this.clinicScope(user, clinicIdParam);
    const now = new Date();

    const requirements = await this.prisma.documentRequirement.findMany({
      where: { clinicId, ...(pillar ? { category: { pillar } } : {}) },
      include: {
        category: true,
        files: {
          orderBy: { version: 'desc' },
          include: fileInclude,
        },
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { code: 'asc' }],
    });

    const byPillar = new Map<
      DocumentPillar,
      {
        pillar: DocumentPillar;
        label: string;
        categories: Map<string, ReturnType<DocumentsService['emptyCategory']>>;
      }
    >();

    for (const requirement of requirements) {
      const { status, expiresAt, daysToExpiry } = this.statusOf(requirement, now);
      const key = requirement.category.pillar;
      if (!byPillar.has(key)) {
        byPillar.set(key, {
          pillar: key,
          label: PILLAR_LABELS[key],
          categories: new Map(),
        });
      }
      const pillarNode = byPillar.get(key)!;
      if (!pillarNode.categories.has(requirement.categoryId)) {
        pillarNode.categories.set(
          requirement.categoryId,
          this.emptyCategory(requirement.category),
        );
      }
      const categoryNode = pillarNode.categories.get(requirement.categoryId)!;
      const active = this.activeFiles(requirement.files);
      const latest = active[0] ?? null;

      categoryNode.requirements.push({
        id: requirement.id,
        code: requirement.code,
        title: requirement.title,
        description: requirement.description,
        isMandatory: requirement.isMandatory,
        isEnabled: requirement.isEnabled,
        validityDays: requirement.validityDays,
        status,
        expiresAt,
        daysToExpiry,
        fileCount: active.length,
        latestFile: latest
          ? this.serializeFile(
              latest,
              requirement.validityDays,
              requirement.code,
              requirement.category.pillar,
            )
          : null,
        fillable: isSgsstFillable(requirement.code, requirement.category.pillar),
        fillableTraining: isTrainingDoc(requirement.code),
        requiredRoles: APPROVAL_ROLES,
        contentRoles: contentRoles(requirement.code),
        hasHabilisaludSignature: !!latest &&
          latest.signatures.some((s) => s.role === DocumentSignerRole.HABILISALUD),
        awaitingClinicSignature: !!latest &&
          latest.signatures.some((s) => s.role === DocumentSignerRole.HABILISALUD) &&
          !latest.signatures.some((s) => s.role === DocumentSignerRole.CLINIC_ADMIN) &&
          latest.status !== DocumentFileStatus.RETIRED,
        canClinicSign: !!latest &&
          latest.signatures.some((s) => s.role === DocumentSignerRole.HABILISALUD) &&
          !latest.signatures.some((s) => s.role === DocumentSignerRole.CLINIC_ADMIN) &&
          latest.status !== DocumentFileStatus.RETIRED,
      });
    }

    const pillars = PILLAR_ORDER.filter((p) => byPillar.has(p)).map((p) => {
      const node = byPillar.get(p)!;
      const categories = [...node.categories.values()];
      const all = categories.flatMap((c) => c.requirements);
      return {
        pillar: node.pillar,
        label: node.label,
        categories: categories.map((c) => ({
          ...c,
          summary: this.summarize(c.requirements),
        })),
        summary: this.summarize(all),
      };
    });

    const pendingCountersignatures = this.collectPendingCountersign(requirements);

    return {
      generatedAt: now,
      pillars,
      summary: this.summarize(
        pillars.flatMap((p) => p.categories.flatMap((c) => c.requirements)),
      ),
      pendingCountersignatures,
    };
  }

  private collectPendingCountersign(
    requirements: Array<{
      id: string;
      code: string;
      title: string;
      isEnabled: boolean;
      files: FileRow[];
    }>,
  ) {
    const pending: Array<{
      fileId: string;
      requirementId: string;
      requirementCode: string;
      requirementTitle: string;
      version: number;
      originalName: string;
      habilisaludSignerName: string;
      habilisaludSignedAt: Date;
      message: string;
    }> = [];

    for (const requirement of requirements) {
      if (!requirement.isEnabled) continue;
      for (const file of this.activeFiles(requirement.files)) {
        const h = file.signatures.find(
          (s) => s.role === DocumentSignerRole.HABILISALUD,
        );
        const c = file.signatures.find(
          (s) => s.role === DocumentSignerRole.CLINIC_ADMIN,
        );
        if (!h || c) continue;
        pending.push({
          fileId: file.id,
          requirementId: requirement.id,
          requirementCode: requirement.code,
          requirementTitle: requirement.title,
          version: file.version,
          originalName: file.originalName,
          habilisaludSignerName: h.signerName,
          habilisaludSignedAt: h.signedAt,
          message: `HABILISALUD ya firmó «${requirement.title}» (v${file.version}). Debe firmar la contraparte desde gestión documental.`,
        });
      }
    }

    return pending.sort(
      (a, b) =>
        b.habilisaludSignedAt.getTime() - a.habilisaludSignedAt.getTime(),
    );
  }

  private emptyCategory(category: { id: string; code: string; name: string }) {
    return {
      id: category.id,
      code: category.code,
      name: category.name,
      requirements: [] as Array<{
        id: string;
        code: string;
        title: string;
        description: string | null;
        isMandatory: boolean;
        isEnabled: boolean;
        validityDays: number | null;
        status: ComplianceStatus;
        expiresAt: Date | null;
        daysToExpiry: number | null;
        fileCount: number;
        latestFile: unknown;
        fillable: boolean;
        fillableTraining: boolean;
        requiredRoles: DocumentSignerRole[];
        contentRoles: DocumentSignerRole[];
        hasHabilisaludSignature: boolean;
        awaitingClinicSignature: boolean;
        canClinicSign: boolean;
      }>,
    };
  }

  private summarize(requirements: Array<{ status: ComplianceStatus }>) {
    const counts = { green: 0, yellow: 0, red: 0, optional: 0 };
    for (const r of requirements) {
      if (r.status === 'GREEN') counts.green += 1;
      else if (r.status === 'YELLOW') counts.yellow += 1;
      else if (r.status === 'RED') counts.red += 1;
      else counts.optional += 1;
    }
    const tracked = counts.green + counts.yellow + counts.red;
    return {
      ...counts,
      total: requirements.length,
      // Solo lo firmado y vigente cuenta como cumplimiento.
      compliance: tracked ? Math.round((counts.green / tracked) * 100) : 100,
      status: (counts.red ? 'RED' : counts.yellow ? 'YELLOW' : 'GREEN') as ComplianceStatus,
    };
  }

  async listFiles(user: User, requirementId: string, clinicIdParam?: string) {
    const clinicId = this.clinicScope(user, clinicIdParam);
    const requirement = await this.prisma.documentRequirement.findFirst({
      where: { id: requirementId, clinicId },
      include: {
        category: true,
        files: {
          orderBy: { version: 'desc' },
          include: fileInclude,
        },
      },
    });
    if (!requirement) throw new NotFoundException('Requisito no encontrado');

    const now = new Date();
    return {
      requirement: {
        id: requirement.id,
        code: requirement.code,
        title: requirement.title,
        description: requirement.description,
        isMandatory: requirement.isMandatory,
        validityDays: requirement.validityDays,
        category: requirement.category.name,
        pillar: requirement.category.pillar,
      },
      ...this.statusOf(requirement, now),
      fillable: isSgsstFillable(requirement.code, requirement.category.pillar),
      fillableTraining: isTrainingDoc(requirement.code),
      requiredRoles: APPROVAL_ROLES,
      contentRoles: contentRoles(requirement.code),
      files: requirement.files.map((file) =>
        this.serializeFile(
          file,
          requirement.validityDays,
          requirement.code,
          requirement.category.pillar,
        ),
      ),
    };
  }

  async getFile(user: User, fileId: string, clinicIdParam?: string) {
    const clinicId = this.clinicScope(user, clinicIdParam);
    const file = await this.prisma.documentFile.findFirst({
      where: { id: fileId, requirement: { clinicId } },
      include: {
        ...fileInclude,
        requirement: { include: { category: true } },
      },
    });
    if (!file) throw new NotFoundException('Documento no encontrado');
    return {
      requirement: {
        id: file.requirement.id,
        code: file.requirement.code,
        title: file.requirement.title,
        pillar: file.requirement.category.pillar,
        category: file.requirement.category.name,
      },
      file: this.serializeFile(
        file,
        file.requirement.validityDays,
        file.requirement.code,
        file.requirement.category.pillar,
      ),
    };
  }

  async upload(
    user: User,
    requirementId: string,
    file: Express.Multer.File,
    meta: { expiresAt?: string; periodLabel?: string; notes?: string },
    context: AuditContext,
    clinicIdParam?: string,
  ) {
    this.assertDocumentUploader(user);
    const clinicId = this.clinicScope(user, clinicIdParam);
    if (!file?.buffer?.length) throw new BadRequestException('Archivo requerido');
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('El archivo supera los 25 MB permitidos');
    }

    const requirement = await this.prisma.documentRequirement.findFirst({
      where: { id: requirementId, clinicId },
      include: { category: true },
    });
    if (!requirement) throw new NotFoundException('Requisito no encontrado');
    if (requirement.isEnabled === false && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Este documento está deshabilitado. Solo el superadministrador puede cargarlo.',
      );
    }

    let expiry: Date | null = null;
    if (meta.expiresAt) {
      const parsed = new Date(meta.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Fecha de vencimiento inválida');
      }
      expiry = parsed;
    }

    const last = await this.prisma.documentFile.findFirst({
      where: { requirementId: requirement.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;

    const safeExt = (extname(file.originalname) || '').slice(0, 12);
    const fileName = `v${version}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`;
    const { storageKey, contentHash } = await this.storage.writeBuffer(
      `habilitation-docs/${clinicId}/${requirement.category.pillar.toLowerCase()}/${requirement.code}`,
      fileName,
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );

    const created = await this.prisma.documentFile.create({
      data: {
        requirementId: requirement.id,
        uploadedById: user.id,
        version,
        periodLabel: meta.periodLabel?.trim() || null,
        status: DocumentFileStatus.PENDING_SIGNATURE,
        originalName: file.originalname,
        storageKey,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
        checksum: contentHash,
        expiresAt: expiry,
        notes: meta.notes?.trim() || null,
      },
    });

    await this.recordAudit(clinicId, user, AuditAction.UPLOAD, created.id, context, {
      requirementCode: requirement.code,
      originalName: file.originalname,
      checksum: contentHash,
      version,
      periodLabel: meta.periodLabel ?? null,
    });

    return this.listFiles(user, requirement.id);
  }

  /**
   * Compatibilidad: acta de capacitación → fillSgsst con roles Capacitador/Asistente.
   */
  fillTrainingActa(
    user: User,
    requirementId: string,
    dto: FillTrainingActaDto,
    context: AuditContext,
    clinicIdParam?: string,
  ) {
    return this.fillSgsst(
      user,
      requirementId,
      {
        fecha: dto.fecha,
        periodLabel: dto.periodLabel,
        tema: dto.tema,
        objetivo: dto.objetivo,
        contenido: dto.objetivo,
        signatures: [
          {
            role: DocumentSignerRole.CAPACITADOR,
            signerName: dto.capacitadorNombre,
            signatureBase64: dto.capacitadorSignatureBase64,
          },
          {
            role: DocumentSignerRole.ASISTENTE,
            signerName: dto.asistenteNombre,
            signatureBase64: dto.asistenteSignatureBase64,
          },
        ],
      },
      context,
      clinicIdParam,
    );
  }

  /**
   * Diligencia cualquier documento SG-SST: llena campos y pega firmas imagen
   * bajo "Firma …". Crea una versión PDF nueva; el histórico no se toca.
   */
  async fillSgsst(
    user: User,
    requirementId: string,
    dto: FillSgsstDto,
    context: AuditContext,
    clinicIdParam?: string,
  ) {
    this.assertDocumentFiller(user);
    const clinicId = this.clinicScope(user, clinicIdParam);
    const requirement = await this.prisma.documentRequirement.findFirst({
      where: { id: requirementId, clinicId },
      include: {
        category: true,
        clinic: { select: { name: true } },
      },
    });
    if (!requirement) throw new NotFoundException('Requisito no encontrado');
    if (!isSgsstFillable(requirement.code, requirement.category.pillar)) {
      throw new BadRequestException(
        'Solo los documentos del pilar SG-SST se pueden diligenciar desde este flujo.',
      );
    }

    const roles = requiredRoles(requirement.code);
    const provided = new Map(
      dto.signatures.map((s) => [s.role, s] as const),
    );
    for (const role of roles) {
      if (!provided.has(role)) {
        throw new BadRequestException(
          `Falta la firma de ${role}. Roles requeridos: ${roles.join(', ')}.`,
        );
      }
    }

    const normalized = roles.map((role) => {
      const sig = provided.get(role)!;
      return {
        role,
        signerName: sig.signerName.trim(),
        signatureBase64: this.normalizeSignature(sig.signatureBase64),
      };
    });

    const periodLabel =
      dto.periodLabel?.trim() ||
      (() => {
        const d = new Date(dto.fecha);
        if (Number.isNaN(d.getTime())) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      })();

    const formData = {
      kind: isTrainingDoc(requirement.code) ? 'TRAINING_ACTA' : 'SGSST_FILL',
      fecha: dto.fecha.trim(),
      periodLabel,
      tema: dto.tema?.trim() || null,
      objetivo: dto.objetivo?.trim() || null,
      contenido: dto.contenido?.trim() || null,
      signers: normalized.map((s) => ({ role: s.role, name: s.signerName })),
    };

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await this.sgsstFillPdf.build({
        clinicName: requirement.clinic.name,
        documentTitle: requirement.title,
        documentCode: requirement.code,
        fecha: formData.fecha,
        periodLabel,
        tema: formData.tema,
        objetivo:
          formData.objetivo ||
          (formData.tema
            ? `Capacitar al personal sobre ${formData.tema}.`
            : null),
        contenido: formData.contenido,
        signatures: normalized,
      });
    } catch {
      throw new BadRequestException(
        'No se pudo generar el PDF con las firmas. Use PNG o JPG válidos.',
      );
    }

    const last = await this.prisma.documentFile.findFirst({
      where: { requirementId: requirement.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;
    const slug = requirement.code.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const safeName = `${slug}_${periodLabel || 'sin-periodo'}_v${version}.pdf`;
    const { storageKey, contentHash } = await this.storage.writeBuffer(
      `habilitation-docs/${clinicId}/${requirement.category.pillar.toLowerCase()}/${requirement.code}`,
      safeName,
      pdfBuffer,
      'application/pdf',
    );

    const expiresAt = new Date();
    const validity = requirement.validityDays ?? 365;
    expiresAt.setDate(expiresAt.getDate() + validity);

    const created = await this.prisma.$transaction(async (tx) => {
      const file = await tx.documentFile.create({
        data: {
          requirementId: requirement.id,
          uploadedById: user.id,
          version,
          periodLabel,
          // Contenido diligenciado + sello HABILISALUD; falta contraparte del consultorio.
          status: DocumentFileStatus.PARTIALLY_SIGNED,
          originalName: safeName,
          storageKey,
          mimeType: 'application/pdf',
          sizeBytes: pdfBuffer.length,
          checksum: contentHash,
          expiresAt,
          formData,
          notes:
            user.role === UserRole.SUPER_ADMIN
              ? 'Documento SG-SST diligenciado por HABILISALUD. Pendiente firma del consultorio.'
              : 'Documento SG-SST diligenciado por el consultorio. Pendiente sello HABILISALUD.',
        },
      });

      const approvalRole =
        user.role === UserRole.SUPER_ADMIN
          ? DocumentSignerRole.HABILISALUD
          : DocumentSignerRole.CLINIC_ADMIN;
      const approvalSig = {
        role: approvalRole,
        signerName: (user.fullName || user.email).trim(),
        signatureBase64: normalized[0].signatureBase64,
      };

      await tx.documentSignature.createMany({
        data: [
          ...normalized.map((sig) => ({
            documentFileId: file.id,
            role: sig.role,
            signerUserId: user.id,
            signerName: sig.signerName,
            signatureBase64: sig.signatureBase64,
            contentHash,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          })),
          {
            documentFileId: file.id,
            role: approvalSig.role,
            signerUserId: user.id,
            signerName: approvalSig.signerName,
            signatureBase64: approvalSig.signatureBase64,
            contentHash,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        ],
      });

      return file;
    });

    await this.recordAudit(clinicId, user, AuditAction.SIGN, created.id, context, {
      requirementCode: requirement.code,
      filled: true,
      version,
      periodLabel,
      formData,
      awaitingClinicCountersign: user.role === UserRole.SUPER_ADMIN,
      awaitingHabilisaludSeal: user.role === UserRole.ADMIN,
    });

    return this.getFile(user, created.id, clinicId);
  }

  async updateMeta(
    user: User,
    fileId: string,
    dto: UpdateDocumentMetaDto,
    context: AuditContext,
    clinicIdParam?: string,
  ) {
    this.assertDocumentWriter(user);
    const clinicId = this.clinicScope(user, clinicIdParam);
    const file = await this.prisma.documentFile.findFirst({
      where: { id: fileId, requirement: { clinicId } },
      include: { requirement: { select: { id: true, code: true } } },
    });
    if (!file) throw new NotFoundException('Documento no encontrado');
    if (file.status === DocumentFileStatus.RETIRED) {
      throw new ConflictException('No se puede editar una versión retirada');
    }
    if (file.status === DocumentFileStatus.SIGNED) {
      throw new ConflictException(
        'La versión ya está firmada. Cargue una nueva versión para corregir metadatos.',
      );
    }

    let expiresAt: Date | null | undefined = undefined;
    if (dto.expiresAt !== undefined) {
      if (!dto.expiresAt) expiresAt = null;
      else {
        const parsed = new Date(dto.expiresAt);
        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException('Fecha de vencimiento inválida');
        }
        expiresAt = parsed;
      }
    }

    await this.prisma.documentFile.update({
      where: { id: file.id },
      data: {
        ...(expiresAt !== undefined ? { expiresAt } : {}),
        ...(dto.periodLabel !== undefined
          ? { periodLabel: dto.periodLabel.trim() || null }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      },
    });

    await this.recordAudit(clinicId, user, AuditAction.UPDATE, file.id, context, {
      requirementCode: file.requirement.code,
      meta: dto,
    });

    return this.listFiles(user, file.requirement.id, clinicIdParam);
  }

  async sign(
    user: User,
    fileId: string,
    dto: SignDocumentDto,
    context: AuditContext,
    clinicIdParam?: string,
  ) {
    const clinicId = this.clinicScope(user, clinicIdParam);
    const file = await this.prisma.documentFile.findFirst({
      where: { id: fileId, requirement: { clinicId } },
      include: {
        signatures: true,
        requirement: { select: { id: true, code: true, title: true, isEnabled: true } },
      },
    });
    if (!file) throw new NotFoundException('Documento no encontrado');
    if (file.status === DocumentFileStatus.RETIRED) {
      throw new ConflictException('No se puede firmar una versión retirada');
    }
    if (file.status === DocumentFileStatus.SIGNED) {
      throw new ConflictException(
        'Esta versión ya está sellada. Para cambiar algo, cargue una nueva versión.',
      );
    }
    if (!file.requirement.isEnabled) {
      throw new ForbiddenException(
        'Este documento está deshabilitado. No se puede firmar.',
      );
    }

    const role = dto.role;
    if (user.role === UserRole.SUPER_ADMIN) {
      if (role !== DocumentSignerRole.HABILISALUD) {
        throw new BadRequestException(
          'El superadministrador sella con el rol HABILISALUD. Las firmas de contenido se cargan con «Llenar y firmar».',
        );
      }
    } else if (
      user.role === UserRole.ADMIN ||
      user.role === UserRole.HEALTH_PROFESSIONAL
    ) {
      this.assertClinicCountersigner(user);
      if (role !== DocumentSignerRole.CLINIC_ADMIN) {
        throw new BadRequestException(
          'El consultorio solo puede firmar como CLINIC_ADMIN (contraparte).',
        );
      }
      if (!hasRole(file.signatures, DocumentSignerRole.HABILISALUD)) {
        throw new ForbiddenException(
          'Aún no puede firmar: el superadministrador de HABILISALUD debe firmar primero.',
        );
      }
    } else {
      throw new ForbiddenException(
        'No tiene permiso para firmar estos documentos.',
      );
    }

    const signatureBase64 = this.normalizeSignature(dto.signatureBase64);
    const signerName = (dto.signerName || user.fullName || user.email).trim();
    if (!signerName) throw new BadRequestException('Nombre del firmante requerido');

    const existing = file.signatures.find((s) => s.role === role);
    if (existing) {
      throw new ConflictException(
        `El rol ${role} ya firmó esta versión. El histórico no se sobrescribe.`,
      );
    }

    await this.prisma.documentSignature.create({
      data: {
        documentFileId: file.id,
        role,
        signerUserId: user.id,
        signerName,
        signatureBase64,
        contentHash: file.checksum,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    const rolesAfter = [...file.signatures, { role }];
    const nextStatus = approvalStatus(rolesAfter);

    await this.prisma.documentFile.update({
      where: { id: file.id },
      data: { status: nextStatus },
    });

    await this.recordAudit(clinicId, user, AuditAction.SIGN, file.id, context, {
      requirementCode: file.requirement.code,
      role,
      signerName,
      status: nextStatus,
      version: file.version,
      awaitingClinicCountersign:
        role === DocumentSignerRole.HABILISALUD &&
        nextStatus === DocumentFileStatus.PARTIALLY_SIGNED,
    });

    return this.getFile(user, file.id, clinicIdParam);
  }

  private normalizeSignature(raw: string) {
    const value = raw.trim();
    if (!value.startsWith('data:image')) {
      throw new BadRequestException('La firma debe ser una imagen (data URL)');
    }
    if (value.length < 80) {
      throw new BadRequestException('Firma vacía o inválida');
    }
    // Verifica que el base64 decodifique (evita PNG corruptos al generar el PDF).
    const comma = value.indexOf(',');
    if (comma < 0) throw new BadRequestException('Firma en formato inválido');
    try {
      const buf = Buffer.from(value.slice(comma + 1), 'base64');
      if (buf.length < 32) throw new Error('too small');
    } catch {
      throw new BadRequestException('No se pudo leer la imagen de la firma');
    }
    return value;
  }

  async view(user: User, fileId: string, context: AuditContext, clinicIdParam?: string) {
    const clinicId = this.clinicScope(user, clinicIdParam);
    const file = await this.prisma.documentFile.findFirst({
      where: { id: fileId, requirement: { clinicId } },
      include: { requirement: { select: { code: true } } },
    });
    if (!file) throw new NotFoundException('Documento no encontrado');

    const buffer = await this.storage.readBuffer(file.storageKey);

    await this.recordAudit(clinicId, user, AuditAction.VIEW, file.id, context, {
      requirementCode: file.requirement.code,
      originalName: file.originalName,
      version: file.version,
    });

    return new StreamableFile(buffer, {
      type: file.mimeType,
      disposition: `inline; filename="${file.originalName.replace(/"/g, '')}"`,
    });
  }

  /** Vista previa HTML para DOCX (mammoth). PDF/imágenes usan /view. */
  async previewHtml(user: User, fileId: string, context: AuditContext, clinicIdParam?: string) {
    const clinicId = this.clinicScope(user, clinicIdParam);
    const file = await this.prisma.documentFile.findFirst({
      where: { id: fileId, requirement: { clinicId } },
      include: { requirement: { select: { code: true } } },
    });
    if (!file) throw new NotFoundException('Documento no encontrado');

    const isDocx =
      file.mimeType.includes('word') ||
      file.originalName.toLowerCase().endsWith('.docx') ||
      file.originalName.toLowerCase().endsWith('.doc');
    if (!isDocx) {
      throw new BadRequestException(
        'La vista HTML solo aplica a Word. Use /view para PDF e imágenes.',
      );
    }

    const buffer = await this.storage.readBuffer(file.storageKey);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as {
      convertToHtml: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    };
    const { value } = await mammoth.convertToHtml({ buffer });

    await this.recordAudit(clinicId, user, AuditAction.VIEW, file.id, context, {
      requirementCode: file.requirement.code,
      preview: 'html',
      version: file.version,
    });

    return {
      fileId: file.id,
      originalName: file.originalName,
      version: file.version,
      html: value,
    };
  }

  async download(user: User, fileId: string, context: AuditContext, clinicIdParam?: string) {
    this.assertDocumentWriter(user);
    const clinicId = this.clinicScope(user, clinicIdParam);
    const file = await this.prisma.documentFile.findFirst({
      where: { id: fileId, requirement: { clinicId } },
      include: { requirement: { select: { code: true } } },
    });
    if (!file) throw new NotFoundException('Documento no encontrado');

    const buffer = await this.storage.readBuffer(file.storageKey);

    await this.recordAudit(clinicId, user, AuditAction.DOWNLOAD, file.id, context, {
      requirementCode: file.requirement.code,
      originalName: file.originalName,
      version: file.version,
    });

    return new StreamableFile(buffer, {
      type: file.mimeType,
      disposition: `attachment; filename="${file.originalName.replace(/"/g, '')}"`,
    });
  }

  /** Retiro lógico: la versión queda en el histórico, nunca se borra del disco. */
  async retire(user: User, fileId: string, context: AuditContext, clinicIdParam?: string) {
    this.assertDocumentWriter(user);
    const clinicId = this.clinicScope(user, clinicIdParam);
    const file = await this.prisma.documentFile.findFirst({
      where: { id: fileId, requirement: { clinicId } },
      include: { requirement: { select: { id: true, code: true } } },
    });
    if (!file) throw new NotFoundException('Documento no encontrado');
    if (file.status === DocumentFileStatus.RETIRED) {
      return this.listFiles(user, file.requirement.id, clinicIdParam);
    }

    await this.prisma.documentFile.update({
      where: { id: file.id },
      data: {
        status: DocumentFileStatus.RETIRED,
        retiredAt: new Date(),
      },
    });

    await this.recordAudit(clinicId, user, AuditAction.UPDATE, file.id, context, {
      retired: true,
      requirementCode: file.requirement.code,
      originalName: file.originalName,
      storageKey: file.storageKey,
      version: file.version,
    });

    return this.listFiles(user, file.requirement.id, clinicIdParam);
  }


  async setRequirementEnabled(
    user: User,
    requirementId: string,
    enabled: boolean,
    clinicIdParam?: string,
  ) {
    this.assertDocumentWriter(user);
    const clinicId = this.clinicScope(user, clinicIdParam);
    const requirement = await this.prisma.documentRequirement.findFirst({
      where: { id: requirementId, clinicId },
    });
    if (!requirement) throw new NotFoundException('Requisito no encontrado');
    await this.prisma.documentRequirement.update({
      where: { id: requirement.id },
      data: { isEnabled: enabled },
    });
    return this.overview(user, undefined, clinicId);
  }

  async setAllRequirementsEnabled(
    user: User,
    enabled: boolean,
    clinicIdParam?: string,
  ) {
    this.assertDocumentWriter(user);
    const clinicId = this.clinicScope(user, clinicIdParam);
    await this.prisma.documentRequirement.updateMany({
      where: { clinicId },
      data: { isEnabled: enabled },
    });
    return this.overview(user, undefined, clinicId);
  }

  private recordAudit(
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
        entityType: 'DocumentFile',
        entityId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
