import { Component, ElementRef, OnDestroy, effect, input, output, signal, viewChild } from '@angular/core';
import { MeshFormat, parseMesh } from './mesh-parsers';

const MAX_TRIS = 80000;
const DRAG_TRIS = 16000;

/** Visor 3D liviano en canvas: girar arrastrando, zoom con la rueda y vistas predefinidas. No modifica el archivo. */
@Component({
  selector: 'app-ortho-model-viewer',
  template: `
    <div class="mvw">
      <div class="mvw-bar">
        <strong>{{ title() }}</strong>
        <span class="mvw-info">{{ status() }}</span>
        <div class="mvw-views">
          <button type="button" (click)="view(0, 0)">Frontal</button>
          <button type="button" (click)="view(-Math.PI / 2, 0)">Oclusal</button>
          <button type="button" (click)="view(0, Math.PI / 2)">Lateral</button>
          <button type="button" (click)="zoomBy(1.2)" aria-label="Acercar">+</button>
          <button type="button" (click)="zoomBy(1 / 1.2)" aria-label="Alejar">−</button>
          <button type="button" (click)="closed.emit()" aria-label="Cerrar visor">✕</button>
        </div>
      </div>
      <canvas
        #cv
        class="mvw-cv"
        (pointerdown)="down($event)"
        (pointermove)="move($event)"
        (pointerup)="up($event)"
        (pointercancel)="up($event)"
        (wheel)="wheel($event)"
      ></canvas>
      <p class="mvw-hint">Arrastre para girar · rueda para acercar · vista esquemática, sin medidas.</p>
    </div>
  `,
  styles: `
    .mvw { display: grid; gap: 6px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 14px; background: #0f1d2e; color: #e2e8f0; }
    .mvw-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12px; }
    .mvw-info { color: #94a3b8; }
    .mvw-views { margin-left: auto; display: flex; gap: 4px; }
    .mvw-views button { border: 1px solid #334155; background: #1e293b; color: #e2e8f0; border-radius: 8px; padding: 3px 9px; font-size: 12px; cursor: pointer; }
    .mvw-cv { width: 100%; height: 360px; border-radius: 10px; background: radial-gradient(circle at 50% 40%, #1e3a5f, #0b1522); touch-action: none; cursor: grab; }
    .mvw-hint { margin: 0; font-size: 11px; color: #94a3b8; }
  `,
})
export class OrthoModelViewer implements OnDestroy {
  readonly blob = input<Blob | null>(null);
  readonly format = input<MeshFormat | null>(null);
  readonly title = input('');
  readonly closed = output<void>();

  readonly Math = Math;
  readonly status = signal('Cargando…');
  private readonly cv = viewChild<ElementRef<HTMLCanvasElement>>('cv');

  private tris = new Float32Array(0);
  private center = [0, 0, 0];
  private radius = 1;
  private pitch = -0.6;
  private yaw = 0;
  private zoom = 1;
  private dragging = false;
  private last = { x: 0, y: 0 };
  private raf = 0;

  constructor() {
    effect(() => {
      const blob = this.blob();
      const format = this.format();
      if (!blob || !format) return;
      this.status.set('Cargando…');
      blob
        .arrayBuffer()
        .then((buf) => {
          const all = parseMesh(buf, format);
          const n = all.length / 9;
          if (!n) throw new Error('empty');
          const step = Math.max(1, Math.ceil(n / MAX_TRIS));
          const keep = Math.floor(n / step);
          const tris = new Float32Array(keep * 9);
          for (let i = 0; i < keep; i++) tris.set(all.subarray(i * step * 9, i * step * 9 + 9), i * 9);
          this.tris = tris;
          this.fit();
          this.status.set(`${n.toLocaleString('es-CO')} triángulos${step > 1 ? ` · se muestran ${keep.toLocaleString('es-CO')}` : ''}`);
          this.draw(false);
        })
        .catch(() => this.status.set('No se pudo leer el archivo 3D.'));
    });
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.raf);
  }

  private fit() {
    const t = this.tris;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < t.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (t[i + k] < min[k]) min[k] = t[i + k];
        if (t[i + k] > max[k]) max[k] = t[i + k];
      }
    }
    this.center = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
    this.radius = Math.max(...[0, 1, 2].map((k) => max[k] - min[k])) / 2 || 1;
  }

  view(pitch: number, yaw: number) {
    this.pitch = pitch;
    this.yaw = yaw;
    this.draw(false);
  }

  zoomBy(f: number) {
    this.zoom = Math.max(0.3, Math.min(8, this.zoom * f));
    this.draw(false);
  }

  down(e: PointerEvent) {
    this.dragging = true;
    this.last = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  move(e: PointerEvent) {
    if (!this.dragging) return;
    this.yaw += (e.clientX - this.last.x) * 0.01;
    this.pitch += (e.clientY - this.last.y) * 0.01;
    this.last = { x: e.clientX, y: e.clientY };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.draw(true));
  }

  up(e: PointerEvent) {
    if (!this.dragging) return;
    this.dragging = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    this.draw(false);
  }

  wheel(e: WheelEvent) {
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }

  private draw(fast: boolean) {
    const canvas = this.cv()?.nativeElement;
    if (!canvas || !this.tris.length) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const t = this.tris;
    const total = t.length / 9;
    const step = fast ? Math.max(1, Math.ceil(total / DRAG_TRIS)) : 1;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const s = (Math.min(w, h) / 2 / this.radius) * 0.9 * this.zoom;
    const [cx0, cy0, cz0] = this.center;
    const n = Math.floor(total / step);
    const px = new Float32Array(n * 6);
    const depth = new Float32Array(n);
    const shade = new Float32Array(n);
    const order: number[] = [];
    const tmp = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let j = 0; j < n; j++) {
      const i = j * step * 9;
      for (let v = 0; v < 3; v++) {
        const x = t[i + v * 3] - cx0, y = t[i + v * 3 + 1] - cy0, z = t[i + v * 3 + 2] - cz0;
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        const y2 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        tmp[v * 3] = x1;
        tmp[v * 3 + 1] = y2;
        tmp[v * 3 + 2] = z2;
      }
      const ux = tmp[3] - tmp[0], uy = tmp[4] - tmp[1], uz = tmp[5] - tmp[2];
      const vx = tmp[6] - tmp[0], vy = tmp[7] - tmp[1], vz = tmp[8] - tmp[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      const lit = Math.abs(nz / len) * 0.75 + Math.abs((ny / len) * 0.25);
      shade[j] = lit;
      depth[j] = tmp[2] + tmp[5] + tmp[8];
      for (let v = 0; v < 3; v++) {
        px[j * 6 + v * 2] = w / 2 + tmp[v * 3] * s;
        px[j * 6 + v * 2 + 1] = h / 2 - tmp[v * 3 + 1] * s;
      }
      order.push(j);
    }
    order.sort((a, b) => depth[a] - depth[b]);
    for (const j of order) {
      const l = shade[j];
      const r = Math.round(90 + 150 * l), g = Math.round(84 + 140 * l), b = Math.round(72 + 120 * l);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.moveTo(px[j * 6], px[j * 6 + 1]);
      ctx.lineTo(px[j * 6 + 2], px[j * 6 + 3]);
      ctx.lineTo(px[j * 6 + 4], px[j * 6 + 5]);
      ctx.closePath();
      ctx.fill();
      if (!fast) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }
  }
}
