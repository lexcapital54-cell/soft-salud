import { DatePipe, DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, firstValueFrom, of, switchMap } from 'rxjs';
import SignaturePad from 'signature_pad';
import { AuthService } from '../auth.service';
import { ClinicalApiService } from './clinical-api.service';
import { ConsentSigner } from './consent-signer';
import { DOCUMENT_TYPES } from './document-types';
import {
  CatalogCode,
  ClinicalAttachment,
  ClinicalContent,
  ClinicalNoteFormat,
  ConsentRow,
  DiagnosisRow,
  DivipolaDepartment,
  Encounter,
  EncounterListItem,
  Incapacity,
  Patient,
  ProcedureRow,
  SoapContent,
} from './clinical.models';

/** Residencia por defecto: el consultorio atiende en Manizales. */
const DEFAULT_DEPARTMENT = 'Caldas';
const DEFAULT_CITY = 'Manizales';

/** Alto en píxeles CSS del lienzo de firma. */
const PAD_HEIGHT = 130;

function emptySoap(): SoapContent {
  return { subjective: '', objective: '', assessment: '', plan: '' };
}

function emptyContent(): ClinicalContent {
  return {
    profile: 'FULL',
    soap: emptySoap(),
    careMinimum: {
      motive: '',
      presentIllness: '',
      antecedents: '',
      systemsReview: '',
    },
    mentalExam: {
      appearance: '',
      behavior: '',
      speech: '',
      mood: '',
      affect: '',
      thought: '',
      perception: '',
      judgment: '',
      insight: '',
    },
    assessment: {
      impressionNarrative: '',
      observations: '',
      managementPlan: [''],
    },
    vitals: { notes: '' },
    allergies: [],
    medications: [],
    risks: { suicideRisk: '', notes: '' },
    rdaMeta: {
      includedEvents: [],
      deviceId: '',
      physicalLocation: '',
    },
    signature: {
      professionalName: '',
      professionalCard: '',
      signedAt: null,
      verificationCode: '',
    },
  };
}

@Component({
  selector: 'app-clinical-history',
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, ConsentSigner],
  templateUrl: './clinical-history.html',
  styleUrl: './clinical-history.scss',
})
export class ClinicalHistory implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(ClinicalApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  @ViewChild(ConsentSigner)
  private consentSigner?: ConsentSigner;

  @ViewChild('signaturePadCanvas')
  private signaturePadCanvas?: ElementRef<HTMLCanvasElement>;

  readonly documentTypes = DOCUMENT_TYPES;

  readonly user = this.auth.user;
  readonly canWrite = this.auth.canWriteClinical;
  readonly isAuditor = this.auth.isAuditor;
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  readonly patients = signal<Patient[]>([]);
  readonly encounters = signal<EncounterListItem[]>([]);
  readonly encounter = signal<Encounter | null>(null);
  readonly incapacities = signal<Incapacity[]>([]);
  readonly attachments = signal<ClinicalAttachment[]>([]);
  readonly noteFormat = signal<ClinicalNoteFormat>('FULL');

  // Firma manuscrita (Ley 527): se dibuja una vez y queda en el perfil.
  readonly storedSignature = signal<string | null>(null);
  readonly hasStroke = signal(false);
  readonly signing = signal(false);
  readonly confirmSave = signal(false);
  /** Firmas pendientes detectadas al intentar guardar. */
  readonly missingSignatures = signal<{
    patient: boolean;
    professional: boolean;
    identification: string[];
  } | null>(null);
  /** Trazo vigente de la profesional, venga del panel Ley 527 o del consentimiento. */
  readonly professionalSignature = signal<string | null>(null);
  evolutionNote = '';
  evolutionReason = '';
  private signaturePad: SignaturePad | null = null;
  private readonly resizeHandler = () => this.fitSignaturePad();

  readonly cieResults = signal<CatalogCode[]>([]);
  readonly cupsResults = signal<CatalogCode[]>([]);
  readonly cieOpen = signal(false);
  readonly cupsOpen = signal(false);
  readonly cieRowOpen = signal<number | null>(null);
  readonly cupsRowOpen = signal<number | null>(null);
  readonly cieRowResults = signal<CatalogCode[]>([]);
  readonly cupsRowResults = signal<CatalogCode[]>([]);
  cieQuery = '';
  cupsQuery = '';
  private cieTimer: ReturnType<typeof setTimeout> | null = null;
  private cupsTimer: ReturnType<typeof setTimeout> | null = null;
  private cieCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private cupsCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private cieRowTimer: ReturnType<typeof setTimeout> | null = null;
  private cupsRowTimer: ReturnType<typeof setTimeout> | null = null;

  /** DIVIPOLA: alimenta los selectores de departamento y municipio. */
  readonly departments = signal<DivipolaDepartment[]>([]);

  patientMode: 'select' | 'create' = 'select';
  selectedPatientId = '';
  patientForm: Partial<Patient> = {
    documentType: 'CC',
    documentNumber: '',
    firstName: '',
    lastName: '',
    birthDate: '',
    city: DEFAULT_CITY,
    department: DEFAULT_DEPARTMENT,
  };

  content: ClinicalContent = emptyContent();
  diagnoses: DiagnosisRow[] = [];
  procedures: ProcedureRow[] = [];
  consents: ConsentRow[] = [
    { consentType: 'INFORMED', granted: false },
    { consentType: 'DATA_PROCESSING', granted: false },
  ];
  modality: 'IN_PERSON' | 'VIRTUAL' = 'IN_PERSON';
  serviceType = '';
  location = '';
  purpose = '';
  externalCause = '';
  allergiesText = '';
  medicationsText = '';
  managementPlanText = '';
  rdaEvents = {
    anamnesis: true,
    mentalExam: true,
    evaluation: true,
    managementPlan: true,
    education: false,
    consents: false,
  };

  // Incapacidad
  incapacityDraft = {
    startDate: '',
    endDate: '',
    days: 1,
    diagnosisCie: '',
    cause: '',
    observations: '',
  };

  // Multimedia
  attachmentLabel = '';
  attachmentCategory: ClinicalAttachment['category'] = 'PHOTO';
  attachmentCaption = '';
  attachmentFile: File | null = null;

  readonly now = new Date();

  isSoap() {
    return this.noteFormat() === 'SOAP';
  }

  ngOnInit() {
    this.refreshLists();

    // Llegada desde la agenda o desde el listado de pacientes.
    const params = this.route.snapshot.queryParamMap;
    const encounterId = params.get('encounterId');
    const patientId = params.get('patientId');
    if (encounterId) {
      this.loadEncounter(encounterId);
    } else if (patientId) {
      this.selectedPatientId = patientId;
      this.patientMode = 'select';
      // La ficha puede no estar en las primeras 50 del listado; se trae aparte
      // para poder completarla de una vez.
      this.api.getPatient(patientId).subscribe({
        next: (patient) => {
          this.patientForm = {
            ...patient,
            birthDate: patient.birthDate?.slice(0, 10) ?? '',
          };
          this.applyDefaultResidence();
          if (!this.patients().some((p) => p.id === patient.id)) {
            this.patients.set([patient, ...this.patients()]);
          }
        },
        error: () => undefined,
      });
      // La historia es única por paciente: se abre la que ya exista, esté en
      // borrador o cerrada, en vez de arrancar un documento nuevo.
      this.api.encounterForPatient(patientId).subscribe({
        next: (enc) => {
          if (enc) this.applyEncounter(enc);
        },
        error: () => undefined,
      });
    }

    this.api.divipola().subscribe({
      next: (rows) => this.departments.set(rows),
      error: () => this.departments.set([]),
    });

    if (this.canWrite()) {
      this.api.getMySignature().subscribe({
        next: (row) => this.storedSignature.set(row.signatureBase64),
        error: () => this.storedSignature.set(null),
      });
    }
  }

  /** Municipios del departamento elegido; vacío si aún no hay catálogo. */
  municipalityOptions() {
    const dept = this.departments().find((d) => d.name === this.patientForm.department);
    return dept?.municipalities ?? [];
  }

  /** Al cambiar de departamento el municipio anterior deja de ser válido. */
  onDepartmentChange() {
    const options = this.municipalityOptions();
    if (!options.some((m) => m.name === this.patientForm.city)) {
      this.patientForm.city = options[0]?.name ?? '';
    }
    this.syncMunicipalityCode();
  }

  /** El código DANE viaja junto al municipio porque RIPS lo exige. */
  syncMunicipalityCode() {
    const match = this.municipalityOptions().find((m) => m.name === this.patientForm.city);
    this.patientForm.municipalityCode = match?.code ?? null;
  }

  /** Residencia por defecto del consultorio mientras no se diga otra cosa. */
  private applyDefaultResidence() {
    if (!this.patientForm.department) {
      this.patientForm.department = DEFAULT_DEPARTMENT;
    }
    if (!this.patientForm.city) this.patientForm.city = DEFAULT_CITY;
  }

  ngAfterViewInit() {
    window.addEventListener('resize', this.resizeHandler);
    this.scheduleSignaturePadInit();
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeHandler);
    this.signaturePad?.off();
    this.signaturePad = null;
  }

  refreshLists() {
    this.api.listPatients().subscribe({
      next: (rows) => this.patients.set(rows),
      error: () => this.error.set('No se pudieron cargar pacientes.'),
    });
    this.api.listEncounters().subscribe({
      next: (rows) => this.encounters.set(rows),
      error: () => undefined,
    });
  }

  ageFrom(birthDate?: string | null) {
    if (!birthDate) return '';
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
    return String(age);
  }

  createPatient() {
    this.error.set('');
    this.api.createPatient(this.patientForm).subscribe({
      next: (patient) => {
        this.message.set('Paciente creado.');
        this.selectedPatientId = patient.id;
        this.patientMode = 'select';
        this.refreshLists();
      },
      error: (err) => this.error.set(err?.error?.message || 'No se pudo crear el paciente.'),
    });
  }

  startEncounter() {
    if (!this.selectedPatientId) {
      this.error.set('Seleccione o cree un paciente.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api.createEncounter(this.selectedPatientId).subscribe({
      next: (enc) => {
        this.applyEncounter(enc);
        this.loading.set(false);
        this.message.set(
          this.isLocked()
            ? 'Este paciente ya tiene historia clínica cerrada: registre la atención como nota de evolución.'
            : 'Atención abierta en borrador.',
        );
        this.refreshLists();
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'No se pudo abrir la atención.');
      },
    });
  }

  loadEncounter(id: string) {
    this.loading.set(true);
    this.api.getEncounter(id).subscribe({
      next: (enc) => {
        this.applyEncounter(enc);
        this.loading.set(false);
        this.message.set('Borrador cargado.');
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudo cargar la HCE.');
      },
    });
  }

  private applyEncounter(enc: Encounter) {
    this.encounter.set(enc);
    this.selectedPatientId = enc.patient.id;
    this.patientForm = { ...enc.patient, birthDate: enc.patient.birthDate?.slice(0, 10) };
    this.applyDefaultResidence();
    const format =
      enc.clinicalRecord?.noteFormat || (enc.visitType === 'FOLLOW_UP' ? 'SOAP' : 'FULL');
    this.noteFormat.set(format);
    this.content = {
      ...emptyContent(),
      ...(enc.clinicalRecord?.content || {}),
      profile: enc.clinicalRecord?.content?.profile || (format === 'SOAP' ? 'SOAP' : 'FULL'),
      soap: {
        ...emptySoap(),
        ...(enc.clinicalRecord?.content?.soap || {}),
      },
      careMinimum: {
        ...emptyContent().careMinimum,
        ...(enc.clinicalRecord?.content?.careMinimum || {}),
      },
      mentalExam: {
        ...emptyContent().mentalExam,
        ...(enc.clinicalRecord?.content?.mentalExam || {}),
      },
      assessment: {
        ...emptyContent().assessment,
        ...(enc.clinicalRecord?.content?.assessment || {}),
      },
      vitals: {
        ...emptyContent().vitals,
        ...(enc.clinicalRecord?.content?.vitals || {}),
      },
      risks: {
        ...emptyContent().risks,
        ...(enc.clinicalRecord?.content?.risks || {}),
      },
      rdaMeta: {
        ...emptyContent().rdaMeta,
        ...(enc.clinicalRecord?.content?.rdaMeta || {}),
      },
      signature: {
        ...emptyContent().signature,
        ...(enc.clinicalRecord?.content?.signature || {}),
        professionalName:
          enc.clinicalRecord?.content?.signature?.professionalName || enc.professional.fullName,
        professionalCard:
          enc.clinicalRecord?.content?.signature?.professionalCard ||
          enc.professional.professionalCard ||
          '',
      },
    };
    if (!this.content.soap) this.content.soap = emptySoap();
    this.diagnoses = [...(enc.diagnoses || [])];
    this.procedures = [...(enc.procedures || [])];
    this.consents =
      enc.consents?.length > 0
        ? enc.consents.map((c) => ({ ...c }))
        : [
            { consentType: 'INFORMED', granted: false },
            { consentType: 'DATA_PROCESSING', granted: false },
          ];
    this.modality = enc.modality;
    this.serviceType = enc.serviceType || '';
    this.location = enc.location || '';
    this.purpose = enc.purpose || '';
    this.externalCause = enc.externalCause || '';
    this.allergiesText = (this.content.allergies || []).join(', ');
    this.medicationsText = (this.content.medications || []).join(', ');
    this.managementPlanText = (this.content.assessment.managementPlan || []).join('\n');
    const events = new Set(this.content.rdaMeta.includedEvents || []);
    this.rdaEvents = {
      anamnesis: events.has('anamnesis') || events.size === 0,
      mentalExam: events.has('mentalExam') || events.size === 0,
      evaluation: events.has('evaluation') || events.size === 0,
      managementPlan: events.has('managementPlan') || events.size === 0,
      education: events.has('education'),
      consents: events.has('consents'),
    };
    this.incapacities.set(enc.incapacities || []);
    this.attachments.set(enc.attachments || []);
    this.scheduleSignaturePadInit();
  }

  openCieCatalog() {
    if (this.cieCloseTimer) {
      clearTimeout(this.cieCloseTimer);
      this.cieCloseTimer = null;
    }
    this.cieOpen.set(true);
    this.searchCie();
  }

  scheduleCloseCie() {
    if (this.cieCloseTimer) clearTimeout(this.cieCloseTimer);
    this.cieCloseTimer = setTimeout(() => this.cieOpen.set(false), 180);
  }

  onCieMouseLeave(event: MouseEvent) {
    if (this.keepOpenWhileTyping(event)) return;
    this.scheduleCloseCie();
  }

  onCieQueryChange() {
    this.cieOpen.set(true);
    if (this.cieTimer) clearTimeout(this.cieTimer);
    this.cieTimer = setTimeout(() => this.searchCie(), 180);
  }

  searchCie() {
    this.api.searchCie(this.cieQuery.trim()).subscribe({
      next: (rows) => this.cieResults.set(rows),
      error: () => this.cieResults.set([]),
    });
  }

  commitCieFromInput(event?: Event) {
    event?.preventDefault();
    const code = this.cieQuery.trim();
    if (!code) return;
    const exact = this.cieResults().find((r) => r.code.toUpperCase() === code.toUpperCase());
    if (exact) {
      this.addDiagnosis(exact);
      return;
    }
    this.api.searchCie(code).subscribe({
      next: (rows) => {
        const match = rows.find((r) => r.code.toUpperCase() === code.toUpperCase()) || rows[0];
        if (match) {
          this.addDiagnosis(match);
        } else {
          this.addDiagnosis({
            id: `manual-${code}`,
            code,
            description: '',
          });
        }
      },
      error: () =>
        this.addDiagnosis({
          id: `manual-${code}`,
          code,
          description: '',
        }),
    });
  }

  openCieForRow(index: number) {
    this.cieRowOpen.set(index);
    this.onDiagnosisCodeChange(index);
  }

  onDiagnosisCodeChange(index: number) {
    const code = (this.diagnoses[index]?.cieCode || '').trim();
    this.cieRowOpen.set(index);
    if (this.cieRowTimer) clearTimeout(this.cieRowTimer);
    this.cieRowTimer = setTimeout(() => {
      this.api.searchCie(code).subscribe({
        next: (rows) => this.cieRowResults.set(rows),
        error: () => this.cieRowResults.set([]),
      });
    }, 160);
  }

  applyDiagnosisFromCatalog(index: number, item: CatalogCode) {
    const row = this.diagnoses[index];
    if (!row) return;
    row.cieCode = item.code;
    row.description = item.description;
    this.cieRowOpen.set(null);
    this.cieRowResults.set([]);
  }

  openCupsCatalog() {
    if (this.cupsCloseTimer) {
      clearTimeout(this.cupsCloseTimer);
      this.cupsCloseTimer = null;
    }
    this.cupsOpen.set(true);
    this.searchCups();
  }

  scheduleCloseCups() {
    if (this.cupsCloseTimer) clearTimeout(this.cupsCloseTimer);
    this.cupsCloseTimer = setTimeout(() => this.cupsOpen.set(false), 180);
  }

  onCupsMouseLeave(event: MouseEvent) {
    if (this.keepOpenWhileTyping(event)) return;
    this.scheduleCloseCups();
  }

  /** El catálogo sigue abierto si el cursor sigue dentro del bloque que se abandonó. */
  private keepOpenWhileTyping(event: MouseEvent) {
    const container = event.currentTarget as HTMLElement | null;
    return !!container && container.contains(document.activeElement);
  }

  onCupsQueryChange() {
    this.cupsOpen.set(true);
    if (this.cupsTimer) clearTimeout(this.cupsTimer);
    this.cupsTimer = setTimeout(() => this.searchCups(), 180);
  }

  searchCups() {
    this.api.searchCups(this.cupsQuery.trim()).subscribe({
      next: (rows) => this.cupsResults.set(rows),
      error: () => this.cupsResults.set([]),
    });
  }

  commitCupsFromInput(event?: Event) {
    event?.preventDefault();
    const code = this.cupsQuery.trim();
    if (!code) return;
    const exact = this.cupsResults().find((r) => r.code.toUpperCase() === code.toUpperCase());
    if (exact) {
      this.addProcedure(exact);
      return;
    }
    this.api.searchCups(code).subscribe({
      next: (rows) => {
        const match = rows.find((r) => r.code.toUpperCase() === code.toUpperCase()) || rows[0];
        if (match) {
          this.addProcedure(match);
        } else {
          this.addProcedure({
            id: `manual-${code}`,
            code,
            description: '',
          });
        }
      },
      error: () =>
        this.addProcedure({
          id: `manual-${code}`,
          code,
          description: '',
        }),
    });
  }

  openCupsForRow(index: number) {
    this.cupsRowOpen.set(index);
    this.onProcedureCodeChange(index);
  }

  onProcedureCodeChange(index: number) {
    const code = (this.procedures[index]?.cupsCode || '').trim();
    this.cupsRowOpen.set(index);
    if (this.cupsRowTimer) clearTimeout(this.cupsRowTimer);
    this.cupsRowTimer = setTimeout(() => {
      this.api.searchCups(code).subscribe({
        next: (rows) => this.cupsRowResults.set(rows),
        error: () => this.cupsRowResults.set([]),
      });
    }, 160);
  }

  applyProcedureFromCatalog(index: number, item: CatalogCode) {
    const row = this.procedures[index];
    if (!row) return;
    row.cupsCode = item.code;
    row.description = item.description;
    this.cupsRowOpen.set(null);
    this.cupsRowResults.set([]);
  }

  addDiagnosis(item: CatalogCode) {
    this.diagnoses = [
      ...this.diagnoses,
      { cieCode: item.code, description: item.description, type: 'IMPRESSION' },
    ];
    this.cieQuery = '';
    this.cieResults.set([]);
    this.cieOpen.set(false);
  }

  removeDiagnosis(index: number) {
    this.diagnoses = this.diagnoses.filter((_, i) => i !== index);
    if (this.cieRowOpen() === index) {
      this.cieRowOpen.set(null);
      this.cieRowResults.set([]);
    }
  }

  addProcedure(item: CatalogCode) {
    this.procedures = [...this.procedures, { cupsCode: item.code, description: item.description }];
    this.cupsQuery = '';
    this.cupsResults.set([]);
    this.cupsOpen.set(false);
  }

  removeProcedure(index: number) {
    this.procedures = this.procedures.filter((_, i) => i !== index);
    if (this.cupsRowOpen() === index) {
      this.cupsRowOpen.set(null);
      this.cupsRowResults.set([]);
    }
  }

  consentGranted(type: string) {
    return !!this.consents.find((c) => c.consentType === type)?.granted;
  }

  /** Paciente efectivo para consentimientos (atención o selección). */
  consentPatientId(): string | null {
    return this.encounter()?.patient?.id || this.selectedPatientId || null;
  }

  consentPatientName(): string {
    const enc = this.encounter()?.patient;
    if (enc) return `${enc.firstName || ''} ${enc.lastName || ''}`.trim();
    const listed = this.patients().find((p) => p.id === this.selectedPatientId);
    if (listed) return `${listed.firstName || ''} ${listed.lastName || ''}`.trim();
    return `${this.patientForm.firstName || ''} ${this.patientForm.lastName || ''}`.trim();
  }

  consentPatientDocument(): string {
    return (
      this.encounter()?.patient?.documentNumber ||
      this.patients().find((p) => p.id === this.selectedPatientId)?.documentNumber ||
      this.patientForm.documentNumber ||
      ''
    );
  }

  consentPatientDocType(): string {
    return (
      this.encounter()?.patient?.documentType ||
      this.patients().find((p) => p.id === this.selectedPatientId)?.documentType ||
      this.patientForm.documentType ||
      'CC'
    );
  }

  consentPatientCity(): string {
    return (
      this.encounter()?.patient?.city ||
      this.patients().find((p) => p.id === this.selectedPatientId)?.city ||
      this.patientForm.city ||
      DEFAULT_CITY
    );
  }

  setConsent(type: string, granted: boolean) {
    const next = this.consents.map((c) =>
      c.consentType === type
        ? {
            ...c,
            granted,
            grantedAt: granted ? new Date().toISOString() : null,
          }
        : c,
    );
    if (!next.some((c) => c.consentType === type)) {
      next.push({
        consentType: type,
        granted,
        grantedAt: granted ? new Date().toISOString() : null,
      });
    }
    this.consents = next;
  }

  onConsentSealed() {
    this.message.set('Consentimiento firmado y vinculado a la atención.');
    this.reloadEncounterUnlessSaving();
  }

  onConsentFlagsChanged() {
    this.reloadEncounterUnlessSaving();
  }

  /**
   * Durante el guardado el consentimiento se sella en la misma pasada: recargar
   * la atención ahí pisaría lo que la profesional acaba de escribir.
   */
  private reloadEncounterUnlessSaving() {
    if (this.saving()) return;
    const enc = this.encounter();
    if (enc?.id) this.loadEncounter(enc.id);
  }

  /** Historia sellada: ya no admite edición, solo adendas. */
  isLocked() {
    const status = this.encounter()?.clinicalRecord?.status;
    return !!status && status !== 'DRAFT';
  }

  record() {
    return this.encounter()?.clinicalRecord ?? null;
  }

  evolutions() {
    return this.record()?.evolutions ?? [];
  }

  /**
   * Trazo vigente de la profesional. Es uno solo: da igual si lo dibujó en el
   * panel Ley 527 o en el motor de consentimientos.
   */
  private currentSignature(): string | undefined {
    if (this.signaturePad && !this.signaturePad.isEmpty()) {
      return this.signaturePad.toDataURL('image/png');
    }
    return this.professionalSignature() ?? undefined;
  }

  /** Llega un trazo desde el motor de consentimientos: se refleja en el panel Ley 527. */
  onProfessionalSigned(dataUrl: string) {
    if (this.professionalSignature() === dataUrl) return;
    this.professionalSignature.set(dataUrl);
    this.hasStroke.set(true);
    const canvas = this.signaturePadCanvas?.nativeElement;
    if (this.signaturePad && canvas) {
      this.signaturePad.clear();
      void this.signaturePad.fromDataURL(dataUrl, {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      });
    }
  }

  private assertSignatureReady() {
    if (this.hasStroke() || this.storedSignature() || this.professionalSignature()) {
      return true;
    }
    this.error.set(
      'Dibuje su firma en el panel «Firma digital» de la derecha antes de firmar documentos.',
    );
    return false;
  }

  clearSignature() {
    this.signaturePad?.clear();
    this.hasStroke.set(false);
    this.professionalSignature.set(null);
  }

  /** Guarda el trazo en el perfil para no volver a dibujarlo en cada documento. */
  saveSignatureToProfile() {
    const drawn = this.currentSignature();
    if (!drawn) {
      this.error.set('Dibuje su firma antes de guardarla.');
      return;
    }
    this.error.set('');
    this.api.saveMySignature(drawn).subscribe({
      next: (row) => {
        this.storedSignature.set(row.signatureBase64);
        this.message.set('Firma guardada en su perfil. Se reutilizará en cada documento.');
      },
      error: (err) => this.error.set(err?.error?.message || 'No se pudo guardar la firma.'),
    });
  }

  deleteStoredSignature() {
    this.api.deleteMySignature().subscribe({
      next: () => {
        this.storedSignature.set(null);
        this.message.set('Firma eliminada del perfil.');
      },
      error: () => this.error.set('No se pudo eliminar la firma.'),
    });
  }

  addEvolution() {
    const enc = this.encounter();
    if (!enc || !this.canWrite() || !this.assertSignatureReady()) return;
    if (this.evolutionNote.trim().length < 5) {
      this.error.set('Escriba el contenido de la adenda.');
      return;
    }

    this.signing.set(true);
    this.error.set('');
    this.api
      .addEvolution(enc.id, {
        note: this.evolutionNote.trim(),
        reason: this.evolutionReason.trim() || undefined,
        signatureBase64: this.currentSignature(),
      })
      .subscribe({
        next: (updated) => {
          this.applyEncounter(updated);
          this.signing.set(false);
          this.evolutionNote = '';
          this.evolutionReason = '';
          this.message.set('Adenda firmada y anexada a la historia.');
        },
        error: (err) => {
          this.signing.set(false);
          this.error.set(err?.error?.message || 'No se pudo registrar la adenda.');
        },
      });
  }

  private scheduleSignaturePadInit() {
    setTimeout(() => this.initSignaturePad(), 50);
  }

  /**
   * El lienzo vive dentro de un bloque condicional, así que puede montarse
   * después del arranque: lo activamos también al acercar el cursor.
   */
  ensureSignaturePad() {
    if (!this.signaturePad) this.initSignaturePad();
  }

  private initSignaturePad() {
    const canvas = this.signaturePadCanvas?.nativeElement;
    this.signaturePad?.off();
    this.signaturePad = null;
    this.hasStroke.set(false);
    if (!canvas || !canvas.isConnected) return;

    this.fitCanvas(canvas);
    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(16, 24, 40)',
      minWidth: 0.7,
      maxWidth: 2.2,
      throttle: 0,
    });
    pad.addEventListener('beginStroke', () => this.hasStroke.set(true));
    pad.addEventListener('endStroke', () => {
      this.hasStroke.set(!pad.isEmpty());
      if (!pad.isEmpty()) {
        this.professionalSignature.set(pad.toDataURL('image/png'));
      }
    });
    this.signaturePad = pad;
  }

  private fitSignaturePad() {
    const canvas = this.signaturePadCanvas?.nativeElement;
    if (!canvas) return;
    this.fitCanvas(canvas);
    this.signaturePad?.clear();
    this.hasStroke.set(false);
  }

  private fitCanvas(canvas: HTMLCanvasElement) {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(Math.floor(rect.width), canvas.clientWidth, 220);

    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(PAD_HEIGHT * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${PAD_HEIGHT}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(ratio, ratio);
    }
  }

  /** Vuelca los campos sueltos del formulario dentro del contenido clínico. */
  private collectContent() {
    if (this.isSoap()) {
      this.content.profile = 'SOAP';
      if (!this.content.soap) this.content.soap = emptySoap();
    } else {
      this.content.profile = 'FULL';
      this.content.allergies = this.allergiesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      this.content.medications = this.medicationsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      this.content.assessment.managementPlan = this.managementPlanText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      this.content.rdaMeta.includedEvents = Object.entries(this.rdaEvents)
        .filter(([, v]) => v)
        .map(([k]) => k);
      this.content.rdaMeta.physicalLocation = this.location;
    }
  }

  /**
   * La historia y el consentimiento se sellan con las dos firmas. Devuelve qué
   * falta para avisarlo con nombre propio en vez de un error genérico.
   */
  private pendingSignatures() {
    const signer = this.consentSigner;
    const professional =
      this.hasStroke() ||
      !!this.professionalSignature() ||
      !!this.storedSignature() ||
      !!signer?.hasProfessionalSignature();
    const patient =
      !!signer?.hasPatientSignature() ||
      this.consentGranted('DATA_PROCESSING') ||
      !!signer?.signed().length;
    return { professional: !professional, patient: !patient };
  }

  /** Mínimo legal de la ficha (RIPS / Res. 1995) para poder cerrar la historia. */
  private pendingIdentification() {
    const f = this.patientForm;
    const missing: string[] = [];
    if (!f.firstName?.trim()) missing.push('Nombres');
    if (!f.lastName?.trim()) missing.push('Apellidos');
    if (!f.documentType) missing.push('Tipo de documento');
    if (!f.documentNumber?.trim()) missing.push('Número de documento');
    if (!f.birthDate) missing.push('Fecha de nacimiento');
    return missing;
  }

  /** Lo que impide cerrar la historia; el resto de campos puede quedar vacío. */
  private saveBlockers() {
    const signatures = this.pendingSignatures();
    const identification = this.pendingIdentification();
    if (!signatures.professional && !signatures.patient && !identification.length) return null;
    return { ...signatures, identification };
  }

  /**
   * El servidor devuelve las filas completas (id, hashes, rutas del PDF…) y el
   * DTO de guardado solo admite los campos editables, así que se recortan.
   */
  private editableRows() {
    return {
      diagnoses: this.diagnoses.map((d) => ({
        cieCode: d.cieCode,
        description: d.description,
        type: d.type,
      })),
      procedures: this.procedures.map((p) => ({
        cupsCode: p.cupsCode,
        description: p.description,
      })),
      consents: this.consents.map((c) => ({
        consentType: c.consentType,
        granted: c.granted,
        ...(c.grantedAt ? { grantedAt: c.grantedAt } : {}),
      })),
    };
  }

  askSaveConfirm() {
    if (!this.encounter()) {
      this.error.set('Abra o cree una atención primero.');
      return;
    }
    if (!this.canWrite()) {
      this.error.set('Su rol no permite editar la historia clínica.');
      return;
    }
    const pending = this.saveBlockers();
    if (pending) {
      this.missingSignatures.set(pending);
      return;
    }
    this.error.set('');
    this.confirmSave.set(true);
  }

  closeMissingSignatures() {
    this.missingSignatures.set(null);
  }

  cancelSaveConfirm() {
    this.confirmSave.set(false);
  }

  /**
   * Guardado definitivo: persiste la ficha del paciente, escribe el contenido
   * clínico y sella la historia en una sola operación. A partir de aquí solo
   * quedan editables los datos de identificación y las notas de evolución.
   */
  async saveRecord() {
    const enc = this.encounter();
    if (!enc || !this.canWrite() || this.isLocked()) return;
    const pending = this.saveBlockers();
    if (pending) {
      this.confirmSave.set(false);
      this.missingSignatures.set(pending);
      return;
    }

    this.confirmSave.set(false);
    this.error.set('');

    // Si hay un consentimiento firmado sin sellar, su PDF sale con este guardado.
    if (this.consentSigner?.canSeal()) {
      this.saving.set(true);
      const sealed = await this.consentSigner.seal();
      if (!sealed) {
        this.saving.set(false);
        this.error.set(this.consentSigner.error() || 'No se pudo sellar el consentimiento.');
        return;
      }
    }

    // La incapacidad se emite al terminar la cita, con la misma firma.
    if (!(await this.issuePendingIncapacity())) return;

    this.collectContent();
    this.content.signature.professionalName =
      this.content.signature.professionalName || enc.professional.fullName;

    const drawn = this.currentSignature();
    this.saving.set(true);
    this.error.set('');
    this.persistPatientDemographics()
      .pipe(
        switchMap(() =>
          this.api.saveDraft(enc.id, {
            content: this.content,
            noteFormat: this.noteFormat(),
            ...this.editableRows(),
            modality: this.modality,
            serviceType: this.serviceType,
            location: this.location,
            purpose: this.purpose,
            externalCause: this.externalCause || null,
          }),
        ),
        switchMap(() => this.api.signClinicalRecord(enc.id, drawn)),
      )
      .subscribe({
        next: (updated) => {
          if (drawn) this.storedSignature.set(drawn);
          this.applyEncounter(updated);
          this.saving.set(false);
          this.message.set(
            'Historia clínica guardada y sellada. Para ampliarla registre una nota de evolución.',
          );
          this.refreshLists();
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.message || 'No se pudo guardar la historia clínica.');
        },
      });
  }

  /** Con la historia sellada lo único editable es la ficha de identificación. */
  savePatientIdentification() {
    if (!this.canWrite()) return;
    this.saving.set(true);
    this.error.set('');
    this.persistPatientDemographics().subscribe({
      next: () => {
        this.saving.set(false);
        this.message.set('Datos de identificación del paciente actualizados.');
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.message || 'No se pudieron actualizar los datos del paciente.');
      },
    });
  }

  /** Días de incapacidad: se calculan solos si la profesional no los escribe. */
  private incapacityDays() {
    const draft = this.incapacityDraft;
    if (draft.days > 0) return draft.days;
    const start = new Date(draft.startDate);
    const end = new Date(draft.endDate);
    const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    return diff > 0 ? diff : 1;
  }

  /**
   * Emite la incapacidad al cerrar la atención: la crea y la firma con el mismo
   * trazo de la historia. Devuelve false solo si el servidor la rechaza.
   */
  private async issuePendingIncapacity(): Promise<boolean> {
    const enc = this.encounter();
    const draft = this.incapacityDraft;
    if (!enc || !draft.startDate || !draft.endDate) return true;

    this.saving.set(true);
    try {
      const created = await firstValueFrom(
        this.api.createIncapacity({
          encounterId: enc.id,
          startDate: draft.startDate,
          endDate: draft.endDate,
          days: this.incapacityDays(),
          diagnosisCie: draft.diagnosisCie || undefined,
          cause: draft.cause || undefined,
          observations: draft.observations || undefined,
        }),
      );
      const signed = await firstValueFrom(
        this.api.signIncapacity(created.id, this.currentSignature()),
      );
      this.incapacities.set([signed, ...this.incapacities()]);
      this.incapacityDraft = {
        startDate: '',
        endDate: '',
        days: 0,
        diagnosisCie: '',
        cause: '',
        observations: '',
      };
      return true;
    } catch (err) {
      this.saving.set(false);
      const http = err as { error?: { message?: string } };
      this.error.set(http?.error?.message || 'No se pudo emitir la incapacidad.');
      return false;
    }
  }

  /** Abre la incapacidad firmada en una ventana lista para imprimir. */
  printIncapacity(inc: Incapacity) {
    const enc = this.encounter();
    const f = this.patientForm;
    const patient = [f.firstName, f.lastName].filter(Boolean).join(' ').trim() || '—';
    const document = [f.documentType, f.documentNumber].filter(Boolean).join(' ') || '—';
    const professional = enc?.professional?.fullName || this.user()?.fullName || '—';
    const card = enc?.professional?.professionalCard || '';
    const signature = this.professionalSignature() || this.storedSignature() || '';
    const dates = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' });
    const day = (value?: string | null) =>
      value ? dates.format(new Date(`${value.slice(0, 10)}T12:00:00`)) : '—';

    const rows: [string, string][] = [
      ['Paciente', patient],
      ['Documento', document],
      ['Desde', day(inc.startDate)],
      ['Hasta', day(inc.endDate)],
      ['Días', String(inc.days)],
      ['Diagnóstico (CIE-10)', inc.diagnosisCie || '—'],
      ['Causa', inc.cause || '—'],
      ['Observaciones', inc.observations || '—'],
      ['Expedida', inc.signedAt ? dates.format(new Date(inc.signedAt)) : day(inc.startDate)],
    ];

    const win = window.open('', '_blank', 'width=860,height=1000');
    if (!win) {
      this.error.set('El navegador bloqueó la ventana de impresión.');
      return;
    }
    win.document.write(`<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Incapacidad médica · ${this.escapeForPrint(patient)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #10181f; margin: 40px; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #003d4c; }
  .sub { margin: 0 0 24px; color: #5a6b70; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e6ecec; vertical-align: top; }
  th { width: 220px; color: #4a5a5e; font-weight: 600; }
  .sign { margin-top: 48px; }
  .sign img { display: block; height: 90px; }
  .sign-line { border-top: 1px solid #10181f; width: 280px; padding-top: 6px; font-size: 13px; }
  .legal { margin-top: 32px; font-size: 11px; color: #6b7a7e; line-height: 1.5; }
  @media print { body { margin: 18mm; } }
</style></head>
<body>
  <h1>Incapacidad médica</h1>
  <p class="sub">${this.escapeForPrint(professional)}${card ? ` · TP ${this.escapeForPrint(card)}` : ''}</p>
  <table>${rows
    .map(
      ([label, value]) =>
        `<tr><th>${this.escapeForPrint(label)}</th><td>${this.escapeForPrint(value)}</td></tr>`,
    )
    .join('')}</table>
  <div class="sign">
    ${signature ? `<img src="${signature}" alt="Firma" />` : ''}
    <div class="sign-line">${this.escapeForPrint(professional)}${card ? ` · TP ${this.escapeForPrint(card)}` : ''}</div>
  </div>
  <p class="legal">
    Documento electrónico firmado conforme a la Ley 527 de 1999. La historia clínica que lo respalda
    reposa en HABILISALUD y su contenido es confidencial (Ley 1581 de 2012).
  </p>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  }

  private escapeForPrint(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  signIncapacity(id: string) {
    if (!this.assertSignatureReady()) return;
    const drawn = this.currentSignature();
    this.error.set('');
    this.api.signIncapacity(id, drawn).subscribe({
      next: (row) => {
        if (drawn) this.storedSignature.set(drawn);
        this.incapacities.set(this.incapacities().map((i) => (i.id === id ? row : i)));
        this.message.set('Incapacidad firmada.');
      },
      error: (err) => this.error.set(err?.error?.message || 'No se pudo firmar la incapacidad.'),
    });
  }

  onAttachmentFile(event: Event) {
    const input = event.target as HTMLInputElement;
    this.attachmentFile = input.files?.[0] || null;
    if (this.attachmentFile && !this.attachmentLabel) {
      this.attachmentLabel = this.attachmentFile.name;
    }
  }

  uploadAttachment() {
    const enc = this.encounter();
    if (!enc || !this.canWrite() || !this.attachmentFile) {
      this.error.set('Seleccione un archivo para adjuntar.');
      return;
    }
    const form = new FormData();
    form.append('file', this.attachmentFile);
    form.append('encounterId', enc.id);
    if (enc.clinicalRecord?.id) {
      form.append('clinicalRecordId', enc.clinicalRecord.id);
    }
    form.append('label', this.attachmentLabel || this.attachmentFile.name);
    form.append('category', this.attachmentCategory);
    if (this.attachmentCaption) form.append('caption', this.attachmentCaption);

    this.api.uploadAttachment(form).subscribe({
      next: (att) => {
        this.attachments.set([att, ...this.attachments()]);
        this.message.set('Archivo adjunto cargado.');
        this.attachmentFile = null;
        this.attachmentLabel = '';
        this.attachmentCaption = '';
      },
      error: (err) => this.error.set(err?.error?.message || 'No se pudo subir el adjunto.'),
    });
  }

  openAttachment(id: string) {
    this.api.downloadAttachment(id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: () => this.error.set('No se pudo descargar el adjunto.'),
    });
  }

  removeAttachment(id: string) {
    if (!this.canWrite()) return;
    this.api.deleteAttachment(id).subscribe({
      next: () => {
        this.attachments.set(this.attachments().filter((a) => a.id !== id));
        this.message.set('Adjunto eliminado.');
      },
      error: (err) => this.error.set(err?.error?.message || 'No se pudo eliminar el adjunto.'),
    });
  }

  /** Actualiza demografía del paciente solo con campos seguros (sin id/clinicId). */
  private persistPatientDemographics(): Observable<unknown> {
    const id = this.selectedPatientId || this.encounter()?.patient?.id;
    if (!id) return of(null);

    // Se envía lo que esté diligenciado: la ficha puede quedar incompleta.
    const f = this.patientForm;
    const payload: Partial<Patient> = {};
    if (f.documentType) payload.documentType = f.documentType;
    if (f.documentNumber) payload.documentNumber = f.documentNumber;
    if (f.firstName) payload.firstName = f.firstName;
    if (f.lastName) payload.lastName = f.lastName;
    if (f.birthDate) payload.birthDate = f.birthDate;
    if (f.middleName) payload.middleName = f.middleName;
    if (f.secondLastName) payload.secondLastName = f.secondLastName;
    if (f.sexAtBirth) payload.sexAtBirth = f.sexAtBirth;
    if (f.genderIdentity) payload.genderIdentity = f.genderIdentity;
    if (f.sexualOrientation) payload.sexualOrientation = f.sexualOrientation;
    if (f.maritalStatus) payload.maritalStatus = f.maritalStatus;
    if (f.address) payload.address = f.address;
    if (f.city) payload.city = f.city;
    if (f.department) payload.department = f.department;
    if (f.municipalityCode) payload.municipalityCode = f.municipalityCode;
    if (f.phone) payload.phone = f.phone;
    if (f.email && f.email.includes('@')) payload.email = f.email;
    if (f.eps) payload.eps = f.eps;
    if (f.regime) payload.regime = f.regime;
    if (f.occupation) payload.occupation = f.occupation;
    if (f.educationLevel) payload.educationLevel = f.educationLevel;
    if (f.emergencyContactName) payload.emergencyContactName = f.emergencyContactName;
    if (f.emergencyContactPhone) payload.emergencyContactPhone = f.emergencyContactPhone;
    if (f.emergencyRelationship) payload.emergencyRelationship = f.emergencyRelationship;

    if (!Object.keys(payload).length) return of(null);
    return this.api.updatePatient(id, payload);
  }

  newAttention() {
    this.encounter.set(null);
    this.content = emptyContent();
    this.diagnoses = [];
    this.procedures = [];
    this.consents = [
      { consentType: 'INFORMED', granted: false },
      { consentType: 'DATA_PROCESSING', granted: false },
    ];
    this.message.set(
      'Listo para una nueva atención. Si el paciente ya tiene historia, se abrirá esa misma para anotar la evolución.',
    );
    this.scheduleSignaturePadInit();
  }

  goHome() {
    this.auth.goToWebsite();
  }

  logout() {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
