import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BillingApiService, PlanItemBalance, TreatmentPlanBilling } from '../../billing/billing-api.service';

/** Cruce del plan de tratamiento con los recibos de caja: abonado y saldo por procedimiento. */
@Component({
  selector: 'app-plan-payments',
  imports: [CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data(); as d) {
      @let g = group();
      <div class="card">
        <div class="head">
          <div>
            <strong>Pagos en caja</strong>
            <small>{{ g.paid | currency: 'COP' : 'symbol-narrow' : '1.0-0' }} abonado de {{ g.net | currency: 'COP' : 'symbol-narrow' : '1.0-0' }} · saldo {{ g.balance | currency: 'COP' : 'symbol-narrow' : '1.0-0' }}</small>
          </div>
          <div class="actions">
            <button type="button" class="ghost" (click)="refresh()" [disabled]="loading()">{{ loading() ? 'Actualizando…' : 'Actualizar' }}</button>
            @if (g.items.length) {
              <button type="button" class="ghost" (click)="open.set(!open())">{{ open() ? 'Ocultar detalle' : 'Ver detalle' }}</button>
            }
            <button type="button" class="primary" (click)="goToReceipt()">Generar recibo de caja</button>
          </div>
        </div>
        <div class="bar"><span [style.width.%]="pct()"></span></div>
        @if (!g.items.length) {
          <p class="muted">Aún no hay {{ source() === 'ORTHO' ? 'conceptos con valor en el presupuesto de ortodoncia' : 'procedimientos con valor en el plan' }} guardados en la historia.</p>
        }
        @if (open()) {
          <ul>
            @for (it of g.items; track it.key) {
              <li>
                <span class="lbl">{{ it.label }}<small>{{ it.detail }}</small></span>
                <span class="mini"><span [style.width.%]="itemPct(it)"></span></span>
                <span class="val" [class.ok]="it.balance <= 0">
                  {{ it.balance <= 0 ? 'Pagado' : 'Saldo ' + (it.balance | currency: 'COP' : 'symbol-narrow' : '1.0-0') }}
                </span>
              </li>
            }
          </ul>
        }
        <p class="hint">Refleja lo guardado en la historia{{ source() === 'ORTHO' ? ' y el seguimiento de ortodoncia' : '' }}. Los recibos se emiten en Caja.</p>
      </div>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; margin-top: 10px; }
    .card { border: 1px solid #dbe7ea; border-radius: 12px; padding: 10px 12px; background: #fbfdfd; }
    .head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: center; }
    .head div:first-child { display: grid; }
    .head small, .muted, .hint { color: #6a8085; font-size: 12px; }
    .hint { margin: 6px 0 0; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .bar { height: 6px; border-radius: 99px; background: #e8eef0; overflow: hidden; margin: 8px 0 4px; }
    .bar span, .mini span { display: block; height: 100%; background: #16a34a; transition: width 0.3s; }
    ul { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 4px; }
    li { display: grid; grid-template-columns: 1fr 90px auto; gap: 8px; align-items: center; font-size: 13px; }
    .lbl { display: grid; min-width: 0; }
    .lbl small { color: #6a8085; font-size: 11px; }
    .mini { height: 5px; border-radius: 99px; background: #e8eef0; overflow: hidden; }
    .val { font-size: 12px; color: #8a5a00; white-space: nowrap; }
    .val.ok { color: #16a34a; font-weight: 600; }
  `,
})
export class PlanPayments {
  private readonly api = inject(BillingApiService);
  private readonly router = inject(Router);

  readonly patientId = input('');
  readonly patientName = input('');
  readonly source = input<'PLAN' | 'ORTHO'>('PLAN');

  readonly data = signal<TreatmentPlanBilling | null>(null);
  readonly loading = signal(false);
  readonly open = signal(false);

  readonly group = computed(() => {
    const d = this.data()!;
    return this.source() === 'ORTHO' ? d.ortho : d.plan;
  });

  constructor() {
    effect(() => this.load(this.patientId()));
  }

  refresh() {
    this.load(this.patientId());
  }

  private load(patientId: string) {
    if (!patientId) {
      this.data.set(null);
      return;
    }
    this.loading.set(true);
    this.api.treatmentPlan(patientId).subscribe({
      next: (d) => {
        this.loading.set(false);
        if (this.patientId() === patientId) this.data.set(d);
      },
      error: () => this.loading.set(false),
    });
  }

  pct() {
    const g = this.group();
    return g.net ? Math.min(100, Math.round((g.paid / g.net) * 100)) : 0;
  }

  itemPct(it: PlanItemBalance) {
    return it.net ? Math.min(100, Math.round((it.paid / it.net) * 100)) : 0;
  }

  goToReceipt() {
    this.router.navigate(['/consultorio/recibos'], {
      queryParams: { patientId: this.patientId(), ...(this.patientName() ? { patientName: this.patientName() } : {}) },
    });
  }
}
