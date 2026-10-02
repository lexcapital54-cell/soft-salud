import { Component, computed, input, output, signal } from '@angular/core';
import { PhysiotherapyContent } from '../clinical.models';
import { ensureIntake } from './physio-intake.models';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fecha de valoración (formato HC-FT). */
@Component({
  selector: 'app-physio-intake-header',
  template: `
    @let intake = state();
    <div class="ih">
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
    .ih { display: grid; grid-template-columns: minmax(200px, 280px); gap: 10px; margin-bottom: 10px; }
    label { display: block; font-size: .9rem; }
    input { width: 100%; }
    .ih-date { display: flex; gap: 6px; }
    .ih-date button { border: 1px solid #1b365d; background: #fff; color: #1b365d; border-radius: 8px; padding: 0 10px; cursor: pointer; font: inherit; font-size: .85rem; }
    @media print { .ih-date button { display: none; } }
  `,
})
export class PhysioIntakeHeader {
  readonly data = input.required<PhysiotherapyContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly today = todayIso();
  private readonly version = signal(0);
  readonly state = computed(() => {
    this.version();
    return ensureIntake(this.data());
  });

  setDate(value: string) {
    this.state().assessmentDate = value;
    this.version.update((v) => v + 1);
    this.changed.emit();
  }
}
