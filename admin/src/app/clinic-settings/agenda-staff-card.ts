import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgendaApiService } from '../agenda/agenda-api.service';
import { AgendaStaffMember, STAFF_ACCENTS } from '../agenda/agenda.models';

type Draft = { name: string; roleLabel: string; shiftStart: string; shiftEnd: string; active: boolean };

const EMPTY: Draft = { name: '', roleLabel: 'Estética corporal', shiftStart: '08:00', shiftEnd: '18:00', active: true };

/** Asistentes de estética corporal: cada una tiene su columna en la agenda y solo atiende masajes. */
@Component({
  selector: 'app-agenda-staff-card',
  imports: [FormsModule],
  template: `
    <div class="card" id="asistentes-agenda">
      <p class="eyebrow">Agenda</p>
      <h2>Asistentes de la agenda</h2>
      <p class="lead">
        Cada asistente tiene su propia columna en la vista Día y solo puede agendar servicios de masajes, dentro de su
        turno. La valoración, la estética facial y los procedimientos médicos siguen a cargo de la profesional.
      </p>

      @if (loading()) {
        <p class="muted small">Cargando asistentes…</p>
      } @else if (loadError()) {
        <p class="err" role="alert">{{ loadError() }} <button type="button" class="st-ghost" (click)="load()">Reintentar</button></p>
      } @else if (!staff().length) {
        <p class="muted small">Aún no hay asistentes registradas.</p>
        @if (isAdmin()) {
          <button type="button" class="st-ghost" [disabled]="provisioning()" (click)="provision()">
            {{ provisioning() ? 'Creando…' : 'Crear Asistente 1, 2 y 3 (8:00 a. m. – 6:00 p. m.)' }}
          </button>
        }
      }
      @if (notice()) {
        <p class="ok" role="status">{{ notice() }}</p>
      }

      @if (staff().length) {
        <ul class="st-list">
          @for (m of staff(); track m.id; let i = $index) {
            <li [class.off]="!m.active">
              <span class="st-dot" [style.background]="accent(i)" aria-hidden="true"></span>
              <div>
                <strong>{{ m.name }}</strong>
                <small>{{ m.roleLabel }} · {{ m.shiftLabel }}{{ m.active ? '' : ' · Inactiva' }}</small>
              </div>
              @if (isAdmin()) {
                <button type="button" class="st-ghost" (click)="edit(m)">Editar</button>
              }
            </li>
          }
        </ul>
      }

      @if (isAdmin()) {
        <h3 class="subhead">{{ editingId() ? 'Editar asistente' : 'Nueva asistente' }}</h3>
        <div class="st-grid">
          <label>Nombre <input [(ngModel)]="draft.name" maxlength="120" placeholder="Ej.: Asistente 1" /></label>
          <label>Rol <input [(ngModel)]="draft.roleLabel" maxlength="120" /></label>
          <label>Entrada <input type="time" [(ngModel)]="draft.shiftStart" /></label>
          <label>Salida <input type="time" [(ngModel)]="draft.shiftEnd" /></label>
          <label class="check"><input type="checkbox" [(ngModel)]="draft.active" /> Activa (aparece en la agenda)</label>
        </div>
        @if (error()) {
          <p class="err" role="alert">{{ error() }}</p>
        }
        <div class="st-actions">
          @if (editingId()) {
            <button type="button" class="st-ghost" (click)="reset()">Cancelar</button>
          }
          <button type="button" class="primary" [disabled]="saving()" (click)="save()">
            {{ saving() ? 'Guardando…' : editingId() ? 'Guardar cambios' : 'Agregar asistente' }}
          </button>
        </div>
      } @else {
        <p class="muted small">Solo el administrador del consultorio modifica las asistentes.</p>
      }
    </div>
  `,
  styles: `
    .card { max-width: 720px; margin-top: 20px; background: #fff; border: 1px solid #d7e3e6; border-radius: 22px; padding: 28px; box-shadow: 0 10px 28px rgba(0, 45, 92, 0.08); }
    .eyebrow { margin: 0; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: #0d7377; }
    h2 { margin: 6px 0 8px; color: #003d4c; }
    .lead { margin: 0 0 14px; color: #3d5459; line-height: 1.5; }
    .subhead { margin: 18px 0 10px; font-size: 0.95rem; color: #003d4c; }
    .muted { color: #6a8085; }
    .small { font-size: 0.85rem; }
    .st-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .st-list li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid #d7e3e6; border-radius: 12px; }
    .st-list li > div { flex: 1; }
    .st-list li.off { opacity: 0.65; }
    .st-list small { display: block; color: #5c7378; }
    .st-dot { width: 12px; height: 12px; border-radius: 999px; flex: none; }
    .st-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    label { display: flex; flex-direction: column; gap: 5px; font-size: 0.85rem; color: #405a5f; }
    label.check { flex-direction: row; align-items: center; gap: 8px; grid-column: 1 / -1; }
    input { font: inherit; padding: 9px 11px; border: 1px solid #d3e0e1; border-radius: 10px; }
    input[type='checkbox'] { padding: 0; width: 18px; height: 18px; }
    .st-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 16px; }
    .st-ghost { border: 1px solid #d3e0e1; background: #fff; border-radius: 999px; padding: 7px 14px; font: inherit; font-size: 0.85rem; cursor: pointer; }
    .primary { border: 0; background: #003d4c; color: #fff; border-radius: 999px; padding: 12px 20px; font: inherit; cursor: pointer; }
    .primary:disabled, .st-ghost:disabled { opacity: 0.6; }
    .err { color: #8a1f1f; }
    .ok { color: #1d6b3a; }
    @media (max-width: 700px) { .st-grid { grid-template-columns: 1fr; } }
  `,
})
export class AgendaStaffCard implements OnInit {
  private readonly api = inject(AgendaApiService);
  readonly isAdmin = input(false);

  readonly staff = signal<AgendaStaffMember[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly provisioning = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly editingId = signal<string | null>(null);
  draft: Draft = { ...EMPTY };

  ngOnInit() {
    this.load();
  }

  accent(i: number) {
    return STAFF_ACCENTS[i % STAFF_ACCENTS.length];
  }

  load() {
    this.loading.set(true);
    this.loadError.set('');
    this.api.listStaff(true).subscribe({
      next: (rows) => {
        this.staff.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('No se pudieron cargar las asistentes.');
      },
    });
  }

  edit(m: AgendaStaffMember) {
    this.editingId.set(m.id);
    this.error.set('');
    this.notice.set('');
    this.draft = { name: m.name, roleLabel: m.roleLabel, shiftStart: m.shiftStart, shiftEnd: m.shiftEnd, active: m.active };
  }

  reset() {
    this.editingId.set(null);
    this.draft = { ...EMPTY };
    this.error.set('');
  }

  save() {
    const d = this.draft;
    const name = d.name.trim();
    if (name.length < 2) {
      this.error.set('Escriba el nombre de la asistente.');
      return;
    }
    if (!d.shiftStart || !d.shiftEnd || d.shiftEnd <= d.shiftStart) {
      this.error.set('La hora de salida debe ser posterior a la de entrada.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const id = this.editingId();
    this.api
      .saveStaff(id, {
        name,
        roleLabel: d.roleLabel.trim() || 'Estética corporal',
        shiftStart: d.shiftStart,
        shiftEnd: d.shiftEnd,
        active: d.active,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notice.set(id ? 'Asistente actualizada.' : 'Asistente agregada.');
          this.reset();
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message;
          this.error.set(Array.isArray(msg) ? msg.join(' ') : msg || 'No se pudo guardar la asistente.');
        },
      });
  }

  provision() {
    this.provisioning.set(true);
    this.notice.set('');
    this.error.set('');
    this.api.provisionDefaultStaff().subscribe({
      next: (r) => {
        this.provisioning.set(false);
        this.notice.set(r.created ? `Se crearon ${r.created} asistentes.` : 'El consultorio ya tenía asistentes.');
        this.load();
      },
      error: (err) => {
        this.provisioning.set(false);
        this.error.set(err?.error?.message || 'No se pudieron crear las asistentes.');
      },
    });
  }
}
