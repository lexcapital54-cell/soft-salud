import { Component, computed, input, output, signal } from '@angular/core';
import { PhysiotherapyContent } from '../clinical.models';
import { PhysioIcon } from './physio-icons';
import { THERAPIES, ensureIntake, therapyLabel } from './physio-intake.models';

/** Terapias a aplicar (casillas) con opción de llevarlas al plan de intervención. */
@Component({
  selector: 'app-physio-therapies',
  imports: [PhysioIcon],
  template: `
    @let intake = state();
    <div class="th">
      <div class="th-grid">
        @for (t of therapies; track t.key) {
          @let on = selected().has(t.key);
          <button
            type="button"
            class="th-item"
            [class.on]="on"
            role="checkbox"
            [attr.aria-checked]="on"
            [disabled]="disabled()"
            (click)="toggle(t.key)"
          >
            <span class="th-box" aria-hidden="true">{{ on ? '✓' : '' }}</span>
            <app-physio-icon class="th-icon" [name]="t.key" />
            <span>
              {{ t.label }}
              @if (t.hint) {
                <small>{{ t.hint }}</small>
              }
            </span>
          </button>
        }
      </div>
      <label class="th-other">
        Otras terapias
        <input [value]="intake.therapiesOther" [readOnly]="disabled()" placeholder="Ej. crioterapia, termoterapia…" (input)="setOther($any($event.target).value)" />
      </label>
      @if (!disabled() && summary()) {
        <div class="th-actions">
          <button type="button" class="th-copy" (click)="copyToPlan()" [disabled]="alreadyInPlan()">
            {{ alreadyInPlan() ? 'Ya están en el plan de intervención' : 'Agregar al plan de intervención' }}
          </button>
          @if (copied()) {
            <span class="th-ok">Agregado al final del plan de intervención.</span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .th-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
    .th-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 12px; border: 1.5px solid #d8e2ec; background: #fff; color: #1b365d; text-align: left; cursor: pointer; font: inherit; font-size: .9rem; transition: border-color .15s, background .15s; }
    .th-item:hover:not(:disabled) { border-color: #1b365d; }
    .th-item.on { border-color: #c59b27; background: #fffaf0; }
    .th-item:disabled { cursor: default; }
    .th-item small { display: block; color: #6a7d90; font-size: .75rem; }
    .th-box { flex: 0 0 22px; height: 22px; border-radius: 6px; border: 1.5px solid #9fb2c6; display: grid; place-items: center; font-weight: 700; color: #fff; }
    .th-item.on .th-box { background: #c59b27; border-color: #c59b27; }
    .th-icon { width: 26px; height: 26px; }
    .th-item.on .th-icon { color: #a07a14; }
    .th-other { display: block; margin-top: 10px; }
    .th-other input { width: 100%; }
    .th-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
    .th-copy { border: 1px solid #1b365d; background: #fff; color: #1b365d; border-radius: 10px; padding: 6px 12px; cursor: pointer; font: inherit; font-size: .85rem; }
    .th-copy:disabled { border-color: #c9d5e2; color: #7a8ca0; cursor: default; }
    .th-ok { color: #1e6b35; font-size: .85rem; }
    @media print { .th-actions { display: none; } .th-item.on .th-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  `,
})
export class PhysioTherapies {
  readonly data = input.required<PhysiotherapyContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly therapies = THERAPIES;
  readonly copied = signal(false);
  private readonly version = signal(0);

  readonly state = computed(() => {
    this.version();
    return ensureIntake(this.data());
  });
  readonly selected = computed(() => {
    this.version();
    return new Set(this.state().therapies);
  });

  /** "Terapias a aplicar: Terapia manual, Ultrasonido…". */
  readonly summary = computed(() => {
    this.version();
    const intake = this.state();
    const names = THERAPIES.filter((t) => intake.therapies.includes(t.key)).map((t) => therapyLabel(t.key));
    if (intake.therapiesOther.trim()) names.push(intake.therapiesOther.trim());
    return names.length ? `Terapias a aplicar: ${names.join(', ')}.` : '';
  });

  readonly alreadyInPlan = computed(() => {
    this.version();
    return !!this.summary() && (this.data().interventionPlan || '').includes(this.summary());
  });

  toggle(key: string) {
    const intake = this.state();
    intake.therapies = intake.therapies.includes(key)
      ? intake.therapies.filter((k) => k !== key)
      : [...intake.therapies, key];
    this.copied.set(false);
    this.commit();
  }

  setOther(value: string) {
    this.state().therapiesOther = value;
    this.copied.set(false);
    this.commit();
  }

  copyToPlan() {
    const ft = this.data();
    const current = (ft.interventionPlan || '').trimEnd();
    ft.interventionPlan = current ? `${current}\n${this.summary()}` : this.summary();
    this.copied.set(true);
    this.commit();
  }

  private commit() {
    this.version.update((v) => v + 1);
    this.changed.emit();
  }
}
