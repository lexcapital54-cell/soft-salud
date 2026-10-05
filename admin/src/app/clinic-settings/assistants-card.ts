import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { API } from '../api.config';

type Assistant = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  createdAt: string;
};

const LOGIN_URL = '/login-profesional.html';

/** El administrador y los profesionales crean las cuentas de Asistente administrativo. */
@Component({
  selector: 'app-assistants-card',
  imports: [FormsModule],
  template: `
    <div class="card" id="asistentes">
      <p class="eyebrow">Personal de apoyo</p>
      <h2>Asistente administrativo</h2>
      <p class="lead">
        Maneja la agenda (registro rápido o completo del paciente) y los recibos de caja.
        No ve ni edita historias clínicas.
      </p>

      @if (assistants().length) {
        <ul class="as-list">
          @for (a of assistants(); track a.id) {
            <li [class.off]="!a.isActive">
              <div>
                <strong>{{ a.fullName }}</strong>
                <small>{{ a.email }} · {{ a.isActive ? 'Activo' : 'Desactivado' }}</small>
              </div>
              <button type="button" class="as-ghost" [disabled]="busyId() === a.id" (click)="toggle(a)">
                {{ a.isActive ? 'Desactivar' : 'Reactivar' }}
              </button>
            </li>
          }
        </ul>
      } @else if (!loading()) {
        <p class="muted small">Aún no hay asistentes en este consultorio.</p>
      }

      <h3 class="subhead">Crear asistente</h3>
      <div class="as-grid">
        <label>Nombre completo <input [(ngModel)]="fullName" autocomplete="off" /></label>
        <label>Correo (usuario de ingreso) <input [(ngModel)]="email" type="email" autocomplete="off" /></label>
        <label>Contraseña (mínimo 8) <input [(ngModel)]="password" type="text" autocomplete="new-password" /></label>
      </div>
      @if (error()) {
        <p class="err">{{ error() }}</p>
      }
      @if (created(); as c) {
        <div class="as-done">
          <p><strong>Cuenta creada.</strong> Entregue estos datos a {{ c.fullName }}:</p>
          <p>Ingreso: <a [href]="loginUrl" target="_blank">{{ loginHost }}{{ loginUrl }}</a></p>
          <p>Usuario: <strong>{{ c.email }}</strong> · Contraseña: <strong>{{ c.password }}</strong></p>
        </div>
      }
      <button type="button" class="primary" [disabled]="saving()" (click)="create()">
        {{ saving() ? 'Creando…' : 'Crear asistente administrativo' }}
      </button>
    </div>
  `,
  styles: `
    .card { max-width: 720px; margin-top: 20px; background: #fff; border: 1px solid #d7e3e6; border-radius: 22px; padding: 28px; box-shadow: 0 10px 28px rgba(0, 45, 92, 0.08); }
    .eyebrow { margin: 0; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: #0d7377; }
    h2 { margin: 6px 0 8px; color: #003d4c; }
    .lead { margin: 0 0 14px; color: #3d5459; line-height: 1.5; }
    .subhead { margin: 18px 0 10px; font-size: 0.95rem; color: #003d4c; }
    .muted { color: #6a8085; }
    .small { font-size: 0.85rem; }
    .as-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .as-list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid #d7e3e6; border-radius: 12px; }
    .as-list li.off { opacity: 0.65; }
    .as-list small { display: block; color: #6a8085; }
    .as-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    label { display: flex; flex-direction: column; gap: 5px; font-size: 0.85rem; color: #405a5f; }
    input { font: inherit; padding: 9px 11px; border: 1px solid #d3e0e1; border-radius: 10px; }
    .as-ghost { border: 1px solid #d3e0e1; background: #fff; border-radius: 999px; padding: 7px 14px; font: inherit; font-size: 0.85rem; cursor: pointer; }
    .as-done { margin-top: 12px; padding: 12px 14px; border-radius: 12px; background: #eef8f1; border: 1px solid #bfe0c9; }
    .as-done p { margin: 0 0 4px; }
    .primary { margin-top: 16px; border: 0; background: #003d4c; color: #fff; border-radius: 999px; padding: 12px 20px; font: inherit; cursor: pointer; }
    .primary:disabled { opacity: 0.6; }
    .err { color: #8a1f1f; }
    @media (max-width: 700px) { .as-grid { grid-template-columns: 1fr; } }
  `,
})
export class AssistantsCard implements OnInit {
  private readonly http = inject(HttpClient);

  readonly assistants = signal<Assistant[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly error = signal('');
  readonly created = signal<{ fullName: string; email: string; password: string } | null>(null);
  readonly loginUrl = LOGIN_URL;
  readonly loginHost = location.origin;

  fullName = '';
  email = '';
  password = '';

  ngOnInit() {
    this.load();
    if (location.search.includes('seccion=asistentes')) {
      setTimeout(() => document.getElementById('asistentes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
  }

  load() {
    this.http.get<Assistant[]>(`${API}/me/assistants`).subscribe({
      next: (rows) => {
        this.assistants.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  create() {
    const fullName = this.fullName.trim();
    const email = this.email.trim().toLowerCase();
    const password = this.password;
    if (fullName.length < 2 || !email.includes('@')) {
      this.error.set('Escriba el nombre y un correo válido.');
      return;
    }
    if (password.length < 8) {
      this.error.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.created.set(null);
    this.http.post<Assistant>(`${API}/me/assistants`, { fullName, email, password }).subscribe({
      next: (a) => {
        this.saving.set(false);
        this.created.set({ fullName: a.fullName, email: a.email, password });
        this.fullName = '';
        this.email = '';
        this.password = '';
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' ') : msg || 'No se pudo crear el asistente.');
      },
    });
  }

  toggle(a: Assistant) {
    const next = !a.isActive;
    if (!next && !window.confirm(`¿Desactivar a ${a.fullName}? No podrá ingresar; la cuenta no se borra.`)) return;
    this.busyId.set(a.id);
    this.http.post<Assistant>(`${API}/me/assistants/${a.id}/active`, { isActive: next }).subscribe({
      next: () => {
        this.busyId.set(null);
        this.load();
      },
      error: (err) => {
        this.busyId.set(null);
        this.error.set(err?.error?.message || 'No se pudo cambiar el estado.');
      },
    });
  }
}
