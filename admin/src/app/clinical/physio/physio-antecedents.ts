import { Component, computed, input, output, signal } from '@angular/core';
import { PhysiotherapyContent } from '../clinical.models';
import { PhysioIntake, ensureIntake } from './physio-intake.models';

type Group = keyof PhysioIntake['antecedents'];
type DetailKey = 'pathological' | 'surgical' | 'traumatic' | 'allergic';

interface GroupDef {
  key: Group;
  label: string;
  detail: DetailKey;
  detailLabel: string;
  flags: Array<{ key: string; label: string }>;
  hasDate?: boolean;
}

const GROUPS: GroupDef[] = [
  {
    key: 'pathological',
    label: 'Patológicos',
    detail: 'pathological',
    detailLabel: 'Otros / detalle',
    flags: [
      { key: 'diabetes', label: 'Diabetes' },
      { key: 'hypertension', label: 'Hipertensión' },
      { key: 'surgeries', label: 'Cirugías' },
    ],
  },
  { key: 'surgical', label: 'Quirúrgicos', detail: 'surgical', detailLabel: 'Descripción', flags: [], hasDate: true },
  {
    key: 'traumatic',
    label: 'Traumáticos',
    detail: 'traumatic',
    detailLabel: 'Otros / detalle',
    flags: [
      { key: 'fractures', label: 'Fracturas' },
      { key: 'sprains', label: 'Esguinces' },
    ],
  },
  {
    key: 'allergies',
    label: 'Alergias',
    detail: 'allergic',
    detailLabel: '¿Cuáles?',
    flags: [{ key: 'hasAllergies', label: 'Sí' }],
  },
];

/**
 * Antecedentes con casillas (formato HC-FT). El texto se guarda en los mismos
 * campos de antecedentes de siempre, para no duplicar la información.
 */
@Component({
  selector: 'app-physio-antecedents',
  template: `
    @let intake = state();
    <div class="an-grid">
      @for (g of groups; track g.key) {
        @let flags = flagsOf(g.key);
        <fieldset class="an-card" [class.none]="flags['noRefers']">
          <legend>{{ g.label }}</legend>
          <label class="an-check" [class.blocked]="!flags['noRefers'] && hasData(g)" [title]="!flags['noRefers'] && hasData(g) ? 'Desmarque o borre lo registrado para indicar No refiere' : ''">
            <input
              type="checkbox"
              [checked]="flags['noRefers']"
              [disabled]="disabled() || (!flags['noRefers'] && hasData(g))"
              (change)="setFlag(g, 'noRefers', $any($event.target).checked)"
            />
            No refiere
          </label>
          @for (f of g.flags; track f.key) {
            <label class="an-check">
              <input type="checkbox" [checked]="flags[f.key]" [disabled]="disabled()" (change)="setFlag(g, f.key, $any($event.target).checked)" />
              {{ f.label }}
            </label>
          }
          @if (g.hasDate) {
            <label class="an-field">
              Fecha
              <input type="date" [value]="intake.antecedents.surgical.date" [readOnly]="disabled()" (input)="setSurgicalDate($any($event.target).value)" />
            </label>
          }
          <label class="an-field">
            {{ g.detailLabel }}
            <textarea rows="2" [value]="data().antecedentsDetail[g.detail]" [readOnly]="disabled()" (input)="setDetail(g, $any($event.target).value)"></textarea>
          </label>
        </fieldset>
      }
    </div>
  `,
  styles: `
    .an-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .an-card { margin: 0; padding: 10px 12px; border: 1px solid #d8e2ec; border-radius: 14px; background: #fff; min-width: 0; }
    .an-card.none { background: #f4f7fa; }
    legend { font-weight: 600; color: #1b365d; padding: 0 4px; }
    .an-check { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: .9rem; cursor: pointer; }
    .an-check input { width: 18px; height: 18px; accent-color: #1b365d; }
    .an-check.blocked { color: #8a99a8; cursor: help; }
    .an-field { display: block; margin-top: 6px; font-size: .85rem; }
    .an-field input, .an-field textarea { width: 100%; }
    @media (max-width: 1100px) { .an-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 560px) { .an-grid { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class PhysioAntecedents {
  readonly data = input.required<PhysiotherapyContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly groups = GROUPS;
  private readonly version = signal(0);
  readonly state = computed(() => {
    this.version();
    return ensureIntake(this.data());
  });

  flagsOf(group: Group): Record<string, boolean> {
    return this.state().antecedents[group] as unknown as Record<string, boolean>;
  }

  /** Algo registrado en la categoría (casillas, fecha o texto). */
  hasData(g: GroupDef) {
    const flags = this.flagsOf(g.key);
    return (
      g.flags.some((f) => flags[f.key]) ||
      (g.hasDate && !!this.state().antecedents.surgical.date) ||
      !!this.data().antecedentsDetail[g.detail]?.trim()
    );
  }

  setFlag(g: GroupDef, key: string, value: boolean) {
    const flags = this.flagsOf(g.key);
    if (key === 'noRefers' && value && this.hasData(g)) return;
    flags[key] = value;
    if (key !== 'noRefers' && value) flags['noRefers'] = false;
    this.commit();
  }

  setSurgicalDate(value: string) {
    const surgical = this.state().antecedents.surgical;
    surgical.date = value;
    if (value) surgical.noRefers = false;
    this.commit();
  }

  setDetail(g: GroupDef, value: string) {
    this.data().antecedentsDetail[g.detail] = value;
    if (value.trim()) this.flagsOf(g.key)['noRefers'] = false;
    this.commit();
  }

  private commit() {
    this.version.update((v) => v + 1);
    this.changed.emit();
  }
}
