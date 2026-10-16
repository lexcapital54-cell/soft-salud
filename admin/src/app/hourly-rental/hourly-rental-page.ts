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
} from './hourly-rental-api.service';

type Tab = 'reservas' | 'nueva' | 'salas';

const STATUS_LABELS: Record<HourlyBookingStatus, string> = {
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

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

  readonly tab = signal<Tab>('reservas');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  readonly rooms = signal<ClinicRoom[]>([]);
  readonly professionals = signal<HourlyProfessional[]>([]);
  readonly bookings = signal<HourlyBooking[]>([]);

  readonly statusLabels = STATUS_LABELS;
  readonly statusOptions: HourlyBookingStatus[] = [
    'CONFIRMED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
  ];

  filterProfessionalId = '';
  filterFrom = '';
  filterTo = '';

  bookingForm = {
    professionalId: '',
    roomId: '',
    startLocal: '',
    endLocal: '',
    notes: '',
  };

  roomForm = {
    id: '' as string,
    name: '',
    code: '',
    capacity: 1,
    notes: '',
  };

  readonly activeRooms = computed(() => this.rooms().filter((r) => r.isActive));
  readonly upcomingBookings = computed(() => {
    const now = Date.now();
    return this.bookings().filter((b) => {
      if (b.status === 'CANCELLED') return false;
      return new Date(b.endTime).getTime() + 45 * 60_000 >= now;
    });
  });

  ngOnInit() {
    const today = new Date();
    const week = new Date(today);
    week.setDate(week.getDate() + 7);
    this.filterFrom = this.toDateInput(today);
    this.filterTo = this.toDateInput(week);
    this.reloadAll();
  }

  setTab(tab: Tab) {
    this.tab.set(tab);
    this.error.set('');
    this.notice.set('');
  }

  logout() {
    this.auth.logoutToClinicLogin();
  }

  reloadAll() {
    this.loading.set(true);
    this.error.set('');
    let pending = 3;
    const done = () => {
      pending -= 1;
      if (pending <= 0) this.loading.set(false);
    };
    this.api.listRooms().subscribe({
      next: (rows) => {
        this.rooms.set(rows);
        done();
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'No se pudieron cargar las salas.');
        done();
      },
    });
    this.api.listHourlyProfessionals().subscribe({
      next: (rows) => {
        this.professionals.set(rows);
        done();
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'No se pudieron cargar los profesionales.');
        done();
      },
    });
    this.reloadBookings(done);
  }

  reloadBookings(onDone?: () => void) {
    const from = this.filterFrom ? `${this.filterFrom}T00:00:00.000` : undefined;
    const to = this.filterTo ? `${this.filterTo}T23:59:59.999` : undefined;
    this.api
      .listBookings({
        professionalId: this.filterProfessionalId || undefined,
        from,
        to,
      })
      .subscribe({
        next: (rows) => {
          this.bookings.set(rows);
          onDone?.();
        },
        error: (err) => {
          this.error.set(err?.error?.message || 'No se pudieron cargar las reservas.');
          onDone?.();
        },
      });
  }

  createBooking() {
    if (!this.bookingForm.professionalId) {
      this.error.set('Seleccione el profesional.');
      return;
    }
    if (!this.bookingForm.startLocal || !this.bookingForm.endLocal) {
      this.error.set('Indique inicio y fin de la reserva.');
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
    this.notice.set('');
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
          this.notice.set('Reserva creada. El profesional podrá usar la HCE en ese horario (más margen de gracia).');
          this.bookingForm = {
            professionalId: this.bookingForm.professionalId,
            roomId: '',
            startLocal: '',
            endLocal: '',
            notes: '',
          };
          this.reloadBookings();
          this.setTab('reservas');
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(this.msg(err, 'No se pudo crear la reserva.'));
        },
      });
  }

  setBookingStatus(booking: HourlyBooking, status: HourlyBookingStatus) {
    this.saving.set(true);
    this.error.set('');
    this.api.updateBooking(booking.id, { status }).subscribe({
      next: () => {
        this.saving.set(false);
        this.notice.set(`Reserva marcada como «${STATUS_LABELS[status]}».`);
        this.reloadBookings();
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
    const name = this.roomForm.name.trim();
    if (!name) {
      this.error.set('Escriba el nombre de la sala.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
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
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(this.msg(err, 'No se pudo guardar la sala.'));
      },
    });
  }

  toggleRoom(room: ClinicRoom) {
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

  statusClass(status: HourlyBookingStatus) {
    return status.toLowerCase().replace('_', '-');
  }

  private toDateInput(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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
