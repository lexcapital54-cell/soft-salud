import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-documents-placeholder',
  imports: [RouterLink],
  template: `
    <section class="wrap">
      <header>
        <div class="header-left">
          <a routerLink="/consultorio">← Volver al consultorio</a>
          <a class="brand" href="http://localhost:5173/" (click)="goHome(); $event.preventDefault()"
            >HABILISALUD</a
          >
        </div>
        <button type="button" class="logout" (click)="logout()">Cerrar sesión</button>
      </header>
      <div class="card">
        <p class="eyebrow">Gestión documental</p>
        <h1>En organización</h1>
        <p>
          Estamos terminando de organizar los requisitos y el flujo de carga de evidencias de
          habilitación. Pronto podrá subir, descargar y visualizar los PDF desde aquí.
        </p>
        <p class="muted">
          Mientras tanto, los requisitos del checklist ya están sembrados en base de datos para su
          consultorio.
        </p>
      </div>
    </section>
  `,
  styles: `
    .wrap {
      min-height: 100svh;
      padding: 28px;
      max-width: 720px;
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .brand {
      color: #000;
      text-decoration: none;
      letter-spacing: -0.02em;
    }
    a {
      color: #0d7377;
      text-decoration: none;
    }
    .logout {
      font: inherit;
      cursor: pointer;
      border-radius: 999px;
      border: 1px solid #d8d8d8;
      background: #fff;
      padding: 10px 16px;
      color: #003d4c;
    }
    .card {
      border: 1px solid #e8e8e8;
      border-radius: 20px;
      padding: 28px;
    }
    .eyebrow {
      margin: 0 0 8px;
      color: #8f8f8f;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.08em;
    }
    h1 {
      margin: 0 0 12px;
      letter-spacing: -0.03em;
    }
    .muted {
      color: #8f8f8f;
    }
  `,
})
export class DocumentsPlaceholder {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  goHome() {
    this.auth.goToWebsite();
  }

  logout() {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
