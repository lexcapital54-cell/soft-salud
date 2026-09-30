import { DecimalPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { DentistryContent, MEDICAL_CONDITIONS, MEDICATION_GROUPS, allergyRowTexts, dentalAllergyList } from './dentistry.models';
import { hasPerioData, perioStats } from './periodontogram.models';
import { kennedyForArch } from './rehab.models';
import { TREATMENT_PHASES, budgetTotals } from './treatment-budget.models';

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const RISK_MEDS = ['anticoagulants', 'bisphosphonates', 'corticosteroids'];

interface Chip {
  text: string;
  tone: 'danger' | 'warn' | 'info' | 'ok';
  go?: string;
}

/** Resumen de una mirada: alertas, estado dental y periodontal, rehabilitación y avance del plan. */
@Component({
  selector: 'app-dental-patient-summary',
  imports: [DecimalPipe],
  template: `
    @let s = summary();
    @if (s.any) {
      <div class="ps">
        <div class="ps-col">
          <h5>Alertas médicas</h5>
          @for (c of s.alerts; track c.text) {
            <button type="button" class="ps-chip" [attr.data-tone]="c.tone" (click)="c.go && goto.emit(c.go)">{{ c.text }}</button>
          } @empty {
            <span class="ps-none">Sin alertas registradas</span>
          }
        </div>
        <div class="ps-col">
          <h5>Estado dental</h5>
          @for (c of s.dental; track c.text) {
            <button type="button" class="ps-chip" [attr.data-tone]="c.tone" (click)="goto.emit('odontograma')">{{ c.text }}</button>
          } @empty {
            <span class="ps-none">Odontograma sin hallazgos</span>
          }
          @if (s.perio) {
            <button type="button" class="ps-chip" [attr.data-tone]="s.perio.tone" (click)="goto.emit('odo-examen')">{{ s.perio.text }}</button>
          }
          @for (k of s.kennedy; track k) {
            <button type="button" class="ps-chip" data-tone="info" (click)="goto.emit('odontograma')">{{ k }}</button>
          }
        </div>
        <div class="ps-col">
          <h5>Plan de tratamiento</h5>
          @if (s.plan.count) {
            <div class="ps-progress" [title]="s.plan.done + ' de ' + s.plan.count + ' procedimientos terminados'">
              <span [style.width.%]="(s.plan.done / s.plan.count) * 100"></span>
            </div>
            <p class="ps-line">
              {{ s.plan.done }}/{{ s.plan.count }} terminados
              @if (s.plan.total) {
                · Total {{ '$' }}{{ s.plan.total | number: '1.0-0' }}
              }
              @if (s.plan.accepted) {
                · <b class="ps-ok">aceptado</b>
              }
            </p>
            @if (s.plan.next.length) {
              <p class="ps-line">
                Próximo:
                @for (n of s.plan.next; track $index; let last = $last) {
                  <button type="button" class="ps-link" (click)="goto.emit('odo-plan')">{{ n }}</button>{{ last ? '' : ' · ' }}
                }
              </p>
            }
          } @else {
            <span class="ps-none">Sin plan registrado</span>
          }
          @if (lastVisit()) {
            <p class="ps-line ps-muted">Última evolución: {{ lastVisit() }}</p>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .ps { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; padding: 12px; border: 1px solid #dbe4ee; border-radius: 12px; background: #f4f8fb; }
    .ps-col { display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; }
    .ps h5 { width: 100%; margin: 0 0 2px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #123b60; }
    .ps-chip { border: 1px solid; border-radius: 99px; padding: 3px 10px; font-size: 12px; cursor: pointer; background: #fff; }
    .ps-chip[data-tone='danger'] { border-color: #fca5a5; background: #fef2f2; color: #991b1b; font-weight: 600; }
    .ps-chip[data-tone='warn'] { border-color: #fcd34d; background: #fffbeb; color: #92400e; }
    .ps-chip[data-tone='info'] { border-color: #bfdbfe; background: #eff6ff; color: #1e3a8a; }
    .ps-chip[data-tone='ok'] { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
    .ps-none { font-size: 12px; color: #64748b; }
    .ps-progress { width: 100%; height: 8px; border-radius: 99px; background: #e2e8f0; overflow: hidden; }
    .ps-progress span { display: block; height: 100%; background: #12609a; }
    .ps-line { width: 100%; margin: 0; font-size: 12px; color: #334155; }
    .ps-muted { color: #64748b; }
    .ps-ok { color: #166534; }
    .ps-link { border: 0; background: none; padding: 0; color: #12609a; text-decoration: underline; cursor: pointer; font-size: 12px; }
  `,
})
export class DentalPatientSummary {
  readonly data = input.required<DentistryContent>();
  readonly lastVisit = input('');
  readonly goto = output<string>();

  summary() {
    const d = this.data();
    const alerts: Chip[] = [];
    const severeTexts = new Set(allergyRowTexts({ ...d, allergyRows: d.allergyRows.filter((r) => r.severity === 'SEVERA') }));
    const allergyTexts = dentalAllergyList(d).filter((t) => t !== 'No refiere alergias' && !/^(desconoce|no sabe)/i.test(t));
    for (const a of allergyTexts) alerts.push({ text: `Alergia: ${a}`, tone: severeTexts.has(a) ? 'danger' : 'warn', go: 'hce-section-3' });
    for (const c of MEDICAL_CONDITIONS) {
      if (d.medicalConditions[c.key]) {
        alerts.push({ text: c.label, tone: 'warn', go: 'hce-section-3' });
      }
    }
    for (const g of MEDICATION_GROUPS) {
      if (RISK_MEDS.includes(g.key) && d.medications.groups[g.key]) alerts.push({ text: g.label, tone: 'danger', go: 'hce-section-3' });
    }
    if (d.dentalHistory.anesthesiaReaction === 'SI') alerts.push({ text: 'Reacción previa a anestesia', tone: 'danger', go: 'hce-section-3' });

    const counts = { missing: 0, caries: 0, restored: 0, endo: 0, crown: 0, implant: 0, extract: 0 };
    const absent = new Set<string>();
    for (const [tooth, rec] of Object.entries(d.odontogram)) {
      const c = (rec?.conditions as string[] | undefined) || [];
      if (c.includes('AUSENTE')) {
        counts.missing++;
        absent.add(tooth);
      }
      if (c.includes('IMPLANTE')) counts.implant++;
      if (c.includes('ENDODONCIA')) counts.endo++;
      if (c.includes('CORONA')) counts.crown++;
      if (c.includes('EXTRACCION_INDICADA')) counts.extract++;
      const surf = Object.values(rec?.surfaces || {});
      if (surf.includes('CARIES')) counts.caries++;
      if (surf.includes('RESTAURACION')) counts.restored++;
    }
    const dental: Chip[] = [];
    const add = (n: number, one: string, many: string, tone: Chip['tone']) => n && dental.push({ text: `${n} ${n === 1 ? one : many}`, tone });
    add(counts.caries, 'pieza con caries', 'piezas con caries', 'danger');
    add(counts.extract, 'extracción indicada', 'extracciones indicadas', 'danger');
    add(counts.missing, 'ausente', 'ausentes', 'info');
    add(counts.restored, 'restaurada', 'restauradas', 'ok');
    add(counts.endo, 'endodoncia', 'endodoncias', 'info');
    add(counts.crown, 'corona', 'coronas', 'info');
    add(counts.implant, 'implante', 'implantes', 'info');

    let perio: Chip | null = null;
    if (hasPerioData(d.periodontogram)) {
      const st = perioStats(d.periodontogram, absent);
      const parts = [
        st.bopPct !== null ? `sangrado ${st.bopPct} %` : '',
        st.meanPd !== null ? `PS media ${st.meanPd} mm` : '',
        st.sites6 ? `${st.sites6} sitios ≥6 mm` : st.sites4 ? `${st.sites4} sitios ≥4 mm` : '',
      ].filter(Boolean);
      const tone: Chip['tone'] = st.sites6 || (st.bopPct ?? 0) >= 30 ? 'danger' : st.sites4 || (st.bopPct ?? 0) >= 10 ? 'warn' : 'ok';
      perio = { text: `Periodonto: ${parts.join(' · ') || 'registrado'}`, tone };
    }

    const kennedy: string[] = [];
    for (const [arch, teeth, name] of [
      ['upper', UPPER, 'Superior'],
      ['lower', LOWER, 'Inferior'],
    ] as const) {
      const missing = new Set<number>();
      const present = new Set<number>();
      for (const t of teeth) {
        const c = (d.odontogram[String(t)]?.conditions as string[] | undefined) || [];
        const gone = (c.includes('AUSENTE') && !c.includes('PROTESIS') && !c.includes('IMPLANTE')) || c.includes('PROTESIS_REMOVIBLE');
        (gone ? missing : present).add(t);
      }
      const k = kennedyForArch(arch, missing, present);
      if (k.cls) kennedy.push(`${name}: ${k.label.replace(' de Kennedy', '').replace(/ \(.*?\)/, '')}`);
    }

    const planRows = d.treatmentPlan.filter((r) => r.description.trim() && r.status !== 'CANCELADO');
    const phaseOrder = (p: string) => {
      const i = TREATMENT_PHASES.findIndex((x) => x.key === p);
      return i < 0 ? 9 : i;
    };
    const next = planRows
      .filter((r) => r.status !== 'TERMINADO')
      .sort((a, b) => (a.status === 'EN_TRATAMIENTO' ? -1 : 0) - (b.status === 'EN_TRATAMIENTO' ? -1 : 0) || phaseOrder(a.phase) - phaseOrder(b.phase))
      .slice(0, 3)
      .map((r) => `${r.description.trim()}${r.tooth ? ` (${r.tooth})` : ''}`);
    const plan = {
      count: planRows.length,
      done: planRows.filter((r) => r.status === 'TERMINADO').length,
      total: budgetTotals(d.treatmentPlan, d.budget).total,
      accepted: !!d.budget.acceptedAt,
      next,
    };
    return {
      any: !!(alerts.length || dental.length || perio || plan.count || this.lastVisit()),
      alerts,
      dental,
      perio,
      kennedy,
      plan,
    };
  }
}
