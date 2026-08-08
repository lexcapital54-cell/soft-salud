import { Routes } from '@angular/router';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import { authGuard, clinicAdminGuard, guestGuard, superAdminGuard } from './auth.guard';
import { ClinicalHistory } from './clinical/clinical-history';
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
    canActivate: [authGuard, clinicAdminGuard],
  },
  {
    path: 'consultorio/historia-clinica',
    component: ClinicalHistory,
    canActivate: [authGuard, clinicAdminGuard],
  },
  {
    path: 'consultorio/documentos',
    component: DocumentsPlaceholder,
    canActivate: [authGuard, clinicAdminGuard],
  },
  { path: '**', redirectTo: 'login' },
];
