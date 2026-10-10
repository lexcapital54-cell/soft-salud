import { Component, ElementRef, HostListener, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { HabIcon } from '../../habilitation/hab-icon';
import { AES_PROCEDURE_TYPES, AES_ZONES, newId, procedureTypeLabel, zoneLabel } from './aesthetic.models';
import {
  AES_LATERALITIES,
  AES_MARK_STATUSES,
  AES_UNITS,
  AES_VIEWS,
  AesAnnotation,
  AesLaterality,
  AesMarkKind,
  AesMarkStatus,
  AesView,
  isProcedureMark,
  markKind,
  markStatus,
  todayIso,
} from './aesthetic-tracking.models';
import { AestheticTrackingService } from './aesthetic-tracking.service';
import { CreateRequest, FacialMapCanvas, NumberedMark } from './facial-map/facial-map-canvas';
import {
  FACIAL_LAYERS,
  FACIAL_TOOLS,
  FacialLayer,
  FacialTool,
  TOOL_ICONS,
  inkOn,
  layerOf,
  markStyle,
  procedureStyle,
} from './facial-map/facial-map.config';
import {
  discrepancies,
  duplicateMark,
  fmtQty,
  mapTotals,
  parseQty,
  pendingMarks,
  restoreSnapshot,
  symbolPath,
  translateMark,
} from './facial-map/facial-map.utils';
import { lateralityAt, regionAt, regionsFor } from './facial-map/facial-regions';

type Category = 'PROCEDIMIENTO' | 'HALLAZGO' | 'EVENTO' | 'NOTA';
type EditableKey = 'kind' | 'zone' | 'date' | 'procedureId' | 'note' | 'status' | 'procType' | 'laterality' | 'quantity' | 'unit' | 'label';

const HISTORY_MAX = 60;
const SAVE_LABEL: Record<string, string> = {
  idle: 'Sin cambios',
  loading: 'Cargando…',
  pending: 'Cambios pendientes',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'Error al guardar',
  conflict: 'Conflicto de versión',
};

/**
 * Mapa facial interactivo: documenta por vista, región y sesión lo que el profesional observa,
 * planea o realiza. No sugiere puntos de aplicación, dosis ni técnica; solo suma cantidades
 * digitadas con la misma unidad.
 */
@Component({
  selector: 'app-aesthetic-face-map',
  imports: [HabIcon, FacialMapCanvas],
  styleUrls: ['./aesthetic.scss', './aesthetic-tracking.scss', './facial-map/facial-map.scss'],
  template: `
    @let lock = ro();
    <section class="aes-block fm" id="aes-mapa" [class.present]="presentation()" (keydown)="key($event)">
      <header class="fm-head">
        <div class="fm-title">
          <h4>Mapa facial</h4>
          <p class="fm-kicker">Procedimientos estéticos</p>
          <p>
            {{ session() ? 'Sesión del ' + day(session()) : 'Todas las sesiones' }} · {{ stats().total }}
            {{ stats().total === 1 ? 'marca' : 'marcas' }}
            @if (disabled()) {
              · Solo consulta
            }
          </p>
        </div>
        <div class="fm-head-tools">
          <div class="fm-sex" role="radiogroup" aria-label="Rostro de referencia">
            <button type="button" role="radio" [attr.aria-checked]="sex() === 'F'" [class.on]="sex() === 'F'" (click)="tracking.faceSex.set('F')">Mujer</button>
            <button type="button" role="radio" [attr.aria-checked]="sex() === 'M'" [class.on]="sex() === 'M'" (click)="tracking.faceSex.set('M')">Hombre</button>
          </div>
          <span class="fm-save" [attr.data-state]="tracking.status()" role="status" aria-live="polite">
            <span class="fm-save-dot" aria-hidden="true"></span>{{ saveLabel() }}
          </span>
          @if (tracking.status() === 'error') {
            <button type="button" class="fm-btn ghost sm" (click)="tracking.retry()"><hab-icon name="refresh" [size]="16" /> Reintentar</button>
          }
          <label class="fm-session">
            <span>Sesión</span>
            <select (change)="setSession(val($event))">
              <option value="" [selected]="!session()">Todas</option>
              @for (s of sessions(); track s) {
                <option [value]="s" [selected]="s === session()">{{ day(s) }}</option>
              }
            </select>
          </label>
          @if (!disabled() && session() !== today) {
            <button type="button" class="fm-btn ghost sm" (click)="setSession(today)"><hab-icon name="plus" [size]="16" /> Sesión de hoy</button>
          }
          <button type="button" class="fm-btn ghost sm" [attr.aria-pressed]="presentation()" (click)="togglePresentation()">
            <hab-icon [name]="presentation() ? 'x' : 'monitor'" [size]="16" /> {{ presentation() ? 'Salir de presentación' : 'Presentación' }}
          </button>
        </div>
      </header>

      @if (tracking.status() === 'conflict' || (tracking.status() === 'error' && tracking.message())) {
        <p class="alert-line error" role="alert"><hab-icon name="alert" /> {{ tracking.message() }}</p>
      }
      @if (flash()) {
        <p class="alert-line" role="alert"><hab-icon name="alert" /> {{ flash() }}</p>
      }

      @if (!tracking.loaded()) {
        <div class="fm-skeleton" aria-busy="true">
          <span class="big"></span><span></span>
          <p class="empty">{{ tracking.status() === 'error' ? tracking.message() : 'Cargando mapa facial…' }}</p>
        </div>
      } @else {
        <div class="fm-work" [class.no-right]="!rightOpen()">
          <!-- Centro: rostro con leyenda y rótulos -->
          <div class="fm-center">
            <div class="fm-bar">
              <span class="fm-view-name">{{ viewLabel() }}</span>
              <div class="fm-zoom" role="group" aria-label="Zoom y edición">
                <button type="button" class="icon-btn" aria-label="Deshacer (Ctrl+Z)" title="Deshacer (Ctrl+Z)" [disabled]="lock || !canUndo()" (click)="undo()">
                  <hab-icon name="restore" [size]="16" />
                </button>
                <button type="button" class="icon-btn flip" aria-label="Rehacer (Ctrl+Mayús+Z)" title="Rehacer (Ctrl+Mayús+Z)" [disabled]="lock || !canRedo()" (click)="redo()">
                  <hab-icon name="restore" [size]="16" />
                </button>
                <span class="fm-sep" aria-hidden="true"></span>
                <button type="button" class="icon-btn" aria-label="Alejar" (click)="canvas()?.zoomBy(1 / 1.25)">
                  <svg class="mini-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
                </button>
                <span class="fm-zoom-val" aria-live="polite">{{ zoomPct() }} %</span>
                <button type="button" class="icon-btn" aria-label="Acercar" (click)="canvas()?.zoomBy(1.25)">
                  <hab-icon name="plus" [size]="16" />
                </button>
                <button type="button" class="fm-btn ghost xs" (click)="canvas()?.center()">Centrar</button>
                <button type="button" class="fm-btn ghost xs" (click)="canvas()?.reset()">Ajustar</button>
              </div>
            </div>

            <div class="fm-canvas-wrap">
              <app-facial-map-canvas
                [view]="view()"
                [sex]="sex()"
                [marks]="visibleMarks()"
                [selected]="selectedIds()"
                [tool]="lock && tool() !== 'hand' ? 'select' : tool()"
                [readOnly]="lock"
                [layers]="layers()"
                [highlight]="highlight()"
                [regionCounts]="regionCounts()"
                [draftColor]="activeColor()"
                [reserveTopLeft]="legendH()"
                (created)="create($event)"
                (picked)="pick($event.id, $event.additive)"
                (erased)="erase($event)"
                (dragStart)="snapshot()"
                (dragged)="drag($event.id, $event.dx, $event.dy)"
                (cleared)="clearSelection()"
              />

              <div class="fm-legend" #legend aria-label="Leyenda de procedimientos">
                @for (t of legendTypes(); track t.key) {
                  <button type="button" class="fm-legend-item" [class.off]="hiddenTypes().has(t.key)" [attr.aria-pressed]="!hiddenTypes().has(t.key)"
                    [attr.aria-label]="(hiddenTypes().has(t.key) ? 'Mostrar ' : 'Ocultar ') + t.label" (click)="toggleType(t.key)">
                    <svg class="fm-swatch" viewBox="-6 -6 12 12" aria-hidden="true"><path [attr.d]="sym(t.symbol)" [attr.fill]="t.color" /></svg>
                    {{ t.label }}
                  </button>
                }
                <span class="fm-legend-states" aria-hidden="true">
                  <span><i class="st planned"></i>Planeado</span>
                  <span><i class="st done"></i>Realizado</span>
                  <span><i class="st susp"></i>Suspendido</span>
                  <span><i class="st cancel"></i>Cancelado</span>
                </span>
              </div>

              @if (!viewMarks().length) {
                <p class="fm-empty-over">
                  {{ lock ? 'No hay anotaciones en esta vista.' : 'No hay anotaciones en esta vista. Elija un procedimiento y marque una zona del rostro para comenzar.' }}
                </p>
              }
            </div>
            <p class="fm-hint">{{ toolHint() }} · Ctrl + rueda o pellizco para acercar.</p>
          </div>

          <!-- Panel derecho: detalle clínico y resumen -->
          <aside class="fm-panel fm-right" aria-label="Detalle y resumen">
            @if (rightOpen()) {
              <div class="fm-panel-head">
                <h5>{{ selectedList().length > 1 ? selectedList().length + ' marcas seleccionadas' : 'Detalle de la marca' }}</h5>
                <button type="button" class="icon-btn" aria-label="Contraer detalle" (click)="rightOpen.set(false)">
                  <hab-icon name="chevronRight" [size]="16" />
                </button>
              </div>

              @if (selectedList().length > 1) {
                @let editable = bulkEditable();
                <div class="fm-card">
                  <p class="meta">{{ editable.length }} de {{ selectedList().length }} se pueden modificar (las cerradas no cambian).</p>
                  @if (!lock && editable.length) {
                    <div class="card-actions">
                      <button type="button" class="fm-btn ghost sm" (click)="bulkStatus('REALIZADO')"><hab-icon name="check" [size]="16" /> Confirmar realizadas</button>
                      <button type="button" class="fm-btn ghost sm" (click)="bulkStatus('SUSPENDIDO')">Suspender</button>
                      <button type="button" class="btn-remove" (click)="bulkRemove()"><hab-icon name="trash" [size]="16" /> Quitar del borrador</button>
                    </div>
                  }
                </div>
              } @else if (selected(); as m) {
                @let locked = !!m.lockedAt;
                @let edit = !lock && !locked;
                @let st = statusOf(m);
                @let style = styleOfMark(m);
                <div class="fm-card" [class.locked]="locked">
                  <div class="fm-card-head">
                    <svg class="fm-swatch lg" viewBox="-6 -6 12 12" aria-hidden="true"><path [attr.d]="sym(style.symbol)" [attr.fill]="style.color" /></svg>
                    <div>
                      <strong>Marca #{{ numberOf(m) }}</strong>
                      <span class="meta">{{ kindLabel(m.kind) }}{{ m.procType ? ' · ' + typeLabel(m.procType) : '' }}</span>
                    </div>
                    @if (locked) {
                      <span class="badge signed">Cerrada</span>
                    } @else if (st) {
                      <span class="badge" [attr.data-status]="st">{{ statusLabel(st) }}</span>
                    } @else {
                      <span class="badge">Borrador</span>
                    }
                  </div>

                  <div class="aes-grid-narrow">
                    <label class="aes-field">
                      Tipo de registro
                      <select [disabled]="!edit" (change)="setCategory(m, val($event))">
                        @for (c of categories; track c.key) {
                          <option [value]="c.key" [selected]="c.key === categoryOf(m)">{{ c.label }}</option>
                        }
                      </select>
                    </label>
                    @if (st) {
                      <label class="aes-field">
                        Procedimiento
                        <select [disabled]="!edit" (change)="patch(m, 'procType', val($event))">
                          <option value="" [selected]="!m.procType">Sin tipo</option>
                          @for (p of procTypes; track p.key) {
                            <option [value]="p.key" [selected]="p.key === m.procType">{{ p.label }}</option>
                          }
                        </select>
                      </label>
                      <label class="aes-field">
                        Estado
                        <select [disabled]="!edit" (change)="patch(m, 'status', val($event))">
                          @for (s of statuses; track s.key) {
                            <option [value]="s.key" [selected]="s.key === st">{{ s.label }}</option>
                          }
                        </select>
                      </label>
                    }
                    <label class="aes-field">
                      Región
                      <select [disabled]="!edit" (change)="patch(m, 'zone', val($event))">
                        <option value="" [selected]="!m.zone">Sin región</option>
                        @for (z of zones; track z.key) {
                          <option [value]="z.key" [selected]="z.key === m.zone">{{ z.label }}</option>
                        }
                      </select>
                    </label>
                    <label class="aes-field">
                      Lateralidad
                      <select [disabled]="!edit" (change)="patch(m, 'laterality', val($event))">
                        <option value="" [selected]="!m.laterality">Sin indicar</option>
                        @for (l of lateralities; track l.key) {
                          <option [value]="l.key" [selected]="l.key === m.laterality">{{ l.label }}</option>
                        }
                      </select>
                    </label>
                    @if (st) {
                      <label class="aes-field">
                        Cantidad
                        <input inputmode="decimal" [value]="m.quantity || ''" [readOnly]="!edit" [attr.aria-invalid]="qtyInvalid(m)"
                          (focus)="snapshot()" (input)="patch(m, 'quantity', val($event), false)" placeholder="La registra el profesional" />
                      </label>
                      <label class="aes-field">
                        Unidad
                        <select [disabled]="!edit" (change)="patch(m, 'unit', val($event))">
                          <option value="" [selected]="!m.unit">Sin unidad</option>
                          @for (u of units; track u) {
                            <option [value]="u" [selected]="u === m.unit">{{ u }}</option>
                          }
                        </select>
                      </label>
                    }
                    <label class="aes-field">
                      Fecha de la sesión
                      <input type="date" [value]="m.date" [max]="today" [readOnly]="!edit" (change)="patch(m, 'date', val($event))" />
                    </label>
                    <label class="aes-field">
                      Registro de procedimiento
                      <select [disabled]="!edit" (change)="patch(m, 'procedureId', val($event))">
                        <option value="" [selected]="!m.procedureId">Sin vincular</option>
                        @for (p of procedureOptions(); track p.id) {
                          <option [value]="p.id" [selected]="p.id === m.procedureId">{{ p.label }}</option>
                        }
                      </select>
                    </label>
                  </div>
                  @if (qtyInvalid(m)) {
                    <p class="field-error" role="alert">La cantidad debe ser un número (use coma o punto para decimales).</p>
                  }
                  @if (linked(m); as p) {
                    <dl class="readout">
                      <div><dt>Producto</dt><dd>{{ p.product.name || '—' }}</dd></div>
                      <div><dt>Lote</dt><dd>{{ p.product.lot || '—' }}</dd></div>
                      <div><dt>Cantidad del registro</dt><dd>{{ p.quantity ? p.quantity + ' ' + p.unit : '—' }}</dd></div>
                      <div><dt>Estado del registro</dt><dd>{{ p.status === 'FIRMADO' ? 'Firmado' : 'Borrador' }}</dd></div>
                    </dl>
                  }
                  @if (m.shape === 'text') {
                    <label class="aes-field">
                      Texto de la etiqueta
                      <input id="fm-label-input" maxlength="80" [value]="m.label || ''" [readOnly]="!edit" (focus)="snapshot()"
                        (input)="patch(m, 'label', val($event), false)" />
                    </label>
                  }
                  <label class="aes-field">
                    Observación
                    <textarea rows="3" maxlength="2000" [value]="m.note" [readOnly]="!edit" (focus)="snapshot()"
                      (input)="patch(m, 'note', val($event), false)" placeholder="Lo observado, planeado o realizado en esta zona"></textarea>
                  </label>

                  @if (locked) {
                    <p class="meta">Cerrada por {{ m.lockedBy || '—' }} · {{ fmt(m.lockedAt) }}</p>
                  }
                  @if (m._audit?.createdBy) {
                    <details class="fm-audit">
                      <summary>Auditoría</summary>
                      <p class="meta">Registrada por {{ m._audit?.createdBy }} · {{ fmt(m._audit?.createdAt) }}</p>
                      @if (m._audit?.updatedAt && m._audit?.updatedAt !== m._audit?.createdAt) {
                        <p class="meta">Última modificación: {{ m._audit?.updatedBy }} · {{ fmt(m._audit?.updatedAt) }}</p>
                      }
                    </details>
                  }

                  <div class="card-actions">
                    @if (edit && st === 'PLANEADO') {
                      <button type="button" class="btn-primary" (click)="confirmPerformed(m)"><hab-icon name="check" [size]="16" /> Confirmar realizado</button>
                    }
                    @if (!lock) {
                      <button type="button" class="fm-btn ghost sm" (click)="duplicate(m)">Duplicar como nueva</button>
                    }
                    @if (edit) {
                      <button type="button" class="btn-remove" (click)="remove(m)"><hab-icon name="trash" [size]="16" /> Quitar del borrador</button>
                      @if (canSign()) {
                        <button type="button" class="btn-sign" [disabled]="busy()" (click)="close(m)"><hab-icon name="shield" [size]="16" /> Cerrar anotación</button>
                      }
                    }
                  </div>
                </div>
              } @else {
                <p class="empty">
                  {{ lock ? 'Seleccione una marca para ver su detalle.' : 'Marque el rostro con la herramienta elegida o seleccione una marca existente.' }}
                </p>
              }

              <h5 class="aes-sub">Resumen {{ session() ? 'de la sesión' : 'de todas las sesiones' }}</h5>
              <div class="fm-stats">
                <div><strong>{{ stats().total }}</strong><span>anotaciones</span></div>
                <div><strong>{{ stats().zones }}</strong><span>regiones</span></div>
                <div><strong>{{ stats().planned }}</strong><span>planeadas</span></div>
                <div><strong>{{ stats().performed }}</strong><span>realizadas</span></div>
              </div>
              @if (totals().length) {
                <table class="fm-totals">
                  <caption class="sr-only">Totales por procedimiento, producto y unidad</caption>
                  <thead>
                    <tr><th scope="col">Procedimiento / producto</th><th scope="col">Planeado</th><th scope="col">Realizado</th></tr>
                  </thead>
                  <tbody>
                    @for (t of totals(); track $index) {
                      <tr>
                        <td>
                          {{ t.label }}
                          <small>{{ t.product || 'Sin producto vinculado' }} · {{ t.marks }} {{ t.marks === 1 ? 'marca' : 'marcas' }}</small>
                        </td>
                        <td>{{ t.unit ? qty(t.planned) + ' ' + t.unit : '—' }}</td>
                        <td>{{ t.unit ? qty(t.performed) + ' ' + t.unit : '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
                <p class="meta">Solo se suman cantidades con la misma unidad; planeado y realizado van por separado.</p>
              }
              @for (msg of issues(); track $index) {
                <p class="alert-line"><hab-icon name="alert" [size]="16" /> {{ msg }}</p>
              }
              @if (pending().length) {
                <p class="alert-line"><hab-icon name="alert" [size]="16" /> {{ pending().length }} marca(s) realizada(s) sin registro de procedimiento vinculado o con cantidad incompleta.</p>
              }

              <h5 class="aes-sub">Marcas en esta vista ({{ viewMarks().length }})</h5>
              @if (!viewMarks().length) {
                <p class="empty">Sin marcas{{ session() ? ' en esta sesión' : '' }}.</p>
              } @else {
                <ol class="mark-list">
                  @for (m of numbered(); track m.a.id) {
                    @let s = styleOfMark(m.a);
                    <li>
                      <button type="button" [class.sel]="selectedIds().has(m.a.id)" (click)="pick(m.a.id, $any($event).shiftKey)">
                        <span class="num" [style.background]="s.color" [style.color]="ink(s.color)">{{ m.n }}</span>
                        <span class="txt">
                          <strong>{{ zoneName(m.a.zone) }}</strong> · {{ markSummary(m.a) }}
                          @if (m.a.note) {
                            <small>{{ m.a.note }}</small>
                          }
                        </span>
                        @if (m.a.lockedAt) {
                          <hab-icon name="shield" [size]="16" />
                        }
                      </button>
                    </li>
                  }
                </ol>
              }
            } @else {
              <button type="button" class="fm-rail" aria-label="Mostrar detalle y resumen" (click)="rightOpen.set(true)">
                <hab-icon name="list" [size]="18" />
              </button>
            }
          </aside>
        </div>

        <!-- Barra inferior: vistas, capas, procedimientos y herramientas -->
        <div class="fm-dock">
          <section class="fm-dock-col fm-dock-views" aria-labelledby="fm-d-views">
            <h5 id="fm-d-views">Vistas</h5>
            <div class="fm-thumbs" role="tablist" aria-label="Vista del rostro">
              @for (v of views; track v.key) {
                <button type="button" role="tab" class="fm-thumb" [attr.aria-selected]="view() === v.key" [class.on]="view() === v.key" (click)="setView(v.key)">
                  <span class="fm-thumb-img" [class.mirror]="v.key === 'IZQUIERDO' || v.key === 'OBLICUA_IZQ'">
                    <img [src]="thumb(v.key)" alt="" loading="lazy" width="150" height="200" />
                  </span>
                  <span class="fm-thumb-label">
                    {{ v.label }}
                    @if (viewCount().get(v.key); as c) {
                      <span class="fm-count">{{ c }}</span>
                    }
                  </span>
                </button>
              }
            </div>
          </section>

          <section class="fm-dock-col" aria-labelledby="fm-d-layers">
            <h5 id="fm-d-layers">Capas</h5>
            @for (l of layerDefs; track l.key) {
              <label class="fm-switch">
                <input type="checkbox" role="switch" [checked]="layers().has(l.key)" (change)="toggleLayer(l.key)" />
                <span class="fm-switch-track" aria-hidden="true"></span>
                {{ l.label }}
              </label>
            }
            <button type="button" class="fm-btn ghost sm block" (click)="toggleClean()">
              <hab-icon name="eye" [size]="16" /> {{ clean() ? 'Mostrar anotaciones' : 'Ver sin anotaciones' }}
            </button>
            <details class="fm-regions">
              <summary>Regiones de esta vista</summary>
              <ul>
                @for (r of regionList(); track $index) {
                  <li [class.hl]="highlight() === r.key">
                    <button type="button" class="link" (click)="toggleHighlight(r.key)" [attr.aria-pressed]="highlight() === r.key">
                      {{ r.label }}
                      @if (r.count) {
                        <span class="fm-count">{{ r.count }}</span>
                      }
                    </button>
                    @if (!lock) {
                      <button type="button" class="icon-btn" [attr.aria-label]="'Marcar zona ' + r.label" (click)="createAtRegion(r)">
                        <hab-icon name="plus" [size]="16" />
                      </button>
                    }
                  </li>
                }
              </ul>
            </details>
          </section>

          <section class="fm-dock-col" aria-labelledby="fm-d-procs">
            <h5 id="fm-d-procs">Procedimientos</h5>
            <div class="fm-seg" role="radiogroup" aria-label="Qué se registra">
              @for (c of categories; track c.key) {
                <button type="button" role="radio" [attr.aria-checked]="category() === c.key" [class.on]="category() === c.key"
                  [disabled]="lock" (click)="category.set(c.key)">{{ c.label }}</button>
              }
            </div>
            @if (category() === 'PROCEDIMIENTO') {
              <div class="fm-search">
                <hab-icon name="search" [size]="16" />
                <input type="search" aria-label="Buscar procedimiento" placeholder="Buscar procedimiento" [value]="procSearch()"
                  (input)="procSearch.set(val($event))" />
              </div>
              <ul class="fm-proc-list" role="radiogroup" aria-label="Procedimiento activo">
                @for (p of filteredTypes(); track p.key) {
                  @let s = styleOf(p.key);
                  <li>
                    <button type="button" role="radio" [attr.aria-checked]="procType() === p.key" [class.on]="procType() === p.key"
                      [disabled]="lock" (click)="procType.set(p.key)">
                      <span class="fm-radio" aria-hidden="true"></span>
                      <svg class="fm-swatch" viewBox="-6 -6 12 12" aria-hidden="true"><path [attr.d]="sym(s.symbol)" [attr.fill]="s.color" /></svg>
                      {{ p.label }}
                    </button>
                  </li>
                } @empty {
                  <li class="empty">Sin coincidencias.</li>
                }
              </ul>
              <span class="fm-label" id="fm-newstatus">Estado al marcar</span>
              <div class="fm-seg" role="radiogroup" aria-labelledby="fm-newstatus">
                <button type="button" role="radio" [attr.aria-checked]="newStatus() === 'PLANEADO'" [class.on]="newStatus() === 'PLANEADO'"
                  [disabled]="lock" (click)="newStatus.set('PLANEADO')">Planeado</button>
                <button type="button" role="radio" [attr.aria-checked]="newStatus() === 'REALIZADO'" [class.on]="newStatus() === 'REALIZADO'"
                  [disabled]="lock" (click)="newStatus.set('REALIZADO')">Realizado</button>
              </div>
              @if (newStatus() === 'REALIZADO') {
                <p class="fm-hint warn">Las marcas nuevas quedarán como realizadas. Úselo solo para lo efectivamente aplicado.</p>
              }
            }
          </section>

          <section class="fm-dock-col" aria-labelledby="fm-d-tools">
            <h5 id="fm-d-tools">Herramientas</h5>
            <div class="fm-tools" role="toolbar" aria-labelledby="fm-d-tools">
              @for (t of tools; track t.key) {
                <button type="button" class="fm-tool" [class.on]="tool() === t.key" [attr.aria-pressed]="tool() === t.key"
                  [attr.title]="t.label + ': ' + t.hint" [attr.aria-label]="t.label"
                  [disabled]="lock && t.key !== 'select' && t.key !== 'hand'" (click)="setTool(t.key)">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="toolIcon(t.key)" /></svg>
                  <span>{{ t.label }}</span>
                </button>
              }
            </div>
            @if (!lock) {
              <button type="button" class="fm-btn sm block" [disabled]="!tracking.hasUnsaved() || tracking.status() === 'saving'" (click)="saveNow()">
                <hab-icon name="check" [size]="16" /> Guardar mapa
              </button>
              <p class="fm-hint">Los cambios también se guardan solos a los pocos segundos.</p>
            }
          </section>
        </div>
      }
    </section>
  `,
})
export class AestheticFaceMap {
  readonly tracking = inject(AestheticTrackingService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  readonly disabled = input(false);
  readonly canSign = input(false);
  readonly canvas = viewChild(FacialMapCanvas);
  private readonly legendRef = viewChild<ElementRef<HTMLElement>>('legend');
  /** Alto que ocupa la leyenda flotante sobre el lienzo (0 cuando va debajo, en pantallas angostas). */
  readonly legendH = signal(0);

  readonly views = AES_VIEWS;
  readonly zones = AES_ZONES;
  readonly statuses = AES_MARK_STATUSES;
  readonly lateralities = AES_LATERALITIES;
  readonly units = AES_UNITS;
  readonly procTypes = AES_PROCEDURE_TYPES;
  readonly tools = FACIAL_TOOLS;
  readonly layerDefs = FACIAL_LAYERS;
  readonly today = todayIso();
  readonly categories: Array<{ key: Category; label: string }> = [
    { key: 'PROCEDIMIENTO', label: 'Procedimiento' },
    { key: 'HALLAZGO', label: 'Hallazgo' },
    { key: 'EVENTO', label: 'Evento adverso' },
    { key: 'NOTA', label: 'Nota' },
  ];

  readonly view = signal<AesView>('FRONTAL');
  readonly tool = signal<FacialTool>('point');
  readonly category = signal<Category>('PROCEDIMIENTO');
  readonly procType = signal('TOXINA');
  readonly newStatus = signal<'PLANEADO' | 'REALIZADO'>('PLANEADO');
  readonly session = signal('');
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly layers = signal<Set<FacialLayer>>(new Set(FACIAL_LAYERS.map((l) => l.key)));
  readonly hiddenTypes = signal<Set<string>>(new Set());
  readonly highlight = signal<string | null>(null);
  readonly rightOpen = signal(true);
  readonly presentation = signal(false);
  readonly procSearch = signal('');
  readonly busy = signal(false);
  readonly flash = signal<string | null>(null);

  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private readonly histRev = signal(0);
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  readonly ro = computed(() => this.disabled() || !this.tracking.loaded() || this.presentation());
  readonly canUndo = computed(() => {
    this.histRev();
    return this.undoStack.length > 0;
  });
  readonly canRedo = computed(() => {
    this.histRev();
    return this.redoStack.length > 0;
  });
  readonly zoomPct = computed(() => Math.round((this.canvas()?.k() ?? 1) * 100));
  readonly sex = computed(() => this.tracking.faceSex());
  readonly viewLabel = computed(() => AES_VIEWS.find((v) => v.key === this.view())?.label ?? '');
  readonly saveLabel = computed(() => SAVE_LABEL[this.tracking.status()] ?? '');
  readonly clean = computed(() => !['planned', 'performed', 'findings', 'drawings'].some((l) => this.layers().has(l as FacialLayer)));

  constructor() {
    // Al cambiar de paciente se descarta el historial de edición y la selección.
    effect(() => {
      this.tracking.loaded();
      untracked(() => {
        this.undoStack = [];
        this.redoStack = [];
        this.histRev.update((v) => v + 1);
        this.selectedIds.set(new Set());
      });
    });
    effect((onCleanup) => {
      const el = this.legendRef()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(() =>
        this.legendH.set(getComputedStyle(el).position === 'absolute' ? el.offsetTop + el.offsetHeight + 6 : 0),
      );
      ro.observe(el);
      onCleanup(() => ro.disconnect());
    });
  }

  private readonly all = computed(() => {
    this.tracking.rev();
    return this.tracking.data.annotations;
  });

  readonly sessions = computed(() => [...new Set(this.all().map((a) => a.date).filter(Boolean))].sort().reverse());
  readonly inSession = computed(() => {
    const s = this.session();
    return this.all().filter((a) => !s || a.date === s);
  });
  readonly viewMarks = computed(() => this.inSession().filter((a) => a.view === this.view()));
  readonly numbered = computed<NumberedMark[]>(() => this.viewMarks().map((a, i) => ({ a, n: i + 1 })));
  readonly visibleMarks = computed(() => {
    const layers = this.layers();
    const hidden = this.hiddenTypes();
    return this.numbered().filter((m) => layers.has(layerOf(m.a)) && !(m.a.procType && hidden.has(m.a.procType)));
  });
  readonly viewCount = computed(() => {
    const out = new Map<string, number>();
    for (const a of this.inSession()) out.set(a.view, (out.get(a.view) ?? 0) + 1);
    return out;
  });
  readonly regionCounts = computed(() => {
    const out = new Map<string, number>();
    for (const a of this.viewMarks()) if (a.zone) out.set(a.zone, (out.get(a.zone) ?? 0) + 1);
    return out;
  });
  readonly regionList = computed(() => {
    const view = this.view();
    const counts = this.regionCounts();
    const shapes = regionsFor(view);
    const seen = new Map<string, number>();
    for (const z of shapes) seen.set(z.key, (seen.get(z.key) ?? 0) + 1);
    return shapes
      .map((z) => {
        const lat = seen.get(z.key)! > 1 ? lateralityAt(view, z.cx, '') : '';
        const side = lat === 'DERECHA' ? ' (derecha)' : lat === 'IZQUIERDA' ? ' (izquierda)' : '';
        return { ...z, label: zoneLabel(z.key) + side, count: counts.get(z.key) ?? 0 };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  });

  readonly selectedList = computed(() => {
    const ids = this.selectedIds();
    return this.all().filter((a) => ids.has(a.id));
  });
  readonly selected = computed(() => (this.selectedList().length === 1 ? this.selectedList()[0] : null));
  readonly bulkEditable = computed(() => this.selectedList().filter((a) => !a.lockedAt));

  readonly procedures = computed(() => {
    this.tracking.rev();
    return this.tracking.data.procedures;
  });
  readonly procedureOptions = computed(() =>
    [...this.procedures()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((p) => ({
        id: p.id,
        label: `${p.date || 'sin fecha'} · ${procedureTypeLabel(p.type)}${p.status === 'FIRMADO' ? ' (firmado)' : ''}`,
      })),
  );

  readonly stats = computed(() => {
    const list = this.inSession();
    let planned = 0;
    let performed = 0;
    for (const a of list) {
      const s = markStatus(a);
      if (s === 'PLANEADO') planned++;
      else if (s === 'REALIZADO') performed++;
    }
    return { total: list.length, zones: new Set(list.map((a) => a.zone).filter(Boolean)).size, planned, performed };
  });
  readonly totals = computed(() => mapTotals(this.inSession(), this.procedures()));
  readonly issues = computed(() => discrepancies(this.inSession(), this.procedures()));
  readonly pending = computed(() => pendingMarks(this.inSession()));

  readonly filteredTypes = computed(() => {
    const q = this.procSearch().trim().toLowerCase();
    return AES_PROCEDURE_TYPES.filter((t) => !q || t.label.toLowerCase().includes(q));
  });

  readonly legendTypes = computed(() => {
    const keys = new Set<string>();
    for (const a of this.inSession()) if (isProcedureMark(a) && a.procType) keys.add(a.procType);
    if (this.category() === 'PROCEDIMIENTO') keys.add(this.procType());
    return [...keys].map((k) => ({ key: k, label: procedureTypeLabel(k), ...procedureStyle(k) }));
  });

  readonly activeColor = computed(() =>
    this.category() === 'PROCEDIMIENTO' ? procedureStyle(this.procType()).color : markKind(this.category()).color,
  );

  readonly toolHint = computed(() => {
    if (this.ro()) return 'Modo consulta: seleccione una marca para ver su detalle';
    return FACIAL_TOOLS.find((t) => t.key === this.tool())?.hint ?? '';
  });

  // ---- Utilidades de plantilla ----

  val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  day(iso: string) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  }

  fmt(iso?: string) {
    return iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '';
  }

  qty(n: number) {
    return fmtQty(n);
  }

  ink(color: string) {
    return inkOn(color);
  }

  sym(symbol: Parameters<typeof symbolPath>[0]) {
    return symbolPath(symbol, 0, 0, 4);
  }

  toolIcon(t: FacialTool) {
    return TOOL_ICONS[t];
  }

  thumb(v: AesView) {
    const family = v === 'FRONTAL' ? 'frontal' : v === 'OBLICUA_DER' || v === 'OBLICUA_IZQ' ? 'oblicua' : 'perfil';
    return `/facial-map/${this.sex() === 'M' ? 'hombre' : 'mujer'}-${family}-mini.jpg`;
  }

  saveNow() {
    if (!this.ro()) void this.tracking.commit();
  }

  styleOf(type: string) {
    return procedureStyle(type);
  }

  styleOfMark(a: AesAnnotation) {
    return markStyle(a);
  }

  statusOf(a: AesAnnotation) {
    return markStatus(a);
  }

  statusLabel(s: AesMarkStatus) {
    return AES_MARK_STATUSES.find((x) => x.key === s)?.label ?? s;
  }

  kindLabel(k: AesMarkKind) {
    return isProcedureMark({ kind: k }) ? 'Procedimiento' : markKind(k).label;
  }

  typeLabel(k: string) {
    return procedureTypeLabel(k);
  }

  zoneName(key: string) {
    return key ? zoneLabel(key) : 'Sin región';
  }

  categoryOf(a: AesAnnotation): Category {
    return isProcedureMark(a) ? 'PROCEDIMIENTO' : (a.kind as Category);
  }

  numberOf(a: AesAnnotation) {
    return this.numbered().find((m) => m.a.id === a.id)?.n ?? '—';
  }

  markSummary(a: AesAnnotation) {
    const parts: string[] = [];
    const st = markStatus(a);
    if (st) {
      parts.push(a.procType ? procedureTypeLabel(a.procType) : 'Procedimiento');
      parts.push(this.statusLabel(st).toLowerCase());
      if (a.quantity) parts.push(`${a.quantity} ${a.unit || ''}`.trim());
    } else {
      parts.push(markKind(a.kind).label);
    }
    parts.push(a.date ? this.day(a.date) : 'sin fecha');
    return parts.join(' · ');
  }

  qtyInvalid(a: AesAnnotation) {
    return !!a.quantity?.trim() && parseQty(a.quantity) === null;
  }

  linked(a: AesAnnotation) {
    return a.procedureId ? (this.procedures().find((p) => p.id === a.procedureId) ?? null) : null;
  }

  // ---- Vista y paneles ----

  setView(v: AesView) {
    this.view.set(v);
    this.canvas()?.cancelDraft();
    this.selectedIds.set(new Set());
    this.highlight.set(null);
  }

  setSession(s: string) {
    this.session.set(s);
    this.selectedIds.set(new Set());
  }

  setTool(t: FacialTool) {
    this.canvas()?.cancelDraft();
    this.tool.set(t);
  }

  toggleLayer(l: FacialLayer) {
    const next = new Set(this.layers());
    if (next.has(l)) next.delete(l);
    else next.add(l);
    this.layers.set(next);
  }

  toggleClean() {
    const next = new Set(this.layers());
    const annotationLayers: FacialLayer[] = ['planned', 'performed', 'findings', 'drawings', 'labels', 'callouts'];
    if (this.clean()) annotationLayers.forEach((l) => next.add(l));
    else annotationLayers.forEach((l) => next.delete(l));
    this.layers.set(next);
  }

  toggleType(k: string) {
    const next = new Set(this.hiddenTypes());
    if (next.has(k)) next.delete(k);
    else next.add(k);
    this.hiddenTypes.set(next);
  }

  toggleHighlight(key: string) {
    this.highlight.set(this.highlight() === key ? null : key);
  }

  togglePresentation() {
    this.presentation.update((v) => !v);
    this.canvas()?.cancelDraft();
    if (this.presentation()) this.host.nativeElement.querySelector('#aes-mapa')?.scrollIntoView({ block: 'start' });
  }

  // ---- Selección ----

  pick(id: string, additive: boolean) {
    const next = additive ? new Set(this.selectedIds()) : new Set<string>();
    if (additive && next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds.set(next);
    const a = this.all().find((x) => x.id === id);
    if (a?.zone && next.size === 1) this.highlight.set(a.zone);
    if (!this.rightOpen()) this.rightOpen.set(true);
  }

  clearSelection() {
    this.selectedIds.set(new Set());
    this.highlight.set(null);
  }

  // ---- Edición (todo cambio pasa por aquí para auditar, deshacer y autoguardar) ----

  snapshot() {
    if (this.ro()) return;
    this.undoStack.push(JSON.stringify(this.tracking.data.annotations));
    if (this.undoStack.length > HISTORY_MAX) this.undoStack.shift();
    this.redoStack = [];
    this.histRev.update((v) => v + 1);
  }

  private commitEdit() {
    this.tracking.touch();
  }

  create(req: CreateRequest) {
    if (this.ro()) return;
    const view = this.view();
    const cx = req.points?.length ? this.centroid(req.points) : { x: req.x, y: req.y };
    const zone = req.zone ?? regionAt(view, cx.x, cx.y);
    const category = this.category();
    const lat = lateralityAt(view, cx.x, zone);
    const date = this.session() || this.today;
    const mark: AesAnnotation = {
      id: newId(),
      view,
      x: req.x,
      y: req.y,
      zone,
      kind: category,
      date,
      procedureId: '',
      note: '',
      ...(req.shape !== 'point' ? { shape: req.shape } : {}),
      ...(req.points ? { points: req.points } : {}),
      ...(lat && (req.shape === 'point' || req.shape === 'zone') ? { laterality: lat as AesLaterality } : {}),
      ...(req.shape === 'text' ? { label: 'Texto' } : {}),
    };
    if (category === 'PROCEDIMIENTO') {
      mark.status = this.newStatus();
      mark.procType = this.procType();
      const linked = this.autoLink(mark.procType, date);
      if (linked) mark.procedureId = linked;
    }
    this.snapshot();
    this.tracking.data.annotations = [...this.tracking.data.annotations, mark];
    this.selectedIds.set(new Set([mark.id]));
    if (zone) this.highlight.set(zone);
    this.commitEdit();
    if (req.shape === 'text') setTimeout(() => this.host.nativeElement.querySelector<HTMLInputElement>('#fm-label-input')?.select());
  }

  createAtRegion(r: { key: string; cx: number; cy: number }) {
    this.create({ shape: 'zone', x: r.cx, y: r.cy, zone: r.key });
  }

  /** Vincula solo si hay un único registro en borrador del mismo tipo y fecha (sin adivinar). */
  private autoLink(type: string, date: string) {
    const match = this.procedures().filter((p) => p.type === type && p.date === date && p.status !== 'FIRMADO');
    return match.length === 1 ? match[0].id : '';
  }

  private centroid(points: number[]) {
    let x = 0;
    let y = 0;
    const n = points.length / 2;
    for (let i = 0; i + 1 < points.length; i += 2) {
      x += points[i];
      y += points[i + 1];
    }
    return { x: x / n, y: y / n };
  }

  drag(id: string, dx: number, dy: number) {
    const a = this.tracking.data.annotations.find((x) => x.id === id);
    if (!a || a.lockedAt || this.ro() || a.shape === 'zone') return;
    translateMark(a, dx, dy);
    if (!a.shape || a.shape === 'point' || a.shape === 'text') {
      const zone = regionAt(a.view, a.x, a.y);
      if (zone) a.zone = zone;
      if (a.laterality) a.laterality = (lateralityAt(a.view, a.x, a.zone) || a.laterality) as AesLaterality;
    }
    this.commitEdit();
  }

  patch(a: AesAnnotation, key: EditableKey, value: string, snap = true) {
    if (this.ro() || a.lockedAt) return;
    if (snap) this.snapshot();
    const rec = a as unknown as Record<string, unknown>;
    if (key === 'status') {
      if (a.kind === 'TRATADA' || a.kind === 'PLAN') a.kind = 'PROCEDIMIENTO';
      a.status = value as AesMarkStatus;
    } else if (value === '' && key !== 'note' && key !== 'zone' && key !== 'date' && key !== 'procedureId') {
      delete rec[key];
    } else {
      rec[key] = value;
    }
    if (key === 'zone' && value) this.highlight.set(value);
    this.commitEdit();
  }

  setCategory(a: AesAnnotation, value: string) {
    if (this.ro() || a.lockedAt) return;
    this.snapshot();
    const cat = value as Category;
    if (cat === 'PROCEDIMIENTO') {
      if (!isProcedureMark(a)) {
        a.kind = 'PROCEDIMIENTO';
        a.status = a.status ?? 'PLANEADO';
        a.procType = a.procType ?? this.procType();
      }
    } else {
      a.kind = cat;
    }
    this.commitEdit();
  }

  /** Acción expresa: dibujar una marca nunca la deja como realizada por sí sola. */
  confirmPerformed(a: AesAnnotation) {
    if (this.ro() || a.lockedAt) return;
    this.snapshot();
    a.kind = 'PROCEDIMIENTO';
    a.status = 'REALIZADO';
    this.commitEdit();
  }

  duplicate(a: AesAnnotation) {
    if (this.ro()) return;
    this.snapshot();
    const copy = duplicateMark(a, newId(), this.session() || this.today);
    this.tracking.data.annotations = [...this.tracking.data.annotations, copy];
    this.selectedIds.set(new Set([copy.id]));
    this.commitEdit();
  }

  private hasClinicalData(a: AesAnnotation) {
    return !!(a.note.trim() || a.quantity?.trim() || a.procedureId || markStatus(a) === 'REALIZADO');
  }

  erase(id: string) {
    const a = this.all().find((x) => x.id === id);
    if (!a || this.ro()) return;
    if (a.lockedAt) {
      this.say('La marca está cerrada y no se puede quitar. Registre una aclaración en una marca nueva.');
      return;
    }
    if (this.hasClinicalData(a) && !confirm('Esta marca tiene información registrada. ¿Quitarla del borrador?')) return;
    this.snapshot();
    this.tracking.data.annotations = this.tracking.data.annotations.filter((x) => x.id !== id);
    this.dropFromSelection([id]);
    this.commitEdit();
  }

  remove(a: AesAnnotation) {
    if (a.lockedAt || this.ro() || !confirm('¿Quitar esta marca del borrador del mapa facial?')) return;
    this.snapshot();
    this.tracking.data.annotations = this.tracking.data.annotations.filter((x) => x.id !== a.id);
    this.dropFromSelection([a.id]);
    this.commitEdit();
  }

  bulkRemove() {
    const ids = this.bulkEditable().map((a) => a.id);
    if (!ids.length || this.ro() || !confirm(`¿Quitar ${ids.length} marca(s) del borrador? Las cerradas se conservan.`)) return;
    this.snapshot();
    const set = new Set(ids);
    this.tracking.data.annotations = this.tracking.data.annotations.filter((x) => !set.has(x.id));
    this.dropFromSelection(ids);
    this.commitEdit();
  }

  bulkStatus(status: AesMarkStatus) {
    const list = this.bulkEditable().filter((a) => isProcedureMark(a));
    if (!list.length || this.ro()) {
      this.say('Ninguna de las marcas seleccionadas es un procedimiento editable.');
      return;
    }
    this.snapshot();
    for (const a of list) {
      a.kind = 'PROCEDIMIENTO';
      a.status = status;
    }
    this.commitEdit();
  }

  private dropFromSelection(ids: string[]) {
    const next = new Set(this.selectedIds());
    ids.forEach((id) => next.delete(id));
    this.selectedIds.set(next);
  }

  async close(a: AesAnnotation) {
    if (a.lockedAt || !confirm('Al cerrar la anotación ya no se podrá modificar ni quitar. ¿Continuar?')) return;
    a.close = true;
    this.busy.set(true);
    const ok = await this.tracking.commit();
    this.busy.set(false);
    if (!ok) {
      delete a.close;
      this.tracking.touch();
    }
  }

  undo() {
    this.travel(this.undoStack, this.redoStack);
  }

  redo() {
    this.travel(this.redoStack, this.undoStack);
  }

  private travel(from: string[], to: string[]) {
    if (this.ro() || !from.length) return;
    to.push(JSON.stringify(this.tracking.data.annotations));
    const snap = JSON.parse(from.pop()!) as AesAnnotation[];
    this.tracking.data.annotations = restoreSnapshot(snap, this.tracking.data.annotations);
    const ids = new Set(this.tracking.data.annotations.map((a) => a.id));
    this.selectedIds.set(new Set([...this.selectedIds()].filter((id) => ids.has(id))));
    this.histRev.update((v) => v + 1);
    this.commitEdit();
  }

  private say(msg: string) {
    this.flash.set(msg);
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flash.set(null), 5000);
  }

  // ---- Teclado ----

  key(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if (mod && k === 'y') {
      e.preventDefault();
      this.redo();
    } else if (e.key === 'Escape') {
      if (this.canvas()?.cancelDraft()) return;
      if (this.presentation()) this.presentation.set(false);
      else if (this.selectedIds().size) this.clearSelection();
      else this.tool.set('select');
    } else if (e.key === 'Enter' && this.tool() === 'polygon') {
      e.preventDefault();
      this.canvas()?.finishPolygon();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedIds().size && !this.ro()) {
      e.preventDefault();
      if (this.selectedIds().size === 1) this.erase([...this.selectedIds()][0]);
      else this.bulkRemove();
    } else if (!mod && (e.key === '+' || e.key === '=')) {
      this.canvas()?.zoomBy(1.25);
    } else if (!mod && e.key === '-') {
      this.canvas()?.zoomBy(1 / 1.25);
    } else if (!mod && e.key === '0') {
      this.canvas()?.reset();
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(e: BeforeUnloadEvent) {
    if (!this.tracking.hasUnsaved()) return;
    this.tracking.flush();
    e.preventDefault();
    e.returnValue = '';
  }
}
