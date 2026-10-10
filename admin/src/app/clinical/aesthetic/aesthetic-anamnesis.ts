import { Component, computed, input, output, signal } from '@angular/core';
import { HabIcon } from '../../habilitation/hab-icon';
import {
  AES_CONDITIONS,
  AES_CONDITION_GROUPS,
  AES_PROCEDURE_TYPES,
  AES_SYSTEMS,
  AES_ZONES,
  ANSWER_LABEL,
  AesAnswer,
  AesCondition,
  AestheticContent,
  SYSTEM_STATUS_LABEL,
  SystemStatus,
  newId,
} from './aesthetic.models';

const ANSWERS: Array<Exclude<AesAnswer, '' | 'NA'>> = ['SI', 'NO', 'DESCONOCIDO'];
const SYSTEM_STATUSES: Array<Exclude<SystemStatus, ''>> = ['POS', 'NEG', 'NE'];

/**
 * Anamnesis de medicina estética: motivo ampliado, antecedentes Sí/No/Desconocido,
 * antecedentes estéticos, medicación y revisión por sistemas.
 * "Sin marcar" significa no investigado; "No" es ausencia confirmada.
 */
@Component({
  selector: 'app-aesthetic-anamnesis',
  imports: [HabIcon],
  styleUrl: './aesthetic.scss',
  template: `
    @let d = data();
    @let ro = disabled();

    <section class="aes-block" id="aes-consulta">
      <div class="aes-head">
        <span class="aes-head-icon"><hab-icon name="clipboard" /></span>
        <h4>Motivo de consulta estético</h4>
      </div>
      <div class="aes-grid-wide">
        <label class="aes-field">
          Inconformidades estéticas
          <textarea rows="2" [value]="d.consult.concerns" [readOnly]="ro" (input)="setConsult('concerns', $event)"
            placeholder="Lo que le molesta al paciente, en sus palabras"></textarea>
        </label>
        <label class="aes-field">
          Objetivos del paciente
          <textarea rows="2" [value]="d.consult.goals" [readOnly]="ro" (input)="setConsult('goals', $event)"></textarea>
        </label>
        <label class="aes-field">
          Expectativas del tratamiento
          <textarea rows="2" [value]="d.consult.expectations" [readOnly]="ro" (input)="setConsult('expectations', $event)"></textarea>
        </label>
        <label class="aes-field">
          Tiempo de evolución
          <input [value]="d.consult.evolutionTime" [readOnly]="ro" (input)="setConsult('evolutionTime', $event)" placeholder="Ej.: 2 años" />
        </label>
        <label class="aes-field">
          Síntomas asociados
          <textarea rows="2" [value]="d.consult.symptoms" [readOnly]="ro" (input)="setConsult('symptoms', $event)"></textarea>
        </label>
        <label class="aes-field">
          Resultados de intervenciones previas
          <textarea rows="2" [value]="d.consult.previousResults" [readOnly]="ro" (input)="setConsult('previousResults', $event)"></textarea>
        </label>
      </div>

      <p class="aes-sub" id="aes-zonas-label">Zonas de interés</p>
      <div class="chips" role="group" aria-labelledby="aes-zonas-label">
        @for (z of zones; track z.key) {
          @let on = d.consult.zones.includes(z.key);
          <button type="button" class="chip" [class.on]="on" [attr.aria-pressed]="on" [disabled]="ro" (click)="toggle(d.consult.zones, z.key)">
            {{ z.label }}
          </button>
        }
      </div>

      <p class="aes-sub" id="aes-trat-label">Tratamientos solicitados</p>
      <div class="chips" role="group" aria-labelledby="aes-trat-label">
        @for (t of procedureTypes; track t.key) {
          @let on = d.consult.requestedTreatments.includes(t.key);
          <button type="button" class="chip" [class.on]="on" [attr.aria-pressed]="on" [disabled]="ro" (click)="toggle(d.consult.requestedTreatments, t.key)">
            {{ t.label }}
          </button>
        }
      </div>
    </section>

    <section class="aes-block" id="aes-antecedentes">
      <div class="aes-head">
        <span class="aes-head-icon"><hab-icon name="history" /></span>
        <h4>Antecedentes personales</h4>
      </div>
      @let st = historyStats();
      <div class="progress">
        <span class="bar" aria-hidden="true"><span [style.width.%]="(st.done / conditions.length) * 100"></span></span>
        <span><strong>{{ st.done }}</strong> de {{ conditions.length }} investigados · {{ st.yes }} con hallazgos</span>
        @if (!ro && st.done < conditions.length) {
          <button type="button" class="link-btn" (click)="markPendingNo()">Marcar "No" en los {{ conditions.length - st.done }} sin investigar</button>
        }
      </div>
      <p class="aes-help">Sin marcar = no investigado. "No" = ausencia confirmada con el paciente.</p>

      @for (g of groups; track g) {
        <p class="aes-sub">{{ g }}</p>
        <div class="cond-list">
          @for (c of conditionsOf(g); track c.key) {
            @let a = answer(c.key);
            <div class="cond" [class.yes]="a === 'SI'" [class.no]="a === 'NO' || a === 'NA'" [class.unk]="a === 'DESCONOCIDO'">
              <div class="cond-top">
                <span class="cond-label" [id]="'aes-c-' + c.key">
                  {{ c.label }}
                  @if (c.hint) {
                    <span class="cond-hint">{{ c.hint }}</span>
                  }
                </span>
                <div class="chips" role="group" [attr.aria-labelledby]="'aes-c-' + c.key">
                  @for (opt of answersFor(c); track opt) {
                    <button type="button" class="chip" [class.on]="a === opt" [class.neg]="opt === 'NO' || opt === 'NA'" [class.unk]="opt === 'DESCONOCIDO'"
                      [attr.aria-pressed]="a === opt" [disabled]="ro" (click)="setAnswer(c.key, opt)">
                      {{ answerLabel[opt] }}
                    </button>
                  }
                </div>
              </div>
              @if (a === 'SI' || detail(c.key)) {
                <textarea rows="2" [attr.aria-label]="c.label + ': detalle'" [value]="detail(c.key)" [readOnly]="ro"
                  [placeholder]="ro ? '' : 'Detalle (diagnóstico, fecha, tratamiento…)'" (input)="setDetail(c.key, $event)"></textarea>
              }
            </div>
          }
        </div>
      }
    </section>

    <section class="aes-block" id="aes-esteticos">
      <div class="aes-head">
        <span class="aes-head-icon"><hab-icon name="layers" /></span>
        <h4>Antecedentes estéticos</h4>
      </div>
      <div class="cond-top chips" role="group" aria-label="¿Tratamientos estéticos previos?">
        <span class="cond-label">¿Tratamientos estéticos previos?</span>
        @for (opt of answers; track opt) {
          <button type="button" class="chip" [class.on]="d.previousTreatmentsAnswer === opt" [class.neg]="opt === 'NO'" [class.unk]="opt === 'DESCONOCIDO'"
            [attr.aria-pressed]="d.previousTreatmentsAnswer === opt" [disabled]="ro || (opt !== 'SI' && d.previousTreatments.length > 0)"
            (click)="setTopAnswer('previousTreatmentsAnswer', opt)">
            {{ answerLabel[opt] }}
          </button>
        }
      </div>
      @if (d.previousTreatmentsAnswer === 'SI' || d.previousTreatments.length) {
        <div class="rows" style="margin-top: 10px">
          @for (t of d.previousTreatments; track t.id; let i = $index) {
            <div class="row-card">
              <label class="aes-field">
                Tipo
                <select [value]="t.type" [disabled]="ro" (change)="setRow(t, 'type', $event)">
                  <option value="">Seleccione…</option>
                  @for (p of procedureTypes; track p.key) {
                    <option [value]="p.key">{{ p.label }}</option>
                  }
                </select>
              </label>
              <label class="aes-field">
                Fecha aproximada
                <input [value]="t.date" [readOnly]="ro" placeholder="mm/aaaa" (input)="setRow(t, 'date', $event)" />
              </label>
              <label class="aes-field">
                Zona
                <input [value]="t.zone" [readOnly]="ro" (input)="setRow(t, 'zone', $event)" />
              </label>
              <label class="aes-field">
                Producto utilizado
                <input [value]="t.product" [readOnly]="ro" placeholder="Marca o producto, si lo conoce" (input)="setRow(t, 'product', $event)" />
              </label>
              <label class="aes-field wide">
                Complicaciones registradas
                <input [value]="t.complications" [readOnly]="ro" placeholder="Ninguna / describa" (input)="setRow(t, 'complications', $event)" />
              </label>
              <label class="aes-field wide">
                Observaciones
                <input [value]="t.notes" [readOnly]="ro" (input)="setRow(t, 'notes', $event)" />
              </label>
              @if (!ro) {
                <div class="row-actions wide">
                  <button type="button" class="btn-remove" (click)="removeRow(d.previousTreatments, i)">
                    <hab-icon name="trash" [size]="16" /> Quitar
                  </button>
                </div>
              }
            </div>
          } @empty {
            <p class="empty">Aún no hay tratamientos previos registrados.</p>
          }
          @if (!ro) {
            <button type="button" class="btn-add" (click)="addTreatment()"><hab-icon name="plus" [size]="16" /> Agregar tratamiento previo</button>
          }
        </div>
      }
    </section>

    <section class="aes-block" id="aes-medicacion">
      <div class="aes-head">
        <span class="aes-head-icon"><hab-icon name="pill" /></span>
        <h4>Medicación actual</h4>
      </div>
      <div class="cond-top chips" role="group" aria-label="¿Toma medicamentos actualmente?">
        <span class="cond-label">¿Toma medicamentos actualmente?</span>
        @for (opt of answers; track opt) {
          <button type="button" class="chip" [class.on]="d.medicationsAnswer === opt" [class.neg]="opt === 'NO'" [class.unk]="opt === 'DESCONOCIDO'"
            [attr.aria-pressed]="d.medicationsAnswer === opt" [disabled]="ro || (opt !== 'SI' && d.medications.length > 0)"
            (click)="setTopAnswer('medicationsAnswer', opt)">
            {{ answerLabel[opt] }}
          </button>
        }
      </div>
      @if (d.medicationsAnswer === 'SI' || d.medications.length) {
        <div class="rows" style="margin-top: 10px">
          @for (m of d.medications; track m.id; let i = $index) {
            <div class="row-card">
              <label class="aes-field">
                Medicamento
                <input [value]="m.name" [readOnly]="ro" (input)="setRow(m, 'name', $event)" />
              </label>
              <label class="aes-field">
                Concentración
                <input [value]="m.concentration" [readOnly]="ro" (input)="setRow(m, 'concentration', $event)" />
              </label>
              <label class="aes-field">
                Vía
                <input [value]="m.route" [readOnly]="ro" placeholder="Oral, tópica…" (input)="setRow(m, 'route', $event)" />
              </label>
              <label class="aes-field">
                Frecuencia
                <input [value]="m.frequency" [readOnly]="ro" (input)="setRow(m, 'frequency', $event)" />
              </label>
              <label class="aes-field wide">
                Observaciones
                <input [value]="m.notes" [readOnly]="ro" (input)="setRow(m, 'notes', $event)" />
              </label>
              @if (!ro) {
                <div class="row-actions wide">
                  <button type="button" class="btn-remove" (click)="removeRow(d.medications, i)">
                    <hab-icon name="trash" [size]="16" /> Quitar
                  </button>
                </div>
              }
            </div>
          } @empty {
            <p class="empty">Aún no hay medicamentos registrados.</p>
          }
          @if (!ro) {
            <button type="button" class="btn-add" (click)="addMedication()"><hab-icon name="plus" [size]="16" /> Agregar medicamento</button>
          }
        </div>
      }
    </section>

    <section class="aes-block" id="aes-sistemas">
      <div class="aes-head">
        <span class="aes-head-icon"><hab-icon name="activity" /></span>
        <h4>Revisión por sistemas</h4>
      </div>
      <div class="cond-list">
        @for (s of systems; track s.key) {
          @let row = d.systems[s.key];
          @let stt = row?.status || '';
          <div class="cond" [class.yes]="stt === 'POS'" [class.no]="stt === 'NEG'" [class.unk]="stt === 'NE'">
            <div class="cond-top">
              <span class="cond-label" [id]="'aes-s-' + s.key">{{ s.label }}</span>
              <div class="chips" role="group" [attr.aria-labelledby]="'aes-s-' + s.key">
                @for (opt of systemStatuses; track opt) {
                  <button type="button" class="chip" [class.on]="stt === opt" [class.neg]="opt === 'NEG'" [class.unk]="opt === 'NE'"
                    [attr.aria-pressed]="stt === opt" [disabled]="ro" (click)="setSystem(s.key, opt)">
                    {{ systemLabel[opt] }}
                  </button>
                }
              </div>
            </div>
            @if (stt === 'POS' || row?.detail) {
              <textarea rows="2" [attr.aria-label]="s.label + ': hallazgo'" [value]="row?.detail || ''" [readOnly]="ro"
                [placeholder]="ro ? '' : 'Describa el hallazgo'" (input)="setSystemDetail(s.key, $event)"></textarea>
            }
          </div>
        }
      </div>
    </section>
  `,
})
export class AestheticAnamnesis {
  readonly data = input.required<AestheticContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly zones = AES_ZONES;
  readonly procedureTypes = AES_PROCEDURE_TYPES;
  readonly conditions = AES_CONDITIONS;
  readonly groups = AES_CONDITION_GROUPS;
  readonly systems = AES_SYSTEMS;
  readonly answers = ANSWERS;
  readonly answerLabel = ANSWER_LABEL;
  readonly systemStatuses = SYSTEM_STATUSES;
  readonly systemLabel = SYSTEM_STATUS_LABEL;

  private readonly version = signal(0);

  readonly historyStats = computed(() => {
    this.version();
    const h = this.data().history;
    const done = AES_CONDITIONS.filter((c) => !!h[c.key]?.answer).length;
    const yes = AES_CONDITIONS.filter((c) => h[c.key]?.answer === 'SI').length;
    return { done, yes };
  });

  conditionsOf(group: string) {
    return AES_CONDITIONS.filter((c) => c.group === group);
  }

  answersFor(c: AesCondition): Array<Exclude<AesAnswer, ''>> {
    return c.allowNa ? [...ANSWERS, 'NA'] : ANSWERS;
  }

  answer(key: string): AesAnswer {
    return this.data().history[key]?.answer || '';
  }

  detail(key: string) {
    return this.data().history[key]?.detail || '';
  }

  setAnswer(key: string, value: AesAnswer) {
    const h = this.data().history;
    const cur = h[key] || { answer: '', detail: '' };
    h[key] = { ...cur, answer: cur.answer === value ? '' : value };
    this.commit();
  }

  setDetail(key: string, ev: Event) {
    const h = this.data().history;
    const value = (ev.target as HTMLTextAreaElement).value;
    h[key] = { answer: h[key]?.answer || (value.trim() ? 'SI' : ''), detail: value };
    this.commit();
  }

  markPendingNo() {
    const h = this.data().history;
    for (const c of AES_CONDITIONS) {
      if (!h[c.key]?.answer) h[c.key] = { answer: 'NO', detail: h[c.key]?.detail || '' };
    }
    this.commit();
  }

  setConsult(field: keyof AestheticContent['consult'], ev: Event) {
    (this.data().consult as unknown as Record<string, string>)[field] = (ev.target as HTMLInputElement).value;
    this.commit();
  }

  toggle(list: string[], key: string) {
    const i = list.indexOf(key);
    if (i >= 0) list.splice(i, 1);
    else list.push(key);
    this.commit();
  }

  setTopAnswer(field: 'previousTreatmentsAnswer' | 'medicationsAnswer', value: AesAnswer) {
    const d = this.data();
    d[field] = d[field] === value ? '' : value;
    this.commit();
  }

  setRow<T extends object>(row: T, field: keyof T, ev: Event) {
    (row as Record<string, unknown>)[field as string] = (ev.target as HTMLInputElement).value;
    this.commit();
  }

  removeRow(list: unknown[], index: number) {
    list.splice(index, 1);
    this.commit();
  }

  addTreatment() {
    const d = this.data();
    d.previousTreatmentsAnswer = 'SI';
    d.previousTreatments.push({ id: newId(), type: '', date: '', zone: '', product: '', complications: '', notes: '' });
    this.commit();
  }

  addMedication() {
    const d = this.data();
    d.medicationsAnswer = 'SI';
    d.medications.push({ id: newId(), name: '', concentration: '', route: '', frequency: '', notes: '' });
    this.commit();
  }

  setSystem(key: string, status: SystemStatus) {
    const s = this.data().systems;
    const cur = s[key] || { status: '', detail: '' };
    s[key] = { ...cur, status: cur.status === status ? '' : status };
    this.commit();
  }

  setSystemDetail(key: string, ev: Event) {
    const s = this.data().systems;
    const value = (ev.target as HTMLTextAreaElement).value;
    s[key] = { status: s[key]?.status || (value.trim() ? 'POS' : ''), detail: value };
    this.commit();
  }

  private commit() {
    this.version.update((v) => v + 1);
    this.changed.emit();
  }
}
