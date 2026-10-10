import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgendaApiService } from '../agenda/agenda-api.service';
import { ClinicServiceItem, SERVICE_CATEGORY_LABELS, ServiceCategory, formatCop } from '../agenda/agenda.models';
import { AES_CONSENTS, AES_PROCEDURE_TYPES, aesConsentLabel, procedureTypeLabel } from '../clinical/aesthetic/aesthetic.models';

type Draft = {
  name: string;
  category: ServiceCategory;
  subcategory: string;
  durationMinutes: number;
  durationNote: string;
  price: string;
  description: string;
  procedureType: string;
  consentCode: string;
  assistantService: boolean;
  active: boolean;
};

const EMPTY: Draft = {
  name: '',
  category: 'FACIAL',
  subcategory: '',
  durationMinutes: 60,
  durationNote: '',
  price: '',
  description: '',
  procedureType: '',
  consentCode: '',
  assistantService: false,
  active: true,
};

/** Catálogo de servicios con duración y precio; la agenda lo usa al reservar. */
@Component({
  selector: 'app-services-card',
  imports: [FormsModule],
  template: `
    <div class="card" id="servicios">
      <p class="eyebrow">Agenda y recibos</p>
      <h2>Servicios del consultorio</h2>
      <p class="lead">
        Al agendar, el servicio fija la duración de la cita. Sin precio, el servicio figura como «Consultar».
      </p>

      @if (loading()) {
        <p class="muted small">Cargando servicios…</p>
      } @else if (loadError()) {
        <p class="err" role="alert">{{ loadError() }} <button type="button" class="sv-ghost" (click)="load()">Reintentar</button></p>
      } @else if (!services().length) {
        <p class="muted small">Aún no hay servicios registrados.</p>
      }

      @if (isAdmin() && aesthetic() && !loading() && !loadError()) {
        <div class="sv-import">
          <p class="small">
            Catálogo base de estética: agrega los servicios faciales y corporales que falten, sin precio y sin modificar
            los existentes.
          </p>
          <button type="button" class="sv-ghost" [disabled]="importing()" (click)="importBase()">
            {{ importing() ? 'Cargando…' : 'Cargar catálogo base de estética' }}
          </button>
        </div>
      }
      @if (notice()) {
        <p class="ok" role="status">{{ notice() }}</p>
      }

      @for (g of groups(); track g.category) {
        <h3 class="subhead">{{ g.label }}</h3>
        <ul class="sv-list">
          @for (s of g.items; track s.id) {
            <li [class.off]="!s.active">
              <div>
                <strong>{{ s.name }}</strong>
                <small>
                  {{ s.subcategory ? s.subcategory + ' · ' : '' }}{{ s.durationMinutes }} min{{ s.durationNote ? ' (' + s.durationNote + ')' : '' }}
                  · {{ cop(s.price) }}{{ s.active ? '' : ' · Inactivo' }}
                </small>
                @if (s.procedureType || s.consentCode || s.assistantService) {
                  <small>
                    {{ s.procedureType ? typeLabel(s.procedureType) : '' }}{{ s.consentCode ? ' · Consentimiento: ' + consentLabel(s.consentCode) : '' }}{{ s.assistantService ? ' · Lo atienden las asistentes' : '' }}
                  </small>
                }
              </div>
              @if (isAdmin()) {
                <button type="button" class="sv-ghost" (click)="edit(s)">Editar</button>
              }
            </li>
          }
        </ul>
      }

      @if (isAdmin()) {
        <h3 class="subhead">{{ editingId() ? 'Editar servicio' : 'Nuevo servicio' }}</h3>
        <div class="sv-grid">
          <label class="wide">Nombre <input [(ngModel)]="draft.name" maxlength="160" /></label>
          <label>Categoría
            <select [(ngModel)]="draft.category">
              @for (c of categories; track c[0]) {
                <option [value]="c[0]">{{ c[1] }}</option>
              }
            </select>
          </label>
          <label>Subcategoría <input [(ngModel)]="draft.subcategory" maxlength="80" placeholder="Ej.: Inyectables" /></label>
          <label>Duración (min) <input type="number" min="5" max="480" step="5" [(ngModel)]="draft.durationMinutes" /></label>
          <label>Nota de duración <input [(ngModel)]="draft.durationNote" maxlength="60" placeholder="Ej.: por sesión" /></label>
          <label>Precio (COP) <input inputmode="numeric" [(ngModel)]="draft.price" placeholder="Vacío = Consultar" /></label>
          @if (aesthetic()) {
            <label>Tipo de procedimiento
              <select [(ngModel)]="draft.procedureType">
                <option value="">Ninguno</option>
                @for (t of procedureTypes; track t.key) {
                  <option [value]="t.key">{{ t.label }}</option>
                }
              </select>
            </label>
            <label>Consentimiento requerido
              <select [(ngModel)]="draft.consentCode">
                <option value="">Ninguno</option>
                @for (c of consents; track c.code) {
                  <option [value]="c.code">{{ c.label }}</option>
                }
              </select>
            </label>
          }
          <label class="wide">Descripción <textarea rows="2" [(ngModel)]="draft.description" maxlength="2000"></textarea></label>
          <label class="check"><input type="checkbox" [(ngModel)]="draft.assistantService" /> Lo atienden las asistentes de la agenda (masajes)</label>
          <label class="check"><input type="checkbox" [(ngModel)]="draft.active" /> Activo (visible al agendar)</label>
        </div>
        @if (error()) {
          <p class="err" role="alert">{{ error() }}</p>
        }
        <div class="sv-actions">
          @if (editingId()) {
            <button type="button" class="sv-ghost" (click)="reset()">Cancelar</button>
          }
          <button type="button" class="primary" [disabled]="saving()" (click)="save()">
            {{ saving() ? 'Guardando…' : editingId() ? 'Guardar cambios' : 'Agregar servicio' }}
          </button>
        </div>
      } @else {
        <p class="muted small">Solo el administrador del consultorio modifica el catálogo.</p>
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
    .sv-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .sv-list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid #d7e3e6; border-radius: 12px; }
    .sv-list li.off { opacity: 0.65; }
    .sv-list small { display: block; color: #5c7378; }
    .sv-import { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 14px; border-radius: 12px; background: #f2f8f9; border: 1px solid #d7e3e6; margin-bottom: 8px; }
    .sv-import p { margin: 0; flex: 1 1 260px; color: #3d5459; }
    .sv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .sv-grid .wide { grid-column: 1 / -1; }
    label { display: flex; flex-direction: column; gap: 5px; font-size: 0.85rem; color: #405a5f; }
    label.check { flex-direction: row; align-items: center; gap: 8px; }
    input, select, textarea { font: inherit; padding: 9px 11px; border: 1px solid #d3e0e1; border-radius: 10px; }
    input[type='checkbox'] { padding: 0; width: 18px; height: 18px; }
    .sv-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 16px; }
    .sv-ghost { border: 1px solid #d3e0e1; background: #fff; border-radius: 999px; padding: 7px 14px; font: inherit; font-size: 0.85rem; cursor: pointer; }
    .primary { border: 0; background: #003d4c; color: #fff; border-radius: 999px; padding: 12px 20px; font: inherit; cursor: pointer; }
    .primary:disabled, .sv-ghost:disabled { opacity: 0.6; }
    .err { color: #8a1f1f; }
    .ok { color: #1d6b3a; }
    @media (max-width: 700px) { .sv-grid { grid-template-columns: 1fr; } }
  `,
})
export class ServicesCard implements OnInit {
  private readonly api = inject(AgendaApiService);
  readonly isAdmin = input(false);
  /** Consultorio de medicina estética: habilita tipo, consentimiento y catálogo base. */
  readonly aesthetic = input(false);

  readonly services = signal<ClinicServiceItem[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly importing = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly editingId = signal<string | null>(null);

  readonly categories = Object.entries(SERVICE_CATEGORY_LABELS) as Array<[ServiceCategory, string]>;
  readonly procedureTypes = AES_PROCEDURE_TYPES;
  readonly consents = AES_CONSENTS;
  draft: Draft = { ...EMPTY };
  private scrolled = false;

  readonly groups = computed(() =>
    this.categories
      .map(([category, label]) => ({ category, label, items: this.services().filter((s) => s.category === category) }))
      .filter((g) => g.items.length),
  );

  ngOnInit() {
    this.load();
  }

  cop(v: number | null) {
    return formatCop(v);
  }

  typeLabel(key: string) {
    return procedureTypeLabel(key);
  }

  consentLabel(code: string) {
    return aesConsentLabel(code);
  }

  load() {
    this.loading.set(true);
    this.loadError.set('');
    this.api.listServices(true).subscribe({
      next: (rows) => {
        this.services.set(rows);
        this.loading.set(false);
        if (!this.scrolled && location.search.includes('seccion=servicios')) {
          this.scrolled = true;
          setTimeout(() => document.getElementById('servicios')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('No se pudieron cargar los servicios.');
      },
    });
  }

  edit(s: ClinicServiceItem) {
    this.editingId.set(s.id);
    this.error.set('');
    this.notice.set('');
    this.draft = {
      name: s.name,
      category: s.category,
      subcategory: s.subcategory || '',
      durationMinutes: s.durationMinutes,
      durationNote: s.durationNote || '',
      price: s.price === null ? '' : String(s.price),
      description: s.description || '',
      procedureType: s.procedureType || '',
      consentCode: s.consentCode || '',
      assistantService: s.assistantService,
      active: s.active,
    };
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
      this.error.set('Escriba el nombre del servicio.');
      return;
    }
    const duration = Number(d.durationMinutes);
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
      this.error.set('La duración debe estar entre 5 y 480 minutos.');
      return;
    }
    const rawPrice = String(d.price ?? '').replace(/[$.\s]/g, '').replace(',', '.');
    const price = rawPrice ? Number(rawPrice) : null;
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      this.error.set('El precio debe ser un número; déjelo vacío para «Consultar».');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const id = this.editingId();
    this.api
      .saveService(id, {
        name,
        category: d.category,
        subcategory: d.subcategory.trim() || null,
        durationMinutes: duration,
        durationNote: d.durationNote.trim() || null,
        price,
        description: d.description.trim() || null,
        procedureType: d.procedureType || null,
        consentCode: d.consentCode || null,
        assistantService: d.assistantService,
        active: d.active,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notice.set(id ? 'Servicio actualizado.' : 'Servicio agregado.');
          this.reset();
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message;
          this.error.set(Array.isArray(msg) ? msg.join(' ') : msg || 'No se pudo guardar el servicio.');
        },
      });
  }

  importBase() {
    this.importing.set(true);
    this.notice.set('');
    this.error.set('');
    this.api.importAestheticServices().subscribe({
      next: (r) => {
        this.importing.set(false);
        this.notice.set(r.imported ? `Se agregaron ${r.imported} servicio(s).` : 'El catálogo ya estaba completo.');
        this.load();
      },
      error: (err) => {
        this.importing.set(false);
        this.error.set(err?.error?.message || 'No se pudo cargar el catálogo base.');
      },
    });
  }
}
