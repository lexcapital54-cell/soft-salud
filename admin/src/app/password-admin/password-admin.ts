import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApiService, StaffUser } from '../admin-api.service';
import { Clinic, ROLE_LABELS, UserRole } from '../models';
import { SaShell } from '../super-admin/sa-shell';

type StaffRole = Exclude<UserRole, 'SUPER_ADMIN'>;

@Component({
  selector: 'app-password-admin',
  imports: [FormsModule, SaShell],
  templateUrl: './password-admin.html',
  styleUrls: ['../super-admin/sa-page.scss', './password-admin.scss'],
})
export class PasswordAdminPage implements OnInit {
  private readonly api = inject(AdminApiService);
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
  repsDate = '';
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
    this.repsDate = this.users().find((u) => u.id === userId)?.repsExpirationDate?.slice(0, 10) || '';
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
    if (target.role === 'RECEPTIONIST') {
      if (!/^\d{4}$/.test(this.resetPassword)) {
        this.error.set('La clave del asistente administrativo debe ser de 4 dígitos.');
        return;
      }
    } else if (this.resetPassword.length < 8) {
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

  isProfessional(u: StaffUser) {
    return u.role === 'ADMIN' || u.role === 'HEALTH_PROFESSIONAL';
  }

  saveReps() {
    const target = this.selectedUser();
    if (!target) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.setUserReps(target.id, this.repsDate || null).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.notice.set(
          res.repsExpirationDate
            ? `Fecha REPS de ${target.fullName} actualizada: ${res.repsExpirationDate}.`
            : `Fecha REPS de ${target.fullName} eliminada.`,
        );
        this.reload();
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'No se pudo guardar la fecha REPS.');
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
}
