import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import SignaturePad from 'signature_pad';
import { WEBSITE_URL } from '../api.config';
import { AdminApiService } from '../admin-api.service';
import { AuthService } from '../auth.service';
import { ClinicalApiService } from '../clinical/clinical-api.service';
import { Clinic, ClinicSpecialty, DashboardType, SPECIALTY_LABELS } from '../models';
import { ClinicLogoSettings } from '../clinic-settings/clinic-logo-settings';
import { HabIcon } from '../habilitation/hab-icon';
import { HabilitationDocs } from '../habilitation/habilitation-docs';
import { SaShell } from '../super-admin/sa-shell';
import { DocumentsApiService } from './documents-api.service';
import {
  ComplianceStatus,
  DocumentFileRow,
  DocumentFileStatus,
  DocumentPillar,
  DocumentSignerRole,
  DocumentsOverview,
  PendingCountersign,
  PillarNode,
  RequirementDetail,
  RequirementRow,
  SignedArchive,
} from './documents.models';

type StatusFilter = 'ALL' | 'RED' | 'YELLOW' | 'GREEN';
type MainTab = 'expediente' | 'historico';

/** Orden de los grupos: los 7 estándares de la Res. 3100 de 2019 y luego los grupos de apoyo. */
const PILLAR_ORDER: DocumentPillar[] = [
  'TALENTO_HUMANO',
  'INFRAESTRUCTURA',
  'DOTACION',
  'MEDICAMENTOS_INSUMOS',
  'PROCESOS_PRIORITARIOS',
  'HISTORIA_CLINICA',
  'INTERDEPENDENCIA',
  'DOCUMENTACION_LEGAL',
  'SG_SST',
];
const SUPPORT_PILLARS = new Set<DocumentPillar>(['DOCUMENTACION_LEGAL', 'SG_SST']);

interface BulkRow {
  key: number;
  file: File;
  requirementId: string;
  state: 'pendiente' | 'subiendo' | 'ok' | 'error';
  message: string;
  /** Supera 25 MB: se muestra pero no se carga. */
  tooBig: boolean;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Sugiere el requisito por código (p. ej. «TH-01») o por coincidencia de palabras del título. */
function suggestRequirement(fileName: string, options: { id: string; code: string; title: string }[]): string {
  const name = normalize(fileName);
  const compact = name.replace(/ /g, '');
  const byCode = options
    .filter((o) => o.code && compact.includes(normalize(o.code).replace(/ /g, '')))
    .sort((a, b) => b.code.length - a.code.length)[0];
  if (byCode) return byCode.id;
  const words = new Set(name.split(' ').filter((w) => w.length > 3));
  let best = { id: '', score: 0 };
  for (const o of options) {
    const titleWords = normalize(o.title).split(' ').filter((w) => w.length > 3);
    if (!titleWords.length) continue;
    const hits = titleWords.filter((w) => words.has(w)).length;
    const score = hits / titleWords.length;
    if (hits >= 2 && score > best.score) best = { id: o.id, score };
  }
  return best.score >= 0.5 ? best.id : '';
}

const ROLE_LABELS: Record<DocumentSignerRole, string> = {
  ELABORO: 'Elaboró',
  REVISO: 'Revisó',
  APROBO: 'Aprobó',
  CAPACITADOR: 'Firma Capacitador',
  ASISTENTE: 'Firma Asistente / Evaluado',
  HABILISALUD: 'HABILISALUD (superadmin)',
  CLINIC_ADMIN: 'Profesional del consultorio',
};

function describeError(error: unknown): string {
  const err = error as { status?: number; error?: { message?: string | string[] } };
  if (err?.status === 0) {
    return 'No hubo respuesta del servidor. Revisa que la API esté corriendo.';
  }
  const message = err?.error?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || 'No se pudo completar la operación.';
}

@Component({
  selector: 'app-documents-dashboard',
  imports: [RouterLink, FormsModule, DatePipe, NgTemplateOutlet, ClinicLogoSettings, SaShell, HabIcon, HabilitationDocs],
  templateUrl: './documents-dashboard.html',
  styleUrls: ['./documents-dashboard.scss', './documents-dashboard-sa.scss'],
  host: { '[class.sa]': 'canManage()' },
})
export class DocumentsDashboard {
  private readonly api = inject(DocumentsApiService);
  private readonly adminApi = inject(AdminApiService);
  private readonly clinicalApi = inject(ClinicalApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  readonly websiteUrl = WEBSITE_URL;
  readonly roleLabels = ROLE_LABELS;
  readonly canManage = this.auth.canManageDocuments;
  readonly canFill = this.auth.canFillDocuments;
  readonly canUpload = this.auth.canUploadDocuments;
  readonly canDownload = this.auth.canDownloadDocuments;
  readonly canCountersign = this.auth.canCountersignDocuments;
  readonly canClinicDocCrud = this.auth.canClinicDocCrud;
  readonly canSign = this.auth.canSignDocuments;
  readonly homeLink = computed(() =>
    this.auth.isSuperAdmin() ? '/admin' : '/consultorio.html',
  );

  readonly clinics = signal<Clinic[]>([]);
  readonly selectedClinicId = signal('');
  readonly selectedClinicName = signal('');
  readonly categories = signal<
    Array<{ id: string; code: string; name: string; pillar: string; sortOrder: number }>
  >([]);
  newReq = { categoryId: '', code: '', title: '', description: '' };

  /** Panel SUPER_ADMIN: asignar documentos del catálogo al consultorio. */
  readonly assignOpen = signal(false);
  readonly assignLoading = signal(false);
  readonly assignSaving = signal(false);
  readonly assignSourceClinicId = signal('');
  readonly assignPeerClinics = signal<Array<{ id: string; name: string }>>([]);
  readonly assignItems = signal<
    Array<{
      code: string;
      title: string;
      description: string | null;
      category: { code: string; name: string; sortOrder: number };
      alreadyAssigned: boolean;
      assignedEnabled: boolean;
    }>
  >([]);
  readonly assignSelected = signal<Set<string>>(new Set());
  readonly assignQuery = signal('');

  /** Panel aparte: subir carpeta maestra (ZIP o carpeta con subcarpetas). */
  readonly masterPackOpen = signal(false);
  readonly masterPackTarget = signal<'existing' | 'new'>('existing');
  readonly masterPackImporting = signal(false);
  readonly masterPackFileCount = signal(0);
  readonly masterPackMode = signal<'folder' | 'zip'>('folder');
  readonly specialties = Object.entries(SPECIALTY_LABELS) as [
    ClinicSpecialty,
    string,
  ][];
  masterPackNew = {
    name: '',
    specialty: 'PSYCHOLOGY' as ClinicSpecialty,
    address: '',
    phone: '',
    adminFullName: '',
    adminEmail: '',
    adminPassword: '',
  };
  private masterPackFiles: File[] = [];
  private masterPackPaths: string[] = [];
  private masterPackZip: File | null = null;

  masterPackZipName() {
    return this.masterPackZip?.name ?? '';
  }

  readonly overview = signal<DocumentsOverview | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');

  readonly query = signal('');
  readonly statusFilter = signal<StatusFilter>('ALL');
  readonly openPillars = signal<Set<string>>(new Set());
  readonly mainTab = signal<MainTab>('expediente');

  /** Histórico mensual de firmados (auditoría). */
  readonly archive = signal<SignedArchive | null>(null);
  readonly archiveLoading = signal(false);
  readonly archivePeriod = signal(new Date().toISOString().slice(0, 7));
  readonly archiveQuery = signal('');
  readonly archiveDownloadingAll = signal(false);

  readonly detail = signal<RequirementDetail | null>(null);
  readonly detailLoading = signal(false);

  /** Versión abierta en el visor / firmador. */
  readonly viewing = signal<DocumentFileRow | null>(null);
  /** Otros archivos activos del mismo requisito (p. ej. RETIE: certificación + tarjeta). */
  readonly viewerSiblings = signal<DocumentFileRow[]>([]);
  readonly viewRequirementTitle = signal('');
  readonly previewKind = signal<'pdf' | 'image' | 'html' | 'none'>('none');
  readonly previewUrl = signal<SafeResourceUrl | null>(null);
  readonly previewImageSrc = signal<string | null>(null);
  readonly previewHtml = signal<SafeHtml | null>(null);
  readonly previewLoading = signal(false);

  readonly activeSignRole = signal<DocumentSignerRole>('HABILISALUD');
  readonly signing = signal(false);
  /** Firma manuscrita guardada al firmar la historia clínica (perfil del profesional). */
  readonly profileSignature = signal<string | null>(null);
  readonly profileSignerName = signal('');

  readonly uploading = signal<string | null>(null);
  readonly pendingExpiry = signal('');
  readonly pendingPeriod = signal('');
  /** Edición de metadatos de una versión (SUPER_ADMIN). */
  readonly editingFileId = signal<string | null>(null);
  editMeta = { periodLabel: '', expiresAt: '', notes: '' };

  /** Formulario de diligenciamiento SG-SST (todos los docs del pilar). */
  readonly fillOpen = signal(false);
  readonly fillRequirementId = signal<string | null>(null);
  readonly fillRequirementTitle = signal('');
  readonly fillSaving = signal(false);
  readonly fillIsTraining = signal(false);
  readonly fillRoles = signal<DocumentSignerRole[]>([]);

  /**
   * Modelo mutable con [(ngModel)]. Los signals en cada tecla rompían el foco
   * y parecía que “solo la firma” respondía.
   */
  fillModel = {
    tema: '',
    fecha: new Date().toISOString().slice(0, 10),
    periodLabel: new Date().toISOString().slice(0, 7),
    objetivo: '',
    contenido: '',
    /** Capacitador / quien evalúa o Elaboró */
    nombre1: '',
    /** Asistente / persona evaluada o Revisó */
    nombre2: '',
    /** Aprobó (solo docs generales) */
    nombre3: '',
    firma1: null as string | null,
    firma2: null as string | null,
    firma3: null as string | null,
  };

  private readonly signCanvas = viewChild<ElementRef<HTMLCanvasElement>>('signPad');
  private signaturePad: SignaturePad | null = null;
  private objectUrl: string | null = null;

  /** Roles de sello: ya no se exigen pendientes de firma. */
  readonly signRoles = computed<DocumentSignerRole[]>(() => {
    const file = this.viewing();
    if (file?.requiredRoles) return file.requiredRoles;
    const detail = this.detail();
    if (detail?.requiredRoles) return detail.requiredRoles;
    return [];
  });

  readonly pendingCountersignatures = computed<PendingCountersign[]>(() => {
    return this.overview()?.pendingCountersignatures ?? [];
  });

  /** Docs SG-SST listos para diligenciar (admin consultorio / superadmin). */
  readonly fillableRequirements = computed(() => {
    const data = this.overview();
    if (!data || !this.canFill()) return [];
    const rows: Array<{ id: string; title: string; code: string }> = [];
    for (const pillar of data.pillars) {
      for (const category of pillar.categories) {
        for (const req of category.requirements) {
          if (req.fillable && req.isEnabled !== false) {
            rows.push({ id: req.id, title: req.title, code: req.code });
          }
        }
      }
    }
    return rows;
  });

  /** El usuario actual puede usar el pad sobre el archivo abierto. */
  canSignFile(file: DocumentFileRow): boolean {
    if (file.status === 'SIGNED' || file.status === 'RETIRED') return false;
    const roles = file.requiredRoles?.length
      ? file.requiredRoles
      : this.signRoles();
    if (this.canManage()) {
      return roles.includes('HABILISALUD') && !file.hasHabilisaludSignature;
    }
    if (this.canCountersign()) {
      if (!roles.includes('CLINIC_ADMIN') || file.hasClinicAdminSignature) {
        return false;
      }
      // SG-SST: esperar sello Habili si aplica; resto: firmar de inmediato.
      if (roles.includes('HABILISALUD') && !file.hasHabilisaludSignature) {
        return false;
      }
      return true;
    }
    return false;
  }

  canSignRole(file: DocumentFileRow, role: DocumentSignerRole): boolean {
    if (this.hasRole(file, role)) return false;
    if (!this.canSignFile(file)) return false;
    if (this.canManage()) return role === 'HABILISALUD';
    if (this.canCountersign()) return role === 'CLINIC_ADMIN';
    return false;
  }

  isSgsstFile(file: DocumentFileRow | null | undefined) {
    if (!file) return false;
    return !!file.fillable || (file.requiredRoles ?? []).includes('HABILISALUD');
  }

  readonly archiveFiles = computed(() => {
    const data = this.archive();
    if (!data) return [];
    const q = this.archiveQuery().trim().toLowerCase();
    if (!q) return data.files;
    return data.files.filter(
      (f) =>
        f.requirementTitle.toLowerCase().includes(q) ||
        f.requirementCode.toLowerCase().includes(q) ||
        f.originalName.toLowerCase().includes(q) ||
        f.pillarLabel.toLowerCase().includes(q) ||
        f.signatures.some((s) => s.signerName.toLowerCase().includes(q)),
    );
  });

  constructor() {
    if (this.auth.isSuperAdmin()) {
      const fromQuery = this.route.snapshot.queryParamMap.get('clinicId') || '';
      this.adminApi.listClinics().subscribe({
        next: (clinics) => {
          this.clinics.set(clinics);
          const pick =
            clinics.find((c) => c.id === fromQuery)?.id || clinics[0]?.id || '';
          if (pick) this.selectClinic(pick);
          else {
            this.loading.set(false);
            this.error.set('No hay consultorios para administrar documentos.');
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(describeError(err));
        },
      });
      return;
    }
    this.api.clinicId = null;
    this.load();
    this.loadProfileSignature();
  }

  /** Carga firma/nombre del profesional DEL consultorio (no mezclar entre sedes). */
  private loadProfileSignature() {
    if (!this.canCountersign() && !this.canFill() && !this.canManage()) return;
    this.api.getBrand().subscribe({
      next: (brand) => {
        this.profileSignature.set(brand.signatureBase64 || null);
        this.profileSignerName.set(brand.professionalName?.trim() || '');
      },
      error: () => {
        // Fallback: firma del usuario logueado (profesional del propio consultorio).
        if (!this.canCountersign()) {
          this.profileSignature.set(null);
          return;
        }
        this.clinicalApi.getMySignature().subscribe({
          next: (sig) => {
            this.profileSignature.set(sig.signatureBase64 || null);
            this.profileSignerName.set(sig.professionalName?.trim() || '');
          },
          error: () => this.profileSignature.set(null),
        });
      },
    });
  }

  selectClinic(clinicId: string) {
    this.selectedClinicId.set(clinicId);
    this.api.clinicId = clinicId;
    const clinic = this.clinics().find((c) => c.id === clinicId);
    this.selectedClinicName.set(clinic?.name || '');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { clinicId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.load();
    this.loadCategories();
    this.loadProfileSignature();
    if (this.assignOpen()) this.loadAssignmentCatalog();
    if (this.mainTab() === 'historico') this.loadArchive();
  }

  private loadCategories() {
    if (!this.canManage()) return;
    this.api.listCategories().subscribe({
      next: (rows) => this.categories.set(rows),
      error: () => undefined,
    });
  }

  openAssignPanel() {
    if (!this.canManage() || !this.selectedClinicId()) return;
    this.masterPackOpen.set(false);
    this.assignOpen.set(true);
    this.loadAssignmentCatalog();
  }

  closeAssignPanel() {
    this.assignOpen.set(false);
  }

  loadAssignmentCatalog(sourceClinicId?: string) {
    const clinicId = this.selectedClinicId();
    if (!clinicId) return;
    this.assignLoading.set(true);
    this.error.set('');
    const source =
      sourceClinicId ?? (this.assignSourceClinicId() || undefined);
    this.api.getAssignmentCatalog(clinicId, source).subscribe({
      next: (res) => {
        this.assignPeerClinics.set(res.peerClinics);
        this.assignSourceClinicId.set(res.sourceClinic?.id || '');
        this.assignItems.set(
          res.items.map((i) => ({
            code: i.code,
            title: i.title,
            description: i.description,
            category: {
              code: i.category.code,
              name: i.category.name,
              sortOrder: i.category.sortOrder,
            },
            alreadyAssigned: i.alreadyAssigned,
            assignedEnabled: i.assignedEnabled,
          })),
        );
        this.assignSelected.set(new Set(res.selectedCodes));
        this.assignLoading.set(false);
      },
      error: (err) => {
        this.assignLoading.set(false);
        this.error.set(describeError(err));
      },
    });
  }

  onAssignSourceChange(sourceClinicId: string) {
    this.assignSourceClinicId.set(sourceClinicId);
    this.loadAssignmentCatalog(sourceClinicId);
  }

  toggleAssignCode(code: string, checked: boolean) {
    const next = new Set(this.assignSelected());
    if (checked) next.add(code);
    else next.delete(code);
    this.assignSelected.set(next);
  }

  selectAllAssignVisible() {
    const q = this.assignQuery().trim().toLowerCase();
    const next = new Set(this.assignSelected());
    for (const item of this.assignItems()) {
      if (
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.category.name.toLowerCase().includes(q)
      ) {
        next.add(item.code);
      }
    }
    this.assignSelected.set(next);
  }

  clearAssignSelection() {
    this.assignSelected.set(new Set());
  }

  assignCatalogGroups() {
    const q = this.assignQuery().trim().toLowerCase();
    const groups = new Map<
      string,
      {
        name: string;
        sortOrder: number;
        items: Array<{
          code: string;
          title: string;
          description: string | null;
          alreadyAssigned: boolean;
          assignedEnabled: boolean;
        }>;
      }
    >();
    for (const item of this.assignItems()) {
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.code.toLowerCase().includes(q) &&
        !item.category.name.toLowerCase().includes(q)
      ) {
        continue;
      }
      const key = item.category.code;
      let g = groups.get(key);
      if (!g) {
        g = {
          name: item.category.name,
          sortOrder: item.category.sortOrder,
          items: [],
        };
        groups.set(key, g);
      }
      g.items.push({
        code: item.code,
        title: item.title,
        description: item.description,
        alreadyAssigned: item.alreadyAssigned,
        assignedEnabled: item.assignedEnabled,
      });
    }
    return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  saveAssignment() {
    const clinicId = this.selectedClinicId();
    if (!clinicId || !this.canManage()) return;
    const codes = [...this.assignSelected()];
    if (
      !confirm(
        `¿Asignar ${codes.length} documento(s) a «${this.selectedClinicName()}»?\n` +
          `Los no seleccionados se deshabilitarán (no se borran archivos).`,
      )
    ) {
      return;
    }
    this.assignSaving.set(true);
    this.error.set('');
    this.api
      .assignRequirements(clinicId, {
        codes,
        syncDisabled: true,
        sourceClinicId: this.assignSourceClinicId() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.assignSaving.set(false);
          this.overview.set(res.overview);
          this.assignItems.set(
            res.catalog.items.map((i) => ({
              code: i.code,
              title: i.title,
              description: i.description,
              category: {
                code: i.category.code,
                name: i.category.name,
                sortOrder: i.category.sortOrder,
              },
              alreadyAssigned: i.alreadyAssigned,
              assignedEnabled: i.assignedEnabled,
            })),
          );
          this.assignSelected.set(new Set(res.catalog.selectedCodes));
          this.notice.set(
            `Asignación guardada: ${res.created} creados, ${res.enabled} habilitados, ${res.disabled} deshabilitados.`,
          );
        },
        error: (err) => {
          this.assignSaving.set(false);
          this.error.set(describeError(err));
        },
      });
  }

  setAllEnabled(enabled: boolean) {
    if (!this.canManage()) return;
    const label = enabled ? 'habilitar' : 'deshabilitar';
    if (!confirm(`¿${label.charAt(0).toUpperCase() + label.slice(1)} TODOS los documentos de este consultorio?`)) {
      return;
    }
    this.api.setAllEnabled(enabled).subscribe({
      next: (data) => {
        this.overview.set(data);
        this.notice.set(
          enabled
            ? 'Todos los documentos quedaron habilitados.'
            : 'Todos los documentos quedaron deshabilitados para el consultorio.',
        );
      },
      error: (err) => this.error.set(describeError(err)),
    });
  }

  clearClinicDocs() {
    if (!this.canManage() || !this.selectedClinicId()) return;
    if (
      !confirm(
        `¿Vaciar TODO el expediente de «${this.selectedClinicName()}»? Se eliminarán requisitos y archivos. Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    this.api.clearClinicDocuments().subscribe({
      next: (res) => {
        this.overview.set(res.overview);
        this.notice.set(
          `Expediente vaciado: ${res.deletedRequirements} requisito(s) eliminados.`,
        );
      },
      error: (err) => this.error.set(describeError(err)),
    });
  }

  readonly replicatedTargets = signal<Array<{ clinicId: string; clinicName: string }>>([]);
  readonly logoTargetId = signal<string | null>(null);

  replicateToSameSpecialty() {
    if (!this.canManage() || !this.selectedClinicId()) return;
    if (
      !confirm(
        `¿Replicar el expediente de «${this.selectedClinicName()}» a los demás consultorios de la misma especialidad? Los PDF se autodiligencian con el nombre y código REPS/TP de cada profesional destino.`,
      )
    ) {
      return;
    }
    this.api
      .replicateDocuments({
        sourceClinicId: this.selectedClinicId(),
        includeFiles: true,
      })
      .subscribe({
        next: (res) => {
          const n = res.targets.length;
          const files = res.targets.reduce((s, t) => s + t.filesCopied, 0);
          this.replicatedTargets.set(res.targets.map(({ clinicId, clinicName }) => ({ clinicId, clinicName })));
          this.logoTargetId.set(null);
          this.notice.set(
            `Replicados ${res.requirementCount} requisitos a ${n} consultorio(s); ${files} archivo(s) autodiligenciados con datos de cada profesional.`,
          );
        },
        error: (err) => this.error.set(describeError(err)),
      });
  }

  openMasterPackPanel() {
    if (!this.canManage()) return;
    this.masterPackOpen.set(true);
    this.assignOpen.set(false);
    this.error.set('');
  }

  closeMasterPackPanel() {
    this.masterPackOpen.set(false);
    this.resetMasterPackSelection();
  }

  resetMasterPackSelection() {
    this.masterPackFiles = [];
    this.masterPackPaths = [];
    this.masterPackZip = null;
    this.masterPackFileCount.set(0);
  }

  onMasterPackFolderPick(event: Event) {
    const input = event.target as HTMLInputElement;
    const list = input.files ? Array.from(input.files) : [];
    const allowed = list.filter((f) =>
      /\.(pdf|docx?|xlsx?|jpe?g|png|webp)$/i.test(f.name),
    );
    this.masterPackMode.set('folder');
    this.masterPackZip = null;
    this.masterPackFiles = allowed;
    this.masterPackPaths = allowed.map(
      (f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    );
    this.masterPackFileCount.set(allowed.length);
    input.value = '';
  }

  onMasterPackZipPick(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.masterPackMode.set('zip');
    this.masterPackFiles = [];
    this.masterPackPaths = [];
    this.masterPackZip = file && /\.zip$/i.test(file.name) ? file : null;
    this.masterPackFileCount.set(this.masterPackZip ? 1 : 0);
    if (file && !this.masterPackZip) {
      this.error.set('Solo se acepta un archivo .zip');
    }
    input.value = '';
  }

  submitMasterPack() {
    if (!this.canManage()) return;
    const hasFolder = this.masterPackFiles.length > 0;
    const hasZip = !!this.masterPackZip;
    if (!hasFolder && !hasZip) {
      this.error.set('Seleccione una carpeta con documentos o un ZIP.');
      return;
    }

    this.masterPackImporting.set(true);
    this.error.set('');
    this.notice.set('');

    const runImport = (clinicId: string) => {
      this.api
        .importMasterPack({
          clinicId,
          files: hasFolder ? this.masterPackFiles : undefined,
          relativePaths: hasFolder ? this.masterPackPaths : undefined,
          zip: hasZip ? this.masterPackZip : null,
          ensureStructure: true,
        })
        .subscribe({
          next: (res) => {
            this.masterPackImporting.set(false);
            this.overview.set(res.overview);
            this.selectClinic(res.clinicId);
            const unmapped = res.stats.unmapped.length;
            this.notice.set(
              `Carpeta maestra en «${res.clinicName}»: ${res.stats.imported} archivo(s) nuevos, ` +
                `${res.stats.skippedDup} duplicados omitidos, ` +
                `${res.stats.covered}/${res.stats.totalRequirements} requisitos con evidencia` +
                (unmapped ? `, ${unmapped} sin mapeo` : '') +
                '.',
            );
            this.resetMasterPackSelection();
            this.masterPackOpen.set(false);
            this.load();
          },
          error: (err) => {
            this.masterPackImporting.set(false);
            this.error.set(describeError(err));
          },
        });
    };

    if (this.masterPackTarget() === 'existing') {
      if (!this.selectedClinicId()) {
        this.masterPackImporting.set(false);
        this.error.set('Seleccione el consultorio destino arriba.');
        return;
      }
      runImport(this.selectedClinicId());
      return;
    }

    const name = this.masterPackNew.name.trim();
    if (!name) {
      this.masterPackImporting.set(false);
      this.error.set('Indique el nombre del consultorio nuevo.');
      return;
    }

    const adminReady =
      this.masterPackNew.adminFullName.trim() &&
      this.masterPackNew.adminEmail.trim() &&
      this.masterPackNew.adminPassword.trim().length >= 8;

    this.adminApi
      .createClinic({
        name,
        specialty: this.masterPackNew.specialty,
        address: this.masterPackNew.address.trim() || undefined,
        phone: this.masterPackNew.phone.trim() || undefined,
        sgsstEnabled: true,
        admin: adminReady
          ? {
              fullName: this.masterPackNew.adminFullName.trim(),
              email: this.masterPackNew.adminEmail.trim(),
              password: this.masterPackNew.adminPassword,
            }
          : undefined,
      })
      .subscribe({
        next: (clinic) => {
          this.adminApi
            .createClinicDashboard(
              clinic.id,
              'CLINICAL_HISTORY_WITH_DOCS' as DashboardType,
            )
            .subscribe({
              next: () => {
                this.adminApi.listClinics().subscribe({
                  next: (list) => this.clinics.set(list),
                });
                runImport(clinic.id);
              },
              error: (err) => {
                // Si el dashboard ya existía o falló, igual intenta importar.
                this.adminApi.listClinics().subscribe({
                  next: (list) => this.clinics.set(list),
                });
                if (err?.status === 409) {
                  runImport(clinic.id);
                  return;
                }
                this.masterPackImporting.set(false);
                this.error.set(describeError(err));
              },
            });
        },
        error: (err) => {
          this.masterPackImporting.set(false);
          this.error.set(describeError(err));
        },
      });
  }

  createRequirement() {
    if (!this.canManage()) return;
    if (!this.newReq.categoryId || !this.newReq.code.trim() || !this.newReq.title.trim()) {
      this.error.set('Indique categoría, código y título.');
      return;
    }
    this.api
      .createRequirement({
        categoryId: this.newReq.categoryId,
        code: this.newReq.code.trim(),
        title: this.newReq.title.trim(),
        description: this.newReq.description.trim() || undefined,
      })
      .subscribe({
        next: (data) => {
          this.overview.set(data);
          this.notice.set(`Requisito «${this.newReq.title}» creado.`);
          this.newReq = { categoryId: '', code: '', title: '', description: '' };
        },
        error: (err) => this.error.set(describeError(err)),
      });
  }

  toggleRequirementEnabled(req: RequirementRow, enabled: boolean) {
    if (!this.canManage()) return;
    this.api.setRequirementEnabled(req.id, enabled).subscribe({
      next: (data) => {
        this.overview.set(data);
        this.notice.set(
          enabled
            ? `«${req.title}» habilitado.`
            : `«${req.title}» deshabilitado (oculto en el consultorio).`,
        );
      },
      error: (err) => this.error.set(describeError(err)),
    });
  }

  toggleRequirementClinicSignature(req: RequirementRow, required: boolean) {
    if (!this.canManage()) return;
    this.api.setRequirementClinicSignature(req.id, required).subscribe({
      next: (data) => {
        this.overview.set(data);
        this.notice.set(
          required
            ? `«${req.title}» exige firma del consultorio.`
            : `«${req.title}» ya no exige firma del consultorio.`,
        );
      },
      error: (err) => this.error.set(describeError(err)),
    });
  }

  /** Bloquea copiar/pegar/menú contextual sobre el visor documental. */
  blockClipboard(event: Event) {
    event.preventDefault();
    return false;
  }

  setMainTab(tab: MainTab) {
    this.mainTab.set(tab);
    if (tab === 'historico' && !this.archive()) {
      this.loadArchive();
    }
  }

  loadArchive(period?: string) {
    const p = period ?? this.archivePeriod();
    this.archivePeriod.set(p);
    this.archiveLoading.set(true);
    this.error.set('');
    this.api.signedArchive(p).subscribe({
      next: (data) => {
        this.archive.set(data);
        this.archivePeriod.set(data.selectedPeriod);
        this.archiveLoading.set(false);
      },
      error: (err) => {
        this.archiveLoading.set(false);
        this.error.set(describeError(err));
      },
    });
  }

  selectArchiveMonth(period: string) {
    this.loadArchive(period);
  }

  openArchiveFile(file: DocumentFileRow & { requirementTitle?: string }) {
    const title =
      'requirementTitle' in file && file.requirementTitle
        ? String(file.requirementTitle)
        : this.viewRequirementTitle();
    this.openViewer(file, title);
  }

  downloadAllArchive() {
    if (!this.canDownload()) {
      this.error.set('Solo el superadministrador puede descargar documentos.');
      return;
    }
    const files = this.archiveFiles();
    if (!files.length) return;
    this.archiveDownloadingAll.set(true);
    this.notice.set(`Descargando ${files.length} archivo(s) del mes…`);
    let index = 0;
    const next = () => {
      if (index >= files.length) {
        this.archiveDownloadingAll.set(false);
        this.notice.set(`Descarga completada: ${files.length} archivo(s).`);
        return;
      }
      const file = files[index++];
      this.api.downloadBlob(file.id).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = file.originalName;
          link.click();
          URL.revokeObjectURL(url);
          window.setTimeout(next, 350);
        },
        error: (err) => {
          this.archiveDownloadingAll.set(false);
          this.error.set(describeError(err));
        },
      });
    };
    next();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.overview().subscribe({
      next: (data) => {
        this.overview.set(data);
        this.loading.set(false);
        if (!this.openPillars().size) {
          // Preferir SG-SST si puede diligenciar (botón «Llenar y firmar»).
          const sgsst = data.pillars.find((p) => p.pillar === 'SG_SST');
          if (this.canFill() && sgsst) {
            this.openPillars.set(new Set(['SG_SST']));
          } else {
            const worst = [...data.pillars].sort(
              (a, b) => b.summary.red - a.summary.red,
            )[0];
            if (worst) this.openPillars.set(new Set([worst.pillar]));
          }
        }
      },
      error: (err) => {
        this.error.set(describeError(err));
        this.loading.set(false);
      },
    });
  }

  readonly visiblePillars = computed<PillarNode[]>(() => {
    const data = this.overview();
    if (!data) return [];
    const q = this.query().trim().toLowerCase();
    const status = this.statusFilter();
    if (!q && status === 'ALL') return data.pillars;

    const matches = (req: RequirementRow) => {
      if (status !== 'ALL' && req.status !== status) return false;
      if (!q) return true;
      return (
        req.title.toLowerCase().includes(q) ||
        req.code.toLowerCase().includes(q) ||
        (req.description ?? '').toLowerCase().includes(q)
      );
    };

    return data.pillars
      .map((pillar) => ({
        ...pillar,
        categories: pillar.categories
          .map((category) => ({
            ...category,
            requirements: category.requirements.filter(matches),
          }))
          .filter((category) => category.requirements.length > 0),
      }))
      .filter((pillar) => pillar.categories.length > 0);
  });

  readonly filtering = computed(() => this.query().trim() !== '' || this.statusFilter() !== 'ALL');

  /** Superadmin: «7 estándares» (vista de habilitación) o el expediente con firmas. */
  readonly superView = signal<'estandares' | 'expediente'>('estandares');
  /** Fuerza la recarga de la vista «7 estándares» tras cambios hechos desde aquí. */
  readonly habRefresh = signal(0);
  readonly standardPillars = computed(() =>
    (this.overview()?.pillars ?? [])
      .filter((p) => !SUPPORT_PILLARS.has(p.pillar))
      .sort((a, b) => PILLAR_ORDER.indexOf(a.pillar) - PILLAR_ORDER.indexOf(b.pillar)),
  );
  readonly otherPillars = computed(() =>
    (this.overview()?.pillars ?? []).filter((p) => SUPPORT_PILLARS.has(p.pillar)),
  );

  /** Número del estándar (1 a 7); los grupos de apoyo no llevan número. */
  pillarNumber(pillar: DocumentPillar) {
    const i = this.standardPillars().findIndex((p) => p.pillar === pillar);
    return i >= 0 ? i + 1 : null;
  }

  pillarLabel(pillar: DocumentPillar) {
    return this.overview()?.pillars.find((p) => p.pillar === pillar)?.label ?? '';
  }

  // ---------- Carga múltiple (superadmin, consultorio elegido) ----------
  readonly bulkOpen = signal(false);
  readonly bulkPillar = signal<DocumentPillar | null>(null);
  readonly bulkRows = signal<BulkRow[]>([]);
  readonly bulkRunning = signal(false);
  bulkPeriod = '';
  bulkExpiry = '';
  private bulkSeq = 0;

  /** Requisitos agrupados por estándar para elegir el destino de cada archivo. */
  readonly bulkOptions = computed(() => {
    const only = this.bulkPillar();
    return [...this.standardPillars(), ...this.otherPillars()]
      .filter((p) => !only || p.pillar === only)
      .map((p) => {
        const n = this.pillarNumber(p.pillar);
        return {
          pillar: p.pillar,
          label: (n ? n + '. ' : '') + p.label,
          reqs: p.categories.flatMap((c) =>
            c.requirements.map((r) => ({ id: r.id, code: r.code, title: r.title, enabled: r.isEnabled !== false })),
          ),
        };
      })
      .filter((g) => g.reqs.length > 0);
  });

  private readonly bulkPending = computed(() => this.bulkRows().filter((r) => r.state !== 'ok' && !r.tooBig));
  readonly bulkPendingCount = computed(() => this.bulkPending().length);
  readonly bulkDoneCount = computed(() => this.bulkRows().filter((r) => r.state === 'ok').length);
  readonly bulkErrorCount = computed(() => this.bulkRows().filter((r) => r.state === 'error').length);
  readonly bulkReady = computed(
    () => !this.bulkRunning() && this.bulkPendingCount() > 0 && this.bulkPending().every((r) => !!r.requirementId),
  );

  openBulk(pillar: DocumentPillar | null) {
    if (!this.api.clinicId) {
      this.error.set('Seleccione un consultorio antes de cargar archivos.');
      return;
    }
    this.bulkPillar.set(pillar);
    this.bulkRows.set([]);
    this.bulkPeriod = '';
    this.bulkExpiry = '';
    this.bulkOpen.set(true);
  }

  closeBulk() {
    if (this.bulkRunning()) return;
    this.bulkOpen.set(false);
    this.bulkRows.set([]);
  }

  onBulkFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    const options = this.bulkOptions().flatMap((g) => g.reqs);
    const rows: BulkRow[] = files.map((file) => {
      const tooBig = file.size > MAX_UPLOAD_BYTES;
      return {
        key: ++this.bulkSeq,
        file,
        requirementId: tooBig ? '' : suggestRequirement(file.name, options),
        state: tooBig ? 'error' : 'pendiente',
        message: tooBig ? 'Supera 25 MB; no se cargará' : '',
        tooBig,
      };
    });
    this.bulkRows.update((prev) => [...prev, ...rows]);
  }

  setBulkRequirement(index: number, requirementId: string) {
    this.bulkRows.update((rows) =>
      rows.map((r, i) => (i === index && !r.tooBig ? { ...r, requirementId, state: 'pendiente', message: '' } : r)),
    );
  }

  removeBulkRow(index: number) {
    this.bulkRows.update((rows) => rows.filter((_, i) => i !== index));
  }

  /** Carga los archivos uno a uno; si uno falla, se marca y se sigue con los demás. */
  async runBulk() {
    if (!this.bulkReady()) return;
    this.bulkRunning.set(true);
    this.error.set('');
    this.notice.set('');
    const patch = (key: number, change: Partial<BulkRow>) =>
      this.bulkRows.update((rows) => rows.map((r) => (r.key === key ? { ...r, ...change } : r)));
    let ok = 0;
    let failed = 0;
    for (const row of this.bulkPending()) {
      patch(row.key, { state: 'subiendo', message: '' });
      try {
        await firstValueFrom(
          this.api.upload(row.requirementId, row.file, {
            expiresAt: this.bulkExpiry || undefined,
            periodLabel: this.bulkPeriod || undefined,
          }),
        );
        patch(row.key, { state: 'ok' });
        ok++;
      } catch (err) {
        patch(row.key, { state: 'error', message: describeError(err) });
        failed++;
      }
    }
    this.bulkRunning.set(false);
    this.load();
    this.notice.set(
      `Carga múltiple: ${ok} archivo${ok === 1 ? '' : 's'} cargado${ok === 1 ? '' : 's'}` +
        (failed ? `, ${failed} con error (revise la lista).` : '. Las versiones anteriores quedan en el historial.'),
    );
    if (ok) this.habRefresh.update((n) => n + 1);
  }

  isOpen(pillar: string) {
    return this.filtering() || this.openPillars().has(pillar);
  }

  togglePillar(pillar: string) {
    const next = new Set(this.openPillars());
    if (next.has(pillar)) next.delete(pillar);
    else next.add(pillar);
    this.openPillars.set(next);
  }

  focusSgsstPillar() {
    this.openPillars.set(new Set(['SG_SST']));
    this.superView.set('expediente');
    this.query.set('');
    this.statusFilter.set('ALL');
    this.mainTab.set('expediente');
  }

  setStatusFilter(value: StatusFilter) {
    this.statusFilter.set(value);
  }

  statusLabel(status: ComplianceStatus) {
    if (status === 'GREEN') return 'Vigente';
    if (status === 'YELLOW') return 'Por vencer';
    if (status === 'RED') return 'Pendiente o vencido';
    return 'Opcional';
  }

  fileStatusLabel(status: DocumentFileStatus) {
    if (status === 'SIGNED') return 'Vigente';
    if (status === 'PARTIALLY_SIGNED') return 'Vigente';
    if (status === 'RETIRED') return 'Retirado (histórico)';
    return 'Vigente';
  }

  /** SUPER_ADMIN en todos; admin/profesional: Legal, Talento (+ uso suelo/concepto por código). */
  canCrudPillar(pillar: string | null | undefined) {
    if (this.canManage()) return true;
    if (!this.canClinicDocCrud()) return false;
    return pillar === 'DOCUMENTACION_LEGAL' || pillar === 'TALENTO_HUMANO';
  }

  isLandUseOrSanitaryRequirement(req: { code?: string | null }) {
    const c = (req.code || '').toUpperCase();
    if (!c) return false;
    return (
      c.includes('USO_DEL_SUELO') ||
      c.includes('USO_DE_SUELO') ||
      c.includes('CONCEPTO_SANITARIO')
    );
  }

  canCrudRequirement(req: { code?: string | null; pillar?: string | null }) {
    if (this.canManage()) return true;
    if (!this.canClinicDocCrud()) return false;
    if (this.isLandUseOrSanitaryRequirement(req)) return true;
    return this.canCrudPillar(req.pillar);
  }

  expiryLabel(req: RequirementRow) {
    if (req.status === 'RED' && !req.latestFile) return 'Sin evidencia cargada';
    if (req.latestFile?.status === 'PENDING_SIGNATURE') return 'Evidencia cargada';
    if (req.latestFile?.status === 'PARTIALLY_SIGNED') return 'Evidencia cargada';
    if (req.daysToExpiry === null) return 'Sin vencimiento';
    if (req.daysToExpiry < 0) return `Venció hace ${Math.abs(req.daysToExpiry)} días`;
    if (req.daysToExpiry === 0) return 'Vence hoy';
    return `Vence en ${req.daysToExpiry} días`;
  }

  periodicity(req: RequirementRow) {
    if (!req.validityDays) return null;
    if (req.validityDays <= 31) return 'Mensual';
    if (req.validityDays <= 186) return 'Semestral';
    return 'Anual';
  }

  fileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  onPickFile(event: Event, requirementId: string) {
    if (!this.canUpload() && !this.canClinicDocCrud()) {
      this.error.set('No tiene permiso para cargar documentos.');
      return;
    }
    if (!this.api.clinicId && this.canManage()) {
      this.error.set('Seleccione un consultorio antes de cargar archivos.');
      return;
    }
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      this.error.set('El archivo supera los 25 MB permitidos.');
      input.value = '';
      return;
    }

    this.uploading.set(requirementId);
    this.error.set('');
    this.notice.set('');

    this.api
      .upload(requirementId, file, {
        expiresAt: this.pendingExpiry() || undefined,
        periodLabel: this.pendingPeriod() || undefined,
      })
      .subscribe({
        next: (detail) => {
          this.uploading.set(null);
          this.pendingExpiry.set('');
          input.value = '';
          this.notice.set(
            `Se creó la versión ${detail.files[0]?.version ?? ''} de "${file.name}". El histórico anterior se conserva.`,
          );
          this.load();
          this.detail.set(detail);
          const newest = detail.files.find((f) => f.status !== 'RETIRED');
          if (newest) this.openViewer(newest, detail.requirement.title);
        },
        error: (err) => {
          this.uploading.set(null);
          input.value = '';
          this.error.set(describeError(err));
        },
      });
  }

  openDetail(requirementId: string) {
    this.detailLoading.set(true);
    this.api.listFiles(requirementId).subscribe({
      next: (data) => {
        this.detail.set(data);
        this.detailLoading.set(false);
      },
      error: (err) => {
        this.detailLoading.set(false);
        this.error.set(describeError(err));
      },
    });
  }

  closeDetail() {
    this.detail.set(null);
  }

  openViewer(
    file: DocumentFileRow,
    title?: string,
    siblings?: DocumentFileRow[],
  ) {
    this.clearPreview();
    this.viewing.set(file);
    if (title) this.viewRequirementTitle.set(title);
    else if (this.detail()) this.viewRequirementTitle.set(this.detail()!.requirement.title);

    const fromDetail = (this.detail()?.files ?? []).filter(
      (f) => f.status !== 'RETIRED',
    );
    const list =
      siblings?.filter((f) => f.status !== 'RETIRED') ??
      (fromDetail.some((f) => f.id === file.id) ? fromDetail : [file]);
    // Si hay más de un documento en la carpeta, se listan todos para elegir.
    this.viewerSiblings.set(list.length > 1 ? list : list);

    if (this.canManage() && this.isSgsstFile(file) && !file.hasHabilisaludSignature) {
      this.activeSignRole.set('HABILISALUD');
    } else if (this.canCountersign() && (file.canClinicSign || this.canSignFile(file))) {
      this.activeSignRole.set('CLINIC_ADMIN');
    } else {
      const missing = file.missingRoles;
      this.activeSignRole.set(missing[0] ?? 'CLINIC_ADMIN');
    }

    this.previewLoading.set(true);
    const name = file.originalName.toLowerCase();
    const isPdf = file.mimeType === 'application/pdf' || name.endsWith('.pdf');
    const isImage = file.mimeType.startsWith('image/');
    const isDoc =
      name.endsWith('.docx') ||
      name.endsWith('.doc') ||
      file.mimeType.includes('word');

    const afterPreview = () => {
      setTimeout(() => {
        this.ensureSignPad();
        if (this.canSignFile(file) && this.canCountersign() && !this.canManage()) {
          this.applyProfileSignatureToPad();
        }
      }, 40);
    };

    if (isPdf || isImage) {
      this.api.viewBlob(file.id).subscribe({
        next: (blob) => {
          this.objectUrl = URL.createObjectURL(blob);
          if (isPdf) {
            this.previewUrl.set(
              this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl),
            );
            this.previewKind.set('pdf');
          } else {
            this.previewImageSrc.set(this.objectUrl);
            this.previewKind.set('image');
          }
          this.previewLoading.set(false);
          afterPreview();
        },
        error: (err) => {
          this.previewLoading.set(false);
          this.previewKind.set('none');
          this.error.set(describeError(err));
          afterPreview();
        },
      });
      return;
    }

    if (isDoc) {
      this.api.previewHtml(file.id).subscribe({
        next: (res) => {
          this.previewHtml.set(
            this.sanitizer.bypassSecurityTrustHtml(
              res.html || '<p>Sin contenido para previsualizar.</p>',
            ),
          );
          this.previewKind.set('html');
          this.previewLoading.set(false);
          afterPreview();
        },
        error: (err) => {
          this.previewLoading.set(false);
          this.previewKind.set('none');
          this.error.set(describeError(err));
          afterPreview();
        },
      });
      return;
    }

    this.previewKind.set('none');
    this.previewLoading.set(false);
    afterPreview();
  }

  /** Cambia el archivo activo del visor sin cerrar (hermanos de la carpeta). */
  selectViewerSibling(file: DocumentFileRow) {
    if (this.viewing()?.id === file.id) return;
    this.openViewer(file, this.viewRequirementTitle(), this.viewerSiblings());
  }

  closeViewer() {
    this.clearPreview();
    this.viewing.set(null);
    this.viewerSiblings.set([]);
    this.signaturePad = null;
  }

  private clearPreview() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.previewUrl.set(null);
    this.previewImageSrc.set(null);
    this.previewHtml.set(null);
    this.previewKind.set('none');
  }

  selectSignRole(role: DocumentSignerRole) {
    this.activeSignRole.set(role);
    this.clearSignPad();
  }

  ensureSignPad() {
    const canvas = this.signCanvas()?.nativeElement;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.offsetWidth || 320;
    const height = canvas.offsetHeight || 140;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx?.setTransform(1, 0, 0, 1, 0, 0);
    ctx?.scale(ratio, ratio);
    this.signaturePad?.off();
    this.signaturePad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255,255,255)',
      penColor: 'rgb(0, 61, 76)',
    });
  }

  hasRole(file: DocumentFileRow, role: DocumentSignerRole) {
    return file.signatures.some((s) => s.role === role);
  }

  signatureOf(file: DocumentFileRow, role: DocumentSignerRole) {
    return file.signatures.find((s) => s.role === role) ?? null;
  }

  clearSignPad() {
    this.signaturePad?.clear();
  }

  /** Carga una imagen de firma (PNG/JPG) al pad o la envía directo. */
  onSignatureImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set('La firma debe ser una imagen (PNG o JPG).');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      this.applyImageToPad(dataUrl);
      input.value = '';
    };
    reader.readAsDataURL(file);
  }

  private applyImageToPad(dataUrl: string) {
    this.ensureSignPad();
    const pad = this.signaturePad;
    if (!pad) {
      this.error.set('No se pudo preparar el pad de firma.');
      return;
    }
    // fromDataURL registra la imagen como trazo válido (isEmpty() = false).
    void pad.fromDataURL(dataUrl, { ratio: 1 });
  }

  /** Aplica la firma guardada al firmar la historia clínica. */
  applyProfileSignatureToPad() {
    const stamp = this.profileSignature();
    if (!stamp) {
      this.loadProfileSignature();
      this.clinicalApi.getMySignature().subscribe({
        next: (sig) => {
          this.profileSignature.set(sig.signatureBase64 || null);
          this.profileSignerName.set(sig.professionalName?.trim() || '');
          if (sig.signatureBase64) {
            this.applyImageToPad(sig.signatureBase64);
            this.notice.set(
              'Se aplicó la firma de su historia clínica a este documento.',
            );
          } else {
            this.error.set(
              'Aún no tiene firma guardada. Firme una historia clínica o dibuje la firma aquí.',
            );
          }
        },
        error: () =>
          this.error.set(
            'No se pudo cargar la firma del perfil. Dibuje o cargue una imagen.',
          ),
      });
      return;
    }
    this.applyImageToPad(stamp);
  }

  /** Elimina el archivo vigente del requisito (solo SUPER_ADMIN). */
  deleteLatestFile(req: RequirementRow) {
    if (!this.canManage()) return;
    const file = req.latestFile;
    if (!file) return;
    if (
      !confirm(
        `¿Eliminar «${file.originalName}» de «${req.title}»? El campo queda vacío, sin rastro del archivo.`,
      )
    ) {
      return;
    }
    this.uploading.set(req.id);
    this.error.set('');
    this.api.deleteFilePermanent(file.id).subscribe({
      next: () => {
        this.uploading.set(null);
        this.notice.set(`Archivo de «${req.title}» eliminado.`);
        if (this.viewing()?.id === file.id) this.closeViewer();
        if (this.detail()?.requirement.id === req.id) this.openDetail(req.id);
        this.load();
      },
      error: (err) => {
        this.uploading.set(null);
        this.error.set(describeError(err));
      },
    });
  }

  /** Último archivo no retirado del detalle (historial). */
  latestActiveFile(info: { files: DocumentFileRow[] }) {
    return info.files.find((f) => f.status !== 'RETIRED') ?? null;
  }

  deleteFileFromDetail(info: RequirementDetail) {
    if (!this.canManage()) return;
    const file = this.latestActiveFile(info);
    if (!file) return;
    if (
      !confirm(
        `¿Eliminar «${file.originalName}» de «${info.requirement.title}»? El campo queda vacío, sin rastro del archivo.`,
      )
    ) {
      return;
    }
    this.uploading.set(info.requirement.id);
    this.error.set('');
    this.api.deleteFilePermanent(file.id).subscribe({
      next: () => {
        this.uploading.set(null);
        this.notice.set(`Archivo de «${info.requirement.title}» eliminado.`);
        if (this.viewing()?.id === file.id) this.closeViewer();
        this.openDetail(info.requirement.id);
        this.load();
      },
      error: (err) => {
        this.uploading.set(null);
        this.error.set(describeError(err));
      },
    });
  }

  openFillSgsst(req: RequirementRow) {
    if (!this.canFill()) {
      this.error.set('No tiene permiso para diligenciar documentos.');
      return;
    }
    const training =
      !!req.fillableTraining ||
      req.code === 'SST_ACTAS_CAPACITACION' ||
      req.code === 'SST_PAUSAS_ACTIVAS';
    // Firmas de contenido del PDF (no confundir con el sello dual HABILISALUD / CLINIC_ADMIN).
    const content = (req.contentRoles ?? []).filter(
      (r) => r !== 'HABILISALUD' && r !== 'CLINIC_ADMIN',
    );
    const roles: DocumentSignerRole[] = training
      ? content.length
        ? content
        : ['CAPACITADOR', 'ASISTENTE']
      : content.length
        ? content
        : ['ELABORO', 'REVISO', 'APROBO'];

    this.fillRequirementId.set(req.id);
    this.fillRequirementTitle.set(req.title);
    this.fillIsTraining.set(training);
    this.fillRoles.set(roles);

    const me = this.auth.user()?.fullName ?? '';
    const clinic = this.clinics().find((c) => c.id === this.selectedClinicId());
    const clinicCreated =
      clinic?.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const clinicProfessional =
      this.profileSignerName() || clinic?.name || me;
    this.fillModel = {
      tema: training ? '' : req.title,
      fecha: clinicCreated,
      periodLabel: clinicCreated.slice(0, 7),
      objetivo: '',
      contenido: '',
      // 1. Elaboró = HABILISALUD · 2. Revisó = HABILISALUD · 3. Aprobó = profesional del consultorio
      nombre1: training ? clinicProfessional : 'HABILISALUD',
      nombre2: training ? '' : 'HABILISALUD',
      nombre3: training ? '' : clinicProfessional,
      firma1: null,
      firma2: null,
      firma3: null,
    };
    this.fillOpen.set(true);
    this.error.set('');
    this.api.getBrand().subscribe({
      next: (brand) => {
        if (this.fillRequirementId() !== req.id) return;
        const name = brand.professionalName?.trim() || clinicProfessional;
        const stamp = brand.signatureBase64;
        this.profileSignature.set(stamp || null);
        this.profileSignerName.set(name);
        this.fillModel = {
          ...this.fillModel,
          nombre1: training ? this.fillModel.nombre1 || name : 'HABILISALUD',
          nombre2: training ? this.fillModel.nombre2 : 'HABILISALUD',
          nombre3: training ? this.fillModel.nombre3 : name,
          // Firma del profesional solo en Aprobó.
          firma1: training ? stamp || this.fillModel.firma1 : this.fillModel.firma1,
          firma2: training ? this.fillModel.firma2 : this.fillModel.firma2,
          firma3: training ? this.fillModel.firma3 : stamp || this.fillModel.firma3,
        };
      },
      error: () => undefined,
    });
  }

  closeFillSgsst() {
    this.fillOpen.set(false);
    this.fillRequirementId.set(null);
  }

  onFillSignatureImage(event: Event, slot: 1 | 2 | 3) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set('La firma debe ser una imagen (PNG o JPG).');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      this.fillModel = {
        ...this.fillModel,
        firma1: slot === 1 ? dataUrl : this.fillModel.firma1,
        firma2: slot === 2 ? dataUrl : this.fillModel.firma2,
        firma3: slot === 3 ? dataUrl : this.fillModel.firma3,
      };
      input.value = '';
    };
    reader.readAsDataURL(file);
  }

  clearFillSignature(slot: 1 | 2 | 3) {
    this.fillModel = {
      ...this.fillModel,
      firma1: slot === 1 ? null : this.fillModel.firma1,
      firma2: slot === 2 ? null : this.fillModel.firma2,
      firma3: slot === 3 ? null : this.fillModel.firma3,
    };
  }

  submitFillSgsst() {
    const requirementId = this.fillRequirementId();
    const m = this.fillModel;
    const roles = this.fillRoles();
    if (!requirementId) return;

    if (!m.fecha) {
      this.error.set('Indique la fecha del documento.');
      return;
    }
    if (this.fillIsTraining() && !m.tema.trim()) {
      this.error.set('Indique el tema de la capacitación.');
      return;
    }
    if (!m.nombre1.trim()) {
      this.error.set(
        this.fillIsTraining()
          ? 'Indique el nombre de quien evalúa / capacitador.'
          : 'Indique el nombre de quien elaboró.',
      );
      return;
    }
    if (!m.nombre2.trim()) {
      this.error.set(
        this.fillIsTraining()
          ? 'Indique el nombre de la persona evaluada / asistente.'
          : 'Indique el nombre de quien revisó.',
      );
      return;
    }
    const needsAprobo = !this.fillIsTraining() && roles.includes('APROBO');
    if (needsAprobo && !m.nombre3.trim()) {
      this.error.set('Indique el nombre de quien aprobó.');
      return;
    }
    if (
      !m.firma1 &&
      (this.fillIsTraining() || !/^habilisalud$/i.test(m.nombre1.trim()))
    ) {
      this.error.set('Cargue la imagen de firma de quien elaboró / capacitador.');
      return;
    }
    if (
      !m.firma2 &&
      (this.fillIsTraining() || !/^habilisalud$/i.test(m.nombre2.trim()))
    ) {
      this.error.set(
        this.fillIsTraining()
          ? 'Cargue la imagen de firma de la persona evaluada / asistente.'
          : 'Cargue la imagen de firma de quien revisó.',
      );
      return;
    }
    if (needsAprobo && !m.firma3) {
      this.error.set('Cargue la imagen de firma de quien aprobó.');
      return;
    }

    const habilisaludStamp =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W2XQAAAAASUVORK5CYII=';
    const elaboroStamp = m.firma1 || habilisaludStamp;
    const revisoStamp = m.firma2 || habilisaludStamp;

    const signatures: Array<{
      role: DocumentSignerRole;
      signerName: string;
      signatureBase64: string;
    }> = this.fillIsTraining()
      ? [
          {
            role: 'CAPACITADOR',
            signerName: m.nombre1.trim(),
            signatureBase64: m.firma1!,
          },
          {
            role: 'ASISTENTE',
            signerName: m.nombre2.trim(),
            signatureBase64: m.firma2!,
          },
        ]
      : [
          {
            role: 'ELABORO',
            signerName: m.nombre1.trim() || 'HABILISALUD',
            signatureBase64: elaboroStamp,
          },
          {
            role: 'REVISO',
            signerName: m.nombre2.trim() || 'HABILISALUD',
            signatureBase64: revisoStamp,
          },
          ...(needsAprobo && m.firma3
            ? [
                {
                  role: 'APROBO' as const,
                  signerName: m.nombre3.trim(),
                  signatureBase64: m.firma3,
                },
              ]
            : []),
        ];

    this.fillSaving.set(true);
    this.error.set('');
    this.api
      .fillSgsst(requirementId, {
        fecha: m.fecha,
        periodLabel: m.periodLabel || undefined,
        tema: this.fillIsTraining() ? m.tema.trim() : undefined,
        objetivo: m.objetivo.trim() || undefined,
        contenido: m.contenido.trim() || undefined,
        signatures,
      })
      .subscribe({
        next: (res) => {
          this.fillSaving.set(false);
          this.fillOpen.set(false);
          this.notice.set(
            this.canManage()
              ? `Documento v${res.file.version} generado. Queda pendiente la firma del administrador del consultorio.`
              : `Documento v${res.file.version} generado. Queda pendiente el sello de HABILISALUD para cerrar el expediente.`,
          );
          this.load();
          if (this.archive() || this.mainTab() === 'historico') {
            this.loadArchive(m.periodLabel || this.archivePeriod());
          }
          this.openDetail(requirementId);
          this.openViewer(res.file, this.fillRequirementTitle());
        },
        error: (err) => {
          this.fillSaving.set(false);
          this.error.set(describeError(err));
        },
      });
  }

  submitSignature() {
    const file = this.viewing();
    if (!file) return;
    if (file.status === 'SIGNED' || file.status === 'RETIRED') {
      this.error.set('Esta versión ya está sellada o retirada. Cargue una nueva versión.');
      return;
    }
    if (!this.canSignFile(file)) {
      if (this.canCountersign() && !file.hasHabilisaludSignature) {
        this.error.set(
          'Aún no puede firmar: el superadministrador de HABILISALUD debe firmar primero.',
        );
      } else {
        this.error.set('No tiene permiso para firmar este documento.');
      }
      return;
    }
    const role = this.activeSignRole();
    if (!this.canSignRole(file, role)) {
      this.error.set(`No puede firmar el rol ${ROLE_LABELS[role]} en este momento.`);
      return;
    }
    if (!this.signaturePad || this.signaturePad.isEmpty()) {
      const fallback = this.profileSignature();
      if (fallback && this.canCountersign() && !this.canManage()) {
        this.applyImageToPad(fallback);
      }
      if (!this.signaturePad || this.signaturePad.isEmpty()) {
        this.error.set(
          this.profileSignature()
            ? 'No se pudo aplicar la firma del perfil. Dibuje o cargue una imagen.'
            : 'Dibuje la firma, cargue una imagen, o firme primero su historia clínica para reutilizarla.',
        );
        return;
      }
    }

    this.signing.set(true);
    this.error.set('');
    const dataUrl = this.signaturePad.toDataURL('image/png');
    this.api.sign(file.id, role, dataUrl).subscribe({
      next: (res) => {
        this.signing.set(false);
        this.viewing.set(res.file);
        this.notice.set(
          res.file.status === 'SIGNED'
            ? `Versión v${res.file.version} sellada (HABILISALUD + consultorio).`
            : role === 'HABILISALUD'
              ? `Firma de HABILISALUD registrada. Se notificó al administrador del consultorio para la contraparte.`
              : `Contraparte del consultorio registrada.`,
        );
        this.clearSignPad();
        const next = res.file.missingRoles[0];
        if (next) this.activeSignRole.set(next);
        this.load();
        if (this.detail()) this.openDetail(this.detail()!.requirement.id);
      },
      error: (err) => {
        this.signing.set(false);
        this.error.set(describeError(err));
      },
    });
  }

  openPendingCountersign(item: PendingCountersign) {
    this.api.getFile(item.fileId).subscribe({
      next: (res) => {
        this.openViewer(res.file, item.requirementTitle);
      },
      error: (err) => this.error.set(describeError(err)),
    });
  }

  download(fileId: string, fileName: string) {
    if (!this.canDownload()) {
      this.error.set('Solo el superadministrador puede descargar documentos.');
      return;
    }
    this.api.downloadBlob(fileId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => this.error.set(describeError(err)),
    });
  }

  /** Archivado lógico: la versión sale de vigencia pero queda en el historial. */
  retireFile(fileId: string) {
    if (!confirm('¿Archivar esta versión? Deja de estar vigente y se conserva en el historial.')) return;
    this.api.retire(fileId).subscribe({
      next: (data) => {
        this.detail.set(data);
        this.notice.set('Versión archivada. Se conserva en el historial.');
        if (this.viewing()?.id === fileId) this.closeViewer();
        if (this.editingFileId() === fileId) this.cancelEditFileMeta();
        this.viewerSiblings.set(data.files.filter((f) => f.status !== 'RETIRED'));
        this.load();
      },
      error: (err) => this.error.set(describeError(err)),
    });
  }

  /** Solo superadmin y solo sobre versiones ya archivadas. */
  deleteFilePermanent(fileId: string) {
    if (!this.canManage()) return;
    if (
      !confirm(
        '¿Eliminar definitivamente esta versión archivada? Esta acción no se puede deshacer.',
      )
    ) {
      return;
    }
    this.api.deleteFilePermanent(fileId).subscribe({
      next: (data) => {
        this.detail.set(data);
        this.notice.set('Archivo eliminado.');
        if (this.viewing()?.id === fileId) this.closeViewer();
        if (this.editingFileId() === fileId) this.cancelEditFileMeta();
        const active = data.files.filter((f) => f.status !== 'RETIRED');
        this.viewerSiblings.set(active);
        this.load();
      },
      error: (err) => this.error.set(describeError(err)),
    });
  }

  startEditFileMeta(file: DocumentFileRow) {
    this.editingFileId.set(file.id);
    this.editMeta = {
      periodLabel: file.periodLabel || '',
      expiresAt: file.expiresAt ? file.expiresAt.slice(0, 10) : '',
      notes: file.notes || '',
    };
  }

  cancelEditFileMeta() {
    this.editingFileId.set(null);
    this.editMeta = { periodLabel: '', expiresAt: '', notes: '' };
  }

  saveFileMeta(fileId: string) {
    this.api
      .updateFileMeta(fileId, {
        periodLabel: this.editMeta.periodLabel || '',
        expiresAt: this.editMeta.expiresAt || '',
        notes: this.editMeta.notes || '',
      })
      .subscribe({
        next: (data) => {
          this.detail.set(data);
          this.cancelEditFileMeta();
          this.notice.set('Metadatos actualizados.');
          this.load();
        },
        error: (err) => this.error.set(describeError(err)),
      });
  }

  /** Reemplaza un archivo concreto; los demás de la carpeta se conservan. */
  onReplaceFile(event: Event, requirementId: string, fileId: string) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (
      !confirm(
        `¿Reemplazar este archivo por «${file.name}»? La versión actual se archiva y queda en el historial.`,
      )
    ) {
      input.value = '';
      return;
    }
    this.uploading.set(requirementId);
    this.error.set('');
    // Primero se carga la nueva versión; solo si llega bien se archiva la anterior.
    this.api
      .upload(requirementId, file, {
        expiresAt: this.pendingExpiry() || undefined,
        periodLabel: this.pendingPeriod() || undefined,
      })
      .subscribe({
        next: () => {
          this.api.retire(fileId).subscribe({
            next: (detail) => {
              this.uploading.set(null);
              input.value = '';
              this.detail.set(detail);
              this.notice.set(`Archivo reemplazado por «${file.name}». La versión anterior quedó en el historial.`);
              this.load();
              const active = detail.files.filter((f) => f.status !== 'RETIRED');
              const newest = active[0];
              if (newest) this.openViewer(newest, detail.requirement.title, active);
            },
            error: (err) => {
              this.uploading.set(null);
              input.value = '';
              this.error.set(describeError(err));
              this.openDetail(requirementId);
            },
          });
        },
        error: (err) => {
          this.uploading.set(null);
          input.value = '';
          this.error.set(describeError(err));
          this.openDetail(requirementId);
        },
      });
  }

  openLatest(req: RequirementRow) {
    // Llenable y aún no sellado → formulario (superadmin o admin consultorio).
    if (
      this.canFill() &&
      req.fillable &&
      (!req.latestFile || req.latestFile.status !== 'SIGNED')
    ) {
      this.openFillSgsst(req);
      return;
    }
    if (!req.latestFile) {
      this.openDetail(req.id);
      return;
    }
    // Varios archivos en la carpeta (p. ej. RETIE: certificación + tarjeta):
    // cargar todos y mostrar selector junto al visor.
    if ((req.fileCount ?? 0) > 1) {
      this.api.listFiles(req.id).subscribe({
        next: (detail) => {
          this.detail.set(detail);
          const active = detail.files.filter((f) => f.status !== 'RETIRED');
          const focus =
            active.find((f) => f.id === req.latestFile?.id) ?? active[0];
          if (focus) this.openViewer(focus, req.title, active);
        },
        error: (err) => this.error.set(describeError(err)),
      });
      return;
    }
    this.openViewer(req.latestFile, req.title);
  }

  goHome() {
    this.auth.goToWebsite();
  }

  logout() {
    if (this.auth.isSuperAdmin()) {
      this.auth.logoutToAdminLogin();
      return;
    }
    this.auth.logoutToClinicLogin();
  }
}
