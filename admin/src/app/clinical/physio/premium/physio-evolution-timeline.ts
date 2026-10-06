import { Component, computed, input, signal } from '@angular/core';
import { EvolutionEntry, formatDate } from './physio-premium.models';

const VISIBLE = 3;

/** Línea de tiempo de las notas de evolución firmadas (más reciente primero). */
@Component({
  selector: 'app-physio-evolution-timeline',
  template: `
    <ol class="tl">
      @for (e of shown(); track e.id) {
        <li>
          <span class="tl-dot" aria-hidden="true"></span>
          <div class="tl-head">
            <time [attr.datetime]="e.date">{{ date(e.date) }}</time>
            @if (e.amendLabel) {
              <span class="tl-tag">{{ e.amendLabel }}</span>
            }
            @if (e.pain !== null) {
              <span class="tl-tag pain">EVA {{ e.pain }}/10</span>
            }
          </div>
          @if (e.situation) {
            <p class="tl-sit"><strong>Situación actual:</strong> {{ e.situation }}</p>
          }
          @if (e.note) {
            <p class="tl-note" [class.open]="expanded().has(e.id)">{{ e.note }}</p>
            @if (e.note.length > 220) {
              <button type="button" class="tl-more" (click)="toggle(e.id)" [attr.aria-expanded]="expanded().has(e.id)">
                {{ expanded().has(e.id) ? 'Ver menos' : 'Ver nota completa' }}
              </button>
            }
          }
          @if (e.professional) {
            <p class="tl-pro">{{ e.professional }}</p>
          }
        </li>
      }
    </ol>
    @if (entries().length > visible) {
      <button type="button" class="tl-all" (click)="all.set(!all())" [attr.aria-expanded]="all()">
        {{ all() ? 'Mostrar solo las recientes' : 'Ver las ' + entries().length + ' evoluciones' }}
      </button>
    }
  `,
  styles: `
    :host { display: block; }
    .tl { list-style: none; margin: 0; padding: 0 0 0 18px; border-left: 2px solid #e3e9f0; display: grid; gap: 16px; }
    li { position: relative; }
    .tl-dot { position: absolute; left: -25px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid var(--pd-gold, #c79a4b); }
    li:first-child .tl-dot { background: var(--pd-gold, #c79a4b); }
    .tl-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    time { font-weight: 700; color: var(--pd-navy, #0b2239); font-size: 0.88rem; }
    .tl-tag { padding: 2px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 600; background: var(--pd-soft, #eaf1f7); color: var(--pd-navy-2, #163a59); }
    .tl-tag.pain { background: #fbe9e9; color: #9b3333; }
    p { margin: 4px 0 0; font-size: 0.88rem; line-height: 1.5; color: var(--pd-ink, #172033); white-space: pre-line; overflow-wrap: anywhere; }
    .tl-note:not(.open) { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .tl-pro { font-size: 0.78rem; color: var(--pd-muted, #687386); }
    .tl-more, .tl-all { border: 0; background: none; padding: 4px 0; color: var(--pd-navy-2, #163a59); font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
    .tl-all { margin-top: 10px; }
    .tl-more:focus-visible, .tl-all:focus-visible { outline: 3px solid rgba(199, 154, 75, 0.55); outline-offset: 2px; border-radius: 4px; }
  `,
})
export class PhysioEvolutionTimeline {
  readonly entries = input.required<EvolutionEntry[]>();
  readonly visible = VISIBLE;
  readonly all = signal(false);
  readonly expanded = signal(new Set<string>());
  readonly shown = computed(() => (this.all() ? this.entries() : this.entries().slice(0, VISIBLE)));

  date(value: string) {
    return formatDate(value, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  toggle(id: string) {
    const next = new Set(this.expanded());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expanded.set(next);
  }
}
