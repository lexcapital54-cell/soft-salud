import { DentistryContent, MEDICAL_CONDITIONS, hasOrthodonticData } from './dentistry.models';

export type ModuleState = 'done' | 'partial' | 'empty' | 'optional';

export interface ModuleStatus {
  state: ModuleState;
  hint: string;
}

export interface CompletenessContext {
  patient: { firstName?: string | null; lastName?: string | null; documentNumber?: string | null; birthDate?: string | null };
  motive: string;
  evolutions: number;
  consents: Array<{ granted?: boolean }>;
  attachments: number;
}

const filled = (v: unknown) => typeof v === 'string' ? !!v.trim() : !!v;

const ratio = (done: number, total: number, what: string): ModuleStatus =>
  !done
    ? { state: 'empty', hint: `Sin ${what}` }
    : done >= total
      ? { state: 'done', hint: 'Completo' }
      : { state: 'partial', hint: `${done} de ${total} ${what}` };

/** Estado de cada módulo del menú de la historia odontológica (solo orientativo, no bloquea la firma). */
export function dentalModuleStatus(id: string, d: DentistryContent, ctx: CompletenessContext): ModuleStatus | null {
  switch (id) {
    case 'odo-identificacion': {
      const p = ctx.patient;
      const n = [p.firstName, p.lastName, p.documentNumber, p.birthDate].filter(filled).length;
      return ratio(n, 4, 'datos básicos (nombre, apellido, documento, nacimiento)');
    }
    case 'odo-motivo':
      return ratio([ctx.motive, d.currentIllness].filter(filled).length, 2, 'campos (motivo y enfermedad actual)');
    case 'hce-section-3': {
      const answered = MEDICAL_CONDITIONS.filter((c) => d.medicalConditions[c.key] || !!d.medicalConditionAnswers[c.key]).length;
      const allergies = Object.values(d.allergies).some(Boolean) || d.allergyRows.some((r) => filled(r.allergen));
      const meds = d.medications.none || d.medications.rows.some((r) => filled(r.name)) || Object.values(d.medications.groups).some(Boolean);
      const parts = [answered === MEDICAL_CONDITIONS.length, allergies, meds];
      const n = parts.filter(Boolean).length;
      if (!n && !answered) return { state: 'empty', hint: 'Sin antecedentes registrados' };
      if (n === 3) return { state: 'done', hint: 'Condiciones, alergias y medicamentos respondidos' };
      const missing = [
        answered < MEDICAL_CONDITIONS.length ? `${MEDICAL_CONDITIONS.length - answered} condiciones sin responder` : '',
        allergies ? '' : 'alergias',
        meds ? '' : 'medicamentos',
      ].filter(Boolean);
      return { state: 'partial', hint: `Falta: ${missing.join(', ')}` };
    }
    case 'odo-examen': {
      const values = [...Object.values(d.extraoral), ...Object.values(d.intraoral)];
      const n = values.filter(filled).length;
      if (!n) return { state: 'empty', hint: 'Sin examen registrado' };
      return n / values.length >= 0.6
        ? { state: 'done', hint: `${n} de ${values.length} hallazgos registrados` }
        : { state: 'partial', hint: `${n} de ${values.length} hallazgos registrados` };
    }
    case 'odontograma': {
      const n = Object.values(d.odontogram).filter((t) => t?.conditions?.length || Object.keys(t?.surfaces || {}).length || t?.marks?.length || filled(t?.note)).length;
      return n ? { state: 'done', hint: `${n} piezas con hallazgos` } : { state: 'empty', hint: 'Sin hallazgos en el odontograma' };
    }
    case 'odo-ortodoncia':
      if (filled(d.orthodontics.diagnosis)) return { state: 'done', hint: 'Con diagnóstico ortodóntico' };
      return hasOrthodonticData(d) ? { state: 'partial', hint: 'Falta el diagnóstico ortodóntico' } : { state: 'empty', hint: 'Sin evaluación ortodóntica' };
    case 'odo-imagenes': {
      const n = Object.values(d.photos).filter((p) => p?.attachmentId).length + d.imaging.filter((i) => i.attachmentId).length;
      return n ? { state: 'done', hint: `${n} imágenes` } : { state: 'optional', hint: 'Sin fotos ni radiografías' };
    }
    case 'odo-diagnosticos':
      return d.diagnoses.some((x) => filled(x.cieCode))
        ? { state: 'done', hint: 'Con diagnóstico CIE-10' }
        : { state: 'empty', hint: 'Sin diagnóstico CIE-10' };
    case 'odo-plan': {
      const rows = d.treatmentPlan.filter((r) => filled(r.description));
      if (!rows.length) return { state: 'empty', hint: 'Sin procedimientos en el plan' };
      const complete = rows.filter((r) => filled(r.value) && r.phase).length;
      return complete === rows.length
        ? { state: 'done', hint: `${rows.length} procedimiento(s) con fase y valor` }
        : { state: 'partial', hint: `${rows.length - complete} procedimiento(s) sin fase o sin valor` };
    }
    case 'odo-evoluciones-en-formulario':
      return ctx.evolutions ? { state: 'done', hint: `${ctx.evolutions} evoluciones` } : { state: 'optional', hint: 'Sin evoluciones aún' };
    case 'consent-section': {
      const total = ctx.consents.length;
      const n = ctx.consents.filter((c) => c.granted).length;
      return total ? ratio(n, total, 'consentimientos otorgados') : null;
    }
    case 'odo-prescripciones':
      return d.prescriptions.length || d.orders.length
        ? { state: 'done', hint: `${d.prescriptions.length} fórmulas, ${d.orders.length} órdenes` }
        : { state: 'optional', hint: 'Opcional' };
    case 'anexos-section':
      return ctx.attachments ? { state: 'done', hint: `${ctx.attachments} anexos` } : { state: 'optional', hint: 'Opcional' };
    case 'odo-cierre':
      return filled(d.closure.closedAt) ? { state: 'done', hint: 'Caso cerrado' } : { state: 'optional', hint: 'Caso abierto' };
    default:
      return null;
  }
}

const DOT: Record<ModuleState, string> = {
  done: '#16a34a',
  partial: '#f59e0b',
  empty: '#dc2626',
  optional: '#cbd5e1',
};

export function moduleDotStyle(state: ModuleState) {
  return `display:inline-block;width:8px;height:8px;border-radius:50%;margin-left:6px;vertical-align:middle;background:${DOT[state]}`;
}
