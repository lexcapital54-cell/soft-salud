import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BillingApiService, PlanGroup, PlanItemBalance, TreatmentPlanBilling } from './billing-api.service';

export interface PlanReceiptLine {
  description: string;
  cupsCode?: string;
  quantity: number;
  unitPrice: number;
  planItemKey: string;
}

/** Carga el plan de tratamiento de la historia (odontología y ortodoncia) para cobrarlo en el recibo. */
@Component({
  selector: 'app-receipt-plan-picker',
  imports: [FormsModule, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <p class="muted">Cargando historia y plan de tratamiento…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else if (data(); as d) {
      <div class="patient">
        <div>
          <strong>{{ d.patient.fullName }}</strong>
          <small>{{ d.patient.document }}{{ d.patient.eps ? ' · ' + d.patient.eps : '' }}{{ d.patient.phone ? ' · ' + d.patient.phone : '' }}</small>
        </div>
        @if (d.record; as r) {
          <span class="badge">{{ r.code }} · {{ r.specialty }} · {{ r.signed ? 'Firmada' : 'En borrador' }}</span>
        } @else {
          <span class="badge warn">Sin historia clínica</span>
        }
      </div>

      @if (!d.plan.items.length && !d.ortho.items.length) {
        <p class="muted">
          {{ d.record ? 'La historia no tiene procedimientos con valor en el plan de tratamiento ni presupuesto de ortodoncia.' : 'El paciente aún no tiene historia clínica.' }}
          Use la línea manual de abajo.
        </p>
      }

      @for (g of groups(); track g.id) {
        @if (g.group.items.length) {
          <section class="group">
            <header>
              <h3>{{ g.title }}</h3>
              <span class="sum">{{ g.group.paid | currency: 'COP' : 'symbol-narrow' : '1.0-0' }} de {{ g.group.net | currency: 'COP' : 'symbol-narrow' : '1.0-0' }}</span>
            </header>
            <div class="bar" [attr.aria-label]="'Abonado ' + pct(g.group) + '%'"><span [style.width.%]="pct(g.group)"></span></div>
            @if (g.id === 'ORTHO' && d.ortho.financing.installments) {
              <p class="fin">
                Cuota inicial {{ d.ortho.financing.downPayment | currency: 'COP' : 'symbol-narrow' : '1.0-0' }} ·
                {{ d.ortho.financing.installments }} cuotas de {{ d.ortho.financing.installmentValue | currency: 'COP' : 'symbol-narrow' : '1.0-0' }}
              </p>
            }
            <ul>
              @for (it of g.group.items; track it.key) {
                <li [class.sel]="isSelected(it)" [class.done]="it.balance <= 0">
                  <label class="pick">
                    <input type="checkbox" [checked]="isSelected(it)" [disabled]="it.balance <= 0" (change)="toggle(it)" />
                    <span>
                      <b>{{ it.label }}</b>
                      <small>{{ it.detail || it.status }}{{ it.cupsCode ? ' · CUPS ' + it.cupsCode : '' }}</small>
                    </span>
                  </label>
                  <span class="nums">
                    <small>Valor {{ it.net | currency: 'COP' : 'symbol-narrow' : '1.0-0' }}</small>
                    @if (it.balance <= 0) {
                      <em class="paid">Pagado</em>
                    } @else {
                      <small>Saldo {{ it.balance | currency: 'COP' : 'symbol-narrow' : '1.0-0' }}</small>
                    }
                  </span>
                  @if (isSelected(it)) {
                    <span class="amount">
                      <input type="number" min="1" [max]="it.balance" [ngModel]="amounts()[it.key]" (ngModelChange)="setAmount(it, $event)" aria-label="Valor a cobrar" />
                      <button type="button" class="chip" (click)="setAmount(it, it.balance)">Saldo</button>
                      @if (g.id === 'ORTHO' && d.ortho.financing.installmentValue && d.ortho.financing.installmentValue < it.balance) {
                        <button type="button" class="chip" (click)="setAmount(it, d.ortho.financing.installmentValue)">Cuota</button>
                      }
                    </span>
                  }
                </li>
              }
            </ul>
          </section>
        }
      }

      @if (lines().length) {
        <p class="total">Desde el plan: <strong>{{ linesTotal() | currency: 'COP' : 'symbol-narrow' : '1.0-0' }}</strong> ({{ lines().length }} concepto{{ lines().length === 1 ? '' : 's' }})</p>
      }
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .muted { color: #6a8085; margin: 6px 0; }
    .err { color: #b42318; }
    .patient { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 12px; background: #f3f7f8; margin-bottom: 10px; }
    .patient div { display: grid; }
    .patient small { color: #6a8085; }
    .badge { font-size: 12px; padding: 3px 10px; border-radius: 999px; background: #e0f2f1; color: #0d7377; }
    .badge.warn { background: #fff6e0; color: #8a5a00; }
    .group { border: 1px solid #e3ecee; border-radius: 12px; padding: 10px 12px; margin-bottom: 10px; }
    header { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
    h3 { margin: 0; font-size: 15px; color: #003d4c; font-weight: 600; }
    .sum { font-size: 12px; color: #6a8085; }
    .bar { height: 6px; border-radius: 99px; background: #e8eef0; overflow: hidden; margin: 6px 0 8px; }
    .bar span { display: block; height: 100%; background: #16a34a; transition: width 0.3s; }
    .fin { font-size: 12px; color: #475569; margin: 0 0 6px; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    li { display: grid; grid-template-columns: 1fr auto; gap: 6px 10px; align-items: center; padding: 8px; border-radius: 10px; border: 1px solid transparent; transition: background 0.15s, border-color 0.15s; }
    li:hover { background: #f7fafb; }
    li.sel { border-color: #0d7377; background: #f0fbfa; }
    li.done { opacity: 0.6; }
    .pick { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; min-width: 0; }
    .pick span { display: grid; min-width: 0; }
    .pick small, .nums small { color: #6a8085; font-size: 12px; }
    .nums { display: grid; text-align: right; }
    .paid { color: #16a34a; font-style: normal; font-weight: 600; font-size: 12px; }
    .amount { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: flex-end; }
    .amount input { width: 140px; padding: 6px 8px; border: 1px solid #cfdcdf; border-radius: 8px; font: inherit; }
    .chip { border: 1px solid #cfdcdf; background: #fff; border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; }
    .chip:hover { border-color: #0d7377; color: #0d7377; }
    .total { text-align: right; margin: 4px 0 0; }
  `,
})
export class ReceiptPlanPicker {
  private readonly api = inject(BillingApiService);

  readonly patientId = input('');
  readonly reloadKey = input(0);
  readonly linesChange = output<PlanReceiptLine[]>();

  readonly data = signal<TreatmentPlanBilling | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly amounts = signal<Record<string, number>>({});

  readonly groups = computed(() => {
    const d = this.data();
    if (!d) return [];
    return [
      { id: 'PLAN', title: 'Plan de tratamiento', group: d.plan as PlanGroup },
      { id: 'ORTHO', title: 'Presupuesto de ortodoncia', group: d.ortho as PlanGroup },
    ];
  });

  readonly lines = computed<PlanReceiptLine[]>(() => {
    const d = this.data();
    if (!d) return [];
    const amounts = this.amounts();
    return [...d.plan.items, ...d.ortho.items]
      .filter((it) => (amounts[it.key] ?? 0) > 0)
      .map((it) => {
        const amount = Math.min(it.balance, Math.round(amounts[it.key]));
        const partial = amount < it.balance;
        return {
          description: `${it.label}${it.tooth ? ' (pieza ' + it.tooth + ')' : ''}${partial ? ' — abono' : ''}`.slice(0, 255),
          cupsCode: it.cupsCode || undefined,
          quantity: 1,
          unitPrice: amount,
          planItemKey: it.key,
        };
      });
  });

  readonly linesTotal = computed(() => this.lines().reduce((s, l) => s + l.unitPrice, 0));

  constructor() {
    effect(() => {
      const id = this.patientId();
      this.reloadKey();
      this.load(id);
    });
    effect(() => this.linesChange.emit(this.lines()));
  }

  private load(patientId: string) {
    this.amounts.set({});
    this.data.set(null);
    this.error.set('');
    if (!patientId) return;
    this.loading.set(true);
    this.api.treatmentPlan(patientId).subscribe({
      next: (d) => {
        if (this.patientId() !== patientId) return;
        this.data.set(d);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'No se pudo cargar el plan de tratamiento.');
      },
    });
  }

  pct(g: PlanGroup) {
    return g.net ? Math.min(100, Math.round((g.paid / g.net) * 100)) : 0;
  }

  isSelected(it: PlanItemBalance) {
    return it.key in this.amounts();
  }

  toggle(it: PlanItemBalance) {
    this.amounts.update((a) => {
      const next = { ...a };
      if (it.key in next) delete next[it.key];
      else next[it.key] = it.balance;
      return next;
    });
  }

  setAmount(it: PlanItemBalance, value: number) {
    const n = Math.max(0, Math.min(it.balance, Number(value) || 0));
    this.amounts.update((a) => ({ ...a, [it.key]: n }));
  }
}
