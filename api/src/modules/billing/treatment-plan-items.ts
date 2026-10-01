import { createHash } from 'crypto';

type Json = Record<string, unknown>;

export type PlanSource = 'PLAN' | 'ORTHO' | 'PHYSIO';

export interface BillablePlanItem {
  key: string;
  source: PlanSource;
  label: string;
  detail: string;
  cupsCode: string | null;
  tooth: string | null;
  phase: string | null;
  status: string;
  quantity: number;
  unitValue: number;
  discountPct: number;
  net: number;
}

const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.map(obj) : []);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** "1.500.000" y "1500000" son lo mismo; "7,5" y "7.5" son decimales. */
export function num(v: unknown): number {
  let t = text(v).replace(/[^\d.,-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

const pct = (v: unknown) => Math.min(100, Math.max(0, num(v)));
const qty = (v: unknown) => {
  const n = num(v);
  return n > 0 ? n : 1;
};

const PHASE_LABELS: Record<string, string> = {
  URGENCIA: 'Urgencia',
  HIGIENICA: 'Higiénica',
  CORRECTIVA: 'Correctiva',
  MANTENIMIENTO: 'Mantenimiento',
};

const STATUS_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_TRATAMIENTO: 'En tratamiento',
  TERMINADO: 'Terminado',
};

/**
 * Las filas del plan odontológico no tienen id: la clave sale de pieza, código, procedimiento
 * y fase (más el número de repetición). Si se edita alguno de esos datos, la fila es otra.
 */
function planKey(row: Json, seen: Map<string, number>) {
  const base = [text(row.tooth), text(row.code), text(row.description).toLowerCase(), text(row.phase)].join('|');
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return `PLAN:${createHash('sha1').update(base).digest('hex').slice(0, 16)}:${n}`;
}

/** Plan de tratamiento odontológico, con el descuento global repartido en proporción. */
export function dentalPlanItems(dentistry: Json): BillablePlanItem[] {
  const seen = new Map<string, number>();
  const rows = arr(dentistry.treatmentPlan)
    .map((row) => ({ row, key: planKey(row, seen) }))
    .filter(({ row }) => text(row.status) !== 'CANCELADO' && (text(row.description) || text(row.code) || num(row.value)));

  const nets = rows.map(({ row }) => Math.round(num(row.value) * qty(row.quantity) * (1 - pct(row.discount) / 100)));
  const afterRows = nets.reduce((s, n) => s + n, 0);
  const budget = obj(dentistry.budget);
  const amountMode = text(budget.discountType) === 'AMOUNT';
  const dv = amountMode ? num(budget.discountValue) : pct(budget.discountValue);
  const globalDiscount = Math.min(afterRows, Math.round(amountMode ? dv : (afterRows * dv) / 100));
  const factor = afterRows ? (afterRows - globalDiscount) / afterRows : 1;

  return rows.map(({ row, key }, i) => {
    const tooth = text(row.tooth) || null;
    const phase = PHASE_LABELS[text(row.phase)] ?? null;
    return {
      key,
      source: 'PLAN' as const,
      label: text(row.description) || text(row.code) || 'Procedimiento',
      detail: [tooth ? `Pieza ${tooth}` : '', phase ? `Fase ${phase.toLowerCase()}` : '', text(row.diagnosis)]
        .filter(Boolean)
        .join(' · '),
      cupsCode: text(row.code) || null,
      tooth,
      phase,
      status: STATUS_LABELS[text(row.status)] ?? 'Pendiente',
      quantity: qty(row.quantity),
      unitValue: num(row.value),
      discountPct: pct(row.discount),
      net: Math.round(nets[i] * factor),
    };
  });
}

/** Presupuesto de ortodoncia (cada concepto ya trae id estable). */
export function orthoBudgetItems(orthoBudget: Json): BillablePlanItem[] {
  return arr(orthoBudget.items)
    .filter((i) => text(i.id) && text(i.status) !== 'Cancelado' && (text(i.concept) || text(i.description)))
    .map((i) => {
      const q = Math.max(0, num(i.qty)) || 1;
      const unit = num(i.unitValue);
      const d = pct(i.discountPct);
      return {
        key: `ORTHO:${text(i.id)}`,
        source: 'ORTHO' as const,
        label: text(i.concept) || text(i.description),
        detail: text(i.concept) && text(i.description) ? text(i.description) : '',
        cupsCode: null,
        tooth: null,
        phase: null,
        status: text(i.status) || 'Cotizado',
        quantity: q,
        unitValue: unit,
        discountPct: d,
        net: Math.round(q * unit * (1 - d / 100)),
      };
    });
}

/** Plan de tratamiento de fisioterapia: procedimiento CUPS × sesiones (cada fila trae id estable). */
export function physioPlanItems(physio: Json): BillablePlanItem[] {
  return arr(physio.treatmentPlan)
    .filter((r) => text(r.id) && text(r.status) !== 'CANCELADO' && (text(r.description) || text(r.cupsCode)))
    .map((r) => {
      const sessions = qty(r.sessions);
      const unit = num(r.unitValue);
      const d = pct(r.discountPct);
      return {
        key: `PHYSIO:${text(r.id)}`,
        source: 'PHYSIO' as const,
        label: text(r.description) || text(r.cupsCode),
        detail: [`${sessions} sesi${sessions === 1 ? 'ón' : 'ones'}`, text(r.notes)].filter(Boolean).join(' · '),
        cupsCode: text(r.cupsCode) || null,
        tooth: null,
        phase: null,
        status: STATUS_LABELS[text(r.status)] ?? 'Pendiente',
        quantity: sessions,
        unitValue: unit,
        discountPct: d,
        net: Math.round(sessions * unit * (1 - d / 100)),
      };
    });
}

export function orthoFinancing(orthoBudget: Json, net: number) {
  const installments = Math.max(0, Math.floor(num(orthoBudget.installments)));
  const downPayment = num(orthoBudget.downPayment);
  const financed = Math.max(0, net - downPayment);
  return {
    downPayment,
    installments,
    installmentValue: installments ? Math.round(financed / installments) : 0,
    startDate: text(orthoBudget.startDate) || null,
  };
}
