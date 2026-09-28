import { Component, ElementRef, ViewChild, computed, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ALL_TOOLS,
  CONDITION_TOOLS,
  DECIDUOUS_LOWER,
  DECIDUOUS_UPPER,
  DentalTool,
  DentalToolDef,
  DentistryContent,
  MARK_TOOLS,
  PERMANENT_LOWER,
  PERMANENT_UPPER,
  SURFACE_LABELS,
  SURFACE_TOOLS,
  SurfaceState,
  ToothCondition,
  ToothMark,
  ToothRecord,
  ToothSurface,
  dentalToolColor,
  dentalToolLabel,
} from './dentistry.models';

type Position = 'top' | 'bottom' | 'left' | 'right' | 'center';
type Mode = 'SELECT' | 'PAINT' | 'ERASE' | 'NOTE';
type ViewKind = 'COMPLETA' | 'MAXILAR' | 'MANDIBULA' | 'OCLUSAL';
type Dentition = 'PERMANENTE' | 'TEMPORAL' | 'MIXTA';
type ToothKind = 'incisor' | 'canine' | 'premolar' | 'molar';

interface ToothShape {
  viewBox: string;
  width: number;
  crown: string;
  roots: string[];
  canals: string[];
  detail?: string;
  crownLeft: number;
  crownRight: number;
}

interface Row {
  teeth: number[];
  upper: boolean;
  small?: boolean;
}

const SQUARE: Record<Position, string> = {
  top: '0,0 36,0 26,10 10,10',
  bottom: '10,26 26,26 36,36 0,36',
  left: '0,0 10,10 10,26 0,36',
  right: '36,0 36,36 26,26 26,10',
  center: '10,10 26,10 26,26 10,26',
};
const POSITIONS: Position[] = ['top', 'bottom', 'left', 'right', 'center'];

/** Siluetas dibujadas con la raíz arriba (maxilar); la mandíbula se refleja en vertical. */
const SHAPES: Record<ToothKind, ToothShape> = {
  incisor: {
    viewBox: '10 0 30 100',
    width: 30,
    crown: 'M14 56 C14 78 16 92 20 96 C23 98 27 98 30 96 C34 92 36 78 36 56 Z',
    roots: ['M16 57 C17 35 20 16 25 4 C30 16 33 35 34 57 Z'],
    canals: ['M25 12 L25 62'],
    crownLeft: 14,
    crownRight: 36,
  },
  canine: {
    viewBox: '10 0 30 100',
    width: 30,
    crown: 'M13 54 C12 74 17 90 25 99 C33 90 38 74 37 54 Z',
    roots: ['M16 55 C17 30 21 10 25 0 C29 10 33 30 34 55 Z'],
    canals: ['M25 8 L25 62'],
    crownLeft: 13,
    crownRight: 37,
  },
  premolar: {
    viewBox: '9 0 32 100',
    width: 32,
    crown: 'M12 56 C11 80 14 92 19 95 C22 97 28 97 31 95 C36 92 39 80 38 56 Z',
    roots: ['M16 57 C17 36 21 16 25 6 C29 16 33 36 34 57 Z'],
    canals: ['M25 14 L25 62'],
    detail: 'M18 89 Q25 83 32 89',
    crownLeft: 12,
    crownRight: 38,
  },
  molar: {
    viewBox: '3 0 44 100',
    width: 44,
    crown: 'M5 56 C4 80 7 93 14 96 C20 99 30 99 36 96 C43 93 46 80 45 56 Z',
    roots: [
      'M8 57 C8 38 10 20 15 8 C19 22 21 40 22 57 Z',
      'M20 57 C21 42 23 28 25 18 C27 28 29 42 30 57 Z',
      'M28 57 C29 40 31 22 35 8 C40 20 42 38 42 57 Z',
    ],
    canals: ['M15 16 L16 62', 'M35 16 L34 62'],
    detail: 'M11 90 Q18 84 25 90 Q32 84 39 90',
    crownLeft: 5,
    crownRight: 45,
  },
};

const MODES: Array<{ key: Mode; label: string; icon: string }> = [
  { key: 'SELECT', label: 'Seleccionar', icon: 'M5 3 L5 17 L9 13 L12 19 L14 18 L11 12 L16 12 Z' },
  { key: 'PAINT', label: 'Pintar', icon: 'M4 16 L4 20 L8 20 L18 10 L14 6 Z M15 5 L19 9 L21 7 L17 3 Z' },
  { key: 'ERASE', label: 'Borrar', icon: 'M3 15 L10 8 L17 15 L13 19 L7 19 Z M10 8 L14 4 L21 11 L17 15' },
  { key: 'NOTE', label: 'Agregar nota', icon: 'M5 3 H15 L19 7 V21 H5 Z M8 10 H16 M8 14 H16 M8 18 H13' },
];

const VIEWS: Array<{ key: ViewKind; label: string }> = [
  { key: 'COMPLETA', label: 'Vista completa' },
  { key: 'MAXILAR', label: 'Solo maxilar' },
  { key: 'MANDIBULA', label: 'Solo mandíbula' },
  { key: 'OCLUSAL', label: 'Vista oclusal' },
];

const DENTITIONS: Array<{ key: Dentition; label: string }> = [
  { key: 'PERMANENTE', label: 'Permanente' },
  { key: 'TEMPORAL', label: 'Temporal' },
  { key: 'MIXTA', label: 'Mixta' },
];

const PERMANENT_NAMES: Record<number, string> = {
  1: 'Incisivo central',
  2: 'Incisivo lateral',
  3: 'Canino',
  4: 'Primer premolar',
  5: 'Segundo premolar',
  6: 'Primer molar',
  7: 'Segundo molar',
  8: 'Tercer molar',
};
const DECIDUOUS_NAMES: Record<number, string> = {
  1: 'Incisivo central temporal',
  2: 'Incisivo lateral temporal',
  3: 'Canino temporal',
  4: 'Primer molar temporal',
  5: 'Segundo molar temporal',
};
const QUADRANT_NAMES: Record<number, string> = {
  1: 'superior derecho',
  2: 'superior izquierdo',
  3: 'inferior izquierdo',
  4: 'inferior derecho',
  5: 'superior derecho',
  6: 'superior izquierdo',
  7: 'inferior izquierdo',
  8: 'inferior derecho',
};

/** Prioridad del color en la vista oclusal. */
const OCCLUSAL_PRIORITY: DentalTool[] = [
  'AUSENTE',
  'EXTRACCION_INDICADA',
  'IMPLANTE',
  'PROTESIS',
  'CORONA',
  'CARIES',
  'ENDODONCIA',
  'RESTAURACION',
  'FRACTURA',
  'SELLANTE',
];

@Component({
  selector: 'app-dental-odontogram',
  imports: [FormsModule, NgTemplateOutlet],
  template: `
    <div class="odg">
      <header class="odg-head">
        <div class="odg-brand">
          <svg viewBox="0 0 40 44" aria-hidden="true">
            <path
              d="M20 7 C14 2 4 2 3 12 C2 20 6 26 8 34 C9 40 13 42 14 36 C15 30 17 27 20 27 C23 27 25 30 26 36 C27 42 31 40 32 34 C34 26 38 20 37 12 C36 2 26 2 20 7 Z"
              fill="#0b3a6e"
            />
          </svg>
          <div>
            <strong>ODONTOGRAMA</strong>
            <span>Odontología general | Ortodoncia</span>
          </div>
        </div>
        <dl class="odg-meta">
          <div><dt>Paciente</dt><dd>{{ patientName() || '—' }}</dd></div>
          <div><dt>Edad</dt><dd>{{ patientAge() || '—' }}</dd></div>
          <div><dt>Historia clínica</dt><dd>{{ recordCode() || '—' }}</dd></div>
          <div><dt>Fecha</dt><dd>{{ recordDate() || '—' }}</dd></div>
        </dl>
      </header>

      <div class="odg-body">
        <div class="odg-main" #mainArea>
          @if (view() !== 'OCLUSAL') {
            @for (row of rows(); track $index) {
              @if (row.upper && $first) {
                <span class="odg-jaw">MAXILAR<br />SUPERIOR</span>
              }
              <div class="odg-row" [class.upper]="row.upper" [class.small]="row.small">
                @for (tooth of row.teeth; track tooth; let i = $index) {
                  <div
                    class="odg-tooth"
                    [class.midline]="i === row.teeth.length / 2 - 1"
                    [class.selected]="selected() === tooth"
                  >
                    @if (row.upper) {
                      <button type="button" class="odg-num" (click)="onToothClick(tooth, $event)">{{ tooth }}</button>
                    } @else {
                      <svg class="odg-square" viewBox="-2 -2 40 40" [attr.aria-label]="'Superficies ' + tooth">
                        @for (pos of positions; track pos) {
                          <polygon
                            [attr.points]="square(pos)"
                            [attr.fill]="surfaceFill(tooth, pos)"
                            stroke="#94a3b8"
                            stroke-width="1"
                            (click)="onSurfaceClick(tooth, pos, $event)"
                          >
                            <title>{{ tooth }} · {{ surfaceTitle(tooth, pos) }}</title>
                          </polygon>
                        }
                      </svg>
                    }
                    <svg
                      class="odg-svg"
                      [attr.viewBox]="shape(tooth).viewBox"
                      [style.width.px]="shape(tooth).width * (row.small ? 0.7 : 1)"
                      [style.height.px]="row.small ? 70 : 100"
                      (click)="onToothClick(tooth, $event)"
                      [attr.aria-label]="'Diente ' + tooth"
                    >
                      <title>{{ tooth }} · {{ toothName(tooth) }}{{ summary(tooth) ? ' — ' + summary(tooth) : '' }}</title>
                      <g [attr.transform]="row.upper ? null : 'translate(0,100) scale(1,-1)'">
                        @if (selected() === tooth) {
                          <ellipse cx="25" cy="60" rx="24" ry="44" class="odg-glow" />
                        }
                        <g [attr.opacity]="has(tooth, 'AUSENTE') ? 0.28 : 1">
                          @if (has(tooth, 'IMPLANTE')) {
                            <rect x="20" y="10" width="10" height="46" rx="3" fill="#94a3b8" stroke="#475569" />
                            @for (y of screwLines; track y) {
                              <line x1="18" [attr.y1]="y" x2="32" [attr.y2]="y + 3" stroke="#475569" stroke-width="1.2" />
                            }
                          } @else {
                            @for (r of shape(tooth).roots; track $index) {
                              <path [attr.d]="r" fill="#efe3c8" stroke="#b59b6a" stroke-width="1" />
                            }
                          }
                          <path
                            [attr.d]="shape(tooth).crown"
                            [attr.fill]="crownFill(tooth)"
                            [attr.stroke]="crownStroke(tooth)"
                            [attr.stroke-width]="crownStroke(tooth) === '#b59b6a' ? 1 : 2.4"
                          />
                          @if (shape(tooth).detail) {
                            <path [attr.d]="shape(tooth).detail" fill="none" stroke="#c9b48c" stroke-width="0.9" />
                          }
                          @if (has(tooth, 'ENDODONCIA')) {
                            @for (c of shape(tooth).canals; track $index) {
                              <path [attr.d]="c" stroke="#f5b301" stroke-width="3.2" stroke-linecap="round" />
                            }
                          }
                          @for (dot of surfaceDots(tooth); track dot.surface) {
                            @if (dot.state === 'FRACTURA') {
                              <path
                                [attr.d]="'M' + (dot.x - 6) + ' ' + (dot.y - 3) + ' l4 5 l4 -5 l4 5'"
                                fill="none"
                                stroke="#f97316"
                                stroke-width="2"
                              />
                            } @else {
                              <circle [attr.cx]="dot.x" [attr.cy]="dot.y" r="4.2" [attr.fill]="color(dot.state)" stroke="#fff" stroke-width="0.8" />
                            }
                          }
                          @if (archActive(row.upper) && !has(tooth, 'AUSENTE')) {
                            <line
                              [attr.x1]="shape(tooth).crownLeft - 6"
                              y1="76"
                              [attr.x2]="shape(tooth).crownRight + 6"
                              y2="76"
                              stroke="#1e3a8a"
                              stroke-width="1.8"
                            />
                          }
                          @if (hasMark(tooth, 'BANDA')) {
                            <rect
                              [attr.x]="shape(tooth).crownLeft + 1"
                              y="70"
                              [attr.width]="shape(tooth).crownRight - shape(tooth).crownLeft - 2"
                              height="11"
                              rx="2"
                              fill="rgba(29,78,216,0.18)"
                              stroke="#1d4ed8"
                              stroke-width="1.6"
                            />
                          }
                          @if (hasMark(tooth, 'BRACKET')) {
                            <rect x="19" y="71" width="12" height="10" rx="2" fill="#1d4ed8" />
                            <line x1="19" y1="76" x2="31" y2="76" stroke="#bfdbfe" stroke-width="1.4" />
                          }
                          @if (hasMark(tooth, 'SEPARADOR')) {
                            <circle [attr.cx]="mesialX(tooth)" cy="66" r="4.5" fill="none" stroke="#7c3aed" stroke-width="2" />
                          }
                          @if (hasMark(tooth, 'MOVILIDAD')) {
                            <path d="M11 60 q3.5 -4 7 0 t7 0 t7 0 t7 0" fill="none" stroke="#0b5563" stroke-width="1.8" />
                          }
                          @if (hasMark(tooth, 'LESION')) {
                            <path d="M13 42 q3 -4 6 0 t6 0 t6 0 t6 0" fill="none" stroke="#e11d48" stroke-width="2" />
                          }
                          @if (hasMark(tooth, 'FISTULA')) {
                            <circle cx="35" cy="30" r="3.6" fill="#fbcfe8" stroke="#db2777" stroke-width="1.6" />
                          }
                          @if (hasMark(tooth, 'TRAUMA')) {
                            <path d="M38 58 L32 70 L37 70 L31 84" fill="none" stroke="#1e3a8a" stroke-width="2" />
                          }
                          @if (hasMark(tooth, 'OTRO')) {
                            <path
                              d="M40 50 l1.8 3.8 4.2 .6 -3 2.9 .7 4.1 -3.7 -2 -3.7 2 .7 -4.1 -3 -2.9 4.2 -.6 Z"
                              fill="#0f172a"
                            />
                          }
                        </g>
                        @if (has(tooth, 'INCLUIDO')) {
                          <path d="M25 58 L40 90 L10 90 Z" fill="none" stroke="#475569" stroke-width="2.2" />
                        }
                        @if (has(tooth, 'AUSENTE')) {
                          <path d="M14 64 L36 90 M36 64 L14 90" stroke="#6b7280" stroke-width="3" stroke-linecap="round" />
                        }
                        @if (has(tooth, 'EXTRACCION_INDICADA')) {
                          <path d="M9 10 L41 94 M41 10 L9 94" stroke="#dc2626" stroke-width="3" stroke-linecap="round" />
                        }
                      </g>
                    </svg>
                    @if (row.upper) {
                      <svg class="odg-square" viewBox="-2 -2 40 40" [attr.aria-label]="'Superficies ' + tooth">
                        @for (pos of positions; track pos) {
                          <polygon
                            [attr.points]="square(pos)"
                            [attr.fill]="surfaceFill(tooth, pos)"
                            stroke="#94a3b8"
                            stroke-width="1"
                            (click)="onSurfaceClick(tooth, pos, $event)"
                          >
                            <title>{{ tooth }} · {{ surfaceTitle(tooth, pos) }}</title>
                          </polygon>
                        }
                      </svg>
                    } @else {
                      <button type="button" class="odg-num" (click)="onToothClick(tooth, $event)">{{ tooth }}</button>
                    }
                  </div>
                }
              </div>
              @if (!row.upper && $last) {
                <span class="odg-jaw bottom">MANDÍBULA<br />INFERIOR</span>
              }
              @if (showOcclusalBetween() && isLastUpper($index)) {
                <ng-container *ngTemplateOutlet="occlusal" />
              }
            }
          }
          @if (view() === 'OCLUSAL') {
            <ng-container *ngTemplateOutlet="occlusal" />
          }

          <ng-template #occlusal>
            <div class="odg-occlusal" [class.large]="view() === 'OCLUSAL'">
              @for (arch of occlusalArches(); track arch.label) {
                <div class="odg-arch">
                  <span class="odg-arch-label">{{ arch.label }}</span>
                  <svg viewBox="0 0 240 150" [attr.aria-label]="arch.label">
                    <path [attr.d]="arch.guide" fill="none" stroke="#cbd5e1" stroke-dasharray="3 3" />
                    @for (t of arch.teeth; track t.tooth) {
                      <g class="odg-occ-tooth" (click)="onToothClick(t.tooth, $event)">
                        <circle
                          [attr.cx]="t.x"
                          [attr.cy]="t.y"
                          [attr.r]="t.r"
                          [attr.fill]="occlusalFill(t.tooth)"
                          [attr.stroke]="selected() === t.tooth ? '#0f766e' : '#94a3b8'"
                          [attr.stroke-width]="selected() === t.tooth ? 2.4 : 1.2"
                        >
                          <title>{{ t.tooth }} · {{ toothName(t.tooth) }}{{ summary(t.tooth) ? ' — ' + summary(t.tooth) : '' }}</title>
                        </circle>
                        @if (has(t.tooth, 'AUSENTE') || has(t.tooth, 'EXTRACCION_INDICADA')) {
                          <path
                            [attr.d]="'M' + (t.x - t.r * 0.6) + ' ' + (t.y - t.r * 0.6) + ' L' + (t.x + t.r * 0.6) + ' ' + (t.y + t.r * 0.6) + ' M' + (t.x + t.r * 0.6) + ' ' + (t.y - t.r * 0.6) + ' L' + (t.x - t.r * 0.6) + ' ' + (t.y + t.r * 0.6)"
                            [attr.stroke]="has(t.tooth, 'AUSENTE') ? '#374151' : '#fff'"
                            stroke-width="1.6"
                            pointer-events="none"
                          />
                        }
                        @if (view() === 'OCLUSAL') {
                          <text [attr.x]="t.x" [attr.y]="t.labelY" text-anchor="middle" class="odg-occ-num">{{ t.tooth }}</text>
                        }
                      </g>
                    }
                  </svg>
                </div>
              }
            </div>
          </ng-template>

          @if (selected(); as tooth) {
            @if (popoverOpen()) {
              <div class="odg-pop" [style.left.px]="popLeft()" [style.top.px]="popTop()" role="dialog">
                <div class="odg-pop-head">
                  <strong>Diente {{ tooth }}</strong>
                  <span>{{ toothName(tooth) }}</span>
                  <button type="button" class="odg-x" (click)="closePopover()" aria-label="Cerrar">×</button>
                </div>
                <p class="odg-pop-sum">{{ summary(tooth) || 'Sano, sin hallazgos' }}</p>
                @if (!disabled()) {
                  <p class="odg-pop-title">Estado del diente</p>
                  <div class="odg-chips">
                    <button type="button" class="odg-chip" [class.on]="!record(tooth)" (click)="setHealthy(tooth)">
                      <span class="dot" style="background:#fff"></span>Sano
                    </button>
                    @for (t of conditionTools; track t.key) {
                      <button type="button" class="odg-chip" [class.on]="has(tooth, $any(t.key))" (click)="toggleCondition(tooth, $any(t.key))">
                        <span class="dot" [style.background]="t.color"></span>{{ t.label }}
                      </button>
                    }
                  </div>
                  <p class="odg-pop-title">Superficies (elija el hallazgo y toque la superficie)</p>
                  <div class="odg-pop-surfaces">
                    <div class="odg-chips">
                      @for (t of surfaceTools; track t.key) {
                        <button
                          type="button"
                          class="odg-chip"
                          [class.on]="popSurfaceTool() === t.key"
                          (click)="popSurfaceTool.set($any(t.key))"
                        >
                          <span class="dot" [style.background]="t.color"></span>{{ t.label }}
                        </button>
                      }
                    </div>
                    <svg class="odg-square big" viewBox="-2 -2 40 40">
                      @for (pos of positions; track pos) {
                        <polygon
                          [attr.points]="square(pos)"
                          [attr.fill]="surfaceFill(tooth, pos)"
                          stroke="#475569"
                          stroke-width="0.8"
                          (click)="toggleSurface(tooth, pos, popSurfaceTool())"
                        >
                          <title>{{ surfaceTitle(tooth, pos) }}</title>
                        </polygon>
                      }
                      <text x="18" y="7.5" class="sq-l">{{ surfaceLetter(tooth, 'top') }}</text>
                      <text x="18" y="33.5" class="sq-l">{{ surfaceLetter(tooth, 'bottom') }}</text>
                      <text x="5" y="20.5" class="sq-l">{{ surfaceLetter(tooth, 'left') }}</text>
                      <text x="31" y="20.5" class="sq-l">{{ surfaceLetter(tooth, 'right') }}</text>
                      <text x="18" y="20.5" class="sq-l">{{ surfaceLetter(tooth, 'center') }}</text>
                    </svg>
                  </div>
                  <p class="odg-pop-title">Marcas y aparatología</p>
                  <div class="odg-chips">
                    @for (t of markTools; track t.key) {
                      <button type="button" class="odg-chip" [class.on]="hasMark(tooth, $any(t.key))" (click)="toggleMark(tooth, $any(t.key))">
                        <span class="dot" [style.background]="t.color"></span>{{ t.label }}
                      </button>
                    }
                  </div>
                }
                <label class="odg-note">
                  Nota del diente
                  <input
                    #noteInput
                    [ngModel]="record(tooth)?.note || ''"
                    (ngModelChange)="setNote(tooth, $event)"
                    [readonly]="disabled()"
                    placeholder="Ej. sensibilidad al frío, fractura de cúspide…"
                  />
                </label>
                @if (!disabled()) {
                  <div class="odg-pop-actions">
                    <button type="button" class="odg-link danger" (click)="clearTooth(tooth)">Borrar hallazgos del diente</button>
                    <button type="button" class="odg-btn" (click)="closePopover()">Listo</button>
                  </div>
                }
              </div>
            }
          }
        </div>

        <aside class="odg-side">
          <section>
            <h4>Convenciones</h4>
            <ul class="odg-legend">
              @for (t of legend; track t.key) {
                <li><span class="dot" [style.background]="t.color"></span>{{ t.label }}</li>
              }
              <li><span class="dot wire"></span>Arco ortodóntico</li>
            </ul>
          </section>
          @if (!disabled()) {
            <section>
              <h4>Herramientas</h4>
              <div class="odg-tools">
                @for (m of modes; track m.key) {
                  <button type="button" class="odg-tool" [class.on]="mode() === m.key" (click)="setMode(m.key)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="m.icon" /></svg>{{ m.label }}
                  </button>
                }
              </div>
              @if (mode() === 'PAINT') {
                <p class="odg-hint">Elija qué pintar y toque el diente o la superficie:</p>
                <div class="odg-palette">
                  @for (t of allTools; track t.key) {
                    <button
                      type="button"
                      class="odg-swatch"
                      [class.on]="paintTool() === t.key"
                      [style.background]="t.color"
                      [title]="t.label"
                      (click)="paintTool.set(t.key)"
                    ></button>
                  }
                </div>
                <p class="odg-hint strong">{{ toolLabel(paintTool()) }}</p>
              } @else {
                <p class="odg-hint">{{ modeHint() }}</p>
              }
            </section>
          }
          <section>
            <h4>Tipos de vista</h4>
            <div class="odg-tools two">
              @for (v of views; track v.key) {
                <button type="button" class="odg-tool" [class.on]="view() === v.key" (click)="view.set(v.key)">{{ v.label }}</button>
              }
            </div>
            <div class="odg-seg">
              @for (d of dentitions; track d.key) {
                <button type="button" [class.on]="dentition() === d.key" (click)="dentition.set(d.key)">{{ d.label }}</button>
              }
            </div>
          </section>
          <section>
            <h4>Arco ortodóntico</h4>
            <label class="odg-check">
              <input type="checkbox" [checked]="data().orthoArches.upper" [disabled]="disabled()" (change)="toggleArch('upper', $any($event.target).checked)" />
              Arcada superior
            </label>
            <label class="odg-check">
              <input type="checkbox" [checked]="data().orthoArches.lower" [disabled]="disabled()" (change)="toggleArch('lower', $any($event.target).checked)" />
              Arcada inferior
            </label>
          </section>
        </aside>
      </div>

      <footer class="odg-summary">
        <span class="odg-cop" title="Dientes cariados, obturados y perdidos (permanentes)">
          <strong>COP-D</strong> C {{ cop().c }} · O {{ cop().o }} · P {{ cop().p }} = {{ cop().c + cop().o + cop().p }}
        </span>
        @if (ceo().c + ceo().e + ceo().o > 0) {
          <span class="odg-cop" title="Dientes temporales cariados, con extracción indicada y obturados">
            <strong>ceo-d</strong> c {{ ceo().c }} · e {{ ceo().e }} · o {{ ceo().o }} = {{ ceo().c + ceo().e + ceo().o }}
          </span>
        }
        @for (c of counts(); track c.label) {
          <span class="odg-count"><span class="dot" [style.background]="c.color"></span>{{ c.label }}: {{ c.value }}</span>
        }
      </footer>
    </div>
  `,
  styles: `
    :host { display: block; }
    .odg { border: 1px solid #d6e4f0; border-radius: 14px; background: linear-gradient(180deg, #f7fbff, #fff 120px); overflow: hidden; }
    .odg-head { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e2ecf5; }
    .odg-brand { display: flex; gap: 10px; align-items: center; }
    .odg-brand svg { width: 34px; height: 38px; }
    .odg-brand strong { display: block; font-size: 22px; letter-spacing: 0.04em; color: #0b3a6e; line-height: 1; }
    .odg-brand span { font-size: 12px; color: #0b5563; }
    .odg-meta { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 0; }
    .odg-meta dt { font-size: 11px; font-weight: 700; color: #0b3a6e; }
    .odg-meta dd { margin: 2px 0 0; font-size: 12.5px; padding: 4px 10px; border: 1px solid #d6e4f0; border-radius: 8px; background: #fff; min-width: 90px; }
    .odg-body { display: grid; grid-template-columns: minmax(0, 1fr) 230px; gap: 12px; padding: 12px; }
    .odg-main { position: relative; overflow-x: auto; padding: 6px 4px 10px; background: #fff; border: 1px solid #e2ecf5; border-radius: 12px; }
    .odg-jaw { display: inline-block; margin: 2px 0 4px 6px; padding: 4px 10px; border-radius: 8px; background: #e7f1fb; color: #0b3a6e; font-size: 11px; font-weight: 700; line-height: 1.2; }
    .odg-jaw.bottom { margin-top: 4px; }
    .odg-row { display: flex; justify-content: center; align-items: flex-end; gap: 1px; min-width: max-content; margin: 0 auto; }
    .odg-row:not(.upper) { align-items: flex-start; }
    .odg-row.small { margin: 4px auto; }
    .odg-tooth { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 0 1px; border-radius: 8px; }
    .odg-tooth.midline { margin-right: 10px; padding-right: 9px; border-right: 1.5px dashed #93c5fd; }
    .odg-tooth.selected { background: rgba(20, 184, 166, 0.08); }
    .odg-svg { cursor: pointer; display: block; }
    .odg-svg:hover path { filter: brightness(0.97); }
    .odg-glow { fill: rgba(45, 212, 191, 0.22); stroke: rgba(13, 148, 136, 0.5); stroke-width: 1; }
    .odg-num { border: none; background: none; font-size: 12px; font-weight: 700; color: #0b3a6e; cursor: pointer; padding: 0; }
    .odg-square { width: 22px; height: 22px; cursor: pointer; }
    .odg-square.big { width: 110px; height: 110px; }
    .odg-square polygon:hover { opacity: 0.75; }
    .sq-l { font-size: 4.5px; font-weight: 700; fill: #334155; text-anchor: middle; pointer-events: none; }
    .odg-occlusal { display: flex; justify-content: space-between; gap: 12px; margin: 6px 0; min-width: max-content; }
    .odg-occlusal.large { justify-content: center; gap: 30px; }
    .odg-arch { display: flex; flex-direction: column; align-items: center; }
    .odg-arch svg { width: 200px; height: 125px; }
    .odg-occlusal.large .odg-arch svg { width: 340px; height: 212px; }
    .odg-arch-label { font-size: 11px; font-weight: 700; color: #0b3a6e; background: #e7f1fb; border-radius: 8px; padding: 3px 10px; }
    .odg-occ-tooth { cursor: pointer; }
    .odg-occ-num { font-size: 7px; fill: #0b3a6e; font-weight: 700; pointer-events: none; }
    .odg-pop { position: absolute; z-index: 30; width: 340px; max-width: calc(100% - 16px); background: #fff; border: 1px solid #cfe0ee; border-radius: 12px; box-shadow: 0 14px 32px rgba(11, 58, 110, 0.18); padding: 10px 12px; }
    .odg-pop-head { display: flex; align-items: baseline; gap: 8px; }
    .odg-pop-head strong { color: #0b3a6e; }
    .odg-pop-head span { font-size: 12px; color: #475569; flex: 1; }
    .odg-x { border: none; background: none; font-size: 20px; line-height: 1; cursor: pointer; color: #64748b; }
    .odg-pop-sum { margin: 4px 0 6px; font-size: 12px; color: #0f766e; }
    .odg-pop-title { margin: 8px 0 4px; font-size: 11px; font-weight: 700; color: #0b3a6e; text-transform: uppercase; letter-spacing: 0.03em; }
    .odg-pop-surfaces { display: flex; gap: 10px; align-items: center; }
    .odg-pop-surfaces .odg-chips { flex-direction: column; align-items: stretch; }
    .odg-chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .odg-chip { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #d6e4f0; background: #fff; border-radius: 999px; padding: 3px 9px; font-size: 11.5px; cursor: pointer; }
    .odg-chip.on { border-color: #0b3a6e; background: #e7f1fb; font-weight: 600; }
    .dot { display: inline-block; width: 11px; height: 11px; border-radius: 50%; border: 1px solid rgba(15, 23, 42, 0.25); flex: none; }
    .dot.wire { border-radius: 2px; height: 3px; border: none; background: #1e3a8a; }
    .odg-note { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; font-size: 12px; }
    .odg-note input { font: inherit; border: 1px solid #d6e4f0; border-radius: 8px; padding: 6px 8px; }
    .odg-pop-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
    .odg-link { border: none; background: none; cursor: pointer; font-size: 12px; text-decoration: underline; color: #0b3a6e; padding: 0; }
    .odg-link.danger { color: #b91c1c; }
    .odg-btn { border: none; background: #0b3a6e; color: #fff; border-radius: 8px; padding: 6px 14px; cursor: pointer; font-weight: 600; }
    .odg-side { display: flex; flex-direction: column; gap: 10px; }
    .odg-side section { border: 1px solid #e2ecf5; border-radius: 12px; padding: 10px; background: #fff; }
    .odg-side h4 { margin: 0 0 8px; font-size: 12px; color: #0b3a6e; text-transform: uppercase; letter-spacing: 0.04em; }
    .odg-legend { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 5px 8px; font-size: 11.5px; color: #1e293b; }
    .odg-legend li { display: flex; align-items: center; gap: 6px; }
    .odg-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .odg-tool { display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid #cfe0ee; background: #fff; border-radius: 8px; padding: 6px 4px; font-size: 11.5px; cursor: pointer; color: #0b3a6e; }
    .odg-tool svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; }
    .odg-tool.on { background: #0b3a6e; color: #fff; border-color: #0b3a6e; }
    .odg-hint { margin: 8px 0 4px; font-size: 11.5px; color: #64748b; }
    .odg-hint.strong { color: #0b3a6e; font-weight: 700; margin-top: 4px; }
    .odg-palette { display: flex; flex-wrap: wrap; gap: 5px; }
    .odg-swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px #cbd5e1; cursor: pointer; }
    .odg-swatch.on { box-shadow: 0 0 0 2px #0b3a6e; }
    .odg-seg { display: flex; margin-top: 8px; border: 1px solid #cfe0ee; border-radius: 8px; overflow: hidden; }
    .odg-seg button { flex: 1; border: none; background: #fff; padding: 5px 2px; font-size: 11px; cursor: pointer; color: #0b3a6e; }
    .odg-seg button.on { background: #e7f1fb; font-weight: 700; }
    .odg-check { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 3px 0; }
    .odg-summary { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 10px 16px; border-top: 1px solid #e2ecf5; background: #f7fbff; font-size: 12px; color: #1e293b; }
    .odg-cop strong { color: #0b3a6e; margin-right: 4px; }
    .odg-count { display: inline-flex; align-items: center; gap: 5px; }
    @media (max-width: 1100px) {
      .odg-body { grid-template-columns: 1fr; }
      .odg-side { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
    }
  `,
})
export class DentalOdontogram {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly patientName = input('');
  readonly patientAge = input('');
  readonly recordCode = input('');
  readonly recordDate = input('');
  readonly changed = output<void>();

  @ViewChild('mainArea') private mainArea?: ElementRef<HTMLElement>;

  readonly positions = POSITIONS;
  readonly modes = MODES;
  readonly views = VIEWS;
  readonly dentitions = DENTITIONS;
  readonly surfaceTools = SURFACE_TOOLS;
  readonly conditionTools = CONDITION_TOOLS;
  readonly markTools = MARK_TOOLS;
  readonly allTools = ALL_TOOLS;
  readonly legend: DentalToolDef[] = ALL_TOOLS;
  readonly screwLines = [16, 24, 32, 40, 48];

  readonly mode = signal<Mode>('SELECT');
  readonly paintTool = signal<DentalTool>('CARIES');
  readonly popSurfaceTool = signal<SurfaceState>('CARIES');
  readonly view = signal<ViewKind>('COMPLETA');
  readonly dentition = signal<Dentition>('PERMANENTE');
  readonly selected = signal<number | null>(null);
  readonly popoverOpen = signal(false);
  readonly popLeft = signal(0);
  readonly popTop = signal(0);
  /** Se incrementa en cada cambio para recalcular los contadores. */
  private readonly version = signal(0);

  readonly rows = computed<Row[]>(() => {
    const view = this.view();
    const dentition = this.dentition();
    const upper: Row[] = [];
    const lower: Row[] = [];
    if (dentition !== 'TEMPORAL') upper.push({ teeth: PERMANENT_UPPER, upper: true });
    if (dentition !== 'PERMANENTE') {
      upper.push({ teeth: DECIDUOUS_UPPER, upper: true, small: dentition === 'MIXTA' });
      lower.push({ teeth: DECIDUOUS_LOWER, upper: false, small: dentition === 'MIXTA' });
    }
    if (dentition !== 'TEMPORAL') lower.push({ teeth: PERMANENT_LOWER, upper: false });
    if (view === 'MAXILAR') return upper;
    if (view === 'MANDIBULA') return lower;
    return [...upper, ...lower];
  });

  readonly occlusalArches = computed(() => {
    const view = this.view();
    const dentition = this.dentition();
    const temporal = dentition === 'TEMPORAL';
    const out: Array<{ label: string; guide: string; teeth: Array<{ tooth: number; x: number; y: number; r: number; labelY: number }> }> = [];
    if (view !== 'MANDIBULA') {
      out.push(this.buildArch('Vista oclusal superior', temporal ? DECIDUOUS_UPPER : PERMANENT_UPPER, true));
    }
    if (view !== 'MAXILAR') {
      out.push(this.buildArch('Vista oclusal inferior', temporal ? DECIDUOUS_LOWER : PERMANENT_LOWER, false));
    }
    return out;
  });

  readonly cop = computed(() => {
    this.version();
    let c = 0;
    let o = 0;
    let p = 0;
    for (const [key, rec] of Object.entries(this.data().odontogram)) {
      const quadrant = Math.floor(Number(key) / 10);
      if (quadrant > 4) continue;
      const surfaces = Object.values(rec.surfaces || {});
      const conditions = rec.conditions || [];
      if (conditions.includes('AUSENTE') || conditions.includes('EXTRACCION_INDICADA')) p++;
      else if (surfaces.includes('CARIES')) c++;
      else if (surfaces.includes('RESTAURACION') || conditions.includes('CORONA')) o++;
    }
    return { c, o, p };
  });

  readonly ceo = computed(() => {
    this.version();
    let c = 0;
    let e = 0;
    let o = 0;
    for (const [key, rec] of Object.entries(this.data().odontogram)) {
      const quadrant = Math.floor(Number(key) / 10);
      if (quadrant < 5) continue;
      const surfaces = Object.values(rec.surfaces || {});
      const conditions = rec.conditions || [];
      if (conditions.includes('EXTRACCION_INDICADA')) e++;
      else if (surfaces.includes('CARIES')) c++;
      else if (surfaces.includes('RESTAURACION') || conditions.includes('CORONA')) o++;
    }
    return { c, e, o };
  });

  readonly counts = computed(() => {
    this.version();
    const tally = new Map<string, number>();
    for (const rec of Object.values(this.data().odontogram)) {
      const found = new Set<string>([
        ...Object.values(rec.surfaces || {}).filter(Boolean) as string[],
        ...(rec.conditions || []),
        ...(rec.marks || []),
      ]);
      for (const key of found) tally.set(key, (tally.get(key) || 0) + 1);
    }
    return ALL_TOOLS.filter((t) => tally.get(t.key)).map((t) => ({
      label: t.label,
      color: t.color,
      value: tally.get(t.key) || 0,
    }));
  });

  square(pos: Position) {
    return SQUARE[pos];
  }

  color(key: string) {
    return dentalToolColor(key);
  }

  toolLabel(key: string) {
    return dentalToolLabel(key);
  }

  modeHint() {
    switch (this.mode()) {
      case 'ERASE':
        return 'Toque un diente para borrar todos sus hallazgos.';
      case 'NOTE':
        return 'Toque un diente para escribir una nota.';
      default:
        return 'Toque un diente para ver y registrar su estado.';
    }
  }

  kind(tooth: number): ToothKind {
    const quadrant = Math.floor(tooth / 10);
    const pos = tooth % 10;
    if (quadrant >= 5) return pos <= 2 ? 'incisor' : pos === 3 ? 'canine' : 'molar';
    if (pos <= 2) return 'incisor';
    if (pos === 3) return 'canine';
    if (pos <= 5) return 'premolar';
    return 'molar';
  }

  shape(tooth: number): ToothShape {
    return SHAPES[this.kind(tooth)];
  }

  toothName(tooth: number) {
    const quadrant = Math.floor(tooth / 10);
    const pos = tooth % 10;
    const names = quadrant >= 5 ? DECIDUOUS_NAMES : PERMANENT_NAMES;
    return `${names[pos] || 'Diente'} ${QUADRANT_NAMES[quadrant] || ''}`.trim();
  }

  isLastUpper(index: number) {
    const rows = this.rows();
    return rows[index]?.upper && !rows[index + 1]?.upper;
  }

  showOcclusalBetween() {
    return this.view() === 'COMPLETA';
  }

  archActive(upper: boolean) {
    const arches = this.data().orthoArches;
    return upper ? !!arches?.upper : !!arches?.lower;
  }

  record(tooth: number): ToothRecord | undefined {
    this.version();
    return this.data().odontogram[String(tooth)];
  }

  has(tooth: number, condition: ToothCondition) {
    return !!this.record(tooth)?.conditions?.includes(condition);
  }

  hasMark(tooth: number, mark: ToothMark) {
    return !!this.record(tooth)?.marks?.includes(mark);
  }

  /** Superficie anatómica según cuadrante: arriba es vestibular en el maxilar y lingual en la mandíbula. */
  private surfaceAt(tooth: number, pos: Position): ToothSurface {
    const quadrant = Math.floor(tooth / 10);
    const upper = [1, 2, 5, 6].includes(quadrant);
    const patientRight = [1, 4, 5, 8].includes(quadrant);
    switch (pos) {
      case 'top':
        return upper ? 'V' : 'L';
      case 'bottom':
        return upper ? 'L' : 'V';
      case 'left':
        return patientRight ? 'D' : 'M';
      case 'right':
        return patientRight ? 'M' : 'D';
      default:
        return 'O';
    }
  }

  surfaceLetter(tooth: number, pos: Position) {
    return this.surfaceAt(tooth, pos);
  }

  surfaceTitle(tooth: number, pos: Position) {
    const surface = this.surfaceAt(tooth, pos);
    const state = this.record(tooth)?.surfaces?.[surface];
    return `${SURFACE_LABELS[surface]}${state ? ` — ${dentalToolLabel(state)}` : ''}`;
  }

  surfaceFill(tooth: number, pos: Position) {
    const rec = this.record(tooth);
    if (rec?.conditions?.includes('AUSENTE')) return '#e5e7eb';
    const state = rec?.surfaces?.[this.surfaceAt(tooth, pos)];
    return state ? dentalToolColor(state) : '#ffffff';
  }

  mesialX(tooth: number) {
    const quadrant = Math.floor(tooth / 10);
    const s = this.shape(tooth);
    return [1, 4, 5, 8].includes(quadrant) ? s.crownRight - 2 : s.crownLeft + 2;
  }

  /** Puntos de color sobre la corona anatómica para los hallazgos por superficie. */
  surfaceDots(tooth: number) {
    const rec = this.record(tooth);
    if (!rec?.surfaces || rec.conditions?.includes('AUSENTE')) return [];
    const s = this.shape(tooth);
    const mesialRight = [1, 4, 5, 8].includes(Math.floor(tooth / 10));
    const coords: Record<ToothSurface, [number, number]> = {
      O: [25, 90],
      V: [25, 76],
      L: [25, 64],
      M: [mesialRight ? s.crownRight - 5 : s.crownLeft + 5, 78],
      D: [mesialRight ? s.crownLeft + 5 : s.crownRight - 5, 78],
    };
    return (Object.entries(rec.surfaces) as Array<[ToothSurface, SurfaceState]>)
      .filter(([, state]) => !!state)
      .map(([surface, state]) => ({ surface, state, x: coords[surface][0], y: coords[surface][1] }));
  }

  crownFill(tooth: number) {
    if (this.has(tooth, 'PROTESIS')) return '#dcfce7';
    if (this.has(tooth, 'CORONA')) return '#f1e4fa';
    return '#fdfaf3';
  }

  crownStroke(tooth: number) {
    if (this.has(tooth, 'PROTESIS')) return '#16a34a';
    if (this.has(tooth, 'CORONA')) return '#8e24aa';
    return '#b59b6a';
  }

  occlusalFill(tooth: number) {
    const rec = this.record(tooth);
    if (!rec) return '#ffffff';
    const found = new Set<string>([...(rec.conditions || []), ...(Object.values(rec.surfaces || {}) as string[])]);
    const top = OCCLUSAL_PRIORITY.find((k) => found.has(k));
    if (top === 'AUSENTE') return '#e5e7eb';
    return top ? dentalToolColor(top) : '#ffffff';
  }

  summary(tooth: number) {
    const rec = this.record(tooth);
    if (!rec) return '';
    const parts: string[] = [];
    for (const c of rec.conditions || []) parts.push(dentalToolLabel(c));
    for (const [surface, state] of Object.entries(rec.surfaces || {})) {
      if (state) parts.push(`${dentalToolLabel(state)} ${surface}`);
    }
    for (const m of rec.marks || []) parts.push(dentalToolLabel(m));
    if ((rec.note || '').trim()) parts.push(`Nota: ${rec.note!.trim()}`);
    return parts.join(' · ');
  }

  private buildArch(label: string, teeth: number[], upper: boolean) {
    const widths = teeth.map((t) => {
      const k = this.kind(t);
      return k === 'molar' ? 1.45 : k === 'premolar' ? 1.1 : k === 'canine' ? 1 : 0.9;
    });
    const total = widths.reduce((a, b) => a + b, 0);
    const cx = 120;
    const rx = 100;
    const ry = 118;
    const cy = upper ? 138 : 12;
    let acc = 0;
    const points = teeth.map((tooth, i) => {
      const mid = acc + widths[i] / 2;
      acc += widths[i];
      const theta = Math.PI - (mid / total) * Math.PI;
      const x = cx + rx * Math.cos(theta);
      const y = upper ? cy - ry * Math.sin(theta) : cy + ry * Math.sin(theta);
      const r = 5.2 * widths[i];
      const labelY = upper ? y + r + 7 : y - r - 2.5;
      return { tooth, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r, labelY };
    });
    const guide = upper
      ? `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`
      : `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy}`;
    return { label, guide, teeth: points };
  }

  setMode(mode: Mode) {
    this.mode.set(mode);
    if (mode !== 'SELECT' && mode !== 'NOTE') this.closePopover();
  }

  onToothClick(tooth: number, event: Event) {
    event.stopPropagation();
    this.selected.set(tooth);
    const mode = this.disabled() ? 'SELECT' : this.mode();
    if (mode === 'ERASE') {
      this.clearTooth(tooth);
      return;
    }
    if (mode === 'PAINT') {
      const tool = this.paintTool();
      if (SURFACE_TOOLS.some((t) => t.key === tool)) this.toggleSurfaceBySurface(tooth, 'O', tool as SurfaceState);
      else this.applyTool(tooth, tool);
      return;
    }
    this.openPopover(event);
  }

  onSurfaceClick(tooth: number, pos: Position, event: Event) {
    event.stopPropagation();
    this.selected.set(tooth);
    const mode = this.disabled() ? 'SELECT' : this.mode();
    if (mode === 'PAINT') {
      const tool = this.paintTool();
      if (SURFACE_TOOLS.some((t) => t.key === tool)) this.toggleSurface(tooth, pos, tool as SurfaceState);
      else this.applyTool(tooth, tool);
      return;
    }
    if (mode === 'ERASE') {
      this.clearTooth(tooth);
      return;
    }
    this.openPopover(event);
  }

  private openPopover(event: Event) {
    const host = this.mainArea?.nativeElement;
    const target = event.currentTarget as Element | null;
    if (host && target) {
      const box = host.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const width = Math.min(340, box.width - 16);
      let left = rect.left - box.left + host.scrollLeft + rect.width / 2 - width / 2;
      left = Math.max(host.scrollLeft + 8, Math.min(left, host.scrollLeft + box.width - width - 8));
      this.popLeft.set(left);
      this.popTop.set(rect.bottom - box.top + host.scrollTop + 6);
    }
    this.popoverOpen.set(true);
    if (this.mode() === 'NOTE') {
      setTimeout(() => host?.querySelector<HTMLInputElement>('.odg-note input')?.focus(), 30);
    }
  }

  closePopover() {
    this.popoverOpen.set(false);
  }

  private applyTool(tooth: number, tool: DentalTool) {
    if (tool === 'SANO') {
      this.setHealthy(tooth);
      return;
    }
    if (CONDITION_TOOLS.some((t) => t.key === tool)) this.toggleCondition(tooth, tool as ToothCondition);
    else if (MARK_TOOLS.some((t) => t.key === tool)) this.toggleMark(tooth, tool as ToothMark);
  }

  toggleCondition(tooth: number, condition: ToothCondition) {
    if (this.disabled()) return;
    const rec = this.copy(tooth);
    const set = new Set(rec.conditions || []);
    if (set.has(condition)) set.delete(condition);
    else if (condition === 'AUSENTE') {
      set.clear();
      set.add('AUSENTE');
      delete rec.surfaces;
    } else {
      set.delete('AUSENTE');
      set.add(condition);
    }
    rec.conditions = [...set];
    this.store(tooth, rec);
  }

  toggleMark(tooth: number, mark: ToothMark) {
    if (this.disabled()) return;
    const rec = this.copy(tooth);
    const set = new Set(rec.marks || []);
    if (set.has(mark)) set.delete(mark);
    else set.add(mark);
    rec.marks = [...set];
    this.store(tooth, rec);
  }

  toggleSurface(tooth: number, pos: Position, state: SurfaceState) {
    this.toggleSurfaceBySurface(tooth, this.surfaceAt(tooth, pos), state);
  }

  private toggleSurfaceBySurface(tooth: number, surface: ToothSurface, state: SurfaceState) {
    if (this.disabled()) return;
    const rec = this.copy(tooth);
    if (rec.conditions?.includes('AUSENTE')) return;
    const surfaces = { ...(rec.surfaces || {}) };
    if (surfaces[surface] === state) delete surfaces[surface];
    else surfaces[surface] = state;
    rec.surfaces = surfaces;
    this.store(tooth, rec);
  }

  setHealthy(tooth: number) {
    if (this.disabled()) return;
    const note = this.record(tooth)?.note;
    this.store(tooth, note ? { note } : {});
  }

  clearTooth(tooth: number) {
    if (this.disabled()) return;
    delete this.data().odontogram[String(tooth)];
    this.bump();
  }

  setNote(tooth: number, note: string) {
    if (this.disabled()) return;
    const rec = this.copy(tooth);
    rec.note = note;
    this.store(tooth, rec);
  }

  toggleArch(which: 'upper' | 'lower', checked: boolean) {
    if (this.disabled()) return;
    this.data().orthoArches[which] = checked;
    this.bump();
  }

  private copy(tooth: number): ToothRecord {
    const rec = this.data().odontogram[String(tooth)] || {};
    return {
      ...rec,
      conditions: rec.conditions ? [...rec.conditions] : undefined,
      surfaces: rec.surfaces ? { ...rec.surfaces } : undefined,
      marks: rec.marks ? [...rec.marks] : undefined,
    };
  }

  private store(tooth: number, rec: ToothRecord) {
    const clean: ToothRecord = {};
    if (rec.conditions?.length) clean.conditions = rec.conditions;
    if (rec.surfaces && Object.keys(rec.surfaces).length) clean.surfaces = rec.surfaces;
    if (rec.marks?.length) clean.marks = rec.marks;
    if ((rec.note || '').trim() || (rec.note && this.popoverOpen())) clean.note = rec.note;
    const map = this.data().odontogram;
    if (Object.keys(clean).length) map[String(tooth)] = clean;
    else delete map[String(tooth)];
    this.bump();
  }

  private bump() {
    this.version.update((v) => v + 1);
    this.changed.emit();
  }
}
