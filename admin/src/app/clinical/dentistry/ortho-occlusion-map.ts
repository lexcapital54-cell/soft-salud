import { Component, ElementRef, ViewChild, input, output, signal } from '@angular/core';
import { DentistryContent } from './dentistry.models';
import { checkMeasure, parseMeasure } from './ortho-measures';

type Intraoral = DentistryContent['orthodontics']['intraoral'];
type Side = 'right' | 'left';
type Relation = 'molar' | 'canine';
type AngleClass = 'Clase I' | 'Clase II' | 'Clase III';

const FIELD: Record<Side, Record<Relation, keyof Intraoral>> = {
  right: { molar: 'molarRight', canine: 'canineRight' },
  left: { molar: 'molarLeft', canine: 'canineLeft' },
};

/** Ancho del lienzo lateral; el diseño se calcula de anterior (x=0) a posterior y se refleja en el lado derecho. */
const W = 300;
const LOWER_TOP = 110;
const LOWER_BOTTOM = 156;
const UPPER_TOP = 50;
const UPPER_EDGE = 104;

/** Dientes inferiores (vista vestibular), de anterior a posterior. */
const LOWER_TEETH = [
  { id: 'li', from: 8, to: 38, cusps: 1, label: 'Incisivo lateral' },
  { id: 'c', from: 38, to: 84, cusps: 1, pointed: true, label: 'Canino' },
  { id: 'pm1', from: 84, to: 126, cusps: 1, label: '1.er premolar' },
  { id: 'pm2', from: 126, to: 168, cusps: 1, label: '2.º premolar' },
  { id: 'm1', from: 168, to: 242, cusps: 3, label: '1.er molar' },
  { id: 'm2', from: 242, to: 292, cusps: 2, label: '2.º molar' },
];

/** Surco vestibular del primer molar inferior y tronera canino / primer premolar. */
const MOLAR_GROOVE = 199;
const CANINE_EMBRASURE = 84;
const MOLAR_SHIFT = 26;
const CANINE_SHIFT = 22;

const ZONES: Record<Relation, Array<{ cls: AngleClass; center: number; half: number; hint: string }>> = {
  molar: [
    { cls: 'Clase II', center: MOLAR_GROOVE - MOLAR_SHIFT, half: 13, hint: 'Cúspide MV superior por delante del surco (mesial)' },
    { cls: 'Clase I', center: MOLAR_GROOVE, half: 13, hint: 'Cúspide MV superior en el surco vestibular del molar inferior' },
    { cls: 'Clase III', center: MOLAR_GROOVE + MOLAR_SHIFT, half: 13, hint: 'Cúspide MV superior por detrás del surco (distal)' },
  ],
  canine: [
    { cls: 'Clase II', center: CANINE_EMBRASURE - CANINE_SHIFT, half: 11, hint: 'Canino superior por delante de la tronera (sobre el canino inferior)' },
    { cls: 'Clase I', center: CANINE_EMBRASURE, half: 11, hint: 'Canino superior en la tronera canino / primer premolar inferior' },
    { cls: 'Clase III', center: CANINE_EMBRASURE + CANINE_SHIFT, half: 11, hint: 'Canino superior por detrás de la tronera (sobre el premolar)' },
  ],
};

const OFFSET: Record<AngleClass, number> = { 'Clase I': 0, 'Clase II': -1, 'Clase III': 1 };

/** Corona vista por vestibular; `dir` = 1 cúspides hacia arriba (inferior), −1 hacia abajo (superior). */
function crownPath(from: number, to: number, cusps: number, edge: number, base: number, dir: 1 | -1, pointed = false) {
  const w = to - from;
  const rise = pointed ? 12 : 7;
  let d = `M ${from + 2} ${base} L ${from} ${edge + dir * 8}`;
  for (let i = 0; i < cusps; i++) {
    const a = from + (w * i) / cusps;
    const b = from + (w * (i + 1)) / cusps;
    const mid = (a + b) / 2;
    d += pointed
      ? ` L ${mid} ${edge - dir * rise} L ${b} ${edge + dir * 8}`
      : ` Q ${mid} ${edge - dir * rise * 2} ${b} ${edge + dir * (i === cusps - 1 ? 8 : 3)}`;
  }
  return `${d} L ${to - 2} ${base} Z`;
}

/** Diagrama sagital de incisivos: escala y posición del borde incisal inferior. */
const S = 10;
const LX = 118;
const LY = 118;
const INC_RANGE: Record<'overjet' | 'overbite', [number, number]> = { overjet: [-6, 12], overbite: [-6, 9] };
const DEFAULT_CROWN = 9;

/** Vista frontal transversal: centro facial y px por mm de desviación de línea media. */
const FACIAL_X = 170;
const MID_S = 4;
type CrossSide = 'Derecha' | 'Izquierda';
type MidlineField = 'upperMidline' | 'lowerMidline';

function toNum(raw: string | null | undefined): number | null {
  const text = (raw || '').trim().replace(',', '.');
  if (!text) return null;
  const v = Number(text);
  return Number.isFinite(v) ? v : null;
}

function fmtMm(v: number) {
  return String(Object.is(v, -0) ? 0 : v).replace('.', ',');
}

@Component({
  selector: 'app-ortho-occlusion-map',
  standalone: true,
  template: `
    <div class="occ">
      <div class="occ-sides">
        @for (side of sides; track side.key) {
          <figure class="occ-side">
            <figcaption>
              <strong>Lado {{ side.label }}</strong>
              @for (rel of relations; track rel) {
                <span class="occ-seg-row">
                  {{ rel === 'molar' ? 'Molar' : 'Canino' }}
                  <span class="occ-seg" role="group" [attr.aria-label]="(rel === 'molar' ? 'Clase molar ' : 'Clase canina ') + side.label">
                    @for (c of classes; track c) {
                      <button type="button" [attr.data-cls]="c" [class.on]="value(side.key, rel) === c" [disabled]="disabled()" (click)="pick(side.key, rel, c)">
                        {{ c.replace('Clase ', '') }}
                      </button>
                    }
                  </span>
                  @if (value(side.key, rel) === 'No evaluable') {
                    <em>No evaluable</em>
                  }
                </span>
              }
            </figcaption>
            <svg [attr.viewBox]="'0 0 ' + W + ' 176'" class="occ-svg" role="group" [attr.aria-label]="'Oclusión lado ' + side.label">
              <rect x="0" y="0" [attr.width]="W" height="176" class="occ-bg" />
              <path [attr.d]="gum(LOWER_BOTTOM - 10, 1)" class="occ-gum" />
              <path [attr.d]="gum(UPPER_TOP + 10, -1)" class="occ-gum" />
              <text class="occ-dir" [attr.x]="side.key === 'right' ? W - 6 : 6" y="14" [attr.text-anchor]="side.key === 'right' ? 'end' : 'start'">
                {{ side.key === 'right' ? 'anterior →' : '← anterior' }}
              </text>

              @for (t of lowerTeeth(side.key); track t.id) {
                <path [attr.d]="t.d" class="occ-tooth lower" [class.key]="t.id === 'm1' || t.id === 'c'" />
              }
              <line [attr.x1]="mx(side.key, MOLAR_GROOVE)" [attr.x2]="mx(side.key, MOLAR_GROOVE)" [attr.y1]="LOWER_TOP - 2" [attr.y2]="LOWER_TOP + 26" class="occ-groove" />

              @for (u of upperTeeth(side.key); track u.id) {
                <path [attr.d]="u.d" class="occ-tooth upper" [class.ghost]="u.ghost" [class.key]="u.key" />
              }
              @for (m of markers(side.key); track m.id) {
                <g class="occ-marker" [style.transform]="'translateX(' + m.x + 'px)'" [class.ghost]="m.ghost">
                  <circle cx="0" [attr.cy]="UPPER_EDGE + 4" r="4.5" />
                </g>
              }

              @for (rel of relations; track rel) {
                @for (z of zones(side.key, rel); track z.cls) {
                  <g
                    class="occ-zone"
                    [class.on]="value(side.key, rel) === z.cls"
                    [class.off]="disabled()"
                    [attr.role]="disabled() ? null : 'button'"
                    [attr.tabindex]="disabled() ? null : 0"
                    [attr.aria-label]="(rel === 'molar' ? 'Molar ' : 'Canino ') + side.label + ': ' + z.cls"
                    (click)="pick(side.key, rel, z.cls)"
                    (keydown.enter)="pick(side.key, rel, z.cls)"
                    (keydown.space)="$event.preventDefault(); pick(side.key, rel, z.cls)"
                  >
                    <title>{{ z.cls }} — {{ z.hint }}</title>
                    <rect [attr.x]="z.x - z.half" [attr.y]="LOWER_TOP - 14" [attr.width]="z.half * 2" height="32" rx="6" />
                    <circle [attr.cx]="z.x" [attr.cy]="LOWER_TOP + 1" r="3.2" class="occ-dot" />
                    <text [attr.x]="z.x" [attr.y]="LOWER_TOP + 30" text-anchor="middle">{{ z.short }}</text>
                  </g>
                }
              }
            </svg>
            @if (!disabled()) {
              <div class="occ-foot">
                @for (rel of relations; track rel) {
                  <button type="button" class="linkish" (click)="pick(side.key, rel, 'No evaluable')">
                    {{ rel === 'molar' ? 'Molar' : 'Canino' }} no evaluable
                  </button>
                }
              </div>
            }
          </figure>
        }
      </div>
      <p class="occ-help">
        Haga clic en la cúspide, surco o tronera del diente inferior donde ocluye la cúspide mesiovestibular del primer molar
        superior (molar) o la cúspide del canino superior (canino). La clase de Angle se registra sola.
      </p>

      <figure class="occ-inc">
        <figcaption>
          <strong>Overjet y overbite</strong>
          <span>Arrastre el borde incisal superior (punto rosado). Cuadrícula de 1 mm.</span>
        </figcaption>
        <div class="occ-inc-body">
          <svg
            #inc
            viewBox="0 0 260 230"
            class="occ-inc-svg"
            (pointermove)="onIncMove($event)"
            (pointerup)="onIncUp()"
            (pointercancel)="onIncUp()"
          >
            <defs>
              <pattern id="occ-grid" [attr.width]="S" [attr.height]="S" patternUnits="userSpaceOnUse" [attr.x]="LX" [attr.y]="LY">
                <path [attr.d]="'M ' + S + ' 0 L 0 0 0 ' + S" class="occ-grid-line" />
              </pattern>
            </defs>
            <rect x="0" y="0" width="260" height="230" fill="url(#occ-grid)" />
            <text x="8" y="16" class="occ-dir">vestibular →</text>
            <path [attr.d]="lowerIncisor" class="occ-inc-tooth lower" />
            <path [attr.d]="upperIncisor()" class="occ-inc-tooth upper" [class.ghost]="incGhost()" />
            @let e = incEdge();
            <line [attr.x1]="LX" [attr.y1]="LY - 22" [attr.x2]="e.x" [attr.y2]="LY - 22" class="occ-dim oj" />
            <line [attr.x1]="LX" [attr.y1]="LY - 28" [attr.x2]="LX" [attr.y2]="LY" class="occ-dim-tick" />
            <line [attr.x1]="e.x" [attr.y1]="LY - 28" [attr.x2]="e.x" [attr.y2]="e.y" class="occ-dim-tick" />
            <text [attr.x]="(LX + e.x) / 2" [attr.y]="LY - 27" text-anchor="middle" class="occ-dim-lbl oj">OJ {{ ojText() }} mm</text>
            <line [attr.x1]="e.x + 22" [attr.y1]="LY" [attr.x2]="e.x + 22" [attr.y2]="e.y" class="occ-dim ob" />
            <line [attr.x1]="LX" [attr.y1]="LY" [attr.x2]="e.x + 28" [attr.y2]="LY" class="occ-dim-tick" />
            <text [attr.x]="e.x + 27" [attr.y]="(LY + e.y) / 2 + 4" class="occ-dim-lbl ob">OB {{ obText() }} mm</text>
            <circle
              [attr.cx]="e.x"
              [attr.cy]="e.y"
              r="7"
              class="occ-handle"
              [class.off]="disabled()"
              (pointerdown)="onIncDown($event)"
            />
          </svg>
          <div class="occ-inc-values">
            @for (m of incMeasures(); track m.label) {
              <div class="occ-val" [attr.data-state]="m.state">
                <span class="lbl">{{ m.label }}</span>
                <span class="num">{{ m.text }}</span>
                <span class="msg">{{ m.message }}</span>
                <label [class]="'occ-range ' + m.key">
                  <input
                    type="range"
                    [min]="m.min"
                    [max]="m.max"
                    step="0.5"
                    [value]="m.slider"
                    [disabled]="disabled()"
                    [attr.aria-label]="m.label + ' en milímetros'"
                    (input)="setIncMeasure(m.key, $any($event.target).value)"
                    (change)="changed.emit()"
                  />
                  <span class="occ-range-scale"><i>{{ m.min }} mm</i><i>{{ m.max }} mm</i></span>
                </label>
              </div>
            }
            @let pct = overbitePercent();
            <div class="occ-pct">
              <span>
                Overbite en porcentaje:
                <b>{{ pct === null ? '—' : pct + ' %' }}</b>
                de la corona del incisivo inferior
              </span>
              <label>
                Altura corona inferior
                <input
                  type="text"
                  inputmode="decimal"
                  [value]="intraoral().lowerCrownHeight"
                  [placeholder]="DEFAULT_CROWN + ''"
                  [readonly]="disabled()"
                  (input)="setCrownHeight($any($event.target).value)"
                  (change)="changed.emit()"
                />
                mm
              </label>
            </div>
          </div>
        </div>
      </figure>

      <figure class="occ-trans">
        <figcaption>
          <strong>Análisis transversal</strong>
          <span>Vista frontal. Haga clic en los molares de un lado para marcar mordida cruzada posterior; mueva los controles para ubicar las líneas medias.</span>
        </figcaption>
        <div class="occ-trans-body">
          <svg viewBox="0 0 340 170" class="occ-trans-svg" role="group" aria-label="Análisis transversal, vista frontal">
            <rect x="0" y="0" width="340" height="170" class="occ-bg" />
            <text x="8" y="14" class="occ-dir">derecha del paciente</text>
            <text x="332" y="14" class="occ-dir" text-anchor="end">izquierda del paciente</text>
            <line x1="170" y1="18" x2="170" y2="160" class="occ-facial" />
            <text x="174" y="164" class="occ-dir">línea media facial</text>
            @for (t of frontTeeth(); track t.id) {
              <rect [attr.x]="t.x" [attr.y]="t.y" [attr.width]="t.w" [attr.height]="t.h" [attr.rx]="t.rx" class="occ-ft" [class.upper]="t.upper" />
            }
            @let um = midlineX('upperMidline');
            @let lm = midlineX('lowerMidline');
            <line [attr.x1]="um" y1="34" [attr.x2]="um" y2="86" class="occ-mid upper" />
            <line [attr.x1]="lm" y1="84" [attr.x2]="lm" y2="136" class="occ-mid lower" />
            @for (s of crossSides; track s.key) {
              @let crossed = isCrossed(s.key);
              <g
                class="occ-molars"
                [class.crossed]="crossed"
                [class.off]="disabled()"
                [attr.role]="disabled() ? null : 'button'"
                [attr.tabindex]="disabled() ? null : 0"
                [attr.aria-pressed]="crossed"
                [attr.aria-label]="'Mordida cruzada posterior ' + s.label"
                (click)="toggleCross(s.key)"
                (keydown.enter)="toggleCross(s.key)"
                (keydown.space)="$event.preventDefault(); toggleCross(s.key)"
              >
                <title>{{ crossed ? 'Mordida cruzada posterior ' + s.label + ' (clic para quitar)' : 'Clic para marcar mordida cruzada posterior ' + s.label }}</title>
                <rect [attr.x]="s.cx - 36" y="30" width="72" height="110" rx="10" class="occ-molars-hit" />
                <path [attr.d]="molarPath(s.cx, s.outward, true, crossed)" class="occ-ft upper molar" />
                <path [attr.d]="molarPath(s.cx, s.outward, false, crossed)" class="occ-ft molar" />
                <text [attr.x]="s.cx" y="156" text-anchor="middle" class="occ-molars-lbl">{{ crossed ? 'Cruzada' : 'Normal' }}</text>
              </g>
            }
          </svg>
          <div class="occ-trans-values">
            <div class="occ-val" [attr.data-state]="crossState()">
              <span class="lbl">Mordida cruzada posterior</span>
              <span class="num small">{{ crossText() }}</span>
            </div>
            @for (m of midlines; track m.key) {
              <div class="occ-val" [attr.data-state]="midlineNum(m.key) === null ? 'empty' : midlineNum(m.key) === 0 ? 'ok' : 'out'">
                <span class="lbl">{{ m.label }}</span>
                <span class="num small">{{ midlineText(m.key) }}</span>
                <label [class]="'occ-range ' + m.cls">
                  <input
                    type="range"
                    min="-6"
                    max="6"
                    step="0.5"
                    [value]="-(midlineNum(m.key) ?? 0)"
                    [disabled]="disabled()"
                    [attr.aria-label]="m.label + ' en milímetros'"
                    (input)="setMidline(m.key, $any($event.target).value)"
                    (change)="changed.emit()"
                  />
                  <span class="occ-range-scale"><i>6 mm der.</i><i>centrada</i><i>6 mm izq.</i></span>
                </label>
              </div>
            }
            @if (midlineGap() !== null) {
              <p class="occ-help">Discrepancia entre líneas medias superior e inferior: <b>{{ midlineGap() }} mm</b>.</p>
            }
          </div>
        </div>
      </figure>
    </div>
  `,
  styles: `
    :host { display: block; }
    .occ { display: flex; flex-direction: column; gap: 10px; }
    .occ-sides { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    @media (max-width: 900px) { .occ-sides { grid-template-columns: 1fr; } }
    .occ-side, .occ-inc { margin: 0; border: 1px solid #dbe4ea; border-radius: 12px; background: #fff; padding: 10px; }
    figcaption { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; font-size: 0.82rem; color: #475569; margin-bottom: 6px; }
    figcaption strong { color: #0f172a; font-size: 0.88rem; }
    figcaption b { color: #0f172a; }
    figcaption b[data-cls='Clase II'] { color: #c2410c; }
    figcaption b[data-cls='Clase III'] { color: #6d28d9; }
    figcaption b[data-cls='Clase I'] { color: #15803d; }
    .occ-svg { width: 100%; height: auto; display: block; border-radius: 10px; }
    .occ-bg { fill: #f8fafc; }
    .occ-gum { fill: #f9c6c6; opacity: 0.7; }
    .occ-dir { font: 600 9px system-ui, sans-serif; fill: #94a3b8; }
    .occ-tooth { stroke: #94a3b8; stroke-width: 1.2; stroke-linejoin: round; }
    .occ-tooth.lower { fill: #ffffff; }
    .occ-tooth.upper { fill: #f1f5f9; opacity: 0.93; transition: d 0.35s ease; }
    .occ-tooth.key { stroke: #0f766e; stroke-width: 1.6; }
    .occ-tooth.upper.key { fill: #e0f2f1; }
    .occ-tooth.ghost { opacity: 0.35; stroke-dasharray: 3 3; }
    .occ-groove { stroke: #0f766e; stroke-width: 1.2; stroke-dasharray: 2 2; }
    .occ-marker { transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
    .occ-marker circle { fill: #db2777; stroke: #fff; stroke-width: 1.5; }
    .occ-marker.ghost circle { fill: #cbd5e1; }
    .occ-zone { cursor: pointer; outline: none; }
    .occ-zone rect { fill: transparent; stroke: transparent; transition: fill 0.15s, stroke 0.15s; }
    .occ-zone:hover rect, .occ-zone:focus-visible rect { fill: rgba(14, 165, 233, 0.12); stroke: #38bdf8; }
    .occ-zone.on rect { fill: rgba(219, 39, 119, 0.12); stroke: #db2777; }
    .occ-zone .occ-dot { fill: #cbd5e1; }
    .occ-zone:hover .occ-dot { fill: #0ea5e9; }
    .occ-zone.on .occ-dot { fill: #db2777; }
    .occ-zone text { font: 700 8px system-ui, sans-serif; fill: #94a3b8; opacity: 0; transition: opacity 0.15s; }
    .occ-zone:hover text, .occ-zone.on text, .occ-zone:focus-visible text { opacity: 1; fill: #334155; }
    .occ-zone.off { cursor: default; pointer-events: none; }
    .occ-foot { display: flex; gap: 14px; margin-top: 4px; }
    .occ-help { margin: 0; font-size: 0.78rem; color: #64748b; }
    .linkish { border: 0; background: none; padding: 0; color: #00798c; font: inherit; font-size: 0.76rem; font-weight: 600; text-decoration: underline; cursor: pointer; }
    .occ-inc-body { display: grid; grid-template-columns: minmax(220px, 320px) 1fr; gap: 14px; align-items: center; }
    @media (max-width: 700px) { .occ-inc-body { grid-template-columns: 1fr; } }
    .occ-inc-svg { width: 100%; height: auto; display: block; background: #f8fafc; border-radius: 10px; touch-action: none; }
    .occ-grid-line { fill: none; stroke: #e2e8f0; stroke-width: 0.6; }
    .occ-inc-tooth { stroke: #64748b; stroke-width: 1.3; stroke-linejoin: round; }
    .occ-inc-tooth.lower { fill: #fff; }
    .occ-inc-tooth.upper { fill: #e0f2f1; opacity: 0.92; }
    .occ-inc-tooth.ghost { opacity: 0.4; stroke-dasharray: 3 3; }
    .occ-dim { stroke-width: 1.4; }
    .occ-dim.oj { stroke: #0284c7; }
    .occ-dim.ob { stroke: #7c3aed; }
    .occ-dim-tick { stroke: #94a3b8; stroke-width: 0.8; stroke-dasharray: 2 2; }
    .occ-dim-lbl { font: 700 10px system-ui, sans-serif; }
    .occ-dim-lbl.oj { fill: #0369a1; }
    .occ-dim-lbl.ob { fill: #6d28d9; }
    .occ-handle { fill: #db2777; stroke: #fff; stroke-width: 2; cursor: grab; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3)); }
    .occ-handle.off { cursor: default; pointer-events: none; }
    .occ-inc-values { display: grid; gap: 8px; }
    .occ-val { display: grid; grid-template-columns: 80px 70px 1fr; gap: 8px; align-items: baseline; padding: 8px 10px; border-radius: 10px; border: 1px solid #e2e8f0; border-left: 4px solid #cbd5e1; }
    .occ-val[data-state='ok'] { border-left-color: #22c55e; }
    .occ-val[data-state='out'] { border-left-color: #f59e0b; }
    .occ-val[data-state='invalid'] { border-left-color: #ef4444; }
    .occ-val .lbl { font-size: 0.75rem; font-weight: 800; color: #334155; text-transform: uppercase; }
    .occ-val .num { font-size: 1.2rem; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; }
    .occ-val .msg { font-size: 0.78rem; color: #475569; }
    .occ-val .num.small { font-size: 0.95rem; }
    .occ-seg-row { display: inline-flex; align-items: center; gap: 6px; }
    .occ-seg-row em { font-style: normal; font-size: 0.72rem; color: #64748b; }
    .occ-seg { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #fff; }
    .occ-seg button { border: 0; border-right: 1px solid #e2e8f0; background: none; padding: 3px 9px; font: inherit; font-size: 0.74rem; font-weight: 700; color: #475569; cursor: pointer; transition: background 0.15s, color 0.15s; }
    .occ-seg button:last-child { border-right: 0; }
    .occ-seg button:hover:not(:disabled):not(.on) { background: #f1f5f9; }
    .occ-seg button:disabled { cursor: default; }
    .occ-seg button.on[data-cls='Clase I'] { background: #dcfce7; color: #15803d; }
    .occ-seg button.on[data-cls='Clase II'] { background: #ffedd5; color: #c2410c; }
    .occ-seg button.on[data-cls='Clase III'] { background: #ede9fe; color: #6d28d9; }
    .occ-range { grid-column: 1 / -1; display: grid; gap: 2px; margin-top: 2px; }
    .occ-range input { width: 100%; margin: 0; cursor: pointer; accent-color: #0284c7; }
    .occ-range.overbite input, .occ-range.lower input { accent-color: #7c3aed; }
    .occ-range input:disabled { cursor: default; }
    .occ-range-scale { display: flex; justify-content: space-between; font-size: 0.68rem; color: #94a3b8; }
    .occ-range-scale i { font-style: normal; }
    .occ-pct { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; padding: 8px 10px; border-radius: 10px; background: #f8fafc; font-size: 0.8rem; color: #475569; }
    .occ-pct b { color: #6d28d9; font-size: 0.95rem; }
    .occ-pct label { display: inline-flex; align-items: center; gap: 6px; font-size: 0.76rem; }
    .occ-pct input { width: 52px; padding: 3px 6px; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; text-align: center; }
    .occ-trans { margin: 0; border: 1px solid #dbe4ea; border-radius: 12px; background: #fff; padding: 10px; }
    .occ-trans-body { display: grid; grid-template-columns: minmax(260px, 420px) 1fr; gap: 14px; align-items: center; }
    @media (max-width: 760px) { .occ-trans-body { grid-template-columns: 1fr; } }
    .occ-trans-svg { width: 100%; height: auto; display: block; border-radius: 10px; }
    .occ-trans-values { display: grid; gap: 8px; }
    .occ-trans-values .occ-val { grid-template-columns: 1fr auto; }
    .occ-facial { stroke: #f472b6; stroke-width: 1.2; stroke-dasharray: 4 3; }
    .occ-ft { fill: #fff; stroke: #94a3b8; stroke-width: 1.1; }
    .occ-ft.upper { fill: #f1f5f9; }
    .occ-ft.molar { transition: d 0.3s ease; }
    .occ-mid { stroke-width: 2.4; stroke-linecap: round; transition: x1 0.2s, x2 0.2s; }
    .occ-mid.upper { stroke: #0284c7; }
    .occ-mid.lower { stroke: #7c3aed; }
    .occ-molars { cursor: pointer; outline: none; }
    .occ-molars-hit { fill: transparent; stroke: transparent; transition: fill 0.15s, stroke 0.15s; }
    .occ-molars:hover .occ-molars-hit, .occ-molars:focus-visible .occ-molars-hit { fill: rgba(14, 165, 233, 0.08); stroke: #38bdf8; }
    .occ-molars.crossed .occ-molars-hit { fill: rgba(220, 38, 38, 0.07); stroke: #f87171; }
    .occ-molars.crossed .occ-ft.upper { fill: #fee2e2; stroke: #dc2626; }
    .occ-molars.off { cursor: default; pointer-events: none; }
    .occ-molars-lbl { font: 700 9px system-ui, sans-serif; fill: #64748b; }
    .occ-molars.crossed .occ-molars-lbl { fill: #b91c1c; }
  `,
})
export class OrthoOcclusionMapComponent {
  readonly intraoral = input.required<Intraoral>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  @ViewChild('inc') private incRef?: ElementRef<SVGSVGElement>;

  readonly W = W;
  readonly LOWER_TOP = LOWER_TOP;
  readonly LOWER_BOTTOM = LOWER_BOTTOM;
  readonly UPPER_TOP = UPPER_TOP;
  readonly UPPER_EDGE = UPPER_EDGE;
  readonly MOLAR_GROOVE = MOLAR_GROOVE;
  readonly S = S;
  readonly LX = LX;
  readonly LY = LY;

  readonly sides: Array<{ key: Side; label: string }> = [
    { key: 'right', label: 'derecho' },
    { key: 'left', label: 'izquierdo' },
  ];
  readonly relations: Relation[] = ['molar', 'canine'];

  private readonly tick = signal(0);
  private draggingInc = false;

  /** Encía festoneada: `dir` 1 debajo de los dientes inferiores, −1 encima de los superiores. */
  gum(y: number, dir: 1 | -1) {
    const edge = y + dir * 24;
    let d = `M 0 ${edge} L 0 ${y}`;
    for (let x = 0; x < W; x += 21) d += ` Q ${x + 10.5} ${y - dir * 7} ${x + 21} ${y}`;
    return `${d} L ${W} ${edge} Z`;
  }

  /** x en pantalla: el lado derecho se ve con el sector anterior a la derecha. */
  mx(side: Side, x: number) {
    return side === 'right' ? W - x : x;
  }

  value(side: Side, rel: Relation): string {
    this.tick();
    return this.intraoral()[FIELD[side][rel]] || '';
  }

  private classOf(side: Side, rel: Relation): AngleClass | null {
    const v = this.value(side, rel);
    return v === 'Clase I' || v === 'Clase II' || v === 'Clase III' ? v : null;
  }

  lowerTeeth(side: Side) {
    return LOWER_TEETH.map((t) => {
      const a = this.mx(side, t.from);
      const b = this.mx(side, t.to);
      return { id: t.id, d: crownPath(Math.min(a, b), Math.max(a, b), t.cusps, LOWER_TOP, LOWER_BOTTOM, 1, !!t.pointed) };
    });
  }

  /** Canino y primer molar superiores según la clase registrada; los premolares ocupan el espacio entre ambos. */
  upperTeeth(side: Side) {
    const cc = this.classOf(side, 'canine');
    const mc = this.classOf(side, 'molar');
    const cusp = CANINE_EMBRASURE + OFFSET[cc ?? 'Clase I'] * CANINE_SHIFT;
    const mb = MOLAR_GROOVE + OFFSET[mc ?? 'Clase I'] * MOLAR_SHIFT;
    const teeth = [
      { id: 'u-li', from: cusp - 58, to: cusp - 24, cusps: 1, key: false, ghost: false, pointed: false },
      { id: 'u-c', from: cusp - 24, to: cusp + 24, cusps: 1, key: true, ghost: !cc, pointed: true },
    ];
    const pmFrom = cusp + 24;
    const molarFrom = mb - 20;
    const pmW = (molarFrom - pmFrom) / 2;
    teeth.push(
      { id: 'u-pm1', from: pmFrom, to: pmFrom + pmW, cusps: 1, key: false, ghost: false, pointed: false },
      { id: 'u-pm2', from: pmFrom + pmW, to: molarFrom, cusps: 1, key: false, ghost: false, pointed: false },
      { id: 'u-m1', from: molarFrom, to: molarFrom + 68, cusps: 2, key: true, ghost: !mc, pointed: false },
      { id: 'u-m2', from: molarFrom + 68, to: molarFrom + 118, cusps: 2, key: false, ghost: false, pointed: false },
    );
    return teeth.map((t) => {
      const a = this.mx(side, t.from);
      const b = this.mx(side, t.to);
      return { id: t.id, key: t.key, ghost: t.ghost, d: crownPath(Math.min(a, b), Math.max(a, b), t.cusps, UPPER_EDGE, UPPER_TOP, -1, t.pointed) };
    });
  }

  markers(side: Side) {
    const cc = this.classOf(side, 'canine');
    const mc = this.classOf(side, 'molar');
    return [
      { id: 'c', x: this.mx(side, CANINE_EMBRASURE + OFFSET[cc ?? 'Clase I'] * CANINE_SHIFT), ghost: !cc },
      { id: 'm', x: this.mx(side, MOLAR_GROOVE + OFFSET[mc ?? 'Clase I'] * MOLAR_SHIFT), ghost: !mc },
    ];
  }

  zones(side: Side, rel: Relation) {
    return ZONES[rel].map((z) => ({
      ...z,
      x: this.mx(side, z.center),
      short: z.cls.replace('Clase ', ''),
    }));
  }

  pick(side: Side, rel: Relation, cls: string) {
    if (this.disabled()) return;
    const field = FIELD[side][rel];
    const io = this.intraoral();
    io[field] = io[field] === cls ? '' : cls;
    this.tick.update((v) => v + 1);
    this.changed.emit();
  }

  // ── Overjet / overbite ──
  /** Los campos también se editan desde la historia, así que se leen en cada ciclo (sin memoizar). */
  private num(field: 'overjet' | 'overbite'): number | null {
    this.tick();
    const v = parseMeasure(this.intraoral()[field], field === 'overbite');
    return v === null || Number.isNaN(v) ? null : Math.min(12, Math.max(-8, v));
  }

  incGhost() {
    return this.num('overjet') === null && this.num('overbite') === null;
  }

  incEdge() {
    const oj = this.num('overjet') ?? 2;
    const ob = this.num('overbite') ?? 2;
    return { x: LX + oj * S, y: LY + ob * S };
  }

  readonly lowerIncisor = `M ${LX} ${LY} C ${LX + 2} ${LY + 30} ${LX - 4} ${LY + 70} ${LX - 12} ${LY + 100} L ${LX - 30} ${LY + 96} C ${LX - 22} ${LY + 60} ${LX - 14} ${LY + 24} ${LX - 7} ${LY + 3} Z`;

  upperIncisor() {
    const { x, y } = this.incEdge();
    return `M ${x} ${y} C ${x + 4} ${y - 34} ${x - 2} ${y - 72} ${x - 14} ${y - 104} L ${x - 40} ${y - 98} C ${x - 30} ${y - 60} ${x - 20} ${y - 22} ${x - 6} ${y - 2} Z`;
  }

  ojText() {
    return String(this.num('overjet') ?? 2).replace('.', ',');
  }

  obText() {
    return String(this.num('overbite') ?? 2).replace('.', ',');
  }

  incMeasures() {
    this.tick();
    const io = this.intraoral();
    return (['overjet', 'overbite'] as const).map((f) => {
      const st = checkMeasure(f === 'overjet' ? 'intraoral.overjet' : 'intraoral.overbite', io[f]);
      const range = INC_RANGE[f];
      return {
        key: f,
        label: f === 'overjet' ? 'Overjet' : 'Overbite',
        text: st.value === null ? '—' : `${String(st.value).replace('.', ',')} mm`,
        state: st.state,
        message: st.state === 'empty' ? 'Arrastre el punto rosado o mueva el control.' : st.message,
        min: range[0],
        max: range[1],
        slider: Math.min(range[1], Math.max(range[0], st.value ?? 2)),
      };
    });
  }

  setIncMeasure(field: 'overjet' | 'overbite', raw: string) {
    if (this.disabled()) return;
    this.intraoral()[field] = fmtMm(Number(raw));
    this.tick.update((v) => v + 1);
  }

  readonly DEFAULT_CROWN = DEFAULT_CROWN;

  overbitePercent(): number | null {
    const ob = this.num('overbite');
    const crown = toNum(this.intraoral().lowerCrownHeight) ?? DEFAULT_CROWN;
    if (ob === null || crown <= 0) return null;
    return Math.round((ob / crown) * 100);
  }

  setCrownHeight(raw: string) {
    this.intraoral().lowerCrownHeight = raw.trim();
    this.tick.update((v) => v + 1);
  }

  // ── Análisis transversal ──
  readonly classes: AngleClass[] = ['Clase I', 'Clase II', 'Clase III'];
  readonly crossSides: Array<{ key: CrossSide; label: string; cx: number; outward: 1 | -1 }> = [
    { key: 'Derecha', label: 'derecha', cx: 40, outward: -1 },
    { key: 'Izquierda', label: 'izquierda', cx: 300, outward: 1 },
  ];
  readonly midlines: Array<{ key: MidlineField; label: string; cls: string }> = [
    { key: 'upperMidline', label: 'Línea media superior', cls: 'upper' },
    { key: 'lowerMidline', label: 'Línea media inferior', cls: 'lower' },
  ];

  isCrossed(side: CrossSide) {
    this.tick();
    const io = this.intraoral();
    if (io.crossBite === 'Posterior bilateral') return true;
    return io.crossBite === 'Posterior unilateral' && io.crossBiteSide === side;
  }

  toggleCross(side: CrossSide) {
    if (this.disabled()) return;
    const io = this.intraoral();
    const right = side === 'Derecha' ? !this.isCrossed('Derecha') : this.isCrossed('Derecha');
    const left = side === 'Izquierda' ? !this.isCrossed('Izquierda') : this.isCrossed('Izquierda');
    if (right && left) {
      io.crossBite = 'Posterior bilateral';
      io.crossBiteSide = 'Bilateral';
    } else if (right || left) {
      io.crossBite = 'Posterior unilateral';
      io.crossBiteSide = right ? 'Derecha' : 'Izquierda';
    } else {
      if (io.crossBite.startsWith('Posterior')) io.crossBite = 'No';
      io.crossBiteSide = '';
    }
    this.tick.update((v) => v + 1);
    this.changed.emit();
  }

  crossText() {
    const r = this.isCrossed('Derecha');
    const l = this.isCrossed('Izquierda');
    if (r && l) return 'Bilateral';
    if (r || l) return `Unilateral ${r ? 'derecha' : 'izquierda'}`;
    const cb = this.intraoral().crossBite;
    if (cb === 'Posterior unilateral') return 'Unilateral (marque el lado)';
    if (cb === 'Anterior') return 'No (hay cruzada anterior)';
    return cb ? 'No' : '—';
  }

  crossState() {
    if (this.isCrossed('Derecha') || this.isCrossed('Izquierda') || this.intraoral().crossBite === 'Posterior unilateral') return 'out';
    return this.intraoral().crossBite ? 'ok' : 'empty';
  }

  /** Corte frontal de los primeros molares: la cúspide vestibular superior cae por fuera (normal) o por dentro (cruzada). */
  molarPath(cx: number, outward: 1 | -1, upper: boolean, crossed: boolean) {
    const c = upper ? cx + outward * (crossed ? -8 : 8) : cx;
    const x0 = c - 22;
    const x1 = c + 22;
    return upper
      ? `M ${x0} 40 L ${x1} 40 L ${x1} 78 Q ${x1 - 5} 92 ${c + 6} 84 Q ${c} 80 ${c - 6} 84 Q ${x0 + 5} 92 ${x0} 78 Z`
      : `M ${x0} 132 L ${x1} 132 L ${x1} 94 Q ${x1 - 5} 80 ${c + 6} 88 Q ${c} 92 ${c - 6} 88 Q ${x0 + 5} 80 ${x0} 94 Z`;
  }

  midlineNum(field: MidlineField): number | null {
    this.tick();
    return toNum(this.intraoral()[field]);
  }

  midlineText(field: MidlineField) {
    const v = this.midlineNum(field);
    if (v === null) return '—';
    if (v === 0) return 'Centrada';
    return `${fmtMm(Math.abs(v))} mm a la ${v > 0 ? 'derecha' : 'izquierda'}`;
  }

  /** En vista frontal la derecha del paciente queda a la izquierda de la pantalla. */
  midlineX(field: MidlineField) {
    return FACIAL_X - (this.midlineNum(field) ?? 0) * MID_S;
  }

  midlineGap() {
    const u = this.midlineNum('upperMidline');
    const l = this.midlineNum('lowerMidline');
    if (u === null && l === null) return null;
    return fmtMm(Math.abs((u ?? 0) - (l ?? 0)));
  }

  setMidline(field: MidlineField, raw: string) {
    if (this.disabled()) return;
    const io = this.intraoral();
    io[field] = fmtMm(-Number(raw));
    const u = toNum(io.upperMidline) ?? 0;
    const l = toNum(io.lowerMidline) ?? 0;
    const part = (v: number) => (v === 0 ? 'centrada' : `desviada ${fmtMm(Math.abs(v))} mm a la ${v > 0 ? 'derecha' : 'izquierda'}`);
    io.dentalMidline = u === 0 && l === 0 ? 'Coincide con la línea media facial' : `Superior ${part(u)}; inferior ${part(l)} (respecto a la línea media facial)`;
    this.tick.update((v) => v + 1);
  }

  /** Incisivos, caninos y premolares en vista frontal, alineados con su línea media. */
  frontTeeth() {
    const out: Array<{ id: string; x: number; y: number; w: number; h: number; rx: number; upper: boolean }> = [];
    const arch = (upper: boolean, widths: number[], y: number, h: number) => {
      const m = this.midlineX(upper ? 'upperMidline' : 'lowerMidline');
      for (const d of [-1, 1]) {
        let acc = 0;
        widths.forEach((w, i) => {
          out.push({ id: `${upper ? 'u' : 'l'}${d}${i}`, x: d > 0 ? m + acc : m - acc - w, y, w, h, rx: 5, upper });
          acc += w;
        });
      }
    };
    arch(false, [15, 16, 17, 17, 16], 84, 46);
    arch(true, [24, 18, 18, 17, 16], 36, 50);
    return out;
  }

  onIncDown(event: PointerEvent) {
    if (this.disabled()) return;
    this.draggingInc = true;
    this.incRef?.nativeElement.setPointerCapture(event.pointerId);
    this.onIncMove(event);
  }

  onIncMove(event: PointerEvent) {
    if (!this.draggingInc) return;
    const svg = this.incRef?.nativeElement;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    const half = (v: number) => Math.round(v * 2) / 2;
    const oj = Math.min(INC_RANGE.overjet[1], Math.max(INC_RANGE.overjet[0], half((pt.x - LX) / S)));
    const ob = Math.min(INC_RANGE.overbite[1], Math.max(INC_RANGE.overbite[0], half((pt.y - LY) / S)));
    const io = this.intraoral();
    io.overjet = String(oj).replace('.', ',');
    io.overbite = String(ob).replace('.', ',');
    this.tick.update((v) => v + 1);
  }

  onIncUp() {
    if (!this.draggingInc) return;
    this.draggingInc = false;
    this.changed.emit();
  }
}
