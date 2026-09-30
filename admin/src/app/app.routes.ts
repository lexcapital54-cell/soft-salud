import { Routes } from '@angular/router';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import {
  authGuard,
  auditorGuard,
  agendaOnlyGuard,
  clinicStaffGuard,
  clinicalWriteGuard,
  documentsReadGuard,
  guestGuard,
  superAdminGuard,
} from './auth.guard';
import { TodayAppointmentsDashboard } from './agenda/today-appointments';
import { HceExport } from './clinical/hce-export';
import { PatientsDirectory } from './clinical/patients-directory';
import { SivigilaAudit } from './clinical/sivigila-audit';
import { ClinicHome } from './clinic-home/clinic-home';
import { ClinicSettings } from './clinic-settings/clinic-settings';
import { DocumentsDashboard } from './documents/documents-dashboard';
import { BillingDashboard } from './billing/billing-dashboard';
import { PlatformBillingPage } from './platform-billing/platform-billing';
import { PasswordAdminPage } from './password-admin/password-admin';
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
    path: 'admin/contrasenas',
    component: PasswordAdminPage,
    canActivate: [authGuard, superAdminGuard],
  },
  {
    path: 'admin/documentos',
    component: DocumentsDashboard,
    canActivate: [authGuard, superAdminGuard],
  },
  {
    path: 'admin/ingresos',
    component: PlatformBillingPage,
    canActivate: [authGuard, superAdminGuard],
  },
  // Redirect old users module URL
  { path: 'admin/usuarios', redirectTo: 'admin/contrasenas', pathMatch: 'full' },
  {
    path: 'consultorio',
    component: ClinicHome,
    canActivate: [authGuard, clinicStaffGuard],
  },
  {
    path: 'consultorio/configuracion',
    component: ClinicSettings,
    canActivate: [authGuard, clinicStaffGuard, agendaOnlyGuard],
  },
  {
    path: 'consultorio/agenda',
    component: TodayAppointmentsDashboard,
    canActivate: [authGuard, clinicStaffGuard],
  },
  {
    path: 'consultorio/pacientes',
    component: PatientsDirectory,
    canActivate: [authGuard, clinicStaffGuard, agendaOnlyGuard],
  },
  {
    path: 'consultorio/historia-clinica',
    loadComponent: () => import('./clinical/hce-workspace').then((m) => m.HceWorkspace),
    canActivate: [authGuard, clinicStaffGuard, agendaOnlyGuard],
  },
  {
    path: 'consultorio/historias-pdf',
    component: HceExport,
    canActivate: [authGuard, clinicStaffGuard, agendaOnlyGuard],
  },
  {
    path: 'consultorio/sivigila',
    component: SivigilaAudit,
    canActivate: [authGuard, auditorGuard],
  },
  {
    path: 'consultorio/documentos',
    component: DocumentsDashboard,
    canActivate: [authGuard, documentsReadGuard, agendaOnlyGuard],
  },
  {
    path: 'consultorio/recibos',
    component: BillingDashboard,
    canActivate: [authGuard, clinicStaffGuard, agendaOnlyGuard],
  },
  // Rutas desconocidas: no mandar al login administrativo por defecto.
  { path: '**', redirectTo: 'login', pathMatch: 'full' },
];
