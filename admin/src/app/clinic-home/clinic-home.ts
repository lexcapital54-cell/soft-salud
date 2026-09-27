import { Component, inject } from '@angular/core';
import { AuthService } from '../auth.service';

/**
 * El dashboard del consultorio vive en /consultorio.html (HTML estático)
 * para que Configuración RIPS no dependa del bundle Angular cacheado.
 * Esta ruta solo redirige ahí.
 */
@Component({
  selector: 'app-clinic-home',
  template: `<p style="padding:48px;font-family:system-ui">Abriendo consultorio…</p>`,
})
export class ClinicHome {
  private readonly auth = inject(AuthService);

  constructor() {
    if (this.auth.isReceptionist()) {
      window.location.replace(`/consultorio/agenda?_=${Date.now()}`);
      return;
    }
    window.location.replace(`/consultorio.html?_=${Date.now()}`);
  }

  logout() {
    this.auth.logoutToClinicLogin();
  }
}
