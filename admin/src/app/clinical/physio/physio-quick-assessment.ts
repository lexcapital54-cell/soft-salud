import { Component, computed, input, output, signal } from '@angular/core';
import { PhysiotherapyContent } from '../clinical.models';
import {
  PAIN_FREQUENCIES,
  POSTURE_OPTIONS,
  PhysioIntake,
  RANGE_OPTIONS,
  STRENGTH_OPTIONS,
  ensureIntake,
} from './physio-intake.models';
import { PhysioPainScale } from './physio-pain-scale';

type ChoiceKey = 'posture' | 'rangeOfMotion' | 'strength';
type NotesKey = 'postureNotes' | 'rangeNotes' | 'strengthNotes';

/** Valoración fisioterapéutica rápida: postura, rango de movimiento, fuerza, EVA y frecuencia. */
@Component({
  selector: 'app-physio-quick-assessment',
  imports: [PhysioPainScale],
  template: `
    @let intake = state();
    <div class="qa">
      <div class="qa-grid">
        @for (item of items; track item.key) {
          <fieldset class="qa-card" [class.alert]="isAltered(item.key)">
            <legend>{{ item.label }}</legend>
            <div class="qa-seg" role="radiogroup" [attr.aria-label]="item.label">
              @for (opt of item.options; track opt.key) {
                <button
                  type="button"
                  role="radio"
                  [class.on]="intake[item.key] === opt.key"
                  [attr.aria-checked]="intake[item.key] === opt.key"
                  [disabled]="disabled()"
                  (click)="setChoice(item.key, opt.key)"
                >
                  {{ opt.label }}
                </button>
              }
            </div>
            <label>
              Observaciones
              <textarea
                rows="2"
                [value]="intake[item.notes]"
                [readOnly]="disabled()"
                [placeholder]="isAltered(item.key) ? 'Describa la alteración…' : ''"
                (input)="setNotes(item.notes, $any($event.target).value)"
              ></textarea>
            </label>
          </fieldset>
        }
      </div>

      <div class="qa-pain">
        <div>
          <p class="qa-title">Escala de dolor (EVA 0–10)</p>
          <app-physio-pain-scale
            [value]="data().functionalAssessment['pain']"
            [disabled]="disabled()"
            (valueChange)="setPain($event)"
          />
        </div>
        <fieldset class="qa-freq">
          <legend>Frecuencia del dolor</legend>
          <div class="qa-seg wrap" role="radiogroup" aria-label="Frecuencia del dolor">
            @for (f of frequencies; track f.key) {
              <button
                type="button"
                role="radio"
                [class.on]="intake.painFrequency === f.key"
                [attr.aria-checked]="intake.painFrequency === f.key"
                [disabled]="disabled()"
                (click)="setFrequency(f.key)"
              >
                {{ f.label }}
              </button>
            }
          </div>
        </fieldset>
      </div>
    </div>
  `,
  styles: `
    .qa-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .qa-card, .qa-freq { margin: 0; padding: 10px 12px; border: 1px solid #d8e2ec; border-radius: 14px; background: #fff; min-width: 0; }
    .qa-card.alert { border-color: #c59b27; background: #fffaf0; }
    legend, .qa-title { font-weight: 600; color: #1b365d; padding: 0 4px; margin: 0 0 6px; }
    .qa-seg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
    .qa-seg.wrap { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .qa-seg button { padding: 7px 8px; border-radius: 10px; border: 1.5px solid #c9d5e2; background: #f7f9fc; color: #1b365d; cursor: pointer; font: inherit; font-size: .88rem; }
    .qa-seg button.on { background: #1b365d; border-color: #1b365d; color: #fff; }
    .qa-seg button:disabled { cursor: default; opacity: .8; }
    label { display: block; font-size: .85rem; }
    textarea { width: 100%; }
    .qa-pain { display: grid; grid-template-columns: minmax(0, 2fr) minmax(200px, 1fr); gap: 12px; margin-top: 12px; align-items: start; }
    @media (max-width: 900px) { .qa-grid, .qa-pain { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class PhysioQuickAssessment {
  readonly data = input.required<PhysiotherapyContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly frequencies = PAIN_FREQUENCIES;
  readonly items: Array<{ key: ChoiceKey; notes: NotesKey; label: string; options: ReadonlyArray<{ key: string; label: string }> }> = [
    { key: 'posture', notes: 'postureNotes', label: 'Postura', options: POSTURE_OPTIONS },
    { key: 'rangeOfMotion', notes: 'rangeNotes', label: 'Rango de movimiento', options: RANGE_OPTIONS },
    { key: 'strength', notes: 'strengthNotes', label: 'Fuerza muscular', options: STRENGTH_OPTIONS },
  ];

  private readonly version = signal(0);
  readonly state = computed(() => {
    this.version();
    return ensureIntake(this.data());
  });

  isAltered(key: ChoiceKey) {
    const v = this.state()[key];
    return v === 'ALTERADA' || v === 'LIMITADO' || v === 'DISMINUIDA';
  }

  /** Un segundo toque sobre la opción marcada la desmarca. */
  setChoice(key: ChoiceKey, value: string) {
    const intake = this.state() as unknown as Record<ChoiceKey, string>;
    intake[key] = intake[key] === value ? '' : value;
    this.commit();
  }

  setNotes(key: NotesKey, value: string) {
    (this.state() as PhysioIntake)[key] = value;
    this.changed.emit();
  }

  setPain(value: string) {
    this.data().functionalAssessment['pain'] = value;
    this.commit();
  }

  setFrequency(value: PhysioIntake['painFrequency']) {
    const intake = this.state();
    intake.painFrequency = intake.painFrequency === value ? '' : value;
    this.commit();
  }

  private commit() {
    this.version.update((v) => v + 1);
    this.changed.emit();
  }
}
