import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

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
  if (auth.isClinicAdmin()) {
    return router.createUrlTree(['/consultorio']);
  }
  return router.createUrlTree(['/login'], { queryParams: { tipo: 'admin' } });
};

export const clinicAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isClinicAdmin()) {
    return true;
  }
  if (auth.isSuperAdmin()) {
    return router.createUrlTree(['/admin']);
  }
  return router.createUrlTree(['/login'], { queryParams: { tipo: 'profesional' } });
};

export const guestGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const tipo = route.queryParamMap.get('tipo');

  // Entrada explícita desde la web: siempre pedir credenciales frescas
  if (tipo === 'profesional' || tipo === 'admin') {
    auth.logout();
    return true;
  }

  if (!auth.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree([auth.isSuperAdmin() ? '/admin' : '/consultorio']);
};
