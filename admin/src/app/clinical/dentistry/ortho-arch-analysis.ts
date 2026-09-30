import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DentistryContent } from './dentistry.models';
import {
  ARCH_FORMS,
  ARCH_SYMMETRY,
  ARCH_TEETH,
  ArchKey,
  COMPRESSION_LEVELS,
  INCISOR_RELATIONS,
  SAGITTAL_CLASSES,
  VERTICAL_PATTERNS,
  archDrawing,
  bolton,
  boltonText,
  spaceAnalysis,
  suggestSagittal,
  suggestVertical,
  transverseReading,
} from './ortho-arch.models';

type Tab = 'arch' | 'space' | 'bolton' | 'planes';

const LEVEL_COLOR: Record<string, string> = {
  'Sin discrepancia': '#16a34a',
  Espaciamiento: '#0891b2',
  Leve: '#f59e0b',
  Moderado: '#ea580c',
  Severo: '#dc2626',
};

/** Análisis de arcadas, espacios, Bolton y planos (transversal, sagital y vertical). */
@Component({
  selector: 'app-ortho-arch-analysis',
  imports: [FormsModule],
  template: `
    @let oa = data().orthoArch;
    <div class="aa">
      <div class="aa-tabs" role="tablist">
        @for (t of tabs; track t.key) {
          <button type="button" role="tab" [class.on]="tab() === t.key" [attr.aria-selected]="tab() === t.key" (click)="tab.set(t.key)">
            {{ t.label }}
            @if (tabBadge(t.key); as b) {
              <span class="aa-badge" [style.background]="b.color">{{ b.text }}</span>
            }
          </button>
        }
      </div>

      @if (tab() === 'arch' || tab() === 'space') {
        <div class="aa-seg aa-archsel">
          <button type="button" [class.on]="arch() === 'upper'" (click)="arch.set('upper')">Maxilar superior</button>
          <button type="button" [class.on]="arch() === 'lower'" (click)="arch.set('lower')">Mandíbula</button>
        </div>
      }

      @switch (tab()) {
        @case ('arch') {
          @let a = oa[arch()];
          @let dr = drawing();
          <div class="aa-arch">
            <svg class="aa-svg" [attr.viewBox]="viewBox()" role="img" aria-label="Dibujo de la arcada">
              <path [attr.d]="dr.path" fill="none" stroke="#cbd5e1" stroke-width="7" stroke-linecap="round" />
              <path [attr.d]="dr.path" fill="none" stroke="#12609a" stroke-width="0.6" stroke-dasharray="1.5 1.2" />
              <line [attr.x1]="dr.canine.l.x" [attr.y1]="dr.canine.l.y" [attr.x2]="dr.canine.r.x" [attr.y2]="dr.canine.r.y" class="aa-dim" />
              <text x="0" [attr.y]="dr.canine.l.y + 3.4" class="aa-dimtxt">{{ dr.ic }} mm</text>
              <line [attr.x1]="dr.molar.l.x" [attr.y1]="dr.molar.l.y + 7" [attr.x2]="dr.molar.r.x" [attr.y2]="dr.molar.r.y + 7" class="aa-dim" />
              <text x="0" [attr.y]="dr.molar.l.y + 11" class="aa-dimtxt">{{ dr.im }} mm</text>
              <line x1="0" y1="0" x2="0" [attr.y2]="dr.depth" class="aa-dim aa-depth" />
              <text x="1.2" [attr.y]="dr.depth / 2" class="aa-dimtxt aa-left">{{ dr.depth }} mm</text>
              @for (t of dr.teeth; track t.n) {
                <g class="aa-tooth" [class.sel]="selTooth() === t.n" [class.measured]="t.measured" (click)="pickTooth(t.n)">
                  <circle [attr.cx]="t.x" [attr.cy]="t.y" [attr.r]="t.r" />
                  <text [attr.x]="t.x" [attr.y]="t.y + 1">{{ t.n }}</text>
                </g>
              }
            </svg>
            <div class="aa-side">
              <span class="aa-lbl">Forma de arcada</span>
              <div class="aa-chips">
                @for (f of forms; track f) {
                  <button type="button" [class.on]="a.form === f" [disabled]="disabled()" (click)="setForm(f)">{{ f }}</button>
                }
              </div>
              <div class="aa-grid">
                <label>Ancho intercanino (mm) <input [(ngModel)]="a.intercanine" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
                <label>Ancho intermolar (mm) <input [(ngModel)]="a.intermolar" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
                <label>Longitud / profundidad (mm) <input [(ngModel)]="a.depth" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
                <label>Perímetro de arco (mm) <input [(ngModel)]="a.perimeter" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
              </div>
              <span class="aa-lbl">Simetría</span>
              <div class="aa-seg">
                @for (s of symmetry; track s) {
                  <button type="button" [class.on]="a.symmetry === s" [disabled]="disabled()" (click)="a.symmetry = a.symmetry === s ? '' : s; touch()">{{ s }}</button>
                }
              </div>
              @if (dr.estimated) {
                <p class="aa-note">Las medidas que faltan se dibujan con valores promedio.</p>
              }
              @if (!disabled() && a.form && arch() === 'upper' && data().orthodontics.models.archForm !== a.form) {
                <button type="button" class="aa-link" (click)="applyArchForm()">Registrar «{{ a.form }}» en Forma de arcada</button>
              }
            </div>
          </div>
          <div class="aa-ruler">
            <span class="aa-lbl">Ancho mesiodistal por diente (mm). Toque un diente o escriba y pulse Enter para pasar al siguiente.</span>
            <div class="aa-widths">
              @for (n of teethOf(arch()); track n) {
                <label [class.sel]="selTooth() === n">
                  <b>{{ n }}</b>
                  <input
                    [id]="'aa-w-' + n"
                    [(ngModel)]="oa.widths[n]"
                    (ngModelChange)="touch()"
                    (focus)="selTooth.set(n)"
                    (keydown.enter)="nextTooth(n)"
                    [readonly]="disabled()"
                    inputmode="decimal"
                  />
                </label>
              }
            </div>
          </div>
        }
        @case ('space') {
          @let a = oa[arch()];
          @let sp = space(arch());
          @let dr = drawing();
          @let maxv = spaceMax(arch());
          <div class="aa-space">
            <div class="aa-bars">
              <div class="aa-barrow">
                <span>Disponible</span>
                <div class="aa-track"><i class="aa-avail" [style.width.%]="sp.available !== null ? (sp.available / maxv) * 100 : 0"></i></div>
                <b>{{ sp.available !== null ? sp.available + ' mm' : '—' }}</b>
              </div>
              <div class="aa-barrow">
                <span>Requerido</span>
                <div class="aa-track"><i class="aa-req" [style.width.%]="sp.required !== null ? (sp.required / maxv) * 100 : 0"></i></div>
                <b>{{ sp.required !== null ? sp.required + ' mm' : '—' }}</b>
              </div>
            </div>
            <div class="aa-result" [style.border-color]="levelColor(sp.level)">
              @if (sp.discrepancy !== null) {
                <strong [style.color]="levelColor(sp.level)">{{ sp.discrepancy > 0 ? '+' : '' }}{{ sp.discrepancy }} mm</strong>
                <span>{{ sp.level === 'Espaciamiento' ? 'Espaciamiento / diastemas' : sp.level === 'Sin discrepancia' ? 'Sin discrepancia' : 'Apiñamiento ' + sp.level.toLowerCase() }}</span>
              } @else {
                <span class="muted">Registre el perímetro disponible y el espacio requerido.</span>
              }
            </div>
            <div class="aa-grid">
              <label>Perímetro disponible (mm) <input [(ngModel)]="a.perimeter" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
              @if (!sp.requiredFromTeeth) {
                <label>Espacio requerido (mm) <input [(ngModel)]="a.requiredManual" (ngModelChange)="touch()" [readonly]="disabled()" inputmode="decimal" /></label>
              }
            </div>
            <p class="aa-note">
              Requerido: suma de anchos de 5 a 5 ({{ sp.measuredTeeth }} de 10 medidos{{ sp.requiredFromTeeth ? ', calculado' : ', o digítelo' }}).
              @if (!disabled() && !a.perimeter && !dr.estimated) {
                <button type="button" class="aa-link" (click)="a.perimeter = '' + dr.estimatedPerimeter; touch()">Usar perímetro estimado del dibujo ({{ dr.estimatedPerimeter }} mm)</button>
              }
            </p>
            <table class="aa-table">
              <thead><tr><th>Arcada</th><th>Disponible</th><th>Requerido</th><th>Diferencia</th><th>Grado</th></tr></thead>
              <tbody>
                @for (k of archKeys; track k) {
                  @let s = space(k);
                  <tr [class.cur]="k === arch()" (click)="arch.set(k)">
                    <td>{{ k === 'upper' ? 'Superior' : 'Inferior' }}</td>
                    <td>{{ s.available ?? '—' }}</td>
                    <td>{{ s.required ?? '—' }}</td>
                    <td [style.color]="levelColor(s.level)">{{ s.discrepancy ?? '—' }}</td>
                    <td>{{ s.level || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
            @if (!disabled()) {
              <div class="aa-actions">
                @if (sp.discrepancy !== null && modelDiscrepancy(arch()) !== '' + sp.discrepancy) {
                  <button type="button" class="aa-btn" (click)="applyDiscrepancy(arch())">Registrar {{ sp.discrepancy }} mm en Discrepancia {{ arch() === 'upper' ? 'superior' : 'inferior' }}</button>
                }
                @if (crowdingSuggestion(); as c) {
                  @if (data().orthodontics.intraoral.crowding !== c) {
                    <button type="button" class="aa-btn" (click)="applyCrowding(c)">Registrar apiñamiento: {{ c }}</button>
                  }
                }
              </div>
            }
          </div>
        }
        @case ('bolton') {
          <div class="aa-bolton">
            @for (b of boltons(); track b.kind) {
              <div class="aa-gauge">
                <div class="aa-ghead">
                  <strong>Bolton {{ b.kind }}</strong>
                  <span>{{ b.kind === 'anterior' ? 'Caninos a caninos (3–3)' : 'Primer molar a primer molar (6–6)' }} · norma {{ b.norm }} ± {{ b.sd }} %</span>
                </div>
                <svg viewBox="0 -14 300 60" class="aa-gsvg">
                  <rect x="10" y="16" width="280" height="10" rx="5" fill="#e2e8f0" />
                  <rect [attr.x]="gx(b, b.norm - b.sd)" y="16" [attr.width]="gx(b, b.norm + b.sd) - gx(b, b.norm - b.sd)" height="10" fill="#bbf7d0" />
                  <line [attr.x1]="gx(b, b.norm)" y1="12" [attr.x2]="gx(b, b.norm)" y2="30" stroke="#16a34a" stroke-width="1.5" />
                  <text x="10" y="42" class="aa-gt">{{ b.norm - 6 }}</text>
                  <text [attr.x]="gx(b, b.norm)" y="42" class="aa-gt" text-anchor="middle">{{ b.norm }}</text>
                  <text x="290" y="42" class="aa-gt" text-anchor="end">{{ b.norm + 6 }}</text>
                  @if (b.ratio !== null) {
                    <g [attr.transform]="'translate(' + gx(b, b.ratio) + ',0)'">
                      <path d="M-6 2 L6 2 L0 12 Z" [attr.fill]="b.excess ? '#dc2626' : '#12609a'" />
                      <text y="-1" text-anchor="middle" class="aa-gv" [attr.fill]="b.excess ? '#dc2626' : '#12609a'">{{ b.ratio.toFixed(1) }} %</text>
                    </g>
                  }
                </svg>
                <div class="aa-gfoot">
                  <span>Suma maxilar: <b>{{ b.upper ?? '—' }}</b> mm</span>
                  <span>Suma mandibular: <b>{{ b.lower ?? '—' }}</b> mm</span>
                  <span [style.color]="b.excess ? '#dc2626' : '#16a34a'">{{ b.reading || 'Faltan anchos por medir' }}</span>
                </div>
              </div>
            }
            <p class="aa-note">Los anchos se registran en la pestaña «Arcadas» (tocando cada diente). Faltan {{ missingWidths() }} de 24.</p>
            @if (!disabled() && boltonSummary() && data().orthodontics.models.bolton !== boltonSummary()) {
              <button type="button" class="aa-btn" (click)="applyBolton()">Registrar «{{ boltonSummary() }}» en Índice de Bolton</button>
            }
          </div>
        }
        @case ('planes') {
          @let io = data().orthodontics.intraoral;
          <div class="aa-planes">
            <div class="aa-card">
              <h5>Transversal</h5>
              <p class="aa-facts">
                Mordida cruzada: <b>{{ io.crossBite || '—' }}</b>
                @if (io.crossBiteSide) {
                  · {{ io.crossBiteSide }}
                }
                <br />Intermolar sup. / inf.: <b>{{ oa.upper.intermolar || '—' }}</b> / <b>{{ oa.lower.intermolar || '—' }}</b> mm
              </p>
              @if (transverse(); as tr) {
                <p class="aa-hint" [attr.data-tone]="tr.tone">{{ tr.text }}</p>
              }
              <label>Compresión maxilar
                <select [(ngModel)]="oa.transverse.maxillaryCompression" (ngModelChange)="touch()" [disabled]="disabled()">
                  <option value="">—</option>
                  @for (o of compression; track o) {
                    <option [value]="o">{{ o }}</option>
                  }
                </select>
              </label>
              <label>Compresión mandibular
                <select [(ngModel)]="oa.transverse.mandibularCompression" (ngModelChange)="touch()" [disabled]="disabled()">
                  <option value="">—</option>
                  @for (o of compression; track o) {
                    <option [value]="o">{{ o }}</option>
                  }
                </select>
              </label>
              <label>Asimetría transversal <input [(ngModel)]="oa.transverse.asymmetry" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
            </div>
            <div class="aa-card">
              <h5>Sagital</h5>
              <p class="aa-facts">
                Molar D / I: <b>{{ io.molarRight || '—' }}</b> / <b>{{ io.molarLeft || '—' }}</b><br />
                Canina D / I: <b>{{ io.canineRight || '—' }}</b> / <b>{{ io.canineLeft || '—' }}</b><br />
                Overjet: <b>{{ io.overjet ? io.overjet + ' mm' : '—' }}</b>
              </p>
              <div class="aa-chips">
                @for (c of sagittalClasses; track c) {
                  <button type="button" [class.on]="oa.sagittal.classification === c" [class.sug]="sagittalSuggestion() === c" [disabled]="disabled()" (click)="oa.sagittal.classification = oa.sagittal.classification === c ? '' : c; touch()">{{ c }}</button>
                }
              </div>
              @if (sagittalSuggestion() && sagittalSuggestion() !== oa.sagittal.classification) {
                <p class="aa-hint" data-tone="ok">Según clases molares y overjet: {{ sagittalSuggestion() }}.</p>
              }
              <label>Relación incisiva
                <select [(ngModel)]="oa.sagittal.incisorRelation" (ngModelChange)="touch()" [disabled]="disabled()">
                  <option value="">—</option>
                  @for (o of incisorRelations; track o) {
                    <option [value]="o">{{ o }}</option>
                  }
                </select>
              </label>
            </div>
            <div class="aa-card">
              <h5>Vertical</h5>
              <p class="aa-facts">
                Overbite: <b>{{ io.overbite ? io.overbite + ' mm' : '—' }}</b> · Curva de Spee: <b>{{ io.curveOfSpee || '—' }}</b><br />
                Mordida abierta: <b>{{ io.openBite || '—' }}</b> · Profunda: <b>{{ io.deepBite || '—' }}</b><br />
                Exposición incisiva en reposo: <b>{{ data().orthoExam.smile.restExposure ? data().orthoExam.smile.restExposure + ' mm' : '—' }}</b>
              </p>
              <div class="aa-chips">
                @for (c of verticalPatterns; track c) {
                  <button type="button" [class.on]="oa.vertical.pattern === c" [class.sug]="verticalSuggestion() === c" [disabled]="disabled()" (click)="oa.vertical.pattern = oa.vertical.pattern === c ? '' : c; touch()">{{ c }}</button>
                }
              </div>
              @if (verticalSuggestion() && verticalSuggestion() !== oa.vertical.pattern) {
                <p class="aa-hint" data-tone="ok">Según overbite y mordidas: {{ verticalSuggestion() }}.</p>
              }
              <label>Observaciones <input [(ngModel)]="oa.vertical.notes" (ngModelChange)="touch()" [readonly]="disabled()" /></label>
            </div>
          </div>
          <p class="aa-note">Clases, overjet, overbite y mordidas se editan en el mapa de oclusión; aquí se leen para no duplicarlos.</p>
        }
      }
    </div>
  `,
  styles: `
    .aa { display: grid; gap: 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
    .aa-tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid #e2e8f0; }
    .aa-tabs button { border: 0; background: none; padding: 8px 12px; font-size: 13px; color: #475569; border-bottom: 2px solid transparent; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
    .aa-tabs button.on { color: #123b60; border-bottom-color: #12609a; font-weight: 600; }
    .aa-badge { color: #fff; border-radius: 99px; padding: 0 7px; font-size: 10px; line-height: 16px; }
    .aa-seg { display: inline-flex; justify-self: start; border: 1px solid #cbd5e1; border-radius: 99px; overflow: hidden; }
    .aa-seg button { border: 0; background: #fff; padding: 4px 12px; font-size: 12px; cursor: pointer; }
    .aa-seg button + button { border-left: 1px solid #cbd5e1; }
    .aa-seg button.on { background: #12609a; color: #fff; }
    .aa-arch { display: grid; grid-template-columns: minmax(260px, 1.2fr) 1fr; gap: 14px; align-items: start; }
    @media (max-width: 820px) { .aa-arch { grid-template-columns: 1fr; } }
    .aa-svg { width: 100%; max-height: 330px; background: #f8fafc; border-radius: 14px; border: 1px solid #e2e8f0; }
    .aa-dim { stroke: #94a3b8; stroke-width: 0.35; stroke-dasharray: 1 0.8; }
    .aa-dimtxt { font-size: 2.6px; fill: #475569; text-anchor: middle; }
    .aa-dimtxt.aa-left { text-anchor: start; }
    .aa-tooth { cursor: pointer; }
    .aa-tooth circle { fill: #fff; stroke: #94a3b8; stroke-width: 0.4; }
    .aa-tooth.measured circle { fill: #e0f2fe; stroke: #12609a; }
    .aa-tooth.sel circle { fill: #12609a; stroke: #123b60; }
    .aa-tooth text { font-size: 2.3px; text-anchor: middle; fill: #334155; pointer-events: none; }
    .aa-tooth.sel text { fill: #fff; }
    .aa-side { display: grid; gap: 8px; }
    .aa-lbl { font-size: 11px; color: #64748b; }
    .aa-chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .aa-chips button { border: 1px solid #cbd5e1; background: #fff; border-radius: 99px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
    .aa-chips button.on { background: #12609a; border-color: #12609a; color: #fff; }
    .aa-chips button.sug:not(.on) { border-style: dashed; border-color: #16a34a; color: #166534; }
    .aa-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 6px 8px; }
    .aa label { display: grid; gap: 2px; font-size: 11px; color: #475569; }
    .aa-note { margin: 0; font-size: 11px; color: #64748b; }
    .aa-link { border: 0; background: none; padding: 0; color: #12609a; text-decoration: underline; font-size: 12px; cursor: pointer; justify-self: start; }
    .aa-btn { justify-self: start; border: 1px solid #12609a; background: #f4f8fb; color: #12609a; border-radius: 99px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
    .aa-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .aa-ruler { display: grid; gap: 6px; }
    .aa-widths { display: grid; grid-template-columns: repeat(12, minmax(44px, 1fr)); gap: 4px; }
    @media (max-width: 820px) { .aa-widths { grid-template-columns: repeat(6, 1fr); } }
    .aa-widths label { text-align: center; border-radius: 8px; padding: 2px; }
    .aa-widths label.sel { background: #dbeafe; }
    .aa-widths b { font-size: 11px; color: #123b60; }
    .aa-widths input { width: 100%; text-align: center; }
    .aa-space, .aa-bolton { display: grid; gap: 10px; }
    .aa-bars { display: grid; gap: 6px; }
    .aa-barrow { display: grid; grid-template-columns: 80px 1fr 70px; gap: 8px; align-items: center; font-size: 12px; }
    .aa-track { height: 14px; border-radius: 7px; background: #eef2f7; overflow: hidden; }
    .aa-track i { display: block; height: 100%; border-radius: 7px; transition: width 0.3s; }
    .aa-avail { background: #12609a; }
    .aa-req { background: #f59e0b; }
    .aa-result { display: flex; gap: 10px; align-items: baseline; padding: 8px 12px; border-left: 4px solid #cbd5e1; background: #f8fafc; border-radius: 8px; font-size: 13px; }
    .aa-result strong { font-size: 22px; }
    .aa-table { border-collapse: collapse; font-size: 12px; width: 100%; max-width: 560px; }
    .aa-table th, .aa-table td { padding: 4px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; }
    .aa-table tr.cur { background: #eef6fc; }
    .aa-table tbody tr { cursor: pointer; }
    .aa-gauge { display: grid; gap: 4px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 12px; }
    .aa-ghead { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; font-size: 12px; color: #64748b; }
    .aa-ghead strong { color: #123b60; font-size: 13px; text-transform: capitalize; }
    .aa-gsvg { width: 100%; max-width: 520px; overflow: visible; }
    .aa-gt { font-size: 8px; fill: #64748b; }
    .aa-gv { font-size: 9px; font-weight: 700; }
    .aa-gfoot { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: #334155; }
    .aa-planes { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
    .aa-card { display: grid; gap: 8px; align-content: start; padding: 10px; border: 1px solid #e2e8f0; border-radius: 12px; }
    .aa-card h5 { margin: 0; font-size: 13px; color: #123b60; }
    .aa-facts { margin: 0; font-size: 12px; color: #334155; line-height: 1.6; }
    .aa-hint { margin: 0; padding: 4px 8px; border-radius: 8px; font-size: 12px; }
    .aa-hint[data-tone='ok'] { background: #f0fdf4; color: #166534; }
    .aa-hint[data-tone='warn'] { background: #fffbeb; color: #92400e; }
  `,
})
export class OrthoArchAnalysis {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly tabs: Array<{ key: Tab; label: string }> = [
    { key: 'arch', label: 'Arcadas' },
    { key: 'space', label: 'Espacios' },
    { key: 'bolton', label: 'Bolton' },
    { key: 'planes', label: 'Transversal · Sagital · Vertical' },
  ];
  readonly archKeys: ArchKey[] = ['upper', 'lower'];
  readonly forms = ARCH_FORMS;
  readonly symmetry = ARCH_SYMMETRY;
  readonly compression = COMPRESSION_LEVELS;
  readonly sagittalClasses = SAGITTAL_CLASSES;
  readonly incisorRelations = INCISOR_RELATIONS;
  readonly verticalPatterns = VERTICAL_PATTERNS;

  readonly tab = signal<Tab>('arch');
  readonly arch = signal<ArchKey>('upper');
  readonly selTooth = signal(0);

  teethOf(arch: ArchKey) {
    return ARCH_TEETH[arch];
  }

  drawing() {
    return archDrawing(this.data().orthoArch, this.arch());
  }

  viewBox() {
    const d = this.drawing();
    const half = d.im / 2 + 12;
    return `${-half} -8 ${half * 2} ${d.depth + 26}`;
  }

  space(arch: ArchKey) {
    return spaceAnalysis(this.data().orthoArch, arch);
  }

  spaceMax(arch: ArchKey) {
    const s = this.space(arch);
    return Math.max(s.available ?? 0, s.required ?? 0, 1) * 1.08;
  }

  levelColor(level: string) {
    return LEVEL_COLOR[level] ?? '#94a3b8';
  }

  boltons() {
    const d = this.data().orthoArch;
    return [bolton(d, 'anterior'), bolton(d, 'total')];
  }

  boltonSummary() {
    return boltonText(this.data().orthoArch);
  }

  gx(b: { norm: number }, v: number) {
    const lo = b.norm - 6;
    const t = Math.max(0, Math.min(1, (v - lo) / 12));
    return 10 + t * 280;
  }

  missingWidths() {
    const w = this.data().orthoArch.widths;
    return [...ARCH_TEETH.upper, ...ARCH_TEETH.lower].filter((n) => !w[n]).length;
  }

  transverse() {
    return transverseReading(this.data().orthoArch);
  }

  sagittalSuggestion() {
    return suggestSagittal(this.data().orthodontics.intraoral);
  }

  verticalSuggestion() {
    return suggestVertical(this.data().orthodontics.intraoral);
  }

  /** Peor grado entre las dos arcadas, en los términos del campo Apiñamiento. */
  crowdingSuggestion(): string {
    const order = ['No', 'Leve', 'Moderado', 'Severo'];
    let worst = -1;
    for (const k of this.archKeys) {
      const lvl = this.space(k).level;
      if (!lvl) continue;
      const i = lvl === 'Espaciamiento' || lvl === 'Sin discrepancia' ? 0 : order.indexOf(lvl);
      worst = Math.max(worst, i);
    }
    return worst < 0 ? '' : order[worst];
  }

  tabBadge(t: Tab): { text: string; color: string } | null {
    if (t === 'space') {
      const worst = this.crowdingSuggestion();
      if (!worst) return null;
      return { text: worst === 'No' ? 'OK' : worst, color: worst === 'No' ? '#16a34a' : LEVEL_COLOR[worst] };
    }
    if (t === 'bolton') {
      const b = this.boltons().filter((x) => x.ratio !== null);
      if (!b.length) return null;
      const bad = b.some((x) => x.excess);
      return { text: bad ? 'Discrepancia' : 'OK', color: bad ? '#dc2626' : '#16a34a' };
    }
    return null;
  }

  modelDiscrepancy(arch: ArchKey) {
    const m = this.data().orthodontics.models;
    return arch === 'upper' ? m.upperDiscrepancy : m.lowerDiscrepancy;
  }

  touch() {
    this.changed.emit();
  }

  setForm(f: string) {
    const a = this.data().orthoArch[this.arch()];
    a.form = a.form === f ? '' : f;
    this.touch();
  }

  pickTooth(n: number) {
    this.selTooth.set(n);
    setTimeout(() => (document.getElementById(`aa-w-${n}`) as HTMLInputElement | null)?.focus());
  }

  nextTooth(n: number) {
    const list = ARCH_TEETH[this.arch()];
    const i = list.indexOf(n);
    if (i >= 0 && i < list.length - 1) this.pickTooth(list[i + 1]);
  }

  applyArchForm() {
    this.data().orthodontics.models.archForm = this.data().orthoArch.upper.form;
    this.touch();
  }

  applyDiscrepancy(arch: ArchKey) {
    const d = this.space(arch).discrepancy;
    if (d === null) return;
    const m = this.data().orthodontics.models;
    if (arch === 'upper') m.upperDiscrepancy = String(d);
    else m.lowerDiscrepancy = String(d);
    this.touch();
  }

  applyCrowding(c: string) {
    this.data().orthodontics.intraoral.crowding = c;
    this.touch();
  }

  applyBolton() {
    this.data().orthodontics.models.bolton = this.boltonSummary();
    this.touch();
  }
}
