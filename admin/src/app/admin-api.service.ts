import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Clinic, ClinicAdmin, ClinicSpecialty, DashboardType } from './models';
import { API } from './api.config';

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  constructor(private readonly http: HttpClient) {}

  listClinics() {
    return this.http.get<Clinic[]>(`${API}/clinics`);
  }

  createClinic(payload: {
    name: string;
    specialty: ClinicSpecialty;
    address?: string;
    phone?: string;
    admin?: { fullName: string; email: string; password: string };
  }) {
    return this.http.post<Clinic>(`${API}/clinics`, payload);
  }

  createClinicDashboard(clinicId: string, dashboardType: DashboardType) {
    return this.http.post<Clinic>(`${API}/clinics/${clinicId}/dashboard`, { dashboardType });
  }

  updateClinicDashboard(clinicId: string, dashboardType: DashboardType) {
    return this.http.post<Clinic>(`${API}/clinics/${clinicId}/dashboard`, { dashboardType });
  }

  listClinicAdmins() {
    return this.http.get<ClinicAdmin[]>(`${API}/users`);
  }

  createClinicAdmin(payload: {
    clinicId: string;
    fullName: string;
    email: string;
    password: string;
  }) {
    return this.http.post<ClinicAdmin>(`${API}/users/clinic-admins`, payload);
  }
}
