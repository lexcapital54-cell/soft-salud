import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API } from '../api.config';
import {
  AttendanceControlData,
  AttendanceDraft,
  AttendanceListItem,
  AttendancePatientHit,
  AttendanceSaved,
} from './attendance-control.models';

@Injectable({ providedIn: 'root' })
export class AttendanceControlApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API}/psych/attendance-controls`;

  list(patientId?: string | null) {
    return this.http.get<AttendanceListItem[]>(this.base, { params: patientId ? { patientId } : {} });
  }

  get(id: string) {
    return this.http.get<AttendanceSaved>(`${this.base}/${id}`);
  }

  blank() {
    return this.http.get<AttendanceDraft>(`${this.base}/blank`);
  }

  prefill(patientId: string) {
    return this.http.get<AttendanceDraft>(`${this.base}/prefill`, { params: { patientId } });
  }

  searchPatients(q: string) {
    return this.http.get<AttendancePatientHit[]>(`${this.base}/patients`, { params: { q } });
  }

  create(body: AttendanceDraft) {
    return this.http.post<AttendanceSaved>(this.base, body);
  }

  update(id: string, body: AttendanceDraft) {
    return this.http.post<AttendanceSaved>(`${this.base}/${id}/update`, body);
  }

  pdf(data: AttendanceControlData) {
    return this.http.post(`${this.base}/pdf`, { data }, { responseType: 'blob' });
  }

  logoStatus() {
    return this.http.get<{ clinicId: string; updatedAt: string | null; own: boolean }>(`${this.base}/logo`);
  }

  uploadLogo(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ clinicId: string; updatedAt: string | null; own: boolean }>(`${this.base}/logo`, form);
  }

  removeLogo() {
    return this.http.delete<{ clinicId: string; updatedAt: string | null; own: boolean }>(`${this.base}/logo`);
  }
}
