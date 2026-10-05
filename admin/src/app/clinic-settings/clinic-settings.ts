import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { ClinicSwitcher } from '../clinic-switcher';
import { AssistantsCard } from './assistants-card';
import { API, WEBSITE_URL } from '../api.config';

type StaffRow = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  roleLabel: string;
  clinicId: string | null;
  accessClinicIds: string[];
};

type AccessClinic = {
  id: string;
  name: string;
  address: string | null;
  granted: boolean;
  isHome: boolean;
};

type DirectoryClinic = {
  id: string;
  name: string;
  address: string | null;
};

@Component({
  selector: 'app-clinic-settings',
  imports: [FormsModule, ClinicSwitcher, AssistantsCard],
  templateUrl: './clinic-settings.html',
  styleUrl: './clinic-settings.scss',
})
export class ClinicSettings {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  readonly websiteUrl = WEBSITE_URL;
  readonly user = this.auth.user;
  readonly canManageAccess = this.auth.canManageClinicAccess;
  readonly isClinicAdmin = this.auth.isClinicAdmin;
  readonly canWriteClinical = this.auth.canWriteClinical;

  readonly staff = signal<StaffRow[]>([]);
  readonly directory = signal<DirectoryClinic[]>([]);
  readonly accessUser = signal<StaffRow | null>(null);
  readonly accessClinics = signal<AccessClinic[]>([]);
  readonly accessSaving = signal(false);
  readonly accessMessage = signal('');
  readonly accessError = signal('');
  linkClinicId = '';

  constructor() {
    if (this.canManageAccess()) {
      this.reloadStaff();
      this.reloadDirectory();
    }
  }

  onClinicSwitched() {
    window.location.reload();
  }

  reloadStaff() {
    this.http.get<StaffRow[]>(`${API}/clinic-access/staff`).subscribe({
      next: (rows) => this.staff.set(rows),
      error: () => this.staff.set([]),
    });
  }

  reloadDirectory() {
    this.http.get<DirectoryClinic[]>(`${API}/clinic-access/directory`).subscribe({
      next: (rows) => this.directory.set(rows),
      error: () => this.directory.set([]),
    });
  }

  openAccess(row: StaffRow) {
    this.accessMessage.set('');
    this.accessError.set('');
    this.accessUser.set(row);
    this.http
      .get<{ clinics: AccessClinic[] }>(`${API}/clinic-access/users/${row.id}`)
      .subscribe({
        next: (res) => this.accessClinics.set(res.clinics),
        error: (err) =>
          this.accessError.set(
            err?.error?.message || 'No se pudo cargar el acceso multi-sede.',
          ),
      });
  }

  closeAccess() {
    this.accessUser.set(null);
    this.accessClinics.set([]);
  }

  toggleClinic(clinic: AccessClinic) {
    if (clinic.isHome) return;
    this.accessClinics.update((rows) =>
      rows.map((c) =>
        c.id === clinic.id ? { ...c, granted: !c.granted } : c,
      ),
    );
  }

  saveAccess() {
    const target = this.accessUser();
    if (!target) return;
    const clinicIds = this.accessClinics()
      .filter((c) => c.granted || c.isHome)
      .map((c) => c.id);
    this.accessSaving.set(true);
    this.accessMessage.set('');
    this.accessError.set('');
    this.http
      .put(`${API}/clinic-access/users/${target.id}`, { clinicIds })
      .subscribe({
        next: () => {
          this.accessSaving.set(false);
          this.accessMessage.set('Accesos de sede guardados.');
          this.reloadStaff();
          this.openAccess(target);
        },
        error: (err) => {
          this.accessSaving.set(false);
          this.accessError.set(
            err?.error?.message || 'No se pudieron guardar los accesos.',
          );
        },
      });
  }

  linkSelfClinic() {
    if (!this.linkClinicId) return;
    this.accessError.set('');
    this.accessMessage.set('');
    this.http
      .post(`${API}/clinic-access/self`, { clinicId: this.linkClinicId })
      .subscribe({
        next: () => {
          this.accessMessage.set(
            'Sede vinculada a su usuario. Ya puede asignarla al asistente administrativo.',
          );
          this.linkClinicId = '';
          this.reloadStaff();
        },
        error: (err) =>
          this.accessError.set(
            err?.error?.message || 'No se pudo vincular la sede.',
          ),
      });
  }
}
