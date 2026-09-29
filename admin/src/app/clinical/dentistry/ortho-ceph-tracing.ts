import { Component, ElementRef, OnInit, ViewChild, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CEPH_LANDMARKS,
  CEPH_LINES,
  CephLandmarkKey,
  CephResult,
  cephDiagnosisText,
  cephValueText,
  computeCeph,
  footOn,
  skeletalClassForAnb,
  skeletalPatternText,
} from './ceph-geometry';
import { CephTracing } from './dentistry.models';
import { ORTHO_MEASURE_RULES, OrthoMeasureKey, fmt } from './ortho-measures';

export interface CephRadiographOption {
  attachmentId: string;
  label: string;
}

interface MetricDef {
  key: keyof CephResult;
  label: string;
  name: string;
  unit: '°' | '%' | 'mm';
  needs: CephLandmarkKey[];
  /** Rango posible; fuera de él los puntos están mal ubicados. */
  min: number;
  max: number;
  norm: [number, number];
  interpret: (v: number) => string;
  primary?: boolean;
}

type MetricTone = 'ok' | 'low' | 'high' | 'invalid';

const TONE_BADGE: Record<MetricTone, string> = { ok: 'Normal', low: 'Disminuido', high: 'Aumentado', invalid: 'Revisar puntos' };

function fromRule(rule: OrthoMeasureKey) {
  const r = ORTHO_MEASURE_RULES[rule];
  return { min: r.min, max: r.max, norm: r.norm!, interpret: r.interpret };
}

const METRICS: MetricDef[] = [
  { key: 'sna', label: 'SNA', name: 'Posición del maxilar', unit: '°', needs: ['S', 'N', 'A'], primary: true, ...fromRule('cephalometry.sna') },
  { key: 'snb', label: 'SNB', name: 'Posición de la mandíbula', unit: '°', needs: ['S', 'N', 'B'], primary: true, ...fromRule('cephalometry.snb') },
  { key: 'anb', label: 'ANB', name: 'Relación maxilomandibular', unit: '°', needs: ['S', 'N', 'A', 'B'], primary: true, ...fromRule('cephalometry.anb') },
  { key: 'wits', label: 'Wits', name: 'AO − BO sobre plano oclusal', unit: 'mm', needs: ['A', 'B', 'OPp', 'OPa', 'R1', 'R2'], primary: true, ...fromRule('cephalometry.wits') },
  { key: 'fma', label: 'FMA', name: 'Frankfort / plano mandibular', unit: '°', needs: ['Po', 'Or', 'Go', 'Me'], ...fromRule('cephalometry.fma') },
  {
    key: 'snGoGn',
    label: 'SN-GoGn',
    name: 'Divergencia facial',
    unit: '°',
    needs: ['S', 'N', 'Go', 'Gn'],
    min: 5,
    max: 70,
    norm: [27, 37],
    interpret: (v) => (v < 27 ? 'Hipodivergente (braquifacial)' : v > 37 ? 'Hiperdivergente (dolicofacial)' : 'Normodivergente'),
  },
  {
    key: 'facialAngle',
    label: 'Ángulo facial',
    name: 'Posición del mentón (Downs)',
    unit: '°',
    needs: ['Po', 'Or', 'N', 'Pog'],
    min: 60,
    max: 110,
    norm: [82, 95],
    interpret: (v) => (v < 82 ? 'Mentón retruido' : v > 95 ? 'Mentón protruido' : 'Normal'),
  },
  {
    key: 'jarabak',
    label: 'Jarabak',
    name: 'Altura facial S-Go / N-Me',
    unit: '%',
    needs: ['S', 'Go', 'N', 'Me'],
    min: 40,
    max: 90,
    norm: [59, 63],
    interpret: (v) => (v < 59 ? 'Crecimiento horario (vertical)' : v > 63 ? 'Crecimiento antihorario (horizontal)' : 'Crecimiento equilibrado'),
  },
  { key: 'impa', label: 'IMPA', name: 'Inclinación incisivo inferior', unit: '°', needs: ['Go', 'Me', 'L1T', 'L1A'], ...fromRule('cephalometry.impa') },
  { key: 'upperIncisor', label: 'U1-SN', name: 'Inclinación incisivo superior', unit: '°', needs: ['S', 'N', 'U1T', 'U1A'], ...fromRule('cephalometry.upperIncisor') },
];

@Component({
  selector: 'app-ortho-ceph-tracing',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="ceph" (input)="$event.stopPropagation()" (change)="$event.stopPropagation()">
      <div class="ceph-toolbar">
        <label class="ceph-source">
          Radiografía lateral
          <select #src (change)="chooseRadiograph(src)" [disabled]="disabled() || !radiographs().length">
            <option value="" [selected]="!tracing().attachmentId">{{ radiographs().length ? 'Seleccione…' : 'Sin radiografías cargadas' }}</option>
            @for (r of radiographs(); track r.attachmentId) {
              <option [value]="r.attachmentId" [selected]="r.attachmentId === tracing().attachmentId">{{ r.label }}</option>
            }
          </select>
        </label>
        @if (!disabled()) {
          <label class="ceph-btn" [class.busy]="uploading()">
            {{ uploading() ? 'Subiendo…' : 'Subir radiografía' }}
            <input type="file" accept="image/*" hidden [disabled]="uploading()" (change)="onFile($event)" />
          </label>
        }
        @if (imageUrl()) {
          <span class="ceph-sep"></span>
          <label class="ceph-range">Brillo <input type="range" min="50" max="200" [ngModel]="brightness()" (ngModelChange)="brightness.set(+$event)" /></label>
          <label class="ceph-range">Contraste <input type="range" min="50" max="250" [ngModel]="contrast()" (ngModelChange)="contrast.set(+$event)" /></label>
          <span class="ceph-zoom">
            <button type="button" (click)="zoomBy(-0.25)" [disabled]="zoom() <= 1" aria-label="Alejar">−</button>
            {{ zoomPercent() }} %
            <button type="button" (click)="zoomBy(0.25)" [disabled]="zoom() >= 3" aria-label="Acercar">+</button>
          </span>
        }
      </div>

      @if (!tracing().attachmentId) {
        <p class="ceph-empty">
          Seleccione o suba la radiografía cefálica lateral. Luego marque los puntos fiduciarios en orden y el sistema
          calcula SNA, SNB, ANB, Wits, FMA, SN-GoGn, ángulo facial, Jarabak, IMPA y U1-SN, y redacta el diagnóstico
          esquelético descriptivo.
        </p>
      } @else {
        <div class="ceph-body">
          <div class="ceph-stage-wrap">
            @if (imageUrl(); as url) {
              <div class="ceph-stage" [style.width.%]="zoom() * 100">
                <img
                  [src]="url"
                  alt="Radiografía cefálica lateral"
                  draggable="false"
                  [style.filter]="'brightness(' + brightness() + '%) contrast(' + contrast() + '%)'"
                  (load)="onImageLoad($event)"
                />
                @if (size(); as s) {
                  <svg
                    #svg
                    class="ceph-overlay"
                    [class.placing]="!disabled() && !!active()"
                    [attr.viewBox]="'0 0 ' + s.w + ' ' + s.h"
                    preserveAspectRatio="none"
                    (pointerdown)="onStagePointerDown($event)"
                    (pointermove)="onPointerMove($event)"
                    (pointerup)="onPointerUp()"
                    (pointercancel)="onPointerUp()"
                  >
                    @for (l of lines(); track l.id) {
                      <line
                        [attr.x1]="l.x1"
                        [attr.y1]="l.y1"
                        [attr.x2]="l.x2"
                        [attr.y2]="l.y2"
                        [attr.class]="'ceph-line ' + l.kind"
                        [class.hl]="hlSet().has(l.from) && hlSet().has(l.to)"
                        [class.dim]="hlSet().size > 0 && !(hlSet().has(l.from) && hlSet().has(l.to))"
                        [attr.stroke-width]="scale().stroke"
                      />
                    }
                    @for (w of witsGuides(); track w.id) {
                      <line
                        [attr.x1]="w.x1"
                        [attr.y1]="w.y1"
                        [attr.x2]="w.x2"
                        [attr.y2]="w.y2"
                        class="ceph-line wits"
                        [attr.stroke-width]="scale().stroke"
                      />
                      <circle [attr.cx]="w.x2" [attr.cy]="w.y2" [attr.r]="scale().r * 0.6" class="ceph-foot" />
                      <text
                        class="ceph-foot-lbl"
                        [attr.x]="w.x2 + scale().r"
                        [attr.y]="w.y2 + scale().font"
                        [attr.font-size]="scale().font * 0.8"
                        [attr.stroke-width]="scale().stroke * 1.5"
                      >
                        {{ w.label }}
                      </text>
                    }
                    @for (p of placed(); track p.key) {
                      <g
                        class="ceph-pt"
                        [class.on]="p.key === active()"
                        [class.hl]="hlSet().has(p.key)"
                        [class.dim]="hlSet().size > 0 && !hlSet().has(p.key)"
                        (pointerdown)="onPointPointerDown($event, p.key)"
                      >
                        <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="scale().hit" class="hit" />
                        <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="scale().r" [attr.stroke-width]="scale().stroke" />
                        <text
                          [attr.x]="p.x + scale().r * 1.6"
                          [attr.y]="p.y - scale().r * 1.2"
                          [attr.font-size]="scale().font"
                          [attr.stroke-width]="scale().stroke * 1.5"
                        >
                          {{ p.short }}
                        </text>
                      </g>
                    }
                  </svg>
                }
              </div>
            } @else {
              <p class="ceph-empty">Cargando radiografía…</p>
            }
          </div>

          <aside class="ceph-side">
            <section class="ceph-panel">
              <p class="ceph-h">Puntos fiduciarios <span>{{ placedCount() }}/{{ landmarks.length }}</span></p>
              <div class="ceph-progress" role="progressbar" [attr.aria-valuenow]="placedCount()" aria-valuemin="0" [attr.aria-valuemax]="landmarks.length">
                <span [style.width.%]="(placedCount() / landmarks.length) * 100"></span>
              </div>
              <ol class="ceph-points">
                @for (l of landmarks; track l.key) {
                  <li>
                    <button
                      type="button"
                      [class.on]="l.key === active()"
                      [class.done]="isPlaced(l.key)"
                      [disabled]="disabled()"
                      (click)="active.set(l.key)"
                    >
                      <b>{{ l.short }}</b> {{ l.label }}
                      @if (isPlaced(l.key)) {
                        <span class="ok" aria-label="marcado">✓</span>
                      }
                    </button>
                  </li>
                }
              </ol>
              @if (!disabled()) {
                @if (activeLandmark(); as a) {
                  <p class="ceph-hint">
                    <strong>{{ a.label }}:</strong> {{ a.hint }}
                    {{ isPlaced(a.key) ? 'Arrastre el punto para ajustarlo o haga clic en otro sitio para moverlo.' : 'Haga clic sobre la radiografía.' }}
                  </p>
                  <div class="ceph-actions">
                    @if (isPlaced(a.key)) {
                      <button type="button" class="linkish" (click)="removePoint(a.key)">Quitar este punto</button>
                    }
                    @if (placedCount()) {
                      <button type="button" class="linkish danger" (click)="resetPoints()">Borrar todo el trazado</button>
                    }
                  </div>
                } @else if (placedCount() === landmarks.length) {
                  <p class="ceph-hint">Trazado completo. Seleccione un punto de la lista para ajustarlo.</p>
                }
              }
              <label class="ceph-calib">
                Calibración: milímetros entre R1 y R2
                <input
                  type="number"
                  min="1"
                  max="200"
                  step="1"
                  [ngModel]="calibrationMm()"
                  (ngModelChange)="setCalibration($event)"
                  [disabled]="disabled()"
                />
                <small>Necesaria para el Wits en milímetros. Marque dos rayas de la regla de la radiografía.</small>
              </label>
            </section>

            @let sk = skeletal();
            <section class="ceph-panel ceph-dx" [attr.data-tone]="sk?.tone ?? 'empty'">
              <div class="ceph-dx-head">
                <p class="ceph-h">Diagnóstico esqueletal sugerido</p>
                @if (sk) {
                  <span class="ceph-badge" [attr.data-tone]="sk.tone">{{ sk.cls ?? 'Revisar' }}</span>
                }
              </div>
              <label class="ceph-dx-field">
                <span class="sr-only">Diagnóstico esqueletal descriptivo</span>
                <textarea readonly rows="3" [value]="sk?.text ?? ''" placeholder="Marque S, N, A y B para calcular el ANB"></textarea>
              </label>
              <p class="ceph-dx-reason">
                {{ sk ? sk.reason : 'Regla: ANB > 4° → Clase II · ANB < 0° → Clase III · 0° a 4° → Clase I.' }}
              </p>
            </section>

            <section class="ceph-metrics">
              @for (m of metricCards(); track m.key) {
                <article class="ceph-metric" [class.primary]="m.primary" [attr.data-tone]="m.tone ?? 'empty'">
                  <header>
                    <span class="lbl">{{ m.label }}</span>
                    @if (m.tone) {
                      <span class="ceph-badge" [attr.data-tone]="m.tone">{{ m.badge }}</span>
                    }
                  </header>
                  <p class="val">
                    @if (m.value !== null) {
                      {{ m.text }}<small>{{ m.unit }}</small>
                    } @else {
                      —
                    }
                  </p>
                  <p class="name">{{ m.name }}</p>
                  <p class="detail">{{ m.value !== null ? m.message : 'Faltan: ' + m.missing }}</p>
                  <p class="norm">Norma {{ m.normText }}</p>
                </article>
              }
            </section>

            @if (!disabled()) {
              <button type="button" class="ceph-apply" [disabled]="!hasAnyResult()" (click)="applyResult()">
                Pasar medidas y diagnóstico a la historia
              </button>
              <p class="ceph-note">
                Reemplaza SNA, SNB, ANB, Wits, FMA, IMPA, U1-SN y la clase esquelética, y agrega el diagnóstico descriptivo
                al diagnóstico ortodóntico. SN-GoGn, ángulo facial y Jarabak son de referencia y se recalculan desde los
                puntos guardados.
              </p>
            }
          </aside>
        </div>

        <section class="ceph-table-wrap" aria-label="Motor de cálculos cefalométricos">
          <p class="ceph-h">
            Motor de cálculos
            <span>Pase el mouse por una fila para ver sus puntos en la radiografía · clic para fijarla o ir al punto que falta</span>
          </p>
          <table class="ceph-table">
            <thead>
              <tr>
                <th>Medida</th>
                <th>Valor obtenido</th>
                <th>Norma clínica</th>
                <th>Interpretación automática</th>
              </tr>
            </thead>
            <tbody>
              @for (m of metricCards(); track m.key) {
                <tr
                  [attr.data-tone]="m.tone ?? 'empty'"
                  [class.pinned]="pinnedMetric() === m.key"
                  tabindex="0"
                  (mouseenter)="hoverMetric.set(m.key)"
                  (mouseleave)="hoverMetric.set(null)"
                  (focus)="hoverMetric.set(m.key)"
                  (blur)="hoverMetric.set(null)"
                  (click)="onMetricRow(m.key, m.needs)"
                  (keydown.enter)="onMetricRow(m.key, m.needs)"
                >
                  <td>
                    <b>{{ m.label }}</b>
                    <small>{{ m.name }}</small>
                  </td>
                  <td class="num">{{ m.value !== null ? m.text + ' ' + m.unit : '—' }}</td>
                  <td class="norm">{{ m.normText }}</td>
                  <td>
                    @if (m.value !== null) {
                      <span class="ceph-tag" [attr.data-tone]="m.tone">{{ m.message }}</span>
                    } @else {
                      <span class="ceph-missing">Faltan: {{ m.missing }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .ceph { border: 1px solid #dbe4ea; border-radius: 12px; background: #fff; padding: 12px; }
    .ceph-toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px 14px; margin-bottom: 10px; }
    .ceph-source { min-width: 240px; flex: 1 1 240px; max-width: 420px; }
    .ceph-btn {
      display: inline-flex; align-items: center; padding: 7px 12px; border-radius: 8px; cursor: pointer;
      border: 1px solid #b9d3d8; color: #00576a; background: #f2f8f9; font-size: 0.85rem; font-weight: 600;
    }
    .ceph-btn.busy { opacity: 0.6; cursor: progress; }
    .ceph-sep { flex: 0 0 1px; align-self: stretch; background: #e2e8f0; }
    .ceph-range { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; color: #475569; }
    .ceph-range input { width: 100px; }
    .ceph-zoom { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; color: #475569; }
    .ceph-zoom button {
      width: 26px; height: 26px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-size: 1rem;
    }
    .ceph-empty { margin: 8px 0; color: #64748b; font-size: 0.86rem; }
    .ceph-body { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
    @media (max-width: 1180px) { .ceph-body { grid-template-columns: 1fr; } }
    .ceph-stage-wrap { overflow: auto; max-height: 78vh; border-radius: 12px; background: #0b1220; box-shadow: inset 0 0 0 1px #1e293b; }
    .ceph-stage { position: relative; min-width: 100%; }
    .ceph-stage img { display: block; width: 100%; height: auto; user-select: none; }
    .ceph-overlay { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
    .ceph-overlay.placing { cursor: crosshair; }
    .ceph-line { stroke: #38bdf8; fill: none; opacity: 0.9; }
    .ceph-line.ray { stroke: #a7f3d0; stroke-dasharray: 6 4; }
    .ceph-line.axis { stroke: #fbbf24; }
    .ceph-line.wits { stroke: #f472b6; stroke-dasharray: 4 3; }
    .ceph-foot { fill: #f472b6; stroke: #fff; stroke-width: 1; }
    .ceph-foot-lbl { fill: #fbcfe8; stroke: #0b1220; paint-order: stroke; font-weight: 700; font-family: system-ui, sans-serif; }
    .ceph-calib { display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; color: #334155; font-weight: 600; }
    .ceph-calib input { width: 100px; padding: 5px 8px; border-radius: 7px; border: 1px solid #cbd5e1; }
    .ceph-calib small { font-weight: 400; color: #64748b; }
    .ceph-pt { cursor: grab; }
    .ceph-pt .hit { fill: transparent; stroke: none; }
    .ceph-pt circle:not(.hit) { fill: #ef4444; stroke: #fff; }
    .ceph-pt.on circle:not(.hit) { fill: #22c55e; }
    .ceph-pt text { fill: #fff; stroke: #0b1220; paint-order: stroke; font-weight: 700; font-family: system-ui, sans-serif; }
    .ceph-side { display: flex; flex-direction: column; gap: 10px; }
    .ceph-panel {
      display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px;
      border: 1px solid #e2e8f0; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    }
    .ceph-h { margin: 0; font-weight: 700; font-size: 0.85rem; color: #0f172a; display: flex; justify-content: space-between; }
    .ceph-progress { height: 6px; border-radius: 99px; background: #e2e8f0; overflow: hidden; }
    .ceph-progress span { display: block; height: 100%; background: linear-gradient(90deg, #0ea5e9, #10b981); transition: width 0.2s; }
    .ceph-badge {
      display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 99px; white-space: nowrap;
      font-size: 0.68rem; font-weight: 700; letter-spacing: 0.02em; border: 1px solid transparent;
    }
    .ceph-badge[data-tone='ok'] { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
    .ceph-badge[data-tone='low'] { background: #dbeafe; color: #1e40af; border-color: #bfdbfe; }
    .ceph-badge[data-tone='high'] { background: #fef3c7; color: #92400e; border-color: #fde68a; }
    .ceph-badge[data-tone='invalid'] { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
    .ceph-badge[data-tone='c2'] { background: #ffedd5; color: #9a3412; border-color: #fed7aa; }
    .ceph-badge[data-tone='c3'] { background: #ede9fe; color: #5b21b6; border-color: #ddd6fe; }
    .ceph-dx { border-left: 4px solid #cbd5e1; }
    .ceph-dx[data-tone='ok'] { border-left-color: #22c55e; }
    .ceph-dx[data-tone='c2'] { border-left-color: #f97316; }
    .ceph-dx[data-tone='c3'] { border-left-color: #8b5cf6; }
    .ceph-dx[data-tone='invalid'] { border-left-color: #ef4444; }
    .ceph-dx-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .ceph-dx-field textarea {
      width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px; border: 1px solid #cbd5e1; resize: vertical;
      background: #f8fafc; font: inherit; font-size: 0.88rem; font-weight: 700; color: #0f172a; line-height: 1.35;
    }
    .ceph-dx[data-tone='c2'] .ceph-dx-field textarea { background: #fff7ed; border-color: #fed7aa; color: #9a3412; }
    .ceph-dx[data-tone='c3'] .ceph-dx-field textarea { background: #f5f3ff; border-color: #ddd6fe; color: #5b21b6; }
    .ceph-dx[data-tone='ok'] .ceph-dx-field textarea { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
    .ceph-dx-reason { margin: 0; font-size: 0.76rem; color: #475569; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .ceph-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    @media (max-width: 1180px) { .ceph-metrics { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); } }
    .ceph-metric {
      display: flex; flex-direction: column; gap: 2px; padding: 9px 10px; border-radius: 10px;
      border: 1px solid #e2e8f0; background: #fff; border-top: 3px solid #e2e8f0; min-width: 0;
    }
    .ceph-metric.primary { background: #f8fafc; }
    .ceph-metric[data-tone='ok'] { border-top-color: #22c55e; }
    .ceph-metric[data-tone='low'] { border-top-color: #3b82f6; }
    .ceph-metric[data-tone='high'] { border-top-color: #f59e0b; }
    .ceph-metric[data-tone='invalid'] { border-top-color: #ef4444; }
    .ceph-metric header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px; }
    .ceph-metric .lbl { font-size: 0.72rem; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 0.03em; }
    .ceph-metric .val { margin: 2px 0 0; font-size: 1.35rem; font-weight: 800; color: #0f172a; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .ceph-metric .val small { font-size: 0.8rem; font-weight: 700; color: #64748b; margin-left: 1px; }
    .ceph-metric[data-tone='empty'] .val { color: #cbd5e1; }
    .ceph-metric .name { margin: 0; font-size: 0.68rem; color: #64748b; }
    .ceph-metric .detail { margin: 2px 0 0; font-size: 0.72rem; color: #1e293b; font-weight: 600; }
    .ceph-metric[data-tone='empty'] .detail { color: #94a3b8; font-weight: 500; }
    .ceph-metric[data-tone='invalid'] .detail { color: #b42318; }
    .ceph-metric .norm { margin: 0; font-size: 0.66rem; color: #94a3b8; }
    .ceph-h span { color: #64748b; font-weight: 600; }
    .ceph-points { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .ceph-points button {
      width: 100%; text-align: left; font-size: 0.76rem; padding: 5px 7px; border-radius: 7px; cursor: pointer;
      border: 1px solid #e2e8f0; background: #f8fafc; color: #334155; display: flex; gap: 4px; align-items: center;
    }
    .ceph-points button b { color: #0f172a; min-width: 24px; }
    .ceph-points button.done { background: #f0fdf4; border-color: #bbf7d0; }
    .ceph-points button.on { border-color: #0ea5e9; box-shadow: 0 0 0 2px #bae6fd; background: #f0f9ff; }
    .ceph-points button .ok { margin-left: auto; color: #16a34a; font-weight: 700; }
    .ceph-hint { margin: 0; font-size: 0.8rem; color: #334155; background: #f1f5f9; border-radius: 8px; padding: 8px 10px; }
    .ceph-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .linkish { border: 0; background: none; padding: 0; color: #00798c; font: inherit; font-size: 0.8rem; font-weight: 600; text-decoration: underline; cursor: pointer; }
    .linkish.danger { color: #b42318; }
    .ceph-apply {
      margin-top: 4px; padding: 8px 12px; border-radius: 8px; border: 0; cursor: pointer;
      background: #00798c; color: #fff; font-weight: 700; font-size: 0.85rem;
    }
    .ceph-apply:disabled { opacity: 0.45; cursor: not-allowed; }
    .ceph-note { margin: 0; font-size: 0.74rem; color: #64748b; }
    .ceph-line, .ceph-pt { transition: opacity 0.15s; }
    .ceph-line.dim, .ceph-pt.dim { opacity: 0.18; }
    .ceph-line.hl { stroke: #facc15; opacity: 1; }
    .ceph-pt.hl circle:not(.hit) { fill: #facc15; stroke: #0b1220; }
    .ceph-table-wrap { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
    .ceph-table-wrap .ceph-h { justify-content: flex-start; gap: 10px; flex-wrap: wrap; align-items: baseline; }
    .ceph-table-wrap .ceph-h span { font-size: 0.74rem; font-weight: 500; }
    .ceph-table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; font-size: 0.84rem; }
    .ceph-table th { background: #f8fafc; color: #475569; font-weight: 700; text-align: left; padding: 8px 12px; font-size: 0.76rem; border-bottom: 1px solid #e2e8f0; }
    .ceph-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .ceph-table tr:last-child td { border-bottom: 0; }
    .ceph-table tbody tr { cursor: pointer; outline: none; transition: background 0.12s; }
    .ceph-table tbody tr:hover, .ceph-table tbody tr:focus-visible { background: #f0f9ff; }
    .ceph-table tbody tr.pinned { background: #fefce8; box-shadow: inset 4px 0 0 #facc15; }
    .ceph-table td b { display: block; color: #0f172a; }
    .ceph-table td small { color: #64748b; font-size: 0.72rem; }
    .ceph-table td.num { font-weight: 800; font-variant-numeric: tabular-nums; color: #0f172a; white-space: nowrap; }
    .ceph-table tr[data-tone='ok'] td.num { color: #047857; }
    .ceph-table tr[data-tone='low'] td.num { color: #1d4ed8; }
    .ceph-table tr[data-tone='high'] td.num, .ceph-table tr[data-tone='invalid'] td.num { color: #b91c1c; }
    .ceph-table td.norm { color: #64748b; white-space: nowrap; }
    .ceph-tag { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; }
    .ceph-tag[data-tone='ok'] { background: #d1fae5; color: #047857; }
    .ceph-tag[data-tone='low'] { background: #dbeafe; color: #1d4ed8; }
    .ceph-tag[data-tone='high'] { background: #fee2e2; color: #b91c1c; }
    .ceph-tag[data-tone='invalid'] { background: #fee2e2; color: #991b1b; }
    .ceph-missing { font-size: 0.74rem; color: #94a3b8; }
    @media (max-width: 700px) { .ceph-table td.norm, .ceph-table th:nth-child(3) { display: none; } }
  `,
})
export class OrthoCephTracingComponent implements OnInit {
  readonly tracing = input.required<CephTracing>();
  readonly imageUrl = input<string | null>(null);
  readonly radiographs = input<CephRadiographOption[]>([]);
  readonly disabled = input(false);
  readonly uploading = input(false);

  readonly changed = output<void>();
  readonly upload = output<File>();
  readonly apply = output<CephResult>();

  @ViewChild('svg') private svgRef?: ElementRef<SVGSVGElement>;

  readonly landmarks = CEPH_LANDMARKS;
  readonly active = signal<CephLandmarkKey | null>('S');
  readonly zoom = signal(1);
  readonly brightness = signal(100);
  readonly contrast = signal(120);
  readonly size = signal<{ w: number; h: number } | null>(null);
  private readonly tick = signal(0);
  private dragging: CephLandmarkKey | null = null;

  readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  readonly activeLandmark = computed(() => CEPH_LANDMARKS.find((l) => l.key === this.active()) ?? null);

  private readonly points = computed(() => {
    this.tick();
    return { ...this.tracing().points };
  });

  readonly placed = computed(() => {
    const pts = this.points();
    return CEPH_LANDMARKS.flatMap((l) => {
      const p = pts[l.key];
      return p ? [{ key: l.key, short: l.short, x: p.x, y: p.y }] : [];
    });
  });

  readonly placedCount = computed(() => this.placed().length);

  readonly lines = computed(() => {
    const pts = this.points();
    return CEPH_LINES.flatMap((l) => {
      const a = pts[l.from];
      const b = pts[l.to];
      return a && b ? [{ id: `${l.from}-${l.to}`, from: l.from, to: l.to, kind: l.kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y }] : [];
    });
  });

  readonly scale = computed(() => {
    const s = this.size();
    const base = s ? Math.max(s.w, s.h) : 1000;
    return { r: base / 160, hit: base / 70, stroke: base / 650, font: base / 48 };
  });

  readonly calibrationMm = computed(() => {
    this.tick();
    return this.tracing().calibrationMm ?? 10;
  });

  readonly result = computed(() => computeCeph(this.points(), this.calibrationMm()));

  /** Perpendiculares de A y B al plano oclusal (AO y BO del Wits). */
  readonly witsGuides = computed(() => {
    const { A, B, OPp, OPa } = this.points();
    if (!OPp || !OPa) return [];
    const out: Array<{ id: string; label: string; x1: number; y1: number; x2: number; y2: number }> = [];
    for (const [id, p] of [['AO', A], ['BO', B]] as const) {
      const f = p ? footOn(OPp, OPa, p) : null;
      if (p && f) out.push({ id, label: id, x1: p.x, y1: p.y, x2: f.x, y2: f.y });
    }
    return out;
  });

  setCalibration(value: number | string) {
    const mm = Number(value);
    if (!Number.isFinite(mm) || mm <= 0) return;
    this.tracing().calibrationMm = mm;
    this.commit();
  }

  readonly metricCards = computed(() => {
    const res = this.result();
    const pts = this.points();
    return METRICS.map((m) => {
      const value = res[m.key];
      const tone: MetricTone | null =
        value === null ? null : value < m.min || value > m.max ? 'invalid' : value < m.norm[0] ? 'low' : value > m.norm[1] ? 'high' : 'ok';
      const missing = m.needs
        .filter((k) => !pts[k])
        .map((k) => CEPH_LANDMARKS.find((l) => l.key === k)!.short)
        .join(', ');
      return {
        key: m.key,
        label: m.label,
        name: m.name,
        unit: m.unit,
        primary: !!m.primary,
        value,
        text: cephValueText(value),
        tone,
        badge: tone ? TONE_BADGE[tone] : '',
        message: value === null ? '' : tone === 'invalid' ? `Valor imposible (${fmt(m.min)} a ${fmt(m.max)} ${m.unit})` : m.interpret(value),
        normText: `${fmt(m.norm[0])} a ${fmt(m.norm[1])} ${m.unit}`,
        missing,
        needs: m.needs,
      };
    });
  });

  readonly hoverMetric = signal<string | null>(null);
  readonly pinnedMetric = signal<string | null>(null);
  /** Puntos que usa la medida señalada en la tabla; los demás se atenúan. */
  readonly hlSet = computed(() => {
    const key = this.hoverMetric() ?? this.pinnedMetric();
    return new Set<string>(METRICS.find((m) => m.key === key)?.needs ?? []);
  });

  onMetricRow(key: string, needs: CephLandmarkKey[]) {
    const missing = needs.find((k) => !this.points()[k]);
    if (missing && !this.disabled()) {
      this.pinnedMetric.set(key);
      this.active.set(missing);
      return;
    }
    this.pinnedMetric.update((p) => (p === key ? null : key));
  }

  /** Motor de reglas: clase esquelética a partir del ANB del trazado. */
  readonly skeletal = computed(() => {
    const anb = this.result().anb;
    if (anb === null) return null;
    const rule = ORTHO_MEASURE_RULES['cephalometry.anb'];
    if (anb < rule.min || anb > rule.max) {
      return { cls: null, tone: 'invalid', text: '', reason: `ANB de ${fmt(anb)}° no es posible: revise los puntos S, N, A y B.` };
    }
    const cls = skeletalClassForAnb(anb);
    const reason =
      cls === 'Clase II' ? `ANB ${fmt(anb)}° > 4°: maxilar adelantado respecto a la mandíbula.`
      : cls === 'Clase III' ? `ANB ${fmt(anb)}° < 0°: mandíbula adelantada respecto al maxilar.`
      : `ANB ${fmt(anb)}° entre 0° y 4°: relación maxilomandibular normal.`;
    const tone = cls === 'Clase II' ? 'c2' : cls === 'Clase III' ? 'c3' : 'ok';
    return { cls, tone, text: cephDiagnosisText(this.result()) ?? skeletalPatternText(cls), reason };
  });

  readonly hasAnyResult = computed(() => {
    const r = this.result();
    return [r.sna, r.snb, r.anb, r.wits, r.fma, r.impa, r.upperIncisor].some((v) => v !== null);
  });

  ngOnInit() {
    this.active.set(this.firstMissing());
  }

  private firstMissing(): CephLandmarkKey | null {
    const pts = this.tracing().points;
    return CEPH_LANDMARKS.find((l) => !pts[l.key])?.key ?? null;
  }

  isPlaced(key: CephLandmarkKey) {
    return !!this.points()[key];
  }

  zoomBy(delta: number) {
    this.zoom.update((z) => Math.min(3, Math.max(1, Math.round((z + delta) * 100) / 100)));
  }

  onImageLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) this.size.set({ w: img.naturalWidth, h: img.naturalHeight });
  }

  chooseRadiograph(select: HTMLSelectElement) {
    const t = this.tracing();
    const attachmentId = select.value;
    if (attachmentId === t.attachmentId) return;
    if (Object.keys(t.points).length && !confirm('Cambiar la radiografía borra los puntos marcados. ¿Continuar?')) {
      select.value = t.attachmentId;
      return;
    }
    t.attachmentId = attachmentId;
    t.fileName = this.radiographs().find((r) => r.attachmentId === attachmentId)?.label || '';
    t.points = {};
    t.tracedAt = '';
    this.size.set(null);
    this.active.set('S');
    this.commit();
  }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Suba la radiografía como imagen (JPG o PNG).');
      return;
    }
    const t = this.tracing();
    if (Object.keys(t.points).length && !confirm('La nueva radiografía reemplaza el trazado actual. ¿Continuar?')) return;
    this.size.set(null);
    this.active.set('S');
    this.upload.emit(file);
  }

  private toImage(event: PointerEvent) {
    const svg = this.svgRef?.nativeElement;
    const ctm = svg?.getScreenCTM();
    const s = this.size();
    if (!svg || !ctm || !s) return null;
    const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return {
      x: Math.round(Math.min(s.w, Math.max(0, pt.x)) * 10) / 10,
      y: Math.round(Math.min(s.h, Math.max(0, pt.y)) * 10) / 10,
    };
  }

  onStagePointerDown(event: PointerEvent) {
    const key = this.active();
    if (this.disabled() || !key || event.button !== 0) return;
    const p = this.toImage(event);
    if (!p) return;
    this.tracing().points[key] = p;
    this.active.set(this.firstMissing());
    this.commit();
  }

  onPointPointerDown(event: PointerEvent, key: CephLandmarkKey) {
    if (this.disabled()) return;
    event.stopPropagation();
    this.active.set(key);
    this.dragging = key;
    this.svgRef?.nativeElement.setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent) {
    if (!this.dragging) return;
    const p = this.toImage(event);
    if (!p) return;
    this.tracing().points[this.dragging] = p;
    this.tick.update((v) => v + 1);
  }

  onPointerUp() {
    if (!this.dragging) return;
    this.dragging = null;
    this.commit();
  }

  removePoint(key: CephLandmarkKey) {
    delete this.tracing().points[key];
    this.commit();
  }

  resetPoints() {
    if (!confirm('¿Borrar todos los puntos del trazado?')) return;
    this.tracing().points = {};
    this.tracing().tracedAt = '';
    this.active.set('S');
    this.commit();
  }

  applyResult() {
    this.apply.emit(this.result());
  }

  private commit() {
    const t = this.tracing();
    t.tracedAt = Object.keys(t.points).length ? new Date().toISOString() : '';
    this.tick.update((v) => v + 1);
    this.changed.emit();
  }
}
