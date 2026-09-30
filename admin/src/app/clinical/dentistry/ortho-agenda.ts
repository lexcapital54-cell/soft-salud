import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AgendaApiService } from '../../agenda/agenda-api.service';
import type { DentistryContent } from './dentistry.models';
import {
  AGENDA_STATUSES,
  AGENDA_TYPES,
  APPOINTMENT_STATUS_LABEL,
  OrthoAgendaRow,
  addDays,
  colorOf,
  dayIso,
  fmtDay,
  newFollowId,
  nextControlWarning,
} from './ortho-follow.models';

interface ClinicAppointment {
  id: string;
  date: string;
  time: string;
  status: string;
  professional: string;
  reason: string;
}

interface AgendaItem {
  key: string;
  date: string;
  time: string;
  type: string;
  status: string;
  professional: string;
  notes: string;
  clinic: boolean;
  row?: OrthoAgendaRow;
}

/** Controles de ortodoncia programados + citas del paciente en la agenda del consultorio (solo lectura). */
@Component({
  selector: 'app-ortho-agenda',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="ag">
      @if (warning()) {
        <p class="ag-warn">{{ warning() }}</p>
      }
      @if (!disabled()) {
        <div class="ag-form">
          <label>Fecha <input type="date" [(ngModel)]="draft.date" /></label>
          <label>Hora <input type="time" [(ngModel)]="draft.time" /></label>
          <label>Profesional <input [(ngModel)]="draft.professional" /></label>
          <div class="ag-types">
            @for (t of types; track t.label) {
              <button type="button" [class.on]="draft.type === t.label" [style.--c]="t.color" (click)="draft.type = t.label">{{ t.label }}</button>
            }
          </div>
          <div class="ag-actions">
            <button type="button" class="ag-btn" [disabled]="!draft.date" (click)="add()">+ Programar control</button>
            <span class="ag-lbl">Serie:</span>
            <input class="ag-n" [(ngModel)]="series" inputmode="numeric" title="Número de controles" />
            <span class="ag-lbl">controles cada</span>
            <input class="ag-n" [(ngModel)]="everyWeeks" inputmode="numeric" title="Semanas entre controles" />
            <span class="ag-lbl">semanas</span>
            <button type="button" class="ag-link" [disabled]="!draft.date" (click)="addSeries()">Programar serie</button>
          </div>
        </div>
      }

      @let list = items();
      @if (list.length) {
        <ol class="ag-list">
          @for (it of list; track it.key) {
            <li [class.past]="it.date < today" [class.clinic]="it.clinic">
              <span class="ag-date">
                <b>{{ day(it.date) }}</b>
                <small>{{ month(it.date) }}</small>
              </span>
              <span class="ag-bar" [style.background]="typeColor(it.type)"></span>
              <span class="ag-body">
                <b>{{ it.type || 'Cita' }}</b>
                <small>{{ fmt(it.date) }} {{ it.time }} · {{ it.professional || '—' }}{{ it.notes ? ' · ' + it.notes : '' }}</small>
                @if (it.clinic) {
                  <small class="ag-tag">Agenda del consultorio</small>
                }
              </span>
              @if (it.row && !disabled()) {
                <select class="ag-status" [ngModel]="it.row.status" (ngModelChange)="setStatus(it.row, $event)" [style.--c]="statusColor(it.status)">
                  @for (s of statuses; track s.label) {
                    <option [value]="s.label">{{ s.label }}</option>
                  }
                </select>
                @if (it.row.status === 'Programada') {
                  <button type="button" class="ag-x" title="Quitar control programado" (click)="remove(it.row)">×</button>
                }
              } @else {
                <span class="ag-pill" [style.--c]="statusColor(it.status)">{{ it.status }}</span>
              }
            </li>
          }
        </ol>
      } @else {
        <p class="ag-lbl">Sin controles programados.</p>
      }
      <p class="ag-lbl">
        {{ loading() ? 'Consultando la agenda del consultorio…' : loadError() || '' }}
        Para reservar la franja horaria use la <a routerLink="/consultorio/agenda">agenda del consultorio</a>.
      </p>
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .ag { display: grid; gap: 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
    .ag-warn { margin: 0; padding: 6px 10px; border-radius: 10px; background: #fffbeb; color: #92400e; font-size: 12px; }
    .ag-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 8px; align-items: end; }
    .ag-form label { display: grid; gap: 2px; font-size: 11px; color: #475569; }
    .ag-form input { min-width: 0; }
    .ag-types, .ag-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
    .ag-types button { --c: #12609a; border: 1.5px solid var(--c); color: var(--c); background: #fff; border-radius: 99px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
    .ag-types button.on { background: var(--c); color: #fff; }
    .ag-btn { border: 0; background: #12609a; color: #fff; border-radius: 99px; padding: 5px 14px; font-size: 12px; cursor: pointer; }
    .ag-btn:disabled, .ag-link:disabled { opacity: 0.45; cursor: default; }
    .ag-link { border: 0; background: none; padding: 0; color: #12609a; text-decoration: underline; font-size: 12px; cursor: pointer; }
    .ag-lbl { margin: 0; font-size: 11px; color: #64748b; }
    .ag-n { width: 46px; text-align: center; }
    .ag-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .ag-list li { display: flex; gap: 10px; align-items: center; padding: 6px 8px; border-radius: 12px; border: 1px solid #e2e8f0; }
    .ag-list li.past { opacity: 0.7; background: #f8fafc; }
    .ag-list li.clinic { border-style: dashed; }
    .ag-date { flex: 0 0 42px; display: grid; text-align: center; line-height: 1.1; }
    .ag-date b { font-size: 17px; color: #123b60; }
    .ag-date small { font-size: 10px; color: #64748b; text-transform: uppercase; }
    .ag-bar { flex: 0 0 4px; align-self: stretch; border-radius: 4px; }
    .ag-body { flex: 1; display: grid; min-width: 0; font-size: 13px; }
    .ag-body small { font-size: 11px; color: #64748b; }
    .ag-tag { color: #0369a1 !important; }
    .ag-status, .ag-pill { --c: #94a3b8; border: 1.5px solid var(--c); color: var(--c); border-radius: 99px; padding: 2px 8px; font-size: 12px; font-weight: 600; background: #fff; }
    .ag-x { border: 0; background: none; color: #94a3b8; font-size: 18px; cursor: pointer; }
  `,
})
export class OrthoAgenda implements OnInit {
  private readonly agendaApi = inject(AgendaApiService);

  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly professionalName = input('');
  readonly patientId = input('');
  readonly patientDocument = input('');
  readonly lastControl = input<string | null>(null);
  readonly changed = output<void>();

  readonly types = AGENDA_TYPES;
  readonly statuses = AGENDA_STATUSES;
  readonly today = dayIso(new Date());
  readonly clinicAppointments = signal<ClinicAppointment[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal('');

  draft = { date: '', time: '', type: 'Control mensual', professional: '' };
  series = 3;
  everyWeeks = 4;

  ngOnInit() {
    this.draft.professional = this.professionalName();
    const last = this.lastControl();
    this.draft.date = last ? addDays(last.slice(0, 10) < this.today ? this.today : last.slice(0, 10), 28) : '';
    this.loadClinic();
  }

  private loadClinic() {
    const doc = this.patientDocument();
    const id = this.patientId();
    if (!doc || !id) return;
    this.loading.set(true);
    this.agendaApi.listToday({ q: doc, from: addDays(this.today, -365), to: addDays(this.today, 365) }).subscribe({
      next: (rows) => {
        this.clinicAppointments.set(
          rows
            .filter((a) => a.patient?.id === id && a.eventType !== 'BLOQUEO')
            .map((a) => {
              const d = new Date(a.startsAt);
              return {
                id: a.id,
                date: dayIso(d),
                time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                status: APPOINTMENT_STATUS_LABEL[a.status] ?? a.status,
                professional: a.professional?.fullName ?? '',
                reason: a.reason ?? '',
              };
            }),
        );
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('No se pudo consultar la agenda del consultorio.');
      },
    });
  }

  items(): AgendaItem[] {
    const own: AgendaItem[] = this.data().orthoFollow.agenda.map((row) => ({
      key: row.id,
      date: row.date,
      time: row.time,
      type: row.type,
      status: row.status,
      professional: row.professional,
      notes: row.notes,
      clinic: false,
      row,
    }));
    const clinic: AgendaItem[] = this.clinicAppointments().map((a) => ({
      key: `c${a.id}`,
      date: a.date,
      time: a.time,
      type: a.reason || 'Cita',
      status: a.status,
      professional: a.professional,
      notes: '',
      clinic: true,
    }));
    return [...own, ...clinic].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }

  warning() {
    return nextControlWarning(this.lastControl(), [
      ...this.data().orthoFollow.agenda,
      ...this.clinicAppointments().map((a) => ({ id: a.id, date: a.date, time: a.time, type: '', professional: '', status: a.status, notes: '' })),
    ]);
  }

  typeColor(t: string) {
    return colorOf(AGENDA_TYPES, t);
  }

  statusColor(s: string) {
    return colorOf(AGENDA_STATUSES, s);
  }

  fmt(v: string) {
    return fmtDay(v);
  }

  day(v: string) {
    return v.slice(8, 10);
  }

  month(v: string) {
    const m = Number(v.slice(5, 7));
    return ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1] ?? '';
  }

  add(date = this.draft.date) {
    this.data().orthoFollow.agenda.push({
      id: newFollowId(),
      date,
      time: this.draft.time,
      type: this.draft.type,
      professional: this.draft.professional,
      status: 'Programada',
      notes: '',
    });
    this.changed.emit();
  }

  addSeries() {
    const n = Math.max(1, Math.min(24, Math.floor(Number(this.series) || 1)));
    const weeks = Math.max(1, Math.min(26, Math.floor(Number(this.everyWeeks) || 4)));
    for (let i = 0; i < n; i++) this.add(addDays(this.draft.date, i * weeks * 7));
    this.draft.date = addDays(this.draft.date, n * weeks * 7);
  }

  setStatus(row: OrthoAgendaRow, status: string) {
    row.status = status;
    this.changed.emit();
  }

  remove(row: OrthoAgendaRow) {
    const list = this.data().orthoFollow.agenda;
    list.splice(list.indexOf(row), 1);
    this.changed.emit();
  }
}
