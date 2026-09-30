import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DentistryContent } from './dentistry.models';
import {
  IMPLANT_LOADING,
  IMPLANT_RESTORATIONS,
  IMPLANT_STATUSES,
  ImplantRow,
  KennedyResult,
  OCCLUSAL_SCHEMES,
  PROSTHESIS_MATERIALS,
  PROSTHESIS_STATUSES,
  PROSTHESIS_TYPES,
  emptyImplantRow,
  emptyProsthesisRow,
  kennedyForArch,
  spaceText,
} from './rehab.models';

type CellKind = 'present' | 'missing' | 'implant' | 'removable' | 'pontic' | 'extract';

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

/** Rehabilitación oral: Kennedy calculado desde el odontograma, implantes y prótesis. */
@Component({
  selector: 'app-dental-rehab',
  imports: [FormsModule],
  template: `
    @let r = data().rehab;
    @let ku = kennedy('upper');
    @let kl = kennedy('lower');
    <div class="rh">
      <div class="rh-kennedy">
        <div class="rh-head">
          <h4>Clasificación de Kennedy (automática)</h4>
          <small>Se calcula con los dientes ausentes del odontograma; los terceros molares ausentes no cuentan (Applegate).</small>
        </div>
        @for (arch of arches; track arch.key) {
          @let k = arch.key === 'upper' ? ku : kl;
          <div class="rh-arch">
            <span class="rh-arch-name">{{ arch.label }}</span>
            <div class="rh-cells">
              @for (t of arch.teeth; track t; let i = $index) {
                @let kind = cell(t);
                <span class="rh-cell" [attr.data-kind]="kind" [class.mid]="i === 8" [title]="t + ' · ' + kindLabel(kind)">
                  {{ t }}
                  @if (kind === 'implant') {
                    <b>I</b>
                  }
                </span>
              }
            </div>
            <p class="rh-class" [attr.data-cls]="k.cls">
              <strong>{{ k.label }}</strong>
              @if (k.spaces.length) {
                <small>Espacios: {{ spaces(k) }}</small>
              }
            </p>
          </div>
        }
        <div class="rh-legend">
          @for (l of legend; track l.kind) {
            <span><i class="rh-cell" [attr.data-kind]="l.kind"></i>{{ l.label }}</span>
          }
        </div>
        <div class="rh-k-actions">
          @if (r.kennedy.at) {
            <span class="rh-saved" [class.stale]="r.kennedy.upper !== ku.label || r.kennedy.lower !== kl.label">
              Registrada {{ dateText(r.kennedy.at) }}
              @if (r.kennedy.upper !== ku.label || r.kennedy.lower !== kl.label) {
                · el odontograma cambió desde entonces
              }
            </span>
          }
          @if (!disabled()) {
            <button type="button" class="ghost" (click)="saveKennedy(ku, kl)">
              {{ r.kennedy.at ? 'Actualizar en la historia' : 'Registrar en la historia' }}
            </button>
          }
        </div>
      </div>

      <div class="rh-block">
        <div class="rh-head row">
          <h4>Implantes ({{ r.implants.length }})</h4>
          @if (!disabled()) {
            <span class="rh-btns">
              @if (unregisteredImplants().length; as n) {
                <button type="button" class="ghost" (click)="importImplants()">
                  Traer {{ n }} implante{{ n > 1 ? 's' : '' }} del odontograma ({{ unregisteredImplants().join(', ') }})
                </button>
              }
              <button type="button" class="ghost" (click)="addImplant()">+ Implante</button>
            </span>
          }
        </div>
        @if (!r.implants.length) {
          <p class="rh-empty">Sin implantes registrados. Marque «Implante» en el odontograma o agréguelo aquí.</p>
        }
        <div class="rh-cards">
          @for (im of r.implants; track $index; let i = $index) {
            <div class="rh-card" [attr.data-status]="im.status">
              <div class="rh-card-top">
                <label class="rh-tooth">Pieza <input [(ngModel)]="im.tooth" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="36" /></label>
                <select [(ngModel)]="im.status" (ngModelChange)="touch()" [disabled]="disabled()" aria-label="Estado del implante">
                  <option value="">Estado…</option>
                  @for (s of implantStatuses; track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
                @if (!disabled()) {
                  <button type="button" class="ghost rh-x" title="Quitar" (click)="removeImplant(i)">✕</button>
                }
              </div>
              <div class="rh-grid">
                <label>Marca / sistema <input [(ngModel)]="im.brand" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
                <label>Plataforma / conexión <input [(ngModel)]="im.platform" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Cono Morse, hex. ext…" /></label>
                <label>Diámetro (mm) <input [(ngModel)]="im.diameter" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
                <label>Longitud (mm) <input [(ngModel)]="im.length" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
                <label>Fecha de colocación <input type="date" [(ngModel)]="im.placedAt" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
                <label>Torque de inserción (Ncm) <input [(ngModel)]="im.torque" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" /></label>
                <label>ISQ <input [(ngModel)]="im.isq" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" /></label>
                <label>Injerto / regeneración <input [(ngModel)]="im.graft" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="No, xenoinjerto, elevación de seno…" /></label>
                <label>Carga
                  <select [(ngModel)]="im.loading" (ngModelChange)="touch()" [disabled]="disabled()">
                    <option value="">—</option>
                    @for (s of implantLoading; track s) {
                      <option [value]="s">{{ s }}</option>
                    }
                  </select>
                </label>
                <label>Rehabilitación
                  <select [(ngModel)]="im.restoration" (ngModelChange)="touch()" [disabled]="disabled()">
                    <option value="">—</option>
                    @for (s of implantRestorations; track s) {
                      <option [value]="s">{{ s }}</option>
                    }
                  </select>
                </label>
                <label class="wide">Observaciones <input [(ngModel)]="im.notes" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
              </div>
              @for (w of implantWarnings(im); track w) {
                <p class="rh-warn">{{ w }}</p>
              }
            </div>
          }
        </div>
      </div>

      <div class="rh-block">
        <div class="rh-head row">
          <h4>Prótesis ({{ r.prostheses.length }})</h4>
          @if (!disabled()) {
            <button type="button" class="ghost" (click)="addProsthesis()">+ Prótesis</button>
          }
        </div>
        @if (r.prostheses.length) {
          <div class="rh-table-wrap">
            <table class="rh-table">
              <thead>
                <tr><th>Tipo</th><th>Piezas</th><th>Material</th><th>Estado</th><th>Laboratorio</th><th>Instalación</th><th>Observaciones</th><th></th></tr>
              </thead>
              <tbody>
                @for (p of r.prostheses; track $index; let i = $index) {
                  <tr>
                    <td>
                      <select [(ngModel)]="p.type" (ngModelChange)="touch()" [disabled]="disabled()">
                        <option value="">—</option>
                        @for (s of prosthesisTypes; track s) {
                          <option [value]="s">{{ s }}</option>
                        }
                      </select>
                    </td>
                    <td><input [(ngModel)]="p.teeth" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="35–37" /></td>
                    <td>
                      <select [(ngModel)]="p.material" (ngModelChange)="touch()" [disabled]="disabled()">
                        <option value="">—</option>
                        @for (s of prosthesisMaterials; track s) {
                          <option [value]="s">{{ s }}</option>
                        }
                      </select>
                    </td>
                    <td>
                      <select [(ngModel)]="p.status" (ngModelChange)="touch()" [disabled]="disabled()">
                        <option value="">—</option>
                        @for (s of prosthesisStatuses; track s) {
                          <option [value]="s">{{ s }}</option>
                        }
                      </select>
                    </td>
                    <td><input [(ngModel)]="p.lab" (ngModelChange)="touch()" [readonly]="disabled()" /></td>
                    <td><input type="date" [(ngModel)]="p.installedAt" (ngModelChange)="touch()" [readonly]="disabled()" /></td>
                    <td><input [(ngModel)]="p.notes" (ngModelChange)="touch()" [readonly]="disabled()" /></td>
                    <td>
                      @if (!disabled()) {
                        <button type="button" class="ghost rh-x" title="Quitar" (click)="removeProsthesis(i)">✕</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="rh-empty">
            Sin prótesis registradas.
            @if (suggestRemovable(ku, kl)) {
              Con la clasificación actual podría indicarse una prótesis parcial removible.
            }
          </p>
        }
      </div>

      <div class="rh-grid rh-general">
        <label>Dimensión vertical <input [(ngModel)]="r.verticalDimension" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Conservada, disminuida (mm)…" /></label>
        <label>Esquema oclusal
          <select [(ngModel)]="r.occlusalScheme" (ngModelChange)="touch()" [disabled]="disabled()">
            <option value="">—</option>
            @for (s of occlusalSchemes; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </label>
        <label class="wide">Plan / observaciones de rehabilitación <input [(ngModel)]="r.notes" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
      </div>
    </div>
  `,
  styles: `
    .rh { display: grid; gap: 14px; margin-top: 10px; }
    .rh h4 { margin: 0; font-size: 14px; color: #123b60; }
    .rh-head { display: grid; gap: 2px; margin-bottom: 6px; }
    .rh-head.row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
    .rh-head small, .rh-empty { font-size: 12px; color: #64748b; margin: 0; }
    .rh-btns { display: flex; flex-wrap: wrap; gap: 6px; }
    .rh-kennedy { padding: 12px; border: 1px solid #dbe4ee; border-radius: 10px; background: #f4f8fb; display: grid; gap: 10px; }
    .rh-arch { display: grid; gap: 4px; }
    .rh-arch-name { font-size: 12px; font-weight: 600; color: #334155; }
    .rh-cells { display: grid; grid-template-columns: repeat(16, minmax(26px, 1fr)); gap: 3px; overflow-x: auto; }
    .rh-cell { position: relative; display: inline-flex; align-items: center; justify-content: center; min-height: 26px; border-radius: 5px; font-size: 10px; border: 1px solid #cbd5e1; background: #fff; color: #334155; font-style: normal; }
    .rh-cell.mid { margin-left: 6px; }
    .rh-cell b { position: absolute; top: 1px; right: 1px; font-size: 8px; line-height: 1; background: #475569; color: #fff; border-radius: 3px; padding: 1px 2px; }
    .rh-cell[data-kind='missing'] { background: #1f2937; color: #fff; border-color: #1f2937; }
    .rh-cell[data-kind='implant'] { background: #e2e8f0; border-color: #475569; }
    .rh-cell[data-kind='removable'] { background: #e0f2fe; border-color: #0284c7; color: #075985; }
    .rh-cell[data-kind='pontic'] { background: #dcfce7; border-color: #16a34a; }
    .rh-cell[data-kind='extract'] { background: #fee2e2; border-color: #dc2626; }
    .rh-class { margin: 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; font-size: 13px; }
    .rh-class[data-cls='0'] strong { color: #15803d; }
    .rh-class small { color: #475569; }
    .rh-legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: #475569; }
    .rh-legend span { display: inline-flex; gap: 4px; align-items: center; }
    .rh-legend i { width: 14px; min-height: 14px; }
    .rh-k-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; }
    .rh-saved { font-size: 12px; color: #166534; }
    .rh-saved.stale { color: #b45309; }
    .rh-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 10px; }
    .rh-card { border: 1px solid #dbe4ee; border-left: 4px solid #475569; border-radius: 10px; padding: 10px; background: #fff; display: grid; gap: 8px; }
    .rh-card[data-status='Cargado'] { border-left-color: #16a34a; }
    .rh-card[data-status='Osteointegración'] { border-left-color: #0891b2; }
    .rh-card[data-status='Periimplantitis'], .rh-card[data-status='Mucositis'] { border-left-color: #f59e0b; }
    .rh-card[data-status='Falla / retirado'] { border-left-color: #dc2626; }
    .rh-card-top { display: flex; gap: 8px; align-items: center; }
    .rh-card-top select { flex: 1; }
    .rh-tooth { display: flex; gap: 6px; align-items: center; font-size: 12px; font-weight: 600; }
    .rh-tooth input { width: 56px; }
    .rh-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 6px 8px; }
    .rh-grid label { display: grid; gap: 2px; font-size: 11px; color: #475569; }
    .rh-grid .wide { grid-column: 1 / -1; }
    .rh-general { padding: 10px; border: 1px dashed #cbd5e1; border-radius: 10px; }
    .rh-warn { margin: 0; padding: 4px 8px; border-radius: 6px; background: #fef3c7; color: #92400e; font-size: 12px; }
    .rh-table-wrap { overflow-x: auto; }
    .rh-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .rh-table th { text-align: left; padding: 4px; color: #475569; font-weight: 600; border-bottom: 1px solid #dbe4ee; }
    .rh-table td { padding: 3px; }
    .rh-table input, .rh-table select { width: 100%; min-width: 90px; }
    .rh-x { padding: 2px 8px; }
  `,
})
export class DentalRehab {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly arches = [
    { key: 'upper' as const, label: 'Maxilar superior', teeth: UPPER },
    { key: 'lower' as const, label: 'Mandíbula', teeth: LOWER },
  ];
  readonly legend: Array<{ kind: CellKind; label: string }> = [
    { kind: 'present', label: 'Presente' },
    { kind: 'missing', label: 'Ausente' },
    { kind: 'implant', label: 'Implante' },
    { kind: 'pontic', label: 'Póntico / prótesis fija' },
    { kind: 'removable', label: 'Prótesis removible' },
    { kind: 'extract', label: 'Extracción indicada' },
  ];
  readonly implantLoading = IMPLANT_LOADING;
  readonly implantRestorations = IMPLANT_RESTORATIONS;
  readonly implantStatuses = IMPLANT_STATUSES;
  readonly prosthesisTypes = PROSTHESIS_TYPES;
  readonly prosthesisMaterials = PROSTHESIS_MATERIALS;
  readonly prosthesisStatuses = PROSTHESIS_STATUSES;
  readonly occlusalSchemes = OCCLUSAL_SCHEMES;

  private conditions(t: number): string[] {
    return (this.data().odontogram[String(t)]?.conditions as string[] | undefined) || [];
  }

  cell(t: number): CellKind {
    const c = this.conditions(t);
    if (c.includes('IMPLANTE')) return 'implant';
    if (c.includes('PROTESIS_REMOVIBLE')) return 'removable';
    if (c.includes('AUSENTE')) return c.includes('PROTESIS') ? 'pontic' : 'missing';
    if (c.includes('EXTRACCION_INDICADA')) return 'extract';
    return 'present';
  }

  kindLabel(k: CellKind) {
    return this.legend.find((l) => l.kind === k)?.label || '';
  }

  /** Para Kennedy cuentan como espacio los ausentes sin prótesis fija y los reemplazados por removible. */
  kennedy(arch: 'upper' | 'lower'): KennedyResult {
    const teeth = arch === 'upper' ? UPPER : LOWER;
    const missing = new Set<number>();
    const present = new Set<number>();
    for (const t of teeth) {
      const k = this.cell(t);
      if (k === 'missing' || k === 'removable') missing.add(t);
      else present.add(t);
    }
    return kennedyForArch(arch, missing, present);
  }

  spaces(k: KennedyResult) {
    return spaceText(k.spaces);
  }

  suggestRemovable(u: KennedyResult, l: KennedyResult) {
    return [u, l].some((k) => k.cls === 1 || k.cls === 2 || (k.cls === 3 && k.modifications > 0));
  }

  dateText(v: string) {
    return v ? new Date(v).toLocaleDateString('es-CO') : '';
  }

  unregisteredImplants(): number[] {
    const listed = new Set(this.data().rehab.implants.map((i) => i.tooth.trim()));
    return [...UPPER, ...LOWER].filter((t) => this.cell(t) === 'implant' && !listed.has(String(t)));
  }

  implantWarnings(im: ImplantRow): string[] {
    const out: string[] = [];
    const tooth = Number(im.tooth);
    if (tooth && this.cell(tooth) !== 'implant') out.push(`La pieza ${tooth} no está marcada como implante en el odontograma.`);
    const torque = Number(im.torque);
    if (im.torque && torque < 30 && im.loading === 'Inmediata') out.push('Torque menor de 30 Ncm: la carga inmediata suele no recomendarse.');
    const isq = Number(im.isq);
    if (im.isq && isq > 0 && isq < 60) out.push('ISQ menor de 60: estabilidad baja, considere diferir la carga.');
    return out;
  }

  touch() {
    this.changed.emit();
  }

  saveKennedy(u: KennedyResult, l: KennedyResult) {
    if (this.disabled()) return;
    this.data().rehab.kennedy = { upper: u.label, lower: l.label, at: new Date().toISOString() };
    this.touch();
  }

  importImplants() {
    if (this.disabled()) return;
    for (const t of this.unregisteredImplants()) this.data().rehab.implants.push(emptyImplantRow(String(t)));
    this.touch();
  }

  addImplant() {
    this.data().rehab.implants.push(emptyImplantRow());
    this.touch();
  }

  removeImplant(i: number) {
    const im = this.data().rehab.implants[i];
    if (im && (im.brand || im.placedAt || im.notes) && !confirm(`¿Quitar el implante de la pieza ${im.tooth || '—'}?`)) return;
    this.data().rehab.implants.splice(i, 1);
    this.touch();
  }

  addProsthesis() {
    this.data().rehab.prostheses.push(emptyProsthesisRow());
    this.touch();
  }

  removeProsthesis(i: number) {
    this.data().rehab.prostheses.splice(i, 1);
    this.touch();
  }
}
