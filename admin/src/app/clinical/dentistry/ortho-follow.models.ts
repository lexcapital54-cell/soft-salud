import type { OrthoAgendaRow, RetentionCheck } from './ortho-follow.data';
import type { OrthoControlRow } from './ortho-controls';

export * from './ortho-follow.data';

export const AGENDA_TYPES: Array<{ label: string; color: string }> = [
  { label: 'Control mensual', color: '#12609a' },
  { label: 'Cambio de arco', color: '#0891b2' },
  { label: 'Colocación', color: '#16a34a' },
  { label: 'Retiro', color: '#7c3aed' },
  { label: 'IPR', color: '#ea580c' },
  { label: 'Elásticos', color: '#db2777' },
  { label: 'Alineadores', color: '#0d9488' },
  { label: 'Emergencia', color: '#dc2626' },
  { label: 'Retención', color: '#64748b' },
];

export const AGENDA_STATUSES: Array<{ label: string; color: string }> = [
  { label: 'Programada', color: '#94a3b8' },
  { label: 'Confirmada', color: '#12609a' },
  { label: 'Atendida', color: '#16a34a' },
  { label: 'Cancelada', color: '#a1a1aa' },
  { label: 'No asistió', color: '#dc2626' },
];

/** Estado de la cita del consultorio expresado con los estados del control. */
export const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Programada',
  CONFIRMED: 'Confirmada',
  IN_WAITING: 'Confirmada',
  COMPLETED: 'Atendida',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
};

export const EVENT_COLOR: Record<string, string> = {
  CONTROL: '#12609a',
  INSTALACION: '#16a34a',
  RETIRO: '#7c3aed',
  RETENCION: '#0d9488',
};

export const RATING_COLOR: Record<string, string> = { Buena: '#16a34a', Regular: '#f59e0b', Deficiente: '#dc2626' };
export const PAIN_COLOR: Record<string, string> = { 'Sin dolor': '#16a34a', Leve: '#facc15', Moderado: '#f97316', Severo: '#dc2626' };

export const RETAINER_TYPES = ['Fijo (lingual)', 'Essix', 'Hawley', 'Otro'];
export const RETAINER_STATUSES = ['Activo', 'Despegado', 'Fracturado', 'Perdido', 'Reemplazado', 'Retirado'];
export const RETAINER_USAGE = ['Tiempo completo', 'Nocturno', 'Noches alternas', 'Permanente (fijo)'];
export const RETENTION_STABILITY = ['Estable', 'Recidiva leve', 'Recidiva moderada'];
export const RETENTION_MILESTONES = [1, 3, 6, 12];

export function colorOf(list: Array<{ label: string; color: string }>, label: string) {
  return list.find((x) => x.label === label)?.color ?? '#94a3b8';
}

export function dayIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDay(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null;
}

export function addDays(v: string, days: number) {
  const d = parseDay(v);
  if (!d) return '';
  d.setDate(d.getDate() + days);
  return dayIso(d);
}

export function addMonths(v: string, months: number) {
  const d = parseDay(v);
  if (!d) return '';
  d.setMonth(d.getMonth() + months);
  return dayIso(d);
}

export function daysBetween(a: string, b: string) {
  const x = parseDay(a);
  const y = parseDay(b);
  return x && y ? Math.round((y.getTime() - x.getTime()) / 86_400_000) : 0;
}

export function fmtDay(v: string) {
  return v ? v.slice(0, 10).split('-').reverse().join('/') : '';
}

/** "24 meses", "2 años", "18 a 24 meses" → meses (toma el valor mayor). */
export function parseDurationMonths(text: string): number | null {
  const nums = (text || '').match(/\d+(?:[.,]\d+)?/g);
  if (!nums) return null;
  const n = Math.max(...nums.map((x) => Number(x.replace(',', '.'))));
  if (!n) return null;
  return /año/i.test(text) ? n * 12 : n;
}

export interface TrackPoint {
  row: OrthoControlRow;
  day: string;
  week: number | null;
  x: number;
}

export interface EvolutionTrack {
  start: string;
  end: string;
  todayX: number | null;
  points: TrackPoint[];
  planned: Array<{ row: OrthoAgendaRow; x: number }>;
  months: Array<{ x: number; label: string }>;
  progress: number | null;
}

/** Posiciones de los controles en la línea de tiempo (x entre 0 y 1). */
export function evolutionTrack(
  rows: OrthoControlRow[],
  installedAt: string | null,
  estimatedMonths: number | null,
  planned: OrthoAgendaRow[],
  today = dayIso(new Date()),
): EvolutionTrack | null {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const future = planned.filter((p) => p.date && p.date >= today && p.status !== 'Cancelada');
  const start = (installedAt || sorted[0]?.date || future[0]?.date || '').slice(0, 10);
  if (!start) return null;
  const candidates = [today, ...sorted.map((r) => r.date.slice(0, 10)), ...future.map((p) => p.date)];
  if (estimatedMonths) candidates.push(addMonths(start, estimatedMonths));
  const end = candidates.reduce((m, d) => (d > m ? d : m), addMonths(start, 1));
  const span = Math.max(1, daysBetween(start, end));
  const xOf = (d: string) => Math.min(1, Math.max(0, daysBetween(start, d.slice(0, 10)) / span));
  const months: Array<{ x: number; label: string }> = [];
  const total = Math.ceil(span / 30.44);
  const step = total > 30 ? 6 : total > 12 ? 3 : 1;
  for (let m = 0; m <= total; m += step) {
    const d = addMonths(start, m);
    if (d <= end) months.push({ x: xOf(d), label: m === 0 ? 'Inicio' : `${m} m` });
  }
  const elapsed = installedAt ? daysBetween(start, today) / 30.44 : null;
  return {
    start,
    end,
    todayX: today >= start ? xOf(today) : null,
    points: sorted.map((row) => ({
      row,
      day: row.date.slice(0, 10),
      week: installedAt && row.date >= installedAt ? Math.floor(daysBetween(start, row.date.slice(0, 10)) / 7) + 1 : null,
      x: xOf(row.date),
    })),
    planned: future.map((row) => ({ row, x: xOf(row.date) })),
    months,
    progress: elapsed !== null && estimatedMonths ? Math.min(100, Math.round((elapsed / estimatedMonths) * 100)) : null,
  };
}

export interface MilestoneState {
  months: number;
  due: string;
  check: RetentionCheck | undefined;
  state: 'done' | 'overdue' | 'soon' | 'future';
}

/** Controles de retención a 1, 3, 6 y 12 meses desde el inicio de la retención. */
export function retentionMilestones(base: string, checks: RetentionCheck[], today = dayIso(new Date())): MilestoneState[] {
  return RETENTION_MILESTONES.map((months) => {
    const due = base ? addMonths(base, months) : '';
    const check = checks.find((c) => c.milestone === String(months));
    let state: MilestoneState['state'] = 'future';
    if (check?.date) state = 'done';
    else if (due && due < today) state = 'overdue';
    else if (due && daysBetween(today, due) <= 21) state = 'soon';
    return { months, due, check, state };
  });
}

/** Aviso cuando no hay control programado y el último fue hace más de 6 semanas. */
export function nextControlWarning(lastControl: string | null, agenda: OrthoAgendaRow[], today = dayIso(new Date())) {
  const upcoming = agenda.some((a) => a.date >= today && (a.status === 'Programada' || a.status === 'Confirmada'));
  if (upcoming || !lastControl) return '';
  const weeks = Math.floor(daysBetween(lastControl.slice(0, 10), today) / 7);
  return weeks > 6 ? `El último control fue hace ${weeks} semanas y no hay un control programado.` : '';
}
