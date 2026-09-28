import { DatePipe, DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Observable,
  Subscription,
  TimeoutError,
  catchError,
  firstValueFrom,
  forkJoin,
  map,
  of,
  switchMap,
  tap,
  throwError,
  timeout,
} from 'rxjs';
import SignaturePad from 'signature_pad';
import { AuthService } from '../auth.service';
import { UnsavedWorkService } from '../unsaved-work.service';
import { ClinicalApiService } from './clinical-api.service';
import { AUTOSAVE_TIMEOUT_MS, ClinicalAutosaveService } from './clinical-autosave.service';
import { HceLocalDraftService, HceLocalDraft } from './hce-local-draft.service';
import { OpenEncountersAlert } from './open-encounters-alert';
import { VoiceDictationBtn } from './voice-dictation-btn';
import { ClinicalListenBtn } from './clinical-listen-btn';
import { formatClinicalFreeText } from './clinical-text-format';
import { ConsentSigner } from './consent-signer';
import { DentalOdontogram } from './dentistry/dental-odontogram';
import {
  ALLERGY_ITEMS,
  DENTAL_CONSENT_OPTIONS,
  DENTAL_ONLY_CONSENT_KEYS,
  DENTAL_SERVICES,
  DENTAL_SYMPTOMS,
  DENTAL_SYSTEMS,
  DENTAL_TREATMENTS,
  DentistryContent,
  HABIT_ITEMS,
  IMAGING_TYPES,
  MEDICAL_CONDITIONS,
  MEDICATION_GROUPS,
  ORDER_TYPES,
  ORTHO_CONSENT_KEYS,
  ORTHO_HABITS,
  PHOTO_SLOTS,
  TREATMENT_STATUSES,
  TreatmentStatus,
  dentalAllergyList,
  dentalMedicationList,
  dentalServiceLabel,
  emptyDentalDiagnosis,
  emptyImagingRow,
  emptyMedicationRow,
  emptyOrderRow,
  emptyPrescriptionRow,
  emptyTreatmentRow,
  hasOrthoSpecialistData,
  hasOrthodonticData,
  normalizeDentistry,
  validateDentistryForSeal,
} from './dentistry/dentistry.models';
import {
  OrthoMeasureGroup,
  OrthoMeasureStatus,
  anbFrom,
  checkMeasure,
  growthPatternFromFma,
  measureKey,
  orthoConsistencyWarnings,
  orthoMeasureErrors,
  skeletalClassFromAnb,
} from './dentistry/ortho-measures';
import { PatientConsentRecord } from './consent.models';
import { DOCUMENT_TYPES } from './document-types';
import { WEBSITE_URL } from '../api.config';
import {
  CatalogCode,
  ClinicalAttachment,
  ClinicalContent,
  ClinicalEvolution,
  ClinicalNoteFormat,
  ConsentRow,
  DiagnosisRow,
  DivipolaDepartment,
  Encounter,
  EncounterListItem,
  Incapacity,
  Patient,
  PhysiotherapyContent,
  ProcedureRow,
  SoapContent,
} from './clinical.models';

type DentalField<T> = {
  key: keyof T & string;
  label: string;
  options?: string[];
  placeholder?: string;
};

function emptyDentalEvolution() {
  return {
    teeth: '',
    findings: '',
    anesthesia: '',
    material: '',
    complications: '',
    instructions: '',
    nextAppointment: '',
  };
}

/** Residencia por defecto: el consultorio atiende en Manizales. */
const DEFAULT_DEPARTMENT = 'Caldas';
const DEFAULT_CITY = 'Manizales';

/** Tipos de documento que indican menor (misma regla que la API). */
const MINOR_DOCUMENT_TYPES = new Set(['TI', 'RC', 'CN', 'MS']);

/** Alto en píxeles CSS del lienzo de firma. */
const PAD_HEIGHT = 130;

function emptySoap(): SoapContent {
  return { subjective: '', objective: '', assessment: '', plan: '' };
}

function emptyPhysiotherapy(): PhysiotherapyContent {
  return {
    antecedentsDetail: {
      personal: '',
      pathological: '',
      surgical: '',
      allergic: '',
      pharmacological: '',
      family: '',
      obgyn: '',
      traumatic: '',
      occupational: '',
      others: '',
    },
    systemsReviewGrid: {
      cardiovascular: '',
      respiratory: '',
      neurological: '',
      musculoskeletal: '',
      skin: '',
      others: '',
    },
    physioDiagnosis: '',
    findings: '',
    functionalAssessment: {
      pain: '',
      jointMobility: '',
      muscleStrength: '',
      muscleStrengthDetail: '',
      muscleTone: '',
      sensitivity: '',
      coordination: '',
      balance: '',
      gait: '',
      cardiorespiratory: '',
      otherFunctions: '',
    },
    physioDxCode: '',
    physioDxDescription: '',
    treatmentObjectives: '',
    interventionPlan: '',
    frequency: '',
    estimatedDuration: '',
    sessionCount: '',
    closure: {
      closedAt: '',
      caseStatus: '',
      treatmentResult: '',
    },
  };
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
      antecedentFlags: {
        personales: { applies: false, detail: '' },
        psiquiatricos: { applies: false, detail: '' },
        familiares: { applies: false, detail: '' },
        toxicos: { applies: false, detail: '' },
      },
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
      narrative: '',
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
    physiotherapy: emptyPhysiotherapy(),
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
    documentedAt: null,
  };
}

@Component({
  selector: 'app-clinical-history',
  imports: [
    FormsModule,
    RouterLink,
    DatePipe,
    DecimalPipe,
    ConsentSigner,
    DentalOdontogram,
    OpenEncountersAlert,
    VoiceDictationBtn,
    ClinicalListenBtn,
  ],
  providers: [ClinicalAutosaveService],
  templateUrl: './clinical-history.html',
  styleUrl: './clinical-history.scss',
  host: {
    '[class.embedded]': 'embedded()',
  },
})
export class ClinicalHistory implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(ClinicalApiService);
  private readonly auth = inject(AuthService);
  private readonly autosave = inject(ClinicalAutosaveService);
  private readonly localDrafts = inject(HceLocalDraftService);
  private readonly unsaved = inject(UnsavedWorkService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Evita reaplicar borrador local justo después de un guardado exitoso al servidor. */
  private skipLocalRestoreOnce = false;
  /** Identificador estable de esta instancia (modo standalone o respaldo). */
  private readonly instanceId = `hce-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  private pendingEncounterForPatient: string | null = null;

  /** Montada dentro del workspace multi-pestaña. */
  readonly embedded = input(false);
  readonly tabKey = input<string | null>(null);
  /** Pestaña visible en el workspace (para respaldar al cambiar de pestaña). */
  readonly isActiveTab = input(true);
  readonly initialPatientId = input<string | null>(null);
  readonly initialEncounterId = input<string | null>(null);
  readonly labelChange = output<string>();
  readonly patientBound = output<{ patientId: string; label: string }>();
  readonly openPatientTab = output<{ patientId: string; label?: string }>();

  @ViewChild(ConsentSigner)
  private consentSigner?: ConsentSigner;

  @ViewChild('signaturePadCanvas')
  private signaturePadCanvas?: ElementRef<HTMLCanvasElement>;

  @ViewChild('attachmentFileInput')
  private attachmentFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('patientCameraVideo')
  private patientCameraVideo?: ElementRef<HTMLVideoElement>;

  readonly documentTypes = DOCUMENT_TYPES;

  readonly user = this.auth.user;
  readonly canWrite = this.auth.canWriteClinical;
  readonly isAuditor = this.auth.isAuditor;

  /** Consultorio de fisioterapia (HC-FT-001). */
  isPhysiotherapyClinic() {
    const specialty = String(this.user()?.specialty || '').toUpperCase();
    if (specialty === 'PHYSIOTHERAPY') return true;
    // Fallback: perfil clínico de la atención ya abierta como FT.
    if (String(this.content?.profile || '').toUpperCase() === 'PHYSIOTHERAPY') return true;
    // Fallback: nombre de clínica / especialidad en snapshot de la atención.
    const snap = String(this.encounter()?.specialtySnapshot || '').toUpperCase();
    return snap === 'PHYSIOTHERAPY' || snap.includes('FISIOTER');
  }

  /** Historia con bloques odontológicos: consultorio de odontología (HC-ODO-001) o de ortodoncia (HC-ORT-001). */
  isDentistryClinic() {
    const specialty = String(this.user()?.specialty || '').toUpperCase();
    if (specialty === 'DENTISTRY' || specialty === 'ORTHODONTICS') return true;
    if (String(this.content?.profile || '').toUpperCase() === 'DENTISTRY') return true;
    const snap = String(this.encounter()?.specialtySnapshot || '').toUpperCase();
    return snap === 'DENTISTRY' || snap === 'ORTHODONTICS' || snap.includes('ODONT') || snap.includes('ORTODON');
  }

  /** Consultorio de ortodoncia (especialista): la evaluación ortodóntica completa es el eje de la historia. */
  isOrthoClinic() {
    const snap = String(this.encounter()?.specialtySnapshot || '').toUpperCase();
    if (snap) return snap === 'ORTHODONTICS' || snap.includes('ORTODON');
    return String(this.user()?.specialty || '').toUpperCase() === 'ORTHODONTICS';
  }

  /** Acceso tipado al bloque odontológico (se completa con defaults si viene parcial). */
  dental(): DentistryContent {
    if (!this.content.dentistry) {
      this.content.dentistry = normalizeDentistry();
    }
    const d = this.content.dentistry;
    if (!d.service && this.isOrthoClinic()) d.service = 'ORTODONCIA';
    return d;
  }

  readonly dentalSystems = DENTAL_SYSTEMS;

  readonly dentalServices = DENTAL_SERVICES;
  readonly dentalServiceLabel = dentalServiceLabel;
  readonly dentalMedicalConditions = MEDICAL_CONDITIONS;
  readonly dentalAllergyItems = ALLERGY_ITEMS;
  readonly dentalMedicationGroups = MEDICATION_GROUPS;
  readonly dentalTreatmentItems = DENTAL_TREATMENTS;
  readonly dentalSymptomItems = DENTAL_SYMPTOMS;
  readonly dentalHabitItems = HABIT_ITEMS;
  readonly orthoHabitItems = ORTHO_HABITS;
  readonly dentalConsentOptions = DENTAL_CONSENT_OPTIONS;
  readonly imagingTypes = IMAGING_TYPES;
  readonly treatmentStatuses = TREATMENT_STATUSES;
  readonly orderTypes = ORDER_TYPES;
  readonly photoGroups = ['Extraoral', 'Intraoral'] as const;
  readonly prescriptionRoutes = ['Oral', 'Tópica', 'Sublingual', 'Intramuscular', 'Intravenosa', 'Enjuague'];
  readonly orthoAppliances = [
    'Brackets metálicos',
    'Brackets estéticos',
    'Brackets de autoligado',
    'Alineadores',
    'Aparatología removible',
    'Ortopedia funcional',
    'Expansor palatino',
    'Retenedores',
    'Otro',
  ];
  readonly anesthesiaOptions = [
    { key: 'NO', label: 'No' },
    { key: 'SI', label: 'Sí' },
    { key: 'NO_SABE', label: 'No sabe' },
  ] as const;

  private readonly normalAltered = ['Normal', 'Alterado'];

  readonly dentalExtraoralFields: DentalField<DentistryContent['extraoral']>[] = [
    { key: 'symmetry', label: 'Simetría facial', options: ['Simétrica', 'Asimetría leve', 'Asimetría marcada'] },
    { key: 'profile', label: 'Perfil', options: ['Recto', 'Convexo', 'Cóncavo'] },
    { key: 'facialThirds', label: 'Tercios faciales', options: ['Proporcionados', 'Tercio inferior aumentado', 'Tercio inferior disminuido'] },
    { key: 'lymphNodes', label: 'Ganglios', options: ['No palpables', 'Palpables no dolorosos', 'Palpables dolorosos'] },
    { key: 'lips', label: 'Labios', options: this.normalAltered },
    { key: 'breathing', label: 'Respiración', options: ['Nasal', 'Oral', 'Mixta'] },
    { key: 'skin', label: 'Piel', options: this.normalAltered },
  ];

  readonly dentalTmjFields: DentalField<DentistryContent['extraoral']>[] = [
    { key: 'tmj', label: 'ATM', options: ['Sin alteración', 'Dolor', 'Ruidos', 'Limitación'] },
    { key: 'mouthOpening', label: 'Apertura bucal (mm)', placeholder: '40' },
    { key: 'muscularPain', label: 'Dolor muscular', options: ['No', 'Sí'] },
    { key: 'clicking', label: 'Chasquidos', options: ['No', 'Derecho', 'Izquierdo', 'Bilateral'] },
    { key: 'mandibularDeviation', label: 'Desviación mandibular', options: ['No', 'Derecha', 'Izquierda'] },
  ];

  readonly dentalIntraoralFields: DentalField<DentistryContent['intraoral']>[] = [
    { key: 'hygiene', label: 'Higiene oral', options: ['Buena', 'Regular', 'Deficiente'] },
    { key: 'lips', label: 'Labios', options: this.normalAltered },
    { key: 'mucosa', label: 'Carrillos / mucosa', options: this.normalAltered },
    { key: 'palate', label: 'Paladar', options: this.normalAltered },
    { key: 'tongue', label: 'Lengua', options: this.normalAltered },
    { key: 'floorOfMouth', label: 'Piso de boca', options: this.normalAltered },
    { key: 'frenula', label: 'Frenillos', options: this.normalAltered },
    { key: 'tonsils', label: 'Amígdalas / orofaringe', options: this.normalAltered },
    { key: 'glands', label: 'Glándulas salivales', options: ['Flujo normal', 'Xerostomía', 'Sialorrea'] },
    { key: 'dentition', label: 'Dentición', options: ['Permanente', 'Temporal', 'Mixta'] },
    { key: 'occlusion', label: 'Oclusión', options: ['Normal', 'Maloclusión'] },
    { key: 'otherLesions', label: 'Otras lesiones', placeholder: 'Úlceras, leucoplasias…' },
  ];

  readonly dentalPeriodontalFields: DentalField<DentistryContent['periodontal']>[] = [
    { key: 'gingiva', label: 'Encía', options: ['Sana', 'Inflamada', 'Hiperplásica'] },
    { key: 'bleeding', label: 'Sangrado al sondaje', options: ['No', 'Localizado', 'Generalizado'] },
    { key: 'recessions', label: 'Recesiones', placeholder: 'Piezas / mm' },
    { key: 'mobility', label: 'Movilidad', placeholder: 'Piezas / grado' },
    { key: 'probingDepth', label: 'Profundidad al sondaje', placeholder: 'Bolsas > 4 mm en…' },
    { key: 'plaque', label: 'Placa bacteriana', options: ['Escasa', 'Moderada', 'Abundante'] },
    { key: 'calculus', label: 'Cálculos', options: ['No', 'Supragingival', 'Subgingival'] },
    { key: 'furcations', label: 'Furcaciones', placeholder: 'Piezas / grado' },
    { key: 'indices', label: 'Índices periodontales', placeholder: 'O\'Leary 20%, IG…' },
  ];

  readonly orthoFacialFields: DentalField<DentistryContent['orthodontics']['facial']>[] = [
    { key: 'facialType', label: 'Tipo facial', options: ['Mesofacial', 'Dolicofacial', 'Braquifacial'] },
    { key: 'profile', label: 'Perfil', options: ['Recto', 'Convexo', 'Cóncavo'] },
    { key: 'symmetry', label: 'Simetría', options: ['Simétrico', 'Asimétrico'] },
    { key: 'midline', label: 'Línea media facial', options: ['Centrada', 'Desviada a la derecha', 'Desviada a la izquierda'] },
    { key: 'lowerThird', label: 'Tercio inferior', options: ['Normal', 'Aumentado', 'Disminuido'] },
    { key: 'lipCompetence', label: 'Competencia labial', options: ['Competente', 'Incompetente'] },
    { key: 'smile', label: 'Sonrisa', options: ['Consonante', 'No consonante', 'Gingival'] },
    { key: 'dentalExposure', label: 'Exposición dental', placeholder: 'mm en reposo / sonrisa' },
    { key: 'buccalCorridor', label: 'Corredor bucal', options: ['Normal', 'Amplio', 'Reducido'] },
  ];

  readonly orthoIntraoralFields: DentalField<DentistryContent['orthodontics']['intraoral']>[] = [
    { key: 'molarRight', label: 'Clase molar derecha', options: ['Clase I', 'Clase II', 'Clase III', 'No evaluable'] },
    { key: 'molarLeft', label: 'Clase molar izquierda', options: ['Clase I', 'Clase II', 'Clase III', 'No evaluable'] },
    { key: 'canineRight', label: 'Clase canina derecha', options: ['Clase I', 'Clase II', 'Clase III', 'No evaluable'] },
    { key: 'canineLeft', label: 'Clase canina izquierda', options: ['Clase I', 'Clase II', 'Clase III', 'No evaluable'] },
    { key: 'overjet', label: 'Overjet (mm)', placeholder: '2' },
    { key: 'overbite', label: 'Overbite (mm)', placeholder: '2' },
    { key: 'openBite', label: 'Mordida abierta', options: ['No', 'Anterior', 'Posterior'] },
    { key: 'crossBite', label: 'Mordida cruzada', options: ['No', 'Anterior', 'Posterior unilateral', 'Posterior bilateral'] },
    { key: 'deepBite', label: 'Mordida profunda', options: ['No', 'Sí'] },
    { key: 'crowding', label: 'Apiñamiento', options: ['No', 'Leve', 'Moderado', 'Severo'] },
    { key: 'diastemas', label: 'Diastemas', placeholder: 'Ubicación' },
    { key: 'dentalMidline', label: 'Línea media dental', placeholder: 'Coincide / desviada 2 mm a la derecha' },
    { key: 'curveOfSpee', label: 'Curva de Spee', options: ['Plana', 'Normal', 'Profunda'] },
  ];

  readonly orthoCephFields: DentalField<DentistryContent['orthodontics']['cephalometry']>[] = [
    { key: 'sna', label: 'SNA (°)', placeholder: '82' },
    { key: 'snb', label: 'SNB (°)', placeholder: '80' },
    { key: 'anb', label: 'ANB (°)', placeholder: '2' },
    { key: 'wits', label: 'Wits (mm)', placeholder: '0' },
    { key: 'fma', label: 'FMA (°)', placeholder: '25' },
    { key: 'impa', label: 'IMPA (°)', placeholder: '90' },
    { key: 'upperIncisor', label: 'Incisivo superior U1-SN (°)', placeholder: '103' },
    { key: 'skeletalClass', label: 'Clase esquelética', options: ['Clase I', 'Clase II', 'Clase III'] },
    { key: 'growthPattern', label: 'Patrón de crecimiento', options: ['Neutro', 'Horizontal', 'Vertical'] },
  ];

  readonly orthoModelFields: DentalField<DentistryContent['orthodontics']['models']>[] = [
    { key: 'upperDiscrepancy', label: 'Discrepancia superior (mm)', placeholder: '-3' },
    { key: 'lowerDiscrepancy', label: 'Discrepancia inferior (mm)', placeholder: '-2' },
    { key: 'bolton', label: 'Índice de Bolton', placeholder: 'Anterior 77,2 % · total 91,3 %' },
    { key: 'archForm', label: 'Forma de arcada', options: ['Ovoide', 'Cuadrada', 'Triangular'] },
  ];

  readonly orthoPhases = ['Interceptiva / ortopedia', 'Correctiva', 'Preparación quirúrgica (ortognática)', 'Retención'];

  /** Estado de una medida numérica de ortodoncia (interpretación, norma o error); `null` si el campo no es numérico. */
  orthoMeasure(group: OrthoMeasureGroup, field: string): OrthoMeasureStatus | null {
    const key = measureKey(group, field);
    if (!key) return null;
    const values = this.dental().orthodontics[group] as Record<string, string>;
    return checkMeasure(key, values[field]);
  }

  /** El ANB se deduce de SNA y SNB cuando ambos son válidos. */
  anbComputed() {
    return anbFrom(this.dental().orthodontics) !== null;
  }

  onOrthoMeasureChange(group: OrthoMeasureGroup, field: string) {
    if (group === 'cephalometry' && (field === 'sna' || field === 'snb')) {
      const anb = anbFrom(this.dental().orthodontics);
      if (anb !== null) this.dental().orthodontics.cephalometry.anb = anb;
    }
    this.onClinicalFieldChange();
  }

  /** Clase esquelética sugerida por el ANB y patrón de crecimiento sugerido por el FMA. */
  orthoSuggestion(field: string): string | null {
    const o = this.dental().orthodontics;
    const suggested = field === 'skeletalClass' ? skeletalClassFromAnb(o) : field === 'growthPattern' ? growthPatternFromFma(o) : null;
    if (!suggested) return null;
    return (o.cephalometry as Record<string, string>)[field] === suggested ? null : suggested;
  }

  applyOrthoSuggestion(field: 'skeletalClass' | 'growthPattern') {
    const suggested = this.orthoSuggestion(field);
    if (!suggested || this.clinicalFormDisabled()) return;
    this.dental().orthodontics.cephalometry[field] = suggested;
    this.onClinicalFieldChange();
  }

  orthoWarnings() {
    return orthoConsistencyWarnings(this.dental().orthodontics);
  }

  /** Bloques del ortodoncista; en odontología solo aparecen si la historia ya los traía. */
  showOrthoSpecialistFields() {
    return this.isOrthoClinic() || hasOrthoSpecialistData(this.dental());
  }

  /** Módulos de la historia odontológica (menú superior). */
  odoModules() {
    const ortho = this.showOrthoModule();
    const list = [
      { id: 'odo-identificacion', label: 'Identificación' },
      { id: 'odo-motivo', label: 'Motivo' },
      { id: 'hce-section-3', label: 'Antecedentes' },
      { id: 'odo-examen', label: 'Examen clínico' },
      { id: 'odontograma', label: 'Odontograma' },
      ...(ortho ? [{ id: 'odo-ortodoncia', label: this.isOrthoClinic() ? 'Evaluación ortodóntica' : 'Ortodoncia' }] : []),
      { id: 'odo-imagenes', label: 'Fotos y radiografías' },
      { id: 'odo-diagnosticos', label: 'Diagnóstico' },
      { id: 'odo-plan', label: 'Plan de tratamiento' },
      { id: 'odo-evoluciones-en-formulario', label: 'Evolución' },
      { id: 'consent-section', label: 'Consentimientos' },
      { id: 'odo-prescripciones', label: 'Prescripciones y órdenes' },
      { id: 'anexos-section', label: 'Anexos' },
      { id: 'odo-cierre', label: 'Cierre' },
    ];
    return list.map((m, i) => ({ ...m, n: i + 1 }));
  }

  scrollToOdo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Numeración de módulos: sin ortodoncia, los módulos 7+ se corren un lugar. */
  odoNum(n: number): number {
    return n >= 7 && !this.showOrthoModule() ? n - 1 : n;
  }

  /** En odontología la ortodoncia solo aparece si la historia ya la traía registrada (no se pierde información). */
  showOrthoModule() {
    const d = this.dental();
    return this.isOrthoClinic() || d.service === 'ORTODONCIA' || d.includeOrtho || hasOrthodonticData(d);
  }

  /** Servicios del consultorio de odontología: la ortodoncia es una especialidad aparte. */
  dentalServiceOptions() {
    const current = this.dental().service;
    return this.dentalServices.filter((s) => s.key !== 'ORTODONCIA' || current === 'ORTODONCIA');
  }

  dentalSpecialtyLabel() {
    return this.isOrthoClinic() ? 'Ortodoncia' : 'Odontología';
  }

  dentalRecordCode() {
    return this.isOrthoClinic() ? 'HC-ORT-001' : 'HC-ODO-001';
  }

  /** Consentimientos disponibles según la especialidad (conserva los ya exigidos en la atención). */
  dentalConsentChoices() {
    const required = new Set(this.dental().requiredConsents);
    const allowed = this.isOrthoClinic() ? ORTHO_CONSENT_KEYS : DENTAL_ONLY_CONSENT_KEYS;
    return this.dentalConsentOptions.filter((c) => allowed.has(c.key) || required.has(c.key));
  }

  /** Fuera de Periodoncia solo se piden los hallazgos básicos; el resto aparece si ya tiene dato. */
  private readonly basicPeriodontalKeys = new Set(['gingiva', 'bleeding', 'plaque', 'calculus']);

  visiblePeriodontalFields() {
    const d = this.dental();
    if (d.service === 'PERIODONCIA') return this.dentalPeriodontalFields;
    return this.dentalPeriodontalFields.filter(
      (f) => this.basicPeriodontalKeys.has(f.key) || !!String(d.periodontal[f.key] ?? '').trim(),
    );
  }

  readonly dentalAdminOpen = signal(false);

  toggleDentalFlag(flags: Record<string, boolean>, key: string, checked: boolean) {
    if (checked) flags[key] = true;
    else delete flags[key];
    this.onClinicalFieldChange();
  }

  /** «Niega» y «No sabe» excluyen al resto de alergias. */
  toggleDentalAllergy(key: string, checked: boolean) {
    const flags = this.dental().allergies;
    const exclusive = key === 'none' || key === 'unknown';
    if (checked) {
      if (exclusive) for (const k of Object.keys(flags)) delete flags[k];
      else {
        delete flags['none'];
        delete flags['unknown'];
      }
      flags[key] = true;
    } else delete flags[key];
    if (key === 'anesthetics' && checked && !this.dental().dentalHistory.anesthesiaReaction) {
      this.dental().dentalHistory.anesthesiaReaction = 'SI';
    }
    this.onClinicalFieldChange();
  }

  /** Una reacción a la anestesia queda también como alergia a anestésicos (mismo aviso de precaución). */
  onAnesthesiaReactionChange(value: string) {
    if (value === 'SI' && !this.dental().allergies['anesthetics']) {
      this.toggleDentalAllergy('anesthetics', true);
    } else {
      this.onClinicalFieldChange();
    }
  }

  /** La respiración oral o mixta del examen extraoral marca el hábito en Antecedentes. */
  onExtraoralChange(key: string, value: string) {
    if (key === 'breathing' && (value === 'Oral' || value === 'Mixta')) {
      this.dental().habits['mouthBreathing'] = true;
    }
    this.onClinicalFieldChange();
  }

  /** Perfil, simetría y tercio inferior se registran en el examen extraoral; en Ortodoncia solo se ven si ya tenían dato. */
  private readonly orthoFacialShared = new Set(['profile', 'symmetry', 'lowerThird']);

  visibleOrthoFacialFields() {
    const facial = this.dental().orthodontics.facial;
    return this.orthoFacialFields.filter((f) => !this.orthoFacialShared.has(f.key) || !!facial[f.key]?.trim());
  }

  extraoralSummaryForOrtho() {
    const e = this.dental().extraoral;
    return [
      ['Perfil', e.profile],
      ['Simetría', e.symmetry],
      ['Tercios faciales', e.facialThirds],
      ['Labios', e.lips],
      ['Respiración', e.breathing],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
  }

  orthoHabitSummary() {
    const habits = this.dental().habits;
    return this.orthoHabitItems.filter((h) => habits[h.key]).map((h) => h.label);
  }

  /** Piezas con la marca «Movilidad» en el odontograma. */
  odontogramMobilityTeeth() {
    return Object.entries(this.dental().odontogram)
      .filter(([, rec]) => rec.marks?.includes('MOVILIDAD'))
      .map(([tooth]) => tooth)
      .sort((a, b) => Number(a) - Number(b));
  }

  private activePlanRows() {
    return this.dental().treatmentPlan.filter(
      (r) => (r.status === 'EN_TRATAMIENTO' || r.status === 'TERMINADO') && (r.code.trim() || r.description.trim()),
    );
  }

  hasActivePlanRows() {
    return this.activePlanRows().length > 0;
  }

  /** Agrega a los CUPS de la sesión los procedimientos del plan en tratamiento o terminados (sin repetir). */
  pullCupsFromPlan() {
    const existing = new Set(this.procedures.map((p) => p.cupsCode.trim()));
    const added = this.activePlanRows()
      .filter((r) => r.code.trim() && !existing.has(r.code.trim()))
      .map((r) => ({ cupsCode: r.code.trim(), description: r.description.trim() }));
    if (!added.length) {
      this.message.set('Los procedimientos del plan ya están en la lista de CUPS.');
      return;
    }
    this.procedures = [...this.procedures, ...added];
    this.notifyProcedureChange();
  }

  /** Precarga la evolución con las piezas y procedimientos del plan y las prescripciones. */
  fillEvolutionFromPlan() {
    const rows = this.activePlanRows();
    const e = this.dentalEvolution;
    if (!e.teeth.trim()) {
      e.teeth = [...new Set(rows.map((r) => r.tooth.trim()).filter(Boolean))].join(', ');
    }
    if (!this.evolutionNote.trim()) {
      this.evolutionNote = rows
        .map((r) => [r.tooth.trim() && `Pieza ${r.tooth.trim()}`, r.description.trim() || r.code.trim()].filter(Boolean).join(': '))
        .join('\n');
    }
    if (!e.instructions.trim()) {
      e.instructions = this.dental()
        .prescriptions.filter((p) => p.medication.trim())
        .map((p) => [p.medication, p.dose, p.frequency, p.duration].map((v) => v.trim()).filter(Boolean).join(' '))
        .join('; ');
    }
  }

  setNoMedications(checked: boolean) {
    const meds = this.dental().medications;
    meds.none = checked;
    if (checked) meds.rows = meds.rows.filter((r) => r.name.trim());
    this.onClinicalFieldChange();
  }

  addMedicationRow() {
    const meds = this.dental().medications;
    meds.none = false;
    meds.rows.push(emptyMedicationRow());
    this.onClinicalFieldChange();
  }

  addPrescriptionRow() {
    this.dental().prescriptions.push(emptyPrescriptionRow());
    this.onClinicalFieldChange();
  }

  addOrderRow() {
    this.dental().orders.push(emptyOrderRow());
    this.onClinicalFieldChange();
  }

  addImagingRow() {
    this.dental().imaging.push(emptyImagingRow());
    this.onClinicalFieldChange();
  }

  removeDentalRow<T>(rows: T[], index: number) {
    rows.splice(index, 1);
    this.onClinicalFieldChange();
  }

  dentalRiskMedicationText() {
    const groups = this.dental().medications.groups;
    return MEDICATION_GROUPS.filter((g) => groups[g.key])
      .map((g) => g.label)
      .join(', ');
  }

  dentalDiagnosisOptions() {
    return this.dental()
      .diagnoses.filter((d) => d.cieCode.trim())
      .map((d) => {
        const value = `${d.cieCode.trim().toUpperCase()} ${d.description.trim()}`.trim();
        return { value, label: value };
      });
  }

  treatmentCount(status: TreatmentStatus) {
    return this.dental().treatmentPlan.filter((r) => (r.status || 'PENDIENTE') === status).length;
  }

  treatmentTotal() {
    return this.dental()
      .treatmentPlan.filter((r) => r.status !== 'CANCELADO')
      .reduce((sum, r) => sum + (Number(String(r.value || '').replace(/[^\d.]/g, '')) || 0), 0);
  }

  // ── Fotografías clínicas y radiografías ──
  readonly dentalPhotoUploading = signal<string | null>(null);
  readonly imagingUploading = signal<number | null>(null);
  private readonly dentalPhotoUrls = signal<Record<string, string>>({});
  private readonly dentalPhotoPending = new Set<string>();

  photoSlotsOf(group: string) {
    return PHOTO_SLOTS.filter((s) => s.group === group);
  }

  /** Miniatura de la foto del espacio; se descarga una sola vez por adjunto. */
  dentalPhotoUrl(slotKey: string): string | null {
    const photo = this.dental().photos[slotKey];
    if (!photo?.attachmentId) return null;
    const cached = this.dentalPhotoUrls()[photo.attachmentId];
    if (cached) return cached;
    if (!this.dentalPhotoPending.has(photo.attachmentId)) {
      const id = photo.attachmentId;
      this.dentalPhotoPending.add(id);
      this.api.downloadAttachment(id).subscribe({
        next: (blob) =>
          this.dentalPhotoUrls.update((m) => ({ ...m, [id]: URL.createObjectURL(blob) })),
        error: () => undefined,
      });
    }
    return null;
  }

  private uploadDentalFile(file: File, label: string, category: 'PHOTO' | 'IMAGE') {
    const enc = this.encounter();
    if (!enc) {
      this.error.set('Inicie la atención antes de subir archivos.');
      return null;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('encounterId', enc.id);
    if (enc.clinicalRecord?.id) form.append('clinicalRecordId', enc.clinicalRecord.id);
    form.append('label', label);
    form.append('category', category);
    return this.api.uploadAttachment(form);
  }

  uploadDentalPhoto(slotKey: string, label: string, group: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const req = this.uploadDentalFile(file, `Foto ${group.toLowerCase()} — ${label}`, 'PHOTO');
    if (!req) return;
    this.dentalPhotoUploading.set(slotKey);
    req.subscribe({
      next: (att) => {
        this.dentalPhotoUploading.set(null);
        this.dental().photos[slotKey] = {
          attachmentId: att.id,
          fileName: file.name,
          takenAt: new Date().toISOString(),
        };
        this.dentalPhotoUrls.update((m) => ({ ...m, [att.id]: URL.createObjectURL(file) }));
        this.attachments.set([att, ...this.attachments()]);
        this.onClinicalFieldChange();
      },
      error: (err) => {
        this.dentalPhotoUploading.set(null);
        this.error.set(err?.error?.message || 'No se pudo subir la fotografía.');
      },
    });
  }

  /** Quita la foto del espacio; el archivo sigue en Anexos. */
  removeDentalPhoto(slotKey: string) {
    delete this.dental().photos[slotKey];
    this.onClinicalFieldChange();
  }

  uploadDentalImaging(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const row = this.dental().imaging[index];
    if (!file || !row) return;
    const req = this.uploadDentalFile(file, `${row.type || 'Imagen diagnóstica'} — ${file.name}`, 'IMAGE');
    if (!req) return;
    this.imagingUploading.set(index);
    req.subscribe({
      next: (att) => {
        this.imagingUploading.set(null);
        row.attachmentId = att.id;
        row.fileName = file.name;
        if (!row.date) row.date = new Date().toISOString().slice(0, 10);
        this.attachments.set([att, ...this.attachments()]);
        this.onClinicalFieldChange();
      },
      error: (err) => {
        this.imagingUploading.set(null);
        this.error.set(err?.error?.message || 'No se pudo subir la imagen.');
      },
    });
  }

  // ── Consentimientos requeridos en la atención ──
  dentalConsentRequired(code: string) {
    return this.dental().requiredConsents.includes(code);
  }

  toggleDentalConsent(code: string, checked: boolean) {
    const list = this.dental().requiredConsents;
    const i = list.indexOf(code);
    if (checked && i < 0) list.push(code);
    if (!checked && i >= 0) list.splice(i, 1);
    this.onClinicalFieldChange();
  }

  dentalConsentSignedAt(code: string): string | null {
    const encId = this.encounter()?.id;
    const rows = this.consentSigner?.signed() || [];
    const match = rows.find(
      (r) => r.template?.code === code && (!encId || !r.encounterId || r.encounterId === encId),
    );
    return match?.signedAt || null;
  }

  signDentalConsent(code: string) {
    if (!this.consentPatientId()) {
      this.error.set('Seleccione o cree un paciente e inicie la atención primero.');
      return;
    }
    this.consentSigner?.selectTemplateByCode(code);
    document.getElementById('consent-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Plan e indicaciones al paciente ──
  readonly dentalInstructionTemplates = [
    { key: 'PLAN', label: 'Plan de tratamiento' },
    { key: 'POST_EXTRACCION', label: 'Indicaciones post-extracción / cirugía' },
    { key: 'POST_ENDODONCIA', label: 'Indicaciones post-endodoncia' },
    { key: 'ORTODONCIA', label: 'Indicaciones de ortodoncia' },
    { key: 'HIGIENE', label: 'Higiene oral' },
  ];
  readonly dentalInstructionsOpen = signal(false);
  readonly dentalInstructionsKind = signal('PLAN');
  readonly dentalInstructionsSending = signal(false);
  dentalInstructionsText = '';

  openDentalInstructions() {
    if (!this.selectedPatientId && !this.encounter()?.patient?.id) {
      this.error.set('Seleccione un paciente primero.');
      return;
    }
    this.pickDentalInstructions(this.dental().treatmentPlan.some((r) => r.description.trim()) ? 'PLAN' : 'HIGIENE');
    this.dentalInstructionsOpen.set(true);
  }

  pickDentalInstructions(kind: string) {
    this.dentalInstructionsKind.set(kind);
    this.dentalInstructionsText = this.buildDentalInstructions(kind);
  }

  private buildDentalInstructions(kind: string): string {
    const name = `${this.patientForm.firstName || ''}`.trim();
    const clinic = this.user()?.clinicName || 'el consultorio';
    const hello = `Hola${name ? ' ' + name : ''}, le escribimos de ${clinic}.`;
    const bye = 'Ante dolor intenso, sangrado que no cede, fiebre o inflamación que aumenta, comuníquese con nosotros.';
    switch (kind) {
      case 'PLAN': {
        const rows = this.dental().treatmentPlan.filter((r) => r.description.trim() && r.status !== 'CANCELADO');
        const lines = rows.map((r, i) => {
          const tooth = r.tooth ? ` (pieza ${r.tooth})` : '';
          const value = Number(String(r.value || '').replace(/[^\d.]/g, ''));
          const price = value ? ` — $${value.toLocaleString('es-CO')}` : '';
          return `${i + 1}. ${r.description.trim()}${tooth}${price}`;
        });
        const total = this.treatmentTotal();
        return [
          hello,
          '',
          'Este es su plan de tratamiento odontológico:',
          ...(lines.length ? lines : ['(Sin procedimientos registrados)']),
          ...(total ? ['', `Valor total estimado: $${total.toLocaleString('es-CO')}`] : []),
          '',
          'Si tiene preguntas sobre el plan, con gusto las resolvemos en su próxima cita.',
        ].join('\n');
      }
      case 'POST_EXTRACCION':
        return [
          hello,
          '',
          'Indicaciones después de la extracción o cirugía:',
          '• Muerda la gasa durante 30–45 minutos.',
          '• Aplique frío por fuera, 10 minutos sí y 10 no, durante las primeras 24 horas.',
          '• No escupa, no use pitillo, no fume ni tome alcohol por 72 horas.',
          '• Dieta blanda y fría las primeras 24 horas; mastique por el lado contrario.',
          '• No se enjuague el primer día; desde el segundo, enjuagues suaves con agua tibia y sal.',
          '• Tome los medicamentos formulados en el horario indicado.',
          '• Duerma con la cabeza elevada la primera noche.',
          '',
          bye,
        ].join('\n');
      case 'POST_ENDODONCIA':
        return [
          hello,
          '',
          'Indicaciones después de la endodoncia:',
          '• Es normal una leve sensibilidad al morder durante algunos días.',
          '• Evite masticar alimentos duros por el lado tratado hasta la restauración definitiva.',
          '• Si tiene una obturación provisional, no la retire y evite chicles o alimentos pegajosos.',
          '• Tome los medicamentos formulados en el horario indicado.',
          '• Asista a la cita para la restauración definitiva (resina o corona).',
          '',
          bye,
        ].join('\n');
      case 'ORTODONCIA':
        return [
          hello,
          '',
          'Indicaciones para su tratamiento de ortodoncia:',
          '• Cepíllese después de cada comida con cepillo de ortodoncia e interproximal.',
          '• Use seda dental con enhebrador y enjuague con flúor según indicación.',
          '• Evite alimentos duros o pegajosos (hielo, caramelos, maíz pira, chicle).',
          '• Use la cera de ortodoncia si algún bracket o alambre le lastima.',
          '• Si un bracket se despega o un alambre se suelta, avise antes de su control.',
          '• Asista puntualmente a sus controles mensuales.',
        ].join('\n');
      default:
        return [
          hello,
          '',
          'Recomendaciones de higiene oral:',
          '• Cepíllese 3 veces al día durante 2 minutos, con crema dental con flúor.',
          '• Use seda dental al menos una vez al día, preferiblemente en la noche.',
          '• Cambie el cepillo cada 3 meses.',
          '• Reduzca el consumo de azúcares entre comidas.',
          '• Visite al odontólogo cada 6 meses para control y limpieza.',
        ].join('\n');
    }
  }

  whatsappDentalInstructions() {
    const digits = String(this.patientForm.phone || '').replace(/\D/g, '');
    if (!digits) {
      this.error.set('El paciente no tiene teléfono registrado.');
      return;
    }
    const phone = digits.length === 10 ? `57${digits}` : digits;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(this.dentalInstructionsText)}`, '_blank');
    this.logDentalInstructions('WHATSAPP');
    this.dentalInstructionsOpen.set(false);
  }

  emailDentalInstructions() {
    this.logDentalInstructions('EMAIL', true);
  }

  private logDentalInstructions(channel: 'EMAIL' | 'WHATSAPP', closeOnDone = false) {
    const id = this.encounter()?.patient?.id || this.selectedPatientId;
    if (!id) return;
    const label = this.dentalInstructionTemplates.find((t) => t.key === this.dentalInstructionsKind())?.label || 'Indicaciones';
    if (channel === 'EMAIL') this.dentalInstructionsSending.set(true);
    this.api
      .sendDentalInstructions(id, {
        channel,
        title: label,
        message: this.dentalInstructionsText,
        encounterId: this.encounter()?.id,
      })
      .subscribe({
        next: (res) => {
          this.dentalInstructionsSending.set(false);
          if (channel === 'EMAIL') {
            this.message.set(res.message || 'Indicaciones enviadas por correo.');
            if (closeOnDone) this.dentalInstructionsOpen.set(false);
          }
        },
        error: (err) => {
          this.dentalInstructionsSending.set(false);
          if (channel === 'EMAIL') this.error.set(err?.error?.message || 'No se pudo enviar el correo.');
        },
      });
  }

  // ── Evolución odontológica estructurada ──
  dentalEvolution = emptyDentalEvolution();

  /** Autocompletado CIE-10 / CUPS por fila en diagnósticos y plan odontológico. */
  readonly dentalCieRow = signal<number | null>(null);
  readonly dentalCieResults = signal<CatalogCode[]>([]);
  readonly dentalCupsRow = signal<number | null>(null);
  readonly dentalCupsResults = signal<CatalogCode[]>([]);
  private dentalSearchTimer?: ReturnType<typeof setTimeout>;

  onDentalCieInput(index: number, value: string) {
    this.onClinicalFieldChange();
    this.searchDentalCie(index, value, 200);
  }

  openDentalCie(index: number) {
    if (this.clinicalFormDisabled()) return;
    this.dentalCupsResults.set([]);
    this.searchDentalCie(index, this.dental().diagnoses[index]?.cieCode || '', 0);
  }

  private searchDentalCie(index: number, value: string, delay: number) {
    clearTimeout(this.dentalSearchTimer);
    const q = (value || '').trim();
    this.dentalSearchTimer = setTimeout(() => {
      this.api.searchCie(q).subscribe({
        next: (rows) => {
          this.dentalCieRow.set(index);
          this.dentalCieResults.set(rows);
        },
        error: () => this.dentalCieResults.set([]),
      });
    }, delay);
  }

  pickDentalCie(index: number, item: CatalogCode) {
    const row = this.dental().diagnoses[index];
    if (!row) return;
    row.cieCode = item.code;
    if (!row.description.trim()) row.description = item.description;
    this.dentalCieResults.set([]);
    this.dentalCieRow.set(null);
    this.onClinicalFieldChange();
  }

  onDentalCupsInput(index: number, value: string) {
    this.onClinicalFieldChange();
    this.searchDentalCups(index, value, 200);
  }

  openDentalCups(index: number) {
    if (this.clinicalFormDisabled()) return;
    this.dentalCieResults.set([]);
    this.searchDentalCups(index, this.dental().treatmentPlan[index]?.code || '', 0);
  }

  private searchDentalCups(index: number, value: string, delay: number) {
    clearTimeout(this.dentalSearchTimer);
    const q = (value || '').trim();
    this.dentalSearchTimer = setTimeout(() => {
      this.api.searchCups(q).subscribe({
        next: (rows) => {
          this.dentalCupsRow.set(index);
          this.dentalCupsResults.set(rows);
        },
        error: () => this.dentalCupsResults.set([]),
      });
    }, delay);
  }

  pickDentalCups(index: number, item: CatalogCode) {
    const row = this.dental().treatmentPlan[index];
    if (!row) return;
    row.code = item.code;
    if (!row.description.trim()) row.description = item.description;
    this.dentalCupsResults.set([]);
    this.dentalCupsRow.set(null);
    this.onClinicalFieldChange();
  }

  closeDentalSuggestions() {
    setTimeout(() => {
      this.dentalCieResults.set([]);
      this.dentalCupsResults.set([]);
    }, 150);
  }

  addDentalDiagnosis() {
    this.dental().diagnoses.push(emptyDentalDiagnosis());
    this.onClinicalFieldChange();
  }

  removeDentalDiagnosis(index: number) {
    const rows = this.dental().diagnoses;
    rows.splice(index, 1);
    if (!rows.length) rows.push(emptyDentalDiagnosis());
    this.onClinicalFieldChange();
  }

  addTreatmentRow() {
    this.dental().treatmentPlan.push(emptyTreatmentRow());
    this.onClinicalFieldChange();
  }

  removeTreatmentRow(index: number) {
    const rows = this.dental().treatmentPlan;
    rows.splice(index, 1);
    if (!rows.length) rows.push(emptyTreatmentRow());
    this.onClinicalFieldChange();
  }

  toggleDentalSystem(key: string, checked: boolean) {
    const map = this.dental().systemsReview;
    if (checked) map[key] = true;
    else delete map[key];
    this.onClinicalFieldChange();
  }

  /** Número visible de cada bloque compartido según la plantilla de la especialidad. */
  hceSectionNumber(key: 'cie' | 'cups' | 'rda' | 'consent' | 'audit' | 'annex'): string {
    const map = this.isDentistryClinic()
      ? {
          cie: `${this.odoNum(8)}`,
          cups: `${this.odoNum(9)}.1`,
          rda: '',
          consent: `${this.odoNum(11)}`,
          audit: '',
          annex: `${this.odoNum(13)}`,
        }
      : this.isPhysiotherapyClinic()
        ? { cie: '5', cups: '6', rda: '7', consent: '8', audit: '9', annex: '10' }
        : { cie: '4', cups: '5', rda: '6', consent: '7', audit: '8', annex: '9' };
    const n = map[key];
    return n ? `${n}. ` : '';
  }

  /** Examen mental obligatorio en las notas de control (solo psicología). */
  requiresMentalExamInEvolution() {
    return !this.isPhysiotherapyClinic() && !this.isDentistryClinic();
  }

  /** Filas legibles de valoración funcional (solo FT). */
  ftFunctionalSummaryRows(): Array<{ label: string; value: string }> {
    if (!this.isPhysiotherapyClinic()) return [];
    const fa = this.physio().functionalAssessment || {};
    const statusLabel = (v: string) => {
      if (v === 'NORMAL') return 'Normal';
      if (v === 'ALTERADO') return 'Alterado';
      if (v === 'NA') return 'N/A';
      return (v || '').trim();
    };
    const rows: Array<{ label: string; value: string }> = [];
    const pain = (fa['pain'] || '').trim();
    if (pain) {
      rows.push({
        label: 'Dolor (EVA 1–10)',
        value: /^\d+$/.test(pain) ? `${pain} / 10` : statusLabel(pain),
      });
    }
    const strength = (fa['muscleStrength'] || '').trim();
    const strengthDetail = (fa['muscleStrengthDetail'] || '').trim();
    if (strength || strengthDetail) {
      rows.push({
        label: 'Fuerza muscular (Daniels)',
        value: [strength, strengthDetail].filter(Boolean).join(' — ') || statusLabel(strength),
      });
    }
    const tone = (fa['muscleTone'] || '').trim();
    if (tone) rows.push({ label: 'Tono muscular', value: statusLabel(tone) });
    const mobility = (fa['jointMobility'] || '').trim();
    if (mobility) rows.push({ label: 'Movilidad articular (goniometría)', value: statusLabel(mobility) });
    for (const fn of this.ftFunctionalKeys) {
      const v = (fa[fn.key] || '').trim();
      if (v) rows.push({ label: fn.label, value: statusLabel(v) });
    }
    return rows;
  }

  hasFtFunctionalAssessment() {
    return this.ftFunctionalSummaryRows().length > 0;
  }

  isPsychologyClinic() {
    if (this.isPhysiotherapyClinic() || this.isDentistryClinic()) return false;
    const specialty = String(this.user()?.specialty || '').toUpperCase();
    return specialty === 'PSYCHOLOGY';
  }

  /** Psicología no emite incapacidades. */
  supportsIncapacity() {
    return !this.isPsychologyClinic();
  }

  /** Acceso tipado al bloque FT (siempre inicializado en emptyContent/hydrate). */
  physio(): PhysiotherapyContent {
    if (!this.content.physiotherapy) {
      this.content.physiotherapy = emptyPhysiotherapy();
    }
    return this.content.physiotherapy;
  }

  readonly ftSystemKeys: Array<{ key: string; label: string }> = [
    { key: 'cardiovascular', label: 'Cardiovascular' },
    { key: 'respiratory', label: 'Respiratorio' },
    { key: 'neurological', label: 'Neurológico' },
    { key: 'musculoskeletal', label: 'Músculo-esquelético' },
    { key: 'skin', label: 'Piel y anexos' },
    { key: 'others', label: 'Otros' },
  ];

  readonly ftFunctionalKeys: Array<{ key: string; label: string }> = [
    { key: 'sensitivity', label: 'Sensibilidad' },
    { key: 'coordination', label: 'Coordinación' },
    { key: 'balance', label: 'Equilibrio' },
    { key: 'gait', label: 'Marcha' },
    { key: 'cardiorespiratory', label: 'Funciones cardiorrespiratorias' },
    { key: 'otherFunctions', label: 'Otras funciones' },
  ];

  /** Solo FT: EVA verbal-numérica 1–10 (dolor). */
  readonly ftPainScale = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  /** Solo FT: escala de Daniels (fuerza muscular). */
  readonly ftDanielsScale: Array<{ value: string; label: string }> = [
    { value: '0/5', label: '0/5 — Sin contracción' },
    { value: '1/5', label: '1/5 — Contracción visible sin movimiento' },
    { value: '2/5', label: '2/5 — Movimiento completo sin gravedad' },
    { value: '3/5', label: '3/5 — Movimiento completo contra gravedad' },
    { value: '4/5', label: '4/5 — Movimiento completo contra resistencia moderada' },
    { value: '5/5', label: '5/5 — Fuerza normal' },
  ];

  readonly ftAntecedentKeys: Array<{ key: keyof PhysiotherapyContent['antecedentsDetail']; label: string }> = [
    { key: 'personal', label: 'Personales' },
    { key: 'pathological', label: 'Patológicos' },
    { key: 'surgical', label: 'Quirúrgicos' },
    { key: 'allergic', label: 'Alérgicos' },
    { key: 'pharmacological', label: 'Farmacológicos' },
    { key: 'family', label: 'Familiares' },
    { key: 'obgyn', label: 'Gineco-obstétricos' },
    { key: 'traumatic', label: 'Traumáticos' },
    { key: 'occupational', label: 'Ocupacionales' },
    { key: 'others', label: 'Otros' },
  ];

  readonly loading = signal(false);
  readonly saving = signal(false);
  /** Aviso flotante discreto (p. ej. «Error al guardar»); no bloquea la edición. */
  readonly saveToast = signal<{ title: string; detail: string } | null>(null);
  private saveToastTimer: ReturnType<typeof setTimeout> | null = null;
  private localDraftTimer: ReturnType<typeof setTimeout> | null = null;
  private autosaveErrorsSub: Subscription | null = null;
  readonly message = signal('');
  readonly error = signal('');

  readonly patients = signal<Patient[]>([]);
  readonly encounters = signal<EncounterListItem[]>([]);
  readonly encounter = signal<Encounter | null>(null);
  readonly incapacities = signal<Incapacity[]>([]);
  readonly attachments = signal<ClinicalAttachment[]>([]);
  readonly noteFormat = signal<ClinicalNoteFormat>('FULL');
  /** Firma del paciente capturada en consentimientos (sidebar). */
  readonly patientSigPreview = signal<string | null>(null);
  /** Consentimientos sellados del paciente (se listan al consultar una HC cerrada). */
  readonly sealedConsents = signal<PatientConsentRecord[]>([]);
  readonly attendanceMetaSaving = signal(false);

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
    measures?: string[];
  } | null>(null);
  /** Trazo vigente de la profesional, venga del panel Ley 527 o del consentimiento. */
  readonly professionalSignature = signal<string | null>(null);
  /** Aviso REPS (vencido / por vencer / sin fecha). Vacío si vigente o no aplica. */
  readonly repsAlert = signal<{ level: string; message: string } | null>(null);
  /** Vista previa de la foto (blob URL o data URL local). */
  readonly patientPhotoPreview = signal<string | null>(null);
  readonly photoUploading = signal(false);
  readonly attachmentUploading = signal(false);
  readonly cameraOpen = signal(false);
  readonly cameraBusy = signal(false);
  private pendingPatientPhoto: File | null = null;
  private patientPhotoObjectUrl: string | null = null;
  private cameraStream: MediaStream | null = null;
  /** Evolución terapéutica de la sesión. */
  evolutionNote = '';
  /** Situación actual: se pre-llena con la de la última evolución del paciente. */
  evolutionCurrentSituation = '';
  /** fecha_atencion_clinica (datetime-local); por defecto, ahora. */
  evolutionAttentionDate = '';
  readonly evolutionSituationInherited = signal<string | null>(null);
  private evolutionSituationPatientId: string | null = null;
  /** Examen mental de la sesión de control (HC ya sellada). */
  evolutionMentalExam = '';
  /** Campos SOAP opcionales (avanzado) en controles. */
  evolutionSoap = { subjective: '', objective: '', assessment: '', plan: '' };
  /** En HC sellada: mostrar u ocultar el cuerpo de la primera atención. */
  readonly showInitialHistory = signal(false);
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
  private diagnosisPersistTimer: ReturnType<typeof setTimeout> | null = null;
  private procedurePersistTimer: ReturnType<typeof setTimeout> | null = null;
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
  readonly defaultServiceLabel = 'Consulta externa';
  location = '';
  purpose = '';
  externalCause = '';
  /** Solo relevante con RIPS activo. */
  generateRipsForThisEncounter = false;
  allergiesText = '';
  medicationsText = '';
  managementPlanText = '';
  readonly dissentOpen = signal(false);
  dissentReason = '';
  readonly referralOpen = signal(false);
  referralForm = {
    toEntity: '',
    specialty: '',
    reason: '',
    urgency: 'Ordinaria',
    cie: '',
  };
  rdaEvents = {
    anamnesis: true,
    mentalExam: true,
    evaluation: true,
    managementPlan: true,
    education: false,
    consents: false,
  };

  // Incapacidad (no aplica en psicología)
  incapacityDraft = {
    startDate: '',
    endDate: '',
    days: 0,
    diagnosisCie: '',
    cause: '',
    observations: '',
  };

  // Multimedia
  attachmentFile: File | null = null;

  readonly now = new Date();
  /** Hora del sistema para una atención aún no creada (se refresca cada 30 s). */
  readonly systemClock = signal(new Date());
  private readonly systemClockTimer = setInterval(() => this.systemClock.set(new Date()), 30_000);

  isSoap() {
    return this.noteFormat() === 'SOAP';
  }

  /** Etiqueta del formato de nota según especialidad del consultorio. */
  noteFormatLabel() {
    if (this.isPhysiotherapyClinic()) {
      return this.noteFormat() === 'SOAP'
        ? 'Historia clínica — Fisioterapia (SOAP)'
        : 'Historia clínica — Fisioterapia';
    }
    if (this.isDentistryClinic()) return `Historia clínica — ${this.dentalSpecialtyLabel()} (${this.dentalRecordCode()})`;
    if (this.isPsychologyClinic()) {
      return this.noteFormat() === 'SOAP'
        ? 'Evolución Psicológica (SOAP)'
        : 'Evolución Psicológica';
    }
    return this.noteFormat() === 'SOAP' ? 'Nota clínica (SOAP)' : 'Nota clínica';
  }

  /** Profesional con módulo RIPS (Res. 2275) activo. */
  ripsEnabled() {
    return this.user()?.ripsEnabled === true;
  }

  patientAgeYears(): number | null {
    const raw = this.patientForm.birthDate;
    if (!raw) return null;
    const birth = new Date(raw);
    if (Number.isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
    return age;
  }

  /** Menor por edad (< 18) o por tipo de documento (TI, RC, CN, MS). */
  isMinor() {
    if (MINOR_DOCUMENT_TYPES.has((this.patientForm.documentType ?? '').trim().toUpperCase())) {
      return true;
    }
    const age = this.patientAgeYears();
    return age !== null && age < 18;
  }

  /** Firma de la Dra para consentimientos: trazo local, perfil o la sellada en la HC. */
  consentProfessionalSignature(): string | null {
    return (
      this.professionalSignature() ||
      this.storedSignature() ||
      this.content.signature?.signatureBase64 ||
      null
    );
  }

  ensureClinicLocation() {
    if (!this.location.trim()) {
      this.location = this.user()?.clinicAddress?.trim() || '';
    }
  }

  defaultServiceType(): string {
    return this.defaultServiceLabel;
  }

  ensureDefaultServiceType() {
    this.serviceType = this.defaultServiceLabel;
  }

  /** Datos de atención: en HC nueva editable en cuanto hay paciente seleccionado. */
  attendanceMetaDisabled(): boolean {
    if (!this.canWrite() || this.isLocked()) return true;
    return !this.encounter() && !this.selectedPatientId;
  }

  /** Fecha de digitación y modalidad: editables también con la HC sellada. */
  canEditAttendanceMeta(): boolean {
    if (!this.canWrite()) return false;
    return !!this.encounter() || !this.isLocked();
  }

  /** Fecha de digitación editable solo cuando la atención ya existe en BD. */
  canEditDocumentedAt(): boolean {
    return this.canWrite() && !!this.encounter();
  }

  documentedAtLocal(): string {
    const raw =
      this.content.documentedAt || this.encounter()?.createdAt || this.encounter()?.startedAt;
    return raw ? this.toLocalInputValue(new Date(raw)) : '';
  }

  nowLocal(): string {
    return this.toLocalInputValue(new Date());
  }

  private toLocalInputValue(d: Date): string {
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  onDocumentedAtChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    if (date.getTime() > Date.now()) {
      this.error.set('La fecha de digitación no puede ser futura.');
      (event.target as HTMLInputElement).value = this.documentedAtLocal();
      return;
    }
    this.persistAttendanceMeta({ documentedAt: date.toISOString() });
  }

  onModalityChange(value: 'IN_PERSON' | 'VIRTUAL') {
    this.modality = value;
    if (!this.encounter()) return;
    this.persistAttendanceMeta({ modality: value });
  }

  private persistAttendanceMeta(body: { modality?: string; documentedAt?: string }) {
    const enc = this.encounter();
    if (!enc?.id) return;
    const previousModality = enc.modality;
    const previousDocumentedAt = this.content.documentedAt;
    if (body.documentedAt) this.content.documentedAt = body.documentedAt;
    this.attendanceMetaSaving.set(true);
    this.error.set('');
    this.api.updateAttendanceMeta(enc.id, body).subscribe({
      next: (fresh) => {
        this.attendanceMetaSaving.set(false);
        this.encounter.set({ ...enc, modality: fresh.modality });
        this.modality = fresh.modality;
        const savedAt = fresh.clinicalRecord?.content?.documentedAt;
        if (savedAt) this.content.documentedAt = savedAt;
        this.message.set(
          body.documentedAt
            ? 'Fecha de digitación actualizada y guardada.'
            : `Modalidad guardada: ${fresh.modality === 'VIRTUAL' ? 'Virtual' : 'Presencial'}.`,
        );
      },
      error: (err) => {
        this.attendanceMetaSaving.set(false);
        this.modality = previousModality;
        this.content.documentedAt = previousDocumentedAt;
        const detail = this.describeSaveError(err, 'No se pudieron guardar los datos de la atención.');
        this.error.set(detail);
        this.showSaveError(detail);
      },
    });
  }

  /** Anexos: siempre se puede elegir archivo; se persisten al guardar la HC. */
  attachmentsEnabled(): boolean {
    return this.canWrite();
  }

  attachmentsHint(): string | null {
    if (!this.canWrite()) return null;
    if (!this.encounter() && !this.selectedPatientId) {
      return 'Seleccione un paciente arriba. El archivo que elija quedará listo y se guardará al pulsar «Guardar historia clínica».';
    }
    return null;
  }

  selectedAttachmentNames(): string {
    const files = this.pendingAttachmentFileList();
    if (!files.length) return '';
    if (files.length === 1) return files[0].name;
    return `${files.length} archivos: ${files.map((f) => f.name).join(', ')}`;
  }

  /** Abre la atención en servidor si hace falta y continúa la acción. */
  private withEncounterReady(): Observable<Encounter> {
    const current = this.encounter();
    if (current) return of(current);
    if (!this.selectedPatientId) {
      return throwError(() => ({ error: { message: 'Seleccione un paciente.' } }));
    }
    return this.api.createEncounter(this.selectedPatientId, this.modality).pipe(
      tap((enc) => {
        this.pendingEncounterForPatient = null;
        // applyEncounter reemplaza el formulario: antes se respalda lo escrito mientras respondía.
        this.writeLocalDraftNow();
        this.applyEncounter(enc);
        this.refreshLists();
        this.writeLocalDraftNow();
        this.autosave.retryPendingSave();
      }),
    );
  }

  /** Cuerpo clínico editable aunque el servidor tarde en abrir la atención. */
  clinicalFormDisabled(): boolean {
    return !this.canWrite() || this.isLocked();
  }

  onDictationError(message: string) {
    this.error.set(message);
  }

  /** Texto de la sección 3 (psicología o SOAP) para leerlo en voz alta completo. */
  section3ListenText(): string {
    const c = this.content;
    const parts: Array<[string, string | undefined]> = this.isSoap()
      ? [
          ['Subjetivo', c.soap?.subjective],
          ['Objetivo', c.soap?.objective],
          ['Análisis', c.soap?.assessment],
          ['Plan', c.soap?.plan],
        ]
      : [
          ['Motivo de consulta', c.careMinimum?.motive],
          ['Enfermedad actual', c.careMinimum?.presentIllness],
          ['Historia psicosocial', c.careMinimum?.systemsReview],
          ['Examen mental', c.mentalExam?.narrative],
          ['Impresión diagnóstica', c.assessment?.impressionNarrative],
        ];
    return parts
      .filter(([, v]) => (v || '').trim())
      .map(([label, v]) => `${label}. ${(v || '').trim()}`)
      .join('\n\n');
  }

  private draftScopeId(): string {
    return this.tabKey() || this.instanceId;
  }

  private draftLookup() {
    const enc = this.encounter();
    return {
      encounterId: enc?.id ?? null,
      tabKey: this.tabKey() || this.instanceId,
      patientId: enc?.patient?.id ?? this.selectedPatientId ?? null,
    };
  }

  private setWorkDirty(dirty: boolean) {
    if (this.embedded()) {
      this.unsaved.setScopeDirty(this.draftScopeId(), dirty);
    } else {
      this.unsaved.setDirty(dirty);
    }
  }

  /** Sincroniza con el servidor si hubo error o cambios pendientes. */
  retryPendingSync() {
    this.writeLocalDraftNow();
    this.autosave.retryPendingSave();
  }

  applyRipsDefaultsIfNeeded() {
    if (!this.ripsEnabled()) return;
    if (!this.purpose.trim()) this.purpose = '02 - Terapéutico';
    if (!this.externalCause.trim()) this.externalCause = '15 - Enfermedad General';
  }

  /** Al salir de un textarea, normaliza el texto libre. */
  onClinicalTextBlur(event: FocusEvent) {
    const target = event.target as HTMLElement;
    if (!target.matches('textarea')) return;
    const el = target as HTMLTextAreaElement;
    const formatted = formatClinicalFreeText(el.value);
    if (formatted === el.value) return;
    el.value = formatted;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    this.autosave.notifyChange();
  }

  sendTherapeuticFrame() {
    const id = this.encounter()?.patient?.id || this.selectedPatientId;
    if (!id) {
      this.error.set('Seleccione un paciente primero.');
      return;
    }
    this.api.sendTherapeuticFrame(id).subscribe({
      next: (res) =>
        this.message.set(
          (res as { message?: string }).message ||
            'Encuadre terapéutico registrado.',
        ),
      error: (err) =>
        this.error.set(err?.error?.message || 'No se pudo enviar el encuadre.'),
    });
  }

  openDissent() {
    if (!this.consentPatientId()) {
      this.error.set('Seleccione o cree un paciente e inicie la atención primero.');
      return;
    }
    const ok = this.consentSigner?.selectTemplateByCode('DISSENT_HOSPITALIZATION');
    document.getElementById('consent-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (ok) {
      this.message.set(
        'Formato de disentimiento cargado en Consentimientos. Firme paciente/acudiente y profesional; el PDF se sella con «Guardar historia clínica» o al sellar el consentimiento.',
      );
    } else {
      this.dissentOpen.set(true);
      this.dissentReason = '';
    }
  }

  closeDissent() {
    this.dissentOpen.set(false);
  }

  confirmDissent() {
    const reason = this.dissentReason.trim();
    if (!reason) {
      this.error.set('Indique el motivo del disentimiento.');
      return;
    }
    const note = `DISENTIMIENTO DE HOSPITALIZACIÓN / REMISIÓN A URGENCIAS — ${new Date().toISOString().slice(0, 10)}\n${reason}`;
    const current = this.content.assessment.impressionNarrative || '';
    this.content.assessment.impressionNarrative = current
      ? `${current}\n\n${note}`
      : note;
    this.dissentOpen.set(false);
    this.message.set(
      'Disentimiento anotado. Para el formato firmado use la plantilla en Consentimientos.',
    );
    this.autosave.notifyChange();
  }

  openReferral() {
    if (!this.encounter() && !this.consentPatientId()) {
      this.error.set('Seleccione un paciente e inicie la atención primero.');
      return;
    }
    this.referralForm = {
      toEntity: '',
      specialty: '',
      reason: '',
      urgency: 'Ordinaria',
      cie: this.diagnoses[0]?.cieCode || '',
    };
    this.referralOpen.set(true);
  }

  closeReferral() {
    this.referralOpen.set(false);
  }

  confirmReferral() {
    const f = this.referralForm;
    if (!f.toEntity.trim() || !f.reason.trim()) {
      this.error.set('Indique institución/profesional destino y el motivo de la remisión.');
      return;
    }
    const proSig = this.professionalSignature() || this.storedSignature();
    if (!proSig) {
      this.error.set('Firme primero como profesional (panel Firma digital o Consentimientos).');
      return;
    }
    const patient = this.patientDisplayName(this.patientForm);
    const doc = `${this.patientForm.documentType || ''} ${this.patientForm.documentNumber || ''}`.trim();
    const professional =
      this.encounter()?.professional?.fullName || this.user()?.fullName || '—';
    const card = this.encounter()?.professional?.professionalCard || '';
    const note = [
      `REMISIÓN — ${new Date().toISOString().slice(0, 10)}`,
      `Destino: ${f.toEntity.trim()}${f.specialty.trim() ? ` (${f.specialty.trim()})` : ''}`,
      `Urgencia: ${f.urgency}`,
      f.cie.trim() ? `CIE-10: ${f.cie.trim()}` : null,
      `Motivo: ${f.reason.trim()}`,
    ]
      .filter(Boolean)
      .join('\n');
    const current = this.content.assessment.impressionNarrative || '';
    this.content.assessment.impressionNarrative = current
      ? `${current}\n\n${note}`
      : note;
    this.printReferralDocument({
      patient,
      doc,
      professional,
      card,
      toEntity: f.toEntity.trim(),
      specialty: f.specialty.trim(),
      urgency: f.urgency,
      cie: f.cie.trim(),
      reason: f.reason.trim(),
      professionalSignature: proSig,
    });
    this.referralOpen.set(false);
    this.message.set(
      'Remisión registrada en la nota clínica e impresa/PDF. Guarde el borrador o selle la historia.',
    );
    this.autosave.notifyChange();
  }

  private printReferralDocument(data: {
    patient: string;
    doc: string;
    professional: string;
    card: string;
    toEntity: string;
    specialty: string;
    urgency: string;
    cie: string;
    reason: string;
    professionalSignature: string;
  }) {
    const rows = [
      ['Paciente', data.patient],
      ['Documento', data.doc || '—'],
      ['Destino', data.toEntity],
      ['Especialidad / servicio', data.specialty || '—'],
      ['Urgencia', data.urgency],
      ['CIE-10', data.cie || '—'],
      ['Motivo clínico', data.reason],
    ]
      .map(
        ([k, v]) =>
          `<tr><th>${this.escapeForPrint(k)}</th><td>${this.escapeForPrint(v)}</td></tr>`,
      )
      .join('');
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Remisión</title>
<style>
  body{font-family:Georgia,serif;color:#003d4c;padding:32px;max-width:720px;margin:0 auto}
  h1{font-size:1.35rem;margin:0 0 4px} .sub{color:#6a8085;margin:0 0 20px}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{border:1px solid #d5e2e5;padding:8px 10px;text-align:left;vertical-align:top}
  th{width:34%;background:#f3f7f8;font-weight:600}
  .sign{margin-top:36px;display:flex;justify-content:space-between;gap:24px}
  .sign img{max-height:72px;display:block;margin-bottom:6px}
  .line{border-top:1px solid #003d4c;padding-top:6px;font-size:.9rem}
</style></head><body>
  <h1>Remisión de paciente</h1>
  <p class="sub">HABILISALUD · ${this.escapeForPrint(data.professional)}${data.card ? ` · TP ${this.escapeForPrint(data.card)}` : ''}</p>
  <table>${rows}</table>
  <div class="sign">
    <div>
      <img src="${data.professionalSignature}" alt="Firma profesional"/>
      <div class="line">${this.escapeForPrint(data.professional)}${data.card ? ` · TP ${this.escapeForPrint(data.card)}` : ''}<br/>Profesional tratante</div>
    </div>
    <div>
      <div style="height:72px"></div>
      <div class="line">Firma paciente / acudiente<br/>(constancia en consentimiento o anexo)</div>
    </div>
  </div>
  <script>window.onload=function(){window.print();}</script>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
      this.error.set('Permita ventanas emergentes para imprimir la remisión.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  /** Título visible de la HC según especialidad del consultorio. */
  hceTitle() {
    if (this.isPhysiotherapyClinic()) {
      return 'HISTORIA CLÍNICA ELECTRÓNICA – FISIOTERAPIA';
    }
    if (this.isOrthoClinic()) {
      return 'HISTORIA CLÍNICA DE ORTODONCIA Y ODONTOGRAMA';
    }
    if (this.isDentistryClinic()) {
      return 'HISTORIA CLÍNICA ODONTOLÓGICA Y ODONTOGRAMA';
    }
    if (this.isPsychologyClinic()) {
      return 'HISTORIA CLÍNICA ELECTRÓNICA – PSICOLOGÍA';
    }
    return 'HISTORIA CLÍNICA ELECTRÓNICA';
  }

  ngOnInit() {
    // Refresca especialidad del consultorio (evita título viejo por sesión en caché).
    this.auth.refreshMe().subscribe({ error: () => undefined });
    this.refreshLists();
    this.ensureClinicLocation();
    this.applyRipsDefaultsIfNeeded();

    // Llegada desde workspace (pestaña) o desde query de la ruta (modo standalone).
    const params = this.route.snapshot.queryParamMap;
    const encounterId = this.embedded()
      ? this.initialEncounterId()
      : params.get('encounterId');
    const patientId = this.embedded()
      ? this.initialPatientId()
      : params.get('patientId');
    if (encounterId) {
      this.loadEncounter(encounterId);
    } else if (patientId) {
      this.openPatientContext(patientId);
    } else {
      this.emitWorkspaceLabel('Nueva historia');
      this.restoreTabOrBlankDraft();
    }

    this.api.divipola().subscribe({
      next: (rows) => this.departments.set(rows),
      error: () => this.departments.set([]),
    });

    if (this.canWrite()) {
      this.api.getMySignature().subscribe({
        next: (row) => {
          this.storedSignature.set(row.signatureBase64);
          if (
            row.signatureBase64 &&
            !this.content.signature?.signatureBase64 &&
            !this.professionalSignature()
          ) {
            this.applyStoredSignatureToPad(row.signatureBase64);
          }
        },
        error: () => this.storedSignature.set(null),
      });
      this.api.getRepsSettings().subscribe({
        next: (res) => {
          if (res.alertLevel === 'ok') {
            this.repsAlert.set(null);
            return;
          }
          this.repsAlert.set({ level: res.alertLevel, message: res.message });
        },
        error: () => this.repsAlert.set(null),
      });
    }

    this.autosaveErrorsSub = this.autosave.errors$.subscribe((detail) =>
      this.showSaveError(detail),
    );
    // Durante un guardado manual/sellado no se dispara el autoguardado en paralelo.
    this.autosave.bind(
      () => this.buildDraftPayload(),
      () => !!this.encounter() && this.canWrite() && !this.isLocked() && !this.saving(),
      {
        onSaved: (enc) => {
          this.localDrafts.clearAllFor({
            encounterId: enc.id,
            tabKey: this.tabKey() || this.instanceId,
            patientId: enc.patient.id,
          });
          this.setWorkDirty(false);
        },
        persistPatient: () => this.persistPatientDemographics(),
        onLocalBackup: () => this.writeLocalDraftNow(),
        onDirtyChange: (dirty) => this.setWorkDirty(dirty),
      },
    );
  }

  constructor() {
    effect(() => {
      const active = this.isActiveTab();
      if (active) {
        queueMicrotask(() => this.retryPendingSync());
      } else {
        // Al salir de la pestaña: copia local + subida a BD.
        // Así otra HC sin cerrar no impide guardar esta.
        this.writeLocalDraftNow();
        this.autosave.flushLocalBackup();
        this.autosave.flushToServerNow();
      }
    });
  }

  /**
   * Persiste borrador en BD si hay atención editable (p. ej. «Guardar todas»).
   * No sella; no exige cerrar otras historias abiertas.
   */
  persistOpenDraft(): boolean {
    if (!this.canWrite() || this.isLocked()) return false;
    if (!this.encounter() && !this.selectedPatientId) return false;
    this.saveDraftOnly();
    return true;
  }

  /** Antes de recargar/cerrar: respalda localmente; en workspace no bloquea otras pestañas. */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    this.writeLocalDraftNow();
    this.autosave.flushLocalBackup();
    if (this.embedded()) return;
    if (this.autosave.hasUnsavedWork() || this.unsaved.isDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  @HostListener('window:pagehide')
  onPageHide() {
    this.writeLocalDraftNow();
    this.autosave.flushLocalBackup();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      this.writeLocalDraftNow();
      this.autosave.flushLocalBackup();
      this.autosave.flushToServerNow();
      return;
    }
    this.retryPendingSync();
  }

  private buildLocalDraftPayload(): HceLocalDraft {
    const enc = this.encounter();
    this.collectContent();
    return {
      version: 1,
      encounterId: enc?.id ?? null,
      tabKey: enc?.id ? null : this.tabKey() || this.instanceId,
      patientId: enc?.patient?.id ?? this.selectedPatientId ?? '',
      savedAt: new Date().toISOString(),
      noteFormat: this.noteFormat(),
      content: structuredClone(this.content),
      diagnoses: this.diagnoses.map((d) => ({ ...d })),
      procedures: this.procedures.map((p) => ({ ...p })),
      consents: this.consents.map((c) => ({ ...c })),
      modality: this.modality,
      serviceType: this.defaultServiceLabel,
      location: this.location,
      purpose: this.purpose,
      externalCause: this.externalCause,
      generateRipsForThisEncounter: this.generateRipsForThisEncounter,
      allergiesText: this.allergiesText,
      medicationsText: this.medicationsText,
      managementPlanText: this.managementPlanText,
      patientForm: { ...this.patientForm },
    };
  }

  /** Copia inmediata en el navegador (sobrevive a F5, caída del servidor o cambio de pestaña). */
  private writeLocalDraftNow() {
    if (this.localDraftTimer) {
      clearTimeout(this.localDraftTimer);
      this.localDraftTimer = null;
    }
    if (!this.canWrite() || this.isLocked()) return;
    const enc = this.encounter();
    const patientId = enc?.patient?.id ?? this.selectedPatientId;
    if (!enc && !patientId && !this.hasWritableLocalState()) return;
    const payload = this.buildLocalDraftPayload();
    if (
      enc &&
      this.hasServerClinicalContent(enc) &&
      !this.localDrafts.hasMeaningfulClinicalContent(payload)
    ) {
      return;
    }
    this.localDrafts.write(payload);
  }

  /**
   * Serializar toda la HC en cada tecla congelaba la UI en historias largas:
   * se agrupa en una escritura cada 400 ms. Recarga/cierre usan la versión inmediata.
   */
  private scheduleLocalDraftWrite() {
    if (this.localDraftTimer) clearTimeout(this.localDraftTimer);
    this.localDraftTimer = setTimeout(() => {
      this.localDraftTimer = null;
      try {
        this.writeLocalDraftNow();
      } catch (err) {
        console.error('[hce] copia local', err);
      }
    }, 400);
  }

  private showSaveError(detail: string) {
    this.saveToast.set({ title: 'Error al guardar', detail });
    if (this.saveToastTimer) clearTimeout(this.saveToastTimer);
    this.saveToastTimer = setTimeout(() => this.saveToast.set(null), 6000);
  }

  dismissSaveToast() {
    if (this.saveToastTimer) clearTimeout(this.saveToastTimer);
    this.saveToast.set(null);
  }

  private hasWritableLocalState(): boolean {
    if (this.selectedPatientId) return true;
    const draft = this.localDrafts.readBest(this.draftLookup());
    return !!draft && this.localDrafts.hasMeaningfulClinicalContent(draft);
  }

  private restoreTabOrBlankDraft() {
    if (!this.canWrite()) return;
    const draft = this.localDrafts.readBest({
      tabKey: this.tabKey() || this.instanceId,
    });
    if (!draft) return;

    // Si la pestaña recuerda un paciente/atención, cargar desde BD (no quedarse solo con borrador vacío).
    if (draft.encounterId) {
      this.loadEncounter(draft.encounterId);
      return;
    }
    if (draft.patientId) {
      this.openPatientContext(draft.patientId);
      return;
    }

    if (!this.localDrafts.hasMeaningfulClinicalContent(draft)) return;

    this.applyLocalDraft(draft);
    this.message.set(
      'Se recuperó lo escrito en esta pestaña. Se sincronizará con el servidor al conectar.',
    );
    this.setWorkDirty(true);
  }

  private maybeRestoreLocalDraft(enc: Encounter) {
    if (!this.canWrite() || this.isLocked()) {
      this.localDrafts.clearAllFor({
        encounterId: enc.id,
        tabKey: this.tabKey() || this.instanceId,
        patientId: enc.patient.id,
      });
      return;
    }

    const lookup = {
      encounterId: enc.id,
      tabKey: this.tabKey() || this.instanceId,
      patientId: enc.patient.id,
    };
    // Incluye lo escrito antes de que el servidor abriera la atención (llave paciente/pestaña).
    const draft = this.localDrafts.readForEncounter(enc.id, enc.patient.id, lookup.tabKey);
    if (!draft) return;

    if (!this.localDrafts.hasMeaningfulClinicalContent(draft)) {
      this.localDrafts.clearAllFor(lookup);
      return;
    }
    const serverHasContent = this.hasServerClinicalContent(enc);
    const serverAt = enc.clinicalRecord?.updatedAt;
    if (serverHasContent && !this.localDrafts.isNewerThanServer(draft, serverAt)) {
      this.localDrafts.clearAllFor(lookup);
      return;
    }
    if (serverHasContent) {
      const serverScore = this.localDrafts.contentRichnessScore({
        content: enc.clinicalRecord!.content as HceLocalDraft['content'],
        diagnoses: enc.diagnoses || [],
        procedures: enc.procedures || [],
        managementPlanText: (
          (enc.clinicalRecord!.content as { assessment?: { managementPlan?: string[] } })
            ?.assessment?.managementPlan || []
        ).join('\n'),
        allergiesText: ((enc.clinicalRecord!.content as { allergies?: string[] })?.allergies || []).join(', '),
        medicationsText: (
          (enc.clinicalRecord!.content as { medications?: string[] })?.medications || []
        ).join(', '),
      });
      const draftScore = this.localDrafts.contentRichnessScore(draft);
      if (serverScore >= draftScore) {
        this.localDrafts.clearAllFor(lookup);
        return;
      }
    }
    this.applyLocalDraft(draft);
    this.message.set(
      'Se recuperó lo que estaba escribiendo. Se autoguardará en el servidor cuando responda.',
    );
    this.setWorkDirty(true);
    this.writeLocalDraftNow();
    // Tras recuperar hay que subirlo aunque el usuario no vuelva a escribir.
    this.autosave.flushToServerNow();
  }

  private hasServerClinicalContent(enc: Encounter) {
    const c = enc.clinicalRecord?.content;
    if (!c) return false;
    const draftLike = {
      version: 1 as const,
      encounterId: enc.id,
      patientId: enc.patient.id,
      savedAt: enc.clinicalRecord?.updatedAt || '',
      noteFormat: enc.clinicalRecord?.noteFormat || 'FULL',
      content: c,
      diagnoses: enc.diagnoses || [],
      procedures: enc.procedures || [],
      consents: enc.consents || [],
      modality: enc.modality,
      serviceType: enc.serviceType || '',
      location: enc.location || '',
      purpose: enc.purpose || '',
      externalCause: enc.externalCause || '',
      generateRipsForThisEncounter: false,
      allergiesText: (c.allergies || []).join(', '),
      medicationsText: (c.medications || []).join(', '),
      managementPlanText: (c.assessment?.managementPlan || []).join('\n'),
      patientForm: {},
    };
    return this.localDrafts.hasMeaningfulClinicalContent(draftLike);
  }

  private applyLocalDraft(draft: HceLocalDraft) {
    if (!draft) return;
    this.noteFormat.set(draft.noteFormat);
    this.content = {
      ...emptyContent(),
      ...draft.content,
      soap: { ...emptySoap(), ...(draft.content.soap || {}) },
      careMinimum: {
        ...emptyContent().careMinimum,
        ...(draft.content.careMinimum || {}),
        antecedentFlags: {
          ...emptyContent().careMinimum.antecedentFlags!,
          ...(draft.content.careMinimum?.antecedentFlags || {}),
        },
      },
      mentalExam: {
        ...emptyContent().mentalExam,
        ...(draft.content.mentalExam || {}),
      },
      physiotherapy: {
        ...emptyPhysiotherapy(),
        ...(draft.content.physiotherapy || {}),
        antecedentsDetail: {
          ...emptyPhysiotherapy().antecedentsDetail,
          ...(draft.content.physiotherapy?.antecedentsDetail || {}),
        },
        systemsReviewGrid: {
          ...emptyPhysiotherapy().systemsReviewGrid,
          ...(draft.content.physiotherapy?.systemsReviewGrid || {}),
        },
        functionalAssessment: {
          ...emptyPhysiotherapy().functionalAssessment,
          ...(draft.content.physiotherapy?.functionalAssessment || {}),
        },
        closure: {
          ...emptyPhysiotherapy().closure,
          ...(draft.content.physiotherapy?.closure || {}),
        },
      },
      ...(this.isDentistryClinic() || draft.content.dentistry
        ? { dentistry: normalizeDentistry(draft.content.dentistry) }
        : {}),
      assessment: {
        ...emptyContent().assessment,
        ...(draft.content.assessment || {}),
      },
      risks: {
        ...emptyContent().risks,
        ...(draft.content.risks || {}),
      },
      rdaMeta: {
        ...emptyContent().rdaMeta,
        ...(draft.content.rdaMeta || {}),
      },
      signature: {
        ...emptyContent().signature,
        ...(draft.content.signature || {}),
        // La copia local no guarda imágenes base64: se conserva la firma ya cargada.
        signatureBase64:
          draft.content.signature?.signatureBase64 ||
          this.content.signature?.signatureBase64 ||
          '',
      },
      consentDraft: draft.content.consentDraft
        ? {
            ...draft.content.consentDraft,
            patientSignatureBase64:
              draft.content.consentDraft.patientSignatureBase64 ||
              this.content.consentDraft?.patientSignatureBase64,
          }
        : this.content.consentDraft,
    };
    this.diagnoses = draft.diagnoses.map((d) => ({ ...d }));
    this.procedures = draft.procedures.map((p) => ({ ...p }));
    this.consents = draft.consents.map((c) => ({ ...c }));
    this.modality = draft.modality;
    this.ensureDefaultServiceType();
    this.location = draft.location;
    this.purpose = draft.purpose;
    this.externalCause = draft.externalCause;
    this.generateRipsForThisEncounter = draft.generateRipsForThisEncounter;
    this.allergiesText = draft.allergiesText;
    this.medicationsText = draft.medicationsText;
    this.managementPlanText = draft.managementPlanText;
    if (draft.patientForm) {
      this.patientForm = {
        ...this.patientForm,
        ...draft.patientForm,
        birthDate: draft.patientForm.birthDate?.slice?.(0, 10) || draft.patientForm.birthDate || this.patientForm.birthDate,
      };
    }
  }

  /** Carga ficha + encuentro; no borra datos del servidor por borradores locales vacíos. */
  private openPatientContext(patientId: string) {
    this.selectedPatientId = patientId;
    this.patientMode = 'select';
    this.loading.set(true);
    this.error.set('');
    this.api.getPatient(patientId).subscribe({
      next: (patient) => {
        this.patientForm = {
          ...patient,
          birthDate: patient.birthDate?.slice(0, 10) ?? '',
        };
        this.applyDefaultResidence();
        this.refreshPatientPhotoPreview(patient.id, patient.photoUrl);
        if (!this.patients().some((p) => p.id === patient.id)) {
          this.patients.set([patient, ...this.patients()]);
        }
        this.syncWorkspacePatient(patient);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudo cargar la ficha del paciente.');
      },
    });
    this.api.encounterForPatient(patientId).subscribe({
      next: (enc) => {
        this.loading.set(false);
        if (enc) {
          this.applyEncounter(enc);
          return;
        }
        this.encounter.set(null);
        if (this.canWrite()) {
          this.ensureEncounterForPatient(patientId);
        } else {
          this.message.set(
            'Este paciente aún no tiene historia clínica abierta.',
          );
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set(
          'No se pudo cargar la historia desde el servidor. Sus datos guardados siguen en la base de datos; recargue o pulse «Recargar atención».',
        );
      },
    });
  }

  /** Al cambiar el selector de paciente, abre/crea su atención. */
  onSelectedPatientChange(patientId: string) {
    if (!patientId) {
      this.encounter.set(null);
      return;
    }
    this.openPatientContext(patientId);
  }

  /** Crea el borrador de HCE si el paciente aún no tiene encuentro. */
  private ensureEncounterForPatient(patientId: string) {
    if (this.pendingEncounterForPatient === patientId) return;
    this.pendingEncounterForPatient = patientId;
    this.loading.set(true);
    this.error.set('');
    this.api.createEncounter(patientId, this.modality).subscribe({
      next: (enc) => {
        this.pendingEncounterForPatient = null;
        this.writeLocalDraftNow();
        this.applyEncounter(enc);
        this.loading.set(false);
        this.message.set(
          this.isLocked()
            ? 'Este paciente ya tiene historia clínica cerrada: registre la atención como nota de evolución.'
            : 'Atención abierta en borrador. Lo que escriba se autoguardará en la base de datos.',
        );
        this.refreshLists();
        this.writeLocalDraftNow();
        this.autosave.retryPendingSave();
      },
      error: (err) => {
        this.pendingEncounterForPatient = null;
        this.loading.set(false);
        this.writeLocalDraftNow();
        this.error.set(
          (err?.error?.message ||
            'No se pudo conectar con el servidor. Lo escrito quedó guardado en este navegador.') +
            ' Volverá a intentar al reconectar.',
        );
        this.setWorkDirty(true);
      },
    });
  }

  private patientDisplayName(patient: {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
  }) {
    const full = patient.fullName?.trim();
    if (full) return full;
    return `${patient.firstName || ''} ${patient.lastName || ''}`
      .replace(/\s+/g, ' ')
      .trim() || 'Historia clínica';
  }

  private emitWorkspaceLabel(label: string) {
    if (!this.embedded()) return;
    this.labelChange.emit(label);
  }

  private syncWorkspacePatient(patient: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
  }) {
    if (!this.embedded()) return;
    const label = this.patientDisplayName(patient);
    this.emitWorkspaceLabel(label);
    this.patientBound.emit({ patientId: patient.id, label });
  }

  /** Propaga ediciones del formulario al autoguardado (debounce 2 s). */
  onClinicalFormInput(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.matches('input, textarea, select')) return;
    if (!this.canWrite() || this.isLocked()) return;
    this.scheduleLocalDraftWrite();
    if (!this.encounter()) {
      if (this.selectedPatientId) {
        this.ensureEncounterForPatient(this.selectedPatientId);
      }
      return;
    }
    this.autosave.notifyChange();
  }

  /** Cambios programáticos / radios de fisioterapia. */
  onClinicalFieldChange() {
    if (!this.canWrite() || this.isLocked()) return;
    this.scheduleLocalDraftWrite();
    if (!this.encounter()) {
      if (this.selectedPatientId) {
        this.ensureEncounterForPatient(this.selectedPatientId);
      }
      return;
    }
    this.autosave.notifyChange();
  }

  /** Guarda demografía del paciente (incl. profesión/ocupación) con el mismo debounce. */
  onPatientFormInput(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.matches('input, textarea, select')) return;
    if (!this.canWrite()) return;
    const id = this.selectedPatientId || this.encounter()?.patient?.id;
    if (!id) return;
    this.autosave.notifyPatientChange();
  }

  autosaveLabel() {
    return this.autosave.statusLabel();
  }

  autosaveStatus() {
    return this.autosave.status();
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
    this.writeLocalDraftNow();
    clearInterval(this.systemClockTimer);
    if (this.saveToastTimer) clearTimeout(this.saveToastTimer);
    this.autosaveErrorsSub?.unsubscribe();
    this.setWorkDirty(false);
    window.removeEventListener('resize', this.resizeHandler);
    this.signaturePad?.off();
    this.signaturePad = null;
    this.autosave.unbind();
    this.revokePatientPhotoObjectUrl();
    this.stopCamera();
  }

  refreshLists() {
    this.api.listPatients().subscribe({
      next: (rows) => {
        this.patients.set(rows);
        this.ensureSelectedPatientInList();
      },
      error: () => this.error.set('No se pudieron cargar pacientes.'),
    });
    this.api.listEncounters().subscribe({
      next: (rows) => this.encounters.set(rows),
      error: () => undefined,
    });
  }

  /** El paciente activo siempre aparece en el selector aunque no esté en los primeros 200. */
  private ensureSelectedPatientInList() {
    const id = this.selectedPatientId || this.encounter()?.patient?.id;
    if (!id || this.patients().some((p) => p.id === id)) return;
    this.api.getPatient(id).subscribe({
      next: (patient) => {
        if (!this.patients().some((p) => p.id === patient.id)) {
          this.patients.set([patient, ...this.patients()]);
        }
      },
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

  /** Foto efectiva para el cuadro y el encabezado. */
  patientPhotoSrc(): string | null {
    return this.patientPhotoPreview();
  }

  private revokePatientPhotoObjectUrl() {
    if (this.patientPhotoObjectUrl) {
      URL.revokeObjectURL(this.patientPhotoObjectUrl);
      this.patientPhotoObjectUrl = null;
    }
  }

  private isExternalPatientPhoto(url?: string | null) {
    return !!url && /^(https?:|data:)/i.test(url.trim());
  }

  /** Carga la foto guardada (API autenticada) o una URL externa legacy. */
  refreshPatientPhotoPreview(patientId?: string | null, photoUrl?: string | null) {
    this.revokePatientPhotoObjectUrl();
    this.patientPhotoPreview.set(null);
    const id = patientId || this.consentPatientId();
    const key = photoUrl ?? this.patientForm.photoUrl;
    if (this.isExternalPatientPhoto(key)) {
      this.patientPhotoPreview.set(key!);
      return;
    }
    if (!id || !key) return;
    this.api.downloadPatientPhoto(id).subscribe({
      next: (blob) => {
        this.revokePatientPhotoObjectUrl();
        this.patientPhotoObjectUrl = URL.createObjectURL(blob);
        this.patientPhotoPreview.set(this.patientPhotoObjectUrl);
      },
      error: () => this.patientPhotoPreview.set(null),
    });
  }

  onPatientPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set('Seleccione una imagen (JPG, PNG o WebP).');
      return;
    }
    this.applyPatientPhotoFile(file);
  }

  /** Abre la webcam del navegador (escritorio y móviles con permiso). */
  async openPatientCamera() {
    if (this.photoUploading()) return;
    this.error.set('');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set(
        'Este navegador no permite cámara en vivo. Use «Galería» o abra la HCE en Chrome/Safari.',
      );
      return;
    }
    this.cameraBusy.set(true);
    this.cameraOpen.set(true);
    try {
      this.stopCamera();
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      // Esperar a que el <video> exista en el DOM del modal.
      setTimeout(() => {
        const video = this.patientCameraVideo?.nativeElement;
        if (!video || !this.cameraStream) return;
        video.srcObject = this.cameraStream;
        void video.play().catch(() => undefined);
        this.cameraBusy.set(false);
      }, 50);
    } catch {
      this.cameraBusy.set(false);
      this.cameraOpen.set(false);
      this.error.set(
        'No se pudo acceder a la cámara. Permita el acceso en el navegador o use «Galería».',
      );
    }
  }

  cancelPatientCamera() {
    this.stopCamera();
    this.cameraOpen.set(false);
    this.cameraBusy.set(false);
  }

  capturePatientCamera() {
    const video = this.patientCameraVideo?.nativeElement;
    if (!video || !video.videoWidth) {
      this.error.set('Espere a que la cámara esté lista e intente de nuevo.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          this.error.set('No se pudo capturar la imagen.');
          return;
        }
        const file = new File([blob], `paciente-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        this.cancelPatientCamera();
        this.applyPatientPhotoFile(file);
      },
      'image/jpeg',
      0.92,
    );
  }

  private stopCamera() {
    this.cameraStream?.getTracks().forEach((t) => t.stop());
    this.cameraStream = null;
    const video = this.patientCameraVideo?.nativeElement;
    if (video) video.srcObject = null;
  }

  private applyPatientPhotoFile(file: File) {
    this.showLocalPhotoPreview(file);
    const patientId = this.consentPatientId();
    if (patientId) {
      this.uploadPatientPhotoFile(patientId, file);
    } else {
      this.pendingPatientPhoto = file;
      this.message.set('Foto lista. Se guardará al crear el paciente.');
    }
  }

  private showLocalPhotoPreview(file: File) {
    this.revokePatientPhotoObjectUrl();
    this.patientPhotoObjectUrl = URL.createObjectURL(file);
    this.patientPhotoPreview.set(this.patientPhotoObjectUrl);
  }

  private uploadPatientPhotoFile(patientId: string, file: File) {
    this.photoUploading.set(true);
    this.error.set('');
    this.api.uploadPatientPhoto(patientId, file).subscribe({
      next: (patient) => {
        this.pendingPatientPhoto = null;
        this.patientForm.photoUrl = patient.photoUrl;
        this.photoUploading.set(false);
        this.message.set('Foto del paciente guardada.');
        this.refreshPatientPhotoPreview(patient.id, patient.photoUrl);
      },
      error: (err) => {
        this.photoUploading.set(false);
        this.error.set(err?.error?.message || 'No se pudo subir la foto.');
      },
    });
  }

  clearPatientPhoto() {
    const patientId = this.consentPatientId();
    this.pendingPatientPhoto = null;
    this.revokePatientPhotoObjectUrl();
    this.patientPhotoPreview.set(null);
    this.patientForm.photoUrl = null;
    if (!patientId) {
      this.message.set('Foto eliminada.');
      return;
    }
    this.photoUploading.set(true);
    this.api.deletePatientPhoto(patientId).subscribe({
      next: () => {
        this.photoUploading.set(false);
        this.message.set('Foto eliminada.');
      },
      error: (err) => {
        this.photoUploading.set(false);
        this.error.set(err?.error?.message || 'No se pudo eliminar la foto.');
      },
    });
  }

  createPatient() {
    this.error.set('');
    if (this.isMinor()) {
      const f = this.patientForm;
      const missing: string[] = [];
      if (!f.guardianFullName?.trim()) missing.push('nombre del acudiente');
      if (!f.guardianDocumentNumber?.trim()) missing.push('documento del acudiente');
      if (!f.guardianRelationship?.trim()) missing.push('parentesco del acudiente');
      if (!f.guardianPhone?.trim()) missing.push('teléfono del acudiente');
      if (missing.length) {
        this.error.set(`Complete los datos del acudiente: ${missing.join(', ')}.`);
        return;
      }
    }
    this.api.createPatient({ ...this.patientForm, photoUrl: undefined }).subscribe({
      next: (patient) => {
        this.message.set('Paciente creado.');
        this.selectedPatientId = patient.id;
        this.patientMode = 'select';
        this.patientForm = {
          ...this.patientForm,
          ...patient,
          birthDate: patient.birthDate?.slice(0, 10) || this.patientForm.birthDate,
        };
        this.syncWorkspacePatient(patient);
        this.refreshLists();
        if (this.pendingPatientPhoto) {
          this.uploadPatientPhotoFile(patient.id, this.pendingPatientPhoto);
        } else {
          this.refreshPatientPhotoPreview(patient.id, patient.photoUrl);
        }
        if (this.canWrite()) {
          this.ensureEncounterForPatient(patient.id);
        }
      },
      error: (err) => this.error.set(err?.error?.message || 'No se pudo crear el paciente.'),
    });
  }

  startEncounter() {
    if (!this.selectedPatientId) {
      this.error.set('Seleccione o cree un paciente.');
      return;
    }

    // Si esta pestaña ya tiene otra historia abierta, la nueva va a otra pestaña.
    const currentPatientId = this.encounter()?.patient?.id;
    if (
      this.embedded() &&
      currentPatientId &&
      currentPatientId !== this.selectedPatientId
    ) {
      const listed = this.patients().find((p) => p.id === this.selectedPatientId);
      this.openPatientTab.emit({
        patientId: this.selectedPatientId,
        label: listed ? this.patientDisplayName(listed) : undefined,
      });
      this.message.set('Se abrió otra pestaña para ese paciente.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.api.createEncounter(this.selectedPatientId, this.modality).subscribe({
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
    this.error.set('');
    this.api.getEncounter(id).subscribe({
      next: (enc) => {
        // Defensa extra: si viniera un encuentro sin HCE, abrir la del paciente.
        if (!enc.clinicalRecord?.id && enc.patient?.id) {
          this.openPatientContext(enc.patient.id);
          return;
        }
        this.applyEncounter(enc);
        this.loading.set(false);
        if (this.isLocked()) {
          this.message.set(
            'Historia clínica cerrada cargada desde la base de datos (motivo, examen, diagnósticos y evoluciones).',
          );
        } else if (!this.message().includes('recuperó')) {
          this.message.set('Historia cargada desde la base de datos.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set(
          'No se pudo cargar la HCE. Los datos siguen guardados en el servidor; intente de nuevo.',
        );
      },
    });
  }

  /** Recarga la atención del paciente seleccionado desde la BD (sin perder datos guardados). */
  reloadSelectedPatient() {
    const encId = this.encounter()?.id;
    if (encId) {
      this.loadEncounter(encId);
      return;
    }
    if (this.selectedPatientId) {
      this.openPatientContext(this.selectedPatientId);
    }
  }

  private applyEncounter(enc: Encounter) {
    this.encounter.set(enc);
    this.selectedPatientId = enc.patient.id;
    this.patientForm = { ...enc.patient, birthDate: enc.patient.birthDate?.slice(0, 10) };
    this.refreshPatientPhotoPreview(enc.patient.id, enc.patient.photoUrl);
    this.applyDefaultResidence();
    this.syncWorkspacePatient(enc.patient);
    // Fisioterapia: siempre HC-FT completo (nunca SOAP de psicología).
    const format = this.isPhysiotherapyClinic() || this.isDentistryClinic()
      ? 'FULL'
      : enc.clinicalRecord?.noteFormat ||
        (enc.clinicalRecord
          ? 'FULL'
          : enc.visitType === 'FOLLOW_UP'
            ? 'SOAP'
            : 'FULL');
    this.noteFormat.set(format);
    const serverContent = (enc.clinicalRecord?.content || {}) as ClinicalContent;
    this.content = {
      ...emptyContent(),
      ...serverContent,
      profile:
        this.isPhysiotherapyClinic()
          ? 'PHYSIOTHERAPY'
          : this.isDentistryClinic()
            ? 'DENTISTRY'
            : serverContent.profile || (format === 'SOAP' ? 'SOAP' : 'FULL'),
      soap: {
        ...emptySoap(),
        ...(serverContent.soap || {}),
      },
      careMinimum: {
        ...emptyContent().careMinimum,
        ...(serverContent.careMinimum || {}),
        antecedentFlags: {
          ...emptyContent().careMinimum.antecedentFlags!,
          ...(serverContent.careMinimum?.antecedentFlags || {}),
          personales: {
            ...emptyContent().careMinimum.antecedentFlags!.personales,
            ...(serverContent.careMinimum?.antecedentFlags?.personales || {}),
          },
          psiquiatricos: {
            ...emptyContent().careMinimum.antecedentFlags!.psiquiatricos,
            ...(serverContent.careMinimum?.antecedentFlags?.psiquiatricos || {}),
          },
          familiares: {
            ...emptyContent().careMinimum.antecedentFlags!.familiares,
            ...(serverContent.careMinimum?.antecedentFlags?.familiares || {}),
          },
          toxicos: {
            ...emptyContent().careMinimum.antecedentFlags!.toxicos,
            ...(serverContent.careMinimum?.antecedentFlags?.toxicos || {}),
          },
        },
      },
      mentalExam: {
        ...emptyContent().mentalExam,
        ...(serverContent.mentalExam || {}),
      },
      physiotherapy: {
        ...emptyPhysiotherapy(),
        ...(serverContent.physiotherapy || {}),
        antecedentsDetail: {
          ...emptyPhysiotherapy().antecedentsDetail,
          ...(serverContent.physiotherapy?.antecedentsDetail || {}),
        },
        systemsReviewGrid: {
          ...emptyPhysiotherapy().systemsReviewGrid,
          ...(serverContent.physiotherapy?.systemsReviewGrid || {}),
        },
        functionalAssessment: {
          ...emptyPhysiotherapy().functionalAssessment,
          ...(serverContent.physiotherapy?.functionalAssessment || {}),
        },
        closure: {
          ...emptyPhysiotherapy().closure,
          ...(serverContent.physiotherapy?.closure || {}),
        },
      },
      ...(this.isDentistryClinic() || serverContent.dentistry
        ? { dentistry: normalizeDentistry(serverContent.dentistry) }
        : {}),
      assessment: {
        ...emptyContent().assessment,
        ...(serverContent.assessment || {}),
      },
      vitals: {
        ...emptyContent().vitals,
        ...(serverContent.vitals || {}),
      },
      risks: {
        ...emptyContent().risks,
        ...(serverContent.risks || {}),
      },
      rdaMeta: {
        ...emptyContent().rdaMeta,
        ...(serverContent.rdaMeta || {}),
      },
      signature: {
        ...emptyContent().signature,
        ...(serverContent.signature || {}),
        professionalName:
          serverContent.signature?.professionalName || enc.professional.fullName,
        professionalCard:
          serverContent.signature?.professionalCard ||
          enc.professional.professionalCard ||
          '',
      },
      documentedAt:
        serverContent.documentedAt || enc.createdAt || enc.startedAt || null,
      consentDraft: serverContent.consentDraft,
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
    this.ensureDefaultServiceType();
    this.location = enc.location || this.user()?.clinicAddress || '';
    this.purpose = enc.purpose || '';
    this.externalCause = enc.externalCause || '';
    this.generateRipsForThisEncounter =
      !!(enc as { generateRips?: boolean }).generateRips || this.ripsEnabled();
    this.applyRipsDefaultsIfNeeded();
    this.ensureClinicLocation();
    if (!this.content.careMinimum.antecedentFlags) {
      this.content.careMinimum.antecedentFlags =
        emptyContent().careMinimum.antecedentFlags;
    }
    if (this.content.mentalExam && !(this.content.mentalExam.narrative || '').trim()) {
      const m = this.content.mentalExam;
      this.content.mentalExam.narrative = [
        m.appearance,
        m.behavior,
        m.speech,
        m.mood,
        m.affect,
        m.thought,
        m.perception,
        m.judgment,
        m.insight,
      ]
        .filter((x) => (x || '').trim())
        .join('\n');
    }
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
    this.restorePatientSignaturePreview(enc);
    this.loadSealedConsents(enc.patient.id);
    this.prepareNewEvolution(enc.patient.id);
    const draftSignature = serverContent.signature?.signatureBase64;
    if (draftSignature) {
      this.professionalSignature.set(draftSignature);
    }
    this.scheduleSignaturePadInit();

    this.ensureSelectedPatientInList();

    // HC sellada: siempre privilegiar BD; nunca pisar con borrador local vacío.
    if (this.isLocked() || this.skipLocalRestoreOnce) {
      this.skipLocalRestoreOnce = false;
      // En FT mostramos el formulario completo (solo lectura) para ver EVA/Daniels/goniometría.
      this.showInitialHistory.set(this.isPhysiotherapyClinic() || this.isDentistryClinic());
      this.localDrafts.clearAllFor({
        encounterId: enc.id,
        tabKey: this.tabKey() || this.instanceId,
        patientId: enc.patient.id,
      });
      this.setWorkDirty(false);
      if (this.isLocked() && this.hasServerClinicalContent(enc)) {
        this.message.set(
          this.isPhysiotherapyClinic()
            ? 'Historia sellada. Abajo en sección 3 verá valoración funcional (EVA 1–10 y Daniels).'
            : this.isDentistryClinic()
              ? `Historia de ${this.dentalSpecialtyLabel().toLowerCase()} sellada. Abajo verá el odontograma; registre cada sesión en «Notas de evolución / control».`
              : 'Historia sellada cargada. Arriba ve el contenido guardado; abajo las notas de evolución / control.',
        );
        queueMicrotask(() => {
          if (this.isPhysiotherapyClinic()) {
            document
              .getElementById('ft-valoracion-funcional')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else {
            this.scrollToEvolutions();
          }
        });
      }
    } else {
      this.maybeRestoreLocalDraft(enc);
    }
  }

  openCieCatalog() {
    if (!this.encounter() && this.selectedPatientId && this.canWrite()) {
      this.ensureEncounterForPatient(this.selectedPatientId);
    }
    if (this.cieCloseTimer) {
      clearTimeout(this.cieCloseTimer);
      this.cieCloseTimer = null;
    }
    this.cieOpen.set(true);
    this.searchCie();
  }

  /** CIE-10 fuera del fieldset bloqueado: editable en borrador y en HC sellada. */
  cieFieldsDisabled(): boolean {
    if (!this.canWrite()) return true;
    return !this.encounter() && !this.selectedPatientId;
  }

  cupsFieldsDisabled(): boolean {
    return this.cieFieldsDisabled();
  }

  scrollToCieSection() {
    document.getElementById('cie-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  scrollToAnexosSection() {
    document.getElementById('anexos-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  scrollToEvolutions() {
    document.getElementById('evoluciones-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  scrollToSealedOrEvolutions() {
    const sealed = document.getElementById('historia-guardada');
    if (sealed) {
      sealed.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    this.scrollToEvolutions();
  }

  /** Resumen visible al abrir HC sellada: confirma que el contenido vino de BD. */
  hasLoadedClinicalSummary(): boolean {
    if (!this.isLocked()) return false;
    const c = this.content;
    const motive = (c.careMinimum?.motive || '').trim().length;
    const illness = (c.careMinimum?.presentIllness || '').trim().length;
    const mental = (c.mentalExam?.narrative || '').trim().length;
    const soap = c.soap
      ? [c.soap.subjective, c.soap.objective, c.soap.assessment, c.soap.plan]
          .map((x) => (x || '').trim().length)
          .reduce((a, b) => a + b, 0)
      : 0;
    const ft = c.physiotherapy;
    const physio =
      ft
        ? [
            ft.physioDiagnosis,
            ft.findings,
            ft.physioDxDescription,
            ft.treatmentObjectives,
            ft.interventionPlan,
          ]
            .map((x) => (x || '').trim().length)
            .reduce((a, b) => a + b, 0)
        : 0;
    return (
      motive + illness + mental + soap + physio + this.diagnoses.length + this.evolutions().length >
      0
    );
  }

  clinicalContentSummary(): string {
    const parts: string[] = [];
    const motive = (this.content.careMinimum?.motive || '').trim().length;
    const mental = (this.content.mentalExam?.narrative || '').trim().length;
    const impression = (this.content.assessment?.impressionNarrative || '').trim().length;
    if (motive) parts.push(`motivo (${motive} caracteres)`);
    if (mental) parts.push('examen mental');
    if (impression) parts.push('impresión diagnóstica');
    if (this.diagnoses.length) parts.push(`${this.diagnoses.length} CIE-10`);
    if (this.evolutions().length) parts.push(`${this.evolutions().length} evolución(es)`);
    if (this.attachments().length) parts.push(`${this.attachments().length} anexo(s)`);
    return parts.length ? parts.join(' · ') : 'metadatos de la atención';
  }

  onDiagnosisFormInput(_event?: Event) {
    this.notifyDiagnosisChange();
  }

  private notifyDiagnosisChange() {
    if (!this.canWrite()) return;
    if (!this.encounter()) {
      if (this.selectedPatientId) {
        this.ensureEncounterForPatient(this.selectedPatientId);
      }
      return;
    }
    if (this.isLocked()) {
      this.scheduleLockedDiagnosisSave();
    } else {
      this.setWorkDirty(true);
      this.autosave.notifyChange();
    }
  }

  private scheduleLockedDiagnosisSave() {
    if (this.diagnosisPersistTimer) clearTimeout(this.diagnosisPersistTimer);
    this.diagnosisPersistTimer = setTimeout(() => this.saveDiagnosesOnly(), 1500);
  }

  saveDiagnosesOnly() {
    const enc = this.encounter();
    if (!enc || !this.canWrite()) return;
    if (this.diagnosisPersistTimer) {
      clearTimeout(this.diagnosisPersistTimer);
      this.diagnosisPersistTimer = null;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.updateDiagnoses(enc.id, this.editableRows().diagnoses).subscribe({
      next: (updated) => {
        this.diagnoses = [...(updated.diagnoses || [])];
        this.saving.set(false);
        this.message.set('Diagnósticos CIE-10 guardados.');
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.message || 'No se pudieron guardar los diagnósticos CIE-10.');
      },
    });
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
    this.notifyDiagnosisChange();
  }

  openCupsCatalog() {
    if (!this.encounter() && this.selectedPatientId && this.canWrite()) {
      this.ensureEncounterForPatient(this.selectedPatientId);
    }
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

  onProcedureFormInput(_event?: Event) {
    this.notifyProcedureChange();
  }

  private notifyProcedureChange() {
    if (!this.canWrite()) return;
    if (!this.encounter()) {
      if (this.selectedPatientId) {
        this.ensureEncounterForPatient(this.selectedPatientId);
      }
      return;
    }
    if (this.isLocked()) {
      this.scheduleLockedProcedureSave();
    } else {
      this.setWorkDirty(true);
      this.autosave.notifyChange();
    }
  }

  private scheduleLockedProcedureSave() {
    if (this.procedurePersistTimer) clearTimeout(this.procedurePersistTimer);
    this.procedurePersistTimer = setTimeout(() => this.saveProceduresOnly(), 1500);
  }

  saveProceduresOnly() {
    const enc = this.encounter();
    if (!enc || !this.canWrite()) return;
    if (this.procedurePersistTimer) {
      clearTimeout(this.procedurePersistTimer);
      this.procedurePersistTimer = null;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.updateProcedures(enc.id, this.editableRows().procedures).subscribe({
      next: (updated) => {
        this.procedures = [...(updated.procedures || [])];
        this.saving.set(false);
        this.message.set('Procedimientos CUPS guardados.');
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.message || 'No se pudieron guardar los procedimientos CUPS.');
      },
    });
  }

  applyProcedureFromCatalog(index: number, item: CatalogCode) {
    const row = this.procedures[index];
    if (!row) return;
    row.cupsCode = item.code;
    row.description = item.description;
    this.cupsRowOpen.set(null);
    this.cupsRowResults.set([]);
    this.notifyProcedureChange();
  }

  addDiagnosis(item: CatalogCode) {
    this.diagnoses = [
      ...this.diagnoses,
      { cieCode: item.code, description: item.description, type: 'IMPRESSION' },
    ];
    this.cieQuery = '';
    this.cieResults.set([]);
    this.cieOpen.set(false);
    this.notifyDiagnosisChange();
  }

  removeDiagnosis(index: number) {
    this.diagnoses = this.diagnoses.filter((_, i) => i !== index);
    if (this.cieRowOpen() === index) {
      this.cieRowOpen.set(null);
      this.cieRowResults.set([]);
    }
    this.notifyDiagnosisChange();
  }

  addProcedure(item: CatalogCode) {
    this.procedures = [...this.procedures, { cupsCode: item.code, description: item.description }];
    this.cupsQuery = '';
    this.cupsResults.set([]);
    this.cupsOpen.set(false);
    this.notifyProcedureChange();
  }

  removeProcedure(index: number) {
    this.procedures = this.procedures.filter((_, i) => i !== index);
    if (this.cupsRowOpen() === index) {
      this.cupsRowOpen.set(null);
      this.cupsRowResults.set([]);
    }
    this.notifyProcedureChange();
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

  private guardianField(
    key:
      | 'guardianFullName'
      | 'guardianDocumentType'
      | 'guardianDocumentNumber'
      | 'guardianRelationship',
  ): string {
    const enc = this.encounter()?.patient;
    const listed = this.patients().find((p) => p.id === this.selectedPatientId);
    const raw =
      (enc?.[key] as string | null | undefined) ??
      (listed?.[key] as string | null | undefined) ??
      (this.patientForm[key] as string | null | undefined);
    return (raw ?? '').trim();
  }

  consentGuardianName() {
    return this.guardianField('guardianFullName');
  }

  consentGuardianDocType() {
    return this.guardianField('guardianDocumentType') || 'CC';
  }

  consentGuardianDocument() {
    return this.guardianField('guardianDocumentNumber');
  }

  consentGuardianRelationship() {
    return this.guardianField('guardianRelationship');
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
    this.message.set('Firma del paciente guardada y consentimiento vinculado a la atención.');
    const enc = this.encounter();
    if (enc?.patient?.id) this.loadSealedConsents(enc.patient.id);
    // HC sellada: no hay texto sin guardar, se recarga para mostrar la firma del servidor.
    if (enc?.id && this.isLocked() && !this.saving()) {
      this.api.getEncounter(enc.id).subscribe({
        next: (fresh) => {
          if (fresh) this.applyEncounter(fresh);
        },
        error: () => undefined,
      });
      return;
    }
    // Borrador: solo metadatos; recargar el cuerpo clínico borraba lo aún no autoguardado.
    this.refreshConsentStateOnly();
  }

  onConsentFlagsChanged() {
    // Intencionalmente vacío: antes recargaba toda la HCE y perdía el borrador local.
  }

  scrollToPatientSignature() {
    document.getElementById('consent-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    setTimeout(() => {
      document.getElementById('patient-signature-pad')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      this.consentSigner?.ensurePads();
    }, 280);
  }

  /** Abre la sección 5 y genera/enfoca la firma virtual por WhatsApp. */
  openRemotePatientSignature() {
    if (!this.consentPatientId()) {
      this.error.set('Seleccione un paciente antes de enviar la firma virtual.');
      return;
    }
    if (!this.encounter()?.id) {
      this.error.set(
        'Abra o cree la atención del paciente (arriba) para enviar la firma virtual por WhatsApp.',
      );
      this.scrollToPatientSignature();
      return;
    }
    this.modality = 'VIRTUAL';
    this.scrollToPatientSignature();
    setTimeout(() => {
      const signer = this.consentSigner;
      if (!signer) {
        this.error.set('Esta historia ya tiene la firma del paciente registrada.');
        return;
      }
      signer.focusRemoteInvite();
      void signer.sendRemoteInvite();
    }, 350);
  }

  onPatientSignatureChanged(dataUrl: string | null) {
    this.patientSigPreview.set(dataUrl);
    if (dataUrl) {
      this.content.consentDraft = {
        ...(this.content.consentDraft || {}),
        patientSignatureBase64: dataUrl,
        patientSignaturePending: false,
      };
      try {
        const encId = this.encounter()?.id;
        if (encId) sessionStorage.setItem(`habilisalud_patient_sig_${encId}`, dataUrl);
      } catch {
        // ignore
      }
    } else if (this.content.consentDraft) {
      this.content.consentDraft = {
        ...this.content.consentDraft,
        patientSignatureBase64: null,
      };
    }
    this.autosave.notifyChange();
    // La firma del paciente no espera al debounce: se sube a BD en cuanto termina el trazo.
    if (dataUrl) this.autosave.flushToServerNow();
  }

  /** ¿Hay firma del paciente para sellar (lienzo, borrador o consentimiento)? */
  hasPatientSignatureForSeal(): boolean {
    return (
      !!this.patientSignaturePreview() ||
      !!this.content.consentDraft?.patientSignatureBase64 ||
      this.consentSignerSignedCount() > 0
    );
  }

  private loadSealedConsents(patientId: string) {
    this.api.listPatientConsents({ patientId }).subscribe({
      next: (rows) => {
        this.sealedConsents.set(rows);
        if (!this.patientSigPreview()) {
          const encId = this.encounter()?.id;
          const match =
            rows.find((r) => r.encounterId === encId && r.signatureBase64) ||
            rows.find((r) => r.signatureBase64);
          if (match?.signatureBase64) {
            const raw = match.signatureBase64;
            this.patientSigPreview.set(raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`);
          }
        }
      },
      error: () => this.sealedConsents.set([]),
    });
  }

  openSealedConsentPdf(id: string) {
    this.api.downloadPatientConsentPdf(id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => this.error.set('No se pudo abrir el PDF del consentimiento.'),
    });
  }

  private restorePatientSignaturePreview(enc: Encounter) {
    const fromServer = enc.clinicalRecord?.content?.consentDraft?.patientSignatureBase64;
    if (fromServer) {
      this.patientSigPreview.set(fromServer);
      return;
    }
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(`habilisalud_patient_sig_${enc.id}`);
    } catch {
      // ignore
    }
    // Sin firma de este encuentro no debe quedar la de otro paciente abierto antes.
    this.patientSigPreview.set(stored);
    if (stored && !this.isLocked()) {
      this.content.consentDraft = {
        ...(this.content.consentDraft || {}),
        patientSignatureBase64: stored,
        patientSignaturePending: false,
      };
    }
  }

  consentDraftPatientSignature(): string | null {
    return (
      this.patientSigPreview() ||
      this.encounter()?.clinicalRecord?.content?.consentDraft?.patientSignatureBase64 ||
      null
    );
  }

  hasPatientSignatureDrawn() {
    return !!this.patientSigPreview() || !!this.consentSigner?.hasPatientSignature();
  }

  patientSignaturePreview(): string | null {
    return this.patientSigPreview() || this.consentSigner?.currentPatientSignature() || null;
  }

  consentSignerSignedCount() {
    return this.consentSigner?.signed().length ?? 0;
  }

  /** Tras sellar un consentimiento, actualiza flags sin pisar el texto clínico. */
  private refreshConsentStateOnly() {
    const enc = this.encounter();
    if (!enc?.id || this.saving()) return;
    this.api.getEncounter(enc.id).subscribe({
      next: (fresh) => {
        if (!fresh) return;
        this.consents =
          fresh.consents?.length > 0
            ? fresh.consents.map((c) => ({ ...c }))
            : this.consents;
      },
      error: () => undefined,
    });
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

  /** Pinta en el panel Ley 527 la firma guardada (borrador, perfil o trazo actual). */
  private applyStoredSignatureToPad(dataUrl: string) {
    const apply = () => this.restoreSignatureToPad(dataUrl);
    if (this.signaturePad) apply();
    else setTimeout(apply, 120);
  }

  /** Restaura el trazo visible al abrir/consultar una historia. */
  private restoreSignatureToPad(dataUrl?: string | null) {
    const source =
      dataUrl ||
      this.content.signature?.signatureBase64 ||
      this.professionalSignature() ||
      this.storedSignature();
    if (!source) return;
    const pad = this.signaturePad;
    const canvas = this.signaturePadCanvas?.nativeElement;
    if (!pad || !canvas) return;
    pad.clear();
    void pad.fromDataURL(source, {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    });
    this.professionalSignature.set(source);
    this.hasStroke.set(true);
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
    const sealed = this.content.signature?.signatureBase64;
    if (sealed) {
      this.professionalSignature.set(sealed);
      return true;
    }
    this.error.set(
      this.isLocked()
        ? 'Guarde su firma en el perfil (o dibújela en el panel de evolución) antes de firmar la nota.'
        : 'Dibuje su firma en el panel «Firma digital» de la derecha antes de firmar documentos.',
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
        this.message.set(
          'Firma guardada. Se usará en la historia clínica.',
        );
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
    const composed = this.composeEvolutionNote();
    if (composed.trim().length < 5) {
      this.error.set(
        !this.requiresMentalExamInEvolution()
          ? 'Escriba la nota de esta sesión (evolución / control) antes de firmar.'
          : 'Escriba la nota de esta sesión y/o el examen mental antes de firmar el control.',
      );
      return;
    }
    if (this.requiresMentalExamInEvolution() && !(this.evolutionMentalExam || '').trim()) {
      this.error.set('El examen mental es obligatorio en cada nota de control.');
      return;
    }

    const attention = this.evolutionAttentionDate ? new Date(this.evolutionAttentionDate) : new Date();
    if (Number.isNaN(attention.getTime())) {
      this.error.set('Seleccione una fecha de atención clínica válida.');
      return;
    }
    if (attention.getTime() > Date.now() + 60_000) {
      this.error.set('La fecha de atención clínica no puede ser futura.');
      return;
    }

    const situation = this.evolutionCurrentSituation.trim();
    this.signing.set(true);
    this.error.set('');
    this.api
      .addEvolution(enc.id, {
        note: composed.trim(),
        reason: 'Nota de evolución',
        currentSituation: situation || undefined,
        clinicalAttentionDate: attention.toISOString(),
        signatureBase64: this.currentSignature(),
      })
      .subscribe({
        next: (updated) => {
          this.applyEncounter(updated);
          this.signing.set(false);
          this.evolutionNote = '';
          // La situación actual persiste para la próxima evolución.
          this.evolutionCurrentSituation = situation;
          this.evolutionSituationInherited.set(situation ? 'la evolución recién firmada' : null);
          this.evolutionAttentionDate = this.nowLocal();
          this.evolutionMentalExam = '';
          this.dentalEvolution = emptyDentalEvolution();
          this.evolutionSoap = {
            subjective: '',
            objective: '',
            assessment: '',
            plan: '',
          };
          this.message.set('Nota de control firmada y anexada a la historia.');
          this.scrollToEvolutions();
        },
        error: (err) => {
          this.signing.set(false);
          this.error.set(err?.error?.message || 'No se pudo registrar la nota de control.');
        },
      });
  }

  /**
   * Nueva evolución: fecha de atención = ahora y «Situación actual» heredada de la
   * última evolución registrada del paciente. No pisa lo que ya se esté escribiendo.
   */
  private prepareNewEvolution(patientId: string) {
    const samePatient = this.evolutionSituationPatientId === patientId;
    if (!samePatient) {
      this.evolutionSituationPatientId = patientId;
      this.evolutionCurrentSituation = '';
      this.evolutionSituationInherited.set(null);
      this.evolutionAttentionDate = this.nowLocal();
    }
    if (!this.evolutionAttentionDate) this.evolutionAttentionDate = this.nowLocal();
    if (!this.canWrite() || samePatient) return;
    this.api.lastCurrentSituation(patientId).subscribe({
      next: (res) => {
        if (this.evolutionSituationPatientId !== patientId) return;
        if (this.evolutionCurrentSituation.trim() || !res.currentSituation) return;
        this.evolutionCurrentSituation = res.currentSituation;
        this.evolutionSituationInherited.set(
          res.clinicalAttentionDate
            ? `la evolución del ${new Date(res.clinicalAttentionDate).toLocaleDateString('es-CO')}`
            : 'la última evolución',
        );
      },
      error: () => undefined,
    });
  }

  /** Fecha de atención de una evolución (legado: fecha de firma). */
  evolutionAttentionDateOf(ev: ClinicalEvolution): string {
    return ev.clinicalAttentionDate || ev.signedAt;
  }

  /** Situación actual; las evoluciones antiguas la tenían en «Motivo del control». */
  evolutionSituationOf(ev: ClinicalEvolution): string {
    const situation = (ev.content.currentSituation || '').trim();
    if (situation) return situation;
    const reason = (ev.content.reason || '').trim();
    const generic = ['Nota de evolución', 'Control / nota de evolución', 'Adenda / nota aclaratoria'];
    return generic.includes(reason) ? '' : reason;
  }

  /** Evolución registrada en un día distinto al de la atención. */
  evolutionIsBackdated(ev: ClinicalEvolution): boolean {
    const attention = ev.clinicalAttentionDate;
    if (!attention) return false;
    return new Date(attention).toDateString() !== new Date(ev.signedAt).toDateString();
  }

  /** Une evolución terapéutica + examen mental / evaluación FT (+ SOAP opcional). */
  private composeEvolutionNote(): string {
    const parts: string[] = [];
    const session = this.evolutionNote.trim();
    const mental = this.evolutionMentalExam.trim();
    const dentalNote = this.isDentistryClinic();
    if (session) {
      parts.push(dentalNote ? `Procedimientos realizados:\n${session}` : `Evolución terapéutica:\n${session}`);
    }
    if (dentalNote) {
      const e = this.dentalEvolution;
      const next = e.nextAppointment
        ? new Date(`${e.nextAppointment}T12:00:00`).toLocaleDateString('es-CO')
        : '';
      const fields: Array<[string, string]> = [
        ['Piezas tratadas', e.teeth],
        ['Hallazgos', e.findings],
        ['Anestesia', e.anesthesia],
        ['Material utilizado', e.material],
        ['Complicaciones', e.complications],
        ['Indicaciones', e.instructions],
        ['Próxima cita', next],
      ];
      const lines = fields.filter(([, v]) => (v || '').trim()).map(([k, v]) => `${k}: ${v.trim()}`);
      if (lines.length) parts.push(lines.join('\n'));
    }
    if (mental) {
      parts.push(
        dentalNote
          ? `Respuesta del paciente:\n${mental}`
          : this.isPhysiotherapyClinic()
            ? `Evaluación / hallazgos de la sesión:\n${mental}`
            : `Examen mental:\n${mental}`,
      );
    }

    const soapParts: string[] = [];
    const map: Array<[string, string]> = [
      ['S — Subjetivo', this.evolutionSoap.subjective],
      ['O — Objetivo', this.evolutionSoap.objective],
      ['A — Análisis', this.evolutionSoap.assessment],
      ['P — Plan', this.evolutionSoap.plan],
    ];
    for (const [label, value] of map) {
      const t = (value || '').trim();
      if (t) soapParts.push(`${label}:\n${t}`);
    }
    if (soapParts.length) parts.push(soapParts.join('\n\n'));
    return parts.join('\n\n');
  }

  toggleInitialHistory() {
    this.showInitialHistory.update((v) => !v);
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
    this.restoreSignatureToPad();
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
      this.content.profile = this.isPhysiotherapyClinic()
        ? 'PHYSIOTHERAPY'
        : this.isDentistryClinic()
          ? 'DENTISTRY'
          : 'FULL';
      if (this.isDentistryClinic()) {
        this.allergiesText = dentalAllergyList(this.dental()).join(', ');
        this.medicationsText = dentalMedicationList(this.dental()).join(', ');
        // Los diagnósticos odontológicos alimentan los diagnósticos CIE-10 de la atención (RIPS/RDA).
        this.diagnoses = this.dental()
          .diagnoses.filter((d) => d.cieCode.trim())
          .map((d, i) => ({
            cieCode: d.cieCode.trim().toUpperCase(),
            description: (d.description || '').trim() || d.cieCode.trim(),
            type: i === 0 ? ('PRINCIPAL' as const) : ('RELATED' as const),
          }));
      }
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
      // Sincroniza examen mental libre → campos legacy para RDA/compatibilidad.
      const narrative = (this.content.mentalExam.narrative || '').trim();
      if (narrative) {
        this.content.mentalExam.appearance = narrative;
      }
      // Fisioterapia: si llenó diagnóstico FT y no hay motivo/impresión, sincroniza.
      if (this.isPhysiotherapyClinic() && this.content.physiotherapy) {
        const ft = this.content.physiotherapy;
        const ftDx = (ft.physioDiagnosis || ft.physioDxDescription || '').trim();
        const ftFindings = (ft.findings || '').trim();
        if (ftFindings && !(this.content.careMinimum.presentIllness || '').trim()) {
          this.content.careMinimum.presentIllness = ftFindings;
        }
        if (ftDx && !(this.content.careMinimum.motive || '').trim()) {
          this.content.careMinimum.motive = ftDx;
        }
        if (ftDx && !(this.content.assessment.impressionNarrative || '').trim()) {
          this.content.assessment.impressionNarrative = ftDx;
        }
      }
      const flags = this.content.careMinimum.antecedentFlags;
      if (flags) {
        this.content.careMinimum.antecedents = [
          flags.personales.applies
            ? `Personales: ${flags.personales.detail || 'Aplica'}`
            : 'Personales: No aplica',
          flags.psiquiatricos.applies
            ? `Psiquiátricos: ${flags.psiquiatricos.detail || 'Aplica'}`
            : 'Psiquiátricos: No aplica',
          flags.familiares.applies
            ? `Familiares: ${flags.familiares.detail || 'Aplica'}`
            : 'Familiares: No aplica',
          flags.toxicos.applies
            ? `Tóxicos: ${flags.toxicos.detail || 'Aplica'}`
            : 'Tóxicos: No aplica',
        ].join('\n');
      }
      this.content.rdaMeta.includedEvents = Object.entries(this.rdaEvents)
        .filter(([, v]) => v)
        .map(([k]) => k);
      this.content.rdaMeta.physicalLocation = this.location;
    }
    const drawn = this.currentSignature();
    if (drawn && !this.isLocked()) {
      this.content.signature = {
        ...this.content.signature,
        signatureBase64: drawn,
        professionalName:
          this.content.signature.professionalName ||
          this.encounter()?.professional?.fullName ||
          this.user()?.fullName ||
          '',
        professionalCard:
          this.content.signature.professionalCard ||
          this.encounter()?.professional?.professionalCard ||
          '',
      };
    }
    const patientSig =
      this.patientSigPreview() ||
      this.consentSigner?.currentPatientSignature() ||
      null;
    if (patientSig && !this.isLocked()) {
      this.content.consentDraft = {
        ...(this.content.consentDraft || {}),
        patientSignatureBase64: patientSig,
        patientSignaturePending: false,
      };
    } else if (!this.isLocked()) {
      const hasPatient =
        !!patientSig ||
        !!this.content.consentDraft?.patientSignatureBase64 ||
        this.consentSignerSignedCount() > 0 ||
        this.consentGranted('INFORMED') ||
        this.consentGranted('DATA_PROCESSING');
      this.content.consentDraft = {
        ...(this.content.consentDraft || {}),
        patientSignaturePending: !hasPatient,
      };
    }
    // Congela la fecha de digitación (no la de “Guardar / sellar”).
    if (!this.content.documentedAt) {
      this.content.documentedAt =
        this.encounter()?.createdAt ||
        this.encounter()?.startedAt ||
        new Date().toISOString();
    }
  }

  /**
   * Firma profesional obligatoria para cerrar; firma del paciente puede quedar pendiente.
   */
  private pendingSignatures() {
    const signer = this.consentSigner;
    const professional =
      this.hasStroke() ||
      !!this.professionalSignature() ||
      !!this.storedSignature() ||
      !!signer?.hasProfessionalSignature();
    return { professional: !professional, patient: false };
  }

  /** HC sellada sin consentimiento del paciente: puede completarse después. */
  /** HC sellada sin imagen de firma del paciente (las casillas de consentimiento no cuentan). */
  patientConsentPending() {
    if (!this.isLocked()) return false;
    if (this.consentDraftPatientSignature()) return false;
    const encId = this.encounter()?.id;
    const signedHere = this.sealedConsents().some(
      (row) => !!row.signatureBase64 && (!encId || row.encounterId === encId),
    );
    return !signedHere;
  }

  clinicalDocumentDate(): string | null {
    return (
      this.content.documentedAt ||
      this.encounter()?.createdAt ||
      this.encounter()?.startedAt ||
      null
    );
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
    if (this.isMinor()) {
      if (!f.guardianFullName?.trim()) missing.push('Nombre del acudiente');
      if (!f.guardianDocumentNumber?.trim()) missing.push('Documento del acudiente');
      if (!f.guardianRelationship?.trim()) missing.push('Parentesco del acudiente');
      if (!f.guardianPhone?.trim()) missing.push('Teléfono del acudiente');
    }
    if (this.ripsEnabled()) {
      if (!this.purpose.trim()) missing.push('Finalidad (RIPS)');
      if (!this.externalCause.trim()) missing.push('Causa externa (RIPS)');
      if (!this.diagnoses.some((d) => d.cieCode?.trim())) {
        missing.push('Al menos un diagnóstico CIE-10');
      }
      if (!this.procedures.some((p) => p.cupsCode?.trim())) {
        missing.push('Al menos un procedimiento CUPS');
      }
    }
    return missing;
  }

  /** Lo que impide cerrar la historia; el resto de campos puede quedar vacío. */
  private saveBlockers() {
    const signatures = this.pendingSignatures();
    const identification = this.pendingIdentification();
    const measures = this.isDentistryClinic() && this.showOrthoModule() ? orthoMeasureErrors(this.dental().orthodontics) : [];
    if (!signatures.professional && !signatures.patient && !identification.length && !measures.length) return null;
    return { ...signatures, identification, measures };
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
    if (this.isDentistryClinic()) {
      this.collectContent();
      const issues = validateDentistryForSeal(this.content.careMinimum.motive, this.dental());
      if (issues.length) {
        this.error.set(`Antes de sellar la historia de ${this.dentalSpecialtyLabel().toLowerCase()}: ${issues.join(' ')}`);
        return;
      }
    }
    const pending = this.saveBlockers();
    if (pending) {
      this.missingSignatures.set(pending);
      return;
    }
    this.error.set('');
    this.confirmSave.set(true);
  }

  private buildDraftPayload() {
    const enc = this.encounter();
    if (!enc || !this.canWrite() || this.isLocked()) return null;
    this.collectContent();
    return {
      encounterId: enc.id,
      body: {
        content: this.content,
        noteFormat: this.noteFormat(),
        ...this.editableRows(),
        modality: this.modality,
        serviceType: this.defaultServiceLabel,
        location: this.location,
        purpose: this.ripsEnabled() ? this.purpose : this.purpose || null,
        externalCause: this.ripsEnabled()
          ? this.externalCause || null
          : this.externalCause || null,
        generateRips: this.ripsEnabled() && this.generateRipsForThisEncounter,
      },
    };
  }

  private tryBuildDraftPayload() {
    try {
      return this.buildDraftPayload();
    } catch (err) {
      console.error('[hce] preparar borrador', err);
      return null;
    }
  }

  private describeSaveError(err: unknown, fallback: string): string {
    if (err instanceof TimeoutError) return 'El servidor tardó demasiado en responder.';
    const http = err as { status?: number; error?: { message?: string | string[] } };
    if (http?.status === 0) return 'Sin conexión con el servidor.';
    const msg = http?.error?.message;
    if (Array.isArray(msg)) return msg.join(' ');
    return msg || fallback;
  }

  /**
   * Guarda en BD sin firmar ni cerrar: contenido clínico, diagnósticos,
   * procedimientos y datos del paciente quedan persistidos como borrador.
   */
  saveDraftOnly() {
    if (!this.canWrite()) {
      this.error.set('Su rol no permite editar la historia clínica.');
      return;
    }
    if (this.isLocked()) {
      this.error.set(
        'Esta historia ya está sellada. Use una nota de evolución para ampliar.',
      );
      return;
    }

    const runSave = async () => {
      const payload = this.tryBuildDraftPayload();
      if (!payload) {
        this.error.set('No se pudo preparar el borrador. Revise la atención abierta.');
        return;
      }
      this.writeLocalDraftNow();
      const revisionAtStart = this.autosave.currentRevision();
      this.saving.set(true);
      this.error.set('');
      try {
        const [clinical] = await Promise.all([
          firstValueFrom(
            this.api
              .saveDraft(payload.encounterId, payload.body)
              .pipe(timeout(AUTOSAVE_TIMEOUT_MS)),
          ),
          firstValueFrom(
            this.persistPatientDemographics().pipe(
              timeout(AUTOSAVE_TIMEOUT_MS),
              catchError(() => of(null)),
            ),
          ),
        ]);
        if (this.autosave.currentRevision() !== revisionAtStart) {
          // Siguió escribiendo mientras respondía: no rehidratar (borraría lo nuevo).
          this.encounter.set(clinical);
          this.saving.set(false);
          this.autosave.notifyChange();
          this.message.set('Borrador guardado. Los últimos cambios se autoguardarán en unos segundos.');
          return;
        }
        this.localDrafts.clearAllFor({
          encounterId: payload.encounterId,
          tabKey: this.tabKey() || this.instanceId,
          patientId: this.encounter()?.patient?.id ?? this.selectedPatientId ?? null,
        });
        this.skipLocalRestoreOnce = true;
        this.applyEncounter(clinical);
        this.saving.set(false);
        this.autosave.markManualSave();
        this.message.set('Borrador guardado en la base de datos.');
      } catch (err) {
        this.saving.set(false);
        const detail = this.describeSaveError(err, 'No se pudo guardar el borrador.');
        this.error.set(`${detail} Lo escrito sigue guardado en este navegador.`);
        this.showSaveError(detail);
      }
    };

    if (!this.encounter()) {
      if (!this.selectedPatientId) {
        this.error.set('Seleccione un paciente antes de guardar el borrador.');
        return;
      }
      this.saving.set(true);
      this.withEncounterReady().subscribe({
        next: () => {
          this.saving.set(false);
          void runSave();
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.message || 'No se pudo abrir la atención.');
        },
      });
      return;
    }

    void runSave();
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
    if (!this.canWrite() || this.isLocked()) return;
    const pending = this.saveBlockers();
    if (pending) {
      this.confirmSave.set(false);
      this.missingSignatures.set(pending);
      return;
    }

    this.confirmSave.set(false);
    this.error.set('');

    let enc = this.encounter();
    if (!enc) {
      if (!this.selectedPatientId) {
        this.error.set('Seleccione un paciente antes de guardar la historia clínica.');
        return;
      }
      try {
        enc = await firstValueFrom(this.withEncounterReady());
      } catch (err: unknown) {
        const msg =
          (err as { error?: { message?: string } })?.error?.message ||
          'No se pudo abrir la atención en el servidor.';
        this.error.set(msg);
        return;
      }
    }

    try {
      if (this.pendingAttachmentFileList().length && !this.selectedPatientId && !enc.patient?.id) {
        this.error.set(
          'Hay un anexo pendiente. Seleccione el paciente antes de guardar la historia clínica.',
        );
        return;
      }
      await this.ensureAttachmentsUploaded(enc);
      const refreshed = this.encounter();
      if (refreshed) enc = refreshed;
    } catch (err: unknown) {
      this.error.set(
        (err as { error?: { message?: string } })?.error?.message ||
          'No se pudieron subir los anexos antes de guardar la historia clínica.',
      );
      return;
    }

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
    this.writeLocalDraftNow();
    this.saving.set(true);
    this.error.set('');
    this.persistPatientDemographics()
      .pipe(
        timeout(AUTOSAVE_TIMEOUT_MS),
        switchMap(() =>
          this.api.saveDraft(enc.id, {
            content: this.content,
            noteFormat: this.noteFormat(),
            ...this.editableRows(),
            modality: this.modality,
            serviceType: this.defaultServiceLabel,
            location: this.location,
            purpose: this.purpose,
            externalCause: this.externalCause || null,
            generateRips: this.ripsEnabled() && this.generateRipsForThisEncounter,
          }).pipe(timeout(AUTOSAVE_TIMEOUT_MS)),
        ),
        // Sellar genera PDF y RDA en el servidor: se le da más margen.
        switchMap(() =>
          this.api.signClinicalRecord(enc.id, drawn).pipe(timeout(AUTOSAVE_TIMEOUT_MS * 3)),
        ),
      )
      .subscribe({
        next: (updated) => {
          if (drawn) this.storedSignature.set(drawn);
          this.localDrafts.clearAllFor({
            encounterId: enc.id,
            tabKey: this.tabKey() || this.instanceId,
            patientId: enc.patient.id,
          });
          this.skipLocalRestoreOnce = true;
          this.applyEncounter(updated);
          this.saving.set(false);
          this.setWorkDirty(false);
          this.message.set(
            this.patientConsentPending() || this.content.consentDraft?.patientSignaturePending
              ? 'Historia clínica guardada y sellada. Abajo ve el contenido y el bloque de notas de evolución.'
              : 'Historia clínica guardada y sellada. Abajo ve el contenido guardado y el bloque de notas de evolución / control.',
          );
          this.refreshLists();
          queueMicrotask(() => this.scrollToEvolutions());
        },
        error: (err) => {
          this.saving.set(false);
          const detail = this.describeSaveError(err, 'No se pudo guardar la historia clínica.');
          this.error.set(`${detail} Lo escrito sigue guardado en este navegador; intente de nuevo.`);
          this.showSaveError(detail);
          this.autosave.notifyChange();
        },
      });
  }

  /** Registra solo la firma del paciente cuando la HC ya está sellada. */
  async registerPatientSignature() {
    if (!this.patientConsentPending()) {
      this.error.set('No hay firma del paciente pendiente en esta historia.');
      return;
    }
    if (!this.consentSigner?.canSeal()) {
      this.error.set(
        'Dibuje la firma del paciente en la sección 5 (recuadro «Firma paciente») antes de registrar.',
      );
      this.scrollToPatientSignature();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const sealed = await this.consentSigner.seal();
    if (!sealed) {
      this.saving.set(false);
      this.error.set(this.consentSigner.error() || 'No se pudo registrar la firma del paciente.');
      return;
    }
    this.refreshConsentStateOnly();
    const enc = this.encounter();
    if (enc?.id) {
      this.api.getEncounter(enc.id).subscribe({
        next: (fresh) => {
          if (!fresh) return;
          if (this.content.consentDraft) {
            this.content.consentDraft.patientSignaturePending = false;
          }
          this.applyEncounter(fresh);
          this.saving.set(false);
          this.message.set(
            'Firma del paciente registrada y PDF de consentimiento generado. La fecha de digitación de la HC no cambió.',
          );
        },
        error: () => {
          this.saving.set(false);
          this.message.set(
            'Firma del paciente registrada. La fecha de digitación de la HC no cambió.',
          );
        },
      });
      return;
    }
    this.saving.set(false);
    this.message.set(
      'Firma del paciente registrada y PDF de consentimiento generado. La fecha de digitación de la HC no cambió.',
    );
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
    if (!this.supportsIncapacity()) return true;
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

  attachmentFiles: File[] = [];

  openAttachmentFilePicker() {
    if (!this.canWrite()) return;
    this.attachmentFileInput?.nativeElement.click();
  }

  pendingAttachmentFileList(): File[] {
    return this.attachmentFiles.length > 0
      ? this.attachmentFiles
      : this.attachmentFile
        ? [this.attachmentFile]
        : [];
  }

  onAttachmentFile(event: Event) {
    const input = event.target as HTMLInputElement;
    this.attachmentFiles = input.files ? Array.from(input.files) : [];
    this.attachmentFile = this.attachmentFiles[0] || null;
    if (this.attachmentFiles.length) {
      if (this.isLocked() && this.encounter()) {
        this.message.set('Guardando anexo con este paciente…');
        void this.flushAttachmentsToServer();
        return;
      }
      this.message.set(
        this.attachmentFiles.length === 1
          ? `Archivo «${this.attachmentFiles[0].name}» listo. Se guardará al pulsar «Guardar historia clínica».`
          : `${this.attachmentFiles.length} archivos listos. Se guardarán al pulsar «Guardar historia clínica».`,
      );
      this.setWorkDirty(true);
    }
  }

  /** Sube anexos pendientes de inmediato (HC ya sellada). */
  private flushAttachmentsToServer() {
    const enc = this.encounter();
    if (!enc || !this.pendingAttachmentFileList().length) return;
    this.ensureAttachmentsUploaded(enc)
      .then(() => {
        this.message.set('Anexo guardado con este paciente.');
      })
      .catch((err: unknown) =>
        this.error.set(
          (err as { error?: { message?: string } })?.error?.message ||
            'No se pudo guardar el anexo.',
        ),
      );
  }

  /** Sube archivos pendientes a la atención del paciente activo. */
  private ensureAttachmentsUploaded(enc: Encounter): Promise<void> {
    const files = this.pendingAttachmentFileList();
    if (!files.length) return Promise.resolve();

    this.attachmentUploading.set(true);
    return firstValueFrom(
      forkJoin(files.map((file) => this.uploadOneAttachment(enc, file))).pipe(
        tap((uploaded) => {
          this.attachments.set([...uploaded, ...this.attachments()]);
          this.clearAttachmentSelection();
          this.attachmentUploading.set(false);
        }),
        catchError((err) => {
          this.attachmentUploading.set(false);
          return throwError(() => err);
        }),
        map(() => undefined),
      ),
    );
  }

  private uploadOneAttachment(enc: Encounter, file: File) {
    const form = new FormData();
    form.append('file', file);
    form.append('encounterId', enc.id);
    if (enc.clinicalRecord?.id) {
      form.append('clinicalRecordId', enc.clinicalRecord.id);
    }
    form.append('label', file.name);
    form.append('category', 'OTHER');
    return this.api.uploadAttachment(form);
  }

  private clearAttachmentSelection() {
    this.attachmentFile = null;
    this.attachmentFiles = [];
    this.resetAttachmentFileInput();
  }

  private resetAttachmentFileInput() {
    const input = this.attachmentFileInput?.nativeElement;
    if (input) input.value = '';
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
    if (f.profession !== undefined && f.profession !== null) {
      payload.profession = String(f.profession).trim();
    }
    if (f.occupation !== undefined && f.occupation !== null) {
      payload.occupation = String(f.occupation).trim();
    }
    if (f.educationLevel) payload.educationLevel = f.educationLevel;
    if (f.emergencyContactName) payload.emergencyContactName = f.emergencyContactName;
    if (f.emergencyContactPhone) payload.emergencyContactPhone = f.emergencyContactPhone;
    if (f.emergencyRelationship) payload.emergencyRelationship = f.emergencyRelationship;
    if (f.guardianFullName) payload.guardianFullName = f.guardianFullName;
    if (f.guardianDocumentType) payload.guardianDocumentType = f.guardianDocumentType;
    if (f.guardianDocumentNumber) payload.guardianDocumentNumber = f.guardianDocumentNumber;
    if (f.guardianRelationship) payload.guardianRelationship = f.guardianRelationship;
    if (f.guardianPhone) payload.guardianPhone = f.guardianPhone;
    if (f.guardianEmail) payload.guardianEmail = f.guardianEmail;
    // La foto se gestiona por POST/DELETE /patients/:id/photo (no por URL).

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

  readonly websiteUrl = WEBSITE_URL;

  goHome() {
    this.auth.goToWebsite();
  }

  logout() {
    this.auth.logoutToClinicLogin();
  }
}
