import { Component, HostListener, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../auth.service';
import { PhysioIcon } from '../physio-icons';

interface NavItem {
  label: string;
  icon: string;
  href?: string;
  route?: string;
  /** Sección de la historia activa a la que se desplaza. */
  section?: string;
  active?: boolean;
}

/** Menú lateral de la historia de fisioterapia: fijo en escritorio, plegable en tablet y móvil. */
@Component({
  selector: 'app-physio-sidebar',
  imports: [PhysioIcon, RouterLink],
  template: `
    <button
      type="button"
      class="sb-open"
      aria-label="Abrir menú"
      [attr.aria-expanded]="open()"
      aria-controls="pd-sidebar"
      (click)="open.set(true)"
    >
      <app-physio-icon name="menu" /><span>{{ clinicName() || 'Consultorio' }}</span><small>Menú</small>
    </button>
    @if (open()) {
      <div class="sb-scrim" (click)="open.set(false)" aria-hidden="true"></div>
    }
    <aside id="pd-sidebar" class="sb" [class.open]="open()" aria-label="Menú del consultorio">
      <div class="sb-brand">
        @if (logo() && !logoFailed()) {
          <img [src]="logo()" [alt]="clinicName() || 'Logo del consultorio'" (error)="logoFailed.set(true)" />
        } @else {
          <strong>{{ clinicName() || 'Consultorio' }}</strong>
        }
        <span class="sb-sp">Fisioterapia</span>
        <button type="button" class="sb-close" aria-label="Cerrar menú" (click)="open.set(false)">
          <app-physio-icon name="close" />
        </button>
      </div>
      <nav>
        <ul>
          @for (item of items(); track item.label) {
            <li>
              @if (item.route) {
                <a [routerLink]="item.route" (click)="open.set(false)"><app-physio-icon [name]="item.icon" />{{ item.label }}</a>
              } @else if (item.href) {
                <a [href]="item.href" [class.active]="item.active" [attr.aria-current]="item.active ? 'page' : null">
                  <app-physio-icon [name]="item.icon" />{{ item.label }}
                </a>
              } @else {
                <button type="button" (click)="goSection(item.section!)"><app-physio-icon [name]="item.icon" />{{ item.label }}</button>
              }
            </li>
          }
        </ul>
      </nav>
      <p class="sb-foot">Movimiento<br />Recuperación<br />Bienestar</p>
    </aside>
  `,
  styles: `
    :host { display: contents; }
    .sb {
      position: sticky; top: 0; align-self: start; height: 100svh; width: 232px; flex: 0 0 232px; overflow-y: auto;
      display: flex; flex-direction: column; gap: 18px; padding: 22px 14px;
      color: #fff; background:
        radial-gradient(260px 220px at 0% 100%, rgba(199, 154, 75, 0.16), transparent 70%),
        linear-gradient(180deg, #0b2239 0%, #10304d 100%);
      z-index: 40;
    }
    .sb-brand { position: relative; display: grid; justify-items: center; gap: 8px; padding: 6px 4px 16px; border-bottom: 1px solid rgba(199, 154, 75, 0.35); text-align: center; }
    .sb-brand img { max-width: 100%; max-height: 72px; object-fit: contain; background: #fff; border-radius: 12px; padding: 6px 10px; }
    .sb-brand strong { font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; font-size: 1.2rem; font-weight: 600; line-height: 1.2; letter-spacing: 0.04em; }
    .sb-sp { font-size: 0.72rem; letter-spacing: 0.28em; text-transform: uppercase; color: #e2c58e; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    a, nav button {
      width: 100%; display: flex; align-items: center; gap: 12px; min-height: 42px; padding: 8px 12px;
      border: 0; border-left: 3px solid transparent; border-radius: 10px; background: none;
      color: rgba(255, 255, 255, 0.86); font: inherit; font-size: 0.9rem; text-align: left; text-decoration: none; cursor: pointer;
    }
    a app-physio-icon, nav button app-physio-icon { width: 19px; height: 19px; color: currentColor; }
    a:hover, nav button:hover { background: rgba(255, 255, 255, 0.07); color: #fff; }
    a.active { background: rgba(255, 255, 255, 0.12); border-left-color: #c79a4b; color: #fff; font-weight: 600; }
    a.active app-physio-icon { color: #e2c58e; }
    a:focus-visible, nav button:focus-visible, .sb-close:focus-visible, .sb-open:focus-visible { outline: 3px solid rgba(226, 197, 142, 0.8); outline-offset: 2px; }
    .sb-foot { margin: auto 0 0; padding: 14px 12px 0; font-size: 0.68rem; line-height: 1.7; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255, 255, 255, 0.6); border-top: 1px solid rgba(255, 255, 255, 0.1); }
    .sb-open, .sb-close, .sb-scrim { display: none; }
    @media (max-width: 1100px) {
      .sb { position: fixed; left: 0; top: 0; height: 100svh; transform: translateX(-105%); transition: transform 0.22s ease; box-shadow: 18px 0 40px -20px rgba(0, 0, 0, 0.5); }
      .sb.open { transform: none; }
      .sb-open {
        display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 8px 16px;
        border: 0; border-bottom: 2px solid #c79a4b; background: #0b2239; color: #fff; font: inherit; text-align: left; cursor: pointer;
      }
      .sb-open app-physio-icon { width: 22px; height: 22px; color: #e2c58e; flex: 0 0 auto; }
      .sb-open span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; font-size: 1.02rem; font-weight: 600; }
      .sb-open small { font-size: 0.7rem; letter-spacing: 0.2em; text-transform: uppercase; color: #e2c58e; }
      .sb-brand { padding-right: 40px; padding-left: 40px; }
      .sb-close { display: inline-grid; place-items: center; position: absolute; top: -8px; right: -4px; width: 36px; height: 36px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.08); color: #fff; cursor: pointer; }
      .sb-close app-physio-icon { width: 18px; height: 18px; color: #fff; }
      .sb-scrim { display: block; position: fixed; inset: 0; z-index: 39; background: rgba(11, 34, 57, 0.45); }
    }
    @media (prefers-reduced-motion: reduce) { .sb { transition: none; } }
    @media print { .sb, .sb-open { display: none !important; } }
  `,
})
export class PhysioSidebar {
  private readonly auth = inject(AuthService);
  readonly clinicName = input('');
  readonly logo = input<string | null>(null);
  readonly open = signal(false);
  readonly logoFailed = signal(false);

  readonly items = computed<NavItem[]>(() => {
    const user = this.auth.user();
    const canWrite = this.auth.canWriteClinical();
    const withDocs = user?.dashboardType === 'CLINICAL_HISTORY_WITH_DOCS';
    const items: Array<NavItem | false> = [
      { label: 'Inicio', icon: 'home', href: '/consultorio.html' },
      { label: 'Historia de fisioterapia', icon: 'clipboard', href: '/consultorio/historia-clinica', active: true },
      { label: 'Pacientes', icon: 'users', route: '/consultorio/pacientes' },
      { label: 'Agenda', icon: 'calendar', route: '/consultorio/agenda' },
      { label: 'Evolución', icon: 'chart', section: 'ft-evoluciones-en-formulario' },
      (canWrite || this.auth.canAuditSivigila()) && withDocs && { label: 'Documentos', icon: 'file', route: '/consultorio/documentos' },
      canWrite && { label: 'Historias en PDF', icon: 'download', route: '/consultorio/historias-pdf' },
      { label: 'Configuración', icon: 'settings', route: '/consultorio/configuracion' },
    ];
    return items.filter((i): i is NavItem => !!i);
  });

  goSection(id: string) {
    this.open.set(false);
    const el = document.querySelector<HTMLElement>(`.ws-pane.active #${id}`) ?? document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.open.set(false);
  }
}
