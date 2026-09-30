/** Controles programados, retenedores y seguimiento de retención (parte de DentistryContent). */
export interface OrthoAgendaRow {
  id: string;
  date: string;
  time: string;
  type: string;
  professional: string;
  status: string;
  notes: string;
}

export interface RetainerRow {
  id: string;
  arch: string;
  type: string;
  installedAt: string;
  material: string;
  usage: string;
  hoursPerDay: string;
  status: string;
  compliance: string;
  notes: string;
}

export interface RetentionCheck {
  milestone: string;
  date: string;
  compliance: string;
  stability: string;
  notes: string;
}

export interface OrthoFollowData {
  agenda: OrthoAgendaRow[];
  retainers: RetainerRow[];
  checks: RetentionCheck[];
}

export function emptyOrthoFollow(): OrthoFollowData {
  return { agenda: [], retainers: [], checks: [] };
}

export function newFollowId() {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

type Json = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const list = (v: unknown) => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Json[]) : []);

export function normalizeOrthoFollow(raw: unknown): OrthoFollowData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Json;
  return {
    agenda: list(r['agenda']).map((a) => ({
      id: s(a['id']) || newFollowId(),
      date: s(a['date']),
      time: s(a['time']),
      type: s(a['type']),
      professional: s(a['professional']),
      status: s(a['status']) || 'Programada',
      notes: s(a['notes']),
    })),
    retainers: list(r['retainers']).map((a) => ({
      id: s(a['id']) || newFollowId(),
      arch: s(a['arch']),
      type: s(a['type']),
      installedAt: s(a['installedAt']),
      material: s(a['material']),
      usage: s(a['usage']),
      hoursPerDay: s(a['hoursPerDay']),
      status: s(a['status']) || 'Activo',
      compliance: s(a['compliance']),
      notes: s(a['notes']),
    })),
    checks: list(r['checks']).map((a) => ({
      milestone: s(a['milestone']),
      date: s(a['date']),
      compliance: s(a['compliance']),
      stability: s(a['stability']),
      notes: s(a['notes']),
    })),
  };
}
