import { Component, computed, inject, input, signal } from '@angular/core';
import { HabIcon } from '../../habilitation/hab-icon';
import { EAR, FACE_OUTLINE, MIRROR, faceFeatures } from '../dentistry/ortho-face-outline';
import { AES_ZONES, newId, procedureTypeLabel, zoneLabel } from './aesthetic.models';
import {
  AES_MARK_KINDS,
  AES_VIEWS,
  AesAnnotation,
  AesMarkKind,
  AesView,
  markKind,
  todayIso,
} from './aesthetic-tracking.models';
import { AestheticTrackingService } from './aesthetic-tracking.service';

interface ZoneShape {
  key: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** Zonas frontales; las bilaterales se repiten reflejadas. Orden: de grandes a pequeñas para que las pequeñas queden encima. */
const FRONTAL_ZONES: Array<ZoneShape & { both?: boolean }> = [
  { key: 'cuello', cx: 100, cy: 238, rx: 24, ry: 15 },
  { key: 'frente', cx: 100, cy: 50, rx: 42, ry: 19 },
  { key: 'temporal', cx: 52, cy: 80, rx: 9, ry: 15, both: true },
  { key: 'pomulos', cx: 60, cy: 114, rx: 12, ry: 9, both: true },
  { key: 'malar', cx: 76, cy: 132, rx: 12, ry: 9, both: true },
  { key: 'mandibular', cx: 66, cy: 172, rx: 13, ry: 8, both: true },
  { key: 'menton', cx: 100, cy: 192, rx: 15, ry: 9 },
  { key: 'submentoniana', cx: 100, cy: 215, rx: 17, ry: 6 },
  { key: 'periorbitaria', cx: 77, cy: 95, rx: 16, ry: 9, both: true },
  { key: 'nasogeniano', cx: 87, cy: 141, rx: 5, ry: 11, both: true },
  { key: 'labios', cx: 100, cy: 156, rx: 17, ry: 8 },
  { key: 'nariz', cx: 100, cy: 112, rx: 8, ry: 18 },
  { key: 'glabela', cx: 100, cy: 80, rx: 8, ry: 6 },
];

/** Perfil derecho con la nariz hacia la derecha del lector; el izquierdo se refleja. */
const PROFILE_ZONES: ZoneShape[] = [
  { key: 'cuello', cx: 88, cy: 232, rx: 26, ry: 16 },
  { key: 'frente', cx: 138, cy: 50, rx: 18, ry: 20 },
  { key: 'temporal', cx: 110, cy: 80, rx: 13, ry: 13 },
  { key: 'mandibular', cx: 112, cy: 172, rx: 18, ry: 8 },
  { key: 'pomulos', cx: 128, cy: 114, rx: 11, ry: 8 },
  { key: 'malar', cx: 136, cy: 132, rx: 10, ry: 8 },
  { key: 'submentoniana', cx: 130, cy: 203, rx: 12, ry: 6 },
  { key: 'menton', cx: 153, cy: 178, rx: 8, ry: 10 },
  { key: 'periorbitaria', cx: 144, cy: 98, rx: 9, ry: 7 },
  { key: 'nasogeniano', cx: 152, cy: 141, rx: 4, ry: 8 },
  { key: 'labios', cx: 160, cy: 152, rx: 5, ry: 7 },
  { key: 'nariz', cx: 163, cy: 114, rx: 7, ry: 11 },
  { key: 'glabela', cx: 155, cy: 84, rx: 5, ry: 5 },
];

/** Vista a 45° derecha (nariz hacia la derecha del lector); la izquierda se refleja. */
const OBLIQUE_ZONES: ZoneShape[] = [
  { key: 'cuello', cx: 100, cy: 232, rx: 28, ry: 16 },
  { key: 'frente', cx: 108, cy: 50, rx: 36, ry: 18 },
  { key: 'temporal', cx: 64, cy: 82, rx: 10, ry: 14 },
  { key: 'pomulos', cx: 76, cy: 114, rx: 12, ry: 9 },
  { key: 'malar', cx: 94, cy: 132, rx: 12, ry: 8 },
  { key: 'mandibular', cx: 80, cy: 172, rx: 16, ry: 8 },
  { key: 'submentoniana', cx: 118, cy: 203, rx: 14, ry: 6 },
  { key: 'menton', cx: 134, cy: 182, rx: 11, ry: 9 },
  { key: 'periorbitaria', cx: 85, cy: 96, rx: 14, ry: 8 },
  { key: 'periorbitaria', cx: 124, cy: 96, rx: 9, ry: 7 },
  { key: 'nasogeniano', cx: 116, cy: 140, rx: 4, ry: 10 },
  { key: 'labios', cx: 132, cy: 153, rx: 13, ry: 6 },
  { key: 'nariz', cx: 138, cy: 112, rx: 7, ry: 15 },
  { key: 'glabela', cx: 112, cy: 82, rx: 6, ry: 5 },
];

const OBLIQUE_OUTLINE =
  'M100,16 C140,16 158,40 156,70 C156,84 152,92 154,100 L166,122 C168,126 164,129 158,129 ' +
  'C158,136 160,140 156,144 C158,150 156,156 150,158 C152,168 148,180 140,188 C130,198 116,202 104,200 ' +
  'C84,198 64,186 56,168 C48,150 44,130 44,108 C44,60 62,16 100,16 ' +
  'M56,100 C46,98 42,110 44,120 C46,130 52,134 58,132 ' +
  'M70,186 C72,210 70,236 66,256 M136,192 C134,215 136,240 140,256';
const OBLIQUE_DETAIL =
  'M70,84 Q84,78 98,82 M112,82 Q124,79 136,84 M72,96 Q84,90 96,96 Q84,101 72,96 ' +
  'M114,96 Q124,91 134,96 Q124,100 114,96 M128,92 C132,106 140,116 146,124 Q140,130 130,128 ' +
  'M118,152 Q132,147 146,152 Q132,158 118,152';

const PROFILE_OUTLINE =
  'M110,16 C150,16 160,40 158,66 C158,76 156,82 158,88 C160,92 156,96 156,100 L172,124 C174,128 170,132 162,132 ' +
  'C164,138 166,142 162,146 C166,150 164,156 158,158 C162,166 160,176 154,184 C150,196 140,198 128,196 L112,200 ' +
  'C112,215 114,235 116,256 M58,256 C60,230 62,212 60,196 C48,184 40,160 40,120 C40,60 60,16 110,16';
const PROFILE_DETAIL =
  'M88,96 C98,96 100,128 88,128 C80,128 78,96 88,96 M86,130 C92,170 108,190 128,196 M144,100 Q149,97 153,100';

const FRONT = faceFeatures(84, 130, 208);
const NECK = 'M80,198 C80,220 78,240 76,256 M120,198 C120,220 122,240 124,256';

/**
 * Mapa facial interactivo: marcas por vista, zona y sesión. Solo registra lo que el
 * profesional observa o realiza; no sugiere puntos de inyección, dosis ni técnica.
 */
@Component({
  selector: 'app-aesthetic-face-map',
  imports: [HabIcon],
  styleUrls: ['./aesthetic.scss', './aesthetic-tracking.scss'],
  template: `
    @let ro = disabled() || !tracking.loaded();
    <section class="aes-block" id="aes-mapa">
      <div class="aes-head">
        <span class="aes-head-icon"><hab-icon name="eye" /></span>
        <h4>Mapa facial</h4>
      </div>
      <p class="aes-help">
        Seleccione el tipo de marca y toque la zona del rostro. Las marcas ligadas a un procedimiento firmado,
        o cerradas, quedan bloqueadas. El mapa no sugiere puntos, dosis ni técnica.
      </p>

      <div class="map-toolbar">
        <div class="seg" role="tablist" aria-label="Vista del rostro">
          @for (v of views; track v.key) {
            <button type="button" role="tab" [attr.aria-selected]="view() === v.key" [class.on]="view() === v.key" (click)="setView(v.key)">
              {{ v.label }}
            </button>
          }
        </div>
        <label class="aes-field inline">
          Sesión
          <select [value]="session()" (change)="session.set(val($event))">
            <option value="">Todas</option>
            @for (s of sessions(); track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </label>
      </div>

      <div class="legend" role="radiogroup" aria-label="Tipo de marca">
        @for (k of kinds; track k.key) {
          <button type="button" role="radio" class="legend-item" [attr.aria-checked]="kind() === k.key"
            [class.on]="kind() === k.key" [disabled]="ro" (click)="kind.set(k.key)">
            <span class="dot" [style.background]="k.color"></span>{{ k.label }}
          </button>
        }
      </div>

      @if (!tracking.loaded()) {
        <p class="empty">{{ tracking.status() === 'error' ? tracking.message() : 'Cargando mapa facial…' }}</p>
      } @else {
        <div class="map-layout">
          <div class="map-canvas">
            <svg viewBox="0 0 200 260" role="group" [attr.aria-label]="'Rostro, vista ' + viewLabel()"
              (click)="addAt($event, '')">
              <rect x="0" y="0" width="200" height="260" fill="#fff" />
              @if (view() === 'FRONTAL') {
                <g class="outline">
                  <path [attr.d]="outline" />
                  <path [attr.d]="ear" />
                  <path [attr.d]="ear" [attr.transform]="mirror" />
                  <path [attr.d]="neck" />
                  <path class="fine" [attr.d]="front.brows" />
                  <path class="fine" [attr.d]="front.eyes" />
                  <path class="fine" [attr.d]="front.nose" />
                  <path class="fine" [attr.d]="front.lips" />
                </g>
              } @else if (isOblique()) {
                <g class="outline" [attr.transform]="view() === 'OBLICUA_IZQ' ? mirror : null">
                  <path [attr.d]="oblique" />
                  <path class="fine" [attr.d]="obliqueDetail" />
                </g>
              } @else {
                <g class="outline" [attr.transform]="view() === 'IZQUIERDO' ? mirror : null">
                  <path [attr.d]="profile" />
                  <path class="fine" [attr.d]="profileDetail" />
                </g>
              }
              @for (z of shapes(); track $index) {
                <ellipse class="zone" [class.marked]="markedZones().has(z.key)" [class.ro]="ro"
                  [attr.cx]="z.cx" [attr.cy]="z.cy" [attr.rx]="z.rx" [attr.ry]="z.ry"
                  [attr.tabindex]="ro ? -1 : 0" role="button"
                  [attr.aria-label]="'Agregar marca en ' + zoneName(z.key)"
                  (click)="addAt($event, z.key); $event.stopPropagation()"
                  (keydown.enter)="addCenter(z)" (keydown.space)="addCenter(z); $event.preventDefault()">
                  <title>{{ zoneName(z.key) }}</title>
                </ellipse>
              }
              @for (m of visible(); track m.id; let i = $index) {
                <g class="mark" [class.sel]="selectedId() === m.id" tabindex="0" role="button"
                  [attr.aria-label]="'Marca ' + (i + 1) + ': ' + kindLabel(m.kind) + ', ' + zoneName(m.zone)"
                  (click)="select(m.id); $event.stopPropagation()" (keydown.enter)="select(m.id)">
                  <circle [attr.cx]="m.x" [attr.cy]="m.y" r="6" [attr.fill]="kindColor(m.kind)" />
                  @if (m.lockedAt) {
                    <circle [attr.cx]="m.x" [attr.cy]="m.y" r="8" class="lock-ring" [attr.stroke]="kindColor(m.kind)" />
                  }
                  <text [attr.x]="m.x" [attr.y]="m.y + 2.4">{{ i + 1 }}</text>
                </g>
              }
            </svg>
          </div>

          <div class="map-side">
            @if (selected(); as m) {
              @let locked = !!m.lockedAt;
              @let edit = !ro && !locked;
              <div class="mark-card">
                <div class="mark-card-head">
                  <span class="dot" [style.background]="kindColor(m.kind)"></span>
                  <strong>{{ kindLabel(m.kind) }}</strong>
                  @if (locked) {
                    <span class="badge signed">Cerrada</span>
                  } @else {
                    <span class="badge">Editable</span>
                  }
                  <button type="button" class="icon-btn" aria-label="Cerrar detalle" (click)="selectedId.set(null)">
                    <hab-icon name="x" />
                  </button>
                </div>
                <div class="aes-grid-narrow">
                  <label class="aes-field">
                    Tipo
                    <select [value]="m.kind" [disabled]="!edit" (change)="patch(m, 'kind', val($event))">
                      @for (k of kinds; track k.key) {
                        <option [value]="k.key">{{ k.label }}</option>
                      }
                    </select>
                  </label>
                  <label class="aes-field">
                    Zona
                    <select [value]="m.zone" [disabled]="!edit" (change)="patch(m, 'zone', val($event))">
                      <option value="">Sin zona</option>
                      @for (z of zones; track z.key) {
                        <option [value]="z.key">{{ z.label }}</option>
                      }
                    </select>
                  </label>
                  <label class="aes-field">
                    Fecha de la sesión
                    <input type="date" [value]="m.date" [readOnly]="!edit" (change)="patch(m, 'date', val($event))" />
                  </label>
                  <label class="aes-field">
                    Procedimiento relacionado
                    <select [value]="m.procedureId" [disabled]="!edit" (change)="patch(m, 'procedureId', val($event))">
                      <option value="">Ninguno</option>
                      @for (p of procedureOptions(); track p.id) {
                        <option [value]="p.id">{{ p.label }}</option>
                      }
                    </select>
                  </label>
                </div>
                <label class="aes-field">
                  Observación
                  <textarea rows="3" [value]="m.note" [readOnly]="!edit" (input)="patch(m, 'note', val($event))"
                    placeholder="Lo observado o realizado en esta zona"></textarea>
                </label>
                @if (locked) {
                  <p class="meta">Cerrada por {{ m.lockedBy || '—' }} · {{ fmt(m.lockedAt) }}</p>
                } @else if (m._audit?.createdBy) {
                  <p class="meta">Registrada por {{ m._audit?.createdBy }} · {{ fmt(m._audit?.createdAt) }}</p>
                }
                @if (edit) {
                  <div class="card-actions">
                    <button type="button" class="btn-remove" (click)="remove(m)"><hab-icon name="trash" /> Eliminar</button>
                    @if (canSign()) {
                      <button type="button" class="btn-sign" [disabled]="busy()" (click)="close(m)">
                        <hab-icon name="shield" /> Cerrar anotación
                      </button>
                    }
                  </div>
                }
              </div>
            } @else {
              <p class="empty">
                {{ ro ? 'Seleccione una marca para ver su detalle.' : 'Toque una zona del rostro para agregar una marca o seleccione una existente.' }}
              </p>
            }

            <h5 class="aes-sub">Marcas en esta vista ({{ visible().length }})</h5>
            @if (!visible().length) {
              <p class="empty">Sin marcas{{ session() ? ' en la sesión ' + session() : '' }}.</p>
            } @else {
              <ol class="mark-list">
                @for (m of visible(); track m.id; let i = $index) {
                  <li>
                    <button type="button" [class.sel]="selectedId() === m.id" (click)="select(m.id)">
                      <span class="num" [style.background]="kindColor(m.kind)">{{ i + 1 }}</span>
                      <span class="txt">
                        <strong>{{ zoneName(m.zone) }}</strong> · {{ kindLabel(m.kind) }} · {{ m.date || 'sin fecha' }}
                        @if (m.note) {
                          <small>{{ m.note }}</small>
                        }
                      </span>
                      @if (m.lockedAt) {
                        <hab-icon name="shield" />
                      }
                    </button>
                  </li>
                }
              </ol>
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class AestheticFaceMap {
  readonly tracking = inject(AestheticTrackingService);
  readonly disabled = input(false);
  readonly canSign = input(false);

  readonly views = AES_VIEWS;
  readonly kinds = AES_MARK_KINDS;
  readonly zones = AES_ZONES;
  readonly outline = FACE_OUTLINE;
  readonly ear = EAR;
  readonly mirror = MIRROR;
  readonly neck = NECK;
  readonly front = FRONT;
  readonly profile = PROFILE_OUTLINE;
  readonly profileDetail = PROFILE_DETAIL;
  readonly oblique = OBLIQUE_OUTLINE;
  readonly obliqueDetail = OBLIQUE_DETAIL;

  readonly view = signal<AesView>('FRONTAL');
  readonly kind = signal<AesMarkKind>('HALLAZGO');
  readonly session = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly busy = signal(false);

  readonly shapes = computed<ZoneShape[]>(() => {
    const v = this.view();
    if (v === 'FRONTAL') {
      return FRONTAL_ZONES.flatMap((z) => (z.both ? [z, { ...z, cx: 200 - z.cx }] : [z]));
    }
    if (v === 'OBLICUA_DER' || v === 'OBLICUA_IZQ') {
      return v === 'OBLICUA_IZQ' ? OBLIQUE_ZONES.map((z) => ({ ...z, cx: 200 - z.cx })) : OBLIQUE_ZONES;
    }
    return v === 'IZQUIERDO' ? PROFILE_ZONES.map((z) => ({ ...z, cx: 200 - z.cx })) : PROFILE_ZONES;
  });

  isOblique() {
    const v = this.view();
    return v === 'OBLICUA_DER' || v === 'OBLICUA_IZQ';
  }

  private readonly all = computed(() => {
    this.tracking.rev();
    return this.tracking.data.annotations;
  });

  readonly sessions = computed(() =>
    [...new Set(this.all().map((a) => a.date).filter(Boolean))].sort().reverse(),
  );

  readonly visible = computed(() => {
    const v = this.view();
    const s = this.session();
    return this.all().filter((a) => a.view === v && (!s || a.date === s));
  });

  readonly markedZones = computed(() => new Set(this.visible().map((a) => a.zone)));

  readonly selected = computed(() => {
    const id = this.selectedId();
    return id ? (this.all().find((a) => a.id === id) ?? null) : null;
  });

  readonly procedureOptions = computed(() => {
    this.tracking.rev();
    return [...this.tracking.data.procedures]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((p) => ({
        id: p.id,
        label: `${p.date || 'sin fecha'} · ${procedureTypeLabel(p.type)}${p.status === 'FIRMADO' ? ' (firmado)' : ''}`,
      }));
  });

  viewLabel() {
    return AES_VIEWS.find((v) => v.key === this.view())?.label ?? '';
  }

  setView(v: AesView) {
    this.view.set(v);
    this.selectedId.set(null);
  }

  zoneName(key: string) {
    return key ? zoneLabel(key) : 'Sin zona';
  }

  kindLabel(key: string) {
    return markKind(key).label;
  }

  kindColor(key: string) {
    return markKind(key).color;
  }

  val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  fmt(iso?: string) {
    return iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '';
  }

  select(id: string) {
    this.selectedId.set(id);
  }

  addAt(event: MouseEvent, zone: string) {
    if (this.disabled() || !this.tracking.loaded()) return;
    const svg = (event.currentTarget as Element).closest('svg') as SVGSVGElement | null;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    this.add(Math.round(pt.x * 10) / 10, Math.round(pt.y * 10) / 10, zone);
  }

  addCenter(z: ZoneShape) {
    if (this.disabled() || !this.tracking.loaded()) return;
    this.add(z.cx, z.cy, z.key);
  }

  private add(x: number, y: number, zone: string) {
    const mark: AesAnnotation = {
      id: newId(),
      view: this.view(),
      x: Math.min(200, Math.max(0, x)),
      y: Math.min(260, Math.max(0, y)),
      zone,
      kind: this.kind(),
      date: this.session() || todayIso(),
      procedureId: '',
      note: '',
    };
    this.tracking.data.annotations = [...this.tracking.data.annotations, mark];
    this.selectedId.set(mark.id);
    this.tracking.touch();
  }

  patch<K extends 'kind' | 'zone' | 'date' | 'procedureId' | 'note'>(m: AesAnnotation, key: K, value: string) {
    if (this.disabled() || m.lockedAt) return;
    (m as unknown as Record<string, string>)[key] = value;
    this.tracking.touch();
  }

  remove(m: AesAnnotation) {
    if (m.lockedAt || !confirm('¿Eliminar esta marca del mapa facial?')) return;
    this.tracking.data.annotations = this.tracking.data.annotations.filter((a) => a.id !== m.id);
    this.selectedId.set(null);
    this.tracking.touch();
  }

  async close(m: AesAnnotation) {
    if (m.lockedAt || !confirm('Al cerrar la anotación ya no se podrá modificar ni eliminar. ¿Continuar?')) return;
    m.close = true;
    this.busy.set(true);
    const ok = await this.tracking.commit();
    this.busy.set(false);
    if (!ok) {
      delete m.close;
      this.tracking.touch();
    }
  }
}
