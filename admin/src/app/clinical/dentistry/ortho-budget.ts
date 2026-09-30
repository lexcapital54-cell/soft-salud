import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DentistryContent } from './dentistry.models';
import {
  BUDGET_CONCEPTS,
  BUDGET_STATUSES,
  OrthoBudgetItem,
  budgetTotals,
  installmentDates,
  itemNet,
  money,
  newBudgetId,
} from './ortho-budget.models';
import { parseDurationMonths } from './ortho-follow.models';

/** Presupuesto de ortodoncia por conceptos con estados y plan de financiación. */
@Component({
  selector: 'app-ortho-budget',
  imports: [FormsModule],
  template: `
    @let b = data().orthoBudget;
    @let t = totals();
    <div class="bd">
      @if (!disabled()) {
        <div class="bd-quick">
          <span class="bd-lbl">Agregar concepto:</span>
          @for (c of concepts; track c.label) {
            <button type="button" [style.--c]="c.color" (click)="add(c.label)">{{ c.label }}</button>
          }
          @if (!b.items.length) {
            <button type="button" class="bd-tpl" (click)="template()">Plantilla de ortodoncia fija</button>
          }
        </div>
      }

      @if (b.items.length) {
        <div class="bd-table">
          <div class="bd-row bd-h">
            <span>Concepto</span><span>Detalle</span><span>Cant.</span><span>Valor unitario</span><span>Desc. %</span><span>Total</span><span>Estado</span><span></span>
          </div>
          @for (i of b.items; track i.id) {
            <div class="bd-row" [class.off]="i.status === 'Cancelado'">
              <span class="bd-concept"><i [style.background]="conceptColor(i.concept)"></i>
                <select [(ngModel)]="i.concept" (ngModelChange)="touch()" [disabled]="disabled()">
                  @for (c of concepts; track c.label) {
                    <option [value]="c.label">{{ c.label }}</option>
                  }
                </select>
              </span>
              <input [(ngModel)]="i.description" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Brackets metálicos, 24 controles…" />
              <input [(ngModel)]="i.qty" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" class="bd-n" />
              <input [(ngModel)]="i.unitValue" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" placeholder="0" />
              <input [(ngModel)]="i.discountPct" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" class="bd-n" placeholder="0" />
              <b class="bd-money">{{ fmt(net(i)) }}</b>
              <select class="bd-status" [(ngModel)]="i.status" (ngModelChange)="touch()" [disabled]="disabled()" [style.--c]="statusColor(i.status)">
                @for (s of statuses; track s.label) {
                  <option [value]="s.label">{{ s.label }}</option>
                }
              </select>
              @if (!disabled() && (i.status === 'Cotizado' || i.status === 'Cancelado')) {
                <button type="button" class="bd-x" title="Quitar concepto" (click)="remove(i)">×</button>
              } @else {
                <span></span>
              }
            </div>
          }
        </div>

        <div class="bd-sum">
          <div class="bd-stack" role="img" aria-label="Distribución por concepto">
            @for (c of t.byConcept; track c.label) {
              <span
                [style.width.%]="c.pct"
                [style.background]="c.color"
                [class.dim]="hover() && hover() !== c.label"
                [title]="c.label + ': ' + fmt(c.value)"
                (mouseenter)="hover.set(c.label)"
                (mouseleave)="hover.set('')"
              ></span>
            }
          </div>
          <div class="bd-legend">
            @for (c of t.byConcept; track c.label) {
              <span (mouseenter)="hover.set(c.label)" (mouseleave)="hover.set('')" [class.on]="hover() === c.label">
                <i [style.background]="c.color"></i>{{ c.label }} · {{ c.pct.toFixed(0) }} %
              </span>
            }
          </div>
          <div class="bd-totals">
            <span><small>Subtotal</small>{{ fmt(t.gross) }}</span>
            <span><small>Descuentos</small>− {{ fmt(t.discount) }}</span>
            <span class="net"><small>Total</small>{{ fmt(t.net) }}</span>
            @for (s of t.byStatus; track s.label) {
              <span class="bd-pill" [style.--c]="s.color"><small>{{ s.label }}</small>{{ fmt(s.value) }}</span>
            }
          </div>
        </div>

        <div class="bd-fin">
          <p class="bd-lbl"><b>Financiación</b></p>
          <div class="bd-fin-grid">
            <label>Cuota inicial <input [(ngModel)]="b.downPayment" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" placeholder="0" /></label>
            <label>Número de cuotas <input [(ngModel)]="b.installments" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" placeholder="0" /></label>
            <label>Primera cuota <input type="date" [(ngModel)]="b.startDate" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
            <label>Fecha de cotización <input type="date" [(ngModel)]="b.quotedAt" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
          </div>
          @if (t.installments) {
            <p class="bd-quota">{{ t.installments }} cuotas de <b>{{ fmt(t.installment) }}</b> · saldo a financiar {{ fmt(t.financed) }}</p>
            @if (dates().length) {
              <div class="bd-dates">
                @for (d of dates(); track $index) {
                  <span><small>{{ $index + 1 }}</small>{{ d }}</span>
                }
              </div>
            }
          }
          <label class="bd-notes">Condiciones / observaciones
            <textarea rows="2" [(ngModel)]="b.notes" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Vigencia de la cotización, qué incluye, forma de pago…"></textarea>
          </label>
        </div>
      } @else {
        <p class="bd-lbl">Sin conceptos. Use los botones de arriba o la plantilla para empezar.</p>
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .bd { display: grid; gap: 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
    .bd input, .bd select, .bd textarea { min-width: 0; max-width: 100%; box-sizing: border-box; }
    .bd-lbl { margin: 0; font-size: 11px; color: #64748b; }
    .bd-quick { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
    .bd-quick button { --c: #12609a; border: 1px dashed var(--c); color: var(--c); background: #fff; border-radius: 99px; padding: 2px 10px; font-size: 12px; cursor: pointer; }
    .bd-quick .bd-tpl { border-style: solid; background: #12609a; color: #fff; }
    .bd-table { display: grid; gap: 4px; overflow-x: auto; }
    .bd-row { display: grid; grid-template-columns: minmax(150px, 1.3fr) minmax(140px, 2fr) 56px minmax(100px, 1fr) 60px minmax(100px, 1fr) 110px 24px; gap: 6px; align-items: center; min-width: 820px; }
    .bd-h { font-size: 11px; color: #64748b; font-weight: 600; }
    .bd-row.off { opacity: 0.5; text-decoration: line-through; }
    .bd-concept { display: flex; gap: 6px; align-items: center; }
    .bd-concept i { flex: 0 0 10px; height: 10px; border-radius: 3px; }
    .bd-concept select { flex: 1; }
    .bd-n { text-align: center; }
    .bd-money { font-size: 13px; text-align: right; color: #123b60; }
    .bd-status { --c: #94a3b8; border: 1.5px solid var(--c); color: var(--c); border-radius: 99px; padding: 2px 6px; font-weight: 600; font-size: 12px; background: #fff; }
    .bd-x { border: 0; background: none; color: #94a3b8; font-size: 18px; cursor: pointer; }
    .bd-sum { display: grid; gap: 6px; }
    .bd-stack { display: flex; height: 18px; border-radius: 99px; overflow: hidden; background: #f1f5f9; }
    .bd-stack span { transition: opacity 0.2s; cursor: pointer; }
    .bd-stack span.dim { opacity: 0.3; }
    .bd-legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: #475569; }
    .bd-legend span { cursor: default; }
    .bd-legend span.on { font-weight: 700; color: #123b60; }
    .bd-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; vertical-align: -1px; }
    .bd-totals { display: flex; flex-wrap: wrap; gap: 8px; }
    .bd-totals span { display: grid; padding: 6px 12px; border-radius: 12px; background: #f8fafc; font-size: 14px; font-weight: 600; color: #1e293b; }
    .bd-totals span.net { background: #123b60; color: #fff; }
    .bd-totals small { font-size: 10px; font-weight: 500; opacity: 0.75; text-transform: uppercase; }
    .bd-totals .bd-pill { --c: #94a3b8; background: #fff; border: 1.5px solid var(--c); color: var(--c); }
    .bd-fin { display: grid; gap: 6px; padding: 10px; border-radius: 12px; background: #f8fafc; }
    .bd-fin-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 8px; }
    .bd-fin label, .bd-notes { display: grid; gap: 2px; font-size: 11px; color: #475569; }
    .bd-quota { margin: 0; font-size: 13px; color: #123b60; }
    .bd-dates { display: flex; flex-wrap: wrap; gap: 4px; }
    .bd-dates span { display: grid; text-align: center; padding: 3px 7px; border-radius: 8px; background: #fff; border: 1px solid #e2e8f0; font-size: 11px; }
    .bd-dates small { font-size: 9px; color: #94a3b8; }
  `,
})
export class OrthoBudget {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly concepts = BUDGET_CONCEPTS;
  readonly statuses = BUDGET_STATUSES;
  readonly hover = signal('');
  private readonly tick = signal(0);

  readonly totals = computed(() => {
    this.tick();
    return budgetTotals(this.data().orthoBudget);
  });

  readonly dates = computed(() => {
    this.tick();
    return installmentDates(this.data().orthoBudget.startDate, this.totals().installments);
  });

  fmt(v: number) {
    return money(v);
  }

  net(i: OrthoBudgetItem) {
    return itemNet(i);
  }

  conceptColor(c: string) {
    return BUDGET_CONCEPTS.find((x) => x.label === c)?.color ?? '#475569';
  }

  statusColor(s: string) {
    return BUDGET_STATUSES.find((x) => x.label === s)?.color ?? '#94a3b8';
  }

  touch() {
    this.tick.update((n) => n + 1);
    this.changed.emit();
  }

  add(concept: string, qty = '1', description = '') {
    this.data().orthoBudget.items.push({ id: newBudgetId(), concept, description, qty, unitValue: '', discountPct: '', status: 'Cotizado' });
    this.touch();
  }

  template() {
    const d = this.data();
    const months = parseDurationMonths(d.orthodontics.estimatedDuration) ?? 24;
    this.add('Valor diagnóstico', '1', 'Estudio: modelos, fotografías y cefalometría');
    this.add('Aparatología', '1', d.orthodontics.appliance || 'Brackets');
    this.add('Controles', String(Math.round(months)), 'Controles mensuales');
    this.add('Radiografías', '2', 'Panorámica y cefálica lateral');
    this.add('Retención', '2', 'Retenedores superior e inferior');
    if (!d.orthoBudget.quotedAt) d.orthoBudget.quotedAt = new Date().toISOString().slice(0, 10);
  }

  remove(i: OrthoBudgetItem) {
    const list = this.data().orthoBudget.items;
    list.splice(list.indexOf(i), 1);
    this.touch();
  }
}
