import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DECIDUOUS_LOWER,
  DECIDUOUS_UPPER,
  DENTAL_STATES,
  DentalState,
  DentistryContent,
  PERMANENT_LOWER,
  PERMANENT_UPPER,
  SURFACE_LABELS,
  ToothRecord,
  ToothSurface,
  dentalStateLabel,
} from './dentistry.models';

type Position = 'top' | 'bottom' | 'left' | 'right' | 'center';
type DentitionView = 'PERMANENTE' | 'TEMPORAL' | 'MIXTA';

const POLYGONS: Record<Position, string> = {
  top: '0,0 36,0 26,10 10,10',
  bottom: '10,26 26,26 36,36 0,36',
  left: '0,0 10,10 10,26 0,36',
  right: '36,0 36,36 26,26 26,10',
  center: '10,10 26,10 26,26 10,26',
};
const POSITIONS: Position[] = ['top', 'bottom', 'left', 'right', 'center'];

@Component({
  selector: 'app-dental-odontogram',
  imports: [FormsModule],
  template: `
    <div class="odo-toolbar">
      <div class="odo-view" role="group" aria-label="Dentición">
        @for (v of views; track v.key) {
          <button type="button" [class.active]="view() === v.key" (click)="view.set(v.key)">
            {{ v.label }}
          </button>
        }
      </div>
      @if (!disabled()) {
        <div class="odo-palette" role="group" aria-label="Estado a marcar">
          @for (s of states; track s.key) {
            <button
              type="button"
              class="odo-tool"
              [class.active]="tool() === s.key"
              [title]="s.scope === 'tooth' ? 'Se aplica al diente completo' : 'Se aplica por superficie'"
              (click)="tool.set(s.key)"
            >
              <span class="swatch" [style.background]="s.color"></span>{{ s.label }}
            </button>
          }
          <button type="button" class="odo-tool" [class.active]="tool() === 'CLEAR'" (click)="tool.set('CLEAR')">
            <span class="swatch clear"></span>Borrar diente
          </button>
        </div>
      }
    </div>

    <div class="odo-grid">
      <div class="odo-grid-inner">
      @for (row of rows(); track $index) {
        <div class="odo-row" [class.odo-row-gap]="row.gapAfter">
          @for (tooth of row.teeth; track tooth) {
            <div
              class="odo-tooth"
              [class.selected]="selected() === tooth"
              [class.midline]="$index === row.teeth.length / 2 - 1"
            >
              @if (row.numberOnTop) {
                <button type="button" class="odo-num" (click)="select(tooth)">{{ tooth }}</button>
              }
              <svg viewBox="-3 -3 42 42" [attr.aria-label]="'Diente ' + tooth">
                @for (pos of positions; track pos) {
                  <polygon
                    [attr.points]="polygon(pos)"
                    [attr.fill]="surfaceColor(tooth, pos)"
                    stroke="#334155"
                    stroke-width="0.8"
                    [class.clickable]="!disabled()"
                    (click)="paint(tooth, pos)"
                  >
                    <title>{{ tooth }} · {{ surfaceTitle(tooth, pos) }}</title>
                  </polygon>
                }
                @switch (record(tooth)?.status) {
                  @case ('AUSENTE') {
                    <line x1="-2" y1="-2" x2="38" y2="38" stroke="#374151" stroke-width="3" pointer-events="none" />
                    <line x1="38" y1="-2" x2="-2" y2="38" stroke="#374151" stroke-width="3" pointer-events="none" />
                  }
                  @case ('CORONA') {
                    <circle cx="18" cy="18" r="19.5" fill="none" stroke="#f59e0b" stroke-width="3" pointer-events="none" />
                  }
                  @case ('ENDODONCIA') {
                    <polygon points="18,3 30,33 6,33" fill="none" stroke="#8e24aa" stroke-width="3" pointer-events="none" />
                  }
                }
              </svg>
              @if (!row.numberOnTop) {
                <button type="button" class="odo-num" (click)="select(tooth)">{{ tooth }}</button>
              }
            </div>
          }
        </div>
      }
      </div>
    </div>

    @if (selected(); as tooth) {
      <div class="odo-detail">
        <strong>Diente {{ tooth }}</strong>
        <span class="muted small">{{ toothSummary(tooth) || 'Sin hallazgos (sano)' }}</span>
        <label>
          Nota del diente
          <input
            [ngModel]="record(tooth)?.note || ''"
            (ngModelChange)="setNote(tooth, $event)"
            [readonly]="disabled()"
            placeholder="Ej. sensibilidad al frío, fractura de cúspide…"
          />
        </label>
        <button type="button" class="linkish" (click)="selected.set(null)">Cerrar</button>
      </div>
    }

    <div class="odo-legend muted small">
      @for (s of states; track s.key) {
        <span><span class="swatch" [style.background]="s.color"></span>{{ s.label }}</span>
      }
      <span>· Superficies: V vestibular, L lingual/palatino, M mesial, D distal, O oclusal/incisal.</span>
    </div>
  `,
  styles: `
    :host { display: block; }
    .odo-toolbar { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; margin-bottom: 0.75rem; }
    .odo-view, .odo-palette { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .odo-view button, .odo-tool {
      border: 1px solid #cbd5e1; background: #fff; border-radius: 999px; padding: 0.3rem 0.7rem;
      font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;
    }
    .odo-view button.active, .odo-tool.active { border-color: #0b5563; background: #e0f2f1; font-weight: 600; }
    .swatch { display: inline-block; width: 0.8rem; height: 0.8rem; border-radius: 3px; border: 1px solid #64748b; }
    .swatch.clear { background: repeating-linear-gradient(45deg, #fff, #fff 2px, #cbd5e1 2px, #cbd5e1 4px); }
    .odo-grid { overflow-x: auto; padding-bottom: 0.25rem; }
    .odo-grid-inner { display: inline-flex; flex-direction: column; min-width: 100%; }
    .odo-row { display: flex; justify-content: center; gap: 2px; }
    .odo-row-gap { margin-bottom: 0.9rem; }
    .odo-tooth { display: flex; flex-direction: column; align-items: center; width: 40px; border-radius: 6px; }
    .odo-tooth.midline { margin-right: 10px; border-right: 1px dashed #94a3b8; }
    .odo-tooth.selected { background: #e0f2f1; }
    .odo-tooth svg { width: 38px; height: 38px; }
    .odo-num { border: none; background: none; font-size: 0.72rem; font-weight: 600; color: #0b5563; cursor: pointer; padding: 0; }
    polygon.clickable { cursor: pointer; }
    polygon.clickable:hover { opacity: 0.75; }
    .odo-detail {
      display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 0.75rem; align-items: center;
      margin-top: 0.75rem; padding: 0.6rem 0.75rem; border: 1px solid #b2dfdb; border-radius: 8px; background: #f5fbfa;
    }
    .odo-detail label { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
    .odo-detail input {
      font: inherit; border: 1px solid #d9d9d9; border-radius: 10px; padding: 8px 10px; background: #fff;
    }
    .odo-detail .linkish {
      justify-self: start; border: none; background: none; color: #0b5563; text-decoration: underline;
      cursor: pointer; padding: 0; font-size: 12px;
    }
    .muted { color: #64748b; }
    .small { font-size: 12px; }
    .odo-legend { display: flex; flex-wrap: wrap; gap: 0.3rem 0.9rem; margin-top: 0.6rem; font-size: 12px; color: #64748b; }
    .odo-legend .swatch { margin-right: 0.25rem; vertical-align: -2px; }
  `,
})
export class DentalOdontogram {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly states = DENTAL_STATES;
  readonly positions = POSITIONS;
  readonly views: Array<{ key: DentitionView; label: string }> = [
    { key: 'PERMANENTE', label: 'Permanente' },
    { key: 'TEMPORAL', label: 'Temporal' },
    { key: 'MIXTA', label: 'Mixta' },
  ];
  readonly view = signal<DentitionView>('PERMANENTE');
  readonly tool = signal<DentalState | 'CLEAR'>('CARIADO');
  readonly selected = signal<number | null>(null);

  readonly rows = computed(() => {
    const permanent = [
      { teeth: PERMANENT_UPPER, numberOnTop: true, gapAfter: true },
      { teeth: PERMANENT_LOWER, numberOnTop: false, gapAfter: false },
    ];
    const deciduous = [
      { teeth: DECIDUOUS_UPPER, numberOnTop: true, gapAfter: true },
      { teeth: DECIDUOUS_LOWER, numberOnTop: false, gapAfter: false },
    ];
    switch (this.view()) {
      case 'TEMPORAL':
        return deciduous;
      case 'MIXTA':
        return [
          { ...permanent[0], gapAfter: false },
          deciduous[0],
          { ...deciduous[1], gapAfter: true },
          permanent[1],
        ];
      default:
        return permanent;
    }
  });

  polygon(pos: Position) {
    return POLYGONS[pos];
  }

  record(tooth: number): ToothRecord | undefined {
    return this.data().odontogram[String(tooth)];
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

  surfaceTitle(tooth: number, pos: Position) {
    const surface = this.surfaceAt(tooth, pos);
    const state = this.record(tooth)?.surfaces?.[surface];
    return `${SURFACE_LABELS[surface]}${state ? ` — ${dentalStateLabel(state)}` : ''}`;
  }

  surfaceColor(tooth: number, pos: Position) {
    const rec = this.record(tooth);
    if (rec?.status === 'AUSENTE') return '#e5e7eb';
    const state = rec?.surfaces?.[this.surfaceAt(tooth, pos)];
    return DENTAL_STATES.find((s) => s.key === state)?.color || '#ffffff';
  }

  select(tooth: number) {
    this.selected.set(this.selected() === tooth ? null : tooth);
  }

  paint(tooth: number, pos: Position) {
    this.selected.set(tooth);
    if (this.disabled()) return;
    const key = String(tooth);
    const map = this.data().odontogram;
    const tool = this.tool();
    const current: ToothRecord = { ...(map[key] || {}), surfaces: { ...(map[key]?.surfaces || {}) } };

    if (tool === 'CLEAR') {
      delete map[key];
      this.changed.emit();
      return;
    }
    const def = DENTAL_STATES.find((s) => s.key === tool)!;
    if (def.scope === 'tooth') {
      current.status = current.status === tool ? '' : tool;
    } else {
      const surface = this.surfaceAt(tooth, pos);
      if (tool === 'SANO') delete current.surfaces![surface];
      else current.surfaces![surface] = current.surfaces![surface] === tool ? undefined : tool;
      if (!current.surfaces![surface]) delete current.surfaces![surface];
    }
    this.store(key, current);
  }

  setNote(tooth: number, note: string) {
    if (this.disabled()) return;
    const key = String(tooth);
    const map = this.data().odontogram;
    this.store(key, { ...(map[key] || {}), note });
  }

  private store(key: string, rec: ToothRecord) {
    const map = this.data().odontogram;
    const empty =
      !rec.status && !Object.keys(rec.surfaces || {}).length && !(rec.note || '').trim();
    if (empty) delete map[key];
    else map[key] = rec;
    this.changed.emit();
  }

  toothSummary(tooth: number) {
    const rec = this.record(tooth);
    if (!rec) return '';
    const parts: string[] = [];
    if (rec.status) parts.push(dentalStateLabel(rec.status));
    for (const [surface, state] of Object.entries(rec.surfaces || {})) {
      if (state) parts.push(`${SURFACE_LABELS[surface as ToothSurface]}: ${dentalStateLabel(state)}`);
    }
    return parts.join(' · ');
  }
}
