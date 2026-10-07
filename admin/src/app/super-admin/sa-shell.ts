import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { WEBSITE_URL } from '../api.config';
import { AuthService } from '../auth.service';
import { HabIcon } from '../habilitation/hab-icon';

export const SA_NAV = [
  { label: 'Panel', icon: 'dashboard', link: '/admin' },
  { label: 'Contraseñas', icon: 'key', link: '/admin/contrasenas' },
  { label: 'Recibos de caja', icon: 'receipt', link: '/admin/ingresos' },
  { label: 'Habilitación', icon: 'shield', link: '/admin/habilitacion' },
  { label: 'Documentos', icon: 'folder', link: '/admin/documentos' },
  { label: 'Consultorios demo', icon: 'monitor', link: '/admin/demos' },
] as const;

const EXACT = { paths: 'exact', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' } as const;

/** Iniciales para el distintivo de un consultorio o usuario. */
export function initials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w));
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '—';
}

/**
 * Marco común de los módulos del superadmin: barra lateral de la marca,
 * cabecera con título y acciones, y menú desplegable en pantallas pequeñas.
 */
@Component({
  selector: 'app-sa-shell',
  imports: [RouterLink, RouterLinkActive, HabIcon],
  templateUrl: './sa-shell.html',
  styleUrl: './sa-shell.scss',
  host: { '(document:keydown.escape)': 'navOpen.set(false)' },
})
export class SaShell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly eyebrow = input('');
  readonly heading = input.required<string>();
  readonly subtitle = input('');

  readonly user = this.auth.user;
  readonly websiteUrl = WEBSITE_URL;
  readonly exact = EXACT;
  readonly initials = initials;
  readonly navOpen = signal(false);
  /** El equipo comercial solo ve los consultorios demo. */
  readonly nav = computed(() => (this.auth.isCommercial() ? SA_NAV.filter((n) => n.link === '/admin/demos') : SA_NAV));
  readonly roleLabel = computed(() => (this.auth.isCommercial() ? 'Comercial' : 'Superadmin'));

  goHome() {
    this.auth.goToWebsite();
  }

  logout() {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
