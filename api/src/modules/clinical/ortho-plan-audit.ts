import {
  ORTHO_APPLIANCE_LABELS,
  ORTHO_BRACKET_LABELS,
  ORTHO_ELASTIC_LABELS,
  ORTHO_PLAN_PHASE_LABELS,
} from './dentistry-labels';

/** Entidad de AuditLog para los cambios del plan de ortodoncia (entityId = paciente). */
export const ORTHO_PLAN_AUDIT_ENTITY = 'OrthoPlan';

export interface OrthoPlanChange {
  field: string;
  label: string;
  from: string;
  to: string;
  module?: string;
  action?: 'Crear' | 'Editar' | 'Eliminar' | 'Firmar' | 'Cerrar' | 'Corregir' | 'Anexar';
}

export interface OrthoHistoryEntry {
  at: string;
  userName: string;
  source: 'HISTORIA' | 'SEGUIMIENTO' | 'CONTROL' | 'FIRMA' | 'CONSENTIMIENTO';
  changes: OrthoPlanChange[];
}

type Json = Record<string, unknown>;

const MAX_VALUE = 400;

const TRACKED: Array<{ field: string; label: string; module?: string; read: (d: Json) => string }> = [
  { field: 'diagnosis', module: 'Diagnóstico', label: 'Diagnóstico ortodóntico', read: (d) => text(ortho(d).diagnosis) },
  { field: 'skeletalClass', module: 'Diagnóstico', label: 'Clase esquelética', read: (d) => text(ceph(d).skeletalClass) },
  { field: 'growthPattern', module: 'Diagnóstico', label: 'Patrón de crecimiento', read: (d) => text(ceph(d).growthPattern) },
  { field: 'phase', module: 'Plan', label: 'Fase de tratamiento', read: (d) => text(ortho(d).phase) },
  { field: 'objectives', module: 'Diagnóstico', label: 'Objetivos de tratamiento', read: (d) => text(ortho(d).objectives) },
  { field: 'appliance', module: 'Plan', label: 'Aparatología propuesta', read: (d) => text(ortho(d).appliance) },
  { field: 'estimatedDuration', module: 'Plan', label: 'Duración estimada', read: (d) => text(ortho(d).estimatedDuration) },
  { field: 'extractions', module: 'Plan', label: 'Extracciones indicadas', read: (d) => text(ortho(d).extractions) },
  { field: 'retention', module: 'Retención', label: 'Plan de retención', read: (d) => text(ortho(d).retention) },
  {
    field: 'bracketType',
    module: 'Aparatología',
    label: 'Tipo de brackets',
    read: (d) => {
      const v = text(chart(d).bracketType);
      return ORTHO_BRACKET_LABELS[v] || v;
    },
  },
  {
    field: 'appliances',
    module: 'Aparatología',
    label: 'Aparatos del caso',
    read: (d) => list(chart(d).appliances, ORTHO_APPLIANCE_LABELS),
  },
  {
    field: 'archSegments',
    module: 'Aparatología',
    label: 'Arco seccionado',
    read: (d) =>
      (Array.isArray(chart(d).archSegments) ? (chart(d).archSegments as unknown[]) : [])
        .map((s) => obj(s))
        .map((s) => `${s.arch === 'upper' ? 'Sup.' : 'Inf.'} ${String(s.from ?? '')}–${String(s.to ?? '')}`)
        .sort()
        .join(', '),
  },
  {
    field: 'elastics',
    module: 'Aparatología',
    label: 'Elásticos',
    read: (d) =>
      (Array.isArray(chart(d).elastics) ? (chart(d).elastics as unknown[]) : [])
        .map((e) => obj(e))
        .map((e) => `${ORTHO_ELASTIC_LABELS[text(e.type)] || text(e.type)} ${String(e.from ?? '')}–${String(e.to ?? '')}`)
        .sort()
        .join(', '),
  },
  {
    field: 'planPhases',
    module: 'Aparatología',
    label: 'Fases del plan cumplidas',
    read: (d) => list(chart(d).planPhases, ORTHO_PLAN_PHASE_LABELS),
  },
  { field: 'cephConclusion', module: 'Cefalometría', label: 'Conclusión cefalométrica', read: (d) => text(obj(d.orthoCeph).notes) },
  {
    field: 'dxSelectedPlan',
    module: 'Plan',
    label: 'Alternativa de tratamiento elegida',
    read: (d) => {
      const dx = obj(d.orthoDx);
      const plan = rows(dx.plans).find((p) => text(p.id) === text(dx.selectedPlan));
      return plan ? joinParts(text(plan.label), text(plan.description)) : '';
    },
  },
  {
    field: 'dxExtractions',
    module: 'Plan',
    label: 'Extracciones (detalle)',
    read: (d) => sorted(rows(obj(d.orthoDx).extractions).map((e) => joinParts(text(e.tooth), text(e.status)))),
  },
  {
    field: 'movements',
    module: 'Movimientos',
    label: 'Movimientos dentarios',
    read: (d) => sorted(rows(d.orthoMovements).map((m) => joinParts(text(m.tooth), text(m.type), text(m.direction), text(m.status)))),
  },
  {
    field: 'mechAppliances',
    module: 'Aparatología',
    label: 'Aparatología registrada',
    read: (d) => sorted(rows(mech(d).appliances).map((a) => joinParts(text(a.type), text(a.arch), text(a.status)))),
  },
  {
    field: 'mechWires',
    module: 'Arcos',
    label: 'Secuencia de arcos',
    read: (d) => sorted(rows(mech(d).wires).map((w) => joinParts(text(w.arch), text(w.wire), text(w.status)))),
  },
  {
    field: 'mechElastics',
    module: 'Elásticos',
    label: 'Elásticos (mecánica)',
    read: (d) => sorted(rows(mech(d).elastics).map((e) => joinParts(text(e.type), `${text(e.from)}-${text(e.to)}`, text(e.size)))),
  },
  {
    field: 'mechIpr',
    module: 'IPR',
    label: 'Reducción interproximal',
    read: (d) => sorted(rows(mech(d).ipr).map((r) => joinParts(text(r.contact), text(r.amount) && `${text(r.amount)} mm`, text(r.status)))),
  },
  {
    field: 'mechTads',
    module: 'TAD',
    label: 'Mini implantes',
    read: (d) => sorted(rows(mech(d).tads).map((t) => joinParts(text(t.location), text(t.tooth), text(t.status)))),
  },
  {
    field: 'aligners',
    module: 'Alineadores',
    label: 'Alineadores',
    read: (d) => {
      const a = obj(mech(d).aligners);
      const total = text(a.total);
      if (!total) return '';
      const done = Object.values(obj(a.states)).filter((v) => v === 'Completado').length;
      return `${joinParts(text(a.brand), text(a.plan))} · ${done}/${total} completados`;
    },
  },
  {
    field: 'retainers',
    module: 'Retención',
    label: 'Retenedores',
    read: (d) => sorted(rows(follow(d).retainers).map((r) => joinParts(text(r.type), text(r.arch), text(r.status)))),
  },
  {
    field: 'retentionChecks',
    module: 'Retención',
    label: 'Controles de retención',
    read: (d) =>
      sorted(rows(follow(d).checks).filter((c) => text(c.date)).map((c) => joinParts(`${text(c.milestone)} m`, text(c.date), text(c.stability)))),
  },
  {
    field: 'agenda',
    module: 'Controles',
    label: 'Controles programados',
    read: (d) => sorted(rows(follow(d).agenda).map((a) => joinParts(text(a.date), text(a.type), text(a.status)))),
  },
  {
    field: 'budget',
    module: 'Presupuesto',
    label: 'Presupuesto',
    read: (d) => sorted(rows(obj(d.orthoBudget).items).map((i) => joinParts(text(i.concept), text(i.qty) && `×${text(i.qty)}`, text(i.unitValue), text(i.status)))),
  },
  {
    field: 'requiredConsents',
    module: 'Consentimientos',
    label: 'Consentimientos solicitados',
    read: (d) => (Array.isArray(d.requiredConsents) ? (d.requiredConsents as unknown[]).filter((x) => typeof x === 'string').sort().join(', ') : ''),
  },
];

function rows(v: unknown): Json[] {
  return Array.isArray(v) ? v.map((x) => obj(x)) : [];
}

function mech(d: Json) {
  return obj(d.orthoMech);
}

function follow(d: Json) {
  return obj(d.orthoFollow);
}

function joinParts(...parts: string[]) {
  return parts.filter(Boolean).join(' ');
}

function sorted(items: string[]) {
  return items.filter(Boolean).sort().join(', ');
}

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
    if (from !== to) {
      changes.push({
        field: t.field,
        label: t.label,
        from: clip(from),
        to: clip(to),
        module: t.module,
        action: !from ? 'Crear' : !to ? 'Eliminar' : 'Editar',
      });
    }
  }
  return changes;
}

const MERGEABLE = new Set<OrthoHistoryEntry['source']>(['HISTORIA', 'SEGUIMIENTO']);

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
      if (MERGEABLE.has(e.source) && prev && at - prev.lastAt <= windowMs) {
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
    .map((e) => ({
      ...e,
      changes: e.changes
        .filter((c) => c.from !== c.to)
        .map((c) =>
          MERGEABLE.has(e.source) && c.action ? { ...c, action: !c.from ? ('Crear' as const) : !c.to ? ('Eliminar' as const) : ('Editar' as const) } : c,
        ),
    }))
    .filter((e) => e.changes.length)
    .sort((a, b) => b.at.localeCompare(a.at));
}
