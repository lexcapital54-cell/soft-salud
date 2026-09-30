export type OrthoCaseStatus =
  | ''
  | 'NUEVO'
  | 'VALORACION'
  | 'DIAGNOSTICO'
  | 'PLANIFICADO'
  | 'EN_TRATAMIENTO'
  | 'RETENCION'
  | 'FINALIZADO'
  | 'SUSPENDIDO';

export const ORTHO_CASE_STATUSES: Array<{ key: Exclude<OrthoCaseStatus, ''>; label: string; color: string }> = [
  { key: 'NUEVO', label: 'Nuevo', color: '#64748b' },
  { key: 'VALORACION', label: 'Valoración', color: '#0891b2' },
  { key: 'DIAGNOSTICO', label: 'Diagnóstico', color: '#7c3aed' },
  { key: 'PLANIFICADO', label: 'Planificado', color: '#12609a' },
  { key: 'EN_TRATAMIENTO', label: 'En tratamiento', color: '#16a34a' },
  { key: 'RETENCION', label: 'Retención', color: '#0d9488' },
  { key: 'FINALIZADO', label: 'Finalizado', color: '#123b60' },
  { key: 'SUSPENDIDO', label: 'Suspendido', color: '#dc2626' },
];

export const ORTHO_TREATMENT_TYPES = [
  'Brackets metálicos',
  'Brackets estéticos (cerámicos / zafiro)',
  'Brackets de autoligado',
  'Ortodoncia lingual',
  'Alineadores',
  'Ortopedia funcional / interceptiva',
  'Expansión maxilar',
  'Ortodoncia prequirúrgica (ortognática)',
  'Retratamiento',
];

export const ORTHO_MOTIVES = [
  'Dientes apiñados / torcidos',
  'Dientes separados (diastemas)',
  'Dientes salidos / protruidos',
  'Mordida (abierta, profunda o cruzada)',
  'Estética de la sonrisa',
  'Asimetría facial',
  'Dificultad para masticar',
  'Dolor o ruido en la ATM',
  'Respiración oral / ronquido',
  'Recidiva de ortodoncia previa',
  'Remitido por su odontólogo',
  'Preparación para prótesis o implantes',
];

export interface OrthoPriorTreatment {
  had: '' | 'SI' | 'NO';
  ageStart: string;
  applianceType: string;
  duration: string;
  endReason: string;
  retainerUse: '' | 'SI' | 'NO' | 'IRREGULAR';
  retainerType: string;
  relapse: string;
  surgery: string;
  extractions: string;
}

export interface OrthoCaseData {
  status: OrthoCaseStatus;
  treatmentType: string;
  startDate: string;
  orthodontist: string;
  motives: string[];
  motiveAesthetic: string;
  motiveFunctional: string;
  concern: string;
  expectations: string;
  evolutionTime: string;
  prior: OrthoPriorTreatment;
}

export const ORTHO_END_REASONS = ['Terminó el tratamiento', 'Abandonó', 'Cambio de ciudad / profesional', 'Costos', 'Otro'];

export function emptyOrthoPrior(): OrthoPriorTreatment {
  return {
    had: '',
    ageStart: '',
    applianceType: '',
    duration: '',
    endReason: '',
    retainerUse: '',
    retainerType: '',
    relapse: '',
    surgery: '',
    extractions: '',
  };
}

export function emptyOrthoCase(): OrthoCaseData {
  return {
    status: '',
    treatmentType: '',
    startDate: '',
    orthodontist: '',
    motives: [],
    motiveAesthetic: '',
    motiveFunctional: '',
    concern: '',
    expectations: '',
    evolutionTime: '',
    prior: emptyOrthoPrior(),
  };
}

export function normalizeOrthoCase(raw: Partial<OrthoCaseData> | undefined): OrthoCaseData {
  const r = raw || {};
  return {
    ...emptyOrthoCase(),
    ...r,
    motives: [...(r.motives || [])],
    prior: { ...emptyOrthoPrior(), ...(r.prior || {}) },
  };
}

export function orthoCaseStatusLabel(s: string) {
  return ORTHO_CASE_STATUSES.find((x) => x.key === s)?.label || '';
}

/** Estado sugerido a partir de lo registrado; el profesional decide si lo aplica. */
export function suggestOrthoCaseStatus(input: {
  installedAt: string | null;
  debondedAt: string | null;
  hasDiagnosis: boolean;
  hasPlan: boolean;
  hasExam: boolean;
  closed: boolean;
}): Exclude<OrthoCaseStatus, ''> {
  if (input.closed) return 'FINALIZADO';
  if (input.debondedAt) return 'RETENCION';
  if (input.installedAt) return 'EN_TRATAMIENTO';
  if (input.hasPlan) return 'PLANIFICADO';
  if (input.hasDiagnosis) return 'DIAGNOSTICO';
  if (input.hasExam) return 'VALORACION';
  return 'NUEVO';
}

/** Mayor número de meses en textos como «18 a 24 meses» o «2 años». */
export function estimatedMonths(text: string): number | null {
  const t = text.toLowerCase();
  const nums = (t.match(/\d+([.,]\d+)?/g) || []).map((n) => Number(n.replace(',', '.')));
  if (!nums.length) return null;
  const max = Math.max(...nums);
  return /año/.test(t) ? max * 12 : max;
}

const num = (v: string) => {
  const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return String(v ?? '').trim() && Number.isFinite(n) ? n : null;
};

/** Clase de Angle con las clases molares registradas (subdivisión si difieren); no reemplaza el diagnóstico. */
export function angleFromMolars(right: string, left: string): string {
  const ok = (v: string) => /^Clase (I|II|III)$/.test(v);
  if (ok(right) && ok(left)) {
    if (right === left) return right;
    const abnormal = right === 'Clase I' ? left : left === 'Clase I' ? right : '';
    if (abnormal) return `${abnormal} subdivisión ${right === 'Clase I' ? 'izquierda' : 'derecha'}`;
    return `Derecha ${right} / izquierda ${left}`;
  }
  return right || left || '';
}

/** Discrepancia en mm (negativa = falta espacio): leve hasta 4, moderado hasta 8, severo más de 8. */
export function crowdingSeverity(discrepancy: string): { text: string; tone: 'ok' | 'warn' | 'danger' } | null {
  const n = num(discrepancy);
  if (n === null) return null;
  if (n >= 0) return { text: n > 0 ? `Espacio sobrante ${n} mm` : 'Sin discrepancia', tone: 'ok' };
  const a = Math.abs(n);
  if (a <= 4) return { text: `Apiñamiento leve (${a} mm)`, tone: 'warn' };
  if (a <= 8) return { text: `Apiñamiento moderado (${a} mm)`, tone: 'warn' };
  return { text: `Apiñamiento severo (${a} mm)`, tone: 'danger' };
}

/** Rango orientativo: overjet y overbite normales entre 1 y 3 mm. */
export function overToneMm(v: string): 'ok' | 'warn' | 'danger' | '' {
  const n = num(v);
  if (n === null) return '';
  if (n >= 1 && n <= 3) return 'ok';
  if (n < -1 || n > 6) return 'danger';
  return 'warn';
}

export function midlineText(upper: string, lower: string, text: string): string {
  const u = num(upper);
  const l = num(lower);
  const side = (n: number) => (n === 0 ? 'centrada' : `${Math.abs(n)} mm a la ${n > 0 ? 'derecha' : 'izquierda'}`);
  if (u !== null || l !== null) return [u !== null ? `Sup. ${side(u)}` : '', l !== null ? `Inf. ${side(l)}` : ''].filter(Boolean).join(' · ');
  return text;
}

export function treatmentProgress(months: number | null, estimated: string): number | null {
  const total = estimatedMonths(estimated);
  if (months === null || !total) return null;
  return Math.min(100, Math.round((months / total) * 100));
}

export const ORTHO_TIMELINE_STAGES = [
  'Valoración',
  'Diagnóstico',
  'Inicio',
  'Alineación',
  'Nivelación',
  'Cierre de espacios',
  'Finalización',
  'Retención',
];

/** Etapa actual de la línea de tiempo: estado del caso y, en tratamiento, la fase del último control. */
export function orthoTimelineStage(status: OrthoCaseStatus, lastPhase: string): number {
  switch (status) {
    case 'NUEVO':
    case 'VALORACION':
      return 0;
    case 'DIAGNOSTICO':
    case 'PLANIFICADO':
      return 1;
    case 'RETENCION':
    case 'FINALIZADO':
      return 7;
    case 'EN_TRATAMIENTO': {
      const p = lastPhase.toLowerCase();
      if (/final|detall|termin/.test(p)) return 6;
      if (/cierre|espacio/.test(p)) return 5;
      if (/nivel/.test(p)) return 4;
      if (/aline/.test(p)) return 3;
      return 2;
    }
    default:
      return -1;
  }
}
