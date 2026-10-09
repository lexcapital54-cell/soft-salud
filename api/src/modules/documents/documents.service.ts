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
import { DocumentProvisionService } from './document-provision.service';
import { SignDocumentDto, UpdateDocumentMetaDto } from './dto/document.dto';
import { FillSgsstDto } from './dto/fill-sgsst.dto';
import { FillTrainingActaDto } from './dto/fill-training-acta.dto';
import { clinicMayUploadInfra, clinicOwnsInfraFile } from './clinic-upload-rules';
import { HabilitationPackImportService } from './habilitation-pack-import.service';
import { FT_DOC_CATEGORY_HINTS } from './ft-doc-categories';
import { PdfBrandService } from './pdf-brand.service';
import { SgsstFillPdfService } from './sgsst-fill-pdf.service';
import AdmZip from 'adm-zip';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, join, normalize as pathNormalize, sep } from 'path';
import { tmpdir } from 'os';
import { uploaderLabel } from './uploader-label';

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

/** Doble sello solo en SG-SST: primero HABILISALUD, luego admin del consultorio. */
const SST_DUAL_ROLES: DocumentSignerRole[] = [
  DocumentSignerRole.HABILISALUD,
  DocumentSignerRole.CLINIC_ADMIN,
];

/** Fuera de SG-SST: solo firma del profesional del consultorio. */
const PROFESSIONAL_ONLY_ROLES: DocumentSignerRole[] = [
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

/** @deprecated alias — prefer contentRoles */
function requiredRoles(requirementCode: string): DocumentSignerRole[] {
  return contentRoles(requirementCode);
}

/** Todo el pilar SG-SST se puede diligenciar y firmar con imagen. */
function isSgsstFillable(requirementCode: string, pillar: DocumentPillar) {
  return pillar === DocumentPillar.SG_SST || requirementCode.startsWith('SST_');
}

/**
 * Ya no se exige sello pendiente de HABILISALUD ni del profesional.
 * Los nombres (Elaboró/Revisó/Aprobó) se rellenan en el PDF; el expediente
 * no queda en “por firmar”.
 */
function approvalRolesFor(
  _requirementCode: string,
  _pillar: DocumentPillar,
  _requiresClinicSignature: boolean,
): DocumentSignerRole[] {
  return [];
}

function hasRole(
  signatures: { role: DocumentSignerRole }[],
  role: DocumentSignerRole,
) {
  return signatures.some((s) => s.role === role);
}

function approvalStatus(
  _signatures: { role: DocumentSignerRole }[],
  _needed: DocumentSignerRole[],
): DocumentFileStatus {
  return DocumentFileStatus.SIGNED;
}

/** Estado efectivo para semáforo: sin pendientes de firma. */
function effectiveFileStatus(status: DocumentFileStatus): DocumentFileStatus {
  if (
    status === DocumentFileStatus.PENDING_SIGNATURE ||
    status === DocumentFileStatus.PARTIALLY_SIGNED
  ) {
    return DocumentFileStatus.SIGNED;
  }
  return status;
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
  DOCUMENTACION_GENERAL: 'Documentación general',
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

/** Pilares donde admin/profesional del consultorio puede cargar y reemplazar archivos. */
const CLINIC_ADMIN_CRUD_PILLARS = new Set<DocumentPillar>([
  DocumentPillar.DOCUMENTACION_LEGAL,
  DocumentPillar.TALENTO_HUMANO,
]);

function isClinicAdminCrudPillar(pillar: DocumentPillar | string | null | undefined) {
  return !!pillar && CLINIC_ADMIN_CRUD_PILLARS.has(pillar as DocumentPillar);
}

/**
 * Uso de suelo y concepto sanitario: cualquier profesional del consultorio
 * (ADMIN / HEALTH_PROFESSIONAL) puede cargar y reemplazar, aunque vivan en
 * Infraestructura u otros pilares.
 */
function isClinicLandUseOrSanitaryCode(code: string | null | undefined): boolean {
  const c = (code || '').toUpperCase();
  if (!c) return false;
  return (
    c.includes('USO_DEL_SUELO') ||
    c.includes('USO_DE_SUELO') ||
    c.includes('CONCEPTO_SANITARIO')
  );
}

const PILLAR_ORDER: DocumentPillar[] = [
  DocumentPillar.DOCUMENTACION_GENERAL,
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
  uploadedBy: { select: { id: true, fullName: true, role: true } },
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
    private readonly packImport: HabilitationPackImportService,
    private readonly pdfBrand: PdfBrandService,
    private readonly documentProvision: DocumentProvisionService,
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

  /**
   * Pilares visibles según los módulos activos del consultorio: habilitación con
   * la gestión documental y SG-SST con su propio módulo.
   */
  private async enabledPillars(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { dashboardType: true, sgsstEnabled: true },
    });
    const withDocs = clinic?.dashboardType === 'CLINICAL_HISTORY_WITH_DOCS';
    return PILLAR_ORDER.filter((p) =>
      p === DocumentPillar.SG_SST ? !!clinic?.sgsstEnabled : withDocs,
    );
  }

  private async assertPillarEnabled(user: User, clinicId: string, pillar: DocumentPillar) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    if ((await this.enabledPillars(clinicId)).includes(pillar)) return;
    throw new ForbiddenException(
      pillar === DocumentPillar.SG_SST
        ? 'El módulo SG-SST no está activo para este consultorio.'
        : 'La gestión documental no está activa para este consultorio.',
    );
  }

  /** Solo SUPER_ADMIN: habilitar requisitos, asignar catálogo, replicar, descargar. */
  private assertDocumentWriter(user: User) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Solo el superadministrador puede administrar la estructura del expediente (habilitar, asignar o descargar).',
      );
    }
  }

  /**
   * SUPER_ADMIN: todo.
   * ADMIN y HEALTH_PROFESSIONAL: Legal + Talento + uso de suelo / concepto sanitario.
   */
  private assertClinicDocFileCrud(
    user: User,
    pillar: DocumentPillar | string | null | undefined,
    requirementCode?: string | null,
    infraAllowed = false,
  ) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    const isClinicProfessional =
      user.role === UserRole.ADMIN ||
      user.role === UserRole.HEALTH_PROFESSIONAL;
    if (!isClinicProfessional) {
      throw new ForbiddenException(
        'Solo puede cargar o modificar Documentación legal, Talento humano, uso de suelo y concepto sanitario.',
      );
    }
    if (isClinicLandUseOrSanitaryCode(requirementCode)) return;
    if (isClinicAdminCrudPillar(pillar)) return;
    if (infraAllowed) return;
    throw new ForbiddenException(
      pillar === DocumentPillar.INFRAESTRUCTURA
        ? 'En Infraestructura solo puede cargar documentos pendientes o reemplazar los que usted cargó.'
        : 'Solo puede cargar o modificar Documentación legal, Talento humano, Infraestructura pendiente, uso de suelo y concepto sanitario.',
    );
  }

  /** Activa uso de suelo / concepto sanitario para que el profesional los vea y pueda cargar. */
  private async ensureLandUseSanitaryEnabled(clinicId: string) {
    const rows = await this.prisma.documentRequirement.findMany({
      where: { clinicId, isEnabled: false },
      select: { id: true, code: true },
    });
    const ids = rows
      .filter((r) => isClinicLandUseOrSanitaryCode(r.code))
      .map((r) => r.id);
    if (!ids.length) return;
    await this.prisma.documentRequirement.updateMany({
      where: { id: { in: ids } },
      data: { isEnabled: true },
    });
  }

  /** Brand del consultorio: Aprobó = profesional de ESE consultorio. */
  async getClinicBrand(user: User, clinicIdParam?: string) {
    const clinicId = this.clinicScope(user, clinicIdParam);
    const brand = await this.pdfBrand.resolveBrand(user, clinicId);
    return {
      clinicId,
      clinicName: brand.clinicName,
      professionalName: brand.professionalName,
      professionalCard: brand.professionalCard,
      professionalUserId: brand.professionalUserId,
      elaboratedBy: brand.elaboratedBy,
      hasSignature: !!brand.signatureBase64,
      signatureBase64: brand.signatureBase64 ?? null,
      city: brand.city,
    };
  }

  /**
   * Re-sella todos los PDF activos del consultorio con el profesional correcto,
   * limpiando sellos previos para no mezclar nombres entre consultorios.
   */
  async rebrandClinicPdfs(user: User, clinicIdParam?: string) {
    this.assertDocumentWriter(user);
    const clinicId = this.clinicScope(user, clinicIdParam);
    const brand = await this.pdfBrand.resolveBrand(user, clinicId);
    const files = await this.prisma.documentFile.findMany({
      where: {
        requirement: { clinicId },
        status: { not: DocumentFileStatus.RETIRED },
        OR: [
          { mimeType: { contains: 'pdf' } },
          { originalName: { endsWith: '.pdf', mode: 'insensitive' } },
        ],
      },
      include: {
        requirement: {
          select: {
            id: true,
            code: true,
            category: { select: { pillar: true } },
          },
        },
      },
    });

    let updated = 0;
    let skipped = 0;
    for (const file of files) {
      try {
        const buffer = await this.storage.readBuffer(file.storageKey);
        const branded = await this.pdfBrand.brandPdf(buffer, brand, {
          force: true,
        });
        const { contentHash } = await this.storage.putBuffer(
          file.storageKey,
          branded,
          'application/pdf',
        );
        await this.prisma.documentFile.update({
          where: { id: file.id },
          data: {
            sizeBytes: branded.length,
            checksum: contentHash,
            mimeType: 'application/pdf',
            notes: `Aprobó: ${brand.professionalName} · Elaboró/Revisó: HABILISALUD (re-sellado por consultorio).`,
          },
        });
        await this.prisma.documentSignature.deleteMany({
          where: {
            documentFileId: file.id,
            role: DocumentSignerRole.CLINIC_ADMIN,
          },
        });
        await this.prisma.documentSignature.create({
          data: {
            documentFileId: file.id,
            role: DocumentSignerRole.CLINIC_ADMIN,
            signerUserId: brand.professionalUserId,
            signerName: brand.professionalName,
            signatureBase64:
              brand.signatureBase64 ||
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W2XQAAAAASUVORK5CYII=',
            contentHash,
          },
        });
        updated += 1;
      } catch {
        skipped += 1;
      }
    }

    return {
      clinicId,
      clinicName: brand.clinicName,
      professionalName: brand.professionalName,
      updated,
      skipped,
      total: files.length,
    };
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

  /** Diligenciar SG-SST: solo SUPER_ADMIN. */
  private assertDocumentFiller(user: User) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Solo el superadministrador puede diligenciar documentos SG-SST.',
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

  /**
   * Borra por completo todas las versiones de un requisito (DB + disco).
   * Así al retirar/reemplazar no queda rastro de lo anterior.
   */
  private async purgeRequirementFiles(requirementId: string) {
    const previous = await this.prisma.documentFile.findMany({
      where: { requirementId },
      select: { id: true, storageKey: true },
    });
    if (!previous.length) return;
    await this.prisma.documentFile.deleteMany({ where: { requirementId } });
    for (const row of previous) {
      await this.storage.deleteStored(row.storageKey).catch(() => undefined);
    }
  }

  private serializeFile(
    file: FileRow,
    validityDays: number | null,
    requirementCode: string,
    pillar: DocumentPillar,
    requiresClinicSignature = false,
  ) {
    const signedRoles = new Set(file.signatures.map((s) => s.role));
    const content = contentRoles(requirementCode);
    const sgsst = isSgsstFillable(requirementCode, pillar);
    const needed = approvalRolesFor(
      requirementCode,
      pillar,
      requiresClinicSignature,
    );
    const hasHabilisalud = signedRoles.has(DocumentSignerRole.HABILISALUD);
    const hasClinicAdmin = signedRoles.has(DocumentSignerRole.CLINIC_ADMIN);
    const status = effectiveFileStatus(file.status);
    return {
      id: file.id,
      version: file.version,
      periodLabel: file.periodLabel,
      status,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      checksum: file.checksum,
      expiresAt: this.expiryOf(file, validityDays),
      issuedAt: file.issuedAt,
      changeReason: file.changeReason,
      notes: file.notes,
      formData: file.formData,
      retiredAt: file.retiredAt,
      createdAt: file.createdAt,
      uploadedBy: uploaderLabel(file.uploadedBy),
      requiredRoles: needed,
      contentRoles: content,
      requiresClinicSignature: false,
      fillable: sgsst,
      fillableTraining: isTrainingDoc(requirementCode),
      hasHabilisaludSignature: hasHabilisalud,
      hasClinicAdminSignature: hasClinicAdmin,
      canClinicSign: false,
      awaitingClinicSignature: false,
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
      missingRoles: [] as DocumentSignerRole[],
    };
  }

  /**
   * Semáforo:
   * - Sin evidencia → RED / OPTIONAL
   * - Con evidencia vigente → GREEN
   * - Con evidencia por vencer → YELLOW
   * - Con evidencia vencida → RED
   */
  private statusOf(requirement: RequirementWithFiles, now: Date) {
    if (!requirement.isEnabled) {
      return {
        status: 'OPTIONAL' as ComplianceStatus,
        expiresAt: null,
        daysToExpiry: null,
      };
    }
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

    if (effectiveFileStatus(latest.status) !== DocumentFileStatus.SIGNED) {
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
   * Histórico mensual de documentos vigentes (auditoría).
   * Solo archivos activos; lo retirado se elimina sin dejar rastro.
   */
  async signedArchive(user: User, period?: string, clinicIdParam?: string) {
    const clinicId = this.clinicScope(user, clinicIdParam);
    const selected =
      period && /^\d{4}-\d{2}$/.test(period.trim()) ? period.trim() : null;

    const files = await this.prisma.documentFile.findMany({
      where: {
        requirement: {
          clinicId,
          ...(user.role === UserRole.SUPER_ADMIN ? {} : { isEnabled: true }),
        },
        status: DocumentFileStatus.SIGNED,
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
          file.requirement.requiresClinicSignature === true,
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
    await this.packImport.importForClinic(clinicId).catch(() => undefined);
    await this.ensureLandUseSanitaryEnabled(clinicId).catch(() => undefined);
    // Normaliza historial: ya no hay pendientes de firma HabiliSalud / profesional.
    await this.prisma.documentFile.updateMany({
      where: {
        requirement: { clinicId },
        status: {
          in: [
            DocumentFileStatus.PENDING_SIGNATURE,
            DocumentFileStatus.PARTIALLY_SIGNED,
          ],
        },
      },
      data: { status: DocumentFileStatus.SIGNED },
    });
    const now = new Date();

    const allowed = await this.enabledPillars(clinicId);
    const shownPillars = pillar ? allowed.filter((p) => p === pillar) : allowed;
    const requirements = await this.prisma.documentRequirement.findMany({
      where: { clinicId, archivedAt: null, category: { pillar: { in: shownPillars } } },
      include: {
        category: true,
        files: {
          orderBy: { version: 'desc' },
          include: fileInclude,
        },
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { code: 'asc' }],
    });

    // Profesional/admin del consultorio: no ven documentos deshabilitados.
    const visibleRequirements =
      user.role === UserRole.SUPER_ADMIN
        ? requirements
        : requirements.filter((r) => r.isEnabled);

    const byPillar = new Map<
      DocumentPillar,
      {
        pillar: DocumentPillar;
        label: string;
        categories: Map<string, ReturnType<DocumentsService['emptyCategory']>>;
      }
    >();

    for (const requirement of visibleRequirements) {
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
      const pillar = requirement.category.pillar;
      const sgsst = isSgsstFillable(requirement.code, pillar);
      const needsClinicFlag = requirement.requiresClinicSignature === true;
      const needed = approvalRolesFor(
        requirement.code,
        pillar,
        needsClinicFlag,
      );
      const hasHabili =
        !!latest &&
        latest.signatures.some((s) => s.role === DocumentSignerRole.HABILISALUD);
      const hasClinic =
        !!latest &&
        latest.signatures.some((s) => s.role === DocumentSignerRole.CLINIC_ADMIN);
      const canClinicSign = false;

      categoryNode.requirements.push({
        id: requirement.id,
        code: requirement.code,
        title: requirement.title,
        description: requirement.description,
        isMandatory: requirement.isMandatory,
        isEnabled: requirement.isEnabled,
        requiresClinicSignature: false,
        pillar,
        validityDays: requirement.validityDays,
        status,
        expiresAt,
        daysToExpiry,
        clinicCanUpload: clinicMayUploadInfra(pillar, requirement.files),
        fileCount: active.length,
        latestFile: latest
          ? this.serializeFile(
              latest,
              requirement.validityDays,
              requirement.code,
              pillar,
              needsClinicFlag,
            )
          : null,
        fillable: sgsst,
        fillableTraining: isTrainingDoc(requirement.code),
        requiredRoles: needed,
        contentRoles: contentRoles(requirement.code),
        hasHabilisaludSignature: hasHabili,
        awaitingClinicSignature: false,
        canClinicSign,
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

    const pendingCountersignatures = this.collectPendingCountersign(
      visibleRequirements,
    );

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
    _requirements: Array<{
      id: string;
      code: string;
      title: string;
      isEnabled: boolean;
      requiresClinicSignature?: boolean;
      category: { pillar: DocumentPillar };
      files: FileRow[];
    }>,
  ) {
    // Sin pendientes de firma HabiliSalud / profesional.
    return [] as Array<{
      fileId: string;
      requirementId: string;
      requirementCode: string;
      requirementTitle: string;
      version: number;
      originalName: string;
      habilisaludSignerName: string;
      habilisaludSignedAt: Date;
      message: string;
    }>;
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
        requiresClinicSignature: boolean;
        pillar: DocumentPillar;
        validityDays: number | null;
        status: ComplianceStatus;
        expiresAt: Date | null;
        daysToExpiry: number | null;
        clinicCanUpload: boolean;
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
        isEnabled: requirement.isEnabled,
        requiresClinicSignature: requirement.requiresClinicSignature,
      },
      ...this.statusOf(requirement, now),
      fillable: isSgsstFillable(requirement.code, requirement.category.pillar),
      fillableTraining: isTrainingDoc(requirement.code),
      requiredRoles: approvalRolesFor(
        requirement.code,
        requirement.category.pillar,
        requirement.requiresClinicSignature === true,
      ),
      contentRoles: contentRoles(requirement.code),
      files: requirement.files.map((file) =>
        this.serializeFile(
          file,
          requirement.validityDays,
          requirement.code,
          requirement.category.pillar,
          requirement.requiresClinicSignature === true,
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
        requiresClinicSignature: file.requirement.requiresClinicSignature,
      },
      file: this.serializeFile(
        file,
        file.requirement.validityDays,
        file.requirement.code,
        file.requirement.category.pillar,
        file.requirement.requiresClinicSignature,
      ),
    };
  }

  async upload(
    user: User,
    requirementId: string,
    file: Express.Multer.File,
    meta: {
      expiresAt?: string;
      periodLabel?: string;
      notes?: string;
      issuedAt?: string;
      changeReason?: string;
    },
    context: AuditContext,
    clinicIdParam?: string,
  ) {
    const clinicId = this.clinicScope(user, clinicIdParam);
    let buffer = file?.buffer;
    if (!file || !buffer?.length) {
      throw new BadRequestException(
        'No se recibió el archivo. Elija de nuevo el PDF/documento e intente cargar otra vez.',
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('El archivo supera los 25 MB permitidos');
    }

    const requirement = await this.prisma.documentRequirement.findFirst({
      where: { id: requirementId, clinicId },
      include: {
        category: true,
        files: {
          orderBy: { version: 'desc' },
          select: { status: true, uploadedBy: { select: { role: true } } },
        },
      },
    });
    if (!requirement) throw new NotFoundException('Requisito no encontrado');
    this.assertClinicDocFileCrud(
      user,
      requirement.category.pillar,
      requirement.code,
      clinicMayUploadInfra(requirement.category.pillar, requirement.files),
    );
    await this.assertPillarEnabled(user, clinicId, requirement.category.pillar);
    if (requirement.isEnabled === false && user.role !== UserRole.SUPER_ADMIN) {
      if (isClinicLandUseOrSanitaryCode(requirement.code)) {
        await this.prisma.documentRequirement.update({
          where: { id: requirement.id },
          data: { isEnabled: true },
        });
      } else {
        throw new ForbiddenException(
          'Este documento está deshabilitado. Solo el superadministrador puede cargarlo.',
        );
      }
    }

    let expiry: Date | null = null;
    if (meta.expiresAt) {
      const parsed = new Date(meta.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Fecha de vencimiento inválida');
      }
      expiry = parsed;
    }
    let issuedAt: Date | null = null;
    if (meta.issuedAt) {
      const parsed = new Date(meta.issuedAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Fecha de emisión inválida');
      }
      issuedAt = parsed;
    }

    const sgsst = isSgsstFillable(
      requirement.code,
      requirement.category.pillar,
    );
    const isPdf =
      (file.mimetype || '').includes('pdf') ||
      file.originalname.toLowerCase().endsWith('.pdf');
    const brand = await this.pdfBrand.resolveBrand(user, clinicId);
    let autoSigned = true;
    let mimeType = file.mimetype || 'application/octet-stream';
    let originalName = file.originalname;

    // Fuera de SG-SST: rellenar perfil; sin pendientes de firma.
    if (!sgsst && isPdf) {
      buffer = await this.pdfBrand.brandPdf(buffer, brand);
      mimeType = 'application/pdf';
    }

    const last = await this.prisma.documentFile.findFirst({
      where: { requirementId: requirement.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;

    const safeExt = (extname(originalName) || '').slice(0, 12);
    const fileName = `v${version}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`;
    const { storageKey, contentHash } = await this.storage.writeBuffer(
      `habilitation-docs/${clinicId}/${requirement.category.pillar.toLowerCase()}/${requirement.code}`,
      fileName,
      buffer,
      mimeType,
    );

    const needed = approvalRolesFor(
      requirement.code,
      requirement.category.pillar,
      requirement.requiresClinicSignature === true,
    );
    const initialStatus = DocumentFileStatus.SIGNED;

    const created = await this.prisma.documentFile.create({
      data: {
        requirementId: requirement.id,
        uploadedById: user.id,
        version,
        periodLabel: meta.periodLabel?.trim() || null,
        status: initialStatus,
        originalName,
        storageKey,
        mimeType,
        sizeBytes: buffer.length,
        checksum: contentHash,
        expiresAt: expiry,
        issuedAt,
        changeReason: meta.changeReason?.trim() || null,
        notes:
          meta.notes?.trim() ||
          (autoSigned
            ? `Rellenado con perfil y firma de ${brand.professionalName} (historia clínica).`
            : null),
      },
    });

    if (autoSigned) {
      const stamp =
        brand.signatureBase64 ||
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W2XQAAAAASUVORK5CYII=';
      // Firmante = profesional del consultorio (nunca cruzar con otro consultorio).
      const signerUserId =
        brand.professionalUserId ||
        (user.clinicId === clinicId ? user.id : null);
      await this.prisma.documentSignature.create({
        data: {
          documentFileId: created.id,
          role: DocumentSignerRole.CLINIC_ADMIN,
          signerUserId,
          signerName: brand.professionalName,
          signatureBase64: stamp,
          contentHash,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    }

    await this.recordAudit(clinicId, user, AuditAction.UPLOAD, created.id, context, {
      requirementCode: requirement.code,
      originalName,
      checksum: contentHash,
      version,
      periodLabel: meta.periodLabel ?? null,
      changeReason: meta.changeReason?.trim() || null,
      brandedProfessional: !sgsst && isPdf,
      autoSignedWithProfile: autoSigned,
    });

    return this.listFiles(user, requirement.id, clinicIdParam);
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
    await this.assertPillarEnabled(user, clinicId, requirement.category.pillar);

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

    const clinicRow = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { createdAt: true },
    });
    const clinicCreatedIso = clinicRow?.createdAt
      ? clinicRow.createdAt.toISOString().slice(0, 10)
      : null;
    const brand = await this.pdfBrand.resolveBrand(user, clinicId);

    const normalized = roles.map((role) => {
      const sig = provided.get(role)!;
      let signerName = (sig.signerName || '').trim();
      if (
        !signerName &&
        (role === DocumentSignerRole.ELABORO ||
          role === DocumentSignerRole.REVISO)
      ) {
        signerName = 'HABILISALUD';
      }
      if (!signerName && role === DocumentSignerRole.APROBO) {
        signerName = brand.professionalName;
      }
      const isHabiliRole =
        (role === DocumentSignerRole.ELABORO ||
          role === DocumentSignerRole.REVISO) &&
        /^habilisalud$/i.test(signerName);
      let signatureBase64 = (sig.signatureBase64 || '').trim();
      if (isHabiliRole && !signatureBase64.startsWith('data:image')) {
        signatureBase64 =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W2XQAAAAASUVORK5CYII=';
      } else {
        signatureBase64 = this.normalizeSignature(signatureBase64);
      }
      return { role, signerName, signatureBase64 };
    });

    const fechaDoc = (dto.fecha || clinicCreatedIso || '').trim();
    if (!fechaDoc) {
      throw new BadRequestException('Indique la fecha del documento.');
    }

    const periodLabel =
      dto.periodLabel?.trim() ||
      (() => {
        const d = new Date(fechaDoc);
        if (Number.isNaN(d.getTime())) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      })();

    const formData = {
      kind: isTrainingDoc(requirement.code) ? 'TRAINING_ACTA' : 'SGSST_FILL',
      fecha: fechaDoc,
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
        professionalName: brand.professionalName,
        professionalCard: brand.professionalCard,
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

    // Al diligenciar se limpia lo anterior: solo queda el PDF nuevo.
    await this.purgeRequirementFiles(requirement.id);

    const version = 1;
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

    const needsClinic = requirement.requiresClinicSignature === true;
    const neededRoles = approvalRolesFor(
      requirement.code,
      requirement.category.pillar,
      needsClinic,
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const approvalRole =
        user.role === UserRole.SUPER_ADMIN
          ? DocumentSignerRole.HABILISALUD
          : DocumentSignerRole.CLINIC_ADMIN;
      // Fuera de SG-SST el sello es solo del profesional; en SG-SST el rol
      // depende de quién diligencia.
      const sealRole = isSgsstFillable(
        requirement.code,
        requirement.category.pillar,
      )
        ? approvalRole
        : DocumentSignerRole.CLINIC_ADMIN;
      if (!neededRoles.includes(sealRole) && neededRoles.length) {
        // Si el profesional diligencia SG-SST sin Habili, igual deja CLINIC_ADMIN.
      }
      const approvalSig = {
        role: neededRoles.includes(sealRole)
          ? sealRole
          : neededRoles[0] ?? DocumentSignerRole.CLINIC_ADMIN,
        signerName: (user.fullName || user.email).trim(),
        signatureBase64: normalized[0].signatureBase64,
      };
      const initialRoles = [
        ...normalized.map((sig) => ({ role: sig.role })),
        { role: approvalSig.role },
      ];
      const initialStatus = approvalStatus(initialRoles, neededRoles);

      const file = await tx.documentFile.create({
        data: {
          requirementId: requirement.id,
          uploadedById: user.id,
          version,
          periodLabel,
          status: initialStatus,
          originalName: safeName,
          storageKey,
          mimeType: 'application/pdf',
          sizeBytes: pdfBuffer.length,
          checksum: contentHash,
          expiresAt,
          formData,
          notes:
            isSgsstFillable(requirement.code, requirement.category.pillar)
              ? user.role === UserRole.SUPER_ADMIN
                ? needsClinic
                  ? 'Documento SG-SST diligenciado por HABILISALUD. Pendiente firma del consultorio.'
                  : 'Documento SG-SST diligenciado y sellado por HABILISALUD.'
                : 'Documento SG-SST diligenciado por el consultorio. Pendiente sello HABILISALUD.'
              : 'Documento diligenciado con datos y firma del profesional del consultorio.',
        },
      });

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
      awaitingClinicCountersign:
        user.role === UserRole.SUPER_ADMIN &&
        needsClinic &&
        isSgsstFillable(requirement.code, requirement.category.pillar),
      awaitingHabilisaludSeal:
        user.role === UserRole.ADMIN &&
        isSgsstFillable(requirement.code, requirement.category.pillar),
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
    const clinicId = this.clinicScope(user, clinicIdParam);
    const file = await this.prisma.documentFile.findFirst({
      where: { id: fileId, requirement: { clinicId } },
      include: {
        requirement: {
          select: {
            id: true,
            code: true,
            category: { select: { pillar: true } },
          },
        },
        uploadedBy: { select: { role: true } },
      },
    });
    if (!file) throw new NotFoundException('Documento no encontrado');
    this.assertClinicDocFileCrud(
      user,
      file.requirement.category.pillar,
      file.requirement.code,
      clinicOwnsInfraFile(file.requirement.category.pillar, file),
    );
    if (file.status === DocumentFileStatus.RETIRED) {
      throw new ConflictException('No se puede editar una versión retirada');
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
        requirement: {
          select: {
            id: true,
            code: true,
            title: true,
            isEnabled: true,
            requiresClinicSignature: true,
            category: { select: { pillar: true } },
          },
        },
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

    const pillar = file.requirement.category.pillar;
    const sgsst = isSgsstFillable(file.requirement.code, pillar);
    const needed = approvalRolesFor(
      file.requirement.code,
      pillar,
      file.requirement.requiresClinicSignature === true,
    );
    const role = dto.role;

    if (user.role === UserRole.SUPER_ADMIN) {
      if (!sgsst || role !== DocumentSignerRole.HABILISALUD) {
        throw new BadRequestException(
          sgsst
            ? 'El superadministrador sella con el rol HABILISALUD. Las firmas de contenido se cargan con «Llenar y firmar».'
            : 'Fuera de SG-SST no aplica el sello HABILISALUD. Solo firma el profesional del consultorio.',
        );
      }
      if (!needed.includes(DocumentSignerRole.HABILISALUD)) {
        throw new BadRequestException(
          'Este documento SG-SST no requiere sello HABILISALUD.',
        );
      }
    } else if (
      user.role === UserRole.ADMIN ||
      user.role === UserRole.HEALTH_PROFESSIONAL
    ) {
      this.assertClinicCountersigner(user);
      if (role !== DocumentSignerRole.CLINIC_ADMIN) {
        throw new BadRequestException(
          'El consultorio firma como profesional (CLINIC_ADMIN).',
        );
      }
      if (!needed.includes(DocumentSignerRole.CLINIC_ADMIN)) {
        throw new ForbiddenException(
          'Este documento no exige firma del profesional del consultorio.',
        );
      }
      if (
        sgsst &&
        needed.includes(DocumentSignerRole.HABILISALUD) &&
        !hasRole(file.signatures, DocumentSignerRole.HABILISALUD)
      ) {
        throw new ForbiddenException(
          'Aún no puede firmar: el superadministrador de HABILISALUD debe firmar primero (solo SG-SST).',
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
    const nextStatus = approvalStatus(rolesAfter, needed);

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
        sgsst &&
        role === DocumentSignerRole.HABILISALUD &&
        file.requirement.requiresClinicSignature &&
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
    const brand = await this.pdfBrand.resolveBrand(user, clinicId);
    const isPdf =
      file.mimeType === 'application/pdf' ||
      file.originalName.toLowerCase().endsWith('.pdf');
    const output = isPdf ? await this.pdfBrand.brandPdf(buffer, brand) : buffer;

    await this.recordAudit(clinicId, user, AuditAction.VIEW, file.id, context, {
      requirementCode: file.requirement.code,
      originalName: file.originalName,
      version: file.version,
      branded: isPdf,
    });

    return new StreamableFile(output, {
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
    const brand = await this.pdfBrand.resolveBrand(user, clinicId);
    const filled = this.pdfBrand.fillProfessionalPlaceholders(value, brand);
    const html = `${this.pdfBrand.bannerHtml(brand)}${filled}`;

    await this.recordAudit(clinicId, user, AuditAction.VIEW, file.id, context, {
      requirementCode: file.requirement.code,
      preview: 'html',
      version: file.version,
    });

    return {
      fileId: file.id,
      originalName: file.originalName,
      version: file.version,
      html,
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

  /**
   * Retiro: elimina ese archivo sin dejar rastro (DB + disco).
   * Si hay otros documentos en la misma carpeta/requisito, se conservan.
   */
  /**
   * Archivado lógico de una versión: deja de contar como vigente, pero el archivo
   * y sus firmas se conservan en el historial (trazabilidad de habilitación).
   */
  async retire(user: User, fileId: string, context: AuditContext, clinicIdParam?: string) {
    const clinicId = this.clinicScope(user, clinicIdParam);
    const file = await this.prisma.documentFile.findFirst({
      where: { id: fileId, requirement: { clinicId } },
      include: {
        requirement: {
          select: { id: true, code: true, category: { select: { pillar: true } } },
        },
        uploadedBy: { select: { role: true } },
      },
    });
    if (!file) throw new NotFoundException('Documento no encontrado');
    this.assertClinicDocFileCrud(
      user,
      file.requirement.category.pillar,
      file.requirement.code,
      clinicOwnsInfraFile(file.requirement.category.pillar, file),
    );
    if (file.status !== DocumentFileStatus.RETIRED) {
      await this.prisma.documentFile.update({
        where: { id: file.id },
        data: { status: DocumentFileStatus.RETIRED, retiredAt: new Date() },
      });
      await this.recordAudit(clinicId, user, AuditAction.UPDATE, file.id, context, {
        archived: true,
        requirementCode: file.requirement.code,
        originalName: file.originalName,
        version: file.version,
      });
    }
    return this.listFiles(user, file.requirement.id, clinicIdParam);
  }

  /**
   * Eliminación definitiva de un archivo (firmas + disco).
   * Solo superadmin y solo sobre versiones ya archivadas: nunca de forma directa.
   * No borra los demás documentos del mismo requisito.
   */
  async deleteFilePermanent(
    user: User,
    fileId: string,
    context: AuditContext,
    clinicIdParam?: string,
  ) {
    const clinicId = this.clinicScope(user, clinicIdParam);
    const file = await this.prisma.documentFile.findFirst({
      where: { id: fileId, requirement: { clinicId } },
      include: {
        requirement: {
          select: {
            id: true,
            code: true,
            category: { select: { pillar: true } },
          },
        },
      },
    });
    if (!file) throw new NotFoundException('Documento no encontrado');
    this.assertDocumentWriter(user);
    if (file.status !== DocumentFileStatus.RETIRED) {
      throw new ConflictException(
        'Primero archive esta versión. Solo las versiones archivadas pueden eliminarse definitivamente.',
      );
    }

    const requirementId = file.requirement.id;
    const storageKey = file.storageKey;

    await this.prisma.documentFile.delete({ where: { id: file.id } });
    await this.storage.deleteStored(storageKey).catch(() => undefined);

    await this.recordAudit(clinicId, user, AuditAction.UPDATE, fileId, context, {
      permanent: true,
      deleted: true,
      requirementCode: file.requirement.code,
      originalName: file.originalName,
      storageKey,
      version: file.version,
    });

    return this.listFiles(user, requirementId, clinicIdParam);
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

  async setRequirementClinicSignature(
    user: User,
    requirementId: string,
    requiresClinicSignature: boolean,
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
      data: { requiresClinicSignature },
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

  async listCategories(user: User) {
    this.assertDocumentWriter(user);
    for (const folder of FT_DOC_CATEGORY_HINTS) {
      await this.prisma.documentCategory.upsert({
        where: { code: folder.code },
        create: {
          code: folder.code,
          name: folder.name,
          sortOrder: folder.sortOrder,
          pillar: folder.pillar,
        },
        update: {
          name: folder.name,
          sortOrder: folder.sortOrder,
          pillar: folder.pillar,
        },
      });
    }
    return this.prisma.documentCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, pillar: true, sortOrder: true },
    });
  }

  async createRequirement(
    user: User,
    dto: {
      categoryId: string;
      code: string;
      title: string;
      description?: string;
      isMandatory?: boolean;
      requiresClinicSignature?: boolean;
      responsibleName?: string;
      responsibleArea?: string;
      validityDays?: number;
    },
    clinicIdParam?: string,
  ) {
    this.assertDocumentWriter(user);
    const clinicId = this.clinicScope(user, clinicIdParam);
    const category = await this.prisma.documentCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    if (!category.isActive) {
      throw new BadRequestException('Este tipo documental está desactivado.');
    }

    const code = dto.code.trim().toUpperCase().replace(/\s+/g, '_');
    const existing = await this.prisma.documentRequirement.findFirst({
      where: { clinicId, code },
    });
    if (existing) {
      throw new BadRequestException(`Ya existe el requisito ${code} en este consultorio`);
    }

    await this.prisma.documentRequirement.create({
      data: {
        clinicId,
        categoryId: category.id,
        code,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        isMandatory: dto.isMandatory !== false,
        isEnabled: true,
        requiresClinicSignature: dto.requiresClinicSignature === true,
        responsibleName: dto.responsibleName?.trim() || null,
        responsibleArea: dto.responsibleArea?.trim() || null,
        validityDays: dto.validityDays && dto.validityDays > 0 ? Math.round(dto.validityDays) : null,
      },
    });
    return this.overview(user, undefined, clinicId);
  }

  async clearClinicDocuments(user: User, clinicIdParam?: string) {
    this.assertDocumentWriter(user);
    const clinicId = this.clinicScope(user, clinicIdParam);
    const deleted = await this.prisma.documentRequirement.deleteMany({
      where: { clinicId },
    });
    return {
      clinicId,
      deletedRequirements: deleted.count,
      overview: await this.overview(user, undefined, clinicId),
    };
  }

  /**
   * Copia requisitos (+ último archivo activo) del consultorio origen a otros
   * de la misma especialidad (o a targets explícitos).
   */
  async replicateDocuments(
    user: User,
    opts: {
      sourceClinicId: string;
      targetClinicIds?: string[];
      includeFiles?: boolean;
    },
  ) {
    this.assertDocumentWriter(user);
    const source = await this.prisma.clinic.findUnique({
      where: { id: opts.sourceClinicId },
      select: { id: true, name: true, specialty: true },
    });
    if (!source) throw new NotFoundException('Consultorio origen no encontrado');

    const sourceReqs = await this.prisma.documentRequirement.findMany({
      where: { clinicId: source.id },
      include: {
        category: true,
        files: {
          where: { status: { not: DocumentFileStatus.RETIRED } },
          orderBy: { version: 'asc' },
        },
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { code: 'asc' }],
    });

    if (!sourceReqs.length) {
      throw new BadRequestException(
        'El consultorio origen no tiene requisitos para replicar. Cargue primero la documentación.',
      );
    }

    let targets = opts.targetClinicIds?.length
      ? await this.prisma.clinic.findMany({
          where: {
            id: { in: opts.targetClinicIds },
            isActive: true,
          },
          select: { id: true, name: true, specialty: true },
        })
      : await this.prisma.clinic.findMany({
          where: {
            isActive: true,
            specialty: source.specialty,
            id: { not: source.id },
            dashboardType: 'CLINICAL_HISTORY_WITH_DOCS',
          },
          select: { id: true, name: true, specialty: true },
        });

    targets = targets.filter((t) => t.id !== source.id);
    if (!targets.length) {
      throw new BadRequestException('No hay consultorios destino para replicar.');
    }

    const includeFiles = opts.includeFiles !== false;
    const results: Array<{
      clinicId: string;
      clinicName: string;
      created: number;
      updated: number;
      filesCopied: number;
    }> = [];

    for (const target of targets) {
      let created = 0;
      let updated = 0;
      let filesCopied = 0;

      for (const req of sourceReqs) {
        const existing = await this.prisma.documentRequirement.findFirst({
          where: { clinicId: target.id, code: req.code },
        });

        let targetReqId: string;
        if (existing) {
          await this.prisma.documentRequirement.update({
            where: { id: existing.id },
            data: {
              categoryId: req.categoryId,
              title: req.title,
              description: req.description,
              isMandatory: req.isMandatory,
              isEnabled: req.isEnabled,
              validityDays: req.validityDays,
              requiresClinicSignature: req.requiresClinicSignature,
            },
          });
          targetReqId = existing.id;
          updated += 1;
        } else {
          const createdReq = await this.prisma.documentRequirement.create({
            data: {
              clinicId: target.id,
              categoryId: req.categoryId,
              code: req.code,
              title: req.title,
              description: req.description,
              isMandatory: req.isMandatory,
              isEnabled: req.isEnabled,
              validityDays: req.validityDays,
              requiresClinicSignature: req.requiresClinicSignature,
            },
          });
          targetReqId = createdReq.id;
          created += 1;
        }

        const sourceFiles = req.files;
        if (includeFiles && sourceFiles.length) {
          // Evita acumular réplicas viejas: deja solo los archivos autodiligenciados.
          await this.purgeRequirementFiles(targetReqId);
          const brand = await this.pdfBrand.resolveBrand(user, target.id);

          for (const sourceFile of sourceFiles) {
            try {
              let buffer = await this.storage.readBuffer(sourceFile.storageKey);
              const mime =
                sourceFile.mimeType || 'application/octet-stream';
              const isPdf =
                mime.includes('pdf') ||
                sourceFile.originalName.toLowerCase().endsWith('.pdf');
              if (isPdf) {
                // Autodiligencia con nombre / REPS / datos del profesional destino.
                buffer = await this.pdfBrand.brandPdf(buffer, brand, {
                  force: true,
                });
              }
              const last = await this.prisma.documentFile.findFirst({
                where: { requirementId: targetReqId },
                orderBy: { version: 'desc' },
                select: { version: true },
              });
              const version = (last?.version ?? 0) + 1;
              const safeExt = (extname(sourceFile.originalName) || '').slice(
                0,
                12,
              );
              const fileName = `v${version}-replica-${Date.now()}${safeExt}`;
              const { storageKey, contentHash } = await this.storage.writeBuffer(
                `habilitation-docs/${target.id}/${req.category.pillar.toLowerCase()}/${req.code}`,
                fileName,
                buffer,
                mime,
              );
              await this.prisma.documentFile.create({
                data: {
                  requirementId: targetReqId,
                  uploadedById: user.id,
                  version,
                  periodLabel: sourceFile.periodLabel,
                  status: DocumentFileStatus.SIGNED,
                  originalName: sourceFile.originalName,
                  storageKey,
                  mimeType: mime,
                  sizeBytes: buffer.length,
                  checksum: contentHash,
                  expiresAt: sourceFile.expiresAt,
                  notes: `Réplica autodiligenciada desde ${source.name} → ${target.name} (${brand.professionalName}${brand.professionalCard ? ` · REPS/TP ${brand.professionalCard}` : ''}).`,
                },
              });
              filesCopied += 1;
            } catch {
              // Continuar con el resto si un archivo no se puede leer/sellar.
            }
          }
        }
      }

      results.push({
        clinicId: target.id,
        clinicName: target.name,
        created,
        updated,
        filesCopied,
      });
    }

    return {
      sourceClinicId: source.id,
      sourceClinicName: source.name,
      specialty: source.specialty,
      requirementCount: sourceReqs.length,
      targets: results,
    };
  }

  /**
   * Importa una carpeta maestra (subcarpetas + archivos) o un ZIP equivalente
   * al expediente del consultorio. Idempotente por checksum.
   */
  async importMasterPack(
    user: User,
    clinicIdParam: string | undefined,
    opts: {
      files?: Express.Multer.File[];
      relativePaths?: string[];
      zip?: Express.Multer.File | null;
      ensureStructure?: boolean;
    },
  ) {
    this.assertDocumentWriter(user);
    const clinicId = this.clinicScope(user, clinicIdParam);
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        specialty: true,
        dashboardType: true,
      },
    });
    if (!clinic) throw new NotFoundException('Consultorio no encontrado');

    const zip = opts.zip;
    const files = (opts.files ?? []).filter((f) => f?.buffer?.length);
    if (!zip && !files.length) {
      throw new BadRequestException(
        'Seleccione una carpeta con documentos o un archivo ZIP.',
      );
    }

    if (opts.ensureStructure !== false) {
      const dashboard =
        clinic.dashboardType || 'CLINICAL_HISTORY_WITH_DOCS';
      if (!clinic.dashboardType) {
        await this.prisma.clinic.update({
          where: { id: clinicId },
          data: { dashboardType: 'CLINICAL_HISTORY_WITH_DOCS' },
        });
      }
      await this.documentProvision.ensureForClinic(clinicId, dashboard);
    }

    const reqCount = await this.prisma.documentRequirement.count({
      where: { clinicId },
    });
    if (!reqCount) {
      throw new BadRequestException(
        'El consultorio no tiene estructura documental. Asigne el dashboard «Historia clínica + docs» o cree requisitos antes de importar.',
      );
    }

    const tempRoot = mkdtempSync(join(tmpdir(), 'hs-master-pack-'));
    try {
      let packRoot = tempRoot;
      if (zip) {
        if (!/\.zip$/i.test(zip.originalname || '')) {
          throw new BadRequestException('El archivo comprimido debe ser .zip');
        }
        if (zip.size > 200 * 1024 * 1024) {
          throw new BadRequestException('El ZIP supera los 200 MB permitidos');
        }
        const zipPath = join(tempRoot, 'pack.zip');
        writeFileSync(zipPath, zip.buffer);
        const archive = new AdmZip(zipPath);
        archive.extractAllTo(join(tempRoot, 'extracted'), true);
        packRoot = this.resolvePackRoot(join(tempRoot, 'extracted'));
      } else {
        const paths = opts.relativePaths ?? [];
        if (paths.length && paths.length !== files.length) {
          throw new BadRequestException(
            'La lista de rutas relativas no coincide con los archivos enviados.',
          );
        }
        const staging = join(tempRoot, 'folder');
        mkdirSync(staging, { recursive: true });
        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          const relRaw =
            (paths[i] || file.originalname || `file-${i}`).replace(/\\/g, '/');
          const rel = relRaw.replace(/^\/+/, '');
          if (!rel || rel.includes('..')) {
            throw new BadRequestException(`Ruta inválida: ${relRaw}`);
          }
          const abs = join(staging, ...rel.split('/').filter(Boolean));
          const normalized = pathNormalize(abs);
          if (!normalized.startsWith(pathNormalize(staging) + sep) && normalized !== pathNormalize(staging)) {
            throw new BadRequestException(`Ruta fuera de la carpeta: ${relRaw}`);
          }
          mkdirSync(dirname(normalized), { recursive: true });
          writeFileSync(normalized, file.buffer);
        }
        packRoot = this.resolvePackRoot(staging);
      }

      const stats = await this.packImport.importFromDirectory(
        clinicId,
        packRoot,
        user.id,
      );

      return {
        clinicId,
        clinicName: clinic.name,
        packRootHint: packRoot.split(sep).slice(-2).join('/'),
        stats,
        overview: await this.overview(user, undefined, clinicId),
      };
    } finally {
      try {
        rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  /** Si hay una sola carpeta raíz con el contenido, úsala como packRoot. */
  private resolvePackRoot(extractedDir: string) {
    if (!existsSync(extractedDir)) return extractedDir;
    const entries = readdirSync(extractedDir, { withFileTypes: true }).filter(
      (e) => e.name !== '__MACOSX' && e.name !== '.DS_Store',
    );
    const dirs = entries.filter((e) => e.isDirectory());
    const files = entries.filter((e) => e.isFile());
    if (dirs.length === 1 && files.length === 0) {
      return join(extractedDir, dirs[0].name);
    }
    return extractedDir;
  }

  /**
   * Catálogo de documentos para que SUPER_ADMIN asigne al consultorio.
   * Fuente: requisitos de un consultorio origen (o el más completo de la misma especialidad).
   */
  async getAssignmentCatalog(
    user: User,
    clinicIdParam?: string,
    sourceClinicIdParam?: string,
  ) {
    this.assertDocumentWriter(user);
    const clinicId = this.clinicScope(user, clinicIdParam);
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true, specialty: true },
    });
    if (!clinic) throw new NotFoundException('Consultorio no encontrado');

    const peers = await this.prisma.clinic.findMany({
      where: {
        isActive: true,
        specialty: clinic.specialty,
        dashboardType: 'CLINICAL_HISTORY_WITH_DOCS',
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    let sourceClinicId = sourceClinicIdParam?.trim() || '';
    if (sourceClinicId && !peers.some((p) => p.id === sourceClinicId)) {
      // Permitir también cualquier consultorio activo como plantilla.
      const any = await this.prisma.clinic.findFirst({
        where: { id: sourceClinicId, isActive: true },
        select: { id: true },
      });
      if (!any) sourceClinicId = '';
    }

    if (!sourceClinicId) {
      // El peer con más requisitos (excluyendo el propio si está vacío).
      const counts = await this.prisma.documentRequirement.groupBy({
        by: ['clinicId'],
        where: { clinicId: { in: peers.map((p) => p.id) } },
        _count: { _all: true },
      });
      counts.sort((a, b) => b._count._all - a._count._all);
      sourceClinicId =
        counts.find((c) => c.clinicId !== clinicId)?.clinicId ||
        counts[0]?.clinicId ||
        '';
    }

    // Si no hay plantilla en la especialidad, usa cualquier consultorio con docs.
    if (!sourceClinicId) {
      const anyRich = await this.prisma.documentRequirement.groupBy({
        by: ['clinicId'],
        _count: { _all: true },
      });
      anyRich.sort((a, b) => b._count._all - a._count._all);
      sourceClinicId = anyRich[0]?.clinicId || '';
    }

    const sourceClinic = sourceClinicId
      ? await this.prisma.clinic.findUnique({
          where: { id: sourceClinicId },
          select: { id: true, name: true, specialty: true },
        })
      : null;

    const templateReqs = sourceClinicId
      ? await this.prisma.documentRequirement.findMany({
          where: { clinicId: sourceClinicId },
          include: {
            category: {
              select: {
                id: true,
                code: true,
                name: true,
                pillar: true,
                sortOrder: true,
              },
            },
          },
          orderBy: [
            { category: { sortOrder: 'asc' } },
            { code: 'asc' },
          ],
        })
      : [];

    const assigned = await this.prisma.documentRequirement.findMany({
      where: { clinicId },
      select: {
        id: true,
        code: true,
        isEnabled: true,
        title: true,
      },
    });
    const assignedByCode = new Map(assigned.map((r) => [r.code, r]));

    const items = templateReqs.map((req) => {
      const current = assignedByCode.get(req.code);
      return {
        code: req.code,
        title: req.title,
        description: req.description,
        isMandatory: req.isMandatory,
        requiresClinicSignature: req.requiresClinicSignature,
        category: req.category,
        alreadyAssigned: !!current,
        assignedEnabled: current?.isEnabled ?? false,
        assignedRequirementId: current?.id ?? null,
      };
    });

    // Incluye requisitos propios que no están en la plantilla (docs a medida).
    for (const row of assigned) {
      if (items.some((i) => i.code === row.code)) continue;
      const full = await this.prisma.documentRequirement.findUnique({
        where: { id: row.id },
        include: {
          category: {
            select: {
              id: true,
              code: true,
              name: true,
              pillar: true,
              sortOrder: true,
            },
          },
        },
      });
      if (!full) continue;
      items.push({
        code: full.code,
        title: full.title,
        description: full.description,
        isMandatory: full.isMandatory,
        requiresClinicSignature: full.requiresClinicSignature,
        category: full.category,
        alreadyAssigned: true,
        assignedEnabled: full.isEnabled,
        assignedRequirementId: full.id,
      });
    }

    items.sort((a, b) => {
      const sa = a.category.sortOrder - b.category.sortOrder;
      if (sa !== 0) return sa;
      return a.code.localeCompare(b.code);
    });

    return {
      clinic: {
        id: clinic.id,
        name: clinic.name,
        specialty: clinic.specialty,
      },
      sourceClinic: sourceClinic
        ? {
            id: sourceClinic.id,
            name: sourceClinic.name,
            specialty: sourceClinic.specialty,
          }
        : null,
      peerClinics: peers,
      items,
      selectedCodes: items
        .filter((i) => i.alreadyAssigned && i.assignedEnabled)
        .map((i) => i.code),
    };
  }

  /**
   * Crea/habilita los códigos seleccionados en el consultorio.
   * Por defecto deshabilita los no seleccionados (sin borrar archivos).
   */
  async assignRequirements(
    user: User,
    dto: {
      codes: string[];
      syncDisabled?: boolean;
      sourceClinicId?: string;
    },
    clinicIdParam?: string,
  ) {
    this.assertDocumentWriter(user);
    const clinicId = this.clinicScope(user, clinicIdParam);
    const wanted = [
      ...new Set(
        (dto.codes || [])
          .map((c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '_'))
          .filter(Boolean),
      ),
    ];

    const catalog = await this.getAssignmentCatalog(
      user,
      clinicId,
      dto.sourceClinicId,
    );
    const byCode = new Map(catalog.items.map((i) => [i.code, i]));

    let created = 0;
    let enabled = 0;
    let disabled = 0;
    let skippedUnknown = 0;

    for (const code of wanted) {
      const template = byCode.get(code);
      if (!template) {
        skippedUnknown += 1;
        continue;
      }

      const existing = await this.prisma.documentRequirement.findFirst({
        where: { clinicId, code },
      });
      if (existing) {
        if (!existing.isEnabled) {
          await this.prisma.documentRequirement.update({
            where: { id: existing.id },
            data: { isEnabled: true },
          });
          enabled += 1;
        }
        continue;
      }

      // Asegura categoría (puede no existir aún en BD global).
      let categoryId = template.category.id;
      const cat = await this.prisma.documentCategory.findUnique({
        where: { id: categoryId },
      });
      if (!cat) {
        const upserted = await this.prisma.documentCategory.upsert({
          where: { code: template.category.code },
          create: {
            code: template.category.code,
            name: template.category.name,
            sortOrder: template.category.sortOrder,
            pillar: template.category.pillar,
          },
          update: {
            name: template.category.name,
            sortOrder: template.category.sortOrder,
            pillar: template.category.pillar,
          },
        });
        categoryId = upserted.id;
      }

      await this.prisma.documentRequirement.create({
        data: {
          clinicId,
          categoryId,
          code,
          title: template.title,
          description: template.description,
          isMandatory: template.isMandatory,
          isEnabled: true,
          requiresClinicSignature: template.requiresClinicSignature,
        },
      });
      created += 1;
    }

    const syncDisabled = dto.syncDisabled !== false;
    if (syncDisabled) {
      const wantedSet = new Set(wanted);
      const current = await this.prisma.documentRequirement.findMany({
        where: { clinicId, isEnabled: true },
        select: { id: true, code: true },
      });
      const toDisable = current.filter((r) => !wantedSet.has(r.code));
      if (toDisable.length) {
        await this.prisma.documentRequirement.updateMany({
          where: { id: { in: toDisable.map((r) => r.id) } },
          data: { isEnabled: false },
        });
        disabled = toDisable.length;
      }
    }

    return {
      clinicId,
      created,
      enabled,
      disabled,
      skippedUnknown,
      selectedCount: wanted.length,
      overview: await this.overview(user, undefined, clinicId),
      catalog: await this.getAssignmentCatalog(
        user,
        clinicId,
        dto.sourceClinicId || catalog.sourceClinic?.id,
      ),
    };
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
