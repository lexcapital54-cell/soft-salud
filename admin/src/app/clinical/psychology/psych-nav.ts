import { ClinicalContent, PsychologyContent } from '../clinical.models';
import { CompletenessContext, ModuleStatus } from '../dentistry/dental-completeness';

export interface PsychModule {
  id: string;
  label: string;
}

export interface PsychNavFlags {
  soap: boolean;
  /** Historia sellada: arriba quedan las notas de evolución / control. */
  locked: boolean;
}

/** Módulos de la historia de psicología (menú superior), en el orden en que aparecen en pantalla. */
export function psychModuleList(flags: PsychNavFlags): PsychModule[] {
  return [
    ...(flags.locked ? [{ id: 'evoluciones-section', label: 'Evolución' }] : []),
    { id: 'odo-identificacion', label: 'Identificación' },
    { id: 'ft-atencion', label: 'Datos de la atención' },
    { id: 'hce-section-3', label: flags.soap ? 'Nota SOAP' : 'Motivo y antecedentes' },
    ...(flags.soap
      ? []
      : [
          { id: 'ps-examen-mental', label: 'Examen mental' },
          { id: 'ps-impresion', label: 'Impresión diagnóstica' },
        ]),
    { id: 'ps-plan', label: 'Plan terapéutico' },
    { id: 'ps-plan-valores', label: 'Plan y valores' },
    { id: 'cie-section', label: 'CIE-10' },
    { id: 'cups-section', label: 'Procedimientos' },
    ...(flags.soap ? [] : [{ id: 'ps-rda', label: 'RDA' }]),
    { id: 'consent-section', label: 'Consentimientos' },
    { id: 'anexos-section', label: 'Anexos' },
  ];
}

export interface PsychNavContext extends CompletenessContext {
  diagnoses: number;
  soap: boolean;
}

const filled = (v: unknown) => (typeof v === 'string' ? !!v.trim() : !!v);

const ratio = (done: number, total: number, what: string): ModuleStatus =>
  !done ? { state: 'empty', hint: `Sin ${what}` } : done >= total ? { state: 'done', hint: 'Completo' } : { state: 'partial', hint: `${done} de ${total} ${what}` };

/** Estado de cada módulo del menú de psicología (solo orientativo, no bloquea la firma). */
export function psychModuleStatus(
  id: string,
  content: ClinicalContent,
  psych: PsychologyContent,
  managementPlan: string,
  ctx: PsychNavContext,
): ModuleStatus | null {
  switch (id) {
    case 'odo-identificacion': {
      const p = ctx.patient;
      return ratio([p.firstName, p.lastName, p.documentNumber, p.birthDate].filter(filled).length, 4, 'datos básicos (nombre, apellido, documento, nacimiento)');
    }
    case 'hce-section-3': {
      if (ctx.soap) {
        const s = content.soap;
        return ratio([s?.subjective, s?.objective, s?.assessment, s?.plan].filter(filled).length, 4, 'campos SOAP');
      }
      const care = content.careMinimum;
      return ratio([ctx.motive, care?.presentIllness, care?.systemsReview].filter(filled).length, 3, 'datos (motivo, enfermedad actual, historia psicosocial)');
    }
    case 'ps-examen-mental':
      return filled(content.mentalExam?.narrative) ? { state: 'done', hint: 'Registrado' } : { state: 'empty', hint: 'Sin examen mental' };
    case 'ps-impresion':
      return filled(content.assessment?.impressionNarrative) ? { state: 'done', hint: 'Registrada' } : { state: 'empty', hint: 'Sin impresión diagnóstica' };
    case 'ps-plan':
      return ratio([psych.therapeuticObjectives, managementPlan, psych.sessionCount].filter(filled).length, 3, 'datos (objetivos, plan de manejo, sesiones)');
    case 'ps-plan-valores':
      return psych.treatmentPlan?.length
        ? { state: 'done', hint: `${psych.treatmentPlan.length} procedimiento(s) con valor` }
        : { state: 'optional', hint: 'Opcional: procedimientos con valor para cobrar en Caja' };
    case 'evoluciones-section':
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
