import { NgTemplateOutlet } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminApiService } from '../admin-api.service';
import { AuthService } from '../auth.service';
import { Clinic } from '../models';
import { DocumentsApiService } from '../documents/documents-api.service';
import { DocumentFileRow, RequirementDetail } from '../documents/documents.models';
import { HabIcon } from './hab-icon';
import { HabilitationApiService } from './habilitation-api.service';
import {
  ActivityItem,
  DocCategory,
  DocState,
  PillarInfo,
  PillarKey,
  Registry,
  RegistryDoc,
  STATE_LABELS,
} from './habilitation.models';

type View = 'dashboard' | 'estandares' | 'estandar' | 'documentos' | 'maestra' | 'vencimientos' | 'archivo' | 'tipos';
type DueWindow = '7' | '15' | '30' | 'vencidos';

const VIEWS: View[] = ['dashboard', 'estandares', 'estandar', 'documentos', 'maestra', 'vencimientos', 'archivo', 'tipos'];

const PILLAR_ICONS: Record<PillarKey, string> = {
  TALENTO_HUMANO: 'users',
  INFRAESTRUCTURA: 'building',
  DOTACION: 'package',
  MEDICAMENTOS_INSUMOS: 'pill',
  PROCESOS_PRIORITARIOS: 'clipboard',
  HISTORIA_CLINICA: 'file',
  INTERDEPENDENCIA: 'link',
  DOCUMENTACION_LEGAL: 'scale',
  SG_SST: 'shield',
};

interface DocForm {
  pillar: PillarKey | '';
  categoryId: string;
  title: string;
  code: string;
  description: string;
  responsibleName: string;
  responsibleArea: string;
  validityDays: string;
  file: File | null;
  issuedAt: string;
  expiresAt: string;
  notes: string;
}

interface UploadForm {
  file: File | null;
  issuedAt: string;
  expiresAt: string;
  changeReason: string;
  notes: string;
  retirePrevious: boolean;
}

function describeError(err: unknown): string {
  const http = err as HttpErrorResponse;
  if (http?.status === 0) return 'Sin conexión con el servidor. Intente de nuevo.';
  if (http?.status === 401) return 'Su sesión expiró. Inicie sesión de nuevo.';
  if (http?.status === 403) return http.error?.message || 'No tiene permiso para esta acción.';
  const msg = http?.error?.message;
  if (Array.isArray(msg)) return msg.join(' ');
  return msg || 'No se pudo completar la acción.';
}

const emptyDocForm = (): DocForm => ({
  pillar: '',
  categoryId: '',
  title: '',
  code: '',
  description: '',
  responsibleName: '',
  responsibleArea: '',
  validityDays: '',
  file: null,
  issuedAt: '',
  expiresAt: '',
  notes: '',
});

@Component({
  selector: 'app-habilitation-docs',
  standalone: true,
  imports: [FormsModule, RouterLink, HabIcon, NgTemplateOutlet],
  templateUrl: './habilitation-docs.html',
  styleUrl: './habilitation-docs.scss',
})
export class HabilitationDocs {
  private readonly api = inject(HabilitationApiService);
  private readonly docsApi = inject(DocumentsApiService);
  private readonly adminApi = inject(AdminApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  readonly auth = inject(AuthService);

  readonly stateLabels = STATE_LABELS;
  readonly isSuper = this.auth.isSuperAdmin();
  readonly homeLink = this.isSuper ? '/admin' : '/consultorio';
  readonly expedienteLink = this.isSuper ? '/admin/documentos' : '/consultorio/documentos';
  readonly today = new Date();

  readonly registry = signal<Registry | null>(null);
  readonly activity = signal<ActivityItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);

  readonly clinics = signal<Clinic[]>([]);
  readonly selectedClinicId = signal('');

  readonly view = signal<View>('dashboard');
  readonly pillar = signal<PillarKey | ''>('');
  readonly navOpen = signal(false);
  readonly dueWindow = signal<DueWindow>('30');
  readonly dueWindows: DueWindow[] = ['7', '15', '30', 'vencidos'];

  // Filtros combinables de la tabla de documentos.
  readonly q = signal('');
  readonly fPillar = signal<PillarKey | ''>('');
  readonly fCategory = signal('');
  readonly fResponsible = signal('');
  readonly fState = signal<DocState | ''>('');
  readonly fValidity = signal<'' | 'con' | 'sin'>('');
  readonly fYear = signal('');
  readonly fVersion = signal<'' | 'una' | 'varias'>('');
  readonly showDisabled = signal(false);
  readonly filtersOpen = signal(false);

  // Panel lateral del documento.
  readonly drawer = signal<RegistryDoc | null>(null);
  readonly drawerTab = signal<'detalle' | 'versiones' | 'historial'>('detalle');
  readonly drawerDetail = signal<RequirementDetail | null>(null);
  readonly drawerActivity = signal<ActivityItem[]>([]);
  readonly viewer = signal<{
    fileId: string;
    name: string;
    kind: 'loading' | 'pdf' | 'image' | 'html' | 'other' | 'error';
    url: SafeResourceUrl | null;
    rawUrl: string | null;
    html: SafeHtml | null;
    message?: string;
  } | null>(null);

  // Formularios.
  readonly formMode = signal<'create' | 'edit' | null>(null);
  docForm: DocForm = emptyDocForm();
  private editingId = '';
  readonly uploadFor = signal<RegistryDoc | null>(null);
  uploadForm: UploadForm = { file: null, issuedAt: '', expiresAt: '', changeReason: '', notes: '', retirePrevious: true };

  // Tipos documentales (superadmin).
  readonly categories = signal<DocCategory[]>([]);
  newCategory = { name: '', pillar: 'PROCESOS_PRIORITARIOS' as PillarKey };
  readonly editingCategory = signal<string | null>(null);
  categoryDraft = { name: '', pillar: 'PROCESOS_PRIORITARIOS' as PillarKey };

  readonly canManage = computed(() => !!this.registry()?.canManage);
  /** Carga/reemplazo y archivado usan los endpoints del expediente (superadmin y admin del consultorio). */
  readonly writerRole = computed(() => {
    const role = this.auth.user()?.role;
    return role === 'SUPER_ADMIN' || role === 'ADMIN';
  });
  readonly canDownload = this.auth.canDownloadDocuments;

  readonly pillars = computed<PillarInfo[]>(() => this.registry()?.pillars ?? []);
  readonly standards = computed(() => this.pillars().filter((p) => p.isStandard));
  readonly supportGroups = computed(() => this.pillars().filter((p) => !p.isStandard));

  /** Documentos que aplican al consultorio (los deshabilitados solo los ve el superadmin si lo pide). */
  private readonly applicable = computed(() =>
    (this.registry()?.documents ?? []).filter((d) => d.isEnabled || this.showDisabled()),
  );
  readonly activeDocs = computed(() => this.applicable().filter((d) => d.state !== 'ARCHIVADO'));
  readonly archivedDocs = computed(() => this.applicable().filter((d) => d.state === 'ARCHIVADO'));

  readonly stats = computed(() => {
    const docs = this.activeDocs();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return {
      total: docs.length,
      vigentes: docs.filter((d) => d.state === 'VIGENTE').length,
      porVencer: docs.filter((d) => d.state === 'POR_VENCER').length,
      vencidos: docs.filter((d) => d.state === 'VENCIDO').length,
      pendientes: docs.filter((d) => d.state === 'PENDIENTE').length,
      mes: docs.filter((d) => d.lastUpdate && new Date(d.lastUpdate).getTime() >= monthStart).length,
    };
  });

  readonly pillarCards = computed(() => {
    const docs = this.activeDocs();
    return this.pillars().map((p) => {
      const mine = docs.filter((d) => d.pillar === p.key);
      const last = mine.reduce<string | null>(
        (acc, d) => (d.lastUpdate && (!acc || d.lastUpdate > acc) ? d.lastUpdate : acc),
        null,
      );
      return {
        ...p,
        icon: PILLAR_ICONS[p.key],
        total: mine.length,
        types: new Set(mine.map((d) => d.categoryId)).size,
        vigentes: mine.filter((d) => d.state === 'VIGENTE').length,
        porVencer: mine.filter((d) => d.state === 'POR_VENCER').length,
        vencidos: mine.filter((d) => d.state === 'VENCIDO').length,
        pendientes: mine.filter((d) => d.state === 'PENDIENTE').length,
        lastUpdate: last,
      };
    });
  });
  readonly standardCards = computed(() => this.pillarCards().filter((p) => p.isStandard));
  readonly supportCards = computed(() => this.pillarCards().filter((p) => !p.isStandard && p.total > 0));
  readonly currentPillar = computed(() => this.pillarCards().find((p) => p.key === this.pillar()) ?? null);

  readonly categoryOptions = computed(() => {
    const pillar = this.view() === 'estandar' ? this.pillar() : this.fPillar();
    const used = new Map<string, string>();
    for (const d of this.activeDocs()) {
      if (!pillar || d.pillar === pillar) used.set(d.categoryId, d.categoryName);
    }
    return [...used.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });
  readonly responsibleOptions = computed(() =>
    [...new Set(this.activeDocs().map((d) => d.responsibleName || d.responsibleArea).filter((v): v is string => !!v))].sort(),
  );
  readonly yearOptions = computed(() =>
    [
      ...new Set(
        this.activeDocs()
          .map((d) => d.current?.issuedAt ?? d.current?.createdAt)
          .filter((v): v is string => !!v)
          .map((v) => v.slice(0, 4)),
      ),
    ].sort((a, b) => b.localeCompare(a)),
  );

  readonly hasFilters = computed(
    () =>
      !!(
        this.q() ||
        this.fPillar() ||
        this.fCategory() ||
        this.fResponsible() ||
        this.fState() ||
        this.fValidity() ||
        this.fYear() ||
        this.fVersion()
      ),
  );

  readonly filtered = computed(() => {
    const view = this.view();
    const pillar = view === 'estandar' ? this.pillar() : this.fPillar();
    const q = this.normalize(this.q());
    const cat = this.fCategory();
    const resp = this.fResponsible();
    const state = this.fState();
    const validity = this.fValidity();
    const year = this.fYear();
    const version = this.fVersion();
    return this.activeDocs().filter((d) => {
      if (pillar && d.pillar !== pillar) return false;
      if (cat && d.categoryId !== cat) return false;
      if (resp && d.responsibleName !== resp && d.responsibleArea !== resp) return false;
      if (state && d.state !== state) return false;
      if (validity === 'con' && !d.expiresAt) return false;
      if (validity === 'sin' && d.expiresAt) return false;
      if (year && !(d.current?.issuedAt ?? d.current?.createdAt ?? '').startsWith(year)) return false;
      if (version === 'una' && d.versionCount > 1) return false;
      if (version === 'varias' && d.versionCount < 2) return false;
      if (q) {
        const hay = this.normalize(
          [
            d.title,
            d.code,
            d.pillarLabel,
            d.categoryName,
            d.responsibleName,
            d.responsibleArea,
            d.current?.originalName,
            d.description,
          ]
            .filter(Boolean)
            .join(' '),
        );
        if (!q.split(/\s+/).every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  });

  readonly dueDocs = computed(() => {
    const w = this.dueWindow();
    return this.activeDocs()
      .filter((d) => d.daysLeft !== null && d.current)
      .filter((d) => (w === 'vencidos' ? d.daysLeft! < 0 : d.daysLeft! >= 0 && d.daysLeft! <= Number(w)))
      .sort((a, b) => a.daysLeft! - b.daysLeft!);
  });
  readonly dueCounts = computed(() => {
    const docs = this.activeDocs().filter((d) => d.daysLeft !== null && d.current);
    const within = (n: number) => docs.filter((d) => d.daysLeft! >= 0 && d.daysLeft! <= n).length;
    return { '7': within(7), '15': within(15), '30': within(30), vencidos: docs.filter((d) => d.daysLeft! < 0).length };
  });

  readonly recent = computed(() =>
    this.activeDocs()
      .filter((d) => d.lastUpdate)
      .sort((a, b) => (b.lastUpdate! > a.lastUpdate! ? 1 : -1))
      .slice(0, 8),
  );

  readonly formCategories = computed(() => {
    const regCats = this.registry()?.categories ?? [];
    return (pillar: string) => regCats.filter((c) => c.pillar === pillar && (c.isActive || c.id === this.docForm.categoryId));
  });

  readonly categoriesByPillar = computed(() =>
    this.pillars().map((p) => ({ ...p, items: this.categories().filter((c) => c.pillar === p.key) })),
  );

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const v = params.get('vista') as View | null;
    if (v && VIEWS.includes(v)) this.view.set(v);
    const p = params.get('estandar') as PillarKey | null;
    if (p) this.pillar.set(p);
    const qp = params.get('q');
    if (qp) this.q.set(qp);

    if (this.isSuper) {
      const fromQuery = params.get('clinicId') || '';
      this.adminApi.listClinics().subscribe({
        next: (clinics) => {
          this.clinics.set(clinics);
          const pick = clinics.find((c) => c.id === fromQuery)?.id || clinics[0]?.id || '';
          if (pick) this.selectClinic(pick, false);
          else {
            this.loading.set(false);
            this.error.set('No hay consultorios para administrar.');
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(describeError(err));
        },
      });
    } else {
      this.api.clinicId = null;
      this.docsApi.clinicId = null;
      this.load();
    }
  }

  selectClinic(id: string, syncUrl = true) {
    this.selectedClinicId.set(id);
    this.api.clinicId = id;
    this.docsApi.clinicId = id;
    this.closeDrawer();
    if (syncUrl) this.syncUrl({ clinicId: id });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.registry().subscribe({
      next: (data) => {
        this.registry.set(data);
        this.loading.set(false);
        const docId = this.route.snapshot.queryParamMap.get('doc');
        if (docId && !this.drawer()) {
          const doc = data.documents.find((d) => d.id === docId);
          if (doc) this.openDoc(doc);
        } else if (this.drawer()) {
          const fresh = data.documents.find((d) => d.id === this.drawer()!.id);
          this.drawer.set(fresh ?? null);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(describeError(err));
      },
    });
    this.api.activity(undefined, 12).subscribe({
      next: (rows) => this.activity.set(rows),
      error: () => this.activity.set([]),
    });
    if (this.view() === 'tipos') this.loadCategories();
  }

  private syncUrl(params: Record<string, string | null>) {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  go(view: View, pillar?: PillarKey) {
    this.view.set(view);
    this.navOpen.set(false);
    if (view === 'estandar' && pillar) {
      this.pillar.set(pillar);
      this.fCategory.set('');
    }
    if (view === 'tipos') this.loadCategories();
    this.syncUrl({ vista: view === 'dashboard' ? null : view, estandar: view === 'estandar' ? pillar ?? this.pillar() : null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goDue(w: DueWindow) {
    this.dueWindow.set(w);
    this.go('vencimientos');
  }

  globalSearch(value: string) {
    this.q.set(value);
    if (value && this.view() !== 'documentos' && this.view() !== 'estandar') this.go('documentos');
  }

  clearFilters() {
    this.q.set('');
    this.fPillar.set('');
    this.fCategory.set('');
    this.fResponsible.set('');
    this.fState.set('');
    this.fValidity.set('');
    this.fYear.set('');
    this.fVersion.set('');
  }

  filterByState(state: DocState) {
    this.clearFilters();
    this.fState.set(state);
    this.go('documentos');
  }

  // ---------- Panel del documento ----------

  openDoc(doc: RegistryDoc, tab: 'detalle' | 'versiones' | 'historial' = 'detalle') {
    this.drawer.set(doc);
    this.drawerTab.set(tab);
    this.drawerDetail.set(null);
    this.drawerActivity.set([]);
    this.syncUrl({ doc: doc.id });
    this.docsApi.listFiles(doc.id).subscribe({
      next: (d) => this.drawerDetail.set(d),
      error: (err) => this.error.set(describeError(err)),
    });
    this.api.activity(doc.id, 50).subscribe({
      next: (rows) => this.drawerActivity.set(rows),
      error: () => this.drawerActivity.set([]),
    });
  }

  closeDrawer() {
    if (!this.drawer()) return;
    this.drawer.set(null);
    this.syncUrl({ doc: null });
  }

  /** Visor dentro de la página: las pestañas nuevas con blob suelen bloquearse (Safari, bloqueadores de ventanas). */
  viewFile(fileId: string, name: string, mimeType: string) {
    this.closeViewer();
    const lower = name.toLowerCase();
    const isWord = mimeType.includes('word') || lower.endsWith('.docx') || lower.endsWith('.doc');
    this.viewer.set({ fileId, name, kind: 'loading', url: null, rawUrl: null, html: null });

    if (isWord) {
      this.docsApi.previewHtml(fileId).subscribe({
        next: (res) => this.viewer.set({ fileId, name, kind: 'html', url: null, rawUrl: null, html: this.sanitizer.bypassSecurityTrustHtml(res.html) }),
        error: (err) => this.viewer.set({ fileId, name, kind: 'error', url: null, rawUrl: null, html: null, message: describeError(err) }),
      });
      return;
    }

    this.docsApi.viewBlob(fileId).subscribe({
      next: (blob) => {
        const type = blob.type || mimeType;
        const kind = type.startsWith('image/') ? 'image' : type.includes('pdf') ? 'pdf' : 'other';
        const rawUrl = URL.createObjectURL(blob);
        this.viewer.set({ fileId, name, kind, rawUrl, url: this.sanitizer.bypassSecurityTrustResourceUrl(rawUrl), html: null });
      },
      error: (err) => this.viewer.set({ fileId, name, kind: 'error', url: null, rawUrl: null, html: null, message: describeError(err) }),
    });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.viewer()) this.closeViewer();
    else if (this.uploadFor()) this.closeUpload();
    else if (this.formMode()) this.closeForm();
    else this.closeDrawer();
  }

  closeViewer() {
    const v = this.viewer();
    if (v?.rawUrl) URL.revokeObjectURL(v.rawUrl);
    this.viewer.set(null);
  }

  downloadFile(fileId: string, name: string) {
    this.docsApi.downloadBlob(fileId).subscribe({
      next: (blob) => this.saveBlob(blob, name),
      error: (err) => this.error.set(describeError(err)),
    });
  }

  archiveVersion(file: DocumentFileRow) {
    const doc = this.drawer();
    if (!doc || !confirm(`¿Archivar la versión ${file.version}? Deja de estar vigente y se conserva en el historial.`)) return;
    this.docsApi.retire(file.id).subscribe({
      next: (detail) => {
        this.drawerDetail.set(detail);
        this.flash('Versión archivada. Se conserva en el historial.');
        this.load();
        this.refreshDrawerActivity(doc.id);
      },
      error: (err) => this.error.set(describeError(err)),
    });
  }

  toggleArchive(doc: RegistryDoc) {
    const archive = doc.state !== 'ARCHIVADO';
    const msg = archive
      ? `¿Archivar «${doc.title}»? Sale de las listas activas; el documento, sus versiones y su historial se conservan.`
      : `¿Restaurar «${doc.title}» a los documentos activos?`;
    if (!confirm(msg)) return;
    this.api.setArchived(doc.id, archive).subscribe({
      next: () => {
        this.flash(archive ? 'Documento archivado.' : 'Documento restaurado.');
        this.load();
        if (this.drawer()?.id === doc.id) this.refreshDrawerActivity(doc.id);
      },
      error: (err) => this.error.set(describeError(err)),
    });
  }

  private refreshDrawerActivity(id: string) {
    this.api.activity(id, 50).subscribe({ next: (rows) => this.drawerActivity.set(rows) });
  }

  // ---------- Crear / editar ----------

  openCreate(pillar?: PillarKey) {
    this.docForm = emptyDocForm();
    if (pillar) this.docForm.pillar = pillar;
    else if (this.view() === 'estandar' && this.pillar()) this.docForm.pillar = this.pillar();
    this.formMode.set('create');
  }

  openEdit(doc: RegistryDoc) {
    this.editingId = doc.id;
    this.docForm = {
      ...emptyDocForm(),
      pillar: doc.pillar,
      categoryId: doc.categoryId,
      title: doc.title,
      code: doc.code,
      description: doc.description ?? '',
      responsibleName: doc.responsibleName ?? '',
      responsibleArea: doc.responsibleArea ?? '',
      validityDays: doc.validityDays ? String(doc.validityDays) : '',
    };
    this.formMode.set('edit');
  }

  closeForm() {
    this.formMode.set(null);
  }

  onPillarChange() {
    this.docForm.categoryId = '';
  }

  onFormFile(event: Event) {
    this.docForm.file = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  saveForm() {
    const f = this.docForm;
    if (!f.categoryId || f.title.trim().length < 2) {
      this.error.set('Complete el estándar, la categoría y el nombre del documento.');
      return;
    }
    if (this.formMode() === 'create' && !f.responsibleName.trim() && !f.responsibleArea.trim()) {
      this.error.set('Indique el responsable o el área responsable del documento.');
      return;
    }
    const validity = f.validityDays ? Number(f.validityDays) : undefined;
    this.busy.set(true);
    this.error.set('');

    if (this.formMode() === 'edit') {
      this.api
        .updateDocument(this.editingId, {
          title: f.title,
          description: f.description,
          responsibleName: f.responsibleName,
          responsibleArea: f.responsibleArea,
          validityDays: validity ?? null,
          ...(this.canManage() ? { code: f.code, categoryId: f.categoryId } : {}),
        })
        .subscribe({
          next: (res) => {
            this.busy.set(false);
            this.formMode.set(null);
            this.flash(res.changed ? 'Datos del documento actualizados.' : 'No hubo cambios.');
            this.load();
            if (this.drawer()?.id === this.editingId) this.refreshDrawerActivity(this.editingId);
          },
          error: (err) => {
            this.busy.set(false);
            this.error.set(describeError(err));
          },
        });
      return;
    }

    this.api
      .createDocument({
        categoryId: f.categoryId,
        title: f.title.trim(),
        code: f.code.trim() || undefined,
        description: f.description.trim() || undefined,
        responsibleName: f.responsibleName.trim() || undefined,
        responsibleArea: f.responsibleArea.trim() || undefined,
        validityDays: validity,
      })
      .subscribe({
        next: (res) => {
          if (!f.file) {
            this.busy.set(false);
            this.formMode.set(null);
            this.flash(`Documento ${res.code} creado como «Pendiente de cargar».`);
            this.load();
            return;
          }
          this.docsApi
            .upload(res.id, f.file, {
              expiresAt: f.expiresAt || undefined,
              notes: f.notes || undefined,
              issuedAt: f.issuedAt || undefined,
            })
            .subscribe({
              next: () => {
                this.busy.set(false);
                this.formMode.set(null);
                this.flash(`Documento ${res.code} creado con su archivo.`);
                this.load();
              },
              error: (err) => {
                this.busy.set(false);
                this.formMode.set(null);
                this.error.set(`El documento ${res.code} quedó creado, pero el archivo no se cargó: ${describeError(err)}`);
                this.load();
              },
            });
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(describeError(err));
        },
      });
  }

  // ---------- Nueva versión / reemplazo ----------

  openUpload(doc: RegistryDoc) {
    this.uploadForm = {
      file: null,
      issuedAt: '',
      expiresAt: '',
      changeReason: '',
      notes: '',
      retirePrevious: !!doc.current,
    };
    this.uploadFor.set(doc);
  }

  closeUpload() {
    this.uploadFor.set(null);
  }

  onUploadFile(event: Event) {
    this.uploadForm.file = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  saveUpload() {
    const doc = this.uploadFor();
    const u = this.uploadForm;
    if (!doc || !u.file) {
      this.error.set('Seleccione el archivo a cargar.');
      return;
    }
    if (doc.current && !u.changeReason.trim()) {
      this.error.set('Indique el motivo del cambio de versión.');
      return;
    }
    const previousId = doc.current?.id ?? null;
    this.busy.set(true);
    this.error.set('');
    this.docsApi
      .upload(doc.id, u.file, {
        expiresAt: u.expiresAt || undefined,
        notes: u.notes || undefined,
        issuedAt: u.issuedAt || undefined,
        changeReason: u.changeReason || undefined,
      })
      .subscribe({
        next: (detail) => {
          const done = (text: string) => {
            this.busy.set(false);
            this.uploadFor.set(null);
            this.flash(text);
            this.load();
            if (this.drawer()?.id === doc.id) {
              this.drawerDetail.set(detail);
              this.refreshDrawerActivity(doc.id);
            }
          };
          if (previousId && u.retirePrevious) {
            this.docsApi.retire(previousId).subscribe({
              next: (d) => {
                detail = d;
                done('Nueva versión cargada. La anterior quedó archivada en el historial.');
              },
              error: () => done('Nueva versión cargada. No se pudo archivar la anterior; sigue en el historial.'),
            });
          } else {
            done(previousId ? 'Nueva versión cargada.' : 'Archivo cargado.');
          }
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(describeError(err));
        },
      });
  }

  // ---------- Lista maestra ----------

  exportMaster(format: 'xlsx' | 'pdf') {
    this.busy.set(true);
    this.api.exportMasterList(format).subscribe({
      next: (res) => {
        this.busy.set(false);
        const cd = res.headers.get('content-disposition') || '';
        const name = /filename="([^"]+)"/.exec(cd)?.[1] || `Lista_maestra.${format}`;
        if (res.body) this.saveBlob(res.body, name);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(describeError(err));
      },
    });
  }

  // ---------- Tipos documentales ----------

  loadCategories() {
    if (!this.isSuper) return;
    this.api.categories().subscribe({
      next: (rows) => this.categories.set(rows),
      error: (err) => this.error.set(describeError(err)),
    });
  }

  addCategory() {
    const name = this.newCategory.name.trim();
    if (name.length < 2) {
      this.error.set('Escriba el nombre del tipo documental.');
      return;
    }
    this.api.createCategory({ name, pillar: this.newCategory.pillar }).subscribe({
      next: () => {
        this.newCategory.name = '';
        this.flash('Tipo documental creado.');
        this.loadCategories();
        this.load();
      },
      error: (err) => this.error.set(describeError(err)),
    });
  }

  startEditCategory(c: DocCategory) {
    this.editingCategory.set(c.id);
    this.categoryDraft = { name: c.name, pillar: c.pillar };
  }

  saveCategory(c: DocCategory) {
    this.api.updateCategory(c.id, { name: this.categoryDraft.name, pillar: this.categoryDraft.pillar }).subscribe({
      next: () => {
        this.editingCategory.set(null);
        this.flash('Tipo documental actualizado.');
        this.loadCategories();
        this.load();
      },
      error: (err) => this.error.set(describeError(err)),
    });
  }

  toggleCategory(c: DocCategory) {
    this.api.updateCategory(c.id, { isActive: !c.isActive }).subscribe({
      next: () => {
        this.flash(c.isActive ? 'Tipo documental desactivado. Los documentos existentes se conservan.' : 'Tipo documental activado.');
        this.loadCategories();
        this.load();
      },
      error: (err) => this.error.set(describeError(err)),
    });
  }

  // ---------- Utilidades de vista ----------

  canWrite(doc: RegistryDoc) {
    return doc.canEdit && this.writerRole();
  }

  pillarIcon(key: PillarKey) {
    return PILLAR_ICONS[key] ?? 'folder';
  }

  pillarIndex(key: PillarKey) {
    return this.standards().findIndex((p) => p.key === key) + 1;
  }

  date(value: string | null | undefined) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  dateTime(value: string | null | undefined) {
    if (!value) return '—';
    return new Date(value).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  todayLabel() {
    return this.today.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  daysText(days: number | null) {
    if (days === null) return 'Sin vencimiento';
    if (days < 0) return `Venció hace ${Math.abs(days)} ${Math.abs(days) === 1 ? 'día' : 'días'}`;
    if (days === 0) return 'Vence hoy';
    return `${days} ${days === 1 ? 'día' : 'días'}`;
  }

  size(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  stateClass(state: DocState) {
    return `st st-${state.toLowerCase()}`;
  }

  initials(name: string | null | undefined) {
    return (name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]!.toUpperCase())
      .join('');
  }

  logout() {
    if (this.isSuper) this.auth.logoutToAdminLogin();
    else this.auth.logoutToClinicLogin();
  }

  private normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private saveBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }

  private flash(text: string) {
    this.notice.set(text);
    setTimeout(() => {
      if (this.notice() === text) this.notice.set('');
    }, 5000);
  }
}
