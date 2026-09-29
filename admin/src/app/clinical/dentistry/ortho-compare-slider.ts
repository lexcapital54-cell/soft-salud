import { Component, ElementRef, ViewChild, computed, input, signal } from '@angular/core';

type CompareMode = 'slide' | 'fade' | 'side';

/** Compara dos fotos: divisor deslizable, superposición con transparencia o lado a lado. */
@Component({
  selector: 'app-ortho-compare-slider',
  standalone: true,
  template: `
    @if (beforeUrl() && afterUrl()) {
      <div class="cmp-modes" role="tablist" aria-label="Modo de comparación">
        @for (m of modes; track m.key) {
          <button type="button" role="tab" [attr.aria-selected]="mode() === m.key" [class.on]="mode() === m.key" (click)="mode.set(m.key)">
            {{ m.label }}
          </button>
        }
      </div>
      @switch (mode()) {
        @case ('side') {
          <div class="cmp-side">
            <figure>
              <img [src]="beforeUrl()" [alt]="beforeLabel()" draggable="false" />
              <figcaption>{{ beforeLabel() }}</figcaption>
            </figure>
            <figure>
              <img [src]="afterUrl()" [alt]="afterLabel()" draggable="false" />
              <figcaption>{{ afterLabel() }}</figcaption>
            </figure>
          </div>
        }
        @default {
          <div
            #stage
            class="cmp"
            [class.fade]="mode() === 'fade'"
            tabindex="0"
            [attr.aria-label]="mode() === 'fade' ? 'Superposición: flechas para cambiar la transparencia' : 'Comparador: flechas para mover el divisor'"
            (pointerdown)="onDown($event)"
            (pointermove)="onMove($event)"
            (pointerup)="dragging = false"
            (pointercancel)="dragging = false"
            (dblclick)="pos.set(50)"
            (keydown)="onKey($event)"
          >
            @if (mode() === 'fade') {
              <img class="cmp-img" [src]="beforeUrl()" [alt]="beforeLabel()" draggable="false" />
              <img class="cmp-img" [src]="afterUrl()" [alt]="afterLabel()" draggable="false" [style.opacity]="pos() / 100" />
              <span class="cmp-tag left">{{ beforeLabel() }} · {{ 100 - pos() }} %</span>
              <span class="cmp-tag right">{{ afterLabel() }} · {{ pos() }} %</span>
            } @else {
              <img class="cmp-img" [src]="afterUrl()" [alt]="afterLabel()" draggable="false" />
              <img class="cmp-img cmp-before" [src]="beforeUrl()" [alt]="beforeLabel()" draggable="false" [style.clip-path]="clip()" />
              <span class="cmp-tag left">{{ beforeLabel() }}</span>
              <span class="cmp-tag right">{{ afterLabel() }}</span>
              <div class="cmp-divider" [style.left.%]="pos()">
                <span class="cmp-handle" aria-hidden="true">⟷</span>
              </div>
            }
          </div>
          <input
            class="cmp-range"
            type="range"
            min="0"
            max="100"
            step="1"
            [value]="pos()"
            (input)="pos.set(+$any($event.target).value)"
            [attr.aria-label]="mode() === 'fade' ? 'Transparencia de la foto después' : 'Posición del divisor antes / después'"
          />
          <p class="cmp-help">
            {{ mode() === 'fade' ? 'Arrastre sobre la foto o use las flechas para fundir una foto en la otra.' : 'Arrastre el divisor o use las flechas del teclado.' }}
            Doble clic para volver al centro.
          </p>
        }
      }
    } @else {
      <p class="cmp-empty">{{ emptyText() }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .cmp-modes { display: inline-flex; margin-bottom: 8px; border: 1px solid #cbd5e1; border-radius: 9px; overflow: hidden; }
    .cmp-modes button { border: 0; background: #f8fafc; padding: 5px 12px; font: inherit; font-size: 0.78rem; font-weight: 700; color: #475569; cursor: pointer; }
    .cmp-modes button + button { border-left: 1px solid #e2e8f0; }
    .cmp-modes button.on { background: #0f172a; color: #fff; }
    .cmp {
      position: relative; overflow: hidden; border-radius: 10px; background: #0f172a; cursor: ew-resize;
      user-select: none; touch-action: none; aspect-ratio: 4 / 3; outline: none;
    }
    .cmp:focus-visible { box-shadow: 0 0 0 3px #7dd3fc; }
    .cmp.fade { cursor: col-resize; }
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
    .cmp-help { margin: 2px 0 0; font-size: 0.72rem; color: #64748b; }
    .cmp-side { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .cmp-side figure { margin: 0; position: relative; border-radius: 10px; overflow: hidden; background: #0f172a; aspect-ratio: 4 / 3; }
    .cmp-side img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .cmp-side figcaption { position: absolute; top: 8px; left: 8px; padding: 2px 8px; border-radius: 99px; font-size: 0.72rem; font-weight: 700; background: rgba(15, 23, 42, 0.75); color: #fff; }
    @media (max-width: 600px) { .cmp-side { grid-template-columns: 1fr; } }
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
  readonly modes: Array<{ key: CompareMode; label: string }> = [
    { key: 'slide', label: 'Deslizar' },
    { key: 'fade', label: 'Superponer' },
    { key: 'side', label: 'Lado a lado' },
  ];
  readonly mode = signal<CompareMode>('slide');
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

  onKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === 'ArrowLeft') this.pos.update((p) => Math.max(0, p - step));
    else if (event.key === 'ArrowRight') this.pos.update((p) => Math.min(100, p + step));
    else if (event.key === 'Home') this.pos.set(0);
    else if (event.key === 'End') this.pos.set(100);
    else return;
    event.preventDefault();
  }
}
