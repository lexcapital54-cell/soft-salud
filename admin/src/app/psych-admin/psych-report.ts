import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef, Component, ElementRef, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../auth.service';
import { clinicLogoUrl } from '../clinic-logo';
import { HabIcon } from '../habilitation/hab-icon';
import { UnsavedWorkService } from '../unsaved-work.service';
import { AttendanceControlApiService } from './attendance-control-api.service';
import { AttendancePatientHit } from './attendance-control.models';
import { PsychReportApiService } from './psych-report-api.service';
import {
  PsychReportData,
  PsychReportDraft,
  PsychReportListItem,
  REPORT_EXPORT_FORMAT,
  REPORT_FOOTER,
  REPORT_TEXT_MAX,
  SIGNATURE_MAX_DATAURL,
  ageAt,
  datePieces,
  emptyReport,
  fmtDate,
  parseReportExport,
  reportHasContent,
  todayKey,
} from './psych-report.models';

type TextKey = 'reason' | 'findings' | 'conclusions';

const SCOPE = 'psych-report';
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const SIGNATURE_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

async function describeError(err: unknown): Promise<{ message: string; fields?: Record<string, string> }> {
  const http = err as HttpErrorResponse;
  if (http?.status === 0) return { message: 'Sin conexión con el servidor. Intente de nuevo.' };
  if (http?.status === 401) return { message: 'Su sesión expiró. Inicie sesión de nuevo.' };
  let body = http?.error as { message?: string | string[]; fields?: Record<string, string> } | Blob | null;
  if (body instanceof Blob) {
    try {
      body = JSON.parse(await body.text());
    } catch {
      body = null;
    }
  }
  const b = body as { message?: string | string[]; fields?: Record<string, string> } | null;
  const msg = Array.isArray(b?.message) ? 'Revise los datos del informe.' : b?.message;
  if (http?.status === 403) return { message: msg || 'No tiene permiso para esta acción.' };
  if (http?.status === 413) return { message: 'El informe o la firma superan el tamaño permitido.' };
  return { message: msg || 'No se pudo completar la acción.', fields: b?.fields };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/png';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Ajusta la firma a un tamaño liviano (máx. 700×240) conservando la transparencia del PNG. */
async function compressSignature(source: Blob): Promise<string> {
  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen de la firma.'));
      el.src = url;
    });
    const scale = Math.min(1, 700 / img.naturalWidth, 240 / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let out = canvas.toDataURL('image/png');
    if (out.length > 400 * 1024) {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      out = canvas.toDataURL('image/jpeg', 0.85);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

@Component({
  selector: 'app-psych-report',
  imports: [FormsModule, RouterLink, HabIcon],
  templateUrl: './psych-report.html',
  styleUrl: './psych-report.scss',
})
export class PsychReportPage implements OnInit, OnDestroy {
  private readonly api = inject(PsychReportApiService);
  private readonly logoApi = inject(AttendanceControlApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly unsaved = inject(UnsavedWorkService);
  private readonly appRef = inject(ApplicationRef);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly textSections: ReadonlyArray<{ no: string; key: TextKey; title: string }> = [
    { no: '02', key: 'reason', title: 'Motivo y objetivo del informe' },
    { no: '03', key: 'findings', title: 'Evaluación y hallazgos' },
    { no: '04', key: 'conclusions', title: 'Conclusiones y recomendaciones' },
  ];
  readonly footer = REPORT_FOOTER;
  readonly textMax = REPORT_TEXT_MAX;
  readonly fmtDate = fmtDate;
  readonly datePieces = datePieces;

  readonly user = this.auth.user;
  readonly isPsychology = computed(() => String(this.user()?.specialty || '').toUpperCase() === 'PSYCHOLOGY');
  readonly canWrite = computed(() => ['ADMIN', 'HEALTH_PROFESSIONAL'].includes(String(this.user()?.role)));

  form: PsychReportData = emptyReport();
  readonly signature = signal<string | null>(null);
  /** El profesional quitó la firma para firmar a mano: el PDF no agrega la registrada. */
  private signatureRemoved = false;
  private savedSnapshot = this.snapshot();

  readonly docId = signal<string | null>(null);
  readonly patientId = signal<string | null>(null);
  readonly savedAt = signal<string | null>(null);
  readonly dirty = signal(false);
  readonly preview = signal(false);
  readonly busy = signal<'' | 'load' | 'save' | 'pdf' | 'print' | 'logo' | 'list' | 'signature'>('');
  readonly message = signal('');
  readonly error = signal('');
  readonly errors = signal<Record<string, string>>({});

  readonly patientQuery = signal('');
  readonly patientHits = signal<AttendancePatientHit[]>([]);
  readonly searching = signal(false);
  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly openDialog = signal(false);
  readonly onlyThisPatient = signal(true);
  readonly savedList = signal<PsychReportListItem[]>([]);

  readonly logoVersion = signal<string | null>(null);
  readonly logoClinicId = signal<string | null>(null);
  readonly logoOwn = signal(false);
  readonly logoUrl = computed(() => (this.logoVersion() ? clinicLogoUrl(this.logoClinicId(), 'formatos', this.logoVersion()) : null));

  private restorePreviewAfterPrint: boolean | null = null;
  private printFrame?: HTMLIFrameElement;
  private printUrl?: string;

  ngOnInit() {
    const id = this.route.snapshot.queryParamMap.get('id');
    const patientId = this.route.snapshot.queryParamMap.get('patientId');
    if (id) this.loadSaved(id);
    else if (patientId) this.loadDraft(this.api.prefill(patientId), true);
    else this.loadDraft(this.api.blank(), false);
    this.logoApi.logoStatus().subscribe({
      next: (s) => this.applyLogo(s),
      error: () => this.logoVersion.set(null),
    });
  }

  ngOnDestroy() {
    this.unsaved.setScopeDirty(SCOPE, false);
    clearTimeout(this.searchTimer);
    this.cleanupPrint();
  }

  /** Lo usa la guarda de la ruta antes de salir de la página. */
  canLeave(): boolean {
    return !this.dirty() || confirm('Hay cambios sin guardar en el informe. ¿Desea salir y descartarlos?');
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(e: BeforeUnloadEvent) {
    if (this.dirty()) e.preventDefault();
  }

  // ---------- Estado ----------
  private snapshot() {
    return JSON.stringify([this.form, this.signature?.() ?? null]);
  }

  onChange() {
    const isDirty = this.snapshot() !== this.savedSnapshot;
    this.dirty.set(isDirty);
    this.unsaved.setScopeDirty(SCOPE, isDirty);
    if (this.errors()['patient.fullName'] && this.form.patient.fullName.trim()) this.errors.set({});
    this.message.set('');
  }

  setText(key: TextKey, value: string) {
    this.form[key] = value ?? '';
    this.onChange();
  }

  onBirthDate() {
    this.form.patient.age = ageAt(this.form.patient.birthDate, this.form.issuedAt || todayKey());
    this.onChange();
  }

  private markClean() {
    this.savedSnapshot = this.snapshot();
    this.dirty.set(false);
    this.unsaved.setScopeDirty(SCOPE, false);
  }

  private apply(draft: PsychReportDraft, opts: { id: string | null; savedAt: string | null; signature: string | null; clean: boolean }) {
    const base = emptyReport();
    const d = draft.data;
    this.form = {
      ...base,
      ...d,
      patient: { ...base.patient, ...d.patient },
      professional: { ...base.professional, ...d.professional },
    };
    this.signature.set(opts.signature);
    this.signatureRemoved = false;
    this.patientId.set(draft.patientId ?? null);
    this.docId.set(opts.id);
    this.savedAt.set(opts.savedAt);
    this.errors.set({});
    if (opts.clean) this.markClean();
    else {
      // Un informe diligenciado con datos del paciente aún no está guardado.
      this.savedSnapshot = JSON.stringify([emptyReport(this.form.clinicName), null]);
      this.onChange();
    }
    this.autosizeSoon();
  }

  private loadDraft(source: Observable<PsychReportDraft>, fromPatient: boolean) {
    this.busy.set('load');
    this.error.set('');
    source.subscribe({
      next: (draft) => {
        this.busy.set('');
        this.apply(draft, { id: null, savedAt: null, signature: null, clean: !fromPatient });
        this.attachRegisteredSignature(!fromPatient);
        if (fromPatient) this.message.set('Datos de identificación del paciente y del profesional cargados. Complete el informe y guárdelo.');
        else setTimeout(() => this.host.nativeElement.querySelector<HTMLInputElement>('#rp-patient')?.focus());
      },
      error: async (err) => {
        this.busy.set('');
        this.error.set((await describeError(err)).message);
      },
    });
  }

  private loadSaved(id: string) {
    this.busy.set('load');
    this.api.get(id).subscribe({
      next: (row) => {
        const done = (signature: string | null) => {
          this.busy.set('');
          this.apply({ patientId: row.patientId, data: row.data }, { id: row.id, savedAt: row.updatedAt, signature, clean: true });
          this.message.set(`Informe de ${row.patientName} abierto.`);
          // Informe propio guardado sin firma: se muestra la registrada, igual que saldrá en el PDF.
          if (!signature && this.isMine()) this.attachRegisteredSignature(true);
        };
        if (!row.hasSignature) return done(null);
        this.api.signature(row.id).subscribe({
          next: async (blob) => done(await blobToDataUrl(blob)),
          error: () => done(null),
        });
      },
      error: async (err) => {
        this.busy.set('');
        this.error.set((await describeError(err)).message);
      },
    });
  }

  private confirmDiscard(): boolean {
    if (!reportHasContent(this.form, this.signature())) return true;
    if (!this.dirty()) return true;
    return confirm('El informe actual tiene información sin guardar. ¿Desea borrarla?');
  }

  // ---------- Paciente ----------
  onPatientQuery(value: string) {
    this.patientQuery.set(value);
    clearTimeout(this.searchTimer);
    const q = value.trim();
    if (q.length < 2) {
      this.patientHits.set([]);
      return;
    }
    this.searchTimer = setTimeout(() => {
      this.searching.set(true);
      this.api.searchPatients(q).subscribe({
        next: (rows) => {
          this.searching.set(false);
          this.patientHits.set(rows);
        },
        error: () => {
          this.searching.set(false);
          this.patientHits.set([]);
        },
      });
    }, 250);
  }

  pickPatient(p: AttendancePatientHit) {
    if (!this.confirmDiscard()) return;
    this.patientHits.set([]);
    this.patientQuery.set('');
    this.preview.set(false);
    this.loadDraft(this.api.prefill(p.id), true);
    this.router.navigate([], { queryParams: { patientId: p.id }, replaceUrl: true });
  }

  // ---------- Acciones ----------
  newReport() {
    if (!this.confirmDiscard()) return;
    this.preview.set(false);
    this.message.set('');
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
    this.loadDraft(this.api.blank(), false);
  }

  save() {
    if (!this.canWrite() || this.busy()) return;
    if (!this.form.patient.fullName.trim()) {
      this.errors.set({ 'patient.fullName': 'Escriba los nombres y apellidos del paciente antes de guardar.' });
      this.error.set('Falta el nombre del paciente.');
      this.focusField('f-patient-fullName');
      return;
    }
    this.busy.set('save');
    this.error.set('');
    const sig = this.signature();
    const id = this.docId();
    this.api.save(id, { patientId: this.patientId(), data: this.form, removeSignature: !!id && !sig }, sig ? dataUrlToBlob(sig) : null).subscribe({
      next: (row) => {
        this.busy.set('');
        this.docId.set(row.id);
        this.savedAt.set(row.updatedAt);
        this.markClean();
        this.message.set('Informe guardado en el consultorio.');
        this.router.navigate([], { queryParams: { id: row.id }, replaceUrl: true });
      },
      error: async (err) => {
        this.busy.set('');
        const e = await describeError(err);
        if (e.fields) this.errors.set(e.fields);
        this.error.set(e.message);
      },
    });
  }

  showOpen() {
    this.openDialog.set(true);
    this.loadList();
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.dialog .icon-btn')?.focus());
  }

  loadList() {
    this.busy.set('list');
    this.api.list(this.onlyThisPatient() ? this.patientId() : null).subscribe({
      next: (rows) => {
        this.busy.set('');
        this.savedList.set(rows);
      },
      error: async (err) => {
        this.busy.set('');
        this.error.set((await describeError(err)).message);
      },
    });
  }

  toggleOnlyPatient(v: boolean) {
    this.onlyThisPatient.set(v);
    this.loadList();
  }

  openSaved(item: PsychReportListItem) {
    if (!this.confirmDiscard()) return;
    this.openDialog.set(false);
    this.preview.set(false);
    this.router.navigate([], { queryParams: { id: item.id }, replaceUrl: true });
    this.loadSaved(item.id);
  }

  // ---------- Exportar / importar ----------
  exportData() {
    const payload = {
      format: REPORT_EXPORT_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      data: this.form,
      signature: this.signature(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    this.download(blob, `Informe_psicologico_${this.safeName()}_${this.form.issuedAt || todayKey()}.json`);
    this.message.set('Datos exportados en un archivo JSON. Guárdelo en un lugar seguro: contiene información del paciente.');
  }

  async onImportFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      this.error.set('El archivo es demasiado grande para ser un informe exportado.');
      return;
    }
    try {
      const parsed = parseReportExport(await file.text());
      if (!this.confirmDiscard()) return;
      this.preview.set(false);
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
      this.apply({ patientId: null, data: parsed.data }, { id: null, savedAt: null, signature: parsed.signature, clean: false });
      this.error.set('');
      this.message.set('Datos importados. Revise el informe y use «Guardar» si desea conservarlo en el consultorio.');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    }
  }

  // ---------- PDF e impresión ----------
  private requestPdf(next: (blob: Blob) => void, kind: 'pdf' | 'print') {
    if (this.busy()) return;
    this.busy.set(kind);
    this.error.set('');
    const sig = this.signature();
    this.api.pdf(this.form, sig ? dataUrlToBlob(sig) : null, !sig && this.signatureRemoved).subscribe({
      next: (blob) => {
        this.busy.set('');
        next(blob);
      },
      error: async (err) => {
        this.busy.set('');
        this.error.set((await describeError(err)).message);
      },
    });
  }

  downloadPdf() {
    this.requestPdf((blob) => {
      this.download(blob, `Informe_psicologico_${this.safeName()}_${this.form.issuedAt || todayKey()}.pdf`);
      this.message.set('PDF descargado.');
    }, 'pdf');
  }

  /** Imprime el mismo PDF que se descarga: conserva diseño, encabezado de continuación y numeración. */
  print() {
    this.requestPdf((blob) => {
      this.cleanupPrint();
      this.printUrl = URL.createObjectURL(blob);
      const frame = document.createElement('iframe');
      frame.className = 'print-pdf-frame';
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;';
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } catch {
          window.open(this.printUrl, '_blank', 'noopener');
        }
      };
      frame.src = this.printUrl;
      document.body.appendChild(frame);
      this.printFrame = frame;
    }, 'print');
  }

  private cleanupPrint() {
    this.printFrame?.remove();
    this.printFrame = undefined;
    if (this.printUrl) setTimeout((u: string) => URL.revokeObjectURL(u), 60_000, this.printUrl);
    this.printUrl = undefined;
  }

  /** Ctrl+P desde la página: se imprime la vista limpia, sin controles de edición. */
  @HostListener('window:beforeprint')
  onBeforePrint() {
    if (this.preview()) return;
    this.restorePreviewAfterPrint = false;
    this.preview.set(true);
    this.appRef.tick();
  }

  @HostListener('window:afterprint')
  onAfterPrint() {
    if (this.restorePreviewAfterPrint === null) return;
    this.preview.set(this.restorePreviewAfterPrint);
    this.restorePreviewAfterPrint = null;
    this.autosizeSoon();
  }

  togglePreview() {
    this.preview.set(!this.preview());
    this.autosizeSoon();
  }

  // ---------- Firma ----------
  async onSignatureFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      this.error.set('La firma debe ser una imagen PNG o JPG.');
      return;
    }
    if (file.size > SIGNATURE_SOURCE_MAX_BYTES) {
      this.error.set('La imagen de la firma no puede pesar más de 8 MB.');
      return;
    }
    this.busy.set('signature');
    try {
      const out = await compressSignature(file);
      if (out.length > SIGNATURE_MAX_DATAURL) throw new Error('La firma sigue siendo muy pesada. Use una imagen más pequeña.');
      this.signature.set(out);
      this.signatureRemoved = false;
      this.error.set('');
      this.onChange();
      this.message.set('Firma cargada en este informe.');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No se pudo cargar la firma.');
    } finally {
      this.busy.set('');
    }
  }

  useRegisteredSignature() {
    this.busy.set('signature');
    this.api.mySignature().subscribe({
      next: async ({ dataUrl }) => {
        try {
          if (!dataUrl) {
            this.message.set('');
            this.error.set('No tiene una firma registrada en su perfil. Puede cargar una imagen de la firma.');
            return;
          }
          this.signatureRemoved = false;
          this.signature.set(await compressSignature(dataUrlToBlob(dataUrl)));
          this.error.set('');
          this.onChange();
          this.message.set('Se agregó su firma registrada a este informe.');
        } finally {
          this.busy.set('');
        }
      },
      error: async (err) => {
        this.busy.set('');
        this.error.set((await describeError(err)).message);
      },
    });
  }

  removeSignature() {
    if (!confirm('¿Quitar la firma de este informe? El PDF saldrá con la línea en blanco para firmar a mano.')) return;
    this.signature.set(null);
    this.signatureRemoved = true;
    this.onChange();
  }

  /** El informe es del profesional con la sesión (sin nombre o con su mismo nombre). */
  private isMine(): boolean {
    const key = (v: string) =>
      (v || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\b(dra?|ps|psic|lic)\.?\s+/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const name = key(this.form.professional.fullName);
    return !name || name === key(String(this.user()?.fullName || ''));
  }

  /** Pone la firma registrada en el perfil; `keepClean` evita marcar cambios sin guardar. */
  private attachRegisteredSignature(keepClean: boolean) {
    if (!this.canWrite() || this.signature()) return;
    this.api.mySignature().subscribe({
      next: async ({ dataUrl }) => {
        if (!dataUrl || this.signature() || this.signatureRemoved) return;
        try {
          this.signature.set(await compressSignature(dataUrlToBlob(dataUrl)));
          if (keepClean && !this.dirty()) this.markClean();
          else this.onChange();
        } catch {
          // Sin firma legible: queda la línea en blanco para firmar a mano.
        }
      },
      error: () => undefined,
    });
  }

  // ---------- Logo ----------
  onLogoFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      this.error.set('El logo debe ser una imagen PNG o JPG.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      this.error.set('El logo no puede pesar más de 2 MB.');
      return;
    }
    this.busy.set('logo');
    this.error.set('');
    this.logoApi.uploadLogo(file).subscribe({
      next: (s) => {
        this.busy.set('');
        this.applyLogo(s);
        this.message.set('Logo guardado para los formatos del consultorio.');
      },
      error: async (err) => {
        this.busy.set('');
        this.error.set((await describeError(err)).message);
      },
    });
  }

  removeLogo() {
    if (!confirm('¿Quitar el logo propio de los formatos? Se usará el logo del consultorio si existe.')) return;
    this.busy.set('logo');
    this.logoApi.removeLogo().subscribe({
      next: (s) => {
        this.busy.set('');
        this.applyLogo(s);
        this.message.set(s.updatedAt ? 'Logo propio quitado: se usa el logo del consultorio.' : 'Logo quitado.');
      },
      error: async (err) => {
        this.busy.set('');
        this.error.set((await describeError(err)).message);
      },
    });
  }

  private applyLogo(s: { clinicId: string; updatedAt: string | null; own: boolean }) {
    this.logoClinicId.set(s.clinicId);
    this.logoVersion.set(s.updatedAt);
    this.logoOwn.set(!!s.own);
  }

  onLogoError() {
    this.logoVersion.set(null);
  }

  // ---------- Utilidades ----------
  /** Los cuadros de texto crecen con el contenido (respaldo para navegadores sin `field-sizing`). */
  autosize(el: EventTarget | null) {
    const ta = el as HTMLTextAreaElement | null;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
  }

  private autosizeSoon() {
    setTimeout(() => this.host.nativeElement.querySelectorAll<HTMLTextAreaElement>('textarea.grow').forEach((t) => this.autosize(t)));
  }

  private focusField(id: string) {
    setTimeout(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLInputElement | null)?.focus({ preventScroll: true });
    });
  }

  private safeName() {
    return (this.form.patient.fullName || 'informe').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').slice(0, 60);
  }

  private download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  err(key: string) {
    return this.errors()[key] || '';
  }

  savedLabel() {
    const at = this.savedAt();
    return at ? new Date(at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  }

  listDate(at: string) {
    return new Date(at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  }
}
