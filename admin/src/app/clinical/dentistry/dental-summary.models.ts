import { DentistryContent, MEDICAL_CONDITIONS, MEDICATION_GROUPS, allergyRowTexts, dentalAllergyList } from './dentistry.models';
import { hasPerioData, perioStats } from './periodontogram.models';
import { kennedyForArch } from './rehab.models';
import { TREATMENT_PHASES, budgetTotals } from './treatment-budget.models';

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const RISK_MEDS = ['anticoagulants', 'bisphosphonates', 'corticosteroids'];

export interface DentalChip {
  text: string;
  tone: 'danger' | 'warn' | 'info' | 'ok';
  go?: string;
}

/** Resumen de una mirada: alertas, estado dental y periodontal, rehabilitación y avance del plan. */
export function dentalSummary(d: DentistryContent, lastVisit = '') {
        const alerts: DentalChip[] = [];
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
    const dental: DentalChip[] = [];
    const add = (n: number, one: string, many: string, tone: DentalChip['tone']) => n && dental.push({ text: `${n} ${n === 1 ? one : many}`, tone });
    add(counts.caries, 'pieza con caries', 'piezas con caries', 'danger');
    add(counts.extract, 'extracción indicada', 'extracciones indicadas', 'danger');
    add(counts.missing, 'ausente', 'ausentes', 'info');
    add(counts.restored, 'restaurada', 'restauradas', 'ok');
    add(counts.endo, 'endodoncia', 'endodoncias', 'info');
    add(counts.crown, 'corona', 'coronas', 'info');
    add(counts.implant, 'implante', 'implantes', 'info');

    let perio: DentalChip | null = null;
    if (hasPerioData(d.periodontogram)) {
      const st = perioStats(d.periodontogram, absent);
      const parts = [
        st.bopPct !== null ? `sangrado ${st.bopPct} %` : '',
        st.meanPd !== null ? `PS media ${st.meanPd} mm` : '',
        st.sites6 ? `${st.sites6} sitios ≥6 mm` : st.sites4 ? `${st.sites4} sitios ≥4 mm` : '',
      ].filter(Boolean);
      const tone: DentalChip['tone'] = st.sites6 || (st.bopPct ?? 0) >= 30 ? 'danger' : st.sites4 || (st.bopPct ?? 0) >= 10 ? 'warn' : 'ok';
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
      any: !!(alerts.length || dental.length || perio || plan.count || lastVisit),
      alerts,
      dental,
      perio,
      kennedy,
      plan,
    };
  }
