import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DentistryContent } from './dentistry.models';
import { DxCategoryKey, OrthoProblem, newDxId } from './ortho-dx.data';
import {
  DX_CATEGORIES,
  OBJECTIVE_CATALOG,
  OBJECTIVE_STATUSES,
  PRIORITIES,
  PROBLEM_STATUSES,
  SEVERITIES,
  detectProblems,
  dxSummary,
  suggestCategories,
} from './ortho-dx.models';

type Tab = 'dx' | 'problems' | 'objectives';

const PRIORITY_COLOR: Record<string, string> = { Alta: '#dc2626', Media: '#f59e0b', Baja: '#16a34a' };

/** Diagnóstico ortodóntico por categorías, lista de problemas y objetivos enlazados. */
@Component({
  selector: 'app-ortho-diagnosis',
  imports: [FormsModule],
  template: `
    @let dx = data().orthoDx;
    <div class="od">
      <div class="od-tabs" role="tablist">
        <button type="button" role="tab" [class.on]="tab() === 'dx'" (click)="tab.set('dx')">Diagnóstico <span class="od-n">{{ filledCats() }}/7</span></button>
        <button type="button" role="tab" [class.on]="tab() === 'problems'" (click)="tab.set('problems')">Problemas <span class="od-n">{{ activeProblems() }}</span></button>
        <button type="button" role="tab" [class.on]="tab() === 'objectives'" (click)="tab.set('objectives')">Objetivos <span class="od-n">{{ dx.objectives.length }}</span></button>
      </div>

      @switch (tab()) {
        @case ('dx') {
          @let sug = suggestions();
          <div class="od-cats">
            @for (c of categories; track c.key) {
              <div class="od-cat" [class.set]="dx.categories[c.key]">
                <span class="od-cl">{{ c.label }}</span>
                <div class="od-chips">
                  @for (o of c.options; track o) {
                    <button type="button" [class.on]="dx.categories[c.key] === o" [class.sug]="sug[c.key] === o" [disabled]="disabled()" (click)="setCat(c.key, o)">{{ o }}</button>
                  }
                </div>
              </div>
            }
          </div>
          @if (!disabled() && pendingSuggestions()) {
            <button type="button" class="od-btn" (click)="applySuggestions()">Aplicar {{ pendingSuggestions() }} sugerencia(s) de los análisis</button>
          }
          <p class="od-note">Borde punteado verde: sugerencia a partir de cefalometría, oclusión, arcadas y examen funcional. El profesional confirma cada categoría.</p>
          @if (summary(); as s) {
            <div class="od-summary">
              <span class="od-cl">Diagnóstico final estructurado</span>
              <p>{{ s }}</p>
              @if (!disabled() && data().orthodontics.diagnosis.trim() !== s) {
                <button type="button" class="od-btn" (click)="applySummary(s)">Registrar en «Diagnóstico ortodóntico»</button>
              }
            </div>
          }
        }
        @case ('problems') {
          @if (!disabled() && newDetected().length) {
            <div class="od-detect">
              <span>Detectados en el examen y los análisis:</span>
              @for (p of newDetected(); track p.problem) {
                <button type="button" class="od-chipadd" (click)="addDetected(p)">+ {{ p.problem }}</button>
              }
              <button type="button" class="od-link" (click)="addAllDetected()">Agregar todos</button>
            </div>
          }
          <div class="od-list">
            @for (p of dx.problems; track p.id) {
              <div class="od-item" [class.done]="p.status === 'Resuelto'">
                <i class="od-pri" [style.background]="priorityColor(p.priority)" [title]="'Prioridad ' + (p.priority || '—')"></i>
                <input class="od-main" [(ngModel)]="p.problem" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Problema" />
                <select [(ngModel)]="p.severity" (ngModelChange)="touch()" [disabled]="disabled()" aria-label="Severidad">
                  <option value="">Severidad</option>
                  @for (s of severities; track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
                <input [(ngModel)]="p.location" (ngModelChange)="touch()" [readonly]="disabled()" placeholder="Localización" />
                <div class="od-seg">
                  @for (pr of priorities; track pr) {
                    <button type="button" [class.on]="p.priority === pr" [style.--c]="priorityColor(pr)" [disabled]="disabled()" (click)="p.priority = pr; touch()">{{ pr }}</button>
                  }
                </div>
                <button type="button" class="od-status" [disabled]="disabled()" (click)="cycle(p, 'status', problemStatuses)">{{ p.status }}</button>
                @if (!disabled()) {
                  <button type="button" class="od-del" (click)="removeProblem(p)" aria-label="Quitar problema">×</button>
                }
              </div>
            } @empty {
              <p class="od-note">Sin problemas registrados.</p>
            }
          </div>
          @if (!disabled()) {
            <button type="button" class="od-link" (click)="addProblem()">+ Agregar problema</button>
          }
        }
        @case ('objectives') {
          @if (!disabled() && problemsWithoutObjective().length) {
            <button type="button" class="od-btn" (click)="objectivesFromProblems()">Crear objetivos para {{ problemsWithoutObjective().length }} problema(s) sin objetivo</button>
          }
          <div class="od-list">
            @for (o of dx.objectives; track o.id) {
              <div class="od-item od-obj" [class.done]="o.status === 'Logrado'">
                <i class="od-pri" [style.background]="priorityColor(o.priority)"></i>
                <select [(ngModel)]="o.problemId" (ngModelChange)="touch()" [disabled]="disabled()" aria-label="Problema relacionado">
                  <option value="">Problema…</option>
                  @for (p of dx.problems; track p.id) {
                    <option [value]="p.id">{{ p.problem }}</option>
                  }
                </select>
                <input class="od-main" [(ngModel)]="o.objective" (ngModelChange)="touch()" [readonly]="disabled()" list="od-obj-list" placeholder="Objetivo" />
                <div class="od-seg">
                  @for (pr of priorities; track pr) {
                    <button type="button" [class.on]="o.priority === pr" [style.--c]="priorityColor(pr)" [disabled]="disabled()" (click)="o.priority = pr; touch()">{{ pr }}</button>
                  }
                </div>
                <button type="button" class="od-status" [disabled]="disabled()" (click)="cycle(o, 'status', objectiveStatuses)">{{ o.status }}</button>
                @if (!disabled()) {
                  <button type="button" class="od-del" (click)="removeObjective(o.id)" aria-label="Quitar objetivo">×</button>
                }
              </div>
            } @empty {
              <p class="od-note">Sin objetivos. Créelos desde los problemas o agréguelos uno a uno.</p>
            }
          </div>
          <datalist id="od-obj-list">
            @for (c of catalog; track c) {
              <option [value]="c"></option>
            }
          </datalist>
          @if (!disabled()) {
            <div class="od-actions">
              <button type="button" class="od-link" (click)="addObjective()">+ Agregar objetivo</button>
              @if (objectivesText() && data().orthodontics.objectives.trim() !== objectivesText()) {
                <button type="button" class="od-btn" (click)="applyObjectives()">Registrar en «Objetivos de tratamiento»</button>
              }
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    .od { display: grid; gap: 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
    .od-tabs { display: flex; gap: 4px; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
    .od-tabs button { border: 0; background: none; padding: 8px 12px; font-size: 13px; color: #475569; border-bottom: 2px solid transparent; cursor: pointer; }
    .od-tabs button.on { color: #123b60; border-bottom-color: #12609a; font-weight: 600; }
    .od-n { background: #e2e8f0; color: #334155; border-radius: 99px; padding: 0 7px; font-size: 11px; margin-left: 4px; }
    .od-cats { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 8px; }
    .od-cat { display: grid; gap: 4px; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 12px; }
    .od-cat.set { border-color: #12609a; background: #f4f8fb; }
    .od-cl { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
    .od-chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .od-chips button { border: 1px solid #cbd5e1; background: #fff; border-radius: 99px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
    .od-chips button.on { background: #12609a; border-color: #12609a; color: #fff; }
    .od-chips button.sug:not(.on) { border-style: dashed; border-color: #16a34a; color: #166534; }
    .od-note { margin: 0; font-size: 11px; color: #64748b; }
    .od-btn { justify-self: start; border: 1px solid #12609a; background: #f4f8fb; color: #12609a; border-radius: 99px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
    .od-link { justify-self: start; border: 0; background: none; padding: 0; color: #12609a; text-decoration: underline; font-size: 12px; cursor: pointer; }
    .od-summary { display: grid; gap: 4px; padding: 10px 12px; border-left: 4px solid #12609a; background: #f4f8fb; border-radius: 8px; }
    .od-summary p { margin: 0; font-size: 13px; color: #0f172a; }
    .od-detect { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 10px; background: #f0fdf4; border-radius: 10px; font-size: 12px; color: #166534; }
    .od-chipadd { border: 1px dashed #16a34a; background: #fff; color: #166534; border-radius: 99px; padding: 2px 10px; font-size: 12px; cursor: pointer; }
    .od-list { display: grid; gap: 4px; }
    .od-item { display: grid; grid-template-columns: 8px minmax(160px, 1.4fr) 110px minmax(110px, 1fr) auto 100px 24px; gap: 6px; align-items: center; padding: 4px 6px; border-radius: 10px; font-size: 12px; }
    .od-obj { grid-template-columns: 8px minmax(140px, 1fr) minmax(160px, 1.4fr) auto 100px 24px; }
    .od-item:hover { background: #f8fafc; }
    .od-item.done { opacity: 0.6; }
    .od-item input, .od-item select { width: 100%; min-width: 0; }
    .od-pri { width: 8px; height: 26px; border-radius: 4px; background: #cbd5e1; }
    .od-main { font-weight: 600; }
    .od-seg { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 99px; overflow: hidden; }
    .od-seg button { border: 0; background: #fff; padding: 2px 8px; font-size: 11px; cursor: pointer; }
    .od-seg button + button { border-left: 1px solid #cbd5e1; }
    .od-seg button.on { background: var(--c); color: #fff; }
    .od-status { border: 1px solid #cbd5e1; background: #fff; border-radius: 99px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
    .od-del { border: 0; background: none; color: #94a3b8; font-size: 18px; cursor: pointer; }
    .od-del:hover { color: #dc2626; }
    .od-actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    @media (max-width: 860px) { .od-item, .od-obj { grid-template-columns: 8px 1fr 1fr; } }
  `,
})
export class OrthoDiagnosis {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly categories = DX_CATEGORIES;
  readonly priorities = PRIORITIES;
  readonly severities = SEVERITIES;
  readonly problemStatuses = PROBLEM_STATUSES;
  readonly objectiveStatuses = OBJECTIVE_STATUSES;
  readonly catalog = OBJECTIVE_CATALOG;
  readonly tab = signal<Tab>('dx');

  suggestions() {
    return suggestCategories(this.data());
  }

  filledCats() {
    return Object.values(this.data().orthoDx.categories).filter(Boolean).length;
  }

  activeProblems() {
    return this.data().orthoDx.problems.filter((p) => p.status !== 'Resuelto').length;
  }

  pendingSuggestions() {
    const cat = this.data().orthoDx.categories;
    return Object.entries(this.suggestions()).filter(([k, v]) => v && !cat[k as DxCategoryKey]).length;
  }

  summary() {
    return dxSummary(this.data().orthoDx.categories);
  }

  priorityColor(p: string) {
    return PRIORITY_COLOR[p] ?? '#cbd5e1';
  }

  newDetected() {
    const existing = new Set(this.data().orthoDx.problems.map((p) => p.problem.trim().toLowerCase()));
    return detectProblems(this.data()).filter((p) => !existing.has(p.problem.toLowerCase()));
  }

  problemsWithoutObjective() {
    const dx = this.data().orthoDx;
    return dx.problems.filter((p) => p.status !== 'Resuelto' && !dx.objectives.some((o) => o.problemId === p.id));
  }

  objectivesText() {
    const dx = this.data().orthoDx;
    return dx.objectives
      .filter((o) => o.objective.trim())
      .map((o) => {
        const p = dx.problems.find((x) => x.id === o.problemId);
        return `${o.objective}${p ? ` (${p.problem.toLowerCase()})` : ''}`;
      })
      .join('; ');
  }

  touch() {
    this.changed.emit();
  }

  setCat(key: DxCategoryKey, v: string) {
    const cat = this.data().orthoDx.categories;
    cat[key] = cat[key] === v ? '' : v;
    this.touch();
  }

  applySuggestions() {
    const cat = this.data().orthoDx.categories;
    for (const [k, v] of Object.entries(this.suggestions())) {
      if (v && !cat[k as DxCategoryKey]) cat[k as DxCategoryKey] = v;
    }
    this.touch();
  }

  applySummary(s: string) {
    const o = this.data().orthodontics;
    if (o.diagnosis.trim() && !confirm('El campo «Diagnóstico ortodóntico» ya tiene texto. ¿Reemplazarlo por el diagnóstico estructurado?')) return;
    o.diagnosis = s;
    this.touch();
  }

  cycle<T extends object>(item: T, key: keyof T, list: string[]) {
    if (this.disabled()) return;
    const cur = String(item[key] ?? '');
    (item as Record<keyof T, unknown>)[key] = list[(list.indexOf(cur) + 1) % list.length];
    this.touch();
  }

  private pushProblem(p: { problem: string; severity: string; location: string; priority: string }): OrthoProblem {
    const row: OrthoProblem = { id: newDxId('pb'), status: 'Activo', ...p };
    this.data().orthoDx.problems.push(row);
    return row;
  }

  addDetected(p: ReturnType<typeof detectProblems>[number]) {
    const { objective, ...rest } = p;
    void objective;
    this.pushProblem(rest);
    this.touch();
  }

  addAllDetected() {
    for (const p of this.newDetected()) {
      const { objective, ...rest } = p;
      void objective;
      this.pushProblem(rest);
    }
    this.touch();
  }

  addProblem() {
    this.pushProblem({ problem: '', severity: '', location: '', priority: 'Media' });
    this.touch();
  }

  removeProblem(p: OrthoProblem) {
    const dx = this.data().orthoDx;
    const linked = dx.objectives.filter((o) => o.problemId === p.id).length;
    if (!confirm(`¿Quitar el problema «${p.problem || 'sin nombre'}»?${linked ? ` Sus ${linked} objetivo(s) quedarán sin problema asociado.` : ''}`)) return;
    dx.problems = dx.problems.filter((x) => x.id !== p.id);
    for (const o of dx.objectives) if (o.problemId === p.id) o.problemId = '';
    this.touch();
  }

  objectivesFromProblems() {
    const dx = this.data().orthoDx;
    const detected = detectProblems(this.data());
    for (const p of this.problemsWithoutObjective()) {
      const match = detected.find((d) => d.problem.toLowerCase() === p.problem.toLowerCase());
      dx.objectives.push({
        id: newDxId('ob'),
        problemId: p.id,
        objective: match?.objective || guessObjective(p.problem),
        priority: p.priority || 'Media',
        status: 'Pendiente',
      });
    }
    this.touch();
  }

  addObjective() {
    this.data().orthoDx.objectives.push({ id: newDxId('ob'), problemId: '', objective: '', priority: 'Media', status: 'Pendiente' });
    this.touch();
  }

  removeObjective(id: string) {
    if (!confirm('¿Quitar este objetivo?')) return;
    const dx = this.data().orthoDx;
    dx.objectives = dx.objectives.filter((o) => o.id !== id);
    this.touch();
  }

  applyObjectives() {
    const o = this.data().orthodontics;
    if (o.objectives.trim() && !confirm('El campo «Objetivos de tratamiento» ya tiene texto. ¿Reemplazarlo?')) return;
    o.objectives = this.objectivesText();
    this.touch();
  }
}

function guessObjective(problem: string): string {
  const p = problem.toLowerCase();
  if (p.includes('apiñ')) return 'Alinear';
  if (p.includes('overjet')) return 'Corregir overjet';
  if (p.includes('profunda') || p.includes('overbite')) return 'Corregir overbite';
  if (p.includes('abierta')) return 'Control vertical';
  if (p.includes('cruzada')) return 'Control transversal';
  if (p.includes('línea media') || p.includes('linea media')) return 'Corregir línea media';
  if (p.includes('diastema') || p.includes('espacia')) return 'Cerrar espacios';
  if (p.includes('rotac')) return 'Corregir rotaciones';
  if (p.includes('clase')) return 'Corregir clase molar';
  if (p.includes('sonrisa')) return 'Mejorar sonrisa';
  if (p.includes('perfil')) return 'Mejorar perfil';
  if (p.includes('funci')) return 'Mejorar función';
  return '';
}
