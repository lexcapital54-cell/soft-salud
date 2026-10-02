import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { API } from '../api.config';
import { AuthService } from '../auth.service';
import { ClinicLogoSlot, clinicLogoUrl } from '../clinic-logo';

type LogoStatus = Record<ClinicLogoSlot, string | null>;

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg'];

type Slot = {
  id: ClinicLogoSlot;
  title: string;
  help: string;
};

/** Logo propio del consultorio (panel de inicio e historia clínica). Solo el administrador lo cambia. */
@Component({
  selector: 'app-clinic-logo-settings',
  templateUrl: './clinic-logo-settings.html',
  styleUrl: './clinic-logo-settings.scss',
})
export class ClinicLogoSettings implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly slots: Slot[] = [
    {
      id: 'home',
      title: 'Logo del panel de inicio',
      help: 'Aparece arriba del tablero del consultorio.',
    },
    {
      id: 'hc',
      title: 'Logo de la historia clínica',
      help: 'Aparece centrado en la historia y en el membrete del PDF. Si lo deja vacío, se usa el del panel de inicio.',
    },
  ];

  readonly clinicId = computed(() => this.auth.user()?.clinicId ?? null);
  readonly status = signal<LogoStatus>({ home: null, hc: null });
  readonly pending = signal<Partial<Record<ClinicLogoSlot, { file: File; preview: string }>>>({});
  readonly busy = signal<ClinicLogoSlot | null>(null);
  readonly message = signal('');
  readonly error = signal('');

  constructor() {
    effect(() => {
      if (this.clinicId()) this.load();
    });
  }

  ngOnDestroy() {
    for (const p of Object.values(this.pending())) if (p) URL.revokeObjectURL(p.preview);
  }

  currentUrl(slot: ClinicLogoSlot): string | null {
    const at = this.status()[slot];
    return at ? clinicLogoUrl(this.clinicId(), slot, at) : null;
  }

  onPick(slot: ClinicLogoSlot, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.message.set('');
    this.error.set('');
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      this.error.set('Use una imagen PNG o JPG (el PDF de la historia no admite otros formatos).');
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error.set('El logo no puede pesar más de 2 MB.');
      return;
    }
    this.discard(slot);
    this.pending.update((p) => ({ ...p, [slot]: { file, preview: URL.createObjectURL(file) } }));
  }

  discard(slot: ClinicLogoSlot) {
    const prev = this.pending()[slot];
    if (prev) URL.revokeObjectURL(prev.preview);
    this.pending.update((p) => ({ ...p, [slot]: undefined }));
  }

  save(slot: ClinicLogoSlot) {
    const item = this.pending()[slot];
    if (!item) return;
    const body = new FormData();
    body.append('file', item.file);
    this.run(slot, this.http.post<LogoStatus>(`${API}/me/clinic-logos/${slot}`, body), 'Logo guardado.');
  }

  remove(slot: ClinicLogoSlot) {
    if (!confirm('¿Quitar este logo del consultorio?')) return;
    this.run(slot, this.http.delete<LogoStatus>(`${API}/me/clinic-logos/${slot}`), 'Logo quitado.');
  }

  private run(slot: ClinicLogoSlot, req: Observable<LogoStatus>, ok: string) {
    this.busy.set(slot);
    this.message.set('');
    this.error.set('');
    req.subscribe({
      next: (status) => {
        this.status.set(status);
        this.discard(slot);
        this.busy.set(null);
        this.message.set(`${ok} Recargue la historia clínica o el panel para verlo.`);
      },
      error: (err) => {
        this.busy.set(null);
        this.error.set(err?.error?.message || 'No se pudo guardar el logo.');
      },
    });
  }

  private load() {
    this.http.get<LogoStatus>(`${API}/me/clinic-logos`).subscribe({
      next: (status) => this.status.set(status),
      error: () => undefined,
    });
  }
}
