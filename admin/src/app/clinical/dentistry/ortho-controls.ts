import { ClinicalEvolution } from '../clinical.models';

export type OrthoControlEvent = 'CONTROL' | 'INSTALACION' | 'RETIRO' | 'RETENCION';

export const ORTHO_CONTROL_EVENTS: Array<{ value: OrthoControlEvent; label: string }> = [
  { value: 'CONTROL', label: 'Control' },
  { value: 'INSTALACION', label: 'Instalación de aparatología' },
  { value: 'RETIRO', label: 'Retiro de aparatología' },
  { value: 'RETENCION', label: 'Control de retención' },
];

/** Control de ortodoncia de una cita; se guarda dentro de la nota de evolución firmada. */
export interface OrthoControl {
  event: OrthoControlEvent;
  phase: string;
  upperArch: string;
  lowerArch: string;
  elastics: string;
  activations: string;
  repairs: string;
  hygiene: string;
  cooperation: string;
  /** Procedimientos rápidos marcados; el servidor les asigna el CUPS. */
  procedures: string[];
  ipr: string;
  pain?: string;
  emergency?: string;
  brackets?: string;
  ligatures?: string;
  photoAttachmentId?: string;
  nextAppointment?: string;
}

export function emptyOrthoControl(): OrthoControl {
  return {
    event: 'CONTROL',
    phase: '',
    upperArch: '',
    lowerArch: '',
    elastics: '',
    activations: '',
    repairs: '',
    hygiene: '',
    cooperation: '',
    procedures: [],
    ipr: '',
    pain: '',
    emergency: '',
    brackets: '',
    ligatures: '',
  };
}

export const ORTHO_PAIN = ['Sin dolor', 'Leve', 'Moderado', 'Severo'];
export const ORTHO_LIGATURES = ['Elásticas', 'Metálicas', 'Autoligado (sin ligadura)', 'Cadeneta'];

export const ORTHO_ARCH_WIRES = [
  'NiTi 0.012',
  'NiTi 0.014',
  'NiTi 0.016',
  'NiTi 0.018',
  'NiTi 0.016 x 0.022',
  'NiTi 0.017 x 0.025',
  'NiTi 0.019 x 0.025',
  'Acero 0.016',
  'Acero 0.018',
  'Acero 0.016 x 0.022',
  'Acero 0.017 x 0.025',
  'Acero 0.019 x 0.025',
  'TMA 0.017 x 0.025',
  'TMA 0.019 x 0.025',
  'Sin arco',
];

export const ORTHO_ELASTICS = [
  'Clase II',
  'Clase III',
  'Cruzados',
  'Box anterior',
  'Triangulares',
  'Asentamiento',
  'Cadena elastomérica',
];

export const ORTHO_RATING = ['Buena', 'Regular', 'Deficiente'];

/** Cambio del plan de ortodoncia (auditoría). */
export interface OrthoHistoryEntry {
  at: string;
  userName: string;
  source: 'HISTORIA' | 'CONTROL';
  changes: Array<{ field: string; label: string; from: string; to: string }>;
}

export function orthoEventLabel(event: string) {
  return ORTHO_CONTROL_EVENTS.find((e) => e.value === event)?.label || event;
}

/** Líneas legibles del control para la nota de evolución firmada. */
export function orthoControlNoteLines(c: OrthoControl, procedureLabels: Record<string, string> = {}): string[] {
  const procedures = (c.procedures || []).map((k) => procedureLabels[k] || k).join(', ');
  const fields: Array<[string, string]> = [
    ['Evento de ortodoncia', orthoEventLabel(c.event)],
    ['Procedimientos', procedures],
    ['Fase', c.phase],
    ['Arco superior', c.upperArch],
    ['Arco inferior', c.lowerArch],
    ['Elásticos', c.elastics],
    ['Activaciones', c.activations],
    ['IPR', c.ipr],
    ['Reparaciones / recementados', c.repairs],
    ['Brackets', c.brackets || ''],
    ['Ligaduras', c.ligatures || ''],
    ['Dolor', c.pain || ''],
    ['Emergencia', c.emergency || ''],
    ['Higiene', c.hygiene],
    ['Colaboración', c.cooperation],
  ];
  const lines = fields.filter(([, v]) => (v || '').trim()).map(([k, v]) => `${k}: ${v.trim()}`);
  return c.event === 'CONTROL' && lines.length === 1 ? [] : lines;
}

interface PastEvent {
  event: string;
  day: string;
}

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDay = (day: string) => day.split('-').reverse().join('/');

function pastEvents(evolutions: ClinicalEvolution[]): PastEvent[] {
  return evolutions
    .map((ev) => ({
      event: ev.content.orthoControl?.event || '',
      day: dayOf(ev.clinicalAttentionDate || ev.signedAt),
    }))
    .filter((e) => e.event && e.event !== 'CONTROL')
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Errores que impiden firmar el control: próxima cita antes de la atención o a más
 * de un año, y eventos fuera de orden (instalación → retiro → retención).
 */
export function orthoControlProblems(
  c: OrthoControl,
  attention: Date,
  nextAppointment: string,
  evolutions: ClinicalEvolution[],
): string[] {
  const out: string[] = [];
  const attentionDay = dayOf(attention.toISOString());
  if (nextAppointment) {
    const next = new Date(`${nextAppointment}T12:00:00`);
    if (Number.isNaN(next.getTime())) out.push('Próxima cita: fecha inválida.');
    else if (nextAppointment <= attentionDay) out.push('La próxima cita debe ser posterior a la fecha de atención.');
    else if (next.getTime() - attention.getTime() > 400 * 86_400_000) out.push('La próxima cita no puede ser a más de un año.');
  }
  if (c.event === 'CONTROL') return out;
  const events = pastEvents(evolutions);
  const before = events.filter((e) => e.day <= attentionDay);
  const last = (kind: string) => [...before].reverse().find((e) => e.event === kind);
  const install = last('INSTALACION');
  const debond = last('RETIRO');
  const active = !!install && (!debond || debond.day < install.day);
  if (c.event === 'INSTALACION') {
    if (active) out.push(`Ya hay una instalación activa desde el ${fmtDay(install!.day)}: registre primero el retiro.`);
    const later = events.find((e) => e.day > attentionDay);
    if (later) out.push(`Hay un evento de ortodoncia posterior (${fmtDay(later.day)}); revise la fecha de atención.`);
  }
  if (c.event === 'RETIRO' && !active) {
    out.push('No hay una instalación de aparatología registrada antes de esta fecha.');
  }
  if (c.event === 'RETENCION' && !debond) {
    out.push('La retención empieza después del retiro: registre primero el retiro de la aparatología.');
  }
  return out;
}

export interface OrthoControlRow {
  id: string;
  date: string;
  event: string;
  phase: string;
  arches: string;
  elastics: string;
  hygiene: string;
  nextAppointment: string;
  professional: string;
  cups: string;
  cooperation: string;
  ipr: string;
  repairs: string;
  pain: string;
  emergency: string;
  brackets: string;
  ligatures: string;
  eventCode: string;
  photoAttachmentId: string;
}

export interface OrthoTimeline {
  installedAt: string | null;
  debondedAt: string | null;
  months: number | null;
  rows: OrthoControlRow[];
}

/** Controles firmados, fechas de instalación / retiro y tiempo en tratamiento. */
export function orthoTreatmentTimeline(evolutions: ClinicalEvolution[], now = new Date()): OrthoTimeline {
  const rows: OrthoControlRow[] = [];
  let installedAt: string | null = null;
  let debondedAt: string | null = null;
  const sorted = [...evolutions].sort((a, b) =>
    (a.clinicalAttentionDate || a.signedAt).localeCompare(b.clinicalAttentionDate || b.signedAt),
  );
  for (const ev of sorted) {
    const c = ev.content.orthoControl;
    if (!c) continue;
    const date = ev.clinicalAttentionDate || ev.signedAt;
    if (c.event === 'INSTALACION') {
      installedAt = date;
      debondedAt = null;
    }
    if (c.event === 'RETIRO') debondedAt = date;
    rows.push({
      id: ev.id,
      date,
      event: orthoEventLabel(c.event || 'CONTROL'),
      phase: c.phase || '',
      arches: [c.upperArch && `Sup: ${c.upperArch}`, c.lowerArch && `Inf: ${c.lowerArch}`].filter(Boolean).join(' · '),
      elastics: c.elastics || '',
      hygiene: c.hygiene || '',
      nextAppointment: c.nextAppointment || '',
      professional: ev.content.professionalName || ev.author?.fullName || '',
      cups: (c.cups || []).map((x) => x.code).join(', '),
      cooperation: c.cooperation || '',
      ipr: c.ipr || '',
      repairs: c.repairs || '',
      pain: c.pain || '',
      emergency: c.emergency || '',
      brackets: c.brackets || '',
      ligatures: c.ligatures || '',
      eventCode: c.event || 'CONTROL',
      photoAttachmentId: c.photoAttachmentId || '',
    });
  }
  let months: number | null = null;
  if (installedAt) {
    const end = debondedAt ? new Date(debondedAt) : now;
    months = Math.max(0, Math.round(((end.getTime() - new Date(installedAt).getTime()) / (30.44 * 86_400_000)) * 10) / 10);
  }
  return { installedAt, debondedAt, months, rows: rows.reverse() };
}
