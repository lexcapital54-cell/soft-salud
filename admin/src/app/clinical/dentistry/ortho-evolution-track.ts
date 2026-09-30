import { Component, computed, input, signal } from '@angular/core';
import type { OrthoControlRow, OrthoTimeline } from './ortho-controls';
import type { OrthoAgendaRow } from './ortho-follow.data';
import { EVENT_COLOR, PAIN_COLOR, RATING_COLOR, colorOf, AGENDA_TYPES, evolutionTrack, fmtDay, parseDurationMonths } from './ortho-follow.models';

const W = 900;
const PAD = 30;

/** Línea de tiempo del tratamiento: controles firmados, controles programados y semáforo de higiene. */
@Component({
  selector: 'app-ortho-evolution-track',
  template: `
    @if (track(); as t) {
      <div class="ev">
        <div class="ev-head">
          <span class="ev-lbl">Inicio {{ fmt(t.start) }}</span>
          @if (t.progress !== null) {
            <span class="ev-prog"><i [style.width.%]="t.progress"></i></span>
            <span class="ev-lbl"><b>{{ t.progress }} %</b> de la duración estimada</span>
          }
          <span class="ev-lbl">{{ t.points.length }} controles · {{ emergencies() }} emergencias</span>
        </div>
        <svg [attr.viewBox]="'0 0 ' + w + ' 96'" class="ev-svg" role="img" aria-label="Línea de tiempo del tratamiento">
          <line [attr.x1]="pad" [attr.x2]="w - pad" y1="44" y2="44" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round" />
          @if (t.todayX !== null) {
            <line [attr.x1]="pad" [attr.x2]="px(t.todayX)" y1="44" y2="44" stroke="#12609a" stroke-width="4" stroke-linecap="round" opacity=".35" />
            <line [attr.x1]="px(t.todayX)" [attr.x2]="px(t.todayX)" y1="18" y2="70" stroke="#123b60" stroke-dasharray="3 3" />
            <text [attr.x]="px(t.todayX)" y="12" text-anchor="middle" class="ev-today">Hoy</text>
          }
          @for (m of t.months; track m.label) {
            <line [attr.x1]="px(m.x)" [attr.x2]="px(m.x)" y1="50" y2="56" stroke="#94a3b8" />
            <text [attr.x]="px(m.x)" y="68" text-anchor="middle" class="ev-month">{{ m.label }}</text>
          }
          @for (p of t.planned; track p.row.id) {
            <g class="ev-dot" (click)="pickPlanned(p.row)">
              <title>{{ fmt(p.row.date) }} · {{ p.row.type || 'Control' }} ({{ p.row.status }})</title>
              <circle [attr.cx]="px(p.x)" cy="44" r="7" fill="#fff" [attr.stroke]="typeColor(p.row.type)" stroke-width="2.5" stroke-dasharray="3 2" />
            </g>
          }
          @for (p of t.points; track p.row.id; let i = $index) {
            <g class="ev-dot" (click)="pick(p.row)" [class.sel]="selected()?.id === p.row.id">
              <title>{{ fmt(p.day) }} · {{ p.row.event }}</title>
              @if (p.row.emergency) {
                <circle [attr.cx]="px(p.x)" cy="44" r="12" fill="none" stroke="#dc2626" stroke-width="2" />
              }
              <circle [attr.cx]="px(p.x)" cy="44" [attr.r]="selected()?.id === p.row.id ? 9 : 7" [attr.fill]="eventColor(p.row.eventCode)" stroke="#fff" stroke-width="2" />
              @if (p.row.pain && p.row.pain !== 'Sin dolor') {
                <circle [attr.cx]="px(p.x) + 7" cy="34" r="3.5" [attr.fill]="painColor(p.row.pain)" />
              }
              @if (p.week) {
                <text [attr.x]="px(p.x)" [attr.y]="i % 2 ? 88 : 28" text-anchor="middle" class="ev-week">S{{ p.week }}</text>
              }
            </g>
          }
        </svg>
        <div class="ev-legend">
          <span><i style="background:#16a34a"></i>Instalación</span>
          <span><i style="background:#12609a"></i>Control</span>
          <span><i style="background:#7c3aed"></i>Retiro</span>
          <span><i style="background:#0d9488"></i>Retención</span>
          <span><i class="ring"></i>Emergencia</span>
          <span><i class="hollow"></i>Programado</span>
          <span class="ev-lbl">· S = semana de tratamiento. Toque un punto para ver el detalle.</span>
        </div>

        @if (selected(); as r) {
          <div class="ev-card">
            <p class="ev-card-h">
              <b>{{ fmt(r.date) }}</b> · {{ r.event }} · {{ r.professional || '—' }}
              <button type="button" class="ev-x" (click)="selected.set(null)" aria-label="Cerrar">×</button>
            </p>
            <div class="ev-grid">
              @for (f of detail(r); track f[0]) {
                <span><small>{{ f[0] }}</small>{{ f[1] }}</span>
              }
            </div>
          </div>
        }
        @if (plannedSel(); as p) {
          <div class="ev-card planned">
            <p class="ev-card-h">
              <b>{{ fmt(p.date) }} {{ p.time }}</b> · {{ p.type || 'Control' }} · {{ p.status }}
              <button type="button" class="ev-x" (click)="plannedSel.set(null)" aria-label="Cerrar">×</button>
            </p>
            @if (p.professional || p.notes) {
              <p class="ev-lbl">{{ p.professional }} {{ p.notes ? '· ' + p.notes : '' }}</p>
            }
          </div>
        }

        @if (t.points.length) {
          <div class="ev-lights">
            @for (lane of lanes; track lane.key) {
              <div class="ev-lane">
                <span class="ev-lane-l">{{ lane.label }}</span>
                @for (p of t.points; track p.row.id) {
                  <button
                    type="button"
                    class="ev-cell"
                    [style.background]="cellColor(lane.key, p.row)"
                    [title]="fmt(p.day) + ' · ' + (p.row[lane.key] || 'Sin registro')"
                    (click)="pick(p.row)"
                  ></button>
                }
              </div>
            }
          </div>
        }
      </div>
    } @else {
      <p class="ev-lbl">La línea de tiempo aparece con la instalación o el primer control firmado.</p>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .ev { display: grid; gap: 8px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
    .ev-head { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .ev-lbl { font-size: 12px; color: #475569; }
    .ev-prog { flex: 0 1 180px; height: 8px; border-radius: 99px; background: #e2e8f0; overflow: hidden; }
    .ev-prog i { display: block; height: 100%; background: linear-gradient(90deg, #12609a, #16a34a); }
    .ev-svg { width: 100%; height: auto; overflow: visible; }
    .ev-dot { cursor: pointer; }
    .ev-dot:hover circle { filter: brightness(1.15); }
    .ev-today { font-size: 10px; fill: #123b60; font-weight: 700; }
    .ev-month { font-size: 10px; fill: #64748b; }
    .ev-week { font-size: 9px; fill: #334155; font-weight: 600; }
    .ev-legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: #475569; align-items: center; }
    .ev-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: -1px; }
    .ev-legend i.ring { border: 2px solid #dc2626; width: 8px; height: 8px; }
    .ev-legend i.hollow { border: 2px dashed #12609a; width: 8px; height: 8px; }
    .ev-card { border: 1px solid #bfdbfe; background: #f8fbff; border-radius: 12px; padding: 8px 12px; }
    .ev-card.planned { border-style: dashed; }
    .ev-card-h { margin: 0 0 6px; font-size: 13px; color: #123b60; display: flex; gap: 6px; align-items: center; }
    .ev-x { margin-left: auto; border: 0; background: none; font-size: 18px; color: #64748b; cursor: pointer; }
    .ev-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 6px 12px; }
    .ev-grid span { display: grid; font-size: 12px; color: #1e293b; }
    .ev-grid small { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
    .ev-lights { display: grid; gap: 4px; overflow-x: auto; }
    .ev-lane { display: flex; gap: 3px; align-items: center; }
    .ev-lane-l { flex: 0 0 90px; font-size: 11px; color: #475569; }
    .ev-cell { flex: 0 0 18px; height: 14px; border: 0; border-radius: 4px; cursor: pointer; }
  `,
})
export class OrthoEvolutionTrack {
  readonly timeline = input.required<OrthoTimeline>();
  readonly estimatedDuration = input('');
  readonly planned = input<OrthoAgendaRow[]>([]);

  readonly w = W;
  readonly pad = PAD;
  readonly selected = signal<OrthoControlRow | null>(null);
  readonly plannedSel = signal<OrthoAgendaRow | null>(null);
  readonly lanes: Array<{ key: 'hygiene' | 'cooperation' | 'pain'; label: string }> = [
    { key: 'hygiene', label: 'Higiene' },
    { key: 'cooperation', label: 'Colaboración' },
    { key: 'pain', label: 'Dolor' },
  ];

  readonly track = computed(() => {
    const t = this.timeline();
    return evolutionTrack(t.rows, t.installedAt ? t.installedAt.slice(0, 10) : null, parseDurationMonths(this.estimatedDuration()), this.planned());
  });

  px(x: number) {
    return PAD + x * (W - PAD * 2);
  }

  fmt(v: string) {
    return fmtDay(v);
  }

  eventColor(code: string) {
    return EVENT_COLOR[code] ?? '#12609a';
  }

  typeColor(type: string) {
    return colorOf(AGENDA_TYPES, type);
  }

  painColor(v: string) {
    return PAIN_COLOR[v] ?? '#94a3b8';
  }

  cellColor(key: 'hygiene' | 'cooperation' | 'pain', r: OrthoControlRow) {
    const v = r[key];
    if (!v) return '#e2e8f0';
    return (key === 'pain' ? PAIN_COLOR[v] : RATING_COLOR[v]) ?? '#94a3b8';
  }

  emergencies() {
    return this.timeline().rows.filter((r) => r.emergency).length;
  }

  pick(r: OrthoControlRow) {
    this.plannedSel.set(null);
    this.selected.set(this.selected()?.id === r.id ? null : r);
  }

  pickPlanned(r: OrthoAgendaRow) {
    this.selected.set(null);
    this.plannedSel.set(r);
  }

  detail(r: OrthoControlRow): Array<[string, string]> {
    const fields: Array<[string, string]> = [
      ['Fase', r.phase],
      ['Arcos', r.arches],
      ['Elásticos', r.elastics],
      ['Ligaduras', r.ligatures],
      ['Brackets', r.brackets],
      ['IPR', r.ipr],
      ['Reparaciones', r.repairs],
      ['Higiene', r.hygiene],
      ['Colaboración', r.cooperation],
      ['Dolor', r.pain],
      ['Emergencia', r.emergency],
      ['Próxima cita', fmtDay(r.nextAppointment)],
      ['CUPS', r.cups],
    ];
    const filled = fields.filter(([, v]) => v);
    return filled.length ? filled : [['Registro', 'Control sin datos estructurados']];
  }
}
