import { BadRequestException } from '@nestjs/common';

/** La mensualidad del periodo se paga durante los primeros días del mes. */
export const HOSTING_PAYMENT_DAYS = 5;

const TZ = 'America/Bogota';

export function parsePeriodMonth(ym: string): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) {
    throw new BadRequestException('periodMonth debe ser YYYY-MM');
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    throw new BadRequestException('Mes inválido');
  }
  return new Date(Date.UTC(year, month - 1, 1));
}

export function periodLabel(d: Date | null | undefined) {
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function dmy(d: Date) {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/**
 * Facturación de fin de mes a fin de mes: el periodo YYYY-MM va del último día
 * del mes anterior al último día del mes (ej. 2026-10 → 30/09/2026 – 31/10/2026).
 */
export function billingRange(periodMonth: Date) {
  const y = periodMonth.getUTCFullYear();
  const m = periodMonth.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 0));
  const end = new Date(Date.UTC(y, m + 1, 0));
  const due = new Date(Date.UTC(y, m, HOSTING_PAYMENT_DAYS));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    dueDate: due.toISOString().slice(0, 10),
    label: `${dmy(start)} – ${dmy(end)}`,
  };
}

/** Fecha actual en Colombia. */
export function bogotaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = Number(get('day'));
  return {
    iso: `${year}-${month}-${get('day')}`,
    periodKey: `${year}-${month}`,
    day,
  };
}
