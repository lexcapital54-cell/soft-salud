import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { OrthoHistoryEntry } from './ortho-controls';

const ACTION_STYLE: Record<string, { color: string; icon: string }> = {
  Crear: { color: '#16a34a', icon: '+' },
  Editar: { color: '#12609a', icon: '✎' },
  Eliminar: { color: '#dc2626', icon: '−' },
  Firmar: { color: '#7c3aed', icon: '✍' },
  Cerrar: { color: '#334155', icon: '■' },
  Corregir: { color: '#ea580c', icon: '↺' },
  Anexar: { color: '#0891b2', icon: '📎' },
};

const SOURCE_LABEL: Record<string, string> = {
  HISTORIA: 'Historia clínica',
  SEGUIMIENTO: 'Seguimiento',
  CONTROL: 'Control firmado',
  FIRMA: 'Firma',
  CONSENTIMIENTO: 'Consentimiento',
};

interface Row {
  key: string;
  at: string;
  user: string;
  source: string;
  module: string;
  action: string;
  label: string;
  from: string;
  to: string;
}

/** Trazabilidad del caso: quién, cuándo, módulo, acción y valor anterior / nuevo. */
@Component({
  selector: 'app-ortho-audit-timeline',
  imports: [FormsModule],
  template: `
    <div class="au">
      <div class="au-filters">
        <input class="au-q" [ngModel]="q()" (ngModelChange)="q.set($event)" placeholder="Buscar por usuario, campo o valor…" />
        <div class="au-chips">
          <button type="button" [class.on]="!mod()" (click)="mod.set('')">Todos · {{ rows().length }}</button>
          @for (m of modules(); track m.name) {
            <button type="button" [class.on]="mod() === m.name" (click)="mod.set(mod() === m.name ? '' : m.name)">{{ m.name }} · {{ m.count }}</button>
          }
        </div>
        <div class="au-chips">
          @for (a of actions(); track a.name) {
            <button type="button" class="act" [style.--c]="style(a.name).color" [class.on]="act() === a.name" (click)="act.set(act() === a.name ? '' : a.name)">
              {{ style(a.name).icon }} {{ a.name }} · {{ a.count }}
            </button>
          }
        </div>
      </div>
      @if (filtered().length) {
        <ol class="au-list">
          @for (r of filtered(); track r.key) {
            <li [style.--c]="style(r.action).color">
              <span class="au-dot">{{ style(r.action).icon }}</span>
              <div class="au-body">
                <p class="au-h">
                  <b>{{ r.label }}</b>
                  <span class="au-tag">{{ r.module }}</span>
                  <span class="au-act">{{ r.action }}</span>
                </p>
                @if (r.from || (r.to && r.to !== r.label)) {
                  <p class="au-diff">
                    @if (r.from) {
                      <del>{{ r.from }}</del> →
                    }
                    <ins>{{ r.to || '(vacío)' }}</ins>
                  </p>
                }
                <small>{{ when(r.at) }} · {{ r.user }} · {{ sourceLabel(r.source) }}</small>
              </div>
            </li>
          }
        </ol>
        @if (filtered().length < total()) {
          <button type="button" class="au-more" (click)="limit.set(limit() + 50)">Ver más ({{ total() - filtered().length }})</button>
        }
      } @else {
        <p class="au-empty">Sin registros con estos filtros.</p>
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .au { display: grid; gap: 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
    .au-filters { display: grid; gap: 6px; }
    .au-q { max-width: 360px; }
    .au-chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .au-chips button { border: 1px solid #cbd5e1; background: #fff; color: #334155; border-radius: 99px; padding: 2px 10px; font-size: 11px; cursor: pointer; }
    .au-chips button.on { background: #123b60; border-color: #123b60; color: #fff; }
    .au-chips button.act { --c: #12609a; border-color: var(--c); color: var(--c); }
    .au-chips button.act.on { background: var(--c); color: #fff; }
    .au-list { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid #e2e8f0; display: grid; gap: 10px; }
    .au-list li { --c: #12609a; position: relative; display: flex; gap: 10px; }
    .au-dot { position: absolute; left: -27px; top: 0; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #fff; font-size: 11px; }
    .au-body { display: grid; gap: 2px; min-width: 0; padding-left: 4px; }
    .au-h { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 13px; color: #1e293b; }
    .au-tag { font-size: 10px; padding: 1px 7px; border-radius: 99px; background: #f1f5f9; color: #475569; }
    .au-act { font-size: 10px; padding: 1px 7px; border-radius: 99px; border: 1px solid var(--c); color: var(--c); }
    .au-diff { margin: 0; font-size: 12px; color: #334155; overflow-wrap: anywhere; }
    .au-diff del { color: #b91c1c; background: #fef2f2; }
    .au-diff ins { color: #15803d; background: #f0fdf4; text-decoration: none; }
    .au-body small { font-size: 11px; color: #64748b; }
    .au-more { justify-self: start; border: 0; background: none; color: #12609a; text-decoration: underline; font-size: 12px; cursor: pointer; }
    .au-empty { margin: 0; font-size: 12px; color: #64748b; }
  `,
})
export class OrthoAuditTimeline {
  readonly entries = input.required<OrthoHistoryEntry[]>();

  readonly q = signal('');
  readonly mod = signal('');
  readonly act = signal('');
  readonly limit = signal(50);

  readonly rows = computed<Row[]>(() =>
    this.entries().flatMap((e, i) =>
      e.changes.map((c, j) => ({
        key: `${i}-${j}`,
        at: e.at,
        user: e.userName,
        source: e.source,
        module: c.module || (e.source === 'CONTROL' ? 'Evolución' : 'Plan'),
        action: c.action || 'Editar',
        label: c.label,
        from: c.from,
        to: c.to,
      })),
    ),
  );

  readonly modules = computed(() => this.count((r) => r.module));
  readonly actions = computed(() => this.count((r) => r.action));

  private readonly matching = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.rows().filter(
      (r) =>
        (!this.mod() || r.module === this.mod()) &&
        (!this.act() || r.action === this.act()) &&
        (!q || `${r.user} ${r.label} ${r.from} ${r.to} ${r.module}`.toLowerCase().includes(q)),
    );
  });

  readonly total = computed(() => this.matching().length);
  readonly filtered = computed(() => this.matching().slice(0, this.limit()));

  private count(key: (r: Row) => string) {
    const m = new Map<string, number>();
    for (const r of this.rows()) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }

  style(action: string) {
    return ACTION_STYLE[action] ?? ACTION_STYLE['Editar'];
  }

  sourceLabel(s: string) {
    return SOURCE_LABEL[s] ?? s;
  }

  when(iso: string) {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
