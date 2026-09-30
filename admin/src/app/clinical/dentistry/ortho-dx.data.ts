/** Diagnóstico estructurado, problemas, objetivos, planes y extracciones (livianos: se cargan con la historia). */
export type DxCategoryKey = 'skeletal' | 'dental' | 'vertical' | 'transverse' | 'functional' | 'softTissue' | 'crowding';

export interface OrthoProblem {
  id: string;
  problem: string;
  severity: string;
  location: string;
  priority: string;
  status: string;
}

export interface OrthoObjective {
  id: string;
  problemId: string;
  objective: string;
  priority: string;
  status: string;
}

export interface OrthoPlanOption {
  id: string;
  label: string;
  description: string;
  advantages: string;
  considerations: string;
  extractions: string;
  appliance: string;
  duration: string;
  notes: string;
}

export interface OrthoExtraction {
  id: string;
  tooth: string;
  reason: string;
  indication: string;
  date: string;
  status: string;
}

export interface OrthoDxData {
  categories: Record<DxCategoryKey, string>;
  problems: OrthoProblem[];
  objectives: OrthoObjective[];
  plans: OrthoPlanOption[];
  selectedPlan: string;
  selectedAt: string;
  selectedBy: string;
  extractions: OrthoExtraction[];
}

export function emptyOrthoDx(): OrthoDxData {
  return {
    categories: { skeletal: '', dental: '', vertical: '', transverse: '', functional: '', softTissue: '', crowding: '' },
    problems: [],
    objectives: [],
    plans: [],
    selectedPlan: '',
    selectedAt: '',
    selectedBy: '',
    extractions: [],
  };
}

const arr = <T>(v: unknown, fill: (o: Partial<T>) => T): T[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map((x) => fill(x as Partial<T>)) : [];

export function newDxId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeOrthoDx(raw: Partial<OrthoDxData> | undefined): OrthoDxData {
  const b = emptyOrthoDx();
  const r = raw || {};
  return {
    categories: { ...b.categories, ...(r.categories || {}) },
    problems: arr<OrthoProblem>(r.problems, (o) => ({
      id: o.id || newDxId('pb'),
      problem: o.problem || '',
      severity: o.severity || '',
      location: o.location || '',
      priority: o.priority || '',
      status: o.status || 'Activo',
    })),
    objectives: arr<OrthoObjective>(r.objectives, (o) => ({
      id: o.id || newDxId('ob'),
      problemId: o.problemId || '',
      objective: o.objective || '',
      priority: o.priority || '',
      status: o.status || 'Pendiente',
    })),
    plans: arr<OrthoPlanOption>(r.plans, (o) => ({
      id: o.id || newDxId('pl'),
      label: o.label || '',
      description: o.description || '',
      advantages: o.advantages || '',
      considerations: o.considerations || '',
      extractions: o.extractions || '',
      appliance: o.appliance || '',
      duration: o.duration || '',
      notes: o.notes || '',
    })),
    selectedPlan: r.selectedPlan || '',
    selectedAt: r.selectedAt || '',
    selectedBy: r.selectedBy || '',
    extractions: arr<OrthoExtraction>(r.extractions, (o) => ({
      id: o.id || newDxId('ex'),
      tooth: String(o.tooth ?? ''),
      reason: o.reason || '',
      indication: o.indication || '',
      date: o.date || '',
      status: o.status || 'Propuesta',
    })),
  };
}
