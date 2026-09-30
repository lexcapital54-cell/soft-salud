import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DentistryContent } from './dentistry.models';

const STATES = ['Pendiente', 'Entregado', 'En uso', 'Completado'];
const STATE_COLOR: Record<string, string> = { Pendiente: '#e2e8f0', Entregado: '#93c5fd', 'En uso': '#f59e0b', Completado: '#16a34a' };
const MAX_ALIGNERS = 120;

/** Plan de alineadores: cuadrícula numerada con estado por alineador, entregas y avance. */
@Component({
  selector: 'app-ortho-aligners',
  imports: [FormsModule],
  template: `
    @let a = data().orthoMech.aligners;
    <div class="al">
      <div class="al-grid">
        <label>Marca <input [(ngModel)]="a.brand" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Invisalign, Spark, laboratorio…" /></label>
        <label>Plan <input [(ngModel)]="a.plan" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Comprehensive, Lite…" /></label>
        <label>Número total <input [(ngModel)]="a.total" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" /></label>
        <label>Fecha de inicio <input type="date" [(ngModel)]="a.start" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
        <label>Uso diario (horas) <input [(ngModel)]="a.hoursPerDay" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" /></label>
        <label>Días por alineador <input [(ngModel)]="a.daysPerAligner" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" /></label>
        <label>Cumplimiento
          <select [(ngModel)]="a.compliance" (ngModelChange)="touch()" [disabled]="disabled()">
            <option value="">—</option>
            <option>Bueno</option>
            <option>Regular</option>
            <option>Malo</option>
          </select>
        </label>
      </div>
      @if (hoursWarn()) {
        <p class="al-hint">{{ hoursWarn() }}</p>
      }
      @if (total()) {
        @let s = stats();
        <div class="al-sum">
          <span>Alineador actual: <b>{{ s.current ? '#' + s.current : '—' }}</b></span>
          <span>{{ s.done }} completados · {{ s.delivered }} entregados sin usar · {{ s.pending }} pendientes</span>
          @if (endDate()) {
            <span>Fin estimado: <b>{{ endDate() }}</b></span>
          }
        </div>
        <div class="al-bar"><i [style.width.%]="(s.done / total()) * 100"></i></div>
        @if (!disabled()) {
          <div class="al-actions">
            <button type="button" class="al-btn" (click)="advance()" [disabled]="!canAdvance()">Pasar al siguiente alineador</button>
            <span class="al-lbl">Entregar los siguientes</span>
            <input class="al-n" [ngModel]="batch()" (ngModelChange)="batch.set(+$event || 1)" inputmode="numeric" />
            <button type="button" class="al-link" (click)="deliver(batch())">Registrar entrega</button>
          </div>
        }
        <div class="al-cells">
          @for (n of numbers(); track n) {
            @let st = stateOf(n);
            <button
              type="button"
              class="al-cell"
              [style.background]="color(st)"
              [class.cur]="st === 'En uso'"
              [class.light]="st === 'Pendiente'"
              [disabled]="disabled()"
              [title]="'#' + n + ' · ' + st + (a.delivered[n] ? ' · entregado ' + a.delivered[n] : '')"
              (click)="cycle(n)"
            >{{ n }}</button>
          }
        </div>
        <div class="al-legend">
          @for (st of states; track st) {
            <span><i [style.background]="color(st)"></i>{{ st }}</span>
          }
          <span class="al-lbl">· Toque un número para cambiar su estado.</span>
        </div>
      } @else {
        <p class="al-note">Registre el número total de alineadores para ver la cuadrícula.</p>
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .al { display: grid; gap: 8px; }
    .al input, .al select { min-width: 0; width: 100%; box-sizing: border-box; }
    .al .al-n { width: 48px; }
    .al-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 8px; }
    .al-grid label { display: grid; gap: 2px; font-size: 11px; color: #475569; }
    .al-hint { margin: 0; padding: 4px 8px; border-radius: 8px; background: #fffbeb; color: #92400e; font-size: 12px; }
    .al-sum { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: #334155; }
    .al-bar { height: 8px; border-radius: 99px; background: #e2e8f0; overflow: hidden; }
    .al-bar i { display: block; height: 100%; background: #16a34a; transition: width 0.3s; }
    .al-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .al-btn { border: 0; background: #12609a; color: #fff; border-radius: 99px; padding: 5px 14px; font-size: 12px; cursor: pointer; }
    .al-btn:disabled { opacity: 0.45; cursor: default; }
    .al-link { border: 0; background: none; padding: 0; color: #12609a; text-decoration: underline; font-size: 12px; cursor: pointer; }
    .al-lbl { font-size: 11px; color: #64748b; }
    .al-n { width: 48px; text-align: center; }
    .al-cells { display: grid; grid-template-columns: repeat(auto-fill, minmax(34px, 1fr)); gap: 4px; }
    .al-cell { height: 32px; border: 0; border-radius: 8px; color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; }
    .al-cell.light { color: #475569; }
    .al-cell.cur { outline: 3px solid #123b60; outline-offset: 1px; }
    .al-cell:disabled { cursor: default; }
    .al-legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: #475569; align-items: center; }
    .al-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; vertical-align: -1px; }
    .al-note { margin: 0; font-size: 11px; color: #64748b; }
  `,
})
export class OrthoAligners {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly states = STATES;
  readonly batch = signal(3);

  total() {
    const n = Math.floor(Number(this.data().orthoMech.aligners.total) || 0);
    return Math.max(0, Math.min(MAX_ALIGNERS, n));
  }

  numbers() {
    return Array.from({ length: this.total() }, (_, i) => i + 1);
  }

  stateOf(n: number) {
    return this.data().orthoMech.aligners.states[n] || 'Pendiente';
  }

  color(st: string) {
    return STATE_COLOR[st] ?? '#e2e8f0';
  }

  stats() {
    const counts = { done: 0, delivered: 0, pending: 0, current: 0 };
    for (const n of this.numbers()) {
      const st = this.stateOf(n);
      if (st === 'Completado') counts.done++;
      else if (st === 'Entregado') counts.delivered++;
      else if (st === 'En uso') counts.current = counts.current || n;
      else counts.pending++;
    }
    return counts;
  }

  endDate() {
    const a = this.data().orthoMech.aligners;
    const days = Number(a.daysPerAligner) || 0;
    if (!a.start || !days || !this.total()) return '';
    const d = new Date(`${a.start}T12:00:00`);
    d.setDate(d.getDate() + days * this.total());
    return d.toLocaleDateString('es-CO');
  }

  hoursWarn() {
    const h = Number(this.data().orthoMech.aligners.hoursPerDay);
    return h && h < 20 ? `Uso de ${h} horas al día: con menos de 20–22 horas los movimientos suelen no expresarse completos.` : '';
  }

  canAdvance() {
    return this.numbers().some((n) => this.stateOf(n) !== 'Completado');
  }

  touch() {
    this.changed.emit();
  }

  cycle(n: number) {
    const a = this.data().orthoMech.aligners;
    const next = STATES[(STATES.indexOf(this.stateOf(n)) + 1) % STATES.length];
    a.states[n] = next;
    if (next === 'Entregado' && !a.delivered[n]) a.delivered[n] = today();
    this.touch();
  }

  advance() {
    const a = this.data().orthoMech.aligners;
    const cur = this.numbers().find((n) => this.stateOf(n) === 'En uso');
    if (cur) a.states[cur] = 'Completado';
    const next = this.numbers().find((n) => this.stateOf(n) === 'Entregado' || this.stateOf(n) === 'Pendiente');
    if (next) {
      if (!a.delivered[next]) a.delivered[next] = today();
      a.states[next] = 'En uso';
    }
    this.touch();
  }

  deliver(count: number) {
    const a = this.data().orthoMech.aligners;
    let left = Math.max(1, count);
    for (const n of this.numbers()) {
      if (!left) break;
      if (this.stateOf(n) === 'Pendiente') {
        a.states[n] = 'Entregado';
        a.delivered[n] = today();
        left--;
      }
    }
    this.touch();
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
