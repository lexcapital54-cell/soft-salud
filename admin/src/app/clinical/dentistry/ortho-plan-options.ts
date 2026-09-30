import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DentistryContent, ToothCondition } from './dentistry.models';
import { OrthoExtraction, OrthoPlanOption, newDxId } from './ortho-dx.data';
import { COMMON_EXTRACTIONS, EXTRACTION_REASONS, EXTRACTION_STATUSES } from './ortho-dx.models';

type Tab = 'plans' | 'extractions';

const STATUS_COLOR: Record<string, string> = { Propuesta: '#64748b', Aceptada: '#12609a', Realizada: '#16a34a', Cancelada: '#dc2626' };

/** Alternativas de tratamiento (el profesional elige) y plan de extracciones. */
@Component({
  selector: 'app-ortho-plan-options',
  imports: [FormsModule],
  template: `
    @let dx = data().orthoDx;
    <div class="po">
      <div class="po-tabs" role="tablist">
        <button type="button" role="tab" [class.on]="tab() === 'plans'" (click)="tab.set('plans')">Alternativas de tratamiento <span class="po-n">{{ dx.plans.length }}</span></button>
        <button type="button" role="tab" [class.on]="tab() === 'extractions'" (click)="tab.set('extractions')">Extracciones <span class="po-n">{{ activeExtractions() }}</span></button>
      </div>

      @if (tab() === 'plans') {
        <div class="po-plans">
          @for (p of dx.plans; track p.id) {
            <article class="po-plan" [class.sel]="dx.selectedPlan === p.id">
              <header>
                <span class="po-badge">Plan {{ p.label }}</span>
                @if (dx.selectedPlan === p.id) {
                  <span class="po-chosen">Elegido{{ dx.selectedBy ? ' por ' + dx.selectedBy : '' }}{{ dx.selectedAt ? ' · ' + dx.selectedAt : '' }}</span>
                }
                @if (!disabled()) {
                  <button type="button" class="po-del" (click)="removePlan(p)" aria-label="Quitar plan">×</button>
                }
              </header>
              <label>Descripción <textarea rows="2" [(ngModel)]="p.description" (ngModelChange)="touch()" [readonly]="disabled()"></textarea></label>
              <div class="po-grid">
                <label>Ventajas <textarea rows="2" [(ngModel)]="p.advantages" (ngModelChange)="touch()" [readonly]="disabled()"></textarea></label>
                <label>Consideraciones <textarea rows="2" [(ngModel)]="p.considerations" (ngModelChange)="touch()" [readonly]="disabled()"></textarea></label>
                <label>Extracciones <input [(ngModel)]="p.extractions" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Sin extracciones / 14, 24…" /></label>
                <label>Aparatología <input [(ngModel)]="p.appliance" (ngModelChange)="touch()" [readonly]="disabled()" list="po-app-list" /></label>
                <label>Duración estimada <input [(ngModel)]="p.duration" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="18 a 24 meses" /></label>
                <label>Observaciones <input [(ngModel)]="p.notes" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
              </div>
              @if (!disabled()) {
                <div class="po-actions">
                  @if (dx.selectedPlan !== p.id) {
                    <button type="button" class="po-choose" (click)="choose(p)">Elegir este plan</button>
                  } @else {
                    <button type="button" class="po-link" (click)="unchoose()">Quitar elección</button>
                    <button type="button" class="po-btn" (click)="copyToPlanning(p)">Copiar a la planificación</button>
                  }
                </div>
              }
            </article>
          }
        </div>
        <datalist id="po-app-list">
          @for (a of appliances(); track a) {
            <option [value]="a"></option>
          }
        </datalist>
        @if (!disabled() && dx.plans.length < 5) {
          <button type="button" class="po-link" (click)="addPlan()">+ Agregar alternativa (Plan {{ nextLabel() }})</button>
        }
        <p class="po-note">El sistema no decide cuál alternativa es mejor: el profesional elige y la elección queda registrada con su nombre y la fecha.</p>
      } @else {
        @if (!disabled()) {
          <div class="po-quick">
            <span>Agregar rápido:</span>
            @for (t of commonTeeth; track t) {
              <button type="button" [class.on]="hasExtraction(t)" (click)="toggleQuick(t)">{{ t }}</button>
            }
          </div>
        }
        <div class="po-list">
          @for (e of dx.extractions; track e.id) {
            <div class="po-row">
              <input [(ngModel)]="e.tooth" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Pieza" class="po-tooth" />
              <select [(ngModel)]="e.reason" (ngModelChange)="touch()" [disabled]="disabled()" aria-label="Motivo">
                <option value="">Motivo…</option>
                @for (r of reasons; track r) {
                  <option [value]="r">{{ r }}</option>
                }
              </select>
              <input [(ngModel)]="e.indication" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Indicación / remitido a" />
              <input type="date" [(ngModel)]="e.date" (ngModelChange)="touch()" [readonly]="disabled()" aria-label="Fecha" />
              <button type="button" class="po-status" [style.background]="statusColor(e.status)" [disabled]="disabled()" (click)="cycleStatus(e)">{{ e.status }}</button>
              @if (!disabled()) {
                <button type="button" class="po-del" (click)="removeExtraction(e)" aria-label="Quitar extracción">×</button>
              }
            </div>
          } @empty {
            <p class="po-note">Sin extracciones planificadas.</p>
          }
        </div>
        @if (!disabled()) {
          <div class="po-actions">
            <button type="button" class="po-link" (click)="addExtraction('')">+ Agregar pieza</button>
            @if (extractionText() && data().orthodontics.extractions.trim() !== extractionText()) {
              <button type="button" class="po-btn" (click)="applyExtractionText()">Registrar «{{ extractionText() }}» en Extracciones indicadas</button>
            }
            @if (unmarkedInOdontogram().length) {
              <button type="button" class="po-btn" (click)="markOdontogram()">Marcar {{ unmarkedInOdontogram().length }} como extracción indicada en el odontograma</button>
            }
          </div>
        }
      }
    </div>
  `,
  styles: `
    .po { display: grid; gap: 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
    .po-tabs { display: flex; gap: 4px; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
    .po-tabs button { border: 0; background: none; padding: 8px 12px; font-size: 13px; color: #475569; border-bottom: 2px solid transparent; cursor: pointer; }
    .po-tabs button.on { color: #123b60; border-bottom-color: #12609a; font-weight: 600; }
    .po-n { background: #e2e8f0; color: #334155; border-radius: 99px; padding: 0 7px; font-size: 11px; margin-left: 4px; }
    .po-plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; }
    .po-plan { display: grid; gap: 6px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 14px; background: #f8fafc; }
    .po-plan.sel { border: 2px solid #16a34a; background: #f0fdf4; }
    .po-plan header { display: flex; gap: 8px; align-items: center; }
    .po-badge { background: #123b60; color: #fff; border-radius: 8px; padding: 2px 10px; font-weight: 700; font-size: 13px; }
    .po-chosen { font-size: 11px; color: #166534; font-weight: 600; }
    .po-plan header .po-del { margin-left: auto; }
    .po-plan label { display: grid; gap: 2px; font-size: 11px; color: #475569; }
    .po-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .po-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .po-choose { border: 0; background: #16a34a; color: #fff; border-radius: 99px; padding: 4px 14px; font-size: 12px; cursor: pointer; }
    .po-btn { border: 1px solid #12609a; background: #f4f8fb; color: #12609a; border-radius: 99px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
    .po-link { justify-self: start; border: 0; background: none; padding: 0; color: #12609a; text-decoration: underline; font-size: 12px; cursor: pointer; }
    .po-note { margin: 0; font-size: 11px; color: #64748b; }
    .po-del { border: 0; background: none; color: #94a3b8; font-size: 18px; cursor: pointer; }
    .po-del:hover { color: #dc2626; }
    .po-quick { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-size: 12px; color: #475569; }
    .po-quick button { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 3px 9px; font-size: 12px; font-weight: 600; cursor: pointer; }
    .po-quick button.on { background: #dc2626; border-color: #dc2626; color: #fff; }
    .po-list { display: grid; gap: 4px; }
    .po-row { display: grid; grid-template-columns: 70px 170px 1fr 140px 100px 24px; gap: 6px; align-items: center; font-size: 12px; }
    .po-row input, .po-row select { width: 100%; min-width: 0; }
    .po-tooth { font-weight: 700; text-align: center; }
    .po-status { border: 0; color: #fff; border-radius: 99px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
    @media (max-width: 760px) { .po-row { grid-template-columns: 60px 1fr 1fr; } .po-grid { grid-template-columns: 1fr; } }
  `,
})
export class OrthoPlanOptions {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly professionalName = input('');
  readonly applianceOptions = input<string[]>([]);
  readonly changed = output<void>();

  readonly tab = signal<Tab>('plans');
  readonly reasons = EXTRACTION_REASONS;
  readonly commonTeeth = COMMON_EXTRACTIONS;

  appliances() {
    return this.applianceOptions();
  }

  nextLabel() {
    const used = new Set(this.data().orthoDx.plans.map((p) => p.label));
    return ['A', 'B', 'C', 'D', 'E'].find((l) => !used.has(l)) ?? 'X';
  }

  activeExtractions() {
    return this.data().orthoDx.extractions.filter((e) => e.status !== 'Cancelada').length;
  }

  statusColor(s: string) {
    return STATUS_COLOR[s] ?? '#64748b';
  }

  hasExtraction(t: string) {
    return this.data().orthoDx.extractions.some((e) => e.tooth === t && e.status !== 'Cancelada');
  }

  extractionText() {
    return this.data()
      .orthoDx.extractions.filter((e) => e.tooth && e.status !== 'Cancelada')
      .map((e) => e.tooth)
      .sort((a, b) => Number(a) - Number(b))
      .join(', ');
  }

  unmarkedInOdontogram() {
    const odo = this.data().odontogram;
    return this.data().orthoDx.extractions.filter(
      (e) => /^\d{2}$/.test(e.tooth) && (e.status === 'Propuesta' || e.status === 'Aceptada') && !odo[e.tooth]?.conditions?.includes('EXTRACCION_INDICADA'),
    );
  }

  touch() {
    this.changed.emit();
  }

  addPlan() {
    this.data().orthoDx.plans.push({
      id: newDxId('pl'),
      label: this.nextLabel(),
      description: '',
      advantages: '',
      considerations: '',
      extractions: '',
      appliance: '',
      duration: '',
      notes: '',
    });
    this.touch();
  }

  removePlan(p: OrthoPlanOption) {
    if (!confirm(`¿Quitar el Plan ${p.label}?`)) return;
    const dx = this.data().orthoDx;
    dx.plans = dx.plans.filter((x) => x.id !== p.id);
    if (dx.selectedPlan === p.id) this.clearChoice();
    this.touch();
  }

  choose(p: OrthoPlanOption) {
    const dx = this.data().orthoDx;
    dx.selectedPlan = p.id;
    dx.selectedAt = new Date().toISOString().slice(0, 10);
    dx.selectedBy = this.professionalName();
    this.touch();
  }

  unchoose() {
    this.clearChoice();
    this.touch();
  }

  private clearChoice() {
    const dx = this.data().orthoDx;
    dx.selectedPlan = '';
    dx.selectedAt = '';
    dx.selectedBy = '';
  }

  copyToPlanning(p: OrthoPlanOption) {
    const o = this.data().orthodontics;
    const filled = [o.extractions, o.estimatedDuration].some((v) => v.trim());
    if (filled && !confirm('Se reemplazarán «Extracciones indicadas» y «Duración estimada» con los datos del plan elegido. ¿Continuar?')) return;
    if (p.extractions) o.extractions = p.extractions;
    if (p.duration) o.estimatedDuration = p.duration;
    if (p.appliance && this.applianceOptions().includes(p.appliance)) o.appliance = p.appliance;
    this.touch();
  }

  addExtraction(tooth: string) {
    this.data().orthoDx.extractions.push({ id: newDxId('ex'), tooth, reason: '', indication: '', date: '', status: 'Propuesta' });
    this.touch();
  }

  toggleQuick(t: string) {
    const list = this.data().orthoDx.extractions;
    const row = list.find((e) => e.tooth === t && e.status !== 'Cancelada');
    if (!row) {
      this.addExtraction(t);
      return;
    }
    if (row.status === 'Propuesta' && !row.reason && !row.indication && !row.date) {
      list.splice(list.indexOf(row), 1);
      this.touch();
    }
  }

  cycleStatus(e: OrthoExtraction) {
    const i = EXTRACTION_STATUSES.indexOf(e.status);
    e.status = EXTRACTION_STATUSES[(i + 1) % EXTRACTION_STATUSES.length];
    this.touch();
  }

  removeExtraction(e: OrthoExtraction) {
    if (e.status === 'Realizada') {
      alert('Una extracción realizada no se quita: cámbiela a «Cancelada» solo si fue un error de registro.');
      return;
    }
    if (!confirm(`¿Quitar la pieza ${e.tooth || ''} del plan de extracciones?`)) return;
    const list = this.data().orthoDx.extractions;
    list.splice(list.indexOf(e), 1);
    this.touch();
  }

  applyExtractionText() {
    this.data().orthodontics.extractions = this.extractionText();
    this.touch();
  }

  markOdontogram() {
    const odo = this.data().odontogram;
    for (const e of this.unmarkedInOdontogram()) {
      const rec = (odo[e.tooth] ??= {});
      if (rec.conditions?.includes('AUSENTE')) continue;
      rec.conditions = [...(rec.conditions ?? []), 'EXTRACCION_INDICADA' as ToothCondition];
    }
    this.touch();
  }
}
