import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { EAR, FACE_OUTLINE, MIRROR, faceFeatures } from '../../dentistry/ortho-face-outline';
import { zoneLabel } from '../aesthetic.models';
import { AesAnnotation, AesShape, AesView, markStatus } from '../aesthetic-tracking.models';
import { FacialLayer, FacialTool, inkOn, markStyle } from './facial-map.config';
import { RegionShape, lateralityAt, regionsFor } from './facial-regions';
import { VB_H, VB_W, arrowHead, clampX, clampY, polyline, simplify, symbolPath } from './facial-map.utils';

const OBLIQUE_OUTLINE =
  'M100,16 C140,16 158,40 156,70 C156,84 152,92 154,100 L166,122 C168,126 164,129 158,129 ' +
  'C158,136 160,140 156,144 C158,150 156,156 150,158 C152,168 148,180 140,188 C130,198 116,202 104,200 ' +
  'C84,198 64,186 56,168 C48,150 44,130 44,108 C44,60 62,16 100,16 ' +
  'M56,100 C46,98 42,110 44,120 C46,130 52,134 58,132 ' +
  'M70,186 C72,210 70,236 66,256 M136,192 C134,215 136,240 140,256';
const OBLIQUE_DETAIL =
  'M70,84 Q84,78 98,82 M112,82 Q124,79 136,84 M72,96 Q84,90 96,96 Q84,101 72,96 ' +
  'M114,96 Q124,91 134,96 Q124,100 114,96 M128,92 C132,106 140,116 146,124 Q140,130 130,128 ' +
  'M118,152 Q132,147 146,152 Q132,158 118,152';
const PROFILE_OUTLINE =
  'M110,16 C150,16 160,40 158,66 C158,76 156,82 158,88 C160,92 156,96 156,100 L172,124 C174,128 170,132 162,132 ' +
  'C164,138 166,142 162,146 C166,150 164,156 158,158 C162,166 160,176 154,184 C150,196 140,198 128,196 L112,200 ' +
  'C112,215 114,235 116,256 M58,256 C60,230 62,212 60,196 C48,184 40,160 40,120 C40,60 60,16 110,16';
const PROFILE_DETAIL =
  'M88,96 C98,96 100,128 88,128 C80,128 78,96 88,96 M86,130 C92,170 108,190 128,196 M144,100 Q149,97 153,100';
const FRONT = faceFeatures(84, 130, 208);
const NECK = 'M80,198 C80,220 78,240 76,256 M120,198 C120,220 122,240 124,256';

export interface NumberedMark {
  a: AesAnnotation;
  n: number;
}

export interface CreateRequest {
  shape: AesShape;
  x: number;
  y: number;
  points?: number[];
  zone?: string;
}

type Draft = { shape: AesShape; points: number[] };

const MIN_K = 0.5;
const MAX_K = 4;
const DRAG_TOL_PX = 4;

/**
 * Lienzo SVG del mapa facial. Las coordenadas viven en el viewBox 200×260 de cada vista,
 * así las marcas quedan en el mismo sitio anatómico con cualquier tamaño de pantalla o zoom.
 */
@Component({
  selector: 'app-facial-map-canvas',
  styleUrls: ['./facial-map.scss'],
  template: `
    <div class="fm-stage" [class.tool-hand]="tool() === 'hand' || panning()" [class.tool-draw]="drawTool()">
      <svg
        #svg
        class="fm-svg"
        [attr.viewBox]="viewBox()"
        role="group"
        tabindex="0"
        [attr.aria-label]="ariaLabel()"
        [style.touch-action]="touchAction()"
        (pointerdown)="down($event)"
        (pointermove)="move($event)"
        (pointerup)="up($event)"
        (pointercancel)="cancelPointer($event)"
        (dblclick)="finishPolygon()"
        (wheel)="wheel($event)"
      >
        <defs>
          <radialGradient id="fm-halo" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="70%" stop-color="#f3f5f8" />
            <stop offset="100%" stop-color="#e9edf2" />
          </radialGradient>
          <linearGradient id="fm-skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fbf4ef" />
            <stop offset="100%" stop-color="#f3e6dd" />
          </linearGradient>
        </defs>
        <rect x="-400" y="-400" width="1000" height="1060" fill="#f7f8fa" />
        <rect x="0" y="0" [attr.width]="vbW" [attr.height]="vbH" rx="10" fill="url(#fm-halo)" />

        @if (layers().has('base')) {
          <g class="fm-base" aria-hidden="true">
            @switch (family()) {
              @case ('front') {
                <path class="skin" [attr.d]="outline" />
                <path [attr.d]="outline" />
                <path [attr.d]="ear" />
                <path [attr.d]="ear" [attr.transform]="mirror" />
                <path [attr.d]="neck" />
                <path class="fine" [attr.d]="front.brows" />
                <path class="fine" [attr.d]="front.eyes" />
                <path class="fine" [attr.d]="front.nose" />
                <path class="fine" [attr.d]="front.lips" />
              }
              @case ('oblique') {
                <g [attr.transform]="mirrored() ? mirror : null">
                  <path [attr.d]="oblique" />
                  <path class="fine" [attr.d]="obliqueDetail" />
                </g>
              }
              @default {
                <g [attr.transform]="mirrored() ? mirror : null">
                  <path [attr.d]="profile" />
                  <path class="fine" [attr.d]="profileDetail" />
                </g>
              }
            }
          </g>
        }

        @if (layers().has('regions') || highlight()) {
          <g class="fm-regions">
            @for (z of regions(); track $index) {
              @let count = regionCounts().get(z.key) || 0;
              <ellipse
                class="fm-region"
                [class.hl]="highlight() === z.key"
                [class.has]="occupied().has(z)"
                [class.faint]="!layers().has('regions')"
                [class.ro]="readOnly() || !regionTool()"
                [attr.cx]="z.cx" [attr.cy]="z.cy" [attr.rx]="z.rx" [attr.ry]="z.ry"
                [attr.tabindex]="regionTool() && !readOnly() ? 0 : -1"
                [attr.role]="regionTool() && !readOnly() ? 'button' : null"
                [attr.aria-label]="regionTool() && !readOnly() ? 'Marcar ' + regionName(z) : null"
                (pointerenter)="hoverRegion.set(z.key)"
                (pointerleave)="hoverRegion.set(null)"
                (keydown.enter)="keyRegion(z)"
                (keydown.space)="keyRegion(z); $event.preventDefault()"
              >
                <title>{{ regionName(z) }}{{ count ? ' · ' + count + (count === 1 ? ' marca' : ' marcas') : '' }}</title>
              </ellipse>
            }
          </g>
        }

        <g class="fm-marks">
          @for (m of marks(); track m.a.id) {
            @let a = m.a;
            @let st = markStyle(a);
            @let status = statusOf(a);
            <g
              class="fm-mark"
              [class.sel]="selected().has(a.id)"
              [class.locked]="!!a.lockedAt"
              [class.st-planned]="status === 'PLANEADO'"
              [class.st-susp]="status === 'SUSPENDIDO'"
              [class.st-cancel]="status === 'CANCELADO'"
              tabindex="0"
              role="button"
              [attr.aria-label]="markAria(m)"
              [attr.aria-pressed]="selected().has(a.id)"
              (pointerdown)="markDown($event, a)"
              (keydown.enter)="picked.emit({ id: a.id, additive: false })"
            >
              <title>{{ markAria(m) }}</title>
              @switch (a.shape || 'point') {
                @case ('zone') {
                  @if (zoneShape(a); as z) {
                    <ellipse class="fm-zone-fill" [attr.cx]="z.cx" [attr.cy]="z.cy" [attr.rx]="z.rx" [attr.ry]="z.ry"
                      [attr.fill]="st.color" [attr.stroke]="st.color" />
                  }
                }
                @case ('line') {
                  <path class="fm-hit" [attr.d]="line(a)" />
                  <path class="fm-stroke" [attr.d]="line(a)" [attr.stroke]="st.color" [style.stroke-width]="strokeW()" />
                }
                @case ('arrow') {
                  <path class="fm-hit" [attr.d]="line(a)" />
                  <path class="fm-stroke" [attr.d]="line(a)" [attr.stroke]="st.color" [style.stroke-width]="strokeW()" />
                  <polygon [attr.points]="head(a)" [attr.fill]="st.color" />
                }
                @case ('freehand') {
                  <path class="fm-hit" [attr.d]="line(a)" />
                  <path class="fm-stroke" [attr.d]="line(a)" [attr.stroke]="st.color" [style.stroke-width]="strokeW()" />
                }
                @case ('polygon') {
                  <path class="fm-area" [attr.d]="closed(a)" [attr.fill]="st.color" [attr.stroke]="st.color" [style.stroke-width]="strokeW()" />
                }
                @case ('ellipse') {
                  @let b = box(a);
                  <ellipse class="fm-area" [attr.cx]="b.x + b.w / 2" [attr.cy]="b.y + b.h / 2" [attr.rx]="b.w / 2" [attr.ry]="b.h / 2"
                    [attr.fill]="st.color" [attr.stroke]="st.color" [style.stroke-width]="strokeW()" />
                }
                @case ('rect') {
                  @let b = box(a);
                  <rect class="fm-area" [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="1.5"
                    [attr.fill]="st.color" [attr.stroke]="st.color" [style.stroke-width]="strokeW()" />
                }
                @case ('text') {
                  <text class="fm-text" [attr.x]="a.x" [attr.y]="a.y" [attr.fill]="st.color" [style.font-size.px]="textSize()">
                    {{ a.label || 'Texto' }}
                  </text>
                }
              }
              @if ((a.shape || 'point') === 'point') {
                <path class="fm-symbol" [attr.d]="symbol(st.symbol, a.x, a.y)"
                  [attr.fill]="status === 'PLANEADO' || status === 'CANCELADO' ? '#ffffff' : st.color"
                  [attr.stroke]="status === 'CANCELADO' ? '#98A2B3' : status === 'PLANEADO' ? st.color : '#ffffff'"
                  [style.stroke-width]="status === 'PLANEADO' ? markR() * 0.32 : markR() * 0.22" />
                @if (status === 'SUSPENDIDO') {
                  <path class="fm-overlay" [attr.d]="slash(a.x, a.y)" />
                }
                @if (status === 'CANCELADO') {
                  <path class="fm-overlay cancel" [attr.d]="cross(a.x, a.y)" />
                }
                @if (layers().has('labels')) {
                  <text class="fm-num" [attr.x]="a.x" [attr.y]="a.y + markR() * 0.38" [style.font-size.px]="markR() * 1.05"
                    [attr.fill]="status === 'PLANEADO' ? '#19252E' : status === 'CANCELADO' ? '#667085' : ink(st.color)">{{ m.n }}</text>
                }
              } @else if (layers().has('labels') && a.shape !== 'text') {
                @let p = badgeAt(a);
                <circle class="fm-badge" [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="markR() * 0.85" [attr.fill]="st.color" />
                <text class="fm-num" [attr.x]="p.x" [attr.y]="p.y + markR() * 0.32" [style.font-size.px]="markR() * 0.95"
                  [attr.fill]="ink(st.color)">{{ m.n }}</text>
              }
              @if (a.lockedAt) {
                <circle class="fm-lock" [attr.cx]="badgeAt(a).x + markR() * 0.9" [attr.cy]="badgeAt(a).y - markR() * 0.9" [attr.r]="markR() * 0.42" />
              }
            </g>
          }
        </g>

        @if (draft(); as d) {
          <g class="fm-draft" aria-hidden="true">
            @switch (d.shape) {
              @case ('ellipse') {
                @let b = boxOf(d.points);
                <ellipse [attr.cx]="b.x + b.w / 2" [attr.cy]="b.y + b.h / 2" [attr.rx]="b.w / 2" [attr.ry]="b.h / 2" [attr.stroke]="draftColor()" />
              }
              @case ('rect') {
                @let b = boxOf(d.points);
                <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" [attr.stroke]="draftColor()" />
              }
              @case ('polygon') {
                <path [attr.d]="poly(d.points)" [attr.stroke]="draftColor()" />
                @for (v of vertices(d.points); track $index) {
                  <circle [attr.cx]="v[0]" [attr.cy]="v[1]" [attr.r]="markR() * 0.4" [attr.fill]="draftColor()" />
                }
              }
              @default {
                <path [attr.d]="poly(d.points)" [attr.stroke]="draftColor()" />
                @if (d.shape === 'arrow' && d.points.length >= 4) {
                  <polygon [attr.points]="headOf(d.points)" [attr.fill]="draftColor()" />
                }
              }
            }
          </g>
        }
      </svg>

      @if (k() > 1.35) {
        <button type="button" class="fm-minimap" aria-label="Mini mapa: toque para centrar la vista" (click)="miniClick($event)">
          <svg viewBox="0 0 200 260" aria-hidden="true">
            <rect x="0" y="0" width="200" height="260" fill="#f7f8fa" />
            @switch (family()) {
              @case ('front') {
                <path [attr.d]="outline" />
              }
              @case ('oblique') {
                <path [attr.d]="oblique" [attr.transform]="mirrored() ? mirror : null" />
              }
              @default {
                <path [attr.d]="profile" [attr.transform]="mirrored() ? mirror : null" />
              }
            }
            @let r = vbRect();
            <rect class="fm-mini-view" [attr.x]="r.x" [attr.y]="r.y" [attr.width]="r.w" [attr.height]="r.h" />
          </svg>
        </button>
      }
    </div>
  `,
})
export class FacialMapCanvas {
  readonly view = input.required<AesView>();
  readonly marks = input<NumberedMark[]>([]);
  readonly selected = input<Set<string>>(new Set());
  readonly tool = input<FacialTool>('select');
  readonly readOnly = input(false);
  readonly layers = input<Set<FacialLayer>>(new Set());
  readonly highlight = input<string | null>(null);
  readonly regionCounts = input<Map<string, number>>(new Map());
  /** Color del trazo en curso (el del procedimiento o tipo activo). */
  readonly draftColor = input('#1F3653');

  readonly created = output<CreateRequest>();
  readonly picked = output<{ id: string; additive: boolean }>();
  readonly erased = output<string>();
  readonly dragStart = output<string>();
  readonly dragged = output<{ id: string; dx: number; dy: number }>();
  readonly cleared = output<void>();

  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  readonly vbW = VB_W;
  readonly vbH = VB_H;
  readonly outline = FACE_OUTLINE;
  readonly ear = EAR;
  readonly mirror = MIRROR;
  readonly neck = NECK;
  readonly front = FRONT;
  readonly profile = PROFILE_OUTLINE;
  readonly profileDetail = PROFILE_DETAIL;
  readonly oblique = OBLIQUE_OUTLINE;
  readonly obliqueDetail = OBLIQUE_DETAIL;
  readonly markStyle = markStyle;

  readonly k = signal(1);
  private readonly cx = signal(VB_W / 2);
  private readonly cy = signal(VB_H / 2);
  readonly draft = signal<Draft | null>(null);
  readonly panning = signal(false);
  readonly hoverRegion = signal<string | null>(null);

  readonly viewBox = computed(() => {
    const r = this.vbRect();
    return `${r.x} ${r.y} ${r.w} ${r.h}`;
  });

  readonly vbRect = computed(() => {
    const k = this.k();
    const w = VB_W / k;
    const h = VB_H / k;
    return { x: this.cx() - w / 2, y: this.cy() - h / 2, w, h };
  });

  readonly family = computed(() => {
    const v = this.view();
    return v === 'FRONTAL' ? 'front' : v === 'OBLICUA_DER' || v === 'OBLICUA_IZQ' ? 'oblique' : 'profile';
  });
  readonly mirrored = computed(() => this.view() === 'IZQUIERDO' || this.view() === 'OBLICUA_IZQ');
  readonly regions = computed(() => regionsFor(this.view()));
  /** Las marcas conservan su tamaño en pantalla al acercar. */
  readonly markR = computed(() => 4.6 / Math.sqrt(this.k()));
  readonly strokeW = computed(() => 1.4 / Math.sqrt(this.k()));
  readonly textSize = computed(() => 7 / Math.sqrt(this.k()));
  readonly drawTool = computed(() => !['select', 'hand', 'eraser'].includes(this.tool()));
  readonly regionTool = computed(() => this.tool() === 'zone' || this.tool() === 'point');
  readonly touchAction = computed(() => (this.tool() === 'select' && this.k() === 1 ? 'pan-y' : 'none'));
  readonly ariaLabel = computed(() => `Mapa facial, ${this.marks().length} marcas. Zoom ${Math.round(this.k() * 100)} %.`);

  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; k: number } | null = null;
  private gesture: { x: number; y: number; moved: boolean } | null = null;
  private dragId: string | null = null;
  private dragLast: { x: number; y: number } | null = null;
  private dragStarted = false;
  /** La marca ya atendió el toque: el fondo no debe limpiar la selección al soltar. */
  private markPressed = false;

  /** Elipses con alguna marca de su región dentro (así se ilumina solo el lado marcado). */
  readonly occupied = computed(() => {
    const out = new Set<RegionShape>();
    for (const z of this.regions()) {
      const hit = this.marks().some(({ a }) => {
        if (a.zone !== z.key) return false;
        const dx = (a.x - z.cx) / z.rx;
        const dy = (a.y - z.cy) / z.ry;
        return dx * dx + dy * dy <= 1.0001;
      });
      if (hit) out.add(z);
    }
    return out;
  });

  private readonly repeated = computed(() => {
    const seen = new Map<string, number>();
    for (const z of this.regions()) seen.set(z.key, (seen.get(z.key) ?? 0) + 1);
    return seen;
  });

  /** Nombre con el lado del paciente cuando la región aparece dos veces en la vista. */
  regionName(z: RegionShape) {
    if ((this.repeated().get(z.key) ?? 0) < 2) return zoneLabel(z.key);
    const side = lateralityAt(this.view(), z.cx, '');
    return `${zoneLabel(z.key)} (${side === 'DERECHA' ? 'derecha' : 'izquierda'})`;
  }

  statusOf(a: AesAnnotation) {
    return markStatus(a);
  }

  ink(color: string) {
    return inkOn(color);
  }

  symbol(s: Parameters<typeof symbolPath>[0], x: number, y: number) {
    return symbolPath(s, x, y, this.markR());
  }

  slash(x: number, y: number) {
    const r = this.markR() * 1.25;
    return `M${x - r},${y + r} L${x + r},${y - r}`;
  }

  cross(x: number, y: number) {
    const r = this.markR() * 0.9;
    return `M${x - r},${y - r} L${x + r},${y + r} M${x + r},${y - r} L${x - r},${y + r}`;
  }

  line(a: AesAnnotation) {
    return polyline(a.points ?? []);
  }

  closed(a: AesAnnotation) {
    return polyline(a.points ?? [], true);
  }

  head(a: AesAnnotation) {
    return arrowHead(a.points ?? [], 5 / Math.sqrt(this.k()));
  }

  headOf(points: number[]) {
    return arrowHead(points.slice(-4), 5 / Math.sqrt(this.k()));
  }

  poly(points: number[]) {
    return polyline(points);
  }

  vertices(points: number[]) {
    const out: Array<[number, number]> = [];
    for (let i = 0; i + 1 < points.length; i += 2) out.push([points[i], points[i + 1]]);
    return out;
  }

  boxOf(p: number[]) {
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = p;
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }

  box(a: AesAnnotation) {
    return this.boxOf(a.points ?? [a.x, a.y, a.x, a.y]);
  }

  /** Elipse de la región de una marca de zona (la más cercana a su centro, por las bilaterales). */
  zoneShape(a: AesAnnotation): RegionShape | null {
    const list = this.regions().filter((z) => z.key === a.zone);
    if (!list.length) return null;
    return list.reduce((best, z) =>
      Math.hypot(z.cx - a.x, z.cy - a.y) < Math.hypot(best.cx - a.x, best.cy - a.y) ? z : best,
    );
  }

  badgeAt(a: AesAnnotation) {
    if (a.shape === 'zone') return { x: a.x, y: a.y };
    if (a.points?.length && (a.shape === 'ellipse' || a.shape === 'rect')) {
      const b = this.box(a);
      return { x: b.x + b.w, y: b.y };
    }
    if (a.points?.length) return { x: a.points[0], y: a.points[1] };
    return { x: a.x, y: a.y };
  }

  markAria(m: NumberedMark) {
    const a = m.a;
    const st = markStatus(a);
    const parts = [`Marca ${m.n}`, a.zone ? zoneLabel(a.zone) : 'sin zona'];
    if (st) parts.push(st.toLowerCase());
    if (a.quantity) parts.push(`${a.quantity} ${a.unit || ''}`.trim());
    if (a.lockedAt) parts.push('cerrada');
    return parts.join(', ');
  }

  // ---- Zoom y desplazamiento ----

  zoomBy(factor: number, at?: { x: number; y: number }) {
    const k = this.k();
    const next = Math.min(MAX_K, Math.max(MIN_K, k * factor));
    if (next === k) return;
    const p = at ?? { x: this.cx(), y: this.cy() };
    this.cx.set(p.x - (p.x - this.cx()) * (k / next));
    this.cy.set(p.y - (p.y - this.cy()) * (k / next));
    this.k.set(next);
    this.clampCenter();
  }

  reset() {
    this.k.set(1);
    this.cx.set(VB_W / 2);
    this.cy.set(VB_H / 2);
  }

  /** Centra en el rostro manteniendo el zoom. */
  center() {
    this.cx.set(VB_W / 2);
    this.cy.set(VB_H * 0.45);
    this.clampCenter();
  }

  private clampCenter() {
    this.cx.set(Math.min(VB_W, Math.max(0, this.cx())));
    this.cy.set(Math.min(VB_H, Math.max(0, this.cy())));
  }

  wheel(e: WheelEvent) {
    const svg = this.svgRef().nativeElement;
    if (!(e.ctrlKey || e.metaKey || document.activeElement === svg)) return;
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, this.toSvg(e.clientX, e.clientY) ?? undefined);
  }

  miniClick(e: MouseEvent) {
    const el = (e.currentTarget as HTMLElement).querySelector('svg');
    const ctm = el?.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    this.cx.set(p.x);
    this.cy.set(p.y);
    this.clampCenter();
  }

  // ---- Interacción ----

  private toSvg(clientX: number, clientY: number) {
    const ctm = this.svgRef().nativeElement.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  private unitsPerPx() {
    const ctm = this.svgRef().nativeElement.getScreenCTM();
    return ctm && ctm.a ? 1 / ctm.a : 1;
  }

  markDown(e: PointerEvent, a: AesAnnotation) {
    const tool = this.tool();
    if (tool === 'eraser') {
      e.stopPropagation();
      if (!this.readOnly()) this.erased.emit(a.id);
      return;
    }
    if (tool !== 'select' && tool !== 'point' && tool !== 'zone' && tool !== 'text') return;
    e.stopPropagation();
    this.markPressed = true;
    this.picked.emit({ id: a.id, additive: e.shiftKey || e.metaKey || e.ctrlKey });
    if (tool === 'select' && !this.readOnly() && !a.lockedAt && !e.shiftKey) {
      try {
        this.svgRef().nativeElement.setPointerCapture(e.pointerId);
      } catch {
        /* el puntero ya no existe */
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragId = a.id;
      this.dragStarted = false;
      this.dragLast = this.toSvg(e.clientX, e.clientY);
      this.gesture = { x: e.clientX, y: e.clientY, moved: false };
    }
  }

  down(e: PointerEvent) {
    const svg = this.svgRef().nativeElement;
    svg.focus({ preventScroll: true });
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      /* el puntero ya no existe */
    }
    if (this.pointers.size === 2) {
      const [p1, p2] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, k: this.k() };
      if (this.draft()?.shape !== 'polygon') this.draft.set(null);
      this.dragId = null;
      return;
    }
    if (this.pointers.size > 2) return;
    this.gesture = { x: e.clientX, y: e.clientY, moved: false };
    const p = this.toSvg(e.clientX, e.clientY);
    if (!p) return;
    const tool = this.tool();
    if (tool === 'hand' || e.button === 1) {
      this.panning.set(true);
      return;
    }
    if (this.readOnly()) return;
    const x = clampX(p.x);
    const y = clampY(p.y);
    if (tool === 'line' || tool === 'arrow' || tool === 'ellipse' || tool === 'rect') {
      this.draft.set({ shape: tool, points: [x, y, x, y] });
    } else if (tool === 'freehand') {
      this.draft.set({ shape: 'freehand', points: [x, y] });
    }
  }

  move(e: PointerEvent) {
    if (!this.pointers.has(e.pointerId)) return;
    const prev = this.pointers.get(e.pointerId)!;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pinch && this.pointers.size === 2) {
      const [p1, p2] = [...this.pointers.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
      const mid = this.toSvg((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      this.zoomBy((this.pinch.k * (dist / this.pinch.dist)) / this.k(), mid ?? undefined);
      const u = this.unitsPerPx();
      this.cx.update((v) => v - ((e.clientX - prev.x) / 2) * u);
      this.cy.update((v) => v - ((e.clientY - prev.y) / 2) * u);
      this.clampCenter();
      return;
    }

    const g = this.gesture;
    if (g && !g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > DRAG_TOL_PX) g.moved = true;

    if (this.panning()) {
      const u = this.unitsPerPx();
      this.cx.update((v) => v - (e.clientX - prev.x) * u);
      this.cy.update((v) => v - (e.clientY - prev.y) * u);
      this.clampCenter();
      return;
    }

    if (this.dragId && g?.moved) {
      const p = this.toSvg(e.clientX, e.clientY);
      if (!p || !this.dragLast) return;
      if (!this.dragStarted) {
        this.dragStarted = true;
        this.dragStart.emit(this.dragId);
      }
      this.dragged.emit({ id: this.dragId, dx: p.x - this.dragLast.x, dy: p.y - this.dragLast.y });
      this.dragLast = p;
      return;
    }

    const d = this.draft();
    if (!d || d.shape === 'polygon') return;
    const p = this.toSvg(e.clientX, e.clientY);
    if (!p) return;
    const x = clampX(p.x);
    const y = clampY(p.y);
    if (d.shape === 'freehand') {
      const n = d.points.length;
      if (Math.hypot(x - d.points[n - 2], y - d.points[n - 1]) >= 0.8) this.draft.set({ ...d, points: [...d.points, x, y] });
    } else {
      this.draft.set({ ...d, points: [d.points[0], d.points[1], x, y] });
    }
  }

  up(e: PointerEvent) {
    const wasPinch = !!this.pinch;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (wasPinch) return;
    const g = this.gesture;
    this.gesture = null;

    if (this.panning()) {
      this.panning.set(false);
      return;
    }
    if (this.dragId || this.markPressed) {
      this.dragId = null;
      this.dragLast = null;
      this.markPressed = false;
      return;
    }
    const p = this.toSvg(e.clientX, e.clientY);
    if (!p) return;
    const x = clampX(p.x);
    const y = clampY(p.y);
    const tool = this.tool();
    const d = this.draft();

    if (d && d.shape !== 'polygon') {
      this.draft.set(null);
      if (d.shape === 'freehand') {
        if (d.points.length >= 4) this.created.emit({ shape: 'freehand', x: d.points[0], y: d.points[1], points: simplify(d.points) });
        return;
      }
      const [x1, y1, x2, y2] = d.points;
      if (Math.hypot(x2 - x1, y2 - y1) < 2) return;
      this.created.emit({ shape: d.shape, x: x1, y: y1, points: [x1, y1, x2, y2] });
      return;
    }
    if (g?.moved || this.readOnly()) {
      if (!g?.moved && tool === 'select') this.cleared.emit();
      return;
    }

    if (tool === 'polygon') {
      const pts = d?.points ?? [];
      if (pts.length >= 6 && Math.hypot(x - pts[0], y - pts[1]) < this.markR() * 1.2) {
        this.finishPolygon();
        return;
      }
      this.draft.set({ shape: 'polygon', points: [...pts, x, y] });
      return;
    }
    if (tool === 'point' || tool === 'text') {
      this.created.emit({ shape: tool, x, y });
      return;
    }
    if (tool === 'zone') {
      const hit = this.regionHit(x, y);
      if (hit) this.created.emit({ shape: 'zone', x: hit.cx, y: hit.cy, zone: hit.key });
      return;
    }
    if (tool === 'select') this.cleared.emit();
  }

  cancelPointer(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    this.pinch = null;
    this.gesture = null;
    this.panning.set(false);
    this.dragId = null;
    if (this.draft()?.shape !== 'polygon') this.draft.set(null);
  }

  private regionHit(x: number, y: number): RegionShape | null {
    let best: RegionShape | null = null;
    for (const z of this.regions()) {
      const dx = (x - z.cx) / z.rx;
      const dy = (y - z.cy) / z.ry;
      if (dx * dx + dy * dy <= 1 && (!best || z.rx * z.ry < best.rx * best.ry)) best = z;
    }
    return best;
  }

  keyRegion(z: RegionShape) {
    if (this.readOnly()) return;
    if (this.tool() === 'zone') this.created.emit({ shape: 'zone', x: z.cx, y: z.cy, zone: z.key });
    else this.created.emit({ shape: 'point', x: z.cx, y: z.cy, zone: z.key });
  }

  /** Cierra el contorno en curso (doble toque, Enter o tocar el primer vértice). */
  finishPolygon() {
    const d = this.draft();
    if (!d || d.shape !== 'polygon') return;
    this.draft.set(null);
    // El doble toque agrega vértices repetidos al final: se descartan.
    const pts: number[] = [];
    for (let i = 0; i + 1 < d.points.length; i += 2) {
      const n = pts.length;
      if (n && Math.hypot(d.points[i] - pts[n - 2], d.points[i + 1] - pts[n - 1]) < 1) continue;
      pts.push(d.points[i], d.points[i + 1]);
    }
    if (pts.length >= 6) this.created.emit({ shape: 'polygon', x: pts[0], y: pts[1], points: pts });
  }

  /** Cancela el trazo en curso; devuelve si había uno. */
  cancelDraft(): boolean {
    const had = !!this.draft();
    this.draft.set(null);
    return had;
  }

  focus() {
    this.svgRef().nativeElement.focus({ preventScroll: true });
  }
}
