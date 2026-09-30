import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DentistryContent } from './dentistry.models';
import { MeshFormat, meshFormatOf } from './mesh-parsers';
import { DIGITAL_MODEL_KINDS, DIGITAL_MODEL_SOURCES, DigitalModelRow } from './ortho-models3d.data';
import { OrthoModelViewer } from './ortho-model-viewer';

export interface DigitalModelUpload {
  file: File;
  kind: string;
}

const MAX_MB = 25;

/** Modelos digitales (STL, OBJ, PLY) por tipo, con versiones, datos del archivo y visor 3D. */
@Component({
  selector: 'app-ortho-digital-models',
  imports: [FormsModule, OrthoModelViewer],
  template: `
    @let list = data().orthoModels3d;
    <div class="dm">
      <div class="dm-slots">
        @for (k of kinds; track k) {
          @let cur = latest(k);
          <div class="dm-slot" [class.has]="cur">
            <div class="dm-ico" aria-hidden="true">
              <svg viewBox="0 0 40 28"><path [attr.d]="k === 'Modelo inferior' ? lowerPath : k === 'Modelo superior' ? upperPath : bitePath" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
            </div>
            <strong>{{ k }}</strong>
            @if (cur) {
              <span class="dm-meta">{{ cur.format }} · v{{ cur.version }} · {{ cur.date || 'sin fecha' }}</span>
              <div class="dm-acts">
                @if (canView(cur)) {
                  <button type="button" (click)="open(cur)">Ver en 3D</button>
                }
                <button type="button" (click)="download(cur)">Descargar</button>
              </div>
            } @else {
              <span class="dm-meta">Sin archivo</span>
            }
            @if (!disabled()) {
              <label class="dm-up" [class.busy]="uploading() === k">
                {{ uploading() === k ? 'Subiendo…' : cur ? 'Subir nueva versión' : 'Subir STL / OBJ / PLY' }}
                <input type="file" accept=".stl,.obj,.ply" hidden [disabled]="uploading() === k" (change)="pick(k, $event)" />
              </label>
            }
          </div>
        }
      </div>
      @if (error()) {
        <p class="dm-err">{{ error() }}</p>
      }
      @if (viewing(); as v) {
        <app-ortho-model-viewer [blob]="v.blob" [format]="v.format" [title]="v.title" (closed)="viewing.set(null)" />
      }
      @if (loadingView()) {
        <p class="dm-meta">Descargando modelo…</p>
      }
      @if (list.length) {
        <table class="dm-table">
          <thead><tr><th>Tipo</th><th>Archivo</th><th>Formato</th><th>Versión</th><th>Fecha</th><th>Origen</th><th>Observación</th><th></th></tr></thead>
          <tbody>
            @for (r of sorted(); track r.id) {
              <tr [class.old]="latest(r.kind)?.id !== r.id">
                <td>{{ r.kind }}</td>
                <td><button type="button" class="dm-link" (click)="canView(r) ? open(r) : download(r)">{{ r.fileName || 'Archivo' }}</button> <small>{{ sizeText(r.sizeKb) }}</small></td>
                <td>{{ r.format }}</td>
                <td>v{{ r.version }}{{ latest(r.kind)?.id === r.id ? ' (vigente)' : '' }}</td>
                <td><input type="date" [(ngModel)]="r.date" (ngModelChange)="touch()" [readonly]="disabled()" /></td>
                <td>
                  <select [(ngModel)]="r.source" (ngModelChange)="touch()" [disabled]="disabled()">
                    <option value="">—</option>
                    @for (s of sources; track s) {
                      <option [value]="s">{{ s }}</option>
                    }
                  </select>
                </td>
                <td><input [(ngModel)]="r.notes" (ngModelChange)="touch()" [readonly]="disabled()" /></td>
                <td>
                  @if (!disabled()) {
                    <button type="button" class="dm-del" title="Quitar de la lista (el archivo sigue en Anexos)" (click)="remove(r)">×</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
      <p class="dm-meta">Formatos: STL, OBJ o PLY hasta {{ maxMb }} MB. Cada archivo nuevo del mismo tipo se guarda como una versión; las anteriores se conservan.</p>
    </div>
  `,
  styles: `
    .dm { display: grid; gap: 10px; }
    .dm-slots { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
    .dm-slot { display: grid; gap: 4px; justify-items: start; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 14px; background: #f8fafc; font-size: 12px; }
    .dm-slot.has { border-style: solid; border-color: #12609a; background: #f4f8fb; }
    .dm-ico { color: #94a3b8; width: 40px; }
    .dm-slot.has .dm-ico { color: #12609a; }
    .dm-slot strong { color: #123b60; font-size: 13px; }
    .dm-meta { font-size: 11px; color: #64748b; margin: 0; }
    .dm-acts { display: flex; gap: 4px; flex-wrap: wrap; }
    .dm-acts button { border: 1px solid #12609a; background: #fff; color: #12609a; border-radius: 99px; padding: 2px 10px; font-size: 11px; cursor: pointer; }
    .dm-up { border: 0; background: #12609a; color: #fff; border-radius: 8px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
    .dm-up.busy { opacity: 0.6; cursor: default; }
    .dm-err { margin: 0; padding: 6px 10px; border-radius: 8px; background: #fef2f2; color: #991b1b; font-size: 12px; }
    .dm-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .dm-table th, .dm-table td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; }
    .dm-table tr.old { color: #94a3b8; }
    .dm-table input, .dm-table select { width: 100%; min-width: 0; }
    .dm-link { border: 0; background: none; padding: 0; color: #12609a; text-decoration: underline; cursor: pointer; font-size: 12px; }
    .dm-del { border: 0; background: none; color: #94a3b8; font-size: 18px; cursor: pointer; }
    .dm-del:hover { color: #dc2626; }
  `,
})
export class OrthoDigitalModels {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly uploading = input('');
  readonly loadFile = input<((id: string) => Promise<Blob>) | null>(null);
  readonly changed = output<void>();
  readonly upload = output<DigitalModelUpload>();

  readonly kinds = DIGITAL_MODEL_KINDS;
  readonly sources = DIGITAL_MODEL_SOURCES;
  readonly maxMb = MAX_MB;
  readonly upperPath = 'M4 24 C4 8 12 4 20 4 C28 4 36 8 36 24';
  readonly lowerPath = 'M4 4 C4 20 12 24 20 24 C28 24 36 20 36 4';
  readonly bitePath = 'M4 12 C4 4 14 2 20 2 C26 2 36 4 36 12 M4 16 C4 24 14 26 20 26 C26 26 36 24 36 16';

  readonly error = signal('');
  readonly viewing = signal<{ blob: Blob; format: MeshFormat; title: string } | null>(null);
  readonly loadingView = signal(false);

  latest(kind: string): DigitalModelRow | undefined {
    return this.data()
      .orthoModels3d.filter((r) => r.kind === kind)
      .sort((a, b) => b.version - a.version)[0];
  }

  sorted() {
    return [...this.data().orthoModels3d].sort((a, b) => a.kind.localeCompare(b.kind) || b.version - a.version);
  }

  canView(r: DigitalModelRow) {
    return !!r.attachmentId && !!meshFormatOf(r.fileName) && !!this.loadFile();
  }

  sizeText(kb: number) {
    if (!kb) return '';
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  }

  touch() {
    this.changed.emit();
  }

  pick(kind: string, event: Event) {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    this.error.set('');
    if (!meshFormatOf(file.name)) {
      this.error.set(`${file.name}: use un archivo STL, OBJ o PLY.`);
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      this.error.set(`${file.name} pesa más de ${MAX_MB} MB; expórtelo con menor resolución.`);
      return;
    }
    this.upload.emit({ file, kind });
  }

  async open(r: DigitalModelRow) {
    const load = this.loadFile();
    const format = meshFormatOf(r.fileName);
    if (!load || !format || !r.attachmentId) return;
    this.loadingView.set(true);
    this.error.set('');
    try {
      const blob = await load(r.attachmentId);
      this.viewing.set({ blob, format, title: `${r.kind} · v${r.version}` });
    } catch {
      this.error.set('No se pudo descargar el modelo.');
    } finally {
      this.loadingView.set(false);
    }
  }

  async download(r: DigitalModelRow) {
    const load = this.loadFile();
    if (!load || !r.attachmentId) return;
    try {
      const blob = await load(r.attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.fileName || 'modelo';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      this.error.set('No se pudo descargar el archivo.');
    }
  }

  remove(r: DigitalModelRow) {
    if (!confirm(`¿Quitar ${r.fileName || 'el modelo'} (v${r.version}) de la lista? El archivo seguirá en Anexos.`)) return;
    const list = this.data().orthoModels3d;
    const i = list.indexOf(r);
    if (i >= 0) list.splice(i, 1);
    this.touch();
  }
}
