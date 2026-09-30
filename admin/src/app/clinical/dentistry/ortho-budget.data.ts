/** Presupuesto de ortodoncia (módulo separado del plan de tratamiento general). */
export interface OrthoBudgetItem {
  id: string;
  concept: string;
  description: string;
  qty: string;
  unitValue: string;
  discountPct: string;
  status: string;
}

export interface OrthoBudgetData {
  items: OrthoBudgetItem[];
  downPayment: string;
  installments: string;
  startDate: string;
  quotedAt: string;
  notes: string;
}

export function emptyOrthoBudget(): OrthoBudgetData {
  return { items: [], downPayment: '', installments: '', startDate: '', quotedAt: '', notes: '' };
}

export function newBudgetId() {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

type Json = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function normalizeOrthoBudget(raw: unknown): OrthoBudgetData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Json;
  const items = Array.isArray(r['items']) ? (r['items'].filter((x) => x && typeof x === 'object') as Json[]) : [];
  return {
    items: items.map((i) => ({
      id: s(i['id']) || newBudgetId(),
      concept: s(i['concept']),
      description: s(i['description']),
      qty: s(i['qty']) || '1',
      unitValue: s(i['unitValue']),
      discountPct: s(i['discountPct']),
      status: s(i['status']) || 'Cotizado',
    })),
    downPayment: s(r['downPayment']),
    installments: s(r['installments']),
    startDate: s(r['startDate']),
    quotedAt: s(r['quotedAt']),
    notes: s(r['notes']),
  };
}
