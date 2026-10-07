import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API } from '../api.config';
import { AttendancePatientHit } from './attendance-control.models';
import { PsychReportData, PsychReportDraft, PsychReportListItem, PsychReportSaved } from './psych-report.models';

@Injectable({ providedIn: 'root' })
export class PsychReportApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API}/psych/reports`;

  list(patientId?: string | null) {
    return this.http.get<PsychReportListItem[]>(this.base, { params: patientId ? { patientId } : {} });
  }

  get(id: string) {
    return this.http.get<PsychReportSaved>(`${this.base}/${id}`);
  }

  signature(id: string) {
    return this.http.get(`${this.base}/${id}/signature`, { responseType: 'blob' });
  }

  blank() {
    return this.http.get<PsychReportDraft>(`${this.base}/blank`);
  }

  prefill(patientId: string) {
    return this.http.get<PsychReportDraft>(`${this.base}/prefill`, { params: { patientId } });
  }

  searchPatients(q: string) {
    return this.http.get<AttendancePatientHit[]>(`${this.base}/patients`, { params: { q } });
  }

  mySignature() {
    return this.http.get<{ dataUrl: string | null }>(`${this.base}/my-signature`);
  }

  /** Los datos van como JSON en `payload`; la firma (si hay) como archivo aparte. */
  save(id: string | null, body: PsychReportDraft & { removeSignature?: boolean }, signature: Blob | null) {
    const form = new FormData();
    form.append('payload', JSON.stringify(body));
    if (signature) form.append('signature', signature, signature.type === 'image/jpeg' ? 'firma.jpg' : 'firma.png');
    return this.http.post<PsychReportSaved>(id ? `${this.base}/${id}/update` : this.base, form);
  }

  pdf(data: PsychReportData, signature: Blob | null, withoutSignature = false) {
    const form = new FormData();
    form.append('payload', JSON.stringify({ data, withoutSignature }));
    if (signature) form.append('signature', signature, signature.type === 'image/jpeg' ? 'firma.jpg' : 'firma.png');
    return this.http.post(`${this.base}/pdf`, form, { responseType: 'blob' });
  }
}
