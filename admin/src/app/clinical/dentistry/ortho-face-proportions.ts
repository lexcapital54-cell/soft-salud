import { Component, input, output, signal } from '@angular/core';
import { DentistryContent } from './dentistry.models';
import { FACIAL_INDEX_LIMITS, THIRD_PCT_REF, facialIndex, thirdsAnalysis } from './ortho-exam.models';
import { OrthoMmGauge } from './ortho-mm-gauge';
import { EAR, FACE_OUTLINE, MIRROR, faceFeatures } from './ortho-face-outline';
import { faceThirds, faceWidthScale } from './ortho-smile-art';

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
    @let sx = widthScale(fi?.idx ?? null);
    <section class="fp">
      <h5>Proporciones faciales</h5>
      <div class="fp-body">
        <svg class="fp-face" viewBox="0 0 224 222" role="img" aria-label="Tercios faciales">
          @let me = zones[2].y + zones[2].h;
          @let ft = features(zones[1].y, zones[2].y, me);
          @for (z of zones; track z.key) {
            <rect x="26" [attr.y]="z.y" width="150" [attr.height]="z.h" class="fp-band" [class.off]="z.off" [class.hot]="hover() === z.key"
              (mouseenter)="hover.set(z.key)" (mouseleave)="hover.set(null)" (click)="focus(z.key)" />
          }
          <g [attr.transform]="'translate(100 0) scale(' + sx + ' 1) translate(-100 0)'" class="fp-art">
            <path [attr.d]="outline" class="fp-outline" />
            <path [attr.d]="ear" class="fp-ear" />
            <path [attr.d]="ear" [attr.transform]="mirror" class="fp-ear" />
            <path [attr.d]="'M60,' + (zones[0].y + 9) + ' Q100,' + (zones[0].y - 7) + ' 140,' + (zones[0].y + 9)" class="fp-hairline" />
            <path [attr.d]="ft.brows" class="fp-feat" />
            <path [attr.d]="ft.eyes" class="fp-feat" />
            <circle cx="77" [attr.cy]="ft.irisY" r="2.4" class="fp-iris" />
            <circle cx="123" [attr.cy]="ft.irisY" r="2.4" class="fp-iris" />
            <path [attr.d]="ft.nose" class="fp-feat" />
            <path [attr.d]="ft.lips" class="fp-feat lips" />
          </g>
          <line x1="100" [attr.y1]="zones[0].y - 8" x2="100" [attr.y2]="me + 6" class="fp-axis" />
          @for (m of landmarks(zones); track m.t) {
            <line x1="26" [attr.y1]="m.y" x2="176" [attr.y2]="m.y" class="fp-line" [class.dash]="zones[0].pct === null" />
            <circle cx="100" [attr.cy]="m.y" r="1.8" class="fp-pt" />
            <text x="22" [attr.y]="m.y + 2.5" text-anchor="end" class="fp-mark">{{ m.t }}</text>
          }
          <line x1="188" [attr.y1]="zones[0].y" x2="188" [attr.y2]="me" class="fp-dim" />
          @for (m of landmarks(zones); track m.t) {
            <line x1="184" [attr.y1]="m.y" x2="192" [attr.y2]="m.y" class="fp-dim" />
          }
          @for (z of zones; track z.key) {
            <text x="196" [attr.y]="z.y + z.h / 2 + 3" class="fp-pct" [class.off]="z.off">{{ z.pct !== null ? z.pct + '%' : '—' }}</text>
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
    .fp-face { width: 100%; max-width: 270px; justify-self: center; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
    .fp-band { fill: transparent; cursor: pointer; transition: fill 0.15s; }
    .fp-band.off { fill: rgba(245, 158, 11, 0.08); }
    .fp-band.hot { fill: rgba(18, 96, 154, 0.08); }
    .fp-art { pointer-events: none; transition: transform 0.25s; }
    .fp-outline { fill: #fbf4ef; stroke: #475569; stroke-width: 1; stroke-linejoin: round; }
    .fp-ear { fill: #fbf4ef; stroke: #475569; stroke-width: 0.9; }
    .fp-hairline { fill: none; stroke: #94a3b8; stroke-width: 0.8; stroke-dasharray: 2 2; }
    .fp-feat { fill: none; stroke: #64748b; stroke-width: 0.9; stroke-linecap: round; stroke-linejoin: round; }
    .fp-feat.lips { stroke: #8f5158; }
    .fp-iris { fill: none; stroke: #64748b; stroke-width: 0.8; }
    .fp-axis { stroke: #0f4c81; stroke-width: 0.6; stroke-dasharray: 6 2 1 2; }
    .fp-line { stroke: #0f4c81; stroke-width: 0.7; }
    .fp-line.dash { stroke: #94a3b8; stroke-dasharray: 3 2; }
    .fp-pt { fill: #0f4c81; }
    .fp-dim { stroke: #334155; stroke-width: 0.8; }
    .fp-pct { font-size: 9px; font-weight: 700; fill: #0f4c81; }
    .fp-pct.off { fill: #b45309; }
    .fp-mark { font-size: 7.5px; font-weight: 600; letter-spacing: 0.04em; fill: #475569; }
    .fp-inputs { display: grid; gap: 6px; }
    .fp-inputs > div { border-radius: 12px; transition: box-shadow 0.15s; }
    .fp-inputs > div.hot { box-shadow: 0 0 0 2px #7dd3fc; }
    .fp-ref { margin: 0; font-size: 11px; color: #64748b; }
    .fp-index { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .fp-scale { position: relative; display: flex; height: 22px; margin-top: 14px; overflow: visible; font-size: 10px; font-weight: 600; letter-spacing: 0.02em; }
    .fp-scale .seg { display: grid; place-items: center; flex: none; white-space: nowrap; overflow: hidden; border: 1px solid #cbd5e1; }
    .fp-scale .seg:nth-child(1) { background: #f0f9ff; color: #075985; border-radius: 6px 0 0 6px; }
    .fp-scale .seg:nth-child(2) { background: #f0fdfa; color: #115e59; border-left: 0; border-right: 0; }
    .fp-scale .seg:nth-child(3) { flex: 1; background: #f5f3ff; color: #5b21b6; border-radius: 0 6px 6px 0; }
    .fp-scale.empty .seg { opacity: 0.45; }
    .fp-scale i { position: absolute; top: -5px; bottom: -5px; width: 2px; background: #0f4c81; box-shadow: 0 0 0 2px #fff; transform: translateX(-50%); transition: left 0.2s; }
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
  readonly outline = FACE_OUTLINE;
  readonly ear = EAR;
  readonly mirror = MIRROR;
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
    return faceThirds(th, 40, 168);
  }

  features(g: number, sn: number, me: number) {
    return faceFeatures(g, sn, me);
  }

  index() {
    return facialIndex(this.data().orthoExam.proportions);
  }

  widthScale(idx: number | null) {
    return faceWidthScale(idx);
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
