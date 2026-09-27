import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from './auth.service';
import { AccessibleClinic } from './models';

@Component({
  selector: 'app-clinic-switcher',
  imports: [FormsModule],
  template: `
    @if (clinics().length > 1) {
      <label class="clinic-switcher" [class.compact]="compact()">
        <span class="cs-label">{{ label() }}</span>
        <select
          [ngModel]="selectedId()"
          (ngModelChange)="onChange($event)"
          [disabled]="switching()"
        >
          @for (c of clinics(); track c.id) {
            <option [value]="c.id">{{ c.name }}</option>
          }
        </select>
      </label>
    } @else if (clinics().length === 1 && showSingle()) {
      <span class="clinic-switcher single">
        <span class="cs-label">{{ label() }}</span>
        <strong>{{ clinics()[0].name }}</strong>
      </span>
    }
  `,
  styles: [
    `
      .clinic-switcher {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
        color: #405a5f;
      }
      .clinic-switcher.compact select {
        max-width: 180px;
      }
      .clinic-switcher select {
        font: inherit;
        padding: 7px 10px;
        border: 1px solid #d8e2e2;
        border-radius: 10px;
        background: #fff;
        color: #003d4c;
        max-width: 260px;
      }
      .clinic-switcher.single strong {
        color: #003d4c;
        font-weight: 500;
      }
      .cs-label {
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-size: 0.72rem;
        color: #6a8085;
      }
    `,
  ],
})
export class ClinicSwitcher implements OnInit {
  private readonly auth = inject(AuthService);

  /** Si true, muestra el nombre aunque solo haya una sede. */
  readonly showSingle = input(false);
  readonly compact = input(false);
  /** Etiqueta del selector (p. ej. «Sede» o «Doctora»). */
  readonly label = input('Sede');
  /** Emite tras cambiar de sede (para recargar datos de la pantalla). */
  readonly switched = output<string>();

  readonly clinics = signal<AccessibleClinic[]>([]);
  readonly selectedId = signal('');
  readonly switching = signal(false);

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.auth.listAccessibleClinics().subscribe({
      next: (rows) => {
        this.clinics.set(rows);
        const current =
          rows.find((c) => c.isCurrent)?.id ||
          this.auth.user()?.clinicId ||
          rows[0]?.id ||
          '';
        this.selectedId.set(current);
      },
      error: () => this.clinics.set([]),
    });
  }

  onChange(clinicId: string) {
    if (!clinicId || clinicId === this.selectedId()) return;
    if (clinicId === this.auth.user()?.clinicId) {
      this.selectedId.set(clinicId);
      return;
    }
    this.switching.set(true);
    this.auth.switchClinic(clinicId).subscribe({
      next: () => {
        this.selectedId.set(clinicId);
        this.switching.set(false);
        this.switched.emit(clinicId);
        // Recarga ligera de listados; las pantallas escuchan `switched`.
        this.reload();
      },
      error: () => {
        this.switching.set(false);
        this.selectedId.set(this.auth.user()?.clinicId || '');
      },
    });
  }
}
