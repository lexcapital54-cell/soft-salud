import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DentistryContent } from './dentistry.models';
import { OrthoTimeline } from './ortho-controls';
import {
  ORTHO_CASE_STATUSES,
  ORTHO_TIMELINE_STAGES,
  ORTHO_TREATMENT_TYPES,
  OrthoCaseStatus,
  angleFromMolars,
  crowdingSeverity,
  midlineText,
  orthoCaseStatusLabel,
  orthoTimelineStage,
  overToneMm,
  suggestOrthoCaseStatus,
  treatmentProgress,
} from './ortho-case.models';

interface Card {
  label: string;
  value: string;
  tone: string;
  go: string;
}

/** Encabezado y tablero del caso de ortodoncia; lee la historia y el seguimiento sin duplicar datos. */
@Component({
  selector: 'app-ortho-case-dashboard',
  imports: [FormsModule, DatePipe],
  template: `
    @let oc = data().orthoCase;
    @let tl = timeline();
    @let st = statusInfo(oc.status);
    @let sug = suggested();
    <div class="oc">
      <div class="oc-head">
        <label class="oc-status" [style.--c]="st?.color || '#94a3b8'">
          <span>Estado del caso</span>
          <select [(ngModel)]="oc.status" (ngModelChange)="touch()" [disabled]="disabled()">
            <option value="">Sin definir</option>
            @for (s of statuses; track s.key) {
              <option [value]="s.key">{{ s.label }}</option>
            }
          </select>
        </label>
        @if (!disabled() && sug !== oc.status) {
          <button type="button" class="oc-suggest" (click)="applySuggested(sug)" title="Calculado con lo registrado (examen, diagnóstico, plan, instalación y retiro)">
            Sugerido: {{ statusLabel(sug) }} · aplicar
          </button>
        }
        <label>
          <span>Tipo de tratamiento</span>
          <select [(ngModel)]="oc.treatmentType" (ngModelChange)="touch()" [disabled]="disabled()">
            <option value="">Seleccione…</option>
            @for (t of treatmentTypes; track t) {
              <option [value]="t">{{ t }}</option>
            }
          </select>
        </label>
        <label>
          <span>Fecha de inicio</span>
          <input type="date" [(ngModel)]="oc.startDate" (ngModelChange)="touch()" [readonly]="disabled()" />
          @if (!oc.startDate && tl.installedAt) {
            <small>Instalación: {{ tl.installedAt | date: 'dd/MM/yyyy' }}</small>
          }
        </label>
        <label>
          <span>Ortodoncista</span>
          <input [(ngModel)]="oc.orthodontist" (ngModelChange)="touch()" [readonly]="disabled()" [placeholder]="professionalName()" />
        </label>
      </div>

      <ol class="oc-stages" aria-label="Línea de tiempo del tratamiento">
        @for (s of stages; track s; let i = $index) {
          <li [class.done]="i < stage()" [class.current]="i === stage()">
            <span>{{ i + 1 }}</span>{{ s }}
          </li>
        }
      </ol>

      <div class="oc-cards">
        @for (c of cards(); track c.label) {
          <button type="button" class="oc-card" [attr.data-tone]="c.tone" (click)="goto.emit(c.go)">
            <span>{{ c.label }}</span>
            <strong>{{ c.value || '—' }}</strong>
          </button>
        }
      </div>

      <div class="oc-track">
        <div class="oc-progress">
          <div class="oc-progress-head">
            <span>Progreso del tratamiento</span>
            <strong>
              @if (progress() !== null) {
                {{ progress() }} %
              } @else {
                —
              }
            </strong>
          </div>
          <div class="oc-bar"><span [style.width.%]="progress() ?? 0"></span></div>
          <small>
            {{ tl.months !== null ? tl.months + ' meses en tratamiento' : 'Sin instalación registrada' }}
            @if (data().orthodontics.estimatedDuration) {
              · estimado {{ data().orthodontics.estimatedDuration }}
            }
          </small>
        </div>
        <dl class="oc-facts">
          <div><dt>Última cita</dt><dd>{{ lastRow()?.date ? (lastRow()!.date | date: 'dd/MM/yyyy') : '—' }}</dd></div>
          <div><dt>Próxima cita</dt><dd>{{ nextAppointment() ? (nextAppointment() | date: 'dd/MM/yyyy') : '—' }}</dd></div>
          <div><dt>Última evolución</dt><dd>{{ lastVisit() || '—' }}</dd></div>
          <div><dt>Aparatología</dt><dd>{{ oc.treatmentType || data().orthodontics.appliance || '—' }}</dd></div>
          <div><dt>Arco actual</dt><dd>{{ currentArch() || '—' }}</dd></div>
          <div><dt>Elásticos</dt><dd>{{ currentElastics() || '—' }}</dd></div>
        </dl>
      </div>
    </div>
  `,
  styles: `
    .oc { display: grid; gap: 12px; padding: 14px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05); }
    .oc-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
    .oc-head label { display: grid; gap: 3px; font-size: 12px; color: #475569; min-width: 160px; }
    .oc-head label span { font-weight: 600; }
    .oc-head small { font-size: 11px; color: #64748b; }
    .oc-status select { border: 2px solid var(--c); border-radius: 99px; padding: 4px 10px; font-weight: 700; color: var(--c); background: #fff; }
    .oc-suggest { align-self: flex-end; border: 1px dashed #12609a; border-radius: 99px; background: #f4f8fb; color: #12609a; font-size: 12px; padding: 5px 10px; cursor: pointer; }
    .oc-stages { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; }
    .oc-stages li { position: relative; display: grid; justify-items: center; gap: 4px; font-size: 11px; color: #94a3b8; text-align: center; }
    .oc-stages li span { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: #e2e8f0; color: #475569; font-weight: 700; }
    .oc-stages li.done { color: #123b60; }
    .oc-stages li.done span { background: #12609a; color: #fff; }
    .oc-stages li.current { color: #16a34a; font-weight: 700; }
    .oc-stages li.current span { background: #16a34a; color: #fff; box-shadow: 0 0 0 4px #dcfce7; }
    @media (max-width: 800px) { .oc-stages { grid-template-columns: repeat(4, 1fr); } }
    .oc-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
    .oc-card { display: grid; gap: 2px; text-align: left; padding: 8px 10px; border: 1px solid #e2e8f0; border-left: 4px solid #cbd5e1; border-radius: 12px; background: #f4f8fb; cursor: pointer; }
    .oc-card span { font-size: 11px; color: #64748b; }
    .oc-card strong { font-size: 13px; color: #0f172a; }
    .oc-card[data-tone='ok'] { border-left-color: #16a34a; }
    .oc-card[data-tone='warn'] { border-left-color: #f59e0b; }
    .oc-card[data-tone='danger'] { border-left-color: #dc2626; }
    .oc-track { display: grid; grid-template-columns: minmax(220px, 1fr) 2fr; gap: 12px; }
    @media (max-width: 800px) { .oc-track { grid-template-columns: 1fr; } }
    .oc-progress { display: grid; gap: 4px; align-content: start; }
    .oc-progress-head { display: flex; justify-content: space-between; font-size: 12px; color: #334155; }
    .oc-progress small { font-size: 11px; color: #64748b; }
    .oc-bar { height: 10px; border-radius: 99px; background: #e2e8f0; overflow: hidden; }
    .oc-bar span { display: block; height: 100%; background: linear-gradient(90deg, #12609a, #16a34a); }
    .oc-facts { margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px 12px; }
    .oc-facts dt { font-size: 11px; color: #64748b; }
    .oc-facts dd { margin: 0; font-size: 13px; color: #0f172a; font-weight: 600; }
  `,
})
export class OrthoCaseDashboard {
  readonly data = input.required<DentistryContent>();
  readonly timeline = input.required<OrthoTimeline>();
  readonly disabled = input(false);
  readonly professionalName = input('');
  readonly lastVisit = input('');
  readonly changed = output<void>();
  readonly goto = output<string>();

  readonly statuses = ORTHO_CASE_STATUSES;
  readonly treatmentTypes = ORTHO_TREATMENT_TYPES;
  readonly stages = ORTHO_TIMELINE_STAGES;

  statusInfo(s: string) {
    return ORTHO_CASE_STATUSES.find((x) => x.key === s) || null;
  }

  statusLabel(s: string) {
    return orthoCaseStatusLabel(s);
  }

  lastRow(): { date: string } | null {
    return this.timeline().rows.at(0) ?? null;
  }

  currentArch() {
    return this.timeline().rows.find((r) => r.arches)?.arches || '';
  }

  currentElastics() {
    return this.timeline().rows.find((r) => r.elastics)?.elastics || '';
  }

  nextAppointment() {
    return this.timeline().rows.find((r) => r.nextAppointment)?.nextAppointment || '';
  }

  progress() {
    return treatmentProgress(this.timeline().months, this.data().orthodontics.estimatedDuration);
  }

  suggested(): Exclude<OrthoCaseStatus, ''> {
    const d = this.data();
    const o = d.orthodontics;
    const t = this.timeline();
    return suggestOrthoCaseStatus({
      installedAt: t.installedAt,
      debondedAt: t.debondedAt,
      closed: !!d.closure.closedAt,
      hasDiagnosis: !!o.diagnosis.trim() || d.diagnoses.some((x) => x.cieCode.trim()),
      hasPlan: !!(o.objectives.trim() || o.appliance || d.treatmentPlan.some((r) => r.description.trim())),
      hasExam: Object.values(o.intraoral).some((v) => String(v).trim()) || Object.values(o.facial).some((v) => String(v).trim()),
    });
  }

  stage() {
    return orthoTimelineStage(this.data().orthoCase.status || this.suggested(), this.timeline().rows.find((r) => r.phase)?.phase || '');
  }

  cards(): Card[] {
    const o = this.data().orthodontics;
    const i = o.intraoral;
    const up = crowdingSeverity(o.models.upperDiscrepancy);
    const lo = crowdingSeverity(o.models.lowerDiscrepancy);
    const pair = (r: string, l: string) => (r || l ? `D ${r || '—'} · I ${l || '—'}` : '');
    const molarTone = i.molarRight || i.molarLeft ? (i.molarRight === 'Clase I' && i.molarLeft === 'Clase I' ? 'ok' : 'warn') : '';
    const canineTone = i.canineRight || i.canineLeft ? (i.canineRight === 'Clase I' && i.canineLeft === 'Clase I' ? 'ok' : 'warn') : '';
    return [
      { label: 'Overjet', value: i.overjet ? `${i.overjet} mm` : '', tone: overToneMm(i.overjet), go: 'odo-ortodoncia' },
      { label: 'Overbite', value: i.overbite ? `${i.overbite} mm` : '', tone: overToneMm(i.overbite), go: 'odo-ortodoncia' },
      { label: 'Clase molar', value: pair(i.molarRight, i.molarLeft), tone: molarTone, go: 'odo-ortodoncia' },
      { label: 'Clase canina', value: pair(i.canineRight, i.canineLeft), tone: canineTone, go: 'odo-ortodoncia' },
      { label: 'Apiñamiento superior', value: up?.text || i.crowding, tone: up?.tone || '', go: 'odo-ortodoncia' },
      { label: 'Apiñamiento inferior', value: lo?.text || '', tone: lo?.tone || '', go: 'odo-ortodoncia' },
      { label: 'Línea media', value: midlineText(i.upperMidline, i.lowerMidline, i.dentalMidline), tone: '', go: 'odo-ortodoncia' },
      { label: 'Patrón facial', value: [o.facial.facialType, o.facial.profile].filter(Boolean).join(' · '), tone: '', go: 'odo-ortodoncia' },
      { label: 'Maloclusión (Angle)', value: angleFromMolars(i.molarRight, i.molarLeft), tone: molarTone, go: 'odo-ortodoncia' },
      { label: 'Clase esquelética', value: o.cephalometry.skeletalClass, tone: '', go: 'odo-ortodoncia' },
    ];
  }

  touch() {
    this.changed.emit();
  }

  applySuggested(s: Exclude<OrthoCaseStatus, ''>) {
    if (this.disabled()) return;
    this.data().orthoCase.status = s;
    this.touch();
  }
}
