import { DecimalPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DentistryContent, TREATMENT_STATUSES, TreatmentPlanRow, TreatmentStatus } from './dentistry.models';
import {
  BUDGET_PAYMENT_METHODS,
  TREATMENT_PHASES,
  TreatmentPhase,
  budgetTotals,
  parseMoney,
  suggestPhase,
} from './treatment-budget.models';

const NEXT_STATUS: Record<TreatmentStatus, TreatmentStatus> = {
  PENDIENTE: 'EN_TRATAMIENTO',
  EN_TRATAMIENTO: 'TERMINADO',
  TERMINADO: 'PENDIENTE',
  CANCELADO: 'PENDIENTE',
};

/** Tablero del plan por fases y presupuesto; muta `data` como el resto de la historia odontológica. */
@Component({
  selector: 'app-dental-treatment-budget',
  imports: [FormsModule, DecimalPipe],
  template: `
    @let t = totals();
    <div class="tb">
      <div class="tb-head">
        <h4>Plan por fases</h4>
        @if (t.unphased && !disabled()) {
          <button type="button" class="ghost" (click)="autoClassify()" title="Asigna la fase según el procedimiento; puede corregirla en la tabla">
            Clasificar {{ t.unphased }} sin fase automáticamente
          </button>
        }
      </div>
      <div class="tb-phases">
        @for (p of phases; track p.key; let i = $index) {
          @let s = t.phases[i];
          <section class="tb-phase" [style.--c]="p.color" (dragover)="$event.preventDefault()" (drop)="dropOn(p.key)">
            <header>
              <strong>{{ p.label }}</strong>
              <small>{{ p.hint }}</small>
            </header>
            <div class="tb-bar" [title]="s.done + ' de ' + s.count + ' terminados'">
              <span [style.width.%]="s.count ? (s.done / s.count) * 100 : 0"></span>
            </div>
            <p class="tb-meta">
              {{ s.done }}/{{ s.count }} terminados
              @if (s.net) {
                · <b>{{ '$' }}{{ s.net | number: '1.0-0' }}</b>
              }
            </p>
            <ul>
              @for (r of rowsOf(p.key); track $index) {
                <li [attr.data-status]="r.status" [attr.draggable]="!disabled()" (dragstart)="dragRow = r">
                  <button type="button" class="tb-status" [disabled]="disabled()" (click)="cycle(r)" [title]="'Estado: ' + statusLabel(r.status) + ' (clic para avanzar)'">
                    {{ statusIcon(r.status) }}
                  </button>
                  <span class="tb-desc">
                    {{ r.description || r.code }}
                    @if (r.tooth) {
                      <small>· {{ r.tooth }}</small>
                    }
                  </span>
                </li>
              } @empty {
                <li class="tb-empty">Arrastre aquí o elija la fase en la tabla</li>
              }
            </ul>
          </section>
        }
      </div>
      @if (unphasedRows().length) {
        <p class="tb-unphased" (dragover)="$event.preventDefault()" (drop)="dropOn('')">
          Sin fase:
          @for (r of unphasedRows(); track $index) {
            <span class="tb-chip" [attr.draggable]="!disabled()" (dragstart)="dragRow = r">{{ r.description || r.code }}</span>
          }
        </p>
      }

      <div class="tb-head">
        <h4>Presupuesto</h4>
        @if (b().acceptedAt) {
          <span class="tb-accepted">Aceptado {{ acceptedDate() }}{{ b().acceptedBy ? ' · ' + b().acceptedBy : '' }}</span>
        }
      </div>
      <div class="tb-budget">
        <dl class="tb-sum">
          <div><dt>Subtotal (cantidad × valor)</dt><dd>{{ '$' }}{{ t.gross | number: '1.0-0' }}</dd></div>
          @if (t.rowDiscounts) {
            <div><dt>Descuentos por procedimiento</dt><dd>− {{ '$' }}{{ t.rowDiscounts | number: '1.0-0' }}</dd></div>
          }
          @if (t.globalDiscount) {
            <div><dt>Descuento general{{ b().discountReason ? ' (' + b().discountReason + ')' : '' }}</dt><dd>− {{ '$' }}{{ t.globalDiscount | number: '1.0-0' }}</dd></div>
          }
          <div class="tb-total"><dt>Total</dt><dd>{{ '$' }}{{ t.total | number: '1.0-0' }}</dd></div>
          @if (t.total) {
            <div class="tb-split">
              <dt>Ejecutado / pendiente</dt>
              <dd>{{ '$' }}{{ t.doneValue | number: '1.0-0' }} / {{ '$' }}{{ t.pendingValue | number: '1.0-0' }}</dd>
            </div>
            @if (installmentValue(); as q) {
              <div><dt>Valor por cuota ({{ b().installments }})</dt><dd>{{ '$' }}{{ q | number: '1.0-0' }}</dd></div>
            }
          }
        </dl>
        <div class="tb-form">
          <label>
            Descuento general
            <span class="tb-disc">
              <select [(ngModel)]="b().discountType" (ngModelChange)="touch()" [disabled]="disabled()" aria-label="Tipo de descuento">
                <option value="PCT">%</option>
                <option value="AMOUNT">$</option>
              </select>
              <input [(ngModel)]="b().discountValue" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" placeholder="0" />
            </span>
          </label>
          <label>
            Motivo del descuento
            <input [(ngModel)]="b().discountReason" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Convenio, pago de contado…" />
          </label>
          <label>
            Forma de pago
            <select [(ngModel)]="b().paymentMethod" (ngModelChange)="touch()" [disabled]="disabled()">
              <option value="">Seleccione…</option>
              @for (m of paymentMethods; track m) {
                <option [value]="m">{{ m }}</option>
              }
            </select>
          </label>
          <label>
            N.º de cuotas
            <input [(ngModel)]="b().installments" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" placeholder="—" />
          </label>
          <label>
            Válido hasta
            <input type="date" [(ngModel)]="b().validUntil" (ngModelChange)="touch()" [readonly]="disabled()" />
          </label>
          <label class="tb-wide">
            Observaciones del presupuesto
            <input [(ngModel)]="b().notes" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Incluye / no incluye, laboratorio, garantía…" />
          </label>
          @if (expired()) {
            <p class="tb-warn tb-wide">La vigencia del presupuesto ya venció; revise valores antes de continuar.</p>
          }
          @if (discountTooHigh()) {
            <p class="tb-warn tb-wide">El descuento general supera el 50 %; verifique que sea correcto.</p>
          }
          @if (!disabled()) {
            <div class="tb-actions tb-wide">
              @if (!b().acceptedAt) {
                <button type="button" class="primary" [disabled]="!t.total" (click)="accept()">Registrar aceptación del paciente</button>
              } @else {
                <button type="button" class="ghost" (click)="unaccept()">Anular aceptación</button>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .tb { display: grid; gap: 10px; margin-top: 12px; }
    .tb-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
    .tb-head h4 { margin: 0; font-size: 14px; color: #123b60; }
    .tb-phases { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; }
    .tb-phase { border: 1px solid #dbe4ee; border-top: 4px solid var(--c); border-radius: 10px; padding: 10px; background: #fff; min-height: 120px; }
    .tb-phase header { display: grid; gap: 2px; }
    .tb-phase header strong { font-size: 13px; color: #0f172a; }
    .tb-phase header small { font-size: 11px; color: #64748b; }
    .tb-bar { height: 6px; margin: 8px 0 4px; border-radius: 99px; background: #eef2f7; overflow: hidden; }
    .tb-bar span { display: block; height: 100%; background: var(--c); transition: width 0.2s; }
    .tb-meta { margin: 0 0 6px; font-size: 11px; color: #475569; }
    .tb-phase ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    .tb-phase li { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 6px; background: #f8fafc; font-size: 12px; }
    .tb-phase li[draggable='true'] { cursor: grab; }
    .tb-phase li[data-status='TERMINADO'] .tb-desc { text-decoration: line-through; color: #64748b; }
    .tb-phase li[data-status='CANCELADO'] { opacity: 0.5; }
    .tb-phase li.tb-empty { background: none; color: #94a3b8; font-style: italic; border: 1px dashed #cbd5e1; justify-content: center; }
    .tb-status { flex: none; width: 22px; height: 22px; border: 1px solid #cbd5e1; border-radius: 50%; background: #fff; font-size: 12px; line-height: 1; cursor: pointer; padding: 0; }
    .tb-status:disabled { cursor: default; }
    .tb-desc small { color: #64748b; }
    .tb-unphased { margin: 0; padding: 8px; border: 1px dashed #f59e0b; border-radius: 8px; background: #fffbeb; font-size: 12px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .tb-chip { padding: 2px 8px; border-radius: 99px; background: #fff; border: 1px solid #fcd34d; cursor: grab; }
    .tb-accepted { padding: 3px 10px; border-radius: 99px; background: #dcfce7; color: #166534; font-size: 12px; font-weight: 600; }
    .tb-budget { display: grid; grid-template-columns: minmax(240px, 1fr) 2fr; gap: 14px; padding: 12px; border: 1px solid #dbe4ee; border-radius: 10px; background: #f4f8fb; }
    @media (max-width: 800px) { .tb-budget { grid-template-columns: 1fr; } }
    .tb-sum { margin: 0; display: grid; gap: 6px; align-content: start; }
    .tb-sum div { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
    .tb-sum dt { color: #475569; }
    .tb-sum dd { margin: 0; font-variant-numeric: tabular-nums; }
    .tb-total { padding-top: 6px; border-top: 1px solid #cbd5e1; font-size: 16px !important; font-weight: 700; color: #123b60; }
    .tb-split { font-size: 12px !important; }
    .tb-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; align-content: start; }
    .tb-form label { display: grid; gap: 3px; font-size: 12px; color: #334155; }
    .tb-wide { grid-column: 1 / -1; }
    .tb-disc { display: flex; gap: 4px; }
    .tb-disc select { width: 56px; }
    .tb-disc input { flex: 1; min-width: 0; }
    .tb-warn { margin: 0; padding: 6px 8px; border-radius: 6px; background: #fef3c7; color: #92400e; font-size: 12px; }
    .tb-actions { display: flex; gap: 8px; }
  `,
})
export class DentalTreatmentBudget {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly patientName = input('');
  readonly changed = output<void>();

  readonly phases = TREATMENT_PHASES;
  readonly paymentMethods = BUDGET_PAYMENT_METHODS;
  dragRow: TreatmentPlanRow | null = null;

  readonly b = computed(() => this.data().budget);
  totals() {
    return budgetTotals(this.data().treatmentPlan, this.data().budget);
  }

  private activeRows() {
    return this.data().treatmentPlan.filter((r) => r.description.trim() || r.code.trim());
  }

  rowsOf(phase: TreatmentPhase) {
    return this.activeRows().filter((r) => r.phase === phase);
  }

  unphasedRows() {
    return this.activeRows().filter((r) => !r.phase && r.status !== 'CANCELADO');
  }

  acceptedDate() {
    const v = this.b().acceptedAt;
    return v ? new Date(v).toLocaleDateString('es-CO') : '';
  }

  expired() {
    const v = this.b().validUntil;
    return !!v && !this.b().acceptedAt && v < new Date().toISOString().slice(0, 10);
  }

  discountTooHigh() {
    const t = this.totals();
    return t.afterRows > 0 && t.globalDiscount / t.afterRows > 0.5;
  }

  installmentValue() {
    const n = Math.floor(parseMoney(this.b().installments));
    const t = this.totals();
    return n > 1 && t.total ? Math.ceil(t.total / n) : 0;
  }

  statusLabel(s: TreatmentStatus) {
    return TREATMENT_STATUSES.find((x) => x.key === s)?.label || s;
  }

  statusIcon(s: TreatmentStatus) {
    return s === 'TERMINADO' ? '✓' : s === 'EN_TRATAMIENTO' ? '◐' : s === 'CANCELADO' ? '✕' : '○';
  }

  touch() {
    this.changed.emit();
  }

  cycle(r: TreatmentPlanRow) {
    if (this.disabled()) return;
    r.status = NEXT_STATUS[r.status] || 'PENDIENTE';
    this.touch();
  }

  dropOn(phase: TreatmentPhase) {
    const r = this.dragRow;
    this.dragRow = null;
    if (!r || this.disabled() || r.phase === phase) return;
    r.phase = phase;
    this.touch();
  }

  autoClassify() {
    let n = 0;
    for (const r of this.activeRows()) {
      if (r.phase) continue;
      const p = suggestPhase(`${r.description} ${r.code}`);
      if (p) {
        r.phase = p;
        n++;
      }
    }
    if (!n) alert('No se pudo sugerir la fase de esos procedimientos; elíjala en la columna «Fase» de la tabla.');
    this.touch();
  }

  accept() {
    if (this.disabled()) return;
    const who = this.patientName().trim();
    if (!confirm(`¿Registrar que ${who || 'el paciente'} acepta el presupuesto por $${this.totals().total.toLocaleString('es-CO')}?`)) return;
    this.b().acceptedAt = new Date().toISOString();
    this.b().acceptedBy = who;
    this.touch();
  }

  unaccept() {
    if (this.disabled() || !confirm('¿Anular la aceptación registrada del presupuesto?')) return;
    this.b().acceptedAt = '';
    this.b().acceptedBy = '';
    this.touch();
  }
}
