import { Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { DentistryContent } from './dentistry.models';
import {
  PERIO_LOWER,
  PERIO_SITE_LABELS,
  PERIO_UPPER,
  PerioFace,
  PerioFlagField,
  PerioNumField,
  PerioTooth,
  emptyPerioTooth,
  furcationLabel,
  hasFurcation,
  perioStats,
  siteDisplayOrder,
} from './periodontogram.models';

interface ArchDef {
  key: 'upper' | 'lower';
  label: string;
  teeth: number[];
  faces: PerioFace[];
}

const COL = 54;
const MM = 4;

/**
 * Periodontograma de 6 sitios por diente. Muta `data().periodontogram` (objeto de la historia)
 * y avisa con `changed`; los dientes ausentes se toman del odontograma.
 */
@Component({
  selector: 'app-dental-periodontogram',
  template: `
    @let s = stats();
    <div class="pg">
      <div class="pg-stats">
        <div class="pg-stat" [attr.data-tone]="tone(s.bopPct, 10, 30)"><span>Sangrado al sondaje</span><b>{{ pct(s.bopPct) }}</b></div>
        <div class="pg-stat" [attr.data-tone]="tone(s.plaquePct, 20, 40)"><span>Placa</span><b>{{ pct(s.plaquePct) }}</b></div>
        <div class="pg-stat"><span>PS media</span><b>{{ mm(s.meanPd) }}</b></div>
        <div class="pg-stat"><span>NIC medio</span><b>{{ mm(s.meanCal) }}</b></div>
        <div class="pg-stat" [attr.data-tone]="s.sites4 ? 'warn' : 'ok'"><span>Sitios PS ≥ 4 mm</span><b>{{ s.sites4 }}</b></div>
        <div class="pg-stat" [attr.data-tone]="s.sites6 ? 'bad' : 'ok'"><span>Sitios PS ≥ 6 mm</span><b>{{ s.sites6 }}</b></div>
        <div class="pg-stat"><span>NIC máximo</span><b>{{ mm(s.maxCal) }}</b></div>
      </div>
      <p class="pg-help">
        Escriba profundidad de sondaje y margen gingival: el cursor avanza solo (para 10 mm o más escriba los dos dígitos).
        Margen positivo = recesión, negativo = agrandamiento. En una casilla de sondaje:
        <kbd>S</kbd> sangrado, <kbd>P</kbd> placa, <kbd>U</kbd> supuración. Flechas para moverse.
      </p>
      @if (!disabled()) {
        <div class="pg-actions">
          <button type="button" class="pg-btn primary" [disabled]="!s.sitesMeasured && s.bopPct === null" (click)="applySummary()">
            Pasar resumen a «Periodonto»
          </button>
          <button type="button" class="pg-btn danger" (click)="clearAll()">Borrar periodontograma</button>
        </div>
      }

      @for (arch of arches; track arch.key) {
        <section class="pg-arch">
          <h5>{{ arch.label }}</h5>
          <div class="pg-scroll">
            <div class="pg-grid">
              <div class="pg-lbl"></div>
              @for (t of arch.teeth; track t) {
                <div class="pg-th" [class.absent]="isAbsent(t)" [title]="isAbsent(t) ? 'Ausente en el odontograma' : ''">
                  {{ t }}
                  @if (isImplant(t)) {
                    <small>Impl.</small>
                  }
                </div>
              }

              <div class="pg-lbl">Movilidad</div>
              @for (t of arch.teeth; track t) {
                <div class="pg-cell">
                  @if (!isAbsent(t)) {
                    <button type="button" class="pg-cyc" [class.on]="!!tooth(t)?.mobility" [disabled]="disabled()" (click)="cycle(t, 'mobility')" title="Clic para cambiar el grado (0–3)">
                      {{ tooth(t)?.mobility ?? '·' }}
                    </button>
                  }
                </div>
              }
              <div class="pg-lbl">Furca</div>
              @for (t of arch.teeth; track t) {
                <div class="pg-cell">
                  @if (!isAbsent(t) && furca(t)) {
                    <button type="button" class="pg-cyc" [class.on]="!!tooth(t)?.furcation" [disabled]="disabled()" (click)="cycle(t, 'furcation')" title="Clic para cambiar el grado (I–III)">
                      {{ tooth(t)?.furcation ? roman(tooth(t)!.furcation!) : '·' }}
                    </button>
                  }
                </div>
              }

              @for (face of arch.faces; track face) {
                <div class="pg-face">{{ faceLabel(arch, face) }}</div>
                @for (row of numRows; track row.key) {
                  <div class="pg-lbl">{{ row.label }}</div>
                  @for (t of arch.teeth; track t) {
                    <div class="pg-cell trio">
                      @for (i of order(t); track i) {
                        @let v = num(t, row.key, face, i);
                        <input
                          class="pg-in"
                          data-nav
                          inputmode="numeric"
                          maxlength="3"
                          [class.warn]="row.key === 'pd' && v !== null && v >= 4"
                          [class.bad]="row.key === 'pd' && v !== null && v >= 6"
                          [class.rec]="row.key === 'rec' && v !== null && v > 0"
                          [value]="v ?? ''"
                          [disabled]="disabled() || isAbsent(t)"
                          [attr.aria-label]="row.label + ' ' + t + ' ' + faceLabel(arch, face) + ' ' + siteLabel(i)"
                          (input)="onNum($event, t, row.key, face, i)"
                          (keydown)="onKey($event, t, face, i, row.key)"
                          (focus)="$any($event.target).select()"
                        />
                      }
                    </div>
                  }
                }
                <div class="pg-lbl">NIC</div>
                @for (t of arch.teeth; track t) {
                  <div class="pg-cell trio">
                    @for (i of order(t); track i) {
                      @let c = cal(t, face, i);
                      <span class="pg-cal" [class.warn]="c !== null && c >= 3" [class.bad]="c !== null && c >= 5">{{ c ?? '' }}</span>
                    }
                  </div>
                }
                @for (row of flagRows; track row.key) {
                  <div class="pg-lbl">{{ row.label }}</div>
                  @for (t of arch.teeth; track t) {
                    <div class="pg-cell trio">
                      @if (!isAbsent(t)) {
                        @for (i of order(t); track i) {
                          <button
                            type="button"
                            class="pg-dot"
                            [attr.data-kind]="row.key"
                            [class.on]="flag(t, row.key, face, i)"
                            [disabled]="disabled()"
                            [attr.aria-pressed]="flag(t, row.key, face, i)"
                            [attr.aria-label]="row.label + ' ' + t + ' ' + siteLabel(i)"
                            (click)="toggleFlag(t, row.key, face, i)"
                          ></button>
                        }
                      }
                    </div>
                  }
                }
                <div class="pg-lbl graph">Gráfica</div>
                <div class="pg-graph">
                  <svg [attr.viewBox]="'0 0 ' + width + ' 80'" [attr.width]="width" height="80" aria-hidden="true">
                    @for (t of arch.teeth; track t; let c = $index) {
                      <rect [attr.x]="c * col" y="0" [attr.width]="col" height="80" [attr.class]="isAbsent(t) ? 'g-absent' : c % 2 ? 'g-col alt' : 'g-col'" />
                    }
                    <line x1="0" [attr.x2]="width" [attr.y1]="baseY(arch)" [attr.y2]="baseY(arch)" class="g-cej" />
                    @for (g of graph(arch, face); track g.tooth) {
                      @if (g.pocket) {
                        <polygon [attr.points]="g.pocket" class="g-pocket" />
                      }
                      <polyline [attr.points]="g.margin" class="g-margin" />
                      @if (g.bottom) {
                        <polyline [attr.points]="g.bottom" class="g-bottom" />
                      }
                      @for (d of g.deep; track $index) {
                        <circle [attr.cx]="d.x" [attr.cy]="d.y" r="2.6" class="g-deep" />
                      }
                    }
                  </svg>
                </div>
              }
            </div>
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .pg { display: flex; flex-direction: column; gap: 10px; }
    .pg-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px; }
    .pg-stat { display: flex; flex-direction: column; gap: 2px; padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
    .pg-stat span { font-size: 11px; color: #64748b; }
    .pg-stat b { font-size: 16px; color: #123b60; }
    .pg-stat[data-tone='ok'] { border-color: #bbf7d0; }
    .pg-stat[data-tone='warn'] { border-color: #fcd34d; background: #fffbeb; }
    .pg-stat[data-tone='bad'] { border-color: #fca5a5; background: #fef2f2; }
    .pg-stat[data-tone='bad'] b { color: #b91c1c; }
    .pg-help { margin: 0; font-size: 12px; color: #64748b; }
    kbd { padding: 0 5px; border: 1px solid #cbd5e1; border-bottom-width: 2px; border-radius: 4px; background: #f8fafc; font-size: 11px; }
    .pg-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .pg-btn { padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; font-size: 12px; font-weight: 600; cursor: pointer; }
    .pg-btn.primary { border-color: #12609a; background: #12609a; color: #fff; }
    .pg-btn.primary:disabled { opacity: 0.5; cursor: default; }
    .pg-btn.danger { color: #b91c1c; border-color: #fecaca; }
    .pg-arch h5 { margin: 6px 0; font-size: 13px; color: #123b60; }
    .pg-scroll { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
    .pg-grid { display: grid; grid-template-columns: 92px repeat(16, ${COL}px); align-items: center; width: max-content; }
    .pg-lbl { position: sticky; left: 0; z-index: 1; padding: 0 8px; font-size: 11px; font-weight: 600; color: #475569; background: #f8fafc; border-right: 1px solid #e2e8f0; height: 100%; display: flex; align-items: center; }
    .pg-lbl.graph { height: 80px; }
    .pg-th { text-align: center; font-size: 12px; font-weight: 800; color: #123b60; padding: 5px 0; border-bottom: 1px solid #e2e8f0; line-height: 1.1; }
    .pg-th small { display: block; font-size: 9px; color: #7c3aed; font-weight: 700; }
    .pg-th.absent { color: #cbd5e1; text-decoration: line-through; }
    .pg-face { grid-column: 1 / -1; padding: 4px 8px; font-size: 11px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #12609a; background: #eff6ff; border-top: 1px solid #dbeafe; border-bottom: 1px solid #dbeafe; }
    .pg-cell { display: flex; justify-content: center; padding: 2px 0; min-height: 24px; }
    .pg-cell.trio { gap: 1px; }
    .pg-in { width: 17px; height: 22px; padding: 0; border: 1px solid #cbd5e1; border-radius: 3px; text-align: center; font-size: 12px; font-variant-numeric: tabular-nums; }
    .pg-in:focus { outline: 2px solid #12609a; outline-offset: 0; border-color: #12609a; }
    .pg-in:disabled { background: #f1f5f9; border-color: #e2e8f0; }
    .pg-in.warn { background: #fef3c7; border-color: #f59e0b; font-weight: 700; }
    .pg-in.bad { background: #fee2e2; border-color: #dc2626; color: #991b1b; }
    .pg-in.rec { color: #b91c1c; font-weight: 700; }
    .pg-cal { width: 17px; text-align: center; font-size: 11px; color: #475569; font-variant-numeric: tabular-nums; }
    .pg-cal.warn { color: #b45309; font-weight: 700; }
    .pg-cal.bad { color: #b91c1c; font-weight: 800; }
    .pg-cyc { min-width: 26px; height: 22px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; font-size: 12px; font-weight: 700; color: #94a3b8; cursor: pointer; }
    .pg-cyc.on { background: #7c3aed; border-color: #7c3aed; color: #fff; }
    .pg-dot { width: 13px; height: 13px; margin: 2px; padding: 0; border: 1px solid #cbd5e1; border-radius: 50%; background: #fff; cursor: pointer; }
    .pg-dot[data-kind='bop'].on { background: #dc2626; border-color: #dc2626; }
    .pg-dot[data-kind='plq'].on { background: #2563eb; border-color: #2563eb; }
    .pg-dot[data-kind='sup'].on { background: #eab308; border-color: #ca8a04; }
    .pg-dot:disabled { cursor: default; }
    .pg-graph { grid-column: 2 / -1; height: 80px; }
    .pg-graph svg { display: block; }
    .g-col { fill: #fff; }
    .g-col.alt { fill: #f8fafc; }
    .g-absent { fill: #f1f5f9; }
    .g-cej { stroke: #94a3b8; stroke-dasharray: 4 3; stroke-width: 1; }
    .g-pocket { fill: rgba(37, 99, 235, 0.18); }
    .g-margin { fill: none; stroke: #dc2626; stroke-width: 1.8; }
    .g-bottom { fill: none; stroke: #2563eb; stroke-width: 1.8; }
    .g-deep { fill: #dc2626; }
  `,
})
export class DentalPeriodontogram {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly changed = output<void>();

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  protected readonly tick = signal(0);

  readonly col = COL;
  readonly width = COL * 16;
  readonly arches: ArchDef[] = [
    { key: 'upper', label: 'Maxilar superior', teeth: PERIO_UPPER, faces: ['b', 'l'] },
    { key: 'lower', label: 'Mandíbula', teeth: PERIO_LOWER, faces: ['l', 'b'] },
  ];
  readonly numRows: Array<{ key: PerioNumField; label: string }> = [
    { key: 'pd', label: 'Sondaje (mm)' },
    { key: 'rec', label: 'Margen (mm)' },
  ];
  readonly flagRows: Array<{ key: PerioFlagField; label: string }> = [
    { key: 'bop', label: 'Sangrado' },
    { key: 'plq', label: 'Placa' },
    { key: 'sup', label: 'Supuración' },
  ];

  faceLabel(arch: ArchDef, face: PerioFace) {
    if (face === 'b') return 'Vestibular';
    return arch.key === 'upper' ? 'Palatino' : 'Lingual';
  }

  siteLabel(i: number) {
    return PERIO_SITE_LABELS[i];
  }

  order(tooth: number) {
    return siteDisplayOrder(tooth);
  }

  furca(tooth: number) {
    return hasFurcation(tooth);
  }

  roman(grade: number) {
    return furcationLabel(grade);
  }

  private absentSet(): Set<string> {
    const set = new Set<string>();
    for (const [tooth, rec] of Object.entries(this.data().odontogram)) {
      if (rec.conditions?.includes('AUSENTE')) set.add(tooth);
    }
    return set;
  }

  isAbsent(tooth: number) {
    return !!this.data().odontogram[String(tooth)]?.conditions?.includes('AUSENTE');
  }

  isImplant(tooth: number) {
    return !!this.data().odontogram[String(tooth)]?.conditions?.includes('IMPLANTE');
  }

  stats() {
    this.tick();
    return perioStats(this.data().periodontogram, this.absentSet());
  }

  tooth(t: number): PerioTooth | undefined {
    return this.data().periodontogram.teeth[String(t)];
  }

  private ensure(t: number): PerioTooth {
    const teeth = this.data().periodontogram.teeth;
    return (teeth[String(t)] ??= emptyPerioTooth());
  }

  num(t: number, field: PerioNumField, face: PerioFace, i: number): number | null {
    return this.tooth(t)?.[field][face][i] ?? null;
  }

  flag(t: number, field: PerioFlagField, face: PerioFace, i: number): boolean {
    return !!this.tooth(t)?.[field][face][i];
  }

  cal(t: number, face: PerioFace, i: number): number | null {
    const pd = this.num(t, 'pd', face, i);
    return pd === null ? null : pd + (this.num(t, 'rec', face, i) ?? 0);
  }

  onNum(event: Event, t: number, field: PerioNumField, face: PerioFace, i: number) {
    const el = event.target as HTMLInputElement;
    const raw = el.value.trim().replace(',', '.');
    if (raw === '' ) {
      this.ensure(t)[field][face][i] = null;
      this.commit();
      return;
    }
    if (raw === '-') return;
    const n = Number(raw);
    const [min, max] = field === 'pd' ? [0, 15] : [-5, 15];
    if (!Number.isInteger(n) || n < min || n > max) {
      el.value = String(this.num(t, field, face, i) ?? '');
      return;
    }
    this.ensure(t)[field][face][i] = n;
    this.commit();
    const digits = raw.replace('-', '');
    if ((digits.length === 1 && digits !== '1') || digits.length === 2) this.move(el, 1);
  }

  onKey(event: KeyboardEvent, t: number, face: PerioFace, i: number, field: PerioNumField) {
    const el = event.target as HTMLInputElement;
    const key = event.key;
    if (key === 'ArrowRight' || key === 'Enter') {
      event.preventDefault();
      this.move(el, 1);
    } else if (key === 'ArrowLeft') {
      event.preventDefault();
      this.move(el, -1);
    } else if (field === 'pd' && !this.disabled()) {
      const map: Record<string, PerioFlagField> = { s: 'bop', p: 'plq', u: 'sup' };
      const flag = map[key.toLowerCase()];
      if (flag) {
        event.preventDefault();
        this.toggleFlag(t, flag, face, i);
      }
    }
  }

  private move(el: HTMLInputElement, step: number) {
    const inputs = [...this.host.nativeElement.querySelectorAll<HTMLInputElement>('input[data-nav]:not(:disabled)')];
    const next = inputs[inputs.indexOf(el) + step];
    next?.focus();
  }

  toggleFlag(t: number, field: PerioFlagField, face: PerioFace, i: number) {
    if (this.disabled()) return;
    const tooth = this.ensure(t);
    tooth[field][face][i] = !tooth[field][face][i];
    this.commit();
  }

  cycle(t: number, field: 'mobility' | 'furcation') {
    const tooth = this.ensure(t);
    const v = tooth[field];
    const first = field === 'mobility' ? 0 : 1;
    tooth[field] = v === null ? first : v >= 3 ? null : v + 1;
    this.commit();
  }

  baseY(arch: ArchDef) {
    return arch.key === 'upper' ? 66 : 14;
  }

  /** Margen (rojo), fondo de bolsa (azul) y bolsa sombreada por diente; el ápice hacia arriba en el maxilar. */
  graph(arch: ArchDef, face: PerioFace) {
    this.tick();
    const sign = arch.key === 'upper' ? -1 : 1;
    const y0 = this.baseY(arch);
    const y = (depth: number) => Math.max(2, Math.min(78, y0 + sign * depth * MM));
    const out: Array<{ tooth: number; margin: string; bottom: string; pocket: string; deep: Array<{ x: number; y: number }> }> = [];
    arch.teeth.forEach((t, c) => {
      const tooth = this.tooth(t);
      if (!tooth || this.isAbsent(t)) return;
      const pts = siteDisplayOrder(t).map((i, j) => {
        const rec = tooth.rec[face][i];
        const pd = tooth.pd[face][i];
        return { x: c * COL + 9 + j * 18, rec: rec ?? 0, pd, hasAny: rec !== null || pd !== null };
      });
      if (!pts.some((p) => p.hasAny)) return;
      const margin = pts.map((p) => `${p.x},${y(p.rec)}`).join(' ');
      const withPd = pts.filter((p) => p.pd !== null);
      const bottom = withPd.map((p) => `${p.x},${y(p.rec + (p.pd ?? 0))}`).join(' ');
      const pocket = withPd.length
        ? [...withPd.map((p) => `${p.x},${y(p.rec)}`), ...withPd.slice().reverse().map((p) => `${p.x},${y(p.rec + (p.pd ?? 0))}`)].join(' ')
        : '';
      const deep = withPd.filter((p) => (p.pd ?? 0) >= 4).map((p) => ({ x: p.x, y: y(p.rec + (p.pd ?? 0)) }));
      out.push({ tooth: t, margin, bottom, pocket, deep });
    });
    return out;
  }

  tone(v: number | null, warn: number, bad: number) {
    if (v === null) return null;
    return v >= bad ? 'bad' : v >= warn ? 'warn' : 'ok';
  }

  pct(v: number | null) {
    return v === null ? '—' : `${v} %`;
  }

  mm(v: number | null) {
    return v === null ? '—' : `${v} mm`;
  }

  /** Resume el periodontograma en los campos de «Periodonto» (los que imprime el PDF y ve el resto del equipo). */
  applySummary() {
    const s = this.stats();
    const p = this.data().periodontal;
    const next: Partial<Record<keyof DentistryContent['periodontal'], string>> = {};
    if (s.bopPct !== null) next.bleeding = s.bopPct === 0 ? 'No' : s.bopPct < 30 ? 'Localizado' : 'Generalizado';
    if (s.meanPd !== null) {
      next.probingDepth = [
        `PS media ${s.meanPd} mm`,
        `${s.sites4} sitios ≥ 4 mm${s.teethPd4.length ? ` (${s.teethPd4.join(', ')})` : ''}`,
        s.sites6 ? `${s.sites6} sitios ≥ 6 mm` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    }
    if (s.recessions.length) next.recessions = s.recessions.map((r) => `${r.tooth} (${r.mm} mm)`).join(', ');
    if (s.mobility.length) next.mobility = s.mobility.map((m) => `${m.tooth} (grado ${m.grade})`).join(', ');
    if (s.furcations.length) next.furcations = s.furcations.map((f) => `${f.tooth} (grado ${furcationLabel(f.grade)})`).join(', ');
    next.indices = [
      s.bopPct !== null ? `Sangrado al sondaje ${s.bopPct} %` : '',
      s.plaquePct !== null ? `Placa ${s.plaquePct} %` : '',
      s.meanCal !== null ? `NIC medio ${s.meanCal} mm` : '',
      s.suppuration.length ? `Supuración en ${s.suppuration.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const entries = Object.entries(next).filter(([, v]) => v) as Array<[keyof DentistryContent['periodontal'], string]>;
    const overwritten = entries.filter(([k, v]) => p[k]?.trim() && p[k].trim() !== v);
    if (overwritten.length && !confirm(`Se reemplazará lo escrito en ${overwritten.length} campo(s) de «Periodonto» con el resumen del periodontograma. ¿Continuar?`)) {
      return;
    }
    for (const [k, v] of entries) p[k] = v;
    this.commit();
  }

  clearAll() {
    if (!confirm('¿Borrar todos los valores del periodontograma de esta historia?')) return;
    this.data().periodontogram.teeth = {};
    this.commit();
  }

  private commit() {
    this.data().periodontogram.updatedAt = new Date().toISOString();
    this.tick.update((t) => t + 1);
    this.changed.emit();
  }
}
