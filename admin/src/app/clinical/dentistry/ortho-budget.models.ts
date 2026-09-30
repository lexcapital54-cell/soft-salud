import type { OrthoBudgetData, OrthoBudgetItem } from './ortho-budget.data';

export * from './ortho-budget.data';

export const BUDGET_CONCEPTS: Array<{ label: string; color: string }> = [
  { label: 'Valor diagnóstico', color: '#64748b' },
  { label: 'Ortodoncia', color: '#12609a' },
  { label: 'Aparatología', color: '#0891b2' },
  { label: 'Controles', color: '#16a34a' },
  { label: 'Radiografías', color: '#7c3aed' },
  { label: 'Alineadores', color: '#0d9488' },
  { label: 'TAD', color: '#ea580c' },
  { label: 'Procedimientos adicionales', color: '#db2777' },
  { label: 'Retención', color: '#ca8a04' },
];

export const BUDGET_STATUSES: Array<{ label: string; color: string }> = [
  { label: 'Cotizado', color: '#94a3b8' },
  { label: 'Aceptado', color: '#12609a' },
  { label: 'Financiado', color: '#7c3aed' },
  { label: 'Pagado', color: '#16a34a' },
  { label: 'Pendiente', color: '#f59e0b' },
  { label: 'Cancelado', color: '#a1a1aa' },
];

export function money(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Math.round(v));
}

/** "1.500.000" y "1500000" son lo mismo; "7,5" y "7.5" son decimales. */
export function num(v: string) {
  let t = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export function itemGross(i: OrthoBudgetItem) {
  return Math.max(0, num(i.qty) || 0) * num(i.unitValue);
}

export function itemNet(i: OrthoBudgetItem) {
  const pct = Math.min(100, Math.max(0, num(i.discountPct)));
  return itemGross(i) * (1 - pct / 100);
}

export interface BudgetTotals {
  gross: number;
  discount: number;
  net: number;
  byConcept: Array<{ label: string; color: string; value: number; pct: number }>;
  byStatus: Array<{ label: string; color: string; value: number }>;
  financed: number;
  installment: number;
  installments: number;
}

/** Totales sin contar los conceptos cancelados. */
export function budgetTotals(b: OrthoBudgetData): BudgetTotals {
  const active = b.items.filter((i) => i.status !== 'Cancelado');
  const gross = active.reduce((s, i) => s + itemGross(i), 0);
  const net = active.reduce((s, i) => s + itemNet(i), 0);
  const byConcept = BUDGET_CONCEPTS.map((c) => {
    const value = active.filter((i) => i.concept === c.label).reduce((s, i) => s + itemNet(i), 0);
    return { ...c, value, pct: net ? (value / net) * 100 : 0 };
  }).filter((c) => c.value > 0);
  const other = active.filter((i) => !BUDGET_CONCEPTS.some((c) => c.label === i.concept)).reduce((s, i) => s + itemNet(i), 0);
  if (other > 0) byConcept.push({ label: 'Otros', color: '#475569', value: other, pct: net ? (other / net) * 100 : 0 });
  const byStatus = BUDGET_STATUSES.map((st) => ({
    ...st,
    value: b.items.filter((i) => i.status === st.label).reduce((s, i) => s + itemNet(i), 0),
  })).filter((x) => x.value > 0);
  const installments = Math.max(0, Math.floor(num(b.installments)));
  const financed = Math.max(0, net - num(b.downPayment));
  return {
    gross,
    discount: gross - net,
    net,
    byConcept,
    byStatus,
    financed,
    installment: installments ? financed / installments : 0,
    installments,
  };
}

/** Fechas de las cuotas mensuales a partir de la fecha de inicio. */
export function installmentDates(start: string, count: number): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(start || '');
  if (!m || !count) return [];
  return Array.from({ length: Math.min(count, 60) }, (_, i) => {
    const d = new Date(+m[1], +m[2] - 1 + i, +m[3], 12);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  });
}
