import { Injectable, inject, signal } from '@angular/core';
import {
  Observable,
  Subject,
  TimeoutError,
  concatMap,
  debounceTime,
  filter,
  firstValueFrom,
  from,
  merge,
  tap,
  timeout,
} from 'rxjs';
import { ClinicalApiService } from './clinical-api.service';
import { Encounter } from './clinical.models';
export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export type AutosavePayloadFactory = () => {
  encounterId: string;
  body: Parameters<ClinicalApiService['saveDraft']>[1];
} | null;

/** Espera tras la última tecla antes de llamar a la API. */
export const AUTOSAVE_DEBOUNCE_MS = 2000;
/** Una petición colgada no puede bloquear la cola de guardados. */
export const AUTOSAVE_TIMEOUT_MS = 20000;
/** Espera antes de reintentar solo tras un fallo de red o del servidor. */
const AUTOSAVE_RETRY_MS = 15000;

/**
 * Autoguardado con debounce para borradores HCE y ficha del paciente.
 * No reemplaza "Guardar borrador" manual ni el sellado final.
 *
 * Todas las subidas (debounce, cambio de pestaña, reintento) pasan por una
 * sola cola en serie: nunca llegan dos borradores en desorden al servidor.
 */
@Injectable()
export class ClinicalAutosaveService {
  private readonly api = inject(ClinicalApiService);

  readonly status = signal<AutosaveStatus>('idle');
  /** Último guardado clínico (borrador HCE) en servidor. */
  readonly lastClinicalSavedAt = signal<Date | null>(null);
  /** Último guardado de ficha/demografía del paciente. */
  readonly lastPatientSavedAt = signal<Date | null>(null);
  readonly lastError = signal<string | null>(null);

  private readonly errorsSubject = new Subject<string>();
  /** Emite cada fallo de guardado (para el toast de la vista). */
  readonly errors$ = this.errorsSubject.asObservable();

  private readonly clinicalTrigger$ = new Subject<void>();
  private readonly clinicalFlush$ = new Subject<void>();
  private readonly patientTrigger$ = new Subject<void>();
  private factory: AutosavePayloadFactory | null = null;
  private isEnabled: (() => boolean) | null = null;
  private persistPatient: (() => Observable<unknown>) | null = null;
  private onSaved: ((enc: Encounter) => void) | null = null;
  private onLocalBackup: (() => void) | null = null;
  private onDirtyChange: ((dirty: boolean) => void) | null = null;
  /** Sube con cada edición; si cambió durante la petición, el guardado no queda "limpio". */
  private revision = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    merge(
      this.clinicalTrigger$.pipe(debounceTime(AUTOSAVE_DEBOUNCE_MS)),
      this.clinicalFlush$,
    )
      .pipe(
        filter(() => !!this.isEnabled?.() && !!this.factory),
        concatMap(() => from(this.saveClinicalDraft())),
      )
      .subscribe();

    this.patientTrigger$
      .pipe(
        tap(() => {
          this.status.set('pending');
          this.onDirtyChange?.(true);
        }),
        debounceTime(AUTOSAVE_DEBOUNCE_MS),
        filter(() => !!this.persistPatient),
        concatMap(() => from(this.savePatientOnly())),
      )
      .subscribe();
  }

  bind(
    factory: AutosavePayloadFactory,
    isEnabled: () => boolean,
    options?: {
      onSaved?: (enc: Encounter) => void;
      persistPatient?: () => Observable<unknown>;
      onLocalBackup?: () => void;
      onDirtyChange?: (dirty: boolean) => void;
    },
  ) {
    this.factory = factory;
    this.isEnabled = isEnabled;
    this.onSaved = options?.onSaved ?? null;
    this.persistPatient = options?.persistPatient ?? null;
    this.onLocalBackup = options?.onLocalBackup ?? null;
    this.onDirtyChange = options?.onDirtyChange ?? null;
    if (!isEnabled()) this.status.set('idle');
  }

  unbind() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.factory = null;
    this.isEnabled = null;
    this.onSaved = null;
    this.persistPatient = null;
    this.onLocalBackup = null;
    this.onDirtyChange = null;
    this.status.set('idle');
  }

  /** Revisión actual de edición (para saber si hubo cambios durante un guardado manual). */
  currentRevision() {
    return this.revision;
  }

  notifyChange() {
    this.revision++;
    if (!this.isEnabled?.()) return;
    this.status.set('pending');
    this.onDirtyChange?.(true);
    this.clinicalTrigger$.next();
  }

  /** Solo demografía del paciente (profesión, ocupación, etc.). */
  notifyPatientChange() {
    if (!this.persistPatient) return;
    this.patientTrigger$.next();
  }

  /** Fuerza copia local inmediata (p. ej. al ocultar/recargar la pestaña). */
  flushLocalBackup() {
    this.safely(() => this.onLocalBackup?.());
  }

  /**
   * Sube el borrador al servidor de inmediato (sin esperar el debounce).
   * Sirve al cambiar de pestaña: otra HC abierta no debe impedir persistir esta.
   */
  flushToServerNow() {
    if (!this.isEnabled?.() || !this.factory) return;
    this.flushLocalBackup();
    this.clinicalFlush$.next();
  }

  /** Tras guardado manual del borrador. */
  markManualSave() {
    this.status.set('saved');
    this.lastClinicalSavedAt.set(new Date());
    this.lastPatientSavedAt.set(new Date());
    this.lastError.set(null);
    this.onDirtyChange?.(false);
  }

  /** Reintenta subir al servidor tras error de red o caída temporal. */
  retryPendingSave() {
    if (!this.isEnabled?.()) return;
    const s = this.status();
    if (s === 'error' || s === 'pending') {
      this.flushToServerNow();
    }
  }

  hasUnsavedWork() {
    const s = this.status();
    return s === 'pending' || s === 'saving' || s === 'error';
  }

  statusLabel(): string {
    switch (this.status()) {
      case 'pending':
        return 'Cambios sin guardar…';
      case 'saving':
        return 'Autoguardando borrador…';
      case 'saved': {
        const clinical = this.lastClinicalSavedAt();
        const patient = this.lastPatientSavedAt();
        if (clinical && patient) {
          return `Borrador y ficha guardados ${this.formatTime(clinical)}`;
        }
        if (clinical) {
          return `Borrador clínico guardado ${this.formatTime(clinical)}`;
        }
        if (patient) {
          return `Ficha del paciente guardada ${this.formatTime(patient)}`;
        }
        return 'Autoguardado';
      }
      case 'error':
        return (
          (this.lastError() || 'Error al autoguardar') +
          ' · copia guardada en este navegador'
        );
      default:
        return '';
    }
  }

  /**
   * Nunca rechaza: cualquier fallo (payload, red, timeout) queda en `status`
   * y en `errors$`, así la cola sigue viva para el próximo cambio.
   */
  private async saveClinicalDraft(): Promise<Encounter | null> {
    const revisionAtStart = this.revision;
    try {
      const payload = this.factory?.();
      if (!payload) return null;
      this.status.set('saving');
      this.lastError.set(null);
      this.flushLocalBackup();

      // El borrador clínico no debe depender de que la ficha del paciente guarde bien.
      const patientSave = this.persistPatient
        ? firstValueFrom(this.persistPatient().pipe(timeout(AUTOSAVE_TIMEOUT_MS))).catch(
            (err) => {
              this.lastError.set(
                this.describeError(
                  err,
                  'La ficha del paciente no se actualizó; el borrador clínico sí se guardó.',
                ),
              );
              return null;
            },
          )
        : Promise.resolve(null);

      const saved = await firstValueFrom(
        this.api
          .saveDraft(payload.encounterId, { ...payload.body, autosave: true })
          .pipe(timeout(AUTOSAVE_TIMEOUT_MS)),
      );
      await patientSave;

      if (this.revision !== revisionAtStart) {
        this.status.set('pending');
        return saved;
      }
      this.status.set('saved');
      this.lastClinicalSavedAt.set(new Date());
      this.onDirtyChange?.(false);
      this.safely(() => this.onSaved?.(saved));
      return saved;
    } catch (err) {
      this.fail(this.describeError(err, 'No se pudo autoguardar el borrador clínico.'));
      if (this.isTransient(err)) this.scheduleRetry();
      return null;
    }
  }

  private async savePatientOnly(): Promise<void> {
    try {
      this.status.set('saving');
      this.lastError.set(null);
      await firstValueFrom(this.persistPatient!().pipe(timeout(AUTOSAVE_TIMEOUT_MS)));
      this.lastPatientSavedAt.set(new Date());
      if (this.status() === 'saving') {
        this.status.set('saved');
        this.onDirtyChange?.(false);
      }
    } catch (err) {
      this.fail(this.describeError(err, 'No se pudo guardar la ficha del paciente.'));
    }
  }

  private fail(message: string) {
    this.status.set('error');
    this.lastError.set(message);
    this.onDirtyChange?.(true);
    this.flushLocalBackup();
    this.errorsSubject.next(message);
  }

  private describeError(err: unknown, fallback: string): string {
    if (err instanceof TimeoutError) {
      return 'El servidor tardó demasiado en responder.';
    }
    const http = err as { status?: number; error?: { message?: string | string[] } };
    switch (http?.status) {
      case 0:
        return 'Sin conexión con el servidor.';
      case 401:
        return 'Su sesión expiró. Inicie sesión de nuevo para seguir guardando.';
      case 413:
        return 'La historia es demasiado pesada para guardarse. Reduzca imágenes o textos pegados.';
      case 502:
      case 503:
      case 504:
        return 'El servidor no está disponible en este momento.';
    }
    const msg = http?.error?.message;
    const text = Array.isArray(msg) ? msg.join(' ') : msg;
    // Los mensajes técnicos del servidor (en inglés) no le sirven al profesional.
    if (!text || (/^[\x00-\x7F]*$/.test(text) && /entity|internal server|bad request|forbidden/i.test(text))) {
      return fallback;
    }
    return text;
  }

  /** Fallos pasajeros (red, tiempo de espera, servidor caído) se reintentan solos. */
  private isTransient(err: unknown) {
    if (err instanceof TimeoutError) return true;
    const status = (err as { status?: number })?.status;
    return status === 0 || (typeof status === 'number' && status >= 500);
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryPendingSave();
    }, AUTOSAVE_RETRY_MS);
  }

  private safely(fn: () => void) {
    try {
      fn();
    } catch (err) {
      console.error('[autosave]', err);
    }
  }

  private formatTime(d: Date): string {
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }
}
