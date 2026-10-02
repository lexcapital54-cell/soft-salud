import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ClinicalApiService } from '../clinical-api.service';
import { CatalogCode, PhysioPlanRow, PhysioPlanStatus, ProcedureRow, SessionPlanHost } from '../clinical.models';
import { PHYSIO_PLAN_STATUSES, ensurePlanRows, newPlanRow, planNum, planTotals, rowNet, rowSessions } from './physio-plan.models';

/**
 * Plan de tratamiento por sesiones con valores (fisioterapia y psicología): cada
 * procedimiento puede abonarse desde los recibos de caja.
 */
@Component({
  selector: 'app-physio-treatment-plan',
  imports: [CurrencyPipe],
  template: `
    @let t = totals();
    <div class="ftp">
      <div class="ftp-sum">
        <span><b>{{ t.count }}</b> procedimiento{{ t.count === 1 ? '' : 's' }}</span>
        <span><b>{{ t.sessions }}</b> sesiones</span>
        <span><b>{{ t.done }}</b> terminado{{ t.done === 1 ? '' : 's' }}</span>
        <span class="net">Total {{ t.net | currency: 'COP' : 'symbol-narrow' : '1.0-0' }}</span>
      </div>
      @if (sessionGap(); as gap) {
        <p class="ftp-hint">{{ gap }}</p>
      }
      @for (r of rows(); track r.id; let i = $index) {
        <article class="ftp-row" [attr.data-status]="r.status">
          <div class="ftp-main">
            <label class="cups">
              CUPS
              <input [value]="r.cupsCode" [readOnly]="disabled()" placeholder="Buscar código o nombre" autocomplete="off"
                (input)="onCups(i, $any($event.target).value)" (focus)="onCups(i, r.cupsCode)" (blur)="closeSoon()" />
              @if (cupsRow() === i && cupsResults().length) {
                <ul class="ftp-sugg">
                  @for (c of cupsResults(); track c.code) {
                    <li>
                      <button type="button" (mousedown)="pickCups(r, c)">
                        <b>{{ c.code }}</b> {{ c.description }}
                        @if (c.category === 'Procedimientos') {
                          <em class="tag">En procedimientos</em>
                        }
                      </button>
                    </li>
                  }
                </ul>
              }
            </label>
            <label class="desc">
              Procedimiento
              <input [value]="r.description" [readOnly]="disabled()" [placeholder]="descriptionPlaceholder()" (input)="set(r, 'description', $any($event.target).value)" />
            </label>
          </div>
          <div class="ftp-nums">
            <div class="sess">
              <span>Sesiones</span>
              <div class="stepper">
                <button type="button" [disabled]="disabled() || sessions(r) <= 1" (click)="step(r, -1)" aria-label="Menos sesiones">−</button>
                <input type="number" min="1" [value]="r.sessions" [readOnly]="disabled()" (input)="set(r, 'sessions', $any($event.target).value)" />
                <button type="button" [disabled]="disabled()" (click)="step(r, 1)" aria-label="Más sesiones">+</button>
              </div>
            </div>
            <label>
              Valor por sesión
              <input inputmode="numeric" [value]="r.unitValue" [readOnly]="disabled()" placeholder="$" (input)="set(r, 'unitValue', $any($event.target).value)" />
            </label>
            <label class="disc">
              Desc. %
              <input inputmode="decimal" [value]="r.discountPct" [readOnly]="disabled()" placeholder="0" (input)="set(r, 'discountPct', $any($event.target).value)" />
            </label>
            <div class="total">
              <span>Neto</span>
              <b>{{ net(r) | currency: 'COP' : 'symbol-narrow' : '1.0-0' }}</b>
            </div>
          </div>
          <div class="ftp-foot">
            <div class="status" role="radiogroup" aria-label="Estado del procedimiento">
              @for (s of statuses; track s.key) {
                <button type="button" role="radio" [attr.aria-checked]="r.status === s.key" [class.on]="r.status === s.key" [attr.data-k]="s.key" [disabled]="disabled()" (click)="setStatus(r, s.key)">
                  {{ s.label }}
                </button>
              }
            </div>
            <input class="notes" [value]="r.notes" [readOnly]="disabled()" [placeholder]="notesPlaceholder()" (input)="set(r, 'notes', $any($event.target).value)" />
            @if (!disabled()) {
              <button type="button" class="del" (click)="remove(i)" aria-label="Quitar procedimiento">Quitar</button>
            }
          </div>
        </article>
      } @empty {
        <p class="ftp-empty">Sin procedimientos. Agregue los procedimientos del plan con sus sesiones y valor para cobrarlos en Caja.</p>
      }
      @if (!disabled()) {
        @let fromProcs = procedureSuggestions();
        @if (fromProcs.length) {
          <div class="ftp-from">
            <span>CUPS registrados en Procedimientos:</span>
            @for (p of fromProcs; track p.cupsCode) {
              <button type="button" (click)="addFromProcedure(p)" [title]="'Agregar al plan: ' + p.cupsCode + ' ' + p.description">
                + <b>{{ p.cupsCode }}</b> {{ p.description }}
              </button>
            }
            @if (fromProcs.length > 1) {
              <button type="button" class="all" (click)="addAllFromProcedures()">Agregar todos</button>
            }
          </div>
        }
        <button type="button" class="ftp-add" (click)="add()">+ Agregar procedimiento</button>
      }
      @if (t.count) {
        <dl class="ftp-totals">
          <dt>Subtotal</dt>
          <dd>{{ t.gross | currency: 'COP' : 'symbol-narrow' : '1.0-0' }}</dd>
          @if (t.discount) {
            <dt>Descuentos</dt>
            <dd>− {{ t.discount | currency: 'COP' : 'symbol-narrow' : '1.0-0' }}</dd>
          }
          <dt class="strong">Total del plan</dt>
          <dd class="strong">{{ t.net | currency: 'COP' : 'symbol-narrow' : '1.0-0' }}</dd>
        </dl>
      }
      <p class="ftp-note">Cada procedimiento queda disponible en Caja para abonarlo en el recibo; los cancelados no se cobran.</p>
    </div>
  `,
  styleUrl: './physio-treatment-plan.scss',
})
export class PhysioTreatmentPlan {
  private readonly api = inject(ClinicalApiService);

  readonly data = input.required<SessionPlanHost>();
  readonly disabled = input(false);
  readonly descriptionPlaceholder = input('Ej.: Terapia física integral');
  readonly notesPlaceholder = input('Observación (zona, modalidad…)');
  /** CUPS de la sección Procedimientos de la misma historia: se ofrecen para el plan y como primeras sugerencias. */
  readonly procedures = input<ProcedureRow[]>([]);
  readonly changed = output<void>();

  readonly statuses = PHYSIO_PLAN_STATUSES;
  readonly cupsRow = signal<number | null>(null);
  readonly cupsResults = signal<CatalogCode[]>([]);
  private readonly tick = signal(0);
  private timer?: ReturnType<typeof setTimeout>;

  readonly rows = computed(
    () => {
      this.tick();
      const d = this.data();
      const rows = ensurePlanRows(d.treatmentPlan);
      if (d.treatmentPlan !== rows) d.treatmentPlan = rows;
      return rows;
    },
    { equal: () => false },
  );
  readonly totals = computed(() => planTotals(this.rows()));
  readonly sessionGap = computed(() => {
    const planned = Math.floor(planNum(this.data().sessionCount));
    const t = this.totals();
    if (!planned || !t.count || planned === t.sessions) return '';
    return `El plan terapéutico indica ${planned} sesiones y los procedimientos suman ${t.sessions}. Revise si alguno falta o sobra.`;
  });

  sessions = rowSessions;
  net = rowNet;

  private touch() {
    this.tick.update((v) => v + 1);
    this.changed.emit();
  }

  set(r: PhysioPlanRow, key: 'description' | 'sessions' | 'unitValue' | 'discountPct' | 'notes', value: string) {
    r[key] = value;
    this.touch();
  }

  step(r: PhysioPlanRow, d: number) {
    r.sessions = String(Math.max(1, rowSessions(r) + d));
    this.touch();
  }

  setStatus(r: PhysioPlanRow, s: PhysioPlanStatus) {
    r.status = s;
    this.touch();
  }

  add() {
    this.rows().push(this.blankRow());
    this.touch();
  }

  private blankRow() {
    const planned = Math.floor(planNum(this.data().sessionCount));
    return newPlanRow(!this.rows().length && planned > 0 ? String(planned) : '');
  }

  /** CUPS de Procedimientos que aún no están en el plan (sin repetir). */
  procedureSuggestions(): ProcedureRow[] {
    const inPlan = new Set(this.rows().map((r) => r.cupsCode.trim().toUpperCase()).filter(Boolean));
    const seen = new Set<string>();
    return this.procedures().filter((p) => {
      const code = (p.cupsCode || '').trim().toUpperCase();
      if (!code || inPlan.has(code) || seen.has(code)) return false;
      seen.add(code);
      return true;
    });
  }

  addFromProcedure(p: ProcedureRow) {
    const row = this.blankRow();
    row.cupsCode = p.cupsCode.trim();
    row.description = (p.description || '').trim();
    this.rows().push(row);
    this.touch();
  }

  addAllFromProcedures() {
    for (const p of this.procedureSuggestions()) this.addFromProcedure(p);
  }

  remove(i: number) {
    const r = this.rows()[i];
    if (!r) return;
    const filled = r.description.trim() || r.cupsCode.trim() || planNum(r.unitValue);
    if (
      filled &&
      !confirm(`¿Quitar «${r.description || r.cupsCode}» del plan? Si ya tiene abonos en caja, márquelo como «Cancelado» en lugar de quitarlo: los recibos emitidos no cambian.`)
    )
      return;
    this.rows().splice(i, 1);
    this.touch();
  }

  onCups(i: number, value: string) {
    if (this.disabled()) return;
    const r = this.rows()[i];
    if (r && r.cupsCode !== value) {
      r.cupsCode = value;
      this.touch();
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const q = value.trim().toLowerCase();
      const fromProcs: CatalogCode[] = this.procedures()
        .filter((p) => p.cupsCode?.trim() && (!q || `${p.cupsCode} ${p.description}`.toLowerCase().includes(q)))
        .map((p) => ({ id: `proc-${p.cupsCode}`, code: p.cupsCode.trim(), description: p.description, category: 'Procedimientos' }));
      this.api.searchCups(value.trim()).subscribe({
        next: (rows) => {
          const seen = new Set(fromProcs.map((c) => c.code.toUpperCase()));
          this.cupsRow.set(i);
          this.cupsResults.set([...fromProcs, ...rows.filter((c) => !seen.has(c.code.toUpperCase()))].slice(0, 8));
        },
        error: () => this.cupsResults.set([]),
      });
    }, 200);
  }

  pickCups(r: PhysioPlanRow, c: CatalogCode) {
    r.cupsCode = c.code;
    if (!r.description.trim()) r.description = c.description;
    this.cupsResults.set([]);
    this.cupsRow.set(null);
    this.touch();
  }

  closeSoon() {
    setTimeout(() => {
      this.cupsResults.set([]);
      this.cupsRow.set(null);
    }, 150);
  }
}
