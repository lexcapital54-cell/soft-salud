import { CompletenessContext, ModuleStatus } from '../dentistry/dental-completeness';
import { AES_CONDITIONS, AES_HABITS, AES_SYSTEMS, AestheticContent, EXAM_FIELDS } from './aesthetic.models';
import { AesTrackingData } from './aesthetic-tracking.models';

/** Módulos de la historia de medicina estética (menú superior), en el orden en que aparecen en pantalla. */
export const AES_MODULES = [
  { id: 'odo-identificacion', label: 'Identificación' },
  { id: 'aes-consulta', label: 'Motivo de consulta' },
  { id: 'aes-antecedentes', label: 'Antecedentes' },
  { id: 'aes-esteticos', label: 'Antecedentes estéticos' },
  { id: 'aes-medicacion', label: 'Medicación' },
  { id: 'aes-habitos', label: 'Hábitos' },
  { id: 'aes-sistemas', label: 'Revisión por sistemas' },
  { id: 'aes-examen', label: 'Examen físico' },
  { id: 'aes-valoracion', label: 'Valoración estética' },
  { id: 'aes-diagnostico', label: 'Diagnóstico' },
  { id: 'aes-plan', label: 'Plan de manejo' },
  { id: 'aes-mapa', label: 'Mapa facial' },
  { id: 'aes-procedimientos', label: 'Procedimientos' },
  { id: 'aes-fotos', label: 'Fotos' },
  { id: 'cie-section', label: 'CIE-10' },
  { id: 'consent-section', label: 'Consentimientos' },
  { id: 'anexos-section', label: 'Anexos' },
];

export interface AesNavContext extends CompletenessContext {
  diagnoses: number;
  encounterId: string;
}

const filled = (v: unknown) => (typeof v === 'string' ? !!v.trim() : !!v);

const ratio = (done: number, total: number, what: string): ModuleStatus =>
  !done
    ? { state: 'empty', hint: `Sin ${what}` }
    : done >= total
      ? { state: 'done', hint: 'Completo' }
      : { state: 'partial', hint: `${done} de ${total} ${what}` };

/** Basta con registrar la mitad de los campos del examen para darlo por diligenciado. */
const EXAM_ENOUGH = Math.ceil(EXAM_FIELDS.length / 2);

/** Estado de cada módulo del menú de estética (solo orientativo, no bloquea la firma). */
export function aestheticModuleStatus(
  id: string,
  a: AestheticContent,
  tracking: AesTrackingData,
  ctx: AesNavContext,
): ModuleStatus | null {
  switch (id) {
    case 'odo-identificacion': {
      const p = ctx.patient;
      return ratio([p.firstName, p.lastName, p.documentNumber, p.birthDate].filter(filled).length, 4, 'datos básicos (nombre, apellido, documento, nacimiento)');
    }
    case 'aes-consulta':
      return ratio([ctx.motive || a.consult.concerns, a.consult.zones.length, a.consult.goals].filter(filled).length, 3, 'datos (motivo, zonas, objetivos)');
    case 'aes-antecedentes': {
      const n = AES_CONDITIONS.filter((c) => filled(a.history[c.key]?.answer)).length;
      return ratio(n, AES_CONDITIONS.length, 'antecedentes investigados');
    }
    case 'aes-esteticos':
      return a.previousTreatmentsAnswer || a.previousTreatments.length
        ? { state: 'done', hint: a.previousTreatments.length ? `${a.previousTreatments.length} tratamiento(s) previo(s)` : 'Registrado' }
        : { state: 'empty', hint: 'Sin indagar tratamientos estéticos previos' };
    case 'aes-medicacion':
      return a.medicationsAnswer || a.medications.length
        ? { state: 'done', hint: a.medications.length ? `${a.medications.length} medicamento(s)` : 'Registrado' }
        : { state: 'empty', hint: 'Sin indagar medicación actual' };
    case 'aes-habitos': {
      const n = AES_HABITS.filter((h) => filled(a.habits[h.key])).length;
      return n ? ratio(n, AES_HABITS.length, 'hábitos') : { state: 'optional', hint: 'Opcional' };
    }
    case 'aes-sistemas': {
      const n = AES_SYSTEMS.filter((s) => filled(a.systems[s.key]?.status)).length;
      return ratio(n, AES_SYSTEMS.length, 'sistemas revisados');
    }
    case 'aes-examen': {
      const n = EXAM_FIELDS.filter((f) => filled(a.exam[f.key])).length;
      return ratio(Math.min(n, EXAM_ENOUGH), EXAM_ENOUGH, 'hallazgos del examen');
    }
    case 'aes-valoracion':
      return ratio([a.assessment.fitzpatrick, a.assessment.skinType, a.assessment.glogau].filter(filled).length, 3, 'datos (Fitzpatrick, tipo de piel, Glogau)');
    case 'aes-diagnostico':
      return ratio([a.diagnosis.findings, a.diagnosis.contraindications].filter(filled).length, 2, 'datos (hallazgos, contraindicaciones)');
    case 'aes-plan':
      return ratio([a.plan.procedures, a.plan.objectives, a.plan.risks].filter(filled).length, 3, 'datos (procedimientos, objetivos, riesgos)');
    case 'aes-mapa':
      return tracking.annotations.length
        ? { state: 'done', hint: `${tracking.annotations.length} marca(s) en el mapa` }
        : { state: 'optional', hint: 'Opcional' };
    case 'aes-procedimientos': {
      const own = tracking.procedures.filter((p) => p.encounterId === ctx.encounterId);
      if (!own.length) return { state: 'optional', hint: 'Sin procedimientos en esta atención' };
      const signed = own.filter((p) => p.status === 'FIRMADO').length;
      return signed === own.length
        ? { state: 'done', hint: `${signed} procedimiento(s) firmado(s)` }
        : { state: 'partial', hint: `${own.length - signed} procedimiento(s) sin firmar` };
    }
    case 'aes-fotos': {
      const n = tracking.photos.filter((f) => f.encounterId === ctx.encounterId).length;
      return { state: 'optional', hint: n ? `${n} foto(s) en esta atención` : 'Opcional' };
    }
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
