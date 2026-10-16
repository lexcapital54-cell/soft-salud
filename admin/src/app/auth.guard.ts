import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, catchError, of } from 'rxjs';
import { AuthService } from './auth.service';
import { ClinicalAccessService } from './clinical/clinical-access.service';
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
  if (auth.isCommercial()) {
    return router.parseUrl('/admin/demos');
  }
  if (auth.isClinicStaff()) {
    window.location.replace(`/consultorio.html?_=${Date.now()}`);
    return false;
  }
  return goAdminLogin();
};

/** Consultorios demo: HABILISALUD los gestiona y el equipo comercial solo los consulta. */
export const demosGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.isSuperAdmin() || auth.isCommercial()) return true;
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
 * Asistente administrativo: solo agenda y recibos; bloquea pacientes, HCE, config, docs, etc.
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

/**
 * ABAC: profesional con plan HOURLY_RENTAL solo entra a HCE/pacientes
 * si tiene reserva activa (más margen de gracia). Mensualidad fija no se restringe.
 */
export const clinicalMembershipGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const access = inject(ClinicalAccessService);
  const router = inject(Router);
  const user = auth.user();
  if (!user) return goClinicLogin();
  const clinicalWriter = user.role === 'HEALTH_PROFESSIONAL' || user.role === 'ADMIN';
  if (!clinicalWriter || user.membershipType !== 'HOURLY_RENTAL') {
    return true;
  }
  return access.check().pipe(
    map((r) => {
      if (r.hasAccess) return true;
      return router.createUrlTree(['/consultorio/acceso-clinico'], {
        queryParams: { reason: r.reason, returnUrl: state.url },
      });
    }),
    catchError(() =>
      of(
        router.createUrlTree(['/consultorio/acceso-clinico'], {
          queryParams: { returnUrl: state.url },
        }),
      ),
    ),
  );
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

/** Operación y Finanzas del consultorio: solo el admin y si el superadmin activó el módulo. */
export const clinicFinanceGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isClinicAdmin() && auth.user()?.financeEnabled) {
    return true;
  }
  if (auth.isSuperAdmin()) {
    return router.createUrlTree(['/admin/finanzas']);
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
