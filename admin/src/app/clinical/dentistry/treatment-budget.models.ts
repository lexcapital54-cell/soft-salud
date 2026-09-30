export type TreatmentPhase = '' | 'URGENCIA' | 'HIGIENICA' | 'CORRECTIVA' | 'MANTENIMIENTO';

export const TREATMENT_PHASES: Array<{ key: Exclude<TreatmentPhase, ''>; label: string; hint: string; color: string }> = [
  { key: 'URGENCIA', label: '1. Sistémica / urgencia', hint: 'Dolor, infección, control médico', color: '#dc2626' },
  { key: 'HIGIENICA', label: '2. Higiénica / básica', hint: 'Profilaxis, detartraje, operatoria básica', color: '#0891b2' },
  { key: 'CORRECTIVA', label: '3. Correctiva / rehabilitadora', hint: 'Endodoncia, prótesis, implantes, ortodoncia', color: '#7c3aed' },
  { key: 'MANTENIMIENTO', label: '4. Mantenimiento', hint: 'Controles y terapia de soporte', color: '#16a34a' },
];

export type BudgetDiscountType = 'PCT' | 'AMOUNT';

export interface TreatmentBudget {
  discountType: BudgetDiscountType;
  discountValue: string;
  discountReason: string;
  validUntil: string;
  paymentMethod: string;
  installments: string;
  notes: string;
  acceptedAt: string;
  acceptedBy: string;
}

export const BUDGET_PAYMENT_METHODS = ['Contado', 'Por fases', 'Cuotas', 'Convenio / aseguradora', 'Mixto'];

export function emptyTreatmentBudget(): TreatmentBudget {
  return {
    discountType: 'PCT',
    discountValue: '',
    discountReason: '',
    validUntil: '',
    paymentMethod: '',
    installments: '',
    notes: '',
    acceptedAt: '',
    acceptedBy: '',
  };
}

export function normalizeTreatmentBudget(raw: Partial<TreatmentBudget> | undefined): TreatmentBudget {
  const b = { ...emptyTreatmentBudget(), ...(raw || {}) };
  if (b.discountType !== 'AMOUNT') b.discountType = 'PCT';
  return b;
}

interface BudgetRowLike {
  value?: string;
  quantity?: string;
  discount?: string;
  status?: string;
  phase?: string;
  description?: string;
  code?: string;
}

export function parseMoney(v: unknown): number {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseQty(v: unknown): number {
  const s = String(v ?? '').trim();
  if (!s) return 1;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parsePct(v: unknown): number {
  const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

export function rowGross(r: BudgetRowLike) {
  return parseMoney(r.value) * parseQty(r.quantity);
}

export function rowNet(r: BudgetRowLike) {
  return Math.round(rowGross(r) * (1 - parsePct(r.discount) / 100));
}

export interface PhaseSummary {
  key: string;
  label: string;
  color: string;
  count: number;
  done: number;
  net: number;
}

export interface BudgetTotals {
  gross: number;
  rowDiscounts: number;
  afterRows: number;
  globalDiscount: number;
  total: number;
  doneValue: number;
  pendingValue: number;
  phases: PhaseSummary[];
  unphased: number;
}

/** Totales sin filas canceladas; el descuento global se aplica sobre el valor ya descontado por fila. */
export function budgetTotals(rows: BudgetRowLike[], budget: TreatmentBudget): BudgetTotals {
  const active = rows.filter((r) => r.status !== 'CANCELADO' && (r.description?.trim() || r.code?.trim() || parseMoney(r.value)));
  const gross = active.reduce((s, r) => s + rowGross(r), 0);
  const afterRows = active.reduce((s, r) => s + rowNet(r), 0);
  const dv = budget.discountType === 'AMOUNT' ? parseMoney(budget.discountValue) : parsePct(budget.discountValue);
  const globalDiscount = Math.min(afterRows, Math.round(budget.discountType === 'AMOUNT' ? dv : (afterRows * dv) / 100));
  const factor = afterRows ? (afterRows - globalDiscount) / afterRows : 1;
  const doneRaw = active.filter((r) => r.status === 'TERMINADO').reduce((s, r) => s + rowNet(r), 0);
  const phases = TREATMENT_PHASES.map((p) => {
    const inPhase = active.filter((r) => r.phase === p.key);
    return {
      key: p.key,
      label: p.label,
      color: p.color,
      count: inPhase.length,
      done: inPhase.filter((r) => r.status === 'TERMINADO').length,
      net: Math.round(inPhase.reduce((s, r) => s + rowNet(r), 0) * factor),
    };
  });
  const total = afterRows - globalDiscount;
  const doneValue = Math.round(doneRaw * factor);
  return {
    gross,
    rowDiscounts: gross - afterRows,
    afterRows,
    globalDiscount,
    total,
    doneValue,
    pendingValue: total - doneValue,
    phases,
    unphased: active.filter((r) => !r.phase).length,
  };
}

/** Fase sugerida a partir del texto del procedimiento, para no obligar a clasificar a mano. */
export function suggestPhase(description: string): TreatmentPhase {
  const t = description
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/urgenc|drenaj|absceso|pulpotom|pulpectom|dolor|trauma/.test(t)) return 'URGENCIA';
  if (/control|manten|soporte|revision|retenedor/.test(t)) return 'MANTENIMIENTO';
  if (/profilax|detartraj|alisado|raspaje|sellante|fluor|higiene|resina|amalgama|obturac|ionomero|exodonc|extracc/.test(t))
    return 'HIGIENICA';
  if (/endodon|conducto|corona|protesis|puente|implant|incrust|carilla|ortodon|bracket|cirugia|injerto|rehabilit|perno|nucleo/.test(t))
    return 'CORRECTIVA';
  return '';
}
