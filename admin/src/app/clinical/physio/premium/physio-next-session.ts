import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgendaApiService } from '../../../agenda/agenda-api.service';
import { TodayAppointment } from '../../../agenda/agenda.models';
import { PhysioIcon } from '../physio-icons';

const LOOKAHEAD_DAYS = 180;
const CLOSED = ['CANCELLED', 'NO_SHOW', 'COMPLETED'];

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Próxima cita del paciente según la agenda real del consultorio. */
@Component({
  selector: 'app-physio-next-session',
  imports: [PhysioIcon, RouterLink],
  template: `
    <section class="ns pd-side-card" aria-labelledby="pd-ns-title">
      <header><app-physio-icon name="calendar" /><h3 id="pd-ns-title">Próxima sesión</h3></header>
      @switch (state()) {
        @case ('loading') {
          <div class="sk" aria-label="Cargando próxima sesión"><span></span><span></span><span></span></div>
        }
        @case ('error') {
          <p class="ns-msg">No se pudo consultar la agenda.</p>
          <button type="button" class="ns-btn ghost" (click)="load()">Reintentar</button>
        }
        @case ('empty') {
          <p class="ns-msg">Sin próximas citas agendadas.</p>
        }
        @default {
          @let a = next()!;
          <div class="ns-when">
            <span class="ns-cal" aria-hidden="true"><app-physio-icon name="calendar" /></span>
            <div>
              <strong>{{ day(a.startsAt) }}</strong>
              <span>{{ time(a.startsAt) }}</span>
            </div>
          </div>
          <ul class="ns-facts">
            @if (a.reason) {
              <li>{{ a.reason }}</li>
            }
            <li><app-physio-icon name="pin" />{{ a.modality === 'VIRTUAL' ? 'Virtual' : 'Presencial' }}</li>
            <li><app-physio-icon name="person" />{{ a.professional.fullName }}</li>
          </ul>
        }
      }
      <a class="ns-btn" routerLink="/consultorio/agenda">{{ next() ? 'Ver o reprogramar en agenda' : 'Agendar en la agenda' }}</a>
    </section>
  `,
  styles: `
    :host { display: block; }
    header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    header app-physio-icon { width: 20px; height: 20px; color: var(--pd-navy, #0b2239); }
    h3 { margin: 0; font-family: var(--pd-serif); font-size: 1.08rem; font-weight: 600; color: var(--pd-navy, #0b2239); }
    .ns-when { display: flex; gap: 12px; align-items: center; padding: 12px; border-radius: 14px; background: var(--pd-bg, #f6f8fa); }
    .ns-cal { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background: var(--pd-gold, #c79a4b); flex: 0 0 auto; }
    .ns-cal app-physio-icon { width: 20px; height: 20px; color: #fff; }
    .ns-when strong { display: block; color: var(--pd-navy, #0b2239); font-size: 0.95rem; text-transform: capitalize; }
    .ns-when span { color: var(--pd-ink, #172033); font-size: 0.88rem; }
    .ns-facts { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; font-size: 0.85rem; color: var(--pd-ink, #172033); }
    .ns-facts li { display: flex; align-items: center; gap: 8px; }
    .ns-facts app-physio-icon { width: 16px; height: 16px; color: var(--pd-navy-2, #163a59); }
    .ns-msg { margin: 0 0 4px; color: var(--pd-muted, #687386); font-size: 0.86rem; font-style: italic; }
    .ns-btn {
      display: flex; justify-content: center; align-items: center; min-height: 42px; margin-top: 14px; padding: 8px 14px;
      border-radius: 10px; border: 1px solid var(--pd-navy, #0b2239); background: var(--pd-navy, #0b2239); color: #fff;
      font: inherit; font-size: 0.86rem; font-weight: 600; text-decoration: none; cursor: pointer; text-align: center;
    }
    .ns-btn:hover { background: var(--pd-navy-2, #163a59); }
    .ns-btn.ghost { background: #fff; color: var(--pd-navy, #0b2239); border-color: var(--pd-line, #d8e1ea); }
    .ns-btn:focus-visible { outline: 3px solid rgba(var(--pd-gold-rgb, 199, 154, 75), 0.55); outline-offset: 2px; }
    .sk { display: grid; gap: 8px; }
    .sk span { height: 14px; border-radius: 6px; background: linear-gradient(90deg, #eef2f6 25%, #f7f9fb 50%, #eef2f6 75%); background-size: 200% 100%; animation: sh 1.2s infinite; }
    .sk span:first-child { height: 42px; }
    @keyframes sh { to { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) { .sk span { animation: none; } }
  `,
})
export class PhysioNextSession {
  private readonly agenda = inject(AgendaApiService);
  readonly patientId = input<string | null>(null);
  readonly query = input('');
  readonly state = signal<'loading' | 'error' | 'empty' | 'ready'>('loading');
  readonly next = signal<TodayAppointment | null>(null);

  constructor() {
    effect(() => {
      if (this.patientId()) this.load();
    });
  }

  load() {
    const id = this.patientId();
    const q = this.query().trim();
    if (!id || !q) {
      this.state.set('empty');
      return;
    }
    this.state.set('loading');
    const from = new Date();
    const to = new Date(from.getTime() + LOOKAHEAD_DAYS * 86_400_000);
    this.agenda.listToday({ q, from: isoDay(from), to: isoDay(to) }).subscribe({
      next: (rows) => {
        const now = Date.now();
        const upcoming = rows
          .filter((r) => r.patient?.id === id && r.eventType === 'CITA' && !CLOSED.includes(r.status) && new Date(r.startsAt).getTime() > now)
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
        this.next.set(upcoming[0] ?? null);
        this.state.set(upcoming[0] ? 'ready' : 'empty');
      },
      error: () => this.state.set('error'),
    });
  }

  day(v: string) {
    return new Date(v).toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }

  time(v: string) {
    return new Date(v).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }
}
