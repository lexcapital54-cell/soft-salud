import { Component, computed, input, output, signal } from '@angular/core';
import { PhysiotherapyContent } from '../clinical.models';
import { BODY_DETAILS, BODY_HEAD, BODY_LABELS, BODY_OUTLINE, BODY_ZONES, BodyView, BodyZone, zoneLabel } from './physio-body-map.data';
import { ensureIntake } from './physio-intake.models';

let bodyMapSeq = 0;

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
            <svg [attr.viewBox]="view.box" role="group" [attr.aria-label]="'Mapa corporal, ' + view.label">
              <defs>
                <linearGradient [attr.id]="uid + view.key + '-skin'" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stop-color="#e9eff6" />
                  <stop offset=".5" stop-color="#ffffff" />
                  <stop offset="1" stop-color="#e9eff6" />
                </linearGradient>
                <clipPath [attr.id]="uid + view.key + '-clip'">
                  <path [attr.d]="outline" />
                  <ellipse [attr.cx]="head.cx" [attr.cy]="head.cy" [attr.rx]="head.rx" [attr.ry]="head.ry" />
                </clipPath>
              </defs>
              <g class="bm-figure" [attr.fill]="ref(view.key, 'skin')">
                <path [attr.d]="outline" />
                <ellipse [attr.cx]="head.cx" [attr.cy]="head.cy" [attr.rx]="head.rx" [attr.ry]="head.ry" />
              </g>
              <g [attr.clip-path]="ref(view.key, 'clip')">
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
              </g>
              <g class="bm-lines">
                <path [attr.d]="outline" class="bm-outline" />
                <ellipse class="bm-outline" [attr.cx]="head.cx" [attr.cy]="head.cy" [attr.rx]="head.rx" [attr.ry]="head.ry" />
                @for (d of details[view.key]; track $index) {
                  <path [attr.d]="d" class="bm-detail" />
                }
              </g>
              <g class="bm-labels">
                @for (l of labels[view.key]; track l.text) {
                  <line [attr.x1]="l.ax" [attr.y1]="l.ay" [attr.x2]="view.key === 'ant' ? -14 : 214" [attr.y2]="l.ly" />
                  <circle [attr.cx]="l.ax" [attr.cy]="l.ay" r="1.6" />
                  <text [attr.x]="view.key === 'ant' ? -17 : 217" [attr.y]="l.ly + 3" [attr.text-anchor]="view.key === 'ant' ? 'end' : 'start'">{{ l.text }}</text>
                }
              </g>
              <text class="bm-side" x="22" y="376">{{ view.key === 'ant' ? 'Der.' : 'Izq.' }}</text>
              <text class="bm-side" x="178" y="376" text-anchor="end">{{ view.key === 'ant' ? 'Izq.' : 'Der.' }}</text>
            </svg>
          </figure>
        }
      </div>

      <p class="bm-hint" aria-live="polite">
        @if (hover()) {
          <strong>{{ hover() }}</strong>
        } @else {
          <span aria-hidden="true">✎</span>
          {{ disabled() ? 'Zonas marcadas en la valoración' : 'Marque en la figura la(s) zona(s) a tratar' }}
        }
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
    .bm-view { margin: 0; padding: 12px 8px 6px; border: 1px solid #dbe3ee; border-radius: 16px; background: #fff; text-align: center; box-shadow: 0 1px 2px rgba(27, 54, 93, .06); }
    figcaption { font-weight: 700; color: #1b365d; font-size: .9rem; letter-spacing: .02em; margin-bottom: 2px; }
    svg { width: 100%; max-width: 320px; height: auto; touch-action: manipulation; overflow: visible; }
    .bm-figure path, .bm-figure ellipse { stroke: none; }
    .bm-outline { fill: none; stroke: #5d7390; stroke-width: 1.1; stroke-linejoin: round; }
    .bm-detail { fill: none; stroke: #9fb0c4; stroke-width: .8; stroke-linecap: round; }
    .bm-lines, .bm-labels { pointer-events: none; }
    .bm-labels line { stroke: #8296ad; stroke-width: .6; }
    .bm-labels circle { fill: #1b365d; }
    .bm-labels text { font-size: 8.5px; fill: #1b365d; font-weight: 500; }
    .bm-side { font-size: 8px; fill: #7a8ca0; letter-spacing: .04em; text-transform: uppercase; }
    .bm-zone ellipse, .bm-zone rect { fill: transparent; stroke: none; transition: fill .15s; }
    .bm-zone:not(.locked) { cursor: pointer; }
    .bm-zone:not(.locked):hover ellipse, .bm-zone:not(.locked):hover rect,
    .bm-zone:focus-visible ellipse, .bm-zone:focus-visible rect { fill: rgba(27, 54, 93, .14); }
    .bm-zone:focus { outline: none; }
    .bm-zone.on ellipse, .bm-zone.on rect { fill: rgba(197, 155, 39, .72); }
    .bm-zone.on:not(.locked):hover ellipse, .bm-zone.on:not(.locked):hover rect { fill: rgba(197, 155, 39, .9); }
    .bm-hint { margin: 10px 0 4px; min-height: 1.2em; color: #1b365d; font-size: .85rem; text-align: center; }
    .bm-hint span { color: #c59b27; margin-right: 4px; }
    .bm-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0 10px; }
    .bm-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; border-radius: 999px; background: #fbf4e0; border: 1px solid #e6cf8f; color: #1b365d; font-size: .8rem; }
    .bm-chip button { border: none; background: transparent; color: #8a6a12; cursor: pointer; padding: 0 6px; font-size: .8rem; }
    .bm-empty { color: #7a8ca0; font-size: .85rem; }
    .bm-clear { border: 1px solid #c9d5e2; background: #fff; color: #1b365d; border-radius: 999px; padding: 3px 10px; font-size: .8rem; cursor: pointer; }
    .bm-notes { display: block; }
    .bm-notes textarea { width: 100%; }
    @media (max-width: 520px) { .bm-views { gap: 6px; } .bm-view { padding: 6px; } }
    @media print { .bm-zone.on ellipse, .bm-zone.on rect { fill: rgba(197, 155, 39, .72) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .bm-clear, .bm-chip button { display: none; } }
  `,
})
export class PhysioBodyMap {
  readonly data = input.required<PhysiotherapyContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly views: Array<{ key: BodyView; label: string; box: string }> = [
    { key: 'ant', label: 'Vista anterior', box: '-84 0 284 382' },
    { key: 'post', label: 'Vista posterior', box: '0 0 284 382' },
  ];
  readonly zones = BODY_ZONES;
  readonly outline = BODY_OUTLINE;
  readonly head = BODY_HEAD;
  readonly details = BODY_DETAILS;
  readonly labels = BODY_LABELS;
  readonly uid = `bm${++bodyMapSeq}-`;

  /** URL absoluta: con `<base href>` un `url(#id)` relativo no resuelve en Safari/Firefox. */
  ref(view: BodyView, kind: 'skin' | 'clip') {
    return `url(${location.pathname}${location.search}#${this.uid}${view}-${kind})`;
  }
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
