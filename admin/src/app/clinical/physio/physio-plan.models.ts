import { PhysioPlanRow, PhysioPlanStatus } from '../clinical.models';

export const PHYSIO_PLAN_STATUSES: Array<{ key: PhysioPlanStatus; label: string }> = [
  { key: 'PENDIENTE', label: 'Pendiente' },
  { key: 'EN_TRATAMIENTO', label: 'En tratamiento' },
  { key: 'TERMINADO', label: 'Terminado' },
  { key: 'CANCELADO', label: 'Cancelado' },
];

/** Igual que en caja: "1.500.000" y "1500000" son lo mismo; "7,5" y "7.5" son decimales. */
export function planNum(v: unknown): number {
  let t = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export const rowSessions = (r: PhysioPlanRow) => {
  const n = Math.floor(planNum(r.sessions));
  return n > 0 ? n : 1;
};
export const rowDiscount = (r: PhysioPlanRow) => Math.min(100, Math.max(0, planNum(r.discountPct)));
export const rowGross = (r: PhysioPlanRow) => rowSessions(r) * Math.max(0, planNum(r.unitValue));
export const rowNet = (r: PhysioPlanRow) => Math.round(rowGross(r) * (1 - rowDiscount(r) / 100));

export function planTotals(rows: PhysioPlanRow[]) {
  const active = rows.filter((r) => r.status !== 'CANCELADO' && (r.description.trim() || r.cupsCode.trim()));
  const gross = active.reduce((s, r) => s + rowGross(r), 0);
  const net = active.reduce((s, r) => s + rowNet(r), 0);
  return {
    count: active.length,
    sessions: active.reduce((s, r) => s + rowSessions(r), 0),
    done: active.filter((r) => r.status === 'TERMINADO').length,
    gross,
    discount: gross - net,
    net,
  };
}

const newId = () => `ft${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newPlanRow(sessions = ''): PhysioPlanRow {
  return { id: newId(), cupsCode: '', description: '', sessions: sessions || '1', unitValue: '', discountPct: '', status: 'PENDIENTE', notes: '' };
}

/** Normaliza filas guardadas (o ausentes) sin perder datos; asigna id a las que no lo tengan. */
export function ensurePlanRows(raw: unknown): PhysioPlanRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === 'object')
    .map((r: Partial<PhysioPlanRow>) => {
      const row = r as PhysioPlanRow;
      row.id ||= newId();
      row.cupsCode ??= '';
      row.description ??= '';
      row.sessions = String(row.sessions ?? '1');
      row.unitValue = String(row.unitValue ?? '');
      row.discountPct = String(row.discountPct ?? '');
      row.status = PHYSIO_PLAN_STATUSES.some((s) => s.key === row.status) ? row.status : 'PENDIENTE';
      row.notes ??= '';
      return row;
    });
}
