import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DentistryContent } from './dentistry.models';
import type { CephRowValue } from './ortho-ceph.data';
import { CEPH_ANALYSES, CEPH_MEASURES, CephCell, CephMeasureDef, cephCell } from './ortho-ceph.models';

/** Tabla cefalométrica: valor, norma, desviación e interpretación orientativa, con gráfico de desviaciones. */
@Component({
  selector: 'app-ortho-ceph-table',
  imports: [FormsModule],
  template: `
    @let ceph = data().orthoCeph;
    <div class="ct">
      <div class="ct-top">
        <span class="ct-lbl">Análisis</span>
        <div class="ct-chips">
          @for (a of analyses; track a.key) {
            <button type="button" [class.on]="currentAnalysis() === a.key" [disabled]="disabled()" (click)="setAnalysis(a.key)">{{ a.label }}</button>
          }
        </div>
        <span class="ct-count">{{ filled() }} de {{ cells().length }} medidas</span>
      </div>
      <div class="ct-table">
        <div class="ct-row ct-head">
          <span>Medición</span><span>Valor</span><span>Norma</span><span>DE</span><span>Desv.</span><span>Gráfico</span><span>Interpretación</span><span>Observación</span>
        </div>
        @for (c of cells(); track c.def.key) {
          <div class="ct-row" [attr.data-tone]="c.tone">
            <span class="ct-name">{{ c.def.label }} <small>({{ c.def.unit }})</small>
              @if (c.def.linked) {
                <i class="ct-link" title="Compartido con los campos cefalométricos y el trazado">⟷</i>
              }
            </span>
            <input [ngModel]="c.raw" (ngModelChange)="setValue(c.def, $event)" [readonly]="disabled()" inputmode="decimal" [attr.aria-label]="c.def.label + ' valor'" />
            <input [ngModel]="rowOf(c.def.key)?.norm || ''" (ngModelChange)="setRow(c.def.key, 'norm', $event)" [placeholder]="'' + c.def.norm" [readonly]="disabled()" inputmode="decimal" aria-label="Norma" />
            <input [ngModel]="rowOf(c.def.key)?.sd || ''" (ngModelChange)="setRow(c.def.key, 'sd', $event)" [placeholder]="'' + c.def.sd" [readonly]="disabled()" inputmode="decimal" aria-label="Desviación estándar" />
            <b class="ct-diff">{{ c.diff === null ? '—' : (c.diff > 0 ? '+' : '') + c.diff }}</b>
            <svg viewBox="0 0 160 18" class="ct-bar" aria-hidden="true">
              <rect x="0" y="6" width="160" height="6" rx="3" fill="#eef2f7" />
              <rect x="40" y="6" width="80" height="6" fill="#fde68a" opacity="0.6" />
              <rect x="60" y="6" width="40" height="6" fill="#bbf7d0" />
              <line x1="80" y1="2" x2="80" y2="16" stroke="#16a34a" stroke-width="1" />
              @if (c.z !== null) {
                <circle [attr.cx]="barX(c)" cy="9" r="4.5" [attr.fill]="toneColor(c.tone)" stroke="#fff" stroke-width="1.2" />
              }
            </svg>
            <span class="ct-read">{{ c.reading || '—' }}</span>
            <input [ngModel]="rowOf(c.def.key)?.note || ''" (ngModelChange)="setRow(c.def.key, 'note', $event)" [readonly]="disabled()" aria-label="Observación" />
          </div>
        }
      </div>
      <p class="ct-note">
        Barra verde: ±1 DE · amarilla: ±2 DE. Las interpretaciones son orientativas: el diagnóstico no se establece por una sola medición
        sino integrando todos los hallazgos clínicos y radiográficos. Las medidas marcadas con ⟷ se comparten con el trazado cefalométrico.
      </p>
      <label class="ct-obs">Conclusión cefalométrica del profesional
        <textarea rows="2" [(ngModel)]="ceph.notes" (ngModelChange)="touch()" [readonly]="disabled()"></textarea>
      </label>
    </div>
  `,
  styles: `
    .ct { display: grid; gap: 8px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
    .ct-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .ct-lbl, .ct-count { font-size: 11px; color: #64748b; }
    .ct-count { margin-left: auto; }
    .ct-chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .ct-chips button { border: 1px solid #cbd5e1; background: #fff; border-radius: 99px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
    .ct-chips button.on { background: #12609a; border-color: #12609a; color: #fff; }
    .ct-table { display: grid; gap: 2px; overflow-x: auto; }
    .ct-row { display: grid; grid-template-columns: 170px 64px 58px 48px 50px 150px minmax(170px, 1fr) minmax(120px, 0.8fr); gap: 6px; align-items: center; padding: 3px 6px; border-radius: 8px; font-size: 12px; min-width: 900px; }
    .ct-row[data-tone='warn'] { background: #fffbeb; }
    .ct-row[data-tone='danger'] { background: #fef2f2; }
    .ct-head { font-size: 11px; font-weight: 600; color: #64748b; }
    .ct-row input { width: 100%; min-width: 0; }
    .ct-name { font-weight: 600; color: #123b60; }
    .ct-name small { color: #64748b; font-weight: 400; }
    .ct-link { font-style: normal; color: #12609a; margin-left: 4px; }
    .ct-diff { text-align: right; }
    .ct-bar { width: 150px; height: 18px; }
    .ct-read { color: #334155; }
    .ct-note { margin: 0; font-size: 11px; color: #64748b; }
    .ct-obs { display: grid; gap: 2px; font-size: 11px; color: #475569; }
  `,
})
export class OrthoCephTable {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly analyses = CEPH_ANALYSES;

  currentAnalysis() {
    return this.data().orthoCeph.analysis || 'COMPLETO';
  }

  cells(): CephCell[] {
    const keys = CEPH_ANALYSES.find((a) => a.key === this.currentAnalysis())?.keys ?? CEPH_ANALYSES[0].keys;
    const linked = this.data().orthodontics.cephalometry as unknown as Record<string, string>;
    return CEPH_MEASURES.filter((m) => keys.includes(m.key)).map((m) => cephCell(m, this.data().orthoCeph, linked));
  }

  filled() {
    return this.cells().filter((c) => c.value !== null).length;
  }

  rowOf(key: string): CephRowValue | undefined {
    return this.data().orthoCeph.rows[key];
  }

  barX(c: CephCell) {
    const z = Math.max(-4, Math.min(4, c.z ?? 0));
    return 80 + z * 20;
  }

  toneColor(tone: string) {
    return tone === 'ok' ? '#16a34a' : tone === 'warn' ? '#f59e0b' : '#dc2626';
  }

  touch() {
    this.changed.emit();
  }

  setAnalysis(key: string) {
    this.data().orthoCeph.analysis = key;
    this.touch();
  }

  setValue(def: CephMeasureDef, v: string) {
    if (this.disabled()) return;
    if (def.linked) {
      (this.data().orthodontics.cephalometry as unknown as Record<string, string>)[def.linked] = v;
    } else {
      this.setRow(def.key, 'value', v);
      return;
    }
    this.touch();
  }

  setRow(key: string, field: 'value' | 'norm' | 'sd' | 'note', v: string) {
    if (this.disabled()) return;
    const rows = this.data().orthoCeph.rows;
    const row = (rows[key] ??= { value: '', norm: '', sd: '', note: '' });
    row[field] = v;
    this.touch();
  }
}
