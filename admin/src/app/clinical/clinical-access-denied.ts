import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HabIcon } from '../habilitation/hab-icon';
import { ACCESS_REASON_LABELS, AccessCheckResult, AccessReason } from '../types/auth-access';
import { ClinicalAccessService } from './clinical-access.service';

@Component({
  selector: 'app-clinical-access-denied',
  standalone: true,
  imports: [RouterLink, HabIcon, DatePipe],
  template: `
    <section class="wrap" aria-labelledby="accessTitle">
      <div class="card">
        <div class="ico-wrap" aria-hidden="true">
          <hab-icon name="shield" [size]="28" />
        </div>
        <h1 id="accessTitle">Acceso a historia clínica restringido</h1>
        <p class="lead">{{ result()?.message || 'Su plan de arriendo por horas requiere una reserva activa.' }}</p>

        @if (result(); as r) {
          <dl class="meta">
            <div>
              <dt>Motivo</dt>
              <dd>{{ reasonLabel(r.reason) }}</dd>
            </div>
            <div>
              <dt>Margen de gracia</dt>
              <dd>{{ r.gracePeriodMinutes }} minutos después del fin de la reserva</dd>
            </div>
            @if (r.accessUntil) {
              <div>
                <dt>Acceso válido hasta</dt>
                <dd>{{ r.accessUntil | date: 'short' }}</dd>
              </div>
            }
            @if (r.activeBooking; as b) {
              <div>
                <dt>Última reserva</dt>
                <dd>
                  {{ b.startTime | date: 'short' }} — {{ b.endTime | date: 'short' }}
                  @if (b.roomName) {
                    · {{ b.roomName }}
                  }
                </dd>
              </div>
            }
          </dl>
        }

        <div class="actions">
          <a routerLink="/consultorio" class="btn primary">Volver al inicio</a>
          <a routerLink="/consultorio/agenda" class="btn">Ir a la agenda</a>
          <button type="button" class="btn ghost" (click)="recheck()" [disabled]="loading()">
            {{ loading() ? 'Verificando…' : 'Volver a verificar' }}
          </button>
        </div>
      </div>
    </section>
  `,
  styles: `
    .wrap {
      min-height: 70vh;
      display: grid;
      place-items: center;
      padding: 32px 16px;
      background: linear-gradient(160deg, #f4f8fb 0%, #e8f0f6 55%, #f7fafc 100%);
    }
    .card {
      max-width: 560px;
      width: 100%;
      padding: 32px 28px;
      border-radius: 18px;
      background: #fff;
      border: 1px solid #d7e3ec;
      box-shadow: 0 18px 40px -28px rgba(11, 34, 57, 0.55);
      display: grid;
      gap: 14px;
    }
    .ico-wrap {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background: #fdf3f3;
      color: #9b3333;
    }
    h1 {
      margin: 0;
      font-size: 1.45rem;
      color: #0b2239;
      line-height: 1.25;
    }
    .lead {
      margin: 0;
      color: #3d556b;
      line-height: 1.5;
    }
    .meta {
      margin: 8px 0 0;
      display: grid;
      gap: 10px;
      padding: 14px 16px;
      border-radius: 12px;
      background: #f4f8fb;
    }
    .meta > div {
      display: grid;
      gap: 2px;
    }
    dt {
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #6a8296;
    }
    dd {
      margin: 0;
      color: #0b2239;
      font-size: 0.95rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 8px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      padding: 8px 14px;
      border-radius: 10px;
      border: 1px solid #c5d5e2;
      background: #fff;
      color: #0b2239;
      font-weight: 600;
      font-size: 0.9rem;
      text-decoration: none;
      cursor: pointer;
    }
    .btn.primary {
      background: #0b2239;
      border-color: #0b2239;
      color: #fff;
    }
    .btn.ghost {
      background: transparent;
    }
    .btn:disabled {
      opacity: 0.55;
      cursor: wait;
    }
  `,
})
export class ClinicalAccessDeniedPage implements OnInit {
  private readonly access = inject(ClinicalAccessService);
  private readonly route = inject(ActivatedRoute);

  readonly result = signal<AccessCheckResult | null>(null);
  readonly loading = signal(false);

  ngOnInit() {
    this.recheck();
  }

  reasonLabel(reason: AccessReason) {
    return ACCESS_REASON_LABELS[reason] || reason;
  }

  recheck() {
    this.loading.set(true);
    this.access.clearCache();
    this.access.check(true).subscribe({
      next: (r) => {
        this.result.set(r);
        this.loading.set(false);
        if (r.hasAccess) {
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
          window.location.replace(returnUrl || '/consultorio.html');
        }
      },
      error: () => this.loading.set(false),
    });
  }
}
