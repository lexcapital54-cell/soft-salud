import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly error = signal('');
  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly loginType = signal<'admin' | 'profesional'>('admin');

  readonly isProfessional = computed(() => this.loginType() === 'profesional');
  readonly title = computed(() =>
    this.isProfessional() ? 'Ingreso del profesional' : 'Iniciar sesión',
  );
  readonly eyebrow = computed(() =>
    this.isProfessional() ? 'Acceso al consultorio' : 'Acceso administrativo',
  );
  readonly hint = computed(() =>
    this.isProfessional()
      ? 'Ingrese con el usuario admin de su consultorio creado por HABILISALUD.'
      : 'El superusuario crea consultorios y usuarios admin por especialidad.',
  );

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {
    const tipo = this.route.snapshot.queryParamMap.get('tipo');
    this.loginType.set(tipo === 'profesional' ? 'profesional' : 'admin');
    // Evita reutilizar sesión del otro portal (ej. superadmin al entrar como profesional)
    this.auth.logout();
  }

  togglePassword() {
    this.showPassword.update((value) => !value);
  }

  goHome() {
    this.auth.goToWebsite();
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set('');
    this.loading.set(true);
    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: (res) => {
        this.loading.set(false);

        if (this.isProfessional()) {
          const allowed = [
            'ADMIN',
            'HEALTH_PROFESSIONAL',
            'RECEPTIONIST',
            'AUDITOR',
          ];
          if (!allowed.includes(res.user.role)) {
            this.auth.logout();
            this.error.set(
              'Este acceso es solo para personal del consultorio. Use Iniciar sesión para administración.',
            );
            return;
          }
          void this.router.navigateByUrl('/consultorio');
          return;
        }

        if (res.user.role !== 'SUPER_ADMIN') {
          this.auth.logout();
          this.error.set(
            'Este acceso es solo para superadmin. Use Ingreso del profesional para su consultorio.',
          );
          return;
        }

        void this.router.navigateByUrl('/admin');
      },
      error: (err: { status?: number; error?: { message?: string | string[] } }) => {
        this.loading.set(false);
        if (!err.status) {
          this.error.set(
            'No se pudo conectar con la API. Revisa que NestJS esté corriendo y que Postgres acepte las credenciales de api/.env.',
          );
          return;
        }
        if (err.status === 401) {
          this.error.set('Credenciales inválidas o usuario inactivo.');
          return;
        }
        const message = err.error?.message;
        this.error.set(
          Array.isArray(message) ? message.join(' ') : message || `Error del servidor (${err.status}).`,
        );
      },
    });
  }
}
