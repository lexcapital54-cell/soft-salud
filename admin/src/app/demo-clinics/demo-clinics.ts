import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { API, WEBSITE_URL } from '../api.config';
import { AuthService } from '../auth.service';
import { ClinicSpecialty, SPECIALTY_LABELS } from '../models';

type DemoUser = { role: string; roleLabel: string; fullName: string; email: string; password: string | null };

type DemoClinic = {
  id: string;
  name: string;
  specialty: ClinicSpecialty;
  isActive: boolean;
  createdAt: string;
  patients: number;
  signedRecords: number;
  appointmentsToday: number;
  documents: number;
  documentsWithFiles: number;
  users: DemoUser[];
};

const LOGIN_PATH = '/login-profesional.html';

@Component({
  selector: 'app-demo-clinics',
  imports: [FormsModule, RouterLink],
  templateUrl: './demo-clinics.html',
  styleUrls: ['../password-admin/password-admin.scss', './demo-clinics.scss'],
})
export class DemoClinicsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly websiteUrl = WEBSITE_URL;
  readonly user = this.auth.user;
  /** El equipo comercial solo consulta: no crea ni desactiva demos. */
  readonly readOnly = this.auth.isCommercial;
  readonly loginUrl = location.origin + LOGIN_PATH;
  readonly specialties = Object.entries(SPECIALTY_LABELS) as [ClinicSpecialty, string][];

  readonly demos = signal<DemoClinic[]>([]);
  readonly loading = signal(false);
  readonly creating = signal<ClinicSpecialty | null>(null);
  readonly loadingDocs = signal<string | null>(null);
  readonly notice = signal('');
  readonly error = signal('');
  specialty: ClinicSpecialty = 'PSYCHOLOGY';

  ngOnInit() {
    this.reload();
  }

  specialtyLabel(s: ClinicSpecialty) {
    return SPECIALTY_LABELS[s];
  }

  missingSpecialties() {
    const have = new Set(this.demos().filter((d) => d.isActive).map((d) => d.specialty));
    return this.specialties.filter(([s]) => !have.has(s)).map(([s]) => s);
  }

  reload() {
    this.loading.set(true);
    this.http.get<DemoClinic[]>(`${API}/admin/demos`).subscribe({
      next: (rows) => {
        this.demos.set(rows);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'No se pudieron cargar los consultorios demo.');
      },
    });
  }

  create(specialty: ClinicSpecialty = this.specialty) {
    this.creating.set(specialty);
    this.error.set('');
    this.notice.set('');
    this.http.post<DemoClinic>(`${API}/admin/demos`, { specialty }).subscribe({
      next: (demo) => {
        this.creating.set(null);
        this.notice.set(`Demo creada: ${demo.name}.`);
        this.reload();
      },
      error: (err) => {
        this.creating.set(null);
        this.error.set(err?.error?.message || 'No se pudo crear la demo.');
      },
    });
  }

  async createMissing() {
    const pending = this.missingSpecialties();
    this.error.set('');
    for (const s of pending) {
      this.creating.set(s);
      try {
        await new Promise<void>((resolve, reject) =>
          this.http.post(`${API}/admin/demos`, { specialty: s }).subscribe({ next: () => resolve(), error: reject }),
        );
      } catch (err) {
        const e = err as { error?: { message?: string } };
        this.error.set(`${this.specialtyLabel(s)}: ${e?.error?.message || 'no se pudo crear la demo.'}`);
        break;
      }
    }
    this.creating.set(null);
    if (!this.error()) this.notice.set(`Demos creadas: ${pending.map((s) => this.specialtyLabel(s)).join(', ')}.`);
    this.reload();
  }

  toggleActive(demo: DemoClinic) {
    const next = !demo.isActive;
    if (!next && !window.confirm(`¿Desactivar «${demo.name}»? Sus usuarios no podrán ingresar. No se borra nada.`)) return;
    this.http.post(`${API}/admin/demos/${demo.id}/active`, { isActive: next }).subscribe({
      next: () => {
        this.notice.set(`«${demo.name}» ${next ? 'reactivada' : 'desactivada'}.`);
        this.reload();
      },
      error: (err) => this.error.set(err?.error?.message || 'No se pudo cambiar el estado.'),
    });
  }

  loadDocuments(demo: DemoClinic) {
    this.loadingDocs.set(demo.id);
    this.error.set('');
    this.notice.set('');
    this.http
      .post<{ source: string | null; requirementsCreated: number; filesCopied: number; requirements: number; withFiles: number }>(
        `${API}/admin/demos/${demo.id}/documents`,
        {},
      )
      .subscribe({
        next: (r) => {
          this.loadingDocs.set(null);
          const from = r.source ? ` Modelo: ${r.source}.` : '';
          this.notice.set(
            `«${demo.name}»: ${r.requirements} documentos (${r.withFiles} con soporte). Nuevos: ${r.requirementsCreated} requisitos y ${r.filesCopied} archivos.${from}`,
          );
          this.reload();
        },
        error: (err) => {
          this.loadingDocs.set(null);
          this.error.set(err?.error?.message || 'No se pudo cargar la documentación.');
        },
      });
  }

  copy(text: string) {
    void navigator.clipboard.writeText(text).then(
      () => this.notice.set('Copiado al portapapeles.'),
      () => this.error.set('No se pudo copiar.'),
    );
  }

  copyAccess(demo: DemoClinic) {
    const lines = [
      `${demo.name}`,
      `Ingreso: ${this.loginUrl}`,
      ...demo.users.map((u) => `${u.roleLabel}: ${u.email} · clave ${u.password ?? '—'}`),
    ];
    this.copy(lines.join('\n'));
  }

  goHome() {
    window.location.href = this.websiteUrl;
  }

  logout() {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
