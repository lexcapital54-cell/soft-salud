/** Tipos y normalización del plan de movimientos (livianos: se cargan con la historia). */
export type OrthoMovementType =
  | 'MESIALIZACION'
  | 'DISTALIZACION'
  | 'INTRUSION'
  | 'EXTRUSION'
  | 'ROTACION'
  | 'TORQUE'
  | 'TIP'
  | 'INCLINACION'
  | 'TRASLACION'
  | 'PROTRUSION'
  | 'RETRUSION'
  | 'EXPANSION'
  | 'CONTRACCION';

export type OrthoMovementStatus = 'PLANIFICADO' | 'EN_CURSO' | 'LOGRADO' | 'SUSPENDIDO';

export interface OrthoMovement {
  id: string;
  tooth: string;
  type: OrthoMovementType | '';
  direction: string;
  magnitude: string;
  status: OrthoMovementStatus;
  notes: string;
  createdAt: string;
}

export const MOVEMENT_STATUSES: Array<{ key: OrthoMovementStatus; label: string; color: string }> = [
  { key: 'PLANIFICADO', label: 'Planificado', color: '#64748b' },
  { key: 'EN_CURSO', label: 'En curso', color: '#f59e0b' },
  { key: 'LOGRADO', label: 'Logrado', color: '#16a34a' },
  { key: 'SUSPENDIDO', label: 'Suspendido', color: '#dc2626' },
];

export function newMovementId(): string {
  return `mv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeMovements(raw: unknown): OrthoMovement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === 'object')
    .map((r) => {
      const o = r as Partial<OrthoMovement>;
      return {
        id: o.id || newMovementId(),
        tooth: String(o.tooth ?? ''),
        type: (o.type || '') as OrthoMovement['type'],
        direction: o.direction || '',
        magnitude: o.magnitude || '',
        status: MOVEMENT_STATUSES.some((s) => s.key === o.status) ? (o.status as OrthoMovementStatus) : 'PLANIFICADO',
        notes: o.notes || '',
        createdAt: o.createdAt || '',
      };
    });
}

