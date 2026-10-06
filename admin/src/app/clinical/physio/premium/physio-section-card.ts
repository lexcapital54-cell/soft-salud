import { Component, input, output } from '@angular/core';
import { PhysioIcon } from '../physio-icons';

let seq = 0;

/** Tarjeta de sección del tablero: ícono, título, fecha opcional, botón Editar y estado vacío. */
@Component({
  selector: 'app-physio-section-card',
  imports: [PhysioIcon],
  host: { class: 'pd-card' },
  template: `
    <section class="sc" [attr.aria-labelledby]="headingId">
      <header class="sc-head">
        <span class="sc-icon"><app-physio-icon [name]="icon()" /></span>
        <h3 [id]="headingId">{{ heading() }}</h3>
        @if (date()) {
          <span class="sc-date"><app-physio-icon name="calendar" />{{ date() }}</span>
        }
        @if (editable()) {
          <button type="button" class="sc-edit" [attr.aria-label]="'Editar ' + heading()" (click)="edit.emit()">
            <app-physio-icon name="pencil" />Editar
          </button>
        }
      </header>
      <div class="sc-body">
        @if (empty()) {
          <p class="sc-empty">{{ emptyText() }}</p>
        } @else {
          <ng-content />
        }
      </div>
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .sc {
      height: 100%;
      background: #fff;
      border: 1px solid var(--pd-line, #e3e9f0);
      border-radius: 18px;
      padding: 18px 20px;
      box-shadow: 0 1px 2px rgba(11, 34, 57, 0.04), 0 10px 28px -22px rgba(11, 34, 57, 0.35);
    }
    .sc-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .sc-icon {
      display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 50%;
      background: var(--pd-soft, #eaf1f7); color: var(--pd-navy, #0b2239);
      box-shadow: inset 0 0 0 1px rgba(199, 154, 75, 0.45);
    }
    .sc-icon app-physio-icon { width: 18px; height: 18px; color: var(--pd-navy, #0b2239); }
    h3 {
      margin: 0; flex: 1 1 auto; font-family: var(--pd-serif); font-size: 1.12rem; font-weight: 600;
      color: var(--pd-navy, #0b2239); letter-spacing: 0.005em;
    }
    .sc-date { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--pd-muted, #687386); }
    .sc-date app-physio-icon { width: 15px; height: 15px; color: var(--pd-muted, #687386); }
    .sc-edit {
      display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 12px;
      border: 1px solid var(--pd-line, #d8e1ea); border-radius: 999px; background: #fff;
      color: var(--pd-navy, #0b2239); font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer;
    }
    .sc-edit app-physio-icon { width: 14px; height: 14px; color: currentColor; }
    .sc-edit:hover { border-color: var(--pd-navy, #0b2239); background: var(--pd-soft, #eaf1f7); }
    .sc-edit:focus-visible { outline: 3px solid rgba(199, 154, 75, 0.55); outline-offset: 2px; }
    .sc-body { color: var(--pd-ink, #172033); font-size: 0.92rem; line-height: 1.55; }
    .sc-empty {
      margin: 0; padding: 12px 14px; border-radius: 12px; background: var(--pd-bg, #f6f8fa);
      color: var(--pd-muted, #687386); font-size: 0.86rem; font-style: italic;
    }
  `,
})
export class PhysioSectionCard {
  readonly icon = input.required<string>();
  readonly heading = input.required<string>();
  readonly date = input('');
  readonly editable = input(false);
  readonly empty = input(false);
  readonly emptyText = input('Sin información registrada');
  readonly edit = output<void>();
  readonly headingId = `pd-sc-${++seq}`;
}
