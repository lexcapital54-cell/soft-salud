import { Component, computed, input, output, signal } from '@angular/core';
import { HabIcon } from '../../habilitation/hab-icon';
import {
  AestheticContent,
  CONTRAINDICATION_RESULTS,
  EXAM_FIELDS,
  FITZPATRICK,
  GLOGAU,
  GRADES,
  SKIN_PARAMS,
  SKIN_TYPES,
  bmi,
} from './aesthetic.models';

const FITZ_SWATCH: Record<string, string> = {
  I: '#f6e3d4',
  II: '#efd0b5',
  III: '#d9ab83',
  IV: '#b98457',
  V: '#8a5a36',
  VI: '#4e321f',
};

type Section = 'vitals' | 'exam' | 'diagnosis' | 'plan';

/**
 * Examen físico, valoración estética (escalas opcionales con referencia),
 * complemento diagnóstico y plan de manejo. No sugiere dosis ni técnicas.
 */
@Component({
  selector: 'app-aesthetic-exam',
  imports: [HabIcon],
  styleUrl: './aesthetic.scss',
  template: `
    @let d = data();
    @let ro = disabled();

    @if (part() !== 'plan') {
    <section class="aes-block" id="aes-examen">
      <div class="aes-head">
        <span class="aes-head-icon"><hab-icon name="eye" /></span>
        <h4>Examen físico</h4>
      </div>
      <p class="aes-sub">Signos vitales y medidas</p>
      <div class="aes-grid">
        <label class="aes-field">Tensión arterial (mmHg)
          <input [value]="d.vitals.bloodPressure" [readOnly]="ro" placeholder="120/80" (input)="set('vitals', 'bloodPressure', $event)" />
        </label>
        <label class="aes-field">Frecuencia cardiaca (lpm)
          <input inputmode="numeric" [value]="d.vitals.heartRate" [readOnly]="ro" (input)="set('vitals', 'heartRate', $event)" />
        </label>
        <label class="aes-field">Frecuencia respiratoria (rpm)
          <input inputmode="numeric" [value]="d.vitals.respiratoryRate" [readOnly]="ro" (input)="set('vitals', 'respiratoryRate', $event)" />
        </label>
        <label class="aes-field">Temperatura (°C)
          <input inputmode="decimal" [value]="d.vitals.temperature" [readOnly]="ro" (input)="set('vitals', 'temperature', $event)" />
        </label>
        <label class="aes-field">SpO₂ (%)
          <input inputmode="numeric" [value]="d.vitals.spo2" [readOnly]="ro" (input)="set('vitals', 'spo2', $event)" />
        </label>
        <label class="aes-field">Peso (kg)
          <input inputmode="decimal" [value]="d.vitals.weightKg" [readOnly]="ro" (input)="set('vitals', 'weightKg', $event)" />
        </label>
        <label class="aes-field">Talla (cm)
          <input inputmode="decimal" [value]="d.vitals.heightCm" [readOnly]="ro" (input)="set('vitals', 'heightCm', $event)" />
        </label>
        @if (imc(); as v) {
          <div class="aes-field">
            IMC calculado
            <span class="calc">{{ v }} kg/m²</span>
          </div>
        }
      </div>

      <p class="aes-sub">Hallazgos</p>
      <div class="aes-grid-wide">
        @for (f of examFields; track f.key) {
          <label class="aes-field">{{ f.label }}
            <textarea rows="2" [value]="d.exam[f.key] || ''" [readOnly]="ro" (input)="setExam(f.key, $event)"></textarea>
          </label>
        }
      </div>
    </section>

    <section class="aes-block" id="aes-valoracion">
      <div class="aes-head">
        <span class="aes-head-icon"><hab-icon name="scale" /></span>
        <h4>Valoración estética</h4>
      </div>
      <p class="aes-help">Las escalas son opcionales. Haga clic de nuevo sobre una opción para quitarla.</p>

      <p class="aes-sub" id="aes-fitz">Fototipo de Fitzpatrick</p>
      <div class="scale" role="group" aria-labelledby="aes-fitz">
        @for (f of fitzpatrick; track f.key) {
          <button type="button" class="scale-opt" [class.on]="d.assessment.fitzpatrick === f.key" [attr.aria-pressed]="d.assessment.fitzpatrick === f.key"
            [disabled]="ro" (click)="pick('fitzpatrick', f.key)">
            <strong><span class="swatch" [style.background]="swatch[f.key]"></span>Tipo {{ f.label }}</strong>
            <small>{{ f.hint }}</small>
          </button>
        }
      </div>
      <p class="ref">Fitzpatrick TB. The validity and practicality of sun-reactive skin types I through VI. Arch Dermatol. 1988;124(6):869-71.</p>

      <p class="aes-sub" id="aes-glogau">Fotoenvejecimiento de Glogau</p>
      <div class="scale" role="group" aria-labelledby="aes-glogau">
        @for (g of glogau; track g.key) {
          <button type="button" class="scale-opt" [class.on]="d.assessment.glogau === g.key" [attr.aria-pressed]="d.assessment.glogau === g.key"
            [disabled]="ro" (click)="pick('glogau', g.key)">
            <strong>Tipo {{ g.label }}</strong>
            <small>{{ g.hint }}</small>
          </button>
        }
      </div>
      <p class="ref">Glogau RG. Aesthetic and anatomic analysis of the aging skin. Semin Cutan Med Surg. 1996;15(3):134-8.</p>

      <p class="aes-sub" id="aes-tipo-piel">Tipo de piel</p>
      <div class="chips" role="group" aria-labelledby="aes-tipo-piel">
        @for (s of skinTypes; track s.key) {
          <button type="button" class="chip" [class.on]="d.assessment.skinType === s.key" [attr.aria-pressed]="d.assessment.skinType === s.key"
            [disabled]="ro" (click)="pick('skinType', s.key)">{{ s.label }}</button>
        }
      </div>

      <p class="aes-sub">Parámetros cutáneos</p>
      <p class="aes-help">Grado descriptivo según criterio clínico (no corresponde a una escala validada).</p>
      <div class="aes-grid">
        @for (p of skinParams; track p.key) {
          <label class="aes-field">{{ p.label }}
            <select [value]="d.assessment.params[p.key] || ''" [disabled]="ro" (change)="setParam(p.key, $event)">
              <option value="">No evaluado</option>
              @for (g of grades; track g.key) {
                <option [value]="g.key">{{ g.label }}</option>
              }
            </select>
          </label>
        }
      </div>

      <div class="aes-grid-wide" style="margin-top: 12px">
        <label class="aes-field">Proporciones faciales
          <textarea rows="2" [value]="d.assessment.proportions" [readOnly]="ro" (input)="set('assessment', 'proportions', $event)"
            placeholder="Tercios, quintos, perfil, relación labial…"></textarea>
        </label>
        <label class="aes-field">Valoración por regiones anatómicas
          <textarea rows="2" [value]="d.assessment.regions" [readOnly]="ro" (input)="set('assessment', 'regions', $event)"></textarea>
        </label>
        <label class="aes-field">Otras observaciones
          <textarea rows="2" [value]="d.assessment.notes" [readOnly]="ro" (input)="set('assessment', 'notes', $event)"></textarea>
        </label>
      </div>
    </section>
    }

    @if (part() !== 'exam') {
    <section class="aes-block" id="aes-diagnostico">
      <div class="aes-head">
        <span class="aes-head-icon"><hab-icon name="clipboard" /></span>
        <h4>Diagnóstico y contraindicaciones</h4>
      </div>
      <p class="aes-help">La impresión diagnóstica y los códigos CIE-10 se registran en sus campos de la historia.</p>
      <div class="aes-grid-wide">
        <label class="aes-field">Hallazgos relevantes
          <textarea rows="2" [value]="d.diagnosis.findings" [readOnly]="ro" (input)="set('diagnosis', 'findings', $event)"></textarea>
        </label>
        <label class="aes-field">Diagnósticos diferenciales
          <textarea rows="2" [value]="d.diagnosis.differentials" [readOnly]="ro" (input)="set('diagnosis', 'differentials', $event)"></textarea>
        </label>
      </div>
      <p class="aes-sub" id="aes-contra">Contraindicaciones evaluadas</p>
      <div class="chips" role="group" aria-labelledby="aes-contra">
        @for (c of contraResults; track c.key) {
          <button type="button" class="chip" [class.on]="d.diagnosis.contraindications === c.key" [attr.aria-pressed]="d.diagnosis.contraindications === c.key"
            [disabled]="ro" (click)="pick('contraindications', c.key, 'diagnosis')">{{ c.label }}</button>
        }
      </div>
      @if (d.diagnosis.contraindications && d.diagnosis.contraindications !== 'NINGUNA') {
        <label class="aes-field" style="margin-top: 8px">Detalle de contraindicaciones
          <textarea rows="2" [value]="d.diagnosis.contraindicationsDetail" [readOnly]="ro" (input)="set('diagnosis', 'contraindicationsDetail', $event)"></textarea>
        </label>
      }
      <label class="aes-field" style="margin-top: 8px">Justificación clínica del tratamiento
        <textarea rows="2" [value]="d.diagnosis.justification" [readOnly]="ro" (input)="set('diagnosis', 'justification', $event)"></textarea>
      </label>
    </section>

    <section class="aes-block" id="aes-plan">
      <div class="aes-head">
        <span class="aes-head-icon"><hab-icon name="list" /></span>
        <h4>Plan de manejo</h4>
      </div>
      <p class="aes-help">Las decisiones terapéuticas (producto, dosis, técnica) corresponden al profesional habilitado.</p>
      <div class="aes-grid-wide">
        <label class="aes-field">Procedimiento considerado
          <textarea rows="2" [value]="d.plan.procedures" [readOnly]="ro" (input)="set('plan', 'procedures', $event)"></textarea>
        </label>
        <label class="aes-field">Objetivos
          <textarea rows="2" [value]="d.plan.objectives" [readOnly]="ro" (input)="set('plan', 'objectives', $event)"></textarea>
        </label>
        <label class="aes-field">Alternativas explicadas
          <textarea rows="2" [value]="d.plan.alternatives" [readOnly]="ro" (input)="set('plan', 'alternatives', $event)"></textarea>
        </label>
        <label class="aes-field">Riesgos individualizados
          <textarea rows="2" [value]="d.plan.risks" [readOnly]="ro" (input)="set('plan', 'risks', $event)"></textarea>
        </label>
        <label class="aes-field">Recomendaciones
          <textarea rows="2" [value]="d.plan.recommendations" [readOnly]="ro" (input)="set('plan', 'recommendations', $event)"></textarea>
        </label>
        <label class="aes-field">Seguimiento
          <textarea rows="2" [value]="d.plan.followUp" [readOnly]="ro" (input)="set('plan', 'followUp', $event)"></textarea>
        </label>
        <label class="aes-field">Fecha de próximo control
          <input type="date" [value]="d.plan.followUpDate" [readOnly]="ro" (input)="set('plan', 'followUpDate', $event)" />
        </label>
      </div>
    </section>
    }
  `,
})
export class AestheticExam {
  readonly data = input.required<AestheticContent>();
  readonly disabled = input(false);
  /** 'exam' = examen y valoración; 'plan' = diagnóstico y plan. */
  readonly part = input<'all' | 'exam' | 'plan'>('all');
  readonly changed = output<void>();

  readonly examFields = EXAM_FIELDS;
  readonly fitzpatrick = FITZPATRICK;
  readonly glogau = GLOGAU;
  readonly skinTypes = SKIN_TYPES;
  readonly skinParams = SKIN_PARAMS;
  readonly grades = GRADES;
  readonly contraResults = CONTRAINDICATION_RESULTS;
  readonly swatch = FITZ_SWATCH;

  private readonly version = signal(0);
  readonly imc = computed(() => {
    this.version();
    return bmi(this.data().vitals);
  });

  set(section: Section | 'assessment', field: string, ev: Event) {
    const target = this.data()[section] as unknown as Record<string, string>;
    target[field] = (ev.target as HTMLInputElement).value;
    this.commit();
  }

  setExam(key: string, ev: Event) {
    this.data().exam[key] = (ev.target as HTMLTextAreaElement).value;
    this.commit();
  }

  setParam(key: string, ev: Event) {
    this.data().assessment.params[key] = (ev.target as HTMLSelectElement).value;
    this.commit();
  }

  pick(field: string, value: string, section: 'assessment' | 'diagnosis' = 'assessment') {
    const target = this.data()[section] as unknown as Record<string, string>;
    target[field] = target[field] === value ? '' : value;
    this.commit();
  }

  private commit() {
    this.version.update((v) => v + 1);
    this.changed.emit();
  }
}
