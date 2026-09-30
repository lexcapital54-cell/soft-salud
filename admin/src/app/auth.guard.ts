import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { UserRole } from './models';

function goAdminLogin(): false {
  window.location.replace(`/login-admin.html?_=${Date.now()}`);
  return false;
}

function goClinicLogin(): false {
  window.location.replace(`/login-profesional.html?_=${Date.now()}`);
  return false;
}

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.isLoggedIn()) {
    return true;
  }
  return goAdminLogin();
};

export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isSuperAdmin()) {
    return true;
  }
  if (auth.isClinicStaff()) {
    window.location.replace(`/consultorio.html?_=${Date.now()}`);
    return false;
  }
  return goAdminLogin();
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
  return goClinicLogin();
};

/**
 * Secretaría solo agenda: bloquea pacientes, HCE, config, docs, etc.
 * Redirige a /consultorio/agenda.
 */
export const agendaOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isReceptionist()) {
    return router.createUrlTree(['/consultorio/agenda']);
  }
  return true;
};

/** Escritura clínica HCE / recetas / multimedia */
export const clinicalWriteGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.canWriteClinical()) {
    return true;
  }
  if (auth.isClinicStaff()) {
    window.location.replace(`/consultorio.html?_=${Date.now()}`);
    return false;
  }
  if (auth.isSuperAdmin()) {
    return router.createUrlTree(['/admin']);
  }
  return goClinicLogin();
};

/** Auditoría SIVIGILA */
export const auditorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.canAuditSivigila()) {
    return true;
  }
  if (auth.isClinicStaff()) {
    window.location.replace(`/consultorio.html?_=${Date.now()}`);
    return false;
  }
  return goClinicLogin();
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
    window.location.replace(`/consultorio.html?_=${Date.now()}`);
    return false;
  }
  return goClinicLogin();
};

/** @deprecated usar clinicStaffGuard */
export const clinicAdminGuard = clinicStaffGuard;

export const guestGuard: CanActivateFn = () => {
  // /login de Angular ya no se usa: consultorio → HTML profesional; admin → login-admin.html
  window.location.replace(`/login-profesional.html?_=${Date.now()}`);
  return false;
};

export const CLINIC_STAFF_ROLES: UserRole[] = [
  'ADMIN',
  'HEALTH_PROFESSIONAL',
  'RECEPTIONIST',
  'AUDITOR',
  'AUXILIAR',
];
