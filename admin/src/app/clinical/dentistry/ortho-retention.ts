import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DentistryContent } from './dentistry.models';
import {
  RETAINER_STATUSES,
  RETAINER_TYPES,
  RETAINER_USAGE,
  RETENTION_STABILITY,
  RetainerRow,
  RetentionCheck,
  dayIso,
  fmtDay,
  newFollowId,
  retentionMilestones,
} from './ortho-follow.models';

const QUICK: Array<{ arch: string; type: string; usage: string; hours: string; label: string }> = [
  { arch: 'Inferior', type: 'Fijo (lingual)', usage: 'Permanente (fijo)', hours: '24', label: 'Fijo inferior 3-3' },
  { arch: 'Superior', type: 'Fijo (lingual)', usage: 'Permanente (fijo)', hours: '24', label: 'Fijo superior 2-2' },
  { arch: 'Superior', type: 'Essix', usage: 'Nocturno', hours: '10', label: 'Essix superior' },
  { arch: 'Inferior', type: 'Essix', usage: 'Nocturno', hours: '10', label: 'Essix inferior' },
  { arch: 'Superior', type: 'Hawley', usage: 'Nocturno', hours: '10', label: 'Hawley superior' },
];
const PROBLEM = ['Despegado', 'Fracturado', 'Perdido'];
const RATINGS = ['Buena', 'Regular', 'Deficiente'];
const STATE_LABEL = { done: 'Realizado', overdue: 'Vencido', soon: 'Próximo', future: 'Pendiente' };

/** Retenedores y controles de retención a 1, 3, 6 y 12 meses. */
@Component({
  selector: 'app-ortho-retention',
  imports: [FormsModule],
  template: `
    <div class="rt">
      @if (!disabled()) {
        <div class="rt-quick">
          <span class="rt-lbl">Agregar retenedor:</span>
          @for (q of quick; track q.label) {
            <button type="button" (click)="addRetainer(q)">{{ q.label }}</button>
          }
          <button type="button" (click)="addRetainer()">Otro</button>
        </div>
      }
      @for (r of data().orthoFollow.retainers; track r.id) {
        <div class="rt-card" [class.bad]="isProblem(r)" [class.off]="r.status === 'Retirado' || r.status === 'Reemplazado'">
          <div class="rt-card-h">
            <b>{{ r.type || 'Retenedor' }} · {{ r.arch || 'Arcada' }}</b>
            <select [(ngModel)]="r.status" (ngModelChange)="touch()" [disabled]="disabled()" class="rt-status">
              @for (s of statuses; track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
            @if (!disabled() && !r.installedAt) {
              <button type="button" class="rt-x" title="Quitar (aún no instalado)" (click)="removeRetainer(r)">×</button>
            }
          </div>
          <div class="rt-grid">
            <label>Arcada
              <select [(ngModel)]="r.arch" (ngModelChange)="touch()" [disabled]="disabled()">
                <option value="">—</option>
                <option>Superior</option>
                <option>Inferior</option>
              </select>
            </label>
            <label>Tipo
              <select [(ngModel)]="r.type" (ngModelChange)="touch()" [disabled]="disabled()">
                @for (t of types; track t) {
                  <option [value]="t">{{ t }}</option>
                }
              </select>
            </label>
            <label>Fecha instalación <input type="date" [(ngModel)]="r.installedAt" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
            <label>Material <input [(ngModel)]="r.material" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Alambre trenzado 0.0175, PETG…" /></label>
            <label>Uso recomendado
              <select [(ngModel)]="r.usage" (ngModelChange)="touch()" [disabled]="disabled()">
                <option value="">—</option>
                @for (u of usages; track u) {
                  <option [value]="u">{{ u }}</option>
                }
              </select>
            </label>
            <label>Horas / día <input [(ngModel)]="r.hoursPerDay" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="numeric" /></label>
          </div>
          <div class="rt-row">
            <span class="rt-lbl">Cumplimiento</span>
            @for (o of ratings; track o) {
              <button type="button" class="rt-seg" [class.on]="r.compliance === o" [disabled]="disabled()" (click)="r.compliance = r.compliance === o ? '' : o; touch()">{{ o }}</button>
            }
            <input class="rt-notes" [(ngModel)]="r.notes" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Observaciones" />
          </div>
          @if (isProblem(r)) {
            <p class="rt-hint">Retenedor {{ r.status.toLowerCase() }}: programe recementado o reposición para evitar recidiva.</p>
          }
        </div>
      }

      <div class="rt-track">
        <p class="rt-lbl">
          Seguimiento de retención
          @if (base()) {
            desde {{ fmt(base()) }} ({{ baseSource() }})
          } @else {
            · registre el retiro de la aparatología o la instalación de un retenedor para calcular las fechas
          }
        </p>
        <div class="rt-steps">
          @for (m of milestones(); track m.months) {
            <button type="button" class="rt-step" [class]="'rt-step ' + m.state" [class.sel]="open() === m.months" (click)="toggle(m.months)">
              <span class="rt-node">{{ m.state === 'done' ? '✓' : m.months }}</span>
              <b>{{ m.months }} {{ m.months === 1 ? 'mes' : 'meses' }}</b>
              <small>{{ m.check?.date ? fmt(m.check!.date) : m.due ? fmt(m.due) : '—' }} · {{ stateLabel[m.state] }}</small>
            </button>
          }
        </div>
        @if (open(); as months) {
          @let c = checkFor(months);
          <div class="rt-check">
            <label>Fecha del control <input type="date" [(ngModel)]="c.date" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
            <div>
              <span class="rt-lbl">Uso del retenedor</span>
              <div class="rt-row">
                @for (o of ratings; track o) {
                  <button type="button" class="rt-seg" [class.on]="c.compliance === o" [disabled]="disabled()" (click)="c.compliance = c.compliance === o ? '' : o; touchCheck(c)">{{ o }}</button>
                }
              </div>
            </div>
            <div>
              <span class="rt-lbl">Estabilidad</span>
              <div class="rt-row">
                @for (o of stability; track o) {
                  <button type="button" class="rt-seg" [class.on]="c.stability === o" [disabled]="disabled()" (click)="c.stability = c.stability === o ? '' : o; touchCheck(c)">{{ o }}</button>
                }
              </div>
            </div>
            <label class="rt-wide">Observaciones <input [(ngModel)]="c.notes" (ngModelChange)="touchCheck(c)" [readonly]="disabled()" placeholder="Contactos, alineación, estado del retenedor…" /></label>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .rt { display: grid; gap: 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
    .rt input, .rt select { min-width: 0; max-width: 100%; box-sizing: border-box; }
    .rt-lbl { margin: 0; font-size: 11px; color: #64748b; }
    .rt-quick { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
    .rt-quick button { border: 1px dashed #0d9488; background: #fff; color: #0f766e; border-radius: 99px; padding: 2px 10px; font-size: 12px; cursor: pointer; }
    .rt-card { border: 1px solid #99f6e4; border-left: 4px solid #0d9488; border-radius: 12px; padding: 8px 10px; display: grid; gap: 6px; }
    .rt-card.bad { border-color: #fecaca; border-left-color: #dc2626; background: #fffafa; }
    .rt-card.off { opacity: 0.6; }
    .rt-card-h { display: flex; gap: 8px; align-items: center; font-size: 13px; color: #134e4a; }
    .rt-status { margin-left: auto; }
    .rt-x { border: 0; background: none; color: #94a3b8; font-size: 18px; cursor: pointer; }
    .rt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 6px 8px; }
    .rt-grid label, .rt-check label { display: grid; gap: 2px; font-size: 11px; color: #475569; }
    .rt-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .rt-seg { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 3px 9px; font-size: 12px; cursor: pointer; }
    .rt-seg.on { background: #0d9488; border-color: #0d9488; color: #fff; }
    .rt-notes { flex: 1 1 200px; }
    .rt-hint { margin: 0; font-size: 12px; color: #991b1b; }
    .rt-track { display: grid; gap: 8px; }
    .rt-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; position: relative; }
    .rt-step { display: grid; justify-items: center; gap: 2px; border: 1px solid #e2e8f0; background: #fff; border-radius: 12px; padding: 8px 4px; cursor: pointer; font-size: 12px; }
    .rt-step small { font-size: 10px; color: #64748b; text-align: center; }
    .rt-node { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; color: #fff; background: #cbd5e1; }
    .rt-step.done .rt-node { background: #16a34a; }
    .rt-step.overdue .rt-node { background: #dc2626; }
    .rt-step.overdue { border-color: #fecaca; }
    .rt-step.soon .rt-node { background: #f59e0b; }
    .rt-step.sel { outline: 2px solid #0d9488; outline-offset: 1px; }
    .rt-check { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; padding: 8px; border-radius: 12px; background: #f0fdfa; }
    .rt-wide { grid-column: 1 / -1; }
  `,
})
export class OrthoRetention {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly debondedAt = input<string | null>(null);
  readonly changed = output<void>();

  readonly quick = QUICK;
  readonly types = RETAINER_TYPES;
  readonly statuses = RETAINER_STATUSES;
  readonly usages = RETAINER_USAGE;
  readonly stability = RETENTION_STABILITY;
  readonly ratings = RATINGS;
  readonly stateLabel = STATE_LABEL;
  readonly open = signal<number | null>(null);
  private readonly tick = signal(0);

  readonly base = computed(() => {
    this.tick();
    const debond = this.debondedAt();
    if (debond) return debond.slice(0, 10);
    const installed = this.data().orthoFollow.retainers.map((r) => r.installedAt).filter(Boolean).sort();
    return installed[0] ?? '';
  });

  baseSource() {
    return this.debondedAt() ? 'retiro de la aparatología' : 'instalación del primer retenedor';
  }

  milestones() {
    this.tick();
    return retentionMilestones(this.base(), this.data().orthoFollow.checks);
  }

  fmt(v: string) {
    return fmtDay(v);
  }

  isProblem(r: RetainerRow) {
    return PROBLEM.includes(r.status);
  }

  touch() {
    this.tick.update((n) => n + 1);
    this.changed.emit();
  }

  addRetainer(q?: (typeof QUICK)[number]) {
    this.data().orthoFollow.retainers.push({
      id: newFollowId(),
      arch: q?.arch ?? '',
      type: q?.type ?? 'Otro',
      installedAt: '',
      material: '',
      usage: q?.usage ?? '',
      hoursPerDay: q?.hours ?? '',
      status: 'Activo',
      compliance: '',
      notes: '',
    });
    this.touch();
  }

  removeRetainer(r: RetainerRow) {
    const list = this.data().orthoFollow.retainers;
    list.splice(list.indexOf(r), 1);
    this.touch();
  }

  touchCheck(c: RetentionCheck) {
    if (!c.date) c.date = dayIso(new Date());
    this.touch();
  }

  toggle(months: number) {
    this.open.set(this.open() === months ? null : months);
  }

  checkFor(months: number): RetentionCheck {
    const checks = this.data().orthoFollow.checks;
    let c = checks.find((x) => x.milestone === String(months));
    if (!c) {
      c = { milestone: String(months), date: '', compliance: '', stability: '', notes: '' };
      if (!this.disabled()) checks.push(c);
    }
    return c;
  }
}
