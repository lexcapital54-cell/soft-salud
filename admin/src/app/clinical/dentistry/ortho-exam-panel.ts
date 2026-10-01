import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DentistryContent } from './dentistry.models';
import { OrthoTmjMuscles } from './ortho-tmj-muscles';
import { FUNCTION_REFERRALS, FunctionState, ORTHO_FUNCTIONS } from './ortho-exam.models';

/** Examen funcional de ortodoncia: ATM y músculos (mapa facial) y funciones. */
@Component({
  selector: 'app-ortho-exam-panel',
  imports: [FormsModule, OrthoTmjMuscles],
  template: `
    @let ex = data().orthoExam;
    @let f = ex.functional;
    <app-ortho-tmj-muscles [data]="data()" [disabled]="disabled()" (changed)="touch()" />
    <div class="ox">
      <div class="ox-card ox-wide">
        <h5>Funciones</h5>
        @for (fx of functions; track fx.key) {
          @let v = f[fx.key];
          <div class="ox-fn" [class.alt]="v.state === 'ALTERADA'">
            <span>{{ fx.label }}</span>
            <div class="ox-seg">
              <button type="button" [class.on]="v.state === 'NORMAL'" [disabled]="disabled()" (click)="setFn(fx.key, 'NORMAL')">Normal</button>
              <button type="button" [class.on]="v.state === 'ALTERADA'" [disabled]="disabled()" (click)="setFn(fx.key, 'ALTERADA')">Alterada</button>
            </div>
            @if (v.state === 'ALTERADA') {
              <input [(ngModel)]="v.description" (ngModelChange)="touch()" [readonly]="disabled()" [placeholder]="fx.hint" />
              <select [(ngModel)]="v.referral" (ngModelChange)="touch()" [disabled]="disabled()" aria-label="Remisión">
                <option value="">Sin remisión</option>
                @for (r of referrals; track r) {
                  <option [value]="r">Remitir a {{ r }}</option>
                }
              </select>
            }
          </div>
        }
        @if (!disabled() && pendingFunctions()) {
          <button type="button" class="ox-link" (click)="restNormal()">Marcar las {{ pendingFunctions() }} restantes como normales</button>
        }
        <label class="ox-inline wide">Observaciones del examen funcional <input [(ngModel)]="f.notes" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
      </div>
    </div>
  `,
  styles: `
    .ox { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; margin-top: 8px; }
    .ox-card { display: grid; gap: 8px; align-content: start; padding: 12px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; }
    .ox-wide { grid-column: 1 / -1; }
    .ox h5 { margin: 0; font-size: 13px; color: #123b60; }
    .ox-seg { display: inline-flex; flex-wrap: wrap; border: 1px solid #cbd5e1; border-radius: 99px; overflow: hidden; }
    .ox-seg button { border: 0; background: #fff; padding: 3px 10px; font-size: 12px; cursor: pointer; color: #334155; }
    .ox-seg button + button { border-left: 1px solid #cbd5e1; }
    .ox-seg button.on { background: #12609a; color: #fff; }
    .ox-seg button:disabled { cursor: default; }
    .ox-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 8px; }
    .ox-grid label, .ox-inline { display: grid; gap: 2px; font-size: 11px; color: #475569; }
    .ox-grid .wide, .ox-inline.wide { grid-column: 1 / -1; }
    .ox-link { border: 0; background: none; padding: 0; color: #12609a; text-decoration: underline; font-size: 12px; cursor: pointer; justify-self: start; }
    .ox-fn { display: grid; grid-template-columns: 110px auto 1fr 220px; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 10px; font-size: 12px; }
    .ox-fn.alt { background: #fffbeb; }
    @media (max-width: 800px) { .ox-fn { grid-template-columns: 1fr auto; } }
  `,
})
export class OrthoExamPanel {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly functions = ORTHO_FUNCTIONS;
  readonly referrals = FUNCTION_REFERRALS;

  pendingFunctions() {
    const f = this.data().orthoExam.functional;
    return ORTHO_FUNCTIONS.filter((x) => !f[x.key].state).length;
  }

  touch() {
    this.changed.emit();
  }

  setFn(key: (typeof ORTHO_FUNCTIONS)[number]['key'], state: FunctionState) {
    if (this.disabled()) return;
    const v = this.data().orthoExam.functional[key];
    v.state = v.state === state ? '' : state;
    this.touch();
  }

  restNormal() {
    const f = this.data().orthoExam.functional;
    for (const x of ORTHO_FUNCTIONS) if (!f[x.key].state) f[x.key].state = 'NORMAL';
    this.touch();
  }
}
