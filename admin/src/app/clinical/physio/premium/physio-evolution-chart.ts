import { Component, computed, input } from '@angular/core';
import { ChartPoint, formatDate } from './physio-premium.models';

const W = 380;
const H = 190;
const PAD = { top: 14, right: 16, bottom: 34, left: 34 };

/** Línea temporal de EVA (0–10) en SVG, sin librerías: solo puntos realmente registrados. */
@Component({
  selector: 'app-physio-evolution-chart',
  template: `
    @let c = chart();
    <figure class="ec">
      <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" role="img" [attr.aria-label]="c.summary">
        @for (tick of c.ticks; track tick.v) {
          <line class="grid" [attr.x1]="pad.left" [attr.x2]="w - pad.right" [attr.y1]="tick.y" [attr.y2]="tick.y" />
          <text class="axis" [attr.x]="pad.left - 8" [attr.y]="tick.y + 4" text-anchor="end">{{ tick.v }}</text>
        }
        <polyline class="line" [attr.points]="c.line" />
        @for (p of c.points; track $index) {
          <circle class="dot" [attr.cx]="p.x" [attr.cy]="p.y" r="4.5"><title>{{ p.label }}: EVA {{ p.v }}/10</title></circle>
          @if (p.showLabel) {
            <text class="axis" [attr.x]="p.x" [attr.y]="h - 12" [attr.text-anchor]="p.anchor">{{ p.short }}</text>
          }
        }
      </svg>
      <figcaption>
        <span class="legend"><i></i>Dolor (EVA 0–10)</span>
        @if (c.delta !== null) {
          <span class="delta" [class.better]="c.delta < 0" [class.worse]="c.delta > 0">
            {{ c.delta < 0 ? 'Bajó ' + -c.delta : c.delta > 0 ? 'Subió ' + c.delta : 'Sin cambio' }}{{ c.delta ? (c.delta === 1 || c.delta === -1 ? ' punto' : ' puntos') : '' }} desde la valoración
          </span>
        }
      </figcaption>
    </figure>
  `,
  styles: `
    :host { display: block; }
    .ec { margin: 0; }
    svg { width: 100%; height: auto; max-height: 220px; display: block; }
    .grid { stroke: #e8edf3; stroke-width: 1; }
    .axis { font-size: 11px; fill: #687386; font-family: inherit; }
    .line { fill: none; stroke: #d45b5b; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
    .dot { fill: #fff; stroke: #d45b5b; stroke-width: 2.5; }
    figcaption { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; font-size: 0.8rem; color: #687386; margin-top: 4px; }
    .legend { display: inline-flex; align-items: center; gap: 6px; }
    .legend i { width: 14px; height: 3px; border-radius: 2px; background: #d45b5b; display: inline-block; }
    .delta { font-weight: 600; color: #4c5869; }
    .delta.better { color: #13704d; }
    .delta.worse { color: #9b3333; }
  `,
})
export class PhysioEvolutionChart {
  readonly points = input.required<ChartPoint[]>();
  readonly w = W;
  readonly h = H;
  readonly pad = PAD;

  readonly chart = computed(() => {
    const pts = this.points();
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const y = (v: number) => PAD.top + innerH - (v / 10) * innerH;
    const step = pts.length > 1 ? innerW / (pts.length - 1) : 0;
    const every = Math.max(1, Math.ceil(pts.length / 6));
    const mapped = pts.map((p, i) => ({
      x: PAD.left + (pts.length > 1 ? i * step : innerW / 2),
      y: y(p.value),
      v: p.value,
      label: formatDate(p.date),
      short: formatDate(p.date, { day: '2-digit', month: 'short' }),
      showLabel: i % every === 0 || i === pts.length - 1,
      anchor: pts.length > 1 && i === pts.length - 1 ? 'end' : pts.length > 1 && i === 0 ? 'start' : 'middle',
    }));
    const first = pts[0]?.value ?? null;
    const last = pts[pts.length - 1]?.value ?? null;
    return {
      ticks: [0, 2.5, 5, 7.5, 10].map((v) => ({ v, y: y(v) })),
      points: mapped,
      line: mapped.map((p) => `${p.x},${p.y}`).join(' '),
      delta: first !== null && last !== null && pts.length > 1 ? last - first : null,
      summary: `Evolución del dolor EVA: ${mapped.map((p) => `${p.label} ${p.v} de 10`).join(', ')}`,
    };
  });
}
