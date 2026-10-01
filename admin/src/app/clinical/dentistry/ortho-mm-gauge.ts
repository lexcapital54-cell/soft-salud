import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { num } from './ortho-exam.models';

/** Medida en mm con botones −/+ y una escala que marca el rango de referencia. */
@Component({
  selector: 'app-ortho-mm-gauge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mg" [attr.data-tone]="tone()">
      <span class="mg-label">{{ label() }}</span>
      <div class="mg-ctrl">
        <button type="button" [disabled]="disabled()" (click)="step(-1)" [attr.aria-label]="'Disminuir ' + label()">−</button>
        <input
          [value]="value()"
          (input)="set($any($event.target).value)"
          [readOnly]="disabled()"
          inputmode="decimal"
          [placeholder]="placeholder()"
          [attr.aria-label]="label() + ' en mm'"
        />
        <span class="mg-unit">mm</span>
        <button type="button" [disabled]="disabled()" (click)="step(1)" [attr.aria-label]="'Aumentar ' + label()">+</button>
      </div>
      <div class="mg-scale" (click)="pick($event)" [class.clickable]="!disabled()" title="Haga clic en la escala para registrar el valor">
        @if (ref(); as r) {
          <span class="mg-ref" [style.left.%]="pos(r[0])" [style.width.%]="pos(r[1]) - pos(r[0])"></span>
        }
        @if (n() !== null) {
          <span class="mg-dot" [style.left.%]="pos(n()!)"></span>
        }
      </div>
      <div class="mg-ticks">
        <span>{{ min() }}</span>
        @if (refText()) {
          <span class="mg-ref-txt">ref. {{ refText() }}</span>
        }
        <span>{{ max() }}</span>
      </div>
    </div>
  `,
  styles: `
    .mg { display: grid; gap: 4px; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fbfdff; transition: border-color 0.15s, background 0.15s; }
    .mg[data-tone='ok'] { border-color: #bbf7d0; background: #f7fdf9; }
    .mg[data-tone='warn'] { border-color: #fcd34d; background: #fffcf0; }
    .mg-label { font-size: 11px; font-weight: 600; color: #475569; }
    .mg-ctrl { display: grid; grid-template-columns: 30px 1fr auto 30px; align-items: center; gap: 4px; }
    .mg-ctrl button { height: 30px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #12609a; font-size: 16px; line-height: 1; cursor: pointer; }
    .mg-ctrl button:hover:not(:disabled) { background: #eef6fc; }
    .mg-ctrl button:disabled { opacity: 0.5; cursor: default; }
    .mg-ctrl input { min-width: 0; height: 30px; padding: 0 6px; text-align: center; font-size: 14px; font-weight: 600; }
    .mg-unit { font-size: 11px; color: #64748b; }
    .mg-scale { position: relative; height: 8px; margin: 4px 0 0; border-radius: 99px; background: #e2e8f0; }
    .mg-scale.clickable { cursor: pointer; }
    .mg-ref { position: absolute; top: 0; bottom: 0; border-radius: 99px; background: #86efac; }
    .mg-dot { position: absolute; top: 50%; width: 14px; height: 14px; border: 2px solid #fff; border-radius: 50%; background: #12609a; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.3); transform: translate(-50%, -50%); transition: left 0.2s; }
    .mg[data-tone='warn'] .mg-dot { background: #d97706; }
    .mg-ticks { display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
    .mg-ref-txt { color: #15803d; }
  `,
})
export class OrthoMmGauge {
  readonly label = input.required<string>();
  readonly value = input<string>('');
  readonly min = input(0);
  readonly max = input(10);
  readonly stepSize = input(0.5);
  readonly placeholder = input('');
  /** Rango normal [desde, hasta] (hasta = Infinity si no tiene tope); sin rango solo se muestra el marcador. */
  readonly ref = input<[number, number] | null>(null);
  readonly disabled = input(false);
  readonly valueChange = output<string>();

  readonly n = computed(() => num(this.value()));
  readonly refText = computed(() => {
    const r = this.ref();
    if (!r) return '';
    return Number.isFinite(r[1]) ? `${r[0]}–${r[1]}` : `≥ ${r[0]}`;
  });
  readonly tone = computed(() => {
    const n = this.n();
    const r = this.ref();
    if (n === null || !r) return '';
    return n >= r[0] && n <= r[1] ? 'ok' : 'warn';
  });

  pos(v: number) {
    const span = this.max() - this.min() || 1;
    return Math.min(100, Math.max(0, ((v - this.min()) / span) * 100));
  }

  set(v: string) {
    if (!this.disabled()) this.valueChange.emit(v);
  }

  step(dir: 1 | -1) {
    const base = this.n() ?? (dir > 0 ? this.min() - this.stepSize() : this.min());
    const next = Math.min(this.max() * 2, Math.max(0, base + dir * this.stepSize()));
    this.set(String(Math.round(next * 10) / 10));
  }

  pick(event: MouseEvent) {
    if (this.disabled()) return;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const raw = this.min() + ((event.clientX - box.left) / box.width) * (this.max() - this.min());
    const snapped = Math.round(raw / this.stepSize()) * this.stepSize();
    this.set(String(Math.round(Math.max(this.min(), snapped) * 10) / 10));
  }
}
