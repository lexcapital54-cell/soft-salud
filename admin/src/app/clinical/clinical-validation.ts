import { ClinicalEvolution, EvolutionAmendKind } from './clinical.models';

/** Plazo en que el autor puede agregar una nota de corrección a su evolución. */
export const EVOLUTION_CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export const EVOLUTION_AMEND_OPTIONS: Array<{ kind: EvolutionAmendKind; label: string; hint: string }> = [
  { kind: 'CORRECCION', label: 'Nota de corrección', hint: 'Solo el autor, dentro de las 24 horas siguientes a la firma.' },
  { kind: 'ACLARATORIA', label: 'Nota aclaratoria', hint: 'Aclara o complementa el registro original.' },
  { kind: 'ANEXO', label: 'Anexo', hint: 'Adjunta archivos (resultados, fotos, documentos) al registro.' },
];

export function amendKindLabel(kind: EvolutionAmendKind | undefined) {
  return EVOLUTION_AMEND_OPTIONS.find((o) => o.kind === kind)?.label ?? 'Nota';
}

export interface EvolutionLockState {
  /** Pasaron más de 24 horas desde la firma: registro cerrado por normativa. */
  closed: boolean;
  /** Horas que le quedan al autor para registrar una corrección. */
  hoursLeft: number;
  /** El usuario actual puede registrar una nota de corrección. */
  canCorrect: boolean;
  kinds: EvolutionAmendKind[];
}

/**
 * La evolución firmada nunca se edita. Durante las primeras 24 horas su autor puede
 * agregar una nota de corrección; después solo se admiten notas aclaratorias y anexos.
 */
export function evolutionLockState(ev: ClinicalEvolution, userId: string | null | undefined, now = Date.now()): EvolutionLockState {
  const elapsed = now - new Date(ev.signedAt).getTime();
  const closed = elapsed > EVOLUTION_CORRECTION_WINDOW_MS;
  const isAuthor = !!userId && ev.author?.id === userId;
  const canCorrect = !closed && isAuthor;
  return {
    closed,
    hoursLeft: closed ? 0 : Math.max(1, Math.ceil((EVOLUTION_CORRECTION_WINDOW_MS - elapsed) / 3_600_000)),
    canCorrect,
    kinds: canCorrect ? ['CORRECCION', 'ACLARATORIA', 'ANEXO'] : ['ACLARATORIA', 'ANEXO'],
  };
}

/** Evoluciones originales con sus notas enlazadas, en orden cronológico. */
export function groupEvolutions(evolutions: ClinicalEvolution[]) {
  const notes = new Map<string, ClinicalEvolution[]>();
  for (const ev of evolutions) {
    const target = ev.content.amends?.evolutionId;
    if (target) notes.set(target, [...(notes.get(target) ?? []), ev]);
  }
  return evolutions
    .filter((ev) => !ev.content.amends)
    .map((ev) => ({ ev, notes: notes.get(ev.id) ?? [] }));
}
