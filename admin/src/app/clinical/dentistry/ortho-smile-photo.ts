import { Component, computed, input, output, signal } from '@angular/core';
import { CephPoint, DentistryContent } from './dentistry.models';
import { FacialPhotoOption } from './ortho-facial-analysis';
import { SMILE_LANDMARKS, SmileLandmark, perpendicularThrough, smilePhotoAnalysis } from './ortho-smile-photo.models';

/** Análisis de sonrisa sobre la fotografía: línea media dental y facial, comisuras y plano bicomisural. */
@Component({
  selector: 'app-ortho-smile-photo',
  template: `
    @let tr = trace();
    @let res = result();
    <section class="spa">
      <header>
        <h5>Análisis fotográfico de sonrisa</h5>
        <span class="spa-badge">{{ placedCount() }}/{{ landmarks.length }} puntos</span>
      </header>
      @if (!photos().length) {
        <p class="spa-empty">Cargue la fotografía de «Sonrisa» (o la frontal) en la sección de Fotografías para marcar la línea media y las comisuras.</p>
      } @else {
        <div class="spa-photos">
          @for (ph of photos(); track ph.id) {
            <button type="button" [class.on]="ph.id === current()?.id" [disabled]="disabled()" (click)="selectPhoto(ph)">{{ ph.label }}</button>
          }
        </div>
        <div class="spa-main">
          <div class="spa-stage">
            @if (stale()) {
              <p class="spa-empty">La fotografía usada en este análisis ya no está disponible. Reinicie para trazar sobre otra.</p>
            } @else if (current()?.url; as url) {
              <img [src]="url" alt="Fotografía de sonrisa" draggable="false" (load)="onLoad($event)" />
              @if (size(); as s) {
                @let k = s.w / 600;
                <svg class="spa-ov" [class.placing]="!disabled() && !!active()" [attr.viewBox]="'0 0 ' + s.w + ' ' + s.h" preserveAspectRatio="none"
                  (pointerdown)="onStageDown($event)" (pointermove)="onMove($event)" (pointerup)="onUp()" (pointerleave)="onUp()">
                  @if (pts().CR && pts().CL) {
                    @let cr = pts().CR!;
                    @let cl = pts().CL!;
                    <line [attr.x1]="0" [attr.y1]="(cr.y + cl.y) / 2" [attr.x2]="s.w" [attr.y2]="(cr.y + cl.y) / 2" class="g-ref" [attr.stroke-width]="1.2 * k" [attr.stroke-dasharray]="6 * k + ' ' + 5 * k" />
                    <line [attr.x1]="cr.x" [attr.y1]="cr.y" [attr.x2]="cl.x" [attr.y2]="cl.y" class="g-com" [attr.stroke-width]="2 * k" />
                    @if (pts().Md; as md) {
                      @let l = perp(cr, cl, md, s.h);
                      <line [attr.x1]="l.x1" [attr.y1]="l.y1" [attr.x2]="l.x2" [attr.y2]="l.y2" class="g-md" [attr.stroke-width]="2 * k" />
                    }
                    @if (pts().Mf; as mf) {
                      @let l = perp(cr, cl, mf, s.h);
                      <line [attr.x1]="l.x1" [attr.y1]="l.y1" [attr.x2]="l.x2" [attr.y2]="l.y2" class="g-mf" [attr.stroke-width]="1.6 * k" [attr.stroke-dasharray]="10 * k + ' ' + 6 * k" />
                    }
                  } @else if (pts().Md; as md) {
                    <line [attr.x1]="md.x" y1="0" [attr.x2]="md.x" [attr.y2]="s.h" class="g-md" [attr.stroke-width]="2 * k" />
                  }
                  @for (lm of landmarks; track lm.key) {
                    @if (pts()[lm.key]; as p) {
                      <g class="pt" [class.on]="active() === lm.key" (pointerdown)="onPointDown($event, lm.key)">
                        <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="16 * k" class="hit" />
                        <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="6 * k" [attr.stroke-width]="2 * k" />
                        <text [attr.x]="p.x + 10 * k" [attr.y]="p.y - 10 * k" [attr.font-size]="15 * k" [attr.stroke-width]="4 * k">{{ lm.short }}</text>
                      </g>
                    }
                  }
                </svg>
              }
            }
          </div>
          <aside class="spa-side">
            <ol class="spa-steps">
              @for (lm of landmarks; track lm.key; let i = $index) {
                <li>
                  <button type="button" [class.done]="!!pts()[lm.key]" [class.on]="active() === lm.key" [disabled]="disabled()" (click)="pick.set(lm.key)">
                    <b>{{ i + 1 }}</b> {{ lm.label }} @if (lm.optional) { <small>opcional</small> }
                  </button>
                </li>
              }
            </ol>
            <p class="spa-help">
              @if (activeLandmark(); as lm) {
                <strong>Marque:</strong> {{ lm.hint }}
              } @else {
                Todos los puntos están marcados. Arrastre cualquier punto para ajustarlo.
              }
            </p>
            <label class="spa-cal">
              Distancia real entre comisuras (mm)
              <input type="number" min="0" step="0.5" [value]="tr.refMm ?? ''" [readOnly]="disabled()" (input)="setRef($any($event.target).value)" placeholder="Opcional, para ver mm" />
            </label>
            @for (m of res.metrics; track m.label) {
              <div class="spa-metric" [attr.data-tone]="m.tone">
                <span>{{ m.label }}</span>
                <b>{{ m.value }}</b>
                <small>{{ m.message }}</small>
              </div>
            }
            @if (!disabled()) {
              <div class="spa-actions">
                @if (res.cant && res.cant !== data().orthoExam.smile.occlusalCant) {
                  <button type="button" class="apply" (click)="applyCant(res.cant)">Registrar plano oclusal: {{ res.cant }}</button>
                }
                @if (res.summary && !data().orthoExam.smile.notes.includes(res.summary)) {
                  <button type="button" class="apply" (click)="appendSummary(res.summary)">Agregar resumen a observaciones</button>
                }
                @if (placedCount()) {
                  <button type="button" class="ghost" (click)="undo()">Deshacer último punto</button>
                  <button type="button" class="ghost" (click)="reset()">Reiniciar análisis</button>
                }
              </div>
            }
          </aside>
        </div>
      }
    </section>
  `,
  styleUrl: './ortho-smile-photo.scss',
})
export class OrthoSmilePhoto {
  readonly data = input.required<DentistryContent>();
  readonly photos = input<FacialPhotoOption[]>([]);
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly landmarks = SMILE_LANDMARKS;
  readonly size = signal<{ w: number; h: number } | null>(null);
  readonly pick = signal<string | null>(null);
  private readonly tick = signal(0);
  private dragging: string | null = null;
  private order: string[] = [];

  readonly trace = computed(
    () => {
      this.tick();
      return this.data().orthodontics.facialTracing.smile;
    },
    { equal: () => false },
  );
  readonly pts = computed(() => this.trace().points as Partial<Record<SmileLandmark['key'], CephPoint>>, { equal: () => false });
  readonly stale = computed(() => {
    const id = this.trace().attachmentId;
    return !!id && !this.photos().some((p) => p.id === id);
  });
  readonly current = computed((): FacialPhotoOption | null => this.photos().find((p) => p.id === this.trace().attachmentId) ?? this.photos()[0] ?? null);
  readonly placedCount = computed(() => this.landmarks.filter((l) => !!this.pts()[l.key]).length);
  readonly active = computed(() => this.pick() ?? this.landmarks.find((l) => !this.pts()[l.key])?.key ?? null);
  readonly activeLandmark = computed(() => this.landmarks.find((l) => l.key === this.active()) ?? null);
  readonly result = computed(() => smilePhotoAnalysis(this.pts(), this.trace().refMm));

  perp(cr: CephPoint, cl: CephPoint, p: CephPoint, h: number) {
    return perpendicularThrough(cr, cl, p, h);
  }

  onLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) this.size.set({ w: img.naturalWidth, h: img.naturalHeight });
  }

  private toImage(event: PointerEvent): CephPoint | null {
    const svg = (event.currentTarget as Element).closest('svg') as SVGSVGElement | null;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const r = pt.matrixTransform(m.inverse());
    return { x: Math.round(r.x), y: Math.round(r.y) };
  }

  private commit() {
    const t = this.trace();
    t.tracedAt = new Date().toISOString();
    this.tick.update((v) => v + 1);
    this.changed.emit();
  }

  onStageDown(event: PointerEvent) {
    const key = this.active();
    if (this.disabled() || !key) return;
    const p = this.toImage(event);
    const photo = this.current();
    if (!p || !photo) return;
    const t = this.trace();
    t.attachmentId = photo.id;
    t.points[key] = p;
    this.order = [...this.order.filter((k) => k !== key), key];
    this.pick.set(null);
    this.commit();
  }

  onPointDown(event: PointerEvent, key: string) {
    if (this.disabled()) return;
    event.stopPropagation();
    this.dragging = key;
    this.pick.set(key);
    (event.currentTarget as Element).closest('svg')?.setPointerCapture(event.pointerId);
  }

  onMove(event: PointerEvent) {
    if (!this.dragging) return;
    const p = this.toImage(event);
    if (!p) return;
    this.trace().points[this.dragging] = p;
    this.tick.update((v) => v + 1);
  }

  onUp() {
    if (!this.dragging) return;
    this.dragging = null;
    this.pick.set(null);
    this.commit();
  }

  selectPhoto(ph: FacialPhotoOption) {
    const t = this.trace();
    if (this.disabled() || ph.id === this.current()?.id) return;
    if (this.placedCount() && !confirm('Cambiar de fotografía borra los puntos marcados en la anterior. ¿Continuar?')) return;
    t.attachmentId = ph.id;
    t.points = {};
    this.order = [];
    this.size.set(null);
    this.commit();
  }

  setRef(v: string) {
    const n = Number(String(v).replace(',', '.'));
    this.trace().refMm = Number.isFinite(n) && n > 0 ? n : undefined;
    this.commit();
  }

  undo() {
    const t = this.trace();
    const last = this.order.pop() ?? [...this.landmarks].reverse().find((l) => !!t.points[l.key])?.key;
    if (!last) return;
    delete t.points[last];
    this.commit();
  }

  reset() {
    if (!confirm('¿Borrar los puntos del análisis fotográfico de sonrisa?')) return;
    const t = this.trace();
    t.points = {};
    t.attachmentId = '';
    t.tracedAt = '';
    this.order = [];
    this.tick.update((v) => v + 1);
    this.changed.emit();
  }

  applyCant(v: string) {
    this.data().orthoExam.smile.occlusalCant = v;
    this.changed.emit();
  }

  appendSummary(text: string) {
    const s = this.data().orthoExam.smile;
    s.notes = s.notes?.trim() ? `${s.notes.trim()} ${text}` : text;
    this.changed.emit();
  }
}
