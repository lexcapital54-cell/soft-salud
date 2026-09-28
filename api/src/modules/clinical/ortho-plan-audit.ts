import {
  ORTHO_APPLIANCE_LABELS,
  ORTHO_BRACKET_LABELS,
  ORTHO_PLAN_PHASE_LABELS,
} from './dentistry-labels';

/** Entidad de AuditLog para los cambios del plan de ortodoncia (entityId = paciente). */
export const ORTHO_PLAN_AUDIT_ENTITY = 'OrthoPlan';

export interface OrthoPlanChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export interface OrthoHistoryEntry {
  at: string;
  userName: string;
  source: 'HISTORIA' | 'CONTROL';
  changes: OrthoPlanChange[];
}

type Json = Record<string, unknown>;

const MAX_VALUE = 400;

const TRACKED: Array<{ field: string; label: string; read: (d: Json) => string }> = [
  { field: 'diagnosis', label: 'Diagnóstico ortodóntico', read: (d) => text(ortho(d).diagnosis) },
  { field: 'skeletalClass', label: 'Clase esquelética', read: (d) => text(ceph(d).skeletalClass) },
  { field: 'growthPattern', label: 'Patrón de crecimiento', read: (d) => text(ceph(d).growthPattern) },
  { field: 'phase', label: 'Fase de tratamiento', read: (d) => text(ortho(d).phase) },
  { field: 'objectives', label: 'Objetivos de tratamiento', read: (d) => text(ortho(d).objectives) },
  { field: 'appliance', label: 'Aparatología propuesta', read: (d) => text(ortho(d).appliance) },
  { field: 'estimatedDuration', label: 'Duración estimada', read: (d) => text(ortho(d).estimatedDuration) },
  { field: 'extractions', label: 'Extracciones indicadas', read: (d) => text(ortho(d).extractions) },
  { field: 'retention', label: 'Plan de retención', read: (d) => text(ortho(d).retention) },
  {
    field: 'bracketType',
    label: 'Tipo de brackets',
    read: (d) => {
      const v = text(chart(d).bracketType);
      return ORTHO_BRACKET_LABELS[v] || v;
    },
  },
  {
    field: 'appliances',
    label: 'Aparatos del caso',
    read: (d) => list(chart(d).appliances, ORTHO_APPLIANCE_LABELS),
  },
  {
    field: 'planPhases',
    label: 'Fases del plan cumplidas',
    read: (d) => list(chart(d).planPhases, ORTHO_PLAN_PHASE_LABELS),
  },
];

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function obj(v: unknown): Json {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

function ortho(d: Json) {
  return obj(d.orthodontics);
}

function ceph(d: Json) {
  return obj(ortho(d).cephalometry);
}

function chart(d: Json) {
  return obj(d.orthoChart);
}

function list(v: unknown, labels: Record<string, string>): string {
  if (!Array.isArray(v)) return '';
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => labels[x] || x)
    .sort()
    .join(', ');
}

function clip(v: string) {
  return v.length > MAX_VALUE ? `${v.slice(0, MAX_VALUE)}…` : v;
}

/** Campos del plan de ortodoncia que cambiaron entre dos versiones del contenido de la historia. */
export function diffOrthoPlan(previous: Json, next: Json): OrthoPlanChange[] {
  const before = obj(previous.dentistry);
  const after = obj(next.dentistry);
  if (!Object.keys(after).length) return [];
  const changes: OrthoPlanChange[] = [];
  for (const t of TRACKED) {
    const from = t.read(before);
    const to = t.read(after);
    if (from !== to) changes.push({ field: t.field, label: t.label, from: clip(from), to: clip(to) });
  }
  return changes;
}

/**
 * Une los autoguardados seguidos del mismo profesional sobre el mismo campo
 * (mientras escribe) en un solo cambio: valor inicial → valor final.
 */
export function coalesceOrthoHistory(entries: OrthoHistoryEntry[], windowMs = 20 * 60 * 1000): OrthoHistoryEntry[] {
  const sorted = [...entries].sort((a, b) => a.at.localeCompare(b.at));
  const out: OrthoHistoryEntry[] = [];
  const open = new Map<string, { entry: OrthoHistoryEntry; change: OrthoPlanChange; lastAt: number }>();
  for (const e of sorted) {
    const at = new Date(e.at).getTime();
    const fresh: OrthoPlanChange[] = [];
    for (const c of e.changes) {
      const key = `${e.source}|${e.userName}|${c.field}`;
      const prev = open.get(key);
      if (e.source === 'HISTORIA' && prev && at - prev.lastAt <= windowMs) {
        prev.change.to = c.to;
        prev.entry.at = e.at;
        prev.lastAt = at;
        continue;
      }
      fresh.push({ ...c });
    }
    if (!fresh.length) continue;
    const entry: OrthoHistoryEntry = { ...e, changes: fresh };
    out.push(entry);
    for (const c of fresh) open.set(`${e.source}|${e.userName}|${c.field}`, { entry, change: c, lastAt: at });
  }
  return out
    .map((e) => ({ ...e, changes: e.changes.filter((c) => c.from !== c.to) }))
    .filter((e) => e.changes.length)
    .sort((a, b) => b.at.localeCompare(a.at));
}
