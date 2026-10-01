import { NgTemplateOutlet } from '@angular/common';
import { Component, input, output, signal } from '@angular/core';
import { DentistryContent } from './dentistry.models';
import { EXCURSION_MIN, MANDIBULAR_PATHS, MAX_OPENING_REF, SideFlags, functionalHints } from './ortho-exam.models';
import { OrthoMmGauge } from './ortho-mm-gauge';

type Side = 'right' | 'left';
type TmjKey = 'tmjPain' | 'click' | 'crepitus';
type MuscleKey = 'temporal' | 'masseter' | 'pterygoid';
type Gauge = 'maxOpening' | 'lateralRight' | 'lateralLeft' | 'protrusion';

/** Lado derecho del paciente a la izquierda del dibujo (vista frontal). */
const SIDE_X: Record<Side, (x: number) => number> = { right: (x) => x, left: (x) => 200 - x };

const MUSCLE_SHAPES: Record<MuscleKey, { cx: number; cy: number; rx: number; ry: number; rot: number }> = {
  temporal: { cx: 60, cy: 64, rx: 12, ry: 21, rot: -16 },
  masseter: { cx: 63, cy: 146, rx: 11, ry: 21, rot: 14 },
  pterygoid: { cx: 76, cy: 128, rx: 8, ry: 14, rot: 22 },
};

/** Trayectorias de apertura dibujadas de arriba abajo en un cuadro de 20×26. */
const PATH_ICON: Record<string, string> = {
  Recta: 'M10,2 L10,24',
  'Desviación derecha': 'M10,2 Q1,13 10,24',
  'Desviación izquierda': 'M10,2 Q19,13 10,24',
  'Deflexión derecha': 'M10,2 Q10,15 3,24',
  'Deflexión izquierda': 'M10,2 Q10,15 17,24',
};

/** ATM y músculos con mapa facial: las articulaciones reflejan los hallazgos y los músculos se marcan tocándolos. */
@Component({
  selector: 'app-ortho-tmj-muscles',
  imports: [NgTemplateOutlet, OrthoMmGauge],
  template: `
    @let f = data().orthoExam.functional;
    <div class="tm">
      <section class="tm-card">
        <header>
          <h5>ATM</h5>
          <span class="tm-badge" [class.hit]="tmjCount() > 0">{{ tmjCount() ? tmjCount() + ' hallazgo(s)' : 'Sin hallazgos marcados' }}</span>
        </header>
        <div class="tm-body">
          <svg viewBox="0 0 200 232" class="tm-face" role="img" aria-label="Mapa de ATM">
            <ng-container *ngTemplateOutlet="face" />
            @for (s of sides; track s) {
              @let jx = SIDE_X[s](44);
              <g class="tm-joint" [class.hl]="hoverRow() !== null && f[hoverRow()!][s]">
                <circle [attr.cx]="jx" cy="106" r="9" class="tm-j" [class.pain]="f.tmjPain[s]" />
                @if (f.click[s]) {
                  <path [attr.d]="clickArcs(jx, s)" class="tm-click" />
                }
                @if (f.crepitus[s]) {
                  <circle [attr.cx]="jx - 3" cy="103" r="1.6" class="tm-crep" />
                  <circle [attr.cx]="jx + 3" cy="105" r="1.6" class="tm-crep" />
                  <circle [attr.cx]="jx" cy="110" r="1.6" class="tm-crep" />
                }
              </g>
            }
            @if (f.deviation && pathIcon(f.deviation)) {
              <path [attr.d]="pathIcon(f.deviation)" transform="translate(90 198)" class="tm-open" marker-end="url(#tm-arrow)" />
            }
          </svg>
          <div class="tm-rows">
            @for (row of tmjRows; track row.key) {
              <div class="tm-row" [class.hit]="f[row.key].right || f[row.key].left" (mouseenter)="hoverRow.set(row.key)" (mouseleave)="hoverRow.set(null)">
                <span><i class="tm-dot" [attr.data-kind]="row.key"></i>{{ row.label }}</span>
                <ng-container *ngTemplateOutlet="pills; context: { flags: f[row.key] }" />
              </div>
            }
            <span class="tm-sub">Trayectoria de apertura</span>
            <div class="tm-paths">
              @for (p of paths; track p) {
                <button type="button" [class.on]="f.deviation === p" [disabled]="disabled()" (click)="setPath(p)" [title]="p">
                  <svg viewBox="0 0 20 26" aria-hidden="true"><path [attr.d]="pathIcon(p)" /></svg>
                  <span>{{ p }}</span>
                </button>
              }
            </div>
          </div>
        </div>
        <div class="tm-gauges">
          <app-ortho-mm-gauge label="Apertura máxima" [value]="f.maxOpening" [max]="70" [stepSize]="1" [ref]="openingRef" [disabled]="disabled()" (valueChange)="setMm('maxOpening', $event)" />
          <app-ortho-mm-gauge label="Lateralidad derecha" [value]="f.lateralRight" [max]="15" [ref]="excursionRef" [disabled]="disabled()" (valueChange)="setMm('lateralRight', $event)" />
          <app-ortho-mm-gauge label="Lateralidad izquierda" [value]="f.lateralLeft" [max]="15" [ref]="excursionRef" [disabled]="disabled()" (valueChange)="setMm('lateralLeft', $event)" />
          <app-ortho-mm-gauge label="Protrusión" [value]="f.protrusion" [max]="15" [ref]="excursionRef" [disabled]="disabled()" (valueChange)="setMm('protrusion', $event)" />
        </div>
      </section>

      <section class="tm-card">
        <header>
          <h5>Músculos <small>dolor a la palpación</small></h5>
          <span class="tm-badge" [class.hit]="muscleCount() > 0">{{ muscleCount() ? muscleCount() + ' punto(s) dolorosos' : 'Sin dolor marcado' }}</span>
        </header>
        <div class="tm-body">
          <svg viewBox="0 0 200 232" class="tm-face" role="img" aria-label="Mapa de músculos masticatorios">
            <ng-container *ngTemplateOutlet="face" />
            @for (s of sides; track s) {
              @for (m of muscleRows; track m.key) {
                @let sh = shapes[m.key];
                <ellipse [attr.cx]="SIDE_X[s](sh.cx)" [attr.cy]="sh.cy" [attr.rx]="sh.rx" [attr.ry]="sh.ry"
                  [attr.transform]="'rotate(' + (s === 'right' ? sh.rot : -sh.rot) + ' ' + SIDE_X[s](sh.cx) + ' ' + sh.cy + ')'"
                  class="tm-m" [attr.data-key]="m.key" [class.on]="f[m.key][s]" [class.hl]="hoverMuscle() === m.key" [class.ro]="disabled()"
                  (click)="toggle(f[m.key], s)"><title>{{ m.label }} {{ s === 'right' ? 'derecho' : 'izquierdo' }}</title></ellipse>
              }
            }
          </svg>
          <div class="tm-rows">
            <p class="tm-help">Toque el músculo en el dibujo o use los botones. El pterigoideo es profundo (contorno punteado).</p>
            @for (m of muscleRows; track m.key) {
              <div class="tm-row" [class.hit]="f[m.key].right || f[m.key].left" (mouseenter)="hoverMuscle.set(m.key)" (mouseleave)="hoverMuscle.set(null)">
                <span><i class="tm-dot" [attr.data-kind]="m.key"></i>{{ m.label }}</span>
                <ng-container *ngTemplateOutlet="pills; context: { flags: f[m.key] }" />
              </div>
            }
            @if (!disabled()) {
              <button type="button" class="tm-clear" (click)="markNoFindings()">Sin hallazgos en ATM ni músculos</button>
            }
          </div>
        </div>
        @for (h of hints(); track h.text) {
          <p class="tm-hint" [attr.data-tone]="h.tone">{{ h.text }}</p>
        }
      </section>
    </div>

    <ng-template #face>
      <svg:defs>
        <svg:marker id="tm-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><svg:path d="M0,0 L10,5 L0,10 Z" fill="#12609a" /></svg:marker>
      </svg:defs>
      <svg:ellipse cx="34" cy="110" rx="7" ry="15" class="tm-ear" />
      <svg:ellipse cx="166" cy="110" rx="7" ry="15" class="tm-ear" />
      <svg:ellipse cx="100" cy="110" rx="64" ry="90" class="tm-head" />
      <svg:path d="M64,84 q10,-6 20,0 M116,84 q10,-6 20,0" class="tm-feat" />
      <svg:path d="M100,96 L94,134 Q100,138 106,134" class="tm-feat" />
      <svg:path d="M82,160 Q100,168 118,160" class="tm-feat lips" />
      <svg:text x="6" y="228" class="tm-side">Der.</svg:text>
      <svg:text x="194" y="228" text-anchor="end" class="tm-side">Izq.</svg:text>
    </ng-template>

    <ng-template #pills let-flags="flags">
      <div class="tm-pills">
        <button type="button" [class.on]="flags.right" [disabled]="disabled()" (click)="toggle(flags, 'right')">Der.</button>
        <button type="button" [class.on]="flags.left" [disabled]="disabled()" (click)="toggle(flags, 'left')">Izq.</button>
      </div>
    </ng-template>
  `,
  styleUrl: './ortho-tmj-muscles.scss',
})
export class OrthoTmjMuscles {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly SIDE_X = SIDE_X;
  readonly shapes = MUSCLE_SHAPES;
  readonly sides: Side[] = ['right', 'left'];
  readonly paths = MANDIBULAR_PATHS;
  readonly openingRef = MAX_OPENING_REF;
  readonly excursionRef: [number, number] = [EXCURSION_MIN, Infinity];
  readonly hoverRow = signal<TmjKey | null>(null);
  readonly hoverMuscle = signal<MuscleKey | null>(null);
  readonly tmjRows: Array<{ key: TmjKey; label: string }> = [
    { key: 'tmjPain', label: 'Dolor articular' },
    { key: 'click', label: 'Click' },
    { key: 'crepitus', label: 'Crepitación' },
  ];
  readonly muscleRows: Array<{ key: MuscleKey; label: string }> = [
    { key: 'temporal', label: 'Temporal' },
    { key: 'masseter', label: 'Masetero' },
    { key: 'pterygoid', label: 'Pterigoideos' },
  ];

  private count(keys: Array<TmjKey | MuscleKey>) {
    const f = this.data().orthoExam.functional;
    return keys.reduce((n, k) => n + (f[k].right ? 1 : 0) + (f[k].left ? 1 : 0), 0);
  }

  tmjCount() {
    return this.count(this.tmjRows.map((r) => r.key));
  }

  muscleCount() {
    return this.count(this.muscleRows.map((r) => r.key));
  }

  hints() {
    return functionalHints(this.data().orthoExam.functional);
  }

  pathIcon(p: string) {
    return PATH_ICON[p] ?? '';
  }

  clickArcs(x: number, side: Side) {
    const d = side === 'right' ? -1 : 1;
    return `M${x + d * 12},98 q${d * 5},8 0,16 M${x + d * 17},94 q${d * 7},12 0,24`;
  }

  toggle(flags: SideFlags, side: Side) {
    if (this.disabled()) return;
    flags[side] = !flags[side];
    this.changed.emit();
  }

  setPath(p: string) {
    if (this.disabled()) return;
    const f = this.data().orthoExam.functional;
    f.deviation = f.deviation === p ? '' : p;
    this.changed.emit();
  }

  setMm(key: Gauge, value: string) {
    if (this.disabled()) return;
    this.data().orthoExam.functional[key] = value;
    this.changed.emit();
  }

  markNoFindings() {
    const f = this.data().orthoExam.functional;
    for (const k of ['tmjPain', 'click', 'crepitus', 'temporal', 'masseter', 'pterygoid'] as const) f[k] = { right: false, left: false };
    if (!f.deviation) f.deviation = 'Recta';
    this.changed.emit();
  }
}
