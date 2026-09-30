import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface ExamField {
  key: string;
  label: string;
  options?: string[];
  placeholder?: string;
  /** Valor normal; cualquier otro valor seleccionado pide descripción del hallazgo. */
  normal?: string;
  notePlaceholder?: string;
}

/**
 * Grupo del examen clínico con botones por opción. Muta `values` y `notes` del padre
 * (mismo objeto de la historia) y avisa con `changed`.
 */
@Component({
  selector: 'app-dental-exam-group',
  imports: [FormsModule],
  template: `
    @let _t = tick();
    @if (!disabled() && pendingNormal()) {
      <div class="ex-tools">
        <button type="button" class="ex-all" (click)="setRestNormal()">
          ✓ Marcar {{ pendingNormal() }} {{ pendingNormal() === 1 ? 'campo pendiente' : 'campos pendientes' }} como normal
        </button>
      </div>
    }
    <div class="ex-grid">
      @for (f of fields(); track f.key) {
        @let v = values()[f.key] || '';
        <div class="ex-card" [class.altered]="isAltered(f)" [class.normal]="!!f.normal && v === f.normal" [class.wide]="isAltered(f)">
          <span class="ex-label">{{ f.label }}</span>
          @if (f.options) {
            <div class="ex-chips" role="group" [attr.aria-label]="f.label">
              @for (o of f.options; track o) {
                <button
                  type="button"
                  [class.on]="v === o"
                  [class.is-normal]="o === f.normal"
                  [attr.aria-pressed]="v === o"
                  [disabled]="disabled()"
                  (click)="pick(f, o)"
                >
                  {{ o }}
                </button>
              }
            </div>
          } @else {
            <input
              [ngModel]="v"
              (ngModelChange)="setText(f, $event)"
              [readonly]="disabled()"
              [placeholder]="f.placeholder || ''"
            />
          }
          @if (isAltered(f)) {
            <input
              class="ex-note"
              [ngModel]="notes()[noteKey(f)] || ''"
              (ngModelChange)="setNote(f, $event)"
              [readonly]="disabled()"
              [placeholder]="f.notePlaceholder || 'Describa el hallazgo: localización, tamaño, características…'"
              [attr.aria-label]="'Descripción — ' + f.label"
            />
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .ex-tools { display: flex; justify-content: flex-end; margin: -4px 0 8px; }
    .ex-all {
      padding: 4px 12px;
      border: 1px solid #99d5c9;
      border-radius: 999px;
      background: #f0fdf9;
      color: #0f766e;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .ex-all:hover { background: #ccfbef; }
    .ex-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
    .ex-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #fff;
      transition: border-color 0.15s, background 0.15s;
    }
    .ex-card.normal { background: #f8fafc; }
    .ex-card.altered { border-color: #f59e0b; background: #fffbeb; }
    .ex-card.wide { grid-column: span 2; }
    .ex-label { font-size: 12px; font-weight: 700; color: #334155; }
    .ex-chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .ex-chips button {
      padding: 3px 9px;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      background: #fff;
      color: #475569;
      font-size: 12px;
      cursor: pointer;
    }
    .ex-chips button:hover:not(:disabled) { border-color: #12609a; }
    .ex-chips button.on { background: #12609a; border-color: #12609a; color: #fff; font-weight: 600; }
    .ex-chips button.on:not(.is-normal) { background: #d97706; border-color: #d97706; }
    .ex-chips button:disabled { cursor: default; }
    .ex-chips button:disabled:not(.on) { opacity: 0.55; }
    input { width: 100%; }
    .ex-note { border-color: #fbbf24; background: #fff; }
    @media (max-width: 640px) { .ex-card.wide { grid-column: auto; } }
  `,
})
export class DentalExamGroup {
  readonly fields = input.required<ExamField[]>();
  readonly values = input.required<Record<string, string>>();
  readonly notes = input.required<Record<string, string>>();
  /** Prefijo de la clave de la nota (p. ej. «extraoral» → «extraoral.lips»). */
  readonly prefix = input.required<string>();
  readonly disabled = input(false);
  readonly valueChange = output<{ key: string; value: string }>();
  readonly changed = output<void>();

  protected readonly tick = signal(0);

  noteKey(f: ExamField) {
    return `${this.prefix()}.${f.key}`;
  }

  isAltered(f: ExamField) {
    const v = this.values()[f.key];
    return !!f.normal && !!v && v !== f.normal;
  }

  pick(f: ExamField, option: string) {
    const values = this.values();
    values[f.key] = values[f.key] === option ? '' : option;
    this.emit(f.key, values[f.key]);
  }

  setText(f: ExamField, value: string) {
    this.values()[f.key] = value;
    this.emit(f.key, value);
  }

  setNote(f: ExamField, value: string) {
    const notes = this.notes();
    if (value) notes[this.noteKey(f)] = value;
    else delete notes[this.noteKey(f)];
    this.tick.update((t) => t + 1);
    this.changed.emit();
  }

  pendingNormal() {
    this.tick();
    const values = this.values();
    return this.fields().filter((f) => f.normal && !values[f.key]).length;
  }

  setRestNormal() {
    const values = this.values();
    for (const f of this.fields()) {
      if (f.normal && !values[f.key]) {
        values[f.key] = f.normal;
        this.valueChange.emit({ key: f.key, value: f.normal });
      }
    }
    this.tick.update((t) => t + 1);
    this.changed.emit();
  }

  private emit(key: string, value: string) {
    this.tick.update((t) => t + 1);
    this.valueChange.emit({ key, value });
    this.changed.emit();
  }
}
