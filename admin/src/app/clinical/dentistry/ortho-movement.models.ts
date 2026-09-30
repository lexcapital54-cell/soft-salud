import type { ToothRecord } from './dentistry.models';
import { MOVEMENT_STATUSES, OrthoMovement, OrthoMovementStatus, OrthoMovementType, newMovementId } from './ortho-movement.data';

export { MOVEMENT_STATUSES, newMovementId } from './ortho-movement.data';
export type { OrthoMovement, OrthoMovementStatus, OrthoMovementType } from './ortho-movement.data';

export interface MovementTypeDef {
  key: OrthoMovementType;
  label: string;
  unit: 'mm' | '°';
  directions: string[];
  color: string;
  /** Marca equivalente del odontograma, si existe. */
  mark?: string;
  /** Magnitud a partir de la cual se muestra una advertencia orientativa. */
  warnAbove?: number;
  warnText?: string;
}

export const MOVEMENT_TYPES: MovementTypeDef[] = [
  { key: 'MESIALIZACION', label: 'Mesialización', unit: 'mm', directions: ['Mesial'], color: '#12609a', warnAbove: 4, warnText: 'requiere planear el anclaje' },
  { key: 'DISTALIZACION', label: 'Distalización', unit: 'mm', directions: ['Distal'], color: '#12609a', warnAbove: 3, warnText: 'considere anclaje esquelético (TAD)' },
  { key: 'INTRUSION', label: 'Intrusión', unit: 'mm', directions: ['Apical'], color: '#dc2626', mark: 'INTRUSION', warnAbove: 3, warnText: 'vigile reabsorción radicular' },
  { key: 'EXTRUSION', label: 'Extrusión', unit: 'mm', directions: ['Oclusal'], color: '#16a34a', mark: 'EXTRUSION', warnAbove: 3, warnText: 'vigile estabilidad y recidiva' },
  { key: 'ROTACION', label: 'Rotación', unit: '°', directions: ['Mesiovestibular', 'Distovestibular'], color: '#0f172a', mark: 'ROTACION', warnAbove: 45, warnText: 'considere sobrecorrección y retención prolongada' },
  { key: 'TORQUE', label: 'Torque', unit: '°', directions: ['Corona a vestibular', 'Corona a lingual'], color: '#7c3aed', warnAbove: 15, warnText: 'verifique la tabla ósea en la radiografía' },
  { key: 'TIP', label: 'Tip (angulación)', unit: '°', directions: ['Corona a mesial', 'Corona a distal'], color: '#0891b2', warnAbove: 15, warnText: 'verifique paralelismo radicular' },
  { key: 'INCLINACION', label: 'Inclinación', unit: '°', directions: ['Vestibular', 'Lingual'], color: '#9333ea', warnAbove: 15, warnText: 'verifique la tabla ósea en la radiografía' },
  { key: 'TRASLACION', label: 'Traslación (en masa)', unit: 'mm', directions: ['Mesial', 'Distal', 'Vestibular', 'Lingual'], color: '#0369a1', warnAbove: 4, warnText: 'requiere planear el anclaje' },
  { key: 'PROTRUSION', label: 'Protrusión', unit: 'mm', directions: ['Vestibular'], color: '#dc2626', mark: 'PROTRUSION', warnAbove: 3, warnText: 'vigile el soporte periodontal y el perfil' },
  { key: 'RETRUSION', label: 'Retrusión', unit: 'mm', directions: ['Lingual'], color: '#dc2626', mark: 'RETRUSION', warnAbove: 5, warnText: 'requiere espacio y anclaje' },
  { key: 'EXPANSION', label: 'Expansión', unit: 'mm', directions: ['Vestibular'], color: '#2563eb', mark: 'EXPANSION', warnAbove: 4, warnText: 'la expansión dental amplia puede ser inestable' },
  { key: 'CONTRACCION', label: 'Contracción', unit: 'mm', directions: ['Lingual'], color: '#2563eb', mark: 'CONTRACCION' },
];

export const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

export function movementDef(type: string): MovementTypeDef | undefined {
  return MOVEMENT_TYPES.find((t) => t.key === type);
}

export function movementStatusDef(status: string) {
  return MOVEMENT_STATUSES.find((s) => s.key === status) ?? MOVEMENT_STATUSES[0];
}

/** Cuadrante FDI (1–8) del diente. */
function quadrant(tooth: number) {
  return Math.floor(tooth / 10);
}

export function isUpper(tooth: number) {
  const q = quadrant(tooth);
  return q === 1 || q === 2 || q === 5 || q === 6;
}

/** +1 si el lado mesial del diente queda a la derecha en la vista frontal (cuadrantes 1 y 4). */
function mesialSign(tooth: number) {
  const q = quadrant(tooth);
  return q === 1 || q === 4 || q === 5 || q === 8 ? 1 : -1;
}

export type MovementGlyph =
  | { kind: 'line'; dx: number; dy: number }
  | { kind: 'rot'; toward: number }
  | { kind: 'depth'; out: boolean };

/**
 * Símbolo del movimiento en la vista frontal: flecha en el plano, flecha curva para rotación,
 * y ⊙ / ⊗ para movimientos hacia vestibular (hacia el observador) o lingual.
 */
export function movementGlyph(tooth: number, type: string, direction: string): MovementGlyph | null {
  if (!tooth || !type) return null;
  const m = mesialSign(tooth);
  const occlusal = isUpper(tooth) ? 1 : -1;
  switch (type) {
    case 'MESIALIZACION':
      return { kind: 'line', dx: m, dy: 0 };
    case 'DISTALIZACION':
      return { kind: 'line', dx: -m, dy: 0 };
    case 'INTRUSION':
      return { kind: 'line', dx: 0, dy: -occlusal };
    case 'EXTRUSION':
      return { kind: 'line', dx: 0, dy: occlusal };
    case 'EXPANSION':
      return { kind: 'line', dx: -m, dy: 0 };
    case 'CONTRACCION':
      return { kind: 'line', dx: m, dy: 0 };
    case 'ROTACION':
      return { kind: 'rot', toward: direction === 'Distovestibular' ? -m : m };
    case 'TIP':
      return { kind: 'line', dx: (direction === 'Corona a distal' ? -m : m) * 0.75, dy: occlusal * 0.75 };
    case 'TRASLACION':
      if (direction === 'Mesial') return { kind: 'line', dx: m, dy: 0 };
      if (direction === 'Distal') return { kind: 'line', dx: -m, dy: 0 };
      return { kind: 'depth', out: direction !== 'Lingual' };
    case 'PROTRUSION':
      return { kind: 'depth', out: true };
    case 'RETRUSION':
      return { kind: 'depth', out: false };
    case 'TORQUE':
      return { kind: 'depth', out: direction !== 'Corona a lingual' };
    case 'INCLINACION':
      return { kind: 'depth', out: direction !== 'Lingual' };
    default:
      return null;
  }
}

export interface MovementHint {
  tone: 'warn' | 'danger';
  text: string;
}

/** Advertencias orientativas de seguridad clínica; no reemplazan el criterio del ortodoncista. */
export function movementHints(mv: OrthoMovement, rec: ToothRecord | undefined): MovementHint[] {
  const out: MovementHint[] = [];
  const cond = rec?.conditions ?? [];
  if (cond.includes('AUSENTE')) out.push({ tone: 'danger', text: `El diente ${mv.tooth} figura ausente en el odontograma.` });
  if (cond.includes('IMPLANTE')) out.push({ tone: 'danger', text: `El ${mv.tooth} es un implante: no responde al movimiento ortodóntico.` });
  if (cond.includes('EXTRACCION_INDICADA')) out.push({ tone: 'warn', text: `El ${mv.tooth} tiene extracción indicada.` });
  if (cond.includes('INCLUIDO')) out.push({ tone: 'warn', text: `El ${mv.tooth} está incluido: requiere tracción o exposición quirúrgica.` });
  const def = movementDef(mv.type);
  const n = Number(String(mv.magnitude).replace(',', '.'));
  if (def?.warnAbove && Number.isFinite(n) && n > def.warnAbove) {
    out.push({ tone: 'warn', text: `${def.label} de ${n} ${def.unit} en el ${mv.tooth}: ${def.warnText}.` });
  }
  return out;
}

export function movementProgress(list: OrthoMovement[]) {
  const active = list.filter((m) => m.status !== 'SUSPENDIDO' && m.type);
  const done = active.filter((m) => m.status === 'LOGRADO').length;
  return { total: active.length, done, pct: active.length ? Math.round((done / active.length) * 100) : 0 };
}

export function movementText(mv: OrthoMovement) {
  const def = movementDef(mv.type);
  if (!def) return '';
  const dir = mv.direction && def.directions.length > 1 ? ` ${mv.direction.toLowerCase()}` : '';
  const mag = mv.magnitude ? ` ${mv.magnitude} ${def.unit}` : '';
  return `${def.label}${dir}${mag}`;
}

/** Movimientos marcados en el odontograma que aún no están en el plan. */
export function movementsFromMarks(odontogram: Record<string, ToothRecord>, current: OrthoMovement[]): OrthoMovement[] {
  const out: OrthoMovement[] = [];
  const now = new Date().toISOString();
  for (const [tooth, rec] of Object.entries(odontogram)) {
    for (const mark of rec?.marks ?? []) {
      const def = MOVEMENT_TYPES.find((t) => t.mark === mark);
      if (!def || current.some((m) => m.tooth === tooth && m.type === def.key)) continue;
      out.push({
        id: newMovementId(),
        tooth,
        type: def.key,
        direction: def.directions.length === 1 ? def.directions[0] : '',
        magnitude: '',
        status: 'PLANIFICADO',
        notes: '',
        createdAt: now,
      });
    }
  }
  return out.sort((a, b) => Number(a.tooth) - Number(b.tooth));
}
