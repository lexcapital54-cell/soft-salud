import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApiService } from '../admin-api.service';
import { AuthService } from '../auth.service';
import { Clinic, ClinicAdmin, ClinicSpecialty, DashboardType, DASHBOARD_TYPE_LABELS, SPECIALTY_LABELS } from '../models';
import { WEBSITE_URL } from '../api.config';
import { ClinicLogoSettings } from '../clinic-settings/clinic-logo-settings';

@Component({
  selector: 'app-admin-dashboard',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, ClinicLogoSettings],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly specialties = Object.entries(SPECIALTY_LABELS) as [ClinicSpecialty, string][];
  readonly clinics = signal<Clinic[]>([]);
  readonly admins = signal<ClinicAdmin[]>([]);
  readonly message = signal('');
  readonly error = signal('');
  readonly showClinicAdminPassword = signal(false);
  readonly showAdminPassword = signal(false);
  readonly openDashboardMenuId = signal<string | null>(null);
  readonly busyClinicId = signal<string | null>(null);

  readonly clinicForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    specialty: ['MEDICINE' as ClinicSpecialty, Validators.required],
    address: [''],
    phone: [''],
    adminFullName: [''],
    adminEmail: [''],
    adminPassword: [''],
  });

  readonly adminForm = this.fb.nonNullable.group({
    clinicId: ['', Validators.required],
    fullName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    this.refresh();
  }

  specialtyLabel(specialty: ClinicSpecialty) {
    return SPECIALTY_LABELS[specialty];
  }

  dashboardLabel(type: DashboardType | null | undefined) {
    return type ? DASHBOARD_TYPE_LABELS[type] : 'Sin dashboard';
  }

  toggleDashboardMenu(clinicId: string) {
    this.openDashboardMenuId.update((current) => (current === clinicId ? null : clinicId));
  }

  createDashboard(clinicId: string, dashboardType: DashboardType) {
    this.openDashboardMenuId.set(null);
    this.assignDashboard(clinicId, dashboardType, 'creado');
  }

  changeDashboard(clinicId: string, dashboardType: DashboardType) {
    this.openDashboardMenuId.set(null);
    this.assignDashboard(clinicId, dashboardType, 'actualizado');
  }

  private assignDashboard(
    clinicId: string,
    dashboardType: DashboardType,
    actionLabel: 'creado' | 'actualizado',
  ) {
    const request$ = this.clinics()
      .find((c) => c.id === clinicId)
      ?.dashboardType
      ? this.api.updateClinicDashboard(clinicId, dashboardType)
      : this.api.createClinicDashboard(clinicId, dashboardType);

    request$.subscribe({
      next: (clinic) => {
        this.message.set(
          `Dashboard ${actionLabel} para ${clinic.name}: ${this.dashboardLabel(clinic.dashboardType)}`,
        );
        this.error.set('');
        this.refresh();
      },
      error: (err: { status?: number; error?: { message?: string | string[] } }) => {
        // Si ya existía, reintenta con PATCH.
        if (err.status === 409) {
          this.api.updateClinicDashboard(clinicId, dashboardType).subscribe({
            next: (clinic) => {
              this.message.set(
                `Dashboard actualizado para ${clinic.name}: ${this.dashboardLabel(clinic.dashboardType)}`,
              );
              this.error.set('');
              this.refresh();
            },
            error: (retryErr) => {
              this.message.set('');
              this.error.set(this.readError(retryErr, 'No se pudo actualizar el dashboard.'));
            },
          });
          return;
        }
        this.message.set('');
        this.error.set(
          this.readError(
            err,
            actionLabel === 'creado'
              ? 'No se pudo crear el dashboard.'
              : 'No se pudo actualizar el dashboard.',
          ),
        );
      },
    });
  }

  readonly logoClinicId = signal<string | null>(null);
  /** Consultorio recién creado: se ofrece cargar su logo de inmediato. */
  readonly createdClinic = signal<{ id: string; name: string } | null>(null);

  toggleLogo(id: string) {
    this.logoClinicId.update((cur) => (cur === id ? null : id));
  }

  readonly providerEdit = signal<{ id: string; address: string; phone: string; nit: string; habilitationCode: string } | null>(null);

  startEditProvider(clinic: Clinic) {
    this.providerEdit.set({
      id: clinic.id,
      address: clinic.address || '',
      phone: clinic.phone || '',
      nit: clinic.nit || '',
      habilitationCode: clinic.habilitationCode || '',
    });
  }

  saveProvider() {
    const p = this.providerEdit();
    if (!p) return;
    this.busyClinicId.set(p.id);
    this.api
      .updateClinic(p.id, {
        address: p.address.trim(),
        phone: p.phone.trim(),
        nit: p.nit.trim(),
        habilitationCode: p.habilitationCode.trim(),
      })
      .subscribe({
        next: (updated) => {
          this.busyClinicId.set(null);
          this.providerEdit.set(null);
          this.error.set('');
          this.message.set(`Datos del prestador actualizados para «${updated.name}».`);
          this.refresh();
        },
        error: (err) => {
          this.busyClinicId.set(null);
          this.message.set('');
          this.error.set(this.readError(err, 'No se pudieron guardar los datos del prestador.'));
        },
      });
  }

  toggleClinicActive(clinic: Clinic) {
    const next = !clinic.isActive;
    const question = next
      ? `¿Reactivar «${clinic.name}»? Sus usuarios podrán volver a ingresar.`
      : `¿Desactivar «${clinic.name}»? Sus usuarios no podrán ingresar, pero no se borra ningún dato (pacientes, historias clínicas, documentos). Se puede reactivar después.`;
    if (!window.confirm(question)) return;
    this.busyClinicId.set(clinic.id);
    this.api.setClinicActive(clinic.id, next).subscribe({
      next: (updated) => {
        this.busyClinicId.set(null);
        this.error.set('');
        this.message.set(`Consultorio «${updated.name}» ${next ? 'reactivado' : 'desactivado'}.`);
        this.refresh();
      },
      error: (err) => {
        this.busyClinicId.set(null);
        this.message.set('');
        this.error.set(this.readError(err, 'No se pudo cambiar el estado del consultorio.'));
      },
    });
  }

  toggleClinicRips(clinic: Clinic) {
    const next = !clinic.ripsEnabled;
    const question = next
      ? `¿Activar RIPS para «${clinic.name}»? La HCE de todos sus profesionales pedirá Finalidad, Causa externa, CIE-10 y CUPS.`
      : `¿Desactivar RIPS para «${clinic.name}»? El RDA clínico se sigue generando al firmar.`;
    if (!window.confirm(question)) return;
    this.busyClinicId.set(clinic.id);
    this.api.setClinicRips(clinic.id, next).subscribe({
      next: (res) => {
        this.busyClinicId.set(null);
        this.error.set('');
        this.message.set(
          `RIPS ${next ? 'activado' : 'desactivado'} en «${clinic.name}» (${res.usersUpdated} usuario(s)).`,
        );
        this.refresh();
      },
      error: (err) => {
        this.busyClinicId.set(null);
        this.message.set('');
        this.error.set(this.readError(err, 'No se pudo cambiar RIPS del consultorio.'));
      },
    });
  }

  deleteClinic(clinic: Clinic) {
    this.busyClinicId.set(clinic.id);
    this.api.clinicDeletionCheck(clinic.id).subscribe({
      next: (check) => {
        this.busyClinicId.set(null);
        if (!check.canDelete) {
          this.message.set('');
          this.error.set(
            `No se puede eliminar «${check.name}»: tiene ${check.blockers.join(', ')}. ` +
              'Las historias clínicas deben conservarse por ley. Use «Desactivar» para cerrar el acceso sin borrar datos.',
          );
          return;
        }
        const typed = window.prompt(
          `Eliminar «${check.name}» de forma permanente.\n\n` +
            `No tiene pacientes ni historias clínicas. Se borrarán su configuración, documentos de habilitación` +
            (check.users ? ` y ${check.users} usuario(s) que solo pertenecen a este consultorio` : '') +
            `.\n\nEsta acción no se puede deshacer. Escriba el nombre exacto del consultorio para confirmar:`,
        );
        if (typed === null) return;
        if (typed.trim() !== check.name.trim()) {
          this.message.set('');
          this.error.set('El nombre no coincide. No se eliminó el consultorio.');
          return;
        }
        const pin = window.prompt('Ingrese la clave de confirmación de 4 dígitos para eliminar:');
        if (pin === null) return;
        if (!/^\d{4}$/.test(pin.trim())) {
          this.message.set('');
          this.error.set('La clave de confirmación debe tener 4 dígitos. No se eliminó el consultorio.');
          return;
        }
        this.busyClinicId.set(clinic.id);
        this.api.deleteClinic(clinic.id, typed, pin.trim()).subscribe({
          next: (res) => {
            this.busyClinicId.set(null);
            this.error.set('');
            this.message.set(
              `Consultorio «${res.name}» eliminado.` +
                (res.usersDeactivated.length
                  ? ` Usuarios desactivados (tenían registros asociados): ${res.usersDeactivated.join(', ')}.`
                  : ''),
            );
            this.refresh();
          },
          error: (err) => {
            this.busyClinicId.set(null);
            this.message.set('');
            this.error.set(this.readError(err, 'No se pudo eliminar el consultorio.'));
          },
        });
      },
      error: (err) => {
        this.busyClinicId.set(null);
        this.message.set('');
        this.error.set(this.readError(err, 'No se pudo verificar el consultorio.'));
      },
    });
  }

  toggleClinicAdminPassword() {
    this.showClinicAdminPassword.update((value) => !value);
  }

  toggleAdminPassword() {
    this.showAdminPassword.update((value) => !value);
  }

  refresh() {
    this.api.listClinics().subscribe({
      next: (clinics) => this.clinics.set(clinics),
      error: () => this.error.set('No se pudieron cargar los consultorios.'),
    });
    this.api.listClinicAdmins().subscribe({
      next: (admins) => this.admins.set(admins),
      error: () => this.error.set('No se pudieron cargar los usuarios admin.'),
    });
  }

  createClinic() {
    if (this.clinicForm.invalid) {
      this.clinicForm.markAllAsTouched();
      this.message.set('');
      this.error.set('Complete el nombre y la especialidad del consultorio.');
      return;
    }

    const value = this.clinicForm.getRawValue();
    const hasPartialAdmin =
      !!(value.adminFullName || value.adminEmail || value.adminPassword) &&
      !(value.adminFullName && value.adminEmail && value.adminPassword);

    if (hasPartialAdmin) {
      this.message.set('');
      this.error.set(
        'Para crear el admin junto al consultorio, complete nombre, correo y contraseña (mínimo 8 caracteres).',
      );
      return;
    }

    if (value.adminPassword && value.adminPassword.length < 8) {
      this.message.set('');
      this.error.set('La contraseña del admin debe tener mínimo 8 caracteres.');
      return;
    }

    const payload = {
      name: value.name,
      specialty: value.specialty,
      address: value.address || undefined,
      phone: value.phone || undefined,
      admin:
        value.adminFullName && value.adminEmail && value.adminPassword
          ? {
              fullName: value.adminFullName,
              email: value.adminEmail,
              password: value.adminPassword,
            }
          : undefined,
    };

    this.api.createClinic(payload).subscribe({
      next: (clinic) => {
        const adminCount = clinic.admins?.length || 0;
        this.message.set(
          adminCount
            ? `Consultorio creado con ${adminCount} admin.`
            : 'Consultorio creado. Ahora puede crear un usuario admin.',
        );
        this.error.set('');
        this.createdClinic.set({ id: clinic.id, name: clinic.name });
        this.clinicForm.reset({
          name: '',
          specialty: 'MEDICINE',
          address: '',
          phone: '',
          adminFullName: '',
          adminEmail: '',
          adminPassword: '',
        });
        this.showClinicAdminPassword.set(false);
        this.refresh();
      },
      error: (err: { status?: number; error?: { message?: string | string[] } }) => {
        this.message.set('');
        if (!err.status) {
          this.error.set('No se pudo conectar con la API. Verifica que NestJS esté corriendo.');
          return;
        }
        this.error.set(this.readError(err, 'No se pudo crear el consultorio.'));
      },
    });
  }

  createAdmin() {
    if (this.adminForm.invalid) {
      this.adminForm.markAllAsTouched();
      this.message.set('');
      this.error.set(this.adminFormError());
      return;
    }

    const payload = this.adminForm.getRawValue();
    this.api.createClinicAdmin(payload).subscribe({
      next: (admin) => {
        this.message.set(`Usuario admin creado: ${admin.fullName} (${admin.email})`);
        this.error.set('');
        this.adminForm.reset({
          clinicId: '',
          fullName: '',
          email: '',
          password: '',
        });
        this.showAdminPassword.set(false);
        this.refresh();
      },
      error: (err: { status?: number; error?: { message?: string | string[] } }) => {
        this.message.set('');
        if (!err.status) {
          this.error.set('No se pudo conectar con la API. Verifica que NestJS esté corriendo.');
          return;
        }
        this.error.set(this.readError(err, 'No se pudo crear el usuario admin.'));
      },
    });
  }

  logout() {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

  readonly websiteUrl = WEBSITE_URL;

  goHome() {
    this.auth.goToWebsite();
  }

  private adminFormError() {
    const c = this.adminForm.controls;
    if (c.clinicId.invalid) return 'Seleccione un consultorio.';
    if (c.fullName.invalid) return 'El nombre completo es obligatorio (mínimo 2 caracteres).';
    if (c.email.invalid) return 'Ingrese un correo válido.';
    if (c.password.invalid) return 'La contraseña debe tener mínimo 8 caracteres.';
    return 'Complete todos los campos del usuario admin.';
  }

  private readError(err: { error?: { message?: string | string[] } }, fallback: string) {
    const message = err.error?.message;
    if (Array.isArray(message)) {
      return message.join(' ');
    }
    return message || fallback;
  }
}
