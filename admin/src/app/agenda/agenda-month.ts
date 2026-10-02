import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { TodayAppointment } from './agenda.models';

const MAX_CHIPS = 3;
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Lunes a domingo que cubren el mes de `anchor` (5 o 6 semanas). */
export function monthGridRange(anchor: string): { first: string; last: string; days: string[] } {
  const at = new Date(`${anchor}T00:00:00`);
  const start = new Date(at.getFullYear(), at.getMonth(), 1);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(at.getFullYear(), at.getMonth() + 1, 0);
  end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)));
  const days: string[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(monthKey(d));
  return { first: days[0], last: days[days.length - 1], days };
}

/** Mismo día en el mes anterior/siguiente (ajustado al último día si no existe). */
export function shiftMonth(anchor: string, delta: number) {
  const at = new Date(`${anchor}T00:00:00`);
  const target = new Date(at.getFullYear(), at.getMonth() + delta, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(at.getDate(), lastDay));
  return monthKey(target);
}

/** Vista mensual de la agenda: cada día con sus citas; clic en el día abre la vista Día. */
@Component({
  selector: 'app-agenda-month',
  imports: [DatePipe],
  template: `
    <div class="am" role="grid" aria-label="Agenda del mes">
      @for (w of weekdays; track w) {
        <div class="am-head" role="columnheader">{{ w }}</div>
      }
      @for (d of days(); track d.key) {
        <div
          class="am-day"
          role="gridcell"
          [class.out]="!d.inMonth"
          [class.today]="d.key === todayKey"
          [class.active]="d.key === date()"
          [class.weekend]="d.weekend"
        >
          <button type="button" class="am-num" (click)="openDay.emit(d.key)" [attr.aria-label]="'Ver día ' + d.label">
            <span>{{ d.dayNumber }}</span>
            @if (d.count) {
              <small>{{ d.count }} cita{{ d.count === 1 ? '' : 's' }}</small>
            }
          </button>
          @for (a of d.chips; track a.id) {
            <button
              type="button"
              class="am-chip"
              [attr.data-status]="a.status"
              [class.block]="a.eventType === 'BLOQUEO'"
              [class.pending-hc]="a.clinicalOverdue"
              [class.documented]="a.clinicalDocumented"
              [class.selected]="selectedId() === a.id"
              [title]="(a.startsAt | date: 'HH:mm') + ' · ' + title(a) + ' · ' + a.professional.fullName + (a.clinicalPending ? ' · ' + a.clinicalPending : '')"
              (click)="select.emit(a)"
            >
              <b>{{ a.startsAt | date: 'HH:mm' }}</b> {{ title(a) }}
            </button>
          }
          @if (d.more) {
            <button type="button" class="am-more" (click)="openDay.emit(d.key)">+{{ d.more }} más</button>
          }
          @if (canBook() && d.inMonth && d.key >= todayKey) {
            <button type="button" class="am-add" (click)="book.emit(d.key)" [attr.aria-label]="'Agendar el ' + d.label" title="Agendar en este día">+</button>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './agenda-month.scss',
})
export class AgendaMonth {
  readonly date = input.required<string>();
  readonly appointments = input.required<TodayAppointment[]>();
  readonly selectedId = input<string | null>(null);
  readonly canBook = input(false);
  readonly openDay = output<string>();
  readonly book = output<string>();
  readonly select = output<TodayAppointment>();

  readonly weekdays = WEEKDAYS;
  readonly todayKey = monthKey(new Date());

  readonly days = computed(() => {
    const anchor = this.date();
    const month = anchor.slice(0, 7);
    const byDay = new Map<string, TodayAppointment[]>();
    for (const a of this.appointments()) {
      if (a.eventType === 'BLOQUEO' && a.status === 'CANCELLED') continue;
      const key = monthKey(new Date(a.startsAt));
      const list = byDay.get(key);
      if (list) list.push(a);
      else byDay.set(key, [a]);
    }
    return monthGridRange(anchor).days.map((key, i) => {
      const list = (byDay.get(key) ?? []).sort((x, y) => x.startsAt.localeCompare(y.startsAt));
      const at = new Date(`${key}T00:00:00`);
      const count = list.filter((a) => a.eventType !== 'BLOQUEO' && a.status !== 'CANCELLED').length;
      return {
        key,
        dayNumber: at.getDate(),
        label: at.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }),
        inMonth: key.startsWith(month),
        weekend: i % 7 >= 5,
        count,
        chips: list.slice(0, MAX_CHIPS),
        more: Math.max(0, list.length - MAX_CHIPS),
      };
    });
  });

  title(a: TodayAppointment) {
    if (a.eventType === 'BLOQUEO') return a.blockReason?.trim() || 'Bloqueo';
    return a.patient?.fullName || 'Cita';
  }
}
