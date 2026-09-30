/** Mecánica de ortodoncia planificada y registrada (livianos: se cargan con la historia). */
export interface ApplianceRow {
  id: string;
  type: string;
  arch: string;
  brand: string;
  reference: string;
  date: string;
  status: string;
  notes: string;
}

export interface ArchWireRow {
  id: string;
  arch: string;
  wire: string;
  date: string;
  status: string;
  notes: string;
}

export interface ElasticRow {
  id: string;
  type: string;
  side: string;
  from: string;
  to: string;
  size: string;
  force: string;
  usage: string;
  hours: string;
  start: string;
  end: string;
  compliance: string;
  notes: string;
}

export interface IprRow {
  id: string;
  contact: string;
  amount: string;
  date: string;
  professional: string;
  status: string;
}

export interface TadRow {
  id: string;
  location: string;
  tooth: string;
  diameter: string;
  length: string;
  brand: string;
  date: string;
  objective: string;
  torque: string;
  status: string;
  removalDate: string;
}

export interface AlignerPlan {
  brand: string;
  plan: string;
  total: string;
  start: string;
  hoursPerDay: string;
  daysPerAligner: string;
  compliance: string;
  /** Estado por número de alineador (1..total). */
  states: Record<string, string>;
  delivered: Record<string, string>;
}

export interface OrthoMechData {
  appliances: ApplianceRow[];
  wires: ArchWireRow[];
  elastics: ElasticRow[];
  ipr: IprRow[];
  tads: TadRow[];
  aligners: AlignerPlan;
}

export function emptyAligners(): AlignerPlan {
  return { brand: '', plan: '', total: '', start: '', hoursPerDay: '22', daysPerAligner: '14', compliance: '', states: {}, delivered: {} };
}

export function emptyOrthoMech(): OrthoMechData {
  return { appliances: [], wires: [], elastics: [], ipr: [], tads: [], aligners: emptyAligners() };
}

export function newMechId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function rowsOf<T extends { id: string }>(raw: unknown, prefix: string, base: Omit<T, 'id'>): T[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === 'object')
    .map((r) => {
      const o = r as Record<string, unknown>;
      const out: Record<string, unknown> = { id: typeof o['id'] === 'string' && o['id'] ? o['id'] : newMechId(prefix) };
      for (const [k, v] of Object.entries(base)) out[k] = o[k] === undefined || o[k] === null ? v : String(o[k]);
      return out as T;
    });
}

export function normalizeOrthoMech(raw: Partial<OrthoMechData> | undefined): OrthoMechData {
  const r = raw || {};
  const al = (r.aligners || {}) as Partial<AlignerPlan>;
  return {
    appliances: rowsOf<ApplianceRow>(r.appliances, 'ap', { type: '', arch: '', brand: '', reference: '', date: '', status: 'Planificado', notes: '' }),
    wires: rowsOf<ArchWireRow>(r.wires, 'aw', { arch: 'Superior', wire: '', date: '', status: 'Planificado', notes: '' }),
    elastics: rowsOf<ElasticRow>(r.elastics, 'el', {
      type: '', side: '', from: '', to: '', size: '', force: '', usage: '', hours: '', start: '', end: '', compliance: '', notes: '',
    }),
    ipr: rowsOf<IprRow>(r.ipr, 'ip', { contact: '', amount: '', date: '', professional: '', status: 'Planificado' }),
    tads: rowsOf<TadRow>(r.tads, 'td', {
      location: '', tooth: '', diameter: '', length: '', brand: '', date: '', objective: '', torque: '', status: 'Planificado', removalDate: '',
    }),
    aligners: { ...emptyAligners(), ...al, states: { ...(al.states || {}) }, delivered: { ...(al.delivered || {}) } },
  };
}
