import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DentistryContent } from './dentistry.models';
import { GINGIVAL_SMILE_LIMIT, OCCLUSAL_CANT, REST_EXPOSURE_REF, SMILE_ARCS, SMILE_LINES, SMILE_SYMMETRY, smileHints, suggestSmileLine } from './ortho-exam.models';
import { OrthoMmGauge } from './ortho-mm-gauge';
import { smileArt } from './ortho-smile-art';

type SmileKey = 'smileLine' | 'smileArc' | 'symmetry' | 'occlusalCant';
type MmKey = 'restExposure' | 'smileExposure' | 'gingivalExposure';

/** Análisis de sonrisa con ilustración frontal que refleja cada selección. */
@Component({
  selector: 'app-ortho-smile-panel',
  imports: [FormsModule, OrthoMmGauge],
  template: `
    @let s = data().orthoExam.smile;
    @let art = drawing();
    <section class="sp">
      <header class="sp-head">
        <h5>Análisis de sonrisa</h5>
        <span class="sp-count">{{ filled() }}/4 rasgos</span>
      </header>
      <div class="sp-body">
        <figure class="sp-fig" [class.preview]="!!preview()">
          <svg viewBox="16 4 208 116" role="img" [attr.aria-label]="caption()">
            <defs>
              <clipPath id="sp-mouth"><path [attr.d]="art.mouth" /></clipPath>
              <linearGradient id="sp-enamel" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#efe8da" />
                <stop offset="0.35" stop-color="#fffdf8" />
                <stop offset="1" stop-color="#f6f1e7" />
              </linearGradient>
              <pattern id="sp-grid" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M8,0 L0,0 0,8" fill="none" stroke="#edf1f6" stroke-width="0.6" />
              </pattern>
            </defs>
            <rect x="16" y="4" width="208" height="116" fill="url(#sp-grid)" />
            <g clip-path="url(#sp-mouth)">
              <rect x="0" y="0" width="240" height="130" class="sp-inside" />
              <g class="sp-arch" [attr.transform]="'rotate(' + art.tilt + ' 120 70)'">
                <path [attr.d]="art.gum" class="sp-gum" [class.hl]="art.gumShown" />
                @for (t of art.teeth; track t.x) {
                  <path [attr.d]="t.d" class="sp-tooth" />
                }
              </g>
            </g>
            <path [attr.d]="art.upperLip" class="sp-lip" />
            <path [attr.d]="art.lowerLip" class="sp-lip low" />
            <line x1="120" [attr.y1]="art.midline.y1" x2="120" [attr.y2]="art.midline.y2" class="sp-mid" />
            <path [attr.d]="art.arcLine" [attr.transform]="'rotate(' + art.tilt + ' 120 70)'" class="sp-arc" />
            @if (art.tilt) {
              <line x1="40" y1="80" x2="200" y2="80" class="sp-ref" />
              <line [attr.x1]="art.occlusal.x1" [attr.y1]="art.occlusal.y1" [attr.x2]="art.occlusal.x2" [attr.y2]="art.occlusal.y2"
                [attr.transform]="'rotate(' + art.tilt + ' 120 70)'" class="sp-plane" />
            }
            <text x="21" y="115" class="sp-side">DER</text>
            <text x="219" y="115" text-anchor="end" class="sp-side">IZQ</text>
          </svg>
          <div class="sp-legend">
            <span><i class="mid"></i>Línea media</span>
            <span><i class="arc"></i>Arco incisal</span>
            @if (art.tilt) {
              <span><i class="plane"></i>Plano oclusal</span>
            }
          </div>
          <figcaption>{{ caption() }}</figcaption>
        </figure>
        <div class="sp-groups">
          @for (g of groups; track g.key) {
            <div class="sp-group">
              <span>{{ g.label }}</span>
              <div class="sp-chips" (mouseleave)="preview.set(null)">
                @for (o of g.options; track o) {
                  <button type="button" [class.on]="s[g.key] === o" [disabled]="disabled()"
                    (mouseenter)="preview.set({ key: g.key, value: o })" (focus)="preview.set({ key: g.key, value: o })" (blur)="preview.set(null)"
                    (click)="pick(g.key, o)">{{ o }}</button>
                }
              </div>
            </div>
          }
        </div>
      </div>
      <div class="sp-gauges">
        <app-ortho-mm-gauge label="Exposición incisiva en reposo" [value]="s.restExposure" [max]="8" [ref]="restRef" [disabled]="disabled()" (valueChange)="setMm('restExposure', $event)" />
        <app-ortho-mm-gauge label="Exposición incisiva al sonreír" [value]="s.smileExposure" [max]="14" [disabled]="disabled()" (valueChange)="setMm('smileExposure', $event)" />
        <app-ortho-mm-gauge label="Exposición gingival al sonreír" [value]="s.gingivalExposure" [max]="8" [ref]="gingivalRef" [disabled]="disabled()" (valueChange)="setMm('gingivalExposure', $event)" />
      </div>
      @if (!disabled() && suggested() && suggested() !== s.smileLine) {
        <button type="button" class="sp-apply" (click)="pick('smileLine', suggested())">Línea de sonrisa sugerida por la exposición gingival: {{ suggested() }} · aplicar</button>
      }
      @for (h of hints(); track h.text) {
        <p class="sp-hint" [attr.data-tone]="h.tone">{{ h.text }}</p>
      }
      <label class="sp-notes">Observaciones de la sonrisa <input [(ngModel)]="s.notes" (ngModelChange)="changed.emit()" [readonly]="disabled()" /></label>
    </section>
  `,
  styles: `
    .sp { display: grid; gap: 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; container-type: inline-size; }
    .sp-head { display: flex; align-items: center; justify-content: space-between; }
    .sp h5 { margin: 0; font-size: 13px; color: #123b60; }
    .sp-count { padding: 2px 8px; border-radius: 99px; background: #eef6fc; color: #12609a; font-size: 11px; font-weight: 600; }
    .sp-body { display: grid; grid-template-columns: minmax(200px, 1fr) minmax(220px, 1.1fr); gap: 12px; align-items: start; }
    @container (max-width: 600px) {
      .sp-body { grid-template-columns: 1fr; }
      .sp-groups { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
    }
    .sp-fig { margin: 0; display: grid; gap: 4px; }
    .sp-fig svg { width: 100%; max-width: 360px; justify-self: center; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; transition: border-color 0.15s, box-shadow 0.15s; }
    .sp-fig.preview svg { border-color: #7dd3fc; box-shadow: 0 0 0 3px rgba(125, 211, 252, 0.25); }
    .sp-fig figcaption { font-size: 11px; color: #475569; text-align: center; min-height: 15px; }
    .sp-inside { fill: #2b161a; }
    .sp-gum { fill: #e7b0b7; stroke: #c48a93; stroke-width: 0.6; transition: fill 0.2s; }
    .sp-gum.hl { fill: #e2919d; }
    .sp-tooth { fill: url(#sp-enamel); stroke: #a8a29e; stroke-width: 0.6; stroke-linejoin: round; }
    .sp-lip { fill: #ecccc8; stroke: #8f5158; stroke-width: 0.8; stroke-linejoin: round; }
    .sp-lip.low { fill: #e6bdb9; }
    .sp-mid { stroke: #0f4c81; stroke-width: 0.7; stroke-dasharray: 6 2 1 2; }
    .sp-arc { fill: none; stroke: #2563eb; stroke-width: 1; stroke-dasharray: 1.5 2; stroke-linecap: round; }
    .sp-ref { stroke: #94a3b8; stroke-width: 0.7; stroke-dasharray: 3 3; }
    .sp-plane { stroke: #d97706; stroke-width: 1; stroke-dasharray: 5 3; }
    .sp-side { font-size: 6.5px; letter-spacing: 0.08em; fill: #64748b; font-weight: 600; }
    .sp-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 12px; font-size: 10px; color: #64748b; }
    .sp-legend span { display: inline-flex; align-items: center; gap: 4px; }
    .sp-legend i { display: inline-block; width: 16px; border-top: 1.5px dashed #0f4c81; }
    .sp-legend i.arc { border-top: 1.5px dotted #2563eb; }
    .sp-legend i.plane { border-top-color: #d97706; }
    .sp-groups { display: grid; gap: 8px; align-items: start; }
    .sp-group { display: grid; gap: 4px; align-content: start; font-size: 11px; font-weight: 600; color: #475569; }
    .sp-chips { display: flex; flex-wrap: wrap; align-items: center; align-content: flex-start; gap: 6px; }
    .sp-chips button { padding: 5px 12px; border: 1px solid #cbd5e1; border-radius: 99px; background: #fff; color: #334155; font-size: 12px; cursor: pointer; transition: background 0.15s, border-color 0.15s, color 0.15s; }
    .sp-chips button:hover:not(:disabled) { border-color: #12609a; background: #f4f8fb; }
    .sp-chips button.on { border-color: #12609a; background: #12609a; color: #fff; }
    .sp-chips button:disabled { cursor: default; }
    .sp-gauges { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .sp-apply { justify-self: start; border: 1px dashed #12609a; border-radius: 99px; background: #f4f8fb; color: #12609a; font-size: 12px; padding: 4px 10px; cursor: pointer; }
    .sp-hint { margin: 0; padding: 5px 8px; border-radius: 8px; font-size: 12px; }
    .sp-hint[data-tone='ok'] { background: #f0fdf4; color: #166534; }
    .sp-hint[data-tone='warn'] { background: #fffbeb; color: #92400e; }
    .sp-notes { display: grid; gap: 2px; font-size: 11px; color: #475569; }
  `,
})
export class OrthoSmilePanel {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  readonly preview = signal<{ key: SmileKey; value: string } | null>(null);
  readonly restRef = REST_EXPOSURE_REF;
  readonly gingivalRef: [number, number] = [0, GINGIVAL_SMILE_LIMIT];
  readonly groups: Array<{ key: SmileKey; label: string; options: string[] }> = [
    { key: 'smileLine', label: 'Línea de sonrisa', options: SMILE_LINES },
    { key: 'smileArc', label: 'Arco de sonrisa', options: SMILE_ARCS },
    { key: 'symmetry', label: 'Simetría de la sonrisa', options: SMILE_SYMMETRY },
    { key: 'occlusalCant', label: 'Plano oclusal (cant)', options: OCCLUSAL_CANT },
  ];

  private shown() {
    const s = this.data().orthoExam.smile;
    const p = this.preview();
    return p && !this.disabled() ? { ...s, [p.key]: p.value } : s;
  }

  drawing() {
    return smileArt(this.shown());
  }

  caption() {
    const s = this.shown();
    const parts = [
      s.smileLine && `línea ${s.smileLine.toLowerCase()}`,
      s.smileArc && `arco ${s.smileArc.toLowerCase()}`,
      s.symmetry && s.symmetry.toLowerCase(),
      s.occlusalCant && s.occlusalCant !== 'Sin inclinación' && `plano ${s.occlusalCant.toLowerCase()}`,
    ].filter(Boolean);
    const text = parts.length ? parts.join(' · ') : 'Seleccione los rasgos para ver la sonrisa';
    return this.preview() ? `Vista previa: ${text}` : text.charAt(0).toUpperCase() + text.slice(1);
  }

  filled() {
    const s = this.data().orthoExam.smile;
    return this.groups.filter((g) => !!s[g.key]).length;
  }

  hints() {
    return smileHints(this.data().orthoExam.smile);
  }

  suggested() {
    return suggestSmileLine(this.data().orthoExam.smile);
  }

  pick(key: SmileKey, value: string) {
    if (this.disabled()) return;
    const s = this.data().orthoExam.smile;
    s[key] = s[key] === value ? '' : value;
    this.changed.emit();
  }

  setMm(key: MmKey, value: string) {
    if (this.disabled()) return;
    this.data().orthoExam.smile[key] = value;
    this.changed.emit();
  }
}
