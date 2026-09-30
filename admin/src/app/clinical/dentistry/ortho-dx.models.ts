import type { DentistryContent } from './dentistry.models';
import type { DxCategoryKey, OrthoProblem } from './ortho-dx.data';
import { spaceAnalysis, suggestSagittal, suggestVertical } from './ortho-arch.models';

export const DX_CATEGORIES: Array<{ key: DxCategoryKey; label: string; options: string[] }> = [
  { key: 'skeletal', label: 'Esquelético', options: ['Clase I', 'Clase II', 'Clase III'] },
  { key: 'dental', label: 'Dental', options: ['Clase I', 'Clase II', 'Clase III'] },
  { key: 'vertical', label: 'Vertical', options: ['Normal', 'Mordida abierta', 'Mordida profunda'] },
  { key: 'transverse', label: 'Transversal', options: ['Normal', 'Mordida cruzada', 'Compresión'] },
  { key: 'functional', label: 'Funcional', options: ['Normal', 'Alterado'] },
  { key: 'softTissue', label: 'Tejidos blandos', options: ['Normal', 'Alterado'] },
  { key: 'crowding', label: 'Apiñamiento', options: ['No', 'Leve', 'Moderado', 'Severo'] },
];

export const PRIORITIES = ['Alta', 'Media', 'Baja'];
export const PROBLEM_STATUSES = ['Activo', 'En corrección', 'Resuelto'];
export const OBJECTIVE_STATUSES = ['Pendiente', 'En curso', 'Logrado'];
export const SEVERITIES = ['Leve', 'Moderado', 'Severo'];

export const OBJECTIVE_CATALOG = [
  'Alinear',
  'Nivelar',
  'Corregir overjet',
  'Corregir overbite',
  'Corregir línea media',
  'Corregir clase molar',
  'Corregir clase canina',
  'Expandir',
  'Contraer',
  'Cerrar espacios',
  'Abrir espacios',
  'Corregir rotaciones',
  'Control vertical',
  'Control transversal',
  'Mejorar perfil',
  'Mejorar sonrisa',
  'Mejorar función',
];

export const EXTRACTION_REASONS = ['Apiñamiento', 'Camuflaje', 'Anclaje', 'Compromiso periodontal', 'No restaurable', 'Otro'];
export const EXTRACTION_STATUSES = ['Propuesta', 'Aceptada', 'Realizada', 'Cancelada'];
export const COMMON_EXTRACTIONS = ['14', '24', '34', '44', '15', '25', '35', '45', '18', '28', '38', '48'];

const n = (v: unknown) => {
  const x = Number(String(v ?? '').replace(',', '.'));
  return String(v ?? '').trim() && Number.isFinite(x) ? x : null;
};
const has = (v: string, re: RegExp) => re.test(v || '');

/** Sugerencia por categoría a partir de lo registrado; el profesional decide. */
export function suggestCategories(d: DentistryContent): Partial<Record<DxCategoryKey, string>> {
  const o = d.orthodontics;
  const io = o.intraoral;
  const out: Partial<Record<DxCategoryKey, string>> = {};
  const skel = o.cephalometry.skeletalClass;
  if (skel) out.skeletal = skel;
  const sag = suggestSagittal(io);
  if (sag) out.dental = sag.startsWith('Clase II ') ? 'Clase II' : sag;
  const vert = d.orthoArch.vertical.pattern || suggestVertical(io);
  if (vert) out.vertical = vert;
  const cross = io.crossBite && io.crossBite !== 'No';
  const comp = [d.orthoArch.transverse.maxillaryCompression, d.orthoArch.transverse.mandibularCompression].some((c) => c && c !== 'No');
  if (cross) out.transverse = 'Mordida cruzada';
  else if (comp) out.transverse = 'Compresión';
  else if (io.crossBite === 'No') out.transverse = 'Normal';
  const f = d.orthoExam.functional;
  const fnStates = [f.breathing, f.swallowing, f.phonation, f.chewing].map((x) => x.state);
  const tmj = [f.tmjPain, f.click, f.crepitus].some((s) => s.right || s.left);
  if (fnStates.includes('ALTERADA') || tmj) out.functional = 'Alterado';
  else if (fnStates.every((s) => s === 'NORMAL')) out.functional = 'Normal';
  const fa = o.facial;
  if (has(fa.lipCompetence, /incompet/i) || has(fa.profile, /convexo|cóncavo|concavo/i)) out.softTissue = 'Alterado';
  else if (fa.profile || fa.lipCompetence) out.softTissue = 'Normal';
  const crowd = worstCrowding(d) || io.crowding;
  if (crowd) out.crowding = crowd;
  return out;
}

function worstCrowding(d: DentistryContent): string {
  const order = ['No', 'Leve', 'Moderado', 'Severo'];
  let worst = -1;
  for (const k of ['upper', 'lower'] as const) {
    const l = spaceAnalysis(d.orthoArch, k).level;
    if (!l) continue;
    worst = Math.max(worst, order.indexOf(l) < 0 ? 0 : order.indexOf(l));
  }
  return worst < 0 ? '' : order[worst];
}

/** Texto del diagnóstico final a partir de las categorías elegidas. */
export function dxSummary(cat: Record<DxCategoryKey, string>): string {
  const parts: string[] = [];
  const cls = (v: string) => v.replace('Clase', 'clase');
  if (cat.skeletal) parts.push(`relación esquelética ${cls(cat.skeletal)}`);
  if (cat.dental) parts.push(`maloclusión dental ${cls(cat.dental)}`);
  if (cat.vertical) parts.push(cat.vertical === 'Normal' ? 'relación vertical normal' : cat.vertical.toLowerCase());
  if (cat.transverse) parts.push(cat.transverse === 'Normal' ? 'transversal normal' : cat.transverse.toLowerCase());
  if (cat.crowding) parts.push(cat.crowding === 'No' ? 'sin apiñamiento' : `apiñamiento ${cat.crowding.toLowerCase()}`);
  if (cat.functional) parts.push(cat.functional === 'Normal' ? 'función normal' : 'función alterada');
  if (cat.softTissue) parts.push(`tejidos blandos ${cat.softTissue === 'Normal' ? 'normales' : 'alterados'}`);
  if (!parts.length) return '';
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

export type ProblemDraft = Omit<OrthoProblem, 'id' | 'status'> & { objective: string };

/** Problemas detectados en el examen y los análisis, con el objetivo que suele atenderlos. */
export function detectProblems(d: DentistryContent): ProblemDraft[] {
  const io = d.orthodontics.intraoral;
  const out: ProblemDraft[] = [];
  const add = (problem: string, severity: string, location: string, priority: string, objective: string) =>
    out.push({ problem, severity, location, priority, objective });

  for (const k of ['upper', 'lower'] as const) {
    const s = spaceAnalysis(d.orthoArch, k);
    const where = k === 'upper' ? 'superior' : 'inferior';
    if (s.level && ['Leve', 'Moderado', 'Severo'].includes(s.level)) {
      add(`Apiñamiento ${where}`, s.level, `Arcada ${where}`, s.level === 'Leve' ? 'Media' : 'Alta', 'Alinear');
    } else if (s.level === 'Espaciamiento') {
      add(`Espaciamiento ${where}`, '', `Arcada ${where}`, 'Media', 'Cerrar espacios');
    }
  }
  if (!out.some((p) => p.problem.startsWith('Apiñamiento')) && ['Leve', 'Moderado', 'Severo'].includes(io.crowding)) {
    add('Apiñamiento', io.crowding, '', io.crowding === 'Leve' ? 'Media' : 'Alta', 'Alinear');
  }
  const oj = n(io.overjet);
  if (oj !== null && oj > 3) add('Overjet aumentado', oj > 6 ? 'Severo' : 'Moderado', 'Sector anterior', 'Alta', 'Corregir overjet');
  if (oj !== null && oj < 0) add('Mordida cruzada anterior', '', 'Sector anterior', 'Alta', 'Corregir overjet');
  const ob = n(io.overbite);
  if (io.deepBite === 'Sí' || (ob !== null && ob > 4)) add('Mordida profunda', '', 'Sector anterior', 'Alta', 'Corregir overbite');
  if ((io.openBite && io.openBite !== 'No') || (ob !== null && ob < 0)) add(`Mordida abierta${io.openBite && io.openBite !== 'No' ? ' ' + io.openBite.toLowerCase() : ''}`, '', '', 'Alta', 'Control vertical');
  if (io.crossBite && io.crossBite.startsWith('Posterior')) add(`Mordida cruzada ${io.crossBite.toLowerCase().replace('posterior ', 'posterior ')}`, '', io.crossBiteSide || '', 'Alta', 'Control transversal');
  const um = n(io.upperMidline);
  const lm = n(io.lowerMidline);
  if ((um !== null && Math.abs(um) >= 1) || (lm !== null && Math.abs(lm) >= 1)) add('Desviación de línea media', '', '', 'Media', 'Corregir línea media');
  const molars = [io.molarRight, io.molarLeft].join(' ');
  if (/clase\s*ii(?!i)/i.test(molars)) add('Clase II molar', '', [io.molarRight && 'derecha', io.molarLeft && 'izquierda'].filter(Boolean).join(' y '), 'Alta', 'Corregir clase molar');
  if (/clase\s*iii/i.test(molars)) add('Clase III molar', '', '', 'Alta', 'Corregir clase molar');
  if (io.diastemas) add('Diastemas', '', io.diastemas, 'Media', 'Cerrar espacios');
  const rotations = d.orthoMovements.filter((m) => m.type === 'ROTACION' && m.status !== 'SUSPENDIDO');
  if (rotations.length) add('Rotaciones dentarias', '', rotations.map((r) => r.tooth).join(', '), 'Media', 'Corregir rotaciones');
  const f = d.orthoExam.functional;
  const altered = [
    ['Respiración', f.breathing],
    ['Deglución', f.swallowing],
    ['Fonación', f.phonation],
    ['Masticación', f.chewing],
  ].filter(([, v]) => (v as { state: string }).state === 'ALTERADA');
  if (altered.length) add(`Función alterada: ${altered.map(([l]) => (l as string).toLowerCase()).join(', ')}`, '', '', 'Media', 'Mejorar función');
  if (d.orthoExam.smile.smileLine === 'Alta') add('Sonrisa gingival', '', 'Sector anterior superior', 'Baja', 'Mejorar sonrisa');
  return out;
}
