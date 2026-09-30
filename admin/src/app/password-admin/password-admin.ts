import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApiService, StaffUser } from '../admin-api.service';
import { WEBSITE_URL } from '../api.config';
import { AuthService } from '../auth.service';
import { Clinic, ROLE_LABELS, UserRole } from '../models';

type StaffRole = Exclude<UserRole, 'SUPER_ADMIN'>;

@Component({
  selector: 'app-password-admin',
  imports: [FormsModule, RouterLink],
  templateUrl: './password-admin.html',
  styleUrl: './password-admin.scss',
})
export class PasswordAdminPage implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly websiteUrl = WEBSITE_URL;
  readonly user = this.auth.user;
  readonly roleLabels = ROLE_LABELS;

  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  clinics = signal<Clinic[]>([]);
  users = signal<StaffUser[]>([]);

  filterClinicId = '';
  filterRole: '' | StaffRole = '';
  selectedUserId = '';
  resetPassword = '';
  showCurrentPassword = signal(false);
  showResetPassword = signal(false);

  readonly roleOptions: Array<{ value: StaffRole; label: string }> = [
    { value: 'ADMIN', label: ROLE_LABELS.ADMIN },
    { value: 'HEALTH_PROFESSIONAL', label: ROLE_LABELS.HEALTH_PROFESSIONAL },
    { value: 'RECEPTIONIST', label: ROLE_LABELS.RECEPTIONIST },
    { value: 'AUDITOR', label: ROLE_LABELS.AUDITOR },
    { value: 'AUXILIAR', label: ROLE_LABELS.AUXILIAR },
  ];

  ngOnInit() {
    this.api.listClinics().subscribe({
      next: (rows) => this.clinics.set(rows),
      error: () => this.error.set('No se pudieron cargar los consultorios.'),
    });
    this.reload();
  }

  selectedUser(): StaffUser | null {
    if (!this.selectedUserId) return null;
    return this.users().find((u) => u.id === this.selectedUserId) ?? null;
  }

  onSelectUser(userId: string) {
    this.selectedUserId = userId;
    this.resetPassword = '';
    this.showCurrentPassword.set(false);
    this.showResetPassword.set(false);
    this.error.set('');
    this.notice.set('');
  }

  reload() {
    this.loading.set(true);
    this.error.set('');
    this.api
      .listStaffUsers({
        clinicId: this.filterClinicId || undefined,
        role: this.filterRole || undefined,
      })
      .subscribe({
        next: (rows) => {
          this.users.set(rows);
          this.loading.set(false);
          if (this.selectedUserId && !rows.some((u) => u.id === this.selectedUserId)) {
            this.selectedUserId = '';
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'No se pudieron cargar los usuarios.');
        },
      });
  }

  confirmReset() {
    const target = this.selectedUser();
    if (!target) {
      this.error.set('Seleccione un usuario para cambiar la contraseña.');
      return;
    }
    if (this.resetPassword.length < 8) {
      this.error.set('La nueva contraseña debe tener mínimo 8 caracteres.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.api.resetUserPassword(target.id, this.resetPassword).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.notice.set(
          `Contraseña actualizada para ${target.email}. Nueva clave: ${res.currentPassword}`,
        );
        this.resetPassword = '';
        this.showResetPassword.set(false);
        this.reload();
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'No se pudo cambiar la contraseña.');
      },
    });
  }

  copyPassword(value: string | null | undefined) {
    if (!value) return;
    void navigator.clipboard.writeText(value).then(
      () => this.notice.set('Contraseña copiada al portapapeles.'),
      () => this.error.set('No se pudo copiar la contraseña.'),
    );
  }

  goHome() {
    window.location.href = this.websiteUrl;
  }

  logout() {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
