import { PhysiotherapyContent } from '../clinical.models';
import { CompletenessContext, ModuleStatus } from '../dentistry/dental-completeness';

/** Módulos de la historia de fisioterapia (menú superior), en el orden en que aparecen en pantalla. */
export const PHYSIO_MODULES = [
  { id: 'odo-identificacion', label: 'Identificación' },
  { id: 'ft-atencion', label: 'Datos de la atención' },
  { id: 'hce-section-3', label: 'Motivo y antecedentes' },
  { id: 'ft-zonas', label: 'Zonas a tratar' },
  { id: 'ft-evaluacion', label: 'Evaluación' },
  { id: 'ft-valoracion-funcional', label: 'Valoración funcional' },
  { id: 'ft-diagnostico', label: 'Diagnóstico' },
  { id: 'ft-terapias', label: 'Terapias' },
  { id: 'ft-plan', label: 'Plan terapéutico' },
  { id: 'ft-plan-valores', label: 'Plan y valores' },
  { id: 'ft-cierre', label: 'Cierre del caso' },
  { id: 'ft-evoluciones-en-formulario', label: 'Evolución' },
  { id: 'cie-section', label: 'CIE-10' },
  { id: 'cups-section', label: 'Procedimientos' },
  { id: 'consent-section', label: 'Consentimientos' },
  { id: 'anexos-section', label: 'Anexos' },
];

export interface PhysioNavContext extends CompletenessContext {
  diagnoses: number;
}

const filled = (v: unknown) => (typeof v === 'string' ? !!v.trim() : !!v);

const ratio = (done: number, total: number, what: string): ModuleStatus =>
  !done ? { state: 'empty', hint: `Sin ${what}` } : done >= total ? { state: 'done', hint: 'Completo' } : { state: 'partial', hint: `${done} de ${total} ${what}` };

const FUNCTIONS = ['pain', 'jointMobility', 'muscleStrength', 'muscleTone', 'sensitivity', 'coordination', 'balance', 'gait', 'cardiorespiratory'];
const FUNCTIONS_ENOUGH = 4;

/** Estado de cada módulo del menú de fisioterapia (solo orientativo, no bloquea la firma). */
export function physioModuleStatus(id: string, ft: PhysiotherapyContent, presentIllness: string, ctx: PhysioNavContext): ModuleStatus | null {
  switch (id) {
    case 'odo-identificacion': {
      const p = ctx.patient;
      return ratio([p.firstName, p.lastName, p.documentNumber, p.birthDate].filter(filled).length, 4, 'datos básicos (nombre, apellido, documento, nacimiento)');
    }
    case 'hce-section-3': {
      const checks = Object.values(ft.intake?.antecedents ?? {}).some((g) => Object.values(g).some(filled));
      const antecedents = checks || Object.values(ft.antecedentsDetail ?? {}).some(filled);
      return ratio([ctx.motive, presentIllness, antecedents].filter(filled).length, 3, 'datos (motivo, enfermedad actual, antecedentes)');
    }
    case 'ft-zonas': {
      const n = ft.intake?.zones?.length ?? 0;
      return n ? { state: 'done', hint: `${n} zona(s) marcada(s)` } : { state: 'empty', hint: 'Sin zonas marcadas en el mapa corporal' };
    }
    case 'ft-terapias': {
      const n = (ft.intake?.therapies?.length ?? 0) + (ft.intake?.therapiesOther?.trim() ? 1 : 0);
      return n ? { state: 'done', hint: `${n} terapia(s)` } : { state: 'empty', hint: 'Sin terapias seleccionadas' };
    }
    case 'ft-evaluacion':
      return ratio([ft.physioDiagnosis, ft.findings].filter(filled).length, 2, 'datos (diagnóstico fisioterapéutico, hallazgos)');
    case 'ft-valoracion-funcional': {
      const quick = [ft.intake?.posture, ft.intake?.rangeOfMotion].filter(filled).length;
      const n = FUNCTIONS.filter((k) => filled(ft.functionalAssessment?.[k])).length + quick;
      return ratio(Math.min(n, FUNCTIONS_ENOUGH), FUNCTIONS_ENOUGH, 'funciones valoradas');
    }
    case 'ft-diagnostico':
      return filled(ft.physioDxCode) ? { state: 'done', hint: 'Codificado' } : { state: 'empty', hint: 'Sin código diagnóstico' };
    case 'ft-plan':
      return ratio([ft.treatmentObjectives, ft.interventionPlan, ft.sessionCount].filter(filled).length, 3, 'datos (objetivos, intervención, sesiones)');
    case 'ft-plan-valores':
      return ft.treatmentPlan?.length
        ? { state: 'done', hint: `${ft.treatmentPlan.length} procedimiento(s) con valor` }
        : { state: 'optional', hint: 'Opcional: procedimientos con valor para cobrar en Caja' };
    case 'ft-evoluciones-en-formulario':
      return ctx.evolutions ? { state: 'done', hint: `${ctx.evolutions} control(es)` } : { state: 'optional', hint: 'Sin controles aún' };
    case 'cie-section':
      return ctx.diagnoses ? { state: 'done', hint: `${ctx.diagnoses} diagnóstico(s)` } : { state: 'empty', hint: 'Sin diagnóstico CIE-10' };
    case 'consent-section':
      return ctx.consents.some((c) => c.granted) ? { state: 'done', hint: 'Con consentimiento' } : { state: 'empty', hint: 'Sin consentimiento firmado' };
    case 'anexos-section':
      return { state: 'optional', hint: ctx.attachments ? `${ctx.attachments} anexo(s)` : 'Opcional' };
    default:
      return null;
  }
}
