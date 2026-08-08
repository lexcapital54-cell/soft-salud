import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ClinicalApiService } from './clinical-api.service';
import { ConsentSigner } from './consent-signer';
import { DOCUMENT_TYPES } from './document-types';
import {
  CatalogCode,
  ClinicalContent,
  ConsentRow,
  DiagnosisRow,
  Encounter,
  EncounterListItem,
  Patient,
  ProcedureRow,
} from './clinical.models';

function emptyContent(): ClinicalContent {
  return {
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
    vitals: { notes: 'No aplica' },
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
  imports: [FormsModule, RouterLink, DatePipe, ConsentSigner],
  templateUrl: './clinical-history.html',
  styleUrl: './clinical-history.scss',
})
export class ClinicalHistory implements OnInit {
  private readonly api = inject(ClinicalApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly documentTypes = DOCUMENT_TYPES;

  readonly user = this.auth.user;
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  readonly patients = signal<Patient[]>([]);
  readonly encounters = signal<EncounterListItem[]>([]);
  readonly encounter = signal<Encounter | null>(null);

  readonly cieResults = signal<CatalogCode[]>([]);
  readonly cupsResults = signal<CatalogCode[]>([]);
  cieQuery = '';
  cupsQuery = '';

  patientMode: 'select' | 'create' = 'select';
  selectedPatientId = '';
  patientForm: Partial<Patient> = {
    documentType: 'CC',
    documentNumber: '',
    firstName: '',
    lastName: '',
    birthDate: '',
    city: 'Manizales',
    department: 'Caldas',
  };

  content: ClinicalContent = emptyContent();
  diagnoses: DiagnosisRow[] = [];
  procedures: ProcedureRow[] = [];
  consents: ConsentRow[] = [
    { consentType: 'INFORMED', granted: false },
    { consentType: 'DATA_PROCESSING', granted: false },
  ];
  modality: 'IN_PERSON' | 'VIRTUAL' = 'IN_PERSON';
  serviceType = 'Consulta externa';
  location = 'Consultorio 1';
  purpose = 'Evaluación';
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

  readonly now = new Date();

  ngOnInit() {
    this.refreshLists();
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
      error: (err) =>
        this.error.set(err?.error?.message || 'No se pudo crear el paciente.'),
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
        this.message.set('Atención abierta en borrador.');
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
    this.content = {
      ...emptyContent(),
      ...(enc.clinicalRecord?.content || {}),
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
          enc.clinicalRecord?.content?.signature?.professionalName ||
          enc.professional.fullName,
        professionalCard:
          enc.clinicalRecord?.content?.signature?.professionalCard ||
          enc.professional.professionalCard ||
          '',
      },
    };
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
    this.serviceType = enc.serviceType || 'Consulta externa';
    this.location = enc.location || 'Consultorio 1';
    this.purpose = enc.purpose || 'Evaluación';
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
  }

  searchCie() {
    if (!this.cieQuery.trim()) {
      this.cieResults.set([]);
      return;
    }
    this.api.searchCie(this.cieQuery).subscribe({
      next: (rows) => this.cieResults.set(rows),
    });
  }

  searchCups() {
    if (!this.cupsQuery.trim()) {
      this.cupsResults.set([]);
      return;
    }
    this.api.searchCups(this.cupsQuery).subscribe({
      next: (rows) => this.cupsResults.set(rows),
    });
  }

  addDiagnosis(item: CatalogCode) {
    this.diagnoses = [
      ...this.diagnoses,
      { cieCode: item.code, description: item.description, type: 'IMPRESSION' },
    ];
    this.cieQuery = '';
    this.cieResults.set([]);
  }

  removeDiagnosis(index: number) {
    this.diagnoses = this.diagnoses.filter((_, i) => i !== index);
  }

  addProcedure(item: CatalogCode) {
    this.procedures = [
      ...this.procedures,
      { cupsCode: item.code, description: item.description },
    ];
    this.cupsQuery = '';
    this.cupsResults.set([]);
  }

  removeProcedure(index: number) {
    this.procedures = this.procedures.filter((_, i) => i !== index);
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
      'Manizales'
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
    const enc = this.encounter();
    if (enc?.id) {
      this.loadEncounter(enc.id);
    }
  }

  onConsentFlagsChanged() {
    const enc = this.encounter();
    if (enc?.id) {
      this.loadEncounter(enc.id);
    }
  }

  saveDraft() {
    const enc = this.encounter();
    if (!enc) {
      this.error.set('Abra o cree una atención primero.');
      return;
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
    this.content.rdaMeta.includedEvents = Object.entries(this.rdaEvents)
      .filter(([, v]) => v)
      .map(([k]) => k);
    this.content.rdaMeta.physicalLocation = this.location;
    this.content.signature.professionalName =
      this.content.signature.professionalName || enc.professional.fullName;

    this.saving.set(true);
    this.error.set('');
    this.api
      .saveDraft(enc.id, {
        content: this.content,
        diagnoses: this.diagnoses,
        procedures: this.procedures,
        consents: this.consents,
        modality: this.modality,
        serviceType: this.serviceType,
        location: this.location,
        purpose: this.purpose,
        externalCause: this.externalCause || null,
      })
      .subscribe({
        next: (updated) => {
          this.applyEncounter(updated);
          this.saving.set(false);
          this.message.set(
            'Borrador de HCE guardado (motivo, examen, diagnósticos, etc.).',
          );
          this.persistPatientDemographics();
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.message || 'No se pudo guardar el borrador.');
        },
      });
  }

  /** Actualiza demografía del paciente solo con campos seguros (sin id/clinicId). */
  private persistPatientDemographics() {
    const id = this.selectedPatientId || this.encounter()?.patient?.id;
    if (!id) return;

    const f = this.patientForm;
    if (!f.documentType || !f.documentNumber || !f.firstName || !f.lastName || !f.birthDate) {
      return;
    }

    const payload: Partial<Patient> = {
      documentType: f.documentType,
      documentNumber: f.documentNumber,
      firstName: f.firstName,
      lastName: f.lastName,
      birthDate: f.birthDate,
    };
    if (f.middleName) payload.middleName = f.middleName;
    if (f.secondLastName) payload.secondLastName = f.secondLastName;
    if (f.sexAtBirth) payload.sexAtBirth = f.sexAtBirth;
    if (f.genderIdentity) payload.genderIdentity = f.genderIdentity;
    if (f.sexualOrientation) payload.sexualOrientation = f.sexualOrientation;
    if (f.maritalStatus) payload.maritalStatus = f.maritalStatus;
    if (f.address) payload.address = f.address;
    if (f.city) payload.city = f.city;
    if (f.department) payload.department = f.department;
    if (f.phone) payload.phone = f.phone;
    if (f.email && f.email.includes('@')) payload.email = f.email;
    if (f.eps) payload.eps = f.eps;
    if (f.regime) payload.regime = f.regime;
    if (f.affiliationNumber) payload.affiliationNumber = f.affiliationNumber;
    if (f.occupation) payload.occupation = f.occupation;
    if (f.educationLevel) payload.educationLevel = f.educationLevel;
    if (f.emergencyContactName) payload.emergencyContactName = f.emergencyContactName;
    if (f.emergencyContactPhone) payload.emergencyContactPhone = f.emergencyContactPhone;
    if (f.emergencyRelationship) payload.emergencyRelationship = f.emergencyRelationship;

    this.api.updatePatient(id, payload).subscribe({
      error: (err) =>
        this.error.set(
          err?.error?.message ||
            'La HCE se guardó, pero no se pudieron actualizar los datos del paciente.',
        ),
    });
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
    this.message.set('Listo para una nueva atención. Seleccione paciente y abra atención.');
  }

  goHome() {
    this.auth.goToWebsite();
  }

  logout() {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
