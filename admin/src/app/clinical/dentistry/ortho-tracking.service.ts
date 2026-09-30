import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { API } from '../../api.config';
import { DentistryContent } from './dentistry.models';
import { normalizeOrthoMech } from './ortho-mech.data';
import { normalizeOrthoFollow } from './ortho-follow.data';
import { normalizeOrthoBudget } from './ortho-budget.data';

type TrackingData = Pick<DentistryContent, 'orthoMech' | 'orthoFollow' | 'orthoBudget'>;

interface TrackingResponse {
  data: Partial<Record<keyof TrackingData, unknown>>;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
}

export type TrackingStatus = 'idle' | 'loading' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

const DEBOUNCE_MS = 1200;

/**
 * Seguimiento de ortodoncia por paciente (aparatología, controles, retención, presupuesto).
 * Vive fuera de la historia: la historia firmada queda como fotografía y esto sigue editable.
 */
@Injectable()
export class OrthoTrackingService {
  private readonly http = inject(HttpClient);

  readonly status = signal<TrackingStatus>('idle');
  readonly savedAt = signal<string | null>(null);
  readonly savedBy = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  private patientId: string | null = null;
  private version: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: TrackingData | null = null;
  private inFlight = false;

  /** Carga el seguimiento y lo superpone sobre el bloque odontológico en memoria. */
  load(patientId: string, dental: () => DentistryContent, onApplied?: () => void) {
    this.flush();
    this.patientId = patientId;
    this.version = null;
    this.savedAt.set(null);
    this.savedBy.set(null);
    this.message.set(null);
    this.status.set('loading');
    this.http.get<TrackingResponse | null>(`${API}/patients/${patientId}/ortho-tracking`).subscribe({
      next: (res) => {
        if (this.patientId !== patientId) return;
        if (res) {
          const d = dental();
          if (res.data.orthoMech) d.orthoMech = normalizeOrthoMech(res.data.orthoMech);
          if (res.data.orthoFollow) d.orthoFollow = normalizeOrthoFollow(res.data.orthoFollow);
          if (res.data.orthoBudget) d.orthoBudget = normalizeOrthoBudget(res.data.orthoBudget);
          this.accept(res);
          onApplied?.();
        } else {
          this.status.set('idle');
        }
      },
      error: () => {
        if (this.patientId !== patientId) return;
        this.status.set('idle');
      },
    });
  }

  queue(dental: DentistryContent) {
    if (!this.patientId || this.status() === 'conflict') return;
    this.pending = {
      orthoMech: dental.orthoMech,
      orthoFollow: dental.orthoFollow,
      orthoBudget: dental.orthoBudget,
    };
    this.status.set('pending');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.send(), DEBOUNCE_MS);
  }

  /** Envía lo pendiente de inmediato (cambio de paciente o salida). */
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.send();
    }
  }

  private send() {
    this.timer = null;
    if (!this.patientId || !this.pending || this.inFlight) return;
    const patientId = this.patientId;
    const data = JSON.parse(JSON.stringify(this.pending)) as TrackingData;
    this.pending = null;
    this.inFlight = true;
    this.status.set('saving');
    this.http
      .put<TrackingResponse>(`${API}/patients/${patientId}/ortho-tracking`, {
        data,
        ...(this.version ? { version: this.version } : {}),
      })
      .subscribe({
        next: (res) => {
          this.inFlight = false;
          if (this.patientId !== patientId) return;
          this.accept(res);
          if (this.pending) this.send();
        },
        error: (err: HttpErrorResponse) => {
          this.inFlight = false;
          if (this.patientId !== patientId) return;
          const text = typeof err.error?.message === 'string' ? err.error.message : null;
          if (err.status === 409) {
            this.status.set('conflict');
            this.message.set(text || 'Otro usuario actualizó el seguimiento. Recargue la historia.');
            return;
          }
          this.pending = this.pending ?? data;
          this.status.set('error');
          this.message.set(text || 'No se pudo guardar el seguimiento. Se reintentará con el próximo cambio.');
        },
      });
  }

  private accept(res: TrackingResponse) {
    this.version = res.version;
    this.savedAt.set(res.updatedAt);
    this.savedBy.set(res.updatedByName);
    this.message.set(null);
    this.status.set('saved');
  }
}
