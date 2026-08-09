import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
  CatalogCode,
  ClinicalAttachment,
  ClinicalContent,
  ConsentRow,
  DiagnosisRow,
  DivipolaDepartment,
  Encounter,
  EncounterListItem,
  Incapacity,
  Patient,
  ProcedureRow,
  ProfessionalSignature,
  SivigilaCaseRow,
  SivigilaSummary,
} from './clinical.models';
import { ConsentTemplate, PatientConsentRecord } from './consent.models';
import { API } from '../api.config';

@Injectable({ providedIn: 'root' })
export class ClinicalApiService {
  constructor(private readonly http: HttpClient) {}

  searchCie(q: string) {
    const params = new HttpParams().set('q', q);
    return this.http.get<CatalogCode[]>(`${API}/catalogs/cie`, { params });
  }

  searchCups(q: string) {
    const params = new HttpParams().set('q', q);
    return this.http.get<CatalogCode[]>(`${API}/catalogs/cups`, { params });
  }

  /** `from`/`to` (YYYY-MM-DD) filtran por fecha de registro, no por nombre. */
  listPatients(opts: { q?: string; from?: string; to?: string } = {}) {
    let params = new HttpParams();
    if (opts.q) params = params.set('q', opts.q);
    if (opts.from) params = params.set('from', opts.from);
    if (opts.to) params = params.set('to', opts.to);
    return this.http.get<Patient[]>(`${API}/patients`, { params });
  }

  getPatient(id: string) {
    return this.http.get<Patient>(`${API}/patients/${id}`);
  }

  createPatient(body: Partial<Patient>) {
    return this.http.post<Patient>(`${API}/patients`, body);
  }

  updatePatient(id: string, body: Partial<Patient>) {
    return this.http.post<Patient>(`${API}/patients/${id}/update`, body);
  }

  listEncounters(opts: { from?: string; to?: string; patientId?: string } = {}) {
    let params = new HttpParams();
    if (opts.from) params = params.set('from', opts.from);
    if (opts.to) params = params.set('to', opts.to);
    if (opts.patientId) params = params.set('patientId', opts.patientId);
    return this.http.get<EncounterListItem[]>(`${API}/encounters`, { params });
  }

  quickCreatePatient(body: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    documentType?: string;
    documentNumber?: string;
  }) {
    return this.http.post<Patient>(`${API}/patients/quick`, body);
  }

  /** Departamentos y municipios de Colombia para los selectores de residencia. */
  divipola() {
    return this.http.get<DivipolaDepartment[]>(`${API}/catalogs/divipola`);
  }

  getEncounter(id: string) {
    return this.http.get<Encounter>(`${API}/encounters/${id}`);
  }

  /** Historia única del paciente; `null` si aún no tiene ninguna abierta. */
  encounterForPatient(patientId: string) {
    return this.http.get<Encounter | null>(`${API}/encounters/for-patient/${patientId}`);
  }

  createEncounter(patientId: string) {
    return this.http.post<Encounter>(`${API}/encounters`, { patientId });
  }

  saveDraft(
    encounterId: string,
    payload: {
      content: ClinicalContent;
      noteFormat?: string;
      diagnoses: DiagnosisRow[];
      procedures: ProcedureRow[];
      consents: ConsentRow[];
      modality?: string;
      serviceType?: string | null;
      location?: string | null;
      purpose?: string | null;
      externalCause?: string | null;
    },
  ) {
    return this.http.post<Encounter>(`${API}/clinical-records/${encounterId}/save`, payload);
  }

  signClinicalRecord(encounterId: string, signatureBase64?: string) {
    return this.http.post<Encounter>(
      `${API}/clinical-records/${encounterId}/sign`,
      signatureBase64 ? { signatureBase64 } : {},
    );
  }

  addEvolution(
    encounterId: string,
    body: { note: string; reason?: string; signatureBase64?: string },
  ) {
    return this.http.post<Encounter>(`${API}/clinical-records/${encounterId}/evolutions`, body);
  }

  getMySignature() {
    return this.http.get<ProfessionalSignature>(`${API}/me/professional-signature`);
  }

  saveMySignature(signatureBase64: string) {
    return this.http.post<ProfessionalSignature>(`${API}/me/professional-signature`, {
      signatureBase64,
    });
  }

  deleteMySignature() {
    return this.http.delete<ProfessionalSignature>(`${API}/me/professional-signature`);
  }

  listIncapacities(encounterId: string) {
    const params = new HttpParams().set('encounterId', encounterId);
    return this.http.get<Incapacity[]>(`${API}/incapacities`, { params });
  }

  createIncapacity(body: {
    encounterId: string;
    startDate: string;
    endDate: string;
    days: number;
    diagnosisCie?: string;
    cause?: string;
    observations?: string;
  }) {
    return this.http.post<Incapacity>(`${API}/incapacities`, body);
  }

  signIncapacity(id: string, signatureBase64?: string) {
    return this.http.post<Incapacity>(
      `${API}/incapacities/${id}/sign`,
      signatureBase64 ? { signatureBase64 } : {},
    );
  }

  listAttachments(encounterId: string) {
    const params = new HttpParams().set('encounterId', encounterId);
    return this.http.get<ClinicalAttachment[]>(`${API}/clinical-attachments`, {
      params,
    });
  }

  uploadAttachment(form: FormData) {
    return this.http.post<ClinicalAttachment>(`${API}/clinical-attachments`, form);
  }

  downloadAttachment(id: string) {
    return this.http.get(`${API}/clinical-attachments/${id}/download`, {
      responseType: 'blob',
    });
  }

  deleteAttachment(id: string) {
    return this.http.delete<{ ok: boolean }>(`${API}/clinical-attachments/${id}`);
  }

  sivigilaCases(opts: { from?: string; to?: string; cieCode?: string }) {
    let params = new HttpParams();
    if (opts.from) params = params.set('from', opts.from);
    if (opts.to) params = params.set('to', opts.to);
    if (opts.cieCode) params = params.set('cieCode', opts.cieCode);
    return this.http.get<{ total: number; items: SivigilaCaseRow[] }>(
      `${API}/audit/sivigila/cases`,
      { params },
    );
  }

  sivigilaSummary(opts: { from?: string; to?: string }) {
    let params = new HttpParams();
    if (opts.from) params = params.set('from', opts.from);
    if (opts.to) params = params.set('to', opts.to);
    return this.http.get<SivigilaSummary>(`${API}/audit/sivigila/summary`, {
      params,
    });
  }

  sivigilaExportCsv(opts: { from?: string; to?: string; cieCode?: string }) {
    let params = new HttpParams();
    if (opts.from) params = params.set('from', opts.from);
    if (opts.to) params = params.set('to', opts.to);
    if (opts.cieCode) params = params.set('cieCode', opts.cieCode);
    return this.http.get(`${API}/audit/sivigila/export.csv`, {
      params,
      responseType: 'blob',
    });
  }

  sivigilaExportExcel(opts: { from?: string; to?: string; cieCode?: string }) {
    let params = new HttpParams();
    if (opts.from) params = params.set('from', opts.from);
    if (opts.to) params = params.set('to', opts.to);
    if (opts.cieCode) params = params.set('cieCode', opts.cieCode);
    return this.http.get(`${API}/audit/sivigila/export.xlsx`, {
      params,
      responseType: 'blob',
    });
  }

  listConsentTemplates() {
    return this.http.get<ConsentTemplate[]>(`${API}/consent-templates`);
  }

  listPatientConsents(opts: { patientId?: string; encounterId?: string }) {
    let params = new HttpParams();
    if (opts.patientId) params = params.set('patientId', opts.patientId);
    if (opts.encounterId) params = params.set('encounterId', opts.encounterId);
    return this.http.get<PatientConsentRecord[]>(`${API}/patient-consents`, { params });
  }

  signPatientConsent(body: {
    patientId: string;
    templateId: string;
    encounterId?: string;
    signerName?: string;
    signerDocumentType?: string;
    signerDocument?: string;
    signatureBase64: string;
    professionalSignatureBase64?: string;
  }) {
    return this.http.post<PatientConsentRecord>(`${API}/patient-consents`, body);
  }

  downloadPatientConsentPdf(id: string) {
    return this.http.get(`${API}/patient-consents/${id}/pdf`, {
      responseType: 'blob',
    });
  }
}
