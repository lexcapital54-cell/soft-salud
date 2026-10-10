import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { procedureTypeLabel, zoneLabel } from '../aesthetic.models';
import { AES_MARK_STATUSES, AesAnnotation, AesShape, AesView, isProcedureMark, markKind, markStatus } from '../aesthetic-tracking.models';
import { FACE_PHOTOS, FACE_PHOTO_H, FaceSex, FacialLayer, FacialTool, inkOn, markStyle } from './facial-map.config';
import { RegionShape, lateralityAt, regionsFor } from './facial-regions';
import { VB_H, VB_W, arrowHead, clampX, clampY, fmtQty, parseQty, polyline, simplify, symbolPath } from './facial-map.utils';

const MIRROR = 'translate(200,0) scale(-1,1)';
/** Ancho de cada columna de rótulos a los lados del rostro (unidades del lienzo). */
const SIDE = 120;
/** Ancho mínimo del lienzo en pantalla para mostrar los rótulos laterales. */
const WIDE_MIN_PX = 720;
const CALLOUT_MAX_LINES = 3;
/** Caracteres por renglón que caben en la columna (título en mayúsculas y detalle). */
const TITLE_CHARS = 28;
const LINE_CHARS = 44;
const TITLE_LH = 5.6;
const LINE_LH = 5.6;

export interface Callout {
  id: string;
  zone: string;
  side: 'L' | 'R';
  ax: number;
  ay: number;
  y: number;
  h: number;
  title: string;
  titleLines: string[];
  lines: Array<{ text: string; color: string }>;
  ids: string[];
}

/** Parte un texto en renglones por palabras sin pasar del ancho dado. */
function wrapWords(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > max) {
      out.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function clip(text: string, max: number) {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

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
        [class.wide]="wide()"
        [style.aspect-ratio]="frame().w + ' / ' + vbH"
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
        <rect x="-600" y="-400" width="1400" height="1060" [attr.fill]="layers().has('base') ? photo().bg : '#f7f8fa'" />

        @if (layers().has('base')) {
          <g class="fm-base" aria-hidden="true" [attr.transform]="mirrored() ? mirror : null">
            <image
              [attr.href]="photo().src"
              [attr.x]="photo().x"
              [attr.y]="photo().y"
              width="200"
              [attr.height]="photoH"
              preserveAspectRatio="xMidYMid slice"
              (load)="photoState.set('ok')"
              (error)="photoState.set('error')"
            />
          </g>
          @if (photoState() === 'error') {
            <text class="fm-photo-err" x="100" y="130">No se pudo cargar el rostro de referencia</text>
          }
        } @else {
          <rect x="0" y="0" [attr.width]="vbW" [attr.height]="vbH" rx="10" class="fm-plain" />
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

        @if (callouts().length) {
          <g class="fm-callouts">
            @for (c of callouts(); track c.id) {
              @let left = c.side === 'L';
              @let tx = left ? -12 : vbW + 12;
              <g
                class="fm-callout"
                [class.hl]="highlight() === c.zone"
                role="button"
                tabindex="0"
                [attr.aria-label]="c.title + ': ' + calloutText(c)"
                (pointerdown)="calloutDown($event, c)"
                (keydown.enter)="picked.emit({ id: c.ids[0], additive: false })"
              >
                <path class="fm-leader" [attr.d]="leader(c)" />
                <circle class="fm-anchor" [attr.cx]="c.ax" [attr.cy]="c.ay" r="1.4" />
                <rect class="fm-co-hit" [attr.x]="left ? -SIDE + 2 : vbW + 2" [attr.y]="c.y - 1" [attr.width]="SIDE - 4" [attr.height]="c.h + 2" rx="2" />
                @for (t of c.titleLines; track $index) {
                  <text class="fm-co-title" [attr.x]="tx" [attr.y]="c.y + 5 + $index * 5.6" [attr.text-anchor]="left ? 'end' : 'start'">{{ t }}</text>
                }
                @for (l of c.lines; track $index) {
                  @let ly = c.y + 6.6 + c.titleLines.length * 5.6 + $index * 5.6;
                  <circle [attr.cx]="left ? tx + 3.6 : tx - 3.6" [attr.cy]="ly - 1.5" r="1.6" [attr.fill]="l.color" />
                  <text class="fm-co-line" [attr.x]="tx" [attr.y]="ly" [attr.text-anchor]="left ? 'end' : 'start'">{{ l.text }}</text>
                }
              </g>
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
            <rect x="0" y="0" width="200" height="260" [attr.fill]="photo().bg" />
            <g [attr.transform]="mirrored() ? mirror : null">
              <image [attr.href]="photo().src" [attr.x]="photo().x" [attr.y]="photo().y" width="200" [attr.height]="photoH" />
            </g>
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
  readonly sex = input<FaceSex>('F');
  /** Alto en píxeles que ocupa la leyenda flotante arriba a la izquierda (los rótulos empiezan debajo). */
  readonly reserveTopLeft = input(0);

  readonly created = output<CreateRequest>();
  readonly picked = output<{ id: string; additive: boolean }>();
  readonly erased = output<string>();
  readonly dragStart = output<string>();
  readonly dragged = output<{ id: string; dx: number; dy: number }>();
  readonly cleared = output<void>();

  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  readonly vbW = VB_W;
  readonly vbH = VB_H;
  readonly SIDE = SIDE;
  readonly mirror = MIRROR;
  readonly photoH = FACE_PHOTO_H;
  readonly markStyle = markStyle;

  readonly k = signal(1);
  private readonly cx = signal(VB_W / 2);
  private readonly cy = signal(VB_H / 2);
  readonly draft = signal<Draft | null>(null);
  readonly panning = signal(false);
  readonly hoverRegion = signal<string | null>(null);
  readonly photoState = signal<'loading' | 'ok' | 'error'>('loading');
  private readonly stageW = signal(0);
  private readonly svgW = signal(0);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const svg = this.svgRef().nativeElement;
      const ro = new ResizeObserver(() => {
        this.stageW.set(host.clientWidth);
        this.svgW.set(svg.clientWidth);
      });
      ro.observe(host);
      ro.observe(svg);
      destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  /** Con espacio suficiente, el lienzo se ensancha para los rótulos a ambos lados del rostro. */
  readonly wide = computed(() => this.layers().has('callouts') && this.stageW() >= WIDE_MIN_PX);
  readonly frame = computed(() => (this.wide() ? { x: -SIDE, w: VB_W + 2 * SIDE } : { x: 0, w: VB_W }));

  readonly viewBox = computed(() => {
    const r = this.vbRect();
    return `${r.x} ${r.y} ${r.w} ${r.h}`;
  });

  readonly vbRect = computed(() => {
    const k = this.k();
    const w = this.frame().w / k;
    const h = VB_H / k;
    return { x: this.cx() - w / 2, y: this.cy() - h / 2, w, h };
  });

  readonly family = computed(() => {
    const v = this.view();
    return v === 'FRONTAL' ? 'frontal' : v === 'OBLICUA_DER' || v === 'OBLICUA_IZQ' ? 'oblicua' : 'perfil';
  });
  readonly photo = computed(() => FACE_PHOTOS[this.sex()][this.family()]);
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

  /** Rótulos por región con lo registrado (nunca sugerencias), repartidos a cada lado sin solaparse. */
  readonly callouts = computed<Callout[]>(() => {
    if (!this.wide()) return [];
    const groups = new Map<RegionShape, AesAnnotation[]>();
    for (const { a } of this.marks()) {
      const z = a.zone ? this.nearestRegion(a.zone, a.x, a.y) : null;
      if (!z) continue;
      const list = groups.get(z) ?? [];
      list.push(a);
      groups.set(z, list);
    }
    const items: Callout[] = [];
    const pxPerUnit = this.svgW() / this.frame().w || 1;
    const leftTop = this.reserveTopLeft() ? this.reserveTopLeft() / pxPerUnit : 0;
    let left = 0;
    let right = 0;
    const entries = [...groups.entries()].sort((p, q) => p[0].cy - q[0].cy);
    for (const [z, list] of entries) {
      const lines = this.calloutLines(list);
      const side: 'L' | 'R' = z.cx < 100 ? 'L' : z.cx > 100 ? 'R' : z.cy < leftTop || left > right ? 'R' : 'L';
      if (side === 'L') left++;
      else right++;
      const title = this.regionName(z).toLocaleUpperCase('es');
      const titleLines = wrapWords(title, TITLE_CHARS).slice(0, 2);
      items.push({
        id: `${z.key}-${z.cx}-${z.cy}`,
        zone: z.key,
        side,
        ax: z.cx,
        ay: z.cy,
        y: 0,
        h: 2.4 + titleLines.length * TITLE_LH + lines.length * LINE_LH,
        title,
        titleLines,
        lines,
        ids: list.map((a) => a.id),
      });
    }
    for (const side of ['L', 'R'] as const) {
      const col = items.filter((c) => c.side === side).sort((p, q) => p.ay - q.ay);
      let bottom = side === 'L' ? Math.max(2, leftTop) : 2;
      for (const c of col) {
        c.y = Math.max(c.ay - c.h / 2, bottom + 3);
        bottom = c.y + c.h;
      }
      let limit = VB_H - 2;
      for (let i = col.length - 1; i >= 0; i--) {
        const c = col[i];
        if (c.y + c.h > limit) c.y = limit - c.h;
        limit = c.y - 3;
      }
    }
    return items;
  });

  private calloutLines(list: AesAnnotation[]): Callout['lines'] {
    const rows = new Map<string, { label: string; color: string; status: string; unit: string; qty: number; count: number }>();
    for (const a of list) {
      const st = markStatus(a);
      const proc = isProcedureMark(a);
      const full = proc ? (a.procType ? procedureTypeLabel(a.procType) : 'Procedimiento') : markKind(a.kind).label;
      const label = full.replace(/\s*\(.*\)\s*$/, '');
      const unit = proc ? (a.unit ?? '') : '';
      const key = `${label}|${st ?? ''}|${unit}`;
      const row = rows.get(key) ?? { label, color: markStyle(a).color, status: st ?? '', unit, qty: 0, count: 0 };
      const q = proc && a.quantity ? parseQty(a.quantity) : null;
      if (q !== null) row.qty += q;
      row.count++;
      rows.set(key, row);
    }
    const out = [...rows.values()].map((r) => {
      const parts = [r.label];
      if (r.qty && r.unit) parts.push(`${fmtQty(r.qty)} ${r.unit}`);
      else if (r.count > 1) parts.push(`${r.count} marcas`);
      if (r.status) parts.push((AES_MARK_STATUSES.find((s) => s.key === r.status)?.label ?? r.status).toLowerCase());
      return { text: clip(parts.join(' · '), LINE_CHARS), color: r.color };
    });
    if (out.length <= CALLOUT_MAX_LINES) return out;
    return [...out.slice(0, CALLOUT_MAX_LINES - 1), { text: `y ${out.length - CALLOUT_MAX_LINES + 1} más`, color: '#98A2B3' }];
  }

  calloutText(c: Callout) {
    return c.lines.map((l) => l.text).join('; ');
  }

  leader(c: Callout) {
    const y = c.y + 3.6;
    return c.side === 'L' ? `M-4,${y} H2 L${c.ax},${c.ay}` : `M${VB_W + 4},${y} H${VB_W - 2} L${c.ax},${c.ay}`;
  }

  calloutDown(e: PointerEvent, c: Callout) {
    e.stopPropagation();
    this.markPressed = true;
    this.picked.emit({ id: c.ids[0], additive: false });
  }

  private nearestRegion(key: string, x: number, y: number): RegionShape | null {
    let best: RegionShape | null = null;
    for (const z of this.regions()) {
      if (z.key !== key) continue;
      if (!best || Math.hypot(z.cx - x, z.cy - y) < Math.hypot(best.cx - x, best.cy - y)) best = z;
    }
    return best;
  }

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
    return a.zone ? this.nearestRegion(a.zone, a.x, a.y) : null;
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
    const f = this.frame();
    this.cx.set(Math.min(f.x + f.w, Math.max(f.x, this.cx())));
    this.cy.set(Math.min(VB_H, Math.max(0, this.cy())));
  }

  /** Solo el rostro admite marcas; los costados son para los rótulos. */
  private inFace(p: { x: number; y: number }) {
    return p.x >= 0 && p.x <= VB_W && p.y >= 0 && p.y <= VB_H;
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
    if (this.readOnly() || !this.inFace(p)) return;
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
    if (g?.moved || this.readOnly() || !this.inFace(p)) {
      if (!g?.moved && (tool === 'select' || !this.inFace(p))) this.cleared.emit();
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
