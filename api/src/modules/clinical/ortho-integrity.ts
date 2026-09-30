type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.map(obj) : []);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

interface RowList {
  path: string[];
  label: string;
  /** Registro clínico ya realizado: no se puede quitar, solo cambiar de estado. */
  locked?: (row: Json) => boolean;
  describe?: (row: Json) => string;
}

/** Listas con id dentro de `dentistry` que llevan trazabilidad por registro. */
const LISTS: RowList[] = [
  { path: ['orthoMovements'], label: 'Movimiento dentario' },
  { path: ['orthoDx', 'problems'], label: 'Problema' },
  { path: ['orthoDx', 'objectives'], label: 'Objetivo' },
  { path: ['orthoDx', 'plans'], label: 'Alternativa de tratamiento' },
  {
    path: ['orthoDx', 'extractions'],
    label: 'Extracción',
    locked: (r) => text(r.status) === 'Realizada',
    describe: (r) => `pieza ${text(r.tooth)}`,
  },
  {
    path: ['orthoMech', 'appliances'],
    label: 'Aparato',
    locked: (r) => ['Instalado', 'Retirado'].includes(text(r.status)),
    describe: (r) => text(r.type),
  },
  {
    path: ['orthoMech', 'wires'],
    label: 'Arco',
    locked: (r) => ['Instalado', 'Retirado'].includes(text(r.status)),
    describe: (r) => `${text(r.arch)} ${text(r.wire)}`,
  },
  { path: ['orthoMech', 'elastics'], label: 'Elástico' },
  {
    path: ['orthoMech', 'ipr'],
    label: 'IPR',
    locked: (r) => text(r.status) === 'Realizado',
    describe: (r) => `contacto ${text(r.contact)}`,
  },
  {
    path: ['orthoMech', 'tads'],
    label: 'Mini implante',
    locked: (r) => !!text(r.status) && text(r.status) !== 'Planificado',
    describe: (r) => [text(r.location), text(r.tooth)].filter(Boolean).join(' '),
  },
  {
    path: ['orthoFollow', 'agenda'],
    label: 'Control programado',
    locked: (r) => !!text(r.status) && text(r.status) !== 'Programada',
    describe: (r) => `${text(r.date)} ${text(r.type)}`,
  },
  {
    path: ['orthoFollow', 'retainers'],
    label: 'Retenedor',
    locked: (r) => !!text(r.installedAt),
    describe: (r) => `${text(r.type)} ${text(r.arch)}`,
  },
  {
    path: ['orthoBudget', 'items'],
    label: 'Concepto del presupuesto',
    locked: (r) => !!text(r.status) && !['Cotizado', 'Cancelado'].includes(text(r.status)),
    describe: (r) => `${text(r.concept)} (${text(r.status)})`,
  },
];

const AUDIT_KEY = '_audit';

function listAt(dentistry: Json, path: string[]): Json[] {
  let node: unknown = dentistry;
  for (const key of path) node = obj(node)[key];
  return arr(node);
}

/** JSONB reordena las claves: se compara con las claves ordenadas. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Json)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

function withoutAudit(row: Json) {
  const { [AUDIT_KEY]: _ignored, ...rest } = row;
  return stable(rest);
}

/** Registros realizados que desaparecen en la versión nueva (se rechaza el guardado). */
export function removedLockedRows(previous: Json, next: Json): string[] {
  const before = obj(previous.dentistry);
  const after = obj(next.dentistry);
  if (!Object.keys(after).length) return [];
  const out: string[] = [];
  for (const list of LISTS) {
    if (!list.locked) continue;
    const kept = new Set(listAt(after, list.path).map((r) => text(r.id)).filter(Boolean));
    for (const row of listAt(before, list.path)) {
      const id = text(row.id);
      if (id && !kept.has(id) && list.locked(row)) {
        out.push(`${list.label} ${list.describe?.(row) ?? ''}`.trim());
      }
    }
  }
  return out;
}

/**
 * Sella createdAt/createdBy y updatedAt/updatedBy en cada registro con id. El cliente no
 * los envía: se conservan de la versión guardada y solo cambian cuando cambia el registro.
 */
export function stampOrthoRows(previous: Json, next: Json, userName: string, now: Date): void {
  const before = obj(previous.dentistry);
  const after = obj(next.dentistry);
  if (!Object.keys(after).length) return;
  const at = now.toISOString();
  for (const list of LISTS) {
    const prevById = new Map(listAt(before, list.path).map((r) => [text(r.id), r]));
    for (const row of listAt(after, list.path)) {
      const id = text(row.id);
      if (!id) continue;
      const prev = prevById.get(id);
      const prevAudit = obj(prev?.[AUDIT_KEY]);
      if (!prev) {
        row[AUDIT_KEY] = { createdAt: at, createdBy: userName, updatedAt: at, updatedBy: userName };
        continue;
      }
      const changed = withoutAudit(prev) !== withoutAudit(row);
      row[AUDIT_KEY] = {
        createdAt: text(prevAudit.createdAt) || at,
        createdBy: text(prevAudit.createdBy) || userName,
        updatedAt: changed ? at : text(prevAudit.updatedAt) || at,
        updatedBy: changed ? userName : text(prevAudit.updatedBy) || userName,
      };
    }
  }
}
