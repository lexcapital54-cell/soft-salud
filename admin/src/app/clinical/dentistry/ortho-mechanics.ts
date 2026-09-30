import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DentistryContent } from './dentistry.models';
import { ArchWireRow, newMechId } from './ortho-mech.data';
import { OrthoAuxiliaries } from './ortho-auxiliaries';
import { OrthoAligners } from './ortho-aligners';

type Tab = 'appliances' | 'wires' | 'elastics' | 'ipr' | 'tads' | 'aligners';

export const APPLIANCE_TYPES = [
  'Brackets metálicos',
  'Brackets cerámicos',
  'Brackets autoligables',
  'Brackets linguales',
  'Alineadores',
  'Expansor',
  'Arco lingual',
  'Pendulum',
  'Hyrax',
  'Haas',
  'Quad Helix',
  'TAD',
  'Otro',
];
export const APPLIANCE_STATUSES = ['Planificado', 'Instalado', 'Retirado'];
export const WIRE_STATUSES = ['Planificado', 'Instalado', 'Retirado'];
const STANDARD_SEQUENCE = ['NiTi 0.014', 'NiTi 0.016', 'NiTi 0.016 x 0.022', 'NiTi 0.017 x 0.025', 'Acero 0.019 x 0.025'];
const STATUS_COLOR: Record<string, string> = { Planificado: '#94a3b8', Instalado: '#12609a', Retirado: '#16a34a' };
const PER_TOOTH: Array<{ marks: string[]; label: string }> = [
  { marks: ['BRACKET'], label: 'Brackets' },
  { marks: ['BANDA'], label: 'Bandas' },
  { marks: ['LIGADURA_ELASTICA', 'LIGADURA_METALICA'], label: 'Ligaduras' },
  { marks: ['GANCHO'], label: 'Ganchos' },
  { marks: ['SEPARADOR'], label: 'Separadores' },
];

export interface ControlArchRow {
  date: string;
  arches: string;
  elastics: string;
}

/** Mecánica del tratamiento: aparatología, secuencia de arcos, elásticos, IPR, TAD y alineadores. */
@Component({
  selector: 'app-ortho-mechanics',
  imports: [FormsModule, OrthoAuxiliaries, OrthoAligners],
  template: `
    @let m = data().orthoMech;
    <div class="mc">
      <div class="mc-tabs" role="tablist">
        @for (t of tabs; track t.key) {
          <button type="button" role="tab" [class.on]="tab() === t.key" (click)="tab.set(t.key)">
            {{ t.label }}
            @if (count(t.key); as c) {
              <span class="mc-n">{{ c }}</span>
            }
          </button>
        }
      </div>

      @switch (tab()) {
        @case ('appliances') {
          <div class="mc-pieces">
            <span class="mc-lbl">Por pieza (del odontograma):</span>
            @for (p of perTooth(); track p.label) {
              <span class="mc-pill" [class.zero]="!p.n"><b>{{ p.n }}</b> {{ p.label }}</span>
            }
            @if (data().orthoChart.bracketType) {
              <span class="mc-pill">Tipo: {{ data().orthoChart.bracketType.toLowerCase() }}</span>
            }
          </div>
          <div class="mc-list">
            @for (a of m.appliances; track a.id) {
              <div class="mc-row mc-app">
                <select [(ngModel)]="a.type" (ngModelChange)="touch()" [disabled]="disabled()" aria-label="Tipo">
                  <option value="">Tipo…</option>
                  @for (t of applianceTypes; track t) {
                    <option [value]="t">{{ t }}</option>
                  }
                </select>
                <select [(ngModel)]="a.arch" (ngModelChange)="touch()" [disabled]="disabled()" aria-label="Arcada">
                  <option value="">Arcada…</option>
                  <option>Superior</option>
                  <option>Inferior</option>
                  <option>Ambas</option>
                </select>
                <input [(ngModel)]="a.brand" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Marca" />
                <input [(ngModel)]="a.reference" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Referencia / prescripción" />
                <input type="date" [(ngModel)]="a.date" (ngModelChange)="touch()" [readonly]="disabled()" aria-label="Fecha de colocación" />
                <button type="button" class="mc-status" [style.background]="statusColor(a.status)" [disabled]="disabled()" (click)="cycleAppliance(a)">{{ a.status }}</button>
                @if (!disabled() && a.status === 'Planificado') {
                  <button type="button" class="mc-del" (click)="removeRow(m.appliances, a, a.type || 'aparato')" aria-label="Quitar">×</button>
                }
              </div>
            } @empty {
              <p class="mc-note">Sin aparatología registrada.</p>
            }
          </div>
          @if (!disabled()) {
            <div class="mc-quick">
              <span class="mc-lbl">Agregar:</span>
              @for (t of applianceTypes; track t) {
                <button type="button" (click)="addAppliance(t)">{{ t }}</button>
              }
            </div>
          }
        }
        @case ('wires') {
          @for (lane of lanes; track lane) {
            @let ws = wiresOf(lane);
            <div class="mc-lane">
              <div class="mc-lanehead">
                <strong>Arcada {{ lane.toLowerCase() }}</strong>
                @if (!disabled()) {
                  <button type="button" class="mc-link" (click)="addWire(lane)">+ Arco</button>
                  @if (!ws.length) {
                    <button type="button" class="mc-link" (click)="standardSequence(lane)">Secuencia estándar</button>
                  }
                  @if (nextPlanned(lane)) {
                    <button type="button" class="mc-btn" (click)="installNext(lane)">Instalar siguiente: {{ nextPlanned(lane)?.wire || 'arco' }}</button>
                  }
                }
              </div>
              <div class="mc-track">
                @for (w of ws; track w.id; let i = $index; let last = $last) {
                  <button type="button" class="mc-node" [class.sel]="selWire() === w.id" [attr.data-st]="w.status" [style.--c]="statusColor(w.status)" (click)="selWire.set(selWire() === w.id ? '' : w.id)">
                    <span class="mc-dot">{{ w.status === 'Retirado' ? '✓' : i + 1 }}</span>
                    <b>{{ w.wire || 'Sin definir' }}</b>
                    <small>{{ w.date || w.status }}</small>
                  </button>
                  @if (!last) {
                    <i class="mc-conn" [class.done]="w.status === 'Retirado'"></i>
                  }
                } @empty {
                  <p class="mc-note">Sin arcos planificados.</p>
                }
              </div>
              @for (w of ws; track w.id) {
                @if (selWire() === w.id) {
                  <div class="mc-edit">
                    <label>Arco <input [(ngModel)]="w.wire" (ngModelChange)="touch()" [readonly]="disabled()" list="mc-wires" /></label>
                    <label>Fecha <input type="date" [(ngModel)]="w.date" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
                    <label>Estado
                      <select [(ngModel)]="w.status" (ngModelChange)="touch()" [disabled]="disabled()">
                        @for (s of wireStatuses; track s) {
                          <option [value]="s">{{ s }}</option>
                        }
                      </select>
                    </label>
                    <label class="mc-wide">Observaciones <input [(ngModel)]="w.notes" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
                    @if (!disabled()) {
                      <button type="button" class="mc-link" (click)="moveWire(w, -1)">← Antes</button>
                      <button type="button" class="mc-link" (click)="moveWire(w, 1)">Después →</button>
                      @if (w.status === 'Planificado') {
                        <button type="button" class="mc-del" (click)="removeRow(m.wires, w, w.wire || 'arco')" aria-label="Quitar arco">×</button>
                      }
                    }
                  </div>
                }
              }
            </div>
          }
          <datalist id="mc-wires">
            @for (w of wireCatalog(); track w) {
              <option [value]="w"></option>
            }
          </datalist>
          @if (controlRows().length) {
            <details class="mc-hist">
              <summary>Arcos registrados en los controles ({{ controlRows().length }})</summary>
              <ul>
                @for (r of controlRows(); track $index) {
                  <li><b>{{ r.date.slice(0, 10) }}</b> · {{ r.arches || '—' }}{{ r.elastics ? ' · elásticos: ' + r.elastics : '' }}</li>
                }
              </ul>
            </details>
          }
        }
        @case ('aligners') {
          <app-ortho-aligners [data]="data()" [disabled]="disabled()" (changed)="touch()" />
        }
        @default {
          <app-ortho-auxiliaries [data]="data()" [disabled]="disabled()" [part]="$any(tab())" [professionalName]="professionalName()" (changed)="touch()" />
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .mc > * { min-width: 0; }
    .mc { display: grid; gap: 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
    .mc-tabs { display: flex; flex-wrap: wrap; gap: 2px; border-bottom: 1px solid #e2e8f0; }
    .mc-tabs button { border: 0; background: none; padding: 8px 11px; font-size: 13px; color: #475569; border-bottom: 2px solid transparent; cursor: pointer; }
    .mc-tabs button.on { color: #123b60; border-bottom-color: #12609a; font-weight: 600; }
    .mc-n { background: #e2e8f0; color: #334155; border-radius: 99px; padding: 0 7px; font-size: 11px; margin-left: 3px; }
    .mc-lbl { font-size: 11px; color: #64748b; }
    .mc-pieces, .mc-quick { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .mc-pill { background: #eef6fc; color: #123b60; border-radius: 99px; padding: 2px 10px; font-size: 12px; }
    .mc-pill.zero { background: #f1f5f9; color: #94a3b8; }
    .mc-quick button { border: 1px dashed #12609a; background: #fff; color: #12609a; border-radius: 99px; padding: 2px 9px; font-size: 11px; cursor: pointer; }
    .mc-list { display: grid; gap: 4px; }
    .mc-row { display: grid; gap: 6px; align-items: center; font-size: 12px; }
    .mc-app { grid-template-columns: 170px 100px 1fr 1fr 140px 96px 24px; }
    .mc-row input, .mc-row select { width: 100%; min-width: 0; }
    .mc-status { border: 0; color: #fff; border-radius: 99px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
    .mc-del { border: 0; background: none; color: #94a3b8; font-size: 18px; cursor: pointer; }
    .mc-del:hover { color: #dc2626; }
    .mc-note { margin: 0; font-size: 11px; color: #64748b; }
    .mc-link { border: 0; background: none; padding: 0; color: #12609a; text-decoration: underline; font-size: 12px; cursor: pointer; }
    .mc-btn { border: 0; background: #12609a; color: #fff; border-radius: 99px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
    .mc-lane { display: grid; gap: 6px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 12px; }
    .mc-lanehead { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 13px; color: #123b60; }
    .mc-track { display: flex; align-items: center; overflow-x: auto; padding: 4px 2px 8px; }
    .mc-node { display: grid; justify-items: center; gap: 2px; min-width: 104px; border: 0; background: none; cursor: pointer; padding: 4px; border-radius: 10px; }
    .mc-node.sel { background: #eef6fc; }
    .mc-dot { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: #fff; background: var(--c); }
    .mc-node[data-st='Planificado'] .mc-dot { background: #fff; color: #64748b; border: 2px dashed #94a3b8; }
    .mc-node[data-st='Instalado'] .mc-dot { box-shadow: 0 0 0 4px #bfdbfe; }
    .mc-node b { font-size: 11px; color: #0f172a; white-space: nowrap; }
    .mc-node small { font-size: 10px; color: #64748b; }
    .mc-conn { flex: 1; min-width: 18px; height: 3px; background: #e2e8f0; margin-bottom: 30px; }
    .mc-conn.done { background: #16a34a; }
    .mc-edit { display: grid; grid-template-columns: 1fr 140px 130px 2fr auto auto auto; gap: 6px; align-items: end; padding: 8px; background: #f8fafc; border-radius: 10px; }
    .mc-edit label { display: grid; gap: 2px; font-size: 11px; color: #475569; }
    .mc-hist { font-size: 12px; color: #334155; }
    .mc-hist ul { margin: 6px 0 0; padding-left: 18px; }
    @media (max-width: 860px) { .mc-app, .mc-edit { grid-template-columns: 1fr 1fr; } }
  `,
})
export class OrthoMechanics {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly controlRows = input<ControlArchRow[]>([]);
  readonly wireOptions = input<string[]>([]);
  readonly professionalName = input('');
  readonly changed = output<void>();

  readonly tabs: Array<{ key: Tab; label: string }> = [
    { key: 'appliances', label: 'Aparatología' },
    { key: 'wires', label: 'Secuencia de arcos' },
    { key: 'elastics', label: 'Elásticos' },
    { key: 'ipr', label: 'IPR' },
    { key: 'tads', label: 'TAD' },
    { key: 'aligners', label: 'Alineadores' },
  ];
  readonly lanes = ['Superior', 'Inferior'];
  readonly applianceTypes = APPLIANCE_TYPES;
  readonly wireStatuses = WIRE_STATUSES;
  readonly tab = signal<Tab>('appliances');
  readonly selWire = signal('');

  wireCatalog() {
    return this.wireOptions().length ? this.wireOptions() : STANDARD_SEQUENCE;
  }

  count(t: Tab): number {
    const m = this.data().orthoMech;
    switch (t) {
      case 'appliances': return m.appliances.length;
      case 'wires': return m.wires.length;
      case 'elastics': return m.elastics.length;
      case 'ipr': return m.ipr.length;
      case 'tads': return m.tads.length;
      default: return Number(m.aligners.total) || 0;
    }
  }

  perTooth() {
    const odo = this.data().odontogram;
    return PER_TOOTH.map((p) => ({ label: p.label, n: Object.values(odo).filter((r) => p.marks.some((m) => r?.marks?.includes(m as never))).length }));
  }

  statusColor(s: string) {
    return STATUS_COLOR[s] ?? '#94a3b8';
  }

  wiresOf(lane: string) {
    return this.data().orthoMech.wires.filter((w) => w.arch === lane);
  }

  nextPlanned(lane: string) {
    return this.wiresOf(lane).find((w) => w.status === 'Planificado');
  }

  touch() {
    this.changed.emit();
  }

  addAppliance(type: string) {
    this.data().orthoMech.appliances.push({ id: newMechId('ap'), type, arch: '', brand: '', reference: '', date: '', status: 'Planificado', notes: '' });
    this.touch();
  }

  cycleAppliance(a: { status: string; date: string }) {
    const i = APPLIANCE_STATUSES.indexOf(a.status);
    a.status = APPLIANCE_STATUSES[(i + 1) % APPLIANCE_STATUSES.length];
    if (a.status === 'Instalado' && !a.date) a.date = today();
    this.touch();
  }

  addWire(lane: string) {
    const row: ArchWireRow = { id: newMechId('aw'), arch: lane, wire: '', date: '', status: 'Planificado', notes: '' };
    this.data().orthoMech.wires.push(row);
    this.selWire.set(row.id);
    this.touch();
  }

  standardSequence(lane: string) {
    for (const wire of STANDARD_SEQUENCE) {
      this.data().orthoMech.wires.push({ id: newMechId('aw'), arch: lane, wire, date: '', status: 'Planificado', notes: '' });
    }
    this.touch();
  }

  installNext(lane: string) {
    const ws = this.wiresOf(lane);
    const next = ws.find((w) => w.status === 'Planificado');
    if (!next) return;
    for (const w of ws) if (w.status === 'Instalado') w.status = 'Retirado';
    next.status = 'Instalado';
    next.date = today();
    this.touch();
  }

  moveWire(w: ArchWireRow, dir: -1 | 1) {
    const all = this.data().orthoMech.wires;
    const lane = all.filter((x) => x.arch === w.arch);
    const i = lane.indexOf(w);
    const j = i + dir;
    if (j < 0 || j >= lane.length) return;
    const a = all.indexOf(lane[i]);
    const b = all.indexOf(lane[j]);
    [all[a], all[b]] = [all[b], all[a]];
    this.touch();
  }

  removeRow<T>(list: T[], row: T, name: string) {
    if (!confirm(`¿Quitar ${name} del registro?`)) return;
    const i = list.indexOf(row);
    if (i >= 0) list.splice(i, 1);
    this.touch();
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
