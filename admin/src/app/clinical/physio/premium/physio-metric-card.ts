import { Component, input, output } from '@angular/core';
import { PhysioIcon } from '../physio-icons';
import { FunctionalMetric } from './physio-premium.models';

/** Indicador del estado funcional: ícono, valor destacado, descripción y chip de estado. */
@Component({
  selector: 'app-physio-metric-card',
  imports: [PhysioIcon],
  template: `
    @let m = metric();
    <button
      type="button"
      class="mc"
      [class.pending]="m.value === null"
      [attr.data-tone]="m.chip?.tone || 'neutral'"
      [attr.aria-label]="m.label + ': ' + (m.value === null ? (m.pending || 'pendiente de valoración') : m.value + m.unit + (m.chip ? ', ' + m.chip.text : ''))"
      (click)="open.emit(m.go)"
    >
      <span class="mc-label">{{ m.label }}</span>
      <span class="mc-icon"><app-physio-icon [name]="m.icon" /></span>
      @if (m.value !== null) {
        <span class="mc-value" [class.text]="m.value.length > 4">{{ m.value }}<small>{{ m.unit }}</small></span>
        @if (m.chip) {
          <span class="mc-chip">{{ m.chip.text }}</span>
        }
      } @else {
        <span class="mc-pending">{{ m.pending || 'Pendiente de valoración' }}</span>
      }
      @if (m.detail) {
        <span class="mc-detail">{{ m.detail }}</span>
      }
    </button>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .mc {
      --tone: var(--pd-muted, #687386);
      --tone-bg: #f1f4f7;
      --tone-ink: #4c5869;
      width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 14px 10px 12px; border: 1px solid var(--pd-line, #e3e9f0); border-radius: 16px; background: #fff;
      font: inherit; color: var(--pd-ink, #172033); text-align: center; cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
    }
    .mc:hover { border-color: #c9d6e3; box-shadow: 0 10px 24px -18px rgba(var(--pd-shadow-rgb, 11, 34, 57), 0.45); transform: translateY(-1px); }
    .mc:focus-visible { outline: 3px solid rgba(var(--pd-gold-rgb, 199, 154, 75), 0.55); outline-offset: 2px; }
    .mc[data-tone='ok'] { --tone: #1fa774; --tone-bg: #e5f6ee; --tone-ink: #13704d; }
    .mc[data-tone='mild'] { --tone: #c79a4b; --tone-bg: #fbf3e4; --tone-ink: #7a5718; }
    .mc[data-tone='warn'] { --tone: #d99a32; --tone-bg: #fdf0dc; --tone-ink: #85520c; }
    .mc[data-tone='danger'] { --tone: #d45b5b; --tone-bg: #fbe9e9; --tone-ink: #9b3333; }
    .mc-label { font-size: 0.78rem; font-weight: 600; color: var(--pd-navy, #0b2239); line-height: 1.2; min-height: 2.4em; display: grid; place-items: center; }
    .mc-icon app-physio-icon { width: 30px; height: 30px; color: var(--tone); }
    .mc.pending .mc-icon app-physio-icon { color: #a7b3c2; }
    .mc-value { font-size: 1.7rem; font-weight: 700; color: var(--pd-navy, #0b2239); line-height: 1; font-variant-numeric: tabular-nums; }
    .mc-value.text { font-size: 1.05rem; padding: 6px 0; }
    .mc-value small { font-size: 0.8rem; font-weight: 500; color: var(--pd-muted, #687386); margin-left: 2px; }
    .mc-chip { padding: 3px 10px; border-radius: 8px; background: var(--tone-bg); color: var(--tone-ink); font-size: 0.76rem; font-weight: 600; }
    .mc-pending { font-size: 0.78rem; color: var(--pd-muted, #687386); font-style: italic; padding: 8px 0; }
    .mc-detail { font-size: 0.74rem; color: var(--pd-muted, #687386); line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  `,
})
export class PhysioMetricCard {
  readonly metric = input.required<FunctionalMetric>();
  readonly open = output<string>();
}
