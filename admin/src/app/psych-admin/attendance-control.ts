import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef, Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../auth.service';
import { clinicLogoUrl } from '../clinic-logo';
import { UnsavedWorkService } from '../unsaved-work.service';
import { HabIcon } from '../habilitation/hab-icon';
import { AttendanceControlApiService } from './attendance-control-api.service';
import {
  AttendanceControlData,
  AttendanceDraft,
  AttendanceListItem,
  AttendancePatientHit,
  AttendanceRow,
  FORM_CODE,
  FORM_FOOTER,
  FORM_VERSION,
  MAX_ROWS,
  MIN_ROWS,
  MODALITIES,
  STATUSES,
  certificateErrors,
  emptyRow,
  fmtDate,
  fmtTime,
} from './attendance-control.models';

const SCOPE = 'attendance-control';
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const blankData = (): AttendanceControlData => ({
  clinicName: '',
  registeredAt: '',
  general: { userName: '', identification: '', professional: '', site: '' },
  rows: Array.from({ length: MIN_ROWS }, emptyRow),
  certificate: { assigned: false, attended: false, date: '', time: '', place: '', issuedAt: '', responsible: '' },
  notes: '',
});

/** Mensaje del servidor; si la respuesta llegó como Blob (descarga), se lee como JSON. */
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
  const msg = Array.isArray(b?.message) ? 'Revise los datos del formato.' : b?.message;
  if (http?.status === 403) return { message: msg || 'No tiene permiso para esta acción.' };
  return { message: msg || 'No se pudo completar la acción.', fields: b?.fields };
}

@Component({
  selector: 'app-attendance-control',
  imports: [FormsModule, RouterLink, HabIcon],
  templateUrl: './attendance-control.html',
  styleUrl: './attendance-control.scss',
})
export class AttendanceControlPage implements OnInit, OnDestroy {
  private readonly api = inject(AttendanceControlApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly unsaved = inject(UnsavedWorkService);
  private readonly appRef = inject(ApplicationRef);

  readonly code = FORM_CODE;
  readonly version = FORM_VERSION;
  readonly footer = FORM_FOOTER;
  readonly modalities = MODALITIES;
  readonly statuses = STATUSES;
  readonly maxRows = MAX_ROWS;
  readonly fmtDate = fmtDate;
  readonly fmtTime = fmtTime;

  readonly user = this.auth.user;
  readonly isPsychology = computed(() => String(this.user()?.specialty || '').toUpperCase() === 'PSYCHOLOGY');
  readonly canWrite = computed(() => ['ADMIN', 'HEALTH_PROFESSIONAL', 'RECEPTIONIST'].includes(String(this.user()?.role)));
  readonly canEditLogo = computed(() => ['ADMIN', 'HEALTH_PROFESSIONAL'].includes(String(this.user()?.role)));

  form: AttendanceControlData = blankData();
  private savedSnapshot = JSON.stringify(this.form);

  readonly docId = signal<string | null>(null);
  readonly patientId = signal<string | null>(null);
  readonly savedAt = signal<string | null>(null);
  readonly dirty = signal(false);
  readonly preview = signal(false);
  readonly busy = signal<'' | 'load' | 'save' | 'pdf' | 'logo' | 'list'>('');
  readonly message = signal('');
  readonly error = signal('');
  readonly errors = signal<Record<string, string>>({});

  readonly patientQuery = signal('');
  readonly patientHits = signal<AttendancePatientHit[]>([]);
  readonly searching = signal(false);
  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly openDialog = signal(false);
  readonly onlyThisPatient = signal(true);
  readonly savedList = signal<AttendanceListItem[]>([]);

  readonly logoVersion = signal<string | null>(null);
  readonly logoClinicId = signal<string | null>(null);
  readonly logoUrl = computed(() =>
    this.logoVersion() ? clinicLogoUrl(this.logoClinicId(), 'formatos', this.logoVersion()) : null,
  );

  private restorePreviewAfterPrint: boolean | null = null;

  ngOnInit() {
    const patientId = this.route.snapshot.queryParamMap.get('patientId');
    const docId = this.route.snapshot.queryParamMap.get('id');
    if (docId) this.loadSaved(docId);
    else if (patientId) this.loadDraft(this.api.prefill(patientId));
    else this.loadDraft(this.api.blank());
    this.api.logoStatus().subscribe({
      next: (s) => {
        this.logoClinicId.set(s.clinicId);
        this.logoVersion.set(s.updatedAt);
      },
      error: () => this.logoVersion.set(null),
    });
  }

  ngOnDestroy() {
    this.unsaved.setScopeDirty(SCOPE, false);
    clearTimeout(this.searchTimer);
  }

  /** Lo usa la guarda de la ruta antes de salir de la página. */
  canLeave(): boolean {
    return !this.dirty() || confirm('Hay cambios sin guardar en el formato. ¿Desea salir y descartarlos?');
  }

  private confirmDiscard(): boolean {
    return !this.dirty() || confirm('Hay cambios sin guardar. ¿Desea descartarlos?');
  }

  // ---------- Cambios ----------
  onChange() {
    const isDirty = JSON.stringify(this.form) !== this.savedSnapshot;
    this.dirty.set(isDirty);
    this.unsaved.setScopeDirty(SCOPE, isDirty);
    if (Object.keys(this.errors()).length) this.errors.set(this.liveErrors());
    this.message.set('');
  }

  /** Mientras haya errores visibles, se recalculan para que desaparezcan al corregir. */
  private liveErrors(): Record<string, string> {
    const current = this.errors();
    const next = { ...certificateErrors(this.form) };
    if ('general.userName' in current && !this.form.general.userName.trim()) next['general.userName'] = current['general.userName'];
    return next;
  }

  private markClean() {
    this.savedSnapshot = JSON.stringify(this.form);
    this.dirty.set(false);
    this.unsaved.setScopeDirty(SCOPE, false);
  }

  private apply(draft: AttendanceDraft, id: string | null, savedAt: string | null, clean: boolean) {
    const data = draft.data;
    this.form = {
      ...blankData(),
      ...data,
      general: { ...blankData().general, ...data.general },
      certificate: { ...blankData().certificate, ...data.certificate },
      rows: (data.rows?.length ? data.rows : Array.from({ length: MIN_ROWS }, emptyRow)).map((r) => ({ ...emptyRow(), ...r })),
    };
    this.patientId.set(draft.patientId ?? null);
    this.docId.set(id);
    this.savedAt.set(savedAt);
    this.errors.set({});
    if (clean) this.markClean();
    else {
      // Un formato nuevo diligenciado desde la agenda aún no está guardado.
      this.savedSnapshot = JSON.stringify(blankData());
      this.onChange();
    }
  }

  private loadDraft(source: Observable<AttendanceDraft>) {
    this.busy.set('load');
    this.error.set('');
    source.subscribe({
      next: (draft) => {
        this.busy.set('');
        this.apply(draft, null, null, !draft.patientId);
        if (draft.patientId) this.message.set('Formato diligenciado con los datos de la agenda y la historia del paciente. Revise y guarde.');
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
        this.busy.set('');
        this.apply({ patientId: row.patientId, data: row.data }, row.id, row.updatedAt, true);
        this.message.set(`Formato de ${row.patientName} abierto.`);
      },
      error: async (err) => {
        this.busy.set('');
        this.error.set((await describeError(err)).message);
      },
    });
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
    this.loadDraft(this.api.prefill(p.id));
    this.router.navigate([], { queryParams: { patientId: p.id }, replaceUrl: true });
  }

  // ---------- Filas ----------
  addRow() {
    if (this.form.rows.length >= MAX_ROWS) return;
    this.form.rows = [...this.form.rows, emptyRow()];
    this.onChange();
    setTimeout(() => document.getElementById(`row-date-${this.form.rows.length - 1}`)?.focus());
  }

  removeRow(i: number) {
    const row = this.form.rows[i];
    const filled = row && (row.date || row.time || row.modality || row.status || row.nextDate);
    if (filled && !confirm(`¿Eliminar la fila ${i + 1} de la programación?`)) return;
    this.form.rows = this.form.rows.filter((_, idx) => idx !== i);
    if (!this.form.rows.length) this.form.rows = [emptyRow()];
    this.onChange();
  }

  trackRow(_i: number, row: AttendanceRow) {
    return row;
  }

  // ---------- Acciones ----------
  newForm() {
    if (!this.confirmDiscard()) return;
    this.preview.set(false);
    this.message.set('');
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
    this.loadDraft(this.api.blank());
  }

  save() {
    if (!this.canWrite() || this.busy()) return;
    if (!this.form.general.userName.trim()) {
      this.errors.set({ ...this.errors(), 'general.userName': 'Escriba el nombre del usuario antes de guardar.' });
      this.focusField('general.userName');
      this.error.set('Falta el nombre del usuario.');
      return;
    }
    this.busy.set('save');
    this.error.set('');
    const body: AttendanceDraft = { patientId: this.patientId(), data: this.form };
    const id = this.docId();
    (id ? this.api.update(id, body) : this.api.create(body)).subscribe({
      next: (row) => {
        this.busy.set('');
        this.docId.set(row.id);
        this.savedAt.set(row.updatedAt);
        this.markClean();
        this.message.set('Formato guardado.');
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

  openSaved(item: AttendanceListItem) {
    if (!this.confirmDiscard()) return;
    this.openDialog.set(false);
    this.preview.set(false);
    this.router.navigate([], { queryParams: { id: item.id }, replaceUrl: true });
    this.loadSaved(item.id);
  }

  /** Valida lo necesario para emitir; muestra los errores junto a cada campo. */
  private validateForEmission(): boolean {
    const errs = certificateErrors(this.form);
    this.errors.set(errs);
    const keys = Object.keys(errs);
    if (!keys.length) return true;
    this.preview.set(false);
    this.error.set('Complete los datos marcados para emitir la constancia.');
    this.focusField(keys[0]);
    return false;
  }

  private focusField(key: string) {
    setTimeout(() => {
      const el = document.getElementById(`f-${key.replace('.', '-')}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLInputElement | null)?.focus({ preventScroll: true });
    });
  }

  print() {
    if (!this.validateForEmission()) return;
    this.error.set('');
    this.restorePreviewAfterPrint = this.preview();
    this.preview.set(true);
    setTimeout(() => window.print(), 60);
  }

  /** Ctrl+P desde el modo edición: se imprime la vista limpia, sin controles de los campos. */
  @HostListener('window:beforeprint')
  onBeforePrint() {
    if (this.preview()) return;
    this.restorePreviewAfterPrint ??= false;
    this.preview.set(true);
    this.appRef.tick();
  }

  @HostListener('window:afterprint')
  onAfterPrint() {
    if (this.restorePreviewAfterPrint === null) return;
    this.preview.set(this.restorePreviewAfterPrint);
    this.restorePreviewAfterPrint = null;
  }

  downloadPdf() {
    if (this.busy() || !this.validateForEmission()) return;
    this.busy.set('pdf');
    this.error.set('');
    this.api.pdf(this.form).subscribe({
      next: (blob) => {
        this.busy.set('');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safe = (this.form.general.userName || 'formato').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').slice(0, 60);
        a.href = url;
        a.download = `Control_citas_${safe}_${this.form.registeredAt || 'sin_fecha'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        this.message.set('PDF descargado.');
      },
      error: async (err) => {
        this.busy.set('');
        const e = await describeError(err);
        if (e.fields) this.errors.set(e.fields);
        this.error.set(e.message);
      },
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
    this.api.uploadLogo(file).subscribe({
      next: (s) => {
        this.busy.set('');
        this.logoClinicId.set(s.clinicId);
        this.logoVersion.set(s.updatedAt);
        this.message.set('Logo guardado para los formatos del consultorio.');
      },
      error: async (err) => {
        this.busy.set('');
        this.error.set((await describeError(err)).message);
      },
    });
  }

  removeLogo() {
    if (!confirm('¿Quitar el logo de los formatos del consultorio?')) return;
    this.busy.set('logo');
    this.api.removeLogo().subscribe({
      next: (s) => {
        this.busy.set('');
        this.logoVersion.set(s.updatedAt);
        this.message.set('Logo quitado.');
      },
      error: async (err) => {
        this.busy.set('');
        this.error.set((await describeError(err)).message);
      },
    });
  }

  onLogoError() {
    this.logoVersion.set(null);
  }

  // ---------- Presentación ----------
  label<T extends string>(list: Array<{ key: T; label: string }>, key: T) {
    return list.find((x) => x.key === key)?.label ?? '';
  }

  err(key: string) {
    return this.errors()[key] || '';
  }

  savedLabel() {
    const at = this.savedAt();
    if (!at) return '';
    return new Date(at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  }

  listDate(at: string) {
    return new Date(at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  }
}
