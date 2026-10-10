import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicalApiService } from '../../clinical-api.service';
import { ClinicalContent, ClinicalEvolution, DiagnosisRow, Encounter, Patient } from '../../clinical.models';
import { PhysioIcon } from '../../physio/physio-icons';
import { PhysioEvolutionTimeline } from '../../physio/premium/physio-evolution-timeline';
import { PhysioInterventionsTable } from '../../physio/premium/physio-interventions-table';
import { PhysioMetricCard } from '../../physio/premium/physio-metric-card';
import { PhysioNextSession } from '../../physio/premium/physio-next-session';
import { PhysioPatientCard } from '../../physio/premium/physio-patient-card';
import { PhysioSectionCard } from '../../physio/premium/physio-section-card';
import {
  FunctionalMetric,
  evolutionEntries,
  formatDate,
  objectiveGroups,
} from '../../physio/premium/physio-premium.models';
import {
  cieRows,
  mentalExam,
  psychAntecedentRows,
  psychPlanProgress,
  psychPlanRows,
  psychPlanSummary,
  riskAlert,
  soapRows,
} from './psych-premium.models';

const COLLAPSE_KEY = 'hce.ps.dashboard.collapsed';

export type GeneralDashboardVariant = 'PSYCHOLOGY' | 'MEDICINE' | 'AESTHETIC';

const VARIANTS: Record<GeneralDashboardVariant, { title: string; subtitle: string; label: string; tags: string; file: string; showPlan: boolean }> = {
  PSYCHOLOGY: {
    title: 'de psicología',
    subtitle: 'Acompañamiento psicológico para el bienestar emocional',
    label: 'Psicología',
    tags: 'Escucha · Acompañamiento · Bienestar',
    file: 'psicologia',
    showPlan: true,
  },
  MEDICINE: {
    title: 'de medicina',
    subtitle: 'Atención médica integral centrada en el paciente',
    label: 'Medicina',
    tags: 'Prevención · Diagnóstico · Cuidado',
    file: 'medicina',
    showPlan: false,
  },
  AESTHETIC: {
    title: 'de medicina estética',
    subtitle: 'Cuidado estético con criterio médico',
    label: 'Medicina estética',
    tags: 'Armonía · Cuidado · Bienestar',
    file: 'medicina-estetica',
    showPlan: false,
  },
};

/**
 * Tablero de la historia clínica general (psicología, medicina y medicina
 * estética comparten formulario). Solo lectura: lee los mismos datos del
 * formulario de abajo; cada «Editar» lleva a la sección donde se modifica.
 */
@Component({
  selector: 'app-psych-dashboard',
  imports: [
    NgTemplateOutlet,
    PhysioIcon,
    PhysioSectionCard,
    PhysioMetricCard,
    PhysioPatientCard,
    PhysioNextSession,
    PhysioEvolutionTimeline,
    PhysioInterventionsTable,
    RouterLink,
  ],
  templateUrl: './psych-dashboard.html',
  styleUrls: ['../../physio/premium/physio-dashboard.scss', './psych-dashboard.scss'],
  host: { '[class.theme-petrol]': "variant() !== 'PSYCHOLOGY'", '[class.theme-aesthetic]': "variant() === 'AESTHETIC'" },
})
export class PsychDashboard {
  private readonly api = inject(ClinicalApiService);

  readonly variant = input<GeneralDashboardVariant>('PSYCHOLOGY');
  readonly cfg = computed(() => VARIANTS[this.variant()]);
  readonly patient = input<Partial<Patient> | null>(null);
  readonly photo = input<string | null>(null);
  readonly encounter = input<Encounter | null>(null);
  readonly content = input.required<ClinicalContent>();
  readonly evolutions = input<ClinicalEvolution[]>([]);
  readonly diagnoses = input<DiagnosisRow[]>([]);
  readonly soap = input(false);
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
  motive() {
    return (this.content().careMinimum?.motive || '').trim();
  }
  presentIllness() {
    return (this.content().careMinimum?.presentIllness || '').trim();
  }
  psychosocial() {
    return (this.content().careMinimum?.systemsReview || '').trim();
  }
  attentionDate() {
    return formatDate(this.encounter()?.startedAt || this.encounter()?.createdAt || '');
  }
  modality() {
    const m = this.encounter()?.modality;
    return m === 'VIRTUAL' ? 'Virtual' : m === 'IN_PERSON' ? 'Presencial' : '';
  }
  antecedents() {
    return psychAntecedentRows(this.content(), this.patient());
  }
  risk() {
    return riskAlert(this.content());
  }
  mental() {
    return mentalExam(this.content());
  }
  soapNote() {
    return soapRows(this.content());
  }
  impression() {
    return {
      narrative: (this.content().assessment?.impressionNarrative || '').trim(),
      cie: cieRows(this.diagnoses()),
    };
  }
  plan() {
    return psychPlanSummary(this.content().psychology);
  }
  objectives() {
    return objectiveGroups(this.plan().objectives);
  }
  planRows() {
    return psychPlanRows(this.content().psychology);
  }
  progress() {
    return psychPlanProgress(this.content().psychology);
  }
  entries() {
    return evolutionEntries(this.evolutions());
  }
  metrics(): FunctionalMetric[] {
    const entries = this.entries();
    const pr = this.progress();
    const cie = this.impression().cie.length;
    const pct = pr.count ? Math.round((pr.done / pr.count) * 100) : null;
    const all: FunctionalMetric[] = [
      {
        key: 'controls',
        label: 'Controles registrados',
        icon: 'message',
        value: String(entries.length),
        unit: '',
        detail: entries[0] ? `Último: ${formatDate(entries[0].date)}` : 'Sin controles aún',
        chip: null,
        go: this.locked() ? 'evoluciones-section' : 'hce-section-3',
      },
      {
        key: 'procedures',
        label: 'Procedimientos del plan',
        icon: 'plan',
        value: pr.count ? String(pr.count) : null,
        unit: '',
        detail: pr.count ? `${pr.sessions} sesiones en el plan` : '',
        chip: null,
        go: 'ps-plan-valores',
        pending: 'Sin plan registrado',
      },
      {
        key: 'progress',
        label: 'Avance del plan',
        icon: 'chart',
        value: pct === null ? null : String(pct),
        unit: pct === null ? '' : '%',
        detail: pr.count ? `${pr.done} de ${pr.count} terminados` : '',
        chip: pct === null ? null : pct >= 100 ? { text: 'Completo', tone: 'ok' } : pct > 0 ? { text: 'En curso', tone: 'mild' } : { text: 'Por iniciar', tone: 'neutral' },
        go: 'ps-plan-valores',
        pending: 'Sin plan registrado',
      },
      {
        key: 'cie',
        label: 'Diagnósticos CIE-10',
        icon: 'diagnosis',
        value: cie ? String(cie) : null,
        unit: '',
        detail: '',
        chip: null,
        go: 'cie-section',
        pending: 'Sin diagnóstico',
      },
    ];
    return this.cfg().showPlan ? all : all.filter((m) => m.key === 'controls' || m.key === 'cie');
  }
  latestNote() {
    const last = this.entries()[0];
    if (last) return { title: `Último control · ${formatDate(last.date)}`, text: last.situation || last.note, author: last.professional };
    const imp = (this.content().assessment?.impressionNarrative || '').trim();
    if (imp) return { title: 'Impresión diagnóstica y tratamiento', text: imp, author: this.encounter()?.professional?.fullName || '' };
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
        a.download = `HC-${this.cfg().file}-${p?.documentNumber || enc.id}.pdf`;
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
