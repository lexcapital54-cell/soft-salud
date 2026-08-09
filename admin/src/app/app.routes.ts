import { Routes } from '@angular/router';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import {
  authGuard,
  auditorGuard,
  clinicStaffGuard,
  clinicalWriteGuard,
  guestGuard,
  superAdminGuard,
} from './auth.guard';
import { TodayAppointmentsDashboard } from './agenda/today-appointments';
import { ClinicalHistory } from './clinical/clinical-history';
import { PatientsDirectory } from './clinical/patients-directory';
import { SivigilaAudit } from './clinical/sivigila-audit';
import { ClinicHome } from './clinic-home/clinic-home';
import { DocumentsPlaceholder } from './documents/documents-placeholder';
import { Login } from './login/login';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  {
    path: 'admin',
    component: AdminDashboard,
    canActivate: [authGuard, superAdminGuard],
  },
  {
    path: 'consultorio',
    component: ClinicHome,
    canActivate: [authGuard, clinicStaffGuard],
  },
  {
    path: 'consultorio/agenda',
    component: TodayAppointmentsDashboard,
    canActivate: [authGuard, clinicStaffGuard],
  },
  {
    path: 'consultorio/pacientes',
    component: PatientsDirectory,
    canActivate: [authGuard, clinicStaffGuard],
  },
  {
    path: 'consultorio/historia-clinica',
    component: ClinicalHistory,
    canActivate: [authGuard, clinicStaffGuard],
  },
  {
    path: 'consultorio/sivigila',
    component: SivigilaAudit,
    canActivate: [authGuard, auditorGuard],
  },
  {
    path: 'consultorio/documentos',
    component: DocumentsPlaceholder,
    canActivate: [authGuard, clinicalWriteGuard],
  },
  { path: '**', redirectTo: 'login' },
];
