import { Component, computed, input, output, signal } from '@angular/core';
import { PhysiotherapyContent } from '../clinical.models';
import { PhysioIcon } from './physio-icons';
import { OTHER_ANTECEDENTS, OtherAntecedentKey, PhysioIntake, ensureIntake } from './physio-intake.models';

type Structured = Exclude<keyof PhysioIntake['antecedents'], 'noRefersOther'>;
type DetailKey = keyof PhysiotherapyContent['antecedentsDetail'];
type CardState = 'data' | 'none' | 'empty';

interface CardDef {
  id: string;
  label: string;
  icon: string;
  detail: DetailKey;
  placeholder: string;
  /** Categoría con casillas propias (en `intake.antecedents`); si no, solo texto. */
  group?: Structured;
  flags: Array<{ key: string; label: string }>;
  hasDate?: boolean;
}

const CARDS: CardDef[] = [
  {
    id: 'pathological',
    label: 'Patológicos',
    icon: 'antPathological',
    group: 'pathological',
    detail: 'pathological',
    placeholder: 'Otras enfermedades o detalle…',
    flags: [
      { key: 'diabetes', label: 'Diabetes' },
      { key: 'hypertension', label: 'Hipertensión' },
      { key: 'surgeries', label: 'Cirugías' },
    ],
  },
  { id: 'surgical', label: 'Quirúrgicos', icon: 'antSurgical', group: 'surgical', detail: 'surgical', placeholder: 'Procedimiento, región, complicaciones…', flags: [], hasDate: true },
  {
    id: 'traumatic',
    label: 'Traumáticos',
    icon: 'antTraumatic',
    group: 'traumatic',
    detail: 'traumatic',
    placeholder: 'Otros traumas o detalle…',
    flags: [
      { key: 'fractures', label: 'Fracturas' },
      { key: 'sprains', label: 'Esguinces' },
    ],
  },
  { id: 'allergies', label: 'Alergias', icon: 'antAllergies', group: 'allergies', detail: 'allergic', placeholder: '¿Cuáles? Medicamentos, alimentos, látex…', flags: [{ key: 'hasAllergies', label: 'Sí, tiene alergias' }] },
  ...OTHER_ANTECEDENTS.map((o): CardDef => ({
    id: o.key,
    label: o.label,
    icon: `ant${o.key === 'obgyn' ? 'Obgyn' : o.key[0].toUpperCase() + o.key.slice(1)}`,
    detail: o.key,
    placeholder: o.placeholder,
    flags: [],
  })),
];

const STATE_LABEL: Record<CardState, string> = { data: 'Con datos', none: 'No refiere', empty: 'Pendiente' };

/**
 * Antecedentes de fisioterapia en tarjetas. El texto se guarda en los mismos
 * campos de antecedentes de siempre; las casillas y "No refiere" en `intake`.
 */
@Component({
  selector: 'app-physio-antecedents',
  imports: [PhysioIcon],
  template: `
    @let s = stats();
    <div class="an-bar">
      <div class="an-progress" [attr.aria-label]="s.done + ' de ' + cards.length + ' categorías registradas'">
        @for (c of cards; track c.id) {
          <span [class]="'seg ' + stateOf(c)" [title]="c.label + ': ' + stateLabel[stateOf(c)]"></span>
        }
      </div>
      <span class="an-count"><strong>{{ s.done }}</strong> de {{ cards.length }} registrados · {{ s.data }} con datos · {{ s.none }} no refiere</span>
      @if (!disabled() && s.empty) {
        <button type="button" class="an-bulk" (click)="markEmptyAsNone()">Marcar "No refiere" en las {{ s.empty }} pendientes</button>
      }
    </div>

    <div class="an-grid">
      @for (c of cards; track c.id) {
        @let st = stateOf(c);
        @let none = isNone(c);
        <section [class]="'an-card ' + st">
          <header>
            <app-physio-icon class="an-icon" [name]="c.icon" />
            <h5>{{ c.label }}</h5>
            <span class="an-pill">{{ stateLabel[st] }}</span>
          </header>

          <div class="an-chips" role="group" [attr.aria-label]="c.label">
            <button
              type="button"
              class="chip chip-none"
              [class.on]="none"
              [attr.aria-pressed]="none"
              [disabled]="disabled() || (!none && hasData(c))"
              [title]="!none && hasData(c) ? 'Borre lo registrado para indicar No refiere' : ''"
              (click)="setNone(c, !none)"
            >
              No refiere
            </button>
            @for (f of c.flags; track f.key) {
              @let on = flag(c, f.key);
              <button type="button" class="chip" [class.on]="on" [attr.aria-pressed]="on" [disabled]="disabled()" (click)="setFlag(c, f.key, !on)">
                {{ on ? '✓ ' : '' }}{{ f.label }}
              </button>
            }
          </div>

          @if (!none) {
            @if (c.hasDate) {
              <label class="an-date">
                Fecha
                <input type="date" [value]="surgicalDate()" [readOnly]="disabled()" (input)="setSurgicalDate($any($event.target).value)" />
              </label>
            }
            <textarea
              rows="2"
              [attr.aria-label]="c.label + ': detalle'"
              [placeholder]="disabled() ? '' : c.placeholder"
              [value]="data().antecedentsDetail[c.detail] || ''"
              [readOnly]="disabled()"
              (input)="setDetail(c, $any($event.target).value)"
            ></textarea>
          }
        </section>
      }
    </div>
  `,
  styles: `
    .an-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 2px 0 12px; }
    .an-progress { display: flex; gap: 3px; }
    .seg { width: 18px; height: 6px; border-radius: 3px; background: #dfe6ef; }
    .seg.data { background: #c59b27; }
    .seg.none { background: #8fa3b8; }
    .an-count { color: #4f6480; font-size: .85rem; }
    .an-count strong { color: #1b365d; }
    .an-bulk { margin-left: auto; border: 1px dashed #8fa3b8; background: #fff; color: #1b365d; border-radius: 999px; padding: 4px 12px; font: inherit; font-size: .8rem; cursor: pointer; }
    .an-bulk:hover { border-style: solid; border-color: #1b365d; }

    .an-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 12px; }
    .an-card { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid #dfe6ef; border-left: 4px solid #dfe6ef; border-radius: 14px; background: #fff; box-shadow: 0 1px 2px rgba(27, 54, 93, .04); transition: border-color .15s, box-shadow .15s; min-width: 0; }
    .an-card:focus-within { box-shadow: 0 0 0 3px rgba(27, 54, 93, .08); }
    .an-card.data { border-left-color: #c59b27; }
    .an-card.none { border-left-color: #8fa3b8; background: #f8fafc; }
    header { display: flex; align-items: center; gap: 10px; }
    .an-icon { width: 32px; height: 32px; padding: 6px; border-radius: 10px; background: #eef3f9; color: #1b365d; }
    .an-card.data .an-icon { background: #fbf4e0; color: #9c7613; }
    .an-card.none .an-icon { background: #e9eef4; color: #6f839a; }
    h5 { margin: 0; flex: 1; font-size: .95rem; font-weight: 700; color: #1b365d; }
    .an-pill { font-size: .7rem; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; background: #f1f4f8; color: #7a8ca0; }
    .an-card.data .an-pill { background: #fbf4e0; color: #8a6a12; }
    .an-card.none .an-pill { background: #e7edf3; color: #4f6480; }

    .an-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { border: 1px solid #ccd7e3; background: #fff; color: #1b365d; border-radius: 999px; padding: 4px 11px; font: inherit; font-size: .82rem; cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
    .chip:hover:not(:disabled) { border-color: #1b365d; }
    .chip.on { background: #1b365d; border-color: #1b365d; color: #fff; }
    .chip-none.on { background: #6f839a; border-color: #6f839a; }
    .chip:disabled { cursor: default; opacity: .55; }
    .chip.on:disabled { opacity: 1; }
    .an-date { display: flex; align-items: center; gap: 8px; font-size: .85rem; color: #4f6480; }
    .an-date input { flex: 1; }
    textarea { width: 100%; resize: vertical; min-height: 54px; }
    @media print { .an-bulk { display: none; } .an-card { break-inside: avoid; box-shadow: none; } }
  `,
})
export class PhysioAntecedents {
  readonly data = input.required<PhysiotherapyContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly cards = CARDS;
  readonly stateLabel = STATE_LABEL;
  private readonly version = signal(0);
  readonly state = computed(() => {
    this.version();
    return ensureIntake(this.data());
  });

  readonly stats = computed(() => {
    this.version();
    const states = CARDS.map((c) => this.stateOf(c));
    const count = (s: CardState) => states.filter((x) => x === s).length;
    return { data: count('data'), none: count('none'), empty: count('empty'), done: count('data') + count('none') };
  });

  surgicalDate() {
    return this.state().antecedents.surgical.date;
  }

  private flags(c: CardDef): Record<string, boolean | string> | null {
    return c.group ? (this.state().antecedents[c.group] as unknown as Record<string, boolean | string>) : null;
  }

  flag(c: CardDef, key: string) {
    return this.flags(c)?.[key] === true;
  }

  isNone(c: CardDef) {
    const flags = this.flags(c);
    return flags ? flags['noRefers'] === true : this.state().antecedents.noRefersOther.includes(c.id as OtherAntecedentKey);
  }

  /** Algo registrado en la categoría (casillas, fecha o texto). */
  hasData(c: CardDef) {
    return (
      c.flags.some((f) => this.flag(c, f.key)) ||
      (!!c.hasDate && !!this.surgicalDate()) ||
      !!this.data().antecedentsDetail[c.detail]?.trim()
    );
  }

  stateOf(c: CardDef): CardState {
    return this.hasData(c) ? 'data' : this.isNone(c) ? 'none' : 'empty';
  }

  setNone(c: CardDef, value: boolean) {
    if (value && this.hasData(c)) return;
    this.applyNone(c, value);
    this.commit();
  }

  markEmptyAsNone() {
    CARDS.filter((c) => this.stateOf(c) === 'empty').forEach((c) => this.applyNone(c, true));
    this.commit();
  }

  setFlag(c: CardDef, key: string, value: boolean) {
    const flags = this.flags(c);
    if (!flags) return;
    flags[key] = value;
    if (value) flags['noRefers'] = false;
    this.commit();
  }

  setSurgicalDate(value: string) {
    const surgical = this.state().antecedents.surgical;
    surgical.date = value;
    if (value) surgical.noRefers = false;
    this.commit();
  }

  setDetail(c: CardDef, value: string) {
    this.data().antecedentsDetail[c.detail] = value;
    if (value.trim()) this.applyNone(c, false);
    this.commit();
  }

  private applyNone(c: CardDef, value: boolean) {
    const flags = this.flags(c);
    if (flags) {
      flags['noRefers'] = value;
      return;
    }
    const a = this.state().antecedents;
    const key = c.id as OtherAntecedentKey;
    a.noRefersOther = value ? [...new Set([...a.noRefersOther, key])] : a.noRefersOther.filter((k) => k !== key);
  }

  private commit() {
    this.version.update((v) => v + 1);
    this.changed.emit();
  }
}
