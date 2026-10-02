import { Component, computed, input, output, signal } from '@angular/core';
import { PhysiotherapyContent } from '../clinical.models';
import { BODY_ZONES, BodyView, BodyZone, zoneLabel } from './physio-body-map.data';
import { ensureIntake } from './physio-intake.models';

/** Mapa corporal anterior / posterior: cada zona se marca o desmarca con un clic. */
@Component({
  selector: 'app-physio-body-map',
  template: `
    @let intake = state();
    <div class="bm">
      <div class="bm-views">
        @for (view of views; track view.key) {
          <figure class="bm-view">
            <figcaption>{{ view.label }}</figcaption>
            <svg viewBox="0 0 200 380" role="group" [attr.aria-label]="'Mapa corporal, ' + view.label">
              <ellipse class="bm-head" cx="100" cy="28" rx="17" ry="21" />
              <text class="bm-side" x="14" y="372">{{ view.key === 'ant' ? 'Der.' : 'Izq.' }}</text>
              <text class="bm-side" x="186" y="372" text-anchor="end">{{ view.key === 'ant' ? 'Izq.' : 'Der.' }}</text>
              @for (zone of zones[view.key]; track zone.id) {
                @let on = selected().has(zone.id);
                <g
                  class="bm-zone"
                  [class.on]="on"
                  [class.locked]="disabled()"
                  [attr.tabindex]="disabled() ? -1 : 0"
                  role="button"
                  [attr.aria-pressed]="on"
                  [attr.aria-label]="zone.label"
                  (click)="toggle(zone)"
                  (keydown.enter)="toggle(zone)"
                  (keydown.space)="$event.preventDefault(); toggle(zone)"
                  (mouseenter)="hover.set(zone.label)"
                  (mouseleave)="hover.set('')"
                  (focus)="hover.set(zone.label)"
                  (blur)="hover.set('')"
                >
                  <title>{{ zone.label }}</title>
                  @if (zone.shape.kind === 'ellipse') {
                    <ellipse [attr.cx]="zone.shape.cx" [attr.cy]="zone.shape.cy" [attr.rx]="zone.shape.rx" [attr.ry]="zone.shape.ry" />
                  } @else {
                    <rect [attr.x]="zone.shape.x" [attr.y]="zone.shape.y" [attr.width]="zone.shape.w" [attr.height]="zone.shape.h" [attr.rx]="zone.shape.r" />
                  }
                </g>
              }
            </svg>
          </figure>
        }
      </div>

      <p class="bm-hint" aria-live="polite">
        {{ hover() || (disabled() ? 'Zonas marcadas en la valoración' : 'Toque una zona del cuerpo para marcarla o desmarcarla') }}
      </p>

      <div class="bm-chips">
        @for (id of intake.zones; track id) {
          <span class="bm-chip">
            {{ label(id) }}
            @if (!disabled()) {
              <button type="button" (click)="remove(id)" [attr.aria-label]="'Quitar ' + label(id)">✕</button>
            }
          </span>
        } @empty {
          <span class="bm-empty">Sin zonas marcadas.</span>
        }
        @if (intake.zones.length > 1 && !disabled()) {
          <button type="button" class="bm-clear" (click)="clear()">Desmarcar todas</button>
        }
      </div>

      <label class="bm-notes">
        Observaciones de las zonas (lateralidad, irradiación, puntos gatillo…)
        <textarea rows="2" [value]="intake.zonesNotes" [readOnly]="disabled()" (input)="setNotes($any($event.target).value)"></textarea>
      </label>
    </div>
  `,
  styles: `
    .bm-views { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .bm-view { margin: 0; padding: 10px; border: 1px solid #d8e2ec; border-radius: 14px; background: #f7f9fc; text-align: center; }
    figcaption { font-weight: 600; color: #1b365d; margin-bottom: 4px; }
    svg { width: 100%; max-width: 230px; height: auto; touch-action: manipulation; }
    .bm-head { fill: #eef3f8; stroke: #b7c6d6; stroke-width: 1.2; }
    .bm-side { font-size: 10px; fill: #7a8ca0; }
    .bm-zone ellipse, .bm-zone rect { fill: #eef3f8; stroke: #a9bccf; stroke-width: 1.2; transition: fill .15s, stroke .15s; }
    .bm-zone:not(.locked) { cursor: pointer; }
    .bm-zone:not(.locked):hover ellipse, .bm-zone:not(.locked):hover rect,
    .bm-zone:focus-visible ellipse, .bm-zone:focus-visible rect { fill: #dbe6f3; stroke: #1b365d; }
    .bm-zone:focus { outline: none; }
    .bm-zone.on ellipse, .bm-zone.on rect { fill: #c59b27; stroke: #1b365d; stroke-width: 1.6; }
    .bm-hint { margin: 8px 0 4px; min-height: 1.2em; color: #1b365d; font-size: .85rem; text-align: center; }
    .bm-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0 10px; }
    .bm-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; border-radius: 999px; background: #fbf4e0; border: 1px solid #e6cf8f; color: #1b365d; font-size: .8rem; }
    .bm-chip button { border: none; background: transparent; color: #8a6a12; cursor: pointer; padding: 0 6px; font-size: .8rem; }
    .bm-empty { color: #7a8ca0; font-size: .85rem; }
    .bm-clear { border: 1px solid #c9d5e2; background: #fff; color: #1b365d; border-radius: 999px; padding: 3px 10px; font-size: .8rem; cursor: pointer; }
    .bm-notes { display: block; }
    .bm-notes textarea { width: 100%; }
    @media (max-width: 520px) { .bm-views { gap: 6px; } .bm-view { padding: 6px; } }
    @media print { .bm-zone.on ellipse, .bm-zone.on rect { fill: #c59b27 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .bm-clear, .bm-chip button { display: none; } }
  `,
})
export class PhysioBodyMap {
  readonly data = input.required<PhysiotherapyContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly views: Array<{ key: BodyView; label: string }> = [
    { key: 'ant', label: 'Vista anterior' },
    { key: 'post', label: 'Vista posterior' },
  ];
  readonly zones = BODY_ZONES;
  readonly hover = signal('');
  private readonly version = signal(0);

  readonly state = computed(() => {
    this.version();
    return ensureIntake(this.data());
  });
  readonly selected = computed(() => {
    this.version();
    return new Set(this.state().zones);
  });

  label(id: string) {
    return zoneLabel(id);
  }

  toggle(zone: BodyZone) {
    if (this.disabled()) return;
    const intake = this.state();
    intake.zones = intake.zones.includes(zone.id)
      ? intake.zones.filter((z) => z !== zone.id)
      : [...intake.zones, zone.id];
    this.commit();
  }

  remove(id: string) {
    const intake = this.state();
    intake.zones = intake.zones.filter((z) => z !== id);
    this.commit();
  }

  clear() {
    this.state().zones = [];
    this.commit();
  }

  setNotes(value: string) {
    this.state().zonesNotes = value;
    this.changed.emit();
  }

  private commit() {
    this.version.update((v) => v + 1);
    this.changed.emit();
  }
}
