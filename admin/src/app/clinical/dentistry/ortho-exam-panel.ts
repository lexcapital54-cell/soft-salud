import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DentistryContent } from './dentistry.models';
import {
  FUNCTION_REFERRALS,
  FunctionState,
  MANDIBULAR_PATHS,
  OCCLUSAL_CANT,
  ORTHO_FUNCTIONS,
  SMILE_ARCS,
  SMILE_LINES,
  SMILE_SYMMETRY,
  SideFlags,
  facialIndex,
  functionalHints,
  smileHints,
  suggestSmileLine,
  thirdsAnalysis,
} from './ortho-exam.models';

type SmileKey = 'smileLine' | 'smileArc' | 'symmetry' | 'occlusalCant';

/** Sonrisa y proporciones faciales (`part="smile"`) o examen funcional (`part="functional"`). */
@Component({
  selector: 'app-ortho-exam-panel',
  imports: [FormsModule],
  template: `
    @let ex = data().orthoExam;
    @if (part() === 'smile') {
      @let s = ex.smile;
      @let p = ex.proportions;
      @let th = thirds();
      @let fi = index();
      <div class="ox">
        <div class="ox-card">
          <h5>Análisis de sonrisa</h5>
          @for (g of smileGroups; track g.key) {
            <div class="ox-row">
              <span>{{ g.label }}</span>
              <div class="ox-seg">
                @for (o of g.options; track o) {
                  <button type="button" [class.on]="s[g.key] === o" [disabled]="disabled()" (click)="pickSmile(g.key, o)">{{ o }}</button>
                }
              </div>
            </div>
          }
          <div class="ox-grid">
            <label>Exposición incisiva en reposo (mm) <input [(ngModel)]="s.restExposure" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" placeholder="2–4" /></label>
            <label>Exposición incisiva al sonreír (mm) <input [(ngModel)]="s.smileExposure" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
            <label>Exposición gingival al sonreír (mm) <input [(ngModel)]="s.gingivalExposure" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" placeholder="0" /></label>
            <label class="wide">Observaciones de la sonrisa <input [(ngModel)]="s.notes" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
          </div>
          @if (!disabled() && suggestedLine() && suggestedLine() !== s.smileLine) {
            <button type="button" class="ox-apply" (click)="pickSmile('smileLine', suggestedLine())">Línea de sonrisa sugerida por la exposición gingival: {{ suggestedLine() }} · aplicar</button>
          }
          @for (h of smileHintList(); track h.text) {
            <p class="ox-hint" [attr.data-tone]="h.tone">{{ h.text }}</p>
          }
        </div>

        <div class="ox-card">
          <h5>Proporciones faciales</h5>
          <div class="ox-thirds">
            @for (t of thirdRows; track t.key) {
              @let pc = t.key === 'upperThird' ? th.upper : t.key === 'middleThird' ? th.middle : th.lower;
              <label>
                {{ t.label }} (mm)
                <input [(ngModel)]="p[t.key]" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" />
              </label>
              <div class="ox-bar" [title]="pc !== null ? pc + ' % de la altura facial' : ''">
                <span [style.width.%]="pc ?? 0" [class.off]="pc !== null && (pc < 30 || pc > 37)"></span>
                <b>{{ pc !== null ? pc + ' %' : '—' }}</b>
              </div>
            }
          </div>
          @if (th.lowerReading) {
            <p class="ox-hint" [attr.data-tone]="th.lowerReading === 'Normal' ? 'ok' : 'warn'">
              Tercio inferior frente al medio: {{ th.lowerReading.toLowerCase() }}.
              @if (!disabled() && data().orthodontics.facial.lowerThird !== th.lowerReading) {
                <button type="button" class="ox-link" (click)="applyLowerThird(th.lowerReading)">Registrar en «Tercio inferior»</button>
              }
            </p>
          }
          <div class="ox-grid">
            <label>Altura facial N–Me (mm) <input [(ngModel)]="p.facialHeight" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
            <label>Ancho bicigomático (mm) <input [(ngModel)]="p.facialWidth" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
          </div>
          @if (fi) {
            <p class="ox-hint" data-tone="ok">
              Índice facial {{ fi.idx }}: {{ fi.name }} → suele corresponder a {{ fi.facialType.toLowerCase() }}.
              @if (!disabled() && data().orthodontics.facial.facialType !== fi.facialType) {
                <button type="button" class="ox-link" (click)="applyFacialType(fi.facialType)">Registrar como tipo facial</button>
              }
            </p>
          }
        </div>
      </div>
    } @else {
      @let f = ex.functional;
      <div class="ox">
        <div class="ox-card">
          <h5>ATM</h5>
          <table class="ox-sides">
            <thead><tr><th></th><th>Derecha</th><th>Izquierda</th></tr></thead>
            <tbody>
              @for (row of tmjRows; track row.key) {
                <tr>
                  <td>{{ row.label }}</td>
                  <td><input type="checkbox" [checked]="f[row.key].right" [disabled]="disabled()" (change)="setSide(f[row.key], 'right', $event)" /></td>
                  <td><input type="checkbox" [checked]="f[row.key].left" [disabled]="disabled()" (change)="setSide(f[row.key], 'left', $event)" /></td>
                </tr>
              }
            </tbody>
          </table>
          <label class="ox-inline">Trayectoria de apertura
            <select [(ngModel)]="f.deviation" (ngModelChange)="touch()" [disabled]="disabled()">
              <option value="">—</option>
              @for (o of paths; track o) {
                <option [value]="o">{{ o }}</option>
              }
            </select>
          </label>
          <div class="ox-grid">
            <label>Apertura máxima (mm) <input [(ngModel)]="f.maxOpening" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" placeholder="40–55" /></label>
            <label>Lateralidad derecha (mm) <input [(ngModel)]="f.lateralRight" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
            <label>Lateralidad izquierda (mm) <input [(ngModel)]="f.lateralLeft" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
            <label>Protrusión (mm) <input [(ngModel)]="f.protrusion" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
          </div>
        </div>
        <div class="ox-card">
          <h5>Músculos (dolor a la palpación)</h5>
          <table class="ox-sides">
            <thead><tr><th></th><th>Derecha</th><th>Izquierda</th></tr></thead>
            <tbody>
              @for (row of muscleRows; track row.key) {
                <tr>
                  <td>{{ row.label }}</td>
                  <td><input type="checkbox" [checked]="f[row.key].right" [disabled]="disabled()" (change)="setSide(f[row.key], 'right', $event)" /></td>
                  <td><input type="checkbox" [checked]="f[row.key].left" [disabled]="disabled()" (change)="setSide(f[row.key], 'left', $event)" /></td>
                </tr>
              }
            </tbody>
          </table>
          @if (!disabled()) {
            <button type="button" class="ox-link" (click)="markNoFindings()">Sin hallazgos en ATM ni músculos</button>
          }
          @for (h of functionalHintList(); track h.text) {
            <p class="ox-hint" [attr.data-tone]="h.tone">{{ h.text }}</p>
          }
        </div>
        <div class="ox-card ox-wide">
          <h5>Funciones</h5>
          @for (fx of functions; track fx.key) {
            @let v = f[fx.key];
            <div class="ox-fn" [class.alt]="v.state === 'ALTERADA'">
              <span>{{ fx.label }}</span>
              <div class="ox-seg">
                <button type="button" [class.on]="v.state === 'NORMAL'" [disabled]="disabled()" (click)="setFn(fx.key, 'NORMAL')">Normal</button>
                <button type="button" [class.on]="v.state === 'ALTERADA'" [disabled]="disabled()" (click)="setFn(fx.key, 'ALTERADA')">Alterada</button>
              </div>
              @if (v.state === 'ALTERADA') {
                <input [(ngModel)]="v.description" (ngModelChange)="touch()" [readonly]="disabled()" [placeholder]="fx.hint" />
                <select [(ngModel)]="v.referral" (ngModelChange)="touch()" [disabled]="disabled()" aria-label="Remisión">
                  <option value="">Sin remisión</option>
                  @for (r of referrals; track r) {
                    <option [value]="r">Remitir a {{ r }}</option>
                  }
                </select>
              }
            </div>
          }
          @if (!disabled() && pendingFunctions()) {
            <button type="button" class="ox-link" (click)="restNormal()">Marcar las {{ pendingFunctions() }} restantes como normales</button>
          }
          <label class="ox-inline wide">Observaciones del examen funcional <input [(ngModel)]="f.notes" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
        </div>
      </div>
    }
  `,
  styles: `
    .ox { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; margin-top: 8px; }
    .ox-card { display: grid; gap: 8px; align-content: start; padding: 12px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; }
    .ox-wide { grid-column: 1 / -1; }
    .ox h5 { margin: 0; font-size: 13px; color: #123b60; }
    .ox-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; color: #334155; }
    .ox-seg { display: inline-flex; flex-wrap: wrap; border: 1px solid #cbd5e1; border-radius: 99px; overflow: hidden; }
    .ox-seg button { border: 0; background: #fff; padding: 3px 10px; font-size: 12px; cursor: pointer; color: #334155; }
    .ox-seg button + button { border-left: 1px solid #cbd5e1; }
    .ox-seg button.on { background: #12609a; color: #fff; }
    .ox-seg button:disabled { cursor: default; }
    .ox-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 8px; }
    .ox-grid label, .ox-inline, .ox-thirds label { display: grid; gap: 2px; font-size: 11px; color: #475569; }
    .ox-grid .wide, .ox-inline.wide { grid-column: 1 / -1; }
    .ox-thirds { display: grid; grid-template-columns: 150px 1fr; gap: 6px 10px; align-items: end; }
    .ox-bar { position: relative; height: 18px; border-radius: 6px; background: #eef2f7; overflow: hidden; }
    .ox-bar span { display: block; height: 100%; background: #12609a; opacity: 0.75; }
    .ox-bar span.off { background: #f59e0b; }
    .ox-bar b { position: absolute; right: 6px; top: 1px; font-size: 11px; color: #0f172a; }
    .ox-hint { margin: 0; padding: 5px 8px; border-radius: 8px; font-size: 12px; }
    .ox-hint[data-tone='ok'] { background: #f0fdf4; color: #166534; }
    .ox-hint[data-tone='warn'] { background: #fffbeb; color: #92400e; }
    .ox-hint[data-tone='danger'] { background: #fef2f2; color: #991b1b; }
    .ox-apply { justify-self: start; border: 1px dashed #12609a; border-radius: 99px; background: #f4f8fb; color: #12609a; font-size: 12px; padding: 4px 10px; cursor: pointer; }
    .ox-link { border: 0; background: none; padding: 0; color: #12609a; text-decoration: underline; font-size: 12px; cursor: pointer; justify-self: start; }
    .ox-sides { border-collapse: collapse; font-size: 12px; }
    .ox-sides th { font-weight: 600; color: #64748b; padding: 2px 10px; }
    .ox-sides td { padding: 3px 10px; text-align: center; }
    .ox-sides td:first-child { text-align: left; color: #334155; }
    .ox-fn { display: grid; grid-template-columns: 110px auto 1fr 220px; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 10px; font-size: 12px; }
    .ox-fn.alt { background: #fffbeb; }
    @media (max-width: 800px) { .ox-fn { grid-template-columns: 1fr auto; } }
  `,
})
export class OrthoExamPanel {
  readonly data = input.required<DentistryContent>();
  readonly part = input<'smile' | 'functional'>('smile');
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly smileGroups: Array<{ key: SmileKey; label: string; options: string[] }> = [
    { key: 'smileLine', label: 'Línea de sonrisa', options: SMILE_LINES },
    { key: 'smileArc', label: 'Arco de sonrisa', options: SMILE_ARCS },
    { key: 'symmetry', label: 'Simetría de la sonrisa', options: SMILE_SYMMETRY },
    { key: 'occlusalCant', label: 'Plano oclusal (cant)', options: OCCLUSAL_CANT },
  ];
  readonly thirdRows = [
    { key: 'upperThird' as const, label: 'Tercio superior' },
    { key: 'middleThird' as const, label: 'Tercio medio' },
    { key: 'lowerThird' as const, label: 'Tercio inferior' },
  ];
  readonly tmjRows = [
    { key: 'tmjPain' as const, label: 'Dolor articular' },
    { key: 'click' as const, label: 'Click' },
    { key: 'crepitus' as const, label: 'Crepitación' },
  ];
  readonly muscleRows = [
    { key: 'temporal' as const, label: 'Temporal' },
    { key: 'masseter' as const, label: 'Masetero' },
    { key: 'pterygoid' as const, label: 'Pterigoideos' },
  ];
  readonly functions = ORTHO_FUNCTIONS;
  readonly referrals = FUNCTION_REFERRALS;
  readonly paths = MANDIBULAR_PATHS;

  thirds() {
    return thirdsAnalysis(this.data().orthoExam.proportions);
  }

  index() {
    return facialIndex(this.data().orthoExam.proportions);
  }

  smileHintList() {
    return smileHints(this.data().orthoExam.smile);
  }

  suggestedLine() {
    return suggestSmileLine(this.data().orthoExam.smile);
  }

  functionalHintList() {
    return functionalHints(this.data().orthoExam.functional);
  }

  pendingFunctions() {
    const f = this.data().orthoExam.functional;
    return ORTHO_FUNCTIONS.filter((x) => !f[x.key].state).length;
  }

  touch() {
    this.changed.emit();
  }

  pickSmile(key: SmileKey, value: string) {
    if (this.disabled()) return;
    const s = this.data().orthoExam.smile;
    s[key] = s[key] === value ? '' : value;
    this.touch();
  }

  setSide(flags: SideFlags, side: 'right' | 'left', event: Event) {
    if (this.disabled()) return;
    flags[side] = (event.target as HTMLInputElement).checked;
    this.touch();
  }

  setFn(key: (typeof ORTHO_FUNCTIONS)[number]['key'], state: FunctionState) {
    if (this.disabled()) return;
    const v = this.data().orthoExam.functional[key];
    v.state = v.state === state ? '' : state;
    this.touch();
  }

  restNormal() {
    const f = this.data().orthoExam.functional;
    for (const x of ORTHO_FUNCTIONS) if (!f[x.key].state) f[x.key].state = 'NORMAL';
    this.touch();
  }

  markNoFindings() {
    const f = this.data().orthoExam.functional;
    for (const k of ['tmjPain', 'click', 'crepitus', 'temporal', 'masseter', 'pterygoid'] as const) f[k] = { right: false, left: false };
    if (!f.deviation) f.deviation = 'Recta';
    this.touch();
  }

  applyLowerThird(v: string) {
    this.data().orthodontics.facial.lowerThird = v;
    this.touch();
  }

  applyFacialType(v: string) {
    this.data().orthodontics.facial.facialType = v;
    this.touch();
  }
}
