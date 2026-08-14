import { DatePipe } from '@angular/common';
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
import SignaturePad from 'signature_pad';
import { WEBSITE_URL } from '../api.config';
import { AdminApiService } from '../admin-api.service';
import { AuthService } from '../auth.service';
import { Clinic } from '../models';
import { DocumentsApiService } from './documents-api.service';
import {
  ComplianceStatus,
  DocumentFileRow,
  DocumentFileStatus,
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

const ROLE_LABELS: Record<DocumentSignerRole, string> = {
  ELABORO: 'Elaboró',
  REVISO: 'Revisó',
  APROBO: 'Aprobó',
  CAPACITADOR: 'Firma Capacitador',
  ASISTENTE: 'Firma Asistente / Evaluado',
  HABILISALUD: 'HABILISALUD (superadmin)',
  CLINIC_ADMIN: 'Administrador del consultorio',
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
  imports: [RouterLink, FormsModule, DatePipe],
  templateUrl: './documents-dashboard.html',
  styleUrl: './documents-dashboard.scss',
})
export class DocumentsDashboard {
  private readonly api = inject(DocumentsApiService);
  private readonly adminApi = inject(AdminApiService);
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
  readonly canSign = this.auth.canSignDocuments;
  readonly homeLink = computed(() =>
    this.auth.isSuperAdmin() ? '/admin' : '/consultorio',
  );

  readonly clinics = signal<Clinic[]>([]);
  readonly selectedClinicId = signal('');
  readonly selectedClinicName = signal('');

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
  readonly viewRequirementTitle = signal('');
  readonly previewKind = signal<'pdf' | 'image' | 'html' | 'none'>('none');
  readonly previewUrl = signal<SafeResourceUrl | null>(null);
  readonly previewImageSrc = signal<string | null>(null);
  readonly previewHtml = signal<SafeHtml | null>(null);
  readonly previewLoading = signal(false);

  readonly activeSignRole = signal<DocumentSignerRole>('HABILISALUD');
  readonly signing = signal(false);

  readonly uploading = signal<string | null>(null);
  readonly pendingExpiry = signal('');
  readonly pendingPeriod = signal('');

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

  /** Roles de sello dual: HABILISALUD → admin consultorio. */
  readonly signRoles = computed<DocumentSignerRole[]>(() => {
    const file = this.viewing();
    if (file?.requiredRoles?.length) return file.requiredRoles;
    const detail = this.detail();
    if (detail?.requiredRoles?.length) return detail.requiredRoles;
    return ['HABILISALUD', 'CLINIC_ADMIN'];
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
    if (this.canManage()) {
      return !file.hasHabilisaludSignature;
    }
    if (this.canCountersign()) {
      return !!file.canClinicSign;
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
    if (this.mainTab() === 'historico') this.loadArchive();
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

  toggleRequirementEnabled(req: RequirementRow, enabled: boolean) {
    if (!this.canManage()) return;
    this.api.setRequirementEnabled(req.id, enabled).subscribe({
      next: (data) => {
        this.overview.set(data);
        this.notice.set(
          enabled
            ? `«${req.title}» habilitado.`
            : `«${req.title}» deshabilitado (solo lectura en el consultorio).`,
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
    this.query.set('');
    this.statusFilter.set('ALL');
    this.mainTab.set('expediente');
  }

  setStatusFilter(value: StatusFilter) {
    this.statusFilter.set(value);
  }

  statusLabel(status: ComplianceStatus) {
    if (status === 'GREEN') return 'Firmado y vigente';
    if (status === 'YELLOW') return 'Pendiente de firma / por vencer';
    if (status === 'RED') return 'Pendiente o vencido';
    return 'Opcional';
  }

  fileStatusLabel(status: DocumentFileStatus) {
    if (status === 'SIGNED') return 'Firmado';
    if (status === 'PARTIALLY_SIGNED') return 'Firma parcial';
    if (status === 'RETIRED') return 'Retirado (histórico)';
    return 'Pendiente de firma';
  }

  expiryLabel(req: RequirementRow) {
    if (req.status === 'RED' && !req.latestFile) return 'Sin evidencia cargada';
    if (req.latestFile?.status === 'PENDING_SIGNATURE') return 'Cargado · falta firmar';
    if (req.latestFile?.status === 'PARTIALLY_SIGNED') return 'Firma incompleta';
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
    if (!this.canUpload()) {
      this.error.set('No tiene permiso para cargar documentos.');
      return;
    }
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

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

  openViewer(file: DocumentFileRow, title?: string) {
    this.clearPreview();
    this.viewing.set(file);
    if (title) this.viewRequirementTitle.set(title);
    else if (this.detail()) this.viewRequirementTitle.set(this.detail()!.requirement.title);

    if (this.canManage() && !file.hasHabilisaludSignature) {
      this.activeSignRole.set('HABILISALUD');
    } else if (this.canCountersign() && file.canClinicSign) {
      this.activeSignRole.set('CLINIC_ADMIN');
    } else {
      const missing = file.missingRoles;
      this.activeSignRole.set(missing[0] ?? 'HABILISALUD');
    }

    this.previewLoading.set(true);
    const name = file.originalName.toLowerCase();
    const isPdf = file.mimeType === 'application/pdf' || name.endsWith('.pdf');
    const isImage = file.mimeType.startsWith('image/');
    const isDoc =
      name.endsWith('.docx') ||
      name.endsWith('.doc') ||
      file.mimeType.includes('word');

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
          setTimeout(() => this.ensureSignPad(), 40);
        },
        error: (err) => {
          this.previewLoading.set(false);
          this.previewKind.set('none');
          this.error.set(describeError(err));
          setTimeout(() => this.ensureSignPad(), 40);
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
          setTimeout(() => this.ensureSignPad(), 40);
        },
        error: (err) => {
          this.previewLoading.set(false);
          this.previewKind.set('none');
          this.error.set(describeError(err));
          setTimeout(() => this.ensureSignPad(), 40);
        },
      });
      return;
    }

    this.previewKind.set('none');
    this.previewLoading.set(false);
    setTimeout(() => this.ensureSignPad(), 40);
  }

  closeViewer() {
    this.clearPreview();
    this.viewing.set(null);
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
    this.fillModel = {
      tema: training ? '' : req.title,
      fecha: new Date().toISOString().slice(0, 10),
      periodLabel: new Date().toISOString().slice(0, 7),
      objetivo: '',
      contenido: '',
      nombre1: me,
      nombre2: '',
      nombre3: '',
      firma1: null,
      firma2: null,
      firma3: null,
    };
    this.fillOpen.set(true);
    this.error.set('');
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
    if (!m.firma1 || !m.firma2) {
      this.error.set('Cargue la imagen de firma de ambas personas.');
      return;
    }
    if (needsAprobo && !m.firma3) {
      this.error.set('Cargue la imagen de firma de quien aprobó.');
      return;
    }

    const signatures: Array<{
      role: DocumentSignerRole;
      signerName: string;
      signatureBase64: string;
    }> = this.fillIsTraining()
      ? [
          {
            role: 'CAPACITADOR',
            signerName: m.nombre1.trim(),
            signatureBase64: m.firma1,
          },
          {
            role: 'ASISTENTE',
            signerName: m.nombre2.trim(),
            signatureBase64: m.firma2,
          },
        ]
      : [
          {
            role: 'ELABORO',
            signerName: m.nombre1.trim(),
            signatureBase64: m.firma1,
          },
          {
            role: 'REVISO',
            signerName: m.nombre2.trim(),
            signatureBase64: m.firma2,
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
      this.error.set('Dibuje la firma antes de sellar.');
      return;
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

  retireFile(fileId: string) {
    if (
      !confirm(
        '¿Retirar esta versión del expediente activo? Quedará en el histórico y no se borrará.',
      )
    ) {
      return;
    }
    this.api.retire(fileId).subscribe({
      next: (data) => {
        this.detail.set(data);
        this.notice.set('Versión retirada. El histórico se conserva.');
        if (this.viewing()?.id === fileId) this.closeViewer();
        this.load();
      },
      error: (err) => this.error.set(describeError(err)),
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
    this.openDetail(req.id);
    this.openViewer(req.latestFile, req.title);
  }

  goHome() {
    this.auth.goToWebsite();
  }

  logout() {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
