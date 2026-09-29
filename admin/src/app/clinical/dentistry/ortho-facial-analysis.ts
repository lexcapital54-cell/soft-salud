import { Component, ElementRef, ViewChild, input, output, signal } from '@angular/core';
import { angleAt, distance } from './ceph-geometry';
import { CephPoint, FacialTrace, FacialTracing } from './dentistry.models';

type Mode = 'frontal' | 'profile';

export interface FacialPhotoOption {
  id: string;
  label: string;
  url: string | null;
}

export interface FacialAnalysisResult {
  lowerThird?: string;
  midline?: string;
  symmetry?: string;
  profile?: string;
  nasolabialAngle?: string;
  summary: string;
}

interface Landmark {
  key: string;
  short: string;
  label: string;
  hint: string;
}

const FRONTAL: Landmark[] = [
  { key: 'Tr', short: 'Tr', label: 'Trichion', hint: 'Nacimiento del cabello en la línea media de la frente.' },
  { key: 'G', short: 'G', label: 'Glabela', hint: 'Punto más prominente de la frente, entre las cejas.' },
  { key: 'Sn', short: 'Sn', label: 'Subnasal', hint: 'Unión de la columela con el labio superior.' },
  { key: 'St', short: 'St', label: 'Stomion', hint: 'Punto de contacto entre los labios.' },
  { key: 'Me', short: 'Me′', label: 'Mentón blando', hint: 'Punto más inferior del mentón.' },
  { key: 'ZR', short: 'ZD', label: 'Borde facial derecho', hint: 'Contorno lateral derecho del paciente (a la izquierda en la foto), a la altura de los ojos.' },
  { key: 'ExR', short: 'ExD', label: 'Exocantion derecho', hint: 'Ángulo externo del ojo derecho del paciente.' },
  { key: 'EnR', short: 'EnD', label: 'Endocantion derecho', hint: 'Ángulo interno del ojo derecho del paciente.' },
  { key: 'EnL', short: 'EnI', label: 'Endocantion izquierdo', hint: 'Ángulo interno del ojo izquierdo del paciente.' },
  { key: 'ExL', short: 'ExI', label: 'Exocantion izquierdo', hint: 'Ángulo externo del ojo izquierdo del paciente.' },
  { key: 'ZL', short: 'ZI', label: 'Borde facial izquierdo', hint: 'Contorno lateral izquierdo del paciente (a la derecha en la foto).' },
];

const PROFILE: Landmark[] = [
  { key: 'Gs', short: 'G′', label: 'Glabela blanda', hint: 'Punto más prominente de la frente en el perfil.' },
  { key: 'Prn', short: 'Prn', label: 'Pronasal', hint: 'Punta de la nariz.' },
  { key: 'Cm', short: 'Cm', label: 'Columela', hint: 'Punto más anterior de la columela, bajo la punta nasal.' },
  { key: 'Sn', short: 'Sn', label: 'Subnasal', hint: 'Unión de la columela con el labio superior.' },
  { key: 'Ls', short: 'Ls', label: 'Labio superior', hint: 'Punto más anterior del labio superior.' },
  { key: 'Li', short: 'Li', label: 'Labio inferior', hint: 'Punto más anterior del labio inferior.' },
  { key: 'Pgs', short: 'Pg′', label: 'Pogonion blando', hint: 'Punto más anterior del mentón en el perfil.' },
];

const LANDMARKS: Record<Mode, Landmark[]> = { frontal: FRONTAL, profile: PROFILE };

type Pts = Partial<Record<string, CephPoint>>;

const pct = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} %`;
const deg = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')}°`;

/** Lado de la recta a→b en que cae p (signo del producto cruz). */
function side(a: CephPoint, b: CephPoint, p: CephPoint) {
  return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
}

interface Metric {
  label: string;
  value: string;
  message: string;
  tone: 'ok' | 'out' | 'empty';
}

function frontalMetrics(p: Pts) {
  const metrics: Metric[] = [];
  const out: Partial<FacialAnalysisResult> = {};
  const summary: string[] = [];
  const { Tr, G, Sn, St, Me, ZR, ExR, EnR, EnL, ExL, ZL } = p;

  if (Tr && G && Sn && Me) {
    const parts = [Math.abs(G.y - Tr.y), Math.abs(Sn.y - G.y), Math.abs(Me.y - Sn.y)];
    const total = parts.reduce((a, b) => a + b, 0) || 1;
    const [u, m, l] = parts.map((v) => (v / total) * 100);
    const tone = (v: number): Metric['tone'] => (Math.abs(v - 33.3) <= 3 ? 'ok' : 'out');
    const word = (v: number) => (v > 36.3 ? 'Aumentado' : v < 30.3 ? 'Disminuido' : 'Normal');
    metrics.push(
      { label: 'Tercio superior', value: pct(u), message: `${word(u)} · ideal 33 %`, tone: tone(u) },
      { label: 'Tercio medio', value: pct(m), message: `${word(m)} · ideal 33 %`, tone: tone(m) },
      { label: 'Tercio inferior', value: pct(l), message: `${word(l)} · ideal 33 %`, tone: tone(l) },
    );
    out.lowerThird = word(l);
    summary.push(`tercios ${pct(u)} / ${pct(m)} / ${pct(l)}`);
    if (St) {
      const up = Math.abs(St.y - Sn.y);
      const low = Math.abs(Me.y - St.y);
      const ratio = (up / (up + low || 1)) * 100;
      metrics.push({
        label: 'Sn-St / tercio inferior',
        value: pct(ratio),
        message: ratio > 38 ? 'Labio superior largo · ideal 1:2 (33 %)' : ratio < 28 ? 'Labio superior corto · ideal 1:2 (33 %)' : 'Proporción 1:2 adecuada',
        tone: Math.abs(ratio - 33.3) <= 5 ? 'ok' : 'out',
      });
    }
  }

  if (ZR && ExR && EnR && EnL && ExL && ZL) {
    const xs = [ZR, ExR, EnR, EnL, ExL, ZL].map((q) => q.x);
    const widths = xs.slice(1).map((x, i) => Math.abs(x - xs[i]));
    const total = widths.reduce((a, b) => a + b, 0) || 1;
    const fifths = widths.map((w) => (w / total) * 100);
    const names = ['1.º (lateral der.)', '2.º (ojo der.)', '3.º (intercantal)', '4.º (ojo izq.)', '5.º (lateral izq.)'];
    fifths.forEach((f, i) =>
      metrics.push({
        label: `Quinto ${names[i]}`,
        value: pct(f),
        message: Math.abs(f - 20) <= 3 ? 'Proporcionado · ideal 20 %' : f > 20 ? 'Aumentado · ideal 20 %' : 'Disminuido · ideal 20 %',
        tone: Math.abs(f - 20) <= 3 ? 'ok' : 'out',
      }),
    );
    summary.push(`quintos ${fifths.map((f) => pct(f)).join(' / ')}`);

    const faceW = Math.abs(ZL.x - ZR.x) || 1;
    const mid = (EnR.x + EnL.x) / 2;
    const ref = Me ?? Sn;
    let midline = 'Centrada';
    if (ref) {
      const dev = ((ref.x - mid) / faceW) * 100;
      const towardRight = Math.sign(ref.x - mid) === Math.sign(ZR.x - mid);
      midline = Math.abs(dev) <= 3 ? 'Centrada' : towardRight ? 'Desviada a la derecha' : 'Desviada a la izquierda';
      metrics.push({
        label: `Línea media (${Me ? 'mentón' : 'subnasal'})`,
        value: pct(Math.abs(dev)),
        message: `${midline} · tolerancia 3 % del ancho facial`,
        tone: Math.abs(dev) <= 3 ? 'ok' : 'out',
      });
      out.midline = midline;
      summary.push(`línea media ${midline.toLowerCase()}`);
    }
    const lateralGap = Math.abs(fifths[0] - fifths[4]);
    out.symmetry = lateralGap > 3 || midline !== 'Centrada' ? 'Asimétrico' : 'Simétrico';
  }
  return { metrics, out, summary };
}

function profileMetrics(p: Pts) {
  const metrics: Metric[] = [];
  const out: Partial<FacialAnalysisResult> = {};
  const summary: string[] = [];
  const { Gs, Prn, Cm, Sn, Ls, Li, Pgs } = p;

  if (Cm && Sn && Ls) {
    const a = angleAt(Sn, Cm, Ls);
    if (a !== null) {
      metrics.push({
        label: 'Ángulo nasolabial',
        value: deg(a),
        message: a < 90 ? 'Agudo: protrusión labial o punta nasal caída · norma 90°–110°' : a > 110 ? 'Obtuso: retrusión labial / maxilar · norma 90°–110°' : 'Normal · norma 90°–110°',
        tone: a >= 90 && a <= 110 ? 'ok' : 'out',
      });
      out.nasolabialAngle = deg(a);
      summary.push(`nasolabial ${deg(a)}`);
    }
  }
  if (Gs && Sn && Pgs) {
    const c = angleAt(Sn, Gs, Pgs);
    if (c !== null) {
      const profile = c < 165 ? 'Convexo' : c > 175 ? 'Cóncavo' : 'Recto';
      metrics.push({
        label: 'Convexidad facial (G′-Sn-Pg′)',
        value: deg(c),
        message: `Perfil ${profile.toLowerCase()} · norma 165°–175°`,
        tone: profile === 'Recto' ? 'ok' : 'out',
      });
      out.profile = profile;
      summary.push(`convexidad ${deg(c)} (perfil ${profile.toLowerCase()})`);
    }
  }
  if (Prn && Pgs && Sn) {
    const len = distance(Prn, Pgs) || 1;
    const behind = side(Prn, Pgs, Sn);
    for (const [label, q] of [['Labio superior', Ls], ['Labio inferior', Li]] as const) {
      if (!q) continue;
      const d = Math.abs((Pgs.x - Prn.x) * (Prn.y - q.y) - (Prn.x - q.x) * (Pgs.y - Prn.y)) / len;
      const rel = (d / len) * 100;
      const inFront = side(Prn, Pgs, q) !== behind && side(Prn, Pgs, q) !== 0;
      metrics.push({
        label: `${label} / línea E`,
        value: inFront ? 'Por delante' : 'Por detrás',
        message: inFront
          ? `Protrusivo (${pct(rel)} de Prn-Pg′) · norma: por detrás de la línea E`
          : `Adecuado (${pct(rel)} de Prn-Pg′ por detrás)`,
        tone: inFront ? 'out' : 'ok',
      });
      summary.push(`${label.toLowerCase()} ${inFront ? 'por delante' : 'por detrás'} de la línea E`);
    }
  }
  return { metrics, out, summary };
}

@Component({
  selector: 'app-ortho-facial-analysis',
  standalone: true,
  template: `
    <div class="fa">
      <div class="fa-toolbar">
        <div class="fa-tabs" role="tablist">
          <button type="button" role="tab" [attr.aria-selected]="mode() === 'frontal'" [class.on]="mode() === 'frontal'" (click)="setMode('frontal')">
            Frontal · tercios y quintos
          </button>
          <button type="button" role="tab" [attr.aria-selected]="mode() === 'profile'" [class.on]="mode() === 'profile'" (click)="setMode('profile')">
            Perfil · nasolabial y línea E
          </button>
        </div>
        @let opts = options();
        <label class="fa-src">
          Fotografía
          <select #src (change)="choosePhoto(src)" [disabled]="disabled() || !opts.length">
            @if (!opts.length) {
              <option value="">Cargue la foto {{ mode() === 'frontal' ? 'extraoral frontal' : 'de perfil' }} en Imágenes</option>
            }
            @for (o of opts; track o.id) {
              <option [value]="o.id" [selected]="o.id === currentPhoto()?.id">{{ o.label }}</option>
            }
          </select>
        </label>
      </div>

      @if (!currentPhoto()) {
        <p class="fa-empty">
          Cargue la fotografía {{ mode() === 'frontal' ? 'extraoral frontal (o de sonrisa)' : 'de perfil derecho o izquierdo' }}
          en la sección Imágenes de esta historia; luego marque los puntos aquí para trazar las líneas y calcular las
          proporciones.
        </p>
      } @else {
        <div class="fa-body">
          <div class="fa-stage-wrap">
            @if (currentPhoto()!.url; as url) {
              <div class="fa-stage">
                <img [src]="url" alt="Fotografía para análisis facial" draggable="false" (load)="onImageLoad($event)" />
                @if (size(); as s) {
                  <svg
                    #svg
                    class="fa-overlay"
                    [class.placing]="!disabled() && !!active()"
                    [attr.viewBox]="'0 0 ' + s.w + ' ' + s.h"
                    preserveAspectRatio="none"
                    (pointerdown)="onStageDown($event)"
                    (pointermove)="onMove($event)"
                    (pointerup)="onUp()"
                    (pointercancel)="onUp()"
                  >
                    @for (l of guides(); track l.id) {
                      <line [attr.x1]="l.x1" [attr.y1]="l.y1" [attr.x2]="l.x2" [attr.y2]="l.y2" [attr.class]="'fa-line ' + l.kind" [attr.stroke-width]="sc().stroke" />
                    }
                    @for (t of labels(); track t.id) {
                      <text [attr.x]="t.x" [attr.y]="t.y" class="fa-lbl" [attr.font-size]="sc().font" [attr.stroke-width]="sc().stroke * 2" [attr.text-anchor]="t.anchor">{{ t.text }}</text>
                    }
                    @for (pt of placed(); track pt.key) {
                      <g class="fa-pt" [class.on]="pt.key === active()" (pointerdown)="onPointDown($event, pt.key)">
                        <circle [attr.cx]="pt.x" [attr.cy]="pt.y" [attr.r]="sc().hit" class="hit" />
                        <circle [attr.cx]="pt.x" [attr.cy]="pt.y" [attr.r]="sc().r" [attr.stroke-width]="sc().stroke" />
                        <text [attr.x]="pt.x + sc().r * 1.5" [attr.y]="pt.y - sc().r" [attr.font-size]="sc().font" [attr.stroke-width]="sc().stroke * 2">{{ pt.short }}</text>
                      </g>
                    }
                  </svg>
                }
              </div>
            } @else {
              <p class="fa-empty dark">Cargando fotografía…</p>
            }
          </div>

          <aside class="fa-side">
            <section class="fa-panel">
              <p class="fa-h">Puntos <span>{{ placed().length }}/{{ landmarks().length }}</span></p>
              <ol class="fa-points">
                @for (l of landmarks(); track l.key) {
                  <li>
                    <button type="button" [class.on]="l.key === active()" [class.done]="isPlaced(l.key)" [disabled]="disabled()" (click)="active.set(l.key)">
                      <b>{{ l.short }}</b> {{ l.label }}
                      @if (isPlaced(l.key)) {
                        <span class="ok">✓</span>
                      }
                    </button>
                  </li>
                }
              </ol>
              @if (!disabled()) {
                @if (activeLandmark(); as a) {
                  <p class="fa-hint"><strong>{{ a.label }}:</strong> {{ a.hint }} {{ isPlaced(a.key) ? 'Arrastre para ajustar.' : 'Haga clic sobre la foto.' }}</p>
                }
                @if (placed().length) {
                  <button type="button" class="linkish danger" (click)="reset()">Borrar el trazado {{ mode() === 'frontal' ? 'frontal' : 'de perfil' }}</button>
                }
              }
            </section>

            <section class="fa-metrics">
              @for (m of analysis().metrics; track m.label) {
                <article class="fa-metric" [attr.data-tone]="m.tone">
                  <span class="lbl">{{ m.label }}</span>
                  <span class="val">{{ m.value }}</span>
                  <span class="msg">{{ m.message }}</span>
                </article>
              } @empty {
                <p class="fa-empty">
                  {{ mode() === 'frontal' ? 'Marque Tr, G, Sn y Me′ para los tercios, y los seis puntos laterales para los quintos.' : 'Marque Cm, Sn y Ls para el ángulo nasolabial; G′ y Pg′ para la convexidad; Prn y Pg′ para la línea E.' }}
                </p>
              }
            </section>

            @if (!disabled()) {
              <button type="button" class="fa-apply" [disabled]="!analysis().metrics.length" (click)="applyResult()">
                Pasar resultados al análisis facial
              </button>
            }
          </aside>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .fa { border: 1px solid #dbe4ea; border-radius: 12px; background: #fff; padding: 12px; }
    .fa-toolbar { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: flex-end; margin-bottom: 10px; }
    .fa-tabs { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; }
    .fa-tabs button { border: 0; background: #f8fafc; padding: 7px 12px; font-size: 0.82rem; font-weight: 600; color: #475569; cursor: pointer; }
    .fa-tabs button.on { background: #00798c; color: #fff; }
    .fa-src { min-width: 220px; flex: 1 1 220px; max-width: 380px; font-size: 0.8rem; }
    .fa-empty { margin: 6px 0; color: #64748b; font-size: 0.84rem; }
    .fa-empty.dark { color: #cbd5e1; padding: 20px; }
    .fa-body { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 14px; align-items: start; }
    @media (max-width: 1100px) { .fa-body { grid-template-columns: 1fr; } }
    .fa-stage-wrap { border-radius: 12px; background: #0b1220; overflow: auto; max-height: 78vh; }
    .fa-stage { position: relative; }
    .fa-stage img { display: block; width: 100%; height: auto; user-select: none; }
    .fa-overlay { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
    .fa-overlay.placing { cursor: crosshair; }
    .fa-line { fill: none; opacity: 0.95; }
    .fa-line.third { stroke: #38bdf8; }
    .fa-line.sub { stroke: #7dd3fc; stroke-dasharray: 8 6; }
    .fa-line.fifth { stroke: #fbbf24; }
    .fa-line.mid { stroke: #f472b6; stroke-dasharray: 10 6; }
    .fa-line.angle { stroke: #34d399; }
    .fa-line.convex { stroke: #a78bfa; }
    .fa-line.eline { stroke: #f472b6; stroke-dasharray: 10 6; }
    .fa-lbl { fill: #fff; stroke: #0b1220; paint-order: stroke; font-weight: 700; font-family: system-ui, sans-serif; }
    .fa-pt { cursor: grab; }
    .fa-pt .hit { fill: transparent; }
    .fa-pt circle:not(.hit) { fill: #ef4444; stroke: #fff; }
    .fa-pt.on circle:not(.hit) { fill: #22c55e; }
    .fa-pt text { fill: #fff; stroke: #0b1220; paint-order: stroke; font-weight: 700; font-family: system-ui, sans-serif; }
    .fa-side { display: flex; flex-direction: column; gap: 10px; }
    .fa-panel { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; }
    .fa-h { margin: 0; font-weight: 700; font-size: 0.85rem; display: flex; justify-content: space-between; }
    .fa-h span { color: #64748b; font-weight: 600; }
    .fa-points { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .fa-points button { width: 100%; text-align: left; font-size: 0.74rem; padding: 5px 7px; border-radius: 7px; cursor: pointer; border: 1px solid #e2e8f0; background: #f8fafc; color: #334155; display: flex; gap: 4px; align-items: center; }
    .fa-points button b { min-width: 28px; color: #0f172a; }
    .fa-points button.done { background: #f0fdf4; border-color: #bbf7d0; }
    .fa-points button.on { border-color: #0ea5e9; box-shadow: 0 0 0 2px #bae6fd; background: #f0f9ff; }
    .fa-points button .ok { margin-left: auto; color: #16a34a; font-weight: 700; }
    .fa-hint { margin: 0; font-size: 0.78rem; color: #334155; background: #f1f5f9; border-radius: 8px; padding: 8px 10px; }
    .fa-metrics { display: grid; gap: 6px; }
    .fa-metric { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid #e2e8f0; border-left: 4px solid #cbd5e1; }
    .fa-metric[data-tone='ok'] { border-left-color: #22c55e; }
    .fa-metric[data-tone='out'] { border-left-color: #f59e0b; }
    .fa-metric .lbl { font-size: 0.74rem; font-weight: 700; color: #334155; }
    .fa-metric .val { font-size: 0.95rem; font-weight: 800; color: #0f172a; text-align: right; font-variant-numeric: tabular-nums; }
    .fa-metric .msg { grid-column: 1 / -1; font-size: 0.72rem; color: #64748b; }
    .fa-apply { padding: 8px 12px; border-radius: 8px; border: 0; cursor: pointer; background: #00798c; color: #fff; font-weight: 700; font-size: 0.85rem; }
    .fa-apply:disabled { opacity: 0.45; cursor: not-allowed; }
    .linkish { border: 0; background: none; padding: 0; color: #00798c; font: inherit; font-size: 0.78rem; font-weight: 600; text-decoration: underline; cursor: pointer; align-self: flex-start; }
    .linkish.danger { color: #b42318; }
  `,
})
export class OrthoFacialAnalysisComponent {
  readonly tracing = input.required<FacialTracing>();
  readonly frontalPhotos = input<FacialPhotoOption[]>([]);
  readonly profilePhotos = input<FacialPhotoOption[]>([]);
  readonly disabled = input(false);

  readonly changed = output<void>();
  readonly apply = output<FacialAnalysisResult>();

  @ViewChild('svg') private svgRef?: ElementRef<SVGSVGElement>;

  readonly mode = signal<Mode>('frontal');
  readonly active = signal<string | null>('Tr');
  readonly size = signal<{ w: number; h: number } | null>(null);
  private readonly tick = signal(0);
  private dragging: string | null = null;

  private trace(): FacialTrace {
    return this.tracing()[this.mode()];
  }

  landmarks() {
    return LANDMARKS[this.mode()];
  }

  options(): FacialPhotoOption[] {
    return this.mode() === 'frontal' ? this.frontalPhotos() : this.profilePhotos();
  }

  /** Foto del trazado guardado; si ya no existe, la primera disponible. */
  currentPhoto(): FacialPhotoOption | null {
    const opts = this.options();
    return opts.find((o) => o.id === this.trace().attachmentId) ?? opts[0] ?? null;
  }

  private points(): Pts {
    this.tick();
    const t = this.trace();
    return t.attachmentId && t.attachmentId === this.currentPhoto()?.id ? t.points : {};
  }

  placed() {
    const pts = this.points();
    return this.landmarks().flatMap((l) => {
      const p = pts[l.key];
      return p ? [{ key: l.key, short: l.short, x: p.x, y: p.y }] : [];
    });
  }

  isPlaced(key: string) {
    return !!this.points()[key];
  }

  activeLandmark() {
    return this.landmarks().find((l) => l.key === this.active()) ?? null;
  }

  sc() {
    const s = this.size();
    const base = s ? Math.max(s.w, s.h) : 1000;
    return { r: base / 150, hit: base / 65, stroke: base / 600, font: base / 45 };
  }

  analysis() {
    const pts = this.points();
    return this.mode() === 'frontal' ? frontalMetrics(pts) : profileMetrics(pts);
  }

  /** Líneas de tercios, quintos, línea media, ángulos y línea E sobre la foto. */
  guides() {
    const s = this.size();
    const p = this.points();
    if (!s) return [];
    const out: Array<{ id: string; kind: string; x1: number; y1: number; x2: number; y2: number }> = [];
    if (this.mode() === 'frontal') {
      for (const k of ['Tr', 'G', 'Sn', 'Me']) {
        const q = p[k];
        if (q) out.push({ id: `h-${k}`, kind: 'third', x1: 0, y1: q.y, x2: s.w, y2: q.y });
      }
      if (p['St']) out.push({ id: 'h-St', kind: 'sub', x1: 0, y1: p['St'].y, x2: s.w, y2: p['St'].y });
      for (const k of ['ZR', 'ExR', 'EnR', 'EnL', 'ExL', 'ZL']) {
        const q = p[k];
        if (q) out.push({ id: `v-${k}`, kind: 'fifth', x1: q.x, y1: 0, x2: q.x, y2: s.h });
      }
      const { EnR, EnL } = p;
      if (EnR && EnL) {
        const mid = (EnR.x + EnL.x) / 2;
        out.push({ id: 'mid', kind: 'mid', x1: mid, y1: 0, x2: mid, y2: s.h });
      }
    } else {
      const seg = (id: string, kind: string, a?: CephPoint, b?: CephPoint) => {
        if (a && b) out.push({ id, kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      };
      seg('cm-sn', 'angle', p['Cm'], p['Sn']);
      seg('sn-ls', 'angle', p['Sn'], p['Ls']);
      seg('g-sn', 'convex', p['Gs'], p['Sn']);
      seg('sn-pg', 'convex', p['Sn'], p['Pgs']);
      const { Prn, Pgs } = p;
      if (Prn && Pgs) {
        const dx = Pgs.x - Prn.x;
        const dy = Pgs.y - Prn.y;
        out.push({ id: 'eline', kind: 'eline', x1: Prn.x - dx * 0.15, y1: Prn.y - dy * 0.15, x2: Pgs.x + dx * 0.15, y2: Pgs.y + dy * 0.15 });
      }
    }
    return out;
  }

  /** Porcentajes junto a cada franja y el valor de los ángulos. */
  labels() {
    const s = this.size();
    const p = this.points();
    if (!s) return [];
    const out: Array<{ id: string; x: number; y: number; text: string; anchor: string }> = [];
    const pad = s.w * 0.015;
    if (this.mode() === 'frontal') {
      const { Tr, G, Sn, Me } = p;
      if (Tr && G && Sn && Me) {
        const parts = [
          [Tr, G],
          [G, Sn],
          [Sn, Me],
        ] as const;
        const total = Math.abs(Me.y - Tr.y) || 1;
        parts.forEach(([a, b], i) =>
          out.push({ id: `t${i}`, x: s.w - pad, y: (a.y + b.y) / 2, text: pct((Math.abs(b.y - a.y) / total) * 100), anchor: 'end' }),
        );
      }
      const xs = ['ZR', 'ExR', 'EnR', 'EnL', 'ExL', 'ZL'].map((k) => p[k]);
      if (xs.every(Boolean)) {
        const pts = xs as CephPoint[];
        const total = Math.abs(pts[5].x - pts[0].x) || 1;
        const y = Math.min(...pts.map((q) => q.y)) - s.h * 0.04;
        for (let i = 0; i < 5; i++) {
          out.push({ id: `f${i}`, x: (pts[i].x + pts[i + 1].x) / 2, y, text: pct((Math.abs(pts[i + 1].x - pts[i].x) / total) * 100), anchor: 'middle' });
        }
      }
    } else {
      const { Cm, Sn, Ls, Gs, Pgs } = p;
      if (Cm && Sn && Ls) {
        const a = angleAt(Sn, Cm, Ls);
        if (a !== null) out.push({ id: 'nl', x: Sn.x - pad * 2, y: Sn.y + pad, text: deg(a), anchor: 'end' });
      }
      if (Gs && Sn && Pgs) {
        const c = angleAt(Sn, Gs, Pgs);
        if (c !== null) out.push({ id: 'cx', x: Sn.x + pad * 2, y: Sn.y - pad * 2, text: deg(c), anchor: 'start' });
      }
    }
    return out;
  }

  setMode(mode: Mode) {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.size.set(null);
    this.active.set(this.firstMissing());
  }

  private firstMissing() {
    const pts = this.points();
    return this.landmarks().find((l) => !pts[l.key])?.key ?? null;
  }

  onImageLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) this.size.set({ w: img.naturalWidth, h: img.naturalHeight });
  }

  choosePhoto(select: HTMLSelectElement) {
    const t = this.trace();
    if (select.value === t.attachmentId) return;
    if (Object.keys(t.points).length && !confirm('Cambiar la fotografía borra los puntos marcados en ella. ¿Continuar?')) {
      select.value = this.currentPhoto()?.id ?? '';
      return;
    }
    t.attachmentId = select.value;
    t.points = {};
    t.tracedAt = '';
    this.size.set(null);
    this.active.set(this.landmarks()[0].key);
    this.commit();
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

  onStageDown(event: PointerEvent) {
    const key = this.active();
    if (this.disabled() || !key || event.button !== 0) return;
    const p = this.toImage(event);
    if (!p) return;
    const t = this.trace();
    const photo = this.currentPhoto();
    if (photo && t.attachmentId !== photo.id) {
      t.attachmentId = photo.id;
      t.points = {};
    }
    t.points[key] = p;
    this.tick.update((v) => v + 1);
    this.active.set(this.firstMissing());
    this.commit();
  }

  onPointDown(event: PointerEvent, key: string) {
    if (this.disabled()) return;
    event.stopPropagation();
    this.active.set(key);
    this.dragging = key;
    this.svgRef?.nativeElement.setPointerCapture(event.pointerId);
  }

  onMove(event: PointerEvent) {
    if (!this.dragging) return;
    const p = this.toImage(event);
    if (!p) return;
    this.trace().points[this.dragging] = p;
    this.tick.update((v) => v + 1);
  }

  onUp() {
    if (!this.dragging) return;
    this.dragging = null;
    this.commit();
  }

  reset() {
    if (!confirm('¿Borrar los puntos de este trazado?')) return;
    const t = this.trace();
    t.points = {};
    t.tracedAt = '';
    this.active.set(this.landmarks()[0].key);
    this.commit();
  }

  applyResult() {
    const { out, summary } = this.analysis();
    this.apply.emit({
      ...out,
      summary: `Análisis facial ${this.mode() === 'frontal' ? 'frontal' : 'de perfil'}: ${summary.join('; ')}.`,
    });
  }

  private commit() {
    const t = this.trace();
    t.tracedAt = Object.keys(t.points).length ? new Date().toISOString() : '';
    this.tick.update((v) => v + 1);
    this.changed.emit();
  }
}
