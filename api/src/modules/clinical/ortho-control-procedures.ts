/**
 * Procedimientos rápidos del control de ortodoncia y su CUPS genérico.
 * El código se asigna en el servidor al firmar; la descripción se toma de la
 * tabla CUPS vigente (o del catálogo odontológico si la tabla no lo tiene).
 */
export const ORTHO_CONTROL_PROCEDURES = [
  { key: 'ARCH_CHANGE', label: 'Cambio de arco', cupsCode: '893106' },
  { key: 'ACTIVATION', label: 'Activación', cupsCode: '893106' },
  { key: 'IPR', label: 'IPR (desgaste interproximal)', cupsCode: '893106' },
  { key: 'ELASTIC_CHANGE', label: 'Cambio de elásticos', cupsCode: '893106' },
  { key: 'BRACKET_REBOND', label: 'Recementado de bracket / tubo', cupsCode: '248401' },
] as const;

export type OrthoControlProcedureKey = (typeof ORTHO_CONTROL_PROCEDURES)[number]['key'];

export const ORTHO_CONTROL_PROCEDURE_KEYS = ORTHO_CONTROL_PROCEDURES.map((p) => p.key) as string[];

/** CUPS de la cita según el evento: todo control queda con un código aunque no se marque procedimiento. */
export const ORTHO_EVENT_CUPS: Record<string, string> = {
  CONTROL: '893106',
  INSTALACION: '247101',
  RETIRO: '893106',
  RETENCION: '893106',
};

export interface OrthoControlCups {
  code: string;
  description: string;
  procedures: string[];
}

/** Agrupa el evento y los procedimientos marcados por código CUPS (sin repetir códigos). */
export function orthoControlCupsCodes(event: string, procedures: string[]): Array<{ code: string; procedures: string[] }> {
  const byCode = new Map<string, string[]>();
  const eventCode = ORTHO_EVENT_CUPS[event] ?? ORTHO_EVENT_CUPS.CONTROL;
  byCode.set(eventCode, []);
  for (const key of procedures) {
    const def = ORTHO_CONTROL_PROCEDURES.find((p) => p.key === key);
    if (!def) continue;
    byCode.set(def.cupsCode, [...(byCode.get(def.cupsCode) ?? []), def.label]);
  }
  return [...byCode.entries()].map(([code, procs]) => ({ code, procedures: procs }));
}
