import { Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, input, output, signal } from '@angular/core';
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
      <svg class="odg-defs" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="odg-enamel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset="0.55" stop-color="#f8f4ea" />
            <stop offset="1" stop-color="#e9dfc9" />
          </linearGradient>
          <linearGradient id="odg-root" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#e8d6b0" />
            <stop offset="0.5" stop-color="#f6ead0" />
            <stop offset="1" stop-color="#dcc79c" />
          </linearGradient>
          <linearGradient id="odg-gum" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#f7b8c0" />
            <stop offset="1" stop-color="#ec8f9c" />
          </linearGradient>
          <linearGradient id="odg-crown-purple" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#faf1ff" />
            <stop offset="1" stop-color="#e3c8f3" />
          </linearGradient>
          <linearGradient id="odg-crown-green" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#f0fdf4" />
            <stop offset="1" stop-color="#bbf7d0" />
          </linearGradient>
        </defs>
      </svg>
      <header class="odg-head">
        <div class="odg-brand">
          <svg viewBox="0 0 40 44" aria-hidden="true">
            <path
              d="M20 7 C14 2 4 2 3 12 C2 20 6 26 8 34 C9 40 13 42 14 36 C15 30 17 27 20 27 C23 27 25 30 26 36 C27 42 31 40 32 34 C34 26 38 20 37 12 C36 2 26 2 20 7 Z"
              fill="#fff"
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
                      <button type="button" class="odg-num" [class.on]="selected() === tooth" [class.marked]="!!record(tooth)" (click)="onToothClick(tooth, $event)">{{ tooth }}</button>
                    } @else {
                      <svg class="odg-square" viewBox="-2 -2 40 40" [class.small]="row.small" [attr.aria-label]="'Superficies ' + tooth">
                        @for (pos of positions; track pos) {
                          <polygon
                            [attr.points]="square(pos)"
                            [attr.fill]="surfaceFill(tooth, pos)"
                            stroke="#9fb3c8"
                            stroke-width="1.1"
                            stroke-linejoin="round"
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
                      [style.width.px]="shape(tooth).width * (row.small ? 0.8 : 1.14)"
                      [style.height.px]="row.small ? 80 : 114"
                      (click)="onToothClick(tooth, $event)"
                      [attr.aria-label]="'Diente ' + tooth"
                    >
                      <title>{{ tooth }} · {{ toothName(tooth) }}{{ summary(tooth) ? ' — ' + summary(tooth) : '' }}</title>
                      <g [attr.transform]="row.upper ? null : 'translate(0,100) scale(1,-1)'">
                        @if (selected() === tooth) {
                          <ellipse cx="25" cy="60" rx="24" ry="44" class="odg-glow" />
                        }
                        <g [attr.opacity]="has(tooth, 'AUSENTE') ? 0.25 : 1">
                          @if (has(tooth, 'IMPLANTE')) {
                            <rect x="20" y="10" width="10" height="46" rx="3" fill="#94a3b8" stroke="#475569" />
                            @for (y of screwLines; track y) {
                              <line x1="18" [attr.y1]="y" x2="32" [attr.y2]="y + 3" stroke="#475569" stroke-width="1.2" />
                            }
                          } @else {
                            @for (r of shape(tooth).roots; track $index) {
                              <path [attr.d]="r" fill="url(#odg-root)" stroke="#b89a64" stroke-width="0.9" />
                            }
                          }
                        </g>
                        <path class="odg-gum" [attr.d]="gumPath" fill="url(#odg-gum)" />
                        <path class="odg-gum-line" [attr.d]="gumEdge" fill="none" />
                        <g [attr.opacity]="has(tooth, 'AUSENTE') ? 0.25 : 1">
                          <path class="odg-crown"
                            [attr.d]="shape(tooth).crown"
                            [attr.fill]="crownFill(tooth)"
                            [attr.stroke]="crownStroke(tooth)"
                            [attr.stroke-width]="crownStroke(tooth) === '#b59b6a' ? 1 : 2.4"
                          />
                          <path [attr.d]="shape(tooth).crown" fill="none" class="odg-shine" />
                          @if (shape(tooth).detail) {
                            <path [attr.d]="shape(tooth).detail" fill="none" stroke="#cdb88f" stroke-width="0.9" />
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
                      <svg class="odg-square" viewBox="-2 -2 40 40" [class.small]="row.small" [attr.aria-label]="'Superficies ' + tooth">
                        @for (pos of positions; track pos) {
                          <polygon
                            [attr.points]="square(pos)"
                            [attr.fill]="surfaceFill(tooth, pos)"
                            stroke="#9fb3c8"
                            stroke-width="1.1"
                            stroke-linejoin="round"
                            (click)="onSurfaceClick(tooth, pos, $event)"
                          >
                            <title>{{ tooth }} · {{ surfaceTitle(tooth, pos) }}</title>
                          </polygon>
                        }
                      </svg>
                    } @else {
                      <button type="button" class="odg-num" [class.on]="selected() === tooth" [class.marked]="!!record(tooth)" (click)="onToothClick(tooth, $event)">{{ tooth }}</button>
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
              <div class="odg-pop-backdrop" (click)="closePopover()"></div>
              <div class="odg-pop" [style.left.px]="popLeft()" [style.top.px]="popTop()" role="dialog" aria-modal="true">
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
                  <p class="odg-pop-title">Superficies <span>elija el hallazgo y toque la superficie</span></p>
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
    :host { display: block; --odg-ink: #0b5563; --odg-accent: #0d9488; --odg-soft: #e6f5f3; --odg-line: #cfe6e3; }
    .odg-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
    .odg { border: 1px solid var(--odg-line); border-radius: 18px; background: #fff; overflow: hidden; box-shadow: 0 10px 30px rgba(11, 85, 99, 0.08); }
    .odg-head { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; justify-content: space-between; padding: 14px 18px; background: linear-gradient(120deg, #0b5563 0%, #0d9488 100%); color: #fff; }
    .odg-brand { display: flex; gap: 12px; align-items: center; }
    .odg-brand svg { width: 38px; height: 42px; padding: 6px; border-radius: 12px; background: rgba(255, 255, 255, 0.16); box-sizing: content-box; }
    .odg-brand strong { display: block; font-size: 21px; letter-spacing: 0.08em; line-height: 1; }
    .odg-brand span { font-size: 12px; opacity: 0.85; }
    .odg-meta { display: flex; flex-wrap: wrap; gap: 8px 14px; margin: 0; }
    .odg-meta dt { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8; }
    .odg-meta dd { margin: 3px 0 0; font-size: 12.5px; font-weight: 600; padding: 5px 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.16); min-width: 80px; }
    .odg-body { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 14px; padding: 14px; background: #f6fbfa; }
    .odg-main { position: relative; overflow-x: auto; padding: 10px 8px 14px; background: radial-gradient(ellipse at 50% 50%, #ffffff 0%, #f9fcfc 70%); border: 1px solid var(--odg-line); border-radius: 14px; }
    .odg-jaw { display: inline-flex; margin: 2px 0 6px 6px; padding: 4px 12px; border-radius: 999px; background: var(--odg-soft); color: var(--odg-ink); font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; line-height: 1.25; }
    .odg-jaw br { display: none; }
    .odg-jaw.bottom { margin-top: 6px; }
    .odg-row { display: flex; justify-content: center; align-items: flex-end; gap: 0; min-width: max-content; margin: 0 auto; }
    .odg-row:not(.upper) { align-items: flex-start; }
    .odg-row.small { margin: 6px auto; }
    .odg-tooth { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 2px 0; border-radius: 12px; transition: background 0.15s; }
    .odg-tooth:hover { background: rgba(13, 148, 136, 0.06); }
    .odg-tooth.midline { margin-right: 12px; padding-right: 10px; border-right: 2px dashed #99d5cd; border-radius: 12px 0 0 12px; }
    .odg-tooth.selected { background: rgba(13, 148, 136, 0.12); }
    .odg-svg { cursor: pointer; display: block; transition: transform 0.15s ease; }
    .odg-crown { filter: drop-shadow(0 1.2px 1.2px rgba(71, 52, 20, 0.22)); }
    .odg-tooth:hover .odg-svg { transform: translateY(-1px) scale(1.03); }
    .odg-gum { opacity: 0.95; }
    .odg-gum-line { stroke: #d9707f; stroke-width: 0.8; }
    .odg-shine { stroke: rgba(255, 255, 255, 0.85); stroke-width: 1.6; stroke-dasharray: 18 400; stroke-dashoffset: -6; stroke-linecap: round; }
    .odg-glow { fill: rgba(45, 212, 191, 0.18); stroke: rgba(13, 148, 136, 0.55); stroke-width: 1; stroke-dasharray: 3 2; }
    .odg-num { border: 1px solid transparent; background: none; font-size: 11.5px; font-weight: 700; color: #475569; cursor: pointer; padding: 1px 6px; border-radius: 999px; line-height: 1.4; }
    .odg-num.marked { color: var(--odg-ink); background: var(--odg-soft); }
    .odg-num.on { background: var(--odg-accent); color: #fff; }
    .odg-square { width: 26px; height: 26px; cursor: pointer; filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.08)); }
    .odg-square.small { width: 20px; height: 20px; }
    .odg-square.big { width: 150px; height: 150px; filter: none; }
    .odg-square polygon { transition: opacity 0.12s; }
    .odg-square polygon:hover { opacity: 0.7; }
    .sq-l { font-size: 4.2px; font-weight: 700; fill: #334155; text-anchor: middle; pointer-events: none; }
    .odg-occlusal { display: flex; justify-content: space-between; gap: 12px; margin: 10px 0; padding: 6px 0; min-width: max-content; border-top: 1px dashed var(--odg-line); border-bottom: 1px dashed var(--odg-line); }
    .odg-occlusal.large { justify-content: center; gap: 30px; border: none; }
    .odg-arch { display: flex; flex-direction: column; align-items: center; }
    .odg-arch svg { width: 210px; height: 131px; }
    .odg-occlusal.large .odg-arch svg { width: 360px; height: 225px; }
    .odg-arch-label { font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; color: var(--odg-ink); background: var(--odg-soft); border-radius: 999px; padding: 3px 12px; }
    .odg-occ-tooth { cursor: pointer; }
    .odg-occ-num { font-size: 7px; fill: var(--odg-ink); font-weight: 700; pointer-events: none; }

    .odg-pop-backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(15, 42, 48, 0.12); }
    .odg-pop { position: fixed; z-index: 1001; width: 480px; max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); overflow-y: auto; box-sizing: border-box; background: #fff; border: 1px solid var(--odg-line); border-radius: 16px; box-shadow: 0 24px 60px rgba(11, 85, 99, 0.28); padding: 0 18px 16px; animation: odg-pop-in 0.14s ease-out; }
    @keyframes odg-pop-in { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: none; } }
    .odg-pop-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 10px; margin: 0 -18px 10px; padding: 14px 18px; background: linear-gradient(120deg, #0b5563, #0d9488); color: #fff; border-radius: 15px 15px 0 0; }
    .odg-pop-head strong { font-size: 18px; }
    .odg-pop-head span { font-size: 13px; opacity: 0.9; flex: 1; }
    .odg-x { border: none; background: rgba(255, 255, 255, 0.18); color: #fff; width: 32px; height: 32px; border-radius: 50%; font-size: 22px; line-height: 1; cursor: pointer; }
    .odg-x:hover { background: rgba(255, 255, 255, 0.3); }
    .odg-pop-sum { margin: 0 0 10px; padding: 8px 12px; font-size: 13px; color: var(--odg-ink); background: var(--odg-soft); border-radius: 10px; }
    .odg-pop-title { margin: 14px 0 8px; font-size: 12px; font-weight: 700; color: var(--odg-ink); text-transform: uppercase; letter-spacing: 0.05em; }
    .odg-pop-title span { margin-left: 6px; font-weight: 500; text-transform: none; letter-spacing: 0; color: #64748b; }
    .odg-pop-surfaces { display: flex; gap: 16px; align-items: center; }
    .odg-pop-surfaces .odg-chips { flex: 1; grid-template-columns: 1fr; }
    .odg-chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); gap: 6px; }
    .odg-chip { display: inline-flex; align-items: center; gap: 8px; border: 1px solid #d5e5e3; background: #fff; border-radius: 10px; padding: 8px 12px; font-size: 13px; text-align: left; cursor: pointer; color: #1e293b; transition: border-color 0.12s, background 0.12s; }
    .odg-chip:hover { border-color: #8fcfc6; background: #f5fbfa; }
    .odg-chip.on { border-color: var(--odg-accent); background: var(--odg-soft); font-weight: 600; box-shadow: inset 0 0 0 1px var(--odg-accent); }
    .dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(15, 23, 42, 0.2); flex: none; }
    .odg-chip .dot { width: 14px; height: 14px; }
    .dot.wire { border-radius: 2px; height: 3px; border: none; background: #1e3a8a; }
    .odg-note { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; font-size: 12px; font-weight: 700; color: var(--odg-ink); text-transform: uppercase; letter-spacing: 0.05em; }
    .odg-note input { font: inherit; font-size: 14px; font-weight: 400; text-transform: none; letter-spacing: 0; border: 1px solid #d5e5e3; border-radius: 10px; padding: 10px 12px; }
    .odg-note input:focus { outline: none; border-color: var(--odg-accent); box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15); }
    .odg-pop-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }
    .odg-link { border: none; background: none; cursor: pointer; font-size: 13px; text-decoration: underline; color: var(--odg-ink); padding: 0; }
    .odg-link.danger { color: #b91c1c; }
    .odg-btn { border: none; background: var(--odg-accent); color: #fff; border-radius: 10px; padding: 9px 22px; font-size: 14px; cursor: pointer; font-weight: 600; }
    .odg-btn:hover { background: #0b7d73; }

    .odg-side { display: flex; flex-direction: column; gap: 12px; }
    .odg-side section { border: 1px solid var(--odg-line); border-radius: 14px; padding: 12px; background: #fff; }
    .odg-side h4 { margin: 0 0 10px; font-size: 11.5px; color: var(--odg-ink); text-transform: uppercase; letter-spacing: 0.06em; }
    .odg-legend { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 8px; font-size: 11.5px; color: #1e293b; }
    .odg-legend li { display: flex; align-items: center; gap: 6px; }
    .odg-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .odg-tool { display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid var(--odg-line); background: #fff; border-radius: 10px; padding: 7px 4px; font-size: 11.5px; cursor: pointer; color: var(--odg-ink); transition: background 0.12s; }
    .odg-tool:hover { background: #f2faf9; }
    .odg-tool svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; }
    .odg-tool.on { background: var(--odg-accent); color: #fff; border-color: var(--odg-accent); }
    .odg-hint { margin: 8px 0 4px; font-size: 11.5px; color: #64748b; }
    .odg-hint.strong { color: var(--odg-ink); font-weight: 700; margin-top: 6px; }
    .odg-palette { display: flex; flex-wrap: wrap; gap: 6px; }
    .odg-swatch { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px #cbd5e1; cursor: pointer; transition: transform 0.12s; }
    .odg-swatch:hover { transform: scale(1.12); }
    .odg-swatch.on { box-shadow: 0 0 0 2px var(--odg-accent); transform: scale(1.12); }
    .odg-seg { display: flex; margin-top: 8px; border: 1px solid var(--odg-line); border-radius: 10px; overflow: hidden; }
    .odg-seg button { flex: 1; border: none; background: #fff; padding: 6px 2px; font-size: 11px; cursor: pointer; color: var(--odg-ink); }
    .odg-seg button.on { background: var(--odg-soft); font-weight: 700; }
    .odg-check { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 3px 0; }
    .odg-summary { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--odg-line); background: #fff; font-size: 12px; color: #1e293b; }
    .odg-cop, .odg-count { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: #f3f8f8; border: 1px solid #e1eeec; }
    .odg-cop { background: var(--odg-soft); border-color: #bfe3dd; }
    .odg-cop strong { color: var(--odg-ink); margin-right: 2px; }
    @media (max-width: 1100px) {
      .odg-body { grid-template-columns: 1fr; }
      .odg-side { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
    }
    @media (max-width: 560px) {
      .odg-pop-surfaces { flex-direction: column; align-items: stretch; }
      .odg-square.big { align-self: center; }
    }
  `,
})
export class DentalOdontogram implements OnDestroy {
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
  /** Encía (mismo trazo para todas las piezas; la mandíbula se refleja). */
  readonly gumPath = 'M-20 41 H70 V65 C46 65 38 55 25 55 C12 55 4 65 -20 65 Z';
  readonly gumEdge = 'M-20 65 C4 65 12 55 25 55 C38 55 46 65 70 65';
  private popAnchor: Element | null = null;

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
    if (this.has(tooth, 'PROTESIS')) return 'url(#odg-crown-green)';
    if (this.has(tooth, 'CORONA')) return 'url(#odg-crown-purple)';
    return 'url(#odg-enamel)';
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
    this.popAnchor = event.currentTarget as Element | null;
    this.positionPopover();
    this.popoverOpen.set(true);
    document.addEventListener('scroll', this.onViewportChange, true);
    setTimeout(() => this.positionPopover());
    if (this.mode() === 'NOTE') {
      setTimeout(() => this.mainArea?.nativeElement.querySelector<HTMLInputElement>('.odg-note input')?.focus(), 30);
    }
  }

  /** Ubica el menú junto al diente, dentro de la ventana (arriba si no cabe abajo). */
  private positionPopover() {
    const target = this.popAnchor;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(480, vw - 24);
    const pop = this.mainArea?.nativeElement.querySelector<HTMLElement>('.odg-pop');
    const height = Math.min(pop?.offsetHeight || 520, vh - 24);
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - 12));
    let top = rect.bottom + 8;
    if (top + height > vh - 12) top = Math.max(12, Math.min(rect.top - height - 8, vh - height - 12));
    this.popLeft.set(left);
    this.popTop.set(top);
  }

  @HostListener('window:resize')
  onResize() {
    this.onViewportChange();
  }

  private readonly onViewportChange = () => {
    if (this.popoverOpen()) this.positionPopover();
  };

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.popoverOpen()) this.closePopover();
  }

  closePopover() {
    this.popoverOpen.set(false);
    this.popAnchor = null;
    document.removeEventListener('scroll', this.onViewportChange, true);
  }

  ngOnDestroy() {
    document.removeEventListener('scroll', this.onViewportChange, true);
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
