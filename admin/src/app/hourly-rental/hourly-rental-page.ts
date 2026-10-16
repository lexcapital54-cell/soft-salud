import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { HabIcon } from '../habilitation/hab-icon';
import {
  ClinicRoom,
  HourlyBooking,
  HourlyBookingStatus,
  HourlyProfessional,
  HourlyRentalApiService,
  HourlyRentalSettings,
} from './hourly-rental-api.service';

type Tab = 'calendario' | 'lista' | 'salas' | 'cupos';

const STATUS_LABELS: Record<HourlyBookingStatus, string> = {
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOUR_START = 7;
const HOUR_END = 21;
const COLORS = ['#0d7377', '#1a5276', '#6c3483', '#922b21', '#1e8449', '#b9770e', '#1f618d'];

@Component({
  selector: 'app-hourly-rental-page',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, HabIcon],
  templateUrl: './hourly-rental-page.html',
  styleUrl: './hourly-rental-page.scss',
})
export class HourlyRentalPage implements OnInit {
  private readonly api = inject(HourlyRentalApiService);
  private readonly auth = inject(AuthService);

  readonly isAdmin = this.auth.isClinicAdmin;
  readonly isReceptionist = this.auth.isReceptionist;
  readonly tab = signal<Tab>('calendario');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly showForm = signal(false);

  readonly rooms = signal<ClinicRoom[]>([]);
  readonly professionals = signal<HourlyProfessional[]>([]);
  readonly bookings = signal<HourlyBooking[]>([]);
  readonly settings = signal<HourlyRentalSettings | null>(null);

  /** Lunes de la semana visible. */
  readonly weekStart = signal(this.startOfWeek(new Date()));

  readonly statusLabels = STATUS_LABELS;
  readonly dayLabels = DAY_LABELS;
  readonly hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

  filterProfessionalId = '';

  bookingForm = {
    id: '' as string,
    professionalId: '',
    roomId: '',
    startLocal: '',
    endLocal: '',
    notes: '',
    status: 'CONFIRMED' as HourlyBookingStatus,
  };

  roomForm = {
    id: '' as string,
    name: '',
    code: '',
    capacity: 1,
    notes: '',
  };

  settingsForm = {
    hourlyMaxConcurrentRooms: 1,
    hourlyMaxHoursPerMonth: 50,
  };

  readonly activeRooms = computed(() => this.rooms().filter((r) => r.isActive));
  readonly weekDays = computed(() => {
    const start = this.weekStart();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  });
  readonly weekLabel = computed(() => {
    const days = this.weekDays();
    const a = days[0];
    const b = days[6];
    const fmt = (d: Date) =>
      d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${fmt(a)} — ${fmt(b)}`;
  });

  ngOnInit() {
    this.reloadAll();
  }

  setTab(tab: Tab) {
    this.tab.set(tab);
    this.error.set('');
    this.notice.set('');
    this.showForm.set(false);
  }

  logout() {
    this.auth.logoutToClinicLogin();
  }

  shiftWeek(delta: number) {
    const d = new Date(this.weekStart());
    d.setDate(d.getDate() + delta * 7);
    this.weekStart.set(d);
    this.reloadBookings();
  }

  goThisWeek() {
    this.weekStart.set(this.startOfWeek(new Date()));
    this.reloadBookings();
  }

  reloadAll() {
    this.loading.set(true);
    this.error.set('');
    let pending = 4;
    const done = () => {
      pending -= 1;
      if (pending <= 0) this.loading.set(false);
    };
    this.api.getSettings().subscribe({
      next: (s) => {
        this.settings.set(s);
        this.settingsForm = {
          hourlyMaxConcurrentRooms: s.hourlyMaxConcurrentRooms,
          hourlyMaxHoursPerMonth: s.hourlyMaxHoursPerMonth,
        };
        done();
      },
      error: (err) => {
        this.error.set(this.msg(err, 'No se pudo cargar la configuración.'));
        done();
      },
    });
    this.api.listRooms().subscribe({
      next: (rows) => {
        this.rooms.set(rows);
        done();
      },
      error: (err) => {
        this.error.set(this.msg(err, 'No se pudieron cargar las salas.'));
        done();
      },
    });
    this.reloadProfessionals(done);
    this.reloadBookings(done);
  }

  reloadProfessionals(onDone?: () => void) {
    const month = this.toMonthKey(this.weekStart());
    this.api.listHourlyProfessionals(month).subscribe({
      next: (rows) => {
        this.professionals.set(rows);
        onDone?.();
      },
      error: (err) => {
        this.error.set(this.msg(err, 'No se pudieron cargar los profesionales.'));
        onDone?.();
      },
    });
  }

  reloadBookings(onDone?: () => void) {
    const days = this.weekDays();
    const from = new Date(days[0]);
    from.setHours(0, 0, 0, 0);
    const to = new Date(days[6]);
    to.setHours(23, 59, 59, 999);
    this.api
      .listBookings({
        professionalId: this.filterProfessionalId || undefined,
        from: from.toISOString(),
        to: to.toISOString(),
      })
      .subscribe({
        next: (rows) => {
          this.bookings.set(rows);
          onDone?.();
        },
        error: (err) => {
          this.error.set(this.msg(err, 'No se pudieron cargar las reservas.'));
          onDone?.();
        },
      });
  }

  /** Eventos visibles en una celda día+hora (para la grilla). */
  eventsAt(day: Date, hour: number): HourlyBooking[] {
    const slotStart = new Date(day);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(day);
    slotEnd.setHours(hour + 1, 0, 0, 0);
    return this.bookings().filter((b) => {
      if (b.status === 'CANCELLED') return false;
      const s = new Date(b.startTime).getTime();
      const e = new Date(b.endTime).getTime();
      return s < slotEnd.getTime() && e > slotStart.getTime();
    });
  }

  /** Solo el bloque que empieza en esta hora (evita repetir en cada fila). */
  eventsStartingAt(day: Date, hour: number): HourlyBooking[] {
    return this.eventsAt(day, hour).filter((b) => {
      const s = new Date(b.startTime);
      return (
        s.getFullYear() === day.getFullYear() &&
        s.getMonth() === day.getMonth() &&
        s.getDate() === day.getDate() &&
        s.getHours() === hour
      );
    });
  }

  eventStyle(b: HourlyBooking) {
    const start = new Date(b.startTime);
    const end = new Date(b.endTime);
    const minutes = Math.max(30, (end.getTime() - start.getTime()) / 60_000);
    const top = (start.getMinutes() / 60) * 100;
    const height = (minutes / 60) * 100;
    const color = this.colorFor(b.professionalId);
    return {
      top: `${top}%`,
      height: `${Math.min(height, 400)}%`,
      background: color,
    };
  }

  colorFor(professionalId: string) {
    let h = 0;
    for (let i = 0; i < professionalId.length; i++) h = (h + professionalId.charCodeAt(i) * (i + 1)) % COLORS.length;
    return COLORS[h];
  }

  openCreate(day?: Date, hour?: number) {
    const start = day ? new Date(day) : new Date();
    if (hour !== undefined) start.setHours(hour, 0, 0, 0);
    else {
      start.setMinutes(0, 0, 0);
      if (start.getHours() < HOUR_START) start.setHours(HOUR_START);
    }
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    this.bookingForm = {
      id: '',
      professionalId: this.professionals()[0]?.id || '',
      roomId: this.activeRooms()[0]?.id || '',
      startLocal: this.toLocalInput(start),
      endLocal: this.toLocalInput(end),
      notes: '',
      status: 'CONFIRMED',
    };
    this.showForm.set(true);
    this.error.set('');
    this.notice.set('');
  }

  openEdit(b: HourlyBooking, ev?: Event) {
    ev?.stopPropagation();
    this.bookingForm = {
      id: b.id,
      professionalId: b.professionalId,
      roomId: b.roomId || '',
      startLocal: this.toLocalInput(new Date(b.startTime)),
      endLocal: this.toLocalInput(new Date(b.endTime)),
      notes: b.notes || '',
      status: b.status,
    };
    this.showForm.set(true);
    this.error.set('');
  }

  closeForm() {
    this.showForm.set(false);
  }

  saveBooking() {
    if (!this.bookingForm.professionalId) {
      this.error.set('Seleccione el profesional.');
      return;
    }
    if (!this.bookingForm.startLocal || !this.bookingForm.endLocal) {
      this.error.set('Indique inicio y fin.');
      return;
    }
    const startTime = this.localToIso(this.bookingForm.startLocal);
    const endTime = this.localToIso(this.bookingForm.endLocal);
    if (!startTime || !endTime || new Date(startTime) >= new Date(endTime)) {
      this.error.set('La hora de fin debe ser posterior al inicio.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    if (this.bookingForm.id) {
      this.api
        .updateBooking(this.bookingForm.id, {
          roomId: this.bookingForm.roomId || null,
          startTime,
          endTime,
          notes: this.bookingForm.notes.trim() || null,
          status: this.bookingForm.status,
        })
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.notice.set('Reserva actualizada.');
            this.showForm.set(false);
            this.reloadBookings();
            this.reloadProfessionals();
          },
          error: (err) => {
            this.saving.set(false);
            this.error.set(this.msg(err, 'No se pudo actualizar la reserva.'));
          },
        });
      return;
    }
    this.api
      .createBooking({
        professionalId: this.bookingForm.professionalId,
        roomId: this.bookingForm.roomId || undefined,
        startTime,
        endTime,
        notes: this.bookingForm.notes.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notice.set('Reserva programada en el calendario.');
          this.showForm.set(false);
          this.reloadBookings();
          this.reloadProfessionals();
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(this.msg(err, 'No se pudo crear la reserva.'));
        },
      });
  }

  setBookingStatus(booking: HourlyBooking, status: HourlyBookingStatus) {
    this.saving.set(true);
    this.api.updateBooking(booking.id, { status }).subscribe({
      next: () => {
        this.saving.set(false);
        this.notice.set(`Reserva marcada como «${STATUS_LABELS[status]}».`);
        this.reloadBookings();
        this.reloadProfessionals();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(this.msg(err, 'No se pudo actualizar la reserva.'));
      },
    });
  }

  editRoom(room?: ClinicRoom) {
    if (room) {
      this.roomForm = {
        id: room.id,
        name: room.name,
        code: room.code || '',
        capacity: room.capacity || 1,
        notes: room.notes || '',
      };
    } else {
      this.roomForm = { id: '', name: '', code: '', capacity: 1, notes: '' };
    }
  }

  saveRoom() {
    if (!this.isAdmin()) return;
    const name = this.roomForm.name.trim();
    if (!name) {
      this.error.set('Escriba el nombre de la sala.');
      return;
    }
    this.saving.set(true);
    const body = {
      name,
      code: this.roomForm.code.trim() || undefined,
      capacity: Math.max(1, Number(this.roomForm.capacity) || 1),
      notes: this.roomForm.notes.trim() || undefined,
    };
    const req = this.roomForm.id
      ? this.api.updateRoom(this.roomForm.id, body)
      : this.api.createRoom(body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.notice.set(this.roomForm.id ? 'Sala actualizada.' : 'Sala creada.');
        this.editRoom();
        this.api.listRooms().subscribe({ next: (rows) => this.rooms.set(rows) });
        this.api.getSettings().subscribe({ next: (s) => this.settings.set(s) });
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(this.msg(err, 'No se pudo guardar la sala.'));
      },
    });
  }

  toggleRoom(room: ClinicRoom) {
    if (!this.isAdmin()) return;
    this.saving.set(true);
    this.api.setRoomActive(room.id, !room.isActive).subscribe({
      next: (row) => {
        this.saving.set(false);
        this.rooms.update((list) => list.map((r) => (r.id === row.id ? row : r)));
        this.notice.set(row.isActive ? `Sala «${row.name}» activada.` : `Sala «${row.name}» desactivada.`);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(this.msg(err, 'No se pudo cambiar el estado de la sala.'));
      },
    });
  }

  saveSettings() {
    if (!this.isAdmin()) return;
    this.saving.set(true);
    this.error.set('');
    this.api
      .updateSettings({
        hourlyMaxConcurrentRooms: Math.max(1, Number(this.settingsForm.hourlyMaxConcurrentRooms) || 1),
        hourlyMaxHoursPerMonth: Math.max(1, Number(this.settingsForm.hourlyMaxHoursPerMonth) || 50),
      })
      .subscribe({
        next: (s) => {
          this.saving.set(false);
          this.settings.set(s);
          this.notice.set('Cupos actualizados.');
          this.reloadProfessionals();
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(this.msg(err, 'No se pudieron guardar los cupos.'));
        },
      });
  }

  isToday(d: Date) {
    const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }

  private startOfWeek(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const day = (x.getDay() + 6) % 7; // lunes = 0
    x.setDate(x.getDate() - day);
    return x;
  }

  private toMonthKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private toLocalInput(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
  }

  private localToIso(local: string): string | null {
    if (!local) return null;
    const d = new Date(local);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  private msg(err: { error?: { message?: string | string[] } }, fallback: string) {
    const m = err?.error?.message;
    if (Array.isArray(m)) return m.join(' ');
    return m || fallback;
  }
}
