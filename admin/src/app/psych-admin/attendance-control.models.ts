export type AttendanceModality = '' | 'PRESENCIAL' | 'VIRTUAL';
export type AttendanceStatus = '' | 'ASIGNADA' | 'ASISTIO' | 'NO_ASISTIO' | 'REPROGRAMADA';

export interface AttendanceRow {
  date: string;
  time: string;
  modality: AttendanceModality;
  status: AttendanceStatus;
  nextDate: string;
}

export interface AttendanceControlData {
  clinicName: string;
  registeredAt: string;
  general: { userName: string; identification: string; professional: string; site: string };
  rows: AttendanceRow[];
  certificate: {
    assigned: boolean;
    attended: boolean;
    date: string;
    time: string;
    place: string;
    issuedAt: string;
    responsible: string;
  };
  notes: string;
}

export interface AttendanceDraft {
  patientId: string | null;
  data: AttendanceControlData;
}

export interface AttendanceSaved extends AttendanceDraft {
  id: string;
  patientName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceListItem {
  id: string;
  patientId: string | null;
  patientName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendancePatientHit {
  id: string;
  fullName: string;
  document: string;
}

export const FORM_CODE = 'PSI-ADM-01';
export const FORM_VERSION = '01';
export const FORM_FOOTER = 'Documento administrativo. No incluir diagnósticos ni contenido de las sesiones.';
export const MIN_ROWS = 6;
export const MAX_ROWS = 120;

export const MODALITIES: Array<{ key: AttendanceModality; label: string }> = [
  { key: 'PRESENCIAL', label: 'Presencial' },
  { key: 'VIRTUAL', label: 'Virtual' },
];

export const STATUSES: Array<{ key: AttendanceStatus; label: string }> = [
  { key: 'ASIGNADA', label: 'Asignada' },
  { key: 'ASISTIO', label: 'Asistió' },
  { key: 'NO_ASISTIO', label: 'No asistió' },
  { key: 'REPROGRAMADA', label: 'Reprogramada' },
];

export const emptyRow = (): AttendanceRow => ({ date: '', time: '', modality: '', status: '', nextDate: '' });

/** AAAA-MM-DD → DD/MM/AAAA. */
export function fmtDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** HH:MM (24 h) → «3:00 p. m.». */
export function fmtTime(v: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(v || '');
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** Campos obligatorios para emitir la constancia (solo si se marca alguna casilla). Mismas reglas que el servidor. */
export function certificateErrors(d: AttendanceControlData): Record<string, string> {
  const c = d.certificate;
  if (!c.assigned && !c.attended) return {};
  const need: Array<[string, string, string]> = [
    ['general.userName', d.general.userName, 'Escriba el nombre del usuario.'],
    ['general.identification', d.general.identification, 'Escriba la identificación o el código.'],
    ['general.professional', d.general.professional, 'Escriba el nombre del profesional.'],
    ['general.site', d.general.site, 'Escriba el consultorio o la sede.'],
    ['certificate.date', c.date, 'Indique la fecha de la cita.'],
    ['certificate.time', c.time, 'Indique la hora de la cita.'],
    ['certificate.place', c.place, 'Indique el lugar o el enlace.'],
    ['certificate.issuedAt', c.issuedAt, 'Indique la fecha de emisión.'],
    ['certificate.responsible', c.responsible, 'Escriba el responsable del registro.'],
  ];
  return Object.fromEntries(need.filter(([, v]) => !String(v || '').trim()).map(([k, , msg]) => [k, msg]));
}
