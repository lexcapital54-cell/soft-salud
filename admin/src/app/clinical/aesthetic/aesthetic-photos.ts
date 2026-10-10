import { Component, computed, inject, input, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { HabIcon } from '../../habilitation/hab-icon';
import { OrthoCompareSliderComponent } from '../dentistry/ortho-compare-slider';
import { ClinicalAttachment } from '../clinical.models';
import { newId, procedureTypeLabel } from './aesthetic.models';
import {
  AES_PHOTO_ANGLES,
  AES_PHOTO_MOMENTS,
  AesPhoto,
  AesPhotoAngle,
  AesPhotoMoment,
  todayIso,
} from './aesthetic-tracking.models';
import { AestheticTrackingService } from './aesthetic-tracking.service';

export type AesPhotoUploader = (file: File, label: string) => Observable<ClinicalAttachment> | null;

/**
 * Fotos clínicas por ángulo y momento (antes, después, control) con comparador.
 * El archivo se anexa a la atención; aquí solo se clasifica y se compara.
 */
@Component({
  selector: 'app-aesthetic-photos',
  imports: [HabIcon, OrthoCompareSliderComponent],
  styleUrls: ['./aesthetic.scss', './aesthetic-tracking.scss'],
  template: `
    @let ro = disabled() || !tracking.loaded();
    <section class="aes-block" id="aes-fotos">
      <div class="aes-head">
        <span class="aes-head-icon"><hab-icon name="image" /></span>
        <h4>Fotos antes y después</h4>
      </div>
      <p class="aes-help">
        Tome cada sesión con el mismo ángulo, luz y distancia para que la comparación sea útil. Las fotos se anexan a
        esta atención; las de un procedimiento firmado no se pueden quitar.
      </p>

      @if (!tracking.loaded()) {
        <p class="empty">{{ tracking.status() === 'error' ? tracking.message() : 'Cargando fotos…' }}</p>
      } @else {
        @if (!ro) {
          <div class="aes-grid-narrow">
            <label class="aes-field">
              Ángulo
              <select [value]="angle()" (change)="angle.set($any($event.target).value)">
                @for (a of angles; track a.key) {
                  <option [value]="a.key">{{ a.label }}</option>
                }
              </select>
            </label>
            <label class="aes-field">
              Momento
              <select [value]="moment()" (change)="moment.set($any($event.target).value)">
                @for (m of moments; track m.key) {
                  <option [value]="m.key">{{ m.label }}</option>
                }
              </select>
            </label>
            <label class="aes-field">
              Fecha de la foto
              <input type="date" [value]="date()" [max]="today" (change)="date.set($any($event.target).value)" />
            </label>
            <label class="aes-field">
              Procedimiento (opcional)
              <select [value]="procedureId()" (change)="procedureId.set($any($event.target).value)">
                <option value="">Sin asociar</option>
                @for (p of procedures(); track p.id) {
                  <option [value]="p.id">{{ p.date || 'sin fecha' }} · {{ typeLabel(p.type) }}</option>
                }
              </select>
            </label>
          </div>
          <div class="card-actions">
            <label class="btn-add" [class.busy]="uploading()">
              <hab-icon name="upload" /> {{ uploading() ? 'Subiendo…' : 'Subir fotos' }}
              <input type="file" accept="image/*" multiple hidden [disabled]="uploading()" (change)="upload($event)" />
            </label>
          </div>
        }
        @if (error()) {
          <p class="alert-line error" role="alert"><hab-icon name="alert" /> {{ error() }}</p>
        }

        @if (!photos().length) {
          <p class="empty">Aún no hay fotos clasificadas para este paciente.</p>
        } @else {
          <div class="chips" role="tablist" aria-label="Ángulo a comparar">
            @for (a of anglesWithPhotos(); track a.key) {
              <button type="button" role="tab" class="chip" [class.on]="viewAngle() === a.key"
                [attr.aria-selected]="viewAngle() === a.key" (click)="selectAngle(a.key)">
                {{ a.label }} ({{ a.count }})
              </button>
            }
          </div>

          <ul class="photo-strip">
            @for (f of anglePhotos(); track f.id) {
              <li [class.picked]="f.id === beforeId() || f.id === afterId()">
                @if (url()(f.attachmentId); as src) {
                  <img [src]="src" [alt]="caption(f)" />
                } @else {
                  <span class="photo-wait">Cargando…</span>
                }
                <span class="meta">{{ caption(f) }}</span>
                <div class="photo-actions">
                  <button type="button" class="chip" [class.on]="f.id === beforeId()" (click)="beforePick.set(f.id)">Antes</button>
                  <button type="button" class="chip" [class.on]="f.id === afterId()" (click)="afterPick.set(f.id)">Después</button>
                  @if (!ro && !f.lockedAt) {
                    <button type="button" class="chip" (click)="remove(f)" [attr.aria-label]="'Quitar foto ' + caption(f)">
                      <hab-icon name="x" />
                    </button>
                  }
                </div>
              </li>
            }
          </ul>

          @let b = byId(beforeId());
          @let a = byId(afterId());
          @if (canExport()) {
            <div class="card-actions report-actions">
              <button type="button" class="btn-add" [disabled]="!!exporting()" (click)="downloadReport(false)">
                <hab-icon name="download" /> {{ exporting() === 'all' ? 'Generando…' : 'Informe fotográfico PDF' }}
              </button>
              <button type="button" class="btn-add ghost" [disabled]="!!exporting()" (click)="downloadReport(true)">
                <hab-icon name="printer" /> {{ exporting() === 'angle' ? 'Generando…' : 'Solo ' + angleLabel() + ' con comparativo' }}
              </button>
            </div>
          }
          <app-ortho-compare-slider
            [beforeUrl]="b ? url()(b.attachmentId) : null"
            [afterUrl]="a ? url()(a.attachmentId) : null"
            [beforeLabel]="b ? caption(b) : 'Antes'"
            [afterLabel]="a ? caption(a) : 'Después'"
            emptyText="Elija una foto «Antes» y otra «Después» del mismo ángulo para compararlas."
          />
        }
      }
    </section>
  `,
  styles: `
    .photo-strip { list-style: none; margin: 12px 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .photo-strip li { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid #d7e3e6; border-radius: 12px; background: #fff; }
    .photo-strip li.picked { border-color: #173b3a; box-shadow: 0 0 0 2px rgba(23, 59, 58, 0.18); }
    .photo-strip img { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 8px; background: #0f172a; }
    .photo-wait { display: grid; place-items: center; aspect-ratio: 3 / 4; border-radius: 8px; background: #eef3f4; color: #4b5f63; font-size: 0.8rem; }
    .photo-actions { display: flex; flex-wrap: wrap; gap: 4px; }
    .photo-actions .chip { padding: 4px 10px; font-size: 0.78rem; }
    label.btn-add { cursor: pointer; }
    .report-actions { margin-top: 4px; }
    .report-actions .btn-add.ghost { background: #fff; color: #173b3a; border: 1px solid #c9d8d5; }
    label.btn-add.busy { opacity: 0.6; pointer-events: none; }
  `,
})
export class AestheticPhotos {
  readonly tracking = inject(AestheticTrackingService);
  readonly disabled = input(false);
  readonly encounterId = input('');
  /** Sube el archivo como adjunto de la atención (la historia crea la atención si hace falta). */
  readonly uploader = input<AesPhotoUploader | null>(null);
  /** URL local de la imagen (la descarga la historia una sola vez). */
  readonly url = input<(attachmentId: string) => string | null>(() => null);
  /** Solo quien puede escribir la historia genera el informe (el servidor lo valida). */
  readonly canExport = input(false);

  readonly angles = AES_PHOTO_ANGLES;
  readonly moments = AES_PHOTO_MOMENTS;
  readonly today = todayIso();

  readonly angle = signal<AesPhotoAngle>('FRONTAL');
  readonly moment = signal<AesPhotoMoment>('ANTES');
  readonly date = signal(todayIso());
  readonly procedureId = signal('');
  readonly uploading = signal(false);
  readonly exporting = signal<'all' | 'angle' | null>(null);
  readonly error = signal<string | null>(null);

  readonly viewAngle = signal<AesPhotoAngle | null>(null);
  readonly beforePick = signal<string | null>(null);
  readonly afterPick = signal<string | null>(null);

  readonly photos = computed(() => {
    this.tracking.rev();
    return [...this.tracking.data.photos].sort(
      (a, b) => a.date.localeCompare(b.date) || (a._audit?.createdAt || '').localeCompare(b._audit?.createdAt || ''),
    );
  });

  readonly procedures = computed(() => {
    this.tracking.rev();
    return [...this.tracking.data.procedures].sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly anglesWithPhotos = computed(() =>
    AES_PHOTO_ANGLES.map((a) => ({ ...a, count: this.photos().filter((f) => f.angle === a.key).length })).filter(
      (a) => a.count,
    ),
  );

  readonly currentAngle = computed(() => {
    const chosen = this.viewAngle();
    const available = this.anglesWithPhotos();
    return available.some((a) => a.key === chosen) ? chosen : (available[0]?.key ?? null);
  });

  readonly anglePhotos = computed(() => this.photos().filter((f) => f.angle === this.currentAngle()));

  /** Por defecto: la primera foto «Antes» del ángulo contra la más reciente. */
  readonly beforeId = computed(() => {
    const list = this.anglePhotos();
    const picked = this.beforePick();
    if (picked && list.some((f) => f.id === picked)) return picked;
    return (list.find((f) => f.moment === 'ANTES') ?? list[0])?.id ?? null;
  });

  readonly afterId = computed(() => {
    const list = this.anglePhotos();
    const picked = this.afterPick();
    if (picked && list.some((f) => f.id === picked)) return picked;
    const last = list[list.length - 1];
    return last && last.id !== this.beforeId() ? last.id : null;
  });

  typeLabel(key: string) {
    return key ? procedureTypeLabel(key) : 'Procedimiento sin tipo';
  }

  byId(id: string | null) {
    return id ? this.photos().find((f) => f.id === id) : undefined;
  }

  caption(f: AesPhoto) {
    const moment = AES_PHOTO_MOMENTS.find((m) => m.key === f.moment)?.label ?? '';
    const date = f.date ? new Date(`${f.date}T12:00:00`).toLocaleDateString('es-CO') : 'sin fecha';
    return `${moment} · ${date}`;
  }

  angleLabel() {
    return AES_PHOTO_ANGLES.find((a) => a.key === this.currentAngle())?.label ?? '';
  }

  downloadReport(onlyAngle: boolean) {
    const angle = this.currentAngle();
    const query = onlyAngle && angle
      ? { angle, before: this.beforeId() || '', after: this.afterId() || '' }
      : {};
    this.exporting.set(onlyAngle ? 'angle' : 'all');
    this.error.set(null);
    this.tracking.photoReport(query).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Informe_fotografico.pdf';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.exporting.set(null);
      },
      error: async (err) => {
        let msg = '';
        try {
          msg = JSON.parse(await (err?.error as Blob).text())?.message || '';
        } catch {
          msg = '';
        }
        this.error.set(msg || 'No se pudo generar el informe fotográfico.');
        this.exporting.set(null);
      },
    });
  }

  selectAngle(key: AesPhotoAngle) {
    this.viewAngle.set(key);
    this.beforePick.set(null);
    this.afterPick.set(null);
  }

  upload(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    const uploader = this.uploader();
    if (!uploader || !files.length) return;
    this.error.set(null);
    const angle = this.angle();
    const moment = this.moment();
    const date = this.date() || todayIso();
    const procedureId = this.procedureId();
    const angleLabel = AES_PHOTO_ANGLES.find((a) => a.key === angle)?.label ?? angle;
    const momentLabel = AES_PHOTO_MOMENTS.find((m) => m.key === moment)?.label ?? moment;
    let pending = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        this.error.set('Suba las fotos como imagen (JPG o PNG).');
        continue;
      }
      const req = uploader(file, `Foto estética — ${angleLabel} · ${momentLabel} (${date})`);
      if (!req) continue;
      pending += 1;
      this.uploading.set(true);
      req.subscribe({
        next: (att) => {
          this.tracking.data.photos = [
            ...this.tracking.data.photos,
            {
              id: newId(),
              attachmentId: att.id,
              encounterId: att.encounterId || this.encounterId(),
              angle,
              moment,
              date,
              procedureId,
              note: '',
            },
          ];
          this.selectAngle(angle);
          void this.tracking.commit();
          if (--pending === 0) this.uploading.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.message || `No se pudo subir ${file.name}.`);
          if (--pending === 0) this.uploading.set(false);
        },
      });
    }
  }

  remove(f: AesPhoto) {
    if (f.lockedAt) return;
    if (!confirm('¿Quitar la foto del comparador? El archivo sigue anexo a la atención en que se subió.')) return;
    this.tracking.data.photos = this.tracking.data.photos.filter((x) => x.id !== f.id);
    void this.tracking.commit();
  }
}
