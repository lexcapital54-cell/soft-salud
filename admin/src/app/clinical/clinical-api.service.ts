import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
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

const API = 'http://localhost:3000/api';

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

  listPatients(q?: string) {
    let params = new HttpParams();
    if (q) params = params.set('q', q);
    return this.http.get<Patient[]>(`${API}/patients`, { params });
  }

  createPatient(body: Partial<Patient>) {
    return this.http.post<Patient>(`${API}/patients`, body);
  }

  updatePatient(id: string, body: Partial<Patient>) {
    return this.http.patch<Patient>(`${API}/patients/${id}`, body);
  }

  listEncounters() {
    return this.http.get<EncounterListItem[]>(`${API}/encounters`);
  }

  getEncounter(id: string) {
    return this.http.get<Encounter>(`${API}/encounters/${id}`);
  }

  createEncounter(patientId: string) {
    return this.http.post<Encounter>(`${API}/encounters`, { patientId });
  }

  saveDraft(
    encounterId: string,
    payload: {
      content: ClinicalContent;
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
    return this.http.put<Encounter>(`${API}/clinical-records/${encounterId}`, payload);
  }
}
