import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApiService } from '../admin-api.service';
import { AuthService } from '../auth.service';
import { Clinic, ClinicAdmin, ClinicSpecialty, DashboardType, DASHBOARD_TYPE_LABELS, SPECIALTY_LABELS } from '../models';
import { WEBSITE_URL } from '../api.config';
import { ClinicLogoSettings } from '../clinic-settings/clinic-logo-settings';
import { HabIcon } from '../habilitation/hab-icon';

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type Panel = 'clinic' | 'admin' | null;

const NAV = [
  { label: 'Panel', icon: 'dashboard', link: '/admin' },
  { label: 'Contraseñas', icon: 'key', link: '/admin/contrasenas' },
  { label: 'Recibos de caja', icon: 'receipt', link: '/admin/ingresos' },
  { label: 'Habilitación', icon: 'shield', link: '/admin/habilitacion' },
  { label: 'Documentos', icon: 'folder', link: '/admin/documentos' },
  { label: 'Consultorios demo', icon: 'monitor', link: '/admin/demos' },
] as const;

/** Iniciales para el distintivo de cada consultorio o usuario. */
function initials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w));
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '—';
}

const norm = (v: string) => (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

@Component({
  selector: 'app-admin-dashboard',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, ClinicLogoSettings, HabIcon],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard implements OnDestroy {
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
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly nav = NAV;
  readonly initials = initials;
  readonly today = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date())
    .replace(/^./, (c) => c.toUpperCase());

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly navOpen = signal(false);
  readonly panel = signal<Panel>(null);
  readonly openMenuId = signal<string | null>(null);

  readonly query = signal('');
  readonly statusFilter = signal<StatusFilter>('ALL');
  readonly specialtyFilter = signal<ClinicSpecialty | ''>('');
  readonly adminQuery = signal('');

  readonly kpis = computed(() => {
    const list = this.clinics();
    const active = list.filter((c) => c.isActive);
    return {
      total: list.length,
      active: active.length,
      inactive: list.length - active.length,
      admins: this.admins().length,
      rips: active.filter((c) => c.ripsEnabled).length,
      pending: active.filter((c) => !c.dashboardType || !(c.admins?.length)).length,
    };
  });

  /** Consultorios activos por especialidad, de mayor a menor. */
  readonly bySpecialty = computed(() => {
    const active = this.clinics().filter((c) => c.isActive);
    const total = active.length || 1;
    return this.specialties
      .map(([key, label]) => {
        const count = active.filter((c) => c.specialty === key).length;
        return { key, label, count, pct: Math.round((count / total) * 100) };
      })
      .filter((s) => s.count)
      .sort((a, b) => b.count - a.count);
  });

  readonly filteredClinics = computed(() => {
    const q = norm(this.query().trim());
    const st = this.statusFilter();
    const sp = this.specialtyFilter();
    return this.clinics().filter(
      (c) =>
        (st === 'ALL' || (st === 'ACTIVE') === c.isActive) &&
        (!sp || c.specialty === sp) &&
        (!q || norm(`${c.name} ${this.specialtyLabel(c.specialty)} ${c.nit || ''}`).includes(q)),
    );
  });

  readonly filteredAdmins = computed(() => {
    const q = norm(this.adminQuery().trim());
    return q ? this.admins().filter((a) => norm(`${a.fullName} ${a.email} ${a.clinicName || ''}`).includes(q)) : this.admins();
  });

  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly autoHide = effect(() => {
    if (!this.message()) return;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.message.set(''), 6000);
  });
  private returnFocus: HTMLElement | null = null;

  readonly clinicForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    specialty: ['MEDICINE' as ClinicSpecialty, Validators.required],
    address: [''],
    phone: [''],
    dashboardType: ['' as DashboardType | '', Validators.required],
    sgsstEnabled: [false],
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

  hasDocs(clinic: Clinic) {
    return clinic.dashboardType === 'CLINICAL_HISTORY_WITH_DOCS';
  }

  /** Activa o desactiva la gestión documental; al desactivar no se borra ningún documento. */
  toggleDocs(clinic: Clinic) {
    const next = !this.hasDocs(clinic);
    const question = next
      ? `¿Activar la gestión documental en «${clinic.name}»? Se preparan sus requisitos de habilitación y el plan sugerido de cobro pasa a «con gestión documental».`
      : `¿Desactivar la gestión documental en «${clinic.name}»? Los documentos ya cargados se conservan; el consultorio deja de ver el módulo hasta que se active de nuevo.`;
    if (!window.confirm(question)) return;
    this.busyClinicId.set(clinic.id);
    this.assignDashboard(
      clinic.id,
      next ? 'CLINICAL_HISTORY_WITH_DOCS' : 'CLINICAL_HISTORY',
      clinic.dashboardType ? 'actualizado' : 'creado',
      next
        ? `Gestión documental activada en «${clinic.name}».`
        : `Gestión documental desactivada en «${clinic.name}». Sus documentos se conservan.`,
    );
  }

  /** Activa o desactiva el módulo SG-SST; al desactivar no se borra ningún documento. */
  toggleSgsst(clinic: Clinic) {
    const next = !clinic.sgsstEnabled;
    const question = next
      ? `¿Activar el módulo SG-SST en «${clinic.name}»? Se preparan sus requisitos de seguridad y salud en el trabajo.`
      : `¿Desactivar el módulo SG-SST en «${clinic.name}»? Los documentos ya cargados se conservan; el consultorio deja de verlos hasta que se active de nuevo.`;
    if (!window.confirm(question)) return;
    this.busyClinicId.set(clinic.id);
    this.api.setClinicSgsst(clinic.id, next).subscribe({
      next: () => {
        this.busyClinicId.set(null);
        this.error.set('');
        this.message.set(
          next
            ? `SG-SST activado en «${clinic.name}».`
            : `SG-SST desactivado en «${clinic.name}». Sus documentos se conservan.`,
        );
        this.refresh();
      },
      error: (err) => {
        this.busyClinicId.set(null);
        this.message.set('');
        this.error.set(this.readError(err, 'No se pudo cambiar el módulo SG-SST.'));
      },
    });
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
    okMessage?: string,
  ) {
    const request$ = this.clinics()
      .find((c) => c.id === clinicId)
      ?.dashboardType
      ? this.api.updateClinicDashboard(clinicId, dashboardType)
      : this.api.createClinicDashboard(clinicId, dashboardType);

    request$.subscribe({
      next: (clinic) => {
        this.message.set(
          okMessage || `Dashboard ${actionLabel} para ${clinic.name}: ${this.dashboardLabel(clinic.dashboardType)}`,
        );
        this.busyClinicId.set(null);
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
              this.busyClinicId.set(null);
              this.error.set('');
              this.refresh();
            },
            error: (retryErr) => {
              this.busyClinicId.set(null);
              this.message.set('');
              this.error.set(this.readError(retryErr, 'No se pudo actualizar el dashboard.'));
            },
          });
          return;
        }
        this.busyClinicId.set(null);
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
    this.loadError.set('');
    this.api.listClinics().subscribe({
      next: (clinics) => {
        this.clinics.set(clinics);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('No se pudieron cargar los consultorios. Revise la conexión e intente de nuevo.');
      },
    });
    this.api.listClinicAdmins().subscribe({
      next: (admins) => this.admins.set(admins),
      error: () => this.error.set('No se pudieron cargar los usuarios admin.'),
    });
  }

  retry() {
    this.loading.set(true);
    this.refresh();
  }

  ngOnDestroy() {
    clearTimeout(this.toastTimer);
  }

  // ---------- Paneles laterales ----------
  openPanel(kind: Exclude<Panel, null>, ev?: Event) {
    this.returnFocus = (ev?.currentTarget as HTMLElement) ?? (document.activeElement as HTMLElement | null);
    this.closeMenu(false);
    this.navOpen.set(false);
    this.panel.set(kind);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.drawer input, .drawer select')?.focus());
  }

  closePanel() {
    if (!this.panel()) return;
    this.panel.set(null);
    this.createdClinic.set(null);
    this.returnFocus?.focus();
    this.returnFocus = null;
  }

  /** Mantiene el foco dentro del panel lateral abierto. */
  trapFocus(ev: KeyboardEvent) {
    if (ev.key !== 'Tab') return;
    const root = ev.currentTarget as HTMLElement;
    const items = [...root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  // ---------- Menú de acciones por consultorio ----------
  toggleMenu(id: string, ev: Event) {
    ev.stopPropagation();
    if (this.openMenuId() === id) return this.closeMenu(true);
    this.openDashboardMenuId.set(null);
    this.openMenuId.set(id);
    setTimeout(() => this.menuItems()[0]?.focus());
  }

  closeMenu(restore: boolean) {
    const id = this.openMenuId();
    if (!id) return;
    this.openMenuId.set(null);
    this.openDashboardMenuId.set(null);
    if (restore) this.host.nativeElement.querySelector<HTMLElement>(`[data-menu-btn="${id}"]`)?.focus();
  }

  menuKey(ev: KeyboardEvent) {
    const items = this.menuItems();
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const next = ev.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
    } else if (ev.key === 'Home' || ev.key === 'End') {
      ev.preventDefault();
      items[ev.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (ev.key === 'Tab') {
      this.closeMenu(false);
    }
  }

  private menuItems() {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('.row-menu [role="menuitem"]:not([disabled])')];
  }

  @HostListener('document:click')
  onDocClick() {
    this.closeMenu(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.openMenuId()) return this.closeMenu(true);
    if (this.panel()) return this.closePanel();
    if (this.navOpen()) this.navOpen.set(false);
  }

  setStatus(v: StatusFilter) {
    this.statusFilter.set(v);
  }

  clearFilters() {
    this.query.set('');
    this.statusFilter.set('ALL');
    this.specialtyFilter.set('');
  }

  createClinic() {
    if (this.clinicForm.invalid) {
      this.clinicForm.markAllAsTouched();
      this.message.set('');
      this.error.set(
        this.clinicForm.controls.dashboardType.invalid
          ? 'Elija si el consultorio se crea con o sin gestión documental.'
          : 'Complete el nombre y la especialidad del consultorio.',
      );
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
      dashboardType: value.dashboardType as DashboardType,
      sgsstEnabled: value.sgsstEnabled,
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
          dashboardType: '',
          sgsstEnabled: false,
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
        this.closePanel();
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
