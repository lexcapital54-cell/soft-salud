import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { tap } from 'rxjs';
import { AuthUser } from './models';
import { API } from './api.config';

const TOKEN_KEY = 'habilisalud_token';
const USER_KEY = 'habilisalud_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSignal = signal<AuthUser | null>(this.readStoredUser());

  readonly user = this.userSignal.asReadonly();
  readonly isLoggedIn = computed(() => !!this.userSignal());
  readonly isSuperAdmin = computed(() => this.userSignal()?.role === 'SUPER_ADMIN');
  readonly isClinicAdmin = computed(() => this.userSignal()?.role === 'ADMIN');
  readonly isClinicStaff = computed(() => {
    const role = this.userSignal()?.role;
    return (
      role === 'ADMIN' ||
      role === 'HEALTH_PROFESSIONAL' ||
      role === 'RECEPTIONIST' ||
      role === 'AUDITOR'
    );
  });
  readonly canWriteClinical = computed(() => {
    const role = this.userSignal()?.role;
    return role === 'ADMIN' || role === 'HEALTH_PROFESSIONAL';
  });
  /** Recepción incluida: puede mover estados de cita y registrar admisión. */
  readonly canManageAgenda = computed(() => {
    const role = this.userSignal()?.role;
    return role === 'ADMIN' || role === 'HEALTH_PROFESSIONAL' || role === 'RECEPTIONIST';
  });
  readonly canAuditSivigila = computed(() => {
    const role = this.userSignal()?.role;
    return role === 'ADMIN' || role === 'AUDITOR' || role === 'HEALTH_PROFESSIONAL';
  });
  readonly isReceptionist = computed(() => this.userSignal()?.role === 'RECEPTIONIST');
  readonly isAuditor = computed(() => this.userSignal()?.role === 'AUDITOR');

  constructor(private readonly http: HttpClient) {}

  token() {
    return localStorage.getItem(TOKEN_KEY);
  }

  login(email: string, password: string) {
    return this.http
      .post<{ accessToken: string; user: AuthUser }>(`${API}/auth/login`, { email, password })
      .pipe(
        tap((res) => {
          localStorage.setItem(TOKEN_KEY, res.accessToken);
          localStorage.setItem(USER_KEY, JSON.stringify(res.user));
          this.userSignal.set(res.user);
        }),
      );
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.userSignal.set(null);
  }

  refreshMe() {
    return this.http.get<AuthUser>(`${API}/auth/me`).pipe(
      tap((user) => {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        this.userSignal.set(user);
      }),
    );
  }

  goToWebsite() {
    this.logout();
    window.location.href = 'http://localhost:5173/';
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
