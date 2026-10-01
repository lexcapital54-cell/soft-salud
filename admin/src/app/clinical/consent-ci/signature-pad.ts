import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  input,
  output,
  signal,
} from '@angular/core';
import SignaturePad from 'signature_pad';

/** Lienzo de firma táctil/mouse reutilizable que entrega la firma como data URL PNG. */
@Component({
  selector: 'app-signature-pad',
  template: `
    <div class="sig" [class.has]="hasInk()">
      <p class="sig-label">{{ label() }}</p>
      <div class="sig-shell">
        @if (!hasInk()) {
          <span class="sig-hint">Firme aquí con el dedo o el mouse</span>
        }
        <canvas #canvas [attr.aria-label]="label()" (pointerdown)="ensure()"></canvas>
      </div>
      <div class="sig-foot">
        <span class="sig-state">{{ hasInk() ? 'Firma capturada' : 'Sin firma' }}</span>
        <button type="button" class="sig-clear" (click)="clear()" [disabled]="!hasInk() || disabled()">
          Limpiar
        </button>
      </div>
    </div>
  `,
  styles: `
    .sig { display: grid; gap: 6px; }
    .sig-label { margin: 0; font-weight: 600; color: var(--hce-title, #003d4c); font-size: 0.9rem; }
    .sig-shell { position: relative; border: 2px dashed #94a3b8; border-radius: 12px; background: #fff; transition: border-color 0.15s; }
    .sig.has .sig-shell { border-style: solid; border-color: var(--hce-accent, #0d7377); }
    canvas { display: block; width: 100%; height: 170px; touch-action: none; cursor: crosshair; border-radius: 10px; }
    .sig-hint { position: absolute; inset: 0; display: grid; place-items: center; color: #94a3b8; font-size: 0.85rem; pointer-events: none; }
    .sig-foot { display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; }
    .sig-state { color: #64748b; }
    .sig.has .sig-state { color: var(--hce-accent, #0d7377); font-weight: 600; }
    .sig-clear { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 4px 10px; cursor: pointer; }
    .sig-clear:disabled { opacity: 0.5; cursor: default; }
  `,
})
export class SignaturePadComponent implements AfterViewInit, OnDestroy {
  readonly label = input('Firma');
  readonly disabled = input(false);
  readonly changed = output<string | null>();

  @ViewChild('canvas', { static: true })
  private canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly hasInk = signal(false);
  private pad: SignaturePad | null = null;
  private readonly onResize = () => this.init(true);

  ngAfterViewInit() {
    window.addEventListener('resize', this.onResize);
    setTimeout(() => this.init(false), 30);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
    this.pad?.off();
  }

  /** El lienzo puede montarse oculto (diálogo): reajusta al primer toque. */
  ensure() {
    const canvas = this.canvasRef.nativeElement;
    if (!this.pad || canvas.width < 40) this.init(true);
  }

  clear() {
    this.pad?.clear();
    this.hasInk.set(false);
    this.changed.emit(null);
  }

  dataUrl(): string | null {
    return this.pad && !this.pad.isEmpty() ? this.pad.toDataURL('image/png') : null;
  }

  private init(keep: boolean) {
    const canvas = this.canvasRef.nativeElement;
    const snapshot = keep ? this.dataUrl() : null;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.max(canvas.clientWidth, 260);
    const height = Math.max(canvas.clientHeight, 150);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.getContext('2d')?.scale(ratio, ratio);

    this.pad?.off();
    this.pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(16, 24, 40)',
      minWidth: 0.8,
      maxWidth: 2.5,
    });
    if (this.disabled()) this.pad.off();
    this.pad.addEventListener('endStroke', () => {
      const url = this.dataUrl();
      this.hasInk.set(!!url);
      this.changed.emit(url);
    });
    if (snapshot) void this.pad.fromDataURL(snapshot, { width, height });
  }
}
