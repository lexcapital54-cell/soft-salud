import type { EvolutionAmendKind } from './dto/clinical.dto';

/** Plazo en que el autor puede corregir su evolución con una nota de corrección. */
export const EVOLUTION_CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export const EVOLUTION_AMEND_LABELS: Record<EvolutionAmendKind, string> = {
  CORRECCION: 'Nota de corrección',
  ACLARATORIA: 'Nota aclaratoria',
  ANEXO: 'Anexo',
};

/** Referencia guardada en la nota enlazada; la evolución original nunca se modifica. */
export interface EvolutionAmendment {
  evolutionId: string;
  kind: EvolutionAmendKind;
  signedAt: string;
  verificationCode: string;
}
