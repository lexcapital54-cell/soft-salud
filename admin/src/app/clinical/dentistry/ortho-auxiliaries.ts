import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ORTHO_ELASTIC_TYPES } from './dentistry.models';
import type { DentistryContent } from './dentistry.models';
import { ElasticRow, IprRow, TadRow, newMechId } from './ortho-mech.data';

const ELASTIC_TYPES = ['Clase II', 'Clase III', 'Cruzado (criss-cross)', 'Box anterior', 'Triangular', 'Vertical / asentamiento', 'Intramaxilar', 'Cadena elastomérica'];
const ELASTIC_SIZES = ['1/8"', '3/16"', '1/4"', '5/16"', '3/8"'];
const ELASTIC_FORCES = ['Liviano (2 oz)', 'Mediano (3.5 oz)', 'Pesado (4.5 oz)', 'Extra pesado (6 oz)'];
const USAGES = ['Todo el día', 'Nocturno', 'Solo al dormir y en casa'];
const COMPLIANCE = ['Buena', 'Regular', 'Mala'];
const COMPLIANCE_COLOR: Record<string, string> = { Buena: '#16a34a', Regular: '#f59e0b', Mala: '#dc2626' };
const TAD_STATUSES = ['Planificado', 'Colocado', 'Retirado', 'Fallido'];
const TAD_LOCATIONS = ['Interradicular vestibular', 'Interradicular palatino', 'Paladar medio', 'Cresta infracigomática', 'Rama mandibular', 'Retromolar', 'Otro'];

/** Elásticos, reducción interproximal (IPR) y mini implantes (TAD). */
@Component({
  selector: 'app-ortho-auxiliaries',
  imports: [FormsModule],
  template: `
    @let m = data().orthoMech;
    @switch (part()) {
      @case ('elastics') {
        @if (!disabled() && importableElastics().length) {
          <button type="button" class="ax-btn" (click)="importElastics()">Traer {{ importableElastics().length }} elástico(s) dibujados en el odontograma</button>
        }
        <div class="ax-cards">
          @for (e of m.elastics; track e.id) {
            <div class="ax-card" [style.border-left-color]="complianceColor(e.compliance)">
              <div class="ax-head">
                <select [(ngModel)]="e.type" (ngModelChange)="touch()" [disabled]="disabled()" aria-label="Tipo de elástico" class="ax-strong">
                  <option value="">Tipo…</option>
                  @for (t of elasticTypes; track t) {
                    <option [value]="t">{{ t }}</option>
                  }
                </select>
                <span class="ax-route">{{ e.from || '?' }} → {{ e.to || '?' }}</span>
                @if (!disabled()) {
                  <button type="button" class="ax-del" (click)="remove(m.elastics, e, 'el elástico')" aria-label="Quitar">×</button>
                }
              </div>
              <div class="ax-grid">
                <label>Lado
                  <select [(ngModel)]="e.side" (ngModelChange)="touch()" [disabled]="disabled()">
                    <option value="">—</option>
                    <option>Derecho</option>
                    <option>Izquierdo</option>
                    <option>Bilateral</option>
                  </select>
                </label>
                <label>Pieza origen <input [(ngModel)]="e.from" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="13" /></label>
                <label>Pieza destino <input [(ngModel)]="e.to" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="46" /></label>
                <label>Calibre
                  <select [(ngModel)]="e.size" (ngModelChange)="touch()" [disabled]="disabled()">
                    <option value="">—</option>
                    @for (s of sizes; track s) {
                      <option [value]="s">{{ s }}</option>
                    }
                  </select>
                </label>
                <label>Fuerza
                  <select [(ngModel)]="e.force" (ngModelChange)="touch()" [disabled]="disabled()">
                    <option value="">—</option>
                    @for (f of forces; track f) {
                      <option [value]="f">{{ f }}</option>
                    }
                  </select>
                </label>
                <label>Uso recomendado
                  <select [(ngModel)]="e.usage" (ngModelChange)="touch()" [disabled]="disabled()">
                    <option value="">—</option>
                    @for (u of usages; track u) {
                      <option [value]="u">{{ u }}</option>
                    }
                  </select>
                </label>
                <label>Horas / día <input [(ngModel)]="e.hours" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" placeholder="22" /></label>
                <label>Inicio <input type="date" [(ngModel)]="e.start" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
                <label>Final <input type="date" [(ngModel)]="e.end" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
              </div>
              <div class="ax-foot">
                <span class="ax-lbl">Cumplimiento</span>
                @for (c of compliance; track c) {
                  <button type="button" class="ax-chip" [class.on]="e.compliance === c" [style.--c]="complianceColor(c)" [disabled]="disabled()" (click)="e.compliance = e.compliance === c ? '' : c; touch()">{{ c }}</button>
                }
                <input class="ax-notes" [(ngModel)]="e.notes" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Observaciones" />
              </div>
            </div>
          } @empty {
            <p class="ax-note">Sin elásticos registrados.</p>
          }
        </div>
        @if (!disabled()) {
          <button type="button" class="ax-link" (click)="addElastic()">+ Agregar elástico</button>
        }
      }
      @case ('ipr') {
        @let t = iprTotals();
        <div class="ax-totals">
          @for (a of t; track a.arch) {
            <div class="ax-total">
              <span>Arcada {{ a.arch }}</span>
              <div class="ax-bar"><i class="done" [style.width.%]="a.pctDone"></i><i class="plan" [style.width.%]="a.pctPlan"></i></div>
              <b>{{ a.done }} de {{ a.total }} mm realizados</b>
            </div>
          }
        </div>
        <div class="ax-list">
          @for (r of m.ipr; track r.id) {
            <div class="ax-row ax-ipr" [class.done]="r.status === 'Realizado'">
              <input [(ngModel)]="r.contact" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Contacto (12-11)" />
              <span class="ax-mm"><input [(ngModel)]="r.amount" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" placeholder="0.2" /> mm</span>
              <input type="date" [(ngModel)]="r.date" (ngModelChange)="touch()" [readonly]="disabled()" aria-label="Fecha" />
              <input [(ngModel)]="r.professional" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Profesional" />
              <button type="button" class="ax-status" [class.ok]="r.status === 'Realizado'" [disabled]="disabled()" (click)="toggleIpr(r)">{{ r.status }}</button>
              @if (!disabled() && r.status !== 'Realizado') {
                <button type="button" class="ax-del" (click)="remove(m.ipr, r, 'el IPR ' + r.contact)" aria-label="Quitar">×</button>
              }
              @if (iprWarn(r)) {
                <p class="ax-hint">{{ iprWarn(r) }}</p>
              }
            </div>
          } @empty {
            <p class="ax-note">Sin IPR registrado.</p>
          }
        </div>
        @if (!disabled()) {
          <button type="button" class="ax-link" (click)="addIpr()">+ Agregar contacto</button>
        }
      }
      @case ('tads') {
        <div class="ax-cards">
          @for (t of m.tads; track t.id) {
            <div class="ax-card" [style.border-left-color]="tadColor(t.status)">
              <div class="ax-head">
                <strong class="ax-strong">TAD {{ t.tooth ? 'junto a ' + t.tooth : '' }}</strong>
                <button type="button" class="ax-status" [style.background]="tadColor(t.status)" [style.color]="'#fff'" [disabled]="disabled()" (click)="cycleTad(t)">{{ t.status }}</button>
                @if (!disabled() && (!t.status || t.status === 'Planificado')) {
                  <button type="button" class="ax-del" (click)="remove(m.tads, t, 'el TAD')" aria-label="Quitar">×</button>
                }
              </div>
              <div class="ax-grid">
                <label>Ubicación
                  <select [(ngModel)]="t.location" (ngModelChange)="touch()" [disabled]="disabled()">
                    <option value="">—</option>
                    @for (l of tadLocations; track l) {
                      <option [value]="l">{{ l }}</option>
                    }
                  </select>
                </label>
                <label>Pieza relacionada <input [(ngModel)]="t.tooth" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="15-16" /></label>
                <label>Diámetro (mm) <input [(ngModel)]="t.diameter" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
                <label>Longitud (mm) <input [(ngModel)]="t.length" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
                <label>Marca <input [(ngModel)]="t.brand" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
                <label>Fecha colocación <input type="date" [(ngModel)]="t.date" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
                <label>Torque (Ncm) <input [(ngModel)]="t.torque" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
                <label>Fecha retiro <input type="date" [(ngModel)]="t.removalDate" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
                <label class="ax-wide">Objetivo <input [(ngModel)]="t.objective" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Anclaje para distalización, intrusión…" /></label>
              </div>
              @if (tadWarn(t)) {
                <p class="ax-hint">{{ tadWarn(t) }}</p>
              }
            </div>
          } @empty {
            <p class="ax-note">Sin mini implantes registrados.</p>
          }
        </div>
        @if (!disabled()) {
          <button type="button" class="ax-link" (click)="addTad()">+ Agregar TAD</button>
        }
      }
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    input, select { min-width: 0; max-width: 100%; box-sizing: border-box; }
    :host { display: grid; gap: 8px; }
    .ax-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 8px; }
    .ax-card { display: grid; gap: 6px; padding: 10px; border: 1px solid #e2e8f0; border-left: 4px solid #cbd5e1; border-radius: 12px; }
    .ax-head { display: flex; gap: 8px; align-items: center; }
    .ax-head .ax-del { margin-left: auto; }
    .ax-strong { font-weight: 600; color: #123b60; font-size: 13px; }
    .ax-route { font-size: 12px; color: #12609a; font-weight: 600; background: #eef6fc; border-radius: 99px; padding: 1px 8px; }
    .ax-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .ax-grid label { display: grid; gap: 2px; font-size: 11px; color: #475569; }
    .ax-wide { grid-column: 1 / -1; }
    .ax-grid input, .ax-grid select { width: 100%; min-width: 0; }
    .ax-foot { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .ax-lbl { font-size: 11px; color: #64748b; }
    .ax-chip { border: 1px solid #cbd5e1; background: #fff; border-radius: 99px; padding: 2px 9px; font-size: 11px; cursor: pointer; }
    .ax-chip.on { background: var(--c); border-color: var(--c); color: #fff; }
    .ax-notes { flex: 1; min-width: 120px; }
    .ax-note { margin: 0; font-size: 11px; color: #64748b; }
    .ax-link { justify-self: start; border: 0; background: none; padding: 0; color: #12609a; text-decoration: underline; font-size: 12px; cursor: pointer; }
    .ax-btn { justify-self: start; border: 1px solid #12609a; background: #f4f8fb; color: #12609a; border-radius: 99px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
    .ax-del { border: 0; background: none; color: #94a3b8; font-size: 18px; cursor: pointer; }
    .ax-del:hover { color: #dc2626; }
    .ax-totals { display: grid; gap: 6px; max-width: 560px; }
    .ax-total { display: grid; grid-template-columns: 120px 1fr 100px; gap: 8px; align-items: center; font-size: 12px; }
    .ax-bar { position: relative; height: 12px; border-radius: 6px; background: #eef2f7; overflow: hidden; display: flex; }
    .ax-bar i { display: block; height: 100%; }
    .ax-bar .done { background: #16a34a; }
    .ax-bar .plan { background: #93c5fd; }
    .ax-list { display: grid; gap: 4px; }
    .ax-row { display: grid; gap: 6px; align-items: center; font-size: 12px; }
    .ax-ipr { grid-template-columns: 130px 90px 140px 1fr 96px 24px; }
    .ax-ipr.done { opacity: 0.75; }
    .ax-row input { width: 100%; min-width: 0; }
    .ax-mm { display: flex; gap: 4px; align-items: center; }
    .ax-status { border: 1px solid #cbd5e1; background: #fff; border-radius: 99px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
    .ax-status.ok { background: #16a34a; border-color: #16a34a; color: #fff; }
    .ax-hint { grid-column: 1 / -1; margin: 0; padding: 3px 8px; border-radius: 8px; background: #fffbeb; color: #92400e; font-size: 11px; }
    @media (max-width: 760px) { .ax-grid { grid-template-columns: 1fr 1fr; } .ax-ipr { grid-template-columns: 1fr 1fr; } }
  `,
})
export class OrthoAuxiliaries {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly part = input<'elastics' | 'ipr' | 'tads'>('elastics');
  readonly professionalName = input('');
  readonly changed = output<void>();

  readonly elasticTypes = ELASTIC_TYPES;
  readonly sizes = ELASTIC_SIZES;
  readonly forces = ELASTIC_FORCES;
  readonly usages = USAGES;
  readonly compliance = COMPLIANCE;
  readonly tadLocations = TAD_LOCATIONS;

  touch() {
    this.changed.emit();
  }

  complianceColor(c: string) {
    return COMPLIANCE_COLOR[c] ?? '#cbd5e1';
  }

  tadColor(s: string) {
    return s === 'Colocado' ? '#12609a' : s === 'Retirado' ? '#16a34a' : s === 'Fallido' ? '#dc2626' : '#94a3b8';
  }

  importableElastics() {
    const m = this.data().orthoMech;
    return this.data().orthoChart.elastics.filter((e) => !m.elastics.some((x) => x.from === String(e.from) && x.to === String(e.to)));
  }

  importElastics() {
    for (const e of this.importableElastics()) {
      const label = ORTHO_ELASTIC_TYPES.find((t) => t.key === e.type)?.label || e.type;
      this.data().orthoMech.elastics.push({ ...blankElastic(), type: ELASTIC_TYPES.find((t) => t.startsWith(label)) || label, from: String(e.from), to: String(e.to) });
    }
    this.touch();
  }

  addElastic() {
    this.data().orthoMech.elastics.push(blankElastic());
    this.touch();
  }

  iprTotals() {
    const rows = this.data().orthoMech.ipr;
    return (['superior', 'inferior'] as const).map((arch) => {
      const mine = rows.filter((r) => archOfContact(r.contact) === arch);
      const sum = (list: IprRow[]) => Math.round(list.reduce((s, r) => s + (Number(String(r.amount).replace(',', '.')) || 0), 0) * 100) / 100;
      const total = sum(mine);
      const done = sum(mine.filter((r) => r.status === 'Realizado'));
      const max = Math.max(total, 0.01);
      return { arch, total, done, pctDone: (done / max) * 100, pctPlan: ((total - done) / max) * 100 };
    });
  }

  iprWarn(r: IprRow) {
    const n = Number(String(r.amount).replace(',', '.'));
    return Number.isFinite(n) && n > 0.5 ? `Más de 0,5 mm en un contacto: verifique el espesor de esmalte disponible.` : '';
  }

  addIpr() {
    this.data().orthoMech.ipr.push({ id: newMechId('ip'), contact: '', amount: '', date: '', professional: this.professionalName(), status: 'Planificado' });
    this.touch();
  }

  toggleIpr(r: IprRow) {
    r.status = r.status === 'Realizado' ? 'Planificado' : 'Realizado';
    if (r.status === 'Realizado' && !r.date) r.date = new Date().toISOString().slice(0, 10);
    if (r.status === 'Realizado' && !r.professional) r.professional = this.professionalName();
    this.touch();
  }

  addTad() {
    this.data().orthoMech.tads.push({
      id: newMechId('td'), location: '', tooth: '', diameter: '', length: '', brand: '', date: '', objective: '', torque: '', status: 'Planificado', removalDate: '',
    });
    this.touch();
  }

  cycleTad(t: TadRow) {
    t.status = TAD_STATUSES[(TAD_STATUSES.indexOf(t.status) + 1) % TAD_STATUSES.length];
    if (t.status === 'Colocado' && !t.date) t.date = new Date().toISOString().slice(0, 10);
    if (t.status === 'Retirado' && !t.removalDate) t.removalDate = new Date().toISOString().slice(0, 10);
    this.touch();
  }

  tadWarn(t: TadRow) {
    const n = Number(String(t.torque).replace(',', '.'));
    if (!t.torque || !Number.isFinite(n)) return '';
    if (n < 5) return 'Torque de inserción bajo: vigile la estabilidad primaria.';
    if (n > 15) return 'Torque de inserción alto: riesgo de fractura o necrosis ósea.';
    return '';
  }

  remove<T>(list: T[], row: T, name: string) {
    if (!confirm(`¿Quitar ${name} del registro?`)) return;
    const i = list.indexOf(row);
    if (i >= 0) list.splice(i, 1);
    this.touch();
  }
}

function blankElastic(): ElasticRow {
  return { id: newMechId('el'), type: '', side: '', from: '', to: '', size: '', force: '', usage: '', hours: '', start: '', end: '', compliance: '', notes: '' };
}

function archOfContact(contact: string): 'superior' | 'inferior' | '' {
  const m = String(contact).match(/\d/);
  if (!m) return '';
  const q = Number(m[0]);
  return q === 1 || q === 2 || q === 5 || q === 6 ? 'superior' : q === 3 || q === 4 || q === 7 || q === 8 ? 'inferior' : '';
}
