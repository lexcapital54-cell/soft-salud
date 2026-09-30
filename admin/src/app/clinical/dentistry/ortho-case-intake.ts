import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DentistryContent } from './dentistry.models';
import { ORTHO_END_REASONS, ORTHO_MOTIVES } from './ortho-case.models';

/** Motivo de consulta ortodóntico (`part="motive"`) o historia ortodóntica previa (`part="history"`). */
@Component({
  selector: 'app-ortho-case-intake',
  imports: [FormsModule],
  template: `
    @let oc = data().orthoCase;
    @if (part() === 'motive') {
      <div class="oi">
        <p class="oi-label">Motivos frecuentes (toque para marcar)</p>
        <div class="oi-chips">
          @for (m of motives; track m) {
            <button type="button" class="oi-chip" [class.on]="oc.motives.includes(m)" [disabled]="disabled()" (click)="toggleMotive(m)">{{ m }}</button>
          }
        </div>
        <div class="oi-grid">
          <label>Motivo estético <input [(ngModel)]="oc.motiveAesthetic" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Sonrisa, dientes salidos, perfil…" /></label>
          <label>Motivo funcional <input [(ngModel)]="oc.motiveFunctional" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Masticación, respiración, ATM, habla…" /></label>
          <label>Tiempo de evolución <input [(ngModel)]="oc.evolutionTime" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Desde la erupción, 2 años…" /></label>
          <label class="wide">Preocupación principal del paciente / acudiente <input [(ngModel)]="oc.concern" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
        </div>
        <label class="oi-expect">
          ¿Qué espera obtener con el tratamiento?
          <textarea rows="3" [(ngModel)]="oc.expectations" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="En palabras del paciente: resultado esperado, tiempo, tipo de aparatología que prefiere…"></textarea>
        </label>
      </div>
    } @else {
      @let p = oc.prior;
      <div class="oi">
        <div class="oi-seg-row">
          <span class="oi-label">¿Tuvo tratamiento de ortodoncia antes?</span>
          <div class="oi-seg">
            @for (o of yesNo; track o.key) {
              <button type="button" [class.on]="p.had === o.key" [disabled]="disabled()" (click)="setHad(o.key)">{{ o.label }}</button>
            }
          </div>
        </div>
        @if (p.had === 'SI') {
          <div class="oi-grid">
            <label>Edad de inicio <input [(ngModel)]="p.ageStart" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" placeholder="años" /></label>
            <label>Tipo de aparatología <input [(ngModel)]="p.applianceType" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Brackets, removible, alineadores…" /></label>
            <label>Duración <input [(ngModel)]="p.duration" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="meses" /></label>
            <label>Motivo de finalización
              <select [(ngModel)]="p.endReason" (ngModelChange)="touch()" [disabled]="disabled()">
                <option value="">—</option>
                @for (r of endReasons; track r) {
                  <option [value]="r">{{ r }}</option>
                }
              </select>
            </label>
            <label>Uso de retenedores
              <select [(ngModel)]="p.retainerUse" (ngModelChange)="touch()" [disabled]="disabled()">
                <option value="">—</option>
                <option value="SI">Sí, constante</option>
                <option value="IRREGULAR">Irregular</option>
                <option value="NO">No</option>
              </select>
            </label>
            <label>Tipo de retenedor <input [(ngModel)]="p.retainerType" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Fijo, Essix, Hawley…" /></label>
            <label class="wide">Recidiva <input [(ngModel)]="p.relapse" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Apiñamiento anterior inferior, reapertura de espacios…" /></label>
          </div>
          @if (p.retainerUse === 'NO' || p.retainerUse === 'IRREGULAR') {
            <p class="oi-warn">Uso deficiente de retenedores: riesgo de recidiva; conviene reforzar la retención en este plan.</p>
          }
        }
        <div class="oi-grid">
          <label>Tratamientos quirúrgicos (ortognática, frenectomía…) <input [(ngModel)]="p.surgery" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
          <label>Extracciones anteriores por ortodoncia <input [(ngModel)]="p.extractions" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="14, 24, 34, 44…" /></label>
        </div>
      </div>
    }
  `,
  styles: `
    .oi { display: grid; gap: 10px; margin-top: 8px; }
    .oi-label { margin: 0; font-size: 12px; font-weight: 600; color: #334155; }
    .oi-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .oi-chip { border: 1px solid #cbd5e1; border-radius: 99px; background: #fff; padding: 4px 10px; font-size: 12px; cursor: pointer; color: #334155; }
    .oi-chip.on { background: #12609a; border-color: #12609a; color: #fff; }
    .oi-chip:disabled { cursor: default; }
    .oi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
    .oi-grid label, .oi-expect { display: grid; gap: 3px; font-size: 12px; color: #475569; }
    .oi-grid .wide { grid-column: 1 / -1; }
    .oi-expect { font-weight: 600; color: #123b60; font-size: 13px; }
    .oi-expect textarea { font-weight: 400; }
    .oi-seg-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .oi-seg { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 99px; overflow: hidden; }
    .oi-seg button { border: 0; background: #fff; padding: 4px 14px; font-size: 12px; cursor: pointer; }
    .oi-seg button + button { border-left: 1px solid #cbd5e1; }
    .oi-seg button.on { background: #12609a; color: #fff; }
    .oi-warn { margin: 0; padding: 6px 8px; border-radius: 8px; background: #fef3c7; color: #92400e; font-size: 12px; }
  `,
})
export class OrthoCaseIntake {
  readonly data = input.required<DentistryContent>();
  readonly part = input<'motive' | 'history'>('motive');
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly motives = ORTHO_MOTIVES;
  readonly endReasons = ORTHO_END_REASONS;
  readonly yesNo = [
    { key: 'NO' as const, label: 'No' },
    { key: 'SI' as const, label: 'Sí' },
  ];

  touch() {
    this.changed.emit();
  }

  toggleMotive(m: string) {
    if (this.disabled()) return;
    const list = this.data().orthoCase.motives;
    const i = list.indexOf(m);
    if (i >= 0) list.splice(i, 1);
    else list.push(m);
    this.touch();
  }

  setHad(v: 'SI' | 'NO') {
    if (this.disabled()) return;
    const p = this.data().orthoCase.prior;
    p.had = p.had === v ? '' : v;
    this.touch();
  }
}
