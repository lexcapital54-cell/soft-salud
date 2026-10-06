import { DecimalPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { DentistryContent } from './dentistry.models';
import { dentalSummary } from './dental-summary.models';

/** Resumen de una mirada: alertas, estado dental y periodontal, rehabilitación y avance del plan. */
@Component({
  selector: 'app-dental-patient-summary',
  imports: [DecimalPipe],
  template: `
    @let s = summary();
    @if (s.any) {
      <div class="ps">
        <div class="ps-col">
          <h5>Alertas médicas</h5>
          @for (c of s.alerts; track c.text) {
            <button type="button" class="ps-chip" [attr.data-tone]="c.tone" (click)="c.go && goto.emit(c.go)">{{ c.text }}</button>
          } @empty {
            <span class="ps-none">Sin alertas registradas</span>
          }
        </div>
        <div class="ps-col">
          <h5>Estado dental</h5>
          @for (c of s.dental; track c.text) {
            <button type="button" class="ps-chip" [attr.data-tone]="c.tone" (click)="goto.emit('odontograma')">{{ c.text }}</button>
          } @empty {
            <span class="ps-none">Odontograma sin hallazgos</span>
          }
          @if (s.perio) {
            <button type="button" class="ps-chip" [attr.data-tone]="s.perio.tone" (click)="goto.emit('odo-examen')">{{ s.perio.text }}</button>
          }
          @for (k of s.kennedy; track k) {
            <button type="button" class="ps-chip" data-tone="info" (click)="goto.emit('odontograma')">{{ k }}</button>
          }
        </div>
        <div class="ps-col">
          <h5>Plan de tratamiento</h5>
          @if (s.plan.count) {
            <div class="ps-progress" [title]="s.plan.done + ' de ' + s.plan.count + ' procedimientos terminados'">
              <span [style.width.%]="(s.plan.done / s.plan.count) * 100"></span>
            </div>
            <p class="ps-line">
              {{ s.plan.done }}/{{ s.plan.count }} terminados
              @if (s.plan.total) {
                · Total {{ '$' }}{{ s.plan.total | number: '1.0-0' }}
              }
              @if (s.plan.accepted) {
                · <b class="ps-ok">aceptado</b>
              }
            </p>
            @if (s.plan.next.length) {
              <p class="ps-line">
                Próximo:
                @for (n of s.plan.next; track $index; let last = $last) {
                  <button type="button" class="ps-link" (click)="goto.emit('odo-plan')">{{ n }}</button>{{ last ? '' : ' · ' }}
                }
              </p>
            }
          } @else {
            <span class="ps-none">Sin plan registrado</span>
          }
          @if (lastVisit()) {
            <p class="ps-line ps-muted">Última evolución: {{ lastVisit() }}</p>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .ps { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; padding: 12px; border: 1px solid #dbe4ee; border-radius: 12px; background: #f4f8fb; }
    .ps-col { display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; }
    .ps h5 { width: 100%; margin: 0 0 2px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #123b60; }
    .ps-chip { border: 1px solid; border-radius: 99px; padding: 3px 10px; font-size: 12px; cursor: pointer; background: #fff; }
    .ps-chip[data-tone='danger'] { border-color: #fca5a5; background: #fef2f2; color: #991b1b; font-weight: 600; }
    .ps-chip[data-tone='warn'] { border-color: #fcd34d; background: #fffbeb; color: #92400e; }
    .ps-chip[data-tone='info'] { border-color: #bfdbfe; background: #eff6ff; color: #1e3a8a; }
    .ps-chip[data-tone='ok'] { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
    .ps-none { font-size: 12px; color: #64748b; }
    .ps-progress { width: 100%; height: 8px; border-radius: 99px; background: #e2e8f0; overflow: hidden; }
    .ps-progress span { display: block; height: 100%; background: #12609a; }
    .ps-line { width: 100%; margin: 0; font-size: 12px; color: #334155; }
    .ps-muted { color: #64748b; }
    .ps-ok { color: #166534; }
    .ps-link { border: 0; background: none; padding: 0; color: #12609a; text-decoration: underline; cursor: pointer; font-size: 12px; }
  `,
})
export class DentalPatientSummary {
  readonly data = input.required<DentistryContent>();
  readonly lastVisit = input('');
  readonly goto = output<string>();

  summary() {
    return dentalSummary(this.data(), this.lastVisit());
  }
}
