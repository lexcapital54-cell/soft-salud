import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrthoControlCatalog } from '../clinical.models';
import { ORTHO_ARCH_WIRES, ORTHO_CONTROL_EVENTS, ORTHO_ELASTICS, ORTHO_LIGATURES, ORTHO_PAIN, ORTHO_RATING, OrthoControl } from './ortho-controls';

/** Control de ortodoncia en el sillón: botones para lo frecuente y campos solo cuando aplican. */
@Component({
  selector: 'app-ortho-quick-control',
  standalone: true,
  imports: [FormsModule],
  template: `
    @let c = control();
    <div class="oqc">
      <div class="oqc-head">
        <p class="oqc-title">Control actual</p>
        @if (canCopyLast()) {
          <button type="button" class="oqc-link" (click)="copyLast.emit()">Traer arcos y fase del último control</button>
        }
      </div>

      <div class="oqc-seg" role="radiogroup" aria-label="Evento de ortodoncia">
        @for (e of events; track e.value) {
          <button type="button" role="radio" [attr.aria-checked]="c.event === e.value" [class.on]="c.event === e.value" (click)="c.event = e.value">
            {{ e.label }}
          </button>
        }
      </div>

      <p class="oqc-label">Procedimientos realizados</p>
      @if (catalog(); as cat) {
        <div class="oqc-toggles">
          @for (p of cat.procedures; track p.key) {
            <button type="button" class="oqc-toggle" [class.on]="has(p.key)" [attr.aria-pressed]="has(p.key)" (click)="toggle(p.key)">
              <span class="chk" aria-hidden="true">{{ has(p.key) ? '✓' : '+' }}</span>
              {{ p.label }}
            </button>
          }
        </div>
      } @else {
        <p class="oqc-muted">Cargando procedimientos…</p>
      }

      @if (has('ARCH_CHANGE')) {
        <div class="oqc-grid">
          <label>Arco superior <input [(ngModel)]="c.upperArch" list="oqc-wires" placeholder="NiTi 0.016" maxlength="120" /></label>
          <label>Arco inferior <input [(ngModel)]="c.lowerArch" list="oqc-wires" placeholder="NiTi 0.016" maxlength="120" /></label>
        </div>
      }
      @if (has('ELASTIC_CHANGE')) {
        <label class="oqc-field">Elásticos <input [(ngModel)]="c.elastics" list="oqc-elastics" placeholder="Clase II, 3/16 medianos" maxlength="200" /></label>
      }
      @if (has('ACTIVATION')) {
        <label class="oqc-field">Activación <input [(ngModel)]="c.activations" placeholder="Expansor 2 vueltas, ligadura 13 a 23…" maxlength="300" /></label>
      }
      @if (has('IPR')) {
        <label class="oqc-field">IPR (zona y cantidad) <input [(ngModel)]="c.ipr" placeholder="33-43, 0,2 mm por contacto" maxlength="200" /></label>
      }
      @if (has('BRACKET_REBOND')) {
        <label class="oqc-field">Reparación / recementado <input [(ngModel)]="c.repairs" placeholder="Recementado bracket 24, tubo 36" maxlength="300" /></label>
      }

      <div class="oqc-grid">
        <label
          >Fase
          <select [(ngModel)]="c.phase">
            <option value="">Sin cambio</option>
            @for (o of phases(); track o) {
              <option [value]="o">{{ o }}</option>
            }
          </select>
        </label>
        <div>
          <p class="oqc-label">Higiene</p>
          <div class="oqc-seg small">
            @for (o of rating; track o) {
              <button type="button" [class.on]="c.hygiene === o" (click)="c.hygiene = c.hygiene === o ? '' : o">{{ o }}</button>
            }
          </div>
        </div>
        <div>
          <p class="oqc-label">Colaboración</p>
          <div class="oqc-seg small">
            @for (o of rating; track o) {
              <button type="button" [class.on]="c.cooperation === o" (click)="c.cooperation = c.cooperation === o ? '' : o">{{ o }}</button>
            }
          </div>
        </div>
      </div>

      <div class="oqc-grid">
        <div>
          <p class="oqc-label">Dolor referido</p>
          <div class="oqc-seg small">
            @for (o of pain; track o) {
              <button type="button" [class.on]="c.pain === o" (click)="c.pain = c.pain === o ? '' : o">{{ o }}</button>
            }
          </div>
        </div>
        <label>Ligaduras <input [(ngModel)]="c.ligatures" list="oqc-ligatures" placeholder="Elásticas grises" maxlength="120" /></label>
        <label>Brackets <input [(ngModel)]="c.brackets" placeholder="Todos en posición · despegado 22" maxlength="200" /></label>
      </div>
      <div class="oqc-emergency">
        <button type="button" class="oqc-toggle" [class.on]="emergencyOn" [attr.aria-pressed]="emergencyOn" (click)="toggleEmergency()">
          <span class="chk" aria-hidden="true">{{ emergencyOn ? '!' : '+' }}</span>
          Consulta de emergencia
        </button>
        @if (emergencyOn || c.emergency) {
          <input [(ngModel)]="c.emergency" placeholder="Motivo: arco que pincha, bracket suelto, dolor agudo…" maxlength="300" />
        }
      </div>

      <div class="oqc-photo">
        <p class="oqc-label">Foto intraoral frontal del control</p>
        @if (c.photoAttachmentId) {
          <div class="oqc-thumb">
            @if (photoUrl(); as url) {
              <img [src]="url" alt="Foto intraoral frontal del control" />
            } @else {
              <span class="oqc-muted">Cargando foto…</span>
            }
            <button type="button" class="oqc-link danger" (click)="removePhoto.emit()">Quitar</button>
          </div>
        } @else {
          <label class="oqc-upload" [class.busy]="photoUploading()">
            {{ photoUploading() ? 'Subiendo…' : 'Subir foto' }}
            <input type="file" accept="image/*" hidden [disabled]="photoUploading()" (change)="onPhoto($event)" />
          </label>
        }
      </div>

      @if (cupsPreview(); as rows) {
        <p class="oqc-cups">
          <strong>CUPS que se registrarán:</strong>
          @for (r of rows; track r.code) {
            <span class="oqc-chip" [title]="r.description">{{ r.code }} · {{ r.description }}</span>
          }
        </p>
      }

      @for (issue of issues(); track issue) {
        <p class="oqc-issue">{{ issue }}</p>
      }

      <datalist id="oqc-wires">
        @for (w of wires; track w) {
          <option [value]="w"></option>
        }
      </datalist>
      <datalist id="oqc-ligatures">
        @for (w of ligatures; track w) {
          <option [value]="w"></option>
        }
      </datalist>
      <datalist id="oqc-elastics">
        @for (w of elastics; track w) {
          <option [value]="w"></option>
        }
      </datalist>
    </div>
  `,
  styles: `
    :host { display: block; }
    .oqc { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid #cfe3e6; border-radius: 12px; background: #f7fbfc; }
    .oqc-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
    .oqc-title { margin: 0; font-weight: 800; color: #0b5563; }
    .oqc-label { margin: 0 0 4px; font-size: 0.78rem; font-weight: 700; color: #334155; }
    .oqc-muted { margin: 0; font-size: 0.8rem; color: #64748b; }
    .oqc-link { border: 0; background: none; padding: 0; color: #00798c; font: inherit; font-size: 0.8rem; font-weight: 600; text-decoration: underline; cursor: pointer; }
    .oqc-link.danger { color: #b42318; }
    .oqc-seg { display: flex; flex-wrap: wrap; gap: 4px; }
    .oqc-seg button {
      padding: 6px 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #334155;
      font-size: 0.8rem; font-weight: 600; cursor: pointer;
    }
    .oqc-seg.small button { padding: 4px 8px; font-size: 0.76rem; }
    .oqc-seg button.on { background: #0b5563; border-color: #0b5563; color: #fff; }
    .oqc-toggles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
    .oqc-toggle {
      display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 10px; border-radius: 10px; cursor: pointer;
      border: 1.5px solid #cbd5e1; background: #fff; color: #1e293b; font-size: 0.86rem; font-weight: 700; text-align: left;
    }
    .oqc-toggle .chk {
      flex: 0 0 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; font-size: 0.8rem;
      background: #f1f5f9; color: #64748b;
    }
    .oqc-toggle.on { border-color: #1b998b; background: #e7f6f4; color: #0b5563; }
    .oqc-toggle.on .chk { background: #1b998b; color: #fff; }
    .oqc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; align-items: start; }
    .oqc-field, .oqc-grid label { display: flex; flex-direction: column; gap: 3px; font-size: 0.8rem; font-weight: 600; color: #334155; }
    .oqc-photo .oqc-thumb { display: flex; align-items: center; gap: 10px; }
    .oqc-thumb img { width: 120px; height: 90px; object-fit: cover; border-radius: 8px; border: 1px solid #cbd5e1; }
    .oqc-upload {
      display: inline-flex; padding: 7px 12px; border-radius: 8px; cursor: pointer; border: 1px solid #b9d3d8;
      color: #00576a; background: #fff; font-size: 0.82rem; font-weight: 600;
    }
    .oqc-upload.busy { opacity: 0.6; cursor: progress; }
    .oqc-cups { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 0.76rem; color: #334155; }
    .oqc-chip { padding: 2px 8px; border-radius: 99px; background: #e0f2fe; color: #075985; font-weight: 600; }
    .oqc-emergency { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .oqc-emergency input { flex: 1 1 260px; }
    .oqc-emergency .oqc-toggle.on { border-color: #dc2626; background: #fef2f2; color: #991b1b; }
    .oqc-emergency .oqc-toggle.on .chk { background: #dc2626; }
    .oqc-issue { margin: 0; font-size: 0.8rem; color: #b42318; }
  `,
})
export class OrthoQuickControlComponent {
  readonly control = input.required<OrthoControl>();
  readonly catalog = input<OrthoControlCatalog | null>(null);
  readonly phases = input<string[]>([]);
  readonly canCopyLast = input(false);
  readonly photoUrl = input<string | null>(null);
  readonly photoUploading = input(false);
  readonly issues = input<string[]>([]);

  readonly copyLast = output<void>();
  readonly uploadPhoto = output<File>();
  readonly removePhoto = output<void>();

  readonly events = ORTHO_CONTROL_EVENTS;
  readonly rating = ORTHO_RATING;
  readonly wires = ORTHO_ARCH_WIRES;
  readonly elastics = ORTHO_ELASTICS;
  readonly pain = ORTHO_PAIN;
  readonly ligatures = ORTHO_LIGATURES;
  emergencyOn = false;

  toggleEmergency() {
    const c = this.control();
    if (this.emergencyOn || c.emergency) {
      if (c.emergency?.trim() && !confirm('¿Quitar el motivo de emergencia escrito en este control?')) return;
      c.emergency = '';
      this.emergencyOn = false;
    } else {
      this.emergencyOn = true;
    }
  }

  has(key: string) {
    return this.control().procedures.includes(key);
  }

  toggle(key: string) {
    const c = this.control();
    c.procedures = this.has(key) ? c.procedures.filter((k) => k !== key) : [...c.procedures, key];
  }

  /** Mismo agrupamiento que hace el servidor al firmar: CUPS del evento + CUPS de cada procedimiento. */
  cupsPreview() {
    const cat = this.catalog();
    if (!cat) return null;
    const c = this.control();
    const rows = new Map<string, string>();
    const event = cat.eventCups[c.event] ?? cat.eventCups['CONTROL'];
    if (event) rows.set(event.code, event.description);
    for (const key of c.procedures) {
      const p = cat.procedures.find((x) => x.key === key);
      if (p) rows.set(p.cupsCode, p.cupsDescription);
    }
    return [...rows.entries()].map(([code, description]) => ({ code, description }));
  }

  onPhoto(event: Event) {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (file) this.uploadPhoto.emit(file);
  }
}
