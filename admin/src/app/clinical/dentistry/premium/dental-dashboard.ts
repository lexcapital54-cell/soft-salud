import { DecimalPipe } from '@angular/common';
import { Component, inject, input, output, signal } from '@angular/core';
import { ClinicalApiService } from '../../clinical-api.service';
import { ClinicalContent, ClinicalEvolution, Encounter, Patient } from '../../clinical.models';
import { PhysioIcon } from '../../physio/physio-icons';
import { PhysioEvolutionTimeline } from '../../physio/premium/physio-evolution-timeline';
import { PhysioMetricCard } from '../../physio/premium/physio-metric-card';
import { PhysioNextSession } from '../../physio/premium/physio-next-session';
import { PhysioPatientCard } from '../../physio/premium/physio-patient-card';
import { PhysioSectionCard } from '../../physio/premium/physio-section-card';
import { FunctionalMetric, LabeledValue, evolutionEntries, formatDate } from '../../physio/premium/physio-premium.models';
import { dentalSummary } from '../dental-summary.models';
import { DentistryContent } from '../dentistry.models';

const COLLAPSE_KEY = 'hce.odo.dashboard.collapsed';

/**
 * Tablero de la historia odontológica / de ortodoncia (solo lectura). Lee los
 * mismos datos del formulario; cada «Editar» lleva a la sección donde se modifica.
 */
@Component({
  selector: 'app-dental-dashboard',
  imports: [DecimalPipe, PhysioIcon, PhysioSectionCard, PhysioMetricCard, PhysioPatientCard, PhysioNextSession, PhysioEvolutionTimeline],
  templateUrl: './dental-dashboard.html',
  styleUrls: ['../../physio/premium/physio-dashboard.scss', './dental-dashboard.scss'],
})
export class DentalDashboard {
  private readonly api = inject(ClinicalApiService);

  readonly patient = input<Partial<Patient> | null>(null);
  readonly photo = input<string | null>(null);
  readonly encounter = input<Encounter | null>(null);
  readonly content = input.required<ClinicalContent>();
  readonly dental = input.required<DentistryContent>();
  readonly evolutions = input<ClinicalEvolution[]>([]);
  /** Consultorio de ortodoncia (especialista). */
  readonly orthoClinic = input(false);
  /** La historia incluye el módulo de ortodoncia. */
  readonly showOrtho = input(false);
  readonly serviceLabel = input('');
  readonly canWrite = input(false);
  readonly formDisabled = input(false);
  readonly locked = input(false);
  readonly loading = input(false);
  readonly clinicName = input('');
  readonly clinicLogo = input<string | null>(null);

  readonly goto = output<string>();
  readonly newEvolution = output<void>();

  readonly collapsed = signal(localStorage.getItem(COLLAPSE_KEY) === '1');
  readonly downloading = signal(false);
  readonly downloadError = signal('');
  readonly logoFailed = signal(false);

  // El contenido clínico es un objeto mutable que el formulario edita en sitio:
  // estos valores se leen en cada render para reflejar lo que se va escribiendo.
  editable() {
    return this.canWrite() && !this.formDisabled();
  }
  label() {
    return this.orthoClinic() ? 'Ortodoncia' : 'Odontología';
  }
  motive() {
    return (this.content().careMinimum?.motive || '').trim();
  }
  currentIllness() {
    return (this.dental().currentIllness || '').trim();
  }
  attentionDate() {
    return formatDate(this.encounter()?.startedAt || this.encounter()?.createdAt || '');
  }
  modality() {
    const m = this.encounter()?.modality;
    return m === 'VIRTUAL' ? 'Virtual' : m === 'IN_PERSON' ? 'Presencial' : '';
  }
  summary() {
    return dentalSummary(this.dental());
  }
  dangerAlerts() {
    return this.summary().alerts.filter((a) => a.tone === 'danger');
  }
  diagnoses() {
    return (this.dental().diagnoses ?? [])
      .filter((d) => (d.cieCode || '').trim() || (d.description || '').trim())
      .map((d, i) => ({ code: d.cieCode.trim(), description: d.description.trim(), tooth: (d.tooth || '').trim(), main: i === 0 }));
  }
  ortho(): LabeledValue[] {
    const o = this.dental().orthodontics;
    if (!this.showOrtho() || !o) return [];
    return [
      { label: 'Diagnóstico', value: o.diagnosis },
      { label: 'Fase', value: o.phase },
      { label: 'Objetivos', value: o.objectives },
      { label: 'Aparatología', value: o.appliance },
      { label: 'Extracciones', value: o.extractions },
      { label: 'Duración estimada', value: o.estimatedDuration },
      { label: 'Retención', value: o.retention },
    ]
      .map((r) => ({ label: r.label, value: (r.value || '').trim() }))
      .filter((r) => r.value);
  }
  entries() {
    return evolutionEntries(this.evolutions());
  }
  metrics(): FunctionalMetric[] {
    const entries = this.entries();
    const plan = this.summary().plan;
    const dx = this.diagnoses().length;
    const pct = plan.count ? Math.round((plan.done / plan.count) * 100) : null;
    return [
      {
        key: 'controls',
        label: 'Evoluciones registradas',
        icon: 'message',
        value: String(entries.length),
        unit: '',
        detail: entries[0] ? `Última: ${formatDate(entries[0].date)}` : 'Sin evoluciones aún',
        chip: null,
        go: 'odo-evoluciones-en-formulario',
      },
      {
        key: 'procedures',
        label: 'Procedimientos del plan',
        icon: 'plan',
        value: plan.count ? String(plan.count) : null,
        unit: '',
        detail: '',
        chip: null,
        go: 'odo-plan',
        pending: 'Sin plan registrado',
      },
      {
        key: 'progress',
        label: 'Avance del plan',
        icon: 'chart',
        value: pct === null ? null : String(pct),
        unit: pct === null ? '' : '%',
        detail: plan.count ? `${plan.done} de ${plan.count} terminados` : '',
        chip: pct === null ? null : pct >= 100 ? { text: 'Completo', tone: 'ok' } : pct > 0 ? { text: 'En curso', tone: 'mild' } : { text: 'Por iniciar', tone: 'neutral' },
        go: 'odo-plan',
        pending: 'Sin plan registrado',
      },
      {
        key: 'dx',
        label: 'Diagnósticos',
        icon: 'diagnosis',
        value: dx ? String(dx) : null,
        unit: '',
        detail: '',
        chip: null,
        go: 'odo-diagnosticos',
        pending: 'Sin diagnóstico',
      },
    ];
  }
  latestNote() {
    const last = this.entries()[0];
    if (last) return { title: `Última evolución · ${formatDate(last.date)}`, text: last.situation || last.note, author: last.professional };
    return null;
  }
  patientQuery() {
    const p = this.patient();
    return (p?.documentNumber || [p?.firstName, p?.lastName].filter(Boolean).join(' ') || '').trim();
  }

  toggle() {
    const next = !this.collapsed();
    this.collapsed.set(next);
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
  }

  downloadPdf() {
    const enc = this.encounter();
    if (!enc || this.downloading()) return;
    this.downloading.set(true);
    this.downloadError.set('');
    this.api.downloadHcePdf(enc.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const p = this.patient();
        a.href = url;
        a.download = `HC-${this.orthoClinic() ? 'ortodoncia' : 'odontologia'}-${p?.documentNumber || enc.id}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.downloading.set(false);
      },
      error: (err) => {
        this.downloading.set(false);
        this.downloadError.set(err?.error?.message || 'No se pudo generar el PDF. Intente de nuevo.');
      },
    });
  }
}
