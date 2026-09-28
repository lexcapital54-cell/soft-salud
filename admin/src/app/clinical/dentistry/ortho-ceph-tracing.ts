import { Component, ElementRef, OnInit, ViewChild, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CEPH_LANDMARKS, CEPH_LINES, CephLandmarkKey, CephResult, cephValueText, computeCeph } from './ceph-geometry';
import { CephTracing } from './dentistry.models';
import { OrthoMeasureKey, OrthoMeasureStatus, checkMeasure } from './ortho-measures';

export interface CephRadiographOption {
  attachmentId: string;
  label: string;
}

interface MeasureRow {
  key: keyof CephResult;
  rule: OrthoMeasureKey;
  label: string;
  needs: CephLandmarkKey[];
}

const MEASURES: MeasureRow[] = [
  { key: 'sna', rule: 'cephalometry.sna', label: 'SNA', needs: ['S', 'N', 'A'] },
  { key: 'snb', rule: 'cephalometry.snb', label: 'SNB', needs: ['S', 'N', 'B'] },
  { key: 'anb', rule: 'cephalometry.anb', label: 'ANB', needs: ['S', 'N', 'A', 'B'] },
  { key: 'fma', rule: 'cephalometry.fma', label: 'FMA', needs: ['Po', 'Or', 'Go', 'Me'] },
  { key: 'impa', rule: 'cephalometry.impa', label: 'IMPA', needs: ['Go', 'Me', 'L1T', 'L1A'] },
  { key: 'upperIncisor', rule: 'cephalometry.upperIncisor', label: 'U1-SN', needs: ['S', 'N', 'U1T', 'U1A'] },
];

@Component({
  selector: 'app-ortho-ceph-tracing',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="ceph" (input)="$event.stopPropagation()" (change)="$event.stopPropagation()">
      <div class="ceph-toolbar">
        <label class="ceph-source">
          Radiografía lateral
          <select #src (change)="chooseRadiograph(src)" [disabled]="disabled() || !radiographs().length">
            <option value="" [selected]="!tracing().attachmentId">{{ radiographs().length ? 'Seleccione…' : 'Sin radiografías cargadas' }}</option>
            @for (r of radiographs(); track r.attachmentId) {
              <option [value]="r.attachmentId" [selected]="r.attachmentId === tracing().attachmentId">{{ r.label }}</option>
            }
          </select>
        </label>
        @if (!disabled()) {
          <label class="ceph-btn" [class.busy]="uploading()">
            {{ uploading() ? 'Subiendo…' : 'Subir radiografía' }}
            <input type="file" accept="image/*" hidden [disabled]="uploading()" (change)="onFile($event)" />
          </label>
        }
        @if (imageUrl()) {
          <span class="ceph-sep"></span>
          <label class="ceph-range">Brillo <input type="range" min="50" max="200" [ngModel]="brightness()" (ngModelChange)="brightness.set(+$event)" /></label>
          <label class="ceph-range">Contraste <input type="range" min="50" max="250" [ngModel]="contrast()" (ngModelChange)="contrast.set(+$event)" /></label>
          <span class="ceph-zoom">
            <button type="button" (click)="zoomBy(-0.25)" [disabled]="zoom() <= 1" aria-label="Alejar">−</button>
            {{ zoomPercent() }} %
            <button type="button" (click)="zoomBy(0.25)" [disabled]="zoom() >= 3" aria-label="Acercar">+</button>
          </span>
        }
      </div>

      @if (!tracing().attachmentId) {
        <p class="ceph-empty">
          Seleccione o suba la radiografía cefálica lateral. Luego marque los puntos en orden y el sistema calcula
          SNA, SNB, ANB, FMA, IMPA y U1-SN.
        </p>
      } @else {
        <div class="ceph-body">
          <div class="ceph-stage-wrap">
            @if (imageUrl(); as url) {
              <div class="ceph-stage" [style.width.%]="zoom() * 100">
                <img
                  [src]="url"
                  alt="Radiografía cefálica lateral"
                  draggable="false"
                  [style.filter]="'brightness(' + brightness() + '%) contrast(' + contrast() + '%)'"
                  (load)="onImageLoad($event)"
                />
                @if (size(); as s) {
                  <svg
                    #svg
                    class="ceph-overlay"
                    [class.placing]="!disabled() && !!active()"
                    [attr.viewBox]="'0 0 ' + s.w + ' ' + s.h"
                    preserveAspectRatio="none"
                    (pointerdown)="onStagePointerDown($event)"
                    (pointermove)="onPointerMove($event)"
                    (pointerup)="onPointerUp()"
                    (pointercancel)="onPointerUp()"
                  >
                    @for (l of lines(); track l.id) {
                      <line
                        [attr.x1]="l.x1"
                        [attr.y1]="l.y1"
                        [attr.x2]="l.x2"
                        [attr.y2]="l.y2"
                        [attr.class]="'ceph-line ' + l.kind"
                        [attr.stroke-width]="scale().stroke"
                      />
                    }
                    @for (p of placed(); track p.key) {
                      <g
                        class="ceph-pt"
                        [class.on]="p.key === active()"
                        (pointerdown)="onPointPointerDown($event, p.key)"
                      >
                        <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="scale().hit" class="hit" />
                        <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="scale().r" [attr.stroke-width]="scale().stroke" />
                        <text
                          [attr.x]="p.x + scale().r * 1.6"
                          [attr.y]="p.y - scale().r * 1.2"
                          [attr.font-size]="scale().font"
                          [attr.stroke-width]="scale().stroke * 1.5"
                        >
                          {{ p.short }}
                        </text>
                      </g>
                    }
                  </svg>
                }
              </div>
            } @else {
              <p class="ceph-empty">Cargando radiografía…</p>
            }
          </div>

          <aside class="ceph-side">
            <p class="ceph-h">Puntos cefalométricos <span>{{ placedCount() }}/{{ landmarks.length }}</span></p>
            <ol class="ceph-points">
              @for (l of landmarks; track l.key) {
                <li>
                  <button
                    type="button"
                    [class.on]="l.key === active()"
                    [class.done]="isPlaced(l.key)"
                    [disabled]="disabled()"
                    (click)="active.set(l.key)"
                  >
                    <b>{{ l.short }}</b> {{ l.label }}
                    @if (isPlaced(l.key)) {
                      <span class="ok" aria-label="marcado">✓</span>
                    }
                  </button>
                </li>
              }
            </ol>
            @if (!disabled()) {
              @if (activeLandmark(); as a) {
                <p class="ceph-hint">
                  <strong>{{ a.label }}:</strong> {{ a.hint }}
                  {{ isPlaced(a.key) ? 'Arrastre el punto para ajustarlo o haga clic en otro sitio para moverlo.' : 'Haga clic sobre la radiografía.' }}
                </p>
                <div class="ceph-actions">
                  @if (isPlaced(a.key)) {
                    <button type="button" class="linkish" (click)="removePoint(a.key)">Quitar este punto</button>
                  }
                  @if (placedCount()) {
                    <button type="button" class="linkish danger" (click)="resetPoints()">Borrar todo el trazado</button>
                  }
                </div>
              } @else if (placedCount() === landmarks.length) {
                <p class="ceph-hint">Trazado completo. Seleccione un punto de la lista para ajustarlo.</p>
              }
            }

            <p class="ceph-h">Medidas del trazado</p>
            <table class="ceph-measures">
              <tbody>
                @for (m of measureRows(); track m.key) {
                  <tr>
                    <th>{{ m.label }}</th>
                    @if (m.value !== null) {
                      <td class="v">{{ m.text }}°</td>
                      <td [class]="'st ' + m.status!.state">{{ m.status!.message }}</td>
                    } @else {
                      <td class="v">—</td>
                      <td class="st empty">Faltan: {{ m.missing }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
            @if (!disabled()) {
              <button type="button" class="ceph-apply" [disabled]="!hasAnyResult()" (click)="applyResult()">
                Pasar medidas al análisis cefalométrico
              </button>
              <p class="ceph-note">Reemplaza SNA, SNB, ANB, FMA, IMPA y U1-SN con las medidas del trazado. Wits se sigue registrando a mano.</p>
            }
          </aside>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .ceph { border: 1px solid #dbe4ea; border-radius: 12px; background: #fff; padding: 12px; }
    .ceph-toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px 14px; margin-bottom: 10px; }
    .ceph-source { min-width: 240px; flex: 1 1 240px; max-width: 420px; }
    .ceph-btn {
      display: inline-flex; align-items: center; padding: 7px 12px; border-radius: 8px; cursor: pointer;
      border: 1px solid #b9d3d8; color: #00576a; background: #f2f8f9; font-size: 0.85rem; font-weight: 600;
    }
    .ceph-btn.busy { opacity: 0.6; cursor: progress; }
    .ceph-sep { flex: 0 0 1px; align-self: stretch; background: #e2e8f0; }
    .ceph-range { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; color: #475569; }
    .ceph-range input { width: 100px; }
    .ceph-zoom { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; color: #475569; }
    .ceph-zoom button {
      width: 26px; height: 26px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-size: 1rem;
    }
    .ceph-empty { margin: 8px 0; color: #64748b; font-size: 0.86rem; }
    .ceph-body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; align-items: start; }
    @media (max-width: 1100px) { .ceph-body { grid-template-columns: 1fr; } }
    .ceph-stage-wrap { overflow: auto; max-height: 72vh; border-radius: 10px; background: #0b1220; }
    .ceph-stage { position: relative; min-width: 100%; }
    .ceph-stage img { display: block; width: 100%; height: auto; user-select: none; }
    .ceph-overlay { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
    .ceph-overlay.placing { cursor: crosshair; }
    .ceph-line { stroke: #38bdf8; fill: none; opacity: 0.9; }
    .ceph-line.ray { stroke: #a7f3d0; stroke-dasharray: 6 4; }
    .ceph-line.axis { stroke: #fbbf24; }
    .ceph-pt { cursor: grab; }
    .ceph-pt .hit { fill: transparent; stroke: none; }
    .ceph-pt circle:not(.hit) { fill: #ef4444; stroke: #fff; }
    .ceph-pt.on circle:not(.hit) { fill: #22c55e; }
    .ceph-pt text { fill: #fff; stroke: #0b1220; paint-order: stroke; font-weight: 700; font-family: system-ui, sans-serif; }
    .ceph-side { display: flex; flex-direction: column; gap: 8px; }
    .ceph-h { margin: 4px 0 0; font-weight: 700; font-size: 0.85rem; color: #0f172a; display: flex; justify-content: space-between; }
    .ceph-h span { color: #64748b; font-weight: 600; }
    .ceph-points { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .ceph-points button {
      width: 100%; text-align: left; font-size: 0.76rem; padding: 5px 7px; border-radius: 7px; cursor: pointer;
      border: 1px solid #e2e8f0; background: #f8fafc; color: #334155; display: flex; gap: 4px; align-items: center;
    }
    .ceph-points button b { color: #0f172a; min-width: 24px; }
    .ceph-points button.done { background: #f0fdf4; border-color: #bbf7d0; }
    .ceph-points button.on { border-color: #0ea5e9; box-shadow: 0 0 0 2px #bae6fd; background: #f0f9ff; }
    .ceph-points button .ok { margin-left: auto; color: #16a34a; font-weight: 700; }
    .ceph-hint { margin: 0; font-size: 0.8rem; color: #334155; background: #f1f5f9; border-radius: 8px; padding: 8px 10px; }
    .ceph-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .linkish { border: 0; background: none; padding: 0; color: #00798c; font: inherit; font-size: 0.8rem; font-weight: 600; text-decoration: underline; cursor: pointer; }
    .linkish.danger { color: #b42318; }
    .ceph-measures { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    .ceph-measures th { text-align: left; padding: 4px 6px 4px 0; color: #0f172a; white-space: nowrap; }
    .ceph-measures td { padding: 4px 6px; border-top: 1px solid #f1f5f9; }
    .ceph-measures td.v { font-weight: 700; white-space: nowrap; }
    .ceph-measures td.st { font-size: 0.74rem; color: #64748b; }
    .ceph-measures td.st.ok { color: #0f7a4b; }
    .ceph-measures td.st.out { color: #a15c07; }
    .ceph-measures td.st.invalid { color: #b42318; }
    .ceph-apply {
      margin-top: 4px; padding: 8px 12px; border-radius: 8px; border: 0; cursor: pointer;
      background: #00798c; color: #fff; font-weight: 700; font-size: 0.85rem;
    }
    .ceph-apply:disabled { opacity: 0.45; cursor: not-allowed; }
    .ceph-note { margin: 0; font-size: 0.74rem; color: #64748b; }
  `,
})
export class OrthoCephTracingComponent implements OnInit {
  readonly tracing = input.required<CephTracing>();
  readonly imageUrl = input<string | null>(null);
  readonly radiographs = input<CephRadiographOption[]>([]);
  readonly disabled = input(false);
  readonly uploading = input(false);

  readonly changed = output<void>();
  readonly upload = output<File>();
  readonly apply = output<CephResult>();

  @ViewChild('svg') private svgRef?: ElementRef<SVGSVGElement>;

  readonly landmarks = CEPH_LANDMARKS;
  readonly active = signal<CephLandmarkKey | null>('S');
  readonly zoom = signal(1);
  readonly brightness = signal(100);
  readonly contrast = signal(120);
  readonly size = signal<{ w: number; h: number } | null>(null);
  private readonly tick = signal(0);
  private dragging: CephLandmarkKey | null = null;

  readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  readonly activeLandmark = computed(() => CEPH_LANDMARKS.find((l) => l.key === this.active()) ?? null);

  private readonly points = computed(() => {
    this.tick();
    return { ...this.tracing().points };
  });

  readonly placed = computed(() => {
    const pts = this.points();
    return CEPH_LANDMARKS.flatMap((l) => {
      const p = pts[l.key];
      return p ? [{ key: l.key, short: l.short, x: p.x, y: p.y }] : [];
    });
  });

  readonly placedCount = computed(() => this.placed().length);

  readonly lines = computed(() => {
    const pts = this.points();
    return CEPH_LINES.flatMap((l) => {
      const a = pts[l.from];
      const b = pts[l.to];
      return a && b ? [{ id: `${l.from}-${l.to}`, kind: l.kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y }] : [];
    });
  });

  readonly scale = computed(() => {
    const s = this.size();
    const base = s ? Math.max(s.w, s.h) : 1000;
    return { r: base / 160, hit: base / 70, stroke: base / 650, font: base / 48 };
  });

  readonly result = computed(() => computeCeph(this.points()));

  readonly measureRows = computed(() => {
    const res = this.result();
    const pts = this.points();
    return MEASURES.map((m) => {
      const value = res[m.key];
      const text = cephValueText(value);
      const status: OrthoMeasureStatus | null = value === null ? null : checkMeasure(m.rule, text);
      const missing = m.needs
        .filter((k) => !pts[k])
        .map((k) => CEPH_LANDMARKS.find((l) => l.key === k)!.short)
        .join(', ');
      return { key: m.key, label: m.label, value, text, status, missing };
    });
  });

  readonly hasAnyResult = computed(() => Object.values(this.result()).some((v) => v !== null));

  ngOnInit() {
    this.active.set(this.firstMissing());
  }

  private firstMissing(): CephLandmarkKey | null {
    const pts = this.tracing().points;
    return CEPH_LANDMARKS.find((l) => !pts[l.key])?.key ?? null;
  }

  isPlaced(key: CephLandmarkKey) {
    return !!this.points()[key];
  }

  zoomBy(delta: number) {
    this.zoom.update((z) => Math.min(3, Math.max(1, Math.round((z + delta) * 100) / 100)));
  }

  onImageLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) this.size.set({ w: img.naturalWidth, h: img.naturalHeight });
  }

  chooseRadiograph(select: HTMLSelectElement) {
    const t = this.tracing();
    const attachmentId = select.value;
    if (attachmentId === t.attachmentId) return;
    if (Object.keys(t.points).length && !confirm('Cambiar la radiografía borra los puntos marcados. ¿Continuar?')) {
      select.value = t.attachmentId;
      return;
    }
    t.attachmentId = attachmentId;
    t.fileName = this.radiographs().find((r) => r.attachmentId === attachmentId)?.label || '';
    t.points = {};
    t.tracedAt = '';
    this.size.set(null);
    this.active.set('S');
    this.commit();
  }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Suba la radiografía como imagen (JPG o PNG).');
      return;
    }
    const t = this.tracing();
    if (Object.keys(t.points).length && !confirm('La nueva radiografía reemplaza el trazado actual. ¿Continuar?')) return;
    this.size.set(null);
    this.active.set('S');
    this.upload.emit(file);
  }

  private toImage(event: PointerEvent) {
    const svg = this.svgRef?.nativeElement;
    const ctm = svg?.getScreenCTM();
    const s = this.size();
    if (!svg || !ctm || !s) return null;
    const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return {
      x: Math.round(Math.min(s.w, Math.max(0, pt.x)) * 10) / 10,
      y: Math.round(Math.min(s.h, Math.max(0, pt.y)) * 10) / 10,
    };
  }

  onStagePointerDown(event: PointerEvent) {
    const key = this.active();
    if (this.disabled() || !key || event.button !== 0) return;
    const p = this.toImage(event);
    if (!p) return;
    this.tracing().points[key] = p;
    this.active.set(this.firstMissing());
    this.commit();
  }

  onPointPointerDown(event: PointerEvent, key: CephLandmarkKey) {
    if (this.disabled()) return;
    event.stopPropagation();
    this.active.set(key);
    this.dragging = key;
    this.svgRef?.nativeElement.setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent) {
    if (!this.dragging) return;
    const p = this.toImage(event);
    if (!p) return;
    this.tracing().points[this.dragging] = p;
    this.tick.update((v) => v + 1);
  }

  onPointerUp() {
    if (!this.dragging) return;
    this.dragging = null;
    this.commit();
  }

  removePoint(key: CephLandmarkKey) {
    delete this.tracing().points[key];
    this.commit();
  }

  resetPoints() {
    if (!confirm('¿Borrar todos los puntos del trazado?')) return;
    this.tracing().points = {};
    this.tracing().tracedAt = '';
    this.active.set('S');
    this.commit();
  }

  applyResult() {
    this.apply.emit(this.result());
  }

  private commit() {
    const t = this.tracing();
    t.tracedAt = Object.keys(t.points).length ? new Date().toISOString() : '';
    this.tick.update((v) => v + 1);
    this.changed.emit();
  }
}
