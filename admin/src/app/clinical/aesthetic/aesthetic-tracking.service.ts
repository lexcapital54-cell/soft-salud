import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API } from '../../api.config';
import { AesTrackingData, emptyTrackingData, normalizeTracking } from './aesthetic-tracking.models';

interface TrackingResponse {
  data: unknown;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
}

export type AesTrackingStatus = 'idle' | 'loading' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

const DEBOUNCE_MS = 1200;

/**
 * Mapa facial y procedimientos estéticos del paciente. Vive fuera de la historia:
 * la historia firmada queda como fotografía y esto sigue creciendo por sesiones.
 */
@Injectable()
export class AestheticTrackingService {
  private readonly http = inject(HttpClient);

  readonly status = signal<AesTrackingStatus>('idle');
  readonly savedAt = signal<string | null>(null);
  readonly savedBy = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  /** Sube con cada cambio para que las vistas recalculen. */
  readonly rev = signal(0);
  readonly loaded = signal(false);

  data: AesTrackingData = emptyTrackingData();

  private patientId: string | null = null;
  private version: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private chain: Promise<boolean> = Promise.resolve(true);

  load(patientId: string) {
    this.flush();
    this.patientId = patientId;
    this.version = null;
    this.data = emptyTrackingData();
    this.dirty = false;
    this.loaded.set(false);
    this.savedAt.set(null);
    this.savedBy.set(null);
    this.message.set(null);
    this.status.set('loading');
    this.rev.update((v) => v + 1);
    this.http.get<TrackingResponse | null>(`${API}/patients/${patientId}/aesthetic-tracking`).subscribe({
      next: (res) => {
        if (this.patientId !== patientId) return;
        if (res) {
          this.data = normalizeTracking(res.data);
          this.accept(res, false);
        } else {
          this.status.set('idle');
        }
        this.loaded.set(true);
        this.rev.update((v) => v + 1);
      },
      error: () => {
        if (this.patientId !== patientId) return;
        this.status.set('error');
        this.message.set('No se pudo cargar el mapa facial y los procedimientos. Recargue la historia.');
      },
    });
  }

  /** Informe fotográfico en PDF del paciente cargado (todas las fotos o un ángulo, con comparativo opcional). */
  photoReport(query: { angle?: string; before?: string; after?: string }) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(query)) if (v) params = params.set(k, v);
    return this.http.get(`${API}/patients/${this.patientId}/aesthetic-tracking/photo-report`, { params, responseType: 'blob' });
  }

  /** Cambio de borrador: se guarda con espera corta. */
  touch() {
    this.rev.update((v) => v + 1);
    if (!this.patientId || !this.loaded() || this.status() === 'conflict') return;
    this.dirty = true;
    this.status.set('pending');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.enqueue(), DEBOUNCE_MS);
  }

  /** Firma, cierre o adenda: se guarda ya y devuelve si el servidor lo aceptó. */
  commit(): Promise<boolean> {
    this.rev.update((v) => v + 1);
    if (!this.patientId || !this.loaded() || this.status() === 'conflict') return Promise.resolve(false);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.dirty = true;
    return this.enqueue();
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      void this.enqueue();
    }
  }

  private enqueue(): Promise<boolean> {
    this.timer = null;
    this.chain = this.chain.then(() => this.send());
    return this.chain;
  }

  private async send(): Promise<boolean> {
    if (!this.patientId || !this.dirty) return true;
    const patientId = this.patientId;
    const payload = JSON.parse(JSON.stringify(this.data)) as AesTrackingData;
    this.dirty = false;
    this.status.set('saving');
    try {
      const res = await firstValueFrom(
        this.http.put<TrackingResponse>(`${API}/patients/${patientId}/aesthetic-tracking`, {
          data: payload,
          ...(this.version ? { version: this.version } : {}),
        }),
      );
      if (this.patientId !== patientId) return true;
      this.accept(res, true);
      if (this.dirty) this.status.set('pending');
      return true;
    } catch (e) {
      if (this.patientId !== patientId) return false;
      const err = e as HttpErrorResponse;
      const text = typeof err.error?.message === 'string' ? err.error.message : null;
      if (err.status === 409) {
        this.status.set('conflict');
        this.message.set(text || 'Otro usuario actualizó el seguimiento. Recargue la historia.');
        return false;
      }
      this.dirty = true;
      this.status.set('error');
      this.message.set(text || 'No se pudo guardar. Se reintentará con el próximo cambio.');
      return false;
    }
  }

  /**
   * Toma del servidor lo que solo él escribe (firmas, cierres, adendas, auditoría)
   * sin pisar lo que el usuario siga escribiendo en borradores.
   */
  private accept(res: TrackingResponse, merge: boolean) {
    this.version = res.version;
    this.savedAt.set(res.updatedAt);
    this.savedBy.set(res.updatedByName);
    this.message.set(null);
    this.status.set('saved');
    if (!merge) return;
    const server = normalizeTracking(res.data);
    const procs = new Map(server.procedures.map((p) => [p.id, p]));
    this.data.procedures = this.data.procedures.map((local) => {
      const s = procs.get(local.id);
      if (!s) return local;
      if (s.status === 'FIRMADO') return s;
      local._audit = s._audit;
      return local;
    });
    const anns = new Map(server.annotations.map((a) => [a.id, a]));
    this.data.annotations = this.data.annotations.map((local) => {
      const s = anns.get(local.id);
      if (!s) return local;
      if (s.lockedAt) return s;
      local._audit = s._audit;
      return local;
    });
    const photos = new Map(server.photos.map((f) => [f.id, f]));
    this.data.photos = this.data.photos.map((local) => {
      const s = photos.get(local.id);
      if (!s) return local;
      if (s.lockedAt) return s;
      local._audit = s._audit;
      return local;
    });
    this.rev.update((v) => v + 1);
  }
}
