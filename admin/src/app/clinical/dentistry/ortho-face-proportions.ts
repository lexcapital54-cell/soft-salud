import { Component, input, output, signal } from '@angular/core';
import { DentistryContent } from './dentistry.models';
import { FACIAL_INDEX_LIMITS, THIRD_PCT_REF, facialIndex, thirdsAnalysis } from './ortho-exam.models';
import { OrthoMmGauge } from './ortho-mm-gauge';
import { faceHalfWidth, faceThirds } from './ortho-smile-art';

type ThirdKey = 'upperThird' | 'middleThird' | 'lowerThird';
type MmKey = ThirdKey | 'facialHeight' | 'facialWidth';

const INDEX_SCALE: [number, number] = [75, 100];

/** Tercios faciales e índice facial con silueta que se ajusta a las medidas. */
@Component({
  selector: 'app-ortho-face-proportions',
  imports: [OrthoMmGauge],
  template: `
    @let p = data().orthoExam.proportions;
    @let th = thirds();
    @let zones = zonesFor(th);
    @let fi = index();
    @let hw = halfWidth(fi?.idx ?? null);
    <section class="fp">
      <h5>Proporciones faciales</h5>
      <div class="fp-body">
        <svg class="fp-face" viewBox="0 0 220 228" role="img" aria-label="Tercios faciales">
          <defs>
            <clipPath id="fp-oval"><ellipse cx="100" cy="106" [attr.rx]="hw" ry="100" /></clipPath>
          </defs>
          <ellipse cx="100" cy="106" [attr.rx]="hw" ry="100" class="fp-skin" />
          <g clip-path="url(#fp-oval)">
            <path [attr.d]="'M0,0 H220 V' + (zones[0].y + 6) + ' Q100,' + (zones[0].y - 6) + ' 0,' + (zones[0].y + 6) + ' Z'" class="fp-hair" />
            @for (z of zones; track z.key) {
              <rect x="0" [attr.y]="z.y" width="220" [attr.height]="z.h" class="fp-zone" [attr.data-key]="z.key"
                [class.off]="z.off" [class.hot]="hover() === z.key" (mouseenter)="hover.set(z.key)" (mouseleave)="hover.set(null)" (click)="focus(z.key)" />
            }
          </g>
          <ellipse cx="100" cy="106" [attr.rx]="hw" ry="100" class="fp-outline" />
          @let mid = zones[1];
          @let low = zones[2];
          <path [attr.d]="'M' + (100 - hw * 0.62) + ',' + (mid.y + 4) + ' q' + hw * 0.22 + ',-6 ' + hw * 0.4 + ',0 M' + (100 + hw * 0.22) + ',' + (mid.y + 4) + ' q' + hw * 0.18 + ',-6 ' + hw * 0.4 + ',0'" class="fp-feat" />
          <ellipse [attr.cx]="100 - hw * 0.42" [attr.cy]="mid.y + mid.h * 0.22" rx="8" ry="3.5" class="fp-eye" />
          <ellipse [attr.cx]="100 + hw * 0.42" [attr.cy]="mid.y + mid.h * 0.22" rx="8" ry="3.5" class="fp-eye" />
          <path [attr.d]="'M100,' + (mid.y + 10) + ' L94,' + (low.y - 3) + ' Q100,' + (low.y + 1) + ' 106,' + (low.y - 3)" class="fp-feat" />
          <path [attr.d]="'M' + (100 - hw * 0.34) + ',' + (low.y + low.h * 0.32) + ' Q100,' + (low.y + low.h * 0.32 + 7) + ' ' + (100 + hw * 0.34) + ',' + (low.y + low.h * 0.32)" class="fp-feat lips" />
          @for (z of zones; track z.key) {
            <line x1="14" [attr.y1]="z.y" x2="186" [attr.y2]="z.y" class="fp-line" [class.dash]="z.pct === null" />
            <text x="190" [attr.y]="z.y + z.h / 2 + 4" class="fp-pct" [class.off]="z.off">{{ z.pct !== null ? z.pct + ' %' : '—' }}</text>
          }
          <line x1="14" [attr.y1]="zones[2].y + zones[2].h" x2="186" [attr.y2]="zones[2].y + zones[2].h" class="fp-line" [class.dash]="zones[2].pct === null" />
          @for (m of landmarks(zones); track m.t) {
            <text x="4" [attr.y]="m.y + 3" class="fp-mark">{{ m.t }}</text>
          }
        </svg>
        <div class="fp-inputs">
          @for (t of thirdRows; track t.key; let i = $index) {
            <div [class.hot]="hover() === zones[i].key" (mouseenter)="hover.set(zones[i].key)" (mouseleave)="hover.set(null)" [id]="'fp-' + zones[i].key">
              <app-ortho-mm-gauge [label]="t.label + (zones[i].pct !== null ? ' · ' + zones[i].pct + ' %' : '')" [value]="p[t.key]"
                [min]="40" [max]="90" [stepSize]="1" [disabled]="disabled()" (valueChange)="setMm(t.key, $event)" />
            </div>
          }
          <p class="fp-ref">Referencia de cada tercio: {{ thirdRef[0] }}–{{ thirdRef[1] }} % de la altura facial.</p>
        </div>
      </div>
      @if (th.lowerReading) {
        <p class="fp-hint" [attr.data-tone]="th.lowerReading === 'Normal' ? 'ok' : 'warn'">
          Tercio inferior frente al medio: {{ th.lowerReading.toLowerCase() }}.
          @if (!disabled() && data().orthodontics.facial.lowerThird !== th.lowerReading) {
            <button type="button" class="fp-link" (click)="apply('lowerThird', th.lowerReading)">Registrar en «Tercio inferior»</button>
          }
        </p>
      }
      <div class="fp-index">
        <app-ortho-mm-gauge label="Altura facial N–Me" [value]="p.facialHeight" [min]="80" [max]="160" [stepSize]="1" [disabled]="disabled()" (valueChange)="setMm('facialHeight', $event)" />
        <app-ortho-mm-gauge label="Ancho bicigomático" [value]="p.facialWidth" [min]="90" [max]="170" [stepSize]="1" [disabled]="disabled()" (valueChange)="setMm('facialWidth', $event)" />
      </div>
      <div class="fp-scale" [class.empty]="!fi">
        <span class="seg" [style.width.%]="segPos(indexLimits[0])">Euriprosopo</span>
        <span class="seg" [style.width.%]="segPos(indexLimits[1]) - segPos(indexLimits[0])">Mesoprosopo</span>
        <span class="seg">Leptoprosopo</span>
        @if (fi) {
          <i [style.left.%]="segPos(fi.idx)" [attr.data-idx]="fi.idx"></i>
        }
      </div>
      @if (fi) {
        <p class="fp-hint" data-tone="ok">
          Índice facial {{ fi.idx }}: {{ fi.name }} → suele corresponder a {{ fi.facialType.toLowerCase() }}.
          @if (!disabled() && data().orthodontics.facial.facialType !== fi.facialType) {
            <button type="button" class="fp-link" (click)="apply('facialType', fi.facialType)">Registrar como tipo facial</button>
          }
        </p>
      } @else {
        <p class="fp-ref">Registre altura y ancho para calcular el índice facial.</p>
      }
    </section>
  `,
  styles: `
    .fp { display: grid; gap: 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; container-type: inline-size; }
    .fp h5 { margin: 0; font-size: 13px; color: #123b60; }
    .fp-body { display: grid; grid-template-columns: minmax(170px, 0.9fr) minmax(200px, 1.1fr); gap: 12px; align-items: center; }
    @container (max-width: 440px) { .fp-body { grid-template-columns: 1fr; } }
    .fp-face { width: 100%; max-width: 260px; justify-self: center; }
    .fp-skin { fill: #fbe9dd; }
    .fp-hair { fill: #6b4a3a; pointer-events: none; }
    .fp-outline { fill: none; stroke: #c99a82; stroke-width: 1.5; }
    .fp-zone { fill: #12609a; opacity: 0.07; cursor: pointer; transition: opacity 0.15s, fill 0.15s; }
    .fp-zone[data-key='middle'] { opacity: 0.13; }
    .fp-zone.off { fill: #f59e0b; opacity: 0.28; }
    .fp-zone.hot { opacity: 0.35; }
    .fp-feat { fill: none; stroke: #8a5a48; stroke-width: 1.6; stroke-linecap: round; pointer-events: none; }
    .fp-feat.lips { stroke: #c45a6c; stroke-width: 2.2; }
    .fp-eye { fill: #5b4034; pointer-events: none; }
    .fp-line { stroke: #12609a; stroke-width: 1; }
    .fp-line.dash { stroke-dasharray: 4 3; stroke: #94a3b8; }
    .fp-pct { font-size: 11px; font-weight: 700; fill: #12609a; }
    .fp-pct.off { fill: #b45309; }
    .fp-mark { font-size: 8px; fill: #64748b; }
    .fp-inputs { display: grid; gap: 6px; }
    .fp-inputs > div { border-radius: 12px; transition: box-shadow 0.15s; }
    .fp-inputs > div.hot { box-shadow: 0 0 0 2px #7dd3fc; }
    .fp-ref { margin: 0; font-size: 11px; color: #64748b; }
    .fp-index { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .fp-scale { position: relative; display: flex; height: 22px; border-radius: 99px; overflow: visible; font-size: 10px; font-weight: 600; }
    .fp-scale .seg { display: grid; place-items: center; flex: none; color: #fff; white-space: nowrap; overflow: hidden; }
    .fp-scale .seg:nth-child(1) { background: #0ea5e9; border-radius: 99px 0 0 99px; }
    .fp-scale .seg:nth-child(2) { background: #14b8a6; }
    .fp-scale .seg:nth-child(3) { flex: 1; background: #8b5cf6; border-radius: 0 99px 99px 0; }
    .fp-scale.empty .seg { opacity: 0.45; }
    .fp-scale i { position: absolute; top: -4px; bottom: -4px; width: 4px; border-radius: 2px; background: #0f172a; box-shadow: 0 0 0 2px #fff; transform: translateX(-50%); transition: left 0.2s; }
    .fp-scale i::after { content: attr(data-idx); position: absolute; top: -16px; left: 50%; transform: translateX(-50%); font-size: 10px; color: #0f172a; font-style: normal; }
    .fp-hint { margin: 0; padding: 5px 8px; border-radius: 8px; font-size: 12px; }
    .fp-hint[data-tone='ok'] { background: #f0fdf4; color: #166534; }
    .fp-hint[data-tone='warn'] { background: #fffbeb; color: #92400e; }
    .fp-link { border: 0; background: none; padding: 0; margin-left: 4px; color: #12609a; text-decoration: underline; font-size: 12px; cursor: pointer; }
  `,
})
export class OrthoFaceProportions {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly hover = signal<'upper' | 'middle' | 'lower' | null>(null);
  readonly thirdRef = THIRD_PCT_REF;
  readonly indexLimits = FACIAL_INDEX_LIMITS;
  readonly thirdRows: Array<{ key: ThirdKey; label: string }> = [
    { key: 'upperThird', label: 'Tercio superior' },
    { key: 'middleThird', label: 'Tercio medio' },
    { key: 'lowerThird', label: 'Tercio inferior' },
  ];

  thirds() {
    return thirdsAnalysis(this.data().orthoExam.proportions);
  }

  zonesFor(th: ReturnType<typeof thirdsAnalysis>) {
    return faceThirds(th);
  }

  index() {
    return facialIndex(this.data().orthoExam.proportions);
  }

  halfWidth(idx: number | null) {
    return faceHalfWidth(idx);
  }

  landmarks(zones: ReturnType<typeof faceThirds>) {
    const end = zones[2].y + zones[2].h;
    return [
      { t: 'Tr', y: zones[0].y },
      { t: 'G', y: zones[1].y },
      { t: 'Sn', y: zones[2].y },
      { t: 'Me', y: end },
    ];
  }

  segPos(v: number) {
    const [a, b] = INDEX_SCALE;
    return Math.min(100, Math.max(0, ((v - a) / (b - a)) * 100));
  }

  focus(key: 'upper' | 'middle' | 'lower') {
    document.querySelector<HTMLInputElement>(`#fp-${key} input`)?.focus();
  }

  setMm(key: MmKey, value: string) {
    if (this.disabled()) return;
    this.data().orthoExam.proportions[key] = value;
    this.changed.emit();
  }

  apply(field: 'lowerThird' | 'facialType', value: string) {
    if (this.disabled()) return;
    this.data().orthodontics.facial[field] = value;
    this.changed.emit();
  }
}
