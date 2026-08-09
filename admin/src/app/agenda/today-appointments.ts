import { DatePipe } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { AgendaApiService } from './agenda-api.service';
import {
  AgendaCell,
  AgendaColumn,
  AgendaProfessional,
  AgendaSlot,
  APPOINTMENT_STATUS_LABELS,
  AppointmentStatus,
  CareModality,
  COLUMN_ACCENTS,
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_KIND_LABELS,
  NotificationChannel,
  NotificationLogRow,
  PatientOption,
  STATUS_FILTERS,
  TRANSITION_LABELS,
  TodayAppointment,
} from './agenda.models';

const DAY_START_MINUTES = 8 * 60;
const DAY_END_MINUTES = 20 * 60;
const SLOT_MINUTES = 30;

/** Debe coincidir con CANCELLATION_REOPEN_MINUTES del backend. */
const REOPEN_MINUTES = 15;

/** YYYY-MM-DD en hora local (toISOString desplazaría el día). */
function toDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDateKey(key: string) {
  return new Date(`${key}T00:00:00`);
}

function addDays(key: string, days: number) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** Lunes de la semana a la que pertenece la fecha. */
function startOfWeek(key: string) {
  const date = parseDateKey(key);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return toDateKey(date);
}

function buildSlots(): AgendaSlot[] {
  const slots: AgendaSlot[] = [];
  for (let m = DAY_START_MINUTES; m < DAY_END_MINUTES; m += SLOT_MINUTES) {
    const at = new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
    slots.push({
      minutes: m,
      label: at.toLocaleTimeString('es-CO', {
        hour: 'numeric',
        minute: '2-digit',
      }),
    });
  }
  return slots;
}

@Component({
  selector: 'app-today-appointments',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './today-appointments.html',
  styleUrl: './today-appointments.scss',
})
export class TodayAppointmentsDashboard implements OnInit, OnDestroy {
  private readonly api = inject(AgendaApiService);
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
  readonly canManage = this.auth.canManageAgenda;

  readonly statusLabels = APPOINTMENT_STATUS_LABELS;
  readonly transitionLabels = TRANSITION_LABELS;
  readonly statusFilters = STATUS_FILTERS;
  readonly notificationKindLabels = NOTIFICATION_KIND_LABELS;
  readonly channelLabels = NOTIFICATION_CHANNEL_LABELS;

  readonly loading = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly appointments = signal<TodayAppointment[]>([]);
  readonly busyId = signal<string | null>(null);

  /** Bitácora de recordatorios por cita; se carga al desplegar el panel. */
  readonly noticesFor = signal<string | null>(null);
  readonly notices = signal<NotificationLogRow[]>([]);
  readonly noticesLoading = signal(false);
  readonly resending = signal<NotificationChannel | null>(null);

  /** Cita en proceso de cancelación: falta decidir si se reagenda. */
  readonly cancelFor = signal<TodayAppointment | null>(null);
  cancelReason = '';

  /** Cita que disparó el bloqueo por Habeas Data y abrió el modal de admisión. */
  readonly admissionFor = signal<TodayAppointment | null>(null);
  admissionName = '';
  admissionDocument = '';

  q = '';
  statusFilter: AppointmentStatus | '' = '';
  readonly date = signal(toDateKey(new Date()));

  // Rejilla horaria
  readonly viewMode = signal<'grid' | 'list'>('grid');
  readonly rangeMode = signal<'day' | 'week'>('day');
  readonly selected = signal<TodayAppointment | null>(null);
  readonly slots = buildSlots();

  /** Reloj que hace vencer la ventana de reagendamiento sin recargar. */
  readonly now = signal(Date.now());
  private clock?: ReturnType<typeof setInterval>;

  // Agendamiento
  readonly showBooking = signal(false);
  readonly booking = signal(false);
  readonly professionals = signal<AgendaProfessional[]>([]);

  /** Día sobre el que se agenda; en vista Semana no coincide con el día visible. */
  readonly bookingDate = signal(toDateKey(new Date()));
  readonly patientTab = signal<'search' | 'new'>('search');
  readonly patientResults = signal<PatientOption[]>([]);
  readonly patientSearching = signal(false);
  readonly selectedPatient = signal<PatientOption | null>(null);
  readonly creatingPatient = signal(false);
  patientQuery = '';
  newPatient = {
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    documentNumber: '',
  };

  bookingForm: {
    professionalId: string;
    time: string;
    durationMinutes: number;
    modality: CareModality;
    meetingUrl: string;
    notes: string;
  } = this.emptyBookingForm();

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private patientTimer: ReturnType<typeof setTimeout> | null = null;

  private emptyBookingForm() {
    return {
      professionalId: '',
      time: '08:00',
      durationMinutes: 40,
      modality: 'IN_PERSON' as CareModality,
      meetingUrl: '',
      notes: '',
    };
  }

  /** Subtítulo del modal: "sábado 9 de agosto · 08:00 – 08:30". */
  bookingSlotLabel() {
    const [hour, minute] = this.bookingForm.time.split(':').map(Number);
    const start = parseDateKey(this.bookingDate());
    start.setHours(hour || 0, minute || 0);
    const end = new Date(start.getTime() + this.bookingForm.durationMinutes * 60000);
    const time = (at: Date) =>
      at.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const day = start.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return `${day} · ${time(start)} – ${time(end)}`;
  }

  /** Lunes a domingo de la semana visible; alimenta la tira superior y la vista Semana. */
  readonly weekDays = computed(() => {
    const monday = startOfWeek(this.date());
    return Array.from({ length: 7 }, (_, i) => {
      const key = addDays(monday, i);
      const at = parseDateKey(key);
      return {
        key,
        weekday: at.toLocaleDateString('es-CO', { weekday: 'short' }).toUpperCase(),
        dayNumber: at.getDate(),
      };
    });
  });

  readonly periodLabel = computed(() => {
    if (this.rangeMode() === 'day') {
      return parseDateKey(this.date()).toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    const days = this.weekDays();
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return `${parseDateKey(days[0].key).toLocaleDateString('es-CO', opts)} — ${parseDateKey(
      days[6].key,
    ).toLocaleDateString('es-CO', opts)}`;
  });

  /** En vista Día una columna por profesional; en Semana una por día. */
  readonly columns = computed<AgendaColumn[]>(() => {
    if (this.rangeMode() === 'week') {
      return this.weekDays().map((day, index) => ({
        id: day.key,
        title: `${day.weekday} ${day.dayNumber}`,
        subtitle: '',
        date: day.key,
        professionalId: '',
        accent: COLUMN_ACCENTS[index % COLUMN_ACCENTS.length],
      }));
    }

    const date = this.date();
    return this.professionals().map((pro, index) => ({
      id: pro.id,
      title: pro.fullName,
      subtitle: pro.professionalCard ? `TP ${pro.professionalCard}` : pro.role,
      date,
      professionalId: pro.id,
      accent: COLUMN_ACCENTS[index % COLUMN_ACCENTS.length],
    }));
  });

  /**
   * Coloca cada cita en la rejilla CSS. En vista Día se estira según duración
   * (el backend impide solapes por profesional); en Semana se agrupa por franja
   * porque varios profesionales pueden coincidir en la misma hora.
   */
  readonly cells = computed<AgendaCell[]>(() => {
    const columns = this.columns();
    const slots = this.slots;
    const byWeek = this.rangeMode() === 'week';
    const now = this.now();
    const out: AgendaCell[] = [];

    columns.forEach((column, columnIndex) => {
      const occupied = new Set<number>();
      const booked = new Map<number, TodayAppointment[]>();

      for (const appt of this.appointments()) {
        const startsAt = new Date(appt.startsAt);
        if (toDateKey(startsAt) !== column.date) continue;
        if (!byWeek && appt.professional.id !== column.professionalId) continue;

        const minutes = startsAt.getHours() * 60 + startsAt.getMinutes();
        const slotIndex = Math.floor((minutes - DAY_START_MINUTES) / SLOT_MINUTES);
        if (slotIndex < 0 || slotIndex >= slots.length) continue;

        const existing = booked.get(slotIndex);
        if (existing) {
          existing.push(appt);
          continue;
        }
        booked.set(slotIndex, [appt]);
      }

      for (const [slotIndex, appts] of booked) {
        const span = byWeek ? 1 : this.slotSpan(appts[0], slotIndex, slots.length);
        const reopenUntil = this.reopenUntil(appts, now);
        out.push({
          column: columnIndex + 2,
          // La fila 1 la ocupa la cabecera pegajosa de columnas.
          row: slotIndex + 2,
          span,
          state:
            reopenUntil === null
              ? 'booked'
              : reopenUntil > now
                ? 'reopened'
                : 'closed',
          columnIndex,
          slotIndex,
          appointments: appts,
          minutesLeft:
            reopenUntil && reopenUntil > now
              ? Math.max(1, Math.ceil((reopenUntil - now) / 60_000))
              : 0,
        });
        for (let i = slotIndex; i < slotIndex + span; i++) occupied.add(i);
      }

      slots.forEach((slot, slotIndex) => {
        if (occupied.has(slotIndex)) return;
        const at = parseDateKey(column.date);
        at.setMinutes(slot.minutes);
        out.push({
          column: columnIndex + 2,
          row: slotIndex + 2,
          span: 1,
          state: at.getTime() < now ? 'past' : 'free',
          columnIndex,
          slotIndex,
          appointments: [],
          minutesLeft: 0,
        });
      });
    });

    return out;
  });

  /**
   * Fin de la ventana para reocupar una franja cancelada, o `null` si la franja
   * sigue ocupada por alguna cita viva.
   */
  private reopenUntil(appts: TodayAppointment[], now: number) {
    let latest: number | null = null;
    for (const appt of appts) {
      if (appt.status !== 'CANCELLED') return null;
      const until = appt.slotReopenUntil
        ? new Date(appt.slotReopenUntil).getTime()
        : now - 1;
      if (latest === null || until > latest) latest = until;
    }
    return latest;
  }

  /** Cuántas franjas ocupa la cita, sin desbordar el final de la jornada. */
  private slotSpan(appt: TodayAppointment, slotIndex: number, total: number) {
    const minutes =
      (new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime()) /
      60000;
    const span = Math.max(1, Math.round(minutes / SLOT_MINUTES));
    return Math.min(span, total - slotIndex);
  }

  /** Citas del día visible, en orden, para el panel lateral. */
  readonly dayAgenda = computed(() =>
    [...this.appointments()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  );

  readonly counters = computed(() => {
    const rows = this.appointments();
    return {
      total: rows.length,
      inWaiting: rows.filter((a) => a.status === 'IN_WAITING').length,
      completed: rows.filter((a) => a.status === 'COMPLETED').length,
      pendingHabeas: rows.filter(
        (a) => !a.habeasDataSigned && a.status !== 'CANCELLED',
      ).length,
    };
  });

  ngOnInit() {
    this.refresh();
    this.clock = setInterval(() => this.now.set(Date.now()), 20_000);
    if (this.canManage()) {
      this.api.listProfessionals().subscribe({
        next: (rows) => {
          this.professionals.set(rows);
          const me = rows.find((p) => p.id === this.user()?.id);
          this.bookingForm.professionalId = me?.id || rows[0]?.id || '';
        },
        error: () => undefined,
      });
    }
  }

  ngOnDestroy() {
    clearInterval(this.clock);
  }

  setView(mode: 'grid' | 'list') {
    this.viewMode.set(mode);
  }

  setRange(mode: 'day' | 'week') {
    if (this.rangeMode() === mode) return;
    this.rangeMode.set(mode);
    this.selected.set(null);
    this.refresh();
  }

  setDate(value: string) {
    if (!value) return;
    this.date.set(value);
    this.selected.set(null);
    this.refresh();
  }

  /** Retrocede o avanza un día o una semana según la vista activa. */
  shiftPeriod(direction: -1 | 1) {
    const step = this.rangeMode() === 'week' ? 7 : 1;
    this.setDate(addDays(this.date(), direction * step));
  }

  goToday() {
    this.setDate(toDateKey(new Date()));
  }

  isToday(key: string) {
    return key === toDateKey(new Date());
  }

  /** Hueco libre: abre el agendamiento con profesional, día y hora ya puestos. */
  openSlot(cell: AgendaCell) {
    if (!this.canManage()) return;
    if (cell.state !== 'free' && cell.state !== 'reopened') return;
    const column = this.columns()[cell.columnIndex];
    const slot = this.slots[cell.slotIndex];
    if (!column || !slot) return;

    const hour = String(Math.floor(slot.minutes / 60)).padStart(2, '0');
    const minute = String(slot.minutes % 60).padStart(2, '0');

    this.bookingForm = {
      ...this.emptyBookingForm(),
      professionalId:
        column.professionalId ||
        this.defaultProfessionalId() ||
        this.bookingForm.professionalId,
      time: `${hour}:${minute}`,
    };
    this.bookingDate.set(column.date);
    this.openBooking();
  }

  private defaultProfessionalId() {
    const rows = this.professionals();
    return rows.find((p) => p.id === this.user()?.id)?.id || rows[0]?.id || '';
  }

  private openBooking() {
    this.patientTab.set('search');
    this.patientQuery = '';
    this.patientResults.set([]);
    this.selectedPatient.set(null);
    this.newPatient = {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      documentNumber: '',
    };
    this.message.set('');
    this.error.set('');
    this.showBooking.set(true);
  }

  closeBooking() {
    this.showBooking.set(false);
    this.booking.set(false);
  }

  setPatientTab(tab: 'search' | 'new') {
    this.patientTab.set(tab);
    this.error.set('');
  }

  onPatientQueryChange() {
    if (this.patientTimer) clearTimeout(this.patientTimer);
    const term = this.patientQuery.trim();
    if (term.length < 2) {
      this.patientResults.set([]);
      this.patientSearching.set(false);
      return;
    }
    this.patientSearching.set(true);
    this.patientTimer = setTimeout(() => {
      this.api.searchPatients(term).subscribe({
        next: (rows) => {
          this.patientResults.set(rows);
          this.patientSearching.set(false);
        },
        error: () => this.patientSearching.set(false),
      });
    }, 300);
  }

  choosePatient(patient: PatientOption) {
    this.selectedPatient.set(patient);
    this.patientResults.set([]);
    this.patientQuery = '';
  }

  clearPatient() {
    this.selectedPatient.set(null);
  }

  patientLabel(patient: PatientOption) {
    return `${patient.firstName} ${patient.lastName}`.replace(/\s+/g, ' ').trim();
  }

  /** Alta exprés: deja la ficha lista para agendar y la selecciona en el modal. */
  registerPatient() {
    const form = this.newPatient;
    if (!form.firstName.trim() || !form.lastName.trim()) {
      this.error.set('Nombre y apellido son obligatorios.');
      return;
    }
    if (form.phone.replace(/\D/g, '').length < 7) {
      this.error.set('Ingrese un teléfono de contacto válido.');
      return;
    }

    this.creatingPatient.set(true);
    this.error.set('');
    this.api
      .quickCreatePatient({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        documentNumber: form.documentNumber.trim() || undefined,
      })
      .subscribe({
        next: (patient) => {
          this.creatingPatient.set(false);
          this.selectedPatient.set(patient);
          this.patientTab.set('search');
          this.newPatient = {
            firstName: '',
            lastName: '',
            phone: '',
            email: '',
            documentNumber: '',
          };
          if (patient.reused) {
            this.message.set(
              `${this.patientLabel(patient)} ya estaba registrado: se usa su ficha y su historia clínica existentes.`,
            );
          }
        },
        error: (err) => {
          this.creatingPatient.set(false);
          this.error.set(
            this.describeError(err, 'No se pudo registrar el paciente.'),
          );
        },
      });
  }

  chooseProfessional(id: string) {
    this.bookingForm.professionalId = id;
  }

  /** Mismo color que la columna del profesional en la rejilla. */
  accentFor(index: number) {
    return COLUMN_ACCENTS[index % COLUMN_ACCENTS.length];
  }

  /**
   * Mensaje de error con la causa real. Sin esto un fallo de red y uno de
   * validación se ven igual y no hay forma de saber qué pasó.
   */
  private describeError(err: unknown, fallback: string) {
    const e = err as { status?: number; error?: { message?: string | string[] } };
    const detail = e?.error?.message;
    const text = Array.isArray(detail) ? detail.join(', ') : detail;
    if (!e?.status) {
      return `${fallback} La petición no llegó al servidor tras varios intentos; revise la pestaña Red del navegador y el log de la API.`;
    }
    if (e.status === 401) {
      return 'La sesión expiró. Vuelva a iniciar sesión.';
    }
    return text ? `${text} (HTTP ${e.status})` : `${fallback} (HTTP ${e.status})`;
  }

  selectAppointment(appointment: TodayAppointment) {
    this.selected.set(
      this.selected()?.id === appointment.id ? null : appointment,
    );
  }

  /** Botón "Nueva cita": abre el modal sobre el día visible sin hueco concreto. */
  toggleBooking() {
    if (this.showBooking()) {
      this.closeBooking();
      return;
    }
    this.bookingForm = {
      ...this.emptyBookingForm(),
      professionalId: this.defaultProfessionalId(),
    };
    this.bookingDate.set(this.date());
    this.openBooking();
  }

  isVirtualBooking() {
    return this.bookingForm.modality === 'VIRTUAL';
  }

  createAppointment() {
    const form = this.bookingForm;
    const patient = this.selectedPatient();
    if (!patient) {
      this.error.set('Seleccione o registre un paciente.');
      return;
    }
    if (!form.professionalId) {
      this.error.set('Seleccione quién atiende.');
      return;
    }

    const startsAt = new Date(`${this.bookingDate()}T${form.time}:00`);
    if (Number.isNaN(startsAt.getTime())) {
      this.error.set('Hora inválida.');
      return;
    }

    this.booking.set(true);
    this.error.set('');
    this.message.set('');

    this.api
      .create({
        patientId: patient.id,
        professionalId: form.professionalId,
        startsAt: startsAt.toISOString(),
        durationMinutes: Number(form.durationMinutes) || 40,
        modality: form.modality,
        meetingUrl: this.isVirtualBooking()
          ? form.meetingUrl || undefined
          : undefined,
        notes: form.notes || undefined,
      })
      .subscribe({
        next: (created) => {
          this.booking.set(false);
          this.showBooking.set(false);
          this.message.set(`Cita agendada para ${created.patient.fullName}.`);
          this.refresh();
        },
        error: (err) => {
          this.booking.set(false);
          this.error.set(
            err?.error?.code === 'SLOT_TAKEN'
              ? err.error.message
              : this.describeError(err, 'No se pudo agendar la cita.'),
          );
        },
      });
  }

  refresh() {
    this.loading.set(true);
    this.error.set('');
    const week = this.rangeMode() === 'week' ? this.weekDays() : null;
    this.api
      .listToday({
        q: this.q.trim() || undefined,
        status: this.statusFilter || undefined,
        ...(week
          ? { from: week[0].key, to: week[6].key }
          : { date: this.date() }),
      })
      .subscribe({
        next: (rows) => {
          this.appointments.set(rows);
          // La cita del panel debe seguir el estado real, no el de la carga previa.
          const current = this.selected();
          if (current) {
            this.selected.set(rows.find((r) => r.id === current.id) ?? null);
          }
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(
            this.describeError(err, 'No se pudo cargar la agenda del día.'),
          );
        },
      });
  }

  onSearchChange() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.refresh(), 250);
  }

  setStatusFilter(value: AppointmentStatus | '') {
    this.statusFilter = value;
    this.refresh();
  }

  changeStatus(appointment: TodayAppointment, target: AppointmentStatus) {
    if (!this.canManage()) return;
    // Cancelar obliga a decidir qué pasa con el paciente: se pregunta antes.
    if (target === 'CANCELLED') {
      this.openCancel(appointment);
      return;
    }
    this.applyStatus(appointment, target);
  }

  private applyStatus(
    appointment: TodayAppointment,
    target: AppointmentStatus,
    reason?: string,
    onDone?: () => void,
  ) {
    this.busyId.set(appointment.id);
    this.error.set('');
    this.message.set('');

    this.api.updateStatus(appointment.id, target, reason).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.applyUpdate(updated);
        this.message.set(
          target === 'IN_WAITING' && updated.encounterId
            ? 'Paciente en sala de espera. Borrador de historia clínica creado.'
            : `Cita actualizada a ${this.statusLabels[target]}.`,
        );
        onDone?.();
      },
      error: (err) => {
        this.busyId.set(null);
        if (err?.error?.code === 'HABEAS_DATA_REQUIRED') {
          this.openAdmission(appointment);
          return;
        }
        // Puede ser que otro usuario ya cambiara el estado: resincronizamos
        // antes de escribir el mensaje, porque refresh() limpia el banner.
        this.refresh();
        this.error.set(
          this.describeError(err, 'No se pudo actualizar el estado de la cita.'),
        );
      },
    });
  }

  openCancel(appointment: TodayAppointment) {
    this.cancelFor.set(appointment);
    this.cancelReason = '';
    this.error.set('');
    this.message.set('');
  }

  closeCancel() {
    this.cancelFor.set(null);
  }

  /**
   * Cancela y, si se pide, deja el modal de agendamiento listo con el mismo
   * paciente para darle una hora nueva sin volver a buscarlo.
   */
  confirmCancel(reschedule: boolean) {
    const appointment = this.cancelFor();
    if (!appointment) return;
    const reason = this.cancelReason.trim();
    this.closeCancel();

    this.applyStatus(appointment, 'CANCELLED', reason || undefined, () => {
      if (!reschedule) return;
      this.startReschedule(appointment);
      this.message.set(
        `Cita cancelada. Elija la nueva fecha y hora para ${appointment.patient.fullName}.`,
      );
    });
  }

  /** Deja el modal listo con el mismo paciente para darle una hora nueva. */
  startReschedule(appointment: TodayAppointment) {
    const startsAt = new Date(appointment.startsAt);
    const hour = String(startsAt.getHours()).padStart(2, '0');
    const minute = String(startsAt.getMinutes()).padStart(2, '0');

    this.bookingForm = {
      ...this.emptyBookingForm(),
      professionalId: appointment.professional.id,
      time: `${hour}:${minute}`,
      modality: (appointment.isTelemedicine
        ? 'VIRTUAL'
        : 'IN_PERSON') as CareModality,
      notes: appointment.reason ?? '',
    };
    this.bookingDate.set(toDateKey(startsAt));
    this.openBooking();
    this.selectedPatient.set({
      id: appointment.patient.id,
      firstName: appointment.patient.firstName,
      lastName: appointment.patient.lastName,
      documentType: appointment.patient.documentType,
      documentNumber: appointment.patient.documentNumber,
      phone: appointment.patient.phone,
      email: null,
      profileComplete: appointment.patient.profileComplete,
    });
    this.message.set(
      `Elija la nueva fecha y hora para ${appointment.patient.fullName}.`,
    );
  }

  openAdmission(appointment: TodayAppointment) {
    this.admissionFor.set(appointment);
    this.admissionName = appointment.patient.fullName;
    this.admissionDocument = appointment.patient.documentNumber ?? '';
    this.error.set(
      'Falta la autorización de tratamiento de datos (Ley 1581). Complete la admisión.',
    );
  }

  closeAdmission() {
    this.admissionFor.set(null);
  }

  /** Registra el Habeas Data y reintenta el pase a sala de espera. */
  confirmAdmission() {
    const appointment = this.admissionFor();
    if (!appointment) return;
    this.busyId.set(appointment.id);

    this.api
      .registerAdmission(appointment.id, {
        habeasDataSigned: true,
        signedByName: this.admissionName || undefined,
        documentNumber: this.admissionDocument || undefined,
      })
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.closeAdmission();
          this.error.set('');
          this.applyStatus(appointment, 'IN_WAITING');
        },
        error: (err) => {
          this.busyId.set(null);
          this.error.set(
            this.describeError(err, 'No se pudo registrar la admisión.'),
          );
        },
      });
  }

  toggleNotices(appointment: TodayAppointment) {
    if (this.noticesFor() === appointment.id) {
      this.noticesFor.set(null);
      return;
    }
    this.noticesFor.set(appointment.id);
    this.notices.set([]);
    this.loadNotices(appointment.id);
  }

  private loadNotices(appointmentId: string) {
    this.noticesLoading.set(true);
    this.api.listNotifications(appointmentId).subscribe({
      next: (rows) => {
        this.notices.set(rows);
        this.noticesLoading.set(false);
      },
      error: () => {
        this.notices.set([]);
        this.noticesLoading.set(false);
      },
    });
  }

  resend(appointment: TodayAppointment, channel: NotificationChannel) {
    if (!this.canManage()) return;
    this.resending.set(channel);
    this.error.set('');
    this.message.set('');

    this.api.resendNotification(appointment.id, channel).subscribe({
      next: (rows) => {
        this.resending.set(null);
        this.noticesFor.set(appointment.id);
        this.notices.set(rows);
        this.message.set(
          `Recordatorio reenviado por ${this.channelLabels[channel]}.`,
        );
      },
      error: (err) => {
        this.resending.set(null);
        this.error.set(
          err?.error?.message ||
            `No se pudo reenviar el recordatorio por ${this.channelLabels[channel]}.`,
        );
      },
    });
  }

  joinMeeting(appointment: TodayAppointment) {
    if (!appointment.meetingUrl) return;
    window.open(appointment.meetingUrl, '_blank', 'noopener');
  }

  private applyUpdate(updated: TodayAppointment) {
    this.appointments.set(
      this.appointments().map((a) => (a.id === updated.id ? updated : a)),
    );
    if (this.selected()?.id === updated.id) this.selected.set(updated);
  }
}
