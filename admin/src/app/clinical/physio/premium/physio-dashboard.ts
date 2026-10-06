import { Component, inject, input, output, signal } from '@angular/core';
import { ClinicalApiService } from '../../clinical-api.service';
import { ClinicalContent, ClinicalEvolution, DiagnosisRow, Encounter, Patient } from '../../clinical.models';
import { PhysioIcon } from '../physio-icons';
import { PhysioEvolutionChart } from './physio-evolution-chart';
import { PhysioEvolutionTimeline } from './physio-evolution-timeline';
import { PhysioInterventionsTable } from './physio-interventions-table';
import { PhysioMetricCard } from './physio-metric-card';
import { PhysioNextSession } from './physio-next-session';
import { PhysioPatientCard } from './physio-patient-card';
import { PhysioSectionCard } from './physio-section-card';
import {
  antecedentRows,
  clinicalAlerts,
  evaluationRows,
  evolutionEntries,
  formatDate,
  functionalMetrics,
  hasImpression,
  impression,
  interventionRows,
  objectiveGroups,
  painSeries,
  planProgress,
  planSummary,
} from './physio-premium.models';

const COLLAPSE_KEY = 'hce.ft.dashboard.collapsed';

/**
 * Tablero de la historia de fisioterapia (solo lectura). Lee los mismos datos
 * del formulario de abajo; cada "Editar" lleva a la sección del formulario donde
 * se modifica, así que no hay una segunda forma de guardar.
 */
@Component({
  selector: 'app-physio-dashboard',
  imports: [
    PhysioIcon,
    PhysioSectionCard,
    PhysioMetricCard,
    PhysioPatientCard,
    PhysioNextSession,
    PhysioEvolutionChart,
    PhysioEvolutionTimeline,
    PhysioInterventionsTable,
  ],
  templateUrl: './physio-dashboard.html',
  styleUrl: './physio-dashboard.scss',
})
export class PhysioDashboard {
  private readonly api = inject(ClinicalApiService);

  readonly patient = input<Partial<Patient> | null>(null);
  readonly photo = input<string | null>(null);
  readonly encounter = input<Encounter | null>(null);
  readonly content = input.required<ClinicalContent>();
  readonly evolutions = input<ClinicalEvolution[]>([]);
  readonly diagnoses = input<DiagnosisRow[]>([]);
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
  ft() {
    const c = this.content();
    return c.physiotherapy!;
  }
  editable() {
    return this.canWrite() && !this.formDisabled();
  }
  motive() {
    return (this.content().careMinimum?.motive || '').trim();
  }
  presentIllness() {
    return (this.content().careMinimum?.presentIllness || '').trim();
  }
  assessmentDate() {
    return formatDate(this.ft().intake?.assessmentDate || this.encounter()?.startedAt || this.encounter()?.createdAt || '');
  }
  modality() {
    const m = this.encounter()?.modality;
    return m === 'VIRTUAL' ? 'Virtual' : m === 'IN_PERSON' ? 'Presencial' : '';
  }
  metrics() {
    return functionalMetrics(this.ft());
  }
  hasMetrics() {
    return this.metrics().some((m) => m.value !== null);
  }
  antecedents() {
    return antecedentRows(this.ft(), this.patient());
  }
  alerts() {
    return clinicalAlerts(this.ft());
  }
  evaluation() {
    return evaluationRows(this.ft(), this.content());
  }
  impression() {
    return impression(this.ft(), this.content(), this.diagnoses());
  }
  hasImpression() {
    return hasImpression(this.impression());
  }
  plan() {
    return planSummary(this.ft());
  }
  hasPlan() {
    const p = this.plan();
    return !!(p.steps.length || p.therapies.length || p.frequency || p.duration || p.sessions);
  }
  progress() {
    return planProgress(this.ft());
  }
  objectives() {
    return objectiveGroups(this.ft().treatmentObjectives);
  }
  interventions() {
    return interventionRows(this.ft());
  }
  entries() {
    return evolutionEntries(this.evolutions());
  }
  pain() {
    return painSeries(this.ft(), this.encounter()?.startedAt ?? null, this.entries());
  }
  latestNote() {
    const last = this.entries()[0];
    if (last) return { title: `Última evolución · ${formatDate(last.date)}`, text: last.situation || last.note, author: last.professional };
    const findings = (this.ft().findings || '').trim();
    if (findings) return { title: 'Hallazgos de la valoración', text: findings, author: this.encounter()?.professional?.fullName || '' };
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
        a.download = `HC-fisioterapia-${p?.documentNumber || enc.id}.pdf`;
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
