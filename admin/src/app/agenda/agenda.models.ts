export type AppointmentEventType = 'CITA' | 'BLOQUEO';

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'IN_WAITING'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED';

export type CareModality = 'IN_PERSON' | 'VIRTUAL';
export type PopulationGroup = 'ADULT' | 'MINOR';

export interface AppointmentPatient {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  /** Nulos mientras la ficha sea provisional (alta rápida desde la agenda). */
  documentType: string | null;
  documentNumber: string | null;
  birthDate: string | null;
  phone: string | null;
  isMinor: boolean;
  populationGroup: PopulationGroup;
  profileComplete: boolean;
}

/** Resultado del buscador de pacientes del modal de agendamiento. */
export interface PatientOption {
  id: string;
  firstName: string;
  lastName: string;
  documentType: string | null;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
  profileComplete: boolean;
  /** Ya tiene historia clínica abierta: la cita se anotará como evolución. */
  hasClinicalHistory?: boolean;
  /** El alta exprés encontró una ficha igual y la reutilizó en vez de duplicar. */
  reused?: boolean;
}

export interface AppointmentAdmission {
  id: string;
  habeasDataSigned: boolean;
  habeasDataSignedAt: string | null;
  signedByName: string | null;
  documentNumber: string | null;
}

export interface TodayAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  eventType: AppointmentEventType;
  blockReason: string | null;
  modality: CareModality;
  isTelemedicine: boolean;
  meetingUrl: string | null;
  requestDate: string | null;
  opportunityDays: number | null;
  reason: string | null;
  serviceId?: string | null;
  /** Asistente que atiende (masajes en medicina estética). */
  staff?: { id: string; name: string } | null;
  notes: string | null;
  cancelledAt: string | null;
  /** Hasta cuándo se puede reocupar la franja liberada por una cancelación. */
  slotReopenUntil: string | null;
  encounterId: string | null;
  professional: {
    id: string;
    fullName: string;
    professionalCard: string | null;
  };
  patient: AppointmentPatient | null;
  habeasDataSigned: boolean;
  /** Psicología: motivo por el que la sesión sigue sin documentar; null si está al día. */
  clinicalPending: string | null;
  /** Cita de un día anterior sin documentar: roja en la agenda. */
  clinicalOverdue: boolean;
  /** Sesión ya documentada (HC o nota de evolución del día de la cita): blanca. */
  clinicalDocumented: boolean;
  admission: AppointmentAdmission | null;
  allowedTransitions: AppointmentStatus[];
}

/** Franja de la rejilla horaria. */
export interface AgendaSlot {
  minutes: number;
  label: string;
}

/** Columna de la rejilla: un profesional (vista Día) o un día (vista Semana). */
export interface AgendaColumn {
  id: string;
  title: string;
  subtitle: string;
  /** Fecha YYYY-MM-DD a la que pertenece la columna. */
  date: string;
  /** Profesional al que se agenda si se pulsa un hueco; vacío en vista Semana. */
  professionalId: string;
  /** Asistente de la columna (medicina estética); vacío en columnas de profesional. */
  staffId?: string;
  accent: string;
}

/** Celda ya posicionada en la rejilla CSS. */
export interface AgendaCell {
  column: number;
  row: number;
  span: number;
  /**
   * `reopened`: cancelada y aún dentro de la ventana para reagendar.
   * `closed`: cancelada con la ventana vencida, la franja ya no se ofrece.
   */
  state: 'free' | 'past' | 'booked' | 'reopened' | 'closed';
  columnIndex: number;
  slotIndex: number;
  appointments: TodayAppointment[];
  /** Minutos que quedan para reocupar la franja; solo en estado `reopened`. */
  minutesLeft: number;
}

/** Colores de punto por columna, tomados de la paleta ya usada en la app. */
export const COLUMN_ACCENTS = [
  '#003d4c',
  '#0d7377',
  '#1d4e89',
  '#1d6b41',
  '#8a1f1f',
  '#a8620a',
];

export type NotificationChannel = 'WHATSAPP' | 'EMAIL';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
export type NotificationKind =
  | 'REMINDER_24H'
  | 'REMINDER_2H'
  | 'CONFIRMATION'
  | 'CANCELLATION'
  | 'MANUAL_RESEND';

export interface NotificationLogRow {
  id: string;
  channel: NotificationChannel;
  kind: NotificationKind;
  status: NotificationStatus;
  destination: string;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  REMINDER_24H: 'Recordatorio 24 h',
  REMINDER_2H: 'Recordatorio 2 h',
  CONFIRMATION: 'Agendada / confirmada',
  CANCELLATION: 'Cancelación',
  MANUAL_RESEND: 'Reenvío / reprogramación',
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Correo',
};

export type ServiceCategory = 'FACIAL' | 'CORPORAL' | 'OTRO';

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  FACIAL: 'Estética facial',
  CORPORAL: 'Estética corporal',
  OTRO: 'Otros',
};

/** Servicio del catálogo del consultorio. */
export interface ClinicServiceItem {
  id: string;
  name: string;
  category: ServiceCategory;
  subcategory: string | null;
  durationMinutes: number;
  durationNote: string | null;
  /** Null = precio a consultar. */
  price: number | null;
  description: string | null;
  procedureType: string | null;
  consentCode: string | null;
  assistantService: boolean;
  active: boolean;
  sortOrder: number;
}

export function formatCop(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Consultar';
  return value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

/** Asistente de agenda sin cuenta de usuario (estética corporal). */
export interface AgendaStaffMember {
  id: string;
  name: string;
  roleLabel: string;
  shiftStart: string;
  shiftEnd: string;
  shiftLabel: string;
  active: boolean;
  sortOrder: number;
}

/** Colores de las asistentes, como en la agenda original: esmeralda, cielo y violeta. */
export const STAFF_ACCENTS = ['#047857', '#0369a1', '#6d28d9'];

export interface AgendaProfessional {
  id: string;
  fullName: string;
  professionalCard: string | null;
  role: string;
}

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Agendada',
  CONFIRMED: 'Confirmada',
  IN_WAITING: 'En sala de espera',
  COMPLETED: 'Atendida',
  NO_SHOW: 'Inasistencia',
  CANCELLED: 'Cancelada',
};

/** Texto del botón que dispara cada transición desde la tarjeta de la cita. */
export const TRANSITION_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Reagendar',
  CONFIRMED: 'Confirmar',
  IN_WAITING: 'Pasar a sala de espera',
  COMPLETED: 'Marcar atendida',
  NO_SHOW: 'Inasistencia',
  CANCELLED: 'Cancelar',
};

export const STATUS_FILTERS: { value: AppointmentStatus | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'SCHEDULED', label: 'Agendadas' },
  { value: 'CONFIRMED', label: 'Confirmadas' },
  { value: 'IN_WAITING', label: 'En sala' },
  { value: 'COMPLETED', label: 'Atendidas' },
  { value: 'NO_SHOW', label: 'Inasistencias' },
  { value: 'CANCELLED', label: 'Canceladas' },
];
