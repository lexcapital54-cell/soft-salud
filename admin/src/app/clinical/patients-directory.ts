import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ClinicalApiService } from './clinical-api.service';
import { EncounterListItem, Patient } from './clinical.models';

/**
 * Un paciente por día: si ese día se le abrió la historia y además se registró
 * la ficha, sigue siendo una sola persona y se muestra una sola vez.
 */
interface DayEntry {
  patientId: string;
  name: string;
  detail: string;
  encounterId: string | null;
  note: string;
  profileComplete: boolean;
}

/** Celda del calendario mensual. */
interface MonthCell {
  key: string;
  dayNumber: number;
  inMonth: boolean;
  entries: DayEntry[];
}

function toDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDateKey(key: string) {
  return new Date(`${key}T00:00:00`);
}

@Component({
  selector: 'app-patients-directory',
  imports: [FormsModule, RouterLink],
  templateUrl: './patients-directory.html',
  styleUrl: './patients-directory.scss',
})
export class PatientsDirectory implements OnInit {
  private readonly api = inject(ClinicalApiService);
  private readonly auth = inject(AuthService);

  readonly canWrite = this.auth.canWriteClinical;

  readonly loading = signal(false);
  readonly error = signal('');
  readonly message = signal('');

  // Buscador
  query = '';
  readonly results = signal<Patient[]>([]);
  readonly searching = signal(false);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  // Calendario
  readonly monthCursor = signal(toDateKey(new Date()));
  readonly selectedDay = signal(toDateKey(new Date()));
  readonly encounters = signal<EncounterListItem[]>([]);
  readonly monthPatients = signal<Patient[]>([]);

  // Alta rápida
  readonly showNew = signal(false);
  readonly creating = signal(false);
  newPatient = {
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    documentNumber: '',
  };

  readonly weekdayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  readonly monthLabel = computed(() => {
    const label = parseDateKey(this.monthCursor()).toLocaleDateString('es-CO', {
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  readonly selectedDayLabel = computed(() => {
    const label = parseDateKey(this.selectedDay()).toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  /**
   * Actividad del mes por día, con un único renglón por paciente: primero las
   * historias abiertas y después las fichas registradas que aún no aparecen.
   */
  private readonly byDay = computed(() => {
    const map = new Map<string, DayEntry[]>();

    const push = (key: string, entry: DayEntry) => {
      const bucket = map.get(key);
      if (!bucket) {
        map.set(key, [entry]);
        return;
      }
      if (bucket.some((e) => e.patientId === entry.patientId)) return;
      bucket.push(entry);
    };

    for (const enc of this.encounters()) {
      const patient = enc.patient;
      push(toDateKey(new Date(enc.createdAt)), {
        patientId: patient.id,
        name: this.patientName(patient),
        detail: this.documentLabel(patient),
        encounterId: enc.id,
        note:
          enc.clinicalRecord?.status === 'SIGNED'
            ? 'Historia cerrada'
            : 'Historia en borrador',
        profileComplete: patient.profileComplete !== false,
      });
    }

    for (const patient of this.monthPatients()) {
      if (!patient.createdAt) continue;
      push(toDateKey(new Date(patient.createdAt)), {
        patientId: patient.id,
        name: this.patientName(patient),
        detail: this.documentLabel(patient),
        encounterId: null,
        note: 'Paciente registrado',
        profileComplete: patient.profileComplete !== false,
      });
    }

    return map;
  });

  /** Rejilla de lunes a domingo que cubre el mes visible completo. */
  readonly monthGrid = computed<MonthCell[]>(() => {
    const cursor = parseDateKey(this.monthCursor());
    const month = cursor.getMonth();
    const first = new Date(cursor.getFullYear(), month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);

    const byDay = this.byDay();
    return Array.from({ length: 42 }, (_, i) => {
      const at = new Date(start);
      at.setDate(start.getDate() + i);
      const key = toDateKey(at);
      return {
        key,
        dayNumber: at.getDate(),
        inMonth: at.getMonth() === month,
        entries: byDay.get(key) ?? [],
      };
    });
  });

  readonly dayEntries = computed(
    () => this.byDay().get(this.selectedDay()) ?? [],
  );

  ngOnInit() {
    this.loadMonth();
  }

  /** El buscador solo responde a una consulta explícita: el listado del día
   * vive en el calendario. */
  private search(q: string) {
    this.searching.set(true);
    this.api.listPatients({ q }).subscribe({
      next: (rows) => {
        this.results.set(rows);
        this.searching.set(false);
      },
      error: () => {
        this.searching.set(false);
        this.error.set('No se pudo buscar el paciente.');
      },
    });
  }

  patientName(patient: Patient) {
    return `${patient.firstName} ${patient.lastName}`.replace(/\s+/g, ' ').trim();
  }

  documentLabel(patient: Patient) {
    return patient.documentNumber
      ? `${patient.documentType} ${patient.documentNumber}`
      : 'Ficha por completar';
  }

  onQueryChange() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const term = this.query.trim();
    if (term.length < 2) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.searchTimer = setTimeout(() => this.search(term), 300);
  }

  shiftMonth(direction: -1 | 1) {
    const cursor = parseDateKey(this.monthCursor());
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() + direction);
    this.monthCursor.set(toDateKey(cursor));
    this.loadMonth();
  }

  goToday() {
    const today = toDateKey(new Date());
    this.monthCursor.set(today);
    this.selectedDay.set(today);
    this.loadMonth();
  }

  selectDay(key: string) {
    this.selectedDay.set(key);
  }

  isToday(key: string) {
    return key === toDateKey(new Date());
  }

  /**
   * Trae lo que ocurrió en el mes visible: historias creadas y altas de
   * pacientes, porque un paciente recién registrado todavía no tiene historia
   * y aun así debe aparecer en su día.
   */
  private loadMonth() {
    const cursor = parseDateKey(this.monthCursor());
    const from = toDateKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    const to = toDateKey(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));

    this.loading.set(true);
    this.error.set('');
    this.api.listEncounters({ from, to }).subscribe({
      next: (rows) => {
        this.encounters.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudieron cargar las historias del mes.');
      },
    });

    this.api.listPatients({ from, to }).subscribe({
      next: (rows) => this.monthPatients.set(rows),
      error: () => undefined,
    });
  }

  toggleNew() {
    this.showNew.update((v) => !v);
    this.error.set('');
    this.message.set('');
  }

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

    this.creating.set(true);
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
          this.creating.set(false);
          this.showNew.set(false);
          this.newPatient = {
            firstName: '',
            lastName: '',
            phone: '',
            email: '',
            documentNumber: '',
          };
          this.message.set(
            patient.reused
              ? `${this.patientName(patient)} ya estaba registrado: se usa su ficha y su historia clínica existentes.`
              : `Paciente ${this.patientName(patient)} registrado.`,
          );
          this.query = '';
          this.results.set([]);
          // El alta debe verse de inmediato en el día del calendario.
          this.selectedDay.set(toDateKey(new Date()));
          this.loadMonth();
        },
        error: (err) => {
          this.creating.set(false);
          this.error.set(
            err?.error?.message || 'No se pudo registrar el paciente.',
          );
        },
      });
  }
}
