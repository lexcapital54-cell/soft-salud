import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { API } from '../api.config';
import { AuthService } from '../auth.service';
import { AccessCheckResult } from '../types/auth-access';

@Injectable({ providedIn: 'root' })
export class ClinicalAccessService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private inflight: Observable<AccessCheckResult> | null = null;

  /** Consulta el estado de acceso a HCE (con caché breve por navegación). */
  check(force = false): Observable<AccessCheckResult> {
    const user = this.auth.user();
    const clinicalWriter =
      !!user && (user.role === 'HEALTH_PROFESSIONAL' || user.role === 'ADMIN');
    if (!user || !clinicalWriter || user.membershipType !== 'HOURLY_RENTAL') {
      return of({
        hasAccess: true,
        reason: clinicalWriter ? 'MONTHLY_UNRESTRICTED' : 'ROLE_EXEMPT',
        membershipType: user?.membershipType ?? 'MONTHLY_FIXED',
        gracePeriodMinutes: 45,
        message: 'Acceso permitido.',
      });
    }
    if (!force && this.inflight) return this.inflight;
    this.inflight = this.http.get<AccessCheckResult>(`${API}/clinical-access/check`).pipe(
      catchError(() =>
        of({
          hasAccess: false,
          reason: 'NO_ACTIVE_BOOKING' as const,
          membershipType: 'HOURLY_RENTAL' as const,
          gracePeriodMinutes: 45,
          message:
            'No se pudo verificar su reserva. Intente de nuevo o confirme un bloque de horas.',
        }),
      ),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    // Caduca la caché al cambiar de ruta / unos segundos después.
    setTimeout(() => {
      this.inflight = null;
    }, 15_000);
    return this.inflight;
  }

  clearCache() {
    this.inflight = null;
  }
}
