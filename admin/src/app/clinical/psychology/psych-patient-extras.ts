import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  NO_OTHER_SPECIALTY,
  OTHER_SPECIALTY_OPTIONS,
  PatientExtras,
  STRATUM_OPTIONS,
  toggleOtherSpecialty,
} from '../patient-extras';

/** Campos de la ficha de ingreso de psicología que viven en Patient.extras. */
@Component({
  selector: 'app-psych-patient-extras',
  imports: [FormsModule],
  template: `
    <div class="ppx">
      <h4 class="ppx-title">Ficha de ingreso · datos complementarios</h4>
      <div class="ppx-grid">
        <label>Lugar de nacimiento
          <input [(ngModel)]="extras().birthPlace" [disabled]="disabled()" placeholder="Municipio / país" />
        </label>
        <label>Barrio
          <input [(ngModel)]="extras().neighborhood" [disabled]="disabled()" />
        </label>
        <label>Estrato
          <select [(ngModel)]="extras().stratum" [disabled]="disabled()">
            <option value="">—</option>
            @for (s of stratumOptions; track s) {
              <option [value]="s">Estrato {{ s }}</option>
            }
          </select>
        </label>
        <label>Religión
          <input [(ngModel)]="extras().religion" [disabled]="disabled()" />
        </label>
      </div>

      <p class="ppx-q">¿Atención o seguimiento actual por otra especialidad?</p>
      <div class="ppx-chips">
        <button
          type="button"
          class="ppx-chip"
          [class.on]="has(noOther)"
          [attr.aria-pressed]="has(noOther)"
          [disabled]="disabled()"
          (click)="toggle(noOther)"
        >No cuenta con otra</button>
        @for (s of specialtyOptions; track s) {
          <button
            type="button"
            class="ppx-chip"
            [class.on]="has(s)"
            [attr.aria-pressed]="has(s)"
            [disabled]="disabled()"
            (click)="toggle(s)"
          >{{ s }}</button>
        }
      </div>
      @if (showDetail()) {
        <label class="ppx-full">Detalle (profesional, institución, motivo)
          <input [(ngModel)]="extras().otherSpecialtyDetail" [disabled]="disabled()" />
        </label>
      }
      <label class="ppx-full">Medicamentos que toma actualmente
        <textarea
          rows="2"
          [(ngModel)]="extras().currentMedications"
          [disabled]="disabled()"
          placeholder="Nombre, dosis y frecuencia"
        ></textarea>
      </label>
    </div>
  `,
  styles: `
    .ppx { margin-top: 16px; padding: 14px 16px; border: 1px solid #dbe7e8; border-radius: 14px; background: #fbfdfd; }
    .ppx-title { margin: 0 0 10px; font-size: 0.92rem; color: #003d4c; font-weight: 600; }
    .ppx-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    label { display: flex; flex-direction: column; gap: 5px; font-size: 0.82rem; color: #405a5f; }
    input, select, textarea {
      font: inherit; font-size: 0.9rem; padding: 8px 10px; border: 1px solid #d3e0e1; border-radius: 10px;
      background: #fff; width: 100%; box-sizing: border-box; color: #1f3a40;
    }
    input:focus, select:focus, textarea:focus { outline: none; border-color: #0b7285; box-shadow: 0 0 0 3px rgba(11, 114, 133, 0.15); }
    input:disabled, select:disabled, textarea:disabled { background: #f3f7f7; }
    textarea { resize: vertical; }
    .ppx-q { margin: 14px 0 8px; font-size: 0.85rem; color: #1f3a40; font-weight: 500; }
    .ppx-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .ppx-chip { border: 1px solid #cfe0e2; background: #fff; color: #2f5359; border-radius: 999px; padding: 6px 12px; font-size: 0.8rem; cursor: pointer; }
    .ppx-chip.on { background: #003d4c; border-color: #003d4c; color: #fff; }
    .ppx-chip:disabled { cursor: default; opacity: 0.7; }
    .ppx-full { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; }
    @media (max-width: 760px) { .ppx-grid { grid-template-columns: 1fr 1fr; } }
  `,
})
export class PsychPatientExtras {
  readonly extras = input.required<PatientExtras>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly specialtyOptions = OTHER_SPECIALTY_OPTIONS;
  readonly stratumOptions = STRATUM_OPTIONS;
  readonly noOther = NO_OTHER_SPECIALTY;

  has(option: string) {
    return (this.extras().otherSpecialtyCare ?? []).includes(option);
  }

  toggle(option: string) {
    const e = this.extras();
    e.otherSpecialtyCare = toggleOtherSpecialty(e.otherSpecialtyCare, option);
    this.changed.emit();
  }

  showDetail() {
    const list = this.extras().otherSpecialtyCare ?? [];
    return list.length > 0 && !list.includes(NO_OTHER_SPECIALTY);
  }
}
