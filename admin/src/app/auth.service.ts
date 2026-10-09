import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { tap } from 'rxjs';
import { AccessibleClinic, AuthUser } from './models';
import { API, WEBSITE_URL } from './api.config';

const TOKEN_KEY = 'habilisalud_token';
const USER_KEY = 'habilisalud_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSignal = signal<AuthUser | null>(this.readStoredUser());

  readonly user = this.userSignal.asReadonly();
  readonly isLoggedIn = computed(() => !!this.userSignal());
  readonly isSuperAdmin = computed(() => this.userSignal()?.role === 'SUPER_ADMIN');
  readonly isCommercial = computed(() => this.userSignal()?.role === 'COMMERCIAL');
  readonly isClinicAdmin = computed(() => this.userSignal()?.role === 'ADMIN');
  readonly isClinicStaff = computed(() => {
    const role = this.userSignal()?.role;
    return (
      role === 'ADMIN' ||
      role === 'HEALTH_PROFESSIONAL' ||
      role === 'RECEPTIONIST' ||
      role === 'AUDITOR' ||
      role === 'AUXILIAR'
    );
  });
  readonly canWriteClinical = computed(() => {
    const role = this.userSignal()?.role;
    return role === 'ADMIN' || role === 'HEALTH_PROFESSIONAL';
  });
  /** Solo superadmin: estructura del expediente (asignar, habilitar, descargar). */
  readonly canManageDocuments = computed(() => this.userSignal()?.role === 'SUPER_ADMIN');
  /**
   * Diligenciar SG-SST: solo SUPER_ADMIN.
   */
  readonly canFillDocuments = computed(() => this.userSignal()?.role === 'SUPER_ADMIN');
  /**
   * Cargar/editar archivos: SUPER_ADMIN en todos los pilares;
   * ADMIN y profesional del consultorio: Documentación legal, Talento humano,
   * uso de suelo y concepto sanitario (UI filtra por pilar/código).
   */
  readonly canUploadDocuments = computed(() => {
    const role = this.userSignal()?.role;
    return (
      role === 'SUPER_ADMIN' ||
      role === 'ADMIN' ||
      role === 'HEALTH_PROFESSIONAL'
    );
  });
  /** Descarga de archivos: solo superadmin. */
  readonly canDownloadDocuments = computed(() => this.userSignal()?.role === 'SUPER_ADMIN');
  /** Profesional/admin del consultorio: descarga PDF con marca de agua de su nombre. */
  readonly canDownloadMarkedPdf = computed(() => {
    const role = this.userSignal()?.role;
    return role === 'ADMIN' || role === 'HEALTH_PROFESSIONAL';
  });
  /** Contraparte tras sello HABILISALUD (admin o profesional del consultorio). */
  readonly canCountersignDocuments = computed(() => {
    const role = this.userSignal()?.role;
    return role === 'ADMIN' || role === 'HEALTH_PROFESSIONAL';
  });
  /** CRUD de archivos en Legal / Talento / uso suelo / concepto (admin o profesional). */
  readonly canClinicDocCrud = computed(() => {
    const role = this.userSignal()?.role;
    return (
      role === 'SUPER_ADMIN' ||
      role === 'ADMIN' ||
      role === 'HEALTH_PROFESSIONAL'
    );
  });
  readonly canSignDocuments = computed(
    () => this.canManageDocuments() || this.canCountersignDocuments() || this.canClinicDocCrud(),
  );
  /** Recepción incluida: puede mover estados de cita y registrar admisión. */
  readonly canManageAgenda = computed(() => {
    const role = this.userSignal()?.role;
    return (
      role === 'ADMIN' ||
      role === 'HEALTH_PROFESSIONAL' ||
      role === 'RECEPTIONIST' ||
      role === 'AUXILIAR'
    );
  });
  readonly canAuditSivigila = computed(() => {
    const role = this.userSignal()?.role;
    return role === 'ADMIN' || role === 'AUDITOR' || role === 'HEALTH_PROFESSIONAL';
  });
  readonly isReceptionist = computed(() => this.userSignal()?.role === 'RECEPTIONIST');
  readonly isAuditor = computed(() => this.userSignal()?.role === 'AUDITOR');
  readonly isAuxiliar = computed(() => this.userSignal()?.role === 'AUXILIAR');
  /** Seguimiento longitudinal de ortodoncia: el auxiliar solo agenda controles y retención. */
  readonly canEditOrthoFollow = computed(() => this.canWriteClinical() || this.isAuxiliar());
  /** Admin del consultorio (gestiona accesos multi-sede). */
  readonly canManageClinicAccess = computed(() => {
    const role = this.userSignal()?.role;
    return role === 'ADMIN' || role === 'SUPER_ADMIN';
  });

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

  /** Cierra sesión y abre el login del consultorio (admin / profesional). */
  logoutToClinicLogin() {
    this.logout();
    window.location.replace(`/login-profesional.html?_=${Date.now()}`);
  }

  /** Cierra sesión y abre el login de superadmin HABILISALUD. */
  logoutToAdminLogin() {
    this.logout();
    window.location.replace(`/login-admin.html?_=${Date.now()}`);
  }

  refreshMe() {
    return this.http.get<AuthUser>(`${API}/auth/me`).pipe(
      tap((user) => {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        this.userSignal.set(user);
      }),
    );
  }

  listAccessibleClinics() {
    return this.http.get<AccessibleClinic[]>(`${API}/auth/clinics`);
  }

  switchClinic(clinicId: string) {
    return this.http
      .post<{ accessToken: string; user: AuthUser }>(`${API}/auth/switch-clinic`, {
        clinicId,
      })
      .pipe(
        tap((res) => {
          localStorage.setItem(TOKEN_KEY, res.accessToken);
          localStorage.setItem(USER_KEY, JSON.stringify(res.user));
          this.userSignal.set(res.user);
        }),
      );
  }

  /** Actualiza campos del usuario en sesión (p. ej. ripsEnabled) sin re-login. */
  patchSessionUser(partial: Partial<AuthUser>) {
    const current = this.userSignal();
    if (!current) return;
    const next = { ...current, ...partial };
    localStorage.setItem(USER_KEY, JSON.stringify(next));
    this.userSignal.set(next);
  }

  goToWebsite() {
    this.logout();
    window.location.href = WEBSITE_URL;
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
