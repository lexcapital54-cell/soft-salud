import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgendaApiService } from './agenda-api.service';
import { PatientOption } from './agenda.models';
import { ClinicalApiService } from '../clinical/clinical-api.service';
import { DivipolaDepartment, Patient } from '../clinical/clinical.models';
import { DOCUMENT_TYPES } from '../clinical/document-types';
import {
  NO_OTHER_SPECIALTY,
  OTHER_SPECIALTY_OPTIONS,
  PatientExtras,
  STRATUM_OPTIONS,
  ageFromBirthDate,
  toggleOtherSpecialty,
} from '../clinical/patient-extras';

const DEFAULT_DEPARTMENT = 'Caldas';
const DEFAULT_CITY = 'Manizales';
const MINOR_DOCUMENT_TYPES = new Set(['TI', 'RC', 'CN', 'MS']);

interface IntakeForm {
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  birthDate: string;
  sexAtBirth: string;
  profession: string;
  maritalStatus: string;
  department: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  eps: string;
  regime: string;
}

function emptyForm(): IntakeForm {
  return {
    firstName: '',
    lastName: '',
    documentType: 'CC',
    documentNumber: '',
    birthDate: '',
    sexAtBirth: '',
    profession: '',
    maritalStatus: '',
    department: DEFAULT_DEPARTMENT,
    city: DEFAULT_CITY,
    address: '',
    phone: '',
    email: '',
    eps: '',
    regime: '',
  };
}

/** Registro completo del paciente al agendar (solo consultorios de psicología). */
@Component({
  selector: 'app-psych-intake-dialog',
  imports: [FormsModule],
  templateUrl: './psych-intake-dialog.html',
  styleUrl: './psych-intake-dialog.scss',
})
export class PsychIntakeDialog implements OnInit {
  private readonly agenda = inject(AgendaApiService);
  private readonly clinical = inject(ClinicalApiService);

  readonly created = output<PatientOption>();
  readonly closed = output<void>();

  readonly documentTypes = DOCUMENT_TYPES;
  readonly specialtyOptions = OTHER_SPECIALTY_OPTIONS;
  readonly noOtherSpecialty = NO_OTHER_SPECIALTY;
  readonly stratumOptions = STRATUM_OPTIONS;

  readonly departments = signal<DivipolaDepartment[]>([]);
  readonly saving = signal(false);
  readonly error = signal('');
  /** Recalcula edad y estado civil al cambiar fecha o documento. */
  private readonly version = signal(0);

  form: IntakeForm = emptyForm();
  extras: PatientExtras = { otherSpecialtyCare: [] };

  readonly age = computed(() => {
    this.version();
    return ageFromBirthDate(this.form.birthDate);
  });

  readonly isMinor = computed(() => {
    this.version();
    const age = ageFromBirthDate(this.form.birthDate);
    return MINOR_DOCUMENT_TYPES.has(this.form.documentType) || (age !== null && age < 18);
  });

  ngOnInit() {
    this.clinical.divipola().subscribe({
      next: (rows) => this.departments.set(rows),
      error: () => undefined,
    });
  }

  touch() {
    this.version.update((v) => v + 1);
  }

  municipalityOptions() {
    return this.departments().find((d) => d.name === this.form.department)?.municipalities ?? [];
  }

  onDepartmentChange() {
    const options = this.municipalityOptions();
    if (!options.some((m) => m.name === this.form.city)) {
      this.form.city = options[0]?.name ?? '';
    }
  }

  hasSpecialty(option: string) {
    return (this.extras.otherSpecialtyCare ?? []).includes(option);
  }

  toggleSpecialty(option: string) {
    this.extras.otherSpecialtyCare = toggleOtherSpecialty(this.extras.otherSpecialtyCare, option);
  }

  showSpecialtyDetail() {
    const list = this.extras.otherSpecialtyCare ?? [];
    return list.length > 0 && !list.includes(NO_OTHER_SPECIALTY);
  }

  close() {
    if (!this.saving()) this.closed.emit();
  }

  save() {
    const f = this.form;
    if (!f.firstName.trim() || !f.lastName.trim()) {
      this.error.set('Nombres y apellidos son obligatorios.');
      return;
    }
    if (!f.documentType || f.documentNumber.trim().length < 3) {
      this.error.set('Tipo y número de documento son obligatorios.');
      return;
    }
    if (f.phone.trim() && f.phone.replace(/\D/g, '').length < 7) {
      this.error.set('El celular debe tener al menos 7 dígitos.');
      return;
    }
    if (f.email.trim() && !f.email.includes('@')) {
      this.error.set('Revise el correo electrónico.');
      return;
    }

    const payload: Partial<Patient> = {};
    for (const [key, value] of Object.entries(f) as [keyof IntakeForm, string][]) {
      const v = value.trim();
      if (v) (payload as Record<string, unknown>)[key] = v;
    }
    if (this.isMinor()) delete payload.maritalStatus;
    const municipality = this.municipalityOptions().find((m) => m.name === f.city);
    if (municipality) payload.municipalityCode = municipality.code;

    const extras: PatientExtras = {};
    for (const key of [
      'birthPlace',
      'neighborhood',
      'stratum',
      'religion',
      'currentMedications',
    ] as const) {
      const v = this.extras[key]?.trim();
      if (v) extras[key] = v;
    }
    const care = this.extras.otherSpecialtyCare ?? [];
    if (care.length) extras.otherSpecialtyCare = care;
    const detail = this.extras.otherSpecialtyDetail?.trim();
    if (detail && this.showSpecialtyDetail()) extras.otherSpecialtyDetail = detail;
    if (Object.keys(extras).length) payload.extras = extras;

    this.saving.set(true);
    this.error.set('');
    this.agenda.intakePatient(payload).subscribe({
      next: (patient) => {
        this.saving.set(false);
        this.created.emit(patient);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(
          Array.isArray(msg) ? msg.join(' ') : msg || 'No se pudo registrar el paciente.',
        );
      },
    });
  }
}
