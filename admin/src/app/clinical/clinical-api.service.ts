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
  HceExportItem,
  OpenEncounterItem,
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
    let params = new HttpParams().set('q', q);
    return this.http.get<CatalogCode[]>(`${API}/catalogs/cie`, { params });
  }

  searchCups(q: string) {
    let params = new HttpParams().set('q', q);
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

  uploadPatientPhoto(patientId: string, file: File) {
    const form = new FormData();
    form.append('file', file, file.name || 'paciente.jpg');
    return this.http.post<Patient>(`${API}/patients/${patientId}/photo`, form);
  }

  downloadPatientPhoto(patientId: string) {
    return this.http.get(`${API}/patients/${patientId}/photo`, {
      responseType: 'blob',
    });
  }

  deletePatientPhoto(patientId: string) {
    return this.http.delete<Patient>(`${API}/patients/${patientId}/photo`);
  }

  listEncounters(opts: { from?: string; to?: string; patientId?: string } = {}) {
    let params = new HttpParams();
    if (opts.from) params = params.set('from', opts.from);
    if (opts.to) params = params.set('to', opts.to);
    if (opts.patientId) params = params.set('patientId', opts.patientId);
    return this.http.get<EncounterListItem[]>(`${API}/encounters`, { params });
  }

  /** Historias clínicas en borrador sin cerrar (alertas). */
  listOpenEncounters() {
    return this.http.get<OpenEncounterItem[]>(`${API}/encounters/open`);
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

  createEncounter(patientId: string, modality?: string) {
    return this.http.post<Encounter>(`${API}/encounters`, {
      patientId,
      ...(modality ? { modality } : {}),
    });
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
      generateRips?: boolean;
      autosave?: boolean;
    },
  ) {
    return this.http.post<Encounter>(`${API}/clinical-records/${encounterId}/save`, payload);
  }

  updateAttendanceMeta(
    encounterId: string,
    body: { modality?: string; documentedAt?: string },
  ) {
    return this.http.post<Encounter>(
      `${API}/clinical-records/${encounterId}/attendance-meta`,
      body,
    );
  }

  updateDiagnoses(encounterId: string, diagnoses: DiagnosisRow[]) {
    return this.http.post<Encounter>(`${API}/clinical-records/${encounterId}/diagnoses`, {
      diagnoses,
    });
  }

  updateProcedures(encounterId: string, procedures: ProcedureRow[]) {
    return this.http.post<Encounter>(`${API}/clinical-records/${encounterId}/procedures`, {
      procedures,
    });
  }

  signClinicalRecord(encounterId: string, signatureBase64?: string) {
    return this.http.post<Encounter>(
      `${API}/clinical-records/${encounterId}/sign`,
      signatureBase64 ? { signatureBase64 } : {},
    );
  }

  addEvolution(
    encounterId: string,
    body: {
      note: string;
      reason?: string;
      currentSituation?: string;
      clinicalAttentionDate?: string;
      signatureBase64?: string;
    },
  ) {
    return this.http.post<Encounter>(`${API}/clinical-records/${encounterId}/evolutions`, body);
  }

  lastCurrentSituation(patientId: string) {
    return this.http.get<{
      currentSituation: string;
      evolutionId: string | null;
      clinicalAttentionDate: string | null;
    }>(`${API}/encounters/for-patient/${patientId}/last-situation`);
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

  getRipsSettings() {
    return this.http.get<{ ripsEnabled: boolean; note?: string }>(
      `${API}/me/rips-settings`,
    );
  }

  saveRipsSettings(ripsEnabled: boolean) {
    return this.http.post<{ ripsEnabled: boolean }>(`${API}/me/rips-settings`, {
      ripsEnabled,
    });
  }

  getRepsSettings() {
    return this.http.get<{
      repsExpirationDate: string | null;
      status: 'MISSING' | 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'OK';
      daysRemaining: number | null;
      alertLevel: 'info' | 'urgent' | 'warn' | 'ok';
      message: string;
      note?: string;
    }>(`${API}/me/reps-settings`);
  }

  saveRepsSettings(repsExpirationDate: string | null) {
    return this.http.post<{
      repsExpirationDate: string | null;
      status: string;
      daysRemaining: number | null;
      alertLevel: string;
      message: string;
    }>(`${API}/me/reps-settings`, { repsExpirationDate });
  }

  /** Simula envío de encuadre terapéutico (políticas) al correo del paciente. */
  sendTherapeuticFrame(patientId: string) {
    return this.http.post<{ sent: boolean; destination?: string }>(
      `${API}/patients/${patientId}/therapeutic-frame`,
      {},
    );
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
    signerRole?: 'PATIENT' | 'LEGAL_GUARDIAN' | 'ASSENT';
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

  /** Atención virtual: genera enlace de firma remota (WhatsApp / copia). */
  sendRemoteConsentInvite(body: {
    patientId: string;
    templateId: string;
    encounterId: string;
    emailOverride?: string;
    phoneOverride?: string;
  }) {
    return this.http.post<{
      id: string;
      link: string;
      whatsappUrl: string;
      sentToPhone: string;
      sentToEmail: string | null;
      expiresAt: string;
      emailSimulated: boolean | null;
      message: string;
    }>(`${API}/patient-consents/remote-invite`, body);
  }

  getRemoteConsentInviteStatus(inviteId: string) {
    return this.http.get<{
      id: string;
      status: string;
      expiresAt: string;
      usedAt: string | null;
      sentToPhone: string | null;
      patientConsentId: string | null;
      signatureBase64: string | null;
      signedAt: string | null;
    }>(`${API}/patient-consents/remote-invite/${inviteId}`);
  }

  searchHceExports(q?: string) {
    let params = new HttpParams();
    if (q) params = params.set('q', q);
    return this.http.get<HceExportItem[]>(`${API}/clinical-exports`, { params });
  }

  downloadHcePdf(encounterId: string) {
    return this.http.get(`${API}/clinical-exports/${encounterId}/pdf`, {
      responseType: 'blob',
    });
  }

  downloadHceBulkZip(q?: string) {
    let params = new HttpParams();
    if (q) params = params.set('q', q);
    return this.http.get(`${API}/clinical-exports/bulk/zip`, {
      params,
      responseType: 'blob',
    });
  }
}
