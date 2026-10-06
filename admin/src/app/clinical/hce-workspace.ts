import { Component, OnDestroy, OnInit, QueryList, ViewChildren, computed, inject, linkedSignal, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../auth.service';
import { WEBSITE_URL } from '../api.config';
import { clinicLogoUrl } from '../clinic-logo';
import { ClinicalHistory } from './clinical-history';
import { ClinicSwitcher } from '../clinic-switcher';
import { PhysioSidebar } from './physio/premium/physio-sidebar';
import { HceWorkspaceService } from './hce-workspace.service';
import { OpenEncountersAlert } from './open-encounters-alert';
import { VoiceDictationService } from './voice-dictation.service';
import { ClinicalTextToSpeechService } from './clinical-text-to-speech.service';

@Component({
  selector: 'app-hce-workspace',
  imports: [ClinicalHistory, OpenEncountersAlert, ClinicSwitcher, PhysioSidebar],
  templateUrl: './hce-workspace.html',
  styleUrl: './hce-workspace.scss',
})
export class HceWorkspace implements OnInit, OnDestroy {
  private readonly workspace = inject(HceWorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly voice = inject(VoiceDictationService);
  private readonly textToSpeech = inject(ClinicalTextToSpeechService);
  private sub?: Subscription;

  @ViewChildren(ClinicalHistory)
  private histories!: QueryList<ClinicalHistory>;

  readonly websiteUrl = WEBSITE_URL;
  readonly user = this.auth.user;
  readonly logoFailed = linkedSignal({ source: () => this.user()?.clinicId, computation: () => false });
  readonly clinicLogo = computed(() =>
    this.logoFailed() ? null : clinicLogoUrl(this.user()?.clinicId, 'hc'),
  );
  readonly canWrite = this.auth.canWriteClinical;
  readonly premium = computed(() => {
    const specialty = String(this.user()?.specialty || '').toUpperCase();
    if (specialty === 'PHYSIOTHERAPY') return 'physio';
    if (specialty === 'PSYCHOLOGY') return 'psych';
    if (specialty === 'DENTISTRY' || specialty === 'ORTHODONTICS') return 'dental';
    if (specialty === 'MEDICINE' || specialty === 'AESTHETIC') return 'general';
    return null;
  });
  readonly sidebar = computed(() => {
    const specialty = String(this.user()?.specialty || '').toUpperCase();
    switch (specialty) {
      case 'PSYCHOLOGY':
        return { label: 'Psicología', history: 'Historia de psicología', evolution: 'evoluciones-section', tagline: ['Escucha', 'Acompañamiento', 'Bienestar'] };
      case 'DENTISTRY':
        return { label: 'Odontología', history: 'Historia odontológica', evolution: 'odo-evoluciones-en-formulario', tagline: ['Prevención', 'Tratamiento', 'Sonrisa'] };
      case 'ORTHODONTICS':
        return { label: 'Ortodoncia', history: 'Historia de ortodoncia', evolution: 'odo-evoluciones-en-formulario', tagline: ['Función', 'Estética', 'Estabilidad'] };
      case 'MEDICINE':
        return { label: 'Medicina', history: 'Historia clínica', evolution: 'evoluciones-section', tagline: ['Prevención', 'Diagnóstico', 'Cuidado'] };
      case 'AESTHETIC':
        return { label: 'Medicina estética', history: 'Historia clínica', evolution: 'evoluciones-section', tagline: ['Armonía', 'Cuidado', 'Bienestar'] };
      default:
        return null;
    }
  });
  readonly tabs = this.workspace.tabs;
  readonly activeKey = this.workspace.activeKey;
  bulkSaveMessage = '';

  ngOnInit() {
    this.sub = this.route.queryParamMap.subscribe((params) => {
      const encounterId = params.get('encounterId');
      const patientId = params.get('patientId');
      const sessionAt = params.get('fechaSesion');
      if (patientId && sessionAt) this.workspace.requestSessionDate(patientId, sessionAt);
      if (encounterId) {
        this.workspace.openEncounter(encounterId, patientId);
      } else if (patientId) {
        this.workspace.openPatient(patientId);
      } else {
        this.workspace.ensureBlankTab();
      }
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.voice.stop();
    this.textToSpeech.stop();
  }

  activate(key: string) {
    if (key === this.activeKey()) return;
    this.voice.stop();
    this.textToSpeech.stop();
    this.workspace.activate(key);
  }

  openBlank() {
    this.voice.stop();
    this.textToSpeech.stop();
    this.workspace.openBlank();
  }

  /** Guarda borrador de todas las pestañas con atención abierta (sin exigir cerrar ninguna). */
  saveAllOpenDrafts() {
    this.bulkSaveMessage = '';
    let started = 0;
    for (const h of this.histories?.toArray() || []) {
      if (h.persistOpenDraft()) started += 1;
    }
    this.bulkSaveMessage =
      started > 0
        ? `Guardando ${started} historia${started === 1 ? '' : 's'} abierta${started === 1 ? '' : 's'} en la base de datos…`
        : 'No hay historias editables para guardar (abra un paciente o una atención).';
    window.setTimeout(() => {
      this.bulkSaveMessage = '';
    }, 4000);
  }

  closeTab(key: string, event: Event) {
    event.stopPropagation();
    this.voice.stop();
    this.textToSpeech.stop();
    this.workspace.close(key);
  }

  onLabel(key: string, label: string) {
    this.workspace.setLabel(key, label);
  }

  onPatientBound(key: string, payload: { patientId: string; label: string }) {
    this.workspace.bindPatient(key, payload.patientId, payload.label);
  }

  onOpenPatientTab(payload: { patientId: string; label?: string }) {
    this.voice.stop();
    this.textToSpeech.stop();
    this.workspace.openPatient(payload.patientId, payload.label);
  }

  goHome() {
    this.auth.goToWebsite();
  }

  logout() {
    this.auth.logoutToClinicLogin();
  }

  onClinicSwitched() {
    // Limpia pestañas del workspace anterior y recarga con la nueva sede.
    window.location.reload();
  }
}
