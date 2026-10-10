import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HabIcon } from '../habilitation/hab-icon';
import { AgendaApiService } from '../agenda/agenda-api.service';
import { ClinicServiceItem, SERVICE_CATEGORY_LABELS, ServiceCategory, formatCop } from '../agenda/agenda.models';
import { aestheticServiceImage } from '../agenda/aesthetic-service-images';
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

const norm = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Catálogo de servicios con duración y precio; la agenda lo usa al reservar. */
@Component({
  selector: 'app-services-card',
  imports: [FormsModule, HabIcon],
  template: `
    <section class="cat" id="servicios" aria-labelledby="cat-title">
      <header class="cat-hero">
        <div>
          <p class="eyebrow">Agenda y recibos</p>
          <h2 id="cat-title">Catálogo de servicios</h2>
          <p class="lead">Duración y precio de cada servicio. La agenda y los recibos de caja los toman de aquí.</p>
        </div>
        @if (services().length) {
          <dl class="stats">
            <div><dt>Servicios</dt><dd>{{ activeCount() }}</dd></div>
            <div><dt>Con precio</dt><dd>{{ pricedCount() }}</dd></div>
            <div><dt>Masajes de asistentes</dt><dd>{{ assistantCount() }}</dd></div>
          </dl>
        }
      </header>

      @if (loading()) {
        <div class="grid" aria-busy="true" aria-label="Cargando servicios">
          @for (i of skeleton; track i) {
            <div class="tile skeleton"><div class="ph"></div><div class="sk-line"></div><div class="sk-line short"></div></div>
          }
        </div>
      } @else if (loadError()) {
        <div class="state err" role="alert">
          <hab-icon name="alert" [size]="20" />
          <span>{{ loadError() }}</span>
          <button type="button" class="ghost" (click)="load()">Reintentar</button>
        </div>
      } @else {
        <div class="toolbar">
          <div class="tabs" role="tablist" aria-label="Categoría">
            @for (t of tabs(); track t.key) {
              <button
                type="button"
                role="tab"
                [attr.aria-selected]="filter() === t.key"
                [class.on]="filter() === t.key"
                (click)="filter.set(t.key)"
              >
                {{ t.label }} <span class="count">{{ t.count }}</span>
              </button>
            }
          </div>
          <label class="search">
            <hab-icon name="search" [size]="16" />
            <span class="sr-only">Buscar servicio</span>
            <input type="search" placeholder="Buscar servicio" [value]="query()" (input)="query.set($any($event.target).value)" />
          </label>
          @if (isAdmin()) {
            <label class="inactive">
              <input type="checkbox" [checked]="showInactive()" (change)="showInactive.set($any($event.target).checked)" />
              Ver inactivos
            </label>
            <button type="button" class="primary" (click)="openNew()">
              <hab-icon name="plus" [size]="16" /> Nuevo servicio
            </button>
          }
        </div>

        @if (notice()) {
          <p class="ok" role="status"><hab-icon name="check" [size]="16" /> {{ notice() }}</p>
        }

        @if (formOpen()) {
          <div class="editor" id="servicio-editor" role="region" [attr.aria-label]="editingId() ? 'Editar servicio' : 'Nuevo servicio'">
            <div class="editor-head">
              @if (draftImage(); as img) {
                <img [src]="img.src" [style.object-position]="img.focus" alt="" width="120" height="90" />
              }
              <div>
                <p class="eyebrow">{{ editingId() ? 'Editar servicio' : 'Nuevo servicio' }}</p>
                <h3>{{ draft.name || 'Sin nombre' }}</h3>
              </div>
              <button type="button" class="icon-btn" aria-label="Cerrar" (click)="reset()"><hab-icon name="x" [size]="18" /></button>
            </div>
            <div class="form-grid">
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
                <label class="wide">Consentimiento requerido
                  <select [(ngModel)]="draft.consentCode">
                    <option value="">Ninguno</option>
                    @for (c of consents; track c.code) {
                      <option [value]="c.code">{{ c.label }}</option>
                    }
                  </select>
                </label>
              }
              <label class="wide">Descripción <textarea rows="3" [(ngModel)]="draft.description" maxlength="2000"></textarea></label>
              <label class="check"><input type="checkbox" [(ngModel)]="draft.assistantService" /> Lo atienden las asistentes de la agenda (masajes)</label>
              <label class="check"><input type="checkbox" [(ngModel)]="draft.active" /> Activo (visible al agendar)</label>
            </div>
            @if (error()) {
              <p class="err" role="alert">{{ error() }}</p>
            }
            <div class="editor-actions">
              <button type="button" class="ghost" (click)="reset()">Cancelar</button>
              <button type="button" class="primary" [disabled]="saving()" (click)="save()">
                <hab-icon name="save" [size]="16" />
                {{ saving() ? 'Guardando…' : editingId() ? 'Guardar cambios' : 'Agregar servicio' }}
              </button>
            </div>
          </div>
        }

        @if (!services().length) {
          <div class="state">
            <hab-icon name="package" [size]="28" />
            <p>Aún no hay servicios registrados.</p>
            @if (isAdmin() && aesthetic()) {
              <button type="button" class="primary" [disabled]="importing()" (click)="importBase()">
                {{ importing() ? 'Cargando…' : 'Cargar catálogo base de estética' }}
              </button>
            }
          </div>
        } @else if (!visible().length) {
          <div class="state">
            <hab-icon name="search" [size]="24" />
            <p>Ningún servicio coincide con la búsqueda.</p>
          </div>
        } @else {
          <ul class="grid">
            @for (s of visible(); track s.id) {
              <li class="tile" [class.off]="!s.active">
                <div class="media">
                  @if (aesthetic() && image(s.name); as img) {
                    <img [src]="img.src" [style.object-position]="img.focus" [alt]="s.name" loading="lazy" width="400" height="300" />
                  } @else {
                    <span class="ph" aria-hidden="true">{{ s.name.charAt(0) }}</span>
                  }
                  <span class="chip cat-chip" [attr.data-cat]="s.category">{{ categoryLabel(s.category) }}</span>
                  @if (!s.active) {
                    <span class="chip off-chip">Inactivo</span>
                  }
                </div>
                <div class="body">
                  @if (s.subcategory) {
                    <p class="sub">{{ s.subcategory }}</p>
                  }
                  <h3>{{ s.name }}</h3>
                  <div class="meta">
                    <span><hab-icon name="clock" [size]="15" /> {{ s.durationNote || s.durationMinutes + ' min' }}</span>
                    <strong class="price" [class.ask]="s.price === null">{{ cop(s.price) }}</strong>
                  </div>
                  @if (s.assistantService || s.consentCode || s.procedureType) {
                    <div class="badges">
                      @if (s.assistantService) {
                        <span class="badge assist"><hab-icon name="users" [size]="13" /> Asistentes</span>
                      }
                      @if (s.consentCode) {
                        <span class="badge consent" [title]="'Consentimiento: ' + consentLabel(s.consentCode)"><hab-icon name="shield" [size]="13" /> Consentimiento</span>
                      }
                      @if (s.procedureType) {
                        <span class="badge type"><hab-icon name="tag" [size]="13" /> {{ typeLabel(s.procedureType) }}</span>
                      }
                    </div>
                  }
                  @if (isAdmin()) {
                    <button type="button" class="edit" (click)="edit(s)" [attr.aria-label]="'Editar ' + s.name">
                      <hab-icon name="pencil" [size]="15" /> Editar
                    </button>
                  }
                </div>
              </li>
            }
          </ul>
        }

        @if (isAdmin() && aesthetic() && services().length) {
          <div class="import">
            <p>Catálogo base de estética: agrega los servicios que falten, sin precio y sin modificar los existentes.</p>
            <button type="button" class="ghost" [disabled]="importing()" (click)="importBase()">
              <hab-icon name="download" [size]="15" /> {{ importing() ? 'Cargando…' : 'Completar catálogo base' }}
            </button>
          </div>
        }
        @if (!isAdmin()) {
          <p class="muted small">Solo el administrador del consultorio modifica el catálogo.</p>
        }
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .cat { margin-top: 20px; max-width: 1180px; background: #fff; border: 1px solid #dbe7ea; border-radius: 24px; overflow: hidden; box-shadow: 0 18px 40px rgba(0, 45, 92, 0.08); }
    .cat-hero { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; padding: 28px 28px 24px; color: #fff; background: radial-gradient(120% 140% at 0% 0%, #0d7377 0%, #003d4c 55%, #022a35 100%); }
    .eyebrow { margin: 0; font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; color: #9fe0dc; }
    .cat-hero h2 { margin: 6px 0 6px; font-size: 1.6rem; font-weight: 600; letter-spacing: -0.01em; }
    .lead { margin: 0; max-width: 520px; color: #d3ecee; line-height: 1.5; }
    .stats { display: flex; gap: 10px; margin: 0; }
    .stats div { min-width: 104px; padding: 10px 14px; border-radius: 14px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.18); }
    .stats dt { font-size: 0.72rem; color: #bfe3e5; }
    .stats dd { margin: 2px 0 0; font-size: 1.35rem; font-weight: 600; }

    .toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 18px 28px; border-bottom: 1px solid #e6eef0; background: #fafdfd; position: sticky; top: 0; z-index: 2; }
    .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
    .tabs button { border: 1px solid #d3e0e1; background: #fff; color: #234; border-radius: 999px; padding: 7px 14px; font: inherit; font-size: 0.86rem; cursor: pointer; }
    .tabs button.on { background: #003d4c; border-color: #003d4c; color: #fff; }
    .tabs .count { display: inline-block; margin-left: 4px; padding: 0 7px; border-radius: 999px; font-size: 0.75rem; background: rgba(0, 61, 76, 0.08); }
    .tabs button.on .count { background: rgba(255, 255, 255, 0.2); }
    .search { flex: 1 1 200px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid #d3e0e1; border-radius: 999px; background: #fff; color: #5c7378; }
    .search input { flex: 1; border: 0; outline: 0; padding: 9px 0; font: inherit; background: transparent; }
    .search:focus-within { outline: 3px solid #1d4e89; outline-offset: 1px; }
    .inactive { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #405a5f; }

    .grid { list-style: none; margin: 0; padding: 24px 28px; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 18px; }
    .tile { display: flex; flex-direction: column; border: 1px solid #e1eaec; border-radius: 18px; overflow: hidden; background: #fff; transition: transform 0.18s, box-shadow 0.18s; }
    .tile:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(0, 45, 92, 0.12); }
    .tile.off { opacity: 0.6; }
    .media { position: relative; aspect-ratio: 4 / 3; background: linear-gradient(135deg, #e6f3f3, #d3e7ea); }
    .media img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .media::after { content: ''; position: absolute; inset: auto 0 0 0; height: 45%; background: linear-gradient(180deg, transparent, rgba(0, 30, 40, 0.35)); pointer-events: none; }
    .ph { display: grid; place-items: center; width: 100%; height: 100%; font-size: 2.6rem; font-weight: 600; color: #0d7377; }
    .chip { position: absolute; z-index: 1; top: 12px; padding: 4px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.02em; backdrop-filter: blur(6px); }
    .cat-chip { left: 12px; background: rgba(255, 255, 255, 0.92); color: #003d4c; }
    .cat-chip[data-cat='CORPORAL'] { color: #6d28d9; }
    .off-chip { right: 12px; background: rgba(40, 40, 40, 0.75); color: #fff; }
    .body { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px 16px; flex: 1; }
    .sub { margin: 0; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: #0d7377; }
    .body h3 { margin: 0; font-size: 1rem; line-height: 1.3; color: #0f2f38; }
    .meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: auto; padding-top: 6px; font-size: 0.85rem; color: #4d666b; }
    .meta span { display: inline-flex; align-items: center; gap: 5px; }
    .price { font-size: 1.02rem; color: #003d4c; }
    .price.ask { font-size: 0.85rem; font-weight: 500; color: #8a6d1f; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px; font-size: 0.72rem; }
    .badge.assist { background: #ecfdf5; color: #046c4e; }
    .badge.consent { background: #eef4ff; color: #1d4e89; }
    .badge.type { background: #f4f1fb; color: #5b21b6; }
    .edit { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; border: 1px solid #d3e0e1; background: #fff; border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 0.82rem; color: #003d4c; cursor: pointer; }
    .edit:hover { background: #f2f8f9; }

    .editor { margin: 20px 28px 0; padding: 20px; border: 1px solid #cfe2e4; border-radius: 18px; background: linear-gradient(180deg, #f6fbfb, #fff); }
    .editor-head { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
    .editor-head img { width: 120px; height: 90px; border-radius: 12px; object-fit: cover; }
    .editor-head > div { flex: 1; }
    .editor-head .eyebrow { color: #0d7377; }
    .editor-head h3 { margin: 4px 0 0; color: #003d4c; }
    .icon-btn { border: 1px solid #d3e0e1; background: #fff; border-radius: 999px; width: 36px; height: 36px; display: grid; place-items: center; cursor: pointer; color: #405a5f; }
    .form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .form-grid .wide { grid-column: 1 / -1; }
    label { display: flex; flex-direction: column; gap: 5px; font-size: 0.85rem; color: #405a5f; }
    label.check { flex-direction: row; align-items: center; gap: 8px; grid-column: span 3; }
    .form-grid input, .form-grid select, .form-grid textarea { font: inherit; padding: 9px 11px; border: 1px solid #d3e0e1; border-radius: 10px; background: #fff; }
    input[type='checkbox'] { width: 18px; height: 18px; accent-color: #0d7377; }
    .editor-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }

    .primary { display: inline-flex; align-items: center; gap: 6px; border: 0; background: #003d4c; color: #fff; border-radius: 999px; padding: 10px 18px; font: inherit; font-size: 0.9rem; cursor: pointer; }
    .ghost { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #d3e0e1; background: #fff; border-radius: 999px; padding: 8px 14px; font: inherit; font-size: 0.85rem; cursor: pointer; color: #003d4c; }
    .primary:disabled, .ghost:disabled { opacity: 0.6; cursor: default; }
    button:focus-visible { outline: 3px solid #1d4e89; outline-offset: 2px; }

    .state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 40px 28px; text-align: center; color: #5c7378; }
    .state.err { flex-direction: row; justify-content: center; color: #8a1f1f; }
    .state p { margin: 0; }
    .import { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0 28px 24px; padding: 14px 16px; border-radius: 14px; background: #f2f8f9; border: 1px dashed #c4d8db; }
    .import p { margin: 0; flex: 1 1 280px; font-size: 0.85rem; color: #3d5459; }
    .ok { display: flex; align-items: center; gap: 6px; margin: 14px 28px 0; color: #1d6b3a; }
    .err { color: #8a1f1f; }
    .muted { color: #6a8085; padding: 0 28px 20px; }
    .small { font-size: 0.85rem; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

    .skeleton .ph, .sk-line { background: linear-gradient(90deg, #eef4f5 25%, #f7fafb 50%, #eef4f5 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
    .skeleton .ph { aspect-ratio: 4 / 3; height: auto; }
    .sk-line { height: 12px; margin: 12px 16px 0; border-radius: 6px; }
    .sk-line.short { width: 50%; margin-bottom: 16px; }
    @keyframes shimmer { to { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) { .tile, .tile:hover { transition: none; transform: none; } .skeleton .ph, .sk-line { animation: none; } }
    @media (max-width: 760px) {
      .cat-hero, .toolbar, .grid { padding-left: 16px; padding-right: 16px; }
      .stats { width: 100%; }
      .stats div { flex: 1; min-width: 0; }
      .form-grid { grid-template-columns: 1fr; }
      label.check { grid-column: auto; }
      .editor, .import { margin-left: 16px; margin-right: 16px; }
    }
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

  readonly filter = signal<ServiceCategory | 'ALL'>('ALL');
  readonly query = signal('');
  readonly showInactive = signal(false);
  readonly formOpen = signal(false);
  readonly skeleton = [1, 2, 3, 4];

  private readonly listed = computed(() => this.services().filter((s) => s.active || this.showInactive()));
  readonly activeCount = computed(() => this.services().filter((s) => s.active).length);
  readonly pricedCount = computed(() => this.services().filter((s) => s.active && s.price !== null).length);
  readonly assistantCount = computed(() => this.services().filter((s) => s.active && s.assistantService).length);

  readonly tabs = computed(() => {
    const rows = this.listed();
    return [
      { key: 'ALL' as const, label: 'Todos', count: rows.length },
      ...this.categories
        .map(([key, label]) => ({ key, label, count: rows.filter((s) => s.category === key).length }))
        .filter((t) => t.count),
    ];
  });

  readonly visible = computed(() => {
    const cat = this.filter();
    const q = norm(this.query());
    return this.listed().filter(
      (s) => (cat === 'ALL' || s.category === cat) && (!q || norm(`${s.name} ${s.subcategory ?? ''}`).includes(q)),
    );
  });

  ngOnInit() {
    this.load();
  }

  categoryLabel(c: ServiceCategory) {
    return SERVICE_CATEGORY_LABELS[c] ?? c;
  }

  draftImage() {
    return this.aesthetic() && this.draft.name ? aestheticServiceImage(this.draft.name) : null;
  }

  openNew() {
    this.reset();
    this.notice.set('');
    this.formOpen.set(true);
    this.focusEditor();
  }

  private focusEditor() {
    setTimeout(() => document.getElementById('servicio-editor')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  image(name: string) {
    return aestheticServiceImage(name);
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
    this.formOpen.set(true);
    this.focusEditor();
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
    this.formOpen.set(false);
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
