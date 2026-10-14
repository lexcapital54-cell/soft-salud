import { Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
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
        <p class="empty">{{ tracking.status() === 'error' ? tracking.message() : tracking.status() === 'idle' ? 'Seleccione o cree el paciente para agregar fotos.' : 'Cargando fotos…' }}</p>
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
        }
        <div class="shot-grid" role="group" [attr.aria-label]="'Fotos ' + captureAngleLabel()">
          @for (m of moments; track m.key) {
            @let last = lastShot()[m.key];
            <div class="shot-box">
              <p class="shot-title">{{ m.label }} <span>· {{ captureAngleLabel() }}</span></p>
              <div class="shot-frame">
                @if (last && url()(last.attachmentId); as src) {
                  <img [src]="src" [alt]="'Foto ' + m.label + ' ' + captureAngleLabel()" />
                } @else if (last) {
                  <span class="shot-empty">Cargando…</span>
                } @else {
                  <span class="shot-empty">Sin foto</span>
                }
              </div>
              @if (last) {
                <p class="shot-date">{{ caption(last) }}</p>
              }
              @if (!ro) {
                <div class="shot-buttons">
                  <button type="button" class="photo-btn primary" [disabled]="uploading() || cameraBusy()" (click)="openCamera(m.key)">
                    <hab-icon name="camera" [size]="16" /> Tomar foto
                  </button>
                  <label class="photo-btn" [class.disabled]="uploading()">
                    <hab-icon name="image" [size]="16" /> Galería
                    <input type="file" accept="image/*" multiple hidden [disabled]="uploading()" (change)="upload($event, m.key)" />
                  </label>
                </div>
              }
            </div>
          }
        </div>
        @if (uploading()) {
          <p class="aes-help" role="status">Guardando foto…</p>
        }

        @if (cameraOpen()) {
          <div class="cam-modal" role="dialog" aria-modal="true" aria-labelledby="aes-cam-title" (keydown.escape)="closeCamera()">
            <div class="cam-dialog">
              <h4 id="aes-cam-title">Foto {{ momentLabel(moment()) }} · {{ captureAngleLabel() }}</h4>
              <p class="aes-help">
                {{ shot() ? 'Revise la foto antes de guardarla.' : 'Mantenga la misma luz y distancia de las otras sesiones y pulse Capturar.' }}
              </p>
              <div class="cam-video-wrap">
                <video #camVideo autoplay playsinline muted [hidden]="!!shot()"></video>
                @if (shot(); as s) {
                  <img [src]="s.url" alt="Foto capturada" />
                } @else if (angle() !== 'DETALLE' && !cameraBusy()) {
                  <span class="cam-guide" aria-hidden="true"></span>
                }
                @if (cameraBusy()) {
                  <p class="cam-wait">Abriendo cámara…</p>
                }
              </div>
              <div class="cam-actions">
                <button type="button" class="photo-btn" (click)="closeCamera()">Cancelar</button>
                @if (shot()) {
                  <button type="button" class="photo-btn" (click)="retake()">Repetir</button>
                  <button type="button" class="photo-btn primary" (click)="useShot()">Usar foto</button>
                } @else {
                  @if (canSwitch()) {
                    <button type="button" class="photo-btn" [disabled]="cameraBusy()" (click)="switchCamera()">Cambiar cámara</button>
                  }
                  <button type="button" class="photo-btn primary" [disabled]="cameraBusy()" (click)="capture()">Capturar</button>
                }
              </div>
            </div>
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
    .photo-strip li { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid #dbe2ec; border-radius: 12px; background: #fff; }
    .photo-strip li.picked { border-color: #0f2747; box-shadow: 0 0 0 2px rgba(15, 39, 71, 0.18); }
    .photo-strip img { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 8px; background: #0f172a; }
    .photo-wait { display: grid; place-items: center; aspect-ratio: 3 / 4; border-radius: 8px; background: #eef2f8; color: #4b5b74; font-size: 0.8rem; }
    .photo-actions { display: flex; flex-wrap: wrap; gap: 4px; }
    .photo-actions .chip { padding: 4px 10px; font-size: 0.78rem; }
    label.btn-add { cursor: pointer; }
    .report-actions { margin-top: 4px; }
    .report-actions .btn-add.ghost { background: #fff; color: #0f2747; border: 1px solid #d5dce8; }
    label.btn-add.busy { opacity: 0.6; pointer-events: none; }
    .shot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 12px 0; }
    .shot-box { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px; border: 1px solid #dbe2ec; border-radius: 16px; background: #f8fafc; }
    .shot-title { margin: 0; align-self: stretch; font-weight: 700; color: #0f2747; }
    .shot-title span { font-weight: 500; color: #4b5b74; }
    .shot-frame { width: 100%; max-width: 220px; aspect-ratio: 3 / 4; border: 1px dashed #8a6d3b; border-radius: 16px; background: #fff; overflow: hidden; display: grid; place-items: center; }
    .shot-frame img { width: 100%; height: 100%; object-fit: cover; }
    .shot-empty { color: #5b6b82; font-size: 0.9rem; }
    .shot-date { margin: 0; font-size: 0.8rem; color: #4b5b74; }
    .shot-buttons { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
    .photo-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 8px 14px; border-radius: 999px; border: 1px solid #0f2747; background: #fff; color: #0f2747; font: inherit; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
    .photo-btn.primary { background: #0f2747; color: #fff; }
    .photo-btn:disabled, .photo-btn.disabled { opacity: 0.55; cursor: not-allowed; pointer-events: none; }
    .photo-btn:focus-visible { outline: 3px solid #8a6d3b; outline-offset: 2px; }
    .cam-modal { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: rgba(15, 23, 42, 0.72); }
    .cam-dialog { width: min(720px, 100%); max-height: 100%; overflow: auto; padding: 16px; border-radius: 18px; background: #fff; }
    .cam-dialog h4 { margin: 0 0 4px; color: #0f2747; }
    .cam-video-wrap { position: relative; margin: 10px 0; border-radius: 14px; overflow: hidden; background: #0f172a; aspect-ratio: 4 / 3; }
    .cam-video-wrap video, .cam-video-wrap img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .cam-guide { position: absolute; left: 50%; top: 50%; width: 46%; height: 78%; transform: translate(-50%, -50%); border: 2px dashed rgba(255, 255, 255, 0.75); border-radius: 50%; pointer-events: none; }
    .cam-wait { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: #fff; }
    .cam-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
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

  readonly cameraOpen = signal(false);
  readonly cameraBusy = signal(false);
  readonly canSwitch = signal(false);
  readonly shot = signal<{ file: File; url: string } | null>(null);
  readonly camVideo = viewChild<ElementRef<HTMLVideoElement>>('camVideo');
  private stream: MediaStream | null = null;
  /** Quien fotografía a la paciente usa la cámara trasera en celular o tableta. */
  private facing: 'environment' | 'user' = 'environment';

  /** Última foto de cada momento para el ángulo elegido arriba. */
  readonly lastShot = computed(() => {
    const out: Partial<Record<AesPhotoMoment, AesPhoto>> = {};
    for (const f of this.photos()) if (f.angle === this.angle()) out[f.moment] = f;
    return out;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.closeCamera());
  }

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

  captureAngleLabel() {
    return AES_PHOTO_ANGLES.find((a) => a.key === this.angle())?.label ?? '';
  }

  momentLabel(key: AesPhotoMoment) {
    return (AES_PHOTO_MOMENTS.find((m) => m.key === key)?.label ?? '').toLowerCase();
  }

  /** Cámara en vivo como en los datos del paciente; la imagen no se espeja para no invertir los lados. */
  async openCamera(moment: AesPhotoMoment) {
    if (this.uploading()) return;
    this.error.set(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set('Este navegador no permite cámara en vivo. Use «Galería» o abra la historia en Chrome o Safari.');
      return;
    }
    this.moment.set(moment);
    this.discardShot();
    this.cameraOpen.set(true);
    await this.startStream();
  }

  private async startStream() {
    this.stopStream();
    this.cameraBusy.set(true);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: this.facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      });
      if (!this.cameraOpen()) {
        this.stopStream();
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      this.canSwitch.set(devices.filter((d) => d.kind === 'videoinput').length > 1);
      setTimeout(() => {
        const video = this.camVideo()?.nativeElement;
        if (!video || !this.stream) return;
        video.srcObject = this.stream;
        void video.play().catch(() => undefined);
        this.cameraBusy.set(false);
      }, 50);
    } catch {
      this.cameraBusy.set(false);
      this.cameraOpen.set(false);
      this.error.set('No se pudo acceder a la cámara. Permita el acceso en el navegador o use «Galería».');
    }
  }

  switchCamera() {
    this.facing = this.facing === 'environment' ? 'user' : 'environment';
    void this.startStream();
  }

  capture() {
    const video = this.camVideo()?.nativeElement;
    if (!video || !video.videoWidth) {
      this.error.set('Espere a que la cámara esté lista e intente de nuevo.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          this.error.set('No se pudo capturar la imagen.');
          return;
        }
        const file = new File([blob], `estetica-${this.angle().toLowerCase()}-${this.moment().toLowerCase()}-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        this.shot.set({ file, url: URL.createObjectURL(file) });
      },
      'image/jpeg',
      0.92,
    );
  }

  retake() {
    this.discardShot();
  }

  useShot() {
    const s = this.shot();
    if (!s) return;
    const moment = this.moment();
    this.closeCamera();
    this.uploadFiles([s.file], moment);
  }

  closeCamera() {
    this.stopStream();
    this.discardShot();
    this.cameraOpen.set(false);
    this.cameraBusy.set(false);
  }

  private discardShot() {
    const s = this.shot();
    if (s) URL.revokeObjectURL(s.url);
    this.shot.set(null);
  }

  private stopStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const video = this.camVideo()?.nativeElement;
    if (video) video.srcObject = null;
  }

  upload(event: Event, moment: AesPhotoMoment) {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    this.uploadFiles(files, moment);
  }

  private uploadFiles(files: File[], moment: AesPhotoMoment) {
    const uploader = this.uploader();
    if (!uploader || !files.length) return;
    this.error.set(null);
    const angle = this.angle();
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
