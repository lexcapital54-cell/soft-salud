import { Component, computed, inject, input, signal } from '@angular/core';
import { HabIcon } from '../../habilitation/hab-icon';
import {
  AES_PROCEDURE_TYPES,
  AES_ZONES,
  consentsForProcedureType,
  newId,
  procedureTypeLabel,
  zoneLabel,
} from './aesthetic.models';
import {
  AES_UNITS,
  AesProcedure,
  AesProduct,
  DEVICE_TYPES,
  TOLERANCE_LABEL,
  TRACEABLE_TYPES,
  emptyProcedure,
  expiredAtProcedure,
  missingForSign,
  todayIso,
} from './aesthetic-tracking.models';
import { AestheticTrackingService } from './aesthetic-tracking.service';

type TextKey =
  | 'date'
  | 'type'
  | 'zoneDetail'
  | 'quantity'
  | 'unit'
  | 'preparation'
  | 'technique'
  | 'device'
  | 'parameters'
  | 'anesthesia'
  | 'asepsis'
  | 'incidents'
  | 'tolerance'
  | 'adverseEvents'
  | 'instructions'
  | 'nextControl'
  | 'consentRef'
  | 'notes';

/**
 * Registro de procedimientos estéticos con trazabilidad del producto. Cantidades,
 * diluciones y técnica las digita el profesional: el sistema no sugiere dosis.
 * Firmado, el procedimiento es inmutable y solo admite adendas.
 */
@Component({
  selector: 'app-aesthetic-procedures',
  imports: [HabIcon],
  styleUrls: ['./aesthetic.scss', './aesthetic-tracking.scss'],
  template: `
    @let ro = disabled() || !tracking.loaded();
    <section class="aes-block" id="aes-procedimientos">
      <div class="aes-head">
        <span class="aes-head-icon"><hab-icon name="package" /></span>
        <h4>Procedimientos realizados</h4>
        @if (!ro) {
          <button type="button" class="btn-add" (click)="add()"><hab-icon name="plus" /> Nuevo procedimiento</button>
        }
      </div>
      <p class="aes-help">
        Registre producto, lote, vencimiento e INVIMA de lo aplicado. Los campos con * son obligatorios para firmar
        inyectables e implantes. Una vez firmado no se modifica: las correcciones se hacen con adendas.
      </p>
      @if (error()) {
        <p class="alert-line error" role="alert"><hab-icon name="alert" /> {{ error() }}</p>
      }

      @if (!tracking.loaded()) {
        <p class="empty">{{ tracking.status() === 'error' ? tracking.message() : 'Cargando procedimientos…' }}</p>
      } @else if (!list().length) {
        <p class="empty">Aún no hay procedimientos registrados para este paciente.</p>
      } @else {
        <div class="proc-list">
          @for (p of list(); track p.id) {
            @let signed = p.status === 'FIRMADO';
            @let edit = !ro && !signed;
            @let isOpen = openId() === p.id;
            <article class="proc-card" [class.signed]="signed">
              <button type="button" class="proc-summary" [attr.aria-expanded]="isOpen" (click)="toggle(p.id)">
                <hab-icon [name]="isOpen ? 'chevronDown' : 'chevronRight'" />
                <span class="title">{{ typeLabel(p.type) }}</span>
                <span class="sub">{{ p.date || 'sin fecha' }}{{ zonesText(p) ? ' · ' + zonesText(p) : '' }}</span>
                @if (signed) {
                  <span class="badge signed"><hab-icon name="shield" /> Firmado</span>
                } @else {
                  <span class="badge">Borrador</span>
                }
                @if (expired(p)) {
                  <span class="badge warn">Producto vencido</span>
                }
                @if (!signed && pendingConsent(p)) {
                  <span class="badge warn">Consentimiento pendiente</span>
                }
                @if (p.addenda.length) {
                  <span class="badge">{{ p.addenda.length }} adenda(s)</span>
                }
              </button>

              @if (isOpen) {
                @if (signed) {
                  <dl class="readout">
                    @for (row of readout(p); track row[0]) {
                      <div [class.wide]="row[2]"><dt>{{ row[0] }}</dt><dd>{{ row[1] }}</dd></div>
                    }
                  </dl>
                  <p class="meta">Firmado por {{ p.signedBy || '—' }} · {{ fmt(p.signedAt) }}</p>
                  <h5 class="aes-sub">Adendas</h5>
                  @if (p.addenda.length) {
                    <ul class="addenda">
                      @for (a of p.addenda; track a.id) {
                        <li>{{ a.text }}<p class="meta">{{ a.by || '—' }} · {{ fmt(a.at) }}</p></li>
                      }
                    </ul>
                  } @else {
                    <p class="meta">Sin adendas.</p>
                  }
                  @if (!ro) {
                    <label class="aes-field">
                      Nueva adenda
                      <textarea rows="2" [value]="addendum()[p.id] || ''" (input)="setAddendum(p.id, $event)"
                        placeholder="Corrección o información complementaria; queda con su fecha y autor"></textarea>
                    </label>
                    <div class="card-actions">
                      <button type="button" class="btn-primary" [disabled]="busy() || !(addendum()[p.id] || '').trim()"
                        (click)="addAddendum(p)">
                        <hab-icon name="filePlus" /> Registrar adenda
                      </button>
                    </div>
                  }
                } @else {
                  @let trace = traceable(p.type);
                  <div class="aes-grid-narrow">
                    <label class="aes-field">
                      <span class="req">Fecha</span>
                      <input type="date" [value]="p.date" [readOnly]="!edit" (change)="set(p, 'date', $event)" />
                    </label>
                    <label class="aes-field">
                      <span class="req">Procedimiento</span>
                      <select [value]="p.type" [disabled]="!edit" (change)="set(p, 'type', $event)">
                        <option value="">Seleccione…</option>
                        @for (t of types; track t.key) {
                          <option [value]="t.key">{{ t.label }}</option>
                        }
                      </select>
                    </label>
                  </div>
                  @if (pendingConsent(p); as names) {
                    <p class="alert-line" role="status">
                      <hab-icon name="alert" /> El paciente no tiene firmado un consentimiento para este procedimiento
                      ({{ names }}). Fírmelo en la sección de consentimientos o registre abajo el documento en papel.
                    </p>
                  }

                  <div>
                    <span class="aes-sub req">Zonas tratadas</span>
                    <div class="chips" role="group" aria-label="Zonas tratadas">
                      @for (z of zones; track z.key) {
                        <button type="button" class="chip" [class.on]="p.zones.includes(z.key)" [disabled]="!edit"
                          [attr.aria-pressed]="p.zones.includes(z.key)" (click)="toggleZone(p, z.key)">
                          {{ z.label }}
                        </button>
                      }
                    </div>
                  </div>
                  <label class="aes-field">
                    Detalle de la zona
                    <input [value]="p.zoneDetail" [readOnly]="!edit" (input)="set(p, 'zoneDetail', $event)"
                      placeholder="Lado, subunidad o zona corporal" />
                  </label>

                  <h5 class="aes-sub">Producto</h5>
                  <div class="aes-grid-narrow">
                    <label class="aes-field">
                      <span [class.req]="trace">Producto</span>
                      <input [value]="p.product.name" [readOnly]="!edit" (input)="setProduct(p, 'name', $event)" />
                    </label>
                    <label class="aes-field">
                      Marca
                      <input [value]="p.product.brand" [readOnly]="!edit" (input)="setProduct(p, 'brand', $event)" />
                    </label>
                    <label class="aes-field">
                      Fabricante
                      <input [value]="p.product.manufacturer" [readOnly]="!edit" (input)="setProduct(p, 'manufacturer', $event)" />
                    </label>
                    <label class="aes-field">
                      Presentación
                      <input [value]="p.product.presentation" [readOnly]="!edit" (input)="setProduct(p, 'presentation', $event)" />
                    </label>
                    <label class="aes-field">
                      <span [class.req]="trace">Lote</span>
                      <input [value]="p.product.lot" [readOnly]="!edit" (input)="setProduct(p, 'lot', $event)" />
                    </label>
                    <label class="aes-field">
                      Fecha de vencimiento
                      <input type="date" [value]="p.product.expiry" [readOnly]="!edit" (change)="setProduct(p, 'expiry', $event)" />
                    </label>
                    <label class="aes-field">
                      Registro INVIMA
                      <input [value]="p.product.invima" [readOnly]="!edit" (input)="setProduct(p, 'invima', $event)" />
                    </label>
                  </div>
                  @if (expired(p)) {
                    <p class="alert-line" role="alert">
                      <hab-icon name="alert" /> El vencimiento registrado es anterior a la fecha del procedimiento. Verifique el producto.
                    </p>
                  }

                  <h5 class="aes-sub">Aplicación</h5>
                  <div class="aes-grid-narrow">
                    <label class="aes-field">
                      <span [class.req]="trace">Cantidad aplicada</span>
                      <input inputmode="decimal" [value]="p.quantity" [readOnly]="!edit" (input)="set(p, 'quantity', $event)"
                        placeholder="Digitada por el profesional" />
                    </label>
                    <label class="aes-field">
                      <span [class.req]="trace">Unidad</span>
                      <select [value]="p.unit" [disabled]="!edit" (change)="set(p, 'unit', $event)">
                        <option value="">Seleccione…</option>
                        @for (u of units; track u) {
                          <option [value]="u">{{ u }}</option>
                        }
                      </select>
                    </label>
                    <label class="aes-field">
                      Reconstitución / preparación
                      <input [value]="p.preparation" [readOnly]="!edit" (input)="set(p, 'preparation', $event)" />
                    </label>
                    <label class="aes-field">
                      Anestesia
                      <input [value]="p.anesthesia" [readOnly]="!edit" (input)="set(p, 'anesthesia', $event)" placeholder="Tipo o ninguna" />
                    </label>
                    @if (deviceType(p.type)) {
                      <label class="aes-field">
                        Equipo o agente
                        <input [value]="p.device" [readOnly]="!edit" (input)="set(p, 'device', $event)" />
                      </label>
                      <label class="aes-field">
                        Parámetros utilizados
                        <input [value]="p.parameters" [readOnly]="!edit" (input)="set(p, 'parameters', $event)" />
                      </label>
                    }
                  </div>
                  <div class="aes-grid-wide">
                    <label class="aes-field">
                      Técnica realizada
                      <textarea rows="2" [value]="p.technique" [readOnly]="!edit" (input)="set(p, 'technique', $event)"></textarea>
                    </label>
                    <label class="aes-field">
                      Asepsia y antisepsia
                      <textarea rows="2" [value]="p.asepsis" [readOnly]="!edit" (input)="set(p, 'asepsis', $event)"></textarea>
                    </label>
                  </div>

                  <h5 class="aes-sub">Resultado inmediato</h5>
                  <div class="aes-grid-narrow">
                    <label class="aes-field">
                      Tolerancia
                      <select [value]="p.tolerance" [disabled]="!edit" (change)="set(p, 'tolerance', $event)">
                        <option value="">Sin registrar</option>
                        @for (t of tolerances; track t[0]) {
                          <option [value]="t[0]">{{ t[1] }}</option>
                        }
                      </select>
                    </label>
                    <label class="aes-field">
                      Próximo control
                      <input type="date" [value]="p.nextControl" [readOnly]="!edit" (change)="set(p, 'nextControl', $event)" />
                    </label>
                    <label class="aes-field">
                      Consentimiento
                      <input [value]="p.consentRef" [readOnly]="!edit" (input)="set(p, 'consentRef', $event)"
                        placeholder="Documento y fecha de firma" />
                    </label>
                  </div>
                  <div class="aes-grid-wide">
                    <label class="aes-field">
                      Incidentes durante el procedimiento
                      <textarea rows="2" [value]="p.incidents" [readOnly]="!edit" (input)="set(p, 'incidents', $event)"></textarea>
                    </label>
                    <label class="aes-field">
                      Eventos adversos
                      <textarea rows="2" [value]="p.adverseEvents" [readOnly]="!edit" (input)="set(p, 'adverseEvents', $event)"></textarea>
                    </label>
                    <label class="aes-field">
                      Indicaciones posteriores
                      <textarea rows="2" [value]="p.instructions" [readOnly]="!edit" (input)="set(p, 'instructions', $event)"></textarea>
                    </label>
                    <label class="aes-field">
                      Observaciones
                      <textarea rows="2" [value]="p.notes" [readOnly]="!edit" (input)="set(p, 'notes', $event)"></textarea>
                    </label>
                  </div>
                  @if (linkedMarks(p.id); as n) {
                    <p class="meta">{{ n }} marca(s) del mapa facial ligadas; se cierran al firmar.</p>
                  }
                  @if (edit) {
                    <div class="card-actions">
                      <button type="button" class="btn-remove" (click)="remove(p)"><hab-icon name="trash" /> Eliminar borrador</button>
                      @if (canSign()) {
                        <button type="button" class="btn-sign" [disabled]="busy()" (click)="sign(p)">
                          <hab-icon name="shield" /> Firmar procedimiento
                        </button>
                      }
                    </div>
                  }
                }
              }
            </article>
          }
        </div>
      }
    </section>
  `,
})
export class AestheticProcedures {
  readonly tracking = inject(AestheticTrackingService);
  readonly disabled = input(false);
  readonly canSign = input(false);
  readonly encounterId = input('');
  /** Códigos de plantilla con consentimiento firmado y no revocado; null mientras carga. */
  readonly signedConsentCodes = input<string[] | null>(null);

  readonly types = AES_PROCEDURE_TYPES;
  readonly zones = AES_ZONES;
  readonly units = AES_UNITS;
  readonly tolerances = Object.entries(TOLERANCE_LABEL);

  readonly openId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly addendum = signal<Record<string, string>>({});

  readonly list = computed(() => {
    this.tracking.rev();
    return [...this.tracking.data.procedures].sort(
      (a, b) => b.date.localeCompare(a.date) || (b._audit?.createdAt || '').localeCompare(a._audit?.createdAt || ''),
    );
  });

  typeLabel(key: string) {
    return key ? procedureTypeLabel(key) : 'Procedimiento sin tipo';
  }

  zonesText(p: AesProcedure) {
    return [...p.zones.map(zoneLabel), p.zoneDetail.trim()].filter(Boolean).join(', ');
  }

  traceable(type: string) {
    return TRACEABLE_TYPES.has(type);
  }

  deviceType(type: string) {
    return DEVICE_TYPES.has(type);
  }

  expired(p: AesProcedure) {
    return expiredAtProcedure(p);
  }

  /**
   * Nombres de las plantillas aplicables si ninguna está firmada y vigente; vacío si
   * hay una firmada, si se registró un consentimiento en papel, si el tipo no tiene
   * plantilla o si aún no se conoce la lista.
   */
  pendingConsent(p: AesProcedure): string {
    const signed = this.signedConsentCodes();
    if (!signed || p.consentRef.trim()) return '';
    const options = consentsForProcedureType(p.type);
    if (!options.length || options.some((c) => signed.includes(c.code))) return '';
    return options.map((c) => c.label).join(' o ');
  }

  linkedMarks(id: string) {
    return this.tracking.data.annotations.filter((a) => a.procedureId === id).length;
  }

  fmt(iso?: string) {
    return iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '';
  }

  toggle(id: string) {
    this.openId.update((cur) => (cur === id ? null : id));
  }

  add() {
    const p = emptyProcedure(newId(), todayIso(), this.encounterId());
    this.tracking.data.procedures = [...this.tracking.data.procedures, p];
    this.openId.set(p.id);
    this.error.set(null);
    this.tracking.touch();
  }

  set(p: AesProcedure, key: TextKey, e: Event) {
    if (p.status === 'FIRMADO') return;
    (p as unknown as Record<string, string>)[key] = (e.target as HTMLInputElement).value;
    this.tracking.touch();
  }

  setProduct(p: AesProcedure, key: keyof AesProduct, e: Event) {
    if (p.status === 'FIRMADO') return;
    p.product[key] = (e.target as HTMLInputElement).value;
    this.tracking.touch();
  }

  toggleZone(p: AesProcedure, key: string) {
    if (p.status === 'FIRMADO') return;
    p.zones = p.zones.includes(key) ? p.zones.filter((z) => z !== key) : [...p.zones, key];
    this.tracking.touch();
  }

  remove(p: AesProcedure) {
    if (p.status === 'FIRMADO' || !confirm('¿Eliminar este procedimiento en borrador?')) return;
    this.tracking.data.procedures = this.tracking.data.procedures.filter((x) => x.id !== p.id);
    for (const a of this.tracking.data.annotations) {
      if (a.procedureId === p.id && !a.lockedAt) a.procedureId = '';
    }
    this.tracking.touch();
  }

  async sign(p: AesProcedure) {
    this.error.set(null);
    const missing = missingForSign(p);
    if (missing.length) {
      this.error.set(`Para firmar el procedimiento complete: ${missing.join(', ')}.`);
      return;
    }
    let warn = expiredAtProcedure(p) ? '\n\nAtención: el producto figura vencido a la fecha del procedimiento.' : '';
    const consent = this.pendingConsent(p);
    if (consent) warn += `\n\nAtención: no hay consentimiento firmado en el sistema (${consent}).`;
    if (!confirm(`Al firmar, el procedimiento no se podrá modificar ni eliminar; solo admitirá adendas.${warn}\n\n¿Firmar ahora?`)) return;
    p.status = 'FIRMADO';
    this.busy.set(true);
    const ok = await this.tracking.commit();
    this.busy.set(false);
    if (!ok) {
      const current = this.tracking.data.procedures.find((x) => x.id === p.id);
      if (current && !current.signedAt) current.status = 'BORRADOR';
      this.error.set(this.tracking.message() || 'No se pudo firmar el procedimiento.');
      this.tracking.touch();
    }
  }

  setAddendum(id: string, e: Event) {
    const text = (e.target as HTMLTextAreaElement).value;
    this.addendum.update((m) => ({ ...m, [id]: text }));
  }

  async addAddendum(p: AesProcedure) {
    const text = (this.addendum()[p.id] || '').trim();
    if (!text || p.status !== 'FIRMADO') return;
    this.error.set(null);
    const entry = { id: newId(), text };
    p.addenda = [...p.addenda, entry];
    this.busy.set(true);
    const ok = await this.tracking.commit();
    this.busy.set(false);
    if (ok) {
      this.addendum.update((m) => ({ ...m, [p.id]: '' }));
    } else {
      const current = this.tracking.data.procedures.find((x) => x.id === p.id);
      if (current) current.addenda = current.addenda.filter((a) => a.id !== entry.id);
      this.error.set(this.tracking.message() || 'No se pudo registrar la adenda.');
      this.tracking.touch();
    }
  }

  readout(p: AesProcedure): Array<[string, string, boolean?]> {
    const rows: Array<[string, string, boolean?]> = [
      ['Fecha', p.date],
      ['Zonas', this.zonesText(p)],
      ['Producto', [p.product.name, p.product.brand].filter(Boolean).join(' · ')],
      ['Fabricante', p.product.manufacturer],
      ['Presentación', p.product.presentation],
      ['Lote', p.product.lot],
      ['Vencimiento', p.product.expiry],
      ['Registro INVIMA', p.product.invima],
      ['Cantidad', [p.quantity, p.unit].filter(Boolean).join(' ')],
      ['Reconstitución / preparación', p.preparation],
      ['Anestesia', p.anesthesia],
      ['Equipo o agente', p.device],
      ['Parámetros', p.parameters],
      ['Tolerancia', p.tolerance ? TOLERANCE_LABEL[p.tolerance] : ''],
      ['Próximo control', p.nextControl],
      ['Consentimiento', p.consentRef],
      ['Técnica realizada', p.technique, true],
      ['Asepsia y antisepsia', p.asepsis, true],
      ['Incidentes', p.incidents, true],
      ['Eventos adversos', p.adverseEvents, true],
      ['Indicaciones posteriores', p.instructions, true],
      ['Observaciones', p.notes, true],
    ];
    return rows.filter((r) => r[1].trim());
  }
}
