import { Component, HostListener, computed, input, output, signal } from '@angular/core';

export interface ViewerItem {
  id: string;
  label: string;
  url: string | null;
  date?: string;
}

/** Visor a pantalla completa: zoom, rotación solo de vista (no altera el archivo), galería y descarga. */
@Component({
  selector: 'app-clinical-image-viewer',
  template: `
    @let item = current();
    <div class="cv" role="dialog" aria-modal="true" [attr.aria-label]="item?.label || 'Imagen'" (click)="close.emit()">
      <header class="cv-bar" (click)="$event.stopPropagation()">
        <div class="cv-title">
          <strong>{{ item?.label }}</strong>
          @if (item?.date) {
            <span>{{ item?.date }}</span>
          }
          @if (items().length > 1) {
            <span>{{ index() + 1 }} / {{ items().length }}</span>
          }
        </div>
        <div class="cv-tools">
          <button type="button" (click)="zoomBy(-0.25)" title="Alejar (−)">−</button>
          <button type="button" class="pct" (click)="resetView()" title="Restablecer">{{ zoomPct() }}</button>
          <button type="button" (click)="zoomBy(0.25)" title="Acercar (+)">+</button>
          <button type="button" (click)="rotate(-90)" title="Rotar a la izquierda (Shift+R)">⟲</button>
          <button type="button" (click)="rotate(90)" title="Rotar a la derecha (R)">⟳</button>
          @if (item?.url) {
            <a class="btn" [href]="item!.url" [attr.download]="fileName(item!)" title="Descargar">Descargar</a>
            <a class="btn" [href]="item!.url" target="_blank" rel="noopener" title="Abrir en otra pestaña">Abrir</a>
          }
          <button type="button" class="x" (click)="close.emit()" title="Cerrar (Esc)">✕</button>
        </div>
      </header>
      <div class="cv-stage" (wheel)="onWheel($event)">
        @if (items().length > 1) {
          <button type="button" class="nav prev" (click)="step(-1); $event.stopPropagation()" aria-label="Anterior">‹</button>
          <button type="button" class="nav next" (click)="step(1); $event.stopPropagation()" aria-label="Siguiente">›</button>
        }
        @if (item?.url) {
          <img
            [src]="item!.url"
            [alt]="item!.label"
            [style.transform]="'translate(' + pan().x + 'px,' + pan().y + 'px) rotate(' + rotation() + 'deg) scale(' + zoom() + ')'"
            [class.grab]="zoom() > 1"
            draggable="false"
            (click)="$event.stopPropagation()"
            (dblclick)="toggleZoom()"
            (pointerdown)="onDown($event)"
            (pointermove)="onMove($event)"
            (pointerup)="onUp()"
            (pointercancel)="onUp()"
          />
        } @else {
          <p class="cv-loading">Cargando imagen…</p>
        }
      </div>
      <p class="cv-hint" (click)="$event.stopPropagation()">
        Rueda o +/− para acercar · doble clic alterna zoom · arrastre para mover · R rota · ← → cambia de imagen · Esc cierra
      </p>
    </div>
  `,
  styles: `
    .cv { position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column; background: rgba(8, 15, 28, 0.94); color: #e2e8f0; }
    .cv-bar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 14px; background: rgba(15, 23, 42, 0.9); }
    .cv-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; font-size: 14px; }
    .cv-title span { font-size: 12px; color: #94a3b8; }
    .cv-tools { display: flex; flex-wrap: wrap; gap: 6px; }
    .cv-tools button, .cv-tools .btn {
      min-width: 34px; height: 32px; padding: 0 10px; border: 1px solid #334155; border-radius: 8px;
      background: #1e293b; color: #e2e8f0; font-size: 14px; cursor: pointer; text-decoration: none;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .cv-tools button:hover, .cv-tools .btn:hover { background: #334155; }
    .cv-tools .pct { font-size: 12px; min-width: 58px; }
    .cv-tools .x { background: #7f1d1d; border-color: #991b1b; }
    .cv-stage { position: relative; flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .cv-stage img { max-width: 92%; max-height: 92%; object-fit: contain; transition: transform 0.12s ease-out; user-select: none; touch-action: none; }
    .cv-stage img.grab { cursor: grab; }
    .nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 1; width: 44px; height: 64px; border: 0; border-radius: 10px; background: rgba(30, 41, 59, 0.8); color: #fff; font-size: 32px; cursor: pointer; }
    .nav.prev { left: 12px; }
    .nav.next { right: 12px; }
    .cv-loading { color: #94a3b8; }
    .cv-hint { margin: 0; padding: 6px; text-align: center; font-size: 11px; color: #94a3b8; }
  `,
})
export class ClinicalImageViewer {
  readonly items = input.required<ViewerItem[]>();
  readonly start = input(0);
  readonly close = output<void>();

  private readonly offset = signal<number | null>(null);
  readonly index = computed(() => {
    const n = this.items().length;
    const i = this.offset() ?? this.start();
    return n ? ((i % n) + n) % n : 0;
  });
  readonly current = computed(() => this.items()[this.index()] ?? null);
  readonly zoom = signal(1);
  readonly rotation = signal(0);
  readonly pan = signal({ x: 0, y: 0 });
  readonly zoomPct = computed(() => `${Math.round(this.zoom() * 100)} %`);
  private drag: { x: number; y: number; px: number; py: number } | null = null;

  fileName(item: ViewerItem) {
    const safe = item.label.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'imagen';
    return `${safe}.jpg`;
  }

  step(delta: number) {
    this.offset.set(this.index() + delta);
    this.resetView();
  }

  zoomBy(delta: number) {
    this.zoom.set(Math.min(6, Math.max(0.5, Math.round((this.zoom() + delta) * 100) / 100)));
    if (this.zoom() <= 1) this.pan.set({ x: 0, y: 0 });
  }

  toggleZoom() {
    if (this.zoom() > 1) this.resetView();
    else this.zoom.set(2.5);
  }

  rotate(deg: number) {
    this.rotation.update((r) => r + deg);
  }

  resetView() {
    this.zoom.set(1);
    this.rotation.set(0);
    this.pan.set({ x: 0, y: 0 });
  }

  onWheel(e: WheelEvent) {
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 0.2 : -0.2);
  }

  onDown(e: PointerEvent) {
    if (this.zoom() <= 1) return;
    this.drag = { x: e.clientX, y: e.clientY, px: this.pan().x, py: this.pan().y };
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* sin captura en eventos sintéticos */
    }
  }

  onMove(e: PointerEvent) {
    if (!this.drag) return;
    this.pan.set({ x: this.drag.px + e.clientX - this.drag.x, y: this.drag.py + e.clientY - this.drag.y });
  }

  onUp() {
    this.drag = null;
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const k = e.key;
    if (k === 'Escape') this.close.emit();
    else if (k === 'ArrowRight') this.step(1);
    else if (k === 'ArrowLeft') this.step(-1);
    else if (k === '+' || k === '=') this.zoomBy(0.25);
    else if (k === '-') this.zoomBy(-0.25);
    else if (k.toLowerCase() === 'r') this.rotate(e.shiftKey ? -90 : 90);
    else return;
    e.preventDefault();
  }
}
