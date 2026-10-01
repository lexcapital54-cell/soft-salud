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
          <svg viewBox="16 6 208 112" role="img" [attr.aria-label]="caption()">
            <defs>
              <clipPath id="sp-mouth"><path [attr.d]="art.mouth" /></clipPath>
            </defs>
            <rect x="0" y="0" width="240" height="130" rx="14" class="sp-skin" />
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
            @if (art.tilt) {
              <line x1="44" y1="80" x2="196" y2="80" class="sp-ref" />
              <line [attr.x1]="art.occlusal.x1" [attr.y1]="art.occlusal.y1" [attr.x2]="art.occlusal.x2" [attr.y2]="art.occlusal.y2"
                [attr.transform]="'rotate(' + art.tilt + ' 120 70)'" class="sp-plane" />
            }
            <text x="22" y="112" class="sp-side">Der.</text>
            <text x="218" y="112" text-anchor="end" class="sp-side">Izq.</text>
          </svg>
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
    .sp-fig svg { width: 100%; max-width: 360px; justify-self: center; border-radius: 14px; box-shadow: inset 0 0 0 1px #f1d5c4; transition: box-shadow 0.15s; }
    .sp-fig.preview svg { box-shadow: 0 0 0 2px #7dd3fc; }
    .sp-fig figcaption { font-size: 11px; color: #64748b; text-align: center; min-height: 15px; }
    .sp-skin { fill: #f8e3d4; }
    .sp-inside { fill: #4a1a24; }
    .sp-gum { fill: #e9a0aa; transition: fill 0.2s; }
    .sp-gum.hl { fill: #f07d8f; }
    .sp-tooth { fill: #fffdf6; stroke: #d9d2c4; stroke-width: 1; }
    .sp-arch { transition: transform 0.25s; }
    .sp-lip { fill: #c45a6c; stroke: #a94657; stroke-width: 0.8; transition: d 0.25s; }
    .sp-lip.low { fill: #d27382; }
    .sp-ref { stroke: #94a3b8; stroke-width: 1; stroke-dasharray: 3 3; }
    .sp-plane { stroke: #d97706; stroke-width: 1.5; stroke-dasharray: 5 3; }
    .sp-side { font-size: 9px; fill: #9a6b55; }
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
