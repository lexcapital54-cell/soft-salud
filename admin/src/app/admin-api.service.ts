import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Clinic, ClinicAdmin, ClinicSpecialty, DashboardType, UserRole } from './models';
import { API } from './api.config';

export interface StaffUser extends ClinicAdmin {
  professionalCard?: string | null;
  createdAt?: string;
  /** Última contraseña asignada por el superadmin (solo panel admin). */
  currentPassword?: string | null;
}

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
    admin?: {
      fullName: string;
      email: string;
      password: string;
      professionalCard?: string;
    };
  }) {
    return this.http.post<Clinic>(`${API}/clinics`, payload);
  }

  createClinicDashboard(clinicId: string, dashboardType: DashboardType) {
    return this.http.post<Clinic>(`${API}/clinics/${clinicId}/dashboard`, { dashboardType });
  }

  updateClinicDashboard(clinicId: string, dashboardType: DashboardType) {
    return this.http.post<Clinic>(`${API}/clinics/${clinicId}/dashboard`, { dashboardType });
  }

  clinicDeletionCheck(clinicId: string) {
    return this.http.get<{
      id: string;
      name: string;
      canDelete: boolean;
      blockers: string[];
      users: number;
    }>(`${API}/clinics/${clinicId}/deletion-check`);
  }

  deleteClinic(clinicId: string, confirmName: string, confirmPin: string) {
    return this.http.post<{
      deleted: boolean;
      name: string;
      usersDeleted: number;
      usersDeactivated: string[];
    }>(`${API}/clinics/${clinicId}/delete`, { confirmName, confirmPin });
  }

  updateClinic(clinicId: string, payload: { address?: string; phone?: string; nit?: string; habilitationCode?: string }) {
    return this.http.post<Clinic>(`${API}/clinics/${clinicId}/update`, payload);
  }

  setClinicActive(clinicId: string, isActive: boolean) {
    return this.http.post<Clinic>(`${API}/clinics/${clinicId}/update`, { isActive });
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

  listStaffUsers(opts?: { clinicId?: string; role?: UserRole }) {
    let params = new HttpParams();
    if (opts?.clinicId) params = params.set('clinicId', opts.clinicId);
    if (opts?.role) params = params.set('role', opts.role);
    return this.http.get<StaffUser[]>(`${API}/users/staff`, { params });
  }

  resetUserPassword(userId: string, password: string) {
    return this.http.post<{
      id: string;
      email: string;
      fullName: string;
      previousPassword: string | null;
      currentPassword: string;
      message: string;
    }>(`${API}/users/${userId}/reset-password`, { password });
  }
}
