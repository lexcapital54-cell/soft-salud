import { Component, ElementRef, ViewChild, computed, input, signal } from '@angular/core';

/** Compara dos fotos superpuestas: la de «antes» a la izquierda del divisor y la de «después» a la derecha. */
@Component({
  selector: 'app-ortho-compare-slider',
  standalone: true,
  template: `
    @if (beforeUrl() && afterUrl()) {
      <div
        #stage
        class="cmp"
        (pointerdown)="onDown($event)"
        (pointermove)="onMove($event)"
        (pointerup)="dragging = false"
        (pointercancel)="dragging = false"
      >
        <img class="cmp-img" [src]="afterUrl()" [alt]="afterLabel()" draggable="false" />
        <img class="cmp-img cmp-before" [src]="beforeUrl()" [alt]="beforeLabel()" draggable="false" [style.clip-path]="clip()" />
        <span class="cmp-tag left">{{ beforeLabel() }}</span>
        <span class="cmp-tag right">{{ afterLabel() }}</span>
        <div class="cmp-divider" [style.left.%]="pos()">
          <span class="cmp-handle" aria-hidden="true">⟷</span>
        </div>
      </div>
      <input
        class="cmp-range"
        type="range"
        min="0"
        max="100"
        step="1"
        [value]="pos()"
        (input)="pos.set(+$any($event.target).value)"
        aria-label="Posición del divisor antes / después"
      />
    } @else {
      <p class="cmp-empty">{{ emptyText() }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .cmp {
      position: relative; overflow: hidden; border-radius: 10px; background: #0f172a; cursor: ew-resize;
      user-select: none; touch-action: none; aspect-ratio: 4 / 3;
    }
    .cmp-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
    .cmp-tag {
      position: absolute; top: 8px; padding: 2px 8px; border-radius: 99px; font-size: 0.72rem; font-weight: 700;
      background: rgba(15, 23, 42, 0.75); color: #fff; pointer-events: none;
    }
    .cmp-tag.left { left: 8px; }
    .cmp-tag.right { right: 8px; }
    .cmp-divider { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #fff; pointer-events: none; }
    .cmp-handle {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 30px; height: 30px; border-radius: 50%;
      background: #fff; color: #0f172a; display: grid; place-items: center; font-size: 0.9rem; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
    }
    .cmp-range { width: 100%; margin-top: 6px; }
    .cmp-empty { margin: 0; padding: 14px; border: 1px dashed #cbd5e1; border-radius: 10px; color: #64748b; font-size: 0.84rem; text-align: center; }
  `,
})
export class OrthoCompareSliderComponent {
  readonly beforeUrl = input<string | null>(null);
  readonly afterUrl = input<string | null>(null);
  readonly beforeLabel = input('Antes');
  readonly afterLabel = input('Después');
  readonly emptyText = input('Seleccione las dos fotos para comparar.');

  @ViewChild('stage') private stage?: ElementRef<HTMLDivElement>;
  readonly pos = signal(50);
  readonly clip = computed(() => `inset(0 ${100 - this.pos()}% 0 0)`);
  dragging = false;

  onDown(event: PointerEvent) {
    this.dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.onMove(event);
  }

  onMove(event: PointerEvent) {
    if (!this.dragging) return;
    const rect = this.stage?.nativeElement.getBoundingClientRect();
    if (!rect?.width) return;
    this.pos.set(Math.round(Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100))));
  }
}
