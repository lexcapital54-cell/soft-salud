import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DentistryContent, ToothMark } from './dentistry.models';
import {
  LOWER_TEETH,
  MOVEMENT_STATUSES,
  MOVEMENT_TYPES,
  MovementGlyph,
  OrthoMovement,
  OrthoMovementType,
  UPPER_TEETH,
  isUpper,
  movementDef,
  movementGlyph,
  movementHints,
  movementProgress,
  movementStatusDef,
  movementText,
  movementsFromMarks,
  newMovementId,
} from './ortho-movement.models';

interface DrawnGlyph {
  key: string;
  color: string;
  g: MovementGlyph;
  cx: number;
  cy: number;
  line?: string;
  head?: string;
}

const CELL = 40;
const GAP = 8;

/** Plan de movimientos dentarios: tipo, dirección y magnitud por diente, con flechas en un mapa FDI. */
@Component({
  selector: 'app-ortho-movement-plan',
  imports: [FormsModule],
  template: `
    @let list = data().orthoMovements;
    @let prog = progress();
    <div class="mv">
      <div class="mv-top">
        <div class="mv-prog">
          <span>{{ prog.done }} de {{ prog.total }} movimientos logrados</span>
          <div class="mv-bar"><span [style.width.%]="prog.pct"></span></div>
        </div>
        @if (!disabled()) {
          @if (importable().length) {
            <button type="button" class="mv-btn" (click)="importMarks()">Traer {{ importable().length }} del odontograma</button>
          }
          @if (missingMarks()) {
            <button type="button" class="mv-btn" (click)="markOdontogram()">Marcar {{ missingMarks() }} en el odontograma</button>
          }
        }
      </div>

      <svg class="mv-map" [attr.viewBox]="'0 0 ' + width + ' 176'" role="img" aria-label="Mapa de movimientos dentarios">
        <line [attr.x1]="width / 2" y1="2" [attr.x2]="width / 2" y2="174" stroke="#cbd5e1" stroke-dasharray="3 3" />
        <line x1="0" y1="88" [attr.x2]="width" y2="88" stroke="#e2e8f0" />
        @for (t of teeth; track t.n) {
          <g class="mv-tooth" [class.sel]="selected() === t.n" [class.gone]="isGone(t.n)" (click)="select(t.n)">
            <rect [attr.x]="t.x" [attr.y]="t.upper ? 4 : 92" [attr.width]="CELL - 4" height="80" rx="6" class="mv-hit" />
            <line [attr.x1]="t.x + 18" [attr.y1]="t.upper ? 10 : 132" [attr.x2]="t.x + 18" [attr.y2]="t.upper ? 42 : 164" class="mv-root" />
            <rect [attr.x]="t.x + 6" [attr.y]="t.upper ? 36 : 104" width="24" height="34" rx="7" class="mv-crown" [class.has]="countFor(t.n)" />
            <text [attr.x]="t.x + 18" [attr.y]="t.upper ? 82 : 100" class="mv-num">{{ t.n }}</text>
          </g>
        }
        @for (d of drawn(); track d.key) {
          @switch (d.g.kind) {
            @case ('line') {
              <path [attr.d]="d.line" [attr.stroke]="d.color" stroke-width="2.4" stroke-linecap="round" fill="none" />
              <path [attr.d]="d.head" [attr.fill]="d.color" />
            }
            @case ('rot') {
              <path [attr.d]="d.line" [attr.stroke]="d.color" stroke-width="2.2" fill="none" />
              <path [attr.d]="d.head" [attr.fill]="d.color" />
            }
            @case ('depth') {
              <circle [attr.cx]="d.cx" [attr.cy]="d.cy" r="6.5" fill="#fff" [attr.stroke]="d.color" stroke-width="2" />
              @if (d.g.kind === 'depth' && d.g.out) {
                <circle [attr.cx]="d.cx" [attr.cy]="d.cy" r="2.2" [attr.fill]="d.color" />
              } @else {
                <path [attr.d]="'M' + (d.cx - 3.5) + ' ' + (d.cy - 3.5) + 'L' + (d.cx + 3.5) + ' ' + (d.cy + 3.5) + 'M' + (d.cx + 3.5) + ' ' + (d.cy - 3.5) + 'L' + (d.cx - 3.5) + ' ' + (d.cy + 3.5)" [attr.stroke]="d.color" stroke-width="1.8" />
              }
            }
          }
        }
      </svg>
      <p class="mv-legend">Vista frontal. Flechas: mesial, distal, intrusión, extrusión, tip y expansión · flecha curva: rotación · ⊙ hacia vestibular · ⊗ hacia lingual (torque, inclinación, protrusión, retrusión).</p>

      @if (!disabled()) {
        <div class="mv-form">
          <label>Diente
            <select [ngModel]="selected()" (ngModelChange)="select(+$event)">
              <option [ngValue]="0">—</option>
              @for (n of allTeeth; track n) {
                <option [ngValue]="n">{{ n }}</option>
              }
            </select>
          </label>
          <div class="mv-types">
            @for (t of types; track t.key) {
              <button type="button" [class.on]="draftType() === t.key" [style.--c]="t.color" (click)="pickType(t.key)">{{ t.label }}</button>
            }
          </div>
          @let def = draftDef();
          @if (def) {
            @if (def.directions.length > 1) {
              <div class="mv-seg">
                @for (dir of def.directions; track dir) {
                  <button type="button" [class.on]="draftDir() === dir" (click)="draftDir.set(dir)">{{ dir }}</button>
                }
              </div>
            }
            <label class="mv-mag">Magnitud ({{ def.unit }})
              <input [ngModel]="draftMag()" (ngModelChange)="draftMag.set($event)" inputmode="decimal" (keydown.enter)="add()" />
            </label>
          }
          <button type="button" class="mv-add" [disabled]="!selected() || !draftType()" (click)="add()">
            Agregar{{ selected() ? ' al ' + selected() : '' }}
          </button>
        </div>
      }

      @if (list.length) {
        <div class="mv-table">
          <div class="mv-row mv-head"><span>Diente</span><span>Movimiento</span><span>Dirección</span><span>Magnitud</span><span>Estado</span><span>Observación</span><span></span></div>
          @for (mv of visibleRows(); track mv.id) {
            @let md = movementDef(mv.type);
            @let st = statusDef(mv.status);
            <div class="mv-row" [class.hl]="selected() === +mv.tooth" (mouseenter)="hover.set(mv.id)" (mouseleave)="hover.set('')">
              <button type="button" class="mv-tooth-btn" (click)="select(+mv.tooth)">{{ mv.tooth }}</button>
              <span class="mv-type" [style.color]="md?.color">{{ md?.label || '—' }}</span>
              @if (md && md.directions.length > 1) {
                <select [(ngModel)]="mv.direction" (ngModelChange)="touch()" [disabled]="disabled()">
                  <option value="">—</option>
                  @for (dir of md.directions; track dir) {
                    <option [value]="dir">{{ dir }}</option>
                  }
                </select>
              } @else {
                <span class="muted">{{ mv.direction || '—' }}</span>
              }
              <span class="mv-magcell"><input [(ngModel)]="mv.magnitude" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /> {{ md?.unit }}</span>
              <button type="button" class="mv-status" [style.background]="st.color" [disabled]="disabled()" (click)="cycleStatus(mv)" title="Cambiar estado">{{ st.label }}</button>
              <input [(ngModel)]="mv.notes" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Aparato, fase…" />
              @if (!disabled()) {
                <button type="button" class="mv-del" (click)="remove(mv)" title="Quitar del plan" aria-label="Quitar del plan">×</button>
              } @else {
                <span></span>
              }
              @for (h of hintsFor(mv); track h.text) {
                <p class="mv-hint" [attr.data-tone]="h.tone">{{ h.text }}</p>
              }
            </div>
          }
          @if (selected() && visibleRows().length !== list.length) {
            <button type="button" class="mv-link" (click)="select(selected())">Ver los {{ list.length }} movimientos</button>
          }
        </div>
      } @else {
        <p class="muted small">Sin movimientos planificados. Toque un diente del mapa, elija el movimiento y la magnitud.</p>
      }
    </div>
  `,
  styles: `
    .mv { display: grid; gap: 10px; }
    .mv-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .mv-prog { flex: 1; min-width: 220px; display: grid; gap: 4px; font-size: 12px; color: #334155; }
    .mv-bar { height: 8px; border-radius: 99px; background: #e2e8f0; overflow: hidden; }
    .mv-bar span { display: block; height: 100%; background: #16a34a; transition: width 0.3s; }
    .mv-btn { border: 1px solid #12609a; background: #f4f8fb; color: #12609a; border-radius: 99px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
    .mv-map { width: 100%; max-width: 760px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; user-select: none; }
    .mv-tooth { cursor: pointer; }
    .mv-hit { fill: transparent; }
    .mv-tooth:hover .mv-hit { fill: #eef6fc; }
    .mv-tooth.sel .mv-hit { fill: #dbeafe; stroke: #12609a; stroke-width: 1.2; }
    .mv-root { stroke: #cbd5e1; stroke-width: 5; stroke-linecap: round; }
    .mv-crown { fill: #fff; stroke: #94a3b8; stroke-width: 1.2; }
    .mv-crown.has { stroke: #12609a; stroke-width: 1.8; }
    .mv-tooth.gone .mv-crown { fill: #f1f5f9; stroke-dasharray: 3 2; }
    .mv-num { font-size: 9px; fill: #475569; text-anchor: middle; }
    .mv-legend { margin: -4px 0 0; font-size: 11px; color: #64748b; }
    .mv-form { display: grid; grid-template-columns: 90px 1fr; gap: 8px 12px; align-items: start; padding: 10px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; }
    .mv-form label { display: grid; gap: 2px; font-size: 11px; color: #475569; }
    .mv-types { display: flex; flex-wrap: wrap; gap: 4px; }
    .mv-types button { border: 1px solid #cbd5e1; background: #fff; border-radius: 99px; padding: 3px 9px; font-size: 12px; cursor: pointer; color: #334155; }
    .mv-types button.on { background: var(--c); border-color: var(--c); color: #fff; }
    .mv-seg { grid-column: 2; display: inline-flex; flex-wrap: wrap; justify-self: start; border: 1px solid #cbd5e1; border-radius: 99px; overflow: hidden; }
    .mv-seg button { border: 0; background: #fff; padding: 3px 10px; font-size: 12px; cursor: pointer; }
    .mv-seg button + button { border-left: 1px solid #cbd5e1; }
    .mv-seg button.on { background: #12609a; color: #fff; }
    .mv-mag { grid-column: 2; max-width: 160px; }
    .mv-add { grid-column: 2; justify-self: start; border: 0; background: #12609a; color: #fff; border-radius: 10px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
    .mv-add:disabled { opacity: 0.45; cursor: default; }
    .mv-table { display: grid; gap: 2px; font-size: 12px; }
    .mv-row { display: grid; grid-template-columns: 52px 130px 150px 90px 100px 1fr 28px; gap: 6px; align-items: center; padding: 4px 6px; border-radius: 10px; }
    .mv-row.hl { background: #eef6fc; }
    .mv-head { color: #64748b; font-weight: 600; font-size: 11px; }
    .mv-row input, .mv-row select { width: 100%; min-width: 0; }
    .mv-magcell { display: flex; gap: 4px; align-items: center; }
    .mv-magcell input { width: 52px; }
    .mv-tooth-btn { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 2px 0; font-weight: 600; cursor: pointer; }
    .mv-type { font-weight: 600; }
    .mv-status { border: 0; color: #fff; border-radius: 99px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
    .mv-status:disabled { cursor: default; }
    .mv-del { border: 0; background: none; color: #94a3b8; font-size: 18px; cursor: pointer; }
    .mv-del:hover { color: #dc2626; }
    .mv-hint { grid-column: 2 / -1; margin: 0; padding: 3px 8px; border-radius: 8px; font-size: 11px; }
    .mv-hint[data-tone='warn'] { background: #fffbeb; color: #92400e; }
    .mv-hint[data-tone='danger'] { background: #fef2f2; color: #991b1b; }
    .mv-link { border: 0; background: none; color: #12609a; text-decoration: underline; font-size: 12px; cursor: pointer; justify-self: start; }
    @media (max-width: 860px) {
      .mv-row { grid-template-columns: 52px 1fr 1fr; }
      .mv-head { display: none; }
    }
  `,
})
export class OrthoMovementPlan {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly CELL = CELL;
  readonly width = CELL * 16 + GAP;
  readonly types = MOVEMENT_TYPES;
  readonly allTeeth = [...UPPER_TEETH, ...LOWER_TEETH];
  readonly teeth = [
    ...UPPER_TEETH.map((n, i) => ({ n, upper: true, x: this.cellX(i) })),
    ...LOWER_TEETH.map((n, i) => ({ n, upper: false, x: this.cellX(i) })),
  ];
  readonly movementDef = movementDef;
  readonly statusDef = movementStatusDef;

  readonly selected = signal(0);
  readonly draftType = signal<OrthoMovementType | ''>('');
  readonly draftDir = signal('');
  readonly draftMag = signal('');
  readonly hover = signal('');

  private cellX(i: number) {
    return i * CELL + (i >= 8 ? GAP : 0) + 2;
  }

  draftDef() {
    return movementDef(this.draftType());
  }

  progress() {
    return movementProgress(this.data().orthoMovements);
  }

  importable() {
    return movementsFromMarks(this.data().odontogram, this.data().orthoMovements);
  }

  missingMarks() {
    return this.pendingMarks().length;
  }

  private pendingMarks() {
    const odo = this.data().odontogram;
    const out: Array<{ tooth: string; mark: string }> = [];
    for (const mv of this.data().orthoMovements) {
      const mark = movementDef(mv.type)?.mark;
      if (!mark || mv.status === 'SUSPENDIDO' || mv.status === 'LOGRADO') continue;
      if (odo[mv.tooth]?.marks?.includes(mark as ToothMark)) continue;
      if (!out.some((o) => o.tooth === mv.tooth && o.mark === mark)) out.push({ tooth: mv.tooth, mark });
    }
    return out;
  }

  isGone(n: number) {
    const c = this.data().odontogram[String(n)]?.conditions ?? [];
    return c.includes('AUSENTE') || c.includes('IMPLANTE');
  }

  countFor(n: number) {
    return this.data().orthoMovements.filter((m) => m.tooth === String(n) && m.status !== 'SUSPENDIDO').length;
  }

  visibleRows() {
    const list = this.data().orthoMovements;
    const sel = this.selected();
    const rows = sel && list.some((m) => m.tooth === String(sel)) ? list.filter((m) => m.tooth === String(sel)) : list;
    return [...rows].sort((a, b) => Number(a.tooth) - Number(b.tooth));
  }

  hintsFor(mv: OrthoMovement) {
    return movementHints(mv, this.data().odontogram[mv.tooth]);
  }

  /** Coordenadas de los símbolos; varios movimientos del mismo diente se reparten a lo alto de la corona. */
  drawn(): DrawnGlyph[] {
    const out: DrawnGlyph[] = [];
    const byTooth = new Map<string, OrthoMovement[]>();
    for (const mv of this.data().orthoMovements) {
      if (!mv.type || mv.status === 'SUSPENDIDO') continue;
      byTooth.set(mv.tooth, [...(byTooth.get(mv.tooth) ?? []), mv]);
    }
    for (const [tooth, moves] of byTooth) {
      const n = Number(tooth);
      const t = this.teeth.find((x) => x.n === n);
      if (!t) continue;
      const shown = moves.slice(0, 3);
      shown.forEach((mv, k) => {
        const g = movementGlyph(n, mv.type, mv.direction);
        if (!g) return;
        const cx = t.x + 18;
        const baseY = isUpper(n) ? 53 : 121;
        const cy = baseY + (k - (shown.length - 1) / 2) * (shown.length > 1 ? 15 : 0);
        const L = shown.length > 1 ? 8 : 13;
        const color = this.hover() === mv.id ? '#f59e0b' : mv.status === 'LOGRADO' ? '#16a34a' : (movementDef(mv.type)?.color ?? '#12609a');
        const d: DrawnGlyph = { key: mv.id, color, g, cx, cy };
        if (g.kind === 'line') {
          const len = Math.hypot(g.dx, g.dy) || 1;
          const ux = g.dx / len;
          const uy = g.dy / len;
          const ex = cx + ux * L;
          const ey = cy + uy * L;
          d.line = `M${cx - ux * L} ${cy - uy * L}L${ex - ux * 4} ${ey - uy * 4}`;
          d.head = `M${ex} ${ey}L${ex - ux * 6 - uy * 4} ${ey - uy * 6 + ux * 4}L${ex - ux * 6 + uy * 4} ${ey - uy * 6 - ux * 4}Z`;
        } else if (g.kind === 'rot') {
          const s = g.toward;
          const x0 = cx - s * 9;
          const x1 = cx + s * 9;
          d.line = `M${x0} ${cy + 3}A9 9 0 0 ${s > 0 ? 1 : 0} ${x1} ${cy + 3}`;
          d.head = `M${x1 + s * 3.5} ${cy}L${x1 - s * 3.5} ${cy}L${x1} ${cy + 6}Z`;
        }
        out.push(d);
      });
    }
    return out;
  }

  touch() {
    this.changed.emit();
  }

  select(n: number) {
    this.selected.set(this.selected() === n ? 0 : n);
  }

  pickType(key: OrthoMovementType) {
    if (this.draftType() === key) {
      this.draftType.set('');
      return;
    }
    this.draftType.set(key);
    const def = movementDef(key);
    this.draftDir.set(def && def.directions.length === 1 ? def.directions[0] : '');
  }

  add() {
    const tooth = this.selected();
    const type = this.draftType();
    if (this.disabled() || !tooth || !type) return;
    this.data().orthoMovements.push({
      id: newMovementId(),
      tooth: String(tooth),
      type,
      direction: this.draftDir(),
      magnitude: this.draftMag().trim(),
      status: 'PLANIFICADO',
      notes: '',
      createdAt: new Date().toISOString(),
    });
    this.draftMag.set('');
    this.touch();
  }

  cycleStatus(mv: OrthoMovement) {
    if (this.disabled()) return;
    const i = MOVEMENT_STATUSES.findIndex((s) => s.key === mv.status);
    mv.status = MOVEMENT_STATUSES[(i + 1) % MOVEMENT_STATUSES.length].key;
    this.touch();
  }

  remove(mv: OrthoMovement) {
    if (this.disabled()) return;
    if (!confirm(`¿Quitar del plan: ${movementText(mv) || 'movimiento'} en el ${mv.tooth}?`)) return;
    const list = this.data().orthoMovements;
    const i = list.indexOf(mv);
    if (i >= 0) list.splice(i, 1);
    this.touch();
  }

  importMarks() {
    const rows = this.importable();
    if (!rows.length) return;
    this.data().orthoMovements.push(...rows);
    this.touch();
  }

  markOdontogram() {
    const odo = this.data().odontogram;
    for (const { tooth, mark } of this.pendingMarks()) {
      const rec = (odo[tooth] ??= {});
      rec.marks = [...(rec.marks ?? []), mark as ToothMark];
    }
    this.touch();
  }
}
