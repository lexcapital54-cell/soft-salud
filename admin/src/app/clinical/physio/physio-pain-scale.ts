import { Component, computed, input, output } from '@angular/core';
import { painBand, parsePain } from './physio-intake.models';

/** Escala visual analógica (EVA) 0–10: verde leve, amarillo moderado, rojo severo. */
@Component({
  selector: 'app-physio-pain-scale',
  template: `
    @let band = current();
    <div class="eva" role="radiogroup" aria-label="Escala de dolor EVA de 0 a 10">
      <div class="eva-buttons">
        @for (n of levels; track n) {
          <button
            type="button"
            role="radio"
            class="eva-btn"
            [class]="'eva-btn lvl-' + bandOf(n)"
            [class.on]="value() === n"
            [attr.aria-checked]="value() === n"
            [attr.aria-label]="n + ' de 10'"
            [disabled]="disabled()"
            (click)="pick(n)"
          >
            {{ n }}
          </button>
        }
      </div>
      <div class="eva-legend">
        <span class="mild">0–3 Leve</span>
        <span class="moderate">4–6 Moderado</span>
        <span class="severe">7–10 Severo</span>
      </div>
      <div class="eva-result" [class]="'eva-result ' + band.level" aria-live="polite">
        @if (value() !== null) {
          <span class="eva-face" aria-hidden="true">{{ band.face }}</span>
          <strong>{{ value() }}/10</strong>
          <span>{{ band.label }}</span>
          @if (!disabled()) {
            <button type="button" class="eva-clear" (click)="valueChange.emit('')">Borrar</button>
          }
        } @else {
          <span class="muted">Sin registrar: toque el número que indique el paciente.</span>
        }
      </div>
    </div>
  `,
  styles: `
    .eva-buttons { display: grid; grid-template-columns: repeat(11, minmax(0, 1fr)); gap: 4px; }
    .eva-btn { min-height: 38px; border-radius: 10px; border: 1.5px solid transparent; font-weight: 600; cursor: pointer; transition: transform .1s, box-shadow .1s; }
    .eva-btn:disabled { cursor: default; opacity: .75; }
    .eva-btn.lvl-mild { background: #e3f5e8; color: #1e6b35; }
    .eva-btn.lvl-moderate { background: #fff3d6; color: #8a5a00; }
    .eva-btn.lvl-severe { background: #fde3e1; color: #9b1c1c; }
    .eva-btn.on { border-color: #1b365d; transform: translateY(-2px); box-shadow: 0 4px 10px rgba(27, 54, 93, .2); }
    .eva-btn.lvl-mild.on { background: #34a853; color: #fff; }
    .eva-btn.lvl-moderate.on { background: #f2a900; color: #fff; }
    .eva-btn.lvl-severe.on { background: #d93025; color: #fff; }
    .eva-legend { display: flex; justify-content: space-between; font-size: .75rem; margin: 4px 2px 8px; }
    .eva-legend .mild { color: #1e6b35; } .eva-legend .moderate { color: #8a5a00; } .eva-legend .severe { color: #9b1c1c; }
    .eva-result { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 12px; background: #f4f6f9; color: #1b365d; }
    .eva-result.mild { background: #e3f5e8; } .eva-result.moderate { background: #fff3d6; } .eva-result.severe { background: #fde3e1; }
    .eva-face { font-size: 1.8rem; line-height: 1; }
    .eva-clear { margin-left: auto; border: none; background: transparent; color: #1b365d; text-decoration: underline; cursor: pointer; font-size: .8rem; }
    .muted { color: #6a7d90; font-size: .85rem; }
    @media (max-width: 520px) { .eva-buttons { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
    @media print { .eva-btn, .eva-result { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .eva-clear { display: none; } }
  `,
})
export class PhysioPainScale {
  /** Valor guardado ("7", "7/10" o ""). */
  readonly raw = input<string | undefined>('', { alias: 'value' });
  readonly disabled = input(false);
  readonly valueChange = output<string>();

  readonly levels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  readonly value = computed(() => parsePain(this.raw()));
  readonly current = computed(() => painBand(this.value()));

  bandOf(n: number) {
    return painBand(n).level;
  }

  pick(n: number) {
    if (!this.disabled()) this.valueChange.emit(String(n));
  }
}
