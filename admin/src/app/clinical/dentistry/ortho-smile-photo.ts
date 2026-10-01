import { Component, computed, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CephPoint, DentistryContent } from './dentistry.models';
import { FacialPhotoOption } from './ortho-facial-analysis';
import { OrthoSmileHud, SmileLayer } from './ortho-smile-hud';
import { SMILE_LANDMARKS, SmileLandmark, perpendicularThrough, smilePhotoAnalysis } from './ortho-smile-photo.models';
import { muscleGuides, teethAnalysis } from './ortho-smile-teeth.models';

/** Análisis de sonrisa sobre la fotografía: líneas medias, comisuras, plano bicomisural y proporción de dientes anteriores. */
@Component({
  selector: 'app-ortho-smile-photo',
  imports: [OrthoSmileHud, NgTemplateOutlet],
  templateUrl: './ortho-smile-photo.html',
  styleUrl: './ortho-smile-photo.scss',
})
export class OrthoSmilePhoto {
  readonly data = input.required<DentistryContent>();
  readonly photos = input<FacialPhotoOption[]>([]);
  readonly disabled = input(false);
  readonly changed = output<void>();
  /** Subida al espacio «Extraoral · Sonrisa» de Fotos y radiografías; la hace la historia clínica. */
  readonly uploading = input(false);
  readonly upload = output<Event>();

  readonly landmarks = SMILE_LANDMARKS;
  readonly min = Math.min;
  readonly groups = [
    { key: 'ref', title: 'Referencias', items: SMILE_LANDMARKS.filter((l) => l.group === 'ref') },
    { key: 'teeth', title: 'Dientes anteriores (13 a 23)', items: SMILE_LANDMARKS.filter((l) => l.group === 'teeth') },
  ];
  readonly layers = signal<Record<SmileLayer, boolean>>({ muscles: true, occlusion: true, proportion: true, status: true });
  readonly selTooth = signal<number | null>(null);
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
    return !!id && this.placedCount() > 0 && !this.photos().some((p) => p.id === id);
  });
  readonly current = computed((): FacialPhotoOption | null => this.photos().find((p) => p.id === this.trace().attachmentId) ?? this.photos()[0] ?? null);
  readonly hasSmilePhoto = computed(() => {
    const id = this.data().photos['extraSmile']?.attachmentId;
    return !!id && this.photos().some((p) => p.id === id);
  });
  readonly placedCount = computed(() => this.landmarks.filter((l) => !!this.pts()[l.key]).length);
  readonly active = computed(() => this.pick() ?? this.landmarks.find((l) => !this.pts()[l.key])?.key ?? null);
  readonly activeLandmark = computed(() => this.landmarks.find((l) => l.key === this.active()) ?? null);
  readonly teeth = computed(() => teethAnalysis(this.pts(), this.trace().refMm, this.data().odontogram));
  readonly result = computed(() => smilePhotoAnalysis(this.pts(), this.trace().refMm, this.teeth().summary));
  readonly muscles = computed(() => muscleGuides(this.pts()));
  readonly selected = computed(() => this.teeth().segments.find((s) => s.fdi === this.selTooth()) ?? null);

  toggleLayer(key: SmileLayer) {
    this.layers.update((l) => ({ ...l, [key]: !l[key] }));
  }

  toggleTooth(fdi: number) {
    this.selTooth.update((v) => (v === fdi ? null : fdi));
  }

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
    this.selTooth.set(null);
    this.size.set(null);
    this.commit();
  }

  confirmReplace(event: Event) {
    const traced = this.trace().attachmentId === this.data().photos['extraSmile']?.attachmentId && this.placedCount() > 0;
    if (traced && !confirm('La foto de sonrisa actual tiene puntos marcados. Al reemplazarla deberá reiniciar el análisis. ¿Continuar?')) event.preventDefault();
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
    this.selTooth.set(null);
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
