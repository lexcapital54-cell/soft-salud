import { Routes } from '@angular/router';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import { authGuard, clinicAdminGuard, guestGuard, superAdminGuard } from './auth.guard';
import { ClinicHome } from './clinic-home/clinic-home';
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
  { path: '**', redirectTo: 'login' },
];
