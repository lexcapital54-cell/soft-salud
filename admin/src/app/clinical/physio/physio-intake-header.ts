import { Component, computed, input, output, signal } from '@angular/core';
import { PhysiotherapyContent } from '../clinical.models';
import { REFERRAL_SOURCES, ReferralSource, ensureIntake } from './physio-intake.models';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ¿Cómo llegó a la consulta? y fecha de valoración (formato HC-FT). */
@Component({
  selector: 'app-physio-intake-header',
  template: `
    @let intake = state();
    <div class="ih">
      <label>
        ¿Cómo llegó a la consulta?
        <select [value]="intake.referralSource" [disabled]="disabled()" (change)="setSource($any($event.target).value)">
          <option value="">Seleccione…</option>
          @for (s of sources; track s.key) {
            <option [value]="s.key" [selected]="intake.referralSource === s.key">{{ s.label }}</option>
          }
        </select>
      </label>
      @if (intake.referralSource === 'OTRO') {
        <label>
          ¿Cuál?
          <input [value]="intake.referralOther" [readOnly]="disabled()" (input)="setOther($any($event.target).value)" />
        </label>
      }
      <label>
        Fecha de valoración
        <span class="ih-date">
          <input type="date" [value]="intake.assessmentDate" [readOnly]="disabled()" (input)="setDate($any($event.target).value)" />
          @if (!disabled() && intake.assessmentDate !== today) {
            <button type="button" (click)="setDate(today)">Hoy</button>
          }
        </span>
      </label>
    </div>
  `,
  styles: `
    .ih { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 10px; }
    label { display: block; font-size: .9rem; }
    select, input { width: 100%; }
    .ih-date { display: flex; gap: 6px; }
    .ih-date button { border: 1px solid #1b365d; background: #fff; color: #1b365d; border-radius: 8px; padding: 0 10px; cursor: pointer; font: inherit; font-size: .85rem; }
    @media print { .ih-date button { display: none; } }
  `,
})
export class PhysioIntakeHeader {
  readonly data = input.required<PhysiotherapyContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly sources = REFERRAL_SOURCES;
  readonly today = todayIso();
  private readonly version = signal(0);
  readonly state = computed(() => {
    this.version();
    return ensureIntake(this.data());
  });

  setSource(value: ReferralSource) {
    this.state().referralSource = value;
    this.commit();
  }

  setOther(value: string) {
    this.state().referralOther = value;
    this.changed.emit();
  }

  setDate(value: string) {
    this.state().assessmentDate = value;
    this.commit();
  }

  private commit() {
    this.version.update((v) => v + 1);
    this.changed.emit();
  }
}
