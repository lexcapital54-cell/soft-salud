import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { UserRole } from './models';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) {
    return true;
  }
  return router.createUrlTree(['/login'], { queryParams: { tipo: 'admin' } });
};

export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isSuperAdmin()) {
    return true;
  }
  if (auth.isClinicStaff()) {
    return router.createUrlTree(['/consultorio']);
  }
  return router.createUrlTree(['/login'], { queryParams: { tipo: 'admin' } });
};

/** Acceso al consultorio: admin, profesional, recepción, auditor */
export const clinicStaffGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isClinicStaff()) {
    return true;
  }
  if (auth.isSuperAdmin()) {
    return router.createUrlTree(['/admin']);
  }
  return router.createUrlTree(['/login'], { queryParams: { tipo: 'profesional' } });
};

/** Escritura clínica HCE / recetas / multimedia */
export const clinicalWriteGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.canWriteClinical()) {
    return true;
  }
  if (auth.isClinicStaff()) {
    return router.createUrlTree(['/consultorio']);
  }
  if (auth.isSuperAdmin()) {
    return router.createUrlTree(['/admin']);
  }
  return router.createUrlTree(['/login'], { queryParams: { tipo: 'profesional' } });
};

/** Auditoría SIVIGILA */
export const auditorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.canAuditSivigila()) {
    return true;
  }
  if (auth.isClinicStaff()) {
    return router.createUrlTree(['/consultorio']);
  }
  return router.createUrlTree(['/login'], { queryParams: { tipo: 'profesional' } });
};

/** Lectura del expediente documental (consultorio). Escritura = solo /admin/documentos. */
export const documentsReadGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.canWriteClinical() || auth.canAuditSivigila()) {
    return true;
  }
  if (auth.isSuperAdmin()) {
    return router.createUrlTree(['/admin']);
  }
  if (auth.isClinicStaff()) {
    return router.createUrlTree(['/consultorio']);
  }
  return router.createUrlTree(['/login'], { queryParams: { tipo: 'profesional' } });
};

/** @deprecated usar clinicStaffGuard */
export const clinicAdminGuard = clinicStaffGuard;

export const guestGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const tipo = route.queryParamMap.get('tipo');

  if (tipo === 'profesional' || tipo === 'admin') {
    auth.logout();
    return true;
  }

  if (!auth.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree([auth.isSuperAdmin() ? '/admin' : '/consultorio']);
};

export const CLINIC_STAFF_ROLES: UserRole[] = [
  'ADMIN',
  'HEALTH_PROFESSIONAL',
  'RECEPTIONIST',
  'AUDITOR',
];
